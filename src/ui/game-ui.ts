import type { GameSession } from "../app/session";
import type { AttackSpec, TargetingMode, TowerLevel } from "../core/content-types";
import { TARGETING_MODES } from "../core/content-types";
import { currentLevel, nextLevel, sellValue } from "../core/state";
import { towerColor } from "../render/palette";
import { h, requireElement, setAttr, setFlag, setText } from "./dom";

const TARGETING_LABELS: Readonly<Record<TargetingMode, string>> = {
  first: "First",
  last: "Last",
  strongest: "Strongest",
  closest: "Nearest",
};

const REPO_URL = "https://github.com/celilcecen/towerdefence";
const NOTICE_MS = 2600;

function describeAttack(attack: AttackSpec): string {
  switch (attack.kind) {
    case "projectile":
      return attack.splashRadius > 0 ? `${attack.damage} splash` : `${attack.damage} dmg`;
    case "beam":
      return `${attack.damage} beam`;
    case "pulse":
      return `${attack.damage} dmg, slow ${Math.round((1 - attack.slow.factor) * 100)}%`;
  }
}

function describeLevel(level: TowerLevel): string {
  return `${describeAttack(level.attack)} · range ${level.range} · ${(1 / level.cooldown).toFixed(1)}/s`;
}

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
  private readonly panelTitle: HTMLElement;
  private readonly panelStats: HTMLElement;
  private readonly panelNext: HTMLElement;
  private readonly upgradeButton: HTMLButtonElement;
  private readonly sellButton: HTMLButtonElement;
  private readonly targetingButtons = new Map<TargetingMode, HTMLButtonElement>();
  private readonly overlay: HTMLElement;
  private readonly overlayTitle: HTMLElement;
  private readonly overlayText: HTMLElement;
  private readonly overlayRecord: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly notice: HTMLElement;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    root: ParentNode,
    private readonly session: GameSession,
  ) {
    this.lives = requireElement(root, "#lives", HTMLElement);
    this.gold = requireElement(root, "#gold", HTMLElement);
    this.wave = requireElement(root, "#wave", HTMLElement);
    this.waveButton = requireElement(root, "#next-wave", HTMLButtonElement);
    this.pauseButton = requireElement(root, "#pause", HTMLButtonElement);
    this.speedButton = requireElement(root, "#speed", HTMLButtonElement);
    this.dock = requireElement(root, "#build-dock", HTMLElement);
    this.panel = requireElement(root, "#tower-panel", HTMLElement);
    this.panelTitle = requireElement(root, "#panel-title", HTMLElement);
    this.panelStats = requireElement(root, "#panel-stats", HTMLElement);
    this.panelNext = requireElement(root, "#panel-next", HTMLElement);
    this.upgradeButton = requireElement(root, "#upgrade", HTMLButtonElement);
    this.sellButton = requireElement(root, "#sell", HTMLButtonElement);
    this.overlay = requireElement(root, "#overlay", HTMLElement);
    this.overlayTitle = requireElement(root, "#overlay-title", HTMLElement);
    this.overlayText = requireElement(root, "#overlay-text", HTMLElement);
    this.overlayRecord = requireElement(root, "#overlay-record", HTMLElement);
    this.playButton = requireElement(root, "#play", HTMLButtonElement);
    this.notice = requireElement(root, "#notice", HTMLElement);

    this.buildDock();
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

  private renderOverlay(): void {
    const { session } = this;
    const result = session.lastResult;
    const visible = !session.started || result !== undefined;
    setFlag(this.overlay, "hidden", !visible);
    if (!visible) return;

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
      const button = h(
        "button",
        {
          className: "build-card",
          attrs: { type: "button", "aria-pressed": "false", title: tower.summary },
        },
        [
          h("span", {
            className: "swatch",
            attrs: { "data-tower": tower.id, "aria-hidden": "true" },
          }),
          h("span", { className: "build-name", text: tower.name }),
          h("span", { className: "build-cost", text: `${tower.levels[0].cost}g` }),
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
