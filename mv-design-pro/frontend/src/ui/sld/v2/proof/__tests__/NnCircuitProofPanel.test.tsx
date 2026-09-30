/**
 * NnCircuitProofPanel tests (karta P0.10, G-21).
 *
 * Ścieżka NATYWNA (klik/wpisywanie przez `@testing-library/user-event`, nie
 * syntetyczny dispatchEvent — CLAUDE.md pkt 5): wypełnienie formularza,
 * kliknięcie „Pobierz pakiet ZIP" woła `POST /api/nn-proof/circuit/pack` i
 * uruchamia pobranie; błąd backendu pokazuje komunikat PL, nigdy cicha
 * porażka; przycisk disabled dopóki wymagane pola puste (zero dead-click).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAppStateStore } from '../../../../app-state';
import { NnCircuitProofPanel } from '../NnCircuitProofPanel';

beforeEach(() => {
  useAppStateStore.setState({
    activeProjectId: 'proj-1',
    activeCaseId: 'case-1',
    activeProjectName: 'Projekt testowy',
    activeCaseName: 'Przypadek testowy',
  });
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:shim';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {};
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function wypelnijWymaganePola(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('nn-circuit-proof-station-ref'), 'ST-1');
  await user.type(screen.getByTestId('nn-circuit-proof-bus-ref'), 'b1');
  await user.type(screen.getByTestId('nn-circuit-proof-breaker-ref'), 'ap1');
  await user.type(screen.getByTestId('nn-circuit-proof-segment-ref'), 'c1');
  await user.type(screen.getByTestId('nn-circuit-proof-p-mw'), '0.005');
  await user.type(screen.getByTestId('nn-circuit-proof-q-mvar'), '0.002');
  await user.type(screen.getByTestId('nn-circuit-proof-iz-katalogowe'), '100');
  await user.type(screen.getByTestId('nn-circuit-proof-vdrop-delta'), '0.005');
}

describe('NnCircuitProofPanel', () => {
  it('przycisk pobierania jest disabled dopóki wymagane pola nie są wypełnione (zero dead-click)', async () => {
    render(<NnCircuitProofPanel />);
    const przycisk = screen.getByTestId('nn-circuit-proof-submit');
    expect(przycisk).toBeDisabled();
  });

  it('wypełnienie wymaganych pól odblokowuje przycisk pobierania', async () => {
    const user = userEvent.setup();
    render(<NnCircuitProofPanel />);
    await wypelnijWymaganePola(user);
    expect(screen.getByTestId('nn-circuit-proof-submit')).toBeEnabled();
  });

  it('klik pobierania woła POST /api/nn-proof/circuit/pack z wypełnionymi danymi i uruchamia pobranie', async () => {
    const user = userEvent.setup();
    const zipBlob = new Blob(['PK'], { type: 'application/zip' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(zipBlob, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="pakiet_dowodowy_obwod_nn__c1.zip"',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    let anchorClicked = false;
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        const originalClick = el.click.bind(el);
        el.click = () => {
          anchorClicked = true;
          originalClick();
        };
      }
      return el;
    });

    render(<NnCircuitProofPanel />);
    await wypelnijWymaganePola(user);
    await user.click(screen.getByTestId('nn-circuit-proof-submit'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/nn-proof/circuit/pack');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.station_ref).toBe('ST-1');
    expect(body.bus_ref).toBe('b1');
    expect(body.breaker_ref).toBe('ap1');
    expect(body.segment_ref).toBe('c1');
    expect(body.project_id).toBe('proj-1');
    expect(body.case_id).toBe('case-1');

    await waitFor(() => expect(anchorClicked).toBe(true));
    await screen.findByText('Pakiet pobrany.');
  });

  it('błąd backendu (422 z powodem PL) pokazuje komunikat, nigdy cicha porażka', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Stacja nieznana w modelu ENM.' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<NnCircuitProofPanel />);
    await wypelnijWymaganePola(user);
    await user.click(screen.getByTestId('nn-circuit-proof-submit'));

    const komunikat = await screen.findByTestId('nn-circuit-proof-status');
    expect(komunikat).toHaveTextContent('Stacja nieznana w modelu ENM.');
    expect(komunikat).toHaveAttribute('role', 'alert');
  });
});
