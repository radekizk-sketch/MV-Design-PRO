# PROJEKCJA SN / nN I PORTAL DOMENY nN — KANON V1 (2026-09-01)

**Status:** kanon BINDING warstwy prezentacji SLD (podporządkowany kanonowi
V12.xx i `docs/system/SPEC_*.md`). Zastępuje w całości
`docs/nn/KONCEPCJA_LOD_NN_2026-08.md` (drabina L0/L1/L2 z plakietką nN i
wnętrzem nN w przestrzeni SN — T5a) oraz każdą wcześniejszą regułę
„kompaktowania nN na kanwie SN". Werdykt wizualny B-02 należy do właściciela
(`CLAUDE.md`, Zasada nr 2) — ten dokument opisuje architekturę i dowody
techniczne, nie wystawia werdyktu.

## 1. Jedna sieć obliczeniowa, dwie projekcje prezentacyjne

1. **Model jest jeden.** Jedynym modelem jest ENM (`EnergyNetworkModel`).
   Sieć obliczeniowa obejmuje SN, transformatory i nN jako JEDEN graf
   (te same `ref_id`, ta sama `header.revision`, ten sam `compute_enm_hash`).
   Nie istnieje osobny model nN, kopia grafu ani rekonstrukcja topologii po
   stronie klienta.
2. **Projekcje są dwie.** Ten sam graf ma dwie projekcje prezentacyjne na
   dwóch osobnych kanwach:
   - **projekcja SN** (`frontend/src/ui/sld/v3/scene/buildScene.ts`,
     `compose/station.ts`): sieć SN, stacje, pola, transformatory, **terminal nN
     stacji** i **portal domeny nN**; wnętrze rozdzielnicy nN NIE jest tu
     rozwijane na żadnym poziomie szczegółowości;
   - **projekcja nN** (`frontend/src/ui/sld/v3/lv-domain/`): domena nN JEDNEJ
     stacji — kotwica SN każdego transformatora, transformatory, sekcje RGnN,
     sprzęgła, odpływy, podrozdzielnice, odbiory, DER, granice domen.
3. **Granica projekcji ≠ granica obliczeniowa.** Portal jest granicą
   PREZENTACJI. Fizyka pętli zwarcia, SWZ, rozpływu i kotwicy SN liczy się na
   jednym grafie SN–TR–nN po stronie backendu; projekcja nN dostaje wynik,
   nigdy nie liczy.

## 2. Projekcja SN — terminal nN i portal

Stacja z transformatorem/ami SN/nN kończy tor mocy na **terminalu nN**
(`#lv-bus`, wspólna szyna zacisków nN wszystkich transformatorów stacji —
`compose/station.ts`, plan `layout/measure.ts::planLvTerminal`). Na terminalu
są ZAWSZE widoczne, na każdym LOD projekcji SN (1 i 2; na LOD 0 stacja jest
blokiem zwiniętym, wejście dwuklikiem):

| Element | Identyfikator sceny | Rola |
|---|---|---|
| zejście z portu nN transformatora | `#lv-drop-N` | droga prądu TR → terminal |
| terminal nN | `#lv-bus` (`kind: 'bus'`) | wspólny zacisk nN; mostek wyników do szyny nN |
| zejście do portalu | `#lv-portal-drop` (`kind: 'lv'`) | jawne wejście do projekcji nN |
| portal | symbol `lvPortal` (32×24, glif „nN") | klik → otwarcie projekcji nN tej stacji |
| strzałka odbioru zagregowanego | `loadArrow` (`#lv-load-drop`) | odbiory nN stacji NIE znikają z projekcji SN |
| rząd DER strony nN | `#der-row-trunk`, `#der-row-bus` + symbole źródeł | źródła nN NIE znikają z projekcji SN |

Geometria zacisku (`layout/measure.ts::planLvTerminal`, jedna prawda
measure↔compose, pin `layout/__tests__/blokPusty.test.ts` §4): portal stoi
NA OSI rdzenia zacisku (między skrajnymi portami LV; dla 1×TR pod portem LV)
i mieści się w obrysie kolumny TR — stacja nie rośnie o portal (pomiar
2026-09-01: portal doklejony za blokiem łamał arkusz L0 golden sieci 53
stacji z 2 na 3 wiersze i porzucał wszystkie nazwy stacji). Strzałka odbioru
stoi ZA portalem, pion trunku DER ZA strzałką, rząd DER flush-right za blokiem
kolumn. Zacisk schodzi pod najniższy z: portów LV oraz odgałęzień bocznych
(ES/VT/SA) pola TR zakotwiczonych w porcie LV wraz z ich etykietami QE
(`compose/station.ts::lvColumnBottoms`; measure rezerwuje ten pas w
`stationBlockHeight`). Wszystkie punkty na siatce.

Czego projekcja SN NIE rysuje (świadomie, na żadnym LOD): pola zasilającego
rozdzielnicy nN, sekcji RGnN, sprzęgieł nN, odpływów nN, agregatów odpływów,
tabliczki znamionowej TR jako tekstu wnętrza nN, plakietki nN (L0). Ich
jedynym domem jest projekcja nN.

Wejście do projekcji nN: klik w symbol `lvPortal` (`elementKind === 'lvPortal'`,
`meta.lvPortalStationRef`) na LOD 1/2; dwuklik w blok stacji na LOD 0
(`canvas/SldCanvasV3Workspace.tsx`). Portal ma klasę trafień `portal-nn` bez
menu kontekstowego (`canvas/canvasMenuSubject.ts`) i tooltip
`LV_PORTAL_TITLE_TEXT`.

Piny (testy): `compose/__tests__/station.lvPortal.test.ts`,
`scene/__tests__/buildScene.lvPortal.test.ts`,
`canvas/__tests__/lvDomainPortal.test.tsx`,
`electrical/__tests__/sceneCompositionT1.test.ts`,
`electrical/__tests__/sceneConformance.test.ts`, e2e
`frontend/e2e/lv-portal-screenshot.spec.ts`.

## 3. Projekcja nN — jeden kontrakt, atomowy odczyt

Jedynym źródłem danych projekcji nN jest
`GET /api/cases/{case_id}/enm/lv-domain/{station_ref}/projection/v1`
(`backend/src/application/analyses/lv_domain/projection_v1.py`), kontrakt
`LvDomainProjectionV1`, `contract_version = 2.0.0`. Jedna odpowiedź niesie
ATOMOWO, z JEDNEGO obiektu ENM pobranego raz:

| Składowa | Pole | Treść |
|---|---|---|
| tożsamość żądania | `model_snapshot.{case_id, station_ref, scenario_id}` | klient porównuje z tym, o co prosił |
| tożsamość modelu | `model_snapshot.{revision, model_hash, operating_state_id, run_snapshot_hash}` | odcisk modelu i stanu łączeniowego; odcisk modelu zapisany przy biegu |
| geometria (dane) | `graph` (`LvDomainGraphView`) | szyny (z `energized`/`supply_refs`/`der_only`), `islands[]`, gałęzie, transformatory, generatory, odbiory, podrozdzielnice, `boundary_links` |
| kotwice SN | `upstream_equivalents[]` | `UpstreamEquivalentSnapshot` KAŻDEGO transformatora stacji (Uth/Sk″/Ik″/Z1/Z0) |
| wynik | `result_snapshot` | status `FRESH`/`OUTDATED`/`NONE` + `reason_pl`, nakładka zamrożonego ResultSet v1 zawężona do domeny, profil napięć |
| pętle zwarcia i SWZ | `swz_snapshot.transformers[]` | per transformator: `transformer_ref`, `nn_bus_ref`, `status`, `missing_data`, `feeders[]` (punkty pętli, najgorszy punkt, `supply`, `supply_assumption_pl`, werdykt SWZ) |
| odcisk projekcji | `projection_hash` | deterministyczny |

Zasady:

- **Zero fizyki w projekcji.** Renderer nie liczy energizacji, wysp,
  impedancji, werdyktów. Energizacja i wyspy pochodzą z
  `lv_domain/energization.py` (czysta topologia stanów łączników, ta sama
  definicja źródła energizacji co reguła E060 walidatora). Składowe
  elektryczne w scenie nN pochodzą z `graph.islands` (zakaz własnego BFS po
  stronie klienta).
- **Per transformator.** Pętla zwarcia, SWZ i kotwica SN liczą się od
  transformatora ZASILAJĄCEGO dany punkt (`fault_loop/service.py::
  resolve_transformer_for_bus`, właściciel szyny po zamkniętych gałęziach,
  remis → mniejszy `ref_id`). Odpływ osiągalny z ≥2 transformatorów (sprzęgło
  zamknięte) ma `supply = "wielostronne"` i jawne założenie zachowawcze
  (`supply_assumption_pl`); składanie impedancji równoległych w warstwie
  aplikacji jest zakazane (NOT-A-SOLVER).
- **Odcięta podszyna nie unieważnia stacji.** Z-bus upstream Thevenina
  liczy się na wyspie zasilania węzła HV (`restrict_graph_to_island_of`);
  punkt na odciętej podszynie melduje `missing_data: ["route"]`, reszta
  stacji liczy się normalnie.
- **Tożsamość biegu.** `run_id` spoza przypadku lub niezakończony → 409;
  nieznany → 404. Klient odrzuca odpowiedź z inną wersją kontraktu lub
  tożsamością żądania (`lv-domain/projectionApi.ts`).

Piny (testy): `backend/tests/application/analyses/lv_domain/
test_projection_v1.py` (w tym `TestAtomowoscProjekcji`), `test_energization.py`,
`fault_loop/test_service.py::TestStacjaWielotransformatorowa`,
`tests/application/analyses/test_transformator_dla_punktu_b02.py` (klasa
„transformator dla punktu" × sprzęgło × wspólna szyna × odcięta podszyna),
`tests/api/test_lv_domain_api.py`.

## 4. LOD projekcji nN — jedna geometria, trzy poziomy

`composeLvDomainScene` liczy scenę RAZ, bez parametru LOD. LOD jest wyłącznie
filtrem prezentacji w `LvDomainView` i ma JEDNO źródło klasyfikacji:
`lv-domain/visualGrammar.ts::REJESTR_ELEMENTOW_KANWY` (warstwy `tor` /
`tozsamosc` / `opis`, `widocznyNaLod`). Renderer nie porównuje `lod` punktowo.

Zakaz bezwzględny, na każdym poziomie: nie znika droga prądu, transformator,
aparat z glifem stanu OPEN/CLOSED, punkt normalnie otwarty, źródło (TR,
kotwica SN, DER), odbiór, granica domeny ani stan zasilania (bez napięcia /
wyspa DER).

| Poziom | Widoczne | Znika |
|---|---|---|
| L2 pełny | wszystko: symbole, etykiety tożsamości, tabliczka TR, Sk″/Ik″ kotwicy, parametry, plakietki wyników | — |
| L1 sieć | pełny tor + etykiety tożsamości (sekcje, aparaty, DER, odbiory, granice) + plakietki wyników | opisy drugorzędne (tabliczka TR, parametry, napięcia zacisków, słowny stan łącznika, nazwy portów) |
| L0 przegląd | pełny tor uproszczony: TR, sekcje, sprzęgła ze stanem, każdy odpływ do punktu końcowego; nazwa sekcji + liczba odpływów; kropka werdyktu wyniku | etykiety aparatów/DER/odbiorów, liczby na plakietkach |

Paleta rysunku nN idzie z motywu powłoki (`paletaNnDlaMotywu`); tokeny o tej
samej semantyce co kanwa SN (tło, tusz, brak napięcia, werdykt trzytonowy)
są brane ze wspólnej palety. Wzór kreski „bez napięcia" jest inny niż wzór
„aparat otwarty" — to dwa różne fakty ruchowe.

Piny: `lv-domain/__tests__/lodProjekcjaNn.test.tsx` (identyczność
prymitywów toru na 0/1/2, rejestr ↔ renderer), `energizacjaWyspy.test.tsx`,
`motywKanwyNn.test.tsx`, `visualGrammar.test.tsx`; e2e
`frontend/e2e/lv-domain-screenshot.spec.ts` (fixtury × LOD × motyw).

## 5. Przypadki obsługiwane (i gdzie są przypięte)

| Przypadek | Backend | Projekcja SN | Projekcja nN |
|---|---|---|---|
| 1×TR | `test_service.py::test_stacja_jednotransformatorowa_ma_niezmieniony_ksztalt` | jeden `#lv-drop-1`, portal | jedna kotwica, jedna sekcja |
| 2×TR, sprzęgło OTWARTE | `TestStacjaWielotransformatorowa`, `test_transformator_dla_punktu_b02.py` | dwa zejścia na wspólny terminal, jeden portal | dwie sekcje, sprzęgło z glifem OTWARTE, SWZ każdej sekcji od własnego TR |
| 2×TR, sprzęgło ZAMKNIĘTE | jw. (`supply = wielostronne`) | jw. | jw., założenie zachowawcze jawne w panelu odpływu |
| 2×TR na wspólnej szynie | `test_wspolna_szyna_nn_przypisuje_odplywy_deterministycznie` | jw. | remis właściciela → mniejszy `ref_id`, brak dublowania odpływów |
| DER po stronie nN | `station.der.*` (compose/station.ts), `test_energization.py` | rząd DER na terminalu | symbol DER na sekcji, `der_only` gdy wyspa |
| podszyna odcięta (bez napięcia) | `test_energization.py`, `TestOdcietaPodszynaNieUniewaznaStacji` | — | kreska „bez napięcia", znacznik, wyspa w `islands[]` |
| wyspa DER | `test_pv_na_wyspie…`, `TestEnergizacjaWProjekcji` | — | znacznik „wyspa DER" |
| granica do innej stacji | `graph_view.py` (`boundary_links`) | — | terminal granicy + strzałka z nazwą stacji |
| wynik FRESH/OUTDATED/NONE | `result_freshness`, `test_projection_v1.py` | — | znacznik świeżości na każdym LOD; nakładki tylko dla FRESH |

## 6. Zakazy (egzekwowane)

- Zakaz odtwarzania wnętrza nN na kanwie SN, drugiej geometrii per LOD,
  własnego BFS/energizacji po stronie klienta, osobnych propsów zamiast
  kontraktu, fabrykowania wyników, interpretowania surowego solvera w React.
- Guard `scripts/lv_domain_projection_guard.py` (R1–R5, w
  `p0-extended-guards.yml`): brak importów skasowanego legacy
  (`StationInternalView`, `NnCircuitResultsPanel`, `nnCircuitResults`,
  `nnSwzApi`, `useSwzOverlay`), jedno źródło danych portalu, zero fizyki w
  `lv-domain/**`. Meta-test: `backend/tests/ci/test_lv_domain_projection_guard.py`.
- Zakaz pisania „B-02 PASS" przez wykonawcę — werdykt wizualny wystawia
  właściciel na podstawie zrzutów `docs/audit/visual/lv_portal_sn_*.png`
  (projekcja SN) i `docs/audit/visual/lv_domain_*_lod*_*.png` (projekcja nN).
