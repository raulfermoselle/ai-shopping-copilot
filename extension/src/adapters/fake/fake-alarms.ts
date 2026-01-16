/**
 * Fake Alarms Adapter
 *
 * In-memory implementation of IAlarmsPort for unit testing.
 * Stores alarms in memory and provides manual trigger methods for tests.
 */

import type {
  IAlarmsPort,
  AlarmInfo,
  AlarmCreateOptions,
  AlarmListener,
} from '../../ports/alarms.js';

/**
 * Internal alarm state with additional metadata
 */
interface InternalAlarm extends AlarmInfo {
  /** Whether alarm has been fired (for assertions) */
  firedCount: number;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Recorded alarm event for assertions
 */
export interface RecordedAlarmEvent {
  name: string;
  timestamp: number;
  scheduledTime: number;
}

/**
 * FakeAlarmsAdapter - Mock alarms for tests
 *
 * Features:
 * - Store alarms in memory
 * - Manual triggerAlarm(name) method for tests
 * - Track created/cleared alarms for assertions
 * - Optional auto-fire mode for simulating real alarm behavior
 */
export class FakeAlarmsAdapter implements IAlarmsPort {
  private alarms: Map<string, InternalAlarm> = new Map();
  private listeners: AlarmListener[] = [];

  /** All alarm events (for assertions) */
  readonly firedEvents: RecordedAlarmEvent[] = [];

  /** History of created alarms (for assertions) */
  readonly createdAlarms: Array<{ name: string; options: AlarmCreateOptions; timestamp: number }> =
    [];

  /** History of cleared alarms (for assertions) */
  readonly clearedAlarms: Array<{ name: string; timestamp: number }> = [];

  /** Whether to auto-fire alarms when their time comes (disabled by default) */
  private autoFireEnabled = false;
  private autoFireTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // ============================================================================
  // Test Helpers
  // ============================================================================

  /**
   * Reset adapter state
   */
  reset(): void {
    // Clear auto-fire timers
    for (const timer of this.autoFireTimers.values()) {
      clearTimeout(timer);
    }
    this.autoFireTimers.clear();

    this.alarms.clear();
    this.listeners = [];
    this.firedEvents.length = 0;
    this.createdAlarms.length = 0;
    this.clearedAlarms.length = 0;
    this.autoFireEnabled = false;
  }

  /**
   * Manually trigger an alarm by name.
   * Fires all registered listeners as if the alarm went off.
   *
   * @param name - Alarm name to trigger
   * @returns true if alarm existed and was triggered
   */
  triggerAlarm(name: string): boolean {
    const alarm = this.alarms.get(name);
    if (!alarm) {
      return false;
    }

    // Record the event
    this.firedEvents.push({
      name,
      timestamp: Date.now(),
      scheduledTime: alarm.scheduledTime,
    });

    // Update alarm state
    alarm.firedCount++;

    // If periodic, reschedule
    if (alarm.periodInMinutes) {
      alarm.scheduledTime = Date.now() + alarm.periodInMinutes * 60 * 1000;
    } else {
      // One-shot alarm, remove it
      this.alarms.delete(name);
    }

    // Notify listeners
    const alarmInfo: AlarmInfo = alarm.periodInMinutes !== undefined
      ? {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime,
          periodInMinutes: alarm.periodInMinutes,
        }
      : {
          name: alarm.name,
          scheduledTime: alarm.scheduledTime,
        };

    for (const listener of this.listeners) {
      try {
        listener(alarmInfo);
      } catch (error) {
        console.error('FakeAlarmsAdapter: Listener threw error:', error);
      }
    }

    return true;
  }

  /**
   * Get all active alarms (for assertions)
   */
  getActiveAlarms(): AlarmInfo[] {
    return Array.from(this.alarms.values()).map(this.toPublicAlarm);
  }

  /**
   * Check if an alarm exists
   */
  hasAlarm(name: string): boolean {
    return this.alarms.has(name);
  }

  /**
   * Get how many times an alarm has fired
   */
  getFireCount(name: string): number {
    const alarm = this.alarms.get(name);
    return alarm?.firedCount ?? 0;
  }

  /**
   * Enable auto-fire mode (alarms fire automatically after delay)
   * WARNING: Uses real setTimeout, may slow down tests
   */
  enableAutoFire(): void {
    this.autoFireEnabled = true;
    // Schedule existing alarms
    for (const alarm of this.alarms.values()) {
      this.scheduleAutoFire(alarm);
    }
  }

  /**
   * Disable auto-fire mode
   */
  disableAutoFire(): void {
    this.autoFireEnabled = false;
    for (const timer of this.autoFireTimers.values()) {
      clearTimeout(timer);
    }
    this.autoFireTimers.clear();
  }

  /**
   * Advance time and trigger alarms that should have fired.
   * Use this instead of autoFire for deterministic tests.
   *
   * @param ms - Milliseconds to advance
   */
  advanceTime(ms: number): void {
    const now = Date.now();
    const futureTime = now + ms;

    for (const alarm of this.alarms.values()) {
      if (alarm.scheduledTime <= futureTime) {
        this.triggerAlarm(alarm.name);
      }
    }
  }

  // ============================================================================
  // IAlarmsPort Implementation
  // ============================================================================

  async create(name: string, options: AlarmCreateOptions): Promise<void> {
    // Record creation
    this.createdAlarms.push({
      name,
      options,
      timestamp: Date.now(),
    });

    // Calculate scheduled time
    let scheduledTime: number;
    if (options.when !== undefined) {
      scheduledTime = options.when;
    } else if (options.delayInMinutes !== undefined) {
      scheduledTime = Date.now() + options.delayInMinutes * 60 * 1000;
    } else {
      // Default to 1 minute
      scheduledTime = Date.now() + 60 * 1000;
    }

    // Clear existing alarm with same name
    if (this.alarms.has(name)) {
      this.clearAutoFire(name);
    }

    const alarm: InternalAlarm = options.periodInMinutes !== undefined
      ? {
          name,
          scheduledTime,
          periodInMinutes: options.periodInMinutes,
          firedCount: 0,
          createdAt: Date.now(),
        }
      : {
          name,
          scheduledTime,
          firedCount: 0,
          createdAt: Date.now(),
        };

    this.alarms.set(name, alarm);

    // Schedule auto-fire if enabled
    if (this.autoFireEnabled) {
      this.scheduleAutoFire(alarm);
    }
  }

  async get(name: string): Promise<AlarmInfo | undefined> {
    const alarm = this.alarms.get(name);
    return alarm ? this.toPublicAlarm(alarm) : undefined;
  }

  async getAll(): Promise<AlarmInfo[]> {
    return Array.from(this.alarms.values()).map(this.toPublicAlarm);
  }

  async clear(name: string): Promise<boolean> {
    const existed = this.alarms.has(name);

    if (existed) {
      this.clearedAlarms.push({
        name,
        timestamp: Date.now(),
      });

      this.clearAutoFire(name);
      this.alarms.delete(name);
    }

    return existed;
  }

  async clearAll(): Promise<void> {
    // Record all clears
    for (const name of this.alarms.keys()) {
      this.clearedAlarms.push({
        name,
        timestamp: Date.now(),
      });
    }

    // Clear auto-fire timers
    for (const timer of this.autoFireTimers.values()) {
      clearTimeout(timer);
    }
    this.autoFireTimers.clear();

    this.alarms.clear();
  }

  addListener(listener: AlarmListener): () => void {
    this.listeners.push(listener);

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private toPublicAlarm(alarm: InternalAlarm): AlarmInfo {
    if (alarm.periodInMinutes !== undefined) {
      return {
        name: alarm.name,
        scheduledTime: alarm.scheduledTime,
        periodInMinutes: alarm.periodInMinutes,
      };
    }
    return {
      name: alarm.name,
      scheduledTime: alarm.scheduledTime,
    };
  }

  private scheduleAutoFire(alarm: InternalAlarm): void {
    const delay = Math.max(0, alarm.scheduledTime - Date.now());

    const timer = setTimeout(() => {
      this.triggerAlarm(alarm.name);
    }, delay);

    this.autoFireTimers.set(alarm.name, timer);
  }

  private clearAutoFire(name: string): void {
    const timer = this.autoFireTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.autoFireTimers.delete(name);
    }
  }
}

/**
 * Create a FakeAlarmsAdapter with optional initial alarms
 */
export function createFakeAlarms(
  initialAlarms?: Array<{ name: string; options: AlarmCreateOptions }>
): FakeAlarmsAdapter {
  const adapter = new FakeAlarmsAdapter();

  if (initialAlarms) {
    for (const { name, options } of initialAlarms) {
      // Use synchronous version for setup
      void adapter.create(name, options);
    }
  }

  return adapter;
}
