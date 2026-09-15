const HEX = /^#([0-9a-f]{6})$/i;

function channels(hex: string): readonly [number, number, number] {
  const match = HEX.exec(hex);
  if (!match?.[1]) throw new RangeError(`Expected a #rrggbb colour, got "${hex}".`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Linear blend of two #rrggbb colours; `t` 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const share = Math.min(1, Math.max(0, t));
  const from = channels(a);
  const to = channels(b);
  const hex = from
    .map((c, i) => Math.round(c + ((to[i] ?? c) - c) * share))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

export const lighten = (color: string, t: number): string => mix(color, "#ffffff", t);
export const darken = (color: string, t: number): string => mix(color, "#000000", t);

/** The same colour with an alpha channel, as rgba(). */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = channels(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}
