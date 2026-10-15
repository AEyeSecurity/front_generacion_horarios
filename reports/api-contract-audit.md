# Shift API contract audit — 2026-10-14

## Result

- **153 contracts inspected by layer:** 132 exported BFF method/path pairs and 21 distinct direct Django method/path templates in server code/helpers. Browser calls reuse those BFF contracts; they are not counted again. Query strings, concrete IDs and slash variants are not separate contracts.
- **7 defective BFF contract chains corrected:** 4 unused proxies removed; 3 active proxy chains no longer attempt nonexistent legacy URLs or manufacture successful bootstrap responses after upstream 404s. These chains referenced **6 distinct nonexistent Django targets** (some shared).
- **10 additional noncanonical method/path variants removed.** These were slashless Django retries, not ten additional missing endpoints: GET can redirect through CommonMiddleware; unsafe-method redirects are not a reliable contract.
- Final inventory: **128 BFF contracts + 13 direct Django templates = 141**; **0 known missing BFF routes, 0 invalid Django destinations, 0 method mismatches** in the remaining calls. Backend behavior was not changed.
- Initial source inventory: 196 fetch/helper call sites plus the logout HTML form. Final: 191 call sites plus that form. All 118 actual Django API URL patterns were inspected, including routes not exposed through Next.

The two reported failures, **Edit Cell bootstrap and draft history, already had matching component → BFF → Django paths in this checkout**. Both return 200 in the real browser tests against the current repositories. No route rename was invented for either symptom. The failing original process/request was unavailable; its 404 cause cannot be established from this run. Stale processes/builds, deployment revision differences and wrong/inaccessible entity IDs remain hypotheses, not findings.

## Confirmed mismatches

| Feature | Method | Frontend path | BFF route | Backend path | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| Legacy solution detail | GET | `/api/solutions/[id]` | `app/api/solutions/[id]/route.ts` | `/api/solutions/{id}/` | **stale BFF backend path**; no Django registration; no application consumer | Unused proxy removed |
| Legacy solution export | GET | `/api/solutions/[id]/export` | `app/api/solutions/[id]/export/route.ts` | `/api/solutions/{id}/export/` | **stale BFF backend path**; no Django registration; no application consumer | Unused proxy removed; current schedule export retained |
| Invitation accept by ID | POST | `/api/invitations/[id]/accept` | `app/api/invitations/[id]/accept/route.ts` | `/api/invitations/{id}/accept/` | **stale BFF backend path**; Django accepts a token at the collection action; no consumer | Unused proxy removed; `/api/invitations/accept` retained |
| Invitation decline by ID | POST | `/api/invitations/[id]/decline` | `app/api/invitations/[id]/decline/route.ts` | `/api/invitations/{id}/decline/` | **stale BFF backend path**; same issue | Unused proxy removed; `/api/invitations/decline` retained |
| User lookup retry | GET | `/api/users` | `app/api/users/route.ts` | `/api/users/`, then invalid `/api/auth/users/` | **stale BFF backend path** in 404 fallback | Only canonical `/api/users/`; refresh preserved |
| Create Cell options | GET | `/api/grids/[id]/cells/form-options` | `app/api/grids/[id]/cells/form-options/route.ts` | `/api/grids/{id}/cells/form-options/`; legacy fallback included invalid `/api/time_ranges/` | **other**: 404 triggered multi-request reconstruction and a synthetic 200; invalid fallback target | Specialized response/status forwarded unchanged; reconstruction removed |
| Edit Cell bootstrap | GET | `/api/cells/[id]/form-bootstrap/` | `app/api/cells/[id]/form-bootstrap/route.ts` | `/api/cells/{id}/form-bootstrap/`; same legacy builder | **other**: correctly routed primary call, but fallback hid missing cells/errors and could use invalid time-range path | Primary route retained; real upstream errors preserved; legacy builder removed |

No active **stale frontend path**, **missing BFF route** or **method mismatch** was found. Frontend aliases such as `time_ranges`, `category_values`, `availability_rules` and `grid_memberships` are intentional: their BFFs translate to Django's hyphenated names.

Slash-only fallback retries were removed from grid BFFs and server loaders for grids, participants, cells and schedules. The Cells server page now always uses the tested cards endpoint instead of silently replacing a cards 404 with legacy lists. Cache keys, request deduplication, screen-context, optimistic placement updates and solver behavior were left intact. Existing draft-to-published **domain** fallback remains in the schedule helper.

## Exact symptom traces

**Edit Cell:** `components/dialogs/EditCellDialog.tsx` calls `authFetch(cellFormBootstrapPath(cell.id))`; `lib/cell-api.ts::cellFormBootstrapPath` builds `/api/cells/{id}/form-bootstrap/`; the matching BFF reads the access cookie and forwards the same path with Bearer authentication; `api.routers` registers `CellViewSet`, whose `form_bootstrap` action calls `cell_form_payload(self.get_object())`. The browser test double-clicks the real Cell card and asserts the final bootstrap response is 200. Next's preceding **308 slash normalization is expected**, not a missing route.

**Draft history:** `components/grid/GridSchedulePanel.tsx::loadDraftHistory` calls `GET /api/grids/{gridId}/schedule/history`; `app/api/grids/[id]/schedule/history/route.ts::GET` forwards to `/api/grids/{id}/schedule/history/`; `GridViewSet.schedule_history` resolves the grid and calls `_draft_history_state_payload`. That helper returns an empty history when the grid has no draft. **A missing draft alone does not justify a history 404.** No history path/helper code needed changing; the browser test observes 200 when opening Schedule, and directly verifies the empty-grid case.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run build` | Passed; production compilation, TypeScript and route generation |
| `npx.cmd tsc --noEmit` | Passed after adding the contract tests |
| `node scripts/api-contract-audit.mjs --check` | Passed: remaining URLs/methods resolve; all BFF routes appear in the built Next manifest |
| `npx.cmd playwright test --project=chromium --workers=1 --reporter=list` | **8 passed**, including setup, existing tests and the new contract tests |
| Backend changes/tests | No backend files changed; separate backend suite not required. Real Django views/services/ORM/CP-SAT exercised by the E2E tests |
| `git diff --check` | Passed |

The first build encountered stale `.next/dev/types` references to removed proxy files. Only that generated types directory was removed, then the build passed. That explains this audit's build failure; it does **not** prove the cause of the originally reported runtime 404s.

Tests ran against a production Next server and `scripts/api-contract-backend.py`, which disables dotenv loading, migrates a disposable SQLite database and uses an in-memory email backend. No existing project database, external email service or deployment was mutated. The initial test-development failures were a wait matching the expected 308, reuse of a placement ID after history restoration, and an anonymous test context inheriting stored cookies; the corrected final suite passes.

Representative checks: Cells render; Cell create/PATCH/delete; actual Edit Cell dialog and bootstrap; Schedule opening and history; placement preview/place/PATCH/delete; undo/redo; Categories render; TimeRanges dock opening; precheck; feasible solver candidate generation and selection; grid-code candidate rejection; split-segment placement/movement; unauthenticated specialized routes return 401. Cell writes and solver actions are exercised through HTTP with the browser session; the test does not claim every button was clicked. Bulk-create and series-extension methods are checked against Django's resolver, not a new browser scenario.

## Expected 404s retained

| Feature | Method | Frontend path | BFF route | Backend path | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| No published version | GET | `/api/grids/[id]/published-schedule` | Matching published-schedule handler | `/api/grids/{id}/published-schedule/` | **expected domain 404** | Preserved and explicitly tested |
| Deleted/inaccessible Cell | GET | `/api/cells/[id]/form-bootstrap` | Matching form-bootstrap handler | `/api/cells/{id}/form-bootstrap/` | Domain 404 could be hidden by synthetic fallback | Real JSON 404 preserved and tested |
| Missing draft | GET | `/api/grids/[id]/schedule` | Matching schedule handler | `/api/grids/{id}/schedule/` | **expected domain 404** until materialized | Preserved; history remains separately available |
| Stale placement ID | PATCH/DELETE | `/api/schedule-placements/[id]` | Matching placement handler | `/api/schedule-placements/{id}/` | **expected domain 404** after deletion/restoration | Preserved; reload current positions after undo/redo |

`scheduler/services/schedule_state.py::materialize_schedule_from_solution` deletes and recreates placement rows during snapshot restoration. IDs from before undo/redo are not a stable resource identity. Likewise, nonexistent grids or membership-scoped resources can legitimately return 404 from `get_object()`; those responses must not be relabeled as missing routes.

## Inventory and reproducibility

The inventory was collected **before** application edits, then repeated after them. `scripts/api-contract-audit.mjs` scans TypeScript request expressions, local wrappers, conditional paths, shared helpers and HTML API forms; executes exported BFF methods with mocked transport for success/401/404/split-placement branches; and checks the resulting URLs/methods with Django's actual `resolve()` and view action mappings. It also checks the compiled Next manifest. Generic transport internals are listed explicitly; their caller URLs are inventoried instead of treating `input` or `path` parameters as endpoints. This is a route/method audit, not exhaustive request/response-schema validation or proof of deployed revision parity.

See [api-contract-inventory.json](api-contract-inventory.json) for every current source call site, exact BFF file, captured upstream path/query/method and Django resolution. To rerun, install each repository's dependencies and run the audit command from Shift-Frontend. For E2E, start the disposable backend with the sibling backend's virtualenv, build/start Next against `http://127.0.0.1:8000`, and set `E2E_EMAIL=contract-audit@example.invalid`, `E2E_PASSWORD=Contract-audit-local-123!`. The fixture credentials belong only to that disposable database.

The full before/after method/path inventory and backend-only endpoints follow. Repeated source calls and query values are grouped; path parameters are placeholders. Refresh calls are included in the machine inventory rather than repeated in every row.


<details>
<summary>All 132 original BFF method/path contracts (128 retained)</summary>

| Feature | Method | Frontend path | BFF route | Backend path | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| auth/google | POST | `/api/auth/google` | `app/api/auth/google/route.ts` | `/api/auth/google/` | Valid | Valid (unchanged) |
| auth/login | POST | `/api/auth/login` | `app/api/auth/login/route.ts` | `/api/auth/login/` | Valid | Valid (unchanged) |
| auth/logout | POST | `/api/auth/logout` | `app/api/auth/logout/route.ts` | `Local cookie operation` | Valid | Valid (unchanged) |
| auth/password-change | POST | `/api/auth/password-change` | `app/api/auth/password-change/route.ts` | `/api/auth/password-change/` | Valid | Valid (unchanged) |
| auth/password-reset/confirm | POST | `/api/auth/password-reset/confirm` | `app/api/auth/password-reset/confirm/route.ts` | `/api/auth/password-reset/confirm/` | Valid | Valid (unchanged) |
| auth/password-reset | POST | `/api/auth/password-reset` | `app/api/auth/password-reset/route.ts` | `/api/auth/password-reset/` | Valid | Valid (unchanged) |
| auth/refresh | POST | `/api/auth/refresh` | `app/api/auth/refresh/route.ts` | `Local cookie operation` | Valid | Valid (unchanged) |
| auth/register | POST | `/api/auth/register` | `app/api/auth/register/route.ts` | `/api/auth/register/` | Valid | Valid (unchanged) |
| auth/verify-email/confirm | POST | `/api/auth/verify-email/confirm` | `app/api/auth/verify-email/confirm/route.ts` | `/api/auth/verify-email/confirm/` | Valid | Valid (unchanged) |
| auth/verify-email | POST | `/api/auth/verify-email` | `app/api/auth/verify-email/route.ts` | `/api/auth/verify-email/` | Valid | Valid (unchanged) |
| availability_rules | GET | `/api/availability_rules` | `app/api/availability_rules/route.ts` | `/api/availability-rules/` | Valid | Valid (unchanged) |
| availability_rules | POST | `/api/availability_rules` | `app/api/availability_rules/route.ts` | `/api/availability-rules/` | Valid | Valid (unchanged) |
| availability_rules/[id] | GET | `/api/availability_rules/[id]` | `app/api/availability_rules/[id]/route.ts` | `/api/availability-rules/{id}/` | Valid | Valid (unchanged) |
| availability_rules/[id] | PATCH | `/api/availability_rules/[id]` | `app/api/availability_rules/[id]/route.ts` | `/api/availability-rules/{id}/` | Valid | Valid (unchanged) |
| availability_rules/[id] | DELETE | `/api/availability_rules/[id]` | `app/api/availability_rules/[id]/route.ts` | `/api/availability-rules/{id}/` | Valid | Valid (unchanged) |
| bundles | GET | `/api/bundles` | `app/api/bundles/route.ts` | `/api/bundles/` | Valid | Valid (unchanged) |
| bundles | POST | `/api/bundles` | `app/api/bundles/route.ts` | `/api/bundles/` | Valid | Valid (unchanged) |
| categories | GET | `/api/categories` | `app/api/categories/route.ts` | `/api/categories/` | Valid | Valid (unchanged) |
| categories | POST | `/api/categories` | `app/api/categories/route.ts` | `/api/categories/` | Valid | Valid (unchanged) |
| categories/[id] | PATCH | `/api/categories/[id]` | `app/api/categories/[id]/route.ts` | `/api/categories/{id}/` | Valid | Valid (unchanged) |
| categories/[id] | DELETE | `/api/categories/[id]` | `app/api/categories/[id]/route.ts` | `/api/categories/{id}/` | Valid | Valid (unchanged) |
| category_values | GET | `/api/category_values` | `app/api/category_values/route.ts` | `/api/category-values/` | Valid | Valid (unchanged) |
| category_values | POST | `/api/category_values` | `app/api/category_values/route.ts` | `/api/category-values/` | Valid | Valid (unchanged) |
| category_values/[id] | PATCH | `/api/category_values/[id]` | `app/api/category_values/[id]/route.ts` | `/api/category-values/{id}/` | Valid | Valid (unchanged) |
| category_values/[id] | DELETE | `/api/category_values/[id]` | `app/api/category_values/[id]/route.ts` | `/api/category-values/{id}/` | Valid | Valid (unchanged) |
| cells/bulk_create | POST | `/api/cells/bulk_create` | `app/api/cells/bulk_create/route.ts` | `/api/cells/bulk_create/` | Valid | Valid (unchanged) |
| cells | GET | `/api/cells` | `app/api/cells/route.ts` | `/api/cells/` | Valid | Valid (unchanged) |
| cells | POST | `/api/cells` | `app/api/cells/route.ts` | `/api/cells/` | Valid | Valid (unchanged) |
| cells/[id]/extend_series | POST | `/api/cells/[id]/extend_series` | `app/api/cells/[id]/extend_series/route.ts` | `/api/cells/{id}/extend_series/` | Valid | Valid (unchanged) |
| cells/[id]/form-bootstrap | GET | `/api/cells/[id]/form-bootstrap` | `app/api/cells/[id]/form-bootstrap/route.ts` | `/api/cells/{id}/form-bootstrap/` | Valid primary; invalid/masking legacy fallback | Valid; fallback removed |
| cells/[id] | GET | `/api/cells/[id]` | `app/api/cells/[id]/route.ts` | `/api/cells/{id}/` | Valid | Valid (unchanged) |
| cells/[id] | PATCH | `/api/cells/[id]` | `app/api/cells/[id]/route.ts` | `/api/cells/{id}/` | Valid | Valid (unchanged) |
| cells/[id] | DELETE | `/api/cells/[id]` | `app/api/cells/[id]/route.ts` | `/api/cells/{id}/` | Valid | Valid (unchanged) |
| grids/code/[code]/cells/[cell_id]/place | POST | `/api/grids/code/[code]/cells/[cell_id]/place` | `app/api/grids/code/[code]/cells/[cell_id]/place/route.ts` | `/api/grids/code/{code}/cells/{id}/place/` | Valid | Valid (unchanged) |
| grids/code/[code]/cells/[cell_id]/placement-preview | POST | `/api/grids/code/[code]/cells/[cell_id]/placement-preview` | `app/api/grids/code/[code]/cells/[cell_id]/placement-preview/route.ts` | `/api/grids/code/{code}/cells/{id}/placement-preview/` | Valid | Valid (unchanged) |
| grids/code/[code]/draft-structure/apply | POST | `/api/grids/code/[code]/draft-structure/apply` | `app/api/grids/code/[code]/draft-structure/apply/route.ts` | `/api/grids/code/{code}/draft-structure/apply/` | Valid | Valid (unchanged) |
| grids/code/[code]/draft-structure/preview | POST | `/api/grids/code/[code]/draft-structure/preview` | `app/api/grids/code/[code]/draft-structure/preview/route.ts` | `/api/grids/code/{code}/draft-structure/preview/` | Valid | Valid (unchanged) |
| grids/code/[code]/precheck | POST | `/api/grids/code/[code]/precheck` | `app/api/grids/code/[code]/precheck/route.ts` | `/api/grids/code/{code}/precheck/` | Valid | Valid (unchanged) |
| grids/code/[code]/published-schedule | GET | `/api/grids/code/[code]/published-schedule` | `app/api/grids/code/[code]/published-schedule/route.ts` | `/api/grids/code/{code}/published-schedule/` | Valid | Valid (unchanged) |
| grids/code/[code]/published-schedules | GET | `/api/grids/code/[code]/published-schedules` | `app/api/grids/code/[code]/published-schedules/route.ts` | `/api/grids/code/{code}/published-schedules/` | Valid | Valid (unchanged) |
| grids/code/[code] | GET | `/api/grids/code/[code]` | `app/api/grids/code/[code]/route.ts` | `/api/grids/code/{code}/` | Valid primary; slashless retry | Valid; fallback removed |
| grids/code/[code]/schedule/export | GET | `/api/grids/code/[code]/schedule/export` | `app/api/grids/code/[code]/schedule/export/route.ts` | `/api/grids/code/{code}/schedule/export/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/history/redo | POST | `/api/grids/code/[code]/schedule/history/redo` | `app/api/grids/code/[code]/schedule/history/redo/route.ts` | `/api/grids/code/{code}/schedule/history/redo/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/history | GET | `/api/grids/code/[code]/schedule/history` | `app/api/grids/code/[code]/schedule/history/route.ts` | `/api/grids/code/{code}/schedule/history/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/history/undo | POST | `/api/grids/code/[code]/schedule/history/undo` | `app/api/grids/code/[code]/schedule/history/undo/route.ts` | `/api/grids/code/{code}/schedule/history/undo/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/placement-options | POST | `/api/grids/code/[code]/schedule/placement-options` | `app/api/grids/code/[code]/schedule/placement-options/route.ts` | `/api/grids/code/{code}/schedule/placement-options/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/publish | POST | `/api/grids/code/[code]/schedule/publish` | `app/api/grids/code/[code]/schedule/publish/route.ts` | `/api/grids/code/{code}/schedule/publish/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/restore-published | POST | `/api/grids/code/[code]/schedule/restore-published` | `app/api/grids/code/[code]/schedule/restore-published/route.ts` | `/api/grids/code/{code}/schedule/restore-published/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule | GET | `/api/grids/code/[code]/schedule` | `app/api/grids/code/[code]/schedule/route.ts` | `/api/grids/code/{code}/schedule/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule | POST | `/api/grids/code/[code]/schedule` | `app/api/grids/code/[code]/schedule/route.ts` | `/api/grids/code/{code}/schedule/` | Valid | Valid (unchanged) |
| grids/code/[code]/schedule/visual-order | PATCH | `/api/grids/code/[code]/schedule/visual-order` | `app/api/grids/code/[code]/schedule/visual-order/route.ts` | `/api/grids/code/{code}/schedule/visual-order/` | Valid | Valid (unchanged) |
| grids/code/[code]/screen-context | GET | `/api/grids/code/[code]/screen-context` | `app/api/grids/code/[code]/screen-context/route.ts` | `/api/grids/code/{code}/screen-context/` | Valid | Valid (unchanged) |
| grids/code/[code]/solve-candidates | POST | `/api/grids/code/[code]/solve-candidates` | `app/api/grids/code/[code]/solve-candidates/route.ts` | `/api/grids/code/{code}/solve-candidates/` | Valid | Valid (unchanged) |
| grids/code/[code]/solve-candidates/[run_id]/choose | POST | `/api/grids/code/[code]/solve-candidates/[run_id]/choose` | `app/api/grids/code/[code]/solve-candidates/[run_id]/choose/route.ts` | `/api/grids/code/{code}/solve-candidates/{run_id}/choose/` | Valid | Valid (unchanged) |
| grids/code/[code]/solve-candidates/[run_id]/reject | POST | `/api/grids/code/[code]/solve-candidates/[run_id]/reject` | `app/api/grids/code/[code]/solve-candidates/[run_id]/reject/route.ts` | `/api/grids/code/{code}/solve-candidates/{run_id}/reject/` | Valid | Valid (unchanged) |
| grids/config | GET | `/api/grids/config` | `app/api/grids/config/route.ts` | `/api/grids/config/` | Valid | Valid (unchanged) |
| grids | GET | `/api/grids` | `app/api/grids/route.ts` | `/api/grids/` | Valid | Valid (unchanged) |
| grids | POST | `/api/grids` | `app/api/grids/route.ts` | `/api/grids/` | Valid | Valid (unchanged) |
| grids/[id]/cells/cards | GET | `/api/grids/[id]/cells/cards` | `app/api/grids/[id]/cells/cards/route.ts` | `/api/grids/{id}/cells/cards/` | Valid | Valid (unchanged) |
| grids/[id]/cells/form-options | GET | `/api/grids/[id]/cells/form-options` | `app/api/grids/[id]/cells/form-options/route.ts` | `/api/grids/{id}/cells/form-options/` | Valid primary; invalid/masking legacy fallback | Valid; fallback removed |
| grids/[id]/cells/[cell_id]/place | POST | `/api/grids/[id]/cells/[cell_id]/place` | `app/api/grids/[id]/cells/[cell_id]/place/route.ts` | `/api/grids/{id}/cells/{cell_id}/place/` | Valid | Valid (unchanged) |
| grids/[id]/cells/[cell_id]/placement-preview | POST | `/api/grids/[id]/cells/[cell_id]/placement-preview` | `app/api/grids/[id]/cells/[cell_id]/placement-preview/route.ts` | `/api/grids/{id}/cells/{cell_id}/placement-preview/` | Valid | Valid (unchanged) |
| grids/[id]/draft-structure/apply | POST | `/api/grids/[id]/draft-structure/apply` | `app/api/grids/[id]/draft-structure/apply/route.ts` | `/api/grids/{id}/draft-structure/apply/` | Valid | Valid (unchanged) |
| grids/[id]/draft-structure/preview | POST | `/api/grids/[id]/draft-structure/preview` | `app/api/grids/[id]/draft-structure/preview/route.ts` | `/api/grids/{id}/draft-structure/preview/` | Valid | Valid (unchanged) |
| grids/[id]/precheck | POST | `/api/grids/[id]/precheck` | `app/api/grids/[id]/precheck/route.ts` | `/api/grids/{id}/precheck/` | Valid | Valid (unchanged) |
| grids/[id]/published-schedule | GET | `/api/grids/[id]/published-schedule` | `app/api/grids/[id]/published-schedule/route.ts` | `/api/grids/{id}/published-schedule/` | Valid | Valid (unchanged) |
| grids/[id]/published-schedules | GET | `/api/grids/[id]/published-schedules` | `app/api/grids/[id]/published-schedules/route.ts` | `/api/grids/{id}/published-schedules/` | Valid | Valid (unchanged) |
| grids/[id] | GET | `/api/grids/[id]` | `app/api/grids/[id]/route.ts` | `/api/grids/{id}/` | Valid primary; slashless retry | Valid; fallback removed |
| grids/[id] | PATCH | `/api/grids/[id]` | `app/api/grids/[id]/route.ts` | `/api/grids/{id}/` | Valid primary; slashless retry | Valid; fallback removed |
| grids/[id] | DELETE | `/api/grids/[id]` | `app/api/grids/[id]/route.ts` | `/api/grids/{id}/` | Valid primary; slashless retry | Valid; fallback removed |
| grids/[id]/schedule/export | GET | `/api/grids/[id]/schedule/export` | `app/api/grids/[id]/schedule/export/route.ts` | `/api/grids/{id}/schedule/export/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/history/redo | POST | `/api/grids/[id]/schedule/history/redo` | `app/api/grids/[id]/schedule/history/redo/route.ts` | `/api/grids/{id}/schedule/history/redo/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/history | GET | `/api/grids/[id]/schedule/history` | `app/api/grids/[id]/schedule/history/route.ts` | `/api/grids/{id}/schedule/history/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/history/undo | POST | `/api/grids/[id]/schedule/history/undo` | `app/api/grids/[id]/schedule/history/undo/route.ts` | `/api/grids/{id}/schedule/history/undo/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/placement-options | POST | `/api/grids/[id]/schedule/placement-options` | `app/api/grids/[id]/schedule/placement-options/route.ts` | `/api/grids/{id}/schedule/placement-options/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/publish | POST | `/api/grids/[id]/schedule/publish` | `app/api/grids/[id]/schedule/publish/route.ts` | `/api/grids/{id}/schedule/publish/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/restore-published | POST | `/api/grids/[id]/schedule/restore-published` | `app/api/grids/[id]/schedule/restore-published/route.ts` | `/api/grids/{id}/schedule/restore-published/` | Valid | Valid (unchanged) |
| grids/[id]/schedule | GET | `/api/grids/[id]/schedule` | `app/api/grids/[id]/schedule/route.ts` | `/api/grids/{id}/schedule/` | Valid | Valid (unchanged) |
| grids/[id]/schedule | POST | `/api/grids/[id]/schedule` | `app/api/grids/[id]/schedule/route.ts` | `/api/grids/{id}/schedule/` | Valid | Valid (unchanged) |
| grids/[id]/schedule/visual-order | PATCH | `/api/grids/[id]/schedule/visual-order` | `app/api/grids/[id]/schedule/visual-order/route.ts` | `/api/grids/{id}/schedule/visual-order/` | Valid | Valid (unchanged) |
| grids/[id]/screen-context | GET | `/api/grids/[id]/screen-context` | `app/api/grids/[id]/screen-context/route.ts` | `/api/grids/{id}/screen-context/` | Valid | Valid (unchanged) |
| grids/[id]/solutions | GET | `/api/grids/[id]/solutions` | `app/api/grids/[id]/solutions/route.ts` | `/api/grids/{id}/solutions/` | Valid | Valid (unchanged) |
| grids/[id]/solve | POST | `/api/grids/[id]/solve` | `app/api/grids/[id]/solve/route.ts` | `/api/grids/{id}/solve/` | Valid | Valid (unchanged) |
| grids/[id]/solve-candidates | POST | `/api/grids/[id]/solve-candidates` | `app/api/grids/[id]/solve-candidates/route.ts` | `/api/grids/{id}/solve-candidates/` | Valid | Valid (unchanged) |
| grids/[id]/solve-candidates/[run_id]/choose | POST | `/api/grids/[id]/solve-candidates/[run_id]/choose` | `app/api/grids/[id]/solve-candidates/[run_id]/choose/route.ts` | `/api/grids/{id}/solve-candidates/{run_id}/choose/` | Valid | Valid (unchanged) |
| grids/[id]/solve-candidates/[run_id]/reject | POST | `/api/grids/[id]/solve-candidates/[run_id]/reject` | `app/api/grids/[id]/solve-candidates/[run_id]/reject/route.ts` | `/api/grids/{id}/solve-candidates/{run_id}/reject/` | Valid | Valid (unchanged) |
| grids/[id]/solver-wizard | POST | `/api/grids/[id]/solver-wizard` | `app/api/grids/[id]/solver-wizard/route.ts` | `/api/grids/{id}/solver-wizard/` | Valid | Valid (unchanged) |
| grid_memberships | GET | `/api/grid_memberships` | `app/api/grid_memberships/route.ts` | `/api/grid-memberships/` | Valid | Valid (unchanged) |
| invitations/accept | POST | `/api/invitations/accept` | `app/api/invitations/accept/route.ts` | `/api/invitations/accept/` | Valid | Valid (unchanged) |
| invitations/decline | POST | `/api/invitations/decline` | `app/api/invitations/decline/route.ts` | `/api/invitations/decline/` | Valid | Valid (unchanged) |
| invitations/incoming | GET | `/api/invitations/incoming` | `app/api/invitations/incoming/route.ts` | `/api/invitations/incoming/` | Valid | Valid (unchanged) |
| invitations/resolve | GET | `/api/invitations/resolve` | `app/api/invitations/resolve/route.ts` | `/api/invitations/resolve/` | Valid | Valid (unchanged) |
| invitations | GET | `/api/invitations` | `app/api/invitations/route.ts` | `/api/invitations/` | Valid | Valid (unchanged) |
| invitations | POST | `/api/invitations` | `app/api/invitations/route.ts` | `/api/invitations/` | Valid | Valid (unchanged) |
| invitations/[id]/accept | POST | `/api/invitations/[id]/accept` | `app/api/invitations/[id]/accept/route.ts` | `/api/invitations/{id}/accept/` | Stale backend path (unused) | Removed (unused) |
| invitations/[id]/cancel | POST | `/api/invitations/[id]/cancel` | `app/api/invitations/[id]/cancel/route.ts` | `/api/invitations/{id}/cancel/` | Valid | Valid (unchanged) |
| invitations/[id]/decline | POST | `/api/invitations/[id]/decline` | `app/api/invitations/[id]/decline/route.ts` | `/api/invitations/{id}/decline/` | Stale backend path (unused) | Removed (unused) |
| invitations/[id]/resend | POST | `/api/invitations/[id]/resend` | `app/api/invitations/[id]/resend/route.ts` | `/api/invitations/{id}/resend/` | Valid | Valid (unchanged) |
| participants | GET | `/api/participants` | `app/api/participants/route.ts` | `/api/participants/` | Valid | Valid (unchanged) |
| participants | POST | `/api/participants` | `app/api/participants/route.ts` | `/api/participants/` | Valid | Valid (unchanged) |
| participants/[id] | GET | `/api/participants/[id]` | `app/api/participants/[id]/route.ts` | `/api/participants/{id}/` | Valid | Valid (unchanged) |
| participants/[id] | PUT | `/api/participants/[id]` | `app/api/participants/[id]/route.ts` | `/api/participants/{id}/` | Valid | Valid (unchanged) |
| participants/[id] | PATCH | `/api/participants/[id]` | `app/api/participants/[id]/route.ts` | `/api/participants/{id}/` | Valid | Valid (unchanged) |
| participants/[id] | DELETE | `/api/participants/[id]` | `app/api/participants/[id]/route.ts` | `/api/participants/{id}/` | Valid | Valid (unchanged) |
| placement-comments | GET | `/api/placement-comments` | `app/api/placement-comments/route.ts` | `/api/placement-comments/` | Valid | Valid (unchanged) |
| placement-comments | POST | `/api/placement-comments` | `app/api/placement-comments/route.ts` | `/api/placement-comments/` | Valid | Valid (unchanged) |
| placement-comments/[id] | PATCH | `/api/placement-comments/[id]` | `app/api/placement-comments/[id]/route.ts` | `/api/placement-comments/{id}/` | Valid | Valid (unchanged) |
| placement-comments/[id] | DELETE | `/api/placement-comments/[id]` | `app/api/placement-comments/[id]/route.ts` | `/api/placement-comments/{id}/` | Valid | Valid (unchanged) |
| schedule-blockages | GET | `/api/schedule-blockages` | `app/api/schedule-blockages/route.ts` | `/api/schedule-blockages/` | Valid | Valid (unchanged) |
| schedule-blockages | POST | `/api/schedule-blockages` | `app/api/schedule-blockages/route.ts` | `/api/schedule-blockages/` | Valid | Valid (unchanged) |
| schedule-blockages/[id] | PATCH | `/api/schedule-blockages/[id]` | `app/api/schedule-blockages/[id]/route.ts` | `/api/schedule-blockages/{id}/` | Valid | Valid (unchanged) |
| schedule-blockages/[id] | DELETE | `/api/schedule-blockages/[id]` | `app/api/schedule-blockages/[id]/route.ts` | `/api/schedule-blockages/{id}/` | Valid | Valid (unchanged) |
| schedule-placements | GET | `/api/schedule-placements` | `app/api/schedule-placements/route.ts` | `/api/schedule-placements/` | Valid | Valid (unchanged) |
| schedule-placements | POST | `/api/schedule-placements` | `app/api/schedule-placements/route.ts` | `/api/schedule-placements/` | Valid | Valid (unchanged) |
| schedule-placements/[id] | PATCH | `/api/schedule-placements/[id]` | `app/api/schedule-placements/[id]/route.ts` | `/api/schedule-placements/{id}/` | Valid | Valid (unchanged) |
| schedule-placements/[id] | DELETE | `/api/schedule-placements/[id]` | `app/api/schedule-placements/[id]/route.ts` | `/api/schedule-placements/{id}/` | Valid | Valid (unchanged) |
| solutions/[id]/export | GET | `/api/solutions/[id]/export` | `app/api/solutions/[id]/export/route.ts` | `/api/solutions/{id}/export/` | Stale backend path (unused) | Removed (unused) |
| solutions/[id] | GET | `/api/solutions/[id]` | `app/api/solutions/[id]/route.ts` | `/api/solutions/{id}/` | Stale backend path (unused) | Removed (unused) |
| staff-members | GET | `/api/staff-members` | `app/api/staff-members/route.ts` | `/api/staff-members/` | Valid | Valid (unchanged) |
| staff-members | POST | `/api/staff-members` | `app/api/staff-members/route.ts` | `/api/staff-members/` | Valid | Valid (unchanged) |
| staffs | GET | `/api/staffs` | `app/api/staffs/route.ts` | `/api/staffs/` | Valid | Valid (unchanged) |
| staffs | POST | `/api/staffs` | `app/api/staffs/route.ts` | `/api/staffs/` | Valid | Valid (unchanged) |
| time_ranges | GET | `/api/time_ranges` | `app/api/time_ranges/route.ts` | `/api/time-ranges/` | Valid | Valid (unchanged) |
| time_ranges | POST | `/api/time_ranges` | `app/api/time_ranges/route.ts` | `/api/time-ranges/` | Valid | Valid (unchanged) |
| time_ranges/[id] | GET | `/api/time_ranges/[id]` | `app/api/time_ranges/[id]/route.ts` | `/api/time-ranges/{id}/` | Valid | Valid (unchanged) |
| time_ranges/[id] | PATCH | `/api/time_ranges/[id]` | `app/api/time_ranges/[id]/route.ts` | `/api/time-ranges/{id}/` | Valid | Valid (unchanged) |
| time_ranges/[id] | DELETE | `/api/time_ranges/[id]` | `app/api/time_ranges/[id]/route.ts` | `/api/time-ranges/{id}/` | Valid | Valid (unchanged) |
| units | GET | `/api/units` | `app/api/units/route.ts` | `/api/units/` | Valid | Valid (unchanged) |
| users | GET | `/api/users` | `app/api/users/route.ts` | `/api/users/` | Invalid /auth/users fallback | Valid; fallback removed |
| whoami | GET | `/api/whoami` | `app/api/whoami/route.ts` | `/api/auth/whoami/` | Valid | Valid (unchanged) |
| whoami | PUT | `/api/whoami` | `app/api/whoami/route.ts` | `/api/auth/whoami/` | Valid | Valid (unchanged) |
| whoami | PATCH | `/api/whoami` | `app/api/whoami/route.ts` | `/api/auth/whoami/` | Valid | Valid (unchanged) |

</details>

<details>
<summary>All 21 original direct Django templates (13 retained)</summary>

| Feature | Method | Frontend path | BFF route | Backend path | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| Server/helper | GET | `app/grid/[code]/categories/page.tsx`; `app/grid/[code]/cells/page.tsx`; `app/grid/[code]/history/page.tsx`; `app/grid/[code]/layout.tsx`; `app/grid/[code]/page.tsx`; `app/grid/[code]/participants/page.tsx`; `app/grid/[code]/settings/page.tsx` | Direct, no BFF hop | `/api/grid-memberships/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/categories/page.tsx` | Direct, no BFF hop | `/api/categories/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/cells/page.tsx` | Direct, no BFF hop | `/api/cells/` | Valid | Obsolete fallback removed |
| Server/helper | GET | `app/grid/[code]/cells/page.tsx` | Direct, no BFF hop | `/api/grids/{id}/cells/cards/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/cells/page.tsx`; `app/grid/[code]/participants/page.tsx`; `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/participants/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/history/page.tsx`; `app/grid/[code]/page.tsx` | Direct, no BFF hop | `/api/grids/{id}/screen-context/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/_helpers.ts`; `app/grid/[code]/layout.tsx` | Direct, no BFF hop | `/api/grids/{id}/published-schedule/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/participants/page.tsx` | Direct, no BFF hop | `/api/grids/{id}/participants/{id}/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/_helpers.ts` | Direct, no BFF hop | `/api/grids/code/{id}/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/_helpers.ts` | Direct, no BFF hop | `/api/grids/code/{id}/schedule/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/_helpers.ts` | Direct, no BFF hop | `/api/grids/code/{id}/published-schedule/` | Valid | Valid (canonical) |
| Server/helper | GET | `app/grid/[code]/_helpers.ts` | Direct, no BFF hop | `/api/grids/{id}/schedule/` | Valid | Valid (canonical) |
| Server/helper | GET | `lib/auth.ts` | Direct, no BFF hop | `/api/auth/whoami/` | Valid | Valid (canonical) |
| Server/helper | POST | `lib/backend.ts` | Direct, no BFF hop | `/api/auth/refresh/` | Valid | Valid (canonical) |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/grids/{id}/` | Valid | Obsolete fallback removed |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/cells/{id}/` | Valid | Obsolete fallback removed |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/units/` | Valid | Obsolete fallback removed |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/bundles/` | Valid | Obsolete fallback removed |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/time-ranges/` | Valid | Obsolete fallback removed |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/time_ranges/` | Stale backend path in legacy helper | Obsolete fallback removed |
| Server/helper | GET | `lib/cell-legacy-bootstrap.ts` | Direct, no BFF hop | `/api/staffs/` | Valid | Obsolete fallback removed |

</details>

<details>
<summary>Django operations without a BFF exposure</summary>

These are not missing frontend contracts: no browser request requires them. The scoped participant GET is used directly by a Server Component. Email activation is a backend link target. Remaining entries are backend-only capabilities, public backend documentation/health, or unused CRUD methods; no speculative proxy was added.

| Django pattern | Methods without BFF |
| --- | --- |
| `/api/debug-env/` | GET |
| `/api/health/` | GET |
| `/api/schema/` | GET |
| `/api/docs/` | GET |
| `/api/users/{pk}/` | GET |
| `/api/schedules/` | GET |
| `/api/schedules/{pk}/` | GET |
| `/api/schedules/{pk}/apply-manual-learning/` | POST |
| `/api/schedule-placements/{pk}/` | GET, PUT |
| `/api/schedule-blockages/{pk}/` | GET, PUT |
| `/api/placement-comments/{pk}/` | GET, PUT |
| `/api/solver-feedback-signals/` | GET, POST |
| `/api/solver-feedback-signals/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/grids/code/{grid_code}/solutions/` | GET |
| `/api/grids/code/{grid_code}/solve/` | POST |
| `/api/grids/code/{grid_code}/schedule/visual-order/` | PUT |
| `/api/grids/{pk}/` | PUT |
| `/api/grids/{pk}/participants/{grid_participant_id}/` | GET, PATCH, DELETE |
| `/api/grids/{pk}/toggle-tiers/` | POST |
| `/api/grids/{pk}/schedule/visual-order/` | PUT |
| `/api/grid-memberships/` | POST |
| `/api/grid-memberships/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/staffs/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/staff-members/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/categories/{pk}/` | GET, PUT |
| `/api/category-values/{pk}/` | GET, PUT |
| `/api/time-ranges/{pk}/` | PUT |
| `/api/units/` | POST |
| `/api/units/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/bundles/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/availability-rules/{pk}/` | PUT |
| `/api/cells/{pk}/` | PUT |
| `/api/invitations/{pk}/` | GET, PUT, PATCH, DELETE |
| `/api/auth/google/link/` | POST |
| `/api/auth/verify-email/activate/` | GET |
| `/api/auth/verify-email/exchange/` | POST |

</details>

Final totals: **153 inspected before changes; 7 defective chains found; 7 corrected (4 unused proxies removed, 3 active chains repaired); 0 known unresolved routing/method mismatches.** Expected domain 404s remain for missing publications/drafts, deleted or inaccessible entities, and obsolete placement IDs after snapshot restoration.
