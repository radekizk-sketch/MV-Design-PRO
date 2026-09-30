/**
 * Panel danych wejściowych modułu (formularz biegu „co-jeśli" — karta AB-1a Pakiet D2 §2, §8).
 * Każda kontrolka = jedno pole kontraktu `NcRfgPtpireeModuleInput` (w tym art. 4, T12,
 * nastawy zabezpieczeń); pochodzenie danej (model / deklarowane) widoczne; zmiana
 * deklarowanej zdolności zmienia pochodzenie na „deklarowane". Interakcje natywne.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { stanZFlagi } from '../../ncrfg/daneModulu';
import { POLA_LICZBOWE_WEJSCIA } from '../../ncrfg/formularz';
import { POLA_NASTAW } from '../../ncrfg/typy';
import { PanelModulu } from '../PanelModulu';
import {
  POLA_ZDOLNOSCI,
  POLA_ZDOLNOSCI_TROJSTANOWYCH,
  jestZdolnosciaTrojstanowa,
  zbudujModuly,
  type BledyFormularza,
  type FormularzModulu,
} from '../macierzModel';
import { ETYKIETY_POCHODZENIA, MACIERZ_STRINGS } from '../strings';
import { derFixture, deryScenyMacierz, wejsciaFixture, wejsciaZ } from './fixtures';

const PV = zbudujModuly(deryScenyMacierz(), wejsciaFixture())[1];

function Sterowany({ onZmiana, bledy = {} }: { onZmiana: (f: FormularzModulu) => void; bledy?: BledyFormularza }) {
  const [formularz, setFormularz] = useState(PV.formularz);
  return (
    <PanelModulu
      opis={PV}
      formularz={formularz}
      bledy={bledy}
      onZmienFormularz={(f) => {
        setFormularz(f);
        onZmiana(f);
      }}
    />
  );
}

describe('PanelModulu — kontrolki = pola kontraktu', () => {
  it('komplet kontrolek: 16 zdolności, 11 pól liczbowych, art. 4, data umowy, 11 nastaw + źródło', () => {
    render(<Sterowany onZmiana={vi.fn()} />);
    for (const pole of POLA_ZDOLNOSCI) {
      const kontrolka = screen.getByTestId(`mvd-oze-zdolnosc-${pole}`);
      // Deklaracja trójstanowa = lista wyboru (tak / nie / nie zadeklarowano), wartość z modelu.
      if (jestZdolnosciaTrojstanowa(pole)) {
        expect(kontrolka.tagName, pole).toBe('SELECT');
        expect(kontrolka).toHaveValue(stanZFlagi(PV.formularz.zdolnosci[pole]));
      } else {
        expect(kontrolka, pole).toHaveAttribute('type', 'checkbox');
      }
    }
    for (const pole of POLA_LICZBOWE_WEJSCIA) expect(screen.getByTestId(`mvd-oze-param-${pole}`)).toBeInTheDocument();
    for (const pole of POLA_NASTAW) expect(screen.getByTestId(`mvd-oze-nastawa-${pole}`)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-param-modul_istniejacy')).toHaveValue(PV.formularz.modulIstniejacy);
    expect(screen.getByTestId('mvd-oze-param-data_umowy_przylaczeniowej')).toHaveValue(PV.formularz.dataUmowy);
    expect(screen.getByTestId('mvd-oze-nastawa-zrodlo_pl')).toBeInTheDocument();
  });

  it('zdolność z wiązania modelu oznaczona „z modelu"; odznaczenie przez projektanta → „deklarowane"', async () => {
    const onZmiana = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<Sterowany onZmiana={onZmiana} />);
    const lvrt = screen.getByTestId('mvd-oze-zdolnosc-has_lvrt_curve');
    expect(lvrt).toBeChecked();
    expect(within(lvrt.closest('label')!).getByText(ETYKIETY_POCHODZENIA.model)).toBeInTheDocument();
    await uzytkownik.click(lvrt);
    expect(onZmiana).toHaveBeenLastCalledWith(
      expect.objectContaining({
        zdolnosci: expect.objectContaining({ has_lvrt_curve: false }),
        pochodzenieZdolnosci: expect.objectContaining({ has_lvrt_curve: 'deklarowane' }),
      }),
    );
    expect(within(lvrt.closest('label')!).getByText(ETYKIETY_POCHODZENIA.deklarowane)).toBeInTheDocument();
  });

  it('wpisanie wartości, wybór art. 4, data umowy i nastawy trafiają do formularza', async () => {
    const onZmiana = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<Sterowany onZmiana={onZmiana} />);
    await uzytkownik.type(screen.getByTestId('mvd-oze-param-cease_generation_time_s'), '5');
    await uzytkownik.selectOptions(screen.getByTestId('mvd-oze-param-modul_istniejacy'), 'tak');
    await uzytkownik.type(screen.getByTestId('mvd-oze-param-data_umowy_przylaczeniowej'), '2019-04-27');
    await uzytkownik.clear(screen.getByTestId('mvd-oze-nastawa-u_min_pu'));
    await uzytkownik.type(screen.getByTestId('mvd-oze-nastawa-u_min_pu'), '0,8');
    await uzytkownik.clear(screen.getByTestId('mvd-oze-nastawa-zrodlo_pl'));
    await uzytkownik.type(screen.getByTestId('mvd-oze-nastawa-zrodlo_pl'), 'karta nastaw');
    const ostatni = onZmiana.mock.calls[onZmiana.mock.calls.length - 1][0] as FormularzModulu;
    expect(ostatni.liczby.cease_generation_time_s).toBe('5');
    expect(ostatni.modulIstniejacy).toBe('tak');
    expect(ostatni.dataUmowy).toBe('2019-04-27');
    expect(ostatni.nastawy.wartosci.u_min_pu).toBe('0,8');
    expect(ostatni.nastawy.zrodlo).toBe('karta nastaw');
    // Każda edycja zmienia pochodzenie danej z „z modelu" na „deklarowane".
    expect(ostatni.pochodzenieLiczb.cease_generation_time_s).toBe('deklarowane');
    expect(ostatni.pochodzenieModuluIstniejacego).toBe('deklarowane');
    expect(ostatni.pochodzenieDatyUmowy).toBe('deklarowane');
    expect(ostatni.pochodzenieNastaw).toBe('deklarowane');
  });

  it('deklaracja trójstanowa: stan z modelu oznaczony „z modelu"; „nie zadeklarowano" → null (nie false)', async () => {
    const onZmiana = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<Sterowany onZmiana={onZmiana} />);
    const zadeklarowane = POLA_ZDOLNOSCI_TROJSTANOWYCH.filter((pole) => PV.formularz.zdolnosci[pole] !== null);
    expect(zadeklarowane.length).toBeGreaterThan(0);
    const pole = zadeklarowane[0];
    const lista = screen.getByTestId(`mvd-oze-zdolnosc-${pole}`);
    expect(within(lista.closest('label')!).getByText(ETYKIETY_POCHODZENIA.model)).toBeInTheDocument();
    await uzytkownik.selectOptions(lista, 'nieustalone');
    const ostatni = onZmiana.mock.calls[onZmiana.mock.calls.length - 1][0] as FormularzModulu;
    expect(ostatni.zdolnosci[pole]).toBeNull();
    expect(ostatni.pochodzenieZdolnosci[pole]).toBe('deklarowane');
    await uzytkownik.selectOptions(lista, 'nie');
    expect((onZmiana.mock.calls[onZmiana.mock.calls.length - 1][0] as FormularzModulu).zdolnosci[pole]).toBe(false);
  });

  it('błędy pól: komunikat przy polu i aria-invalid', () => {
    render(
      <Sterowany
        onZmiana={vi.fn()}
        bledy={{ cos_phi_min: 'wartość nie może być większa od 1', zrodlo_pl: 'podaj źródło nastaw' }}
      />,
    );
    expect(screen.getByTestId('mvd-oze-param-cos_phi_min')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('mvd-oze-param-cos_phi_min-blad')).toHaveTextContent('większa od 1');
    expect(screen.getByTestId('mvd-oze-nastawa-zrodlo_pl-blad')).toHaveTextContent('podaj źródło');
  });

  it('statyzm i martwa strefa policzone przez most z danych generatora — wartość i „z modelu"; edycja → „deklarowane"', async () => {
    const onZmiana = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<Sterowany onZmiana={onZmiana} />);
    const statyzm = screen.getByTestId('mvd-oze-param-droop_percent');
    expect(statyzm).toHaveValue(PV.formularz.liczby.droop_percent);
    expect(PV.formularz.liczby.droop_percent).not.toBe('');
    expect(within(statyzm.closest('label')!).getByText(ETYKIETY_POCHODZENIA.model)).toBeInTheDocument();
    await uzytkownik.clear(statyzm);
    await uzytkownik.type(statyzm, '4');
    const ostatni = onZmiana.mock.calls[onZmiana.mock.calls.length - 1][0] as FormularzModulu;
    expect([ostatni.liczby.droop_percent, ostatni.pochodzenieLiczb.droop_percent]).toEqual(['4', 'deklarowane']);
  });

  it.each([
    ['brak_napiecia', wejsciaZ({ pominiete: [{ derRef: 'x', powod: 'brak_napiecia' }] }), MACIERZ_STRINGS.brakNapiecia],
    ['brak_mocy', wejsciaZ({ pominiete: [{ derRef: 'x', powod: 'brak_mocy' }] }), MACIERZ_STRINGS.brakMocy],
    ['brak_wejscia_modelu', null, MACIERZ_STRINGS.brakWejsciaModelu],
  ] as const)('moduł zablokowany (%s) → jawny powód, bez formularza bez zastosowania', (_powod, wejscia, tekst) => {
    const [opis] = zbudujModuly([derFixture({ id: 'x' })], wejscia);
    render(<PanelModulu opis={opis} formularz={opis.formularz} bledy={{}} onZmienFormularz={vi.fn()} />);
    expect(screen.getByTestId('mvd-oze-panel-blokada')).toHaveTextContent(tekst);
    expect(screen.queryByTestId('mvd-oze-param-cos_phi_min')).toBeNull();
    expect(screen.queryByTestId('mvd-oze-nastawy')).toBeNull();
  });
});
