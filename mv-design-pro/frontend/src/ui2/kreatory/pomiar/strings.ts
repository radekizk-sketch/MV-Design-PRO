/** Teksty PL kreatora „Punkt pomiarowy pola SN" (add_ct / add_vt). Język inżynierski. */

export function pomiarStrings(isCt: boolean) {
  const przekladnik = isCt ? 'prądowy CT' : 'napięciowy VT';
  const jednostka = isCt ? 'A' : 'V';
  return {
    eyebrow: `MODEL SIECI · PRZEKŁADNIK ${isCt ? 'PRĄDOWY CT' : 'NAPIĘCIOWY VT'}`,
    tytul: isCt ? 'Przekładnik prądowy CT' : 'Przekładnik napięciowy VT',
    cel:
      `Dodaj przekładnik ${przekladnik} do pola SN — zasila tor pomiarowy i zabezpieczenia `
      + 'przetworzonym, bezpiecznym sygnałem. Przekładnię i klasę dokładności bierzesz z katalogu; '
      + 'redundancja pomiarów podnosi wiarygodność estymacji stanu sieci.',
    odznaka: isCt ? 'Nowy CT' : 'Nowy VT',

    krokPole: 'Pole i katalog',
    krokZnamionowe: 'Dane znamionowe',
    krokZapis: 'Podsumowanie i zapis',

    poleTytul: 'Kontekst pola',
    polePomoc: `Przekładnik ${przekladnik} montuje się w polu SN — po co: transformuje wielkość `
      + 'pierwotną na sygnał wtórny; z czego: prąd/napięcie szyny pola; co daje: wejście dla zabezpieczeń '
      + 'i układu pomiarowego.',
    poleSn: 'Pole SN',
    poleSnPlaceholder: '— wybierz pole SN —',

    katalogTytul: `Typ katalogowy przekładnika`,
    katalog: isCt ? 'Przekładnik prądowy z katalogu' : 'Przekładnik napięciowy z katalogu',
    katalogPlaceholder: '— wybierz przekładnik —',
    katalogBlad: 'Nie udało się pobrać katalogu przekładników.',
    katalogPomoc: 'Typ przekładnika (przekładnia, klasa, moc obciążeniowa) — z katalogu. '
      + 'Wybór wypełnia dane znamionowe; możesz je doprecyzować poniżej.',

    znamionoweTytul: 'Dane znamionowe',
    przekladniaPierwotna: isCt ? 'Przekładnia pierwotna' : 'Napięcie pierwotne',
    przekladniaWtorna: isCt ? 'Przekładnia wtórna' : 'Napięcie wtórne',
    jednostka,
    klasa: 'Klasa dokładności',
    klasaPlaceholder: 'np. 0.5, 5P20',
    klasaPomoc: 'Klasa określa graniczny błąd przekładnika. Pomiar rozliczeniowy wymaga klasy dokładnej '
      + '(0,2S/0,5S); zabezpieczenia — klasy ochronnej (np. 5P20).',
    burden: 'Moc obciążeniowa',
    burdenJednostka: 'VA',
    burdenPomoc: 'Moc znamionowa obciążenia wtórnego. Przeciążenie toru pogarsza dokładność.',

    readStacja: 'Stacja',
    readSzyna: 'Szyna',

    kontrolaTytul: 'Kontrola przekładnika',
    wierszPole: 'Pole SN',
    wierszKatalog: 'Typ katalogowy',
    wierszPrzekladnia: 'Przekładnia',
    wierszKlasa: 'Klasa',

    downstreamTytul: 'Co to uruchamia',
    downstreamOpis:
      'Przekładnik zasila zabezpieczenia pola i wchodzi do modelu pomiarowego. Redundancja torów '
      + 'pozwala estymatorowi stanu wykryć i odrzucić błędne odczyty.',

    brakPolTytul: 'Brak pola SN',
    brakPolOpis: 'Najpierw dodaj pole SN, aby zamontować przekładnik pomiarowy.',

    wstecz: '← Wstecz',
    dalej: 'Dalej →',
    licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
    zapisz: isCt ? 'Zapisz przekładnik CT' : 'Zapisz przekładnik VT',
    anuluj: 'Anuluj',
    brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem przekładnika.',
    brakPolaWalid: 'Wybierz pole SN dla przekładnika.',
    brakKatalogu: 'Wybierz typ przekładnika z katalogu.',
    blednaPrzekladnia: 'Podaj poprawne wartości przekładni pierwotnej i wtórnej (> 0).',
    blednaBurden: 'Moc obciążeniowa musi być liczbą nieujemną.',
    walidacjaStopka: 'Uzupełnij pole, katalog i przekładnię, aby zapisać przekładnik.',
    bladDodania: 'Nie udało się dodać przekładnika do pola.',

    // Panel teorii
    teoriaTytul: 'Teoria: po co pomiary — estymacja stanu (WLS) i redundancja',
    teoriaOpis:
      'Estymacja stanu sieci wyznacza wektor stanu $x$ (napięcia węzłowe i kąty) z zaszumionych '
      + 'pomiarów $z$ metodą ważonych najmniejszych kwadratów: $\\min_x\\ J(x) = (z - h(x))^{\\top} R^{-1} (z - h(x))$, '
      + 'gdzie $h(x)$ to model pomiaru, a $R$ to macierz kowariancji błędów (dokładniejszy przekładnik = większa waga). '
      + 'Kluczowa jest redundancja: przy $m$ pomiarach i $n$ zmiennych stanu stopień redundancji to '
      + '$r = m - n$. Gdy $m > n$, nadmiarowe pomiary pozwalają wykryć i odrzucić błędy grube (bad data) '
      + 'oraz zmniejszyć wpływ szumu — pojedynczy błędny odczyt nie fałszuje całego obrazu sieci.',
    teoriaWymog:
      'Rozmieszczaj przekładniki tak, by sieć była obserwowalna ($m \\ge n$) z zapasem redundancji '
      + 'na krytycznych polach. Klasa dokładności wchodzi do $R$ — dobrać ją do funkcji (pomiar rozliczeniowy '
      + 'vs zabezpieczenie).',
    teoriaPodstawa: 'Podstawa: PN-EN 61869 (przekładniki), teoria estymacji stanu WLS (Schweppe).',
  } as const;
}
