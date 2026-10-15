/** Teksty PL kreatora „Aparat nN" (add_nn_switch_device). Język inżynierski. */

export const APARAT_NN_STRINGS = {
  eyebrow: 'nN STUDIO · APARAT W TORZE',
  tytul: 'Nowy aparat nN',
  cel: 'Wstaw aparat (wyłącznik/rozłącznik albo bezpiecznik) w torze między dwiema ISTNIEJĄCYMI '
    + 'szynami nN — po co: zabezpiecza/rozłącza odcinek toru; z czego: typ aparatu z katalogu nN '
    + '(APARAT_NN); co daje: punkt zabezpieczenia, dla którego dobiera się nastawy w zakładce '
    + 'ZABEZPIECZENIA i ocenia SWZ w zakładce SWZ.',
  odznaka: 'Nowy aparat',

  rodzajTytul: 'Rodzaj aparatu',
  rodzajPomoc: 'Łącznik (impedancja pomijalna) albo bezpiecznik — wkładka z katalogu niesie prąd i napięcie znamionowe.',
  rodzajSwitch: 'Wyłącznik / rozłącznik',
  rodzajFuse: 'Bezpiecznik',

  torTytul: 'Tor',
  szynaOd: 'Szyna od',
  szynaDo: 'Szyna do',
  szynaDoPlaceholder: '— wybierz szynę docelową —',
  szynaDoPomoc: 'Istniejąca szyna o tym samym napięciu nN — operacja łączy dwie szyny, nowej nie tworzy.',
  brakSzynDo: 'Brak innej szyny nN w modelu do wskazania jako koniec toru. Dodaj najpierw odcinek nN '
    + 'albo rozdzielnicę nN, żeby powstała druga szyna.',

  typTytul: 'Typ aparatu',
  typ: 'Typ z katalogu',
  typPlaceholder: '— wybierz aparat z katalogu (APARAT_NN) —',
  typBlad: 'Nie udało się pobrać katalogu aparatów nN.',
  nazwa: 'Nazwa aparatu',
  nazwaPlaceholder: 'np. Wyłącznik odpływu nr 1',

  paramSekcjaNormowa: 'Parametry z katalogu',
  paramIn: 'Prąd znamionowy In',
  paramUn: 'Napięcie znamionowe Un',
  paramZdolnoscWylaczania: 'Zdolność wyłączania',

  kontrolaTytul: 'Kontrola aparatu',
  wierszOd: 'Szyna od',
  wierszDo: 'Szyna do',
  wierszTyp: 'Typ aparatu',

  downstreamTytul: 'Co dalej',
  downstreamOpis: 'Aparat wchodzi do modelu jako element toru nN. Nastawy dobierzesz w zakładce '
    + 'ZABEZPIECZENIA (capability-driven z katalogu); SWZ obwodu ocenisz w zakładce SWZ.',

  zapisz: 'Zapisz aparat',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy — zapis aparatu unieważnia jego wyniki.',
  brakSzynyDoWalid: 'Wybierz szynę docelową — aparat łączy dwie istniejące szyny nN.',
  brakTypuWalid: 'Wybierz typ aparatu z katalogu nN — prąd znamionowy i zdolność wyłączania wchodzą do oceny zabezpieczeń.',
  brakRodzajuWalid: 'Wybierz rodzaj aparatu — od niego zależy model łącznika albo wkładki w torze.',
  konfliktNapiec: 'Szyny mają różne napięcia znamionowe — aparat nN łączy szyny tego samego napięcia.',
  konfliktRodzaju: 'Rodzaj aparatu różni się od rodzaju wybranej pozycji katalogowej — wybierz zgodny.',
  brakStartuTytul: 'Brak punktu startowego',
  brakStartuOpis: 'Wskaż szynę nN (w drzewie nN STUDIO albo na schemacie), od której ma zaczynać się tor aparatu.',
  bladDodania: 'Nie udało się dodać aparatu nN.',
} as const;
