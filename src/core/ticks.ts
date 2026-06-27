/**
 * Axis tick math (RESEARCH §6). Pure & Node-testable.
 */

/**
 * "Nice" evenly-spaced tick values spanning [min, max] at a human-friendly step
 * (1/2/5 × 10ⁿ), aiming for ~`count` ticks.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min === max ||
    count < 1
  ) {
    return [min];
  }
  const rawStep = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 1e-6; v += step) {
    ticks.push(v);
  }
  return ticks;
}
