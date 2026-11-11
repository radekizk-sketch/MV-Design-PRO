/*
 * Rejestr przekroczeń „Co wymaga uwagi" (karta A1 / V12K-098, FLOW etap E6;
 * rozszerzenie K6 / H-5 pkt 5).
 *
 * BÓL PERSONY (audyt AUDYT_FLOW_INZYNIER_PROJEKTANT_2026-07 §2 A1): przekroczenia
 * są rozproszone po zakładkach (rozpływ osobno, jakość osobno…). Inżynier analiz
 * nie widzi WSZYSTKICH problemów sieci w jednym miejscu z akcją naprawczą.
 *
 * DEFEKT NAPRAWIONY W K6 (audyt H-5 pkt 5): „czy jest przebieg" było wyprowadzane
 * WYŁĄCZNIE z obecności wyniku rozpływu w store — po biegu ZWARCIOWYM ekran
 * kłamał („Brak zakończonego przebiegu obliczeń"), mimo że przebieg istniał
 * i miał wynik. Źródłem prawdy jest teraz rejestr przebiegów
 * (`useExecutionRunsStore.runs`, status DONE) LUB załadowany wynik rozpływu.
 *
 * ŹRÓDŁA PRZEKROCZEŃ (wszystkie werdykty POCHODZĄ Z BACKENDU — zero fizyki,
 * zero progów wymyślonych w UI):
 * 1. Rozpływ mocy, napięcia szyn: `usePowerFlowResultsStore.results` → szyny poza
 *    kryterium ostrzeżenia (`napiecePozaZakresem`, ten sam werdykt co adapter
 *    `rozplyw/adapters/rozplywAdapter.ts`; próg WYŁĄCZNIE z `results.kryteria_napiecia`
 *    odpowiedzi biegu — karta W3-J, `analysis.normative.kryteria_napiecia`; brak
 *    kryteriów w wyniku = brak pozycji, nie domyślny próg). Element = Bus.
 * 2. Rozpływ mocy, zbieżność: `results.converged === false` (pole kontraktu
 *    `PowerFlowResultV1`) → pozycja bez elementu modelu, z adresem = zakładka
 *    „Zbieżność" (istniejące okno diagnostyki `ui2/wyniki/zbieznosc`).
 * 3. Werdykt projektowy (`GET /api/quality/design-verdict`) → każde kryterium
 *    w stanie NARUSZONE. To JEDYNE źródło zbierające kryteria z wielu biegów
 *    (rozpływ + zwarcia) i z modelu: obciążenie gałęzi, obciążenie
 *    transformatorów, wytrzymałość cieplna przewodu, wiarygodność prądu
 *    zwarciowego, bilans mocy biernej, budżet strat, moc i cos φ w punkcie
 *    przyłączenia. Liczby, stany i elementy wiodące są policzone przez backend —
 *    UI wyłącznie je przepisuje (reużycie mapowań `ocena/model.ts`).
 *
 * DEDUPLIKACJA (deterministyczna): kryterium napięciowe werdyktu jest pomijane,
 * gdy synchroniczny kolektor rozpływu (1) wniósł już pozycje per szyna — ta sama
 * rzecz na dwóch poziomach szczegółowości byłaby szumem, a szczegół per element
 * jest dla decyzji cenniejszy niż agregat.
 *
 * DŁUG NAZWANY (K6 / H-5 pkt 5, świadomie poza tą kartą): szczegóły per element
 * z analiz pobieranych osobno per ekran — jakość (migotanie, warunki
 * przyłączenia, arc flash), odbiór, estymacja stanu, stabilność, SSCI, składowe
 * symetryczne. Ich werdykty żyją wyłącznie w odpowiedziach `fetch` konkretnych
 * ekranów; wciągnięcie ich tutaj wymaga kontraktu zbiorczego po stronie backendu
 * (agregat „przekroczenia przypadku"), a nie kopiowania wywołań do rejestru.
 */

import { useEffect, useMemo, useState } from 'react';

import type { PowerFlowResultV1 } from '../../../ui/power-flow-results/types';
import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import type { ElementType } from '../../../ui/types';
import type { NazwaObiektu, RodzajPrzekroczenia } from '../wzorzec';
import { useNazwaObiektu } from '../wzorzec/useNazwaObiektu';
import { fetchOcenaTechniczna, type PozycjaOceny, type OdpowiedzOceny } from '../ocena/api';
import { rodzajPrzekroczeniaKryterium, typElementuKryterium } from '../ocena/model';
import { subskrybuj } from '../../events';
import { fmtPU, napiecePozaZakresem } from '../rozplyw/strings';
import { CO_WYMAGA_UWAGI_STRINGS as T } from './strings';

/** Znormalizowana pozycja przekroczenia (jedna linia rejestru). */
export interface Przekroczenie {
  /** Deterministyczny, unikatowy klucz (React key + wybór) — `analiza::rodzaj::element`. */
  klucz: string;
  /** Etykieta analizy źródłowej (PL). */
  analizaPL: string;
  /**
   * Identyfikator elementu sieci (do „Popraw w modelu"). `null` = przekroczenie
   * bez elementu modelu (agregat systemowy, np. brak zbieżności albo budżet
   * strat) — wtedy przycisk decyzji elementowej się NIE renderuje.
   */
  elementRef: string | null;
  /** Typ elementu (dla selekcji/property-grid); `null` jak wyżej. */
  elementTyp: ElementType | null;
  /**
   * Nazwa elementu do prezentacji — z mostu nazw modelu (karta #145), nigdy referencja;
   * dla pozycji bez elementu: etykieta „cała sieć".
   */
  elementNazwa: string;
  /** Co zostało przekroczone (PL, z werdyktu backendu — nie liczone tutaj). */
  opis: string;
  /** Sformatowana wartość z jednostką (albo zakres oceny z werdyktu). */
  wartosc: string;
  /** Rodzaj przekroczenia (K1 / F-E6.3) — akcja kontekstowa `usePoprawWModelu`. */
  rodzaj?: RodzajPrzekroczenia;
  /**
   * Adres decyzji dla pozycji BEZ elementu modelu: zakładka przestrzeni
   * „Wyniki" z realnym oknem diagnostyki (deep-link `setWynikiTab`).
   */
  zakladkaWynikow?: string;
}

/**
 * Kolektor przekroczeń rozpływu: szyny z napięciem poza przedziałem. Czysty
 * (bez React) — ten sam werdykt `napiecePozaZakresem`, którego używa adapter
 * tabeli szyn (spójność werdyktu ekran↔rejestr). Karta W3-J: próg WYŁĄCZNIE
 * z `wynik.kryteria_napiecia`; brak kryteriów w wyniku (starszy zapisany
 * bieg) = uczciwy brak pozycji (nie da się ocenić bez progu), nigdy domyślna
 * liczba.
 */
export function przekroczeniaRozplywu(
  wynik: PowerFlowResultV1 | null,
  nazwa: NazwaObiektu,
): Przekroczenie[] {
  const kryteria = wynik?.kryteria_napiecia;
  if (!wynik || !kryteria) return [];
  return wynik.bus_results
    .filter((r) => napiecePozaZakresem(r.v_pu, kryteria))
    .map((r) => ({
      klucz: `rozplyw::napiecie::${r.bus_id}`,
      analizaPL: T.analizaRozplyw,
      elementRef: r.bus_id,
      elementTyp: 'Bus' as ElementType,
      elementNazwa: nazwa(r.bus_id),
      opis: r.v_pu > kryteria.ostrzezenie_max_pu ? T.opisNapiecieWysokie : T.opisNapiecieNiskie,
      wartosc: `${fmtPU(r.v_pu)} ${T.jednPU}`,
      rodzaj: 'napiecie' as RodzajPrzekroczenia,
    }));
}

/**
 * Kolektor zbieżności rozpływu (K6 / H-5 pkt 5 lit. d): brak zbieżności to
 * najpoważniejszy stan wyniku — wynik NIE JEST rozwiązaniem sieci. Pole
 * `converged` pochodzi wprost z kontraktu solvera; adres decyzji = okno
 * „Zbieżność" (diagnostyka iteracji), bo nie ma pojedynczego elementu winnego.
 */
export function przekroczeniaZbieznosci(wynik: PowerFlowResultV1 | null): Przekroczenie[] {
  if (!wynik || wynik.converged) return [];
  return [
    {
      klucz: 'rozplyw::zbieznosc',
      analizaPL: T.analizaRozplyw,
      elementRef: null,
      elementTyp: null,
      elementNazwa: T.elementCalaSiec,
      opis: T.opisBrakZbieznosci,
      wartosc: T.iteracje(wynik.iterations_count),
      zakladkaWynikow: 'zbieznosc',
    },
  ];
}

/**
 * Kolektor werdyktu projektowego (K6 / H-5 pkt 5 lit. a-c): kryteria w stanie
 * NARUSZONE — obciążenie gałęzi/transformatorów, wytrzymałość cieplna,
 * wiarygodność prądu zwarciowego, bilans mocy biernej, budżet strat, punkt
 * przyłączenia. Stany, liczniki i element wiodący POLICZYŁ backend.
 *
 * `pomijajNapiecia` — deduplikacja z kolektorem rozpływu (patrz nagłówek pliku).
 */
export function przekroczeniaWerdyktu(
  werdykt: OdpowiedzOceny | null,
  pomijajNapiecia: boolean,
  nazwa: NazwaObiektu,
): Przekroczenie[] {
  // Odpowiedź niezgodna z kontraktem (brak tablicy `pozycje`) NIE MOŻE wywrócić
  // rejestru — precedens `runStore.loadRuns` („runs is not iterable"): błąd
  // protokołu daje BRAK pozycji, nie awarię ekranu.
  if (!werdykt || !Array.isArray(werdykt.pozycje)) return [];
  return werdykt.pozycje
    .filter((p) => p.stan === 'NARUSZONE')
    .filter((p) => !(pomijajNapiecia && p.kryterium_id === 'napiecie.odchylenie'))
    .map((pozycja) => naPrzekroczenieWerdyktu(pozycja, nazwa));
}

function naPrzekroczenieWerdyktu(pozycja: PozycjaOceny, nazwa: NazwaObiektu): Przekroczenie {
  const typ = typElementuKryterium(pozycja);
  const ref = typ ? pozycja.wiodacy_element_id : null;
  return {
    klucz: `werdykt::${pozycja.kryterium_id}`,
    analizaPL: T.analizaWerdykt,
    elementRef: ref,
    elementTyp: typ,
    elementNazwa: ref === null ? T.elementCalaSiec : nazwa(ref),
    opis: pozycja.wiodacy_opis_pl ?? pozycja.nazwa_pl,
    wartosc: T.naruszen(pozycja.liczba_naruszen),
    rodzaj: rodzajPrzekroczeniaKryterium(pozycja),
  };
}

/** Projekcja read-only rejestru: lista przekroczeń + czy jest jakikolwiek przebieg. */
export interface RejestrPrzekroczen {
  przekroczenia: Przekroczenie[];
  /** Czy istnieje jakikolwiek zakończony przebieg (rozróżnia „brak przebiegu"
   * od „sieć w normie" — uczciwe stany zerowe, FLOW §0). */
  maPrzebieg: boolean;
  /**
   * Wynik rozpływu istnieje, ale nie niesie `kryteria_napiecia` (starszy
   * zapisany bieg sprzed W3-J albo zasiew bez kryteriów): napięć NIE DA SIĘ
   * ocenić. To osobny stan ekranu „brak podstaw do oceny", nigdy „sieć w normie"
   * (pusta lista przekroczeń bez progu nie jest dowodem poprawności — zasada
   * normowa B-02: brak wiarygodnej podstawy = BRAK PODSTAW DO OCENY).
   */
  brakKryteriowNapiec: boolean;
  /**
   * Stan odczytu werdyktu projektowego przypadku (`wczytywanie`/`blad`) albo `null`
   * — nic nie oczekuje (werdykt wczytany albo brak aktywnego przypadku). Dopóki
   * odczyt trwa albo się nie powiódł, pusta lista przekroczeń NIE jest wnioskiem
   * „sieć w normie" (KONTRAKT_WERDYKTU_WYJASNIALNEGO: brak danych ≠ spełnia).
   */
  odczytOceny: OdczytOceny | null;
}

/** Stan odczytu werdyktu projektowego, który wstrzymuje wniosek z pustej listy. */
export type OdczytOceny = 'wczytywanie' | 'blad';

/** Stan dostawcy werdyktu projektowego przypadku — rozłączne stany zapytania. */
export type StanWerdyktuPrzypadku =
  /** Brak aktywnego przypadku — nie ma werdyktu do odczytu (nic nie trwa). */
  | { readonly stan: 'niezlecony' }
  | { readonly stan: 'wczytywanie' }
  | { readonly stan: 'blad' }
  | { readonly stan: 'gotowe'; readonly werdykt: OdpowiedzOceny };

/** Rozłączny wniosek ekranu, gdy lista przekroczeń jest pusta (albo `null` — lista niepusta). */
export type WniosekPustejListy =
  | 'brak_przebiegu'
  | 'ocena_wczytywanie'
  | 'ocena_blad'
  | 'brak_kryteriow'
  | 'w_normie';

/**
 * JEDNO źródło prawdy dla stanu zerowego ekranu: kolejność rozstrzygnięć
 * (brak przebiegu → odczyt oceny w toku/nieudany → brak kryteriów → w normie).
 * „Sieć w normie" wyłącznie, gdy jest przebieg, nic nie oczekuje na odczyt
 * i wynik niesie kryteria napięciowe.
 */
export function wniosekPustejListy(rejestr: RejestrPrzekroczen): WniosekPustejListy | null {
  if (!rejestr.maPrzebieg) return 'brak_przebiegu';
  if (rejestr.przekroczenia.length > 0) return null;
  if (rejestr.odczytOceny === 'wczytywanie') return 'ocena_wczytywanie';
  if (rejestr.odczytOceny === 'blad') return 'ocena_blad';
  if (rejestr.brakKryteriowNapiec) return 'brak_kryteriow';
  return 'w_normie';
}

/**
 * Werdykt projektowy aktywnego przypadku — pobierany po zmianie przypadku i po
 * KAŻDYM zakończonym biegu (magistrala `wyniki-gotowe`), aby rejestr nie
 * pokazywał stanu sprzed przeliczenia. Stany rozłączne (`StanWerdyktuPrzypadku`):
 * odczyt w toku i błąd odczytu są ROZPOZNANE — nie zlewają się z „brak pozycji
 * werdyktu" (wtedy ekran wnioskowałby „sieć w normie" z danych, których nie ma).
 * Ponowny odczyt (nowy bieg) wraca do `wczytywanie`: werdykt sprzed biegu jest
 * nieaktualny i nie może stać za wnioskiem ekranu.
 */
export function useWerdyktPrzypadku(): StanWerdyktuPrzypadku {
  const caseId = useAppStateStore((s) => s.activeCaseId);
  const [stan, setStan] = useState<StanWerdyktuPrzypadku>(
    caseId ? { stan: 'wczytywanie' } : { stan: 'niezlecony' },
  );
  const [odswiezenie, setOdswiezenie] = useState(0);

  useEffect(() => subskrybuj('wyniki-gotowe', () => setOdswiezenie((n) => n + 1)), []);

  useEffect(() => {
    if (!caseId) {
      setStan({ stan: 'niezlecony' });
      return;
    }
    let anulowane = false;
    setStan({ stan: 'wczytywanie' });
    fetchOcenaTechniczna(caseId)
      .then((odpowiedz) => {
        if (!anulowane) setStan({ stan: 'gotowe', werdykt: odpowiedz });
      })
      .catch(() => {
        if (!anulowane) setStan({ stan: 'blad' });
      });
    return () => {
      anulowane = true;
    };
  }, [caseId, odswiezenie]);

  // Przypadek zmieniony, efekt jeszcze nie ruszył — stan poprzedniego przypadku
  // nie może przeciec do bieżącego renderu.
  if (!caseId) return { stan: 'niezlecony' };
  return stan;
}

/** Czyta i konsoliduje przekroczenia ze store'ów analiz (read-only, zero fizyki). */
export function useRejestrPrzekroczen(): RejestrPrzekroczen {
  const wynikRozplywu = usePowerFlowResultsStore((s) => s.results);
  const przebiegi = useExecutionRunsStore((s) => s.runs);
  const stanWerdyktu = useWerdyktPrzypadku();
  const werdykt = stanWerdyktu.stan === 'gotowe' ? stanWerdyktu.werdykt : null;
  const nazwaObiektu = useNazwaObiektu();

  const przekroczenia = useMemo(() => {
    const zRozplywu = przekroczeniaRozplywu(wynikRozplywu, nazwaObiektu);
    return [
      ...zRozplywu,
      ...przekroczeniaZbieznosci(wynikRozplywu),
      ...przekroczeniaWerdyktu(werdykt, zRozplywu.length > 0, nazwaObiektu),
    ];
  }, [wynikRozplywu, werdykt, nazwaObiektu]);

  // Prawda o istnieniu przebiegu: rejestr przebiegów (dowolny rodzaj analizy,
  // status DONE) albo załadowany wynik rozpływu — patrz defekt w nagłówku pliku.
  const maPrzebieg =
    wynikRozplywu !== null || przebiegi.some((przebieg) => przebieg.status === 'DONE');

  const brakKryteriowNapiec = brakKryteriowRozplywu(wynikRozplywu);

  const odczytOceny: OdczytOceny | null =
    stanWerdyktu.stan === 'wczytywanie' || stanWerdyktu.stan === 'blad' ? stanWerdyktu.stan : null;

  return { przekroczenia, maPrzebieg, brakKryteriowNapiec, odczytOceny };
}

/**
 * Czy wynik rozpływu istnieje bez kryteriów napięciowych — para predykatów z
 * `przekroczeniaRozplywu` (ten sam warunek `!kryteria` decyduje tam o pustej
 * liście, tu o stanie „brak podstaw"): jedno źródło prawdy, bez drugiej,
 * niezależnej definicji „brak kryteriów".
 */
export function brakKryteriowRozplywu(wynik: PowerFlowResultV1 | null): boolean {
  return wynik !== null && !wynik.kryteria_napiecia;
}
