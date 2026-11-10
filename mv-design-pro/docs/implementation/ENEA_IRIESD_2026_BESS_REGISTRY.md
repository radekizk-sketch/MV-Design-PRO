# P0/P1 źródła ENEA — uwagi wdrożeniowe (2026-11-10)

Źródło IRiESD: https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd
Oficjalna informacja dotycząca Karty 45/2026 z 22.09.2026: https://www.m.operator.enea.pl/en/node/2248
Oficjalny komunikat zmiany terminów wybranych punktów CSiRE z 20.10.2026: https://www.operator.enea.pl/o-spolce/teczka-prasowa/komunikaty/komunikat-enea-operator-sp-z-oo-dotyczacy-instrukcji-ruchu-i-119
Tekst ujednolicony dostępny w serwisie ENEA: https://www.operator.enea.pl/media/4612/teczka-prasowa/5iriesdtj-od-19102026zmpkt2i3ka45pdf.pdf

## Granice ważności

Karta aktualizacji 45/2026 według komunikatu z 22.09 dotyczy przede wszystkim sprzedaży rezerwowej i relacji GUD/GUD-k, NIE jest normatywną podstawą do zmiany nastaw EAZ, UVRT/HVRT czy charakterystyk Q(U). Zgodnie z komunikatem z 20.10 pkt 3 karty 45/2026 i wskazane punkty kart 27/2023, 33/2024, 38/2024, 42/2025 mają **odroczone obowiązywanie zależne od uruchomienia działań CSiRE, najpóźniej do 19.04.2028**. Nigdy nie przypisuj bezwarunkowego effective date dla tych punktów, nie myl z datą obowiązywania całej karty.

Fragment IRiESD v2.3 I.5.2-4 dotyczy:
- Rejestr MEE: magazyny o łącznej mocy zainstalowanej większej niż 50 kW i nie większej niż 10 MW;
- termin wpisu po stronie ENEA: 14 dni wg zdarzenia wskazanego w pkt I.5.3;
- obowiązek zawiadomienia w ciągu 7 dni od oddania do eksploatacji dla magazynu włączonego w jednostkę wytwórczą lub instalację odbiorcy końcowego (I.5.4).
- Odrębne dokumenty dla instalacji magazynowej oraz indywidualne warunki przyłączenia. Magazyn samodzielny nie jest automatycznie objęty NC RfG tylko z powodu funkcji dwukierunkowego przekształtnika.

DANE INŻYNIERSKIE: \`Generator.p_mw\` to moc czynna modelowa NIE równoważna \`łącznej mocy zainstalowanej magazynu\`. Nie wolno obliczać progu rejestrowego z \`p_mw\` bez osobno potwierdzonego źródła. Nie utożsamiaj 7-dniowego obowiązku właściciela i 14-dniowej czynności operatora. Zakres powyżej 10 MW wymaga osobnej procedury rejestrowej/koncesyjnej, nie oznacza braku obowiązków. Implementacyjny punkt dostępu: \`POST /api/bess/enea/ocena-rejestru\`, który analizuje jawne dane i nie potwierdza formalnego wpisu.

Karta 45/2026 to uzupełnienie warstwy źródeł, nie nadpisanie parametrów technicznych. \`operatorzy/enea.yaml\` pozostaje NIEUSTALONE dla indywidualnych nastaw, dopóki nie istnieją sprawdzone klauzule i warunki projektu.
