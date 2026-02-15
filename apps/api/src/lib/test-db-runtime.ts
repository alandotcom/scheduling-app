type GlobalWithApiTestDb = typeof globalThis & {
  __schedulingApiTestDbOverride?: object;
};

const globalWithApiTestDb = globalThis as GlobalWithApiTestDb;

export function getApiTestDbOverride(): object | undefined {
  return globalWithApiTestDb.__schedulingApiTestDbOverride;
}

export function setApiTestDbOverride(db: object | null): void {
  if (db === null) {
    delete globalWithApiTestDb.__schedulingApiTestDbOverride;
    return;
  }

  globalWithApiTestDb.__schedulingApiTestDbOverride = db;
}
