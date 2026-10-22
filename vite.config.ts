import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleConvertDwg, isConvertDwgRequest } from "./scripts/convert-dwg.mjs";
import { handleUsageApiRequest, isUsageApiRequest } from "./scripts/usage-logger.mjs";

function dwgConvertPlugin() {
  return {
    name: "ftth-dwg-convert",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isUsageApiRequest(req)) {
          void handleUsageApiRequest(req, res);
          return;
        }
        if (!isConvertDwgRequest(req)) {
          next();
          return;
        }
        void handleConvertDwg(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isUsageApiRequest(req)) {
          void handleUsageApiRequest(req, res);
          return;
        }
        if (!isConvertDwgRequest(req)) {
          next();
          return;
        }
        void handleConvertDwg(req, res);
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), dwgConvertPlugin()],
});
