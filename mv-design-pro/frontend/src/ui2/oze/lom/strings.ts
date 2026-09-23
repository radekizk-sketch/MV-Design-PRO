/*
 * Teksty i deterministyczne formatery okna „Praca wyspowa" (ochrona LoM, P46 /
 * strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7); zero
 * literałów UI w JSX. Statusy (`OK/INFO/WARN/ERROR`) i kody funkcji ANSI to KLUCZE
 * słowników / dane z backendu — na pierwszym planie etykiety PL. Formatery CZYSTE
 * (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule) — przecinek PL.
 * Nazwy sufiksowane `Lom`, bo barrel OZE robi `export *` (kolizje nazw TS2308).
 */

import type { IstotnoscLom, OcenaNastawyLom } from '../api';

/** Poziom istotności do doboru koloru tagu/statusu (wyłącznie prezentacja). */
export type IstotnoscTaguLom = 'ok' | 'warn' | 'err' | 'neutral';

export const LOM_STRINGS = {
  // Nagłówek okna
  tytul: 'Ochrona przed pracą wyspową (LoM)',
  opisWstep:
    'Weryfikacja doboru zabezpieczeń od utraty sieci (Loss of Mains) w polach '
    + 'przyłączeniowych modułów wytwórczych: obecność funkcji (ROCOF 81R, przesunięcie '
    + 'wektora 78, kryteria częstotliwościowe 81U/81O), zgodność nastaw z oknami '
    + 'normatywnymi oraz koordynacja czasowa z automatyką SPZ. Ocena normatywna — bez fizyki.',

  // Stany uczciwe
  brakPrzypadku: 'Brak aktywnego przypadku obliczeniowego',
  brakPrzypadkuOpis:
    'Aktywuj przypadek z dokumentem sieci (ENM), aby ocenić ochronę od pracy wyspowej '
    + 'modułów wytwórczych.',
  ladowanie: 'Wczytywanie oceny ochrony LoM…',
  blad: 'Nie udało się wczytać oceny ochrony LoM',
  brakPol: 'Brak pól przyłączeniowych modułów wytwórczych',
  brakPolOpis:
    'W dokumencie sieci nie ma pól przyłączeniowych modułów wytwórczych do oceny '
    + 'ochrony od pracy wyspowej.',

  // Kolumny tabeli pól
  kolPole: 'Pole przyłączeniowe',
  kolSzyna: 'Szyna',
  kolModuly: 'Moduły wytwórcze',
  kolStatus: 'Status ochrony',
  kolIdentyfikator: 'Identyfikator pola',

  // Statusy pola (klucze OK/INFO/WARN/ERROR)
  statusOk: 'Poprawna',
  statusInfo: 'Informacja',
  statusWarn: 'Ostrzeżenie',
  statusError: 'Błąd',

  // Podsumowanie (chipy)
  podsumOk: 'Poprawne',
  podsumInfo: 'Informacje',
  podsumWarn: 'Ostrzeżenia',
  podsumError: 'Błędy',

  // Szczegół pola (rozwinięcie → porównania)
  szczegolBrakWyboru: 'Wybierz pole w tabeli, aby zobaczyć porównania nastaw z oknami normatywnymi.',
  szczegolPorownania: 'Porównania nastaw z oknami normatywnymi',
  szczegolModuly: 'Moduły wytwórcze na szynie',
  szczegolBrakModulow: 'Brak przypisanych modułów wytwórczych na szynie pola.',
  checkNastawa: 'Nastawa',
  checkOkno: 'Wymaganie (krawędź okna)',
  checkZapas: 'Zapas do krawędzi okna',
  checkZrodlo: 'Podstawa',
  // Karta AB-1a D7 — magazyn energii poza zakresem rozporządzenia 2016/631
  pozaZakresemRfgTytul: 'Magazyn energii poza zakresem wymagań dla modułów wytwarzania',

  // Moduły bez pola przyłączeniowego
  bezPolaTytul: 'Moduły wytwórcze bez pola przyłączeniowego',
  bezPolaOpis:
    'Poniższe moduły nie mają pola przyłączeniowego z przypisaniem zabezpieczeń — '
    + 'ocena ochrony LoM niemożliwa (uczciwy brak danych).',

  // Założenia i źródła
  zalozeniaTytul: 'Założenia',
  zrodlaTytul: 'Podstawy okien funkcji LoM',
  zrodlaBrakOkna: 'brak okna w katalogu',

  // Tryb ekspercki
  ekspHash: 'Odcisk wejścia (SHA-256)',
  ekspEnmHash: 'Odcisk dokumentu sieci (ENM)',

  // Jednostki / wartości puste
  kreska: '—',
} as const;

/** Słownik polskich etykiet statusu pola/podsumowania LoM. */
export const STATUS_LOM_PL: Record<IstotnoscLom, string> = {
  OK: LOM_STRINGS.statusOk,
  INFO: LOM_STRINGS.statusInfo,
  WARN: LOM_STRINGS.statusWarn,
  ERROR: LOM_STRINGS.statusError,
};

/** Polska etykieta statusu LoM (nieznany kod → dosłownie, jako dane). */
export function statusLomPL(kod: IstotnoscLom): string {
  return STATUS_LOM_PL[kod] ?? kod;
}

/** Istotność tagu statusu LoM (dobór koloru). */
export function istotnoscLom(kod: IstotnoscLom): IstotnoscTaguLom {
  switch (kod) {
    case 'OK':
      return 'ok';
    case 'WARN':
      return 'warn';
    case 'ERROR':
      return 'err';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczbaLom(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Nastawa (dowolna jednostka) z jednostką; `null` → kreska. */
export function fmtNastawaLom(value: number | null, unit: string | null): string {
  if (value === null) return LOM_STRINGS.kreska;
  const liczba = fmtLiczbaLom(value, 3);
  return unit ? `${liczba} ${unit}` : liczba;
}

/**
 * Wymaganie porównania (krawędź okna z backendu): dolna krawędź „≥", górna „≤";
 * koordynacja SPZ — czas LoM musi być krótszy od przerwy SPZ („<"). Brak
 * krawędzi → kreska (np. 78 bez okna, brak danych SPZ).
 */
export function fmtWymaganieLom(ocena: OcenaNastawyLom): string {
  const jednostka = ocena.jednostka ? ` ${ocena.jednostka}` : '';
  if (ocena.rodzaj === 'koordynacja_spz') {
    return ocena.odniesienie_gorne === null
      ? LOM_STRINGS.kreska
      : `< ${fmtLiczbaLom(ocena.odniesienie_gorne, 3)}${jednostka}`;
  }
  if (ocena.odniesienie_dolne !== null) return `≥ ${fmtLiczbaLom(ocena.odniesienie_dolne, 3)}${jednostka}`;
  if (ocena.odniesienie_gorne !== null) return `≤ ${fmtLiczbaLom(ocena.odniesienie_gorne, 3)}${jednostka}`;
  return LOM_STRINGS.kreska;
}

/** Zapas do krawędzi okna ze znakiem (dodatni = w oknie); `null` → kreska. */
export function fmtZapasLom(ocena: OcenaNastawyLom): string {
  if (ocena.margines === null) return LOM_STRINGS.kreska;
  const znak = ocena.margines > 0 ? '+' : ocena.margines < 0 ? '−' : '';
  const jednostka = ocena.margines_jednostka ? ` ${ocena.margines_jednostka}` : '';
  return `${znak}${fmtLiczbaLom(Math.abs(ocena.margines), 3)}${jednostka}`;
}
