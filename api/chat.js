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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ANTHROPIC_API_KEY } =
    process.env;
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.error("api/chat: Firebase Admin env vars missing");
    return res.status(500).json({ error: "Server auth not configured", code: "admin_config" });
  }
  if (!ANTHROPIC_API_KEY) {
    console.error("api/chat: ANTHROPIC_API_KEY missing");
    return res.status(500).json({ error: "AI service not configured", code: "ai_config" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ error: "Unauthorized", code: "missing_token" });
  }

  try {
    await getAuth().verifyIdToken(token);
  } catch (err) {
    console.error("api/chat: verifyIdToken failed:", err?.message || err);
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
  res.status(response.status).json(data);
}
