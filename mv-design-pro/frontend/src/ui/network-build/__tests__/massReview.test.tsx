/**
 * Przegląd łączników i licznik braków katalogu — na realnych komponentach.
 *
 * Wcześniej plik testował KOPIE funkcji etykiet i stałe list zapisane w samym teście
 * (produkt mógł się rozjechać bez czerwieni), a kopia przypinała błędną etykietę odłącznika
 * („Rozłącznik”). Teraz: iloczyn {rodzaj gałęzi łącznika} × {stan otwarty, zamknięty} na
 * `SwitchReview` z migawką modelu w magazynie oraz licznik braków katalogu
 * `MassReviewPanel` (linia i kabel bez katalogu liczone, łącznik bez katalogu nie).
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { MassReviewPanel } from '../mass-review/MassReviewPanel';
import { SwitchReview } from '../mass-review/SwitchReview';

const RODZAJE = [
  ['switch', 'Łącznik'],
  ['breaker', 'Wyłącznik'],
  ['bus_coupler', 'Sprzęgło szyn'],
  ['disconnector', 'Odłącznik'],
  ['fuse', 'Bezpiecznik'],
] as const;

const STANY = [
  ['open', 'Otwarty'],
  ['closed', 'Zamknięty'],
] as const;

function migawka(branches: readonly Record<string, unknown>[]): EnergyNetworkModel {
  return {
    buses: [],
    branches,
    transformers: [],
    sources: [],
    loads: [],
    generators: [],
    substations: [],
  } as unknown as EnergyNetworkModel;
}

function galaz(ref: string, type: string, extra: Record<string, unknown> = {}) {
  return {
    id: `id-${ref}`,
    ref_id: ref,
    name: `Gałąź ${ref}`,
    type,
    from_bus_ref: 'sz1',
    to_bus_ref: 'sz2',
    catalog_ref: null,
    ...extra,
  };
}

afterEach(() => {
  useSnapshotStore.setState({ snapshot: null });
});

describe('SwitchReview — rodzaj i stan łącznika z jednego słownika', () => {
  for (const [rodzaj, etykieta] of RODZAJE) {
    for (const [stan, etykietaStanu] of STANY) {
      it(`${rodzaj} × ${stan}`, () => {
        useSnapshotStore.setState({
          snapshot: migawka([galaz('L1', rodzaj, { status: stan }), galaz('K1', 'cable')]),
        });
        render(<SwitchReview />);
        const wiersz = screen.getByText('Gałąź L1').closest('tr');
        expect(wiersz).not.toBeNull();
        expect(within(wiersz!).getByText(etykieta)).toBeInTheDocument();
        expect(within(wiersz!).getByText(etykietaStanu)).toBeInTheDocument();
        expect(wiersz!.textContent).not.toMatch(/SWITCH|BREAKER|BUS_COUPLER|DISCONNECTOR|FUSE/);
        // Kabel nie jest łącznikiem.
        expect(screen.queryByText('Gałąź K1')).toBeNull();
      });
    }
  }

  it('pusty model — uczciwy stan zerowy', () => {
    useSnapshotStore.setState({ snapshot: migawka([galaz('K1', 'cable')]) });
    render(<SwitchReview />);
    expect(screen.getByText('Brak łączników w modelu')).toBeInTheDocument();
  });
});

describe('MassReviewPanel — licznik braków katalogu na realnej migawce', () => {
  it('liczy linię i kabel bez katalogu, pomija łącznik bez katalogu i kabel z katalogiem', () => {
    useSnapshotStore.setState({
      snapshot: migawka([
        galaz('L1', 'line_overhead'),
        galaz('K1', 'cable'),
        galaz('K2', 'cable', { catalog_ref: 'kabel-xruhakxs-120' }),
        galaz('W1', 'breaker'),
      ]),
    });
    render(<MassReviewPanel isOpen onClose={() => undefined} />);
    expect(screen.getByRole('button', { name: /Katalogi\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Łączniki\s*1/ })).toBeInTheDocument();
  });
});
