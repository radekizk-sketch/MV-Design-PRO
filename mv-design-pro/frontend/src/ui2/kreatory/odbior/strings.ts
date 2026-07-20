/** Teksty PL kreatora „Dodaj odbiór nN" (G-NN). Język inżynierski. */

export const ODBIOR_STRINGS = {
  eyebrow: 'MODEL SIECI · ODBIÓR nN',
  cel:
    'Dodaj odbiór na odpływie nN. Podajesz moc czynną i współczynnik mocy cosφ; '
    + 'prąd i moc pozorną liczy backend, a moc bierną Q operacja wyprowadza z cosφ. '
    + 'Typ odbioru możesz wziąć z katalogu albo wpisać ręcznie.',
  odznaka: 'Nowy odbiór nN',

  krokDane: 'Dane odbioru',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Typ odbioru z katalogu (opcjonalnie)',
  typKatalogPlaceholder: '— odbiór ręczny (bez katalogu) —',
  typBlad: 'Nie udało się pobrać katalogu odbiorów.',
  typPomoc: 'Wybór typu wypełnia moc i cosφ z katalogu — możesz je potem skorygować.',

  nazwa: 'Nazwa odbioru',
  nazwaPlaceholder: 'np. Odbiór technologiczny hala A',
  moc: 'Moc czynna P',
  cosPhi: 'Współczynnik mocy cosφ',
  qOverride: 'Moc bierna Q (opcjonalnie)',
  qOverridePomoc: 'Puste = backend wyprowadzi Q z cosφ. Wpisz, aby narzucić wartość.',
  rodzaj: 'Rodzaj odbioru',
  rodzajOpcje: [
    { id: 'SKUPIONY', etykieta: 'Skupiony' },
    { id: 'ROZPROSZONY', etykieta: 'Rozproszony' },
  ],
  przylacze: 'Sposób przyłączenia',
  przylaczeOpcje: [
    { id: 'TROJFAZOWY', etykieta: 'Trójfazowy' },
    { id: 'JEDNOFAZOWY', etykieta: 'Jednofazowy' },
  ],

  // Podgląd (R1).
  podgladTytul: 'Podgląd odbioru (backend)',
  podgladI: 'Prąd odbioru',
  podgladS: 'Moc pozorna S',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie prądu po stronie serwera (R1)',
  podgladBrak: 'Podaj moc i cosφ, aby zobaczyć prąd odbioru.',
  podgladBlad: 'Nie udało się wyznaczyć podglądu prądu.',

  // Downstream.
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy uwzględni odbiór (P i Q z cosφ); analizy łuku, bilansu energii '
    + 'i strat oraz identyfikacja granic policzą jego wpływ.',

  // Kontrola.
  kontrolaTytul: 'Kontrola odbioru',
  wierszOdplyw: 'Odpływ nN',
  wierszMoc: 'Moc P',
  wierszCos: 'cosφ',
  wierszPrad: 'Prąd',

  // Stan zerowy.
  brakOdplywuTytul: 'Brak odpływu nN',
  brakOdplywuOpis:
    'Zaznacz na schemacie odpływ nN, do którego chcesz dołączyć odbiór, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz odbiór nN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem odbioru.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać odbiór.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: odbiór nN — moc, współczynnik mocy i model obciążenia',
  teoriaOpis:
    'Odbiór reprezentuje pobór mocy czynnej P i biernej Q na szynie nN. Współczynnik mocy cosφ '
    + 'wiąże je: Q = P·tan(arccos cosφ) — im niższy cosφ, tym większy pobór Q i większe obciążenie '
    + 'sieci oraz straty. Model obciążenia (stała moc / stały prąd / stała impedancja, tzw. ZIP) '
    + 'określa, jak pobór zmienia się z napięciem: odbiory stałomocowe pobierają tę samą P niezależnie '
    + 'od napięcia, impedancyjne — malejącą przy spadku napięcia. Sposób przyłączenia (1‑/3‑fazowe) '
    + 'wpływa na niesymetrię. Rozkład napięć i prądów od tego odbioru liczy solver rozpływu mocy.',
  teoriaWymog:
    'cosφ w punkcie przyłączenia powinien spełniać wymagania OSD (zwykle ≥ 0,93 tgφ ≤ 0,4); '
    + 'moc przyłączeniowa i model obciążenia muszą odpowiadać rzeczywistemu charakterowi odbioru.',
  teoriaPodstawa: 'Podstawa: PN-EN 50160, IRiESD (tgφ), model ZIP obciążenia.',
  teoriaJakCzytac:
    'Trójkąt mocy: przyprostokątna pozioma = moc czynna P, pionowa = moc bierna Q, '
    + 'przeciwprostokątna = moc pozorna S. Kąt między P a S rośnie, gdy cosφ maleje — im niższy '
    + 'cosφ, tym więcej Q na tę samą P (Q = P·tan(arccos cosφ)). Rzeczywisty pobór liczy rozpływ.',
  wykresAria: 'Trójkąt mocy odbioru w funkcji cosφ (P, Q, S)',
  wykresOsP: 'Moc czynna P [pu]',
  wykresOsQ: 'Moc bierna Q [pu]',
  wykresP: 'P (czynna)',
  wykresQ: 'Q (bierna)',
  wykresS: 'S (pozorna)',
} as const;
