import { resolve } from "node:path";

// Load root .env so @ai-sdk/gateway provider keys are available
process.loadEnvFile(resolve(import.meta.dirname, "../../../../.env"));
