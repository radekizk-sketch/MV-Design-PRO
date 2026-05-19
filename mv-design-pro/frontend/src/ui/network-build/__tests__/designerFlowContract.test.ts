/**
 * Designer Flow Contract — executable specification dla naturalnego flow
 * projektanta sieci SN opisanego w `docs/audit/AUDYT_SLD_DESIGNER_2026-05-19.md`.
 *
 * Cel: zaformalizować jako regresyjny test, że dla każdego kroku flow:
 *   1. Wstaw GPZ                       (background → insert-gpz)
 *   2. Dodaj sekcję rozdzielni SN      (gpz → add-section)
 *   3. Dodaj pole SN                   (section → add-bay)
 *   4. Wyprowadź ciąg główny           (bay → start-branch | apparatus → extend-trunk)
 *   5. Zakończ odcinek stacją          (cable_segment_sn → insert-station)
 *   6. Kontynuuj ciąg ze stacji        (station → continue-trunk)
 *   7. Rozpocznij odgałęzienie         (station → start-branch)
 *   8. Dodaj źródło PV/BESS/FW         (station → add-source)
 *
 * istnieje w `SLD_MENU_REGISTRY` w poprawnym typie elementu, ma polską etykietę
 * w sekcji `budowa` lub `edycja`, i nie jest pomyłkowo umieszczona w innym typie.
 *
 * Jeżeli ten test padnie:
 *  - albo refaktor przeniósł akcję bez aktualizacji rejestru,
 *  - albo proponowana zmiana flow nie została odzwierciedlona w registry,
 *  - albo polska etykieta odbiega od kanonu (sprawdź regex).
 *
 * Test odzwierciedla wymagania prompta /goal 2026-05-19.
 */
import { describe, expect, it } from 'vitest';

import {
  SLD_MENU_REGISTRY,
  type SldElementKindForMenu,
  type SldMenuAction,
} from '../../sld/v2/command/SldCommandService';

interface FlowStepContract {
  readonly step: number;
  readonly description: string;
  readonly elementKind: SldElementKindForMenu;
  readonly actionId: string;
  readonly expectedGroup: SldMenuAction['group'];
  readonly labelMatcher: RegExp;
}

const DESIGNER_FLOW: readonly FlowStepContract[] = [
  {
    step: 1,
    description: 'Pusta kanwa: wstaw GPZ jako pierwszy element',
    elementKind: 'background',
    actionId: 'insert-gpz',
    expectedGroup: 'budowa',
    labelMatcher: /wstaw .*(gpz|główny punkt zasilani)/i,
  },
  {
    step: 2,
    description: 'GPZ: dodaj sekcję rozdzielni SN',
    elementKind: 'gpz',
    actionId: 'add-section',
    expectedGroup: 'budowa',
    labelMatcher: /dodaj sekcję rozdzielni/i,
  },
  {
    step: 3,
    description: 'Sekcja: dodaj pole SN',
    elementKind: 'section',
    actionId: 'add-bay',
    expectedGroup: 'budowa',
    labelMatcher: /dodaj pole sn/i,
  },
  {
    step: 4,
    description: 'Pole SN: rozpocznij odgałęzienie (wyprowadź ciąg)',
    elementKind: 'bay',
    actionId: 'start-branch',
    expectedGroup: 'budowa',
    labelMatcher: /rozpocznij odgałęzienie/i,
  },
  {
    step: 4.1,
    description: 'Pole SN: zakończ ciąg w stacji (append-on-endpoint)',
    elementKind: 'bay',
    actionId: 'append-station-on-endpoint',
    expectedGroup: 'budowa',
    labelMatcher: /zakończ ciąg w stacji/i,
  },
  {
    step: 4.2,
    description: 'Aparat (głowica kablowa): wyprowadź ciąg główny',
    elementKind: 'apparatus',
    actionId: 'extend-trunk',
    expectedGroup: 'budowa',
    labelMatcher: /wyprowadź ciąg główny/i,
  },
  {
    step: 5,
    description: 'Odcinek kabla SN: zakończ stacją SN/nN',
    elementKind: 'cable_segment_sn',
    actionId: 'insert-station',
    expectedGroup: 'budowa',
    labelMatcher: /zakończ odcinek stacją/i,
  },
  {
    step: 5.1,
    description: 'Odcinek kabla SN: zakończ w ZK SN',
    elementKind: 'cable_segment_sn',
    actionId: 'insert-zksn',
    expectedGroup: 'budowa',
    labelMatcher: /zakończ odcinek w zk/i,
  },
  {
    step: 5.2,
    description: 'Odcinek kabla SN: kontynuuj ciąg główny',
    elementKind: 'cable_segment_sn',
    actionId: 'continue-trunk-from-endpoint',
    expectedGroup: 'budowa',
    labelMatcher: /kontynuuj ciąg główny/i,
  },
  {
    step: 5.3,
    description: 'Odcinek kabla SN: podziel odcinek (świadomy split z preview)',
    elementKind: 'cable_segment_sn',
    actionId: 'conscious-split-on-segment',
    expectedGroup: 'budowa',
    labelMatcher: /podziel odcinek/i,
  },
  {
    step: 5.4,
    description: 'Odcinek napowietrzny: zakończ stacją',
    elementKind: 'overhead_line_sn',
    actionId: 'insert-station',
    expectedGroup: 'budowa',
    labelMatcher: /zakończ odcinek stacją/i,
  },
  {
    step: 6,
    description: 'Stacja: kontynuuj ciąg główny dalej',
    elementKind: 'station',
    actionId: 'continue-trunk',
    expectedGroup: 'budowa',
    labelMatcher: /kontynuuj ciąg główny/i,
  },
  {
    step: 7,
    description: 'Stacja: rozpocznij odgałęzienie',
    elementKind: 'station',
    actionId: 'start-branch',
    expectedGroup: 'budowa',
    labelMatcher: /rozpocznij odgałęzienie/i,
  },
  {
    step: 8,
    description: 'Stacja: dodaj źródło (PV/BESS/FW)',
    elementKind: 'station',
    actionId: 'add-source',
    expectedGroup: 'budowa',
    labelMatcher: /dodaj źródło/i,
  },
];

describe('Designer flow contract — kanon naturalnego flow projektanta SN', () => {
  it.each(DESIGNER_FLOW)(
    'Krok $step: $description',
    ({ elementKind, actionId, expectedGroup, labelMatcher }) => {
      const menuActions = SLD_MENU_REGISTRY[elementKind];
      const action = menuActions.find((a) => a.id === actionId);

      expect(action, `Akcja "${actionId}" musi istnieć w menu typu "${elementKind}"`).toBeDefined();
      if (!action) return;

      expect(action.group, `Akcja "${actionId}" musi być w grupie "${expectedGroup}"`).toBe(
        expectedGroup,
      );
      expect(
        action.labelPl,
        `Akcja "${actionId}" musi mieć polską etykietę pasującą do ${labelMatcher}`,
      ).toMatch(labelMatcher);
    },
  );

  it('Każdy typ elementu SLD ma dedykowany rejestr menu (10 typów)', () => {
    const expectedKinds: readonly SldElementKindForMenu[] = [
      'background',
      'gpz',
      'section',
      'bay',
      'apparatus',
      'cable_segment_sn',
      'overhead_line_sn',
      'station',
      'der_pv',
      'der_bess',
      'der_fw',
    ];
    for (const kind of expectedKinds) {
      const actions = SLD_MENU_REGISTRY[kind];
      expect(actions, `Typ "${kind}" musi mieć przynajmniej 1 akcję w rejestrze`).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
    }
  });

  it('Każda akcja menu ma polską etykietę (zakaz codenames i English)', () => {
    const FORBIDDEN_PATTERNS = [
      /\bP\d+\b/, // codenames P11/P14
      /^(?:add|remove|delete|show|edit|insert|continue|start)\s/i, // czysty angielski
    ];
    const allActions: SldMenuAction[] = Object.values(SLD_MENU_REGISTRY).flat();
    for (const action of allActions) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(
          action.labelPl,
          `Akcja "${action.id}" ma etykietę "${action.labelPl}" naruszającą zakaz ${pattern}`,
        ).not.toMatch(pattern);
      }
    }
  });

  it('Każda akcja typu "usun" jest oznaczona grupą "usun"', () => {
    for (const [kind, actions] of Object.entries(SLD_MENU_REGISTRY)) {
      for (const action of actions) {
        if (action.id.startsWith('delete-')) {
          expect(
            action.group,
            `Akcja delete "${action.id}" w "${kind}" musi mieć grupę "usun"`,
          ).toBe('usun');
        }
      }
    }
  });

  it('Każda akcja w grupie "budowa" jest dostępna w jasno zdefiniowanym kontekście', () => {
    // Wszystkie akcje budowy są publiczne (visible w widoku edycji) — bez "show-".
    for (const actions of Object.values(SLD_MENU_REGISTRY)) {
      for (const action of actions) {
        if (action.group === 'budowa') {
          expect(action.id.startsWith('show-'), `Akcja budowy "${action.id}" nie może być view-only`)
            .toBe(false);
        }
      }
    }
  });
});

describe('Designer flow contract — DER (PV/BESS/FW) per stacja', () => {
  it.each(['der_pv', 'der_bess', 'der_fw'] as const)(
    'Typ %s ma akcje: open-config + show-frt-hvrt + show-ncrfg + delete',
    (kind) => {
      const actions = SLD_MENU_REGISTRY[kind];
      const actionIds = actions.map((a) => a.id);

      expect(actionIds.some((id) => id.startsWith('open-')), `${kind} musi mieć open-config`).toBe(true);
      expect(actionIds).toContain('show-frt-hvrt');
      expect(actionIds).toContain('show-ncrfg');
      expect(actionIds.some((id) => id.startsWith('delete-')), `${kind} musi mieć delete`).toBe(true);
    },
  );
});
