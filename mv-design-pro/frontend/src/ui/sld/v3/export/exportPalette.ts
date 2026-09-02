/**
 * SCHEMAT-10 S4 (V12K-135/136) — paleta DOKUMENTOWA arkusza (jasna,
 * drukowalna) dla toru eksportu SVG.
 *
 * KD-8 poz. 1 (2026-07-31) — ZMIANA ZAKRESU DECYZJI. Dawne rozstrzygnięcie
 * („kanwa na ekranie ZAWSZE SCADA-dark, jasny wariant WYŁĄCZNIE w eksporcie",
 * `docs/plan/HANDOFF_KONTYNUACJA_2026-07-22.md` §2 R1 +
 * `docs/sld/AUDYT_SCHEMATOW_OD_ZERA_2026-07.md` §1 D11) zostało NADPISANE
 * dyrektywą właściciela: ekran ma DWA motywy, więc kanwa też
 * (`theme/palette.ts`). Rola TEGO modułu jest odtąd węższa i ostrzejsza:
 * arkusz eksportowany wychodzi w palecie DOKUMENTOWEJ niezależnie od motywu,
 * na którym pracował projektant — dlatego substytucja przyjmuje paletę ekranu
 * PARAMETREM (`source`), zamiast zakładać, że ekran jest ciemny.
 *
 * SAME KLUCZE co `theme/colorTokens.ts` (dark) — wartości jasne, drukowalne
 * (tło białe, tor SN zielony/nN granatowy przyciemnione dla kontrastu na
 * bieli, WN/tusz bazowy czarny. UWAGA (V12K-216): na EKRANIE `VOLTAGE_COLOR.hv`
 * to już czerwień `#D93A2B` (paleta OSD), więc dawna symetria „hv === BASE_STROKE"
 * NIE obowiązuje. W druku WN zostaje czarnym tuszem ŚWIADOMIE: czerwień drukowalna
 * `#B71C1C` jest zarezerwowana dla NOP (D11), a przy kolizji pierwszeństwo ma stan
 * ruchowy nad poziomem napięcia — WN
 * pozostaje kolorem „bazowym" kanwy w OBU motywach). Semantyka napięć
 * WN/SN/nN i NOP pozostają WZAJEMNIE rozróżnialne w druku (D11 wymóg
 * dosłowny). Selekcja WYŁĄCZNIE w torze eksportu
 * (`SldCanvasV3Workspace.handleExportSvg`) — render ekranowy
 * (`SldCanvasV3.tsx`/`sheet/Frame.tsx`) czyta WYŁĄCZNIE `theme/colorTokens.ts`;
 * ten moduł NIE jest stamtąd importowany (zero wpływu na goldeny
 * sceny/ekranu — pomiar: `grep -rn "exportPalette" ../canvas ../sheet` = 0).
 *
 * MECHANIZM (RECON `ui/sld/export/**` + `v2/export/exportSvg.ts`
 * `normalizeSvgForExport`): eksport dziś RASTERYZUJE (serializuje) żywą
 * kanwę ekranową 1:1 — v3 koduje kolor jako KONKRETNY hex w atrybutach SVG
 * (`fill=`/`stroke=`), NIE `currentColor` jak `canonical_symbols/*.svg` v2
 * (jedyny wyjątek v3: `FaultContributionArrow`, patrz niżej) — więc
 * substytucja działa na poziomie STRINGA wyeksportowanego markupu,
 * PODMIENIAJĄC dokładne wartości hex tabeli ciemnej na jasne (ta sama
 * technika co `normalizeSvgForExport`, tylko pełna tabela zamiast
 * pojedynczego `currentColor`).
 *
 * TŁO (`CANVAS_BACKGROUND`/`SHEET_BACKGROUND`) jest ustawiane przez
 * `style={{background:...}}` (CSS), NIE atrybut SVG — w ŻYWEJ przeglądarce
 * (I W JSDOM, zweryfikowane empirycznie: `element.style.background = '#hex'`
 * normalizuje się przy odczycie `getAttribute('style')` do `rgb(r, g, b)`)
 * podmiana TEKSTU dawnego hex byłaby KRUCHA (zależna od silnika/przeglądarki
 * i momentu odczytu). Zamiast podmieniać CSS, wstrzykujemy jawny
 * `<rect fill="jasne tło">` zaraz po KAŻDYM otwierającym tagu `<svg ...>`
 * (ten sam wzorzec co `exportSvg.ts` `includeBackground`) — poprawne
 * NIEZALEŻNIE od tego, jak silnik zserializował `style`.
 *
 * `FaultContributionArrow` niesie kolor przez `currentColor` +
 * `<g style={{color: TOKEN}}>` (ten sam problem normalizacji CSS) —
 * rozwiązane PRZEZ atrybut `data-fault-color-token` (zwykły atrybut XML,
 * NIGDY normalizowany), który każdy taki `<g>` niesie od karty S-B:
 * nadpisujemy CAŁY `style="..."` tego tagu wartością jasną wybraną PO TYM
 * atrybucie — niezależnie od tego, czy poprzedni `style` był zserializowany
 * jako hex czy `rgb()`.
 */
import {
  DARK_SCADA_SLD_PALETTE,
  STATE_COLOR,
  type HighlightKey,
  type SldPalette,
  type VoltageClass,
} from '../theme/colorTokens';
import type { FaultFlowColorToken } from '../../../sld-overlay/ShortCircuitFlowOverlayAdapter';

// ---------------------------------------------------------------------------
// Tabela jasna — SAME KLUCZE co theme/colorTokens.ts (dark). Wartości
// drukowalne (kontrast na bieli), semantyka WN/SN/nN i NOP zachowana.
// ---------------------------------------------------------------------------

/** Tło eksportu — białe (drukowalne), D11 wymóg dosłowny. */
const EXPORT_BACKGROUND = '#FFFFFF' as const;
/** Tusz bazowy (tekst/ramka/leader) I WN (jak w ciemnym: `hv === baseStroke`
 *  — ta sama symetria zachowana w jasnym, patrz `colorTokens.ts` nagłówek). */
const EXPORT_INK = '#000000' as const;

const EXPORT_VOLTAGE_COLOR: Readonly<Record<VoltageClass, string>> = {
  hv: EXPORT_INK,
  sn: '#0F7A3D',
  nn: '#0A5A78',
};

/** NOP/otwarty — czerwień drukowalna (D11: „NOP wyraźny"), TA SAMA wartość
 *  co v2 `LIGHT_TECHNICAL_COLOR_DEVICE_OPEN` (`v2/theme/tokens.ts`) —
 *  reużycie konwencji „alarm/otwarty" istniejącej w aplikacji zamiast
 *  nowego literału (dyrektywa właściciela pkt 7 „reużycie zamiast
 *  duplikacji"). */
const EXPORT_NOP_RED = '#B71C1C' as const;

const EXPORT_STATE_COLOR: Readonly<Record<keyof typeof STATE_COLOR, string>> = {
  closed: '#0F8A46',
  open: EXPORT_NOP_RED,
  nop: EXPORT_NOP_RED,
};

const EXPORT_HIGHLIGHT_COLOR: Readonly<Record<HighlightKey, string>> = {
  energized: '#1E7A46',
  deenergized: '#6B7684',
  standby: '#8A6D00',
  maintenance: '#2166AC',
  flow: '#0B84BF',
  oltc: '#A15C00',
  // Zwarcie/critical — TA SAMA wartość co `EXPORT_NOP_RED` (v2 „alarm"
  // konwencja) — spójne z ciemnym motywem, gdzie oba tercyle najwyższego
  // priorytetu (NOP/critical) dzielą rodzinę czerwieni.
  fault: EXPORT_NOP_RED,
  faultWarning: '#C77700',
  faultOk: '#7A6B00',
  // W4 (§8) — liczbowe etykiety wynikowe; fiolet przyciemniony pod jasny druk
  // techniczny (kontrast z tłem białym, odrębny od flow/oltc/fault/selekcji).
  resultLabel: '#6A3FB5',
  // R2 (§8) — etykiety wyników NIEAKTUALNYCH: fiolet stłumiony/szarawy pod
  // jasny druk (widoczny, ale wyraźnie mniej dominujący niż `resultLabel`).
  resultStale: '#8A7A9E',
  // Selekcja — TA SAMA wartość co v2 `LIGHT_TECHNICAL_COLOR_SELECTION`.
  selection: '#0066CC',
  // T2-WYNIKI (§0 pkt 2) — odznaka SWZ drukowana: TA SAMA para dark/light co
  // `colorTokens.ts`/`palette.ts` (`swzOk`/`swzFail`/`swzUnknown`), wartości
  // ODRĘBNE od `energized`/`fault`/`standby` (jeden odcień = jedno znaczenie
  // wyniku, ten sam powód co w `colorTokens.ts`).
  swzOk: '#1E8449',
  swzFail: '#A93226',
  swzUnknown: '#8C4400',
};

/** Tabela jasna eksponowana dla testów/dokumentacji (parytet kluczy z
 *  `colorTokens.ts` — pomiar w `__tests__/exportPalette.test.ts`). */
export const LIGHT_TECHNICAL_V3 = {
  canvasBackground: EXPORT_BACKGROUND,
  baseStroke: EXPORT_INK,
  voltage: EXPORT_VOLTAGE_COLOR,
  state: EXPORT_STATE_COLOR,
  highlight: EXPORT_HIGHLIGHT_COLOR,
} as const;

// ---------------------------------------------------------------------------
// Mapa substytucji: dark hex -> light hex — DERIVED z importów `colorTokens.ts`
// (źródło ciemne NIGDY nie dryfuje od prawdy ekranu), deduplikowana Mapą
// (klucz = wartość ciemna — `STATE_COLOR.open`/`STATE_COLOR.nop` dzielą TĘ SAMĄ
// wartość ciemną z definicji, patrz `colorTokens.ts`; `BASE_STROKE` i
// `VOLTAGE_COLOR.hv` dzieliły ją do V12K-216, dziś są rozdzielone — oba nadal
// celują w `EXPORT_INK`; wszystkie cele jasne MUSZĄ się zgadzać —
// pilnowane twardym fail niżej, nie cichym nadpisaniem).
// ---------------------------------------------------------------------------

function buildHexSubstitutionMap(source: SldPalette): ReadonlyMap<string, string> {
  const pairs: readonly (readonly [string, string])[] = [
    [source.canvasBackground, EXPORT_BACKGROUND],
    [source.baseStroke, EXPORT_INK],
    [source.voltage.hv, EXPORT_VOLTAGE_COLOR.hv],
    [source.voltage.sn, EXPORT_VOLTAGE_COLOR.sn],
    [source.voltage.nn, EXPORT_VOLTAGE_COLOR.nn],
    [source.state.closed, EXPORT_STATE_COLOR.closed],
    [source.state.open, EXPORT_STATE_COLOR.open],
    [source.state.nop, EXPORT_STATE_COLOR.nop],
    [source.highlight.energized, EXPORT_HIGHLIGHT_COLOR.energized],
    [source.highlight.deenergized, EXPORT_HIGHLIGHT_COLOR.deenergized],
    [source.highlight.standby, EXPORT_HIGHLIGHT_COLOR.standby],
    [source.highlight.maintenance, EXPORT_HIGHLIGHT_COLOR.maintenance],
    [source.highlight.flow, EXPORT_HIGHLIGHT_COLOR.flow],
    [source.highlight.oltc, EXPORT_HIGHLIGHT_COLOR.oltc],
    [source.highlight.fault, EXPORT_HIGHLIGHT_COLOR.fault],
    [source.highlight.faultWarning, EXPORT_HIGHLIGHT_COLOR.faultWarning],
    [source.highlight.faultOk, EXPORT_HIGHLIGHT_COLOR.faultOk],
    [source.highlight.resultLabel, EXPORT_HIGHLIGHT_COLOR.resultLabel],
    [source.highlight.resultStale, EXPORT_HIGHLIGHT_COLOR.resultStale],
    [source.highlight.selection, EXPORT_HIGHLIGHT_COLOR.selection],
  ];
  const map = new Map<string, string>();
  for (const [screen, doc] of pairs) {
    const existing = map.get(screen);
    if (existing !== undefined && existing !== doc) {
      throw new Error(
        `exportPalette: kolizja substytucji — kolor ekranu ${screen} mapuje na dwa różne cele` +
          ` dokumentowe ('${existing}' i '${doc}').`,
      );
    }
    map.set(screen, doc);
  }
  return map;
}

/**
 * Podmiana WSZYSTKICH wystąpień koloru EKRANU na kolor DOKUMENTU — hex istnieje
 * w markupie v3 WYŁĄCZNIE jako wartość atrybutu SVG (`fill="#.."`/`stroke="#.."`),
 * NIGDY jako CSS `style` (patrz nagłówek pliku).
 *
 * KD-8 poz. 1: źródłem jest paleta MOTYWU, na którym pracował projektant
 * (parametr `source`, domyślnie dyspozytorska) — arkusz wychodzi w palecie
 * dokumentowej NIEZALEŻNIE od motywu ekranu.
 *
 * Podmiana idzie JEDNYM przebiegiem (alternatywa regexowa), a nie serią
 * `split/join`: cel jednej pary bywa źródłem innej (np. `#0B0F14` to tusz
 * jasnego ekranu I tło ciemnej kanwy), więc kolejne przebiegi mogłyby
 * podmienić wynik poprzedniego. Jeden przebieg = każdy fragment przepisany
 * dokładnie raz.
 */
export function substituteExportHexColors(
  svgMarkup: string,
  source: SldPalette = DARK_SCADA_SLD_PALETTE,
): string {
  const map = buildHexSubstitutionMap(source);
  const keys = [...map.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (keys.length === 0) return svgMarkup;
  const pattern = new RegExp(keys.map((k) => k.replace('#', '\\#')).join('|'), 'g');
  return svgMarkup.replace(pattern, (hit) => map.get(hit) ?? hit);
}

/** Wstrzykuje jawny prostokąt tła (jasny) zaraz po KAŻDYM otwierającym tagu
 *  `<svg ...>` — kanwa v3 zagnieżdża `SheetFrame` (własny `<svg>`) WEWNĄTRZ
 *  kanwy głównej (`SldCanvasV3.tsx`), więc w markupie występują DWA korzenie
 *  `<svg>`; oba dostają własny prostokąt 100%×100% swojego viewportu
 *  (percentowy rozmiar = zawsze poprawny niezależnie od `viewBox` każdego
 *  z osobna). */
export function injectExportBackground(svgMarkup: string): string {
  return svgMarkup.replace(
    /<svg([^>]*)>/g,
    (match) => `${match}<rect x="0" y="0" width="100%" height="100%" fill="${EXPORT_BACKGROUND}"/>`,
  );
}

const FAULT_FLOW_LIGHT_BY_TOKEN: Readonly<Record<FaultFlowColorToken, string>> = {
  critical: EXPORT_HIGHLIGHT_COLOR.fault,
  warning: EXPORT_HIGHLIGHT_COLOR.faultWarning,
  ok: EXPORT_HIGHLIGHT_COLOR.faultOk,
};

/** Nadpisuje `style="color:...` na `<g data-fault-color-token="...">`
 *  (strzałki rozpływu zwarciowego, `currentColor` — patrz nagłówek pliku) —
 *  `data-fault-color-token` jest zwykłym atrybutem XML (NIGDY normalizowany
 *  przez CSSOM), więc czytamy STĄD cel zamiast próbować sparsować dawną
 *  wartość `style` (hex albo `rgb()` zależnie od silnika renderującego). */
export function rewriteFaultFlowStyleColors(svgMarkup: string): string {
  return svgMarkup.replace(
    /<g([^>]*\bdata-fault-color-token="(critical|warning|ok)"[^>]*)>/g,
    (_fullMatch: string, attrs: string, token: string) => {
      const light = FAULT_FLOW_LIGHT_BY_TOKEN[token as FaultFlowColorToken];
      const nextAttrs = attrs.includes('style="')
        ? attrs.replace(/style="[^"]*"/, `style="color: ${light}"`)
        : `${attrs} style="color: ${light}"`;
      return `<g${nextAttrs}>`;
    },
  );
}

/**
 * Pipeline pełny (kolejność bramkuje poprawność): tło → strzałki zwarciowe
 * (`currentColor`) → podmiana hex globalna. WYŁĄCZNIE tor eksportu
 * (`SldCanvasV3Workspace.handleExportSvg`), wołana PO serializacji klonu SVG
 * (`XMLSerializer`) — render ekranowy NIETKNIĘTY (funkcja czysta na string).
 */
export function toLightTechnicalExportSvg(
  rawSvgMarkup: string,
  source: SldPalette = DARK_SCADA_SLD_PALETTE,
): string {
  const withBackground = injectExportBackground(rawSvgMarkup);
  const withFaultColors = rewriteFaultFlowStyleColors(withBackground);
  return substituteExportHexColors(withFaultColors, source);
}
