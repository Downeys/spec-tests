export const STRATEGIES_CHANGED = 'strategies-changed';

export function createStrategiesEventBus(): EventTarget {
  return new EventTarget();
}

export const defaultStrategiesEventBus: EventTarget = createStrategiesEventBus();
