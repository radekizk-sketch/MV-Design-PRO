/**
 * Nagłówek diagnostyki i pre-flight z faktów backendu (karta WERDYKT-MIGRACJA-190, E62).
 *
 * Iloczyn cech: liczba blokad {0, 1} × liczba ostrzeżeń {0, 2} (panel diagnostyki) oraz
 * dostępne analizy {0, część, wszystkie, brak kontroli} (macierz pre-flight). Predykat parami:
 * ton macierzy pre-flight wynika z TEJ SAMEJ listy `checks`, którą renderuje tabela.
 * Render na fiksturach wygenerowanych z backendu (scena z ostrzeżeniem E-D06, które blokuje
 * zwarcie 1F — dawniej nagłówek mówił „Gotowy do analizy”, a raport „model jest kompletny”).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import diagnostyka from '../../../harness-fixtures/generated/diagnoza_scena_diagnostyka.json';
import preflight from '../../../harness-fixtures/generated/diagnoza_scena_preflight.json';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { PreflightMatrix } from '../PreflightMatrix';
import { naglowekDiagnostyki, naglowekPreflight } from '../naglowekDiagnostyki';
import type { DiagnosticReport, PreflightReport } from '../types';

describe('naglowekDiagnostyki — liczba blokad × liczba ostrzeżeń', () => {
  it.each([
    [0, 0, 'neutralny', 'nie wskazały blokad ani ostrzeżeń'],
    [0, 2, 'ostrzezenie', 'wskazały ostrzeżenia'],
    [1, 0, 'blokada', 'wskazały blokady'],
    [1, 2, 'blokada', 'wskazały blokady'],
  ] as const)('blokady %i, ostrzeżenia %i → %s', (b, w, ton, fraza) => {
    const n = naglowekDiagnostyki({ blocker_count: b, warning_count: w });
    expect(n.ton).toBe(ton);
    expect(n.tekst).toContain(fraza);
    // Brak zgłoszeń nie jest potwierdzeniem poprawności modelu.
    expect(n.tekst).not.toMatch(/poprawny|kompletny|gotowy/i);
  });
});

describe('naglowekPreflight — dostępność analiz', () => {
  const k = (s: string) => ({ status: s });
  it.each([
    [[k('AVAILABLE'), k('AVAILABLE'), k('AVAILABLE'), k('AVAILABLE')], 'neutralny', '4 z 4'],
    [[k('AVAILABLE'), k('BLOCKED'), k('AVAILABLE'), k('AVAILABLE')], 'ostrzezenie', '3 z 4'],
    [[k('BLOCKED'), k('BLOCKED'), k('BLOCKED'), k('BLOCKED')], 'blokada', '0 z 4'],
    [[], 'blokada', '0 z 0'],
  ] as const)('%#: ton %s, tekst %s', (checks, ton, fraza) => {
    const n = naglowekPreflight(checks);
    expect(n.ton).toBe(ton);
    expect(n.tekst).toContain(fraza);
  });
});

describe('render na fiksturach backendu (scena z ostrzeżeniem E-D06)', () => {
  it('panel diagnostyki: ton ostrzegawczy, bez „Model poprawny” i bez I-D01', () => {
    render(<DiagnosticsPanel report={diagnostyka as unknown as DiagnosticReport} />);
    const naglowek = screen.getByTestId('diagnostics-status');
    expect(naglowek.dataset.ton).toBe('ostrzezenie');
    expect(naglowek.textContent).not.toMatch(/Model poprawny/);
    expect(screen.queryByText(/model jest kompletny/i)).toBeNull();
  });

  it('macierz pre-flight: nagłówek z listy kontroli, zwarcie 1F zablokowane', () => {
    const raport = preflight as unknown as PreflightReport;
    render(<PreflightMatrix report={raport} />);
    const naglowek = screen.getByTestId('preflight-readiness');
    const dostepne = raport.checks.filter((c) => c.status === 'AVAILABLE').length;
    expect(dostepne).toBeLessThan(raport.checks.length);
    expect(naglowek.dataset.ton).toBe('ostrzezenie');
    expect(naglowek.textContent).toContain(`${dostepne} z ${raport.checks.length}`);
    expect(naglowek.textContent).not.toMatch(/Gotowy do analizy/);
  });
});
