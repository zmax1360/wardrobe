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

### [Date: 2026-04-20] - Anthropic proxy + client-only images

**Background:**
Anthropic calls should not ship API keys to the browser, and image labeling/upload should work without any dependency on `server.js` or a localhost upload endpoint.

**Changed:**

- `api/chat.js`
- `src/App.js`
- `src/services/aiService.js`
- `src/hooks/useWardrobeAgent.js`

**Impact:**
All Anthropic `/v1/messages` requests now go through `/api/chat` (Vercel serverless) with `ANTHROPIC_API_KEY` read server-side. Browser code no longer sends `x-api-key` headers. Wardrobe images remain stored client-side as base64 data URLs in localStorage (`fos_wardrobe`).

---

### [Date: 2026-04-20] - Client image compression before AI + storage

**Background:**
Raw camera photos are large; we should compress images client-side before sending them to `/api/chat` and before persisting to localStorage.

**Changed:**

- `src/App.js`

**Impact:**
Every selected wardrobe image is now downscaled to max width 800px and encoded as JPEG at quality 0.6 via a canvas-based `compressImage()` function. The compressed data URL is used for both AI labeling and wardrobe storage.

---

### [Date: 2026-04-27] - Extract Theme Constants

**Background:**
`src/App.js` should stop importing shared theme primitives from the style module directly as part of the staged TypeScript extraction.

**Changed:**

- `src/App.js`
- `src/constants/colors.ts`
- `src/constants/theme.ts`
- `src/constants/index.ts`
- `tsconfig.json`
- `package.json`
- `package-lock.json`

**Impact:**
Theme color and transition values are now available from `src/constants`. TypeScript dev dependencies and `tsconfig.json` were added because this branch did not yet resolve `.ts` modules. Runtime behavior is unchanged.

---

### [Date: 2026-04-27] - Extract Planner Screen

**Background:**
`src/App.js` was too large, and the planner agent needed to be moved out without changing its behavior.

**Changed:**

- `src/App.js`
- `src/screens/PlannerScreen.js`

**Impact:**
Planner UI and planning logic now live in `PlannerScreen`. `App.js` renders `PlannerScreen` directly and passes the same data/helper dependencies as props. No behavior changes intended.

---

### [Date: 2026-04-27] - Extract Designer Screen

**Background:**
`src/App.js` was too large, and the designer agent needed to be moved out without changing its behavior.

**Changed:**

- `src/App.js`
- `src/screens/DesignerScreen.js`

**Impact:**
Designer UI and outfit-generation logic now live in `DesignerScreen`. `App.js` renders `DesignerScreen` directly and passes the same data/helper dependencies as props. No behavior changes intended.

---

### [Date: 2026-04-27] - Extract Evaluator Screen

**Background:**
`src/App.js` was too large, and the evaluator agent needed to be moved out without changing its behavior.

**Changed:**

- `src/App.js`
- `src/screens/EvaluatorScreen.js`

**Impact:**
Evaluator UI and outfit-review logic now live in `EvaluatorScreen`. `App.js` renders `EvaluatorScreen` directly and passes the same data/helper dependencies as props. No behavior changes intended.

---

### [Date: 2026-04-27] - Extract Calendar Screen

**Background:**
`src/App.js` was too large, and the calendar agent needed to be moved out without changing its behavior.

**Changed:**

- `src/App.js`
- `src/screens/CalendarScreen.js`

**Impact:**
Calendar UI and event management logic now live in `CalendarScreen`. `App.js` renders `CalendarScreen` directly and passes the same data/helper dependencies as props. No behavior changes intended.

---

### [Date: 2026-04-27] - Extract Shopper Screen

**Background:**
`src/App.js` was too large, and the shopper agent needed to be moved out without changing its behavior.

**Changed:**

- `src/App.js`
- `src/screens/ShopperScreen.js`

**Impact:**
Shopper UI, Shopify search, wishlist, and outfit-shopping logic now live in `ShopperScreen`. `App.js` renders `ShopperScreen` directly and passes the same data/helper dependencies as props. No behavior changes intended.

---

### [Date: 2026-04-27] - Extract Profile and Onboarding Screens

**Background:**
`src/App.js` still contained large profile and onboarding UI blocks that needed to be moved out without changing behavior.

**Changed:**

- `src/App.js`
- `src/screens/ProfileScreen.js`
- `src/components/Onboarding.js`

**Impact:**
Profile editing and onboarding UI now live in dedicated components. `WardrobeScreen` was already extracted and remains imported from `src/screens/WardrobeScreen.js`. No behavior changes intended.

---

### [Date: 2026-04-28] - Fix Evaluator Prop Reference

**Background:**
The app crashed at runtime because `App.js` still passed a removed `buildOutfitDescription` helper into `EvaluatorScreen`.

**Changed:**

- `src/App.js`
- `src/screens/EvaluatorScreen.js`

**Impact:**
Removed the unused evaluator prop reference. No behavior changes intended.

---

### [Date: 2026-04-28] - Fix Evaluator Wardrobe Helper Reference

**Background:**
The app crashed at runtime because `App.js` still passed a removed `buildSelectedWardrobeList` helper into `EvaluatorScreen`.

**Changed:**

- `src/App.js`
- `src/screens/EvaluatorScreen.js`

**Impact:**
Removed unused evaluator helper props and passed the existing `mediaTypeForFile` helper required by photo evaluation. No behavior changes intended.

---

### [Date: 2026-04-28] - Extract App Utility Functions

**Background:**
`src/App.js` still contained shared helper, date, parser, and AI service functions that needed to be moved out without changing behavior.

**Changed:**

- `src/App.js`
- `src/utils/helpers.js`
- `src/utils/dateHelpers.js`
- `src/services/parsers.js`
- `src/services/anthropicExtended.js`

**Impact:**
Shared functions now live in utility and service modules and are imported back into `App.js`. Build passes with no behavior changes intended.

---

### [Date: 2026-04-28] - Extract Remaining App Constants and Agents

**Background:**
`src/App.js` still contained dead shopper code, the gap analysis screen implementation, shared constants, and Shopify helpers that needed to be moved out without changing behavior.

**Changed:**

- `src/App.js`
- `src/screens/GapAnalysisScreen.js`
- `src/constants/options.ts`
- `src/constants/agentOptions.ts`
- `src/constants/index.ts`
- `src/utils/helpers.js`
- `src/services/shopify.js`

**Impact:**
Deleted the dead `ShopperAgentOld` code, moved gap analysis into its screen file, and moved constants/helpers into shared modules. Build passes with no behavior changes intended.

---

### [Date: 2026-05-05] - CrewAI local-mode token trims

**Background:**
Local / SAST remediation runs were spending too many tokens on oversized file reads, full-file writes, and high agent iteration budgets. The crew needed caps, patch-oriented writes, and lower `max_iter` when `alert["local_mode"]` is set.

**Changed:**

- `agents/__init__.py` (new)
- `agents/crew.py` (new)
- `requirements.txt`

**Impact:**
Adds `crewai` as a Python dependency. Repo tools use `CREW_REPO_ROOT` (default `.`) and require `patch(1)` when applying unified diffs. If you already had a different `agents/crew.py` elsewhere, merge these behaviors into that file instead of duplicating.

---

### [Date: 2026-05-10] - Email auth: forgot password + clearer submit labels

**Background:**
Sign-in/sign-up lacked a password reset option, and the primary button always said “Get started free” even in sign-in mode, which was unclear next to “Already have an account? Sign In” on signup.

**Changed:**

- `src/App.js`

**Impact:**
Uses Firebase `sendPasswordResetEmail` with user-facing errors and a success hint. Toggle between login/signup clears reset messages; primary button now shows **Sign In** vs **Get started free** by mode.

---

### [Date: 2026-05-10] - Profile keyed by Firebase UID (onboarding for new accounts)

**Background:**
Profile lived in a single `localStorage` key, so a completed profile from the same browser made every new Firebase user look “already onboarded” (`profile.name` set).

**Changed:**

- `src/App.js`

**Impact:**
Profiles are stored under `fos_profile__${uid}`; legacy `fos_profile` migrates only when `fos_profile_legacy_owner` matches the signed-in user. New sign-ups with no keyed profile start onboarding again. Completing onboarding or saving profile clears the legacy global key. The wardrobe-agent hook still reads the legacy path only—a follow-up could read the per-user key when auth is wired there.

---

### [Date: 2026-05-10] - Mobile auth landing + default signup mode

**Background:**
Mobile landing needed a short value prop above the form, no duplicate logo, flatter full-width card styling, and email auth should open in sign-up mode by default.

**Changed:**

- `src/App.js`

**Impact:**
`<768px`: condensed logo, slogan, three text features, then form; in-card branding hidden on small screens only; login card uses `#faf7f2` with no border/shadow on mobile and 16px side padding on the column. Desktop right column unchanged. Initial `authMode` is `signup`.

---

### [Date: 2026-05-10] - Onboarding wardrobe demo step (first photo + AI card)

**Background:**
After the profile summary, users should upload one clothing photo, see an AI scanning state, then a catalog-style item card before entering the app.

**Changed:**

- `src/App.js`
- `src/components/Onboarding.js`

**Impact:**
Onboarding now has **7** steps plus a completion tick (**step 8** persists profile). Step 7 uses the existing `addWardrobeFromFile` pipeline (returns the new item for display) and adds the piece to the wardrobe. `goNextOnboarding` / `canAdvance` thresholds updated. Brief “Saving your profile…” state while step 8 finishes.

---

### [Date: 2026-05-10] - Closet scan modal mobile layout

**Background:**
Scan My Closet needed larger touch targets, bottom-sheet behavior on small screens, and responsive stats/actions.

**Changed:**

- `src/screens/WardrobeScreen.js`
- `src/index.css`

**Impact:**
Scan button `minHeight: 44`; modal uses `closet-scan-backdrop` / `closet-scan-dialog` (slides up on ≤640px with safe area); stats use `closet-scan-stats-grid`; actions stack full-width on mobile with `minHeight: 48` buttons; preview image uses `closet-scan-preview-img`. Header stacks scan + add at ≤480px.

---

### [Date: 2026-05-10] - Profile, events, wishlist Firestore dual-write (App)

**Background:**
Mirror profile, events, and wishlist to Firestore whenever they change (with localStorage unchanged) and hydrate from Firestore after login—without altering wardrobe or ShopperScreen code.

**Changed:**

- `src/App.js`

**Impact:**
`persistProfile` plus `events`/`wishlist` effects call `setDoc(..., { merge: true })` when signed in. The `firebaseUser` + `hydrated` effect runs legacy profile migration locally, then `getDoc`: merges remote profile only when local per-key cache is empty (`fos_profile__{uid}`); applies `events` / `wishlist` from cloud only when those arrays exist and `length > 0`. Wishlist stays in React in App with a 2s localStorage poll so Shopper’s writes still sync to Firestore. `snap.exists` (Firestore boolean) used with `merge: true` and sanitised payloads for Firestore-compatible JSON.

---
