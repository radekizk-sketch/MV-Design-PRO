# Macierz interakcji V12.xx

Status: aktywna rama kanoniczna  
Cel: kazda interakcja SLD ma jawny efekt, okno docelowe i wplyw na ENM, wyniki oraz gotowosc

## Reguly globalne

- Pojedynczy klik wybiera obiekt i aktualizuje inspektor.
- Podwojny klik otwiera domyslne okno edycji lub analizy obiektu.
- Prawy klik otwiera menu kontekstowe zgodne ze stanem obiektu.
- Hover pokazuje nazwe pelna, jednostke, status jakosci i status aktualnosci wyniku.
- Skrot klawiaturowy nie moze wykonac operacji destrukcyjnej bez potwierdzenia.
- Stan audytowy jest tylko do odczytu poza akcjami eksportu i przejscia do uzasadnienia.

## Macierz bazowa

| Obiekt | Stan | Klik | 2x klik | Prawy klik | Hover | Skrot | Efekt | Okno docelowe | ENM | Wyniki | Gotowosc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tlo SLD | edycja | odznacz | dopasuj widok | menu schematu | wspolrzedne i tryb | `Esc` | reset zaznaczenia | brak | brak | brak | brak |
| GPZ | kompletny | wybierz | otworz GPZ | menu GPZ | status zasilania | `Enter` | inspektor GPZ | Okno GPZ | brak do zapisu | pokaz wyniki | pokaz gotowosc GPZ |
| Sekcja szyn | kompletny | wybierz | otworz sekcje | menu sekcji | napiecie i obciazenie | `Enter` | inspektor sekcji | Okno sekcji szyn | zapis po walidacji | invaliduj zalezne | przelicz gotowosc sekcji |
| Pole SN | kompletny | wybierz | otworz pole | menu pola | aparaty i pomiary | `Enter` | inspektor pola | Okno pola SN | brak do zapisu | wyniki pola | gotowosc pola |
| Wylacznik | zamkniety | wybierz | edytuj aparat | otworz / zamknij / zabezpieczenia | stan i blokady | `Space` | przygotuj polecenie | Okno aparatu | zapis po potwierdzeniu | invaliduj wariant | przelicz gotowosc |
| Rozlacznik | kompletny | wybierz | edytuj aparat | otworz / zamknij / blokady | stan i obciazalnosc | `Space` | przygotuj polecenie | Okno aparatu | zapis po potwierdzeniu | invaliduj wariant | przelicz gotowosc |
| Odlacznik | zablokowany | wybierz | pokaz blokade | menu tylko odczyt | powod blokady | brak | brak zmiany | Okno blokady | brak | brak | pokaz blokade |
| Uziemnik | odlaczony | wybierz | edytuj aparat | uziem / odziem / blokady | stan i blokady | `Space` | przygotuj polecenie | Okno aparatu | zapis po potwierdzeniu | invaliduj zwarcia i wariant | przelicz gotowosc |
| Bezpiecznik | kompletny | wybierz | edytuj bezpiecznik | katalog / charakterystyka | prad znamionowy i typ | `Enter` | inspektor bezpiecznika | Okno bezpiecznika | zapis po walidacji | invaliduj selektywnosc | przelicz gotowosc |
| Przekladnik pradowy | kompletny | wybierz | edytuj PP | katalog / przekladnia / uzasadnienie | przekladnia i klasa | `Enter` | inspektor pomiaru | Okno PP | zapis po walidacji | invaliduj zabezpieczenia | przelicz gotowosc |
| Przekladnik napieciowy | kompletny | wybierz | edytuj PN | katalog / przekladnia / uzasadnienie | przekladnia i klasa | `Enter` | inspektor pomiaru | Okno PN | zapis po walidacji | invaliduj zabezpieczenia | przelicz gotowosc |
| Odcinek kablowy | kompletny | wybierz | edytuj odcinek | katalog / parametry / podziel | typ, dlugosc, jakosc | `Enter` | inspektor odcinka | Okno odcinka | zapis po walidacji | invaliduj zalezne | przelicz odcinek |
| Odcinek napowietrzny | kompletny | wybierz | edytuj odcinek | katalog / parametry / podziel | typ, dlugosc, jakosc | `Enter` | inspektor odcinka | Okno odcinka | zapis po walidacji | invaliduj zalezne | przelicz odcinek |
| ZKSN | kompletny | wybierz | otworz ZKSN | menu ZKSN | laczniki i pola | `Enter` | inspektor ZKSN | Okno ZKSN | zapis po walidacji | invaliduj zalezne | przelicz gotowosc |
| Slup rozgalezny | kompletny | wybierz | otworz slup | menu slupa | odgalezienia i geometra | `Enter` | inspektor slupa | Okno slupa rozgaleznego | zapis po walidacji | invaliduj zalezne | przelicz gotowosc |
| Odgalezienie | kompletny | wybierz | otworz odgalezienie | menu odgalezienia | typ i obciazenie | `Enter` | inspektor odgalezienia | Okno odgalezienia | zapis po walidacji | invaliduj zalezne | przelicz gotowosc |
| Punkt normalnie otwarty | aktywny | wybierz | otworz NOP | przelacz wariant / porownaj | wariant pracy i blokady | `N` | przejdz do wariantu | Okno NOP | zapis po potwierdzeniu | invaliduj wariant | przelicz gotowosc |
| Transformator | kompletny | wybierz | edytuj transformator | katalog / zaczepy / uzasadnienie | grupa, uk, straty | `Enter` | inspektor transformatora | Okno transformatora | zapis po walidacji | invaliduj zalezne | przelicz |
| Stacja transformatorowa | kompletny | wybierz | otworz stacje | menu stacji | typ, pola, trafo | `Enter` | inspektor stacji | Okno stacji | zapis po walidacji | invaliduj zalezne | przelicz gotowosc stacji |
| Strona nN | kompletny | wybierz | otworz strone nN | menu nN | napiecie i odpływy | `Enter` | inspektor nN | Okno strony nN | zapis po walidacji | invaliduj zalezne | przelicz gotowosc |
| Odplyw nN | kompletny | wybierz | edytuj odplyw | katalog / obciazenie | prad i zabezpieczenie | `Enter` | inspektor odplywu | Okno odplywu nN | zapis po walidacji | invaliduj rozpływ | przelicz gotowosc |
| Obciazenie | kompletny | wybierz | edytuj obciazenie | profil / parametry | P, Q i profil | `Enter` | inspektor obciazenia | Okno obciazenia | zapis po walidacji | invaliduj rozpływ i stan fazowy | przelicz gotowosc |
| Zrodlo PV | kompletny | wybierz | otworz OZE | FRT / Q(U) / cos phi(P) | profil i zgodnosc | `Enter` | inspektor OZE | Okno zrodla PV | zapis po walidacji | invaliduj OZE | przelicz OZE |
| BESS | tryb pracy | wybierz | otworz BESS | tryb ladowania / rozladowania | P/Q/SOC | `Enter` | inspektor BESS | Okno BESS | zapis wariantu | invaliduj rozplyw i FRT | przelicz |
| Farma wiatrowa | kompletny | wybierz | otworz FW | typ PMSG/DFIG/SCIG | model generatora | `Enter` | inspektor FW | Okno FW | zapis po walidacji | invaliduj zalezne | przelicz |
| Transformator blokowy | kompletny | wybierz | otworz trafo blokowe | katalog / zaczepy | grupa i uk | `Enter` | inspektor trafa blokowego | Okno transformatora blokowego | zapis po walidacji | invaliduj OZE i zwarcia | przelicz |
| Etykieta wyniku | aktualny | wybierz wynik | otworz uzasadnienie | menu wyniku | jednostka i pochodzenie | `Enter` | pokaz wynik | Uzasadnienie | brak | brak | brak |
| Znacznik bledu | aktywny | wybierz problem | otworz naprawe | menu naprawcze | kod i akcja | `Enter` | pokaz sciezke naprawy | Okno naprawy | zapis po akcji | invaliduj zalezne | odswiez gotowosc |
| Znacznik blokady | aktywny | wybierz blokade | otworz szczegoly blokady | menu blokady | kod i warunek | `Enter` | pokaz powod blokady | Okno blokady | brak | brak | pokaz blokade |
| Znacznik nieaktualnosci | aktywny | wybierz | otworz run | przelicz / porownaj | powod invalidacji | `R` | przejdz do uruchomien | Okno uruchomien | brak | nowy run po akcji | odswiez |
| Znacznik uzasadnienia | aktywny | wybierz | otworz proof | eksport / audyt | proof ref i status | `Enter` | przejdz do dowodu | Okno uzasadnienia | brak | brak | brak |
| Znacznik jakosci danych | aktywny | wybierz | otworz pochodzenie | menu jakosci | pochodzenie i klasa | `Enter` | przejdz do pochodzenia | Okno jakosci danych | brak | brak | moze blokowac raport |

## Blokada wdrozeniowa

Nie wolno dodac nowego typu obiektu SLD bez wpisu w tej macierzy albo bez automatycznego testu potwierdzajacego zachowanie klik, 2x klik, prawy klik, hover i trybu audytowego.
