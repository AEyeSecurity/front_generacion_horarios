# Frontend API Fetch Audit

## Scope

Audited collection/detail reads for Units, Cells, Grid metadata, schedule history, screen context, Categories, and Time Ranges. Next.js proxy routes are transport only and are not counted as independent frontend callers.

## Findings and fixes

| Resource | Caller and trigger before | Effect dependencies / invalidation before | Duplicate or unnecessary behavior | Fixed ownership and invalidation |
| --- | --- | --- | --- | --- |
| Units | `GridSchedulePanel` mounted a 1.5 second polling GET; `SolveOverlay` had a context fallback GET; the Schedule server page and History server page fetched Units separately; the disabled onboarding guide also had a 2 second count poll. | Schedule polling depended on `gridId`; Solve bootstrap depended on Grid/view/refresh state. Placement changes did not affect Unit structure but polling continued. | Main cause of 10 initial / 109 accumulated requests. The same Units were already in `screen-context`. | Schedule and History derive Units from their initial `screen-context`. Polling is removed. Solve fallback goes through `fetchGridResource("units")`. Onboarding counts use the same cache. Unit cache is invalidated only by structural mutations. |
| Cells | Schedule parent and `SolveOverlay` each performed contract-enrichment GETs; participant schedule metadata fetched Cells again; Cells page has a cards endpoint with a legacy collection fallback; Edit Cell explicitly pages the collection when resolving a series. | Schedule fetch effects depended on Grid/view/refresh tick; participant overlay metadata depended on Grid/view; edit fetch is dialog-open/user initiated. | Up to three collection GETs for one Schedule mount. | Context Cells are the primary source. Contract enrichment uses one keyed shared request with an `acceptCached` contract check. Parent and overlay share its in-flight promise/result. Participant views use context. Cells page and Edit Cell retain their specialized/lazy reads. Cell mutations invalidate only Cells, Bundles, and draft context. |
| Grid metadata | `GridSchedulePanel`, `SolveOverlay`, Participants panel, Add/Edit Participant dialogs, Grid Settings, Solver Settings, Invite dialog, invite resolution, and auth invite views could issue detail GETs. | Most were mount/open effects; settings effects depended on `gridId`; participant dialogs depended on `open`, `gridId`, and optional tier props. | Schedule parent and child could both request the same Grid. Settings parent and nested solver form could repeat it. | Schedule and participant consumers read `context.grid` or `fetchGridResource("grid")`. Settings primes the shared cache from the server-resolved Grid; nested Solver Settings reuses it. Mutations invalidate Grid plus draft context. Invite-name/auth flows remain isolated because they may target different Grids and are not Schedule resource consumers. |
| Schedule history | `GridSchedulePanel` loaded on mount, every `contextRefreshTick`, every five seconds, and window focus; mutation callback also loaded it. | The effect depended on `loadDraftHistory` and `contextRefreshTick`; a timer and focus listener bypassed operation semantics. | One placement mutation could cause two requests, and idle sessions accumulated requests indefinitely. | One initial effect (`[loadDraftHistory]`), one call after an actual draft mutation, and undo/redo state from their mutation responses. No timer, focus, scroll, tab, selection, or drag-preview refetch. Concurrent history reads share `draftHistoryRequestRef`. |
| Screen context | Schedule parent, `SolveOverlay`, participant schedule overlay, and participant detail views all called it. Schedule page also fetched separate static collections. | Schedule parent depends on Grid/view/context refresh; Solve depends on Grid/view/external refresh; participant views depend on Grid/view or participant. | Concurrent parent/child GETs and static collection duplication. A force request could previously bypass an existing in-flight request. | Server Schedule/History pages pass initial context into the client cache. `fetchGridScreenContext` has TTL cache plus one in-flight promise per Grid/view, including force callers. Invalidations are versioned so stale in-flight responses cannot repopulate invalidated data. Participant views use the same loader. |
| Categories | `CategoriesPanel` fetched on mount/refresh; Categories page fetched server-side; onboarding polled counts. | Panel effect depended on an unstable `load`/inline `onParents` path in earlier code. | Re-renders could remount/reload the panel, and data duplicated context. | Panel `load` is stable and depends on `gridId`, stable `onParents`, and `t`; its effect is `[load, refreshKey]`. It reads shared context/cache and only falls back when absent. The panel is dynamically mounted only when opened. Category mutations invalidate Categories/CategoryValues and draft context. |
| Time Ranges | `TimeRangesEditor`, Solver Settings, unused `TimeRangesPanel`, legacy cell bootstrap, and onboarding count checks had direct GETs. | Active editor effect was mount-driven; Solver Settings was settings-page driven; onboarding used a timer. | Opening multiple active editors could duplicate the same collection. Placement changes could indirectly lead to unrelated context reloads. | Side editor and Solver Settings use `fetchGridResource("time_ranges")`; concurrent reads dedupe. Time Range mutations invalidate only Time Ranges and draft context. The side editor is lazy. `TimeRangesPanel` has no imports/mounted callers and therefore makes no runtime requests. Legacy bootstrap remains a dialog/API compatibility fallback. |

## Shared resource architecture

- `lib/screen-context.ts` owns Grid static resources and Grid/view schedule context.
- Static resources are primed from `screen-context` once and are not overwritten by placement-only context refreshes.
- Concurrent reads share one in-flight Promise by `gridId + resource` or `gridId + view`.
- Cache invalidation uses generations, preventing an older in-flight response from restoring stale data after a mutation.
- Placement create/move/delete operations patch the cached draft schedule in place. They do not invalidate or refetch Units, Categories, CategoryValues, Time Ranges, Grid metadata, Cells, Participants, or Blockages.
- Cell, participant, category, time-range, and Grid mutations invalidate only their affected resources.
- `SidePanel` dynamic imports are declared once at module scope. Radix mounts the selected heavy panel only while the Sheet is open.

## Request instrumentation

Development builds install `ApiRequestAuditProvider`. It counts audited browser requests and exposes:

```js
window.__SHIFT_API_REQUEST_AUDIT__.reset()
window.__SHIFT_API_REQUEST_AUDIT__.snapshot()
```

It is excluded from production behavior by `NODE_ENV` and logs each audited request as `[api-audit]`.

## Scenario counts

These are the deterministic client-side counts from the fixed request paths. The Schedule page's server-side initial `screen-context` request is listed separately because it is not a browser `fetch` and is intentionally used to hydrate the shared cache.

| Scenario | Units | Cells | Grid detail | History | Screen context | Categories | Time Ranges |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A. Initial Schedule load, supervisor draft | 0 | 0 normally; 1 only if context lacks required Cell contract fields | 0 | 1 | 0 client + 1 server hydration | 0 | 0 |
| B. Schedule -> Cells -> Schedule | 0 | 0 normally; Cells page uses `/cells/cards`; 1 only for its legacy fallback | 0 | 1 on the new Schedule mount | 0 client + 1 server hydration on each Schedule render | 0 | 0 |
| C. Five successful manual placement moves | 0 | 0 | 0 | 5 | 0 | 0 | 0 |
| D. Open Categories | 0 | 0 | 0 | 0 | 0 | 0 from hydrated cache; 1 fallback only if omitted from context | 0 |
| E. Open Time Ranges | 0 | 0 | 0 | 0 | 0 | 0 | 0 from hydrated cache; 1 fallback only if omitted from context |

Viewer/published Schedule sessions issue zero history requests. Cancelled drag previews issue zero history and zero static-resource requests.

## Placement mutation follow-up

Placement create/move responses contain the confirmed placement row and backend placement id. Those rows now replace the optimistic row directly and patch the cached draft `screen-context`; successful creates no longer issue a defensive `/schedule` GET. Placement deletion is deterministic from the deleted id and patches the same cache. All three retain rollback behavior on failure.

Mutation responses are also inspected for `draft_history`. When present, the toolbar state is updated directly. The current placement mutation response contract omits it, so one history GET remains per successful placement snapshot. Undo and redo return `draft_history`, so their toolbar/keyboard paths make no follow-up history GET.

Undo/redo still make one `screen-context` GET. They can replace an arbitrary draft snapshot and their response does not contain a complete render model, so a full authoritative schedule refresh is required there.

| Measured code path | History GETs | Screen-context GETs | Other authoritative schedule GETs |
| --- | ---: | ---: | ---: |
| Initial Schedule load | 1 | 0 client + 1 server hydration | 0 |
| 5 placement moves | 5 | 0 | 0 |
| 1 placement creation | 1 | 0 | 0 |
| 1 placement deletion | 1 | 0 | 0 |
| Undo | 0 | 1 | 0 |
| Redo | 0 | 1 | 0 |

For the sequence above, excluding initial server hydration, the totals are **8 history GETs** and **2 screen-context GETs**. If a future placement mutation response includes `draft_history`, its corresponding history GET automatically drops to zero without another frontend change.
