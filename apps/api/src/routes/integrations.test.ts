import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { call } from "@orpc/server";
import type { Context } from "../lib/orpc.js";
import { withOrg } from "../lib/db.js";
import { integrationRepository } from "../repositories/integrations.js";
import { config } from "../config.js";
import { decryptIntegrationSecrets } from "../services/integrations/crypto.js";
import {
  createOrg,
  createTestContext,
  createTestDb,
  resetTestDb,
  closeTestDb,
  type TestDatabase,
} from "../test-utils/index.js";
import { integrationRoutes } from "./integrations.js";

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90001",
    orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
    sessionId: "test-session",
    tokenId: null,
    authMethod: "session",
    role: "owner",
    headers: new Headers(),
    ...overrides,
  };
}

describe("Integration Routes", () => {
  let db: TestDatabase;
  const originalEncryptionKey = config.integrations.encryptionKey;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    (
      config.integrations as {
        encryptionKey: string | undefined;
      }
    ).encryptionKey = originalEncryptionKey;
  });

  test("list rejects unauthenticated requests", async () => {
    const context = createContext({ userId: null, role: null, orgId: null });

    await expect(
      call(integrationRoutes.list, undefined as never, { context }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("list rejects non-admin roles", async () => {
    const context = createContext({ role: "member" });

    await expect(
      call(integrationRoutes.list, undefined as never, { context }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("list and getSettings return app-managed integration metadata", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const listed = await call(integrationRoutes.list, undefined as never, {
      context,
    });

    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "logger",
          enabled: false,
          configured: true,
        }),
      ]),
    );

    const settings = await call(
      integrationRoutes.getSettings,
      { key: "logger" },
      { context },
    );

    expect(settings).toMatchObject({
      key: "logger",
      enabled: false,
      configured: true,
      configSchema: [],
      secretSchema: [],
      secretFields: {},
    });
  });

  test("update toggles enabled state", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const updated = await call(
      integrationRoutes.update,
      {
        key: "logger",
        enabled: true,
      },
      { context },
    );

    expect(updated).toMatchObject({
      key: "logger",
      enabled: true,
      configured: true,
    });
  });

  test("updateSecrets supports set and clear operations", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    (
      config.integrations as {
        encryptionKey: string | undefined;
      }
    ).encryptionKey = "integration-test-encryption-key";

    await call(
      integrationRoutes.updateSecrets,
      {
        key: "logger",
        set: {
          TEST_TOKEN: "abc123",
        },
      },
      { context },
    );

    const rowAfterSet = await withOrg(org.id, async (tx) => {
      return integrationRepository.findByKey(tx, org.id, "logger");
    });

    expect(rowAfterSet?.secretsEncrypted).toBeTruthy();
    expect(rowAfterSet?.secretSalt).toBeTruthy();

    const decrypted = decryptIntegrationSecrets({
      secretsEncrypted: rowAfterSet!.secretsEncrypted!,
      secretSalt: rowAfterSet!.secretSalt!,
      pepper: config.integrations.encryptionKey!,
    });
    expect(decrypted).toMatchObject({
      TEST_TOKEN: "abc123",
    });

    await call(
      integrationRoutes.updateSecrets,
      {
        key: "logger",
        clear: ["TEST_TOKEN"],
      },
      { context },
    );

    const rowAfterClear = await withOrg(org.id, async (tx) => {
      return integrationRepository.findByKey(tx, org.id, "logger");
    });

    expect(rowAfterClear?.secretsEncrypted).toBeNull();
    expect(rowAfterClear?.secretSalt).toBeNull();
  });

  test("updateSecrets fails without mutating stored secrets when decrypt fails", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    (
      config.integrations as {
        encryptionKey: string | undefined;
      }
    ).encryptionKey = "integration-test-encryption-key-a";

    await call(
      integrationRoutes.updateSecrets,
      {
        key: "logger",
        set: {
          TEST_TOKEN: "abc123",
        },
      },
      { context },
    );

    const rowBeforeFailedUpdate = await withOrg(org.id, async (tx) => {
      return integrationRepository.findByKey(tx, org.id, "logger");
    });
    expect(rowBeforeFailedUpdate?.secretsEncrypted).toBeTruthy();
    expect(rowBeforeFailedUpdate?.secretSalt).toBeTruthy();

    (
      config.integrations as {
        encryptionKey: string | undefined;
      }
    ).encryptionKey = "integration-test-encryption-key-b";

    await expect(
      call(
        integrationRoutes.updateSecrets,
        {
          key: "logger",
          set: {
            TEST_TOKEN: "rotated-token",
          },
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const rowAfterFailedUpdate = await withOrg(org.id, async (tx) => {
      return integrationRepository.findByKey(tx, org.id, "logger");
    });
    expect(rowAfterFailedUpdate?.secretsEncrypted).toBe(
      rowBeforeFailedUpdate?.secretsEncrypted,
    );
    expect(rowAfterFailedUpdate?.secretSalt).toBe(
      rowBeforeFailedUpdate?.secretSalt,
    );
  });
});
