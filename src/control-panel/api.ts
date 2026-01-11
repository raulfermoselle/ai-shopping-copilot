/**
 * Control Panel API
 *
 * HTTP API layer for the Control Panel.
 * Provides REST endpoints for session management and review pack operations.
 *
 * Endpoints:
 * - POST /sessions - Start a new session
 * - GET /sessions/:id - Get session status
 * - POST /sessions/:id/approve - Submit approval
 * - DELETE /sessions/:id - Cancel session
 *
 * Note: This is a simple implementation using Node's http module.
 * For production, consider using Express, Fastify, or Hono.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import type { Logger } from '../utils/logger.js';
import type {
  StartSessionResponse,
  GetSessionStatusResponse,
  SubmitApprovalResponse,
} from './types.js';
import {
  StartSessionRequestSchema,
  SubmitApprovalRequestSchema,
} from './types.js';
import { SessionManager, createSessionManager } from './session-manager.js';

// =============================================================================
// Types
// =============================================================================

interface APIConfig {
  port: number;
  host: string;
  corsOrigin: string;
}

// =============================================================================
// Control Panel API
// =============================================================================

/**
 * Control Panel REST API server.
 */
export class ControlPanelAPI {
  private readonly config: APIConfig;
  private readonly sessionManager: SessionManager;
  private readonly logger: Logger;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(
    logger: Logger,
    sessionManager: SessionManager,
    config: Partial<APIConfig> = {}
  ) {
    this.logger = logger;
    this.sessionManager = sessionManager;
    this.config = {
      port: config.port ?? 3001,
      host: config.host ?? 'localhost',
      corsOrigin: config.corsOrigin ?? '*',
    };
  }

  /**
   * Start the API server.
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch((error) => {
          this.logger.error('Request handler error', { error });
          this.sendError(res, 500, 'Internal server error');
        });
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info('Control Panel API started', {
          port: this.config.port,
          host: this.config.host,
        });
        resolve();
      });
    });
  }

  /**
   * Stop the API server.
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.logger.info('Control Panel API stopped');
          resolve();
        }
      });
    });
  }

  // ===========================================================================
  // Request Handling
  // ===========================================================================

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', this.config.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${this.config.host}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    this.logger.debug('API request', { method, path });

    // Route requests
    if (path === '/health' && method === 'GET') {
      return this.handleHealth(res);
    }

    if (path === '/sessions' && method === 'POST') {
      return this.handleStartSession(req, res);
    }

    if (path.startsWith('/sessions/') && method === 'GET') {
      const sessionId = path.split('/')[2];
      if (sessionId) {
        return this.handleGetSession(sessionId, res);
      }
    }

    if (path.match(/^\/sessions\/[^/]+\/approve$/) && method === 'POST') {
      const sessionId = path.split('/')[2];
      if (sessionId) {
        return this.handleApproval(sessionId, req, res);
      }
    }

    if (path.startsWith('/sessions/') && method === 'DELETE') {
      const sessionId = path.split('/')[2];
      if (sessionId) {
        return this.handleCancelSession(sessionId, res);
      }
    }

    // 404 for unknown routes
    this.sendError(res, 404, 'Not found');
  }

  // ===========================================================================
  // Endpoint Handlers
  // ===========================================================================

  /**
   * GET /health
   */
  private handleHealth(res: ServerResponse): void {
    this.sendJSON(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
  }

  /**
   * POST /sessions
   */
  private async handleStartSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const parsed = StartSessionRequestSchema.safeParse(body);

      if (!parsed.success) {
        this.sendError(res, 400, `Validation error: ${parsed.error.message}`);
        return;
      }

      const result = await this.sessionManager.startSession(parsed.data);
      this.sendJSON<StartSessionResponse>(res, 201, result);
    } catch (error) {
      this.logger.error('Start session failed', { error });
      this.sendError(res, 500, 'Failed to start session');
    }
  }

  /**
   * GET /sessions/:id
   */
  private handleGetSession(sessionId: string, res: ServerResponse): void {
    const status = this.sessionManager.getSessionStatus(sessionId);

    if (!status) {
      this.sendError(res, 404, 'Session not found');
      return;
    }

    this.sendJSON<GetSessionStatusResponse>(res, 200, status);
  }

  /**
   * POST /sessions/:id/approve
   */
  private async handleApproval(
    sessionId: string,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req);

      // Add sessionId to body for validation
      const requestBody = { sessionId, approval: body };
      const parsed = SubmitApprovalRequestSchema.safeParse(requestBody);

      if (!parsed.success) {
        this.sendError(res, 400, `Validation error: ${parsed.error.message}`);
        return;
      }

      const result = await this.sessionManager.submitApproval(parsed.data);
      this.sendJSON<SubmitApprovalResponse>(res, 200, result);
    } catch (error) {
      this.logger.error('Submit approval failed', { error });
      this.sendError(res, 500, 'Failed to submit approval');
    }
  }

  /**
   * DELETE /sessions/:id
   */
  private handleCancelSession(sessionId: string, res: ServerResponse): void {
    const cancelled = this.sessionManager.cancelSession(sessionId);

    if (!cancelled) {
      this.sendError(res, 404, 'Session not found');
      return;
    }

    this.sendJSON(res, 200, { success: true, message: 'Session cancelled' });
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendJSON<T>(res: ServerResponse, status: number, data: T): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: message }));
  }
}

/**
 * Create and start the Control Panel API.
 */
export async function createControlPanelAPI(
  logger: Logger,
  config?: Partial<APIConfig>
): Promise<ControlPanelAPI> {
  const sessionManager = createSessionManager(logger);
  const api = new ControlPanelAPI(logger, sessionManager, config);
  await api.start();
  return api;
}

/**
 * Create the API without starting it (for testing).
 */
export function createControlPanelAPIInstance(
  logger: Logger,
  sessionManager: SessionManager,
  config?: Partial<APIConfig>
): ControlPanelAPI {
  return new ControlPanelAPI(logger, sessionManager, config);
}
