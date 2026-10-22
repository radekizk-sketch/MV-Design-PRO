/**
 * K6 (Z-12) — złożenie prawego inspektora dla obiektu schematu jako ILOCZYN CECH:
 *
 *   rodzaj obiektu {stacja · pole · transformator}
 *   × tryb {MODEL_EDIT — edycja operacją domenową · RESULT_VIEW — tylko odczyt}.
 *
 * Ścieżka natywna: klik w uchwyt trafienia kanwy (`data-hit-for`), jak w aplikacji.
 * Przypina trzy obietnice karty K6:
 *  - kolejność sekcji: nagłówek → karta techniczna → wyniki → działania (na końcu);
 *  - działania są ZWINIĘTE (`<details>` bez `open`) i rozwijają się jednym klikiem;
 *  - przycisk „Zmień" istnieje wyłącznie w trybie edycji modelu i otwiera operację domenową
 *    `update_element_parameters` z refem i polem obiektu (bez atrapy w trybie wyników).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore } from '../../../sld-overlay/rawResultOverlayStore';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useNetworkBuildStore } from '../../networkBuildStore';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../../sld/v3/scene/buildScene';
import { SldCanvasV3Workspace } from '../../../sld/v3/canvas/SldCanvasV3Workspace';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';

const here = dirname(fileURLToPath(import.meta.url));
const SIEC = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

interface Przypadek {
  readonly nazwa: string;
  readonly lod: SceneLod;
  readonly predykat: (s: SceneV3['symbols'][number]) => boolean;
  readonly rodzajKarty: string;
}

const PRZYPADKI: readonly Przypadek[] = [
  { nazwa: 'stacja', lod: 0, predykat: (s) => s.meta?.elementKind === 'station' && s.symbolId !== 'gpzCollapsed', rodzajKarty: 'stacja' },
  {
    nazwa: 'pole',
    lod: 2,
    predykat: (s) => s.meta?.elementKind === 'apparatus' && !s.meta?.deviceRef && Boolean(s.meta?.ownerRef?.includes('/sn_field/')),
    rodzajKarty: 'pole',
  },
  { nazwa: 'transformator', lod: 2, predykat: (s) => s.meta?.elementKind === 'transformer', rodzajKarty: 'transformator' },
];

const otworzOperacje = vi.fn();
const pierwotne = useNetworkBuildStore.getState().openOperationForm;

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-karta', activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
  useNetworkBuildStore.setState({ openOperationForm: otworzOperacje });
  otworzOperacje.mockClear();
  act(() => useShellStore.getState().setActiveSpace('model'));
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useNetworkBuildStore.setState({ openOperationForm: pierwotne });
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
});

function kliknij(przypadek: Przypadek): HTMLElement {
  useSnapshotStore.setState({ snapshot: SIEC });
  const { container } = render(
    <>
      <SldCanvasV3Workspace width={1322} height={696} lodOverride={przypadek.lod === 0 ? undefined : przypadek.lod} />
      <InspektorKanwyTestowy />
    </>,
  );
  const scena = buildSceneV3(SIEC, przypadek.lod);
  const i = scena.symbols.findIndex(przypadek.predykat);
  expect(i, 'symbol w scenie').toBeGreaterThanOrEqual(0);
  const testId = scena.symbols[i].meta?.testId ?? `sld-v3-symbol-${i}`;
  const uchwyt = container.querySelector(`[data-hit-for="${testId}"]`);
  expect(uchwyt, `uchwyt trafienia ${testId}`).not.toBeNull();
  fireEvent.click(uchwyt!, { detail: 1 });
  return screen.getByTestId('inspektor-element-kanwy');
}

describe.each(PRZYPADKI)('inspektor — karta techniczna: $nazwa', (przypadek) => {
  it('kolejność: nagłówek → karta → wyniki → działania (zwinięte, na końcu)', () => {
    const panel = kliknij(przypadek);
    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', przypadek.rodzajKarty);
    const kolejnosc = [
      'inspektor-element-kontekst',
      'inspektor-karta',
      'inspektor-wyniki',
      'inspektor-dzialania-zwiniete',
    ].map((id) => screen.getByTestId(id));
    for (let k = 1; k < kolejnosc.length; k += 1) {
      // DOCUMENT_POSITION_FOLLOWING: następna sekcja leży po poprzedniej.
      expect(kolejnosc[k - 1].compareDocumentPosition(kolejnosc[k]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const dzieci = Array.from(panel.children);
    expect(dzieci[dzieci.length - 1]).toBe(screen.getByTestId('inspektor-dzialania-zwiniete'));
  });

  it('działania zwinięte do chwili rozwinięcia jednym klikiem', () => {
    kliknij(przypadek);
    const zwiniete = screen.getByTestId('inspektor-dzialania-zwiniete') as HTMLDetailsElement;
    expect(zwiniete.open).toBe(false);
    expect(screen.getByTestId('inspektor-dzialania-rozwin').textContent).toMatch(/^Działania \(\d+\)$/);
    fireEvent.click(screen.getByTestId('inspektor-dzialania-rozwin'));
    expect(zwiniete.open).toBe(true);
  });

  it('MODEL_EDIT: „Zmień" przy nazwie otwiera operację domenową update_element_parameters', () => {
    kliknij(przypadek);
    const zmien = screen.getByTestId('inspektor-karta-zmien-nazwa');
    fireEvent.click(zmien);
    expect(otworzOperacje).toHaveBeenCalledTimes(1);
    const [operacja, kontekst] = otworzOperacje.mock.calls[0] as [string, Record<string, unknown>];
    expect(operacja).toBe('update_element_parameters');
    expect(kontekst.field).toBe('name');
    expect(typeof kontekst.element_ref).toBe('string');
    expect(kontekst.source).toBe('inspektor_karta');
  });

  it('RESULT_VIEW: karta bez przycisków „Zmień" (tylko odczyt, bez atrapy)', () => {
    act(() => useAppStateStore.setState({ activeMode: 'RESULT_VIEW' }));
    kliknij(przypadek);
    expect(screen.getByTestId('inspektor-karta')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^inspektor-karta-zmien-/)).toHaveLength(0);
  });
});
