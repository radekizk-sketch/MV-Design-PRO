# MV-DESIGN-PRO — konfigurator pól SN wieloproducentowy — specyfikacja ekranu V1

**Status:** projekt UX/kontrakt wdrożeniowy, do oceny B-02. **PR #532**. Data: 2026-11-13.

## 0. Decyzja produktowa i granice prawdy

Jeden konfigurator dla wszystkich producentów istniejących w `MANUFACTURER_REGISTRY`, z możliwością dodania następnych przez dane katalogowe. Nie tworzyć osobnych kreatorów ABB, Elektrometalu, Siemensa, Schneidera ani ZPUE. Wybór dowolnego producenta ≠ gwarancja dostępności każdego rodzaju pola: rodziny i wykonania filtrować przez rzeczywiste możliwości i status źródła. Nie wolno fabrykować parametrów brakujących w katalogu.

**Stan repo na dzień projektu:** `network_model.catalog.switchgear` ma pięciu producentów (ZPUE, Elektrometal, ABB, Siemens, Schneider Electric), rodziny i rejestry konfiguracji. `reference_engine` ma odrębne pakiety norm, OSD i producentów. W PR #532 e²ALPHA zawiera 86 produktów i 7 profili projektowych, ale samo API nie tworzy pól ENM. Makieta jest **docelowa**, a nie zrzut gotowej funkcji. Producent Hetman Electric z makiety jest ilustracją rozszerzalności, nie potwierdzoną pozycją rejestru.

## 1. Miejsce i układ

Nie dodawać osobnego globalnego „Konfigurator GPZ” jako ósmej przestrzeni: konfigurator jest **widokiem roboczym istniejącej przestrzeni Model sieci / Schemat SLD** i panelem uruchamianym z „Dodaj pole”, „Konfiguracja pola”, „Zmień wykonanie”, z powrotem do zaznaczonego pola. Wspólna powłoka MV-DESIGN-PRO pozostaje: górny pasek projektu i trybu, nawigacja przestrzeni, status modelu na dole.

**Referencja wizualna:** makieta wygenerowana w rozmowie 13.11.2026, 1648×928. Rysunek jest kierunkiem kompozycji, nie źródłem danych katalogowych ani wiążącą topologią.

Układ przy 1440×900:
- Nagłówek aplikacji 48 px; drugi pasek roboczy 42 px; pasek statusu 28 px.
- Lewy panel nawigacyjny 232–256 px, stale widoczna hierarchia GPZ → sekcja szyn → pole; aktywny element, status konfiguracji, przyciski „Dodaj pole”, „Kopiuj”, „Usuń”.
- Główna przestrzeń: pasek ścieżki i tytuł pola (48 px), **pasek etapów** (44 px): 1 Typ pola, 2 Producent i wykonanie, 3 Aparatura, 4 Zabezpieczenia i automatyka, 5 Parametry, 6 Walidacja.
- W etapie 2: lewa kolumna producentów **250–280 px**; środkowa kolumna **elastyczna ≥ 520 px**; prawy panel walidacji i akcji **240–270 px**. Kolumny nie mogą zasłaniać schematu, nachodzić na siebie ani ucinać tekstu.
- Środek: nazwa wybranej rodziny + stan źródła, zakładki „Rodzina / Wariant pola / Wykonanie / Dokumenty”, kafle wariantów (maks. 3–4 w wierszu przy 1440 px), dolny podział „Zestawienie aparatury” i „Podgląd SLD pola” z przełączaniem „Obwody wtórne / Logika EAZ”.
- Dolny pasek wariantów projektu (48 px): bieżący, porównawcze i „Dodaj wariant”. Wariant nie zmienia modelu ENM przed „Zastosuj”.
- Gdy szerokość poniżej 1280 px: prawa kolumna staje się wysuwanym inspektorem, nie nakładką na przyciski; kafle przechodzą do 2 wierszy; pasek etapów może przewijać się poziomo, bez znikania etapu walidacji.
- Przy 1280×720: zachować widoczne co najmniej wybraną rodzinę, wybrany wariant, jego stan źródła, przycisk „Zastosuj” i wejście do walidacji. Reszta przewijalna wewnątrz właściwych paneli.
- W ciemnym i jasnym motywie identyczna hierarchia, kontrast i brak ucięć. Żadnych ozdobnych animacji SCADA.

## 2. Lista producentów i rodzin

Wyszukiwarka po nazwie, rodzinie, kodzie typu i rodzaju pola; filtrowanie: napięcie znamionowe, AIS/GIS/izolacja stała, wykonanie stacjonarne/wysuwne, funkcja pola, In, Icw/Ik, status danych, OSD, stacja GPZ/SN-nN. Wyniki wyłącznie z rejestrów. Producent może być wyświetlony jako „W katalogu — brak zweryfikowanej konfiguracji tego pola” z wyjaśnieniem i możliwością wprowadzenia jawnie użytkowego wariantu (status `user_defined`), nigdy jako zielony „Dopuszczony”.

Po kliknięciu producenta:
1. Lista rodzin z rejestru `SWITCHGEAR_FAMILY_REGISTRY`, stan danych i zakres napięć.
2. Po wyborze rodziny — dostępne typy pól z `allowed_bay_kinds`, fabryczne konfiguracje i referencje projektowe, rozróżnione po źródle.
3. Wybrany wariant ma stabilne `family_id`, `configuration_id`, `source_kind`, `source_version`; jeśli brak, pokazać brak, nie wybierać „najbliższego” milcząco.
4. Przy zmianie producenta, rodziny lub wykonania: ostrzeżenie o parametrach nieprzenoszalnych, podgląd różnic i potwierdzenie przed zmianą niezapisanej konfiguracji.
5. Aparaty różnych producentów mogą współistnieć w polu wyłącznie jako jawnie dobrane, kompatybilne urządzenia — producent rozdzielnicy nie staje się automatycznie producentem CT/VT/IED.

## 3. Kafel wariantu i inspektor

Kafel: miniaturowy **poprawny** symboliczny schemat pola (biblioteka SLD V3, nie ilustracja), nazwa rodzaju pola, 2–3 parametry krytyczne, liczba niewypełnionych wymagań, znacznik pochodzenia: „katalog producenta”, „zatwierdzony projekt”, „wariant użytkownika”, „wymaga katalogu”. Stany: wybrany, dostępny, niezgodny, niekompletny, zablokowany. Kolor nigdy nie jest jedynym nośnikiem stanu.

Dolna karta konfiguracji: uporządkowane drzewo **rozdzielnica → pole → aparat pierwotny → przekładniki (rdzenie/uzwojenia) → EAZ/sterowanie → obwody pomocnicze → wyposażenie montażowe**. Dla każdej pozycji: producent, typ, ilość, kluczowe parametry, źródło/strona, status, opcjonalność, zamienniki, ograniczenia montażowe. Edycja konkretnej pozycji otwiera inspektor parametru, nie modal z całym BOM.

Podgląd SLD: tylko rzeczywisty tor SN i poprawne boczne odgałęzienia; CT w torze, VT poza torem głównym, ES boczny, TR przez pole TR, prawidłowe sekcje szyn. Aparatura pomocnicza nie trafia do toru SN. Podgląd korzysta z tych samych symboli i reguł co SldCanvasV3; **bez nowego silnika rysowania i drugiej definicji topologii**. Ustawienie NO/NC nie może zmieniać się przez podgląd.

Panel walidacji: pięć niezależnych obszarów: (a) kompletność danych, (b) zgodność elektryczna rodziny i aparatów, (c) poprawność toru i blokad, (d) wymagania OSD ENEA/wybranego operatora, (e) aktualność obliczeń. Każdy wynik ma kod, status, podstawę źródłową, element, proponowaną korektę; „brak danych” to stan trzeci, nie zielony wynik.

## 4. Interakcje i stany

- **Dodaj pole**: wybór funkcji i sekcji szyn przed producentem; dopiero potem lista kompatybilnych rodzin.
- **Zmień wykonanie**: porównanie bieżącego i proponowanego pola w tabeli różnic; ostrzeżenia o utracie konfiguracji EAZ, CT/VT i zmianie wymiarów, bez automatycznego przenoszenia niezgodnych nastaw.
- **Zastosuj do pola**: transakcja z walidacją i nowymi ID instancji ENM; dopiero po sukcesie aktualizacja SLD, inspektora, BOM i stanu gotowości. Nie można nadpisać istniejącego pola bez potwierdzenia.
- **Zastosuj do wielu pól**: jawna lista i kontrola zgodności każdego pola; atomowość lub raport częściowego powodzenia z jednoznacznym stanem — bez cichego pominięcia.
- **Zapisz jako wariant**: kopia konfiguracji z identyfikacją pochodzenia, bez zmiany bieżącego modelu; można porównać A/B, a nie zrównywać statusów źródeł.
- **Brak katalogu**: czytelna odmowa wykonania fabrycznego + możliwość „wariant użytkownika” oznaczonego jako niezweryfikowany, jeżeli dopuszczają to kontrakty walidacji; nie nadpisuje danych producenta.
- **Niezgodność OSD**: przycisk zastosowania zablokowany dla twardej odmowy; przy braku jednoznacznej podstawy „Wymaga weryfikacji”, bez fabrykowania zgodności.
- **Nieaktualne obliczenia**: status wyników, nie czerwony „błąd produktu”; zmiana pola unieważnia właściwe pochodne wynikowe.

## 5. Architektura i kontrakt danych

Źródła: `MANUFACTURER_REGISTRY`, `SWITCHGEAR_FAMILY_REGISTRY`, `FACTORY_CONFIGURATION_REGISTRY`, `ReferencePack`, `ApprovedProjectReference` oraz obecne ENM i profile OSD. Rozdzielenie: definicja katalogowa → wzorzec konfiguracji → instancja pola ENM → projekcja SLD → obliczenia/walidacja. Nie duplikować walidacji w frontendzie; frontend pokazuje wynik backendu. Nie dodawać niezależnych kopii `BayPrimaryDevice`, aparatów lub rozdzielnic.

API do zaprojektowania w ramach istniejącej warstwy katalogowej, bez równoległego serwera:
- lista producentów z filtrem i statusami;
- lista rodzin producenta z możliwościami;
- warianty pola dla rodziny/roli/parametrów, z pochodzeniem;
- podgląd kompletnej konfiguracji z BOM;
- walidacja propozycji **bez mutacji**;
- transakcyjne zastosowanie do jednego/wielu pól, wersjonowanie i kontrola konfliktu rewizji;
- zapis i porównanie wariantów projektu.

Przed implementacją wykonać audyt istniejących endpointów i wykorzystać je; powyższe to kontrakt zachowania, **nie nakaz tworzenia siedmiu nowych adresów**.

## 6. Macierz ekranów do odbioru

1. Jasny 1440×900: pole liniowe GPZ, producent e²ALPHA, lista 5 producentów, wariant CT3, komplet aparatury i SLD.
2. Ciemny 1440×900: to samo pole, identyczne informacje, bez ucięć.
3. Jasny 1280×720: wysuwany panel zgodności, dostępna akcja „Zastosuj”.
4. Ciemny 1280×720: brak nakładania się nagłówków i paneli.
5. ABB/Siemens/ZPUE/Schneider: wybór producenta i rodziny z rzeczywistych rejestrów, jawne stany braków.
6. Brak danych katalogowych: odmowa/„wymaga katalogu” bez zielonego potwierdzenia.
7. Niezgodne wykonanie 17,5 kV dla wymaganej klasy 24 kV: blokada i konkretna przyczyna.
8. Zmiana rodziny z niezapisanymi zmianami: potwierdzenie, zachowanie danych.
9. Porównanie A/B i zastosowanie do wielu pól: weryfikacja oddzielnie dla każdego pola.
10. Po zastosowaniu: zgodność ENM ↔ SLD ↔ inspektor ↔ BOM, aktualizacja rewizji i wyników.

**Testy:** backend walidacji i serializacji, mutacje, rollback, negatywy, brak źródła, API e2e na rzeczywistym backendzie, Playwright oba motywy i oba rozmiary, screenshoty z widoczną badaną funkcją, bez ucięć i kolizji. Każdy przypadek z dowodem nie tylko zielonym testem. B-02 rozstrzyga wyłącznie właściciel.

## 7. Rozliczenie makiety i danych

Makieta to kierunek układu, a nie poświadczenie ofert katalogowych. Nie uznawać oznaczeń „zgodny ENEA §13”, „Icw ≥ 25 kA/3 s”, „1250 A” ani „bez błędów” z obrazu za zweryfikowane dla wybranego pola. W implementacji wszystkie takie komunikaty muszą pochodzić z modelu i walidatora; nie wolno ich hardkodować. GPZ 110/SN pokazuje jedynie granicę zasilania WN, bez projektowania rozdzielnicy WN.

**Dalsza realizacja:** Opus weryfikuje kanon repo i istniejące kontrakty, aktualizuje bieżący plan, wdraża spójnie z obecnym SLD i kreatorami, przygotowuje testy i dowody B-02. Bez osobnego równoległego planu.
