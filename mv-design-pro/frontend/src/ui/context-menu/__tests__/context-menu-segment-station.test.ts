import { describe, expect, it } from 'vitest';

import {
  SEGMENT_SN_MENU_ACTIONS,
  STATION_SN_NN_MENU_ACTIONS,
  buildCanonicalContextMenuActions,
} from '../contextMenuRegistry';
import { hasTechnicalIcon } from '../../icons/technicalIconRegistry';

const handlers = new Proxy({}, { get: () => () => undefined }) as Record<string, () => void>;

describe('context-menu-segment-station - kanon menu odcinka SN i stacji SN/nN', () => {
  it('menu odcinka SN ma formalne akcje modelowania magistrali i obiektow posrednich', () => {
    expect(SEGMENT_SN_MENU_ACTIONS.map((action) => action.label)).toEqual([
      'Otwórz w inspektorze',
      'Edytuj odcinek',
      'Zmień typ katalogowy',
      'Wstaw stację',
      'Wstaw ZKSN',
      'Wstaw słup rozgałęźny',
      'Podziel odcinek',
      'Kontynuuj magistralę',
      'Pokaż wyniki odcinka',
      'Pokaż uzasadnienie',
      'Usuń odcinek',
    ]);
  });

  it('menu stacji SN/nN ma osobne akcje dla strony SN, transformatora i strony nN', () => {
    expect(STATION_SN_NN_MENU_ACTIONS.map((action) => action.label)).toEqual([
      'Otwórz w inspektorze',
      'Edytuj kreatorem prostym',
      'Edytuj kreatorem zaawansowanym',
      'Edytuj pola SN',
      'Edytuj transformator',
      'Edytuj stronę nN',
      'Dodaj obciążenie',
      'Dodaj źródło',
      'Pokaż wyniki stacji',
      'Pokaż uzasadnienie',
      'Dodaj do raportu',
      'Usuń stację',
    ]);
  });

  it('akcje odcinka i stacji maja ikony, testId, handler i blokady dla niedostepnych trybow', () => {
    for (const [kind, testIdPattern] of [
      ['ODCINEK_SN', /^context-menu-odcinek-sn-/],
      ['STACJA_SN_NN', /^context-menu-stacja-sn-nn-/],
    ] as const) {
      const actions = buildCanonicalContextMenuActions(kind, 'MODEL_EDIT', handlers);

      for (const action of actions) {
        expect(action.section).toBeTruthy();
        expect(action.testId).toMatch(testIdPattern);
        expect(action.handler).toBeTypeOf('function');
        expect(hasTechnicalIcon(action.icon ?? '')).toBe(true);
        if (!action.enabled) {
          expect(action.blockedReason).toBeTruthy();
        }
      }
    }
  });
});
