/**
 * Lightweight timing marks for startup/interaction profiling.
 * Dev-only logging; in production the calls are near-zero-cost map writes.
 */
const marks = new Map<string, number>();

export function perfMark(name: string): void {
  marks.set(name, Date.now());
}

/** Milliseconds since a mark, or null if never marked. */
export function perfSince(name: string): number | null {
  const t = marks.get(name);
  return t === undefined ? null : Date.now() - t;
}

/** Dev-only one-line timing log. Silent in production builds. */
export function perfLog(label: string, ms: number | null): void {
  if (__DEV__) {
    console.log(`[Perf] ${label}: ${ms === null ? 'n/a' : `${ms}ms`}`);
  }
}
