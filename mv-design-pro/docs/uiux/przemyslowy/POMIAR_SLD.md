# Pomiar SLD pod W5-UI-04..08/14/15 (eksplorator, tylko odczyt, 2026-10-16)
Ścieżki względem mv-design-pro/frontend/src, chyba że podano inaczej.

## 1. Kadrowanie / „Dopasuj widok" / „Cały arkusz" / wejście w stację
- Przyciski: ui/sld/v3/canvas/SldCanvasV3Workspace.tsx:2745-2767 (fitTarget 'tresc'|'arkusz', fitSignal++), stan :2024-2025.
- Cel fitu: SldCanvasV3.tsx:2419-2436 — `fitTargetLod = lodOverride ?? 2`; 'arkusz' => lodBboxes (bbox sceny), 'tresc' => contentBboxByLod = `contentBoundingBoxOf` (:2283-2318): unia WSZYSTKICH symboli/odcinków z ownerRef + prostokątów rezerwacji etykiet CAŁEJ sieci. Refit :2555-2564 (dispatch 'refit' z focusPoint GPZ).
- Brak kadrowania do: stacji, sekcji szyn, pola, magistrali, toru — zmierzone: jedyne cele to 'tresc'/'arkusz' (grep fitTarget) + akcja 'kotwicz'.
- 'kotwicz' (camera.ts:439-524, viewAnchor.ts `prostokatElementuWScenie`): niezmiennik nr 1 „Skala NIGDY nie rośnie" (camera.ts:446) — wskazanie elementu z pełnego widoku tylko centruje, nie przybliża. Przypięte: canvas/__tests__/kotwicaWidoku.contract.test.tsx.
- Zrzut rodzaj_stacji_po_stacja_dark.png NIE jest widokiem stacji: e2e/etykieta-stacji-zrzuty.spec.ts:69-98 przybliża kółkiem myszy na kursorze; tak samo e2e/pola-w-torze-zrzuty-screenshot.spec.ts:251-266 (kółko, aż LOD!=0). Stąd ucięte fragmenty sąsiadów — produkt nie ma kadru stacji.
- Dwuklik stacji: SldCanvasV3Workspace.tsx:2470-2481 — działa WYŁĄCZNIE na L0 i otwiera projekcję nN (LvDomainPortal), nie wnętrze SN. Od L1 portal nN przez klik w symbol lvPortal (:2577-2583). Projekcja nN z backendu: lv-domain/projectionApi.ts:91-97 `GET /api/cases/{case}/enm/lv-domain/{station}/projection/v1`. Przypięte: canvas/__tests__/lvDomainPortal.test.tsx („dwuklik od L1 NIE otwiera").

## 2. Geometria stacji
- Rysunek stacji: compose/station.ts `composeStation` (:958); szyna SN: JEDEN odcinek `${station.id}#sn-bus` od pierwszego do ostatniego zaczepu (:1569-1578). Pasma/kolumny: scene/buildScene.ts:1245-1268 → layout/bands.ts `computeBands` :169-197.
- PRZYCZYNA „ogromnej pustej ramki" (pola-w-torze-przelotowa-jasny.png): pasma są WSPÓLNE dla wiersza arkusza — B4 = max(stationBlockHeight) wszystkich stacji wiersza + DESCENT_STRIP_HEIGHT (6×GRID, bands.ts:117,184), B5 (nazwa) = max(nameBandHeight). Stacja z krótkim blokiem dostaje wysokość najwyższej stacji (np. z TR+nN/DER) — zejścia magistrali (kable wejście/wyjście) biegną do dołu pasma B4, a nazwa stacji ląduje pod nim (y≈595 vs szyna y≈337 na zrzucie). „Ramka" to nie obrys stacji, tylko pętla tras magistrali (zejścia F01/F02 do pasa zejść + przebieg poziomy). Nie ma obiektu „ramka stacji" w scenie (grep obrys w buildScene: tylko obrysy pól pasa górnego :6883-6903).
- Pola F03/F04 „w powietrzu": pole liniowe zawsze kończy się głowicą kablową (fieldStacksEndAtCableHead, station.ts:1977-1993; sekwencja apparatusSequence.ts:83-91), niezależnie od tego, czy do pola dochodzi odcinek. Wolne pole (bez kabla) nie ma odrębnej sylwetki/oznaczenia „rezerwa" — grep 'rezerwow|wolne pol|spare' w compose/scene/layout/symbols: 0 trafień dla stacji. Wyrocznia openTerminalGaps (buildScene.ts:6309) dotyczy końców BIEGÓW, nie pól.
- Sprzęgło (stacja sekcyjna, zrzut pola-w-torze-sekcyjna-jasny.png): FS1 rysowane jako zwykła kolumna pola DS→CB→CT (apparatusSequence.ts:79-81) zwisająca z JEDNEJ szyny „Sekcja 1"; compose/station.ts nie zna wielu sekcji szyn SN (jedyny #sn-bus :1573; grep sections w station.ts — tylko komentarze i `sectionUnresolved` :909). W5-UI-07 = brak modelu sekcji w kompozycji stacji (GPZ ma: compose/gpz.ts:20,350 props.couplers).
- Odgałęzienie: lateral z pola odgałęźnego, kanały buildScene.ts:1799, :2045-2067, :4538-4647.
- Znane defekty z dokumentów: docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md (C-1 jeden pas 53:1, C-7 doki — zamknięte); kontrakt UI-05 wylicza resztę. Nie przeczytałem w całości PLAN_SLD_REWORK.md (tylko spis sekcji).

## 3. Bloki danych (UI-06)
- Istnieje: warstwa „Etykiety wyników (liczby)" — canvas/layers.ts:26-55; szablony canvas/resultLabelTemplates.ts (rejestr analiza×rodzaj elementu, kody metryk 1:1 z backend domain/result_builder_v1.py `METRYKI_ELEMENTOW_WYNIKU`), układ canvas/resultLabels.ts; L0 nic, L1 1 wartość, L2 2-3 (cap 3).
- Źródło: ui/sld-overlay/rawResultOverlayStore.ts:3 — `GET /api/execution/runs/{run_id}/results/v1`; delta A/B sldDeltaOverlay.api.ts:91.
- Wybieralny zestaw pól: BRAK (stała kolejność priorytetu w szablonie, brak UI wyboru). Brak metryki ⇒ linia pominięta (resultLabelTemplates.ts nagłówek) — brak ≠ zero niewidoczny.
- Zapis zestawu: brak. Jedyny trwały magazyn ustawień UI: ui2/shell/useShellStore.ts:172-242 (zustand persist, localStorage). Widoczność warstw SLD to stan lokalny komponentu bez trwałości (SldCanvasV3Workspace.tsx:2042-2052). Backendu na preferencje nie sprawdzałem.
- „Ukryto N opisów": licznik deklutteru ekranu (sheet/Frame.tsx:189, sheet/outline.ts:30, canvas/labelLegibility.ts).

## 4. Warstwy (UI-07)
- 6 warstw: stationsApparatus, derSources, protectionAnnotations, labels, resultOverlays, resultLabels (layers.ts:26-55) + podwarstwy L2A-D (:127-170). Przełączanie per warstwa; brak warstw tematycznych „napięcia/obciążenie/zwarcia/stan łączeniowy/problemy".
- Legenda (12/13) = legenda SYMBOLI (sheet/projectLegend.ts:67), nie skala ilościowa; grep colorScale/heatmap w v3/sld-overlay/ui2/wyniki: 0 (jedno trafienie w v2 LabelDeclutter).
- Nieaktualne: `resultsStale` → baner + przygaszenie etykiet (SldCanvasV3.tsx:2695, 3408-3434); freshness ui2/freshness/freshnessModel.ts:18 ('brak'|'aktualne'|'nieaktualne'). Brak wyniku vs zero: brak metryki = brak linii (niewidoczny stan), zero = „0,00" — nie trzy różne stany wizualne.
- ZIELONE PRZEWODY — przyczyna źródłowa: nakładka energizacji włączona zawsze (nie zależy od biegu): SldCanvasV3Workspace.tsx:1485, 1667-1668 → buildEnergizationOverlay :570-607 → ui/sld/v2/canvas/SupplyPathHighlighter.ts:106-190 = BFS topologii we FRONCIE (od Source.bus_ref przez branch.status==='closed' i transformatory). Kolor energized #2ECC71 (theme/colorTokens.ts:264); bez nakładki kolor bazowy SN #13C45A (colorTokens.ts:105-108, SldCanvasV3.tsx:681). Zrzuty mają „Wyniki: brak", a przewody zielone — narusza §8/UI-07 (domniemany dowód zasilania) i zasadę „topologia nie liczona we froncie".

## 5. Tor elektryczny (UI-08)
- Brak podświetlania drogi od źródła po zaznaczeniu pola w v3 (jedyny konsument SupplyPath w v3 = energizacja globalna; grep SupplyPath|torZasilania).
- Backend: enm/topology.py `derive` (:134) → TopologyView/Wyspa (zasilona, wezel_topologiczny, laczniki_otwarte) — używany przez enm/validator.py:73 i application/calculation_readiness/service.py:53, ALE NIE wystawiony przez API (grep derive/szyny_niezasilone/energiz w api/: 0). Endpointy: api/enm.py:294 `GET /{case}/enm/topology` (stacje/pola/węzły/korytarze), :785 `/enm/topology/summary` (adjacency, spine, lateral_roots; enm/topology_ops compute_topology_summary) — brak per-element zasilenia i ścieżki źródło→element. Wpięcie: nowy kontrakt backendu (ścieżka/wyspy z `derive`) zastępujący BFS z SupplyPathHighlighter.

## 6. Gotowość → SLD (W5-UI-14)
- Klik wiersza: ui2/AppRoot.tsx:381-386 `onSelekcja` → tylko emituj('selekcja') → AppRoot.tsx:204-207 ustawia zaznaczonyId inspektora; NIE woła centerSldOnElement, NIE przełącza na Schemat.
- „Napraw…": ui2/spaces/gotowosc/akcjeNaprawcze.ts:498-535 → przejdzDoPrzestrzeni('schemat') + executeFixActionSurface (fixActionSurfaceExecutor.ts:100 centerSldOnElement) → selection/store.ts:156 → SldCanvasV3Workspace.tsx:2140-2155 pokazElement → SldCanvasV3.tsx:2572-2588 'kotwicz' = centrowanie bez przybliżenia (pkt 1). Brak wyróżnienia innego niż selekcja. Ograniczenie: powtórne wskazanie tego samego refu nie kadruje (komentarz :2140-2147).

## 7. Testy przypinające geometrię
- .github/workflows/sld-determinism.yml: v2 (layoutEngine.substrate, ViewportController, LodPolicy, renderers, portAnchoredGeometry.substrate, SldCommandService, ports) + v3: scene/__tests__/lodContinuity, buildScene.gpzCollapsed, busbarLabelClearance, buildScene.sheetRows; canvas/__tests__/minSymbolSize.contract, gpzCollapsedExpand, kadrTresci.contract, tozsamoscEtykiet.contract, toolbarLayout.contract; layout/__tests__/sheetRows; theme/__tests__/palette; `npm run accept:sld-v3` (scripts/sld_v3_acceptance.mjs).
- Poza workflow, istotne dla zmian: scene/__tests__/kosztSceny.test.ts (odciski sceny), canvas/__tests__/kotwicaWidoku.contract.test.tsx, obszarBezpieczny.contract.test.tsx, lvDomainPortal.test.tsx, compose/__tests__/station*.test.ts, scene/__tests__/buildScene.openTerminal.test.ts, layout/__tests__/layout.test.ts.
- E2E zrzutowe ekranów: e2e/pola-w-torze-zrzuty-screenshot.spec.ts, e2e/etykieta-stacji-zrzuty.spec.ts (rodzaj_stacji_*), station-rozdzielnia-screenshot, lv-portal-screenshot, lv-domain-screenshot, legenda-zrzuty, minimapa-zrzuty, sld-substrate-screenshot, sld-audyt-powykonawczy-screenshot, kd3..kd11-zrzuty.

## Czego nie sprawdziłem
- Nie uruchamiałem testów ani aplikacji; nie mierzyłem liczbowo wysokości pasm na konkretnej fiksturze (przyczyna pustki = wniosek z kodu bands.ts + zrzutu; potwierdzenie wymaga sondy).
- Nie czytałem w całości PLAN_SLD_REWORK.md ani docs/sld/* poza AUDYT_JAKOSCI_SLD_2026-08 (grep).
- Nie weryfikowałem topologii 4 pól przelotowej w danych e2e (które pola mają kabel) — tylko obraz.
- Nie sprawdzałem backendowego magazynu preferencji użytkownika.
