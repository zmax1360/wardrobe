# Change log (session work)

Summary of refactors and fixes applied to this codebase during the wardrobe extraction and related work.

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

## Files touched (high level)

| Area              | File(s)                          |
|-------------------|----------------------------------|
| Wardrobe hook     | `src/hooks/useWardrobe.js`       |
| App wiring        | `src/App.js`                     |
| Agent history ids | `src/hooks/useAgentActivity.js`  |

---

## Verification performed

- Production build (`npm run build`) succeeded after these changes.
- Wardrobe should still load after refresh, persist after hydration, and add/update/remove should behave as before.
