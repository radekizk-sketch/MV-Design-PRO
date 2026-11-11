/** Teksty PL sekcji „Zabezpieczenia w tym przypadku" karty przypadku i znaczników karty pola. */

export const ZABEZPIECZENIA_PRZYPADKU_STRINGS = {
  tytul: 'Zabezpieczenia w tym przypadku',
  opis:
    'Nastawy bazowe są danymi modelu sieci. Przypadek wybiera grupę nastaw sterownika albo nadpisuje ' +
    'pojedyncze nastawy — zmiana dotyczy wyłącznie tego przypadku i unieważnia tylko jego wyniki.',
  brakSterownikow: 'Model sieci nie ma sterowników zabezpieczeń — w przypadku nie ma czego wybrać ani nadpisać.',
  ladowanie: 'Wczytywanie wyboru zabezpieczeń przypadku…',
  bladOdczytu: 'Nie udało się wczytać wyboru zabezpieczeń przypadku.',
  grupaEtykieta: 'Grupa nastaw w przypadku',
  grupaZModelu: (n: number) => `Z modelu (grupa ${n})`,
  grupa: (n: number) => `Grupa ${n}`,
  stanSterownika: (grupa: number, wybrana: boolean, nadpisan: number) =>
    `${wybrana ? `grupa ${grupa} w przypadku` : `grupa ${grupa} z modelu`}${nadpisan > 0 ? ` · nadpisań: ${nadpisan}` : ''}`,
  kolFunkcja: 'Funkcja',
  kolNastawa: 'Nastawa',
  kolBazowa: 'W modelu',
  kolPrzypadek: 'W przypadku',
  brakBazowej: 'brak w modelu',
  // Nastawa i funkcja bez wpisu w schemacie rejestru albo w sterowniku — nazwane wprost, nigdy
  // kluczem nastawy ani identyfikatorem funkcji (strażnik `kodyZamiastOpisow`).
  nastawaSpozaSchematu: 'nastawa spoza schematu funkcji',
  funkcjaSpozaSterownika: 'funkcja spoza sterownika',
  bezNadpisan: 'Bez nadpisań — przypadek czyta nastawy grupy z modelu.',
  usun: 'Usuń nadpisanie',
  dodajFunkcja: 'Funkcja do nadpisania',
  dodajNastawa: 'Nastawa do nadpisania',
  dodaj: 'Nadpisz',
  wybierz: '—',
  zapisz: 'Zapisz w przypadku',
  zapisywanie: 'Zapisywanie…',
  przywroc: 'Przywróć zapisane',
  zapisano: 'Zapisano — wyniki tego przypadku wymagają ponownego obliczenia.',
  nieczytelne: (funkcja: string, nastawa: string) => `Wpisz wartość nastawy „${nastawa}" funkcji ${funkcja}.`,
  bladZapisu: 'Nie udało się zapisać wyboru zabezpieczeń przypadku.',
  // Znaczniki w karcie pola
  znacznikiTytul: 'Inne nastawy w przypadkach obliczeniowych',
  znacznikPrzypadku: (nazwa: string) => `W przypadku „${nazwa}"`,
  znacznikGrupa: (n: number) => `grupa ${n}`,
  znacznikNadpisane: 'nadpisane:',
  nadpisaneW: (nazwy: readonly string[]) => `nadpisane w: ${nazwy.map((n) => `„${n}"`).join(', ')}`,
} as const;
