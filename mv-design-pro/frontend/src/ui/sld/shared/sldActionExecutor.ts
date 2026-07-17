/**
 * `useSldActionExecutor` — F11.4-B/ARCH-3 (`docs/sld/SLD_CAD_SPEC_V3.md`
 * §10.1, rozstrzygnięcie architekta 2026-07-16: „wykonawca akcji domenowych
 * na v3: BRAMKA REALNA, wdrażana. Menu kontekstowe i akcje drawera na v3
 * muszą wykonywać TE SAME akcje co v2 [...] przez ekstrakcję wykonawcy do
 * modułu współdzielonego (jedna prawda, zero duplikacji)"; patrz też plan
 * F8c pkt 1a/2).
 *
 * ŹRÓDŁO: wyciągnięte 1:1 (zero zmiany zachowania) z
 * `v2/canvas/SldWorkspaceContainer.tsx`:
 *   - `handleAction` (ciało `useCallback`, ~linie 1790-1901) → ciało hooka
 *     `useSldActionExecutor` poniżej,
 *   - czyste zależności modułowe wołane przez `handleAction`:
 *     `parseGpzApparatusSelectionId` (~241), `elementTypeForSldKind` +
 *     `buildSldOperationContext` + `operationOpenMessage` (~405-546, ostatnia
 *     to prywatny helper `buildSldOperationContext`, nieeksportowany również
 *     tutaj), `ACTION_TO_SCREEN` (~700), `routeSurfaceLabelPl` (~728),
 *     `ACTION_ROADMAP_HINT_PL` (~762), `DELETE_ACTION_OBJECT_LABEL_PL` +
 *     `isSldDeleteAction` (~790-802), `DRAWER_ACTION_LABEL_PL` (~666, użyty
 *     przez oba kontenery przy wiązaniu akcji drawera z `getMenuActions`).
 *
 * Zależności hookowe `handleAction` są WYŁĄCZNIE store-poziomowe (zweryfikowane
 * względem architekta): `notify` (`notifications/store`), `toastBus`
 * (`v2/command/SldCommandService`), `executeDomainOperation`+`snapshot`+
 * `logicalViews` (`useSnapshotStore`), `activeCaseId` (`useAppStateStore`),
 * `openOperationForm`+`openRouteSurface` (`useNetworkBuildStore`),
 * `selectElement` (`useSelectionStore`) — WSZYSTKIE store'y są WSPÓLNE między
 * v2 i v3 (Core Rule #3, brak shadow-modelu), więc hook działa identycznie
 * niezależnie od tego, która wersja kanwy go woła.
 *
 * `parseGpzApparatusSelectionId`/`elementTypeForSldKind`/
 * `buildSldOperationContext`/`DRAWER_ACTION_LABEL_PL` są eksportowane, bo v2
 * nadal ich używa POZA `handleAction` (np. `describeGpzApparatus`,
 * `detailDrawerActions`, dopasowanie apparatus-selection w context-menu) —
 * v2 importuje je z powrotem stąd zamiast duplikować.
 */
import { useCallback } from 'react';

import { useAppStateStore } from '../../app-state';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import type { NetworkBuildOperationName } from '../../network-build/internal/legacySurfaceTypes';
import { buildOperationContext } from '../../network-build/operationContext';
import { notify } from '../../notifications/store';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { EnergyNetworkModel, LogicalViewsV1 } from '../../../types/enm';
import type { ElementType } from '../../types';
import {
  toastBus,
  type SldElementKindForMenu,
} from '../v2/command/SldCommandService';

/** Mapowanie ID akcji na ekran kanoniczny (E-XX). Etapy 1-3 obsługują E-04/24/36/38, E-10/11/13. */
export const ACTION_TO_SCREEN: Readonly<Record<string, string>> = {
  'show-readiness': 'E-04',
  'show-results': 'E-24',
  'show-rationale': 'E-36',
  'open-catalogs': 'E-38',
  // Etap 3:
  'open-source': 'E-10', // GPZ konfigurator
  'add-section': 'E-10',
  'open-bay': 'E-11',
  'configure-equipment': 'E-11',
  'configure-cts-vts': 'E-11',
  'configure-protection': 'E-11',
  'open-station-config': 'E-13',
  // Etap 4: sieć terenowa (odcinki SN, ZK SN, słupy, NOP, odgałęzienia):
  'edit-laying': 'E-12',
  'edit-line': 'E-12',
  'change-catalog': 'E-12',
  'show-thermal': 'E-12',
  'open-zksn-card': 'E-14',
  'open-branch-pole-card': 'E-15',
  // Etap 5: układy PV/BESS/FW:
  'open-pv-config': 'E-21',
  'open-bess-config': 'E-22',
  'open-fw-config': 'E-23',
  'show-frt-hvrt': 'E-26',
  'show-ncrfg': 'E-26',
};

export function routeSurfaceLabelPl(screenCode: string): string {
  switch (screenCode) {
    case 'E-10':
      return 'konfigurację GPZ';
    case 'E-11':
      return 'konfigurację pola SN';
    case 'E-12':
      return 'konfigurację odcinka SN';
    case 'E-13':
      return 'konfigurację stacji SN/nN';
    case 'E-14':
      return 'kartę ZK SN';
    case 'E-15':
      return 'kartę słupa rozgałęźnego';
    case 'E-21':
      return 'konfigurację PV';
    case 'E-22':
      return 'konfigurację BESS';
    case 'E-23':
      return 'konfigurację farmy wiatrowej';
    case 'E-24':
      return 'wyniki obliczeń';
    case 'E-26':
      return 'wymagania przyłączeniowe NC RfG';
    case 'E-36':
      return 'dowody obliczeń';
    case 'E-38':
      return 'katalogi techniczne';
    default:
      return 'konfigurację układu';
  }
}

/** Akcje, które są zaplanowane w kolejnych etapach roadmapy — toast informacyjny. */
export const ACTION_ROADMAP_HINT_PL: Readonly<Record<string, string>> = {
  'insert-gpz': 'Wstawianie Głównego Punktu Zasilającego: Etap 6 roadmapy (insert tool). Tymczasowo użyj operacji domenowej add_grid_source_sn z panelu ENM.',
  'add-section': 'Dodawanie sekcji rozdzielni SN: Etap 4 roadmapy (sieć terenowa).',
  'add-bay': 'Dodawanie pola SN: Etap 4 roadmapy.',
  'extend-trunk': 'Wyprowadzanie ciągu głównego: Etap 4 roadmapy.',
  'start-branch': 'Rozpoczynanie odgałęzienia: Etap 4 roadmapy.',
  'insert-station': 'Wstawianie stacji transformatorowej: Etap 4 roadmapy.',
  'insert-zksn': 'Wstawianie złącza kablowego SN: Etap 4 roadmapy.',
  'insert-sectional': 'Wstawianie łącznika sekcyjnego: Etap 4 roadmapy.',
  'insert-joint': 'Wstawianie mufy kablowej: Etap 4 roadmapy.',
  'insert-pole': 'Wstawianie słupa rozgałęźnego: Etap 4 roadmapy.',
  'add-source': 'Wybór PV, BESS albo farmy wiatrowej odbywa się w karcie "Układy PV/BESS/FW" konfiguratora stacji.',
  'add-load': 'Dodawanie obciążenia nN: Etap 4 roadmapy.',
  'continue-trunk': 'Kontynuacja ciągu głównego: Etap 4 roadmapy.',
  'set-switch-state': 'Zmiana stanu łącznika: Etap 6 roadmapy.',
  'show-measurements': 'Podgląd pomiarów pola: Etap 7 roadmapy.',
  'show-sc-source': 'Dane zwarciowe źródła GPZ są dostępne w karcie "Strona 110 kV" konfiguratora GPZ.',
  'show-sc-data': 'Dane zwarciowe sekcji są dostępne w konfiguratorze GPZ, w karcie "Strona 110 kV".',
  'change-family-to-overhead': 'Zmiana rodziny odbywa się w konfiguratorze odcinka, w karcie "Identyfikacja i rodzina".',
  'change-family-to-cable': 'Zmiana rodziny odbywa się w konfiguratorze odcinka, w karcie "Identyfikacja i rodzina".',
  'delete-bay': 'Usuwanie pola SN: Etap 4 roadmapy.',
  'delete-segment': 'Usuwanie odcinka: Etap 4 roadmapy.',
  'delete-station': 'Usuwanie stacji: Etap 4 roadmapy.',
  'delete-pv': 'Usuwanie źródła PV: Etap 5 roadmapy.',
  'delete-bess': 'Usuwanie BESS: Etap 5 roadmapy.',
  'delete-fw': 'Usuwanie farmy wiatrowej: Etap 5 roadmapy.',
};

export const DELETE_ACTION_OBJECT_LABEL_PL: Readonly<Record<string, string>> = {
  'delete-bay': 'pole SN',
  'delete-segment': 'odcinek SN',
  'delete-station': 'stację SN/nN',
  'delete-zksn': 'złącze kablowe SN',
  'delete-branch-pole': 'słup rozgałęźny SN',
  'delete-pv': 'źródło PV',
  'delete-bess': 'magazyn BESS',
  'delete-fw': 'farmę wiatrową',
};

export function isSldDeleteAction(actionId: string): boolean {
  return Object.prototype.hasOwnProperty.call(DELETE_ACTION_OBJECT_LABEL_PL, actionId);
}

/** Etykiety PL akcji drawera — WSPÓLNE dla v2 (`SldWorkspaceContainer.
 *  detailDrawerActions`) i v3 (drawer wiring, ARCH-3), obie strony czytają tę
 *  samą tablicę zamiast dwóch niezależnych kopii. */
export const DRAWER_ACTION_LABEL_PL: Readonly<Record<string, string>> = {
  'open-source': 'Konfiguruj źródło GPZ',
  'open-bay': 'Otwórz kartę pola',
  'open-station-config': 'Konfiguruj stację',
  'open-zksn-card': 'Otwórz kartę ZK SN',
  'open-branch-pole-card': 'Otwórz kartę słupa',
  'continue-trunk': 'Kontynuuj ciąg główny',
  'continue-trunk-from-endpoint': 'Kontynuuj ciąg główny',
  'start-branch': 'Rozpocznij odgałęzienie',
  'add-source': 'Dodaj PV/BESS/FW',
  'add-load': 'Dodaj odbiór nN',
  'insert-station': 'Zakończ odcinek stacją',
  'insert-zksn': 'Zakończ odcinek w ZK SN',
  'insert-pole': 'Zakończ odcinek słupem',
  'conscious-split-on-segment': 'Podziel odcinek z podglądem',
  'change-catalog': 'Zmień typ katalogowy',
  'extend-trunk': 'Wyprowadź ciąg z portu',
  'configure-equipment': 'Skonfiguruj aparaturę',
  'configure-cts-vts': 'Skonfiguruj przekładniki',
  'configure-protection': 'Skonfiguruj zabezpieczenia',
  'show-results': 'Pokaż wyniki',
  'show-readiness': 'Pokaż gotowość',
  'show-rationale': 'Pokaż uzasadnienie',
  'delete-bay': 'Usuń pole',
  'delete-segment': 'Usuń odcinek',
  'delete-station': 'Usuń stację',
  'delete-zksn': 'Usuń ZK SN',
  'delete-branch-pole': 'Usuń słup',
  'delete-pv': 'Usuń PV',
  'delete-bess': 'Usuń BESS',
  'delete-fw': 'Usuń FW',
};

/** `id` w postaci `${bayRef}#${apparatusKind}` (konwencja GPZ canonical
 *  overlay, `SldWorkspaceContainer.buildGpzApparatusOverlayTargets`). */
export function parseGpzApparatusSelectionId(id: string): { bayRef: string; apparatusKind: string } | null {
  const marker = id.lastIndexOf('#');
  if (marker <= 0 || marker === id.length - 1) return null;
  return { bayRef: id.slice(0, marker), apparatusKind: id.slice(marker + 1) };
}

interface SldOperationAction {
  readonly op: NetworkBuildOperationName;
  readonly context: Record<string, unknown>;
  readonly messagePl: string;
}

export function elementTypeForSldKind(kind: SldElementKindForMenu): ElementType | null {
  switch (kind) {
    case 'gpz':
      return 'Source';
    case 'section':
      return 'Bus';
    case 'bay':
      return 'BaySN';
    case 'apparatus':
      return 'Switch';
    case 'cable_segment_sn':
    case 'overhead_line_sn':
      return 'LineBranch';
    case 'station':
      return 'Station';
    case 'zksn':
      return 'ZKSN';
    case 'branch_pole':
      return 'BranchPole';
    case 'der_pv':
      return 'PVInverter';
    case 'der_bess':
      return 'BESSInverter';
    case 'der_fw':
      return 'Generator';
    case 'background':
    default:
      return null;
  }
}

function operationOpenMessage(op: NetworkBuildOperationName, actionId: string): string {
  if (actionId === 'conscious-split-on-segment') {
    return 'Otwieram świadomy podział odcinka z podglądem skutków topologicznych.';
  }
  switch (op) {
    case 'continue_trunk_segment_sn':
      return 'Otwieram formularz wyprowadzenia ciągu SN z wybranego portu.';
    case 'insert_station_on_segment_sn':
      return 'Otwieram formularz wstawienia stacji SN/nN.';
    case 'insert_zksn_on_segment_sn':
      return 'Otwieram formularz wstawienia ZK SN.';
    case 'insert_branch_pole_on_segment_sn':
      return 'Otwieram formularz wstawienia słupa rozgałęźnego.';
    case 'insert_section_switch_sn':
      return 'Otwieram formularz wstawienia łącznika sekcyjnego.';
    case 'start_branch_segment_sn':
      return 'Otwieram formularz rozpoczęcia odgałęzienia SN.';
    case 'add_sn_bay':
      return 'Otwieram formularz dodania pola SN.';
    case 'add_nn_load':
      return 'Otwieram formularz dodania obciążenia nN.';
    case 'set_normal_open_point':
      return 'Otwieram formularz punktu normalnie otwartego.';
    default:
      return 'Otwieram formularz operacji domenowej.';
  }
}

export function buildSldOperationContext(
  actionId: string,
  kind: SldElementKindForMenu,
  elementId: string | null,
  snapshot: EnergyNetworkModel | null,
  logicalViews: LogicalViewsV1 | null,
): SldOperationAction | null {
  if (actionId === 'insert-gpz') {
    return {
      op: 'add_grid_source_sn',
      context: { source: 'sld_context_menu' },
      messagePl: 'Otwieram formularz głównego punktu zasilania.',
    };
  }

  if (!elementId) return null;

  const apparatusSelection = kind === 'apparatus' ? parseGpzApparatusSelectionId(elementId) : null;
  const operationElementId = apparatusSelection ? apparatusSelection.bayRef : elementId;
  const operationKind: SldElementKindForMenu = apparatusSelection ? 'bay' : kind;
  if (kind === 'apparatus' && actionId === 'extend-trunk' && apparatusSelection?.apparatusKind !== 'cable_head') {
    return null;
  }

  const elementType = elementTypeForSldKind(operationKind);
  if (!elementType) return null;

  const opByAction: Partial<Record<string, NetworkBuildOperationName>> = {
    'add-bay': 'add_sn_bay',
    'extend-trunk': 'continue_trunk_segment_sn',
    'continue-trunk': 'continue_trunk_segment_sn',
    'continue-trunk-from-endpoint': 'continue_trunk_segment_sn',
    'append-station-on-endpoint': 'continue_trunk_segment_sn',
    'start-branch': 'start_branch_segment_sn',
    'insert-station': 'insert_station_on_segment_sn',
    'conscious-split-on-segment': 'insert_station_on_segment_sn',
    'insert-zksn': 'insert_zksn_on_segment_sn',
    'insert-pole': 'insert_branch_pole_on_segment_sn',
    'insert-sectional': 'insert_section_switch_sn',
    'add-load': 'add_nn_load',
    'set-switch-state': 'set_normal_open_point',
  };
  const op = opByAction[actionId];
  if (!op) return null;

  const extraContext: Record<string, unknown> = { source: 'sld_context_menu' };
  if (apparatusSelection) {
    extraContext.apparatus_ref = elementId;
    extraContext.apparatus_kind = apparatusSelection.apparatusKind;
    extraContext.bay_ref = apparatusSelection.bayRef;
  }
  if (actionId === 'append-station-on-endpoint') {
    extraContext.default_termination = 'station';
    extraContext.default_termination_label = 'Zakończ odcinek stacją';
  }
  if (actionId === 'continue-trunk-from-endpoint') {
    extraContext.default_termination = 'continue';
    extraContext.default_termination_label = 'Kontynuuj ciąg główny';
  }
  if (actionId === 'conscious-split-on-segment') {
    extraContext.split_mode = 'explicit_preview_required';
    extraContext.split_label = 'Świadomy podział odcinka';
  }

  return {
    op,
    context: buildOperationContext({
      canonicalOp: op,
      elementId: operationElementId,
      elementType,
      snapshot,
      logicalViews,
      extraContext,
    }),
    messagePl: operationOpenMessage(op, actionId),
  };
}

/**
 * Wykonawca akcji domenowych menu/drawera SLD — JEDNA implementacja dla v2 i
 * v3 (ARCH-3). Kolejność gałęzi (NIE zmieniać — semantyka 1:1 z oryginałem
 * `SldWorkspaceContainer.handleAction`): readOnly-guard → delete (z
 * potwierdzeniem `notify` sticky) → nawigacja (`ACTION_TO_SCREEN`) →
 * `buildSldOperationContext` (formularze operacji domenowych) → add-source
 * stacji (skrót do E-13 karty DER) → roadmap hint (`ACTION_ROADMAP_HINT_PL`)
 * → fallback techniczny.
 */
export function useSldActionExecutor(
  { readOnly }: { readonly readOnly: boolean },
): (actionId: string, kind: SldElementKindForMenu, elementId: string | null) => void {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const selectElement = useSelectionStore((state) => state.selectElement);

  return useCallback(
    (actionId: string, kind: SldElementKindForMenu, elementId: string | null) => {
      if (readOnly && (actionId.startsWith('delete-') || actionId.startsWith('insert-')
          || actionId.startsWith('add-') || actionId.startsWith('extend-')
          || actionId.startsWith('start-') || actionId === 'set-switch-state'
          || actionId === 'continue-trunk'
          || actionId === 'continue-trunk-from-endpoint')) {
        notify('Tryb podglądu schematu — przełącz na edycję, aby budować sieć.', 'warning');
        return;
      }

      if (isSldDeleteAction(actionId)) {
        if (!activeCaseId) {
          notify('Nie wybrano aktywnego zakresu obliczeń. Wybierz zakres przed zmianą modelu.', 'warning');
          return;
        }
        if (!elementId) {
          notify('Nie wskazano obiektu do usunięcia. Zaznacz element na schemacie i ponów akcję.', 'warning');
          return;
        }

        const objectLabel = DELETE_ACTION_OBJECT_LABEL_PL[actionId] ?? 'element';
        const executeDelete = () => {
          void executeDomainOperation(activeCaseId, 'delete_element', {
            element_ref: elementId,
            action_id: actionId,
            source: 'sld_context_menu',
          }).then((response: unknown) => {
            const result = response as { error?: unknown } | null;
            if (result?.error) {
              notify(`Nie usunięto elementu: ${String(result.error)}`, 'error');
              return;
            }
            selectElement(null);
            notify(`Usunięto ${objectLabel} z modelu sieci.`, 'success');
          });
        };
        notify(`Potwierdź usunięcie: ${objectLabel}. Operacja zostanie zapisana w historii zmian.`, {
          type: 'warning',
          sticky: true,
          actions: [
            { label: 'Usuń', variant: 'danger', onClick: executeDelete },
            { label: 'Anuluj', onClick: () => undefined },
          ],
        });
        return;
      }

      // 1) Akcje nawigacyjne — otwórz istniejącą powierzchnię.
      const screenCode = ACTION_TO_SCREEN[actionId];
      if (screenCode) {
        const apparatusSelection = kind === 'apparatus' && elementId
          ? parseGpzApparatusSelectionId(elementId)
          : null;
        const navigationElementId = apparatusSelection?.bayRef ?? elementId;
        openRouteSurface(screenCode as Parameters<typeof openRouteSurface>[0], {
          entityRef: navigationElementId ?? null,
          subjectKind: 'helper_context',
        });
        toastBus.publish('info', `Otworzono ${routeSurfaceLabelPl(screenCode)}.`);
        return;
      }

      const operationContext = buildSldOperationContext(
        actionId,
        kind,
        elementId,
        snapshot,
        logicalViews,
      );
      if (operationContext) {
        openOperationForm(operationContext.op, operationContext.context);
        notify(operationContext.messagePl, 'info');
        return;
      }

      // 1b) Faza G: 'add-source' z menu stacji → otwiera E-13 Karta 7 i prosi
      //     o kreator DER. Stację identyfikuje elementId (kontekst SLD).
      if (actionId === 'add-source' && kind === 'station' && elementId) {
        openRouteSurface('E-13', {
          entityRef: elementId,
          subjectKind: 'helper_context',
          payload: { defaultCard: 'der-sources' },
        });
        // Wystawiamy intent — controller w E-13 (StationConfiguratorSurface)
        // pokaże menu wyboru kindu (PV/BESS/FW) lub bezpośrednio uruchomi
        // kreator. Domyślnie sugerujemy PV; user wybiera w E-13.
        notify(
          'Otwarto kartę "Układy PV/BESS/FW" stacji. Użyj osobnych przycisków "Dodaj PV", "Dodaj BESS" albo "Dodaj FW", aby uruchomić właściwy kreator.',
          'info',
        );
        return;
      }

      // 2) Akcje roadmapowe — toast informacyjny z dokładną etapowością.
      const hint = ACTION_ROADMAP_HINT_PL[actionId];
      if (hint) {
        notify(hint, 'info');
        return;
      }

      // 5) Fallback techniczny: akcja ma handler informacyjny, ale nie ma pełnego
      // kontekstu ENM/katalogu do wykonania operacji.
      notify(
        `Akcja "${actionId}" wymaga kompletnego kontekstu obiektu albo danych katalogowych. Otwórz kartę techniczną zaznaczonego elementu i uzupełnij wskazane pola.`,
        'warning',
      );
      // Konsumujemy parametr kind, żeby spełnić noUnusedParameters w trybie strict.
      void kind;
    },
    [activeCaseId, executeDomainOperation, logicalViews, openOperationForm, openRouteSurface, readOnly, selectElement, snapshot],
  );
}
