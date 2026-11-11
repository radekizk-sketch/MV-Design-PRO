import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReadinessBlockersReview } from '../mass-review/ReadinessBlockersReview';
import { kategoriaBlokera } from '../networkBuildStore';
import { readinessZListy } from '../../../test/gotowoscTestUtils';
import type { ReadinessInfo } from '../../../types/enm';

const openOperationForm = vi.fn();
const selectElement = vi.fn();

type Problem = { code: string; severity: string; message_pl: string; element_ref: string };
const OSTRZEZENIE: Problem = {
  code: 'warn.catalog.review',
  severity: 'IMPORTANT',
  message_pl: 'Sprawdź dobór katalogu.',
  element_ref: 'seg-1',
};
const scena = vi.hoisted(() => ({ problemy: [] as Problem[] }));

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
}));

// JEDNA prawda gotowości (KD-1 / V12K-286): przegląd blokad czyta problemy
// przez `gotowoscAdapter` z `useSnapshotStore.readiness` — scena zasila TO pole
// (dawna atrapa `readinessLiveStore` była osobnym, nigdy nieodświeżanym źródłem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: { snapshot: unknown; fixActions: []; readiness: ReadinessInfo | null }) => unknown,
  ) =>
    selector({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        branches: [{ type: 'cable' }],
        substations: [],
        transformers: [],
        generators: [],
      },
      fixActions: [],
      readiness: readinessZListy(scena.problemy),
    }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (
    selector: (state: { selectElement: typeof selectElement }) => unknown,
  ) => selector({ selectElement }),
}));

// Częściowy mock: przegląd kategoryzuje blokery PRAWDZIWĄ regułą `kategoriaBlokera` (jedna
// reguła z licznikiem budowy — W5-C), podmieniony jest wyłącznie hak sklepu.
vi.mock('../networkBuildStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../networkBuildStore')>()),
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm }) => unknown,
  ) => selector({ openOperationForm }),
}));

describe('ReadinessBlockersReview', () => {
  beforeEach(() => {
    scena.problemy = [OSTRZEZENIE];
  });

  it('nie komunikuje pełnej gotowości, gdy zostały tylko ostrzeżenia', () => {
    render(<ReadinessBlockersReview />);

    expect(screen.getByText('Kontrola konfiguracji bez zagadnień krytycznych')).toBeInTheDocument();
    expect(screen.getByText('Pozostało 1 ostrzeżenie.')).toBeInTheDocument();
    expect(screen.queryByText(/gotowa do analizy/i)).toBeNull();
  });

  // Kategoria kolumny = ta sama reguła `kategoriaBlokera`, którą liczy licznik budowy;
  // każda z czterech kategorii ma PRAWDZIWY kod z rejestru gotowości (migawka rejestru).
  it.each([
    ['source.multiple_grid_sources_in_island', 'topologia', 'Topologia'],
    ['catalog.binding_missing', 'katalogi', 'Katalogi'],
    ['ring.nop_required', 'eksploatacja', 'Eksploatacja'],
    ['analysis.blocked_by_readiness', 'analiza', 'Analiza'],
  ] as const)('blokada %s trafia do kategorii %s', (kod, kategoria, etykieta) => {
    scena.problemy = [
      { code: kod, severity: 'BLOCKER', message_pl: 'Blokada testowa.', element_ref: 'seg-1' },
    ];
    render(<ReadinessBlockersReview />);

    const tabela = screen.getByTestId('readiness-blockers-review');
    const wiersz = within(tabela).getByText(kod).closest('tr');
    expect(wiersz).not.toBeNull();
    expect(kategoriaBlokera(kod)).toBe(kategoria);
    expect(within(wiersz as HTMLElement).getByText(etykieta)).toBeInTheDocument();
  });
});
