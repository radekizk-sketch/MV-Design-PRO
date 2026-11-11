---
paths:
  - "mv-design-pro/frontend/src/ui/sld/**"
  - "mv-design-pro/frontend/src/ui/sld-editor/**"
  - "mv-design-pro/frontend/src/ui/sld-overlay/**"
  - "mv-design-pro/frontend/src/engine/sld-layout/**"
  - "mv-design-pro/frontend/src/modules/sld/**"
  - ".github/workflows/sld-determinism.yml"
---

# Schemat jednokreskowy (SLD)

<!-- Przeniesione 1:1 z CLAUDE.md (karta CLAUDE-MD-ANTHROPIC, 2026-11-11): lista „Critical
     contract tests (run in SLD Determinism CI)" z „Testing Guidelines / Frontend Tests".
     Lista zgodna z `.github/workflows/sld-determinism.yml` (13 kroków vitest, pomiar 2026-11-11). -->

Critical contract tests (run in SLD Determinism CI) — **spisane z
`.github/workflows/sld-determinism.yml`, nie z pamięci** (korekta 2026-08-08:
poprzednia lista wymieniała sześć plików w `sld/core/__tests__/`, z których
**nie istniał ANI JEDEN** — ani tam, ani nigdzie w `src`; workflow nie
uruchamia niczego z `sld/core/**`. Przy każdej zmianie tego workflowa
aktualizuj tę listę, inaczej wróci fikcja):
- `sld/v2/geometry/__tests__/layoutEngine.substrate.test.ts`
- `sld/v2/geometry/__tests__/portAnchoredGeometry.substrate.test.ts`
- `sld/v2/__tests__/{ViewportController,LodPolicy}.test.ts` (StationInternalView.test.tsx
  usunięty w `08ccf7c9`, renderers.test.tsx razem z martwymi rendererami v2 2026-10-21; martwy krok workflowa zdjęty 2026-09-02 — M0-1, pilnuje `verification_phantom_paths_guard`)
- `sld/v2/command/__tests__/SldCommandService.test.ts` · `sld/v2/core/__tests__/ports.test.ts`
- `sld/v3/scene/__tests__/{lodContinuity,buildScene.sheetRows,buildScene.gpzCollapsed,busbarLabelClearance}.test.ts`
- `sld/v3/canvas/__tests__/{minSymbolSize,kadrTresci,toolbarLayout,tozsamoscEtykiet}.contract.test.ts(x)`
  oraz `gpzCollapsedExpand.test.tsx`
- `sld/v3/layout/__tests__/sheetRows.test.ts` · `sld/v3/theme/__tests__/palette.test.ts`
- SLD v3 render-odbiór acceptance: `npm run accept:sld-v3`
