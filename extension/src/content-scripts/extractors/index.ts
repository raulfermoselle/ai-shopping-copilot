/**
 * Content Script Extractors
 *
 * DOM extraction utilities for Auchan.pt pages.
 * Pure functions with no Chrome API dependencies.
 */

export {
  extractDeliverySlots,
  extractAllDaysSlots,
  isOnSlotsPage,
} from './slot-extractor';

export {
  detectLoginState,
  isOnLoginPage,
  isLoginButtonVisible,
} from './login-detector';

export {
  extractCartItems,
  isOnCartPage,
  hasCartItems,
  type CartExtractionResult,
  type CartExtractionOptions,
} from './cart-scanner';
