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

## Pytania o wymagania — warstwa dowodowa

Użytkownik może zadać pytanie językiem naturalnym, np. „Czy dopuszczalne są nowe stacje słupowe z kablowym podejściem SN?”. System działa na dwóch źródłach:

1. Zweryfikowane karty wymagań w pliku backend/src/reference_engine/packs/osd_enea/curated_requirements.json: źródło, wersja, numer punktu, numer strony, interpretacja, zakres i data weryfikacji. Nie są kopią treści PDF.
2. Lokalny pełnotekstowy indeks search.sqlite3, kontrolowany sumą SHA-256: zwraca krótkie odniesienia i strony PDF. Nie generuje normatywnego nakazu z trafienia tekstowego.

### API i ograniczenie dostępu

GET /api/reference/enea/pytanie?pytanie=...&data=RRRR-MM-DD

Odpowiedź zawiera status, werdykt (wyłącznie dla zweryfikowanej karty), wyjaśnienie, zakres, numer karty i dokumenty źródłowe z dokładną wersją, stroną PDF i odnośnikiem. Brak indeksu powoduje status BRAK_INDEKSU — nigdy fikcyjny brak przepisu. W przypadku trafienia tylko w pełnotekstowym indeksie wyświetlany jest wynik ZNALEZIONO_FRAGMENTY z informacją o konieczności interpretacji.

Prywatna baza jest domyślnie niedostępna przez API. Dostęp uruchamia wyłącznie administrator serwera, ustawiając ENEA_KNOWLEDGE_ENABLED=1 oraz opcjonalnie ENEA_KNOWLEDGE_DATA_DIR. Na publicznie dostępnym serwerze wymagana jest decyzja o ochronie danych i dostępie do dokumentów. Plików PDF i bazy SQLite nie wolno publikować w repozytorium.

### Sposób użycia

~~~bash
cd mv-design-pro
python scripts/enea_knowledge.py ask "Czy można budować nową stację słupową z kablowym podejściem SN?"
python scripts/enea_knowledge.py ask "Jakie napięcie znamionowe rozdzielnicy SN?" --date 2026-10-23
~~~

W aplikacji: istniejący wybór pakietu referencyjnego ENEA → Dokumenty źródłowe ENEA → Zapytaj o wymaganie ENEA.

### Korzystanie w ChatGPT

Pytanie można zadać bezpośrednio w ChatGPT, bez znajomości dokumentu. Asystent ma wtedy sprawdzać bieżący oficjalny PDF ENEA Operator, a pomocniczo odczytywać zweryfikowane karty dostępne w GitHub. ChatGPT nie ma automatycznego dostępu do prywatnej lokalnej bazy SQLite użytkownika. Jeżeli nie uzyska źródła, nie wolno twierdzić, że sprawdził pełną treść dokumentu.

Format odpowiedzi:
- **Werdykt:** WYMAGANE / DOPUSZCZONE / NIEDOPUSZCZONE / NIEZALECANE / BRAK POTWIERDZENIA W ZBADANYCH ŹRÓDŁACH / WYMAGA WERYFIKACJI.
- **Podstawa:** oficjalny tytuł, wersja, data obowiązywania, numer punktu, numer strony drukowanej i numer strony PDF, aktywny adres źródła.
- **Uzasadnienie:** krótkie streszczenie wymagania i zakres, bez dopowiadania warunków nieistniejących w tekście.
- **Ograniczenia:** data oceny, rodzaj obiektu, inwestycja nowa/przebudowa/eksploatacja, ewentualne odstępstwa.
- **Niepewność:** rozbieżność rewizji, nieczytelność pliku lub niekompletność zasobu → odmowa kategorycznego rozstrzygnięcia.

Zasada bez wyjątków: brak trafienia wyszukiwania nie dowodzi, że w standardach ENEA nie ma takiego wymagania. Norma PN-EN, standard OSD, IRiESD i indywidualne warunki przyłączenia to odrębne podstawy; nie wolno ich mylić.

### Kryteria odbioru pytań

- Nowa stacja słupowa z podejściem kablowym → NIEDOPUSZCZONE, Zeszyt 3, §2, strona 3/14.
- Nowa stacja słupowa bez wskazania podejścia → NIEZALECANE, a nie bezwzględny zakaz.
- Liczba pól SN w kompaktowej stacji prefabrykowanej → 1 pole TR, 2–4 pola liniowe, Zeszyt 1, §4.3.1, s. 12/37.
- Pomiary napięcia i prądu dla pola liniowego w telemechanice → Zeszyt telemechaniki, §6.4.1, s. 14/18.
- Zagadnienie poza kartami i bez lokalnej kopii PDF → BRAK_INDEKSU oraz oficjalne dokumenty sugerowane do weryfikacji.
- Data wcześniejsza niż wejście standardu w życie → brak stosowania karty jako obowiązującej w tamtej dacie.
