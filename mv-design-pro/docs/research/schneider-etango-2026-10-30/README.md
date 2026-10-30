# Schneider × e²TANGO/e²YANKEE — pakiet badawczy dla Opusa

**Data odniesienia:** 2026-10-30  
**Status:** RESEARCH / DO DECYZJI OPU­SA, NIE IMPLEMENTACJA, NIE WERDYKT ENEA/IEC, NIE B-02  
**Produkt:** MV-DESIGN-PRO — środowisko modelowania, obliczeń, symulacji i projektowania sieci SN; **NIE SCADA i NIE system sterowania obiektem**.  
**Mandat:** GPT-6 zbiera źródła, ustalenia, luki i hipotezy; **Claude Opus decyduje, co przyjmuje, odrzuca i w jakim zakresie**. Ostatnie zatwierdzenie wyglądu SLD = właściciel, bramka B-02.

## 0. ZASADA, KTÓREJ NIE WOLNO PRZEOCZYĆ

- **e²TANGO** (sterowniki polowe, ekran synoptyki) = **preferencja estetyczna właściciela**: techniczny minimalizm, cienkie precyzyjne kreski, ciemne tło, zwarte symbole, brak ozdobników i wielkich kafli. To jest kierunek wizualny — nie przenosimy hardware'u, zdalnego sterowania ani praw vendorowych.
- **e²YANKEE** (SCADA Elektrometal) = dodatkowy **dowód języka prezentacji stanu** (czerwony zamknięty, zielony otwarty, żółty znak „?” przy braku wiedzy), oraz hierarchii widok stacji → widok pola. Nie kopiujemy pulpitu dyspozytora do produktu.
- **Schneider EcoStruxure Power Operation** = **wzorce semantyczne i komponentowe**: oddzielenie stanu wyłącznika, pozycji członu, uziemnika, trip, jakości danych; prymitywy wtyk–gniazdo, biblioteki małe/duże; walidacja połączeń. To nie jest nakaz kopiowania TGML ani platformy SCADA.
- **ENEA + IEC** = punkt odniesienia poprawności aparatów, schematów i przyłączeń. Ostateczny kształt wymaga dowodu z autoryzowanego źródła, a nie deklaracji zgodności w komentarzu SVG.

## 1. Dostarczone dokumenty

1. [SCHNEIDER_ANALIZA_TECHNICZNA.md](SCHNEIDER_ANALIZA_TECHNICZNA.md) — pochodzenie komponentów, stanów, własności, źródeł, reguł sieciowych, ograniczeń i rozbieżności w dokumentacji.
2. [ETANGO_ANALIZA_WIZUALNA.md](ETANGO_ANALIZA_WIZUALNA.md) — źródła Elektrometal, analiza ekranów, zasady eleganckiego SLD, kształt członu wysuwnego, czego NIE kopiować.
3. [MACIERZ_DECYZJI_I_TESTY.md](MACIERZ_DECYZJI_I_TESTY.md) — mapa kandydatów, warianty A/B/C, inwarianty modelu obliczeniowego, przypadki odbiorowe, kryteria wizualne i dowodowe.
4. [REJESTR_ZRODEL.md](REJESTR_ZRODEL.md) — oficjalne URL, daty, ranga i ograniczenia każdego dowodu.
5. [OPUS_HANDOFF.md](OPUS_HANDOFF.md) — kontrakt decyzyjny dla Opusa; bez mikrozarządzania implementacją i bez narzucania wyboru.

## 2. Werdykt badawczy bez przesądzania decyzji Opusa

| Obszar | Fakt | Granica |
|---|---|---|
| Schneider IEC | Biblioteka zawiera `PLS_IEC_BASE_1/2`, `PLS_IEC_CB_1/2`, pary plug/socket dla członu wysuwnego oraz kompozycje feeder/incomer/no-earth | **Nie mamy oryginalnych ścieżek wektorowych**, tylko udokumentowane nazwy i funkcje |
| Schneider DPS | Dwa sygnały położenia dają intermediate/open/closed/error | Nie wolno automatycznie mapować braku łączności na „open” |
| Schneider racking | `BkrRkdPos` deklaruje in/test/out (0/2/1), uproszczony `RkdPosCond` tylko in/out | **Rzeczywista niezgodność poziomów abstrakcji** — nie kopiować kodów 1:1 |
| Elektrometal e²TANGO | Karta katalogowa wskazuje 55 **schematów synoptycznych**, nie 55 symboli; 5 ekranów do konfiguracji | Nie dowodzi dostępu do edytowalnej biblioteki 55 ikon |
| Elektrometal e²YANKEE | Literatura opisuje kolory czerwony/zielony/żółty ? i stan rozbrojonego napędu | Nie stanowi obowiązującego standardu ENEA |
| Repo MV-DESIGN-PRO | `cb_drawout.svg` istnieje, ale kształt obwiedni i trzech kresek nie ma tu zweryfikowanego uzasadnienia IEC/ENEA | Deklaracja `✅ OK` w tabeli parity oznacza w tym repo obecność pliku/portów, **nie certyfikację normową** |

## 3. Granice i zakazy przeniesienia

**Nie budujemy:** akwizycji online, driverów, RTU, telemechaniki produkcyjnej, systemu uprawnień operatorskich SCADA, rzeczywistych poleceń załącz/wyłącz, alarmowania SMS, rozkazu SBO, ekranu lokalnego sterownika z przyciskami fizycznymi, infrastruktury redundancji SCADA.

**Budujemy lub sprawdzamy wyłącznie jako kandydaty:** model stanów projektowych i scenariuszowych; symulację łączeń bez oddziaływania na realne urządzenia; zgodność topologii i dostępność ścieżki; obliczenia LF/SC/protection wynikające z ENM; wyróżnianie wyniku nieważnego i warunków nieznanych; deterministyczny SLD; elegancki wygląd i druk.

**Nie wykonano:** instalacji ani reverse engineering e²TANGO-Studio; pozyskania TGML Schneider; odtworzenia piksel po pikselu wszystkich ekranów; audytu licencji pakietu vendor; produkcyjnych zmian kodu; testów e2e; certyfikacji IEC 60617; decyzji B-02. Żaden z tych punktów nie jest domyślnie „zrobiony”.

## 4. Kontekst repo do przeczytania przez Opusa (w kolejności kanonicznej)

- `CLAUDE.md`, `mv-design-pro/STAN_REPO.md` i aktualne `mv-design-pro/PLANS.md` — **mogą być świeższe niż dokument badawczy**.
- `mv-design-pro/docs/architecture/PRODUCT_CAPABILITY_CONSTITUTION.md`.
- `mv-design-pro/docs/sld/SLD_CAD_SPEC_V3.md`.
- `mv-design-pro/docs/sld/SLD_SYMBOL_LIBRARY.md`, `SLD_IEC_60617_PARITY.md` — **sprawdzić rozbieżności starych specyfikacji**, nie traktować deklaracji jako dowodu.
- `mv-design-pro/frontend/src/ui/sld/v3/{symbols,scene,canvas,theme}/` — rzeczywista ścieżka produkcyjna.
- `mv-design-pro/frontend/src/ui/sld/canonical_symbols/cb_drawout.svg`, `ports.json` — stary SVG jako punkt audytu, **nie wzorzec do skopiowania**.
- Dokumentacja `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md`, jeśli dostępna na aktywnej gałęzi roboczej. W **main** pliku tego nie znaleziono (2026-10-30); **nie zakładać, że nie istnieje w worktree/innym branchu**.

## 5. Znane konflikty źródeł prawdy

1. Starszy `SLD_SYMBOL_LIBRARY.md`: zamknięty = zielony, otwarty = czerwony; aktualny kierunek użytkownika i przykład e²YANKEE: zamknięty = czerwony, otwarty = zielony. **Nie przemalowywać w ciemno**; Opus sprawdza aktywny renderer/tokeny/stany i wybiera jeden kontrakt.
2. Starsze parity „IEC 60617-4-30” przy `cb_drawout.svg` i `✅ OK` **nie są potwierdzeniem wzrokowej zgodności**.
3. Spec SLD bywa opisana „CAD/SCADA”, ale **produkt nadrzędny jest obliczeniowo-symulacyjny**. Rozróżniać stylistykę SCADA i funkcję SCADA.
4. Osobne linie e²YANKEE vs e²TANGO — różne produkty. Wygląd ekranu sterownika e²TANGO ≠ cały ekran SCADA e²YANKEE.
5. Dokumentacja Schneider 2024 CU3 (styczeń 2026) zawiera w historii sformułowanie „2024 CU6” mimo starszego rozdziału 2022 CU6; to należy traktować jako **niejasność historii wydania**, nie fakt instalacyjny.

## 6. Model współpracy

Pakiet jest **materiałem wejściowym**, nie nakazem wdrożenia. Opus:
1. niezależnie czyta źródła i stan aktualnej gałęzi;
2. wybiera: PRZYJĄĆ / ZMODYFIKOWAĆ / ODRZUCIĆ / BRAK DOWODU dla każdej propozycji;
3. przyjmuje minimalny zakres zmian odpowiadający realnej luce, bez przebudowy całego systemu;
4. projektuje odbiór inżynierski, wizualny, semantyczny i fizyczny;
5. nie przekracza B-01/B-02.

**Nie importować cudzej grafiki do repo bez weryfikacji licencji.** Inspiracja to nie równoznaczność plików.
