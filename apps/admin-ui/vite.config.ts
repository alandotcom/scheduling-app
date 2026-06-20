import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // TanStack Router plugin must come before React plugin
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routeFileIgnorePattern:
        "(^|/)(components|__tests__)(/|$)|\\.(test|spec)\\.[jt]sx?$",
    }),
    // plugin-react v6 transforms JSX via oxc; babel-based transforms
    // (React Compiler, jotai) run through @rolldown/plugin-babel.
    react(),
    babel({
      presets: [reactCompilerPreset(), "jotai-babel/preset"],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/v1": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/svix-api": {
        target: "http://localhost:8071",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/svix-api/, ""),
      },
    },
  },
});
