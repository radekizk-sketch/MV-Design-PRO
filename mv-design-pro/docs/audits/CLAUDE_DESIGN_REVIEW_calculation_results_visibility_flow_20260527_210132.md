I have enough to write a substantive review. I read the four surfaces a user touches around SC results — the `WynikiContextPanel` (side panel after running), `ResultsInspectorPage` (the actual results table), `SldOverlay` (numbers painted on the diagram), and `EnmInspectorPage` (the model-inspection screen that the user complains shows "generic ENM rows"). Findings below, ordered by impact on the complaint *"backend returns SC values but the Analysis surface doesn't show them"*.

---

# UX Review — SC results visibility & SLD→Results→Proof flow

## P0 — Confirmed defects that produce the exact symptom you described

### 1. `EnmInspectorPage` ships hardcoded empty tree data
**File:** `frontend/src/ui/enm-inspector/EnmInspectorPage.tsx:122-133`

```tsx
const treeData = useMemo(
  () => ({
    buses: [], lines: [], cables: [],
    transformers: [], switches: [], sources: [], loads: [],
  }),
  [],
);
```

Inline comment says *"Demo data for tree (in production, this comes from network model API)"*. The Drzewo ENM tab is a placeholder shipped to users. If "the main Analysis surface still shows generic ENM rows" refers to this page, then the rows aren't even real data — they're either the literal empty state, or whatever `EnmTree` renders when given empty arrays.

**Fix path:** wire `treeData` to the same network-model API that the SLD uses (single-model rule — there is exactly one source of truth). Don't shadow it.

### 2. `WynikiContextPanel` is silent about completed calculations
**File:** `frontend/src/ui/shell/context-panels/WynikiContextPanel.tsx`

Even when `resultStatus === 'FRESH'` the panel renders:
- a green chip "Wyniki aktualne"
- a scope label "Aktywne wyniki obliczeń"
- two buttons: *Pokaż nakładki wynikowe SLD* and *Przejdź do uzasadnień i raportów*

**Missing:** no count of computed buses/branches/SC targets, no max-Ik'' summary, no per-case verdict ribbon, **and no button to open the actual results table (`ResultsInspectorPage`)**. The panel that's literally titled "Wyniki i analizy" is the one place the user looks after a run completes, and it shows zero numbers.

`Pokaż nakładki` (line 56) just calls `setActiveWorkMode('TW')` — no scroll, no toast, no confirmation. If the SLD is off-screen the user gets no feedback that anything happened.

**Fix path:** add a summary block fed by `resultsIndex.run_header` (counts, solver, timestamp) and a primary CTA *"Otwórz tabelę wyników →"* that navigates to `ResultsInspectorPage` with the active run id.

### 3. Two surfaces both read like "Analysis" — there's an IA collision
- `EnmInspectorPage` — heading **"Inspektor modelu sieci"** (pre-run diagnostics, preflight)
- `ResultsInspectorPage` — heading **"Wyniki analizy"** / **"Przeglądarka wyników"** (post-run numbers)

A user who runs SC and then clicks "Inspektor" in the nav lands on the model inspector and sees no SC values — by design, because that page predates the run. But there's no signpost ("Wyniki znajdziesz w → Przeglądarka wyników") and the model inspector itself has the bug above (empty tree).

**Fix path:** put a persistent banner on `EnmInspectorPage` whenever `activeRunId` exists: *"Aktywne wyniki obliczeń: {runId} · Otwórz przeglądarkę wyników →"*.

---

## P1 — Visibility / dead-end risks once you reach `ResultsInspectorPage`

### 4. ID columns are truncated with no recovery path
**File:** `ResultsInspectorPage.tsx:376, 470-471, 567`

```tsx
{row.bus_id.substring(0, 8)}...
{row.from_bus.substring(0, 8)}...
{row.target_name ?? row.target_id.substring(0, 8)}
```

No `title=` tooltip, no copy-to-clipboard, no expansion. For two buses whose names collide (common in MV stations: "S1", "S2") the engineer cannot disambiguate. The SC table even falls back to a truncated ID as the *primary identifier* when `target_name` is null.

**Fix:** `title={row.bus_id}` at minimum; better — a copy button or a `data-id` tag visible on hover.

### 5. Empty state can't distinguish "not run", "run produced no rows", "load failed"
**Files:** `ResultsInspectorPage.tsx:332, 424, 529` all use the same shape:

> "Wyniki {węzłowe|gałęziowe|zwarciowe} nie są dostępne dla tego obliczenia."

For an engineer that's three different situations:
- SC wasn't part of this run → expected, "run an SC analysis to populate this"
- SC ran but produced 0 rows → suspicious, "check fault scenario configuration"
- API returned an error → blocker, "retry / check backend"

Right now all three look identical. Combined with finding #2, the user has no way to tell whether the system computed something and just isn't showing it.

**Fix:** distinguish empty from missing from error. The store already has `error`, `isLoading*` — wire them into the EmptyState branch.

### 6. False-zero risk: `formatNumber` formats `0` as `"0,000"`, not `"—"`
**File:** `ResultsInspectorPage.tsx:65-71`

```tsx
function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pl-PL', {...});
}
```

That's correct **only if the backend faithfully sends `null` for "not computed"** and `0` is reserved for "computed and equals zero". If a row ever ships with `ikss_ka: 0` to mean "not computed for this fault type" (very common pattern in solver outputs), the SC table will show a clean "0,000 kA" — a false zero — and the verdict badge will compute against it. This is the kind of thing that gets equipment dimensioned wrong.

**Cannot confirm without a backend audit** (out of scope per your brief), but worth flagging to whoever owns the SC solver contract: explicit null-vs-zero policy in `resultset_v1_schema.json`, and a backend contract test.

### 7. Overlay uses `''` for missing values, the table uses `"—"`
**File:** `SldOverlay.tsx:31-55` returns `''` for `undefined`; `ResultsInspectorPage.tsx` returns `"—"`.

In the overlay a missing voltage just disappears — a bus with no result looks identical to a bus the engineer hasn't asked about. The table shows `"—"`. Different visual signals for the same underlying state.

**Fix:** unify on a single missing-value glyph and a single rule (e.g. render a faint placeholder pill in the overlay so missing-but-expected is visually distinct from out-of-scope).

### 8. SC overlay omits `ip` and `Ith`
**File:** `SldOverlay.tsx:115-118` — only `Ik''` is painted on the bus.

`ip` (peak) and `Ith` (thermal) are the values switchgear vendors dimension to. Putting only `Ik''` on the SLD pushes the engineer back into the table every time. Defensible as a "keep the diagram readable" call, but worth offering a density toggle on the overlay (compact / full SC).

### 9. Hard-coded loading thresholds (80% / 100%)
**File:** `SldOverlay.tsx:63-78` and mirrored in the table at `ResultsInspectorPage.tsx:478-484`.

```tsx
if (loading > 100) return 'text-rose-600 font-semibold';
if (loading > 80) return 'text-amber-600';
```

These thresholds are interpretation, not physics — but they belong in a normative/config layer (per CLAUDE.md "No Heuristics" rule, this is borderline). Two risks: thresholds drift between overlay and table; engineer cannot match these to their utility's own thresholds.

**Fix:** centralize in `frontend/src/ui/shared/normativeLabels.ts` (already in your modified files), expose as a named constant, allow per-case override later.

### 10. "Outdated" state is a dead end
**File:** `SldOverlay.tsx:233-237` — when `result_status === 'OUTDATED'` the user sees grey labels and a static banner "Wyniki nieaktualne". No "Recompute now" CTA, no "What changed" link.

`WynikiContextPanel` line 6 has the same dead end: shows "Wymaga ponownego obliczenia" but the only escape is "Przejdź do studiów obliczeniowych" (and only when there are no results at all — line 73 gates on `!hasResults`, so when results exist *and* are outdated, even that CTA disappears).

**Fix:** show the recompute affordance whenever `resultStatus !== 'FRESH'`, not only when `!activeRunId`.

---

## P2 — Workflow / flow issues

### 11. `ResultsInspectorPage` renders `EmbeddedSldWorkspace` even on the TRACE tab
**File:** `ResultsInspectorPage.tsx:1050-1052`

The SLD panel is always mounted above the tab content. On the trace tab the user is reading equation steps; the SLD takes a third of the screen and isn't relevant. Conditionally hide it on TRACE (or collapse to a 1-line summary).

### 12. SLD ↔ table sync is one-way good, but row click forces a tab switch
**File:** `ResultsInspectorPage.tsx:783-810`

Selecting a bus on the SLD forces `setActiveTab('BUSES')` even if the user was deliberately on `BRANCHES`. With SC results, clicking a bus jumps to SC tab even when the engineer was inspecting branch loading. This is unsolicited navigation — common UX anti-pattern.

**Fix:** sync the highlighted row in *all* tabs that contain a matching row; only switch tabs if the current tab has no matching row.

### 13. "Pokaż nakładkę wyników na SLD" is a checkbox at the bottom of the page
**File:** `ResultsInspectorPage.tsx:1019-1029`

Below the status bar, above the tabs. Most engineers won't see it on first run because the eye goes to the tab strip. The same toggle exists in the side panel (#2) as a button. Two controls for one piece of state, both in non-obvious places.

**Fix:** single source of truth in the page header (next to "Tylko do odczytu" badge), remove the duplicate in the side panel or make it a deep-link to the page that pre-checks the box.

### 14. The verdict cell mixes computed and missing data without surfacing the gap
**File:** `ResultsInspectorPage.tsx:550-551, 593-598`

```tsx
const icu_ka = (row as ShortCircuitRow & { icu_ka?: number | null }).icu_ka ?? null;
const verdictResult = calculateShortCircuitVerdict(row.ikss_ka, icu_ka);
```

When `icu_ka` is null (no catalog binding for the device), the verdict is computed anyway. `formatMargin(null)` renders something, `VerdictBadge` renders something — but the user has no way to tell that the verdict is based on a missing Icu. The cell displays `Brak danych` for Icu but the Werdykt cell next to it still renders a colored badge.

**Fix:** when `icu_ka === null`, the Werdykt cell should render `Nie można ocenić — brak Icu w katalogu` rather than a default badge. This is a "no false zeroes / no dead ends" case directly.

---

## What I did NOT verify (out of scope per your brief or needs your call)

- Whether the backend SC contract uses `null` or `0` for "not computed" (finding #6).
- Whether `EnmTree` adds anything beyond what its props provide — I only confirmed the page passes empty arrays.
- The actual `EmbeddedSldWorkspace` rendering performance / determinism.
- Whether `resolveAvailableResultsTabs` correctly hides the SC tab for PF-only runs (the call site looks right; didn't open the helper).

---

## Recommended order of attack

1. **#1 + #2 + #3** — these together produce the exact "I ran SC but I can't see my numbers" complaint. Highest user-visible payoff, no physics touched.
2. **#5 + #6 + #14** — false-zero and dead-end class. Engineering-trust-critical.
3. **#4 + #7 + #10** — quality-of-life fixes that prevent disambiguation/UX dead-ends.
4. **#11 + #12 + #13** — cleanups; do once the visibility issues are gone and you can actually use the page.
5. **#8 + #9** — design conversations, not code fixes; needs your call on overlay density and thresholds policy.

Want me to implement any subset of these? My recommendation is **#1, #2, #3 as one tight PR** — they're cohesive ("the user can find their results") and don't touch physics, schemas, or solvers. Say the word and I'll draft the patches for your review before touching anything.
