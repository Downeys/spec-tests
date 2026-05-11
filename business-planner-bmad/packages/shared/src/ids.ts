export type Brand<T, B> = T & { readonly __brand: B };

export type UuidV4 = Brand<string, 'UuidV4'>;

export type ProjectId = Brand<string, 'ProjectId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type CheckpointId = Brand<string, 'CheckpointId'>;
export type DecisionId = Brand<string, 'DecisionId'>;

export type IsoUtcTimestamp = Brand<string, 'IsoUtcTimestamp'>;
