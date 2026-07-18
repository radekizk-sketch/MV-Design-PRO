# DŁUG: FIZYKA SIECI W WARSTWIE PREZENTACJI (`ui/**`) — inwentarz 2026-07-18

**Status:** ŚLEDZONY DŁUG (Zero-Debt pkt 4 — zapisany z przyczyną i planem, nie
maskowany) · **Zgłoszenie:** wykonawca karty `U5_UI_HIGIENA_WARSTW.md`
(2026-07-18) · **Klasa:** naruszenie granicy warstw (CLAUDE.md: „NO physics
calculations to non-solver components"; „NO physics, NO model mutation" w
prezentacji; WHITE BOX tylko w solverach).

## 1. Przyczyna
Guard „zero fizyki w UI" ujawnił, że oprócz usuniętego `ui/sensitivity/`
(`sensitivityAnalyzer` — linearyzacja dU/dP,dU/dQ) w `frontend/src/ui/**`
istnieje wiele modułów liczących FIZYKĘ SIECI po stronie klienta. Brak
frontendowego guarda pozwolił temu narastać latami. Skutki: brak śladu
WHITE BOX, ryzyko rozjazdu z solverem, luka audytu/determinizmu.

## 2. Inwentarz naruszeń (plik → co liczy)
| Plik (`frontend/src/`) | Fizyka liczona w UI | Konsument LIVE |
|---|---|---|
| ~~`ui/network-build/forms/voltageDropValidator.ts`~~ | ~~ΔU~~ **ZRELOKOWANE (R1, 2026-07-18, commit `2057b47a`)** → `network_model/solvers/cable_voltage_drop.py` + `POST /api/solver/cable-voltage-drop-preview`; parytet 8 przypadków ≤1e-9 | walidacja formularza (woła API) |
| ~~`ui/network-build/station-wizard-v2/cableSelectionContract.ts`~~ | ~~ΔU + prąd znamionowy I=S/(√3·U)~~ **ZRELOKOWANE (R1)** → jw. + `POST /api/solver/cable-rated-current-preview` | kreator stacji (woła API) |
| ~~`ui/network-build/station-wizard-v2/shortCircuitNetworkContract.ts`~~ | ~~Ik3 = c·U/(√3·Z_total)~~ **USUNIĘTE (R2, 2026-07-18)** — martwa fizyka bez konsumentów LIVE (grep poza testami = 0); zdolność podglądu Ik3 dostarcza realny solver `POST /api/solver/grid-source-preview` (IEC 60909) | — (usunięte z testami) |
| ~~`ui/network-build/station-wizard-v2/transformerContract.ts`~~ | ~~przeliczenia √3 (transformator)~~ **ZRELOKOWANE (R2, 2026-07-18)** → `network_model/solvers/transformer_rated_currents.py` + `POST /api/solver/transformer-rated-currents-preview`; parytet I1/I2 ≤1e-6 | kreator stacji (woła API) |
| `ui/network-build/station-wizard-v2/vtMultiWindingContract.ts` | ~~przeliczenia √3 (przekładnik VT)~~ **ROZSTRZYGNIĘTE (R2, 2026-07-18)** — `100/√3 V` to stała katalogowa (znamionowe napięcie wtórne, IEC 61869-3), nie fizyka przepływu: zamieniona na literał `57.735026919`; guard zielony | kreator stacji |
| `ui/topology/earthingFaultCurrent.ts` | prąd doziemny PN-EN 50522 (Solid/Resistor/Petersen/IT, napięcie dotykowe) | UI topologii |
| `ui/protection-coordination/tccCurveGenerator.ts` | krzywe IEC 60255 (I/pickup) | koordynacja zabezpieczeń |
| `ui/protection-coordination/tmsCoordination.ts` | matematyka TMS IEC 60255 | koordynacja zabezpieczeń |

(Lista bazowa z rekonesansu wykonawcy; przed relokacją zweryfikować pełny zakres
grepem wzorców fizyki — może być więcej.)

## 3. Plan naprawy (epika „relokacja fizyki UI → backend")
Kierunek KANONICZNY (CLAUDE.md): fizyka wyłącznie w solverach/analizie z WHITE
BOX; UI konsumuje gotowe wartości z API.
1. Dla każdego modułu: przenieść obliczenie do warstwy solver/analysis backendu
   (lub — dla doboru katalogowego — do dedykowanego serwisu application), wystawić
   końcówkę zwracającą gotowe wielkości + ślad; UI woła końcówkę i tylko
   PREZENTUJE (formatowanie/zaokrąglanie/skalowanie osi).
2. Zachować parytet: te same wartości dla tego samego wejścia (test porównawczy
   przed/po), brak regresji kreatora/topologii/koordynacji.
3. Po relokacji: rozszerzyć zakres `ui_no_physics_guard.py` z `ui2/**` na `ui/**`
   (guard staje się bramką całej prezentacji).
4. Kolejność: PO epice wygaszania mostu wyników (nie mieszać z bieżącym
   refaktorem architektury UI; D5-analogia). Priorytet wewnętrzny: kreator stacji
   (`station-wizard-v2/*Contract`) jako pierwszy — najżywszy konsument i najwięcej
   fizyki.

## 4. Zabezpieczenie tymczasowe (wykonane 2026-07-18)
`ui_no_physics_guard.py` wprowadzony dla `ui2/**` (warstwa docelowa clean-room)
— chroni GREENFIELD przed nową fizyką w UI (klasa `sensitivityAnalyzer`).
`ui/**` NIE jest allowlistowane jako „to nie fizyka" (byłoby nieuczciwe) —
pozostaje w tym inwentarzu jako dług do relokacji; egzekwowany przy migracji
`ui/**` → `ui2` (fizyka trafia do backendu, guard łapie ją w ui2).
