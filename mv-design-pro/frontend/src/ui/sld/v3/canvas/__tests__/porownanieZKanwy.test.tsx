/**
 * PORÓWNANIE A/B Z KANWY (karta S9-13, audyt W-8).
 *
 * DŁUG, KTÓRY TE TESTY ZAMYKAJĄ: nakładka różnic miała dostawcę i konsumenta,
 * ale jedyne wejście prowadziło przez ekran porównań — z poziomu schematu
 * porównanie było nieosiągalne (sonda W-8: elementy porównawcze panelu puste
 * po biegu). Sekcja „Porównanie A/B" panelu filtrów daje kanwie własne wejście.
 *
 * Pokrycie jest ILOCZYNEM CECH, nie przykładem z karty:
 *   rodzaj biegu na schemacie (zwarciowy / rozpływ / brak payloadu)
 *   × drugi bieg (DONE ten sam rodzaj i przypadek / FAILED / inny rodzaj /
 *     inny przypadek / brak)
 *   × świeżość wyników (aktualne / OUTDATED)
 *   × tryb różnic (trwa / nie trwa)
 * bo w każdej kombinacji defekt mógłby się schować (kandydat FAILED w
 * selektorze, blokada mimo kandydatów, selektor mimo blokady, porównanie na
 * nieaktualnym wyniku).
 *
 * Ścieżka NATYWNA (Zero-Debt pkt 5): wybór przebiegu i uruchomienie porównania
 * wykonywane realnymi interakcjami (`userEvent`), nie wołaniem akcji store'u;
 * asercja treści żądania POST pilnuje KIERUNKU pary (A = odniesienie z
 * selektora, B = bieg pokazywany na schemacie).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useAppStateStore } from '../../../../app-state';
import { useExecutionRunsStore } from '../../../../study-cases/runStore';
import type { ExecutionRun } from '../../../../study-cases/types';
import { useShellStore } from '../../../../../ui2/shell/useShellStore';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import {
  useRawResultOverlayStore,
  type RawOverlayElement,
  type RawOverlayPayload,
} from '../../../../sld-overlay/rawResultOverlayStore';
import { useOverlayStore } from '../../../../sld-overlay/overlayStore';
import { useSldDeltaOverlayStore } from '../../../../sld-overlay/sldDeltaOverlayStore';
import type { NakladkaRoznic } from '../../../../sld-overlay/sldDeltaOverlay.api';
import {
  kandydaciPorownaniaZKanwy,
  stanPorownaniaZKanwy,
  POWOD_BRAK_BIEGU,
  POWOD_BRAK_DRUGIEGO_BIEGU,
  POWOD_RODZAJ_BEZ_NAKLADKI,
  POWOD_WYNIKI_NIEAKTUALNE,
} from '../porownanieZKanwy';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const CANVAS_W = 1024;
const CANVAS_H = 640;
const sceneL2 = buildSceneV3(enm, 2);

/** Szyna ze sceny — kotwica etykiety i kanoniczny ref wyniku (zero fabrykacji). */
const busSeg = sceneL2.segments.find((s) => s.meta?.elementKind === 'bus' && s.meta?.ownerRef)!;
const busRef = busSeg.meta!.busResultRef ?? busSeg.meta!.ownerRef!;

const PRZYPADEK = 'case-1';
const BIEZACY_RUN = 'run-b-na-kanwie';

function metryka(code: string, value: number, unit: string, formatHint: string) {
  return { code, value, unit, format_hint: formatHint, source: 'solver' };
}

/** Przebieg ze store'u przebiegów — kształt kontraktu `ExecutionRun`. */
function przebieg(over: Partial<ExecutionRun> & { id: string }): ExecutionRun {
  return {
    study_case_id: PRZYPADEK,
    analysis_type: 'SC_3F',
    solver_input_hash: 'hash',
    status: 'DONE',
    started_at: '2026-08-01T10:00:00Z',
    finished_at: '2026-08-01T10:05:00Z',
    error_message: null,
    ...over,
  };
}

function payloadNaKanwie(analysisType: string): RawOverlayPayload {
  const element: RawOverlayElement = {
    ref_id: busRef,
    kind: 'bus',
    badges: [],
    severity: 'INFO',
    metrics: { IK_3F_A: metryka('IK_3F_A', 12.5, 'kA', 'fixed2') },
  };
  return { run_id: BIEZACY_RUN, analysis_type: analysisType, elements: { [busRef]: element } };
}

/** Odpowiedź backendu nakładki (kontrakt 1.3.0 — z wartością B obok delty). */
function odpowiedzNakladki(): NakladkaRoznic {
  return {
    run_id_a: 'run-a-odniesienie',
    run_id_b: BIEZACY_RUN,
    analysis_type: 'DELTA_SC',
    report_version: '1.3.0',
    elements: {
      [busRef]: {
        ref_id: busRef,
        kind: 'bus',
        badges: [],
        severity: 'WARNING',
        metrics: { DELTA_IK_3F_KA: metryka('DELTA_IK_3F_KA', 2, 'kA', 'fixed2') },
      },
    },
    legend: {
      title: 'Legenda roznic A/B',
      entries: [
        { severity: 'INFO', label: 'Bez zmian', description: 'Wartości identyczne' },
        { severity: 'WARNING', label: 'Zmiana', description: 'Wartości różne' },
      ],
    },
    content_hash: 'b'.repeat(64),
    liczba_punktow_zmienionych: 1,
    liczba_punktow_bez_zmian: 0,
    liczba_punktow_bez_odpowiednika: 0,
    liczba_punktow_bez_danych: 0,
  };
}

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:shim';
  if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
  window.location.hash = '';
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useOverlayStore.getState().clearOverlay();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useSnapshotStore.setState({ snapshot: enm });
  useAppStateStore.setState({ activeCaseId: PRZYPADEK });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useRawResultOverlayStore.getState().clear();
  useSldDeltaOverlayStore.getState().wyczyscRoznice();
  useAppStateStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  window.location.hash = '';
});

/** Otwiera dok „Warstwy" (panel filtrów z sekcją „Porównanie A/B"). */
function otworzPanelFiltrow(): void {
  fireEvent.click(screen.getByTestId('sld-v3-layer-panel-toggle'));
}

// ---------------------------------------------------------------------------
// Rachunek stanu — czysta funkcja (jedno źródło kandydatów i blokady)
// ---------------------------------------------------------------------------

describe('stanPorownaniaZKanwy — iloczyn cech', () => {
  const bazowe = {
    payload: { run_id: BIEZACY_RUN, analysis_type: 'SC_3F' },
    nakladkaAktywna: false,
    wynikiNieaktualne: false,
    runs: [przebieg({ id: 'run-a' })],
    activeCaseId: PRZYPADEK,
  };

  it('trwający tryb różnic wyłącza sekcję (podsumowanie ma własną)', () => {
    expect(stanPorownaniaZKanwy({ ...bazowe, nakladkaAktywna: true }).rodzaj).toBe('nieaktywne');
  });

  it('brak wyniku na schemacie ⇒ blokada z akcją „obliczenia"', () => {
    const stan = stanPorownaniaZKanwy({ ...bazowe, payload: null });
    expect(stan).toMatchObject({ rodzaj: 'zablokowane', powod: POWOD_BRAK_BIEGU, akcja: 'obliczenia' });
  });

  it('wyniki OUTDATED blokują NAWET przy istniejących kandydatach (ta sama treść co tryb porównawczy)', () => {
    const stan = stanPorownaniaZKanwy({ ...bazowe, wynikiNieaktualne: true });
    expect(stan).toMatchObject({ rodzaj: 'zablokowane', powod: POWOD_WYNIKI_NIEAKTUALNE, akcja: null });
  });

  it('rodzaj biegu bez dostawcy nakładki (rozpływ) ⇒ blokada z akcją „ekran porównań"', () => {
    // Nawet z drugim ukończonym biegiem LOAD_FLOW — granica dostawcy jest
    // uczciwie nazwana, a akcja prowadzi tam, gdzie porównanie rozpływu ŻYJE.
    const stan = stanPorownaniaZKanwy({
      ...bazowe,
      payload: { run_id: BIEZACY_RUN, analysis_type: 'LOAD_FLOW' },
      runs: [przebieg({ id: 'run-lf', analysis_type: 'LOAD_FLOW' })],
    });
    expect(stan).toMatchObject({
      rodzaj: 'zablokowane',
      powod: POWOD_RODZAJ_BEZ_NAKLADKI,
      akcja: 'ekran-porownan',
    });
  });

  it('zero kandydatów ⇒ blokada „brak drugiego biegu" z akcją „obliczenia"', () => {
    const stan = stanPorownaniaZKanwy({ ...bazowe, runs: [] });
    expect(stan).toMatchObject({
      rodzaj: 'zablokowane',
      powod: POWOD_BRAK_DRUGIEGO_BIEGU,
      akcja: 'obliczenia',
    });
  });

  it('kandydat wymaga: DONE × ten sam rodzaj × ten sam przypadek × inny bieg', () => {
    const runs: ExecutionRun[] = [
      przebieg({ id: 'ok-done' }),
      przebieg({ id: 'zly-failed', status: 'FAILED' }),
      przebieg({ id: 'zly-pending', status: 'PENDING' }),
      przebieg({ id: 'zly-rodzaj', analysis_type: 'SC_1F' }),
      przebieg({ id: 'zly-przypadek', study_case_id: 'inny-case' }),
      przebieg({ id: BIEZACY_RUN }),
    ];
    const kandydaci = kandydaciPorownaniaZKanwy(runs, BIEZACY_RUN, 'SC_3F', PRZYPADEK);
    expect(kandydaci.map((r) => r.id)).toEqual(['ok-done']);
  });

  it('sortowanie deterministyczne: najnowszy pierwszy, remis dat → id', () => {
    const runs: ExecutionRun[] = [
      przebieg({ id: 'starszy', finished_at: '2026-08-01T09:00:00Z' }),
      przebieg({ id: 'nowszy', finished_at: '2026-08-02T09:00:00Z' }),
      przebieg({ id: 'remis-b', finished_at: '2026-08-02T09:00:00Z' }),
    ];
    const kandydaci = kandydaciPorownaniaZKanwy(runs, BIEZACY_RUN, 'SC_3F', PRZYPADEK);
    expect(kandydaci.map((r) => r.id)).toEqual(['nowszy', 'remis-b', 'starszy']);
  });

  it('PREDYKATY PARAMI: blokada „brak drugiego biegu" ⇔ pusty zbiór kandydatów', () => {
    // Oba fakty pochodzą z jednego rachunku — dla tych samych danych nie może
    // istnieć selektor bez kandydatów ani blokada przy kandydatach.
    for (const runs of [[], [przebieg({ id: 'run-a' })]] as ExecutionRun[][]) {
      const stan = stanPorownaniaZKanwy({ ...bazowe, runs });
      const kandydaci = kandydaciPorownaniaZKanwy(runs, BIEZACY_RUN, 'SC_3F', PRZYPADEK);
      if (kandydaci.length === 0) {
        expect(stan.rodzaj).toBe('zablokowane');
      } else {
        expect(stan).toMatchObject({ rodzaj: 'gotowe', kandydaci });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Sekcja panelu — realna ścieżka klikowa
// ---------------------------------------------------------------------------

describe('Sekcja „Porównanie A/B" panelu filtrów (ścieżka natywna)', () => {
  it('wybór przebiegu + klik „Pokaż różnice" pobiera nakładkę pary (A = wybrany, B = bieżący) i włącza tryb różnic', async () => {
    const user = userEvent.setup();
    useRawResultOverlayStore.getState().setPayload(payloadNaKanwie('SC_3F'));
    useExecutionRunsStore.setState({ runs: [przebieg({ id: 'run-a-odniesienie' })] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => odpowiedzNakladki(),
    } as unknown as Response);

    const { container } = render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.getByTestId('sld-v3-result-ab').getAttribute('data-ab-stan')).toBe('gotowe');
    await user.selectOptions(screen.getByTestId('sld-v3-result-ab-select'), 'run-a-odniesienie');
    await user.click(screen.getByTestId('sld-v3-result-ab-pokaz'));

    // KIERUNEK PARY (kontrakt store'a nakładki): A = odniesienie z selektora,
    // B = bieg pokazywany na schemacie.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('/api/short-circuit-comparisons/sld-overlay');
    expect(JSON.parse(String(init?.body))).toEqual({
      run_id_a: 'run-a-odniesienie',
      run_id_b: BIEZACY_RUN,
    });

    // Tryb różnic WŁĄCZONY z kanwy: podsumowanie pary + etykiety Δ na warstwie.
    await screen.findByTestId('sld-v3-result-roznice');
    expect(screen.getByTestId('sld-v3-result-roznice-para').textContent).toContain('run-a-odniesienie');
    expect(screen.queryByTestId('sld-v3-result-ab')).toBeNull();
    const warstwa = container.querySelector('[data-testid="sld-v3-result-labels"]');
    expect(warstwa?.textContent).toContain('Δ Ik″');
  });

  it('przycisk jest nieaktywny bez wybranego przebiegu (zero martwego kliku)', () => {
    useRawResultOverlayStore.getState().setPayload(payloadNaKanwie('SC_3F'));
    useExecutionRunsStore.setState({ runs: [przebieg({ id: 'run-a' })] });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();
    expect((screen.getByTestId('sld-v3-result-ab-pokaz') as HTMLButtonElement).disabled).toBe(true);
  });

  it('brak drugiego biegu tego samego rodzaju ⇒ uczciwa blokada + akcja prowadzi do obliczeń', async () => {
    const user = userEvent.setup();
    useRawResultOverlayStore.getState().setPayload(payloadNaKanwie('SC_3F'));
    // Bieg innego rodzaju i bieg nieudany NIE są kandydatami.
    useExecutionRunsStore.setState({
      runs: [przebieg({ id: 'zly-rodzaj', analysis_type: 'SC_1F' }), przebieg({ id: 'zly-failed', status: 'FAILED' })],
    });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.getByTestId('sld-v3-result-ab-blocked').textContent).toBe(POWOD_BRAK_DRUGIEGO_BIEGU);
    expect(screen.queryByTestId('sld-v3-result-ab-select')).toBeNull();
    await user.click(screen.getByTestId('sld-v3-result-ab-akcja'));
    expect(window.location.hash).toContain('case-config');
  });

  it('bieg rozpływu ⇒ blokada z granicą dostawcy + akcja otwiera ekran porównań', async () => {
    const user = userEvent.setup();
    useRawResultOverlayStore.getState().setPayload(payloadNaKanwie('LOAD_FLOW'));
    useExecutionRunsStore.setState({ runs: [przebieg({ id: 'run-lf', analysis_type: 'LOAD_FLOW' })] });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.getByTestId('sld-v3-result-ab-blocked').textContent).toBe(POWOD_RODZAJ_BEZ_NAKLADKI);
    await user.click(screen.getByTestId('sld-v3-result-ab-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useShellStore.getState().wynikiTab).toBe('porownanie');
  });

  it('wyniki OUTDATED ⇒ blokada tą samą treścią co tryb porównawczy, bez akcji', () => {
    useRawResultOverlayStore.getState().setPayload(payloadNaKanwie('SC_3F'));
    useExecutionRunsStore.setState({ runs: [przebieg({ id: 'run-a' })] });
    useAppStateStore.setState({ activeCaseResultStatus: 'OUTDATED' });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.getByTestId('sld-v3-result-ab-blocked').textContent).toBe(POWOD_WYNIKI_NIEAKTUALNE);
    expect(screen.queryByTestId('sld-v3-result-ab-akcja')).toBeNull();
    // Ta sama treść w blokadzie trybu porównawczego (jedno źródło komunikatu).
    expect(screen.getByTestId('sld-v3-result-comparison-blocked').textContent).toBe(POWOD_WYNIKI_NIEAKTUALNE);
  });

  it('brak wyniku na schemacie ⇒ blokada „uruchom obliczenie" (sekcja obecna, uczciwy stan zerowy)', () => {
    useExecutionRunsStore.setState({ runs: [przebieg({ id: 'run-a' })] });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();
    expect(screen.getByTestId('sld-v3-result-ab-blocked').textContent).toBe(POWOD_BRAK_BIEGU);
  });

  it('podczas trwającego trybu różnic sekcja wyboru znika (zastępuje ją podsumowanie z wyjściem)', () => {
    useRawResultOverlayStore.getState().setPayload(payloadNaKanwie('SC_3F'));
    useExecutionRunsStore.setState({ runs: [przebieg({ id: 'run-a' })] });
    useSldDeltaOverlayStore.setState({ nakladka: odpowiedzNakladki() });
    render(<SldCanvasV3Workspace width={CANVAS_W} height={CANVAS_H} lodOverride={2} />);
    otworzPanelFiltrow();

    expect(screen.queryByTestId('sld-v3-result-ab')).toBeNull();
    expect(screen.getByTestId('sld-v3-result-roznice')).toBeTruthy();
  });
});
