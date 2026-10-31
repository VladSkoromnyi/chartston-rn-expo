/**
 * Leading + trailing throttle (used for `onViewportChange`). Pure & Node-testable.
 *
 * The first call fires immediately; calls inside the window are coalesced and the
 * LATEST value fires once the window closes, so a listener always sees where the
 * viewport came to rest.
 */

export interface Throttled<T> {
  call(value: T): void;
  /** Drop any pending trailing call (on unmount). */
  cancel(): void;
}

export function throttleTrailing<T>(
  fn: (value: T) => void,
  ms: number,
  now: () => number = Date.now
): Throttled<T> {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;

  const fire = (value: T) => {
    last = now();
    pending = null;
    fn(value);
  };

  return {
    call(value) {
      const wait = ms - (now() - last);
      if (wait <= 0 && !timer) {
        fire(value);
        return;
      }
      pending = { value };
      if (!timer) {
        timer = setTimeout(
          () => {
            timer = null;
            if (pending) fire(pending.value);
          },
          Math.max(0, wait)
        );
      }
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
