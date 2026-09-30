/**
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08, W-1) — ŁAŃCUCH OD KLIKA: bieg → schemat →
 * WYNIKI WIDOCZNE NA RYSUNKU.
 *
 * Audyt zmierzył ten łańcuch na żywej aplikacji: po biegu pasek pochodzenia
 * nakładki poprawnie wskazywał przebieg, ale rysunek pokazywał **0 etykiet
 * wynikowych**. Ten test przechodzi CAŁE ogniwo w jednym montażu:
 *   klik „Schemat (SLD)" w REALNEJ nawigacji powłoki (`SpaceNav` + produkcyjne
 *   `przejdzDoPrzestrzeni`, dokładnie jak `AppShell`)
 *   → trasa `#sld?run=…` (parametr biegu przenoszony przez most tras)
 *   → orkiestrator pobiera `/api/execution/runs/{run}/results/v1`
 *   → `useRawResultOverlayStore`
 *   → kanwa v3 rysuje etykiety wynikowe z wartościami biegu.
 *
 * Odpowiedzi backendu to ODPOWIEDZI Z ŻYWEGO BIEGU (fixtury `s92*` — patrz
 * `ui/sld/v3/canvas/__tests__/resultLabelPokrycieBiegu.test.ts`), więc test
 * ćwiczy kontrakt, który backend faktycznie wystawia, a nie jego wyobrażenie.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useLegacyOrchestrator } from '../useLegacyOrchestrator';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { SpaceNav } from '../../shell/SpaceNav';
import { useShellStore } from '../../shell/useShellStore';
import { useAppStateStore } from '../../../ui/app-state';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useSelectionStore } from '../../../ui/selection/store';
import { useRawResultOverlayStore } from '../../../ui/sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../ui/sld-overlay/overlayStore';
import { SldCanvasV3Workspace } from '../../../ui/sld/v3/canvas/SldCanvasV3Workspace';
import type { EnergyNetworkModel } from '../../../types/enm';
import type { RawOverlayPayload } from '../../../ui/sld-overlay/rawResultOverlayStore';

const fixturesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'ui', 'sld', 'v3', 'canvas', '__tests__', 'fixtures',
);
const readFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf8')) as T;

const enm = readFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const zwarcie = readFixture<RawOverlayPayload>('s92Zwarcie.overlay.json');

/** UUID w postaci akceptowanej przez orkiestrator (wersja 1-5, wariant 89ab). */
const RUN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** Odpowiedzi backendu — kształt 1:1 z produkcją (`result_contract_v1.py`). */
function odpowiedzResultSet() {
  return {
    run_id: RUN_ID,
    analysis_type: 'SC_3F',
    run_finished_at: '2026-08-06T07:07:18+00:00',
    global_results: { quality_status: 'passing', proof_status: 'complete' },
    overlay_payload: { elements: zwarcie.elements },
  };
}

let pobraneAdresy: string[] = [];

function stubBackend(): void {
  pobraneAdresy = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const adres = String(input);
      pobraneAdresy.push(adres);
      if (adres === `/api/analysis-runs/${RUN_ID}`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'FINISHED', result_status: 'VALID', results_valid: true }),
        } as unknown as Response;
      }
      if (adres === `/api/execution/runs/${RUN_ID}/results/v1`) {
        return { ok: true, status: 200, json: async () => odpowiedzResultSet() } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

/** Montaż odpowiadający produkcji: orkiestrator + nawigacja powłoki + kanwa. */
function Warsztat(): JSX.Element {
  useLegacyOrchestrator();
  const activeSpace = useShellStore((state) => state.activeSpace);
  return (
    <>
      <SpaceNav activeSpace={activeSpace} collapsed={false} onSelect={przejdzDoPrzestrzeni} />
      <SldCanvasV3Workspace width={1024} height={640} lodOverride={2} />
    </>
  );
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  localStorage.clear();
  stubBackend();
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useAppStateStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' });
  useSnapshotStore.setState({ snapshot: enm });
  // Stan PO BIEGU: projektant jest na wynikach wskazanego przebiegu.
  window.location.hash = `#analysis?run=${RUN_ID}`;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.getState().reset();
});

describe('S9-2 — łańcuch od klika: bieg → schemat → wyniki na rysunku', () => {
  it('klik „Schemat (SLD)" po biegu: trasa niesie przebieg, orkiestrator pobiera wynik, kanwa rysuje etykiety z wartościami', async () => {
    const uzytkownik = userEvent.setup();
    const { container } = render(<Warsztat />);

    // Przed przejściem: warstwa wynikowa kanwy jest pusta.
    expect(container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBe(0);

    await uzytkownik.click(screen.getByRole('button', { name: /Schemat \(SLD\)/ }));

    // 1. Trasa: most tras przenosi parametr biegu na schemat.
    await waitFor(() => expect(window.location.hash).toContain('#sld'));
    expect(window.location.hash).toContain(`run=${RUN_ID}`);

    // 2. Pobranie wyniku wskazanego przez trasę (kontrakt `results/v1`).
    await waitFor(() =>
      expect(pobraneAdresy).toContain(`/api/execution/runs/${RUN_ID}/results/v1`),
    );

    // 3. Store nakładki niesie punkty biegu.
    await waitFor(() =>
      expect(useRawResultOverlayStore.getState().payload?.run_id).toBe(RUN_ID),
    );
    expect(Object.keys(useRawResultOverlayStore.getState().payload?.elements ?? {})).toHaveLength(3);

    // 4. OSTATNI KLIK ŁAŃCUCHA: rysunek pokazuje wartości biegu.
    await waitFor(() => {
      expect(container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBeGreaterThan(0);
    });
    const warstwa = container.querySelector('[data-testid="sld-v3-result-labels"]')?.textContent ?? '';
    expect(warstwa).toContain('Ik″');
    // Znacznik punktu zwarcia pojawia się bez dodatkowego kliknięcia.
    expect(container.querySelectorAll('[data-testid="sld-v3-fault-point-marker"]').length).toBeGreaterThan(0);
  });

  it('bieg BEZ nadających się wyników (health `results_valid=false`): rysunek zostaje pusty, zero atrap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const adres = String(input);
        if (adres === `/api/analysis-runs/${RUN_ID}`) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: 'FAILED', result_status: 'NONE', results_valid: false }),
          } as unknown as Response;
        }
        return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      }),
    );
    const uzytkownik = userEvent.setup();
    const { container } = render(<Warsztat />);
    await uzytkownik.click(screen.getByRole('button', { name: /Schemat \(SLD\)/ }));
    await waitFor(() => expect(window.location.hash).toContain('#sld'));
    await waitFor(() => expect(useRawResultOverlayStore.getState().payload).toBeNull());
    expect(container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length).toBe(0);
  });
});
