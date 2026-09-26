import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig(({ mode }) => {
  // `--mode studio` builds the plain web app served by `piano-helper studio` to phones and browsers.
  const skipElectron = process.env.PIANO_SKIP_ELECTRON === "1" || mode === "studio";
  return {
  base: mode === "studio" ? "/" : undefined,
  plugins: [
    react(),
    ...(!skipElectron
      ? [
          electron([
      {
        entry: "electron/main.ts",
        onstart(args) {
          void args.startup().catch((err: unknown) => {
            console.warn("electron startup", err);
          });
        },
        vite: {
          build: {
            outDir: "dist-electron",
            lib: { entry: "electron/main.ts", formats: ["es"], fileName: () => "main.js" },
            rollupOptions: {
              external: ["electron", "fast-xml-parser"],
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart() {
          // Do not call reload()/startup() here. A second startup() taskkills the
          // Electron process that just launched and Vite exits with it on Windows.
        },
        vite: {
          build: {
            outDir: "dist-electron",
            lib: { entry: "electron/preload.ts", formats: ["cjs"], fileName: () => "preload.cjs" },
          },
        },
      },
          ]),
          renderer(),
        ]
      : []),
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/*.ico", "**/assets/**"],
    },
  },
};
});
