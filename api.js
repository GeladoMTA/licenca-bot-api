import express from "express";
import { db, logAccess } from "./db.js";

export function makeApi() {
  const app = express();
  app.use(express.json({ limit: "32kb" }));

  const getIp = (req) =>
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "unknown";

  function validateLicense({ licenseKey, hwid, isActivate }) {
    const row = db.prepare("SELECT * FROM licenses WHERE key = ?").get(licenseKey);

    if (!row) return { ok: false, error: "invalid_key" };
    if (row.status !== "active") return { ok: false, error: "blocked" };

    const exp = Date.parse(row.expires_at);
    if (!exp || Date.now() > exp) return { ok: false, error: "expired" };

    if (!row.hwid) {
      if (!isActivate) return { ok: false, error: "not_activated" };

      db.prepare("UPDATE licenses SET hwid = ?, bound_at = datetime('now') WHERE key = ?")
        .run(hwid, licenseKey);

      return { ok: true, activated: true, expires_at: row.expires_at };
    }

    if (row.hwid !== hwid) return { ok: false, error: "hwid_mismatch" };
    return { ok: true, activated: true, expires_at: row.expires_at };
  }

  app.post("/activate", (req, res) => {
    const ip = getIp(req);
    const licenseKey = (req.body?.key || "").trim();
    const hwid = (req.body?.hwid || "").trim();

    if (!licenseKey || !hwid) {
      logAccess({ key: licenseKey, hwid, ip, action: "activate", ok: false, error: "missing_key_or_hwid" });
      return res.status(400).json({ ok: false, error: "missing_key_or_hwid" });
    }

    const out = validateLicense({ licenseKey, hwid, isActivate: true });
    logAccess({ key: licenseKey, hwid, ip, action: "activate", ok: out.ok, error: out.ok ? null : out.error });
    return res.status(out.ok ? 200 : 403).json(out);
  });

  app.post("/validate", (req, res) => {
    const ip = getIp(req);
    const licenseKey = (req.body?.key || "").trim();
    const hwid = (req.body?.hwid || "").trim();

    if (!licenseKey || !hwid) {
      logAccess({ key: licenseKey, hwid, ip, action: "validate", ok: false, error: "missing_key_or_hwid" });
      return res.status(400).json({ ok: false, error: "missing_key_or_hwid" });
    }

    const out = validateLicense({ licenseKey, hwid, isActivate: false });
    logAccess({ key: licenseKey, hwid, ip, action: "validate", ok: out.ok, error: out.ok ? null : out.error });
    return res.status(out.ok ? 200 : 403).json(out);
  });

  // Health check
  app.get("/", (_, res) => res.send("OK"));

  return app;
}
