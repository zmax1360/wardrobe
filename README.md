# Fashion OS

A personal fashion web app built with **React** (Create React App). It includes onboarding, a wardrobe with AI cataloging, calendar events, an outfit planner with live weather, and profile settings. Data is stored in **localStorage**; wardrobe photos can be persisted via a small **Express** image server.

## Requirements

- **Node.js** 18+ (includes `fetch` used by `server.js`)
- npm

## Install

```bash
npm install
```

## Environment variables

Create a `.env` file in the project root for AI features (vision catalog + text planner). Only variables prefixed with `REACT_APP_` are exposed to the browser in CRA.

```env
# Prefer one of these (Anthropic is tried first, then OpenAI)
# For Closet scan + `/api/chat` on the Express server (`server.js`), also set server-side key:
ANTHROPIC_API_KEY=sk-ant-...

REACT_APP_ANTHROPIC_API_KEY=sk-ant-...
REACT_APP_OPENAI_API_KEY=sk-...
```

Restart the dev server after changing `.env`.

### API authentication (Firebase Admin)

`server.js` verifies **Firebase ID tokens** on protected routes (`/api/chat`, Shopify proxies, ingest, `upload-image`). For local dev choose one:

1. **`serviceAccountKey.json`** at the repo root (from Firebase Console → Project settings → Service accounts → Generate new private key), **or**
2. **Environment variables** (same shape as Vercel): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (newline escapes as `\n` in `.env`).

The React app attaches `Authorization: Bearer <idToken>` when the user is signed in.

**Vercel** (`api/chat.js`): set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (values from the same service account JSON) plus `ANTHROPIC_API_KEY`.

Allowed CORS origins in `server.js` include `http://localhost:3000` and production `fashionos.app` hosts — add yours if deploying elsewhere.

## Run the app

**Recommended** — starts the React app **and** the image API together:

```bash
npm start
```

- **Web (CRA):** [http://localhost:3000](http://localhost:3000)
- **Image API:** [http://localhost:3001](http://localhost:3001)

`npm start` also enables **`POST /api/chat`** for AI (Closet photo scan, catalogue): Create React App proxies `/api/chat` → **Express on 3001** (`proxy` in `package.json`). Vercel uses `api/chat.js` for the same path in production.

Wardrobe uploads POST to port **3001**. If the API is not running, the app falls back to in-memory blob URLs (images disappear on refresh).

**`npm run start:client`** runs only CRA on 3000 — **`/api/chat` returns 404** unless you run `node server.js` separately and configure your own proxy, or browse with the full **`npm start`** stack.

Other scripts:

| Script | Purpose |
|--------|---------|
| `npm run start:client` | React only (port 3000) |
| `npm run server` | Image server only (port 3001) |
| `npm run build` | Production build of the React app |
| `npm run dev` | Same as `npm start` |

## Features (high level)

- **Onboarding / profile** — Name, gender, body type, budget, styles, brands, sizes; saved as `fos_profile`.
- **Wardrobe** — Upload photos; optional AI labeling (Claude or GPT-4o vision). Items stored as `fos_wardrobe` with laundry state, tags, and planner integration.
- **Calendar** — Events with dress code and occasion; `fos_events`.
- **Planner** — Everyday or event-based outfit suggestions using **clean** items only; uses browser geolocation + Open-Meteo for weather when permitted.

## Python orchestrator (optional)

A separate CLI lives in `orchestrator.py` (Anthropic / OpenAI / LM Studio routing). Python deps:

```bash
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` (or `OPEN_AI_KEY`) as documented in that file, then run `python orchestrator.py`.

## Project layout

```
fashion-os/
├── server.js          # Express: uploads → public/wardrobe-images/
├── src/
│   ├── App.js         # Main UI (single-file app)
│   └── index.js
├── public/
├── package.json
├── orchestrator.py    # Optional multi-agent CLI
└── requirements.txt
```

Uploaded images are written under `public/wardrobe-images/`. Add that folder to `.gitignore` if you do not want uploads in version control.

## License

Private / personal use unless you add your own license.
