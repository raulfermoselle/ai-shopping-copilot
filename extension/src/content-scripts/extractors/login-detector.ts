/**
 * Login Detection Extractor
 *
 * Detects login state from the current page DOM.
 * Runs in content script context with direct DOM access.
 *
 * Uses selectors from data/selectors/pages/login/v1.json
 */

import type { LoginState } from '../../types/state.js';

/**
 * Detect login state from the current page DOM
 *
 * This function runs in the content script context and has direct access to the DOM.
 * It checks for the presence of logged-in indicators in the Auchan.pt header.
 *
 * Selector Strategy:
 * - Primary: .auc-header__user-name (most reliable)
 * - Fallback 1: .auc-header-account span:not(:has-text("Login"))
 * - Fallback 2: [data-testid="user-menu"]
 *
 * @returns LoginState object with detection results
 */
export function detectLoginState(): LoginState {
  // Try primary selector first (most stable, verified from login/v1.json)
  let userNameElement = document.querySelector('.auc-header__user-name');

  // Fallback 1: Any span in account header that doesn't contain "Login"
  if (!userNameElement) {
    const accountSpans = document.querySelectorAll('.auc-header-account span');
    for (const span of accountSpans) {
      const text = span.textContent?.trim() || '';
      if (text && !text.toLowerCase().includes('login')) {
        userNameElement = span;
        break;
      }
    }
  }

  // Fallback 2: data-testid attribute (if added in future UI update)
  if (!userNameElement) {
    userNameElement = document.querySelector('[data-testid="user-menu"]');
  }

  // Extract user name if element found
  const userName = userNameElement?.textContent?.trim() || null;
  const isLoggedIn = userName !== null && userName !== '';

  return {
    isLoggedIn,
    userName,
    loginTimestamp: isLoggedIn ? Date.now() : null,
    detectedOnUrl: window.location.href,
  };
}

/**
 * Check if user is on the login page
 *
 * This is useful for determining if we should show a "login required" message
 * or if the user is already in the process of logging in.
 *
 * @returns true if on Auchan login page or Salesforce OAuth page
 */
export function isOnLoginPage(): boolean {
  const url = window.location.href;
  return (
    url.includes('Login-OAuthLogin') ||
    url.includes('login.salesforce.com')
  );
}

/**
 * Check if login button is visible
 *
 * This indicates the user is logged out. Useful for confirming logout state
 * when username element is not found.
 *
 * @returns true if login button is visible in header
 */
export function isLoginButtonVisible(): boolean {
  // Check for login link in header (from login/v1.json accountButton selector)
  const loginButton = document.querySelector('.auc-header-account a[href*="Login-OAuthLogin"]');
  return loginButton !== null;
}
