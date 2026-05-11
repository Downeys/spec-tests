interface AnyCapable {
  any?: (signals: readonly AbortSignal[]) => AbortSignal;
}

export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  const native = (AbortSignal as unknown as AnyCapable).any;
  if (typeof native === 'function') {
    return native([...signals]);
  }
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
    for (const s of signals) {
      s.removeEventListener('abort', abort);
    }
  };
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}
