/**
 * Parallel Worker Execution Framework
 *
 * Provides a generic framework for executing worker agents in the Coordinator.
 * Supports sequential, parallel, and parallel-limited execution strategies.
 *
 * Phase 1 (Current):
 * - Sequential execution (CartBuilder only)
 * - Basic worker registry
 * - Simple result aggregation
 *
 * Phase 2 (Planned):
 * - Parallel execution (CartBuilder, Substitution, StockPruner, SlotScout)
 * - Concurrency limiting
 * - Conflict detection and resolution
 *
 * Design Principles:
 * - Resilience over speed: Checkpointing and recovery built-in
 * - Transparency: All worker actions logged and auditable
 * - Composability: Workers can be added without modifying framework
 * - Safety-first: Purchase guardrail enforced at framework level
 *
 * @module coordinator/parallel-worker
 */

import type { AgentContext, AgentResult } from '../../types/agent.js';

// =============================================================================
// Worker Types
// =============================================================================

/**
 * Execution strategy for worker tasks.
 *
 * - `sequential`: Run workers one at a time, in order (Phase 1 default)
 * - `parallel`: Run all enabled workers simultaneously
 * - `parallel-limited`: Run with maxConcurrency limit to control resource usage
 */
export type ExecutionStrategy = 'sequential' | 'parallel' | 'parallel-limited';

/**
 * State of a worker task during execution.
 *
 * State machine:
 * pending -> executing -> success | failed | blocked
 *              |
 *              v
 *            retry (back to executing if attempts remain)
 */
export type WorkerTaskState = 'pending' | 'executing' | 'success' | 'failed' | 'blocked' | 'retry';

/**
 * Generic worker task definition.
 *
 * Workers implement this interface to be executable by the framework.
 * The generic types allow type-safe configuration and results.
 *
 * @typeParam TConfig - Worker-specific configuration type
 * @typeParam TResult - Worker-specific result type
 *
 * @example
 * ```typescript
 * const cartBuilderTask: WorkerTask<CartBuilderConfig, CartDiffReport> = {
 *   name: 'cartBuilder',
 *   enabled: true,
 *   config: { maxOrdersToLoad: 3, mergeStrategy: 'latest' },
 *   execute: async (context) => {
 *     const builder = new CartBuilder(cartBuilderTask.config);
 *     return builder.run(context);
 *   },
 * };
 * ```
 */
export interface WorkerTask<TConfig, TResult> {
  /**
   * Unique worker name for identification and logging.
   * Should match the worker's role (e.g., 'cartBuilder', 'substitution').
   */
  readonly name: string;

  /**
   * Whether this worker is enabled for execution.
   * Disabled workers are skipped during execution.
   * Controlled via CoordinatorConfig flags (enableSubstitution, etc.)
   */
  enabled: boolean;

  /**
   * Worker-specific configuration.
   * Passed to the worker during execution.
   */
  config: TConfig;

  /**
   * Execute the worker with the given agent context.
   *
   * The framework provides:
   * - Playwright page instance
   * - Structured logger
   * - Session identifier
   * - Working memory for the session
   *
   * Workers should:
   * - Log their progress and decisions
   * - Return structured results
   * - Not catch unrecoverable errors (let them propagate)
   *
   * @param context - Agent execution context
   * @returns Promise resolving to worker-specific result
   * @throws If worker encounters an unrecoverable error
   */
  execute: (context: AgentContext) => Promise<AgentResult & { data?: TResult }>;

  /**
   * Optional list of worker names this task depends on.
   * Dependency workers must complete successfully before this worker starts.
   * Used for Phase 2+ when workers have inter-dependencies.
   */
  dependencies?: readonly string[] | undefined;

  /**
   * Priority for execution ordering (higher = earlier).
   * Used when multiple workers can run but order matters.
   * Default: 0
   */
  priority?: number | undefined;
}

/**
 * Result from a single worker execution.
 *
 * Captures both the outcome and metadata about the execution
 * for debugging, monitoring, and recovery purposes.
 *
 * @typeParam TResult - Worker-specific result type
 */
export interface WorkerResult<TResult> {
  /** Worker name */
  readonly name: string;

  /** Whether execution succeeded */
  readonly success: boolean;

  /** Final state of the worker */
  readonly state: WorkerTaskState;

  /** Worker-specific result data (if successful) */
  readonly data?: TResult | undefined;

  /** Error if execution failed */
  readonly error?: Error | undefined;

  /** Execution duration in milliseconds */
  readonly durationMs: number;

  /** Number of retry attempts made */
  readonly attempts: number;

  /** Timestamp when execution started */
  readonly startedAt: Date;

  /** Timestamp when execution completed */
  readonly completedAt: Date;

  /** Log messages collected during execution */
  readonly logs: readonly string[];
}

/**
 * Aggregated results from all worker executions.
 *
 * Provides both individual results and summary statistics
 * for Review Pack generation and error handling.
 *
 * @typeParam TResult - Worker-specific result type
 */
export interface ExecutionResults<TResult> {
  /** Individual worker results, keyed by worker name */
  readonly results: ReadonlyMap<string, WorkerResult<TResult>>;

  /** Overall success (true if all enabled workers succeeded) */
  readonly allSucceeded: boolean;

  /** Partial success (true if at least one worker succeeded) */
  readonly partialSuccess: boolean;

  /** Total execution duration in milliseconds */
  readonly totalDurationMs: number;

  /** Count of successful workers */
  readonly successCount: number;

  /** Count of failed workers */
  readonly failureCount: number;

  /** Names of workers that failed */
  readonly failedWorkers: readonly string[];

  /** Execution strategy that was used */
  readonly strategy: ExecutionStrategy;
}

/**
 * Options for worker execution.
 */
export interface ExecutionOptions {
  /**
   * Maximum number of concurrent workers for 'parallel-limited' strategy.
   * Ignored for 'sequential' and 'parallel' strategies.
   * Default: 2
   */
  maxConcurrency?: number;

  /**
   * Timeout per worker in milliseconds.
   * Workers exceeding this timeout will be marked as failed.
   * Default: 300000 (5 minutes)
   */
  workerTimeout?: number;

  /**
   * Maximum retry attempts per worker for transient failures.
   * Default: 2
   */
  maxRetries?: number;

  /**
   * Callback invoked when a worker completes (success or failure).
   * Useful for progress tracking and real-time updates.
   */
  onWorkerComplete?: (result: WorkerResult<unknown>) => void;

  /**
   * Callback invoked when a worker starts execution.
   */
  onWorkerStart?: (name: string) => void;

  /**
   * Whether to continue execution if a worker fails.
   * If false, remaining workers are skipped after first failure.
   * Default: true (continue on failure)
   */
  continueOnFailure?: boolean;
}

// =============================================================================
// Worker Registry
// =============================================================================

/**
 * Registry for worker tasks.
 *
 * Provides:
 * - Worker registration by name
 * - Enable/disable workers via configuration
 * - Query enabled workers for execution
 *
 * Thread-safe: Multiple readers, single writer pattern.
 *
 * @example
 * ```typescript
 * const registry = new WorkerRegistry();
 * registry.register(cartBuilderTask);
 * registry.register(substitutionTask);
 *
 * // Enable via config flags
 * registry.setEnabled('substitution', config.enableSubstitution);
 *
 * // Get workers for execution
 * const enabled = registry.getEnabledWorkers();
 * const results = await executeWorkers(enabled, context, 'parallel');
 * ```
 */
export class WorkerRegistry {
  private readonly workers: Map<string, WorkerTask<unknown, unknown>> = new Map();

  /**
   * Register a worker task.
   *
   * @param worker - Worker task to register
   * @throws Error if a worker with the same name is already registered
   */
  register<TConfig, TResult>(worker: WorkerTask<TConfig, TResult>): void {
    if (this.workers.has(worker.name)) {
      throw new Error(`Worker '${worker.name}' is already registered`);
    }
    this.workers.set(worker.name, worker as WorkerTask<unknown, unknown>);
  }

  /**
   * Unregister a worker task.
   *
   * @param name - Name of worker to unregister
   * @returns true if worker was found and removed, false otherwise
   */
  unregister(name: string): boolean {
    return this.workers.delete(name);
  }

  /**
   * Check if a worker is registered.
   *
   * @param name - Worker name to check
   * @returns true if worker is registered
   */
  has(name: string): boolean {
    return this.workers.has(name);
  }

  /**
   * Get a worker by name.
   *
   * @param name - Worker name
   * @returns Worker task or undefined if not found
   */
  get<TConfig, TResult>(name: string): WorkerTask<TConfig, TResult> | undefined {
    return this.workers.get(name) as WorkerTask<TConfig, TResult> | undefined;
  }

  /**
   * Set whether a worker is enabled.
   *
   * @param name - Worker name
   * @param enabled - Whether to enable the worker
   * @throws Error if worker is not registered
   */
  setEnabled(name: string, enabled: boolean): void {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker '${name}' is not registered`);
    }
    worker.enabled = enabled;
  }

  /**
   * Get all registered workers.
   *
   * @returns Array of all worker tasks (enabled and disabled)
   */
  getAllWorkers(): WorkerTask<unknown, unknown>[] {
    return Array.from(this.workers.values());
  }

  /**
   * Get all enabled workers, sorted by priority.
   *
   * @returns Array of enabled worker tasks, highest priority first
   */
  getEnabledWorkers(): WorkerTask<unknown, unknown>[] {
    return Array.from(this.workers.values())
      .filter((w) => w.enabled)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get names of all registered workers.
   *
   * @returns Array of worker names
   */
  getWorkerNames(): string[] {
    return Array.from(this.workers.keys());
  }

  /**
   * Clear all registered workers.
   * Primarily for testing.
   */
  clear(): void {
    this.workers.clear();
  }
}

// =============================================================================
// Execution Functions
// =============================================================================

/**
 * Execute a single worker with timeout and error handling.
 *
 * Wraps worker execution with:
 * - Timeout protection
 * - Duration tracking
 * - Error capture
 * - Result normalization
 *
 * @param worker - Worker task to execute
 * @param context - Agent execution context
 * @param options - Execution options
 * @returns Worker result with execution metadata
 *
 * @internal
 */
async function executeWorker<TConfig, TResult>(
  worker: WorkerTask<TConfig, TResult>,
  context: AgentContext,
  options: ExecutionOptions
): Promise<WorkerResult<TResult>> {
  const startedAt = new Date();
  const startTime = Date.now();
  const logs: string[] = [];

  logs.push(`Worker '${worker.name}' starting execution`);
  options.onWorkerStart?.(worker.name);

  let attempts = 0;
  let lastError: Error | undefined;
  let state: WorkerTaskState = 'executing';

  const timeout = options.workerTimeout ?? 300000;
  const maxRetries = options.maxRetries ?? 2;

  while (attempts <= maxRetries) {
    attempts++;

    try {
      // Execute with timeout protection
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Worker '${worker.name}' timed out after ${timeout}ms`));
        }, timeout);
      });

      const resultPromise = worker.execute(context);
      const result = await Promise.race([resultPromise, timeoutPromise]);

      if (result.success) {
        state = 'success';
        const completedAt = new Date();
        const durationMs = Date.now() - startTime;
        logs.push(`Worker '${worker.name}' completed successfully in ${durationMs}ms`);

        const workerResult: WorkerResult<TResult> = {
          name: worker.name,
          success: true,
          state,
          data: result.data as TResult,
          durationMs,
          attempts,
          startedAt,
          completedAt,
          logs,
        };

        options.onWorkerComplete?.(workerResult);
        return workerResult;
      } else {
        // Worker returned failure - check if retryable
        lastError = result.error ?? new Error(`Worker '${worker.name}' failed without error`);

        if (isRetryableError(lastError) && attempts <= maxRetries) {
          state = 'retry';
          logs.push(
            `Worker '${worker.name}' failed (attempt ${attempts}), retrying: ${lastError.message}`
          );
          continue;
        }

        // Non-retryable or retries exhausted
        state = 'failed';
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRetryableError(lastError) && attempts <= maxRetries) {
        state = 'retry';
        logs.push(
          `Worker '${worker.name}' threw error (attempt ${attempts}), retrying: ${lastError.message}`
        );
        continue;
      }

      state = 'failed';
      break;
    }
  }

  // Execution failed
  const completedAt = new Date();
  const durationMs = Date.now() - startTime;
  logs.push(`Worker '${worker.name}' failed after ${attempts} attempts: ${lastError?.message}`);

  const workerResult: WorkerResult<TResult> = {
    name: worker.name,
    success: false,
    state,
    error: lastError,
    durationMs,
    attempts,
    startedAt,
    completedAt,
    logs,
  };

  options.onWorkerComplete?.(workerResult);
  return workerResult;
}

/**
 * Execute workers sequentially (one at a time).
 *
 * Workers are executed in priority order (highest first).
 * Each worker must complete before the next starts.
 *
 * Use cases:
 * - Phase 1 (CartBuilder only)
 * - Debugging (isolate worker issues)
 * - When workers must run in strict order
 *
 * @param workers - Workers to execute
 * @param context - Agent execution context
 * @param options - Execution options
 * @returns Aggregated execution results
 *
 * @internal
 */
async function executeSequential<TResult>(
  workers: WorkerTask<unknown, TResult>[],
  context: AgentContext,
  options: ExecutionOptions
): Promise<ExecutionResults<TResult>> {
  const results = new Map<string, WorkerResult<TResult>>();
  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;
  const failedWorkers: string[] = [];

  for (const worker of workers) {
    const result = await executeWorker(worker, context, options);
    results.set(worker.name, result);

    if (result.success) {
      successCount++;
    } else {
      failureCount++;
      failedWorkers.push(worker.name);

      if (!options.continueOnFailure) {
        // Mark remaining workers as blocked
        const remaining = workers.slice(workers.indexOf(worker) + 1);
        for (const blocked of remaining) {
          results.set(blocked.name, {
            name: blocked.name,
            success: false,
            state: 'blocked',
            error: new Error(`Blocked by failure of '${worker.name}'`),
            durationMs: 0,
            attempts: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            logs: [`Blocked by failure of '${worker.name}'`],
          });
          failureCount++;
          failedWorkers.push(blocked.name);
        }
        break;
      }
    }
  }

  return {
    results,
    allSucceeded: failureCount === 0,
    partialSuccess: successCount > 0,
    totalDurationMs: Date.now() - startTime,
    successCount,
    failureCount,
    failedWorkers,
    strategy: 'sequential',
  };
}

/**
 * Execute workers in parallel (all at once).
 *
 * All enabled workers start simultaneously.
 * Results are collected when all complete.
 *
 * Use cases:
 * - Phase 2+ when workers are independent
 * - Maximum throughput when resources allow
 *
 * Note: Use parallel-limited when system resources are constrained.
 *
 * @param workers - Workers to execute
 * @param context - Agent execution context
 * @param options - Execution options
 * @returns Aggregated execution results
 *
 * @internal
 */
async function executeParallel<TResult>(
  workers: WorkerTask<unknown, TResult>[],
  context: AgentContext,
  options: ExecutionOptions
): Promise<ExecutionResults<TResult>> {
  const startTime = Date.now();

  const resultPromises = workers.map((worker) => executeWorker(worker, context, options));
  const workerResults = await Promise.all(resultPromises);

  const results = new Map<string, WorkerResult<TResult>>();
  let successCount = 0;
  let failureCount = 0;
  const failedWorkers: string[] = [];

  for (const result of workerResults) {
    results.set(result.name, result);
    if (result.success) {
      successCount++;
    } else {
      failureCount++;
      failedWorkers.push(result.name);
    }
  }

  return {
    results,
    allSucceeded: failureCount === 0,
    partialSuccess: successCount > 0,
    totalDurationMs: Date.now() - startTime,
    successCount,
    failureCount,
    failedWorkers,
    strategy: 'parallel',
  };
}

/**
 * Execute workers in parallel with concurrency limit.
 *
 * Workers are executed in batches of maxConcurrency size.
 * Each batch completes before the next starts.
 *
 * Use cases:
 * - Phase 2+ when system resources are limited
 * - Controlling Playwright instance count
 * - Balancing throughput and stability
 *
 * @param workers - Workers to execute
 * @param context - Agent execution context
 * @param options - Execution options (requires maxConcurrency)
 * @returns Aggregated execution results
 *
 * @internal
 */
async function executeParallelLimited<TResult>(
  workers: WorkerTask<unknown, TResult>[],
  context: AgentContext,
  options: ExecutionOptions
): Promise<ExecutionResults<TResult>> {
  const startTime = Date.now();
  const maxConcurrency = options.maxConcurrency ?? 2;

  const results = new Map<string, WorkerResult<TResult>>();
  let successCount = 0;
  let failureCount = 0;
  const failedWorkers: string[] = [];

  // Process workers in batches
  for (let i = 0; i < workers.length; i += maxConcurrency) {
    const batch = workers.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map((worker) => executeWorker(worker, context, options))
    );

    for (const result of batchResults) {
      results.set(result.name, result);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        failedWorkers.push(result.name);
      }
    }

    // Check if we should stop on failure
    if (!options.continueOnFailure && failureCount > 0) {
      // Mark remaining workers as blocked
      const remaining = workers.slice(i + maxConcurrency);
      for (const blocked of remaining) {
        results.set(blocked.name, {
          name: blocked.name,
          success: false,
          state: 'blocked',
          error: new Error('Blocked by previous batch failure'),
          durationMs: 0,
          attempts: 0,
          startedAt: new Date(),
          completedAt: new Date(),
          logs: ['Blocked by previous batch failure'],
        });
        failureCount++;
        failedWorkers.push(blocked.name);
      }
      break;
    }
  }

  return {
    results,
    allSucceeded: failureCount === 0,
    partialSuccess: successCount > 0,
    totalDurationMs: Date.now() - startTime,
    successCount,
    failureCount,
    failedWorkers,
    strategy: 'parallel-limited',
  };
}

/**
 * Execute worker tasks using the specified strategy.
 *
 * This is the main entry point for worker execution.
 * Dispatches to the appropriate execution function based on strategy.
 *
 * @param workers - Worker tasks to execute (use registry.getEnabledWorkers())
 * @param context - Agent execution context
 * @param strategy - Execution strategy ('sequential', 'parallel', 'parallel-limited')
 * @param options - Optional execution configuration
 * @returns Aggregated results from all workers
 *
 * @example
 * ```typescript
 * // Phase 1: Sequential execution
 * const workers = registry.getEnabledWorkers();
 * const results = await executeWorkers(workers, context, 'sequential');
 *
 * // Phase 2: Parallel with limit
 * const results = await executeWorkers(workers, context, 'parallel-limited', {
 *   maxConcurrency: 2,
 *   workerTimeout: 120000,
 * });
 *
 * // Handle results
 * if (results.allSucceeded) {
 *   const cartResult = results.results.get('cartBuilder');
 *   // Generate Review Pack...
 * } else if (results.partialSuccess) {
 *   // Generate partial Review Pack with warnings...
 * } else {
 *   // All workers failed - escalate...
 * }
 * ```
 */
export async function executeWorkers<TResult>(
  workers: WorkerTask<unknown, TResult>[],
  context: AgentContext,
  strategy: ExecutionStrategy,
  options: ExecutionOptions = {}
): Promise<ExecutionResults<TResult>> {
  // Apply defaults
  const opts: ExecutionOptions = {
    maxConcurrency: 2,
    workerTimeout: 300000,
    maxRetries: 2,
    continueOnFailure: true,
    ...options,
  };

  // Filter to enabled workers only (defensive - should already be filtered)
  const enabledWorkers = workers.filter((w) => w.enabled);

  if (enabledWorkers.length === 0) {
    return {
      results: new Map(),
      allSucceeded: true,
      partialSuccess: false,
      totalDurationMs: 0,
      successCount: 0,
      failureCount: 0,
      failedWorkers: [],
      strategy,
    };
  }

  context.logger.info('Starting worker execution', {
    strategy,
    workerCount: enabledWorkers.length,
    workers: enabledWorkers.map((w) => w.name),
  });

  let results: ExecutionResults<TResult>;

  switch (strategy) {
    case 'sequential':
      results = await executeSequential(enabledWorkers, context, opts);
      break;
    case 'parallel':
      results = await executeParallel(enabledWorkers, context, opts);
      break;
    case 'parallel-limited':
      results = await executeParallelLimited(enabledWorkers, context, opts);
      break;
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = strategy;
      throw new Error(`Unknown execution strategy: ${String(_exhaustive)}`);
    }
  }

  context.logger.info('Worker execution completed', {
    strategy,
    allSucceeded: results.allSucceeded,
    successCount: results.successCount,
    failureCount: results.failureCount,
    totalDurationMs: results.totalDurationMs,
  });

  return results;
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Determine if an error is retryable (transient).
 *
 * Error classification for retry decisions:
 * - Timeout errors: retryable (network/server temporary issues)
 * - Navigation errors: retryable (page load failures)
 * - Element not found: retryable (timing issues, dynamic content)
 * - Authentication errors: NOT retryable (need user action)
 * - Validation errors: NOT retryable (data/logic issues)
 *
 * @param error - The error to classify
 * @returns true if the error is transient and should be retried
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Retryable patterns (transient failures)
  const retryablePatterns = [
    'timeout',
    'timed out',
    'network',
    'navigation',
    'net::',
    'econnreset',
    'econnrefused',
    'element not found',
    'waiting for selector',
    'page crashed',
    'context destroyed',
    'target closed',
    'socket hang up',
  ];

  // Non-retryable patterns (persistent failures)
  const nonRetryablePatterns = [
    'authentication',
    'login',
    'unauthorized',
    'forbidden',
    'invalid',
    'validation',
    'not logged in',
    'purchase',
    'order',
    'payment',
  ];

  // Check non-retryable first
  if (nonRetryablePatterns.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Check if matches retryable pattern
  return retryablePatterns.some((pattern) => message.includes(pattern));
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a worker task from a worker class instance.
 *
 * Utility to wrap existing worker implementations (like CartBuilder)
 * in the WorkerTask interface for the execution framework.
 *
 * @param name - Worker name
 * @param enabled - Whether worker is enabled
 * @param config - Worker configuration
 * @param executeFn - Function to execute the worker
 * @param options - Optional task options (dependencies, priority)
 * @returns WorkerTask instance
 *
 * @example
 * ```typescript
 * const cartBuilderTask = createWorkerTask(
 *   'cartBuilder',
 *   true,
 *   { maxOrdersToLoad: 3 },
 *   async (context) => {
 *     const builder = new CartBuilder(cartBuilderTask.config);
 *     return builder.run(context);
 *   }
 * );
 * ```
 */
export function createWorkerTask<TConfig, TResult>(
  name: string,
  enabled: boolean,
  config: TConfig,
  executeFn: (context: AgentContext) => Promise<AgentResult & { data?: TResult }>,
  options?: {
    dependencies?: readonly string[];
    priority?: number;
  }
): WorkerTask<TConfig, TResult> {
  return {
    name,
    enabled,
    config,
    execute: executeFn,
    dependencies: options?.dependencies,
    priority: options?.priority,
  };
}

/**
 * Create a default worker registry with standard workers.
 *
 * Phase 1: Only CartBuilder is enabled by default.
 * Phase 2+: Other workers can be enabled via configuration.
 *
 * Note: This is a factory function. The actual worker implementations
 * should be registered after creation.
 *
 * @returns Empty WorkerRegistry instance
 */
export function createWorkerRegistry(): WorkerRegistry {
  return new WorkerRegistry();
}

// =============================================================================
// Result Aggregation
// =============================================================================

/**
 * Get a typed worker result from execution results.
 *
 * Utility to safely extract and type-cast worker results.
 *
 * @param results - Execution results map
 * @param workerName - Name of worker to get result for
 * @returns Worker result or undefined if not found
 */
export function getWorkerResult<TResult>(
  results: ExecutionResults<unknown>,
  workerName: string
): WorkerResult<TResult> | undefined {
  return results.results.get(workerName) as WorkerResult<TResult> | undefined;
}

/**
 * Check if a specific worker succeeded.
 *
 * @param results - Execution results
 * @param workerName - Name of worker to check
 * @returns true if worker exists and succeeded
 */
export function workerSucceeded(results: ExecutionResults<unknown>, workerName: string): boolean {
  const result = results.results.get(workerName);
  return result?.success ?? false;
}

/**
 * Get all worker logs from execution results.
 *
 * Useful for debugging and audit trails.
 *
 * @param results - Execution results
 * @returns Combined logs from all workers
 */
export function getAllWorkerLogs(results: ExecutionResults<unknown>): string[] {
  const allLogs: string[] = [];
  for (const result of results.results.values()) {
    allLogs.push(...result.logs);
  }
  return allLogs;
}

// =============================================================================
// Conflict Detection (Phase 2+)
// =============================================================================

/**
 * Conflict type when multiple workers modify the same state.
 *
 * Reserved for Phase 2 when multiple workers can run in parallel
 * and may both try to modify cart state.
 */
export interface WorkerConflict {
  /** Workers involved in the conflict */
  readonly workers: readonly string[];

  /** Type of conflict */
  readonly type: 'cart_modification' | 'item_quantity' | 'item_removal';

  /** Description of the conflict */
  readonly description: string;

  /** Suggested resolution */
  readonly resolution: 'first_wins' | 'last_wins' | 'merge' | 'manual';
}

/**
 * Detect conflicts between worker results.
 *
 * Phase 2+: Analyze results from parallel workers to find
 * cases where multiple workers modified the same state.
 *
 * @param _results - Execution results to analyze
 * @returns Array of detected conflicts (empty in Phase 1)
 */
export function detectConflicts(_results: ExecutionResults<unknown>): WorkerConflict[] {
  // Phase 2: Implement conflict detection
  // For now, return empty array (no conflicts in sequential execution)
  return [];
}
