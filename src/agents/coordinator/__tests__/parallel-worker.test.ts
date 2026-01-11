/**
 * Unit Tests for Parallel Worker Execution Framework
 *
 * Tests the worker execution framework including:
 * - Worker registry (register, enable/disable, get workers)
 * - Sequential execution strategy
 * - Parallel execution strategy
 * - Parallel-limited execution strategy
 * - Error handling and retries
 * - Result aggregation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../../../types/agent.js';
import {
  WorkerRegistry,
  executeWorkers,
  createWorkerTask,
  createWorkerRegistry,
  isRetryableError,
  getWorkerResult,
  workerSucceeded,
  getAllWorkerLogs,
  detectConflicts,
  type WorkerTask,
} from '../parallel-worker.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock AgentContext for testing.
 */
function createMockContext(): AgentContext {
  return {
    page: {} as AgentContext['page'],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as AgentContext['logger'],
    sessionId: 'test-session-123',
    workingMemory: {
      cartItems: [],
      unavailableItems: [],
      substitutions: [],
      deliverySlots: [],
    },
  };
}

/**
 * Create a mock worker that succeeds.
 */
function createSuccessWorker<T>(
  name: string,
  data: T,
  delay = 0
): WorkerTask<Record<string, unknown>, T> {
  return {
    name,
    enabled: true,
    config: {},
    execute: vi.fn().mockImplementation(async () => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return { success: true, data, logs: [`${name} completed`] };
    }),
  };
}

/**
 * Create a mock worker that fails.
 */
function createFailingWorker(
  name: string,
  errorMessage: string,
  retryable = false
): WorkerTask<Record<string, unknown>, unknown> {
  const message = retryable ? `timeout: ${errorMessage}` : errorMessage;
  return {
    name,
    enabled: true,
    config: {},
    execute: vi.fn().mockRejectedValue(new Error(message)),
  };
}

/**
 * Create a mock worker that fails then succeeds.
 */
function createEventuallySucceedingWorker<T>(
  name: string,
  data: T,
  failCount: number
): WorkerTask<Record<string, unknown>, T> {
  let attempts = 0;
  return {
    name,
    enabled: true,
    config: {},
    execute: vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts <= failCount) {
        return Promise.reject(new Error(`timeout: Attempt ${attempts} failed`));
      }
      return Promise.resolve({ success: true, data, logs: [`${name} completed on attempt ${attempts}`] });
    }),
  };
}

// =============================================================================
// WorkerRegistry Tests
// =============================================================================

describe('WorkerRegistry', () => {
  let registry: WorkerRegistry;

  beforeEach(() => {
    registry = new WorkerRegistry();
  });

  describe('register', () => {
    it('should register a worker', () => {
      const worker = createSuccessWorker('testWorker', { result: 'test' });

      registry.register(worker);

      expect(registry.has('testWorker')).toBe(true);
    });

    it('should throw if worker already registered', () => {
      const worker = createSuccessWorker('testWorker', { result: 'test' });

      registry.register(worker);

      expect(() => registry.register(worker)).toThrow("Worker 'testWorker' is already registered");
    });

    it('should allow registering multiple workers', () => {
      const worker1 = createSuccessWorker('worker1', { id: 1 });
      const worker2 = createSuccessWorker('worker2', { id: 2 });

      registry.register(worker1);
      registry.register(worker2);

      expect(registry.has('worker1')).toBe(true);
      expect(registry.has('worker2')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister a worker', () => {
      const worker = createSuccessWorker('testWorker', { result: 'test' });
      registry.register(worker);

      const result = registry.unregister('testWorker');

      expect(result).toBe(true);
      expect(registry.has('testWorker')).toBe(false);
    });

    it('should return false if worker not found', () => {
      const result = registry.unregister('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should return registered worker', () => {
      const worker = createSuccessWorker('testWorker', { result: 'test' });
      registry.register(worker);

      const retrieved = registry.get('testWorker');

      expect(retrieved).toBe(worker);
    });

    it('should return undefined for unregistered worker', () => {
      const retrieved = registry.get('nonexistent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('setEnabled', () => {
    it('should enable a worker', () => {
      const worker = createSuccessWorker('testWorker', { result: 'test' });
      worker.enabled = false;
      registry.register(worker);

      registry.setEnabled('testWorker', true);

      expect(registry.get('testWorker')?.enabled).toBe(true);
    });

    it('should disable a worker', () => {
      const worker = createSuccessWorker('testWorker', { result: 'test' });
      registry.register(worker);

      registry.setEnabled('testWorker', false);

      expect(registry.get('testWorker')?.enabled).toBe(false);
    });

    it('should throw if worker not registered', () => {
      expect(() => registry.setEnabled('nonexistent', true)).toThrow(
        "Worker 'nonexistent' is not registered"
      );
    });
  });

  describe('getEnabledWorkers', () => {
    it('should return only enabled workers', () => {
      const enabled1 = createSuccessWorker('enabled1', { id: 1 });
      const disabled = createSuccessWorker('disabled', { id: 2 });
      disabled.enabled = false;
      const enabled2 = createSuccessWorker('enabled2', { id: 3 });

      registry.register(enabled1);
      registry.register(disabled);
      registry.register(enabled2);

      const enabledWorkers = registry.getEnabledWorkers();

      expect(enabledWorkers).toHaveLength(2);
      expect(enabledWorkers.map((w) => w.name)).toContain('enabled1');
      expect(enabledWorkers.map((w) => w.name)).toContain('enabled2');
      expect(enabledWorkers.map((w) => w.name)).not.toContain('disabled');
    });

    it('should sort by priority (highest first)', () => {
      const low = createSuccessWorker('low', { priority: 'low' });
      low.priority = 1;
      const high = createSuccessWorker('high', { priority: 'high' });
      high.priority = 10;
      const medium = createSuccessWorker('medium', { priority: 'medium' });
      medium.priority = 5;

      registry.register(low);
      registry.register(high);
      registry.register(medium);

      const workers = registry.getEnabledWorkers();

      expect(workers[0]?.name).toBe('high');
      expect(workers[1]?.name).toBe('medium');
      expect(workers[2]?.name).toBe('low');
    });
  });

  describe('getAllWorkers', () => {
    it('should return all workers including disabled', () => {
      const enabled = createSuccessWorker('enabled', { id: 1 });
      const disabled = createSuccessWorker('disabled', { id: 2 });
      disabled.enabled = false;

      registry.register(enabled);
      registry.register(disabled);

      const allWorkers = registry.getAllWorkers();

      expect(allWorkers).toHaveLength(2);
    });
  });

  describe('getWorkerNames', () => {
    it('should return all worker names', () => {
      registry.register(createSuccessWorker('worker1', {}));
      registry.register(createSuccessWorker('worker2', {}));

      const names = registry.getWorkerNames();

      expect(names).toContain('worker1');
      expect(names).toContain('worker2');
    });
  });

  describe('clear', () => {
    it('should remove all workers', () => {
      registry.register(createSuccessWorker('worker1', {}));
      registry.register(createSuccessWorker('worker2', {}));

      registry.clear();

      expect(registry.getAllWorkers()).toHaveLength(0);
    });
  });
});

// =============================================================================
// Sequential Execution Tests
// =============================================================================

describe('executeWorkers - sequential strategy', () => {
  let context: AgentContext;

  beforeEach(() => {
    context = createMockContext();
  });

  it('should execute single worker successfully', async () => {
    const worker = createSuccessWorker('cartBuilder', { itemCount: 5 });

    const results = await executeWorkers([worker], context, 'sequential');

    expect(results.allSucceeded).toBe(true);
    expect(results.successCount).toBe(1);
    expect(results.failureCount).toBe(0);
    expect(results.strategy).toBe('sequential');
  });

  it('should execute multiple workers in order', async () => {
    const executionOrder: string[] = [];

    const worker1 = createSuccessWorker('worker1', { order: 1 });
    worker1.execute = vi.fn().mockImplementation(() => {
      executionOrder.push('worker1');
      return Promise.resolve({ success: true, data: { order: 1 }, logs: [] });
    });

    const worker2 = createSuccessWorker('worker2', { order: 2 });
    worker2.execute = vi.fn().mockImplementation(() => {
      executionOrder.push('worker2');
      return Promise.resolve({ success: true, data: { order: 2 }, logs: [] });
    });

    await executeWorkers([worker1, worker2], context, 'sequential');

    expect(executionOrder).toEqual(['worker1', 'worker2']);
  });

  it('should handle worker failure', async () => {
    const worker = createFailingWorker('failingWorker', 'Something went wrong');

    const results = await executeWorkers([worker], context, 'sequential');

    expect(results.allSucceeded).toBe(false);
    expect(results.failureCount).toBe(1);
    expect(results.failedWorkers).toContain('failingWorker');
  });

  it('should continue on failure by default', async () => {
    const failing = createFailingWorker('failing', 'Failed');
    const success = createSuccessWorker('success', { result: 'ok' });

    const results = await executeWorkers([failing, success], context, 'sequential');

    expect(results.partialSuccess).toBe(true);
    expect(results.successCount).toBe(1);
    expect(results.failureCount).toBe(1);
  });

  it('should stop on failure when continueOnFailure is false', async () => {
    const failing = createFailingWorker('failing', 'Failed');
    const blocked = createSuccessWorker('blocked', { result: 'ok' });

    const results = await executeWorkers([failing, blocked], context, 'sequential', {
      continueOnFailure: false,
    });

    expect(results.allSucceeded).toBe(false);
    expect(results.failureCount).toBe(2);

    const blockedResult = results.results.get('blocked');
    expect(blockedResult?.state).toBe('blocked');
  });

  it('should retry on transient errors', async () => {
    const worker = createEventuallySucceedingWorker('retrying', { result: 'success' }, 1);

    const results = await executeWorkers([worker], context, 'sequential', {
      maxRetries: 2,
    });

    expect(results.allSucceeded).toBe(true);
    const workerResult = results.results.get('retrying');
    expect(workerResult?.attempts).toBe(2);
  });

  it('should fail after max retries exhausted', async () => {
    const worker = createFailingWorker('failing', 'timeout: always fails', true);

    const results = await executeWorkers([worker], context, 'sequential', {
      maxRetries: 2,
      workerTimeout: 60000,
    });

    expect(results.allSucceeded).toBe(false);
    const workerResult = results.results.get('failing');
    expect(workerResult?.attempts).toBe(3); // 1 initial + 2 retries
  });

  it('should handle empty worker list', async () => {
    const results = await executeWorkers([], context, 'sequential');

    expect(results.allSucceeded).toBe(true);
    expect(results.successCount).toBe(0);
    expect(results.failureCount).toBe(0);
    expect(results.totalDurationMs).toBe(0);
  });

  it('should skip disabled workers', async () => {
    const enabled = createSuccessWorker('enabled', { result: 'ok' });
    const disabled = createSuccessWorker('disabled', { result: 'should not run' });
    disabled.enabled = false;

    const results = await executeWorkers([enabled, disabled], context, 'sequential');

    expect(results.successCount).toBe(1);
    expect(disabled.execute).not.toHaveBeenCalled();
  });

  it('should track duration', async () => {
    const worker = createSuccessWorker('worker', { result: 'ok' }, 50);

    const results = await executeWorkers([worker], context, 'sequential');

    expect(results.totalDurationMs).toBeGreaterThanOrEqual(50);
  });

  it('should call onWorkerStart callback', async () => {
    const onWorkerStart = vi.fn();
    const worker = createSuccessWorker('worker', { result: 'ok' });

    await executeWorkers([worker], context, 'sequential', { onWorkerStart });

    expect(onWorkerStart).toHaveBeenCalledWith('worker');
  });

  it('should call onWorkerComplete callback', async () => {
    const onWorkerComplete = vi.fn();
    const worker = createSuccessWorker('worker', { result: 'ok' });

    await executeWorkers([worker], context, 'sequential', { onWorkerComplete });

    expect(onWorkerComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'worker',
        success: true,
      })
    );
  });
});

// =============================================================================
// Parallel Execution Tests
// =============================================================================

describe('executeWorkers - parallel strategy', () => {
  let context: AgentContext;

  beforeEach(() => {
    context = createMockContext();
  });

  it('should execute workers in parallel', async () => {
    const startTimes: number[] = [];

    const worker1 = createSuccessWorker('worker1', { id: 1 });
    worker1.execute = vi.fn().mockImplementation(async () => {
      startTimes.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, data: { id: 1 }, logs: [] };
    });

    const worker2 = createSuccessWorker('worker2', { id: 2 });
    worker2.execute = vi.fn().mockImplementation(async () => {
      startTimes.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, data: { id: 2 }, logs: [] };
    });

    const results = await executeWorkers([worker1, worker2], context, 'parallel');

    expect(results.allSucceeded).toBe(true);
    expect(results.strategy).toBe('parallel');

    // Both workers should start at roughly the same time
    const timeDiff = Math.abs(startTimes[0]! - startTimes[1]!);
    expect(timeDiff).toBeLessThan(30); // Within 30ms of each other
  });

  it('should collect all results even with failures', async () => {
    const success = createSuccessWorker('success', { result: 'ok' });
    const failing = createFailingWorker('failing', 'Failed');

    const results = await executeWorkers([success, failing], context, 'parallel');

    expect(results.results.size).toBe(2);
    expect(results.partialSuccess).toBe(true);
    expect(results.successCount).toBe(1);
    expect(results.failureCount).toBe(1);
  });
});

// =============================================================================
// Parallel-Limited Execution Tests
// =============================================================================

describe('executeWorkers - parallel-limited strategy', () => {
  let context: AgentContext;

  beforeEach(() => {
    context = createMockContext();
  });

  it('should limit concurrent workers', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const createTrackedWorker = (name: string) => {
      const worker = createSuccessWorker(name, { name });
      worker.execute = vi.fn().mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrent--;
        return { success: true, data: { name }, logs: [] };
      });
      return worker;
    };

    const workers = [
      createTrackedWorker('w1'),
      createTrackedWorker('w2'),
      createTrackedWorker('w3'),
      createTrackedWorker('w4'),
    ];

    const results = await executeWorkers(workers, context, 'parallel-limited', {
      maxConcurrency: 2,
    });

    expect(results.allSucceeded).toBe(true);
    expect(results.strategy).toBe('parallel-limited');
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should stop batches on failure when continueOnFailure is false', async () => {
    const batch1Success = createSuccessWorker('b1-success', { batch: 1 });
    const batch1Fail = createFailingWorker('b1-fail', 'Failed');
    const batch2Blocked = createSuccessWorker('b2-blocked', { batch: 2 });

    const results = await executeWorkers(
      [batch1Success, batch1Fail, batch2Blocked],
      context,
      'parallel-limited',
      {
        maxConcurrency: 2,
        continueOnFailure: false,
      }
    );

    expect(results.allSucceeded).toBe(false);
    expect(results.results.get('b2-blocked')?.state).toBe('blocked');
  });
});

// =============================================================================
// Error Classification Tests
// =============================================================================

describe('isRetryableError', () => {
  it('should identify timeout errors as retryable', () => {
    expect(isRetryableError(new Error('timeout waiting for element'))).toBe(true);
    expect(isRetryableError(new Error('Request timed out'))).toBe(true);
  });

  it('should identify network errors as retryable', () => {
    expect(isRetryableError(new Error('network error'))).toBe(true);
    expect(isRetryableError(new Error('net::ERR_FAILED'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('should identify navigation errors as retryable', () => {
    expect(isRetryableError(new Error('navigation failed'))).toBe(true);
  });

  it('should identify element errors as retryable', () => {
    expect(isRetryableError(new Error('element not found'))).toBe(true);
    expect(isRetryableError(new Error('waiting for selector'))).toBe(true);
  });

  it('should identify authentication errors as non-retryable', () => {
    expect(isRetryableError(new Error('authentication failed'))).toBe(false);
    expect(isRetryableError(new Error('not logged in'))).toBe(false);
    expect(isRetryableError(new Error('unauthorized'))).toBe(false);
  });

  it('should identify validation errors as non-retryable', () => {
    expect(isRetryableError(new Error('validation error'))).toBe(false);
    expect(isRetryableError(new Error('invalid input'))).toBe(false);
  });

  it('should identify purchase-related errors as non-retryable', () => {
    expect(isRetryableError(new Error('purchase not allowed'))).toBe(false);
    expect(isRetryableError(new Error('order submission blocked'))).toBe(false);
  });

  it('should treat unknown errors as non-retryable', () => {
    expect(isRetryableError(new Error('Something unexpected happened'))).toBe(false);
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('createWorkerTask', () => {
  it('should create a worker task with required properties', () => {
    const task = createWorkerTask(
      'testWorker',
      true,
      { option: 'value' },
      () => Promise.resolve({ success: true, logs: [] })
    );

    expect(task.name).toBe('testWorker');
    expect(task.enabled).toBe(true);
    expect(task.config).toEqual({ option: 'value' });
    expect(typeof task.execute).toBe('function');
  });

  it('should create a worker task with optional properties', () => {
    const task = createWorkerTask('testWorker', false, {}, () => Promise.resolve({ success: true, logs: [] }), {
      dependencies: ['dep1', 'dep2'],
      priority: 10,
    });

    expect(task.dependencies).toEqual(['dep1', 'dep2']);
    expect(task.priority).toBe(10);
  });
});

describe('createWorkerRegistry', () => {
  it('should create an empty registry', () => {
    const registry = createWorkerRegistry();

    expect(registry.getAllWorkers()).toHaveLength(0);
  });
});

describe('getWorkerResult', () => {
  it('should return typed result for existing worker', async () => {
    const context = createMockContext();
    const worker = createSuccessWorker('testWorker', { count: 42 });

    const results = await executeWorkers([worker], context, 'sequential');
    const result = getWorkerResult<{ count: number }>(results, 'testWorker');

    expect(result?.data?.count).toBe(42);
  });

  it('should return undefined for non-existing worker', async () => {
    const context = createMockContext();
    const worker = createSuccessWorker('testWorker', {});

    const results = await executeWorkers([worker], context, 'sequential');
    const result = getWorkerResult(results, 'nonexistent');

    expect(result).toBeUndefined();
  });
});

describe('workerSucceeded', () => {
  it('should return true for successful worker', async () => {
    const context = createMockContext();
    const worker = createSuccessWorker('success', {});

    const results = await executeWorkers([worker], context, 'sequential');

    expect(workerSucceeded(results, 'success')).toBe(true);
  });

  it('should return false for failed worker', async () => {
    const context = createMockContext();
    const worker = createFailingWorker('failing', 'Error');

    const results = await executeWorkers([worker], context, 'sequential');

    expect(workerSucceeded(results, 'failing')).toBe(false);
  });

  it('should return false for non-existing worker', async () => {
    const context = createMockContext();

    const results = await executeWorkers([], context, 'sequential');

    expect(workerSucceeded(results, 'nonexistent')).toBe(false);
  });
});

describe('getAllWorkerLogs', () => {
  it('should collect logs from all workers', async () => {
    const context = createMockContext();
    const worker1 = createSuccessWorker('worker1', {});
    const worker2 = createSuccessWorker('worker2', {});

    const results = await executeWorkers([worker1, worker2], context, 'sequential');
    const logs = getAllWorkerLogs(results);

    // Logs include framework messages plus worker logs
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((log) => log.includes('worker1'))).toBe(true);
    expect(logs.some((log) => log.includes('worker2'))).toBe(true);
  });
});

describe('detectConflicts', () => {
  it('should return empty array (Phase 1 - no conflict detection)', async () => {
    const context = createMockContext();
    const worker = createSuccessWorker('worker', {});

    const results = await executeWorkers([worker], context, 'sequential');
    const conflicts = detectConflicts(results);

    expect(conflicts).toEqual([]);
  });
});

// =============================================================================
// Integration-style Tests
// =============================================================================

describe('executeWorkers - integration scenarios', () => {
  let context: AgentContext;

  beforeEach(() => {
    context = createMockContext();
  });

  it('should handle Phase 1 scenario: CartBuilder only, sequential', async () => {
    const cartBuilder = createWorkerTask(
      'cartBuilder',
      true,
      { maxOrdersToLoad: 3 },
      () =>
        Promise.resolve({
          success: true,
          data: {
            itemCount: 15,
            totalPrice: 125.5,
            ordersLoaded: ['ORD-001', 'ORD-002'],
          },
          logs: ['Loaded 2 orders', 'Added 15 items to cart'],
        }),
      { priority: 100 }
    );

    const registry = createWorkerRegistry();
    registry.register(cartBuilder);

    const results = await executeWorkers(registry.getEnabledWorkers(), context, 'sequential');

    expect(results.allSucceeded).toBe(true);
    expect(results.successCount).toBe(1);

    const cartResult = getWorkerResult<{ itemCount: number }>(results, 'cartBuilder');
    expect(cartResult?.data?.itemCount).toBe(15);
  });

  it('should handle Phase 2 scenario: Multiple workers, parallel-limited', async () => {
    const cartBuilder = createWorkerTask(
      'cartBuilder',
      true,
      {},
      () =>
        Promise.resolve({
          success: true,
          data: { itemCount: 10 },
          logs: ['Cart built'],
        }),
      { priority: 100 }
    );

    const substitution = createWorkerTask(
      'substitution',
      true,
      {},
      () =>
        Promise.resolve({
          success: true,
          data: { substitutionsFound: 2 },
          logs: ['Found substitutions'],
        }),
      { priority: 50 }
    );

    const stockPruner = createWorkerTask(
      'stockPruner',
      true,
      {},
      () =>
        Promise.resolve({
          success: true,
          data: { itemsPruned: 3 },
          logs: ['Pruned items'],
        }),
      { priority: 50 }
    );

    const slotScout = createWorkerTask(
      'slotScout',
      true,
      {},
      () =>
        Promise.resolve({
          success: true,
          data: { slotsFound: 5 },
          logs: ['Found delivery slots'],
        }),
      { priority: 25 }
    );

    const registry = createWorkerRegistry();
    registry.register(cartBuilder);
    registry.register(substitution);
    registry.register(stockPruner);
    registry.register(slotScout);

    const results = await executeWorkers(
      registry.getEnabledWorkers(),
      context,
      'parallel-limited',
      { maxConcurrency: 2 }
    );

    expect(results.allSucceeded).toBe(true);
    expect(results.successCount).toBe(4);
    expect(results.strategy).toBe('parallel-limited');
  });

  it('should handle partial failure in Phase 2', async () => {
    const cartBuilder = createSuccessWorker('cartBuilder', { itemCount: 10 });
    const substitution = createFailingWorker('substitution', 'No substitutes found');
    const slotScout = createSuccessWorker('slotScout', { slotsFound: 3 });

    const registry = createWorkerRegistry();
    registry.register(cartBuilder);
    registry.register(substitution);
    registry.register(slotScout);

    const results = await executeWorkers(registry.getEnabledWorkers(), context, 'parallel');

    expect(results.allSucceeded).toBe(false);
    expect(results.partialSuccess).toBe(true);
    expect(results.successCount).toBe(2);
    expect(results.failureCount).toBe(1);
    expect(results.failedWorkers).toEqual(['substitution']);
  });

  it('should respect configuration flags for enabling workers', async () => {
    // Simulate config flags like CoordinatorConfig
    const config = {
      enableSubstitution: false,
      enableStockPruning: true,
      enableSlotScouting: false,
    };

    const cartBuilder = createSuccessWorker('cartBuilder', {});
    cartBuilder.enabled = true; // Always enabled in Phase 1+

    const substitution = createSuccessWorker('substitution', {});
    substitution.enabled = config.enableSubstitution;

    const stockPruner = createSuccessWorker('stockPruner', {});
    stockPruner.enabled = config.enableStockPruning;

    const slotScout = createSuccessWorker('slotScout', {});
    slotScout.enabled = config.enableSlotScouting;

    const registry = createWorkerRegistry();
    registry.register(cartBuilder);
    registry.register(substitution);
    registry.register(stockPruner);
    registry.register(slotScout);

    const results = await executeWorkers(registry.getEnabledWorkers(), context, 'sequential');

    expect(results.successCount).toBe(2); // Only cartBuilder and stockPruner
    expect(results.results.has('cartBuilder')).toBe(true);
    expect(results.results.has('stockPruner')).toBe(true);
    expect(results.results.has('substitution')).toBe(false);
    expect(results.results.has('slotScout')).toBe(false);
  });
});
