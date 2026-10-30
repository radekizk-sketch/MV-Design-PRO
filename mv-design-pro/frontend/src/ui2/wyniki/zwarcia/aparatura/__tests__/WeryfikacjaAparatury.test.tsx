/**
 * Testy ogniwa „wynik zwarciowy → wytrzymałość aparatury" (karta KD-4;
 * tor Z MODELU — karta KD-6 poz. 2).
 *
 * INTENCJA:
 *  1. do końcówki jedzie STACJA i ZAPISANY BIEG (karta WYTRZYMALOSC-PRAD-POLA) — prąd
 *     każdego pola backend bierze z wiersza biegu dla punktu zabudowy pola; ekran nie
 *     wysyła prądów wybranego punktu, które dawniej szły do wszystkich pól stacji,
 *  2. werdykty powstają dla pól z MODELU, bez wymogu ręcznej konfiguracji,
 *     a każdy wiersz mówi, skąd wziął aparat (`data-zrodlo`),
 *  3. wszystkie trzy stany werdyktu są odróżnialne, a brak podstawy
 *     (brak biegu / punkt poza stacją / brak aparatury) NIGDY nie udaje
 *     werdyktu negatywnego,
 *  4. każdy wiersz pokazuje prądy SWOJEGO punktu zabudowy i trzy rekordy werdyktu
 *     wyjaśnialnego jedyną kartą werdyktu (karta SC-IB-ITH-ZRODLA: trzeci — zdolność
 *     wyłączania — nazywa porównaną wielkość, a wiersz pokazuje Ib, iDC(tb) i tb biegu),
 *  5. zasada nr 4 (V12K-351): parametr aparatu bez danej karty to WARTOŚĆ ROBOCZA — etykieta
 *     przy liczbie, źródło i wpływ (tekst backendu) oraz „Zmień wartość” prowadzące do
 *     kreatora edycji parametrów aparatu; dana karty nie dostaje etykiety ani nie udaje
 *     wartości roboczej.
 * Kliki natywne (userEvent) — Zero-Debt pkt 5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { shortCircuitRowFixture } from '../../__tests__/fixtures';
import { WeryfikacjaAparatury } from '../WeryfikacjaAparatury';
import type { PoleWytrzymalosci, WartoscParametruAparatu } from '../api';
import type { WynikWymagania } from '../../../wzorzec/werdykt';
import rekordyWytrzymalosci from './rekordyWytrzymalosci.json';

// Rekordy W z TYCH SAMYCH funkcji backendu co widok pól (fixtura generowana; parytet pilnuje
// `test_fixtury_ocen_fe.py`). Karta WERDYKT-MIGRACJA-190: dawny „werdykt jądra" z flagami
// `ok`/`i_dyn_ok`/`i_th_ok` i znacznik prezentacji `data-withstand-ok` usunięte — wiersz
// niesie status i etykietę rekordu W.
const W = rekordyWytrzymalosci as unknown as Record<
  'spelnione_na_liczbach' | 'przekroczenie_dynamiczne' | 'bez_czasu_wylaczenia',
  WynikWymagania
>;
import { nazwaStacji, powodBrakuPodstawy, stacjeDlaPunktu } from '../model';
import type { OcenaKryterium } from '../../../wzorzec/werdykt';

const STACJA = 'stn/abc/station';
const BIEG = 'bieg-zwarciowy-1';

/** Minimalny rekord K (kształt `model_dump` backendu) — wyłącznie do renderu karty. */
function ocenaK(
  rodzaj: 'dynamiczna' | 'cieplna' | 'wylaczanie',
  status: OcenaKryterium['status_maszynowy'],
): OcenaKryterium {
  return {
    kryterium_id: `aparatura.field/x/in.aparat/01.${rodzaj}`,
    przedmiot: { element_ref: 'aparat/01', nazwa_pl: 'Aparat pola SN 1', opis_pl: 'aparat pola P-1' },
    kryterium: {
      opis_pl:
        rodzaj === 'dynamiczna'
          ? 'Prąd udarowy nie przekracza I_dyn'
          : 'Prąd cieplny nie przekracza I_th',
      warunek_latex: rodzaj === 'dynamiczna' ? 'i_p \\le I_{dyn}' : 'I_{th} \\le I_{thr}',
      relacja: 'NIE_WIECEJ',
      warunek_wstepny_pl: null,
      warunek_wstepny_podstawa: null,
    },
    podstawa: {
      rodzaj: 'NORMA',
      dokument: 'IEC 62271-1',
      wydanie: '2007',
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
    wynik: null,
    limit: null,
    margines: null,
    niepewnosc: { wartosc: null, metoda_pl: null, nie_dotyczy: true, powod_pl: 'bez dyskretyzacji' },
    status_maszynowy: status,
    kompletnosc_dowodu: 'NIEPELNY',
    powody_niepelnosci: [],
    etykieta: {
      etykieta_pl:
        status === 'SPELNIA' ? 'Spełnia kryterium' : 'Brak zweryfikowanej podstawy wymagania',
      semantyka: status === 'SPELNIA' ? 'pozytywna' : 'ostrzegawcza',
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
        krok: `aparatura.field/x/in.aparat/01:${rodzaj}`,
        opis_pl: 'wiersz biegu, punkt: szyna „Szyna pola P-1”',
      },
    ],
  } as unknown as OcenaKryterium;
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
      ik_ka: 11.4,
      ip_ka: 31.2,
      ith_ka: 12.5,
      ib_ka: 10.8,
      i_dc_ka: 4.3,
      tb_s: 0.1,
      un_kv: 15,
      kody_gotowosci: [],
      powod_pl: null,
    },
    oceny: [
      ocenaK('dynamiczna', 'SPELNIA'),
      ocenaK('cieplna', 'SPELNIA'),
      ocenaK('wylaczanie', 'SPELNIA'),
    ],
    czas_wylaczenia: {
      t_clearing_s: 0.5,
      zrodlo: 'nastawy_pola',
      powod_pl: 'Czas z nastaw pola.',
      czlon_nastawczy_s: 0.5,
      czas_wlasny_wylacznika_s: null,
      czas_wlasny: null,
      zalozenia_pl: [],
      kody_gotowosci: [],
    },
    wymaganie: W.spelnione_na_liczbach,
    komunikat_pl: W.spelnione_na_liczbach.wyjasnienie.zdanie_pl,
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

describe('WeryfikacjaAparatury — ogniwo zwarcie → aparatura', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectId: 'projekt-testowy', activeCaseId: 'case-1' });
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('EL-GPZ') });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('STACJA I ZAPISANY BIEG jadą do końcówki (nie prądy punktu); werdykt z MODELU', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);
    // Prądy wybranego punktu są INNE niż prądy pola w odpowiedzi — ekran nie może ich wysłać
    // ani pokazać jako prądów pola.
    const wiersz = shortCircuitRowFixture({ ip_ka: 99.9, ith_ka: 88.8, ik_ka: 77.7 });

    render(<WeryfikacjaAparatury wiersz={wiersz} runId={BIEG} punktNazwa="Szyna GPZ 15 kV" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    await waitFor(() => expect(zadania).toHaveLength(1));
    expect(zadania[0]).toEqual({ station_ref: STACJA, short_circuit_run_id: BIEG });

    const prady = await screen.findByTestId('mvd-zwarcia-aparatura-prady-P-1');
    expect(prady.textContent).toContain('Szyna pola P-1');
    expect(prady.textContent).toContain('31,2');
    expect(prady.textContent).toContain('12,5');
    expect(prady.textContent).not.toContain('99,9');

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');
    expect(pole.getAttribute('data-status')).toBe('BRAK_DOWODU');
    expect(pole.getAttribute('data-zrodlo')).toBe('model');
    // Etykieta i komunikat są CYTATEM rekordu backendu (prezentacja nic nie układa).
    expect(screen.getByTestId('mvd-zwarcia-aparatura-etykieta-P-1').textContent).toBe(
      W.spelnione_na_liczbach.etykieta.etykieta_pl,
    );
    expect(pole.textContent).toContain(W.spelnione_na_liczbach.wyjasnienie.zdanie_pl);
    expect(screen.getByTestId('mvd-zwarcia-aparatura-zrodlo-P-1').textContent).toContain(
      'aparat z modelu',
    );
  });

  it('ROZBICIE CZASU WYŁĄCZENIA jest widoczne przy werdykcie (oba człony, źródło)', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          t_clearing_s: 0.36,
          zrodlo: 'nastawy_pola',
          powod_pl: 'Czas z charakterystyki DT zabezpieczenia pola przy prądzie 8000,0 A.',
          czlon_nastawczy_s: 0.3,
          czas_wlasny_wylacznika_s: 0.06,
          czas_wlasny: CZAS_WLASNY_PROPOZYCJA,
          zalozenia_pl: [],
          kody_gotowosci: [],
        },
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const czas = await screen.findByTestId('mvd-zwarcia-aparatura-czas-P-1');
    expect(czas.getAttribute('data-zrodlo-czasu')).toBe('nastawy_pola');
    // OBA człony osobno — inaczej suma byłaby nieweryfikowalna.
    expect(czas.textContent).toContain('0,36');
    expect(czas.textContent).toContain('0,30');
    expect(czas.textContent).toContain('0,06');
    expect(czas.textContent).toContain('z nastaw zabezpieczeń pola');
    expect(czas.textContent).toContain('Czas z charakterystyki DT');
  });

  it('WARTOŚĆ ROBOCZA czasu własnego: etykieta, źródło z wpływem, założenie i „Zmień wartość”', async () => {
    // Kanon V12K-351: brak czasu własnego w karcie NIE zatrzymuje oceny (dawniej kod
    // `brak_czasu_wlasnego_wylacznika`) — backend przyjmuje 0,06 s z profilu i liczy.
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        czas_wylaczenia: {
          t_clearing_s: 0.36,
          zrodlo: 'nastawy_pola',
          powod_pl: 'Czas stopnia I> powiększony o czas własny wyłącznika (wartość robocza).',
          czlon_nastawczy_s: 0.3,
          czas_wlasny_wylacznika_s: 0.06,
          czas_wlasny: CZAS_WLASNY_PROPOZYCJA,
          zalozenia_pl: ['Czas własny wyłącznika przyjęto jako wartość roboczą 0,06 s.'],
          kody_gotowosci: [],
        },
      }),
    ]);
    const zmiany: string[][] = [];

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture()}
        runId={BIEG}
        punktNazwa="Szyna"
        onZmienWartosc={(ref, nazwa, klucz) => zmiany.push([ref, nazwa, klucz])}
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const czas = await screen.findByTestId('mvd-zwarcia-aparatura-czas-P-1');
    expect(czas.textContent).toContain('Czas własny wyłącznika przyjęto jako wartość roboczą 0,06 s.');

    const czasWlasny = screen.getByTestId('mvd-zwarcia-aparatura-parametr-P-1-break_time_s');
    expect(czasWlasny.getAttribute('data-pochodzenie')).toBe('PROPOZYCJA');
    expect(czasWlasny.getAttribute('data-wartosc-robocza')).toBe('true');
    expect(czasWlasny.textContent).toContain('0,060 s');
    expect(screen.getByTestId('mvd-zwarcia-aparatura-robocza-P-1-break_time_s').textContent).toBe(
      'wartość robocza',
    );
    expect(czasWlasny.textContent).toContain('profil typowy urządzenia');
    expect(czasWlasny.textContent).toContain('Wpływ:');

    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-zmien-P-1-break_time_s'));
    expect(zmiany).toEqual([['aparat/01', 'Aparat pola SN 1', 'break_time_s']]);
  });

  it('DANA KARTY nie dostaje etykiety wartości roboczej; I_p z relacji normowej — dostaje', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    const zmiany: string[][] = [];

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture()}
        runId={BIEG}
        punktNazwa="Szyna"
        onZmienWartosc={(ref, nazwa, klucz) => zmiany.push([ref, nazwa, klucz])}
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const ith = await screen.findByTestId('mvd-zwarcia-aparatura-parametr-P-1-i_th_ka');
    expect(ith.getAttribute('data-pochodzenie')).toBe('KATALOG');
    expect(ith.getAttribute('data-wartosc-robocza')).toBe('false');
    expect(ith.textContent).toContain('karta katalogowa');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-robocza-P-1-i_th_ka')).toBeNull();
    expect(screen.getByTestId('mvd-zwarcia-aparatura-robocza-P-1-i_dyn_ka')).not.toBeNull();
    // Projektant może nadać własną wartość także parametrowi z karty (tabliczka aparatu).
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-zmien-P-1-i_th_ka'));
    expect(zmiany).toEqual([['aparat/01', 'Aparat pola SN 1', 'i_th_ka']]);
    // Czasu własnego nie składano (brak w odpowiedzi) — nie ma wiersza parametru.
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-parametr-P-1-break_time_s')).toBeNull();
  });

  it('PARAMETR NIE DOTYCZY (brak wartości i propozycji) → powód z backendu, bez akcji zmiany', async () => {
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

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture()}
        runId={BIEG}
        punktNazwa="Szyna"
        onZmienWartosc={() => undefined}
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const czasWlasny = await screen.findByTestId('mvd-zwarcia-aparatura-parametr-P-1-break_time_s');
    expect(czasWlasny.getAttribute('data-pochodzenie')).toBe('brak');
    expect(czasWlasny.textContent).toContain('nie dotyczy tego rodzaju aparatu');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-zmien-P-1-break_time_s')).toBeNull();
  });

  it('APARAT Z KONFIGURACJI STACJI → bez akcji „Zmień wartość” (nośnikiem nie jest element modelu)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({ zrodlo: 'konfiguracja' })]);

    render(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture()}
        runId={BIEG}
        punktNazwa="Szyna"
        onZmienWartosc={() => undefined}
      />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    await screen.findByTestId('mvd-zwarcia-aparatura-parametr-P-1-i_th_ka');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-zmien-P-1-i_th_ka')).toBeNull();
  });

  it('WERDYKT NEGATYWNY z backendu jest pokazywany bez tłumaczenia na własne słowa', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-2',
        wymaganie: W.przekroczenie_dynamiczne,
        komunikat_pl: W.przekroczenie_dynamiczne.wyjasnienie.zdanie_pl,
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-2');
    expect(pole.getAttribute('data-status')).toBe('NIE_SPELNIA');
    expect(
      screen.getByTestId('mvd-zwarcia-aparatura-etykieta-P-2').getAttribute('data-semantyka'),
    ).toBe(W.przekroczenie_dynamiczne.etykieta.semantyka);
    expect(pole.textContent).toContain(W.przekroczenie_dynamiczne.wyjasnienie.zdanie_pl);
  });

  it('APARAT SPOZA KATALOGU → „brak danych", a nie werdykt negatywny', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-3',
        znamiona: null,
        wymaganie: null,
        komunikat_pl: 'Aparat spoza katalogu — wytrzymałości nie da się sprawdzić.',
        kody_gotowosci: ['aparatura.aparat_spoza_katalogu'],
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-3');
    expect(pole.getAttribute('data-status')).toBe('brak-danych');
    expect(screen.queryByTestId('mvd-zwarcia-aparatura-etykieta-P-3')).toBeNull();
  });

  it('NIEROZSTRZYGNIĘTE kryterium cieplne nie udaje werdyktu negatywnego', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-4',
        czas_wylaczenia: {
          t_clearing_s: null,
          zrodlo: null,
          powod_pl: 'Czas wyłączenia nie jest ustalony.',
          czlon_nastawczy_s: null,
          czas_wlasny_wylacznika_s: null,
          czas_wlasny: null,
          zalozenia_pl: [],
          kody_gotowosci: [],
        },
        wymaganie: W.bez_czasu_wylaczenia,
        komunikat_pl: W.bez_czasu_wylaczenia.wyjasnienie.zdanie_pl,
        kody_gotowosci: ['aparatura.czas_wylaczenia_nieustalony'],
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-4');
    // Brak czasu wyłączenia: rekord BRAK_PODSTAWY (nie NIE_SPELNIA) z etykietą rekordu.
    expect(pole.getAttribute('data-status')).toBe('BRAK_PODSTAWY');
    expect(pole.textContent).toContain(W.bez_czasu_wylaczenia.wyjasnienie.zdanie_pl);
  });

  it('PUNKT POZA STACJĄ → uczciwy brak podstawy (bez pytania backendu)', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([poleOdpowiedzi({})]);
    useSnapshotStore.setState({ snapshot: snapshotZeStacja('INNA-SZYNA') });

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
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
        punktNazwa="Szyna"
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
      <WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={null} punktNazwa="Szyna" />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const brak = await screen.findByTestId('mvd-zwarcia-aparatura-brak');
    expect(brak.getAttribute('data-powod')).toBe('brak-biegu');
    expect(zadania).toHaveLength(0);
  });

  it('POLE BEZ PRĄDU W BIEGU pokazuje powód backendu i rekordy „nie oceniono"', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        pole: 'P-5',
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
        wymaganie: null,
        oceny: [
          ocenaK('dynamiczna', 'NIE_OCENIONO'),
          ocenaK('cieplna', 'NIE_OCENIONO'),
          ocenaK('wylaczanie', 'NIE_OCENIONO'),
        ],
        komunikat_pl: 'NIEUSTALONE: brak prądu pola.',
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-5');
    expect(pole.getAttribute('data-status')).toBe('brak-danych');
    expect(screen.getByTestId('mvd-zwarcia-aparatura-prady-P-5').textContent).toContain(
      'nie niesie wiersza zwarcia trójfazowego',
    );
  });

  it('REKORDY WERDYKTU WYJAŚNIALNEGO obu kryteriów są pokazane kartą werdyktu', async () => {
    const user = userEvent.setup();
    zamontujBackend([
      poleOdpowiedzi({
        oceny: [ocenaK('dynamiczna', 'SPELNIA'), ocenaK('cieplna', 'BRAK_PODSTAWY')],
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const pole = await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');
    // Zdanie wyjaśnienia i etykieta pochodzą Z REKORDU (prezentacja nic nie układa).
    expect(pole.textContent).toContain('Zdanie wyjaśnienia kryterium dynamiczna z backendu.');
    expect(pole.textContent).toContain('Zdanie wyjaśnienia kryterium cieplna z backendu.');
    expect(pole.textContent).toContain('Brak zweryfikowanej podstawy wymagania');
  });

  // Karta SC-IB-ITH-ZRODLA — {tb podane · tb brak} × {Ib policzone · Ib brak}: wiersz pokazuje
  // wartości backendu albo uczciwe „nie podano"/kreskę, nigdy domyślnego 0,1 s ani I″k
  // podstawionego za Ib; trzeci rekord K (zdolność wyłączania) jest pokazany kartą werdyktu.
  it.each([
    { tb_s: 0.1, ib_ka: 10.8, i_dc_ka: 4.3, ib: '10,8', tb: '0,1', idc: '4,3' },
    { tb_s: null, ib_ka: 11.4, i_dc_ka: null, ib: '11,4', tb: 'nie podano', idc: null },
    { tb_s: null, ib_ka: null, i_dc_ka: null, ib: '—', tb: 'nie podano', idc: null },
  ])('WIELKOŚCI WYŁĄCZANIA wiersza: tb=$tb_s, Ib=$ib_ka', async ({ tb_s, ib_ka, i_dc_ka, ib, tb, idc }) => {
    const user = userEvent.setup();
    const bazowe = poleOdpowiedzi({});
    zamontujBackend([
      poleOdpowiedzi({
        prady_pola: { ...bazowe.prady_pola, tb_s, ib_ka, i_dc_ka },
        oceny: [
          ocenaK('dynamiczna', 'SPELNIA'),
          ocenaK('cieplna', 'SPELNIA'),
          ocenaK('wylaczanie', ib_ka === null ? 'NIE_OCENIONO' : 'SPELNIA'),
        ],
      }),
    ]);

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    expect((await screen.findByTestId('mvd-zwarcia-aparatura-ib-P-1')).textContent).toContain(ib);
    expect(screen.getByTestId('mvd-zwarcia-aparatura-tb-P-1').textContent).toContain(tb);
    const prady = screen.getByTestId('mvd-zwarcia-aparatura-prady-P-1');
    if (idc !== null) expect(prady.textContent).toContain(idc);
    // Bieg bez tb: żadnego domyślnego czasu w prądach pola.
    if (tb_s === null) expect(prady.textContent).not.toContain('0,1 s');
    const oceny = screen.getByTestId('mvd-zwarcia-aparatura-oceny-P-1');
    expect(oceny.textContent).toContain('Zdanie wyjaśnienia kryterium wylaczanie z backendu.');
    // Status wiersza to status rekordu W z backendu — prezentacja nie składa go ze statusów
    // rekordów K (agregat liczy backend).
    expect(screen.getByTestId('mvd-zwarcia-aparatura-pole-P-1').getAttribute('data-status')).toBe(
      W.spelnione_na_liczbach.status_maszynowy,
    );
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

    render(<WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna" />);
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));

    const blad = await screen.findByTestId('mvd-zwarcia-aparatura-blad');
    expect(blad.textContent).toContain('scenariuszem zwarciowym MIN');
  });

  it('ZMIANA BIEGU unieważnia poprzedni werdykt (żadnej oceny z innego biegu)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    const wiersz = shortCircuitRowFixture();
    const { rerender } = render(
      <WeryfikacjaAparatury wiersz={wiersz} runId={BIEG} punktNazwa="Szyna GPZ" />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));
    await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');

    rerender(<WeryfikacjaAparatury wiersz={wiersz} runId="bieg-inny" punktNazwa="Szyna GPZ" />);
    await waitFor(() => expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull());
  });

  it('ZMIANA PUNKTU unieważnia poprzedni werdykt (żadnej oceny cudzego punktu)', async () => {
    const user = userEvent.setup();
    zamontujBackend([poleOdpowiedzi({})]);
    const { rerender } = render(
      <WeryfikacjaAparatury wiersz={shortCircuitRowFixture()} runId={BIEG} punktNazwa="Szyna GPZ" />,
    );
    await user.click(screen.getByTestId('mvd-zwarcia-aparatura-sprawdz'));
    await screen.findByTestId('mvd-zwarcia-aparatura-pole-P-1');

    rerender(
      <WeryfikacjaAparatury
        wiersz={shortCircuitRowFixture({ target_id: 'BUS-INNY', element_id: 'EL-INNY' })}
        runId={BIEG}
        punktNazwa="Szyna inna"
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('mvd-zwarcia-aparatura-werdykty')).toBeNull());
  });
});

describe('model ogniwa — czyste selektory', () => {
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

  // Dawne testy `znacznikWerdyktu` (znacznik prezentacji składany z flag `ok`/`i_dyn_ok`/
  // `i_th_ok`) usunięte razem z funkcją: status wiersza to status rekordu W backendu, a jego
  // niezależność od prezentacji przypinają testy wierszy wyżej (każdy wariant rekordu ×
  // brak rekordu).
});
