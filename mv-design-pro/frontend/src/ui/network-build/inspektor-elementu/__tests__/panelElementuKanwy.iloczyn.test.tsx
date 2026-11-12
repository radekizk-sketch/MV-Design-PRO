/**
 * UI-02b JEDEN-INSPEKTOR — sekcje „z kanwy" prawego inspektora jako ILOCZYN CECH:
 *
 *   rodzaj obiektu {stacja · pole · aparat · transformator · źródło OZE · odcinek · węzeł SN}
 *   × działanie {dostępne (klik ma skutek) · niedostępne z przyczyną (klik bez skutku)}
 *   × wyniki {brak · nieaktualne · wartość}
 *   × analiza {rozpływ mocy · obliczenia zwarciowe} (karta INSPEKTOR-I-NAWIGACJA, P0 (b):
 *     wykaz wielkości z rejestru wspólnego z etykietami kanwy; obiekt, dla którego analiza
 *     nie wyznacza wielkości, dostaje przyczynę nazywającą analizę i obiekt).
 *
 * Ścieżka natywna: obiekt wskazuje KLIK w uchwyt trafienia kanwy (`data-hit-for`), nie
 * wymuszony stan selekcji — kanwa pisze selekcję i kontekst kliknięcia, inspektor czyta je
 * tak samo jak w aplikacji. Stan wyników zmienia się w magazynach (nakładka wyników i status
 * przypadku), bo to one są wejściem inspektora; ponowne kliknięcie nie jest potrzebne.
 *
 * Działanie testowane na pozycji „Pokaż wyniki", bo jej dostępność wynika z TEGO SAMEGO
 * statusu wyników co sekcja „Wyniki" (`kontekstDostepnosciAkcji`: brak przebiegu ⇒ pozycja
 * nieaktywna z przyczyną). Dwa rodzaje mają osobny przypadek:
 *  - źródło OZE (`der_pv`/`der_bess`/`der_fw`): działanie dostępne = „Pokaż zgodność
 *    przyłączeniową" (macierz NC RfG w przestrzeni Wyniki); jedyną pozycją warunkową jest
 *    „Pokaż wyniki" (V12K-352 — test przypina, że bez wyników nieaktywna jest TYLKO ona);
 *  - węzeł SN: brak tematu menu kanwy (punkt odgałęźny świadomie bez menu,
 *    `canvasMenuSubject.ts`), działaniem jest wejście do karty węzła.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSelectionStore } from '../../../selection';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { POWOD_BRAK_PRZEBIEGU_PL } from '../stanPaneluElementu';
import { PRZYPADKI, kliknijObiekt, otworzPowierzchnie, przygotujIloczyn, ustawWyniki } from './iloczynInspektora';

przygotujIloczyn();

describe.each(PRZYPADKI)('inspektor elementu kanwy: $nazwa', (przypadek) => {
  const kliknij = () => kliknijObiekt(przypadek);

  for (const stan of ['brak', 'nieaktualne', 'wartosc'] as const) {
    it(`wyniki: ${stan}`, () => {
      kliknij();
      ustawWyniki(przypadek.enm, stan);
      const sekcja = screen.getByTestId('inspektor-wyniki');
      expect(sekcja).toHaveAttribute('data-stan', stan);
      if (stan === 'brak') {
        expect(within(sekcja).getByTestId('inspektor-wyniki-brak').textContent).toBe(POWOD_BRAK_PRZEBIEGU_PL);
        expect(within(sekcja).queryAllByTestId(/^inspektor-wynik-/)).toHaveLength(0);
      } else {
        const wiersze = within(sekcja).getAllByTestId(/^inspektor-wynik-/);
        expect(wiersze.length).toBeGreaterThan(0);
        // Liczby z nakładki wyników (format polski), nigdy wartość zastępcza.
        expect(wiersze.map((w) => w.textContent).join(' ')).toMatch(/\d+,\d+ (kV|MW|Mvar|MVA|A|%|p\.u\.)/);
        expect(wiersze.map((w) => w.textContent).join(' ')).not.toContain('—');
        expect(within(sekcja).queryByTestId('inspektor-wyniki-nieaktualne') !== null).toBe(stan === 'nieaktualne');
      }
    });
  }

  // Obliczenia zwarciowe: wielkości węzłowe (Ik″, ip, Ith, Sk″) tylko dla punktów zwarcia
  // (stacja → jej szyna SN, węzeł SN); gałąź, transformator, aparat i źródło dostają przyczynę
  // z nazwą analizy i obiektu. Dawniej inspektor znał tylko kody rozpływu — szyna z Ik″ w
  // tabeli zwarć i na kanwie miała w inspektorze „brak wielkości”.
  it('obliczenia zwarciowe: wykaz z rejestru kanwy albo przyczyna z analizą i obiektem', () => {
    kliknij();
    ustawWyniki(przypadek.enm, 'wartosc', 'SC_3F');
    const sekcja = screen.getByTestId('inspektor-wyniki');
    expect(sekcja).toHaveAttribute('data-analiza', 'short_circuit');
    expect(within(sekcja).getByTestId('inspektor-wyniki-tytul').textContent).toBe('Obliczenia zwarciowe');
    const punktZwarcia = przypadek.rodzaj === 'station' || przypadek.rodzaj === 'node';
    if (punktZwarcia) {
      expect(sekcja).toHaveAttribute('data-stan', 'wartosc');
      const kody = within(sekcja).getAllByTestId(/^inspektor-wynik-/).map((w) => w.getAttribute('data-testid'));
      expect(kody).toEqual(['inspektor-wynik-IK_3F_A', 'inspektor-wynik-IP_A', 'inspektor-wynik-ITH_A', 'inspektor-wynik-SK_MVA']);
      expect(within(sekcja).getByTestId('inspektor-wynik-IK_3F_A').textContent).toContain('18,5 kA');
      expect(within(sekcja).getByTestId('inspektor-wynik-IK_3F_A').textContent).toContain('Prąd zwarciowy początkowy');
    } else {
      expect(sekcja).toHaveAttribute('data-stan', 'brak');
      const powod = within(sekcja).getByTestId('inspektor-wyniki-brak').textContent ?? '';
      expect(powod).toMatch(/^Obliczenia zwarciowe/);
      expect(powod).not.toBe(POWOD_BRAK_PRZEBIEGU_PL);
      // Przyczyna nazywa TEN obiekt — tą samą nazwą co nagłówek inspektora.
      expect(powod).toContain(screen.getByTestId('inspektor-element-etykieta').textContent ?? '∅');
    }
  });


  if (przypadek.rodzaj === 'node') {
    it('działanie dostępne: wejście do karty węzła otwiera kartę ZK SN z refem węzła; brak paska działań (węzeł bez menu kanwy)', () => {
      kliknij();
      expect(screen.queryByTestId('inspektor-dzialania')).toBeNull();
      fireEvent.click(screen.getByTestId('inspektor-otworz-konfiguracje'));
      expect(otworzPowierzchnie).toHaveBeenCalledTimes(1);
      const [ekran, opcje] = otworzPowierzchnie.mock.calls[0] as [string, { entityRef: string }];
      expect(ekran).toBe('E-14');
      expect(opcje.entityRef).toBe(useSelectionStore.getState().selectedElements[0].id);
    });
    return;
  }

  if (przypadek.rodzaj === 'generator') {
    for (const stan of ['brak', 'nieaktualne', 'wartosc'] as const) {
      it(`działanie dostępne (wyniki: ${stan}): „Pokaż zgodność przyłączeniową" otwiera macierz NC RfG; jedyną pozycją warunkową źródła jest „Pokaż wyniki"`, () => {
        kliknij();
        ustawWyniki(przypadek.enm, stan);
        const pasek = screen.getByTestId('inspektor-dzialania');
        // V12K-352: menu źródła dostało „Pokaż wyniki" (kanon: wyniki źródła) — pozycja
        // bramkowana stanem wyników, jak w każdym innym rodzaju obiektu. Pozostałe
        // pozycje źródła są bezwarunkowe.
        const nieaktywne = [...pasek.querySelectorAll('[aria-disabled="true"]')].map((el) =>
          el.getAttribute('data-testid'),
        );
        expect(nieaktywne).toEqual(stan === 'brak' ? ['inspektor-akcja-show-results'] : []);
        fireEvent.click(within(pasek).getByTestId('inspektor-akcja-show-ncrfg'));
        expect(useShellStore.getState().activeSpace).toBe('wyniki');
        expect(useShellStore.getState().wynikiTab).toBe('ncrfg');
      });
    }
    return;
  }

  it('działanie niedostępne z przyczyną (bez wyników): „Pokaż wyniki" nieaktywne, przyczyna w opisie, klik bez skutku', () => {
    kliknij();
    ustawWyniki(przypadek.enm, 'brak');
    const pozycja = screen.getByTestId('inspektor-akcja-show-results');
    expect(pozycja).toHaveAttribute('aria-disabled', 'true');
    expect(pozycja).not.toBeDisabled();
    const opis = document.getElementById(pozycja.getAttribute('aria-describedby') ?? '');
    expect(opis?.textContent).toBe('Brak obliczeń. Uruchom obliczenia z prawego panelu.');
    expect(pozycja).toHaveAttribute('title', 'Brak obliczeń. Uruchom obliczenia z prawego panelu.');
    fireEvent.click(pozycja);
    expect(useShellStore.getState().activeSpace).toBe('model');
  });

  for (const stan of ['nieaktualne', 'wartosc'] as const) {
    it(`działanie dostępne (wyniki: ${stan}): „Pokaż wyniki" prowadzi do wyników rozpływu tego obiektu`, () => {
      kliknij();
      ustawWyniki(przypadek.enm, stan);
      const pozycja = screen.getByTestId('inspektor-akcja-show-results');
      expect(pozycja).not.toHaveAttribute('aria-disabled');
      fireEvent.click(pozycja);
      expect(useShellStore.getState().activeSpace).toBe('wyniki');
      expect(useShellStore.getState().wynikiTab).toBe('rozplyw');
    });
  }
});
