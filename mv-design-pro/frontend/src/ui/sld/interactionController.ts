import type { SelectedElement } from '../types';
import type { CreatorTool } from '../topology/editorPalette';
import { CREATOR_TOOLS } from '../topology/editorPalette';
import type { CanonicalOpName } from '../../types/domainOps';

export type ToolRuntimeStatus = 'DZIALA' | 'ZABLOKOWANE' | 'MAPOWANIE';

export interface InteractionContextState {
  hasSource: boolean;
  hasRing: boolean;
  activeCaseId: string | null;
}

export interface ToolStatusRow {
  tool: Exclude<CreatorTool, null>;
  canonicalOp: CanonicalOpName | null;
  status: ToolRuntimeStatus;
  reasonPl: string;
}

export interface ResolvedToolAction {
  mode: 'SELECT_ONLY' | 'OPEN_FORM' | 'DOMAIN_OP' | 'BLOCKED';
  canonicalOp: CanonicalOpName | null;
  payload: Record<string, unknown>;
  reasonPl: string | null;
}

export interface InteractionTargetContext {
  kind: 'canvas' | 'element' | 'port';
  portRole?: 'TRUNK_IN' | 'TRUNK_OUT' | 'BRANCH_OUT' | 'RING' | 'NN_SOURCE';
}

const TOOL_STATUS: Record<Exclude<CreatorTool, null>, ToolRuntimeStatus> = {
  select: 'DZIALA',
  move: 'DZIALA',
  add_gpz: 'DZIALA',
  continue_trunk: 'DZIALA',
  insert_station: 'DZIALA',
  start_branch: 'DZIALA',
  connect_ring: 'ZABLOKOWANE',
  set_nop: 'ZABLOKOWANE',
  add_pv: 'ZABLOKOWANE',
  add_bess: 'ZABLOKOWANE',
  edit_properties: 'DZIALA',
  assign_catalog: 'DZIALA',
  delete_element: 'DZIALA',
};

function buildBlockedReason(tool: Exclude<CreatorTool, null>): string {
  switch (tool) {
    case 'connect_ring':
      return 'Domknięcie ringu jest poza zakresem tego etapu i pozostaje wygaszone.';
    case 'set_nop':
      return 'Ustawianie NOP pozostaje wygaszone do etapu domknięcia ringu.';
    case 'add_pv':
    case 'add_bess':
      return 'Źródła OZE/BESS nie są częścią tego etapu inżynierskiego przepływu SN.';
    default:
      return 'Narzędzie jest zablokowane w bieżącym etapie produktu.';
  }
}

function buildOpenFormContext(
  tool: Exclude<CreatorTool, null>,
  target: SelectedElement,
): Record<string, unknown> {
  switch (tool) {
    case 'add_gpz':
      return {};
    case 'continue_trunk':
      return {
        fromTerminalId: target.id,
        terminalLabel: target.name,
      };
    case 'insert_station':
      return {
        segmentRef: target.id,
        segmentLabel: target.name,
        insertRatio: 0.5,
      };
    case 'start_branch':
      return {
        fromRef: `${target.id}.BRANCH`,
        from_bus_ref: target.type === 'Bus' ? target.id : undefined,
        sourceLabel: target.name,
      };
    case 'assign_catalog':
      return {
        element_ref: target.id,
        element_name: target.name,
        element_type: target.type,
      };
    case 'edit_properties':
      return {
        element_ref: target.id,
        element_name: target.name,
      };
    default:
      return {};
  }
}

function buildDeletePayload(target: SelectedElement): Record<string, unknown> {
  return {
    element_ref: target.id,
  };
}

export function getToolStatusTable(): ToolStatusRow[] {
  return CREATOR_TOOLS.map((tool) => {
    const status = TOOL_STATUS[tool.id];
    if (status === 'DZIALA') {
      return {
        tool: tool.id,
        canonicalOp: tool.canonicalOp,
        status,
        reasonPl: 'Narzędzie prowadzi do kanonicznego formularza albo operacji domenowej bez zgadywania parametrów.',
      };
    }

    return {
      tool: tool.id,
      canonicalOp: tool.canonicalOp,
      status,
      reasonPl: buildBlockedReason(tool.id),
    };
  });
}

export function resolveToolAction(
  tool: CreatorTool,
  target: SelectedElement,
  ctx: InteractionContextState,
  interaction: InteractionTargetContext = { kind: 'element' },
): ResolvedToolAction {
  if (!tool || tool === 'select' || tool === 'move') {
    return {
      mode: 'SELECT_ONLY',
      canonicalOp: null,
      payload: {},
      reasonPl: null,
    };
  }

  if (!ctx.activeCaseId) {
    return {
      mode: 'BLOCKED',
      canonicalOp: null,
      payload: {},
      reasonPl: 'Brak aktywnego przypadku — wybierz lub utwórz case.',
    };
  }

  const def = CREATOR_TOOLS.find((item) => item.id === tool);
  if (!def || !def.canonicalOp) {
    return {
      mode: 'BLOCKED',
      canonicalOp: null,
      payload: {},
      reasonPl: 'Narzędzie nie ma przypisanej operacji domenowej.',
    };
  }

  const status = TOOL_STATUS[tool];
  if (status !== 'DZIALA') {
    return {
      mode: 'BLOCKED',
      canonicalOp: def.canonicalOp,
      payload: {},
      reasonPl: buildBlockedReason(tool),
    };
  }

  if (def.requiresSource && !ctx.hasSource) {
    return {
      mode: 'BLOCKED',
      canonicalOp: def.canonicalOp,
      payload: {},
      reasonPl: 'Najpierw dodaj GPZ lub źródło zasilania SN.',
    };
  }

  const allowedTargets: Partial<Record<Exclude<CreatorTool, null>, InteractionTargetContext['kind'][]>> = {
    add_gpz: ['canvas'],
    continue_trunk: ['port'],
    insert_station: ['element'],
    start_branch: ['port'],
    edit_properties: ['element'],
    assign_catalog: ['element'],
    delete_element: ['element', 'port'],
  };

  const allowed = allowedTargets[tool] ?? ['element'];
  if (!allowed.includes(interaction.kind)) {
    const targetLabels: Record<InteractionTargetContext['kind'], string> = {
      canvas: 'płótna',
      element: 'elementu',
      port: 'portu',
    };
    return {
      mode: 'BLOCKED',
      canonicalOp: def.canonicalOp,
      payload: {},
      reasonPl: `To narzędzie wymaga kliknięcia ${allowed.map((item) => targetLabels[item]).join(' lub ')}.`,
    };
  }

  if (tool === 'continue_trunk' && interaction.portRole !== 'TRUNK_OUT') {
    return {
      mode: 'BLOCKED',
      canonicalOp: def.canonicalOp,
      payload: {},
      reasonPl: 'Kontynuacja magistrali wymaga portu TRUNK_OUT na otwartym końcu sieci.',
    };
  }

  if (tool === 'start_branch' && interaction.portRole !== 'BRANCH_OUT') {
    return {
      mode: 'BLOCKED',
      canonicalOp: def.canonicalOp,
      payload: {},
      reasonPl: 'Odgałęzienie może wystartować tylko z portu BRANCH_OUT.',
    };
  }

  if (tool === 'insert_station' && target.type !== 'LineBranch') {
    return {
      mode: 'BLOCKED',
      canonicalOp: def.canonicalOp,
      payload: {},
      reasonPl: 'Wstawienie stacji wymaga wskazania odcinka SN.',
    };
  }

  if (tool === 'delete_element') {
    return {
      mode: 'DOMAIN_OP',
      canonicalOp: def.canonicalOp,
      payload: buildDeletePayload(target),
      reasonPl: null,
    };
  }

  return {
    mode: 'OPEN_FORM',
    canonicalOp: def.canonicalOp,
    payload: buildOpenFormContext(tool, target),
    reasonPl: null,
  };
}
