/**
 * K6 (Z-11) — nagłówek prawego inspektora pokazuje TĘ SAMĄ nazwę i TEN SAM rodzaj stacji co
 * drzewo projektu. Iloczyn cech nazwy stacji w modelu:
 *
 *   {nazwa nadana przez projektanta · brak nazwy · nazwa z odwołaniem technicznym · kod stacji}
 *
 * Ścieżka natywna: klik w wiersz drzewa (realny przycisk), selekcja → inspektor; porównanie
 * tekstu wiersza drzewa z nagłówkiem inspektora (rodzaj bez rozróżniania wielkości liter —
 * drzewo pisze go małą literą po nazwie, nagłówek wielką na początku).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { SchematContextPanel } from '../../../shell/context-panels/SchematContextPanel';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';

const here = dirname(fileURLToPath(import.meta.url));
const BAZA = (
  JSON.parse(
    readFileSync(resolve(here, '..', '..', '..', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

/** Model z czterema wariantami nazwy stacji terenowych (pozycje 1–4 listy stacji). */
function model(): EnergyNetworkModel {
  const kopia = JSON.parse(JSON.stringify(BAZA)) as EnergyNetworkModel;
  const stacje = kopia.substations as unknown as Array<Record<string, unknown>>;
  stacje[2].name = '';
  stacje[3].name = String(stacje[3].ref_id);
  stacje[4].station_code = 'ab-7';
  return kopia;
}

const WARIANTY = [
  { nazwa: 'nazwa nadana przez projektanta', indeks: 1, oczekiwana: 'Stacja T1' },
  { nazwa: 'brak nazwy', indeks: 2, oczekiwana: 'S02' },
  { nazwa: 'nazwa z odwołaniem technicznym', indeks: 3, oczekiwana: 'S03' },
  { nazwa: 'kod stacji', indeks: 4, oczekiwana: 'AB-7' },
] as const;

beforeEach(() => {
  useSelectionStore.getState().clearSelection();
  act(() => useShellStore.getState().setActiveSpace('schemat'));
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useSnapshotStore.getState().reset();
});

describe.each(WARIANTY)('nagłówek inspektora = drzewo projektu: $nazwa', (wariant) => {
  it('ta sama nazwa i ten sam rodzaj stacji', () => {
    const enm = model();
    act(() => useSnapshotStore.setState({ snapshot: enm }));
    render(
      <>
        <SchematContextPanel />
        <InspektorKanwyTestowy />
      </>,
    );
    const ref = String((enm.substations as unknown as Array<Record<string, unknown>>)[wariant.indeks].ref_id);
    const wiersz = screen.getByTestId(`model-tree-row-${ref}`);
    const [etykietaDrzewa, rodzajDrzewa] = Array.from(wiersz.querySelectorAll('span.truncate')).map((s) => s.textContent ?? '');
    expect(etykietaDrzewa).toBe(wariant.oczekiwana);
    fireEvent.click(wiersz);
    const panel = screen.getByTestId('inspektor-element-kanwy');
    expect(within(panel).getByTestId('inspektor-element-etykieta').textContent).toBe(etykietaDrzewa);
    expect((within(panel).getByTestId('inspektor-element-rodzaj').textContent ?? '').toLowerCase()).toBe(rodzajDrzewa.toLowerCase());
  });
});
