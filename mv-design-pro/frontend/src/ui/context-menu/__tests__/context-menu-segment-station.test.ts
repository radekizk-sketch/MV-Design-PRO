import { describe, expect, it } from 'vitest';

import {
  SEGMENT_SN_MENU_ACTIONS,
  STATION_SN_NN_MENU_ACTIONS,
  buildCanonicalContextMenuActions,
} from '../contextMenuRegistry';
import {
  buildSegmentSNContextMenu,
  buildStationContextMenu,
} from '../actionMenuBuilders';
import { hasTechnicalIcon } from '../../icons/technicalIconRegistry';

const handlers = new Proxy({}, { get: () => () => undefined }) as Record<string, () => void>;

describe('context-menu-segment-station - kanon menu odcinka SN i stacji SN/nN', () => {
  it('menu odcinka SN ma formalne akcje modelowania magistrali i obiektow posrednich (R51 + Edytuj inline)', () => {
    expect(SEGMENT_SN_MENU_ACTIONS.map((action) => action.label)).toEqual([
      'Otwórz w inspektorze',
      'Edytuj odcinek (inline R47)',
      'Edytuj odcinek (legacy 4-kart)',
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

  it('menu stacji SN/nN ma osobne akcje dla strony SN, transformatora i strony nN (R51 + wizard 8-step)', () => {
    expect(STATION_SN_NN_MENU_ACTIONS.map((action) => action.label)).toEqual([
      'Otwórz w inspektorze',
      'Edytuj stację (wizard 8 stepów R46)',
      'Edytuj kreatorem prostym (legacy)',
      'Edytuj kreatorem zaawansowanym (legacy)',
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

  it('aktywne menu SLD zaczyna sie od kanonu odcinka i stacji, a dopiero potem pokazuje akcje zaawansowane', () => {
    const activeSegmentActions = buildSegmentSNContextMenu('MODEL_EDIT', handlers).filter((action) => !action.separator);
    const activeStationActions = buildStationContextMenu('MODEL_EDIT', handlers).filter((action) => !action.separator);
    const requiredSegmentOpening = SEGMENT_SN_MENU_ACTIONS.filter((action) => action.section !== 'Usuń');
    const requiredStationOpening = STATION_SN_NN_MENU_ACTIONS.filter((action) => action.section !== 'Usuń');

    expect(activeSegmentActions.slice(0, requiredSegmentOpening.length).map((action) => action.label)).toEqual(
      requiredSegmentOpening.map((action) => action.label),
    );
    expect(activeStationActions.slice(0, requiredStationOpening.length).map((action) => action.label)).toEqual(
      requiredStationOpening.map((action) => action.label),
    );
    expect(activeSegmentActions.at(-1)?.label).toBe('Usuń odcinek');
    expect(activeStationActions.at(-1)?.label).toBe('Usuń stację');

    const duplicateSegmentRenderKeys = findDuplicateIds(activeSegmentActions.map((action) => action.actionKey ?? action.id));
    const duplicateStationRenderKeys = findDuplicateIds(activeStationActions.map((action) => action.actionKey ?? action.id));
    expect(duplicateSegmentRenderKeys).toEqual([]);
    expect(duplicateStationRenderKeys).toEqual([]);
  });
});

function findDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  return [...duplicates].sort();
}
