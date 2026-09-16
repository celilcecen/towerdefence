import type { LevelRef } from "../core/campaign";
import { campaignLevels, findLevel, levelContent } from "../core/campaign";
import { ContentRegistry } from "../core/content-registry";
import type { CampaignDef, GameContent } from "../core/content-types";
import { EventBus } from "../core/events";
import type { Progress } from "../core/progress";
import { EMPTY_PROGRESS, isUnlocked, nextLevelId, recordResult } from "../core/progress";
import type { BestRecord, RecordStore } from "../core/records";
import { isBetter } from "../core/records";
import type { SessionOutcome } from "./session";
import { GameSession } from "./session";
import type { Settings } from "./settings";

export type GameMode =
  { readonly kind: "campaign"; readonly levelId: string } | { readonly kind: "classic" };

export interface GameResult extends SessionOutcome {
  readonly mode: GameMode;
  /** 0 to 3; always 0 in classic mode. */
  readonly stars: number;
  /** A better result than anything saved for this level or mode. */
  readonly improved: boolean;
  /** The level to offer next after a campaign win, if there is one. */
  readonly nextLevelId: string | undefined;
}

export type Screen =
  | { readonly kind: "home" }
  | { readonly kind: "map" }
  | { readonly kind: "briefing"; readonly levelId: string }
  | { readonly kind: "game" }
  | { readonly kind: "result"; readonly result: GameResult };

/** Dialogs that sit on top of whatever screen is showing. */
export type Overlay = "pause" | "settings" | "help" | "coach";

/** Port for anything persisted as a single value. */
export interface Store<T> {
  load(): T;
  save(value: T): void;
}

export interface AppStores {
  readonly progress: Store<Progress>;
  readonly settings: Store<Settings>;
  readonly classic: RecordStore;
}

export interface AppEvents {
  /** A game was loaded for a mode; adapters switch theme, music and chrome. */
  gameLoaded: { readonly mode: GameMode; readonly theme: string };
  settingsChanged: { readonly settings: Settings };
  result: { readonly result: GameResult };
}

const CLASSIC_THEME = "meadow";

/**
 * The application flow around games: home, campaign map, briefing, play,
 * results, and the dialogs over them. It owns progress and settings, picks
 * the content for each level, and records outcomes. Like the session it has
 * no DOM dependency, so the whole flow is unit-tested.
 */
export class GameApp {
  readonly events = new EventBus<AppEvents>();
  readonly session: GameSession;

  private currentScreen: Screen = { kind: "home" };
  private overlays: Overlay[] = [];
  private currentMode: GameMode = { kind: "classic" };
  private currentProgress: Progress;
  private currentSettings: Settings;
  private classicRecord: BestRecord | undefined;
  private readonly registries = new Map<string, ContentRegistry>();
  private readonly classicRegistry: ContentRegistry;

  constructor(
    readonly campaign: CampaignDef,
    classic: GameContent,
    private readonly stores: AppStores,
    nextSeed: () => number,
  ) {
    this.currentProgress = stores.progress.load();
    this.currentSettings = stores.settings.load();
    this.classicRecord = stores.classic.load();
    this.classicRegistry = new ContentRegistry(classic);
    this.session = new GameSession(this.classicRegistry, nextSeed);
    this.session.events.on("finished", (outcome) => {
      this.finish(outcome);
    });
  }

  get screen(): Screen {
    return this.currentScreen;
  }

  /** The dialog on top, if any. */
  get overlay(): Overlay | undefined {
    return this.overlays.at(-1);
  }

  get mode(): GameMode {
    return this.currentMode;
  }

  get progress(): Progress {
    return this.currentProgress;
  }

  get settings(): Settings {
    return this.currentSettings;
  }

  get classicBest(): BestRecord | undefined {
    return this.classicRecord;
  }

  get levels(): readonly LevelRef[] {
    return campaignLevels(this.campaign);
  }

  /** The chapter theme of the game in progress. */
  get theme(): string {
    const mode = this.currentMode;
    if (mode.kind === "classic") return CLASSIC_THEME;
    return findLevel(this.campaign, mode.levelId)?.chapter.theme ?? CLASSIC_THEME;
  }

  /** The first level not yet won, for the home screen's Continue button. */
  get continueLevelId(): string | undefined {
    return nextLevelId(this.campaign, this.currentProgress);
  }

  isUnlocked(levelId: string): boolean {
    return isUnlocked(this.campaign, this.currentProgress, levelId);
  }

  goHome(): void {
    this.leaveGame();
    this.show({ kind: "home" });
  }

  openMap(): void {
    this.leaveGame();
    this.show({ kind: "map" });
  }

  /** Shows the level's story with its map already loaded, idle, behind the briefing. */
  openBriefing(levelId: string): void {
    const ref = findLevel(this.campaign, levelId);
    if (!ref || !this.isUnlocked(levelId)) return;
    this.leaveGame();
    this.load({ kind: "campaign", levelId }, this.registryFor(ref));
    this.show({ kind: "briefing", levelId });
  }

  continueCampaign(): void {
    const id = this.continueLevelId;
    if (id) this.openBriefing(id);
  }

  /** From the briefing: the level is already loaded, so play begins at once. */
  startBriefedLevel(): void {
    if (this.currentScreen.kind !== "briefing") return;
    this.session.start();
    this.show({ kind: "game" });
  }

  startLevel(levelId: string): void {
    const ref = findLevel(this.campaign, levelId);
    if (!ref || !this.isUnlocked(levelId)) return;
    this.launch({ kind: "campaign", levelId }, this.registryFor(ref));
  }

  startClassic(): void {
    this.launch({ kind: "classic" }, this.classicRegistry);
  }

  /** Same mode again, from a result screen or the pause menu. */
  retry(): void {
    this.overlays = [];
    this.session.restart();
    this.show({ kind: "game" });
    this.events.emit("gameLoaded", { mode: this.currentMode, theme: this.theme });
  }

  nextLevel(): void {
    const screen = this.currentScreen;
    if (screen.kind === "result" && screen.result.nextLevelId) {
      this.openBriefing(screen.result.nextLevelId);
    }
  }

  /** Leaves a game for the map (campaign) or the home screen (classic). */
  quit(): void {
    if (this.currentMode.kind === "campaign") this.openMap();
    else this.goHome();
  }

  openOverlay(overlay: Overlay): void {
    if ((overlay === "pause" || overlay === "coach") && this.currentScreen.kind !== "game") return;
    if (this.overlay === overlay) return;
    this.overlays.push(overlay);
    this.syncPause();
  }

  hasOverlay(overlay: Overlay): boolean {
    return this.overlays.includes(overlay);
  }

  closeOverlay(): void {
    this.overlays.pop();
    this.syncPause();
  }

  /**
   * The system back gesture: close the top dialog, pause a running game, or
   * step back one screen. Returns false at the home screen, where the
   * platform should leave the app.
   */
  back(): boolean {
    if (this.overlay) {
      this.closeOverlay();
      return true;
    }
    switch (this.currentScreen.kind) {
      case "home":
        return false;
      case "map":
        this.goHome();
        return true;
      case "briefing":
        this.openMap();
        return true;
      case "game":
        this.openOverlay("pause");
        return true;
      case "result":
        this.quit();
        return true;
    }
  }

  /** The app went to the background: never let a wave run unattended. */
  suspend(): void {
    if (this.currentScreen.kind === "game" && this.session.started && !this.session.outcome) {
      this.openOverlay("pause");
    }
  }

  updateSettings(patch: Partial<Settings>): void {
    this.currentSettings = { ...this.currentSettings, ...patch };
    this.stores.settings.save(this.currentSettings);
    this.events.emit("settingsChanged", { settings: this.currentSettings });
  }

  resetProgress(): void {
    this.currentProgress = EMPTY_PROGRESS;
    this.stores.progress.save(this.currentProgress);
  }

  private launch(mode: GameMode, content: ContentRegistry): void {
    this.overlays = [];
    this.load(mode, content);
    this.session.start();
    this.show({ kind: "game" });
  }

  private load(mode: GameMode, content: ContentRegistry): void {
    this.currentMode = mode;
    this.session.load(content);
    this.events.emit("gameLoaded", { mode, theme: this.theme });
  }

  private leaveGame(): void {
    this.overlays = [];
    this.session.setPaused(false);
    this.session.started = false;
  }

  private show(screen: Screen): void {
    this.currentScreen = screen;
  }

  private syncPause(): void {
    if (this.currentScreen.kind === "game") {
      this.session.setPaused(this.overlays.length > 0);
    }
  }

  private registryFor(ref: LevelRef): ContentRegistry {
    let registry = this.registries.get(ref.level.id);
    if (!registry) {
      registry = new ContentRegistry(levelContent(this.campaign, ref.level));
      this.registries.set(ref.level.id, registry);
    }
    return registry;
  }

  private finish(outcome: SessionOutcome): void {
    const mode = this.currentMode;
    let result: GameResult;
    if (mode.kind === "campaign") {
      const ref = findLevel(this.campaign, mode.levelId);
      const startingLives = ref?.level.startingLives ?? outcome.lives;
      const recorded = recordResult(
        this.currentProgress,
        mode.levelId,
        outcome.won,
        outcome.lives,
        startingLives,
      );
      if (recorded.improved) {
        this.currentProgress = recorded.progress;
        this.stores.progress.save(recorded.progress);
      }
      const next = ref ? this.levels[ref.index + 1] : undefined;
      result = {
        ...outcome,
        mode,
        stars: recorded.stars,
        improved: recorded.improved,
        nextLevelId: outcome.won ? next?.level.id : undefined,
      };
    } else {
      const record: BestRecord = { wave: outcome.wave, won: outcome.won, lives: outcome.lives };
      const improved = isBetter(record, this.classicRecord);
      if (improved) {
        this.classicRecord = record;
        this.stores.classic.save(record);
      }
      result = { ...outcome, mode, stars: 0, improved, nextLevelId: undefined };
    }
    this.overlays = [];
    this.show({ kind: "result", result });
    this.events.emit("result", { result });
  }
}
