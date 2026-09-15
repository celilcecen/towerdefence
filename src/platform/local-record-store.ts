import type { BestRecord, RecordStore } from "../core/records";
import { parseRecord } from "../core/records";

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export const RECORD_KEY = "gridlock.best.v1";

/** Adapter for the RecordStore port. Storage may be missing, full or blocked; the game never breaks. */
export class LocalRecordStore implements RecordStore {
  constructor(private readonly storage: KeyValueStorage | undefined) {}

  load(): BestRecord | undefined {
    try {
      const raw = this.storage?.getItem(RECORD_KEY);
      return raw ? parseRecord(JSON.parse(raw)) : undefined;
    } catch {
      return undefined;
    }
  }

  save(record: BestRecord): void {
    try {
      this.storage?.setItem(RECORD_KEY, JSON.stringify(record));
    } catch {
      // Quota exceeded or storage disabled: losing a best score is acceptable.
    }
  }
}

/** Merely touching window.localStorage throws in some privacy modes. */
export function browserStorage(scope: {
  readonly localStorage: Storage;
}): KeyValueStorage | undefined {
  try {
    return scope.localStorage;
  } catch {
    return undefined;
  }
}
