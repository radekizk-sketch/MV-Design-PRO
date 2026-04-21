/**
 * PortRenderer — Renderowanie aktywnych portow symboli SLD
 *
 * PR-SLD-05: Interakcja CANONICAL — snap do portow + tworzenie polaczen
 *
 * FEATURES:
 * - Niewidoczny hitbox dla kazdego portu (aktywny obszar klikniec)
 * - Subtelne podswietlenie przy hover (styl techniczny)
 * - Identyfikacja logiczna (elementId + portName)
 * - Porty NIE sa renderowane jako stale kropki (chyba ze w trybie debug)
 *
 * CANONICAL PARITY:
 * - Porty sa aktywnymi punktami przylaczenia
 * - Snap do portow przy przeciaganiu
 * - Tworzenie polaczen przez klikniecie port -> port
 */

import React, { useCallback, useMemo } from 'react';
import type { AnySldSymbol, Position, PortName } from '../types';
import { getSymbolPorts, SNAP_CONFIG, type PortInfo } from '../utils/portUtils';

/**
 * Props dla pojedynczego portu.
 */
interface SinglePortProps {
  port: PortInfo;
  isHovered: boolean;
  isActive: boolean;
  isValidTarget: boolean;
  isInvalidTarget: boolean;
  onPortClick: (port: PortInfo) => void;
  onPortHover: (portId: string | null) => void;
}

/**
 * Komponent pojedynczego portu.
 * Renderuje hitbox i opcjonalnie wizualne podswietlenie.
 */
const SinglePort: React.FC<SinglePortProps> = ({
  port,
  isHovered,
  isActive,
  isValidTarget,
  isInvalidTarget,
  onPortClick,
  onPortHover,
}) => {
  const portId = `${port.symbolId}:${port.portName}`;

  const handleMouseEnter = useCallback(() => {
    onPortHover(portId);
  }, [onPortHover, portId]);

  const handleMouseLeave = useCallback(() => {
    onPortHover(null);
  }, [onPortHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPortClick(port);
    },
    [onPortClick, port]
  );

  // Okresl kolor portu na podstawie stanu
  let fillColor = 'transparent';
  let strokeColor = 'transparent';
  let opacity = 0;

  if (isActive) {
    // Port aktywny (wybrany jako zrodlo polaczenia)
    fillColor = '#3b82f6'; // blue-500
    strokeColor = '#1d4ed8'; // blue-700
    opacity = 1;
  } else if (isValidTarget) {
    // Port jest poprawnym celem polaczenia
    fillColor = '#22c55e'; // green-500
    strokeColor = '#16a34a'; // green-600
    opacity = 0.8;
  } else if (isInvalidTarget) {
    // Port jest niepoprawnym celem (np. ten sam element)
    fillColor = '#ef4444'; // red-500
    strokeColor = '#dc2626'; // red-600
    opacity = 0.6;
  } else if (isHovered) {
    // Port pod kursorem
    fillColor = '#60a5fa'; // blue-400
    strokeColor = '#3b82f6'; // blue-500
    opacity = 0.7;
  }

  return (
    <g data-testid={`port-${portId}`} data-port-name={port.portName}>
      {/* Niewidoczny hitbox - zawsze aktywny */}
      <circle
        cx={port.position.x}
        cy={port.position.y}
        r={SNAP_CONFIG.portHitboxRadius}
        fill="transparent"
        stroke="transparent"
        style={{ cursor: 'crosshair' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        data-testid={`port-hitbox-${portId}`}
      />

      {/* Wizualne podswietlenie - tylko gdy potrzebne */}
      {opacity > 0 && (
        <circle
          cx={port.position.x}
          cy={port.position.y}
          r={SNAP_CONFIG.portVisualRadius}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1.5}
          opacity={opacity}
          style={{ pointerEvents: 'none' }}
          data-testid={`port-visual-${portId}`}
        />
      )}
    </g>
  );
};

/**
 * Props dla warstwy portow.
 */
interface PortLayerProps {
  /** Wszystkie symbole na canvas */
  symbols: AnySldSymbol[];
  /** ID portu pod kursorem */
  hoveredPortId: string | null;
  /** Port aktywny (zrodlo tworzenia polaczenia) */
  activePort: { symbolId: string; portName: PortName } | null;
  /** Funkcja wywolywana przy kliknieciu portu */
  onPortClick: (port: PortInfo) => void;
  /** Funkcja wywolywana przy hover na porcie */
  onPortHover: (portId: string | null) => void;
  /** Czy wyswietlac porty (true gdy tworzenie polaczenia aktywne) */
  showPorts: boolean;
  /** ID symboli do wylaczenia z wyswietlania portow (np. przeciagane) */
  excludeSymbolIds?: Set<string>;
  /** Funkcja walidacji czy port jest poprawnym celem */
  validateTarget?: (port: PortInfo) => boolean;
}

/**
 * Warstwa portow — renderuje porty dla wszystkich symboli.
 *
 * DETERMINIZM: Porty renderowane w stalej kolejnosci (symbol ID + port name)
 */
export const PortLayer: React.FC<PortLayerProps> = ({
  symbols,
  hoveredPortId,
  activePort,
  onPortClick,
  onPortHover,
  showPorts,
  excludeSymbolIds = new Set(),
  validateTarget,
}) => {
  // Zbierz wszystkie porty
  const allPorts = useMemo(() => {
    const ports: PortInfo[] = [];

    // Sortuj symbole dla determinizmu
    const sortedSymbols = [...symbols].sort((a, b) => a.id.localeCompare(b.id));

    for (const symbol of sortedSymbols) {
      if (excludeSymbolIds.has(symbol.id)) continue;
      ports.push(...getSymbolPorts(symbol));
    }

    return ports;
  }, [symbols, excludeSymbolIds]);

  // Nie renderuj jesli nie ma portow do wyswietlenia
  // lub jesli tryb tworzenia polaczenia nie jest aktywny i nie ma hover
  if (!showPorts && !hoveredPortId) {
    return null;
  }

  return (
    <g data-testid="port-layer">
      {allPorts.map((port) => {
        const portId = `${port.symbolId}:${port.portName}`;
        const isHovered = hoveredPortId === portId;
        const isActive =
          activePort !== null &&
          activePort.symbolId === port.symbolId &&
          activePort.portName === port.portName;

        // Sprawdz walidacje celu
        let isValidTarget = false;
        let isInvalidTarget = false;

        if (activePort && !isActive) {
          // Jestesmy w trybie tworzenia polaczenia i to nie jest port zrodlowy
          if (validateTarget) {
            isValidTarget = validateTarget(port);
            isInvalidTarget = !isValidTarget && (isHovered || showPorts);
          } else {
            // Domyslnie: inny symbol = valid
            isValidTarget = port.symbolId !== activePort.symbolId;
            isInvalidTarget = port.symbolId === activePort.symbolId;
          }
        }

        return (
          <SinglePort
            key={portId}
            port={port}
            isHovered={isHovered}
            isActive={isActive}
            isValidTarget={isValidTarget}
            isInvalidTarget={isInvalidTarget}
            onPortClick={onPortClick}
            onPortHover={onPortHover}
          />
        );
      })}
    </g>
  );
};

/**
 * Linia podgladu polaczenia — pokazuje tymczasowe polaczenie podczas tworzenia.
 */
interface ConnectionPreviewLineProps {
  fromPosition: Position;
  toPosition: Position;
  isValid: boolean;
}

export const ConnectionPreviewLine: React.FC<ConnectionPreviewLineProps> = ({
  fromPosition,
  toPosition,
  isValid,
}) => {
  const strokeColor = isValid ? '#3b82f6' : '#9ca3af'; // blue-500 or gray-400
  const strokeDasharray = isValid ? '4,4' : '2,2';

  return (
    <line
      x1={fromPosition.x}
      y1={fromPosition.y}
      x2={toPosition.x}
      y2={toPosition.y}
      stroke={strokeColor}
      strokeWidth={2}
      strokeDasharray={strokeDasharray}
      style={{ pointerEvents: 'none' }}
      data-testid="connection-preview-line"
    />
  );
};

/**
 * Indykator snap do portu — pokazuje wizualne polaczenie podczas snap.
 */
interface SnapIndicatorProps {
  sourcePosition: Position;
  targetPosition: Position;
}

export const SnapIndicator: React.FC<SnapIndicatorProps> = ({
  sourcePosition,
  targetPosition,
}) => {
  return (
    <g data-testid="snap-indicator">
      {/* Linia miedzy portami */}
      <line
        x1={sourcePosition.x}
        y1={sourcePosition.y}
        x2={targetPosition.x}
        y2={targetPosition.y}
        stroke="#22c55e"
        strokeWidth={2}
        strokeDasharray="4,2"
        style={{ pointerEvents: 'none' }}
      />

      {/* Kolo na porcie docelowym */}
      <circle
        cx={targetPosition.x}
        cy={targetPosition.y}
        r={8}
        fill="none"
        stroke="#22c55e"
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
};

/**
 * Pasek statusu — wyswietla komunikaty dla uzytkownika.
 */
interface StatusBarProps {
  message: {
    text: string;
    type: 'info' | 'warning' | 'error';
  } | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({ message }) => {
  if (!message) return null;

  const bgColor = {
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
  }[message.type];

  return (
    <div
      className={`absolute bottom-2 left-2 px-3 py-1.5 rounded text-sm font-medium ${bgColor}`}
      data-testid="status-bar"
    >
      {message.text}
    </div>
  );
};

export default PortLayer;
