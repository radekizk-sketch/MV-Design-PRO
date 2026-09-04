# INDEX — Program „Engineering Digital Twin SN+nN" (2026-09)

> **Status od 2026-09-04 (kontrakt MAX PLATFORM):** materiał wejściowy i dowodowy programu konwergencji. Źródło kanoniczne architektury: `../architecture/PRODUCT_CAPABILITY_MODEL.md`, `../architecture/CANONICAL_DIGITAL_TWIN.md`, `../architecture/REVISION_SCENARIO_EXECUTION_MODEL.md`, `../architecture/COMPUTATIONAL_BOUNDARY.md`, `../architecture/FUTURE_CAPABILITY_REVIEW.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`. Przy rozbieżności obowiązuje dokument kanoniczny; w szczególności: nie powstaje nowa klasa `TwinModel` (Canonical Project Twin = rozwinięty ENM), `network_model` jest pochodnym IR, program nie zatrzymuje się po M0, lecz prowadzi konwergencję wycinkami CV-0…CV-6 z bramkami B-01/B-02 i procedurą kasacji.


**Status:** MATERIAŁ WEJŚCIOWY programu konwergencji (od 2026-09-04 obowiązuje kontrakt MAX PLATFORM; źródło kanoniczne: `../architecture/*.md`, `../reference-networks/REFERENCE_NETWORK_REGISTRY.md`, `../evidence/CONVERGENCE_EVIDENCE.md`). Werdykt właściciela z 2026-09-02 (architektura zatwierdzona warunkowo, korekty D-07/D-23/D-34/D-39, sześć wymagań §C) pozostaje w mocy i został naniesiony.
**Data:** 2026-09-02 · **Gałąź:** `claude/mv-design-pro-twin-audit-u4lhy0` · **HEAD audytu:** `a1ab2959`
**Mandat:** „MV-DESIGN-PRO FINAL MASTER ARCHITECTURE MANDATE" (§0–§186) właściciela — kolejność: FAZA A (audyt) → B (architektura) → C (workflow) → D (symulacja i optymalizacja) → E (prezentacja) → F (migracja) → STOP i pakiet §179.
**Relacja do kanonu:** dokumenty tego katalogu są **propozycją** docelowej architektury; do czasu decyzji właściciela obowiązuje hierarchia z `../INDEX.md` (KANON_V12_XX → SPEC_* → domain). Po zatwierdzeniu program zastępuje rodziny kanonów SLD i rozstrzyga konflikty wymienione w pakiecie (§178).

## Kolejność czytania (właściciel)

1. [OWNER_REVIEW_PACKAGE.md](./OWNER_REVIEW_PACKAGE.md) — pakiet §179 (20 pozycji), wymagania dodatkowe §177, konflikty §178, lista decyzji, STOP §180.
2. [MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md](./MV_DESIGN_PRO_DIGITAL_TWIN_AUDIT.md) — FAZA A: streszczenie, mapa systemu, ustalenia per obszar, rejestr legacy, rejestr ryzyk, macierz luk (§155), TOP 30 (§154).
3. [ENGINEERING_FRICTION_REGISTER.md](./ENGINEERING_FRICTION_REGISTER.md) — rejestr tarć EF-001…EF-060 (§5), ocena ról (§168), test łańcucha (§181).
4. [MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md](./MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md) — FAZA B (§156): ontologia, tożsamość, terminale, fazy, warstwy stanu, scenariusze, projekcje, walidacja, inwalidacja, mapowanie stanu obecnego.
5. [MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md](./MV_DESIGN_PRO_DATA_VERSIONING_PROVENANCE.md) — rewizje, warianty, provenance, świeżość, persystencja, archiwum (§179 poz. 13).
6. [MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md](./MV_DESIGN_PRO_TARGET_ENGINEERING_WORKFLOW.md) — FAZA C (§157): silnik pracy, definicja gotowego, 14 procesów, inspektor, role, propagacja, test §181.
7. [MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md](./MV_DESIGN_PRO_SIMULATION_ARCHITECTURE.md) — FAZA D cz. 1: migawka kanoniczna, assembler, solvery, orkiestrator, White Box, budżety.
8. [MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md](./MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md) — FAZA D cz. 2 (§158): ograniczenia, dobór z kandydatami, optymalizacja, wyjaśnialność, impact preview.
9. [MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md](./MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md) — zabezpieczenia jako część modelu, jedna fizyka, TCC jako projekcja, trace (§179 poz. 12).
10. [MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md](./MV_DESIGN_PRO_SLD_PRESENTATION_ARCHITECTURE.md) — FAZA E (§159): warstwy L1–L6, polityki CAD/SCADA/ENGINEERING, arkusz, determinizm.
11. [SLD_SYMBOL_SYSTEM_PLAN.md](./SLD_SYMBOL_SYSTEM_PLAN.md) — plan pakietu symboli R3 (§160) CURRENT → PROPOSED, procedura zatwierdzenia (B-02).
12. [MV_DESIGN_PRO_PERFORMANCE_PLAN.md](./MV_DESIGN_PRO_PERFORMANCE_PLAN.md) — pomiary bazowe, budżety S/M/L, plan per warstwa (§179 poz. 14).
13. [MV_DESIGN_PRO_MIGRATION_PLAN.md](./MV_DESIGN_PRO_MIGRATION_PLAN.md) — FAZA F (§161–§166): fazy M0–M7, wycinki (stara/nowa/most/testy/cutover/usunięcie), trzy wycinki pionowe, rejestr sieci G01–G17, bramki ≥ 9/10, KEEP/REPLACE/DELETE.

## ADR (PROPOSED; `../adr/`)

ADR-012 kanoniczny model twin · ADR-013 terminale i węzły łączności · ADR-014 łączność a topologia · ADR-015 model fazowy i uziemienia · ADR-016 scenariusz jako delta, warianty · ADR-017 stan efektywny · ADR-018 provenance, świeżość, hash kanoniczny · ADR-019 rewizja katalogu i provenance parametru · ADR-020 adaptery solverów i orkiestrator · ADR-021 rozszerzenia rdzeni (B-01) i solver nN 4-przewodowy · ADR-022 zabezpieczenia w modelu · ADR-023 warstwy prezentacji i polityki · ADR-024 projekcje SN/nN · ADR-025 walidacja/gotowość/ograniczenia · ADR-026 inwalidacja selektywna · ADR-027 punkt przyłączenia jako obiekt umowny · ADR-028 magazyn rewizji, rejestr biegów, persystencja.

## Zasady dla tego katalogu

- Każdy dokument ma `**Status:**` w nagłówku (PROPOZYCJA / WYNIK AUDYTU); żaden nie jest BINDING do czasu decyzji właściciela.
- Ścieżki w dokumentach są względne do `mv-design-pro/`; liczby są pomiarami na HEAD `a1ab2959` (metoda w audycie §9).
- Materiał wejściowy (prompty B-02, CAD nN, karty 2026-07/08) jest traktowany jako wymagania szczegółowe, nie nadrzędna architektura (dyrektywa właściciela przy mandacie).
