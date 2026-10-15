/** Teksty PL edytora nastaw zabezpieczenia nadprądowego (karta BIEG-ZABEZPIECZEN-Z-MODELU). */

export const NASTAWY_STRINGS = {
  przekladnik: 'Przekładnik prądowy',
  brakPrzekladni: 'brak przekładnika — przeliczenie progu niemożliwe',
  zakresyKatalogu: 'Zakresy nastaw',
  brakZakresow: 'pozycja katalogowa bez zakresów nastaw',
  jednostkaNieustalona: 'jednostka zakresów nieustalona',
  stopien51: 'Stopień I> (51) — zwłoczny',
  stopien50: 'Stopień I>> (50) — zwarciowy',
  stopienAktywnyOpis: 'Stopień nieaktywny nie jest zapisywany w modelu.',
  prog: 'Próg rozruchowy',
  jednostka: 'Strona przekładnika',
  charakterystyka: 'Charakterystyka czasowa',
  zwloka: 'Zwłoka',
  tms: 'Mnożnik czasowy TMS',
  wybierz: '— wybierz —',
  zakresPrzekaznika: 'zakres przekaźnika',
  zakresNieznany: 'Zakres przekaźnika nieznany — próg nie zostanie sprawdzony z katalogiem.',
  progPierwotny: (pierwotny: string, wtorny: string) =>
    `Po stronie pierwotnej: ${pierwotny} A (wtórna ${wtorny} A) — przeliczenie backendu.`,
  brakiTytul: 'Ocena tego zabezpieczenia jest wstrzymana:',
  gotowe: 'Nastawy kompletne i w zakresach katalogu — zabezpieczenie gotowe do oceny.',
  zapisz: 'Zapisz nastawy',
  zapisywanie: 'Zapisywanie…',
  bladZapisu: 'Nie udało się zapisać nastaw zabezpieczenia.',
  brakPrzypadku: 'Brak aktywnego przypadku — nastaw nie ma gdzie zapisać.',
} as const;
