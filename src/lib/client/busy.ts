'use client';
// App-wide "working…" counter behind the full-screen loader. Saves, deletes, PDF downloads and printing
// call track(); the loader appears only if the work takes longer than a moment (see GlobalLoader).
let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const busyCount = () => count;
export function subscribeBusy(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Wrap a promise so the global loader shows while it runs. */
export async function track<T>(work: Promise<T>): Promise<T> {
  count++;
  emit();
  try {
    return await work;
  } finally {
    count = Math.max(0, count - 1);
    emit();
  }
}
