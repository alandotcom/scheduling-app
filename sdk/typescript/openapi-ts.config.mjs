export default {
  input: "./openapi/openapi.json",
  output: {
    path: "./src/generated",
    postProcess: ["biome:format"],
  },
  plugins: [
    {
      name: "@hey-api/sdk",
      paramsStructure: "flat",
      operations: {
        strategy: "single",
        containerName: "Client",
        methods: "instance",
        nesting: "operationId",
      },
    },
    {
      name: "@hey-api/client-fetch",
    },
    {
      name: "@hey-api/typescript",
    },
  ],
};
