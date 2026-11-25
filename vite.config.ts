import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Keep the NEXT_PUBLIC_ names the codebase already uses for client-visible config.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    reactRouter(),
    {
      name: "worker-node-dependency-resolution",
      enforce: "post",
      configEnvironment(name, options) {
        if (name !== "ssr") return;
        // React Router uses Node entry points for packages without exports.
        // Keep conditional exports consistent with those entry points; mixing
        // S3's Node runtime with @aws-sdk/core's browser exports crashes at startup.
        options.resolve ??= {};
        options.resolve.conditions = (options.resolve.conditions ?? []).filter((condition) => condition !== "browser");
        options.resolve.mainFields = ["module", "main"];
      },
    },
  ],
});
