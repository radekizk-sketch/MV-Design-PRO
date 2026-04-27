import type { TechnicalIconName } from '../icons/technicalIconRegistry';
import type { ContextMenuAction, OperatingMode } from '../types';

export type ContextMenuSection =
  | 'Otwórz'
  | 'Edytuj'
  | 'Dodaj'
  | 'Analizuj'
  | 'Wyniki'
  | 'Uzasadnienie'
  | 'Raport'
  | 'Operacje'
  | 'Usuń';

export const CANONICAL_MENU_SECTIONS: readonly ContextMenuSection[] = [
  'Otwórz',
  'Edytuj',
  'Dodaj',
  'Analizuj',
  'Wyniki',
  'Uzasadnienie',
  'Raport',
  'Operacje',
  'Usuń',
];

export interface CanonicalContextMenuActionDefinition {
  id: string;
  label: string;
  section: ContextMenuSection;
  icon: TechnicalIconName;
  handlerName: string;
  mode?: 'edit' | 'result' | 'always';
  blockedReason?: string;
  testId: string;
}

export const FIELD_SN_MENU_ACTIONS: readonly CanonicalContextMenuActionDefinition[] = [
  field('open_inspector', 'Otwórz w inspektorze', 'Otwórz', 'ikona-ekran-inspektor-techniczny', 'onOpenInspector', 'always'),
  field('edit_configuration', 'Edytuj konfigurację pola', 'Edytuj', 'ikona-obiekt-pole-sn', 'onEditConfiguration'),
  field('change_switchgear', 'Zmień aparat łączeniowy', 'Edytuj', 'ikona-obiekt-wylacznik', 'onChangeSwitchgear'),
  field('change_ct', 'Zmień przekładnik prądowy', 'Edytuj', 'ikona-analiza-prad', 'onChangeCT'),
  field('change_vt', 'Zmień przekładnik napięciowy', 'Edytuj', 'ikona-analiza-napiecie', 'onChangeVT'),
  field('edit_protection', 'Edytuj zabezpieczenia', 'Edytuj', 'ikona-obszar-zabezpieczenia-automatyka', 'onEditProtection'),
  field('edit_automation', 'Edytuj automatykę pola', 'Edytuj', 'ikona-obszar-zabezpieczenia-automatyka', 'onEditAutomation'),
  field('derive_cable_section', 'Wyprowadź odcinek kablowy', 'Dodaj', 'ikona-obiekt-kabel-sn', 'onDeriveCableSection'),
  field('derive_overhead_section', 'Wyprowadź odcinek napowietrzny', 'Dodaj', 'ikona-obiekt-linia-napowietrzna', 'onDeriveOverheadSection'),
  field('check_readiness', 'Sprawdź gotowość pola', 'Analizuj', 'ikona-ekran-gotowosc-modelu', 'onCheckReadiness', 'always'),
  field('show_field_results', 'Pokaż wyniki pola', 'Wyniki', 'ikona-obszar-wyniki-analizy', 'onShowResults', 'result'),
  field('show_sld_values', 'Pokaż wartości na SLD', 'Wyniki', 'ikona-ekran-nakladki-wynikowe', 'onShowSldValues', 'result'),
  field('show_engineering_justification', 'Pokaż uzasadnienie inżynierskie', 'Uzasadnienie', 'ikona-wynik-uzasadnienie', 'onShowEngineeringJustification', 'result'),
  field('add_to_report', 'Dodaj do raportu', 'Raport', 'ikona-wynik-raport', 'onAddToReport', 'always'),
  field('change_switch_state', 'Zmień stan łącznika', 'Operacje', 'ikona-obiekt-rozlacznik', 'onChangeSwitchState'),
  field('set_normal_open_point', 'Ustaw jako punkt normalnie otwarty', 'Operacje', 'ikona-obiekt-punkt-normalnie-otwarty', 'onSetAsNOP'),
  field('delete_field', 'Usuń pole', 'Usuń', 'ikona-stan-blokada', 'onDelete'),
];

export const SOURCE_CONNECTION_MENU_ACTIONS: readonly CanonicalContextMenuActionDefinition[] = [
  source('open_inspector', 'Otwórz w inspektorze', 'Otwórz', 'ikona-ekran-inspektor-techniczny', 'onOpenInspector', 'always'),
  source('edit_source', 'Edytuj źródło', 'Edytuj', 'ikona-obszar-zrodla-przylaczenia', 'onEditSource'),
  source('edit_connection_point', 'Edytuj punkt przyłączenia', 'Edytuj', 'ikona-obiekt-gpz', 'onEditConnectionPoint'),
  source('edit_operator_profile', 'Edytuj profil operatora', 'Edytuj', 'ikona-dane-katalogowe', 'onEditOperatorProfile'),
  source('edit_source_profile', 'Edytuj profil źródła', 'Edytuj', 'ikona-dane-reczne', 'onEditSourceProfile'),
  source('edit_qu_profile', 'Edytuj charakterystykę Q(U)', 'Edytuj', 'ikona-analiza-napiecie', 'onEditQUProfile'),
  source('edit_cosphi_profile', 'Edytuj charakterystykę cos φ(P)', 'Edytuj', 'ikona-analiza-rozplyw-mocy', 'onEditCosPhiProfile'),
  source('edit_frt_profile', 'Edytuj charakterystykę FRT/LVRT/HVRT', 'Edytuj', 'ikona-analiza-frt', 'onEditFRTProfile'),
  source('check_connection_compliance', 'Sprawdź zgodność przyłączeniową', 'Analizuj', 'ikona-ekran-profile', 'onCheckConnectionCompliance', 'always'),
  source('show_fault_contribution', 'Pokaż wkład zwarciowy', 'Wyniki', 'ikona-analiza-zwarcia', 'onShowFaultContribution', 'result'),
  source('show_results_on_sld', 'Pokaż wyniki na SLD', 'Wyniki', 'ikona-ekran-nakladki-wynikowe', 'onShowResultsOnSld', 'result'),
  source('show_engineering_justification', 'Pokaż uzasadnienie inżynierskie', 'Uzasadnienie', 'ikona-wynik-uzasadnienie', 'onShowEngineeringJustification', 'result'),
  source('add_to_compliance_report', 'Dodaj do raportu zgodności', 'Raport', 'ikona-wynik-raport', 'onAddToComplianceReport', 'always'),
  source('delete_source', 'Usuń źródło', 'Usuń', 'ikona-stan-blokada', 'onDelete'),
];

export function buildCanonicalContextMenuActions(
  menuKind: 'POLE_SN' | 'ZRODLO_PRZYLACZENIE',
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined> = {},
): ContextMenuAction[] {
  const definitions = menuKind === 'POLE_SN' ? FIELD_SN_MENU_ACTIONS : SOURCE_CONNECTION_MENU_ACTIONS;
  return definitions.map((definition) => toContextMenuAction(definition, mode, handlers));
}

function toContextMenuAction(
  definition: CanonicalContextMenuActionDefinition,
  mode: OperatingMode,
  handlers: Record<string, (() => void) | undefined>,
): ContextMenuAction {
  const isEditMode = mode === 'MODEL_EDIT';
  const isResultMode = mode === 'RESULT_VIEW';
  const enabled =
    definition.mode === 'always'
      ? true
      : definition.mode === 'result'
        ? isResultMode
        : isEditMode;
  const blockedReason = enabled
    ? undefined
    : definition.blockedReason ?? blockedReasonForMode(definition.mode ?? 'edit');

  return {
    id: definition.id,
    actionKey: definition.id,
    label: definition.label,
    section: definition.section,
    icon: definition.icon,
    enabled,
    visible: true,
    blockedReason,
    handler: handlers[definition.handlerName],
    testId: definition.testId,
  };
}

function blockedReasonForMode(mode: 'edit' | 'result' | 'always'): string {
  if (mode === 'result') {
    return 'Najpierw uruchom obliczenia i przejdź do obszaru Wyniki i analizy.';
  }
  if (mode === 'edit') {
    return 'Operacja wymaga trybu budowy modelu sieci.';
  }
  return 'Operacja chwilowo niedostępna dla bieżącego kontekstu.';
}

function field(
  id: string,
  label: string,
  section: ContextMenuSection,
  icon: TechnicalIconName,
  handlerName: string,
  mode: CanonicalContextMenuActionDefinition['mode'] = 'edit',
): CanonicalContextMenuActionDefinition {
  return {
    id,
    label,
    section,
    icon,
    handlerName,
    mode,
    testId: `context-menu-pole-sn-${id}`,
  };
}

function source(
  id: string,
  label: string,
  section: ContextMenuSection,
  icon: TechnicalIconName,
  handlerName: string,
  mode: CanonicalContextMenuActionDefinition['mode'] = 'edit',
): CanonicalContextMenuActionDefinition {
  return {
    id,
    label,
    section,
    icon,
    handlerName,
    mode,
    testId: `context-menu-source-${id}`,
  };
}
