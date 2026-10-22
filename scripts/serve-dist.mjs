import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleConvertDwg, isConvertDwgRequest } from "./convert-dwg.mjs";
import {
  checkRemoteKillSwitch,
  getRevocationState,
  handleUsageApiRequest,
  isUsageApiRequest,
  recordUsageEvent,
} from "./usage-logger.mjs";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const requested = normalize(join(root, pathname));
  if (!requested.startsWith(root)) return null;
  if (!existsSync(requested)) return join(root, "index.html");
  if (statSync(requested).isDirectory()) return join(requested, "index.html");
  return requested;
}

const LICENSE_EXPIRY_TIMESTAMP = new Date("2027-09-02T23:59:59Z").getTime();

createServer((request, response) => {
  if (isUsageApiRequest(request)) {
    void handleUsageApiRequest(request, response);
    return;
  }

  if (Date.now() > LICENSE_EXPIRY_TIMESTAMP) {
    response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Software license expired on September 2, 2027. Please contact Caesar Ian Samulde for renewal." }));
    return;
  }

  if (isConvertDwgRequest(request)) {
    const rev = getRevocationState();
    if (rev.revoked) {
      response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: rev.reason || "Software license has been revoked by Caesar Ian Samulde." }));
      return;
    }
    void handleConvertDwg(request, response);
    return;
  }

  const filePath = resolvePath(request.url || "/");
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`FTTH KMZ to AutoCAD is running at http://127.0.0.1:${port}`);
  void checkRemoteKillSwitch();
  void recordUsageEvent({
    event: "SERVER_START",
    summary: `Local FTTH server started on port ${port}`,
  });
});
