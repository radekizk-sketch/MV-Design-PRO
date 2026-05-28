# Weryfikacja wizualna (ZASADA NR 2) — raport 2026-05-28

**Zadanie:** `ZADANIE_WERYFIKACJA_WIZUALNA.md` · **Gałąź:** `claude/zealous-bardeen-xrqtp`
**Kanon:** PROMPT §7.9 (8 warunków SLD), §7B.9 (9 warunków frontendu), ZASADA NR 2.
**Metoda:** render w headless Chromium (Playwright) na realnym projekcie, backend SQLite. Zrzuty oglądane, nie wnioskowane z kodu.

---

## 0. KOREKTA WYKONALNOŚCI (istotna względem audytu z 2026-05-28)

Poprzedni audyt (`STAN_REPO.md`) zakładał, że ZASADA NR 2 jest **niewykonalna** w tym
środowisku. **To było zbyt pesymistyczne.** Ustalono empirycznie:

| Składnik | Stan faktyczny |
|---|---|
| Chromium (headless) | instalowalny: `npx playwright install chromium` → `/opt/pw-browsers` (sieć działa) |
| Backend bez Dockera | **boot na SQLite** (`DATABASE_URL` domyślnie `sqlite+pysqlite:///...`), nie wymaga PostgreSQL/Mongo/Redis |
| Frontend | `vite dev:e2e` na :5173 |
| Render + zrzut | headless Chromium renderuje i zapisuje PNG **bez wyświetlacza** |

Wniosek: **weryfikacja wizualna jest tu wykonalna** i została wykonana. Produkt: harness
`frontend/scripts/visual-capture.mjs` + katalog zrzutów `docs/audit/visual/`.

---

## 1. HARNESS ZRZUTOWY (produkt zadania — §0 „dodanie skryptu zrzutowego")

`frontend/scripts/visual-capture.mjs`:
- buduje **realny projekt** na backendzie (port z `e2e/critical-run-flow.spec.ts`):
  GPZ 15 kV (Sk''=250 MVA, R/X=0,1) → magistrala 3×kabel YAKXS 3×120 → stacja SN/nN B
  z transformatorem → odgałęzienie → przypisanie katalogów → gotowość → run **SC_3F**,
- seeduje stan aplikacji (`mv-design-app-state`) i nawiguje po powierzchniach,
- zapisuje PNG 1920×1080 (+ 1440×900) do `docs/audit/visual/`.

Uruchomienie (wymaga backendu :8000 i frontendu :5173):
```
PW_EXE=/opt/pw-browsers/chromium-1208/chrome-linux64/chrome node scripts/visual-capture.mjs
```

---

## 2. WYKRYTY I NAPRAWIONY DEFEKT (PRZED/PO — §5 zadania)

**DEF-VIS-01 — krytyczny: cały app shell wywraca się przy nieznanym statusie wyniku.**

`ui/shell/TopBar.tsx` czytał `RESULT_STATUS_CONFIG[status].label` **bez zabezpieczenia**.
Gdy `activeCaseResultStatus` ma wartość spoza `{NONE, FRESH, OUTDATED}` (np. utrwalony
w localStorage po zmianie schematu), `config` jest `undefined` → wyjątek
**„Cannot read properties of undefined (reading 'label')"** → ponieważ TopBar jest w
stale renderowanym shellu, **wywala się CAŁA aplikacja** (górny error boundary), na każdej
trasie (SLD, pulpit, analizy…).

| | Dowód |
|---|---|
| PRZED | `visual/topbar_invalid_status_before.png` — error boundary „Coś poszło nie tak", 2 błędy konsoli |
| PO | `visual/topbar_invalid_status_after.png` — pełny shell renderuje się poprawnie, 0 błędów konsoli |

Naprawa (surgiczna): `const config = RESULT_STATUS_CONFIG[status] ?? RESULT_STATUS_CONFIG.NONE;`
+ test regresyjny w `TopBar.test.tsx` („nie wywraca app shella przy nieznanym statusie").
To realizuje §7B.6 (komplet stanów — żaden stan nie wywala UI).

> Uwaga metodyczna: defekt ujawnił się przez błędny seed harnessu (status `'OK'`), ale
> **podatność jest realna** — każdy nieoczekiwany/utrwalony status wywala całą aplikację.
> Dokładnie ten typ defektu (zielone testy jednostkowe + crash na renderze) jest powodem
> istnienia ZASADY NR 2.

---

## 3. TEST ODBIORU SLD (§7.9) — werdykty ze zrzutów

Bazowe zrzuty: `visual/sld_environment_results.png`, `visual/sld_canvas_detail.png`
(natywna rozdzielczość wycinka płótna), `visual/sld_object_selected.png`.

Co realnie widać na schemacie: GPZ 15 kV (ramka), System 110 kV + Szyna WN, Pole WN TR1,
**TR1** (symbol IEC, Y/Δ, „25 MVA / 110/15 kV"), Pole TR1, Sekcja 1 (15 kV), stos aparatów
pola liniowego (Q1/Q0/T1/Q9/Q8 + uziemnik), magistrala kablowa z etykietami
**„YAKXS 3×120/16 · 350 m"**, strzałki przepływu ▶, główki kablowe ▲, blok stacji S01.
Pasek metryk: Szyny 10 · Odcinki SN 4 · Pola SN 4 · Stacje 1 · Długość 0,75 km · TR 2.

| Kod | Warunek | Werdykt | Uwaga |
|---|---|---|---|
| A-01 | Etykiety nie zasłaniają topologii | **PASS** | etykiety obok symboli; brak nachodzenia na topologię |
| A-02 | Legenda/chrome zakotwiczone do ramki | **PASS** | zoom/eksport/warstwy/motyw w narożnikach ramki; nic nie pływa po scenie |
| A-03 | Każda wartość wyniku dokładnie raz | **CZĘŚCIOWO** | brak duplikatów; ale nakładka wyników zwarciowych NIE jest domyślnie widoczna na SLD (status „do obliczenia") — patrz DEF-VIS-02 |
| A-04 | Brak diagnostyki backendu na płótnie | **PASS** | brak „brak w śladzie" itp. |
| A-05 | Hierarchia topologia > wynik > stan | **PASS** | topologia pierwszoplanowa (jasna), etykiety drugorzędne |
| A-06 | Etykiety segmentów = obiekty z katalogu | **PASS** | „YAKXS 3×120/16 · 350 m" (typ · przekrój · długość) |
| A-07 | Hit-box pokrywa się z symbolem | **NIEZWERYFIKOWANE** | wymaga harnessu interakcyjnego (hover/klik), nie statycznego zrzutu |
| §7.9.7-8 | Tryb prezentacyjny + legenda/skala/kierunek | **CZĘŚCIOWO** | eksport SVG + strzałki przepływu + skala długości obecne; dedykowany „czysty" tryb prezentacyjny niezweryfikowany osobnym zrzutem |

**Drobne defekty wizualne (zarejestrowany dług, plan w §6):**
- **DEF-VIS-02** — nakładka wyników (Ik'') nie pojawia się automatycznie na SLD przy
  aktywnym runie; trzeba potwierdzić ścieżkę aktywacji nakładki (przycisk „Nakładka").
- **DEF-VIS-03** — ucięta etykieta pola („Pole liniow…").
- **DEF-VIS-04** — schemat zajmuje ~lewe 60% płótna; prawa część pusta (łagodne, nie
  „mikroskopijne" jak V12.2, ale fit-to-content do dociśnięcia).
- **OBS-01** — `TopBar` BrandBlock pokazuje wersję „12.2", repo jest na V12.6 (etykieta do
  uzgodnienia — nie zmieniam bez decyzji).

---

## 4. TEST ODBIORU FRONTENDU (§7B.9) — werdykty ze zrzutów

Zrzuty: `sld_environment_results.png`, `analysis_surface.png`, `station_wizard.png`,
`dashboard.png`, `proof_surface.png`, `results_surface.png`, `sld_environment_1440x900.png`,
oraz stan pusty/onboarding (pierwszy render bez projektu).

| # | Warunek | Werdykt | Dowód / uwaga |
|---|---|---|---|
| 1 | Spójność (ten sam produkt) | **PASS** | shell, tokeny, font mono-eng, tabular-nums, kolory statusów spójne na 5+ powierzchniach |
| 2 | Kręgosłup (jeden „następny krok") | **PASS** | onboarding „Przejdź do budowy GPZ"; inspektor „Skonfiguruj pole SN GPZ" |
| 3 | Synchronizacja drzewo↔SLD↔inspektor + case_ref | **CZĘŚCIOWO** | struktura 3 stref + globalny case_ref obecne; żywa synchronizacja wymaga testu interakcyjnego |
| 4 | Komplet 9 stanów; brak pustych ekranów | **CZĘŚCIOWO** | stan pusty/onboarding z CTA ✓, crash → graceful ✓; pełna macierz 9 stanów per surface niezbadana zrzutowo |
| 5 | Nieaktualność (`do przeliczenia` + „przelicz dotknięte") | **NIEZWERYFIKOWANE** | wymaga edycji w trybie BUDOWA (interakcja) |
| 6 | Power-user (klawiatura/paleta/duża sieć) | **NIEZWERYFIKOWANE** | wymaga testu interakcyjnego + sieci >100 węzłów |
| 7 | Mapa przejść bez sierot | **CZĘŚCIOWO** | testowane trasy działają (#sld, #analysis, #proof, #results, #dashboard, #kreator-stacji-v2); pełny graf niezweryfikowany |
| 8 | Brak AI-slopu (celowy EDA/SCADA) | **PASS** | ciemny industrial, font mono-eng, symbole IEC, tabular-nums — celowe, nie generyczne |
| 9 | Onboarding (pusty projekt → pierwszy krok) | **PASS** | „Załóż pierwszy projekt" + „Przejdź do budowy GPZ" |

---

## 5. KATALOG ZRZUTÓW (`docs/audit/visual/`)

| Plik | Powierzchnia / stan |
|---|---|
| `sld_environment_results.png` | SLD (E-01), realny projekt, 1920×1080 |
| `sld_canvas_detail.png` | wycinek płótna SLD w natywnej rozdzielczości (ocena A-01…A-06) |
| `sld_object_selected.png` | SLD po kliknięciu obiektu |
| `sld_environment_1440x900.png` | SLD na mniejszym laptopie (spójność §7B.9-1) |
| `analysis_surface.png` | Analizy techniczne (E-35) + tabela wyników |
| `proof_surface.png` | Dowód / pakiet (#proof) |
| `results_surface.png` | Wyniki (#results) |
| `dashboard.png` | Pulpit projektu (E-00) |
| `station_wizard.png` | Kreator stacji v2 (kroki + tabele katalogowe) |
| `topbar_invalid_status_before.png` | DEF-VIS-01 PRZED (crash) |
| `topbar_invalid_status_after.png` | DEF-VIS-01 PO (graceful) |

---

## 6. PLAN DOMKNIĘCIA (pozostały dług wizualny / weryfikacyjny)

1. **Harness interakcyjny** (rozszerzenie `visual-capture.mjs`): hover/klik (A-07), trójpanelowa
   synchronizacja (§7B.9-3), propagacja nieaktualności po edycji (§7B.9-5), skróty/paleta (§7B.9-6).
2. **DEF-VIS-02**: potwierdzić/utwardzić ścieżkę nakładki wyników na SLD (Ik'' per węzeł) —
   kluczowe dla A-03 i §7.8 (SLD jako interfejs dowodowy).
3. **DEF-VIS-03**: pełna etykieta pola (bez ucięcia).
4. **DEF-VIS-04**: fit-to-content dociskający schemat do dostępnego płótna.
5. **Tryb prezentacyjny** (§7.9.7): osobny zrzut czystego widoku eksportowego.
6. **OBS-01**: decyzja o etykiecie wersji w BrandBlock.

---

## 7. AKTUALIZACJA KRYTERIÓW

| Kryt. | Było | Jest po tej sesji |
|---|---|---|
| K-07 (SLD 8/8) | niezweryfikowane wizualnie | **częściowo zweryfikowane**: A-01/02/04/05/06 PASS; A-03 częściowo; A-07 i tryb prezentacyjny — harness interakcyjny |
| K-19 (frontend 9/9) | niezweryfikowane wizualnie | **częściowo**: 1,2,8,9 PASS; 3,4,7 częściowo; 5,6 — harness interakcyjny |
| K-20 (zrzut PRZED/PO) | niezweryfikowane | **wykonane dla DEF-VIS-01**; pozostałe warunki — w miarę wykrywania defektów |
| K-21 (A-01…A-07 = 0) | niezweryfikowane | A-01…A-06 bez defektów krytycznych; **DEF-VIS-03** (drobny) otwarty; A-07 niezweryfikowane |

Werdykty wydane **wyłącznie** ze zrzutów. Nic nie zadeklarowano „z kodu".

---

*Raport weryfikacji wizualnej. Trwały ślad: ten plik + katalog `docs/audit/visual/` +
aktualizacja `STAN_REPO.md`.*
