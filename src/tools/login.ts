/**
 * Login Tool
 *
 * Handles authentication for Auchan.pt with:
 * - Credential loading from environment
 * - Cookie consent handling
 * - Login form automation
 * - Session state verification
 */

import type { ToolContext } from '../types/tool.js';
import { BaseTool } from './base-tool.js';
import { loadCredentials, hasCredentials, getConfig } from '../config/index.js';

/**
 * Auchan.pt login page selectors
 *
 * These selectors may need updating if the website changes.
 * Prefer data-testid, roles, or stable class names over dynamic ones.
 */
export const LOGIN_SELECTORS = {
  // Cookie consent
  cookieAcceptButton: '[data-testid="cookie-accept"], .cookie-accept, #onetrust-accept-btn-handler',

  // Login navigation
  accountButton: '[data-testid="account-button"], .auc-header__account, a[href*="login"]',
  loginLink: '[data-testid="login-link"], a[href*="login"], .login-link',

  // Login form
  emailInput: 'input[type="email"], input[name="email"], #email, input[placeholder*="email" i]',
  passwordInput: 'input[type="password"], input[name="password"], #password',
  submitButton:
    'button[type="submit"], input[type="submit"], .login-button, button:has-text("Entrar")',

  // Login state indicators
  loggedInIndicator: '[data-testid="user-menu"], .auc-header__user-name, .user-account-name',
  loginError: '.login-error, .error-message, [role="alert"]',
} as const;

/**
 * Input for login operation
 */
export interface LoginInput {
  /** Email override (uses env var if not provided) */
  email?: string;
  /** Password override (uses env var if not provided) */
  password?: string;
  /** Skip session restore attempt */
  forceLogin?: boolean;
}

/**
 * Result of login operation
 */
export interface LoginResult {
  /** Whether login was successful */
  loggedIn: boolean;
  /** User display name if available */
  userName?: string;
  /** Whether this was a fresh login or restored session */
  sessionRestored: boolean;
  /** Login page URL after authentication */
  finalUrl: string;
}

/**
 * Login tool for Auchan.pt authentication
 */
export class LoginTool extends BaseTool<LoginInput, LoginResult> {
  readonly name = 'login';
  readonly description = 'Authenticate with Auchan.pt using provided or configured credentials';

  protected async run(input: LoginInput, context: ToolContext): Promise<LoginResult> {
    const config = getConfig();
    const baseUrl = config.auchan.baseUrl;

    // Get credentials
    const credentials = this.getCredentials(input);

    context.logger.info('Starting login flow', { baseUrl });

    // Navigate to homepage first
    await this.navigate(context, baseUrl);

    // Handle cookie consent if present
    await this.handleCookieConsent(context);

    // Check if already logged in
    const alreadyLoggedIn = await this.isLoggedIn(context);
    if (alreadyLoggedIn && !input.forceLogin) {
      context.logger.info('Already logged in, skipping login flow');
      const userName = await this.getUserName(context);
      const result: LoginResult = {
        loggedIn: true,
        sessionRestored: true,
        finalUrl: context.page.url(),
      };
      if (userName !== undefined) {
        result.userName = userName;
      }
      return result;
    }

    // Navigate to login page
    await this.navigateToLogin(context);

    // Capture screenshot before login
    await context.screenshot('login-page');

    // Fill and submit login form
    await this.performLogin(context, credentials.email, credentials.password);

    // Wait for navigation after login
    await this.waitForLoginComplete(context);

    // Verify login success
    const loggedIn = await this.isLoggedIn(context);
    if (!loggedIn) {
      // Check for error message
      const errorMessage = await this.getLoginError(context);
      throw new Error(`Login failed: ${errorMessage ?? 'Unknown error'}`);
    }

    // Capture success screenshot
    await context.screenshot('login-success');

    const userName = await this.getUserName(context);
    context.logger.info('Login successful', { userName });

    const result: LoginResult = {
      loggedIn: true,
      sessionRestored: false,
      finalUrl: context.page.url(),
    };
    if (userName !== undefined) {
      result.userName = userName;
    }
    return result;
  }

  /**
   * Get credentials from input or environment
   */
  private getCredentials(input: LoginInput): { email: string; password: string } {
    if (input.email !== undefined && input.password !== undefined) {
      return { email: input.email, password: input.password };
    }

    if (!hasCredentials()) {
      throw new Error(
        'Auchan credentials not configured. ' +
          'Set AUCHAN_EMAIL and AUCHAN_PASSWORD environment variables.'
      );
    }

    return loadCredentials();
  }

  /**
   * Handle cookie consent banner if present
   */
  private async handleCookieConsent(context: ToolContext): Promise<void> {
    context.logger.debug('Checking for cookie consent banner');

    const hasConsent = await this.exists(context, LOGIN_SELECTORS.cookieAcceptButton, {
      timeout: 3000,
    });

    if (hasConsent) {
      context.logger.info('Accepting cookie consent');
      await this.click(context, LOGIN_SELECTORS.cookieAcceptButton);
      // Wait for banner to dismiss
      await context.page.waitForTimeout(500);
    }
  }

  /**
   * Check if user is currently logged in
   */
  private async isLoggedIn(context: ToolContext): Promise<boolean> {
    return this.exists(context, LOGIN_SELECTORS.loggedInIndicator, { timeout: 2000 });
  }

  /**
   * Get the logged-in user's display name
   */
  private async getUserName(context: ToolContext): Promise<string | undefined> {
    try {
      const name = await this.getText(context, LOGIN_SELECTORS.loggedInIndicator, {
        timeout: 2000,
      });
      return name?.trim() ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Navigate to the login page
   */
  private async navigateToLogin(context: ToolContext): Promise<void> {
    context.logger.debug('Navigating to login page');

    // Try clicking account/login button first
    const hasAccountButton = await this.exists(context, LOGIN_SELECTORS.accountButton, {
      timeout: 2000,
    });

    if (hasAccountButton) {
      await this.click(context, LOGIN_SELECTORS.accountButton);
      await context.page.waitForTimeout(500);
    }

    // Check for login link
    const hasLoginLink = await this.exists(context, LOGIN_SELECTORS.loginLink, { timeout: 2000 });

    if (hasLoginLink) {
      await this.click(context, LOGIN_SELECTORS.loginLink);
    }

    // Wait for login form to be visible
    await this.waitForSelector(context, LOGIN_SELECTORS.emailInput, { timeout: 10000 });
  }

  /**
   * Fill and submit the login form
   */
  private async performLogin(
    context: ToolContext,
    email: string,
    password: string
  ): Promise<void> {
    context.logger.debug('Filling login form');

    // Fill email
    await this.fill(context, LOGIN_SELECTORS.emailInput, email);

    // Fill password
    await this.fill(context, LOGIN_SELECTORS.passwordInput, password);

    // Submit form
    context.logger.debug('Submitting login form');
    await this.click(context, LOGIN_SELECTORS.submitButton);
  }

  /**
   * Wait for login navigation to complete
   */
  private async waitForLoginComplete(context: ToolContext): Promise<void> {
    context.logger.debug('Waiting for login to complete');

    // Wait for either success indicator or error
    await Promise.race([
      this.waitForSelector(context, LOGIN_SELECTORS.loggedInIndicator, { timeout: 15000 }),
      this.waitForSelector(context, LOGIN_SELECTORS.loginError, { timeout: 15000 }),
    ]).catch(() => {
      // If neither appears, we'll check state in the caller
    });

    // Allow page to settle
    await context.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Network idle timeout is not critical
    });
  }

  /**
   * Get login error message if present
   */
  private async getLoginError(context: ToolContext): Promise<string | null> {
    const hasError = await this.exists(context, LOGIN_SELECTORS.loginError, { timeout: 1000 });
    if (!hasError) {
      return null;
    }

    return this.getText(context, LOGIN_SELECTORS.loginError, { timeout: 1000 });
  }
}

/**
 * Create a new LoginTool instance
 */
export function createLoginTool(): LoginTool {
  return new LoginTool();
}
