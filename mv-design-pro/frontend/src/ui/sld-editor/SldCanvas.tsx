/**
 * P30b — SLD Canvas Component (SVG Rendering)
 *
 * PR-SLD-04: Unifikacja symboli w edytorze do standardu CANONICAL
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A.2: Symbol types (Bus, Line, Transformer, etc.)
 * - sld_rules.md § D.1: Visual state encoding (in_service, selected, hover)
 * - ui_canonical_parity.md: ≥110% Canonical symbol rendering
 * - AUDYT_SLD_CANONICAL.md N-02: hierarchiczne auto-rozmieszczenie
 * - AUDYT_SLD_CANONICAL.md N-04: edytor używa tego samego renderera co podgląd (CANONICAL)
 *
 * FEATURES:
 * - SVG rendering of all SLD symbols using CANONICAL standard
 * - Grid background (when enabled)
 * - Lasso selection (drag rectangle)
 * - Drag handles for selected symbols
 * - Mouse interactions (click, drag, lasso)
 * - AUTOMATYCZNE auto-rozmieszczenie (bez przycisku)
 *
 * CANONICAL PARITY (N-04):
 * - Edytor i podgląd używają tego samego UnifiedSymbolRenderer
 * - Symbole CANONICAL zamiast uproszczonych kształtów
 * - Porty spójne z definicjami w SymbolResolver.ts
 */

import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { useSldEditorStore } from './SldEditorStore';
import { useSldDrag } from './hooks/useSldDrag';
import { useAutoLayout } from './hooks/useAutoLayout';
import type { AnySldSymbol, Position } from './types';
import type { IssueSeverity } from '../types';
import { useIsMutationBlocked } from '../selection/store';
import { generateConnections } from './utils/connectionRouting';
import { ConnectionsLayer } from '../sld/ConnectionRenderer';
import { UnifiedSymbolRenderer, type SymbolVisualState, type SymbolInteractionHandlers } from '../sld/symbols';
import {
  PortLayer,
  ConnectionPreviewLine,
  SnapIndicator,
  StatusBar,
} from './components/PortRenderer';
import {
  findNearestPort,
  validateConnection,
  SNAP_CONFIG,
  type PortInfo,
} from './utils/portUtils';
import { applyGeometryMode, evaluateCadOverridesStatus } from './cad/geometryContract';
import { featureFlags } from '../config/featureFlags';
import { computeTopologyHash } from './hooks/useAutoLayout';

/**
 * Symbol rendering component using unified CANONICAL renderer.
 *
 * PR-SLD-04: Replaces simplified shapes with CANONICAL symbols.
 */
interface SymbolRendererProps {
  symbol: AnySldSymbol;
  selected: boolean;
  highlighted: boolean;
  highlightSeverity: IssueSeverity | null;
  onMouseDown: (symbolId: string, position: Position) => void;
  onClick: (symbolId: string, mode: 'single' | 'add' | 'toggle') => void;
}

const SymbolRenderer: React.FC<SymbolRendererProps> = ({
  symbol,
  selected,
  highlighted,
  highlightSeverity,
  onMouseDown,
  onClick
}) => {
  // Build visual state for unified renderer
  const visualState: SymbolVisualState = {
    selected,
    inService: symbol.inService,
    energized: true, // Editor doesn't calculate energization
    highlighted,
    highlightSeverity,
  };

  // Build interaction handlers
  const handlers: SymbolInteractionHandlers = {
    onMouseDown,
    onClick,
  };

  return (
    <UnifiedSymbolRenderer
      symbol={symbol}
      visualState={visualState}
      handlers={handlers}
      showLabel={true}
    />
  );
};

/**
 * Grid background component.
 */
interface GridBackgroundProps {
  width: number;
  height: number;
  gridSize: number;
  visible: boolean;
}

const GridBackground: React.FC<GridBackgroundProps> = ({ width, height, gridSize, visible }) => {
  if (!visible) return null;

  const lines = [];

  // Vertical lines
  for (let x = 0; x <= width; x += gridSize) {
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke="#e5e7eb"
        strokeWidth="1"
      />
    );
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += gridSize) {
    lines.push(
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke="#e5e7eb"
        strokeWidth="1"
      />
    );
  }

  return <g>{lines}</g>;
};

/**
 * Lasso selection rectangle.
 */
interface LassoRectangleProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const LassoRectangle: React.FC<LassoRectangleProps> = ({ startX, startY, endX, endY }) => {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="rgba(59, 130, 246, 0.1)"
      stroke="#3b82f6"
      strokeWidth="1"
      strokeDasharray="4,4"
    />
  );
};

/**
 * Main SLD Canvas component.
 *
 * AUTO-LAYOUT (N-02):
 * - Layout jest wyliczany AUTOMATYCZNIE przy kazdej zmianie topologii
 * - Brak przycisku "Rozmiesc automatycznie"
 * - Deterministyczny (ten sam model -> ten sam uklad)
 * - Stabilny (mala zmiana nie powoduje "przeskoku")
 *
 * PR-SLD-05: Interakcja CANONICAL
 * - Snap do portow przy przeciaganiu
 * - Tworzenie polaczen przez klikniecie port -> port
 * - Brak swobodnego rysowania linii
 */
export const SldCanvas: React.FC = () => {
  const sldStore = useSldEditorStore();
  const isMutationBlocked = useIsMutationBlocked();
  const { startDrag, updateDrag, endDrag } = useSldDrag();
  const [activeBendDrag, setActiveBendDrag] = useState<{ edgeId: string; bendIndex: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);
  const isLassoing = useRef(false);

  const rawSymbols = Array.from(sldStore.symbols.values());
  const selectedIds = sldStore.selectedIds;
  const highlightedIds = sldStore.highlightedIds;
  const highlightSeverity = sldStore.highlightSeverity;
  const gridConfig = sldStore.gridConfig;
  const lassoState = sldStore.lassoState;
  const cadOverridesDocument = sldStore.cadOverridesDocument;
  const selectedConnectionId = sldStore.selectedConnectionId;
  const selectedBendIndex = sldStore.selectedBendIndex;
  const canEditCadGeometry = featureFlags.sldCadEditingEnabled && sldStore.geometryMode !== 'AUTO' && !isMutationBlocked;

  // PR-SLD-05: Stan tworzenia polaczen i portow
  const connectionCreationState = sldStore.connectionCreationState;
  const portSnapState = sldStore.portSnapState;
  const statusMessage = sldStore.statusMessage;
  const hoveredPortId = sldStore.hoveredPortId;

  // AUTO-LAYOUT (N-02): Automatyczne rozmieszczenie przy kazdej zmianie topologii
  // DETERMINISM: Ten sam model -> ten sam uklad
  // STABILNOSC: Mala zmiana = mala zmiana ukladu
  const {
    positions: autoLayoutPositions,
    // addOverride - dostepne do implementacji recznego przesuwania
    // debug - dostepne do debugowania
  } = useAutoLayout(rawSymbols, { gridSize: gridConfig.size });

  const autoGeometry = useMemo(() => {
    const nodes: Record<string, { pos: Position }> = {};
    autoLayoutPositions.forEach((pos, symbolId) => {
      nodes[symbolId] = { pos };
    });
    return { nodes, edges: {}, labels: {} };
  }, [autoLayoutPositions]);

  const effectiveGeometry = useMemo(
    () => applyGeometryMode(autoGeometry, cadOverridesDocument),
    [autoGeometry, cadOverridesDocument]
  );

  // Uzyj symboli z efektywna geometria
  const symbols = rawSymbols;

  // Synchronizuj pozycje z auto-layoutu do store (jednorazowo przy zmianie topologii)
  useEffect(() => {
    if (autoLayoutPositions.size > 0 && rawSymbols.length > 0) {
      const effectivePositions = new Map<string, Position>();
      Object.entries(effectiveGeometry.nodes).forEach(([symbolId, node]) => {
        effectivePositions.set(symbolId, node.pos);
      });

      // Sprawdz czy pozycje sie zmienily
      let needsUpdate = false;
      for (const [symbolId, pos] of effectivePositions) {
        const existingSymbol = sldStore.symbols.get(symbolId);
        if (existingSymbol && (existingSymbol.position.x !== pos.x || existingSymbol.position.y !== pos.y)) {
          needsUpdate = true;
          break;
        }
      }

      if (needsUpdate) {
        sldStore.updateSymbolsPositions(effectivePositions);
      }
    }
  }, [autoLayoutPositions, rawSymbols.length, effectiveGeometry, sldStore]); // Reaguj na zmiany topologii (nie na same pozycje)

  // Generate connections (N-01: port-to-port, N-05: orthogonal routing)
  // DETERMINISM: Same symbols -> same connections
  const edgeBendOverrides = useMemo(() => {
    if (sldStore.geometryMode === 'AUTO') return undefined;
    if (!cadOverridesDocument?.edges) return undefined;
    const overrides: Record<string, Position[] | undefined> = {};
    Object.entries(cadOverridesDocument.edges).forEach(([edgeId, override]) => {
      if (override.bends && override.bends.length > 0) {
        overrides[edgeId] = override.bends.map((bend) => ({ ...bend }));
      }
    });
    return overrides;
  }, [cadOverridesDocument, sldStore.geometryMode]);

  const connections = useMemo(() => generateConnections(symbols, {}, edgeBendOverrides), [symbols, edgeBendOverrides]);

  // Canvas size (fixed for now, could be dynamic)
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 800;

  // ==========================================================================
  // PR-SLD-05: Obsługa klawisza ESC dla anulowania tworzenia polaczenia
  // ==========================================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && connectionCreationState) {
        sldStore.cancelConnectionCreation();
        sldStore.showInfo('Anulowano tworzenie połączenia');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionCreationState, sldStore]);

  // ==========================================================================
  // CAD: Aktualizacja statusu overrides
  // ==========================================================================
  useEffect(() => {
    if (!featureFlags.sldCadEditingEnabled || !cadOverridesDocument) {
      sldStore.setCadOverridesStatus(null);
      return;
    }

    const baseFingerprintCurrent = computeTopologyHash(rawSymbols);
    const report = evaluateCadOverridesStatus(
      baseFingerprintCurrent,
      cadOverridesDocument.baseFingerprint,
      cadOverridesDocument,
      {
        nodes: rawSymbols.map((symbol) => symbol.id),
        edges: connections.map((connection) => connection.id),
        labels: [],
      }
    );

    sldStore.setCadOverridesStatus(report);
  }, [cadOverridesDocument, rawSymbols, connections, sldStore]);

  // ==========================================================================
  // PR-SLD-05: Walidacja polaczenia dla portu docelowego
  // ==========================================================================
  const validateTargetPort = useCallback(
    (targetPort: PortInfo): boolean => {
      if (!connectionCreationState) return false;

      const fromPort: PortInfo = {
        symbolId: connectionCreationState.fromPort.symbolId,
        elementId: connectionCreationState.fromPort.elementId,
        portName: connectionCreationState.fromPort.portName,
        position: connectionCreationState.fromPort.position,
        elementType: sldStore.getSymbol(connectionCreationState.fromPort.symbolId)?.elementType ?? '',
      };

      const result = validateConnection(fromPort, targetPort, connections);
      return result.valid;
    },
    [connectionCreationState, connections, sldStore]
  );

  // ==========================================================================
  // PR-SLD-05: Obsługa klikniecia portu
  // ==========================================================================
  const handlePortClick = useCallback(
    (port: PortInfo) => {
      if (isMutationBlocked) return;

      if (!connectionCreationState) {
        // Rozpocznij tworzenie polaczenia
        sldStore.startConnectionCreation(
          port.symbolId,
          port.portName,
          port.position,
          port.elementId
        );
        sldStore.showInfo('Kliknij port docelowy aby utworzyć połączenie');
      } else {
        // Probujemy zakonczyc polaczenie
        const fromPort: PortInfo = {
          symbolId: connectionCreationState.fromPort.symbolId,
          elementId: connectionCreationState.fromPort.elementId,
          portName: connectionCreationState.fromPort.portName,
          position: connectionCreationState.fromPort.position,
          elementType: sldStore.getSymbol(connectionCreationState.fromPort.symbolId)?.elementType ?? '',
        };

        const validation = validateConnection(fromPort, port, connections);

        if (validation.valid) {
          // Zatwierdz polaczenie
          sldStore.updateConnectionCreation(port.position, {
            symbolId: port.symbolId,
            portName: port.portName,
            position: port.position,
            elementId: port.elementId,
          });

          const result = sldStore.confirmConnection();
          if (result) {
            sldStore.showInfo('Połączenie utworzone');
          }
        } else {
          // Pokaz blad walidacji
          sldStore.showError(validation.errorMessage ?? 'Nieprawidłowe połączenie');
        }
      }
    },
    [connectionCreationState, sldStore, connections, isMutationBlocked]
  );

  // ==========================================================================
  // PR-SLD-05: Obsługa hover na porcie
  // ==========================================================================
  const handlePortHover = useCallback(
    (portId: string | null) => {
      sldStore.setHoveredPort(portId);
    },
    [sldStore]
  );

  /**
   * Handle mouse down on canvas (start lasso or deselect).
   * PR-SLD-05: Klikniecie w puste miejsce anuluje tworzenie polaczenia
   */
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (isMutationBlocked) return;
      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const position = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      // PR-SLD-05: Anuluj tworzenie polaczenia przy kliknieciu w puste miejsce
      if (connectionCreationState && e.target === svgRef.current) {
        sldStore.cancelConnectionCreation();
        sldStore.showInfo('Anulowano tworzenie połączenia');
        return;
      }

      // If clicking on empty canvas, start lasso or clear selection
      if (e.target === svgRef.current) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          sldStore.clearSelection();
          sldStore.setSelectedConnection(null);
        }
        // Start lasso
        sldStore.startLasso(position);
        isLassoing.current = true;
      }
    },
    [sldStore, isMutationBlocked, connectionCreationState]
  );

  /**
   * Handle mouse move on canvas (drag or lasso).
   * PR-SLD-05: Aktualizuj podglad polaczenia podczas tworzenia
   */
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const position = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      // PR-SLD-05: Aktualizuj podglad polaczenia
      if (connectionCreationState) {
        // Szukaj portu docelowego w zasiegu snap
        const excludeIds = new Set([connectionCreationState.fromPort.symbolId]);
        const nearestPort = findNearestPort(position, symbols, excludeIds, SNAP_CONFIG.snapRadius);

        let targetPort: typeof connectionCreationState.targetPort = null;
        if (nearestPort) {
          targetPort = {
            symbolId: nearestPort.symbolId,
            portName: nearestPort.portName,
            position: nearestPort.position,
            elementId: nearestPort.elementId,
          };
        }

        sldStore.updateConnectionCreation(position, targetPort);
        return;
      }

      if (isDragging.current) {
        updateDrag(position);
      } else if (isLassoing.current && lassoState) {
        sldStore.updateLasso(position);
      }
    },
    [updateDrag, sldStore, lassoState, connectionCreationState, symbols]
  );

  /**
   * Handle mouse up on canvas (end drag or lasso).
   */
  const handleCanvasMouseUp = useCallback(() => {
    if (isDragging.current) {
      endDrag();
      isDragging.current = false;
      // Wyczysc stan snap po zakonczeniu przeciagania
      sldStore.setPortSnapState(null);
    } else if (isLassoing.current) {
      sldStore.endLasso();
      isLassoing.current = false;
    }
  }, [endDrag, sldStore]);

  /**
   * Handle symbol mouse down (start drag).
   * PR-SLD-05: Nie rozpoczynaj drag jesli tryb tworzenia polaczenia jest aktywny
   */
  const handleSymbolMouseDown = useCallback(
    (symbolId: string, position: Position) => {
      if (isMutationBlocked) return;

      // PR-SLD-05: W trybie tworzenia polaczenia nie przeciagaj symboli
      if (connectionCreationState) return;

      startDrag(symbolId, position);
      isDragging.current = true;
    },
    [startDrag, isMutationBlocked, connectionCreationState]
  );

  /**
   * Handle symbol click (select).
   * PR-SLD-05: W trybie tworzenia polaczenia klikniecie symbolu nie zaznacza
   */
  const handleSymbolClick = useCallback(
    (symbolId: string, mode: 'single' | 'add' | 'toggle') => {
      // PR-SLD-05: W trybie tworzenia polaczenia ignoruj klikniecia symboli
      if (connectionCreationState) return;

      sldStore.selectSymbol(symbolId, mode);
      if (mode === 'single') {
        sldStore.setSelectedConnection(null);
      }
    },
    [sldStore, connectionCreationState]
  );

  const handleConnectionClick = useCallback(
    (connectionId: string, event: React.MouseEvent) => {
      if (!canEditCadGeometry || !svgRef.current || connectionCreationState) return;
      const rect = svgRef.current.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const connection = connections.find((item) => item.id === connectionId);
      sldStore.setSelectedConnection(
        connectionId,
        position,
        connection ? connection.path : null
      );
    },
    [canEditCadGeometry, connections, sldStore, connectionCreationState]
  );

  const handleBendMouseDown = useCallback(
    (edgeId: string, bendIndex: number) => (event: React.MouseEvent) => {
      if (!canEditCadGeometry) return;
      event.stopPropagation();
      sldStore.setSelectedBendIndex(bendIndex);
      setActiveBendDrag({ edgeId, bendIndex });
    },
    [canEditCadGeometry, sldStore]
  );

  useEffect(() => {
    if (!activeBendDrag || !svgRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const position = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      sldStore.updateCadEdgeBend(activeBendDrag.edgeId, activeBendDrag.bendIndex, position);
    };

    const handleMouseUp = () => {
      setActiveBendDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeBendDrag, sldStore]);

  // PR-SLD-05: Czy jest aktywny tryb tworzenia polaczenia
  const isConnectionCreationActive = connectionCreationState !== null;

  // PR-SLD-05: Port zrodlowy dla warstwy portow
  const activePort = connectionCreationState
    ? {
        symbolId: connectionCreationState.fromPort.symbolId,
        portName: connectionCreationState.fromPort.portName,
      }
    : null;

  // PR-SLD-05: Czy podglad polaczenia jest poprawny (ma port docelowy)
  const isConnectionPreviewValid = connectionCreationState?.targetPort !== null;

  const selectedConnectionBends =
    selectedConnectionId && cadOverridesDocument?.edges[selectedConnectionId]?.bends
      ? cadOverridesDocument.edges[selectedConnectionId]!.bends!
      : [];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        data-testid="sld-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border border-gray-300 bg-white"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Grid background */}
        <GridBackground
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          gridSize={gridConfig.size}
          visible={gridConfig.visible}
        />

        {/* Connections layer (rendered UNDER symbols) - N-01, N-05 */}
        <ConnectionsLayer
          connections={connections}
          selectedConnectionId={selectedConnectionId}
          onConnectionClick={handleConnectionClick}
        />

        {/* CAD: Punkty lamane dla zaznaczonego polaczenia */}
        {canEditCadGeometry && selectedConnectionId && selectedConnectionBends.length > 0 && (
          <g data-testid="sld-connection-bends">
            {selectedConnectionBends.map((bend, index) => {
              const isSelected = selectedBendIndex === index;
              return (
                <circle
                  key={`${selectedConnectionId}-bend-${index}`}
                  cx={bend.x}
                  cy={bend.y}
                  r={isSelected ? 6 : 5}
                  fill={isSelected ? '#2563eb' : '#93c5fd'}
                  stroke="#1d4ed8"
                  strokeWidth={1}
                  onMouseDown={handleBendMouseDown(selectedConnectionId, index)}
                />
              );
            })}
          </g>
        )}

        {/* Symbols */}
        {symbols.map((symbol) => (
          <SymbolRenderer
            key={symbol.id}
            symbol={symbol}
            selected={selectedIds.includes(symbol.id)}
            highlighted={highlightedIds.includes(symbol.id)}
            highlightSeverity={highlightSeverity}
            onMouseDown={handleSymbolMouseDown}
            onClick={handleSymbolClick}
          />
        ))}

        {/* PR-SLD-05: Warstwa portow (renderowana NAD symbolami) */}
        <PortLayer
          symbols={symbols}
          hoveredPortId={hoveredPortId}
          activePort={activePort}
          onPortClick={handlePortClick}
          onPortHover={handlePortHover}
          showPorts={isConnectionCreationActive}
          validateTarget={validateTargetPort}
        />

        {/* PR-SLD-05: Podglad polaczenia podczas tworzenia */}
        {connectionCreationState && (
          <ConnectionPreviewLine
            fromPosition={connectionCreationState.fromPort.position}
            toPosition={
              connectionCreationState.targetPort?.position ??
              connectionCreationState.currentMousePosition
            }
            isValid={isConnectionPreviewValid}
          />
        )}

        {/* PR-SLD-05: Indykator snap do portu podczas przeciagania */}
        {portSnapState && (
          <SnapIndicator
            sourcePosition={portSnapState.sourcePort.position}
            targetPosition={portSnapState.targetPort.position}
          />
        )}

        {/* Lasso rectangle */}
        {lassoState && (
          <LassoRectangle
            startX={lassoState.startPosition.x}
            startY={lassoState.startPosition.y}
            endX={lassoState.currentPosition.x}
            endY={lassoState.currentPosition.y}
          />
        )}
      </svg>

      {/* PR-SLD-05: Pasek statusu */}
      <StatusBar message={statusMessage} />
    </div>
  );
};
