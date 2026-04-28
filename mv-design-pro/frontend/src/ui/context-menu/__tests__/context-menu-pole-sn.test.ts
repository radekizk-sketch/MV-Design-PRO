import { describe, expect, it } from 'vitest';

import {
  CANONICAL_MENU_SECTIONS,
  FIELD_SN_MENU_ACTIONS,
  buildCanonicalContextMenuActions,
} from '../contextMenuRegistry';
import { hasTechnicalIcon } from '../../icons/technicalIconRegistry';

describe('context-menu-pole-sn - kanon menu pola SN', () => {
  it('ma wszystkie wymagane akcje i sekcje w kolejnosci kanonicznej', () => {
    expect(FIELD_SN_MENU_ACTIONS.map((action) => action.label)).toEqual([
      'Otwórz w inspektorze',
      'Edytuj konfigurację pola',
      'Zmień aparat łączeniowy',
      'Zmień przekładnik prądowy',
      'Zmień przekładnik napięciowy',
      'Edytuj zabezpieczenia',
      'Edytuj automatykę pola',
      'Wyprowadź odcinek kablowy',
      'Wyprowadź odcinek napowietrzny',
      'Sprawdź gotowość pola',
      'Pokaż wyniki pola',
      'Pokaż wartości na SLD',
      'Pokaż uzasadnienie inżynierskie',
      'Dodaj do raportu',
      'Zmień stan łącznika',
      'Ustaw jako punkt normalnie otwarty',
      'Usuń pole',
    ]);

    const sections = [...new Set(FIELD_SN_MENU_ACTIONS.map((action) => action.section))];
    expect(sections).toEqual(CANONICAL_MENU_SECTIONS);
  });

  it('kazda akcja ma ikone, test id, handler i powod blokady, gdy tryb nie pozwala na wynik', () => {
    const actions = buildCanonicalContextMenuActions(
      'POLE_SN',
      'MODEL_EDIT',
      new Proxy({}, { get: () => () => undefined }) as Record<string, () => void>,
    );

    for (const action of actions) {
      expect(action.section).toBeTruthy();
      expect(action.testId).toMatch(/^context-menu-pole-sn-/);
      expect(action.handler).toBeTypeOf('function');
      expect(hasTechnicalIcon(action.icon ?? '')).toBe(true);
      if (!action.enabled) {
        expect(action.blockedReason).toBeTruthy();
      }
    }
  });
});
