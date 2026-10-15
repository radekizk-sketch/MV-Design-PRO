/** Teksty PL kreatora „Domknięcie pierścienia SN + NOP" (G-RING). Język inżynierski. */

export const PIERSCIEN_STRINGS = {
  eyebrow: 'MODEL SIECI · PIERŚCIEŃ SN',
  cel:
    'Domknij pierścień SN odcinkiem między dwoma zaciskami i wskaż punkt normalnie '
    + 'otwarty (NOP). Pierścień daje rezerwowanie zasilania; NOP przywraca pracę '
    + 'radialną — rozpływ mocy honoruje otwarty łącznik (brak gałęzi galwanicznej).',
  odznaka: 'Nowy pierścień SN',

  krokDomkniecie: 'Domknięcie pierścienia',
  krokNop: 'Punkt normalnie otwarty',

  zaciskiTytul: 'Łączone zaciski',
  zaciskA: 'Zacisk A',
  zaciskB: 'Zacisk B',

  typKatalog: 'Typ odcinka pierścienia',
  typKatalogPlaceholder: '— wybierz kabel lub linię SN —',
  typBlad: 'Nie udało się pobrać katalogu odcinków SN.',
  typPomoc: 'Odcinek wnosi impedancję R/X i obciążalność — parametry z katalogu.',
  rodzaj: 'Rodzaj odcinka',
  rodzajOpcje: [
    { id: 'KABEL', etykieta: 'Kabel SN' },
    { id: 'LINIA', etykieta: 'Linia napowietrzna SN' },
  ],
  dlugosc: 'Długość odcinka',
  dlugoscPomoc: 'Długość odcinka domykającego pętlę [m] — wpływa na impedancję pierścienia.',
  ekranUziemienie: 'Uziemienie ekranu kabla',
  ekranUziemieniePomoc:
    'Sposób uziemienia ekranu — katalogowe R0/X0 dotyczą układu odniesienia typu kabla.',

  nopTytul: 'Punkt normalnie otwarty (NOP)',
  nopPomoc: 'Łącznik otwarty w stanie normalnym — sieć pracuje promieniowo, pierścień jest rezerwą.',
  nopPlaceholder: '— wybierz łącznik NOP —',
  nopBrakKandydatow: 'Brak kandydatów NOP na domkniętym pierścieniu.',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy uwzględni topologię pierścienia i stan NOP (otwarty = praca '
    + 'radialna); analiza pierścieni i pewność zasilania korzystają z domknięcia.',

  kontrolaTytul: 'Kontrola pierścienia',
  wierszZaciski: 'Zaciski',
  wierszTyp: 'Odcinek',
  wierszDlugosc: 'Długość',
  wierszNop: 'NOP',

  brakZaciskowTytul: 'Brak wskazanych zacisków',
  brakZaciskowOpis:
    'Zaznacz na schemacie dwa zaciski SN do połączenia w pierścień, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  domknij: 'Domknij pierścień',
  zapiszNop: 'Zapisz punkt NOP',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy — domknięcie pierścienia unieważnia jego wyniki.',
  bladZapisu: 'Nie udało się zapisać pierścienia.',
  zaciskiDoWskazania: 'Do wskazania na schemacie',
  pierscienDomkniety: 'Pierścień domknięty — wskaż teraz punkt normalnie otwarty.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: pierścień SN i punkt normalnie otwarty (NOP)',
  teoriaOpis:
    'Sieć pierścieniowa łączy dwa ciągi zasilania, dając dwustronne zasilanie i rezerwę — awaria '
    + 'jednego odcinka nie pozbawia odbiorów napięcia po przełączeniu. W normalnej pracy pierścień '
    + 'pozostaje jednak rozcięty w jednym miejscu — punkcie normalnie otwartym (NOP) — więc sieć '
    + 'pracuje promieniowo (prostszy rozpływ, selektywna ochrona, brak prądów wyrównawczych). '
    + 'Położenie NOP decyduje o podziale obciążeń między ciągi i o profilu napięć; przy awarii NOP '
    + 'przenosi się, przywracając zasilanie. Rozpływ mocy honoruje otwarty NOP (brak przepływu tą gałęzią).',
  teoriaWymog:
    'NOP dobiera się tak, by w pracy normalnej i po przełączeniach awaryjnych żaden odcinek nie był '
    + 'przeciążony ani nie spadł poniżej dopuszczalnego napięcia; koordynacja zabezpieczeń zależy od pracy promieniowej.',
  teoriaPodstawa: 'Podstawa: IRiESD (praca i rezerwowanie sieci SN), dobra praktyka projektowa OSD.',
} as const;
