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
REACT_APP_ANTHROPIC_API_KEY=sk-ant-...
REACT_APP_OPENAI_API_KEY=sk-...
```

Restart the dev server after changing `.env`.

## Run the app

**Recommended** — starts the React app **and** the image API together:

```bash
npm start
```

- **Web (CRA):** [http://localhost:3000](http://localhost:3000)
- **Image API:** [http://localhost:3001](http://localhost:3001)

Wardrobe uploads POST to port **3001**. If the API is not running, the app falls back to in-memory blob URLs (images disappear on refresh).

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
