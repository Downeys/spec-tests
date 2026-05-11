import type { Result } from '../../dtos/result.js';
import { ok, err } from '../../dtos/result.js';
import type { StrategyId } from './strategy-id.js';
import { newStrategyId } from './strategy-id.js';
import type { StrategyName, NameInvalid } from './strategy-name.js';
import { createStrategyName } from './strategy-name.js';
import type { StrategyStatus } from './strategy-status.js';
import { activeStatus } from './strategy-status.js';

export interface IllegalTransition {
  readonly tag: 'IllegalTransition';
  readonly reason: string;
}

export interface StrategySnapshot {
  readonly id: StrategyId;
  readonly name: StrategyName;
  readonly status: StrategyStatus;
  readonly createdAt: Date;
}

export class Strategy {
  private readonly _id: StrategyId;
  private _name: StrategyName;
  private _status: StrategyStatus;
  private readonly _createdAt: Date;

  private constructor(id: StrategyId, name: StrategyName, status: StrategyStatus, createdAt: Date) {
    this._id = id;
    this._name = name;
    this._status = status;
    this._createdAt = createdAt;
  }

  static create(rawName: string): Result<Strategy, NameInvalid> {
    const nameResult = createStrategyName(rawName);
    if (nameResult.tag === 'err') {
      return err(nameResult.error);
    }
    return ok(new Strategy(newStrategyId(), nameResult.value, activeStatus(), new Date()));
  }

  static reconstitute(snapshot: StrategySnapshot): Strategy {
    return new Strategy(snapshot.id, snapshot.name, snapshot.status, snapshot.createdAt);
  }

  get id(): StrategyId {
    return this._id;
  }

  get name(): StrategyName {
    return this._name;
  }

  get status(): StrategyStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get isArchived(): boolean {
    return this._status.tag === 'archived';
  }

  archive(reason?: string, now: () => Date = () => new Date()): Result<void, IllegalTransition> {
    if (this.isArchived) {
      return err({
        tag: 'IllegalTransition',
        reason: 'Cannot archive an already-archived strategy',
      });
    }
    this._status = { tag: 'archived', archivedAt: now(), reason };
    return ok(undefined);
  }

  rename(newName: StrategyName): Result<void, IllegalTransition> {
    if (this.isArchived) {
      return err({ tag: 'IllegalTransition', reason: 'Cannot rename an archived strategy' });
    }
    this._name = newName;
    return ok(undefined);
  }

  snapshot(): StrategySnapshot {
    return {
      id: this._id,
      name: this._name,
      status: this._status,
      createdAt: this._createdAt,
    };
  }
}
