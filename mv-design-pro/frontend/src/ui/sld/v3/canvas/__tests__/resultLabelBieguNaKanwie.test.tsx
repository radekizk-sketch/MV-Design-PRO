/**
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08, W-1) — WYNIK POJEDYNCZEGO BIEGU NA KANWIE,
 * ścieżką NATYWNĄ: stan globalny ustawiony tak, jak ustawia go produkcja
 * (`useSnapshotStore` + `useRawResultOverlayStore` zasilany w `ui2/legacy/
 * useLegacyOrchestrator` z `/api/execution/runs/{run}/results/v1`), po czym
 * asercje na REALNYM DOM kanwy, a panel filtrów otwierany realnym klikiem
 * (`userEvent`) — nie wołaniem akcji store'u (Zero-Debt pkt 5).
 *
 * Audyt zmierzył na tym samym łańcuchu: „0 etykiet wynikowych, 0 strzałek
 * rozpływu, brak znacznika punktu zwarcia; rysunek po biegu identyczny jak
 * przed biegiem". Te testy przybijają stan docelowy — i, dzięki fixturze z
 * ŻYWEGO biegu, przybijają go na danych, które backend faktycznie zwraca.
 *
 * Iloczyn cech: rodzaj biegu (zwarcie × rozpływ) × poziom szczegółu
 * (przegląd L0 × pełny L2) × stan wyniku (aktualny × nieaktualny) × zawartość
 * biegu (punkty × brak punktów).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import {
  useRawResultOverlayStore,
  type RawOverlayPayload,
} from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import { useSldDeltaOverlayStore } from '../../../../sld-overlay/sldDeltaOverlayStore';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;

const enm = readFixture<EnergyNetworkModel>('s92Bieg.enm.json');
const zwarcie = readFixture<RawOverlayPayload>('s92Zwarcie.overlay.json');
const rozplyw = readFixture<RawOverlayPayload>('s92Rozplyw.overlay.json');

const CANVAS_W = 1024;
const CANVAS_H = 640;

beforeEach(() => {
  // @ts-expect-error jsdom shim
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  // @ts-expect-error jsdom shim
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
  useSnapshotStore.setState({ snapshot: enm });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.getState().reset();
});

function renderKanwe(lod: 0 | 1 | 2): HTMLElement {
  const { container } = render(
    <SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={lod} />,
  );
  return container;
}

/** Treść CAŁEJ warstwy wynikowej (etykiety + bloki zbiorcze) — asercja na
 *  warstwie, nie na pojedynczej grupie: kolidujące etykiety renderer scala w
 *  blok zbiorczy, więc pytanie o jedną grupę byłoby zakładem o rozmieszczanie. */
function trescWarstwyWynikowej(container: HTMLElement): string {
  return container.querySelector('[data-testid="sld-v3-result-labels"]')?.textContent ?? '';
}

function liczbaEtykiet(container: HTMLElement): number {
  return container.querySelectorAll('[data-testid^="sld-v3-result-label-"]').length;
}

describe('S9-2 — bieg ZWARCIOWY na kanwie (ścieżka natywna)', () => {
  beforeEach(() => {
    useRawResultOverlayStore.getState().setPayload(zwarcie);
  });

  it('L2: liczba etykiet wynikowych > 0, a treść niesie Ik″ punktów biegu (rysunek po biegu RÓŻNI się od rysunku przed biegiem)', () => {
    const przedBiegiem = (() => {
      useRawResultOverlayStore.getState().clear();
      const container = renderKanwe(2);
      const stan = { etykiety: liczbaEtykiet(container), tresc: trescWarstwyWynikowej(container) };
      cleanup();
      return stan;
    })();
    expect(przedBiegiem.etykiety).toBe(0);

    useRawResultOverlayStore.getState().setPayload(zwarcie);
    const container = renderKanwe(2);
    expect(liczbaEtykiet(container)).toBeGreaterThan(0);
    expect(trescWarstwyWynikowej(container)).toContain('Ik″');
    expect(trescWarstwyWynikowej(container)).not.toBe(przedBiegiem.tresc);
  });

  it('L0 (poziom przeglądu): etykiety wynikowe SĄ — wartość stacyjna, jedna linia', () => {
    const container = renderKanwe(0);
    expect(liczbaEtykiet(container)).toBeGreaterThan(0);
    expect(trescWarstwyWynikowej(container)).toContain('Ik″');
  });

  it('ZNACZNIK PUNKTU ZWARCIA: każdy punkt biegu widoczny na scenie dostaje znacznik (dotąd znacznik wymagał osobnego kliknięcia z ekranu zwarć)', () => {
    const container = renderKanwe(2);
    const znaczniki = container.querySelectorAll('[data-testid="sld-v3-fault-point-marker"]');
    expect(znaczniki.length).toBeGreaterThan(0);
    const refy = [...znaczniki].map((node) => node.getAttribute('data-fault-point-owner-ref'));
    expect(new Set(refy).size).toBe(refy.length); // jeden znacznik na element rysunku
  });

  it('WYNIK ROZPŁYWOWY nie podszywa się pod zwarciowy: bieg zwarciowy nie rysuje strzałek przepływu mocy', () => {
    const container = renderKanwe(2);
    expect(container.querySelectorAll('[data-testid^="sld-v3-flow-arrow-"]').length).toBe(0);
  });

  it('POCHODZENIE + POKRYCIE w panelu: przebieg biegu i rachunek „X z Y punktów" (panel otwarty realnym klikiem)', async () => {
    const uzytkownik = userEvent.setup();
    const container = renderKanwe(2);
    await uzytkownik.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    expect(screen.getByTestId('sld-v3-result-coverage-liczby').textContent).toBe(
      'Etykiety: 3 z 3 punktów wyniku',
    );
    expect(container.textContent).toContain(zwarcie.run_id);
  });

  it('NIEAKTUALNOŚĆ: status OUTDATED wyszarza warstwę (jedno źródło statusu — `activeCaseResultStatus`)', () => {
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });
    const container = renderKanwe(2);
    expect(container.querySelector('[data-testid="sld-v3-result-stale-badge"]')).not.toBeNull();
  });
});

describe('S9-2 — bieg ROZPŁYWOWY na kanwie (ścieżka natywna)', () => {
  beforeEach(() => {
    useRawResultOverlayStore.getState().setPayload(rozplyw);
  });

  it('L2: etykiety niosą wielkości rozpływu (napięcie szyny / obciążenie przęsła) — nie podpisy zwarciowe', () => {
    const container = renderKanwe(2);
    expect(liczbaEtykiet(container)).toBeGreaterThan(0);
    const tresc = trescWarstwyWynikowej(container);
    expect(tresc).not.toContain('Ik″');
    expect(/U\s|obc\./.test(tresc)).toBe(true);
  });

  it('STRZAŁKI ROZPŁYWU: gałęzie ciągu dostają strzałkę kierunku (audyt mierzył 0)', () => {
    const container = renderKanwe(2);
    expect(container.querySelectorAll('[data-testid^="sld-v3-flow-arrow-"]').length).toBeGreaterThan(0);
  });

  it('POKRYCIE w panelu: 10 z 16 punktów + jawny powód braku pozostałych (model ich nie rysuje)', async () => {
    const uzytkownik = userEvent.setup();
    renderKanwe(2);
    await uzytkownik.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    expect(screen.getByTestId('sld-v3-result-coverage-liczby').textContent).toBe(
      'Etykiety: 10 z 16 punktów wyniku',
    );
    expect(screen.getByTestId('sld-v3-result-coverage-braki').textContent).toContain('6 nierysowanych w modelu');
  });

  it('FILTR PRZEKROCZEŃ: bez przekroczeń w wyniku kontrolka jest wyłączona (progi z danych backendu, nie z UI)', async () => {
    const uzytkownik = userEvent.setup();
    renderKanwe(2);
    await uzytkownik.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    const filtr = screen.getByTestId('sld-v3-result-filter-only-exceedances') as HTMLInputElement;
    expect(filtr.disabled).toBe(true);
  });

  it('FILTR PRZEKROCZEŃ: gdy backend oznaczy element jako przekroczenie, filtr działa i zostawia TYLKO ten element', async () => {
    const zPrzekroczeniem: RawOverlayPayload = {
      ...rozplyw,
      elements: {
        ...rozplyw.elements,
        'stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_bus': {
          ...rozplyw.elements['stn/6db7ec2086af7dc462ff4bbb91f42b90/sn_bus'],
          severity: 'CRITICAL',
        },
      },
    };
    useRawResultOverlayStore.getState().setPayload(zPrzekroczeniem);
    const uzytkownik = userEvent.setup();
    const container = renderKanwe(2);
    const przed = liczbaEtykiet(container);
    await uzytkownik.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    const filtr = screen.getByTestId('sld-v3-result-filter-only-exceedances') as HTMLInputElement;
    expect(filtr.disabled).toBe(false);
    await uzytkownik.click(filtr);
    const po = liczbaEtykiet(container);
    expect(po).toBeGreaterThan(0);
    expect(po).toBeLessThan(przed);
  });
});

describe('S9-2 — stan zerowy na kanwie', () => {
  it('bieg BEZ punktów wyniku ⇒ zero etykiet i JAWNY komunikat w panelu (zamiast cichej pustki)', async () => {
    useRawResultOverlayStore.getState().setPayload({
      run_id: 'run-bez-punktow',
      analysis_type: 'SC_3F',
      elements: {},
    });
    const uzytkownik = userEvent.setup();
    const container = renderKanwe(2);
    expect(liczbaEtykiet(container)).toBe(0);
    await uzytkownik.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    expect(screen.getByTestId('sld-v3-result-coverage-pusty').textContent).toContain(
      'Bieg nie zwrócił punktów wyniku',
    );
  });

  it('BRAK biegu ⇒ warstwa pusta i BRAK wiersza pokrycia (nie ma o czym meldować)', async () => {
    const uzytkownik = userEvent.setup();
    const container = renderKanwe(2);
    expect(liczbaEtykiet(container)).toBe(0);
    await uzytkownik.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
    expect(screen.queryByTestId('sld-v3-result-coverage')).toBeNull();
  });
});
