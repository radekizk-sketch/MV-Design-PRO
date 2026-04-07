/**
 * CreatorToolbar V2 — kanoniczny pasek narzędzi edytora SLD/CAD.
 *
 * Zawiera:
 * - Narzędzia interakcji (wybór/przesuwanie/edycja/usuwanie)
 * - Narzędzia budowy sieci SN przez ENM_OP
 * - Paletę typów obiektów z jawnymi portami semantycznymi
 */

import { useCallback, useMemo, useState } from 'react';
import { CREATOR_TOOLS, EDITOR_OBJECT_TYPES } from './editorPalette';
import type { CreatorTool } from './editorPalette';

interface CreatorToolbarProps {
  activeTool: CreatorTool;
  onToolChange: (tool: CreatorTool) => void;
  /** Whether snapshot has a source (GPZ). If not, only add_gpz is available. */
  hasSource: boolean;
  /** Whether network has a ring topology (enables NOP tool). */
  hasRing: boolean;
  /** Loading state — disable all tools during operation. */
  disabled?: boolean;
}

export function CreatorToolbar({
  activeTool,
  onToolChange,
  hasSource,
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
        if (tool.requiresRing && !hasRing) return false;
        if (tool.id === 'add_gpz' && hasSource) return false;
        return true;
      }),
    [hasRing, hasSource],
  );

  const groupedTools = useMemo(
    () => ({
      tools: visibleTools.filter((tool) => tool.group === 'NARZEDZIA'),
      build: visibleTools.filter((tool) => tool.group === 'BUDOWA_SIECI'),
    }),
    [visibleTools],
  );

  const activeDescription = CREATOR_TOOLS.find((t) => t.id === (activeTool ?? hoveredTool))?.description;

  return (
    <div className="flex flex-col border-b border-gray-200 bg-gray-50" data-testid="creator-toolbar">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-gray-500">
        Narzędzia edytora
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
        {groupedTools.tools.map((tool) => (
          <button
            key={tool.id}
            data-testid={`creator-tool-${tool.id}`}
            className={`
              flex items-center gap-1 px-2 py-1 text-xs font-medium rounded
              border transition-colors
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${
                activeTool === tool.id
                  ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
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

      <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wide font-semibold text-gray-500 border-t border-gray-200">
        Operacje sieci SN
      </div>
      <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
        {groupedTools.build.map((tool) => (
          <button
            key={tool.id}
            data-testid={`creator-tool-${tool.id}`}
            className={`
              flex items-center gap-1 px-2 py-1 text-xs font-medium rounded
              border transition-colors
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${
                activeTool === tool.id
                  ? 'bg-blue-100 border-blue-400 text-blue-800 shadow-sm'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
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

      <div className="px-3 py-2 border-t border-gray-200 bg-white">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Paleta typów obiektów
        </div>
        <div className="grid grid-cols-1 gap-1 max-h-40 overflow-auto">
          {EDITOR_OBJECT_TYPES.map((item) => (
            <div
              key={item.id}
              data-testid={`palette-object-${item.id}`}
              className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-700 bg-gray-50"
            >
              <div className="font-medium">{item.label}</div>
              <div className="text-[10px] text-gray-500">
                Porty: {item.ports.map((port) => port.label).join(', ')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeDescription && (
        <div className="px-3 py-1 bg-blue-50/50 border-t border-gray-100 text-xs text-gray-600">
          {activeDescription}
        </div>
      )}
    </div>
  );
}

export type { CreatorTool } from './editorPalette';
