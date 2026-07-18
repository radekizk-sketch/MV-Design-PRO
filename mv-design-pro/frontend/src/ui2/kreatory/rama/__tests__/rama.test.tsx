/**
 * Testy frameworka kreatorów ui2 (rama + pola) — interakcje przez natywną
 * ścieżkę użytkownika (userEvent), zgodnie z Zero-Debt §5 (bez syntetycznych zdarzeń).
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KreatorRama, KreatorSekcja } from '../KreatorRama';
import {
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznik,
  PolePrzelacznikBinarny,
  PoleTekstowe,
  PoleWyboru,
} from '../pola';

afterEach(cleanup);

describe('KreatorRama — rama prowadząca', () => {
  function ramaTestowa(nadpisz: Partial<Parameters<typeof KreatorRama>[0]> = {}) {
    return (
      <KreatorRama
        eyebrow="MODEL · TEST"
        tytul="Element testowy"
        cel="Cel ekranu jednym zdaniem."
        odznaka="Nowy"
        akcjaGlowna={{ etykieta: 'Zapisz', onClick: () => {}, testid: 'rama-zapisz' }}
        akcjaAnuluj={{ etykieta: 'Anuluj', onClick: () => {}, testid: 'rama-anuluj' }}
        testid="rama"
        {...nadpisz}
      >
        <KreatorSekcja tytul="Sekcja A">
          <span>zawartość</span>
        </KreatorSekcja>
      </KreatorRama>
    );
  }

  it('renderuje eyebrow, tytuł, cel i odznakę', () => {
    render(ramaTestowa());
    expect(screen.getByText('MODEL · TEST')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Element testowy' })).toBeTruthy();
    expect(screen.getByText('Cel ekranu jednym zdaniem.')).toBeTruthy();
    expect(screen.getByText('Nowy')).toBeTruthy();
  });

  it('akcja główna i anuluj wołają handlery (klik natywny)', async () => {
    const user = userEvent.setup();
    const zapisz = vi.fn();
    const anuluj = vi.fn();
    render(ramaTestowa({
      akcjaGlowna: { etykieta: 'Zapisz', onClick: zapisz, testid: 'rama-zapisz' },
      akcjaAnuluj: { etykieta: 'Anuluj', onClick: anuluj, testid: 'rama-anuluj' },
    }));
    await user.click(screen.getByTestId('rama-zapisz'));
    await user.click(screen.getByTestId('rama-anuluj'));
    expect(zapisz).toHaveBeenCalledOnce();
    expect(anuluj).toHaveBeenCalledOnce();
  });

  it('blokuje akcję główną gdy zablokowana', () => {
    render(ramaTestowa({ akcjaGlowna: { etykieta: 'Zapisz', onClick: () => {}, testid: 'rama-zapisz', zablokowana: true } }));
    expect((screen.getByTestId('rama-zapisz') as HTMLButtonElement).disabled).toBe(true);
  });

  it('pokazuje baner błędu globalnego i podsumowanie walidacji', () => {
    render(ramaTestowa({ bladGlobalny: 'Błąd zapisu', walidacja: 'Uzupełnij pola' }));
    expect(screen.getByTestId('mvd-kreator-blad').textContent).toContain('Błąd zapisu');
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toContain('Uzupełnij pola');
  });

  it('renderuje pasek kroków i przełącza krok (klik natywny)', async () => {
    const user = userEvent.setup();
    const onKrok = vi.fn();
    render(ramaTestowa({
      kroki: [{ id: 'a', tytul: 'Krok A' }, { id: 'b', tytul: 'Krok B' }],
      krokAktywny: 'a',
      onKrok,
    }));
    await user.click(screen.getByTestId('mvd-kreator-krok-b'));
    expect(onKrok).toHaveBeenCalledWith('b');
  });
});

describe('Pola kreatora — interakcje natywne', () => {
  it('PoleTekstowe emituje zmianę i pokazuje błąd', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(<PoleTekstowe etykieta="Nazwa" wartosc="" onZmiana={onZmiana} blad="wymagane" testid="pt" />);
    await user.type(screen.getByTestId('pt'), 'X');
    expect(onZmiana).toHaveBeenCalledWith('X');
    expect(screen.getByRole('alert').textContent).toBe('wymagane');
  });

  it('PoleLiczbowe zwraca null dla pustej wartości', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(<PoleLiczbowe etykieta="Sk3" jednostka="MVA" wartosc={5} onZmiana={onZmiana} testid="pl" />);
    await user.clear(screen.getByTestId('pl'));
    expect(onZmiana).toHaveBeenLastCalledWith(null);
  });

  it('PoleWyboru emituje wybraną opcję', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(
      <PoleWyboru
        etykieta="Napięcie"
        wartosc="15"
        onZmiana={onZmiana}
        opcje={[{ id: '15', etykieta: '15 kV' }, { id: '20', etykieta: '20 kV' }]}
        testid="pw"
      />,
    );
    await user.selectOptions(screen.getByTestId('pw'), '20');
    expect(onZmiana).toHaveBeenCalledWith('20');
  });

  it('PolePrzelacznik przełącza segment (klik natywny)', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(
      <PolePrzelacznik
        wartosc="a"
        opcje={[{ id: 'a', etykieta: 'A' }, { id: 'b', etykieta: 'B' }]}
        onZmiana={onZmiana}
        testid="pp"
      />,
    );
    await user.click(screen.getByTestId('pp-b'));
    expect(onZmiana).toHaveBeenCalledWith('b');
  });

  it('PolePrzelacznikBinarny przełącza stan', async () => {
    const user = userEvent.setup();
    const onZmiana = vi.fn();
    render(<PolePrzelacznikBinarny etykieta="Zero" wlaczone={false} onZmiana={onZmiana} testid="pb" />);
    await user.click(screen.getByTestId('pb'));
    expect(onZmiana).toHaveBeenCalledWith(true);
  });

  it('PoleKatalogu pokazuje uczciwy błąd katalogu', () => {
    render(
      <PoleKatalogu
        etykieta="Typ"
        wartosc={null}
        onZmiana={() => {}}
        opcje={[]}
        status="error"
        placeholder="— wybierz —"
        komunikatBledu="Katalog niedostępny"
        testid="pk"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Katalog niedostępny');
  });
});
