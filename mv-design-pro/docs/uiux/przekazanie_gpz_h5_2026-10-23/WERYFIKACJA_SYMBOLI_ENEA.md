# Weryfikacja symboli ENEA (dostęp 2026-10-22) - WYNIK NIEPEŁNY

## Ograniczenie
library.iec.ch (baza IEC 60617) i library.e.abb.com zwracają HTTP 403 (WebFetch i curl przez proxy). Treści rekordów NIE odczytano. Wszystko poniżej o numerach symboli pochodzi ze snippetów wyszukiwarki = pewność NISKA, bez potwierdzenia w rekordzie.

## 1. Łącznik trójpołożeniowy
- (a) Snippet: wniosek zmiany IEC C00143 (https://library.iec.ch/grasymb/grasymb.nsf/(SysCR)/C00143) dotyczy NOWEGO symbolu odłącznika z uziemnikiem (3 położenia: uziemiony / zero / zamknięty); wymieniony S01848. Nie potwierdzono treści ani czy wniosek został przyjęty. Numeru S01848 nie uznaję za potwierdzony.
  Odłącznik S00287 / łącznik-rozłącznik S00288 - tylko z listy trzeciej strony (Scribd, nieoficjalnej), niepotwierdzone.
  Norma (wiedza ogólna, NIE ze źródła): zestaw symboli pozwala złożyć odłącznik + uziemnik; brak potwierdzenia, że istnieje osobny symbol 3-poł. w wydaniu obowiązującym.
- (b) Karty producentów (ABB UniGear ZS1 Rev F 2013, UniSec, Siemens 8DJH, Schneider SM6/RM6): nie otwarto (403/brak dostępu). Wyszukiwanie wskazało tylko, że ABB UniSec/LeanGear mają "three position switch disconnector". Sposób rysowania przez producentów: NIE ustalono.
- (c) Zgodność rysunku ENEA: nie da się potwierdzić. Opis odczytu (ODCZYT_ENEA_H5_SPECYFIKACJA.md §15): tor z poprzeczką (styk), osobny trzpień z ziemią obok, przerwa, sprzężenie kreskowe do kwadratu. To NIE jest jeden styk ruchomy o trzech położeniach, tylko odłącznik w położeniu otwartym + uziemnik obok; nazwa "3-poł." pozostaje INTERPRETACJĄ. Pewność: niska.
  Obserwacja własna (wycinek z7_sep.png): dolny wyłącznik ma napęd: kwadrat z krzyżem (okno) + M w kółku + strzałki O,O,Z; kreskowy kwadrat z ⊥ u góry przy uziemniku. Strzałki O/O/Z sugerują 3 stany (otwórz, otwórz, zamknij?) - interpretacja.

## 2. Znak "б" w kwadracie + M (z1_b.png)
- Snippet: S00186 "Actuator (operated by stored mechanical energy)", odnośnik IEC 60617-2 02-13-20 (https://library.iec.ch/grasymb/grasymb.nsf/(SysSymbol)/S00186). Rekordu nie odczytano; geometria nieznana. Numer 02-13-20 pochodzi ze snippeta - niepotwierdzony.
- Snippet: S01406 "spring-operated device" dodany wnioskiem (https://library.iec.ch/grasymb/grasymb.nsf/(SysCR)/C00061), używany w S00295. Niepotwierdzony.
- Czy "б" odpowiada któremuś symbolowi: NIE ZNALEZIONO (nie porównano geometrii, rekordy niedostępne). Znak przypomina cyrylickie "б"/cyfrę 6, nie typowy symbol sprężyny (zygzak/spirala) - obserwacja wzrokowa, pewność niska.

## Geometria do odtworzenia wektorowo
Wyłącznie wg odczytu ENEA (nie wg normy): §15 specyfikacji + wycinki z7_sep.png, z1_b.png. Nie oznaczać jako symbol IEC.
Z1_b: kwadrat z "б", pozioma kreska do noża wyłącznika, nad kwadratem kółko M połączone pionowo.

## Czego brakuje
Dostęp do bazy IEC 60617 (licencja/IEC Electropedia, lub PDF PN-EN 60617 / IEC 60617-2 i -7), karty ABB/Siemens/Schneider (pobranie ręczne przez właściciela), pytanie do ENEA o legendę.
