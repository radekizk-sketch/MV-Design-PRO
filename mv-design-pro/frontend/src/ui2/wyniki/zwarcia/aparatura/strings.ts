/**
 * Teksty PL ogniwa „wynik zwarciowy → wytrzymałość aparatury pól" (karty KD-4, KD-6,
 * APARATURA-TABELA, KD6-SZCZEGOLY). Język inżynierski; werdykt, założenia i wyjaśnienia
 * zawsze cytowane z backendu (nie układane tutaj). Symbole wielkości idą jako wzory LaTeX
 * (`MathInline`), nie jako tekst ASCII.
 */

export const APARATURA_STRINGS = {
  // Nagłówek: ocenia się aparaturę PÓL STACJI w ich punktach zabudowy; nagłówek nazywa stację
  // (wybrany punkt zwarcia tylko ją wskazuje — karta WYTRZYMALOSC-PRAD-POLA).
  tytul: 'Wytrzymałość aparatury pól stacji',
  akcja: 'Sprawdź aparaturę pól stacji',
  akcjaPonow: 'Sprawdź ponownie',
  pracuje: 'Sprawdzanie wytrzymałości…',
  norma: 'IEC 60909 · ocena z obliczenia wytrzymałości',

  wejscieStacja: 'Stacja',
  wejsciePola: 'Pola z aparaturą',

  // Prądy wspólne nad tabelą — tylko gdy backend podał dla wszystkich pól te same wartości.
  pradyWspolne: 'Prądy zwarciowe — jednakowe dla wszystkich pól',

  // Kolumny tabeli; jednostka w nagłówku, nie w komórce. Symbole wielkości: `LATEX`.
  kolPole: 'Pole',
  kolAparat: 'Aparat',
  jednKa: '[kA]',
  jednS: '[s]',
  czasPrzerwania: 'czas przerwania prądu',
  kolZapasDynamiczny: 'Zapas dynamiczny [kA]',
  kolZapasCieplny: 'Zapas cieplny [kA]',
  kolZapasWylaczalny: 'Zapas wyłączalny [kA]',

  // Tabela kryteriów pola.
  kolKryterium: 'Kryterium',
  kolObliczony: 'Prąd obliczony [kA]',
  kolZnamionowa: 'Wartość znamionowa [kA]',
  kolZapas: 'Zapas [kA]',
  kryteriumDynamiczne: 'Dynamiczne',
  kryteriumCieplne: 'Cieplne',
  kryteriumWylaczalne: 'Wyłączalne',

  // Czas wyłączenia pod tabelą: człon zabezpieczenia + czas własny wyłącznika = czas wyłączenia.
  czasWylaczenia: 'Czas wyłączenia',
  czasZNastaw: 'z nastaw zabezpieczeń pola',
  czasProjektanta: 'wartość projektanta',
  czasRoboczy: 'wartość robocza (IEC 62271-1)',
  // Przyjęty czas zwarcia (pakiet 8): wartość projektanta na łączniku pola, zapis = operacja
  // modelu i automatyczne przeliczenie biegu zwarciowego.
  przyjetyCzas: 'Przyjęty czas zwarcia [s]',
  zapiszCzas: 'Zapisz i przelicz',
  przeliczanie: 'Przeliczanie…',
  czasPoza: 'Czas zwarcia podaje się w sekundach z przedziału (0; 5] s.',
  brakLacznikaPola:
    'Pole nie ma łącznika w modelu — przyjęty czas zwarcia zapisuje się na wyłączniku pola. Dodaj aparat pola w karcie pola.',
  bladZapisuCzasu: 'Nie udało się zapisać przyjętego czasu zwarcia:',

  // Stany komórek bez liczby — zawsze słowo, nigdy puste pole.
  brakWBiegu: 'brak w wyniku biegu',
  brakZapasu: 'brak',
  brakOceny: 'brak oceny',
  nieDotyczy: 'nie dotyczy',
  kreska: '—',

  // Akcje wiersza.
  parametryAparatu: 'Parametry aparatu',
  szczegolyPokaz: 'Szczegóły obliczeń',
  szczegolyUkryj: 'Ukryj szczegóły obliczeń',

  // Szczegóły obliczeń: dane wejściowe → wzory → podstawienia → wyniki pośrednie → wynik końcowy.
  krokDane: 'Dane wejściowe',
  krokWzory: 'Wzory',
  krokPodstawienia: 'Podstawienia',
  krokPosrednie: 'Wyniki pośrednie',
  krokWynik: 'Wynik końcowy',
  aparat: 'Aparat',
  zrodloModel: 'aparat z modelu (katalog pola)',
  zrodloKonfiguracja: 'aparat z konfiguracji stacji',
  punktZabudowy: 'Punkt zabudowy',
  tbNiePodano: 'nie podano',
  zrodloCzasu: 'Czas wyłączenia',
  zapasDefinicja: 'Zapas',
  podstawa: 'podstawa',
  podstawy: 'Podstawy znamion',
  // Wzory wyprowadzenia (LaTeX z backendu; tu tylko nazwy).
  wzorIp: 'Prąd udarowy',
  wzorIth: 'Prąd zastępczy cieplny',
  wzorIb: 'Prąd wyłączeniowy',
  wzorLimitu: 'Dopuszczalny prąd cieplny',
  // Wartości pośrednie.
  tkBiegu: 'czas, dla którego bieg policzył',
  pochodzenieKatalog: 'karta katalogowa',
  pochodzeniePropozycja: 'propozycja obliczenia',
  pochodzenieProjektant: 'nadana przez projektanta',
  pochodzenieBrak: 'brak danej',
  etykietaRobocza: 'wartość robocza',

  // Uczciwe stany zerowe — każdy nazywa BRAK PODSTAWY, nie werdykt negatywny.
  brakBiegu:
    'Brak zapisanego biegu zwarciowego — prądów pól nie ma skąd wziąć, więc nie ma czego porównać ze znamionami aparatów.',
  punktPozaStacja:
    'Wybrany punkt zwarcia nie leży w żadnej stacji z modelu — aparatury pola nie ma do czego przypisać.',
  brakAparatury:
    'Stacja tego punktu nie ma ani jednego pola z aparatem z katalogu w modelu ani zapisu w konfiguracji — wytrzymałości nie da się sprawdzić.',
  brakAparaturyAkcja: 'Otwórz konfigurację stacji',
  brakPrzypadku: 'Bez aktywnego przypadku obliczeniowego nie ma z czego wczytać pól stacji.',
  blad: 'Nie udało się sprawdzić wytrzymałości aparatury.',
  bladUwaga: 'Ocenę wystawia obliczenie wytrzymałości — bez jego odpowiedzi nie ma podstawy do oceny.',
} as const;

/** Symbole wielkości jako wzory (MathRenderer), nie tekst ASCII. */
export const LATEX = {
  ip_latex: 'i_p',
  ith_latex: 'I_{th}',
  ib_latex: 'I_b',
  ik_latex: "I_k''",
  un_latex: 'U_n',
  idc_latex: 'i_{DC}(t_b)',
  tb_latex: 't_b',
  tzab_latex: 't_{\\mathrm{zab}}',
  twyl_latex: 't_{\\text{wył}}',
  tk_latex: 'T_k',
  kappa_latex: '\\kappa',
  m_latex: 'm',
  n_latex: 'n',
  tkBiegu_latex: 'T_{k,\\mathrm{bieg}}',
  ithDop_latex: 'I_{th,\\mathrm{dop}}',
} as const;
