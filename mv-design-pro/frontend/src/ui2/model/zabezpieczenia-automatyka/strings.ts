/**
 * Teksty PL ekranu „Zabezpieczenia i automatyka" (E-27, realny dostawca ui2).
 * Wyłącznie polski język techniczny; zdanie celu jest cytatem z karty §0.3
 * (FLOW §0.3 „kontrakt ekranu prowadzącego").
 */

export const ZABEZPIECZENIA_STRINGS = {
  eyebrow: 'ZABEZPIECZENIA I AUTOMATYKA',
  // Cel jednym zdaniem (cytat z karty E-27 §0.3).
  cel: 'Przegląd zabezpieczeń i automatyki sieciowej (SPZ/SZR/SCO/FDIR): co jest '
    + 'skonfigurowane, gdzie są braki i gdzie się to edytuje — na podstawie modelu sieci.',

  // Stan zerowy — brak aktywnego projektu.
  brakProjektuTytul: 'Brak aktywnego projektu',
  brakProjektuOpis: 'Przegląd zabezpieczeń i automatyki pracuje na modelu pól wybranego '
    + 'projektu. Bez aktywnego projektu nie ma z czego zestawić przypisań zabezpieczeń '
    + 'ani sterowników polowych.',
  brakProjektuAkcja: 'Wybierz projekt',

  // Stan zerowy — projekt bez pól w modelu.
  brakPolTytul: 'Model sieci nie ma jeszcze pól',
  brakPolOpis: 'Zabezpieczenia i automatyka są opisane na polach rozdzielni. Zbuduj model '
    + 'sieci (stacje i pola SN), aby zobaczyć przypisania zabezpieczeń i sterowniki polowe.',
  brakPolAkcja: 'Otwórz model sieci',

  // Sekcja ZABEZPIECZENIA.
  zabezpieczeniaTytul: 'Zabezpieczenia pól',
  zabezpieczeniaOpis: 'Przypisania zabezpieczeń na polach modelu. Edycja nastaw odbywa się '
    + 'w karcie pola.',
  kolPole: 'Pole',
  kolUrzadzenie: 'Urządzenie',
  kolFunkcje: 'Funkcje',
  kolAkcja: 'Edycja',
  otworzKartePola: 'Otwórz kartę pola',
  otworzKartePolaOpis: 'Otwórz kartę pola z nastawami zabezpieczeń (panel pola)',

  // Sekcja AUTOMATYKA.
  automatykaTytul: 'Sterowniki polowe i automatyka',
  automatykaOpis: 'Funkcje automatyki i stan SPZ zestawione ze sterowników pól '
    + '(zabezpieczenie zintegrowane). Braki pokazujemy jawnie.',
  cechyTytul: 'Funkcje automatyki',
  spzTytul: 'Samoczynne ponowne załączenie (SPZ)',
  spzNieSkonfigurowano: 'Nie skonfigurowano',
  spzAktywny: 'Aktywny',
  spzOdstawiony: 'Odstawiony',
  spzProbySzybkie: 'Próby szybkie',
  spzProbyWolne: 'Próby wolne',
  spzStan: 'Stan',
  spzBlokada: 'Blokada',
  cechaWl: 'włączona',
  cechaWyl: 'wyłączona',
  brakSterownikow: 'Żadne pole nie ma zintegrowanego sterownika automatyki. Automatyka '
    + 'pojawia się po przypisaniu zabezpieczenia z funkcjami sterującymi.',

  // Następny krok.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Po przeglądzie nastaw przejdź do koordynacji zabezpieczeń — sprawdzenia '
    + 'selektywności i marginesów na tle prądów zwarciowych (nastawy → selektywność).',
  nastepnyAkcja: 'Koordynacja zabezpieczeń',
  nastepnyAkcjaOpis: 'Otwórz ekran koordynacji zabezpieczeń (E-28)',
} as const;
