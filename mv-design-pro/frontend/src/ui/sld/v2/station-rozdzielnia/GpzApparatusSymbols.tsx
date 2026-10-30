/**
 * Symbole aparatów rozdzielni stacji (harnessy `station-rozdzielnia`,
 * `oze-source`, `gallery`): CtPrimary, ApparatusCbSquare, ApparatusCableHead,
 * ApparatusEarthingSwitch, ApparatusFuse, ApparatusThreePositionSwitch,
 * ApparatusVtThreePhase, ApparatusTransformerSymbol.
 *
 * GPZ-PARYTET cz. 2 (pkt 4): przeniesione z `v2/renderer/GpzApparatusSymbols.tsx`
 * po kasacji katalogu `v2/renderer/`; jedynymi konsumentami są renderery tego
 * katalogu (`StationRozdzielniaSN`, `OzeSourceArchetype`). Symbole bez konsumenta
 * (odłącznik okrągły, ogranicznik przepięć, rozłącznik, wyłącznik nN, etykieta
 * oznaczenia Q) skasowane razem z rendererami, które je rysowały.
 */

import {
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_DEVICE_FAULT,
  COLOR_LIVE,
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SIZES,
  GPZ_GEOMETRY,
} from '../theme/tokens';
import type {
  EarthingSwitchState,
  GpzApparatusSwitchState,
  OltcGlyphAnnotation,
} from '../model/gpzSwitchgearTypes';

const CT_RADIUS = GPZ_GEOMETRY.ctRadius;
const CB_SIZE = GPZ_GEOMETRY.cbSize;
const TRIANGLE_SIZE = GPZ_GEOMETRY.triangleSize;
const ES_BRANCH_LEN = GPZ_GEOMETRY.esBranchLength;
const ES_BRANCH_OFFSET = GPZ_GEOMETRY.esBranchOffset;

// =============================================================================
// CT Primary
// =============================================================================

interface CtPrimaryProps {
  readonly cx: number;
  readonly cy: number;
  readonly ratio?: string;
}

export function CtPrimary(props: CtPrimaryProps): JSX.Element {
  /* K30-115 MINOR fix (audyt #3): IEC 60617-7-12-01 wymaga pokazania
   * "kabel przechodzący przez przekładnik" — pionowa linia poza okręgiem
   * z góry i z dołu. Wyróżnia CT od VT (które ma bobinę wewnątrz). */
  const { cx, cy, ratio } = props;
  return (
    <g data-testid="sld-v2-gpz-bay-ct-primary" data-symbol-canon="ct_primary_with_conductor_line">
      {/* Linia pierwotna przechodząca przez przekładnik (kanon IEC 7-12-01) */}
      <line
        x1={cx}
        y1={cy - CT_RADIUS - 2.5}
        x2={cx}
        y2={cy + CT_RADIUS + 2.5}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.4}
      />
      <circle cx={cx} cy={cy} r={CT_RADIUS} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
      {ratio && (
        <text
          x={cx - CT_RADIUS - 2}
          y={cy + 3}
          textAnchor="end"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={FONT_SIZES.transformerRatio}
          fontWeight={600}
          data-testid="sld-v2-gpz-bay-ct-ratio"
        >
          {ratio}
        </text>
      )}
    </g>
  );
}

// =============================================================================
// CB Square
// =============================================================================

interface ApparatusVisualProps {
  cx: number;
  cy: number;
  state?: GpzApparatusSwitchState;
  energized: boolean;
}

export function ApparatusCbSquare(props: ApparatusVisualProps): JSX.Element {
  /* K30-110: IEC 60617-7-13-08 compliant Circuit Breaker.
   * Per norm: prostokąt z widocznym kontaktem styku wewnątrz.
   *  - closed: kropka w środku reprezentująca zamknięty kontakt
   *  - open: kreska pozioma (kontakt rozwarty)
   *  - unknown: neutralny szary symbol bez znaku zastępczego
   * Operator natychmiast odróżnia CB od DS bo CB ma KWADRAT, nie okrąg. */
  const { cx, cy, state = 'unknown', energized } = props;
  const open = state === 'open';
  const unknown = state === 'unknown';
  const fill = unknown
    ? COLOR_TEXT_MUTED
    : open
    ? COLOR_PANEL_RAISED
    : energized
    ? COLOR_DEVICE_CLOSED
    : COLOR_TEXT_MUTED;
  const stroke = unknown
    ? COLOR_TEXT_MUTED
    : open
    ? COLOR_DEVICE_OPEN_BORDER
    : COLOR_DEVICE_CLOSED_BORDER;
  /* K30-122 audyt fix: contact line + white outline gdy fill jest jasny
   * (zielony/żółty CLOSED state lub manipulation context). Wyraźny contrast
   * na każdym tle per WCAG AA. */
  const contactColor = open ? COLOR_DEVICE_OPEN : '#0A0E14';
  const contactOutline = !open && !unknown ? '#FFFFFF' : undefined;
  return (
    <g
      data-testid="sld-v2-gpz-bay-cb"
      data-state={state}
      data-apparatus-kind="circuit_breaker"
      data-symbol-canon="circuit_breaker_square"
      data-symbol-shape="square"
    >
      <rect
        x={cx - CB_SIZE / 2}
        y={cy - CB_SIZE / 2}
        width={CB_SIZE}
        height={CB_SIZE}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.4}
        rx={1}
      />
      {open && (
        <line
          x1={cx - CB_SIZE / 2 + 1}
          y1={cy}
          x2={cx + CB_SIZE / 2 - 1}
          y2={cy}
          stroke={COLOR_DEVICE_OPEN}
          strokeWidth={1.4}
        />
      )}
      {!open && !unknown && (
        <>
          {/* IEC 60617 closed contact: linia pionowa przez środek + 2 kropki styku.
              K30-122: paintOrder='stroke' + biały outline 0.6 dla contrast. */}
          <line
            x1={cx}
            y1={cy - CB_SIZE / 2 + 1.5}
            x2={cx}
            y2={cy + CB_SIZE / 2 - 1.5}
            stroke={contactColor}
            strokeWidth={1.8}
            paintOrder="stroke"
          />
          <circle cx={cx} cy={cy - CB_SIZE / 2 + 1.5} r={1.1} fill={contactColor} stroke={contactOutline} strokeWidth={contactOutline ? 0.4 : undefined} />
          <circle cx={cx} cy={cy + CB_SIZE / 2 - 1.5} r={1.1} fill={contactColor} stroke={contactOutline} strokeWidth={contactOutline ? 0.4 : undefined} />
        </>
      )}
    </g>
  );
}

// =============================================================================
// DS Circle
// =============================================================================

// =============================================================================
// Cable Head
// =============================================================================

export function ApparatusCableHead(props: { cx: number; cy: number; energized: boolean }): JSX.Element {
  const { cx, cy, energized } = props;
  const stroke = energized ? COLOR_LIVE : COLOR_TEXT_MUTED;
  return (
    <g data-testid="sld-v2-gpz-bay-cable-head">
      <polygon
        points={`${cx},${cy + TRIANGLE_SIZE} ${cx - TRIANGLE_SIZE * 0.86},${cy - TRIANGLE_SIZE * 0.5} ${cx + TRIANGLE_SIZE * 0.86},${cy - TRIANGLE_SIZE * 0.5}`}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
      />
    </g>
  );
}

// =============================================================================
// Earthing Switch
// =============================================================================

interface ApparatusEarthingSwitchProps {
  /** Środek osi pola (gdzie jest pionowy track). */
  readonly cxAxis: number;
  /** Y pozycji uziemnika (zwykle przy DS lub na końcu kolumny). */
  readonly cy: number;
  readonly state: EarthingSwitchState;
  /**
   * Strona gałęzi bocznej. Kanon polski OSD:
   *  - 'RIGHT' (domyślnie) — pole liniowe LINE_*, GPZ_LINE_BAY, RMU_LINE
   *  - 'LEFT' — pole TRANSFORMER (Energa GPZ Olsztyn 2/Słupsk Sosnowa)
   *  Renderer pozycjonuje gałąź zgodnie z `slot.side` z BayDeviceOrderPolicy.
   */
  readonly side?: 'LEFT' | 'RIGHT';
}

/**
 * Symbol uziemnika (ES) — boczna gałąź zakończona trójkątem ziemi.
 *
 * Kanon IEC 60617 7-13-05: krótka pozioma gałąź z osi pola, zakończona
 * trójkątem ziemi (3 krótkie poziome kreski malejącej długości skierowane
 * w dół). PN-EN 62271-102 wymaga jednoznacznej wizualizacji ES dla BHP.
 *
 * Kolor:
 *  - 'closed'  → czerwony (`COLOR_DEVICE_CLOSED`) — uziemnik załączony,
 *                pole UZIEMIONE (bezpieczne do prac, ale BLOKADA pracy
 *                pod napięciem)
 *  - 'open'    → szary muted — pole NIE uziemione (normalne)
 *  - 'unknown' → szary muted bez znaku zastępczego
 *  - 'absent'  → renderer pomija (zwraca pusty `<g/>`)
 */
export function ApparatusEarthingSwitch(props: ApparatusEarthingSwitchProps): JSX.Element {
  const { cxAxis, cy, state, side = 'RIGHT' } = props;
  if (state === 'absent') {
    return <g data-testid="sld-v2-gpz-bay-earthing-switch" data-state="absent" />;
  }
  const closed = state === 'closed';
  const stroke = closed ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED;
  const sw = closed ? 1.6 : 1.2;
  /* Boczna gałąź wychodzi z osi pola — strona z `slot.side` polityki.
   * Domyślnie po RIGHT (LINE_*, GPZ_LINE_BAY, RMU_LINE, TRANSFORMER,
   * MEASUREMENT, COUPLER). LEFT zarezerwowane dla custom layout per OSD. */
  const branchEndX = side === 'LEFT' ? cxAxis - ES_BRANCH_OFFSET : cxAxis + ES_BRANCH_OFFSET;
  /* Trójkąt ziemi: 3 poziome kreski o malejącej szerokości pod końcówką. */
  const groundTopY = cy + 1;
  return (
    <g
      data-testid="sld-v2-gpz-bay-earthing-switch"
      data-state={state}
      data-apparatus-kind="earthing_switch"
      data-symbol-canon="earthing_switch_lateral_branch"
    >
      {/* Pozioma gałąź z osi pola */}
      <line
        x1={cxAxis}
        y1={cy}
        x2={branchEndX}
        y2={cy}
        stroke={stroke}
        strokeWidth={sw}
      />
      {/* K30-108: IEC 60617-7-13-05 earthing switch contact:
          - closed: pionowa linia solid z arrowhead (▼) wskazującym ziemię
          - open: ANGLED LINE z górnego punktu styku do dolnego punktu —
            wyraźna przerwa (NIE dashed line) per IEC 60617 "open switch"
          - unknown: jak open, ale szary */}
      {closed ? (
        <>
          <line
            x1={branchEndX}
            y1={cy}
            x2={branchEndX}
            y2={cy + ES_BRANCH_LEN * 0.55}
            stroke={stroke}
            strokeWidth={sw}
          />
          {/* Arrowhead ▼ wskazujący zwarcie do ziemi — IEC 7-13-05 directional */}
          <polygon
            points={`${branchEndX - 2.5},${cy + ES_BRANCH_LEN * 0.45} ${branchEndX + 2.5},${cy + ES_BRANCH_LEN * 0.45} ${branchEndX},${cy + ES_BRANCH_LEN * 0.55}`}
            fill={stroke}
          />
        </>
      ) : (
        <>
          {/* Górny punkt kontaktu (przy lateral branch) — kropka */}
          <circle cx={branchEndX} cy={cy} r={1.2} fill={stroke} />
          {/* ANGLED open switch contact — diagonalna linia od górnego punktu do
              dolnego (IEC 60617 "open switch" zamiast dashed) */}
          <line
            x1={branchEndX}
            y1={cy}
            x2={branchEndX + (side === 'LEFT' ? -3 : 3)}
            y2={cy + ES_BRANCH_LEN * 0.4}
            stroke={stroke}
            strokeWidth={sw}
          />
          {/* Dolny punkt kontaktu (przy arrowhead) — kropka */}
          <circle cx={branchEndX} cy={cy + ES_BRANCH_LEN * 0.45} r={1.2} fill={stroke} />
          {/* Arrowhead ▼ wskazujący zwarcie do ziemi (gdyby uziemnik był zamknięty) */}
          <polygon
            points={`${branchEndX - 2},${cy + ES_BRANCH_LEN * 0.45} ${branchEndX + 2},${cy + ES_BRANCH_LEN * 0.45} ${branchEndX},${cy + ES_BRANCH_LEN * 0.5}`}
            fill={stroke}
            opacity={0.5}
          />
        </>
      )}
      {/* Pion odgałęzienia od styku stałego strony ziemi do najdłuższej kreski ziemi — ziemia wisi
          na końcu pionu, pod stykiem, skierowana w dół (decyzja właściciela 2026-10-30, test klasy
          `ui/sld/v3/symbols/__tests__/kierunekZiemi.test.tsx`). */}
      <line x1={branchEndX} y1={cy + ES_BRANCH_LEN * 0.45} x2={branchEndX} y2={groundTopY + ES_BRANCH_LEN * 0.6} stroke={stroke} strokeWidth={sw} />
      {/* Trójkąt ziemi (3 poziome kreski) */}
      <line x1={branchEndX - 3.5} y1={groundTopY + ES_BRANCH_LEN * 0.6} x2={branchEndX + 3.5} y2={groundTopY + ES_BRANCH_LEN * 0.6} stroke={stroke} strokeWidth={sw} />
      <line x1={branchEndX - 2.5} y1={groundTopY + ES_BRANCH_LEN * 0.85} x2={branchEndX + 2.5} y2={groundTopY + ES_BRANCH_LEN * 0.85} stroke={stroke} strokeWidth={sw} />
      <line x1={branchEndX - 1.5} y1={groundTopY + ES_BRANCH_LEN * 1.1} x2={branchEndX + 1.5} y2={groundTopY + ES_BRANCH_LEN * 1.1} stroke={stroke} strokeWidth={sw} />
    </g>
  );
}

// =============================================================================
// Fuse
// =============================================================================

interface ApparatusFuseProps {
  readonly cx: number;
  readonly cy: number;
  /** Stan: 'healthy' (zdrowy) lub 'blown' (przepalony). */
  readonly state?: 'healthy' | 'blown' | 'unknown';
}

/**
 * Bezpiecznik (kanon IEC 60617-7-04): pionowy prostokąt z kreską diagonalną.
 *  - healthy → wypełniony zielony
 *  - blown   → czerwony badge z X
 *  - unknown → szary
 */
export function ApparatusFuse(props: ApparatusFuseProps): JSX.Element {
  const { cx, cy, state = 'unknown' } = props;
  const blown = state === 'blown';
  const fill = state === 'healthy' ? COLOR_LIVE : blown ? COLOR_DEVICE_FAULT : COLOR_TEXT_MUTED;
  const stroke = state === 'healthy' ? COLOR_LIVE : blown ? COLOR_DEVICE_FAULT : COLOR_TEXT_MUTED;
  return (
    <g data-testid="sld-v2-gpz-bay-fuse" data-state={state}>
      <rect
        x={cx - 3.5}
        y={cy - 6}
        width={7}
        height={12}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
        rx={1}
      />
      {blown && (
        <line x1={cx - 3} y1={cy - 5} x2={cx + 3} y2={cy + 5} stroke={COLOR_TEXT_PRIMARY} strokeWidth={1.4} />
      )}
    </g>
  );
}

// =============================================================================
// Surge Arrester
// =============================================================================

// =============================================================================
// Switch Disconnector
// =============================================================================

// =============================================================================
// Three-position switch (rozłącznik trzypołożeniowy — ABB UniSwitch signature)
// =============================================================================

interface ApparatusThreePositionSwitchProps {
  readonly cx: number;
  readonly cy: number;
  /**
   * Position of the single moving contact (the ABB 3-position device selects ONE):
   *  - 'closed'  (ZAŁ):       blade bridges bus → cable (in service)
   *  - 'open'    (WYŁ):       blade at rest (isolated, gap)
   *  - 'earthed' (UZIEMIONY): blade swings to the earth contact (cable earthed)
   *  - 'unknown':             indeterminate (grey)
   */
  readonly position?: 'closed' | 'open' | 'earthed' | 'unknown';
  /** Half-height of the device on the field path (contacts sit at ±h). */
  readonly h?: number;
}

/**
 * Rozłącznik trzypołożeniowy (IEC 60617 load-break isolator with integral
 * earthing — the defining apparatus of the ABB UniSwitch cell). One moving
 * blade selects exactly one of three positions: service (closed), isolated
 * (open) or earthed. The earthing position is INTEGRAL to this device — there
 * is no separate earthing switch in an SDC cell.
 *
 * Single-line construction: a top fixed contact (bus side) and a bottom fixed
 * contact (cable side) on the vertical path, an earth contact branching to the
 * left with a ground triangle, and the moving blade drawn from the top pivot to
 * whichever contact is selected. A short load-break tick distinguishes it from a
 * plain disconnector.
 */
export function ApparatusThreePositionSwitch(
  props: ApparatusThreePositionSwitchProps,
): JSX.Element {
  const { cx, cy, position = 'unknown', h = 9 } = props;
  const topY = cy - h;
  const botY = cy + h;
  const earthX = cx - h - 3;
  const closed = position === 'closed';
  const earthed = position === 'earthed';
  const unknown = position === 'unknown';
  const liveColor = unknown ? COLOR_TEXT_MUTED : COLOR_LIVE;
  const bladeColor = closed
    ? COLOR_DEVICE_CLOSED_BORDER
    : earthed
      ? COLOR_DEVICE_CLOSED
      : unknown
        ? COLOR_TEXT_MUTED
        : COLOR_DEVICE_OPEN_BORDER;
  // Blade endpoint: closed → bottom contact; earthed → earth contact; open →
  // a rest angle between (the visible gap).
  const bladeEnd = closed
    ? { x: cx, y: botY }
    : earthed
      ? { x: earthX, y: cy + 1 }
      : { x: cx + h * 0.7, y: cy - h * 0.2 };
  return (
    <g
      data-testid="sld-v2-apparatus-three-position-switch"
      data-state={position}
      data-apparatus-kind="three_position_switch"
      data-symbol-canon="three_position_load_break_isolator"
      data-symbol-shape="diamond"
    >
      {/* Bus-side stub + top fixed contact (pivot). */}
      <line x1={cx} y1={topY - 3} x2={cx} y2={topY} stroke={liveColor} strokeWidth={1.6} />
      <circle cx={cx} cy={topY} r={1.4} fill={liveColor} />
      {/* Cable-side bottom fixed contact + stub. */}
      <circle cx={cx} cy={botY} r={1.4} fill={closed ? liveColor : COLOR_TEXT_MUTED} />
      <line x1={cx} y1={botY} x2={cx} y2={botY + 3} stroke={closed ? liveColor : COLOR_TEXT_MUTED} strokeWidth={1.6} />
      {/* Earth contact branch (left) + ground triangle. */}
      <circle cx={earthX} cy={cy + 1} r={1.2} fill={earthed ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED} />
      <line x1={earthX} y1={cy + 2.2} x2={earthX} y2={cy + 6} stroke={earthed ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED} strokeWidth={1.2} />
      <line x1={earthX - 3} y1={cy + 6} x2={earthX + 3} y2={cy + 6} stroke={earthed ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED} strokeWidth={1.2} />
      <line x1={earthX - 2} y1={cy + 7.4} x2={earthX + 2} y2={cy + 7.4} stroke={earthed ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED} strokeWidth={1.0} />
      <line x1={earthX - 1} y1={cy + 8.8} x2={earthX + 1} y2={cy + 8.8} stroke={earthed ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED} strokeWidth={0.8} />
      {/* The single moving blade from the top pivot to the selected contact. */}
      <line
        x1={cx}
        y1={topY}
        x2={bladeEnd.x}
        y2={bladeEnd.y}
        stroke={bladeColor}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* Load-break tick (distinguishes from a plain disconnector). */}
      <line x1={cx + 3} y1={cy - h * 0.55} x2={cx + 5.5} y2={cy - h * 0.55 + 2.5} stroke={liveColor} strokeWidth={1.3} strokeLinecap="round" />
    </g>
  );
}

// =============================================================================
// VT Three Phase
// =============================================================================

interface ApparatusVtThreePhaseProps {
  readonly cx: number;
  readonly cy: number;
  /** K30-117 audyt #1 MAJOR: VT phase count flexibility.
   *  - 3 (default): standardowy VT pomiarowy 3-fazowy (PSE/Energa)
   *  - 1: VT pomocniczy 1-fazowy (RM6 aux supply) */
  readonly phaseCount?: 1 | 3;
}

/**
 * Przekładnik napięciowy (VT — kanon polskiego pola pomiarowego PN).
 *
 * Konstrukcja IEC 60617 S00310 + tradycja PSE/Energa:
 *   - phaseCount=3: 3 okręgi fazowe (L1/L2/L3) w trójkąt + trójkąt ziemi
 *   - phaseCount=1: 1 okrąg z neutral point + trójkąt ziemi
 *
 * Renderowany w polu MEASUREMENT (PN) ZAMIAST placeholdera "VT" tekstu.
 */
export function ApparatusVtThreePhase(props: ApparatusVtThreePhaseProps): JSX.Element {
  const { cx, cy, phaseCount = 3 } = props;
  const r = 4;
  const dx = 5;
  const dy = 4;
  if (phaseCount === 1) {
    // K30-117: 1-fazowy VT (auxiliary)
    return (
      <g data-testid="sld-v2-gpz-bay-vt-single-phase" data-phase-count="1">
        {/* Single faza L1 — centered */}
        <circle cx={cx} cy={cy} r={r} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
        <text x={cx} y={cy + 1.5} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={5}>L1</text>
        {/* Neutral point connector */}
        <line x1={cx} y1={cy + r} x2={cx} y2={cy + r + 4} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
        {/* Trójkąt ziemi */}
        <line x1={cx - 3} y1={cy + r + 5} x2={cx + 3} y2={cy + r + 5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
        <line x1={cx - 2} y1={cy + r + 6.5} x2={cx + 2} y2={cy + r + 6.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.0} />
        <line x1={cx - 1} y1={cy + r + 8} x2={cx + 1} y2={cy + r + 8} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
      </g>
    );
  }
  return (
    <g data-testid="sld-v2-gpz-bay-vt-three-phase" data-phase-count="3">
      {/* Faza L1 (lewa-góra). */}
      <circle cx={cx - dx} cy={cy - dy} r={r} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <text x={cx - dx} y={cy - dy + 1.5} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={5}>L1</text>
      {/* Faza L2 (prawa-góra). */}
      <circle cx={cx + dx} cy={cy - dy} r={r} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <text x={cx + dx} y={cy - dy + 1.5} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={5}>L2</text>
      {/* Faza L3 (środek-dół). */}
      <circle cx={cx} cy={cy + dy + 1} r={r} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <text x={cx} y={cy + dy + 2.5} textAnchor="middle" fill={COLOR_TEXT_SECONDARY} fontFamily={FONT_MONO} fontSize={5}>L3</text>
      {/* Trójkąt ziemi pod neutral point. */}
      <line x1={cx - 3} y1={cy + dy + 7} x2={cx + 3} y2={cy + dy + 7} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <line x1={cx - 2} y1={cy + dy + 8.5} x2={cx + 2} y2={cy + dy + 8.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.0} />
      <line x1={cx - 1} y1={cy + dy + 10} x2={cx + 1} y2={cy + dy + 10} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
    </g>
  );
}

// =============================================================================
// LV Breaker
// =============================================================================

// =============================================================================
// Transformer Symbol
// =============================================================================

interface ApparatusTransformerSymbolProps {
  readonly cx: number;
  readonly cy: number;
  /** K30-103: render IEC 60617-2 earthing symbol (⏚) na punkcie neutralnym.
   *  Per PN-EN 61936-1, transformator z neutralem uziemionym MUSI mieć
   *  oznaczenie uziemienia. Default true (typowy układ TN-C-S w sieci SN). */
  readonly neutralEarthed?: boolean;
  /** K30-104: IEC 60076-1 vector group label (Dyn11, Yzn5, YNd1, …).
   *  Renderowany obok symbolu — projektant identyfikuje przesunięcie
   *  fazowe i konfigurację uzwojeń. */
  readonly vectorGroup?: string | null;
  /** K30-104: przełącznik zaczepów pod obciążeniem (on-load tap changer).
   *  Per IEC 60617-2 + PN-EN 62271-102: strzałka diagonalna przez górne
   *  uzwojenie (strona SN). */
  readonly hasTapChanger?: boolean;
  /** SLD-02 (V12K-045): adnotacja regulacji zaczepów (OLTC/DETC, pozycja,
   *  tryb AUTO/MAN, U_zad) — READ-ONLY z modelu `tap_changer`. Obecność
   *  implikuje strzałkę zaczepu. Brak → symbol bez adnotacji regulacji. */
  readonly oltc?: OltcGlyphAnnotation;
}

/**
 * Symbol transformatora SN/nN w polu TR (mini wersja TR symbolu z TwoBusTrColumn).
 * Renderowany NA OSI POLA (NIE jako separate column) — końcówka pola TR.
 */
export function ApparatusTransformerSymbol(props: ApparatusTransformerSymbolProps): JSX.Element {
  const { cx, cy, neutralEarthed = true, vectorGroup, oltc } = props;
  const hasTapChanger = props.hasTapChanger === true || oltc != null;
  const r = 5;
  const gap = r;
  return (
    <g
      data-testid="sld-v2-gpz-bay-transformer-symbol"
      data-symbol-canon="transformer_intersecting_circles"
      data-transformer-circles-intersect="true"
      data-transformer-circle-overlap-px={2 * r - gap}
    >
      {/* Okrąg górny (strona SN). */}
      <circle
        cx={cx}
        cy={cy - gap / 2}
        r={r}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        data-transformer-winding="SN"
        data-symbol-canon="transformer_winding_circle"
      />
      {/* Okrąg dolny (strona nN). */}
      <circle
        cx={cx}
        cy={cy + gap / 2}
        r={r}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        data-transformer-winding="nN"
        data-symbol-canon="transformer_winding_circle"
      />
      {/* K30-104: IEC 60617-2 tap-changer arrow (diagonalna strzałka przez
          górne uzwojenie HV/SN) — per PN-EN 62271-102 wymóg dla OLTC. */}
      {hasTapChanger && (
        <g data-testid="sld-v2-gpz-bay-transformer-tap-changer" data-symbol-canon="tap_changer_oltc">
          <line
            x1={cx - r - 2}
            y1={cy - gap / 2 + r + 2}
            x2={cx + r + 2}
            y2={cy - gap / 2 - r - 2}
            stroke={COLOR_LINE_PRIMARY}
            strokeWidth={1.4}
          />
          {/* Arrowhead (← directional) */}
          <polygon
            points={`${cx + r + 2},${cy - gap / 2 - r - 2} ${cx + r - 1},${cy - gap / 2 - r - 1} ${cx + r + 1},${cy - gap / 2 - r + 1}`}
            fill={COLOR_LINE_PRIMARY}
          />
        </g>
      )}
      {/* K30-103: IEC 60617-2 earthing symbol (3 horizontal bars decreasing
          in width) na punkcie neutralnym — PN-EN 61936-1 wymóg. */}
      {neutralEarthed && (
        <g data-testid="sld-v2-gpz-bay-transformer-earthing" data-symbol-canon="earthing_neutral">
          <line x1={cx} y1={cy + gap / 2 + r} x2={cx} y2={cy + gap / 2 + r + 3} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <line x1={cx - 4} y1={cy + gap / 2 + r + 3} x2={cx + 4} y2={cy + gap / 2 + r + 3} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
          <line x1={cx - 2.5} y1={cy + gap / 2 + r + 5} x2={cx + 2.5} y2={cy + gap / 2 + r + 5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1} />
          <line x1={cx - 1} y1={cy + gap / 2 + r + 7} x2={cx + 1} y2={cy + gap / 2 + r + 7} stroke={COLOR_LINE_PRIMARY} strokeWidth={0.8} />
        </g>
      )}
      {/* K30-104: vector group label (Dyn11) obok symbolu — IEC 60076-1 wymóg. */}
      {vectorGroup && (
        <text
          x={cx + r + 4}
          y={cy + 2}
          fill="#FFD166"
          fontFamily="monospace"
          fontSize={8}
          fontWeight={800}
          data-testid="sld-v2-gpz-bay-transformer-vector-group"
        >
          {vectorGroup}
        </text>
      )}
      {/* SLD-02 (V12K-045): adnotacja OLTC/DETC (READ-ONLY z tap_changer).
          Po lewej stronie symbolu, aby nie kolidować z vector group (prawo)
          i uziemieniem (dół). ZERO fizyki — same etykiety z modelu. */}
      {oltc && (
        <g
          data-testid="sld-v2-gpz-bay-transformer-oltc"
          data-oltc-kind={oltc.kind}
          data-oltc-mode={oltc.modeLabel}
        >
          <text
            x={cx - r - 4}
            y={cy - 2}
            textAnchor="end"
            fill={COLOR_LINE_PRIMARY}
            fontFamily="monospace"
            fontSize={7}
            fontWeight={800}
          >
            {`${oltc.kind} ${oltc.positionLabel}`}
          </text>
          <text
            x={cx - r - 4}
            y={cy + 7}
            textAnchor="end"
            fill={COLOR_LINE_PRIMARY}
            fontFamily="monospace"
            fontSize={7}
            fontWeight={600}
          >
            {oltc.setpointLabel ? `${oltc.modeLabel} · ${oltc.setpointLabel}` : oltc.modeLabel}
          </text>
        </g>
      )}
    </g>
  );
}

// =============================================================================
// Q Designation Label
// =============================================================================

