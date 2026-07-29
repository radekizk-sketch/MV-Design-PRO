/*
 * Fixture'y o realnym kształcie danych przestrzeni „Gotowość" (karta E6.1 §5).
 * `ReadinessIssue`/`FixAction` — `ui/types.ts`; `ReadinessInfo`/`FixAction`
 * (store) — `types/enm.ts`.
 */

import type { FixAction as EnmFixAction, ReadinessInfo } from '../../../../types/enm';
import type { ReadinessIssue } from '../../../../ui/types';

export function readinessIssue(over: Partial<ReadinessIssue> = {}): ReadinessIssue {
  return {
    code: 'source.grid_supply_missing',
    severity: 'BLOCKER',
    element_ref: 'GPZ-1',
    element_refs: ['GPZ-1'],
    message_pl: 'Brak źródła zasilania sieciowego (GPZ).',
    wizard_step_hint: null,
    suggested_fix: null,
    fix_action: null,
    ...over,
  };
}

/** Zestaw problemów obejmujący każdy cel gotowości (do testów grupowania). */
export function problemyWszystkieCele(): ReadinessIssue[] {
  return [
    readinessIssue({
      code: 'source.grid_supply_missing',
      severity: 'BLOCKER',
      element_ref: 'GPZ-1',
      element_refs: ['GPZ-1'],
      message_pl: 'Brak źródła zasilania sieciowego (GPZ).',
    }),
    readinessIssue({
      code: 'station.voltage_missing',
      severity: 'BLOCKER',
      element_ref: 'ST-1',
      element_refs: ['ST-1'],
      message_pl: 'Stacja nie ma zdefiniowanego napięcia.',
    }),
    readinessIssue({
      code: 'catalog.binding_missing',
      severity: 'IMPORTANT',
      element_ref: 'TR-1',
      element_refs: ['TR-1'],
      message_pl: 'Element obliczeniowy nie ma przypisanego katalogu.',
    }),
    readinessIssue({
      code: 'oze.transformer_required',
      severity: 'BLOCKER',
      element_ref: 'PV-1',
      element_refs: ['PV-1'],
      message_pl: 'Źródło OZE wymaga transformatora w ścieżce zasilania.',
    }),
    readinessIssue({
      code: 'protection.ct_required',
      severity: 'IMPORTANT',
      element_ref: 'REL-1',
      element_refs: ['REL-1'],
      message_pl: 'Przekaźnik wymaga przekładnika prądowego (CT).',
    }),
    readinessIssue({
      code: 'oze.card_field_not_accepted',
      severity: 'BLOCKER',
      element_ref: 'PV-2',
      element_refs: ['PV-2'],
      message_pl: 'Pole karty falownika wymaga akceptacji inżyniera przed pakietem OSD.',
    }),
    readinessIssue({
      code: 'E010',
      severity: 'BLOCKER',
      element_ref: 'X-1',
      element_refs: ['X-1'],
      message_pl: 'Kod bez przestrzeni nazw (Pozostałe).',
    }),
  ];
}

export function readinessInfoFixture(over: Partial<ReadinessInfo> = {}): ReadinessInfo {
  return {
    ready: true,
    blockers: [],
    warnings: [],
    ...over,
  };
}

export function readinessInfoZBlokadami(): ReadinessInfo {
  return {
    ready: false,
    blockers: [
      {
        code: 'source.grid_supply_missing',
        message_pl: 'Brak źródła zasilania sieciowego (GPZ).',
        element_ref: 'GPZ-1',
        severity: 'BLOKUJACE',
      },
    ],
    warnings: [
      {
        code: 'protection.settings_incomplete',
        message_pl: 'Nastawy przekaźnika niekompletne.',
        element_ref: 'REL-2',
        severity: 'OSTRZEZENIE',
      },
    ],
  };
}

export function enmFixActionFixture(over: Partial<EnmFixAction> = {}): EnmFixAction {
  return {
    code: 'source.grid_supply_missing',
    action_type: 'OPEN_MODAL',
    element_ref: 'GPZ-1',
    modal_type: 'SourceModal',
    panel: 'wizard',
    step: null,
    focus: 'GPZ-1',
    message_pl: 'Dodaj źródło zasilania (GPZ) na szynie głównej.',
    ...over,
  };
}
