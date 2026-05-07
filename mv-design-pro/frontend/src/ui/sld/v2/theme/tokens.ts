/**
 * SLD v2 Theme Tokens — kanoniczne tokeny stylu dark CAD/SCADA (PR-5 rebuild SLD).
 *
 * Zastępują:
 * - `frontend/src/ui/sld/sldCanonicalStyle.ts` (1942 linii — wygaszane w PR-14)
 * - `frontend/src/ui/sld/IndustrialAesthetics.ts` (702 linii — wygaszane w PR-14)
 *
 * Kanon: brief 1 §6 (22 kolory + 13 wymiarów + 7 typografii).
 *
 * @see docs/sld/SLD_SYMBOL_LIBRARY.md §6 (paleta) + §4 (wymiary) + §5 (typografia)
 */

/* ---------------------------------------------------------------------------
   Paleta kolorów dark SCADA neon (brief §6)
   --------------------------------------------------------------------------- */

export const COLOR_BG = '#101316' as const; // tło główne
export const COLOR_PANEL = '#171B20' as const; // panel
export const COLOR_PANEL_RAISED = '#1E242A' as const; // panel podniesiony
export const COLOR_TOOLTIP = '#0B0E11' as const; // tooltip

export const COLOR_LINE_PRIMARY = '#F2F4F6' as const; // linia główna
export const COLOR_LINE_SECONDARY = '#C8CDD2' as const; // linia pomocnicza
export const COLOR_NODE = '#F2F4F6' as const; // węzeł połączeniowy

export const COLOR_DEVICE_CLOSED = '#07983A' as const; // aparat zamknięty
export const COLOR_DEVICE_CLOSED_BORDER = '#13C45A' as const; // obwódka zamkniętego
export const COLOR_DEVICE_OPEN = '#C9151B' as const; // aparat otwarty
export const COLOR_DEVICE_OPEN_BORDER = '#FF333D' as const; // obwódka otwartego
export const COLOR_DEVICE_UNKNOWN = '#6E737A' as const; // stan nieznany
export const COLOR_DEVICE_FAULT = '#FF2B2B' as const; // alarm

export const COLOR_TEXT_PRIMARY = '#F4F6F8' as const; // tekst główny
export const COLOR_TEXT_SECONDARY = '#B9C0C7' as const; // tekst pomocniczy
export const COLOR_TEXT_MUTED = '#7E8790' as const; // tekst przygaszony
export const COLOR_VALUE = '#FFFFFF' as const; // wartość liczbowa
export const COLOR_SELECTION = '#35C7FF' as const; // zaznaczenie

export const COLOR_WARN = '#FFB020' as const; // ostrzeżenie
export const COLOR_PARTIAL = '#FFC857' as const; // wynik częściowy
export const COLOR_REPORT_READY = '#13C45A' as const; // raport gotowy
export const COLOR_REPORT_BLOCKED = '#FF333D' as const; // raport zablokowany

/* ---------------------------------------------------------------------------
   SCADA-grade badge & decoration tokens (Phase 0A refinement)
   Wzorowane na ekranach dyspozytorskich Energa / Tauron / PSE.
   --------------------------------------------------------------------------- */

/** Tło żółtego badge'a (SPZ, ARN, SZR — auto-funkcje aktywne). */
export const COLOR_BADGE_BG_YELLOW = '#E5C828' as const;
/** Tło białego/jasnego badge'a (OWG, BKR, STYCZ. — przekaźniki). */
export const COLOR_BADGE_BG_LIGHT = '#D8DEE3' as const;
/** Tło czerwonego badge'a (SCO/NZ/LRW Zabl. — blokada/wyłączenie). */
export const COLOR_BADGE_BG_RED = '#7A1414' as const;
/** Tekst badge'a na żółtym/jasnym tle (czarny). */
export const COLOR_BADGE_TEXT_DARK = '#0B0E11' as const;
/** Status row "Zal." (zał./pracuje) — zielony. */
export const COLOR_BADGE_STATUS_OK = '#2DB54E' as const;
/** Status row "Odbl." (odblokowane / w gotowości) — szary. */
export const COLOR_BADGE_STATUS_NEUTRAL = '#9CA3A8' as const;
/** Status row "Odst./Zabl." (odstawione / zablokowane) — czerwony. */
export const COLOR_BADGE_STATUS_BLOCKED = '#FF4D4D' as const;
/** Kropka LED przycisku KAS (żółty — kanon Energa, kasowanie sygnalizacji). */
export const COLOR_KAS_LED = '#E5C828' as const;
/** Tło pola w stanie manipulacji (oliwkowe/żółte). */
export const COLOR_MANIPULATION_BG = '#5C5512' as const;
/** Marker zwarcia doziemnego (cyan/turkus — kanon SCADA). */
export const COLOR_GROUND_FAULT = '#35E1FF' as const;
/** Wartość pomiaru w panelu — biel monoszpaltowa. */
export const COLOR_MEASUREMENT_VALUE = '#FFFFFF' as const;

/* ---------------------------------------------------------------------------
   Bus voltage palette (kanon SCADA: rozróżnienie szyn po napięciu)
   Czerwony = alarm/zwarcie (NIE napięcie); biały/szary HV; cyan LV.
   --------------------------------------------------------------------------- */

/** Szyna 110 kV / WN — biały jasny (kanon Energa/Tauron, nie kolizyjny z alarmem). */
export const COLOR_BUS_HV = '#F2F4F6' as const;
/** Szyna 15/30 kV (SN) — cyan (odróżnia od deviceClosed zielonego). */
export const COLOR_BUS_LV = '#3DB4FF' as const;
/** Tekst etykiety napięcia szyny — jasnoszary z cieniowaniem. */
export const COLOR_BUS_LABEL = '#C8CDD2' as const;
/** Magistrala sieci terenowej (trunk) — zielony przy zasilaniu, neutral przy braku danych. */
export const COLOR_FIELD_TRUNK_ENERGIZED = '#13C45A' as const;
export const COLOR_FIELD_TRUNK_NEUTRAL = '#7E8790' as const;

/** Pełen rejestr kolorów dla theme provider / tests. */
export const SLD_V2_COLORS = {
  bg: COLOR_BG,
  panel: COLOR_PANEL,
  panelRaised: COLOR_PANEL_RAISED,
  tooltip: COLOR_TOOLTIP,
  linePrimary: COLOR_LINE_PRIMARY,
  lineSecondary: COLOR_LINE_SECONDARY,
  node: COLOR_NODE,
  deviceClosed: COLOR_DEVICE_CLOSED,
  deviceClosedBorder: COLOR_DEVICE_CLOSED_BORDER,
  deviceOpen: COLOR_DEVICE_OPEN,
  deviceOpenBorder: COLOR_DEVICE_OPEN_BORDER,
  deviceUnknown: COLOR_DEVICE_UNKNOWN,
  deviceFault: COLOR_DEVICE_FAULT,
  textPrimary: COLOR_TEXT_PRIMARY,
  textSecondary: COLOR_TEXT_SECONDARY,
  textMuted: COLOR_TEXT_MUTED,
  value: COLOR_VALUE,
  selection: COLOR_SELECTION,
  warn: COLOR_WARN,
  partial: COLOR_PARTIAL,
  reportReady: COLOR_REPORT_READY,
  reportBlocked: COLOR_REPORT_BLOCKED,
} as const;

/* ---------------------------------------------------------------------------
   Wymiary geometryczne (brief §6 + §7 + §9, w pikselach world space)
   --------------------------------------------------------------------------- */

export const STROKE_BUSBAR_PX = 3 as const; // szyna główna
export const STROKE_FIELD_TRACK_PX = 2 as const; // tor pola
export const STROKE_GROUND_BRANCH_PX = 2 as const; // gałąź uziemnika
export const STROKE_BRANCH_LINE_PX = 2 as const; // linia odgałęzienia (cieńsza niż trunk)
export const STROKE_TRUNK_LINE_PX = 3 as const; // linia ciągu głównego
export const STROKE_DASHED_RING_DASH_PX = '6 4' as const; // dash array dla pierścieni

export const NODE_DOT_SIZE_PX = 8 as const; // węzeł połączeniowy (zakres 7–9)
export const DEVICE_BLOCK_SMALL = { width: 38, height: 54 } as const; // mały blok aparatu
export const DEVICE_BLOCK_STANDARD = { width: 46, height: 64 } as const; // standardowy blok aparatu
export const DEVICE_GAP_PX = 3 as const; // odstęp aparatów w polu (zakres 2–4)
export const FIELD_GAP_PX = 120 as const; // odstęp pól (zakres 110–140)

export const CABLE_HEAD_TRIANGLE_PX = 20 as const; // głowica kablowa (zakres 18–22)
export const CT_SIZE_PX = 32 as const; // przekładnik prądowy (zakres 28–36)
export const VT_SIZE_PX = 36 as const; // przekładnik napięciowy (zakres 32–40)
export const TRANSFORMER_SIZE_PX = 48 as const; // transformator (zakres 42–56)
export const FIELD_MEASUREMENT_PANEL_WIDTH_PX = 140 as const; // panel pomiarowy pola (120–160)

/* ---------------------------------------------------------------------------
   Hierarchical layout grid (PR-5 — slot system)
   --------------------------------------------------------------------------- */

export const GRID_BASE_PX = 20 as const; // każda współrzędna jest wielokrotnością
export const X_GPZ_LEFT_PX = 40 as const; // pozycja GPZ
export const Y_GPZ_TOP_PX = 80 as const;
export const SECTION_WIDTH_PX = 480 as const; // sekcja w GPZ (horyzontalnie)
export const BAY_WIDTH_PX = 120 as const; // pole w sekcji (horyzontalnie)
export const Y_BUSBAR_PX = 200 as const; // szyna sekcji (Y stała)
export const DEVICE_OFFSET_TOP_PX = 60 as const; // odstęp od szyny do pierwszego aparatu
export const DEVICE_PITCH_PX = 40 as const; // odstęp aparatów w pionie pola (Y)

export const Y_RUN_START_PX = 400 as const; // start ciągu liniowego (poniżej GPZ)
export const RUN_CHANNEL_PITCH_PX = 80 as const; // odstęp między kanałami Y dla ciągów
export const STATION_PITCH_PX = 240 as const; // odstęp stacji wzdłuż ciągu
export const BRANCH_DROP_PX = 120 as const; // odstęp Y odgałęzień poniżej ciągu macierzystego
export const DER_OFFSET_X_PX = 100 as const; // przesunięcie X dla DER
export const DER_DROP_PX = 200 as const; // odstęp Y dla DER

/* ---------------------------------------------------------------------------
   Typografia (brief §6 — 7 ról)
   --------------------------------------------------------------------------- */

export const FONT_SANS = '"Inter", system-ui, sans-serif' as const;
export const FONT_MONO = '"JetBrains Mono", "Fira Code", monospace' as const;

export const FONT_SIZES = {
  /** Oznaczenia pól (sans, 16–20). */
  bayLabel: 18,
  /** Oznaczenia aparatów Q (sans, 15–18) — IEC 81346-2 (Q0/Q1/Q9/T1). */
  deviceQ: 16,
  /** Pomiary pod polem (mono, 15–18). */
  fieldMeasurement: 16,
  /** Parametry rozdzielni (sans, 18–22). */
  switchgearParams: 20,
  /** Panele techniczne (sans, 12–14). */
  technicalPanel: 13,
  /** Wartości liczbowe (mono, 12–16). */
  numericValue: 14,
  /** Statusy raportowe (sans, 12). */
  reportStatus: 12,
  /** Badge zabezpieczeń (SPZ/SCO/...) — czytelny ≥9 (audyt OSD). */
  badge: 9,
  /** Status row badge (Zal./Odbl./Odst./Zabl.). */
  badgeStatus: 8,
  /** Etykieta KAS (sans). */
  kasLabel: 9,
  /** P-numer pod LED-em KAS (mono). */
  kasPNumber: 7,
  /** Pionowa etykieta sterowania (rotowana). */
  controlMode: 9,
  /** Panel pomiarowy pola (mono). */
  measurementPanel: 10,
  /** Etykieta przekładni CT/VT. */
  transformerRatio: 8,
  /** Etykieta destination feedera. */
  feederDestination: 9,
} as const;

/* ---------------------------------------------------------------------------
   GPZ Switchgear geometry (Phase 0A operator-grade refinement)
   Zwymiarowane wg kanonu ekranu dyspozytorskiego SCADA SN/110 kV.
   --------------------------------------------------------------------------- */

/** Geometria GPZ Switchgear renderera (kanoniczne wymiary world-space). */
export const GPZ_GEOMETRY = {
  /** Pasek tytułu (góra rozdzielni). */
  titleBarHeight: 26,
  /** Wysokość kolumny HV-tower w trybie single-bus. */
  hvTowerHeight: 78,
  /** Padding wewnętrzny (poziomy + pionowy). */
  horizontalPadding: 14,
  verticalPadding: 10,
  /** Szyna sekcyjna — overhang poza ostatnie pole. */
  sectionBusOverhang: 10,
  /** Odstęp między sekcjami w polu. */
  sectionInterGap: 28,
  /** Odstęp między etykietą sekcji a pierwszym polem. */
  sectionLabelGap: 18,
  /** Pole — szerokość, wysokość, gap między polami. */
  bayColumnWidth: 64,
  bayColumnHeight: 110,
  bayGap: 6,
  /** Nagłówek pola (feeder name). */
  bayHeaderHeight: 12,
  /** Odstęp od dolnej krawędzi kolumny do numeru pola. */
  bayNumberGap: 14,
  /** Pitch aparatów w kolumnie (Y). */
  apparatusPitch: 18,
  /** Wymiary symboli aparatów (kanon IEC 60617). */
  cbSize: 9,
  dsRadius: 4.5,
  esBranchLength: 8,        // długość gałęzi bocznej uziemnika
  esBranchOffset: 8,        // przesunięcie od osi pola
  triangleSize: 6,
  ctRadius: 3.5,
  /** Pozycja kolumny aparatów (X-offset od lewej krawędzi pola). */
  apparatusColXOffset: 18,
  /** Pozycja stosu badge (X-offset od lewej krawędzi pola). */
  badgeColXOffset: 36,
  badgeWidth: 22,
  badgeLabelHeight: 8,
  badgeStatusHeight: 8,
  /** KAS button. */
  kasLedRadius: 3,
  kasRowHeight: 16,
  /** Panel pomiarów. */
  measurementRowHeight: 10,
  measurementPanelHeaderHeight: 12,
  /** Pionowa etykieta sterowania (rotowana -90°). */
  sterowanieLabelXOffset: 6,
  /** Sprzęgło. */
  couplerBayWidth: 120,
  couplerLegInset: 18,
  couplerDsOffsetY: 22,
  couplerHorizontalOffsetY: 36,
  couplerBayNumberOffsetY: 8,
  /** Two-bus: gap między HV bays bottom a LV bus (TR symbols). */
  twoBusTrGap: 84,
  twoBusTrSpacing: 80,
  /** Magistrala sieci terenowej. */
  outgoingFeederDropPx: 36,
  fieldTrunkGapPx: 16,
  /** Strzałka kierunku przepływu na trunk feeder. */
  trunkArrowSize: 5,
  /** Transformator (Y/Δ markers). */
  trRadius: 9,
  trWindingGap: 7,
  trHvLeadLen: 10,
  trLvLeadLen: 10,
  /** Y/Δ markers — większy dla operator-grade czytelności. */
  trMarkerArmLen: 6,
  trMarkerStrokeWidth: 1.6,
} as const;

/** Snap to grid — każda współrzędna musi być wielokrotnością GRID_BASE_PX. */
export function snapToGrid(value: number): number {
  return Math.round(value / GRID_BASE_PX) * GRID_BASE_PX;
}

/* ---------------------------------------------------------------------------
   Stan aparatu → styl (state→style invariant: NIGDY nie zmienia geometrii)
   --------------------------------------------------------------------------- */

export type DeviceState = 'closed' | 'open' | 'unknown' | 'fault' | 'selected';

export interface DeviceStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  className: string;
}

/**
 * Mapuje stan aparatu na styl.
 *
 * Inwariant (BINDING): styl zmienia tylko fill / stroke / class.
 * Geometria (viewBox, anchors, paths) jest niezmienna — testowane w PR-13.
 */
export function getDeviceStyle(state: DeviceState): DeviceStyle {
  switch (state) {
    case 'closed':
      return {
        fill: COLOR_DEVICE_CLOSED,
        stroke: COLOR_DEVICE_CLOSED_BORDER,
        strokeWidth: 1.5,
        className: 'sld-v2-device-closed',
      };
    case 'open':
      return {
        fill: COLOR_PANEL_RAISED,
        stroke: COLOR_DEVICE_OPEN_BORDER,
        strokeWidth: 1.5,
        className: 'sld-v2-device-open',
      };
    case 'unknown':
      return {
        fill: COLOR_DEVICE_UNKNOWN,
        stroke: COLOR_TEXT_MUTED,
        strokeWidth: 1.5,
        className: 'sld-v2-device-unknown',
      };
    case 'fault':
      return {
        fill: COLOR_DEVICE_FAULT,
        stroke: COLOR_DEVICE_OPEN_BORDER,
        strokeWidth: 2,
        className: 'sld-v2-device-fault',
      };
    case 'selected':
      return {
        fill: COLOR_DEVICE_CLOSED,
        stroke: COLOR_SELECTION,
        strokeWidth: 2.5,
        className: 'sld-v2-device-selected',
      };
  }
}
