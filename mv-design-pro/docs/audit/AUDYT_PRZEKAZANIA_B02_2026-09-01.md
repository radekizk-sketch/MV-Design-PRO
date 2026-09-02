# AUDYT PRZEKAZANIA CODEXA (c8f253d3) I DOMKNIĘCIE ARCHITEKTURY LV DOMAIN PROJECTION PO B-02 — 2026-09-01

**Status:** raport nadzoru (Fable) — decyzje per element przekazania + dowody
techniczne. Werdykt wizualny B-02 NALEŻY DO WŁAŚCICIELA; ten dokument go nie
wystawia. Kanon wynikowy: `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`.

Gałąź: `codex/b02-lv-domain-projection-v1` (commity lokalne, BEZ push — zgodnie
z regułą zatrzymania „nie wykonuj push bez wyraźnej zgody").

## 1. Macierz audytu przekazania (obszar | stan zastany | zgodność z architekturą | decyzja | dowód)

| Obszar | Stan zastany (c8f253d3) | Zgodność | Decyzja | Dowód po domknięciu |
|---|---|---|---|---|
| Kontrakt `LvDomainProjectionV1` (backend) | jeden atomowy odczyt (graf, kotwice SN, wynik, SWZ); `swz_snapshot` z JEDNYM `transformer_ref`/`nn_bus_ref` i płaską listą odpływów; brak energizacji/wysp; brak tożsamości żądania w odpowiedzi | częściowa — atomowość OK, multi-TR błędne (odpływy sekcji 2 liczone od TR1 albo nieobecne) | POPRAWIĆ → wersja 2.0.0: `swz_snapshot.transformers[]` per transformator, `graph.buses[].energized/supply_refs/der_only`, `graph.islands[]`, `model_snapshot.{case_id,station_ref,scenario_id,run_snapshot_hash}`, 409 dla biegu z innego przypadku | `backend/tests/application/analyses/lv_domain/test_projection_v1.py` (w tym `TestAtomowoscProjekcji`, `TestSwzLiczonaOdWlasciwegoTransformatora`), `tests/api/test_lv_domain_api.py`; `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md` |
| Pętla zwarcia / SWZ per punkt (backend) | „pierwszy transformator stacji" w 5 miejscach 4 modułów (SWZ punktu, Ik1_min doboru aparatu, pakiet dowodowy obwodu, arkusz obwodów + wiersz wskazany, sekcja raportu) | niezgodna (klasa defektu, nie instancja) | POPRAWIĆ klasowo → `fault_loop.service.resolve_transformer_for_bus` (właściciel szyny po zamkniętych gałęziach, remis → mniejszy `ref_id`), `build_nn_circuit_sheet` po wszystkich TR, `_station_transformer` usunięty | `tests/application/analyses/test_transformator_dla_punktu_b02.py` (iloczyn: punkt wejścia × sprzęgło otwarte/zamknięte × wspólna szyna × odcięta podszyna) |
| Upstream Thevenin przy odciętej podszynie (backend) | szyna za otwartym rozłącznikiem czyniła Y-bus osobliwym GLOBALNIE → `upstream_network_singular` dla CAŁEJ stacji | niezgodna (defekt zastany, zmierzony) | POPRAWIĆ → `restrict_graph_to_island_of` (Z-bus na wyspie zasilania węzła HV, ta sama definicja wyspy co `NetworkGraph.find_islands`); punkt na odciętej podszynie = `missing_data: ["route"]` | `TestOdcietaPodszynaNieUniewaznaStacji`; testy `test_service.py::test_unreachable_point_is_honest` i `…_jest_uczciwy` przepisane do nowego kanonu z zachowaniem intencji |
| Energizacja i wyspy (backend) | brak | brak (wymagane przez architekturę: energized/de-energized islands, DER on nN) | DOPISAĆ → `lv_domain/energization.py` (czysta topologia stanów łączników, ta sama definicja źródła co E060) | `test_energization.py`, `TestEnergizacjaWProjekcji` |
| Projekcja SN — wnętrze nN na kanwie SN (frontend) | T5a: plakietka nN na L0, wnętrze rozdzielnicy nN (incomer, sekcje, sprzęgła, odpływy, agregaty, tabliczka TR) na L1/L2 w przestrzeni SN; brak jawnego portalu | niezgodna (mieszany LOD, druga geometria nN, kolizje T3) | PRZEPISAĆ → terminal nN (`#lv-bus`) + portal `lvPortal` NA OSI portu LV (w obrysie kolumny TR — zero dodatkowej szerokości), strzałka odbioru i rząd DER za portalem; wnętrze nN usunięte z projekcji SN; nameplate/plakietka/nnBoard usunięte | `compose/__tests__/station.lvPortal.test.ts`, `scene/__tests__/buildScene.lvPortal.test.ts`, `canvas/__tests__/lvDomainPortal.test.tsx`, `electrical/__tests__/sceneCompositionT1.test.ts`, `sceneConformance.test.ts`; e2e `lv-portal-screenshot.spec.ts` |
| Geometria portalu — pierwsza wersja (portal ZA blokiem kolumn) | — (własna iteracja) | niezgodna z pomiarem: każda stacja +48 j.św. ⇒ golden sieć 53 stacji łamała arkusz L0 z 2 na 3 wiersze, skala 0,0925→0,0673, WSZYSTKIE nazwy stacji porzucane | WYCOFAĆ → portal na osi; pomiar W1c: laterale ES/VT/SA pola TR w porcie LV ⇒ zacisk schodzi pod lateral i jego etykietę QE (`lvColumnBottoms`), measure rezerwuje ten pas | `canvas/__tests__/tozsamoscEtykiet.contract.test.ts` (0 porzuconych tożsamości L0), `menuBudowyNaKanwie`, `trafienieKanwy`, `deviceRefInspektora`, `buildScene.w1cMatrixGen.test.ts` (0 nachodzeń, 495/495 identyfikatorów); arkusz [6,6], szerokość 8296 (jak przed portalem) |
| Projekcja nN — LOD (frontend) | jeden poziom (L2) z trybami etykiet; brak własnego LOD 0/1/2 | częściowa | DOPISAĆ → rejestr `REJESTR_ELEMENTOW_KANWY` (warstwy tor/tożsamość/opis), LOD jako filtr prezentacji na JEDNEJ geometrii, paleta z motywu powłoki | `lv-domain/__tests__/lodProjekcjaNn.test.tsx`, `motywKanwyNn.test.tsx`, `visualGrammar.test.tsx`; e2e `lv-domain-screenshot.spec.ts` (fixtury × LOD × motyw) |
| Projekcja nN — spójność elektryczna po stronie klienta | `computeElectricalComponents` (własny BFS po grafie) | niezgodna (zakaz BFS/rekonstrukcji topologii po stronie klienta; druga definicja wyspy rozjeżdżająca się przy 2×TR + sprzęgło OTWARTE) | WYCOFAĆ → scena czyta `graph.islands` (`meta.islandRef`) i pola energizacji szyn; pola wymagane w typach (2.0.0) | `energizacjaWyspy.test.tsx` (każda szyna w dokładnie jednej wyspie; zero własnego BFS), `hardChecks.test.tsx` (sprzęgło: supply_refs backendu) |
| Klient projekcji (`projectionApi.ts`) | przypina wersję 1.0.0; nie sprawdza tożsamości odpowiedzi | częściowa | POPRAWIĆ → wersja 2.0.0, kształt (`transformers[]`, `islands`), `projectionIdentityMismatch` (case/stacja/scenariusz) | `types.ts::LV_DOMAIN_PROJECTION_CONTRACT_VERSION`, `projectionApi.ts` |
| Martwe legacy nN (frontend) | `StationInternalView`, `stationInternalViewData`, `NnCircuitResultsPanel`, `nnCircuitResults`, `nnSwzApi`, `useSwzOverlay` + testy — drugi tor danych nN obok projekcji | niezgodna (dwie ścieżki tej samej treści) | WYCOFAĆ (kasacja) + guard `scripts/lv_domain_projection_guard.py` R1–R5 w `p0-extended-guards.yml` | `backend/tests/ci/test_lv_domain_projection_guard.py`; guard czerwony na drzewie sprzed kasacji (pomiar), zielony po |
| Dokument kanoniczny | `docs/nn/KONCEPCJA_LOD_NN_2026-08.md` (T5a, mieszany LOD) | nieaktualny | ZASTĄPIĆ → `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`; koncepcja oznaczona jako zastąpiona; wpis w `docs/INDEX.md` | `scripts/docs_guard.py` OK |
| Zapadka mypy (`test_mypy_ratchet_guard.py`) | test degenerował się przy progu 0 (odchyłka ujemna = przypadek „równo") | defekt zastany | POPRAWIĆ (próg zastępczy w teście) | `tests/ci/test_mypy_ratchet_guard.py` |

## 2. Inwentarz klas (reguła KLASA, NIE INSTANCJA)

1. **„Transformator stacji" dla punktu nN** — 5 miejsc / 4 moduły: `swz/service.py`,
   `nn_device_selection.py`, `proof_engine/lv_circuit_verification_binding.py`,
   `nn_circuit_sheet.py` (×2), `api/analysis_run_exports.py`. Wszystkie → jedno
   źródło prawdy. Zero miejsc pozostawionych.
2. **Budowa Z-bus dla upstream** — 2 miejsca: `compute_upstream_hv_thevenin`
   (Z1) i `upstream_equivalent._hv_zero_sequence_ohm` (Z0). Oba → wyspa zasilania.
3. **Zwisy zacisku nN** — portal, strzałka odbioru, trunk DER, rząd DER:
   jedna prawda measure↔compose (`planLvTerminal`), jedna rezerwacja
   (`nnSideBelowBusHeight` = max), kolumna TR z lateralem rezerwuje pas
   lateral+QE (`stationBlockHeight` ↔ `lvColumnBottoms`).
4. **Źródła prawdy energizacji w projekcji nN** — jedno: backend (`energization.py`);
   klient bez BFS; typy wymagane.

## 3. Ograniczenia zarejestrowane (nie ukryte)

- **Solver zwarciowy na modelu z wyspami.** `solver_input/eligibility.py` odrzuca
  model niespójny (izolowane szyny) — bieg kanoniczny IEC 60909/rozpływu na
  stacji z odciętą podszyną jest NIEUPRAWNIONY (uczciwie, kodem gotowości), choć
  pętla zwarcia/SWZ/kotwica SN liczą się już na wyspie zasilania. Pełne
  wsparcie wysp w biegu kanonicznym = zmiana rdzenia solvera (B-01) — wymaga
  decyzji właściciela; do tego czasu stan jest jawny w kodach gotowości.
- **Zasilanie wielostronne** (sprzęgło zamknięte): impedancje równoległe NIE są
  składane w warstwie aplikacji (NOT-A-SOLVER); pętla liczona od transformatora
  własnej sekcji z jawnym `supply_assumption_pl` (założenie zachowawcze —
  mniejszy prąd zwarcia).
