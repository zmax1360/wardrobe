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

### [Date: 2026-05-11] - Requirements agent (idea → ticket JSON)

**Background:**
Agent pipeline needs a script that reads `agents/inbox/idea.json`, calls Claude Sonnet, and writes a structured ticket under `agents/tickets/`.

**Changed:**

- `agents/requirements-agent.js` (new)

**Impact:**
Requires `ANTHROPIC_API_KEY`; outputs `agents/tickets/<timestamp>-ticket.json`; creates `agents/tickets/` when missing; exits non-zero if idea/API/JSON parsing fails.

---

### [Date: 2026-05-10] - Dev agent (ticket → Claude edits, build, git push)

**Background:**
Automate implementing the latest structured ticket under `agents/tickets/`: Claude Sonnet proposes full-file replacements with a blocklist (no `.env`, lockfiles, `agents/`, `.github/`, etc.), backups and a 60% minimum size guard before write, then `npm run build`, commit, and push to `feature/<ticket-id>` via `PIPELINE_TOKEN`.

**Changed:**

- `agents/dev-agent.js` (new)

**Impact:**
Needs `ANTHROPIC_API_KEY` and `PIPELINE_TOKEN`; mutates tracked files listed in ticket `files_to_modify`, creates `agents/backups/*.bak`; on build or git failure restores from backups and exits non-zero.

---

### [Date: 2026-05-17] - Test agent (build + AI review → GitHub PR)

**Background:**
Add a validator that consumes the newest ticket under `agents/tickets/`, runs `npm run build`, asks Claude Sonnet whether each touched file satisfies the ticket acceptance criteria via strict JSON replies, then opens a PR (`feature/<ticket-id>` → `main`) when everything passes using `PIPELINE_TOKEN`.

**Changed:**

- `agents/test-agent.js` (new)

**Impact:**
Requires `ANTHROPIC_API_KEY` and `PIPELINE_TOKEN`; uses GitHub REST `POST /repos/{owner}/{repo}/pulls`; exits with code `1` and skips the PR if the build fails, Claude errors, malformed review JSON, or any file review reports `passed: false`.

---

### [Date: 2026-05-17] - Agent pipeline workflow (idea push → sequential agents)

**Background:**
Replace the GitHub Actions workflow so pushing `agents/inbox/idea.json` runs `npm ci` then Requirements, Dev, and Test agents in order with Anthropic and pipeline tokens.

**Changed:**

- `.github/workflows/agent-pipeline.yml`

**Impact:**
Triggers only on pushes touching `agents/inbox/idea.json`; checkout uses `PIPELINE_TOKEN`; needs repo secrets `ANTHROPIC_API_KEY` and `PIPELINE_TOKEN`. Prior workflow logic under this file is replaced entirely.

---

### [Date: 2026-05-17] - Gitignore agent backups

**Background:**
Dev-agent writes timestamped `.bak` copies under `agents/backups/`; those should not be committed as repo noise or redundant secrets risk.

**Changed:**

- `.gitignore`

**Impact:**
`agents/backups/` is ignored; existing tracked files in that path (if any) would remain tracked until removed from the index.

---

### [Date: 2026-05-17] - Agent pipeline: npm install before git config

**Background:**
Ensure `requirements`, `dev`, and `test` jobs install Node dependencies before running agents or configuring git-backed steps.

**Changed:**

- `workflows/agent-pipeline.yml`

**Impact:**
Adds `npm install` after `Setup Node.js` and before `Configure git` in each job; no other workflow edits.

---

### [Date: 2026-05-17] - Agent pipeline job conditions (dev/test)

**Background:**
Avoid running downstream jobs on pure failure chains while still allowing progress when prerequisite jobs were skipped.

**Changed:**

- `workflows/agent-pipeline.yml`

**Impact:**
`dev` uses `if: success() || needs.requirements.result == 'skipped'`; `test` uses `if: success() || needs.dev.result == 'skipped'` instead of `if: always()`.

---

### [Date: 2026-05-24] - SEO: static meta, SPA Helmet, sitemap & crawl headers

**Background:**
Fashion OS SPA on Vercel exposed almost no crawler-visible metadata; crawlers saw only the default title and the noscript line. Needed full head tags (OG/Twitter), JSON-LD, crawlable `#seo-content` in HTML, `react-helmet-async` defaults and login-specific titles, robots/sitemap, and `X-Robots-Tag`.

**Changed:**

- `public/index.html`
- `public/og-image-placeholder.txt` (new)
- `public/sitemap.xml` (new)
- `public/robots.txt` (new)
- `vercel.json`
- `package.json` / `package-lock.json` (`react-helmet-async`)
- `src/index.js`
- `src/App.js`

**Impact:**
`/og-image.png` is referenced but not bundled (add asset per `og-image-placeholder.txt`). `npm run build` verifies clean compile. Hosting must serve `/favicon.ico` (referenced in HTML).

---

### [Date: 2026-05-25] - Marketing landing page & waitlist (before login)

**Background:**
Visitors hit login immediately; added a cinematic marketing SPA ahead of auth: `/` for guests, `/app` for sign-in, waitlist questionnaire persisted to Firestore (`waitlist`).

**Changed:**

- `src/components/LandingPage.js` (new)
- `src/App.js`
- `src/index.js`
- `package.json` / `package-lock.json` (`react-router-dom`)

**Impact:**
Requires Firestore rules that allow **`waitlist`** `create` (recommended: validate fields + rate limits). Logged-in users requesting `/app` redirect to `/`. No edits to screens, Firebase Auth handlers, APIs, or agents besides routing shell.

---

### [Date: 2026-05-25] - Landing: How it works (screenshots + phone frames)

**Background:**
Swap abstract “How Fashion OS works” placeholders for four real screens in CSS phone mocks, alternating copy/image layout and mobile stack (image on top).

**Changed:**

- `src/components/LandingPage.js`
- `public/screenshots/` (PNG assets mirrored from repo root `public/screenshot-*.png`)

**Impact:**
Screens load from `/screenshots/*.png`; replace files there to refresh marketing captures. Hero/problem/features/testimonials/waitlist/footer logic unchanged.

---

### [Date: 2026-05-25] - SEO: landing semantics, schema, sitemap, compressed screenshots

**Background:**
Marketing page needed crawlable semantics (header/main/section ids), descriptive screenshot alts plus intrinsic image dimensions/lazy-loading, richer JSON-LD and `seo-content`, sitemap anchors, and lighter PNG assets in `public/screenshots/`.

**Changed:**

- `src/components/LandingPage.js`
- `public/index.html`
- `public/sitemap.xml`
- `public/screenshots/*.png` (resampled for smaller file sizes; all roughly under ~200 KB)

**Impact:**
Static HTML still exposes `#seo-content` with an `<h1>`; the SPA hero also uses a distinct `<h1>` after hydrate (common tradeoff for crawler vs app shell). Anchor URLs `#how-it-works`, `#features`, `#waitlist` match rendered section IDs.

---

### [Date: 2026-05-24] - Landing: hero-to-problem spacing and waitlist section sizing

**Background:**
Tighten the vertical gap between the hero CTA and “Sound familiar?”, keep how-it-works screenshot order aligned with the four steps (already correct in data), and make the waitlist block larger and easier to read without changing Firestore, nav, or SEO copy.

**Changed:**

- `src/components/LandingPage.js`

**Impact:**
Hero uses up to 80px bottom padding with `#problem` top padding removed so the combined gap stays within that budget; `#waitlist` gains min-height, 120px vertical section padding, larger headline/subhead, 560px form card, 56px inputs/primary CTAs, and 64px-tall choice rows scoped to that section. No impact on other sections’ layout rules beyond `#problem` top padding.

---

### [Date: 2026-05-24] - Landing SEO: semantics, structured data, crawler content

**Background:**
Tighten marketing HTML semantics for accessibility and crawling, confirm screenshot `loading`/`width`/`height`/alt parity, refresh static JSON-LD and hidden `#seo-content` to mirror section messaging, and keep sitemap anchors aligned with in-app hashes.

**Changed:**

- `src/components/LandingPage.js` (sections/lists for how-it-works steps, features, testimonials; waitlist questionnaire `section`; `<section>` wrappers with `aria-labelledby` for HIW steps; `RevealWrap` polymorphic `as`; problem bullets aligned with SEO copy; quote/feature list CSS resets)
- `public/index.html` (expanded JSON-LD block; `#seo-content` layout per current landing sections)

**Impact:**
`public/sitemap.xml` already matched requested URLs (`/`, `#how-it-works`, `#features`, `#waitlist`). Screenshot PNGs in `public/screenshots/` remain under ~200 KB each; no binary re-export in this change. Hydrated SPA still exposes one visible `<h1>` in `#hero`; the static shell `#seo-content` retains its own `<h1>` for no-JS crawler text.

---

### [Date: 2026-05-24] - Wardrobe: persist photos via Firebase Storage (no ephemeral blob URLs)

**Background:**
Adding items with camera/gallery previews used transient `blob:` URLs (and redundant pre-uploads in Wardrobe UI), so thumbnails vanished after reload. Authenticated uploads should land in Firebase Storage with stable HTTPS previews and Storage paths compatible with existing `removeItem` deletion.

**Changed:**

- `src/hooks/useWardrobe.js` (`uploadWardrobeImage`, blob stripping on load/Persist `stripWardrobeForStorage`, Firestore hydrate sanitization)
- `src/App.js` (`addWardrobeFromFile`, `addManualWardrobeItem` — optimistic blob preview + background upload + `imageUploading`; unauthenticated fallback keeps compressed data URLs)
- `src/screens/WardrobeScreen.js` (removed duplicate upload shim; amber upload spinner on cards)
- `storage.rules` (new — deploy alongside Firebase CLI or paste into Console rules editor)

**Impact:**
Requires deploying `storage.rules` (or equivalent) so users may read/write under `wardrobe/{uid}/**`. Legacy `imageFilename` values that are Express API filenames still delete via DELETE `/api/delete-image`; `removeItem` unchanged otherwise. Ephemeral UI flag `imageUploading` never persists to localStorage/Firestore.

---

### [Date: 2026-05-24] - Wardrobe: bulk closet scan (Stage 1 — analyse & display only)

**Background:**
Add a staged bulk closet-photo flow: upload/compress preview, Claude vision JSON parse of counts by category with colours/style, editable results UI, and placeholders for persistence (Stage 2). Replaces the previous lightweight closet modal on the Wardrobe screen.

**Changed:**

- `src/components/ClosetScanner.js` (new modal: UPLOAD / ANALYZING / RESULTS, errors, spinner, toast for “Coming soon”, colour swatches)
- `src/utils/compressImage.js` (canvas JPEG shrink to longest side ≤1200, quality 0.75; `blobToBase64`)
- `src/services/aiService.js` (`callClosetPhotoVision` — `/api/chat` + image block, max_tokens 1000, CLAUDE_MODEL)
- `src/screens/WardrobeScreen.js` (“Scan Closet Photo” opener; legacy inline closet scan UI removed)

**Impact:**
Depends on `/api/chat` forwarding to Anthropic with vision-compatible message bodies (`ANTHROPIC_API_KEY` on the server). Save to Wardrobe is stubbed (“Coming soon”) until Stage 2; no wardrobe item creation from this modal yet.

---

### [Date: 2026-05-24] - Wardrobe Firestore loads: AbortError swallow + effect cleanup

**Background:**
Browsers reporting `injectScriptAdjust.js` / `jackFetch` + `AbortError` on Firebase reads are usually extension-intercepted `fetch`; harden wardrobe sync so aborted reads stay quiet and rapid effect re-runs do not commit state after unmount.

**Changed:**

- `src/hooks/useWardrobe.js`

**Impact:**
`AbortError` from Firestore `getDoc` / `setDoc` is ignored silently; wardrobe load wrapped with an `alive` flag. If an extension rejects a patched fetch promise outside Firebase’s chain, the console warning may still appear until the extension is disabled.

---

### [Date: 2026-05-24] - Dev: `/api/chat` on Express + CRA proxy for Closet scan

**Background:**
Create React App on port 3000 had no `/api/chat` handler; ClosetScanner and Anthropic-backed calls POST to relative `/api/chat` → 404. Production uses `api/chat.js` on Vercel; locally we need the Express server plus a proxy hop.

**Changed:**

- `server.js` (`POST /api/chat` Anthropic forwarder, 20 MB JSON limit for vision payloads)
- `package.json` (`"proxy": "http://localhost:3001"`)
- `README.md` (runtime env + `npm start` vs `start:client`; fixed duplicate ``` typo)

**Impact:**
Restart dev after pulling: **`npm start`** must bring up both CRA and **`server.js`**. **`ANTHROPIC_API_KEY`** or **`REACT_APP_ANTHROPIC_API_KEY`** in `.env` for the Anthropic relay.

---

### [Date: 2026-05-25] - Wardrobe title copy + dev Anthropic URL absolute port

**Background:**
Marketing-style wardrobe header copy requested a simpler “My Wardrobe” line; local CRA still resolves relative `/api/chat` inconsistently versus an explicit dev API origin.

**Changed:**

- `src/screens/WardrobeScreen.js` (hero title + subtitle)
- `src/services/aiService.js` (`ANTHROPIC_URL` → `http://localhost:3002/api/chat` in development, `/api/chat` otherwise)

**Impact:**
Ensure the Express API (with `POST /api/chat`) is reachable at **port 3002** in dev (e.g. `PORT=3002` / run `server.js` on 3002), or align the URL. Production unchanged.

---

### [Date: 2026-05-26] - Onboarding step 7: ClosetScanner multi-photo flow

**Background:**
Step 7 replaced a single-image `uploadWardrobeItem` UX with the existing bulk `ClosetScanner` modal so users can run one or more closet scans, review aggregated counts, skip, or continue—with persistence still deferred (scanner keeps the “Coming soon” toast).

**Changed:**

- `src/components/Onboarding.js`
- `src/components/ClosetScanner.js`

**Impact:**
`ClosetScanner` optionally calls `onScanComplete` before the toast and passes a **fresh** blob URL for thumbnails (parent must revoke on step exit; leaving step 7 clears `completedScans` and closes the scanner). `uploadWardrobeItem` / legacy wardrobe state remains for a follow-up save wiring.

---

### [Date: 2026-05-26] - ClosetScanner: upload-phase tip copy

**Background:**
Users needed a short reminder to scan closets in sections and that multiple photos are supported.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
No impact beyond UI copy/styling on the scanner upload screen.

---

### [Date: 2026-05-26] - ClosetScanner: data URL thumbnails for `onScanComplete`

**Background:**
Blob URLs handed to onboarding were revoked when the scanner resets; thumbnails should use `FileReader.readAsDataURL` so previews stay valid without separate blob lifecycle handling.

**Changed:**

- `src/components/ClosetScanner.js` (Save to Wardrobe handler)

**Impact:**
Parents receive a data URL thumbnail when `compressedBlob` is present (`previewUrl` fallback otherwise). Larger in-memory payload vs blob URLs.

---

### [Date: 2026-05-27] - Wardrobe photos: Firebase Storage URL + hydrate strip / upload overlay

**Background:**
Photos must survive refresh: authenticated adds already upload via `uploadWardrobeImage` (`App.js`); persisted copies must omit transient `blob:` previews and ephemeral `imageUploading`, and gallery UI should show an amber spinner while uploads finish.

**Changed:**

- `src/hooks/useWardrobe.js` (documented hydrate + `stripWardrobeForStorage` shape — `imageUploading` omitted)
- `src/screens/WardrobeScreen.js` (upload spinner overlay aligned with shared `spin` animation)

**Impact:**
Firestore/localStorage wardrobes store HTTPS `imagePreview` after upload succeeds; reloading clears any stale `blob:` paths on read. **`storage.rules`** in repo already match `wardrobe/{userId}/**` for authenticated read/write — deploy rules in Firebase Console if not synced.

---

### [Date: 2026-05-27] - Closet Scanner Stage 2: save scans to wardrobe + Firebase

**Background:**
Bulk closet scan results should become real wardrobe items with a persisted photo; onboarding still relies on **`onScanComplete`** only without writing to wardrobe.

**Changed:**

- `src/components/ClosetScanner.js` (`onSaveItems`, `isSaving`, primary-save flow; onboarding path unchanged via **`onScanComplete`**)
- `src/App.js` (`saveClosetScanToWardrobe`, category mapping + single Storage upload shared across batch items)
- `src/screens/WardrobeScreen.js` (wired modal to save handler + saving flag)
- `src/hooks/useWardrobe.js` (**`removeItem`**: deletes Storage object only when no other item shares the same **`imageFilename`** — supports shared closet-scan image)

**Impact:**
Authenticated users append one wardrobe row per saved scan category (included rows only); **`useWardrobe`** still syncs the existing Firestore **`wardrobe`** array. Sign-in required — otherwise save throws an error surfaced as a toast.

---

### [Date: 2026-05-27] - Onboarding: closet scan save via `saveClosetScanToWardrobe` + UI callback

**Background:**
During step 7, closet scans should persist through the same handler as Wardrobe (`saveClosetScanToWardrobe`), while **`onScanComplete`** still fills the onboarding “completed scans” list.

**Changed:**

- `src/components/Onboarding.js` (props + **`ClosetScanner`** wiring; **Continue →** calls **`goNextOnboarding`** only — removed **`finishWardrobeStep`**)
- `src/components/ClosetScanner.js` (**after **`onSaveItems`** success, invokes **`onScanComplete`** when provided** so onboarding can refresh summary)
- `src/App.js` (pass **`saveClosetScanToWardrobe`** / **`closetScanSaving`** into **`Onboarding`**)

**Impact:**
If the save fails before **`onScanComplete`**, onboarding list is not updated — user sees the toaster error only.

---

### [Date: 2026-05-27] - Closet-scan wardrobe rows: `categoryMap`, save refactor, scanner card UI

**Background:**
Closet-scan saves should emit one richer wardrobe row per detected category (`source: closet_scan`), reuse a single uploaded photo path across the batch, and show a text-first card with a small corner thumbnail. Onboarding should commit those rows when the user taps **Continue →** (not during the modal) so we do not double-save if the modal also called Storage.

**Changed:**

- `src/utils/categoryMap.js` (new: **`mapToAppCategory`**, **`buildWardrobeItems`**)
- `src/App.js` (**`saveClosetScanToWardrobe`** uses **`buildWardrobeItems`** + one **`uploadWardrobeImage`**; removed inline category builder; **`Onboarding`** receives **`addItem`** instead of closet save props)
- `src/screens/WardrobeScreen.js` (**`resolveColorHex`**, closet-scan card layout; shared footer for both layouts)
- `src/components/Onboarding.js` (**`flushCompletedClosetScansToWardrobe`** on **Continue →**; **`ClosetScanner`** only **`onScanComplete`**)

**Impact:**
Persisted items that lose `source`/`count`/`colors` (current `stripWardrobeForStorage` shape) still match closet-scan cards via **`tags` including `closet-scan`** and a **`N items · …`** description prefix.

---

### [Date: 2026-05-24] - Wardrobe: expandable full-width closet scan rows vs grid cards

**Background:**
Closet-scan wardrobe rows crowded the same two-column card grid as individual pieces; scan lines needed a denser summary row that expands for colors, wears, and the same Edit / Remove / Log wear behaviors.

**Changed:**

- `src/screens/WardrobeScreen.js` (**`expandedScanId`** / **`toggleScanRow`**; **`scanItems`** vs **`regularItems`**; scan list plus section labels; expandable row markup; **`handleLogWear`** / **`handleEdit`** mirroring grid card handlers)

**Impact:**
Regular wardrobe cards are unchanged; scan rows render above the gallery when filtered results include both kinds. Closet-scan rows no longer expose the laundry dots in-row (actions remain in expanded area and match prior footer actions aside from laundry quick-set).

---

### [Date: 2026-05-24] - Wardrobe expanded scan row: wears + count copy

**Background:**
The expanded closet-scan row should spell out aggregate wears with correct singular/plural and relate them to the scanned item count.

**Changed:**

- `src/screens/WardrobeScreen.js` (expanded panel wears line: **`timesWorn`** / **`count`** copy)

**Impact:**
No impact beyond copy in the scan row detail panel.

---

### [Date: 2026-05-24] - Wardrobe: remove bottom quick-add drop zone

**Background:**
The dashed drop area and duplicate “+ Add Photo” at the bottom of the wardrobe screen were redundant with header actions and modal photo add.

**Changed:**

- `src/screens/WardrobeScreen.js` (removed **`wardrobe-quickadd`** block and unused **`onDropWithUpload`**)

**Impact:**
Page-level drag-and-drop for the AI catalog flow no longer appears in that footer area; header **Scan Closet Photo** / **+ Add piece** and the add modal (**Photo** tab) remain.

---

### [Date: 2026-05-29] - Landing waitlist: multi-select for frustration and current system

**Background:**
Waitlist steps 2 and 3 should allow multiple answers; Firestore should store **`frustration`** and **`currentSystem`** as string arrays.

**Changed:**

- `src/components/LandingPage.js` (**`WaitlistFlow`**: array state, toggle **`onClick`**, **`.length`** validation / disabled **Next**, “Select all that apply” hints; **`hotLead`** unchanged)

**Impact:**
Existing **`waitlist`** documents that expect scalar **`frustration`** / **`currentSystem`** now receive arrays from new submissions; analytics or queries should account for array types if needed.

---

### [Date: 2026-05-29] - Landing hero: mobile layout (≤768px)

**Background:**
On narrow viewports the hero used full viewport height with bottom-aligned content, leaving a large empty band above the headline.

**Changed:**

- `src/components/LandingPage.js` (mobile **`@media (max-width: 768px)`**: **`min-height: auto`**, **`justify-content: flex-start`**, **`padding-top: 80px`**, **`padding-bottom: 60px`**; smaller **`fos-lp-headline`** / **`fos-lp-subheadline`** clamps)

**Impact:**
Desktop hero behavior unchanged; mobile hero height follows content so the H1 is visible sooner with less dead space.

---

### [Date: 2026-05-29] - Landing page: mobile fluid layout (≤768px)

**Background:**
Phones (~320–430px wide) needed consistent relative units, stacked HIW/feature/testimonial grids, wider tap targets, and waitlist/card sizing without altering desktop layouts at 769px+.

**Changed:**

- `src/components/LandingPage.js` (single **`@media (max-width: 768px)`** block: **`img`** defaults, **`.phone-frame`**, section padding via **`clamp`/`vw`**, HIW column + centered copy + clamps, features/testimonials **`1fr`**, waitlist card + choices + buttons, typography clamps, **` :has()`** button-row stacking; merged prior hero compact rules using **`clamp`** for vertical padding)

**Impact:**
**`:has()`** is unsupported in very old browsers; waitlist **`120px`** vertical padding bypassed on narrow screens via higher-specificity overrides only inside the media query.

---

### [Date: 2026-05-29] - Landing HIW: flat screenshot on mobile (no phone chrome)

**Background:**
On small screens the decorative phone bezel competes with content; screenshots read better as simple cards.

**Changed:**

- `src/components/LandingPage.js` (≤768px **`.phone-frame`**: no border, **`::before`** notch hidden, shadow + width; **`::before`** **`display: none`**)

**Impact:**
Desktop phone mockup unchanged; How-it-works images appear as flat rounded rectangles on mobile.

---

### [Date: 2026-05-29] - Landing mobile: problem/feature typography, screenshots, section rhythm

**Background:**
Problem card copy wrapping, feature density, screenshot size, and vertical section spacing needed refinement on narrow viewports without affecting desktop ≥769px.

**Changed:**

- `src/components/LandingPage.js` (≤768px: **`#problem`** card heading + **`fos-lp-card-num`**, **`#features`** **`ul.fos-lp-feature-grid`** padding/typography, **`min(88vw, 380px)`** phone mocks, **`!important`** **` fos-lp-section`** vertical **` clamp(48px, 12vw, 80px) `**, waitlist outer padding aligned to same rhythm; avoided **`[class\*="num"]`** so HIW step numerals unchanged)

**Impact:**
Selectors use existing **`fos-lp-feature-grid`** / **`fos-lp-card-*`** markup (no JSX edits).

---

### [Date: 2026-05-29] - API: Firebase ID token + CORS; Vercel **`api/chat`**; client Bearer headers

**Background:**
Express and Vercel chat proxy should reject unauthenticated calls; Shopify/ingest/upload/chat routes needed **`requireAuth`**; browsers must send ID tokens from signed-in Firebase users.

**Changed:**

- `server.js` (Firebase Admin via **`serviceAccountKey.json`** or **`FIREBASE_*`** env, **`requireAuth`**, tightened **CORS**, protected routes listed in task)
- `api/chat.js` (Firebase Admin verify + unchanged Anthropic forward)
- `src/firebase.js` (**`getFirebaseAuthHeader`**)
- `src/services/aiService.js`, `src/App.js`, `src/services/anthropicExtended.js`, `src/hooks/useWardrobeAgent.js`, `src/services/shopify.js`, `src/screens/ShopperScreen.js` (**Bearer** on protected fetches)
- `.gitignore` (**`/serviceAccountKey.json`**)
- `README.md` (env / Vercel admin vars)

**Impact:**
Deploy **`serviceAccountKey.json`** locally only; set **Vercel** **`FIREBASE_PROJECT_ID`**, **`FIREBASE_CLIENT_EMAIL`**, **`FIREBASE_PRIVATE_KEY`**. Unsigned or expired tokens get **401**. **`DELETE /api/delete-image`** remains open unless tightened later.

---

### [Date: 2026-05-29] - **`getFirebaseAuthHeader`**: wait for auth restoration

**Background:**
 **`currentUser`** can be null until **`onAuthStateChanged`** runs on cold load.

**Changed:**

- `src/firebase.js` (**Promise** + **`onAuthStateChanged`**, **5s** timeout)

**Impact:**
 Signed-in requests get tokens after persistence restore; unauthenticated callers still resolve **`{}`** after timeout.

---

### [Date: 2026-05-29] - **`api/chat`**: temporary 401 debug logs (removed)

**Background:**
 Diagnose production **401** responses on the Vercel serverless handler.

**Changed:**

- `api/chat.js` (temporary **`console.log`** lines added then **removed**; handler behavior unchanged)

**Impact:**
No impact.

---

### [Date: 2026-05-29] - Design system foundation (tokens + UI primitives)

**Background:**
Establish shared CSS variables and reusable UI building blocks before migrating existing screens.

**Changed:**

- `src/styles/tokens.css` (new)
- `src/components/ui/Button.js`, `Card.js`, `Badge.js`, `index.js` (new)
- `src/index.css` (`@import "./styles/tokens.css"` at top)

**Impact:**
Tokens are global once `index.css` loads; existing components unchanged until adopted. Import via `import { Button, Card, Badge } from "../components/ui"`.

---

### [Date: 2026-05-24] - ClosetScanner category selection first step

**Background:**
Users need to pick a wardrobe category before uploading a closet photo so scans can be scoped one category at a time for better accuracy.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
Opening the scanner shows a category grid first; upload/analyze/results flows unchanged. `selectedCategory` is stored in state but not yet passed to vision or save logic. `Badge` is imported per spec but unused in this step.

---

### [Date: 2026-05-24] - ClosetScanner upload screen wired to category

**Background:**
After category selection, the upload step should reflect the chosen category (badge, headline, subtitle, and photo tips) and allow returning to the picker without losing the selection.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
Upload phase shows category-specific copy; ← Back returns to category step with selection preserved. Analyzing, results, and save logic unchanged.

---

### [Date: 2026-05-24] - ClosetScanner dynamic AI prompt by category

**Background:**
Vision analysis should scope to the user’s selected scan category and pass that category through save/complete callbacks.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
`getCategoryPrompt(selectedCategory)` replaces static `CLOSET_SCAN_PROMPT`. `onSaveItems` and `onScanComplete` payloads include `category`. Parent handlers may ignore the new field until they use it. Results UI unchanged (`normalizeRows` still maps API fields).

---

### [Date: 2026-05-24] - ClosetScanner post-upload category validation

**Background:**
Before full closet analysis, a quick vision check should confirm the photo matches the user’s selected scan category (e.g. reject non-clothing images).

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
`runAnalysis` runs `getValidationPrompt` first; invalid photos return to upload with a banner. Validation parse/API errors are non-blocking (analysis continues). Extra vision API call per scan.

---

### [Date: 2026-05-24] - ClosetScanner tap-to-continue category selection

**Background:**
Category selection should advance immediately on card tap instead of requiring a separate Continue step.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
Tapping a category goes straight to upload; Continue button removed. Unused `Button` import removed. Cancel unchanged.

---

### [Date: 2026-05-24] - ClosetScanner photo tips and subcategory prompt

**Background:**
Sharper upload guidance and vision prompts should return per-subcategory rows (e.g. Jeans vs Dress Pants) for more accurate counts.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
`PHOTO_TIPS` and `getCategoryPrompt` updated only; results UI still uses `category` per row from API.

---

### [Date: 2026-05-24] - ClosetScanner optional subcategory step

**Background:**
Users should pick a specific type (e.g. Jeans) before upload for tighter vision prompts, with a Mix option and direct upload for Other.

**Changed:**

- `src/components/ClosetScanner.js`

**Impact:**
Flow: category → subcategory (when defined) → upload → analyzing → results. `getCategoryPrompt` accepts `subcategoryId`; `all-*` uses mixed category focus. Save/analyzing/results UI unchanged.

---

### [Date: 2026-05-24] - Wardrobe coverage tracker

**Background:**
Wardrobe screen should show which of the six main categories have been scanned and let users open the scanner pre-filled for missing categories.

**Changed:**

- `src/screens/WardrobeScreen.js`
- `src/components/ClosetScanner.js` (`initialCategory` prop)

**Impact:**
Coverage card appears when wardrobe is non-empty; uncovered pills open scanner at subcategory or upload step. Score counts only the six tracker categories.

---

### [Date: 2026-05-24] - Filter bad scan rows and truncate style badge

**Background:**
Vision rows with junk category labels (partial/edge/background) should not be saved; long style strings should fit scan row badges.

**Changed:**

- `src/utils/categoryMap.js`
- `src/screens/WardrobeScreen.js`

**Impact:**
`buildWardrobeItems` drops zero-count and noisy category names. Scan item style badge shows at most three words.

---

### [Date: 2026-05-24] - Scan filter and style truncation (refined)

**Background:**
Restore `included` guard on scan rows; block curtain/wall/floor labels; truncate style badges via shared helper after `closetScanStyleLabel`.

**Changed:**

- `src/utils/categoryMap.js`
- `src/screens/WardrobeScreen.js`

**Impact:**
Junk categories like "Partially Visible Shirt" are filtered at save. Style badges capped at three words (e.g. "casual and formal").

---

### [Date: 2026-05-24] - Wardrobe "What should I wear today?" prompt card

**Background:**
Once the user has enough wardrobe coverage, surface a CTA to open the outfit planner from the wardrobe screen.

**Changed:**

- `src/screens/WardrobeScreen.js`
- `src/App.js` (`onNavigate={setActiveNav}`)

**Impact:**
Card shows when wardrobe is non-empty and coverage ≥ 33%; tap navigates to planner. Planner and grid unchanged.

---

### [Date: 2026-05-24] - Auto-trigger planner from wardrobe CTA

**Background:**
Tapping "What should I wear today?" should open the planner and start outfit planning after weather loads.

**Changed:**

- `src/screens/WardrobeScreen.js` (CTA passes `{ autoplan: true }`)
- `src/App.js` (`plannerAutoplan`, `handleNavigate`)
- `src/screens/PlannerScreen.js` (`autoplan` effect)

**Impact:**
CTA navigates with autoplan flag; planner sets occasion to "everyday" and calls `planOutfit` after 1.5s. Manual planner use unchanged.

---

### [Date: 2026-05-24] - Remove OpenAI from aiService.js

**Background:**
All client AI should go through Anthropic via `/api/chat`; OpenAI paths in `aiService` are unused.

**Changed:**

- `src/services/aiService.js`

**Impact:**
`callTextCompletion` is Anthropic-only. `OPENAI_VISION_*` exports removed — `App.js` and `anthropicExtended.js` still import those until updated separately.

---

### [Date: 2026-05-24] - Remove OpenAI from App.js and anthropicExtended.js

**Background:**
Complete Anthropic-only client AI after `aiService.js` cleanup; fix broken imports and duplicate vision paths.

**Changed:**

- `src/App.js` — catalog vision via `callClosetPhotoVision`
- `src/services/anthropicExtended.js` — OpenAI branches and `runAgent` fallback removed

**Impact:**
No `OPENAI_*` references under `src/`. `npm run build` passes. Shopper and evaluator use Anthropic `/api/chat` only.

---

### [Date: 2026-05-24] - Planner outfit list color labels

**Background:**
Planner main outfit item names should show wardrobe color in text and as dots beside each line.

**Changed:**

- `src/utils/colorUtils.js` (new, `resolveColorHex`)
- `src/screens/PlannerScreen.js`

**Impact:**
Main `plannerPlan.items` list shows `displayLabel` and up to two color dots when matched in `cleanItems`. Alternate outfit list unchanged.

---

### [Date: 2026-05-24] - Dashboard home screen rewrite

**Background:**
Replace agent-heavy dashboard with a warm, action-focused home: greeting, weather, planner CTA, and wardrobe summary.

**Changed:**

- `src/screens/DashboardScreen.js` (full rewrite)
- `src/App.js` (`profile` prop on `DashboardScreen`)

**Impact:**
Home shows personalized greeting, local weather, primary planner CTA, wardrobe/gap shortcuts, and empty or populated wardrobe stats. `agentActivity` no longer passed to dashboard.

---

### [Date: 2026-05-24] - PostScanNamingScreen after closet scan

**Background:**
After saving a closet scan, users should name individual items per category before using the wardrobe in the planner.

**Changed:**

- `src/screens/PostScanNamingScreen.js` (new)
- `src/services/aiService.js` (`suggestItemNames`)
- `src/App.js` (`postScanNaming` nav, `saveClosetScanToWardrobe` redirect)

**Impact:**
Successful scan save navigates to naming screen; Done splits `count > 1` rows into named items; Skip keeps aggregates and goes to wardrobe.

---

### [Date: 2026-05-28] - Onboarding step 7 visual tile quick-add

**Background:**
Users were dropping off at step 7 (wardrobe scan). The scan-first flow was replaced with a tap-to-select tile picker so users can seed their wardrobe quickly; closet scanning remains optional via a secondary link.

**Changed:**

- `src/components/Onboarding.js`

**Impact:**
Step 7 shows a 22-item category tile grid; selected tiles are added to the wardrobe on "Build my wardrobe →". ClosetScanner modal is unchanged and reachable via "Scan your closet instead".

---

### [Date: 2026-05-28] - Twemoji for consistent cross-platform emoji

**Background:**
Native emoji rendering varies by OS (especially macOS). Twemoji SVG assets provide consistent visuals for wardrobe tiles, onboarding picks, and closet scanner categories.

**Changed:**

- `src/components/Emoji.js` (new)
- `src/screens/WardrobeScreen.js`
- `src/components/Onboarding.js`
- `src/components/ClosetScanner.js`

**Impact:**
`@twemoji/api` (already in package.json) powers a shared `<Emoji>` component; card placeholders, category headers, coverage pills, onboarding tiles, and scanner category grids render Twemoji SVGs instead of system emoji glyphs.

---

### [Date: 2026-05-28] - Phosphor Icons for wardrobe card placeholders

**Background:**
Wardrobe card and category headers needed consistent cross-platform visuals without relying on system emoji or Twemoji parsing.

**Changed:**

- `package.json` / `package-lock.json` (`@phosphor-icons/react`)
- `src/screens/WardrobeScreen.js`
- `src/components/TwemojiSpan.js` (deleted)

**Impact:**
Wardrobe card placeholders and category accordion headers use Phosphor icons (`getItemIcon` / `CATEGORY_ICON`). `TwemojiSpan` removed. `@twemoji/api` kept for `Emoji.js` used in onboarding tiles, closet scanner, and wardrobe coverage pills.

---

### [Date: 2026-05-28] - Onboarding tile gender filter + color preferences

**Background:**
Step 7 wardrobe tile picker should surface gender-relevant clothing types by default and capture the user’s usual color palette for profile personalization.

**Changed:**

- `src/components/Onboarding.js`

**Impact:**
Tiles include `gender` tags and filter by `draft.gender` with a “Show all clothing types” toggle. Color palette chips save `colorPreferences` on the draft when building the wardrobe. Expanded tile list adds dresses, crop tops, ballet flats, belts, watches, and more.

---

### [Date: 2026-05-28] - AI-generated starter wardrobe on onboarding

**Background:**
Onboarding step 7 should build a personalized 50-item wardrobe via AI instead of only adding manually selected tiles — first 20 items block briefly, remaining 30 load in the background.

**Changed:**

- `src/services/aiService.js` (`generateStarterWardrobe`)
- `src/components/Onboarding.js`

**Impact:**
“Build my wardrobe” requires color picks, calls AI for 20 items then advances onboarding; 30 more items generate in background. Tile selections remain as fallback if AI fails. Uses existing `/api/chat` proxy (not direct Anthropic client calls).

---

### [Date: 2026-05-28] - Planner history, outfit choice, auto wear logging

**Background:**
Part 1 of planner persistence: record each recommendation session, track which outfit the user chose, and increment wear counts when they confirm.

**Changed:**

- `src/hooks/usePlannerHistory.js` (new)
- `src/App.js`
- `src/screens/PlannerScreen.js`

**Impact:**
Planner sessions save to localStorage and Firestore `plannerHistory`. Each outfit card has “I'll wear this” — choice is recorded and matched wardrobe items get `timesWorn + 1`.

---

### [Date: 2026-05-28] - Outfit confirm screen with item swap

**Background:**
After choosing an outfit, users need a confirmation step to review items, swap individual pieces from their wardrobe, and finalize wear tracking before returning to the dashboard.

**Changed:**

- `src/components/OutfitConfirmScreen.js` (new)
- `src/screens/PlannerScreen.js`

**Impact:**
“I'll wear this” now opens the confirm screen instead of immediately marking items dirty. Wear counts and laundry status update only on “Done, getting dressed”. Confirm navigates to dashboard after 300ms; “Change my mind” returns to the outfit carousel.

---

### [Date: 2026-05-28] - Outfit confirm emoji placeholder styling

**Background:**
Emoji placeholders in OutfitConfirmScreen had a gray background box; they should render as bare emoji icons like elsewhere in the app.

**Changed:**

- `src/components/OutfitConfirmScreen.js`

**Impact:**
No impact

---

### [Date: 2026-05-28] - Wardrobe card placeholder background removed

**Background:**
Wardrobe card emoji placeholders should render without a tinted background box, consistent with OutfitConfirmScreen placeholders.

**Changed:**

- `src/index.css`

**Impact:**
No impact

---

### [Date: 2026-05-28] - Stricter outfit item resolution in confirm screen

**Background:**
Loose partial matching in OutfitConfirmScreen could resolve multiple outfit lines to the same wardrobe item, causing duplicate dirty/wear updates on confirm.

**Changed:**

- `src/components/OutfitConfirmScreen.js`

**Impact:**
Confirming an outfit only marks each matched wardrobe item dirty once; unresolved outfit lines remain placeholders without `updateItem` calls.

---

### [Date: 2026-05-28] - /api/chat 401 diagnostics and auth reliability

**Background:**
Production `/api/chat` returns 401 when requests lack a Firebase ID token or when Vercel Admin env vars fail token verification; client auth could race before `authStateReady`.

**Changed:**

- `api/chat.js` (distinct error codes: `missing_token`, `invalid_token`, `admin_config`)
- `src/firebase.js` (`authStateReady` + `getIdToken`)
- `src/services/aiService.js` (`postChat` guard when unsigned)

**Impact:**
Unsigned users see a clear sign-in message instead of a generic 401. Vercel logs distinguish invalid tokens from missing Firebase Admin configuration.

---

### [Date: 2026-05-28] - Planner /api/chat 401 client retry and error messages

**Background:**
PlannerScreen 401s from `/api/chat` showed only in the network tab; production logs stayed quiet and errors were raw JSON.

**Changed:**

- `src/firebase.js` (`getIdToken(forceRefresh)`)
- `src/services/aiService.js` (401 token refresh retry, `parseChatError` user messages)

**Impact:**
Planner shows readable auth errors in the UI. Stale tokens retry once with a forced refresh before surfacing failure.

---

### [Date: 2026-06-09] - Structured /api/chat auth logging for production debugging

**Background:**
Planner `/api/chat` 401s were hard to diagnose in Vercel because production logs lacked structured auth failure details.

**Changed:**

- `api/chat.js` (JSON logs: `request`, `auth_ok`, `auth_missing_token`, `auth_invalid_token`, `admin_config_missing`, `anthropic_response`)
- `server.js` (matching local dev auth logs)
- `src/firebase.js` (client token readiness logs)
- `src/services/aiService.js` (postChat request/retry/failure logs)
- `src/screens/PlannerScreen.js` (planOutfit error log)

**Impact:**
Vercel logs show request ID, missing env var names, token length, Firebase UID on success, and verifyIdToken error messages. Browser console shows `[postChat]` and `[firebase]` traces. No tokens or secrets are logged.

---
