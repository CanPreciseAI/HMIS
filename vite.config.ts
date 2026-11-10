import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");

  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
    "CRON_SECRET_PREVIOUS",
  ]) {
    if (process.env[name] === undefined && fileEnv[name] !== undefined) {
      process.env[name] = fileEnv[name];
    }
  }

  const onVercel = Boolean(process.env["VERCEL"]);
  const outputDir = process.env["NITRO_OUTPUT_DIR"] ?? ".output";

  const nitroOptions = onVercel
    ? { preset: "vercel" }
    : {
        preset: "cloudflare-module",
        output: {
          dir: outputDir,
          serverDir: `${outputDir}/server`,
          publicDir: `${outputDir}/public`,
        },
      };

  return {
    plugins: [
      tailwindcss(),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
        server: { entry: "server" },
      }),
      ...(command === "build" ? [nitro(nitroOptions)] : []),
      react(),
    ],
    resolve: { tsconfigPaths: true },
  };
});