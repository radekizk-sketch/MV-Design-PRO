# MV-DESIGN-PRO — baza wiedzy PN-EN 60909-0:2016 (R1)

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
