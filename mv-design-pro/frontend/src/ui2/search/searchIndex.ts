/*
 * Budowa indeksu wyszukiwarki poleceń (okno W-105, karta E1.5 §2): łączy
 * rejestr przestrzeni powłoki (`../shell/spaces` — jawnie wskazany w karcie
 * jako źródło grupy „Przestrzenie"; import WYŁĄCZNIE odczytowy, ten moduł
 * NIE modyfikuje `ui2/shell`), statyczną listę poleceń PL oraz obiekty
 * modelu dostarczone przez wołającego (provider — rzeczywisty rejestr
 * obiektów modelu i akcje poleceń są zakresem integracji, karta zarządcy).
 */

import { SPACES, type SpaceDefinition } from '../shell/spaces';
import type { PozycjaWyszukiwania, TrybZaawansowania } from './searchModel';

/** Kształt obiektu modelu dostarczanego przez provider (nazwa + opcjonalny tryb minimalny). */
export interface ObiektDoIndeksu {
  id: string;
  nazwa: string;
  trybMin?: TrybZaawansowania;
}

/** Provider obiektów modelu — źródło danych jest poza zakresem karty E1.5. */
export type ProviderObiektow = () => readonly ObiektDoIndeksu[];

/** Akcja pozycji statycznych indeksu — rzeczywiste wywołanie podłącza integracja (karta zarządcy). */
function brakAkcji(): void {
  /* no-op — akcja podłączana przy wpięciu do powłoki, poza zakresem E1.5 */
}

function pozycjaZPrzestrzeni(przestrzen: SpaceDefinition): PozycjaWyszukiwania {
  return {
    id: `przestrzen:${przestrzen.id}`,
    etykietaPL: przestrzen.label,
    grupa: 'przestrzenie',
    akcja: brakAkcji,
  };
}

type PozycjaStatyczna = Omit<PozycjaWyszukiwania, 'akcja'>;

/** Statyczne polecenia PL (zestaw reprezentatywny — pełny rejestr poza zakresem karty). */
const POLECENIA_STATYCZNE: readonly PozycjaStatyczna[] = [
  { id: 'polecenie:zapisz', etykietaPL: 'Zapisz', grupa: 'polecenia' },
  { id: 'polecenie:przelicz', etykietaPL: 'Przelicz aktywny przypadek', grupa: 'polecenia' },
  { id: 'polecenie:otworz-projekt', etykietaPL: 'Otwórz projekt', grupa: 'polecenia' },
  { id: 'polecenie:przywroc-uklad', etykietaPL: 'Przywróć układ domyślny', grupa: 'polecenia' },
  { id: 'polecenie:polacz-ponownie', etykietaPL: 'Połącz ponownie', grupa: 'polecenia' },
  {
    id: 'polecenie:eksport-pdf',
    etykietaPL: 'Eksportuj dowód obliczeniowy do PDF',
    grupa: 'polecenia',
    trybMin: 'extended',
  },
  {
    id: 'polecenie:porownanie-scenariuszy',
    etykietaPL: 'Porównaj scenariusze obliczeniowe',
    grupa: 'polecenia',
    trybMin: 'expert',
  },
];

/** Gotowe przykłady sieci — statyczna lista PL (pełny rejestr poza zakresem karty). */
const PRZYKLADY_STATYCZNE: readonly PozycjaStatyczna[] = [
  { id: 'przyklad:gpz-podstawowy', etykietaPL: 'Przykład: stacja GPZ — sieć podstawowa', grupa: 'przyklady' },
  { id: 'przyklad:oze-fotowoltaika', etykietaPL: 'Przykład: przyłącze OZE — fotowoltaika', grupa: 'przyklady' },
];

/** Pomoc — statyczna lista PL (pełny rejestr poza zakresem karty). */
const POMOC_STATYCZNA: readonly PozycjaStatyczna[] = [
  { id: 'pomoc:skroty-klawiszowe', etykietaPL: 'Pomoc: skróty klawiszowe', grupa: 'pomoc' },
  { id: 'pomoc:metodyka-iec-60909', etykietaPL: 'Pomoc: metodyka IEC 60909', grupa: 'pomoc' },
];

function zAkcja(pozycja: PozycjaStatyczna): PozycjaWyszukiwania {
  return { ...pozycja, akcja: brakAkcji };
}

export interface BudowaIndeksuOpcje {
  /** Provider obiektów modelu — pominięcie daje pustą grupę „Obiekty". */
  obiekty?: ProviderObiektow;
}

/** Buduje pełny indeks wyszukiwarki: przestrzenie + polecenia + obiekty + przykłady + pomoc. */
export function zbudujIndeksWyszukiwania(opcje: BudowaIndeksuOpcje = {}): PozycjaWyszukiwania[] {
  const przestrzenie = SPACES.map(pozycjaZPrzestrzeni);
  const polecenia = POLECENIA_STATYCZNE.map(zAkcja);
  const przyklady = PRZYKLADY_STATYCZNE.map(zAkcja);
  const pomoc = POMOC_STATYCZNA.map(zAkcja);
  const obiekty: PozycjaWyszukiwania[] = (opcje.obiekty?.() ?? []).map((obiekt) => ({
    id: `obiekt:${obiekt.id}`,
    etykietaPL: obiekt.nazwa,
    grupa: 'obiekty',
    trybMin: obiekt.trybMin,
    akcja: brakAkcji,
  }));
  return [...przestrzenie, ...polecenia, ...obiekty, ...przyklady, ...pomoc];
}
