import { komunikatZapytania } from '../shared/bladZapytania';
/**
 * Klient stanu zasilenia i toru zasilania z topologii łączeniowej (karta K6a, UI-07/UI-08).
 *
 * Endpointy (backend `api/enm.py`, kontrakt `application/topologia_zasilenia.py`):
 * - GET /api/cases/{caseId}/enm/topologia/zasilenie → `StanZasileniaOdpowiedz`
 * - GET /api/cases/{caseId}/enm/topologia/tor?element_ref=… → `TorElementuOdpowiedz`
 *
 * Jedna prawda topologii: backend wyprowadza zasilenie z `enm.topology.derive` — front go
 * nie liczy. Podstawa odpowiedzi to ZAWSZE `topologia_laczeniowa`: to nie jest wynik obliczeń
 * napięciowych, więc konsument nie może przedstawiać go jako „pod napięciem” z wyniku.
 * Klient odrzuca odpowiedź o innej podstawie (kontrakt złamany = błąd, nie cicha zgoda).
 * Kształt typów jest przypięty do snapshotu OpenAPI testem `__tests__/topologiaZasilenia.test.ts`.
 */

export const PODSTAWA_TOPOLOGII = 'topologia_laczeniowa' as const;

export const STANY_ZASILENIA = ['zasilany', 'niezasilany', 'nierozstrzygniety'] as const;
export const STANY_LACZNIKA = ['zamkniety', 'otwarty', 'nieustalony'] as const;
export const RODZAJE_ELEMENTU_TOPOLOGII = [
  'szyna',
  'odcinek',
  'lacznik',
  'transformator',
  'zrodlo',
  'generator',
  'odbior',
  'kondensator',
  'pole',
  'stacja',
] as const;
export const STATUSY_TORU = ['rozstrzygniety', 'nierozstrzygniety', 'brak_drogi'] as const;

export type StanZasilenia = (typeof STANY_ZASILENIA)[number];
export type StanLacznika = (typeof STANY_LACZNIKA)[number];
export type RodzajElementuTopologii = (typeof RODZAJE_ELEMENTU_TOPOLOGII)[number];
export type StatusToru = (typeof STATUSY_TORU)[number];

export interface PrzyczynaTopologii {
  kod: string;
  opis: string;
  elementy: string[];
}

export interface StronaElementu {
  szyna_ref: string;
  stan: StanZasilenia;
  zrodla: string[];
}

export interface StanZasileniaElementu {
  ref_id: string;
  rodzaj: RodzajElementuTopologii;
  typ: string | null;
  nazwa: string;
  stan: StanZasilenia;
  zrodla: string[];
  zrodla_warunkowe: string[];
  otwarty: boolean;
  stan_lacznika: StanLacznika | null;
  wyspy: number[];
  strony: StronaElementu[];
  przyczyny: PrzyczynaTopologii[];
}

export interface WyspaTopologiczna {
  indeks: number;
  szyny: string[];
  zrodla_sieciowe: string[];
  generatory: string[];
  zasilona: boolean;
}

export interface LacznikNieustalony {
  ref_id: string;
  nazwa: string;
  stan_w_modelu: 'zamkniety' | 'otwarty';
  stan_zgloszony: string;
  aparat_ref: string;
  pole_ref: string;
  przyczyna: PrzyczynaTopologii;
}

export interface StanZasileniaOdpowiedz {
  case_id: string;
  enm_revision: number;
  enm_hash: string;
  podstawa: typeof PODSTAWA_TOPOLOGII;
  opis_podstawy: string;
  elementy: StanZasileniaElementu[];
  wyspy: WyspaTopologiczna[];
  laczniki_otwarte: string[];
  galezie_otwarte: string[];
  laczniki_nieustalone: LacznikNieustalony[];
  krawedzie_pominiete: string[];
}

export interface OdnosnikElementu {
  ref_id: string;
  rodzaj: RodzajElementuTopologii;
  typ: string | null;
  nazwa: string;
}

export interface ElementDrogi extends OdnosnikElementu {
  stan_lacznika: StanLacznika | null;
  pole_ref: string | null;
  stacja_ref: string | null;
}

export interface DrogaZasilania {
  zrodlo_ref: string;
  pewna: boolean;
  elementy: ElementDrogi[];
  laczniki_nieustalone: string[];
}

export interface PrzekladnikPola {
  ref_id: string;
  nazwa: string;
  rodzaj: 'CT' | 'VT';
  pole_ref: string | null;
}

export interface ZabezpieczeniePola {
  ref_id: string;
  nazwa: string;
  rodzaj: string;
  wylacznik_ref: string;
  aktywne: boolean;
}

export interface SasiedztwoElementu {
  kierunek_ustalony: boolean;
  poprzednie: OdnosnikElementu[];
  nastepne: OdnosnikElementu[];
  pola_wejsciowe: OdnosnikElementu[];
  pola_wyjsciowe: OdnosnikElementu[];
  pole: OdnosnikElementu | null;
  stacja: OdnosnikElementu | null;
  przekladniki: PrzekladnikPola[];
  zabezpieczenia: ZabezpieczeniePola[];
}

export interface TorElementuOdpowiedz {
  case_id: string;
  enm_revision: number;
  enm_hash: string;
  podstawa: typeof PODSTAWA_TOPOLOGII;
  opis_podstawy: string;
  element: OdnosnikElementu;
  stan: StanZasilenia;
  status: StatusToru;
  przyczyny: PrzyczynaTopologii[];
  drogi: DrogaZasilania[];
  drogi_obciete: boolean;
  sasiedztwo: SasiedztwoElementu;
}

/**
 * Pełna lista kluczy typu `T` — kompilator odmawia listy niepełnej albo z kluczem obcym, więc
 * lista jest wiernym odbiciem interfejsu; test przypina ją do schematu OpenAPI backendu.
 */
function kluczeTypu<T>() {
  return <const K extends readonly (keyof T)[]>(
    klucze: K & ([Exclude<keyof T, K[number]>] extends [never] ? unknown : never),
  ): K => klucze;
}

/** Klucze każdego modelu kontraktu (nazwa = nazwa schematu w OpenAPI backendu). */
export const KLUCZE_KONTRAKTU = {
  PrzyczynaTopologii: kluczeTypu<PrzyczynaTopologii>()(['kod', 'opis', 'elementy']),
  StronaElementu: kluczeTypu<StronaElementu>()(['szyna_ref', 'stan', 'zrodla']),
  StanZasileniaElementu: kluczeTypu<StanZasileniaElementu>()([
    'ref_id',
    'rodzaj',
    'typ',
    'nazwa',
    'stan',
    'zrodla',
    'zrodla_warunkowe',
    'otwarty',
    'stan_lacznika',
    'wyspy',
    'strony',
    'przyczyny',
  ]),
  WyspaTopologiczna: kluczeTypu<WyspaTopologiczna>()([
    'indeks',
    'szyny',
    'zrodla_sieciowe',
    'generatory',
    'zasilona',
  ]),
  LacznikNieustalony: kluczeTypu<LacznikNieustalony>()([
    'ref_id',
    'nazwa',
    'stan_w_modelu',
    'stan_zgloszony',
    'aparat_ref',
    'pole_ref',
    'przyczyna',
  ]),
  StanZasileniaOdpowiedz: kluczeTypu<StanZasileniaOdpowiedz>()([
    'case_id',
    'enm_revision',
    'enm_hash',
    'podstawa',
    'opis_podstawy',
    'elementy',
    'wyspy',
    'laczniki_otwarte',
    'galezie_otwarte',
    'laczniki_nieustalone',
    'krawedzie_pominiete',
  ]),
  OdnosnikElementu: kluczeTypu<OdnosnikElementu>()(['ref_id', 'rodzaj', 'typ', 'nazwa']),
  ElementDrogi: kluczeTypu<ElementDrogi>()([
    'ref_id',
    'rodzaj',
    'typ',
    'nazwa',
    'stan_lacznika',
    'pole_ref',
    'stacja_ref',
  ]),
  DrogaZasilania: kluczeTypu<DrogaZasilania>()([
    'zrodlo_ref',
    'pewna',
    'elementy',
    'laczniki_nieustalone',
  ]),
  PrzekladnikPola: kluczeTypu<PrzekladnikPola>()(['ref_id', 'nazwa', 'rodzaj', 'pole_ref']),
  ZabezpieczeniePola: kluczeTypu<ZabezpieczeniePola>()([
    'ref_id',
    'nazwa',
    'rodzaj',
    'wylacznik_ref',
    'aktywne',
  ]),
  SasiedztwoElementu: kluczeTypu<SasiedztwoElementu>()([
    'kierunek_ustalony',
    'poprzednie',
    'nastepne',
    'pola_wejsciowe',
    'pola_wyjsciowe',
    'pole',
    'stacja',
    'przekladniki',
    'zabezpieczenia',
  ]),
  TorElementuOdpowiedz: kluczeTypu<TorElementuOdpowiedz>()([
    'case_id',
    'enm_revision',
    'enm_hash',
    'podstawa',
    'opis_podstawy',
    'element',
    'stan',
    'status',
    'przyczyny',
    'drogi',
    'drogi_obciete',
    'sasiedztwo',
  ]),
} as const;

/** Błąd klienta topologii — status HTTP i treść `detail` backendu. */
export class BladTopologiiZasilenia extends Error {
  constructor(
    public readonly status: number,
    public readonly szczegoly: unknown,
    public readonly endpoint: string,
  ) {
    super(komunikatZapytania({ status }, 'Nie udało się pobrać topologii zasilenia'));
    this.name = 'BladTopologiiZasilenia';
  }
}

async function pobierz<T extends { podstawa: string }>(
  endpoint: string,
  klucze: readonly string[],
): Promise<T> {
  const odpowiedz = await fetch(endpoint);
  if (!odpowiedz.ok) {
    const szczegoly = await odpowiedz.json().catch(() => null);
    throw new BladTopologiiZasilenia(odpowiedz.status, szczegoly, endpoint);
  }
  const dane = (await odpowiedz.json()) as T;
  if (dane.podstawa !== PODSTAWA_TOPOLOGII) {
    throw new BladTopologiiZasilenia(
      odpowiedz.status,
      `nieoczekiwana podstawa odpowiedzi: ${String(dane.podstawa)}`,
      endpoint,
    );
  }
  const brakujace = klucze.filter((klucz) => !(klucz in dane));
  if (brakujace.length > 0) {
    throw new BladTopologiiZasilenia(
      odpowiedz.status,
      `odpowiedź bez pól kontraktu: ${brakujace.join(', ')}`,
      endpoint,
    );
  }
  return dane;
}

/** Stan zasilenia każdego elementu modelu (topologia łączeniowa, nie wynik obliczeń). */
export function pobierzStanZasilenia(caseId: string): Promise<StanZasileniaOdpowiedz> {
  return pobierz<StanZasileniaOdpowiedz>(
    `/api/cases/${encodeURIComponent(caseId)}/enm/topologia/zasilenie`,
    KLUCZE_KONTRAKTU.StanZasileniaOdpowiedz,
  );
}

/** Tor elementu: drogi od źródeł, status rozstrzygnięcia i sąsiedztwo nawigacyjne. */
export function pobierzTorElementu(
  caseId: string,
  elementRef: string,
): Promise<TorElementuOdpowiedz> {
  const zapytanie = new URLSearchParams({ element_ref: elementRef });
  return pobierz<TorElementuOdpowiedz>(
    `/api/cases/${encodeURIComponent(caseId)}/enm/topologia/tor?${zapytanie.toString()}`,
    KLUCZE_KONTRAKTU.TorElementuOdpowiedz,
  );
}
