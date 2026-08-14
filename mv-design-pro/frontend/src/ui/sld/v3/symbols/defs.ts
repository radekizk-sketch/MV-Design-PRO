/**
 * SLD V3 — biblioteka symboli IEC 60617 jako CZYSTE DANE (SLD_CAD_SPEC_V3 §3).
 *
 * Każdy symbol: bbox (wielokrotność GRID), nazwane porty NA siatce i NA
 * krawędzi bboxa (wyrocznia grid_probe/port_probe — spec §11.2/§11.3).
 * Rysunek (glif SVG) w `glyphs.tsx`; layout zna WYŁĄCZNIE te dane.
 *
 * Odstępstwo od tabeli spec §3: symbole DER mają 32×32 (nie 24×24), bo port
 * centralny 12px nie leży na siatce GRID=8 — wyrocznia siatki jest nadrzędna.
 */

import { GRID, isOnGrid, type SymbolPort } from '../core/grid';

export type SymbolId =
  | 'breaker'          // wyłącznik (CB)
  | 'recloser'         // reklozer — wyłącznik z automatyką SPZ (MINI-RMU-CAD)
  | 'disconnector'     // odłącznik (DS)
  | 'loadBreakSwitch'  // rozłącznik (łącznik obciążeniowy, spec §12.5 — recenzja NO-GO pkt 5)
  | 'earthSwitch'      // uziemnik (ES)
  | 'fuseSwitch'       // rozłącznik z bezpiecznikiem
  | 'fuse'             // bezpiecznik SAM (bez łącznika) — kind `FUSE` szablonu pola
  | 'voltageIndicator' // wskaźnik obecności napięcia (VPIS) — sygnalizacja pola
  | 'transformer2W'    // transformator dwuuzwojeniowy
  | 'cableHead'        // głowica kablowa
  | 'jointSleeve'      // mufa kablowa
  | 'noPoint'          // punkt podziału NO (łącznik otwarty na torze)
  | 'junction'         // węzeł T (jawna kropka)
  | 'branchJunction'   // węzeł rozgałęzienia lateralu — akcent (spec §14.4)
  | 'branchCabinet'    // złącze kablowe SN (ZKSN) — punkt odgałęźny na odcinku kablowym
  | 'branchPole'       // słup rozgałęźny — punkt odgałęźny na odcinku napowietrznym
  | 'currentTransformer' // przekładnik prądowy CT
  | 'voltageTransformer' // przekładnik napięciowy VT
  | 'surgeArrester'    // ogranicznik przepięć SA
  | 'neutralEarthing'  // punkt neutralny sieci + aparat uziemiający (V12K-219)
  | 'derPv'            // falownik PV
  | 'derBess'          // magazyn energii
  | 'derGenerator'     // generator (G w okręgu)
  | 'derWind'          // farma wiatrowa (turbina, F9.4 §13.2)
  | 'gridSource'       // sieć zewnętrzna (Source ENM, F9.4 §13.1/§13.2)
  | 'stationCollapsed' // stacja SN/nN, widok zbiorczy (L0) — mini-RMU (sylwetka)
  | 'gpzCollapsed'     // GPZ (rozdzielnia zasilająca), widok zbiorczy (L0) — blok zwinięty (KD-5)
  | 'protectionRelay'  // F9.9: przekaźnik zabezpieczeniowy (okrąg + kody ANSI, §17.1)
  | 'meter'            // F9.9: miernik (okrąg „M"/litera wielkości, §17.1)
  | 'loadArrow'        // zagregowany odbiór 0,4 kV (spec §12.5 — recenzja NO-GO pkt 6)
  // P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, F_PLAN_UI_NN_STUDIO §4): symbole
  // aparatów/rozdzielnicy nN — rodzina ODRĘBNA od aparatury SN (device_kind
  // katalogu APARAT_NN/APARAT_NN_MCB/WKLADKA_NN, karty P0.2/P0.7), bo fizyczne
  // aparaty nN (MCB modułowy, wkładka NH w podstawie bezpiecznikowej) mają
  // INNĄ sylwetkę niż odpowiedniki SN (`breaker`/`fuseSwitch`) — parytet
  // wzorca `recloser` (nowy glif dla nowego device_kind, nie recykling
  // istniejącego rysunku).
  | 'nnDistributionBoard' // rozdzielnica nN (RGnN) — kontener z szyną, liść
                          // odpływu (wzorzec DER: pojedynczy port N)
  | 'nnBreaker'        // wyłącznik nN / MCB (IEC 60898-1, namespace APARAT_NN_MCB
                        // + device_kind WYLACZNIK_GLOWNY/WYLACZNIK_ODPLYWOWY)
  | 'nnFuseSwitch'      // rozłącznik bezpiecznikowy nN (device_kind
                        // ROZLACZNIK_BEZPIECZNIKOWY / namespace WKLADKA_NN)
  | 'nnMeter';          // licznik nN (miernik energii, W-620+ nN STUDIO)

export interface SymbolDef {
  readonly id: SymbolId;
  readonly width: number;
  readonly height: number;
  readonly ports: readonly SymbolPort[];
  /** Polska nazwa dla inspektora/tooltipa (spec §9 — zero enumów w UI). */
  readonly labelPl: string;
}

function def(
  id: SymbolId,
  width: number,
  height: number,
  ports: readonly SymbolPort[],
  labelPl: string,
): SymbolDef {
  return { id, width, height, ports, labelPl };
}

export const SYMBOL_DEFS: Readonly<Record<SymbolId, SymbolDef>> = {
  breaker: def('breaker', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 16, dir: 'S' },
  ], 'Wyłącznik'),
  // MINI-RMU-CAD: REKLOZER — łącznik pola liniowego z automatyką samoczynnego
  // ponownego załączenia (`device_kind` REKLOZER katalogu APARAT_SN; backend
  // dopuszcza go dla ról IN/OUT/FEEDER — `BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE`).
  // Do tej karty biblioteka nie miała dla niego symbolu, więc każdy rysunek
  // pokazywał go jako zwykły wyłącznik — projektant nie widział z rysunku, że
  // pole ma automatykę SPZ, a to zmienia koordynację zabezpieczeń ciągu.
  // Gabaryt 16×24 (nie 16×16 jak wyłącznik): łuk automatyki ponownego
  // załączenia potrzebuje własnego pasa nad korpusem — parytet z symbolem
  // `auto_recloser.svg` biblioteki kanonicznej v1 (korpus wyłącznika + łuk).
  recloser: def('recloser', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Reklozer (wyłącznik z automatyką SPZ)'),
  disconnector: def('disconnector', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Odłącznik'),
  // Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): ROZŁĄCZNIK (łącznik
  // obciążeniowy, IEC 60617 switch-disconnector) — dedykowany glif,
  // odróżnialny od odłącznika poprzeczką na końcu styku ruchomego.
  // Kasuje udokumentowaną aproksymację `LOAD_SWITCH→disconnector`
  // (nagłówek compose/apparatusSequence.ts).
  loadBreakSwitch: def('loadBreakSwitch', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Rozłącznik'),
  earthSwitch: def('earthSwitch', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Uziemnik'),
  /** Punkt neutralny sieci z aparatem uziemiającym (V12K-219). Rysowany przy
   *  szynie, bo w sieci zasilanej z transformatora o dolnej stronie w TRÓJKĄCIE
   *  (tu Yd11) punkt neutralny nie istnieje na transformatorze mocy — wytwarza go
   *  transformator uziemiający wpięty do szyny. Wysokość 32 = 4×GRID mieści
   *  aparat (rezystor albo dławik) i symbol uziomu pod nim; bbox MUSI być
   *  wielokrotnością siatki — pilnuje tego `grid_probe` (spec §11.2). */
  neutralEarthing: def('neutralEarthing', 16, 32, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Punkt neutralny — uziemienie'),
  fuseSwitch: def('fuseSwitch', 16, 32, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 32, dir: 'S' },
  ], 'Rozłącznik z bezpiecznikiem'),
  // SLD-GEN-POLA: BEZPIECZNIK SAM — pozycja `FUSE` kompozycji aparatów pola
  // (`BayDeviceTemplate.kind`, np. pole potrzeb własnych: DS_BUS + FUSE + ES).
  // Biblioteka miała dotąd wyłącznie `fuseSwitch` (rozłącznik Z bezpiecznikiem),
  // więc generator pola musiałby albo pominąć aparat obecny w kompozycji, albo
  // dorysować łącznik, którego w niej nie ma — oba zakazane. Gabaryt 16×24
  // (3×GRID): korpus bezpiecznika krótszy niż zestaw rozłącznik+wkładka (32),
  // dłuższy niż wyłącznik (16) — sylwetka rozróżnialna bez czytania etykiety.
  fuse: def('fuse', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Bezpiecznik'),
  // SLD-GEN-POLA: WSKAŹNIK OBECNOŚCI NAPIĘCIA (VPIS) — `apparatus_kind`
  // `voltage_indicator` kompozycji producenta (`BayDeviceInstanceTemplate`),
  // wymieniony w kanonie konfiguratora (`KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §3
  // „+ VPIS jako sygnalizacja"). To SYGNALIZACJA, nie aparat toru mocy: jeden
  // port (N) — wisi na odgałęzieniu bocznym, tak jak przekładnik napięciowy.
  voltageIndicator: def('voltageIndicator', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Wskaźnik obecności napięcia (VPIS)'),
  transformer2W: def('transformer2W', 32, 40, [
    { name: 'hv', x: 16, y: 0, dir: 'N' },
    { name: 'lv', x: 16, y: 40, dir: 'S' },
  ], 'Transformator SN/nN'),
  cableHead: def('cableHead', 16, 16, [
    { name: 'line', x: 8, y: 16, dir: 'S' },
  ], 'Głowica kablowa'),
  jointSleeve: def('jointSleeve', 16, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 16, y: 8, dir: 'E' },
  ], 'Mufa kablowa'),
  noPoint: def('noPoint', 16, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 16, y: 8, dir: 'E' },
  ], 'Punkt podziału sieci (NO)'),
  junction: def('junction', 16, 16, [
    { name: 'n', x: 8, y: 0, dir: 'N' },
    { name: 's', x: 8, y: 16, dir: 'S' },
    { name: 'e', x: 16, y: 8, dir: 'E' },
    { name: 'w', x: 0, y: 8, dir: 'W' },
  ], 'Węzeł'),
  // F9.3 (spec §14.4 „jawne rozgałęzienia" — akcent węzłów): gabaryt 32×32
  // (4×GRID, vs 16×16 `junction` bazowy) — ZAWSZE odróżnialny gabarytowo
  // (branch_accent_probe: „gabaryt większy niż junction bazowy"). Porty N/S/
  // E/W jak `junction`, skalowane do bboxa (spec §11.2/§11.3 grid_probe/
  // port_probe — 32/2=16=2×GRID, centrowanie zostaje na siatce).
  branchJunction: def('branchJunction', 32, 32, [
    { name: 'n', x: 16, y: 0, dir: 'N' },
    { name: 's', x: 16, y: 32, dir: 'S' },
    { name: 'e', x: 32, y: 16, dir: 'E' },
    { name: 'w', x: 0, y: 16, dir: 'W' },
  ], 'Węzeł rozgałęzienia'),
  // ODG-RYSUNEK (etap 3 kontraktu `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`):
  // PUNKT ODGAŁĘŹNY na odcinku magistrali — obiekt ENM (`branch_points`), nie
  // marker trasy. Dwa rodzaje z modelu (`BranchPointSN.branch_point_type`) mają
  // WŁASNE glify, bo są to różne obiekty terenowe i projektant musi je odróżnić
  // na rysunku bez czytania etykiety:
  //  · `branchCabinet` — złącze kablowe SN (ZKSN): obudowa (prostokąt, obwiednia
  //    aparatu IEC 60617) z węzłem toru w środku;
  //  · `branchPole` — słup rozgałęźny linii napowietrznej: węzeł toru z sylwetką
  //    słupa (trzon + poprzeczka), bez obudowy.
  // Gabaryt 16×16 (2×GRID) — TEN SAM co `junction`/`jointSleeve`, bo punkt leży
  // W SZCZELINIE między kolumnami stacji (`COLUMN_GAP`) na sub-poziomie korytarza
  // międzystacyjnego (`trunkCorridorYOf`): większy gabaryt wchodziłby w blok
  // stacji-poprzednika (kolizja `symbolWireCollisions`). Rozróżnienie od zwykłego
  // węzła niesie GLIF (obudowa/słup vs sama kropka), nie rozmiar.
  // Porty W/E = tor magistrali (wejście/wyjście ciągu), S = odgałęzienie,
  // N wolny — wszystkie na siatce (16/2 = 8 = GRID, `grid_probe`/`port_probe`).
  branchCabinet: def('branchCabinet', 16, 16, [
    { name: 'n', x: 8, y: 0, dir: 'N' },
    { name: 's', x: 8, y: 16, dir: 'S' },
    { name: 'e', x: 16, y: 8, dir: 'E' },
    { name: 'w', x: 0, y: 8, dir: 'W' },
  ], 'Złącze kablowe SN (punkt odgałęźny)'),
  branchPole: def('branchPole', 16, 16, [
    { name: 'n', x: 8, y: 0, dir: 'N' },
    { name: 's', x: 8, y: 16, dir: 'S' },
    { name: 'e', x: 16, y: 8, dir: 'E' },
    { name: 'w', x: 0, y: 8, dir: 'W' },
  ], 'Słup rozgałęźny (punkt odgałęźny)'),
  currentTransformer: def('currentTransformer', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Przekładnik prądowy'),
  voltageTransformer: def('voltageTransformer', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Przekładnik napięciowy'),
  surgeArrester: def('surgeArrester', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Ogranicznik przepięć'),
  // Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5): zagregowany ODBIÓR 0,4 kV
  // — strzałka odbioru (IEC 60617), zaczep portem N do szyny nN.
  loadArrow: def('loadArrow', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Odbiór (zagregowany)'),
  derPv: def('derPv', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Instalacja fotowoltaiczna'),
  derBess: def('derBess', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Magazyn energii'),
  derGenerator: def('derGenerator', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Generator'),
  // F9.4 (spec §13.2, V12K-029): farma wiatrowa — sam gabaryt/porty jak
  // pozostałe DER (32×32, port `ac` na N) — rozróżnienie glifem (`glyphs.tsx`).
  derWind: def('derWind', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Farma wiatrowa'),
  // F9.4 (spec §13.1/§13.2): sieć zewnętrzna (Source ENM) — jeden port
  // `bottom` (S), gabaryt 16×24 jak `disconnector`/`earthSwitch` (aparat
  // jednokolumnowy, nie DER 32×32 — ten symbol nie jest instalacją DER).
  gridSource: def('gridSource', 16, 24, [
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Sieć zewnętrzna'),
  // SCHEMAT-10 GS-1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §10.4, macierz
  // `AUDYT_SCHEMATOW_OD_ZERA_2026-07` §3 wiersz „Stacja"): symbol zbiorczy
  // stacji na L0 to MINI-RMU — sylwetka tej samej gramatyki co L1/L2 w
  // miniaturze (obrys enklozury + wewnętrzna kreska szyny SN), nie goły
  // kwadrat 16×16. Rozmiar 48×48 (6×GRID) WYPROWADZONY z czytelności na
  // kadrze CAŁEJ sieci referencyjnej: przy fit `sldSubstrate52s` (bbox
  // 14296×4379, harness 1800×1100, padding 40) skala fit=0,1203 ⇒ 48px świata
  // = 5,78px ekranu (16px dawało 1,93px — nieodróżnialne od kropki węzła).
  // Prześwit sąsiadów na L0 (min. odstęp osi stacji tego samego pasa = 664px)
  // ⇒ glif zajmuje <8% odstępu, zero ryzyka kolizji (`noSceneSymbolOverlaps`).
  // Porty N/S/E/W jak `junction` (kontrakt routingu; L0 kotwiczy dodatkowo
  // ŚRODKIEM — `sceneSegmentEndpointGaps`). Markery typu/TR/DER/NO rysuje
  // `StationCollapsedGlyph` WEWNĄTRZ bboxa (zero nowej rezerwacji), sterowane
  // `GlyphProps` (`meta.stationGlyph`, wzór `protectionCodes`/`meterQuantity`).
  stationCollapsed: def('stationCollapsed', 48, 48, [
    { name: 'n', x: 24, y: 0, dir: 'N' },
    { name: 's', x: 24, y: 48, dir: 'S' },
    { name: 'e', x: 48, y: 24, dir: 'E' },
    { name: 'w', x: 0, y: 24, dir: 'W' },
  ], 'Stacja (widok zbiorczy)'),
  // KD-5 (dług nazwany w V12K-285): BLOK GPZ ZWINIĘTY na poziomie przeglądowym
  // L0 — odpowiednik `stationCollapsed` dla rozdzielni ZASILAJĄCEJ. Na L0 pełny
  // układ wewnętrzny GPZ (szyna WN + pola WN + TR + pole TR + sekcje SN + pola
  // liniowe = 16 symboli 16 px świata na fixturze referencyjnej) renderował się
  // przy skali przeglądu ≈0,12 jako gąszcz plamek po ≈1,9 px — poniżej progu
  // rozpoznawalności `MIN_SYMBOL_SCREEN_PX`, czyli szum zamiast informacji.
  //
  // Rozmiar 128×128 (16×GRID) WYPROWADZONY z czytelności na kadrze CAŁEJ sieci
  // referencyjnej, TĄ SAMĄ metodą co `stationCollapsed`: przy skali fit
  // `sldSubstrate52s` = 0,1203 daje 15,4 px ekranu (stacja 48 px → 5,78 px), a
  // więc blok źródłowy jest 2,7× wyraźniejszy od stacji SN — hierarchia zgodna
  // ze znaczeniem (GPZ jest jedynym punktem zasilania przeglądu). Mieści się z
  // zapasem w rezerwie strefy GPZ (536×552 na fixturze), więc zwinięcie NIE
  // przesuwa magistrali ani stacji (kotwica LOD-niezależna, V12K-135 §S1).
  //
  // Porty N/S/E/W jak `stationCollapsed`: `n` = zejście od źródła sieci
  // zewnętrznej, `s` = zejście pola odejściowego do magistrali.
  gpzCollapsed: def('gpzCollapsed', 128, 128, [
    { name: 'n', x: 64, y: 0, dir: 'N' },
    { name: 's', x: 64, y: 128, dir: 'S' },
    { name: 'e', x: 128, y: 64, dir: 'E' },
    { name: 'w', x: 0, y: 64, dir: 'W' },
  ], 'Rozdzielnia zasilająca GPZ (widok zbiorczy)'),
  // F9.9 (spec §17.1/§17.3): przekaźnik zabezpieczeniowy — okrąg 24×24
  // (3×GRID) w kolumnie adnotacji pola. Element ADNOTACJI (NIE aparat toru
  // mocy, §17.1: „nie uczestniczy w ciągłości elektrycznej ani w wyroczniach
  // toru") — port `link` WYŁĄCZNIE geometryczny (zaczep TORU WYZWALANIA
  // przerywanego, §17.1), nie oznacza udziału w routingu elektrycznym.
  // Port `link` na y=8 (NIE geometryczny środek y=12 — 24/2=12 NIE jest
  // wielokrotnością GRID=8, złamałoby grid_probe §11.2; y=8 jest najbliższą
  // wielokrotnością GRID w bboxie 24×24, wybór wizualnie równoważny).
  protectionRelay: def('protectionRelay', 24, 24, [
    { name: 'link', x: 0, y: 8, dir: 'W' },
  ], 'Przekaźnik zabezpieczeniowy'),
  // F9.9 (spec §17.1): miernik — okrąg 24×24 (3×GRID), TA SAMA średnica co
  // przekaźnik (§17.3 nie różnicuje gabarytu). Spec nie przewiduje rysowanej
  // linii do miernika (kotwiczenie WYŁĄCZNIE pozycją, §17.2 „okrąg M przy
  // przekładniku pomiarowym") — port `anchor` WYŁĄCZNIE dla spójności z
  // biblioteką (każdy symbol ma ≥1 port, `symbols/__tests__/symbols.test.tsx`
  // grid_probe), nieużywany przez routing/tor wyzwalania.
  meter: def('meter', 24, 24, [
    { name: 'anchor', x: 0, y: 8, dir: 'W' },
  ], 'Miernik'),
  // P0.8 nN — rozdzielnica nN (RGnN): symbol LIŚĆ zamykający odpływ, gdy jego
  // celem jest podrozdzielnica nN (`Substation.station_type==='rozdzielnica_nn'`)
  // — wzorzec DER (`derPv`/`derBess`/`derGenerator`): jeden port `top` (N),
  // symbol zawieszony POD odpływem, bez dalszej rekurencji w TEJ kompozycji
  // (klik `ownerRef` otwiera własny rekord podrozdzielnicy — jej WŁASNE
  // odpływy rysuje jej WŁASNA kompozycja, gdy stacja trafi na własny wiersz
  // sieci). Gabaryt 32×32 — TAKI SAM jak pozostałe symbole DER (odstępstwo od
  // tabeli spec §3 udokumentowane w nagłówku pliku: port centralny 12 px
  // (przy 24 px szerokości) nie leży na siatce GRID=8 — wyrocznia siatki jest
  // nadrzędna, więc symbol niesie ten sam gabaryt co reszta rodziny liści).
  nnDistributionBoard: def('nnDistributionBoard', 32, 32, [
    { name: 'top', x: 16, y: 0, dir: 'N' },
  ], 'Rozdzielnica nN'),
  // Wyłącznik nN / MCB (IEC 60898-1) — gabaryt IDENTYCZNY z `breaker` (16×16,
  // porty top/bottom) — obie rodziny stoją W TYM SAMYM torze pionowym
  // (odpływ nN), więc dzielą gabaryt jak `breaker`/`recloser`/`disconnector`
  // dzielą go po stronie SN. Rozróżnialność niesie GLIF (dźwignia modułowa),
  // nie gabaryt — patrz `glyphs.tsx` `NnBreakerGlyph`.
  nnBreaker: def('nnBreaker', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 16, dir: 'S' },
  ], 'Wyłącznik nN / MCB'),
  // Rozłącznik bezpiecznikowy nN — gabaryt 16×24 (JAK `disconnector`/
  // `earthSwitch`, NIE jak SN `fuseSwitch` 16×32: podstawa bezpiecznikowa nN
  // modułowa jest fizycznie krótsza niż rozłącznik z wkładką SN, który niesie
  // dodatkowo nóż otwierający nad wkładką). Sylwetka wkładki — kaseta
  // sześciokątna (`glyphs.tsx` `NnFuseSwitchGlyph`), odróżnialna od
  // prostokątnej wkładki SN.
  nnFuseSwitch: def('nnFuseSwitch', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Rozłącznik bezpiecznikowy nN'),
  // Licznik nN — miernik energii W TORZE odpływu (gabaryt 16×24 jak aparat
  // dwuportowy, W ODRÓŻNIENIU od SN `meter` 24×24 zakotwiczonego WYŁĄCZNIE
  // pozycją przy CT/VT, spec §17.2 — licznik nN nN STUDIO stoi NA torze
  // odpływu, nie obok niego, więc niesie ciągłość elektryczną).
  nnMeter: def('nnMeter', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Licznik nN'),
};

/**
 * K11-B (karta K11-B §0.2, dyrektywa właściciela z oceny ekranu 2/10 —
 * „minimalny rozmiar renderowania symboli"): PRÓG ROZPOZNAWALNOŚCI symbolu w
 * pikselach EKRANU.
 *
 * Odpowiednik `MIN_READABLE_LABEL_SCREEN_PX` (`core/text.ts`, 9 px) dla
 * rysunku aparatu. Wyższy niż próg pisma, bo aparat komunikuje TREŚĆ
 * KSZTAŁTEM (przerwa styku odłącznika, poprzeczka rozłącznika, prostokąt
 * wyłącznika — `symbols/glyphs.tsx`): pismo poniżej progu jest nieczytelne,
 * ale kształt poniżej progu jest MYLĄCY — odłącznik i wyłącznik zlewają się w
 * tę samą plamkę, a projektant czyta z rysunku aparat, którego tam nie ma.
 * 8 px = dwukrotność siatki GRID w skali 1:1; przy najmniejszym gabarycie
 * biblioteki (16 px świata) odpowiada skali 0,5.
 *
 * Egzekwowane STRUKTURALNIE przez progi LOD kamery (`canvas/camera.ts`
 * `DEFAULT_LOD_THRESHOLDS`), NIE przez skalowanie glifu: poniżej skali, przy
 * której aparat schodzi pod ten próg, kamera przełącza REPREZENTACJĘ na
 * zgrubniejszą (stacja jako mini-RMU 48 px zamiast rozwiniętych pól), zamiast
 * rysować ten sam glif mniejszy. Dowód: `canvas/__tests__/minSymbolSize.contract.test.ts`.
 */
export const MIN_SYMBOL_SCREEN_PX = 8;

/**
 * Najmniejszy gabaryt (min z szerokości i wysokości) w zbiorze symboli —
 * JEDNA prawda pomiaru dla progu wyżej i dla testu kontraktowego. Pusty zbiór
 * ⇒ `Infinity` (brak symboli nie jest naruszeniem progu).
 */
export function smallestSymbolExtent(ids: Iterable<SymbolId>): number {
  let min = Infinity;
  for (const id of ids) {
    const def = SYMBOL_DEFS[id];
    min = Math.min(min, def.width, def.height);
  }
  return min;
}

/** Szyna zbiorcza — długość z treści (P1), więc fabryka, nie stała definicja. */
export interface BusbarDef {
  readonly length: number;
  readonly ports: readonly SymbolPort[];
}

export function makeBusbarDef(length: number): BusbarDef {
  if (!isOnGrid(length) || length < 2 * GRID) {
    throw new Error(`Długość szyny musi być wielokrotnością GRID=${GRID} i ≥ ${2 * GRID}: ${length}`);
  }
  return {
    length,
    ports: [
      { name: 'left', x: 0, y: 0, dir: 'W' },
      { name: 'right', x: length, y: 0, dir: 'E' },
    ],
  };
}
