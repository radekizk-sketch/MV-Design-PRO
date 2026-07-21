# PROMPT AUDYTU ZESPOŁU SPECJALISTÓW + CODE REVIEW END-TO-END (2026-07-21)

**Status:** BINDING (dyrektywa właściciela 2026-07-21 „napisz prompt audytu zespołu
specjalistów i wykonaj kod review end to end, następnie wykonaj poprawki zespołu
ekspertów"). Zakres: dostawy tej sesji V12K-083…090 (SPD/koordynacja izolacji,
NC RfG/OZE, OLTC/overlay SLD, kontrakty wynikowe, kreatory ui2).

## 0. Zasada audytu

Wielosoczewkowy przegląd (dyrektywa właściciela #5): każdy ekspert ocenia SWOJĄ
warstwę pod kątem realnej ścieżki użytkownika i kontraktu backendu — **zero
fabrykacji, zero fizyki w UI, FROZEN/determinizm nietknięte, dane z solvera**.
Znaleziska są kartami naprawczymi wykonywanymi OD RAZU (nie „na potem").

## 1. Skład zespołu i soczewki

| Ekspert | Soczewka | Pytania kontrolne dla dostaw sesji |
|---------|----------|-----------------------------------|
| **Projektant sieci** | End-to-end łańcuch danych | Czy każdy nowy element (SPD, flagi FRT, metryki OLTC) ma pełny łańcuch: kontrakt → backend → domena → API → UI → miejsce spływu? Czy nie ma wysp? |
| **Zwarciowiec / koordynacja izolacji** | IEC 60071, IEC 60909 | Czy most SPD (`build_v126_insulation_from_enm`) dobiera U_m/MCOV/U_res poprawnie? Czy sieć izolowana/skompensowana vs uziemiona mapuje się zgodnie z normą? Zero doboru „na oko". |
| **Zabezpieczenia / OZE** | NC RfG, PTPiREE, FRT | Czy flagi FRT (LVRT/HVRT) i wyprowadzenia PF/Q(U) są zgodne z NC RfG? Czy checker liczy z realnych danych modelu, bez fabrykacji zdolności? |
| **Rozdzielnie / pola** | field_spec, read-model, SLD | Czy ogranicznik trafia na właściwy kanał (field_spec) i czyta go read-model + most? Czy nie ma równoległego store'u? |
| **Katalogi / Reference Engine** | Katalog-first | Czy parametry pochodzą z katalogu (OGRANICZNIK_SN, mv_surge_arrester_catalog), a nie z payloadu UI? Czy walidacja typu jest twarda? |
| **Architekt wyników** | FROZEN, determinizm, resultset_v1 | Czy zmiany w resultset_v1 są addytywne (exclude_none, sygnatura stabilna dla modeli bez cechy)? Czy PowerFlowResult/SC FROZEN nietknięte? |
| **Architekt SLD** | v2/v3, overlay, tokeny | Czy render trafia w produkcyjną wersję SLD (v3)? Czy overlay nie modyfikuje modelu, tylko nakłada? Tokeny, nie hex? |
| **UX / IA** | Kreatory, stany zerowe | Czy kreatory mają uczciwe stany zerowe, jawny następny krok, PanelTeorii, selekcję po operacji? Czy kontrolka bez pokrycia backendu = phantom (zakaz)? |

## 2. Zakres code review (pliki sesji)

Backend: `solver_input/v126_contracts.py`, `enm/domain_operations_v2.py`,
`enm/domain_ops_models.py`, `application/field_read_model.py`,
`application/ncrfg_compliance/model_bridge.py`, `api/ncrfg_ptpiree_tests.py`,
`enm/canonical_analysis.py`, `domain/result_builder_v1.py`.
Frontend: `ui2/kreatory/ogranicznik/**`, `ui2/kreatory/zrodlo-oze/**`,
`ui/sld/v2/canvas/oltcGlyph.ts`, `ui/sld/v2/renderer/GpzApparatusSymbols.tsx`,
`ui/sld/v2/canvas/enmToSldAdapter.ts`, `ui/sld-overlay/{OltcOverlayAdapter,
RawToTypedOverlayAdapter}.ts`, `ui2/legacy/useLegacyOrchestrator.ts`,
`ui/context-menu/**`, `ui/network-build/operationContext.ts`,
`ui/workspace/surfaces/V126AcademicSurface.tsx`.

## 3. Kryteria odbioru

1. Zero fabrykacji (każda kontrolka → realne pole backendu; wynik liczbowy z solvera).
2. FROZEN Result API nietknięte; nowe pola addytywne (exclude_none); determinizm
   dla payloadów bez nowej cechy.
3. Zero fizyki w UI/overlay; tokeny semantyczne.
4. Katalog-first (parametry z katalogu, walidacja typu).
5. Uczciwe stany zerowe (brak danych → honest empty, nie atrapa).
6. Testy ćwiczą realną ścieżkę (Zero-Debt §5); guardy zielone.
7. Znaleziska naprawione od razu (nie „na potem").

## 4. Wynik audytu (wypełniane przez przegląd)

Znaleziska + dyspozycje w sekcji „Znaleziska" niżej; naprawy wykonane w tej samej
kolejce, potwierdzone testami + guardami.

### Znaleziska (code review end-to-end) — WYKONANE

| ID | Soczewka | Znalezisko | Dyspozycja | Status |
|----|----------|-----------|-----------|--------|
| **F1** | Architekt SLD | `OltcOverlayAdapter` emitował `analysis_type: 'PF'`, a produkcyjny payload overlay (`RawToTypedOverlayAdapter` przekazuje `analysis_type` backendu) używa `'LOAD_FLOW'` — niespójność między dwoma adapterami tej samej rodziny. | Ujednolicono do `'LOAD_FLOW'` (+ test). | ✅ NAPRAWIONE |
| **F2** | Architekt wyników | Metryki OLTC w resultset_v1 miały `format_hint="int"` — poza udokumentowanym słownikiem (`fixed0/fixed2/fixed4/kilo/percent`); frontendowy `formatMetric` wpadał w gałąź `String(value)` (nieudokumentowana ścieżka). | Zmieniono na `"fixed0"` (całkowite, obsługiwane przez formatter). | ✅ NAPRAWIONE |
| **F3** | Rozdzielnie | Podejrzenie leaku: czy `build_branch_results` emituje już `tap_position` (kolizja z whitelistą → metryki TAP dla nie-OLTC gałęzi)? | **WERYFIKACJA: brak kolizji** — `build_branch_results` nie emituje `tap_position`; iniekcja tap_* jest jedynym źródłem, tylko dla gałęzi w `oltc_control.final_positions`. Zakres poprawny. | ✅ POTWIERDZONE (bez zmian) |
| **F4** | Architekt SLD | Wizual OLTC (glif design-state V12K-086) jest w rendererze v2, a produkcja to v3 (compose własny). Glif nie renderuje się w produkcji. | Zapisane jako V12K-090; wizual OLTC → program SLD rework (v3 compose). Dane/logika gotowe do reużycia. Nie budować dalej na v2. | ✅ ZAPISANE (zadanie do SLD rework) |

### Werdykty zespołu (sign-off warstw bez zmian)

- **Zwarciowiec / koordynacja izolacji:** most SPD (`build_v126_insulation_from_enm`)
  IEC 60071-poprawny — MCOV/U_res/energia z katalogu po `catalog_ref`; `network_neutral`
  izolowana/skompensowana→"isolated", rezystor/bezpośrednie→"earthed" (efektywnie
  uziemiona → faza-ziemia). Brak karty → dobór wstępny (U_m z typoszeregu, mcov None →
  solver liczy). **Zgodne z normą, zero doboru „na oko". OK.**
- **Zabezpieczenia / OZE:** flagi FRT (LVRT/HVRT) jawne (deklaracja projektanta, nie
  z karty katalogowej — envelope Q nie niesie FRT); `has_pf_droop` z `frequency_droop`,
  `has_qu_curve` z `qu_slope`/tryb Q(U). Checker liczy z modelu (reuse pól, zero
  fabrykacji). **OK.**
- **Katalogi / Reference Engine:** `add_surge_arrester_sn` katalog-first (walidacja typu
  OGRANICZNIK_SN twarda, `spd.catalog_required`/`catalog_not_found`); parametry z
  `mv_surge_arrester_catalog`. **OK.**
- **Architekt wyników (FROZEN/determinizm):** surfacing tap_* addytywny — tylko dla
  transformatorów z regulacją (`exclude_none`), sygnatura stabilna dla modeli bez OLTC;
  schemat resultset_v1 bez zmian (code/format_hint wolne stringi); PowerFlowResult/SC
  FROZEN nietknięte. **OK** (po F2).
- **Rozdzielnie / pola:** ogranicznik na field_spec (jeden kanał), czytany przez read-model
  (`_build_primary_devices` → glif) i most G-STK-7 (kanał field_specs, parytet z
  primary_devices, wspólny dedup). Zero równoległego store'u. **OK.**
- **UX / IA:** kreator ogranicznika — uczciwy stan zerowy (brak pola/szyny → blokada),
  PanelTeorii IEC 60071 (must-have), sekcja downstream, selekcja pola po operacji;
  kreator OZE — przełączniki FRT tak/nie (false→undefined, zero fabrykacji). **OK.**
- **Projektant sieci (end-to-end):** łańcuchy SPD (klik→op→model→glif+izolacja), NC RfG
  (kreator→model→most→checker→API), OLTC-dane (solver→resultset→oba store'y overlay) —
  bez wysp na poziomie danych. Jedyna wyspa wizualna = glif OLTC w v2 (F4, do v3).

**Werdykt końcowy:** dostawy sesji V12K-083…090 przechodzą audyt. 2 znaleziska
(F1/F2) naprawione u źródła + testy; F3 potwierdzone bez zmian; F4 (wizual OLTC v3)
zapisane jako zadanie SLD rework. Regresja 73 (backend) + 235 (frontend) + 15 guardów
zielona; type-check/lint/mypy czyste; FROZEN/determinizm nietknięte.
