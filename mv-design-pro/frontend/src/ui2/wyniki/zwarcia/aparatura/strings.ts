/**
 * Teksty PL ogniwa „wynik zwarciowy → weryfikacja aparatury" (karta KD-4).
 * Język inżynierski; werdykt zawsze cytowany z backendu (nie układany tutaj).
 */

export const APARATURA_STRINGS = {
  tytul: 'Wytrzymałość aparatury w punkcie zwarcia',
  cel: 'Porównaj prądy z tego biegu (ip → I_dyn, Ith → I_th) ze znamionami aparatów pól tej stacji.',
  akcja: 'Sprawdź aparaturę w punkcie zwarcia',
  akcjaPonow: 'Sprawdź ponownie',
  pracuje: 'Sprawdzanie wytrzymałości…',
  norma: 'IEC 60909 · werdykt z backendu',

  wejsciaEyebrow: 'DANE WEJŚCIOWE',
  wejscieIp: 'Prąd udarowy ip (kryterium I_dyn)',
  wejscieIth: 'Prąd cieplny zastępczy Ith (kryterium I_th)',
  wejscieStacja: 'Stacja punktu zwarcia',
  wejsciePola: 'Pola z aparaturą do sprawdzenia',
  zrodloPradow: 'z wyniku tego biegu',
  zrodloAparatu: 'z modelu i konfiguracji stacji',
  // Źródło aparatu per wiersz — inżynier musi wiedzieć, CO ocenia (KD-6).
  zrodloModel: 'aparat z modelu (katalog pola)',
  zrodloKonfiguracja: 'aparat z konfiguracji stacji',

  // Uczciwe stany zerowe — każdy nazywa BRAK PODSTAWY, nie werdykt negatywny.
  brakPradow:
    'Ten wynik nie niesie prądu udarowego albo cieplnego dla wybranego punktu — nie ma czego porównać ze znamionami aparatów.',
  punktPozaStacja:
    'Wybrany punkt zwarcia nie leży w żadnej stacji z modelu — aparatury pola nie ma do czego przypisać.',
  brakAparatury:
    'Stacja tego punktu nie ma ani jednego pola z aparatem z katalogu w modelu ani zapisu w konfiguracji — wytrzymałości nie da się sprawdzić.',
  brakAparaturyAkcja: 'Otwórz konfigurację stacji',
  brakPrzypadku: 'Bez aktywnego przypadku obliczeniowego nie ma z czego wczytać pól stacji.',
  blad: 'Nie udało się sprawdzić wytrzymałości aparatury.',
  bladUwaga: 'Werdykt pochodzi z backendu — bez odpowiedzi nie ma podstawy do oceny.',
  // Rozbicie czasu wyłączenia (KD-6 poz. 3) — WHITE BOX: suma i oba człony.
  czasSuma: 'Czas wyłączenia t_wył',
  czasCzlonNastawczy: 'Człon nastawczy zabezpieczenia',
  czasWlasny: 'Czas własny aparatu',
  czasZrodlo: 'Źródło czasu',
  czasZNastaw: 'z nastaw zabezpieczeń pola',
  czasZKonfiguracji: 'z konfiguracji stacji',
  czasNieustalony: 'nieustalone',
  czasZalozenie: 'Założenie:',

  kreska: '—',
  jednKA: 'kA',
  jednS: 's',
} as const;
