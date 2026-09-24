/**
 * Ocena komórki macierzy (karta AB-1a Pakiet D2 §3): pełny rekord `ocena` przez
 * `KartaWerdyktu` (bez osobnej osi „ocena dowodowa" i bez listy akcji naprawczych), definicja testu,
 * wartości biegu i ślad; nawigacja do elementu tylko gdy rekord niesie `przedmiot.element_ref`.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useSelectionStore } from '../../../../ui/selection/store';
import { SzczegolWerdyktu, nazwaRodzajuTwierdzenia } from '../SzczegolWerdyktu';
import { mapujMacierz, zbudujModuly, type KomorkaMacierzy } from '../macierzModel';
import { MACIERZ_STRINGS } from '../strings';
import { biegFixture, derFixture, deryScenyMacierz, wejsciaFixture, wejsciaZ } from './fixtures';

const BIEG = biegFixture();
const MODULY = [
  ...zbudujModuly(deryScenyMacierz(), wejsciaFixture()),
  // DER pominięty przez most modelu (brak napięcia szyny) — powód blokady z serwera.
  ...zbudujModuly(
    [derFixture({ id: 'zz-bez-napiecia', connection_voltage_kv: null })],
    wejsciaZ({ pominiete: [{ derRef: 'zz-bez-napiecia', powod: 'brak_napiecia' }] }),
  ),
];
const WIERSZE = mapujMacierz(BIEG.test_catalog, BIEG, MODULY);

function komorka(indeksWiersza: number, derRef: string): KomorkaMacierzy {
  return WIERSZE[indeksWiersza].komorki.find((k) => k.derRef === derRef)!;
}

describe('SzczegolWerdyktu', () => {
  it('bez wybranej komórki → podpowiedź wyboru', () => {
    render(<SzczegolWerdyktu komorka={null} definicja={null} nazwaModulu={null} slad={[]} trybEkspercki={false} />);
    expect(screen.getByTestId('mvd-oze-szczegol-pusty')).toHaveTextContent(MACIERZ_STRINGS.szczegolWybierz);
  });

  it('komórka modułu bez danych → jawny powód', () => {
    render(
      <SzczegolWerdyktu komorka={komorka(0, 'zz-bez-napiecia')} definicja={null} nazwaModulu="x" slad={[]} trybEkspercki={false} />,
    );
    expect(screen.getByTestId('mvd-oze-szczegol-blokada')).toHaveTextContent('napięcie przyłączenia');
  });

  it('komórka z rekordem → karta rekordu, definicja z rodzajem twierdzenia, wartości biegu', () => {
    const pv = BIEG.modules[1];
    const k = komorka(0, pv.der_ref);
    const definicja = BIEG.test_catalog[0];
    render(<SzczegolWerdyktu komorka={k} definicja={definicja} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} trybEkspercki={false} />);
    if (k.stan !== 'wynik') throw new Error('oczekiwano rekordu');
    expect(screen.getByTestId(`mvd-werdykt-${k.wynik.ocena.kryterium_id}`)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(definicja.procedure_basis_pl);
    expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(
      nazwaRodzajuTwierdzenia(definicja.rodzaj_twierdzenia),
    );
    expect(screen.getByTestId('mvd-oze-szczegol-metryki')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Akcje naprawcze');
  });

  it.each([
    [false, false],
    [true, true],
  ] as const)(
    'identyfikator zdolności dowodowej (metadana audytowa, nie język inżynierski) — tryb ekspercki %s → widoczny %s',
    (trybEkspercki, widoczny) => {
      const pv = BIEG.modules[1];
      const definicja = BIEG.test_catalog[0];
      render(
        <SzczegolWerdyktu
          komorka={komorka(0, pv.der_ref)}
          definicja={definicja}
          nazwaModulu={pv.der_name}
          slad={[]}
          trybEkspercki={trybEkspercki}
        />,
      );
      expect(screen.queryByTestId('mvd-oze-szczegol-zdolnosc') !== null).toBe(widoczny);
      expect(document.body.textContent?.includes(definicja.zdolnosc_id)).toBe(widoczny);
      // Definicja testu (podstawa, rodzaj twierdzenia) — w obu trybach.
      expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(definicja.procedure_basis_pl);
    },
  );

  it('rekord z odnośnikiem przedmiotu → natywny klik zaznacza element modelu', async () => {
    const pv = BIEG.modules[1];
    const indeks = BIEG.test_catalog.findIndex(
      (d) => pv.tests.find((t) => t.test_id === d.test_id)?.ocena.przedmiot.element_ref,
    );
    const k = komorka(indeks, pv.der_ref);
    if (k.stan !== 'wynik') throw new Error('oczekiwano rekordu');
    const uzytkownik = userEvent.setup();
    render(<SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={[]} trybEkspercki={false} />);
    await uzytkownik.click(screen.getByTestId('mvd-oze-szczegol-pokaz-element'));
    expect(useSelectionStore.getState().selectedElement?.id).toBe(k.wynik.ocena.przedmiot.element_ref);
  });

  it('ślad: przycisk rozwija kroki TEGO testu', async () => {
    const pv = BIEG.modules[1];
    const indeks = BIEG.test_catalog.findIndex((d) => (pv.tests.find((t) => t.test_id === d.test_id)?.trace_refs.length ?? 0) > 0);
    const k = komorka(indeks, pv.der_ref);
    const uzytkownik = userEvent.setup();
    render(<SzczegolWerdyktu komorka={k} definicja={null} nazwaModulu={pv.der_name} slad={BIEG.white_box_trace} trybEkspercki={false} />);
    await uzytkownik.click(screen.getByTestId('mvd-oze-slad-otworz'));
    expect(screen.getByTestId('mvd-oze-slad-otworz')).toHaveAttribute('aria-expanded', 'true');
    const kroki = BIEG.white_box_trace.filter((krok) => krok.test_id === k.testId);
    if (kroki.length > 0) expect(screen.getByTestId('mvd-oze-slad-kroki').children).toHaveLength(kroki.length);
    else expect(screen.getByTestId('mvd-oze-slad-pusty')).toBeInTheDocument();
  });
});
