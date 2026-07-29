# Documentation Index

**Status:** AKTYWNY (kanon V12.xx)
**Aktualizacja:** 2026-05-13 (po cleanupie + rozstrzygnięciu V12K-011)

> **Cel:** Doprowadzić MV-DESIGN-PRO do systemu klasy przemysłowej SCADA/CAD (ETAP/DIgSILENT/ABB grade) — **nie atrapy z klocków**.

> **Hierarchia kanonu** (po rozstrzygnięciu konfliktu V12K-001 / V12K-011 w 2026-05-13):
> 1. `docs/v12xx/KANON_V12_XX.md` — kanon kierunkowy V12.xx (binding)
> 2. `docs/system/SPEC_*.md` — wiążące specyfikacje systemowe
> 3. `docs/domain/*.md`, `docs/sld/SLD_CONTRACT_FLOW_V1.md`, `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` — aktywne kontrakty
> 4. `mv-design-pro/SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `AGENTS.md`, `PLANS.md` — executive overview
> 5. `docs/spec/SPEC_CHAPTER_*.md` (18 rozdziałów) — **ARCHIWALNE** (V11 reference; nie aktywny kanon)
> 6. `docs/audit/archive/` + `docs/audit/historical_execplans/` — archiwum

---

## 🚀 START — Od czego zaczyna nowy developer

**Krok 1: Zrozumieć kontekst (15 min)**
1. [../SYSTEM_SPEC.md](../SYSTEM_SPEC.md) — wykonawcza specyfikacja systemu (1 strona)
2. [v12xx/KANON_V12_XX.md](./v12xx/KANON_V12_XX.md) — kanon V12.xx (binding, frozen 2026-04-24)
3. [../PLANS.md](../PLANS.md) — aktualny status faz i prace bieżące

**Krok 2: Zrozumieć cel (10 min)**
4. [sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md](./sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md) — docelowy SLD klasy przemysłowej
5. [sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md](./sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md) — flow inżyniera 14-krokowy

**Krok 3: Zrozumieć stan obecny (15 min)**
6. [audit/IMPLEMENTATION_GAP_ANALYSIS.md](./audit/IMPLEMENTATION_GAP_ANALYSIS.md) — co działa, co nie, co brakuje
7. [audit/SLD_VISUAL_QUALITY_AUDIT.md](./audit/SLD_VISUAL_QUALITY_AUDIT.md) — dlaczego SLD wygląda jak atrapa i co naprawić
8. [audit/ENGINEER_WORKFLOW_AUDIT.md](./audit/ENGINEER_WORKFLOW_AUDIT.md) — luki w flow inżyniera

**Krok 4: Zrozumieć plan (10 min)**
9. [plan/PLAN_E2E_INDUSTRIAL_2026-05.md](./plan/PLAN_E2E_INDUSTRIAL_2026-05.md) — plan E2E całego systemu (6 sprintów)
10. [sld/SLD_IMPLEMENTATION_ROADMAP.md](./sld/SLD_IMPLEMENTATION_ROADMAP.md) — roadmap SLD reworku (F1–F5)
11. [sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md](./sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md) — kryteria akceptacji (DoD)

**Krok 5: Praca z dokumentacją**
12. [audit/DOCUMENTATION_CLEANUP_AUDIT.md](./audit/DOCUMENTATION_CLEANUP_AUDIT.md) — co jest aktualne, co SUPERSEDED, co ARCHIWALNE
13. [audit/DOC_INVENTORY_2026-05.md](./audit/DOC_INVENTORY_2026-05.md) — pełna inwentaryzacja 415 plików

---

## Active 2026-05 cleanup deliverables (KANONICZNE)

### Audyty
- [audit/DOCUMENTATION_CLEANUP_AUDIT.md](./audit/DOCUMENTATION_CLEANUP_AUDIT.md) — audyt sprzątania dokumentacji (klasyfikacja + migracje)
- [audit/SLD_VISUAL_QUALITY_AUDIT.md](./audit/SLD_VISUAL_QUALITY_AUDIT.md) — audyt jakości wizualnej SLD (5/10 → cel 9/10)
- [audit/ENGINEER_WORKFLOW_AUDIT.md](./audit/ENGINEER_WORKFLOW_AUDIT.md) — audyt flow inżyniera (14 kroków vs aktualny stan)
- [audit/IMPLEMENTATION_GAP_ANALYSIS.md](./audit/IMPLEMENTATION_GAP_ANALYSIS.md) — luki implementacyjne per obszar
- [audit/DOC_INVENTORY_2026-05.md](./audit/DOC_INVENTORY_2026-05.md) — inwentaryzacja 415 plików
- [audit/AUDYT_BRAKI_2026-05.md](./audit/AUDYT_BRAKI_2026-05.md) — audyt braków, błędów, atrap (8 obszarów A–H)

### SLD industrial
- [sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md](./sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md) — opis docelowego SLD
- [sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md](./sld/SLD_VISUAL_ACCEPTANCE_CRITERIA.md) — kryteria akceptacji wizualnej
- [sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md](./sld/SLD_ENGINEER_WORKFLOW_END_TO_END.md) — flow inżyniera 14-krokowy
- [sld/SLD_IMPLEMENTATION_ROADMAP.md](./sld/SLD_IMPLEMENTATION_ROADMAP.md) — roadmap implementacji
- [sld/SLD_INDUSTRIAL_SPEC_v1.md](./sld/SLD_INDUSTRIAL_SPEC_v1.md) — specyfikacja techniczna (komplementarna)

### Plany
- [plan/PLAN_E2E_INDUSTRIAL_2026-05.md](./plan/PLAN_E2E_INDUSTRIAL_2026-05.md) — plan E2E klasy przemysłowej
- [plan/PLAN_SLD_REWORK.md](./plan/PLAN_SLD_REWORK.md) — fazowany plan reworku SLD (F1–F5)
- [plan/PLAN_PRZEBUDOWY_10X_2026-07.md](./plan/PLAN_PRZEBUDOWY_10X_2026-07.md) — program inżynieryjny 10x (F0–F4)

### Program UI/UX 2026-07 (AKTYWNY)
- [uiux/PROGRAM_UIUX_2026-07.md](./uiux/PROGRAM_UIUX_2026-07.md) — program przebudowy UI/UX do klasy ETAP/PowerFactory (fazy U0–U5; clean-room UI)
- [uiux/INWENTARZ_FUNKCJI_2026-07.md](./uiux/INWENTARZ_FUNKCJI_2026-07.md) — WIĄŻĄCY inwentarz funkcji obliczeniowych + macierz pokrycia UI
- [uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md](./uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md) — gramatyka interakcji całej aplikacji + rejestr okien (każde okno od nowa)
- [uiux/SPEC_KREATORY_2026-07.md](./uiux/SPEC_KREATORY_2026-07.md) — kreatory: zero pustych pól, podpowiedzi inżynierskie, gotowe przykłady
- [uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md](./uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md) — powiązanie warstw: propagacja model→schemat→gotowość→wyniki→raporty, wspólna selekcja, świeżość rewizji
- [uiux/SPEC_UKLAD_PANELI_2026-07.md](./uiux/SPEC_UKLAD_PANELI_2026-07.md) — układ paneli lewy/środkowy/prawy + tryby zaawansowania (Podstawowy/Rozszerzony/Ekspercki)
- [uiux/SZABLONY_STACJI_2026-07.md](./uiux/SZABLONY_STACJI_2026-07.md) — taksonomia szablonów stacji (role A–E, cel ≥ 80) + przeglądarka w kreatorze
- [uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md](./uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md) — rozszerzenia P1–P22 dla inżyniera (zatwierdzone zasadą „na max")
- [uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md](./uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md) — audyt rady specjalistów: rozbudowa każdego okna + delta rejestru
- [uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md](./uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md) — karta styku z wątkiem SLD (tokeny motywów)
- [uiux/PROMPT_ZARZADCA_FABLE_UIUX.md](./uiux/PROMPT_ZARZADCA_FABLE_UIUX.md) — prompt zarządcy programu (orkiestracja wykonawców)

> Rozgraniczenie wątków: rework SLD (PLAN_SLD_REWORK) biegnie w osobnej sesji; Program UI/UX
> nie modyfikuje `ui/sld*`/`engine/sld-layout` — styk wyłącznie przez karty koordynacyjne.

---

## Active Canon
- [v12xx/KANON_V12_XX.md](./v12xx/KANON_V12_XX.md) - aktywne prawo produktu V12.xx
- [v12xx/KANON_V12_6_PROFESORSKI.md](./v12xx/KANON_V12_6_PROFESORSKI.md) - rozszerzenie akademicko-przemyslowe V12.6 E-40..E-50
- [v12xx/RAPORT_M0_INWENTARYZACJA.md](./v12xx/RAPORT_M0_INWENTARYZACJA.md) - inwentaryzacja startowa M0 V12.xx
- [v12xx/BACKLOG_WDROZENIOWY_V12_XX.md](./v12xx/BACKLOG_WDROZENIOWY_V12_XX.md) - backlog wdrozeniowy M0-M4
- [INDEX_KANONICZNY.md](./INDEX_KANONICZNY.md) - indeks wiążących dokumentów V12.5
- [../SYSTEM_SPEC.md](../SYSTEM_SPEC.md) - wykonawcza specyfikacja systemu
- [../ARCHITECTURE.md](../ARCHITECTURE.md) - architektura referencyjna
- [../CANONICAL_COMPLIANCE.md](../CANONICAL_COMPLIANCE.md) - checklista zgodności
- [../PLANS.md](../PLANS.md) - aktywny plan wykonawczy
- [01-Core.md](./01-Core.md) - kanon domeny i kontraktów rdzenia
- [04-Application.md](./04-Application.md) - aktywna architektura aplikacji
- [domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md](./domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md) - kontrakty operacji domenowych
- [analysis/URUCHAMIANIE_ANALIZ_I_GOTOWOSC.md](./analysis/URUCHAMIANIE_ANALIZ_I_GOTOWOSC.md) - kontekst analityczny i gotowość
- [analysis/NC_RFG_PTPiREE_TESTY_KANON.md](./analysis/NC_RFG_PTPiREE_TESTY_KANON.md) - testy NC RfG / PTPiREE dla DER
- [analysis/NC_RFG_FLOW_TESTING_PROMPT.md](./analysis/NC_RFG_FLOW_TESTING_PROMPT.md) - prompt pętli testowania flow NC RfG
- [analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md](./analysis/SENSITIVITY_ANALYSIS_CANONICAL_PLUS.md) - analiza wrażliwości P25
- [analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md](./analysis/P26_AUTO_RECOMMENDATIONS_CANONICAL_PLUS.md) - rekomendacje P26
- [analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md](./analysis/P27_SCENARIO_COMPARISON_CANONICAL_PLUS.md) - porównanie scenariuszy P27
- [analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md](./analysis/P33_LF_SENSITIVITY_CANONICAL_KILLER.md) - wrażliwość napięć P33
- [architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md](./architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md) - workflow Study/Scenario/Run
- [study/WARIANTY_URUCHOMIENIA_POROWNANIA.md](./study/WARIANTY_URUCHOMIENIA_POROWNANIA.md) - warianty, runy i porównania
- [audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md](./audit/REPO_HYGIENE_PO_FAZIE_KATALOG_FIRST.md) - aktywna higiena repo po fazie katalog-first
- [ui/UI_CANONICAL_PARITY_MATRIX.md](./ui/UI_CANONICAL_PARITY_MATRIX.md) - aktywna macierz UI
- [ui/ui_canonical_parity.md](./ui/ui_canonical_parity.md) - aktywne wytyczne parity UI
- [ui/KANON_KREATOR_SN_NN_NA_ZYWO.md](./ui/KANON_KREATOR_SN_NN_NA_ZYWO.md) - kanon budowy sieci
- [tests/GOLDEN_NETWORKS_CANONICAL.md](./tests/GOLDEN_NETWORKS_CANONICAL.md) - goldeny i deterministyczność

## Active Rules
- Aktywny root dokumentacji to `mv-design-pro/docs`.
- `docs/spec/` nie jest już aktywnym źródłem prawdy. To materiał [historyczne](./spec/).
- `docs/archive/` jest wyłącznie archiwum [historyczne](./archive/).
- Żaden aktywny generator raportu, test, skrypt ani indeks dokumentacji nie może pobierać treści z `docs/archive/` jako kanonu.
- Link do materiału historycznego musi być jawnie oznaczony `[historyczne]`.
- Każdy aktualny dokument ma w nagłówku **Status** (AKTUALNY / SUPERSEDED / ARCHIWALNY / BLOCKER).
- Każdy SUPERSEDED ma wskazanie aktualnego następcy.

## Active Areas
- [v12xx/](./v12xx/) - nadrzedny kanon V12.xx, rejestry i macierze wykonawcze
- [analysis/](./analysis/) - aktywne kontrakty analiz
- [architecture/](./architecture/) - aktywne workflow i mapy architektury wykonawczej
- [audit/](./audit/) - aktywne audyty (DOC_INVENTORY_2026-05, AUDYT_BRAKI_2026-05, DOCUMENTATION_CLEANUP, SLD_VISUAL_QUALITY, ENGINEER_WORKFLOW, IMPLEMENTATION_GAP_ANALYSIS, AUDYT_KATALOG_FIRST_END_TO_END)
- [plan/](./plan/) - aktywne plany (PLAN_E2E_INDUSTRIAL_2026-05, PLAN_SLD_REWORK)
- [domain/](./domain/) - aktywne kontrakty domenowe
- [proof_engine/](./proof_engine/) - aktywny White Box
- [qa/](./qa/) - aktywna macierz jakości i bram testowych
- [sld/](./sld/) - aktywne kontrakty i geometria SLD + 5 nowych SLD industrial docs (2026-05)
- [study/](./study/) - aktywne workflow wariantów i uruchomień
- [system/](./system/) - wiążące specyfikacje systemowe V12.5
- [ui/](./ui/) - aktywne kontrakty UI
- [export/](./export/) - aktywne kontrakty eksportu
- [tests/](./tests/) - aktywne kryteria testowe i goldeny

## Historical
- [spec/](./spec/) [historyczne] - 18 rozdziałów V11, wszystkie z disclaimer "Historical note (V12.5)"
- [audit/historical_execplans/](./audit/historical_execplans/) [historyczne]
- [audit/archive/2026-05/](./audit/archive/2026-05/) [archiwum] - 35+ zamkniętych audytów + planów M0 + snapshotów E2E + weryfikacji
- [archive/README.md](./archive/README.md) [historyczne]
- [archive/](./archive/) [historyczne]
