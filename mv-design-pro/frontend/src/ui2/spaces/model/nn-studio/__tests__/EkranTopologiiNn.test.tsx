/**
 * Testy zakładki TOPOLOGIA — drzewo nN + pasek akcji (karta P0.9). Realna
 * ścieżka: klik natywny na węźle drzewa odblokowuje akcje „Dodaj…", klik na
 * akcji otwiera kreator z kontekstem szyny.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EkranTopologiiNn } from '../EkranTopologiiNn';
import type { WezelDrzewa } from '../../../../nav/treeModel';

let drzewoZwracane: WezelDrzewa[] = [
  {
    id: 'nn-tr-tr-1',
    etykietaPL: 'Transformator SN/nN TR1',
    ikona: 'transformator',
    liczniki: { blokady: 0, ostrzezenia: 0 },
    trybMin: 'basic',
    dzieci: [
      {
        id: 'nn-bus-bus-tr-lv',
        etykietaPL: 'Szyna nN TR1',
        ikona: 'szyna',
        liczniki: { blokady: 0, ostrzezenia: 0 },
        trybMin: 'basic',
        dzieci: [],
      },
    ],
  },
];
vi.mock('../../../../nav/adapters/nnStudioTreeAdapter', () => ({
  useNnStudioTree: () => drzewoZwracane,
}));

const openOperationFormMock = vi.fn();
vi.mock('../../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { openOperationForm: typeof openOperationFormMock }) => unknown) =>
    selector({ openOperationForm: openOperationFormMock }),
}));

describe('EkranTopologiiNn — realna ścieżka', () => {
  beforeEach(() => {
    openOperationFormMock.mockReset();
    drzewoZwracane = [
      {
        id: 'nn-tr-tr-1', etykietaPL: 'Transformator SN/nN TR1', ikona: 'transformator',
        liczniki: { blokady: 0, ostrzezenia: 0 }, trybMin: 'basic',
        dzieci: [{ id: 'nn-bus-bus-tr-lv', etykietaPL: 'Szyna nN TR1', ikona: 'szyna', liczniki: { blokady: 0, ostrzezenia: 0 }, trybMin: 'basic', dzieci: [] }],
      },
    ];
  });

  afterEach(() => cleanup());

  it('akcje „Dodaj…" są nieaktywne bez zaznaczonej szyny', () => {
    render(<EkranTopologiiNn stationRef="st-tr" />);
    expect(screen.getByTestId('mvd-nn-studio-dodaj-odcinek')).toBeDisabled();
    expect(screen.getByTestId('mvd-nn-studio-dodaj-rozdzielnice')).toBeDisabled();
    expect(screen.getByTestId('mvd-nn-studio-dodaj-aparat')).toBeDisabled();
  });

  it('klik NATYWNY na węźle szyny odblokowuje akcje i otwiera kreator odcinka z kontekstem tej szyny', async () => {
    render(<EkranTopologiiNn stationRef="st-tr" />);
    // Rozwiń korzeń (chevron — 1× klik na etykiecie WYBIERA, nie rozwija;
    // gramatyka interakcji drzewa, MODEL_INTERAKCJI §2), potem zaznacz szynę.
    await userEvent.click(screen.getByTestId('mvd-tree-chevron-nn-tr-tr-1'));
    await userEvent.click(screen.getByText('Szyna nN TR1'));

    expect(screen.getByTestId('mvd-nn-studio-dodaj-odcinek')).not.toBeDisabled();
    await userEvent.click(screen.getByTestId('mvd-nn-studio-dodaj-odcinek'));
    expect(openOperationFormMock).toHaveBeenCalledWith('add_nn_cable_segment', { bus_nn_ref: 'bus-tr-lv' });
  });

  it('uczciwy stan pusty, gdy sieć nN tej stacji jest jeszcze pusta', () => {
    drzewoZwracane = [];
    render(<EkranTopologiiNn stationRef="st-tr" />);
    expect(screen.getByTestId('mvd-nn-studio-drzewo-puste')).toBeInTheDocument();
  });
});
