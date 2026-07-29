# PROMPT DLA FABLE — przejęcie nadzoru po sesji Opusa (2026-07-28)

> **Jak użyć:** wklej ten plik jako pierwszy prompt sesji Fable. Jest to jednocześnie
> sprawozdanie z prac wykonanych BEZ nadzoru i lista zadań weryfikacyjnych.
> Ścieżka pliku w repo: `mv-design-pro/docs/prompts/PRZEJECIE_NADZORU_FABLE_2026-07-28.md`.

---

## §0. Twój mandat

Przejmujesz nadzór nad gałęzią `claude/power-network-design-ui-ir91mv` po sesji, którą
Opus prowadził samodzielnie. **Nie przyjmuj tej pracy na słowo.** Twoje zadanie:

1. **Zweryfikuj** każdą z pięciu kart (§2) — niezależnym pomiarem, nie czytaniem opisu.
2. **Domknij** to, czego Opus nie zweryfikował (§3) — to najważniejsza sekcja tego dokumentu.
3. **Rozstrzygnij** decyzje, które Opus podjął sam, a które są produktowe (§4).
4. **Napraw zarzut właściciela** o ekranach bez wizji (§5) — to jest właściwa robota,
   której ta sesja NIE dotknęła.

Rygor bez zmian: pełna regresja właściwej warstwy + guardy + determinizm + FROZEN/golden
nietknięte przed scaleniem. Wstrzyknięta regresja jako dowód, że bramka gryzie —
zielony wynik NIE jest dowodem.

---

## §1. Stan gałęzi — sprawdź to PIERWSZE

```bash
git fetch origin claude/power-network-design-ui-ir91mv
git log --oneline -6 origin/claude/power-network-design-ui-ir91mv
```

Oczekiwany szczyt: `7dada7f8 V12K-269: odcisk analizy przestaje zalezec od zegara`.

**UWAGA — zdarzenie infrastrukturalne w trakcie sesji.** Kontener został w pewnym
momencie przywrócony ze starszej migawki: lokalne `HEAD` wskazywało `8bc342ae`
(wątek SLD, V12K-212…215), a plików z kart V12K-265…269 nie było na dysku. Praca NIE
zginęła — była na origin; lokalną kopię odtworzył `git reset --hard origin/<branch>`.
**Wniosek dla Ciebie:** na tej gałęzi pracuje więcej niż jedna sesja (widoczne po
commicie `ba648570`, który pojawił się między pushami Opusa). Przed każdą własną
zmianą rób `git fetch` i sprawdzaj, czy nie nadpisujesz cudzej pracy.

---

## §2. Co Opus zrobił bez nadzoru — pięć kart

Wszystkie mają wpis w `mv-design-pro/docs/v12xx/REJESTR_KONFLIKTOW.md` (V12K-265…269).

| Karta | Commit | Treść w jednym zdaniu |
|---|---|---|
| V12K-265 | `a13d0eed` | `analysis_case_context.rewizja_modelu` dojeżdża przez front do nagłówka; nowy hook `useSwiezoscNaglowka`; wpięty w 3 ekrany. |
| V12K-266 | `467fa920` | Ten sam hook wpięty w pozostałe ekrany wzorca — razem **7 z 8**; ósmy (`EkranLom`) świadomie pominięty. |
| V12K-267 | `9d80dd2b` | Koperta `context` przestaje kłamać: `trace_id` niósł `str(run.id)` w 12 producentach; jeden wspólny builder zamiast 7 kopii. **+ dwa zastane defekty** (patrz niżej). |
| V12K-268 | `ba648570` | Zakazana nazwa „PCC" znika z domeny **z migracją zapisu** (decyzja właściciela); `pcc_ref` → `bus_przylaczenia_ref` przy wczytaniu modelu. |
| V12K-269 | `7dada7f8` | **Odcisk analizy zależał od zegara** — `analysis_id` 9 analiz zmieniał się przy każdym uruchomieniu tej samej, niezmienionej sieci. |

### Dwa zastane defekty naprawione przy okazji (V12K-267)

1. **Testy dzieliły jedną bazę.** `canonical_run_repository` bierze adres z
   `DATABASE_URL` z domyślnym `./mv_design_pro.db`; tylko 12 plików testowych na kilkaset
   ustawiało tę zmienną. Wspólny plik urósł do **15 MB** i przeżywał między
   uruchomieniami → sporadyczne `StaleDataError` na `canonical_runs`.
   Naprawa: `autouse` fixture w `tests/conftest.py`, baza w pamięci per test.
   **Efekt uboczny do zweryfikowania przez Ciebie:** pełna regresja zeszła z 15
   czerwonych na 3, bo **12 testów `tests/api` liczyło na przebiegi zostawione przez
   inne testy**. Opus NIE zbadał, czy te testy po izolacji nadal sprawdzają to samo,
   czy tylko „przestały padać". **To jest zadanie dla Ciebie — §3, pkt 6.**
2. **Baseline guarda `ui_no_physics` nie był ponownie zmierzony** i był CZERWONY na
   HEAD (potwierdzone w czystym worktree): mówił 22 trafienia / 18 wpisów, pomiar dawał 5.

### Pomiary, które Opus wykonał (odtwórz je, nie ufaj im)

- backend pełna regresja po V12K-269: **7195 passed, 0 failed** (`poetry run pytest -q`);
- frontend pełna regresja po V12K-268: **783 pliki / 10487 testów**, rc=0 (`npm test`);
- `type-check` rc=0, `lint` rc=0;
- guardy: 14 zielonych, w tym `pcc_zero`, `ui_no_physics`, `guard_ux_flow_v1`,
  `arch`, `solver_boundary`, `docs`, `utf8`;
- `trace_determinism_guard` daje rc=2 poza venv (brak `pydantic`) — uruchamiać przez
  `poetry run python ../scripts/trace_determinism_guard.py`, wtedy rc=0.

---

## §3. CZEGO OPUS NIE ZWERYFIKOWAŁ — lista do domknięcia

**To jest najważniejsza sekcja. Każdy punkt to otwarte ryzyko, nie formalność.**

1. **ŻADEN EKRAN NIE ZOSTAŁ ZOBACZONY.** Zero zrzutów, zero uruchomienia aplikacji.
   Znacznik świeżości i panel „co się zmieniło" wpięto w 7 ekranów **wyłącznie na
   podstawie testów jednostkowych**. Nie wiadomo, czy się pokazują, gdzie się pokazują
   i czy nie rozwalają układu. Dyrektywa właściciela nr 8 („pokazuj ekrany do oceny po
   każdym etapie, oba motywy") **nie została wykonana ani razu w pięciu kartach**.
   → Uruchom aplikację, zrób zrzuty obu motywów, opublikuj na stronie oceny.
2. **Strona oceny nie została zaktualizowana** po żadnym etapie
   (`https://claude.ai/code/artifact/4e8a4d65-d5c7-4943-8113-58245725316e`).
3. **Raport PDF ma nowy wiersz „Run ID"** (V12K-269) — nikt nie wyrenderował PDF-u
   i na niego nie spojrzał. Sprawdź układ strony tytułowej, czy wiersz się mieści
   i czy „—" przy braku danych nie wygląda jak błąd.
4. **`EkranLom` świadomie bez znacznika świeżości** — Opus zdecydował sam, uzasadnienie:
   ekran czyta po `case_id`, nie ma przebiegu, więc nie istnieje „rewizja, na której
   policzono wynik". **To jest decyzja produktowa, nie techniczna.** Rozstrzygnij:
   czy ekrany oparte o przypadek mają mieć własny wariant znacznika świeżości?
5. **Migracja PCC (V12K-268) testowana wyłącznie na modelach syntetycznych.**
   Nie sprawdzono jej na realnym pliku projektu. Migracja **zmienia hash modelu i
   podnosi rewizję**, więc wyniki policzone wcześniej pokażą się jako nieaktualne —
   raz, dla projektów mających stary klucz. Dodatkowo migracja obejmuje **tylko
   `generators[]`**; Opus nie sprawdził wyczerpująco, czy `sources[]` albo inne
   kolekcje nie niosą tego klucza. → Zweryfikuj na realnym projekcie.
6. **12 testów `tests/api`, które wcześniej żywiły się cudzymi danymi** (patrz §2).
   Przechodzą po izolacji — ale czy nadal testują to samo? Jeśli test przechodził
   dzięki przebiegowi zostawionemu przez inny test, to po izolacji może testować
   pustą ścieżkę. **Sprawdź każdy z nich indywidualnie.**
7. **V12K-269 zmienia odciski wszystkich 9 analiz.** W testach nie było przypiętych
   twardych odcisków (zmierzone), ale Opus **nie sprawdził archiwów projektów ani
   wydanych już raportów** — jeśli gdziekolwiek zapisano `analysis_id`, przestanie
   pasować. → Sprawdź `project_archive` i eksporty.
8. **Testy e2e (Playwright) nie były uruchomione ani razu w całej sesji.**
   → `npm run test:e2e` i `npm run test:e2e:real`.
9. **mypy — 273 błędy** to dług nazwany wcześniej; ta sesja go nie zmierzyła
   i nie ruszyła.
10. **Łańcuch kontekstów dowodowych celowo NIE przemianowany** (V12K-267): konteksty
    `VoltageProfile`/`Normative`/`ProtectionInsight`/`ProtectionCurves`/`CoverageScore`/
    `Sensitivity`/`LFSensitivity`/`Recommendation` kopiują się „po nazwie pola" przez
    `getattr(ctx, "trace_id", None)`, więc częściowe przemianowanie **nie zapala błędu**,
    tylko po cichu podstawia `None`. V12K-269 dołożył tam `run_id` addytywnie
    (bezpiecznie), ale **samo `getattr` z wartością domyślną zostaje jako krucha
    konstrukcja**. → Rozstrzygnij, czy zamienić na jawny, typowany przepis.

---

## §4. Decyzje, które Opus podjął sam — do Twojego rozstrzygnięcia

| # | Decyzja | Uzasadnienie Opusa | Co zweryfikować |
|---|---|---|---|
| D1 | `case_name` zostaje dla prawdziwych etykiet, dochodzi `case_id` | jedna droga (`canonical_run_views`) niesie realną etykietę, pięć serwisów wpychało UUID | czy podział jest właściwy dla raportów |
| D2 | Z odcisku analizy wypadają `run_timestamp`, `project_name`, `case_name`; zostają `snapshot_id`, `trace_id` | zegar i etykiety nie są wejściem obliczenia | czy `trace_id` na pewno wszędzie jest treściowy |
| D3 | Baza testowa w pamięci (`mode=memory&cache=shared`) zamiast pliku | pomiar: 29 s wobec 80 s przy 531 testach | czy izolacja per test nie ukrywa wycieków stanu w produkcie |
| D4 | Nazwa kanoniczna `bus_przylaczenia_ref` | punkt przyłączenia to SZYNA, nie osobny byt | czy nazwa zgodna z kanonem terminologii |
| D5 | 13 wpisów allowlisty `ui_no_physics` usuniętych, baseline 22 → 5 | przedmiot wyjechał z UI do backendu w `dc525539` | czy obniżenie to pomiar, nie rozluźnienie progu |

---

## §5. ZARZUT WŁAŚCICIELA — ekrany bez wizji

> „Znowu ekrany są nieprzemyślane, od pierwszego do ostatniego klika są oderwane od
> siebie, niezaplanowane zlepki bez wizji."

**Powiedz to sobie wprost: ta sesja tego nie dotknęła.** Pięć kart Opusa to higiena
kontraktów i backendu — nazwy pól, determinizm odcisku, izolacja bazy, migracja klucza.
**W tej sesji nie powstał ani jeden nowy ekran ani kreator**, więc zarzut dotyczy stanu
zastanego, który ta sesja zostawiła nienaruszony — a wpięcie znacznika świeżości w 7
ekranów zostało zrobione **bez obejrzenia choćby jednego z nich**, co ten zarzut
dokładnie potwierdza w praktyce.

Twoje zadanie właściwe — **opcja MAX, osobiście, nie delegować**:

1. **Przejdź FLOW E1–E8 jako projektant sieci**, klikając realnie, od pierwszego do
   ostatniego klika. Zanotuj każde miejsce, gdzie: nie wiadomo, co dalej; stan zerowy
   nie mówi, czego brakuje; wynik nie prowadzi do decyzji; ekran nie wie, skąd
   przyszedłeś.
2. **Zrób inwentarz okien i kreatorów** — dla każdego: po co jest, z czego bierze dane,
   gdzie te dane spływają dalej. Kreator, który nie ma odbiorcy wyniku, jest wyspą.
3. **Zaprojektuj łańcuch, nie ekrany.** Kontrakt ekranu prowadzącego wg
   `docs/uiux/FLOW_PROJEKTANTA_2026-07.md`: cel jednym zdaniem · tor pracy z akcjami
   naprawczymi · uczciwe stany zerowe · jawny następny krok · język inżynierski.
4. **Dopiero potem wdrażaj**, kartami, z bramkami — i po każdym etapie zrzuty żywej
   aplikacji w obu motywach na stałej stronie oceny.

Punktem wyjścia niech będzie audyt siedmiu soczewek (zadanie #79 w liście zadań:
projektant sieci, zwarciowiec, zabezpieczenia, rozdzielnie, katalogi/Reference Engine,
przyłączenia/OZE, UX/IA) — **przed** przebudową, nie po.

---

## §6. Bramki przed scaleniem czegokolwiek

```bash
# backend
cd mv-design-pro/backend && poetry run pytest -q; echo "RC=$?"
poetry run ruff check src tests; poetry run black --check src tests
poetry run python ../scripts/trace_determinism_guard.py

# frontend
cd ../frontend && npm run type-check && npm run lint && npm test
npm run test:e2e            # NIE uruchamiane w tej sesji
npm run test:e2e:real       # NIE uruchamiane w tej sesji

# guardy (z katalogu mv-design-pro)
for g in pcc_zero_guard ui_no_physics_guard arch_guard domain_no_guessing_guard \
         canonical_ops_guard readiness_codes_guard forbidden_ui_terms_guard \
         ui_terminology_guard dead_click_guard guard_ux_flow_v1 local_truth_guard \
         docs_guard utf8_mojibake_guard; do
  python3 scripts/$g.py >/dev/null 2>&1; echo "$g RC=$?"
done
```

**Kody wyjścia łapać BEZPOŚREDNIO** — nigdy `cmd | tail; echo $?`, bo pipe zwraca kod
ostatniego członu. Guard z rc=2 to problem środowiska (brak zależności), nie naruszenie.

---

## §7. Format raportu zwrotnego do właściciela

Po weryfikacji oddaj, w tej kolejności:

1. **Co potwierdzone** — z pomiarem, nie z opisu.
2. **Co obalone** — które twierdzenie Opusa nie wytrzymało próby, i czym to zmierzyłeś.
3. **Co naprawione** — karty własne, z wstrzykniętą regresją jako dowodem.
4. **Ekrany** — zrzuty obu motywów, na stałej stronie oceny, z listą miejsc, gdzie
   łańcuch się rwie.
5. **Dług nienaprawialny w tej kolejce** — z pomiarem, przyczyną i planem. Nigdy cicho.
