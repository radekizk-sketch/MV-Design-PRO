# AUDYT BRAMEK WYJŚCIA FAZ U2–U5 (Program UI/UX) — faza 1: audyt dokumentacyjno-kodowy

**Data:** 2026-08-05
**Baza pomiarowa:** gałąź `claude/przejecie-nadzoru-fable-dtie3b`, szczyt
`4a6ae8374cd7f37cc73a0e292159095fe775ead7` (`docs(10x): decyzja wlasciciela — os wdrazalnosci wycofana, localhost-only`)
**Status dokumentu:** AUDYT (materiał wejściowy do decyzji o zamknięciu faz) —
nie zmienia kanonu, nie zmienia programu, nie zamyka żadnej fazy samodzielnie.
**Zakres:** bramki wyjścia (DoD) faz **U2, U3, U4, U5** z `PROGRAM_UIUX_2026-07.md` §8.
Fazy U0 i U1 są zamknięte i nie są przedmiotem tego audytu.

## 0. Metoda i jej granice

1. **Cytat kryterium.** Dla każdej fazy przepisano DOSŁOWNIE treść kolumny
   „DoD (bramka wyjścia)" z tabeli §8 programu.
2. **Rozbicie na warunki cząstkowe.** Kryterium rozłożono na warunki, które da się
   niezależnie sprawdzić (jeden warunek = jedno zdanie sprawdzalne).
3. **Dowód.** Dla każdego warunku szukano dowodu w trzech źródłach, w tej kolejności:
   (a) **kod i testy** żywego repozytorium (listing katalogów, `grep`, liczba plików
   i przypadków testowych — nigdy domysł),
   (b) **wpis rejestru** `docs/v12xx/REJESTR_KONFLIKTOW.md` (V12K-NNN),
   (c) **dokument wiążący** programu.
   Gdy dowód z (b)/(c) rozjeżdżał się z (a), **wygrywa kod** — zgodnie z metodą
   weryfikacji rejestru FLOW z 2026-07-28 („stan sprawdzony w KODZIE, nie w dokumencie").
4. **Werdykt warunku:** SPEŁNIONY / NIESPEŁNIONY / NIEWERYFIKOWALNY DOKUMENTACYJNIE
   (wymaga oględzin żywej aplikacji — z opisem, jak zweryfikować w fazie 2).
5. **Granica metody.** Audyt czyta artefakty: kod, testy, konfigurację CI, dokumenty.
   NIE uruchamiał aplikacji, NIE uruchamiał pełnej regresji ani zestawu e2e (w tym
   worktree brak zależności backendu — `python3 -c "import networkx"` kończy się
   `ModuleNotFoundError`, więc strażniki importujące backend nie są tu wykonalne).
   Wszystko, co wymaga zobaczenia ekranu, jest jawnie oznaczone jako pozycja fazy 2.

### 0.1 Źródła

| Rola | Plik |
|---|---|
| Kryteria faz (przedmiot audytu) | `docs/uiux/PROGRAM_UIUX_2026-07.md` §8 (+ §4, §6, §10) |
| Wiążący inwentarz zdolności | `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md` (rewizje 2026-07-20, 2026-07-25) |
| Kanon UX etapów pracy | `docs/uiux/FLOW_PROJEKTANTA_2026-07.md` (E1–E8, kontrakt ekranu prowadzącego) |
| Rejestr decyzji i konfliktów | `docs/v12xx/REJESTR_KONFLIKTOW.md` |
| Parytet mostów legacy (trasa po trasie) | `docs/uiux/INWENTARZ_PARYTETU_MOSTOW_2026-07.md` |
| Plan wygaszania mostu wyników | `docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md` |
| Rejestr mostu w kodzie | `frontend/src/ui2/legacy/legacyRegistry.ts` |
| Powierzchnia produkcyjna | `frontend/src/ui2/**`, `frontend/src/ui/**`, `frontend/e2e/**`, `.github/workflows/**` |

### 0.2 Pomiar bazowy (liczby ze szczytu gałęzi)

| Wielkość | Pomiar | Sposób pomiaru |
|---|---:|---|
| Rejestr konfliktów — wiersze | 316 | wiersze tabeli pasujące do `^\|\s*\**V12K-\d+` |
| Rejestr — unikalne identyfikatory / ostatni | 313 / **V12K-322** | brakujące numery: 16–20, 185, 214, 215, 221 |
| Macierz pokrycia (inwentarz §6) — wiersze | 45 | 12 ✅ · **33 ◐** · 0 ❌ |
| Przestrzenie robocze nowej powłoki | 7 | `ls frontend/src/ui2/spaces/` |
| Kreatory nowej powłoki | 21 | `ls frontend/src/ui2/kreatory/` |
| Moduły wyników nowej powłoki | 17 (+`wzorzec`) | `ls frontend/src/ui2/wyniki/` |
| Moduły strumienia OZE | 12 | `ls frontend/src/ui2/oze/` |
| Katalogi warstwy zastanej `ui/` | 57 katalogów + 3 pliki | `ls frontend/src/ui/` |
| Pliki testów Vitest (razem / w `ui2/`) | 799 / 241 | `find src -name "*.test.ts*"` |
| Przypadki `it(`/`test(` (razem / w `ui2/`) | 9473 / 2557 | `grep -rhoE "^\s*(it\|test)\("` |
| Specyfikacje e2e Playwright | 73 | `ls frontend/e2e/*.spec.ts` |
| Workflow CI | 8 | `ls .github/workflows/*.yml` |
| Skrypty strażników | 93 | `ls mv-design-pro/scripts/*.py` |

**Strażniki uruchomione lokalnie na bazie (exit code):** `docs_guard` 0 ·
`utf8_mojibake_guard` 0 (4569 plików) · `readiness_codes_guard` 0 (99 kodów) ·
`catalog_binding_guard` 0 · `catalog_gate_guard` 0 · `ui_no_physics_guard` 0 ·
`dead_click_guard` 0 · `ui_terminology_guard` 0 · `forbidden_ui_terms_guard` 0 ·
`no_codenames_guard` 0 · `v12xx_canon_guard` 0.
`catalog_enforcement_guard` — **nie do uruchomienia w tym worktree** (importuje
warstwę backendu; brak `networkx`); ostatni udokumentowany bieg pełnej tablicy:
V12K-322 (43 kroki P0 RC=0).

**Ostatni udokumentowany bieg pełnych bramek (V12K-321/322):** pytest 8168 passed /
11 skipped, Vitest 804 pliki / 10 435 passed RC=0, type-check RC=0, lint RC=0,
43 kroki P0 RC=0.

---

## 1. FAZA U2 — Model i dane (E3, E4, E5, E6)

### 1.1 Kryterium DoD (cytat dosłowny, `PROGRAM_UIUX_2026-07.md` §8)

> **U2 Model i dane** | E3, E4, E5, E6 | kreator od GPZ do DER przechodzi e2e; katalog-first wymuszony w UI; readiness czytelny

### 1.2 Warunki cząstkowe i dowody

| # | Warunek | Dowód | Werdykt |
|---|---|---|---|
| U2-1 | Kreatory całego łańcucha budowy (źródło GPZ → magistrala → stacja → pole → DER) istnieją w nowej powłoce i nie ma równoległych formularzy zastanych | `frontend/src/ui2/kreatory/` = 21 kreatorów (`zrodlo`, `magistrala`, `stacja`, `pole`, `pole-nn`, `transformator`, `zrodlo-oze`, `zrodlo-dyspozycyjne`, `lacznik`, `pierscien`, `odgalezienie`, `slup-odgalezny`, `odbior`, `kompensator`, `ogranicznik`, `przekaznik`, `pomiar`, `zksn`, `przypisanie-katalogu`, `edycja-parametrow`, `rama`); `ls frontend/src/ui/network-build/forms/` nie zawiera już ŻADNEGO komponentu formularza (same pomocniki/API/walidatory). Rejestr: V12K-042 (framework `kreatory/rama`), V12K-126 (wygaszenie 10 ostatnich formularzy zastanych), V12K-279 (kreator OZE „opcja MAX"), V12K-283 (kreator stacji „opcja MAX"), V12K-276 (trzy kreatory-wyspy wpięte do menu kanwy) | **SPEŁNIONY** |
| U2-2 | Istnieje specyfikacja e2e obejmująca łańcuch od GPZ do DER na realnym backendzie | `frontend/e2e/industrial-template-mass-flow.spec.ts:244` — „pełny przepływ przemysłowy: 50 szablonów stacji, OZE, analizy, dowody i eksporty" (asercja `enm.generators.length > 0` w :312, weryfikacja UI w :484–487); `frontend/e2e/kreator-oze-max.spec.ts` (K9-A: aparatura + zgodność w jednym przepływie); `frontend/e2e/critical-der-config.spec.ts` (paleta PV → stacja → zapis → generator w ENM); `frontend/e2e/kreator-stacji-max.spec.ts` (2 testy, w tym ścieżka „od zera") | **SPEŁNIONY** |
| U2-3 | Ten łańcuch jest BRAMKĄ — biegnie w CI przy każdym push/PR | `.github/workflows/frontend-e2e-smoke.yml` uruchamia **2 z 73** specyfikacji: `e2e/critical-run-flow.spec.ts` (tytuł: „case -> GPZ -> trunk -> station -> branch -> katalogi -> readiness -> run -> wyniki -> SLD -> uzasadnienie -> geometria bez zmian" — **bez kroku DER**, `grep` na `add_converter_source`/`generator` w tym pliku = 0 trafień) oraz `e2e/kd11-tozsamosc-etykiet.spec.ts`. Specyfikacje z U2-2 nie są w żadnym workflow | **NIESPEŁNIONY** — łańcuch GPZ→DER przechodzi tylko lokalnie; regresja tego łańcucha jest niewykrywalna w CI |
| U2-4 | Katalog-first wymuszony w formularzach (UI blokuje wstawienie bez wiązania katalogowego) | `frontend/e2e/catalog-enforcement.spec.ts` — 8 testów, w tym „formularz lacznika sekcyjnego blokuje wstawienie bez katalogu"; strażniki `catalog_binding_guard` (RC=0), `catalog_gate_guard` (RC=0). Rejestr: V12K-047/048/049/053 (fala katalog-first), V12K-283 (koniec cichego podstawiania typu wyłącznika w operacjach stacyjnych) | **SPEŁNIONY** |
| U2-5 | Katalog-first wymuszony po stronie API dla CAŁEJ klasy operacji (nie punktowo) | `backend/src/api/domain_ops_policy.py:472` `API_CATALOG_GATE_INVENTORY` — **65 pozycji** (`grep -c "PozycjaBramyApi("`); rejestr V12K-317 tor U1 (inwentarz klasy: 60 bramkowanych + 5 jawnie niebramkowanych z uzasadnieniem; znaleziska spoza długu: cicho ignorowany ref przełącznika zaczepów, rozjazd kolejności kanałów `catalog_binding`/`catalog_ref`), V12K-307 (połknięty błąd materializacji katalogu w `append_station_on_endpoint` dający +22,5% Ik″ bez sygnału), V12K-315/316 (domknięcie klasy bramy) | **SPEŁNIONY** |
| U2-6 | E4: przeglądarka katalogu w nowej powłoce z parytetem kategorii wobec mostu | `frontend/src/ui2/spaces/model/katalog/` (`KatalogPanel`, `KartaTechniczna`, `GdzieUzyty`, `ParametrRow`, `parametryDefinicje`); `adapters/katalogAdapter.ts:57` `KATEGORIE` = **9 kategorii** (`LINIA`, `KABEL`, `TRANSFORMATOR`, `APARAT`, `FALOWNIK`, `CT`, `VT`, `KABEL_NN`, `APARAT_NN`) przypięte testem `__tests__/katalogAdapter.test.ts:18`; luka L-16 inwentarza parytetu **zamknięta w kodzie** (karta KD-3, V12K-292) | **SPEŁNIONY** (z zastrzeżeniem: dokumentacja opisuje stan sprzed naprawy — patrz luka **G-06**) |
| U2-7 | E5: dane i topologia w nowej powłoce (drzewo, właściwości, diagnostyka modelu) | `frontend/src/ui2/spaces/model/ModelWarsztat.tsx:34-38` — 5 zakładek: `schemat`, `wlasciwosci` (`WlasciwosciModelu`), `szablony` (`PrzegladarkaSzablonow`, `PorownanieSzablonow`), `katalog`, `diagnostyka` (tryb ekspercki → `EnmInspectorPage`); drzewo topologii zasilane przez `ui2/nav/useZasilanieDrzewaTopologii` (KD-1: `useTopologyStore.loadSummary` nie miał wcześniej ŻADNEGO wołającego produkcyjnego — drzewo było zawsze puste); inspektor właściwości: `ui2/inspector/` (w tym `SekcjaPetlaZwarcia`) | **SPEŁNIONY** |
| U2-8 | E6: jeden kanoniczny rejestr kodów gotowości z konsumentem runtime | `backend/src/api/readiness_registry.py` (`GET /api/readiness/registry`); `python3 scripts/readiness_codes_guard.py` → „OK (99 codes, 24 required codes present)" RC=0; rejestr: V12K-206 (rejestr + luki), V12K-321 (99 kodów po dołożeniu dwóch kodów certyfikatu), V12K-319 tor X4 (strażnik przepisany z wyrażeń regularnych na walidację ŻYWEGO rejestru, kontrola duplikatów kluczy przez AST) | **SPEŁNIONY** |
| U2-9 | E6: panel gotowości czytelny — braki wg celów, akcje naprawcze, jawny następny krok | `frontend/src/ui2/spaces/gotowosc/` (`PanelGotowosci`, `SekcjaCelu`, `WierszProblemu`, `grupowanieCelow.ts`, `filtry.ts`, `SekcjaZgodnosciReferencyjnej`); FLOW §3 wiersz F-E3 („następny krok" przy zielonej bramce → Obliczenia) ✅ 2026-07-18; e2e `gotowosc-jedna-prawda.spec.ts`, `gotowosc-po-biegu.spec.ts`, `stany-zerowe-akcje.spec.ts` | **SPEŁNIONY** dokumentacyjnie; **czytelność** = pozycja fazy 2 (patrz F2-1) |
| U2-10 | E6: JEDNA prawda gotowości — chrom, kafle i drzewo nie pokazują innego stanu niż model | Historia napraw tej właśnie klasy: V12K-286 (H-6: `readinessLiveStore` z `ready:true` z definicji, odświeżanie nigdy nie wołane), V12K-289 (KD-1: ten sam store czytany przez 4 moduły — liczniki blokad zawsze zerowe), V12K-309 (wczytanie migawki przebiegu wpisywało literał `ready:true/blockers:[]`), V12K-319 tor X3 (czterech czytelników w `ui/network-build` pokazywało zieleń przy gotowości NIEUSTALONEJ; czwartego znalazł dopiero test strukturalny) | **SPEŁNIONY** dla `ui/network-build` i chromu powłoki; **NIESPEŁNIONY dla reszty**: V12K-319 dług nazwany poz. 4 — „pozostałe cztery łagodniejsze fałszywe zera leżą POZA `ui/network-build`, inwentarz do osobnej karty" |
| U2-11 | Reguła konsolidacji §6 programu: stary moduł znika w tym samym PR, w którym nowy przejmuje jego funkcję (zero bytów równoległych) | Pomiar (`grep` importów spoza własnego katalogu, bez testów): **zero konsumentów produkcyjnych** mają `ui/project-archive`, `ui/voltage-profile`, `ui/power-distribution`, `ui/data-manager`, `ui/schema-completeness`, `ui/mode-gate`, `ui/protection-comparison`, `ui/reference-patterns`; `ui/issue-panel` osiągalny wyłącznie przez re-eksport w `ui/index.ts` | **NIESPEŁNIONY** — 8–9 modułów zastanych bez konsumenta nadal w drzewie (luka **G-07**) |

### 1.3 Werdykt fazy U2

**LUKI** — 8 z 11 warunków spełnionych (U2-1, U2-2, U2-4…U2-9 spełnione; U2-3, U2-10, U2-11 niespełnione).

Merytoryczny rdzeń fazy (kreatory od GPZ do DER, katalog-first w UI i w API, czytelna
gotowość z kanonicznym rejestrem kodów) jest **dostarczony i pokryty testami**. Blokują
zamknięcie trzy rzeczy proceduralne, nie funkcjonalne: brak bramki CI dla łańcucha
GPZ→DER, nierozliczony inwentarz „fałszywych zer" poza `ui/network-build` oraz
niewykonana kasacja modułów zastanych bez konsumenta.

---

## 2. FAZA U3 — Obliczenia i wyniki (E7, E8, E9)

### 2.1 Kryterium DoD (cytat dosłowny)

> **U3 Obliczenia i wyniki** | E7, E8, E9 | każda analiza z inwentarza uruchamialna i czytelna z UI; każdy wynik → ślad → dowód

### 2.2 Warunki cząstkowe i dowody

| # | Warunek | Dowód | Werdykt |
|---|---|---|---|
| U3-1 | E7: przypadki obliczeniowe, przebiegi i scenariusze zwarciowe obsługiwane w nowej powłoce | `frontend/src/ui2/spaces/obliczenia/` — `MenedzerPrzypadkow`, `NowyPrzypadek`, `KartaPrzypadku`, `PorownanieKonfiguracji`, `UruchomObliczenie`, `przebiegi/`, `scenariusze/`; `legacyRegistry.ts` wpis `obliczenia` = `nowa-powloka` („zrealizowane w U2 w całości; most `RunHistoryPanel` usunięty"); luka parytetu L-7 (scenariusze zwarciowe) zamknięta w KD-4 | **SPEŁNIONY** |
| U3-2 | E8: każda zdolność obliczeniowa ma powierzchnię w nowej powłoce (jest z czego ją URUCHOMIĆ i gdzie PRZECZYTAĆ) | `ui2/spaces/wyniki/WynikiWarsztat.tsx:62-90` — **29 zakładek** w dwóch grupach (analizy: werdykt, co wymaga uwagi, rozpływ, regulacja OLTC, zbieżność, zwarcia, koordynacja, składowe, dowód, jakość, porównanie, odbiór, estymacja, stan fazowy, SSCI, stabilność, pozostałe; OZE: NC RfG, pulpit, zdolność, ranking, krzywe, obszar, studium, FRT, OSD, kompensacja, wniosek, LoM) | **SPEŁNIONY W WIĘKSZOŚCI** — wyjątki w U3-3 |
| U3-3 | …bez wyjątków (żadna zdolność z inwentarza §1–§2 nie została bez powierzchni) | Pomiar `grep` w `frontend/src/ui2`: **wrażliwość rozpływu (A6 `lf_sensitivity`) i analiza wrażliwości (A17 `sensitivity`)** — brak ekranu; jedyne trafienia „wrażliwość" to sekcja wrażliwości wyniku cieplnego (`ui2/wyniki/jakosc/PanelDowoduCieplnego.tsx:197`) i wykres OLTC — to inna zdolność. Zastany `ui/sensitivity/` USUNIĘTY 2026-07-18 (W5b-2/W5b-3: stub bez obliczeń + fizyka w prezentacji), zamiennika nie zbudowano. **Import XLSX** — `grep -ril xlsx frontend/src/ui2` = **0 plików**, a w `ui/` 11 trafień to WYŁĄCZNIE nazwy pól kontraktu (`analysisRunContract.ts`, `contracts/shared.ts`, kontrakty kreatora stacji), nie powierzchnia importu — mimo wpiętego routera `xlsx_import`. **Rozpływ niesymetryczny (S6)** — solver istnieje, ale `grep` w `backend/src/api` i `backend/src/application` daje wyłącznie metadane sieci referencyjnych; brak ścieżki uruchomienia. **Rekomendacje (A13)**, **pokrycie analizami (A3)**, **granice (A2)** — bez dedykowanej powierzchni w `ui2` | **NIESPEŁNIONY** — co najmniej 3 zdolności bez ścieżki uruchomienia/odczytu (wrażliwość, import XLSX, rozpływ niesymetryczny) + 3 bez dedykowanego widoku |
| U3-4 | Wzorzec „ekran analizy = werdykt + wartości + założenia + ślad" faktycznie użyty przez ekrany wyników | `ui2/wyniki/wzorzec/` (`EkranAnalizy`, `TabelaWynikow`, `SekcjaZalozen`, `SladWywodu`, `SladSekcyjny`, `akcjeNaprawcze.ts`, `usePoprawWModelu.ts`); pomiar: **16 z 17** modułów `ui2/wyniki/*` importuje `wzorzec` — jedyny bez niego to `koordynacja` | **SPEŁNIONY** (16/17) |
| U3-5 | Z KAŻDEGO wyniku prowadzi droga do śladu WHITE BOX i dowodu | `WynikiWarsztat.tsx` przekazuje `onOtworzDowod` do: rozpływ (:314), zwarcia (:329), jakość (:346), odbiór (:350), estymacja (:353); własne wejścia w ślad mają: składowe, stabilność, stan fazowy, porównanie (dowód kolumny A i B), OLTC (`EkranBadanOltc.tsx:245,304,383` — `SladWywodu` w trzech miejscach), zbieżność (`EkranZbieznosci.tsx:84,111` — ślad solvera + pętla OLTC). **Bez żadnego wejścia w ślad/dowód:** `koordynacja` (zabezpieczenia), `ssci`, `werdykt`, `co-wymaga-uwagi` (`grep` na `SladWywodu\|SladSekcyjny\|onOtworzDowod\|dowod` = 0 trafień produkcyjnych) | **NIESPEŁNIONY** — 4 ekrany bez drogi do dowodu, w tym koordynacja zabezpieczeń, dla której pakiet dowodowy Protection ISTNIEJE (inwentarz §3) |
| U3-6 | E9: dowód kompletny (kroki WHITE BOX, odcisk wejścia, źródło LaTeX, zawężenie do elementu) | `ui2/wyniki/dowod/` (`PrzegladDowodu`, `KrokDowodu`, `SpisKrokow`, `ZrodloLatex`); luki parytetu L-10 (źródło LaTeX: pokaż/kopiuj/pobierz `.tex`) i L-11 (dowód zawężony do wskazanego elementu, z naprawą defektu `otworzDowod(_ref)`, który ref wyrzucał) **ZAMKNIĘTE** w KD-4 | **SPEŁNIONY** |
| U3-7 | Wynik przeżywa zimne wejście i restart (bez tego „czytelny z UI" jest pozorny) | V12K-272 (hydratacja powłoki z serwera: `loadCases`/`loadActiveCase`/`loadRuns`, luka zależności w `useWpiecieWynikow`), V12K-273 (jedno lądowisko wyników: `#analysis` nie ustawiał przestrzeni, zakładka startowa zamrożona w inicjalizatorze), e2e `restart-po-biegu.spec.ts`, `deep-link-wyniki.spec.ts`, `swiezosc-po-edycji-modelu.spec.ts` | **SPEŁNIONY** |
| U3-8 | Świeżość/unieważnienie wyników po zmianie modelu widoczne dla projektanta | `ui2/freshness/` (`PanelCoSieZmienilo`, `freshnessModel`, `dziennikApi`); V12K-265/266 (znacznik świeżości), V12K-286 (H-6: znacznik wyników miał dwa niezgodne źródła) | **SPEŁNIONY** |
| U3-9 | Zakładka „Pozostałe analizy" (most) przestała być drogą do zdolności wynikowych | `WynikiWarsztat.tsx:90,385` — zakładka `pozostale` nadal renderuje powierzchnię mostu. Wg `PLAN_WYGASZANIA_MOSTU_WYNIKI.md` §3b to **świadoma decyzja właściciela**: D3 (powierzchnia dowodu z akcjami audytu katalogowego — zostaje, osobna epika) i D4 (pakiet akademicki V12.6 — zostaje trwale) + Grupa C (powierzchnie nie-wynikowe). Wpis L-9 inwentarza parytetu: „ZOSTAJE wpisem imiennym, świadomie" | **SPEŁNIONY warunkowo** — residuum jest rozstrzygnięte przez właściciela, ale nie ma terminu ani wpisu w rozliczeniu fazy (luka **G-12**) |

### 2.3 Werdykt fazy U3

**LUKI** — 7 z 9 warunków spełnionych (U3-3 i U3-5 niespełnione; U3-9 spełniony warunkowo).

Warsztat wyników jest bogaty (29 zakładek), wzorzec ekranu analizy realnie
egzekwowany (16/17 modułów), a łańcuch „wynik → ślad → dowód" działa na głównych
torach (rozpływ, zwarcia, jakość, odbiór, estymacja, składowe, stabilność, stan
fazowy, OLTC, zbieżność, porównanie). Bramki nie da się zamknąć dosłownie, bo
kryterium mówi **„każda"** i **„każdy"**: trzy zdolności nie mają ścieżki uruchomienia
(wrażliwość, import XLSX, rozpływ niesymetryczny), a cztery ekrany wyników nie
prowadzą do dowodu.

---

## 3. FAZA U4 — Specjalistyczne (E10, E11, E12, E13)

### 3.1 Kryterium DoD (cytat dosłowny)

> **U4 Specjalistyczne** | E10, E11, E12, E13 | macierz pokrycia: zero ❌, zero ◐; raporty kompletne

### 3.2 Warunki cząstkowe i dowody

| # | Warunek | Dowód | Werdykt |
|---|---|---|---|
| U4-1 | Macierz pokrycia (inwentarz §6): **zero ❌** | Pomiar automatyczny 45 wierszy macierzy: **0 ❌**. Bilans inwentarza (rewizja 2026-07-21c) potwierdza; V12K-076 domknął dwie ostatnie luki zero-UI | **SPEŁNIONY na literze dokumentu**, ale patrz U4-3: pomiar kodu wskazuje 3 zdolności bez powierzchni, których macierz nie oznacza jako ❌ |
| U4-2 | Macierz pokrycia: **zero ◐** | Pomiar automatyczny: **33 ◐ z 45 wierszy** (73%), m.in. arc flash, siła sieci, adekwatność Q, sanity bounds, walidacja energetyczna, migotanie, zdolność przyłączeniowa, P-Q, dobór kompensacji, LoM, dokumenty OSD, OLTC, preview kabla/transformatora, Reference Engine, wrażliwość, zgodność normatywna, porównania, rekomendacje, pokrycie analizami, granice, raporty, import XLSX, kreator sieci/stacji, przypadki obliczeniowe, SLD | **NIESPEŁNIONY** — jednoznacznie i z dużym marginesem |
| U4-3 | Macierz pokrycia jest AKTUALNA względem kodu (inaczej bramka jest niemierzalna) | Ostatnia rewizja inwentarza: **2026-07-25**; od tego czasu scalono wpisy V12K-262…322 (ok. 60 wpisów). Rozjazdy zmierzone: **SSCI** — macierz „brak (`ssci`: 0 plików); UI = następna faza", kod ma `ui2/wyniki/ssci/` (14 plików z trafieniem) i zakładkę warsztatu; **stan fazowy SN** ◐, kod ma `ui2/wyniki/stan-fazowy/`; **stabilność RMS** ◐, kod ma `ui2/wyniki/stabilnosc/`; **archiwum projektu (ZIP)** ✅, a `ui/project-archive/ProjectArchiveDialog` ma **zero konsumentów produkcyjnych** (patrz U4-6); **import XLSX** ◐ „częściowe (`xlsx`: 11 plików)", a te 11 plików to nazwy pól kontraktu, nie powierzchnia | **NIESPEŁNIONY** — macierz nie odwzorowuje szczytu; do rozstrzygnięcia bramki potrzebna nowa rewizja |
| U4-4 | E10 (zabezpieczenia): TCC, koordynacja, nastawy, pętla zwarciowa nn, zwarcia maszyn | `ui2/wyniki/koordynacja/` (`EkranKoordynacji`, `SekcjaNastaw`, `nastawyApi`) — dostawca ui2 ekranu koordynacji z krzywymi TCC, marginesami CTI i nastawami z backendu (V12K-204, inwentarz parytetu wiersz 11); pętla zwarciowa nn: `ui2/inspector/SekcjaPetlaZwarcia.tsx` + `ui2/kryteria/`; zwarcia maszyn: rozbicie μ/q/i_b w pakiecie dowodowym SC3F; ogniwo „wynik zwarciowy → wytrzymałość aparatury" domknięte w KD-4 (`ui2/wyniki/zwarcia/aparatura`) | **SPEŁNIONY** |
| U4-5 | E11 (OZE i zgodność): macierz NC RfG, FRT/HVRT, siła sieci, adekwatność Q, SSCI, arc flash, bilans do wniosku | `ui2/oze/` = 12 modułów + grupa OZE w warsztacie wyników (12 zakładek); `ui2/wyniki/jakosc/` (arc flash, sanity bounds, walidacja energetyczna, migotanie, wytrzymałość cieplna, warunki przyłączenia); `ui2/wyniki/ssci/`; V12K-321/322 (wykaz certyfikatów PTPiREE end-to-end: 6 → 6887 rekordów, dwa kody gotowości, dowód certyfikatu w macierzy) | **SPEŁNIONY** |
| U4-6 | E13 (raporty i dokumentacja) kompletne: generator raportu, magazyn dokumentów, zestawienie materiałowe, eksporty, archiwum | Dostarczone: `ui2/spaces/dokumentacja/` (`HubDokumentacji`, `MostDokumentacji`, `generator/`), magazyn dokumentów (`backend/src/api/document_store.py`), zestawienie materiałowe (`application/analyses/lista_materialowa.py`), studium OZE, wniosek OSD, luka L-15 (generator raportu ze SKŁADEM dokumentu) zamknięta w KD-4 wraz z naprawą phantomu (most miał dwie kontrolki składu, których backend nie czytał). **NIEDOSTARCZONE:** karta „Archiwum projektu (ZIP)" (`ui2/spaces/dokumentacja/model.ts:154-164`) kieruje do przestrzeni „Projekt" (`cel: { rodzaj: 'przestrzen', przestrzen: 'projekt' }`), a w `ui2/spaces/projekt/` **nie ma żadnej akcji archiwum** — `grep -rln "ZIP\|archive\|/export" frontend/src/ui2` nie wskazuje ani jednego komponentu archiwum, a `ProjectArchiveDialog` ma **0 konsumentów produkcyjnych** | **NIESPEŁNIONY** — łańcuch dokumentacji kończy się ślepym zaułkiem na archiwum |
| U4-7 | E12 (konsolidacja porównań): JEDEN moduł porównań, trzy zastane zlikwidowane | Nowy moduł: `ui2/wyniki/porownanie/` (`EkranPorownania`, `TrybZwarciowy`) — parytet osiągnięty (L-12 różnice Q, L-13 Δ% z backendu, L-14 filtr różnic; inwentarz parytetu wiersz 9). **Nadal w drzewie:** trasa mostu `#compare` renderująca `ui/comparison/ResultsComparisonPage` (`WorkspaceSurfaceRouter.tsx:8,1053`) + `ComparisonWizard` (`:1055`); `ui/power-flow-comparison/PowerFlowComparisonPage` i `ui/protection-comparison/ProtectionComparisonPage` — **0 konsumentów produkcyjnych**; `ui/comparison/SldDeltaOverlayPanel` — 0 konsumentów | **NIESPEŁNIONY** — konsolidacja zatrzymana na etapie „nowy moduł działa, stare nie zniknęły" |

### 3.3 Werdykt fazy U4

**LUKI** — 3 z 7 warunków spełnionych (U4-4, U4-5 spełnione; U4-1 spełniony warunkowo;
U4-2, U4-3, U4-6, U4-7 niespełnione).

Faza U4 jest **najdalej od zamknięcia** z całej czwórki i to nie dlatego, że
funkcje nie powstały (powstały — strumień OZE, jakość wyników, koordynacja,
dokumentacja są realne), tylko dlatego, że jej DoD jest zapisany jako stan
**dokumentu**, którego od 2026-07-25 nikt nie zrewidował. Dosłowne kryterium
„zero ◐" jest dziś odległe o 33 wiersze; część tych ◐ jest już nieprawdziwa
(zdolność ma powierzchnię), a co najmniej jedno ✅ jest nieprawdziwe w drugą
stronę (archiwum ZIP bez wejścia w UI). **Bez rewizji macierzy bramka U4 jest
formalnie nierozstrzygalna.**

---

## 4. FAZA U5 — Scalenie (E14 + persony, polish, regresja wizualna)

### 4.1 Kryterium DoD (cytat dosłowny)

> **U5 Scalenie** | E14 + przejścia e2e wszystkich person §3, polish, visual regression nowej powłoki | ocena rady specjalistów ≥ 9/10 per przestrzeń; pełny e2e „projekt → analiza → dowód → raport"

### 4.2 Warunki cząstkowe i dowody

| # | Warunek | Dowód | Werdykt |
|---|---|---|---|
| U5-1 | E14: SLD osadzony w nowej powłoce jako przestrzeń robocza | `ui2/spaces/schemat/` (`NastepnyKrokSchematu`, `PrzelacznikPodgladu`, `strings`), kanwa `SldCanvasV3Workspace` montowana przez most (`legacyRegistry.ts` wpis `schemat`), `AppRoot.tsx:82,187,303` — przejścia do przestrzeni „Schemat" jako domyślne lądowisko trasy `#sld`; luka parytetu L-1 (tryb podglądu tylko do odczytu) zamknięta w KD-4 przez `PrzelacznikPodgladu` sterujący istniejącym propem `readOnly` | **SPEŁNIONY** |
| U5-2 | E14: nawigacja model ↔ schemat ↔ wyniki działa w obie strony | `ui2/shell/przejsciaPrzestrzeni.ts` (jedno źródło przejść, czyszczenie trasy nadrzędnej `#sld`); `NastepnyKrokSchematu` (Schemat → Gotowość, karta K4-E2/V12K-275); pętla decyzji „Popraw w modelu" (`ui2/wyniki/wzorzec/usePoprawWModelu.ts` + `akcjeNaprawcze.ts`) — z wiersza wyniku do elementu na schemacie (V12K-097, V12K-261); lądowiska wygaszonych tras (`useLegacyOrchestrator.ts` → `LADOWISKA_WYGASZONYCH_TRAS`) | **SPEŁNIONY** |
| U5-3 | E14: nakładki wyników konsumowane przez publiczne API, bez forka | `ui2/legacy/LegacyChrome.tsx:21,77` montuje `V12OverlayModeController` z `ui/shell`; `ui/sld-overlay/rawResultOverlayStore` czytany przez kanwę (`ui/sld/v2/canvas/lfDerivedMetrics.ts`, `scDerivedProjection.ts`, `enmToCanonicalGpzAdapter.ts`, `ui/sld/shared/detailDrawerData.ts`); strażnik `overlay_no_physics_guard` w kanonie bramek programu | **SPEŁNIONY** (uwaga uboczna: hook `useOverlayRuntime` z publicznego API `ui/sld-overlay` nie ma konsumenta produkcyjnego — luka **G-13**) |
| U5-4 | Pełny e2e „projekt → analiza → dowód → raport" | `frontend/e2e/industrial-template-mass-flow.spec.ts` — projekt + przypadek (`createProjectAndCase`, `:48`), 50 szablonów stacji, generatory OZE (`:312-314`), bieg zwarciowy (`:351-355`), eksporty `export/report/json`, `export/proof/json`, `export/proof/latex`, `trace` (`:365-404`, z asercjami na obecność `I_dyn`/`I_th` w dowodzie), weryfikacja UI na końcu (`:484-487`: „Stacje: 50", „Dowody (8)") | **SPEŁNIONY** — spec istnieje i pokrywa cały łańcuch |
| U5-5 | …i ten e2e jest bramką (biegnie w CI) | `.github/workflows/frontend-e2e-smoke.yml` uruchamia `e2e/critical-run-flow.spec.ts` + `e2e/kd11-tozsamosc-etykiet.spec.ts`. `industrial-template-mass-flow.spec.ts` **nie jest uruchamiany w żadnym workflow** | **NIESPEŁNIONY** |
| U5-6 | Przejścia e2e **wszystkich person §3** (8 perspektyw) | `grep -rl "persona\|persony\|Persona" docs frontend/e2e` → 4 pliki, wszystkie dokumentacyjne (`PROGRAM_UIUX_2026-07.md`, `AUDYT_FLOW_INZYNIER_PROJEKTANT_2026-07.md`, dwie karty U1). **Brak jakiegokolwiek mapowania persona → specyfikacja e2e**; nie da się orzec, czy 73 specyfikacje pokrywają 8 perspektyw | **NIESPEŁNIONY** — brak artefaktu rozliczającego warunek |
| U5-7 | Regresja wizualna nowej powłoki | `grep -rl "toHaveScreenshot" frontend/e2e` → **0 plików**, mimo że `playwright.config.ts` deklaruje tolerancję `maxDiffPixelRatio: 0.005`. Istniejące 20+ specyfikacji `*-screenshot.spec.ts` (m.in. `wszystkie-sceny-screenshot.spec.ts` — 43 sceny × 2 motywy, bramka pokrycia scen z V12K-259) **zapisują artefakty do oceny**, nie porównują z bazą odniesienia. Zasób: 303 pliki PNG w `docs/audit/visual/` + generator strony oceny (`generuj_strone_oceny.py`, V12K-303) | **NIESPEŁNIONY** — mechanizm oceny wizualnej istnieje i jest wartościowy, ale to NIE jest regresja wizualna (żaden test nie zaczerwieni się od zmiany pikseli) |
| U5-8 | Ocena rady specjalistów **≥ 9/10 per przestrzeń** (7 przestrzeni × 8 perspektyw §3) | `grep -ril "rada specjalist\|Rada specjalistów\|ocena rady" docs` → wyłącznie `PROGRAM_UIUX_2026-07.md` i `PROMPT_ZARZADCA_FABLE_UIUX.md`, czyli dokumenty, które ten wymóg USTANAWIAJĄ. W repozytorium **nie ma ani jednego dokumentu z oceną punktową przestrzeni**. Istnieją bogate audyty wielosoczewkowe (`AUDYT_SIEDMIU_SOCZEWEK_2026-07-29`, `AUDYT_EKSPERCKI_2026-07-21`, `AUDYT_ZESPOL_EKSPERTOW_2026-07-21`, `AUDYT_RADY_SPECJALISTOW_2026-07`, `docs/audit/AUDYT_SZCZYTU_2026-08-01`, `docs/audit/PRZEGLAD_FALI_2026-08-01`), ale są to audyty ZNALEZISK, nie oceny per przestrzeń | **NIEWERYFIKOWALNY DOKUMENTACYJNIE** → w praktyce NIESPEŁNIONY (brak artefaktu); wykonalny dopiero po fazie 2 |
| U5-9 | „Polish" — dojrzałość wizualna i spójność obu motywów | Kolejne oceny właściciela z oględzin: **2/10** dla motywu jasnego (V12K-298, sześć zarzutów: 80% powierzchni ciemno w motywie jasnym, nachodzące paski narzędzi = martwy klik, komunikat poniżej progu czytelności), **2/10** dla schematu (V12K-280, V12K-285), potem naprawy KD-8/KD-11 (V12K-298, V12K-299). Po nich brak nowej oceny właściciela | **NIEWERYFIKOWALNY DOKUMENTACYJNIE** — ostatni znany werdykt to 2/10 sprzed napraw; wymaga oględzin (F2-2) |

### 4.3 Werdykt fazy U5

**WYMAGA OGLĘDZIN** — 4 z 9 warunków spełnionych (U5-1, U5-2, U5-3, U5-4;
U5-5, U5-6, U5-7 niespełnione; U5-8 i U5-9 nierozstrzygalne bez żywej aplikacji).

Techniczne scalenie (E14) jest **zrobione**: SLD żyje w nowej powłoce jako
przestrzeń robocza z trybem podglądu, nawigacja domyka pętlę wynik→model→schemat,
nakładki idą przez publiczne API, a pełny łańcuch „projekt → analiza → dowód →
raport" ma realną specyfikację e2e. Nie ma natomiast **żadnego z trzech
artefaktów rozliczających**, których żąda DoD: bramki CI dla łańcucha, regresji
wizualnej i oceny rady per przestrzeń. Dwa ostatnie warunki są z natury
zależne od oględzin i przechodzą do fazy 2.

---

## 5. SKONSOLIDOWANA LISTA LUK — propozycje kart naprawczych

Kolejność wg **wpływu na łańcuch pracy projektanta E1–E8** (`FLOW_PROJEKTANTA_2026-07.md`):
najpierw luki, które PRZERYWAJĄ łańcuch dla projektanta, potem luki wiarygodności
pomiaru (bez nich nie da się orzec o zamknięciu faz), na końcu higiena.

| # | Cel karty (jedno zdanie) | Etap E | Faza | Warstwa | Rozmiar | Zależności |
|---|---|---|---|---|---|---|
| **G-01** | Dać archiwum projektu (ZIP) realne wejście w nowej powłoce, tak aby karta „Archiwum projektu (ZIP)" huba dokumentacji kończyła się pobraniem paczki, a nie przestrzenią bez akcji | **E8** | U4 | frontend (`ui2/spaces/projekt` lub `dokumentacja`) — backend `project_archive` już wpięty | **M** | brak; poprzedza kasację `ui/project-archive` (G-07) |
| **G-02** | Wpiąć w ślad/dowód cztery ekrany wyników, które kończą się werdyktem bez wywodu: koordynacja zabezpieczeń, SSCI, werdykt projektowy, „co wymaga uwagi" | **E5** | U3 | frontend + weryfikacja dostawcy dowodu w API | **M** | pakiet dowodowy Protection istnieje; dla SSCI/werdyktu wymaga sprawdzenia, czy backend wystawia ślad |
| **G-03** | Zbudować powierzchnię analizy wrażliwości w nowej powłoce (zdolność `lf_sensitivity`/`sensitivity` została bez UI po usunięciu modułu zastanego z fizyką w prezentacji) | **E5/E6** | U3 | frontend + API (potwierdzić końcówkę uruchomienia) | **L** | rozstrzygnięcie zakresu: wrażliwość rozpływu vs ogólna |
| **G-04** | Dać importowi XLSX powierzchnię w UI albo formalnie wycofać zdolność z inwentarza (dziś router `xlsx_import` jest wpięty, a w interfejsie nie ma ani jednego punktu wejścia) | **E1/E2** | U4 | frontend + decyzja produktowa | **M** | decyzja właściciela: dostarczyć czy wycofać |
| **G-05** | Rozstrzygnąć los rozpływu niesymetrycznego: wystawić solver jako uruchamialną zdolność (rejestr zdolności + końcówka + ekran) albo zapisać go jako świadomie nieudostępniony | **E4/E5** | U3 | backend (rejestr zdolności) + frontend | **L** | decyzja właściciela |
| **G-06** | Wygasić trasę mostu `#catalog` po domkniętej luce kategorii i zaktualizować dokumenty, które opisują stan sprzed naprawy (inwentarz parytetu §5 wiersz L-16, komentarz specu `mosty-parytet.spec.ts`) | **E2** | U2 | frontend + dokument | **S** | bramka parytetu §3a planu wygaszania |
| **G-07** | Skasować moduły warstwy zastanej bez konsumenta produkcyjnego, każdy z dowodem parytetu: `project-archive` (po G-01), `voltage-profile`, `power-distribution`, `data-manager`, `schema-completeness`, `mode-gate`, `protection-comparison`, `reference-patterns`, re-eksport `issue-panel` w `ui/index.ts` | higiena (E2–E8) | U2/U4 | frontend | **M** | G-01 (archiwum musi najpierw mieć dostawcę) |
| **G-08** | Domknąć konsolidację porównań: wygasić trasę `#compare` z `ResultsComparisonPage`/`ComparisonWizard` po bramce parytetu i skasować martwe `PowerFlowComparisonPage`, `ProtectionComparisonPage`, `SldDeltaOverlayPanel` | **E5** | U4 (E12) | frontend | **M** | parytet `EkranPorownania` już wykazany (L-12/L-13/L-14) |
| **G-09** | Zrewidować macierz pokrycia inwentarza wobec szczytu (45 wierszy, każdy z dowodem plik/końcówka), bo bez tego bramka U4 „zero ◐" jest formalnie nierozstrzygalna | wszystkie | U4 | dokument + weryfikacja w kodzie | **M** | G-01…G-05 zmieniają wyniki niektórych wierszy — rewizja PO nich albo z jawną adnotacją |
| **G-10** | Wprowadzić bramkę CI dla łańcucha projektanta: zestaw e2e „projekt → model (GPZ→DER) → gotowość → obliczenie → wynik → dowód → raport" uruchamiany przy każdym PR (dziś w CI biegną 2 z 73 specyfikacji) | wszystkie (E1–E8) | U2/U5 | CI + e2e | **M** | wydajność biegu (pomiar V12K-281/284: pełny przepływ 3,2 min po naprawach) |
| **G-11** | Zbudować regresję wizualną nowej powłoki na bazie odniesienia (dziś `toHaveScreenshot` nie występuje w żadnej z 73 specyfikacji, a konfiguracja tolerancji w `playwright.config.ts` jest martwa) | polish (E1–E8) | U5 | CI + e2e | **L** | G-10 (wspólna infrastruktura biegu e2e w CI) |
| **G-12** | Rozliczyć residuum mostu: przypisać terminy/decyzje pozycjom świadomie zostawionym (D3 powierzchnia dowodu z akcjami audytu katalogowego, D4 pakiet akademicki V12.6, Grupa C) i wpisać je do rozliczenia faz zamiast trzymać jako otwarty wpis imienny L-9 | **E5/E8** | U3 | dokument | **S** | decyzja właściciela |
| **G-13** | Sklasyfikować `useOverlayRuntime` z publicznego API nakładek: albo wskazać konsumenta produkcyjnego, albo usunąć jako dług (dziś zero wywołań poza własnym modułem) | higiena (E5) | U5 | frontend | **S** | brak |
| **G-14** | Zamknąć inwentarz „fałszywych zer" poza `ui/network-build`: cztery łagodniejsze przypadki nazwane w V12K-319 poz. 4, których pin strukturalny nie widzi | **E3** | U2 | frontend | **M** | metoda: reguła KLASA, NIE INSTANCJA (inwentarz przed naprawą) |
| **G-15** | Zaktualizować w rejestrze konfliktów 9 wierszy stojących „OTWARTY"/„W REALIZACJI" mimo istnienia wpisów kontynuacyjnych (V12K-032, 059, 070, 135, 137, 145, 148, 151, 155) — stan każdego sprawdzony w KODZIE, nie w dokumencie | rozliczenie faz | U2/U5 | dokument + weryfikacja | **M** | precedens metody: FLOW §3 „Weryfikacja 2026-07-28 (dryf rejestru)" |
| **G-16** | Przeprowadzić i zapisać ocenę rady specjalistów per przestrzeń (7 przestrzeni × 8 perspektyw §3 programu) — dziś w repozytorium nie ma ani jednego takiego artefaktu, a jest to DOSŁOWNE kryterium wyjścia U5 | rozliczenie U5 | U5 | proces + dokument | **M** | faza 2 (oględziny) — patrz F2-1…F2-6 |
| **G-17** | Domknąć otwarte długi nazwane z ostatnich fal: wyciek nagłówka PDF w polu `firmware` (V12K-321 poz. 4), 5 wolnych testów determinizmu (poz. 9), nazwa pola `node_p_spec_effective_pu` (V12K-319 X1-D1), decyzje właścicielskie (OLTC, dane trzech przekładników napięciowych) | mieszany | poza U2–U5 | mieszana | **M** | część wymaga wersji łamiącej kontrakt i decyzji właściciela |

### 5.1 Skrót wpływu

- **Przerywają łańcuch projektanta:** G-01 (E8 — dokumentacja bez archiwum),
  G-02 (E5 — werdykt bez wywodu), G-03/G-05 (E5/E6 — zdolność bez drogi uruchomienia).
- **Podważają wiarygodność rozliczenia faz:** G-09 (macierz), G-15 (rejestr),
  G-10/G-11 (brak bramek regresji), G-16 (brak oceny).
- **Higiena „zero bytów równoległych":** G-06, G-07, G-08, G-12, G-13.

---

## 6. POZYCJE DO FAZY 2 — oględziny żywej aplikacji

Każda pozycja: co obejrzeć · jak zmierzyć · który warunek rozstrzyga.

| # | Pozycja | Jak zweryfikować | Rozstrzyga |
|---|---|---|---|
| **F2-1** | Czytelność bramki gotowości | Model z co najmniej jedną blokadą i jednym ostrzeżeniem: czy panel gotowości w ≤ 5 s pozwala odpowiedzieć „czy mogę liczyć" i „co dokładnie kliknąć, żeby naprawić"; czy akcja naprawcza prowadzi do WŁAŚCIWEGO elementu; czy po naprawie stan zmienia się bez przeładowania | U2-9 |
| **F2-2** | Spójność obu motywów po naprawach KD-8/KD-11 | Przejście E1→E8 w motywie jasnym i ciemnym, zrzut każdej z 7 przestrzeni w obu motywach; sprawdzić sześć zarzutów z oceny 2/10 (V12K-298): udział ciemnej powierzchni w motywie jasnym, kadr, nachodzenie pasków narzędzi, próg czytelności komunikatu blokady, afordancja stanów przycisków, czytelność etykiet schematu | U5-9 |
| **F2-3** | Ocena rady specjalistów per przestrzeń | Dla każdej z 7 przestrzeni przejść checklistę 8 perspektyw §3 programu i wystawić ocenę punktową z uzasadnieniem; wynik zapisać jako dokument w `docs/uiux/` | U5-8, karta G-16 |
| **F2-4** | Prawdziwość łańcucha GPZ→DER klikiem (nie przez końcówki) | Zbudować sieć wyłącznie klikami: źródło GPZ → magistrala → stacja → pole → DER (PV i BESS); zmierzyć, ile razy trzeba opuścić prowadzący tor pracy i czy każdy kreator kończy się jawnym następnym krokiem | U2-1, U2-2 |
| **F2-5** | Ślepe zaułki dokumentacji | Kliknąć KAŻDĄ kartę huba dokumentacji i sprawdzić, czy kończy się dokumentem albo generatorem; szczególnie „Archiwum projektu (ZIP)" (przewidywany ślepy zaułek — dowód kodowy w U4-6) | U4-6, karta G-01 |
| **F2-6** | Droga z wyniku do dowodu na każdej zakładce | Otworzyć kolejno wszystkie zakładki warsztatu wyników z realnym przebiegiem i odnotować, które nie mają widocznego wejścia w ślad/dowód (przewidywane: koordynacja, SSCI, werdykt, „co wymaga uwagi") | U3-5, karta G-02 |
| **F2-7** | Zakładka „Pozostałe analizy" oczami projektanta | Sprawdzić, co realnie zostaje pod tą zakładką i czy różnica wyglądu wobec ekranów nowej powłoki jest dla użytkownika myląca (dwa światy w jednym warsztacie) | U3-9, karta G-12 |

---

## 7. Podsumowanie werdyktów

| Faza | Warunki spełnione | Werdykt |
|---|---:|---|
| **U2** Model i dane | 8 / 11 | **LUKI** — rdzeń dostarczony; brak bramki CI łańcucha, nierozliczone „fałszywe zera" poza `ui/network-build`, niewykonana kasacja modułów zastanych |
| **U3** Obliczenia i wyniki | 7 / 9 | **LUKI** — kryterium mówi „każda/każdy": 3 zdolności bez ścieżki uruchomienia, 4 ekrany wyników bez drogi do dowodu |
| **U4** Specjalistyczne | 3 / 7 | **LUKI** — bramka zapisana jako stan dokumentu, którego nie zrewidowano od 2026-07-25 (33 ◐ z 45); dodatkowo archiwum ZIP bez wejścia i niedokończona konsolidacja porównań |
| **U5** Scalenie | 4 / 9 | **WYMAGA OGLĘDZIN** — scalenie techniczne zrobione, brak wszystkich trzech artefaktów rozliczających (bramka CI, regresja wizualna, ocena per przestrzeń) |

**Wniosek nadrzędny.** Rozjazd między stanem produktu a stanem rozliczenia jest
systematyczny i ma jedną przyczynę: **program mierzy fazy dokumentami, a praca
od 2026-07-16 szła kartami i wpisami rejestru** (V12K-262…322 to ok. 60 wpisów
scalonych po ostatniej rewizji inwentarza). Ten sam mechanizm był już nazwany
w `FLOW_PROJEKTANTA_2026-07.md` §3 („dryf rejestru… wiersz rejestru ma być
aktualizowany w tym samym commicie, co dostarczenie karty") i powtórzył się na
poziomie wyżej — na macierzy pokrycia i na bramkach faz. Kolejność domykania
powinna być zatem: najpierw karty przywracające ciągłość łańcucha (G-01…G-05),
równolegle bramki mierzące (G-10, G-11), potem rewizja macierzy i rejestru
(G-09, G-15), a zamknięcie faz formalnie ogłosić dopiero na zrewidowanym
pomiarze — nie na pamięci o dostarczonych kartach.
