# MV-DESIGN PRO — baza wiedzy ENEA Operator

**Stan inwentaryzacji:** 23.10.2026. **Status wdrożenia:** katalog źródeł + lokalny pobór i indeks + podgląd w istniejącym Reference Engine. **Nie oznacza** pełnego audytu wszystkich wymagań ani akceptacji ich automatycznego egzekwowania.

## Kanon i przeznaczenie

Źródło metadanych: `backend/src/reference_engine/packs/osd_enea/source_catalog.json`. Jeden pakiet `osd_enea` pozostaje źródłem referencji OSD; nie powstaje drugi silnik walidacji, alternatywny ENM, nowy solver ani replika SLD.

Urzędowy indeks: https://www.operator.enea.pl/uslugi-dystrybucyjne/instrukcje-i-standardy/standardy-w-sieci-dystrybucji

IRiESD: https://www.operator.enea.pl/uslugi-dystrybucyjne/iriesd

Katalog zawiera 25 pozycji standardów oraz 2 dokumenty IRiESD: tekst ujednolicony od 19.10.2026 i kartę 45/2026. Historyczny standard linii 110 kV zachowano z końcem obowiązywania 30.09.2026. Osobne karty aktualizacji IRiESD i formularze profilowe znajdują się w oficjalnym indeksie; **nie są jeszcze osobno skatalogowane**. Nie wolno utożsamiać tej liczby z kompletnym zasobem wszystkich dokumentów ENEA Operator.

## Obsługa

W katalogu `mv-design-pro`:

```bash
python scripts/enea_knowledge.py catalog
python scripts/enea_knowledge.py sync
python scripts/enea_knowledge.py sync --id ENEA-SN-KAB
python scripts/enea_knowledge.py search "żyły powrotne"
python scripts/enea_knowledge.py status
python scripts/enea_knowledge.py index
```

Domyślny prywatny magazyn: `~/.local/share/mv-design-pro/enea-knowledge/`. Można użyć `--data-dir /inna/sciezka` **przed** nazwą polecenia. Do pozyskania tekstu używany jest `pdftotext` (poppler), a przy jego braku PyMuPDF. Skany bez warstwy tekstowej nie są indeksowane i otrzymują jawny błąd — nie uruchamia się niezweryfikowanego OCR. Wyszukiwanie SQLite FTS5 zwraca identyfikator dokumentu, numer strony PDF, fragment oraz adres źródła.

Pobranie sieciowe wymaga dostępu do `www.operator.enea.pl`. Pliki PDF są pobierane **na komputer uruchamiający skrypt**, z weryfikacją nagłówka PDF i SHA-256. Każda zmiana odnośnika w oficjalnym wykazie jest sygnalizowana. Zmiana sumy SHA-256 powoduje zapis nowego PDF do katalogu `do_weryfikacji/` bez nadpisania wcześniej zaakceptowanej kopii; wymaga to ręcznej kontroli nowej wersji źródła. Indeks nie jest przesyłany do zewnętrznej usługi AI.

## Integracja z aplikacją

Istniejące trasy (bez nowego cyklu życia API):

- `GET /api/reference/packs` — lista pakietów, odnośniki ENEA w `source_document_refs`.
- `GET /api/reference/packs/osd_enea` — dotychczasowe reguły i nowe, **wyłącznie informacyjne** `source_catalog`.
- W istniejącym wyborze pakietów po wybraniu `osd_enea` pojawia się „Dokumenty źródłowe ENEA”, z grupami: sieć SN, sieć nN, GPZ — kontekst, IRiESD.

Pełnotekstowy lokalny indeks SQLite nie jest obecnie dostępny przez API serwera. Nie ma wdrożonego sterowania automatycznym pobieraniem z interfejsu — jest to świadoma granica uprawnień i ochrony dokumentów.

## Granice techniczne

- **SN jako domena projektowa.** WN/110 kV służy jedynie jako kontekst źródła GPZ oraz parametrów granicznych; bez rozbudowy modułu projektowania WN.
- Powiązanie dokumentu z modułem jest informacyjne. Dla automatycznej reguły potrzebne są: `rule_id`, wersja źródła, punkt i strona, zakres zastosowania, rodzaj wymagania, dane ENM/katalogu, warunki ocenialności, sposób rozstrzygnięcia, wynik walidacji i testy pozytywne/negatywne.
- Pozostałe 21 standardów poza wcześniejszymi czterema (Z1–Z3 SN i telemechanika) **nie uzyskały statusu zweryfikowanych reguł** w tym zadaniu. Pakiet zachowuje dotychczasowy zbiór reguł; nowe nie są fikcyjnie oznaczane jako `implemented=true`.
- PN-EN/IEC, N SEP i PTPiREE są odrębnymi dokumentami z osobnymi licencjami. Baza nie przechowuje pełnych tekstów tych norm.
- ENEA zastrzega prawa autorskie do opublikowanych PDF. Dlatego repozytorium przechowuje tylko metadane, wskaźniki źródeł i wyniki własnej analizy. **Nie dodawać PDF, tekstów całych norm ani prywatnej bazy SQLite do repozytorium.**

## Kryteria odbioru

1. Dla 25 standardów istnieją stabilne identyfikatory i daty ze strony operatora; adresy są powiązane z publicznym wykazem; każdy nowy odsyłacz wymaga sprawdzenia wersji.
2. Metadane są dostępne na istniejącej trasie API i w istniejącym wyborze pakietów referencyjnych.
3. Pobieranie i indeks nie przenoszą treści do repozytorium; plik ma sumę SHA-256, a wynik wyszukiwania numer strony PDF.
4. Wszystkie testy offline przechodzą. Dla pełnego odbioru E2E należy dodatkowo uruchomić `sync` w środowisku z siecią, porównać liczbę udanych pobrań i zaindeksowanych stron, wykonać test UI w przeglądarce i sprawdzić prawa do lokalnego przechowywania kopii.

## Ustalenie krytyczne: rewizja Z1

W istniejącym `docs/audit/REFERENCE_ENGINE_RESEARCH_OSD_ENEA_2026-07-17.md` opisano Z1 w wersji **09.2021-2 (od 02.04.2024)**. Oficjalny indeks operatora odsyła jednak obecnie do **Z1 wersji 06.2024 obowiązującej od 01.01.2025** (plik ENEA media/683, str. 1/37). Zgodność pojedynczych wymagań (np. pola TR i 2–4 pola liniowe w §4.3.1, s. 12, parametry 24 kV / 630 A / 16 kA w §4.3.2) została zaobserwowana, ale nie jest pełnym audytem porównawczym. Przed uznaniem pakietu za aktualną podstawę bezwarunkowego zatwierdzania projektu należy zweryfikować **wszystkie zaimplementowane reguły** wobec pełnej wersji Z1 i innych zmienionych standardów. Nie przypisuj aktualności reguły na podstawie samego statusu pakietu.
