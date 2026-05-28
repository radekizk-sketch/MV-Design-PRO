# Summary of top UX risks

1. **Three competing right-side surfaces for the same object.** Selecting an SLD element can produce: a 360 px overlay `SldDetailDrawer`, the results-only `InspectorPanel` ("Tryb wyników — tylko do odczytu"), and a third surface implied by `onOpenConfiguration` ("kanoniczny konfigurator"). The user cannot predict which appears, where edit happens, or where read happens.
2. **Edit/read split is not legible.** `InspectorPanel` is hard-coded read-only with tabs Przegląd/Parametry/Wyniki/Kontrybutorzy/Limity/Dowód, while `SldDetailDrawer` carries the actual configuration tabs (Rozdzielnica SN, Transformator, Strona nN, DER, Aparatura, Zabezpieczenia, Stan + telemetria, Nastawy). Two parallel "tab stacks" for one object is a discoverability tax.
3. **Dead-end tabs and silent disabled states.** `InspectorPanel` tabs Kontrybutorzy/Limity/Dowód render `EmptyTabState` with no actionable CTA or "disabled reason"; the disabled tab tooltip is only "Niedostępne dla tego typu elementu" — no path forward.
4. **Click intent is overloaded.** Single click in canvas opens the drawer (`SldDetailDrawer`) for station/bay/apparatus/der/cable_run, but station also has a `StationInternalView` drill-down and `onOpenFullView`. Without explicit double-click semantics, drill-down is hidden behind sub-toolbar CTAs.
5. **Remove/Merge/Split fragmented.** `SldContextMenuController` groups Budowa/Edycja/Widok/Usuń, but only Split has an explicit preview/confirm pattern (`SplitPreviewPanel`). Remove/Merge are exposed without a uniform preview→confirm→commit→audit ribbon.
6. **False-zero risk in tech card.** `formatNumber` returns `'—'` for `null/undefined` but `0` renders as `"0,000"` for unmeasured fields (e.g. `loading_pct ?? 0` in `buildBranchLimitsSections`). The default `?? 0` for limit checks silently fabricates an "OK" status when data is missing.
7. **`navigateToProof` requires `activeRunId` with no inline recovery path** — the empty state advises the user but offers no "uruchom obliczenia" CTA from the inspector.

# Must-fix issues

- **One panel per selected object.** A selected element must open exactly one canonical surface ("Karta obiektu") with consistent location, header, tabs, and CTAs.
- **No silent disabled states.** Every disabled action and every disabled tab must carry `disabledReasonPl` (already supported in `SldMenuAction.disabledReasonPl` — extend the same contract to inspector tabs).
- **No fabricated zeros.** Limit/status checks must distinguish "brak danych" from `0`. Replace `value ?? 0` patterns with explicit `null` propagation and a "Dane niedostępne" status row.
- **Polish labels everywhere.** Already used in drawer/menu (e.g. `Rozdzielnica SN`, `Transformator`, `Pole SN`, `Aparat pola SN`) — enforce same vocabulary in inspector tab strings and empty states.
- **Remove/Merge must share the Split pattern.** Reuse `SplitPreviewPanel` structure ("Skutki elektryczne / Potwierdź / Anuluj") for any destructive or topology-changing operation — preview → confirm → commit → audit trail entry.
- **Full-screen surfaces must be entered by an explicit CTA**, never replace the right panel on selection.

# Suggested unified drawer flow

Single "Karta obiektu" docked right (360–420 px), object-typed, with this fixed grammar:

1. **Header (sticky):** kind icon · Polish kind label · element name · voltage chip · alarm/severity badge · breadcrumb (`Stacja › Pole › Aparat`) · close.
2. **Live chips strip:** `liveMetrics` already wired in `SldDetailDrawerData` — surface `kV/A/%/MVA` here. Always show "Dane niedostępne" instead of `0` when missing.
3. **Tabs (typed):**
   - Karta techniczna (always; today's "overview" + "parameters")
   - Konfiguracja (was: drawer's domain-specific tabs)
   - Wyniki & Limity (was: Inspector's results/limits; only when run available)
   - Dowód obliczeń (only when `activeRunId` present)
4. **Primary CTA bar (fixed bottom):**
   - `Konfiguruj…` (opens full-screen configurator only when the inline form cannot fit)
   - `Otwórz pełny widok` (drill-down, e.g. `StationInternalView`) — explicit, never automatic
   - Overflow `⋯` → context-menu actions from `SLD_MENU_REGISTRY` (Budowa/Edycja/Widok/Usuń) with the same `disabledReasonPl` shown as tooltip + inline hint.
5. **No surface replacement on selection.** `SchematContextPanel` and other shell panels remain navigation surfaces; the object card always opens *next to* them, not *over* them.

# Screen/component-level recommendations

| Component | Action | Why |
|---|---|---|
| `SldDetailDrawer` | **Keep as the single object surface.** Rename internally to `ObjectCard`. | Already has the richest object grammar (header, breadcrumb, tabs, live chips, save, full-view CTA). |
| `InspectorPanel` | **Merge into ObjectCard** as the "Wyniki & Limity" + "Dowód" tabs. Drop standalone right-card render path. | Eliminates the dual read/edit surface and the "read-only banner" leakage. |
| `EmptyInspectorPanel` | Replace `'Wybierz element w tabeli, aby zobaczyć szczegóły'` with an actionable empty state pointing at `SchematContextPanel` / canvas. | Today's empty state is a dead surface. |
| `SchematContextPanel` | **Keep as left navigator.** Single click on a tree row should select on canvas + open ObjectCard — never replace the right panel. | It is a tree, not an object surface. |
| `SldContextMenuController` | **Keep**, extend with Merge/Remove confirmation flow that reuses `SplitPreviewPanel`-style preview. | Already has `group` (Budowa/Edycja/Widok/Usuń) and `disabledReasonPl`. |
| `SplitPreviewPanel` | **Promote to generic `TopologyChangePreviewPanel`** used by Split, Merge, Remove-with-impact. | The "Skutki elektryczne / affectedObjectRefs / invalidatedResults" contract already exists. |
| `StationInternalView` | **Keep as drill-down full screen**, entered only via explicit `Otwórz pełny widok` from ObjectCard. | Today it competes with the drawer; an explicit CTA removes ambiguity. |
| "Kanoniczny konfigurator" (`onOpenConfiguration`) | **Keep as full screen** for forms that exceed the drawer footprint (e.g., multi-form bay protection). Reach only via `Konfiguruj…` CTA. | Avoid floating modals stacking over the drawer. |
| `ReadinessLivePanel`, `IssuePanel`, `AnalysisEligibilityPanel` | Keep as workspace-level surfaces (not per-object). | They are global state, not selection-driven. |

# Testable interaction model

| Event | On canvas object | On empty canvas | On a selected object |
|---|---|---|---|
| **Left click** | Selects + opens ObjectCard on "Karta techniczna" tab. | Clears selection, closes ObjectCard. | Re-focuses ObjectCard (no new mount). |
| **Double click** | Opens ObjectCard *and* triggers the object's canonical full-view (e.g., station → `StationInternalView`, bay → bay editor). For atomic objects (apparatus, cable segment) double-click is a no-op explicitly. | No-op. | Same as left click target. |
| **Right click** | Opens `SldContextMenuController` (Budowa/Edycja/Widok/Usuń) anchored to the object; ObjectCard stays in sync (auto-selects target). | Opens background menu (`KIND_HEADER_PL.background`). | Menu reflects the current selection. |
| **Disabled action** | Item rendered but greyed; tooltip = `disabledReasonPl`; inline reason persists when item is focused via keyboard. | n/a | n/a |
| **Escape** | Closes context menu first, then ObjectCard, then clears selection (priority order). | Closes menu only. | Closes ObjectCard. |
| **Keyboard `Enter`** on selected object | Equivalent to double click (open full view). | n/a | n/a |

Acceptance contracts (Playwright + Vitest) should assert: (a) at most one ObjectCard mounted at a time per `selectionId`, (b) every disabled menu item has a non-empty `blockedReason`, (c) double-click never replaces single-click behavior — it adds the full-view navigation on top.

# Remove / Merge / Split exposure (without changing domain rules)

All three operations enter through the same 3-state controller pattern Split already uses (`preview_ready` → `confirm` → `commit`):

1. **Entry points:** ObjectCard `⋯` overflow or `SldContextMenuController` "Usuń" / "Edycja" group. Both call the same `TopologyChangeController` for the operation.
2. **Preview panel (`TopologyChangePreviewPanel`)**: shows `affectedObjectRefs`, `invalidatedResults`, `missingDataAfter`, `topologyTypeChanged`, plus operation-specific summary (split halves, merge endpoints, remove fan-out).
3. **CTAs:** `Anuluj` / `Potwierdź` (matching `SplitPreviewPanel`).
4. **Commit writes an audit entry** that lands in `ChangeAuditTrailPanel` with `who/when/why` and previous-state pointer; ObjectCard reflects the new state immediately.
5. **Disabled = explained.** If domain ops report the action is not safe, the menu entry stays visible with `disabledReasonPl` (e.g., "Nie można usunąć — pole jest częścią ciągu kablowego SN").

This is a UI-layer composition only — it consumes whatever the existing domain/ENM topology operation surface returns. **No new physics rule, no new domain mutation, no shadow model.** Requires existing ENM/domain operation support for merge and remove-with-impact reports (same shape as Split's `SplitElectricalImpact`).

# Testable acceptance criteria

- **AC-UX-01 — Single object surface.** For any selection event, at most one `data-testid="object-card"` is mounted; legacy `inspector-panel` and `SldDetailDrawer` do not coexist on the same selection.
- **AC-UX-02 — Predictable click grammar.** E2E asserts the click matrix above for at least one representative of every `SldElementKindForMenu` (station, bay, apparatus, cable_segment_sn, overhead_line_sn, zksn, branch_pole, der_pv, der_bess, der_fw, section, gpz, background).
- **AC-UX-03 — No dead clicks.** A guard test asserts every `ContextMenuAction` with `enabled: false` carries a non-empty `blockedReason`; every disabled inspector tab carries a non-empty `disabledReasonPl`.
- **AC-UX-04 — No false zero.** Unit test for the limits/status builder asserts that `null/undefined` inputs render "Dane niedostępne" and yield status `unknown`, never `OK`.
- **AC-UX-05 — Polish labels.** Existing `no_codenames_guard` + `ui_terminology_guard` extended to cover ObjectCard tab labels and CTA strings.
- **AC-UX-06 — Destructive ops are gated.** E2E: triggering Remove/Merge always renders `TopologyChangePreviewPanel` with `Potwierdź` and `Anuluj` before commit; commit produces an `audit-trail` row.
- **AC-UX-07 — Full view via explicit CTA only.** Selection alone never navigates to `StationInternalView`; only `Otwórz pełny widok` or `Enter`/double-click does.
- **AC-UX-08 — Proof tab discoverability.** When `activeRunId` is missing, the Dowód tab shows a CTA that links to run configuration (not just the current grey message).

# Risks and trade-offs

- **Migration risk:** consumers of `InspectorPanel` (results tables, run-results-inspector) currently mount it standalone. Folding it into ObjectCard requires a host wrapper that can render Wyniki & Limity tabs when invoked from results browser (table row click). Mitigation: keep `InspectorPanel` exportable as a *tab content component*, not a standalone card.
- **Density vs. clarity:** ObjectCard with 3–4 tabs and a CTA bar may be cramped for DER (6 sub-tabs today). Mitigation: nest the DER sub-tabs inside the "Konfiguracja" tab; do not flatten back to drawer-level tabs.
- **Behavioral change for power users:** today's `StationInternalView` opens automatically for some stations. An explicit double-click/CTA is safer but slower. Mitigation: add a per-user "Otwieraj pełny widok dwukrotnym kliknięciem" preference defaulting to ON for engineering mode.
- **Audit volume:** Routing Remove/Merge through preview + commit creates more audit rows. Acceptable cost; aligns with WHITE BOX intent.

# What not to change

- **NetworkModel / ENM semantics.** UI layer must keep consuming existing model operations; no new mutation paths, no new entity types.
- **Solver physics, IEC 60909 results, ProofDocument shape.** The Dowód tab is read-only; the FROZEN Result APIs stay frozen.
- **`SLD_MENU_REGISTRY` action ids** and their domain mapping — extending labels/groups is fine; renaming ids breaks `SldCommandService` contracts.
- **Determinism contracts in `sld/core` and SLD Determinism CI.** ObjectCard is a presentational composition; it must not feed back into layout or hashing.
- **Polish-only public strings + no-codenames invariant.** Already enforced by guards — keep it.
- **`SplitPreviewPanel` core shape (`SplitElectricalImpact`).** Generalize by composition, not by renaming fields.

# Recommended follow-up tests

1. **`objectCardSingleton.test.tsx`** — assert one ObjectCard per selection across kinds (Vitest with `SldWorkspaceContainer` host).
2. **`clickGrammar.spec.ts`** (Playwright, real backend) — exercises left/double/right click for one of every `SldElementKindForMenu` and verifies surfaces opened.
3. **`disabledReasons.guard.ts`** — extend `dead_click_guard.py` (already in repo) to inspector tabs and ObjectCard CTAs.
4. **`limits.nullSafety.test.ts`** — unit test for null vs `0` in limit/status formatters; lock in "Dane niedostępne".
5. **`topologyChangePreview.spec.ts`** — Split + Merge + Remove all flow through `TopologyChangePreviewPanel`, all write `ChangeAuditTrailPanel` row.
6. **`proofTabCta.test.tsx`** — Dowód tab without `activeRunId` shows an actionable CTA (not an empty state).
7. **`labels.terminology.ts` extension** — feed ObjectCard tab labels and CTAs into `ui_terminology_guard.py`.
8. **`drillDownExplicit.spec.ts`** — selection alone never mounts `StationInternalView`; only explicit CTA / double-click does.

Note: every recommendation that depends on Merge or Remove-with-impact previews requires existing ENM/domain operation support (same shape as `SplitElectricalImpact`); none of this proposes new physics, solver behavior, or catalog truth.
