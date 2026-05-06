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
  it('rejestruje 10 typów menu (per element kind)', () => {
    const kinds: SldElementKindForMenu[] = [
      'background', 'gpz', 'section', 'bay', 'cable_segment_sn',
      'overhead_line_sn', 'station', 'der_pv', 'der_bess', 'der_fw',
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

  it('menu pola SN ma "Wyprowadź ciąg główny" + "Rozpocznij odgałęzienie"', () => {
    const actions = SLD_MENU_REGISTRY.bay;
    expect(actions.some((a) => a.id === 'extend-trunk')).toBe(true);
    expect(actions.some((a) => a.id === 'start-branch')).toBe(true);
  });

  it('menu kabla SN ma "Wstaw stację transformatorową" + zmiana rodziny na napowietrzną', () => {
    const actions = SLD_MENU_REGISTRY.cable_segment_sn;
    expect(actions.some((a) => a.id === 'insert-station')).toBe(true);
    expect(actions.some((a) => a.id === 'change-family-to-overhead')).toBe(true);
    expect(actions.some((a) => a.id === 'insert-joint' && a.labelPl === 'Wstaw mufę kablową')).toBe(true);
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

  it('etykiety polskie bez zakazanych tokenów', () => {
    for (const kind of Object.keys(SLD_MENU_REGISTRY) as SldElementKindForMenu[]) {
      for (const action of SLD_MENU_REGISTRY[kind]) {
        expect(action.labelPl).not.toMatch(/\b(?:branch|case|run|snapshot|wizard|legacy|fallback)\b/i);
      }
    }
  });
});

describe('SldCommandService — getMenuActions z context', () => {
  it('extend-trunk disabled gdy bayHasOutgoingRun=true', () => {
    const actions = getMenuActions('bay', { bayHasOutgoingRun: true });
    const extendAction = actions.find((a) => a.id === 'extend-trunk');
    expect(extendAction?.disabled).toBe(true);
    expect(extendAction?.disabledReasonPl).toContain('wyprowadzony');
  });

  it('start-branch ze stacji disabled gdy stationHasFreeBay=false', () => {
    const actions = getMenuActions('station', { stationHasFreeBay: false });
    const branchAction = actions.find((a) => a.id === 'start-branch');
    expect(branchAction?.disabled).toBe(true);
    expect(branchAction?.disabledReasonPl).toContain('Brak wolnego pola');
  });

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
