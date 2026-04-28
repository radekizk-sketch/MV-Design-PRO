import type {
  ContextActionId,
  DomainOperationKind,
  EngineeringElement,
  EngineeringRole,
  InvalidationTarget,
} from './types';

export type SemanticContextMenuSection =
  | 'Otwórz'
  | 'Edytuj'
  | 'Dodaj'
  | 'Analizuj'
  | 'Wyniki'
  | 'Uzasadnienie'
  | 'Raport'
  | 'Operacje'
  | 'Usuń';

export type SemanticContextActionMode = 'edit' | 'result' | 'always';

export interface SemanticContextActionDefinition {
  actionId: ContextActionId;
  labelPl: string;
  section: SemanticContextMenuSection;
  handlerRef: string;
  mode: SemanticContextActionMode;
  domainOperationKind: DomainOperationKind | null;
  operationId: string | null;
  invalidates: InvalidationTarget[];
  blockedReasonPl: string;
}

export interface SemanticContextActionSet {
  elementRefId: string;
  engineeringRole: EngineeringRole;
  actions: SemanticContextActionDefinition[];
}

type ActionDraft = Omit<
  SemanticContextActionDefinition,
  'mode' | 'domainOperationKind' | 'operationId' | 'invalidates' | 'blockedReasonPl'
> & {
  mode?: SemanticContextActionMode;
  domainOperationKind?: DomainOperationKind | null;
  operationId?: string | null;
  invalidates?: InvalidationTarget[];
  blockedReasonPl?: string;
};

const DEFAULT_BLOCKED_REASON =
  'Akcja wymaga kanonicznej polityki roli, handlera UI oraz operacji domenowej albo jawnego powodu blokady.';

const RESULT_BLOCKED_REASON =
  'Najpierw uruchom obliczenia i przejdź do obszaru Wyniki i analizy.';

const EDIT_BLOCKED_REASON = 'Operacja wymaga trybu budowy modelu sieci.';

const MUTATING_SECTIONS = new Set<SemanticContextMenuSection>([
  'Edytuj',
  'Dodaj',
  'Operacje',
  'Usuń',
]);

function action(draft: ActionDraft): SemanticContextActionDefinition {
  return {
    mode: draft.mode ?? 'edit',
    domainOperationKind: draft.domainOperationKind ?? null,
    operationId: draft.operationId ?? null,
    invalidates: draft.invalidates ?? [],
    blockedReasonPl:
      draft.blockedReasonPl
      ?? (draft.mode === 'result'
        ? RESULT_BLOCKED_REASON
        : draft.mode === 'always'
          ? DEFAULT_BLOCKED_REASON
          : EDIT_BLOCKED_REASON),
    ...draft,
  };
}

function commonOpening(): SemanticContextActionDefinition {
  return action({
    actionId: 'open_inspector',
    labelPl: 'Otwórz w inspektorze',
    section: 'Otwórz',
    handlerRef: 'onOpenInspector',
    mode: 'always',
  });
}

function commonReadiness(labelPl = 'Sprawdź gotowość'): SemanticContextActionDefinition {
  return action({
    actionId: 'check_readiness',
    labelPl,
    section: 'Analizuj',
    handlerRef: 'onCheckReadiness',
    mode: 'always',
  });
}

function commonResult(labelPl = 'Pokaż wyniki'): SemanticContextActionDefinition {
  return action({
    actionId: 'show_results',
    labelPl,
    section: 'Wyniki',
    handlerRef: 'onShowResults',
    mode: 'result',
  });
}

function commonJustification(labelPl = 'Pokaż uzasadnienie inżynierskie'): SemanticContextActionDefinition {
  return action({
    actionId: 'show_engineering_justification',
    labelPl,
    section: 'Uzasadnienie',
    handlerRef: 'onShowEngineeringJustification',
    mode: 'result',
  });
}

function commonReport(labelPl = 'Dodaj do raportu'): SemanticContextActionDefinition {
  return action({
    actionId: 'add_to_report',
    labelPl,
    section: 'Raport',
    handlerRef: 'onAddToReport',
    mode: 'always',
  });
}

function commonDelete(labelPl: string): SemanticContextActionDefinition {
  return action({
    actionId: 'delete',
    labelPl,
    section: 'Usuń',
    handlerRef: 'onDelete',
    operationId: 'delete',
    invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
  });
}

function mvBayBaseActions(): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'edit_configuration',
      labelPl: 'Edytuj konfigurację pola',
      section: 'Edytuj',
      handlerRef: 'onEditConfiguration',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'change_switchgear',
      labelPl: 'Zmień aparat łączeniowy',
      section: 'Edytuj',
      handlerRef: 'onChangeSwitchgear',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'change_ct',
      labelPl: 'Zmień przekładnik prądowy',
      section: 'Edytuj',
      handlerRef: 'onChangeCT',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'change_vt',
      labelPl: 'Zmień przekładnik napięciowy',
      section: 'Edytuj',
      handlerRef: 'onChangeVT',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'edit_protection',
      labelPl: 'Edytuj zabezpieczenia',
      section: 'Edytuj',
      handlerRef: 'onEditProtection',
      operationId: 'update_element_parameters',
      invalidates: ['GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'edit_automation',
      labelPl: 'Edytuj automatykę pola',
      section: 'Edytuj',
      handlerRef: 'onEditAutomation',
      operationId: 'update_element_parameters',
      invalidates: ['GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
  ];
}

function mvBayResultActions(labelPl = 'Sprawdź gotowość pola'): SemanticContextActionDefinition[] {
  return [
    commonReadiness(labelPl),
    action({
      actionId: 'show_field_results',
      labelPl: 'Pokaż wyniki pola',
      section: 'Wyniki',
      handlerRef: 'onShowResults',
      mode: 'result',
    }),
    action({
      actionId: 'show_sld_values',
      labelPl: 'Pokaż wartości na SLD',
      section: 'Wyniki',
      handlerRef: 'onShowSldValues',
      mode: 'result',
    }),
    commonJustification(),
    commonReport(),
    action({
      actionId: 'change_switch_state',
      labelPl: 'Zmień stan łącznika',
      section: 'Operacje',
      handlerRef: 'onChangeSwitchState',
      operationId: 'change_switch_state',
      invalidates: ['WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'set_normal_open_point',
      labelPl: 'Ustaw jako punkt normalnie otwarty',
      section: 'Operacje',
      handlerRef: 'onSetAsNOP',
      operationId: 'set_normal_open_point',
      invalidates: ['WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    commonDelete('Usuń pole'),
  ];
}

function lineFeederBayActions(): SemanticContextActionDefinition[] {
  return [
    ...mvBayBaseActions(),
    action({
      actionId: 'derive_cable_section',
      labelPl: 'Wyprowadź odcinek kablowy',
      section: 'Dodaj',
      handlerRef: 'onDeriveCableSection',
      domainOperationKind: 'DERIVE_MV_CABLE_SEGMENT',
      operationId: 'start_branch_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'derive_overhead_section',
      labelPl: 'Wyprowadź odcinek napowietrzny',
      section: 'Dodaj',
      handlerRef: 'onDeriveOverheadSection',
      operationId: 'start_branch_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    ...mvBayResultActions(),
  ];
}

function transformerBayActions(): SemanticContextActionDefinition[] {
  return [
    ...mvBayBaseActions(),
    action({
      actionId: 'add_transformer_sn_nn',
      labelPl: 'Podłącz transformator SN/nN',
      section: 'Dodaj',
      handlerRef: 'onAddTransformer',
      domainOperationKind: 'ADD_TRANSFORMER_BAY',
      operationId: 'add_transformer_sn_nn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    ...mvBayResultActions(),
  ];
}

function measurementBayActions(): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'edit_configuration',
      labelPl: 'Edytuj konfigurację pola pomiarowego',
      section: 'Edytuj',
      handlerRef: 'onEditConfiguration',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'change_vt',
      labelPl: 'Zmień przekładnik napięciowy',
      section: 'Edytuj',
      handlerRef: 'onChangeVT',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    commonReadiness('Sprawdź gotowość pola pomiarowego'),
    commonResult('Pokaż wyniki pola pomiarowego'),
    commonJustification('Pokaż uzasadnienie pomiarów'),
    commonReport(),
    commonDelete('Usuń pole pomiarowe'),
  ];
}

function couplerBayActions(): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'edit_configuration',
      labelPl: 'Edytuj konfigurację pola sprzęgłowego',
      section: 'Edytuj',
      handlerRef: 'onEditConfiguration',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'change_switchgear',
      labelPl: 'Zmień aparat sprzęgłowy',
      section: 'Edytuj',
      handlerRef: 'onChangeSwitchgear',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'connect_busbar_sections',
      labelPl: 'Połącz sekcje szyn przez sprzęgło',
      section: 'Operacje',
      handlerRef: 'onConnectBusbarSections',
      operationId: 'insert_section_switch_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    ...mvBayResultActions('Sprawdź gotowość pola sprzęgłowego'),
  ];
}

function busbarSectionActions(): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'add_sn_bay',
      labelPl: 'Dodaj pole odpływowe SN',
      section: 'Dodaj',
      handlerRef: 'onAddSNFieldOUT',
      domainOperationKind: 'ADD_MV_LINE_BAY',
      operationId: 'add_sn_bay',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'add_transformer_bay',
      labelPl: 'Dodaj pole transformatorowe',
      section: 'Dodaj',
      handlerRef: 'onAddSNFieldTR',
      domainOperationKind: 'ADD_TRANSFORMER_BAY',
      operationId: 'add_sn_bay',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'add_coupler_bay',
      labelPl: 'Dodaj pole sprzęgłowe',
      section: 'Dodaj',
      handlerRef: 'onAddSNCoupler',
      operationId: 'add_sn_bay',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    commonReadiness('Sprawdź gotowość sekcji szyn'),
    commonResult('Pokaż wyniki sekcji szyn'),
    commonJustification('Pokaż uzasadnienie sekcji szyn'),
    commonDelete('Usuń sekcję szyn'),
  ];
}

function segmentActions(segmentLabel: string): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'edit_segment',
      labelPl: `Edytuj ${segmentLabel}`,
      section: 'Edytuj',
      handlerRef: 'onEditSegment',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'assign_catalog',
      labelPl: 'Zmień typ katalogowy',
      section: 'Edytuj',
      handlerRef: 'onAssignCatalog',
      operationId: 'assign_catalog_to_element',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'insert_station_on_segment_sn',
      labelPl: 'Wstaw stację SN/nN',
      section: 'Dodaj',
      handlerRef: 'onInsertStation',
      domainOperationKind: 'INSERT_MV_LV_STATION',
      operationId: 'insert_station_on_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'insert_zksn',
      labelPl: 'Wstaw ZKSN',
      section: 'Dodaj',
      handlerRef: 'onInsertZksn',
      operationId: 'insert_zksn_on_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'insert_branch_pole',
      labelPl: 'Wstaw słup rozgałęźny',
      section: 'Dodaj',
      handlerRef: 'onInsertBranchPole',
      operationId: 'insert_branch_pole_on_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'continue_trunk_segment_sn',
      labelPl: 'Kontynuuj magistralę',
      section: 'Operacje',
      handlerRef: 'onContinueTrunk',
      operationId: 'continue_trunk_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    commonReadiness(`Sprawdź gotowość ${segmentLabel}`),
    commonResult(`Pokaż wyniki ${segmentLabel}`),
    commonJustification('Pokaż uzasadnienie odcinka'),
    commonDelete(`Usuń ${segmentLabel}`),
  ];
}

function transformerActions(): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'edit_transformer_ratio',
      labelPl: 'Zmień przekładnię transformatora',
      section: 'Edytuj',
      handlerRef: 'onEditTransformerRatio',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'edit_vector_group',
      labelPl: 'Zmień grupę połączeń',
      section: 'Edytuj',
      handlerRef: 'onEditVectorGroup',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'assign_tr_catalog',
      labelPl: 'Przypisz katalog transformatora',
      section: 'Edytuj',
      handlerRef: 'onAssignTRCatalog',
      operationId: 'assign_catalog_to_element',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    commonReadiness('Sprawdź gotowość transformatora'),
    commonResult('Pokaż wyniki transformatora'),
    commonJustification('Pokaż uzasadnienie transformatora'),
    commonReport(),
    commonDelete('Usuń transformator'),
  ];
}

function gpzActions(): SemanticContextActionDefinition[] {
  return [
    commonOpening(),
    action({
      actionId: 'open_gpz_fields',
      labelPl: 'Otwórz pola GPZ i dodaj pole SN',
      section: 'Otwórz',
      handlerRef: 'onOpenGpzFields',
      mode: 'always',
    }),
    action({
      actionId: 'edit_sk3',
      labelPl: 'Zmień moc zwarciową Sk″',
      section: 'Edytuj',
      handlerRef: 'onEditSk3',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'edit_voltage',
      labelPl: 'Zmień napięcie szyny SN',
      section: 'Edytuj',
      handlerRef: 'onEditVoltage',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'edit_rx',
      labelPl: 'Zmień stosunek R/X',
      section: 'Edytuj',
      handlerRef: 'onEditRx',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    action({
      actionId: 'assign_catalog',
      labelPl: 'Przypisz model zwarciowy źródła',
      section: 'Edytuj',
      handlerRef: 'onAssignCatalog',
      operationId: 'assign_catalog_to_element',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT'],
    }),
    commonReadiness('Sprawdź gotowość GPZ'),
    commonResult('Pokaż wyniki GPZ'),
    commonJustification('Pokaż uzasadnienie GPZ'),
    commonReport(),
    commonDelete('Usuń GPZ'),
  ];
}

export const SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY: Readonly<
  Partial<Record<EngineeringRole, readonly SemanticContextActionDefinition[]>>
> = {
  GPZ_SUPPLY_NODE: gpzActions(),
  BUSBAR_SECTION: busbarSectionActions(),
  LINE_FEEDER_BAY: lineFeederBayActions(),
  TRANSFORMER_BAY: transformerBayActions(),
  MEASUREMENT_BAY: measurementBayActions(),
  COUPLER_BAY: couplerBayActions(),
  MV_CABLE_SEGMENT: segmentActions('odcinek kablowy SN'),
  MV_OVERHEAD_SEGMENT: segmentActions('odcinek napowietrzny SN'),
  MV_LV_TRANSFORMER: transformerActions(),
};

export function buildSemanticContextActionSet(element: EngineeringElement): SemanticContextActionSet {
  const actions = SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY[element.engineeringRole] ?? [
    commonOpening(),
    commonReadiness('Sprawdź gotowość elementu'),
    commonResult('Pokaż wyniki elementu'),
    commonJustification(),
    commonReport(),
  ];

  return {
    elementRefId: element.refId,
    engineeringRole: element.engineeringRole,
    actions: [...actions],
  };
}

export function isSemanticContextActionMutating(actionDefinition: SemanticContextActionDefinition): boolean {
  return MUTATING_SECTIONS.has(actionDefinition.section);
}

export function findSemanticContextActionPolicyViolations(
  actions: readonly SemanticContextActionDefinition[],
): string[] {
  const violations: string[] = [];
  for (const actionDefinition of actions) {
    if (!actionDefinition.handlerRef && !actionDefinition.blockedReasonPl) {
      violations.push(`${actionDefinition.actionId}: brak handlerRef albo blockedReasonPl`);
    }

    if (
      isSemanticContextActionMutating(actionDefinition)
      && !actionDefinition.domainOperationKind
      && !actionDefinition.operationId
    ) {
      violations.push(`${actionDefinition.actionId}: akcja zmieniająca model bez domainOperationKind/operationId`);
    }
  }
  return violations;
}
