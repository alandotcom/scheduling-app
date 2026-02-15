type GlobalWithApiTestDb = typeof globalThis & {
  __schedulingApiTestDbOverride?: unknown;
};

const globalWithApiTestDb = globalThis as GlobalWithApiTestDb;

export function getApiTestDbOverride(): unknown | undefined {
  return globalWithApiTestDb.__schedulingApiTestDbOverride;
}

export function setApiTestDbOverride(db: unknown | null): void {
  if (db === null) {
    delete globalWithApiTestDb.__schedulingApiTestDbOverride;
    return;
  }

  globalWithApiTestDb.__schedulingApiTestDbOverride = db;
}
