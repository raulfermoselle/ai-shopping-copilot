/**
 * Message Protocol Types
 *
 * Defines the message format for communication between:
 * - Service Worker (background)
 * - Content Scripts (DOM access)
 * - Popup (user interface)
 * - Side Panel (review UI)
 */

import type { CartItem, ProductInfo } from './cart.js';
import type { OrderSummary, OrderDetail } from './orders.js';
import type { DeliverySlot } from './slots.js';
import type { RunState, LoginState } from './state.js';

// ============================================================================
// MESSAGE ACTIONS
// ============================================================================

/**
 * All message action types supported by the extension.
 *
 * Naming convention: [domain].[verb] (e.g., 'cart.scan', 'order.extract')
 */
export type MessageAction =
  // === STATE MANAGEMENT ===
  | 'state.get'           // Get current run state
  | 'state.update'        // Update run state
  | 'state.subscribe'     // Subscribe to state changes

  // === CART OPERATIONS ===
  | 'cart.scan'           // Extract cart items from page
  | 'cart.update'         // Update item quantity
  | 'cart.remove'         // Remove item from cart

  // === ORDER OPERATIONS ===
  | 'order.extractHistory'  // Extract order history list
  | 'order.extractDetail'   // Extract single order details
  | 'order.reorder'         // Click reorder button

  // === SEARCH OPERATIONS ===
  | 'search.products'     // Search for products
  | 'search.navigate'     // Navigate to search results

  // === SLOT OPERATIONS ===
  | 'slots.extract'       // Extract delivery slots
  | 'slots.navigate'      // Navigate to slots page

  // === PAGE DETECTION ===
  | 'page.detect'         // Detect current page type
  | 'page.ready'          // Signal page is ready
  | 'page.navigate'       // Navigate to URL

  // === LOGIN OPERATIONS ===
  | 'login.check'         // Check login status
  | 'login.detected'      // Report login detected
  | 'login.logout'        // Report logout detected

  // === LLM OPERATIONS ===
  | 'llm.complete'        // Request LLM completion
  | 'llm.setApiKey'       // Set API key
  | 'llm.checkAvailable'  // Check if LLM is available

  // === RUN CONTROL ===
  | 'run.start'           // Start shopping run
  | 'run.pause'           // Pause current run
  | 'run.resume'          // Resume paused run
  | 'run.cancel'          // Cancel current run
  | 'run.approve'         // Approve cart (in review state)

  // === SYSTEM EVENTS ===
  | 'system.ping'         // Keep-alive ping
  | 'system.error'        // Error notification
  | 'system.log';         // Debug logging

// ============================================================================
// REQUEST TYPES
// ============================================================================

/**
 * Base message structure
 */
export interface BaseMessage {
  /** Unique message ID for correlation */
  id: string;
  /** Message action type */
  action: MessageAction;
  /** Optional timestamp */
  timestamp?: number;
}

/**
 * Request message with typed payload
 */
export interface ExtensionMessage<T = unknown> extends BaseMessage {
  /** Request payload (action-specific) */
  payload?: T;
}

// --- State Requests ---

export interface StateGetRequest extends ExtensionMessage {
  action: 'state.get';
}

export interface StateUpdateRequest extends ExtensionMessage<Partial<RunState>> {
  action: 'state.update';
  payload: Partial<RunState>;
}

// --- Cart Requests ---

export interface CartScanRequest extends ExtensionMessage {
  action: 'cart.scan';
  payload?: {
    includeOutOfStock?: boolean;
  };
}

export interface CartUpdateRequest extends ExtensionMessage {
  action: 'cart.update';
  payload: {
    itemId: string;
    quantity: number;
  };
}

// --- Order Requests ---

export interface OrderExtractHistoryRequest extends ExtensionMessage {
  action: 'order.extractHistory';
  payload?: {
    limit?: number;
  };
}

export interface OrderExtractDetailRequest extends ExtensionMessage {
  action: 'order.extractDetail';
  payload: {
    orderId: string;
  };
}

export interface OrderReorderRequest extends ExtensionMessage {
  action: 'order.reorder';
  payload: {
    orderId: string;
    mode: 'replace' | 'add';
  };
}

// --- Search Requests ---

export interface SearchProductsRequest extends ExtensionMessage {
  action: 'search.products';
  payload: {
    query: string;
    maxResults?: number;
  };
}

// --- Slot Requests ---

export interface SlotsExtractRequest extends ExtensionMessage {
  action: 'slots.extract';
}

// --- Page Requests ---

export interface PageDetectRequest extends ExtensionMessage {
  action: 'page.detect';
}

export interface PageNavigateRequest extends ExtensionMessage {
  action: 'page.navigate';
  payload: {
    url: string;
    waitForLoad?: boolean;
  };
}

// --- Login Requests ---

export interface LoginCheckRequest extends ExtensionMessage {
  action: 'login.check';
}

// --- LLM Requests ---

export interface LLMCompleteRequest extends ExtensionMessage {
  action: 'llm.complete';
  payload: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    systemPrompt?: string;
    maxTokens?: number;
  };
}

export interface LLMSetApiKeyRequest extends ExtensionMessage {
  action: 'llm.setApiKey';
  payload: {
    apiKey: string;
  };
}

// --- Run Control Requests ---

export interface RunStartRequest extends ExtensionMessage {
  action: 'run.start';
  payload?: {
    orderId?: string;  // Specific order to reorder
  };
}

export interface RunApproveRequest extends ExtensionMessage {
  action: 'run.approve';
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Base response structure
 */
export interface ExtensionResponse<T = unknown> {
  /** Correlation ID from request */
  id: string;
  /** Whether request succeeded */
  success: boolean;
  /** Response data (on success) */
  data?: T;
  /** Error information (on failure) */
  error?: ResponseError;
  /** Processing time in ms */
  timing?: number;
}

/**
 * Error details in response
 */
export interface ResponseError {
  /** Error code for categorization */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: unknown;
}

// --- Typed Responses ---

export interface StateGetResponse extends ExtensionResponse<RunState> {
  data: RunState;
}

export interface CartScanResponse extends ExtensionResponse<{ items: CartItem[] }> {
  data: { items: CartItem[] };
}

export interface OrderExtractHistoryResponse extends ExtensionResponse<{ orders: OrderSummary[] }> {
  data: { orders: OrderSummary[] };
}

export interface OrderExtractDetailResponse extends ExtensionResponse<{ order: OrderDetail }> {
  data: { order: OrderDetail };
}

export interface SearchProductsResponse extends ExtensionResponse<{ products: ProductInfo[] }> {
  data: { products: ProductInfo[] };
}

export interface SlotsExtractResponse extends ExtensionResponse<{ slots: DeliverySlot[] }> {
  data: { slots: DeliverySlot[] };
}

export interface PageDetectResponse extends ExtensionResponse<{
  pageType: string;
  url: string;
  isLoggedIn: boolean;
  userName?: string;
}> {}

export interface LoginCheckResponse extends ExtensionResponse<LoginState> {
  data: LoginState;
}

export interface LLMCompleteResponse extends ExtensionResponse<{
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}> {}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Standard error codes for response errors
 */
export const ERROR_CODES = {
  // General errors
  UNKNOWN: 'UNKNOWN',
  TIMEOUT: 'TIMEOUT',
  INVALID_REQUEST: 'INVALID_REQUEST',

  // State errors
  INVALID_STATE: 'INVALID_STATE',
  STATE_MISMATCH: 'STATE_MISMATCH',

  // DOM errors
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  PAGE_NOT_READY: 'PAGE_NOT_READY',
  WRONG_PAGE: 'WRONG_PAGE',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',

  // Auth errors
  NOT_LOGGED_IN: 'NOT_LOGGED_IN',
  API_KEY_MISSING: 'API_KEY_MISSING',
  API_KEY_INVALID: 'API_KEY_INVALID',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================================================
// MESSAGE HELPERS
// ============================================================================

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a request message
 */
export function createRequest<P = unknown>(
  action: MessageAction,
  payload?: P
): ExtensionMessage<P> {
  return {
    id: generateMessageId(),
    action,
    payload,
    timestamp: Date.now(),
  };
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(
  requestId: string,
  data: T,
  timing?: number
): ExtensionResponse<T> {
  return {
    id: requestId,
    success: true,
    data,
    timing,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: unknown
): ExtensionResponse {
  return {
    id: requestId,
    success: false,
    error: { code, message, details },
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if message is a specific action type
 */
export function isAction<A extends MessageAction>(
  message: ExtensionMessage,
  action: A
): message is ExtensionMessage & { action: A } {
  return message.action === action;
}

/**
 * Check if response is successful
 */
export function isSuccessResponse<T>(
  response: ExtensionResponse<T>
): response is ExtensionResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Check if response is an error
 */
export function isErrorResponse(
  response: ExtensionResponse
): response is ExtensionResponse & { success: false; error: ResponseError } {
  return response.success === false && response.error !== undefined;
}
