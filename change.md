# Change log (session work)

Summary of refactors and fixes applied to this codebase during the wardrobe extraction and related work, including **link ingestion** (`/api/ingest-link`, local image persistence) and **mood alignment** on link import (chic mood constants, pills in the modal, `mood` on items and cards).

---

## 1. Wardrobe state: `useWardrobe` hook (`src/hooks/useWardrobe.js`)

**Goal:** Move wardrobe concerns out of `App.js` into a dedicated hook.

**What moved into the hook**

- `wardrobe` React state.
- **Mutations:** `addItem`, `updateItem`, `removeItem` (prepend on add, merge patch on update, filter on remove).
- **Persistence:** `localStorage` key `fos_wardrobe` (`STORAGE_WARDROBE`), using `stripWardrobeForStorage` so the stored JSON shape matches the previous behavior (same fields as before).
- **Server cleanup on remove:** DELETE to the local image API when `imageFilename` is set; `URL.revokeObjectURL` for `blob:` previews.

**Public API**

- `const { wardrobe, addItem, updateItem, removeItem } = useWardrobe(hydrated);`
- The hook does **not** expose `setWardrobe`; no `replaceWardrobe` was required after removing one-off hydration from `App`.

**Hydration / load**

- Wardrobe is **read once** on init via `loadWardrobeFromStorage()` (safe `JSON.parse`, fallback `[]`, only accept an array).
- The existing **save** effect still runs only when `hydrated` is true, so the first paint does not overwrite storage before the app marks hydration complete.

**`App.js`**

- Imports and uses `useWardrobe` only for wardrobe; no direct `STORAGE_WARDROBE` import or `loadJson` / `setWardrobe` for wardrobe in the profile hydration effect.
- Upload flow (`addWardrobeFromFile`) uses `addItem(item)` instead of manual `setWardrobe` prepend.

**Intentionally unchanged**

- UI, `localStorage` format, and image upload/delete behavior.

---

## 2. Agent activity history: unique list keys (`src/hooks/useAgentActivity.js`)

**Issue:** React warned about duplicate keys like `Planner Agent-<timestamp>` when two history entries completed in the same millisecond.

**Fix:** `makeHistoryEntryId(agentName, completedAt)` appends a module-level monotonic counter so every history row id stays unique. Used in both `finishAgentRun` and `failAgentRun`.

**Note:** The console error *“A listener indicated an asynchronous response…”* is typical of browser extensions, not this app’s React code.

---

## 3. Link ingestion API (`server.js`, `src/services/mockProductLink.js`, `src/apiBase.js`)

**Goal:** Scrape product pages for Open Graph / structured data, persist images locally, and preview before adding to the wardrobe.

**Backend**

- **`POST /api/ingest-link`** (formerly `/api/mock-product-link`): `fetch` HTML, **Cheerio** for `og:image`, `twitter:image`, `og:title`, price meta + JSON-LD fallbacks; downloads the image into **`public/wardrobe-images/`** and returns **`imageUrl`**, **`localFilename`**, title, price, branding tags when matched, etc.
- Upload/delete responses use **`publicBase(req)`** for correct host in URLs.

**Client**

- **`fetchProductPreviewFromUrl`** posts to **`${REACT_APP_API_URL}`** (default `http://localhost:3001`) **`/api/ingest-link`**.
- **`WardrobeScreen`:** debounced preview after a valid URL; **Confirm Asset** calls **`confirmStoreImport`** with server payload; **`object-fit: contain`** on gallery and preview frames (`index.css`).

---

## 4. Mood alignment on link import (`src/constants/chicMoods.js`, `WardrobeScreen.js`, `App.js`, `useWardrobe.js`)

**Goal:** Require a psychological “mood” tag before confirming a link import; show it on cards.

**Constants:** `CHIC_WARDROBE_MOODS` — Confidence, Calm, Productivity, Focus, Joy.

**Data:** Wardrobe items may include **`mood`**; **`stripWardrobeForStorage`** persists it.

**UI:** After the scraped preview, **Mood alignment** — minimalist horizontal pill buttons (`0.8rem`, `1px` border); **Confirm Asset** disabled until a mood is selected. **`confirmStoreImport`** passes **`mood`** into **`addItem`**.

**Cards:** Tiny italic mood label next to the category row when **`it.mood`** is set (`.wardrobe-card-mood`).

---

## Files touched (high level)

| Area              | File(s)                          |
|-------------------|----------------------------------|
| Wardrobe hook     | `src/hooks/useWardrobe.js`       |
| App wiring        | `src/App.js`                     |
| Agent history ids | `src/hooks/useAgentActivity.js`  |
| Link ingest API   | `server.js`, `src/services/mockProductLink.js`, `src/apiBase.js` |
| Mood + link UI    | `src/constants/chicMoods.js`, `src/screens/WardrobeScreen.js`, `src/index.css` |

---

## Verification performed

- Production build (`npm run build`) succeeded after these changes.
- Wardrobe should still load after refresh, persist after hydration, and add/update/remove should behave as before.
