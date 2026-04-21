/**
 * PORT UTILITIES — Funkcje do wyznaczania punktow portow symboli SLD
 *
 * CANONICAL ALIGNMENT:
 * - SLD_KANONICZNA_SPECYFIKACJA.md § 3: Porty elektryczne
 * - canonical_symbols/ports.json: Definicje portow
 *
 * FEATURES:
 * - Wyznaczanie punktow portow dla symboli
 * - Transformacja portow przy rotacji
 * - Deterministyczne mapowanie port -> punkt
 */

import type { AnySldSymbol, BranchSymbol, Position, SwitchSymbol } from '../types';

// =============================================================================
// STALE KONFIGURACYJNE
// =============================================================================

/** ViewBox symboli CANONICAL (100x100) */
const VIEWBOX_SIZE = 100;

/** Rozmiary symboli (px) */
export const SYMBOL_SIZES: Record<string, { width: number; height: number }> = {
  Bus: { width: 80, height: 40 },
  LineBranch: { width: 60, height: 40 },
  TransformerBranch: { width: 40, height: 50 },
  Switch: { width: 40, height: 50 },
  Source: { width: 50, height: 60 },
  Load: { width: 30, height: 30 },
};

/** Nazwy portow */
export type PortName = 'top' | 'bottom' | 'left' | 'right';

/** Port w viewBox (0-100) */
export interface PortDefinition {
  x: number;
  y: number;
}

/** Definicje portow dla symboli (z ports.json) */
export const PORT_DEFINITIONS: Record<string, Record<PortName, PortDefinition>> = {
  busbar: {
    left: { x: 0, y: 50 },
    right: { x: 100, y: 50 },
    top: { x: 50, y: 50 },     // Bus: porty na srodku dla polaczen pionowych
    bottom: { x: 50, y: 50 },
  },
  circuit_breaker: {
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  disconnector: {
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  line_overhead: {
    left: { x: 0, y: 50 },
    right: { x: 100, y: 50 },
    top: { x: 50, y: 50 },
    bottom: { x: 50, y: 50 },
  },
  line_cable: {
    left: { x: 0, y: 50 },
    right: { x: 100, y: 50 },
    top: { x: 50, y: 50 },
    bottom: { x: 50, y: 50 },
  },
  transformer_2w: {
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  utility_feeder: {
    bottom: { x: 50, y: 100 },
    top: { x: 50, y: 0 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  generator: {
    bottom: { x: 50, y: 100 },
    top: { x: 50, y: 0 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  pv: {
    bottom: { x: 50, y: 100 },
    top: { x: 50, y: 0 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  fw: {
    bottom: { x: 50, y: 100 },
    top: { x: 50, y: 0 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  bess: {
    bottom: { x: 50, y: 100 },
    top: { x: 50, y: 0 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
  load: {
    top: { x: 50, y: 0 },
    bottom: { x: 50, y: 100 },
    left: { x: 50, y: 50 },
    right: { x: 50, y: 50 },
  },
};

/** Mapowanie ElementType -> symbolId dla portow */
const ELEMENT_TO_SYMBOL: Record<string, string> = {
  Bus: 'busbar',
  LineBranch: 'line_cable',
  TransformerBranch: 'transformer_2w',
  Switch: 'circuit_breaker',
  Source: 'utility_feeder',
  Load: 'load',
};

// =============================================================================
// FUNKCJE POMOCNICZE
// =============================================================================

/**
 * Pobierz symbolId dla typu elementu.
 */
export function getSymbolId(elementType: string, switchType?: string, branchType?: string): string {
  if (elementType === 'Switch') {
    return switchType === 'DISCONNECTOR' || switchType === 'FUSE'
      ? 'disconnector'
      : 'circuit_breaker';
  }
  if (elementType === 'LineBranch') {
    return branchType === 'LINE' ? 'line_overhead' : 'line_cable';
  }
  return ELEMENT_TO_SYMBOL[elementType] ?? 'busbar';
}

/**
 * Pobierz rozmiar symbolu (px).
 */
export function getSymbolSize(elementType: string): { width: number; height: number } {
  return SYMBOL_SIZES[elementType] ?? { width: 40, height: 40 };
}

/**
 * Pobierz definicje portow dla symbolu.
 */
export function getPortDefinitions(symbolId: string): Record<PortName, PortDefinition> {
  return PORT_DEFINITIONS[symbolId] ?? PORT_DEFINITIONS.busbar;
}

// =============================================================================
// GLOWNA FUNKCJA: WYZNACZ PUNKT PORTU
// =============================================================================

/**
 * Wyznacz punkt portu w ukladzie wspolrzednych plotna.
 *
 * DETERMINIZM: Ten sam symbol + port -> ten sam punkt
 *
 * @param symbol - Symbol SLD
 * @param portName - Nazwa portu (top/bottom/left/right)
 * @param rotation - Rotacja symbolu (0/90/180/270), domyslnie 0
 * @returns Punkt portu w ukladzie wspolrzednych plotna
 */
export function getPortPoint(
  symbol: AnySldSymbol,
  portName: PortName,
  rotation: number = 0
): Position {
  const { position, elementType } = symbol;

  // Pobierz symbolId i rozmiar
  let symbolId: string;
  if (elementType === 'Switch') {
    symbolId = getSymbolId(elementType, (symbol as SwitchSymbol).switchType);
  } else if (elementType === 'LineBranch') {
    symbolId = getSymbolId(elementType, undefined, (symbol as BranchSymbol).branchType);
  } else {
    symbolId = getSymbolId(elementType);
  }

  const size = getSymbolSize(elementType);
  const ports = getPortDefinitions(symbolId);

  // Pobierz port (z transformacja rotacji jesli potrzebna)
  const transformedPortName = transformPortName(portName, rotation);
  const portDef = ports[transformedPortName] ?? ports[portName] ?? { x: 50, y: 50 };

  // Transformuj wspolrzedne portu przy rotacji
  const { x: portX, y: portY } = transformPortCoordinates(portDef, rotation);

  // Skaluj z viewBox (100x100) do rozmiaru symbolu
  const scaleX = size.width / VIEWBOX_SIZE;
  const scaleY = size.height / VIEWBOX_SIZE;

  // Oblicz punkt w ukladzie plotna
  // Symbol jest wycentrowany na position, wiec offset = -size/2
  const canvasX = position.x - size.width / 2 + portX * scaleX;
  const canvasY = position.y - size.height / 2 + portY * scaleY;

  return { x: canvasX, y: canvasY };
}

/**
 * Transformuj nazwe portu przy rotacji.
 */
function transformPortName(portName: PortName, rotation: number): PortName {
  if (rotation === 0) return portName;

  const portMapping: Record<number, Record<PortName, PortName>> = {
    90: { top: 'right', right: 'bottom', bottom: 'left', left: 'top' },
    180: { top: 'bottom', right: 'left', bottom: 'top', left: 'right' },
    270: { top: 'left', right: 'top', bottom: 'right', left: 'bottom' },
  };

  return portMapping[rotation]?.[portName] ?? portName;
}

/**
 * Transformuj wspolrzedne portu przy rotacji.
 */
function transformPortCoordinates(port: PortDefinition, rotation: number): PortDefinition {
  const { x, y } = port;

  switch (rotation) {
    case 90:
      return { x: VIEWBOX_SIZE - y, y: x };
    case 180:
      return { x: VIEWBOX_SIZE - x, y: VIEWBOX_SIZE - y };
    case 270:
      return { x: y, y: VIEWBOX_SIZE - x };
    default:
      return { x, y };
  }
}

// =============================================================================
// FUNKCJE DLA POLACZEN
// =============================================================================

/**
 * Wybierz najlepszy port do polaczenia miedzy dwoma symbolami.
 *
 * Heurystyka:
 * - Jesli symbole sa w pionie (dy > dx): top/bottom
 * - Jesli symbole sa w poziomie (dx > dy): left/right
 * - Wybierz port blizszy drugiemu symbolowi
 *
 * @param fromSymbol - Symbol zrodlowy
 * @param toSymbol - Symbol docelowy
 * @returns Para portow (fromPort, toPort)
 */
export function selectBestPorts(
  fromSymbol: AnySldSymbol,
  toSymbol: AnySldSymbol
): { fromPort: PortName; toPort: PortName } {
  const dx = toSymbol.position.x - fromSymbol.position.x;
  const dy = toSymbol.position.y - fromSymbol.position.y;

  // Dla Bus: preferuj top/bottom dla polaczen pionowych
  const fromIsBus = fromSymbol.elementType === 'Bus';
  const toIsBus = toSymbol.elementType === 'Bus';

  // Dla Source/Load: preferuj odpowiednie porty
  const fromIsSource = fromSymbol.elementType === 'Source';
  const toIsLoad = toSymbol.elementType === 'Load';

  // Okresl kierunek
  const isVertical = Math.abs(dy) > Math.abs(dx);

  let fromPort: PortName;
  let toPort: PortName;

  if (isVertical) {
    // Polaczenie pionowe
    if (dy > 0) {
      // toSymbol jest ponizej fromSymbol
      fromPort = fromIsBus ? 'bottom' : (fromIsSource ? 'bottom' : 'bottom');
      toPort = toIsBus ? 'top' : (toIsLoad ? 'top' : 'top');
    } else {
      // toSymbol jest powyzej fromSymbol
      fromPort = fromIsBus ? 'top' : 'top';
      toPort = toIsBus ? 'bottom' : 'bottom';
    }
  } else {
    // Polaczenie poziome
    if (dx > 0) {
      // toSymbol jest na prawo od fromSymbol
      fromPort = fromIsBus ? 'right' : 'right';
      toPort = toIsBus ? 'left' : 'left';
    } else {
      // toSymbol jest na lewo od fromSymbol
      fromPort = fromIsBus ? 'left' : 'left';
      toPort = toIsBus ? 'right' : 'right';
    }
  }

  return { fromPort, toPort };
}

/**
 * Oblicz bounding box symbolu (dla detekcji kolizji).
 */
export function getSymbolBoundingBox(symbol: AnySldSymbol): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const size = getSymbolSize(symbol.elementType);
  return {
    x: symbol.position.x - size.width / 2,
    y: symbol.position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/**
 * Sprawdz czy punkt jest wewnatrz bounding box.
 */
export function pointInBoundingBox(
  point: Position,
  bbox: { x: number; y: number; width: number; height: number },
  margin: number = 0
): boolean {
  return (
    point.x >= bbox.x - margin &&
    point.x <= bbox.x + bbox.width + margin &&
    point.y >= bbox.y - margin &&
    point.y <= bbox.y + bbox.height + margin
  );
}

// =============================================================================
// SNAP DO PORTOW (PR-SLD-05)
// =============================================================================

/** Konfiguracja snap do portow */
export const SNAP_CONFIG = {
  /** Promien snap w pikselach */
  snapRadius: 12,
  /** Promien hitbox portu dla klikaniec */
  portHitboxRadius: 10,
  /** Promien wizualny portu przy hover */
  portVisualRadius: 6,
};

/** Informacja o porcie z pozycja absolutna */
export interface PortInfo {
  symbolId: string;
  elementId: string;
  portName: PortName;
  position: Position;
  elementType: string;
}

/**
 * Pobierz wszystkie porty dla symbolu z pozycjami absolutnymi.
 *
 * @param symbol - Symbol SLD
 * @param rotation - Rotacja symbolu (domyslnie 0)
 * @returns Lista portow z pozycjami
 */
export function getSymbolPorts(symbol: AnySldSymbol, rotation: number = 0): PortInfo[] {
  const portNames: PortName[] = ['top', 'bottom', 'left', 'right'];

  return portNames.map((portName) => ({
    symbolId: symbol.id,
    elementId: symbol.elementId,
    portName,
    position: getPortPoint(symbol, portName, rotation),
    elementType: symbol.elementType,
  }));
}

/**
 * Znajdz najblizszy port w promieniu snap.
 *
 * DETERMINIZM: Przy rownych odleglosciach wybiera port o najnizszym ID symbolu,
 * a przy tym samym ID - port w kolejnosci: top, bottom, left, right.
 *
 * @param point - Punkt referencyjny
 * @param symbols - Lista symboli do przeszukania
 * @param excludeSymbolIds - ID symboli do wylaczenia (np. przeciagany symbol)
 * @param snapRadius - Promien snap (domyslnie z SNAP_CONFIG)
 * @returns Najblizszy port lub null
 */
export function findNearestPort(
  point: Position,
  symbols: AnySldSymbol[],
  excludeSymbolIds: Set<string> = new Set(),
  snapRadius: number = SNAP_CONFIG.snapRadius
): PortInfo | null {
  let nearestPort: PortInfo | null = null;
  let nearestDistance = snapRadius;

  // Kolejnosc portow dla deterministycznego tie-break
  const portPriority: Record<PortName, number> = {
    top: 0,
    bottom: 1,
    left: 2,
    right: 3,
  };

  for (const symbol of symbols) {
    if (excludeSymbolIds.has(symbol.id)) continue;

    const ports = getSymbolPorts(symbol);

    for (const portInfo of ports) {
      const dx = portInfo.position.x - point.x;
      const dy = portInfo.position.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= snapRadius) {
        // Sprawdz czy ten port jest lepszy (blizszy lub deterministic tie-break)
        const isBetter =
          distance < nearestDistance ||
          (distance === nearestDistance && nearestPort !== null && (
            symbol.id < nearestPort.symbolId ||
            (symbol.id === nearestPort.symbolId &&
              portPriority[portInfo.portName] < portPriority[nearestPort.portName])
          ));

        if (isBetter || nearestPort === null) {
          nearestPort = portInfo;
          nearestDistance = distance;
        }
      }
    }
  }

  return nearestPort;
}

/**
 * Znajdz port w poblizu punktu (dla klikaniec).
 * Uzywane do wykrywania klikniecia na port.
 *
 * @param point - Punkt klikniecia
 * @param symbols - Lista symboli
 * @param hitboxRadius - Promien hitbox (domyslnie z SNAP_CONFIG)
 * @returns Port lub null
 */
export function findPortAtPoint(
  point: Position,
  symbols: AnySldSymbol[],
  hitboxRadius: number = SNAP_CONFIG.portHitboxRadius
): PortInfo | null {
  return findNearestPort(point, symbols, new Set(), hitboxRadius);
}

/**
 * Oblicz pozycje snap dla symbolu podczas przeciagania.
 *
 * Jesli jakikolwiek port przeciaganego symbolu jest w promieniu snap
 * od portu innego symbolu, zwraca skorygowana pozycje centrum symbolu.
 *
 * @param symbol - Przeciagany symbol
 * @param proposedPosition - Proponowana pozycja centrum symbolu
 * @param allSymbols - Wszystkie symbole (do przeszukania portow)
 * @param snapRadius - Promien snap
 * @returns Skorygowana pozycja lub null jesli brak snap
 */
export function calculateSnapPosition(
  symbol: AnySldSymbol,
  proposedPosition: Position,
  allSymbols: AnySldSymbol[],
  snapRadius: number = SNAP_CONFIG.snapRadius
): { position: Position; snappedPort: PortInfo; targetPort: PortInfo } | null {
  // Tymczasowo ustaw pozycje symbolu aby obliczyc porty
  const tempSymbol = { ...symbol, position: proposedPosition };
  const symbolPorts = getSymbolPorts(tempSymbol);

  // Szukaj snap dla kazdego portu symbolu
  let bestSnap: { symbolPort: PortInfo; targetPort: PortInfo; distance: number } | null = null;

  const excludeIds = new Set([symbol.id]);

  for (const symbolPort of symbolPorts) {
    const nearestTarget = findNearestPort(
      symbolPort.position,
      allSymbols,
      excludeIds,
      snapRadius
    );

    if (nearestTarget) {
      const dx = nearestTarget.position.x - symbolPort.position.x;
      const dy = nearestTarget.position.y - symbolPort.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Deterministic: wybierz port o najmniejszej odleglosci,
      // przy rownych - port o najnizszym priority symbolu
      if (!bestSnap || distance < bestSnap.distance ||
          (distance === bestSnap.distance && symbolPort.portName < bestSnap.symbolPort.portName)) {
        bestSnap = { symbolPort, targetPort: nearestTarget, distance };
      }
    }
  }

  if (!bestSnap) return null;

  // Oblicz skorygowana pozycje centrum symbolu
  // tak aby port symbolu pokrywal sie z portem docelowym
  const offset = {
    x: bestSnap.symbolPort.position.x - proposedPosition.x,
    y: bestSnap.symbolPort.position.y - proposedPosition.y,
  };

  const snappedPosition = {
    x: bestSnap.targetPort.position.x - offset.x,
    y: bestSnap.targetPort.position.y - offset.y,
  };

  return {
    position: snappedPosition,
    snappedPort: bestSnap.symbolPort,
    targetPort: bestSnap.targetPort,
  };
}

// =============================================================================
// WALIDACJA POLACZEN (PR-SLD-05)
// =============================================================================

/** Wynik walidacji polaczenia */
export interface ConnectionValidationResult {
  valid: boolean;
  /** Komunikat bledu po polsku (jesli !valid) */
  errorMessage?: string;
}

/**
 * Waliduj polaczenie miedzy dwoma portami.
 *
 * Reguly walidacji (logika inzynierska):
 * 1. Port nie moze byc polaczony z portem tego samego elementu
 * 2. Nie mozna utworzyc duplikatu polaczenia
 * 3. Bus moze byc polaczony z dowolnym innym typem
 * 4. Switch/Branch musza byc polaczone z Bus
 *
 * @param fromPort - Port zrodlowy
 * @param toPort - Port docelowy
 * @param existingConnections - Istniejace polaczenia (do wykrycia duplikatow)
 * @returns Wynik walidacji
 */
export function validateConnection(
  fromPort: PortInfo,
  toPort: PortInfo,
  existingConnections: Array<{ fromSymbolId: string; toSymbolId: string }> = []
): ConnectionValidationResult {
  // Regula 1: Nie mozna polaczyc portu z portem tego samego elementu
  if (fromPort.symbolId === toPort.symbolId) {
    return {
      valid: false,
      errorMessage: 'Nie można połączyć portu z portem tego samego elementu',
    };
  }

  // Regula 2: Sprawdz duplikaty (w obu kierunkach)
  const isDuplicate = existingConnections.some(
    (conn) =>
      (conn.fromSymbolId === fromPort.symbolId && conn.toSymbolId === toPort.symbolId) ||
      (conn.fromSymbolId === toPort.symbolId && conn.toSymbolId === fromPort.symbolId)
  );

  if (isDuplicate) {
    return {
      valid: false,
      errorMessage: 'Połączenie między tymi elementami już istnieje',
    };
  }

  // Regula 3/4: Sprawdz kompatybilnosc typow
  const fromIsBus = fromPort.elementType === 'Bus';
  const toIsBus = toPort.elementType === 'Bus';

  // Przynajmniej jeden element musi byc szyna (Bus)
  if (!fromIsBus && !toIsBus) {
    return {
      valid: false,
      errorMessage: 'Połączenie musi zawierać przynajmniej jedną szynę zbiorczą',
    };
  }

  return { valid: true };
}

/**
 * Sprawdz czy port jest juz zajetny przez polaczenie.
 *
 * @param port - Port do sprawdzenia
 * @param existingConnections - Istniejace polaczenia
 * @returns true jesli port jest juz uzyty
 */
export function isPortOccupied(
  port: PortInfo,
  existingConnections: Array<{
    fromSymbolId: string;
    fromPortName: PortName;
    toSymbolId: string;
    toPortName: PortName;
  }>
): boolean {
  return existingConnections.some(
    (conn) =>
      (conn.fromSymbolId === port.symbolId && conn.fromPortName === port.portName) ||
      (conn.toSymbolId === port.symbolId && conn.toPortName === port.portName)
  );
}

/**
 * Sprawdz czy odcinek liniowy przecina bounding box.
 */
export function lineIntersectsBoundingBox(
  p1: Position,
  p2: Position,
  bbox: { x: number; y: number; width: number; height: number },
  margin: number = 5
): boolean {
  const expandedBbox = {
    x: bbox.x - margin,
    y: bbox.y - margin,
    width: bbox.width + 2 * margin,
    height: bbox.height + 2 * margin,
  };

  // Sprawdz czy ktorykolwiek punkt jest w bbox
  if (pointInBoundingBox(p1, expandedBbox) || pointInBoundingBox(p2, expandedBbox)) {
    return true;
  }

  // Sprawdz przeciecie z kazdym bokiem bbox
  const left = expandedBbox.x;
  const right = expandedBbox.x + expandedBbox.width;
  const top = expandedBbox.y;
  const bottom = expandedBbox.y + expandedBbox.height;

  // Linia pozioma przecinajaca bbox
  if (p1.y === p2.y) {
    const y = p1.y;
    if (y >= top && y <= bottom) {
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      if (minX <= right && maxX >= left) {
        return true;
      }
    }
  }

  // Linia pionowa przecinajaca bbox
  if (p1.x === p2.x) {
    const x = p1.x;
    if (x >= left && x <= right) {
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      if (minY <= bottom && maxY >= top) {
        return true;
      }
    }
  }

  return false;
}
