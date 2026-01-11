import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, getConfig, clearConfigCache, getLoggableConfig } from '../src/config/index.js';
import type { AppConfig } from '../src/types/config.js';

describe('Configuration System', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearConfigCache();
    // Reset environment variables
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    clearConfigCache();
    vi.unstubAllEnvs();
  });

  describe('loadConfig', () => {
    it('should load configuration from default.json', () => {
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.auchan).toBeDefined();
      expect(config.browser).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('should have correct default values for Auchan settings', () => {
      const config = loadConfig();

      expect(config.auchan.baseUrl).toBe('https://www.auchan.pt');
      expect(config.auchan.timeouts.navigation).toBe(30000);
      expect(config.auchan.timeouts.element).toBe(10000);
    });

    it('should have correct default values for browser settings', () => {
      const config = loadConfig();

      expect(config.browser.headless).toBe(true);
      expect(config.browser.slowMo).toBe(0);
      expect(config.browser.viewport.width).toBe(1280);
      expect(config.browser.viewport.height).toBe(720);
    });

    it('should have correct default values for logging settings', () => {
      const config = loadConfig();

      expect(config.logging.level).toBe('info');
      expect(config.logging.outputDir).toBe('./logs');
    });

    it('should cache configuration after first load', () => {
      const config1 = loadConfig();
      const config2 = loadConfig();

      expect(config1).toBe(config2);
    });
  });

  describe('getConfig', () => {
    it('should return the same config as loadConfig', () => {
      const config1 = loadConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });
  });

  describe('clearConfigCache', () => {
    it('should allow reloading configuration', () => {
      const config1 = loadConfig();
      clearConfigCache();
      const config2 = loadConfig();

      // New object but same values
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('environment variable overrides', () => {
    it('should override AUCHAN_BASE_URL', () => {
      vi.stubEnv('AUCHAN_BASE_URL', 'https://staging.auchan.pt');

      const config = loadConfig();

      expect(config.auchan.baseUrl).toBe('https://staging.auchan.pt');
    });

    it('should override AUCHAN_TIMEOUT_NAVIGATION', () => {
      vi.stubEnv('AUCHAN_TIMEOUT_NAVIGATION', '60000');

      const config = loadConfig();

      expect(config.auchan.timeouts.navigation).toBe(60000);
    });

    it('should override AUCHAN_TIMEOUT_ELEMENT', () => {
      vi.stubEnv('AUCHAN_TIMEOUT_ELEMENT', '5000');

      const config = loadConfig();

      expect(config.auchan.timeouts.element).toBe(5000);
    });

    it('should override BROWSER_HEADLESS', () => {
      vi.stubEnv('BROWSER_HEADLESS', 'false');

      const config = loadConfig();

      expect(config.browser.headless).toBe(false);
    });

    it('should override BROWSER_SLOW_MO', () => {
      vi.stubEnv('BROWSER_SLOW_MO', '100');

      const config = loadConfig();

      expect(config.browser.slowMo).toBe(100);
    });

    it('should override BROWSER_VIEWPORT_WIDTH and HEIGHT', () => {
      vi.stubEnv('BROWSER_VIEWPORT_WIDTH', '1920');
      vi.stubEnv('BROWSER_VIEWPORT_HEIGHT', '1080');

      const config = loadConfig();

      expect(config.browser.viewport.width).toBe(1920);
      expect(config.browser.viewport.height).toBe(1080);
    });

    it('should override LOG_LEVEL', () => {
      vi.stubEnv('LOG_LEVEL', 'debug');

      const config = loadConfig();

      expect(config.logging.level).toBe('debug');
    });

    it('should override LOG_OUTPUT_DIR', () => {
      vi.stubEnv('LOG_OUTPUT_DIR', '/var/log/aisc');

      const config = loadConfig();

      expect(config.logging.outputDir).toBe('/var/log/aisc');
    });

    it('should ignore invalid number values', () => {
      vi.stubEnv('AUCHAN_TIMEOUT_NAVIGATION', 'not-a-number');

      const config = loadConfig();

      // Should keep default value
      expect(config.auchan.timeouts.navigation).toBe(30000);
    });

    it('should parse boolean values correctly', () => {
      // Test various truthy values
      vi.stubEnv('BROWSER_HEADLESS', '1');
      expect(loadConfig().browser.headless).toBe(true);
      clearConfigCache();
      vi.unstubAllEnvs();

      vi.stubEnv('BROWSER_HEADLESS', 'yes');
      expect(loadConfig().browser.headless).toBe(true);
      clearConfigCache();
      vi.unstubAllEnvs();

      vi.stubEnv('BROWSER_HEADLESS', 'TRUE');
      expect(loadConfig().browser.headless).toBe(true);
      clearConfigCache();
      vi.unstubAllEnvs();

      // Test various falsy values
      vi.stubEnv('BROWSER_HEADLESS', '0');
      expect(loadConfig().browser.headless).toBe(false);
      clearConfigCache();
      vi.unstubAllEnvs();

      vi.stubEnv('BROWSER_HEADLESS', 'no');
      expect(loadConfig().browser.headless).toBe(false);
      clearConfigCache();
      vi.unstubAllEnvs();

      vi.stubEnv('BROWSER_HEADLESS', 'FALSE');
      expect(loadConfig().browser.headless).toBe(false);
    });
  });

  describe('getLoggableConfig', () => {
    it('should return a deep copy of the config', () => {
      const config = loadConfig();
      const loggable = getLoggableConfig(config);

      expect(loggable).not.toBe(config);
      expect(loggable['auchan']).toEqual(config.auchan);
      expect(loggable['browser']).toEqual(config.browser);
      expect(loggable['logging']).toEqual(config.logging);
    });
  });

  describe('validation', () => {
    it('should reject invalid log levels', () => {
      vi.stubEnv('LOG_LEVEL', 'invalid');

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
    });

    it('should reject invalid URLs', () => {
      vi.stubEnv('AUCHAN_BASE_URL', 'not-a-url');

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
    });
  });
});
