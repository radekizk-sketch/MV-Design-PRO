# SLD_VISUAL_REGRESSION_CONTRACT — Kontrakt visual regression w CI

**Status:** AKTUALNY (P0.10 SLD F5 scaffolding 2026-05-13)
**Wersja:** 1.0
**Powiązane:**
- `docs/sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md` AC-11
- `docs/plan/PLAN_SLD_REWORK.md` § 7 (F5 — Visual regression w CI)
- `frontend/e2e/visual/sld_industrial_visual.spec.ts` (test specs)
- `frontend/playwright.config.ts` (toHaveScreenshot config)
- `.github/workflows/sld-visual-regression.yml` (CI workflow)

---

## 1. Cel

CI guard'owanie wyglądu SLD klasy przemysłowej. Bez tego każda zmiana w
layoutEngine, rendererach lub themie może wprowadzić niezauważalną regresję
wizualną — patrz `SLD_VISUAL_QUALITY_AUDIT.md` § 5 (brak visual regression w CI).

Cel: pixel diff threshold **0.5%** per snapshot, diff artifacts uploadowane przy
regresji, update baseline tylko explicit.

## 2. Co jest pinned

### 2.1 MVP (scaffolding 2026-05-13)

5 snapshotów aktywnych:
- `leaf-lod-2.png` — sieć liniowa (1 stacja końcowa)
- `pass-lod-2.png` — sieć przelotowa (2 stacje na trunk)
- `branch-lod-2.png` — odgałęzienie z magistrali
- `ring-lod-2.png` — pierścień z NOP
- `theme-dark_scada-ring-lod-2.png` — pin canonical dark mode appearance

### 2.2 Target (po F3 + F4 ukończonych)

60 snapshotów = 15 fixtures × 4 LOD:
- 4 sieci ref (leaf / pass / branch / ring+NOP)
- 1 GPZ 110/15 kV 12-bay
- 4 typy stacji (GPZ / RMU / MV/LV przelotowa / MV/LV odgałęźna)
- 3 DER (PV 1 MWp / BESS 500 kWh / FW 2 MW)
- 3 edge cases (missing-data / no-calc / empty-project)

Per fixture × 4 LOD (0=overview, 1=planview, 2=standard, 3=technical). LOD-4
(full detail) testowane manualnie — zbyt duża wariancja per system.

## 3. Reguły uruchamiania

### 3.1 Generowanie baseline (developer, jednorazowo)

```bash
cd mv-design-pro/frontend
npm run test:e2e:update-snapshots -- --grep "visual:sld"
```

**WYMAGA**: chromium zainstalowany lokalnie (`npx playwright install chromium`).

Baseline PNG-i lądują w `frontend/e2e/visual/__snapshots__/sld_industrial_visual.spec.ts/`.
Commit tych plików razem ze zmianami SLD pipeline'u.

### 3.2 Regression check (CI domyślny)

```bash
cd mv-design-pro/frontend
npx playwright test --grep "visual:sld"
```

CI workflow: `.github/workflows/sld-visual-regression.yml`. Trigger przy zmianie:
- `frontend/src/ui/sld/**`
- `frontend/e2e/visual/**`
- `frontend/playwright.config.ts`

### 3.3 Threshold + tolerancja

W `playwright.config.ts` § expect:
```ts
toHaveScreenshot: {
  maxDiffPixelRatio: 0.005, // 0.5% pixel diff
  threshold: 0.2,           // per-pixel color tolerance
  animations: 'disabled',
  caret: 'hide',
}
```

Reguła: **regresja = > 0.5% pixeli różnych** (zgodnie z AC-11 binding).

## 4. Co NIE jest pinned

- Live network E2E visual diffs — pokryte przez `critical-run-flow.spec.ts` itp.
- SCADA overlay visual states — deferred do F4 (theme switcher + overlay redesign)
- DXF export visual diff — deferred do P2 (DXF roadmap)
- Mobile / tablet viewports — out of scope (industrial SLD = desktop A3-grade)

## 5. Lifecycle baseline

1. **Pierwsze ustanowienie** — developer uruchamia `update-snapshots`, commituje PNG-i.
2. **Code review** — wizualne baseline-y reviewowane jak każda zmiana (ocena
   inżynierska SN per `SLD_VISUAL_ACCEPTANCE_CRITERIA.md`).
3. **Zmiany SLD pipeline** — CI failuje, jeśli baseline różny. Developer:
   - Bug: fix kod → testy zielone
   - Intencjonalna zmiana: rerun `update-snapshots` → commit nowych PNG-i + uzasadnienie w PR
4. **Anti-regression** — guard wymusza, że żadna zmiana nie przejdzie cicho.

## 6. Antiwzorce (zakazane)

- **Auto-update baseline w CI** — NIGDY. Baseline aktualizowany TYLKO explicit przez developera.
- **Ignorowanie diff artifacts** — review każdej regresji manualnie przed approve.
- **Threshold > 0.5%** — narusza AC-11 binding. Jeśli flaky → fix renderingu, nie threshold.
- **Brak GitLFS dla snapshotów** — PNG-i mogą być duże; lfs preferowane.

## 7. Powiązane CI guards

- `sld_determinism_guards.py` — pinuje determinizm SLD render manifest (numerical)
- `port_binding_guard.py` — pinuje 100% port-based edges (F2)
- Ten workflow (`sld-visual-regression.yml`) — pinuje wygląd (PNG diff)

Trzy warstwy obronne razem zapewniają: numerical determinism + structural
correctness + visual fidelity.

## 8. Status implementacji

| Element | Status | Komentarz |
|---------|--------|-----------|
| Playwright config (`toHaveScreenshot`) | ✅ 2026-05-13 | threshold 0.5% per AC-11 |
| Visual spec (`sld_industrial_visual.spec.ts`) | ✅ 2026-05-13 | 5 active + skipped LOD/light themes |
| CI workflow | ✅ 2026-05-13 | trigger na zmiany SLD pipeline |
| Baseline PNG-i | ⏳ TODO | wymaga uruchomienia `update-snapshots` na stable layout |
| GitLFS dla snapshotów | ⏳ TODO | rekomendowane przed pierwszym baseline |
| 60-snapshot full coverage | ⏳ TODO | po F3 (LOD policy) i F4 (theme switcher) |
| `light_technical` theme baseline | ⏳ TODO | po F4 (theme switcher w DOM) |

---

**KONIEC KONTRAKTU VISUAL REGRESSION**
