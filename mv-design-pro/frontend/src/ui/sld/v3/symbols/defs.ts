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

import { GRID, isOnGrid, type SymbolPort, type V3Rect } from '../core/grid';
import { QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../cad/qet/qetPoleSn';

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
  | 'lineSwitch'       // łącznik na torze poziomym (łącznik sekcyjny ciągu — nóż w osi toru)
  | 'lineBreaker'      // wyłącznik na torze poziomym (wyłącznik sekcyjny ciągu)
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
  | 'derUnknown'       // źródło nieokreślone (rodzaj nierozstrzygnięty w modelu)
  | 'bayNoEquipment'   // brak danych wyposażenia pola (sylwetka bez stanu, karta GEOMETRIA-STACJI)
  | 'bayReserve'       // zakończenie pola rezerwowego/wolnego (bez głowicy i odejścia)
  | 'gridSource'       // sieć zewnętrzna (Source ENM, F9.4 §13.1/§13.2)
  | 'stationCollapsed' // stacja SN/nN, widok zbiorczy (L0) — mini-RMU (sylwetka)
  | 'gpzCollapsed'     // GPZ (rozdzielnia zasilająca), widok zbiorczy (L0) — blok zwinięty (KD-5)
  | 'protectionRelay'  // F9.9: przekaźnik zabezpieczeniowy (okrąg + kody ANSI, §17.1)
  | 'meter'            // F9.9: miernik (okrąg „M"/litera wielkości, §17.1)
  | 'loadArrow'        // odbiór (strzałka IEC 60617) — projekcja nN (`lv-domain/`)
  | 'capacitorBank'    // bateria kondensatorów równoległych SN (UX-04/POLE-BKR-MODEL)
  // Aparaty nN — rodzina ODRĘBNA od aparatury SN (device_kind katalogu
  // APARAT_NN/APARAT_NN_MCB/WKLADKA_NN), bo fizyczne aparaty nN (MCB modułowy,
  // wkładka NH w podstawie bezpiecznikowej) mają INNĄ sylwetkę niż odpowiedniki
  // SN (`breaker`/`fuseSwitch`). Rysowane WYŁĄCZNIE w projekcji nN
  // (`lv-domain/composeLvDomainScene.ts`) — projekcja SN kończy tor na zacisku
  // nN transformatora i portalu (`lvPortal` niżej).
  | 'nnBreaker'        // wyłącznik nN / MCB (IEC 60898-1, namespace APARAT_NN_MCB
                        // + device_kind WYLACZNIK_GLOWNY/WYLACZNIK_ODPLYWOWY)
  | 'nnFuseSwitch'      // rozłącznik bezpiecznikowy nN (device_kind
                        // ROZLACZNIK_BEZPIECZNIKOWY / namespace WKLADKA_NN)
  // PORTAL DOMENY nN (architektura LV Domain Projection po B-02,
  // `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`): jawne przejście z projekcji SN do
  // projekcji nN, zakotwiczone na ZACISKU nN transformatora(-ów) stacji. Nie jest
  // aparatem toru mocy — jeden port `top`; za nim w projekcji SN nie ma nic,
  // tor ciągnie dalej projekcja nN.
  | 'lvPortal'
  // Karta UX-04/POLE-LINIOWE-WZORZEC: symbole pola liniowego SN wg EN 60617 z kolekcji
  // QElectroTech (wariant rysunku `render_variant = 'qet_en60617'` rekordu aparatu ENM).
  // Geometria i gabaryty WYŁĄCZNIE z pliku generowanego importerem
  // (`cad/qet/qetPoleSn.ts`, `scripts/import_qet_pole_sn.py`).
  | QetSymbolPolaSnId;

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
  ], 'Transformator dwuuzwojeniowy'),
  // UX-04/POLE-LINIOWE-WZORZEC: głowica jest aparatem dwuzaciskowym toru pola — zacisk
  // przewodu od strony aparatów (`top`, wierzchołek trójkąta) i zacisk kabla (`line`). Bez
  // zacisku górnego przewód port → port z portów ENM nie miał gdzie dojść i tor pola z portami
  // urywał się nad głowicą kanoniczną (głowica QET ma oba zaciski z importera).
  cableHead: def('cableHead', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'line', x: 8, y: 16, dir: 'S' },
  ], 'Głowica kablowa'),
  jointSleeve: def('jointSleeve', 16, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 16, y: 8, dir: 'E' },
  ], 'Mufa kablowa'),
  // Karta SLD-SUBSTRAT (kontynuacja): łącznik sekcyjny wstawiony NA ciąg
  // (`insert_section_switch_sn`) nie miał żadnego prymitywu — rysunek pokazywał
  // ciągły kabel tam, gdzie model ma łącznik (także otwarty punkt podziału w
  // odgałęzieniu). Tor ciągu biegnie poziomo, a glify aparatów pól są pionowe
  // (porty N/S), więc łącznik toru ma własny glif z portami W/E. Tor pionowy
  // (zejście) używa glifów pionowych `disconnector`/`breaker`.
  lineSwitch: def('lineSwitch', 32, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 32, y: 8, dir: 'E' },
  ], 'Łącznik na torze'),
  lineBreaker: def('lineBreaker', 16, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 16, y: 8, dir: 'E' },
  ], 'Wyłącznik na torze'),
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
  // GPZ-PARYTET cz. 2 (pkt 3): źródło, którego rodzaju model nie rozstrzyga — gabaryt i port
  // jak pozostałe DER, glif „?” w ramce (`glyphs.tsx`); nigdy PV ani generator z domysłu.
  derUnknown: def('derUnknown', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Źródło nieokreślone'),
  // GEOMETRIA-STACJI (§0 pkt 4c, dyrektywa właściciela 2026-10-21): pole, którego model nie
  // niesie ŻADNEGO rekordu aparatu (ani `Bay.primary_devices`, ani gałęzi łączeniowej
  // w `equipment_refs`), rysuje się JEDNĄ jawną sylwetką „brak danych wyposażenia pola"
  // zamiast stosu aparatów z konwencji. Sylwetka nie ma stanu (glif ignoruje `state`)
  // — kolor stanu bez rekordu byłby fabrykacją. Gabaryt 16×32 (2×4 GRID), porty N/S
  // w osi toru pola jak każdy aparat szeregowy.
  bayNoEquipment: def('bayNoEquipment', 16, 32, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 32, dir: 'S' },
  ], 'Brak danych wyposażenia pola'),
  // GEOMETRIA-STACJI (§0 pkt 5): zakończenie pola REZERWOWEGO (`bay_kind` „rezerwowe",
  // ten sam predykat co backend `enm/rodzaj_stacji.py`) albo pola WOLNEGO (pole liniowe,
  // do którego zacisku model nie przyłącza żadnego odcinka). Bez głowicy kablowej
  // i bez odejścia — JEDEN port N; za nim nic się nie przyłącza.
  bayReserve: def('bayReserve', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Pole rezerwowe (bez odejścia)'),
  // UX-04/POLE-BKR-MODEL: bateria kondensatorów równoległych SN (`ShuntCapacitor` ENM) na
  // końcu toru pola — element MODELU, którego pole jest nośnikiem (jak transformator pola TR),
  // nie aparat pola. JEDEN port N (za baterią nic się nie przyłącza). Gabaryt 32×40
  // (4×5 GRID): pas 0–16 kondensator (symbol ogólny PN-EN 60617-4 04-02-01), pas 16–40
  // znak układu połączeń (podwójna gwiazda z przekładnikiem niezrównoważenia, gwiazda
  // izolowana, gwiazda uziemiona, trójkąt) — glif `CapacitorBankGlyph`.
  capacitorBank: def('capacitorBank', 32, 40, [
    { name: 'top', x: 16, y: 0, dir: 'N' },
  ], 'Bateria kondensatorów'),
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
  // PORTAL DOMENY nN — odsyłacz „ciąg dalszy w projekcji nN" (chorągiewka
  // pięciokątna IEC 60617 skierowana W DÓŁ, w stronę domeny, do której
  // prowadzi). Gabaryt 32×24 (4×3 GRID): szerszy niż aparat jednokolumnowy, bo
  // niesie napis „nN" czytelny przy skali L1; JEDEN port `top` na osi (16,0) —
  // wisi pod zaciskiem nN (`compose/station.ts`, `#lv-portal-drop`), nic za nim
  // w projekcji SN. Klik w symbol otwiera projekcję nN stacji
  // (`canvas/SldCanvasV3Workspace.tsx`). Rozmiar zsynchronizowany z
  // `layout/measure.ts` (`LV_PORTAL_WIDTH`/`LV_PORTAL_HEIGHT`) testem spójności.
  lvPortal: def('lvPortal', 32, 24, [
    { name: 'top', x: 16, y: 0, dir: 'N' },
  ], 'Portal domeny nN'),
  ...definicjeSymboliQet(),
};

/** Definicje symboli QET pola liniowego SN — gabaryt i porty z pliku generowanego (bez
 *  ręcznego przepisania liczb: zmiana źródła QET zmienia definicję przez importer). */
function definicjeSymboliQet(): Record<QetSymbolPolaSnId, SymbolDef> {
  const wynik = {} as Record<QetSymbolPolaSnId, SymbolDef>;
  for (const id of Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]) {
    const q = QET_SYMBOLE_POLA_SN[id];
    wynik[id] = def(id, q.szerokosc, q.wysokosc, q.porty, `${q.namePl} (EN 60617)`);
  }
  return wynik;
}

/** Identyfikatory symboli QET pola liniowego SN (wariant rysunku `qet_en60617`). */
export const QET_SYMBOL_IDS: readonly QetSymbolPolaSnId[] = Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[];

export function czySymbolQet(id: SymbolId): id is QetSymbolPolaSnId {
  return Object.prototype.hasOwnProperty.call(QET_SYMBOLE_POLA_SN, id);
}

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — RODZAJ SEMANTYCZNY symbolu: symbol QET to INNY RYSUNEK
 * tego samego aparatu co symbol kanoniczny (wyłącznik QET jest wyłącznikiem), więc każda
 * reguła zależna od rodzaju aparatu (klucze parytetu, zbiory łączników, sondy CT/głowicy,
 * oznaczenia Q/QE/T) pyta o `rodzajSymbolu(id)`, a nie o sam identyfikator rysunku. Symbole
 * bez odpowiednika kanonicznego (łącznik trójpołożeniowy, przekładnik Ferrantiego) są
 * rodzajem samym w sobie. JEDNA tabela — reguła KLASA §3 (predykaty z jednego źródła).
 */
const RODZAJ_SEMANTYCZNY_QET: Readonly<Record<QetSymbolPolaSnId, SymbolId>> = {
  qetBreaker: 'breaker',
  qetDisconnector: 'disconnector',
  qetLoadBreakSwitch: 'loadBreakSwitch',
  qetFuseSwitch: 'fuseSwitch',
  qetEarthSwitch: 'earthSwitch',
  qetThreePositionSwitch: 'qetThreePositionSwitch',
  qetCurrentTransformer: 'currentTransformer',
  qetVoltageTransformer: 'voltageTransformer',
  qetCoreBalanceCt: 'qetCoreBalanceCt',
  qetCableHead: 'cableHead',
  qetVoltageIndicator: 'voltageIndicator',
};

export function rodzajSymbolu(id: SymbolId): SymbolId {
  return czySymbolQet(id) ? RODZAJ_SEMANTYCZNY_QET[id] : id;
}

/**
 * Obrys RYSUNKU symbolu względem lewego górnego rogu gabarytu — dla symboli QET obwiednia
 * wszystkich położeń noża i portów z importera (`obrys`), dla pozostałych pełny gabaryt.
 * Kafel stanu łącznika (`prostokatKaflaStanu`) i sondy kolizji kafli liczą się z TEGO
 * obrysu (jedno źródło).
 */
export function obrysSymbolu(id: SymbolId): V3Rect {
  if (czySymbolQet(id)) return QET_SYMBOLE_POLA_SN[id].obrys;
  const d = SYMBOL_DEFS[id];
  return { x: 0, y: 0, width: d.width, height: d.height };
}

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

/**
 * APARATY CIĄGŁOŚCI ELEKTRYCZNEJ — łączniki, którymi tor da się przerwać.
 * To one odpowiadają na pytanie „czym to odcinam", więc ich zniknięcie z
 * rysunku jest utratą informacji, nie uproszczeniem.
 */
export const CONTINUITY_APPARATUS_SYMBOL_IDS: readonly SymbolId[] = [
  // Karta UX-04/POLE-LINIOWE-WZORZEC: rysunek QET tego samego łącznika stoi TUŻ za
  // kanonicznym (kolejność = pierwszeństwo aparatu ciągłości pola na L0: wyłącznik przed
  // rozłącznikiem i odłącznikiem); łącznik trójpołożeniowy toru po wszystkich
  // dwupołożeniowych (pole z wyłącznikiem pokazuje na L0 wyłącznik).
  'breaker',
  'qetBreaker',
  'disconnector',
  'qetDisconnector',
  'loadBreakSwitch',
  'qetLoadBreakSwitch',
  'fuseSwitch',
  'qetFuseSwitch',
  'qetThreePositionSwitch',
  'noPoint',
  'lineSwitch',
  'lineBreaker',
];

/**
 * Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC (referencja HMI 2026-10-29) — ŁĄCZNIKI
 * Z POŁOŻENIEM: każdy symbol, którego geometria styku wyraża położenie (zamknięty / otwarty /
 * nieustalony, a dla łącznika trójpołożeniowego także uziemiony). Tylko te symbole dostają
 * KAFEL STANU (`symbols/glyphs.tsx` `KafelStanu`) — kolor kafla nigdy nie jest jedynym
 * nośnikiem stanu, więc symbol bez geometrii położenia kafla nie dostaje.
 *
 * Skład: aparaty ciągłości (`CONTINUITY_APPARATUS_SYMBOL_IDS`, łącznie z punktem normalnie
 * otwartym `noPoint`, który rysuje położenie łącznika NOP) + uziemniki (`earthSwitch`,
 * `qetEarthSwitch` — boczna gałąź do ziemi, poza torem ciągłości) + reklozer i wyłącznik nN
 * (korpus wyłącznika z wypełnieniem = położeniem).
 *
 * Świadomie POZA zbiorem: `fuse` (bezpiecznik sam — nie jest łącznikiem sterowanym, glif
 * celowo nie ma położenia) i `nnFuseSwitch` (podstawa bezpiecznikowa nN bez noża — glif nie
 * ma geometrii położenia; żadna scena go dziś nie emituje). Przypina to test parytetu
 * `symbols/__tests__/kafelStanu.test.tsx`.
 */
export const SYMBOLE_LACZNIKOW_Z_POLOZENIEM: readonly SymbolId[] = [
  ...CONTINUITY_APPARATUS_SYMBOL_IDS,
  'earthSwitch',
  'qetEarthSwitch',
  'recloser',
  'nnBreaker',
];

const ZBIOR_LACZNIKOW_Z_POLOZENIEM: ReadonlySet<SymbolId> = new Set(SYMBOLE_LACZNIKOW_Z_POLOZENIEM);

/** Czy symbol rysuje położenie łącznika (patrz `SYMBOLE_LACZNIKOW_Z_POLOZENIEM`). */
export function czyLacznikZPolozeniem(id: SymbolId): boolean {
  return ZBIOR_LACZNIKOW_Z_POLOZENIEM.has(id);
}
