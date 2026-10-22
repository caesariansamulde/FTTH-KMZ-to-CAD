import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform, release, arch, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// ============================================================================
// DEFAULT AUTHOR TELEMETRY & KILL-SWITCH ENDPOINTS
// You can set these defaults here before packaging the .exe, or update them
// via the Author Telemetry Settings panel or environment variables.
// ============================================================================
const DEFAULT_WEBHOOK_URL =
  process.env.FTTH_TELEMETRY_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbzcWyNP8xAHasoXaYkvRK_0Vcrm3HMDA7BtP226Kx2PIGEZTq-VtNNCGZw0faitNkuB/exec";
const DEFAULT_KILLSWITCH_URL =
  process.env.FTTH_LICENSE_KILLSWITCH_URL ||
  "https://script.google.com/macros/s/AKfycbzcWyNP8xAHasoXaYkvRK_0Vcrm3HMDA7BtP226Kx2PIGEZTq-VtNNCGZw0faitNkuB/exec";

function getAppDataDir() {
  const localAppData =
    process.env.LOCALAPPDATA ||
    join(homedir(), "AppData", "Local");
  const dir = join(localAppData, "FTTH-KMZ-to-CAD");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return workspaceRoot;
  }
}

const appDataDir = getAppDataDir();
const auditLogPath = join(appDataDir, "usage-audit.jsonl");
const workspaceAuditDir = join(workspaceRoot, "exports");
const workspaceAuditPath = join(workspaceAuditDir, "usage-audit.jsonl");
const queueFilePath = join(appDataDir, "telemetry-queue.json");
const configFilePath = join(appDataDir, "telemetry-config.json");
const revokedLockPath = join(appDataDir, ".license-revoked.json");

export function getMachineIdentity() {
  let user = "unknown";
  try {
    user = userInfo().username || process.env.USERNAME || process.env.USER || "unknown";
  } catch {
    user = process.env.USERNAME || process.env.USER || "unknown";
  }
  const host = hostname() || process.env.COMPUTERNAME || "unknown-host";
  const osInfo = `${platform()} ${release()} (${arch()})`;
  const machineId = createHash("sha256")
    .update(`${host}:${user}:${osInfo}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  return {
    hostname: host,
    username: user,
    domainUser: `${host}\\${user}`,
    osInfo,
    machineId,
  };
}

export function loadTelemetryConfig() {
  let saved = {};
  try {
    if (existsSync(configFilePath)) {
      saved = JSON.parse(readFileSync(configFilePath, "utf8"));
    }
  } catch {
    // Ignore read errors
  }
  return {
    webhookUrl: saved.webhookUrl || DEFAULT_WEBHOOK_URL || "",
    killSwitchUrl: saved.killSwitchUrl || DEFAULT_KILLSWITCH_URL || "",
    updatedAt: saved.updatedAt || null,
  };
}

export function saveTelemetryConfig(update) {
  const current = loadTelemetryConfig();
  const next = {
    webhookUrl: typeof update.webhookUrl === "string" ? update.webhookUrl.trim() : current.webhookUrl,
    killSwitchUrl: typeof update.killSwitchUrl === "string" ? update.killSwitchUrl.trim() : current.killSwitchUrl,
    updatedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(configFilePath, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // Ignore write errors
  }
  return next;
}

export function getRevocationState() {
  try {
    if (existsSync(revokedLockPath)) {
      const data = JSON.parse(readFileSync(revokedLockPath, "utf8"));
      if (data && data.revoked) {
        return {
          revoked: true,
          reason:
            data.reason ||
            "This software license has been revoked by the author (Caesar Ian Samulde). Unauthorized use is prohibited.",
          revokedAt: data.revokedAt || null,
        };
      }
    }
  } catch {
    // Ignore read errors
  }
  return { revoked: false, reason: "", revokedAt: null };
}

function setRevocationState(revoked, reason = "") {
  try {
    if (revoked) {
      writeFileSync(
        revokedLockPath,
        JSON.stringify(
          {
            revoked: true,
            reason:
              reason ||
              "This software license has been revoked by the author (Caesar Ian Samulde). Unauthorized use is prohibited.",
            revokedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
    } else if (existsSync(revokedLockPath)) {
      writeFileSync(revokedLockPath, JSON.stringify({ revoked: false }, null, 2), "utf8");
    }
  } catch {
    // Ignore write errors
  }
}

export async function checkRemoteKillSwitch() {
  const config = loadTelemetryConfig();
  if (!config.killSwitchUrl) {
    return getRevocationState();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const separator = config.killSwitchUrl.includes("?") ? "&" : "?";
    const url = `${config.killSwitchUrl}${separator}_t=${Date.now()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const text = (await res.text()).trim();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Plain text kill-switch support (e.g. raw gist with "REVOKED" or "ACTIVE")
      }

      if (parsed && typeof parsed === "object") {
        const statusStr = String(parsed.status || "").toUpperCase();
        const isRevoked =
          parsed.revoked === true ||
          parsed.active === false ||
          statusStr === "REVOKED" ||
          statusStr === "DISABLED" ||
          statusStr === "TERMINATED";
        const isReactivated =
          parsed.revoked === false ||
          parsed.active === true ||
          statusStr === "ACTIVE" ||
          statusStr === "OK";

        if (isRevoked) {
          const msg =
            parsed.message ||
            parsed.reason ||
            "License terminated by Caesar Ian Samulde. Continued usage of this software without authorization is strictly prohibited.";
          setRevocationState(true, msg);
          return getRevocationState();
        } else if (isReactivated) {
          setRevocationState(false);
          return { revoked: false, reason: "", revokedAt: null };
        }
      } else {
        const upper = text.toUpperCase();
        if (upper.startsWith("REVOKED") || upper.startsWith("DISABLED") || upper.startsWith("TERMINATED")) {
          const customReason = text.includes(":") ? text.split(":").slice(1).join(":").trim() : "";
          setRevocationState(true, customReason);
          return getRevocationState();
        } else if (upper.startsWith("ACTIVE") || upper.startsWith("OK")) {
          setRevocationState(false);
          return { revoked: false, reason: "", revokedAt: null };
        }
      }
    }
  } catch {
    // Offline or unreachable; fall back to cached state
  }

  return getRevocationState();
}

function appendLocalAuditRecord(record) {
  const line = JSON.stringify(record) + "\n";
  try {
    appendFileSync(auditLogPath, line, "utf8");
  } catch {
    // Ignore error
  }
  try {
    if (!existsSync(workspaceAuditDir)) mkdirSync(workspaceAuditDir, { recursive: true });
    appendFileSync(workspaceAuditPath, line, "utf8");
  } catch {
    // Ignore error
  }
}

export function readRecentAuditLogs(limit = 50) {
  try {
    const target = existsSync(auditLogPath)
      ? auditLogPath
      : existsSync(workspaceAuditPath)
        ? workspaceAuditPath
        : null;
    if (!target) return [];
    const lines = readFileSync(target, "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadOfflineQueue() {
  try {
    if (existsSync(queueFilePath)) {
      const list = JSON.parse(readFileSync(queueFilePath, "utf8"));
      if (Array.isArray(list)) return list;
    }
  } catch {
    // Ignore
  }
  return [];
}

function saveOfflineQueue(list) {
  try {
    writeFileSync(queueFilePath, JSON.stringify(list.slice(-100), null, 2), "utf8");
  } catch {
    // Ignore
  }
}

function formatDiscordPayload(record) {
  const eventColors = {
    APP_LAUNCH: 0x16a34a, // Green
    KMZ_CONVERT: 0x2563eb, // Blue
    EXPORT_DWG: 0xdc2626, // Red
    EXPORT_DXF: 0xd97706, // Amber
    EXPORT_CSV: 0x7c3aed, // Purple
    TEST_PING: 0x0284c7, // Cyan
  };
  const color = eventColors[record.event] || 0x475569;
  const fields = [
    { name: "👤 User / Machine", value: `\`${record.machine.domainUser}\``, inline: true },
    { name: "🔑 Machine ID", value: `\`${record.machine.machineId}\``, inline: true },
    { name: "📦 App Version", value: `\`v${record.appVersion || "2.2.8"}\``, inline: true },
  ];

  if (record.fileName) {
    fields.push({ name: "📄 File Name", value: `\`${record.fileName}\``, inline: true });
  }
  if (record.converterMode) {
    fields.push({
      name: "🛠️ Mode / Provider",
      value: `${record.converterMode} (${(record.telcoProvider || "globe").toUpperCase()})`,
      inline: true,
    });
  }
  if (typeof record.totalObjects === "number") {
    fields.push({ name: "📊 Total Objects", value: String(record.totalObjects), inline: true });
  }
  if (record.summary) {
    fields.push({ name: "📋 Breakdown Summary", value: String(record.summary).slice(0, 1000), inline: false });
  }
  fields.push({ name: "💻 OS Platform", value: record.machine.osInfo, inline: true });
  fields.push({ name: "🕒 Timestamp", value: record.timestamp, inline: true });

  return {
    username: "FTTH Usage & License Monitor",
    embeds: [
      {
        title: `🔔 FTTH Tool Activity: ${record.event}`,
        description: record.revoked
          ? "⚠️ **ALERT: Activity attempted on a REVOKED license!**"
          : "Authorized / monitored session activity recorded.",
        color,
        fields,
        footer: {
          text: "FTTH KMZ to AutoCAD Converter • © Caesar Ian Samulde",
        },
        timestamp: record.timestamp,
      },
    ],
  };
}

async function sendSingleRecordToWebhook(webhookUrl, record) {
  const isDiscord = /discord(?:app)?\.com\/api\/webhooks\//i.test(webhookUrl);
  const body = isDiscord ? JSON.stringify(formatDiscordPayload(record)) : JSON.stringify(record);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": isDiscord ? "application/json" : "text/plain;charset=utf-8",
      },
      body,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // If Google Apps Script redirected to accounts.google.com login page (Who has access != Anyone), treat as not delivered yet
    if (res.url && /accounts\.google\.com/i.test(res.url)) {
      return false;
    }

    // If the webhook is a Google Apps Script that also returns kill-switch JSON:
    if (res.ok && !isDiscord) {
      try {
        const text = await res.text();
        const json = JSON.parse(text);
        if (json && (json.revoked === true || String(json.status).toUpperCase() === "REVOKED")) {
          setRevocationState(true, json.message || json.reason || "");
        } else if (json && (json.revoked === false || String(json.status).toUpperCase() === "ACTIVE")) {
          setRevocationState(false);
        }
      } catch {
        // Non-JSON response is normal
      }
    }
    return res.ok || res.status === 204;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

export async function recordUsageEvent(eventData = {}) {
  const machine = getMachineIdentity();
  const revocation = getRevocationState();
  const modeVal = eventData.mode || eventData.converterMode || "";
  const providerVal = eventData.provider || eventData.telcoProvider || "";
  const itemCountVal =
    typeof eventData.itemCount === "number"
      ? eventData.itemCount
      : typeof eventData.totalObjects === "number"
        ? eventData.totalObjects
        : 0;
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    event: eventData.event || "USAGE_EVENT",
    appVersion: eventData.appVersion || "2.2.8",
    mode: modeVal,
    converterMode: modeVal,
    provider: providerVal,
    telcoProvider: providerVal,
    fileName: eventData.fileName || "",
    itemCount: itemCountVal,
    totalObjects: itemCountVal,
    summary: eventData.summary || "",
    revoked: revocation.revoked,
    machine,
  };

  // 1. Always write to local persistent audit log
  appendLocalAuditRecord(record);

  // 2. Dispatch to remote webhook (and flush any offline queued records)
  const config = loadTelemetryConfig();
  let webhookDelivered = false;
  if (config.webhookUrl) {
    const queue = loadOfflineQueue();
    queue.push(record);
    const remaining = [];
    for (const item of queue) {
      const ok = await sendSingleRecordToWebhook(config.webhookUrl, item);
      if (!ok) {
        remaining.push(item);
      } else if (item.id === record.id) {
        webhookDelivered = true;
      }
    }
    saveOfflineQueue(remaining);
  }

  // 3. Check remote kill-switch asynchronously
  const latestRevocation = await checkRemoteKillSwitch();

  return {
    ok: true,
    webhookDelivered,
    revocation: latestRevocation,
    record,
  };
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (err) {
        rejectBody(err);
      }
    });
    request.on("error", rejectBody);
  });
}

export function isUsageApiRequest(request) {
  const url = request.url || "";
  return (
    url.startsWith("/api/usage-log") ||
    url.startsWith("/api/usage-status") ||
    url.startsWith("/api/usage-config")
  );
}

export async function handleUsageApiRequest(request, response) {
  const url = (request.url || "").split("?")[0];

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  try {
    if (url === "/api/usage-status" && request.method === "GET") {
      const revocation = await checkRemoteKillSwitch();
      const config = loadTelemetryConfig();
      const machine = getMachineIdentity();
      const recentLogs = readRecentAuditLogs(40);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          ok: true,
          machine,
          revocation,
          config: {
            hasWebhook: Boolean(config.webhookUrl),
            hasKillSwitch: Boolean(config.killSwitchUrl),
            webhookConfigured: Boolean(config.webhookUrl),
            killSwitchConfigured: Boolean(config.killSwitchUrl),
            webhookUrl: config.webhookUrl,
            killSwitchUrl: config.killSwitchUrl,
            auditLogPath,
            updatedAt: config.updatedAt,
          },
          recentLogs,
        }),
      );
      return;
    }

    if (url === "/api/usage-log" && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = await recordUsageEvent(body);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
      return;
    }

    if (url === "/api/usage-config" && request.method === "POST") {
      const body = await readJsonBody(request);
      const providedKey = body.passkey || body.authorKey || "";
      if (providedKey !== "samulde2026" && providedKey !== "caesar2026") {
        response.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid author passkey." }));
        return;
      }
      if (typeof body.manualRevoke === "boolean") {
        setRevocationState(body.manualRevoke, body.revokeReason || "");
      }
      const nextConfig = saveTelemetryConfig(body);
      let testResult = null;
      if (body.testPing || body.sendTestPing) {
        testResult = await recordUsageEvent({
          event: "TEST_PING",
          mode: "pole_survey",
          provider: "globe",
          fileName: "AUTHOR_TEST_PING.kmz",
          itemCount: 1,
          summary: "Author verified remote telemetry webhook & kill-switch configuration.",
        });
      }
      const revocation = await checkRemoteKillSwitch();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          ok: true,
          config: nextConfig,
          revocation,
          testResult,
        }),
      );
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Unknown usage API endpoint." }));
  } catch (err) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: err instanceof Error ? err.message : "Telemetry handler error." }));
  }
}
