# MV-DESIGN-PRO V12.6 - rozszerzenie akademicko-przemysłowe

Status: aktywny kontrakt rozszerzający V12.xx
Zakres: analizy specjalistyczne E-40..E-50, backend, API, UI, trace, proof, raportowalność i benchmarki
Tryb: addytywny, bez zmiany zamrożonych kontraktów `ShortCircuitResult` i `PowerFlowResult`

## 1. Cel

V12.6 podnosi system z poziomu projektowego V12.5 do warstwy akademicko-przemysłowej. Zakres obejmuje jakość energii, stabilność napięciową, niezawodność, uziemienia, koordynację izolacji, detekcję ziemnozwarciową, stany przejściowe, rozruch silników, hosting capacity, OPF/LCC, walidację benchmarkową oraz niepewność.

## 2. Zasady architektoniczne

- Źródłem danych jest committed ENM aktywnego przypadku.
- Warstwa UI nie liczy fizyki i nie wysyła lokalnego modelu sieci.
- Obliczenia V12.6 są w `backend/src/network_model/solvers/v126_academic.py`.
- Wejście solvera materializuje `backend/src/solver_input/v126_contracts.py`.
- Wynik ma osobny kontrakt `AcademicAnalysisResultV1`.
- Każdy wynik zawiera `white_box_trace`, `proof_ref`, status proof/report oraz deterministyczny hash.
- Artefakty proof/report buduje `backend/src/application/v126_artifacts.py` wyłącznie z frozen result i trace, bez ponownego liczenia fizyki.
- Frozen `ShortCircuitResult` i `PowerFlowResult` pozostają bez zmian.

## 3. Ekrany

| Kod | Nazwa | Typ analizy backend |
|---|---|---|
| E-40 | Jakość energii i harmoniczne | `power_quality_harmonics` |
| E-41 | Stabilność napięciowa i modalna | `voltage_stability` |
| E-42 | Niezawodność i kontyngencja | `reliability_contingency` |
| E-43 | Uziemienia i bezpieczeństwo | `earthing_safety` |
| E-44 | Koordynacja izolacji napięciowej | `insulation_coordination` |
| E-45 | Stany przejściowe i TRV | `transient_trv` |
| E-46 | Rozruch silników | `motor_starting` |
| E-47 | Hosting capacity OZE | `hosting_capacity` |
| E-48 | OPF i optymalizacja strat | `opf_loss_lcc` |
| E-49 | Walidacja benchmarkowa profesorska | `benchmark_validation` |
| E-50 | Niepewność i wrażliwość | `uncertainty_sensitivity` |

## 4. API

Aktywny tor V12.6:

- `POST /api/cases/{case_id}/runs/v126/{analysis_type}`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/trace`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/proof`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/report`
- `GET /api/catalog/v126/{namespace}`

Każdy endpoint ma wpis w `MACIERZ_KOMPATYBILNOSCI_API.md`.

## 5. Definicja ukonczenia

V12.6 jest domknięte, gdy:

- E-40..E-50 są zarejestrowane w `screenCanonRegistry`.
- Każdy typ analizy jest w `solver_capability_registry.py`.
- API odmawia uruchomienia bez committed ENM.
- Testy backend potwierdzają deterministyczny hash, komplet trace oraz deterministyczne artefakty proof/report.
- Frontend renderuje wspólny ekran V12.6 bez obliczeń po stronie klienta i pobiera result/proof/report z backendu.
- `verify:v12.6` uruchamia guardy kanonu, mojibake, testy V12.6 backend i testy rejestru UI.
