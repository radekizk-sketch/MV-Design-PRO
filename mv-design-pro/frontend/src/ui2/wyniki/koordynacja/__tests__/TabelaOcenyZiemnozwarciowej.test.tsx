/**
 * Ocena zabezpieczeń ziemnozwarciowych (karta EKRANY-EAZ-ZIEMNOZWARCIOWE) — tabele rodzin,
 * paski „Sieć” i „Przypadek doziemienia”, uziemienia stacji, szczegóły z wykresem wskazowym.
 *
 * Dane: fikstura z REALNEGO biegu ewaluatora (`backend/tests/ci/test_fikstura_oceny_ziemnozwarciowej.py`
 * pilnuje równości z backendem). Iloczyn cech, w którym defekt prezentacji mógłby się schować:
 * rodzina z rejestru {zerowoprądowe 51N, kierunkowe 67N, admitancyjne, watometryczne,
 * zerowonapięciowe} × stan {spełnia, nie spełnia, brak nastaw, brak podstawy} × motyw {ciemny,
 * jasny}. Wiersze iloczynu powstają z wiersza fikstury podmianą rodziny/stanu — komponent jest
 * sterowany danymi (kolumny z rejestru), więc to ta sama ścieżka co dane backendu. Kliki natywne.
 *
 * Parytet wykres ↔ werdykt: położenie narysowanego wskazu względem narysowanego sektora i progu
 * = warunki algorytmu 67N policzone przez backend (rysunek nie ma własnej geometrii).
 */

import katex from 'katex';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fikstura from './fixtures/oceny_ziemnozwarciowe.json';
import { TabelaOcenyZiemnozwarciowej } from '../TabelaOcenyZiemnozwarciowej';
import { formatWgJednostki } from '../../../../ui/shared/formatPolishValue';
import type { RodzinaEaz, WierszRodziny, WynikOcenyZiemnozwarciowej } from '../ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from '../strings';

const WARIANTY = fikstura as unknown as Record<string, WynikOcenyZiemnozwarciowej>;
const KOMPENSOWANY = WARIANTY.KOMPENSOWANY_AWSC_z_uziomem;
const TID = 'mvd-ocena-ziemnozwarciowa';

type Stan = 'SPELNIA' | 'NIE_SPELNIA' | 'BRAK_NASTAW' | 'BRAK_PODSTAWY';
const STANY: readonly Stan[] = ['SPELNIA', 'NIE_SPELNIA', 'BRAK_NASTAW', 'BRAK_PODSTAWY'];
const MOTYWY = ['dark_scada', 'light_technical'] as const;

const ETYKIETY = {
  SPELNIA: { etykieta_pl: 'Kryterium spełnione — dowód niepełny', semantyka: 'ostrzegawcza' },
  NIE_SPELNIA: { etykieta_pl: 'Kryterium naruszone', semantyka: 'negatywna' },
  BRAK_NASTAW: { etykieta_pl: 'Ocena niewykonana', semantyka: 'neutralna' },
  BRAK_PODSTAWY: { etykieta_pl: 'Brak zweryfikowanej podstawy wymagania', semantyka: 'ostrzegawcza' },
} as const;

/** Wiersz iloczynu: rodzina × stan, z szablonu wiersza fikstury (te same pola co backend). */
function wierszIloczynu(rodzina: RodzinaEaz, stan: Stan): WierszRodziny {
  const szablon = KOMPENSOWANY.wiersze!.find((w) => w.kod === '51N')!;
  const kluczNiespelniony = rodzina.kolumny[rodzina.kolumny.length > 1 ? 1 : 0].klucz;
  const wartosci =
    stan === 'BRAK_NASTAW'
      ? {}
      : Object.fromEntries(
          rodzina.kolumny.map((k, i) => [
            k.klucz,
            {
              wartosc: 1.5 + i,
              jednostka: '1',
              spelnia: stan === 'NIE_SPELNIA' && k.klucz === kluczNiespelniony ? false : i === 0 ? null : true,
              tekst: null,
              powod_pl: null,
            },
          ]),
        );
  return {
    ...szablon,
    rodzina: rodzina.id,
    kod: rodzina.kody[0],
    ansi: rodzina.kody[0],
    funkcja_ref: `${rodzina.kody[0]}-${stan}`,
    urzadzenie_ref: `sterownik-${rodzina.id}-${stan}`,
    pole_pl: `Pole ${rodzina.id} ${stan}`,
    stan: stan === 'BRAK_NASTAW' ? 'NIE_OCENIONO' : stan,
    etykieta: ETYKIETY[stan],
    wartosci,
    braki:
      stan === 'BRAK_NASTAW'
        ? [
            {
              kod: 'zabezpieczenia.ziemnozwarciowe.brak_nastawy',
              komunikat_pl: 'brak progu',
              akcja_naprawcza_pl: 'Uzupełnij nastawy w karcie pola.',
              funkcja: rodzina.kody[0],
              nazwa_braku_pl: 'próg',
            },
          ]
        : [],
    braki_pl: stan === 'BRAK_NASTAW' ? ['Brakuje nastaw: próg — uzupełnij w karcie pola.'] : [],
    warunki_67n: null,
    wykres_wskazowy: null,
    wzory: [],
    kryteria: [],
  };
}

function wynikIloczynu(rodzina: RodzinaEaz, stan: Stan): WynikOcenyZiemnozwarciowej {
  return { ...KOMPENSOWANY, wiersze: [wierszIloczynu(rodzina, stan)], wiersze_uziemien: [] };
}

describe('tabele rodzin — iloczyn rodzina × stan × motyw', () => {
  const rodziny = KOMPENSOWANY.rodziny!;

  it('rejestr rodzin fikstury niesie pięć rodzin z rozłącznymi kodami i niepustymi kolumnami', () => {
    expect(rodziny.map((r) => r.id)).toEqual([
      'ZEROWOPRADOWE',
      'KIERUNKOWE_67N',
      'ADMITANCYJNE',
      'WATOMETRYCZNE',
      'ZEROWONAPIECIOWE',
    ]);
    const kody = rodziny.flatMap((r) => r.kody);
    expect(new Set(kody).size).toBe(kody.length);
    for (const r of rodziny) expect(r.kolumny.length).toBeGreaterThan(0);
  });

  for (const rodzina of KOMPENSOWANY.rodziny!) {
    for (const stan of STANY) {
      for (const motyw of MOTYWY) {
        it(`${rodzina.id} × ${stan} × ${motyw}`, async () => {
          document.documentElement.setAttribute('data-theme', motyw);
          const user = userEvent.setup();
          const onUzupelnij = vi.fn();
          const wynik = wynikIloczynu(rodzina, stan);
          const { container } = render(<TabelaOcenyZiemnozwarciowej wynik={wynik} onUzupelnij={onUzupelnij} />);
          const tabela = screen.getByTestId(`${TID}-rodzina`);
          expect(tabela.dataset.rodzina).toBe(rodzina.id);
          // Kolumny = deklaracja rodziny w rejestrze (Pole, Funkcja, Gr. + kolumny rodziny + stan).
          const naglowki = within(tabela)
            .getAllByRole('columnheader')
            .map((th) => th.textContent ?? '');
          expect(naglowki.slice(3, 3 + rodzina.kolumny.length)).toEqual(rodzina.kolumny.map((k) => k.naglowek_pl));
          expect(naglowki).toHaveLength(rodzina.kolumny.length + 5);

          const wiersz = screen.getByTestId(`${TID}-wiersz`);
          expect(wiersz).toHaveTextContent(rodzina.kody[0]);
          expect(wiersz).toHaveTextContent(T.ziemneGrupa(1));
          const znak = within(wiersz).getByTestId(`${TID}-stan`);
          expect(znak.dataset.semantyka).toBe(ETYKIETY[stan].semantyka);
          expect(znak).toHaveTextContent(ETYKIETY[stan].etykieta_pl);

          const czerwone = container.querySelectorAll('td[data-spelnia="false"]');
          // Kolor WYŁĄCZNIE na liczbie, która nie spełnia kryterium.
          expect(czerwone).toHaveLength(stan === 'NIE_SPELNIA' ? 1 : 0);

          if (stan === 'BRAK_NASTAW') {
            expect(screen.getByTestId(`${TID}-braki-zbiorcze`)).toHaveTextContent(T.ziemneBezNastaw(1, 1));
            const komorka = screen.getByTestId(`${TID}-brak-nastawy`);
            expect(komorka).toHaveTextContent('—');
            await user.click(within(komorka).getByRole('button', { name: T.ziemneUzupelnij }));
            expect(onUzupelnij).toHaveBeenCalledWith({
              urzadzenieRef: `sterownik-${rodzina.id}-${stan}`,
              funkcjaRef: `${rodzina.kody[0]}-${stan}`,
            });
          } else {
            expect(screen.queryByTestId(`${TID}-braki-zbiorcze`)).toBeNull();
            expect(screen.queryByTestId(`${TID}-uzupelnij`)).toBeNull();
            const pierwsza = rodzina.kolumny[0].klucz;
            expect(within(wiersz).getByTestId(`${TID}-${pierwsza}`)).toHaveTextContent(formatWgJednostki(1.5, '1'));
          }

          // Motyw: żadnego koloru zaszytego — wyłącznie tokeny `--mvd-*` (oba motywy z automatu).
          for (const el of Array.from(container.querySelectorAll('[style],[fill],[stroke]'))) {
            const atrybuty = ['style', 'fill', 'stroke'].map((a) => el.getAttribute(a) ?? '').join(' ');
            expect(atrybuty).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
          }
          // Bez kroju maszynowego w liczbach: klasa `mvd-num` i żadnej `mvd-mono`.
          expect(container.querySelector('.mvd-mono')).toBeNull();
          document.documentElement.removeAttribute('data-theme');
        });
      }
    }
  }
});

describe.each(Object.keys(WARIANTY))('wynik backendu — %s', (nazwa) => {
  const wynik = WARIANTY[nazwa];

  it('paski „Sieć” i „Przypadek doziemienia” są rozdzielone; dane sieci z backendu', () => {
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    const siec = screen.getByTestId(`${TID}-siec`);
    const przypadek = screen.getByTestId(`${TID}-przypadek`);
    expect(siec).toHaveTextContent(wynik.siec![0].sposob_pl);
    expect(siec).toHaveTextContent(formatWgJednostki(wynik.siec![0].prad_pojemnosciowy_a, 'A'));
    // U₀ i R_F należą do przypadku, nie do sieci (korekta właściciela 4).
    const symbol = (el: HTMLElement, latex: string) => el.querySelector(`[data-latex="${CSS.escape(latex)}"]`);
    expect(symbol(siec, T.ziemneU0)).toBeNull();
    expect(symbol(siec, T.ziemneRf)).toBeNull();
    expect(symbol(przypadek, T.ziemneU0)).not.toBeNull();
    expect(symbol(przypadek, T.ziemneRf)).not.toBeNull();
    if (wynik.siec![0].prad_resztkowy_a !== null) {
      expect(siec).toHaveTextContent(formatWgJednostki(wynik.siec![0].prad_resztkowy_a, 'A'));
    } else {
      expect(symbol(siec, T.ziemneIres)).toBeNull();
    }
  });

  it('wiersz na funkcję w tabeli jej rodziny, wartości z backendu, stan z etykiety backendu', () => {
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    const wiersze = screen.getAllByTestId(`${TID}-wiersz`);
    expect(wiersze).toHaveLength(wynik.wiersze!.length);
    const wgFunkcji = new Map(wiersze.map((w) => [`${w.dataset.urzadzenie}::${w.dataset.funkcja}`, w]));
    for (const w of wynik.wiersze!) {
      const tr = wgFunkcji.get(`${w.urzadzenie_ref}::${w.funkcja_ref}`)!;
      expect(tr.dataset.status).toBe(w.stan);
      expect(tr.closest('[data-rodzina]')?.getAttribute('data-rodzina')).toBe(w.rodzina);
      for (const [klucz, k] of Object.entries(w.wartosci)) {
        const komorka = within(tr).getByTestId(`${TID}-${klucz}`);
        expect(komorka).toHaveTextContent(k.wartosc !== null ? formatWgJednostki(k.wartosc, k.jednostka) : (k.tekst ?? '—'));
        expect(komorka.dataset.spelnia).toBe(k.spelnia === null ? undefined : String(k.spelnia));
      }
      expect(within(tr).getByTestId(`${TID}-stan`)).toHaveTextContent(w.etykieta.etykieta_pl);
    }
  });

  it('szczegóły wiersza: wzory KaTeX z backendu, wymagania z podstawą, karty werdyktu kryteriów', async () => {
    const user = userEvent.setup();
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    const w = wynik.wiersze!.find((x) => x.wzory.length > 0 && Object.keys(x.wymagania).length > 0)!;
    const tr = screen
      .getAllByTestId(`${TID}-wiersz`)
      .find((e) => e.dataset.urzadzenie === w.urzadzenie_ref && e.dataset.funkcja === w.funkcja_ref)!;
    await user.click(within(tr).getByTestId(`${TID}-szczegoly-przelacz`));
    const szczegoly = screen.getByTestId(`${TID}-szczegoly`);
    const wzory = within(szczegoly).getByTestId(`${TID}-wzory`);
    expect(wzory.querySelectorAll('[data-latex]').length).toBe(w.wzory.length);
    const wymagania = within(szczegoly).getByTestId(`${TID}-wymagania`);
    for (const wym of Object.values(w.wymagania)) expect(wymagania).toHaveTextContent(wym.zrodlo_pl);
    const zFikstury = new Set([...wynik.oceny, ...wynik.uziemienia, ...wynik.odmowy].map((r) => r.ocena.kryterium_id));
    if (w.kryteria.some((k) => zFikstury.has(k))) {
      expect(within(szczegoly).getByTestId(`${TID}-karty`)).toBeInTheDocument();
    }
    await user.click(within(tr).getByTestId(`${TID}-szczegoly-przelacz`));
    expect(screen.queryByTestId(`${TID}-szczegoly`)).toBeNull();
  });

  it('uziemienia stacji: osobna sekcja, U_E i U_T w osobnych kolumnach, przypis raz pod tabelą', () => {
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    const sekcja = screen.getByTestId(`${TID}-uziemienia`);
    expect(sekcja).toHaveTextContent(T.uziemieniaTytul);
    expect(sekcja.getAttribute('data-rodzina')).toBeNull();
    // U_E i U_T — dwie osobne kolumny (dwa pojęcia, korekta właściciela 6).
    expect(sekcja.querySelector('th[data-kolumna="napiecie_uziomowe_v"]')).not.toBeNull();
    expect(sekcja.querySelector('th[data-kolumna="napiecie_dotykowe_v"]')).not.toBeNull();
    const wiersz = wynik.wiersze_uziemien![0];
    const tr = within(sekcja).getByTestId(`${TID}-uziemienia-wiersz`);
    expect(within(tr).getByTestId(`${TID}-uziemienia-napiecie_uziomowe_v`)).toHaveTextContent(
      formatWgJednostki(wiersz.napiecie_uziomowe_v, 'V'),
    );
    expect(within(tr).getByTestId(`${TID}-uziemienia-napiecie_dotykowe_v`)).toHaveTextContent('—');
    const przypisy = within(sekcja).getByTestId(`${TID}-uziemienia-przypisy`);
    const uzyte = new Set(
      Object.entries(wiersz.przypisy_kolumn)
        .filter(([kol]) => wiersz[kol as keyof typeof wiersz] === null)
        .map(([, p]) => p),
    );
    expect(przypisy.querySelectorAll('li')).toHaveLength(uzyte.size);
    for (const p of uzyte) expect(przypisy).toHaveTextContent(wynik.przypisy_uziemien![p]);
  });

  it('zawężenie do sterownika (karta nastaw): wyłącznie jego wiersze, bez paska sieci i uziemień', () => {
    const ref = wynik.wiersze![0].urzadzenie_ref;
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} urzadzenieRef={ref} bezNaglowka />);
    const wiersze = screen.getAllByTestId(`${TID}-wiersz`);
    expect(wiersze.every((w) => w.dataset.urzadzenie === ref)).toBe(true);
    expect(wiersze).toHaveLength(wynik.wiersze!.filter((w) => w.urzadzenie_ref === ref).length);
    expect(screen.queryByTestId(`${TID}-siec`)).toBeNull();
    expect(screen.queryByTestId(`${TID}-uziemienia`)).toBeNull();
  });
});

describe('wykres wskazowy 67N — parytet rysunku z werdyktem backendu', () => {
  const SRODEK_X = 150;
  const SRODEK_Y = 150;
  const PROMIEN = 120;
  const przypadki = Object.entries(WARIANTY).flatMap(([nazwa, wynik]) =>
    (wynik.wiersze ?? []).filter((w) => w.wykres_wskazowy).map((w) => [nazwa, w] as const),
  );

  it('fikstura niesie wiersze 67N z wykresem w obu wariantach sieci', () => {
    expect(new Set(przypadki.map(([n]) => n)).size).toBe(Object.keys(WARIANTY).length);
  });

  it.each(przypadki.map(([n, w], i) => [`${n} #${i}`, w] as const))('%s', async (_n, wiersz) => {
    const user = userEvent.setup();
    const wynik = { ...KOMPENSOWANY, wiersze: [wiersz] };
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    await user.click(screen.getByTestId(`${TID}-szczegoly-przelacz`));
    const w = wiersz.wykres_wskazowy!;
    const k = PROMIEN / w.skala_a;
    const wskazy = screen.getAllByTestId(`${TID}-wykres-wskaz`);
    expect(wskazy).toHaveLength(w.wskazy.length);
    // Próg narysowany w odległości I₀> od środka wzdłuż osi (tryb rzutu).
    const prog = screen.getByTestId(`${TID}-wykres-prog`);
    const p1x = (Number(prog.getAttribute('x1')) - SRODEK_X) / k;
    const p1y = (SRODEK_Y - Number(prog.getAttribute('y1'))) / k;
    expect(p1x * w.os[0] + p1y * w.os[1]).toBeCloseTo(w.prog_a, 6);
    for (const el of wskazy) {
      const dane = w.wskazy.find((x) => x.rola === el.dataset.rola)!;
      // Odczyt z RYSUNKU (piksele → ampery) i położenie względem narysowanego sektora i progu.
      const x = (Number(el.dataset.x) - SRODEK_X) / k;
      const y = (SRODEK_Y - Number(el.dataset.y)) / k;
      const cosKata = (x * w.os[0] + y * w.os[1]) / Math.hypot(x, y);
      const cosGranicy = w.granice[0][0] * w.os[0] + w.granice[0][1] * w.os[1];
      const warunek = (klucz: string) => dane.warunki.find((x2) => x2.klucz === klucz)!.spelniony;
      // Narysowany sektor φ_os ± Δφ = decyzja kierunkowa ∧ położenie w sektorze (lista backendu).
      expect(cosKata >= cosGranicy - 1e-9).toBe(warunek('KIERUNEK') && warunek('SEKTOR'));
      // Próg narysowany jako odcinek (tryb rzutu) = kryterium trybu; łuk (tryb sektorowy) —
      // moduł 3I₀ ≥ I₀> (pobudzenie).
      if (w.tryb === 'RZUT') {
        expect(x * w.os[0] + y * w.os[1] >= w.prog_a - 1e-9).toBe(warunek('TRYB'));
      } else {
        expect(Math.hypot(x, y) >= w.prog_a - 1e-9).toBe(warunek('PROG'));
      }
      expect(el.dataset.dziala).toBe(String(dane.dziala));
      expect(el).toHaveTextContent(formatWgJednostki(dane.modul_a, 'A'));
    }
  });
});

describe('wzory LaTeX backendu — składnia KaTeX', () => {
  it('każde pole `*_latex` fikstury składa się bez błędu (bez podwójnych indeksów)', () => {
    const wzory = new Set<string>();
    const zbierz = (o: unknown, klucz: string | null) => {
      if (typeof o === 'string') {
        if (klucz && /latex$/.test(klucz) && o) wzory.add(o);
      } else if (Array.isArray(o)) o.forEach((x) => zbierz(x, klucz));
      else if (o && typeof o === 'object') Object.entries(o).forEach(([kk, v]) => zbierz(v, kk));
    };
    zbierz(fikstura, null);
    expect(wzory.size).toBeGreaterThan(10);
    const bledy: string[] = [];
    for (const w of wzory) {
      try {
        katex.renderToString(w, { throwOnError: true, strict: 'error' });
      } catch (e) {
        bledy.push(`${w} → ${(e as Error).message}`);
      }
    }
    expect(bledy).toEqual([]);
  });
});

describe('źródła wymagań — ekran nie zmienia wartości ani stanu (wymaganie właściciela 3)', () => {
  it.each(Object.entries(WARIANTY))('%s: tabela źródeł = dane backendu', async (_n, wynik) => {
    const user = userEvent.setup();
    render(<TabelaOcenyZiemnozwarciowej wynik={wynik} />);
    const zrodla = screen.getByTestId(`${TID}-zrodla`);
    // Natywne rozwinięcie <details> klikiem w <summary>.
    await user.click(within(zrodla).getByText(T.ziemneZrodlaWymagan));
    const wiersze = within(zrodla).getAllByTestId(`${TID}-zrodlo`);
    expect(wiersze).toHaveLength(wynik.zrodla_wymagan!.length);
    wynik.zrodla_wymagan!.forEach((z, i) => {
      const el = wiersze[i];
      expect(el.dataset.klucz).toBe(z.klucz);
      expect(el.dataset.stan).toBe(z.stan);
      expect(el).toHaveTextContent(z.stan_pl);
      expect(el).toHaveTextContent(z.odwolanie_pl);
      if (z.wartosc !== null) expect(el).toHaveTextContent(formatWgJednostki(z.wartosc, z.jednostka));
    });
    // Stany ENEA / założenie / niezweryfikowane — wszystkie trzy obecne, bez scalania.
    expect(new Set(wiersze.map((w) => w.dataset.stan))).toEqual(
      new Set(['ENEA_ZWERYFIKOWANE', 'ZALOZENIE_INZYNIERSKIE', 'NIEZWERYFIKOWANE']),
    );
  });

  it('wymagania wiersza niosą stan backendu bez przemapowania', async () => {
    const user = userEvent.setup();
    const wiersz = KOMPENSOWANY.wiersze!.find((w) => w.kod === '51N' && Object.keys(w.wymagania).length > 0)!;
    render(<TabelaOcenyZiemnozwarciowej wynik={{ ...KOMPENSOWANY, wiersze: [wiersz] }} />);
    await user.click(screen.getByTestId(`${TID}-szczegoly-przelacz`));
    const pozycje = within(screen.getByTestId(`${TID}-wymagania`)).getAllByRole('listitem');
    const wymagania = Object.values(wiersz.wymagania);
    expect(pozycje).toHaveLength(wymagania.length);
    wymagania.forEach((w, i) => {
      expect(pozycje[i].dataset.stan).toBe(w.stan);
      expect(pozycje[i]).toHaveTextContent(w.stan_pl);
    });
  });
});
