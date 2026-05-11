// tests/setup/jsdom-setup.ts
// Phase 2 plan 02-01, Task 3 — vitest `ui` project setup file.
// Loaded for tests under tests/ui/**.

import '@testing-library/jest-dom/vitest';

// Plan 02-07 Task 5 (Rule 3 deviation): jsdom does NOT expose
// TransformStream / ReadableStream / WritableStream globally, but Node 18+
// provides them under `node:stream/web`. The assistant-ui transport graph
// (eventsource-parser → assistant-stream → @assistant-ui/react-ai-sdk)
// references TransformStream at module init; without this polyfill the
// `import { transport } from '@/ui/runtime'` in tests/ui/streaming.spec.tsx
// crashes before any test runs. Idempotent — only assigns when missing.
import {
  TransformStream as NodeTransformStream,
  ReadableStream as NodeReadableStream,
  WritableStream as NodeWritableStream,
} from 'node:stream/web';

const g = globalThis as unknown as {
  TransformStream?: typeof NodeTransformStream;
  ReadableStream?: typeof NodeReadableStream;
  WritableStream?: typeof NodeWritableStream;
};
if (g.TransformStream === undefined) {
  g.TransformStream = NodeTransformStream;
}
if (g.ReadableStream === undefined) {
  g.ReadableStream = NodeReadableStream;
}
if (g.WritableStream === undefined) {
  g.WritableStream = NodeWritableStream;
}
