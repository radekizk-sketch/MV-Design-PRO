/**
 * SymbolResolver — Mapowanie elementów SLD na symbole ETAP
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A.2: Symbol types mapping
 * - etap_symbols/ports.json: Port definitions for ETAP-parity SLD symbols
 *
 * BINDING CONTRACT:
 * - Bus → busbar
 * - LineBranch (LINE) → line_overhead (solid)
 * - LineBranch (CABLE) → line_cable (dashed)
 * - TransformerBranch → transformer_2w
 * - Switch (BREAKER) → circuit_breaker
 * - Switch (DISCONNECTOR) → disconnector
 * - Source → utility_feeder (fallback, brak rozróżnienia PV/FW/BESS)
 * - Load → fallback (brak symbolu w bibliotece ETAP)
 */

import type {
  AnySldSymbol,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  GeneratorSymbol,
  MeasurementSymbol,
} from '../sld-editor/types';

/**
 * Dedupe cache for console warnings.
 * Each unique message is logged at most once to avoid DevTools spam.
 */
const _warnedMessages = new Set<string>();

function warnOnce(message: string): void {
  if (!import.meta.env.DEV) return;
  if (_warnedMessages.has(message)) return;
  _warnedMessages.add(message);
  console.warn(message);
}

/**
 * Symbol ID z biblioteki ETAP.
 */
export type EtapSymbolId =
  | 'busbar'
  | 'circuit_breaker'
  | 'disconnector'
  | 'line_overhead'
  | 'line_cable'
  | 'transformer_2w'
  | 'transformer_3w'
  | 'generator'
  | 'pv'
  | 'fw'
  | 'bess'
  | 'utility_feeder'
  | 'ground'
  | 'ct'
  | 'vt'
  | 'relay'
  // Canonical SLD symbols (IEC 60617/61082)
  | 'overcurrent_relay'
  | 'directional_relay'
  | 'earthing_switch'
  | 'load_arrow'
  // Industrial canonical SLD symbols (IEC 60617/61082 — BLOK B)
  | 'fuse'
  | 'surge_arrester'
  | 'capacitor'
  | 'reactor'
  | 'inverter'
  | 'metering_cubicle'
  | 'motor'
  // Tree-specific symbols
  | 'load'
  | 'project'
  | 'catalog'
  | 'study_case'
  | 'results'
  | 'folder'
  // Station symbols
  | 'gpz_station';

/**
 * Port definition (x,y w układzie viewBox 100x100).
 */
export interface SymbolPort {
  x: number;
  y: number;
}

/**
 * Port map dla symbolu.
 */
export interface SymbolPorts {
  top?: SymbolPort;
  bottom?: SymbolPort;
  left?: SymbolPort;
  right?: SymbolPort;
}

/**
 * Styl linii (dla line_overhead vs line_cable).
 */
export interface SymbolStyle {
  strokeDasharray?: string;
  lineType?: 'solid' | 'dashed';
}

/**
 * Resolved symbol z biblioteki ETAP.
 */
export interface ResolvedSymbol {
  /** ID symbolu ETAP */
  symbolId: EtapSymbolId;
  /** viewBox dla SVG (zawsze "0 0 100 100") */
  viewBox: string;
  /** Porty do łączenia */
  ports: SymbolPorts;
  /** Dozwolone obroty (w stopniach) */
  allowedRotations: number[];
  /** Domyślny obrót */
  defaultRotation: number;
  /** Styl (dla linii) */
  style?: SymbolStyle;
  /** Opis po polsku */
  description: string;
}

/**
 * Port definitions z biblioteki ETAP (ports.json).
 * Zdefiniowane inline dla determinizmu (bez dynamicznego importu JSON).
 */
const SYMBOL_DEFINITIONS: Record<EtapSymbolId, Omit<ResolvedSymbol, 'symbolId'>> = {
  busbar: {
    description: 'Szyna zbiorcza / Busbar',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 0, y: 50 },
      right: { x: 100, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  circuit_breaker: {
    description: 'Wyłącznik / Circuit Breaker',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90, 180, 270],
    defaultRotation: 0,
  },
  disconnector: {
    description: 'Rozłącznik / Disconnector',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90, 180, 270],
    defaultRotation: 0,
  },
  line_overhead: {
    description: 'Linia napowietrzna / Overhead Line',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 0, y: 50 },
      right: { x: 100, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
    style: {
      strokeDasharray: 'none',
      lineType: 'solid',
    },
  },
  line_cable: {
    description: 'Linia kablowa / Cable Line',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 0, y: 50 },
      right: { x: 100, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
    style: {
      strokeDasharray: '8,4',
      lineType: 'dashed',
    },
  },
  transformer_2w: {
    description: 'Transformator 2-uzwojeniowy / 2-Winding Transformer',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90, 180, 270],
    defaultRotation: 0,
  },
  transformer_3w: {
    description: 'Transformator 3-uzwojeniowy / 3-Winding Transformer',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      left: { x: 0, y: 62 },
      right: { x: 100, y: 62 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  generator: {
    description: 'Generator synchroniczny / Synchronous Generator',
    viewBox: '0 0 100 100',
    ports: {
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90, 180, 270],
    defaultRotation: 0,
  },
  pv: {
    description: 'Fotowoltaika / Photovoltaic',
    viewBox: '0 0 100 100',
    ports: {
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  fw: {
    description: 'Farma wiatrowa / Wind Farm',
    viewBox: '0 0 100 100',
    ports: {
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  bess: {
    description: 'Magazyn energii / Battery Energy Storage System',
    viewBox: '0 0 100 100',
    ports: {
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 180],
    defaultRotation: 0,
  },
  utility_feeder: {
    description: 'Zasilanie z sieci / Utility Feeder',
    viewBox: '0 0 100 100',
    ports: {
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  ground: {
    description: 'Uziemienie / Ground',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  ct: {
    description: 'Przekładnik prądowy / Current Transformer',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 0, y: 50 },
      right: { x: 100, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  vt: {
    description: 'Przekładnik napięciowy / Voltage Transformer',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 0, y: 50 },
      right: { x: 100, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  relay: {
    description: 'Przekaźnik zabezpieczeniowy / Protection Relay',
    viewBox: '0 0 100 100',
    ports: {
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  // Canonical SLD symbols (IEC 60617/61082)
  overcurrent_relay: {
    description: 'Zabezpieczenie nadpradowe / Overcurrent Relay (51)',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 10, y: 50 },
      right: { x: 90, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  directional_relay: {
    description: 'Zabezpieczenie kierunkowe / Directional Relay (67)',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 10, y: 50 },
      right: { x: 90, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  earthing_switch: {
    description: 'Uziemnik / Earthing Switch',
    viewBox: '0 0 100 100',
    ports: {
      left: { x: 10, y: 50 },
      right: { x: 90, y: 50 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  load_arrow: {
    description: 'Strzalka odbioru / Load Arrow',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 10 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  // Industrial canonical SLD symbols (IEC 60617/61082 — BLOK B)
  fuse: {
    description: 'Bezpiecznik / Fuse',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  surge_arrester: {
    description: 'Ogranicznik przepiec / Surge Arrester',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  capacitor: {
    description: 'Kondensator / Capacitor',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  reactor: {
    description: 'Dławik / Reactor',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0, 90],
    defaultRotation: 0,
  },
  inverter: {
    description: 'Falownik / Inverter',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  metering_cubicle: {
    description: 'Szafka pomiarowa / Metering Cubicle',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  motor: {
    description: 'Silnik / Motor',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
  // Tree-specific symbols
  load: {
    description: 'Odbiornik / Load',
    viewBox: '0 0 100 100',
    ports: {
      top: { x: 50, y: 0 },
    },
    allowedRotations: [0, 180],
    defaultRotation: 0,
  },
  project: {
    description: 'Projekt / Project',
    viewBox: '0 0 100 100',
    ports: {},
    allowedRotations: [0],
    defaultRotation: 0,
  },
  catalog: {
    description: 'Katalog typów / Type Catalog',
    viewBox: '0 0 100 100',
    ports: {},
    allowedRotations: [0],
    defaultRotation: 0,
  },
  study_case: {
    description: 'Przypadek obliczeniowy / Study Case',
    viewBox: '0 0 100 100',
    ports: {},
    allowedRotations: [0],
    defaultRotation: 0,
  },
  results: {
    description: 'Wyniki / Results',
    viewBox: '0 0 100 100',
    ports: {},
    allowedRotations: [0],
    defaultRotation: 0,
  },
  folder: {
    description: 'Folder / Container',
    viewBox: '0 0 100 100',
    ports: {},
    allowedRotations: [0],
    defaultRotation: 0,
  },
  gpz_station: {
    description: 'Stacja GPZ / Main Supply Substation',
    viewBox: '0 0 100 100',
    ports: {
      top:    { x: 50, y: 0  },
      bottom: { x: 50, y: 100 },
    },
    allowedRotations: [0],
    defaultRotation: 0,
  },
};

/**
 * Interfejs dla rozszerzonego BranchSymbol z opcjonalnym branchType.
 * Używane do rozróżnienia LINE vs CABLE.
 */
interface ExtendedBranchSymbol extends BranchSymbol {
  branchType?: 'LINE' | 'CABLE';
}

/**
 * Typ generatora dla rozróżnienia symbolu Source/Generator.
 * Align: GeneratorKind z topologyInputReader.
 */
export type GeneratorSymbolType = 'PV' | 'WIND' | 'BESS' | 'SYNCHRONOUS';

/**
 * Interfejs dla Source z opcjonalnym rozróżnieniem typu generatora.
 */
interface ExtendedSourceSymbol extends SourceSymbol {
  generatorType?: GeneratorSymbolType;
}

/**
 * Interfejs dla Generator z rozróżnieniem typu generatora.
 */
interface ExtendedGeneratorSymbol extends GeneratorSymbol {
  generatorType?: GeneratorSymbolType;
}

/**
 * Interfejs dla Measurement z rozróżnieniem CT vs VT.
 */
interface ExtendedMeasurementSymbol extends MeasurementSymbol {
  measurementType?: 'CT' | 'VT';
}

/**
 * Mapowanie GeneratorSymbolType na EtapSymbolId.
 */
const GENERATOR_TYPE_TO_SYMBOL: Record<GeneratorSymbolType, EtapSymbolId> = {
  PV: 'pv',
  WIND: 'fw',
  BESS: 'bess',
  SYNCHRONOUS: 'generator',
};

/**
 * Rozwiąż symbol ETAP dla elementu SLD.
 *
 * BINDING CONTRACT:
 * - Zwraca ResolvedSymbol dla znanych typów
 * - Zwraca null dla nieznanych typów (fallback w rendererze)
 *
 * @param symbol - Symbol SLD do rozwiązania
 * @returns ResolvedSymbol lub null jeśli nieznany
 */
export function resolveSymbol(symbol: AnySldSymbol): ResolvedSymbol | null {
  const { elementType } = symbol;

  switch (elementType) {
    case 'Bus':
      return getSymbolDefinition('busbar');

    case 'LineBranch': {
      const branchSymbol = symbol as ExtendedBranchSymbol;
      // Rozróżnienie LINE vs CABLE na podstawie branchType
      // Domyślnie: CABLE (linia kablowa)
      const branchType = branchSymbol.branchType ?? 'CABLE';
      return branchType === 'LINE'
        ? getSymbolDefinition('line_overhead')
        : getSymbolDefinition('line_cable');
    }

    case 'TransformerBranch':
      // Domyślnie transformer_2w (brak rozróżnienia 2w vs 3w w modelu)
      return getSymbolDefinition('transformer_2w');

    case 'Switch': {
      const switchSymbol = symbol as SwitchSymbol;
      // Rozróżnienie BREAKER vs DISCONNECTOR
      switch (switchSymbol.switchType) {
        case 'BREAKER':
          return getSymbolDefinition('circuit_breaker');
        case 'DISCONNECTOR':
          return getSymbolDefinition('disconnector');
        case 'LOAD_SWITCH':
          // LOAD_SWITCH → circuit_breaker (najbliższy odpowiednik)
          return getSymbolDefinition('circuit_breaker');
        case 'FUSE':
          return getSymbolDefinition('fuse');
        default:
          // Fallback dla nieznanych switchType
          warnOnce(`[SymbolResolver] Nieznany switchType: ${switchSymbol.switchType}, używam circuit_breaker`);
          return getSymbolDefinition('circuit_breaker');
      }
    }

    case 'Source': {
      // Source z opcjonalnym rozróżnieniem PV/FW/BESS/generator
      const sourceSymbol = symbol as ExtendedSourceSymbol;
      if (sourceSymbol.generatorType) {
        return getSymbolDefinition(GENERATOR_TYPE_TO_SYMBOL[sourceSymbol.generatorType]);
      }
      // Fallback → utility_feeder (zasilanie z sieci)
      return getSymbolDefinition('utility_feeder');
    }

    case 'Generator': {
      // Generator z rozróżnieniem PV/Wind/BESS/Genset
      const genSymbol = symbol as ExtendedGeneratorSymbol;
      if (genSymbol.generatorType) {
        return getSymbolDefinition(GENERATOR_TYPE_TO_SYMBOL[genSymbol.generatorType]);
      }
      // Fallback → generator (synchroniczny)
      return getSymbolDefinition('generator');
    }

    case 'Measurement': {
      // Measurement z rozróżnieniem CT vs VT
      const measSymbol = symbol as ExtendedMeasurementSymbol;
      if (measSymbol.measurementType === 'VT') {
        return getSymbolDefinition('vt');
      }
      // Domyślnie CT (przekładnik prądowy)
      return getSymbolDefinition('ct');
    }

    case 'ProtectionAssignment':
    case 'Relay':
      // Przekaźnik zabezpieczeniowy — pozycja nad CB (off-path)
      return getSymbolDefinition('relay');

    case 'Load':
      // Load → symbol odbiornika
      return getSymbolDefinition('load');

    case 'Station':
    case 'BaySN':
      return getSymbolDefinition('gpz_station');

    default:
      warnOnce(`[SymbolResolver] Nieznany elementType: ${elementType}`);
      return null;
  }
}

/**
 * Pobierz definicję symbolu po ID.
 *
 * @param symbolId - ID symbolu ETAP
 * @returns ResolvedSymbol
 */
export function getSymbolDefinition(symbolId: EtapSymbolId): ResolvedSymbol {
  const definition = SYMBOL_DEFINITIONS[symbolId];
  return {
    symbolId,
    ...definition,
  };
}

/**
 * Sprawdź czy symbol jest obsługiwany przez bibliotekę ETAP.
 *
 * @param symbol - Symbol SLD
 * @returns true jeśli ma mapping w bibliotece ETAP
 */
export function hasEtapSymbol(symbol: AnySldSymbol): boolean {
  return resolveSymbol(symbol) !== null;
}

/**
 * Pobierz wszystkie dostępne ID symboli ETAP.
 *
 * @returns Lista wszystkich symbol ID
 */
export function getAllSymbolIds(): EtapSymbolId[] {
  return Object.keys(SYMBOL_DEFINITIONS) as EtapSymbolId[];
}

/**
 * Transformuj port względem obrotu symbolu.
 *
 * Formuły transformacji (viewBox 100x100):
 * - 90°:  new_x = 100 - y, new_y = x
 * - 180°: new_x = 100 - x, new_y = 100 - y
 * - 270°: new_x = y, new_y = 100 - x
 *
 * @param port - Port do transformacji
 * @param rotation - Obrót w stopniach (0, 90, 180, 270)
 * @returns Transformowany port
 */
export function transformPort(port: SymbolPort, rotation: number): SymbolPort {
  const { x, y } = port;
  switch (rotation) {
    case 90:
      return { x: 100 - y, y: x };
    case 180:
      return { x: 100 - x, y: 100 - y };
    case 270:
      return { x: y, y: 100 - x };
    default:
      return { x, y };
  }
}

/**
 * Pobierz transformowane porty dla symbolu z obrotem.
 *
 * @param symbolId - ID symbolu ETAP
 * @param rotation - Obrót w stopniach
 * @returns Transformowane porty
 */
export function getTransformedPorts(symbolId: EtapSymbolId, rotation: number): SymbolPorts {
  const definition = SYMBOL_DEFINITIONS[symbolId];
  const { ports } = definition;

  const transformed: SymbolPorts = {};

  if (ports.top) transformed.top = transformPort(ports.top, rotation);
  if (ports.bottom) transformed.bottom = transformPort(ports.bottom, rotation);
  if (ports.left) transformed.left = transformPort(ports.left, rotation);
  if (ports.right) transformed.right = transformPort(ports.right, rotation);

  return transformed;
}
