/**
 * T2-WYNIKI (PLAN_SLD_NN_TOPOLOGIA_2026-08 §T2) — testy prezentacji
 * `NnCircuitResultsPanel`: payload realny → render; brak danych → stan
 * zerowy Z AKCJĄ realną (nawigacja); NIEROZSTRZYGALNE → trzeci stan JAWNY;
 * świeżość; determinizm renderu.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NnCircuitResultsPanel } from '../NnCircuitResultsPanel';
import type { NnCircuitResultsSpec } from '../nnCircuitResults';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const REF = { stationRef: 'stn', nnBusRef: 'nn', busRef: 'b2', breakerRef: 'ap1' };

function fullSpec(overrides: Partial<NnCircuitResultsSpec> = {}): NnCircuitResultsSpec {
  return {
    ref: REF,
    ib: { stan: 'wartosc', wartosc: { amperow: 12.5 }, zrodloPl: 'bieg rozpływu mocy (run-1)' },
    inRated: { stan: 'wartosc', wartosc: { amperow: 16, typPl: 'MCB B' }, zrodloPl: 'model — katalog aparatu' },
    izPrime: { stan: 'brak_wynikow', powodPl: 'Iz′ wymaga warunków ułożenia kabla.' },
    deltaU: { stan: 'wartosc', wartosc: { procent: -3.2 }, zrodloPl: 'profil napięć — bieg rozpływu mocy (run-1)' },
    ikMax: { stan: 'wartosc', wartosc: { kiloamperow: 5.4 }, zrodloPl: 'bieg zwarciowy (run-sc)' },
    ikMin: { stan: 'wartosc', wartosc: { kiloamperow: 0.25 }, zrodloPl: 'pętla zwarcia IEC 60364-4-41 (Ik1_min, scenariusz MIN)' },
    swz: { stan: 'wartosc', wartosc: { werdykt: 'spełnia', przyczynaPl: 'Ik1_min ≥ Ia wymagane', ik1MinA: 250, iaWymaganeA: 160, marginesProcent: 56.25 }, zrodloPl: 'SWZ per obwód (IEC 60364-4-41)' },
    iSquaredT: { stan: 'brak_wynikow', powodPl: 'I²t wymaga danych cieplnych przewodu.' },
    doborSelektywnosc: { stan: 'brak_wynikow', powodPl: 'Dobór wymaga Ib i Iz′ jednocześnie.' },
    resultsStale: false,
    ...overrides,
  };
}

describe('NnCircuitResultsPanel — payload realny → render', () => {
  it('renderuje wartości WSZYSTKICH sekcji z danymi (Ib/In/ΔU/Ikmax/Ikmin/SWZ)', () => {
    render(<NnCircuitResultsPanel spec={fullSpec()} loadFlowRunId={null} />);
    expect(screen.getByTestId('nn-circuit-value-ib').textContent).toContain('12,5');
    expect(screen.getByTestId('nn-circuit-value-in').textContent).toContain('16,0');
    expect(screen.getByTestId('nn-circuit-value-in').textContent).toContain('MCB B');
    expect(screen.getByTestId('nn-circuit-value-delta-u').textContent).toContain('-3,20');
    expect(screen.getByTestId('nn-circuit-value-ik-max').textContent).toContain('5,40');
    expect(screen.getByTestId('nn-circuit-value-ik-min').textContent).toContain('0,250');
    expect(screen.getByTestId('nn-circuit-swz-werdykt').textContent).toBe('spełnia');
    expect(screen.getByTestId('nn-circuit-swz-margines').textContent).toContain('56');
  });

  it('KAŻDA sekcja niesie pochodzenie (zrodloPl) — operator wie, skąd wartość', () => {
    render(<NnCircuitResultsPanel spec={fullSpec()} loadFlowRunId={null} />);
    expect(screen.getByTestId('nn-circuit-section-ib-zrodlo').textContent).toContain('bieg rozpływu mocy');
    expect(screen.getByTestId('nn-circuit-section-swz-zrodlo').textContent).toContain('SWZ per obwód');
  });
});

describe('NnCircuitResultsPanel — brak danych → stan zerowy Z AKCJĄ realną', () => {
  it('Ib bez przebiegu: komunikat + przycisk realnej nawigacji (nie fabrykowany)', async () => {
    const spec = fullSpec({ ib: { stan: 'brak_wynikow', powodPl: 'Brak załadowanego przebiegu rozpływu mocy — uruchom analizę.', akcja: 'przejdz-do-wynikow' } });
    render(<NnCircuitResultsPanel spec={spec} loadFlowRunId={null} />);
    expect(screen.getByTestId('nn-circuit-section-ib-brak').textContent).toContain('Brak załadowanego przebiegu');
    const akcja = screen.getByTestId('nn-circuit-section-ib-akcja');
    expect(akcja).toBeTruthy();

    const user = userEvent.setup();
    await user.click(akcja);
    // Nawigacja REALNA (`navigateToResults`, `ui/navigation/routes.ts`) —
    // manipuluje `window.location.hash`, nie fabrykowany onClick pusty.
    expect(window.location.hash).toContain('analysis');
  });

  it('sekcja bez akcji (Iz′/I²t/dobór — brak dostawcy danych w tym module) NIE renderuje przycisku (zero fabrykacji akcji)', () => {
    render(<NnCircuitResultsPanel spec={fullSpec()} loadFlowRunId={null} />);
    expect(screen.queryByTestId('nn-circuit-section-iz-prime-akcja')).toBeNull();
    expect(screen.queryByTestId('nn-circuit-section-i2t-akcja')).toBeNull();
    expect(screen.queryByTestId('nn-circuit-section-dobor-akcja')).toBeNull();
  });

  it('nie_dotyczy (układ sieci nie jest TN) renderowany ODRĘBNIE od brak_wynikow', () => {
    const spec = fullSpec({
      swz: { stan: 'nie_dotyczy', powodPl: 'Układ sieci nie jest TN.' },
      ikMin: { stan: 'nie_dotyczy', powodPl: 'Układ sieci nie jest TN.' },
    });
    render(<NnCircuitResultsPanel spec={spec} loadFlowRunId={null} />);
    expect(screen.getByTestId('nn-circuit-section-swz-nie-dotyczy').textContent).toContain('nie dotyczy');
    expect(screen.queryByTestId('nn-circuit-section-swz-brak')).toBeNull();
  });
});

describe('NnCircuitResultsPanel — trzeci stan NIEROZSTRZYGALNE (werdykt SWZ)', () => {
  it('werdykt „nierozstrzygalne" renderowany JAWNIE, ton unknown, ODRÓŻNIONY od spełnia/nie spełnia', () => {
    const spec = fullSpec({
      swz: { stan: 'wartosc', wartosc: { werdykt: 'nierozstrzygalne', przyczynaPl: 'Rozłącznik bez wkładki — nie da się ocenić.', ik1MinA: 250, iaWymaganeA: null, marginesProcent: null }, zrodloPl: 'SWZ per obwód (IEC 60364-4-41)' },
    });
    render(<NnCircuitResultsPanel spec={spec} loadFlowRunId={null} />);
    const werdykt = screen.getByTestId('nn-circuit-swz-werdykt');
    expect(werdykt.textContent).toBe('nierozstrzygalne');
    expect(werdykt.getAttribute('data-tone')).toBe('unknown');
  });

  it('werdykt „spełnia" → ton ok; „nie spełnia" → ton fail (kontrast z nierozstrzygalne)', () => {
    const { rerender } = render(<NnCircuitResultsPanel spec={fullSpec()} loadFlowRunId={null} />);
    expect(screen.getByTestId('nn-circuit-swz-werdykt').getAttribute('data-tone')).toBe('ok');

    rerender(
      <NnCircuitResultsPanel
        spec={fullSpec({ swz: { stan: 'wartosc', wartosc: { werdykt: 'nie spełnia', przyczynaPl: 'za niski Ik1_min', ik1MinA: 40, iaWymaganeA: 160, marginesProcent: -75 }, zrodloPl: 'SWZ per obwód (IEC 60364-4-41)' } })}
        loadFlowRunId={null}
      />,
    );
    expect(screen.getByTestId('nn-circuit-swz-werdykt').getAttribute('data-tone')).toBe('fail');
  });
});

describe('NnCircuitResultsPanel — świeżość (nieświeże = oznaczone, nie ukryte)', () => {
  it('resultsStale=true → baner widoczny, wartości NADAL wyrenderowane (nie ukryte)', () => {
    render(<NnCircuitResultsPanel spec={fullSpec({ resultsStale: true })} loadFlowRunId={null} />);
    expect(screen.getByTestId('nn-circuit-results-stale-banner')).toBeTruthy();
    expect(screen.getByTestId('nn-circuit-value-ib').textContent).toContain('12,5');
  });

  it('resultsStale=false → brak banera', () => {
    render(<NnCircuitResultsPanel spec={fullSpec({ resultsStale: false })} loadFlowRunId={null} />);
    expect(screen.queryByTestId('nn-circuit-results-stale-banner')).toBeNull();
  });
});

describe('NnCircuitResultsPanel — determinizm', () => {
  it('dwa rendery tego samego spec → identyczny innerHTML', () => {
    const spec = fullSpec();
    const a = render(<NnCircuitResultsPanel spec={spec} loadFlowRunId={null} />);
    const htmlA = a.container.innerHTML;
    a.unmount();
    const b = render(<NnCircuitResultsPanel spec={spec} loadFlowRunId={null} />);
    expect(b.container.innerHTML).toBe(htmlA);
  });
});

describe('NnCircuitResultsPanel — ΔU pobierana na żądanie (loadFlowRunId)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('loadFlowRunId podany → fetch profilu napięć, sekcja ΔU nadpisana wynikiem', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rows: [{ bus_id: 'b2', delta_pct: -4.5 }] }),
    })) as unknown as typeof fetch;

    render(<NnCircuitResultsPanel spec={fullSpec({ deltaU: { stan: 'brak_wynikow', powodPl: 'jeszcze niepobrane' } })} loadFlowRunId="run-xyz" />);

    expect(await screen.findByTestId('nn-circuit-value-delta-u')).toHaveTextContent('-4,50');
  });

  it('loadFlowRunId=null → ΔU zostaje w stanie ze spec (zero fetch)', () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    render(<NnCircuitResultsPanel spec={fullSpec()} loadFlowRunId={null} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
