# MV-DESIGN-PRO V12.6 - rozszerzenie akademicko-przemyslowe

Status: aktywny kontrakt rozszerzajacy V12.xx  
Zakres: analizy specjalistyczne E-40..E-50, backend, API, UI, trace, proof, raportowalnosc i benchmarki  
Tryb: addytywny, bez zmiany zamrozonych kontraktow `ShortCircuitResult` i `PowerFlowResult`

## 1. Cel

V12.6 podnosi system z poziomu projektowego V12.5 do warstwy akademicko-przemyslowej. Zakres obejmuje jakosc energii, stabilnosc napieciowa, niezawodnosc, uziemienia, koordynacje izolacji, detekcje ziemnozwarciowa, stany przejsciowe, rozruch silnikow, hosting capacity, OPF/LCC, walidacje benchmarkowa oraz niepewnosc.

## 2. Zasady architektoniczne

- Zrodlem danych jest committed ENM aktywnego przypadku.
- Warstwa UI nie liczy fizyki i nie wysyla lokalnego modelu sieci.
- Obliczenia V12.6 sa w `backend/src/network_model/solvers/v126_academic.py`.
- Wejscie solvera materializuje `backend/src/solver_input/v126_contracts.py`.
- Wynik ma osobny kontrakt `AcademicAnalysisResultV1`.
- Kazdy wynik zawiera `white_box_trace`, `proof_ref`, status proof/report oraz deterministyczny hash.
- Frozen `ShortCircuitResult` i `PowerFlowResult` pozostaja bez zmian.

## 3. Ekrany

| Kod | Nazwa | Typ analizy backend |
|---|---|---|
| E-40 | Jakosc energii i harmoniczne | `power_quality_harmonics` |
| E-41 | Stabilnosc napieciowa i modalna | `voltage_stability` |
| E-42 | Niezawodnosc i kontyngencja | `reliability_contingency` |
| E-43 | Uziemienia i bezpieczenstwo | `earthing_safety` |
| E-44 | Koordynacja izolacji napieciowej | `insulation_coordination` |
| E-45 | Stany przejsciowe i TRV | `transient_trv` |
| E-46 | Rozruch silnikow | `motor_starting` |
| E-47 | Hosting capacity OZE | `hosting_capacity` |
| E-48 | OPF i optymalizacja strat | `opf_loss_lcc` |
| E-49 | Walidacja benchmarkowa profesorska | `benchmark_validation` |
| E-50 | Niepewnosc i wrazliwosc | `uncertainty_sensitivity` |

## 4. API

Aktywny tor V12.6:

- `POST /api/cases/{case_id}/runs/v126/{analysis_type}`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/trace`
- `GET /api/catalog/v126/{namespace}`

Kazdy endpoint ma wpis w `MACIERZ_KOMPATYBILNOSCI_API.md`.

## 5. Definicja ukonczenia

V12.6 jest domkniete, gdy:

- E-40..E-50 sa zarejestrowane w `screenCanonRegistry`.
- Kazdy typ analizy jest w `solver_capability_registry.py`.
- API odmawia uruchomienia bez committed ENM.
- Testy backend potwierdzaja deterministyczny hash i komplet trace.
- Frontend renderuje wspolny ekran V12.6 bez obliczen po stronie klienta.
- `verify:v12.6` uruchamia guardy kanonu, mojibake, testy V12.6 backend i testy rejestru UI.
