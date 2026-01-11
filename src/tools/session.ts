/**
 * Session Management
 *
 * Handles browser session persistence for Auchan.pt:
 * - Save/restore cookies and localStorage
 * - Session expiry detection
 * - Automatic session file cleanup
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BrowserContext } from 'playwright';
import { getSessionConfig, type SessionConfig } from '../config/index.js';
import { createLogger, type Logger } from '../utils/logger.js';

/**
 * Session metadata stored alongside session state
 */
export interface SessionMetadata {
  /** When the session was created */
  createdAt: string;
  /** When the session was last used */
  lastUsedAt: string;
  /** Email used for this session (for validation) */
  email: string;
  /** Whether session has been verified as valid */
  verified: boolean;
}


/**
 * Session manager for browser authentication state
 */
export class SessionManager {
  private readonly config: SessionConfig;
  private readonly logger: Logger;

  constructor(config?: SessionConfig, logger?: Logger) {
    this.config = config ?? getSessionConfig();
    this.logger = logger ?? createLogger('info', 'Session');
  }

  /**
   * Get the full path to the session file
   */
  getSessionPath(): string {
    return join(this.config.storageDir, this.config.fileName);
  }

  /**
   * Get the full path to the metadata file
   */
  private getMetadataPath(): string {
    return join(this.config.storageDir, this.config.fileName.replace('.json', '-meta.json'));
  }

  /**
   * Check if a valid session exists
   */
  hasValidSession(email: string): boolean {
    const sessionPath = this.getSessionPath();
    const metadataPath = this.getMetadataPath();

    if (!existsSync(sessionPath) || !existsSync(metadataPath)) {
      this.logger.debug('No session files found');
      return false;
    }

    try {
      const metadata = this.loadMetadata();

      // Check email matches
      if (metadata.email !== email) {
        this.logger.info('Session email mismatch, invalidating');
        return false;
      }

      // Check session age
      const createdAt = new Date(metadata.createdAt).getTime();
      const age = Date.now() - createdAt;

      if (age > this.config.maxAge) {
        this.logger.info('Session expired', { ageHours: Math.round(age / 3600000) });
        return false;
      }

      this.logger.debug('Valid session found', {
        ageHours: Math.round(age / 3600000),
        verified: metadata.verified,
      });

      return true;
    } catch (error) {
      this.logger.warn('Failed to validate session', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return false;
    }
  }

  /**
   * Load session metadata
   */
  private loadMetadata(): SessionMetadata {
    const metadataPath = this.getMetadataPath();
    const content = readFileSync(metadataPath, 'utf-8');
    return JSON.parse(content) as SessionMetadata;
  }

  /**
   * Save browser storage state and metadata
   */
  async saveSession(context: BrowserContext, email: string): Promise<void> {
    const sessionPath = this.getSessionPath();
    const metadataPath = this.getMetadataPath();

    // Ensure directory exists
    const dir = dirname(sessionPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.logger.info('Saving session', { path: sessionPath });

    // Save Playwright storage state
    await context.storageState({ path: sessionPath });

    // Save metadata
    const metadata: SessionMetadata = {
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      email,
      verified: true,
    };

    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    this.logger.info('Session saved successfully');
  }

  /**
   * Update last used timestamp
   */
  updateLastUsed(): void {
    const metadataPath = this.getMetadataPath();

    if (!existsSync(metadataPath)) {
      return;
    }

    try {
      const metadata = this.loadMetadata();
      metadata.lastUsedAt = new Date().toISOString();
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    } catch {
      // Non-critical, ignore errors
    }
  }

  /**
   * Clear saved session
   */
  clearSession(): void {
    const sessionPath = this.getSessionPath();
    const metadataPath = this.getMetadataPath();

    this.logger.info('Clearing session');

    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath);
    }

    if (existsSync(metadataPath)) {
      unlinkSync(metadataPath);
    }
  }

  /**
   * Get session info for logging (redacted)
   */
  getSessionInfo(): { exists: boolean; ageHours?: number; email?: string } {
    const metadataPath = this.getMetadataPath();

    if (!existsSync(metadataPath)) {
      return { exists: false };
    }

    try {
      const metadata = this.loadMetadata();
      const age = Date.now() - new Date(metadata.createdAt).getTime();

      return {
        exists: true,
        ageHours: Math.round(age / 3600000),
        email: metadata.email.substring(0, 3) + '***', // Redact email
      };
    } catch {
      return { exists: false };
    }
  }
}

/**
 * Create a session manager instance
 */
export function createSessionManager(config?: SessionConfig, logger?: Logger): SessionManager {
  return new SessionManager(config, logger);
}
