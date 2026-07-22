/** Teksty PL kreatora „Źródło dyspozycyjne nN (agregat / UPS)". Język inżynierski. */

import type { DispatchableKind } from './zrodloDyspozycyjneModel';

export const ZRODLO_DYSP_STRINGS = {
  eyebrowGenset: 'MODEL SIECI · AGREGAT nN',
  eyebrowUps: 'MODEL SIECI · UPS nN',
  celGenset:
    'Dodaj agregat prądotwórczy (zespół prądotwórczy) do rozdzielni nN — źródło rezerwowe/dyspozycyjne, '
    + 'które podaje moc i wnosi prąd zwarciowy maszyny synchronicznej. Parametry z katalogu; aparat pola '
    + 'przyłączeniowego dobierasz tu samo.',
  celUps:
    'Dodaj zasilacz UPS do rozdzielni nN — źródło gwarantowane podtrzymujące odbiory krytyczne. Parametry '
    + '(moc, czas podtrzymania, tryb) z katalogu; aparat pola przyłączeniowego dobierasz tu samo.',
  odznakaGenset: 'Nowy agregat nN',
  odznakaUps: 'Nowy UPS nN',

  krokPole: 'Przyłączenie i pole',
  krokParametry: 'Parametry źródła',
  krokZapis: 'Podsumowanie i zapis',

  // Przyłączenie
  stacja: 'Stacja',
  szyna: 'Szyna nN',
  szynaPlaceholder: '— wybierz szynę nN —',
  szynaPomoc: 'Szyna nN, do której przyłączasz źródło (pole zasili tę szynę).',
  szynaBrak: 'Ta stacja nie ma jeszcze szyny nN — dodaj transformator SN/nN albo szynę nN.',

  osadzenie: 'Osadzenie w rozdzielni nN',
  osadzenieOpcje: [
    { id: 'NEW_FIELD', etykieta: 'Utwórz nowe pole przyłączeniowe' },
    { id: 'EXISTING_FIELD', etykieta: 'Użyj istniejącego pola źródłowego' },
  ],
  poleIstniejace: 'Istniejące pole źródłowe',
  poleIstniejacePlaceholder: '— wybierz pole —',
  poleIstniejaceBrak:
    'Na tej szynie nN nie ma jeszcze pola źródłowego dla agregatu/UPS — wybierz „Utwórz nowe pole '
    + 'przyłączeniowe", aby utworzyć je razem ze źródłem.',

  aparat: 'Aparat pola',
  aparatOpcje: [
    { id: 'WYLACZNIK', etykieta: 'Wyłącznik' },
    { id: 'ROZLACZNIK', etykieta: 'Rozłącznik' },
    { id: 'BEZPIECZNIK', etykieta: 'Bezpiecznik' },
  ],
  aparatPomoc: 'Aparat łączeniowy pola przyłączeniowego źródła.',
  stanNormalny: 'Stan normalny',
  stanNormalnyOpcje: [
    { id: 'ZAMKNIETY', etykieta: 'Zamknięty' },
    { id: 'OTWARTY', etykieta: 'Otwarty' },
  ],
  aparatKatalog: 'Typ aparatu z katalogu',
  aparatKatalogPlaceholder: '— (opcjonalnie) wybierz aparat nN —',
  aparatKatalogPomoc: 'Opcjonalne powiązanie katalogowe aparatu pola (obciążalność, zdolność łączeniowa).',
  aparatKatalogBlad: 'Nie udało się pobrać katalogu aparatów nN.',
  napiecieNn: 'Napięcie nN pola',
  napiecieNnPomoc: 'Napięcie znamionowe pola przyłączeniowego [kV].',
  nazwaPola: 'Nazwa pola',
  nazwaPolaPlaceholder: 'np. Pole agregatu',

  // Parametry
  katalogGenset: 'Katalog agregatu',
  katalogUps: 'Katalog UPS',
  katalogPlaceholder: '— wybierz z katalogu —',
  katalogBladGenset: 'Nie udało się pobrać katalogu agregatów.',
  katalogBladUps: 'Nie udało się pobrać katalogu UPS.',
  katalogPomoc: 'Katalog wnosi parametry źródła i model zwarciowy — bez ręcznych impedancji.',
  moc: 'Moc znamionowa',
  mocPomoc: 'Moc czynna znamionowa źródła [kW].',
  napiecie: 'Napięcie znamionowe',
  napieciePomoc: 'Napięcie znamionowe agregatu [kV].',
  cosfi: 'Współczynnik mocy',
  cosfiPomoc: 'Znamionowy cos φ agregatu (0–1).',
  trybGenset: 'Tryb pracy',
  trybGensetOpcje: [
    { id: 'PRACA_CIAGLA', etykieta: 'Praca ciągła' },
    { id: 'PRACA_AWARYJNA', etykieta: 'Praca awaryjna' },
    { id: 'PRACA_SZCZYTOWA', etykieta: 'Praca szczytowa' },
    { id: 'WYLACZONE', etykieta: 'Wyłączone' },
  ],
  paliwo: 'Rodzaj paliwa',
  paliwoOpcje: [
    { id: '', etykieta: '— brak —' },
    { id: 'DIESEL', etykieta: 'Diesel' },
    { id: 'GAZ', etykieta: 'Gaz' },
    { id: 'BIOPALIWO', etykieta: 'Biopaliwo' },
    { id: 'INNY', etykieta: 'Inny' },
  ],
  czasPodtrzymania: 'Czas podtrzymania',
  czasPodtrzymaniaPomoc: 'Czas pracy UPS z akumulatorów przy pełnym obciążeniu [min].',
  trybUps: 'Tryb pracy',
  trybUpsOpcje: [
    { id: 'ONLINE', etykieta: 'Online (podwójna konwersja)' },
    { id: 'LINE_INTERACTIVE', etykieta: 'Liniowo-interakcyjny' },
    { id: 'OFFLINE', etykieta: 'Offline (standby)' },
    { id: 'WYLACZONE', etykieta: 'Wyłączone' },
  ],
  akumulator: 'Typ akumulatora',
  akumulatorOpcje: [
    { id: '', etykieta: '— brak —' },
    { id: 'LI_ION', etykieta: 'Li-Ion' },
    { id: 'VRLA', etykieta: 'VRLA (kwasowy)' },
    { id: 'NICD', etykieta: 'NiCd' },
    { id: 'INNY', etykieta: 'Inny' },
  ],
  nazwaZrodla: 'Nazwa źródła',
  nazwaZrodlaPlaceholder: 'np. Agregat rezerwowy',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpisGenset:
    'Agregat wejdzie do bilansu mocy i do analiz zwarciowych jako maszyna synchroniczna (wkład prądu '
    + 'zwarciowego). Rozpływ mocy i zwarcia policzy solver po zapisie.',
  downstreamOpisUps:
    'UPS wejdzie do bilansu jako źródło gwarantowane; jego ograniczony wkład zwarciowy (falownik) '
    + 'uwzględni analiza zwarciowa. Wyniki liczbowe policzy solver po zapisie.',

  kontrolaTytul: 'Kontrola źródła',
  wierszSzyna: 'Szyna nN',
  wierszPole: 'Pole',
  wierszKatalog: 'Katalog',
  wierszMoc: 'Moc',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapiszGenset: 'Zapisz agregat',
  zapiszUps: 'Zapisz UPS',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem źródła.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać źródło.',

  // Panel teorii
  teoriaTytulGenset: 'Teoria: wkład zwarciowy maszyny synchronicznej (agregat)',
  teoriaOpisGenset:
    'Agregat to maszyna synchroniczna — przy zwarciu podaje prąd ograniczony reaktancją wewnętrzną. '
    + 'Początkowy prąd zwarciowy zależy od reaktancji podprzejściowej $X_d\'\'$: '
    + '$I_k\'\' = \\dfrac{c\\,U_n}{\\sqrt{3}\\,\\left|Z_G\\right|}$, gdzie $Z_G = R_G + jX_d\'\'$. Prąd maleje w czasie '
    + '(podprzejściowy → przejściowy $X_d\'$ → ustalony $X_d$), bo pole wzbudzenia i reakcja twornika zmieniają '
    + 'się. Moc pozorna wynika z mocy czynnej i cos φ: $S = \\dfrac{P}{\\cos\\varphi}$, a prąd znamionowy '
    + '$I_n = \\dfrac{S}{\\sqrt{3}\\,U_n}$. Reaktancje bierze się z katalogu — to one, nie moc, wyznaczają wkład '
    + 'zwarciowy, dlatego agregat modeluje się jako źródło za impedancją.',
  teoriaWymogGenset:
    'Aparat pola i kable muszą wytrzymać sumaryczny prąd zwarciowy (sieć + agregat pracujący równolegle). '
    + 'Dla pracy wyspowej sprawdza się zdolność rozruchową i udźwig mocy rozruchowej odbiorów.',
  teoriaPodstawaGenset: 'Podstawa: PN-EN 60909 (prądy zwarciowe), PN-ISO 8528 (zespoły prądotwórcze).',

  teoriaTytulUps: 'Teoria: UPS jako źródło gwarantowane i jego wkład zwarciowy',
  teoriaOpisUps:
    'UPS podtrzymuje odbiory krytyczne z akumulatorów przez czas $t \\approx \\dfrac{E_{bat}}{P_{obc}}$ '
    + '(energia baterii do mocy obciążenia). Wyjście przez falownik ogranicza prąd zwarciowy do wielokrotności '
    + 'prądu znamionowego $I_k \\approx k\\,I_n$ (typowo $k \\le 2$–$3$), znacznie mniej niż maszyna wirująca — '
    + 'falownik szybko wchodzi w ograniczenie prądowe. Moc pozorna $S = \\dfrac{P}{\\cos\\varphi}$, prąd '
    + 'znamionowy $I_n = \\dfrac{S}{\\sqrt{3}\\,U_n}$. W trybie online (podwójna konwersja) odbiór jest stale '
    + 'zasilany z falownika, co daje pełną separację od zaburzeń sieci.',
  teoriaWymogUps:
    'Zabezpieczenia za UPS dobiera się do jego ograniczonego prądu zwarciowego (selektywność bywa trudna); '
    + 'czas podtrzymania musi pokryć czas zadziałania źródła rezerwowego lub bezpiecznego wyłączenia.',
  teoriaPodstawaUps: 'Podstawa: PN-EN 62040 (UPS), PN-EN 60909 (prądy zwarciowe).',
} as const;

/** Skrót wyboru tekstów zależnych od rodzaju źródła. */
export function tekstyDla(kind: DispatchableKind) {
  const T = ZRODLO_DYSP_STRINGS;
  const genset = kind === 'GENSET';
  return {
    eyebrow: genset ? T.eyebrowGenset : T.eyebrowUps,
    cel: genset ? T.celGenset : T.celUps,
    odznaka: genset ? T.odznakaGenset : T.odznakaUps,
    katalog: genset ? T.katalogGenset : T.katalogUps,
    katalogBlad: genset ? T.katalogBladGenset : T.katalogBladUps,
    zapisz: genset ? T.zapiszGenset : T.zapiszUps,
    downstreamOpis: genset ? T.downstreamOpisGenset : T.downstreamOpisUps,
    teoriaTytul: genset ? T.teoriaTytulGenset : T.teoriaTytulUps,
    teoriaOpis: genset ? T.teoriaOpisGenset : T.teoriaOpisUps,
    teoriaWymog: genset ? T.teoriaWymogGenset : T.teoriaWymogUps,
    teoriaPodstawa: genset ? T.teoriaPodstawaGenset : T.teoriaPodstawaUps,
  };
}
