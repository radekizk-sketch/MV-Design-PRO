## UX/SLD review — DER labeled "PVR"

### What the user sees vs. what they need

On a professional MV SLD, a generator/inverter symbol must answer four questions *at a glance*, without clicking:

1. **What is it?** (kind: PV / BESS / FW)
2. **Which one?** (instance tag — "PV1", "PV-Pole-N")
3. **How big?** (nameplate, e.g. "500 kWp / 0.4 kV")
4. **What's its state?** (data complete? connected? operating point?)

"PVR" answers *none of these cleanly*. It reads as an unparsable token: type? codename? ID? Acronym? An engineer scanning the schematic has to stop, hover, or open the inspector to find out — that is a workflow regression. SLD labels are scan-targets, not riddles.

### Root cause (most likely)

`DerRenderer` defines canonical kind chips `PV | BESS | FW` (frontend/src/ui/sld/v2/renderer/DerRenderer.tsx:84-88). There is no "PVR" in the kind enum. So "PVR" is almost certainly the operator-entered **`name`** field rendered standalone — and the kind chip is either suppressed, collided with the name, or invisible at the current LOD/zoom. The label composition rule isn't enforcing kind+tag separately.

### Specific UX defects

1. **Ambiguity / non-discoverable semantics.** "PVR" has no industry meaning. IEC 60617 and ETAP/PowerFactory/DIgSILENT conventions never use a 3-letter generator code without separator. A novice operator will read it as a typo of "PV"; a senior may suspect a project codename.

2. **Polish-localization & codename risk.** Project rule #8 forbids project codenames in UI strings. "PVR" looks suspiciously like a codename and will trip `no_codenames_guard` perception even if technically a user-entered name. The label pipeline should *sanitize and structure* operator input, not pass-through raw strings.

3. **Composition failure.** The renderer owns `kind` ('PV') + `name` ('R'?) + `nominalPowerKw` + `blockTransformerLabel`. The on-canvas label should always be a deterministic compound, e.g.
   ```
   PV1 · 500 kWp     (LOD=full)
   PV1               (LOD=compact)
   ●                 (LOD=marker, color-coded)
   ```
   Showing "PVR" alone means the composition collapsed to a single field — likely the user's `name`. Kind is encoded in the symbol fill (`#FFC857`) but a yellow rhombus at 1:1 scale is not a substitute for a text chip at routine zoom.

4. **Scan failure at zoom levels.** At LOD=compact the label drops from "full symbol + chip" to ~28px. If `name="PVR"` overrides the kind chip, you lose the only textual differentiator from BESS/FW. The label hierarchy must be: **kind chip (immutable) > tag (operator) > nameplate (catalog)**, never the reverse.

5. **Click affordance gap.** Even if the label is terse by design, hover should immediately surface the resolved identity (kind, tag, kWp, PCC, connection variant). If "PVR" requires opening `SldDetailDrawer` to learn it is a PV at the LV side of a station, the tooltip layer is doing too little.

### Recommendations (no code changes here — design intent)

| Layer | Fix |
|---|---|
| Label composition | Always render `${KIND_LABEL_PL[kind]}${tag} · ${kWp} kWp`. Treat `name` as *tag suffix*, not as the whole label. Strip/validate operator-entered names so a bare "PVR" is normalized to `PV-R` or rejected with a hint. |
| Tag policy | Enforce `^[A-Z]{2,4}[-_]?\d+$` or `kind + ordinal` (PV1, PV2 …) on creation. Free-form names go to a separate `description` field, shown in tooltip/drawer, not on the canvas. |
| LOD discipline | Kind chip is **mandatory** at LOD=full and LOD=compact. At LOD=marker, kind is communicated by `KIND_FILL_COLOR` + legend, never by text. |
| Tooltip | Hover over the DER glyph shows the **resolved identity card**: `PV · "PVR" · 500 kWp · połączony na ND · Moduł B`. This is the click-free disambiguation answer. |
| Missing-data visual | If operator left `name` empty or sub-standard, render `PV?` with a yellow ⚠ badge — same severity language as `missingPcc`. Currently a bad string slips through silently. |
| Polish convention | Use Polish acronyms consistently: `PV`, `BESS`, `EW` (or `FW` if that's the chosen canon — pick one and freeze). Never mix abbreviation schemes inside the same diagram. |
| Drawer breadcrumb | `Stacja › Pole DER › PV1 "PVR"` — the operator-entered string is shown in quotes, clearly distinguishing it from the canonical tag. This kills the "is it a codename?" question. |

### What to verify next (if you act on this)

- Open the active SLD case and confirm whether "PVR" originates from `Generator.name`, `tag`, or a fallback path in `DerRenderer`. The fix differs: composition bug vs. input-validation bug vs. LOD bug.
- Audit `AddDerWizard` to see whether the name field has any guidance, placeholder ("np. PV1"), or validation. If it's free-form with no hint, operators will keep producing "PVR"-class labels.
- Check whether the same label survives in PDF/DOCX export — if "PVR" reaches the proof pack, it's also a deliverable-quality issue, not only a screen issue.

**Bottom line:** the symbol carries the engineering meaning; the text label must carry the *identity*. "PVR" carries neither. The renderer already has all the structured fields (`kind`, `nominalPowerKw`, `connectionVariant`, `ncRfgModule`) — the fix is composition discipline plus input hygiene, not new data.
