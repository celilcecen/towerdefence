import type { GameApp } from "../app/game-app";
import type { ContentRegistry } from "../core/content-registry";
import type { TargetingMode } from "../core/content-types";
import { TARGETING_MODES } from "../core/content-types";
import { currentLevel, nextLevel, sellValue } from "../core/state";
import type { Strings } from "../i18n";
import { enemyName, powerName, towerName } from "../i18n";
import { paintEnemyIcon, paintPowerIcon, paintTowerIcon } from "../render/icons";
import { towerColor } from "../render/palette";
import { describeLevel, towerRole, waveRoster } from "./describe";
import { h, requireElement, setAttr, setFlag, setText } from "./dom";

const NOTICE_MS = 2600;
const DOCK_ICON = 40;
const PREVIEW_ICON = 26;
const PANEL_ICON = 36;
const POWER_ICON = 34;
/** Keyboard shortcuts for powers, in the order the level lists them. */
export const POWER_KEYS: readonly string[] = ["q", "e"];

interface PowerButton {
  readonly button: HTMLButtonElement;
  readonly time: HTMLElement;
  readonly cooldown: number;
  lastCool: string;
}

/** Binds the in-game chrome (HUD, build dock, powers, tower panel, notices) to the app. */
export class GameHud {
  private readonly lives: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly waveButton: HTMLButtonElement;
  private readonly speedButton: HTMLButtonElement;
  private readonly dock: HTMLElement;
  private readonly powers: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelIcon: HTMLCanvasElement;
  private readonly panelTitle: HTMLElement;
  private readonly panelStats: HTMLElement;
  private readonly panelNext: HTMLElement;
  private readonly upgradeButton: HTMLButtonElement;
  private readonly sellButton: HTMLButtonElement;
  private readonly targetingButtons = new Map<TargetingMode, HTMLButtonElement>();
  private readonly wavePreview: HTMLElement;
  private readonly wavePreviewLabel: HTMLElement;
  private readonly wavePreviewList: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly buildButtons = new Map<string, HTMLButtonElement>();
  private readonly powerButtons = new Map<string, PowerButton>();
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** What the dock and powers were last built for, so they are rebuilt only on change. */
  private builtFor: { readonly content: ContentRegistry; readonly t: Strings } | undefined;
  private previewKey = "";
  private panelIconKey = "";

  constructor(
    root: ParentNode,
    private readonly app: GameApp,
    private readonly pixelRatio: number,
    private t: Strings,
  ) {
    this.lives = requireElement(root, "#lives", HTMLElement);
    this.gold = requireElement(root, "#gold", HTMLElement);
    this.wave = requireElement(root, "#wave", HTMLElement);
    this.waveButton = requireElement(root, "#next-wave", HTMLButtonElement);
    this.speedButton = requireElement(root, "#speed", HTMLButtonElement);
    this.dock = requireElement(root, "#build-dock", HTMLElement);
    this.powers = requireElement(root, "#powers", HTMLElement);
    this.panel = requireElement(root, "#tower-panel", HTMLElement);
    this.panelIcon = requireElement(root, "#panel-icon", HTMLCanvasElement);
    this.panelTitle = requireElement(root, "#panel-title", HTMLElement);
    this.panelStats = requireElement(root, "#panel-stats", HTMLElement);
    this.panelNext = requireElement(root, "#panel-next", HTMLElement);
    this.upgradeButton = requireElement(root, "#upgrade", HTMLButtonElement);
    this.sellButton = requireElement(root, "#sell", HTMLButtonElement);
    this.wavePreview = requireElement(root, "#wave-preview", HTMLElement);
    this.wavePreviewLabel = requireElement(root, "#wave-preview-label", HTMLElement);
    this.wavePreviewList = requireElement(root, "#wave-preview-list", HTMLElement);
    this.hint = requireElement(root, "#hint", HTMLElement);
    this.notice = requireElement(root, "#notice", HTMLElement);

    const { session } = app;
    this.buildTargeting(requireElement(root, "#targeting", HTMLElement));
    requireElement(root, "#menu-button", HTMLButtonElement).addEventListener("click", () => {
      app.openOverlay("pause");
    });
    this.waveButton.addEventListener("click", () => {
      session.startWave();
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
  }

  setStrings(t: Strings): void {
    this.t = t;
    this.builtFor = undefined;
    this.previewKey = "";
    this.panelIconKey = "";
    for (const [mode, button] of this.targetingButtons) setText(button, t.panel.targets[mode]);
  }

  showNotice(message: string): void {
    setText(this.notice, message);
    setFlag(this.notice, "hidden", false);
    if (this.noticeTimer !== undefined) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      setFlag(this.notice, "hidden", true);
    }, NOTICE_MS);
  }

  render(): void {
    const { app, t } = this;
    const { session } = app;
    if (this.builtFor?.content !== session.content || this.builtFor.t !== t) this.rebuild();

    const sim = session.simulation;
    const world = sim.world;
    const totalWaves = sim.content.waves.length;

    setText(this.lives, String(world.lives));
    setText(this.gold, String(world.gold));
    setText(this.wave, `${world.wavesStarted}/${totalWaves}`);

    const canStart = session.started && !session.paused && sim.canStartWave;
    setFlag(this.waveButton, "disabled", !canStart);
    let waveLabel = t.hud.startWave(Math.min(world.wavesStarted + 1, totalWaves));
    if (world.phase === "wave") {
      const next = sim.content.waves[world.wavesStarted];
      waveLabel =
        canStart && next
          ? t.hud.callEarly(Math.floor(next.clearBonus * sim.content.rules.earlyCallRatio))
          : t.hud.waveRunning;
    }
    setText(this.waveButton, waveLabel);
    setAttr(this.waveButton, "data-early", String(world.phase === "wave" && canStart));
    setText(this.speedButton, `${session.speed}×`);

    for (const [id, button] of this.buildButtons) {
      const selected = session.selection.kind === "build" && session.selection.tower === id;
      setAttr(button, "aria-pressed", String(selected));
      setFlag(button, "data-unaffordable", world.gold < sim.content.tower(id).levels[0].cost);
    }

    this.renderPowers();
    this.renderPanel();
    this.renderWavePreview();
    this.renderHint();
  }

  private rebuild(): void {
    const { content } = this.app.session;
    this.builtFor = { content, t: this.t };
    this.previewKey = "";
    this.buildDock(content);
    this.buildPowers(content);
  }

  private renderPowers(): void {
    const { session } = this.app;
    const active = session.started && session.simulation.world.phase === "wave";
    setFlag(this.powers, "hidden", this.powerButtons.size === 0);
    for (const [id, entry] of this.powerButtons) {
      const cooldown = session.powerState(id)?.cooldown ?? 0;
      const cool = (cooldown / entry.cooldown).toFixed(3);
      if (cool !== entry.lastCool) {
        entry.lastCool = cool;
        entry.button.style.setProperty("--cool", cool);
      }
      const ready = cooldown <= 0;
      setText(entry.time, ready ? "" : String(Math.ceil(cooldown)));
      setFlag(entry.button, "data-ready", ready && active);
      setFlag(entry.button, "disabled", !active || !ready);
      const aiming = session.selection.kind === "power" && session.selection.power === id;
      setAttr(entry.button, "aria-pressed", String(aiming));
    }
  }

  private renderPanel(): void {
    const { t } = this;
    const { session } = this.app;
    const tower = session.selectedTower;
    setFlag(this.panel, "hidden", !tower);
    setFlag(this.dock, "hidden", Boolean(tower));
    if (!tower) return;

    const sim = session.simulation;
    const level = currentLevel(tower);
    const upgrade = nextLevel(tower);
    const iconKey = `${tower.def.id}:${tower.level}`;
    if (iconKey !== this.panelIconKey) {
      this.panelIconKey = iconKey;
      paintTowerIcon(this.panelIcon, tower.def.id, PANEL_ICON, this.pixelRatio, tower.level);
    }
    const name = towerName(t, tower.def.id, tower.def.name);
    setText(this.panelTitle, t.panel.title(name, tower.level + 1, tower.def.levels.length));
    setText(this.panelStats, describeLevel(t, level, tower.def));
    setText(this.panelNext, upgrade ? t.panel.next(describeLevel(t, upgrade)) : t.panel.maxed);
    setText(this.upgradeButton, upgrade ? t.panel.upgrade(upgrade.cost) : t.panel.maxLevel);
    setFlag(this.upgradeButton, "disabled", !upgrade || sim.world.gold < upgrade.cost);
    setText(this.sellButton, t.panel.sell(sellValue(tower, sim.content.rules.sellRefundRatio)));
    for (const [mode, button] of this.targetingButtons) {
      setAttr(button, "aria-pressed", String(tower.targeting === mode));
    }
  }

  /** Shows who is coming next whenever the player could start that wave. */
  private renderWavePreview(): void {
    const { session } = this.app;
    const sim = session.simulation;
    const index = sim.world.wavesStarted;
    const next = sim.content.waves[index];
    const visible = session.started && sim.canStartWave && next !== undefined;
    setFlag(this.wavePreview, "hidden", !visible);
    if (!visible) return;

    const roster = waveRoster(next);
    const key = `${index}:${roster.map((e) => `${e.enemy}${e.count}`).join(",")}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    setText(this.wavePreviewLabel, this.t.hud.waveLabel(index + 1));
    this.wavePreviewList.replaceChildren(
      ...roster.map((entry) => {
        const enemy = sim.content.enemy(entry.enemy);
        const name = enemyName(this.t, enemy.id, enemy.name);
        const icon = h("canvas", { className: "preview-icon", attrs: { "aria-hidden": "true" } });
        paintEnemyIcon(icon, enemy, PREVIEW_ICON, this.pixelRatio);
        return h("span", { className: "preview-entry", attrs: { title: name } }, [
          icon,
          h("span", { text: String(entry.count) }),
          h("span", { className: "preview-name", text: ` ${name}` }),
        ]);
      }),
    );
  }

  /** A single next step for players who have not started a wave yet. */
  private renderHint(): void {
    const { session } = this.app;
    const { t } = this;
    const world = session.simulation.world;
    let text = "";
    if (session.started && world.wavesStarted === 0) {
      if (session.selection.kind === "build") text = t.hints.tapTile;
      else if (world.towers.length === 0) text = t.hints.pickTower;
      else text = t.hints.startWhenReady;
    }
    setText(this.hint, text);
    setFlag(this.hint, "hidden", text === "");
  }

  private buildDock(content: ContentRegistry): void {
    const { t } = this;
    this.buildButtons.clear();
    const cards = content.towers.map((tower) => {
      const icon = h("canvas", { className: "build-icon", attrs: { "aria-hidden": "true" } });
      paintTowerIcon(icon, tower.id, DOCK_ICON, this.pixelRatio);
      const name = towerName(t, tower.id, tower.name);
      const summary = t.towers[tower.id]?.summary ?? tower.summary;
      const button = h(
        "button",
        {
          className: "build-card",
          attrs: { type: "button", "aria-pressed": "false", title: summary, "data-tower": tower.id },
        },
        [
          icon,
          h("span", { className: "build-name", text: name }),
          h("span", { className: "build-meta" }, [
            h("span", { className: "build-cost", text: `${tower.levels[0].cost}g` }),
            h("span", { className: "build-role", text: ` · ${towerRole(t, tower)}` }),
          ]),
          h("kbd", { text: tower.hotkey, attrs: { "aria-label": t.hud.hotkey(tower.hotkey) } }),
        ],
      );
      button.style.setProperty("--tower", towerColor(tower.id));
      button.addEventListener("click", () => {
        this.app.session.selectBuild(tower.id);
      });
      this.buildButtons.set(tower.id, button);
      return button;
    });
    this.dock.replaceChildren(...cards);
  }

  private buildPowers(content: ContentRegistry): void {
    const { t } = this;
    this.powerButtons.clear();
    const buttons = content.powers.map((power, i) => {
      const icon = h("canvas", { className: "power-icon", attrs: { "aria-hidden": "true" } });
      paintPowerIcon(icon, power.id, POWER_ICON, this.pixelRatio);
      const time = h("span", { className: "power-time", attrs: { "aria-hidden": "true" } });
      const name = powerName(t, power.id, power.name);
      const key = POWER_KEYS[i];
      const button = h(
        "button",
        {
          className: "power",
          attrs: {
            type: "button",
            "aria-pressed": "false",
            "aria-label": name,
            title: t.powers[power.id]?.summary ?? power.summary,
            ...(key ? { "aria-keyshortcuts": key.toUpperCase() } : {}),
          },
        },
        [icon, time, h("span", { className: "power-name", text: name })],
      );
      button.addEventListener("click", () => {
        this.app.session.selectPower(power.id);
      });
      this.powerButtons.set(power.id, { button, time, cooldown: power.cooldown, lastCool: "" });
      return button;
    });
    this.powers.replaceChildren(...buttons);
  }

  private buildTargeting(container: HTMLElement): void {
    for (const mode of TARGETING_MODES) {
      const button = h("button", {
        className: "segment",
        text: this.t.panel.targets[mode],
        attrs: { type: "button", "aria-pressed": "false" },
      });
      button.addEventListener("click", () => {
        this.app.session.setTargeting(mode);
      });
      this.targetingButtons.set(mode, button);
      container.append(button);
    }
  }
}
