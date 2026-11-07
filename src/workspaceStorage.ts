import { useCallback, useSyncExternalStore, type SetStateAction } from "react";
import { contentHash } from "./engine/canonical";
import {
  decodeLane,
  decodeLocation,
  decodePreferences,
  decodeRunInput,
  decodeScenarioDefinition,
  decodeWorkspaceDocument,
} from "./schemaDecoders";
import { decodeStoredScenario } from "./runArtifactDecoders";

export type StorageNotice = {
  id: string;
  kind: "recovery" | "conflict" | "unsaved";
  message: string;
  key: string;
};
type Envelope<T> = {
  schemaVersion: 2;
  revision: number;
  updatedAt: string;
  value: T;
};
type Validator<T> = (value: unknown) => value is T;
const stores = new Map<string, LocalStore<unknown>>();
let notices: StorageNotice[] = [];
const noticeListeners = new Set<() => void>();
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => typeof v === "string";
const unavailableStorage: Storage = {
  length: 0,
  clear() {
    throw new Error("Storage unavailable");
  },
  getItem() {
    throw new Error("Storage unavailable");
  },
  key() {
    return null;
  },
  removeItem() {
    throw new Error("Storage unavailable");
  },
  setItem() {
    throw new Error("Storage unavailable");
  },
};
function browserStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return unavailableStorage;
  }
}

export function reportStorageNotice(
  key: string,
  kind: StorageNotice["kind"],
  message: string,
) {
  const id = `${key}:${kind}`;
  notices = [...notices.filter((n) => n.id !== id), { id, key, kind, message }];
  noticeListeners.forEach((listener) => listener());
}
export function dismissStorageNotice(id: string) {
  notices = notices.filter((n) => n.id !== id);
  noticeListeners.forEach((fn) => fn());
}
export function useStorageNotices() {
  return useSyncExternalStore(
    (cb) => {
      noticeListeners.add(cb);
      return () => noticeListeners.delete(cb);
    },
    () => notices,
  );
}

export function validateLocation(v: unknown): boolean {
  return decodeLocation(v).ok;
}
export function validateStoredValue(key: string, value: unknown): boolean {
  if (key.startsWith("flyway-settings-draft:"))
    return (
      value === null ||
      (object(value) &&
        Number.isInteger(value.revision) &&
        validateStoredValue("flyway-preferences", value.preferences))
    );
  if (key.startsWith("flyway-decision-draft:")) {
    if (value === null) return true;
    if (
      !object(value) ||
      value.schemaVersion !== 1 ||
      !["new", "frozen"].includes(String(value.kind))
    )
      return false;
    if (value.kind === "new")
      return (
        value.sourceInput === undefined &&
        value.sourceInputHash === undefined &&
        decodeScenarioDefinition(value.scenario, null).ok
      );
    if (
      !decodeRunInput(value.sourceInput).ok ||
      typeof value.sourceInputHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(value.sourceInputHash) ||
      contentHash(value.sourceInput) !== value.sourceInputHash
    )
      return false;
    return decodeScenarioDefinition(
      value.scenario,
      (
        value.sourceInput as {
          locations: import("./flywayTypes").TwinLocation[];
        }
      ).locations,
    ).ok;
  }
  if (key.startsWith("flyway-scenario-draft:"))
    return (
      value === null ||
      (object(value) &&
        text(value.name) &&
        text(value.type) &&
        text(value.targetId) &&
        finite(value.magnitude) &&
        finite(value.horizon) &&
        ["daily", "weekly"].includes(String(value.grain)) &&
        text(value.startDate))
    );
  if (key === "flyway-workspace") return decodeWorkspaceDocument(value).ok;
  if (key === "flyway-theme") return value === "light" || value === "dark";
  if (key === "flyway-onboarded") return typeof value === "boolean";
  if (key === "flyway-locations")
    return (
      Array.isArray(value) &&
      value.every(validateLocation) &&
      new Set(value.map((v) => v.id)).size === value.length
    );
  if (key === "flyway-lanes")
    return (
      Array.isArray(value) &&
      value.every((v) => decodeLane(v).ok) &&
      new Set(value.map((v) => v.id)).size === value.length
    );
  if (key === "flyway-scenarios")
    return (
      Array.isArray(value) &&
      value.every((v) => decodeStoredScenario(v).ok)
    );
  if (key === "flyway-location-draft")
    return (
      object(value) &&
      ["restaurant", "dc", "supplier"].includes(String(value.type)) &&
      ["name", "address", "city", "state", "confirmedPoint"].every((k) =>
        text(value[k]),
      ) &&
      finite(value.weeklyVolume) &&
      finite(value.inventoryDays) &&
      (value.point === null ||
        (object(value.point) &&
          finite(value.point.latitude) &&
          finite(value.point.longitude)))
    );
  if (key === "flyway-preferences") return decodePreferences(value).ok;
  return (
    value === null ||
    Array.isArray(value) ||
    object(value) ||
    ["string", "number", "boolean"].includes(typeof value)
  );
}

/** One versioned boundary for browser state. Invalid originals are never erased. */
export class LocalStore<T> {
  private listeners = new Set<() => void>();
  private current: Envelope<T>;
  private raw: string | null = null;
  private writes = Promise.resolve();
  readonly storageKey: string;
  constructor(
    readonly key: string,
    private initial: T,
    private valid: Validator<T>,
    private storage: Storage = browserStorage(),
  ) {
    this.storageKey = `flyway:v2:${key}`;
    this.current = {
      schemaVersion: 2,
      revision: 0,
      updatedAt: "",
      value: initial,
    };
    this.reload();
    if (typeof window !== "undefined")
      window.addEventListener("storage", (event) => {
        if (
          event.key === this.storageKey ||
          event.key === key ||
          event.key === null
        )
          this.reload();
      });
  }
  getSnapshot = () => this.current.value;
  getRevision = () => this.current.revision;
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  private changed() {
    this.listeners.forEach((fn) => fn());
  }
  private parse(raw: string): Envelope<T> {
    const parsed: unknown = JSON.parse(raw);
    if (
      !object(parsed) ||
      parsed.schemaVersion !== 2 ||
      !Number.isInteger(parsed.revision) ||
      !this.valid(parsed.value)
    )
      throw new Error("Unsupported saved-data shape");
    return parsed as Envelope<T>;
  }
  reload() {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw && raw === this.raw) return;
      if (raw) this.current = this.parse(raw);
      else {
        const legacy = this.storage.getItem(this.key);
        const value: unknown = legacy ? JSON.parse(legacy) : this.initial;
        if (!this.valid(value))
          throw new Error("Legacy saved data needs recovery");
        this.current = { schemaVersion: 2, revision: 0, updatedAt: "", value };
      }
      this.raw = raw;
      this.changed();
    } catch {
      try {
        const backup = this.storage.getItem(`${this.storageKey}:last-good`);
        if (backup) this.current = this.parse(backup);
      } catch {
        /* Keep the in-memory last-known-good state, never corrupt originals. */
      }
      reportStorageNotice(
        this.key,
        "recovery",
        `Saved ${this.key.replace("flyway-", "")} could not be read. A last-known-good or sample view is open; the original remains preserved. Save a recovery copy before continuing.`,
      );
      this.changed();
    }
  }
  update = (
    update: SetStateAction<T>,
    explicitExpectedRevision?: number,
  ): Promise<boolean> => {
    const expectedRevision = explicitExpectedRevision ?? this.current.revision;
    const apply = async () => {
      this.reload();
      if (
        (explicitExpectedRevision !== undefined || typeof update !== "function") &&
        expectedRevision !== this.current.revision
      ) {
        reportStorageNotice(
          this.key,
          "conflict",
          "Another tab changed this record. The newer version is loaded; review it and try your change again.",
        );
        return false;
      }
      const value =
        typeof update === "function"
          ? (update as (v: T) => T)(this.current.value)
          : update;
      if (!this.valid(value)) {
        reportStorageNotice(
          this.key,
          "unsaved",
          "This change failed validation and was not saved. Check the fields and try again.",
        );
        return false;
      }
      const next: Envelope<T> = {
        schemaVersion: 2,
        revision: this.current.revision + 1,
        updatedAt: new Date().toISOString(),
        value,
      };
      try {
        const prior = this.storage.getItem(this.storageKey);
        if (prior) {
          try {
            this.parse(prior);
            this.storage.setItem(`${this.storageKey}:last-good`, prior);
          } catch {
            this.storage.setItem(
              `${this.storageKey}:recovery:${Date.now()}`,
              prior,
            );
          }
        }
        const legacy = this.storage.getItem(this.key);
        if (legacy && !prior)
          this.storage.setItem(`${this.storageKey}:legacy-original`, legacy);
        const raw = JSON.stringify(next);
        this.storage.setItem(this.storageKey, raw);
        this.raw = raw;
        this.current = next;
        this.changed();
        return true;
      } catch {
        reportStorageNotice(
          this.key,
          "unsaved",
          "Browser storage is unavailable or full. This change was not saved. Keep this page open and restore storage access before retrying.",
        );
        return false;
      }
    };
    let saved = false;
    this.writes = this.writes
      .then(async () => {
        saved =
          typeof navigator !== "undefined" && navigator.locks
            ? await navigator.locks.request(this.storageKey, apply)
            : await apply();
      })
      .catch(() =>
        reportStorageNotice(
          this.key,
          "unsaved",
          "The save failed. Your previous version is intact.",
        ),
      );
    return this.writes.then(() => saved);
  };
  settled() {
    return this.writes;
  }
}

export function getLocalStore<T>(key: string, initial: T): LocalStore<T> {
  if (!stores.has(key))
    stores.set(
      key,
      new LocalStore(key, initial, (v): v is T =>
        validateStoredValue(key, v),
      ) as LocalStore<unknown>,
    );
  return stores.get(key) as LocalStore<T>;
}
export function usePersistedState<T>(key: string, initial: T) {
  const store = getLocalStore(key, initial);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const revision = useSyncExternalStore(store.subscribe, store.getRevision);
  const update = useCallback(
    (next: SetStateAction<T>, expectedRevision?: number) =>
      store.update(next, expectedRevision),
    [store],
  );
  return [value, update, revision] as const;
}
