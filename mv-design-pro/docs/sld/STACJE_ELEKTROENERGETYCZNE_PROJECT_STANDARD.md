# Stacje elektroenergetyczne - standard projektowy

**Status:** obowiązująca reguła projektowania SLD, kreatorów, kart obiektów, katalogów, zabezpieczeń, wyników i dowodu obliczeń.

**Źródło opracowania:** `C:/Users/Rado/Downloads/dolega_stacje_elektroenergetyczne.pdf`
(`Stacje elektroenergetyczne`, W. Dołęga, Oficyna Wydawnicza Politechniki Wrocławskiej, 2007).

Ten dokument jest syntezą projektową dla MV-DESIGN-PRO. Nie kopiuje podręcznika. Przenosi wiedzę inżynierską do reguł implementacji.

## 0. Język i kodowanie

- Dokumentacja, etykiety interfejsu i komunikaty użytkownika mają być pisane po polsku technicznym.
- Angielski jest dopuszczalny tylko jako nazwa własna standardu, API, typu kodowego, ścieżki pliku albo identyfikatora programu.
- Tekst nie może zawierać typowych pozostałości po błędnym odczycie UTF-8 ani innych widocznych błędów kodowania.
- Jeżeli podczas pracy dotykany plik zawiera uszkodzone kodowanie, należy je poprawić w tym samym zakresie zmian.

## 1. Stacja jest układem elektroenergetycznym

GPZ, stacja rozdzielcza, stacja SN/nN, punkt odgałęźny i stacja przyłączenia źródła nie mogą być rysowane jako dekoracyjna ikona ani zwykły kafel. To układ funkcjonalny:

- tor zasilania,
- tor transformatora, jeżeli występuje w modelu,
- sekcje szyn SN,
- pola liniowe, transformatorowe, pomiarowe, sprzęgłowe i źródłowe,
- aparatura łączeniowa,
- tor uziemienia,
- przekładniki pomiarowe,
- zabezpieczenia, sterowanie, sygnalizacja i blokady,
- wyprowadzone odcinki sieci.

Każdy widoczny symbol schematu musi odpowiadać elementowi domeny, polu stacji, aparatowi, sekcji szyn, gałęzi, portowi albo jawnemu stanowi brakujących danych. Jeżeli model nie zawiera elementu, interfejs ma pokazać precyzyjną blokadę lub akcję naprawczą, a nie dopowiadać aparaturę.

## 2. Obowiązkowa wizualizacja GPZ

Renderer GPZ musi pokazywać strukturę stacji, a nie tylko pola odpływowe:

1. Kontekst zasilania zewnętrznego.
2. Tor transformatora WN/SN, jeżeli transformator istnieje w modelu.
3. Sekcje szyn SN z oznaczeniem sekcji i poziomu napięcia.
4. Sprzęgło sekcji, jeżeli jest zamodelowane.
5. Pola SN przyłączone do właściwej sekcji szyn.
6. Aparaturę pola w kolejności elektrycznej: odejście od szyn, odłącznik, wyłącznik albo rozłącznik bezpiecznikowy, przekładniki, uziemnik, głowica kablowa albo liniowa i port wyjściowy.
7. Pierwszy odcinek magistrali wyprowadzony z przygotowanego pola SN.

Obowiązująca sekwencja budowy:

`GPZ -> konfiguracja pola SN -> wyprowadzenie magistrali SN z pola -> odcinki, stacje i odgałęzienia -> transformatory, odbiory i źródła OZE/BESS -> obliczenia serwerowe -> nakładki wyników i dowód obliczeń`.

Magistrala nie może startować bezpośrednio z kontenera GPZ. Musi startować z przygotowanego pola SN.

## 3. Znaczenie aparatury

Symbole aparatury nie są wymienne:

- wyłącznik - aparat do łączenia prądów roboczych i zwarciowych, powiązany z zabezpieczeniem i zdolnością wyłączalną,
- odłącznik - aparat izolacyjny z widoczną przerwą, bez funkcji wyłączania zwarcia,
- uziemnik - tor uziemienia i stan bezpieczeństwa,
- bezpiecznik - aparat zabezpieczeniowy z charakterystyką wkładki,
- stycznik albo rozłącznik - aparat łączeniowy w granicach swojej kategorii pracy.

Renderer, karta obiektu i katalog muszą zachować te role. Brak wyłącznika, przekładnika, przekaźnika, danych znamionowych, pozycji katalogowej albo danych uziemienia jest rzeczywistą blokadą kompletności.

## 4. Szyny i pola rozdzielni

SLD musi jawnie pokazywać topologię szyn:

- pojedynczy układ szyn,
- układ sekcjonowany,
- sprzęgło sekcji,
- szynę pomocniczą albo obejściową, jeżeli wspiera ją model,
- przypisanie pola do sekcji,
- punkty normalnie otwarte i aparaturę sekcjonującą.

Oznaczenia typu `5`, `6-7`, `8` są dopuszczalne tylko wtedy, gdy wynikają z deterministycznej kolejności pól albo nazewnictwa domenowego i nie zasłaniają aparatury. Sprzęgło musi być czytelnie oddzielone od pól liniowych.

## 5. Karty obiektów

Karta elementu ma opisywać obiekt inżynierski, a nie zrzut wewnętrznych identyfikatorów.

Wymagane grupy informacji:

- identyfikacja i nazewnictwo,
- pozycja w stacji, poziom napięcia, sekcja szyn i pole,
- rola elektryczna i funkcja sieciowa,
- powiązanie katalogowe i dane znamionowe,
- wytrzymałość zwarciowa i prądowa,
- uziemienie i składowa zerowa, jeżeli dotyczą obiektu,
- powiązania zabezpieczeń oraz przekładników,
- sterowanie, sygnalizacja i blokady,
- blokady gotowości oraz dokładna akcja naprawcza.

Surowe identyfikatory, skróty haszy i referencje wewnętrzne mogą być pokazane wyłącznie w zwiniętej diagnostyce technicznej.

## 6. Wartości obliczone

Warstwa prezentacji nie wymyśla i nie wpisuje na sztywno wartości inżynierskich.

- Formularze wysyłają dane użytkownika, katalogu i modelu do warstwy serwerowej.
- Prądy zwarciowe, rozpływy mocy, impedancje wynikowe, wnioski zabezpieczeniowe i liczby w dowodzie obliczeń pochodzą z solverów i wyników serwerowych.
- Jeżeli wynik nie wrócił z serwera, należy pokazać `brak wyniku`, `wymaga obliczeń` albo konkretną blokadę.
- Wartości z przykładów, zrzutów ekranu lub makiet nie mogą trafić jako dane produktu.

## 7. Widoczność odcinków i stacji

Każda operacja na modelu musi mieć widoczny skutek na SLD:

- konfiguracja pola GPZ tworzy widoczne pole i terminal wyjściowy,
- odcinek magistrali tworzy widoczny tor kablowy albo napowietrzny z tego terminala,
- wstawiona stacja SN/nN tworzy widoczny blok stacyjny na trasie,
- transformator tworzy widoczny tor SN/nN w stacji,
- odbiór, PV, FW albo BESS tworzy widoczny tor po właściwej stronie napięciowej,
- punkt odgałęźny tworzy widoczną aparaturę odgałęźną i trasę odgałęzienia.

Licznik w nawigatorze bez widocznego obiektu na SLD jest błędem interfejsu.

## 8. Sterowanie, sygnalizacja i blokady

Interfejs stacji musi uwzględniać realną eksploatację:

- stan łączeniowy musi być widoczny,
- blokady muszą uniemożliwiać operacje sprzeczne z topologią lub bezpieczeństwem,
- tryb lokalny, zdalny i ręczny musi być jawny tam, gdzie wspiera go model,
- sygnalizacja musi rozróżniać stan położenia, zadziałanie zabezpieczenia, alarm, zakłócenie i blokadę obliczeniową,
- automatyka, na przykład SPZ albo SZR, może być nazwana tylko wtedy, gdy jest zamodelowana albo skonfigurowana.

## 9. Ciemny standard SCADA

MV-DESIGN-PRO stosuje jeden ciemny, techniczny styl SCADA:

- bez jasnych kart technicznych w głównej powierzchni aplikacji,
- bez dekoracyjnej pseudoaparatury,
- bez ogólnych klocków zamiast obiektów elektrycznych,
- z gęstymi, ale czytelnymi etykietami technicznymi,
- z czytelnym rozdzieleniem poziomów napięcia i stanów,
- bez nazw przykładowych wpisanych na sztywno,
- bez surowych identyfikatorów w głównych etykietach,
- z deterministyczną akcją dla kliknięcia, dwukliku, prawego kliknięcia i portu.

## 10. Lista odbioru zmian SLD

Przed zakończeniem zmiany dotyczącej SLD, GPZ, kreatora, katalogu, zabezpieczeń albo kart wyników należy przejść co najmniej jedną ścieżkę:

1. Utwórz albo wybierz model projektu.
2. Utwórz GPZ z domyślnymi danymi powiązanymi z katalogiem.
3. Skonfiguruj pole SN.
4. Wyprowadź pierwszy odcinek magistrali z tego pola.
5. Wstaw stację SN/nN na odcinku.
6. Dodaj transformator i co najmniej jeden odbiór albo źródło, jeżeli dotyczy danego przebiegu.
7. Potwierdź, że każdy utworzony obiekt jest widoczny na SLD.
8. Potwierdź, że karty obiektów są kartami inżynierskimi, a nie zrzutem modelu.
9. Uruchom albo zleć obliczenia dopiero po spełnieniu gotowości.
10. Potwierdź, że wyniki i dowód obliczeń pochodzą z warstwy serwerowej i są powiązane z właściwą szyną, gałęzią, polem albo stacją.

Jeżeli któregoś kroku nie da się wykonać, interfejs musi pokazać jedną następną akcję i jedną dokładną blokadę.
