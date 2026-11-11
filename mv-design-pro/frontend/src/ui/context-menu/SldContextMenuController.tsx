/**
 * SldContextMenuController — most między SLD_MENU_REGISTRY (`SldCommandService`)
 * a komponentem `<ContextMenu>` w UI/context-menu.
 *
 * Dostarcza klikalne menu kontekstowe dla każdego rodzaju obiektu SLD
 * (`SldElementKindForMenu`). Pozycje idą w kolejności rejestru, z nagłówkiem
 * sekcji kanonu (`SEKCJE_MENU_SLD`, V12K-352) przy każdej zmianie sekcji.
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
  getMenuActions,
  type SldElementKindForMenu,
  type SldMenuAction,
  type StanLacznikaMenu,
} from '../sld/v2/command/SldCommandService';
import type { ContextMenuAction, OperatingMode } from '../types';
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
  /** Schemat nN: powody blokady pozycji wykonywanych wprost (`lv-domain/operacjeNn.ts`). */
  readonly powodyBlokadyNn?: Readonly<Partial<Record<string, string | null>>>;
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
  nn_cable: 'Odcinek kabla nN',
  nn_apparatus: 'Aparat nN',
  nn_terminal: 'Zacisk nN',
  nn_load: 'Odbiór nN',
};

function toContextMenuActions(
  source: readonly SldMenuAction[],
  bind: (action: SldMenuAction) => () => void,
): ContextMenuAction[] {
  return source.map((action) => ({
    id: action.id,
    actionKey: action.id,
    label: action.labelPl,
    section: action.section,
    enabled: !action.disabled,
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

  // `getMenuActions` mapuje pozycje `SLD_MENU_REGISTRY` 1:1 — pusta lista to rodzaj
  // obiektu bez menu, więc menu się nie otwiera (zamiast pustej ramki).
  if (actions.length === 0) {
    return null;
  }

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
      headerText={headerText}
      mode={mode}
      actions={actions}
      onClose={onClose}
    />
  );
}

export default SldContextMenuController;
