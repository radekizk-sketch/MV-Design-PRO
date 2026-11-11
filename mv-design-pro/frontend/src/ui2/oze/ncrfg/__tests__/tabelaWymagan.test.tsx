/**
 * Tabela rekordów wymagań NC RfG w standardzie warsztatu KD6 (karta PULPIT-OZE-KD6) — iloczyn
 * cech, w którym defekt prezentacji mógłby się schować:
 *   stan rekordu {spełnia, nie spełnia, brak dowodu, niejednoznaczny, nie dotyczy, brak podstawy}
 *   × źródło dowodu {certyfikat, symulacja, obliczenie, deklaracja}
 *   × motyw {jasny, ciemny}.
 * Każdy przypadek sprawdza: wiersz wymagania (albo wiersz zbiorczy „Nie dotyczy"), wartość
 * wymaganą z limitu, wykazaną z wyniku ze znacznikiem źródła dowodu, zapas ze znakiem
 * z marginesu, stan = etykieta rekordu, brak prozy na pierwszym planie i szczegóły (zdanie
 * wyjaśnienia + karta werdyktu) po natywnym kliknięciu. Rekordy budowane z rekordu
 * policzonego backendem (fixtura harnessu) — zmienione wyłącznie pola osi iloczynu.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import biegFixtura from '../../../../harness-fixtures/generated/ncrfg_bieg_scena_macierz.json';
import { NAZWA_METODY_PL } from '../../../wyniki/wzorzec/KartaWerdyktu';
import type {
  Etykieta,
  MetodaDowodu,
  OcenaKryterium,
  StatusWerdyktu,
  WynikWymagania,
} from '../../../wyniki/wzorzec/werdykt';
import { ListaRekordowWymagan } from '../komponenty';
import { liczbaWymagan } from '../strings';
import type { BiegNcRfg } from '../typy';

const BIEG = biegFixtura as unknown as BiegNcRfg;

/** Rekord W policzony backendem z dokładnie jedną stosowalną oceną składową (baza iloczynu). */
const BAZA: WynikWymagania = BIEG.ocena_wymagan
  .flatMap((o) => o.wymagania)
  .find((r) => r.stosowalnosc.dotyczy && r.oceny_skladowe.length === 1)!;
const BAZA_K: OcenaKryterium = BAZA.oceny_skladowe[0];

/** Etykiety poziomu W wg kontraktu werdyktu §9 (tekst i semantyka — dane rekordu, nie mapa UI). */
const STANY: readonly (readonly [StatusWerdyktu, Etykieta])[] = [
  ['SPELNIA', { etykieta_pl: 'Wymaganie spełnione', semantyka: 'pozytywna' }],
  ['NIE_SPELNIA', { etykieta_pl: 'Wymaganie naruszone', semantyka: 'negatywna' }],
  ['BRAK_DOWODU', { etykieta_pl: 'Brak wystarczającego dowodu', semantyka: 'ostrzegawcza' }],
  [
    'NIEJEDNOZNACZNY',
    { etykieta_pl: 'Wynik niejednoznaczny — wymaga weryfikacji', semantyka: 'ostrzegawcza' },
  ],
  ['NIE_DOTYCZY', { etykieta_pl: 'Nie dotyczy', semantyka: 'neutralna' }],
  ['BRAK_PODSTAWY', { etykieta_pl: 'Brak zweryfikowanej podstawy wymagania', semantyka: 'ostrzegawcza' }],
];
const ZRODLA: readonly MetodaDowodu[] = ['CERTYFIKAT', 'SYMULACJA', 'OBLICZENIE', 'DEKLARACJA'];
const MOTYWY = ['light', 'dark'] as const;

/** Kryterium „czas ≤ 1 s": wynik 0,8 s (zapas +0,2 s) albo 1,1 s (zapas −0,1 s) przy naruszeniu. */
function kryterium(status: StatusWerdyktu, metoda: MetodaDowodu): OcenaKryterium {
  const naruszone = status === 'NIE_SPELNIA';
  return {
    ...BAZA_K,
    kryterium: { ...BAZA_K.kryterium, relacja: 'NIE_WIECEJ' },
    status_maszynowy: status,
    wynik: {
      wielkosc_pl: 'czas odbudowy mocy czynnej',
      symbol_latex: 't',
      wartosc: { wartosc: naruszone ? 1.1 : 0.8, jednostka: 's' },
      punkt_krytyczny_pl: null,
      chwila_s: null,
      metoda,
    },
    limit: {
      wartosc: { wartosc: 1, jednostka: 's' },
      pasmo: null,
      obwiednia: null,
      jednostka_obwiedni: null,
      podstawa: BAZA.podstawa,
      zakres_stosowalnosci_pl: null,
      wersja_profilu: null,
    },
    margines: {
      wartosc: { wartosc: naruszone ? -0.1 : 0.2, jednostka: 's' },
      definicja_latex: 'm = t_{\\mathrm{lim}} - t',
      punkt_pl: null,
      skala: null,
      skala_rodzaj: null,
      wzgledny: null,
      niedefiniowalny: false,
      powod_pl: null,
    },
  };
}

function rekord(status: StatusWerdyktu, etykieta: Etykieta, metoda: MetodaDowodu): WynikWymagania {
  const dotyczy = status !== 'NIE_DOTYCZY';
  return {
    ...BAZA,
    wymaganie_id: `R_${status}_${metoda}`,
    nazwa_pl: `Wymaganie ${status} ${metoda}`,
    stosowalnosc: { ...BAZA.stosowalnosc, dotyczy, powod_pl: dotyczy ? BAZA.stosowalnosc.powod_pl : 'moduł typu B' },
    sposob_wykazania: metoda,
    oceny_skladowe: dotyczy ? [kryterium(status, metoda)] : [],
    status_maszynowy: status,
    etykieta,
    wyjasnienie: { ...BAZA.wyjasnienie, zdanie_pl: `Zdanie wyjaśnienia ${status} ${metoda}.` },
    dowod: { ...BAZA.dowod, metoda },
  };
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('tabela wymagań — iloczyn stan × źródło dowodu × motyw', () => {
  const przypadki = STANY.flatMap(([status, etykieta]) =>
    ZRODLA.flatMap((metoda) => MOTYWY.map((motyw) => [status, etykieta, metoda, motyw] as const)),
  );

  it.each(przypadki)('%s × %s × %s', async (status, etykieta, metoda, motyw) => {
    document.documentElement.setAttribute('data-theme', motyw);
    const r = rekord(status, etykieta, metoda);
    const uzytkownik = userEvent.setup();
    render(<ListaRekordowWymagan rekordy={[r]} testid="t" />);
    const id = `t-${r.wymaganie_id}`;
    // Proza wyjaśnienia nigdy na pierwszym planie.
    expect(screen.getByTestId('t')).not.toHaveTextContent(r.wyjasnienie.zdanie_pl);

    if (status === 'NIE_DOTYCZY') {
      // Wymaganie niestosowane — zwinięte w JEDEN wiersz zbiorczy z liczbą i powodem raz.
      expect(screen.queryByTestId(id)).toBeNull();
      const grupa = screen.getByTestId('t-nie-dotyczy');
      expect(grupa).toHaveTextContent(`Nie dotyczy: ${liczbaWymagan(1)}`);
      expect(screen.getByTestId('t-nie-dotyczy-powod')).toHaveTextContent('moduł typu B');
      await uzytkownik.click(screen.getByTestId('t-nie-dotyczy-przelacz'));
      expect(screen.getByTestId(id)).toBeInTheDocument();
      expect(screen.getByTestId(`${id}-wymagane`)).toHaveTextContent('—');
      expect(screen.getByTestId(`${id}-zapas`)).toHaveTextContent('—');
    } else {
      expect(screen.queryByTestId('t-nie-dotyczy')).toBeNull();
      expect(screen.getByTestId(`${id}-wymagane`)).toHaveTextContent('≤ 1 s');
      const wykazane = screen.getByTestId(`${id}-wykazane`);
      expect(wykazane).toHaveTextContent(status === 'NIE_SPELNIA' ? '1,1 s' : '0,8 s');
      const zapas = within(screen.getByTestId(`${id}-zapas`)).getByText(/0,[12] s/);
      if (status === 'NIE_SPELNIA') {
        expect(zapas.textContent).toMatch(/^[-−]0,1 s$/);
        expect(zapas).toHaveAttribute('data-uwaga', 'ujemny');
      } else {
        expect(zapas).toHaveTextContent('+0,2 s');
        expect(zapas).not.toHaveAttribute('data-uwaga');
      }
    }
    // Znacznik źródła dowodu: jeden słownik metody (lustro backendu).
    const znacznik = screen.getByTestId(`${id}-metoda`);
    expect(znacznik).toHaveAttribute('data-metoda', metoda);
    expect(znacznik).toHaveTextContent(NAZWA_METODY_PL[metoda]);
    // Stan = etykieta Z REKORDU (tekst i semantyka) — jeden raz w wierszu.
    const stan = screen.getByTestId(`${id}-etykieta`);
    expect(stan).toHaveTextContent(etykieta.etykieta_pl);
    expect(stan).toHaveAttribute('data-semantyka', etykieta.semantyka);
    expect(screen.getByTestId(id).querySelectorAll('[data-semantyka]')).toHaveLength(1);

    // Szczegóły: jeden przycisk, zdanie wyjaśnienia i karta werdyktu (kryterium, podstawa…).
    const przelacz = screen.getByTestId(`${id}-przelacz`);
    expect(przelacz).toHaveAttribute('aria-expanded', 'false');
    await uzytkownik.click(przelacz);
    expect(przelacz).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(`${id}-zdanie`)).toHaveTextContent(r.wyjasnienie.zdanie_pl);
    expect(within(screen.getByTestId(`${id}-karta`)).getByTestId(`mvd-werdykt-${r.wymaganie_id}`)).toBeInTheDocument();
  });

  it('motyw nie zmienia układu: ten sam DOM tabeli w motywie jasnym i ciemnym', () => {
    const rekordy = STANY.map(([status, etykieta]) => rekord(status, etykieta, 'SYMULACJA'));
    const html: string[] = [];
    for (const motyw of MOTYWY) {
      document.documentElement.setAttribute('data-theme', motyw);
      const { container, unmount } = render(<ListaRekordowWymagan rekordy={rekordy} testid="t" />);
      // Identyfikatory `useId` (aria-controls) są numerowane globalnie — porównujemy układ.
      html.push(container.innerHTML.replace(/:r[0-9a-z]+:/g, ':id:'));
      unmount();
    }
    expect(html[0]).toBe(html[1]);
  });
});

describe('tabela wymagań — przypadki brzegowe komórek', () => {
  it('kilka stosowalnych ocen składowych → wiersz składowej na każde kryterium (agregat nie zastępuje składników)', () => {
    const k1 = { ...kryterium('SPELNIA', 'SYMULACJA'), kryterium_id: 'k.pierwsze' };
    const k2 = { ...kryterium('NIE_SPELNIA', 'OBLICZENIE'), kryterium_id: 'k.drugie' };
    const r = { ...rekord('NIE_SPELNIA', STANY[1][1], 'DOWOD_LACZONY'), oceny_skladowe: [k1, k2] };
    render(<ListaRekordowWymagan rekordy={[r]} testid="t" />);
    const id = `t-${r.wymaganie_id}`;
    expect(screen.getByTestId(`${id}-skladowa-k.pierwsze`)).toHaveTextContent('+0,2 s');
    expect(screen.getByTestId(`${id}-skladowa-k.drugie`)).toHaveTextContent('1,1 s');
    expect(screen.getByTestId(`${id}-skladowa-k.drugie`).querySelector('[data-uwaga="ujemny"]')).not.toBeNull();
    expect(screen.getByTestId(`${id}-metoda`)).toHaveAttribute('data-metoda', 'DOWOD_LACZONY');
  });

  it('kryterium liczbowe bez limitu i bez marginesu → „brak limitu" i „brak" z wyróżnieniem', () => {
    const k = { ...kryterium('BRAK_PODSTAWY', 'DEKLARACJA'), limit: null, margines: null };
    const r = { ...rekord('BRAK_PODSTAWY', STANY[5][1], 'DEKLARACJA'), oceny_skladowe: [k] };
    render(<ListaRekordowWymagan rekordy={[r]} testid="t" />);
    const id = `t-${r.wymaganie_id}`;
    expect(screen.getByTestId(`${id}-wymagane`).querySelector('[data-uwaga="brak"]')).toHaveTextContent('brak limitu');
    expect(screen.getByTestId(`${id}-zapas`).querySelector('[data-uwaga="brak"]')).toHaveTextContent('brak');
  });

  it('kryterium logiczne (certyfikat) → bez liczby i bez zapasu, bez wyróżnienia', () => {
    const k: OcenaKryterium = {
      ...kryterium('SPELNIA', 'CERTYFIKAT'),
      kryterium: { ...BAZA_K.kryterium, relacja: 'LOGICZNE' },
      limit: null,
      margines: { ...kryterium('SPELNIA', 'CERTYFIKAT').margines!, wartosc: null, niedefiniowalny: true },
    };
    const r = { ...rekord('SPELNIA', STANY[0][1], 'CERTYFIKAT'), oceny_skladowe: [k] };
    render(<ListaRekordowWymagan rekordy={[r]} testid="t" />);
    const id = `t-${r.wymaganie_id}`;
    for (const kol of ['wymagane', 'zapas'] as const) {
      expect(screen.getByTestId(`${id}-${kol}`)).toHaveTextContent('—');
      expect(screen.getByTestId(`${id}-${kol}`).querySelector('[data-uwaga]')).toBeNull();
    }
  });

  it('podstawa wspólna wszystkich rekordów stoi raz nad tabelą; wiersz niesie jednostkę redakcyjną', () => {
    const rekordy = [rekord('SPELNIA', STANY[0][1], 'SYMULACJA'), rekord('BRAK_DOWODU', STANY[2][1], 'CERTYFIKAT')];
    render(<ListaRekordowWymagan rekordy={rekordy} testid="t" />);
    expect(screen.getByTestId('t-podstawa')).toHaveTextContent(BAZA.podstawa.dokument);
    const tabela = screen.getByRole('table');
    expect(tabela).not.toHaveTextContent(BAZA.podstawa.dokument);
    if (BAZA.podstawa.jednostka_redakcyjna) {
      expect(screen.getByTestId(`t-${rekordy[0].wymaganie_id}`)).toHaveTextContent(BAZA.podstawa.jednostka_redakcyjna);
    }
  });

  it('odmiana liczby wymagań w wierszu zbiorczym', () => {
    expect([1, 2, 4, 5, 7, 12, 14, 22, 25].map(liczbaWymagan)).toEqual([
      '1 wymaganie',
      '2 wymagania',
      '4 wymagania',
      '5 wymagań',
      '7 wymagań',
      '12 wymagań',
      '14 wymagań',
      '22 wymagania',
      '25 wymagań',
    ]);
  });
});

describe('style tabeli — kolor wyłącznie z tokenów, liczby w kroju bazowym', () => {
  const css = readFileSync(resolve(__dirname, '../ncrfg.css'), 'utf-8');
  it('bez literałów koloru i bez kroju maszynowego', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(css).not.toContain('--mvd-font-mono');
  });
  it('wyróżnienie koloru wyłącznie na wartościach wymagających uwagi (atrybut komórki), nie na wierszu', () => {
    expect(css).toMatch(/\.mvd-ncrfg-tabela \[data-uwaga="ujemny"\]/);
    expect(css).not.toMatch(/\.mvd-ncrfg-wiersz[^-{]*\{[^}]*background/);
  });
});
