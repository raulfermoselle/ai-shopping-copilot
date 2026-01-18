/**
 * LLM Adapters
 *
 * Exports LLM adapter implementations for the extension.
 *
 * Available adapters:
 * - AnthropicAdapter: Real Anthropic API via fetch (production)
 *
 * For testing, use FakeLLMAdapter from test utilities.
 */

export { AnthropicAdapter } from './anthropic-adapter.js';
