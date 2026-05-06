# SLD REPO HYGIENE I SIMPLIFY

**Data:** 2026-03-14
**Wersja:** 1.0
**Status:** WIAZACY

---

## 1. CEL

Agresywne uproszczenie architektury i kodu obszaru SLD. Eliminacja chaosu bez utraty semantyki. Docelowo: jeden model, jeden silnik geometrii, jedna biblioteka symboli, jeden zestaw stylĂłw.

---

## 2. PLIKI DO USUNIECIA

| Plik | PowĂłd | Status |
|------|-------|--------|
| `core/topologyAdapter.ts` (V1) | Zastapiony przez topologyAdapterV2 | DO USUNIECIA |
| `docs/sld/EXEC_PROMPT_CANONICAL_SLD_benchmark.md` | Prompt, nie spec | DO USUNIECIA |
| `docs/sld/SLD_RUN3B_ROADMAP.md` | Stary roadmap | DO USUNIECIA |
| `docs/sld/SLD_REPO_GAP_AUDIT.md` | Zastapiony przez AUDYT_SLD_SPEC_VS_CODE_GLOBALNY | DO USUNIECIA |
| `docs/sld/SLD_PIPELINE_CANONICAL_STATUS.md` | Zastapiony przez nowe dokumenty | DO USUNIECIA |
| `docs/sld/SLD_E2E_PIPELINE_MAP.md` | Scalony do SLD_MODEL_SEMANTYCZNY | DO USUNIECIA |
| `docs/sld/SLD_SINGLE_SOURCE_OF_TRUTH_MAP.md` | Scalony do SPEC_MODEL_OGOLNY | DO USUNIECIA |
| `docs/sld/SLD_PROJECT_MODE_OVERRIDES_V1.md` | Scalony do SLD_GEOMETRIA_KANONICZNA | DO WERYFIKACJI |

## 3. PLIKI DO SCALENIA

| Pliki zrĂłdlowe | Plik docelowy | Opis |
|---------------|--------------|------|
| SLD_ALGORITHM_LAYOUT_SPEC.md + GEOMETRIA_ESTETYKA_PRZEMYSLOWA.md | SLD_GEOMETRIA_KANONICZNA.md | Pelna spec geometrii |
| SLD_SYMBOLS_CANONICAL.md (stary) | SLD_SYMBOLIKA_KANONICZNA.md (nowy) | Pelna spec symboli |
| SLD_SYSTEM_SPEC_CANONICAL.md + SLD_GENERAL_MODEL_V1.md | SLD_SYSTEM_SPEC_CANONICAL.md | Skonsolidowana spec systemu |

## 4. PLIKI DO PRZEPISANIA

| Plik | PowĂłd | Cel |
|------|-------|-----|
| sldCanonicalStyle.ts (1939 linii) | Za duzy, monolityczny | Podzial na: sldColors.ts, sldGeometry.ts, sldTypography.ts, sldHelpers.ts |

## 5. DOCELOWA STRUKTURA MODULĂ“W SLD

```
frontend/src/ui/sld/
  core/
    sldSemanticModel.ts          # NOWY — typy SldSemanticModelV1
    sldSemanticAdapter.ts        # NOWY — Snapshot -> SldSemanticModel
    sldSemanticValidator.ts      # NOWY — walidator kontraktĂłw per typ stacji
    topologyAdapterV2.ts         # ISTNIEJACY — BFS segmentacja (uzywany przez adapter)
    stationBlockBuilder.ts       # ISTNIEJACY — budowa pĂłl (uzywany przez adapter)
    layoutPipeline.ts            # ISTNIEJACY — 6-fazowy layout
    visualGraph.ts               # ISTNIEJACY — typy wizualne
    layoutResult.ts              # ISTNIEJACY — wynik layoutu
    __tests__/
      sldSemanticModel.test.ts   # NOWY
      sldSemanticAdapter.test.ts # NOWY
      sldSemanticValidator.test.ts # NOWY
      stationContracts.test.ts   # NOWY — testy kontraktĂłw per typ stacji
      ...existing tests...
  symbols/
    etapSymbols.tsx              # ISTNIEJACY — kanoniczny renderer IEC 60617
  styles/
    sldColors.ts                 # NOWY (z sldbenchmarkStyle)
    sldGeometry.ts               # NOWY (z sldbenchmarkStyle + IndustrialAesthetics)
    sldTypography.ts             # NOWY (z sldbenchmarkStyle)
    sldHelpers.ts                # NOWY (z sldbenchmarkStyle)
    sld-canonical.css            # ISTNIEJACY
  renderers/
    TrunkSpineRenderer.tsx       # ISTNIEJACY
    FieldBlockRenderer.tsx       # ISTNIEJACY (kanoniczny renderer pola/stacji)
    BranchRenderer.tsx           # ISTNIEJACY
    CanonicalSymbolRenderer.tsx       # ISTNIEJACY
  overlay/
    ...overlay components...     # ISTNIEJACE (read-only)
```

## 6. DOCELOWY ZESTAW DOKUMENTĂ“W SLD

| Dokument | Status | Zawartosc |
|----------|--------|-----------|
| SLD_SYSTEM_SPEC_CANONICAL.md | WIAZACY | System canon: pipeline, kontrakty, invarianty |
| SLD_GENERAL_MODEL_V1.md | WIAZACY | Ontologia, segmentacja, embedding, invarianty |
| SLD_GEOMETRIA_KANONICZNA.md | WIAZACY | Parametry, algorytmy, warstwy, style |
| SLD_TYPY_STACJI_KANONICZNE.md | WIAZACY | Typologia: inline, branch, sectional, terminal |
| SLD_STACJA_PRZELOTOWA_KONTRAKT_WIAZACY.md | WIAZACY | Kontrakt szczegĂłlowy stacji przelotowej |
| SLD_SYMBOLIKA_KANONICZNA.md | WIAZACY | Biblioteka symboli IEC 60617 |
| SLD_MODEL_SEMANTYCZNY_ADAPTERY_I_WALIDACJA.md | WIAZACY | SldSemanticModel, adapter, walidator |
| SLD_REPO_HYGIENE_I_SIMPLIFY.md | WIAZACY | Higiena repo, czyszczenie |
| SLD_TEST_MATRIX.md | WIAZACY | Macierz testĂłw |
| SLD_REPO_HYGIENE_RULES.md | WIAZACY | Reguly higieny |
| SLD_STYL_WIZUALNY_KANONICZNY.md | WIAZACY | Kolory, typografia, stale |

**Usuniete z kanonicznych (7 dokumentĂłw):**
- EXEC_PROMPT_CANONICAL_SLD_benchmark.md
- SLD_RUN3B_ROADMAP.md
- SLD_REPO_GAP_AUDIT.md
- SLD_PIPELINE_CANONICAL_STATUS.md
- SLD_E2E_PIPELINE_MAP.md
- SLD_SINGLE_SOURCE_OF_TRUTH_MAP.md
- SLD_ALGORITHM_LAYOUT_SPEC.md (scalony do GEOMETRIA_KANONICZNA)
- GEOMETRIA_ESTETYKA_PRZEMYSLOWA.md (scalony do GEOMETRIA_KANONICZNA)

---

## 7. ZAKAZY

- Zostawiania starych sciezek "na wszelki wypadek"
- Utrzymywania rĂłwnoleglego starego i nowego modelu (po migracji)
- DlugĂłw ukrytych pod warstwa renderu
- Eksperymentalnych komponentĂłw w sciezce produkcyjnej
- DokumentĂłw eksperymentalnych jako kanonicznych

