import { describe, expect, it } from 'vitest';

import {
  SOURCE_CONNECTION_MENU_ACTIONS,
  buildCanonicalContextMenuActions,
} from '../contextMenuRegistry';
import { hasTechnicalIcon } from '../../icons/technicalIconRegistry';

describe('context-menu-source - kanon menu źródeł i przyłączeń', () => {
  it('ma akcje profili, charakterystyk i zgodności przyłączeniowej', () => {
    expect(SOURCE_CONNECTION_MENU_ACTIONS.map((action) => action.label)).toEqual([
      'Otwórz w inspektorze',
      'Edytuj źródło',
      'Edytuj punkt przyłączenia',
      'Edytuj profil operatora',
      'Edytuj profil źródła',
      'Edytuj charakterystykę Q(U)',
      'Edytuj charakterystykę cos φ(P)',
      'Edytuj charakterystykę FRT/LVRT/HVRT',
      'Sprawdź zgodność przyłączeniową',
      'Pokaż wkład zwarciowy',
      'Pokaż wyniki na SLD',
      'Pokaż uzasadnienie inżynierskie',
      'Dodaj do raportu zgodności',
      'Usuń źródło',
    ]);
  });

  it('buduje komplet akcji z ikonami i formalnymi sekcjami', () => {
    const actions = buildCanonicalContextMenuActions(
      'ZRODLO_PRZYLACZENIE',
      'RESULT_VIEW',
      new Proxy({}, { get: () => () => undefined }) as Record<string, () => void>,
    );

    expect(actions).toHaveLength(SOURCE_CONNECTION_MENU_ACTIONS.length);
    for (const action of actions) {
      expect(action.section).toBeTruthy();
      expect(action.testId).toMatch(/^context-menu-source-/);
      expect(action.handler).toBeTypeOf('function');
      expect(hasTechnicalIcon(action.icon ?? '')).toBe(true);
      if (!action.enabled) {
        expect(action.blockedReason).toBeTruthy();
      }
    }
  });
});
