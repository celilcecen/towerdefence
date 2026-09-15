import type { GameSession } from "../app/session";
import type { TargetingMode } from "../core/content-types";
import { TARGETING_MODES } from "../core/content-types";
import { currentLevel, nextLevel, sellValue } from "../core/state";
import { paintEnemyIcon, paintTowerIcon } from "../render/icons";
import { towerColor } from "../render/palette";
import { describeLevel, enemyProfile, towerRole, waveRoster } from "./describe";
import { h, requireElement, setAttr, setFlag, setText } from "./dom";

const TARGETING_LABELS: Readonly<Record<TargetingMode, string>> = {
  first: "First",
  last: "Last",
  strongest: "Strongest",
  closest: "Nearest",
};

const REPO_URL = "https://github.com/celilcecen/towerdefence";
const NOTICE_MS = 2600;
const DOCK_ICON = 40;
const LEGEND_ICON = 44;
const PREVIEW_ICON = 26;
const PANEL_ICON = 36;

/** Binds the DOM chrome (HUD, build dock, tower panel, overlay, notices) to the session. */
export class GameUi {
  private readonly lives: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly waveButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly speedButton: HTMLButtonElement;
  private readonly buildButtons = new Map<string, HTMLButtonElement>();
  private readonly dock: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelIcon: HTMLCanvasElement;
  private readonly panelTitle: HTMLElement;
  private readonly panelStats: HTMLElement;
  private readonly panelNext: HTMLElement;
  private readonly upgradeButton: HTMLButtonElement;
  private readonly sellButton: HTMLButtonElement;
  private readonly targetingButtons = new Map<TargetingMode, HTMLButtonElement>();
  private readonly overlay: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayText: HTMLElement;
  private readonly overlayIntro: HTMLElement;
  private readonly overlayRecord: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly wavePreview: HTMLElement;
  private readonly wavePreviewLabel: HTMLElement;
  private readonly wavePreviewList: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly notice: HTMLElement;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Keys of what was last painted, so canvases are only redrawn on change. */
  private previewKey = "";
  private panelIconKey = "";

  constructor(
    root: ParentNode,
    private readonly session: GameSession,
    private readonly pixelRatio: number,
  ) {
    this.lives = requireElement(root, "#lives", HTMLElement);
    this.gold = requireElement(root, "#gold", HTMLElement);
    this.wave = requireElement(root, "#wave", HTMLElement);
    this.waveButton = requireElement(root, "#next-wave", HTMLButtonElement);
    this.pauseButton = requireElement(root, "#pause", HTMLButtonElement);
    this.speedButton = requireElement(root, "#speed", HTMLButtonElement);
    this.dock = requireElement(root, "#build-dock", HTMLElement);
    this.panel = requireElement(root, "#tower-panel", HTMLElement);
    this.panelIcon = requireElement(root, "#panel-icon", HTMLCanvasElement);
    this.panelTitle = requireElement(root, "#panel-title", HTMLElement);
    this.panelStats = requireElement(root, "#panel-stats", HTMLElement);
    this.panelNext = requireElement(root, "#panel-next", HTMLElement);
    this.upgradeButton = requireElement(root, "#upgrade", HTMLButtonElement);
    this.sellButton = requireElement(root, "#sell", HTMLButtonElement);
    this.overlay = requireElement(root, "#overlay", HTMLElement);
    this.overlayTitle = requireElement(root, "#overlay-title", HTMLElement);
    this.overlayText = requireElement(root, "#overlay-text", HTMLElement);
    this.overlayIntro = requireElement(root, "#overlay-intro", HTMLElement);
    this.overlayRecord = requireElement(root, "#overlay-record", HTMLElement);
    this.playButton = requireElement(root, "#play", HTMLButtonElement);
    this.wavePreview = requireElement(root, "#wave-preview", HTMLElement);
    this.wavePreviewLabel = requireElement(root, "#wave-preview-label", HTMLElement);
    this.wavePreviewList = requireElement(root, "#wave-preview-list", HTMLElement);
    this.hint = requireElement(root, "#hint", HTMLElement);
    this.notice = requireElement(root, "#notice", HTMLElement);

    this.buildDock();
    this.buildLegend(
      requireElement(root, "#legend-towers", HTMLElement),
      requireElement(root, "#legend-enemies", HTMLElement),
    );
    this.buildTargeting(requireElement(root, "#targeting", HTMLElement));
    requireElement(root, "#repo-link", HTMLAnchorElement).href = REPO_URL;

    this.waveButton.addEventListener("click", () => {
      session.startWave();
    });
    this.pauseButton.addEventListener("click", () => {
      session.togglePause();
    });
    this.speedButton.addEventListener("click", () => {
      session.cycleSpeed();
    });
    this.upgradeButton.addEventListener("click", () => {
      session.upgradeSelected();
    });
    this.sellButton.addEventListener("click", () => {
      session.sellSelected();
    });
    requireElement(root, "#panel-close", HTMLButtonElement).addEventListener("click", () => {
      session.cancel();
    });
    this.playButton.addEventListener("click", () => {
      session.play();
    });
    session.events.on("notice", ({ message }) => {
      this.showNotice(message);
    });
  }

  render(): void {
    const { session } = this;
    const sim = session.simulation;
    const world = sim.world;
    const totalWaves = sim.content.waves.length;

    setText(this.lives, String(world.lives));
    setText(this.gold, String(world.gold));
    setText(this.wave, `${world.wavesStarted}/${totalWaves}`);

    const canStart = session.started && world.phase === "building";
    setFlag(this.waveButton, "disabled", !canStart);
    setText(
      this.waveButton,
      world.phase === "wave"
        ? "Wave in progress"
        : `Start wave ${Math.min(world.wavesStarted + 1, totalWaves)}`,
    );
    setText(this.pauseButton, session.paused ? "Resume" : "Pause");
    setAttr(this.pauseButton, "aria-pressed", String(session.paused));
    setText(this.speedButton, `${session.speed}×`);

    for (const [id, button] of this.buildButtons) {
      const selected = session.selection.kind === "build" && session.selection.tower === id;
      setAttr(button, "aria-pressed", String(selected));
      setFlag(button, "data-unaffordable", world.gold < sim.content.tower(id).levels[0].cost);
    }

    this.renderPanel();
    this.renderWavePreview();
    this.renderHint();
    this.renderOverlay();
  }

  private renderPanel(): void {
    const tower = this.session.selectedTower;
    setFlag(this.panel, "hidden", !tower);
    setFlag(this.dock, "hidden", Boolean(tower));
    if (!tower) return;

    const sim = this.session.simulation;
    const level = currentLevel(tower);
    const upgrade = nextLevel(tower);
    const iconKey = `${tower.def.id}:${tower.level}`;
    if (iconKey !== this.panelIconKey) {
      this.panelIconKey = iconKey;
      paintTowerIcon(this.panelIcon, tower.def.id, PANEL_ICON, this.pixelRatio, tower.level);
    }
    setText(
      this.panelTitle,
      `${tower.def.name} · level ${tower.level + 1}/${tower.def.levels.length}`,
    );
    setText(this.panelStats, describeLevel(level));
    setText(this.panelNext, upgrade ? `Next: ${describeLevel(upgrade)}` : "Fully upgraded");
    setText(this.upgradeButton, upgrade ? `Upgrade · ${upgrade.cost}g` : "Max level");
    setFlag(this.upgradeButton, "disabled", !upgrade || sim.world.gold < upgrade.cost);
    setText(this.sellButton, `Sell · +${sellValue(tower, sim.content.rules.sellRefundRatio)}g`);
    for (const [mode, button] of this.targetingButtons) {
      setAttr(button, "aria-pressed", String(tower.targeting === mode));
    }
  }

  /** Shows who is coming next while the player is still building. */
  private renderWavePreview(): void {
    const { session } = this;
    const sim = session.simulation;
    const index = sim.world.wavesStarted;
    const next = sim.content.waves[index];
    const visible = session.started && sim.world.phase === "building" && next !== undefined;
    setFlag(this.wavePreview, "hidden", !visible);
    if (!visible) return;

    const roster = waveRoster(next);
    const key = `${index}:${roster.map((e) => `${e.enemy}${e.count}`).join(",")}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    setText(this.wavePreviewLabel, `Wave ${index + 1}`);
    this.wavePreviewList.replaceChildren(
      ...roster.map((entry) => {
        const enemy = sim.content.enemy(entry.enemy);
        const icon = h("canvas", { className: "preview-icon", attrs: { "aria-hidden": "true" } });
        paintEnemyIcon(icon, enemy, PREVIEW_ICON, this.pixelRatio);
        return h("span", { className: "preview-entry", attrs: { title: enemy.name } }, [
          icon,
          h("span", { text: String(entry.count) }),
          h("span", { className: "preview-name", text: ` ${enemy.name}` }),
        ]);
      }),
    );
  }

  /** A single next step for players who have not built anything yet. */
  private renderHint(): void {
    const { session } = this;
    const world = session.simulation.world;
    let text = "";
    if (session.started && world.wavesStarted === 0) {
      if (session.selection.kind === "build") text = "Tap an empty tile to build. Green means OK.";
      else if (world.towers.length === 0) text = "Pick a tower below, then tap a tile to build it.";
      else text = "Enemies will walk around your towers. Start the wave when ready.";
    }
    setText(this.hint, text);
    setFlag(this.hint, "hidden", text === "");
  }

  private renderOverlay(): void {
    const { session } = this;
    const result = session.lastResult;
    const visible = !session.started || result !== undefined;
    setFlag(this.overlay, "hidden", !visible);
    if (!visible) return;

    setFlag(this.overlayIntro, "hidden", result !== undefined);
    const best = session.best;
    setText(
      this.overlayRecord,
      best
        ? `Best: ${best.won ? `victory with ${best.lives} lives` : `reached wave ${best.wave}`}`
        : "",
    );

    if (result) {
      setText(this.overlayTitle, result.won ? "Victory" : "Overrun");
      setText(
        this.overlayText,
        result.won
          ? `All ${session.simulation.content.waves.length} waves held with ${result.lives} lives left.${result.newRecord ? " New best!" : ""}`
          : `The maze fell on wave ${result.wave}.${result.newRecord ? " New best!" : ""}`,
      );
      setText(this.playButton, "Play again");
    }
  }

  private buildDock(): void {
    for (const tower of this.session.simulation.content.towers) {
      const icon = h("canvas", { className: "build-icon", attrs: { "aria-hidden": "true" } });
      paintTowerIcon(icon, tower.id, DOCK_ICON, this.pixelRatio);
      const button = h(
        "button",
        {
          className: "build-card",
          attrs: { type: "button", "aria-pressed": "false", title: tower.summary },
        },
        [
          icon,
          h("span", { className: "build-name", text: tower.name }),
          h("span", { className: "build-meta" }, [
            h("span", { className: "build-cost", text: `${tower.levels[0].cost}g` }),
            h("span", { className: "build-role", text: ` · ${towerRole(tower)}` }),
          ]),
          h("kbd", { text: tower.hotkey, attrs: { "aria-label": `Hotkey ${tower.hotkey}` } }),
        ],
      );
      button.style.setProperty("--tower", towerColor(tower.id));
      button.addEventListener("click", () => {
        this.session.selectBuild(tower.id);
      });
      this.buildButtons.set(tower.id, button);
      this.dock.append(button);
    }
  }

  private buildLegend(towers: HTMLElement, enemies: HTMLElement): void {
    const { content } = this.session.simulation;
    const item = (icon: HTMLCanvasElement, name: string, detail: string): HTMLLIElement =>
      h("li", { className: "legend-item" }, [
        icon,
        h("span", { className: "legend-text" }, [
          h("strong", { text: name }),
          h("span", { text: detail }),
        ]),
      ]);

    for (const tower of content.towers) {
      const icon = h("canvas", { className: "legend-icon", attrs: { "aria-hidden": "true" } });
      paintTowerIcon(icon, tower.id, LEGEND_ICON, this.pixelRatio);
      towers.append(item(icon, tower.name, `${towerRole(tower)} · ${tower.levels[0].cost}g`));
    }
    // Enemies in the order the player will meet them.
    const roster = [
      ...new Set(content.waves.flatMap((w) => w.groups.map((g) => content.enemy(g.enemy)))),
    ];
    for (const enemy of roster) {
      const icon = h("canvas", { className: "legend-icon", attrs: { "aria-hidden": "true" } });
      paintEnemyIcon(icon, enemy, LEGEND_ICON, this.pixelRatio);
      enemies.append(item(icon, enemy.name, enemyProfile(enemy, roster).traits.join(" · ")));
    }
  }

  private buildTargeting(container: HTMLElement): void {
    for (const mode of TARGETING_MODES) {
      const button = h("button", {
        className: "segment",
        text: TARGETING_LABELS[mode],
        attrs: { type: "button", "aria-pressed": "false" },
      });
      button.addEventListener("click", () => {
        this.session.setTargeting(mode);
      });
      this.targetingButtons.set(mode, button);
      container.append(button);
    }
  }

  private showNotice(message: string): void {
    setText(this.notice, message);
    setFlag(this.notice, "hidden", false);
    if (this.noticeTimer !== undefined) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      setFlag(this.notice, "hidden", true);
    }, NOTICE_MS);
  }
}
