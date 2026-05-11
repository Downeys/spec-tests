import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { Result } from '@bp-agent/domain';
import {
  ok,
  err,
  Strategy,
  StrategyIdSchema,
  StrategyNameSchema,
  StrategyStatusSchema,
} from '@bp-agent/domain';
import type { StrategyId, StrategyName } from '@bp-agent/domain';
import type { StrategyRepository, RepositoryError, ListAllOptions } from '@bp-agent/application';

const StrategyRecordSchema = z.object({
  id: StrategyIdSchema,
  name: StrategyNameSchema,
  status: StrategyStatusSchema,
  createdAt: z.coerce.date(),
  versionId: z.string().uuid(),
  previousVersionId: z.string().uuid().nullable(),
});

const StrategiesFileV2Schema = z.object({
  schemaVersion: z.literal(2),
  strategies: z.array(StrategyRecordSchema),
});

const StrategiesFileV1Schema = z.object({
  schemaVersion: z.literal(1),
  strategies: z.array(
    z.object({
      id: StrategyIdSchema,
      name: StrategyNameSchema,
      status: StrategyStatusSchema,
      createdAt: z.coerce.date(),
      previousVersionId: z.string().uuid().nullable(),
    }),
  ),
});

type StrategyRecord = z.infer<typeof StrategyRecordSchema>;
type StrategiesFileV2 = z.infer<typeof StrategiesFileV2Schema>;

export class JsonFileStrategyRepository implements StrategyRepository {
  constructor(private readonly filePath: string) {}

  save(strategy: Strategy): Promise<Result<void, RepositoryError>> {
    try {
      const existing = this.readFile();
      const records: StrategyRecord[] = existing?.strategies ?? [];

      const snapshot = strategy.snapshot();
      const latestVersion = this.findLatestRecord(records, snapshot.id);

      records.push({
        id: snapshot.id,
        name: snapshot.name,
        status: snapshot.status,
        createdAt: snapshot.createdAt,
        versionId: crypto.randomUUID(),
        previousVersionId: latestVersion?.versionId ?? null,
      });

      const data: StrategiesFileV2 = { schemaVersion: 2, strategies: records };
      this.writeAtomic(data);
      return Promise.resolve(ok(undefined));
    } catch (e: unknown) {
      return Promise.resolve(err(this.classifyError(e)));
    }
  }

  loadByName(name: StrategyName): Promise<Result<Strategy | null, RepositoryError>> {
    return Promise.resolve(this.findStrategy((r) => r.name === name));
  }

  loadById(id: StrategyId): Promise<Result<Strategy | null, RepositoryError>> {
    return Promise.resolve(this.findStrategy((r) => r.id === id));
  }

  listAll(opts: ListAllOptions): Promise<Result<readonly Strategy[], RepositoryError>> {
    try {
      const data = this.readFile();
      if (data === null) {
        return Promise.resolve(ok([]));
      }

      const latestRecords = this.getLatestRecords(data.strategies);
      const strategies = latestRecords
        .filter((r) => opts.includeArchived || r.status.tag !== 'archived')
        .map((r) =>
          Strategy.reconstitute({
            id: r.id,
            name: r.name,
            status: r.status,
            createdAt: r.createdAt,
          }),
        );

      return Promise.resolve(ok(strategies));
    } catch (e: unknown) {
      return Promise.resolve(err(this.classifyError(e)));
    }
  }

  private findStrategy(
    predicate: (r: StrategyRecord) => boolean,
  ): Result<Strategy | null, RepositoryError> {
    try {
      const data = this.readFile();
      if (data === null) {
        return ok(null);
      }

      const latestRecords = this.getLatestRecords(data.strategies);
      const record = latestRecords.find(predicate);
      if (!record) {
        return ok(null);
      }

      return ok(
        Strategy.reconstitute({
          id: record.id,
          name: record.name,
          status: record.status,
          createdAt: record.createdAt,
        }),
      );
    } catch (e: unknown) {
      return err(this.classifyError(e));
    }
  }

  private getLatestRecords(records: StrategyRecord[]): StrategyRecord[] {
    const referencedVersionIds = new Set(
      records.map((r) => r.previousVersionId).filter((v): v is string => v !== null),
    );
    return records.filter((r) => !referencedVersionIds.has(r.versionId));
  }

  private findLatestRecord(records: StrategyRecord[], id: StrategyId): StrategyRecord | undefined {
    const forId = records.filter((r) => r.id === id);
    if (forId.length === 0) return undefined;
    const referencedVersionIds = new Set(
      forId.map((r) => r.previousVersionId).filter((v): v is string => v !== null),
    );
    return forId.find((r) => !referencedVersionIds.has(r.versionId));
  }

  private readFile(): StrategiesFileV2 | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    const v2Attempt = StrategiesFileV2Schema.safeParse(parsed);
    if (v2Attempt.success) {
      return v2Attempt.data;
    }

    const v1Attempt = StrategiesFileV1Schema.safeParse(parsed);
    if (v1Attempt.success) {
      const migrated = this.migrateV1ToV2(v1Attempt.data);
      this.writeAtomic(migrated);
      return migrated;
    }

    throw new Error(`Invalid strategies file: unable to parse as v1 or v2`);
  }

  private migrateV1ToV2(v1: z.infer<typeof StrategiesFileV1Schema>): StrategiesFileV2 {
    const strategies: StrategyRecord[] = v1.strategies.map((r) => ({
      ...r,
      versionId: crypto.randomUUID(),
    }));
    return { schemaVersion: 2, strategies };
  }

  private classifyError(e: unknown): RepositoryError {
    if (
      e instanceof SyntaxError ||
      (e instanceof Error && e.name === 'ZodError') ||
      (e instanceof Error && e.message.includes('Invalid strategies file'))
    ) {
      return { tag: 'RepositoryError', kind: 'parse', message: String(e) };
    }
    return { tag: 'RepositoryError', kind: 'io', message: String(e) };
  }

  private writeAtomic(data: StrategiesFileV2): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = `${this.filePath}.${String(Date.now())}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }
}
