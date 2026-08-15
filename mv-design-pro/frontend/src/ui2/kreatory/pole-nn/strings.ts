/** Teksty PL kreatora „Pole odpływowe nN" (add_nn_outgoing_field). Język inżynierski. */

export function poleNnStrings(isSource: boolean) {
  return {
    eyebrow: isSource ? 'MODEL SIECI · POLE PRZYŁĄCZENIOWE nN' : 'MODEL SIECI · POLE ODPŁYWOWE nN',
    tytul: isSource ? 'Pole przyłączeniowe nN' : 'Pole odpływowe nN',
    cel: isSource
      ? 'Dodaj pole przyłączeniowe nN — punkt podłączenia źródła (PV/BESS/agregat) do szyny nN stacji.'
      : 'Dodaj pole odpływowe nN — obwód wyprowadzenia mocy z szyny nN do odbiorów. Zabezpieczenie odpływu '
        + 'dobiera się selektywnie względem zabezpieczenia głównego pola nN.',
    odznaka: isSource ? 'Nowe pole źródłowe' : 'Nowy odpływ nN',

    poleTytul: 'Pole nN',
    polePomoc: isSource
      ? 'Pole źródłowe wiąże źródło z szyną nN — po co: wprowadza generację; z czego: szyna nN stacji; '
        + 'co daje: punkt przyłączenia dla falownika/agregatu.'
      : 'Odpływ wyprowadza obwód z szyny nN — po co: zasila odbiory; z czego: szyna nN; co daje: obwód '
        + 'z własnym zabezpieczeniem, skoordynowanym z polem głównym.',
    stacja: 'Stacja',
    szyna: 'Szyna nN',
    szynaPlaceholder: '— wybierz szynę nN —',
    nazwa: 'Nazwa pola',
    nazwaPlaceholderFeeder: 'np. Odpływ nN #3',
    nazwaPlaceholderSource: 'np. Pole PV nN #1',
    rodzinaZrodla: 'Rodzina pola przyłączeniowego',

    kontrolaTytul: 'Kontrola pola',
    wierszStacja: 'Stacja',
    wierszSzyna: 'Szyna nN',
    wierszRola: 'Rola pola',
    rolaFeeder: 'Odpływ',
    rolaSource: 'Pole źródłowe',

    downstreamTytul: 'Co to uruchamia',
    downstreamOpisFeeder:
      'Odpływ wchodzi do modelu rozdziału mocy nN. Do obwodu dobierzesz zabezpieczenie (osobny krok), '
      + 'które musi być selektywne z zabezpieczeniem głównym rozdzielnicy.',
    downstreamOpisSource:
      'Pole źródłowe udostępnia punkt przyłączenia dla układu OZE (PV/BESS) albo agregatu.',

    brakStacjiTytul: 'Brak stacji',
    brakStacjiOpis: 'Nie udało się ustalić stacji dla pola nN. Zaznacz na schemacie szynę nN lub pole stacji.',
    brakSzynTytul: 'Brak szyny nN',
    brakSzynOpis: 'Wskazana stacja nie ma szyny nN. Najpierw dodaj rozdzielnicę / szynę nN.',

    zapisz: isSource ? 'Dodaj pole przyłączeniowe' : 'Dodaj pole nN',
    anuluj: 'Anuluj',
    brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem pola nN.',
    brakStacjiWalid: 'Nie udało się ustalić stacji dla pola nN.',
    brakSzynyWalid: 'Wybierz szynę nN, do której ma zostać dodane pole.',
    walidacjaStopka: 'Wskaż szynę nN, aby zapisać pole.',
    bladDodania: isSource ? 'Nie udało się dodać pola przyłączeniowego nN.' : 'Nie udało się dodać pola nN.',

    // Panel teorii
    teoriaTytul: 'Teoria: dobór zabezpieczenia odpływu i selektywność z głównym',
    teoriaOpis:
      'Odpływ nN chroni własne zabezpieczenie (bezpiecznik lub wyłącznik), które musi zadziałać przed '
      + 'zabezpieczeniem głównym rozdzielnicy — to selektywność. Oznaczmy indeksem 1 zabezpieczenie odpływu, '
      + 'a indeksem 2 zabezpieczenie główne. Warunek prądowy: prąd znamionowy odpływu jest niższy niż głównego '
      + '($I_{n1} < I_{n2}$), a charakterystyki nie przecinają się w zakresie prądów zwarciowych. Warunek '
      + 'czasowy dla członów zwłocznych: czas zadziałania odpływu z zapasem jest krótszy od głównego, '
      + '$t_1 + \\Delta t \\le t_2$, gdzie schodek selektywności $\\Delta t \\approx 0{,}3\\ \\mathrm{s}$. '
      + 'Dzięki temu zwarcie na odpływie wyłącza tylko ten obwód, a pozostałe odbiory pracują dalej. Odpływ '
      + 'musi też spełniać warunek samoczynnego wyłączenia (ochrona przeciwporażeniowa): '
      + '$I_a \\le I_{k,\\min}$ dla wymaganego czasu wyłączenia.',
    teoriaWymog:
      'Dobierz zabezpieczenie odpływu tak, by było selektywne z głównym i zapewniało samoczynne wyłączenie '
      + 'w czasie normowym dla najdłuższego obwodu. Nastawy i prądy zwarciowe liczy backend (IEC 60364/60909).',
    teoriaPodstawa: 'Podstawa: PN-HD 60364-4-41 (ochrona przeciwporażeniowa), PN-EN 60947 (aparatura nN).',
  } as const;
}
