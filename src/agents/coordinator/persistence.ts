/**
 * Session Persistence and Recovery for Coordinator Agent
 *
 * Provides serialization, storage, and recovery capabilities for CoordinatorSession.
 * Enables session state to be saved to disk and resumed after interruption.
 *
 * Key Features:
 * - JSON serialization with Date object handling
 * - File-based storage in data/sessions directory
 * - Session listing and cleanup
 * - Resume point detection for interrupted sessions
 *
 * Design Principles:
 * - Durability: All writes use atomic operations (write + rename)
 * - Traceability: Every session file includes metadata for debugging
 * - Privacy: Session files contain sensitive data - stored locally only
 * - Performance: Small session files (<100KB typically) for fast I/O
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CoordinatorSession, CoordinatorSessionSchema, SessionStatus } from './types.js';

// =============================================================================
// Constants
// =============================================================================

/** Default directory for session storage */
const DEFAULT_SESSION_DIR = 'data/sessions';

/** Session file extension */
const SESSION_FILE_EXT = '.json';

// =============================================================================
// Serialization Types
// =============================================================================

/**
 * Serialized session format.
 * All Dates converted to ISO strings, non-serializable fields excluded.
 */
interface SerializedSession {
  sessionId: string;
  startTime: string; // ISO date string
  endTime?: string | undefined; // ISO date string
  username: string;
  householdId: string;
  status: SessionStatus;
  workers: {
    cartBuilder: {
      success: boolean;
      durationMs: number;
      report?: unknown | undefined; // CartDiffReport (serialized recursively)
      errorMessage?: string | undefined;
    } | null;
    substitution: {
      success: boolean;
      durationMs: number;
    } | null;
    stockPruner: {
      success: boolean;
      durationMs: number;
    } | null;
    slotScout: {
      success: boolean;
      durationMs: number;
    } | null;
  };
  reviewPack: unknown | null; // ReviewPack (serialized recursively)
  errors: Array<{
    code: string;
    message: string;
    severity: string;
    source: string;
    recoveryAttempted: boolean;
    recoveryOutcome?: string | undefined;
    timestamp: string; // ISO date string
    context?: Record<string, unknown> | undefined;
  }>;
  screenshots: string[];
}

// =============================================================================
// Serialization Functions
// =============================================================================

/**
 * Serialize a CoordinatorSession to JSON-safe format.
 *
 * Converts:
 * - Date objects → ISO strings
 * - CartDiffReport → plain object (Zod schemas are serializable)
 * - ReviewPack → plain object
 *
 * Excludes:
 * - Playwright Page objects (not present in CoordinatorSession)
 * - Function references (not present in CoordinatorSession)
 *
 * @param session The session to serialize
 * @returns JSON-safe serialized session
 */
export function serializeSession(session: CoordinatorSession): SerializedSession {
  return {
    sessionId: session.sessionId,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime?.toISOString(),
    username: session.username,
    householdId: session.householdId,
    status: session.status,
    workers: {
      cartBuilder: session.workers.cartBuilder
        ? {
            success: session.workers.cartBuilder.success,
            durationMs: session.workers.cartBuilder.durationMs,
            // CartDiffReport is Zod-validated, directly serializable
            ...(session.workers.cartBuilder.report !== undefined && {
              report: serializeCartDiffReport(session.workers.cartBuilder.report),
            }),
            ...(session.workers.cartBuilder.errorMessage !== undefined && {
              errorMessage: session.workers.cartBuilder.errorMessage,
            }),
          }
        : null,
      substitution: session.workers.substitution,
      stockPruner: session.workers.stockPruner,
      slotScout: session.workers.slotScout,
    },
    reviewPack: session.reviewPack ? serializeReviewPack(session.reviewPack) : null,
    errors: session.errors.map((err) => ({
      code: err.code,
      message: err.message,
      severity: err.severity,
      source: err.source,
      recoveryAttempted: err.recoveryAttempted,
      ...(err.recoveryOutcome !== undefined && { recoveryOutcome: err.recoveryOutcome }),
      timestamp: err.timestamp.toISOString(),
      ...(err.context !== undefined && { context: err.context }),
    })),
    screenshots: session.screenshots,
  };
}

/**
 * Serialize CartDiffReport (convert Date fields to ISO strings).
 */
function serializeCartDiffReport(report: unknown): unknown {
  // CartDiffReport contains CartSnapshots with timestamp: Date
  // Deep clone and convert all Date objects to ISO strings
  return JSON.parse(JSON.stringify(report, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }));
}

/**
 * Serialize ReviewPack (convert Date fields to ISO strings).
 */
function serializeReviewPack(reviewPack: unknown): unknown {
  // ReviewPack contains generatedAt: Date
  return JSON.parse(JSON.stringify(reviewPack, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }));
}

/**
 * Deserialize a SerializedSession back to CoordinatorSession.
 *
 * Converts:
 * - ISO strings → Date objects
 * - Plain objects → Zod-validated types
 *
 * Validates using CoordinatorSessionSchema to ensure data integrity.
 *
 * @param serialized The serialized session
 * @returns Validated CoordinatorSession
 * @throws Error if validation fails
 */
export function deserializeSession(serialized: SerializedSession): CoordinatorSession {
  // Reconstruct session with Date objects
  const reconstructed = {
    sessionId: serialized.sessionId,
    startTime: new Date(serialized.startTime),
    endTime: serialized.endTime ? new Date(serialized.endTime) : undefined,
    username: serialized.username,
    householdId: serialized.householdId,
    status: serialized.status,
    workers: {
      cartBuilder: serialized.workers.cartBuilder
        ? {
            success: serialized.workers.cartBuilder.success,
            durationMs: serialized.workers.cartBuilder.durationMs,
            ...(serialized.workers.cartBuilder.report !== undefined && {
              report: deserializeCartDiffReport(serialized.workers.cartBuilder.report),
            }),
            ...(serialized.workers.cartBuilder.errorMessage !== undefined && {
              errorMessage: serialized.workers.cartBuilder.errorMessage,
            }),
          }
        : null,
      substitution: serialized.workers.substitution,
      stockPruner: serialized.workers.stockPruner,
      slotScout: serialized.workers.slotScout,
    },
    reviewPack: serialized.reviewPack ? deserializeReviewPack(serialized.reviewPack) : null,
    errors: serialized.errors.map((err) => ({
      code: err.code,
      message: err.message,
      severity: err.severity,
      source: err.source,
      recoveryAttempted: err.recoveryAttempted,
      ...(err.recoveryOutcome !== undefined && { recoveryOutcome: err.recoveryOutcome }),
      timestamp: new Date(err.timestamp),
      ...(err.context !== undefined && { context: err.context }),
    })),
    screenshots: serialized.screenshots,
  };

  // Validate with Zod schema
  return CoordinatorSessionSchema.parse(reconstructed);
}

/**
 * Deserialize CartDiffReport (convert ISO strings back to Date objects).
 */
function deserializeCartDiffReport(report: unknown): unknown {
  // CartDiffReport.timestamp and CartSnapshot timestamps are Date objects
  return JSON.parse(JSON.stringify(report), (key, value) => {
    // Heuristic: if key is a known date field and value is ISO string, convert
    if ((key === 'timestamp' || key === 'date') && typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  });
}

/**
 * Deserialize ReviewPack (convert ISO strings back to Date objects).
 */
function deserializeReviewPack(reviewPack: unknown): unknown {
  return JSON.parse(JSON.stringify(reviewPack), (key, value) => {
    if (key === 'generatedAt' && typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  });
}

// =============================================================================
// Storage Functions
// =============================================================================

/**
 * Get the absolute path to the sessions directory.
 *
 * @param dir Optional custom directory (absolute or relative to cwd)
 * @returns Absolute path to sessions directory
 */
function getSessionDir(dir?: string): string {
  const baseDir = dir ?? DEFAULT_SESSION_DIR;
  return path.isAbsolute(baseDir) ? baseDir : path.resolve(process.cwd(), baseDir);
}

/**
 * Get the file path for a session ID.
 *
 * @param sessionId The session ID
 * @param dir Optional custom directory
 * @returns Absolute path to session file
 */
function getSessionPath(sessionId: string, dir?: string): string {
  const sessionDir = getSessionDir(dir);
  return path.join(sessionDir, `${sessionId}${SESSION_FILE_EXT}`);
}

/**
 * Ensure the sessions directory exists.
 *
 * @param dir Optional custom directory
 */
async function ensureSessionDir(dir?: string): Promise<void> {
  const sessionDir = getSessionDir(dir);
  await fs.mkdir(sessionDir, { recursive: true });
}

/**
 * Save a session to disk.
 *
 * Uses atomic write pattern (write to temp file, then rename) to prevent
 * corruption if write is interrupted.
 *
 * @param session The session to save
 * @param dir Optional custom directory
 * @returns The absolute path to the saved session file
 * @throws Error if serialization or write fails
 */
export async function saveSession(session: CoordinatorSession, dir?: string): Promise<string> {
  await ensureSessionDir(dir);

  const sessionPath = getSessionPath(session.sessionId, dir);
  const tempPath = `${sessionPath}.tmp`;

  try {
    // Serialize session
    const serialized = serializeSession(session);

    // Write to temp file
    await fs.writeFile(tempPath, JSON.stringify(serialized, null, 2), 'utf-8');

    // Atomic rename
    await fs.rename(tempPath, sessionPath);

    return sessionPath;
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    throw new Error(
      `Failed to save session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load a session from disk.
 *
 * @param sessionId The session ID to load
 * @param dir Optional custom directory
 * @returns The loaded session, or null if not found
 * @throws Error if file exists but deserialization fails
 */
export async function loadSession(sessionId: string, dir?: string): Promise<CoordinatorSession | null> {
  const sessionPath = getSessionPath(sessionId, dir);

  try {
    const content = await fs.readFile(sessionPath, 'utf-8');
    const serialized = JSON.parse(content) as SerializedSession;
    return deserializeSession(serialized);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null; // File not found
    }

    throw new Error(
      `Failed to load session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List all session IDs in the sessions directory.
 *
 * @param dir Optional custom directory
 * @returns Array of session IDs (sorted by modification time, newest first)
 * @throws Error if directory read fails
 */
export async function listSessions(dir?: string): Promise<string[]> {
  const sessionDir = getSessionDir(dir);

  try {
    const files = await fs.readdir(sessionDir);

    // Filter for .json files
    const sessionFiles = files.filter((file) => file.endsWith(SESSION_FILE_EXT));

    // Get file stats for sorting by mtime
    const fileStats = await Promise.all(
      sessionFiles.map(async (file) => {
        const filePath = path.join(sessionDir, file);
        const stats = await fs.stat(filePath);
        return {
          file,
          mtime: stats.mtime.getTime(),
        };
      })
    );

    // Sort by modification time (newest first) and extract session IDs
    return fileStats
      .sort((a, b) => b.mtime - a.mtime)
      .map((item) => item.file.replace(SESSION_FILE_EXT, ''));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []; // Directory doesn't exist, return empty list
    }

    throw new Error(
      `Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete a session file from disk.
 *
 * @param sessionId The session ID to delete
 * @param dir Optional custom directory
 * @returns true if session was deleted, false if it didn't exist
 * @throws Error if deletion fails for reasons other than file not found
 */
export async function deleteSession(sessionId: string, dir?: string): Promise<boolean> {
  const sessionPath = getSessionPath(sessionId, dir);

  try {
    await fs.unlink(sessionPath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false; // File not found
    }

    throw new Error(
      `Failed to delete session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// =============================================================================
// Recovery Functions
// =============================================================================

/**
 * Check if a session can be resumed.
 *
 * A session is resumable if:
 * - Status is not 'completed' or 'cancelled'
 * - Session has not timed out (optional check)
 *
 * @param session The session to check
 * @returns true if session can be resumed
 */
export function canResume(session: CoordinatorSession): boolean {
  // Cannot resume completed or cancelled sessions
  if (session.status === 'completed' || session.status === 'cancelled') {
    return false;
  }

  // Check for fatal errors
  const hasFatalError = session.errors.some((err) => err.severity === 'fatal');
  if (hasFatalError) {
    return false;
  }

  return true;
}

/**
 * Determine the appropriate resume point for an interrupted session.
 *
 * Resume logic:
 * - If status is 'initializing' → resume from 'initializing'
 * - If status is 'authenticating' → resume from 'authenticating'
 * - If status is 'loading_cart' → resume from 'loading_cart' (CartBuilder may be in progress)
 * - If status is 'generating_review' → resume from 'generating_review'
 * - If status is 'review_ready' → session is complete, no resume needed
 * - If status is 'completed' or 'cancelled' → cannot resume
 *
 * @param session The session to analyze
 * @returns The status to resume from
 * @throws Error if session cannot be resumed
 */
export function getResumePoint(session: CoordinatorSession): SessionStatus {
  if (!canResume(session)) {
    throw new Error(
      `Cannot resume session ${session.sessionId}: status is ${session.status}`
    );
  }

  // Return current status as resume point
  // Coordinator should restart from current state
  return session.status;
}

// =============================================================================
// Cleanup Functions
// =============================================================================

/**
 * Delete sessions older than the specified age.
 *
 * Cleanup policy:
 * - Delete sessions with endTime older than maxAgeMs
 * - If session has no endTime, use startTime
 * - Only delete completed or cancelled sessions (safety)
 *
 * @param maxAgeMs Maximum age in milliseconds
 * @param dir Optional custom directory
 * @returns Number of sessions deleted
 * @throws Error if cleanup fails
 */
export async function cleanupOldSessions(maxAgeMs: number, dir?: string): Promise<number> {
  const sessionIds = await listSessions(dir);
  const now = Date.now();
  let deletedCount = 0;

  for (const sessionId of sessionIds) {
    try {
      const session = await loadSession(sessionId, dir);

      if (!session) {
        continue; // Session was deleted between list and load
      }

      // Only clean up completed or cancelled sessions
      if (session.status !== 'completed' && session.status !== 'cancelled') {
        continue;
      }

      // Calculate session age
      const sessionEndTime = session.endTime ?? session.startTime;
      const ageMs = now - sessionEndTime.getTime();

      // Delete if older than maxAge
      if (ageMs > maxAgeMs) {
        const deleted = await deleteSession(sessionId, dir);
        if (deleted) {
          deletedCount++;
        }
      }
    } catch (error) {
      // Log error but continue cleanup
      console.error(`Error cleaning up session ${sessionId}:`, error);
    }
  }

  return deletedCount;
}
