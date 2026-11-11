/**
 * Teksty PL ekranu „Zabezpieczenia i automatyka" (E-27).
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
    + 'projektu. Bez aktywnego projektu nie ma z czego zestawić sterowników zabezpieczeń.',
  brakProjektuAkcja: 'Wybierz projekt',

  // Stan zerowy — projekt bez pól i bez sterowników wyłączników liniowych.
  brakPolTytul: 'Model sieci nie ma jeszcze pól',
  brakPolOpis: 'Zabezpieczenia i automatyka są opisane sterownikami pól rozdzielni i wyłączników '
    + 'liniowych. Zbuduj model sieci (stacje i pola SN), aby przypisać sterowniki.',
  brakPolAkcja: 'Otwórz model sieci',

  // Tabela sterowników (sterownik = wiersz, standard warsztatu §10).
  zabezpieczeniaTytul: 'Sterowniki zabezpieczeń i automatyki',
  kolStacja: 'Stacja',
  kolPole: 'Pole / wyłącznik',
  kolUrzadzenie: 'Urządzenie',
  kolFunkcje: 'Funkcje',
  kolGrupa: 'Grupa',
  kolSpz: 'SPZ',
  kolAkcja: 'Edycja',
  bezSterownika: 'bez sterownika',
  szablonOpis: (szablon: string, rodzina: string | null) =>
    `Szablon pola: ${szablon}${rodzina ? ` · ${rodzina}` : ''}`,
  spzWlaczone: (cykle: number | null) => (cykle === null ? 'wł.' : `wł., ${cykle} cykl.`),
  spzWylaczone: 'wył.',
  nastawy: 'Nastawy',
  nastawyZwin: 'Zwiń',
  nastawyOpis: 'Nastawy funkcji sterownika w grupach 1–4 (zapis do modelu sieci)',
  dodajSterownik: 'Dodaj sterownik',
  otworzKartePola: 'Karta pola',
  otworzKartePolaOpis: 'Otwórz kartę pola (panel zabezpieczeń pola)',
  nastawyLadowanie: 'Wczytywanie nastaw z modelu…',
  nastawyBlad: 'Nie udało się pobrać nastaw zabezpieczeń',

  // Wyłączniki liniowe bez sterownika.
  wylacznikiTytul: 'Wyłączniki liniowe bez sterownika',
  wylacznikBezNazwy: 'Wyłącznik bez nazwy',
  wylacznikStanCt: (n: number) => (n > 0 ? `przekładnik: ${n}` : 'bez przekładnika'),
  dodajPrzekladnik: 'Dodaj przekładnik prądowy',
  dodajZabezpieczenie: 'Dodaj sterownik',

  // Następny krok.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Po przeglądzie nastaw przejdź do koordynacji zabezpieczeń — sprawdzenia '
    + 'selektywności i marginesów na tle prądów zwarciowych (nastawy → selektywność).',
  nastepnyAkcja: 'Koordynacja zabezpieczeń',
  nastepnyAkcjaOpis: 'Otwórz ekran koordynacji zabezpieczeń (E-28)',
} as const;
