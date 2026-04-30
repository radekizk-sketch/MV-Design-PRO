export type SemanticEngineeringRole =
  | 'LINE_FEEDER_BAY'
  | 'TRANSFORMER_BAY'
  | 'MEASUREMENT_BAY'
  | 'COUPLER_BAY'
  | 'BUSBAR_SECTION'
  | 'MV_CABLE_SEGMENT'
  | 'MV_OVERHEAD_SEGMENT'
  | 'MV_LV_TRANSFORMER'
  | 'STACJA_SN_NN'
  | 'GPZ_SUPPLY_NODE'
  | string;

export interface SemanticContextMenuElement {
  refId: string;
  engineeringRole: SemanticEngineeringRole;
  elementKind?: string;
  semanticHash?: string;
}

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

export type SemanticDomainOperationKind =
  | 'ADD_MV_LINE_BAY'
  | 'ADD_TRANSFORMER_BAY'
  | 'DERIVE_MV_CABLE_SEGMENT'
  | 'INSERT_MV_LV_STATION';

export type SemanticInvalidationTarget =
  | 'SEMANTYKA'
  | 'GOTOWOSC'
  | 'WEJSCIE_SOLVERA'
  | 'WYNIKI'
  | 'RAPORT'
  | 'SLD_VIEW';

export interface SemanticContextActionDefinition {
  actionId: string;
  labelPl: string;
  section: SemanticContextMenuSection;
  handlerRef: string;
  mode: SemanticContextActionMode;
  domainOperationKind: SemanticDomainOperationKind | null;
  operationId: string | null;
  invalidates: SemanticInvalidationTarget[];
  blockedReasonPl: string;
}

export interface SemanticContextActionSet {
  elementRefId: string;
  engineeringRole: SemanticEngineeringRole;
  actions: SemanticContextActionDefinition[];
}

type ActionDraft = Omit<
  SemanticContextActionDefinition,
  'mode' | 'domainOperationKind' | 'operationId' | 'invalidates' | 'blockedReasonPl'
> & {
  mode?: SemanticContextActionMode;
  domainOperationKind?: SemanticDomainOperationKind | null;
  operationId?: string | null;
  invalidates?: SemanticInvalidationTarget[];
  blockedReasonPl?: string;
};

const MUTATING_SECTIONS = new Set<SemanticContextMenuSection>([
  'Edytuj',
  'Dodaj',
  'Operacje',
  'Usuń',
]);

/**
 * Kanoniczna kolejność sekcji w menu kontekstowym (D2).
 *
 * Wynika z perspektywy inżyniera projektującego sieć:
 *   1. Otwórz       — najpierw poznaj element
 *   2. Edytuj       — popraw parametry
 *   3. Dodaj        — rozwiń strukturę (pole, odcinek, stacja)
 *   4. Analizuj     — sprawdź gotowość, blokery
 *   5. Wyniki       — zobacz, co policzono
 *   6. Uzasadnienie — dlaczego ten wynik
 *   7. Raport       — udokumentuj
 *   8. Operacje     — łącznikowe (zmień stan, NOP)
 *   9. Usuń         — destrukcyjne, na końcu, wizualnie oddzielone
 */
const SECTION_ORDER: readonly SemanticContextMenuSection[] = [
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

const SECTION_ORDER_INDEX: Record<SemanticContextMenuSection, number> = SECTION_ORDER.reduce(
  (acc, section, index) => {
    acc[section] = index;
    return acc;
  },
  {} as Record<SemanticContextMenuSection, number>,
);

/**
 * Zwraca akcje posortowane stabilnie wg `SECTION_ORDER`.
 * Kolejność akcji wewnątrz sekcji zachowana (Array.prototype.sort jest stable
 * od ES2019 / Node ≥ 12). Determinizm: dla tej samej listy wejściowej zawsze
 * ten sam wynik — wymóg dla `interaction_matrix_guard`.
 */
function sortActionsBySection(
  actions: readonly SemanticContextActionDefinition[],
): SemanticContextActionDefinition[] {
  return [...actions].sort((a, b) => {
    const ai = SECTION_ORDER_INDEX[a.section] ?? Number.MAX_SAFE_INTEGER;
    const bi = SECTION_ORDER_INDEX[b.section] ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

function action(draft: ActionDraft): SemanticContextActionDefinition {
  return {
    mode: draft.mode ?? 'edit',
    domainOperationKind: draft.domainOperationKind ?? null,
    operationId: draft.operationId ?? null,
    invalidates: draft.invalidates ?? [],
    blockedReasonPl:
      draft.blockedReasonPl
      ?? (draft.mode === 'result'
        ? 'Najpierw uruchom obliczenia i przejdź do obszaru Wyniki i analizy.'
        : 'Operacja wymaga trybu budowy modelu sieci.'),
    ...draft,
  };
}

function openInspector(): SemanticContextActionDefinition {
  return action({
    actionId: 'open_inspector',
    labelPl: 'Otwórz w inspektorze',
    section: 'Otwórz',
    handlerRef: 'onOpenInspector',
    mode: 'always',
  });
}

function readiness(labelPl: string): SemanticContextActionDefinition {
  return action({
    actionId: 'check_readiness',
    labelPl,
    section: 'Analizuj',
    handlerRef: 'onCheckReadiness',
    mode: 'always',
  });
}

function results(labelPl: string): SemanticContextActionDefinition {
  return action({
    actionId: 'show_results',
    labelPl,
    section: 'Wyniki',
    handlerRef: 'onShowResults',
    mode: 'result',
  });
}

function justification(labelPl = 'Pokaż uzasadnienie inżynierskie'): SemanticContextActionDefinition {
  return action({
    actionId: 'show_engineering_justification',
    labelPl,
    section: 'Uzasadnienie',
    handlerRef: 'onShowEngineeringJustification',
    mode: 'result',
  });
}

function report(): SemanticContextActionDefinition {
  return action({
    actionId: 'add_to_report',
    labelPl: 'Dodaj do raportu',
    section: 'Raport',
    handlerRef: 'onAddToReport',
    mode: 'always',
  });
}

function deleteAction(labelPl: string): SemanticContextActionDefinition {
  return action({
    actionId: 'delete',
    labelPl,
    section: 'Usuń',
    handlerRef: 'onDelete',
    operationId: 'delete',
    invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
  });
}

function bayBase(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
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

function bayTail(labelPl: string): SemanticContextActionDefinition[] {
  return [
    readiness(labelPl),
    results('Pokaż wyniki pola'),
    action({
      actionId: 'show_sld_values',
      labelPl: 'Pokaż wartości na SLD',
      section: 'Wyniki',
      handlerRef: 'onShowSldValues',
      mode: 'result',
    }),
    justification(),
    report(),
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
    deleteAction('Usuń pole'),
  ];
}

function lineFeederBay(): SemanticContextActionDefinition[] {
  return [
    ...bayBase(),
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
    ...bayTail('Sprawdź gotowość pola odpływowego'),
  ];
}

function transformerBay(): SemanticContextActionDefinition[] {
  return [
    ...bayBase(),
    action({
      actionId: 'add_transformer_sn_nn',
      labelPl: 'Podłącz transformator SN/nN',
      section: 'Dodaj',
      handlerRef: 'onAddTransformer',
      domainOperationKind: 'ADD_TRANSFORMER_BAY',
      operationId: 'add_transformer_sn_nn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    ...bayTail('Sprawdź gotowość pola transformatorowego'),
  ];
}

function measurementBay(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
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
    readiness('Sprawdź gotowość pola pomiarowego'),
    results('Pokaż wyniki pola pomiarowego'),
    // A4: pole pomiarowe ma teraz „Pokaż wartości na SLD" (parytet z line/transformer bay)
    action({
      actionId: 'show_sld_values',
      labelPl: 'Pokaż wartości pomiarów na SLD',
      section: 'Wyniki',
      handlerRef: 'onShowSldValues',
      mode: 'result',
    }),
    justification('Pokaż uzasadnienie pomiarów'),
    report(),
    deleteAction('Usuń pole pomiarowe'),
  ];
}

function couplerBay(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
    action({
      actionId: 'edit_configuration',
      labelPl: 'Edytuj konfigurację pola sprzęgłowego',
      section: 'Edytuj',
      handlerRef: 'onEditConfiguration',
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
    ...bayTail('Sprawdź gotowość pola sprzęgłowego'),
  ];
}

function busbarSection(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
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
    readiness('Sprawdź gotowość sekcji szyn'),
    results('Pokaż wyniki sekcji szyn'),
    justification('Pokaż uzasadnienie sekcji szyn'),
    // A1: sekcja szyn ma teraz „Dodaj do raportu" (parytet z innymi rolami)
    report(),
    deleteAction('Usuń sekcję szyn'),
  ];
}

function segment(label: string): SemanticContextActionDefinition[] {
  return [
    openInspector(),
    action({
      actionId: 'edit_segment',
      labelPl: `Edytuj ${label}`,
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
      actionId: 'continue_trunk_segment_sn',
      labelPl: 'Kontynuuj magistralę',
      section: 'Operacje',
      handlerRef: 'onContinueTrunk',
      operationId: 'continue_trunk_segment_sn',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    readiness(`Sprawdź gotowość ${label}`),
    results(`Pokaż wyniki ${label}`),
    justification('Pokaż uzasadnienie odcinka'),
    // A2: odcinek SN ma teraz „Dodaj do raportu" (parytet z transformatorem/stacją/GPZ)
    report(),
    deleteAction(`Usuń ${label}`),
  ];
}

function transformer(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
    action({
      actionId: 'edit_transformer_ratio',
      labelPl: 'Zmień przekładnię transformatora',
      section: 'Edytuj',
      handlerRef: 'onEditTransformerRatio',
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
    readiness('Sprawdź gotowość transformatora'),
    results('Pokaż wyniki transformatora'),
    justification('Pokaż uzasadnienie transformatora'),
    report(),
    deleteAction('Usuń transformator'),
  ];
}

function stationSnNn(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
    action({
      actionId: 'station_edit_advanced',
      labelPl: 'Edytuj stację SN/nN',
      section: 'Edytuj',
      handlerRef: 'onEditAdvanced',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'station_edit_sn_fields',
      labelPl: 'Edytuj pola SN',
      section: 'Edytuj',
      handlerRef: 'onEditSnFields',
      operationId: 'update_element_parameters',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'add_nn_load',
      labelPl: 'Dodaj obciążenie nN',
      section: 'Dodaj',
      handlerRef: 'onAddLoad',
      operationId: 'add_nn_load',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    action({
      actionId: 'add_converter_source',
      labelPl: 'Dodaj źródło po stronie nN',
      section: 'Dodaj',
      handlerRef: 'onAddSource',
      operationId: 'add_converter_source',
      invalidates: ['SEMANTYKA', 'GOTOWOSC', 'WEJSCIE_SOLVERA', 'WYNIKI', 'RAPORT', 'SLD_VIEW'],
    }),
    readiness('Sprawdź gotowość stacji'),
    results('Pokaż wyniki stacji'),
    justification('Pokaż uzasadnienie stacji'),
    report(),
    deleteAction('Usuń stację'),
  ];
}

function gpz(): SemanticContextActionDefinition[] {
  return [
    openInspector(),
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
    readiness('Sprawdź gotowość GPZ'),
    results('Pokaż wyniki GPZ'),
    justification('Pokaż uzasadnienie GPZ'),
    report(),
    deleteAction('Usuń GPZ'),
  ];
}

export const SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY: Readonly<
  Record<string, readonly SemanticContextActionDefinition[]>
> = {
  LINE_FEEDER_BAY: lineFeederBay(),
  TRANSFORMER_BAY: transformerBay(),
  MEASUREMENT_BAY: measurementBay(),
  COUPLER_BAY: couplerBay(),
  BUSBAR_SECTION: busbarSection(),
  MV_CABLE_SEGMENT: segment('odcinek kablowy SN'),
  MV_OVERHEAD_SEGMENT: segment('odcinek napowietrzny SN'),
  MV_LV_TRANSFORMER: transformer(),
  STACJA_SN_NN: stationSnNn(),
  GPZ_SUPPLY_NODE: gpz(),
};

export function buildSemanticContextActionSet(
  element: SemanticContextMenuElement,
): SemanticContextActionSet {
  const actions = SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY[element.engineeringRole] ?? [
    openInspector(),
    readiness('Sprawdź gotowość elementu'),
    results('Pokaż wyniki elementu'),
    justification(),
    report(),
  ];

  return {
    elementRefId: element.refId,
    engineeringRole: element.engineeringRole,
    // D2: explicit sortowanie wg kanonicznej kolejności sekcji.
    // Zabezpieczenie przed dryfem kolejności w funkcjach budujących role.
    actions: sortActionsBySection(actions),
  };
}

export { SECTION_ORDER, sortActionsBySection };

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
