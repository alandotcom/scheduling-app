import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
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
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler", "jotai-babel/preset"],
      },
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
