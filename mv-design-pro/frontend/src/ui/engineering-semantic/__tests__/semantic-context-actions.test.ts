import { describe, expect, it } from 'vitest';
import {
  buildSemanticContextActionSet,
  findSemanticContextActionPolicyViolations,
  isSemanticContextActionMutating,
  SECTION_ORDER,
  SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY,
  sortActionsBySection,
  type SemanticContextMenuElement,
  type SemanticEngineeringRole,
} from '../semanticContextActions';

function elementWithRole(role: SemanticEngineeringRole): SemanticContextMenuElement {
  return {
    refId: `element-${role}`,
    elementKind: role === 'BUSBAR_SECTION'
      ? 'BUSBAR_SECTION'
      : role === 'MV_CABLE_SEGMENT'
        ? 'MV_CABLE_SEGMENT'
        : role === 'MV_OVERHEAD_SEGMENT'
          ? 'MV_OVERHEAD_SEGMENT'
          : role === 'MV_LV_TRANSFORMER'
            ? 'TRANSFORMER'
            : role === 'GPZ_SUPPLY_NODE'
              ? 'GPZ'
              : 'MV_BAY',
    engineeringRole: role,
    functionalRole: 'NOT_APPLICABLE',
    networkPosition: {
      projectRefId: 'project-test',
      parentRefId: null,
      containerRefId: null,
      voltageLevelRefId: null,
      switchgearRefId: null,
      busbarSectionRefId: null,
      bayRefId: null,
      feederRefId: null,
      branchRefId: null,
      stationRefId: null,
      orderIndex: null,
    },
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    reportEligibility: {
      RAPORT_TECHNICZNY: 'RAPORTOWALNY',
      RAPORT_OSD: 'RAPORTOWALNY',
      RAPORT_AUDYTOWY: 'RAPORTOWALNY',
      RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
      RAPORT_ZABEZPIECZEN: 'RAPORTOWALNY',
    },
    dataQualityState: 'PELNA',
    ports: [],
    terminals: [],
  } as SemanticContextMenuElement;
}

function actionIds(role: SemanticEngineeringRole): string[] {
  return buildSemanticContextActionSet(elementWithRole(role)).actions.map((action) => action.actionId);
}

describe('semantic context action policy by EngineeringRole', () => {
  it('covers required V8 engineering roles without using ElementType', () => {
    const requiredRoles: SemanticEngineeringRole[] = [
      'LINE_FEEDER_BAY',
      'TRANSFORMER_BAY',
      'MEASUREMENT_BAY',
      'COUPLER_BAY',
      'BUSBAR_SECTION',
      'MV_CABLE_SEGMENT',
      'MV_OVERHEAD_SEGMENT',
      'MV_LV_TRANSFORMER',
      'GPZ_SUPPLY_NODE',
    ];

    for (const role of requiredRoles) {
      expect(SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY[role], role).toBeDefined();
      expect(buildSemanticContextActionSet(elementWithRole(role)).actions.length, role).toBeGreaterThan(0);
    }
  });

  it('allows a line feeder bay to derive MV cable and overhead sections', () => {
    const ids = actionIds('LINE_FEEDER_BAY');
    expect(ids).toContain('derive_cable_section');
    expect(ids).toContain('derive_overhead_section');
  });

  it('does not expose MV trunk derivation for transformer or measurement bays', () => {
    for (const role of ['TRANSFORMER_BAY', 'MEASUREMENT_BAY'] as const) {
      const ids = actionIds(role);
      expect(ids).not.toContain('derive_cable_section');
      expect(ids).not.toContain('derive_overhead_section');
    }
  });

  it('limits a coupler bay to busbar-section coupling semantics', () => {
    const actions = buildSemanticContextActionSet(elementWithRole('COUPLER_BAY')).actions;
    const couplerAction = actions.find((action) => action.actionId === 'connect_busbar_sections');

    expect(couplerAction).toBeDefined();
    expect(couplerAction?.operationId).toBe('insert_section_switch_sn');
    expect(actionIds('COUPLER_BAY')).not.toContain('derive_cable_section');
    expect(actionIds('COUPLER_BAY')).not.toContain('derive_overhead_section');
  });

  it('requires mutating semantic menu actions to carry a domain operation or operation mapping', () => {
    for (const actions of Object.values(SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY)) {
      expect(findSemanticContextActionPolicyViolations(actions ?? [])).toEqual([]);
      for (const action of actions ?? []) {
        if (isSemanticContextActionMutating(action)) {
          expect(
            Boolean(action.domainOperationKind || action.operationId),
            action.actionId,
          ).toBe(true);
        }
      }
    }
  });

  it('requires every semantic menu action to have handlerRef or blocked reason', () => {
    for (const actions of Object.values(SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY)) {
      for (const action of actions ?? []) {
        expect(Boolean(action.handlerRef || action.blockedReasonPl), action.actionId).toBe(true);
      }
    }
  });

  // A1: BUSBAR_SECTION ma teraz „Dodaj do raportu"
  it('BUSBAR_SECTION exposes add_to_report (parytet z innymi rolami)', () => {
    expect(actionIds('BUSBAR_SECTION')).toContain('add_to_report');
  });

  // A2: odcinki SN mają teraz „Dodaj do raportu"
  it.each(['MV_CABLE_SEGMENT', 'MV_OVERHEAD_SEGMENT'] as const)(
    '%s exposes add_to_report',
    (role) => {
      expect(actionIds(role)).toContain('add_to_report');
    },
  );

  // A4: pole pomiarowe ma teraz „Pokaż wartości na SLD"
  it('MEASUREMENT_BAY exposes show_sld_values (parytet z LINE/TRANSFORMER bay)', () => {
    expect(actionIds('MEASUREMENT_BAY')).toContain('show_sld_values');
  });

  // D2: kanoniczna kolejność sekcji
  it('SECTION_ORDER zachowuje kolejność: Otwórz → Edytuj → Dodaj → Analizuj → Wyniki → Uzasadnienie → Raport → Operacje → Usuń', () => {
    expect([...SECTION_ORDER]).toEqual([
      'Otwórz',
      'Edytuj',
      'Dodaj',
      'Analizuj',
      'Wyniki',
      'Uzasadnienie',
      'Raport',
      'Operacje',
      'Usuń',
    ]);
  });

  it('sortActionsBySection sortuje stabilnie wg SECTION_ORDER', () => {
    const actions = buildSemanticContextActionSet(elementWithRole('LINE_FEEDER_BAY')).actions;
    const sectionsInOrder = actions.map((a) => a.section);
    const seenSections: string[] = [];
    for (const s of sectionsInOrder) {
      if (s !== seenSections[seenSections.length - 1]) {
        seenSections.push(s);
      }
    }
    // każda sekcja występuje ciągłym blokiem (sortowanie stabilne)
    const expectedSubseq = SECTION_ORDER.filter((s) => seenSections.includes(s));
    expect(seenSections).toEqual(expectedSubseq);
  });

  it('„Usuń" jest ostatnią sekcją w każdej roli (operacja destrukcyjna na końcu)', () => {
    for (const role of Object.keys(SEMANTIC_CONTEXT_ACTION_ROLE_REGISTRY) as SemanticEngineeringRole[]) {
      const actions = buildSemanticContextActionSet(elementWithRole(role)).actions;
      const last = actions[actions.length - 1];
      expect(last?.section, role).toBe('Usuń');
    }
  });

  it('sortActionsBySection nie zmienia kolejności akcji o tej samej sekcji', () => {
    const input = [
      {
        actionId: 'a',
        labelPl: 'A',
        section: 'Edytuj' as const,
        handlerRef: 'h',
        mode: 'edit' as const,
        domainOperationKind: null,
        operationId: 'update_element_parameters',
        invalidates: [],
        blockedReasonPl: '',
      },
      {
        actionId: 'b',
        labelPl: 'B',
        section: 'Edytuj' as const,
        handlerRef: 'h',
        mode: 'edit' as const,
        domainOperationKind: null,
        operationId: 'update_element_parameters',
        invalidates: [],
        blockedReasonPl: '',
      },
    ];
    const sorted = sortActionsBySection(input);
    expect(sorted.map((a) => a.actionId)).toEqual(['a', 'b']);
  });
});
