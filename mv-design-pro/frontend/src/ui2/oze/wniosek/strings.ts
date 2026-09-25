/*
 * Teksty i deterministyczne formatery okna „Wniosek OSD" (karta W-707 / E13) —
 * wyłącznie polski język techniczny pierwszoplanowy (MODEL_INTERAKCJI §2.7).
 * Identyfikatory techniczne (odciski sekcji, `input_hash`) pokazywane WYŁĄCZNIE
 * w trybie eksperckim jako wyrażenia z danych. Formatery są CZYSTE
 * (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule); przecinek
 * dziesiętny zgodnie z konwencją PL.
 *
 * Warstwa PREZENTACJI: żadnej fizyki, żadnej oceny — wniosek zestawia gotowe
 * wyniki z backendu (NOT-A-SOLVER).
 */

import type { FormatDokumentu } from '../ncrfg/api';

export const WNIOSEK_STRINGS = {
  // Nagłówek
  tytul: 'Wniosek o określenie warunków przyłączenia',
  podtytul:
    'Kompletacja wniosku do operatora systemu dystrybucyjnego z gotowych wyników: ' +
    'bilans mocy (rozpływ), zwarcia w punkcie przyłączenia oraz zgodność NC RfG.',

  // Formularz — przebiegi
  sekcjaPrzebiegi: 'Przebiegi obliczeniowe',
  przebiegRozplywu: 'Przebieg rozpływu mocy',
  przebiegZwarciowy: 'Przebieg zwarciowy',
  przebiegBrakRozplywu: 'Brak zakończonego przebiegu rozpływu mocy',
  przebiegBrakZwarcia: 'Brak zakończonego przebiegu zwarciowego',
  przebiegWybierz: 'Wybierz przebieg',

  // Formularz — punkt przyłączenia
  sekcjaPunkt: 'Punkt przyłączenia',
  wezel: 'Szyna przyłączenia',
  wezelOpis:
    'Szyna modelu, dla której wniosek zestawia wyniki zwarciowe — musi występować ' +
    'w wynikach wskazanego obliczenia zwarciowego.',
  wezelWybierz: '— wybierz szynę —',
  wezelBrak: 'Model nie ma szyn',

  // Formularz — identyfikacja
  sekcjaIdentyfikacja: 'Identyfikacja wniosku',
  nazwaProjektu: 'Nazwa projektu',
  nazwaProjektuOpis: 'Pole wymagane — pojawia się w nagłówku wniosku i eksportu DOCX.',
  nazwaPrzypadku: 'Nazwa przypadku',
  wnioskodawca: 'Wnioskodawca',
  adres: 'Adres przyłączenia',
  poleOpcjonalne: 'opcjonalne',

  // Zgodność NC RfG — źródło: zatwierdzony model przypadku
  sekcjaNcRfg: 'Zgodność NC RfG',
  ncRfgZModelu:
    'Sekcję zgodności NC RfG serwer wyprowadza z zatwierdzonego modelu aktywnego przypadku ' +
    '(ta sama ocena wymagań co certyfikat zgodności i zgodność przypadku w macierzy); dowód ' +
    'certyfikatu urządzenia pochodzi z tabliczek w modelu.',
  operator: 'Operator (profil wymagań NC RfG)',

  // Akcje
  generuj: 'Zbuduj wniosek',
  generujPonownie: 'Przebuduj wniosek',
  pobierzDocx: 'Pobierz DOCX',
  pobierzPdf: 'Pobierz PDF',
  zamknij: 'Zamknij podgląd wniosku',
  ladowanie: 'Buduję wniosek…',

  // Blokady przycisku (uczciwe powody PL — zero martwych klików)
  blokadaBrakPrzypadku:
    'Wybierz aktywny przypadek obliczeniowy — sekcja zgodności NC RfG powstaje wyłącznie ' +
    'z zatwierdzonego modelu przypadku.',
  blokadaBrakOperatora:
    'Wybierz operatora (profil wymagań NC RfG) — moduły modelu nie wskazują go jednoznacznie.',
  blokadaBrakRozplywu:
    'Wskaż zakończony przebieg rozpływu mocy — bez niego wniosek nie zestawi bilansu mocy.',
  blokadaBrakZwarcia:
    'Wskaż zakończony przebieg zwarciowy — bez niego wniosek nie zestawi zwarć w punkcie.',
  blokadaBrakWezla: 'Wybierz szynę przyłączenia — pole wymagane.',
  blokadaBrakProjektu: 'Podaj nazwę projektu — pole wymagane.',
  blokadaAktywny: 'Zbuduj wniosek OSD z gotowych wyników',

  // Wynik — sekcja bilansu
  wynikNaglowek: 'Wniosek OSD',
  bilansTytul: 'Bilans mocy',
  bilansMocZrodel: 'Moc zainstalowana źródeł',
  bilansMocWPunkcie: 'Moc zainstalowana w węźle przyłączenia',
  bilansLiczbaWezlow: 'Liczba węzłów ze źródłami',
  bilansObciazenie: 'Najwyższe obciążenie elementu',
  bilansWspMocy: 'Współczynnik mocy w punkcie bilansowym',
  bilansStraty: 'Straty sieciowe',

  // Wynik — sekcja zwarć
  zwarciaTytul: 'Zwarcia w punkcie przyłączenia',
  zwarciaWezel: 'Węzeł',
  zwarciaIkss: "Początkowy prąd zwarciowy Ik''",
  zwarciaSk: "Moc zwarciowa S_k''",
  zwarciaIp: 'Prąd udarowy ip',
  zwarciaIth: 'Prąd cieplny Ith',
  zwarciaRodzaj: 'Rodzaj zwarcia',

  // Wynik — sekcja zgodności
  zgodnoscTytul: 'Zgodność z wymaganiami NC RfG',
  zgodnoscProcedura: 'Procedura',

  // Wynik — założenia i odciski
  zalozeniaTytul: 'Założenia i źródła',
  odciskiTytul: 'Odcisk sekcji',
  odciskWejscia: 'Odcisk wejścia wniosku',
  odciskWejsciaNcRfg: 'Odcisk wejścia oceny zgodności NC RfG',

  // Braki (bramka 422) — ekran „czego brakuje do wniosku"
  brakiTytul: 'Czego brakuje do wniosku',

  // Błąd API
  bladTytul: 'Nie udało się zbudować wniosku',

  // Wartości domyślne
  projektBezNazwy: 'Projekt bez nazwy',
  kreska: '—',

  // Jednostki
  jednKA: 'kA',
  jednMVA: 'MVA',
  jednProcent: '%',
} as const;

/** Deterministyczny format liczby z przecinkiem dziesiętnym (PL). */
export function fmtLiczbaWniosku(value: number | null, miejsca = 2): string {
  if (value === null || !Number.isFinite(value)) return WNIOSEK_STRINGS.kreska;
  return value.toFixed(miejsca).replace('.', ',');
}

/** Format liczby z jednostką (myślnik bez jednostki gdy brak wartości). */
export function fmtZJednostkaWniosku(
  value: number | null,
  jednostka: string,
  miejsca = 2,
): string {
  if (value === null || !Number.isFinite(value)) return WNIOSEK_STRINGS.kreska;
  return `${fmtLiczbaWniosku(value, miejsca)} ${jednostka}`;
}

/**
 * Nazwa pliku wniosku: `wniosek-osd-RRRR-MM-DD.<docx|pdf>`. Czysta (data przekazywana
 * jako argument — bez `Date.now`).
 */
export function nazwaPlikuWniosku(data: Date, format: FormatDokumentu): string {
  const rrrr = data.getFullYear().toString().padStart(4, '0');
  const mm = (data.getMonth() + 1).toString().padStart(2, '0');
  const dd = data.getDate().toString().padStart(2, '0');
  return `wniosek-osd-${rrrr}-${mm}-${dd}.${format}`;
}
