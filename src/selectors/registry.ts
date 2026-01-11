/**
 * Selector Registry
 *
 * Manages versioned selector definitions for Auchan.pt pages.
 * Selectors are stored as JSON files in data/selectors/pages/{pageId}/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SelectorRegistryIndex,
  PageSelectorDefinition,
  PageRegistryEntry,
} from './types.js';

/**
 * Get the project root directory
 */
function getProjectRoot(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  // Navigate from src/selectors to project root
  return join(currentDir, '..', '..');
}

/**
 * Default registry index
 */
function createDefaultIndex(): SelectorRegistryIndex {
  return {
    schemaVersion: '1.0.0',
    lastValidated: new Date().toISOString(),
    pages: {},
  };
}

/**
 * Selector Registry - manages page selector definitions
 */
export class SelectorRegistry {
  private readonly basePath: string;
  private readonly indexPath: string;
  private index: SelectorRegistryIndex | null = null;

  constructor(basePath?: string) {
    this.basePath = basePath ?? join(getProjectRoot(), 'data', 'selectors');
    this.indexPath = join(this.basePath, 'registry.json');
  }

  /**
   * Load the registry index
   */
  loadIndex(): SelectorRegistryIndex {
    if (this.index !== null) {
      return this.index;
    }

    if (!existsSync(this.indexPath)) {
      this.index = createDefaultIndex();
      return this.index;
    }

    const content = readFileSync(this.indexPath, 'utf-8');
    this.index = JSON.parse(content) as SelectorRegistryIndex;
    return this.index;
  }

  /**
   * Save the registry index
   */
  saveIndex(): void {
    if (this.index === null) {
      return;
    }

    const dir = dirname(this.indexPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  /**
   * Check if a page exists in the registry
   */
  hasPage(pageId: string): boolean {
    const index = this.loadIndex();
    return pageId in index.pages;
  }

  /**
   * Get page entry from index
   */
  getPageEntry(pageId: string): PageRegistryEntry | null {
    const index = this.loadIndex();
    return index.pages[pageId] ?? null;
  }

  /**
   * Get active version of page selectors
   */
  getActiveVersion(pageId: string): PageSelectorDefinition | null {
    const entry = this.getPageEntry(pageId);
    if (entry === null) {
      return null;
    }

    return this.getVersion(pageId, entry.activeVersion);
  }

  /**
   * Get specific version of page selectors
   */
  getVersion(pageId: string, version: number): PageSelectorDefinition | null {
    const versionPath = this.getVersionPath(pageId, version);

    if (!existsSync(versionPath)) {
      return null;
    }

    const content = readFileSync(versionPath, 'utf-8');
    return JSON.parse(content) as PageSelectorDefinition;
  }

  /**
   * Create a new version of page selectors
   */
  createVersion(pageId: string, definition: PageSelectorDefinition): void {
    const index = this.loadIndex();

    // Ensure page directory exists
    const pageDir = join(this.basePath, 'pages', pageId);
    if (!existsSync(pageDir)) {
      mkdirSync(pageDir, { recursive: true });
    }

    // Write version file
    const versionPath = this.getVersionPath(pageId, definition.version);
    writeFileSync(versionPath, JSON.stringify(definition, null, 2));

    // Update index
    const existingEntry = index.pages[pageId];
    if (existingEntry !== undefined) {
      if (!existingEntry.versions.includes(definition.version)) {
        existingEntry.versions.push(definition.version);
        existingEntry.versions.sort((a, b) => b - a); // Descending
      }
      existingEntry.activeVersion = definition.version;
    } else {
      index.pages[pageId] = {
        name: definition.pageId,
        urlPattern: definition.urlPattern,
        activeVersion: definition.version,
        versions: [definition.version],
        lastValidation: {
          timestamp: new Date().toISOString(),
          status: 'valid',
          failedSelectors: [],
        },
      };
    }

    this.index = index;
    this.saveIndex();
  }

  /**
   * Update validation status for a page
   */
  updateValidationStatus(
    pageId: string,
    status: 'valid' | 'degraded' | 'invalid',
    failedSelectors: string[] = []
  ): void {
    const index = this.loadIndex();
    const pageEntry = index.pages[pageId];

    if (pageEntry === undefined) {
      return;
    }

    pageEntry.lastValidation = {
      timestamp: new Date().toISOString(),
      status,
      failedSelectors,
    };

    this.index = index;
    this.saveIndex();
  }

  /**
   * Get all registered page IDs
   */
  getPageIds(): string[] {
    const index = this.loadIndex();
    return Object.keys(index.pages);
  }

  /**
   * Get path to version file
   */
  private getVersionPath(pageId: string, version: number): string {
    return join(this.basePath, 'pages', pageId, `v${version}.json`);
  }

  /**
   * Get path to snapshots directory
   */
  getSnapshotsPath(pageId: string): string {
    return join(this.basePath, 'pages', pageId, 'snapshots');
  }

  /**
   * Clear cache (force reload on next access)
   */
  clearCache(): void {
    this.index = null;
  }
}

/**
 * Create a selector registry instance
 */
export function createSelectorRegistry(basePath?: string): SelectorRegistry {
  return new SelectorRegistry(basePath);
}
