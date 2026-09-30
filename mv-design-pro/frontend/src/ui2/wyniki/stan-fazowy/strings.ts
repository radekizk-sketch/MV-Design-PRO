/**
 * Teksty PL i deterministyczne formatery ekranu „Stan fazowy SN" (E-31,
 * karta P-2). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7);
 * formatery CZYSTE (Determinism Rule) — przecinek dziesiętny PL.
 */

export const STAN_FAZOWY_STRINGS = {
  eyebrow: 'ANALIZA FAZOWA',
  tytul: 'Stan fazowy SN',
  cel: 'Zweryfikuj napięcia i prądy fazowe sieci — z zakończonego przebiegu stanu '
    + 'fazowego SN (odchylenie od średniej faz dla celu analizy) albo rozpływu '
    + 'niesymetrycznego (napięcia i prądy per faza każdej szyny i gałęzi, VUF).',

  // Źródło wyniku (W5-D): ekran czyta DWA rodzaje przebiegów — nazwa źródła jest
  // zawsze na ekranie, żeby projektant wiedział, który solver dał liczby.
  zrodloEtykieta: 'Źródło wyniku',
  zrodloStanFazowy: 'przebieg stanu fazowego SN (solver stanu fazowego)',
  zrodloRozplywNiesymetryczny: 'rozpływ niesymetryczny (solver BFS per faza)',

  // Stany zerowe (uczciwe — bez podstawiania wartości).
  brakProjektuTytul: 'Brak aktywnego projektu',
  brakProjektuOpis: 'Wyniki stanu fazowego czyta się z przebiegu analizy w aktywnym '
    + 'projekcie. Wybierz projekt, aby kontynuować.',
  brakProjektuAkcja: 'Wybierz projekt',
  brakPrzebieguTytul: 'Brak zakończonego przebiegu fazowego',
  brakPrzebieguOpis: 'Ten ekran pokazuje wynik ZAKOŃCZONEGO przebiegu stanu fazowego SN '
    + '(napięcia i prądy per faza celu, odchylenie od średniej faz) albo rozpływu '
    + 'niesymetrycznego (napięcia i prądy per faza każdej szyny i gałęzi, VUF). '
    + 'Uruchom jedną z tych analiz w przestrzeni Obliczenia, aby zobaczyć wartości.',
  brakPrzebieguAkcja: 'Przejdź do obliczeń',
  ladowanie: 'Ładowanie wyników stanu fazowego…',
  bladTytul: 'Nie udało się pobrać wyników stanu fazowego',
  brakWierszyTytul: 'Przebieg nie zwrócił wyników stanu fazowego',
  brakWierszyOpis: 'Wskazany przebieg zakończył się bez wiersza wyników — sprawdź stan '
    + 'obliczenia w przestrzeni Obliczenia.',

  // Założenia / kontekst wyniku.
  zalCel: 'Cel analizy',
  zalStatusUzasadnienia: 'Status uzasadnienia',
  zalStatusRaportowy: 'Status raportowy',
  zalCelUwaga: 'Szyna celu wskazana w konfiguracji przebiegu.',

  // Tabela wartości fazowych.
  fazyTytul: 'Napięcia i prądy fazowe',
  kolFaza: 'Faza',
  kolNapiecie: 'Napięcie',
  kolPrad: 'Prąd',
  kolStraty: 'Straty czynne',
  fazaA: 'A',
  fazaB: 'B',
  fazaC: 'C',

  // Odchylenie od średniej faz z werdyktem solvera (karta W2 pkt 4, zero
  // fabrykacji): `phase_state_sn.py::_compute_unbalance_percent` liczy
  // ODCHYLENIE MAKSYMALNE OD ŚREDNIEJ TRZECH FAZ w % — NIE współczynnik
  // asymetrii wg składowych symetrycznych (VUF, IEC 61000-4-30/EN 50160).
  // Etykieta i opis mówią dokładnie to, nie sugerują VUF.
  asymetriaTytul: 'Odchylenie od średniej faz [%]',
  asymetriaOpis: 'Werdykt pochodzi z flag alarmowych solvera — próg alarmu jest '
    + 'jawnym wejściem przebiegu, nie progiem interfejsu. Wskaźnik to odchylenie '
    + 'maksymalne od średniej trzech faz w procentach — nie jest współczynnikiem '
    + 'asymetrii wg składowych symetrycznych (VUF); VUF liczy rozpływ niesymetryczny '
    + '(drugie źródło tego ekranu).',
  asymetriaU: 'Odchylenie napięcia od średniej faz',
  asymetriaI: 'Odchylenie prądu od średniej faz',
  asymetriaStrat: 'Odchylenie strat od średniej faz',
  werdyktPrzekroczenie: 'przekroczenie',
  werdyktWNormie: 'w normie',
  werdyktBrak: 'bez werdyktu',

  // Flagi stanu (zwarcie / otwarta faza).
  stanTytul: 'Stan obwodu w przebiegu',
  stanZwarcie: 'Zwarcie w fazach',
  stanOtwartaFaza: 'Otwarta faza',
  stanBrakZdarzen: 'Przebieg bez zwarcia i bez otwartej fazy.',

  // Ograniczenia raportowe.
  ograniczeniaTytul: 'Ograniczenia raportowe',

  // Rozpływ niesymetryczny (W5-D) — drugie źródło.
  rnZalSolver: 'Solver',
  rnZalSolverUwaga: 'Metoda wstecz–w przód (backward-forward sweep) na sieci promieniowej, '
    + 'impedancje własne i wzajemne ze składowych Z1/Z0 (Z_s = (Z0 + 2·Z1)/3, '
    + 'Z_m = (Z0 − Z1)/3).',
  rnZalZbieznosc: 'Zbieżność',
  rnZbiezny: 'zbieżny',
  rnNiezbiezny: 'niezbieżny',
  rnZalWyspy: 'Wyspy zasilone',
  rnZalWyspyUwaga: 'Liczba niezależnie rozwiązanych wysp (każda ze swoim źródłem sieciowym).',
  rnZalSzynyNierozwiazane: 'Szyny poza wyspą zasiloną',
  rnSzynyTytul: 'Napięcia fazowe szyn',
  rnSzynyNota: 'Napięcia faza–N [kV] z solvera; VUF — współczynnik asymetrii napięcia wg '
    + 'składowych symetrycznych (IEC 61000-4-30), liczony przez solver. Bieg nie ocenia '
    + 'progu VUF — wartość bez werdyktu.',
  rnKolSzyna: 'Szyna',
  rnKolUn: 'Uₙ',
  rnKolUA: 'U_A',
  rnKolUB: 'U_B',
  rnKolUC: 'U_C',
  rnKolVuf: 'VUF',
  rnNierozwiazana: 'poza wyspą zasiloną',
  rnGalezieTytul: 'Prądy fazowe gałęzi',
  rnGalezieNota: 'Prądy faz na początku gałęzi [A] oraz straty czynne gałęzi [kW] z solvera; '
    + 'prąd znamionowy z katalogu (kreska = brak danych katalogowych).',
  rnKolGalaz: 'Gałąź',
  rnKolRodzaj: 'Rodzaj',
  rnKolIA: 'I_A',
  rnKolIB: 'I_B',
  rnKolIC: 'I_C',
  rnKolIn: 'Iₙ',
  rnKolStraty: 'Straty P',
  rnPodsumowanieTytul: 'Podsumowanie biegu',
  rnStratyCalkowite: 'Straty czynne całkowite',
  rnStratyBierne: 'Straty bierne całkowite',
  rnMaxVuf: 'Największy VUF',
  rnMaxVufSzyna: 'Szyna o największym VUF',
  rnSzynyRozwiazane: 'Szyny rozwiązane',
  rnZalozeniaTytul: 'Założenia biegu',
  rnZalozeniaNota: 'Każde założenie jest nazwane kodem kanonu gotowości i wskazuje elementy, '
    + 'których dotyczy — bieg nie podstawia wartości bez nazwania tego tutaj.',
  rnBezZalozen: 'Bieg bez założeń upraszczających.',
  rnElementy: 'Elementy',
  jednKvar: 'kvar',

  // Następny krok.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Pełny wywód obliczenia znajdziesz w oknie dowodu obliczeń; przebieg '
    + 'uruchamiasz ponownie w przestrzeni Obliczenia.',
  akcjaDowod: 'Otwórz dowód obliczeń',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',

  // Jednostki i brak danych.
  jednKV: 'kV',
  jednA: 'A',
  jednKW: 'kW',
  jednProcent: '%',
  kreska: '—',
} as const;

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Wartość liczbowa lub uczciwa kreska (kontrakt dopuszcza null). */
export function fmtLubKreska(n: number | null | undefined, miejsca: number): string {
  return n != null ? fmtLiczba(n, miejsca) : STAN_FAZOWY_STRINGS.kreska;
}
