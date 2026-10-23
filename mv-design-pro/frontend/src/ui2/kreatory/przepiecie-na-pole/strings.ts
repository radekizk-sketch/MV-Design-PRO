/** Teksty PL kreatora „Przepięcie elementu na pole stacji" (przepnij_element_na_pole). */

export const PRZEPIECIE_NA_POLE_STRINGS = {
  eyebrow: 'MODEL SIECI · ZASADA TORU POLA',
  tytul: 'Przepięcie elementu na pole stacji',
  cel:
    'Przyłącz element do zacisku pola, które mu służy — aparat pola wejdzie w tor prądowy '
    + 'elementu. Otwarcie pola odłączy wtedy element, a zabezpieczenie i przekładnik pola '
    + 'zobaczą jego prąd.',
  odznaka: 'Szyna główna → zacisk pola',

  elementTytul: 'Element na szynie głównej stacji',
  element: 'Element do przepięcia',
  stacja: 'Stacja',
  szyna: 'Szyna, na której element leży dziś',
  brakElementuTytul: 'Brak wskazanego elementu',
  brakElementuOpis:
    'Otwórz ten kreator z pozycji kontroli modelu „element z pominięciem pola" albo zaznacz '
    + 'na schemacie odcinek lub transformator stacji.',
  nieznany: 'Element spoza modelu',

  poleTytul: 'Pole docelowe',
  pole: 'Pole docelowe',
  poleAuto: 'Pole wskazane przez kontrolę modelu (wolne pole właściwej roli)',
  polePomoc:
    'Połówka odcinka od strony zasilania przechodzi przez pole liniowe wejściowe, dalsza — przez '
    + 'pole liniowe wyjściowe albo odgałęźne, transformator — przez pole transformatorowe. Rolę i zajętość '
    + 'pola sprawdza model; niewłaściwe pole kończy się nazwaną odmową bez zmiany modelu.',

  kontrolaTytul: 'Kontrola przepięcia',
  wierszElement: 'Element',
  wierszPole: 'Pole',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Model zmienia punkt przyłączenia elementu na zacisk pola. Wyniki rozpływu i zwarć wymagają '
    + 'ponownego przeliczenia; zabezpieczenie pola zaczyna mierzyć prąd elementu.',

  zapisz: 'Przepnij na pole',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed przepięciem elementu.',
  walidacjaStopka: 'Wskaż element, który leży na szynie głównej stacji.',
  bladDodania: 'Nie udało się przepiąć elementu na pole.',

  teoriaTytul: 'Teoria: aparat pola w torze prądowym',
  teoriaOpis:
    'Rozdzielnica stacji składa się z pól. Szyna zbiorcza niesie wyłącznie aparaty pól i '
    + 'sprzęgła, a kabel, linia i transformator są przyłączone do zacisku pola za jego aparatem. '
    + 'Tylko wtedy prąd elementu płynie przez wyłącznik i przekładnik pola, otwarcie pola '
    + 'odłącza element (punkt normalnie otwarty pierścienia to otwarte pole liniowe wyjściowe), '
    + 'a aparat pola dobiera się do prądu, który przez niego płynie.',
  teoriaWymog:
    'Element przyłączony do szyny obok pola zostawia aparat pola martwym elektrycznie — '
    + 'zabezpieczenie nie widzi prądu elementu, a otwarcie pola niczego nie odłącza.',
  teoriaPodstawa:
    'Podstawa: budowa rozdzielnic SN (PN-EN 62271-200), kontrakt operacji stacji — łącznik od '
    + 'strony zasilania i od strony odbioru.',
} as const;
