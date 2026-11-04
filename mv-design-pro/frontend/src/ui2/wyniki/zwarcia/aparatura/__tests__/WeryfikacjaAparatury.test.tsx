/**
 * Testy ogniwa „wynik zwarciowy → wytrzymałość aparatury pól stacji" (karty KD-4, KD-6,
 * prezentacja tabelaryczna — karta APARATURA-TABELA).
 *
 * INTENCJA:
 *  1. do końcówki jedzie STACJA i ZAPISANY BIEG (karta WYTRZYMALOSC-PRAD-POLA) — prąd
 *     każdego pola backend bierze z wiersza biegu dla punktu zabudowy pola; ekran nie
 *     wysyła ani nie pokazuje prądów wybranego punktu,
 *  2. jedno pole = jeden wiersz tabeli; natywny przełącznik (klik w wiersz, Enter, spacja,
 *     `aria-expanded`) rozwija porównanie Parametr | Obliczony | Aparat | Zapas,
 *  3. ILOCZYN CECH: {prądy pól jednakowe · różne} × {czas wyłączenia ustalony · nieustalony}
 *     × {zapas dodatni · ujemny · brak · nie dotyczy} — prądy wspólne nad tabelą wyłącznie przy
 *     równych wartościach backendu, każda liczba z rekordu TEGO pola (nigdy kopia pola 1),
 *     kolor wyłącznie przy komórce wymagającej uwagi,
 *  4. widok pola (karta KD6-SZCZEGOLY, dyrektywa właściciela 2026-11-04, V12K-353): tabela
 *     kryteriów, czas t_zab + t_wył = T_k pod nią i domyślnie zwinięte wyprowadzenie (dane
 *     wejściowe → wzory → podstawienia → wyniki pośrednie → wynik końcowy); BRAK niepewności,
 *     kompletności i jakości dowodu, etykiet statusu i karty werdyktu — w żadnym polu i przy
 *     żadnym wariancie czasu (test negatywny); każda informacja raz,
 *  5. „Parametry aparatu” — jeden przycisk na pole z modelu, ta sama operacja kreatora,
 *  6. uczciwe stany zerowe (brak biegu / punkt poza stacją / brak aparatury) nie udają
 *     werdyktu negatywnego.
 * Kliki natywne (userEvent) — Zero-Debt pkt 5.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { shortCircuitRowFixture } from '../../__tests__/fixtures';
import { pradyJednakowe, WeryfikacjaAparatury } from '../WeryfikacjaAparatury';
import {
  ocenaRodzaju,
  znacznikWerdyktu,
  type PoleWytrzymalosci,
  type RodzajKryteriumAparatu,
  type WartoscParametruAparatu,
} from '../api';
import { nazwaStacji, powodBrakuPodstawy, stacjeDlaPunktu } from '../model';
import type { OcenaKryterium } from '../../../wzorzec/werdykt';

const STACJA = 'stn/abc/station';
const BIEG = 'bieg-zwarciowy-1';

const PODSTAWA = {
  rodzaj: 'NORMA',
  dokument: 'IEC 62271-1',
  wydanie: '2007',
  jednostka_redakcyjna: '§ 4.6',
  status: 'WSKAZANE',
  uwagi_pl: null,
};

interface LiczbyRekordu {
  /** Pole, do którego należy rekord (identyfikator `aparatura.{pole_ref}.{aparat}.{rodzaj}`). */
  readonly poleRef?: string;
  readonly wynik?: number | null;
  readonly limit?: number | null;
  /** `undefined` = margines liczbowy wynik/limit z argumentów; `null` = margines nieokreślony. */
  readonly margines?: number | null;
  readonly dotyczy?: boolean;
}

const WARUNEK: Readonly<Record<RodzajKryteriumAparatu, string>> = {
  dynamiczna: 'i_p \\le I_{dyn}',
  cieplna: 'I_{th} \\le I_{thr}',
  wylaczanie: 'I_b \\le I_{sc}',
};

/** Rekord K (kształt `model_dump` backendu) z liczbami wyniku, limitu i marginesu. */
function ocenaK(
  rodzaj: RodzajKryteriumAparatu,
  status: OcenaKryterium['status_maszynowy'],
  liczby: LiczbyRekordu = {},
): OcenaKryterium {
  const poleRef = liczby.poleRef ?? 'field/x/in';
  const wynik = liczby.wynik ?? null;
  const limit = liczby.limit ?? null;
  const margines = liczby.margines;
  const dotyczy = liczby.dotyczy ?? true;
  return {
    kryterium_id: `aparatura.${poleRef}.aparat/01.${rodzaj}`,
    przedmiot: { element_ref: 'aparat/01', nazwa_pl: 'Aparat pola SN 1', opis_pl: 'aparat pola P-1' },
    kryterium: {
      opis_pl: `Kryterium ${rodzaj} z backendu`,
      warunek_latex: WARUNEK[rodzaj],
      relacja: 'NIE_WIECEJ',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    // Podstawa rekordu (wydanie 2017) celowo inna niż podstawa limitu (2007): widok pokazuje
    // wyłącznie podstawę z rekordu limitu (dyrektywa 2026-11-04 pkt 4).
    podstawa: { ...PODSTAWA, wydanie: '2017' },
    stosowalnosc: {
      typ_modulu: null,
      technologia: null,
      modul_istniejacy: null,
      dotyczy,
      powod_pl: dotyczy ? 'aparat pola przewodzi prąd zwarcia' : `kryterium ${rodzaj} nie dotyczy aparatu`,
      podstawa: null,
      warunek_wstepny_nieuruchomiony: false,
    },
    wynik:
      wynik === null
        ? null
        : {
            wielkosc_pl: 'prąd',
            symbol_latex: 'I',
            wartosc: { wartosc: wynik, jednostka: 'kA' },
            punkt_krytyczny_pl: null,
            chwila_s: null,
            metoda: 'OBLICZENIE',
          },
    limit:
      limit === null
        ? null
        : {
            wartosc: { wartosc: limit, jednostka: 'kA' },
            pasmo: null,
            obwiednia: null,
            jednostka_obwiedni: null,
            podstawa: PODSTAWA,
            zakres_stosowalnosci_pl: null,
            wersja_profilu: null,
          },
    margines:
      margines === undefined && wynik !== null && limit !== null
        ? {
            wartosc: { wartosc: limit - wynik, jednostka: 'kA' },
            definicja_latex: 'I_{lim} - I',
            punkt_pl: null,
            skala: null,
            skala_rodzaj: null,
            wzgledny: null,
            niedefiniowalny: false,
            powod_pl: null,
          }
        : margines === null || margines === undefined
          ? {
              wartosc: null,
              definicja_latex: null,
              punkt_pl: null,
              skala: null,
              skala_rodzaj: null,
              wzgledny: null,
              niedefiniowalny: true,
              powod_pl: `zapas ${rodzaj} nieokreślony — powód z backendu`,
            }
          : {
              wartosc: { wartosc: margines, jednostka: 'kA' },
              definicja_latex: 'I_{lim} - I',
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
    powody_niepelnosci: ['parametr aparatu jest wartością roboczą'],
    etykieta: {
      etykieta_pl: 'Kryterium spełnione — dowód niepełny',
      semantyka: 'ostrzegawcza',
    },
    wyjasnienie: {
      zdanie_pl: `Zdanie wyjaśnienia kryterium ${rodzaj} z backendu.`,
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
      odniesienie: `zapisany bieg zwarciowy ${BIEG}`,
      w_domenie_walidacji: null,
      domena_pl: null,
    },
    zakres_waznosci: {
      rodzaj_analizy: 'SHORT_CIRCUIT',
      opis_pl: 'Zwarcie trójfazowe w punkcie zabudowy pola wg zapisanego biegu IEC 60909.',
      technologia: null,
      model_urzadzenia: null,
      symetria_zaklocenia: null,
      parametry_sieci: [],
      regulator: null,
      ograniczniki: [],
      wykluczenia: ['zwarcia niesymetryczne (osobny tor biegu)'],
    },
    slad: [
      {
        run_id: BIEG,
        wersja_silnika: null,
        krok: `aparatura.${poleRef}.aparat/01:${rodzaj}`,
        opis_pl: 'wiersz biegu, punkt: szyna „Szyna pola P-1”',
      },
    ],
  } as unknown as OcenaKryterium;
}

/** Rekordy pola 1 z przykładu właściciela: 20,02/50/+29,98 · 9,17/20/+10,83 · 9,09/20/+10,91. */
function ocenyPola1(poleRef = 'field/x/in'): OcenaKryterium[] {
  return [
    ocenaK('dynamiczna', 'SPELNIA', { poleRef, wynik: 20.02, limit: 50, margines: 29.98 }),
    ocenaK('cieplna', 'SPELNIA', { poleRef, wynik: 9.17, limit: 20, margines: 10.83 }),
    ocenaK('wylaczanie', 'SPELNIA', { poleRef, wynik: 9.09, limit: 20, margines: 10.91 }),
  ];
}

function snapshotZeStacja(busRef: string): EnergyNetworkModel {
  return {
    header: { name: 'Sieć', revision: 1, hash_sha256: 'abc' },
    buses: [], branches: [], transformers: [], sources: [], generators: [], loads: [],
    substations: [
      { id: STACJA, ref_id: STACJA, name: 'Stacja 1', tags: [], meta: {}, bus_refs: [busRef] },
    ],
    bays: [], junctions: [], corridors: [], measurements: [], protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

/** Rozstrzygnięty parametr aparatu (kształt `WartoscRozstrzygnieta.to_dict()` backendu). */
function parametr(
  nazwa: string,
  nazwaPl: string,
  wartosc: number | null,
  jednostka: string,
  pochodzenie: WartoscParametruAparatu['pochodzenie'],
  dodatki: Partial<WartoscParametruAparatu> = {},
): WartoscParametruAparatu {
  const robocza = pochodzenie === 'PROPOZYCJA' || pochodzenie === 'PROJEKTANT';
  return {
    parametr: nazwa,
    nazwa_pl: nazwaPl,
    wartosc,
    jednostka,
    pochodzenie,
    pochodzenie_karty: pochodzenie === 'KATALOG' ? 'producent' : null,
    wartosc_robocza: robocza,
    propozycja: null,
    powod_projektanta_pl: null,
    powod_braku_pl: null,
    opis_zrodla_pl: robocza ? `wartość robocza: opis źródła ${nazwa}` : 'dana karty katalogowej (producent)',
    ...dodatki,
  };
}

const CZAS_WLASNY_PROPOZYCJA = parametr(
  'break_time_s',
  'czas własny wyłączania wyłącznika',
  0.06,
  's',
  'PROPOZYCJA',
  {
    opis_zrodla_pl:
      'wartość robocza (profil typowy urządzenia): profil typowy wyłącznika próżniowego SN. '
      + 'Wpływ: czas wyłączenia zwarcia zawiera wartość typową zamiast danej producenta.',
  },
);

interface ZadanieWytrzymalosci {
  readonly station_ref: string;
  readonly short_circuit_run_id: string;
}

/** Wiersz odpowiedzi backendu — kształt 1:1 z widokiem wytrzymałości. */
function poleOdpowiedzi(nadpisania: Partial<PoleWytrzymalosci>): PoleWytrzymalosci {
  return {
    pole: 'P-1',
    pole_ref: 'field/x/in',
    rola: 'IN',
    rola_pl: 'liniowe dopływowe',
    zrodlo: 'model',
    aparat_ref: 'aparat/01',
    aparat_nazwa: 'Aparat pola SN 1',
    aparat_catalog_ref: 'sw-cb-abb-vd4-12kv-630a',
    aparat_etykieta: 'ABB VD4 12 kV 630 A',
    znamiona: {
      i_dyn_ka: 50,
      i_dyn_pochodzenie: 'wartosc_robocza',
      i_th_ka: 20,
      i_th_duration_s: 1,
      i_th_pochodzenie: 'producent',
      i_cu_ka: 20,
      i_cu_pochodzenie: 'producent',
      i_cu_nie_dotyczy: false,
      bezpiecznik: false,
      i_th_duration_pochodzenie: 'producent',
      wartosci: {
        i_th_ka: parametr('i_th_ka', 'prąd krótkotrwały wytrzymywany', 20, 'kA', 'KATALOG'),
        i_th_duration_s: parametr('i_th_duration_s', 'znamionowy czas trwania zwarcia', 1, 's', 'KATALOG'),
        i_dyn_ka: parametr('i_dyn_ka', 'prąd szczytowy wytrzymywany', 50, 'kA', 'PROPOZYCJA'),
      },
    },
    prady_pola: {
      punkt_ref: 'EL-GPZ',
      punkt_nazwa: 'Szyna pola P-1',
      ik_ka: 9.09,
      ip_ka: 20.02,
      ith_ka: 9.17,
      ib_ka: 9.09,
      i_dc_ka: 4.3,
      tb_s: 0.36,
      tb_zrodlo: { opis_pl: 'tb punktu: najkrótszy czas wyłączenia pól lokalnych szyny (pole P-1).' },
      un_kv: 15,
      kody_gotowosci: [],
      powod_pl: null,
    },
    oceny: ocenyPola1(),
    czas_wylaczenia: {
      t_clearing_s: 0.5,
      zrodlo: 'nastawy_pola',
      powod_pl: 'Czas z nastaw pola.',
      czlon_nastawczy_s: 0.44,
      czas_wlasny_wylacznika_s: 0.06,
      czas_wlasny: null,
      zalozenia_pl: [],
      kody_gotowosci: [],
    },
    werdykt: {
      ok: true,
      i_dyn_ok: true,
      i_th_ok: true,
      message_pl: 'OK: aparatura wytrzymała.',
      utilization_dyn_percent: 50,
      utilization_th_percent: 50,
      i_th_effective_ka: 28,
    },
    komunikat_pl: 'OK: aparatura wytrzymała.',
    kody_gotowosci: [],
    ...nadpisania,
  };
}

/** Atrapa backendu: JEDNA końcówka werdyktów wytrzymałości pól stacji. */
function zamontujBackend(pola: readonly PoleWytrzymalosci[]): ZadanieWytrzymalosci[] {
  const zadania: ZadanieWytrzymalosci[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/enm/wytrzymalosc-aparatury')) {
        zadania.push(JSON.parse(String(init?.body)) as ZadanieWytrzymalosci);
        return new Response(
          JSON.stringify({
            stacja_ref: STACJA,
            stacja_nazwa: 'Stacja 1',
            status: pola.length > 0 ? 'OK' : 'brak danych',
            bieg_zwarciowy_ref: BIEG,
            pola,
            kody_gotowosci: pola.length > 0 ? [] : ['aparatura.brak_pol_z_aparatem'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return zadania;
}

type Uzytkownik = ReturnType<typeof userEvent.setup>;

/** Render sekcji i natywny klik „Sprawdź” — zwraca tabelę pól. */
async function sprawdz(
  user: Uzytkownik,
  props: Partial<Parameters<typeof WeryfikacjaAparatury>[0]> = {},
): Promise<HTMLElement> {
  render(
    <WeryfikacjaAparatury
      wiersz={shortCircuitRowFixture()}
      runId={BIEG}
      {...props}
    />,
  );
  await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));
  return screen.findByTestId('mvd-zwarcia-aparatura-werdykty');
}

async function rozwin(user: Uzytkownik, pole: string): Promise<void> {
  await user.click(screen.getByTestId(`mvd-zwarcia-aparatura-rozwin-${pole}`));
}

async function pokazSzczegoly(user: Uzytkownik, pole: string): Promise<HTMLElement> {
  await rozwin(user, pole);
  await user.click(screen.getByTestId(`mvd-zwarcia-aparatura-szczegoly-przelacz-${pole}`));
  return screen.getByTestId(`mvd-zwarcia-aparatura-szczegoly-${pole}`);
}

const tekst = (testId: string): string => screen.getByTestId(testId).textContent ?? '';
const uwaga = (testId: string): string | null => screen.getByTestId(testId).getAttribute('data-uwaga');

/** Drugie pole z WŁASNYMI liczbami (inne niż pole 1 — wykrywa kopię pola 1). */
function pole2(opcje: {
  readonly prady: 'rowne' | 'rozne';
  readonly czas: 'ustalony' | 'nieustalony';
  readonly zapas: 'dodatni' | 'ujemny' | 'brak' | 'nie_dotyczy';
}): PoleWytrzymalosci {
  const bazowe = poleOdpowiedzi({});
  const poleRef = 'field/y/out';
  const cieplna =
    opcje.zapas === 'dodatni'
      ? ocenaK('cieplna', 'SPELNIA', { poleRef, wynik: 12.34, limit: 16, margines: 3.66 })
      : opcje.zapas === 'ujemny'
        ? ocenaK('cieplna', 'NIE_SPELNIA', { poleRef, wynik: 17.5, limit: 16, margines: -1.5 })
        : opcje.zapas === 'brak'
          ? ocenaK('cieplna', 'NIE_OCENIONO', { poleRef, wynik: null, limit: 16, margines: null })
          : ocenaK('cieplna', 'NIE_DOTYCZY', { poleRef, dotyczy: false, margines: null });
  return poleOdpowiedzi({
    pole: 'P-2',
    pole_ref: poleRef,
    aparat_ref: 'aparat/02',
    aparat_nazwa: 'Aparat pola SN 2',
    aparat_etykieta: 'Siemens 3AH 24 kV',
    prady_pola:
      opcje.prady === 'rowne'
        ? bazowe.prady_pola
        : { ...bazowe.prady_pola, punkt_nazwa: 'Szyna pola P-2', ip_ka: 31.25, ith_ka: 12.34, ib_ka: 11.07 },
    oceny: [
      ocenaK('dynamiczna', 'SPELNIA', { poleRef, wynik: 31.25, limit: 40, margines: 8.75 }),
      cieplna,
      ocenaK('wylaczanie', 'SPELNIA', { poleRef, wynik: 11.07, limit: 16, margines: 4.93 }),
    ],
    czas_wylaczenia: {
      ...bazowe.czas_wylaczenia,
      t_clearing_s: opcje.czas === 'ustalony' ? 0.65 : null,
      zrodlo: opcje.czas === 'ustalony' ? 'nastawy_pola' : null,
      powod_pl:
        opcje.czas === 'ustalony'
          ? 'Czas z nastaw pola P-2.'
          : 'Pole nie ma zabezpieczenia z nastawą — czasu wyłączenia nie ustalono.',
    },
  });
}

describe('WeryfikacjaAparatury — tabela pól stacji', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectId: 'projekt-testowy', activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('EL-GPZ') });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('STACJA I ZAPISANY BIEG jadą do końcówki; prądy pola z backendu, nie z punktu', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);
    // Prądy wybranego punktu są INNE niż prądy pola — ekran nie może ich wysłać ani pokazać.
    const wiersz = shortCircuitRowFixture({ ip_ka: 99.9, ith_ka: 88.8, ik_ka: 77.7 });

    await sprawdz(user, { wiersz });
    await waitFor(() => expect(zadania).toHaveLength(1));
    expect(zadania[0]).toEqual({ station_ref: STACJA, short_circuit_run_id: BIEG });

    const pole = screen.getByTestId('mvd-zwarcia-aparatura-pole-P-1');
    expect(pole.getAttribute('data-withstand-ok')).toBe('true');
    expect(pole.getAttribute('data-zrodlo')).toBe('model');
    expect(pole.textContent).toContain('ABB VD4 12 kV 630 A');
    expect(document.body.textContent).not.toContain('99,9');

    const szczegoly = await pokazSzczegoly(user, 'P-1');
    // Intencja przepisana (KD6-SZCZEGOLY pkt 4): komunikat słowny backendu powtarzał liczby
    // tabeli, więc szczegóły go nie cytują; prezentacja nadal niczego nie układa sama.
    expect(szczegoly.textContent).not.toContain('OK: aparatura wytrzymała.');
    expect(tekst('mvd-zwarcia-aparatura-zrodlo-P-1')).toContain('aparat z modelu');
    const prady = screen.getByTestId('mvd-zwarcia-aparatura-prady-P-1');
    expect(prady.getAttribute('data-punkt-ref')).toBe('EL-GPZ');
    expect(prady.textContent).toContain('Szyna pola P-1');
    expect(tekst('mvd-zwarcia-aparatura-ik-P-1')).toBe('9,09');
  });

  // Nagłówek nazywa stację pól (prądy pól z ich punktów zabudowy, nie z wybranej szyny nN);
  // zdanie „Wybrany punkt zwarcia… wskazuje stację” usunięte (KD6-SZCZEGOLY) — nagłówek wystarcza.
  it('NAGŁÓWEK nazywa stację pól; bez zdania o wybranym punkcie', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    await sprawdz(user);

    expect(tekst('mvd-zwarcia-aparatura-tytul')).toContain('Stacja 1');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-punkt')).toBeNull();
    expect(screen.getByTestId('mvd-zwarcia-aparatura').textContent).not.toContain('wskazuje stację');
  });

  it('PRZYKŁAD WŁAŚCICIELA pola 1: 20,02 / 50 / +29,98 · 9,17 / 20 / +10,83 · 9,09 / 20 / +10,91', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    await sprawdz(user);
    await rozwin(user, 'P-1');

    const oczekiwane = [
      ['dynamiczna', '20,02', '50', '+29,98'],
      ['cieplna', '9,17', '20', '+10,83'],
      ['wylaczanie', '9,09', '20', '+10,91'],
    ] as const;
    for (const [rodzaj, obliczony, aparat, zapas] of oczekiwane) {
      expect(tekst(`mvd-zwarcia-aparatura-obliczony-P-1-${rodzaj}`)).toBe(obliczony);
      expect(tekst(`mvd-zwarcia-aparatura-aparat-P-1-${rodzaj}`)).toBe(aparat);
      expect(tekst(`mvd-zwarcia-aparatura-zapas-P-1-${rodzaj}`)).toBe(zapas);
      expect(tekst(`mvd-zwarcia-aparatura-zapas-wiersz-P-1-${rodzaj}`)).toBe(zapas);
      expect(uwaga(`mvd-zwarcia-aparatura-zapas-P-1-${rodzaj}`)).toBeNull();
    }
    // Pod tabelą czas wyłączenia t_zab + t_wył = T_k z członów backendu (3 miejsca).
    expect(tekst('mvd-zwarcia-aparatura-tzab-P-1')).toBe('0,440');
    expect(tekst('mvd-zwarcia-aparatura-twyl-P-1')).toBe('0,060');
    expect(tekst('mvd-zwarcia-aparatura-tk-P-1')).toBe('0,500');
    // Szczegóły obliczeń domyślnie zwinięte.
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-szczegoly-P-1')).toBeNull()
    // Warunek z `*_latex` rekordu przez MathRenderer (KaTeX), nie jako tekst ASCII.
    const kryterium = screen.getByTestId('mvd-zwarcia-aparatura-kryterium-P-1-wylaczanie');
    expect(kryterium.querySelector('.katex')).not.toBeNull();
    // Jednostki w nagłówkach kolumn, nie w komórkach; symbole prądów i czasu jako wzory.
    const tabela = screen.getByTestId('mvd-zwarcia-aparatura-werdykty');
    const porownanie = screen.getByTestId('mvd-zwarcia-aparatura-porownanie-P-1');
    expect(within(porownanie).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Kryterium',
      'Prąd obliczony [kA]',
      'Wartość znamionowa [kA]',
      'Zapas [kA]',
    ]);
    const naglowkiTabeli = [...tabela.querySelectorAll(':scope > thead th')];
    expect(naglowkiTabeli.map((th) => th.textContent).slice(-3)).toEqual([
      'Zapas dynamiczny [kA]',
      'Zapas cieplny [kA]',
      'Zapas wyłączalny [kA]',
    ]);
    expect(naglowkiTabeli[2].querySelector('.katex')).not.toBeNull();
    const wspolne = screen.getByTestId('mvd-zwarcia-aparatura-prady-wspolne');
    expect(wspolne.querySelectorAll('dt .katex')).toHaveLength(3);
    for (const td of tabela.querySelectorAll('td.mvd-num')) {
      expect(td.textContent).not.toMatch(/kA|\bs$/);
    }
  });

  // ILOCZYN CECH: prądy {równe · różne} × czas pola 2 {ustalony · nieustalony} × zapas cieplny
  // pola 2 {dodatni · ujemny · brak · nie dotyczy}. Pole 1 stałe — jego liczby nie mogą wyciec
  // do pola 2 (ani odwrotnie), a kolor ma wyłącznie komórka wymagająca uwagi.
  const PRADY = ['rowne', 'rozne'] as const;
  const CZASY = ['ustalony', 'nieustalony'] as const;
  const ZAPASY = ['dodatni', 'ujemny', 'brak', 'nie_dotyczy'] as const;
  const ILOCZYN = PRADY.flatMap((prady) =>
    CZASY.flatMap((czas) => ZAPASY.map((zapas) => ({ prady, czas, zapas }))),
  );
  const ZAPAS_OCZEKIWANY = {
    dodatni: { tekst: '+3,66', uwaga: null },
    ujemny: { tekst: '−1,50', uwaga: 'ujemny' },
    brak: { tekst: 'brak', uwaga: 'brak' },
    nie_dotyczy: { tekst: 'nie dotyczy', uwaga: null },
  } as const;

  it.each(ILOCZYN)('ILOCZYN: prądy $prady × czas $czas × zapas $zapas', async (opcje) => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({}), pole2(opcje)]);
    const tabela = await sprawdz(user);

    // Prądy wspólne nad tabelą wyłącznie przy równych wartościach backendu.
    const wspolne = screen.queryByTestId('mvd-zwarcia-aparatura-prady-wspolne');
    if (opcje.prady === 'rowne') {
      expect(wspolne).not.toBeNull();
      expect(wspolne?.textContent).toContain('20,02');
      expect(wspolne?.textContent).toContain('9,17');
      expect(wspolne?.textContent).toContain('9,09');
      expect(screen.queryByTestId('mvd-zwarcia-aparatura-ip-P-1')).toBeNull();
      expect(within(tabela).queryByTestId('mvd-zwarcia-aparatura-kol-ip')).toBeNull();
    } else {
      expect(wspolne).toBeNull();
      expect(tekst('mvd-zwarcia-aparatura-ip-P-1')).toBe('20,02');
      expect(tekst('mvd-zwarcia-aparatura-ip-P-2')).toBe('31,25');
      expect(tekst('mvd-zwarcia-aparatura-ith-P-2')).toBe('12,34');
      expect(tekst('mvd-zwarcia-aparatura-ib-wiersz-P-2')).toBe('11,07');
      expect(within(tabela).getByTestId('mvd-zwarcia-aparatura-kol-ip').querySelector('.katex')).not.toBeNull();
    }

    // Czas wyłączenia pola 2: liczba z backendu albo jawne „nieustalony” (bez liczby z pola 1).
    const czas2 = screen.getByTestId('mvd-zwarcia-aparatura-czas-P-2');
    if (opcje.czas === 'ustalony') {
      expect(czas2.textContent).toBe('0,650');
      expect(czas2.getAttribute('data-uwaga')).toBeNull();
    } else {
      expect(czas2.textContent).toBe('nieustalony');
      expect(czas2.getAttribute('data-uwaga')).toBe('brak');
      expect(czas2.getAttribute('data-zrodlo-czasu')).toBe('nieustalony');
    }
    expect(tekst('mvd-zwarcia-aparatura-czas-P-1')).toBe('0,500');
    expect(uwaga('mvd-zwarcia-aparatura-czas-P-1')).toBeNull();

    // Zapas cieplny pola 2 z JEGO rekordu; pole 1 bez zmian i bez koloru.
    const oczekiwany = ZAPAS_OCZEKIWANY[opcje.zapas];
    expect(tekst('mvd-zwarcia-aparatura-zapas-wiersz-P-2-cieplna')).toBe(oczekiwany.tekst);
    expect(uwaga('mvd-zwarcia-aparatura-zapas-wiersz-P-2-cieplna')).toBe(oczekiwany.uwaga);
    expect(tekst('mvd-zwarcia-aparatura-zapas-wiersz-P-2-dynamiczna')).toBe('+8,75');
    expect(tekst('mvd-zwarcia-aparatura-zapas-wiersz-P-2-wylaczanie')).toBe('+4,93');
    expect(tekst('mvd-zwarcia-aparatura-zapas-wiersz-P-1-cieplna')).toBe('+10,83');
    expect(uwaga('mvd-zwarcia-aparatura-zapas-wiersz-P-1-cieplna')).toBeNull();

    // Tabela kryteriów pola 2 — własne liczby; czas wyłączenia z JEGO członów (bez t_b ani
    // czasu pola 1 w miejsce brakującego).
    await rozwin(user, 'P-2');
    expect(tekst('mvd-zwarcia-aparatura-obliczony-P-2-dynamiczna')).toBe('31,25');
    expect(tekst('mvd-zwarcia-aparatura-aparat-P-2-dynamiczna')).toBe('40');
    expect(tekst('mvd-zwarcia-aparatura-zapas-P-2-cieplna')).toBe(oczekiwany.tekst);
    expect(tekst('mvd-zwarcia-aparatura-tk-P-2')).toBe(
      opcje.czas === 'ustalony' ? '0,650' : 'nieustalony',
    );
    expect(tekst('mvd-zwarcia-aparatura-czas-szczegoly-P-2')).not.toContain('0,360');
    expect(screen.getByTestId('mvd-zwarcia-aparatura-tk-P-2').getAttribute('data-uwaga')).toBe(
      opcje.czas === 'ustalony' ? null : 'brak',
    );
    if (opcje.zapas === 'nie_dotyczy') {
      expect(tekst('mvd-zwarcia-aparatura-aparat-P-2-cieplna')).toBe('nie dotyczy');
      expect(uwaga('mvd-zwarcia-aparatura-aparat-P-2-cieplna')).toBeNull();
    } else {
      expect(tekst('mvd-zwarcia-aparatura-aparat-P-2-cieplna')).toBe('16');
    }

    // Wiersze neutralne: znacznik uwagi niesie wyłącznie komórka, nigdy wiersz pola.
    for (const pole of ['P-1', 'P-2']) {
      expect(screen.getByTestId(`mvd-zwarcia-aparatura-pole-${pole}`).getAttribute('data-uwaga')).toBeNull();
    }
  });

  it.each(['mysz', 'Enter', 'spacja'] as const)(
    'ROZWINIĘCIE wiersza natywnie (%s): aria-expanded, aria-controls, ponowne zwinięcie',
    async (sposob) => {
      const user = userEvent.setup();
      zamontujBackend([poleOdpowiedzi({})]);
      await sprawdz(user);
      const przelacz = screen.getByTestId('mvd-zwarcia-aparatura-rozwin-P-1');
      const wiersz = screen.getByTestId('mvd-zwarcia-aparatura-pole-P-1');
      expect(przelacz.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('mvd-zwarcia-aparatura-porownanie-P-1')).toBeNull();

      const przelaczRaz = async () => {
        if (sposob === 'mysz') {
          // Klik w komórkę wiersza (nie w przycisk) — cały wiersz jest celem.
          await user.click(within(wiersz).getByText('ABB VD4 12 kV 630 A'));
        } else {
          przelacz.focus();
          await user.keyboard(sposob === 'Enter' ? '{Enter}' : ' ');
        }
      };

      await przelaczRaz();
      expect(przelacz.getAttribute('aria-expanded')).toBe('true');
      expect(wiersz.getAttribute('data-rozwiniety')).toBe('true');
      const porownanie = screen.getByTestId('mvd-zwarcia-aparatura-porownanie-P-1');
      const sterowany = document.getElementById(przelacz.getAttribute('aria-controls') ?? '');
      expect(sterowany?.contains(porownanie)).toBe(true);

      await przelaczRaz();
      expect(przelacz.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('mvd-zwarcia-aparatura-porownanie-P-1')).toBeNull();
    },
  );

  it('KLIK W PRZYCISK wiersza przełącza raz (wiersz nie dubluje przełączenia)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    await sprawdz(user);
    await rozwin(user, 'P-1');
    expect(screen.getByTestId('mvd-zwarcia-aparatura-rozwin-P-1').getAttribute('aria-expanded')).toBe(
      'true',
    );
    // Klik w przyciski rozwinięcia nie zwija wiersza.
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-szczegoly-przelacz-P-1'));
    expect(screen.getByTestId('mvd-zwarcia-aparatura-porownanie-P-1')).not.toBeNull();
  });

  // TEST NEGATYWNY (dyrektywa właściciela 2026-11-04 pkt 1, V12K-353): w całym widoku — tabela,
  // rozwinięcie każdego pola i jego szczegóły obliczeń — nie ma niepewności, kompletności ani
  // jakości dowodu, etykiety „Kryterium spełnione — dowód niepełny” ani karty werdyktu; we
  // wszystkich polach × czas ustalony / nieustalony. Rekordy NIOSĄ te dane (fikstura) — znikają
  // wyłącznie z prezentacji.
  const ZAKAZANE_W_WIDOKU = [
    'Niepewność',
    'niepewność',
    'Kompletność dowodu',
    'kompletność dowodu',
    'Jakość dowodu',
    'jakość dowodu',
    'Kryterium spełnione — dowód niepełny',
    'dowód niepełny',
    'NIEPELNY',
    'UNVALIDATED',
    'bez dyskretyzacji',
    'parametr aparatu jest wartością roboczą',
    'Zdanie wyjaśnienia kryterium',
    'Pokaż wyjaśnienie i dowód',
    'Zmień wartość',
    // Zdanie końcowe komunikatu backendu (`komunikat_pl`) o kompletności dowodu.
    'dowód zgodności',
  ];

  it.each(CZASY)('BEZ NIEPEWNOŚCI I KOMPLETNOŚCI DOWODU — wszystkie pola, czas %s', async (czas) => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        komunikat_pl:
          'OK: aparatura wytrzymała. Ocena na wartościach roboczych — wynik obliczeniowy, nie potwierdzony dowód zgodności.',
      }),
      pole2({ prady: 'rozne', czas, zapas: 'dodatni' }),
      pole2({ prady: 'rozne', czas, zapas: 'brak' }),
    ].map((p, i) => (i === 2 ? { ...p, pole: 'P-3', pole_ref: 'field/z/trzecie' } : p)));
    await sprawdz(user);
    for (const pole of ['P-1', 'P-2', 'P-3']) {
      await rozwin(user, pole);
      await user.click(screen.getByTestId(`mvd-zwarcia-aparatura-szczegoly-przelacz-${pole}`));
      expect(screen.getByTestId(`mvd-zwarcia-aparatura-szczegoly-${pole}`)).not.toBeNull();
    }
    const sekcja = screen.getByTestId('mvd-zwarcia-aparatura');
    for (const zakazany of ZAKAZANE_W_WIDOKU) {
      expect(sekcja.textContent, zakazany).not.toContain(zakazany);
    }
    expect(sekcja.querySelector('[data-testid^="mvd-werdykt-"]')).toBeNull();
    expect(within(sekcja).queryAllByRole('button', { name: 'Szczegóły obliczeń' })).toHaveLength(0);
    expect(within(sekcja).getAllByRole('button', { name: 'Ukryj szczegóły obliczeń' })).toHaveLength(3);
  });

  it('SZCZEGÓŁY OBLICZEŃ: kolejność kroków, każda informacja raz, podstawa z rekordu limitu', async () => {
    const user = userEvent.setup();
    const uzasadnienie = CZAS_WLASNY_PROPOZYCJA.opis_zrodla_pl;
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          t_clearing_s: 0.36,
          zrodlo: 'nastawy_pola',
          powod_pl: 'Czas stopnia I> powiększony o czas własny wyłącznika.',
          czlon_nastawczy_s: 0.3,
          czas_wlasny_wylacznika_s: 0.06,
          czas_wlasny: CZAS_WLASNY_PROPOZYCJA,
          // Kształt backendu (`_zalozenie_czasu_wlasnego`): założenie cytuje opis źródła.
          zalozenia_pl: [`Czas własny wyłącznika 0,06 s — ${uzasadnienie}`],
          kody_gotowosci: [],
        },
      }),
    ]);
    await sprawdz(user);
    const szczegoly = await pokazSzczegoly(user, 'P-1');

    // Pod tabelą: 0,300 + 0,060 = 0,360 s — wartości z backendu.
    expect(tekst('mvd-zwarcia-aparatura-czas-szczegoly-P-1')).toContain('0,300 + 0,060 = 0,360');
    // Kolejność kroków wyprowadzenia.
    expect([...szczegoly.querySelectorAll('h5')].map((h) => h.textContent)).toEqual([
      'Dane wejściowe',
      'Wzory',
      'Podstawienia',
      'Wyniki pośrednie',
      'Wynik końcowy',
    ]);
    // Uzasadnienie czasu własnego wyłącznika — dokładnie raz w całej sekcji.
    const sekcja = screen.getByTestId('mvd-zwarcia-aparatura').textContent ?? '';
    expect(sekcja.split(uzasadnienie).length - 1).toBe(1);
    // Podstawa normowa — jedna, z rekordu limitu (2007), nie z rekordu kryterium (2017).
    expect(sekcja).toContain('IEC 62271-1, 2007, § 4.6');
    expect(sekcja).not.toContain('2017');
    // Wzór zapasu raz (wspólny dla trzech kryteriów), podstawienia liczb backendu jako wzory.
    expect(screen.getByTestId('mvd-zwarcia-aparatura-wzory-P-1').querySelectorAll('.katex')).toHaveLength(1);
    for (const rodzaj of ['dynamiczna', 'cieplna', 'wylaczanie']) {
      const podstawienie = screen.getByTestId(`mvd-zwarcia-aparatura-podstawienie-P-1-${rodzaj}`);
      expect(podstawienie.querySelector('.katex')).not.toBeNull();
    }
    expect(tekst('mvd-zwarcia-aparatura-wynik-P-1-dynamiczna')).toContain('+29,98 kA');
    // Ik″ i t_b punktu w danych wejściowych; ip/Ith/Ib nie powtarzają się w szczegółach.
    expect(tekst('mvd-zwarcia-aparatura-ik-P-1')).toBe('9,09');
    expect(tekst('mvd-zwarcia-aparatura-tb-P-1')).toBe('0,360');
    // Pochodzenie t_b (backend) jest podpowiedzią komórki t_b, nie drugim akapitem: jego treść
    // powtarza uzasadnienie czasu wyłączenia, które stoi raz w danych wejściowych (pkt 4).
    expect(screen.getByTestId('mvd-zwarcia-aparatura-tb-P-1').getAttribute('title')).toContain(
      'najkrótszy czas wyłączenia pól lokalnych szyny',
    );
    expect(szczegoly.textContent).not.toContain('najkrótszy czas wyłączenia pól lokalnych szyny');
    // ip pola (20,02) stoi nad tabelą; w danych wejściowych go nie ma (podstawienie go cytuje).
    expect(tekst('mvd-zwarcia-aparatura-dane-P-1')).not.toContain('20,02');
    // Komunikat słowny backendu nie jest powtarzany: liczby stoją w tabeli, a jego zdanie
    // o kompletności dowodu widok pomija (pkt 1 i 4, V12K-353).
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-komunikat-P-1')).toBeNull();
    expect(szczegoly.textContent).not.toContain('OK: aparatura wytrzymała.');
  });

  it('WYNIK NIEOBLICZONY nie dostaje liczby (pkt 7): podstawienie bez liczb, wynik „brak” z powodem', async () => {
    const user = userEvent.setup();
    const poleRef = 'field/x/in';
    zamontujBackend([
      poleOdpowiedzi({
        oceny: [
          ...ocenyPola1().slice(0, 2),
          ocenaK('wylaczanie', 'NIE_OCENIONO', { poleRef, wynik: null, limit: 20, margines: null }),
        ],
      }),
    ]);
    await sprawdz(user);
    await pokazSzczegoly(user, 'P-1');
    const podstawienie = screen.getByTestId('mvd-zwarcia-aparatura-podstawienie-P-1-wylaczanie');
    expect(podstawienie.textContent).not.toMatch(/\d/);
    expect(podstawienie.querySelector('.katex')).toBeNull();
    const wynik = tekst('mvd-zwarcia-aparatura-wynik-P-1-wylaczanie');
    expect(wynik).toContain('brak');
    expect(wynik).toContain('zapas wylaczanie nieokreślony — powód z backendu');
    expect(wynik).not.toContain('kA');
    expect(tekst('mvd-zwarcia-aparatura-obliczony-P-1-wylaczanie')).toBe('—');
  });

  it('WARTOŚĆ ROBOCZA i DANA KARTY rozróżnione w szczegółach (pochodzenie, etykieta, wpływ)', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          ...poleOdpowiedzi({}).czas_wylaczenia,
          czas_wlasny: CZAS_WLASNY_PROPOZYCJA,
          czas_wlasny_wylacznika_s: 0.06,
        },
      }),
    ]);
    await sprawdz(user);
    await pokazSzczegoly(user, 'P-1');

    const czasWlasny = screen.getByTestId('mvd-zwarcia-aparatura-parametr-P-1-break_time_s');
    expect(czasWlasny.getAttribute('data-pochodzenie')).toBe('PROPOZYCJA');
    expect(czasWlasny.getAttribute('data-wartosc-robocza')).toBe('true');
    expect(czasWlasny.textContent).toContain('0,060 s');
    expect(czasWlasny.textContent).toContain('profil typowy urządzenia');
    expect(czasWlasny.textContent).toContain('Wpływ:');

    const ith = screen.getByTestId('mvd-zwarcia-aparatura-parametr-P-1-i_th_ka');
    expect(ith.getAttribute('data-pochodzenie')).toBe('KATALOG');
    expect(ith.getAttribute('data-wartosc-robocza')).toBe('false');
    expect(ith.textContent).toContain('20 kA');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-robocza-P-1-i_th_ka')).toBeNull();
    expect(screen.getByTestId('mvd-zwarcia-aparatura-robocza-P-1-i_dyn_ka')).not.toBeNull();
  });

  it('PARAMETR NIE DOTYCZY (brak wartości i propozycji) → powód z backendu w szczegółach', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          t_clearing_s: null,
          zrodlo: 'nastawy_pola',
          powod_pl: 'Zabezpieczenie otwiera aparat, który nie wyłącza zwarcia.',
          czlon_nastawczy_s: 0.3,
          czas_wlasny_wylacznika_s: null,
          czas_wlasny: parametr('break_time_s', 'czas własny wyłączania wyłącznika', null, 's', null, {
            powod_braku_pl: 'czas własny wyłączania nie dotyczy tego rodzaju aparatu',
            opis_zrodla_pl: 'czas własny wyłączania nie dotyczy tego rodzaju aparatu',
          }),
          zalozenia_pl: [],
          kody_gotowosci: ['aparatura.brak_czasu_wlasnego_wylacznika'],
        },
      }),
    ]);
    await sprawdz(user);
    await pokazSzczegoly(user, 'P-1');

    const czasWlasny = screen.getByTestId('mvd-zwarcia-aparatura-parametr-P-1-break_time_s');
    expect(czasWlasny.getAttribute('data-pochodzenie')).toBe('brak');
    expect(czasWlasny.textContent).toContain('nie dotyczy tego rodzaju aparatu');
    expect(tekst('mvd-zwarcia-aparatura-czas-P-1')).toBe('nieustalony');
  });

  it('„PARAMETRY APARATU” — jeden przycisk na pole z modelu, wywołuje kreator (ref, nazwa)', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({}),
      pole2({ prady: 'rozne', czas: 'ustalony', zapas: 'dodatni' }),
      poleOdpowiedzi({ pole: 'P-3', pole_ref: 'field/z/k', zrodlo: 'konfiguracja', aparat_ref: null }),
    ]);
    const wywolania: string[][] = [];
    await sprawdz(user, { onParametryAparatu: (ref, nazwa) => wywolania.push([ref, nazwa]) });

    for (const pole of ['P-1', 'P-2', 'P-3']) await rozwin(user, pole);
    expect(screen.getAllByRole('button', { name: 'Parametry aparatu' })).toHaveLength(2);
    // Aparat z konfiguracji stacji: nośnikiem nie jest element modelu — bez akcji.
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-parametry-aparatu-P-3')).toBeNull();

    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-parametry-aparatu-P-2'));
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-parametry-aparatu-P-1'));
    expect(wywolania).toEqual([
      ['aparat/02', 'Aparat pola SN 2'],
      ['aparat/01', 'Aparat pola SN 1'],
    ]);
  });

  it('BRAK REKORDU kryterium w odpowiedzi → „brak oceny” z wyróżnieniem, nie liczba', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({ oceny: ocenyPola1().slice(0, 2) })]);
    await sprawdz(user);
    expect(tekst('mvd-zwarcia-aparatura-zapas-wiersz-P-1-wylaczanie')).toBe('brak oceny');
    expect(uwaga('mvd-zwarcia-aparatura-zapas-wiersz-P-1-wylaczanie')).toBe('brak');
    await rozwin(user, 'P-1');
    expect(tekst('mvd-zwarcia-aparatura-obliczony-P-1-wylaczanie')).toBe('—');
    expect(uwaga('mvd-zwarcia-aparatura-aparat-P-1-wylaczanie')).toBe('brak');
  });

  it('POLE BEZ PRĄDU W BIEGU: kreski w prądach, „brak” zapasów, powód backendu w szczegółach', async () => {
    const user = userEvent.setup();
    const poleRef = 'field/x/in';
    zamontujBackend([
      poleOdpowiedzi({}),
      poleOdpowiedzi({
        pole: 'P-5',
        pole_ref: 'field/b/piate',
        prady_pola: {
          punkt_ref: null,
          punkt_nazwa: null,
          ik_ka: null,
          ip_ka: null,
          ith_ka: null,
          ib_ka: null,
          i_dc_ka: null,
          tb_s: null,
          un_kv: null,
          kody_gotowosci: ['aparatura.brak_pradu_pola_w_biegu'],
          powod_pl: 'Bieg zwarciowy nie niesie wiersza zwarcia trójfazowego dla punktu zabudowy.',
        },
        werdykt: null,
        oceny: (['dynamiczna', 'cieplna', 'wylaczanie'] as const).map((r) =>
          ocenaK(r, 'NIE_OCENIONO', { poleRef, limit: 20, margines: null }),
        ),
        komunikat_pl: 'NIEUSTALONE: brak prądu pola.',
      }),
    ]);
    await sprawdz(user);

    expect(screen.getByTestId('mvd-zwarcia-aparatura-pole-P-5').getAttribute('data-withstand-ok')).toBe(
      'nieustalone',
    );
    expect(tekst('mvd-zwarcia-aparatura-ip-P-5')).toBe('—');
    for (const rodzaj of ['dynamiczna', 'cieplna', 'wylaczanie']) {
      expect(tekst(`mvd-zwarcia-aparatura-zapas-wiersz-P-5-${rodzaj}`)).toBe('brak');
      expect(uwaga(`mvd-zwarcia-aparatura-zapas-wiersz-P-5-${rodzaj}`)).toBe('brak');
    }
    await pokazSzczegoly(user, 'P-5');
    expect(tekst('mvd-zwarcia-aparatura-dane-P-5')).toContain('nie niesie wiersza zwarcia trójfazowego');
    expect(tekst('mvd-zwarcia-aparatura-tb-P-5')).toBe('nie podano');
    expect(tekst('mvd-zwarcia-aparatura-ib-wiersz-P-5')).toBe('—');
    expect(tekst('mvd-zwarcia-aparatura-ik-P-5')).toBe('—');
  });

  it.each([
    [{ ok: false, i_dyn_ok: false, i_th_ok: true }, 'false'],
    [{ ok: false, i_dyn_ok: true, i_th_ok: null }, 'nieustalone'],
    [null, 'nieustalone'],
  ] as const)('ZNACZNIK MASZYNOWY wiersza z werdyktu jądra: %o → %s', async (werdykt, znacznik) => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        znamiona: werdykt === null ? null : poleOdpowiedzi({}).znamiona,
        werdykt:
          werdykt === null
            ? null
            : {
                ...werdykt,
                message_pl: 'komunikat backendu',
                utilization_dyn_percent: 140,
                utilization_th_percent: null,
                i_th_effective_ka: null,
              },
      }),
    ]);
    await sprawdz(user);
    expect(screen.getByTestId('mvd-zwarcia-aparatura-pole-P-1').getAttribute('data-withstand-ok')).toBe(
      znacznik,
    );
    if (werdykt === null) {
      await rozwin(user, 'P-1');
      // Aparat spoza katalogu: brak znamion — wartość znamionowa bez liczby (rekordy w fiksturze
      // niosą limit, więc sprawdzamy brak parametrów aparatu w danych wejściowych).
      await user.click(screen.getByTestId('mvd-zwarcia-aparatura-szczegoly-przelacz-P-1'));
      expect(screen.queryByTestId('mvd-zwarcia-aparatura-parametr-P-1-i_th_ka')).toBeNull();
    }
  });

  it('PUNKT POZA STACJĄ → uczciwy brak podstawy (bez pytania backendu)', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('INNA-SZYNA') });

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('punkt-poza-stacja');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull();
    expect(zadania).toHaveLength(0);
  });

  it('BRAK APARATURY (model i konfiguracja) → stan zerowy Z AKCJĄ do konfiguratora', async () => {
    const user = userEvent.setup();
    zamontujBackend([]);
    const otwarte: string[] = [];

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture()}
        runId={BIEG}
       
        onOtworzKonfiguracjeStacji={(ref) => otwarte.push(ref)}
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('brak-aparatury');
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-konfiguruj'));
    expect(otwarte).toEqual([STACJA]);
  });

  it('BRAK BIEGU → brak podstawy bez pytania backendu (zero bezpiecznego zera)', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);

    render(
      <WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={null} />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('brak-biegu');
    expect(zadania).toHaveLength(0);
  });

  it('ODMOWA BACKENDU (bieg scenariusza MIN) pokazuje powód z odpowiedzi', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ detail: 'Bieg jest scenariuszem zwarciowym MIN — wymagany MAX.' }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const blad = await screen.findByTestId('mvd-zwarcia-aparatura-blad');
    expect(blad.textContent).toContain('scenariuszem zwarciowym MIN');
  });

  it('ZMIANA BIEGU unieważnia poprzedni werdykt (żadnej oceny z innego biegu)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    const wiersz = shortCircuitRowFixture();
    const { rerender } = render(
      <WeryfikacjaAparatury wiersz={wiersz} runId={BIEG} />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));
    await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');

    rerender(<WeryfikacjaAparatury wiersz={wiersz} runId="bieg-inny" />);
    await waitFor(() => expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull());
  });

  it('ZMIANA PUNKTU unieważnia poprzedni werdykt (żadnej oceny cudzego punktu)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    const { rerender } = render(
      <WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));
    await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');

    rerender(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture({ target_id: 'BUS-INNY', element_id: 'EL-INNY' })}
        runId={BIEG}
       
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull());
  });
});

describe('reguły źródła sekcji aparatury', () => {
  const ZRODLO = readFileSync(join(__dirname, '..', 'WeryfikacjaAparatury.tsx'), 'utf-8');
  const TEKSTY = readFileSync(join(__dirname, '..', 'strings.ts'), 'utf-8');
  const CSS = readFileSync(join(__dirname, '..', 'aparatura.css'), 'utf-8');

  // Dyrektywa 2026-11-04 (V12K-353): widok nie czyta statusu, etykiety, niepewności,
  // kompletności dowodu ani nie renderuje karty werdyktu.
  it('komponent nie czyta statusu maszynowego, etykiety, niepewności ani kompletności rekordu', () => {
    for (const zakazany of [
      'status_maszynowy',
      'niepewnosc',
      'powody_niepelnosci',
      'rekord.etykieta',
      'ocena.etykieta',
      'KartaWerdyktu',
      '.dowod',
      'etykieta_pl',
      'kompletnosc_dowodu',
      "'SPELNIA'",
      "'NIE_SPELNIA'",
      "'NIEJEDNOZNACZNY'",
      "'NIE_OCENIONO'",
      "'BRAK_PODSTAWY'",
      "'BRAK_DOWODU'",
      "'NIE_DOTYCZY'",
    ]) {
      expect(ZRODLO).not.toContain(zakazany);
    }
  });

  it('teksty sekcji nie nazywają znamienia SN symbolem nN (I_cu)', () => {
    expect(TEKSTY).not.toMatch(/I_?cu|Icu/);
  });

  it('kolor wyłącznie z tokenów i wyłącznie na komórkach z `data-uwaga` (wiersze neutralne)', () => {
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(CSS).not.toContain('data-withstand-ok');
    expect(CSS).not.toContain('--mvd-ok');
    expect(CSS).toMatch(/\[data-uwaga='ujemny'\]\s*\{[^}]*var\(--mvd-err\)[^}]*var\(--mvd-err-bg\)/);
    expect(CSS).toMatch(/\[data-uwaga='brak'\][^{]*\{[^}]*var\(--mvd-warn\)[^}]*var\(--mvd-warn-bg\)/);
  });
});

describe('model ogniwa — czyste selektory', () => {
  it('prądy wspólne tylko przy równych ip, Ith i Ib wszystkich pól (porównanie, nie obliczenie)', () => {
    const p1 = poleOdpowiedzi({});
    expect(pradyJednakowe([])).toBe(false);
    expect(pradyJednakowe([p1])).toBe(true);
    expect(pradyJednakowe([p1, poleOdpowiedzi({ pole: 'P-2' })])).toBe(true);
    for (const klucz of ['ip_ka', 'ith_ka', 'ib_ka'] as const) {
      const inne = poleOdpowiedzi({ pole: 'P-2', prady_pola: { ...p1.prady_pola, [klucz]: 1.23 } });
      expect(pradyJednakowe([p1, inne])).toBe(false);
    }
  });

  it('rekord kryterium wybierany po rodzaju z identyfikatora rekordu pola', () => {
    const pole = poleOdpowiedzi({});
    expect(ocenaRodzaju(pole, 'cieplna')?.kryterium_id).toBe('aparatura.field/x/in.aparat/01.cieplna');
    expect(ocenaRodzaju(poleOdpowiedzi({ oceny: [] }), 'cieplna')).toBeNull();
  });

  // SZYNY-STACJI-LUSTRO: przynależność punktu do stacji z JEDNEJ reguły backendu
  // (`enm.tor_pola.szyny_stacji`) — szyna główna i własny zacisk pola SN należą do stacji;
  // samo pole rozdzielcze stojące na szynie spoza tej reguły już NIE (dawna druga droga).
  it('znajduje stację punktu po szynach stacji z lustra (szyna główna, zacisk pola SN)', () => {
    const snap = snapshotZeStacja('EL-GPZ');
    expect(stacjeDlaPunktu(snap, { target_id: 'BUS-GPZ', element_id: 'EL-GPZ' })).toEqual([STACJA]);
    expect(stacjeDlaPunktu(snap, { target_id: 'X', element_id: 'Y' })).toEqual([]);
    expect(stacjeDlaPunktu(null, { target_id: 'BUS-GPZ' })).toEqual([]);

    const zZaciskiem = {
      ...snap,
      substations: [{ ...snap.substations[0], bus_refs: ['SZYNA-GLOWNA'] }],
      // Karta W5-B: pole stacji = rekord `bays`; własny zacisk = `terminal_bus_ref`.
      bays: [{
        id: 'pole-1', ref_id: 'pole-1', name: 'Pole 1', tags: [], meta: {}, bay_role: 'OUT',
        substation_ref: STACJA, bus_ref: 'SZYNA-GLOWNA', terminal_bus_ref: 'EL-GPZ', equipment_refs: [],
      }],
    } as unknown as EnergyNetworkModel;
    expect(stacjeDlaPunktu(zZaciskiem, { target_id: 'BUS-GPZ', element_id: 'EL-GPZ' })).toEqual([STACJA]);

    const tylkoPole = {
      ...snap,
      substations: [{ ...snap.substations[0], bus_refs: [] }],
      bays: [{ id: 'b', ref_id: 'b', name: 'Pole odplywowe', tags: [], meta: {}, bus_ref: 'EL-GPZ', substation_ref: STACJA }],
    } as unknown as EnergyNetworkModel;
    expect(stacjeDlaPunktu(tylkoPole, { target_id: 'BUS-GPZ', element_id: 'EL-GPZ' })).toEqual([]);
  });

  it('stacja przedstawia się NAZWĄ; brak nazwy w modelu → uczciwie ref', () => {
    const snap = snapshotZeStacja('EL-GPZ');
    expect(nazwaStacji(snap, STACJA)).toBe('Stacja 1');
    const bezNazwy = {
      ...snap,
      substations: [{ ...snap.substations[0], name: '' }],
    } as unknown as EnergyNetworkModel;
    expect(nazwaStacji(bezNazwy, STACJA)).toBe(STACJA);
    expect(nazwaStacji(null, STACJA)).toBe(STACJA);
  });

  it('powód braku podstawy rozróżnia trzy sytuacje', () => {
    expect(powodBrakuPodstawy({ runId: null, stacje: [STACJA], liczbaPol: 1 })).toBe('brak-biegu');
    expect(powodBrakuPodstawy({ runId: BIEG, stacje: [], liczbaPol: 0 })).toBe('punkt-poza-stacja');
    expect(powodBrakuPodstawy({ runId: BIEG, stacje: [STACJA], liczbaPol: 0 })).toBe(
      'brak-aparatury',
    );
    expect(powodBrakuPodstawy({ runId: BIEG, stacje: [STACJA], liczbaPol: 2 })).toBeNull();
  });

  // Znacznik wytrzymałości nie zależy od rekordu wyłączania (osobne kryterium, bez agregatu
  // statusów w prezentacji): każdy status rekordu wyłączania × werdykt wytrzymałości.
  it.each([
    ['SPELNIA', true, 'true'],
    ['NIE_SPELNIA', true, 'true'],
    ['NIE_OCENIONO', true, 'true'],
    ['NIE_DOTYCZY', false, 'false'],
    ['BRAK_PODSTAWY', false, 'false'],
  ] as const)(
    'znacznik wytrzymałości: rekord wyłączania %s × wytrzymałość ok=%s → %s',
    (status, ok, oczekiwany) => {
      const pole = poleOdpowiedzi({
        werdykt: {
          ok,
          i_dyn_ok: ok,
          i_th_ok: true,
          message_pl: 'werdykt',
          utilization_dyn_percent: ok ? 50 : 150,
          utilization_th_percent: 10,
          i_th_effective_ka: 28,
        },
        oceny: [
          ocenaK('dynamiczna', ok ? 'SPELNIA' : 'NIE_SPELNIA'),
          ocenaK('cieplna', 'SPELNIA'),
          ocenaK('wylaczanie', status),
        ],
      });
      expect(znacznikWerdyktu(pole)).toBe(oczekiwany);
    },
  );

  it('znacznik werdyktu odróżnia „nieustalone" od oceny negatywnej', () => {
    expect(znacznikWerdyktu(poleOdpowiedzi({}))).toBe('true');
    expect(znacznikWerdyktu(poleOdpowiedzi({ werdykt: null }))).toBe('nieustalone');
    expect(
      znacznikWerdyktu(
        poleOdpowiedzi({
          werdykt: {
            ok: false,
            i_dyn_ok: true,
            i_th_ok: null,
            message_pl: 'NIEUSTALONE',
            utilization_dyn_percent: 10,
            utilization_th_percent: null,
            i_th_effective_ka: null,
          },
        }),
      ),
    ).toBe('nieustalone');
    expect(
      znacznikWerdyktu(
        poleOdpowiedzi({
          werdykt: {
            ok: false,
            i_dyn_ok: false,
            i_th_ok: true,
            message_pl: 'BLOKER',
            utilization_dyn_percent: 150,
            utilization_th_percent: 10,
            i_th_effective_ka: 28,
          },
        }),
      ),
    ).toBe('false');
  });
});
