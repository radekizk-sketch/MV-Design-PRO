/**
 * CANONICAL STYLE SYSTEM — Single Source of Truth for SLD Visual Styling
 *
 * PR-SLD-CANONICAL-STYLE-02: CANONICAL 1:1 Visual Parity
 *
 * CANONICAL ALIGNMENT:
 * - CANONICAL software visual standards
 * - IEC 60617 symbol conventions
 * - Industrial CAD rendering principles
 *
 * RULES:
 * - All style values defined HERE ONLY
 * - No magic numbers in renderers
 * - Deterministic (same input = same output)
 * - No "improvements" over CANONICAL
 *
 * HIERARCHY (BINDING):
 * 1. busbarStroke — dominant, heaviest
 * 2. feederStroke — clearly thinner
 * 3. auxStroke — auxiliary connections
 * 4. leaderStroke — callout leader lines
 */

// =============================================================================
// STROKE HIERARCHY (CANONICAL)
// =============================================================================

/**
 * Canonical stroke widths for CANONICAL visual hierarchy.
 * Busbar must visually dominate; feeders clearly subordinate.
 */
// Industrial Aesthetics Contract §1.7 — grubości linii
// Ref: IndustrialAesthetics.ts (BUSBAR_STROKE_WIDTH=3, BRANCH_STROKE_WIDTH=2, RING_STROKE_WIDTH=2)
export const CANONICAL_STROKE = {
  /** Busbar — dominant, heaviest line (szyny zbiorcze) */
  busbar: 5,
  /** Feeder/branch — primary connections (linie zasilające) */
  feeder: 2.5,
  /** Symbol outline — equipment symbols */
  symbol: 2,
  /** Auxiliary — secondary/measurement connections */
  aux: 1.5,
  /** Leader — callout/annotation lines */
  leader: 1,
  /** Detail — fine symbol details */
  detail: 1,
} as const;

/**
 * Stroke widths when element is selected.
 */
export const CANONICAL_STROKE_SELECTED = {
  busbar: 6,
  feeder: 3.5,
  symbol: 3,
  aux: 2,
  leader: 1.5,
  detail: 1.5,
} as const;

// =============================================================================
// COLOR SYSTEM (CANONICAL INDUSTRIAL PALETTE)
// =============================================================================

/**
 * Voltage-based colors (CANONICAL standard).
 * Industrial palette — calm, professional, readable.
 */
export const CANONICAL_VOLTAGE_COLORS = {
  /** WN — High Voltage (110kV+): deep red */
  WN: '#B91C1C', // red-700 (industrial, not alarm-bright)
  /** SN — Medium Voltage (6-30kV): deep blue */
  SN: '#1D4ED8', // blue-700 (CANONICAL standard for MV)
  /** nN — Low Voltage (0.4kV): dark amber */
  nN: '#B45309', // amber-700 (warm but professional)
  /** Unknown/default: neutral gray */
  default: '#374151', // gray-700
} as const;

/**
 * Voltage level lookup table (kV -> color key).
 */
export const CANONICAL_VOLTAGE_MAP: Record<string, keyof typeof CANONICAL_VOLTAGE_COLORS> = {
  // WN (High Voltage)
  '400': 'WN',
  '220': 'WN',
  '110': 'WN',
  // SN (Medium Voltage)
  '30': 'SN',
  '20': 'SN',
  '15': 'SN',
  '10': 'SN',
  '6': 'SN',
  // nN (Low Voltage)
  '0.4': 'nN',
  '0.23': 'nN',
} as const;

/**
 * State-based color modifiers.
 */
export const CANONICAL_STATE_COLORS = {
  /** Energized — full color (uses voltage color) */
  energized: null, // use voltage color
  /** De-energized — muted gray (not washed out) */
  deenergized: '#6B7280', // gray-500
  /** Selected — accent blue (consistent highlight) */
  selected: '#2563EB', // blue-600
  /** Out of service — faded */
  outOfService: '#9CA3AF', // gray-400
  /** Error/warning highlight */
  error: '#DC2626', // red-600
  warning: '#D97706', // amber-600
  info: '#2563EB', // blue-600
} as const;

// =============================================================================
// VISUAL HIERARCHY LAYERS (PR-SLD-UX-MAX)
// =============================================================================

/**
 * Three-level visual hierarchy for professional SLD readability.
 * STRUCTURE → TOPOLOGY → DETAIL
 *
 * Design rule: Structure readable in 0.5s, Topology in 3s, Detail on demand.
 */
export const VISUAL_HIERARCHY = {
  /** STRUCTURE level — busbars, voltage bands (dominant) */
  structure: {
    strokeWidth: 5,
    strokeWidthSelected: 6.5,
    opacity: 1,
    labelFontSize: 13,
    labelFontWeight: 600,
  },
  /** TOPOLOGY level — lines, bays, transformers (clearly subordinate) */
  topology: {
    strokeWidth: 2.5,
    strokeWidthSelected: 3.5,
    opacity: 1,
    labelFontSize: 10,
    labelFontWeight: 500,
  },
  /** DETAIL level — CT, VT, protection, measurements (finest) */
  detail: {
    strokeWidth: 1.5,
    strokeWidthSelected: 2,
    opacity: 0.85,
    labelFontSize: 9,
    labelFontWeight: 400,
  },
} as const;

/**
 * Map element types to visual hierarchy levels.
 */
export const ELEMENT_HIERARCHY_MAP: Record<string, keyof typeof VISUAL_HIERARCHY> = {
  Bus: 'structure',
  LineBranch: 'topology',
  TransformerBranch: 'topology',
  Switch: 'topology',
  Source: 'structure',
  Load: 'topology',
  CT: 'detail',
  VT: 'detail',
  Protection: 'detail',
  Measurement: 'detail',
} as const;

/**
 * Get visual hierarchy level for element type.
 */
export function getVisualHierarchyLevel(
  elementType: string
): keyof typeof VISUAL_HIERARCHY {
  return ELEMENT_HIERARCHY_MAP[elementType] ?? 'topology';
}

// =============================================================================
// VOLTAGE BAND BACKGROUNDS (SUBTLE)
// =============================================================================

/**
 * Subtle voltage band background colors for visual grouping.
 * Very low opacity — enhances readability without distraction.
 */
export const VOLTAGE_BAND_COLORS = {
  /** WN (High Voltage) — very subtle red tint */
  WN: 'rgba(185, 28, 28, 0.03)', // red-700 @ 3%
  /** SN (Medium Voltage) — very subtle blue tint */
  SN: 'rgba(29, 78, 216, 0.03)', // blue-700 @ 3%
  /** nN (Low Voltage) — very subtle amber tint */
  nN: 'rgba(180, 83, 9, 0.03)', // amber-700 @ 3%
  /** Default — neutral */
  default: 'transparent',
} as const;

// =============================================================================
// OZE/BESS DIFFERENTIATION (GENERATION vs LOAD)
// =============================================================================

/**
 * Generation source differentiation colors.
 * Sources are clearly marked as "power injectors" not "consumers".
 */
export const GENERATION_COLORS = {
  /** PV (Photovoltaic) — solar gold */
  pv: '#EAB308', // yellow-500 (solar)
  /** Wind Farm — sky blue */
  fw: '#0EA5E9', // sky-500 (wind)
  /** BESS (Battery) — emerald green */
  bess: '#10B981', // emerald-500 (energy storage)
  /** Generator — industrial blue */
  generator: '#3B82F6', // blue-500
  /** Utility Feeder — deep red */
  utility: '#B91C1C', // red-700
} as const;

/**
 * DER feeder colors for nN busbar feeders.
 * Used in FieldBlockRenderer to color-code DER type on nN side.
 */
export const DER_FEEDER_COLORS = {
  /** Load / Odbiornik — red-orange (consumption) */
  load: '#EF4444', // red-500
  /** PV (Photovoltaic) — solar gold */
  pv: '#EAB308', // yellow-500
  /** BESS (Battery) — emerald green */
  bess: '#10B981', // emerald-500
  /** Wind Farm — sky blue */
  wind: '#0EA5E9', // sky-500
} as const;

/**
 * Power flow direction indicator styles.
 * Used to visually distinguish generation from consumption.
 */
export const POWER_FLOW_INDICATOR = {
  /** Arrow size for power flow direction */
  arrowSize: 8,
  /** Arrow stroke width */
  arrowStrokeWidth: 1.5,
  /** Generation direction color (injection) */
  generationColor: '#10B981', // emerald-500
  /** Load direction color (consumption) */
  loadColor: '#6B7280', // gray-500
  /** Offset from symbol */
  offset: 16,
} as const;

// =============================================================================
// BAY TYPE VISUAL DIFFERENTIATION
// =============================================================================

/**
 * Bay type visual differentiation (subtle, no aggressive colors).
 * Uses line style and subtle accent to distinguish bay purposes.
 */
export const BAY_TYPE_STYLES = {
  /** Feeder bay — standard line style */
  feeder: {
    accentColor: 'transparent',
    strokeDasharray: undefined,
    labelPrefix: '',
  },
  /** OZE bay (PV, Wind) — subtle green accent */
  oze: {
    accentColor: 'rgba(16, 185, 129, 0.08)', // emerald-500 @ 8%
    strokeDasharray: undefined,
    labelPrefix: '',
  },
  /** BESS bay — subtle teal accent */
  bess: {
    accentColor: 'rgba(20, 184, 166, 0.08)', // teal-500 @ 8%
    strokeDasharray: undefined,
    labelPrefix: '',
  },
  /** Measurement bay — dashed line */
  measurement: {
    accentColor: 'transparent',
    strokeDasharray: '4,2',
    labelPrefix: '',
  },
} as const;

// =============================================================================
// MICRO-INTERACTIONS
// =============================================================================

/**
 * Hover interaction styles.
 */
export const HOVER_STYLES = {
  /** Stroke width increase on hover */
  strokeWidthIncrease: 0.5,
  /** Opacity boost on hover */
  opacityBoost: 0.1,
  /** Transition duration (ms) */
  transitionDuration: 150,
  /** Cursor style */
  cursor: 'pointer',
} as const;

/**
 * Selection interaction styles.
 */
export const SELECTION_STYLES = {
  /** Selection ring color */
  ringColor: 'rgba(37, 99, 235, 0.3)', // blue-600 @ 30%
  /** Selection ring width */
  ringWidth: 3,
  /** Selection ring offset */
  ringOffset: 4,
  /** Selection glow blur */
  glowBlur: 4,
} as const;

/**
 * Pinned/locked element styles.
 */
export const PINNED_STYLES = {
  /** Pinned indicator color */
  indicatorColor: '#6B7280', // gray-500
  /** Pinned indicator size */
  indicatorSize: 6,
  /** Pinned indicator offset */
  indicatorOffset: -8,
} as const;

/**
 * Fill colors for symbols.
 */
export const CANONICAL_FILL_COLORS = {
  /** Normal fill — white background */
  normal: '#FFFFFF',
  /** Selected fill — light blue tint */
  selected: '#DBEAFE', // blue-100
  /** De-energized fill — light gray */
  deenergized: '#F3F4F6', // gray-100
  /** Transparent (for open symbols) */
  none: 'none',
} as const;

// =============================================================================
// TYPOGRAPHY (CANONICAL INDUSTRIAL)
// =============================================================================

/**
 * Font settings for CANONICAL-style labels.
 * Single font family, clear hierarchy of sizes.
 */
export const CANONICAL_TYPOGRAPHY = {
  /** Font family — industrial, readable */
  fontFamily: "'Inter', 'Segoe UI', 'Arial', sans-serif",
  /** Font sizes (px) — clear hierarchy */
  fontSize: {
    /** Large — busbar names, main titles */
    large: 12,
    /** Medium — element names, primary labels */
    medium: 10,
    /** Small — secondary labels, annotations */
    small: 9,
    /** XSmall — callout details */
    xsmall: 8,
  },
  /** Font weights */
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  /** Line heights (relative) */
  lineHeight: {
    tight: 1.1,
    normal: 1.3,
    relaxed: 1.5,
  },
  /** Label text color */
  labelColor: '#1F2937', // gray-800
  /** Secondary text color */
  secondaryColor: '#4B5563', // gray-600
} as const;

// =============================================================================
// LABEL PLACEMENT (CANONICAL RULES)
// =============================================================================

/**
 * Label anchor positions relative to symbol center.
 * CANONICAL rule: consistent placement by element type.
 */
export const CANONICAL_LABEL_ANCHORS = {
  /** Busbar — label above, centered */
  Bus: {
    position: 'top' as const,
    offsetX: 0,
    offsetY: -12,
    textAnchor: 'middle' as const,
  },
  /** Switch — label above */
  Switch: {
    position: 'top' as const,
    offsetX: 0,
    offsetY: -8,
    textAnchor: 'middle' as const,
  },
  /** Transformer — label to the right */
  TransformerBranch: {
    position: 'right' as const,
    offsetX: 30,
    offsetY: 0,
    textAnchor: 'start' as const,
  },
  /** Line/Cable — label above the midpoint */
  LineBranch: {
    position: 'top' as const,
    offsetX: 0,
    offsetY: -6,
    textAnchor: 'middle' as const,
  },
  /** Source — label above */
  Source: {
    position: 'top' as const,
    offsetX: 0,
    offsetY: -10,
    textAnchor: 'middle' as const,
  },
  /** Load — label below */
  Load: {
    position: 'bottom' as const,
    offsetX: 0,
    offsetY: 8,
    textAnchor: 'middle' as const,
  },
  /** Default fallback */
  default: {
    position: 'top' as const,
    offsetX: 0,
    offsetY: -8,
    textAnchor: 'middle' as const,
  },
} as const;

/**
 * Line label placement (labels ON the line segment).
 * CANONICAL rule: offset from line, white-box/halo for readability.
 */
export const CANONICAL_LINE_LABEL = {
  /** Offset perpendicular to line (px) */
  offset: 8,
  /** Halo/white-box padding (px) */
  haloPadding: 2,
  /** Halo color */
  haloColor: '#FFFFFF',
  /** Halo opacity */
  haloOpacity: 0.9,
} as const;

// =============================================================================
// CALLOUT BLOCKS (CANONICAL RESULTS)
// =============================================================================

/**
 * CANONICAL callout block configuration.
 * Standard order: Un, Ik", Sk", ip, Ith/Ithr
 */
export const CANONICAL_CALLOUT = {
  /** Block dimensions */
  block: {
    minWidth: 80,
    maxWidth: 140,
    padding: 6,
    borderRadius: 2,
    borderWidth: 1,
  },
  /** Leader line */
  leader: {
    strokeWidth: CANONICAL_STROKE.leader,
    strokeColor: '#6B7280', // gray-500
    dashArray: '4,2',
    /** Offset from node center to leader start */
    nodeOffset: 20,
    /** Leader line length (horizontal portion) */
    length: 30,
  },
  /** Block colors */
  colors: {
    background: '#FFFFFF',
    border: '#D1D5DB', // gray-300
    text: '#1F2937', // gray-800
    value: '#111827', // gray-900
    unit: '#6B7280', // gray-500
  },
  /** Standard result fields (CANONICAL order) */
  fields: [
    { key: 'Un', label: 'Un', unit: 'kV' },
    { key: 'Ikss', label: "Ik''", unit: 'kA' },
    { key: 'Skss', label: "Sk''", unit: 'MVA' },
    { key: 'ip', label: 'ip', unit: 'kA' },
    { key: 'Ith', label: 'Ith', unit: 'kA' },
  ] as const,
  /** Row height in callout */
  rowHeight: 16,
  /** Spacing between label and value */
  labelValueGap: 8,
} as const;

/**
 * Callout anchor positions (relative to node).
 */
export const CANONICAL_CALLOUT_ANCHORS = {
  /** Default: top-right of node */
  default: {
    direction: 'topRight' as const,
    offsetX: 40,
    offsetY: -30,
  },
  /** Alternative positions for collision avoidance */
  alternatives: [
    { direction: 'topLeft' as const, offsetX: -40, offsetY: -30 },
    { direction: 'bottomRight' as const, offsetX: 40, offsetY: 30 },
    { direction: 'bottomLeft' as const, offsetX: -40, offsetY: 30 },
  ],
} as const;

// =============================================================================
// SYMBOL SIZES (CANONICAL PROPORTIONS)
// =============================================================================

/**
 * Symbol sizes in pixels (CANONICAL proportions).
 * All symbols designed for viewBox 0 0 100 100, scaled to these sizes.
 */
export const CANONICAL_SYMBOL_SIZES = {
  /** Busbar — wide, low profile */
  Bus: { width: 100, height: 20 },
  /** Switch — square-ish, clear visibility */
  Switch: { width: 36, height: 48 },
  /** Transformer — tall, overlapping circles */
  TransformerBranch: { width: 40, height: 56 },
  /** Line/Cable — compact inline symbol */
  LineBranch: { width: 50, height: 30 },
  /** Source — prominent, clear hierarchy */
  Source: { width: 50, height: 60 },
  /** Load — clear termination symbol */
  Load: { width: 36, height: 44 },
  /** Default fallback */
  default: { width: 40, height: 40 },
} as const;

// =============================================================================
// CANVAS BACKGROUND (CANONICAL INDUSTRIAL)
// =============================================================================

/**
 * Canvas background configuration (CANONICAL: technical drawing paper feel).
 * Professional, calm, engineered appearance.
 */
export const CANONICAL_CANVAS = {
  /** Primary background — dark CAD/SCADA operator canvas */
  backgroundColor: '#0B1520',
  /** Subtle gradient (top to bottom) — engineered dark surface */
  gradientStart: '#101C28',
  gradientEnd: '#08111A',
  /** Border around canvas area */
  borderColor: '#1E3A4A',
  /** Shadow for depth */
  shadowColor: 'rgba(2, 8, 23, 0.45)',
  /** Canvas inner glow for depth */
  innerGlowColor: 'rgba(14, 165, 233, 0.08)',
} as const;

// =============================================================================
// GRID SETTINGS (SUBDUED)
// =============================================================================

/**
 * Grid configuration (CANONICAL: subdued, not dominant).
 * Technical drawing style — visible but not distracting.
 */
export const CANONICAL_GRID = {
  /** Grid cell size (px) */
  size: 20,
  /** Major grid every N cells */
  majorEvery: 5,
  /** Minor grid color — dark CAD hairline */
  minorColor: 'rgba(148, 163, 184, 0.12)',
  /** Major grid color — dark CAD section line */
  majorColor: 'rgba(148, 163, 184, 0.22)',
  /** Axis/origin color — dark CAD reference axis */
  axisColor: 'rgba(125, 211, 252, 0.34)',
  /** Minor stroke width */
  minorStrokeWidth: 0.4,
  /** Major stroke width */
  majorStrokeWidth: 0.6,
  /** Axis stroke width */
  axisStrokeWidth: 0.8,
  /** Default visibility */
  defaultVisible: true,
  /** Grid opacity — ABB: very subtle, diagram dominates */
  opacity: 0.75,
} as const;

// =============================================================================
// CANONICAL GEOMETRY — SLD Layout Configuration (CANONICAL)
// =============================================================================

/**
 * CANONICAL-grade SLD geometry configuration.
 * Defines spacing, sizing, and positioning rules for professional SLD rendering.
 *
 * PR-SLD-CANONICAL-GEOMETRY-01: CANONICAL-grade geometria SLD
 *
 * RULES:
 * - WN (HV) busbar at top
 * - Transformer between WN and SN
 * - SN (MV) busbar below transformer
 * - Feeders exit VERTICALLY from SN busbar with constant spacing
 * - No diagonal connections from busbars
 * - All values in pixels, snap to grid
 */
export const CANONICAL_GEOMETRY = {
  // ---------------------------------------------------------------------------
  // CANONICAL 12-LAYER SYSTEM (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  // ---------------------------------------------------------------------------

  /**
   * Canonical layer configuration for CANONICAL/Canonical-grade SLD layout.
   *
   * Układ pionowy od góry do dołu:
   *
   * L0  ŹRÓDŁO / SIEĆ WN
   * L1  ROZDZIELNICA WN + SZYN WN (opcjonalnie)
   * L2  TRANSFORMATORY WN/SN
   * L3  ROZDZIELNICA SN + SZYN SN (sekcjonowana)
   * L4  POLA LINIOWE SN (sieć, odgałęzienia)
   * L5  ŁĄCZNIKI ODGAŁĘZIEŃ SN
   * L6  PRZYŁĄCZA SN (kable)
   * L7  ROZDZIELNICE SN STACJI
   * L8  WYŁĄCZNIKI SN TRANSFORMATORÓW
   * L9  TRANSFORMATORY SN/nn
   * L10 SZYN nn (0,4 / 0,69 / 0,8 kV)
   * L11 ROZDZIELNICE nn
   * L12 FALOWNIKI PV / BESS / FW / ODBIORY
   *
   * Reguła: niższy poziom napięcia = niższa warstwa Y
   */
  canonicalLayers: {
    /** L0: Źródło / Sieć WN — topmost layer */
    L0_SOURCE: { index: 0, yOffset: 0, label: 'Źródło / Sieć WN' },
    /** L1: Rozdzielnica WN + Szyny WN */
    L1_WN_BUSBAR: { index: 1, yOffset: 100, label: 'Rozdzielnica WN' },
    /** L2: Transformatory WN/SN */
    L2_WN_SN_TRANSFORMER: { index: 2, yOffset: 180, label: 'Transformator WN/SN' },
    /** L3: Rozdzielnica SN + Szyny SN */
    L3_SN_BUSBAR: { index: 3, yOffset: 280, label: 'Rozdzielnica SN' },
    /** L4: Pola liniowe SN */
    L4_SN_BAY: { index: 4, yOffset: 340, label: 'Pole liniowe SN' },
    /** L5: Łączniki odgałęzień SN */
    L5_SN_BRANCH_SWITCH: { index: 5, yOffset: 420, label: 'Łącznik odgałęzienia SN' },
    /** L6: Przyłącza SN (kable) */
    L6_SN_CABLE: { index: 6, yOffset: 500, label: 'Przyłącze SN' },
    /** L7: Rozdzielnice SN stacji */
    L7_STATION_SN_SWITCHGEAR: { index: 7, yOffset: 580, label: 'Rozdzielnica SN stacji' },
    /** L8: Wyłączniki SN transformatorów */
    L8_STATION_SN_BREAKER: { index: 8, yOffset: 660, label: 'Wyłącznik SN transformatora' },
    /** L9: Transformatory SN/nn */
    L9_SN_NN_TRANSFORMER: { index: 9, yOffset: 740, label: 'Transformator SN/nn' },
    /** L10: Szyny nn */
    L10_NN_BUSBAR: { index: 10, yOffset: 840, label: 'Szyna nn' },
    /** L11: Rozdzielnice nn */
    L11_NN_SWITCHGEAR: { index: 11, yOffset: 920, label: 'Rozdzielnica nn' },
    /** L12: Falowniki / Odbiory */
    L12_INVERTER_LOAD: { index: 12, yOffset: 1000, label: 'Falownik / Odbior' },
  },

  /** Layer spacing between canonical layers (default) */
  canonicalLayerSpacing: 80,

  // ---------------------------------------------------------------------------
  // BUSBAR CONFIGURATION
  // ---------------------------------------------------------------------------

  /** Busbar vertical layer configuration (top to bottom) - LEGACY, use canonicalLayers */
  busbarLayers: {
    /** WN (110kV) busbar layer offset from top */
    WN: 100,
    /** SN (15/20kV) busbar layer offset from WN */
    SN: 280,
    /** nN (0.4kV) busbar layer offset from SN (if present) */
    nN: 200,
  },

  /** Busbar dimensions */
  busbar: {
    /** Minimum busbar width (px) */
    minWidth: 200,
    /** Busbar height/thickness (px) */
    height: 8,
    /** Padding on each side for bay connections (px) */
    sidePadding: 40,
    /** Per-bay width increment (px) — per kontrakt §1.3: GRID_SPACING_MAIN = 280 */
    bayWidthIncrement: 280,
  },

  /** Sectioned busbar configuration (CANONICAL-grade) */
  busbarSection: {
    /** Gap between busbar sections for coupler/sprzęgło (px) */
    sectionGap: 60,
    /** Coupler symbol width (px) */
    couplerWidth: 40,
    /** Minimum section width (px) */
    minSectionWidth: 120,
    /** Section side padding (px) */
    sectionPadding: 30,
  },

  // ---------------------------------------------------------------------------
  // BAY/FEEDER CONFIGURATION (SN FEEDERS)
  // ---------------------------------------------------------------------------

  /** Bay (pola SN) spacing and layout */
  bay: {
    /**
     * Horizontal spacing between station center lines (px).
     * Per Industrial Aesthetics Contract §1.3: GRID_SPACING_MAIN = 14*GRID_BASE = 280
     */
    spacing: 280,
    /** Minimum horizontal spacing (px) */
    minSpacing: 280,
    /** Vertical offset from SN busbar to first bay element (px) — OFFSET_POLE = 3*GRID_BASE = 60 */
    verticalOffset: 60,
    /** Vertical spacing between bay elements (switch → line/load) (px) */
    elementSpacing: 60,
  },

  // ---------------------------------------------------------------------------
  // TRANSFORMER CONFIGURATION (MULTI-TRANSFORMER CANONICAL-GRADE)
  // ---------------------------------------------------------------------------

  /** Transformer positioning */
  transformer: {
    /** Vertical offset below WN busbar to transformer top (px) */
    offsetFromWN: 80,
    /** Vertical offset from transformer bottom to SN busbar (px) */
    offsetToSN: 80,
    /** Transformer symbol height (px) — for calculating connections */
    symbolHeight: 56,
    /** Horizontal spacing between parallel transformers (px) — CANONICAL-grade */
    parallelSpacing: 120,
    /** Minimum spacing between transformer centers (px) */
    minSpacing: 100,
  },

  // ---------------------------------------------------------------------------
  // SOURCE CONFIGURATION (INFEED)
  // ---------------------------------------------------------------------------

  /** Source (utility feeder / generator) positioning */
  source: {
    /** Vertical offset above WN busbar (px) */
    offsetAboveBusbar: 80,
    /** Source symbol height (px) */
    symbolHeight: 60,
  },

  // ---------------------------------------------------------------------------
  // LOAD CONFIGURATION
  // ---------------------------------------------------------------------------

  /** Load positioning */
  load: {
    /** Vertical offset below feeder/switch (px) */
    offsetBelowFeeder: 60,
    /** Load symbol height (px) */
    symbolHeight: 44,
  },

  // ---------------------------------------------------------------------------
  // STATION STACK CONFIGURATION (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  // ---------------------------------------------------------------------------

  /**
   * Station stack layout for PV/BESS/FW/Consumer stations.
   *
   * CANONICAL CANONICAL ORDER (top to bottom):
   * 1. SN Switchgear (rozdzielnica SN stacji)
   * 2. SN Breaker (wyłącznik SN transformatora)
   * 3. SN/nn Transformer
   * 4. nn Busbar (0,4 / 0,69 / 0,8 kV)
   * 5. nn Switchgear (rozdzielnica nn)
   * 6. Inverters / Loads (falowniki PV/BESS/FW / odbiory)
   */
  stationStack: {
    /** Horizontal offset from spine for station branches (px) */
    horizontalOffset: 120,
    /** Vertical spacing between stack elements (px) */
    elementSpacing: 80,
    /** SN switchgear to SN breaker spacing (px) */
    snSwitchgearToBreaker: 60,
    /** SN breaker to transformer spacing (px) */
    breakerToTransformer: 60,
    /** Transformer to nn busbar spacing (px) */
    transformerToNnBusbar: 80,
    /** nn busbar to nn switchgear spacing (px) */
    nnBusbarToSwitchgear: 60,
    /** nn switchgear to inverter/load spacing (px) */
    nnSwitchgearToInverter: 60,
    /** Width of station stack (for bounding) (px) */
    stackWidth: 200,
    /** Minimum spacing between parallel station stacks (px) */
    parallelStackSpacing: 160,
  },

  // ---------------------------------------------------------------------------
  // CONNECTION ROUTING
  // ---------------------------------------------------------------------------

  /** Connection routing rules */
  routing: {
    /** Connections from busbar must be orthogonal (vertical/horizontal) */
    busbarOrthogonal: true,
    /** Minimum vertical segment length from busbar (px) */
    minBusbarExitLength: 40,
    /** Corridor offset from spine for L/Z routes (px) */
    corridorOffset: 40,
    /** Prefer vertical-first routing */
    preferVertical: true,
  },

  // ---------------------------------------------------------------------------
  // LABEL COLLISION HANDLING
  // ---------------------------------------------------------------------------

  /** Label collision detection and resolution */
  labelCollision: {
    /** Minimum clearance between labels (px) */
    labelLabelClearance: 12,
    /** Minimum clearance between label and symbol (px) */
    labelSymbolClearance: 8,
    /** Maximum nudge distance for collision resolution (px) */
    maxNudgeDistance: 40,
    /** Nudge step size (px) */
    nudgeStep: 8,
    /** Prefer horizontal nudge for label collisions */
    preferHorizontalNudge: true,
  },

  // ---------------------------------------------------------------------------
  // GLOBAL LAYOUT
  // ---------------------------------------------------------------------------

  /** Global layout parameters */
  layout: {
    /** Grid snap size (px) — all positions snap to this */
    gridSize: 20,
    /** Canvas padding from edges (px) */
    padding: 80,
    /** Vertical layer spacing for hierarchical layout (px) */
    layerSpacing: 140,
    /** Horizontal node spacing within a layer (px) */
    nodeSpacing: 100,
  },

  // ---------------------------------------------------------------------------
  // CANONICAL CANONICAL SPINE (PION GŁÓWNY)
  // ---------------------------------------------------------------------------

  /** Canonical spine configuration for CANONICAL-grade layout */
  spine: {
    /** Enforce strict vertical spine (no L/Z on main path) */
    strictVertical: true,
    /** Main spine elements: Source → WN → Trafo → SN (in order) */
    mainPathElements: ['Source', 'Bus', 'TransformerBranch', 'Bus'] as const,
    /** Spine tolerance for alignment check (px) */
    alignmentTolerance: 10,
  },

  // ---------------------------------------------------------------------------
  // GEOMETRY VALIDATION (NO FLOATING SYMBOL)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // VIEWPORT (FIT-TO-CONTENT)
  // ---------------------------------------------------------------------------

  /** Viewport defaults for fit-to-content actions */
  view: {
    /** Padding around fitted content (px) */
    fitPaddingPx: 40,
  },

  /** Validation rules for CANONICAL geometry compliance */
  validation: {
    /** Enable NO FLOATING SYMBOL rule (G-04) */
    noFloatingSymbol: true,
    /** Require every symbol to have connection to bus/trafo/source */
    requireConnection: true,
    /** Show warning banner in UI for floating symbols */
    showFloatingWarning: true,
    /** Enable SN branch switching validation (V-06) */
    requireSnBranchSwitching: true,
    /** Enable transformer breaker validation (V-07) */
    requireTransformerBreakers: true,
  },

  // ---------------------------------------------------------------------------
  // QUARANTINE ZONE (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  // ---------------------------------------------------------------------------

  /**
   * Quarantine zone configuration for invalid topology elements.
   *
   * CANONICAL RULE: Elementy niepoprawne → QUARANTINE ZONE + panel błędów.
   * Nigdy "pół-schemat" — albo poprawna topologia, albo QUARANTINE.
   */
  quarantineZone: {
    /** Enable quarantine zone for invalid elements */
    enabled: true,
    /** Quarantine zone Y offset from bottom of valid layout (px) */
    yOffsetFromLayout: 200,
    /** Quarantine zone label */
    label: 'STREFA KWARANTANNY — elementy z błędami topologii',
    /** Background color for quarantine zone */
    backgroundColor: 'rgba(220, 38, 38, 0.05)', // red-600 with low opacity
    /** Border color for quarantine zone */
    borderColor: '#DC2626', // red-600
    /** Spacing between quarantined elements (px) */
    elementSpacing: 100,
    /** Padding around quarantine zone (px) */
    padding: 40,
  },

  // ---------------------------------------------------------------------------
  // BoundaryNode FILTERING (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  // ---------------------------------------------------------------------------

  /**
   * BoundaryNode (Point of Common Coupling) filtering rules.
   *
   * CANON: BoundaryNode NIE JEST RYSOWANE w SLD.
   * BoundaryNode jest koncepcją biznesową, nie fizyczną — należy do warstwy analizy.
   */
  pccFiltering: {
    /** Enable BoundaryNode node filtering from render graph */
    filterPccNodes: true,
    /** BoundaryNode name patterns to filter (case-insensitive) */
    pccNamePatterns: ['connection_node', 'point of common coupling', 'punkt przyłączenia'],
    /** BoundaryNode element type patterns to filter */
    pccTypePatterns: ['connection_node', 'connection_point', 'virtual_node'],
  },

  // ---------------------------------------------------------------------------
  // EMPTY STATE (PR-SLD-CANONICAL-TOPOLOGY-LAYOUT-FINAL)
  // ---------------------------------------------------------------------------

  /**
   * Empty state configuration for when topology is invalid.
   *
   * CANONICAL RULE: Brak poprawnej topologii → EMPTY STATE.
   */
  emptyState: {
    /** Enable empty state display */
    enabled: true,
    /** Empty state message */
    message: 'Brak poprawnej topologii — dodaj elementy lub napraw błędy',
    /** Empty state icon */
    icon: 'grid_off',
    /** Show validation errors in empty state */
    showValidationErrors: true,
  },
} as const;

/**
 * Calculate busbar width based on number of bays.
 * DETERMINISTIC: Same bay count → same width.
 *
 * @param bayCount - Number of bays/feeders connected to the busbar
 * @returns Busbar width in pixels
 */
export function calculateBusbarWidth(bayCount: number): number {
  const { minWidth, sidePadding, bayWidthIncrement } = CANONICAL_GEOMETRY.busbar;

  // Minimum width + padding on each side + increment per bay
  const calculatedWidth = sidePadding * 2 + Math.max(1, bayCount) * bayWidthIncrement;

  // Return max of calculated and minimum
  return Math.max(minWidth, calculatedWidth);
}

/**
 * Calculate bay positions along a busbar.
 * DETERMINISTIC: Same bay count → same positions.
 *
 * @param bayCount - Number of bays
 * @param busbarCenterX - X coordinate of busbar center
 * @param busbarWidth - Width of the busbar
 * @returns Array of X positions for each bay
 */
export function calculateBayPositions(
  bayCount: number,
  busbarCenterX: number,
  busbarWidth: number
): number[] {
  if (bayCount === 0) return [];

  const { sidePadding } = CANONICAL_GEOMETRY.busbar;
  const usableWidth = busbarWidth - 2 * sidePadding;

  if (bayCount === 1) {
    // Single bay centered
    return [busbarCenterX];
  }

  // Multiple bays: evenly distributed
  const positions: number[] = [];
  const startX = busbarCenterX - usableWidth / 2;
  const spacing = usableWidth / (bayCount - 1);

  for (let i = 0; i < bayCount; i++) {
    const x = startX + i * spacing;
    // Snap to grid
    const snapped = Math.round(x / CANONICAL_GEOMETRY.layout.gridSize) * CANONICAL_GEOMETRY.layout.gridSize;
    positions.push(snapped);
  }

  return positions;
}

/**
 * Calculate transformer positions for parallel transformers.
 * DETERMINISTIC: Same transformer count → same positions.
 *
 * @param transformerCount - Number of parallel transformers
 * @param centerX - X coordinate of the spine center
 * @returns Array of X positions for each transformer
 */
export function calculateTransformerPositions(
  transformerCount: number,
  centerX: number
): number[] {
  if (transformerCount === 0) return [];

  const { parallelSpacing, minSpacing } = CANONICAL_GEOMETRY.transformer;
  const gridSize = CANONICAL_GEOMETRY.layout.gridSize;
  const spacing = Math.max(parallelSpacing, minSpacing);

  if (transformerCount === 1) {
    // Single transformer centered on spine
    return [Math.round(centerX / gridSize) * gridSize];
  }

  // Multiple transformers: evenly distributed around center
  const positions: number[] = [];
  const totalWidth = (transformerCount - 1) * spacing;
  const startX = centerX - totalWidth / 2;

  for (let i = 0; i < transformerCount; i++) {
    const x = startX + i * spacing;
    const snapped = Math.round(x / gridSize) * gridSize;
    positions.push(snapped);
  }

  return positions;
}

/**
 * Busbar section definition for sectioned busbars.
 */
export interface BusbarSection {
  /** Section identifier (e.g., 'A', 'B') */
  sectionId: string;
  /** Start X position of this section */
  startX: number;
  /** End X position of this section */
  endX: number;
  /** Width of this section */
  width: number;
  /** Bay indices assigned to this section */
  bayIndices: number[];
}

/**
 * Calculate sectioned busbar layout.
 * DETERMINISTIC: Same bay count and section count → same layout.
 *
 * @param totalBayCount - Total number of bays across all sections
 * @param sectionCount - Number of sections (1 = no sectioning)
 * @param centerX - X coordinate of the busbar center
 * @returns Object with sections and total width
 */
export function calculateSectionedBusbar(
  totalBayCount: number,
  sectionCount: number,
  centerX: number
): { sections: BusbarSection[]; totalWidth: number; couplerPositions: number[] } {
  const gridSize = CANONICAL_GEOMETRY.layout.gridSize;
  // Note: couplerWidth is available in CANONICAL_GEOMETRY.busbarSection for future rendering enhancements
  const { sectionGap, minSectionWidth, sectionPadding } = CANONICAL_GEOMETRY.busbarSection;
  const { bayWidthIncrement } = CANONICAL_GEOMETRY.busbar;

  // No sectioning case
  if (sectionCount <= 1) {
    const width = calculateBusbarWidth(totalBayCount);
    return {
      sections: [{
        sectionId: 'A',
        startX: centerX - width / 2,
        endX: centerX + width / 2,
        width,
        bayIndices: Array.from({ length: totalBayCount }, (_, i) => i),
      }],
      totalWidth: width,
      couplerPositions: [],
    };
  }

  // Distribute bays across sections
  const baysPerSection = Math.ceil(totalBayCount / sectionCount);
  const sections: BusbarSection[] = [];
  const couplerPositions: number[] = [];

  let currentBayIndex = 0;
  let currentX = 0;

  for (let s = 0; s < sectionCount; s++) {
    const sectionBayCount = Math.min(baysPerSection, totalBayCount - currentBayIndex);
    const sectionWidth = Math.max(
      minSectionWidth,
      sectionPadding * 2 + sectionBayCount * bayWidthIncrement
    );

    const bayIndices: number[] = [];
    for (let b = 0; b < sectionBayCount; b++) {
      bayIndices.push(currentBayIndex++);
    }

    sections.push({
      sectionId: String.fromCharCode(65 + s), // 'A', 'B', 'C', ...
      startX: currentX,
      endX: currentX + sectionWidth,
      width: sectionWidth,
      bayIndices,
    });

    currentX += sectionWidth;

    // Add coupler position between sections (except after last section)
    if (s < sectionCount - 1) {
      couplerPositions.push(currentX + sectionGap / 2);
      currentX += sectionGap;
    }
  }

  const totalWidth = currentX;

  // Center the entire busbar around centerX
  const offsetX = centerX - totalWidth / 2;
  for (const section of sections) {
    section.startX = Math.round((section.startX + offsetX) / gridSize) * gridSize;
    section.endX = Math.round((section.endX + offsetX) / gridSize) * gridSize;
  }
  for (let i = 0; i < couplerPositions.length; i++) {
    couplerPositions[i] = Math.round((couplerPositions[i] + offsetX) / gridSize) * gridSize;
  }

  return { sections, totalWidth, couplerPositions };
}

/**
 * Calculate bay positions within a busbar section.
 * DETERMINISTIC: Same section → same bay positions.
 *
 * @param section - The busbar section
 * @returns Array of X positions for each bay in the section
 */
export function calculateSectionBayPositions(section: BusbarSection): number[] {
  const { sectionPadding } = CANONICAL_GEOMETRY.busbarSection;
  const gridSize = CANONICAL_GEOMETRY.layout.gridSize;
  const bayCount = section.bayIndices.length;

  if (bayCount === 0) return [];

  const usableWidth = section.width - 2 * sectionPadding;
  const sectionCenterX = (section.startX + section.endX) / 2;

  if (bayCount === 1) {
    return [Math.round(sectionCenterX / gridSize) * gridSize];
  }

  const positions: number[] = [];
  const startX = section.startX + sectionPadding;
  const spacing = usableWidth / (bayCount - 1);

  for (let i = 0; i < bayCount; i++) {
    const x = startX + i * spacing;
    positions.push(Math.round(x / gridSize) * gridSize);
  }

  return positions;
}

/**
 * Check if a symbol is on the canonical spine.
 * DETERMINISTIC: Position-based check with tolerance.
 *
 * @param symbolX - X position of the symbol
 * @param spineX - X position of the spine
 * @returns true if the symbol is on the spine
 */
export function isOnSpine(symbolX: number, spineX: number): boolean {
  const tolerance = CANONICAL_GEOMETRY.spine.alignmentTolerance;
  return Math.abs(symbolX - spineX) <= tolerance;
}

/**
 * Label bounding box for collision detection.
 */
export interface LabelBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  ownerId: string;
}

/**
 * Check if two bounding boxes collide with given clearance.
 */
export function checkBoundingBoxCollision(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  clearance: number
): boolean {
  const aLeft = a.x - a.width / 2 - clearance;
  const aRight = a.x + a.width / 2 + clearance;
  const aTop = a.y - a.height / 2 - clearance;
  const aBottom = a.y + a.height / 2 + clearance;

  const bLeft = b.x - b.width / 2;
  const bRight = b.x + b.width / 2;
  const bTop = b.y - b.height / 2;
  const bBottom = b.y + b.height / 2;

  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}

/**
 * Resolve label-label collisions deterministically.
 * Returns adjusted positions for labels that collide.
 *
 * DETERMINISTIC: Labels sorted by owner ID, then nudged in consistent direction.
 *
 * @param labels - Array of label bounding boxes
 * @returns Map of ownerId → adjusted position
 */
export function resolveLabelCollisions(
  labels: LabelBoundingBox[]
): Map<string, { x: number; y: number }> {
  const adjustments = new Map<string, { x: number; y: number }>();
  const { labelLabelClearance, maxNudgeDistance, nudgeStep, preferHorizontalNudge } =
    CANONICAL_GEOMETRY.labelCollision;

  // Sort by owner ID for determinism
  const sortedLabels = [...labels].sort((a, b) => a.ownerId.localeCompare(b.ownerId));

  // Track adjusted positions
  const adjusted: LabelBoundingBox[] = [];

  for (const label of sortedLabels) {
    const currentPos = { x: label.x, y: label.y };
    let hasCollision = true;
    let nudgeCount = 0;

    while (hasCollision && nudgeCount * nudgeStep < maxNudgeDistance) {
      hasCollision = false;

      for (const existing of adjusted) {
        if (
          checkBoundingBoxCollision(
            { ...label, x: currentPos.x, y: currentPos.y },
            existing,
            labelLabelClearance
          )
        ) {
          hasCollision = true;
          // Nudge away from collision
          nudgeCount++;
          if (preferHorizontalNudge) {
            // Alternate left/right based on nudge count
            currentPos.x = label.x + (nudgeCount % 2 === 0 ? -1 : 1) * Math.ceil(nudgeCount / 2) * nudgeStep;
          } else {
            // Nudge down
            currentPos.y = label.y + nudgeCount * nudgeStep;
          }
          break;
        }
      }
    }

    // Store adjustment if position changed
    if (currentPos.x !== label.x || currentPos.y !== label.y) {
      adjustments.set(label.ownerId, currentPos);
    }

    // Add to adjusted list with current position
    adjusted.push({ ...label, x: currentPos.x, y: currentPos.y });
  }

  return adjustments;
}

// =============================================================================
// LINE LABEL PLACEMENT (CANONICAL 1:1 — ON-LINE LABELS)
// =============================================================================

/**
 * Segment of a connection polyline.
 * Used for deterministic label placement selection.
 */
export interface LineSegment {
  /** Start point */
  start: { x: number; y: number };
  /** End point */
  end: { x: number; y: number };
  /** Segment index in original path */
  index: number;
  /** Segment length (pixels) */
  length: number;
  /** Orientation: 'horizontal' | 'vertical' | 'diagonal' */
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  /** Midpoint of segment */
  midpoint: { x: number; y: number };
  /** Perpendicular direction for label offset (normalized) */
  perpendicular: { x: number; y: number };
}

/**
 * Label position result from placement calculation.
 */
export interface LineLabelPosition {
  /** Label anchor point (on or near the line) */
  position: { x: number; y: number };
  /** Text anchor for SVG text element */
  textAnchor: 'start' | 'middle' | 'end';
  /** Rotation angle (degrees) — 0 for horizontal, 90 for vertical */
  rotation: number;
  /** Selected segment index */
  segmentIndex: number;
  /** Offset direction applied */
  offsetDirection: 'above' | 'below' | 'left' | 'right';
}

/**
 * Calculate length of a segment.
 */
function segmentLength(
  start: { x: number; y: number },
  end: { x: number; y: number }
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Determine segment orientation.
 * DETERMINISTIC: Uses exact threshold (1px tolerance).
 */
function getSegmentOrientation(
  start: { x: number; y: number },
  end: { x: number; y: number }
): 'horizontal' | 'vertical' | 'diagonal' {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const tolerance = 1; // 1px tolerance for orthogonal detection

  if (dy <= tolerance && dx > tolerance) {
    return 'horizontal';
  }
  if (dx <= tolerance && dy > tolerance) {
    return 'vertical';
  }
  return 'diagonal';
}

/**
 * Calculate midpoint of a segment.
 */
function segmentMidpoint(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
}

/**
 * Calculate perpendicular direction for label offset.
 * DETERMINISTIC: Always returns consistent direction (normalized).
 *
 * For horizontal segments: perpendicular is (0, -1) or (0, 1) — prefer above
 * For vertical segments: perpendicular is (-1, 0) or (1, 0) — prefer left
 * For diagonal: perpendicular is computed, prefer upper-left quadrant
 */
function getPerpendicularDirection(
  start: { x: number; y: number },
  end: { x: number; y: number },
  orientation: 'horizontal' | 'vertical' | 'diagonal'
): { x: number; y: number } {
  if (orientation === 'horizontal') {
    // Perpendicular to horizontal is vertical — prefer ABOVE (negative Y)
    return { x: 0, y: -1 };
  }

  if (orientation === 'vertical') {
    // Perpendicular to vertical is horizontal — prefer LEFT (negative X)
    return { x: -1, y: 0 };
  }

  // Diagonal: compute actual perpendicular
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    return { x: 0, y: -1 }; // Fallback for zero-length
  }

  // Perpendicular: rotate 90° counterclockwise
  let perpX = -dy / len;
  let perpY = dx / len;

  // DETERMINISTIC: Always prefer the direction that is more "up" or "left"
  // (upper-left quadrant preference)
  if (perpY > 0 || (perpY === 0 && perpX > 0)) {
    perpX = -perpX;
    perpY = -perpY;
  }

  return { x: perpX, y: perpY };
}

/**
 * Parse path into segments with computed properties.
 */
export function parsePathSegments(
  path: { x: number; y: number }[]
): LineSegment[] {
  if (!path || path.length < 2) {
    return [];
  }

  const segments: LineSegment[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];
    const length = segmentLength(start, end);
    const orientation = getSegmentOrientation(start, end);
    const midpoint = segmentMidpoint(start, end);
    const perpendicular = getPerpendicularDirection(start, end, orientation);

    segments.push({
      start,
      end,
      index: i,
      length,
      orientation,
      midpoint,
      perpendicular,
    });
  }

  return segments;
}

/**
 * Select best segment for label placement.
 * DETERMINISTIC: Longest segment wins, with tie-breaks.
 *
 * Tie-break rules (in order):
 * 1. Longest segment
 * 2. Prefer horizontal over vertical over diagonal
 * 3. Lower segment index
 */
export function selectLabelSegment(segments: LineSegment[]): LineSegment | null {
  if (!segments || segments.length === 0) {
    return null;
  }

  // Sort with deterministic tie-breaking
  const sorted = [...segments].sort((a, b) => {
    // Primary: longest segment first
    const lengthDiff = b.length - a.length;
    if (Math.abs(lengthDiff) > 0.1) {
      return lengthDiff;
    }

    // Tie-break 1: orientation priority (horizontal > vertical > diagonal)
    const orientationPriority = {
      horizontal: 0,
      vertical: 1,
      diagonal: 2,
    };
    const orientDiff =
      orientationPriority[a.orientation] - orientationPriority[b.orientation];
    if (orientDiff !== 0) {
      return orientDiff;
    }

    // Tie-break 2: lower index
    return a.index - b.index;
  });

  return sorted[0];
}

/**
 * Calculate label position for a line/cable connection.
 * Uses CANONICAL_LINE_LABEL tokens for offset and placement.
 *
 * @param path - Connection path (polyline points)
 * @param connectionId - Connection ID (for determinism in edge cases)
 * @returns Label position or null if path is too short
 */
export function calculateLineLabelPosition(
  path: { x: number; y: number }[],
  _connectionId?: string
): LineLabelPosition | null {
  const segments = parsePathSegments(path);

  if (segments.length === 0) {
    return null;
  }

  const selectedSegment = selectLabelSegment(segments);

  if (!selectedSegment) {
    return null;
  }

  // Apply offset perpendicular to the line
  const offset = CANONICAL_LINE_LABEL.offset;
  const labelX = selectedSegment.midpoint.x + selectedSegment.perpendicular.x * offset;
  const labelY = selectedSegment.midpoint.y + selectedSegment.perpendicular.y * offset;

  // Determine offset direction for debugging/testing
  let offsetDirection: 'above' | 'below' | 'left' | 'right';
  if (selectedSegment.orientation === 'horizontal') {
    offsetDirection = selectedSegment.perpendicular.y < 0 ? 'above' : 'below';
  } else if (selectedSegment.orientation === 'vertical') {
    offsetDirection = selectedSegment.perpendicular.x < 0 ? 'left' : 'right';
  } else {
    // Diagonal: use primary direction
    offsetDirection =
      Math.abs(selectedSegment.perpendicular.y) > Math.abs(selectedSegment.perpendicular.x)
        ? selectedSegment.perpendicular.y < 0
          ? 'above'
          : 'below'
        : selectedSegment.perpendicular.x < 0
          ? 'left'
          : 'right';
  }

  // Calculate rotation (0 for horizontal labels, may extend for rotated labels later)
  // CANONICAL standard: labels are always horizontal for readability
  const rotation = 0;

  return {
    position: { x: labelX, y: labelY },
    textAnchor: 'middle',
    rotation,
    segmentIndex: selectedSegment.index,
    offsetDirection,
  };
}

/**
 * Check if a label position would collide with a symbol bounding box.
 * Used for collision detection in auto-layout.
 *
 * @param labelPosition - Label anchor position
 * @param labelWidth - Estimated label width
 * @param labelHeight - Estimated label height
 * @param symbolBounds - Symbol bounding box { x, y, width, height }
 * @param clearance - Minimum clearance (pixels)
 */
export function checkLabelSymbolCollision(
  labelPosition: { x: number; y: number },
  labelWidth: number,
  labelHeight: number,
  symbolBounds: { x: number; y: number; width: number; height: number },
  clearance: number = CANONICAL_LINE_LABEL.haloPadding * 2
): boolean {
  // Label bounding box (centered at position)
  const labelLeft = labelPosition.x - labelWidth / 2 - clearance;
  const labelRight = labelPosition.x + labelWidth / 2 + clearance;
  const labelTop = labelPosition.y - labelHeight / 2 - clearance;
  const labelBottom = labelPosition.y + labelHeight / 2 + clearance;

  // Symbol bounding box
  const symbolLeft = symbolBounds.x;
  const symbolRight = symbolBounds.x + symbolBounds.width;
  const symbolTop = symbolBounds.y;
  const symbolBottom = symbolBounds.y + symbolBounds.height;

  // Check AABB intersection
  const overlapsX = labelLeft < symbolRight && labelRight > symbolLeft;
  const overlapsY = labelTop < symbolBottom && labelBottom > symbolTop;

  return overlapsX && overlapsY;
}

/**
 * Apply minimal nudge to avoid collision.
 * DETERMINISTIC: Uses fixed direction preference.
 *
 * @param labelPosition - Original label position
 * @param segment - Selected segment (for direction preference)
 * @param nudgeDistance - Distance to nudge (default: 2x offset)
 * @returns Nudged position
 */
export function nudgeLabelPosition(
  labelPosition: { x: number; y: number },
  segment: LineSegment,
  nudgeDistance: number = CANONICAL_LINE_LABEL.offset * 2
): { x: number; y: number } {
  // Nudge further in the perpendicular direction
  return {
    x: labelPosition.x + segment.perpendicular.x * nudgeDistance,
    y: labelPosition.y + segment.perpendicular.y * nudgeDistance,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get voltage color from kV value.
 */
export function getCanonicalVoltageColor(voltageKV: number | string | undefined): string {
  if (voltageKV === undefined || voltageKV === null) {
    return CANONICAL_VOLTAGE_COLORS.default;
  }
  const key = String(voltageKV);
  const level = CANONICAL_VOLTAGE_MAP[key];
  return level ? CANONICAL_VOLTAGE_COLORS[level] : CANONICAL_VOLTAGE_COLORS.default;
}

/**
 * Get stroke color based on state.
 */
export function getCanonicalStrokeColor(options: {
  voltageKV?: number | string;
  energized?: boolean;
  selected?: boolean;
  inService?: boolean;
}): string {
  const { voltageKV, energized = true, selected = false, inService = true } = options;

  // Selection takes priority
  if (selected) {
    return CANONICAL_STATE_COLORS.selected;
  }

  // Out of service
  if (!inService) {
    return CANONICAL_STATE_COLORS.outOfService;
  }

  // De-energized
  if (!energized) {
    return CANONICAL_STATE_COLORS.deenergized;
  }

  // Energized — use voltage color
  return getCanonicalVoltageColor(voltageKV);
}

/**
 * Get fill color based on state.
 */
export function getCanonicalFillColor(options: {
  selected?: boolean;
  energized?: boolean;
  inService?: boolean;
}): string {
  const { selected = false, energized = true, inService = true } = options;

  if (selected) {
    return CANONICAL_FILL_COLORS.selected;
  }

  if (!energized || !inService) {
    return CANONICAL_FILL_COLORS.deenergized;
  }

  return CANONICAL_FILL_COLORS.normal;
}

/**
 * Get opacity based on state.
 */
export function getCanonicalOpacity(options: {
  inService?: boolean;
  energized?: boolean;
}): number {
  const { inService = true, energized = true } = options;

  if (!inService) {
    return 0.5;
  }

  if (!energized) {
    return 0.7;
  }

  return 1;
}

/**
 * Label anchor type for consistency.
 */
export type CanonicalLabelAnchor = {
  position: 'top' | 'bottom' | 'left' | 'right';
  offsetX: number;
  offsetY: number;
  textAnchor: 'start' | 'middle' | 'end';
};

/**
 * Get label anchor for element type.
 */
export function getCanonicalLabelAnchor(
  elementType: keyof typeof CANONICAL_LABEL_ANCHORS | string
): CanonicalLabelAnchor {
  const anchor = CANONICAL_LABEL_ANCHORS[elementType as keyof typeof CANONICAL_LABEL_ANCHORS];
  if (anchor) {
    return anchor as CanonicalLabelAnchor;
  }
  return CANONICAL_LABEL_ANCHORS.default as CanonicalLabelAnchor;
}

/**
 * Get symbol size for element type.
 */
export function getCanonicalSymbolSize(
  elementType: keyof typeof CANONICAL_SYMBOL_SIZES | string
): { width: number; height: number } {
  return (
    CANONICAL_SYMBOL_SIZES[elementType as keyof typeof CANONICAL_SYMBOL_SIZES] ??
    CANONICAL_SYMBOL_SIZES.default
  );
}

/**
 * Get stroke width by layer type.
 */
export function getCanonicalStrokeWidth(
  layer: keyof typeof CANONICAL_STROKE,
  selected: boolean = false
): number {
  return selected ? CANONICAL_STROKE_SELECTED[layer] : CANONICAL_STROKE[layer];
}

// Backward-compatible named aliases kept until all legacy imports are removed.
export const getKrokVoltageColor = getCanonicalVoltageColor;
export const getKrokStrokeColor = getCanonicalStrokeColor;
export const getKrokFillColor = getCanonicalFillColor;
export const getKrokOpacity = getCanonicalOpacity;
export const getKrokStrokeWidth = getCanonicalStrokeWidth;

// =============================================================================
// CANONICAL SLD STYLES (IEC 61082 / CANONICAL / ABB / DIgSILENT)
// =============================================================================

/**
 * Consolidated canonical SLD style tokens for industrial-grade rendering.
 *
 * USAGE: Import this object in all canonical renderers.
 * Single source of truth for stroke, color, font, spacing.
 */
export const CANONICAL_SLD_STYLES = {
  /** Trunk spine (magistrala główna) */
  trunkSpine: {
    strokeWidth: 5,
    color: CANONICAL_VOLTAGE_COLORS.SN,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  },
  /** Branch line (odgałęzienie kabel/napowietrzna) */
  branchLine: {
    strokeWidth: 2.5,
    color: CANONICAL_VOLTAGE_COLORS.SN,
    overheadDash: '12 6',
    cableDash: 'none',
  },
  /** Station internal line (łańcuch aparatów) */
  stationInternal: {
    strokeWidth: 2,
    color: CANONICAL_VOLTAGE_COLORS.SN,
  },
  /** Overhead line differentiation */
  overheadLine: {
    strokeDasharray: '12 6',
    strokeWidth: 2.5,
  },
  /** Cable line differentiation */
  cableLine: {
    strokeDasharray: 'none',
    strokeWidth: 2.5,
  },
  /** Junction dot (IEC 61082) */
  junctionDot: {
    radius: 4,
    fillColor: 'currentColor',
    hoverTransition: 'opacity 0.15s ease',
  },
  /** Power flow direction arrow */
  powerArrow: {
    size: 8,
    strokeWidth: 1.5,
    generationColor: '#10B981',
    loadColor: '#6B7280',
  },
  /** Node label (nazwa węzła na magistrali) */
  nodeLabel: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', 'Inter', monospace",
    fill: '#1F2937',
    offsetX: -20,
  },
  /** Segment label (nazwa odcinka/kabla) */
  segmentLabel: {
    fontSize: 10,
    fontWeight: 500,
    fontFamily: "'Inter', sans-serif",
    fill: '#374151',
  },
  /** Segment parameters (długość, przekrój, typ) */
  segmentParams: {
    fontSize: 9,
    fontWeight: 400,
    fontFamily: "'Inter', sans-serif",
    fill: '#6B7280',
  },
  /** Apparatus label (oznaczenie aparatu w łańcuchu) */
  apparatusLabel: {
    fontSize: 9,
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', 'Inter', monospace",
    fill: '#374151',
  },
  /** Station title (nazwa stacji) */
  stationTitle: {
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Inter', sans-serif",
    fill: '#111827',
  },
  /** IEC 81346 designation (Q0, T1, -W01 etc.) */
  iecDesignation: {
    fontSize: 8,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', 'Inter', monospace",
    fill: '#6B7280',
  },
} as const;

// =============================================================================
// EXPORT DEFAULT
// =============================================================================

export default {
  // Stroke hierarchy
  STROKE: CANONICAL_STROKE,
  STROKE_SELECTED: CANONICAL_STROKE_SELECTED,
  // Colors
  VOLTAGE_COLORS: CANONICAL_VOLTAGE_COLORS,
  VOLTAGE_MAP: CANONICAL_VOLTAGE_MAP,
  STATE_COLORS: CANONICAL_STATE_COLORS,
  FILL_COLORS: CANONICAL_FILL_COLORS,
  // Typography
  TYPOGRAPHY: CANONICAL_TYPOGRAPHY,
  // Labels
  LABEL_ANCHORS: CANONICAL_LABEL_ANCHORS,
  LINE_LABEL: CANONICAL_LINE_LABEL,
  // Callouts
  CALLOUT: CANONICAL_CALLOUT,
  CALLOUT_ANCHORS: CANONICAL_CALLOUT_ANCHORS,
  // Symbols
  SYMBOL_SIZES: CANONICAL_SYMBOL_SIZES,
  // Canvas (CANONICAL industrial background)
  CANVAS: CANONICAL_CANVAS,
  // Grid
  GRID: CANONICAL_GRID,
  // Geometry (PR-SLD-CANONICAL-GEOMETRY-01)
  GEOMETRY: CANONICAL_GEOMETRY,
  // Visual hierarchy (PR-SLD-UX-MAX)
  VISUAL_HIERARCHY,
  ELEMENT_HIERARCHY_MAP,
  VOLTAGE_BAND_COLORS,
  GENERATION_COLORS,
  POWER_FLOW_INDICATOR,
  BAY_TYPE_STYLES,
  HOVER_STYLES,
  SELECTION_STYLES,
  PINNED_STYLES,
  // Canonical SLD styles (IEC 61082 / CANONICAL)
  CANONICAL_SLD_STYLES,
  // Helpers
  getVoltageColor: getCanonicalVoltageColor,
  getStrokeColor: getCanonicalStrokeColor,
  getFillColor: getCanonicalFillColor,
  getOpacity: getCanonicalOpacity,
  getLabelAnchor: getCanonicalLabelAnchor,
  getSymbolSize: getCanonicalSymbolSize,
  getStrokeWidth: getCanonicalStrokeWidth,
  getVisualHierarchyLevel,
  // Line label placement (CANONICAL 1:1)
  parsePathSegments,
  selectLabelSegment,
  calculateLineLabelPosition,
  checkLabelSymbolCollision,
  nudgeLabelPosition,
  // Geometry helpers (PR-SLD-CANONICAL-GEOMETRY-01)
  calculateBusbarWidth,
  calculateBayPositions,
  checkBoundingBoxCollision,
  resolveLabelCollisions,
  // Multi-transformer and sectioned busbar (PR-SLD-CANONICAL-GEOMETRY-FULL)
  calculateTransformerPositions,
  calculateSectionedBusbar,
  calculateSectionBayPositions,
  isOnSpine,
};
