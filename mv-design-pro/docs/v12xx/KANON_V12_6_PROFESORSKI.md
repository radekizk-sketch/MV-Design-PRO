# MV-DESIGN-PRO V12.6 - rozszerzenie akademicko-przemysłowe

Status: aktywny kontrakt rozszerzający V12.xx
Zakres: analizy specjalistyczne E-40..E-50, backend, API, UI, trace, proof, raportowalność i benchmarki
Tryb: addytywny, bez zmiany zamrożonych kontraktów `ShortCircuitResult` i `PowerFlowResult`

## 1. Cel

V12.6 podnosi system z poziomu projektowego V12.5 do warstwy akademicko-przemysłowej. Zakres obejmuje jakość energii, stabilność napięciową, niezawodność, uziemienia, koordynację izolacji, detekcję ziemnozwarciową, stany przejściowe, rozruch silników, hosting capacity, OPF/LCC, walidację benchmarkową oraz niepewność.

Dodatkowym torem wykonawczym V12.6 jest zakładka `E-35 / ncrfg-tests`, która realizuje pakiet symulacji zgodności NC RfG według procedury testowania PTPiREE dla katalogowych układów PV/BESS/FW.

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

> **Nota wykonawcza (2026-08-07, karta V126-WYGASZENIE — decyzja właściciela „wycofać
> OBA z ekranu”).** Zdolności powyżej pozostają w kanonie i w backendzie bez zmian;
> zmienia się wyłącznie ich obecność w torze projektanta:
>
> - **E-49 / `benchmark_validation`** — zdjęty z listy wyboru okna „Analizy akademickie"
>   i z nawigacji (`visibleInNavigation: false`), bo bada NARZĘDZIE, a nie projekt
>   użytkownika. Zdolność jest wykonywana w kontroli jakości
>   (`backend/tests/application/reference_networks/test_ieee_benchmark_wiring.py`:
>   IEEE 9/14/39 wobec referencji pandapower, solver produkcyjny). Kontrakt
>   `V126AnalysisType`, końcówki API i katalog `analysis-types` — nietknięte.
> - **E-41 / `voltage_stability`** — z prezentacji zdjęto margines obciążalności P–U
>   wraz z całą rodziną wielkości z tego samego przybliżenia ze sztywności węzła
>   (`voltage_stability_margin_percent`, tabela `pv_curves`). Na ekranie zostaje
>   wskaźnik L z kryterium `L < 0,5` oraz zapas mocy biernej (Q–U). Pola pozostają
>   w odpowiedzi solvera — kontrakty FROZEN; dług nazwany w rejestrze konfliktów.

> **Nota wykonawcza (2026-08-08, karta QU-FABRYKACJA) — E-41 wycofany w CAŁOŚCI.**
> Pomiar na sieciach odniesienia pokazał, że wielkości zostawione poprzednią notą
> stały na tym samym gruncie, co wycięta rodzina P–U: zapas mocy biernej liczony
> z krotności mocy czynnej (`0,15 · P` i `0,35 · P`) mimo dostępnego `bus.load_mvar`
> i BEZ jakiejkolwiek danej o zdolności wytwórczej mocy biernej (0 z 35 wytwórców
> niesie `GenLimits.q_min/max_mvar`), wskaźnik L z mnożnika `· 4` bez pokrycia
> w danych i w normie, a wspólne wejście wszystkich czterech wielkości — moc
> zwarciowa węzła — podstawiane z napięcia znamionowego dla **99,7 %** szyn
> (`fault_level_mva` podane dla 1 z 315). Solver (wersja 1.2) nie wyznacza już
> żadnej z nich: kontrakt odpowiedzi zostaje w komplecie, wartością jest `null`
> z powodem po polsku, blok wiarygodności melduje „dane niekompletne".
> `voltage_stability` przechodzi do rejestru rodzajów nieprezentowanych,
> E-41 dostaje `visibleInNavigation: false` i znika z mapy rodzajów ekranów
> trasowych; ekran ZOSTAJE w kanonie (ciągłość numeracji E-00…E-50).
> Powrót na tor projektanta wymaga POLICZENIA wielkości, nie przywrócenia tabel:
> krzywa P–U z rozpływu, wskaźnik L z macierzy F na Y-bus, moc zwarciowa węzła
> i granice mocy biernej doprowadzone przez most ENM→V12.6. Pełny inwentarz stałych
> całego solvera: `docs/audit/INWENTARZ_STALYCH_V126_2026-08-08.md`.
>
> Rejestr rodzajów nieprezentowanych (z powodem na każdy wpis):
> `frontend/src/ui2/wyniki/akademickie/nieprezentowane.ts`. Parytet
> „prezentowane + nieprezentowane = komplet kontraktu" pilnuje
> `backend/tests/ci/test_v126_rodzaje_parytet.py`.

## 4. API

Aktywny tor V12.6:

- `POST /api/cases/{case_id}/runs/v126/{analysis_type}`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/trace`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/proof`
- `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}/report`
- `GET /api/catalog/v126/{namespace}`
- `GET /api/ncrfg-tests/catalog`
- `POST /api/ncrfg-tests/run`

Każdy endpoint ma wpis w `MACIERZ_KOMPATYBILNOSCI_API.md`.

## 5. Definicja ukonczenia

V12.6 jest domknięte, gdy:

- E-40..E-50 są zarejestrowane w `screenCanonRegistry`.
- Każdy typ analizy jest w `solver_capability_registry.py`.
- API odmawia uruchomienia bez committed ENM.
- Testy backend potwierdzają deterministyczny hash, komplet trace oraz deterministyczne artefakty proof/report.
- Frontend renderuje wspólny ekran V12.6 bez obliczeń po stronie klienta i pobiera result/proof/report z backendu.
- `verify:v12.6` uruchamia guardy kanonu, mojibake, testy V12.6 backend i testy rejestru UI.
