import type { GameApp, GameResult, Overlay } from "../app/game-app";
import type { Language } from "../app/settings";
import { LANGUAGES } from "../app/settings";
import { findLevel, introducedIn } from "../core/campaign";
import type { ContentRegistry } from "../core/content-registry";
import { totalStars } from "../core/progress";
import type { Strings } from "../i18n";
import { enemyName, powerName, stringsFor, towerName } from "../i18n";
import { paintEnemyIcon, paintPowerIcon, paintTowerIcon } from "../render/icons";
import { enemyProfile, rosterOf, towerRole } from "./describe";
import { h, requireElement, setAttr, setFlag, setText } from "./dom";

const REPO_URL = "https://github.com/celilcecen/towerdefence";
const LEGEND_ICON = 44;
const NEW_ICON = 40;
const RESET_CONFIRM_MS = 5000;
const STAR_DELAY_MS = 380;

const CHAPTER_COLORS: Readonly<Record<string, string>> = {
  meadow: "#a3e635",
  frost: "#67e8f9",
  ash: "#fb923c",
  rift: "#c084fc",
};

export interface ScreenHooks {
  readonly version: string;
  readonly notify: (message: string) => void;
  /** Called as each earned star appears, so audio and haptics can follow the animation. */
  readonly onStar?: (index: number) => void;
}

const stars = (earned: number): string => "★".repeat(earned) + "☆".repeat(3 - earned);

/**
 * Binds the menus and dialogs around the game (home, campaign map, briefing,
 * results, pause, settings, how to play) to the app. Each view is rebuilt
 * only when what it shows changes; switching is a hidden-attribute toggle.
 */
export class ScreensUi {
  private readonly appRoot: HTMLElement;
  private readonly screens: Readonly<Record<string, HTMLElement>>;
  private readonly overlays: Readonly<Partial<Record<Overlay, HTMLElement>>>;
  private readonly keys = new Map<string, unknown>();
  private lastView = "";
  private resetArmedUntil = 0;

  constructor(
    private readonly root: Document,
    private readonly app: GameApp,
    private readonly pixelRatio: number,
    private t: Strings,
    private readonly hooks: ScreenHooks,
  ) {
    const el = <T extends Element>(selector: string, type: abstract new () => T): T =>
      requireElement(root, selector, type);
    this.appRoot = el("#app", HTMLElement);
    this.screens = {
      home: el("#screen-home", HTMLElement),
      map: el("#screen-map", HTMLElement),
      briefing: el("#screen-briefing", HTMLElement),
      result: el("#screen-result", HTMLElement),
    };
    this.overlays = {
      pause: el("#overlay-pause", HTMLElement),
      settings: el("#overlay-settings", HTMLElement),
      help: el("#overlay-help", HTMLElement),
    };
    el("#repo-link", HTMLAnchorElement).href = REPO_URL;

    const click = (selector: string, action: () => void): void => {
      el(selector, HTMLButtonElement).addEventListener("click", action);
    };
    click("#home-continue", () => {
      app.continueCampaign();
    });
    click("#home-campaign", () => {
      app.openMap();
    });
    click("#home-classic", () => {
      app.startClassic();
    });
    click("#home-help", () => {
      app.openOverlay("help");
    });
    click("#home-settings", () => {
      app.openOverlay("settings");
    });
    click("#map-back", () => {
      app.goHome();
    });
    click("#brief-back", () => {
      app.openMap();
    });
    click("#brief-start", () => {
      app.startBriefedLevel();
    });
    click("#result-next", () => {
      app.nextLevel();
    });
    click("#result-retry", () => {
      app.retry();
    });
    click("#result-exit", () => {
      app.quit();
    });
    click("#pause-resume", () => {
      app.closeOverlay();
    });
    click("#pause-restart", () => {
      app.retry();
    });
    click("#pause-settings", () => {
      app.openOverlay("settings");
    });
    click("#pause-quit", () => {
      app.quit();
    });
    click("#help-close", () => {
      app.closeOverlay();
    });
    click("#set-close", () => {
      app.closeOverlay();
    });
    click("#set-reset", () => {
      this.reset();
    });
    this.bindSettings();
  }

  setStrings(t: Strings): void {
    this.t = t;
    this.keys.clear();
  }

  render(): void {
    const { app } = this;
    const screen = app.screen;
    setAttr(this.appRoot, "data-screen", screen.kind);
    for (const [kind, element] of Object.entries(this.screens)) {
      setFlag(element, "hidden", kind !== screen.kind);
    }
    const overlay = app.overlay;
    for (const [kind, element] of Object.entries(this.overlays)) {
      setFlag(element, "hidden", kind !== overlay);
    }

    switch (screen.kind) {
      case "home":
        this.renderHome();
        break;
      case "map":
        this.renderMap();
        break;
      case "briefing":
        this.renderBriefing(screen.levelId);
        break;
      case "result":
        this.renderResult(screen.result);
        break;
      case "game":
        break;
    }
    if (overlay === "pause") this.renderPause();
    if (overlay === "settings") this.renderSettings();
    if (overlay === "help") this.renderHelp(app.session.content);

    this.moveFocus(`${screen.kind}:${overlay ?? ""}`);
  }

  /** Runs `build` only when `value` differs from what `slot` last showed. */
  private changed(slot: string, value: unknown): boolean {
    if (this.keys.get(slot) === value) return false;
    this.keys.set(slot, value);
    return true;
  }

  /** Keyboard and screen reader users land on the new view's main action. */
  private moveFocus(view: string): void {
    if (view === this.lastView) return;
    this.lastView = view;
    if (view === "game:") return;
    const overlay = this.app.overlay;
    const container = overlay ? this.overlays[overlay] : this.screens[this.app.screen.kind];
    const target = container?.querySelector<HTMLElement>(
      "button.primary:not([hidden]):not(:disabled), button:not([hidden]):not(:disabled)",
    );
    target?.focus({ preventScroll: true });
  }

  private renderHome(): void {
    const { app, t } = this;
    const earned = totalStars(app.progress);
    const best = app.classicBest;
    const continueId = app.continueLevelId;
    const key = `${t.locale}|${earned}|${continueId ?? ""}|${JSON.stringify(best)}`;
    if (!this.changed("home", key)) return;

    const continueButton = requireElement(this.root, "#home-continue", HTMLButtonElement);
    const campaignButton = requireElement(this.root, "#home-campaign", HTMLButtonElement);
    const ref = continueId ? findLevel(app.campaign, continueId) : undefined;
    const showContinue = earned > 0 && ref !== undefined;
    setFlag(continueButton, "hidden", !showContinue);
    campaignButton.classList.toggle("primary", !showContinue);
    if (ref) {
      const name = t.levels[ref.level.id]?.name ?? ref.level.map.name;
      setText(
        requireElement(this.root, "#home-continue-level", HTMLElement),
        `${ref.index + 1}. ${name}`,
      );
    }
    const total = app.levels.length * 3;
    setText(requireElement(this.root, "#home-stars", HTMLElement), t.home.stars(earned, total));
    setText(
      requireElement(this.root, "#home-classic-best", HTMLElement),
      best
        ? t.result.best(best.won ? t.result.bestWon(best.lives) : t.result.bestWave(best.wave))
        : t.home.classicHint,
    );
  }

  private renderMap(): void {
    const { app, t } = this;
    const key = `${t.locale}|${JSON.stringify(app.progress)}`;
    if (!this.changed("map", key)) return;

    const total = app.levels.length * 3;
    setText(
      requireElement(this.root, "#map-stars", HTMLElement),
      t.home.stars(totalStars(app.progress), total),
    );
    let focusTarget: HTMLButtonElement | undefined;
    const chapters = app.campaign.chapters.map((chapter, c) => {
      const text = t.chapters[chapter.id];
      const levels = chapter.levels.map((level) => {
        const ref = findLevel(app.campaign, level.id);
        const number = (ref?.index ?? 0) + 1;
        const name = t.levels[level.id]?.name ?? level.map.name;
        const earned = app.progress.levels[level.id]?.stars ?? 0;
        const unlocked = app.isUnlocked(level.id);
        const button = h(
          "button",
          {
            className: "level-node",
            attrs: {
              type: "button",
              "aria-label": unlocked
                ? t.map.levelLabel(number, name, earned)
                : `${t.map.levelLabel(number, name, 0)} · ${t.map.locked}`,
            },
          },
          [
            h("span", { className: "level-number", text: unlocked ? String(number) : "🔒" }),
            h("span", { className: "level-name", text: name }),
            h("span", {
              className: "level-stars",
              text: unlocked ? stars(earned) : "",
              attrs: { "aria-hidden": "true" },
            }),
          ],
        );
        button.disabled = !unlocked;
        setFlag(button, "data-won", earned > 0);
        if (unlocked && earned === 0 && !focusTarget) focusTarget = button;
        button.addEventListener("click", () => {
          app.openBriefing(level.id);
        });
        return button;
      });
      const section = h("section", { className: "chapter" }, [
        h("p", { className: "eyebrow", text: t.map.chapter(c + 1) }),
        h("h2", { text: text?.name ?? chapter.id }),
        h("p", { className: "chapter-subtitle", text: text?.subtitle ?? "" }),
        h("div", { className: "levels" }, levels),
      ]);
      section.style.setProperty("--chapter", CHAPTER_COLORS[chapter.theme] ?? "#a3e635");
      return section;
    });
    requireElement(this.root, "#map-chapters", HTMLElement).replaceChildren(...chapters);
    focusTarget?.scrollIntoView({ block: "center" });
  }

  private renderBriefing(levelId: string): void {
    const { app, t } = this;
    if (!this.changed("briefing", `${t.locale}|${levelId}`)) return;
    const ref = findLevel(app.campaign, levelId);
    if (!ref) return;

    const chapterText = t.chapters[ref.chapter.id];
    const story = t.levels[levelId];
    const chapterIndex = app.campaign.chapters.indexOf(ref.chapter);
    setText(
      requireElement(this.root, "#brief-chapter", HTMLElement),
      `${t.map.chapter(chapterIndex + 1)} · ${chapterText?.name ?? ""}`,
    );
    setText(
      requireElement(this.root, "#brief-title", HTMLElement),
      `${ref.index + 1}. ${story?.name ?? ref.level.map.name}`,
    );
    this.appRoot.style.setProperty("--chapter", CHAPTER_COLORS[ref.chapter.theme] ?? "#a3e635");

    const paragraphs: HTMLElement[] = [];
    if (ref.chapter.levels[0] === ref.level && chapterText) {
      paragraphs.push(h("p", { className: "chapter-intro", text: chapterText.intro }));
    }
    for (const line of story?.brief ?? []) paragraphs.push(h("p", { text: line }));
    requireElement(this.root, "#brief-text", HTMLElement).replaceChildren(...paragraphs);

    const content = app.session.content;
    const fresh = introducedIn(app.campaign, levelId);
    const roster = app.campaign.enemies;
    const item = (icon: HTMLCanvasElement, name: string, detail: string): HTMLLIElement =>
      h("li", { className: "legend-item" }, [
        icon,
        h("span", { className: "legend-text" }, [
          h("strong", { text: name }),
          h("span", { text: detail }),
        ]),
      ]);
    const canvas = (): HTMLCanvasElement =>
      h("canvas", { className: "legend-icon", attrs: { "aria-hidden": "true" } });

    const tools = [
      ...fresh.towers.map((id) => {
        const tower = content.tower(id);
        const icon = canvas();
        paintTowerIcon(icon, id, NEW_ICON, this.pixelRatio);
        return item(icon, towerName(t, id, tower.name), towerRole(t, tower));
      }),
      ...fresh.powers.map((id) => {
        const power = content.power(id);
        const icon = canvas();
        paintPowerIcon(icon, id, NEW_ICON, this.pixelRatio);
        return item(icon, powerName(t, id, power.name), t.powers[id]?.summary ?? power.summary);
      }),
    ];
    const threats = fresh.enemies.map((id) => {
      const enemy = content.enemy(id);
      const icon = canvas();
      paintEnemyIcon(icon, enemy, NEW_ICON, this.pixelRatio);
      return item(
        icon,
        enemyName(t, id, enemy.name),
        enemyProfile(t, enemy, roster).traits.join(" · "),
      );
    });
    const groups: HTMLElement[] = [];
    if (threats.length > 0) {
      groups.push(
        h("section", {}, [
          h("h3", { text: t.briefing.newThreats }),
          h("ul", { className: "legend-list" }, threats),
        ]),
      );
    }
    if (tools.length > 0) {
      groups.push(
        h("section", {}, [
          h("h3", { text: t.briefing.newTools }),
          h("ul", { className: "legend-list" }, tools),
        ]),
      );
    }
    requireElement(this.root, "#brief-new", HTMLElement).replaceChildren(...groups);

    const earned = app.progress.levels[levelId]?.stars ?? 0;
    setText(
      requireElement(this.root, "#brief-meta", HTMLElement),
      `${t.briefing.waves(ref.level.waves.length)}${earned > 0 ? ` · ${stars(earned)}` : ""}`,
    );
  }

  private renderResult(result: GameResult): void {
    const { app, t } = this;
    if (!this.changed("result", result) && !this.changed("result-locale", t)) return;
    this.keys.set("result", result);

    const campaign = result.mode.kind === "campaign" ? result.mode : undefined;
    const lastLevel = campaign !== undefined && result.won && result.nextLevelId === undefined;
    setText(
      requireElement(this.root, "#result-title", HTMLElement),
      lastLevel ? t.ending.title : result.won ? t.result.victory : t.result.defeat,
    );

    const starBox = requireElement(this.root, "#result-stars", HTMLElement);
    setFlag(starBox, "hidden", !campaign);
    if (campaign) {
      setAttr(starBox, "aria-label", t.result.starsLabel(result.stars));
      starBox.replaceChildren(
        ...[0, 1, 2].map((i) => {
          const star = h("span", {
            className: "star",
            text: "★",
            attrs: { "aria-hidden": "true" },
          });
          star.style.setProperty("--delay", `${STAR_DELAY_MS * (i + 1)}ms`);
          if (i < result.stars) {
            star.toggleAttribute("data-earned", true);
            star.addEventListener("animationstart", () => this.hooks.onStar?.(i), { once: true });
          }
          return star;
        }),
      );
    }

    const waves = app.session.content.waves.length;
    let text: string;
    let story = "";
    if (campaign) {
      text = result.won ? "" : t.result.lost(result.wave);
      if (result.won) story = t.levels[campaign.levelId]?.victory ?? "";
      if (lastLevel) story = `${t.ending.text} ${t.ending.credits}`;
    } else {
      text = result.won
        ? t.result.classicWon(waves, result.lives)
        : t.result.classicLost(result.wave);
    }
    const textElement = requireElement(this.root, "#result-text", HTMLElement);
    setText(textElement, text);
    setFlag(textElement, "hidden", text === "");
    const storyElement = requireElement(this.root, "#result-story", HTMLElement);
    setText(storyElement, story);
    setFlag(storyElement, "hidden", story === "");
    setText(
      requireElement(this.root, "#result-record", HTMLElement),
      result.improved && (result.won || !campaign) ? t.result.newBest : "",
    );

    const next = requireElement(this.root, "#result-next", HTMLButtonElement);
    setFlag(next, "hidden", result.nextLevelId === undefined);
    const retry = requireElement(this.root, "#result-retry", HTMLButtonElement);
    retry.classList.toggle("primary", result.nextLevelId === undefined);
    setText(retry, result.won ? t.result.playAgain : t.result.retry);
    setText(
      requireElement(this.root, "#result-exit", HTMLButtonElement),
      campaign ? t.result.map : t.result.menu,
    );
  }

  private renderPause(): void {
    const { t, app } = this;
    setText(
      requireElement(this.root, "#pause-quit", HTMLButtonElement),
      app.mode.kind === "campaign" ? t.pause.quit : t.pause.quitClassic,
    );
  }

  private bindSettings(): void {
    const { app } = this;
    const volume = (selector: string, apply: (value: number) => void): void => {
      const input = requireElement(this.root, selector, HTMLInputElement);
      input.addEventListener("input", () => {
        apply(Number(input.value) / 100);
      });
    };
    volume("#set-sfx", (sfx) => {
      app.updateSettings({ sfx });
    });
    volume("#set-music", (music) => {
      app.updateSettings({ music });
    });
    const haptics = requireElement(this.root, "#set-haptics", HTMLInputElement);
    haptics.addEventListener("change", () => {
      app.updateSettings({ haptics: haptics.checked });
    });
  }

  private renderSettings(): void {
    const { app, t } = this;
    const { settings } = app;
    if (!this.changed("settings", `${t.locale}|${JSON.stringify(settings)}`)) return;

    const sync = (selector: string, value: number): void => {
      const input = requireElement(this.root, selector, HTMLInputElement);
      const next = String(Math.round(value * 100));
      if (input.value !== next) input.value = next;
    };
    sync("#set-sfx", settings.sfx);
    sync("#set-music", settings.music);
    requireElement(this.root, "#set-haptics", HTMLInputElement).checked = settings.haptics;

    const options: readonly (Language | undefined)[] = [undefined, ...LANGUAGES];
    const buttons = options.map((language) => {
      const label = language ? stringsFor(language).languageName : t.settings.auto;
      const button = h("button", {
        className: "segment",
        text: label,
        attrs: {
          type: "button",
          "aria-pressed": String(settings.language === language),
          ...(language ? { lang: language } : {}),
        },
      });
      button.addEventListener("click", () => {
        app.updateSettings({ language });
      });
      return button;
    });
    requireElement(this.root, "#set-language", HTMLElement).replaceChildren(...buttons);
    setText(
      requireElement(this.root, "#set-version", HTMLElement),
      t.settings.version(this.hooks.version),
    );
    this.renderResetState();
  }

  /** Reset needs a second tap within a few seconds; the first only explains what it does. */
  private reset(): void {
    const now = performance.now();
    if (now < this.resetArmedUntil) {
      this.resetArmedUntil = 0;
      this.app.resetProgress();
      this.keys.delete("home");
      this.keys.delete("map");
      this.hooks.notify(this.t.settings.resetDone);
    } else {
      this.resetArmedUntil = now + RESET_CONFIRM_MS;
      setTimeout(() => {
        this.renderResetState();
      }, RESET_CONFIRM_MS);
    }
    this.renderResetState();
  }

  private renderResetState(): void {
    const armed = performance.now() < this.resetArmedUntil;
    const confirm = requireElement(this.root, "#set-reset-confirm", HTMLElement);
    setText(confirm, this.t.settings.resetConfirm);
    setFlag(confirm, "hidden", !armed);
    const button = requireElement(this.root, "#set-reset", HTMLButtonElement);
    button.classList.toggle("danger", armed);
  }

  private renderHelp(content: ContentRegistry): void {
    const { t } = this;
    if (!this.changed("help", t.locale) && this.keys.get("help-content") === content) return;
    this.keys.set("help-content", content);

    requireElement(this.root, "#help-steps", HTMLElement).replaceChildren(
      ...t.help.steps.map(([strong, rest]) =>
        h("li", {}, [h("strong", { text: strong }), ` ${rest}`]),
      ),
    );
    const item = (icon: HTMLCanvasElement, name: string, detail: string): HTMLLIElement =>
      h("li", { className: "legend-item" }, [
        icon,
        h("span", { className: "legend-text" }, [
          h("strong", { text: name }),
          h("span", { text: detail }),
        ]),
      ]);
    const towers = content.towers.map((tower) => {
      const icon = h("canvas", { className: "legend-icon", attrs: { "aria-hidden": "true" } });
      paintTowerIcon(icon, tower.id, LEGEND_ICON, this.pixelRatio);
      return item(
        icon,
        towerName(t, tower.id, tower.name),
        `${towerRole(t, tower)} · ${tower.levels[0].cost}g`,
      );
    });
    const roster = rosterOf(content.waves, (id) => content.enemy(id));
    const enemies = roster.map((enemy) => {
      const icon = h("canvas", { className: "legend-icon", attrs: { "aria-hidden": "true" } });
      paintEnemyIcon(icon, enemy, LEGEND_ICON, this.pixelRatio);
      return item(
        icon,
        enemyName(t, enemy.id, enemy.name),
        enemyProfile(t, enemy, roster).traits.join(" · "),
      );
    });
    requireElement(this.root, "#legend-towers", HTMLElement).replaceChildren(...towers);
    requireElement(this.root, "#legend-enemies", HTMLElement).replaceChildren(...enemies);
  }
}
