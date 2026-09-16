export const PALETTE = {
  background: "#0a0e13",
  open: "#121a1b",
  openAlt: "#141d1e",
  tuft: "#1d2c29",
  pebble: "#222b30",
  rock: "#2a313b",
  rockLight: "#5d6776",
  rockEdge: "#151a20",
  spawn: "#1e1216",
  exit: "#15241d",
  exitMortar: "#0e1813",
  portal: "#f43f5e",
  core: "#4ade80",
  gridLine: "rgba(255, 255, 255, 0.03)",
  path: "rgba(230, 237, 243, 0.2)",
  valid: "rgba(163, 230, 53, 0.22)",
  invalid: "rgba(248, 113, 113, 0.28)",
  range: "rgba(230, 237, 243, 0.35)",
  shadow: "rgba(0, 0, 0, 0.35)",
  hpBack: "rgba(0, 0, 0, 0.6)",
  hp: "#4ade80",
  hpLow: "#f87171",
  slowed: "#67e8f9",
  gold: "#facc15",
  towerTop: "#344152",
  towerBase: "#19212b",
  selection: "#f8fafc",
  fallback: "#e5e7eb",
} as const;

const TOWER_COLORS: Readonly<Record<string, string>> = {
  bolt: "#a3e635",
  cannon: "#f59e0b",
  frost: "#22d3ee",
  spire: "#e879f9",
  arc: "#818cf8",
  mortar: "#d08c4a",
};

const ENEMY_COLORS: Readonly<Record<string, string>> = {
  runner: "#fb7185",
  grunt: "#fb923c",
  brute: "#ef4444",
  warden: "#a855f7",
  wisp: "#b9f5ec",
  mender: "#10b981",
  harrier: "#3b82f6",
  brood: "#9bbf3a",
  broodling: "#c3dc5c",
  tyrant: "#d6246e",
};

const BOSSES: ReadonlySet<string> = new Set(["warden", "tyrant"]);

/** The hero and everything it fires or casts. */
export const HERO_COLOR = "#5eead4";
export const HERO_GOLD = "#fde68a";

export const towerColor = (id: string): string => TOWER_COLORS[id] ?? PALETTE.fallback;
export const isBoss = (id: string): boolean => BOSSES.has(id);
export const enemyColor = (id: string): string => ENEMY_COLORS[id] ?? PALETTE.fallback;
