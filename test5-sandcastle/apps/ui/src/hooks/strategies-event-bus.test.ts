import { describe, it, expect } from 'vitest';
import {
  defaultStrategiesEventBus,
  createStrategiesEventBus,
  STRATEGIES_CHANGED,
} from './strategies-event-bus';

describe('strategies-event-bus', () => {
  it('exports a module-level singleton EventTarget', () => {
    expect(defaultStrategiesEventBus).toBeInstanceOf(EventTarget);
  });

  it('createStrategiesEventBus returns independent EventTarget instances', () => {
    const a = createStrategiesEventBus();
    const b = createStrategiesEventBus();
    expect(a).toBeInstanceOf(EventTarget);
    expect(b).toBeInstanceOf(EventTarget);
    expect(a).not.toBe(b);

    let aFired = 0;
    let bFired = 0;
    a.addEventListener(STRATEGIES_CHANGED, () => {
      aFired += 1;
    });
    b.addEventListener(STRATEGIES_CHANGED, () => {
      bFired += 1;
    });
    a.dispatchEvent(new Event(STRATEGIES_CHANGED));
    expect(aFired).toBe(1);
    expect(bFired).toBe(0);
  });
});
