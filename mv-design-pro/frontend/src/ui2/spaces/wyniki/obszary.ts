/**
 * Nawigacja warsztatu „Wyniki" (karta B-02 / W3-E, dyrektywa właściciela
 * 2026-09-10 §8): OBSZAR → ANALIZA zamiast trzydziestu równorzędnych zakładek.
 *
 * Jedno źródło prawdy dla paska obszarów, paska zakładek obszaru, bramy trybu
 * zaawansowania i deep-linków (`useShellStore.setWynikiTab`): komponent
 * warsztatu nie ma drugiej listy. Każda zakładka należy do DOKŁADNIE jednego
 * obszaru (pilnuje test warsztatu — reguła KLASA, nie instancja); obszar bez
 * zakładki dostępnej w bieżącym trybie nie jest renderowany. Żadna funkcja nie
 * schodzi z ekranu — zmienia się wyłącznie droga do niej.
 *
 * Czyste dane nawigacji: zero fizyki, zero pobrań, zero React.
 */

import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { WYNIKI_WARSZTAT_STRINGS as T } from './strings';

export const ZAKLADKI = [
  { id: 'ocena', etykieta: T.zakladkaOcena },
  { id: 'co-wymaga-uwagi', etykieta: T.zakladkaCoWymagaUwagi },
  { id: 'jakosc', etykieta: T.zakladkaJakosc },
  { id: 'porownanie', etykieta: T.zakladkaPorownanie },
  { id: 'odbior', etykieta: T.zakladkaOdbior },
  { id: 'dowod', etykieta: T.zakladkaDowod },
  { id: 'rozplyw', etykieta: T.zakladkaRozplyw },
  { id: 'regulacja-oltc', etykieta: T.zakladkaRegulacjaOltc },
  { id: 'zbieznosc', etykieta: T.zakladkaZbieznosc },
  { id: 'kontyngencje', etykieta: T.zakladkaKontyngencje },
  { id: 'wrazliwosc', etykieta: T.zakladkaWrazliwosc },
  { id: 'estymacja', etykieta: T.zakladkaEstymacja },
  { id: 'stan-fazowy', etykieta: T.zakladkaStanFazowy },
  { id: 'zwarcia', etykieta: T.zakladkaZwarcia },
  { id: 'skladowe', etykieta: T.zakladkaSkladowe },
  { id: 'koordynacja', etykieta: T.zakladkaKoordynacja },
  { id: 'stabilnosc', etykieta: T.zakladkaStabilnosc },
  { id: 'ssci', etykieta: T.zakladkaSsci },
  { id: 'akademickie', etykieta: T.zakladkaAkademickie },
  { id: 'ncrfg', etykieta: T.zakladkaNcRfg },
  { id: 'pulpit-oze', etykieta: T.zakladkaPulpitOze },
  { id: 'zdolnosc', etykieta: T.zakladkaZdolnosc },
  { id: 'ranking', etykieta: T.zakladkaRanking },
  { id: 'krzywe', etykieta: T.zakladkaKrzywe },
  { id: 'obszar', etykieta: T.zakladkaObszar },
  { id: 'studium', etykieta: T.zakladkaStudium },
  { id: 'frt', etykieta: T.zakladkaFrt },
  { id: 'osd', etykieta: T.zakladkaOsd },
  { id: 'kompensacja', etykieta: T.zakladkaKompensacja },
  { id: 'wniosek', etykieta: T.zakladkaWniosek },
  { id: 'lom', etykieta: T.zakladkaLom },
  { id: 'pozostale', etykieta: T.zakladkaPozostale },
] as const;

export type ZakladkaId = (typeof ZAKLADKI)[number]['id'];

export type ObszarId =
  | 'ocena-i-przeglad'
  | 'rozplyw'
  | 'zwarcia'
  | 'stabilnosc'
  | 'specjalistyczne'
  | 'oze'
  | 'klasyczne';

export interface ObszarWynikow {
  readonly id: ObszarId;
  readonly etykieta: string;
  /** Kolejność zakładek = kolejność wizualna i klawiaturowa w obszarze. */
  readonly zakladki: readonly ZakladkaId[];
}

/**
 * Obszary w kolejności toku pracy projektanta: od oceny wyników, przez rozpływ
 * i zwarcia, po stabilność, analizy specjalistyczne (tryb ekspercki), strumień
 * OZE i widoki klasyczne mostu.
 */
export const OBSZARY: readonly ObszarWynikow[] = [
  {
    id: 'ocena-i-przeglad',
    etykieta: T.obszarOcena,
    zakladki: ['ocena', 'co-wymaga-uwagi', 'jakosc', 'porownanie', 'odbior', 'dowod'],
  },
  {
    id: 'rozplyw',
    etykieta: T.obszarRozplyw,
    zakladki: [
      'rozplyw',
      'regulacja-oltc',
      'zbieznosc',
      'kontyngencje',
      'wrazliwosc',
      'estymacja',
      'stan-fazowy',
    ],
  },
  { id: 'zwarcia', etykieta: T.obszarZwarcia, zakladki: ['zwarcia', 'skladowe', 'koordynacja'] },
  { id: 'stabilnosc', etykieta: T.obszarStabilnosc, zakladki: ['stabilnosc', 'ssci'] },
  { id: 'specjalistyczne', etykieta: T.obszarSpecjalistyczne, zakladki: ['akademickie'] },
  {
    id: 'oze',
    etykieta: T.obszarOze,
    zakladki: [
      'ncrfg',
      'pulpit-oze',
      'zdolnosc',
      'ranking',
      'krzywe',
      'obszar',
      'studium',
      'frt',
      'osd',
      'kompensacja',
      'wniosek',
      'lom',
    ],
  },
  { id: 'klasyczne', etykieta: T.obszarKlasyczne, zakladki: ['pozostale'] },
];

/**
 * Zakładki bramkowane trybem zaawansowania (V126-JEZYK, ocena właściciela 0/10):
 * „Analizy specjalistyczne" należą do trybu eksperckiego — projektant na torze
 * podstawowym nie ogląda powierzchni, której gotowość i kryteria wymagają
 * parametryzacji eksperckiej. Brama jest PARĄ z bramą w samym oknie
 * (`EkranAnalizAkademickich` → `BramaOpracowania`), żeby wejście trasowe
 * E-40…E-50 podlegało tej samej regule (KLASA, nie instancja).
 */
export const MIN_TRYB_ZAKLADKI: Partial<Record<ZakladkaId, AdvancementMode>> = {
  akademickie: 'expert',
};

/** Czy zakładka jest dostępna w danym trybie zaawansowania. */
export function zakladkaDostepna(id: ZakladkaId, tryb: AdvancementMode): boolean {
  const min = MIN_TRYB_ZAKLADKI[id];
  return min === undefined || isModeAtLeast(tryb, min);
}

/** Zakładki obszaru dostępne w trybie (kolejność wizualna i klawiaturowa). */
export function zakladkiObszaru(obszar: ObszarWynikow, tryb: AdvancementMode): ZakladkaId[] {
  return obszar.zakladki.filter((id) => zakladkaDostepna(id, tryb));
}

/** Obszary z co najmniej jedną zakładką dostępną w trybie (pasek obszarów). */
export function obszaryDostepne(tryb: AdvancementMode): ObszarWynikow[] {
  return OBSZARY.filter((obszar) => zakladkiObszaru(obszar, tryb).length > 0);
}

/** Obszar, do którego należy zakładka (każda należy do dokładnie jednego). */
export function obszarZakladki(id: ZakladkaId): ObszarWynikow {
  const obszar = OBSZARY.find((o) => o.zakladki.includes(id));
  if (!obszar) throw new Error(`zakładka bez obszaru: ${id}`);
  return obszar;
}

/** Walidacja identyfikatora z deep-linku (`setWynikiTab` przyjmuje string). */
export function jestZakladka(id: string): id is ZakladkaId {
  return ZAKLADKI.some((z) => z.id === id);
}

/** Etykieta PL zakładki. */
export function etykietaZakladki(id: ZakladkaId): string {
  return ZAKLADKI.find((z) => z.id === id)!.etykieta;
}
