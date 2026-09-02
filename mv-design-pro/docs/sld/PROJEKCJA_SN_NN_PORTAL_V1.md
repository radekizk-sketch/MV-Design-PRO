# PROJEKCJA SN / nN I PORTAL DOMENY nN — KANON V1 (2026-09-01, rewizja 3.0.0 z 2026-09-02; warstwa symboli CAD R2 z 2026-09-02)

**Status:** kanon BINDING warstwy prezentacji SLD (podporządkowany kanonowi
V12.xx i `docs/system/SPEC_*.md`). Zastępuje w całości
`docs/nn/KONCEPCJA_LOD_NN_2026-08.md` (drabina L0/L1/L2 z plakietką nN i
wnętrzem nN w przestrzeni SN — T5a) oraz każdą wcześniejszą regułę
„kompaktowania nN na kanwie SN". Werdykt wizualny B-02 należy do właściciela
(`CLAUDE.md`, Zasada nr 2) — ten dokument opisuje architekturę i dowody
techniczne, nie wystawia werdyktu.

Rewizja 2026-09-02 (mandat „profesjonalizacja SLD nN do poziomu ABB /
PowerFactory"): kontrakt projekcji nN **3.0.0** — stany zacisków i odcinków,
role urządzeń, sekcje, wyspy z zdolnością źródeł, odniesieniem N/PE i
bilansem, tożsamość systemu SN, tory zasilania, audyt topologii; rejestr
symboli, gramatyka wizualna i 18 scenariuszy jako jedno źródło prawdy.

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
     stacji — kotwica systemu SN (jedna na tożsamość zasilania),
     transformatory z jawnymi zaciskami SN/nN, wyłączniki główne, sekcje RGnN,
     sprzęgła, odpływy (aparat → kabel → zacisk → odbiór/DER/podrozdzielnica),
     przekładniki, zabezpieczenia, granice domen.
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

## 3. Projekcja nN — jeden kontrakt 3.0.0, atomowy odczyt

Jedynym źródłem danych projekcji nN jest
`GET /api/cases/{case_id}/enm/lv-domain/{station_ref}/projection/v1`
(`backend/src/application/analyses/lv_domain/projection_v1.py`), kontrakt
`LvDomainProjectionV1`, `contract_version = 3.0.0`. Jedna odpowiedź niesie
ATOMOWO, z JEDNEGO obiektu ENM pobranego raz:

| Składowa | Pole | Treść |
|---|---|---|
| tożsamość żądania | `model_snapshot.{case_id, station_ref, scenario_id}` | klient porównuje z tym, o co prosił |
| tożsamość modelu | `model_snapshot.{revision, model_hash, operating_state_id, run_snapshot_hash}` | odcisk modelu i stanu łączeniowego; odcisk modelu zapisany przy biegu |
| szyny (zaciski) | `graph.buses[]` | `energization_state` (ENERGIZED / DEENERGIZED / UNKNOWN / CONFLICT / MULTISOURCE), `is_energized`, `supply_refs`, `island_ref`, `grid_energized`, `is_board`, `hops_from_root` |
| urządzenia | `graph.devices[]` | typ ENM, `device_kind` (klasa funkcjonalna wyrobu z katalogu: WYLACZNIK / ROZLACZNIK / ROZLACZNIK_BEZPIECZNIKOWY / ODLACZNIK…, `null` = katalog nie klasyfikuje — pole addytywne R2), `designation_class` (QF/QS/FU/QBC/W), `device_role` (incomer/feeder/coupler/boundary/internal), `feeder_kind`, `device_state`, oba zaciski (`terminal_a/b`), `board_bus_ref`, `parent/child_bus_ref`, `transformer_ref` |
| odcinki | `graph.segments[]` | `connectivity_state` (CLOSED/OPEN), stan KAŻDEGO zacisku (`from_terminal`, `to_terminal`), `energization_state` odcinka (przewód za otwartym łącznikiem = DEENERGIZED), `source_ids`, `island_ref`, `voltage_level_id` |
| sekcje | `graph.sections[]` | `tier` (main/sub), `order`, `coupler_refs`, `incomer_refs`, `transformer_refs` |
| wyspy §14–§16 | `graph.islands[]` | `is_islanded`, `energization_state`, `energizing_source_ids`, `grid_source_refs`, `has_grid_forming_source`, `frequency_reference_source_id`, `neutral_reference {system, source_ref, status, status_pl, swz_evaluable}`, `power_balance {p_generation_mw, p_load_mw, state, basis_pl}`, `island_operation_allowed` (`null` = nieoceniona), `upstream_system_ids`, `validation_messages[]` |
| źródła rozproszone | `graph.generators[]` | `island_capability` (GRID_FOLLOWING / GRID_FORMING / DUAL_MODE / UNKNOWN), `capability_source_pl`, `island_operation_capable` |
| tory zasilania | `graph.supply_paths[]` | `bus_ref → source_ref → branch_refs[]` (podświetlenie pełnego toru w UI, zero BFS po stronie klienta) |
| pomiary i zabezpieczenia | `graph.measurements[]`, `graph.protection_assignments[]` | CT/VT na zacisku (`ratio_primary/secondary` + tabliczka addytywna R2: `accuracy_class`, `burden_va`, `ct_cores`, `ct_arrangement` — `null`, gdy model nie niesie), przekaźnik przypisany do aparatu z `function_codes[]` i `ct_ref` |
| tożsamość zasilania SN | `graph.transformers[].upstream_system_id`, `upstream_equivalents[].{equivalent_id, upstream_node_id, upstream_system_id, upstream_source_ids, upstream_source_names}` | transformatory o wspólnym zasilaniu dzielą `equivalent_id`; niezależne systemy mają różne `upstream_system_id` |
| kotwice SN | `upstream_equivalents[]` | `UpstreamEquivalentSnapshot` KAŻDEGO transformatora stacji (Uth/Sk″/Ik″/Z1/Z0 albo `brak danych` z `missing_data`) |
| wynik | `result_snapshot` | status `FRESH`/`OUTDATED`/`NONE` + `reason_pl`, nakładka zamrożonego ResultSet v1 zawężona do domeny, profil napięć kluczowany **referencją ENM szyny** (`rows[].bus_id`, `solver_bus_id` dodatkowo) |
| pętle zwarcia i SWZ | `swz_snapshot.transformers[]` | per transformator: `transformer_ref`, `nn_bus_ref`, `status`, `missing_data`, `feeders[]` (punkty pętli, najgorszy punkt, `supply`, `supply_assumption_pl`, werdykt SWZ); liczone Z MODELU przy budowie projekcji (IEC 60364-4-41), niezależnie od przebiegu |
| podstawa energizacji §17 | `graph.measured_voltage_states`, `graph.energization_basis_pl` | ENM nie niesie pomiarów obecności napięcia — stany są TOPOLOGICZNE („NIEZASILONA (WG AKTUALNEJ TOPOLOGII)"), a mapa pomiarów jest pusta i jawna |
| audyt topologii §34 | `validation_messages[]` | `NN-AUD-01…18` z `severity` (BLOCKER/IMPORTANT/INFO), `message_pl`, `element_refs`; NN-AUD-18 (INFO, R2 §6) = sprzęgło bez klasy funkcjonalnej aparatu — na schemacie symbol ogólny łącznika, nie dorysowany wyłącznik |
| odcisk projekcji | `projection_hash` | deterministyczny |

Reguły energizacji (`lv_domain/energization.py`, jedna definicja dla szyn,
odcinków i wysp):

- łączność ≠ stan łącznika ≠ energizacja: otwarty aparat ma DWA zaciski,
  każdy w stanie swojej wyspy (obie strony mogą być zasilone z RÓŻNYCH
  wysp — scenariusz 11); przewód za otwartym łącznikiem jest bez napięcia;
- wyspa z siecią: ≥2 niezależne systemy SN spięte (albo źródło wyłącznie
  tworzące napięcie równolegle z siecią) → `CONFLICT`; szyna z >1 źródłem
  zasilania → `MULTISOURCE`;
- wyspa bez sieci: źródło tworzące napięcie lub dwutrybowe → `ENERGIZED`
  (≥2 → `MULTISOURCE`), zdolność nieznana → `UNKNOWN`, tylko źródła
  podążające za siecią → `DEENERGIZED`;
- zdolność źródła: `meta.island_capability` → `meta.control_mode` →
  `materialized_params.control_mode` → klasa maszyny (synchroniczna →
  DUAL_MODE; SCIG/DFIG → GRID_FOLLOWING) → UNKNOWN; brak nowego pola
  Pydantic (odcisk `compute_input_hash` istniejących modeli nietknięty);
- transformator bez źródła SN (zasilanie wsteczne) nie jest źródłem
  (NN-AUD-15).

Pozostałe zasady:

- **Zero fizyki w projekcji.** Renderer nie liczy energizacji, wysp,
  impedancji, werdyktów — czyta `buses[]`, `segments[]`, `islands[]`,
  `supply_paths[]`, `validation_messages[]`. Guard R4 + pin „zero kolejki /
  odwiedzonych / pętli while" w `composeLvDomainScene.test.ts`.
- **Per transformator.** Pętla zwarcia, SWZ i kotwica SN liczą się od
  transformatora ZASILAJĄCEGO dany punkt (`fault_loop/service.py::
  resolve_transformer_for_bus`, właściciel szyny po zamkniętych gałęziach,
  remis → mniejszy `ref_id`). Odpływ osiągalny z ≥2 transformatorów (sprzęgło
  zamknięte) ma `supply = "wielostronne"` i jawne założenie zachowawcze
  (`supply_assumption_pl`); składanie impedancji równoległych w warstwie
  aplikacji jest zakazane (NOT-A-SOLVER). Wyłącznik główny (incomer) NIE jest
  odpływem — odpływy zaczynają się na szynie rozdzielnicy
  (`fault_loop/route.py::incomer_branch_refs`).
- **Odcięta podszyna nie unieważnia stacji.** Z-bus upstream Thevenina
  liczy się na wyspie zasilania węzła HV (`restrict_graph_to_island_of`);
  punkt na odciętej podszynie melduje `missing_data: ["route"]`, reszta
  stacji liczy się normalnie.
- **Tożsamość biegu.** `run_id` spoza przypadku lub niezakończony → 409;
  nieznany → 404. Klient odrzuca odpowiedź z inną wersją kontraktu, brakiem
  stanów szyn / komunikatów audytu lub inną tożsamością żądania
  (`lv-domain/projectionApi.ts`).
- **Ograniczenie zarejestrowane (nie ukryte):** dwa NIEZALEŻNE źródła SN w
  jednym modelu to dwa węzły SLACK — zamrożony rdzeń
  (`network_model/core/graph.py::_validate_single_slack`, B-01) odrzuca taki
  graf, więc kotwice SN meldują `brak danych: upstream_network_topology_invalid`;
  tożsamość systemów (`upstream_system_id`, nazwy źródeł) pochodzi z grafu
  ENM i jest rysowana mimo to (scenariusze 05/06).

Piny (testy): `backend/tests/application/analyses/lv_domain/
test_projection_v1.py` (w tym `TestAtomowoscProjekcji`, profil napięć po
referencji ENM), `test_energization.py`, `test_audit.py`,
`test_route_incomer.py`, `test_scenariusze_nn.py` (JSON w repo == odpowiedź
backendu), `fault_loop/test_service.py::TestStacjaWielotransformatorowa`,
`tests/application/analyses/test_transformator_dla_punktu_b02.py`,
`tests/api/test_lv_domain_api.py`.

## 4. Scenariusze 01–18 — jedno źródło prawdy energizacji

`backend/tests/application/analyses/lv_domain/scenariusze_nn.py` buduje 18
modeli ENM (1×TR; 2×TR sprzęgło otwarte/zamknięte; wspólne zasilanie SN +
granica domeny; niezależne systemy SN; konflikt; wyspa podążająca/tworząca/
nieznana; sekcja niezasilona; energizacja dwustronna; pełny tor DER; odbiory
przez pola; podrozdzielnice zagnieżdżone; 12 odpływów; wynik nieaktualny;
wyniki zwarciowe; SWZ mieszane). `backend/scripts/eksport_fixtur_projekcji_nn.py`
zapisuje odpowiedź backendu (znormalizowane `run_id`/znaczniki czasu, odcisk
przeliczony tą samą funkcją) do
`frontend/src/ui/sld/v3/lv-domain/fixtures/generated/<slug>.json`;
`test_scenariusze_nn.py` pilnuje równości JSON ↔ backend; testy vitest czytają
WYŁĄCZNIE te pliki (`fixtures/scenariusze.ts`). Frontend nie ma fixtur z
ręcznie wpisaną energizacją.

## 5. Rejestr symboli, gramatyka wizualna, LOD

- **Biblioteka symboli CAD** (`cad/cadSymbolRegistry.ts` +
  `cad/CadSymbol.tsx`, R2 §19/§20): 18 symboli schematu z LINII / ŁUKÓW /
  OKRĘGÓW / ŚCIEŻEK (zero ikon aplikacji, bitmap, czcionek ikon), każdy z
  odniesieniem IEC 60617 (identyfikator S00xxx), nazwą polską, gabarytem,
  zaciskami na siatce, kotwicami i `verificationStatus` (DRAFT /
  ENGINEERING_REVIEWED / NORMATIVE_VERIFIED — dziś 0 × NORMATIVE_VERIFIED).
  Stan łączeniowy WYŁĄCZNIE z geometrii noża na przegubie (0° / +30° /
  +15° + kreska przerywana); kwalifikatory funkcji IEC: „×" wyłącznika,
  poprzeczka odłącznika, okrąg rozłącznika, wkładka jako nóż. Rejestr
  normatywny: `docs/sld/SLD_SYMBOL_NORMATIVE_REGISTRY.md`; pakiet
  referencyjny i przegląd: `docs/sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md`.
- **Odwzorowanie modelu na symbole** (`lv-domain/symbolRegistry.ts`, R2
  §4–§12): typ gałęzi ENM rozstrzyga rodzinę (`breaker → cad.wylacznik/QF`,
  `disconnector → cad.odlacznik/QS`, `switch → cad.rozlacznik/QS`,
  `fuse → cad.bezpiecznik/FU`, `cable`/`line_overhead → przewód/W`), a
  `device_kind` z katalogu doprecyzowuje (`switch + ROZLACZNIK_BEZPIECZNIKOWY
  → cad.rozlacznikBezpiecznikowy`; `bus_coupler + WYLACZNIK/ROZLACZNIK/
  ODLACZNIK/ROZLACZNIK_BEZPIECZNIKOWY → symbol REALNEGO aparatu sprzęgła`,
  `bus_coupler bez klasy → cad.lacznik` + NN-AUD-18). DER wg `gen_type` (PV
  i magazyn = złożenia źródło + przekształtnik jednego elementu ENM; maszyny
  = G~), pomiar wg `measurement_type` (CT w torze ≠ VT na odgałęzieniu),
  zabezpieczenie = prostokąt ze znakami funkcji IEC (I>, I>>, I0>, U<, f<,
  df/dt, Δφ) wewnątrz i numerami ANSI w panelu; zacisk (okrąg pusty) ≠ węzeł
  (kropka) wg stopnia. Nazwy polskie (WYŁĄCZNIK, ROZŁĄCZNIK, ODŁĄCZNIK,
  BEZPIECZNIK, ŁĄCZNIK SZYN…) z rejestru CAD; QF/QS/FU/QBC/CT/VT są
  identyfikatorami. Pin iloczynu „typ × device_kind × stan":
  `__tests__/symbolRegistry.test.tsx`.
- **Gramatyka wizualna** (`lv-domain/visualGrammar.ts`): raster 8, tokeny
  geometrii (`--sld-*` w CSS), fit 70–85 % z clampem MAX i **MIN_FIELD_WIDTH**
  per poziom (R2 §17: 96 / 72 / 40 px — pole odpływu nigdy nie jest ściskane;
  scena, która się nie mieści, PRZEWIJA zamiast się pomniejszać), hierarchia
  grubości BUS 3,0 / PRIMARY 1,6 / symbol 1,4 / SECONDARY 1,0 / HIGHLIGHT 6 px
  (kreska nieskalowana z kamerą), JEDNA skala symboli `CAD_U_PX = 2` px/u z
  sufitem udziału w slocie (`skalaSymboluNaEkranie`), cztery poziomy
  graficzne (topologia / etykieta główna / dane inżynierskie / stan i
  wyniki), typografia screen-stable, zawijanie nazw po słowach BEZ łamania
  wyrazów (≤ 2 wiersze + „…", pełna nazwa w podpowiedzi i panelu), oznaczenia
  aparatów zawsze poziome w jednym wierszu; kolor nie jest semantyką — każdy
  stan ma nośnik geometryczny (wzór kreski, geometria symbolu, etykieta),
  paleta mono do druku.
- **Kompozytor** (`composeLvDomainScene.ts`): dwa kikuty na aparat (każdy w
  stanie swojego zacisku), sprzęgło jako aparat poziomy między sekcjami,
  incomer na krańcu sekcji (ostatnia sekcja lustrzana), jedna kotwica SN na
  `equivalent_id` / `upstream_system_id`, sloty rastrowane, podrozdzielnica
  jako kreska od punktu wejścia z etykietą za pionem zasilającym, zejścia
  liści ortogonalne, przekaźnik obok kikuta dolnego aparatu, tory zasilania i
  ostrzeżenia przepisane z projekcji.
- **LOD**: `composeLvDomainScene` liczy scenę RAZ, bez parametru LOD. LOD jest
  wyłącznie filtrem prezentacji w `LvDomainView` z JEDNYM źródłem
  klasyfikacji: `REJESTR_ELEMENTOW_KANWY` (warstwy `tor` / `tozsamosc` /
  `opis`, `widocznyNaLod`). Na każdym poziomie zostają: droga prądu,
  transformator, aparat z glifem stanu, źródła, odbiory, granice, stan
  zasilania, wyspa, ostrzeżenia audytu, status wyniku.

| Poziom | Widoczne | Znika |
|---|---|---|
| L2 pełny | wszystko: symbole, etykiety tożsamości, tabliczka TR, Sk″/Ik″ kotwicy, parametry (moce, kable, przekładniki), słowo stanu, plakietki wyników z pochodzeniem | — |
| L1 sieć | pełny tor + etykiety tożsamości (sekcje, aparaty, DER, odbiory, granice, zabezpieczenia) + plakietki wyników | opisy drugorzędne (tabliczka TR, parametry, napięcia, słowny stan łącznika, pochodzenie wyniku) |
| L0 przegląd | pełny tor uproszczony; nazwa sekcji + liczba odpływów; stany zasilania i wyspy; kropka werdyktu wyniku | etykiety aparatów/DER/odbiorów, zabezpieczenia, liczby na plakietkach |

Piny: `cad/__tests__/cadSymbolRegistry.test.tsx` (18 symboli: kotwice i
zaciski na siatce, OPEN ≠ CLOSED ≠ UNKNOWN z kąta przegubu, zero wypełnienia
jako nośnika stanu, CT ≠ VT ≠ TR, unikalna geometria każdego symbolu,
renderer bez bitmap z kreską nieskalowaną, snapshot prymitywów),
`lv-domain/__tests__/lod.test.tsx` (odcisk toru identyczny na 0/1/2 w kadrze
bez clampu, rejestr ↔ renderer), `energizacja.test.tsx`,
`composeLvDomainScene.test.ts`, `LvDomainView.test.tsx` (MIN_FIELD_WIDTH +
przewijanie, etykiety poziome bez łamania słów, panel z nazwą polską aparatu i
znakami IEC), `visualGrammar.test.ts`, `motywKanwyNn.test.tsx`,
`scenariusze.test.ts`, `projectionApi.test.ts`; e2e
`frontend/e2e/lv-domain-screenshot.spec.ts` (20 kadrów §47:
`docs/audit/visual/nn/<slug>[_lod<n>][_<motyw>].png`, w tym wersja mobilna i
druk mono A3; sprzęgło jako wyłącznik / rozłącznik / łącznik ogólny z
`device_kind`, pięć rodzin aparatów w 13) oraz
`frontend/e2e/sld-symbol-pack-screenshot.spec.ts` (tablica pakietu w trzech
wariantach i tablica rozpoznawalności §22: `docs/audit/visual/cad/`).

## 6. Przypadki obsługiwane (i gdzie są przypięte)

| Przypadek | Scenariusz | Backend | Projekcja nN |
|---|---|---|---|
| 1×TR | 01 | `test_scenariusze_nn.py` | jedna kotwica, incomer z CT i przekaźnikiem, jedna sekcja |
| 2×TR, sprzęgło OTWARTE | 02 | `TestStacjaWielotransformatorowa` | dwie sekcje, QBC z glifem OTWARTY, oba kikuty zasilone z własnych TR |
| 2×TR, sprzęgło ZAMKNIĘTE | 03 | `supply = wielostronne` | `ZASILANIE WIELOSTRONNE (TA, TB)` na obu sekcjach |
| wspólne zasilanie SN + granica | 04 | `equivalent_id` wspólny, NN-AUD-10 (INFO) | jedna kotwica z nazwą GPZ; chip granicy „Stacja OBCA" |
| niezależne systemy SN | 05 | `upstream_system_id` ≠, SLACK (ograniczenie) | dwie kotwice „system SN 1 z 2 / 2 z 2", `brak danych` po polsku |
| konflikt źródeł | 06 | NN-AUD-06 | `KONFLIKT ŹRÓDEŁ`, podwójna kreska, znacznik |
| wyspa: źródło podążające | 07 | `DEENERGIZED` | kreski przerywane, „WYSPA · źródła podążające za siecią — bez napięcia" |
| wyspa: źródło tworzące | 08 | `ENERGIZED`, NN-AUD-08 | „WYSPA · zasilona z: Magazyn D", N/PE, bilans, dopuszczalność |
| wyspa: zdolność nieznana | 09 | `UNKNOWN`, NN-AUD-14 | kreski kropkowane ze znakiem „?", `STAN ZASILANIA NIEZNANY` |
| sekcja niezasilona | 10 | `DEENERGIZED` | `NIEZASILONA (WG AKTUALNEJ TOPOLOGII)`, incomer OTWARTY |
| energizacja dwustronna | 11 | oba zaciski ENERGIZED, różne wyspy | żaden kikut otwartego aparatu nie jest wygaszony |
| pełny tor DER | 12 | pomiary, zabezpieczenia | aparat → kabel → CT → źródło; przekaźnik z kodami ANSI |
| odbiory przez pola | 13 | NN-AUD-07 | odbiór bez pola wprost na szynie ze znacznikiem |
| podrozdzielnice zagnieżdżone | 14 | `supply_paths` | trzy poziomy; klik podświetla pełny tor |
| 12 odpływów | 15 | — | raster slotów, oznaczenia pionowe, nazwy zawinięte |
| wynik NIEAKTUALNY | 16 | NN-AUD-13, profil po ref ENM | wartości pokazane jako NIEAKTUALNE |
| wyniki zwarciowe | 17 | ResultSet v1 | Ik″3/ip/Ith z pochodzeniem (norma · przebieg · status) |
| SWZ mieszane | 18 | `swz_snapshot` | spełnia / nie spełnia / nierozstrzygalne |

## 7. Zakazy (egzekwowane)

- Zakaz odtwarzania wnętrza nN na kanwie SN, drugiej geometrii per LOD,
  własnego BFS/energizacji po stronie klienta, osobnych propsów zamiast
  kontraktu, fabrykowania wyników i werdyktów (`island_operation_allowed ===
  null` = „nieoceniona", nigdy „niedopuszczalna" z domysłu), interpretowania
  surowego solvera w React, fixtur frontendowych z ręczną energizacją.
- Guard `scripts/lv_domain_projection_guard.py` (R1–R5, w
  `p0-extended-guards.yml`): brak importów skasowanego legacy
  (`StationInternalView`, `NnCircuitResultsPanel`, `nnCircuitResults`,
  `nnSwzApi`, `useSwzOverlay`), jedno źródło danych portalu, zero fizyki w
  `lv-domain/**`. Meta-test: `backend/tests/ci/test_lv_domain_projection_guard.py`.
- Zakaz pisania „B-02 PASS" przez wykonawcę — werdykt wizualny wystawia
  właściciel na podstawie zrzutów `docs/audit/visual/lv_portal_sn_*.png`
  (projekcja SN) i `docs/audit/visual/nn/*.png` (projekcja nN, 20 kadrów §47).
