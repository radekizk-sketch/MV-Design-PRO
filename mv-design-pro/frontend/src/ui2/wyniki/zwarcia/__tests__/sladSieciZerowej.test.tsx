/**
 * Sekcja „Sieć składowej zerowej — ślad obliczeń" (`SladSieciZerowej`) — ślad budowy Y0
 * biegu zwarcia doziemnego (`ShortCircuitResults.siec_zerowa`).
 *
 * Iloczyn cech: {rodzaj zwarcia 1F, 2F+G — sekcja jest; 3F, 2F, nieznany — sekcji nie ma}
 * × {ślad obecny → kroki z formułą KaTeX i kodami po polsku / pole nieobecne → uczciwy
 * komunikat starszego wyniku} × {komponent samodzielnie / pełny ekran wyników zwarć}.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { TraceStep } from '../../../../ui/results-inspector/types';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { EkranZwarc } from '../EkranZwarc';
import { SladSieciZerowej } from '../SladSieciZerowej';
import { ZWARCIA_STRINGS } from '../strings';
import { atrapaFetchPasma, renderEkranZwarc } from './renderEkranZwarc';
import { shortCircuitResultsFixture, shortCircuitRowFixture, wkladyFixture } from './fixtures';

/** Kroki w kształcie `raw_result.siec_zerowa` backendu (`json_bezpieczny`: zespolone {re, im}). */
function sladFixture(): TraceStep[] {
  return [
    {
      key: 'z0_source[src]',
      title: 'Źródło System 110 kV: impedancja zerowa (bocznik do ziemi)',
      formula_latex: 'Y_{0,src} = 1 / (Z_{0,src}/Z_{base})',
      inputs: { ref_id: 'src', z0_ohm: { re: 0.73, im: 7.3 } },
      substitution: 'Z0 źródła = 0.73 + j7.3 Ω (bocznik do ziemi na szynie GPZ 110 kV)',
      result: { z0_ohm: { re: 0.73, im: 7.3 } },
    },
    {
      key: 'tr_z0_conn[tr1]',
      title: 'Transformator TR GPZ: połączenie sekwencji zerowej',
      formula_latex: '(\\text{GN},\\text{DN}) \\rightarrow \\text{połączenie},\\ Z_0 = Z_{T0} + 3Z_{N}',
      inputs: { hv_winding: 'delta', lv_winding: 'grounded_wye' },
      substitution: 'bocznik do ziemi po stronie DN: Z0 = 0.0176 + j0.4396 pu',
      result: { connection: 'lv_shunt_ground', z0_pu: { re: 0.0176, im: 0.4396 } },
      notes: 'Połączenie szeregowe: droga GN↔DN, Z = Z_T0 + 3Z_N,GN + 3Z_N,DN.',
    },
  ];
}

describe('SladSieciZerowej — rodzaj zwarcia × obecność śladu', () => {
  it.each(['1F', '2F+G'])('%s + ślad → kroki z formułą KaTeX i kodami po polsku', (rodzaj) => {
    const { container } = render(
      <SladSieciZerowej siecZerowa={sladFixture()} rodzajZwarcia={rodzaj} szczegolyAudytowe={false} />,
    );
    const sekcja = screen.getByTestId('mvd-zwarcia-siec-zerowa');
    expect(within(sekcja).getByText(ZWARCIA_STRINGS.sladZerowejTytul)).toBeInTheDocument();
    const lista = within(sekcja).getByTestId('mvd-zwarcia-siec-zerowa-lista');
    expect(
      within(lista).getByText('Transformator TR GPZ: połączenie sekwencji zerowej'),
    ).toBeInTheDocument();
    // Kod połączenia i uzwojeń → opis po polsku (TRACE_VALUE_CODES), kod nie na ekranie.
    expect(within(lista).getByText('bocznik do ziemi po stronie DN')).toBeInTheDocument();
    expect(within(lista).getByText('gwiazda z uziemionym punktem neutralnym')).toBeInTheDocument();
    expect(within(lista).getByText('trójkąt')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/lv_shunt_ground|grounded_wye/);
    // Formuła przez KaTeX (MathRenderer), nie surowy tekst LaTeX.
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it.each(['1F', '2F+G'])('%s bez pola → uczciwy komunikat starszego wyniku', (rodzaj) => {
    render(<SladSieciZerowej siecZerowa={undefined} rodzajZwarcia={rodzaj} szczegolyAudytowe={false} />);
    const brak = screen.getByTestId('mvd-zwarcia-siec-zerowa-brak');
    expect(within(brak).getByText(ZWARCIA_STRINGS.sladZerowejNiedostepny)).toBeInTheDocument();
  });

  it.each(['3F', '2F', null])('%s → sekcji nie ma (Y0 nie wchodzi do obliczenia)', (rodzaj) => {
    const { container } = render(
      <SladSieciZerowej siecZerowa={sladFixture()} rodzajZwarcia={rodzaj} szczegolyAudytowe={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('EkranZwarc — sekcja sieci składowej zerowej w pełnym ekranie', () => {
  beforeEach(() => {
    atrapaFetchPasma();
    useResultsInspectorStore.getState().reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function wynikBiegu(rodzaj: string, zSladem: boolean) {
    return shortCircuitResultsFixture({
      rows: [shortCircuitRowFixture({ fault_type: rodzaj })],
      ...(zSladem ? { siec_zerowa: sladFixture() } : {}),
    });
  }

  it.each([
    ['1F', true, true],
    ['2F+G', true, true],
    ['3F', false, false],
    ['2F', false, false],
  ])('bieg %s → sekcja obecna: %s', async (rodzaj, zSladem, oczekiwanaSekcja) => {
    useResultsInspectorStore.setState({
      shortCircuitResults: wynikBiegu(rodzaj, zSladem),
      selectedRunId: 'sc-run-1',
    });
    await renderEkranZwarc(
      <EkranZwarc szczegolyAudytowe={false} onOtworzDowod={vi.fn()} wklady={{ 'BUS-GPZ': wkladyFixture() }} />,
    );
    if (oczekiwanaSekcja) {
      expect(screen.getByTestId('mvd-zwarcia-siec-zerowa-lista')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('mvd-zwarcia-siec-zerowa')).not.toBeInTheDocument();
    }
  });
});
