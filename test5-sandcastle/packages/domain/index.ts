export { type Result, ok, err, isOk, isErr } from './dtos/result.js';
export {
  type StrategyId,
  StrategyIdSchema,
  newStrategyId,
} from './aggregates/strategy/strategy-id.js';
export {
  type StrategyName,
  type NameInvalid,
  StrategyNameSchema,
  createStrategyName,
} from './aggregates/strategy/strategy-name.js';
export {
  type StrategyStatus,
  type ActiveStatus,
  type ArchivedStatus,
  StrategyStatusSchema,
  ActiveStatusSchema,
  ArchivedStatusSchema,
  activeStatus,
} from './aggregates/strategy/strategy-status.js';
export {
  Strategy,
  type StrategySnapshot,
  type IllegalTransition,
} from './aggregates/strategy/strategy.js';
