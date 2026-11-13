# ENEA GPZ 110/SN — standard źródłowy i audyt pól SN 2024

**Dokument referencyjny, nie nowy plan i nie zatwierdzenie B-02.** Obowiązuje hierarchia `CLAUDE.md` → kanon → `PLANS.md` → specyfikacje domenowe/SLD. Nie zmieniać istniejących ustaleń ani kodu tylko dlatego, że dodano ten pakiet.

## Oryginalny, publicznie dostępny standard

**ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe 110 kV/SN”**, wersja **02.2023–2**, obowiązuje od **02.04.2024**.

- [Strona oficjalnego wykazu standardów ENEA](https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji)
- [Oryginalny plik PDF bezpośrednio z witryny ENEA Operator](https://www.operator.enea.pl/uploads-ev2/Operator/us%C5%82ugidystrybucyjne/instrukcjeistandardysieci/standardywsieci/21.03.2024_1/Stacje%20elektroenergetyczne%20110%20kV%20Zeszyt%201.%20Stacje%20dwutransformatorowe%20110%20kVSN%20-%20obowi%C4%85zuje%20od%2002.04.2024.pdf)

**Dla Opusa:** standard nie jest osadzony w tym PR. Zawarte tu linki wskazują dokument źródłowy; Opus musi pobrać oryginał bezpośrednio od ENEA, potwierdzić wersję i zestawić go z własnym egzemplarzem. Jeśli jego środowisko nie pozwala na pobranie dokumentu, nie deklarować weryfikacji pełnego tekstu — zgłosić konkretną blokadę dostępu. Nie kopiować całego PDF ani jego rysunków do repo bez upewnienia się co do praw. Dokument oznaczono zastrzeżeniem praw ENEA Operator.

Pomocniczy sposób pozyskania w uprawnionym środowisku (poza repo):
```bash
mkdir -p /tmp/mv-design-pro-standards
curl -fL 'https://www.operator.enea.pl/uploads-ev2/Operator/us%C5%82ugidystrybucyjne/instrukcjeistandardysieci/standardywsieci/21.03.2024_1/Stacje%20elektroenergetyczne%20110%20kV%20Zeszyt%201.%20Stacje%20dwutransformatorowe%20110%20kVSN%20-%20obowi%C4%85zuje%20od%2002.04.2024.pdf' -o /tmp/mv-design-pro-standards/ENEA_GPZ_Z1_2024.pdf
pdfinfo /tmp/mv-design-pro-standards/ENEA_GPZ_Z1_2024.pdf
```
To polecenie NIE zapisuje PDF w repo i NIE ustanawia uprawnienia licencyjnego.

## Zweryfikowane miejsca oryginału

| Zakres | Miejsce standardu | Dla jakiej kontroli |
|---|---|---|
| Moc 25 MVA — prądy znamionowe | §8.2, tabela 3, druk s. 15 | szyny, TR, sprzęgło 1250 A; wybrane odpływy 630 A |
| Wytrzymałość zwarciowa | §9.2, druk s. 16 | rozdzielnica SN co najmniej 16 kA / 3 s |
| Wyposażenie, wykonanie, nazwy, numeracja | §13, druk s. 23–26 | m.in. sekcje A/B, pola, aparatura, VT, wymiary fizyczne |
| Główne zabezpieczenia transformatora | §26.9.4, druk s. 53 | pola transformatorowe SN |
| Funkcje pola pomiaru napięcia | §26.9.8, druk s. 54 | 59/27/59N/81U/81R oraz SCO/SPZ po SCO |
| Pole TR1 strona SN | załącznik **Z.7**, strona PDF **86** (1-based) | CT czterordzeniowy, VT trzyuzwojeniowy, połączenia i funkcje |
| Pole baterii kondensatorów | załącznik **Z.16**, strona PDF **96** (1-based) | aparatura, kontrola uszkodzeń, połączenia |
| Pole pomiaru napięcia | załącznik **Z.17**, strona PDF **97** (1-based) | uzwojenia VT, 3U0, obwody wtórne, automatyka |
| Inne wzorce | Z.10, Z.11, Z.11.1, Z.12–Z.15 | osobna kontrola konkretnych rodzajów pola |

**Numery stron PDF** odnoszą się do wersji oficjalnej otwartej 2026-11-12. Weryfikować, jeśli PDF zmieni układ stron.

## Dokumenty tego pakietu

- [DODATEK_DO_OPUSA_B02.md](DODATEK_DO_OPUSA_B02.md) — **tylko nowe i korygujące** uwagi względem istniejącej karty etapu 6.
- [MACIERZ_ZGODNOSCI_ENEA.md](MACIERZ_ZGODNOSCI_ENEA.md) — identyfikator, podstawa, status dowodowy, korekta, test.
- [KARTY_Z7_Z17_WERYFIKACJA.md](KARTY_Z7_Z17_WERYFIKACJA.md) — dane przekładników, połączeń, zabezpieczeń, obwodów wtórnych.
- [ZASADY_ZAKRESU_I_ZRODEL.md](ZASADY_ZAKRESU_I_ZRODEL.md) — granice stosowania standardu i jawne rozdzielenie wymagań ENEA od UX/SLD.

## Aneks 13.11.2026: zatwierdzone rozwiązania projektowe SN

Dwa dostarczone tomy projektu wykonawczego (łącznie **386 stron**) włączono do bazy rozwiązań w postaci **zanonimizowanych, zweryfikowanych i dopuszczonych wzorców projektowych** na podstawie decyzji właściciela. Przeniesiono rozróżnione katalogi producentów, schematy typowych pól, profile zabezpieczeń i automatyk, testy oraz rejestr danych. Pełne PDF i rzeczywiste nastawy/schematy telemechaniki pozostają poza repo.

- [Atlas zatwierdzonych rozwiązań SN](aneks-praktyka-sN/README.md)
- [Katalogi producentów](aneks-praktyka-sN/PRODUCENCI_I_KATALOGI.md)
- [Typy pól i EAZ](aneks-praktyka-sN/TYPOWE_POLA_I_EAZ.md)
- [Walidatory](aneks-praktyka-sN/WALIDATORY_I_KONTROLA_JAKOSCI.md)
- [Rejestr CSV](aneks-praktyka-sN/REJESTR_ROZWIAZAN.csv)
- [Mapa integracji z istniejącym katalogiem](aneks-praktyka-sN/ZADANIE_INTEGRACYJNE.md)

**Status dowodowy:** projekt referencyjny jest przyjęty jako zweryfikowany i dopuszczony. Wymagania ENEA z tego README oraz z dokumentów standardu pozostają osobną klasą danych. Nie mylić konstrukcji modernizowanych pól 17,5 kV z wymaganiami dla nowych rozdzielnic GPZ 24 kV.

## Granice

Nie projektujemy rozdzielni WN 110 kV. Wykorzystujemy jej granicę jako dane zasilania GPZ, a dla strony SN modele pól i ich aparaturę. Nie przebudowywać `SldCanvasV3`, `computeLayout`, katalogów ani już realizowanych kart; najpierw skontrolować bieżącą gałąź wykonawcy (commit `2cc7184a4` wskazany przez właściciela), a nie jedynie `main`.

**Status oceny:** nie zaobserwowano wszystkich typów pól w komplecie; „do kontroli” nie znaczy „stwierdzona niezgodność”. Podstawą odbioru pozostaje działająca aplikacja i testy, nie sam opis.
