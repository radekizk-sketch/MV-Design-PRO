/** Teksty PL kreatora „Wyłącznik różnicowoprądowy nN" (add_nn_rcd). Język inżynierski. */

export const RCD_NN_STRINGS = {
  eyebrow: 'nN STUDIO · OCHRONA PRZECIWPORAŻENIOWA',
  tytul: 'Nowy wyłącznik różnicowoprądowy nN',
  cel: 'Wstaw wyłącznik różnicowoprądowy (RCD) w tor zasilania instalacji odbioru nN — po co: w '
    + 'układzie TT ochronę przez samoczynne wyłączenie zasilania realizuje RCD (IEC 60364-4-41 '
    + '§411.5); z czego: typ RCD z katalogu (APARAT_NN_RCD — prąd różnicowy znamionowy I_Δn, '
    + 'rodzaj prądu różnicowego, czasy wyłączenia); co daje: ocena SWZ układu TT liczy prąd '
    + 'doziemny przez uziomy R_A i R_B, porównuje go z I_Δn, a czas wyłączenia t_a z tabelą '
    + 'czasów — bez RCD analiza odmawia kodem nn.brak_rcd.',
  odznaka: 'Nowy RCD',

  odbiorTytul: 'Chroniona instalacja',
  odbior: 'Odbiór nN',
  odbiorPlaceholder: '— wybierz odbiór nN —',
  odbiorPomoc: 'Wyłącznik powstaje jako aparat w torze: między dotychczasową szyną odbioru a nowymi '
    + 'zaciskami instalacji, na które operacja przenosi odbiór.',
  odbiorMaRcd: (nazwa: string): string => `ma już wyłącznik różnicowoprądowy: ${nazwa}`,
  odbiorMaRcdInfo: (nazwa: string): string => `Tor tego odbioru ma już wyłącznik różnicowoprądowy `
    + `„${nazwa}". Zapis wstawi kolejny aparat przed zaciskami instalacji — ocena SWZ układu TT `
    + 'czyta wyłącznik najbliższy punktowi obwodu.',
  szynaOdbioru: 'Szyna odbioru',
  brakOdbiorowTytul: 'Brak odbiorów nN w modelu',
  brakOdbiorowOpis: 'Model nie ma żadnego odbioru przyłączonego do szyny nN, więc nie ma instalacji, '
    + 'którą wyłącznik różnicowoprądowy mógłby chronić. Dodaj najpierw odbiór nN (kreator „Odbiór '
    + 'nN" w stronie nN stacji).',

  typTytul: 'Typ wyłącznika różnicowoprądowego',
  typ: 'Typ z katalogu',
  typPlaceholder: '— wybierz wyłącznik różnicowoprądowy z katalogu (APARAT_NN_RCD) —',
  typBlad: 'Nie udało się pobrać katalogu wyłączników różnicowoprądowych nN.',
  typPusty: 'Katalog wyłączników różnicowoprądowych nN nie zwrócił żadnej pozycji — bez typu z '
    + 'katalogu zapis jest niemożliwy (brama katalogowa operacji).',
  typSelektywny: 'S',
  nazwa: 'Nazwa wyłącznika',
  nazwaPlaceholder: 'np. RCD instalacji budynku A',

  paramSekcja: 'Parametry z katalogu (odczyt rekordu, bez przeliczeń)',
  paramIdn: 'Prąd różnicowy znamionowy I_Δn',
  paramRodzaj: 'Rodzaj prądu różnicowego',
  paramSelektywny: 'Selektywny (typ S)',
  paramTak: 'tak',
  paramNie: 'nie',
  paramTa1: 'Czas wyłączenia t_a przy I_Δn',
  paramTa2: 'Czas wyłączenia t_a przy 2·I_Δn',
  paramTa5: 'Czas wyłączenia t_a przy 5·I_Δn',
  paramTnz: 'Minimalny czas niezadziałania',
  paramIn: 'Prąd znamionowy In',
  paramUn: 'Napięcie znamionowe Un',
  paramZrodlo: 'Podstawa danych',

  kontrolaTytul: 'Kontrola wyłącznika',
  wierszOdbior: 'Odbiór nN',
  wierszTyp: 'Typ RCD',
  doWyboru: 'Do wyboru',

  downstreamTytul: 'Co dalej',
  downstreamOpis: 'Wyłącznik wchodzi do modelu jako aparat toru nN z wiązaniem katalogowym. '
    + 'Ocenę ochrony przeciwporażeniowej obwodu w układzie TT (prąd doziemny, napięcie dotykowe, '
    + 'czas wyłączenia) zobaczysz w zakładce SWZ po uzupełnieniu rezystancji uziomu instalacji R_A '
    + 'odbioru i uziomu R_B punktu neutralnego transformatora.',

  zapisz: 'Zapisz wyłącznik',
  anuluj: 'Anuluj',
  walidacjaStopka: 'Uzupełnij wymagane pola przed zapisem.',
  brakZakresu: 'Brak aktywnego przypadku obliczeniowego.',
  bladDodania: 'Nie udało się dodać wyłącznika różnicowoprądowego nN.',
} as const;
