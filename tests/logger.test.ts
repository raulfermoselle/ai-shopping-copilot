import { describe, it, expect, vi } from 'vitest';
import { createLogger, type LogLevel } from '../src/utils/logger.js';

describe('Logger', () => {
  it('should create a logger with default level', () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should respect log level filtering', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('warn');
    logger.debug('should not log');
    logger.info('should not log');

    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should include context in log output', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('info');
    logger.info('test message', { key: 'value' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('test message');
    expect(output).toContain('key');

    consoleSpy.mockRestore();
  });

  it('should add prefix when provided', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const logger = createLogger('info', 'TestPrefix');
    logger.info('message');

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('TestPrefix');

    consoleSpy.mockRestore();
  });
});
