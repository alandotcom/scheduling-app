import { createRequire } from "node:module";
import { extname } from "node:path";
import { plugin } from "bun";
import { transform } from "@swc/core";

const require = createRequire(import.meta.url);
const directivePattern = /(use step|use workflow)/;
const transformFilter =
  /^(?!.*(?:\/node_modules\/|\/dist\/|\/\.well-known\/)).*\.(?:ts|tsx|js|jsx)$/;

function getLoaderFromPath(path: string): "ts" | "tsx" | "js" | "jsx" {
  const extension = extname(path).toLowerCase();
  if (extension === ".tsx") {
    return "tsx";
  }
  if (extension === ".jsx") {
    return "jsx";
  }
  if (extension === ".js") {
    return "js";
  }
  return "ts";
}

plugin({
  name: "workflow-transform",
  setup(build) {
    build.onLoad({ filter: transformFilter }, async (args) => {
      const loader = getLoaderFromPath(args.path);
      const source = await Bun.file(args.path).text();

      // Skip files that do not contain workflow directives.
      if (!directivePattern.test(source)) {
        return { contents: source, loader };
      }

      const result = await transform(source, {
        filename: args.path,
        jsc: {
          experimental: {
            plugins: [
              [require.resolve("@workflow/swc-plugin"), { mode: "client" }],
            ],
          },
        },
      });

      return { contents: result.code, loader };
    });
  },
});
