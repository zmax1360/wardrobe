# Change log (session work)

Summary of refactors and fixes applied to this codebase during the wardrobe extraction and related work, including **manual closet entry** (replacing client-side link scraping), optional **`sourceUrl`** bookmarking, **local image upload** (`/api/upload-image`), **mood** on items and cards (`CHIC_WARDROBE_MOODS`), and a **responsive Add to closet** modal (scroll + compact mobile layout).

---

## 1. Wardrobe state: `useWardrobe` hook (`src/hooks/useWardrobe.js`)

**Goal:** Move wardrobe concerns out of `App.js` into a dedicated hook.

**What moved into the hook**

- `wardrobe` React state.
- **Mutations:** `addItem`, `updateItem`, `removeItem` (prepend on add, merge patch on update, filter on remove).
- **Persistence:** `localStorage` key `fos_wardrobe` (`STORAGE_WARDROBE`), using `stripWardrobeForStorage` so the stored JSON shape matches the previous behavior (same fields as before), including **`sourceUrl`** when present.
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
- **`addManualWardrobeItem`** builds items from the Manual tab: optional **`POST /api/upload-image`**, defaults (`timesWorn: 0`, `lastWorn: null`, `laundryStatus: "clean"`), **`tags: ["manual-entry", …brand]`**, no scraping.

**Intentionally unchanged**

- UI patterns, `localStorage` format, and image upload/delete behavior aside from the above.

---

## 2. Agent activity history: unique list keys (`src/hooks/useAgentActivity.js`)

**Issue:** React warned about duplicate keys like `Planner Agent-<timestamp>` when two history entries completed in the same millisecond.

**Fix:** `makeHistoryEntryId(agentName, completedAt)` appends a module-level monotonic counter so every history row id stays unique. Used in both `finishAgentRun` and `failAgentRun`.

**Note:** The console error *“A listener indicated an asynchronous response…”* is typical of browser extensions, not this app’s React code.

---

## 3. Link ingestion API vs. Manual tab (`server.js`, `WardrobeScreen.js`, `App.js`)

**Current product behavior**

- The **Add to closet** modal uses **Photo** (unchanged) and **Manual** (replaces the old **Link** tab).
- **Manual** is a full form: required name, category, purchase price; optional details (color, brand, season/occasion pills, material, notes, mood); optional image via the same upload path as Photo; optional **Product URL** stored only as **`sourceUrl`** — **no fetch, no scrape, no preview from URL**.
- Items from Manual use **`tags`** including **`manual-entry`** (and brand when provided).

**Backend (retained for future use)**

- **`POST /api/ingest-link`** and related routes remain in **`server.js`** for a future flow (e.g. Shopify MCP). They are **not** called by the React client after removal of client-side scraping.
- Image persistence for user uploads continues to use **`/api/upload-image`** and **`public/wardrobe-images/`** as before.

**Removed client code**

- **`src/services/mockProductLink.js`** removed; no **`fetchProductPreviewFromUrl`** or link-preview/finalize wiring in the app.

---

## 4. Mood on wardrobe items (`src/constants/chicMoods.js`, `WardrobeScreen.js`, `App.js`, `useWardrobe.js`)

**Constants:** `CHIC_WARDROBE_MOODS` — Confidence, Calm, Productivity, Focus, Joy.

**Data:** Wardrobe items may include **`mood`**; **`stripWardrobeForStorage`** persists it.

**UI:** The Manual tab includes optional **Mood** single-select pills. **`addManualWardrobeItem`** passes **`mood`** into **`addItem`**.

**Cards:** Tiny italic mood label next to the category row when **`it.mood`** is set (`.wardrobe-card-mood`).

---

## 5. Add to closet modal: responsive layout (`WardrobeScreen.js`, `src/index.css`)

**Goal:** Keep the Photo and Manual flows usable on small viewports without the dialog feeling oversized or taller than the screen.

**Markup**

- Backdrop: **`wardrobe-add-modal-backdrop`** (replaces inline-only padding).
- Dialog: **`wardrobe-add-modal-dialog`** — **`max-height`** capped (with **`overflow-y: auto`**) so long Manual forms scroll inside the panel instead of stretching the viewport.
- Title and lede: **`wardrobe-add-modal-title`**, **`wardrobe-add-modal-lede`** for breakpoint-specific type scale.

**Desktop / tablet**

- Backdrop padding **24px**; dialog padding **28px**, **`max-height: min(88vh, 900px)`**.

**Narrow screens (`max-width: 540px`)**

- Tighter backdrop (**12px**) and dialog padding; dialog **anchors to the bottom** (rounded top corners only), **`max-height: min(85vh, …)`**, bottom padding includes **`env(safe-area-inset-bottom)`** for notched devices.
- Manual tab: smaller labels/inputs, **shorter image dropzone** and preview height, slightly smaller pills and **Add to Wardrobe** button so the sheet feels denser.

---

## Files touched (high level)

| Area              | File(s)                          |
|-------------------|----------------------------------|
| Wardrobe hook     | `src/hooks/useWardrobe.js`       |
| App wiring        | `src/App.js`                     |
| Agent history ids | `src/hooks/useAgentActivity.js`  |
| Ingest (server only, future) | `server.js` (routes kept) |
| Manual tab + mood + modal layout | `src/constants/chicMoods.js`, `src/screens/WardrobeScreen.js`, `src/index.css` |

---

## Verification performed

- Production build (`npm run build`) succeeded after these changes.
- Wardrobe should still load after refresh, persist after hydration, and add/update/remove should behave as before.

---

### [Date: 2026-04-19] - Wardrobe quick-add mobile + AI error copy

**Background:**
The wardrobe quick-add area was drag-and-drop only, which is awkward on phones. Missing API keys surfaced a developer-oriented “No AI key” string to end users.

**Changed:**

- `src/screens/WardrobeScreen.js`
- `src/App.js`
- `src/services/aiService.js`

**Impact:**
Quick add keeps drag-and-drop on desktop; “+ Add Photo” uses a separate hidden file input with `capture="environment"` for camera-first mobile flows. AI-misconfiguration errors show a generic user-facing message instead of env var names.

---

### [Date: 2026-04-19] - Image upload URL + production gating

**Background:**
`REACT_APP_API_URL` values that included a path (e.g. under `/api/audit`) produced malformed URLs like `/api/audit/api/upload-image` when concatenated with `/api/upload-image`. Image upload should not run against the local Express server from production hosts.

**Changed:**

- `src/apiBase.js`
- `src/App.js`
- `src/hooks/useWardrobe.js`

**Impact:**
`resolveBackendApiPath` joins absolute `/api/...` paths with the configured base using the URL API so path segments are not doubled. Wardrobe image upload (`uploadImageToServer`) is skipped unless the page is served from **localhost** or **127.0.0.1**, surfacing **Photo upload coming soon** on other hosts. Legacy delete-image requests use the same resolver. Anthropic requests remain unchanged (`https://api.anthropic.com`).

---

### [Date: 2026-04-20] - Mobile photo picker + More sheet

**Background:**
Mobile wardrobe uploads should work without any local Express server dependency. Navigation needed a mobile-first bottom bar with a “More” menu instead of cramming every destination into tabs.

**Changed:**

- `src/App.js`
- `src/screens/WardrobeScreen.js`
- `src/layout/AppLayout.js`
- `src/index.css`

**Impact:**
Wardrobe photos are now stored **client-side** as base64 **data URLs** (persisted in localStorage via wardrobe storage), and the app no longer posts image files to `/api/upload-image`. Mobile bottom tabs now expose **Home / Wardrobe / Planner / Shop / More**, with a slide-up sheet for the remaining destinations plus Activity/Logout.

---
