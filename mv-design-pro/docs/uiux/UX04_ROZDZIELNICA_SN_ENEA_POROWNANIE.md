# UX-04 / ROZDZIELNICA-SN-KOREKTA — porównanie rysunków ENEA z modelem i sceną SLD

**Status:** materiał dowodowy karty UX-04/ROZDZIELNICA-SN-KOREKTA (`PLANS.md` część A §C, wiersz UX-04),
bez własnego statusu. Werdykt wizualny należy do właściciela (bramka B-02) — ta tabela go nie zastępuje.

**Źródło:** ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe
110 kV/SN”, wersja 02.2023-2 (PDF poza repozytorium, polityka `local_cache_only_not_commit_pdf`).
Mapa stron: Z.7 = s.86, Z.10 = s.89, Z.11 = s.90, Z.12 = s.92, Z.13 = s.93, Z.16 = s.96, Z.17 = s.97
(`GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`). Każdy wiersz „zgodny” wystawiono po obejrzeniu strony
rysunku 2026-11-11 (render strony i wycinki 300 dpi), nie z opisu.

**Model:** szablony pól `backend/src/network_model/catalog/bay_templates.py`
(`BAY_TEMPLATE_GPZ_TRANSFORMATOR_Z7`, `…_LACZNIK_SZYN_Z12`, `…_ZESPOL_UZIEMIAJACY_Z13`, `…_BKR_Z16`,
`…_POMIAR_NAPIECIA_Z17`, pole liniowe `…_LINE_DOMYSLNY` wg Z.10), fikstura
`frontend/public/test-fixtures/gpz110kvPolaSzablonow.enm.json` (generator
`backend/tests/reference_networks/fikstury_enm_sld.py`).

**Scena:** `buildSceneV3` (LOD 2) na tej fikstury, symbole w kolejności toru od szyny. Kolumna
„element sceny” podaje `symbolId` glifu. Rysunki ENEA nie nadają aparatom oznaczeń literowych —
oznaczenia Q0/Q1/T1/PF0/GK… są wartościami roboczymi szablonu (zasada nr 4).

Kierunek czytania: od szyny SN na zewnątrz. Pole TR stoi NAD szyną SN (wieża transformatora), więc na
scenie jego tor biegnie od szyny w górę (decyzja architekta D1); kolejność aparatów jest ta sama co na
rysunku, który prowadzi tor od szyny w dół do transformatora.

## Z.7 Pole transformatora 110 kV/SN — strona SN (s.86)

| Rysunek (s.86) | Obiekt modelu | Element sceny | Ocena |
|---|---|---|---|
| wskaźnik napięcia przy szynie | `VOLTAGE_INDICATOR` PF0 | `qetVoltageIndicator` przy szynie SN | zgodny |
| zestyk odłączający z uziemieniem + napęd uziemienia | `THREE_POSITION_SWITCH` Q1 | `qetThreePositionSwitchZNapedem` | zgodny |
| wyłącznik z napędem M (OW1, OW2, ZW) | `CB` Q0 | `qetBreakerZNapedem` | zgodny |
| odgałęzienie przekładnika napięciowego: łącznik z uziemieniem → złącze kablowe (czarny prostokąt z łukiem — ten sam znak co głowica toru) → PN SN/√3/0,1/√3 ×3 | `THREE_POSITION_SWITCH` Q5, `CABLE_HEAD` GK1, `VT` T3 (`OFF_PATH`, gałąź) | `qetThreePositionSwitch`, `qetCableHead`, `qetVoltageTransformer3` w kolumnie odgałęzienia obok toru | zgodny co do składu i miejsca (między wyłącznikiem a przekładnikiem prądowym); rysunek prowadzi gałąź poziomo, scena — kolumną pionową jak Z.11 (s.90) — patrz D3f niżej |
| przekładnik prądowy 4-rdzeniowy 1000/5/5/5/5, P1 od wyłącznika, P2 od kabla | `CT` T1 | `qetCurrentTransformer` | zgodny (P1 od strony wyłącznika, P2 od strony kabla — `kolumnyOpisowPolaGpz`, przy torze w górę P1 dół, P2 góra) |
| wskaźnik napięcia od strony kabla | `VOLTAGE_INDICATOR` PF1 | `qetVoltageIndicator` | zgodny |
| głowica kablowa, kabel (linia kreskowana) | `CABLE_HEAD` GK | `qetCableHead` | zgodny |
| ogranicznik przepięć przy transformatorze (odgałęzienie do ziemi) | `SURGE_ARRESTER` F1 (`OFF_PATH`) | `surgeArrester` na odczepie toru przy TR | zgodny |
| transformator 110/SN | `Transformer` (model, nie aparat pola) | `transformer2W` w osi wieży | zgodny |
| sterownik pola, funkcje I>, I>>, ZS, LRW, różnicowe, ARN | `ProtectionAssignment` pola | blok zabezpieczeń pola (`protectionRelay`) | zakres zabezpieczeń poza tą kartą (nośnik CT pola przebudowuje wykonawca integracji) |

**D3f — T3/GK1 na odgałęzieniu.** Na Z.7 (s.86) przekładnik napięciowy pola TR wisi na węźle toru
między wyłącznikiem a przekładnikiem prądowym, poprzez własny łącznik z uziemieniem i złącze kablowe —
jest ODGAŁĘZIENIEM, nie elementem toru. Ten sam układ, rysowany pionowo, ma Z.11 (s.90, wycinek
odgałęzienia: węzeł toru → w prawo → łącznik z uziemieniem → złącze → PN). Scena rysuje go kolumną
odgałęzienia obok osi toru (`ukladGalezi`, przewód z portów ENM) — zostaje poza osią.

**Strona WN transformatora.** Fikstura nie ma pola WN TR w modelu (aparatura 110 kV poza modelem
rozdzielnicy SN). Scena rysuje kreskowane połączenie szyna WN → TR z opisem „Granica zasilania WN ·
pole WN TR poza modelem” (decyzja D3b), nie ramkę „?”.

## Z.12 Pole łącznika szyn SN (s.92)

| Rysunek (s.92) | Obiekt modelu | Element sceny | Ocena |
|---|---|---|---|
| szyna sekcji A, wskaźnik napięcia | `VOLTAGE_INDICATOR` PF0 | `qetVoltageIndicator` celki lewej | zgodny |
| zestyk odłączający z uziemieniem + napęd uziemienia (strona A) | `THREE_POSITION_SWITCH` Q1 | `qetThreePositionSwitchZNapedem` celki lewej | zgodny |
| wyłącznik z napędem M | `CB` Q0 | `qetBreakerZNapedem` celki lewej | zgodny |
| przekładnik prądowy 2-rdzeniowy 1000/5/5 | `CT` T1 | `qetCurrentTransformer` celki lewej | zgodny |
| napęd uziemienia + zestyk odłączający z uziemieniem (strona B) | `THREE_POSITION_SWITCH` Q2 | `qetThreePositionSwitchZNapedem` celki prawej | zgodny |
| wskaźnik napięcia, szyna sekcji B | `VOLTAGE_INDICATOR` PF2 | `qetVoltageIndicator` celki prawej | zgodny |
| jeden tor A → B | jedno pole sprzęgła | dwie celki połączone pod szynami | zgodny z §13 („jedna lub dwie celki”) i Z.2 (s.78, pola 1/2 ŁS); rysunek Z.12 nie wskazuje podziału |

## Z.13 Pole zespołu uziemiającego — dławik z regulacją (s.93)

| Rysunek (s.93) | Obiekt modelu | Element sceny | Ocena |
|---|---|---|---|
| zestyk odłączający z uziemieniem + napęd uziemienia (bez wskaźnika napięcia przy szynie) | `THREE_POSITION_SWITCH` Q1 | `qetThreePositionSwitchZNapedem` | zgodny |
| wyłącznik z napędem M | `CB` Q0 | `qetBreakerZNapedem` | zgodny |
| przekładnik prądowy 100/5 (1 rdzeń) | `CT` T1 | `qetCurrentTransformer` | zgodny |
| ogranicznik przepięć na węźle przed transformatorem | `SURGE_ARRESTER` F1 (`OFF_PATH`) | `surgeArrester` na odczepie | zgodny |
| transformator uziemiający z uzwojeniem potrzeb własnych 400/230 V | `Transformer` ZNyn11 (model) | `transformer2W` + strzałka zasilania potrzeb własnych (`loadArrow`) | zgodny |
| punkt neutralny: ogranicznik do ziemi, odłącznik, dławik z regulacją, rezystor wymuszający (AWSC) | `Transformer.hv_neutral` (`enm.zespol_uziemiajacy`) | `surgeArrester`, `disconnector`, `neutralEarthing` | zgodny co do składu; glif `neutralEarthing` niesie rodzaj uziemienia, wartości R/X w legendzie arkusza |

## Z.16 Pole baterii kondensatorów (s.96)

| Rysunek (s.96) | Obiekt modelu | Element sceny | Ocena |
|---|---|---|---|
| zestyk odłączający z uziemieniem + napęd uziemienia | `THREE_POSITION_SWITCH` Q1 | `qetThreePositionSwitchZNapedem` | zgodny |
| wyłącznik z napędem M | `CB` Q0 | `qetBreakerZNapedem` | zgodny |
| przekładnik prądowy 100/5/5 (3 rdzenie) | `CT` T1 | `qetCurrentTransformer` | zgodny |
| wskaźnik napięcia, głowica kablowa, kabel | `VOLTAGE_INDICATOR` PF1, `CABLE_HEAD` GK | `qetVoltageIndicator`, `qetCableHead` | zgodny |
| ogranicznik przepięć przy baterii | `SURGE_ARRESTER` F1 | `surgeArrester` na odczepie | zgodny |
| bateria w podwójnej gwieździe, przekładnik niezrównoważenia między punktami gwiazd, PN L1-L2 i L2-L3 | `ShuntCapacitor` + `PHASE_TO_PHASE_VT` T4, T5, `UNBALANCE_CT` T6 | `capacitorBank` (glif rysuje T4/T5 przy doprowadzeniu i T6 w połączeniu międzygwiazdowym — `bateriaPola.ts`) | zgodny |

## Z.17 Pole pomiaru napięcia (s.97)

| Rysunek (s.97) | Obiekt modelu | Element sceny | Ocena |
|---|---|---|---|
| zestyk odłączający z uziemieniem + napęd uziemienia (bez napędu silnikowego) | `THREE_POSITION_SWITCH` Q1 | `qetThreePositionSwitch` | zgodny |
| wskaźnik napięcia | `VOLTAGE_INDICATOR` PF1 | `qetVoltageIndicator` | zgodny |
| złącze kablowe (czarny prostokąt z łukiem) | `CABLE_HEAD` GK1 | `qetCableHead` | zgodny |
| PN 3-uzwojeniowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 | `VT` T1 | `qetVoltageTransformer3` | zgodny |
| brak wyłącznika | brak rekordu `CB` | brak symbolu wyłącznika | zgodny |

## Z.10 Pole linii odpływowej SN (s.89) — regresja wzorca

Strony s.89 nie oglądano ponownie 2026-11-11: wiersze opierają się na odczycie z 2026-10-28 zweryfikowanym przez sesję główną (`GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`, karta UX-04/POLE-LINIOWE-WZORZEC); ta karta nie zmieniała pola liniowego.

| Rysunek (s.89) | Obiekt modelu | Element sceny | Ocena |
|---|---|---|---|
| zestyk odłączający z uziemieniem + napęd | Q1 | `qetThreePositionSwitchZNapedem` | zgodny |
| wyłącznik z napędem M | Q0 | `qetBreakerZNapedem` | zgodny |
| przekładnik prądowy 200-400/5 | T1 | `qetCurrentTransformer` | zgodny |
| wskaźnik napięcia, głowica kablowa | PF1, GK | `qetVoltageIndicator`, `qetCableHead` | zgodny |
| przekładnik Ferrantiego 1/100 na kablu | `CORE_BALANCE_CT` | `qetCoreBalanceCt` | zgodny |
| odejście kablowe | kabel poza rozdzielnicą | `bayReserve` (kabel kreskowany ze strzałką, gdy kabla brak w modelu) | zgodny z decyzją właściciela 2026-10-30 |

## Rozmieszczenie rozdzielnicy (Z.2, s.78; §13)

| Wymaganie | Stan sceny | Ocena |
|---|---|---|
| pola sekcji w szeregu celek, wspólny poziom szyny | raster celek sekcji (`layoutSectionFields`, `GpzComposition.rasterCelek`), kolumny rozłączne, numeracja ciągła | zgodny (test `gpzRasterCelek`, `buildScene.gpzRasterCelek`) |
| pole TR jako celka szeregu (pola 7/8 TR1/TR2 na Z.2) | kolumna wieży transformatora stoi w miejscu pola TR w kolejności modelu (`pozycjaCelkiWSekcji`) | zgodny co do miejsca w szeregu; wieża rysowana nad szyną (decyzja D1) |
| układ dwurzędowy rzędów naprzeciw (Z.2) | scena rysuje sekcje obok siebie w jednym rzędzie | odbiega — świadomie: układ fizyczny rzędów nie jest treścią schematu jednokreskowego; kolejność pól w sekcji zachowana |
