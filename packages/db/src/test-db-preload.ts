import { beforeEach } from "bun:test";
import { createTestDb, resetTestDb, setCurrentTestDb } from "./test-utils.js";

const db = await createTestDb();
setCurrentTestDb(db);

beforeEach(async () => {
  await resetTestDb(db);
});
