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
| ~~`ui/topology/earthingFaultCurrent.ts`~~ | ~~prąd doziemny PN-EN 50522 (Solid/Resistor/Petersen/IT, napięcie dotykowe)~~ **USUNIĘTE (R3, 2026-07-18)** — martwa fizyka bez konsumentów LIVE (grep poza własnym testem = 0); zdolność w backendzie: pętla zwarcia IEC 60364 (`api/fault_loop.py`) + pack dowodowy Earthing/Ground Fault SN (`application/proof_engine/packs/earthing_ground_fault_sn.py`) | — (usunięte z testem) |
| ~~`ui/protection-coordination/tccCurveGenerator.ts`~~ | ~~krzywe IEC 60255 (I/pickup)~~ **USUNIĘTE (R3, 2026-07-18)** — martwa fizyka bez konsumentów LIVE (grep poza własnym testem = 0); zdolność: `api/protection_coordination.py` zwraca `TCCCurveResponse` (`GET /protection-coordination/{run_id}/tcc`, krzywe z `run_coordination_analysis`), rendering TCC w UI pozostaje prezentacją danych z API | — (usunięte z testem) |
| ~~`ui/protection-coordination/tmsCoordination.ts`~~ | ~~matematyka TMS IEC 60255 (werdykt selektywności par + rekomendacja korekty TMS)~~ **USUNIĘTE (R3, 2026-07-18)** — jedyny konsument `CoordinationHintCard.tsx` sam NIE ma konsumenta produkcyjnego (nie eksportowany w `index.ts`, nie użyty w `ProtectionCoordinationPage`, grep = tylko własny test) → całe poddrzewo `tmsCoordination → CoordinationHintCard` to martwa fizyka (sierota); usunięte razem z `CoordinationHintCard.tsx` + testami. Zdolność w backendzie: `api/protection_coordination.py` — kontrola selektywności par (`SelectivityCheck`: `verdict` PASS/MARGINAL/FAIL, `margin_s` = Δt/CTI rzeczywiste, `required_margin_s` = CTI_min, `notes_pl`) via `POST /protection-coordination/projects/{id}/run` + `GET /protection-coordination/{run_id}/checks/selectivity` | — (usunięte z `CoordinationHintCard` + testami) |
| ~~`ui/topology/earthingSystemHelper.ts`~~ | ~~prąd doziemny PN-EN 50522 (`faultCurrentA` = U_faz/R_n dla Resistor, U_faz/Z_0 dla Solid; U_faz = U_n/√3)~~ **USUNIĘTE (R3, 2026-07-18 — WYKRYTE mandatorycznym `scan_file` §0.5, spoza pierwotnej listy §2)** — martwa fizyka bez konsumentów produkcyjnych (grep `validateEarthingConfig`/`describeEarthingType`/`EarthingType` = tylko własny test; `EarthingSystemSelector.tsx` używa własnych typów `MvEarthingType`/`LvEarthingType`, NIE tego helpera). Ta sama klasa co usunięty `earthingFaultCurrent.ts`; zdolność w backendzie jw. (`api/fault_loop.py` + pack Earthing/Ground Fault SN). Usunięte z testem. Pozostawiono nietkniętym `EarthingSystemSelector.tsx` (czysta prezentacja, bez fizyki) | — (usunięte z testem) |

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

## 5. EPIKA DOMKNIĘTA (R1–R3) — 2026-07-18
Wszystkie wiersze inwentarza z §2 są ZRELOKOWANE / USUNIĘTE / ROZSTRZYGNIĘTE:
- **R1** (`2057b47a`): `voltageDropValidator.ts`, `cableSelectionContract.ts` →
  ZRELOKOWANE do solverów backendu (ΔU, prąd znamionowy) + końcówki podglądu;
  UI woła API i tylko prezentuje.
- **R2** (`d7928b8c`): `shortCircuitNetworkContract.ts` USUNIĘTE (martwa fizyka
  Ik3, zdolność w `grid-source-preview`); `transformerContract.ts` ZRELOKOWANE
  (√3 transformatora → solver); `vtMultiWindingContract.ts` ROZSTRZYGNIĘTE
  (`100/√3` = stała katalogowa IEC 61869-3, nie fizyka przepływu).
- **R3** (ta karta, 2026-07-18): `earthingFaultCurrent.ts`, `tccCurveGenerator.ts`,
  `tmsCoordination.ts` (+ martwy konsument `CoordinationHintCard.tsx`) USUNIĘTE —
  martwa fizyka bez konsumentów produkcyjnych; zdolności dostarcza backend
  (`api/fault_loop.py` + pack Earthing SN; `TCCCurveResponse` i `SelectivityCheck`
  w `api/protection_coordination.py`). Mandatoryczny `scan_file` (§0.5) ujawnił
  dodatkowo `earthingSystemHelper.ts` — martwą sierotę tej samej klasy fizyki
  (prąd doziemny PN-EN 50522), również USUNIĘTĄ w R3 (patrz §2). Inwentarz §2
  z góry zakładał „może być więcej" — wykryto i domknięto u źródła.

**Wynik:** w `frontend/src/ui/**` nie pozostała żadna z zewidencjonowanych ani
scanem wykrytych klas fizyki sieci. Prezentacja konsumuje gotowe wielkości z
API/solverów (WHITE BOX w backendzie). `scan_file` guarda po dotkniętych
katalogach (`ui/topology`, `ui/protection-coordination`) = 0 trafień.

**Zalecenie (osobna karta — NIE wykonywać w tej karcie):** rozszerzyć zakres
`scripts/ui_no_physics_guard.py` z `ui2/**` na całe `ui/**`, aby guard stał się
bramką całej warstwy prezentacji. Wymaga uprzedniego przemiarowania
false-positives (np. formatowanie/skalowanie osi, stałe katalogowe typu
`100/√3`), dlatego nie jest częścią R3 (nie rozszerzać bez pomiaru).

## 6. H-1 — rozszerzenie guarda na ui/** WYKONANE (2026-07-22)

Karta higieniczna H-1 wykonała zalecenie z §5. Pomiar mechanizmem guarda na
`frontend/src/ui/**` (bez zmiany wzorców detekcji): **22 surowe trafienia
regex / 18 unikalnych linii**, sklasyfikowane:
- **0 klasy (a)** — realna fizyka sieci. Epika R1–R3 rzeczywiście domknęła
  wszystkie takie przypadki; ponowny scan potwierdza zero pozostałości.
- **9 klasy (b)** — false-positive: string etykiety (`label_pl`, JSX `label`,
  szablon tekstowy) lub komentarz na końcu linii (poza zasięgiem
  `SKIP_LINE_PATTERNS`, który łapie tylko całe linie komentarza).
- **9 klasy (c)** — wyjątek uzasadniony: stałe katalogowe VT per IEC 61869-3
  w `protection-catalogs.ts` (`ratio_primary_kv`/`ratio_secondary_v` =
  `15|20|100 / √3`) oraz helper dopasowania katalogowego
  `selectVtForVoltage()` (dzieli napięcie znamionowe przez stały współczynnik
  IEC, bez udziału impedancji/prądu/rozpływu sieci) — ta sama klasa co
  precedens R2 (`vtMultiWindingContract.ts` `STANDARD_SECONDARY_VOLTAGE_V`,
  „100/√3 V = stała katalogowa IEC 61869-3, nie obliczenie fizyki").

Guard rozszerzony na `SCAN_DIRS = [ui, ui2]` z jawną, imienną allowlistą
`(plik, linia) → uzasadnienie` w `scripts/ui_no_physics_guard.py` — każdy z 18
wpisów niesie własne uzasadnienie klasy; brak wpisów maskujących klasę (a).
Guard zielony na HEAD (`python scripts/ui_no_physics_guard.py` → PASS, 0
naruszeń w `ui/**`+`ui2/**`). Testy: `backend/tests/ci/test_ui_no_physics_guard.py`
rozszerzony (10 testów) — zieloność na repo, pokrycie `SCAN_DIRS`, baseline
pomiaru (22 surowe trafienia), brak martwych wpisów allowlisty, allowlist
per-linia (nie cały plik — nowa fizyka gdzie indziej w tym samym pliku dalej
łapana), oraz czerwony wynik na wstrzykniętej próbce fizyki w `ui/**` (nie
tylko `ui2/**`).

**Wynik:** dług z §5 zamknięty. `ui_no_physics_guard.py` jest teraz bramką
całej warstwy prezentacji (`ui/**` + `ui2/**`).
