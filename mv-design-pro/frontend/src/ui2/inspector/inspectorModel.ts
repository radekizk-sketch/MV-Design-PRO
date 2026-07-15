/*
 * Model danych inspektora kontekstowego (okno W-110/W-602, karta E1.3).
 *
 * Inspektor jest W PEŁNI STEROWANY PROPSAMI (karta §3): te typy opisują wyłącznie
 * PROJEKCJĘ jednego snapshotu modelu i wyników, przekazywaną z zewnątrz. Zero wołań
 * API, zero czytania store'ów danych — adaptery powstaną w karcie integracyjnej.
 *
 * Każda dana pochodna niesie rewizję modelu, z której powstała (SPEC_POWIAZANIA §3):
 * rozjazd rewizji = znacznik „nieaktualne" + akcja „Przelicz". Identyfikatory
 * techniczne pojawiają się WYŁĄCZNIE w sekcji „Szczegóły techniczne" (tryb Ekspercki).
 */

import type { AdvancementMode } from '../shell/modeModel';

/** Stała identyfikacja zakładek inspektora (kolejność zamrożona). */
export type ZakladkaInspektora = 'wlasciwosci' | 'wyniki' | 'dowod' | 'powiazania';

export const ZAKLADKI: readonly ZakladkaInspektora[] = [
  'wlasciwosci',
  'wyniki',
  'dowod',
  'powiazania',
];

/**
 * Wartość liczbowa/tekstowa z jednostką i metadanymi pochodzenia.
 * `rewizja` obecna wyłącznie dla danych POCHODNYCH (wyniki, wielkości liczone).
 */
export interface WartoscZJednostka {
  wartosc: string | number;
  jednostka?: string;
  /** Rewizja modelu, z której dana pochodna została policzona. */
  rewizja?: number;
  /** Odwołanie do dowodu WHITE BOX (2× klik → onOtworzDowod). */
  dowodRef?: string;
  /** Źródło pochodzenia danej (pokazywane w dymku „Pochodzenie: {zrodlo}"). */
  pochodzenie?: string;
}

/** Pojedynczy wiersz siatki właściwości: etykieta PL + wartość. */
export interface WierszWlasciwosci {
  etykieta: string;
  wartosc: WartoscZJednostka;
}

/**
 * Sekcja akordeonowa siatki właściwości.
 * `zaawansowana` = domyślnie zwinięta (grupa „Zaawansowane"), stan pamiętany per typ.
 * `bledy` niepuste = sekcja wymuszona otwarta (błędu nie wolno chować pod „Zaawansowane").
 */
export interface SekcjaWlasciwosci {
  id: string;
  tytul: string;
  wiersze: WierszWlasciwosci[];
  zaawansowana?: boolean;
  bledy?: string[];
}

/** Cel nawigacji przekazywany do `onNawiguj` po kliknięciu pozycji Powiązań. */
export interface CelNawigacji {
  id: string;
  typ?: string;
}

/** Pozycja listy powiązań (wchodzących lub wychodzących). */
export interface PozycjaPowiazania {
  cel: CelNawigacji;
  etykieta: string;
  /** Etykieta PL rodzaju relacji (np. „zasila", „chroni"). */
  relacja?: string;
}

/** Powiązania obiektu: dwukierunkowe (W-602). */
export interface PowiazaniaObiektu {
  wchodzace: PozycjaPowiazania[];
  wychodzace: PozycjaPowiazania[];
}

/** Pozycja zakładki Dowód: odwołanie do dowodu WHITE BOX. */
export interface PozycjaDowodu {
  ref: string;
  etykieta: string;
  rewizja?: number;
}

/** Para techniczna widoczna wyłącznie w „Szczegóły techniczne" (tryb Ekspercki). */
export interface SzczegolTechniczny {
  klucz: string;
  wartosc: string;
}

/**
 * Obiekt prezentowany w inspektorze — projekcja jednego elementu modelu/wyniku.
 * `typ` służy WYŁĄCZNIE jako klucz pamięci akordeonów (per typ obiektu) i nie jest
 * pokazywany na pierwszym planie; etykieta typu do wyświetlenia to `typEtykieta`.
 */
export interface ObiektInspektora {
  /** Identyfikator techniczny — pokazywany tylko w „Szczegóły techniczne". */
  id: string;
  /** Klucz typu obiektu (pamięć akordeonów per typ). */
  typ: string;
  /** Etykieta PL typu obiektu (pierwszy plan). */
  typEtykieta: string;
  /** Nazwa obiektu (pierwszy plan). */
  nazwa: string;
  wlasciwosci: SekcjaWlasciwosci[];
  wyniki: SekcjaWlasciwosci[];
  dowody: PozycjaDowodu[];
  powiazania: PowiazaniaObiektu;
  /** Rewizja modelu, przy której policzono wyniki (świeżość zakładki Wyniki). */
  rewizjaWynikow?: number;
  /** Pary techniczne dla trybu Eksperckiego. */
  szczegolyTechniczne?: SzczegolTechniczny[];
}

/** Props głównego komponentu (karta §3). */
export interface InspectorPanelProps {
  obiekt: ObiektInspektora | null;
  rewizjaModelu: number;
  onOtworzDowod: (ref: string) => void;
  onNawiguj: (cel: CelNawigacji) => void;
  onPrzelicz: () => void;
  trybZaawansowania: AdvancementMode;
}

/** Dana pochodna jest nieaktualna, gdy jej rewizja jest starsza niż rewizja modelu. */
export function czyNieaktualne(rewizjaDanej: number, rewizjaModelu: number): boolean {
  return rewizjaDanej < rewizjaModelu;
}
