import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const CIPHER_ALGORITHM = "aes-256-gcm";
const CIPHER_KEY_LENGTH = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

type EncryptedSecretsPayloadV1 = {
  v: 1;
  iv: string;
  tag: string;
  data: string;
};

function deriveEncryptionKey(pepper: string, salt: string): Buffer {
  return scryptSync(pepper, Buffer.from(salt, "base64"), CIPHER_KEY_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSecretsPayload(raw: string): EncryptedSecretsPayloadV1 {
  const payload = JSON.parse(raw) as unknown;

  if (!isRecord(payload)) {
    throw new Error("Encrypted secrets payload must be an object");
  }

  if (payload["v"] !== 1) {
    throw new Error("Unsupported encrypted secrets payload version");
  }

  const iv = payload["iv"];
  const tag = payload["tag"];
  const data = payload["data"];

  if (
    typeof iv !== "string" ||
    typeof tag !== "string" ||
    typeof data !== "string"
  ) {
    throw new Error("Encrypted secrets payload is missing required fields");
  }

  return { v: 1, iv, tag, data };
}

function parseSecretsRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error("Decrypted secrets payload must be an object");
  }

  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string") {
      throw new Error(`Secret value for ${key} must be a string`);
    }
    result[key] = raw;
  }

  return result;
}

export function encryptIntegrationSecrets(input: {
  secrets: Record<string, string>;
  pepper: string;
}): { secretsEncrypted: string; secretSalt: string } {
  const secretSalt = randomBytes(SALT_BYTES).toString("base64");
  const iv = randomBytes(IV_BYTES);
  const key = deriveEncryptionKey(input.pepper, secretSalt);

  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);
  const plaintext = JSON.stringify(input.secrets);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedSecretsPayloadV1 = {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };

  return {
    secretsEncrypted: JSON.stringify(payload),
    secretSalt,
  };
}

export function decryptIntegrationSecrets(input: {
  secretsEncrypted: string;
  secretSalt: string;
  pepper: string;
}): Record<string, string> {
  const payload = parseSecretsPayload(input.secretsEncrypted);
  const key = deriveEncryptionKey(input.pepper, input.secretSalt);

  const decipher = createDecipheriv(
    CIPHER_ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return parseSecretsRecord(JSON.parse(decrypted));
}

// TODO(integrations-security): add dual-key rotation support with a second env key
// and a background/scripted re-encryption pass.
