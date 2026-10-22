# IEC 60909-0 — pakiet źródłowy i mapa wymagań (2016 → 2026)

**Status: SPECYFIKACJA / NIE JEST CERTYFIKATEM ZGODNOŚCI.**
Opracowano 2026-10-22 z publicznych metadanych IEC, podglądów spisu treści oraz jawnych materiałów technicznych. Nie zawiera reprodukcji pełnego tekstu normy ani autoryzacji do stosowania wydania 2026 jako zwalidowanego.

## 1. Hierarchia dowodów
- **P1: metadane wydawcy IEC** — numer wydania, data, zastąpienie, zakres ogólny.
- **P2: publiczny podgląd normy** — numeracja rozdziałów, postanowienia zakresu, jawne definicje, ale NIE całość wymagań.
- **P3: materiały techniczne ABB/EasyPower, przewodnik IEC TR 60909-1** — wsparcie interpretacji; NIE zastępują pełnej normy.
- **P4: wnioski projektowe MV-DESIGN PRO** — wymagania wewnętrzne, nie wolno oznaczać jako cytat IEC.

## 2. Status wydań
| Właściwość | IEC 60909-0:2016 | IEC 60909-0:2026 |
|---|---|---|
| Wydanie | 2.0 | 3.0 |
| Data publikacji IEC | 2016-01-28 | 2026-07-23 |
| Status | zastąpione 2026-07-23 | aktualne IEC |
| Metoda / założenia | 5.3 / 5.2 | 5.2 / 5.2.4 |
| Składowe symetryczne | 5.3.2 | 5.2.5 |
| Modele urządzeń | 6 | 6 — gruntownie zreorganizowany |
| Linie i kable | 6.4 | 6.2 |
| Sieć zasilająca | 6.2 | 6.7 |
| Transformatory | 6.3 | 6.3 |
| Maszyny synchroniczne | 6.6 | 6.8 |
| Maszyny asynchroniczne | 6.10 | 6.9 |
| Przekształtniki / jednostki wytwórcze | 6.8–6.9, 6.11 | 6.10–6.13 |
| Prąd początkowy | 7 | 7 |
| Prąd udarowy | 8 | 8 |
| Prąd wyłączalny | 9 | 9 |
| Składowa nieokresowa | 10 | 10 |
| Prąd ustalony | 11 | 11 |
| I²t i prąd cieplny | 14; zał. A (m,n) | 14; zał. B (m,n) |
| Załącznik: macierze Y/Z | B (informacyjny) | brak analogicznego załącznika w jawnym spisie treści — NIE wnioskować o zakazie metod macierzowych |
| FACTS / HVDC | bez odrębnego bloku 6.14 | 6.14 |
| Źródła prądowe | model w odpowiednich punktach | wyodrębniony 5.2.3 |

**UWAGA:** przesunięcia numeracji nie są dowodem niezmienności wzorów, danych wejściowych ani współczynników.

## 3. Zasady fizyczne z niezależną identyfikacją źródła

### 3.1 Założenia 2016: 5.2(f)
- Pojemności linii w składowej zgodnej i przeciwnej są pomijane w modelu zwarciowym normy.
- W składowej zerowej wymagane jest uwzględnienie pojemności dla sieci uziemionej przez małą impedancję, gdy współczynnik zwarcia doziemnego jest **większy niż 1,4**.
- To warunek ścisły `> 1.4`, nie `>= 1.4`; granica oraz rodzaj uziemienia muszą być udokumentowane.
- Publiczny materiał ABB/EasyPower (2021) oraz podgląd IEC 2016 wskazują treść reguły. Nie przepisujemy chronionego zdania normy.
- **Zakaz fałszywego wniosku:** brak spełnienia warunku NIE uprawnia do ignorowania pojemności w niezależnych analizach doziemień sieci izolowanej/kompensowanej.
- W przypadku braku współczynnika zwarcia doziemnego lub informacji o uziemieniu nie domniemywać `1.4` ani `0`. Status oceny: `BLOCKER` dla deklaracji zgodności dotyczącej tej reguły.

### 3.2 Uziemienie punktu neutralnego
W sieci składowej zerowej uwzględnia się potrójną impedancję punktu neutralnego (w zapisie na fazę: `3·Z_N`). Dla połączeń transformatorów decydują także uzwojenia, grupa połączeń oraz droga powrotna. Zachować odrębność impedancji źródła i admitancji bocznikowej.

### 3.3 Zakres stosowalności 2026
- Trójfazowe sieci AC 50/60 Hz; ograniczenie dotyczące systemów o najwyższym napięciu 550 kV i wyższym z długimi liniami.
- Pojedyncze zwarcie doziemne w układzie z izolowanym lub rezonansowo uziemionym punktem neutralnym: **poza zakresem 60909-0:2026** (punkt 1). Dwa jednoczesne zwarcia doziemne odsyłane do IEC 60909-3.
- Norma **nie rozróżnia GFM i GFL na potrzeby obliczeń zwarciowych**. Atrybut technologiczny należy zachować w ENM, ale nie tworzyć rzekomo normowych oddzielnych gałęzi obliczeń GFL/GFM.
- Reguła dotycząca pojemności `2026 §5.2.4`: **NIEZWERYFIKOWANA** w całości. Nie wolno kopiować reguły 2016 z twierdzeniem, że obowiązuje w 2026.

### 3.4 Rodzaje wyników i analiza
Dla każdej edycji w pełnym audycie zweryfikować: `I''k,max`, `I''k,min`, `ip`, `Ib`, `Ik`, `Ith`, `I²t`, prąd gałęziowy, prąd źródła i wkłady w punktach 3F, 2F, 2F+Z, 1F (tylko zakres objęty metodą). Uwzględnić napięcie, temperatury, zaczepy, korekcje impedancji, źródła synchroniczne/asynchroniczne, jednostki PV/wiatr/BESS, ciepło i czas wyłączenia.

## 4. Najistotniejsze pytania do pełnego tekstu 2026 (blokady P0)
| ID | Sprawdzenie | Potrzebny dowód |
|---|---|---|
| N26-001 | Dokładny warunek uwzględniania B0 | 2026 §5.2.4, pełne postanowienie i ewentualne uwagi |
| N26-002 | Nowy katalog źródeł prądowych | 2026 §5.2.3, 6.10–6.12, 7 |
| N26-003 | Korekcje transformatorów i jednostek | 2026 §6.3 i 6.11 |
| N26-004 | Prądy częściowe w torach odgałęźnych | 2026 §7–§11 |
| N26-005 | Metody κ, μ, q, λ, m/n | 2026 §8–§11, 14, zał. B |
| N26-006 | Wpływ kompensacji i FACTS/HVDC | 2026 §6.4–6.5, 6.14 |
| N26-007 | Dane referencyjne do testów | IEC TR 60909-4:2021 i własne niezależne testy |

## 5. Konieczne rozgraniczenie metod
1. `IEC_60909_0_2016` — historyczny model, niezależna walidacja stanu istniejącego.
2. `IEC_60909_0_2026` — profil przygotowany, lecz nieuruchamiany w raportach normowych bez dowodu wymagań i porównania liczbowego.
3. `MV_EARTH_FAULT_ISOLATED`, `MV_EARTH_FAULT_RESONANT` — odrębne analizy doziemień i prądów pojemnościowych; nie podszywają się pod 60909-0.
4. `IEC_60909_3` — osobna podstawa dla dwóch niezależnych, jednoczesnych zwarć doziemnych (nie stanowi selektora wydania `60909-0`).

## 6. Bibliografia i ścieżka weryfikacji (URL)
- IEC: https://webstore.iec.ch/en/publication/24100 — wydanie 2016, data i zastąpienie.
- IEC: https://webstore.iec.ch/en/publication/68454 — wydanie 2026, data i zakres ogólny.
- Podgląd 2026: https://standards.iteh.ai/catalog/standards/iec/111c61a1-d4a4-4eb4-9655-ba4785738720/iec-60909-0-2026 — spis treści i fragment zakresu.
- Podgląd 2016: https://www.iteh.eu/catalog/standards/iec/951ea29b-bb50-4d8a-9f28-6f65feb90c81/iec-60909-0-2016 — spis treści.
- NEN: https://www.nen.nl/en/nen-en-iec-60909-2026-en-356880 — opis stosowalności, GFL/GFM.
- EasyPower / ABB: https://www.easypower.com/files/Short_Circuit_Currents_According_to_IEC_60909.pdf — streszczenie założeń 2016 (materiał wtórny).
- IEC TR 60909-1:2002, podgląd: https://www.iteh.fr/catalog/standards/iec/def0f869-c260-44d2-9b7b-ba9cfd2bd8b1/iec-tr-60909-1-2002 — interpretacja składowej zerowej (wydanie przewodnika dotyczy poprzedniego okresu).
- IEC TR 60909-4:2021: https://webstore.iec.ch/ — wyszukać oficjalną publikację i przykłady (licencja odrębna).

## 7. Prawa autorskie i jakość
W repozytorium trzymać wyłącznie opracowanie własne, referencje, testy i dane legalnie udostępnione. Nie przechowywać zakupionego pełnego tekstu IEC w publicznym repo bez odrębnej licencji. Wskaźnik `SOURCE_CORROBORATED` nie oznacza `VALIDATED`, `IMPLEMENTED` ani `COMPLIANT`.

## Korekty z niezależnego audytu 2026-10-22

- PKN: **PN-EN 60909-0:2016-09** została opublikowana 07.09.2016 i wdraża IEC oraz EN 2016 identycznie (IDT): https://sklep.pkn.pl/pn-en-60909-0-2016-09e.html.
- PKN potwierdza **EN IEC 60909-0:2026**, 18.09.2026. Status osobnej polskiej adopcji **PN-EN IEC 60909-0:2026** nie został potwierdzony: https://www.pkn.pl/o-pkn/wspolpraca-miedzynarodowa/nowe-enisoiec/normy-europejskie.
- Oficjalny podgląd IEC 2016 ma pozorny konflikt między szerokim wyłączeniem pojedynczego doziemienia w §1 a procedurą dla zwarcia doziemnego w §7.5. Nie formułować na tej podstawie ogólnego zakazu 1F. Wydanie 2026 §1 wyraźnie ogranicza wyłączenie do punktu neutralnego izolowanego i rezonansowo uziemionego.
- IEC TR 60909-4:2021 jest dostosowany do obliczeń **2016**, dlatego jego przykłady nie wystarczą jako wyłączna walidacja zmian 2026: https://webstore.iec.ch/en/publication/66482.
- IEC 60909-3:2009 obejmuje także częściowe prądy powrotne w ziemi: https://webstore.iec.ch/en/publication/3890.
- Błędy obliczeń i nazw wielkości wynikowych udokumentowano w [RED TEAM II](RED_TEAM_FIZYKA_I_ZRODLA_2026_10_22.md).
