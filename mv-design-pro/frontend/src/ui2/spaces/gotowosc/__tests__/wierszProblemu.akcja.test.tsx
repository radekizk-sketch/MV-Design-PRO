/**
 * Wiersz problemu gotowości — miejsce akcji naprawczej (karta C-12).
 *
 * Co wiersz pokazuje, rozstrzyga TA SAMA funkcja, którą wykonuje klik
 * (`rozwiazAkcjeNaprawcza`): przycisk formularza „Napraw…", przycisk przejścia do
 * przestrzeni z nazwą celu, nazwaną odmowę albo „Wymaga interwencji projektanta".
 * Klik natywny (user-event), nie syntetyczny `dispatchEvent`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WierszProblemu } from '../WierszProblemu';
import type { ProblemGotowosci } from '../grupowanieCelow';
import { AKCJE_KODOW_KANONU } from '../akcjeNaprawcze';

function problem(code: string, kodKanoniczny: string | null): ProblemGotowosci {
  return {
    code,
    waga: 'BLOKADA',
    elementRef: 'el-1',
    opisPl: 'Opis problemu.',
    cel: 'wspolne',
    fixAction: null,
    priorytetKanoniczny: 1,
    kodKanoniczny,
    nawigacjaKanoniczna: null,
  };
}

function renderuj(p: ProblemGotowosci) {
  const onNaprawa = vi.fn();
  render(<WierszProblemu problem={p} trybEkspercki={false} onKlikWiersza={vi.fn()} onNaprawa={onNaprawa} />);
  return onNaprawa;
}

describe('WierszProblemu — akcja naprawcza z jednego źródła', () => {
  it('kod z formularzem: przycisk „Napraw…" — klik natywny przekazuje problem wykonawcy', async () => {
    const p = problem('sources.sk_min_exceeds_max', 'source.sk_min_inconsistent');
    const onNaprawa = renderuj(p);
    await userEvent.click(screen.getByTestId('mvd-problem-napraw-sources.sk_min_exceeds_max-el-1'));
    expect(onNaprawa).toHaveBeenCalledWith(p);
    expect(screen.getByRole('button', { name: 'Napraw…' })).toBeTruthy();
  });

  it('kod naprawiany w innej przestrzeni: przycisk z nazwą celu i powodem w dymku', async () => {
    const wpis = AKCJE_KODOW_KANONU['verdict.run_missing'];
    expect(wpis.rodzaj).toBe('przestrzen');
    const p = problem('verdict.run_missing', 'verdict.run_missing');
    const onNaprawa = renderuj(p);
    const przycisk = screen.getByRole('button', { name: 'Przejdź: Obliczenia' });
    expect(przycisk.getAttribute('title')).toBe((wpis as { powodPl: string }).powodPl);
    await userEvent.click(przycisk);
    expect(onNaprawa).toHaveBeenCalledWith(p);
  });

  it('nazwana odmowa: powód zamiast przycisku (zero martwego klika)', () => {
    renderuj(problem('analysis.blocked_by_readiness', 'analysis.blocked_by_readiness'));
    expect(screen.queryByRole('button', { name: /Napraw|Przejdź/ })).toBeNull();
    expect(screen.getByTestId('mvd-problem-odmowa-analysis.blocked_by_readiness').textContent).toContain(
      'Analiza odblokuje się',
    );
  });

  it('problem bez kanonu i bez akcji emitera: „Wymaga interwencji projektanta"', () => {
    renderuj(problem('I999', null));
    expect(screen.queryByRole('button', { name: /Napraw|Przejdź/ })).toBeNull();
    expect(screen.getByText('Wymaga interwencji projektanta')).toBeTruthy();
  });
});
