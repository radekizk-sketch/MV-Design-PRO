/**
 * SldContextMenuController — most między SLD_MENU_REGISTRY (`SldCommandService`)
 * a komponentem `<ContextMenu>` w UI/context-menu.
 *
 * Etap 1 dostarcza klikalne menu kontekstowe dla wszystkich 10 typów obiektów SLD
 * (background/gpz/section/bay/cable_segment_sn/overhead_line_sn/station/der_pv/der_bess/der_fw).
 *
 * Container (SldWorkspaceContainer) podaje:
 *   - aktywne żądanie menu (request)
 *   - opcjonalną nazwę obiektu (elementName)
 *   - handler akcji (onAction(actionId, kind, elementId))
 *   - tryb pracy (mode) z app-state
 *   - kontekst menu (np. czy pole ma już ciąg) — używany przez getMenuActions
 *
 * Komponent NIE wykonuje mutacji modelu — to robi container.
 */
import { useCallback } from 'react';

import {
  SLD_MENU_REGISTRY,
  getMenuActions,
  type SldElementKindForMenu,
  type SldMenuAction,
} from '../sld/v2/command/SldCommandService';
import type { ContextMenuAction, ElementType, OperatingMode } from '../types';
import { publicTechnicalLabel } from '../shared/publicTechnicalLabels';
import { ContextMenu } from './ContextMenu';

/** Zapytanie o pokazanie menu kontekstowego SLD. */
export interface SldContextMenuRequest {
  readonly kind: SldElementKindForMenu;
  readonly elementId: string | null;
  readonly clientX: number;
  readonly clientY: number;
}

/** Kontekst dostępności akcji. */
export interface SldMenuContext {
  readonly bayHasOutgoingRun?: boolean;
  readonly stationHasFreeBay?: boolean;
  readonly hasResults?: boolean;
  readonly apparatusKind?: string;
}

export interface SldContextMenuControllerProps {
  readonly request: SldContextMenuRequest | null;
  readonly elementName?: string;
  readonly mode: OperatingMode;
  readonly context?: SldMenuContext;
  readonly onAction: (
    actionId: string,
    kind: SldElementKindForMenu,
    elementId: string | null,
  ) => void;
  readonly onClose: () => void;
}

/** Polskie nagłówki nad menu — użyte jako headerText. */
const KIND_HEADER_PL: Readonly<Record<SldElementKindForMenu, string>> = {
  background: 'Schemat — kanwa robocza',
  gpz: 'Główny Punkt Zasilający',
  section: 'Sekcja rozdzielni SN',
  bay: 'Pole SN',
  apparatus: 'Aparat pola SN',
  cable_segment_sn: 'Odcinek kabla SN',
  overhead_line_sn: 'Odcinek linii napowietrznej SN',
  station: 'Stacja transformatorowa SN/nN',
  der_pv: 'Źródło PV',
  der_bess: 'Magazyn energii BESS',
  der_fw: 'Farma wiatrowa',
};

/** Mapowanie SldElementKindForMenu → ElementType (używane wyłącznie do nagłówka fallback). */
const KIND_TO_ELEMENT_TYPE: Readonly<Record<SldElementKindForMenu, ElementType>> = {
  background: 'Bus',
  gpz: 'Source',
  section: 'Bus',
  bay: 'BaySN',
  apparatus: 'Switch',
  cable_segment_sn: 'LineBranch',
  overhead_line_sn: 'LineBranch',
  station: 'Station',
  der_pv: 'PVInverter',
  der_bess: 'BESSInverter',
  der_fw: 'Generator',
};

const SECTION_LABEL_PL: Readonly<Record<NonNullable<SldMenuAction['group']>, string>> = {
  budowa: 'Budowa',
  edycja: 'Edycja',
  widok: 'Widok',
  usun: 'Usuń',
};

function toContextMenuActions(
  source: readonly SldMenuAction[],
  bind: (action: SldMenuAction) => () => void,
): ContextMenuAction[] {
  return source.map((action) => ({
    id: action.id,
    actionKey: action.id,
    label: action.labelPl,
    section: action.group ? SECTION_LABEL_PL[action.group] : undefined,
    enabled: !action.disabled,
    visible: true,
    blockedReason: action.disabledReasonPl,
    handler: bind(action),
    testId: `sld-menu-${action.id}`,
  }));
}

export function SldContextMenuController(
  props: SldContextMenuControllerProps,
): JSX.Element | null {
  const { request, elementName, mode, context, onAction, onClose } = props;

  const handleActionClick = useCallback(
    (action: SldMenuAction) => () => {
      if (!request) return;
      onAction(action.id, request.kind, request.elementId);
    },
    [onAction, request],
  );

  if (!request) {
    return null;
  }

  const actions = toContextMenuActions(
    getMenuActions(request.kind, context),
    handleActionClick,
  );

  if (actions.length === 0) {
    // Bezpiecznik — registry zawsze ma min. 3 akcje per kind, ale zachowujemy spójność.
    const defaultActions = SLD_MENU_REGISTRY[request.kind] ?? [];
    if (defaultActions.length === 0) {
      return null;
    }
  }

  const elementType = KIND_TO_ELEMENT_TYPE[request.kind];
  const publicElementName = elementName
    ? publicTechnicalLabel(elementName, KIND_HEADER_PL[request.kind])
    : null;
  const headerText = publicElementName && publicElementName !== KIND_HEADER_PL[request.kind]
    ? `${KIND_HEADER_PL[request.kind]} — ${publicElementName}`
    : KIND_HEADER_PL[request.kind];

  return (
    <ContextMenu
      isOpen={true}
      x={request.clientX}
      y={request.clientY}
      elementType={elementType}
      elementName={publicElementName ?? KIND_HEADER_PL[request.kind]}
      headerText={headerText}
      mode={mode}
      actions={actions}
      onClose={onClose}
    />
  );
}

export default SldContextMenuController;
