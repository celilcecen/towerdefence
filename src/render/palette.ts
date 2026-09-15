export const PALETTE = {
  background: "#0a0e13",
  open: "#111922",
  openAlt: "#131c26",
  rock: "#26303c",
  rockEdge: "#323e4c",
  spawn: "#3a1820",
  exit: "#14301f",
  gridLine: "rgba(255, 255, 255, 0.025)",
  path: "rgba(230, 237, 243, 0.22)",
  valid: "rgba(163, 230, 53, 0.22)",
  invalid: "rgba(248, 113, 113, 0.28)",
  range: "rgba(230, 237, 243, 0.35)",
  hpBack: "rgba(0, 0, 0, 0.6)",
  hp: "#4ade80",
  hpLow: "#f87171",
  slowed: "#67e8f9",
  towerBase: "#1a2430",
  selection: "#f8fafc",
  fallback: "#e5e7eb",
} as const;

const TOWER_COLORS: Readonly<Record<string, string>> = {
  bolt: "#a3e635",
  cannon: "#f59e0b",
  frost: "#22d3ee",
  spire: "#e879f9",
};

const ENEMY_COLORS: Readonly<Record<string, string>> = {
  runner: "#fb7185",
  grunt: "#fb923c",
  brute: "#ef4444",
  warden: "#c084fc",
};

const BOSSES: ReadonlySet<string> = new Set(["warden"]);

export const towerColor = (id: string): string => TOWER_COLORS[id] ?? PALETTE.fallback;
export const isBoss = (id: string): boolean => BOSSES.has(id);
export const enemyColor = (id: string): string => ENEMY_COLORS[id] ?? PALETTE.fallback;
