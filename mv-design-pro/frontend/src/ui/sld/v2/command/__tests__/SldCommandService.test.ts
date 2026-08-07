/**
 * PR-13 — Testy SldCommandService (menu kontekstowe + toast bus).
 */

import { describe, expect, it, beforeEach } from 'vitest';

import {
  COMMAND_FEEDBACK_PL,
  SLD_MENU_REGISTRY,
  getMenuActions,
  toastBus,
  type SldElementKindForMenu,
} from '../SldCommandService';

describe('SldCommandService — SLD_MENU_REGISTRY', () => {
  it('rejestruje typy menu dla elementów SLD', () => {
    const kinds: SldElementKindForMenu[] = [
      'background', 'gpz', 'section', 'bay', 'apparatus', 'cable_segment_sn',
      'overhead_line_sn', 'station', 'zksn', 'branch_pole', 'der_pv', 'der_bess', 'der_fw',
    ];
    for (const kind of kinds) {
      expect(SLD_MENU_REGISTRY[kind]).toBeDefined();
      expect(SLD_MENU_REGISTRY[kind].length).toBeGreaterThan(0);
    }
  });

  it('menu pustego schematu (background) ma "Wstaw główny punkt zasilania" jako pierwszą akcję', () => {
    const actions = SLD_MENU_REGISTRY.background;
    expect(actions[0].id).toBe('insert-gpz');
    expect(actions[0].labelPl).toBe('Wstaw główny punkt zasilania');
  });

  it('menu sekcji (section) NIE pokazuje "Wyprowadź ciąg główny" (zakaz briefa §2 pkt 8)', () => {
    const actions = SLD_MENU_REGISTRY.section;
    const hasExtendTrunk = actions.some((a) => a.id === 'extend-trunk');
    expect(hasExtendTrunk).toBe(false);
    // Powinno mieć "Dodaj pole SN"
    const hasAddBay = actions.some((a) => a.id === 'add-bay' && a.labelPl === 'Dodaj pole SN');
    expect(hasAddBay).toBe(true);
  });

  it('menu pola SN nie wyprowadza ciągu; akcja należy do głowicy w polu', () => {
    const actions = SLD_MENU_REGISTRY.bay;
    expect(actions.some((a) => a.id === 'extend-trunk')).toBe(false);
    expect(actions.some((a) => a.id === 'start-branch')).toBe(true);
  });

  it('menu aparatu zawiera wyprowadzenie ciągu tylko jako akcję głowicy kablowej', () => {
    const actions = SLD_MENU_REGISTRY.apparatus;
    expect(actions.some((a) => a.id === 'extend-trunk')).toBe(true);

    const breakerActions = getMenuActions('apparatus', { apparatusKind: 'breaker' });
    const breakerExtend = breakerActions.find((a) => a.id === 'extend-trunk');
    expect(breakerExtend?.disabled).toBe(true);
    expect(breakerExtend?.disabledReasonPl).toContain('głowicy kablowej');

    const cableHeadActions = getMenuActions('apparatus', { apparatusKind: 'cable_head' });
    const cableHeadExtend = cableHeadActions.find((a) => a.id === 'extend-trunk');
    expect(cableHeadExtend?.disabled).toBeUndefined();
  });

  it('menu kabla SN przewiduje dalszy projekt bez słupa rozgałęźnego', () => {
    const actions = SLD_MENU_REGISTRY.cable_segment_sn;
    expect(actions.some((a) => a.id === 'continue-trunk-from-endpoint')).toBe(true);
    expect(actions.some((a) => a.id === 'insert-station')).toBe(true);
    expect(actions.some((a) => a.id === 'insert-zksn')).toBe(true);
    expect(actions.some((a) => a.id === 'insert-pole')).toBe(false);
    expect(actions.some((a) => a.id === 'change-family-to-overhead')).toBe(true);
    // Karta S9-5 — INTENCJA ZACHOWANA, KANON ZMIENIONY: pozycja „Wstaw mufę
    // kablową" była obietnicą bez dostawcy (brak operacji w `CANONICAL_OPS`,
    // brak edytora `Branch.cable_joints` na jakimkolwiek ekranie), więc klik
    // kończył się wyłącznie komunikatem „Etap 4 roadmapy". Test pilnuje TERAZ,
    // że pozycja NIE WRACA do menu bez realnej operacji domenowej — to ta sama
    // intencja („menu kabla przewiduje dalszy projekt"), tylko bez fikcji.
    expect(actions.some((a) => a.id === 'insert-joint')).toBe(false);
  });

  it('menu linii napowietrznej ma "Wstaw słup rozgałęźny" (specyficzne dla napowietrznej)', () => {
    const actions = SLD_MENU_REGISTRY.overhead_line_sn;
    expect(actions.some((a) => a.id === 'insert-pole')).toBe(true);
    expect(actions.some((a) => a.id === 'change-family-to-cable')).toBe(true);
  });

  it('menu stacji ma "Otwórz konfigurator stacji" + akcje topologiczne', () => {
    const actions = SLD_MENU_REGISTRY.station;
    expect(actions.some((a) => a.id === 'open-station-config')).toBe(true);
    expect(actions.some((a) => a.id === 'continue-trunk')).toBe(true);
    expect(actions.some((a) => a.id === 'start-branch')).toBe(true);
  });

  it('menu ZK SN i słupa prowadzi do kart oraz odgałęzień w poprawnym medium', () => {
    expect(SLD_MENU_REGISTRY.zksn.some((a) => a.id === 'open-zksn-card')).toBe(true);
    expect(SLD_MENU_REGISTRY.zksn.some((a) => a.labelPl.includes('kablowe'))).toBe(true);
    expect(SLD_MENU_REGISTRY.branch_pole.some((a) => a.id === 'open-branch-pole-card')).toBe(true);
    expect(SLD_MENU_REGISTRY.branch_pole.some((a) => a.labelPl.includes('napowietrzne'))).toBe(true);
  });

  it('etykiety polskie bez zakazanych tokenów', () => {
    for (const kind of Object.keys(SLD_MENU_REGISTRY) as SldElementKindForMenu[]) {
      for (const action of SLD_MENU_REGISTRY[kind]) {
        expect(action.labelPl).not.toMatch(/\b(?:branch|case|run|snapshot|wizard|legacy|fallback)\b/i);
      }
    }
  });
});

describe('SldCommandService — getMenuActions z context', () => {
  it('extend-trunk disabled na głowicy, gdy pole ma już wyprowadzony ciąg', () => {
    const actions = getMenuActions('apparatus', { apparatusKind: 'cable_head', bayHasOutgoingRun: true });
    const extendAction = actions.find((a) => a.id === 'extend-trunk');
    expect(extendAction?.disabled).toBe(true);
    expect(extendAction?.disabledReasonPl).toContain('wyprowadzony');
  });

  // S9-10 (intencja S9-5 zachowana, predykat WYMIENIONY): dawne
  // `stationHasFreeBay` było bramką bez żadnego pisarza (warunek martwy) —
  // `branchStartAvailable` liczy TEN SAM resolver co kreator odgałęzienia
  // (`resolveBranchStartAvailability`), więc menu i formularz nie mogą się
  // rozjechać. Bramka jest kind-agnostyczna: iloczyn {kotwyca z pozycją
  // start-branch} × {dostępność false/true/brak pomiaru}.
  it.each(['station', 'gpz', 'section'] as const)(
    'start-branch na %s ZABLOKOWANE gdy branchStartAvailable=false (kreator nie miałby punktu startu)',
    (kind) => {
      const actions = getMenuActions(kind, { branchStartAvailable: false });
      const branchAction = actions.find((a) => a.id === 'start-branch');
      expect(branchAction?.disabled).toBe(true);
      expect(branchAction?.disabledReasonPl).toContain('Brak wolnego pola');
    },
  );

  it.each(['station', 'gpz', 'section'] as const)(
    'start-branch na %s AKTYWNE gdy branchStartAvailable=true; brak pomiaru (undefined) nie blokuje',
    (kind) => {
      const dostepne = getMenuActions(kind, { branchStartAvailable: true });
      expect(dostepne.find((a) => a.id === 'start-branch')?.disabled).not.toBe(true);
      const bezPomiaru = getMenuActions(kind, {});
      expect(bezPomiaru.find((a) => a.id === 'start-branch')?.disabled).not.toBe(true);
    },
  );

  it('show-results disabled gdy hasResults=false', () => {
    const actions = getMenuActions('bay', { hasResults: false });
    const showResults = actions.find((a) => a.id === 'show-results');
    expect(showResults?.disabled).toBe(true);
    expect(showResults?.disabledReasonPl).toContain('Brak obliczeń');
  });
});

describe('toastBus — feedback events', () => {
  beforeEach(() => {
    toastBus.__reset_for_tests();
  });

  it('publish zwraca event z severity + messagePl', () => {
    const event = toastBus.publish('success', 'Test wiadomość');
    expect(event.severity).toBe('success');
    expect(event.messagePl).toBe('Test wiadomość');
    expect(typeof event.timestamp).toBe('number');
  });

  it('subscribe + publish: listener otrzymuje event', () => {
    const events: string[] = [];
    const unsubscribe = toastBus.subscribe((e) => events.push(e.messagePl));
    toastBus.publish('info', 'Wiadomość 1');
    toastBus.publish('warning', 'Wiadomość 2');
    expect(events).toEqual(['Wiadomość 1', 'Wiadomość 2']);
    unsubscribe();
    toastBus.publish('error', 'Wiadomość 3');
    expect(events.length).toBe(2);
  });

  it('COMMAND_FEEDBACK_PL — wzorce komunikatów zgodne z briefem §17 pkt 10', () => {
    expect(COMMAND_FEEDBACK_PL.bayCreated('TR1')).toBe('Utworzono pole TR1.');
    expect(COMMAND_FEEDBACK_PL.segmentSplit).toContain('end-to-end');
    expect(COMMAND_FEEDBACK_PL.transformerAdded('TR-blok-PV')).toContain('SN/nN TR-blok-PV');
    expect(COMMAND_FEEDBACK_PL.derAttached('PV', 'PV-01')).toContain('PV');
    expect(COMMAND_FEEDBACK_PL.missingInverterData).toContain('falownika');
    expect(COMMAND_FEEDBACK_PL.voltageMismatch(15, 0.4)).toContain('transformator');
  });
});
