import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

// ============================================================================
// Atomic File Operations
// ============================================================================

export interface WriteOptions {
  /** Create parent directories if they don't exist */
  ensureDir?: boolean;
  /** Backup existing file before overwriting */
  backup?: boolean;
}

/**
 * Atomically write data to a file using temp-file-then-rename pattern.
 * This ensures we never lose data on crash during write.
 */
export async function atomicWrite(
  filePath: string,
  data: string,
  options: WriteOptions = {}
): Promise<void> {
  const { ensureDir = true, backup = false } = options;

  // Ensure parent directory exists
  if (ensureDir) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  // Backup existing file if requested
  if (backup) {
    try {
      await fs.access(filePath);
      const backupPath = `${filePath}.backup`;
      await fs.copyFile(filePath, backupPath);
    } catch {
      // File doesn't exist, no backup needed
    }
  }

  // Write to temporary file first
  const tempPath = `${filePath}.tmp.${randomUUID()}`;

  try {
    await fs.writeFile(tempPath, data, 'utf-8');

    // Atomic rename
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read a file and return its contents.
 * Returns null if the file doesn't exist.
 */
export async function readFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read and parse a JSON file.
 * Returns null if the file doesn't exist.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const content = await readFile(filePath);
  if (content === null) {
    return null;
  }
  return JSON.parse(content) as T;
}

/**
 * Atomically write a JSON file with pretty formatting.
 */
export async function writeJsonFile<T>(
  filePath: string,
  data: T,
  options: WriteOptions = {}
): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await atomicWrite(filePath, json, options);
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file metadata.
 */
export async function getFileStats(filePath: string) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List files in a directory matching a pattern.
 */
export async function listFiles(
  dirPath: string,
  pattern?: RegExp
): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath);
    if (pattern) {
      return entries.filter((name) => pattern.test(name));
    }
    return entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Delete a file if it exists.
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return; // Already doesn't exist
    }
    throw error;
  }
}

/**
 * Ensure a directory exists.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
