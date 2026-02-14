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
          authStrategy: "manual",
        }),
        expect.objectContaining({
          key: "resend",
          enabled: false,
          configured: false,
          authStrategy: "manual",
        }),
        expect.objectContaining({
          key: "slack",
          enabled: false,
          configured: false,
          authStrategy: "oauth",
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
      authStrategy: "manual",
    });

    const resendSettings = await call(
      integrationRoutes.getSettings,
      { key: "resend" },
      { context },
    );

    expect(resendSettings).toMatchObject({
      key: "resend",
      enabled: false,
      configured: false,
      authStrategy: "manual",
      configSchema: expect.arrayContaining([
        expect.objectContaining({
          key: "fromEmail",
          required: true,
          inputType: "email",
        }),
      ]),
      secretSchema: expect.arrayContaining([
        expect.objectContaining({
          key: "apiKey",
          required: true,
        }),
      ]),
      secretFields: {
        apiKey: false,
      },
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
      authStrategy: "manual",
    });
  });

  test("resend cannot be enabled until required settings are complete", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await expect(
      call(
        integrationRoutes.update,
        {
          key: "resend",
          enabled: true,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await call(
      integrationRoutes.update,
      {
        key: "resend",
        config: {
          fromEmail: "notifications@example.com",
        },
      },
      { context },
    );

    await expect(
      call(
        integrationRoutes.update,
        {
          key: "resend",
          enabled: true,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    (
      config.integrations as {
        encryptionKey: string | undefined;
      }
    ).encryptionKey = "integration-test-encryption-key";

    await call(
      integrationRoutes.updateSecrets,
      {
        key: "resend",
        set: {
          apiKey: "re_test_key",
        },
      },
      { context },
    );

    const enabled = await call(
      integrationRoutes.update,
      {
        key: "resend",
        enabled: true,
      },
      { context },
    );

    expect(enabled).toMatchObject({
      key: "resend",
      enabled: true,
      configured: true,
      authStrategy: "manual",
    });
  });

  test("resend requires fromEmail config and apiKey secret to be configured", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const initial = await call(
      integrationRoutes.getSettings,
      { key: "resend" },
      { context },
    );
    expect(initial.configured).toBe(false);

    await call(
      integrationRoutes.update,
      {
        key: "resend",
        config: {
          fromEmail: "notifications@example.com",
        },
      },
      { context },
    );

    const afterConfig = await call(
      integrationRoutes.getSettings,
      { key: "resend" },
      { context },
    );
    expect(afterConfig.configured).toBe(false);

    (
      config.integrations as {
        encryptionKey: string | undefined;
      }
    ).encryptionKey = "integration-test-encryption-key";

    await call(
      integrationRoutes.updateSecrets,
      {
        key: "resend",
        set: {
          apiKey: "re_test_key",
        },
      },
      { context },
    );

    const afterSecret = await call(
      integrationRoutes.getSettings,
      { key: "resend" },
      { context },
    );
    expect(afterSecret.configured).toBe(true);
    expect(afterSecret.secretFields).toMatchObject({
      apiKey: true,
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

  test("disconnectOAuth clears oauth secrets/config and disables integration", async () => {
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
        key: "slack",
        set: {
          accessToken: "xoxb-test-token",
        },
      },
      { context },
    );

    await call(
      integrationRoutes.update,
      {
        key: "slack",
        config: {
          oauth: {
            connectedAt: new Date().toISOString(),
            accountLabel: "Acme Workspace",
          },
        },
      },
      { context },
    );

    await call(
      integrationRoutes.disconnectOAuth,
      {
        key: "slack",
      },
      { context },
    );

    const row = await withOrg(org.id, async (tx) =>
      integrationRepository.findByKey(tx, org.id, "slack"),
    );
    expect(row?.enabled).toBe(false);
    expect(row?.secretsEncrypted).toBeNull();
    expect(row?.secretSalt).toBeNull();

    const integrationConfig = row?.config as
      | Record<string, unknown>
      | undefined;
    expect(integrationConfig?.["oauth"]).toBeUndefined();
  });
});
