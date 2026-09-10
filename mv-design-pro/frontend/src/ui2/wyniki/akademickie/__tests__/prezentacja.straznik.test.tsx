/*
 * STRAŻNIK KLASY „kod produkcyjny na ekranie projektanta" (karta V126-JEZYK; po B-02
 * rozszerzony na WSZYSTKIE widoki okna: katalog kart, analiza A–G, wynik).
 *
 * DLACZEGO NIE WYSTARCZY GUARD NA ŹRÓDŁACH: `scripts/ui_production_codes_guard.py`
 * skanuje LITERAŁY w kodzie. Napisy ocenione przez właściciela na 0/10
 * (`modal_analysis.critical_mode.participating_buses[0]`, `l_index_per_bus[3].alert`,
 * `sanity.checks_total`, `gpz/8600…/section/001/bus_sn`, `{"smallest_eigenvalue":…}`)
 * powstawały W CZASIE DZIAŁANIA ze ścieżek kluczy odpowiedzi backendu — żaden literał
 * ich nie zawierał, więc guard był ślepy Z KONSTRUKCJI. Ten strażnik działa na
 * WYRENDEROWANYM ekranie, na REALNYCH odpowiedziach backendu: katalogu kart, gotowości
 * (fixtury sieci złotej) i wynikach solvera (`odpowiedziSolvera.json`).
 *
 * ZBIÓR RODZAJÓW WYPROWADZANY Z KONTRAKTU, nie wypisany ręcznie: iteruje po kluczach
 * `PREZENTACJA`; parytet z backendem pilnuje `backend/tests/ci/test_v126_rodzaje_parytet.py`.
 *
 * ZAKRES SKANOWANIA: cały ekran POZA jawnie oznaczonym blokiem audytowym
 * (`[data-mvd-zapis-techniczny]`) — tam nazwy pól kontraktu obliczeniowego są treścią
 * zamierzoną i tak podpisaną („Surowy zapis odpowiedzi solvera”). Kody warunków gotowości
 * żyją WYŁĄCZNIE w atrybucie `title` (materiał audytowy), nie w tekście.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { EkranAnalizAkademickich } from '../EkranAnalizAkademickich';
import { POWODY_NIEPREZENTOWANIA } from '../nieprezentowane';
import { PREZENTACJA } from '../prezentacja';
import { AKADEMICKIE_STRINGS as S } from '../strings';
import { CASE_ID, KATALOG, ODPOWIEDZI, migawkaSieciZlotej, ustawFetchV126 } from './atrapyV126';

const RODZAJE = Object.keys(PREZENTACJA);

// ---------------------------------------------------------------------------
// Reguły strażnika — wzorce kodu produkcyjnego w tekście widocznym na ekranie
// ---------------------------------------------------------------------------

interface Regula {
  readonly nazwa: string;
  readonly wzorzec: RegExp;
}

const REGULY: readonly Regula[] = [
  // `a.b`, `modal_analysis.critical_mode`, `sanity.checks_total`
  { nazwa: 'ścieżka klucza (kropka między identyfikatorami)', wzorzec: /[a-z][a-z0-9]*_?[a-z0-9]*\.[a-z][a-z0-9_]{2,}/ },
  // `l_index_per_bus[3]`, `participating_buses[0]`
  { nazwa: 'indeks tablicy w podpisie', wzorzec: /\w\[\d+\]/ },
  // `gpz/860003b4514aa388b39561d5005ce584/…`
  { nazwa: 'surowa referencja obiektu', wzorzec: /\w+\/[0-9a-f]{8,}/i },
  // `{"smallest_eigenvalue":0.998667}`
  { nazwa: 'surowy zapis JSON', wzorzec: /[{}]/ },
  // identyfikator maszynowy z podkreśleniem: `smallest_eigenvalue`, `checks_passed`, `bus_hv`
  { nazwa: 'identyfikator z podkreśleniem', wzorzec: /\b[a-z]{2,}_[a-z][a-z0-9_]*\b/ },
  // Anglicyzmy w interfejsie (zakaz K10, dyrektywa właściciela 2026-07-29; prompt B-02 §6).
  {
    nazwa: 'anglicyzm w interfejsie',
    wzorzec:
      /\b(committed|white\s?box|sanity|alert|checks?|hash|run|trace|proof|report|status|hosting|capacity|margin|verdict|settings|threshold|warning|error|loading|summary|backend|frontend|workflow|readiness|evidence|cockpit|PASS|WARN|FAIL)\b/i,
  },
];

/**
 * Wyjątki: napisy, które WOLNO pokazać mimo trafienia w regułę, bo są treścią
 * inżynierską, a nie kodem. Lista ZAMKNIĘTA i uzasadniona.
 */
const DOZWOLONE: readonly RegExp[] = [
  // Oznaczenia norm i metod (kropka jest częścią nazwy normy/wielkości).
  /PN-EN\s?\d+/,
  /IEEE\s?\d+/,
  /IEC\s?\d+/,
  // Identyfikatory techniczne przebiegu — jawnie podpisane po polsku
  // (Identyfikator przebiegu / Odcisk / Wersja solvera), pokazywane
  // w trybie eksperckim jako materiał audytowy.
  /^run-/,
  /^hash-/,
  /^proof:v126:/,
  /^report:v126:/,
  /^v126-/,
];

/** Czy napis wygląda na kod produkcyjny (po odjęciu dozwolonych wyjątków). */
export function znajdzKodProdukcyjny(tekst: string): Regula | null {
  const oczyszczony = DOZWOLONE.reduce((acc, wzorzec) => acc.replace(wzorzec, ''), tekst);
  return REGULY.find((regula) => regula.wzorzec.test(oczyszczony)) ?? null;
}

/** Zbiera tekst widoczny dla projektanta (z pominięciem zapisu technicznego). */
function tekstWidocznyDlaProjektanta(korzen: HTMLElement): string[] {
  const wynik: string[] = [];
  const odwiedz = (element: Element): void => {
    if (element.hasAttribute('data-mvd-zapis-techniczny')) return;
    element.childNodes.forEach((wezel) => {
      if (wezel.nodeType === Node.TEXT_NODE) {
        const tekst = (wezel.textContent ?? '').trim();
        if (tekst !== '') wynik.push(tekst);
        return;
      }
      if (wezel.nodeType === Node.ELEMENT_NODE) odwiedz(wezel as Element);
    });
  };
  odwiedz(korzen);
  return wynik;
}

function naruszenia(korzen: HTMLElement): string[] {
  return tekstWidocznyDlaProjektanta(korzen)
    .map((tekst) => ({ tekst, regula: znajdzKodProdukcyjny(tekst) }))
    .filter((pozycja) => pozycja.regula !== null)
    .map((pozycja) => `${pozycja.regula?.nazwa}: „${pozycja.tekst}”`);
}

beforeEach(() => {
  useAppStateStore.setState({ activeCaseId: CASE_ID });
  useSnapshotStore.setState({ snapshot: migawkaSieciZlotej() as never });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSnapshotStore.getState().reset();
});

/** Otwiera analizę (wejście trasowe) i uruchamia ją — gotowość potwierdzona jawną deklaracją atrapy. */
async function uruchomRodzaj(rodzaj: string): Promise<HTMLElement> {
  ustawFetchV126({ potwierdzone: [rodzaj], wynikZFixtury: true });
  render(<EkranAnalizAkademickich trybZaawansowania="expert" rodzajPoczatkowy={rodzaj as never} />);
  await waitFor(() => expect(screen.getByTestId('mvd-akad-uruchom')).toBeEnabled());
  fireEvent.click(screen.getByTestId('mvd-akad-uruchom'));
  await screen.findByTestId('mvd-akad-wyniki');
  return screen.getByTestId('mvd-akad-ekran');
}

// ---------------------------------------------------------------------------
// KONTROLA DODATNIA — dowód, że strażnik w ogóle coś widzi
// ---------------------------------------------------------------------------

describe('strażnik prezentacji — kontrola dodatnia reguł', () => {
  it('rozpoznaje dokładnie te napisy, które właściciel ocenił na 0/10', () => {
    const zrzuty = [
      'Pakiet analiz liczonych na committed modelu sieci',
      'Ślad WHITE BOX przebiegu',
      'modal_analysis.critical_mode.participating_buses[0]',
      'l_index_per_bus[3].alert',
      'sanity.checks_total',
      'smallest_eigenvalue',
      'checks_passed',
      'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn',
      '{"smallest_eigenvalue":0.998667}',
      'Brak danych uziomu stacji: rho1_ohm_m, length_m',
      'Wynik: PASS',
    ];
    zrzuty.forEach((napis) => {
      expect(znajdzKodProdukcyjny(napis), `napis powinien być wykryty: ${napis}`).not.toBeNull();
    });
  });

  it('nie zgłasza fałszywych alarmów na treści inżynierskiej', () => {
    const poprawne = [
      'Napięcie dotykowe rażeniowe',
      '250 % (dopuszczalne: 120 %)',
      'Kryterium oceny',
      'PN-EN 50160 · IEEE 519',
      'GPZ Zachód — szyny SN',
      'kryterium spełnione dla 2 z 2 węzłów',
      'GOTOWOŚĆ POTWIERDZONA',
      'ΔU ≤ granica przy prądzie rozruchowym k_LR·I_n',
      'Transformatory (S_n, u_k)',
    ];
    poprawne.forEach((napis) => {
      expect(znajdzKodProdukcyjny(napis), `fałszywy alarm na: ${napis}`).toBeNull();
    });
  });

  it('gdyby ekran wrócił do zrzutu słownika, strażnik zapala czerwień', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<span>modal_analysis.critical_mode.participating_buses[0]</span>'
      + '<span>gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn</span>';
    expect(naruszenia(div)).toHaveLength(2);
  });

  it('blok audytowy jest wyłączony ze skanu (i tylko on)', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<div data-mvd-zapis-techniczny="1"><span>sanity.checks_total</span></div>'
      + '<span>Wiarygodność wyniku</span>';
    expect(tekstWidocznyDlaProjektanta(div)).toEqual(['Wiarygodność wyniku']);
  });
});

// ---------------------------------------------------------------------------
// STRAŻNIK — katalog kart (B-02): treść kart i stan danych z backendu
// ---------------------------------------------------------------------------

describe('strażnik prezentacji — katalog kart na realnym katalogu i gotowości backendu', () => {
  it('katalog kart: żadna widoczna etykieta karty ani stan danych nie jest kodem produkcyjnym', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    await waitFor(() => expect(screen.getByTestId('mvd-akad-karta-uncertainty_sensitivity')).toHaveTextContent(S.stanDanychPotwierdzona));
    expect(naruszenia(screen.getByTestId('mvd-akad-ekran'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// STRAŻNIK — każdy rodzaj kontraktu: widok analizy A–G (przed biegiem) i wynik
// ---------------------------------------------------------------------------

describe('strażnik prezentacji — rodzaje prezentowane na realnych odpowiedziach', () => {
  it('fixtury pokrywają KOMPLET rodzajów kontraktu (prezentowane + wycofane)', () => {
    const wycofane = Object.keys(POWODY_NIEPREZENTOWANIA);
    expect([...RODZAJE, ...wycofane].sort()).toEqual(Object.keys(ODPOWIEDZI).sort());
    expect([...RODZAJE, ...wycofane].sort()).toEqual(KATALOG.map((k) => k.kod).sort());
    expect(RODZAJE.length).toBeGreaterThan(0);
  });

  RODZAJE.forEach((rodzaj) => {
    it(`«${rodzaj}» — widok analizy A–G (przedmiot, dane, gotowość, kryteria) bez kodu produkcyjnego`, async () => {
      ustawFetchV126();
      render(<EkranAnalizAkademickich trybZaawansowania="expert" rodzajPoczatkowy={rodzaj as never} />);
      await screen.findByTestId('mvd-akad-uruchomienie');
      await waitFor(() => expect(screen.getByTestId('mvd-akad-gotowosc')).toHaveAttribute('data-gotowosc', expect.stringMatching(/POTWIERDZONA|NIEPOTWIERDZONA/)));
      await waitFor(() => expect(screen.getByTestId('mvd-akad-przedmiot')).toHaveTextContent('CGMES Golden Net'));
      expect(naruszenia(screen.getByTestId('mvd-akad-ekran')), `rodzaj ${rodzaj}`).toEqual([]);
    });
  });

  RODZAJE.forEach((rodzaj) => {
    it(`«${rodzaj}» — po biegu żadna widoczna etykieta ani wartość nie jest kodem produkcyjnym`, async () => {
      const ekran = await uruchomRodzaj(rodzaj);
      expect(naruszenia(ekran), `rodzaj ${rodzaj}`).toEqual([]);
    });
  });

  RODZAJE.forEach((rodzaj) => {
    it(`«${rodzaj}» — ekran odpowiada na pytanie inżynierskie: pytanie z karty, wynik oceny, podstawa z karty, następny krok`, async () => {
      const ekran = await uruchomRodzaj(rodzaj);
      const karta = KATALOG.find((k) => k.kod === rodzaj)!;
      const projekt = PREZENTACJA[rodzaj as keyof typeof PREZENTACJA];
      expect(screen.getByTestId('mvd-akad-pytanie')).toHaveTextContent(karta.pytanie_pl.slice(0, 40));
      expect(screen.getByTestId('mvd-akad-werdykt-chip')).toBeInTheDocument();
      const werdykt = screen.getByTestId('mvd-akad-werdykt');
      if (karta.podstawa_oceny.length > 0) {
        expect(werdykt).toHaveTextContent(karta.podstawa_oceny[0].zrodlo_pl.slice(0, 30));
      } else {
        expect(werdykt).toHaveTextContent(S.kryteriaBrakTytul);
      }
      expect(screen.getByTestId('mvd-akad-nastepny-krok')).toHaveTextContent(projekt.nastepnyKrok.slice(0, 40));
      expect(ekran).toBeInTheDocument();
    });
  });

  it('zapis techniczny jest ZWINIĘTY — pola kontraktu nie wchodzą na ekran same z siebie', async () => {
    const grupa = Object.keys(ODPOWIEDZI.reliability_contingency)[0];
    expect(grupa, 'fixtura odpowiedzi bez grup — parser nośnika do poprawy').toBeTruthy();
    await uruchomRodzaj('reliability_contingency');
    expect(screen.queryByTestId(`mvd-akad-grupa-${grupa}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-akad-wynik-przelacz'));
    await waitFor(() => expect(screen.getByTestId(`mvd-akad-grupa-${grupa}`)).toBeInTheDocument());
  });

  it('obiekty nazwane jak na schemacie — surowa referencja nie dociera do tabeli', async () => {
    await uruchomRodzaj('power_quality_harmonics');
    const tabela = screen.getByTestId('mvd-akad-obiekty-nodes');
    expect(tabela).toHaveTextContent('GPZ Zachód');
    expect(tabela).toHaveTextContent('Stacja SN/nN Ogrodowa');
    expect(tabela.textContent ?? '').not.toContain('860003b4514aa388b39561d5005ce584');
  });

  it('sekcja bez treści NIE ma przycisku „Pokaż…” (zero martwych klików)', async () => {
    await uruchomRodzaj('reliability_contingency');
    for (const sekcja of ['mvd-akad-slad', 'mvd-akad-dowod', 'mvd-akad-raport', 'mvd-akad-wynik']) {
      const pusty = screen.queryByTestId(`${sekcja}-pusty`);
      const przelacz = screen.queryByTestId(`${sekcja}-przelacz`);
      expect((pusty === null) !== (przelacz === null), `sekcja ${sekcja}: stan zerowy i przycisk nie mogą współistnieć ani znikać razem`).toBe(true);
    }
    expect(screen.getByTestId('mvd-akad-wynik-przelacz')).toBeInTheDocument();
  });

  it('świeżość NIE mówi „brak wyników” przy zakończonym przebiegu (para predykatów)', async () => {
    const ekran = await uruchomRodzaj('earthing_safety');
    expect(screen.getByTestId('mvd-akad-przebieg')).toHaveTextContent('zakończony');
    expect(screen.getByTestId('mvd-akad-swiezosc').textContent ?? '').not.toContain('brak wyników');
    expect(ekran).toBeInTheDocument();
  });

  it('świeżość mówi „brak wyników” DOPÓKI przebiegu nie ma (kontrola dodatnia pary)', async () => {
    ustawFetchV126();
    render(<EkranAnalizAkademickich trybZaawansowania="expert" />);
    await screen.findByTestId('mvd-akad-katalog-kart');
    expect(screen.getByTestId('mvd-akad-swiezosc')).toHaveTextContent('brak wyników');
  });

  it('zapis techniczny NIE jest pierwszą sekcją ekranu i startuje zwinięty', async () => {
    const ekran = await uruchomRodzaj('reliability_contingency');
    const sekcje = Array.from(ekran.querySelectorAll('[data-testid^="mvd-akad-"]'))
      .map((element) => element.getAttribute('data-testid'))
      .filter((id): id is string => id !== null);
    const pozycjaZapisu = sekcje.indexOf('mvd-akad-wynik');
    const pozycjaWerdyktu = sekcje.indexOf('mvd-akad-werdykt');
    expect(pozycjaWerdyktu).toBeGreaterThanOrEqual(0);
    expect(pozycjaZapisu).toBeGreaterThan(pozycjaWerdyktu);
    expect(ekran.querySelector('[data-mvd-zapis-techniczny]')).toBeNull();
  });

  it('obiekt spoza migawki dostaje uczciwą etykietę zapasową, nie zmyśloną nazwę', async () => {
    useSnapshotStore.getState().reset();
    await uruchomRodzaj('power_quality_harmonics');
    const tabela = screen.getByTestId('mvd-akad-obiekty-nodes');
    expect(tabela).toHaveTextContent('GPZ · sekcja 001 · szyna SN');
    expect(tabela.textContent ?? '').not.toContain('860003b4514aa388b39561d5005ce584');
  });

  it('detekcja doziemień: metoda z uzasadnieniem renderowana, trzy nastawy NIE — z powodem (karta W2 pkt 5)', async () => {
    const fixtura = ODPOWIEDZI.earth_fault_detection as Record<string, unknown>;
    expect(fixtura.settings, 'fixtura bez settings — test straciłby sens').toBeTruthy();
    const ekran = await uruchomRodzaj('earth_fault_detection');
    expect(ekran).toHaveTextContent('Sposób uziemienia punktu neutralnego');
    expect(ekran).toHaveTextContent('Metoda zalecana');
    expect(ekran).toHaveTextContent('Metoda alternatywna');
    expect(screen.queryByText('Nastawa rozruchowa napięcia zerowego')).not.toBeInTheDocument();
    expect(screen.queryByText('Nastawa mocy czynnej zerowej')).not.toBeInTheDocument();
    expect(screen.queryByText('Krotność rozruchu 5. harmonicznej')).not.toBeInTheDocument();
    expect(screen.queryByText('5,0000 %')).not.toBeInTheDocument();
    const pominiete = screen.getByTestId('mvd-akad-wielkosci-pominiete');
    expect(pominiete).toHaveTextContent('Nastawy nie są prezentowane: solver nie ma dla nich udokumentowanej podstawy');
    expect(pominiete).toHaveTextContent('wymagane wymaganie OSD albo karta przekaźnika');
  });
});
