/*
 * Model i CZYSTA orkiestracja kreatora studium przyłączenia (ui2/oze/studium,
 * karta P35). Sekwencyjna kolejka zapytań do ISTNIEJĄCYCH końcówek OZE (`../api`)
 * dla wielu wariantów węzłów + agregacja odpowiedzi na wiersze WSPÓLNEGO WZORCA
 * EKRANU ANALIZY (`ui2/wyniki/wzorzec`).
 *
 * Granice (NOT-A-SOLVER): zero fizyki, zero ocen lokalnych, zero nowych końcówek.
 * Jedyna arytmetyka to PREZENTACJA: przyrost strat [kW] i klasa NC RfG REUŻYTE
 * importem z okna „Ranking punktów przyłączenia" (`../ranking/rankingModel`),
 * a pasmo Q to ODCZYT wierzchołka obszaru najbliższego mocy typu (bez interpolacji).
 * Runner nigdy nie rzuca wyjątkiem — błąd jednego wariantu nie przerywa pozostałych.
 */

import type {
  KlasaModuluNcRfg,
  RekordKonwertera,
  WezelZdolnosci,
  WidokObszaruPQ,
  WidokPokryciaPQ,
  WidokZdolnosci,
  WierzcholekObszaruPQ,
  ZapytanieObszaruPQ,
  ZapytaniePokryciaPQ,
  ZapytanieZdolnosci,
} from '../api';
import type { DefinicjaKolumny, WartoscKomorki, WierszTabeli } from '../../wyniki/wzorzec';
import { klasaNcRfg, przyrostStratKw } from '../ranking/rankingModel';
import { fmtMocMW, fmtStratyKw } from '../ranking/strings';
import { fmtMvarObszar } from '../obszar/strings';
import { STUDIUM_STRINGS } from './strings';

// ---------------------------------------------------------------------------
// Rodzaj źródła → rodzaj katalogu konwerterów (PV/BESS/WIND)
// ---------------------------------------------------------------------------

/** Rodzaj źródła OZE w kreatorze (PV / BESS / FW = farma wiatrowa). */
export type RodzajZrodlaStudium = 'PV' | 'BESS' | 'FW';

/** Opcja rodzaju źródła: etykieta PL + odpowiadający `kind` katalogu konwerterów. */
export interface OpcjaRodzajuStudium {
  readonly rodzaj: RodzajZrodlaStudium;
  readonly etykieta: string;
  readonly kindKatalogu: string;
}

/**
 * `kind` katalogu konwerterów (`ConverterKind`) dla rodzaju kreatora. FW (farma
 * wiatrowa) odwzorowuje katalogowy `WIND`; PV/BESS mają identyczne kody.
 */
export function kindKataloguDlaRodzaju(rodzaj: RodzajZrodlaStudium): string {
  return rodzaj === 'FW' ? 'WIND' : rodzaj;
}

/** Opcje rodzaju źródła (kolejność stała = układ listy). */
export function opcjeRodzajuStudium(): OpcjaRodzajuStudium[] {
  return [
    { rodzaj: 'PV', etykieta: STUDIUM_STRINGS.rodzajPV, kindKatalogu: 'PV' },
    { rodzaj: 'BESS', etykieta: STUDIUM_STRINGS.rodzajBESS, kindKatalogu: 'BESS' },
    { rodzaj: 'FW', etykieta: STUDIUM_STRINGS.rodzajFW, kindKatalogu: 'WIND' },
  ];
}

/** Rekordy katalogu pasujące do rodzaju (kolejność źródłowa, bez sortowania). */
export function konwerteryRodzaju(
  rekordy: readonly RekordKonwertera[],
  rodzaj: RodzajZrodlaStudium,
): RekordKonwertera[] {
  const kind = kindKataloguDlaRodzaju(rodzaj);
  return rekordy.filter((r) => r.kind === kind);
}

/** Domyślny (pierwszy) rekord katalogu pasujący do rodzaju; brak → `null`. */
export function domyslnyKonwerter(
  rekordy: readonly RekordKonwertera[],
  rodzaj: RodzajZrodlaStudium,
): RekordKonwertera | null {
  return konwerteryRodzaju(rekordy, rodzaj)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Orkiestracja sekwencyjna — kolejka zapytań per wariant/faza
// ---------------------------------------------------------------------------

/** Faza analizy studium w ramach wariantu (kolejność deterministyczna). */
export type FazaStudium = 'zdolnosc' | 'obszar' | 'pokrycie';

/** Kolejność faz w ramach wariantu (hosting-capacity → pq-area → pq-coverage). */
export const FAZY_STUDIUM: readonly FazaStudium[] = ['zdolnosc', 'obszar', 'pokrycie'];

/** Status pojedynczej fazy analizy (uczciwy postęp). */
export type StatusFazyStudium = 'oczekuje' | 'w-toku' | 'gotowe' | 'blad';

/** Parametry biegu studium (jeden typ katalogowy + operator dla wszystkich wariantów). */
export interface ParametryStudium {
  readonly runId: string;
  /** Bus refs w KOLEJNOŚCI WYBORU — determinuje kolejność biegów. */
  readonly warianty: readonly string[];
  readonly catalogItemId: string;
  readonly operatorId: string;
}

/**
 * Klient studium — wstrzykiwany zestaw ISTNIEJĄCYCH funkcji `../api`. Umożliwia
 * deterministyczny test kolejności wywołań i odporności na błąd (bez sieci).
 */
export interface KlientStudium {
  zdolnosc(zapytanie: ZapytanieZdolnosci): Promise<WidokZdolnosci>;
  obszar(zapytanie: ZapytanieObszaruPQ): Promise<WidokObszaruPQ>;
  pokrycie(zapytanie: ZapytaniePokryciaPQ): Promise<WidokPokryciaPQ>;
}

/** Zdarzenie postępu emitowane przez runner (typowane danymi per faza). */
export type ZdarzenieStudium =
  | { readonly typ: 'start'; readonly busRef: string; readonly faza: FazaStudium }
  | { readonly typ: 'sukces'; readonly busRef: string; readonly faza: 'zdolnosc'; readonly dane: WidokZdolnosci }
  | { readonly typ: 'sukces'; readonly busRef: string; readonly faza: 'obszar'; readonly dane: WidokObszaruPQ }
  | { readonly typ: 'sukces'; readonly busRef: string; readonly faza: 'pokrycie'; readonly dane: WidokPokryciaPQ }
  | { readonly typ: 'blad'; readonly busRef: string; readonly faza: FazaStudium; readonly komunikat: string };

function komunikatBledu(blad: unknown): string {
  return blad instanceof Error ? blad.message : STUDIUM_STRINGS.bladNieznany;
}

/**
 * Przeprowadź studium SEKWENCYJNIE: dla każdego wariantu (w kolejności wyboru)
 * kolejno hosting-capacity → pq-area → pq-coverage. Każda faza emituje `start`,
 * a następnie `sukces` lub `blad`. Runner NIGDY nie rzuca — błąd fazy/wariantu
 * jest odnotowany i bieg kontynuuje pozostałe fazy/warianty (kryterium 2).
 */
export async function przeprowadzStudium(
  params: ParametryStudium,
  klient: KlientStudium,
  emit: (zdarzenie: ZdarzenieStudium) => void,
): Promise<void> {
  for (const busRef of params.warianty) {
    // Faza 1 — zdolność przyłączeniowa (hosting-capacity) dla wariantu.
    emit({ typ: 'start', busRef, faza: 'zdolnosc' });
    try {
      const dane = await klient.zdolnosc({ runId: params.runId, candidateBusRefs: [busRef] });
      emit({ typ: 'sukces', busRef, faza: 'zdolnosc', dane });
    } catch (blad) {
      emit({ typ: 'blad', busRef, faza: 'zdolnosc', komunikat: komunikatBledu(blad) });
    }

    // Faza 2 — obszar bezpiecznej pracy P–Q (pq-area, parametry domyślne backendu).
    emit({ typ: 'start', busRef, faza: 'obszar' });
    try {
      const dane = await klient.obszar({ runId: params.runId, busRef });
      emit({ typ: 'sukces', busRef, faza: 'obszar', dane });
    } catch (blad) {
      emit({ typ: 'blad', busRef, faza: 'obszar', komunikat: komunikatBledu(blad) });
    }

    // Faza 3 — pokrycie wymagania operatora (pq-coverage, typ + operator).
    emit({ typ: 'start', busRef, faza: 'pokrycie' });
    try {
      const dane = await klient.pokrycie({
        catalogItemId: params.catalogItemId,
        operatorId: params.operatorId,
      });
      emit({ typ: 'sukces', busRef, faza: 'pokrycie', dane });
    } catch (blad) {
      emit({ typ: 'blad', busRef, faza: 'pokrycie', komunikat: komunikatBledu(blad) });
    }
  }
}

// ---------------------------------------------------------------------------
// Stan agregujący — reducer czystym zdarzeniem (bez wołań API/store'ów)
// ---------------------------------------------------------------------------

/** Stan pojedynczej fazy z ewentualnymi danymi/komunikatem. */
export interface StanFazyStudium<T> {
  readonly status: StatusFazyStudium;
  readonly dane: T | null;
  readonly komunikat: string | null;
}

/** Zagregowany wynik wariantu (trzy fazy). */
export interface WynikWariantuStudium {
  readonly busRef: string;
  readonly zdolnosc: StanFazyStudium<WidokZdolnosci>;
  readonly obszar: StanFazyStudium<WidokObszaruPQ>;
  readonly pokrycie: StanFazyStudium<WidokPokryciaPQ>;
}

/** Stan całego studium: mapa bus_ref → wynik wariantu (kolejność = wybór). */
export type StanStudium = ReadonlyMap<string, WynikWariantuStudium>;

function pustaFaza<T>(): StanFazyStudium<T> {
  return { status: 'oczekuje', dane: null, komunikat: null };
}

/** Pusty wariant (trzy fazy „oczekuje"). */
export function pustyWariantStudium(busRef: string): WynikWariantuStudium {
  return {
    busRef,
    zdolnosc: pustaFaza<WidokZdolnosci>(),
    obszar: pustaFaza<WidokObszaruPQ>(),
    pokrycie: pustaFaza<WidokPokryciaPQ>(),
  };
}

/** Stan początkowy: wszystkie warianty w kolejności wyboru, fazy „oczekuje". */
export function stanPoczatkowyStudium(warianty: readonly string[]): StanStudium {
  return new Map(warianty.map((busRef) => [busRef, pustyWariantStudium(busRef)]));
}

function fazaZdarzenia<T>(zdarzenie: ZdarzenieStudium, dane: T | null): StanFazyStudium<T> {
  if (zdarzenie.typ === 'start') return { status: 'w-toku', dane: null, komunikat: null };
  if (zdarzenie.typ === 'sukces') return { status: 'gotowe', dane, komunikat: null };
  return { status: 'blad', dane: null, komunikat: zdarzenie.komunikat };
}

/** Zastosuj zdarzenie postępu do stanu (CZYSTA funkcja, nowa mapa). */
export function zastosujZdarzenieStudium(
  stan: StanStudium,
  zdarzenie: ZdarzenieStudium,
): StanStudium {
  const biezacy = stan.get(zdarzenie.busRef);
  if (biezacy === undefined) return stan;
  const nowy = new Map(stan);
  if (zdarzenie.faza === 'zdolnosc') {
    const dane = zdarzenie.typ === 'sukces' ? zdarzenie.dane : null;
    nowy.set(zdarzenie.busRef, { ...biezacy, zdolnosc: fazaZdarzenia(zdarzenie, dane) });
  } else if (zdarzenie.faza === 'obszar') {
    const dane = zdarzenie.typ === 'sukces' ? zdarzenie.dane : null;
    nowy.set(zdarzenie.busRef, { ...biezacy, obszar: fazaZdarzenia(zdarzenie, dane) });
  } else {
    const dane = zdarzenie.typ === 'sukces' ? zdarzenie.dane : null;
    nowy.set(zdarzenie.busRef, { ...biezacy, pokrycie: fazaZdarzenia(zdarzenie, dane) });
  }
  return nowy;
}

/** Czy w wariancie trwa jeszcze jakakolwiek faza (do etykiety postępu). */
export function wariantWToku(wariant: WynikWariantuStudium): boolean {
  return (
    wariant.zdolnosc.status === 'w-toku'
    || wariant.obszar.status === 'w-toku'
    || wariant.pokrycie.status === 'w-toku'
  );
}

// ---------------------------------------------------------------------------
// Odczyty pomocnicze — węzeł zdolności, wierzchołek obszaru najbliższy mocy typu
// ---------------------------------------------------------------------------

/** Węzeł zdolności odpowiadający wariantowi (bus_ref); brak → `null`. */
export function wezelWariantu(
  widok: WidokZdolnosci | null,
  busRef: string,
): WezelZdolnosci | null {
  if (widok === null) return null;
  return widok.nodes.find((wezel) => wezel.bus_ref === busRef) ?? null;
}

/**
 * Wierzchołek obszaru NAJBLIŻSZY zadanej mocy [MW] — dobór wiersza z danych, bez
 * interpolacji własnej. Remis (równa odległość) rozstrzyga niższy indeks (stabilnie,
 * deterministycznie). Pusta lista → `null`.
 */
export function wierzcholekNajblizszy(
  wierzcholki: readonly WierzcholekObszaruPQ[],
  pDoceloweMW: number,
): WierzcholekObszaruPQ | null {
  if (wierzcholki.length === 0) return null;
  let najlepszy = wierzcholki[0];
  let najlepszaOdleglosc = Math.abs(najlepszy.p_mw - pDoceloweMW);
  for (let i = 1; i < wierzcholki.length; i += 1) {
    const odleglosc = Math.abs(wierzcholki[i].p_mw - pDoceloweMW);
    if (odleglosc < najlepszaOdleglosc) {
      najlepszy = wierzcholki[i];
      najlepszaOdleglosc = odleglosc;
    }
  }
  return najlepszy;
}

/**
 * Pasmo mocy biernej Q [Mvar] w punkcie mocy źródła: odczyt wierzchołka obszaru
 * najbliższego `mocZrodlaMW`. Brak danych/pasma → tekst „—"/„Brak pasma" (bez oceny).
 */
export function pasmoQwPunkcie(widok: WidokObszaruPQ | null, mocZrodlaMW: number): string {
  if (widok === null) return STUDIUM_STRINGS.kreska;
  const wierzcholek = wierzcholekNajblizszy(widok.vertices, mocZrodlaMW);
  if (wierzcholek === null) return STUDIUM_STRINGS.kreska;
  if (
    !wierzcholek.feasible
    || wierzcholek.q_min_dop_mvar === null
    || wierzcholek.q_max_dop_mvar === null
  ) {
    return STUDIUM_STRINGS.brakPasma;
  }
  return (
    `${fmtMvarObszar(wierzcholek.q_min_dop_mvar)}${STUDIUM_STRINGS.rozdzielaczPasma}`
    + `${fmtMvarObszar(wierzcholek.q_max_dop_mvar)}`
  );
}

/** Werdykt pokrycia P–Q jako etykieta PL (wprost z flagi `werdykt.pokryty`). */
export function werdyktPokryciaPL(widok: WidokPokryciaPQ | null): string {
  if (widok === null) return STUDIUM_STRINGS.kreska;
  return widok.werdykt.pokryty
    ? STUDIUM_STRINGS.pokryciePokryte
    : STUDIUM_STRINGS.pokrycieNiepokryte;
}

// ---------------------------------------------------------------------------
// Tabela przeglądu zbiorczego — wzorzec `TabelaWynikow`
// ---------------------------------------------------------------------------

/** Klucz kolumny identyfikatora — stabilna tożsamość wiersza (bus_ref), ekspercko. */
export const KLUCZ_WIERSZA_STUDIUM = 'identyfikator';

/** Deklaratywne kolumny przeglądu (kolejność = układ tabeli wzorca). */
export function kolumnyStudium(): DefinicjaKolumny[] {
  return [
    { klucz: 'wariant', etykieta: STUDIUM_STRINGS.kolWariant },
    {
      klucz: KLUCZ_WIERSZA_STUDIUM,
      etykieta: STUDIUM_STRINGS.kolIdentyfikator,
      mono: true,
      tylkoEkspercki: true,
    },
    { klucz: 'moc', etykieta: STUDIUM_STRINGS.kolMoc, jednostka: STUDIUM_STRINGS.jednMW, mono: true },
    {
      klucz: 'straty',
      etykieta: STUDIUM_STRINGS.kolStraty,
      jednostka: STUDIUM_STRINGS.jednKW,
      mono: true,
    },
    { klucz: 'klasa', etykieta: STUDIUM_STRINGS.kolKlasa },
    { klucz: 'pokrycie', etykieta: STUDIUM_STRINGS.kolPokrycie },
    {
      klucz: 'pasmoQ',
      etykieta: STUDIUM_STRINGS.kolPasmoQ,
      jednostka: STUDIUM_STRINGS.jednMvar,
      mono: true,
      sortowalna: false, // pasmo min…max — nie sortujemy pojedynczą liczbą
    },
  ];
}

/** Kontekst budowy wierszy (nazwa/napięcie węzła, klasy operatora, moc typu). */
export interface KontekstWierszaStudium {
  readonly nazwaWezla: (busRef: string) => string;
  readonly napiecieWezla: (busRef: string) => number | null;
  readonly klasy: readonly KlasaModuluNcRfg[];
  readonly mocZrodlaMW: number;
}

function komorkaMocStudium(wezel: WezelZdolnosci | null): WartoscKomorki {
  if (wezel === null) return { wartosc: STUDIUM_STRINGS.kreska };
  const moc = wezel.max_hosting_capacity_mw;
  return { wartosc: fmtMocMW(moc), sortKey: moc };
}

function komorkaStratStudium(wezel: WezelZdolnosci | null): WartoscKomorki {
  if (wezel === null) return { wartosc: STUDIUM_STRINGS.kreska };
  const przyrost = przyrostStratKw(wezel);
  if (przyrost === null) return { wartosc: STUDIUM_STRINGS.kreska };
  return { wartosc: fmtStratyKw(przyrost), sortKey: przyrost };
}

function komorkaKlasaStudium(
  wezel: WezelZdolnosci | null,
  napiecieKv: number | null,
  klasy: readonly KlasaModuluNcRfg[],
): WartoscKomorki {
  if (wezel === null) return { wartosc: STUDIUM_STRINGS.kreska };
  const klasa = klasaNcRfg(wezel.max_hosting_capacity_mw, napiecieKv, klasy);
  return { wartosc: klasa !== null ? klasa.id : STUDIUM_STRINGS.kreska };
}

/** Wiersz przeglądu dla jednego wariantu (semantyka `ValueRow`). */
export function wierszStudium(
  wariant: WynikWariantuStudium,
  kontekst: KontekstWierszaStudium,
): WierszTabeli {
  const wezel = wezelWariantu(wariant.zdolnosc.dane, wariant.busRef);
  const napiecieKv = kontekst.napiecieWezla(wariant.busRef);
  return {
    wariant: { wartosc: kontekst.nazwaWezla(wariant.busRef) },
    [KLUCZ_WIERSZA_STUDIUM]: { wartosc: wariant.busRef },
    moc: komorkaMocStudium(wezel),
    straty: komorkaStratStudium(wezel),
    klasa: komorkaKlasaStudium(wezel, napiecieKv, kontekst.klasy),
    pokrycie: { wartosc: werdyktPokryciaPL(wariant.pokrycie.dane) },
    pasmoQ: { wartosc: pasmoQwPunkcie(wariant.obszar.dane, kontekst.mocZrodlaMW) },
  };
}

/**
 * Wiersze przeglądu w KOLEJNOŚCI WYBORU wariantów (kolejność wstawienia mapy).
 * Użytkownik może przesortować kolumny klikiem w tabeli wzorca.
 */
export function wierszeStudium(
  stan: StanStudium,
  kontekst: KontekstWierszaStudium,
): WierszTabeli[] {
  const wiersze: WierszTabeli[] = [];
  for (const wariant of stan.values()) {
    wiersze.push(wierszStudium(wariant, kontekst));
  }
  return wiersze;
}
