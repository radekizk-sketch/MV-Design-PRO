# MV-DESIGN-PRO — baza wiedzy technicznej i normowej (R3)

**Status:** źródłowy moduł wiedzy i narzędzia offline, PR do oceny; nie jest wpięty do produkcyjnego API i nie zmienia solvera B-01.
**Podstawa:** licencjonowany załącznik dostarczony przez właściciela + dwa materiały dydaktyczne.
**Uwaga:** załączony skan dokumentuje **wydanie 2016**, bez twierdzenia, że jest to wydanie najnowsze w 2026.

## Zasoby

| Plik | Przeznaczenie |
|---|---|
| `knowledge.json` | 70 zidentyfikowanych i źródłowo opisanych kart (49 norma, 9 wykład, 12 podręcznik) |
| `sources.json` | 4 źródła, metadane wydań, SHA-256, klasy autorytetu |
| `rules.json` | 22 wyprowadzone propozycje kontroli technicznych z linkami do kart |
| `kb.py` | Python + SQLite FTS5: walidacja integralności, wyszukiwanie, cytowanie i kontrola wybranych wejść |
| `index.html` | samodzielna przeglądarka offline; brak telemetrii i zależności zewnętrznych |
| `build_html.py` | synchronizacja osadzonego zbioru danych w przeglądarce po edycji JSON |
| `AUDYT_ODNOSNIKOW_REPO.md` | rozbieżności przypisania numerów równań dokumentacji repo do załącznika |

## Użycie

```bash
cd mv-design-pro/docs/knowledge/iec60909_2016
python kb.py check
python kb.py build
python kb.py ask "jaki cmin w sieci 15 kV?" --source IEC60909_2016
python kb.py validate sample_case.json
python -m unittest discover -s tests -v
```

`index.html` działa bez serwera. Każda karta wskazuje **typ źródła, wydanie, punkt i stronę**. Dla normy lokator uwzględnia stronę drukowaną IEC oraz fizyczną PDF.

## Hierarchia wiarygodności

1. **Norma** `IEC60909_2016`: autorskie parafrazy i odsyłacze; karta nie zawiera pełnego tekstu standardu.
2. **Wykład** `ZDUN2022`: wiedza o obliczeniach sieci SN, zwłaszcza rozpływ niesymetryczny; nie jest IEC 60909.
3. **Podręcznik** `DOLEGA`: układy stacji i wyposażenie; nie zastępuje wymagań ENEA Operator.
4. **Notatka** `QET499`: załączony plik o mylącym tytule „Przykłady schematów EPLAN” opisuje QElectroTech; nie dopuszczono z niego reguł zgodności symboli.

**Przykład normowy:** według tabeli 1 IEC 60909-0:2016 dla napięć powyżej 1 kV do 230 kV, w tym 15 kV: `cmax=1,10`, `cmin=1,00`. Nie przenoś `cmin=0,95` z zakresu nN na SN.

## Kontrakt integracyjny

Docelowy endpoint Q&A powinien zwracać `answer`, `source_id`, `edition`, `record_id`, `clause`, `printed_page`, `pdf_page`, `evidence`, `scope`, `quality/status`. Brak ugruntowanego wyniku = `BRAK_PODSTAWY`. Weryfikator danych w tej wersji **nie** jest uruchamiany w żadnej ścieżce wykonania scenariuszy w systemie; rekord `technical_gate` to propozycja kontroli, nie wykaz wdrożonych guardów.

Baza jest **niekanoniczną warstwą referencyjną**. Kanon pozostaje w `docs/domain/`, `docs/proof/`, `docs/proof_engine/`, dokumentach B-01 i solverze `short_circuit_iec60909.py`. Wszelkie poprawki tam wymagają przeglądu i właściwego procesu B-01.

## Licencje i ograniczenia

**Nie dodawaj pliku PDF normy do repozytorium.** Repo przechowuje identyfikatory, parafrazy i linki do posiadanego legalnie oryginału, nie tekst normy. Pakiet nie jest dowodem pełnego przeglądu wszystkich klauzul, nie waliduje liczbowo istniejącego solvera i nie potwierdza aktualności wydania IEC/PN-EN na 2026.

## Rozszerzenie R2 — 2026-11-03

Do R1 dołączono `extensions_2026_11.json`: **PN-EN 60909-3:2010** (24 karty) oraz **PN-EN 50160:2023-10/A1:2025-04** (18 kart). Baza zawiera łącznie **112 kart, 6 źródeł i 37 reguł**. Skrypt `kb.py` i `build_html.py` odczytują dodatek automatycznie; `index.html` jest odświeżony i zawiera oba nowe źródła.

**Ważne:** PN-EN 60909-3:2010 **nie** opisuje pojedynczego doziemienia w sieci izolowanej/kompensowanej (§1). Załączona A1 do PN-EN 50160 **nie zastępuje** normy bazowej, a jej limity nN (§4) nie są bezpośrednio limitami SN (§5). Wątpliwości i przypisy: [AUDYT_ROZSZERZENIA_R2.md](./AUDYT_ROZSZERZENIA_R2.md).

Reguły 2x1F-Z i EN 50160 są **propozycjami w warstwie wiedzy**, a nie wdrożonymi obliczeniami lub pełnym werdyktem zgodności. Chroniony solver IEC 60909 pozostawiono bez zmian.

Przykładowe zapytania:

```bash
python kb.py ask "podwójne doziemienie" --source IEC60909_3_2010
python kb.py ask "asymetria SN 95%" --source EN50160_A1_2025
```

## Rozszerzenie R3 — 2026-11-03: dobór aparatury i status edycji

**Włączono PN-EN 62271-1:2018-02** jako 56 kart ze wskazaniem § i strony, oraz 22 propozycje reguł. Łączny stan: **168 kart, 7 źródeł, 59 reguł**. Podstawą są osobne pliki rozszerzeń; nie ma kopii licencjonowanych PDF w repo.

- [`extensions_62271_2018.json`](./extensions_62271_2018.json) — karty i reguły aparatury.
- [`NORM_REGISTER_2026_11.json`](./NORM_REGISTER_2026_11.json) — krajowy/IEC status edycji i śledzenie brakujących zmian.
- [`AUDYT_NORM_R3_2026_11.md`](./AUDYT_NORM_R3_2026_11.md) — pogłębiona analiza, pułapki doborowe, mapa norm wyrobu, luki i poziomy dowodów.

**Bramka wersji 2026:** IEC 60909-0:2026 została opublikowana 23.07.2026, ale załączony skan i indeks obejmują PN-EN 60909-0:2016-09. Katalog PKN nadal wskazuje wydanie 2016 bez adnotacji o wycofaniu na dzień 2026-11-03. Nie należy automatycznie uznawać metody 2016 za metodę 2026. Załączona PN-EN 62271-1:2018-02 **nie zawiera A1:2022-06**, która zmienia §6.4.1. Wymagania wyłączników i rozdzielnic uzupełniają normy wyrobu m.in. 62271-100 i 62271-200.

**Uwaga do tablicy 1 62271-1:** przy Ur=17,5 kV występują **dwa warianty** Up: **75/85** lub **95/110 kV** (wspólna izolacja/przerwa izolacyjna); nie koduj jednej pary jako bezwzględnego minimum. Dla Ur=24 kV odpowiednio Up 95/110 albo 125/145 kV. Dla wnętrz normowa wartość IK07 jest preferowana; przy aparaturze napowietrznej bez dodatkowej osłony wymaga się minimum IK10 (§6.14.4, z wyłączeniem izolatorów i przepustów). Dobór zależy od koordynacji izolacji i wymagań OSD.

Przykładowe zapytania:

```bash
python kb.py check
python kb.py build
python -m unittest discover -s tests -v
python build_html.py
python kb.py ask "kiedy należy zastosować 17,5 kV" --source IEC62271_1_2018
python kb.py ask "Ip Ik a prąd wyłączalny" --source IEC62271_1_2018
```

**Status wykonania:** referencyjny indeks i wstępne reguły kontroli wejść; nie jest to pełne API zgodności wyrobu, nie zmienia B-01, SLD ani kontraktów obliczeń. Integracja do produkcyjnego przepływu wymaga osobnej kontroli i odbioru.
