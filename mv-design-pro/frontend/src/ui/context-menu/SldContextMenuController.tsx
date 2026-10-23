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
  type StanLacznikaMenu,
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
  /** S9-10 (predykaty parami, klasa S9-5): czy kreator odgałęzienia będzie
   *  miał PUNKT STARTU dla tego obiektu — liczone TYM SAMYM resolverem, który
   *  zasila formularz (`resolveBranchStartAvailability`,
   *  `shared/sldActionExecutor.ts`). `false` = pozycja „Rozpocznij
   *  odgałęzienie" ZABLOKOWANA z powodem (kreator bez punktu startu ma trwale
   *  zablokowany zapis); `undefined` = brak pomiaru (bez zmiany zachowania).
   *  Zastępuje martwe `stationHasFreeBay` z S9-5 (bramka istniała, żaden
   *  wołający jej nie zasilał). */
  readonly branchStartAvailable?: boolean;
  readonly hasResults?: boolean;
  readonly apparatusKind?: string;
  /** K5-A: czy stacja ma szynę nN (warunek agregatu/UPS w menu stacji). */
  readonly stationHasNnBus?: boolean;
  /** Karta S9-5 → S95-START: dostępność punktu startu ciągu SN per pozycja kontynuacji
   *  ciągu (klucz = id pozycji), z JEDNEGO rozstrzygnięcia z kontekstem operacji
   *  (`resolveTrunkStartAvailability`, `shared/sldActionExecutor.ts`). */
  readonly trunkStartAvailable?: Readonly<Partial<Record<string, boolean>>>;
  /** W5-C: stan łącznika obiektu (`akcjeElementu.ts::stanLacznikaMenu`) — ten sam
   *  resolver (`lacznikTematu`) wybiera łącznik dla wykonawcy akcji. */
  readonly lacznik?: StanLacznikaMenu;
  /** Karta GPZ-H5-SCALENIE-APARATURY: obiekt (pole, aparat pola, gałąź łączeniowa) leży na
   *  stronie 110 kV — granicy zasilania sieci SN (`akcjeElementu.ts::czyObiektGranicyWn`,
   *  lustro bram `bay_equipment.bay_hv_boundary` / `*.bus_hv_boundary`). `true` blokuje
   *  pozycje aparatury i budowy SN z powodem i nazywa obiekt „110 kV” w nagłówku. */
  readonly granicaWn?: boolean;
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
  zksn: 'Złącze kablowe SN',
  branch_pole: 'Słup rozgałęźny SN',
  der_pv: 'Źródło PV',
  der_bess: 'Magazyn energii BESS',
  der_fw: 'Farma wiatrowa',
  // Karta SLD-P (GAP P-1): nagłówek generyczny — kanwa v3 nie rozróżnia
  // podtypu DER (patrz SldCommandService.ts `SLD_MENU_REGISTRY.der`).
  der: 'Źródło OZE / generator',
};

/** Mapowanie SldElementKindForMenu → ElementType (używane wyłącznie do nagłówka fallback). */
/** Nagłówek pola i aparatu na stronie 110 kV — obiekt nie należy do rozdzielnicy SN. */
const KIND_HEADER_GRANICY_WN_PL: Readonly<Partial<Record<SldElementKindForMenu, string>>> = {
  bay: 'Pole 110 kV',
  apparatus: 'Aparat pola 110 kV',
};

/** Nagłówek rodzaju obiektu z kontekstem granicy 110 kV. */
export function naglowekRodzajuMenu(kind: SldElementKindForMenu, context?: SldMenuContext): string {
  return (context?.granicaWn ? KIND_HEADER_GRANICY_WN_PL[kind] : undefined) ?? KIND_HEADER_PL[kind];
}

const KIND_TO_ELEMENT_TYPE: Readonly<Record<SldElementKindForMenu, ElementType>> = {
  background: 'Bus',
  gpz: 'Source',
  section: 'Bus',
  bay: 'BaySN',
  apparatus: 'Switch',
  cable_segment_sn: 'LineBranch',
  overhead_line_sn: 'LineBranch',
  station: 'Station',
  zksn: 'ZKSN',
  branch_pole: 'BranchPole',
  der_pv: 'PVInverter',
  der_bess: 'BESSInverter',
  der_fw: 'Generator',
  // Karta SLD-P (GAP P-1): TA SAMA wartość co `elementTypeForKind('der')` w
  // `SldCanvasV3Workspace.tsx` (jedna prawda mapowania kind→ElementType).
  der: 'Generator',
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
  const naglowek = naglowekRodzajuMenu(request.kind, context);
  const publicElementName = elementName
    ? publicTechnicalLabel(elementName, naglowek)
    : null;
  const headerText = publicElementName && publicElementName !== naglowek
    ? `${naglowek} — ${publicElementName}`
    : naglowek;

  return (
    <ContextMenu
      isOpen={true}
      x={request.clientX}
      y={request.clientY}
      elementType={elementType}
      elementName={publicElementName ?? naglowek}
      headerText={headerText}
      mode={mode}
      actions={actions}
      onClose={onClose}
    />
  );
}

export default SldContextMenuController;
