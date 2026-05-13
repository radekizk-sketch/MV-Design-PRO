# Audyt rebuild-u Stacja SN/nN + DER PV/BESS/FW (brief 2)

**Status:** living document, faza wdrożenia PR-1..PR-16
**Wersja:** v0.1
**Branch:** `claude/sld-architecture-redesign-ufa8Q`
**Data:** 2026-05-05
**Powiązany:** [`SLD_REBUILD_CAD_SCADA_AUDIT.md`](SLD_REBUILD_CAD_SCADA_AUDIT.md), plan w `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md`

---

## 1. Obecny stan (briefa §0 pkt 6)

Repo MV-DESIGN-PRO ma:

- **ENM:** `Substation` z `station_type` (`gpz/mv_lv/switching/customer/inline/branch/terminal/sectional`), `gpz_sections`, `Bay` z `bay_role` (`IN/OUT/TR/COUPLER/FEEDER/MEASUREMENT/OZE`), `BayPrimaryDevice` z `kind` 14 typów + `placement` (`UPSTREAM/MIDSTREAM/DOWNSTREAM/OFF_PATH/GROUND_BRANCH`), `Generator.connection_variant` 5 wariantów, `BranchPointSN`, `Corridor` (radial/ring/mixed), `Junction`, `Measurement` (CT/VT), `ProtectionAssignment`.
- **Solvery istniejące:** IEC 60909 SC, NR/GS/FD power flow.
- **Solvery brakujące:** stabilność RMS, FRT/HVRT RMS, NC RfG compliance testbench, wind aggregation.
- **SLD frontend:** SLDView 78 KB, 5-fazowy pipeline layoutu (Sugiyama + A* + ELK), 7 starych rendererów, Tailwind scada palette.
- **Inspector:** `inspectorTabRegistry` z 9 zakładkami, brak `topologia` i `obliczenia-readiness`.
- **Builder:** `networkBuildStore.BuildPhase` 5 faz (NO_SOURCE..READY), `ContextMenuRegistry` 62 + 14 akcji.
- **Konfigurator stacji:** brak (tylko podstawowe formularze).
- **Konfigurator DER:** brak (PV/BESS/FW jako prymitywy bez kart).

## 2. Obecne braki

1. Stacja jest renderowana jako ikona, **nie jako obiekt zagnieżdżony** z wewnętrznym SLD.
2. **Brak portów technicznych** — endpointy kabli czepiają się ikony stacji, nie pola.
3. **Brak ConnectionNode** — brak jawnego modelu punktu przyłączenia.
4. **Brak `BayTemplate` / `StationTemplate`** w katalogu — szablony ad-hoc.
5. PV/FV/BESS/FW renderowane jako prymitywy, **bez kart FRT/HVRT/NC RfG**.
6. **Brak readiness service** dla 9 typów obliczeń (stabilność / FRT/HVRT / NC RfG nie istnieją w repo, raporty mogą być fałszowane).
7. **Brak ValidationProblemService** unifikującego błędy/ostrzeżenia/info.
8. **Brak ReportReadinessAdapter** — raporty mogą być generowane przy brakach danych.
9. **Brak multi-voltage nN** — sztywne 0,4 kV w wielu miejscach.
10. **Brak profili NC RfG** dla operatorów (PSE/Energa/Tauron/Enea/PGE).
11. **Brak katalogu turbin wiatrowych**.

## 3. Znalezione modele (reużycie)

| Model w ENM | Reużycie w rebuild-zie |
|---|---|
| `Substation.gpz_sections: list[GPZSection]` | szkielet sekcji rozdzielni SN GPZ (PR-3 + PR-5) |
| `Substation.station_type` | mapowanie na typ topologiczny stacji (PR-6) |
| `Bay.bay_role` | wzorzec dla `PortKind` (PR-3) |
| `BayPrimaryDevice.placement` | wskazówka pozycjonowania w polu (PR-5 BayRenderer) |
| `Generator.connection_variant` | reużywany w `DerAttachment` (PR-5) |
| `BranchPointSN.ports: BranchPointSNPorts` | wzorzec dla nowego `Port` (PR-3) |
| `Corridor` | szkielet `LineRun` (PR-3 + PR-5) |
| `Junction.junction_type` | NOP detection (PR-5) |

## 4. Znalezione solvery

| Solver | Lokalizacja | Stan | PR |
|---|---|---|---|
| IEC 60909 SC | `network_model/solvers/short_circuit_iec60909.py` | gotowy, nietykalny | reuse |
| Newton-Raphson PF | `network_model/solvers/power_flow_newton.py` | gotowy, nietykalny | reuse |
| Gauss-Seidel PF | `network_model/solvers/power_flow_gauss_seidel.py` | gotowy, nietykalny | reuse |
| Fast-Decoupled PF | `network_model/solvers/power_flow_fast_decoupled.py` | gotowy, nietykalny | reuse |
| Wind aggregation | brak | doprojektowanie | PR-11 |
| Stability RMS dynamic | brak | doprojektowanie | PR-15 |
| FRT/HVRT RMS time-domain | brak | doprojektowanie | PR-16 |
| NC RfG compliance testbench | brak | doprojektowanie | PR-16 |

## 5. Znalezione ekrany (E-10 ÷ E-28)

| Ekran briefa | Stan w repo | PR realizujący |
|---|---|---|
| E-10 Źródło zasilania GPZ | częściowy (`source-connection`) | PR-7 (zakładka inspectora) + PR-13 (workspace surface) |
| E-13 Konfigurator stacji | brak | PR-8a (10 kart) |
| E-14 Pole SN | częściowy (`network-build/cards`) | PR-8b (8 sekcji) |
| E-15 Transformator SN/nN | brak | PR-8a karta 5 |
| E-17 PV/FV | brak | PR-9 (7 kart) |
| E-18 BESS | brak | PR-10 (7 kart) |
| E-19 ZKSN | brak | PR-13 (workspace surface) |
| E-20 Słup | brak | PR-13 (workspace surface) |
| E-21 Odgałęzienie | brak | PR-13 (workspace surface) |
| E-22 Pierścień/NOP | brak | PR-13 (workspace surface) |
| E-23 Obciążenie | częściowy | PR-7 + PR-8a karta 7 |
| E-24 Edycja parametrów | częściowy (`SegmentInspectorPanel`) | PR-7 (Dane elektryczne tab) |
| E-28 Zabezpieczenia pola | istnieje (`protection-engine-v1`) | PR-7 (Zabezpieczenia tab) — adapter |

## 6. Docelowa architektura

13 modułów (per brief 2 §3): `SldWorkspace`, `SldViewportController`, `SldLayerManager`, `SldSymbolLibrary`, `SldTopologyAdapter`, `SldLayoutEngine`, `SldStationEngine`, `StationConfigurator`, `DerConfigurator`, `CalculationReadinessService`, `ValidationProblemService`, `SldCommandService`, `ReportReadinessAdapter`.

Pełen schemat warstw w `mv-design-pro/docs/sld/SLD_CAD_SCADA_REBUILD.md §4` i `SLD_PORTS_AND_ENDPOINTS.md`.

## 7. Zakres wdrożenia

17 PR-ów (PR-0 ÷ PR-16). Pełna lista i scope per PR — patrz plan
`/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md`.

PR-0 (DONE), PR-1 (this commit), PR-2..PR-16 (kolejne commity tej samej sesji aż do 100% wykonania zgodnie z twardym rozkazem egzekucji).

## 8. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| ENM Port dla istniejących projektów | Automigracja on-load + offline script (PR-3) |
| Stara fizyka wyników nie zmieniona | Frozen Result API + AGENTS §2 invariant |
| 5-tygodniowy okres wdrożenia | Feature flag + canary (PR-5a → PR-5b → PR-5c) |
| Solver fizyki RMS dynamiczny | Nowy moduł, nie zmienia istniejących wyników (PR-15 + PR-16) |
| Liczba PR-ów (17) i scope (~191 osobodni) | Małe, mergeable PR-y z explicit gate-ami |

## 9. Testy

Pełna lista 9 grup testów (A-I) z briefa 1 §17 + grupy testów dedykowane briefowi 2 (stacja A, konfigurator stacji B, transformator C, PV D, BESS E, FW F, panele G, LOD H, język UI I, visual regression J) — szczegóły w planie głównym sekcja „9 grup testów obowiązkowych".

## 10. Komendy walidacji

```bash
# Frontend
cd mv-design-pro/frontend
npm run lint
npm run type-check
npm run test:ci
npm run test:golden
npm run guard:codenames
npm run guard:ui-terminology

# Backend
cd mv-design-pro/backend
poetry run black src tests
poetry run ruff check src tests
poetry run mypy src
poetry run pytest -q

# Repo guards
cd mv-design-pro
python scripts/no_codenames_guard.py
python scripts/ui_terminology_guard.py
python scripts/sld_determinism_guards.py
python scripts/forbidden_ui_terms_guard.py
python scripts/dialog_completeness_guard.py
python scripts/local_truth_guard.py
python scripts/docs_guard.py
python scripts/import_graph_guard.py    # blokuje powrót importów do wygaszonych modułów
python scripts/repo_hygiene_guard.py    # blokuje TODO/FIXME w nowym kodzie
python scripts/vulture_guard.py         # dead code detection
```

---

**Koniec audit doc Stacja+DER PR-1.**
