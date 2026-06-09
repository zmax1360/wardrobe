import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

function logChat(event, details = {}) {
  console.log(JSON.stringify({ scope: "api/chat", event, ...details }));
}

export default async function handler(req, res) {
  const requestId = req.headers["x-vercel-id"] || req.headers["x-request-id"] || "unknown";

  if (req.method !== "POST") return res.status(405).end();

  logChat("request", {
    requestId,
    method: req.method,
    userAgent: req.headers["user-agent"] || "unknown",
    model: req.body?.model || null,
  });

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ANTHROPIC_API_KEY } =
    process.env;

  const missingAdmin = [
    !FIREBASE_PROJECT_ID && "FIREBASE_PROJECT_ID",
    !FIREBASE_CLIENT_EMAIL && "FIREBASE_CLIENT_EMAIL",
    !FIREBASE_PRIVATE_KEY && "FIREBASE_PRIVATE_KEY",
  ].filter(Boolean);

  if (missingAdmin.length) {
    logChat("admin_config_missing", { requestId, missing: missingAdmin });
    return res.status(500).json({ error: "Server auth not configured", code: "admin_config" });
  }
  if (!ANTHROPIC_API_KEY) {
    logChat("ai_config_missing", { requestId });
    return res.status(500).json({ error: "AI service not configured", code: "ai_config" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    logChat("auth_missing_token", { requestId });
    return res.status(401).json({ error: "Unauthorized", code: "missing_token" });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    logChat("auth_ok", {
      requestId,
      uid: decoded.uid,
      projectId: FIREBASE_PROJECT_ID,
      tokenLength: token.length,
    });
  } catch (err) {
    logChat("auth_invalid_token", {
      requestId,
      projectId: FIREBASE_PROJECT_ID,
      tokenLength: token.length,
      error: err?.message || String(err),
      code: err?.code || null,
    });
    return res.status(401).json({ error: "Unauthorized", code: "invalid_token" });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(req.body),
  });

  const data = await response.json();
  logChat("anthropic_response", {
    requestId,
    status: response.status,
    model: req.body?.model || null,
  });
  res.status(response.status).json(data);
}
