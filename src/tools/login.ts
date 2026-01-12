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
import { attachPopupObserver } from '../utils/auto-popup-dismisser.js';

/**
 * Auchan.pt login page selectors
 *
 * These selectors may need updating if the website changes.
 * Prefer data-testid, roles, or stable class names over dynamic ones.
 */
export const LOGIN_SELECTORS = {
  // Cookie consent
  cookieAcceptButton: '[data-testid="cookie-accept"], .cookie-accept, #onetrust-accept-btn-handler',

  // OneSignal notification subscription popup dismiss
  notificationDismiss: '#onesignal-slidedown-cancel-button, button:has-text("Não"), button:has-text("Fechar")',

  // Login navigation - Auchan uses OAuth via Salesforce
  accountButton: '.auc-header-account a[href*="Login-OAuthLogin"], .auc-header-account a:has-text("Login")',
  loginLink: 'a[href*="Login-OAuthLogin"]',

  // Login form (Salesforce OAuth page)
  emailInput: '#uname1, input[type="email"], input[name="uname1"], input[name="username"], input[name="email"]',
  passwordInput: '#pwd1, input[type="password"], input[name="passwordLogin"], input[name="password"]',
  submitButton:
    '#btnSubmit_login, input[type="button"][value*="Aceda"], input.btn-success[type="button"], button:has-text("Aceda à sua conta"), input[type="submit"]',

  // Login state indicators
  loggedInIndicator: '.auc-header-account span:not(:has-text("Login")), [data-testid="user-menu"], .auc-header__user-name',
  loginError: '.login-error, .error-message, [role="alert"], .slds-form-element__help',
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

    // Attach auto-popup dismisser for the session
    await attachPopupObserver(context.page, context.logger);

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

    // Navigate to login page (with popup handling)
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

    // Dismiss any popups that appear after login (subscription, notifications, etc.)
    await this.dismissPopups(context);

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
   * Dismiss any notification/subscription popups (OneSignal, etc.)
   */
  private async dismissPopups(context: ToolContext): Promise<void> {
    context.logger.debug('Checking for notification popups');

    // Wait a moment for popups to potentially appear
    await context.page.waitForTimeout(1000);

    // Try multiple times as popups may appear sequentially
    for (let i = 0; i < 3; i++) {
      // Look for visible dismiss buttons - use specific OneSignal selector first
      const dismissButton = context.page.locator(LOGIN_SELECTORS.notificationDismiss).first();

      try {
        // Only click if visible
        if (await dismissButton.isVisible({ timeout: 3000 })) {
          context.logger.info('Dismissing notification popup');
          await dismissButton.click({ timeout: 5000 });
          await context.page.waitForTimeout(500);
        } else {
          break;
        }
      } catch {
        // No more visible popups
        break;
      }
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

    // Retry logic for handling popups that may block clicks
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // First dismiss any visible popups
        await this.dismissPopups(context);

        // Try clicking account/login button
        const accountButton = context.page.locator(LOGIN_SELECTORS.accountButton).first();
        if (await accountButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          context.logger.debug('Clicking account button');
          await accountButton.click({ timeout: 5000 });
          await context.page.waitForTimeout(500);
        }

        // Check for login link
        const loginLink = context.page.locator(LOGIN_SELECTORS.loginLink).first();
        if (await loginLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          context.logger.debug('Clicking login link');
          await loginLink.click({ timeout: 5000 });
        }

        // Wait for login form to be visible
        await this.waitForSelector(context, LOGIN_SELECTORS.emailInput, { timeout: 10000 });
        return; // Success
      } catch (err) {
        context.logger.warn(`Login navigation attempt ${attempt + 1} failed, checking for popups`);
        // Try to dismiss any popup that might have appeared
        await this.dismissPopups(context);

        if (attempt === 2) {
          throw err; // Last attempt failed
        }
      }
    }
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
