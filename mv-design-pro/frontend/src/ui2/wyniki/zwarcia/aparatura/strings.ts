/**
 * Teksty PL ogniwa „wynik zwarciowy → wytrzymałość aparatury pól" (karty KD-4, KD-6,
 * APARATURA-TABELA). Język inżynierski; werdykt, założenia i wyjaśnienia zawsze cytowane
 * z backendu (nie układane tutaj).
 */

export const APARATURA_STRINGS = {
  // Nagłówek: ocenia się aparaturę PÓL STACJI w ich punktach zabudowy — wybrany punkt zwarcia
  // (np. szyna nN stacji) wskazuje tylko stację (karta WYTRZYMALOSC-PRAD-POLA).
  tytul: 'Wytrzymałość aparatury pól stacji',
  punktWskazuje: 'Wybrany punkt zwarcia',
  punktWskazujeOpis:
    'wskazuje stację; prądy każdego pola pochodzą z wiersza biegu dla jego punktu zabudowy.',
  akcja: 'Sprawdź aparaturę pól stacji',
  akcjaPonow: 'Sprawdź ponownie',
  pracuje: 'Sprawdzanie wytrzymałości…',
  norma: 'IEC 60909 · ocena z obliczenia wytrzymałości',

  wejscieStacja: 'Stacja',
  wejsciePola: 'Pola z aparaturą',

  // Prądy wspólne nad tabelą — tylko gdy backend podał dla wszystkich pól te same wartości.
  pradyWspolne: 'Prądy zwarciowe — jednakowe dla wszystkich pól',

  // Kolumny tabeli; jednostka w nagłówku, nie w komórce (wymaganie 9).
  kolPole: 'Pole',
  kolAparat: 'Aparat',
  kolIp: 'ip [kA]',
  kolIth: 'Ith [kA]',
  kolIb: 'Ib [kA]',
  kolTk: 'Tk [s]',
  kolZapasSzczytowy: 'Zapas szczytowy [kA]',
  kolZapasCieplny: 'Zapas cieplny [kA]',
  kolZapasWylaczalny: 'Zapas wyłączalny [kA]',

  // Porównanie w rozwinięciu wiersza.
  porownanieParametr: 'Parametr',
  porownanieObliczony: 'Obliczony [kA]',
  porownanieAparat: 'Aparat [kA]',
  porownanieZapas: 'Zapas [kA]',
  kryteriumSzczytowy: 'Szczytowy',
  kryteriumCieplny: 'Cieplny',
  kryteriumWylaczalny: 'Wyłączalny',
  czasTk: 'Tk',
  czasTkr: 'Tkr',
  jednS: 's',

  // Stany komórek bez liczby — zawsze słowo, nigdy puste pole.
  nieustalony: 'nieustalony',
  brakZapasu: 'brak',
  brakOceny: 'brak oceny',
  nieDotyczy: 'nie dotyczy',
  kreska: '—',

  // Akcje wiersza.
  parametryAparatu: 'Parametry aparatu',
  szczegolyPokaz: 'Szczegóły obliczeń',
  szczegolyUkryj: 'Ukryj szczegóły obliczeń',

  // Szczegóły obliczeń (wszystko, co nie jest liczbą porównania).
  szczegolyOcena: 'Ocena obliczenia wytrzymałości',
  szczegolyAparat: 'Aparat',
  zrodloModel: 'aparat z modelu (katalog pola)',
  zrodloKonfiguracja: 'aparat z konfiguracji stacji',
  pradyPola: 'Prądy w punkcie zabudowy pola',
  pradyPunkt: 'Punkt zabudowy',
  pradyUn: 'Un [kV]',
  pradyIk: 'Ik″ [kA]',
  pradyIdc: 'iDC(tb) [kA]',
  pradyTb: 'tb [s] — chwila prądu wyłączeniowego Ib',
  pradyTbBrak: 'nie podano',
  czasTytul: 'Czas wyłączenia pola Tk',
  czasSuma: 'Czas wyłączenia $T_{k}$ [s]',
  czasCzlonNastawczy: 'Człon nastawczy zabezpieczenia [s]',
  czasWlasny: 'Czas własny wyłącznika [s]',
  czasZrodlo: 'Źródło czasu',
  czasZNastaw: 'z nastaw zabezpieczeń pola',
  czasZKonfiguracji: 'z konfiguracji stacji',
  czasZalozenie: 'Założenie:',
  parametryTytul: 'Parametry aparatu użyte w ocenie',
  pochodzenieKatalog: 'karta katalogowa',
  pochodzeniePropozycja: 'propozycja obliczenia',
  pochodzenieProjektant: 'nadana przez projektanta',
  pochodzenieBrak: 'brak danej',
  etykietaRobocza: 'wartość robocza',
  kryteriaTytul: 'Wyjaśnienie kryteriów',

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
