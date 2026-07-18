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
| `ui/network-build/forms/voltageDropValidator.ts` | ΔU = √3·I·L·(R·cosφ + X·sinφ) | walidacja formularza |
| `ui/network-build/station-wizard-v2/cableSelectionContract.ts` | `computeCableVoltageDrop` (ΔU) | `StationWizardStepContent.tsx` (LIVE) |
| `ui/network-build/station-wizard-v2/shortCircuitNetworkContract.ts` | Ik3 = c·U/(√3·Z_total) | kreator stacji |
| `ui/network-build/station-wizard-v2/transformerContract.ts` | przeliczenia √3 (transformator) | kreator stacji |
| `ui/network-build/station-wizard-v2/vtMultiWindingContract.ts` | przeliczenia √3 (przekładnik VT) | kreator stacji |
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
