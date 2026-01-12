import path from 'path';
import { z } from 'zod';
import { readJsonFile, writeJsonFile } from '../utils/file-operations.js';
import { MEMORY_SCHEMA_VERSION } from '../types.js';

// ============================================================================
// Base Store Configuration
// ============================================================================

export interface BaseStoreConfig {
  householdId: string;
  dataDir?: string;
  fileName: string;
}

// ============================================================================
// Base Store Class
// ============================================================================

/**
 * Base class for all persistent stores.
 * Provides common functionality for JSON file-based storage.
 */
export abstract class BaseStore<TData extends z.ZodType> {
  protected readonly householdId: string;
  protected readonly dataDir: string;
  protected readonly fileName: string;
  protected readonly filePath: string;
  protected readonly schema: TData;

  protected data: z.infer<TData> | null = null;

  constructor(config: BaseStoreConfig, schema: TData) {
    this.householdId = config.householdId;
    this.dataDir = config.dataDir || this.getDefaultDataDir();
    this.fileName = config.fileName;
    this.filePath = path.join(this.dataDir, this.householdId, this.fileName);
    this.schema = schema;
  }

  /**
   * Get the default data directory for memory stores.
   */
  protected getDefaultDataDir(): string {
    return path.join(process.cwd(), 'data', 'memory');
  }

  /**
   * Load data from file. Creates empty store if file doesn't exist.
   */
  async load(): Promise<void> {
    const fileData = await readJsonFile(this.filePath);

    if (fileData === null) {
      // File doesn't exist, initialize with empty data
      this.data = this.createEmpty();
      return;
    }

    // Validate and parse
    const parsed = this.schema.safeParse(fileData);

    if (!parsed.success) {
      throw new Error(
        `Invalid store data in ${this.filePath}: ${parsed.error.message}`
      );
    }

    this.data = parsed.data;

    // Check if migration is needed
    if (this.needsMigration(this.data)) {
      this.data = await this.migrate(this.data);
      await this.save();
    }
  }

  /**
   * Save data to file atomically.
   */
  async save(): Promise<void> {
    if (this.data === null) {
      throw new Error('Cannot save: store not loaded');
    }

    // Update timestamp
    if ('updatedAt' in this.data) {
      (this.data as { updatedAt: string }).updatedAt = new Date().toISOString();
    }

    await writeJsonFile(this.filePath, this.data, {
      ensureDir: true,
      backup: true,
    });
  }

  /**
   * Get the current data. Throws if not loaded.
   */
  protected getData(): z.infer<TData> {
    if (this.data === null) {
      throw new Error('Store not loaded. Call load() first.');
    }
    return this.data;
  }

  /**
   * Check if the store is loaded.
   */
  isLoaded(): boolean {
    return this.data !== null;
  }

  /**
   * Ensure the store is loaded. Loads if not already loaded.
   */
  async ensureLoaded(): Promise<void> {
    if (!this.isLoaded()) {
      await this.load();
    }
  }

  /**
   * Create an empty data structure for this store.
   */
  protected abstract createEmpty(): z.infer<TData>;

  /**
   * Check if the data needs migration.
   */
  protected needsMigration(data: z.infer<TData>): boolean {
    if ('version' in data) {
      return (data as { version: string }).version !== MEMORY_SCHEMA_VERSION;
    }
    return false;
  }

  /**
   * Migrate data from an older version.
   * Override this in subclasses if migration logic is needed.
   */
  protected async migrate(data: z.infer<TData>): Promise<z.infer<TData>> {
    // Default: just update version
    if ('version' in data) {
      (data as { version: string }).version = MEMORY_SCHEMA_VERSION;
    }
    return data;
  }

  /**
   * Get the file path for this store.
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Reload data from file, discarding any in-memory changes.
   */
  async reload(): Promise<void> {
    this.data = null;
    await this.load();
  }

  /**
   * Clear all data (reset to empty state).
   */
  async clear(): Promise<void> {
    this.data = this.createEmpty();
    await this.save();
  }
}
