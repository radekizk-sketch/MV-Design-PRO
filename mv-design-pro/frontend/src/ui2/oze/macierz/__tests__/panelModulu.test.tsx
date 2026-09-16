import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { PanelModulu } from '../PanelModulu';
import { zbudujModuly } from '../macierzModel';
import { derFixture } from './fixtures';

function opisZ(over = {}): ReturnType<typeof zbudujModuly>[number] {
  return zbudujModuly([derFixture({ id: 'pv-1', name: 'PV Dach A', ...over })])[0];
}

describe('PanelModulu', () => {
  it('zdolność z katalogu ma znacznik „z katalogu", pozostałe „dane deklarowane"', () => {
    const opis = opisZ({ profiles: { lvrt_curve_ref: 'lvrt-b' } });
    render(
      <PanelModulu
        opis={opis}
        zdolnosci={opis.zdolnosci}
        pochodzenie={opis.pochodzenieZdolnosci}
        numeryczne={opis.numeryczne}
        ocenaModulu={null}
        onZmienZdolnosc={vi.fn()}
        onZmienParametr={vi.fn()}
      />,
    );
    const lvrt = screen.getByTestId('mvd-oze-zdolnosc-hasLvrtCurve').closest('label')!;
    expect(within(lvrt).getByText('z katalogu')).toBeInTheDocument();
    const scada = screen.getByTestId('mvd-oze-zdolnosc-hasScadaCommunication').closest('label')!;
    expect(within(scada).getByText('dane deklarowane')).toBeInTheDocument();
  });

  it('przełączenie zdolności woła onZmienZdolnosc', () => {
    const opis = opisZ();
    const onZmienZdolnosc = vi.fn();
    render(
      <PanelModulu
        opis={opis}
        zdolnosci={opis.zdolnosci}
        pochodzenie={opis.pochodzenieZdolnosci}
        numeryczne={opis.numeryczne}
        ocenaModulu={null}
        onZmienZdolnosc={onZmienZdolnosc}
        onZmienParametr={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('mvd-oze-zdolnosc-hasScadaCommunication'));
    expect(onZmienZdolnosc).toHaveBeenCalledWith('hasScadaCommunication', true);
  });

  it('zmiana parametru woła onZmienParametr', () => {
    const opis = opisZ();
    const onZmienParametr = vi.fn();
    render(
      <PanelModulu
        opis={opis}
        zdolnosci={opis.zdolnosci}
        pochodzenie={opis.pochodzenieZdolnosci}
        numeryczne={opis.numeryczne}
        ocenaModulu={null}
        onZmienZdolnosc={vi.fn()}
        onZmienParametr={onZmienParametr}
      />,
    );
    fireEvent.change(screen.getByTestId('mvd-oze-param-droopPercent'), {
      target: { value: '3' },
    });
    expect(onZmienParametr).toHaveBeenCalledWith('droopPercent', '3');
  });

  it('moduł zablokowany (brak napięcia) → widoczny jawny stan braku danych', () => {
    const opis = opisZ({ connection_voltage_kv: null });
    render(
      <PanelModulu
        opis={opis}
        zdolnosci={opis.zdolnosci}
        pochodzenie={opis.pochodzenieZdolnosci}
        numeryczne={opis.numeryczne}
        ocenaModulu={null}
        onZmienZdolnosc={vi.fn()}
        onZmienParametr={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mvd-oze-panel-blokada')).toBeInTheDocument();
  });

  it('moduł not_reportable (karta S-1) → widoczna podstawa werdyktu z ograniczeniami', () => {
    const opis = opisZ();
    render(
      <PanelModulu
        opis={opis}
        zdolnosci={opis.zdolnosci}
        pochodzenie={opis.pochodzenieZdolnosci}
        numeryczne={opis.numeryczne}
        ocenaModulu={{
          der_ref: opis.derRef,
          reporting_status: 'not_reportable',
          proof_status: 'incomplete',
          evidence_limitations: ['T14:NOT_SIMULATED'],
          evidence_note_pl: 'BRAK WYSTARCZAJĄCEGO DOWODU SPEŁNIENIA WYMAGANIA dla testów: T14:NOT_SIMULATED.',
        }}
        onZmienZdolnosc={vi.fn()}
        onZmienParametr={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mvd-oze-panel-podstawa')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-panel-podstawa')).toHaveTextContent(
      'BRAK WYSTARCZAJĄCEGO DOWODU',
    );
  });

  it('moduł reportable (karta S-1) → podstawa werdyktu NIE jest pokazywana', () => {
    const opis = opisZ();
    render(
      <PanelModulu
        opis={opis}
        zdolnosci={opis.zdolnosci}
        pochodzenie={opis.pochodzenieZdolnosci}
        numeryczne={opis.numeryczne}
        ocenaModulu={{
          der_ref: opis.derRef,
          reporting_status: 'reportable',
          proof_status: 'complete',
          evidence_limitations: [],
          evidence_note_pl: 'Wszystkie wymagane testy oparte są o stopień dowodowy dopuszczalny do zgłoszenia.',
        }}
        onZmienZdolnosc={vi.fn()}
        onZmienParametr={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('mvd-oze-panel-podstawa')).not.toBeInTheDocument();
  });
});
