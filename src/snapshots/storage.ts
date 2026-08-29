import type { SkySnapshotMetadata, SkySnapshotRecord } from "./types";

export interface SnapshotStorage {
  save(record: SkySnapshotRecord): Promise<void>;
  list(): Promise<SkySnapshotMetadata[]>;
  get(snapshotId: string): Promise<SkySnapshotRecord | null>;
  remove(snapshotId: string): Promise<void>;
}

function cloneMetadata(metadata: SkySnapshotMetadata): SkySnapshotMetadata {
  return {
    ...metadata,
    site: { ...metadata.site },
    view: { ...metadata.view },
    simulation: { ...metadata.simulation },
    layers: { ...metadata.layers },
    displayOptions: { ...metadata.displayOptions },
  };
}

function cloneRecord(record: SkySnapshotRecord): SkySnapshotRecord {
  return { ...cloneMetadata(record), blob: record.blob };
}

export function createMemorySnapshotStorage(): SnapshotStorage {
  const records = new Map<string, SkySnapshotRecord>();
  return {
    async save(record) {
      records.set(record.snapshotId, cloneRecord(record));
    },
    async list() {
      return [...records.values()]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(cloneMetadata);
    },
    async get(snapshotId) {
      const record = records.get(snapshotId);
      return record ? cloneRecord(record) : null;
    },
    async remove(snapshotId) {
      records.delete(snapshotId);
    },
  };
}

const DB_NAME = "interactive-star-lab";
const DB_VERSION = 1;
const STORE_NAME = "sky-snapshots";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "snapshotId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function createIndexedDbSnapshotStorage(): SnapshotStorage {
  const database = openDatabase();
  return {
    async save(record) {
      const db = await database;
      const transaction = db.transaction(STORE_NAME, "readwrite");
      await requestResult(transaction.objectStore(STORE_NAME).put(record));
    },
    async list() {
      const db = await database;
      const values = await requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());
      return (values as SkySnapshotRecord[])
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(cloneMetadata);
    },
    async get(snapshotId) {
      const db = await database;
      const value = await requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(snapshotId));
      return value ? cloneRecord(value as SkySnapshotRecord) : null;
    },
    async remove(snapshotId) {
      const db = await database;
      await requestResult(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(snapshotId));
    },
  };
}

export function createDefaultSnapshotStorage(): SnapshotStorage {
  return typeof indexedDB === "undefined" ? createMemorySnapshotStorage() : createIndexedDbSnapshotStorage();
}

