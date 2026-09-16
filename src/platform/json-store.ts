import type { Store } from "../app/game-app";
import type { KeyValueStorage } from "./local-record-store";

/**
 * Persists one value as JSON under a key. Storage may be missing, full or
 * blocked, and saved data may be corrupt; loading always yields a valid value
 * because the parser decides what survives.
 */
export class JsonStore<T> implements Store<T> {
  constructor(
    private readonly storage: KeyValueStorage | undefined,
    private readonly key: string,
    private readonly parse: (value: unknown) => T,
  ) {}

  load(): T {
    let raw: string | null | undefined;
    try {
      raw = this.storage?.getItem(this.key);
    } catch {
      raw = undefined;
    }
    if (!raw) return this.parse(undefined);
    try {
      return this.parse(JSON.parse(raw));
    } catch {
      return this.parse(undefined);
    }
  }

  save(value: T): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(value));
    } catch {
      // Quota exceeded or storage disabled: the game keeps working in memory.
    }
  }
}
