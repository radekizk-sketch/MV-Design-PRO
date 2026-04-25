# Macierz uprawnien V12.xx

Status: aktywna  
Cel: kontrola zmian, zatwierdzen, eksportow i audytu klasy OSD

## Role

| Rola | Zakres |
|---|---|
| Projektant sieci SN | Model, SLD, parametry, warianty, wyniki techniczne. |
| Projektant zabezpieczen | Nastawy, selektywnosc, EAZ, automatyka, slady zadzialan. |
| Inzynier przylaczen OZE | OZE/BESS/FW, FRT, Q(U), cos phi(P), zgodnosc operatorowa. |
| Inzynier ruchu | Warianty pracy, stany lacznikow, praca po zakloceniu. |
| Audytor | Odczyt, uzasadnienia, slady danych, zgodnosc, raporty. |
| Operator raportowy | Eksport, kompletowanie raportu, publikacja po zatwierdzeniu. |
| Administrator katalogow | Rekordy katalogowe, wersje, zatwierdzanie i wycofanie. |
| Glowny architekt produktu | Zmiany kanonu, decyzje i zamkniecie dlugu. |

## Macierz

| Obszar | Siec SN | Zabezpieczenia | OZE | Ruch | Audytor | Raport | Katalogi | Architekt |
|---|---|---|---|---|---|---|---|---|
| Odczyt ENM | tak | tak | tak | tak | tak | tak | tak | tak |
| Edycja ENM | tak | ograniczona | ograniczona | ograniczona | nie | nie | nie | tak |
| Zmiana wariantu pracy | tak | tak | tak | tak | nie | nie | nie | tak |
| Zmiana stanu lacznika w wariancie | tak | tak | nie | tak | nie | nie | nie | tak |
| Nastawy zabezpieczen | nie | tak | podglad | podglad | podglad | nie | nie | tak |
| Automatyka SPZ/SZR/SCO/FDIR | podglad | tak | podglad | tak | podglad | nie | nie | tak |
| Profile OZE/FRT | podglad | podglad | tak | podglad | podglad | nie | nie | tak |
| Uruchomienie obliczen | tak | tak | tak | tak | nie | nie | nie | tak |
| Akceptacja uzasadnienia | nie | tak dla EAZ | tak dla OZE | tak dla ruchu | tak | nie | nie | tak |
| Eksport raportu | nie | nie | nie | nie | podglad | tak | nie | tak |
| Publikacja raportu | nie | nie | nie | nie | akceptacja | tak | nie | tak |
| Zmiana katalogu | nie | nie | nie | nie | nie | nie | tak | tak |
| Zatwierdzenie katalogu | nie | nie | nie | nie | podglad | nie | tak | tak |
| Zmiana kanonu | nie | nie | nie | nie | wniosek | nie | wniosek | tak |

## Slad audytowy

Kazda istotna zmiana zapisuje: kto, kiedy, co, dlaczego, z jakiego ekranu, na jakiej wersji danych i z jakim skutkiem invalidacji.
