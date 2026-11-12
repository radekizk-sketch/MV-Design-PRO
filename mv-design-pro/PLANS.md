# MV-DESIGN-PRO — JEDEN PLAN WYKONAWCZY (rejestr nadrzędny)

**Wersja:** 6.0 (konsolidacja 2026-10-23, misja właściciela „jeden obowiązujący plan wykonawczy")
**Status:** LIVING — **JEDYNY NADRZĘDNY REJESTR POSTĘPU, PRIORYTETÓW I ODPOWIEDZIALNOŚCI** całego produktu.
**Ostatnia aktualizacja:** 2026-11-11 (aktualizacja istniejącego planu wg polecenia właściciela 2026-11-11 pkt 14: role Fable 5.2 / Opus 5.5, kryteria odbioru, pokrycie wizji warsztatu PR #528 w §C.7; `main` = `e973ad2cd` — merge commit PR #489 z czubkiem programu `b2cf550d9` — do czasu scalenia PR #528; drzewo integracji UI/UX `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` = `016ec8c13`). Poprzednia: 2026-10-23
**Kanon (nadrzędny wobec tego planu):** [`docs/v12xx/KANON_V12_XX.md`](docs/v12xx/KANON_V12_XX.md), konstytucja programu konwergencji (`docs/architecture/*`), [`docs/system/`](docs/system/), `CLAUDE.md` (hierarchia dokumentów). Ten plan nie zmienia kanonu — porządkuje wykonanie.
**Część B (od sekcji „Archiwum operacyjne") to historia:** zapis sesji 2026-05…2026-08 zachowany bez zmian treści; nie jest źródłem statusu.

---

## A. Reguły jednego planu

1. **Jedno miejsce postępu.** Status, priorytet, odpowiedzialny i następna czynność każdej karty
   programu istnieją w tabeli §C tego pliku. Dokumenty dziedzinowe niosą WYMAGANIA TECHNICZNE,
   kryteria odbioru i karty (treść zadań) — bez własnych, konkurencyjnych harmonogramów:
   - UI/UX: `docs/uiux/PROGRAM_UIUX_2026-07.md` §12 (karty UX-00…UX-09, kryteria H5-01…H5-05, testy T+01…T+10) oraz §6/§8 (epiki E1–E15, fazy U0–U5 jako mapa zakresu);
   - domena i fizyka: `docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` (wycinki W1–W12, karty `KARTA_W*`), `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` (sekwencja A/B §5, decyzje O-xx §2, rejestr przyrostów §7, bramki §12, karty §14), `docs/plan/KARTY_OTWARTE_2026-09.md`;
   - SLD: `docs/sld/SLD_CAD_SPEC_V3.md` (wiążąca), `docs/plan/PLAN_SLD_REWORK.md` (fazy S1–S8 — historia wykonana; F1–F5 zastąpione), `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` (wymagania);
   - inżynieria 10x: `docs/plan/PLAN_PRZEBUDOWY_10X_2026-07.md` (F0–F4 jako zakres, statusy w §C);
   - stan repo i dług: `STAN_REPO.md` (pomiar, pakiet wznowienia §7); dowody CI i kart: `docs/evidence/CONVERGENCE_EVIDENCE.md`.
   Aktualizacja wiersza w §C jest obowiązkowa przy każdej partii integracji; wiersz w §7 planu A/B
   albo w macierzy §12.3 programu UI/UX NIE zastępuje wiersza tutaj.
2. **Role (przydział właściciela 2026-11-11; zastępuje przydział z 2026-10-15/10-23):**
   **Fable 5.2** — architektura, integracja globalna i najtrudniejsze problemy algorytmiczne
   (projekt rdzeni solverów i wyroczni, kontrakty przekrojowe, scalanie gałęzi i partii do drzewa
   integracji i do `main`); w kolumnie „Odpowiedzialny” jako `Fable 5.2 (architektura)`,
   `Fable 5.2 (integracja globalna)`, `Fable 5.2 (algorytm)`; zapis `Fable 5.2 (…) → Opus 5.5 (…)`
   oznacza projekt po stronie Fable i wdrożenie po stronie Opus. **Opus 5.5** — implementacja,
   konfiguratory, UI/UX; wykonawcy wg `.claude/agents/` (`explorer`, `researcher`, `worker`,
   `worker-rdzeń` — wszyscy Opus 5.5) i `ORKIESTRACJA_AGENTOW.md`; w kolumnie jako
   `Opus 5.5 (UI/UX)`, `Opus 5.5 (worker)`, `Opus 5.5 (worker-rdzeń)`, `Opus 5.5 (explorer)`.
   Do czasu uruchomienia sesji Fable 5.2 zakres „integracja globalna” wykonuje sesja główna
   Opus 5.5 jako architekt sesji (zapis w wierszach integracji). **Bramki:** B-01 (rdzeń FROZEN,
   lista `scripts/rdzenie_b01.py`) — architekt (sesja główna) po niezależnej weryfikacji: pełna
   regresja, sonda liczbowa z podstawą normową, determinizm/hash, iniekcje (dyrektywa 2026-10-15);
   B-02 (werdykt wizualny SLD) — wyłącznie właściciel, **NADAL ODRZUCONE**, nie certyfikuje go
   zielone CI ani agent. Właściciel dostarcza także dane OD-xx.
3. **Zakres bez nowych programów.** Nie istnieje osobny „program SEL", „plan H5", „program SLD"
   ani „panel postępu". SEL Blueframe (`docs/research/sel-blueframe/`) to materiał referencyjny
   i kryteria kart UX-01…UX-07; H5/ENEA to kryteria odbioru karty UX-04 (H5-01…H5-05); GIS/MDI
   to UX-09 = P3, ostatnia pozycja kolejki (decyzja właściciela 2026-10-28); prace 110 kV wyłącznie jako granica zasilania SN (bez pól WN, przekładników,
   napędów, uziemników i osobnego modułu 110 kV).
4. **Status nie jest odbiorem.** Słownik: `DOMKNIĘTA` = dowód w repo (commit + regresja + CI
   albo wiersz dowodowy w §7 planu A/B / `CONVERGENCE_EVIDENCE`); `W TOKU`; `OTWARTA` (karta
   istnieje albo zakres nazwany, praca nierozpoczęta); `DO WERYFIKACJI` (deklaracja bez dowodu
   w repo — liczy się jako nieukończona); `ZABLOKOWANA` (bramka właściciela albo dane
   OD-xx); `ODRZUCONE` (werdykt właściciela); `STOP` (zakaz wdrażania); `ZASTĄPIONA` (tylko §C.5:
   zakres przejęty przez wskazaną kartę, nie liczy się do procentu). Deklaracja „wykonane"
   bez dowodu zostaje `DO WERYFIKACJI`; procent programu liczy wyłącznie `DOMKNIĘTA`. Praca
   zakończona na gałęzi karty, ale niescalona do drzewa integracji, albo scalona do drzewa
   integracji bez scalenia do `main` = `W TOKU` (z opisem miejsca), nigdy `DOMKNIĘTA`; commit „WIP”
   = `W TOKU`. Status otwiera słowo ze słownika; dalszy tekst komórki to opis.
5. **Priorytety:** P0 — ścieżka krytyczna produktu i naprawy funkcjonalno-inżynierskie
   (integracja do `main`, prawdziwe SLD SN, uczciwość wyników, ścieżka projektanta end-to-end);
   P1 — sekwencja A/B i program W po zależnościach, karty rdzenia z audytów; P2 — jakość tekstu,
   dokumenty wynikowe, commissioning; P3 — integracje zewnętrzne, na samym końcu GIS (UX-09).
6. **Identyfikatory są trwałe.** ID z dokumentów źródłowych (W1–W12, UX-00…UX-09, H5-01…H5-05,
   T+01…T+10, U0–U5, E1–E15, AB-*, AB-H*, S1–S8, F0–F4 programu 10x, karty nazwane WIELKIMI
   LITERAMI) nie są przenumerowywane. Kolizje nazw (W1–W5 „wygaszanie mostu wyników" w części B,
   F1–F5 trzech różnych programów, F1–F11 SLD V3) rozstrzyga §D.

## B. Stan bazowy (pomiar 2026-10-23, uzupełnienie 2026-10-28, pomiar 2026-11-11; nie deklaracja)

| Pozycja | Stan | Dowód |
|---|---|---|
| Pomiar 2026-11-11 — źródła | `git log --first-parent` drzewa integracji, `git branch -r` (591 gałęzi zdalnych), `git log -3` i `git rev-list --count HEAD..<gałąź>` każdej gałęzi karty, lista otwartych PR z GitHub (odczyt 2026-11-11 00:10 UTC); liczby testów wyłącznie z istniejących wpisów z datą i drzewem — nowego biegu regresji w tym pomiarze nie było | `git`, GitHub |
| Drzewo integracji UI/UX | `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy` = `016ec8c13` (2026-11-11, scalenie PR #528 — sama dokumentacja); wcześniej `514b0b9b1` (PLANS §C), `655c19af5` (standard KD6, 2026-11-04), `e29e59e2c` (zamknięcie ZU `dabd85c88`), `c5b34bea9` (FIX-KADR `fb111f182`), `ab750bdc6` (ZU odcinek 4 `b1e677ced`), `12b669bca` (FIX-LOM-SCENA `6772d7ba6`), `69d99d19a` (ZU odcinek 3 `a39d8b911`), 2026-10-30 | `git log --first-parent 76a6b42b9..016ec8c13` |
| Gałęzie kart (2026-11-11) | `…-karta-ekrany-eaz` `a78d1ac04` (WIP; +33 commity względem drzewa integracji), `…-karta-ziemnozwarciowe` `810a4311b` (stara seria WIP, tylko `origin`), `…-karta-jedna-sciezka-edycji` `6878f6888` (WIP 4; +19), `…-karta-szablony-pol` `dd3a24f35` (WIP; +38), `…-karta-zu` `6614a3223` (+27), `…-karta-bkr` `29220847a` (INSPEKTOR-POLA-DOMKNIECIE i komunikaty; +28), `…-karta-przerwa-zerowa` `dc70f4c66` (+2), `…-karta-pole-liniowe` `f385804e4` (WIP; +27), `…-karta-pulpit-oze` `b3cdb59c4` (WIP; +28), `…-karta-katalog-pr` `05a8f52e6` (WIP; +19), `…-fix-e2e-a` `d8e9dc5b4` (WIP 10; +27), `…-karta-gpz-dane-analiz` `a40a40a68` (+17), `…-karta-delty-zabezpieczen` `e3e747470` (+52), `…-karta-przeglad-sieci` `b89230f99` (+31), `origin/…-werdykt-migracja` (+18), `origin/…-fix-kadr` (+0, scalona). Czubki zgodne z deklaracją sesji głównej; żadna nie jest scalona do drzewa integracji | `git log -3`, `git rev-list --count` |
| Gałąź programu | `claude/mv-design-pro-twin-audit-u4lhy0` zrestartowana od `main` po scaleniu PR #489 (2026-10-23); dalej tylko commity dokumentacji planu | `git log` |
| `main` | `e973ad2cd` — merge commit PR #489 (298 commitów, 2 213 plików; rodzice `8f7ed3c27` i `b2cf550d9`); bez zmian do 2026-11-11 (`origin/main` = `e973ad2cd`); następna zmiana: PR #528 po zielonym CI (zgoda właściciela 2026-11-11) | GitHub PR #489, `git rev-parse origin/main` |
| CI na `0e7a5e7d6` | 9/9 workflowów zielonych | GitHub Actions |
| Weryfikacja lokalna przed scaleniem #489 | **WYKONANA** na `b2cf550d9` (2026-10-23): backend 38 798 passed, `guardy_z_ci` rc 0, vitest 885 plików + budżety 8 plików, type-check i lint rc 0, e2e 4 shardy (shard 3: `socket hang up` w `kreator-stacji-zrzuty`, powtórka zielona, przyczyna nieustalona) | komentarz pod PR #489 |
| PR otwarte po 2026-10-23 (#493–#528) | 2026-11-11: dopisane #509–#511, #521 (zamknięty), #522–#528 (§C.6); od 2026-10-28 w rejestrze: decyzja dla każdego otwartego PR w §C.6; GPZ SN (#499, #500, #502, #504) = materiał UX-04/* (przegląd: `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md`), GIS (#494–#497, #501, #503, #505) zamrożone do UX-09 | §C.6 |
| Pełna regresja (ostatnia zmierzona) | backend 39 083 passed (KATALOG-APARATURA-WN, 2026-10-23, gałąź UI/UX); vitest 893 pliki / 16 269 (tamże); bramka scalenia partii 2: pytest 38 798, vitest 4 604, guardy RC=0 | plan A/B §7 wiersze 2026-10-23 |
| Bramki gałęzi UI/UX po 2026-10-23 (z istniejących wierszy §C) | 2026-10-29, gałąź UI/UX po ZU odcinek 1 (`76a6b42b9`): pytest 42 075 passed, vitest 16 989, budżety 238, guardy zielone; 2026-10-29, BKR (`687a2ef65`): 41 371 testów backendu, vitest 10 113 + budżety 172; 2026-10-30, `ab750bdc6`: **CZERWONA** — pytest 42 531 passed / 1 failed, vitest 1 niestabilny, pełne e2e 563 passed / 22 failed / 3 nie ruszyły. Po scaleniach FIX-KADR, zamknięcia ZU, KD6 i PR #528 (2026-10-30…11-11) wyniku bramki w repo brak — pierwsza bramka: wiersz INTEGRACJA-2026-11 | §C.1 wiersze UX-04/POLE-ZU-SKLADOWA-ZEROWA, UX-04/POLE-BKR-MODEL, STAN-ZABEZPIECZENIA-2026-10-30 |
| Wizja warsztatu (PR #528) | dokument `docs/research/warsztat-wielosrodowiskowy/WIZJA_WARSZTAT_WIELOSRODOWISKOWY_MV-DESIGN-PRO_SCALONA.md` w drzewie integracji (`06653a797`, scalenie `016ec8c13`); jego §20 ocenia `main` `e973ad2cd` odczytem bez wykonania; wymagania F/W/U przypisane w §C.7 z weryfikacją w kodzie drzewa integracji | §C.7 |
| PR nie do scalenia | #475 (laboratorium dynamiki, RESEARCH ONLY), #488 (audyt rdzenia — źródło kart, „NIE SCALAĆ JAKO ZWALIDOWANEJ NORMY") | plan A/B §14.4 |
| Program UI/UX | stan bazowy **niezweryfikowany po PR #489** — audyt UX-00 pierwszy (PROGRAM §12.6); ostatni audyt bramek U2–U5: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md` (U2 8/11, U3 7/9, U4 3/7, U5 4/9 — sierpień, nieaktualny) | PROGRAM §8, §12.6 |
| SLD | program SCHEMAT-10 S1–S8 i SLD V3 F1–F11 wykonane kodowo (2026-07); audyt wizualny 2026-10-20: **NO-GO**; ocena właściciela rundy H5: **3/10**; B-02 ODRZUCONE | `docs/audit/SLD_WIZUALNY_ODBIOR_2026-10-20.md`, PROGRAM §12.5a |
| Rysunki ENEA (Zeszyt 1 „Stacje dwutransformatorowe 110 kV/SN”, wersja 02.2023-2, obowiązuje od 2024-04-02) | **pliku źródłowego brak w repo z woli polityki praw autorskich** (`local_cache_only_not_commit_pdf`, PR #486); PR #486 i #493 niosą tylko metadane i OCR poza repo — żaden nie zawiera treści Z.2, Z.7, Z.10–Z.12, Z.17 (przegląd 2026-10-28). Oficjalny PDF pobrany 2026-10-28 z adresu operatora do pamięci podręcznej sesji (99 stron, bez commitu); **odczyt rysunków Z.2, Z.7, Z.10, Z.11, Z.11.1, Z.12–Z.17 własnymi słowami wykonany** (Z.10 zweryfikowany niezależnie); bloker „BRAK ŹRÓDŁA” zdjęty dla tych rysunków — interpretacje oznaczone `[INTERPRETACJA]` | `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md` |
| Dane właściciela | pakiety P-A…P-N (`docs/plan/DANE_WLASCICIELA_O59_2026-09.md`) — warunki kart oznaczonych OD-xx; decyzje otwarte: O-5, O-57 (częściowo), O-67, O-74, O-70(c) | plan A/B §2 |

## C. Jedna kolejka zadań

Kolumny: `ID | Obszar | Priorytet | Status | Odpowiedzialny | Zależności | Dowód wykonania | Następna czynność | Kryterium odbioru | Pokrycie wizji`.
„Kryterium odbioru” — sprawdzalny warunek zamknięcia karty dowodem end-to-end (realna ścieżka użytkownika,
kody wyjścia, testy iloczynu cech; dla SLD dodatkowo werdykt właściciela B-02, dla rdzenia FROZEN B-01).
„Pokrycie wizji” — identyfikatory F/W/U z PR #528 obsługiwane przez kartę (pełna tabela w §C.7;
przestrzeń nazw F/W/U ≠ W1–W12 ≠ UX-xx — §D20).
Kolejność w tabeli = kolejność wykonania wewnątrz priorytetu (tory równoległe wg §D.2).
Zapisy `§7 YYYY-MM-DD` odsyłają do wiersza rejestru `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7;
`PROGRAM §12.3` — do macierzy `docs/uiux/PROGRAM_UIUX_2026-07.md`.

### C.1 P0 — ścieżka krytyczna produktu

| ID | Obszar | Priorytet | Status | Odpowiedzialny | Zależności | Dowód wykonania | Następna czynność | Kryterium odbioru | Pokrycie wizji |
|---|---|---|---|---|---|---|---|---|---|
| INT-489 | Integracja gałęzi programu → `main` (PR #489, merge commit, bez squasha) | P0 | DOMKNIĘTA | Fable 5.2 (integracja globalna) | CI 9/9 na czubku; pełna weryfikacja lokalna (backend, `guardy_z_ci.py`, `npm test` dwa kroki, type-check, lint, e2e 4 shardy); porównanie czerwieni z bazą | PR #489 MERGED jako `e973ad2cd`; na czubku `b2cf550d9`: 44 check runy CI success; lokalnie backend 38 798 passed, `guardy_z_ci` rc 0, vitest 885 plików/14 399 passed + budżety 8 plików/193 passed, type-check i lint rc 0, e2e shardy 1/2/4 zielone, shard 3: 2 przypadki `kreator-stacji-zrzuty` (`socket hang up` w przygotowaniu sieci + zależna para dark/light), po jednym powtórzeniu 3 passed — przyczyna zerwania połączenia nieustalona; komentarz z kodami wyjścia pod PR | brak; kolejne partie integracji liczone od `main` | PR scalony merge commitem bez squasha; CI 9/9 na czubku; pełna regresja lokalna z kodami wyjścia w komentarzu PR (spełnione) | — (proces integracji) |
| JEDEN-PLAN | Konsolidacja planów (ta karta) | P0 | DO WERYFIKACJI | Fable 5.2 (architektura); aktualizacje wierszy — sesja główna | — | commit `bafd30392` na `…-karta-jeden-plan` (6 plików dokumentacji, 0 plików aplikacji); 12 guardów dokumentów RC=0, self-testy guardów 40 passed; CI na gałęzi karty: 7 workflowów (e2e filtrowane ścieżką — zmiana bez `frontend/**`/`backend/**`) | wdrożona na `main` w `e973ad2cd` (CI 7/7 na `b2cf550d9`); odbiór planu przez właściciela; dalsze zmiany statusów wyłącznie w tym pliku | odbiór planu przez właściciela; `docs_guard.py` i `plan_ab_zaleznosci_guard.py` rc 0; brak konkurencyjnego rejestru postępu (PR #479 nie scalony); pokrycie wizji PR #528 wpisane w §C.7 | U06 (macierz pokrycia wymagań — §C.7) |
| SZYBKIE-TESTY-2 | Radykalne skrócenie testów (dyrektywa właściciela 2026-10-28): bramka 4515 s (backend 41 029 testów 3327 s, vitest 649 s — environment jsdom 457 s, collect 283 s), wybór wpływem zmiany zgrubny przy zmianie `enm/models.py`, `--dist loadfile` niezrównoważony; od razu: testy celowane w trakcie kart, jedna bramka na kartę pod wspólną blokadą `flock /tmp/claude-0/bieg_ciezki.lock` (obciążenie 15–16 na 4 vCPU przez równoległe biegi) | P0 | W TOKU — etap 1 SCALONY do gałęzi UI/UX 2026-10-29 (`276de31fe`, scalenie `3603487ea`): pełny backend 2485 s → 2151 s (−13 %), kolekcja 392 → 98 s, strażniki `legacy_public_path` 133 → 18 s i `grep_zero` 55 → 2,9 s, liczba testów bez spadku; pomiar `docs/plan/SZYBKIE_TESTY_2_POMIAR.md`. DECYZJA WŁAŚCICIELA 2026-10-29: (a) bramka zostaje nadzbiorem — przyjęta podłoga ~6480 s CPU / liczba rdzeni przy zmianie korzenia grafu importów (`enm/models.py`), wybór pokryciem odrzucony (pydantic-core nie wykonuje linii pól); (b) więcej rdzeni — wymaga zmiany po stronie właściciela (środowisko sesji 4 vCPU, runner CI `ubuntu-latest`); dalsze przyspieszenie z optymalizacji samych testów | Opus 5.5 (worker); liczba rdzeni — właściciel | — | `scripts/bramka_scalenia.py`, `frontend/vite.config.ts` | tabela przed/po pod blokadą; liczba testów bez spadku; pełny bieg w CI zostaje; czas bramki skaluje się z liczbą rdzeni | tabela czasów przed/po pod blokadą `flock`; liczba testów bez spadku; pełny bieg w CI bez zmian; czas bramki skaluje się z liczbą rdzeni (pomiar) | — (infrastruktura testów) |
| SYNC-MAIN-UIUX | Gałąź wątku UI/UX (`…-karta-uiux-przemyslowy`, `fa129e7d`, 46 commitów za `main`) dostaje gałąź programu (`main` `e973ad2cd` + JEDEN-PLAN) merge commitem; dokumenty gałęzi UI/UX dostają nagłówek „karty wykonawcze UX-xx, bez własnego statusu” (§D.15) | P0 — warunek wszystkich kart UX-04 | W TOKU — scalenie programu na gałęzi UI/UX wykonane 2026-10-28 (`1465336df` wypchnięty: scalenie `a913dfb36`, strażniki `8ff953fe6`, scalenie programu `f44e042f6`, U_m ≥ U_s z jednego źródła `65bf34150`, W023 + kasacja `auto-populate` `1465336df`; bramka scalenia rc=0 — 41 029 testów backendu, vitest 16 504, `guardy_z_ci` zielone; scalenie do `main` wyłącznie za zgodą właściciela) | Fable 5.2 (integracja globalna); wykonanie — Opus 5.5 (worker-rdzeń) | INT-489 | próbne scalenie: 322 pliki w konflikcie (4 167 bloków, większość w fiksturach generowanych — regenerowane generatorami, nie ręcznie) | commit scalający + UX-05/STRAZNIKI-GALEZI-UIUX; pełna regresja backendu i vitest na drzewie scalonym przez sesję główną; push gałęzi UI/UX | merge commit `main` → gałąź UI/UX bez znaczników konfliktu; bramka scalenia rc 0 i pełna regresja backendu + vitest na drzewie scalonym; CI 9/9; scalenie UI/UX → `main` wyłącznie za zgodą właściciela | — (integracja) |
| E2E-ZERWANE-POLACZENIE | `socket hang up` przy `POST /api/projects` w przygotowaniu `e2e/kreator-stacji-zrzuty.spec.ts` (shard 3 weryfikacji PR #489), zamaskowany `retries: 1` | P0 | OTWARTA | Opus 5.5 (worker) | — | hipotezy z kodu (2026-10-28): keep-alive uvicorna 5 s vs połączenie klienta Node (`playwright.config.ts:126-127`), kolizja portów shardów lokalnych (`playwright-run.mjs:14`), ciężki bieg wykonawcy w procesie API (`wykonawca.py:225`) | odtworzenie przyczyny pomiarem, naprawa u źródła, test rozstrzygający; zerwane połączenie z żywym backendem to defekt, nie flake | przyczyna `socket hang up` odtworzona pomiarem; test rozstrzygający czerwony bez naprawy i zielony po niej; e2e 4 shardy zielone bez powtórzenia maskującego (`retries`) | — (wiarygodność e2e dla wszystkich W) |
| UX-00 | Audyt stanu bazowego UI/UX po PR #489 (rzeczywisty HEAD, nie raport sierpniowy) | P0 | W TOKU (audyt statyczny kodu 2026-10-28 na `fa129e7d`; biegi e2e i zrzuty po SYNC-MAIN-UIUX) | Opus 5.5 (UI/UX) | INT-489 (HEAD), T+01…T+10 z `docs/research/sel-blueframe/KONTRAKT_DLA_OPUSA.md` §3 | `docs/uiux/AUDYT_UX00_2026-10-28.md`: UX-01 „+” BRAK (tylko menu prawego kliku), UX-02/03/04/05 CZĘŚCIOWE, UX-06 BRAK; T+08 JEST, T+06 POZORNE, pozostałe CZĘŚCIOWE; 0 testów T+01…T+10 w repo; H5-01 BRAK ŹRÓDŁA w repo, H5-04 BRAK, H5-05 ODRZUCONE | tabela `UX-ID \| jest → wykonano \| commit \| jednostkowe \| E2E real \| zrzuty \| ocena właściciela` (PROGRAM §12.6) | tabela `UX-ID \| jest → wykonano \| commit \| jednostkowe \| E2E real \| zrzuty \| ocena właściciela` na bieżącym czubku; testy T+01…T+10 w repo; zrzuty obu motywów | F42 (stan bazowy UI); punkt wyjścia W01–W22 |
| UX-04 | SLD SN wg rysunków ENEA, funkcji pola i symboliki PN-EN 60617 (H5-01…H5-05; 110 kV tylko granica zasilania; jedna kanwa `SldCanvasV3`). **Przebudowa rozdzielni SN 15 kV GPZ wg przekazania właściciela 2026-10-28** (`docs/uiux/PRZEKAZANIE_GPZ_SN_15KV_2026-10-28.md`): R5 odrzucone, kompozycja pól od podstaw w kolejności standard ENEA (Z.2, Z.7, Z.10–Z.12, Z.17) → typ pola → sekwencja aparatów i porty → geometria QET → połączenia → automatyczny układ → SCADA (tylko ramki `#F05260` zamknięty / `#2CCF93` otwarty, obejmujące cały symbol) → walidacja; wzorzec czytelności e²TANGO-miniSCADA; interaktywny SVG/React, bez obrazów; bez scalania bez zgody właściciela | P0 | OTWARTA (H5 3/10, B-02 ODRZUCONE, audyt 2026-10-20 NO-GO) | Opus 5.5 (UI/UX); projekcja z ENM — Fable 5.2 (architektura) (W7); werdykt — właściciel (B-02) | odczyt rysunków ENEA `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md` (PDF poza repo; Z.1, Z.4–Z.6, Z.8, Z.9 — pola 110 kV, poza zakresem wpisu 11), ENM/PortRef, W7 (SLD jako projekcja ENM) dla trwałej geometrii | PROGRAM §12.5a macierz H5: wszystkie OCZEKUJE/ODRZUCONE | macierz rysunek → aparat/port ENM → symbol → zrzut → werdykt; pary ENEA ↔ SLD; zrzuty obu motywów do oceny właściciela | macierz rysunek ENEA → aparat/port ENM → symbol → zrzut → werdykt kompletna dla Z.2, Z.7, Z.10–Z.17; pełny tor elektryczny od zasilania do odpływu prześledzalny na SLD i obecny w obliczeniu (ten sam ENM); zrzuty obu motywów; werdykt właściciela B-02 | F05, F09, F10, F42; W04, W06 |
| UX-04/GPZ-H5-APARATURA | Cała aparatura pól SN GPZ w ENM/katalogu (U_m 7,2 kV, rola `surge_ground`, sprzęgło z `catalog_ref`, pickery z filtrem napięciowym, „brak danych/nie dotyczy" w karcie technicznej) | P0 | OTWARTA (materiał na gałęzi `…-aparatura-wn-wklad-sn`, nie do scalenia wprost) | Opus 5.5 (UI/UX); B-01 — architekt (sesja główna) po niezależnej weryfikacji | KATALOG-APARATURA-WN ✓ (2026-10-23) | — | karta z inwentarzem klasy, testy iloczynu cech, wpis statusu tutaj i H5-02 | każdy aparat pól SN GPZ w ENM z `catalog_ref`; pickery z filtrem U_m ≥ U_s; karta techniczna z „brak danych/nie dotyczy”; testy iloczynu rodzaj aparatu × napięcie × rola pola; zrzuty obu motywów i B-02 | F10, F21, F28; W09 |
| UX-04/POLE-ZU-SKLADOWA-ZEROWA | Zespół uziemiający SN wg ENEA Z.13 (dławik z automatyczną regulacją + AWSC), Z.14 (dławik ‖ rezystor), Z.15 (rezystor) z transformatorem uziemiającym ZN i uzwojeniem potrzeb własnych 400/230 V jako JEDYNA prawda o uziemieniu punktu neutralnego sekcji SN; kasacja drugiej prawdy `StationAudit2Config.mv_neutral_grounding_ref` (ORM poza ENM) i nadpisań V12.6, trzy domysły w `v126_academic.py` (:1326/:1752/:1843) usunięte; Z_N wariantów (R‖jX, AWSC jako scenariusz przypadku); stała `1e6` w `enm/mapping.py:705` przypięta testem albo zamieniona na odmowę; trzy nazwane przyczyny braku wyniku zerowego (wchłania dawny wiersz GPZ-H5-SKLADOWA-ZEROWA) | P0 | W TOKU — pomiar 2026-11-11: odcinki 2–4 scalone do drzewa integracji (odcinek 2 `4674fb9a5` + naprawa bramki `eeccc9e0a`, odcinek 3 `a39d8b911`, odcinek 4 `b1e677ced` w `ab750bdc6`, zamknięcie biegów `dabd85c88` w `e29e59e2c`); punkt 4 (następca, pola LaTeX, algebra jednostek) gotowy u wykonawcy na `…-karta-zu` `6614a3223` (27 commitów przed drzewem integracji, niescalony; liczba „backend 42 963 passed” to deklaracja sesji głównej — komunikat commitu jej nie zawiera). Historia: odcinek 1 SCALONY do gałęzi UI/UX 2026-10-29 (`f63604f20`, scalenie `76a6b42b9`; bramka sesji głównej rc=0: pytest 42 075 passed w 32 min, vitest 16 989, budżety 238, guardy KOMPLET ZIELONY; B-01 przyjęte sondą — 0 zmian pól liczbowych w 1054 wierszach liczonych wcześniej, 408 wierszy liczonych na nowo z wartością roboczą Z0 wg pasma, ESTIMATED; transformator bez grupy → brak danych; kotwica 1e6 bez liczby w wyniku). Odcinek 2 w toku: katalog B0, TRV domyślne, faza N rozpływu niesymetrycznego nN, cieplne NER (D31); glif ZU po konwencji kafli pola liniowego | Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | inwentarz klasy 2026-10-28 (5 ścieżek uziemienia) | Zeszyt 1 §16, §26.9.6, §26.10.7; IRiESD II.4.5.4.3, VII.4 | bramka rc=0, sonda Ik1/I_C przed–po z podstawą, determinizm; szablon pola ZU i rysunek → POLA-GPZ-ZU-BKR-SZABLONY | bramka scalenia rc 0 na drzewie scalonym; sonda Ik1/I_C przed–po z podstawą normową; determinizm (hash); trzy przyczyny braku wyniku zerowego nazwane; B-01 przyjęte zapisem dowodowym; glif ZU — B-02 | F24, F32; W08, W12 |
| UX-04/POLE-LINIOWE-WZORZEC | Jedno kompletne pole liniowe SN jako wzorzec kanoniczny: łączniki, CT w torze pierwotnym, uziemniki wg funkcji i konstrukcji aparatury, zakończenia kablowe, porty ENM, geometria QET, połączenia, automatyczny układ, ramki SCADA, walidacja | P0 — **pierwsza karta UX-04** | WYKONANA NA GAŁĘZI KARTY (2026-10-28, rozszerzenie 5 i kompletny wzorzec pola 2026-10-29, `…-karta-pole-liniowe`, commity lokalne; czeka na weryfikację sesji głównej i B-02) | wątek UI/UX (Opus); werdykt — właściciel (B-02) | UX-00, GPZ-H5-APARATURA | 9 szablonów pola liniowego GPZ (Z.10 / Z.11.1 / Z.11 × łącznik trójpołożeniowy / wyłącznik stały z odłącznikiem / wysuwny) z portami ENM i odgałęzieniem przekładnika napięciowego, bez gazów fluorowanych w obiektach projektowanych (kod `pole.gaz_fluorowany`, W049, filtr pickerów z backendu), klasa pola ODBIORCZE / MIESZANE / DEDYKOWANE_WYTWORCY z zestawami EAZ i oceną wg kontraktu werdyktu (W050–W057), stan obiektu ISTNIEJACY / PROJEKTOWANY na polu i aparatach, 12 elementów QET EN 60617 z importera (w tym przekładnik napięciowy), kafle stanu łącznika (jedna tabela `STATE_COLOR` dla kanwy, eksportu, legendy, inspektora i SLD v2: zamknięty czerwony, otwarty zielony, nieustalony szary „?", błędny „!"; referencja HMI 2026-10-29, `UX04_POLE_LINIOWE_WZORZEC.md` §10) zamiast ramek SCADA, położenia łączników pola bez gałęzi z menu aparatu (`set_bay_apparatus_position`, jeden resolver celu), walidator jednoznaczności oznaczeń w polu `W063`, kompletny wzorzec pola (profil EAZ obowiązkowa / wariantowa / opcjonalna, obwody wtórne funkcja → rdzeń / uzwojenie / sygnał → wyłącznik, przekładnia Ferrantiego, napięcie zwrotne na karcie pola; §9), okno pola jako wycinek kanwy; ta sama reguła toru z portów w polu stacji (przewody, odczepy, zejście, braki) i wspólna reguła położenia odgałęzień — domknięty dług `S9-12-DLUG-LATERAL-ETYKIETA`; kilka odgałęzień z pól jednej stacji bez skrzyżowań i bez fałszywych węzłów T (znalezisko `buildScene.p1Recenzja` zamienione na asercję zera; pięć instancji klasy, w tym port odejścia i podpis odgałęzienia z pola startowego ciągu zamiast z kolejności ciągów — `UX04_POLE_LINIOWE_WZORZEC.md` §7a); gałąź scalona z gałęzią UI/UX po karcie UX-04/POLE-BKR-MODEL (jedna lista ról i rodzajów aparatury; porty przekładników pola BKR dopisane do jednej listy `PORTY_APARATU_POLA`); macierz i zrzuty: `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md`; wciągnięte/odrzucone z #499/#500/#502/#504: `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md` §13 | pełna regresja backendu, vitest i e2e na drzewie scalonym (sesja główna); zrzuty `docs/uiux/zrzuty/ux04-pole-liniowe/` do oceny właściciela (B-02); znaczenia diod A_L, A_W, RNSN i nieczytelnej diody HMI — do potwierdzenia przez właściciela (§10); luki wzorca z kartami docelowymi (§9.6): stan funkcji SPZ i wiązanie `ProtectionAssignment` z rdzeniem — OCHRONA-ADR022-NASTAWY, napęd w katalogu wyłączników i blokady łączeń — UX-04/LOGIKA-LACZENIOWA, składowa zerowa U0 z pola pomiaru szyn — POLE-ZU-SKLADOWA-ZEROWA; walidacja łączeń i telemechanika pola „Linia SN z generacją" (wymaganie spisane w `UX04_POLE_LINIOWE_WZORZEC.md` §8) — UX-04/LOGIKA-LACZENIOWA; decyzja architekta o rysunku zacisku nN stacji z polem SN między dwoma polami TR (§8, przecięcie szyny nN zmierzone sondą, 0 fixtur); konwencja podpisów zejść kilku odgałęzień jednej szczeliny do werdyktu B-02 (§8: piony co GRID, podpis zawsze po lewej — przy +1/+2 odgałęzieniach silnik etykiet odrzuca 1/2 podpisy, przy +3/+4 zostają 3/4 kolizje podpisu z kablem) |
| UX-04/POLA-GPZ-SZABLONY | Szablony pól rozdzielni SN GPZ spoza pola liniowego wg ENEA Zeszyt 1 (Z.7, Z.12, Z.13–Z.17) zweryfikowane z obrazem strony; decyzje architekta D1 (zespół uziemiający: transformator uziemiający + nośnik `hv_neutral`, jedna operacja przeniesienia uziemienia, bloker dwóch nośników w wyspie SN), D2 (tor transformatora przez pole Z.7), D3 (pole łącznika szyn związane z gałęzią `bus_coupler`, rysunek pionowy A/B); opisy aparatów po lewej (werdykt B-02 pola liniowego) | P0 | W TOKU (gałąź `…-karta-szablony-pol`, commity lokalne 2026-11-05) | Opus; werdykt — właściciel (B-02) | POLE-LINIOWE-WZORZEC | WYKONANE: dane i obwody wtórne Z.7/Z.12/Z.16 zgodne z obrazem strony (`docs/standards/ENEA_Z1_110KV_SOURCE_VERIFICATION.md` od korzenia repo); przekładniki międzyfazowe Z.16 w glifie baterii (s.96); bloker E-W5-04 „dwa uziemione nośniki punktu neutralnego w jednej wyspie galwanicznej SN” (`enm/nosniki_punktu_neutralnego.py`, kanon `earthing.multiple_grounded_neutrals_in_island`); pole AWSC `GroundingConfig.awsc_prad_wymuszenia_a` przeniesione z karty EWALUATORY-ZIEMNOZWARCIOWE; błędna stała portu uziemianego łącznika trójpołożeniowego skasowana | szablony Z.13–Z.15, rola pola zespołu uziemiającego i operacja przeniesienia uziemienia; grupa ZNyn11 poza słownikiem `enm/grupa_polaczen.py` (model zerowy zna zygzak po stronie górnej, słownik go odrzuca); D2 z sondą liczbową; D3 rekord i rysunek pionowy; opisy po lewej z wyrocznią; spec zrzutowy `docs/uiux/zrzuty/pola-gpz/`; rysunek każdego pola vs obraz strony |
| UX-04/POLA-TR-POMIAR-SPRZEGLO | Wszystkie warianty: pole TR strona SN wg Z.7 (odgałęzienie VT za wyłącznikiem, CT 4-rdzeniowy, ogranicznik przy zaciskach TR, przekładnie 1000/1600 dla 15 kV i 800/1200 dla 20 kV, AJEE, ARN, ZS/LRW/różnicowe, OW/ZW od SZR; aparat główny wyłącznik — rozłącznik bezpiecznikowy niedopuszczalny w GPZ); łącznik szyn Z.12 w wariancie jedno- i dwucelkowym (łącznik szyn + wznios), łącznik trójpołożeniowy po obu stronach wyłącznika, CT 2-rdzeniowy, węzeł „szyna B” jako koniec toru, sprzęgło GPZ jako POLE z aparatami (kasacja drugiej reprezentacji: gałąź `bus_coupler` bez pola), automatyka SZR jako obiekt modelu w polu łącznika szyn (dziś brak w całym repo); pole pomiaru napięcia Z.17 po jednym na sekcję, VT 3-uzwojeniowy z otwartym trójkątem, bez wyłącznika — zabezpieczenia przypinane do pola, nie do wyłącznika (`ProtectionAssignment.breaker_ref` wymagany); 110 kV wyłącznie jako granica modelu | P0 | W TOKU — pomiar 2026-11-11: szablony Z.7, Z.12, Z.16 zweryfikowane z obrazem strony Zeszytu 1 (`526598a52`) i praca D2 (pole TR Z.7) / D3 (sprzęgło) na `…-karta-szablony-pol` `dd3a24f35` (WIP, 38 commitów przed drzewem integracji, niescalone); pole pomiaru Z.17 i SZR jako obiekt modelu — nierozpoczęte | Opus 5.5 (UI/UX); werdykt — właściciel (B-02) | POLE-LINIOWE-WZORZEC (infrastruktura wspólna z rozszerzenia 4) | `/tmp/claude-0/inwentarz_pol_gpz.md` §1, §2, §5; `/tmp/claude-0/enea/POLA_GPZ_WYMAGANIA.md`; materiał PR #502 | start od commitu wzorca; testy iloczynu wariantów; zrzuty obu motywów do oceny właściciela; Metoda wzorca (właściciel 2026-10-29): każdy szablon pola = SLD wg rysunku ENEA + aparatura z parametrami dla EAZ i obliczeń + profil funkcjonalny EAZ na istniejącym słowniku `funkcje_eaz` (obowiązkowa / wariantowa / opcjonalna, ze źródłem i statusem weryfikacji) + powiązania funkcja ↔ rdzeń CT / uzwojenie VT ↔ wyłącznik ↔ blokady jako dane + stany i sygnalizacja + wykaz luk z miejscem integracji; bez nowego modułu EAZ. | warianty pola TR Z.7, łącznika szyn Z.12 (jedno- i dwucelkowy), pola pomiaru Z.17 jako szablony z portami ENM; SZR jako obiekt modelu; sprzęgło jako pole (kasacja gałęzi `bus_coupler` bez pola); testy iloczynu wariantów; zrzuty obu motywów; B-02 | F05, F09, F11, F29; W04, W06 |
| UX-04/POLE-BKR-MODEL | Bateria kondensatorów Z.16: `ShuntCapacitor` z układem (podwójna gwiazda / gwiazda izolowana / gwiazda uziemiona / trójkąt), stopniami, dławikiem ograniczającym, Q(U); przekładnik niezrównoważenia i VT międzyfazowe rozładowcze jako rodzaje aparatów pola; jawne założenie pominięcia w składowej zgodnej SC w śladzie White Box; ścieżka zerowa tylko dla gwiazdy uziemionej; reguły walidatora (w tym IRiESD II.4.5.4.4: wyłączenie TR wyłącza BKR); symbol baterii w SLD v3 | P0 | W TOKU — model scalony do drzewa integracji 2026-10-29, symbol SLD czeka na B-02, `main` bez zmian (`687a2ef65` na gałęzi UI/UX, wypchnięty; bramka scalenia uruchomiona przez sesję główną rc=0 — 41 371 testów backendu, vitest 10 113 + budżety 172, strażniki 4080, `guardy_z_ci` zielone; B-01 przyjęte przez architekta: rdzeń IEC 60909 nietknięty, sonda mv_lv bez baterii identyczna (hash, I_C 5,352 A, SC_3F 7160,670 A, SC_1F 5286,029 A), gwiazda uziemiona I_C +138,564 A = √3·ωC·U; świadoma korekta LF: `loss_kw` typu jako konduktancja; symbol SLD v3 baterii czeka na werdykt B-02; dokument `docs/uiux/UX04_POLE_BKR_MODEL.md`) | Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji; symbol — werdykt — właściciel (B-02) | inwentarz klasy 2026-10-28 §4 | Zeszyt 1 §17, §26.9.7 | bramka rc=0, sonda, zrzuty symbolu obu motywów; szablon pola → POLA-GPZ-ZU-BKR-SZABLONY | model baterii scalony z bramką rc 0 i sondą B-01 (spełnione w drzewie integracji); symbol SLD v3 baterii — werdykt B-02; scalenie do `main` za zgodą właściciela | F33; W13 |
| UX-04/POLA-GPZ-ZU-BKR-SZABLONY | Szablony i rysunki QET pól ZU (Z.13/Z.14/Z.15) i BKR (Z.16) na infrastrukturze wzorca pola liniowego i elementach z kart POLE-ZU-SKLADOWA-ZEROWA i POLE-BKR-MODEL; zestawy funkcji EAZ wg §26.9.6–7 z podstawą | P0 | W TOKU — pomiar 2026-11-11: na `…-karta-szablony-pol` `dd3a24f35` (niescalone): rola pola ZU i szablony Z.13–Z.15 wpięte w `add_sn_bay`/`delete_element` (`76adc271a`), impedancja zerowa ZNyn11 z R0/X0 (`d26f6fe22`), rysunek pola ZU z nośnika modelu i W041 z jednego źródła (`6f9a52d64`), poprawki po oględzinach zrzutów (`e8e4452f8`), przekładniki międzyfazowe pola Z.16 (`3de2c3552`); D3 WIP | Opus 5.5 (UI/UX); werdykt — właściciel (B-02) | POLE-LINIOWE-WZORZEC, POLE-ZU-SKLADOWA-ZEROWA, POLE-BKR-MODEL | — | testy iloczynu wariantów, zrzuty obu motywów; Metoda wzorca (właściciel 2026-10-29): każdy szablon pola = SLD wg rysunku ENEA + aparatura z parametrami dla EAZ i obliczeń + profil funkcjonalny EAZ na istniejącym słowniku `funkcje_eaz` (obowiązkowa / wariantowa / opcjonalna, ze źródłem i statusem weryfikacji) + powiązania funkcja ↔ rdzeń CT / uzwojenie VT ↔ wyłącznik ↔ blokady jako dane + stany i sygnalizacja + wykaz luk z miejscem integracji; bez nowego modułu EAZ. | szablony pól ZU Z.13/Z.14/Z.15 i BKR Z.16 z rysunkiem z nośnika modelu; jeden dawca punktu neutralnego w wyspie SN (bloker dwóch nośników); zestawy funkcji EAZ wg §26.9.6–7 z podstawą; testy iloczynu wariantów; zrzuty obu motywów; B-02 | F09, F24, F32, F33; W04, W12 |
| UX-04/ZLOZENIE-ROZDZIELNICY-Z2 | Złożenie całej rozdzielnicy SN GPZ w jednej operacji `add_grid_source_sn`: Zeszyt 1 Z.2 (2 sekcje, pola nieparzyste A / parzyste B, kolejność ŁS–BKR–ZU–TR–POMIAR–linia z AJEE–linia z napięciem zwrotnym–linie, nośnik kolejności pól) oraz Zeszyt 2 (GPZ jednotransformatorowy: pole linii zasilającej, pole rezerwowe do ZU2, bez SZR SN); reguła kompletności §13 (2 TR, ŁS, 2 ZU, 2 BKR, 2 pomiary) z wyjaśnieniem; rozjazd dokumentu z kodem: `ConnectionConditions` nie niesie S_k,min ani X/R wbrew CLAUDE.md §5/ADR-027 — uzgodnić kod albo dokument | P0 | OTWARTA | Opus 5.5 (UI/UX); rozjazd `ConnectionConditions` ↔ ADR-027 — Fable 5.2 (architektura); werdykt — właściciel (B-02) | POLA-TR-POMIAR-SPRZEGLO, POLA-GPZ-ZU-BKR-SZABLONY | inwentarz §8 | E2E na realnym backendzie: GPZ od kreatora do kompletnej rozdzielnicy, zrzuty obu motywów | jedna operacja `add_grid_source_sn` składa rozdzielnicę Z.2 (2 sekcje) i wariant Zeszytu 2; reguła kompletności §13 z wyjaśnieniem; S_k,min i X/R w `ConnectionConditions` albo poprawiony dokument; E2E na realnym backendzie od kreatora do kompletnej rozdzielnicy; zrzuty obu motywów; B-02 | F04, F05, F09; W04, W06, W08 |
| STAN-ZABEZPIECZENIA-2026-10-30 | Stan pracy zabezpieczonej przy kończącym się limicie tygodniowym. Każda gałąź karty jest wypychana automatycznie co 15 min. Commity „WIP:” są niezweryfikowane; notatki przekazania leżą w dokumentach kart. **Gałąź integracyjna UI/UX:** `…-uiux-integracja-wip` = d729490cd, czyli UI/UX + ZU do b1e677ced + FIX-LOM 6772d7ba6. Nie jest wypchnięta na `…-karta-uiux-przemyslowy`, bo bramka na ab750bdc6 jest CZERWONA: pytest 42 531/1 (parytet assemblera SC_1F_max — szkielet śladu doziemienia, liczby bez zmian, regeneracja w e73b336a1), vitest 1 niestabilny (`kadrowanieWidoku.workspace`, karta FIX-KADR), pełne e2e 563 passed / 22 failed / 3 nie ruszyły (pierwszy pełny bieg od W5-B; karta FIX-E2E-PELNE, gałąź `…-fix-e2e-a`). **Gałęzie kart:** `…-karta-pole-liniowe` (e41837b4e + WIP; decyzje architekta §11.7 pkt 1–8 i duplikaty funkcji EAZ w toku); `…-karta-bkr` (commit 4 98c6f8d20, commit 5 WIP ca5e849cb — I3 iniekcje do domknięcia); `…-karta-zu` (e73b336a1 WIP: parytet SC_1F_max, commit 5 Z_th przez transformator, prąd uziomowy EN 50522, ui_math 145 linii); `…-werdykt-migracja` (190 MIGRACJA strażnika werdyktu, w toku); `…-fix-kadr`; `…-fix-e2e-a`. Kolejność scalania do UI/UX: ZU → FIX-KADR → FIX-E2E → BKR → pole liniowe → werdykt; po każdym bramka `bramka_scalenia.py` + pełne e2e. Main nietknięty; B-02 ODRZUCONE do odbioru właściciela | P0 | W TOKU — pomiar 2026-11-11: po tym zapisie do drzewa integracji weszły ZU do `b1e677ced` (`ab750bdc6`), FIX-LOM-SCENA `6772d7ba6` (`12b669bca`), FIX-KADR-NIESTABILNY `fb111f182` (`c5b34bea9`), zamknięcie ZU `dabd85c88` (`e29e59e2c`), standard KD6 `655c19af5`, PR #528 (`016ec8c13`); nie weszły: BKR (gałąź niesie dziś INSPEKTOR-POLA-DOMKNIECIE), pole liniowe, FIX-E2E (`…-fix-e2e-a`, dziś PROZA-BEZ-SYMBOLI-ASCII), werdykt-migracja (18 commitów przed drzewem); zielonej bramki po tych scaleniach repo nie zapisuje; dalszy tok — wiersz INTEGRACJA-2026-11. Stan z 2026-10-30 | sesja główna (Opus 5.5 jako architekt sesji — zakres Fable 5.2 integracja globalna) | — | — | zielona bramka + pełne e2e na gałęzi UI/UX | wiersz zastąpiony wierszem INTEGRACJA-2026-11 po zapisaniu zielonej bramki i pełnego e2e na drzewie scalonym | — |
| INTEGRACJA-2026-11 | Partia integracji gałęzi kart do drzewa integracji UI/UX (`…-karta-uiux-przemyslowy`, czubek `016ec8c13` z 2026-11-11): kolejność wg gotowości z pomiaru — PRZERWA-ZEROWA (`dc70f4c66`, 2 commity), UX-04/POLE-ZU-SKLADOWA-ZEROWA punkt 4 (`6614a3223`), EWALUATORY-ZIEMNOZWARCIOWE (`7cde8b19e`, `105b64f3d`), INSPEKTOR-POLA-DOMKNIECIE + KOMUNIKATY-BEZ-ID (`…-karta-bkr` `29220847a`), PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA (`b89230f99`), GPZ-DANE-ANALIZ (`a40a40a68`); gałęzie z czubkiem „WIP” — dopiero po domknięciu u wykonawcy; po każdym scaleniu bramka scalenia, po partii pełna regresja backendu, pełny vitest i pełne e2e (ORKIESTRACJA §3a pkt 16) | P0 | W TOKU (pomiar 2026-11-11: `git log -3` każdej gałęzi zgodny z deklaracją sesji głównej; żadna z wymienionych gałęzi nie jest scalona do drzewa integracji — `git rev-list --count HEAD..<gałąź>` od 2 do 52) | Fable 5.2 (integracja globalna) — wykonuje obecnie sesja główna Opus 5.5 jako architekt sesji | gałęzie kart wymienione w wierszach poniżej; B-01 dla PRZERWA-ZEROWA i ZU (architekt) | §B wiersz „Gałęzie kart”; `git rev-list` 2026-11-11 | scalenia w podanej kolejności; zapis kodów wyjścia bramki w wierszach kart; PR do `main` wyłącznie za zgodą właściciela (wyjątek: #528) | bramka scalenia rc 0 po każdej gałęzi; pełna regresja backendu, pełny vitest + budżety i pełne e2e rc 0 na drzewie scalonym; wyniki zapisane z datą i drzewem w §B; `main` zmieniany wyłącznie PR za zgodą właściciela | — (integracja) |
| EWALUATORY-ZIEMNOZWARCIOWE | Ocena każdej funkcji ziemnozwarciowej rejestru (51N, 67N, 59N, Y0>, G0>, B0>, P0>, ZAWSC) — czułość, selektywność, czas działania z werdyktem wyjaśnialnym — z nowego solvera `network_model/solvers/doziemienie_sn.py` (metoda węzłowa sieci zerowej z modelu, 3I0/U0 pola, φ0, Y0, P0, prąd uziomowy wg sposobu pracy punktu neutralnego); kasacja mostu `ground_fault_bridge`; braki nastaw jednym zdaniem, przyczyna niewykonania BRAK_DANYCH / BRAK_METODY | P0 | W TOKU — `7cde8b19e` i `105b64f3d` zakończone u wykonawcy na `…-karta-ekrany-eaz` (33 commity przed drzewem integracji, niescalone); starsza seria WIP `…-karta-ziemnozwarciowe` (`810a4311b`) zastąpiona przez te commity | Opus 5.5 (worker-rdzeń); przegląd fizyki solvera doziemień — Fable 5.2 (algorytm); solver nie jest rdzeniem FROZEN (lista `scripts/rdzenie_b01.py`) — przyjęcie przez architekta | UX-04/POLE-ZU-SKLADOWA-ZEROWA (sposób pracy punktu neutralnego), PRZERWA-ZEROWA | komunikaty commitów: testy iloczynu sposób pracy × funkcja × miejsce zwarcia × nastawa, Kirchhoff sieci zerowej, parytet z SC_1F, AWSC przed/po, e2e 67N natywnymi klikami; piny z pomiarem (mypy 163 → 161, pola kontraktów 4456 → 4513) | integracja w partii INTEGRACJA-2026-11 | bramka scalenia rc 0 na drzewie scalonym; Kirchhoff sieci zerowej i parytet z SC_1F zielone; każda funkcja z werdyktem wyjaśnialnym (BRAK_PODSTAWY / NIE_OCENIONO z przyczyną, nigdy goły status); iniekcja regresji czerwona | F24, F30, F32; W10, W12 |
| EKRANY-EAZ | Przebudowa ekranów EAZ zatwierdzona przez właściciela z 7 korektami: tabele rodzin 51N/67N/Yo>/Go>/Bo>/32N/59N, wykres wskazowy 67N, R_F,max, k_b i k_c z IRiESD ENEA wer. 2.3 pkt II.4.5.4.1.4, uziemienia stacji, karta nastaw; wg standardu warsztatu KD6 | P0 | W TOKU — WIP `a78d1ac04` (2026-11-11), `ca0e6b53f` (front), `9ebf3eb1f` (backend: rejestr rodzin, k_b/k_c z podstawą, algorytm 67N, R_F,max, U_E ≠ U_T) na `…-karta-ekrany-eaz` | Opus 5.5 (UI/UX); elementy SLD — werdykt — właściciel (B-02) | EWALUATORY-ZIEMNOZWARCIOWE, KD6-STANDARD-WARSZTATU | gałąź karty | brakuje: jedna lista warunków 67N z testem mutacji; R_F,max przy 0,9 i 1,1 granicy; rodzina 50/51; e2e i zrzuty | jedna lista warunków 67N (test mutacji czerwony po usunięciu warunku); R_F,max sprawdzone przy 0,9 i 1,1 granicy; rodzina 50/51 w tym samym układzie; e2e na realnym backendzie natywnymi klikami; zrzuty obu motywów do oceny właściciela | F24, F29, F30; W10 |
| PRZERWA-ZEROWA | Jedna ścieżka sieci zerowej `enm.mapping.zbuduj_siec_zerowa` (`enm/mapping.py:1548`): punkt bez drogi zerowej nie dostaje liczby z kotwicy numerycznej Y0 = 1e6 pu; pakiet dowodowy ZIP dla sieci izolowanej daje odmowy 1F-Z/2F-Z z przyczyną `poza_zakresem_iec60909` i statusem NIE_DOTYCZY | P0 | W TOKU — gotowa do integracji: `752156bf4`, `dc70f4c66` na `…-karta-przerwa-zerowa` (2 commity przed drzewem integracji); B-01 przyjęte przez architekta wg deklaracji sesji głównej (golden + niezmienniki + API 454 passed) — wiersza dowodowego w repo brak | Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | UX-04/POLE-ZU-SKLADOWA-ZEROWA; klasa stałych 1e6 — Y0-WYSPY | komunikat `dc70f4c66`: test pakietu API rozdzielony na iloczyn cechy „sposób pracy punktu neutralnego” | integracja w partii INTEGRACJA-2026-11; wiersz dowodowy B-01 w §7 planu A/B | brak liczby z kotwicy 1e6 w każdym wyniku zerowym (test iloczynu sposób pracy × rodzaj zwarcia 1F/2F/2F-Z × ścieżka ekran/ZIP); bramka scalenia rc 0; wiersz dowodowy B-01 z sondą | F24; W08 |
| JEDEN-KLUCZ-KATALOGU | Jeden klucz wiązania katalogowego `<rola>_catalog_binding` w ładunku operacji, jedna mapa przestrzeni rodzaju elementu, nadawcy produkcyjni i strażnicy na wiązaniu; w tej samej gałęzi jedna ścieżka edycji modelu (rejestr pól, karta odcinka SN, konfiguracja stacji i źródła OZE wyłącznie w ENM, zapadka typów 163/21 → 156/19) | P0 | W TOKU — WIP 1–4 (`41c8504bd`…`6878f6888`) na `…-karta-jedna-sciezka-edycji` (19 commitów przed drzewem integracji); zakończone na tej gałęzi: `1f3e1c427`, `b7413792c`, `3c3e31203` | Opus 5.5 (worker) | UX-03 (rejestr pól), SIEC-ZLOTA-KATALOG | gałąź karty | domknięcie WIP u wykonawcy, bramka, integracja | jeden klucz wiązania we wszystkich nadawcach (test iloczynu rodzaj elementu × rola × ścieżka zapisu: kreator / inspektor / import); strażnik kontrolek bez zapisu rc 0; zapadka mypy obniżona z pomiarem; e2e konfiguratora na realnym backendzie | F07, F08, F21; W01; U06 |
| KD6-STANDARD-WARSZTATU | Standard warsztatu inżyniera: ekran KD6 jako kierunek referencyjny całej aplikacji (decyzja właściciela 2026-11-04, kontrakt prezentacji inżynierskiej §10); bez osobnego programu — wdrażanie stopniowe w kartach PULPIT-OZE-KD6, KARTA-POLA-KD6, EKRANY-EAZ, DELTY-ZABEZPIECZEN | P0 | W TOKU — kontrakt zapisany `655c19af5` w drzewie integracji; wdrożenia na gałęziach kart | Fable 5.2 (architektura UI — kontrakt); wdrożenie — Opus 5.5 (UI/UX); werdykt — właściciel (B-02) | — | `655c19af5` (`docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md` §10) | każda karta UI podaje, które reguły §10 wdraża | ekran prowadzący każdej karty spełnia §10 (zrzuty obu motywów, oględziny właściciela); reguły sprawdzalne przypięte testem albo strażnikiem; wzory przez `MathRenderer` z pól `*_latex` | F42; U06 |
| PULPIT-OZE-KD6 | Pulpit OZE wg standardu KD6: wzory w SLD, wykresach kreatorów i panelach wyników renderowane przez KaTeX (strażnik czyta teksty TS parserem, pin 0) | P0 | W TOKU — WIP `b3cdb59c4` (2026-11-11) na `…-karta-pulpit-oze` (28 commitów przed drzewem integracji; zakończony `27e863298` „Wzory w ui/** przez KaTeX”) | Opus 5.5 (UI/UX) | KD6-STANDARD-WARSZTATU, GPZ-DANE-ANALIZ (operator sieci → profil NC RfG) | gałąź karty | domknięcie WIP, bramka, integracja | pulpit OZE z wartościami wyłącznie z backendu; zero surowych wzorów ASCII (strażnik pin 0); e2e na realnym backendzie; zrzuty obu motywów do oceny właściciela | F14, F17, F18, F40, F42; W02, W03, W19 |
| KARTA-POLA-KD6 | Karta pola i konfiguratory GPZ/stacji wg KD6: wiersz pola mówi odejście, aparat i zabezpieczenie z modelu, braki z akcją, liczba z jednostką bez łamania; przejęcia katalogów z PR #507 (i0 transformatorów), #508 (kable NKT i Tele-Fonika), #517–#519 (rodziny e²TANGO) | P0 | W TOKU — WIP `05a8f52e6` (2026-11-11) na `…-karta-katalog-pr` (19 commitów przed drzewem integracji); zakończone `5442dc2f8`, `527aaa895`, przejęcia `bf7bfca1a`, `19e429f77`, `90adfd54c` | Opus 5.5 (UI/UX) | KD6-STANDARD-WARSZTATU, UX-04/POLE-LINIOWE-WZORZEC | gałąź karty | domknięcie WIP, bramka, integracja | karta pola czyta wyłącznie model (test braków z akcją naprawczą); pozycje przejętych katalogów ze źródłem i jakością DATASHEET / ESTIMATED; `inwentarz_katalogow_guard` rc 0; zrzuty obu motywów | F09, F10, F21, F42; W04 |
| GPZ-DANE-ANALIZ | Dane GPZ jako jedna dana ENM czytana przez analizy: typ transformatora 110/SN operacją modelu z tabliczką z katalogu, dane znamionowe rozdzielnicy sekcji w wytrzymałości szyn i łuku; operator sieci jedną daną `header.connection_conditions.operator_sieci` (ADR-027), profil NC RfG źródła dziedziczy operatora (`enm/operator_sieci.py::efektywny_profil_ncrfg`), kasacja `StudyCaseConfig.operator_profile_id` (domyślne „enea” było domysłem) | P0 | W TOKU — `a40a40a68` zakończony u wykonawcy na `…-karta-gpz-dane-analiz` (17 commitów przed drzewem integracji, niescalony) | Opus 5.5 (worker) | UX-04/ZLOZENIE-ROZDZIELNICY-Z2 (S_k,min i X/R w `ConnectionConditions`) | komunikat `a40a40a68` (konsumenci frontu wymienieni) | integracja w partii INTEGRACJA-2026-11 | operator sieci i dane GPZ z jednego źródła w każdym konsumencie (test parytetu front–backend z fikstury); odmowa `connection_conditions.operator_unknown`; bramka scalenia rc 0 | F04, F05, F40; W04, W08; U02 |
| DELTY-ZABEZPIECZEN | Edytor delt scenariusza zabezpieczeń (karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN): jedna konfiguracja sterownika pola w całym systemie, wybór zabezpieczeń przypadku jako delta (ADR-022/ADR-017); jedno rozstrzygnięcie czasu trwania zwarcia (wartość projektanta → nastawy → czas cieplny przypadku → 1 s wg IEC 62271-1 §4.7, ESTIMATED, dowód NIEPELNY) dla aparatury pola, I_th, przewodów SN i kabla toru DER; czas wyłączenia obwodu nN z jednego dostawcy | P0 | SCALONA DO DRZEWA INTEGRACJI 2026-11-11 (partia INTEGRACJA-2026-11) — gałąź `…-karta-delty-zabezpieczen` `e3e747470` scalona w całości merge commitem po scaleniu pola liniowego; strukturę sterownika pola (ADR-022) i terminologię KD6 wzięto ze strony delt, kanon komunikatów (proza słowami, `bladZapytania`) ze strony integracji; odbiór sesji głównej i bramka końcowa partii w wierszu INTEGRACJA-2026-11 | Opus 5.5 (worker); kontrakt delty przypadku — Fable 5.2 (architektura) | OCHRONA-ADR022-NASTAWY, KD6-STANDARD-WARSZTATU | komunikat `e3e747470` | rozdział gałęzi na karty przed integracją albo integracja w całości z bramką | nastawy bazowe w ENM, przypadek tylko wybiera grupę/nakłada deltę (test odrzucenia nastawy poza modelem); jedno rozstrzygnięcie czasu zwarcia czytane przez wszystkich konsumentów (test iloczynu źródło czasu × konsument); bramka rc 0 | F20, F26, F28, F30; W07, W09, W10 |
| PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA | Przegląd sieci: jedna kompozycja (od karty UX-04/SLD-SKALA-I-NAWIGACJA jedna scena w każdej skali — poziomy L0/L1/L2 skasowane), obrys stacji jako uchwyt w każdej skali (warstwa trafień i minimapa z `stacjeSceny`), pismo pełnej nazwy nad podłogą czytelności, sylwetka pola bez wyposażenia, legenda stanów zgodna z UX-04 | P0 | W TOKU — domknięcie u wykonawcy `b89230f99` na `…-karta-przeglad-sieci` (31 commitów przed drzewem integracji, niescalone) | Opus 5.5 (UI/UX); werdykt — właściciel (B-02) | UX-04 (legenda stanów) | komunikat `b89230f99` (decyzje A–E, akceptacja `sld_v3_acceptance.mjs`) | integracja w partii INTEGRACJA-2026-11; zrzuty do oceny | akceptacja `sld_v3_acceptance.mjs` rc 0; test ciągłości toru jednej sceny (dawne L0 ⊂ L1); wyrocznie (g) i (h) z iniekcjami; zrzuty obu motywów; werdykt właściciela B-02 | F06, F42; W01 |
| INSPEKTOR-POLA-DOMKNIECIE | Odcinek z szyny sekcji zawsze przez pole liniowe (wolne albo utworzone w tej samej operacji jak pole wzorcowe sekcji), reguła W058 (pierwotnie W049, przenumerowana przy scaleniu z kartą UX-04/POLE-LINIOWE-WZORZEC, która nadała W049 wcześniej) / `station.segment_without_field`, akcja `przepnij_element_na_pole`, jeden predykat zajętości `enm/zajetosc_pol.py`; inspektor pola bez powtórzeń z jednym źródłem zabezpieczenia; karta K6 (rola pól, aparaty pola z kartą aparatu, zasilanie maks./min.) | P0 | W TOKU — `29220847a` (pkt 2) i `0b8a59b38` (WIP) na `…-karta-bkr` (28 commitów przed drzewem integracji, razem z KOMUNIKATY-BEZ-ID commity 4–12) | Opus 5.5 (worker) | UX-04/POLE-LINIOWE-WZORZEC, UX-03 | komunikat `29220847a`: inwentarz klasy (cztery operacje naprawione, trzy już przez pole), sonda rozpływu i I″k 5 rodzajów stacji × 4 stany pól × 3 operacje | domknięcie pozostałych punktów, bramka, integracja | sonda rozpływu i I″k bez zmiany liczb tam, gdzie pole było; W049 z akcją naprawczą; test iloczynu rodzaj stacji × stan pól × operacja; bramka rc 0 | F05, F09, F10; W04 |
| WERDYKT-MIGRACJA | Migracja rekordów oceny na kontrakt werdyktu wyjaśnialnego (190 pozycji strażnika `werdykt_wyjasnialny_guard`): zgodność referencyjna, nakładka zwarciowa, tokeny stanu, bilans nN, korekta obciążalności, kreator, archiwum | P0 | W TOKU — `origin/…-werdykt-migracja` (18 commitów przed drzewem integracji, niescalone) | Opus 5.5 (worker); kontrakt — Fable 5.2 (architektura) | — | gałąź karty | domknięcie, bramka, integracja | pin `werdykt_wyjasnialny_guard` obniżony do 0 z pomiarem; każdy rekord z wyjaśnieniem (wynik, limit, margines, podstawa, dowód) | U08; F40 |
| FIX-E2E-PELNE | Pełne e2e zielone: pomiar 2026-10-30 — 563 passed / 22 failed / 3 nie ruszyły (pierwszy pełny bieg od W5-B); klasy: klik współrzędnymi tylko w punkt z uchwytem na wierzchu, spoczynek kadru, kotwice kadru stacji, specy do kanonu GPZ-MODEL | P0 | W TOKU — commity WIP na `…-fix-e2e-a` (`d320685fe`…`47ddf75cf`) pod serią PROZA-BEZ-SYMBOLI-ASCII; część także na `…-karta-delty-zabezpieczen` (`7d04fcc0e`) | Opus 5.5 (worker) | INTEGRACJA-2026-11 | — | domknięcie, pełne e2e pod blokadą `flock` | pełne e2e (wszystkie specy) rc 0 na drzewie scalonym bez powtórzeń maskujących; każda naprawa z testem natywnej ścieżki | — (wiarygodność odbioru wszystkich W) |
| OCHRONA-ADR022-NASTAWY | ADR-022 (ACCEPTED 2026-09-30) bez wdrożenia: grupy nastaw 1–4, matryca wyłączeń i IED w ENM — `grep setting_group\|grupa_nastaw\|trip_matrix` w `backend/src` → 0 (inwentarz 2026-10-28 §10); referencja HMI właściciela 2026-10-29 (sterownik polowy, „Bank 1”): aktywna grupa nastaw widoczna w widoku pola i stan funkcji automatyki (SPZ włączone/odstawione, zablokowane/odblokowane) jako dana modelu z jednego źródła; kryterium admitancyjne G0>/Y0> dla sieci kompensowanych w słowniku funkcji z podstawą | P0 | WDROŻONA W DRZEWIE INTEGRACJI 2026-11-11 przez scalenie DELTY-ZABEZPIECZEN (karta OCHRONA-JEDNO-ZRODLO: sterownik pola `ProtectionAssignment` z funkcjami rejestru, grupami nastaw 1–4, macierzą wyzwoleń i wejściami; `Bay.protection_codes`, `protection_ref`, `zrodlo_u0_ref` i `funkcje_eaz_*` skasowane); odbiór sesji głównej | Opus 5.5 (UI/UX); model nastaw w ENM — Fable 5.2 (architektura); rdzeń zabezpieczeń — B-01 — architekt (sesja główna) po niezależnej weryfikacji | zestaw funkcji EAZ w szablonie (rozszerzenie 4 wzorca) | ADR-022 | karta z inwentarzem klasy po scaleniu wzorca | grupy nastaw 1–4, matryca wyłączeń i IED jako dane ENM; przypadek wybiera grupę albo nakłada deltę (ADR-017) — test, że nastawa poza modelem jest odrzucana; aktywna grupa i stan SPZ w widoku pola z jednego źródła; G0>/Y0> w słowniku z podstawą | F30, F31; W10, W11 |
| UX-04/LOGIKA-LACZENIOWA | Walidacja każdej operacji łączeniowej na całej topologii wynikowej niezależnie od sekwencji: blokada niedozwolonych operacji odłącznikami, załączenia na uziemiony tor i nieuprawnionej pracy równoległej TR; zasilanie zwrotne, wyspy, blokady, nieaktualne wyniki; kliknięcie = wybór, przełączenie osobno; jeden ENM, `SldCanvasV3`, renderer CAD/QET, LF/SC, kontrakt K-S2 | P0 | OTWARTA | Opus 5.5 (UI/UX); walidacja topologii wynikowej w backendzie — Fable 5.2 (algorytm); rdzeń — B-01 — architekt (sesja główna) po niezależnej weryfikacji | ENM/PortRef, W7 | materiał GPT: PR #504 (stany łączników z rekordu ENM, tor prądu, audyt bramek nieodebranych) | testy operacji łączeniowych jako iloczyn cech (operacja × stan uziemnika × zasilanie zwrotne × równoległość TR × sekcja); przeniesienie zgodnych części #504 na gałąź UI/UX | każda operacja łączeniowa walidowana na całej topologii wynikowej w backendzie; testy iloczynu operacja × stan uziemnika × zasilanie zwrotne × równoległość TR × sekcja; wynik nieaktualny po przełączeniu oznaczony; kliknięcie = wybór | F19, F34; W05, W11, W14 |
| UX-04/SLD-SKALA-I-NAWIGACJA | Jedna geometria schematu w każdej skali i nawigacja jawna: scena bez skali i poziomu (R1), kamera jako czyste przekształcenie (R2), widoczność napisów z rozmiaru ekranowego względem progu 9 px, wyniki pismem 9 px czytelne od skali 1,0 (R3), tożsamość zawsze czytelna, nazwa stacji i GPZ jako adnotacja o stałej wielkości ekranowej z pierwszeństwem zaznaczenia i alarmu (R4), podłogi toru i znaki stanu (R5), cel kliku wg rozmiaru ekranowego i jedna warstwa trafień (R6), nawigacja po hierarchii z jedną regułą wskazania, klawiszami `+`/`−`/strzałki, historią w obie strony, przelotem kamery, skalą czytania `Shift+1`, powiększeniem oknem, wskaźnikiem skali z menu, kółkiem nad nawigatorem i pamięcią kamery per projekt (R7), render odcinany do okna kamery i obrys bez wnętrza poniżej 3 px (R8), klasa w widoku nN, eksporcie i martwym kodzie v2 (R9); kontrakt `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md` v2.0 | P0 | W TOKU — gałąź `…-karta-skala-naw-scena`: etap 1 `d78c67925`, etap 2 `b4bc1b3ad`, etap 3–4 `ae200e59a`, R8 symbol stacji `7c2227b57`, wejścia na schemat `853a6ab0e`, R7 domknięcie i R4 nazwy kadru całej sieci — commit lokalny karty; niescalone | Opus 5.5 (UI/UX); werdykt wizualny — właściciel (B-02); budżet DOM kadru całej sieci — architekt (sesja główna) | UX-04 (wzorzec pola i geometria pól GPZ z karty pól), PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA, B-02 | strażnik `scripts/sld_scena_niezalezna_od_skali_guard.py` z autotestem; testy `canvas/__tests__/{gestoscInformacji,trafienieKanwy,budzetDom,nawigacjaKamery,gpzDwusekcyjny40,nazwyStacjiPrzegladu}.contract.test.ts(x)`, `przelotKamery.test.ts`, `nawigacjaKamery.workspace.test.tsx`, `nazwyStacjiNaKanwie.test.tsx` z iniekcjami; e2e `e2e/sld-kamera-przelot-okno.spec.ts`; pomiar nazw w skali dopasowania całej sieci (plan etykiet, sieć wzorcowa 52 stacji): 1000×560 — 48 z 54 narysowanych, 6 w dymku; 1322×696, 1400×900, 1920×1080 — 54 z 54; pomiar DOM sieci 52 stacji: cała sieć 1200×800 1 867 przed kartą → 21 844 po etapie 2 → 5 897 po R8, kadr roboczy 8 296 → 26 160 → 1 806; eksport PDF/DXF pełnej sceny z napisami pionowymi (obrót sztywny w `export/svgPrimitives.ts`, iniekcja 4 czerwone); piny poziomów i rogów odbioru 82 560/171 → 100 256/513 z atrybucją do regeneracji fikstury (ten sam kod na fiksturze sprzed regeneracji daje 82 560/171) | odstępstwo do decyzji architekta: skala czytania pod `Shift+1` zamiast `1` (cyfry `1–N` przełączają przestrzenie pracy, `ui2/shell/AppShell.tsx`); decyzja architekta o budżecie 3 000 węzłów kadru całej sieci; werdykt wizualny zrzutów przed/po (B-02); okno renderu w trakcie przelotu to suma okien startu i celu (kadry pośrednie dalekiego przelotu mogą mijać obiekty spoza obu okien); wykryte przy karcie, poza jej granicą (kompozycja sceny, karta pól — `compose/gpz.ts`, `scene/buildScene.ts`): (1) czas budowy sceny rodziny H po regeneracji fikstury referencyjnej (symboli 528 → 1501) — `buildScene.p1Recenzja` 3 546/9 704/21 347 ms wobec 2 000/5 000/11 000 i `schemat10s7p4` H 3 654 > 3 000 ms; gorący punkt `compose/apparatusSequence.ts` `torPolaZPortow` (naprawa u wykonawcy pól `811df222c`, gałąź `…-karta-rozdzielnica-sn-korekta`; dawny wpis `layout/apparatusSequence.ts:183` był błędny) przeliczany wielokrotnie z `layout/measure.ts` `stationSnColumnLayout` — budżety NIE podniesione; (2) test lokalności „+1 stacja na ogonie magistrali” (`p1Recenzja`); (3) odgałęzienie zagnieżdżone GPZ dwusekcyjnego 40 (`scene/buildScene.ts` `resolveBranchOrigin`): stacje 2.03-K, 3.03-K, 4.03-K poza rysunkiem — przypięte w `gpzDwusekcyjny40.contract.test.ts`; (4) 18 kolizji `wezelOdczepuPozaKaflem` na fiksturze GPZ dwusekcyjnego 40 z toru magistrali `segment_R`; adnotacje wyników z karty nakładek traktują nazwy jako przeszkody przez `rozmieszczenieNazw(plan)` — wpięcie do `resultLabelExtraObstacles` należy do karty nakładek wyników | testy iloczynu (a)–(g) karty z iniekcjami; e2e kółka bez skoku geometrii, dwuklik/okruszki, okno, klawisze, nawigator, powrót do przestrzeni; zrzuty obu motywów 1440×900 i 1280×720; werdykt właściciela B-02 | F42; W01 |
| UX-01 | Inteligentny „+" w legalnych punktach elektrycznych (T+01, T+04, T+05; H5-04) | P0 | OTWARTA (mechanizmy istnieją: `SldCommandService`, `sldActionExecutor`, operacje domenowe — do oceny) | Opus 5.5 (UI/UX) | UX-00; PortRef; W7 | PROGRAM §12.3 | ocena istniejących mechanizmów → karta naprawcza; dowód na tym samym SLD | „+” tylko w legalnych punktach elektrycznych z odmową backendu; T+01, T+04, T+05 jako testy e2e natywnymi klikami na tym samym SLD; H5-04 | F06, F07, F42; W01, W06 |
| UX-02 | Automatyczna topologia i rozmieszczenie: stacja na odcinku, pierścień, DER, portal nN, odmowa backendu (T+02/03/06/07/08/09) | P0 | OTWARTA | Opus 5.5 (UI/UX); semantyka ciągu (LineRun/Corridor/TopologyView) — Fable 5.2 (architektura) | UX-01 | PROGRAM §12.3 | j.w. | stacja na odcinku, pierścień, DER, portal nN i odmowa backendu jako operacje domenowe z automatycznym układem; T+02/03/06/07/08/09 zielone; jedna semantyka ciągu w widoku sieci, ciągu i stacji | F06, F07, F08, F12, F14; W01, W04, W05, W06 |
| UX-03 | Inspektor, drzewo, walidacja, źródło danych i status każdej wartości (SEL A07, B01, B03, B05, B06, C03) | P0 | OTWARTA | Opus 5.5 (UI/UX) | UX-00 | PROGRAM §12.3 | j.w. | inspektor, drzewo i walidacja pokazują źródło i status każdej wartości (SEL A07, B01, B03, B05, B06, C03); zmiana wartości wskazuje zależne oceny | F03, F21; U01, U04, U06 |
| UX-05 | Obliczenia i nakładki na ten sam SLD; wynik → wywód White Box → dowód; brak fikcyjnych liczb i pozornych werdyktów | P0 | W TOKU (składowe częściowe, odbiór przekrojowy nieodbyty) | Opus 5.5 (UI/UX); fizyka — Opus 5.5 (worker-rdzeń) w kartach toru S | W2 ✓, W4-1, W5, W6 (dostawcy funkcji); DANE-PRZYJETE-EKRANY; WKLADY-BEZ-ZRODLA | PROGRAM §12.3 | przekrojowy odbiór z E2E na realnym backendzie | przekrojowy odbiór E2E na realnym backendzie: każda liczba na SLD i w wyniku z solvera, wywód White Box, dowód; zero fikcyjnych liczb i pozornych werdyktów (kontrakt werdyktu wyjaśnialnego) | F22, F23, F25, F28; W02, W08; U04, U08 |
| UX-05/WKLADY-BEZ-ZRODLA | Tabela „Wkłady do zwarcia" pomija źródło sieciowe (fałszywy 100 % udział generatora): wiersze z `wklady_zrodel`, szczegół maszyny z `/api/proof/sc3f/contributions` | P0 | OTWARTA | Opus 5.5 (UI/UX) | WKLAD-ZRODLA ✓ (PARTIA-ZWARC) | — | naprawa + test iloczynu (źródło sieciowe × maszyna × falownik × wkład pominięty) | tabela wkładów z `wklady_zrodel` zawiera źródło sieciowe; test iloczynu źródło sieciowe × maszyna × falownik × wkład pominięty; suma wkładów zgodna z bilansem fazorów (BILANS-THEVENIN) | F23; W08 |
| UX-05/DANE-PRZYJETE-EKRANY | Dyskretny zapis danych przyjętych (ZASADA NR 4) przy każdym wyniku (~35 miejsc `StanDanychWyniku`), `status_danych=UNVALIDATED_INPUT` w trzech emiterach | P0 | W TOKU (`753e1763a`, `5703c2d29` WIP; selektor „najnowszy przebieg" w 11 miejscach bez biegu vitest; backend przerwany z 9 czerwonymi) | Opus 5.5 (UI/UX); kontrakt — Fable 5.2 (architektura) | — | §7 2026-10-23 | domknąć selektor + vitest, 9 czerwonych u źródła, zrzuty obu motywów, integracja po INT-489 | każde z ~35 miejsc `StanDanychWyniku` pokazuje dane przyjęte (ZASADA NR 4); `status_danych=UNVALIDATED_INPUT` w trzech emiterach; 9 czerwonych testów naprawionych u źródła; vitest i zrzuty obu motywów | F03; U01, U08 |
| UX-05/STRAZNIKI-GALEZI-UIUX | Czerwone strażniki gałęzi UI/UX: `domain_ops_unified_guard`, `tsconfig_gate_guard`, `werdykt_wyjasnialny_guard` (próg 1 kV liczony we froncie), ruff `pobierz_zrodla_techniczne.py`, `inwentarz_katalogow_guard` | P0 | DO WERYFIKACJI — wykonane na gałęzi 2026-10-28 (scalenie SYNC-MAIN-UIUX + commit strażników; klasa progów napięcia tabliczki we froncie usunięta — reguły wyłącznie w operacjach, kreatory z próbą `dry_run`; czeka na weryfikację sesji głównej) | Opus 5.5 (UI/UX) | — | — | naprawa u źródła przed kolejnym pushem gałęzi | pięć wymienionych strażników rc 0 na czubku gałęzi UI/UX potwierdzone niezależnie przez sesję główną | — |
| UX-06 | Pełna ścieżka projektanta od GPZ do raportu w jednej aplikacji; T+01…T+10 + Playwright na realnym backendzie, oba motywy | P0 | OTWARTA (odbiór przekrojowy nierozpoczęty) | Opus 5.5 (UI/UX); werdykt — właściciel (B-02) | UX-01…UX-05, W9 | PROGRAM §12.3 | scenariusz §12.5 jako E2E, zrzuty do oceny | pełna ścieżka projektanta od GPZ do raportu jako E2E Playwright na realnym backendzie (scenariusz PROGRAM §12.5) w obu motywach; T+01…T+10 zielone; ocena właściciela | F01, F42, F43; W01–W04, W21 |
| W4-1 / BIEG-ZABEZPIECZEN-Z-MODELU | Ocena zabezpieczeń z nastaw modelu (zacisk z toru pola, odmowy danych, szyny stacji z jednego źródła) | P0 | DOMKNIĘTA przez wykonawcę (`1551dc49`), przeniesiona na partię 6/7 (BIEG-ZABEZPIECZEN-NA-PARTII-6) — odbiór integratora wykonany w partii 7 | Fable 5.2 (integracja globalna) | POLA-W-TORZE ✓ | §7 2026-10-15 (PARTIA-INTEGRACJI-7) | wiersz zamknięty; W4-2 w P1 | spełnione: odbiór integratora w partii 7 | F30; W10 |
| SIEC-ZLOTA-KATALOG | Sieć złota deklaruje katalog, 7 odwołań nie istnieje (zasila sceny harnessu i zrzuty B-02) | P0 | OTWARTA (karta gotowa w `KARTY_OTWARTE_2026-09.md`) | Opus 5.5 (worker) | — | — | wykonać; dowód: harness fikstur generatorem | sieć złota bez odwołań katalogowych spoza katalogu; fikstury harnessu przegenerowane generatorem; strażnik odwołań rc 0 | F21, F42 |
| GOTOWOSC-DER-BACKEND | Próg 87T z `?? 0` daje „niewymagane" przy braku mocy — słownik gotowości z backendu | P0 | OTWARTA (karta gotowa) | Opus 5.5 (worker) | — | — | wykonać; warunek CICHE-ZERO | próg 87T i gotowość DER ze słownika backendu (bez `?? 0` we froncie); test iloczynu brak mocy × profil operatora; uwaga: na `…-karta-jedna-sciezka-edycji` jest `3c3e31203` „Próg 87T z profilu operatora” — do weryfikacji przy integracji | F14, F30 |
| AB-H0b | N-1 V12.6 bez etykiety „szacunek bez rozpływu", stałe V12.6 bez podstawy — lista pozycji | P0 | OTWARTA (lista, karta do napisania) | Fable 5.2 (architektura) (karta) → Opus 5.5 (worker) | AB-H0 ✓ | — | karta z `KARTY_OTWARTE`, wykonanie | N-1 V12.6 z etykietą „szacunek bez rozpływu” albo z rozpływem; każda stała V12.6 z podstawą albo usunięta; lista pozycji zamknięta testem | F34; W14 |
| B-02 | Werdykt wizualny SLD (bramka właściciela) | P0 (bramka) | ODRZUCONE (historia werdyktów: 1/10 2026-05-28; 0/10 i 3/10 sierpień; 5/10 2026-09-02; powierzchnie analityczne 8,5/10 2026-09-10; odpływ nN TT/IT 0/10 2026-10-15; audyt 2026-10-20 NO-GO; runda H5 3/10) | właściciel | zrzuty żywej aplikacji w obu motywach z UX-04/UX-06 | brak jednego rejestru werdyktów — od teraz ten wiersz | po każdej partii UX-04 nowe zrzuty; werdykt tylko właściciela | werdykt właściciela na zrzutach żywej aplikacji w obu motywach, per powierzchnia; zielone CI ani agent go nie wystawiają | F42; wszystkie W (odbiór wizualny) |

### C.2 P1 — sekwencja A/B, program W, karty rdzenia z audytów

| ID | Obszar | Priorytet | Status | Odpowiedzialny | Zależności | Dowód wykonania | Następna czynność | Kryterium odbioru | Pokrycie wizji |
|---|---|---|---|---|---|---|---|---|---|
| AB-1b.3b | Odbiory stanowe rdzenia dynamiki (niezmienniki chwili zero) | P1 | DOMKNIĘTA (partia 7; mutacje 55/55) | Fable 5.2 (algorytm) | AB-1b.3a ✓ | §7 2026-09-30, 2026-10-15 | — | spełnione: partia 7, mutacje 55/55 | F38 |
| DYNAMIKA-W-TLE | Wykonawca biegów w procesie API (202 + odpytywanie, anulowanie, postęp; kasacja Celery/Redis/MongoDB) | P1 (warunek AB-1b.2 pakiet E, AB-1c, AB-6) | DOMKNIĘTA (partia 8) | Fable 5.2 (architektura) | — | §7 2026-10-15/16 | — | spełnione: partia 8 | F38; U04 |
| AB-1b.2 + AB-1d_min | Rdzeń L5: zdarzenia warunkowe, emulator jako stymulus, ogranicznik na prądzie, P_available, kanały; wyrocznia GFL z ogranicznikiem i ΔU od U_pre (pakiety 0/A/B/C/D → E/F/G/H) | P1 (ścieżka krytyczna A/B) | OTWARTA (karta `KARTA_AB_1B2_AB_1DMIN_GFL_2026-09.md`) | Fable 5.2 (algorytm) (projekt rdzenia L5 i wyroczni) → Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | AB-1b.3b ✓, DYNAMIKA-W-TLE ✓ | — | start pakietów 0/A/B/C/D; mutacje M52–M66 | pakiety 0/A/B/C/D → E/F/G/H z wyrocznią GFL; mutacje M52–M66 zabite; determinizm; B-01 z sondą liczbową | F14, F17, F38, F39; W17 |
| KATALOG-DYNAMIKI-BRAKI | Przestrzeń katalogowa maszyny synchronicznej (warunek AB-1c), magazyn: sprawność i okno SOC (warunek AB-4a) | P1 | OTWARTA (szkic §0) | Opus 5.5 (worker); dane — właściciel (OD-17) | dane OD-17 dla magazynu | — | karta; część maszyny synchronicznej bez danych właściciela | przestrzeń katalogowa maszyny synchronicznej i magazynu (sprawność, okno SOC) czytana przez bieg; braki jako wartości robocze ESTIMATED (ZASADA NR 4); uwaga z wizji §20.3 D: typ `Magazyn` (`enm/dynamika_modele.py:320`) już niesie energię, SoC i sprawności — karta zamyka dostawcę i ścieżkę, nie odtwarza modelu | F16, F17; W03, W17 |
| AB-1c | Cztery wymagania NC RfG z kryteriami składowymi, obwiednia jako warunek wstępny, SPGM-B, jeden tor, kasacja `frt_hvrt` | P1 | OTWARTA (szkic §0) | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | AB-1b.2, AB-1d_min, KATALOG-DYNAMIKI-BRAKI (maszyna), DYNAMIKA-W-TLE ✓ | — | po AB-1b.2 | cztery wymagania NC RfG z kryteriami składowymi i obwiednią jako warunkiem wstępnym; SPGM-B; jeden tor; kasacja `frt_hvrt`; werdykt wyjaśnialny każdego kryterium | F15, F16, F39, F40; W18, W19 |
| AB-1d → AB-2 → AB-3 → AB-3b → AB-3c → AB-4a → AB-4b → AB-5 → AB-5b → AB-6 → AB-6b → AB-7 | Dalsza sekwencja A/B (walidacja ANDES, LFSM-O/RoCoF, biblioteka Q/P i silnik indukcyjny, DFIG, BESS RMS, widmo BESS, IEC 60255 i wyspy, CCT/małosygnałowa, filtry i udziały, QSTS/straty roczne/IEC 60076-7, miernik jakości energii) | P1 | OTWARTA (plan A/B §5, §11; strażnik `plan_ab_zaleznosci_guard`) | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | łańcuch wg STAN_REPO §7 D | — | po AB-1c, w kolejności strażnika | każda pozycja sekwencji z wyrocznią niezależną, mutacjami i wierszem §7 planu A/B; kolejność wg `plan_ab_zaleznosci_guard.py` | F13, F15–F18, F31, F33, F36–F39; W11, W13, W15–W17 |
| AB-H1 | Solver harmoniczny `solvers/harmoniczne/` (Y(f), THD/TDD z definicji, skan Z_th(f), migotanie, kryterium emisji) + kasacja funkcji v126 | P1 (tor równoległy H, może biec od zaraz) | OTWARTA (bez karty) | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń) | AB-H0 ✓, AB-1a ✓ | — | karta z §11 i §81 planu A/B; wyrocznie i mutacje | solver `solvers/harmoniczne/` z Y(f), THD/TDD z definicji, skanem Z_th(f), migotaniem i kryterium emisji; wyrocznie i mutacje; kasacja funkcji v126; brak emisji ≠ zerowy wkład | F33, F36; W13, W15 |
| AB-H2 → AB-H3 → AB-H4 | Supraharmoniczne, filtry/udziały/wrażliwość, pomiar jakości energii | P1 | OTWARTA | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń) | AB-H1; AB-3 (migawki); W6-K | — | po AB-H1 | supraharmoniczne, filtry/udziały/wrażliwość i pomiar jakości energii z wyroczniami; dwie osobne ścieżki prognoza / pomiar | F33, F36, F37; W15, W16 |
| W6-K | Niesymetria w czasie, funkcje ziemnozwarciowe, Y_012(f)/Y_abc(f) | P1 | OTWARTA | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń) | W5-A ✓, W5-D ✓, AB-H2 | — | po AB-H2 | niesymetria w czasie i Y_012(f)/Y_abc(f) z wyrocznią; funkcje ziemnozwarciowe w czasie spójne z EWALUATORY-ZIEMNOZWARCIOWE | F24, F36; W15 |
| W5-B → W5-C → W5-T → SZABLONY-NN | Typowany `Bay` z `field_specs`; stan łączeniowy jedna prawda; TT/IT/RCD reszta; szablony nN (W5-A, W5-D, W5-E ✓) | P1 (tor M) | OTWARTA (karty do napisania z `KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1) | Fable 5.2 (architektura) (typowany `Bay`, stan łączeniowy) → Opus 5.5 (worker); B-01 — architekt (sesja główna) po niezależnej weryfikacji | W5-A ✓ | W5-E-TTIT: §7 2026-10-15 | W5-B pierwszy (warunek W4-1 pełnego, W4-2, W7) | typowany `Bay` z `field_specs` jako jedyna reprezentacja pola; stan łączeniowy — jedna prawda w ENM, scenie i biegu (normalny ≠ aktywny, nieznany ≠ zamknięty); TT/IT/RCD; szablony nN; testy iloczynu | F09, F12, F19, F32; W04, W12 |
| W4-0 | `ProtectionCapabilityRegistry` + testy tożsamości SUPPORTED (ADR-022) | P1 | DO WERYFIKACJI (0 trafień nazwy w `backend/src` 2026-10-23 — rejestr może istnieć pod inną nazwą albo nie istnieć) | Opus 5.5 (explorer) | PROT-LTI ✓ (partia 9) | — | pomiar w repo; jeśli brak — karta | pomiar istnienia rejestru zdolności zabezpieczeń pod dowolną nazwą; wynik zapisany; karta, jeśli brak | F30 |
| W4-2 | Funkcje 67/67N, 21, 87T, 25, 50BF, grupy nastaw, TRIP matrix; nastawy jako ASSET w ENM (W4-1 model), override jako delta przypadku (W4-3), kasacja duplikatów IDMT (W4-4) | P1 (tor Z) | OTWARTA | Fable 5.2 (algorytm) (67/67N, 21, 87T) → Opus 5.5 (worker); B-01 — architekt (sesja główna) po niezależnej weryfikacji | W5-B, OD-18 | — | po W5-B; wejście do AB-5 | funkcje 67/67N, 21, 87T, 25, 50BF, grupy nastaw i TRIP matrix z nastawami jako ASSET w ENM; testy iloczynu funkcja × kierunek × grupa × scenariusz; kasacja duplikatów IDMT | F29, F30, F31; W10 |
| W7 | SLD jako projekcja ENM: `SldSemanticGraphV1` z backendu, trwałe nadpisania geometrii w ENM, kasacja `application/sld/**`, `TopologyView` backendu zamiast BFS klienta | P1 (dostawca dla UX-04/UX-01) | OTWARTA | Fable 5.2 (architektura) → Opus 5.5 (worker) | W5 (terminale), CV-4.4 | — | po W5-B/W5-C; koordynacja z UX-04 | `SldSemanticGraphV1` z backendu jedynym źródłem sceny; trwałe nadpisania geometrii w ENM; kasacja `application/sld/**` i BFS klienta; macierz właściciela danych LineRun / Corridor / TopologyView (wizja §21.4) — kasacja tylko konkurencyjnego autorstwa | F06, F12, F42; wszystkie W (projekcje) |
| W8 / CV-6 | Sieć kompensowana G01 end-to-end (Y0 z uziemienia modelu, Petersen, SC_1F → U_dot/U_krok, 51N/67N, wyrocznie OD-3) | P1 | OTWARTA (NOT_BUILT) | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | W4-2, W5 | — | po W5; karta W8-OD3 zależy od W8 i W5 (O-72) | sieć kompensowana G01 end-to-end: Y0 z uziemienia modelu, Petersen, SC_1F → U_dot/U_krok, 51N/67N; wyrocznie OD-3 | F24, F32; W08, W12 |
| BILANS-THEVENIN | Bilans prądów w węźle zwarcia na fazorach (`short_circuit_iec60909.py`, rdzeń B-01) | P1 (kolejka rdzenia z audytu PR #488) | OTWARTA | Fable 5.2 (algorytm) → Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | — | plan A/B §14.4 | pierwsza karta rdzenia po INT-489; sonda liczbowa z podstawą IEC 60909-0:2016 | bilans prądów w węźle zwarcia na fazorach (KCL) w teście wieloźródłowym; sonda liczbowa przed/po z podstawą IEC 60909-0:2016; determinizm | F23; W08 |
| Y0-WYSPY | Szyna SLACK bez impedancji źródła (`core/ybus.py:188`) + inwentarz klasy stałych 1e6 w rdzeniu | P1 | OTWARTA | Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | — (strona `enm/mapping.py` = UX-04/POLE-ZU-SKLADOWA-ZEROWA) | §14.4 | po BILANS-THEVENIN | szyna SLACK z impedancją źródła; inwentarz klasy stałych 1e6 w rdzeniu zamknięty testem (spójnie z PRZERWA-ZEROWA) | F24; W08 |
| CZESTOTLIWOSC | Twarde 50 Hz w `short_circuit_core.py` → parametr sieci | P1 | OTWARTA | Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | — | §14.4 | kolejno | częstotliwość sieci jako parametr w `short_circuit_core.py`; test 50/60 Hz; sonda B-01 | F23 |
| PROFIL-NORMY | Profil IEC 60909-0:2016 jawny w wyniku i śladzie; wydanie 2026 tylko jako odrębny profil zablokowany do czasu tekstu normy (P-N) | P1 | OTWARTA | Fable 5.2 (architektura) → Opus 5.5 (worker-rdzeń); B-01 — architekt (sesja główna) po niezależnej weryfikacji | dane P-N (tekst wydania 2026) | §14.4, §14.1 ostatni wiersz | kolejno | profil IEC 60909-0:2016 jawny w wyniku i śladzie; wydanie 2026 jako odrębny profil zablokowany do czasu tekstu normy (P-N); bez deklaracji 2026 na podstawie tekstu 2016 | F23, F41 |
| ZEROWA-POJEMNOSCI | B0 tylko przy warunku IEC 60909-0 pkt 5.2 f) | P1 | OTWARTA | Opus 5.5 (worker-rdzeń) | UX-04/POLE-ZU-SKLADOWA-ZEROWA | §14.4 | po scaleniu składowej zerowej z wątku UI/UX | B0 tylko przy warunku IEC 60909-0 pkt 5.2 f) — test iloczynu sieć izolowana/kompensowana/rezystancyjna × pojemność | F24 |
| KONSUMENCI-IB | Przegląd konsumentów I_b po SC-IB-ITH-ZRODLA (ResultSet, dowód SC3F, eksport, dobór aparatury) | P1 | OTWARTA | Opus 5.5 (explorer) → Opus 5.5 (worker) | SC-IB-ITH-ZRODLA ✓ (partia 13) | §14.4 | inwentarz klasy, naprawy | inwentarz konsumentów I_b (ResultSet, dowód SC3F, eksport, dobór aparatury) z naprawami i testem każdego konsumenta | F23, F28; W09 |
| SLOWNIK-GENERATOR-PL | Słownik kanoniczny `NAZWY_RODZAJOW_GENERATORA_PL` czytany przez front | P1 | OTWARTA | Opus 5.5 (worker) | — | §14.4 | wykonać | słownik `NAZWY_RODZAJOW_GENERATORA_PL` czytany przez front (parytet z fikstury backendu); rozszerzenie z wizji: symbol SLD każdej technologii źródła (PV, wiatr PMSG/DFIG/SCIG, synchroniczny, BESS) z jednego słownika | F14, F15, F16; U06 |
| SC-WYROCZNIA-SN-TR-NN | Wyrocznia integracyjna GPZ 15 kV – kabel – TR 1000 kVA – odpływ nN (±6 % i ±10 %) | P1 | OTWARTA | Opus 5.5 (worker-rdzeń) | C-TOLERANCJA-NN ✓; stany aparatów — POLA-W-TORZE ✓ | §14.2/§14.4 | wykonać (liczby potwierdzone ręcznie w §14.1) | wyrocznia GPZ 15 kV – kabel – TR 1000 kVA – odpływ nN w tolerancji ±6 % i ±10 %; liczby z §14.1 odtworzone | F11, F23; W08 |
| KSR-SKLAD-DER | Skład PV/BESS szablonów hybrydowych (`apply.py:507`, `:1223` — `i % len(der_options)`) | P1 | OTWARTA | Opus 5.5 (worker) | rozstrzygnięcie karty PR-478; przed O-53b | §14.2 | wykonać | skład PV/BESS szablonów hybrydowych bez `i % len(der_options)`; test iloczynu szablon × liczba DER | F14, F17, F18; W03 |
| SZABLONY-BEZ-DOMYSLOW | Domyślne dane szablonów (`apply.py:231, :324, :482, :948, :1235`; klasa CICHE-ZERO) | P1 | OTWARTA | Opus 5.5 (worker) | sposób uziemienia po W5-B (W5-E ✓) | §14.2 | pozostałe instancje od razu | zero domyślnych danych fizycznych w szablonach (`apply.py`); braki jako wartości robocze ESTIMATED z wpisem w `dane_przyjete` | F14, F21 |
| O-53b | Reguła mocy źródeł × transformator tylko dla jednego źródła; kasacja tras piszących model z pominięciem operacji | P1 (tor D) | OTWARTA (karta gotowa) | Opus 5.5 (worker) | KSR-SKLAD-DER | — | wykonać | reguła mocy źródeł × transformator dla wszystkich źródeł; zero tras piszących model z pominięciem operacji (test tras) | F14, F18, F27; W03 |
| CICHE-ZERO | `?? 0` / `or 0.0` zasilające decyzję (front 258 + 25, backend 57 + 11 + 3); `false_zero_guard` w trybie ścisłym z budżetem 0 | P1 (tor D) | OTWARTA (szkic §0) | Opus 5.5 (worker) | GOTOWOSC-DER-BACKEND | — | karta, wykonanie, zapadka | `false_zero_guard` w trybie ścisłym z budżetem 0; brak `?? 0`/`or 0.0` zasilających decyzję | F03; U01 |
| O-52 | Łagodne rzutowanie pydantic na granicach danych; strażnik AST `strict=True` | P1→P2 (tor D) | OTWARTA (szkic §0) | Opus 5.5 (worker) | ODMOWA-DANYCH-422 ✓ | — | po CICHE-ZERO | strażnik AST `strict=True` na granicach danych rc 0 | U07 |
| ENDPOINTY-BEZ-KONSUMENTA | Kasacja tras bez konsumenta (w tym `/api/switchgear` z martwym modelem — KSR-P0-ZAPIS/POLA) | P1 (tor D) | OTWARTA (karta gotowa) | Opus 5.5 (worker) | ODMOWA-DANYCH-422 ✓ | — | wykonać | trasy bez konsumenta skasowane; strażnik konsumentów tras rc 0 | U06 |
| GRANICE-IMPORTOW + AUTOTESTY-W-DRZEWIE | Strażnik granic importów rdzenia dynamiki (importy względne o poziom za głęboko), autotesty w drzewie | P1 | DO WERYFIKACJI (commity wykonawcy `f1c27d8a`, `ce138c51` na gałęzi programu; odbiór integratora nie zapisany) | Fable 5.2 (integracja globalna) | — | STAN_REPO §7 B | pomiar na czubku; wiersz zamknąć albo kartę dokończyć | pomiar na czubku: strażnik granic importów rdzenia dynamiki rc 0 i autotesty w drzewie; wiersz zamknięty z dowodem | — |
| SZYNY-STACJI-LUSTRO | Przynależność szyny do stacji z jednego źródła (`enm.tor_pola.szyny_stacji`) zamiast dwóch połówek we froncie | P1 | DOMKNIĘTA (partia 6 — `PARTIA-INTEGRACJI-9` wiersz §7 wymienia kartę) | Fable 5.2 (integracja globalna) | — | §7 2026-09-30 (AB-1b.3b-NA-PARTII-6 lista kart partii 6) | — | spełnione: partia 6 | F09 |
| SLD-SUBSTRAT faza 2 | Fikstury SLD generatorem; każdy element modelu rysowany | P1 | DOMKNIĘTA (partia 6) | Fable 5.2 (integracja globalna) | — | §7 2026-09-30 | — | spełnione: partia 6 | F42 |
| UX-07 | Wersje projektu, szkic, cofnij/ponów, porównanie A/B, stany przed/po, sekwencja przełączeń (SEL A11, A12, D01, D04, D05) | P1 | OTWARTA (DO OCENY) | Opus 5.5 (UI/UX); kontrakt wariantu (`NetworkVariation`) — Fable 5.2 (architektura) | W9 (rewizje jako operacja domenowa), W10-2 (`NetworkVariation`) | PROGRAM §12.3 | po P0 UI/UX | wersje, szkic, cofnij/ponów, porównanie A/B i sekwencja przełączeń na realnym backendzie; rozszerzenie z wizji (luka 5): kontrakt trzech wielkości napięciowych (ΔU od inwestycji, różnica do GPZ, odchylenie od U_n) z mianownikiem w każdym konsumencie porównania; zmiana wariantu nie mutuje bazy (test) | F20, F25; W02, W05, W14; U04 |
| W9 | Tok pracy inżyniera: cel projektu z DoD per klasa, NBA E6–E8 z realnych danych, role jako projekcje (ADR-029), rollback do rewizji, CAS w kliencie | P1 (tor D) | OTWARTA | Fable 5.2 (architektura) → Opus 5.5 (worker) | W1 ✓ | — | po W10-1 wg toru D | cel projektu z DoD per klasa; rozszerzenie z wizji (luka 1): model opracowania — cel, zakres minimalny/kompleksowy, środowisko A–D, warunek zakończenia każdego zadania; minimalny kontrakt celu i zakresu dostępny także dla samodzielnej karty kabla (W10-1) bez odwrócenia kolejki; ponowne otwarcie zachowuje kontekst i następną czynność (test) | F01; W01–W22 (start i zakończenie); U04 |
| W10-1 | Dobór przekroju kabla/linii z pakietem dowodowym (IEC 60364-5-52 / IEC 60287 / katalog SN) | P1 (tor D) | OTWARTA | Opus 5.5 (worker); B-01 — architekt (sesja główna) po niezależnej weryfikacji | W1 ✓ | — | pierwsza karta toru D po P0 | dobór przekroju kabla/linii z pakietem dowodowym (IEC 60364-5-52 / IEC 60287 / katalog SN): ranking z odrzuconymi kandydaturami i powodem; ten sam dostawca dla karty samodzielnej i karty w sieci; czas wyłączenia z EAZ | F26; W07 |
| 10x-F0…F1 | Program 10x: bramki CI (F0.1–F0.5), perymetr (F1.1–F1.6); F0.6 ✓ (V12K-199) | P1 | DO WERYFIKACJI (statusy F0.1–F0.5, F1.x nie zmierzone w tej konsolidacji; część zrealizowana przez `guardy_z_ci.py`, `mypy_ratchet_guard`, bramkę scalenia) | Opus 5.5 (explorer) | — | `PLAN_PRZEBUDOWY_10X_2026-07.md` §5–§6 | pomiar per pozycja; wiersz per pozycję po pomiarze | pomiar każdej pozycji F0.1–F0.5, F1.1–F1.6 z dowodem; wiersz per pozycja | — |
| PRZEJSCIA-MIEDZY-SRODOWISKAMI | Luka 6 wizji PR #528 (§21.3): kontrolowane przejścia karta ↔ model, stacja ↔ sieć, pomiar ↔ projekt i podmiana ekwiwalentu zasilania pełną siecią — z podglądem różnic, atomowym zatwierdzeniem i anulowaniem bez częściowych obiektów; zastąpienie ekwiwalentu zachowuje granicę i nie dubluje impedancji TR | P1 | OTWARTA (nowa karta 2026-11-11; składniki w kodzie: `ConnectionConditions` `enm/models.py:216`, granice sieci `application/analyses/granice_sieci.py`, operacje domenowe z `dry_run`) | Fable 5.2 (architektura przejść) → Opus 5.5 (worker) | W7, W9, UX-07, GPZ-DANE-ANALIZ | — | inwentarz klasy istniejących przejść (kreator stacji, import, ekwiwalent GPZ) z plik:linia; karta | każde przejście atomowe (test: anulowanie nie zostawia obiektu; awaria w połowie wycofuje model i dziennik); podgląd różnic przed zatwierdzeniem; próba B → A na niezależnie policzonym układzie bez podwójnej impedancji | F04; W01–W06, W16; U03 |
| REJESTR-USTALEN-OSD | Luka 2 wizji: rejestr pytań i ustaleń OSD (odpowiedzialność, wymagany dokument, zależne oceny; odpowiedź zmienia właściwy zakres bez podmiany historycznych przypadków) oraz wiele punktów/granic przyłączenia w jednym projekcie jako obiekty umowne `GridConnectionPoint` (ADR-027) — pomiar 2026-11-11: `grep -rn GridConnectionPoint backend/src` → 0 trafień (obiekt opisany w CLAUDE.md §5 i strażnikach, nieobecny w kodzie) | P1 | OTWARTA (nowa karta; składniki: `application/analyses/odpowiedz_osd.py:340`, `wniosek_osd.py:112`, `warunki_przylaczenia.py:77`, operator sieci w GPZ-DANE-ANALIZ) | Fable 5.2 (architektura kontraktu) → Opus 5.5 (worker) | GPZ-DANE-ANALIZ, UX-03 | — | inwentarz klasy (wniosek, odpowiedź, warunki przyłączenia, operator) → kontrakt rejestru i `GridConnectionPoint` → wdrożenie | pytanie OSD z zależnymi ocenami (test: odpowiedź zmienia status wskazanych ocen i nie zmienia zamrożonego przypadku); dwa punkty przyłączenia w jednym projekcie z osobnymi `ConnectionConditions`; `pcc_zero_guard.py` rc 0 | F03, F04, F40; W02, W19, W21; U02 |
| REGULATOR-LIMITU-PRZYLACZENIA | Luka 3 wizji: sterowanie wspólnym limitem w punkcie przyłączenia (limity importu/eksportu, punkt pomiaru, opóźnienia, priorytety PV/BESS/odbiór, zachowanie przy utracie pomiaru/komunikacji) jako obiekt modelu z wykonawcą i testem awarii; limit w nagłówku nie jest dowodem regulatora | P1 | OTWARTA (nowa karta; dziś tylko dane: `ConnectionConditions` `enm/models.py:216`) | Fable 5.2 (algorytm regulatora) → Opus 5.5 (worker-rdzeń) | O-53b, AB-4a, AB-4b, REJESTR-USTALEN-OSD | — | karta z inwentarzem klasy (gdzie limit jest dziś czytany) | redukcja eksportu ma identyfikowalnego wykonawcę w biegu (rozpływ i RMS); awaria pomiaru jako osobny przypadek z testem; wyrocznia statyczna limitu; werdykt wyjaśnialny | F17, F18; W03, W11, W17; U05 |
| REFERENCE-ENGINE-WYDANIA | Luka 4 wizji: rozwój istniejącego `reference_engine` (`reference_engine/models.py:119` `ReferenceRule`, `:133` `ReferencePack`) w wersjonowaną bazę norm, standardów OSD i producentów offline — rejestr plików z odciskiem i licencją, fragmenty, status ekstrakcji i recenzji (OCR wzorów z recenzją symboli i jednostek), przypięcie wydań i reguł do opracowania i wyniku; aktualizacja nie podmienia reguł w zamrożonym wyniku | P1 | OTWARTA (nowa karta; materiał: PR #526 EKC — tylko dokument, PR #493 — katalog 25 standardów ENEA, OCR poza repo; bez scalania) | Fable 5.2 (architektura) → Opus 5.5 (worker) | PROFIL-NORMY | — | przegląd #526 i #493 względem `reference_engine`; karta | ścieżka dokument → reguła → konsument → historyczny raport (test: zmiana pakietu nie zmienia zamrożonego wyniku); rozróżnienie treść posiadana / metadane / reguła / wdrożona metoda; brak PDF ENEA w repo (polityka praw autorskich) | F21, F41; W15, W18, W19; U01 |
| MACIERZ-POKRYCIA-OBIEKTOW | Luka 7 wizji (U06): macierz dla każdej klasy obiektu i technologii źródła — dane, katalog, edycja, SLD, analiza, wynik, raport, eksport, test; wykrywa obiekt bez renderera, konsumenta albo śladu w raporcie | P1 | OTWARTA (nowa karta; składnik: `application/analyses/pokrycie_analiz.py:68` `build_pokrycie_view` — pokrycie analiz przypadku, nie macierz klas) | Fable 5.2 (architektura) → Opus 5.5 (explorer → worker) | W7, SLOWNIK-GENERATOR-PL | — | pomiar klas obiektów ENM × warstwy; strażnik albo test macierzy | macierz generowana z kodu (nie ręcznie) i przypięta testem; każda luka ma wiersz §C albo uzasadnienie „nie dotyczy” | F10, F14–F17, F42; U06 |
| GRANICA-RMS-EMT | Luka 8 wizji: jawna granica zakresu RMS w każdym wyniku dynamiki i format importu wyników EMT z identyfikacją narzędzia, wersji i mapowaniem kanałów (brak własnego EMT = integracja wyników zewnętrznych) | P1 | OTWARTA (nowa karta; RMS: `enm/canonical_analysis.py:1985` `_execute_dynamika_rms`) | Fable 5.2 (algorytm i kontrakt) → Opus 5.5 (worker-rdzeń) | AB-1c, AB-1d | — | karta po AB-1c | wynik RMS niesie zakres ważności modelu; import EMT z mapowaniem i testem ponownego odczytu; profil typowy oznaczony jako typowy | F38, F39; W17, W18 |
| KWALIFIKACJA-BESS-HYBRYDY | Luka 9 wizji: rozdzielona kwalifikacja NC RfG i zakres dowodów BESS i układów hybrydowych (macierz wymaganie – obiekt – podstawa – dowód – zakres – ocena – brak; certyfikat, model/firmware, daty WOS); „dokument dostępny” ≠ „spełniono wymaganie” | P1 | OTWARTA (nowa karta; składniki: `application/analyses/certyfikat_zgodnosci.py:83`, `catalog/profiles/nc_rfg/loader.py` (WIPWC); materiał: PR #527 WIP — daty WOS 2025, przegląd certyfikatów, dowody firmware) | Fable 5.2 (architektura kwalifikacji) → Opus 5.5 (worker) | AB-1c, AB-4a, REFERENCE-ENGINE-WYDANIA | — | przegląd #527 względem drzewa integracji; karta | macierz jednego rzeczywistego układu PV + BESS z zakresem certyfikatu; każda pozytywna ocena z dowodem, wersją i autorem; werdykt wyjaśnialny; kompletność dowodu NIEPELNY przy wartościach roboczych | F17, F18, F40; W18, W19 |
| DOBOR-TRANSFORMATORA | Dobór transformatora (F27 wizji — brak karty w §C; W10-1 dotyczy kabla/linii): napięcia, P/Q w scenariuszach (dwukierunkowość PV/BESS/odbiór), rezerwa Q, straty, uk, liczba jednostek, zaczepy i OLTC (`enm/canonical_analysis.py:3194` `_run_oltc_study`), wspólny tor hybrydy; dobór nie sprowadza się do porównania sumy MW z MVA | P1 (tor D) | OTWARTA (nowa karta) | Opus 5.5 (worker); B-01 — architekt (sesja główna) po niezależnej weryfikacji | W10-1 (wspólny wzorzec pakietu doboru), O-53b, UX-04/POLA-TR-POMIAR-SPRZEGLO | — | karta po W10-1 | ranking z odrzuconymi kandydaturami i kryterium ograniczającym; wspólny TR PV + BESS z Q w scenariuszach skrajnych; wyrocznia niezależna; werdykt wyjaśnialny | F11, F27; W04, W09 |
| HOSTING-CAPACITY-ODBIOR | Hosting capacity (F35/W20 wizji — brak wiersza w §C, choć dostawca istnieje: `application/analyses/hosting_capacity.py:304` `build_hosting_capacity_view`, trasa w `api/oze_analysis_runs.py`, rodzaj `HOSTING_CAPACITY` `solver_input/v126_contracts.py:91`, ekran w `ui/workspace/screenCanonRegistry.ts`): odbiór end-to-end — ograniczenie wiążące, marginesy, zakres ważności, wrażliwość na brakujące dane; wynik ≠ bezwarunkowa moc przyłączeniowa OSD | P1 | OTWARTA (nowa karta; dostawca w kodzie, odbioru brak) | Opus 5.5 (explorer → worker); metoda przeszukiwania — Fable 5.2 (algorytm) | UX-05, UX-07 | — | pomiar ścieżki: dostawca → API → ekran → raport; karta naprawcza | każdy kandydat z odtwarzalnym biegiem i kryterium; przykład z ograniczeniem wiążącym napięciowym i prądowym; brak monotoniczności nie ignorowany (test); e2e na realnym backendzie | F35; W20 |

### C.3 P2 — jakość tekstu, dokumenty wynikowe, commissioning

| ID | Obszar | Priorytet | Status | Odpowiedzialny | Zależności | Dowód wykonania | Następna czynność | Kryterium odbioru | Pokrycie wizji |
|---|---|---|---|---|---|---|---|---|---|
| KSR-KRYTERIA-POMIAR | Kryteria T02/T03/T05/T06/T12/T14/T15/T17 i G02/G03/G07/G09/G12/G14 bez karty — pomiar stanu kodu, test albo karta | P2 | OTWARTA | Opus 5.5 (explorer) → Opus 5.5 (worker) | — | plan A/B §14.3 | wykonać po kartach P1 KSR | każde kryterium T/G ma test albo kartę | U06 |
| KOMUNIKATY-BEZ-ID, LICZBY-PL, PL-ZNAKI-2 | Klasy tekstu dla projektanta (identyfikatory maszynowe w komunikatach, format liczb PL, znaki PL) | P2 (tor D) | W TOKU (KOMUNIKATY-BEZ-ID: commity 4–12 „Komunikaty dla projektanta” na `…-karta-bkr`, m.in. `eb6c1fa95`, `3466f02dc`, `d2abdab8b`, `187b21665` — niescalone; LICZBY-PL i PL-ZNAKI-2 OTWARTA) | Opus 5.5 (worker) | — | PL-ZNAKI §7 2026-09-25 (częściowa) | kolejno po P1 toru D | zero identyfikatorów maszynowych w komunikatach dla projektanta (strażnik), format liczb PL i znaki PL — strażniki z pinem 0 | U06; F43 |
| UX-08 | Szablony i instancje, kopiowanie parametrów, eksporty (SEL B08, C04, D06) | P2 | OTWARTA | Opus 5.5 (UI/UX) | UX-03 | PROGRAM §12.3 | po P1 UI/UX | szablony i instancje, kopiowanie parametrów i eksporty (SEL B08, C04, D06) na realnym backendzie; aktualizacja katalogu pokazuje różnice i nie zmienia zamrożonych opracowań | F21, F43; W22; U07 |
| W10-2 | BOM całego projektu, model kosztowy (OD-16), `NetworkVariation`, pakiet do podpisu, rejestr założeń (W10-2a CENNIK-ODMOWY-PAKIETOW ✓ partia 8) | P2 | OTWARTA (częściowo: W10-2a ✓) | Opus 5.5 (worker); kontrakt pakietu — Fable 5.2 (architektura) | W10-1, W9, dane OD-16 | §7 2026-10-16 | po W10-1 | BOM, model kosztowy (OD-16; brak ceny ≠ zerowy koszt), `NetworkVariation` z dostawcą `variation_ref` (dziś brak: `enm/envelope.py:24`), rejestr założeń; rozszerzenie z wizji (luka 10): zamrożony pakiet opracowania odtwarzalny — test ponownego odczytu wejść i wniosków | F03, F20, F43; W21, W22; U07, U08 |
| W11 | Commissioning / as-built: cykl życia, FAT/SAT, iniekcja wtórna, as-built → linia bazowa | P2 | OTWARTA | Opus 5.5 (worker) | W4-2, W9 | — | po W9 | cykl życia, FAT/SAT, iniekcja wtórna, as-built → linia bazowa; pomiar z luką i zmianą przekładni ma ślad (brak próbek ≠ zero) | F37; W16, W22 |
| 10x-F2…F4 | Program 10x: współbieżność, god-file containment, dalsze bramki | P2 | DO WERYFIKACJI | Opus 5.5 (explorer) | 10x-F0…F1 | `PLAN_PRZEBUDOWY_10X_2026-07.md` | pomiar; W-WSPOLBIEZNOSC częściowo w CI-WSPOLBIEZNOSC (V12K-325) | pomiar każdej pozycji z dowodem | — |
| PROZA-BEZ-SYMBOLI-ASCII | Proza dla projektanta bez symboli ASCII (wzory przez KaTeX, liczby w komunikatach doboru słowami i z jednostką); rdzeń dynamiki liściem grafu importów; fikstury ocen frontu zregenerowane (zmiana wyłącznie tekstowa) | P2 | W TOKU — WIP 10 `d8e9dc5b4` (2026-11-11) na `…-fix-e2e-a` (27 commitów przed drzewem integracji) | Opus 5.5 (worker) | KD6-STANDARD-WARSZTATU, PULPIT-OZE-KD6 (strażnik wzorów) | gałąź karty | domknięcie WIP, bramka, integracja | strażnik prozy z pinem 0; fikstury regenerowane generatorem; dowód, że zmiana jest wyłącznie tekstowa (odciski rysunku i liczby bez zmian) | F43; U08 |
| OD-xx dane właściciela | Pakiety P-A…P-N (`DANE_WLASCICIELA_O59_2026-09.md`) — m.in. OD-15 (FRT), OD-16 (koszty), OD-17 (magazyn), OD-18 (nastawy), P-N (tekst IEC 60909-0:2026) | P2 (bramka danych) | ZABLOKOWANA (dane właściciela) | właściciel | — | plan A/B §12 (OD-21) | karty zależne biegną na wartościach roboczych `ESTIMATED` (ZASADA NR 4) tam, gdzie to parametr urządzenia; podstawa limitu pozostaje BRAK_PODSTAWY | dane dostarczone albo wartości robocze ESTIMATED wg ZASADY NR 4 tam, gdzie to parametr urządzenia | U02 |

### C.4 P3 — integracje zewnętrzne (GIS = UX-09 ostatni)

| ID | Obszar | Priorytet | Status | Odpowiedzialny | Zależności | Dowód wykonania | Następna czynność | Kryterium odbioru | Pokrycie wizji |
|---|---|---|---|---|---|---|---|---|---|
| W12 | CAD round-trip (DXF z tożsamością bloków), GIS (WGS84/EPSG), MCP jako lokalna płaszczyzna sterowania (W12-MCP, O-71); CGMES końcówka ✓ (KASACJA-SCL-I-CIM-KLIENT, partia 8) | P3 | OTWARTA (częściowo: CGMES ✓); część GIS przeniesiona do UX-09 (na koniec kolejki) | Opus 5.5 (worker); MCP — Fable 5.2 (architektura) | W7, W9 | §7 2026-10-16 | po W9/W7; GIS wyłącznie w UX-09 | CAD round-trip z dowodem ponownego importu; rozszerzenie z wizji: import dokumentacji OSD z mapowaniem źródła, rozstrzyganiem niejednoznaczności, raportem strat informacji i wykrywaniem różnic przy ponownym imporcie | F02, F43; W01, W21; U07 |
| G11 | Transformatory trójuzwojeniowe | P3 | OTWARTA (poza W1–W12, kanon: „przyszłość") | — | decyzja zakresu | MAPA §8 aneks | brak | decyzja zakresu właściciela | F11 (TR trójuzwojeniowe) |
| UX-09 | GIS, MDI, mapy, import geograficzny, DNP3/SCADA (SEL C01, C02, C05, D07), część GIS z W12 | P3 — **ostatnia pozycja całej kolejki** | OTWARTA (decyzja właściciela 2026-10-28: GIS włączony do planu z najniższym priorytetem, na sam koniec; zastępuje STOP z 2026-10-23, §D.18) | Opus 5.5 (UI/UX) | wszystkie pozostałe wiersze §C.1–C.4 | materiał GPT, niescalony: PR #494–#497, #501, #503, #505 (rundy R05–R15: MapLibre, DIGPRO/dpPower, GPKG, atomowe ENM → LF/SC → SLD) | do tego czasu PR GIS zamrożone: bez scalania i bez kolejnych rund; przy starcie karty przegląd materiału R05–R15 względem `main` | karta startuje po zamknięciu wszystkich pozostałych wierszy §C; przegląd materiału R05–R15 względem `main` | — (GIS poza wizją PR #528: „GIS pozostaje STOP”) |

### C.5 Domknięte wycinki i programy (bez odtwarzania zadań)

| ID | Obszar | Status | Dowód | Kryterium odbioru | Pokrycie wizji |
|---|---|---|---|---|---|
| W1 | Jedna prawda sieci od pierwszego bajtu (import XLSX → ENM, kasacja legacy ORM, CV-4.4) | DOMKNIĘTA 2026-09-09 | MAPA §9/§10, `CONVERGENCE_EVIDENCE` §E/§F | spełnione | F02 (import XLSX); W01 |
| W2 (+ W2-B, W2-C) | Zero fabrykacji — uczciwość ekranów | DOMKNIĘTA 2026-09-09 (odbiór `9bebcb9d`) | MAPA §10, CI 9/9 `39794b58` | spełnione | U08 (uczciwość ekranów) |
| W3 fale 1–3 (+ W3-J, V12.7) | Konwergencja duplikatów fizyki | DOMKNIĘTA 2026-09-16 | `KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md`, `c307e95f` | spełnione | F22, F23 |
| W5-A, W5-D, W5-E | Uziemienie jedną reprezentacją, model fazowy i rozpływ niesymetryczny, TT/IT | DOMKNIĘTE (2026-09-16, 2026-09-30, 2026-10-15) | MAPA §8, §7 2026-10-15 | spełnione | F12, F24, F32 |
| W6-0, W6-1…W6-3 | Bezpieczniki S-1…S-5, fundament czasu | DOMKNIĘTE (2026-09-16/18, 2026-09-30) | STAN_REPO §1–§2; W6-4/W6-5 → AB-1b.1/AB-1c; W6-6 → AB-6b; W6-8 po OD-17 | spełnione | F30, F38 |
| AB-0, AB-1a, AB-H0, AB-1b.1, AB-P1, AB-1b.3a/3b | Fundament A/B: kontrakt werdyktu, dziedziny, rdzeń L5, bieg kanoniczny dynamiki w UI | DOMKNIĘTE | plan A/B §7 2026-09-22…10-15 | spełnione | F38, F40 |
| Partie integracji 1–13 + PARTIA-ZWARC + partia 2 linii programu | Scalenia kart na gałąź programu z pełną regresją | DOMKNIĘTE (ostatnia: `0e7a5e7d6`, CI 9/9) | plan A/B §7 | spełnione | — |
| SC-IB-ITH-ZRODLA, C-TOLERANCJA-NN, WYTRZYMALOSC-PRAD-POLA, CT-JEDEN-WERDYKT, WSPOLCZYNNIK-C-JEDEN-NOSNIK, PROT-LTI, BEZ-POJEMNOSCI, WKLAD-ZRODLA, DETERMINIZM-HISTORII-PROCESU, LINIA-110, PODSTAWA-Q, KATALOG-APARATURA-WN | Karty zwarciowe i katalogowe z audytów PR #477/#488 | DOMKNIĘTE | plan A/B §14.4, §7 2026-10-16…23 | spełnione | F10, F23, F28, F29 |
| POLE-ZAJĘTE, POLA-W-TORZE, DOWOD-CIEPLNY, ODMOWA-DANYCH-422, SLD-SUBSTRAT, SZYNY-STACJI-LUSTRO, ETYKIETA-STACJI-PRZELOTOWEJ, W5-E-TTIT | Partie 6–9 | DOMKNIĘTE | plan A/B §7 2026-09-30…10-16 | spełnione | F09, F12, F28 |
| SCHEMAT-10 S1–S8 (+ GS-1…GS-5) | SLD: gramatyka stacji, etykiety, kolor, motyw, goldeny, layout, LOD (część o poziomach zastąpiona kartą UX-04/SLD-SKALA-I-NAWIGACJA, V12K-354) | DOMKNIĘTE kodowo 2026-07-22/23 (V12K-141/142/146); **nie zamyka B-02** | `PLAN_SLD_REWORK.md` §0 | spełnione kodowo; B-02 nie | F42 |
| SLD V3 F1–F11 | Przebudowa CAD/SCADA wg `SLD_CAD_SPEC_V3` | DOMKNIĘTA kodowo 2026-07-16; odbiór wizualny 2026-10-20 **NO-GO** → UX-04 | część B §3.4, `docs/audit/SLD_WIZUALNY_ODBIOR_2026-10-20.md` | spełnione kodowo; B-02 NO-GO | F42 |
| PLAN_SLD_REWORK F1–F5 | Fazy historyczne | ZASTĄPIONA przez S1–S8 (DoD F1–F5 pozostają `[ ]` i nie są zadaniami) | `PLAN_SLD_REWORK.md` §0 | nie dotyczy (zastąpione) | — |
| U0, U1 (E1, E2, E15) | Program UI/UX: porządek i kanon, powłoka | DOMKNIĘTA 2026-07-15 (część B §3.-1); kryterium „makiety U0.6" nieobowiązujące | PROGRAM §8 | spełnione | F42 |
| U2–U5 (E3–E14) | Program UI/UX: model, obliczenia, specjalistyczne, scalenie | W TOKU (częściowe wg audytu sierpniowego); stan bieżący mierzy UX-00; zadania prowadzą karty UX-01…UX-08 | PROGRAM §8, §12 | mierzy UX-00 | F42 |
| ZWARCIA-PRO F1–F5, V12.6 academic, E13 łańcuch, fale wygaszania mostu wyników W1–W5 (część B) | Programy zamknięte 2026-07 | DOMKNIĘTE | część B §3.-2, §3.-1 | spełnione | F23 |
| PR #490, #491 | Pakiet SEL Blueframe; UX-04 = H5/ENEA/PN-EN 60617 | DOMKNIĘTA — scalone 2026-10-23 na gałąź programu, w `main` przez #489 | GitHub | spełnione | F42 |

### C.6 Otwarte PR — decyzja integratora (2026-10-28, uzupełnienie 2026-11-11)

Pomiar: `git cherry` każdego PR względem `main` `e973ad2cd` i gałęzi programu — żaden commit tych PR nie jest scalony; decyzja wskazuje, czy treść weszła inną drogą, czy ma następcę. PR zamyka się wyłącznie z komentarzem wskazującym następcę. Uzupełnienie 2026-11-11: lista otwartych PR z odczytu GitHub 2026-11-11 00:10 UTC; nowe PR (#509–#511, #521–#528) wpisane na początku tabeli.

| PR | Treść | Decyzja | Następca / wiersz §C | Kryterium odbioru (zamknięcie PR) | Pokrycie wizji |
|---|---|---|---|---|---|
| #528 | scalona wizja wielośrodowiskowego warsztatu (dokument `docs/research/warsztat-wielosrodowiskowy/WIZJA_WARSZTAT_WIELOSRODOWISKOWY_MV-DESIGN-PRO_SCALONA.md`, wyłącznie dokumentacja); scalony do drzewa integracji `016ec8c13` | DO SCALENIA do `main` po zielonym CI — zgoda właściciela 2026-11-11 (wyjątek od zasady „PR do `main` za zgodą przy każdym PR”); wymagania F01–F43, W01–W22, U01–U08 przypisane w §C.7; dokument jest PROPOZYCJĄ mapowania, nie dowodem implementacji | §C.7; JEDEN-PLAN | CI zielone na czubku PR; scalenie; §C.7 aktualne | wszystkie F/W/U |
| #527 | [WIP] NC RfG: daty WOS 2025, przegląd certyfikatów, dowody firmware i bramki (szkic) | MATERIAŁ; bez scalania w obecnej postaci — przegląd względem drzewa integracji w karcie | KWALIFIKACJA-BESS-HYBRYDY, AB-1c | PR zamknięty z komentarzem wskazującym następcę albo przepisany kartą na gałąź UI/UX z bramką | F39, F40; W18, W19 |
| #526 | [ARCHITECTURE] EKC: globalna wersjonowana baza norm (tylko dokument) | ANALIZA; bez scalania — rozwój istniejącego `reference_engine`, nie nowy moduł | REFERENCE-ENGINE-WYDANIA | PR zamknięty z komentarzem po przeglądzie w karcie | F41; U01 |
| #525 | [SZKIC] SLD-CZYTELNOSC-INSPEKTOR — nie scalać | SZKIC B-02; bez scalania bez werdyktu właściciela | UX-04, UX-03 | werdykt właściciela B-02 na zrzutach albo zamknięcie z następcą | F42 |
| #524 | lokalna integracja Graphify AST (szkic) | MATERIAŁ narzędziowy; bez scalania bez karty (narzędzie spoza zależności projektu) | MACIERZ-POKRYCIA-OBIEKTOW (ewentualne narzędzie pomiaru grafu) | decyzja karty: wciągnąć albo zamknąć z komentarzem | U06 |
| #523 | docs(ENEA): oficjalne źródło Zeszytu 1 i kontrakt weryfikacji SLD | MATERIAŁ; przegląd względem `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`; bez PDF w repo (polityka praw autorskich) | UX-04 (źródło ENEA), REFERENCE-ENGINE-WYDANIA | treść zgodna wciągnięta kartą, PR zamknięty z komentarzem | F42; F41 |
| #522 | [P0][DECISION] obciążalność kabli SN — ENEA 03.2026 vs IEC 60502-2 (szkic) | MATERIAŁ DECYZYJNY dla W10-1; decyzja zakresu normy — architekt z podstawą | W10-1, REFERENCE-ENGINE-WYDANIA | decyzja zapisana w karcie W10-1 z podstawą; PR zamknięty z komentarzem | F26; W07 |
| #521 | ZAMKNIĘTY (misja globalna) | ANALIZA bez scalania — treść jako materiał wejściowy do §C.7 | §C.7 | — (zamknięty) | wszystkie F/W/U |
| #509, #510, #511 | katalogi przekładników CT/VT (ENEA, producenci PL) | MATERIAŁ KATALOGOWY; wciągnąć kartą z jakością DATASHEET/ESTIMATED i źródłem, `inwentarz_katalogow_guard` | UX-04/POLE-LINIOWE-WZORZEC (listy rdzeni CT i uzwojeń VT), KARTA-POLA-KD6 | pozycje w katalogu z testem źródła; PR zamknięte z komentarzem | F21, F29; W09 |
| #507, #508, #517, #518, #519 | katalogi: i0 transformatorów, kable NKT/Tele-Fonika, rodziny e²TANGO (nie na liście otwartych PR 2026-11-11) | PRZEJĘTE kartą KARTA-POLA-KD6 / GPZ-DANE-ANALIZ (`19e429f77`, `90adfd54c`, `bf7bfca1a`, `635328fc1`) | KARTA-POLA-KD6 | integracja gałęzi karty | F21 |
| #499, #500, #502 (łańcuch) | import QET (licencja CC BY 3.0 zapisana, 7 elementów nN), atlas SVG, „73 symbole” (w większości geometria własna, nie QET), ramka SCADA, rysunek pola `BayWindowSchematic` | MATERIAŁ; wciągane wybiórczo kartami, bez scalenia PR | UX-04/POLE-LINIOWE-WZORZEC, POLA-TR-POMIAR-SPRZEGLO; odrzucone elementy w `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md` (druga ścieżka rysunku pola, walidator gotowości we froncie, ramka z wypełnieniem i tylko na korpusie) | PR zamknięty z komentarzem wskazującym następcę po wciągnięciu zatwierdzonych elementów kartą | F10, F42 |
| #504 | stany łączników z rekordu ENM (`is_open`), przewody port→port, sprzęgło z aparatu; blokady tylko w obrębie pola, front z odmową stałą | MATERIAŁ; zgodne części kartą na gałąź UI/UX, bez scalenia osobno | UX-04/LOGIKA-LACZENIOWA (walidacja na topologii wynikowej — do napisania w backendzie) | PR zamknięty z komentarzem po przeniesieniu zgodnych części na gałąź UI/UX | F19; W05, W14 |
| #498 | nN CAD, audyt ODRZUCONE 1/10 | NIE SCALAĆ; materiał dowodowy | — | PR zamknięty z komentarzem (materiał dowodowy, ODRZUCONE 1/10) | F12 |
| #494–#497, #501, #503, #505 | GIS R05–R15 | ZAMROŻONE do startu UX-09 | UX-09 | przegląd przy starcie UX-09 | — (GIS STOP w wizji) |
| #493 | katalog 25 standardów ENEA, CLI, OCR lokalny (wyniki poza repo) | MATERIAŁ; nie zawiera rysunków Z.n | UX-04 (źródło ENEA) | PR zamknięty z komentarzem po przeglądzie w karcie REFERENCE-ENGINE-WYDANIA (bez scalania) | F41 |
| #486 | rejestr źródeł ENEA/Dołęga (metadane, URL oficjalnego PDF Zeszytu 1) | MATERIAŁ; nie zawiera rysunków Z.n | UX-04 (źródło ENEA) | PR zamknięty z komentarzem po przeglądzie w REFERENCE-ENGINE-WYDANIA | F41 |
| #488 | IEC 60909-0 2016/2026, zmiana rdzenia FROZEN | NIE SCALAĆ (B-01); źródło kart | BILANS-THEVENIN i karty toru S (§C.2) | PR zamknięty z komentarzem po utworzeniu kart toru S | F23 |
| #487 | dossier IEC 60909-0:2026 (dokumenty), tematyczny duplikat #488 | MATERIAŁ | PROFIL-NORMY (§C.2) | PR zamknięty z komentarzem wskazującym PROFIL-NORMY | F23, F41 |
| #483 | SLD v3: kamera skupiająca stację na poziomie L2, nawigator stacji, dowody PNG przed/po | MATERIAŁ; aktualne części kartą (konflikt z kanwą gałęzi UI/UX spodziewany) | UX-01 i narzędzie dowodowe B-02 dla UX-04 | PR zamknięty po wciągnięciu aktualnych części kartą | F42 |
| #481 | edytor pola SN E05 (drugi edytor obok `EdytorWyposazeniaPola.tsx`) | MATERIAŁ; przydatny wzorzec adaptera katalogu OEM zgłaszającego brak danych | UX-04/POLE-LINIOWE-WZORZEC | PR zamknięty po wciągnięciu wzorca adaptera katalogu do POLE-LINIOWE-WZORZEC | F10, F21 |
| #485 | ZASADA NR 4 (nieblokujące braki katalogowe) | SCALONE-TREŚCI (zasada w `CLAUDE.md` na `main`) | zamknąć z komentarzem po sprawdzeniu `SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` | PR zamknięty z komentarzem po sprawdzeniu `SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` | F21; U01 |
| #484 | raport recenzji SLD dla Opusa | MATERIAŁ | UX-04 | PR zamknięty z komentarzem wskazującym UX-04 | F42 |
| #480 | specyfikacja KSR | MATERIAŁ | KSR-SKLAD-DER (§C.2) | PR zamknięty z komentarzem wskazującym KSR-SKLAD-DER | F14, F17 |
| #479 | monitor postępu (konkurencyjny rejestr) | NIE SCALAĆ (§A — jeden rejestr) | — | PR zamknięty z komentarzem (§A pkt 1 — jeden rejestr) | — |
| #478 | KSR P0 skład PV/BESS | NASTĘPCA | KSR-SKLAD-DER (§C.2) | PR zamknięty z komentarzem po wykonaniu KSR-SKLAD-DER | F14, F17 |
| #477 | plan Fable SC/EAZ/dynamika | SCALONE-TREŚCI (karty audytu domknięte, §C.5) | — | PR zamknięty z komentarzem (treść scalona) | F23, F30, F38 |
| #475 | laboratorium dynamiki | NIE DO SCALENIA (badawcze) | — | PR zamknięty z komentarzem (badawczy) | F38 |
| #471 | naprawa skanu tras, kasacja martwych suit | NIE SCALAĆ — wyprzedzony przez `main` (nowsze wersje strażników) | — | PR zamknięty z komentarzem (wyprzedzony przez `main`) | — |

### C.7 Pokrycie wizji warsztatu (PR #528)

Źródło: `docs/research/warsztat-wielosrodowiskowy/WIZJA_WARSZTAT_WIELOSRODOWISKOWY_MV-DESIGN-PRO_SCALONA.md`
(F01–F43 rozdz. 9, W01–W22 rozdz. 16, U01–U08 rozdz. 18; mapowanie §21.2–21.5 dokumentu jest PROPOZYCJĄ
i zostało zweryfikowane z treścią wierszy §C i z kodem drzewa integracji `016ec8c13`, 2026-11-11).
Ścieżki kodu względem `backend/src/` (chyba że podano `frontend/`). Stany pokrycia:
- **POTWIERDZONE W KODZIE (składnik)** — dostawca obliczenia albo analizy istnieje i jest wpięty w bieg
  lub API (plik:linia); wymaganie wizji w całości NIE jest przez to spełnione — kryterium odbioru karty
  pozostaje otwarte;
- **CZĘŚCIOWE** — w kodzie jest model danych albo fragment (plik:linia), dostawcy funkcji albo
  wpięcia brak;
- **TYLKO W PLANIE** — karta §C istnieje, w kodzie brak składnika funkcji (albo kod potwierdza brak);
- znacznik **(nowa)** przy karcie — karta utworzona 2026-11-11, bo wymaganie nie miało karty w §C.
Żadna pozycja F/W/U nie zamyka karty: zamknięcie wyłącznie dowodem end-to-end wg kolumny „Kryterium
odbioru” (dla SLD dodatkowo B-02, dla rdzenia B-01).

| ID | Wymaganie wizji (skrót) | Karta(y) §C | Stan pokrycia | Dowód w kodzie | Brakujące kryterium |
|---|---|---|---|---|---|
| F01 | Projekt, cel i zakres opracowania | W9 (rozszerzony: model opracowania), UX-06 | CZĘŚCIOWE | `infrastructure/persistence/models.py:273` (`StudyCaseORM`) | model opracowania z celem, zakresem, środowiskiem A–D i warunkiem zakończenia; ponowne otwarcie z kontekstem i następną czynnością |
| F02 | Import i inwentaryzacja dokumentacji OSD | W1 ✓ (§C.5), W12 (rozszerzony), UX-08 | POTWIERDZONE W KODZIE (składnik: import XLSX, CGMES) | `application/xlsx_import/service.py:345` (`graf_z_arkusza`), `application/cgmes/service.py:214` (`import_cgmes`) | import dokumentacji OSD z mapowaniem źródła i OCR; raport strat informacji; wykrywanie różnic przy ponownym imporcie |
| F03 | Pochodzenie, założenia i pytania do OSD | REJESTR-USTALEN-OSD (nowa), UX-03, UX-05/DANE-PRZYJETE-EKRANY, W10-2, CICHE-ZERO | CZĘŚCIOWE | `enm/models.py:189` (`ParameterOverride`), `solver_input/v126_contracts.py` (`dane_przyjete`) | rejestr pytań OSD z zależnymi ocenami; przejście od liczby w raporcie do źródła i decyzji przyjęcia |
| F04 | Ekwiwalent zasilania i granica obszaru | UX-04/ZLOZENIE-ROZDZIELNICY-Z2, GPZ-DANE-ANALIZ, PRZEJSCIA-MIEDZY-SRODOWISKAMI (nowa), REJESTR-USTALEN-OSD (nowa) | CZĘŚCIOWE | `enm/models.py:216` (`ConnectionConditions` — bez S_k,min i X/R, wiersz Z2) | kompletność per metoda; kontrolowana podmiana ekwiwalentu pełną siecią bez podwójnej impedancji |
| F05 | GPZ jako źródło i struktura SN | UX-04, UX-04/ZLOZENIE-ROZDZIELNICY-Z2, INSPEKTOR-POLA-DOMKNIECIE, GPZ-DANE-ANALIZ | CZĘŚCIOWE | `enm/models.py:1346` (`Substation`), `:1402` (`GPZSection`) | pełny tor od zasilania do odpływu na żywej aplikacji; sprzęgło wpływa na topologię (test); B-02 |
| F06 | Ciągi SN, pierścienie, rozgałęzienia, N.O. | UX-01, UX-02, W7, PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA | CZĘŚCIOWE | `enm/models.py:1328` (`LineRun`), `:2027` (`Corridor`), `enm/topology.py:119` (`TopologyView`) | macierz właściciela danych LineRun/Corridor/TopologyView; zgodne połączenia w widoku sieci, ciągu i stacji |
| F07 | Odcinki kablowe i napowietrzne | UX-02, JEDEN-KLUCZ-KATALOGU | CZĘŚCIOWE | `enm/models.py:278` (`BranchBase`) | podziel/usuń/odgałęzienie atomowo w UI z obliczeniem; suma długości przy podziale (test) |
| F08 | Projektowanie i przebudowa stacji | UX-02, UX-04, JEDEN-KLUCZ-KATALOGU | CZĘŚCIOWE | `enm/models.py:1346`, `application/station_templates/apply.py:58` | wiele TR i sekcji; przebudowa bez niszczenia stanu bazowego (wariant); B-02 |
| F09 | Sekcje szyn i funkcje pól | W5-B, UX-04/POLE-LINIOWE-WZORZEC, UX-04/POLA-TR-POMIAR-SPRZEGLO, INSPEKTOR-POLA-DOMKNIECIE, KARTA-POLA-KD6 | CZĘŚCIOWE | `enm/models.py:1472` (`Bay`) | typowany `Bay` (W5-B); przeniesienie pola między sekcjami ze zmianą topologii i wyników |
| F10 | Aparatura pierwotna i znamiona | UX-04/GPZ-H5-APARATURA, UX-04/POLE-LINIOWE-WZORZEC, KARTA-POLA-KD6, MACIERZ-POKRYCIA-OBIEKTOW (nowa) | CZĘŚCIOWE | `enm/models.py:1615` (`BayPrimaryDevice`) | macierz rodzaj – zaciski – katalog – symbol – stan; ocena aparatu dla własnego miejsca |
| F11 | Transformatory i regulacja zaczepów | UX-04/POLA-TR-POMIAR-SPRZEGLO, DOBOR-TRANSFORMATORA (nowa), SC-WYROCZNIA-SN-TR-NN, G11 | POTWIERDZONE W KODZIE (składnik: OLTC) | `enm/canonical_analysis.py:3194` (`_run_oltc_study`), `network_model/core/branch.py:584` (`TapChanger`) | niezależne porównanie stałego zaczepu i OLTC; ekwiwalent bez dublowania impedancji TR |
| F12 | Domena nN i obwody | W5-B → W5-T → SZABLONY-NN, W7, UX-02 | POTWIERDZONE W KODZIE (składnik: projekcja nN) | `application/analyses/lv_domain/projection_v1.py:351` (`build_lv_domain_projection_v1`, wersja 4.0.0) | portal na zacisku nN TR w UI; atomowość przy mutacji obiektu w miejscu; odbiór nN w całym toku |
| F13 | Odbiory, profile i współczynniki | AB-1d…AB-7 (AB-3, AB-6 QSTS) | CZĘŚCIOWE | `enm/models.py:623` (`Load`) | profile czasowe z jednostkami i źródłem; odtwarzalna suma odbiorów i współczynników |
| F14 | PV, falowniki i tory przyłączenia | KSR-SKLAD-DER, O-53b, SZABLONY-BEZ-DOMYSLOW, GOTOWOSC-DER-BACKEND, SLOWNIK-GENERATOR-PL, PULPIT-OZE-KD6 | POTWIERDZONE W KODZIE (składnik: dobór toru DER) | `enm/models.py:875` (`Generator`), `application/analyses/dobor_toru_der_sn.py` (konsument `api/der_sn_documents.py`) | walidacja napięcia/S_n/P–Q przez pełny tor e2e; symbol technologii na SLD |
| F15 | Źródła wiatrowe | AB-1c, AB-1d…AB-7 (AB-3c), SLOWNIK-GENERATOR-PL, KATALOG-DYNAMIKI-BRAKI | CZĘŚCIOWE | `enm/dynamika_modele.py:393` (`TurbinaWiatrowa`) | zmiana technologii zmienia dostawcę modelu i wymagane wejścia; walidacja modeli |
| F16 | Generator synchroniczny i biogaz | KATALOG-DYNAMIKI-BRAKI, AB-1c, SLOWNIK-GENERATOR-PL | CZĘŚCIOWE | `enm/dynamika_modele.py:162` (`MaszynaSynchroniczna`) | jedna tożsamość: katalog → wkład zwarciowy → symbol → dobór; charakterystyka zaniku |
| F17 | BESS: moc, energia, dostępność | KATALOG-DYNAMIKI-BRAKI, AB-1d…AB-7 (AB-4a/AB-4b), KSR-SKLAD-DER, REGULATOR-LIMITU-PRZYLACZENIA (nowa), KWALIFIKACJA-BESS-HYBRYDY (nowa) | CZĘŚCIOWE | `enm/dynamika_modele.py:320` (`Magazyn`: energia, SoC, sprawności) | ścieżka `e_n_kwh`/SoC do producenta wyniku i UI; granica „bez MWh” jawna |
| F18 | Układ hybrydowy i regulator wspólnego limitu | REGULATOR-LIMITU-PRZYLACZENIA (nowa), O-53b, KSR-SKLAD-DER | CZĘŚCIOWE | `enm/models.py:216` (`ConnectionConditions` — tylko dane) | wykonawca regulatora w biegu; awaria pomiaru/komunikacji jako przypadek z testem |
| F19 | Stany aparatów, układ normalny i N.O. | W5-B → W5-C, UX-04/LOGIKA-LACZENIOWA, UX-04/POLE-LINIOWE-WZORZEC | CZĘŚCIOWE | `enm/models.py:1609` (`BayOperatingState`), `:444` (`SwitchBranch`) | jedna prawda stanu w ENM, scenie i biegu; stan nieznany ≠ zamknięty (test); odstępstwo od normalnego oznaczone |
| F20 | Warianty, scenariusze i porównania | UX-07, W10-2, DELTY-ZABEZPIECZEN | CZĘŚCIOWE | `enm/envelope.py:24` (`variation_ref` bez dostawcy), `enm/scenariusze.py` | wariant strukturalny od bazy bez mutacji sąsiednich wariantów |
| F21 | Katalogi, szablony i instancje | SIEC-ZLOTA-KATALOG, JEDEN-KLUCZ-KATALOGU, KARTA-POLA-KD6, UX-08, SZABLONY-BEZ-DOMYSLOW, REFERENCE-ENGINE-WYDANIA (nowa) | POTWIERDZONE W KODZIE (składnik: wiązanie katalogu i materializacja) | `enm/models.py:189` (`ParameterOverride`), `network_model/catalog/types.py` | przypięcie rewizji katalogu do wyniku; zamiana typu z diffem i odtworzeniem historycznego wyniku |
| F22 | Rozpływ mocy i profil napięcia | UX-05, W3 ✓ (§C.5) | POTWIERDZONE W KODZIE (dostawca solverowy) | `network_model/solvers/power_flow_newton.py:33`, `enm/canonical_analysis.py:3254` (`_execute_power_flow`) | wzorzec niezależny z bilansem, konwencją znaku i zmianą Q; wykres napięcia i SLD na tych samych obiektach |
| F23 | Zwarcia, wkłady źródeł, prądy gałęziowe | BILANS-THEVENIN, Y0-WYSPY, CZESTOTLIWOSC, PROFIL-NORMY, KONSUMENCI-IB, SC-WYROCZNIA-SN-TR-NN, UX-05/WKLADY-BEZ-ZRODLA | POTWIERDZONE W KODZIE (dostawca solverowy) | `network_model/solvers/short_circuit_iec60909.py:496`, `application/analyses/prad_zwarciowy_galezi.py:22` | KCL na fazorach w teście wieloźródłowym (wizja §20.3 J); jawne wydanie normy w wyniku |
| F24 | Zwarcia doziemne i składowa zerowa | UX-04/POLE-ZU-SKLADOWA-ZEROWA, PRZERWA-ZEROWA, EWALUATORY-ZIEMNOZWARCIOWE, ZEROWA-POJEMNOSCI, Y0-WYSPY, W8 / CV-6, W6-K | POTWIERDZONE W KODZIE (składnik: sieć zerowa) | `enm/mapping.py:1548` (`zbuduj_siec_zerowa`) | sieć kompensowana G01 end-to-end (W8); wzorce dla różnych neutralnych i grup TR |
| F25 | Porównanie przed/po i wrażliwość | UX-07 (rozszerzony: trzy wielkości napięciowe) | POTWIERDZONE W KODZIE (składnik: wrażliwość rozpływu) | `application/analyses/wrazliwosc_rozplywu.py:233` (konsument `api/analysis_insights.py`) | kontrakt ΔU od inwestycji / różnica do GPZ / odchylenie od U_n z mianownikiem w każdym konsumencie |
| F26 | Dobór kabli i przewodów | W10-1, DELTY-ZABEZPIECZEN (kabel toru DER) | POTWIERDZONE W KODZIE (składnik: ocena magistrali, wytrzymałość cieplna) | `application/analyses/ocena_doboru_magistrali.py:153` (konsument `api/grid_source_preview.py`), `application/analyses/wytrzymalosc_cieplna_przewodow.py:127` | ranking z odrzuconymi kandydaturami; jeden dostawca dla karty samodzielnej i w sieci; pakiet dowodowy |
| F27 | Dobór transformatora | DOBOR-TRANSFORMATORA (nowa), O-53b | CZĘŚCIOWE | `enm/models.py:513` (`Transformer`) | cały dobór (kryteria, ranking, dwukierunkowość, rezerwa Q) |
| F28 | Dobór aparatury i torów prądowych | KONSUMENCI-IB, DELTY-ZABEZPIECZEN, UX-04/GPZ-H5-APARATURA, WYTRZYMALOSC-PRAD-POLA ✓ (§C.5) | POTWIERDZONE W KODZIE (składnik) | `application/analyses/wytrzymalosc_aparatury_pol.py:251` (`prady_pol_z_biegu`) | prąd toru dla badanego zwarcia zamiast prądu punktu (wizja §20.3 E); zwarcie z wkładem z obu stron |
| F29 | CT, VT i układy pomiarowe | UX-04/POLE-LINIOWE-WZORZEC, W4-2, EKRANY-EAZ, CT-JEDEN-WERDYKT ✓ (§C.5), PR #509–#511 (§C.6) | CZĘŚCIOWE | `enm/models.py:109` (`MeasurementRating`) | wielordzeniowy CT i wielouzwojeniowy VT z katalogu do raportu; ocena obciążenia toru |
| F30 | Zabezpieczenia, nastawy, selektywność | W4-0, W4-2, OCHRONA-ADR022-NASTAWY, EWALUATORY-ZIEMNOZWARCIOWE, EKRANY-EAZ, DELTY-ZABEZPIECZEN | POTWIERDZONE W KODZIE (składnik: bieg oceny zabezpieczeń) | `enm/canonical_analysis.py:2257` (`_execute_protection`), `enm/models.py:1180` (`ProtectionAssignment`) | grupy nastaw w ENM (ADR-022: 0 trafień `setting_group` 2026-10-28); 67/21/87T; czas przekazywany do doborów |
| F31 | LoM, SPZ, synchronizacja, sekwencje | AB-1d…AB-7 (AB-5), OCHRONA-ADR022-NASTAWY | CZĘŚCIOWE | `enm/models.py:1759` (`SpzState`), `application/analyses/ochrona_lom.py` (konsument `api/oze_analysis_runs.py`) | sekwencja dynamiczna utrata sieci → zadziałanie → SPZ; brak typowego czasu zamiast danych |
| F32 | Uziemienie, ochrona, napięcia dotykowe | W5-B → W5-T, W8 / CV-6, UX-04/POLE-ZU-SKLADOWA-ZEROWA, EWALUATORY-ZIEMNOZWARCIOWE | POTWIERDZONE W KODZIE (składnik: SWZ, prąd uziomowy) | `application/analyses/swz/service.py:129` (`build_swz_view`), `application/analyses/v126_prad_uziomowy.py:179`, `enm/models.py:54` (`GroundingConfig`) | napięcia dotykowe/krokowe z geometrią uziomu (PN-EN 50522); czas z sekwencji EAZ |
| F33 | Kompensacja i regulacja Q | UX-04/POLE-BKR-MODEL, AB-H1, AB-H2 → AB-H3 → AB-H4 | POTWIERDZONE W KODZIE (składnik: dobór kompensacji) | `application/analyses/dobor_kompensacji.py:398` (konsument `api/oze_analysis_runs.py`), `enm/models.py:665` (`ShuntCapacitor`) | rezonans w modelu częstotliwościowym (AB-H1); para przed/po z niezależną kontrolą U |
| F34 | N−1, rezerwa, rekonfiguracja | AB-H0b, UX-04/LOGIKA-LACZENIOWA | POTWIERDZONE W KODZIE (składnik: kontyngencje) | `application/analyses/kontyngencje_n1.py:750` (konsument `api/analysis_insights.py`) | pełny rozpływ i EAZ dla każdego wariantu rezerwy; etykieta wstępnego wskaźnika bez rozpływu |
| F35 | Hosting capacity i optymalizacja | HOSTING-CAPACITY-ODBIOR (nowa) | POTWIERDZONE W KODZIE (składnik) | `application/analyses/hosting_capacity.py:304`, `solver_input/v126_contracts.py:91` | odbiór end-to-end: ograniczenie wiążące, marginesy, zakres ważności, monotoniczność |
| F36 | Prognoza jakości energii | AB-H1, AB-H2 → AB-H3 → AB-H4, W6-K | POTWIERDZONE W KODZIE (składnik: migotanie) | `application/analyses/migotanie.py:387` (konsument `api/quality_analysis_runs.py`) | solver Y(f) i Z(f), emisje z jawnym tłem; brak emisji ≠ zerowy wkład |
| F37 | Pomiary, jakość danych, estymacja | AB-H2 → AB-H3 → AB-H4, AB-1d…AB-7 (AB-7), W11 | POTWIERDZONE W KODZIE (składnik: WLS) | `network_model/solvers/state_estimation_wls.py:174`, `application/analyses/state_estimation/service.py:424`, `frontend/src/ui2/wyniki/estymacja/EkranEstymacji.tsx` | import kanałów, czasu i przekładni z oceną jakości zapisu; brak próbek ≠ zero |
| F38 | Dynamika RMS i wyniki EMT | AB-1b.2 + AB-1d_min, AB-1d…AB-7, GRANICA-RMS-EMT (nowa) | POTWIERDZONE W KODZIE (składnik: RMS) | `enm/canonical_analysis.py:1985` (`_execute_dynamika_rms`) | jawna granica RMS; import EMT z identyfikacją narzędzia; walidacja urządzeń |
| F39 | FRT, LFSM, badania wymagań | AB-1c, AB-1d…AB-7 (AB-2), GRANICA-RMS-EMT (nowa) | POTWIERDZONE W KODZIE (składnik: sekwencja FRT) | `application/analyses/frt_sekwencja.py:97` (konsument `api/oze_analysis_runs.py`) | kryteria składowe z warunkami wstępnymi (AB-1c); profil typowy ≠ certyfikat jednostki |
| F40 | NC RfG, certyfikaty, macierz dowodowa | AB-1c, KWALIFIKACJA-BESS-HYBRYDY (nowa), PULPIT-OZE-KD6, GPZ-DANE-ANALIZ, WERDYKT-MIGRACJA, REJESTR-USTALEN-OSD (nowa) | POTWIERDZONE W KODZIE (składnik: certyfikat, profile NC RfG) | `application/analyses/certyfikat_zgodnosci.py:83`, `catalog/profiles/nc_rfg/loader.py` | macierz wymaganie – obiekt – podstawa – dowód – zakres dla BESS i hybryd; firmware i daty WOS (PR #527) |
| F41 | Wersjonowana baza norm offline | REFERENCE-ENGINE-WYDANIA (nowa), PROFIL-NORMY | CZĘŚCIOWE | `reference_engine/models.py:119` (`ReferenceRule`), `:133` (`ReferencePack`) | rejestr plików z odciskiem i licencją; recenzja ekstrakcji; przypięcie wydań do wyniku |
| F42 | SLD, nawigacja, kreatory, warstwy | UX-00…UX-08, UX-04/SLD-SKALA-I-NAWIGACJA (skala i nawigacja), W7, B-02, KD6-STANDARD-WARSZTATU, PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA, MACIERZ-POKRYCIA-OBIEKTOW (nowa) | CZĘŚCIOWE (kod istnieje, odbiór B-02 ODRZUCONE) | `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx:2443` | sześć projekcji jednego modelu z prześledzalnym torem; werdykt właściciela B-02 |
| F43 | Raporty, zestawienia, koszty, wymiana | W10-2, W11, W12, UX-08, PROZA-BEZ-SYMBOLI-ASCII | POTWIERDZONE W KODZIE (składnik: lista materiałowa, archiwum) | `application/analyses/lista_materialowa.py:70` (konsument `api/der_sn_documents.py`), `application/project_archive/service.py:99` | zamrożony pakiet z testem ponownego odczytu; brak ceny ≠ zerowy koszt; eksport CAD z dowodem ponownego importu |
| W01 | Dokumentacja OSD → graf → model normalny | W1 ✓, W12, UX-01, UX-02, W9, JEDEN-KLUCZ-KATALOGU, PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA | CZĘŚCIOWE | `application/xlsx_import/service.py:345` | mapowanie dokumentacji OSD; model normalny ze źródłem stanów |
| W02 | Sieć istniejąca → źródło → wpływ przed/po | UX-07, UX-05, PULPIT-OZE-KD6, REJESTR-USTALEN-OSD (nowa) | CZĘŚCIOWE | `application/analyses/wrazliwosc_rozplywu.py:233` | para przypadków z wspólnymi punktami i trzema wielkościami napięciowymi |
| W03 | PV → wariant BESS → tor → porównanie | KSR-SKLAD-DER, O-53b, REGULATOR-LIMITU-PRZYLACZENIA (nowa), AB-4a/AB-4b, PULPIT-OZE-KD6 | CZĘŚCIOWE | `application/analyses/dobor_toru_der_sn.py`, `enm/dynamika_modele.py:320` | warianty torów z P/Q i porównanie; granica bez MWh/SoC |
| W04 | Warunki zasilania → stacja → pola i TR → karta | UX-04 (wszystkie podkarty), INSPEKTOR-POLA-DOMKNIECIE, KARTA-POLA-KD6, GPZ-DANE-ANALIZ, UX-06 | CZĘŚCIOWE | `application/station_templates/apply.py:58`, `enm/models.py:1472` | stacja ze spójnym torem i kartą w zakresie; B-02 |
| W05 | Stacja istniejąca → wariant przebudowy → etapy | UX-07, UX-04/LOGIKA-LACZENIOWA, W10-2 | TYLKO W PLANIE | kod potwierdza brak dostawcy wariantu strukturalnego: `enm/envelope.py:24` | wariant przebudowy z etapami i porównaniem |
| W06 | Rozbudowa GPZ/ciągu → wariant → wpływ | UX-04/ZLOZENIE-ROZDZIELNICY-Z2, UX-07, W7 | TYLKO W PLANIE | brak dostawcy wariantu strukturalnego (`enm/envelope.py:24`) | legalna topologia wariantu i porównanie w obszarze wpływu |
| W07 | Obciążenie i odcinek → dobór kabla | W10-1, DELTY-ZABEZPIECZEN | CZĘŚCIOWE | `application/analyses/ocena_doboru_magistrali.py:153` | karta doboru z kryteriami i jawnymi ograniczeniami |
| W08 | Sieć/ekwiwalent → max/min → punkty zwarć | BILANS-THEVENIN i karty toru S, UX-05, PRZERWA-ZEROWA, GPZ-DANE-ANALIZ | POTWIERDZONE W KODZIE (dostawca solverowy) | `network_model/solvers/short_circuit_iec60909.py:496` | wejścia, metoda, punkty i zakres max/min w wyniku; niezależna wyrocznia wieloźródłowa |
| W09 | Wyniki sieciowe → urządzenie → karta doboru | KONSUMENCI-IB, UX-04/GPZ-H5-APARATURA, DOBOR-TRANSFORMATORA (nowa), DELTY-ZABEZPIECZEN, KARTA-POLA-KD6 | POTWIERDZONE W KODZIE (składnik) | `application/analyses/wytrzymalosc_aparatury_pol.py:251` | każde kryterium z właściwym źródłem wyniku i znamion |
| W10 | Układ i nastawy → prądy w torach → selektywność | W4-2, EWALUATORY-ZIEMNOZWARCIOWE, EKRANY-EAZ, OCHRONA-ADR022-NASTAWY, DELTY-ZABEZPIECZEN | POTWIERDZONE W KODZIE (składnik) | `enm/canonical_analysis.py:2257` | funkcje kierunkowe i różnicowe, grupy, TRIP, stany rezerwowe |
| W11 | Źródła i automatyka → sekwencja → ocena | AB-1d…AB-7 (AB-5), OCHRONA-ADR022-NASTAWY, UX-04/LOGIKA-LACZENIOWA, REGULATOR-LIMITU-PRZYLACZENIA (nowa) | CZĘŚCIOWE | `enm/models.py:1759`, `application/analyses/ochrona_lom.py` | udokumentowana sekwencja z danymi i ograniczeniami |
| W12 | Stacja i grunt → uziemienie → ocena | W5-B → W5-T, W8 / CV-6, UX-04/POLE-ZU-SKLADOWA-ZEROWA, EWALUATORY-ZIEMNOZWARCIOWE | POTWIERDZONE W KODZIE (składnik) | `application/analyses/swz/service.py:129`, `application/analyses/v126_prad_uziomowy.py:179` | prądy/czasy właściwe zakresowi; dotykowe/krokowe z geometrią |
| W13 | P/Q → kompensacja → przed/po → dobór | UX-04/POLE-BKR-MODEL, AB-H1, AB-H2 → AB-H3 → AB-H4 | POTWIERDZONE W KODZIE (składnik) | `application/analyses/dobor_kompensacji.py:398` | skutek P/Q i ograniczenia torów; rezonans osobną metodą |
| W14 | Układ normalny → wyłączenie → rezerwa | AB-H0b, UX-04/LOGIKA-LACZENIOWA, UX-07 | POTWIERDZONE W KODZIE (składnik) | `application/analyses/kontyngencje_n1.py:750` | skutek wyłączenia i rezerwa jawne; pełna lista N−1 z rozpływem |
| W15 | Urządzenie i tło → Z(f)/emisja → prognoza | AB-H1, AB-H2 → AB-H3 → AB-H4, W6-K, REFERENCE-ENGINE-WYDANIA (nowa) | CZĘŚCIOWE | `application/analyses/migotanie.py:387` (bez solvera Y(f)) | Z(f), emisje, tło i kryteria z podstawą |
| W16 | Plik pomiaru → kanały → jakość → ocena | AB-H2 → AB-H3 → AB-H4, AB-1d…AB-7 (AB-7), W11, PRZEJSCIA-MIEDZY-SRODOWISKAMI (nowa) | CZĘŚCIOWE | `application/analyses/zgodnosc_powykonawcza.py:95` (`parse_measurements_csv`), `network_model/solvers/state_estimation_wls.py:174` | mapowanie kanałów/czasu/przekładni z oceną jakości zapisu |
| W17 | Model → punkt pracy → zdarzenie → RMS | AB-1b.2 + AB-1d_min, AB-1d…AB-7, GRANICA-RMS-EMT (nowa), REGULATOR-LIMITU-PRZYLACZENIA (nowa) | POTWIERDZONE W KODZIE (składnik) | `enm/canonical_analysis.py:1985` | inicjalizacja i rozwiązanie zwalidowane w zakresie modelu |
| W18 | Wymaganie → test → symulacja → kryteria | AB-1c, AB-1d…AB-7 (AB-2), GRANICA-RMS-EMT (nowa), KWALIFIKACJA-BESS-HYBRYDY (nowa), REFERENCE-ENGINE-WYDANIA (nowa) | POTWIERDZONE W KODZIE (składnik) | `application/analyses/frt_sekwencja.py:97`, `api/ncrfg_ptpiree_tests.py:45` | każde kryterium ze statusem i identyfikacją dowodu |
| W19 | Obiekt i dokumenty → kwalifikacja → macierz | KWALIFIKACJA-BESS-HYBRYDY (nowa), AB-1c, REJESTR-USTALEN-OSD (nowa), PULPIT-OZE-KD6 | CZĘŚCIOWE | `application/analyses/certyfikat_zgodnosci.py:83` | macierz zastosowania, dowodów i braków |
| W20 | Sieć → lokalizacja → poszukiwanie mocy | HOSTING-CAPACITY-ODBIOR (nowa) | POTWIERDZONE W KODZIE (składnik) | `application/analyses/hosting_capacity.py:304` | ograniczenie wiążące i zakres scenariuszy w wyniku |
| W21 | Projekt i wyniki → kompletność → uzgodnienie | W10-2, REJESTR-USTALEN-OSD (nowa), UX-06, W12 | CZĘŚCIOWE | `application/analyses/wniosek_osd.py:112` | dane i załączniki spójne, z wersjami |
| W22 | Opracowania → zamrożenie → pakiet | W10-2 (rozszerzony: zamrożony pakiet), W11, UX-08 | CZĘŚCIOWE | `application/analyses/lista_materialowa.py:70`, `application/project_archive/service.py:99` | zamrożenie pakietu z testem odtworzenia |
| U01 | Pochodzenie i rejestr przyjęć | REFERENCE-ENGINE-WYDANIA (nowa), UX-03, UX-05/DANE-PRZYJETE-EKRANY, CICHE-ZERO | CZĘŚCIOWE | `enm/models.py:189`, `solver_input/v126_contracts.py` (`dane_przyjete`) | z liczby w raporcie do źródła i decyzji przyjęcia |
| U02 | Ustalenia i pytania do OSD | REJESTR-USTALEN-OSD (nowa), GPZ-DANE-ANALIZ, OD-xx dane właściciela | CZĘŚCIOWE | `application/analyses/odpowiedz_osd.py:340` | odpowiedź zmienia właściwy zakres bez podmiany historycznych przypadków |
| U03 | Przejścia między środowiskami | PRZEJSCIA-MIEDZY-SRODOWISKAMI (nowa) | TYLKO W PLANIE | — (operacje domenowe z `dry_run` jako przyszła podstawa, nie dowód) | zatwierdzenie atomowe, anulowanie bez częściowych obiektów |
| U04 | Zależności i aktualność | UX-03, UX-05, UX-07, W9, DYNAMIKA-W-TLE ✓ | POTWIERDZONE W KODZIE (składnik: świeżość wyniku) | `application/result_freshness.py:68` (`ResultFreshness`, konsument `api/study_cases.py`) | zmiana parametru wskazuje dotknięte oceny; historia odtwarzalna |
| U05 | Sterowanie i ograniczenia wspólne | REGULATOR-LIMITU-PRZYLACZENIA (nowa) | TYLKO W PLANIE | — (`ConnectionConditions` to dane, nie wykonawca) | limit w punkcie przyłączenia z wykonawcą i testem awarii |
| U06 | Pokrycie funkcji dla każdego obiektu | MACIERZ-POKRYCIA-OBIEKTOW (nowa), JEDEN-PLAN, ENDPOINTY-BEZ-KONSUMENTA, SLOWNIK-GENERATOR-PL | CZĘŚCIOWE | `application/analyses/pokrycie_analiz.py:68` (pokrycie analiz przypadku) | macierz klas obiektów × warstwy generowana z kodu |
| U07 | Wymiana: wersje, jednostki, mapowanie, raport strat | W12, UX-08, O-52 | POTWIERDZONE W KODZIE (składnik: CGMES, archiwum) | `application/cgmes/service.py:148` (`export_cgmes`), `:214` (`import_cgmes`) | raport strat wymiany; ponowny odczyt zachowuje deklarowany zakres |
| U08 | Pakiet dowodowy | W10-2, UX-05, WERDYKT-MIGRACJA, PROZA-BEZ-SYMBOLI-ASCII | POTWIERDZONE W KODZIE (składnik: pakiet dowodowy biegu) | `api/proof_pack.py:52` (`/api/proof`) | niezależny przegląd ustala, co policzono i na jakiej podstawie (zamrożony pakiet) |

**Dziesięć luk z §21.3 dokumentu — przypisanie:**

| Luka | Przypisanie |
|---|---|
| 1. Model opracowania i cztery niezależne wejścia z warunkiem zakończenia | W9 — zakres rozszerzony (kolumna „Kryterium odbioru”) |
| 2. Rejestr pytań i ustaleń OSD, wiele punktów przyłączenia | REJESTR-USTALEN-OSD (nowa, P1) |
| 3. Sterowanie wspólnym limitem w punkcie przyłączenia, pomiar, priorytety, awarie | REGULATOR-LIMITU-PRZYLACZENIA (nowa, P1) |
| 4. Przypięcie źródeł, katalogu, reguł i wydań do wyniku i raportu | REFERENCE-ENGINE-WYDANIA (nowa, P1) + PROFIL-NORMY |
| 5. Kontrakt trzech wielkości napięciowych w każdym konsumencie porównania | UX-07 — zakres rozszerzony |
| 6. Kontrolowane przejścia karta↔model, stacja↔sieć, pomiar↔projekt, podmiana ekwiwalentu | PRZEJSCIA-MIEDZY-SRODOWISKAMI (nowa, P1) |
| 7. Macierz pokrycia U06 dla klas obiektów i technologii źródeł | MACIERZ-POKRYCIA-OBIEKTOW (nowa, P1) |
| 8. Granica RMS/EMT i format dowodów zewnętrznych | GRANICA-RMS-EMT (nowa, P1) |
| 9. Rozdzielona kwalifikacja i zakres dowodów BESS/hybrydy | KWALIFIKACJA-BESS-HYBRYDY (nowa, P1) |
| 10. Odtwarzalność całego opracowania i zamrożony pakiet | W10-2 — zakres rozszerzony |

Poza lukami §21.3 dwie pozycje wizji nie miały karty w §C: F27 → DOBOR-TRANSFORMATORA (nowa, P1, tor D)
i F35/W20 → HOSTING-CAPACITY-ODBIOR (nowa, P1; dostawca w kodzie bez wiersza §C). Uwaga §21.2 dokumentu
o KATALOG-NIEZMIENNIKI: nazwa występuje w architekturze, wiersza §C nie ma — F21/F41 przypisano do
istniejących kart i REFERENCE-ENGINE-WYDANIA; strażnik `network_model/catalog/niezmienniki_katalogu.py`
istnieje w kodzie i nie wymaga osobnego wiersza.

**Bilans (przeliczony skryptem z tabeli wyżej, 73 pozycje):** POTWIERDZONE W KODZIE (składnik) — 34
(F 22, W 9, U 3); CZĘŚCIOWE — 35 (F 21, W 11, U 3); TYLKO W PLANIE — 4 (W05, W06, U03, U05). Pozycje
z dowodem w kodzie (plik:linia) razem: 69. Pozycje, do których przypisano co najmniej jedną nową kartę:
30 (F 14, W 11, U 5); pozycje, których JEDYNĄ kartą jest karta nowa: 4 (F35, W20, U03, U05). Nowych kart
z wizji: 9 (P1). Żadna pozycja nie jest domknięta — stan „POTWIERDZONE W KODZIE” dotyczy składnika, nie
kryterium odbioru wizji.

## D. Rozstrzygnięcia sprzeczności (konsolidacja 2026-10-23)

| # | Sprzeczność | Rozstrzygnięcie |
|---|---|---|
| D1 | Nagłówek PLANS 5.1 ogłaszał plan „supersedowanym" przez `CONVERGENCE_EVIDENCE` §A, MAPA §8 i SYNTEZĘ; część B §8 mówiła „current truth: this PLANS.md"; wiersz 6 wskazywał `REJESTR_KONFLIKTOW`; PROGRAM §12.2 nazywał PLANS „skrótem postępu" | PLANS.md = jedyny nadrzędny rejestr postępu, priorytetów i odpowiedzialności (§A.1). `CONVERGENCE_EVIDENCE`, MAPA, SYNTEZA, plan A/B §7, PROGRAM §12.3 i `REJESTR_KONFLIKTOW` pozostają dokumentami DOWODOWYMI i technicznymi; żaden z nich nie prowadzi własnej kolejki statusów konkurencyjnej wobec §C |
| D2 | Dwa „jedyne programy": PROGRAM §12 („jedyny aktywny plan wykonawczy UI/UX") i misja domknięcia (W1–W12 nadrzędne) | Oba są PODPROGRAMAMI jednego planu: PROGRAM §12 prowadzi treść kart UI/UX, plan A/B i MAPA — treść kart domeny; priorytety między nimi ustala §C (Fable) |
| D3 | Program SLD: `PLAN_SLD_REWORK` F1–F5 „LIVING" (SYSTEM_SPEC, INDEX) vs §0 „zastąpione S1–S8" vs PROMPT_ZARZADCA „program SLD" vs PROGRAM §2.3 „SLD w jednym programie" (V12K-084) | Osobnego programu SLD nie ma: S1–S8 i SLD V3 wykonane kodowo, odbiór wizualny i naprawa funkcjonalno-inżynierska = UX-04 (H5-01…H5-05), projekcja z ENM = W7. `PLAN_SLD_REWORK` = historia i wymagania |
| D4 | Ocena H5 3/10 i „runda H5" bez daty; „H5" oznacza też układ 110 kV w `SZABLONY_STACJI` | H5-xx = kryteria UX-04 (PROGRAM §12.5a); układ stacji H5 to pojęcie katalogowe. 110 kV tylko jako granica zasilania SN |
| D5 | Rysunki ENEA Z.1, Z.4–Z.8 cytowane jako dowód, nieobecne w repo; `REFERENCE_ENGINE_RESEARCH_OSD_ENEA` używa Z1–Z3 dla zeszytów standardu | Brak pliku = BRAK ŹRÓDŁA w macierzy H5 (nie wymyśla się treści). Z1–Z3 (zeszyty) ≠ Z.1/Z.4–Z.8 (rysunki rundy H5) — różne oznaczenia, obie listy zachowane |
| D6 | B-02: 8,5/10 (powierzchnie analityczne, 2026-09-10) vs ODRZUCONE (SLD, 2026-10-23); brak jednego rejestru werdyktów | Wiersz B-02 w §C.1 jest rejestrem werdyktów per powierzchnia; stan bramki = ODRZUCONE do nowego werdyktu właściciela na zrzutach z UX-04 |
| D7 | Część B §4 (2026-05-13): TODO dla SI-100, VDROP/Earthing, fault-loop nN, DOCX — sprzeczne z §3.6/§3.7 (DONE) | §4 części B jest historyczny; pozycje DONE wg §3.6/§3.7 i inwentarza funkcji; fault-loop nN domknięty kartą W5-E-TTIT. Żadna z nich nie wraca do §C |
| D8 | Część B §7 nazywała `docs/spec` „SOURCE OF TRUTH" wbrew §3.5 i `CLAUDE.md` (ARCHIWALNY) | `docs/spec` ARCHIWALNY (priorytet 9); wpis części B §7 opatrzony notą |
| D9 | Kolizje identyfikatorów: W1–W5 (część B = fale wygaszania mostu wyników ≠ MAPA W1–W5), F1–F5 (SLD rework, ZWARCIA-PRO, program 10x F0–F4), F1–F11 (SLD V3), V12K-026 (dwa znaczenia) | W §C obowiązują znaczenia MAPA (W), PROGRAM (UX/U/E), plan A/B (AB), 10x (`10x-F`), SLD (`S`, `SLD V3 F1–F11`); część B zachowuje stare znaczenia jako historia |
| D10 | Część B §3.-1 „`[ ] U1 W TOKU`" vs „FAZA U1 ZAMKNIĘTA 2026-07-15"; PROGRAM §8 U0 DoD „makiety zatwierdzone" vs PROMPT (e) „makiety odrzucone" | U0 i U1 ZAMKNIĘTE (PROGRAM §8); makiety U0.6 nie są kryterium (ekrany ocenia właściciel na żywej aplikacji — B-02, dyrektywa 2026-07-18 pkt 8) |
| D11 | Numer PR pakietu SEL: README „PR #489" vs PROGRAM „PR #490" | Pakiet SEL = PR #490 (scalony); PR #489 = integracja do `main` |
| D12 | §12.1 PROGRAM „P2 po odbiorze kluczowego przepływu" vs KONTRAKT „P2 jeśli nie blokuje P0/P1" vs REJESTR „P2 tylko po P0" | Obowiązuje §C: P2 po P0 UI/UX (UX-00…UX-06) i bez blokowania P1 |
| D13 | Bramki PROGRAM §10: `vitest run --no-file-parallelism` (archiwalne) vs CI i `CLAUDE.md`: `npm test` (dwa kroki, pula `forks`) | `npm test` (karta SZYBKIE-TESTY 2026-09-30); tekst §10 poprawiony |
| D14 | Część B §3.0 cytuje `docs/plan/PLAN_10_10_GLOBAL_SN.md` (nie istnieje) | Odnośnik historyczny; istniejący odpowiednik: `docs/plan/PLAN_10_10_FOLLOWUP.md`; §C nie cytuje planów 10/10 |
| D15 | Gałąź wątku UI/UX (`…-karta-uiux-przemyslowy`) prowadzi trzecią przestrzeń identyfikatorów (UI-01…UI-19, W5-UI-xx, karty K1…K9, GPZ-MODEL, GPZ-H5-*) w dokumentach `KONTRAKT_UIUX_PRZEMYSLOWY_2026-10.md`, `PLAN_UIUX_PRZEMYSLOWY_2026-10.md`, `KOORDYNACJA_WATKOW_2026-10.md` (nieobecnych na HEAD programu); PROGRAM §12 ma UX-xx/H5-xx; brak mapowania między nimi | Jedyna kolejka UI/UX = UX-00…UX-09 (§C). Karty K1…K9 i UI-xx tej gałęzi to karty wykonawcze wewnątrz UX-01…UX-06 (K1 POWLOKA/K2 → UX-06, K3 GEOMETRIA-STACJI/K4/K5 KREATOR-STACJI/K6a TOPOLOGIA-API → UX-02/UX-04, K6 INSPEKTOR/K7 DRZEWO-GOTOWOSC → UX-03, K8 WYNIKI → UX-05, K9 WERYFIKACJA → UX-06); GPZ-H5-APARATURA i GPZ-H5-SKLADOWA-ZEROWA wpisane w §C.1 pod UX-04. Przy scaleniu tej gałęzi jej dokumenty dostają nagłówek „karty wykonawcze UX-xx, bez własnego statusu" |
| D16 | Hashe commitów cytowane w części B §3.-1 (91 tokenów, m.in. `a75b7e9`, `fd630d8`, `077ef75`) nie są obiektami tego repozytorium (`git cat-file -t` 2026-10-23); dowód tych wpisów nie jest odtwarzalny | Wpisy części B pozostają historią z etykietą „dowód nieodtwarzalny w repo"; żaden z nich nie zasila statusu DOMKNIĘTA w §C bez ponownego pomiaru (UX-00) |
| D17 | `INWENTARZ_FUNKCJI_2026-07.md` §6: tabela 37 ✅ / 10 ◐ / 0 ❌ (48 wierszy) vs bilanse tekstowe 27/18/0 i 27/17/1 oraz deklaracja „45 wierszy" | Prawdą jest tabela; bilanse tekstowe są historyczne. 10 pozycji ◐ to zakres UX-05/UX-06/UX-08 (nie nowe epiki) |
| D18 | GIS: STOP z 2026-10-23 (UX-09, „nie wdrażać") vs siedem rund GIS R05–R15 wykonanych potem w PR #494–#505 vs polecenie właściciela 2026-10-28 „GIS włącz do planu, z najniższym priorytetem, na sam koniec" | Późniejsza decyzja właściciela wygrywa: UX-09 = P3, ostatnia pozycja całej kolejki §C; PR GIS zamrożone do startu karty, bez scalania i bez dalszych rund; część GIS z W12 przeniesiona do UX-09 |
| D19 | GPZ SN: rundy do R5 i PR GPT #499/#500/#502/#504 vs przekazanie właściciela 2026-10-28 | R5 odrzucone jako rozwiązanie docelowe; przekazanie (`docs/uiux/PRZEKAZANIE_GPZ_SN_15KV_2026-10-28.md`) jest treścią karty UX-04; pozostała praca GPT służy przede wszystkim tej przebudowie jako materiał wejściowy (wciągany kartami, błędne elementy usuwane z raportem rozbieżności); scalenie wyłącznie za zgodą właściciela, B-02 ODRZUCONE |
| D20 | Wizja PR #528 wprowadza F01–F43, W01–W22 i U01–U08; w repo istnieją już W1–W12 (MAPA), W1–W5 części B, UX-00…UX-09, U0–U5 (fazy programu UI/UX) i F0–F4 / F1–F5 / F1–F11 innych programów | F/W/U z PR #528 to WYMAGANIA wizji, nie zadania: żyją wyłącznie w kolumnie „Pokrycie wizji” i w §C.7, zawsze w zapisie dwucyfrowym (F01, W01, U01). W01–W22 (przepływy wizji) ≠ W1–W12 (wycinki MAPA) ≠ W1–W5 (część B); U01–U08 (wymagania przekrojowe wizji) ≠ U0–U5 (fazy UI/UX) ≠ UX-xx (karty UI/UX). Żadna karta §C nie jest przenumerowana; wymaganie bez karty dostało nową kartę WIELKIMI LITERAMI (§C.7) |
| D21 | Role: §A pkt 2 (2026-10-23) i `CLAUDE.md` „Model i pisanie promptów” — Fable 5.1 główny zarządca i integrator „wyłącznie ostatecznie”; przydział właściciela 2026-11-11 — Fable 5.2 architektura, integracja globalna i najtrudniejsze problemy algorytmiczne, Opus 5.5 implementacja, konfiguratory i UI/UX | Późniejsza decyzja właściciela wygrywa: §A pkt 2 i kolumna „Odpowiedzialny” wg przydziału 2026-11-11. Aktualizację `CLAUDE.md` prowadzi osobna karta w innym drzewie (nie ten commit); do jej scalenia rozjazd jest znany i rozstrzygnięty tutaj |
| D22 | `CLAUDE.md` §5 i ADR-027 opisują obiekt umowny `GridConnectionPoint` jako istniejący; pomiar 2026-11-11: `grep -rn GridConnectionPoint backend/src` → 0 trafień (nazwa tylko w `scripts/pcc_zero_guard.py` i `scripts/docs_guard.py`) | Deklaracja bez kodu = brak: wiele punktów przyłączenia w jednym projekcie wpisane do karty REJESTR-USTALEN-OSD (P1) z kryterium testu dwóch punktów i `pcc_zero_guard.py` rc 0; do tego czasu punkt przyłączenia to `ConnectionConditions` w nagłówku ENM (jeden na projekt) |
| D23 | Wizja §21.5: tor dokumentów W10-1 → W9 → W10-2 i propozycja wydzielenia z W9 minimalnego kontraktu celu dla samodzielnej karty kabla | Kolejność toru D bez zmian (W10-1 pierwsza); minimalny kontrakt celu i zakresu jest częścią kryterium odbioru W9 i może być dostarczony wcześniej jako zależność W10-1 bez odwracania kolejki — decyzja architekta przy starcie W10-1 |
| D24 | Wizja §21.4: standard stacji opisuje jeden ciemny styl, odbiór wymaga obu motywów; „wykonane kodowo SLD” wobec B-02 ODRZUCONE | Odbiór każdej karty UI wymaga zrzutów OBU motywów (dyrektywa 2026-07-18 pkt 8); status implementacji i status odbioru B-02 są osobne (wiersz B-02) — zielone testy nie zamykają B-02 |
| D25 | Wizja §20.3 A: PLANS.md i STAN_REPO.md nie opisują dokładnie bieżącego stanu (stary `main`, otwarty #489); wizja §20.3 D: rejestr mówi o brakach danych BESS, a typ `Magazyn` (`enm/dynamika_modele.py:320`) niesie energię, SoC i sprawności | §B przepisany z pomiaru 2026-11-11 (INT-489 był już DOMKNIĘTA — rozjazd dotyczył nagłówka); KATALOG-DYNAMIKI-BRAKI zamyka dostawcę i ścieżkę danych magazynu, nie odtwarza istniejącego modelu (kryterium odbioru wiersza) |

### D.2 Tory równoległe i ścieżka krytyczna

Jeden wykonawca na tor; granice plików wg `STAN_REPO.md` §7 F:

| Tor | Kolejność (ID z §C) |
|---|---|
| I — integracja (Fable 5.2; obecnie sesja główna Opus 5.5 jako architekt) | INT-489 ✓ → JEDEN-PLAN → STAN-ZABEZPIECZENIA-2026-10-30 → INTEGRACJA-2026-11 (PRZERWA-ZEROWA → ZU punkt 4 → EWALUATORY-ZIEMNOZWARCIOWE → INSPEKTOR-POLA-DOMKNIECIE + KOMUNIKATY-BEZ-ID → PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA → GPZ-DANE-ANALIZ → gałęzie WIP po domknięciu) → FIX-E2E-PELNE → SYNC-MAIN-UIUX (PR do `main` za zgodą właściciela); PR #528 do `main` po zielonym CI |
| U — UI/UX (Opus 5.5) | KD6-STANDARD-WARSZTATU (kontrakt, w drzewie) ‖ UX-00 → UX-04 (POLE-LINIOWE-WZORZEC ‖ POLE-ZU-SKLADOWA-ZEROWA ‖ POLE-BKR-MODEL ‖ INSPEKTOR-POLA-DOMKNIECIE ‖ KARTA-POLA-KD6 ‖ PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA → POLA-TR-POMIAR-SPRZEGLO, POLA-GPZ-ZU-BKR-SZABLONY, LOGIKA-LACZENIOWA, GPZ-H5-APARATURA, OCHRONA-ADR022-NASTAWY → ZLOZENIE-ROZDZIELNICY-Z2) ‖ EKRANY-EAZ, PULPIT-OZE-KD6 → UX-01 → UX-02 → UX-03 → UX-05 (z WKLADY-BEZ-ZRODLA, DANE-PRZYJETE-EKRANY) → UX-06 → UX-07 → UX-08; UX-09 (GIS) ostatnia pozycja całej kolejki |
| R — rdzeń dynamiki (projekt Fable 5.2, wdrożenie Opus 5.5 worker-rdzeń) | AB-1b.2 (0/A/B/C/D → E/F/G/H) → AB-1c → GRANICA-RMS-EMT ‖ KWALIFIKACJA-BESS-HYBRYDY → AB-1d → AB-2 → AB-3 → AB-3b → AB-3c → AB-4a → W6-K → AB-4b → AB-5 → AB-5b → AB-6 → AB-6b → AB-7 |
| H — dziedzina częstotliwości | AB-H1 (od zaraz) → AB-H2 (po AB-3) → AB-H3 (z AB-6) → AB-H4 (z AB-7) |
| S — rdzeń zwarciowy (B-01 architekta) | PRZERWA-ZEROWA (gotowa) ‖ EWALUATORY-ZIEMNOZWARCIOWE → BILANS-THEVENIN → Y0-WYSPY → CZESTOTLIWOSC → PROFIL-NORMY → ZEROWA-POJEMNOSCI (po UX-04/POLE-ZU-SKLADOWA-ZEROWA) → KONSUMENCI-IB → SLOWNIK-GENERATOR-PL → SC-WYROCZNIA-SN-TR-NN |
| M — model ENM | JEDEN-KLUCZ-KATALOGU ‖ GPZ-DANE-ANALIZ → W5-B → W5-C → W5-T → SZABLONY-NN → W7 (z macierzą LineRun/Corridor/TopologyView) → PRZEJSCIA-MIEDZY-SRODOWISKAMI → W8 |
| Z — zabezpieczenia | EWALUATORY-ZIEMNOZWARCIOWE → EKRANY-EAZ ‖ DELTY-ZABEZPIECZEN → W4-0 (pomiar) → W4-2 → wejście do AB-5 |
| D — dokumenty, UX, higiena | P0: SIEC-ZLOTA-KATALOG, GOTOWOSC-DER-BACKEND, AB-H0b; P1: O-53b, KSR-SKLAD-DER, SZABLONY-BEZ-DOMYSLOW, CICHE-ZERO, O-52, ENDPOINTY-BEZ-KONSUMENTA; P2: KSR-KRYTERIA-POMIAR, KOMUNIKATY-BEZ-ID, LICZBY-PL, PL-ZNAKI-2; W10-1 → DOBOR-TRANSFORMATORA → W9 → W10-2 → W11 → W12; P1 analiz: HOSTING-CAPACITY-ODBIOR, MACIERZ-POKRYCIA-OBIEKTOW, REJESTR-USTALEN-OSD → REGULATOR-LIMITU-PRZYLACZENIA (po O-53b i AB-4a), REFERENCE-ENGINE-WYDANIA (z PROFIL-NORMY); P2: PROZA-BEZ-SYMBOLI-ASCII, WERDYKT-MIGRACJA (P0) |

Ścieżka krytyczna produktu (priorytet merytoryczny właściciela 2026-11-11: pełny tor elektryczny na SLD, spójny workflow projektanta, poprawność obliczeń): INT-489 ✓ → INTEGRACJA-2026-11 → UX-00 → UX-04 → UX-01/02 → UX-05 → UX-06 (odbiór właściciela) równolegle z S (PRZERWA-ZEROWA, BILANS-THEVENIN — poprawność zwarć jako warunek użycia wyników w doborach i EAZ, wizja §21.5 pkt 4), R (AB-1b.2 → AB-1c) i M (W5-B → W7, minimalne zależności terminali, stanów i projekcji dla UX-04/UX-01 — wizja §21.5 pkt 2–3).

## E. Liczniki (stan 2026-11-11, przeliczone skryptem z tabel §C; poprzednio 2026-10-28)

| Miara | Wartość |
|---|---|
| Wiersze kolejki §C.1–C.4 (zadania uporządkowane) | 99 (2026-10-28 podano 74, tabele miały 75 wierszy — wiersz bramki B-02 nie był liczony w P0 29; +24 nowe karty: 14 P0, 9 P1, 1 P2; sekwencje AB-1d…AB-7 i AB-H2…H4 dalej po jednym wierszu) |
| w tym P0 / P1 / P2 / P3 | 44 / 44 / 8 / 3 (P0 liczy także wiersz bramki B-02 i STAN-ZABEZPIECZENIA-2026-10-30) |
| Nieukończone (OTWARTA 58, W TOKU 27, DO WERYFIKACJI 6) | 91 |
| DOMKNIĘTA w kolejce (zachowane dla ciągłości torów) | 6 (INT-489, W4-1, AB-1b.3b, DYNAMIKA-W-TLE, SZYNY-STACJI-LUSTRO, SLD-SUBSTRAT faza 2); dawne „ZROBIONE NA GAŁĘZI” przepisane na `W TOKU` / `DO WERYFIKACJI` wg §A pkt 4 |
| ZABLOKOWANA / ODRZUCONE / STOP | 1 / 1 / 0 |
| Pozycje domknięte §C.5 (programy i karty, bez odtwarzania) | 16 wierszy zbiorczych (w tym 1 `ZASTĄPIONA`, 1 `W TOKU` — U2–U5 mierzy UX-00) |
| Otwarte PR z decyzją w §C.6 | 28 wierszy (2026-10-28: 18; +10: #528, #527, #526, #525, #524, #523, #522, #521, #509–#511, #507/#508/#517–#519 przejęte) |
| Pokrycie wizji PR #528 (§C.7) | 73 pozycje (F 43, W 22, U 8): POTWIERDZONE W KODZIE (składnik) 34, CZĘŚCIOWE 35, TYLKO W PLANIE 4; z dowodem plik:linia 69; z co najmniej jedną nową kartą 30; tylko z nową kartą 4; domkniętych 0 |
| Nowe karty 2026-11-11 | 24: P0 — INTEGRACJA-2026-11, EWALUATORY-ZIEMNOZWARCIOWE, EKRANY-EAZ, PRZERWA-ZEROWA, JEDEN-KLUCZ-KATALOGU, KD6-STANDARD-WARSZTATU, PULPIT-OZE-KD6, KARTA-POLA-KD6, GPZ-DANE-ANALIZ, DELTY-ZABEZPIECZEN, PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA, INSPEKTOR-POLA-DOMKNIECIE, WERDYKT-MIGRACJA, FIX-E2E-PELNE (praca istniejąca na gałęziach, dotąd bez wiersza); P1 — PRZEJSCIA-MIEDZY-SRODOWISKAMI, REJESTR-USTALEN-OSD, REGULATOR-LIMITU-PRZYLACZENIA, REFERENCE-ENGINE-WYDANIA, MACIERZ-POKRYCIA-OBIEKTOW, GRANICA-RMS-EMT, KWALIFIKACJA-BESS-HYBRYDY, DOBOR-TRANSFORMATORA, HOSTING-CAPACITY-ODBIOR (wizja); P2 — PROZA-BEZ-SYMBOLI-ASCII |
| Karty z rozszerzonym zakresem z wizji | 6: W9 (model opracowania), UX-07 (trzy wielkości napięciowe), W10-2 (zamrożony pakiet), W12 (import dokumentacji OSD), W7 (macierz LineRun/Corridor/TopologyView), SLOWNIK-GENERATOR-PL (symbol technologii) |
| Dokumenty scalone w jeden rejestr | 13: PLANS 5.1, PROGRAM_UIUX §8/§12, PROMPT_ZARZADCA, MAPA §8, PLAN_AB §2/§5/§7/§11/§14, PLAN_SLD_REWORK §0, STAN_REPO §7 B–D, sel-blueframe (README, GALERIA, REJESTR_32, KONTRAKT), audyty SLD 2026-10-20 ×2, PROMPT_KONTYNUACJI_2026-10-23, wizja warsztatu PR #528 (rozdz. 9, 16, 18, 20, 21) |
| Duplikaty scalone | SLD: 4 źródła statusu (PLANS §3.-2b/§3.3/§3.4, PLAN_SLD_REWORK §0, PROMPT „program SLD", audyty 2026-10-20) → UX-04 + §C.5; UI/UX: 3 (PLANS §3.-1, PROGRAM §8, PROGRAM §12.3) + 1 przestrzeń kart gałęzi UI/UX (UI-xx/K-xx) → UX-xx; fizyka: 3 (STAN_REPO §7 B/C, plan A/B §14.4, MAPA §8) → §C.2; B-02: 9 rozproszonych werdyktów → wiersz B-02; wizja PR #528: mapowanie §21.2 → kolumna „Pokrycie wizji” + §C.7 (bez osobnego programu) |

Liczniki przelicza się przy każdej zmianie §C (polecenie w `scripts/` nie istnieje; 2026-11-11 policzone skryptem jednorazowym dzielącym wiersze tabel §C po niezaescapowanym `|` i klasyfikującym pierwsze słowo statusu — wynik w tym miejscu).

---

# Część B — Archiwum operacyjne (PLANS 5.1, stan 2026-08-05; historia, nie status)

> Sekcje poniżej zachowano bez zmiany treści (z wyjątkiem oznaczeń zduplikowanych numerów i not
> konsolidacyjnych). Status zadań prowadzi wyłącznie część A §C. Znaczenia identyfikatorów
> W1–W5 i F1–F5 w tej części są historyczne (część A §D.9).

**Version:** 5.1 (archiwum)
**Status (archiwalny):** sekcje opisują stan z 2026-08-05.
**Reference (canon):** [`docs/v12xx/KANON_V12_XX.md`](docs/v12xx/KANON_V12_XX.md) (binding), [`docs/system/`](docs/system/) (binding specs), [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) (executive overview).
**Reference (archive):** [`docs/spec/`](docs/spec/) — historical V11 reference; not source of truth.
**Historical active work:** § 3 and [`docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md`](docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md).

---

## 1. Project Status Summary (archiwalne liczby z 2026-07; pomiar bieżący: `STAN_REPO.md` §1 i `CLAUDE.md` „Project Status")

MV-DESIGN-PRO is a functional Medium Voltage network design and analysis system with:
- 18 solver modules (IEC 60909 SC + machine SC, NR/GS/FD/unbalanced Power Flow, inverter/ZIP models,
  IEC 60364 fault loop, IEC 60255 protection, NC RfG/PTPiREE, FRT/HVRT, RMS stability, WLS state
  estimation — binding inventory: `docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`)
- 8+ proof packs (SC3F, VDROP, Equipment, PF, Losses, Protection, Earthing, LF Voltage, V12.6 academic)
- 19 analysis modules (Protection, Voltage, Normative, Coverage, Sensitivity, Comparison,
  Recommendations, Arc Flash, Grid Strength, Reactive Adequacy, SSCI, Sanity Bounds, Energy Validation, …)
- Full frontend (63 UI modules — see binding inventory)
- ~5,400 backend test functions; ~7,350 frontend tests (537 files); 79 guard scripts
- Project import/export (ZIP, deterministic, versioned)
- CAD geometry editing in SLD
- PDF/DOCX report generation

---

## 2. Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1: Documentation | Canonical docs (SYSTEM_SPEC, ARCHITECTURE, AGENTS, PLANS) | DONE |
| Phase 1.x: UI/UX Parity | canonical alignment docs | DONE |
| Phase 1.y: UI Contracts | SLD, Results, Inspector contracts | DONE |
| Phase 1.z: UI Exploration | Results/Inspector exploration docs | DONE |
| Phase 2: NetworkModel Core | Core elements, graph, snapshot | DONE (code) |
| Phase 2.x: UI PF++ Contracts | Advanced UI contracts (topology tree, switching, SC node) | DONE (docs) |
| Phase 3: Catalog Layer | Immutable types, resolver, governance | DONE |
| Phase 4: Case Layer | Case lifecycle, invalidation, clone | DONE |
| Phase 5: Interpretation Layer | BoundaryIdentifier, BoundaryNode moved to analysis | DONE |
| Phase 6: Wizard/SLD Unity | Verify single model access | DONE (27 backend + 23 frontend tests) |
| P10a: State/Lifecycle | Case result status machine | DONE |
| P10b: Result State + Comparison | A/B comparison | DONE |
| P11: Proof Engine | SC3F, VDROP proofs | DONE |
| P11a: Results Inspector | Read-only + trace + SLD overlay | DONE |
| P11b: Frontend Results Inspector | Result view | DONE |
| P11c: Results Browser + A/B Compare | UI-only | DONE |
| P12: Equipment Proof Pack | Thermal/dynamic withstand | DONE |
| P12a: Data Manager Parity | Case manager + active case + mode blocks | DONE |
| P14: Proof Audit & Coverage | Audit coverage | DONE |
| P14a: Protection Library (foundation) | Vendor curves, IDMT | DONE |
| P14b: Protection Library Governance | Manifest, fingerprint, export/import | DONE |
| P14c: Protection Case Config | Protection config | DONE |
| P15a: Protection Analysis Foundation | Backend overcurrent analysis | DONE |
| P23: Study/Scenario Orchestration | Scenario workflow | DONE (docs) |
| P30a: Undo/Redo Infrastructure | Command history | DONE |
| P30c: Property Grid Multi-Edit | Multi-selection editing | DONE |
| P30d: Issue Panel / Validation Browser | Validation display | DONE |
| P30e: Context Property Grid | Context-sensitive grid | DONE |
| P30f: SLD Layout Determinism Tests | Auto-layout tests | DONE |
| P31: Project Import/Export | ZIP archive (deterministic) | DONE |
| SLD CAD Geometry | CadOverridesDocument contract | DONE |
| SLD CAD Tools | Drag, bends, reset, status | DONE |
| SLD Fit-to-Content | Viewport fit action | DONE |
| SLD Routing Corridors | Connection routing obstacles | DONE |
| Infra: /api/health | Health endpoint + API URL separation | DONE |
| Memory Canonization V3.0 | This canonization pass | DONE |
| EP-1: Application API | Projects + Cases + Network persistence | DONE |
| EP-4: Case-Bound Runs | POST /cases/{cid}/runs/short-circuit, loadflow, protection | DONE |
| EP-5: SC Asymmetrical | Solver supports 1F, 2F, 2F+G (already existed) | DONE |
| EP-6: Protection Settings | I>/I>> dobor nastaw (Hoppel method) | DONE |
| EP-7: Q(U) Regulation | Proof pack NC RfG compliance | DONE |
| EP-9: PostgreSQL | Full SQLAlchemy ORM (was already migrated) | DONE |
| EP-10: XLSX Importer | Import sieci z Excel | DONE |
| EP-11: Docker + Health | Rozszerzony health: db_ok, engine_ok, solvers, uptime | DONE |
| EP-3: Wizard K1-K10 | Frontend kreator budowy sieci | DONE |
| ENM v1.0 | EnergyNetworkModel contract + mapping + validator + API + Wizard | DONE |

---

## 3. Active Work

### 3.-2 Sesja 2026-07-22 — ZWARCIA-PRO + zasada wywodów KaTeX (zamknięte programy)

Pełny zapis: `docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-098…V12K-120; dokumenty BINDING:
`docs/uiux/ZASADA_WYWODOW_KATEX_I_TYPOGRAFII_2026-07.md`, `docs/uiux/PROGRAM_ZWARCIA_PRO_2026-07.md`,
`docs/uiux/PROMPT_FABLE_FLOW_EKSPERT_2026-07.md`.

- [x] FLOW EKSPERT+ rundy 1–3 (V12K-101…112): akcje kontekstowe, świeżość, warunki OSD,
      dowodyRef, ślady WHITE BOX, kompensacja deep-link, obciążalność w rozpływie,
      wkłady zwarciowe, dowody porównań A/B, LaTeX/KaTeX w śladach
- [x] Zasada wywodów KaTeX + typografii (BINDING, V12K-113/114): wywód dyplomowy
      (wzór→podstawienie→wynik) budowany w warstwie liczącej; 2 kroje + font matematyczny;
      rollout T-A (36 wzorów w kreatorach), T-B (audyt 15 ekranów, fonty 16→0),
      T-C (wywody OLTC/LoM/FRT)
- [x] Program ZWARCIA-PRO F1–F5 (V12K-115…118, 120): pełny bilans IEC 60909 end-to-end,
      wkłady PRO, White Box sekcyjny + panel walidacji IEC, sync SLD + rozpływ prądu
      (+ FIX pre-existing solvera dla scalonych węzłów), parytet raportów PDF/DOCX/JSON
- [x] Runda dowodowa (V12K-119): 12 ekranów z otwartym wywodem akademickim,
      stała strona `docs/audit/visual/dowody/` (24 PNG, spec-y z twardymi asercjami)
- [x] Karty S-A/S-B/S-C ZAMKNIĘTE (2026-07-22, V12K-122/121/123): S-A — likwidacja
      duplikacji fizyki w dowodzie SC1 (fizyka przeniesiona verbatim do
      `network_model/solvers/short_circuit_asymmetrical_quantities.py`, NOT-A-SOLVER
      przywrócony, 6 hashy SHA-256 goldenów niezmienionych); S-B — strzałki kierunku
      przepływu prądu zwarciowego na SLD (kanał `faultFlow`, kanwa v3); S-C — trzy
      delty zatwierdzone przez właściciela (kroki Ib/I²t w dowodzie SC3F, porównanie
      I²t w doborze aparatów, delty bilansu w porównaniach A/B)

### 3.-1 Program UI/UX klasy przemysłowej 2026-07 (historia prac; status kart UX-xx w części A §C)

> **AKTUALIZACJA WŁAŚCICIELSKA 2026-10-23 — JEDEN PROGRAM UI/UX PROWADZONY PRZEZ OPUSA.**
> Jedyna kolejka operacyjna UI/UX, jego decyzje, statusy i reguły odbioru są w
> [`docs/uiux/PROGRAM_UIUX_2026-07.md` §12](docs/uiux/PROGRAM_UIUX_2026-07.md#12-zintegrowana-kolejka-wykonawcza--uiux-przemyslowy-decyzja-wlasciciela-2026-10-23).
> Materiały [SEL Blueframe](docs/research/sel-blueframe/README.md) to referencje
> i kryteria UX-01…UX-06, **nie osobny program ani kolejka**. Historyczne plany SLD
> i W1–W12 są technicznymi specyfikacjami / mapą zdolności produktu; AB zachowuje
> własną fizykę i dowody, ale ekrany/UI prowadzi program Opusa.
> **P0: UX-04 obejmuje również rundę H5: przebudowa SLD wg rysunków ENEA,
> symbole PN-EN 60617, układ aparatów/pól SN, czytelność i B-02.**
> Granica 110 kV tylko niezbędna dla modelu SN, bez rozwijania WN.
> **P0:** inteligentny znak „+” na SLD, automatyczne operacje ENM, wspólny
> inspektor, walidacja, motywy, White Box i pełny tor E2E.
> **GIS: P3/STOP. B-02: ODRZUCONE.**
> Wpisy poniżej (U0–U5, stare postępy i raporty) to **historia prac**,
> nie bieżące procenty ani alternatywna lista zadań. Realne postępy aktualizuje
> się wyłącznie w §12 programu i skrótowo tutaj.

Objective: przebudowa całego UI/UX do klasy ETAP/PowerFactory wg
[`docs/uiux/PROGRAM_UIUX_2026-07.md`](docs/uiux/PROGRAM_UIUX_2026-07.md) (fazy U0–U5),
zakres funkcjonalny gwarantowany przez
[`docs/uiux/INWENTARZ_FUNKCJI_2026-07.md`](docs/uiux/INWENTARZ_FUNKCJI_2026-07.md),
orkiestracja wg [`docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md`](docs/uiux/PROMPT_ZARZADCA_FABLE_UIUX.md).
Gałąź programu `claude/power-network-design-ui-ir91mv` scalona do `main` (K0); praca na gałęzi bieżącej sesji.

Progress:
- [x] U0.1 Inwentarz funkcji + macierz pokrycia (2026-07-15; bilans: 8 funkcji bez UI, ~17 częściowych)
- [x] U0.2 Rejestracja programu (INDEX.md, PLANS.md, CLAUDE.md, naprawa dryfu README)
- [x] U0.3 Weryfikacja wpięcia API (2026-07-15): 4 analizy NIEWPIĘTE do API (arc_flash,
      grid_strength, reactive_adequacy, state_estimation WLS), 13 modułów API niezamontowanych
      w aplikacji — szczegóły w inwentarzu §4 i §6
- [x] U0.4 Porządkowanie PLANS.md — sekcje 5.0–5.9 → `docs/audit/archive/PLANS_SESJE_SLD_2026-05.md`
- [x] U0.5 Karta koordynacyjna tokenów motywów z wątkiem SLD (`docs/uiux/KARTA_KOORDYNACJI_SLD_01_TOKENY.md`)
- [x] U0.7 Model interakcji całej aplikacji + rejestr okien W-101…W-703
      (`docs/uiux/MODEL_INTERAKCJI_APLIKACJI_2026-07.md`; mandat clean-room UI — decyzja
      właściciela 2026-07-15: każde okno i każda interakcja od nowa)
- [x] U0.8 Specyfikacja kreatorów (`docs/uiux/SPEC_KREATORY_2026-07.md`) — dyrektywa
      właściciela 2026-07-15: maksymalna szczegółowość, zero pustych pól, podpowiedź
      inżynierska przy każdym polu, gotowe przykłady P-01…P-05 z kompletem danych
- [x] U0.9 Zasada języka (dyrektywa właściciela 2026-07-15): w całym interfejsie wyłącznie
      polski język techniczny, zakaz surowych identyfikatorów z kodu w tekstach
      pierwszoplanowych (MODEL_INTERAKCJI §2.7); egzekwowanie — rozszerzenie
      `ui_terminology_guard` (obowiązkowa karta w U1)
- [x] U0.10 Specyfikacja powiązania warstw (`docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md`) —
      dyrektywa właściciela 2026-07-15: wszystkie warstwy powiązane wielowarstwowo (kreator →
      schemat → drzewo → gotowość → ważność wyników → raporty z jednego zdarzenia); magistrala
      zdarzeń + selekcja globalna + kontrakt świeżości rewizji; scenariusz akceptacyjny e2e w §7
- [x] U0.11 Taksonomia szablonów stacji (`docs/uiux/SZABLONY_STACJI_2026-07.md`) — dyrektywa
      właściciela 2026-07-15: grupy logiczne A–E (zasilanie / dystrybucja / odbiorcze / OZE /
      specjalne), stan zastany 57+ szablonów w 10 kategoriach, delta do dodania (GPZ, RS,
      abonenckie, kompensacja, rezerwa zasilania), cel ≥ 80; przeglądarka szablonów w kreatorze
- [x] U0.12 Propozycje rozszerzeń P1–P22 (`docs/uiux/PROPOZYCJE_ROZSZERZEN_2026-07.md`) —
      ZATWIERDZONE zasadą „na max" (decyzja właściciela 2026-07-15); kolejność: U3 (P3, P4,
      P20), U4 (P1, P2, P5, P6, P9, P10, P13–P15, P18), po U4/U5 (reszta + grupa III)
- [x] U0.13 Zasada „ZAWSZE NA MAX" (Program §2.0, decyzja właściciela 2026-07-15): braki
      rozbudowujemy od razu, delta backendowa w zakresie programu (w granicach kanonu fizyki);
      gotowce w pełni edytowalne + szablony użytkownika (SPEC_KREATORY Z4, SZABLONY §4a)
- [x] U0.14 Układ paneli (`docs/uiux/SPEC_UKLAD_PANELI_2026-07.md`) — dyrektywa właściciela
      2026-07-15: lewy (nawigacja+kontekst, zwijany do listwy ikon) / środkowy (warsztat,
      karty + podział widoku) / prawy (inspektor: zakładki, akordeon, pinezka, chowany) +
      panel dolny + tryby Podstawowy/Rozszerzony/Ekspercki na mode-gate (ukrywanie okien
      zaawansowanych; wyszukiwarka poleceń znajduje wszystko)
- [x] U0.16 Propozycje rundy 3 P23–P38 (poziom profesorski: niepewność wyników, walidacja
      metodą niezależną, rejestr założeń, analiza wymiarowa, profile czasowe, skan N-1,
      wrażliwości węzłowe, obszary P–Q, kaskada zasilania, optymalizacja NOP, projekt uziomu,
      ograniczniki, studium przyłączenia, strategie BESS, migotanie, walidacja modelu
      falownika) — zatwierdzone zasadą „na max"; kolejność po U5 wg delty backendowej
- [x] U0.15 Audyt rady specjalistów (`docs/uiux/AUDYT_RADY_SPECJALISTOW_2026-07.md`) —
      dyrektywa właściciela 2026-07-15: 13 perspektyw eksperckich, rozbudowa każdego okna
      rejestru (konkretne wymagania per ekran), delta rejestru +16 okien (W-105…W-707)
      z trybami minimalnymi; rozbudowy = wymagania kart zadań (pominięcie tylko za zgodą)
- [x] U0.6 Makiety IA — ZATWIERDZONE przez właściciela 2026-07-15 („Akceptujemy") — 7 punktów:
      układ powłoki, kolejność przestrzeni, gramatyka interakcji, motywy, kreatory zero pustych
      pól, powiązanie warstw, układ paneli z trybami. **FAZA U0 ZAMKNIĘTA.**
- [x] U0.17 Runda 4 P39–P47: maksymalna rozbudowa specjalisty OZE / NC RfG (dyrektywa
      właściciela 2026-07-15) + priorytet strumienia OZE w kolejności realizacji
- [ ] U1 W TOKU (od 2026-07-15): karty w `docs/uiux/karty/`
      - [x] E1.1 Powłoka W-110 + tokeny `--mvd-*` (wykonawca Opus; pełny vitest 7388 pass;
            zintegrowane `a75b7e9`)
      - [x] E15.1 Magistrala zdarzeń (wykonawca Sonnet; pełny vitest 7393 pass; pokrycie
            gałęzi bus.ts 100%; zintegrowane `39a833b`; TODO-KARTA `selekcja.zrodlo`
            rozstrzygnięte: okna emitują selekcję z prawdziwym źródłem, adapter = fallback)
      - [x] E1.2 Drzewa kontekstowe (Sonnet; pełny vitest 7434 pass; zintegrowane `878bbbc`)
      - [x] E1.3 Inspektor kontekstowy (Opus; pełny vitest 7445 pass; zintegrowane `e92928a`)
      - [x] Weryfikacja łączna zarządcy: 553 pliki / 7534 testy pass na drzewie E1.1+E1.2+E1.3+E15.1
      - [x] E1.4 Integracja powłoki (zarządca): AppRoot + drzewa w lewym panelu + inspektor
            + magistrala + klient /api/health; test integracyjny scenariusza powiązania warstw;
            188 testów ui2; decyzje TODO-KARTA zapisane w karcie E1.4 §2;
            pełny vitest po integracji: 7538 pass (potwierdzone 2026-07-15)
      - [x] E1.5 Wyszukiwarka poleceń W-105 (Sonnet; pełny vitest 7579 pass; 41 testów;
            zintegrowane `357ec04`)
      - [x] E2.1 Pulpit projektu W-101 (Opus; pełny vitest 7577 pass; 39 testów;
            zintegrowane `07fe669`; kafle bez źródła danych = stan „wkrótce" z TODO-KARTA)
      - [x] Scalenie zarządcy #2: CommandPalette pod Ctrl+K (slot renderSearchDialog
            w AppShell zamiast szkieletu), pulpit jako warsztat przestrzeni „Projekt",
            provider obiektów wyszukiwarki ze snapshotu, akcje przestrzeni/obiektów
            (nawigacja + selekcja przez magistralę), 270 testów ui2
      - [x] E1.6 Guard językowy: wykrywanie identyfikatorów snake_case w stringach UI ui2
            (canary czerwony/zielony; self-test 6/6; `1f3263e`)
      - [x] E15.2 Kontrakt świeżości (Sonnet; 17 testów; zintegrowane `3661fe2`; TODO-KARTA:
            para rewizji dla stanu początkowego OUTDATED — decyzja: uczciwa etykieta bez pary
            do czasu zdarzenia magistrali; filtracja per przypadek = przy E7)
      - [x] KOREKTA RZETELNOŚCI: bieg potwierdzający scalenia #2 raportowany wcześniej jako
            zielony był FAŁSZYWYM greenem (kod wyjścia potoku `| tail`, nie vitest) — wykrył to
            wykonawca E15.2 (czerwony test fixture pulpitu: brak kolekcji corridors/measurements/
            protection_assignments). Naprawione: fixture uzupełniony (270→287 testów ui2 zielone
            z pipefail); procedura zarządcy od teraz z `set -o pipefail`
      - [x] E2.2 Nowy/otwórz projekt W-102 (Sonnet; 30 testów; pełny bieg u wykonawcy zielony
            poza znanym błędem fixture naprawionym w `ed09d54`; zintegrowane `056b157`;
            TODO-KARTA: brak store'a projektów — lista przez props, hook przy wpięciu)
      - [x] E1.7 Przełączenie powłoki (Opus, dekompozycja a/b/c po STOP-raporcie):
            E1.7a ekstrakcja orkiestracji z App.tsx do headless hooka (1457→397 linii;
            pełny vitest 7673; e2e 173 pass, tor krytyczny zielony; `2274d72`) ·
            E1.7b parytet kontraktu testid + LegacySurface + flaga wejścia (vitest 7685
            — potwierdzone niezależnie przez zarządcę; e2e identyczne z baseline;
            `103b03a`) · E1.7c NOWA POWŁOKA DOMYŚLNA + kasacja starej ramy
            (−5595 linii, App.tsx/AppShellV12/CanonicalLayout/stara nawigacja usunięte;
            e2e 180 pass / 2 fail pre-existing env; 3 spec-y zmigrowane z intencją;
            `3693c01`). **FAZA U1 ZAMKNIĘTA 2026-07-15.**
      - [x] V12K-026 RESOLVED: słownik nowej IA („przypadek obliczeniowy", „kreator");
            guard terminologii zielony w całym repo (naprawione 2 zastane naruszenia)
- [ ] U2 W TOKU (2026-07-16) — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md`
        (werdykty: U2 8/11, U3 7/9, U4 3/7, U5 4/9): E3.1 przeglądarka szablonów (82 t.) · E3.2 preselekcja+Z2 ·
        E6.1 panel gotowości wg celów (61 t.) · E7.1 menedżer przypadków (38 t.) ·
        E7.2 przebiegi W-503 (43 t.) · E4.1 katalog+karta techniczna (44 t.) + 4 scalenia.
        Przestrzenie w pełni na nowej powłoce: Projekt, Gotowość, Obliczenia (3/7);
        Model = warsztat 3 zakładki (schemat/szablony/katalog). Pełny bieg: 7894 pass.
- [ ] U3 W TOKU (2026-07-16) — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md`
        (werdykty: U2 8/11, U3 7/9, U4 3/7, U5 4/9): E8.1 wspólny wzorzec ekranu analizy + rozpływ szyn
        (Opus; 50 testów — wzorzec 27 + rozpływ 23; pełny vitest u wykonawcy 7944 pass
        z pipefail; ui2 655 pass u zarządcy; zintegrowane `fd630d8`; TODO-KARTA:
        wirtualizacja >500 wierszy, świeżość liczbowa w TabelaSzyn, dowód per-szyna,
        wpięcie store'u). Karta E8.2 (zwarcia W-604) zarejestrowana `0cbdbb1`.
        Scalenie U3 #1 (zarządca): WynikiWarsztat — przestrzeń „Wyniki" z zakładkami
        „Rozpływ mocy" (TabelaSzyn, nowa powłoka) + „Pozostałe analizy" (most #analysis
        renderowany WEWNĄTRZ zakładki; powierzchnia rozwinięta nie przykrywa warsztatu
        w tej przestrzeni); wpięcie store'u rozpływu (zamyka TODO-KARTA E8.1 #4:
        selectRun+loadResults na `wyniki-gotowe` i przy montażu, tylko LOAD_FLOW/DONE);
        14 testów; ui2 669 pass; potwierdzenie pełne 596/7958 na `0374eee`.
        E8.2 okno wyników zwarciowych W-604 (Opus; 37 testów; pełny vitest u wykonawcy
        7981 pass z pipefail; zintegrowane `9c0bf6a`; TODO-KARTA: wybór wiersza we wzorcu,
        wkłady w kontrakcie wyników [delta backendowa], świeżość liczbowa, c/czas przez
        props). Scalenie U3 #2 (zarządca): zakładka „Zwarcia" w WynikiWarsztat +
        `useWpiecieWynikow` (rozpływ i zwarcia; SC_* → inspektor wyników), założenia
        zwarciowe c/czas z konfiguracji aktywnego przypadku tylko przy zgodności
        przebieg↔przypadek; 18 testów przestrzeni; ui2 710 pass. Karty zarejestrowane:
        E9.1 dowód W-608 (`79e3f27`, delegowana), P39 macierz NC RfG (`0e9ef7f`, U4/OZE).
        E9.1 przegląd dowodu (Opus; 40 testów; kanon 5 pól, MathBlock z ui/proof,
        selekcja 'dowod' przez magistralę; zintegrowane `05577bf`; ui2 750 pass).
        NAPRAWA REGRESJI E2E (wykryta pierwszym biegiem e2e od E1.7c, na świeżym
        kontenerze): katalog `ui2/spaces/model/szablony/api/` z E3.1 wpadał w mock
        speców `page.route('**/api/**')` — vite serwował moduł jako JSON i aplikacja
        nie startowała w 24 specach (kreator stacji, ux-feedback, designer-flow,
        pierwszy przypadek). Fix: moduł spłaszczony do `szablonyClient.ts` (`f43df1a`)
        + expect.timeout 10→20 s (rozruch ~12 s na wolniejszym kontenerze, `3f033fb`)
        + baseline'y wizualne chromium-linux (`55a0afc`, `eeb6046`). Wynik: e2e
        179 pass / 2 znane środowiskowe / 15 skip + zaktualizowana migawka = parytet
        baseline E1.7c. Procedura: po każdym biegu e2e przywracać PNG w docs/audit
        (baseline'y win32 nadpisywane lokalnymi renderami).
        Scalenie U3 #3: zakładka „Dowód obliczeń" w warsztacie wyników (E9.1 spięte
        ze śladem przez inspektor wyników, leniwe ładowanie; 2×klik → dowód w nowej
        powłoce; `42d7e79`; pełny bieg 8046 pass). Scalenie U3 #4: natywny wybór
        wiersza we wzorcu (delta API; zamyka TODO E8.2 A; `b5ae89b`; ui2 758).
        Karta E12.1 porównanie A/B rozpływu W-609 zarejestrowana (`115a225`).
- [ ] U4 OTWARTE strumieniem OZE (2026-07-16) — stan wg audytu bramek: `docs/uiux/AUDYT_BRAMEK_U2_U5_2026-08.md`
        (werdykty: U2 8/11, U3 7/9, U4 3/7, U5 4/9): P39 macierz wymogów NC RfG (Opus;
        33 testy; pełny vitest u wykonawcy 8079 pass ZERO failed; zintegrowane
        `a626f90`; napięcie przyłączenia WYŁĄCZNIE z modelu/katalogu — stan
        „brak danych" zamiast 15 kV z powietrza; USTALONE: backend klasyfikuje
        moduły A/B/C/D sam (`engine.py:235`) — delta backendowa rdzenia zbędna;
        TODO-KARTA: certyfikat zgodności projektu E13/W-707, wpięcie do pulpitu
        OZE P47, wyświetlenie klasy modułu w podsumowaniu).
        Scalenie #5 (zarządca): macierz NC RfG jako zakładka „Zgodność NC RfG"
        warsztatu wyników (W-614/N6) + ślad WHITE BOX testu INLINE w szczególe
        werdyktu (wzory ASCII solvera — świadomie bez KaTeX; zero martwych
        klików; `d1910d7`). Pełny bieg na spokojnym drzewie: 8082 pass, exit 0.
        E12.1 porównanie A/B rozpływu W-609 (Opus; 35 testów; pełny vitest
        u wykonawcy 8115 pass ZERO failed; zintegrowane `f1b219d`; źródło listy
        przebiegów: /projects/{id}/power-flow-runs — id zgodne z endpointem
        porównań; TODO-KARTA: porównanie zwarć, nakładka delta na SLD przez
        kartę koordynacyjną, nazwa przypadku w etykiecie przebiegu, eksport).
        Scalenie #6 (zarządca): zakładka „Porównanie A/B" w warsztacie wyników
        (bez projektu — uczciwy stan pusty); ui2 829 pass; pełny bieg 8118 pass.
        P47 pulpit instalacji OZE (Opus; 26 testów; pełny vitest u wykonawcy
        8144 pass ZERO failed; zintegrowane `7c551fb`; wspólny store biegu NC RfG
        macierz↔pulpit; USTALONE: DER nie niesie pojemności magazynu [kWh] —
        sekcja BESS tylko z realnych referencji katalogowych; TODO-KARTA:
        wpięcie API grid_strength/reactive_adequacy = osobna karta delty).
        Scalenie #7 (zarządca): zakładka „Pulpit OZE" w warsztacie wyników
        (`8e74937`; ui2 856 pass). Pełny bieg: 8145 pass.
        „NA MAX" (dyrektywa 2026-07-16): braki P47 w realizacji — karty D1 (delta
        backendowa: API grid_strength/reactive_adequacy; wykonawca pracuje,
        pliki gotowe, czeka na pełny pytest) i P47a (pulpit: magazyn z katalogu
        e_kwh + sekcje analiz) zarejestrowane `0076882`. USTALONE: pojemność
        magazynu JEST w katalogu konwerterów (mv_converter_catalog.py:232) +
        końcówka /api/catalog/converter-types istnieje. Kolejna luka tego wzorca:
        sanity_bounds i energy_validation też bez API (karta D2 po scaleniu D1).
        E8.3 tabela gałęzi rozpływu (Sonnet; 28 testów; pełny vitest u wykonawcy
        8173 pass ZERO failed; zintegrowane `6e70741`). Scalenie #8: EkranRozplywu
        (podzakładki Szyny/Gałęzie) w zakładce Rozpływ (`e06d9ab`; ui2 884 pass;
        pełny vitest 8173 potwierdzony).
        D1 API analiz OZE (Opus; 29 testów; końcówki /api/oze-analysis/
        grid-strength i /reactive-adequacy; pełny pytest 5725 pass ZERO failed —
        potwierdzony też przez zarządcę na scalonym drzewie; zintegrowane
        `9c2d6d6`; NOTA: pre-existing naruszenia ruff/black w nietkniętych
        plikach repo — poza zakresem, CI ich nie egzekwuje; TODO-KARTA:
        n_parallel przy mocy IBG, q_actual z wyniku PF per źródło).
        D2 API jakości wyników (Opus; 26 testów; końcówki /api/quality/
        sanity-bounds i /energy-validation; pełny pytest 5750 pass ZERO failed —
        potwierdzony przez zarządcę na scalonym drzewie; zintegrowane `dbd044f`;
        serwis energy_validation jako pakiet service.py — kolizja nazw
        rozstrzygnięta jawnie). Karta E8.4 okno jakości wyników W-607 `3c68d7d`;
        P47a pulpit OZE na max (Opus; 39 testów; pełny vitest u wykonawcy 8204
        pass ZERO failed; zintegrowane `3f0c44e`; ui2 915 pass u zarządcy;
        USTALONE: referencje magazynów `conv-bess-*` = item_id katalogu
        konwerterów, `bess_bat_*` poza nim → jawny stan nieodnalezienia; ślad
        SCR w ASCII spójnie z NC RfG; TODO-KARTA: mapowanie moduł→węzeł dla
        podświetlenia, konwencja formatera energii; ZAOBSERWOWANE: przejściowy
        szum testowy AnonymizationProvider/navigation — flaky do obserwacji).
        E8.4 okno jakości wyników W-607 (Opus; 46 testów; pełny vitest
        u wykonawcy 8219 pass ZERO failed; zintegrowane `d3c86c6`; pełny słownik
        rodzajów kontroli PL; why_pl w panelu szczegółu — decyzja dostępności).
        Scalenie #9: zakładka „Jakość wyników" w warsztacie (`121ea74`; ui2 962
        pass). ŁAŃCUCH „NA MAX" DOMKNIĘTY: luka → D1/D2 (backend) → P47a/E8.4
        (okna) — zero pozostawionego długu z dyrektywy 2026-07-16.
        Łączny pełny vitest po #9: 624 pliki / 8251 pass, exit 0 (`688d0ce`).
        BAZY: frontend 8251, backend 5750. NASTĘPNY KROK (strumień OZE wg
        kolejności): P2 hosting capacity — rekonesans wykazał, że silnik istnieje
        TYLKO jako dowód eksportowy per stacja (audit2_station_config.py:371-420,
        Phase 23) + enum V126; okno sieciowe P2 wymaga najpierw głębokiego
        rekonesansu kształtu dowodu i decyzji: ekspozycja per stacja vs delta
        analizy sieciowej. Potem P19 ranking punktów przyłączenia i P41 krzywe
        P–Q producenta (delta katalogowa).
        ROZSTRZYGNIĘTE: D3 hosting capacity (Opus; 25 testów; końcówka
        /api/oze-analysis/hosting-capacity — deterministyczny przegląd
        scenariuszy na kanonicznej ścieżce _execute_power_flow, ocena
        EnergyValidationBuilder; pełny pytest 5775 pass ZERO failed potwierdzony
        przez zarządcę; zintegrowane `234777c`; guard load_flow_no_heuristics
        zielony). P2 okno zdolności przyłączeniowej (Opus; 33 testy; pełny
        vitest u wykonawcy 8284 pass ZERO failed; zintegrowane `df5f5fc`).
        Scalenie #10: zakładka „Zdolność przyłączeniowa" w warsztacie
        (`95eb5af`; ui2 996 pass). NASTĘPNE: P19 ranking punktów przyłączenia
        (konsumuje D3 + NC RfG + straty), P41 krzywe P–Q (delta katalogowa).
        UWAGA IA: warsztat wyników ma 10 zakładek — do audytu rady (grupowanie
        OZE) przy najbliższym przeglądzie fazowym.
        D3a straty/napięcia scenariuszy (Sonnet; +8 testów; PRZEJĘTE przez
        zarządcę po zawieszeniu wykonawcy — weryfikacja i commit w worktree;
        zintegrowane `d683d45`; pełny pytest 5783 pass ZERO failed potwierdzony).
        Karty D3a/P19 `7cb7ae9`. P19 ranking punktów przyłączenia (Opus;
        33 testy; pełny vitest u wykonawcy 8318 pass ZERO failed; zintegrowane
        `91860d1`; klasa NC RfG WŁĄCZONA — progi klas A/B/C/D są w katalogu
        operatorów loader.py:17-25, mapowanie słownikowe 1:1 z classify_module;
        koszt przyłącza jawnie pominięty — strumień kosztorysanta).
        Scalenie #11: zakładka „Ranking przyłączeń" (`3c2fcbd`; ui2 1029 pass;
        pełny vitest 8318 potwierdzony).
        D4 krzywe P–Q w katalogu (Opus; 26 testów; pole pq_curve addytywne +
        serwis pq_coverage + końcówka; pełny pytest 5809 pass ZERO failed
        potwierdzony; guardy katalogowe zielone; zintegrowane `5806855`).
        P41 okno krzywych P–Q (Opus; 27 testów; pełny vitest u wykonawcy 8345
        pass; zintegrowane `9537b68`). Scalenie #12: zakładka „Krzywe P–Q"
        (`dac4c82`; ui2 1056 pass). STRUMIEŃ OZE — KOMPLET PIERWSZEJ FALI:
        P39→P47→P47a→P2→P19→P41 zrealizowane end-to-end (backend+okna+powłoka).
        Kolejne fale wg kolejności właściciela: P30→P35→P38→P40→P42→P43→P46→P37.
        Pełny vitest kompletu fali: 632 pliki / 8345 pass (exit 0).
        Scalenie #13 — przegląd IA: zakładki warsztatu wyników pogrupowane
        („Analizy sieci" / „OZE i przyłączenia"; jeden tablist, testidy bez
        zmian, klawiatura = kolejność wizualna; `288d7a6`; ui2 1056 pass;
        pełny vitest 8345 potwierdzony).
        FALA 2 OZE: D5 obszar bezpiecznej pracy P–Q węzła (Opus; 30 testów;
        końcówka /api/oze-analysis/pq-area — siatka P×Q anchored w Q=0 na
        wzorcu D3; recon Q generatora rozstrzygnięty dowodowo mapping.py:201;
        pełny pytest 5839 pass ZERO failed potwierdzony; zintegrowane
        `5a7aac6`). P30 okno obszaru P–Q (Opus; 34 testy; pełny vitest
        u wykonawcy 8379 pass ZERO failed; zintegrowane `567317c`; nakładka
        krzywej producenta na pasmo sieci — jeden wykres). Scalenie #14:
        zakładka „Obszar pracy P–Q" w grupie OZE (`ad46c40`; ui2 1090 pass).
        NASTĘPNE FALI 2: P35 studium przyłączenia (kreator spinający analizy),
        P38 walidacja modelu falownika.
        P30 potwierdzone pełnym biegiem 8379. P35 kreator studium przyłączenia
        (Opus; 30 testów; 4 kroki wg SPEC_KREATORY z hintami PL i prefill;
        sekwencja analiz odporna na błąd wariantu; przegląd zbiorczy reużyciem
        rankingu/obszaru/zdolności; pełny vitest u wykonawcy 8409 pass ZERO
        failed; zintegrowane `cedd170`). Scalenie #15: zakładka „Studium
        przyłączenia" (`7f5511c`; ui2 1120 pass). TODO-KARTY: dokument studium
        (E13), nawigacja między zakładkami warsztatu.
        P35 potwierdzone pełnym biegiem 8409. D6 API trajektorii FRT/HVRT
        z obwiednią (Opus; 17 testów; refaktor wydzielający budowę wejścia
        z ncrfg_compliance/checker.py — 49 testów zgodności bez regresji;
        PRZEJĘTE przez zarządcę po zawieszeniu; zintegrowane `2472c7b`;
        pełny pytest 5856 pass ZERO failed potwierdzony). P38 okno walidacji
        modelu falownika (Opus; 36 testów; pełny vitest u wykonawcy 8445 pass
        ZERO failed; zintegrowane `b5f658b`; UCZCIWE rozstrzygnięcie: D6 nie
        echo-uje głębokości zapadu/czasu trwania — kolumna „Napięcie skrajne"
        z trajektorii zamiast fabrykacji; rekomendacja echa parametrów w D6).
        Scalenie #16: zakładka „Walidacja falownika" (`2f70995`; ui2 1156 pass).
        FALA 2 OZE KOMPLETNA: P30→P35→P38 end-to-end (D5/D6 + okna + powłoka);
        pełny vitest 8445 potwierdzony (po restarcie kontenera — push przetrwał,
        bieg powtórzony). FALA 3: D7 symulacja odpowiedzi na polecenia OSD
        (Opus; 28 testów; dwa biegi bazowy-vs-polecenie; PRZEJĘTE po
        zatrzymaniu wykonawcy — bramki dokończone przez zarządcę; zintegrowane
        `0c6c0ed`; pełny pytest 5884 pass ZERO failed potwierdzony). P40 okno
        odpowiedzi OSD (Opus; 28 testów; PRZEJĘTE po braku odpowiedzi monitora
        — bramki zweryfikowane w worktree przez zarządcę: ui2 1184 pass, guardy
        zielone; zintegrowane `232c062`). Scalenie #17: zakładka „Polecenia OSD"
        (`518802d`). PROCEDURA WZMOCNIONA: po każdym powiadomieniu wykonawcy
        sprawdzać żywotność procesu (ps) i przejmować bez czekania na monitor.
        Pełny vitest po #17: 8473 pass. D8 dobór kompensacji (Opus; 27 testów;
        pełny pytest u wykonawcy 5910 pass ZERO failed; zintegrowane `47fbeb5`).
        ESKALACJA D8 (2026-07-17): podejrzenie konwencji znaku shunt/przepływów
        gałęzi (kompensacja „pogarsza" cosφ odbioru indukcyjnego w odczycie
        q_from) — okno P42 WSTRZYMANE do rozstrzygnięcia; karta diagnostyczna
        K1 (read-only, przypadek minimalny z rachunkiem ręcznym WHITE BOX)
        delegowana. Zmiana solvera/enm — jeśli potwierdzona — poza programem
        UI/UX (decyzja właściciela/wątku 10x).
        K1 ROZSTRZYGNIĘTE (2026-07-17): znak susceptancji shunt POPRAWNY
        (zgodny z ładownością linii; dowód liczbowy); defekt = interpretacja
        cosφ z przepływów gałęzi w D8 + niespójność konwencji znaku Q wyników
        (slack_q/q_from/q_to) — zarejestrowane jako V12K-027 (wysoki; FROZEN
        API — decyzja właścicieli solvera). Testy diagnostyczne scalone
        `7b3ce58` (pełny pytest u wykonawcy 5915 pass). P42 okno pozostaje
        WSTRZYMANE do rozstrzygnięcia V12K-027.
        PROCEDURA: wykonawcy backendowi zawieszają się po pełnym pytest (3
        przypadki) — zarządca przejmuje: weryfikacja w worktree + commit
        w imieniu wykonawcy (bez oczekiwania na raport).
        POTWIERDZENIE po scaleniu K1 (2026-07-17): pełny pytest na drzewie
        głównym 5915 passed, 0 failed (651 s).
        FALA 3 ciąg dalszy (2026-07-17): karta D9 (P43 — sekwencje zapadów
        FRT + kontekst SCR; wsparcie ride-through z magazynu POZA ZAKRESEM,
        wymaga modelu magazynu w FROZEN solverze FRT — decyzja właścicieli
        solvera) i karta D10 (P46 — ochrona LoM: ROCOF/przesunięcie wektora,
        addytywne rozszerzenie ProtectionSetting, koordynacja z SPZ)
        delegowane równolegle do wykonawców Opus (worktree).
        SCALENIE #18 (2026-07-17): D9+D10+D11 (karta D11 = P37 migotanie
        IEC 61000-3-7, addytywne pole flicker_c w ConverterType,
        GET /api/quality/flicker). Restart kontenera zabił pełne pytest
        wszystkich trzech wykonawców — zarządca przejął: bramki celowane
        w worktree (D9 29, D10 21, D11 29 pass), ruff/black/mypy czyste,
        commity w imieniu wykonawców, cherry-pick bez konfliktów
        (83d1ed7, c684b23, 27b3cb8), 79 testów celowanych na drzewie
        głównym, 11 guardów OK (catalog_* pod venv poetry — systemowy
        python bez networkx to fałszywy FAIL). Konfirmacja pełnym pytest
        w tle. UWAGA: worktree wykonawców mogą mieć świeży pusty venv
        poetry — bramki uruchamiać venv drzewa głównego (D2vgvUMQ).
        POTWIERDZENIE #18 (2026-07-17): pełny pytest 5986 passed, 0 failed
        (605 s) — nowa baza backendu 5986. Pierwsza próba konfirmacji padła
        na PEŁNYM DYSKU (100%) — sprzątnięto ~28 GB (worktree poprzednich
        fal + osierocone venv poetry); procedura: przy niepowodzeniu tła
        najpierw `df -h`. Okna frontendowe P43/P46/P37 delegowane (karta
        U4_P43_P46_P37_OKNA); monitoring żywotności wykonawcy co 10 min
        (dyspozycja właściciela).
        SCALENIE #19 (2026-07-17): okna fali 3 (8f1d6c1) — sekcja
        „Sekwencja zapadów" w EkranFrt (edytor zapadów + kontekst SCR),
        nowa zakładka warsztatu „Praca wyspowa" (lom, EkranLom), sekcja
        „Migotanie i szybkie zmiany napięcia" w EkranJakosci. Wykonawca
        zakończył z pełnym raportem (pełny vitest w worktree 8510 pass,
        0 failed; +37 netto). Weryfikacja zarządcy na drzewie scalonym:
        149 testów celowanych, type-check, lint, 4 guardy UI — zielone.
        Konfirmacja pełnym vitest w tle. TODO-KARTA: selektory
        run_id/bus_ref kontekstu siły sieci w sekcji sekwencji FRT
        (klient je przyjmuje; ekran FRT nie ma dziś źródła przebiegów).
        POTWIERDZENIE #19 (2026-07-17): pełny vitest na drzewie scalonym
        8510 passed, 0 failed (510 s) — nowa baza frontendu 8510.
        Karta D12 (P45 — zgodność powykonawcza) delegowana.
        SCALENIE #20 (2026-07-17): D12 — raport zgodności powykonawczej
        (POST /api/quality/as-built-compliance; porównanie 1:1 pomiar↔wynik
        FROZEN rozpływu, bez estymacji WLS; Q po |wartości| do V12K-027;
        DECYZJA: tolerancje wyłącznie JAWNE — EN 50160 nie mapuje odchyłki
        pomiar↔model, domyślna wartość byłaby heurystyką). Wykonawca
        zakończył z raportem (pełny pytest 6021 pass, 0 failed); weryfikacja
        zarządcy: 35 celowanych + 4 guardy OK. Konfirmacja w tle.
        POTWIERDZENIE #20 (2026-07-17): pełny pytest na drzewie scalonym
        6021 passed, 0 failed (611 s) — nowa baza backendu 6021. Okno P45
        (zakładka „Zgodność powykonawcza") delegowane.
        SCALENIE #21 (2026-07-17): okno P45 (2dc2ff2) — zakładka „Zgodność
        powykonawcza" (moduł ui2/wyniki/odbior: wybór przebiegu PF, CSV lub
        edytor wierszy, jawne tolerancje, raport z werdyktami i śladem).
        PRZEJĘCIE: wykonawca zatrzymał się w trakcie pełnego vitest
        (osierocony potok stdout — proces ubity przez zarządcę); bramki
        zweryfikowane przez zarządcę w worktree (56 celowanych, type-check,
        lint, 3 guardy UI + codenames), commit w imieniu wykonawcy,
        cherry-pick, po scaleniu ponowna weryfikacja (56 + type-check).
        Konfirmacja pełnym vitest w tle. WNIOSEK PROCEDURALNY: wykonawcy
        mają uruchamiać pełne suity Z PRZEKIEROWANIEM DO PLIKU (np.
        `npm test > pelny_vitest.log 2>&1`), nie na goły potok.
        POTWIERDZENIE #21 (2026-07-17): pełny vitest 8536 passed, 0 failed
        (530 s) — nowa baza frontendu 8536. FALA 3 KOMPLETNA: P43/P46/P37/
        P45 (backend + okna); P42 wstrzymane (V12K-027), P44 czeka na P27.
        Następny krok: konsolidacja rejestru TODO-KART (drobne delty
        backend + frontend dwiema kartami).
        SCALENIE #22 (2026-07-17): D13 konsolidacja TODO backendu (17d49ae →
        cherry-pick) — n_parallel w mocy IBG (grid_strength + migotanie,
        `resolve_n_parallel`), q_actual per źródło w adekwatności Q
        (addytywnie, fingerprint nietknięty), echo parametrów scenariusza
        FRT. Wykonawca: pełny pytest 6027 pass, 0 failed (log do pliku —
        procedura działa). Zarządca: 73 celowane + 4 guardy OK, push.
        Konfirmacja w tle. Karta TODO-front OZE w realizacji.
        SCALENIE #23 (2026-07-17): TODO-front OZE (f617f76 → cherry-pick) —
        selektory run_id/bus_ref kontekstu SCR w sekwencji zapadów FRT,
        klasa modułu A/B/C/D w macierzy NC RfG, nazwa przypadku w etykietach
        porównania A/B, testy graniczne formatera energii (formater sam
        istniał z P47a — bez duplikacji). Wykonawca: pełny vitest 8553 pass,
        0 failed. Zarządca: 393 celowane + type-check + lint + 4 guardy OK,
        push. Konfirmacje #22 (pytest) i #23 (vitest) w tle.
        POTWIERDZENIE #22 (2026-07-17): pełny pytest 6027 passed, 0 failed
        (620 s) — nowa baza backendu 6027.
        POTWIERDZENIE #23 (2026-07-17): pełny vitest 8553 passed, 0 failed
        (649 plików) — nowa baza frontendu 8553. BAZY: backend 6027,
        frontend 8553. Karta D14 (certyfikat zgodności NC RfG, E13)
        delegowana.
        SCALENIE #24 (2026-07-17): D14 certyfikat zgodności projektu NC RfG
        (1a769f8 → cherry-pick) — POST /api/oze-analysis/
        compliance-certificate (JSON) i .docx (deterministyczny bajtowo,
        make_docx_bytes_deterministic); USTALONE: źródłem werdyktów jest
        NcRfgPtpireeSolver (ta sama ścieżka co macierz, engine.py:208) —
        ncrfg_compliance.checker to starszy silnik statyczny, nieużyty;
        braki (no_data) blokują generację z listą PL, werdykt negatywny
        nie blokuje. PDF = świadome TODO (determinizm bajtowy reportlab
        wymaga osobnej normalizacji metadanych). Wykonawca: pełny pytest
        6043 pass, 0 failed. Zarządca: 16 celowanych + 5 guardów OK, push.
        Konfirmacja w tle. TODO-KARTA: przycisk certyfikatu w macierzy
        NC RfG (frontend) + PDF certyfikatu.
        POTWIERDZENIE #24 (2026-07-17): pełny pytest 6043 passed, 0 failed
        (603 s) — nowa baza backendu 6043. Karta P39c (przycisk certyfikatu
        w macierzy) delegowana.
        SCALENIE #25 (2026-07-17): P39c certyfikat w macierzy NC RfG
        (c4d7571 → cherry-pick) — przycisk z podglądem, lista braków 422
        (CertyfikatBrakiError, detail jako obiekt), pobranie DOCX;
        ncRfgStore.ostatnieWejscia gwarantuje żądanie 1:1 z zakończonym
        biegiem (uzasadnione odstępstwo). Wykonawca: pełny vitest 8564
        pass, 0 failed. Zarządca: 364 celowane + type-check + lint +
        4 guardy OK, push. Konfirmacja w tle.
        SCALENIE #26 (2026-07-17): D15 generator wniosku OSD (b656c04 →
        cherry-pick) — POST /api/oze-analysis/osd-application (JSON+DOCX
        deterministyczny; bilans z walidacji energetycznej PF, zwarcia
        punktu z SC, zgodność NC RfG ścieżką D14; schemat SLD i W-702
        z uczciwymi adnotacjami; bramka braków 422 PL). PRZEJĘCIE: wykonawca
        zawieszony po pełnym pytest (6066 pass, 0 failed w jego logu) —
        zarządca: lint+mypy+23 celowane w worktree, commit w jego imieniu,
        cherry-pick, 23+5 guardów na drzewie głównym, push.
        AWARIA KONFIRMACJI #25: pełny vitest padł w połowie (10:17, bez
        podsumowania — najpewniej ubity przy równoległym pełnym pytest
        D15); restart sekwencyjny (vitest → pytest) w tle. PROCEDURA:
        nie puszczać dwóch pełnych suit RÓWNOLEGLE.
        POTWIERDZENIE #25r (2026-07-17): pełny vitest 8564 passed, 0 failed
        — nowa baza frontendu 8564. Okno W-707 (zakładka „Wniosek OSD")
        delegowane. PROCEDURA: worktree wykonawcy sprzątać dopiero po
        wygaśnięciu agenta (późny raport D15 zastał usunięty worktree —
        bez utraty danych, commit zarządcy wcześniejszy).
        POTWIERDZENIE #26 (2026-07-17): pełny pytest 6066 passed, 0 failed
        (704 s) — nowa baza backendu 6066. BAZY: backend 6066, frontend
        8564.
        SCALENIE #27 (2026-07-17): okno W-707 „Wniosek OSD" (76f27e0 →
        cherry-pick) — nowa zakładka warsztatu (grupa OZE za osd), moduł
        ui2/oze/wniosek (formularz PF+SC+węzeł+identyfikacja, run_request
        z ncRfgStore.ostatnieWejscia, sekcje wniosku, braki 422, DOCX).
        Wykonawca: pełny vitest 8588 pass, 0 failed (+24). Zarządca:
        55 celowanych + type-check + lint + 4 guardy OK, push.
        Konfirmacja w tle. ŁAŃCUCH E13 DOMKNIĘTY: certyfikat (D14/P39c)
        + wniosek OSD (D15/W-707) — backend i okna.
        POTWIERDZENIE #27 (2026-07-17): pełny vitest 8588 passed, 0 failed
        (652 plików) — BAZY: backend 6066, frontend 8588.
        SCALENIE #28 (2026-07-17): E12.2 porównanie A/B zwarć (05aa2c0 →
        cherry-pick) — tryb zwarciowy w zakładce porównań (selektory SC,
        tabela A/B/Δ per punkt Ik''/ip/Ith/Sk, osierocone punkty „tylko
        A/B"). RECON: obie ścieżki backendu niepełne (comparison/service
        _compare_short_circuit:136-176 agreguje do jednej delty;
        domain/sc_comparison build_comparison:224-227 cicho pomija punkty
        bez odpowiednika) → zastosowano dopuszczoną klauzulą STOP
        prezentacyjną różnicę wartości backendu (trio(), komentarz).
        Wykonawca: pełny vitest 8610 pass, 0 failed (+22). Zarządca:
        62 celowane + type-check + lint + 4 guardy OK, push. Konfirmacja
        w tle. TODO-KARTA (delta backendowa, opcjonalna): delty zwarciowe
        per punkt z jawnym znacznikiem osieroconych w ScComparisonService.
        POTWIERDZENIE #28 (2026-07-17): pełny vitest 8610 passed, 0 failed
        — BAZY: backend 6066, frontend 8610.
        SCALENIE #29 (2026-07-17): wirtualizacja tabel wyników (dc4ce13 →
        cherry-pick) — ręczne okno w TabelaWynikow powyżej 500 wierszy
        (33 px/wiersz z wyliczeniem z wzorzec.css, przekładki, determinizm
        scrollTop, kontrakt propsów nietknięty, zero nowych zależności;
        poniżej progu DOM 1:1). Wykonawca: pełny vitest 8622 pass,
        0 failed (+12). Zarządca: 90 celowanych + type-check + lint +
        4 guardy OK, push. Konfirmacja w tle.
        POTWIERDZENIE #29 (2026-07-17): pełny vitest 8622 passed, 0 failed
        — BAZY: backend 6066, frontend 8622.
        SCALENIE #30 (2026-07-17): D16 eksport PDF certyfikatu i wniosku
        OSD (77be560 → cherry-pick) — końcówki .pdf z bramką braków;
        DETERMINIZM BAJTOWY osiągnięty (canvas invariant=1 +
        pageCompression=0, mocniejszy niż precedens treściowy repo);
        renderery obok serwisów D14/D15 (spójnie z DOCX tych dokumentów).
        Wykonawca: pełny pytest 6082 pass, 0 failed (+16); wyścig
        commit/przejęcie rozstrzygnięty na korzyść wykonawcy (77be560,
        bez utraty danych). Zarządca: 55 celowanych + 4 guardy OK, push.
        Konfirmacja w tle.
        POTWIERDZENIE #30 (2026-07-17): pełny pytest 6082 passed, 0 failed
        (695 s) — BAZY: backend 6082, frontend 8622.
        SCALENIE #31 (2026-07-17): P47b mapowanie moduł→węzeł (e303880 →
        cherry-pick) — addytywna lista modułów per węzeł w widoku siły
        sieci (analysis/grid_strength builder+serializer+modele) + klik
        modułu w pulpicie podświetla wiersze węzła w sekcjach SilySieci/
        AdekwatnosciQ (odznaczenie, adnotacja PL dla modułu bez węzła).
        PRZEJĘCIE po zatrzymaniu wykonawcy w trakcie pełnego pytest
        (bieg do pliku przeżył; 6089 pass) — zarządca dokończył: pełny
        vitest w worktree 8634 pass, 0 failed, bramki, commit w imieniu
        wykonawcy. Zarządca po scaleniu: 19+74 celowanych + type-check +
        7 guardów OK, push. Konfirmacje sekwencyjne w tle.
        POTWIERDZENIE #31 (2026-07-17): pełny vitest 8634 passed, 0 failed
        + pełny pytest 6089 passed, 0 failed (675 s) — BAZY: backend 6089,
        frontend 8634. Rejestr TODO-KART strumienia OZE domknięty poza
        pozycjami dużymi (wygaszanie zakładek mostu, property grid E5.x,
        dokument studium — osobne karty).
        PLAN WYGASZANIA MOSTU WYNIKÓW (2026-07-17): wiążący dokument
        docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md — inwentarz 20+
        powierzchni (grupy A pokryte / B do migracji / C nie-wynikowe),
        fale W1–W5, zasada pokrycia 1:1 przed wygaszeniem trasy.
        SCALENIE #32 (2026-07-17): D17 dokument studium przyłączeniowego
        (05f3125 → cherry-pick) — POST /api/oze-analysis/connection-study
        (+.docx/.pdf, determinizm bajtowy); serwerowa kompozycja sekwencji
        kreatora (hosting→pq-area→pq-coverage per wariant, serwisy
        bezpośrednio); błąd wariantu nie przerywa dokumentu; klasa NC RfG
        z backendowego classify_module (loader.py:79 — źródło prawdy,
        frontendowy klasaNcRfg to lustro 1:1). Wykonawca: pełny pytest
        6112 pass, 0 failed (+23). Zarządca: 23 celowane + 5 guardów OK,
        push. Konfirmacja w tle.
        POTWIERDZENIE #32 (2026-07-17): pełny pytest 6112 passed, 0 failed
        (673 s) — BAZY: backend 6112, frontend 8634. Karta P35b (okno
        dokumentu studium w kreatorze) delegowana.
        SCALENIE #33 (2026-07-17): P35b dokument studium w kreatorze
        (205ad3b → cherry-pick) — akcja z podglądem, sekcjami błędów
        wariantów, brakami 422 i pobraniami DOCX/PDF; parametry żądania
        snapshotowane ze stanu zakończonego biegu (nie z formularza).
        Wykonawca: pełny vitest 8647 pass, 0 failed (+13). Zarządca:
        43 celowane + type-check + lint + 4 guardy OK, push. Konfirmacja
        w tle. DOKUMENTY E13 KOMPLETNE end-to-end: certyfikat + wniosek
        OSD + dokument studium (backend JSON/DOCX/PDF + okna).
        POTWIERDZENIE #33 (2026-07-17): pełny vitest 8647 passed, 0 failed
        — BAZY: backend 6112, frontend 8647. Karta W1 (kontrakt analizy
        w panelu przebiegów — fala W1 wygaszania mostu) delegowana.
        SCALENIE #34 (2026-07-17): W1 kontrakt analizy w panelu przebiegów
        (aa33b73 → cherry-pick) — trzy grupy kontraktu (parytet 1:1
        z panelami mostu E-29/E-34/zbieżność przez REUŻYCIE hooka
        i formaterów analysisRunContract.ts, zero importu komponentów
        mostu); rejestr W1 w PLAN_WYGASZANIA_MOSTU_WYNIKI.md wypełniony.
        Wykonawca: pełny vitest 8656 pass, 0 failed (+9). Zarządca:
        90 celowanych + type-check + lint + 4 guardy OK, push.
        Konfirmacja w tle.
        POTWIERDZENIE #34 (2026-07-17): pełny vitest 8656 passed, 0 failed
        — BAZY: backend 6112, frontend 8656.
        SCALENIE #35 / FALA W2 (2026-07-17, zarządca — mikro-delta):
        rekonesans wykazał, że Convergence i SourceContributions to te
        same cienkie panele kontraktu co W1 (dane wkładów od dawna
        w EkranZwarc) — dodano dwa wiersze parytetu („Rodzaj przypadku",
        „Projekt") + test przez realny formater mostu; rejestr W2
        w planie wygaszania wypełniony. 91 celowanych + bramki OK, push.
        Konfirmacja w tle.
        POTWIERDZENIE #35 (2026-07-17): pełny vitest 8657 passed, 0 failed
        — BAZY: backend 6112, frontend 8657. REKONESANS W3: PhaseState
        i DynamicStability to też cienkie panele kontraktu (router);
        Zksn/V126Academic/Fw/Bess/Der żyją w osobnych plikach surfaces/
        (potencjalnie pełne) — karta W3: parytet cienkich + klasyfikacja
        pełnych do decyzji W4.
        SCALENIE #36 / FALA W3 (2026-07-17): parytet ostatnich cienkich
        paneli (74d1055 → cherry-pick) — grupa „Stany i warianty"
        (caseRef, qualityGate, completenessLegacy, fault_scenario_ref);
        KLASYFIKACJA: Zksn → Grupa C (konfigurator modelu, opis planu
        był błędny), V126Academic → pełna powierzchnia (DECYZJA
        WŁAŚCICIELA w W4: migrować/zostawić/osobna przestrzeń),
        Fw/Bess/Der → konfiguratory OZE Grupa C (wyniki pokryte pulpitem).
        WSZYSTKIE cienkie panele Grupy B pokryte (W1+W2+W3). Wykonawca:
        pełny vitest 8663 pass, 0 failed (+6). Zarządca: 97 celowanych +
        bramki OK, push. Konfirmacja w tle. Pozostaje W5 (wygaszenie tras
        dublujących po weryfikacji Grupy A) i decyzja właściciela W4.
        POTWIERDZENIE #36 (2026-07-17): pełny vitest 8663 passed, 0 failed
        — BAZY: backend 6112, frontend 8663.
        AUDYT W5a SCALONY (5ce64e4→cherry-pick, 2026-07-17): pełne tabele
        pokrycia Grupy A w raporcie wykonawcy + skrót w planie wygaszania.
        WERDYKTY: ComplianceSurface → WYGASIĆ (rdzeń krzywych FRT pokryty
        SUPERSETEM EkranFrt; KOREKTA MAPOWANIA: macierz NC RfG pokrywa
        NcRfgTestsTab, nie E-26); AnalysisSurface → rdzeń pokryty, blokuje
        tylko STUB „analizy wrażliwości" (pusty panel, entries=[]);
        ProofSurface → przegląd dowodu pokryty, akcje audit2 (generator
        pakietów, rozpływ rozszerzony) BEZ odpowiednika — DECYZJA
        WŁAŚCICIELA (migracja do Dokumentacja/Obliczenia vs most).
        SCALENIE #37 / W5b-K1 (2026-07-17, zarządca — mikro-delta):
        trzy wiersze kontraktu domykające luki audytu (Wariant, Model
        IBG/OZE, Wersja katalogu z reproducibility) + test; 98 celowanych
        + bramki OK, push. Konfirmacja w tle. DO DECYZJI WŁAŚCICIELA:
        W5b (wygaszenie trasy E-26 Compliance — gotowe do wykonania;
        AnalysisSurface — uznanie stubu wrażliwości; ProofSurface — los
        akcji audit2) i W4 (V126Academic).
        POTWIERDZENIE #37 (2026-07-17): pełny vitest 8664 passed, 0 failed
        — BAZY: backend 6112, frontend 8664. Wszystkie wykonywalne bez
        decyzji właściciela fale epiki wygaszania domknięte.
        SCALENIE #38 / E5.x (2026-07-17): zakładka „Właściwości" modelu
        (077ef75 → cherry-pick) — PropertyGridContainer mostu reużyty
        (chirurgiczny export), selekcja z ui/selection, zapis WYŁĄCZNIE
        istniejącą operacją domenową update_element_parameters (parytet
        z InspectorEngineeringView), multi-edit, stan pusty PL.
        Wykonawca: pełny vitest 8674 pass, 0 failed (+10). Zarządca:
        203 celowane + 5 guardów UI OK, push. Konfirmacja w tle.
        POTWIERDZENIE #38 (2026-07-17): pełny vitest 8674 passed, 0 failed
        — BAZY: backend 6112, frontend 8674. REJESTR DUŻYCH POZYCJI
        WYKONYWALNYCH BEZ DECYZJI WŁAŚCICIELA — PUSTY. Otwarte wyłącznie
        punkty decyzyjne: V12K-027 (→P42), W5b/W4 (trasy mostu:
        E-26 gotowe, stub wrażliwości, akcje audit2, V126Academic),
        P44 (po P27).
        V12K-027 ROZSTRZYGNIĘTE — OPCJA B (2026-07-17, decyzja właściciela
        po dowodzie liczbowym zarządcy na rzeczywistym solverze). Dowód:
        LF spójny (Slack_Q≡Q_from, bilans I²X), napięcie rośnie z baterią,
        defekt w interpretacji surowego q_to jako zapotrzebowania (linia
        dobor_kompensacji.py:246/250, cosφ:257); adapter (interpretacja)
        naprawia bez zmiany FROZEN API. SCALENIE #39 / K2 (f44d90e →
        cherry-pick): adapter `konwencja_mocy.py` (czysta interpretacja,
        ZERO mutacji PowerFlowResult), rozdział DWÓCH wielkości w DTO D8
        (cosfi_przekroju vs cosfi_punktu — dobór na punkcie), trwały test
        diagnostyczny `test_dowod_v12k027.py` (produkcyjna ścieżka
        execute_run; Wymóg 3: bus/branch/summary identyczne przed/po
        adapterze), 7 testów kontraktowych. K1 read-only zachowany (twarda
        prawda solvera 0,666624/0,496668/0,312428 pod cosfi_przekroju).
        PRZEJĘCIE po restarcie kontenera (wykonawca zabity na 83% pytest;
        dorobek przeżył): zarządca zweryfikował diff K1 + adapter, commit
        w imieniu wykonawcy, 45 celowanych + full 6126 pass + 4 guardy.
        Trzy warunki scalenia właściciela SPEŁNIONE. Następny krok:
        okno P42 (frontend) z rozdziałem obu cosφ w UI. Konfirmacja #39
        w tle.
        POTWIERDZENIE #39 (2026-07-17): pełny pytest 6126 passed, 0 failed
        (685 s) — BAZY: backend 6126, frontend 8674. Okno P42 (dobór
        kompensacji, rozdział cosφ przekroju/punktu w UI) delegowane.
        DECYZJE WŁAŚCICIELA — ZAMKNIĘCIE EPIKI WYGASZANIA (2026-07-17):
        D1=A wygasić E-26 · D2=A wygasić AnalysisSurface (stub wrażliwości
        niedostarczony) · D3=A audit2 zostaje w moście · D4=A V126Academic
        zostaje · D5=B P27/P44 odłożone (planować PO wygaszaniu). WIĄŻĄCA
        BRAMKA PARYTETU przed usunięciem KAŻDEJ trasy (6 warunków:
        100% kontraktu, identyczny payload API, identyczne wyniki, brak
        utraty akcji, brak regresji UI, E2E+regresja OK) —
        docs/uiux/PLAN_WYGASZANIA_MOSTU_WYNIKI.md §3a-3b. RECON: E-26 to
        DZIECKO AnalysisSurface (przycisk FRT/LVRT/HVRT, kanon ekranów
        screenCanonRegistry.ts:658, macierz pokrycia) — wygaszenie dotyka
        typu ScreenCode i kanonu → refaktor za Bramką Parytetu z E2E.
        Kolejność: W5b-1 (E-26) → W5b-2 (AnalysisSurface); delegacja PO
        scaleniu P42 (jeden ciężki strumień frontendu naraz — zakaz dwóch
        pełnych suit/E2E równolegle). METODA = OPCJA 1 (właściciel „rób
        lepiej niż teraz"): wygasić tylko implementację/trasę legacy,
        ekran kanoniczny zostaje z nowym dostawcą UI (E-26→EkranFrt),
        ZERO zmian zamrożonego kanonu.
        SCALENIE #40 / P42 (c521103 → cherry-pick): okno „Dobór
        kompensacji" — rozdział DWÓCH cosφ w UI (kolumna DECYZYJNA =
        cosφ punktu kompensowanego; cosφ przekroju = informacyjna;
        test dowodowy: kandydat cosφ_przekroju 0,55 ale cosφ_punktu 0,97
        → „spełnia", dobór sterowany punktem = Wymóg 2 właściciela).
        Wykonawca: pełny vitest 8690 pass, 0 failed (+16). Zarządca:
        48 celowanych + 7 guardów OK, push. STRUMIEŃ V12K-027 DOMKNIĘTY
        end-to-end (K2 backend + P42 okno). Konfirmacja #40 w tle.
        POTWIERDZENIE #40 (2026-07-17): pełny vitest 8690 passed, 0 failed
        — BAZY: backend 6126, frontend 8690. Karta W5b-1 (wygaszenie E-26,
        Opcja 1, za Bramką Parytetu + STOP-guard kanonu) delegowana.
        SCALENIE #41 / W5b-1 (9cc9ba4 → cherry-pick, E-26=A, „nic nie
        wstrzymuj"): usunięty redundantny przycisk mostu FRT/LVRT/HVRT
        (punkt wejścia legacy), kanon nietknięty, EkranFrt dostawcą.
        Bramka Parytetu 1-5 zielona; E2E niesprawdzalny w worktree
        (uczciwie); 181 testów kanonu + bramki OK. STOP-GUARD: E-26
        osiągalne z SLD → PEŁNE wygaszenie = karta koordynacyjna wątku
        SLD (TODO). Zarządca: cherry-pick + kanon zielony + push.
        USUNIĘTY DŁUG API-LIFECYCLE (2026-07-17, dyrektywa „usuwaj dług"):
        23 końcówki tej sesji (oze-analysis/* + quality/* + warianty
        .docx/.pdf) zarejestrowane w MACIERZ_KOMPATYBILNOSCI_API.md
        (Wersja/Data/Zakres/Testy/Właściciel/Status); `api_lifecycle_guard`
        ZIELONY (był czerwony całą sesję — guard nie był w liście bramek,
        mój process gap). WPIĘCIE DO BRAMEK: api_lifecycle_guard +
        v12xx_canon_guard dodane do stałej listy bramek kart backendowych.
        POZOSTAŁY, PRE-EXISTING DŁUG (nie z tej sesji): v12xx_canon_guard
        czerwony na `[dark-scada-missing-file] App.tsx` — motyw dark-SCADA
        (markery nie istnieją nigdzie; migracja main.tsx→AppRoot) — osobna
        karta.
        SCALENIE #42 / dark-SCADA (78d12a9 → cherry-pick, „nic nie
        wstrzymuj"): diagnoza = regresja migracji ui2 (motyw zdefiniowany
        w całości: index.css/exportTheme/BaySvgRenderer, ale klasa
        mv-dark-scada nieaktywna — App.tsx skasowany). Naprawa: nowy cienki
        App.tsx (korzeń motywu mv-dark-scada + data-ui-theme=dark-scada)
        opakowuje AppRoot; main.tsx renderuje App. `v12xx_canon_guard`
        exit 0 (CAŁY dług kanonu tej rundy USUNIĘTY). Wykonawca: pełny
        vitest 8690 pass, 0 failed. Zarządca: canon guard zielony +
        celowany + type-check + lint, push. Konfirmacja #42 w tle.
        E-26 pełne wygaszenie = TODO wątku SLD (U5_E14_SLD_KOORD_E26).
        POZOSTAJE (D6): W5b-2 AnalysisSurface (Opcja 1, sprawdzić wejścia
        SLD przed usunięciem trasy).
        POTWIERDZENIE #42 (2026-07-17): pełny vitest 8690 passed, 0 failed
        — bazy 6126/8690 (W5b-1 + dark-SCADA potwierdzone).
        SCALENIE #43 / W5b-2 (5a0116d → cherry-pick): stub „Analiza
        wrażliwości" usunięty (przycisk + widok + komponent + test stubu
        z intencją D2); STOP-guard zweryfikowany NEGATYWNIE ('sensitivity'
        nie figuruje w kanonie ani jego testach — czyste usunięcie); trasa
        E-35 i fixActions zachowane wg karty; kanon nietknięty,
        v12xx_canon_guard exit 0. Wykonawca: pełny vitest 8689 pass,
        0 failed. Zarządca: 177 celowanych + canon + dead_click + push.
        ZGŁOSZONE OSIEROCENIE: SensitivityPanel.tsx + sensitivityAnalyzer.ts
        (ui/sensitivity) bez konsumenta w UI po wygaszeniu taba (mention,
        nie delete — decyzja właściciela o pełnym usunięciu osobno).
        EPIKA WYGASZANIA: D1+D2 wykonane (Opcja 1); D3/D4 zostają; W5
        route-retirement E-26 czeka na wątek SLD.
        W5b-3 / PEŁNE WYGASZENIE E-26 + USUNIĘCIE SIEROT (2026-07-18, po
        konsolidacji wątków — dyrektywa „działaj jak architekt, usuwaj dług"):
        konsolidacja (merge 75a70d3f) zniosła granicę wątków, więc domknięto
        E-26 w tej sesji. `WorkspaceSurfaceRouter` `case 'E-26'` → `EkranFrt`
        (ui2 superset) zamiast `ComplianceSurface`; komponent + import
        FrtHvrtCurves/NcRfgProfileId usunięte; componentKey kanonu
        'ComplianceSurface'→'EkranFrt' (metadana dostawcy, nie klucz routera);
        kanon E-26 (label/area/testId/transitions) nietknięty, v12xx_canon
        exit 0. Akcje SLD show-frt-hvrt/show-ncrfg celują w E-26 (=EkranFrt,
        realny backend — bez regresji). USUNIĘTO cały katalog ui/sensitivity/
        (Zero-Debt + D2=A): bez konsumenta ORAZ sensitivityAnalyzer liczył
        FIZYKĘ w prezentacji (linearyzacja deltaU=dUdP·P+dUdQ·Q) — naruszenie
        granicy warstw. Karta U5_E14 ZAMKNIĘTA. Bramki: type-check, lint 0,
        celowany 215/215, guardy exit 0; pełny vitest w konfirmacji. KONFIRMACJA #43 ODROCZONA
        świadomie do scaleń REF-A/REF-B (dwóch wykonawców w pełnych suitach
        — jedna konfirmacja łączna zamiast serializowania trzech).
        INTEGRACJA REFERENCE ENGINE V1 (zlecenie właściciela 2026-07-17,
        HANDOFF z wątku SLD): Faza 0 — kontrakty skonsumowane BAJTOWO
        z gałęzi SLD (types/api enm-inspector + mirrory ui/sld/reference,
        parity zweryfikowany diffem); Faza 0.5 — wspólny klient
        ui2/referencje/api.ts (reeksport + packs wg §1.1, 5 testów mock
        fetch); pkt 2.5 słownik IA (SLOWNIK_IA_2026-07.md) + pkt 2.6
        rezerwa RenderProfileId w useShellStore — GOTOWE. Pkt 2.1+2.2
        (REF-A: Gotowość) i 2.3+2.4+2.7 (REF-B: inspektor+kreator) —
        wykonawcy w toku. Backend nie istnieje na tej gałęzi — testy
        mockiem fetch wg wymogu HANDOFF §3.4 (uczciwie w raporcie).
  - [ ] U3 dalsze / U4–U5 wg programu

Rozgraniczenie ZNIESIONE (dyrektywa właściciela 2026-07-21 „twarda granica wątków usunięta …
działaj enduro end", rejestr V12K-084): jeden wątek prowadzi UI/UX + rework SLD
(`docs/plan/PLAN_SLD_REWORK.md`) + Engineering 10x end-to-end w tej samej sesji/PR. Wolno
edytować `ui/sld/**`, `sld-editor/**`, `engine/sld-layout/**` oraz warstwy 10x; klauzule
„wątek SLD V12K-060 / karta cross-thread" w starszych rejestrach są bezprzedmiotowe —
łańcuch domykamy do ostatniego klika (w tym glify/rendering SLD) bez odkładania. Rygor
jakości bez zmian (pełna regresja warstwy + guardy + determinizm + FROZEN/golden nietknięte).

### 3.-2b SLD v3 CAD/SCADA — program ZAMKNIĘTY + likwidacja długów repo (2026-07-17)

Gałąź `claude/sld-schema-cad-scada-rqvz73`. Przebudowa SLD do jakości CAD/SCADA
zakończona w całości: fazy F1–F11 (spec `docs/sld/SLD_CAD_SPEC_V3.md`,
wykonanie `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md`), F12 (rozstrzygnięcia
ARCH + kasacja ścieżki renderu v2, −16,5k linii), D3/F13 (kanon energetyczny:
GPZ WN/SN jako dominanta §21, mostki skrzyżowań i kropka węzłowa §22.1, pas
ochronny szyn + wejście przez głowicę od dołu §22.3, grubość magistrali §22.4
— audyt `docs/sld/SLD_ENGINEERING_CANON_AUDIT_D3_2026-07.md`, macierz wyroczni
`docs/sld/SLD_V3_ACCEPTANCE.md` §5, `npm run accept:sld-v3` ALL PASS L0/L1/L2).

Dyrektywa stała właściciela (2026-07-17): każdy defekt/dług/bug naprawiany
end-to-end bez pytania. Wykonana likwidacja długów (szczegóły: execplan,
sekcja „Po programie"): martwe workflowy CI aktywowane, klaster legacy ui/sld
skasowany (−11,7k linii), lista wykluczeń vitest wyzerowana (odbudowa testu
inspektora złapała 2 realne regresje komponentu), spójność elektryczna
szablonów DER (zgubiona moc, TR 3.15 MVA, strona nN za katalogiem),
test_no_todo_fixme i docs_count trwale zielone.

Runda 8 (2026-07-17, dyrektywa właściciela „Globalna integracja referencji
SLD" — 12 punktów): REFERENCE ENGINE V1 (spec WIĄŻĄCA
`docs/sld/REFERENCE_ENGINE_SPEC_V1.md`, ruling V12K-060). Backend
`src/reference_engine/` z 8 wersjonowanymi pakietami JSON (iec60617 —
słownik symboli, iec62271 — 10 profili pól required/one_of/forbidden/
kolejność/aparaty boczne + blokada uziemnika wspólnym predykatem z W034,
elektrometal_e2alpha, siemens_8djh, schneider_sm6, abb_unigear,
abb_safering — ref do katalogu rodzin bez kopii danych, osd_enea);
walidacja NA ŻYWO w walidatorze ENM (kody `reference.bays.*`, ścieżka
danych, FixAction BayModal); kreator filtrowany słownikiem rodziny
(SafeRing/8DJH bez CT); silnik zgodności ✓/✗ + Reference Score per pakiet
(API `/api/reference/*`); frontend: mirror pakietów z parytetem BAJTOWYM,
parytet słownika §12.4 z profilami (testy z sabotażami), zakładka
„Referencje" Inspektora ENM. Katalog +Schneider Electric/SM6-24
(repo_verified). Korekta faktograficzna: e²TANGO = sterowniki polowe (nie
rozdzielnica) — pakiet Elektrometal oparty na e²ALPHA. Runda 8b (dyrektywa
„zlec podwykonawca, zarządzaj, weryfikuj"): 2 podwykonawców research +
integracja — pakiet osd_enea@2026-02 z pełnej lektury 4 dokumentów Enea
Operator (5 reguł implemented: stacja kompaktowa podstawą, zakaz słupowej
z kablowym podejściem SN, granice mocy TR 630/400 kVA, skład 1×TR+1–4
liniowe, pomiar U/I pól zdalnie sterowanych TELE §6.4.1; kwalifikacja do
telemechaniki NIEUREGULOWANA w standardzie — ustalenie z lektury); 40
konfiguracji celek z oficjalnych katalogów (SafeRing/8DJH/SM6/UniGear) +
family.cell_match + test kreator↔celki; e²ALPHA uczciwie bez celek
(producent nie publikuje składu per typ pola). Dług pozostały: wzorniki
GRAFICZNE producentów (zlokalizowane legendy symboli w katalogach — punkt
startu). Szczegóły: execplan runda 8/8b. PRZEKAZANIE do wątku UI/UX
(zlecenie właściciela 2026-07-17): kontrakt koordynacyjny
`docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md` — prezentacja Reference
Score/ostrzeżeń/✓✗ per element/pickera rodzin w nowej powłoce; kontrakty
API + reguły twarde + potwierdzenia (wzorzec kontraktu 2026-07-15).

Runda 7 (2026-07-17, „zaprojektuj i wykonaj end-to-end" — 7 pozycji PLAN
recenzji NO-GO): szablony technologiczne pól (RMU-liniowe rozłącznik+ES+
głowica, RMU-trafo z uziemnikiem; nowy glif rozłącznika IEC 60617; wyrocznia
bay_template_probe z negatywem; korekta klas sylwetek V12K-031-A); tor za TR
domknięty (wiersze „Szyna nN · 0.4 kV" + odbiór ΣP/ΣQ z rekordów Load albo
jawna granica modelu; strzałka odbioru na szynie nN); identyfikatory globalne
S01.F01.Q2 w inspektorze + serializacja Bay.primary_devices na snapshotcie
(domknięcie V12K-030); walidator blokady uziemnika W034 + pole domeny
earthing_role; VT/3U0 szyn GPZ z danych Measurement; etykiety kabli z parą
końców „GPZ ↔ S01 — typ · długość"; pkt 16 (skala) — pomiar próby kompakcji
wykazał potrzebę lustrzanej kompozycji wiersza (plan). Szczegóły + statusy:
`docs/sld/SLD_REVIEW_NO_GO_2026-07-17.md`, execplan runda 7.

Runda 6 (2026-07-17, recenzja NO-GO właściciela — 16 punktów, rejestr WIĄŻĄCY
`docs/sld/SLD_REVIEW_NO_GO_2026-07-17.md`): naprawy GLOBALNE (spec/generator/
domena/walidator): objazd magistrali poza granicą strefy GPZ (+3×GRID, warunek
z pasem ±2×GRID); strona zaczepu źródła za `Source.bus_ref` — ekwiwalent SN na
szynie SN z tabliczką w napięciu WŁASNEJ szyny + wiersz „Ekwiwalent sieci
zasilającej" (koniec fałszu „Sk″ 250/Ik″ 9,62 przy 110 kV"), walidator domeny
`sources.sk_ik_voltage_inconsistent` (Ik″=Sk″/(√3·U) ±5%); tabliczka TR z
uk%/Pk z ENM; typ stacji terminalnej z topologii („stacja końcowa" gdy drugi
koniec wisi, stopNote); numeracja pól GPZ F01/FT1 jako ostatni fallback;
kotwica QE przy WŁASNYM uziemniku; legenda + głowica/źródło/koniec otwarty,
miernik z literą wielkości (A/V z danych pomiaru); unikatowe domyślne nazwy
stacji z kodem Sxx u źródła (backend). Regres złapany renderem: „Szyna WN ·
15 kV" → osobny kanał `hvBusVoltageKv`. Pozycje PLAN (szablony technologiczne
pól RMU, odbiory 0,4 kV, globalne ID aparatów, typologia uziemień, pomiary
U/3U0, etykiety przy trasie, skala kompozycji) — projekt w rejestrze recenzji.

Runda 4-5 (2026-07-17, odbiór „100% klasy przemysłowej" + korekta kanonu):
FEEDERY Z PÓL GPZ wykonane end-to-end — wiersz feederu ze stacjami / bieg
otwarty, `meta.stationCount` liczy stacje faktycznie narysowane, render DoD
`docs/audit/visual/sld_gpz_feeder_L2.png`. KOREKTA KANONU (dyrektywa
właściciela: „z jednego pola liniowego nigdy nie wychodzą dwa kable — każde
wyprowadzenie ma dedykowane pole"): pierwotny T-zaczep przy wspólnym polu był
herezją inżynierską i został usunięty; naprawa u ŹRÓDŁA w domenie —
`start_branch_segment_sn` z GPZ przydziela DEDYKOWANE pole liniowe (wolne albo
nowe; limit sekcji; relacja dwustronna pole↔korytarz — spec §21.3), scena
rysuje feeder wyłącznie z jego pola (brak pola ⇒ stopNote), a korytarz
magistrali omija pas portów innych pól. Świadomie poza zakresem (F6b): wiele
GPZ i odgałęzienia zagnieżdżone (jawne stopNotes). Wcześniej w tej rundzie:
odmaskowanie klików e2e (Zero-Debt pkt 5) ujawniło i naprawiło nieklikalną
kreskę toru (hitbox 12 px) i martwy lewy klik (pointer-capture).

Runda 3 (2026-07-17, „Wykonaj"): OBIE ostatnie luki v3 zamknięte end-to-end
(szczegóły + pomiary: execplan, sekcja „Dług otwarty… ZAMKNIĘTE"):
(1) §16-v3 biegi OTWARTE + tożsamość łańcucha — realne segmenty ENM bez
następnika (13 ogonów na fixturze referencyjnej, dotąd niewidocznych) rysowane
do słupka terminalnego z etykietą „koniec otwarty"; przęsła wieloczłonowe
niosą kawałek per segment ENM (klik/nakładka per człon); wyrocznia
`open_terminal_probe` + 21 testów na fixturach z realnego backendu;
(2) program P-A — nakładka rozpływu deklaruje pochodzenie na kanwie
(badge case_ref/zbieżność) i niesie atrybuty solverowe na odcinkach/symbolach;
`sld-pa-powerflow-tor` 6/6, `sld-editor-real-backend-flex` 2/2. Przy okazji
naprawione DWA defekty produktu: martwy lewy klik w elementy kanwy
(pointer-capture przekierowywał click na tło) i selekcja transformatora
(bay-ref zamiast realnego refu + odporność na modele z pustym `bays`).

### 3.-1b ESKALACJA (2026-07-15): odwrócony znak mocy w canonical PF pipeline — NAPRAWIONE (F9.8, tego samego dnia)

Podczas F9.6 przebudowy SLD v3 (`docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` § F9.8) wykryto i
NIEZALEŻNIE POTWIERDZONO (reprodukcja z dwóch ścieżek) pre-istniejącą podwójną negację znaku mocy:
`mapping.py` buduje `Node.active_power` w konwencji generacyjnej, `canonical_analysis.py:1185`
przekazuje ją wprost do `PQSpec.p_mw`, a solver (`build_power_spec_v2`) neguje ponownie, oczekując
konwencji obciążeniowej. Skutek: obciążenia wchodzą do rozpływu jako generacja — odwrócone znaki
`p_from_mw`/`q_from_mvar` i błędny profil napięcia (rośnie za obciążeniem) w KAŻDYM realnym
przebiegu LOAD_FLOW przez canonical pipeline. Istniejące testy nie łapią błędu (asercje wyłącznie
względne/samo-spójne). Solver niskopoziomowy jest POPRAWNY — błąd leży w warstwie przygotowania
wejścia (`canonical_analysis.py`, `sld_substrate_power_flow.py`). Plan naprawy (wiążący kształt,
zalecony przez recenzję): § F9.8 w `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md`.
**STATUS: NAPRAWIONE w rundzie F9.8 (2026-07-15, recenzja APPROVE z niezależną reprodukcją):**
konwersja gen→load na granicy budowy PQSpec (`canonical_analysis.py`, `sld_substrate_power_flow.py`),
solver i mapping nietknięte; dowód topologiczny w
`test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct`; asercje bezwzględne
dodane tam, gdzie testy były samo-spójne z błędem. Szczegóły i liczby przed/po: § F9.8 execplanu.

**NASTĘPSTWA W WĄTKU UI — REKALIBRACJA K3 (konsolidacja gałęzi, 2026-07-17,
karta `docs/uiux/karty/U4_K3_REKALIBRACJA_PO_F98.md`):** F9.8 był pierwotną
przyczyną anomalii V12K-040 (cosφ z przepływu gałęzi malał po dodaniu baterii)
— po scaleniu wątku SLD do gałęzi UI 22 testy diagnostyczne K1/K2/D8/D7
wymagały rekalibracji do nowej (fizycznie poprawnej) prawdy liczbowej.
Wykonano: (1) adapter `konwencja_mocy.py` — reguła odwzorowania tożsamość →
NEGACJA końca incydentnego; (2) `dobor_kompensacji.py` — odzysk zapotrzebowania
`Q_load = Q_przekroju + Q_cap_eff` (po F9.8 przepływ zawiera efekt baterii;
anomalia shuntu ZNIKŁA); (3) wartości odniesienia w testach przemierzone
(m.in. `v_load=0,989299<1`, `slack_q=+0,509650`, kompensacja PODNOSI cosφ
przekroju 0,894427→0,999976); (4) wykryty i naprawiony DEFEKT NASTĘPCZY F9.8:
`canonical_analysis.py:1256` montował `p_injected_mw` szyn PQ w konwencji
poboru wbrew FROZEN kontraktowi („ujemna = pobór", `power_flow_result.py:35`)
— negacja przy montażu wyniku; dowód: 3 testy D7 (`test_odpowiedz_osd_service`)
kodujące udokumentowaną konwencję przechodzą bez zmian asercji. Decyzja
właściciela V12K-040 (opcja B: adapter + rozdział cosφ przekroju/punktu)
pozostaje w mocy; adnotacje w `REJESTR_KONFLIKTOW.md` (V12K-040) i karcie K2.

**ZASADA FLOW PROJEKTANTA (dyrektywa właściciela 2026-07-18 — OSTRA):**
stare ekrany (`ui/**`, most) NIE są wzorcem docelowym ani „kanonicznymi
dostawcami" — kanon V12.xx to rejestr ZDOLNOŚCI (rozstrzygnięcie V12K-041);
każdy nowy ekran projektowany OD ETAPU FLOW projektanta (E1–E8) wg kontraktu
ekranu prowadzącego (cel · tor pracy z akcjami naprawczymi · uczciwe stany
zerowe · następny krok · język inżynierski). Specyfikacja WIĄŻĄCA:
`docs/uiux/FLOW_PROJEKTANTA_2026-07.md`; program §2.4; priorytety przebudów
wg bólu inżyniera na etapach (F-E5 analizy → F-E8 dokumentacja → F-E6 pętla
decyzji → F-E1 pulpit projektu → F-E3/E4 następny krok → F-E7 wejścia SLD).
Wzorce referencyjne: EkranAnalizTechnicznych (hub E5), EkranFrt (E-26).

### 3.0.0 V12.6 academic end-to-end closure (completed)

Status:
- [x] Gałąź integracyjna `codex/v12-6-professorski` zawiera backend, frontend, dokumentację, testy i guard `verify:v12.6`.
- [x] Ekrany E-40..E-50 są zarejestrowane w kanonie workspace i korzystają ze wspólnej powierzchni bez obliczeń po stronie UI.
- [x] `AcademicAnalysisResultV1` ma `white_box_trace`, deterministyczny hash oraz referencje proof/report.
- [x] Proof-pack i raport V12.6 są budowane w warstwie application z frozen result i trace, bez ponownego liczenia fizyki.
- [x] Endpointy result/trace/proof/report V12.6 mają wpisy w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`.
- [x] `npm run verify:v12.6`, pełne testy lokalne i GitHub CI dla PR #463 przechodzą.

### 3.0 Execution after 10/10 Audit (current)

Objective: Realize remediation plan from `docs/plan/PLAN_10_10_GLOBAL_SN.md` in strict sequence.

Progress:
- [x] Step I (Topology blockers) — backend CI guardians added for: radial 10, ring 8 + NOP, 2 rings + 2 sources, split+insert determinism (`backend/tests/test_topology_guardians_step1.py`).
- [x] Step II (Load Flow NR parity) — backend guardian tests added (`backend/tests/test_load_flow_step2_guardians.py`).
- [x] Step III (IEC 60909 closure) — backend guardian tests added (`backend/tests/test_short_circuit_step3_guardians.py`).
- [x] Step IV (Catalog materialization gates) — backend guardian tests added (`backend/tests/test_catalog_materialization_step4_guardians.py`).
- [x] Step V (Global white-box + export) — deterministic trace_id implemented in SC/LF/Protection emitters + regression tests; canonical step-order hardening added (permutation-invariant equation_steps hashing).
- [x] Step VI (UI↔Solver↔SLD integration) — fixed backend→frontend modal bridge for protection `relay_settings` + tests.
- [x] Step VII (SLD industrial aesthetics + golden render) — canonical render manifest + 3 golden SLD fixtures (radial, ring+NOP, PV/BESS) + CI guardian snapshots.
- [x] Step VII.b (SLD click-by-click write-flow) — modal submit wired to `executeDomainOperation` with snapshot update + selection hint sync + regression tests.
- [x] Step II.a (ExecutionEngine Load Flow unification) — added canonical `execute_run_load_flow()` pipeline with deterministic `LoadFlowRunInput`, ResultSet mapping and radial/ring integration tests.
- [x] Step VII.c (SLD adapter hardening) — removed legacy `topologyAdapterV1` module, promoted canonical `topologyAdapter.ts`, and rewired SLD core tests/imports to the canonical adapter entrypoint.

- [x] Step VII.d (SLD geometry closure) — SLD viewer fallback `useAutoLayout` removed, canonical final-geometry tests added (GPZ/trunk/branch/station/ring+NOP + label-collision invariants), and pipeline module status documented in `docs/sld/SLD_PIPELINE_CANONICAL_STATUS.md`.
- [x] Step VII.f (SLD readability declutter) — reduced default label density in trunk/branch/station renderers; technical parameters visible at higher zoom threshold.
- [x] Step VII.g (ABB-inspired visual patterning) — added compartment envelopes, bay framing and ANSI 52/50-51 visual tokens in canonical trunk/branch/station renderers.
- [x] Step VII.h (Główna ścieżka referencyjna SLD) — dodano przełącznik 4 sieci referencyjnych w `#sld-view` z polskimi etykietami i bezpośrednim renderem przez kanoniczny pipeline.
- [x] Step VII.i (Hierarchia informacji i kompozycja przemysłowa) — wdrożono 3 poziomy informacji, sekcje funkcjonalne stacji SN/nN oraz testy jakości hierarchii wizualnej.
- [x] Step VII.j (Skala i kompozycja 7/10) — podniesiono skale dopasowania `#sld-view`, powiększono moduły GPZ/stacji/odejść i zaostrzono testy jakości skali oraz hierarchii.
- [x] Step VII.e (Final SLD visible reference output) — added in-app `#sld-final` reference gallery with 4 rendered canonical geometries (leaf, passthrough, branch, ring+NOP) and UI test coverage.


### 3.0.1 Step VII Completion Criteria (SLD industrial aesthetics + golden render)

Done criteria (implemented):
- Canonical SLD fixture set covers min. 3 scenarios: radial, ring+NOP, PV/BESS.
- Deterministic render manifest contract includes ordered node/edge geometry and industrial style tokens.
- Golden snapshot artifacts for render manifest are CI-guarded (determinism + permutation invariance).
- Regression tests fail on geometry/style drift unless baseline update is explicit.

### 3.0.2 CI Guard Hardening — identyfikatory connection node (current)

Objective: Ujednolicenie detekcji identyfikatorów `connection node` w URL nawigacji i resolverze inspektora bez duplikowania logiki.

Progress:
- [x] Wydzielenie wspólnej funkcji `isConnectionNodeLikeId` (`frontend/src/ui/common/connectionNode.ts`).
- [x] Podpięcie funkcji w `urlState.ts` i `selectionResolver.ts` (jeden kontrakt filtrowania selekcji).
- [x] Testy regresyjne i jednostkowe frontend przechodzą (`connectionNode.test.ts` + istniejące testy unity/resolver).


### 3.0.3 Ścieżka krytyczna E2E — skan i domknięcie bramek (current)

Zakres skanu: `operacja domenowa -> Snapshot -> SLD -> gotowość -> fix actions -> bramka analiz -> wyniki`.

Status ogniw:
- **Kompletne**
  - Operacja domenowa -> odpowiedź `DomainOpResponseV1` z `snapshot/logical_views/readiness/fix_actions` (`frontend/src/ui/topology/snapshotStore.ts`, `frontend/src/ui/topology/domainApi.ts`).
  - Snapshot -> render SLD (SLD odświeżane po update store; brak lokalnego grafu topologii jako źródła prawdy).
  - Gotowość z backendu materializowana w store i panelach (`snapshotStore`, `ReadinessPanel`).
- **Częściowe**
  - Bramka uruchamiania analiz była oparta tylko o aktywny case/mode/status i pomijała `readiness`.
  - Globalny przycisk obliczeń w `App.tsx` był atrapą (TODO, brak realnego uruchomienia run).
- **Rozłączone**
  - UI miało poprawny store wykonania run (`ui/study-cases/runStore.ts`), ale root callback `onCalculate` nie korzystał z niego.
- **Dublowane lokalnym stanem**
  - Historyczne wrappery `useCanCalculate` w `study-cases/store.ts` i `study-cases/modeGating.ts` zostały usunięte; pozostała jedna kanoniczna ścieżka `ui/app-state/store.ts` oparta o `snapshotStore.readiness`.

Wdrożone domknięcia:
- [x] `useCanCalculate()` (app-state) blokuje obliczenia przy `readiness.ready=false` z komunikatem backendowym.
- [x] `App.tsx` uruchamia realny flow `createAndExecuteRun(...)` zamiast TODO/no-op.
- [x] ENM `delete_element` domknięto o kasowanie osieroconych `branch_points` oraz kaskadę `substations/bays` dla skasowanego `bus/transformer` (spójność z kontraktami modeli Pydantic i deterministyczny `deleted_element_ids`).
- [x] Po uruchomieniu run ustawiany jest `activeRunId` i nawigacja do widoku wyników.
- [x] Dokumentacja uruchomienia backendu rozszerzona o powtarzalny bootstrap środowiska (poetry + test importów).
- [x] Usunięcie duplikatów bramki `useCanCalculate` (study-cases/* nie eksportuje już historycznych wrapperów).
- [x] Dodany skrypt `npm run test:e2e:setup` + CI smoke rozszerzone o `critical-run-flow.spec.ts` (detekcja lokalnej przeglądarki + fallback APT + wsparcie `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).
- [x] Browser E2E krytycznej ścieżki przepięte na realny backend (`e2e/critical-run-flow.spec.ts`) — bez `page.route` i bez atrap API.
- [x] Dodano twardy scenariusz E2E real-backend dla elastycznej kolejności (`e2e/sld-editor-real-backend-flex.spec.ts`) oraz domknięto inspektor segmentu (readiness, fix_actions, katalog, write-path ENM_OP).
- [x] Ujednolicono real-backend E2E z kanonicznym katalogiem (`cable-tfk-yakxs-3x120`, `tr-sn-nn-15-04-630kva-dyn11`) oraz usunięto `Date.now()` z kluczy idempotencji w `e2e/critical-run-flow.spec.ts`.

### 3.0.4 SLD industrial readability tuning (completed)

Zakres zakończony:
- [x] Wzmocnienie czytelności toru głównego: większa koperta GPZ, dedykowany lewy gutter informacyjny, szersze moduły pól SN, korekta pozycjonowania etykiet segmentów i węzłów (`TrunkSpineRenderer.tsx`).
- [x] Powiększenie i rebalans odgałęzień: większa ramka pola odgałęźnego, dłuższy przebieg linii odgałęźnej, korekta pozycji etykiet i bąbla zabezpieczeniowego (`BranchRenderer.tsx`).
- [x] Aktualizacja testu deterministycznego `fitToContent` do aktualnego kontraktu geometrii viewportu (`fitToContent.test.ts`).



### 3.0.6a SLD: logical_views jako kanoniczna segmentacja trunk/branch/ring (completed)

Zakres zakończony:
- [x] Rozszerzono `TopologyInputV1` o strukturę `logicalViews` (trunks/branches/rings) oraz mapowanie z `snapshot.logical_views` w `readTopologyFromENM`.
- [x] `TopologyAdapterV2.segmentTopology()` używa jawnych segmentów z `logicalViews` jako pierwszego źródła klasyfikacji (`TRUNK`/`BRANCH`/`SECONDARY_CONNECTOR`) i dopiero przy braku danych wraca do deterministycznego BFS fallback.
- [x] Dodano test regresyjny wymuszający priorytet `logicalViews` nad heurystyką segmentacji w `topologyAdapterV2.test.ts`.
- [x] Zaktualizowano dokument kanoniczny SLD o regułę „logical_views first”.

### 3.0.6b SLD: model właściwy kontraktu topologii wizualnej (completed)

Zakres zakończony:
- [x] Dodano `VisualTopologyContractV1` jako jawny kontrakt wyjściowy adaptera z klasami: GPZ, szyna SN, pole SN, trunk, branch, punkt rozgałęzienia, stacja, ring, NOP.
- [x] `buildVisualGraphFromTopology()` zwraca `visualTopology` obok `graph` i `stationBlockDetails`, więc aktywny pipeline ma formalny model semantyczny (nie tylko klasyfikację krawędzi).
- [x] Rola stacji (`koncowa`/`przelotowa`/`odgalezna`/`sekcyjna`) jest wyprowadzana z embeddingu stacji i materializowana do kontraktu wizualnego.
- [x] Ring/NOP są modelowane jawnie (`RingConnectorVisual`, `NopVisual`) i utrzymują powiązanie z `domainElementId` dla selekcji/inspektora.
- [x] Dodano testy regresyjne kontraktu semantycznego i deterministycznego 100x.


### 3.0.6c SLD: domknięcie kontraktu semantycznego w artefaktach renderu (completed)

Zakres zakończony:
- [x] Wzmocniono `VisualTopologyContractV1`: segmenty trunk/branch/ring/NOP obejmują wyłącznie klasy liniowe SN (bez TR_LINK/BUS_LINK).
- [x] Scenariusze referencyjne (`leaf/pass/branch/ring`) materializują jawne `logicalViews`, aby aktywna ścieżka testowa nie opierała się na fallbacku BFS.
- [x] `SldRenderManifest` otrzymał opcjonalne `visualTopologySummary` zliczające klasy bytów (GPZ/szyny/pola/trunk/branch/stacje/ringi/NOP) dla audytu semantyka↔render.
- [x] Zaktualizowano golden snapshoty manifestu i testy regresyjne.


### 3.0.6d SLD: twarda reguła geometrii GPZ (completed)

Zakres zakończony:
- [x] Wymuszono globalnie kanon orientacji SN/GPZ w silniku topologicznym: szyna GPZ pozioma, odejścia pionowo w dół (także przy żądaniu `left-right`).
- [x] Dodano regresyjny test w `layoutPipeline.test.ts` potwierdzający poziomą szynę GPZ i pionowy start odejść trunk.
- [x] Zaktualizowano test orientacji `topologicalLayout.test.ts` do kanonicznego mapowania `left-right -> top-down` dla SN.

### 3.0.7 SLD: wydzielenie LayoutEngine V2 + routing A* (completed)

Zakres zakończony:
- [x] Dodano nowy moduł `frontend/src/ui/sld/core/layoutEngine.ts` (strategie `legacy/greedy/force-directed`, routing `orthogonal/diagonal`, A* obstacle routing, auto-reflow kolizji, plan warstw i etykiet).
- [x] `layoutPipeline.ts` refactor: poprzedni pipeline dostępny jako `computeLegacyLayout()`, a publiczny `computeLayout()` deleguje do `LayoutEngine` z domyślną strategią `legacy` (kompatybilność wsteczna).
- [x] Rozszerzono API eksportów core (`index.ts`) o `LayoutEngine`, typy opcji i helper `createLayoutEngine`.
- [x] Dodano testy jednostkowe `layoutEngine.test.ts` (delegacja legacy, greedy spacing, deterministyczny force-directed, orthogonal/diagonal routing).
- [x] Dodano dokumentację modułu: `docs/sld/SLD_LAYOUT_ENGINE_REFACTOR_V2.md`.

### 3.0.8 SLD: domknięcie kontraktów semantyka→layout (completed)

Zakres zakończony:
- [x] Dodano kanoniczny kontrakt semantyczny `SldSemanticGraphV1` (normalizacja stationKind/generatorKind, jawne kontenery, brak geometrii portów).
- [x] Dodano kanoniczny kontrakt wejścia layoutu `LayoutInputGraphV1` (symbolProfile/portGeometry i constraints tylko w warstwie layoutu).
- [x] `computeLayout()` przepięto na pipeline: `VisualGraph(legacy) -> SldSemanticGraphV1 -> LayoutInputGraphV1 -> LayoutEngine`.
- [x] `LayoutEngine` konsumuje `LayoutInputGraphV1`; `computeLegacyLayout()` utrzymane jako cienka warstwa zgodności przez bridge `LayoutInputGraphV1 -> VisualGraphV1`.
- [x] `VisualGraphV1` zdegradowano do statusu legacy (usunięto fałszywy komentarz o jedynym źródle prawdy).
- [x] Dodano testy kontraktu semantycznego i transformacji semantyka→layout (deterministyczność 100x).
- [x] Uzupełniono dokumentację: `SLD_SEMANTIC_MODEL_CANONICAL_V1.md` + `SLD_CONTRACT_FLOW_V1.md`.

### 3.0.9 Symphony orchestration baseline (completed)

Zakres zakończony:
- [x] Dodano nowy moduł `application/symphony` z kanonicznymi komponentami: loader `WORKFLOW.md`, typed config, modele domenowe, manager workspace, renderer promptu i orchestrator poll/retry/reconcile.
- [x] Dodano kontrakty integracyjne (`IssueTrackerClient`, `AgentRunner`) dla adaptera tracker/runner zgodnie z granicami specyfikacji Symphony.
- [x] Dodano testy jednostkowe pokrywające parse workflow/config, bezpieczeństwo workspace i logikę dispatch/retry/blockers/concurrency.

### 3.0.10 Audyt SLD + Designer Flow + Konfiguratory pól SN (2026-05-19, completed)

Branch: `claude/audit-sld-designer-U4QYo`.

Zakres zakończony:
- [x] Trzy równoległe audyty Explore (SLD renderer / Designer flow / Catalog + plans). Synteza w `docs/audit/AUDYT_SLD_DESIGNER_2026-05-19.md`.
- [x] Potwierdzono w aktywnym kodzie:
  - `GpzCanonicalRenderer` (Phase R2) z guardem `no_direct_110kv_tr_tie_without_switchgear` — TR 110/SN nie zwiera się przez szynę, kolumna aparatów (DS+CB+CT+ES) wymagana. Test: `frontend/src/ui/sld/v2/renderer/__tests__/GpzCanonicalRenderer.noDirectTie.test.tsx`.
  - `SldCommandService.SLD_MENU_REGISTRY` ma 10 typów elementów × 3–11 akcji per typ — menu kontekstowe jest w pełni domenowe.
  - K30 (do 2026-05-16) zamknął 9.4/10 brutalny audyt SLD; 1916 testów SLD v2 zielone.
- [x] Dodano regresyjny test kontraktu „naturalny flow projektanta": `frontend/src/ui/network-build/__tests__/designerFlowContract.test.ts` (21 testów, all green) — formalizuje 8 kroków flow jako executable specification: Wstaw GPZ → Dodaj sekcję → Dodaj pole SN → Wyprowadź ciąg → Zakończ stacją → Kontynuuj → Rozgałęzienie → Dodaj DER.
- [x] Walidacja: `npm run type-check` zielone; `npm run lint` zielone; broader vitest suite (context-menu + sld/v2 + network-build) 947/947 zielone (+21 nowe); `no_codenames_guard`, `forbidden_ui_terms_guard`, `docs_guard`, `sld_determinism_guards` — all PASS.
- [x] **Pakiet A (wymaganie #1 - naturalny flow)**: empty-state CTA „Wstaw Główny Punkt Zasilający" w `SldWorkspaceContainer.tsx` — pierwszy krok flow jest teraz jawny (przycisk uruchamia `add_grid_source_sn`). 3 nowe testy.
- [x] **Pakiet B (wymaganie #2 - SCADA)**: `symbolContract.test.ts` (65 testów) — kontrakt 54 SVG ↔ ports.json, ring_busbar i double_busbar mają 4 porty, NOWE symbole wymagają currentColor.
- [x] **Pakiet C (wymaganie #1 contract)**: `designerFlowContract.test.ts` (21 testów) — kontrakt 8 kroków flow.
- [x] **Pakiet D (wymaganie #2 SCADA F1)**: `CanonicalGpzBusbarTopology` w `GpzCanonicalRenderer` — wdrożone w aktywnym rendererze 3 topologie: `single`/`double`/`ring`. Dasharray "6 3" dla double S2, ring closure po prawej dla ring. 5 nowych testów regresyjnych.
- [x] **Pakiet E (F1 wave 2)**: migracja `bess.svg`, `pv.svg`, `fw.svg` z `#000000` → `currentColor`. Lista `KNOWN_LEGACY_HARDCODED_COLORS` zmniejszona z 24 → 21.
- [x] **Pakiet F (E2E naturalny flow)**: `e2e/designer-flow-empty-state-cta.spec.ts` — Playwright spec z mock backend, weryfikuje pełny flow Dashboard → projekt → SLD workspace → empty state CTA primary/secondary widoczne i etykietowane po polsku.
- [x] **AUDYT POPRAWKA**: prior audit B agent **błędnie raportował** brak 3-stage vendor stepper. W rzeczywistości `SwitchgearTemplateStepper.tsx` z 4 krokami (Producent → Rodzina/Typoszereg → Szablon → Preview) **JUŻ ISTNIEJE** wraz z `SwitchgearFamilyPicker` i backend API `/api/catalog/switchgear-families`. Wymaganie #5 satysfakcjonowane.
- [x] Walidacja: type-check ✓, lint ✓, wszystkie guardy CI ✓ (no_codenames, forbidden_ui_terms, sld_determinism, docs_guard, repo_hygiene).

Pozostałe duże luki (zachowane jako P0/P1 per § 4.0):
- F2 port-based routing main impl (P0.3 ~16%)
- F3 LOD + refactor monolitów (P0.6 TODO)
- F4 export SVG/PDF deep integration (P0.7 ~75%)
- F5 visual regression baselines (P0.10 ~38%)
- Vendor template 3-stage stepper (producent → typoszereg → pole) — propozycja w `AUDYT_SLD_DESIGNER_2026-05-19.md` §6.1
- Explicit „Wstaw GPZ" first-step CTA dla pustego projektu — propozycja w §6.1
- Backend POST endpoint dla DER config save (K30-NEXT-1)
- E2E `critical-der-config.spec.ts` (K30-NEXT-2)
- Walidacja formularza DER (react-hook-form + zod) (K30-NEXT-3) — od karty UI-02b JEDEN-INSPEKTOR
  (2026-10-21) formularz żyje w prawym inspektorze (`ui/network-build/inspektor-elementu/FormularzSzkicuDer.tsx`),
  szuflada `SldDetailDrawer` skasowana

Rekomendacja dla następnej sesji: krótka, low-risk, high-impact 5-pakiet (§6.1) ~14 OD.


### 3.0.5 Hotfix CI TypeScript — referenceTopologies (completed)

Zakres zakończony:
- [x] Usunięto mutacje `push(...)` na kolekcjach `readonly` w `referenceTopologies.ts` (budowa scenariuszy `branch` i `ring` przez niemutowalne złożenie tablic).
- [x] Usunięto odwołanie do legacy pola `stationBlockBuildResult`; scenariusze referencyjne korzystają z kanonicznego pola `stationBlockDetails` z `AdapterResultV1`.
- [x] Potwierdzono zielone: `npm run type-check`, zestaw testów SLD kontrakt/determinizm oraz real-backend E2E krytycznej ścieżki.

### 3.1 Docs Sync to Spec Canon (current)

Objective: Synchronize all repo documentation entrypoints with `docs/spec/` (18 chapters) as the source of truth.

Tasks:
- [x] Full repo scan (RECON)
- [x] Document chaos detection (20 inconsistencies identified)
- [x] Rewrite AGENTS.md (clean governance)
- [x] Rewrite SYSTEM_SPEC.md (executive overview + navigation to 18 spec chapters)
- [x] Rewrite ARCHITECTURE.md (spec chapter references in every section)
- [x] Rewrite PLANS.md (this file)
- [x] Sync README.md (root + mv-design-pro) — removed prohibited terms, fixed paths, added spec links
- [x] Sync docs/INDEX.md — added spec chapter table, fixed broken links
- [x] Add docs_guard.py CI guard (PCC + broken link check)
- [x] Clean remaining duplicate docs in docs/ outside docs/spec/
- [x] Mark/move deprecated notes and operational files
- [x] Add reusable Polish master prompt for full-repo architecture audit (`docs/prompts/FULL_REPO_AUDIT_PROMPT_PL.md`)

### 3.2 SLD/CAD Canonical Rebuild — Recon + Docs Cleanup + Deterministic ENM_OP keys (current)

Objective: Domknięcie fazy RECON/AUDYT dokumentacji oraz usunięcie niedeterministycznych fallbacków `Date.now()` z kluczy idempotencji ENM_OP w ścieżce SLD.

Progress:
- [x] Full RECON obszaru SLD/CAD/UI/domena/layout/routing/inspector + klasyfikacja dokumentów.
- [x] Dodane dokumenty kanoniczne etapu:
  - `docs/AUDYT_DOKUMENTACJI_I_PLANOW_REPO.md`
  - `docs/MAPA_MIGRACJI_DOKUMENTOW_I_PLANOW.md`
  - `docs/INDEX_KANONICZNY.md`
- [x] Usunięte równoległe roadmapy (`docs/ROADMAP.md`, `docs/audit/ROADMAP.md`) na rzecz jednego planu `PLANS.md`.
- [x] Wzmocniono deterministyczność ENM_OP:
  - `frontend/src/ui/sld/domainOpsClient.ts` używa deterministycznego `buildDeterministicIdempotencyKey(...)`.
  - `frontend/src/ui/sld/useEnmStore.ts` korzysta z tego samego generatora.
- [x] Dodane testy regresyjne klucza idempotencji (`frontend/src/ui/sld/__tests__/domainOpsClient.test.ts`).
- [x] Korekta mapowania narzędzia `delete_element` w palecie SLD: `canonicalOp` ustawione na `delete_element` + test regresyjny kontrolera interakcji.

---

### 3.3 SLD CAD/SCADA Rebuild — wszystkie 17 PR-ów dostarczone ✅

**Branch:** `claude/sld-architecture-redesign-ufa8Q`
**Plan main:** `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md` (17 PR-ów)

**Dostarczone w bieżącej sesji (9 commitów):**

| PR | Commit | Zakres |
|---|---|---|
| **PR-0** | `ec395ae` | audit + 8 docs kanon + formatPolishValue + zakaz 0.00 + no-zero-spam guard |
| **PR-1** | `25ef103` | migracja `(value ?? 0).toFixed` antypatternu (12 violations w `WizardPage.tsx`); audit doc Stacja+DER; rozszerzony no-zero-spam guard (4 → 17 katalogów UI) |
| **PR-2** | `165d577` | UI terminology guard rebrief: 132 migracje stringów UI + 12 zakazanych tokenów (migawka/uruchomienie/przypadek/proof/run/snapshot/feeder/branch/case/wizard/fallback/legacy) z polskimi zamiennikami |
| **PR-3** | `5e6b880` | ENM Port + ConnectionNode + LineRun + CableJoint + 10 BayTemplate + 9 StationTemplate + multi-voltage nN + automigracja v_ports_001 (idempotentna, deterministyczna) |
| **PR-4** | `fc37351` | SLD v2 PortResolver: 15 PortKind contract z parity test ENM ↔ frontend, classifyStationTopology, validatePortVoltages, canConnectPorts (14 reguł), isPortKindCompatibleWithBayRole |
| **PR-5 (cz. I)** | `60fe605` | v2 fundamenty: theme tokens (22 kolory dark SCADA), geometry/slot.ts (slot allocator hierarchiczny), geometry/routing.ts (ortogonalne L-shape, brak A*), domain/HierarchyTree.ts (adapter ENM), builder/BuildSequence.ts (8 kanonicznych komend), builder/HierarchicalLayout.ts (deterministic + przyrostowy, FNV-1a hash), viewport/ViewportController.ts (kursor-anchored zoom), lod/LodPolicy.ts (5 LOD + 13 warstw) — 81 testów green |
| **PR-5 (cz. II)** | `4f1a8a0` | v2 renderery: 7 dedykowanych rendererów per typ (Gpz, Section, Bay, Device, CableRun, StationOnRun, Der + Connection), SldCanvasV2 composition root z pan/zoom/auto-fit/LOD inference/layer toggle — 24 testy renderers, 105 testów total v2 |
| **PR-6** | `d8614db` | Wewnętrzny SLD stacji: backend topology_classifier + internal_layout (InternalSldDTO, multi-voltage nN, 4 typy topologiczne wnioskowane z portów), frontend StationInternalView z szyną SN + polami + transformatorami + rozdzielnicami nN — 19 testów (14 backend + 5 frontend) |
| **PR-7** | `a769f4d` | InspectorTabs v2 (11 zakładek: Podstawowe/SLD/Topologia/Aparatura/Dane elektryczne/Zabezpieczenia/Pomiary/Obliczenia/Braki danych/Raport/Techniczne) + StickyHeader (status kompletności/zasilania/obliczeń + quick actions) + Breadcrumb dwukierunkowy — 23 testy |

**Wszystkie PR-y dostarczone:**

| PR | Commit | Zakres |
|---|---|---|
| **PR-13** | `22a8ad6` | BuildSidebar (4 sekcje: Nawigator/Budowa/Warstwy/Gotowość) + SldCommandService (10 menu kontekstowych + COMMAND_FEEDBACK_PL) + 8 brakujących symboli SVG (load_switch, cable_head_triangle, pole, nop, alarm_marker, missing_data_marker, zksn, cable_joint) |
| **PR-12** | `d8b62b4` | CalculationReadinessService (10 typów obliczeń) + ValidationProblemService (4 źródła problemów) + ReportReadinessAdapter (zakaz fabrykacji raportów) |
| **PR-8a** | `713b58a` | StationConfigurator z 10 kart-zakładkami (Podstawowe/Topologia/RozdSN/Pola/Transformator-multi-voltage/RozdNN/Odbiory/Zabezpieczenia/Pomiary/Gotowość) |
| **PR-8b** | `713b58a` | BayConfigurator z 8 sekcjami + 6 reguł walidacji (R1-R6 briefa §9) |
| **PR-9/10/11** | `51598e2` | DerConfigurator (PV/BESS/FW) + 5 profili NC RfG (PSE/Energa/Tauron/Enea/PGE) + 12 turbin wiatrowych w katalogu |
| **PR-14** | `39815d1` | 15 visual fixtures × 4 LOD = 119 testów (GPZ-12-bays, terrain-network, 4 typy stacji, internal-SLD-industrial, PV/BESS w SN/nN, FW, missing-data, no-calc, empty-project) |
| **PR-15** | `b9bf227` | Stability RMS contract: 19 DynamicModelKind + StabilitySolverInput/Result (FROZEN) + StabilitySolverAdapter z validate_input + run=no_module |
| **PR-16** | `b9bf227` | FRT/HVRT RMS contract + NC RfG compliance checker (static T3-T15 + dynamic T1/T2/T8/T10/T11/T16/T17/T18 = no_module) z 21 testami |

Plan obejmuje 12 kolejnych PR-ów z explicit scope-em w pliku planu:

- **PR-5** (~30 osobodni × 2 osoby = ~60 OD): Konstruktywny hierarchiczny builder, wygaszenie ~12 996 linii (engine/sld-layout phase 1-5 + Sugiyama + A* + ELK + 7 starych rendererów + sldCanonicalStyle + IndustrialAesthetics), 7 nowych dedykowanych rendererów, Scenariusze D/E/F.
- **PR-6** (~16 OD): Wewnętrzny SLD stacji + 4 typy topologiczne + tryb mieszany inline expansion.
- **PR-7** (~8 OD): InspectorTabs (11 zakładek) + sticky header + breadcrumb dwukierunkowy + sync paneli + command feedback toasty.
- **PR-8a/8b** (~15 OD): Konfigurator stacji 10 kart + Konfigurator pola SN 8 sekcji.
- **PR-9/10/11** (~20 OD): Konfiguratory PV / BESS / FW (po 7 / 7 / 6 kart) + 5 profili NC RfG + 12 turbin wiatrowych w katalogu.
- **PR-12** (~12 OD): CalculationReadinessService (9 typów obliczeń) + ValidationProblemService + ReportReadinessAdapter.
- **PR-13** (~7 OD): BuildSidebar (4 sekcje) + SldCommandService + 8 brakujących symboli SVG.
- **PR-14** (~8 OD): LOD policy v2 + 13 warstw + 15 visual fixtures × 4 LOD = 60 snapshotów + wygaszenie starego SLD.
- **PR-15** (~42 OD): Solver stabilności dynamicznej RMS — Newton-Raphson dynamic + modele synchronous/induction/inverter/AVR/governor/PSS/wind/PV/BESS.
- **PR-16** (~18 OD): Solver FRT/HVRT RMS time-domain + NC RfG compliance testbench (18 testów).

**Status egzekucji:**

PR-0..PR-4 stanowią **fundament merge-ready** rebuild-u: wszystkie inwarianty kanoniczne (zakaz 0.00, polish UI, 12 zakazanych tokenów wyeliminowanych), domena ENM rozszerzona o porty/connection nodes/line runs/cable joints + automigracja, frontend port contract + walidatory. Pozostałe PR-y to rdzeń rebuild-u i wymagają znacznego nakładu pracy (~170 osobodni / ~3-4 miesiące zespołu 2-3 osób). Plan dokumentuje pełne scope każdego z PR-ów (`/root/.claude/plans/...md`) i jest przygotowany do kontynuacji w kolejnych sesjach.

**Walidacja kumulatywna PR-0..PR-7:**

- Backend: 4421+ testów green (zero regresji), ENM 458 + 46 PR-3 + 14 PR-6 = 518 PR-relevant testów green.
- Frontend: 491+ testów green (zero regresji), nowe 30 PR-0 + 29 PR-4 + 81 PR-5 (cz.I) + 24 PR-5 (cz.II) + 5 PR-6 + 23 PR-7 = 192 PR-relevant testów green.
- Guards: pcc_zero / no_codenames / ui_terminology (132 violations zlikwidowane) / docs / sld_determinism — wszystkie zielone.
- Type-check + lint: green.

Następne PR-y (PR-5..PR-16) — patrz pełen plan `/root/.claude/plans/jeste-uruchomionym-jednocze-nie-zespo-em-peaceful-snowglobe.md`.

---

### 3.4 SLD v3 — przebudowa CAD/SCADA wg SLD_CAD_SPEC_V3 (2026-07, dyrektywy D1+D2 WDROŻONE)

**Branch:** `claude/sld-schema-cad-scada-rqvz73` · **Plan:** `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` · **Spec (wiążąca):** `docs/sld/SLD_CAD_SPEC_V3.md`

Program F1–F11 zamknięty (2026-07-16). Zakres wdrożony:
- **Pipeline v3** (measure→bands→columns→route→label, GRID=8, LOD 0/1/2, determinizm) + kanwa
  `SldCanvasV3` z kamerą (pan/zoom/pinch, histereza LOD, fit per LOD — k4 rozwiązane F8a).
- **Dyrektywa D1** (oznaczenie zabezpieczeń jak na schemacie referencyjnym ABB): przekaźnik-okrąg
  z kodami funkcji, wyłącznik „52"-kwadrat, tor wyzwalania (dash 4-2), linia pomiarowa CT→przekaźnik
  (dash 2-2), miernik „M" z legendą dyskryminującą — spec §17/§20, GPZ objęty od F11.1.
- **Dyrektywa D2** (9 ustaleń inżynierskich): ciągły tor z opisanymi zakończeniami (§18.6), pola
  funkcjonalnie bez WE/WY (§19.4), Q per aparat (§19.1), typ stacji z topologii (§19.5), symbole
  IEC ze stanem + szyny „Sekcja N · V kV" (§19.2/§19.3), uziemnik LATERALNIE z blokadą w legendzie
  (§18.1), CT opisane/powiązane + VT równolegle (§18.2/§18.3), rozdzielone linie pomiar/TRIP +
  walidacja topologiczna 67N/87T/51N (§20.1/§20.2), adnotacje nie zasłaniają toru (§20.3).
- **Uczciwość danych**: naprawy fabrykacji u źródła (podwójna negacja znaku mocy w canonical PF —
  §3.-1 wyżej; heurystyka zero_sequence; stała operating_mode → realny kanał `Generator.meta`,
  F11.3 backend+frontend §13.3); brak danych = brak rysunku + stopNote/missingData.
- **Wyrocznie jako bramki CI**: `npm run accept:sld-v3` — 30+ sond per LOD, każda z testem
  negatywnym; macierz finalna: `docs/sld/SLD_V3_ACCEPTANCE.md` §5. Baseline'y §15.1:
  12120/41000/54104 (nie-rosnące), symbolWire=0 (twardy).
- **Parytet F8c (F11.4)**: drawer szczegółów, menu kontekstowe, paleta DER, konsolidacja
  useMeasuredSize — dostarczone na v3; **usunięcie renderu v2 POZOSTAJE BRAMKOWANE** trzema
  pozycjami dla właściciela (wykonawca akcji menu; geometria ręczna CAD — decyzja spec-first;
  Conscious Split — produkcyjnie nieosiągalny, decyzja produktowa) — szczegóły: wpis F11.4 planu.
- **Koordynacja z wątkiem UI**: kontrakt `docs/sld/SLD_PROTECTION_MARKING_COORDINATION_2026-07.md`;
  kolizja identyfikatorów V12K-026 zarejestrowana (V12K-032, propozycja renumeracji przy scaleniu).

Bramki końcowe: frontend 551 plików / 7790 testów PASS; backend 5720 PASS (1 pre-existing fail
`test_no_todo_fixme_in_catalog_first_critical_paths`, poza zakresem); accept ALL PASS; guardy
(sld_determinism/arch/no_codenames/dead_click/overlay_no_physics/forbidden_ui_terms/docs) PASS.
Rendery odbioru: `docs/sld/renders/v3/` (odświeżone 2026-07-16).

---

### 3.6 P0 implementation sprint (2026-05-13)

Zrealizowane w jednym dniu (**20 commitów po cleanupie** — sprint kontynuowany):

- [x] **P0.2 Protection SI-100** — `solver_input/eligibility.py:169` stub usunięty, real
  eligibility check (BREAKER/RECLOSER required). Krok 11 flow E2E odblokowany.
  Backend tests: 121/121 PASS (commit `20b432e`)
- [x] **P0.1 SLD F1** — biblioteka symboli IEC 60617:
  - Sprint 1 (KRYTYCZNY): ring_busbar, double_busbar, busbar_section_marker,
    busbar_coupler, cb_drawout, auto_recloser, switch_3pos (commits `d553ae7`, `3874719`)
  - Sprint 2: lightning_rod, grounding_resistor, grounding_reactor, synchrocheck,
    surge_arrester_10ka (commit `544834c`)
  - Sprint 3: autotransformer, transformer_tap_changer, utility_source,
    pv_inverter_nc_rfg, wind_turbine_full_converter (commit `544834c`)
  - Sprint 4: 8 ports.json entries dla legacy SVG → 100% SVG↔ports sync (commit `544834c`)
  - **Sprint EoD (P0.1 +2 symbole):** pq_meter, capacitor_bank (commit `9afb19e`)
  - Status: **50 / 62 = 80.6% pokrycia IEC 60617** (≥50 GOAL HIT, target ≥ 90%)
- [x] **P0.8 DOCX export** — `proof_inspector/exporters.py` `export_docx()` + `export_to_docx()`
  convenience. V12K-007 light_technical. 45/45 inspector tests PASS (commit `ddab90f`)
- [x] **P0.9 (operator selector + SC toggle + backend integration)** —
  `StudyCaseConfig.operator_profile_id` (default ENEA) + `sc_input_mode` toggle
  simplified/advanced. Frontend UI + backend `SimplifiedGridSource` propagacja do
  `ShortCircuitPayload.simplified_grid_source`. 11/11 new backend integration tests
  (commits `49909d8`, `087b54c`, `0a7fa8c`)
- [x] **P0.4 VDROP + Earthing proof packs** — standalone packs wrappers nad
  ProofGenerator. `packs/vdrop.py` + `packs/earthing_ground_fault_sn.py`. 12 testów,
  279/279 proof_engine PASS. 8 pakietów dowodów łącznie (commit `beac74d`)
- [x] **P0.10 partial (Visual regression scaffold)** — Playwright config
  (`toHaveScreenshot` threshold 0.5% per AC-11) + `frontend/e2e/visual/
  sld_industrial_visual.spec.ts` + `.github/workflows/sld-visual-regression.yml` +
  kontrakt `docs/sld/SLD_VISUAL_REGRESSION_CONTRACT.md` (commit `8e911d2`)
- [x] **P0.3 partial (port_binding_guard extension)** — `scripts/port_binding_guard.py`
  dodano `_validate_ports_manifest()`. 0 naruszeń przy 50 symbolach (commit `3b7637c`)
- [x] **P0.7 partial — SLD F4 fundamenty 75%** (kontynuacja sprint):
  - LIGHT_TECHNICAL_COLORS tokens + 8 testów (commit `95f8f91`)
  - ThemeProvider/useTheme/useThemeColors + 10 testów (commit `64de787`)
  - exportSvg.ts foundation (currentColor substitution, idempotency,
    deterministyczny filename) + 14 testów (commit `64de787`)
  - exportPdf.ts spec foundation (PDF spec object, ISO 216 sizes, deterministic
    metadata) + 20 testów (commit `4057c5a`)
  - Browser download utility + SldExportButton React component + 12 testów
    (commit `9c20fd1`)
  - FaultContributionArrow SC overlay primitive + 16 testów (commit `7e89f83`)
  - PowerFlowArrow + ProtectionZoneMarker overlay primitives + 30 testów
    (commit `fe5c5ba`)

**Łącznie nowe testy w sprint:** ~270 testów. Łącznie pełna suita:
- backend: 279/279 proof_engine + 121/121 protection + 73/73 study_case +
  11/11 simplified_sc + 113/113 wider regression = **~750+ PASS**
- frontend: 1202/1202 SLD v2 + 130/130 sld-overlay + 75/75 study-cases +
  18/18 theme tests = **~1450+ PASS**

**Status P0 (10 pozycji) po 20 commitach:**

| # | Zakres | Status |
|---|--------|--------|
| P0.1 | SLD F1 biblioteka symboli (10 OD) | ✅ ~8 OD (80.6% pokrycie, GOAL ≥50 HIT, F1 sprints 1-4 zamknięte) |
| P0.2 | Protection SI-100 (5 OD) | ✅ DONE |
| P0.3 | SLD F2 LayoutEngine port-based (25 OD) | ⚙️ ~2 OD (guard extension) — main implementation TODO |
| P0.4 | VDROP + Earthing packs (10 OD) | ✅ DONE |
| P0.5 | Fault-loop NN solver (15 OD) | ⏳ TODO |
| P0.6 | SLD F3 LOD + refactor monolith (15 OD) | ⏳ TODO (LodPolicy istnieje, integracja w monolicie TODO) |
| P0.7 | SLD F4 Theme + overlay + eksport (20 OD) | ⚙️ ~15 OD / 75% (3 overlay primitives + theme + 2 exporters + UI button — pozostaje deep integration) |
| P0.8 | DOCX export (5 OD) | ✅ DONE |
| P0.9 | Wizard improvements (7 OD) | ✅ ~6 OD (operator+toggle+backend integration); split-preview TODO |
| P0.10 | SLD F5 Visual regression CI (8 OD) | ⚙️ ~3 OD scaffolding; baseline + LFS TODO |

**Postęp:** ~**46 OD z 120 OD** goal P0 (**~38%**). 4 pełne P0 zamknięte, 4 znacząco
adresowane (>50% postępu), 2 czekają (P0.5 fault-loop NN, P0.6 SLD F3 — duże
architektoniczne).

### 3.7 P0 implementation sprint kontynuacja (2026-05-13 night + 14)

Dalsze 9 commitów po raporcie § 3.6:

- [x] **P0.7 ThemeContext + exportSvg** (commit `64de787`) — SldThemeProvider hooks +
  exportSvg vector-clean (24 testów)
- [x] **P0.9 backend integration** (commit `0a7fa8c`) — sc_simplified_grid_source w
  ShortCircuitPayload (11 testów)
- [x] **P0.7 exportPdf spec** (commit `4057c5a`) — PDF spec foundation z ISO 216
  sizes (20 testów)
- [x] **P0.7 UI integration** (commit `9c20fd1`) — Browser download utility +
  SldExportButton React component (12 testów)
- [x] **P0.7 SC overlay primitive** (commit `7e89f83`) — FaultContributionArrow (16 testów)
- [x] **P0.7 PF + Protection primitives** (commit `fe5c5ba`) — PowerFlowArrow + ProtectionZoneMarker (30 testów)
- [x] **P0.1 SLD F1 final** (commit `9afb19e`, `98751ce`) — 50→54 symbole (94.7% IEC parity) ✅ HIT 90% target
- [x] **P0.5 fault-loop NN MVP** (commit `9fe6153`) — FaultLoopSolver IEC 60364-4-41,
  21 testów (3 klasy)
- [x] **P0.3 F2 portBasedLayout helpers** (commit `74e78db`) — Pure functions +
  buildEdgeRouteFromPorts (37 testów)
- [x] **CR-fix specialist audit** (commit `877ad80`) — 3 KRYTYCZNE + 4 ulepszeń + 5
  test gaps (gridStep=0 NaN, Z_MIN_OHM, SVG namespace, ProtectionZone neg dims,
  exportSvg precise regex, fault_loop docstring, splitPreview tests)
- [x] **PowerFlowArrow zero-flow** (commit `0d1d79b`) — CR-fix #2 zero edge case
- [x] **P0.5 step 3 builder** (commit `8e9c74e`) — FaultLoopInputBuilder scaffolding (9 testów)
- [x] **P0.9 splitLinePreview** (commit `8925330`) — Split-with-preview pure functions (31 testów)

**Łączna liczba testów dodanych w sprincie:** ~370+ (poprzednie 270 + 100 nowych)
**Łącznie testy systemu:** Backend ~800+ PASS, Frontend ~1700+ PASS

**Status P0 po 29 commitach:**

| # | Status | OD | Komentarz |
|---|--------|----|-----------|
| P0.1 | ✅ DONE | 10/10 | 94.7% IEC parity (54/57), GOAL ≥50 + ≥90% HIT |
| P0.2 | ✅ DONE | 5/5 | Protection SI-100 stub removed |
| P0.3 | ⚙️ ~16% | 4/25 | port_binding_guard ext + portBasedLayout helpers — main impl TODO |
| P0.4 | ✅ DONE | 10/10 | VDROP + Earthing packs |
| P0.5 | ⚙️ ~75% | 11/15 | Solver MVP + InputBuilder scaffolding done; service.py + FE TODO |
| P0.6 | ⏳ TODO | 0/15 | LOD wiring w monolicie — duże architektoniczne |
| P0.7 | ⚙️ ~75% | 15/20 | Theme + 2 exporters + UI button + 3 overlay primitives |
| P0.8 | ✅ DONE | 5/5 | DOCX export |
| P0.9 | ✅ DONE | 7/7 | Operator + SC toggle + backend integration + split-preview foundation |
| P0.10 | ⚙️ ~38% | 3/8 | Visual regression scaffolding (baselines TODO) |

**Postęp:** ~**60 OD z 120 OD goal P0 (~50%)**. 5 P0 pełne zamknięte
(P0.1, P0.2, P0.4, P0.8, P0.9), 3 znacząco adresowane (P0.5 ~75%, P0.7 ~75%,
P0.3 ~16%), 1 częściowo (P0.10 ~38%), 1 czeka (P0.6 deep refactor).

### 3.5 Docs cleanup + canon resolution (2026-05-13)

Zakres zakończony w tym etapie:
- [x] Rozstrzygnięcie konfliktu V12K-001 (hierarchia kanonu): **V12.xx wygrywa**, `docs/spec/` formalnie ARCHIWALNY.
- [x] Wpisy V12K-011..V12K-015 w `docs/v12xx/REJESTR_KONFLIKTOW.md` (canon hierarchy, archiwum audytów, SLD industrial rework, protection SI-100, brakujące proof packs).
- [x] Aktualizacja `CLAUDE.md` (v hierarchii dokumentów → V12.xx canon na priorytecie 1).
- [x] Aktualizacja `SYSTEM_SPEC.md` v4.1 (`docs/spec/` oznaczone ARCHIVAL, dodane pointery do V12.xx canon i nowych planów).
- [x] Aktualizacja `PLANS.md` (ten plik, v5.1) — usunięte twierdzenie że `docs/spec/` to source of truth.
- [x] Stworzenie `docs/audit/DOC_INVENTORY_2026-05.md` (415 plików, klasyfikacja, konflikty, duplikaty).
- [x] Stworzenie `docs/audit/AUDYT_BRAKI_2026-05.md` (audyt 8 obszarów: A–H).
- [x] Stworzenie `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` (flow inżyniera end-to-end + roadmap).
- [x] Stworzenie `docs/sld/SLD_INDUSTRIAL_SPEC_v1.md` (specyfikacja SLD klasy przemysłowej).
- [x] Stworzenie `docs/plan/PLAN_SLD_REWORK.md` (fazy F1–F5 reworka SLD).
- [x] Fizyczna archiwizacja zamkniętych audytów + planów + snapshotów E2E + raportów weryfikacji do `docs/audit/archive/2026-05/`.

---

## 4. Next Priorities (HISTORYCZNE, 2026-05-13 — pozycje TODO rozstrzygnięte w części A §D.7; aktualna kolejka: część A §C)

### 4.0 P0 (po cleanupie 2026-05-13)

| Item | Description | Status |
|------|-------------|--------|
| SLD rework F1 (port-based routing + symbol library IEC 60617) | Główna przyczyna wyglądu „atrapy". Patrz `docs/plan/PLAN_SLD_REWORK.md`. Zakres F1–F5 zastąpiony i wykonany programem „SCHEMAT-10" fazy S1–S8 (`docs/plan/PLAN_SLD_REWORK.md` §0; domknięcie: V12K-142 karta S5-FINAL, V12K-146 karta S7.6-KOMPRESJA, V12K-141 karta S8-LOD — „Program SCHEMAT-10: fazy S1-S8 + GS-1..GS-5 + P1 recenzji DOSTARCZONE"). | DONE (S1–S8) |
| Protection SI-100 stub removal | Bramka E2E dla zabezpieczeń. Patrz `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` § 3.2. | TODO |
| VDROP + Earthing proof packs | Bramki audyt2 (dobór przewodów + grounding). | TODO |
| Fault-loop NN solver | Stacje SN/NN bez tego nie mają pełnej analizy NN. | TODO |
| DOCX export dla proof engine | Wymaganie raportów PL. | TODO |

### 4.1 HIGH Priority

| Item | Description | Status |
|------|-------------|--------|
| Phase 6: Wizard/SLD Unity | Formal verification that Wizard and SLD operate on same model | DONE |
| NetworkValidator Extension | Full industrial-grade validation rules (13 rules, 29 tests) | DONE |
| Bus Terminology Completion | Finish Node -> Bus rename in all code paths | DONE |
| SC Asymmetrical Proofs | 1F, 2F, 2F-Z fault proof packs (IEC 60909) | DONE |
| Normative Completion Pack (IEC 60909 §4.1) | Domknięcie mapowania norma→dowód + golden proofs + CI gates | DONE |

### 4.2 MEDIUM Priority

| Item | Description | Status |
|------|-------------|--------|
| Regulation Q(U) Proofs | Reactive power regulation proof pack | DONE |
| PR-27: SC ↔ Protection Bridge | Current source resolution (TEST_POINTS / SC_RESULT), FixActions | DONE |
| PR-28: Coordination v1 | Selectivity margins (explicit pairs, numbers only) | DONE |
| PR-29: Topology Links | Unified relay↔CB↔target_ref IDs (optional) | DONE |
| PR-30: Protection SLD Overlay Pro | Token-only overlay (t51, margins) | DONE |
| PR-31: Protection Report Model | Export-ready data model (PDF/DOCX) | DONE |
| PR-32: Governance & Determinism Guards | Solver diff-guard, schema guard, no-heuristics guard | DONE |
| Frontend Test Coverage | Increase Vitest + Playwright coverage | DONE |
| CI Pipeline Enhancement | Add frontend type-check and lint to CI | DONE |

### 4.3 LOW Priority

| Item | Description | Status |
|------|-------------|--------|
| XLSX Network Importer | Import from spreadsheet (ADR-009) | DONE |
| Cloud Backup Integration | S3/GCS integration | DONE |
| Incremental Archive Export | Delta export | DONE |
| Archive Diff | Compare two project archives | DONE |

---

## 5. Technical Debt

| Issue | Severity | Description |
|-------|----------|-------------|
| Node/Bus terminology | RESOLVED | DTOs, API, frontend types renamed with backward-compat aliases |
| Stale root-level docs | RESOLVED | AUDIT.md, P13B_SUMMARY.md, AUDIT_PCC_REMOVAL.md marked DEPRECATED |
| Duplicate DOCS_INDEX.md | RESOLVED | Deleted (superseded by docs/INDEX.md) |
| Duplicate UI contract docs | LOW | Some contracts exist in both `docs/ui/` and root `docs/ui/` |
| Large test fixtures | LOW | Some test files contain large inline fixtures |
| ADR numbering conflicts | LOW | ADR-002, ADR-003, ADR-006, ADR-007, ADR-008 have duplicate numbers |
| Historical ExecPlans | LOW | 16 old ExecPlans in `docs/audit/historical_execplans/` should be archived |

---

## 6. Architecture Risks

| Risk | Mitigation |
|------|------------|
| Shadow data stores | Enforced by Single Model Rule + code review |
| Physics leaking into non-solver layers | NOT-A-SOLVER rule + test guards + arch_guard.py |
| Protection heuristics/auto-selection | protection_no_heuristics_guard.py (PR-32, DONE) |
| SC solver modification by Protection PRs | solver_diff_guard.py (PR-32, DONE) |
| SC ResultSet v1 drift | resultset_v1_schema_guard.py (PR-32, DONE) |
| Result API drift | Frozen API rule + version bump requirement |
| Proof determinism regression | SHA-256 fingerprint tests |
| UI codename leaks | `no_codenames_guard.py` script |
| Documentation drift | `docs_guard.py` — PCC prohibition + broken link check in entrypoints |

---

## 7. Canonical Documentation (archiwalne; `docs/spec/` jest ARCHIWALNY wg `CLAUDE.md` priorytet 9 — część A §D.8)

| Document | Location | Status |
|----------|----------|--------|
| Detailed Specification (18 chapters) | [`docs/spec/SPEC_CHAPTER_*.md`](docs/spec/) | SOURCE OF TRUTH |
| Spec-vs-Code Audit | [`docs/spec/AUDIT_SPEC_VS_CODE.md`](docs/spec/AUDIT_SPEC_VS_CODE.md) | BINDING |
| Spec Expansion Plan | [`docs/spec/SPEC_EXPANSION_PLAN.md`](docs/spec/SPEC_EXPANSION_PLAN.md) | REFERENCE |
| System Spec (overview) | [`SYSTEM_SPEC.md`](SYSTEM_SPEC.md) | BINDING |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) | BINDING |
| Agent Governance | [`AGENTS.md`](AGENTS.md) | BINDING |
| Documentation Index | [`docs/INDEX.md`](docs/INDEX.md) | REFERENCE |

## 8. Historical ExecPlans

All historical ExecPlans (01-16) are archived in `docs/audit/historical_execplans/`.
They document the evolution of the project but are NOT part of the canonical plan.
Current truth (2026-10-23): część A tego pliku (§C).

---



### 3.0.4b SLD Reset — canonical cutover (dopisane po znaczniku końca planu 5.1)

- [x] Wyłączono dane demo w głównym widoku SLD (`App.tsx` -> `SldEditorPage useDemo={false}`).
- [x] Spis inwentaryzacyjny starego/nowego pipeline i kanonicznego cutover: `docs/SLD_RESET_CANONICAL.md`.
- [x] Krytyczny browser E2E działa na realnym backendzie i potwierdza brak mutacji snapshot hash po run/results.

### 3.0.5b SLD proof package — 4 referencyjne sieci w głównej ścieżce

- [x] `#sld-view` obsługuje query `ref=leaf|pass|branch|ring` i ładuje kanoniczne dane topologiczne bez osobnego ekranu pomocniczego.
- [x] Dodano `referenceTopologies.ts`: jawne dane wejściowe 4 sieci + przejście przez `buildVisualGraphFromTopology` i `computeLayout` (GPZ/trunk/branch/stacja/ring/NOP).
- [x] `SLDView` przekazuje `canonicalAnnotations` do `SLDViewCanvas`, więc warstwa GPZ/trunk/branch/station renderuje się w głównym widoku.
- [x] Dodano test `referenceTopologies.test.ts` (non-empty symbols, annotations, NOP w scenariuszu ring).

### 3.0.6 SLD odbiorowy — skala, czytelność i język polski

- [x] Podniesiono minimalny zoom dopasowania dla scenariuszy referencyjnych (`#sld-view?ref=*`), aby wyeliminować miniaturyzację schematu.
- [x] Wzmocniono wizualnie GPZ/magistralę/odgałęzienia/stację (większy blok GPZ, mocniejsza oś pionowa, większa ramka stacji, czytelniejsze etykiety).
- [x] Ujednolicono etykiety scenariuszy referencyjnych do języka polskiego (bez anglicyzmów użytkowych).
- [x] Dodano testy jakości widoku: minimalna skala, wykorzystanie obszaru, brak mikrotekstu, brak anglicyzmów.

---


**END OF OPERATIONAL PLAN (część B, archiwum)**

---

## 9. Archiwum sesji operacyjnych

Sekcje historyczne 5.0–5.9 (sesja audytu wizualnego SLD, pętle K20/K30, 2026-05) przeniesione do
[`docs/audit/archive/PLANS_SESJE_SLD_2026-05.md`](docs/audit/archive/PLANS_SESJE_SLD_2026-05.md) (2026-07-15, U0.4).
