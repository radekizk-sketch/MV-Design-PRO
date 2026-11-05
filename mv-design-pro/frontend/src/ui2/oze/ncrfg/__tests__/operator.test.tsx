/**
 * Operator (profil wymagań NC RfG) — nigdy zgadywany (karta AB-1a Pakiet D2 §5; dodatek karty
 * GPZ-DANE-ANALIZ — operator sieci jest jedną daną modelu, profil modułu jest efektywny).
 * Iloczyn cech: liczba modułów (0 / 1 / wiele) × profil własny (brak / pusty / ten sam / różne)
 * × operator sieci (brak / jest) × dokument formalny (ocena / certyfikat-wniosek) × jawny wybór
 * (brak / jest) oraz kontrolka wyboru (natywne `userEvent`).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  operatorDokumentu,
  operatorEfektywny,
  operatorZapytaniaOceny,
  operatorZModelu,
  type OperatorZModelu,
} from '../operator';
import type { ProfilOperatoraNcRfg } from '../typy';
import { ETYKIETY_ODCZYTU_KATALOGU, OPIS_PER_MODUL, WyborOperatora } from '../WyborOperatora';

const modul = (profil: string | null, operatorSieci?: string | null) => ({
  profiles: { nc_rfg_profile_ref: profil },
  operator_sieci: operatorSieci,
});

describe('operatorZModelu — profil efektywny modułów', () => {
  it.each([
    ['brak modułów', [], { rodzaj: 'wymaga_wyboru', powod: 'brak_modulow' }],
    ['jeden moduł z profilem', [modul('enea')], { rodzaj: 'z_modelu', operatorId: 'enea' }],
    ['wiele modułów, ten sam profil', [modul('enea'), modul(' enea ')], { rodzaj: 'z_modelu', operatorId: 'enea' }],
    ['wiele modułów, różne profile', [modul('enea'), modul('pse')], { rodzaj: 'per_modul', operatorzy: ['enea', 'pse'] }],
    ['moduł bez profilu, brak operatora sieci', [modul('enea'), modul(null)], { rodzaj: 'wymaga_wyboru', powod: 'brak_profilu' }],
    ['moduł z pustym profilem', [modul('   ')], { rodzaj: 'wymaga_wyboru', powod: 'brak_profilu' }],
    ['moduły bez profilu dziedziczą operatora sieci', [modul(null, 'enea'), modul('  ', 'enea')], { rodzaj: 'z_modelu', operatorId: 'enea' }],
    ['dziedziczenie + profil zgodny z operatorem sieci', [modul(null, 'enea'), modul('enea', 'enea')], { rodzaj: 'z_modelu', operatorId: 'enea' }],
    ['dziedziczenie + nadpisanie innym operatorem', [modul(null, 'enea'), modul('pse', 'enea')], { rodzaj: 'per_modul', operatorzy: ['enea', 'pse'] }],
  ] as const)('%s', (_opis, moduly, oczekiwane) => {
    expect(operatorZModelu(moduly)).toEqual(oczekiwane);
  });
});

describe('operatorZapytaniaOceny i operatorDokumentu — ocena z modelu, dokument do jednego operatora', () => {
  const Z_MODELU: OperatorZModelu = { rodzaj: 'z_modelu', operatorId: 'enea' };
  const PER_MODUL: OperatorZModelu = { rodzaj: 'per_modul', operatorzy: ['enea', 'pse'] };
  const WYBOR: OperatorZModelu = { rodzaj: 'wymaga_wyboru', powod: 'brak_profilu' };
  it.each([
    ['z modelu, bez wyboru', Z_MODELU, null, null],
    ['z modelu, wybór ignorowany', Z_MODELU, 'pse', null],
    ['per moduł, bez wyboru — backend ocenia moduł wg profilu', PER_MODUL, null, null],
    ['wymaga wyboru, bez wyboru — zapytanie wstrzymane', WYBOR, null, undefined],
    ['wymaga wyboru, wybór trafia do zapytania', WYBOR, 'pse', 'pse'],
  ] as const)('ocena: %s', (_opis, zModelu, wybor, oczekiwany) => {
    expect(operatorZapytaniaOceny(zModelu, wybor)).toBe(oczekiwany);
  });
  it('dokument: per moduł wymaga jawnego wyboru (różni operatorzy), pozostałe bez zmian', () => {
    expect(operatorDokumentu(PER_MODUL)).toEqual({ rodzaj: 'wymaga_wyboru', powod: 'rozni_operatorzy' });
    expect(operatorDokumentu(Z_MODELU)).toBe(Z_MODELU);
    expect(operatorDokumentu(WYBOR)).toBe(WYBOR);
    expect(operatorEfektywny(operatorDokumentu(PER_MODUL), null)).toBeNull();
    expect(operatorEfektywny(operatorDokumentu(PER_MODUL), 'pse')).toBe('pse');
  });
});

describe('operatorEfektywny — model rozstrzyga, jawny wybór tylko gdy model nie rozstrzyga', () => {
  it('z modelu: wybór projektanta ignorowany (model jest prawdą)', () => {
    expect(operatorEfektywny({ rodzaj: 'z_modelu', operatorId: 'enea' }, 'pse')).toBe('enea');
  });
  it('wymaga wyboru: bez wyboru null (zero domyślnego), z wyborem — wybór', () => {
    const zModelu = { rodzaj: 'wymaga_wyboru', powod: 'rozni_operatorzy' } as const;
    expect(operatorEfektywny(zModelu, null)).toBeNull();
    expect(operatorEfektywny(zModelu, 'pse')).toBe('pse');
  });
});

const OPERATORZY = [
  { operator_id: 'enea', operator_name_pl: 'Enea Operator' },
  { operator_id: 'pse', operator_name_pl: 'PSE' },
] as unknown as ProfilOperatoraNcRfg[];

describe('WyborOperatora', () => {
  it('operator z modelu: pokazany jako fakt z nazwą z katalogu, bez pola wyboru', () => {
    render(
      <WyborOperatora
        zModelu={{ rodzaj: 'z_modelu', operatorId: 'enea' }}
        operatorzy={OPERATORZY}
        bladKatalogu={null}
        wybor={null}
        onWybor={vi.fn()}
        etykieta="Operator"
        testid="op"
      />,
    );
    expect(screen.getByTestId('op')).toHaveAttribute('data-zrodlo', 'model');
    expect(screen.getByTestId('op-wartosc')).toHaveTextContent('Enea Operator (z modelu');
    expect(screen.queryByTestId('op-wybor')).toBeNull();
  });

  it('profile per moduł: pokazane jako fakt modelu (nazwy z katalogu), bez pola wyboru', () => {
    render(
      <WyborOperatora
        zModelu={{ rodzaj: 'per_modul', operatorzy: ['enea', 'pse'] }}
        operatorzy={OPERATORZY}
        bladKatalogu={null}
        wybor={null}
        onWybor={vi.fn()}
        etykieta="Operator"
        testid="op"
      />,
    );
    expect(screen.getByTestId('op')).toHaveAttribute('data-zrodlo', 'model-per-modul');
    expect(screen.getByTestId('op-wartosc')).toHaveTextContent(`Enea Operator, PSE ${OPIS_PER_MODUL}`);
    expect(screen.queryByTestId('op-wybor')).toBeNull();
  });

  it('wymagany wybór: pole bez wartości domyślnej, natywny wybór i wycofanie wyboru', async () => {
    const onWybor = vi.fn();
    const uzytkownik = userEvent.setup();
    render(
      <WyborOperatora
        zModelu={{ rodzaj: 'wymaga_wyboru', powod: 'rozni_operatorzy' }}
        operatorzy={OPERATORZY}
        bladKatalogu={null}
        wybor={null}
        onWybor={onWybor}
        etykieta="Operator"
        testid="op"
      />,
    );
    const pole = screen.getByTestId('op-wybor') as HTMLSelectElement;
    expect(pole.value).toBe('');
    expect(screen.getByText(/profile różnych operatorów/)).toBeInTheDocument();
    await uzytkownik.selectOptions(pole, 'pse');
    expect(onWybor).toHaveBeenLastCalledWith('pse');
    await uzytkownik.selectOptions(pole, '');
    expect(onWybor).toHaveBeenLastCalledWith(null);
  });

  it.each([
    { odczyt: 'wczytywanie', operatorzy: null, blad: null },
    { odczyt: 'blad', operatorzy: null, blad: 'HTTP 500' },
    { odczyt: 'gotowy', operatorzy: OPERATORZY, blad: null },
  ] as const)(
    'katalog — odczyt $odczyt: pierwsza opcja i stan pola mówią, czym jest pusty wybór (odczyt ≠ brak operatorów)',
    ({ odczyt, operatorzy, blad }) => {
      render(
        <WyborOperatora
          zModelu={{ rodzaj: 'wymaga_wyboru', powod: 'brak_profilu' }}
          operatorzy={operatorzy}
          bladKatalogu={blad}
          wybor={null}
          onWybor={vi.fn()}
          etykieta="Operator"
          testid="op"
        />,
      );
      const pole = screen.getByTestId('op-wybor') as HTMLSelectElement;
      expect(pole).toHaveAttribute('data-odczyt', odczyt);
      expect(pole.options[0].textContent).toBe(ETYKIETY_ODCZYTU_KATALOGU[odczyt]);
      if (odczyt === 'gotowy') {
        expect(pole).toBeEnabled();
        expect(pole.options).toHaveLength(OPERATORZY.length + 1);
      } else {
        // Bez listy nie ma czego wybrać — pole nieaktywne, a nie „puste jak brak operatorów".
        expect(pole).toBeDisabled();
        expect(pole.options).toHaveLength(1);
      }
      expect(pole).toHaveAttribute('aria-busy', String(odczyt === 'wczytywanie'));
      if (odczyt === 'blad') expect(screen.getByTestId('op-blad-katalogu')).toHaveTextContent('HTTP 500');
      else expect(screen.queryByTestId('op-blad-katalogu')).toBeNull();
    },
  );
});
