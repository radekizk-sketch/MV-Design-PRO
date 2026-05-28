# UX Review — MV-Design-PRO proposed UI changes

Scope reviewed: `AddDerWizard`, `StationConfigTransformerCard`, `CatalogBrowser`, `StationConfiguratorSurface`, and the 17-step Station Wizard v2 flow (per `station-wizard-v2-flow.spec.ts`).

---

## 1. Top UX risks (must-fix)

**R1. Silent variant switching in AddDerWizard.**
`AddDerWizard.tsx:1028-1045` auto-flips `connectionSide` from `nN` → `dedicated_transformer` whenever a voltage mismatch is detected, with no toast, no diff card, no undo. A user who explicitly chose "nN" on step 2 can land on step 3 with a different variant in step 5's review. This violates the wizard's own stated rule ("Anulowanie usuwa szkic — nie ma pół-obiektów"): we mutate beyond the user's explicit selection.

**R2. Warnings used as gates.**
`AddDerWizard.tsx:941-953` — `canGoNext` requires `voltageMismatchWarning === null && transformerPowerWarning === null`. If something blocks "Dalej", it must be an error, not a warning. Either upgrade the copy to error severity ("Niezgodność…") or allow Next with an acknowledgement. Today the user sees yellow warning styling but a dead "Dalej" — the classic "why can't I continue" trap.

**R3. Reason text concatenated into `<select>` options.**
`AddDerWizard.tsx:817-822` produces option labels like
`Sungrow SG3125HV-MV … — wymaga większego transformatora stacji`. Native `<select>` truncates, isn't sortable, isn't filterable, and screen readers read the whole sentence. With PTPiREE suffixes added too (`· PTPiREE …`) the strings exceed ~120 chars. Use a card list with explicit eligibility chips.

**R4. CatalogBrowser doesn't tell the user *what* will receive the assignment.**
`CatalogBrowser.tsx:334-340` — the CTA "Przypisz do elementu" doesn't show the element. Browser is launched from many entry points (transformer card, DER wizard, bay editor) and an engineer can lose track of which row triggered it. Surface the target ("Przypisz do: Transformator TR-2 stacji S-04") in the footer or button.

**R5. Station Configurator's primary toolbar overloads "Dodaj PV/BESS/FW".**
`StationConfiguratorSurface.tsx:1325-1332` — one button labeled "Dodaj PV/BESS/FW" actually hardcodes `handleAddDer('PV')`. Either split into three buttons, or make it a menu (`<Menu trigger="Dodaj…">`), or rename to "Dodaj PV". Today the label promises three kinds, delivers one.

**R6. Top-bar action buttons appear/disappear without preserving layout.**
Same file, lines 1305-1324: "Kontynuuj ciąg SN" and "Wyprowadź odgałęzienie SN" render only when their contexts exist. From the user's perspective, the toolbar shape changes between similar-looking stations. Always render them, disable with tooltip explaining the precondition ("Brak wolnego pola wyjściowego SN").

**R7. Station Wizard v2 — 17 linear steps, no save-as-draft signal.**
The e2e (`station-wizard-v2-flow.spec.ts`) asserts a happy path of 17 clicks. There is no checkpoint/save indication and "Anuluj" silently returns to SLD. For a wizard this long, the user must know: (a) what's persisted, (b) when, (c) whether cancel discards. Add a draft state and an explicit "Anuluj odrzuca zmiany" confirm.

---

## 2. Component-level recommendations

### StationConfigTransformerCard (`cards/StationConfigTransformerCard.tsx`)
- **Duplicate CTAs.** The empty `<option>` placeholder ("wybierz z katalogu") and the green "Zastosuj rekomendację: …" button both serve the same first action. Pick one — prefer the recommendation button, leave the select for overrides.
- **Information loss in status mapping (line 64-68).** Both `częściowe` and `brak danych` map to `"do konfiguracji"`. Engineers triage by severity; collapse hides which transformers have *some* data vs. none. Use two labels: "uzupełnij" vs. "brak danych".
- **Inconsistent symbol case.** `Sn`, `u_k`, `P_k`, `P_0` — IEC convention is italic/serif but at minimum, be consistent: either `Sn / Uk / Pk / P0` or `S_n / u_k / P_k / P_0`. Match `mv-design-pro/docs/system/SPEC_*` if it exists; otherwise pick one.
- **Redundant voltage display.** `U_HV / U_LV` read-only span sits next to an editable `U_LV` select. Either show only the editable control (with HV as helper), or move the readout into a header bar.
- **Tap-changer summary is post-selection only.** Pre-select preview (e.g. compare 2-3 candidate tap changers in a small table) would help the engineer pick OLTC vs DETC consciously.

### AddDerWizard (`station-der/AddDerWizard.tsx`)
- **Make the auto-switch explicit (R1 fix).** Replace the auto-effect with a banner on step 2: "Wybrany falownik 0,69 kV nie pasuje do szyny nN 0,4 kV. Przełączyć na transformator dedykowany? [Przełącz] [Wybierz inne urządzenie]." This makes the system suggestion visible and reversible.
- **Step 3 device picker should be a list, not a `<select>`.** Each device row: name, manufacturer, P/Sn, voltage, PTPiREE chip, eligibility chip ("OK" / "wymaga TR dedykowanego" / "moc > TR stacji"). Filterable by chip.
- **Step 4 NC RfG.** Currently all three (`ncrfgProfile`, `lvrtCurve`, `hvrtCurve`) must be set independently; `applyProfileDefaults` does pre-seed them. Add visible "domyślnie z profilu operatora" line and a single "Zmień krzywe" toggle to keep the simple path simple.
- **Review step (5) needs a diff vs. defaults.** Today it lists chosen values. Add "(domyślne)" / "(zmienione)" markers so engineers approving the wizard see what's bespoke.
- **Step navigation: sidebar with state per step.** Test name says guided 5-step; the actual sidebar is only at footer. Mirror the Station Wizard v2 sidebar pattern for consistency.

### CatalogBrowser (`network-build/CatalogBrowser.tsx`)
- **R4 fix:** Show the assignment target in the footer next to "Przypisz do elementu". Pass `targetLabel` as a prop.
- **Don't clear search on namespace change** (line 247). Engineers often look up the same item across categories. Persist the query.
- **Two-letter "icons" (`LN`, `CB`, `TR`, `OPN`, `BP`)** are passable as text badges but the hidden `<p className="hidden" aria-hidden>` for manufacturer (line 330-332) signals dead/orphan code — remove it or render it. As-is it's a maintenance trap.
- **Param columns vary by namespace.** When the namespace lacks a `NAMESPACE_PARAM_LABELS` entry, the user sees only Name + Manufacturer and can't differentiate types. Add at minimum `Un` and `In` (or `Sn`) as universal columns.
- **No clear "no catalog binding" path.** If an engineer realises no type fits, there's no documented exit ("zaprojektuj typ użytkownika"). Confirm whether `Faza H` is planned — if so, mention it in empty state.

### StationConfiguratorSurface
- **R5 / R6 fix** as above.
- **Empty state when `stationRef` is null.** The amber note (line 1336-1340) tells the user what to do but provides no in-place action. Add a "Wybierz stację z listy" button that opens the station tree, or render a select.
- **No breadcrumb / no back.** Surface header shows "Konfigurator stacji SN/nN > {stationName}" implicitly but no breadcrumb. Engineers navigating via SLD → Station → Configurator → DER Wizard need a return path that doesn't lose state.
- **Detach confirm copy is good** (lines 1370-1399) — keep. The destructive-red CTA + nieodwracalna chip + clear consequence statement is exactly the pattern for the other destructive actions.

### Station Wizard v2 (17 steps / 7 groups)
- **Group label "Infrastr." is truncated.** Use "Infrastruktura" or a clear short form ("Pozostałe"). Truncation in CHIP-like UI looks like a bug.
- **Group "Stacja" is too generic** given the whole wizard is about a station. Suggested rename: "Konfiguracja transformatora i nN" or split into two groups.
- **17 steps is many.** Consider grouping into 3-tier nav (group → step → sub-step) so the user sees progress vs. only counting `Krok N / 17`. The current group sidebar exists, but `data-active-step` doesn't show group context.
- **"Zakończ" vs "Dalej" — make finishing irreversible-feeling.** The e2e test asserts the button label changes on the last step. Good. Add a final "Sprawdzenie kompletności" gate that shows red/yellow/green per step before submit.

---

## 3. Suggested alternative interaction flows

### Flow A — DER addition without modal
Replace the 5-step modal wizard with an inline pane that opens in the right column of StationConfiguratorSurface and disappears when valid → mirrors how PowerFactory/DIgSILENT-style apps let you keep the network visible while configuring an asset. Modal forces tunnel vision; the schema view is the whole point.

### Flow B — Catalog browser as a slide-over with target chip
Open as a right-side slide-over (not full-screen modal), always showing a top chip "Wybierasz dla: TR-2 (15/0,4 kV, 1,6 MVA)". On namespace switch, preserve search query. CTA becomes "Przypisz {name} do TR-2".

### Flow C — Station Wizard with checkpoints
Replace linear 17/17 with three phases:
1. **Topology** (cable, switchgear, bays, apparatus) — must complete to leave phase
2. **Pomiary + transformator + nN**
3. **OZE + ochrona + gotowość**
Each phase has an explicit "Zapisz i kontynuuj"; user can leave and re-enter without losing state. Reduces fear of long wizards.

---

## 4. Testable acceptance criteria

- **AC-1** Given device on step 3 triggers `voltageMismatchWarning`, the system shows a banner with `[Przełącz na TR dedykowany]` and `[Wybierz inne urządzenie]` actions; no silent mutation of `connectionSide` occurs.
- **AC-2** "Dalej" on any wizard step is disabled only when a true error exists; warnings allow Next with an inline acknowledgement.
- **AC-3** `CatalogBrowser` footer renders an element-target label whenever invoked with a `targetLabel` prop; missing prop renders `aria-label`/test fails.
- **AC-4** `CatalogBrowser` search query persists across namespace changes (covered by `expect(input.value).toBe(query)` after click).
- **AC-5** Station configurator toolbar always renders three primary buttons; `aria-disabled` + tooltip explains preconditions when a context is missing.
- **AC-6** "Dodaj PV/BESS/FW" opens a 3-option menu or is renamed to single-kind label.
- **AC-7** Station Wizard `Anuluj` shows a confirm if any field is dirty; cancel from clean state navigates immediately.
- **AC-8** Status mapping in transformer card distinguishes `częściowe` ("uzupełnij") from `brak danych` ("brak danych") — assertion: `STATUS_LABEL[częściowe] !== STATUS_LABEL[brak danych]`.

---

## 5. What NOT to change

- ✅ Keep ENM/domain-driven SLD topology — don't decorate.
- ✅ Keep the destructive-action pattern in the DER detach modal — reuse it elsewhere.
- ✅ Keep Polish engineering labels and IEC unit notation.
- ✅ Keep `data-testid` granularity — it's enabling deterministic e2e.
- ✅ Keep the catalog-binding requirement (catalog_ref everywhere) — don't loosen for UX.
- ✅ Keep 5-step DER wizard structure (variant → point → device → profile → review). The structure is right; the gating and inline-mutation behavior are what need fixing.
- ✅ Keep the readiness gate at the wizard's end.

---

## 6. Risks of the recommendations

- **R3/R4 (CatalogBrowser refactor):** changes the prop signature; e2e tests that drive the browser by `data-testid` will need to also assert the target chip. Low effort.
- **R1 (banner instead of auto-switch):** removes a "smart" behavior some users might have come to rely on. Telemetry/feedback after rollout recommended; offer a "Zastosuj sugestię" button to preserve the one-click path.
- **R7 (wizard phases):** introduces state persistence questions. If draft persistence isn't implemented backend-side, scope this to in-memory state with a clear "po wyjściu utracisz zmiany" notice.

Must-fix priority: **R1, R2, R3, R5** (correctness/safety of user intent). Polish: **R4, R6, R7** and the per-component items.
