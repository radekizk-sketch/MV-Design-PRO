/**
 * SLD V3 — glify symboli IEC 60617 (SLD_CAD_SPEC_V3 §3, §6).
 *
 * Rysunek BAZOWY: neutralny kolor, czytelny w mono (P5). Stan łącznika
 * wyrażony GEOMETRIĄ (wypełnienie CB, kąt noża DS). Na kanwie i w eksporcie łącznik
 * z położeniem dostaje dodatkowo KAFEL STANU (`KafelStanu`, referencja HMI
 * 2026-10-29): wypełniony kafel pod symbolem w konwencji dyspozytorskiej (czerwony =
 * zamknięty, zielony = otwarty, szary z „?" = nieustalony, fioletowy z „!" = awaria),
 * biały symbol na kaflu. Kolor nigdy nie jest jedynym nośnikiem stanu — geometria styku
 * zostaje. Nakładki energizacji i napięcia nakłada kanwa na tory; na łącznik z kaflem
 * nie wpływają (warstwa stanu łączeniowego jest rozdzielna od warstwy napięcia).
 * Origin glifu = lewy-górny róg bboxa z SYMBOL_DEFS (porty pasują 1:1).
 */

import { SYMBOL_DEFS, czyLacznikZPolozeniem, obrysSymbolu, type SymbolId } from './defs';
import { CadPrimitiveLayer } from '../cad/CadSymbol';
import { QET_SYMBOLE_POLA_SN, type QetPolozenieNoza, type QetSymbolPolaSnId } from '../cad/qet/qetPoleSn';
import { BASE_STROKE, type KafleStanuLacznika, type StanKafla } from '../theme/colorTokens';
import { MINI_RMU, MINI_GPZ, DER_MARKER_SHAPE, type MiniRmuLineTopology, type StationDerGlyphKind } from './miniRmuGrammar';
import type { RodzajUzwojenia, Uzwojenie, UzwojeniaTransformatora } from './uzwojenia';
import type { UkladPolaczenBaterii } from '../../../../types/enm';
import { PORTY_APARATU_POLA, RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA } from '../compose/rodzajeAparatuPola';
import { OPIS_POLOZENIA_PL } from '../../v2/model/stanAparatowPola';

/** SCHEMAT-10 S3 (V12K-135): wartość TERAZ z `theme/colorTokens.ts`
 *  (`BASE_STROKE`) — JEDNO źródło prawdy, ta sama wartość co dotąd, zero
 *  zmiany zachowania. Re-eksport zachowuje istniejący import w `SldCanvasV3.tsx`. */
export const V3_STROKE_BASE = BASE_STROKE;
export const V3_STROKE_APPARATUS = 1.2;

/** Położenie łącznika na rysunku. `'earthed'` (uziemiony) — WYŁĄCZNIE łącznik
 *  trójpołożeniowy (karta UX-04/POLE-LINIOWE-WZORZEC, ENEA Zeszyt 1 §13): nóż na zestyku
 *  uziemiającym; tor pola jest wtedy OTWARTY. Pozostałe glify rysują go jak `unknown`.
 *  `'bad'` — rekord aparatu zgłasza AWARIĘ (`BayDeviceState` „awaria"): położenie
 *  niewiarygodne, odpowiednik „bad-state" podwójnego wskazania położenia IEC 61850-7-4
 *  (Dbpos). Geometria jak `unknown`, kafel własny (`bledny`). Położenia pośredniego
 *  (Dbpos „intermediate") model ENM nie niesie, więc go tu nie ma. */
export type SwitchState = 'closed' | 'open' | 'unknown' | 'earthed' | 'bad';

/** Margines kafla stanu wokół obrysu symbolu [px świata]. */
export const KAFEL_STANU_MARGINES = 2;

/** Położenie rysowane przez geometrię glifu kanonicznego (dwupołożeniowego): `earthed`
 *  (nie jest położeniem tych aparatów), `bad` i brak danej rysują się jako nieustalone —
 *  nigdy jako zamknięte albo otwarte z domysłu. */
export function polozenieGeometrii(state: SwitchState | undefined): 'closed' | 'open' | 'unknown' {
  return state === 'closed' || state === 'open' ? state : 'unknown';
}

/** SCHEMAT-10 GS-1/GS-2 (V12K-137): rodzaj DER niesiony przez sylwetkę mini-RMU
 *  na L0. Źródło definicji = `miniRmuGrammar.ts` (gramatyka konstrukcyjna),
 *  re-eksport tu zachowuje istniejące importy; `'unknown'` mapuje wołający na
 *  `'generator'` (glif generyczny, jak `DER_SOURCE_KIND_SYMBOL`). */
export type { StationDerGlyphKind } from './miniRmuGrammar';

export interface GlyphProps {
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  /**
   * PROPORCJE (zgłoszenie właściciela 2026-08-07 „brak proporcji, grubości")
   * — MNOŻNIK WAGI KRESKI glifu, ten sam, którym S9-8 wzmacnia tory
   * (`compose/preview.tsx` `strokeScaleFactor`). Brak ⇒ 1, czyli rysunek
   * DOKŁADNIE jak przed kartą (harness kompozycji, miniatury paneli,
   * eksport bez kamery).
   *
   * DLACZEGO GLIF GO PRZYJMUJE, A NIE LICZY. Kompensacja zależy od SKALI
   * KAMERY, której glif nie zna i znać nie powinien (ta sama granica, dla
   * której plan etykiet mieszka w warstwie renderu, a nie w scenie). Kanwa
   * podaje gotową liczbę; dwie kopie formuły — jedna dla torów, druga dla
   * glifów — rozjechałyby się przy pierwszej zmianie progu (reguła KLASA §3).
   *
   * PRZED tą kartą glify rysowały się stałą ŚWIATA bez żadnej kompensacji,
   * więc przy kadrze „Dopasuj widok" (skala 0,133) szyna miała na ekranie
   * 2,50 px, a kreska aparatu 0,16 px — stosunek 15,70× zamiast projektowych
   * 3,33× (pomiar `scripts/pomiar_proporcje.tsx`).
   */
  readonly strokeScale?: number;
  /** Rodzaj uziemienia punktu neutralnego (V12K-219) — WYŁĄCZNIE dla glifu
   *  `neutralEarthing`; pozostałe glify go ignorują (wspólny `GlyphProps`). */
  readonly earthingKind?: 'resistor' | 'coil' | 'direct' | 'isolated';
  /** Nadpisanie koloru bazowego (nakładka napięcia na szynach itd.). */
  readonly stroke?: string;
  /** F9.9 (spec §17.3): kody funkcji przekaźnika (np. ["50/51","51N"], maks.
   *  2 linie) — WYŁĄCZNIE `ProtectionRelayGlyph` czyta to pole, pozostałe
   *  glify je ignorują (wspólny `GlyphProps`, jak `state`, zero rozgałęzień
   *  sygnatury per symbol). */
  readonly labelLines?: readonly string[];
  /** F10.5 (spec §20.2): `true` gdy przekaźnik ma nierozstrzygnięty
   *  prerekwizyt topologiczny funkcji (67N⇒VT/87T⇒TR/51N⇒I0) —
   *  WYŁĄCZNIE `ProtectionRelayGlyph` czyta to pole (jak `labelLines`).
   *  Rysuje MAŁY badge „!" w rogu okręgu (geometria WEWNĄTRZ 24×24 bboxa,
   *  zero nowej rezerwacji width/height w `layout/measure.ts` — §20.3
   *  „warstwa zabezpieczeń zwarta, nie zasłania toru pierwotnego"). Treść
   *  ostrzeżenia (np. „67N: brak VT") żyje w `missingData`/inspektorze, NIE
   *  na scenie jako tekst — glif niesie WYŁĄCZNIE sygnał obecności. */
  readonly hasTopologyWarning?: boolean;
  /** TR2W-BEZ-POLA (§0.C.5): `true` gdy transformator SN/nN wisi na szynie SN
   *  BEZ skonfigurowanego pola transformatorowego — WYŁĄCZNIE
   *  `Transformer2WGlyph` czyta to pole (jak `labelLines`/`hasTopologyWarning`
   *  dla przekaźnika). Rysuje MAŁY marker „!" w narożniku strony WN (geometria
   *  WEWNĄTRZ bboxa 32×40, w polu wolnym od okręgów uzwojeń — zero nowej
   *  rezerwacji width/height w `layout/measure.ts`). Symbol transformatora
   *  POZOSTAJE symbolem transformatora: marker jest ADNOTACJĄ stanu danych, nie
   *  podmianą na symbol błędu. Pełne zdanie („Brak skonfigurowanego pola
   *  transformatorowego SN") niesie pasmo nazw stacji i `stopNotes` sceny. */
  readonly hasFieldGapWarning?: boolean;
  /** Recenzja NO-GO 2026-07-17 pkt 11: litera mierzonej WIELKOŚCI miernika
   *  (A = prąd z CT, V = napięcie z VT) — WYŁĄCZNIE `MeterGlyph` czyta to
   *  pole (wzorzec `labelLines`). Brak danych ⇒ fallback „M" (rozstrzygany
   *  wpisem legendy arkusza). */
  readonly meterQuantity?: 'A' | 'V';
  /** SCHEMAT-10 GS-1 (V12K-137, GAP §10.4): stacja SEKCYJNA (sprzęgło w
   *  topologii, rodzaj z `ui/shared/rodzajStacji.ts`) — WYŁĄCZNIE `Station
   *  CollapsedGlyph` rysuje przerwę sekcyjną na szynie (wzór `labelLines`).
   *  Rodzaj stacji (SN/nN · rozdzielnia sieciowa · sekcyjna) WYPROWADZONY z
   *  TYPU elementów, nie z nazw (spec §19.3). */
  readonly stationSectioned?: boolean;
  /** GS-1: stacja SN/nN z transformatorem (`Substation.hasTransformer`/
   *  `transformerRatedKva`) — mini-glif TR zwieszony pod szyną. Odróżnia
   *  stację transformatorową od rozdzielni sieciowej (bez TR). */
  readonly stationHasTransformer?: boolean;
  /** GS-4 (recenzja 2026-07-23; baza GS-1 §10.4): dominujący rodzaj DER
   *  przyłączonego do SZYNY SN stacji — pole DER nad szyną (`poleDer`).
   *  `null`/brak = zero DER na SN. Pozycja symbolu DER wynika z RZECZYWISTEGO
   *  miejsca przyłączenia (nie z samego faktu obecności). */
  readonly stationDerOnMv?: StationDerGlyphKind | null;
  /** GS-4: dominujący rodzaj DER ZA TRANSFORMATOREM (strona nN) — znak przy
   *  gałęzi pola TR PONIŻEJ uzwojeń (`poleTr.derNn`, INNA kotwica niż DER na
   *  SN). Wymaga `stationHasTransformer` (bez TR nie istnieje strona nN —
   *  sprzeczność raportuje `buildScene`, glif jej nie rysuje). NIEZALEŻNE od
   *  `stationDerOnMv` — oba mogą wystąpić naraz. */
  readonly stationDerBehindTr?: StationDerGlyphKind | null;
  /** GS-1: stacja niesie punkt/łącznik NORMALNIE OTWARTY (`Substation.isNop`)
   *  — marker otwartego łącznika na szynie (odróżnialny od zamkniętego). */
  readonly stationNoOpen?: boolean;
  /** GS-5 (uwaga właściciela 2026-07-23: „render zakłada, że większość stacji
   *  to przelotowe, a w realnej sieci to końcowe z odgałęzień"): topologia
   *  pól liniowych sylwetki z REALNEJ roli stacji w ciągu (spec §19.3 +
   *  prezentacja stacji ostatniej w ciągu): `'końcowa'` = TYLKO pole WE,
   *  szyna kończy się w rozdzielnicy (zero fantomowego toru na wylot);
   *  `'przelotowa'` = dwa pola (zachowanie dotychczasowe = default dla
   *  wołających bez podsumowania); `'odgałęźna'` = dwa pola + węzeł
   *  odgałęzienia na szynie (kabel zejścia rysuje scena; pełne pole
   *  odgałęźne od L1 — uzasadnienie przestrzenne w `miniRmuGrammar.ts`). */
  readonly stationLineTopology?: MiniRmuLineTopology;
  /** KD-5: liczba SEKCJI szyn SN bloku GPZ — WYŁĄCZNIE `GpzCollapsedGlyph`
   *  (wzór `stationSectioned`). >1 ⇒ sprzęgło sekcyjne w sylwetce. */
  readonly gpzSections?: number;
  /** KD-5: liczba transformatorów WN/SN bloku GPZ — 0 ⇒ sylwetka bez uzwojeń
   *  (uczciwy obraz danych: GPZ bez TR w modelu nie dostaje fantomowego TR). */
  readonly gpzTransformers?: number;
  /** KD-5: liczba PÓL ODEJŚCIOWYCH (liniowych) SN bloku GPZ — rysowanych do
   *  `MINI_GPZ.polaOdejsciowe.xs.length` (uzasadnienie limitu tamże). */
  readonly gpzFeeders?: number;
  /** Karta GPZ-PARYTET (§0 pkt 2): oznaczenie uzwojeń z grupy połączeń modelu —
   *  WYŁĄCZNIE `Transformer2WGlyph`. `undefined` = wołający nie rozwiązuje grupy dla
   *  tego symbolu (glif bez oznaczenia, jak przed kartą); `stan: 'brak'` /
   *  `'nierozpoznane'` = jawny znak „?" w obu okręgach uzwojeń. */
  readonly uzwojenia?: UzwojeniaTransformatora;
  /** Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC: kolory kafla stanu (`SldPalette.state`,
   *  JEDNA tabela `STATE_COLOR`). Podane = łącznik z położeniem (`czyLacznikZPolozeniem`)
   *  rysuje się na kaflu stanu; brak = sam symbol (legenda, podgląd kreatora, harness mono). */
  readonly kafleStanu?: KafleStanuLacznika;
  /** UX-04/POLE-BKR-MODEL: dane baterii kondensatorów z modelu — WYŁĄCZNIE
   *  `CapacitorBankGlyph` (układ połączeń i obecność rekordu przekładnika niezrównoważenia
   *  pola). `undefined`/`uklad: null` = model nie deklaruje układu (znak „?"). */
  readonly bateria?: GlifBaterii;
}

/** Dane glifu baterii kondensatorów (`v2/model/bateriaPola.ts BateriaPolaView` bez refu). */
export interface GlifBaterii {
  readonly uklad: UkladPolaczenBaterii | null;
  readonly przekladnikNiezrownowazenia: boolean;
}

function glyphGroupProps(id: SymbolId, props: GlyphProps) {
  return {
    'data-symbol-canon': id,
    'data-switch-state': props.state,
    transform: `translate(${props.x}, ${props.y})`,
  } as const;
}

function stroke(props: GlyphProps): string {
  return props.stroke ?? V3_STROKE_BASE;
}

/**
 * PROPORCJE — WAGA KRESKI glifu [px ŚWIATA] po kompensacji ekranowej.
 * JEDYNE wejście po `strokeWidth` w tym pliku: KAŻDA kreska glifu (obrys
 * aparatu, kreski wnętrza sylwetek, znaki DER) przechodzi przez tę funkcję,
 * żeby wzmocnienie było JEDNORODNE — obrys wzmocniony przy nietkniętym
 * wnętrzu dałby glif rozjeżdżający się przy oddaleniu (reguła KLASA §5:
 * ten sam wzorzec w sąsiedniej funkcji tego samego pliku to ten sam defekt).
 */
function grubosc(props: GlyphProps, base: number): number {
  const k = props.strokeScale;
  return Number.isFinite(k) && (k as number) > 0 ? base * (k as number) : base;
}

/** PROPORCJE — ten sam mnożnik nałożony na CAŁY rekord wag sylwetki zwiniętej
 *  (`MINI_RMU.stroke` / `MINI_GPZ.stroke`: tor, szyna, marker, obrys).
 *  Jednorodnie, jednym przebiegiem — wzmocnienie samego toru przy nietkniętym
 *  obrysie zmieniłoby WEWNĘTRZNE proporcje sylwetki, a nie tylko jej wagę
 *  wobec reszty rysunku. */
function skalujWagi<T extends Readonly<Record<string, number>>>(props: GlyphProps, wagi: T): T {
  const wynik: Record<string, number> = {};
  for (const klucz of Object.keys(wagi)) wynik[klucz] = grubosc(props, wagi[klucz]);
  return wynik as unknown as T;
}

export function BreakerGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  return (
    <g {...glyphGroupProps('breaker', props)}>
      <rect
        x={2} y={2} width={12} height={12}
        fill={state === 'closed' ? stroke(props) : 'none'}
        fillOpacity={state === 'unknown' ? 0.35 : 1}
        stroke={stroke(props)}
        strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
      />
      <line x1={8} y1={0} x2={8} y2={2} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={14} x2={8} y2={16} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/**
 * MINI-RMU-CAD: REKLOZER — korpus wyłącznika (ta sama geometria styku co
 * `BreakerGlyph`, bo reklozer JEST wyłącznikiem) + ŁUK automatyki samoczynnego
 * ponownego załączenia nad korpusem. Parytet z `canonical_symbols/auto_recloser.svg`
 * (biblioteka kanoniczna v1): korpus + łuk ze strzałką; tor przechodzi przez
 * łuk, dokładnie jak tam.
 *
 * DLACZEGO BEZ NAPISU „79". Symbol kanoniczny v1 ma numer funkcji ANSI wpisany
 * w rysunek, ale przy gabarycie 16×24 px świata pismo miałoby ~4 px — poniżej
 * progu czytelności `MIN_READABLE_LABEL_SCREEN_PX` (`core/text.ts`, 9 px) przy
 * skali 1:1, więc byłaby to plama, nie informacja. Rozróżnialność niesie ŁUK
 * (kształt), zgodnie z zasadą biblioteki: treść wyrażona geometrią, nie kolorem
 * ani mikropismem. Kody funkcji zabezpieczeniowych mają własny nośnik
 * (`ProtectionRelayGlyph`, 24×24 z `labelLines`).
 */
export function RecloserGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  const w = grubosc(props, V3_STROKE_APPARATUS);
  return (
    <g {...glyphGroupProps('recloser', props)}>
      {/* Łuk SPZ: półokrąg nad korpusem, strzałka na końcu (kierunek powrotu). */}
      <path d="M 3 7 A 5 5 0 0 1 13 7" fill="none" stroke={stroke(props)} strokeWidth={w} data-recloser-arc="true" />
      <path d="M 13 7 L 11 4.6 M 13 7 L 15.4 5.4" fill="none" stroke={stroke(props)} strokeWidth={w} />
      <line x1={8} y1={0} x2={8} y2={8} stroke={stroke(props)} strokeWidth={w} />
      <rect
        x={2} y={8} width={12} height={12}
        fill={state === 'closed' ? stroke(props) : 'none'}
        fillOpacity={state === 'unknown' ? 0.35 : 1}
        stroke={stroke(props)}
        strokeWidth={w}
      />
      <line x1={8} y1={20} x2={8} y2={24} stroke={stroke(props)} strokeWidth={w} />
    </g>
  );
}

export function DisconnectorGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  // Nóż: zamknięty = w osi toru; otwarty = odchylony 45° (IEC 60617-7).
  const bladeEnd = state === 'open' ? { x: 15, y: 12 } : { x: 8, y: 18 };
  return (
    <g {...glyphGroupProps('disconnector', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line
        x1={8} y1={6} x2={bladeEnd.x} y2={bladeEnd.y}
        stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        strokeDasharray={state === 'unknown' ? '3 2' : undefined}
      />
      <line x1={4} y1={18} x2={12} y2={18} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={18} x2={8} y2={24} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/** Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): ROZŁĄCZNIK (łącznik
 *  obciążeniowy, IEC 60617 switch-disconnector) — geometria odłącznika +
 *  POPRZECZKA na końcu styku ruchomego (cecha odróżniająca zdolność
 *  łączenia pod obciążeniem). Stan z geometrii noża jak `DisconnectorGlyph`. */
export function LoadBreakSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  const bladeEnd = state === 'open' ? { x: 15, y: 12 } : { x: 8, y: 18 };
  return (
    <g {...glyphGroupProps('loadBreakSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      {/* Poprzeczka rozłącznika: krótka kreska PROSTOPADŁA do noża na jego
          swobodnym końcu (IEC 60617 S00504) — obraca się razem z nożem. */}
      {state === 'open' ? (
        <line x1={13} y1={9} x2={17} y2={15} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      ) : (
        <line x1={4} y1={14} x2={12} y2={14} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      )}
      <line
        x1={8} y1={6} x2={bladeEnd.x} y2={bladeEnd.y}
        stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        strokeDasharray={state === 'unknown' ? '3 2' : undefined}
      />
      <line x1={4} y1={18} x2={12} y2={18} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={18} x2={8} y2={24} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/** Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5): zagregowany ODBIÓR —
 *  strzałka odbioru (IEC 60617): pion od portu N + grot w dół. */
export function LoadArrowGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('loadArrow', props)}>
      <line x1={8} y1={0} x2={8} y2={10} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <path d="M 3 10 L 13 10 L 8 16 Z" fill={stroke(props)} stroke="none" />
    </g>
  );
}

/** Uziemnik: nóż zamknięty = w osi do ziemi, otwarty = odchylony, nieustalony = nóż
 *  przerywany w osi (jak `DisconnectorGlyph`). Rozszerzenie 5: dawny domysł „brak danej =
 *  otwarty" usunięty — uziemnik bez stanu w modelu jest NIEUSTALONY, nie otwarty. */
export function EarthSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  const bladeEnd = state === 'open' ? { x: 15, y: 10 } : { x: 8, y: 14 };
  return (
    <g {...glyphGroupProps('earthSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={4} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line
        x1={8} y1={4} x2={bladeEnd.x} y2={bladeEnd.y}
        stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        strokeDasharray={state === 'unknown' ? '3 2' : undefined}
      />
      <line x1={8} y1={14} x2={8} y2={17} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      {/* ⏚ IEC: trzy malejące kreski */}
      <line x1={2} y1={17} x2={14} y2={17} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={4} y1={20} x2={12} y2={20} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={6} y1={23} x2={10} y2={23} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/**
 * Punkt neutralny sieci — sposób jego pracy rozstrzyga o prądzie zwarcia
 * doziemnego, a przez to o czułości zabezpieczeń ziemnozwarciowych i o
 * napięciach dotykowych na uziomach (PN-EN 50522). Wariant bierze się z
 * `earthingKind` (dana modelu, zero domysłu):
 *
 *  • `resistor`  — prostokąt rezystora; prąd ograniczony do `U_f/R`,
 *  • `coil`      — cewka (dławik gaszący/Petersena); kompensuje prąd
 *                  pojemnościowy sieci, zostaje prąd resztkowy,
 *  • `direct`    — samo połączenie z uziomem; prąd rzędu zwarcia trójfazowego,
 *  • `isolated`  — PRZERWA w torze do uziomu (kreska urwana): sieć izolowana,
 *                  prąd doziemny płynie wyłącznie przez pojemności doziemne.
 *
 * Symbol uziomu (trzy malejące kreski) jest wspólny dla wszystkich wariantów
 * poza izolowanym — tam zostaje, ale tor jest przerwany, co jest istotą tej
 * konfiguracji i musi być widoczne na pierwszy rzut oka.
 */
export function NeutralEarthingGlyph(props: GlyphProps): JSX.Element {
  const kind = props.earthingKind ?? 'direct';
  const izolowana = kind === 'isolated';
  return (
    <g {...glyphGroupProps('neutralEarthing', props)} data-earthing-kind={kind}>
      {/* Zejście od szyny do aparatu; przy sieci izolowanej krótsze — tor jest
          przerwany celowo, nie z braku miejsca. */}
      <line
        x1={8}
        y1={0}
        x2={8}
        y2={izolowana ? 5 : 8}
        stroke={stroke(props)}
        strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
      />
      {kind === 'resistor' && (
        <rect
          x={4}
          y={8}
          width={8}
          height={10}
          fill="none"
          stroke={stroke(props)}
          strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        />
      )}
      {kind === 'coil' && (
        <path
          d="M 8 8 q 5 2.5 0 5 q -5 2.5 0 5"
          fill="none"
          stroke={stroke(props)}
          strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        />
      )}
      {!izolowana && (
        <line x1={8} y1={18} x2={8} y2={21} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      )}
      <line x1={2} y1={21} x2={14} y2={21} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={4} y1={25} x2={12} y2={25} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={6} y1={29} x2={10} y2={29} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/** Rozłącznik bezpiecznikowy SN. Rozszerzenie 5: dawny domysł „brak danej = zamknięty"
 *  usunięty — bez stanu w modelu nóż jest przerywany (nieustalony). */
export function FuseSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  return (
    <g {...glyphGroupProps('fuseSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      {state === 'open'
        ? <line x1={8} y1={6} x2={15} y2={12} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
        : (
          <line
            x1={8} y1={6} x2={8} y2={10}
            stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
            strokeDasharray={state === 'unknown' ? '1.5 1' : undefined}
          />
        )}
      {/* wkładka bezpiecznikowa: prostokąt z żyłą */}
      <rect x={5} y={10} width={6} height={12} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={10} x2={8} y2={22} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={22} x2={8} y2={32} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/**
 * SLD-GEN-POLA — BEZPIECZNIK SAM (IEC 60617 S00289): prostokątna wkładka z żyłą
 * przechodzącą na wylot. Bez styku ruchomego — to odróżnia go od `fuseSwitch`
 * (rozłącznik Z bezpiecznikiem), który ma nad wkładką styk otwierany.
 * `state` NIE zmienia rysunku: bezpiecznik nie jest łącznikiem sterowanym —
 * przepalenie wkładki to zdarzenie eksploatacyjne, nie stan łącznika. Milczące
 * przyjęcie „closed" narysowałoby stan, którego ten aparat nie ma.
 */
export function FuseGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('fuse', props)}>
      <line x1={8} y1={0} x2={8} y2={4} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <rect x={4} y={4} width={8} height={16} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={4} x2={8} y2={20} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={20} x2={8} y2={24} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/**
 * SLD-GEN-POLA — WSKAŹNIK OBECNOŚCI NAPIĘCIA (VPIS): trzy lampki sygnalizacyjne
 * (po jednej na fazę) na wspólnym zaczepie. Sygnalizacja, nie aparat toru mocy —
 * dlatego rysunek kończy się na lampkach (jeden port, brak wyjścia w dół).
 */
export function VoltageIndicatorGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('voltageIndicator', props)}>
      <line x1={8} y1={0} x2={8} y2={5} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={2} y1={5} x2={14} y2={5} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={3} cy={9} r={2.6} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={8} cy={9} r={2.6} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={13} cy={9} r={2.6} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/** Środki znaków uzwojeń — w części okręgu WOLNEJ od drugiego okręgu (okręgi r=11
 *  wokół (16,13) i (16,27) zachodzą na siebie w pasie y 16…24). */
const ZNAK_UZWOJENIA_GORNEGO = { x: 16, y: 9 } as const;
const ZNAK_UZWOJENIA_DOLNEGO = { x: 16, y: 31 } as const;
/** Promień znaku uzwojenia (trójkąt/gwiazda/zygzak) — mieści się w okręgu r=11. */
const ZNAK_UZWOJENIA_R = 4.5;

function znakRodzajuUzwojenia(rodzaj: RodzajUzwojenia, c: { x: number; y: number }): string {
  const r = ZNAK_UZWOJENIA_R;
  // Współrzędne zaokrąglone do 0,01 — zapis ścieżki deterministyczny i krótki.
  const f = (v: number): number => Math.round(v * 100) / 100;
  const p = (kat: number, d: number, od = c) => ({ x: f(od.x + d * Math.cos(kat)), y: f(od.y + d * Math.sin(kat)) });
  // Ramiona gwiazdy/zygzaka i wierzchołki trójkąta: góra, prawo-dół, lewo-dół.
  const katy = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  if (rodzaj === 'trojkat') {
    const [a, b, d] = katy.map((kat) => p(kat, r));
    return `M${a.x},${a.y} L${b.x},${b.y} L${d.x},${d.y} Z`;
  }
  if (rodzaj === 'gwiazda') {
    return katy.map((kat) => { const k = p(kat, r); return `M${c.x},${c.y} L${k.x},${k.y}`; }).join(' ');
  }
  // Zygzak (IEC 60617-6): ramię gwiazdy załamane w połowie długości o 60°.
  return katy
    .map((kat) => {
      const pol = p(kat, r / 2);
      const koniec = p(kat + Math.PI / 3, r / 2, pol);
      return `M${c.x},${c.y} L${pol.x},${pol.y} L${koniec.x},${koniec.y}`;
    })
    .join(' ');
}

function ZnakUzwojenia(props: {
  readonly uzwojenie: Uzwojenie;
  readonly c: { x: number; y: number };
  readonly strona: 'gorne' | 'dolne';
  readonly glif: GlyphProps;
}): JSX.Element {
  const { uzwojenie, c, strona, glif } = props;
  const sw = grubosc(glif, 1);
  return (
    <g
      data-uzwojenie={strona}
      data-uzwojenie-rodzaj={uzwojenie.rodzaj}
      data-uzwojenie-neutralny={uzwojenie.punktNeutralny ? 'true' : 'false'}
    >
      <path d={znakRodzajuUzwojenia(uzwojenie.rodzaj, c)} fill="none" stroke={stroke(glif)} strokeWidth={sw} />
      {uzwojenie.punktNeutralny && (
        <g data-uzwojenie-punkt-neutralny="true">
          <line x1={c.x} y1={c.y} x2={c.x + ZNAK_UZWOJENIA_R + 1} y2={c.y} stroke={stroke(glif)} strokeWidth={sw} />
          <circle cx={c.x + ZNAK_UZWOJENIA_R + 1} cy={c.y} r={1.1} fill={stroke(glif)} />
        </g>
      )}
    </g>
  );
}

function BrakUzwojenia(props: { readonly c: { x: number; y: number }; readonly strona: 'gorne' | 'dolne'; readonly glif: GlyphProps }): JSX.Element {
  return (
    <text
      data-uzwojenie={props.strona}
      data-uzwojenie-rodzaj="brak"
      x={props.c.x}
      y={props.c.y + 4.5}
      textAnchor="middle"
      fill={stroke(props.glif)}
      fontFamily="sans-serif"
      fontSize={13}
      fontWeight={700}
    >
      ?
    </text>
  );
}

function OznaczenieUzwojen(props: { readonly glif: GlyphProps }): JSX.Element | null {
  const u = props.glif.uzwojenia;
  if (!u) return null;
  if (u.stan !== 'znane') {
    return (
      <g data-uzwojenia-stan={u.stan}>
        <BrakUzwojenia c={ZNAK_UZWOJENIA_GORNEGO} strona="gorne" glif={props.glif} />
        <BrakUzwojenia c={ZNAK_UZWOJENIA_DOLNEGO} strona="dolne" glif={props.glif} />
      </g>
    );
  }
  return (
    <g data-uzwojenia-stan="znane" data-uzwojenia-godzina={u.godzina}>
      <ZnakUzwojenia uzwojenie={u.gorne} c={ZNAK_UZWOJENIA_GORNEGO} strona="gorne" glif={props.glif} />
      <ZnakUzwojenia uzwojenie={u.dolne} c={ZNAK_UZWOJENIA_DOLNEGO} strona="dolne" glif={props.glif} />
    </g>
  );
}

export function Transformer2WGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('transformer2W', props)}>
      <line x1={16} y1={0} x2={16} y2={2} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={16} cy={13} r={11} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={16} cy={27} r={11} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={16} y1={38} x2={16} y2={40} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <OznaczenieUzwojen glif={props} />
      {/* TR2W-BEZ-POLA (§0.C.5): marker stanu NIEKOMPLETNEGO — transformator
       *  przyłączony do szyny SN bez pola transformatorowego. Narożnik strony
       *  WN (u góry, przy punkcie przyłączenia — tam wchodzi pion z szyny),
       *  poza obrysem uzwojeń (okrąg r=11 wokół (16,13): odległość środka
       *  markera od środka uzwojenia to 15,0 > 11+3,6), więc nie zasłania
       *  symbolu i nie wymaga ani jednego piksela nowej rezerwacji.
       *  Mono jak reszta glifu bazowego — kolor nie koduje tu stanu fizycznego. */}
      {props.hasFieldGapWarning && (
        <g data-field-gap-warning="true">
          <circle cx={28} cy={4} r={3.6} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, 0.9)} />
          <text
            x={28} y={6.2} textAnchor="middle"
            fill={stroke(props)} fontFamily="sans-serif" fontSize={6} fontWeight={700}
          >
            !
          </text>
        </g>
      )}
    </g>
  );
}

export function CableHeadGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('cableHead', props)}>
      <line x1={8} y1={0} x2={8} y2={2} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <path d="M2,14 L14,14 L8,2 Z" fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={14} x2={8} y2={16} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

export function JointSleeveGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('jointSleeve', props)}>
      <line x1={0} y1={8} x2={3} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <rect x={3} y={5} width={10} height={6} fill={stroke(props)} fillOpacity={0.85} stroke={stroke(props)} strokeWidth={grubosc(props, 0.8)} />
      <line x1={13} y1={8} x2={16} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/**
 * PUNKT NORMALNIE OTWARTY (NOP) — ZNACZNIK FUNKCJI (okrąg) na łączniku podziału sieci.
 * Rozszerzenie 5 (referencja HMI 2026-10-29): NOP nie jest osobnym kolorem stanu, tylko
 * funkcją łącznika; jego BIEŻĄCE położenie (`status` gałęzi łącznika NOP) rysuje geometria
 * toru przez okrąg — otwarty = przerwa, zamknięty = tor ciągły, nieustalony = tor
 * przerywany — i kafel stanu, jak każdy łącznik.
 */
export function NoPointGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  const w = grubosc(props, V3_STROKE_APPARATUS);
  return (
    <g {...glyphGroupProps('noPoint', props)} data-nop-polozenie={state}>
      {state === 'open' ? (
        <>
          <line x1={0} y1={8} x2={4} y2={8} stroke={stroke(props)} strokeWidth={w} />
          <line x1={12} y1={8} x2={16} y2={8} stroke={stroke(props)} strokeWidth={w} />
        </>
      ) : (
        <line
          x1={0} y1={8} x2={16} y2={8}
          stroke={stroke(props)} strokeWidth={w}
          strokeDasharray={state === 'unknown' ? '3 2' : undefined}
        />
      )}
      <circle cx={8} cy={8} r={3.5} fill="none" stroke={stroke(props)} strokeWidth={w} />
    </g>
  );
}

/** Karta SLD-SUBSTRAT (kontynuacja): łącznik na torze POZIOMYM — geometria
 *  `DisconnectorGlyph` obrócona o 90° (nóż w osi toru = zamknięty, odchylony =
 *  otwarty, przerywany = stan nieznany; poprzeczka styku stałego). */
export function LineSwitchGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  const bladeEnd = state === 'open' ? { x: 18, y: 1 } : { x: 22, y: 8 };
  return (
    <g {...glyphGroupProps('lineSwitch', props)}>
      <line x1={0} y1={8} x2={10} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line
        x1={10} y1={8} x2={bladeEnd.x} y2={bladeEnd.y}
        stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        strokeDasharray={state === 'unknown' ? '3 2' : undefined}
      />
      <line x1={22} y1={4} x2={22} y2={12} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={22} y1={8} x2={32} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/** Karta SLD-SUBSTRAT (kontynuacja): wyłącznik na torze POZIOMYM — korpus
 *  `BreakerGlyph` (wypełniony = zamknięty, pusty = otwarty) z wyprowadzeniami W/E. */
export function LineBreakerGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  return (
    <g {...glyphGroupProps('lineBreaker', props)}>
      <rect
        x={2} y={2} width={12} height={12}
        fill={state === 'closed' ? stroke(props) : 'none'}
        fillOpacity={state === 'unknown' ? 0.35 : 1}
        stroke={stroke(props)}
        strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
      />
      <line x1={0} y1={8} x2={2} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={14} y1={8} x2={16} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

export function JunctionGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('junction', props)}>
      <circle cx={8} cy={8} r={3} fill={stroke(props)} />
    </g>
  );
}

/** F9.3 (spec §14.4): kropka WIĘKSZA (r=7 vs r=3 bazowy) na WIĘKSZYM
 *  gabarycie (32×32 vs 16×16, `symbols/defs.ts`) — akcent węzła rozgałęzienia
 *  odróżnialny od zwykłego T-węzła trasy (`junction`) BEZ zmiany geometrii
 *  routingu (glif, nie trasa). */
export function BranchJunctionGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('branchJunction', props)}>
      <circle cx={16} cy={16} r={7} fill={stroke(props)} />
    </g>
  );
}

/**
 * ODG-RYSUNEK: ZŁĄCZE KABLOWE SN (ZKSN) jako punkt odgałęźny na odcinku
 * magistrali. Obudowa aparatu (prostokąt IEC 60617) z węzłem toru w środku:
 * tor magistrali wchodzi z lewej (port `w`), wychodzi w prawo (port `e`),
 * odgałęzienie schodzi w dół (port `s`). Odróżnialny od zwykłego węzła trasy
 * (`junction` — sama kropka) OBUDOWĄ, nie rozmiarem (patrz `symbols/defs.ts`).
 */
export function BranchCabinetGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('branchCabinet', props)}>
      <rect x={3} y={3} width={10} height={10} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={8} cy={8} r={2.5} fill={stroke(props)} />
    </g>
  );
}

/**
 * ODG-RYSUNEK: SŁUP ROZGAŁĘŹNY linii napowietrznej SN jako punkt odgałęźny.
 * Węzeł toru (kropka) z sylwetką słupa (trzon w górę + poprzeczka) — ten sam
 * układ portów co `branchCabinet`, inny obiekt terenowy, więc inny glif.
 */
export function BranchPoleGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('branchPole', props)}>
      <line x1={8} y1={2} x2={8} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={3} y1={2} x2={13} y2={2} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={8} cy={8} r={2.5} fill={stroke(props)} />
    </g>
  );
}

export function CurrentTransformerGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('currentTransformer', props)}>
      <line x1={8} y1={0} x2={8} y2={24} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={8} cy={12} r={6} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

export function VoltageTransformerGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('voltageTransformer', props)}>
      <line x1={8} y1={0} x2={8} y2={5} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={8} cy={11} r={5.5} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={8} cy={17} r={5.5} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

export function SurgeArresterGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('surgeArrester', props)}>
      <line x1={8} y1={0} x2={8} y2={4} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <rect x={4} y={4} width={8} height={14} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      {/* strzałka udaru w dół */}
      <path d="M8,6 L8,13 M8,13 L5.5,10.5 M8,13 L10.5,10.5" fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={18} x2={8} y2={21} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={4} y1={21} x2={12} y2={21} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

function derFrame(props: GlyphProps, id: SymbolId, children: JSX.Element): JSX.Element {
  return (
    <g {...glyphGroupProps(id, props)}>
      <line x1={16} y1={0} x2={16} y2={2} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <rect x={2} y={2} width={28} height={28} rx={2} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      {children}
    </g>
  );
}

export function DerPvGlyph(props: GlyphProps): JSX.Element {
  // Falownik PV (IEC): przekątna DC/AC, po stronie DC panel, po AC sinusoida.
  return derFrame(props, 'derPv', (
    <g>
      <line x1={2} y1={30} x2={30} y2={2} stroke={stroke(props)} strokeWidth={grubosc(props, 1)} />
      <path d="M6,8 h8 M6,11 h8 M6,14 h8" stroke={stroke(props)} strokeWidth={grubosc(props, 1)} fill="none" />
      <path d="M18,23 q3,-5 6,0 q3,5 6,0" stroke={stroke(props)} strokeWidth={grubosc(props, 1.2)} fill="none" transform="translate(-4,0)" />
    </g>
  ));
}

export function DerBessGlyph(props: GlyphProps): JSX.Element {
  return derFrame(props, 'derBess', (
    <g>
      {/* ogniwo: długa i krótka płyta ×2 */}
      <line x1={10} y1={10} x2={22} y2={10} stroke={stroke(props)} strokeWidth={grubosc(props, 1.6)} />
      <line x1={13} y1={14} x2={19} y2={14} stroke={stroke(props)} strokeWidth={grubosc(props, 1.6)} />
      <line x1={10} y1={18} x2={22} y2={18} stroke={stroke(props)} strokeWidth={grubosc(props, 1.6)} />
      <line x1={13} y1={22} x2={19} y2={22} stroke={stroke(props)} strokeWidth={grubosc(props, 1.6)} />
    </g>
  ));
}

export function DerGeneratorGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('derGenerator', props)}>
      <line x1={16} y1={0} x2={16} y2={4} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <circle cx={16} cy={18} r={13} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <text
        x={16} y={22} textAnchor="middle"
        fill={stroke(props)} fontFamily="sans-serif" fontSize={12} fontWeight={700}
      >
        G
      </text>
    </g>
  );
}

/**
 * F9.4 (spec §13.2, V12K-029): farma wiatrowa — IEC 60617 nie definiuje glifu
 * turbiny wiatrowej; konwencja rysunkowa (jak `DerPvGlyph`/`DerBessGlyph`:
 * rozróżnienie IKONĄ, nie tekstem) — maszt + piasta + trzy łopaty rozstawione
 * 120°, czytelne mono bez podpisu.
 */
export function DerWindGlyph(props: GlyphProps): JSX.Element {
  return derFrame(props, 'derWind', (
    <g>
      <line x1={16} y1={26} x2={16} y2={11} stroke={stroke(props)} strokeWidth={grubosc(props, 1.4)} />
      <circle cx={16} cy={11} r={1.6} fill={stroke(props)} />
      <line x1={16} y1={11} x2={16} y2={3} stroke={stroke(props)} strokeWidth={grubosc(props, 1.2)} />
      <line x1={16} y1={11} x2={22.9} y2={14.9} stroke={stroke(props)} strokeWidth={grubosc(props, 1.2)} />
      <line x1={16} y1={11} x2={9.1} y2={14.9} stroke={stroke(props)} strokeWidth={grubosc(props, 1.2)} />
    </g>
  ));
}

/**
 * GPZ-PARYTET cz. 2 (pkt 3): źródło nieokreślone — ramka DER z pytajnikiem. Model nie
 * rozstrzyga rodzaju (pole `OZE` bez wytwórcy albo z wytwórcami różnych rodzajów,
 * wytwórca typu spoza rodzajów rysowanych), więc rysunek mówi to wprost zamiast udawać PV.
 */
export function DerUnknownGlyph(props: GlyphProps): JSX.Element {
  return derFrame(props, 'derUnknown', (
    <text
      x={16} y={22} textAnchor="middle"
      fill={stroke(props)} fontFamily="sans-serif" fontSize={16} fontWeight={700}
    >
      ?
    </text>
  ));
}

/**
 * GEOMETRIA-STACJI (§0 pkt 4c): pole bez ŻADNEGO rekordu wyposażenia w modelu — tor pola
 * doprowadzony do przerywanej ramki z pytajnikiem. Glif NIE czyta `state`: bez rekordu nie
 * ma stanu, a więc i koloru stanu (dyrektywa właściciela 2026-10-21, zero fabrykacji).
 */
export function BayNoEquipmentGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('bayNoEquipment', props)} data-brak-wyposazenia="true">
      <line x1={8} y1={0} x2={8} y2={4} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <rect
        x={1} y={4} width={14} height={24}
        fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)}
        strokeDasharray="3 2"
      />
      <text
        x={8} y={21} textAnchor="middle"
        fill={stroke(props)} fontFamily="sans-serif" fontSize={13} fontWeight={700}
      >
        ?
      </text>
      <line x1={8} y1={28} x2={8} y2={32} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/**
 * GEOMETRIA-STACJI (§0 pkt 5): zakończenie pola rezerwowego/wolnego — krótki tor pola
 * zamknięty poprzeczką i drugą, przerywaną: pole przygotowane, bez głowicy i bez odejścia.
 */
export function BayReserveGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('bayReserve', props)}>
      <line x1={8} y1={0} x2={8} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={2} y1={8} x2={14} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line
        x1={4} y1={13} x2={12} y2={13}
        stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} strokeDasharray="2 2"
      />
    </g>
  );
}

/**
 * F9.4 (spec §13.1/§13.2): sieć zewnętrzna (`Source` ENM, `kind=
 * 'external_grid'`) — strzałka zasilania W DÓŁ (konwencja: moc wchodzi Z
 * ZEWNĄTRZ do szyny), odrębna od wszystkich symboli DER (bez ramki
 * kwadratowej `derFrame` — ten symbol NIE jest instalacją DER).
 */
export function GridSourceGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('gridSource', props)}>
      <line x1={8} y1={0} x2={8} y2={8} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <path d="M4,8 L12,8 L8,16 Z" fill={stroke(props)} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <line x1={8} y1={16} x2={8} y2={24} stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
    </g>
  );
}

/** GS-3 (K4/K5): marker RODZAJU DER — pomocniczy. Trójkąt jest ZAREZERWOWANY
 *  dla głowicy kablowej, więc PV=romb, BESS=bateria, FW/gen=okrąg. GS-4:
 *  kotwica (cx,cy,h) parametryzowana — TEN SAM kształt rodzaju w polu DER na
 *  SN (`poleDer`) i za TR na nN (`poleTr.derNn`); różni się WYŁĄCZNIE miejsce
 *  przyłączenia (topologia), nigdy notacja rodzaju. */
function derMiniMarker(props: GlyphProps, kind: StationDerGlyphKind, s: string, cx: number, cy: number, h: number): JSX.Element {
  const w = grubosc(props, MINI_RMU.stroke.marker);
  const shape = DER_MARKER_SHAPE[kind];
  if (shape === 'diamond') {
    return <path d={`M${cx},${cy - h} L${cx + h},${cy} L${cx},${cy + h} L${cx - h},${cy} Z`} fill="none" stroke={s} strokeWidth={w} />;
  }
  if (shape === 'battery') {
    // Prostokąt bateryjny 2:1 z kreską wewnętrzną (NIE kwadrat aparatu).
    return (
      <g>
        <rect x={cx - h} y={cy - h / 2} width={2 * h} height={h} fill="none" stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy - h / 2} x2={cx} y2={cy + h / 2} stroke={s} strokeWidth={w} />
      </g>
    );
  }
  if (shape === 'circle-spokes') {
    // Wirnik: okrąg + 3 ramiona (Y).
    return (
      <g>
        <circle cx={cx} cy={cy} r={h} fill="none" stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy} x2={cx} y2={cy - h} stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy} x2={cx - 0.87 * h} y2={cy + 0.5 * h} stroke={s} strokeWidth={w} />
        <line x1={cx} y1={cy} x2={cx + 0.87 * h} y2={cy + 0.5 * h} stroke={s} strokeWidth={w} />
      </g>
    );
  }
  // Generator: okrąg z kropką centralną.
  return (
    <g>
      <circle cx={cx} cy={cy} r={h} fill="none" stroke={s} strokeWidth={w} />
      <circle cx={cx} cy={cy} r={0.35} fill={s} stroke="none" />
    </g>
  );
}

/** Głowica kablowa (K1/K4): trójkąt wierzchołkiem ku wnętrzu pola. */
function glowica(xBase: number, xTip: number, y: number, halfH: number, s: string, w: number): JSX.Element {
  return <path d={`M${xTip},${y} L${xBase},${y - halfH} L${xBase},${y + halfH} Z`} fill="none" stroke={s} strokeWidth={w} />;
}

/**
 * GS-3 (V12K-137, werdykt NO-GO recenzji GS-2 — `GRAMATYKA_MINI_RMU_2026-07.md`
 * K1–K7): stacja SN/nN na L0 = MINIATUROWY SLD ROZDZIELNICY — kompozycja PÓL,
 * nie ikona na linii. Tor: kabel → △głowica → aparat pola → SZYNA WEWNĘTRZNA
 * (nie wychodzi poza enklozurę, K2) → aparat → △głowica → kabel. Pola TR/DER
 * jako własne odgałęzienia z aparatem (K3/K5); sekcja/NO = stan aparatu W TORZE
 * szyny (K6, NO = realna przerwa). Obrys wtórny (K7). Geometria WYŁĄCZNIE z
 * `MINI_RMU` (reguła 13). Mono (P5) — stan/rodzaj = geometria, nie kolor.
 */
export function StationCollapsedGlyph(props: GlyphProps): JSX.Element {
  const s = stroke(props);
  const { enclosure: e, bus, linia: L, poleTr: tr, poleDer: der, sprzeglo: sp, odgalezienie: od, stroke: swBazowe } = MINI_RMU;
  const sw = skalujWagi(props, swBazowe);
  const y = L.y;
  const busBroken = props.stationNoOpen === true;
  // GS-5: topologia pól liniowych z roli stacji w ciągu; brak danych =
  // 'przelotowa' (zachowanie dotychczasowe — sylwetka bazowa bez podsumowania).
  const lineTopology = props.stationLineTopology ?? 'przelotowa';
  const drawRightField = lineTopology !== 'końcowa';
  return (
    <g {...glyphGroupProps('stationCollapsed', props)} data-station-silhouette="mini-rmu" data-station-line-topology={lineTopology}>
      {/* Obrys enklozury — WTÓRNY (K7): najlżejsza kreska, bez wypełnienia. */}
      <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={e.rx} fill="none" stroke={s} strokeWidth={sw.outline} data-station-outline="true" />
      {/* POLE LINIOWE L1: kabel → głowica → aparat → łącznik do szyny (K1). */}
      <line x1={L.stubL.x1} y1={y} x2={L.stubL.x2} y2={y} stroke={s} strokeWidth={sw.path} />
      {glowica(L.glowicaL.xBase, L.glowicaL.xTip, y, L.glowicaL.halfH, s, sw.path)}
      <rect x={L.aparatL.x - L.aparatL.size / 2} y={y - L.aparatL.size / 2} width={L.aparatL.size} height={L.aparatL.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="L1" />
      <line x1={L.glowicaL.xTip} y1={y} x2={L.aparatL.x - L.aparatL.size / 2} y2={y} stroke={s} strokeWidth={sw.path} />
      <line x1={L.linkL.x1} y1={y} x2={L.linkL.x2} y2={y} stroke={s} strokeWidth={sw.path} />
      {/* SZYNA WEWNĘTRZNA (K2) — najgrubsza; przy NO realna PRZERWA (K6). */}
      {busBroken ? (
        <g data-station-no="true">
          <line x1={bus.x1} y1={y} x2={sp.x - sp.gapHalf} y2={y} stroke={s} strokeWidth={sw.bus} data-station-bus="true" />
          <line x1={sp.x + sp.gapHalf} y1={y} x2={bus.x2} y2={y} stroke={s} strokeWidth={sw.bus} />
          {/* Otwarty styk aparatu: kreska odchylona od osi (stan OTWARTY). */}
          <line x1={sp.x - sp.gapHalf} y1={y} x2={sp.x + sp.gapHalf} y2={y - 2 * sp.gapHalf} stroke={s} strokeWidth={sw.path} />
        </g>
      ) : (
        <line x1={bus.x1} y1={y} x2={bus.x2} y2={y} stroke={s} strokeWidth={sw.bus} data-station-bus="true" />
      )}
      {/* Rodzina APARAT SEKCYJNY (K6): stan ZAMKNIĘTY = te same styki co stan
          otwarty (NO), człon ruchomy DOMKNIĘTY na osi (ciągłość); zmienia się
          wyłącznie położenie członu — jedna rodzina glifu, jedna kotwica. */}
      {props.stationSectioned && !busBroken && (
        <g data-station-sectioned="true">
          <line x1={sp.x - sp.gapHalf} y1={y - 2} x2={sp.x - sp.gapHalf} y2={y + 2} stroke={s} strokeWidth={sw.path} />
          <line x1={sp.x + sp.gapHalf} y1={y - 2} x2={sp.x + sp.gapHalf} y2={y + 2} stroke={s} strokeWidth={sw.path} />
        </g>
      )}
      {props.stationSectioned && busBroken && <g data-station-sectioned="true" />}
      {/* POLE LINIOWE L2 (lustrzane) — TYLKO gdy tor kontynuuje (GS-5):
          stacja KOŃCOWA nie dostaje fantomowego pola na wylot; szyna kończy
          się w rozdzielnicy (rezerwa/koniec ciągu — uczciwy obraz roli). */}
      {drawRightField && (
        <g data-station-field-out="true">
          <line x1={L.linkR.x1} y1={y} x2={L.linkR.x2} y2={y} stroke={s} strokeWidth={sw.path} />
          <rect x={L.aparatR.x - L.aparatR.size / 2} y={y - L.aparatR.size / 2} width={L.aparatR.size} height={L.aparatR.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="L2" />
          <line x1={L.aparatR.x + L.aparatR.size / 2} y1={y} x2={L.glowicaR.xTip} y2={y} stroke={s} strokeWidth={sw.path} />
          {glowica(L.glowicaR.xBase, L.glowicaR.xTip, y, L.glowicaR.halfH, s, sw.path)}
          <line x1={L.stubR.x1} y1={y} x2={L.stubR.x2} y2={y} stroke={s} strokeWidth={sw.path} />
        </g>
      )}
      {/* GS-5: WĘZEŁ ODGAŁĘZIENIA na szynie (stacja odgałęźna, ≥3 pola
          liniowe §19.3) — kropka węzłowa (junction); kabel zejścia rysuje
          scena. Przy NO (przerwa szyny w środku) kropka NIE jest rysowana —
          punkt środka leży w realnej przerwie; odgałęzienie pozostaje
          widoczne kablem sceny. */}
      {lineTopology === 'odgałęźna' && !busBroken && (
        <circle cx={od.x} cy={y} r={od.r} fill={s} stroke="none" data-station-branch-node="true" />
      )}
      {/* POLE TR (K3): szyna → aparat pola TR → transformator (dwuuzwojeniowy). */}
      {props.stationHasTransformer && (
        <g data-station-transformer="true">
          <line x1={tr.x} y1={tr.stub1.y1} x2={tr.x} y2={tr.stub1.y2} stroke={s} strokeWidth={sw.path} />
          <rect x={tr.x - tr.aparat.size / 2} y={tr.aparat.y} width={tr.aparat.size} height={tr.aparat.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="TR" />
          <line x1={tr.x} y1={tr.stub2.y1} x2={tr.x} y2={tr.stub2.y2} stroke={s} strokeWidth={sw.path} />
          <circle cx={tr.x} cy={tr.circle1Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          <circle cx={tr.x} cy={tr.circle2Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          {/* GS-4: DER ZA TRANSFORMATOREM (strona nN) — znak źródła przy
              gałęzi pola TR PONIŻEJ uzwojeń, POZA enklozurą (nN na zewnątrz
              rozdzielnicy SN). ZAKAZ renderu z szyny SN, gdy model mówi nN.
              Guard `stationHasTransformer` z konstrukcji: blok żyje WEWNĄTRZ
              grupy TR (bez TR strona nN nie istnieje). */}
          {props.stationDerBehindTr && (
            <g data-station-der-nn={props.stationDerBehindTr}>
              <line x1={tr.x} y1={tr.derNn.stub.y1} x2={tr.x} y2={tr.derNn.stub.y2} stroke={s} strokeWidth={sw.path} />
              {derMiniMarker(props, props.stationDerBehindTr, s, tr.x, tr.derNn.markerCY, tr.derNn.markerHalf)}
            </g>
          )}
        </g>
      )}
      {/* POLE DER na SN (K5): szyna → aparat pola DER → marker rodzaju. */}
      {props.stationDerOnMv && (
        <g data-station-der-sn={props.stationDerOnMv}>
          <line x1={der.x} y1={der.stub1.y1} x2={der.x} y2={der.stub1.y2} stroke={s} strokeWidth={sw.path} />
          <rect x={der.x - der.aparat.size / 2} y={der.aparat.y} width={der.aparat.size} height={der.aparat.size} fill="none" stroke={s} strokeWidth={sw.path} data-station-aparat="DER" />
          <line x1={der.x} y1={der.stub2.y1} x2={der.x} y2={der.stub2.y2} stroke={s} strokeWidth={sw.path} />
          {derMiniMarker(props, props.stationDerOnMv, s, der.x, der.markerCY, der.markerHalf)}
        </g>
      )}
    </g>
  );
}

/**
 * KD-5 (dług nazwany w V12K-285): BLOK GPZ ZWINIĘTY na L0 — miniatura
 * gramatyki GPZ (spec §3), nie plakietka. Rysunek WYŁĄCZNIE z `MINI_GPZ`
 * (`miniRmuGrammar.ts`, reguła 13: zero literałów geometrii w rendererze).
 *
 * Tor czytany z kształtu, z góry na dół: zejście od sieci zewnętrznej → SZYNA
 * WN → pole WN (aparat) → TRANSFORMATOR → pole TR (aparat) → SZYNA SN → POLA
 * ODEJŚCIOWE; pole magistrali schodzi portem S do toru magistrali sceny.
 * Liczby sekcji/transformatorów/pól pochodzą z REALNEJ kompozycji GPZ
 * (`meta.gpzGlyph`, `scene/buildScene.ts`) — brak danych ⇒ element nie jest
 * rysowany (zero fantomu), a nie rysowany „domyślnie".
 */
export function GpzCollapsedGlyph(props: GlyphProps): JSX.Element {
  const s = stroke(props);
  const { enclosure: e, zrodlo, szynaWn, poleWn, transformator: tr, poleTr, szynaSn, polaOdejsciowe: po, sprzeglo: sp, stroke: swBazowe } = MINI_GPZ;
  const sw = skalujWagi(props, swBazowe);
  const sections = props.gpzSections ?? 1;
  const transformers = props.gpzTransformers ?? 0;
  const feeders = props.gpzFeeders ?? 0;
  const drawnFeeders = po.xs.slice(0, Math.max(0, Math.min(feeders, po.xs.length)));
  const sectioned = sections > 1;
  const aparat = (x: number, y: number, size: number, testId: string): JSX.Element => (
    <rect x={x - size / 2} y={y} width={size} height={size} fill="none" stroke={s} strokeWidth={sw.path} data-gpz-aparat={testId} />
  );
  return (
    <g {...glyphGroupProps('gpzCollapsed', props)} data-gpz-silhouette="mini-gpz" data-gpz-sections={sections}>
      {/* Obrys rozdzielni — WTÓRNY (K7). */}
      <rect x={e.x} y={e.y} width={e.width} height={e.height} rx={e.rx} fill="none" stroke={s} strokeWidth={sw.outline} data-gpz-outline="true" />
      {/* Zejście od sieci zewnętrznej (port N) do szyny WN. */}
      <line x1={MINI_GPZ.axis} y1={zrodlo.stub.y1} x2={MINI_GPZ.axis} y2={zrodlo.stub.y2} stroke={s} strokeWidth={sw.path} />
      {/* SZYNA WN. */}
      <line x1={szynaWn.x1} y1={szynaWn.y} x2={szynaWn.x2} y2={szynaWn.y} stroke={s} strokeWidth={sw.bus} data-gpz-bus="wn" />
      {/* Pole WN transformatora (aparat w torze). */}
      {transformers > 0 && (
        <g data-gpz-transformer="true">
          <line x1={poleWn.x} y1={poleWn.stub1.y1} x2={poleWn.x} y2={poleWn.stub1.y2} stroke={s} strokeWidth={sw.path} />
          {aparat(poleWn.x, poleWn.aparat.y, poleWn.aparat.size, 'WN')}
          <line x1={poleWn.x} y1={poleWn.stub2.y1} x2={poleWn.x} y2={poleWn.stub2.y2} stroke={s} strokeWidth={sw.path} />
          {/* TRANSFORMATOR — dwa uzwojenia (ta sama notacja co pole TR mini-RMU). */}
          <circle cx={tr.x} cy={tr.circle1Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          <circle cx={tr.x} cy={tr.circle2Y} r={tr.circleR} fill="none" stroke={s} strokeWidth={sw.marker} />
          {/* Pole TR po stronie SN (aparat w torze). */}
          <line x1={poleTr.x} y1={poleTr.stub1.y1} x2={poleTr.x} y2={poleTr.stub1.y2} stroke={s} strokeWidth={sw.path} />
          {aparat(poleTr.x, poleTr.aparat.y, poleTr.aparat.size, 'TR')}
          <line x1={poleTr.x} y1={poleTr.stub2.y1} x2={poleTr.x} y2={poleTr.stub2.y2} stroke={s} strokeWidth={sw.path} />
        </g>
      )}
      {/* SZYNA SN — przy >1 sekcji realna PRZERWA + styki sprzęgła (wzór K6). */}
      {sectioned ? (
        <g data-gpz-sectioned="true">
          <line x1={szynaSn.x1} y1={szynaSn.y} x2={sp.x - sp.gapHalf} y2={szynaSn.y} stroke={s} strokeWidth={sw.bus} data-gpz-bus="sn" />
          <line x1={sp.x + sp.gapHalf} y1={szynaSn.y} x2={szynaSn.x2} y2={szynaSn.y} stroke={s} strokeWidth={sw.bus} />
          <line x1={sp.x - sp.gapHalf} y1={szynaSn.y - 3} x2={sp.x - sp.gapHalf} y2={szynaSn.y + 3} stroke={s} strokeWidth={sw.path} />
          <line x1={sp.x + sp.gapHalf} y1={szynaSn.y - 3} x2={sp.x + sp.gapHalf} y2={szynaSn.y + 3} stroke={s} strokeWidth={sw.path} />
        </g>
      ) : (
        <line x1={szynaSn.x1} y1={szynaSn.y} x2={szynaSn.x2} y2={szynaSn.y} stroke={s} strokeWidth={sw.bus} data-gpz-bus="sn" />
      )}
      {/* POLA ODEJŚCIOWE: pierwsze (na osi) schodzi na wylot do magistrali. */}
      {drawnFeeders.map((x, i) => (
        <g key={`pole-${x}`} data-gpz-feeder={i === 0 ? 'magistrala' : 'liniowe'}>
          <line x1={x} y1={po.stub1.y1} x2={x} y2={po.stub1.y2} stroke={s} strokeWidth={sw.path} />
          {aparat(x, po.aparat.y, po.aparat.size, i === 0 ? 'POLE-MAGISTRALA' : 'POLE')}
          <line x1={x} y1={po.stub2.y1} x2={x} y2={po.stub2.y2} stroke={s} strokeWidth={sw.path} />
          {i === 0 ? (
            <line x1={x} y1={po.wyjscie.y1} x2={x} y2={po.wyjscie.y2} stroke={s} strokeWidth={sw.path} />
          ) : (
            <line x1={x} y1={po.stubKoncowy.y1} x2={x} y2={po.stubKoncowy.y2} stroke={s} strokeWidth={sw.path} />
          )}
        </g>
      ))}
    </g>
  );
}

/**
 * F9.9 (spec §17.1/§17.3): przekaźnik zabezpieczeniowy — okrąg z kodami
 * funkcji ANSI/IEEE C37.2 (np. „50/51" nad „51N", maks. 2 linie ≤4 znaki,
 * §17.3 — obcinanie/wybór DWÓCH pierwszych kodów jest odpowiedzialnością
 * WOŁAJĄCEGO, `compose/station.ts`/`compose/gpz.ts`, ta funkcja rysuje
 * WYŁĄCZNIE to, co dostanie w `labelLines`, zero własnej logiki wyboru).
 * Brak wypełnienia (P5: rysunek bazowy mono) — element ADNOTACJI, nie stanu.
 */
export function ProtectionRelayGlyph(props: GlyphProps): JSX.Element {
  const lines = props.labelLines ?? [];
  const ty = lines.length > 1 ? [9, 17] : [13.5];
  return (
    <g {...glyphGroupProps('protectionRelay', props)}>
      <circle cx={12} cy={12} r={11} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      {lines.slice(0, 2).map((line, i) => (
        <text
          key={line}
          x={12} y={ty[i]} textAnchor="middle"
          fill={stroke(props)} fontFamily="sans-serif" fontSize={7} fontWeight={600}
        >
          {line}
        </text>
      ))}
      {/* F10.5 (spec §20.2): badge „!" — nierozstrzygnięty prerekwizyt
       *  topologiczny funkcji (67N⇒VT/87T⇒TR/51N⇒I0). Geometria WEWNĄTRZ
       *  bboxa 24×24 (róg NE okręgu głównego, r=11 wokół (12,12) zostawia
       *  narożniki wolne) — zero nowej rezerwacji miejsca, mono (jak reszta
       *  glifu bazowego, P5 — kolor NIE koduje tu stanu fizycznego). */}
      {props.hasTopologyWarning && (
        <g data-topology-warning="true">
          <circle cx={19.5} cy={4.5} r={3.6} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, 0.9)} />
          <text
            x={19.5} y={6.7} textAnchor="middle"
            fill={stroke(props)} fontFamily="sans-serif" fontSize={6} fontWeight={700}
          >
            !
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * F9.9 (spec §17.1): miernik — okrąg „M" statyczny (wzorzec `DerGeneratorGlyph`
 * „G" — tekst BAKED w glifie, bo treść nie jest danymi zmiennymi, jest
 * notacją stałą, koordynacja `docs/sld/SLD_PROTECTION_MARKING_COORDINATION_
 * 2026-07.md` pkt 1: „numery C37.2 są NOTACJĄ, nie kodenames").
 */
export function MeterGlyph(props: GlyphProps): JSX.Element {
  return (
    <g {...glyphGroupProps('meter', props)}>
      <circle cx={12} cy={12} r={11} fill="none" stroke={stroke(props)} strokeWidth={grubosc(props, V3_STROKE_APPARATUS)} />
      <text
        x={12} y={16} textAnchor="middle"
        fill={stroke(props)} fontFamily="sans-serif" fontSize={12} fontWeight={700}
      >
        {/* Recenzja NO-GO 2026-07-17 pkt 11: litera mierzonej wielkości
            (A/V) z danych pomiaru; „M" tylko gdy wielkość nieznana. */}
        {props.meterQuantity ?? 'M'}
      </text>
    </g>
  );
}

/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, kanon symboli): rodzina aparatów
 * ODPŁYWU nN — wyłącznik/MCB, rozłącznik bezpiecznikowy, licznik, oraz
 * kontener rozdzielnicy nN jako liść odpływu (wzorzec DER). Gabaryty i porty:
 * `symbols/defs.ts`. Rysunek ODRĘBNY od odpowiedników SN (`breaker`/
 * `fuseSwitch`/`meter`) — precedens `recloser`: nowy device_kind ⇒ nowy
 * glif, zero recyklingu istniejącego rysunku (kanon symboli, karta P0.8 §0.3).
 */

/**
 * Wyłącznik nN / MCB (IEC 60898-1) — korpus JAK `BreakerGlyph` (ten sam wzór
 * stanu geometrią: wypełnienie = zamknięty), ale MNIEJSZY (aparat modułowy)
 * i z DŹWIGNIĄ przełącznika nad korpusem (poprzeczna kreska na przewodzie
 * górnym) — cecha, której `BreakerGlyph` (aparat pierwotny SN) nie niesie.
 */
export function NnBreakerGlyph(props: GlyphProps): JSX.Element {
  const state = polozenieGeometrii(props.state);
  const w = grubosc(props, V3_STROKE_APPARATUS);
  return (
    <g {...glyphGroupProps('nnBreaker', props)}>
      <line x1={8} y1={0} x2={8} y2={3} stroke={stroke(props)} strokeWidth={w} />
      {/* dźwignia modułowa MCB — poprzeczka NA przewodzie górnym, cecha
          odróżniająca od `BreakerGlyph` (sam prostokąt bez dźwigni). */}
      <line x1={5.5} y1={1.5} x2={10.5} y2={1.5} stroke={stroke(props)} strokeWidth={w} data-nn-breaker-toggle="true" />
      <rect
        x={3} y={3} width={10} height={10}
        fill={state === 'closed' ? stroke(props) : 'none'}
        fillOpacity={state === 'unknown' ? 0.35 : 1}
        stroke={stroke(props)}
        strokeWidth={w}
      />
      <line x1={8} y1={13} x2={8} y2={16} stroke={stroke(props)} strokeWidth={w} />
    </g>
  );
}

/**
 * Rozłącznik bezpiecznikowy nN — kaseta wkładki SZEŚCIOKĄTNA (podstawa
 * bezpiecznikowa modułowa nN, np. wkładka NH w rozłączniku listwowym), w
 * odróżnieniu od PROSTOKĄTNEJ wkładki SN (`FuseSwitchGlyph`, obwiednia
 * rozłącznika z nożem otwierającym nad wkładką — nN nie niesie noża, sama
 * podstawa jest łącznikiem).
 */
export function NnFuseSwitchGlyph(props: GlyphProps): JSX.Element {
  const w = grubosc(props, V3_STROKE_APPARATUS);
  return (
    <g {...glyphGroupProps('nnFuseSwitch', props)}>
      <line x1={8} y1={0} x2={8} y2={6} stroke={stroke(props)} strokeWidth={w} />
      <path
        d="M8,6 L12,9 L12,17 L8,20 L4,17 L4,9 Z"
        fill="none" stroke={stroke(props)} strokeWidth={w}
        data-nn-fuseswitch-cartridge="true"
      />
      <line x1={8} y1={9} x2={8} y2={17} stroke={stroke(props)} strokeWidth={w} />
      <line x1={8} y1={20} x2={8} y2={24} stroke={stroke(props)} strokeWidth={w} />
    </g>
  );
}

/**
 * PORTAL DOMENY nN (architektura LV Domain Projection po B-02): jawne PRZEJŚCIE
 * z projekcji SN do projekcji nN, zakotwiczone na ZACISKU nN transformatora
 * (`compose/station.ts`, pion `#lv-portal-drop` z `#lv-bus`). Sylwetka
 * odsyłacza „ciąg dalszy na innym arkuszu" (IEC 60617 — chorągiewka
 * pięciokątna skierowana W DÓŁ, w stronę domeny, do której prowadzi) z napisem
 * „nN" BAKED (notacja stała: portal prowadzi ZAWSZE do domeny nN — treść nie
 * jest daną zmienną). NIE jest aparatem toru mocy: jeden port `top`, wisi POD
 * zaciskiem, nic za nim w TEJ projekcji — tor ciągnie dalej projekcja nN
 * (`lv-domain/LvDomainView.tsx`). Odróżnialny od CAŁEJ biblioteki (obwiednia
 * pięciokątna + napis), przypięte testem rejestru glifów.
 */
export function LvPortalGlyph(props: GlyphProps): JSX.Element {
  const w = grubosc(props, V3_STROKE_APPARATUS);
  return (
    <g {...glyphGroupProps('lvPortal', props)}>
      <line x1={16} y1={0} x2={16} y2={4} stroke={stroke(props)} strokeWidth={w} />
      <path
        d="M2,4 L30,4 L30,14 L16,23 L2,14 Z"
        fill="none" stroke={stroke(props)} strokeWidth={w}
        data-lv-portal-flag="true"
      />
      <text x={16} y={13} textAnchor="middle" fill={stroke(props)} fontFamily="sans-serif" fontSize={8} fontWeight={700}>
        nN
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Karta UX-04/POLE-LINIOWE-WZORZEC — symbole QElectroTech EN 60617 pola liniowego SN.
// Geometria z importera (`cad/qet/qetPoleSn.ts`), rysunek przez wspólną warstwę
// prymitywów CAD (`CadPrimitiveLayer`). Rysunek źródła = położenie OTWARTE; położenie
// zamknięte/uziemione/nieznane = obrót noża o kąt z importera wokół przegubu.
// ---------------------------------------------------------------------------

/** Położenie noża rysowane dla stanu łącznika: `earthed` tylko tam, gdzie symbol ma
 *  zestyk uziemiający (łącznik trójpołożeniowy); dla pozostałych — jak stan nieznany. */
export function polozenieNozaQet(id: QetSymbolPolaSnId, state: SwitchState): QetPolozenieNoza {
  const noz = QET_SYMBOLE_POLA_SN[id].noz;
  if (!noz) return 'open';
  if (state === 'bad') return 'unknown';
  return noz.katy[state] === undefined ? 'unknown' : state;
}

/**
 * Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC — STAN KAFLA łącznika z położeniem.
 * JEDNA reguła dla rysunku, eksportu, legendy, inspektora i sond:
 *  • `closed` → `zamkniety` (czerwony), `open` → `otwarty` (zielony);
 *  • `earthed` łącznika trójpołożeniowego → `zamkniety`: zestyk UZIEMIAJĄCY jest zamknięty
 *    (IEC 61850-7-4 modeluje łącznik trójpołożeniowy jako dwa XSWI — tor otwarty, uziemnik
 *    zamknięty; kafel niesie położenie styku, który jest zamknięty, a geometria noża mówi
 *    KTÓRY — nóż na zestyku uziemiającym). Ten sam kolor ma zamknięty uziemnik osobny;
 *  • `earthed` dla innego symbolu (rekord sprzeczny z rodzajem aparatu) i brak danej →
 *    `nieustalony` (szary z „?");
 *  • `bad` (rekord „awaria") → `bledny` (fioletowy z „!").
 * `null` = symbol bez położenia (patrz `SYMBOLE_LACZNIKOW_Z_POLOZENIEM`) — bez kafla.
 */
export function stanKaflaLacznika(id: SymbolId, state: SwitchState | undefined): StanKafla | null {
  if (!czyLacznikZPolozeniem(id)) return null;
  // Punkt NOP zadeklarowany na magistrali stacją (`LineRun.nop_station_ref`) nie wskazuje
  // łącznika — model nie niesie położenia, więc znacznik funkcji stoi bez kafla (kafel „?"
  // sugerowałby łącznik o nieznanym stanie, którego w modelu nie ma).
  if (id === 'noPoint' && state === undefined) return null;
  if (state === 'earthed' && id !== 'qetThreePositionSwitch') return 'nieustalony';
  return stanKaflaPolozenia(state);
}

/** Stan kafla z SAMEGO położenia — dla miejsc bez symbolu (inspektor, legenda). `earthed`
 *  przychodzi tu wyłącznie od łącznika trójpołożeniowego (`stanAparatowPola` rysuje go jako
 *  nieustalony dla innych rodzajów), więc mapuje się na zestyk zamknięty. */
export function stanKaflaPolozenia(state: SwitchState | undefined): StanKafla {
  if (state === 'closed' || state === 'earthed') return 'zamkniety';
  if (state === 'open') return 'otwarty';
  if (state === 'bad') return 'bledny';
  return 'nieustalony';
}

/** Opis położenia łącznika po polsku — JEDNA mapa (`v2/model/stanAparatowPola.ts`). */
export { OPIS_POLOZENIA_PL };

/** Znak na kaflu stanów bez położenia pewnego (drugi nośnik obok koloru). */
const ZNAK_KAFLA: Readonly<Partial<Record<StanKafla, string>>> = { nieustalony: '?', bledny: '!' };

/** Prostokąt kafla stanu względem lewego górnego rogu gabarytu: obrys CAŁEGO rysunku
 *  (wszystkie położenia noża i porty, `obrysSymbolu`) + `KAFEL_STANU_MARGINES`. */
export function prostokatKaflaStanu(id: SymbolId): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const o = obrysSymbolu(id);
  const m = KAFEL_STANU_MARGINES;
  return { x: o.x - m, y: o.y - m, width: o.width + 2 * m, height: o.height + 2 * m };
}

/** Kafel stanu: wypełniony prostokąt pod symbolem, znak „?"/„!" w rogu, dymek z opisem
 *  położenia; symbol na kaflu rysuje się kolorem `glif`. */
function zKafelemStanu(id: SymbolId, Glyph: (props: GlyphProps) => JSX.Element): (props: GlyphProps) => JSX.Element {
  function GlifNaKaflu(props: GlyphProps): JSX.Element {
    const kafle = props.kafleStanu;
    const stan = kafle ? stanKaflaLacznika(id, props.state) : null;
    if (!kafle || !stan) return <Glyph {...props} />;
    const r = prostokatKaflaStanu(id);
    const znak = ZNAK_KAFLA[stan];
    return (
      <g data-kafel-stanu={stan} data-kafel-symbol={id}>
        <title>{OPIS_POLOZENIA_PL[props.state ?? 'unknown']}</title>
        <rect
          x={props.x + r.x}
          y={props.y + r.y}
          width={r.width}
          height={r.height}
          rx={1.5}
          fill={kafle[stan]}
          stroke="none"
          data-kafel="tlo"
        />
        <Glyph {...props} stroke={kafle.glif} />
        {znak && (
          <text
            x={props.x + r.x + 1}
            y={props.y + r.y + 6}
            fill={kafle.glif}
            fontFamily="sans-serif"
            fontSize={6}
            fontWeight={700}
            data-kafel="znak"
          >
            {znak}
          </text>
        )}
      </g>
    );
  }
  return GlifNaKaflu;
}

function qetGlyph(id: QetSymbolPolaSnId): (props: GlyphProps) => JSX.Element {
  const symbol = QET_SYMBOLE_POLA_SN[id];
  function QetGlyph(props: GlyphProps): JSX.Element {
    const state: SwitchState = props.state ?? 'unknown';
    const ink = stroke(props);
    const w = grubosc(props, V3_STROKE_APPARATUS);
    const noz = symbol.noz;
    const polozenie = noz ? polozenieNozaQet(id, state) : undefined;
    const kat = noz && polozenie ? noz.katy[polozenie] ?? 0 : 0;
    return (
      <g {...glyphGroupProps(id, props)} data-symbol-family="qet" data-qet-polozenie={polozenie}>
        <CadPrimitiveLayer prims={symbol.stale} ink={ink} paper="none" strokeWidth={w} nonScalingStroke={false} state="closed" />
        {noz && (
          <g transform={`rotate(${kat} ${noz.cx} ${noz.cy})`} data-qet="noz" data-qet-kat={kat}>
            <CadPrimitiveLayer
              prims={noz.prymitywy}
              ink={ink}
              paper="none"
              strokeWidth={w}
              nonScalingStroke={false}
              state={polozenie === 'unknown' ? 'unknown' : 'closed'}
            />
          </g>
        )}
      </g>
    );
  }
  return QetGlyph;
}

const QET_GLYPHS: Readonly<Record<QetSymbolPolaSnId, (props: GlyphProps) => JSX.Element>> = Object.fromEntries(
  (Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]).map((id) => [id, qetGlyph(id)]),
) as Record<QetSymbolPolaSnId, (props: GlyphProps) => JSX.Element>;

/**
 * UX-04/POLE-BKR-MODEL: bateria kondensatorów równoległych SN na końcu toru pola.
 *
 * Kondensator — symbol ogólny PN-EN 60617-4 nr 04-02-01: dwie równoległe okładki z
 * doprowadzeniami w osi. Geometria okładek przeniesiona w skali 1:2 z elementu
 * QElectroTech `10_electric/91_en_60617/en_60617_04/en_60617_04_02/en_60617_04_02_01.elmt`
 * („Capacitor, general symbol": okładki szerokości 40 w odstępie 5, doprowadzenia w osi;
 * licencja CC BY 3.0, autorzy: zespół QElectroTech) — tu okładki 20 w odstępie 2,5.
 *
 * Pod kondensatorem ZNAK UKŁADU POŁĄCZEŃ z modelu (`bateria.uklad`, zero domysłu):
 *  • `PODWOJNA_GWIAZDA_IZOLOWANA` — dwie gwiazdy z izolowanymi punktami gwiazd połączonymi
 *    przewodem; przekładnik niezrównoważenia (okrąg na połączeniu, port `obwod`) rysowany
 *    WYŁĄCZNIE, gdy pole niesie jego rekord (ENEA Operator, Zeszyt 1 §17 s. 32, Zał. 16);
 *  • `GWIAZDA_IZOLOWANA` — gwiazda bez połączenia z ziemią;
 *  • `GWIAZDA_UZIEMIONA` — gwiazda z punktem gwiazdy połączonym z uziomem (jedyny układ
 *    z drogą dla składowej zerowej — `backend/src/network_model/core/bateria_kondensatorow.py`);
 *  • `TROJKAT` — trójkąt;
 *  • brak danej — znak „?" (układ nieokreślony w modelu; obliczenie przyjmuje wartość
 *    roboczą, którą pokazują dane przyjęte, nie rysunek).
 */
function gwiazda(cx: number, cy: number, r: number): string {
  const dx = r * Math.sin(Math.PI / 3);
  const dy = r * Math.cos(Math.PI / 3);
  return `M ${cx} ${cy} L ${cx} ${cy - r} M ${cx} ${cy} L ${cx - dx} ${cy + dy} M ${cx} ${cy} L ${cx + dx} ${cy + dy}`;
}

export function CapacitorBankGlyph(props: GlyphProps): JSX.Element {
  const w = grubosc(props, V3_STROKE_APPARATUS);
  const s = stroke(props);
  const uklad = props.bateria?.uklad ?? null;
  const zPrzekladnikiem = uklad === 'PODWOJNA_GWIAZDA_IZOLOWANA' && props.bateria?.przekladnikNiezrownowazenia === true;
  return (
    <g
      {...glyphGroupProps('capacitorBank', props)}
      data-uklad-baterii={uklad ?? 'NIEOKRESLONY'}
      data-przekladnik-niezrownowazenia={zPrzekladnikiem ? 'tak' : 'nie'}
    >
      {/* Kondensator (PN-EN 60617-4 04-02-01): doprowadzenie, dwie okładki, doprowadzenie. */}
      <line x1={16} y1={0} x2={16} y2={6} stroke={s} strokeWidth={w} />
      <line x1={6} y1={6} x2={26} y2={6} stroke={s} strokeWidth={w} data-okladka-kondensatora="1" />
      <line x1={6} y1={8.5} x2={26} y2={8.5} stroke={s} strokeWidth={w} data-okladka-kondensatora="2" />
      <line x1={16} y1={8.5} x2={16} y2={14} stroke={s} strokeWidth={w} />
      {uklad === 'PODWOJNA_GWIAZDA_IZOLOWANA' && (
        <g data-znak-ukladu="PODWOJNA_GWIAZDA_IZOLOWANA">
          <path d="M 16 14 L 16 17 M 8 17 L 24 17 M 8 17 L 8 20 M 24 17 L 24 20" fill="none" stroke={s} strokeWidth={w} />
          <path d={`${gwiazda(8, 25, 5)} ${gwiazda(24, 25, 5)}`} fill="none" stroke={s} strokeWidth={w} />
          {zPrzekladnikiem ? (
            <>
              <line x1={8} y1={25} x2={13} y2={25} stroke={s} strokeWidth={w} />
              <circle
                cx={16} cy={25} r={3} fill="none" stroke={s} strokeWidth={w}
                data-rodzaj-aparatu={RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA}
                data-port={PORTY_APARATU_POLA[RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA]?.[0]}
              />
              <line x1={19} y1={25} x2={24} y2={25} stroke={s} strokeWidth={w} />
            </>
          ) : (
            <line x1={8} y1={25} x2={24} y2={25} stroke={s} strokeWidth={w} />
          )}
        </g>
      )}
      {(uklad === 'GWIAZDA_IZOLOWANA' || uklad === 'GWIAZDA_UZIEMIONA') && (
        <g data-znak-ukladu={uklad}>
          <line x1={16} y1={14} x2={16} y2={20} stroke={s} strokeWidth={w} />
          <path d={gwiazda(16, 25, 5)} fill="none" stroke={s} strokeWidth={w} />
          {uklad === 'GWIAZDA_UZIEMIONA' && (
            <>
              <line x1={16} y1={25} x2={16} y2={31} stroke={s} strokeWidth={w} />
              <line x1={10} y1={31} x2={22} y2={31} stroke={s} strokeWidth={w} />
              <line x1={12} y1={34} x2={20} y2={34} stroke={s} strokeWidth={w} />
              <line x1={14} y1={37} x2={18} y2={37} stroke={s} strokeWidth={w} />
            </>
          )}
        </g>
      )}
      {uklad === 'TROJKAT' && (
        <g data-znak-ukladu="TROJKAT">
          <line x1={16} y1={14} x2={16} y2={19} stroke={s} strokeWidth={w} />
          <path d="M 16 19 L 22 29 L 10 29 Z" fill="none" stroke={s} strokeWidth={w} />
        </g>
      )}
      {uklad === null && (
        <text
          x={16} y={27} textAnchor="middle" data-znak-ukladu="NIEOKRESLONY"
          fill={s} fontFamily="sans-serif" fontSize={10} fontWeight={700}
        >
          ?
        </text>
      )}
    </g>
  );
}

const GLIFY_SYMBOLI: Readonly<Record<SymbolId, (props: GlyphProps) => JSX.Element>> = {
  breaker: BreakerGlyph,
  recloser: RecloserGlyph,
  disconnector: DisconnectorGlyph,
  loadBreakSwitch: LoadBreakSwitchGlyph,
  loadArrow: LoadArrowGlyph,
  earthSwitch: EarthSwitchGlyph,
  neutralEarthing: NeutralEarthingGlyph,
  fuseSwitch: FuseSwitchGlyph,
  fuse: FuseGlyph,
  voltageIndicator: VoltageIndicatorGlyph,
  transformer2W: Transformer2WGlyph,
  cableHead: CableHeadGlyph,
  jointSleeve: JointSleeveGlyph,
  noPoint: NoPointGlyph,
  lineSwitch: LineSwitchGlyph,
  lineBreaker: LineBreakerGlyph,
  junction: JunctionGlyph,
  branchJunction: BranchJunctionGlyph,
  branchCabinet: BranchCabinetGlyph,
  branchPole: BranchPoleGlyph,
  currentTransformer: CurrentTransformerGlyph,
  voltageTransformer: VoltageTransformerGlyph,
  surgeArrester: SurgeArresterGlyph,
  derPv: DerPvGlyph,
  derBess: DerBessGlyph,
  derGenerator: DerGeneratorGlyph,
  derWind: DerWindGlyph,
  derUnknown: DerUnknownGlyph,
  bayNoEquipment: BayNoEquipmentGlyph,
  bayReserve: BayReserveGlyph,
  gridSource: GridSourceGlyph,
  stationCollapsed: StationCollapsedGlyph,
  gpzCollapsed: GpzCollapsedGlyph,
  protectionRelay: ProtectionRelayGlyph,
  meter: MeterGlyph,
  nnBreaker: NnBreakerGlyph,
  nnFuseSwitch: NnFuseSwitchGlyph,
  lvPortal: LvPortalGlyph,
  ...QET_GLYPHS,
  capacitorBank: CapacitorBankGlyph,
};

/** Rejestr glifów. Łącznik z położeniem jest opakowany kaflem stanu TU, przy budowie
 *  rejestru — każde miejsce rysujące symbol (kanwa, okno pola, eksport, harness) dostaje
 *  tę samą regułę, a o kaflu decyduje wyłącznie podanie `kafleStanu`. */
export const SYMBOL_GLYPHS: Readonly<Record<SymbolId, (props: GlyphProps) => JSX.Element>> = Object.fromEntries(
  (Object.keys(GLIFY_SYMBOLI) as SymbolId[]).map((id) => [
    id,
    czyLacznikZPolozeniem(id) ? zKafelemStanu(id, GLIFY_SYMBOLI[id]) : GLIFY_SYMBOLI[id],
  ]),
) as Record<SymbolId, (props: GlyphProps) => JSX.Element>;

/** Sanity: każdy glif ma definicję i odwrotnie (spójność biblioteki). */
export const SYMBOL_IDS = Object.keys(SYMBOL_DEFS) as readonly SymbolId[];
