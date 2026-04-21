/**
 * CreatorToolbar V2 — kanoniczny pasek narzędzi edytora SLD/CAD.
 *
 * Zawiera:
 * - narzędzia interakcji (wybór, przesuwanie, edycja, usuwanie),
 * - narzędzia budowy sieci SN przez ENM_OP,
 * - paletę typów obiektów z jawnymi portami semantycznymi.
 */

import { useCallback, useMemo, useState } from 'react';
import { CREATOR_TOOLS, EDITOR_OBJECT_TYPES } from './editorPalette';
import type { CreatorTool } from './editorPalette';

interface CreatorToolbarProps {
  activeTool: CreatorTool;
  onToolChange: (tool: CreatorTool) => void;
  hasSource: boolean;
  hasCanonicalTrunkStart: boolean;
  hasRing: boolean;
  disabled?: boolean;
}

export function CreatorToolbar({
  activeTool,
  onToolChange,
  hasSource,
  hasCanonicalTrunkStart,
  hasRing,
  disabled = false,
}: CreatorToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<CreatorTool>(null);

  const handleToolClick = useCallback(
    (toolId: CreatorTool) => {
      if (disabled) return;
      onToolChange(activeTool === toolId ? null : toolId);
    },
    [activeTool, onToolChange, disabled],
  );

  const visibleTools = useMemo(
    () =>
      CREATOR_TOOLS.filter((tool) => {
        if (tool.requiresSource && !hasSource) return false;
        if (tool.requiresTrunkStart && !hasCanonicalTrunkStart) return false;
        if (tool.requiresRing && !hasRing) return false;
        if (tool.id === 'add_grid_source_sn' && hasSource) return false;
        return true;
      }),
    [hasCanonicalTrunkStart, hasRing, hasSource],
  );

  const groupedTools = useMemo(
    () => ({
      tools: visibleTools.filter((tool) => tool.group === 'NARZEDZIA'),
      build: visibleTools.filter((tool) => tool.group === 'BUDOWA_SIECI'),
    }),
    [visibleTools],
  );

  const activeDescription = CREATOR_TOOLS.find(
    (tool) => tool.id === (activeTool ?? hoveredTool),
  )?.description;

  return (
    <div className="flex flex-col border-b border-gray-200 bg-gray-50" data-testid="creator-toolbar">
      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Narzędzia edytora
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
        {groupedTools.tools.map((tool) => (
          <button
            key={tool.id}
            data-testid={`creator-tool-${tool.id}`}
            className={`
              flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              ${
                activeTool === tool.id
                  ? 'border-blue-400 bg-blue-100 text-blue-800 shadow-sm'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100'
              }
            `}
            onClick={() => handleToolClick(tool.id)}
            onMouseEnter={() => setHoveredTool(tool.id)}
            onMouseLeave={() => setHoveredTool(null)}
            disabled={disabled}
            title={tool.description}
          >
            <span className="text-sm">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-gray-200 px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Budowa sieci SN
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
        {groupedTools.build.map((tool) => (
          <button
            key={tool.id}
            data-testid={`creator-tool-${tool.id}`}
            className={`
              flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-colors
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
              ${
                activeTool === tool.id
                  ? 'border-blue-400 bg-blue-100 text-blue-800 shadow-sm'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100'
              }
            `}
            onClick={() => handleToolClick(tool.id)}
            onMouseEnter={() => setHoveredTool(tool.id)}
            onMouseLeave={() => setHoveredTool(null)}
            disabled={disabled}
            title={tool.description}
          >
            <span className="text-sm">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-gray-200 bg-white px-3 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Paleta typów obiektów
        </div>
        <div className="grid max-h-40 grid-cols-1 gap-1 overflow-auto">
          {EDITOR_OBJECT_TYPES.map((item) => (
            <div
              key={item.id}
              data-testid={`palette-object-${item.id}`}
              className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700"
            >
              <div className="font-medium">{item.label}</div>
              <div className="text-[10px] text-gray-500">
                Porty: {item.ports.length > 0 ? item.ports.map((port) => port.label).join(', ') : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeDescription && (
        <div className="border-t border-gray-100 bg-blue-50/50 px-3 py-1 text-xs text-gray-600">
          {activeDescription}
        </div>
      )}
    </div>
  );
}

export type { CreatorTool } from './editorPalette';
