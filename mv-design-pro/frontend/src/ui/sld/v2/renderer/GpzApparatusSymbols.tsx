/**
 * SLD V2 — GpzSwitchgear apparatus symbol components.
 *
 * Extracted from GpzSwitchgearRenderer.tsx for modularization.
 * Contains: CtPrimary, ApparatusCbSquare, ApparatusDsCircle, ApparatusCableHead,
 * ApparatusEarthingSwitch, ApparatusFuse, ApparatusSurgeArrester,
 * ApparatusSwitchDisconnector, ApparatusVtThreePhase, ApparatusLvBreaker,
 * ApparatusTransformerSymbol, QDesignationLabel.
 */

import {
  COLOR_DEVICE_CLOSED,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
  FONT_SIZES,
  GPZ_GEOMETRY,
} from '../theme/tokens';
import type { EarthingSwitchState, GpzApparatusSwitchState } from './GpzSwitchgearTypes';

const CT_RADIUS = GPZ_GEOMETRY.ctRadius;
const CB_SIZE = GPZ_GEOMETRY.cbSize;
const DS_RADIUS = GPZ_GEOMETRY.dsRadius;
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
   *  - unknown: szary tło + "?" znak
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
  const contactColor = open ? COLOR_DEVICE_OPEN : '#0A0E14';
  return (
    <g
      data-testid="sld-v2-gpz-bay-cb"
      data-state={state}
      data-apparatus-kind="circuit_breaker"
      data-symbol-canon="circuit_breaker_square"
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
          {/* IEC 60617 closed contact: linia pionowa przez środek + 2 kropki styku */}
          <line
            x1={cx}
            y1={cy - CB_SIZE / 2 + 1.5}
            x2={cx}
            y2={cy + CB_SIZE / 2 - 1.5}
            stroke={contactColor}
            strokeWidth={1.4}
          />
          <circle cx={cx} cy={cy - CB_SIZE / 2 + 1.5} r={0.9} fill={contactColor} />
          <circle cx={cx} cy={cy + CB_SIZE / 2 - 1.5} r={0.9} fill={contactColor} />
        </>
      )}
      {unknown && (
        <text
          x={cx}
          y={cy + 2.5}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.badge}
          fontWeight={700}
        >
          ?
        </text>
      )}
    </g>
  );
}

// =============================================================================
// DS Circle
// =============================================================================

export function ApparatusDsCircle(props: ApparatusVisualProps): JSX.Element {
  /* INVARIANT 9: state='unknown' → neutral szary (analogicznie do CB). */
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
  /* K30-109: IEC 60617-7-13-02 compliant Disconnector.
   * Per norm: dwa punkty styku (kropki) + dźwignia rozłączająca.
   *  - closed: pionowa linia (dźwignia w pozycji "zamknięte")
   *  - open: linia diagonalna pod kątem ~45° wskazująca rozłączenie
   *  - 2 kropki styku stałe (zawsze widoczne)
   * Wyróżnia DS od CB (kwadrat) i SD (większy z load-break diagonal). */
  const contactColor = open ? COLOR_DEVICE_OPEN : '#0A0E14';
  const leverColor = open ? COLOR_DEVICE_OPEN : (unknown ? COLOR_TEXT_PRIMARY : '#0A0E14');
  return (
    <g
      data-testid="sld-v2-gpz-bay-ds"
      data-state={state}
      data-apparatus-kind="disconnector"
      data-symbol-canon="disconnector_two_contact_lever"
    >
      <circle cx={cx} cy={cy} r={DS_RADIUS} fill={fill} stroke={stroke} strokeWidth={1.2} />
      {/* 2 kropki styku stałe (IEC 7-13-02 — top + bottom contact points) */}
      <circle cx={cx} cy={cy - DS_RADIUS + 0.5} r={0.9} fill={contactColor} />
      <circle cx={cx} cy={cy + DS_RADIUS - 0.5} r={0.9} fill={contactColor} />
      {/* Dźwignia rozłączająca — pionowa gdy closed, diagonalna gdy open */}
      {!unknown && (open ? (
        <line
          x1={cx}
          y1={cy - DS_RADIUS + 0.5}
          x2={cx + DS_RADIUS * 0.85}
          y2={cy + DS_RADIUS - 0.5}
          stroke={leverColor}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={cx}
          y1={cy - DS_RADIUS + 0.5}
          x2={cx}
          y2={cy + DS_RADIUS - 0.5}
          stroke={leverColor}
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ))}
      {unknown && (
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          fill={COLOR_TEXT_PRIMARY}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.badge}
          fontWeight={700}
        >
          ?
        </text>
      )}
    </g>
  );
}

// =============================================================================
// Cable Head
// =============================================================================

export function ApparatusCableHead(props: { cx: number; cy: number; energized: boolean }): JSX.Element {
  const { cx, cy, energized } = props;
  const stroke = energized ? COLOR_DEVICE_CLOSED_BORDER : COLOR_TEXT_MUTED;
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
 *  - 'closed'  → czerwony (`COLOR_DEVICE_OPEN`) — uziemnik załączony,
 *                pole UZIEMIONE (bezpieczne do prac, ale BLOKADA pracy
 *                pod napięciem)
 *  - 'open'    → szary muted — pole NIE uziemione (normalne)
 *  - 'unknown' → szary muted ze znakiem '?'
 *  - 'absent'  → renderer pomija (zwraca pusty `<g/>`)
 */
export function ApparatusEarthingSwitch(props: ApparatusEarthingSwitchProps): JSX.Element {
  const { cxAxis, cy, state, side = 'RIGHT' } = props;
  if (state === 'absent') {
    return <g data-testid="sld-v2-gpz-bay-earthing-switch" data-state="absent" />;
  }
  const closed = state === 'closed';
  const unknown = state === 'unknown';
  const stroke = closed ? COLOR_DEVICE_OPEN : COLOR_TEXT_MUTED;
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
          - unknown: jak open ale szary z ? znacznikiem */}
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
      {/* Trójkąt ziemi (3 poziome kreski) */}
      <line x1={branchEndX - 3.5} y1={groundTopY + ES_BRANCH_LEN * 0.6} x2={branchEndX + 3.5} y2={groundTopY + ES_BRANCH_LEN * 0.6} stroke={stroke} strokeWidth={sw} />
      <line x1={branchEndX - 2.5} y1={groundTopY + ES_BRANCH_LEN * 0.85} x2={branchEndX + 2.5} y2={groundTopY + ES_BRANCH_LEN * 0.85} stroke={stroke} strokeWidth={sw} />
      <line x1={branchEndX - 1.5} y1={groundTopY + ES_BRANCH_LEN * 1.1} x2={branchEndX + 1.5} y2={groundTopY + ES_BRANCH_LEN * 1.1} stroke={stroke} strokeWidth={sw} />
      {/* Znak '?' dla unknown */}
      {unknown && (
        <text
          x={branchEndX + 4}
          y={cy + 3}
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_SANS}
          fontSize={FONT_SIZES.badge}
          fontWeight={700}
        >
          ?
        </text>
      )}
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
  const fill = state === 'healthy' ? COLOR_DEVICE_CLOSED : blown ? COLOR_DEVICE_OPEN : COLOR_TEXT_MUTED;
  const stroke = state === 'healthy' ? COLOR_DEVICE_CLOSED_BORDER : blown ? COLOR_DEVICE_OPEN_BORDER : COLOR_TEXT_MUTED;
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

interface ApparatusSurgeArresterProps {
  readonly cx: number;
  readonly cy: number;
}

/**
 * Ogranicznik przepięć (kanon IEC 60617 S00345): prostokąt z zygzakiem
 * błyskawicy (lightning bolt). Renderowany na bocznej gałęzi LEWO od osi pola.
 * K30-115 MINOR fix (audyt #3): 2 kreski → polyline zygzak per IEC S00345.
 */
export function ApparatusSurgeArrester(props: ApparatusSurgeArresterProps): JSX.Element {
  const { cx, cy } = props;
  return (
    <g data-testid="sld-v2-gpz-bay-surge-arrester" data-symbol-canon="surge_arrester_lightning_bolt">
      <rect
        x={cx - 3.5}
        y={cy - 6}
        width={7}
        height={12}
        fill={COLOR_PANEL_RAISED}
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        rx={0.5}
      />
      {/* Zygzak błyskawicy ⚡ (lightning bolt) — kanon IEC S00345 */}
      <polyline
        points={`${cx - 1.8},${cy - 4} ${cx + 0.5},${cy - 1} ${cx - 0.5},${cy + 1} ${cx + 1.8},${cy + 4}`}
        fill="none"
        stroke={COLOR_LINE_PRIMARY}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Strzałka ziemi pod prostokątem. */}
      <line x1={cx - 2} y1={cy + 7} x2={cx + 2} y2={cy + 7} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      <line x1={cx - 1} y1={cy + 8.5} x2={cx + 1} y2={cy + 8.5} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.0} />
    </g>
  );
}

// =============================================================================
// Switch Disconnector
// =============================================================================

interface ApparatusSwitchDisconnectorProps {
  readonly cx: number;
  readonly cy: number;
  readonly state?: GpzApparatusSwitchState;
  readonly energized: boolean;
}

/**
 * Rozłącznik load-break (kanon IEC 60617 S00198 — kombinowany rozłącznik
 * z odłącznikiem widocznym). Większy od zwykłego DS, z dodatkową kreską
 * rozłączania na boku — operator wyraźnie odróżnia od DS.
 *
 * RMU/RM6: pole liniowe ma SD zamiast CB+DS (kanon Schneider RM6, ABB
 * SafeRing).
 */
export function ApparatusSwitchDisconnector(props: ApparatusSwitchDisconnectorProps): JSX.Element {
  /* K30-111: BLOCKER fix (audyt #2) — SD musi być WYRAŹNIE odróżnialny od DS.
   * Bezpieczeństwo OSD (PN-EN 62271-102 § 7.2.1): operator MUSI wiedzieć
   * czy łącznik ma load-break (SD = pod napięciem OK) czy nie (DS = blokada).
   *  - Size 10 → 12 (większy, czytelniejszy przy zoom-out)
   *  - Label "SD" wewnątrz diamond gdy state != unknown
   *  - Load-break diagonal kreska wzmocniona (czerwona gdy open)
   *  - 2 kropki styku stałe (jak DS) ale wewnątrz diamond
   * IEC 60617-7-13-04 (load-break isolator). */
  const { cx, cy, state = 'unknown', energized } = props;
  const open = state === 'open';
  const unknown = state === 'unknown';
  const fill = unknown ? COLOR_TEXT_MUTED : open ? COLOR_PANEL_RAISED : energized ? COLOR_DEVICE_CLOSED : COLOR_TEXT_MUTED;
  const stroke = unknown ? COLOR_TEXT_MUTED : open ? COLOR_DEVICE_OPEN_BORDER : COLOR_DEVICE_CLOSED_BORDER;
  const sdSize = 12;
  const contactColor = open ? COLOR_DEVICE_OPEN : '#0A0E14';
  return (
    <g
      data-testid="sld-v2-gpz-bay-switch-disconnector"
      data-state={state}
      data-apparatus-kind="switch_disconnector"
      data-symbol-canon="switch_disconnector_rotated_square_load_break"
    >
      {/* Korpus rotated square — 12 px (zwiększony z 10 dla zoom-out czytelności). */}
      <rect
        x={cx - sdSize / 2}
        y={cy - sdSize / 2}
        width={sdSize}
        height={sdSize}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        transform={`rotate(45 ${cx} ${cy})`}
      />
      {/* 2 kropki styku stałe na pionowej osi (IEC 7-13-04 contact points) */}
      <circle cx={cx} cy={cy - sdSize / 2 + 1} r={0.9} fill={contactColor} />
      <circle cx={cx} cy={cy + sdSize / 2 - 1} r={0.9} fill={contactColor} />
      {/* Load-break diagonal kreska (kanon SD — distinct od DS i CB) */}
      <line
        x1={cx + sdSize * 0.55}
        y1={cy - sdSize * 0.45}
        x2={cx + sdSize * 0.85}
        y2={cy - sdSize * 0.15}
        stroke={open ? COLOR_DEVICE_OPEN : stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {open ? (
        <line x1={cx - sdSize / 2 + 1} y1={cy} x2={cx + sdSize / 2 - 1} y2={cy} stroke={COLOR_DEVICE_OPEN} strokeWidth={1.4} />
      ) : !unknown && (
        // Closed: pionowa linia łącząca styki
        <line x1={cx} y1={cy - sdSize / 2 + 1.5} x2={cx} y2={cy + sdSize / 2 - 1.5} stroke={contactColor} strokeWidth={1.2} />
      )}
      {unknown && (
        <text x={cx} y={cy + 3} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={FONT_SIZES.badge} fontWeight={700}>?</text>
      )}
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

interface ApparatusLvBreakerProps {
  readonly cx: number;
  readonly cy: number;
  readonly state?: GpzApparatusSwitchState;
}

/**
 * Wyłącznik nN (LV breaker — mały kwadrat za transformatorem po stronie nN).
 * Kanon IEC: kwadrat z "n" lub "lv" w środku.
 */
export function ApparatusLvBreaker(props: ApparatusLvBreakerProps): JSX.Element {
  const { cx, cy, state = 'unknown' } = props;
  const open = state === 'open';
  const unknown = state === 'unknown';
  const size = 7;
  const fill = unknown ? COLOR_TEXT_MUTED : open ? COLOR_PANEL_RAISED : COLOR_DEVICE_CLOSED;
  const stroke = unknown ? COLOR_TEXT_MUTED : open ? COLOR_DEVICE_OPEN_BORDER : COLOR_DEVICE_CLOSED_BORDER;
  return (
    <g data-testid="sld-v2-gpz-bay-lv-breaker" data-state={state}>
      <rect
        x={cx - size / 2}
        y={cy - size / 2}
        width={size}
        height={size}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.2}
        rx={0.5}
      />
      <text x={cx} y={cy + 1.5} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_MONO} fontSize={4} fontWeight={700}>nN</text>
    </g>
  );
}

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
}

/**
 * Symbol transformatora SN/nN w polu TR (mini wersja TR symbolu z TwoBusTrColumn).
 * Renderowany NA OSI POLA (NIE jako separate column) — końcówka pola TR.
 */
export function ApparatusTransformerSymbol(props: ApparatusTransformerSymbolProps): JSX.Element {
  const { cx, cy, neutralEarthed = true, vectorGroup, hasTapChanger = false } = props;
  const r = 5;
  const gap = 4;
  return (
    <g data-testid="sld-v2-gpz-bay-transformer-symbol">
      {/* Okrąg górny (strona SN). */}
      <circle cx={cx} cy={cy - gap / 2} r={r} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
      {/* Okrąg dolny (strona nN). */}
      <circle cx={cx} cy={cy + gap / 2} r={r} fill={COLOR_PANEL_RAISED} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.2} />
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
    </g>
  );
}

// =============================================================================
// Q Designation Label
// =============================================================================

interface QDesignationLabelProps {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Test-id suffix (cb/ds/es/ct/...). */
  readonly slot: string;
}

/**
 * Etykieta IEC 81346-2 obok aparatu (Q0/Q1/Q9 dla łączników, T1 trafo).
 * Mała, przygaszona — operator może odczytać ale nie dominuje.
 */
export function QDesignationLabel(props: QDesignationLabelProps): JSX.Element {
  const { x, y, text, slot } = props;
  return (
    <text
      x={x}
      y={y}
      fill={COLOR_TEXT_MUTED}
      fontFamily={FONT_MONO}
      fontSize={FONT_SIZES.transformerRatio}
      fontWeight={500}
      data-testid={`sld-v2-gpz-bay-q-${slot}`}
    >
      {text}
    </text>
  );
}
