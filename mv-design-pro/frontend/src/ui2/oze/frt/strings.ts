/*
 * Teksty i deterministyczne formatery okna „Walidacja modelu falownika"
 * (trajektorie FRT/HVRT, karta U4 P38 / strumień OZE). Wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7); zero literałów UI w JSX. Formatery CZYSTE
 * (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule) — przecinek
 * dziesiętny wg konwencji PL. Identyfikatory (der_ref, operator_id) tylko w trybie
 * eksperckim; nazwy PL na pierwszym planie. Nazwy sufiksowane `Frt`, bo barrel OZE
 * robi `export *` (kolizje nazw TS2308).
 */

export const FRT_STRINGS = {
  // Nagłówek okna
  tytul: 'Walidacja modelu falownika (trajektorie FRT)',
  opisWstep:
    'Trajektoria napięcia, prądu biernego i mocy czynnej modułu DER dla testu przejścia '
    + 'przez zapad (LVRT) lub wzrost (HVRT) napięcia, na tle obwiedni wymaganej przez '
    + 'profil operatora OSD (NC RfG). Napięcie trajektorii jest dziś zadane profilem '
    + 'wejściowym, a nie wyznaczone z rozwiązania sieci, dlatego zdolność FRT nie jest '
    + 'oceniana — okno pokazuje powód i to, czego brakuje do oceny.',

  // Dobór modułu, operatora i rodzaju testu
  wyborModul: 'Moduł DER (instalacja OZE)',
  wyborModulPodpowiedz: 'Wybierz moduł z modelu — źródło typu przekształtnika (falownika).',
  wyborOperator: 'Operator OSD (NC RfG)',
  wyborOperatorPodpowiedz: 'Wybierz operatora — źródło obwiedni profilu ride-through.',
  wyborRodzaj: 'Rodzaj testu',
  wyborRodzajPodpowiedz: 'LVRT — przejście przez zapad; HVRT — przejście przez wzrost napięcia.',
  rodzajLvrt: 'LVRT — zapad napięcia',
  rodzajHvrt: 'HVRT — wzrost napięcia',
  modulBezTypu: 'brak wskazanego typu przekształtnika',
  opcjaWybierz: '— wybierz —',
  przyciskOblicz: 'Uruchom test FRT',
  przyciskPrzelicz: 'Przelicz',

  // Stany uczciwe
  ladowanieKatalogu: 'Wczytywanie katalogu operatorów…',
  bladKatalogu: 'Nie udało się wczytać katalogu operatorów',
  brakModulow: 'Brak modułów DER w modelu',
  brakModulowOpis:
    'Dodaj instalację OZE (PV / BESS / FW) w konfiguratorze stacji, aby uruchomić '
    + 'walidację modelu falownika.',
  modulBezTypuTytul: 'Wybrany moduł nie ma wskazanego typu przekształtnika',
  modulBezTypuOpis:
    'Walidacja modelu falownika wymaga typu katalogowego przekształtnika '
    + '(urządzenie wytwórcze modułu). Uzupełnij dobór urządzenia w konfiguratorze DER.',
  brakWyniku: 'Wybierz moduł, operatora i rodzaj testu, następnie uruchom test',
  brakWynikuOpis: 'Jawny bieg pobierze trajektorie modułu i obwiednię profilu operatora.',
  ladowanie: 'Symulacja trajektorii FRT/HVRT…',
  blad: 'Nie udało się uruchomić testu FRT',

  // K5-B (H-3 pkt 4): akcja wyjściowa — zapis STANU OCENY do zgodności NC RfG
  // (wspólny store biegu NC RfG; macierz wymogów pokazuje go przy module).
  zapiszWynik: 'Zapisz wynik do zgodności NC RfG',
  zapiszWynikOpis:
    'Stan oceny trajektorii (dziś: ocena niewykonana) trafia do wspólnego stanu '
    + 'zgodności NC RfG — macierz wymogów pokaże go przy tym module.',
  zapiszWynikZapisano: 'Stan oceny zapisany — widoczny w macierzy wymogów NC RfG',

  // Obwiednia profilu — informacja o wymaganiu (opis z backendu przy wykresie)
  obwiedniaTytul: 'Obwiednia wymagana przez profil operatora',

  // Sekcja audytowa (pola solvera uproszczonego)
  audytStatusSolvera: 'Status biegu solvera',

  // Założenia (część wyniku)
  zalozeniaModul: 'Moduł DER',
  zalozeniaTyp: 'Typ przekształtnika',
  zalozeniaOperator: 'Operator OSD',
  zalozeniaRodzaj: 'Rodzaj testu',
  zalozeniaPmax: 'Moc maksymalna Pmax',
  zalozeniaUn: 'Napięcie znamionowe Un',
  // Stopień dowodowy trajektorii (karta S-1 §0.9) — czy wynik wolno
  // przedstawić jako dowód regulacyjny (dziś: nie, model niezwalidowany).
  zalozeniaPodstawa: 'Stopień dowodowy',

  // Tabela scenariuszy (pierwszy plan) i tabela audytowa pól solvera
  kolScenariusz: 'Scenariusz',
  kolGlebokosc: 'Napięcie skrajne',
  kolOcena: 'Ocena',
  kolStatusSolvera: 'Status solvera',
  kolUtrzymanie: 'Utrzymanie pracy',
  kolMarginesS: 'Margines do krzywej',
  kolMarginesPu: 'Margines do krzywej',
  kolOdzysk: 'Czas odzysku P',
  utrzymanieTak: 'Tak',
  utrzymanieNie: 'Nie',

  // Wykres
  wykresTytul: 'Trajektoria modułu na tle obwiedni profilu operatora',
  wykresOsX: 'Czas t',
  wykresOsY: 'Wartość',
  legendaNapiecie: 'Napięcie U(t)',
  legendaObwiednia: 'Obwiednia wymagana (informacja)',
  legendaP: 'Moc czynna P(t)',
  legendaIq: 'Prąd bierny Iq(t)',
  serieTytul: 'Serie dodatkowe:',
  seriaP: 'Pokaż P(t)',
  seriaIq: 'Pokaż Iq(t)',

  // Status biegu solvera (etykiety PL, sekcja audytowa) — opis meldunku modelu
  // uproszczonego, nie ocena zdolności modułu.
  statusOk: 'moduł nie odłączył się w modelu uproszczonym',
  statusDerDropped: 'moduł odłączył się w modelu uproszczonym',
  // Karta S-4: brak modelu dynamicznego DER w wejściu solvera mapowany na
  // granicy na `blocked` — nazwany kod gotowości i brakujące pola towarzyszą
  // temu stanowi w widoku (`kod_gotowosci` / `missing_fields_pl`), ta
  // etykieta jest tylko nagłówkiem statusu.
  statusBlocked: 'Brak modelu dynamicznego modułu',
  statusInputInvalid: 'Niepoprawne wejście solvera',

  // Panel „brak modelu dynamicznego" (status_solvera === 'blocked', karta S-4)
  brakModeluTytul: 'Brak modelu dynamicznego modułu',
  brakModeluOpis:
    'Trajektorii FRT/HVRT nie da się policzyć — modułowi brakuje danych do zbudowania '
    + 'modelu dynamicznego. Uzupełnij dane wskazane niżej i uruchom bieg ponownie.',

  // Tryb ekspercki
  ekspModulId: 'Identyfikator typu przekształtnika',
  ekspOperatorId: 'Identyfikator operatora',
  ekspScenariuszId: 'Identyfikator scenariusza',

  // Jednostki i wartości puste
  jednPu: 'p.u.',
  jednS: 's',
  kreska: '—',

  // --- Sekcja „Sekwencja zapadów" (P43) ---
  sekwTytul: 'Sekwencja zapadów',
  sekwOpis:
    'Zdefiniuj serię kolejnych zapadów napięcia (głębokość i czas trwania) dla '
    + 'wybranego modułu i operatora. Każdy zapad liczony jest trajektorią zadaną profilem '
    + 'wejściowym, dlatego ani zapad, ani sekwencja nie są oceniane.',
  sekwBrakDoboru: 'Wybierz moduł DER i operatora powyżej',
  sekwBrakDoboruOpis:
    'Sekwencja zapadów korzysta z tego samego modułu i operatora co test trajektorii. '
    + 'Dobierz oba pola, aby zdefiniować zapady.',
  sekwEdytorTytul: 'Zapady w sekwencji',
  sekwKolGlebokosc: 'Głębokość zapadu',
  sekwKolCzas: 'Czas trwania',
  sekwDodajWiersz: 'Dodaj zapad',
  sekwUsunWiersz: 'Usuń zapad',
  sekwUsunAria: 'Usuń zapad z sekwencji',
  sekwPrzyciskOblicz: 'Uruchom sekwencję',
  sekwPrzyciskPrzelicz: 'Przelicz sekwencję',
  sekwIdle: 'Zdefiniuj zapady i uruchom sekwencję',
  sekwIdleOpis: 'Jawny bieg policzy trajektorię każdego zapadu od stanu ustalonego.',
  sekwLadowanie: 'Symulacja sekwencji zapadów…',
  sekwBlad: 'Nie udało się uruchomić sekwencji zapadów',
  sekwZalozeniaTytul: 'Założenia',
  sekwKolZapad: 'Zapad',
  sekwKontekstTytul: 'Kontekst siły sieci',
  sekwKontekstScr: 'Wskaźnik zwarciowy SCR',
  sekwKontekstMocZwarciowa: 'Moc zwarciowa Sk″',
  sekwKontekstMocZainstalowana: 'Moc zainstalowana źródeł',
  sekwKontekstWezel: 'Węzeł przyłączenia',
  sekwKontekstWerdykt: 'Ocena siły sieci',
  sekwKontekstSladTytul: 'Ślad obliczeń (pełna jawność)',
  sekwKontekstSladPokaz: 'Pokaż ślad obliczeń',
  sekwKontekstSladUkryj: 'Ukryj ślad obliczeń',
  sekwEkspHash: 'Odcisk wejścia (SHA-256)',
  jednMva: 'MVA',

  // Opcjonalny dobór kontekstu siły sieci (przebieg zwarciowy + węzeł)
  sekwKontekstDoborTytul: 'Kontekst siły sieci (opcjonalny)',
  sekwKontekstDoborOpis:
    'Wskaż zakończony przebieg zwarciowy i węzeł przyłączenia, aby dołączyć do wyniku '
    + 'kontekst siły sieci (SCR / moc zwarciowa Sk″). Bez wyboru sekwencja liczona jest jak dotąd.',
  sekwKontekstRunEtykieta: 'Przebieg zwarciowy',
  sekwKontekstRunPusty: 'Bez kontekstu siły sieci',
  sekwKontekstRunBrak: 'Brak zakończonych przebiegów zwarciowych w tym projekcie.',
  sekwKontekstBusEtykieta: 'Węzeł przyłączenia',
  sekwKontekstBusOpis: 'Referencja szyny przyłączenia z wybranego przebiegu zwarciowego.',
  sekwKontekstBusPlaceholder: 'np. SZYNA-GPZ',
} as const;

/** Etykieta PL statusu solvera FRT/HVRT. */
export function etykietaStatusuFrt(status: string): string {
  switch (status) {
    case 'ok':
      return FRT_STRINGS.statusOk;
    case 'der_dropped':
      return FRT_STRINGS.statusDerDropped;
    case 'blocked':
      return FRT_STRINGS.statusBlocked;
    case 'input_invalid':
      return FRT_STRINGS.statusInputInvalid;
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczbaFrt(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Napięcie / margines [p.u.] — 3 miejsca po przecinku. */
export function fmtPuFrt(n: number): string {
  return fmtLiczbaFrt(n, 3);
}

/** Czas [s] — 3 miejsca po przecinku. */
export function fmtSFrt(n: number): string {
  return fmtLiczbaFrt(n, 3);
}

/** Wartość opcjonalna [p.u.]: liczba → format, null → kreska. */
export function fmtPuOpcjaFrt(n: number | null): string {
  return n === null ? FRT_STRINGS.kreska : fmtPuFrt(n);
}

/** Wartość opcjonalna [s]: liczba → format, null → kreska. */
export function fmtSOpcjaFrt(n: number | null): string {
  return n === null ? FRT_STRINGS.kreska : fmtSFrt(n);
}
