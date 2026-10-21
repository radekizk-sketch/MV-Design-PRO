/**
 * Teksty PL ogniwa „wynik zwarciowy → weryfikacja aparatury" (karta KD-4).
 * Język inżynierski; werdykt zawsze cytowany z backendu (nie układany tutaj).
 */

export const APARATURA_STRINGS = {
  tytul: 'Wytrzymałość aparatury w punkcie zwarcia',
  cel: 'Porównaj prądy zwarcia w punkcie zabudowy każdego pola tej stacji (ip → I_dyn, Ith → I_th, Ib albo I″k → zdolność wyłączania I_cu) ze znamionami jego aparatów.',
  akcja: 'Sprawdź aparaturę w punkcie zwarcia',
  akcjaPonow: 'Sprawdź ponownie',
  pracuje: 'Sprawdzanie wytrzymałości…',
  norma: 'IEC 60909 · ocena z obliczenia wytrzymałości',

  wejsciaEyebrow: 'DANE WEJŚCIOWE',
  wejsciePrady: 'Prądy zwarciowe pól',
  wejsciePradyOpis: 'ip i Ith w punkcie zabudowy każdego pola',
  wejscieStacja: 'Stacja punktu zwarcia',
  wejsciePola: 'Pola z aparaturą do sprawdzenia',
  zrodloPradow: 'z wyniku tego biegu',
  // Prądy jednego pola (wiersz biegu dla punktu zabudowy pola).
  pradyPola: 'Prądy w punkcie zabudowy pola',
  pradyPunkt: 'punkt',
  pradyIp: 'ip',
  pradyIth: 'Ith',
  // Wielkości kryterium wyłączania (karta SC-IB-ITH-ZRODLA) — wartości z wiersza biegu.
  pradyIb: 'Ib',
  pradyIdc: 'iDC(tb)',
  pradyTb: 'tb',
  pradyTbBrak: 'nie podano',
  zrodloAparatu: 'z modelu i konfiguracji stacji',
  // Źródło aparatu per wiersz — inżynier musi wiedzieć, CO ocenia (KD-6).
  zrodloModel: 'aparat z modelu (katalog pola)',
  zrodloKonfiguracja: 'aparat z konfiguracji stacji',

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
  // Rozbicie czasu wyłączenia (KD-6 poz. 3) — WHITE BOX: suma i oba człony.
  czasSuma: 'Czas wyłączenia t_wył',
  czasCzlonNastawczy: 'Człon nastawczy zabezpieczenia',
  czasWlasny: 'Czas własny wyłącznika',
  czasZrodlo: 'Źródło czasu',
  czasZNastaw: 'z nastaw zabezpieczeń pola',
  czasZKonfiguracji: 'z konfiguracji stacji',
  czasNieustalony: 'nieustalone',
  czasZalozenie: 'Założenie:',

  kreska: '—',
  jednKA: 'kA',
  jednS: 's',
} as const;
