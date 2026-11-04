/**
 * Rekord werdyktu zwijany (karta FIX-E2E-PELNE, decyzja architekta do sekcji aparatury):
 * wiersz pierwszego planu kontraktu werdyktu (§9) sam wyjaśnia werdykt, pełna karta po
 * rozwinięciu natywnym przyciskiem z `aria-expanded`.
 *
 * Iloczyn cech: status rekordu (wszystkie 7 statusów kontraktu) × stan {zwinięty, rozwinięty}
 * × sposób przełączenia {klik myszą, Enter, spacja}. Przypięte: wiersz zwinięty zawiera ocenę,
 * przedmiot, kryterium, wynik z jednostką, limit z podstawą i stanem źródła oraz margines;
 * startowo rozwinięte są wyłącznie NIE_SPELNIA i NIEJEDNOZNACZNY; literał statusu w źródle
 * komponentu występuje wyłącznie w definicji `STATUSY_ROZWINIETE` (status steruje zwinięciem,
 * nigdy tekstem ani kolorem).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { RekordWerdyktuZwijany, STATUSY_ROZWINIETE } from '../RekordWerdyktuZwijany';
import type { OcenaKryterium, StatusWerdyktu } from '../werdykt';

const STATUSY: readonly StatusWerdyktu[] = [
  'SPELNIA',
  'NIE_SPELNIA',
  'NIEJEDNOZNACZNY',
  'NIE_OCENIONO',
  'BRAK_PODSTAWY',
  'BRAK_DOWODU',
  'NIE_DOTYCZY',
];

const ID = 'aparatura.pole-1.dynamiczna';

function rekord(status: StatusWerdyktu): OcenaKryterium {
  return {
    kryterium_id: ID,
    przedmiot: { element_ref: null, nazwa_pl: 'Wyłącznik pola SN 1', opis_pl: 'aparat pola P-1' },
    kryterium: {
      opis_pl: 'Prąd udarowy nie przekracza prądu szczytowego wytrzymywanego aparatu',
      warunek_latex: 'i_p \\le I_{dyn}',
      relacja: 'NIE_WIECEJ',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    podstawa: {
      rodzaj: 'NORMA',
      dokument: 'IEC 62271-1',
      wydanie: '2017',
      jednostka_redakcyjna: '§ 4.6',
      status: 'WSKAZANE',
      uwagi_pl: null,
    },
    stosowalnosc: {
      typ_modulu: null,
      technologia: null,
      modul_istniejacy: null,
      dotyczy: true,
      powod_pl: 'aparat pola przewodzi prąd zwarcia',
      podstawa: null,
      warunek_wstepny_nieuruchomiony: false,
    },
    wynik: {
      wielkosc_pl: 'prąd udarowy',
      symbol_latex: 'i_p',
      wartosc: { wartosc: 20.02, jednostka: 'kA' },
      punkt_krytyczny_pl: 'szyna „Stacja S01”',
      chwila_s: null,
      metoda: 'OBLICZENIE',
    },
    limit: {
      wartosc: { wartosc: 50, jednostka: 'kA' },
      pasmo: null,
      obwiednia: null,
      jednostka_obwiedni: null,
      podstawa: {
        rodzaj: 'NORMA',
        dokument: 'IEC 62271-1',
        wydanie: '2017',
        jednostka_redakcyjna: 'IEC 62271-1:2017 p. 5.7',
        status: 'WSKAZANE',
        uwagi_pl: null,
      },
      zakres_stosowalnosci_pl: null,
      wersja_profilu: null,
    },
    margines: {
      wartosc: { wartosc: 29.98, jednostka: 'kA' },
      definicja_latex: 'm = x_{lim} - x',
      punkt_pl: null,
      skala: null,
      skala_rodzaj: null,
      wzgledny: null,
      niedefiniowalny: false,
      powod_pl: null,
    },
    niepewnosc: { wartosc: null, metoda_pl: null, nie_dotyczy: true, powod_pl: 'bez dyskretyzacji' },
    status_maszynowy: status,
    kompletnosc_dowodu: 'NIEPELNY',
    powody_niepelnosci: [],
    etykieta: { etykieta_pl: `Etykieta rekordu ${status}`, semantyka: 'neutralna' },
    wyjasnienie: {
      zdanie_pl: `Zdanie wyjaśnienia rekordu ${status} z backendu.`,
      przyczyna_pl: null,
      czego_brakuje: [],
      zastrzezenia: [],
    },
    dowod: {
      metoda: 'OBLICZENIE',
      poziom: 'UNVALIDATED_MODEL',
      rodzaj_twierdzenia: 'STATIC_CALCULATION',
      status_modelu: 'NIE_DOTYCZY',
      status_danych: { stan: 'ZWALIDOWANE', dane_przyjete: [] },
      odniesienie: 'zapisany bieg zwarciowy',
      w_domenie_walidacji: null,
      domena_pl: null,
    },
    zakres_waznosci: {
      rodzaj_analizy: 'SHORT_CIRCUIT',
      opis_pl: 'Zwarcie trójfazowe w punkcie zabudowy pola.',
      technologia: null,
      model_urzadzenia: null,
      symetria_zaklocenia: null,
      parametry_sieci: [],
      regulator: null,
      ograniczniki: [],
      wykluczenia: [],
    },
    slad: [],
  } as unknown as OcenaKryterium;
}

const T = `mvd-werdykt-zwijany-${ID}`;

function wierszPierwszegoPlanu(status: StatusWerdyktu): void {
  const wiersz = screen.getByTestId(T);
  expect(wiersz.getAttribute('data-status')).toBe(status);
  expect(screen.getByTestId(`${T}-ocena`).textContent).toBe(`Etykieta rekordu ${status}`);
  expect(screen.getByTestId(`${T}-przedmiot`).textContent).toContain('Wyłącznik pola SN 1');
  expect(screen.getByTestId(`${T}-kryterium`).textContent).toContain(
    'Prąd udarowy nie przekracza prądu szczytowego wytrzymywanego aparatu',
  );
  expect(within(screen.getByTestId(`${T}-kryterium`)).getAllByTestId('math-rendered').length).toBeGreaterThan(0);
  expect(screen.getByTestId(`${T}-wynik`).textContent).toMatch(/20,02\s*kA/);
  const limit = screen.getByTestId(`${T}-limit`).textContent ?? '';
  expect(limit).toMatch(/50\s*kA/);
  expect(limit).toContain('IEC 62271-1:2017 p. 5.7');
  expect(limit).toContain('wskazane');
  expect(screen.getByTestId(`${T}-margines`).textContent).toMatch(/\+29,98\s*kA/);
}

function stanRozwiniety(rozwiniety: boolean, status: StatusWerdyktu): void {
  const przelacz = screen.getByTestId(`${T}-przelacz`);
  expect(przelacz.getAttribute('aria-expanded')).toBe(String(rozwiniety));
  const karta = screen.queryByTestId(`${T}-karta`);
  if (rozwiniety) {
    expect(karta).not.toBeNull();
    expect(przelacz.getAttribute('aria-controls')).toBe(karta!.id);
    expect(karta!.textContent).toContain(`Zdanie wyjaśnienia rekordu ${status} z backendu.`);
  } else {
    expect(karta).toBeNull();
    expect(screen.getByTestId(T).textContent).not.toContain(`Zdanie wyjaśnienia rekordu ${status}`);
  }
}

describe('RekordWerdyktuZwijany — status × stan × sposób przełączenia', () => {
  it('startowo rozwinięte są wyłącznie NIE_SPELNIA i NIEJEDNOZNACZNY', () => {
    expect([...STATUSY_ROZWINIETE].sort()).toEqual(['NIEJEDNOZNACZNY', 'NIE_SPELNIA']);
  });

  for (const status of STATUSY) {
    const startowo = STATUSY_ROZWINIETE.has(status);
    for (const sposob of ['mysz', 'enter', 'spacja'] as const) {
      it(`${status}: start ${startowo ? 'rozwinięty' : 'zwinięty'} → ${sposob} → odwrotnie → ${sposob} → z powrotem; wiersz pierwszego planu zawsze kompletny`, async () => {
        const user = userEvent.setup();
        render(<RekordWerdyktuZwijany rekord={rekord(status)} />);
        wierszPierwszegoPlanu(status);
        stanRozwiniety(startowo, status);

        const przelacz = screen.getByTestId(`${T}-przelacz`);
        const przelaczRaz = async () => {
          if (sposob === 'mysz') {
            await user.click(przelacz);
          } else {
            przelacz.focus();
            await user.keyboard(sposob === 'enter' ? '{Enter}' : ' ');
          }
        };
        await przelaczRaz();
        stanRozwiniety(!startowo, status);
        wierszPierwszegoPlanu(status);
        await przelaczRaz();
        stanRozwiniety(startowo, status);
        wierszPierwszegoPlanu(status);
      });
    }
  }

  it('limit i margines bez wartości: wiersz mówi dlaczego, nie milczy', () => {
    const r = rekord('NIE_OCENIONO');
    render(
      <RekordWerdyktuZwijany
        rekord={{
          ...r,
          wynik: null,
          limit: null,
          margines: { ...r.margines!, wartosc: null, niedefiniowalny: true, powod_pl: 'brak prądu w punkcie zabudowy' },
        }}
      />,
    );
    expect(screen.getByTestId(`${T}-wynik`).textContent).toContain('nie wyznaczono');
    expect(screen.getByTestId(`${T}-limit`).textContent).toContain('brak limitu i jego podstawy');
    expect(screen.getByTestId(`${T}-margines`).textContent).toContain('niedefiniowalny — brak prądu w punkcie zabudowy');
  });

  it('literały statusu w źródle wyłącznie w STATUSY_ROZWINIETE; tekst i kolor tylko z rekordu', () => {
    const zrodlo = readFileSync(join(__dirname, '..', 'RekordWerdyktuZwijany.tsx'), 'utf-8');
    const definicja = /export const STATUSY_ROZWINIETE[^;]*;/.exec(zrodlo);
    expect(definicja).not.toBeNull();
    const poza = zrodlo.replace(definicja![0], '');
    for (const status of STATUSY) {
      expect(poza).not.toContain(`'${status}'`);
    }
    // status_maszynowy: tylko atrybut data-status, przekazanie do plakietki i stan startowy.
    expect(poza.match(/status_maszynowy/g)?.length).toBe(4);
    expect(poza).toContain('useState(STATUSY_ROZWINIETE.has(rekord.status_maszynowy))');
    expect(poza).toContain('SEMANTYKA_KOLOR[rekord.etykieta.semantyka]');
  });
});
