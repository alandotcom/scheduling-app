import type { Database } from "../lib/db.js";
import { setApiTestDbOverride } from "../lib/test-db-runtime.js";
import { createTestDb, setCurrentTestDb } from "@scheduling/db/test-utils";

const db = await createTestDb();
setCurrentTestDb(db);
setApiTestDbOverride(db as unknown as Database);
