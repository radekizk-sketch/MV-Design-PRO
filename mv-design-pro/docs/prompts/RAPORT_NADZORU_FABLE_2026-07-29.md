# RAPORT Z PRZEJĘCIA NADZORU — Fable, 2026-07-29

Mandat: `PRZEJECIE_NADZORU_FABLE_2026-07-28.md`. Kolejność wg dyrektywy właściciela:
najpierw co obalone, potem co potwierdzone, naprawione, ekrany, dług.
Gałąź sesji: `claude/przejecie-nadzoru-fable-dtie3b` (od `d98b88d6` = szczyt
`claude/power-network-design-ui-ir91mv`).

---

## 1. CO OBALONE

**O1 · „12 testów tests/api żywiło się cudzymi danymi" — NIE BRONI SIĘ przy lekturze kodu.**
Przeczytane WSZYSTKIE 43 pliki `tests/api` (214 testów w 18 plikach przeanalizowane
asercja po asercji, reszta przeskanowana po trzech osiach: reset / zasiew / kontakt
z przebiegami). Sygnatura „czyta przebiegi, których sam nie stworzył" występuje **0 razy**:
11 plików dotykających przebiegów ma własny modułowy `reset_canonical_runs()` przed KAŻDYM
testem, 3 nie dotykają bazy w ogóle, pozostałe zasiewają własne dane albo używają własnych
silników `tmp_path`. Trzy twarde przesłanki: (a) commit `9d80dd2b` nie zmienił ANI JEDNEJ
linii testów; (b) kierunek pomiaru 15→3 czerwonych jest ODWROTNY niż przy testach
żywiących się cudzym (te po izolacji robiłyby się czerwone, nie zielone); (c) losowy UUID
nie trafiał także w brudnej bazie. Najbardziej prawdopodobny mechanizm: 12 testów PADAŁO
przez zatruty wspólny plik 15 MB (`StaleDataError` z przełączanego w locie cache silnika +
`reset_canonical_runs()` kasujący tabelę pod cudzymi sesjami). Izolacja je NAPRAWIŁA,
a testują to samo co przed nią. Opus opisał skutek odwrotnie do mechanizmu, który sam
zmierzył. Punkt §3.6 mandatu zamykam z tym werdyktem.

**O2 · „Przedmiot allowlisty wyjechał z UI do backendu" (D5) — połowicznie.**
Baseline 22→5 jest uczciwym pomiarem WEDŁUG WZORCÓW guarda. Ale plik
`protection-catalogs.ts` (793 linie) nadal zawiera ŻYWĄ fizykę:
`validateDeviceWithstand` liczy `I_th_eff = I_th·√(t_rated/t_clr)` + procenty
wykorzystania + werdykt „BLOKER: przekroczenie wytrzymałości", wpięte w
`StationConfigProtectionCard` → `StationConfiguratorSurface` (żywa powierzchnia).
Backendowy odpowiednik (`validateDeviceWithstandApi`) istnieje i nie jest tu używany.
Do tego `DEVICE_WITHSTAND_CATALOG` = katalog równoległy we froncie (łamie Catalog
Binding Rule). Wzorce guarda (√3, impedancje, dUdP/dUdQ) tej klasy fizyki nie widzą —
zielony guard ≠ zero fizyki w UI.

**O3 · Granica migracji PCC była realna w danych.** Sonda na realnej ścieżce
zapis→restart→odczyt: klucz `pcc_ref` podłożony w `sources[]`/`loads[]` przeżywał
migrację nietknięty. (Naprawione w tej sesji — patrz §3.)

**O4 · PDF — wiersz „Run ID" jest poprawny, ale raport ma dwa defekty niewidoczne
bez oględzin:** (a) polskie diakrytyki renderują się jako ■ we WSZYSTKICH PDF
(23 użycia Helvetica, zero `registerFont` w całym `src/` — WinAnsi nie ma ą/ę/ś/ż/ń/ł);
(b) kody projektowe (P11–P33, P24+, P20…) jadą w treści eksportu wbrew regule
„No Codenames in Exports". Nikt tego nie widział, bo nikt nie patrzył — dokładnie
klasa luki, którą mandat kazał zamknąć.

**O5 · e2e nie było uruchamiane — i jest czerwone.** `npm run test:e2e`:
**275 passed / 20 failed / 2 skipped, RC=1 (18,3 min)**. Stan zastany gałęzi
(zmiany tej sesji są backend-only). Uwaga metodyczna z triażu: `playwright-run.mjs`
domyślnie ustawia `PLAYWRIGHT_REAL_BACKEND=1`, więc standardowy bieg JEST biegiem
z realnym backendem. **Triaż per test (każdy padający odtworzony pojedynczo na żywym
stosie): 19× realny rozjazd, 1× środowisko.** Grupy przyczyn:
- **Specy nieaktualne względem zmienionego flow GPZ (9):** klik „Wstaw GPZ" tworzy
  źródło BEZPOŚREDNIO (SldCanvasV3Workspace:1723), a specy czekają na formularze
  (`add-grid-source-form`, `add-sn-bay-form`, `start-branch-form`,
  `insert-station-form`…), których testidy istnieją już TYLKO w mockach testów
  jednostkowych — cały `ux-feedback-loop` (7), `designer-flow-empty-state-cta`,
  pośrednio `create-first-case` (nieaktualna asercja tekstu paska).
- **Testidy formularzy, których nie ma w src (3):** `insert-branch-pole-form`,
  `insert-zksn-form`, `insert-section-switch-form` (branch-points ×2,
  catalog-enforcement).
- **Sceny harnessu z niemockowanym fetch (4):** `creator=cieplna` i
  `creator=zwarcia-rozplyw` wołają realne `/api/analysis-runs/run-sc-7|run-sc-th1-demo`
  → 404 wpada do bramki „zero błędów konsoli" (fk1 ×2 motywy, zwarcia-rozpływ ×2).
- **Strict-mode locator (2):** `getByText('Założenie przypadku')` trafia 2 wiersze
  (fk1-czas-wyłączenia ×2 motywy).
- **Możliwa regresja produktu (1):** po delete+continue+**reloadzie**
  `sld-readiness-stack` (GuidedBuildActionPanel) w ogóle się nie renderuje —
  spójne z centralną diagnozą hydratacji z audytu soczewek.
- **Środowisko (1):** `industrial-template-mass-flow` — `execute` biegu SC na sieci
  50 stacji trwa ~32 s (ręczny curl: HTTP 200/DONE), limit w specu 10 s.

**Ścieżka krytyczna na realnym backendzie: `npm run test:e2e:real` → 1 passed,
RC=0 (7,3 s).** §3.8 mandatu domknięte w obu wariantach.

## 2. CO POTWIERDZONE (pomiarem, nie opisem)

- **Backend pełna regresja: 7195 passed, 11 skipped, 4 xpassed, RC=0** (972,97 s) — co do sztuki.
- **Frontend: 783 pliki / 10487 passed, RC=0** (1059,62 s); `type-check` RC=0, `lint` RC=0,
  `ruff` RC=0, `black --check` RC=0.
- **Guardy: 13× RC=0 + `trace_determinism_guard` RC=0** (przez poetry, jak w mandacie).
- **mypy: dokładnie 273 błędy w 67 plikach** (748 sprawdzonych) — dług potwierdzony co do sztuki (§3.9).
- **V12K-269:** odcisk bez zegara — potwierdzone; `trace_id` treściowy wszędzie
  (`deterministic_trace_id` ← `run_hash = compute_run_hash(snapshot, input, math_spec)`);
  ZERO miejsc porównujących zapisany `analysis_id` z przeliczonym (archiwa i eksporty
  bezpieczne mechanicznie — §3.7 domknięte).
- **V12K-268:** migracja działa przez realną ścieżkę: rewizja +1 dokładnie raz, hash
  zmienia się raz, drugi odczyt bez podbicia; jedyny historyczny producent klucza pisał
  wyłącznie do `generators[].meta` (pickaxe po całej historii — R49).
- **Decyzje D1–D4 potwierdzone** (D1: podział case_name/case_id słuszny — raport pokaże
  uczciwe „—" zamiast UUID; D2: pomiar producentów trace_id; D3: słuszna, z ryzykiem
  resztkowym `.enm_store` — patrz §5; D4: `bus_przylaczenia_ref` spójne z kanonem,
  „connection_bus_ref" kolidowałby z `connection_node_ref` i zakazanym „Connection Point").
- **§3.4 EkranLom:** decyzja Opusa POPRAWNA — `get_lom_protection` liczy na żywo
  z bieżącego `get_enm(case_id)`; nie istnieje zapisany wynik, który mógłby się
  zestarzeć. Rekomendacja produktowa: wariant informacyjny „ocena na żywo · rewizja N".

## 3. CO NAPRAWIONE (karty własne, regresje wstrzyknięte gryzą)

**V12K-270** (commit `f4b2ab25`, wpis w rejestrze konfliktów):
1. **Migracja PCC objęła wszystkie kolekcje modelu** (`_elementy_modelu` — iteracja po
   polach modelu, deterministyczna, obejmuje przyszłe kolekcje). Sonda po zmianie:
   klucz w sources/loads migrowany, rewizja +1 raz, idempotencja zachowana.
   Wstrzyknięta regresja (powrót skanu tylko `generators`) → test CZERWONY.
2. **Łańcuch kontekstów dowodowo-raportowych kopiuje się jawnie:**
   `analysis/koperta_kontekstu.py` (Protocol 6 pól + `pola_koperty` z dostępem
   bezpośrednim, bez wartości domyślnych) zastąpił `getattr(ctx, "pole", None)`
   w 7 miejscach. Częściowe przemianowanie = `AttributeError` w miejscu kopii + błąd
   mypy, nie ciche `None` w raporcie. Wstrzyknięta regresja (powrót getattr) → test
   CZERWONY. To zamyka §3.10 mandatu decyzją „jawny, typowany przepis" — wykonaną.

Pomiar kart: 23 testy zielone, ruff/black RC=0, mypy obu modułów czyste.

## 4. EKRANY (dyrektywa 8 — wykonana po raz pierwszy od 6 kart)

- **Osobiste przejście FLOW E1–E8 na realnym stosie** (uvicorn + vite): realny projekt
  operacjami kanonicznymi, gotowość zielona, 2 biegi DONE, mutacja modelu 12→13.
  13 kadrów: `docs/audit/visual/flow-nadzor/`; bramki zrzutów (oba motywy, wszystkie
  sceny + kreatory) zielone i odtworzone.
- **Stała strona oceny zaktualizowana** (seria „nadzór 2026-07-29"; poprzedni inwentarz
  101 kadrów w historii wersji strony).
- **Gdzie łańcuch się rwie (zmierzone na żywo):** zimny start nie odtwarza stanu
  z serwera (Obliczenia: „Brak przypadków" przy istniejącym aktywnym przypadku;
  Wyniki→Zwarcia: „Brak wyniku" przy DONE-biegu; pasek: „Przebieg: —", nieświeża
  rewizja); deep-link `#analysis?run=` ląduje na legacy zamiast w warsztacie ui2;
  sprzeczne prawdy na jednym ekranie; martwe stany zerowe bez akcji.
- **Znacznik świeżości (V12K-265/266) — nadal NIEZOBACZONY na żywym ekranie,
  i już wiadomo dlaczego:** harness nie zasila `analysis_case_context.rewizja_modelu`
  w ŻADNEJ scenie (pomiar: grep = 0), a na realnym stosie ekran wzorca nie renderuje
  się po zimnym starcie, bo wyniki nie są hydratowane. Wpięcie „na ślepo" potwierdzone
  w praktyce — dokładnie tak, jak nazwał to mandat.
- **Audyt siedmiu soczewek + projekt łańcucha:** `docs/uiux/AUDYT_SIEDMIU_SOCZEWEK_2026-07-29.md`
  — 3 kreatory-WYSPY (kompensator SN, ogranicznik SN, źródło dyspozycyjne nN — jedyne
  wejście przez nierenderowane menu), ~19 pół-ogniw (m.in. 8 ekranów OZE bez odbiorcy
  wyniku, E-28 bez wykonawcy nastaw, CT/VT/przekaźnik tylko z ukrytego ProcessPanel),
  diagnoza centralna (hydratacja) i plan łańcucha H-0…H-6 z bramką „restart po biegu".

## 5. DŁUG NIENAPRAWIALNY W TEJ KOLEJCE (pomiar · przyczyna · plan)

| Dług | Pomiar | Przyczyna | Plan |
|---|---|---|---|
| Diakrytyki ■ we wszystkich PDF | oględziny 2 wariantów strony tytułowej; 23× Helvetica, 0× registerFont | base-14/WinAnsi bez polskich glifów | karta: rejestracja TTF (DejaVu/Noto) + świadomy re-baseline determinizmu bajtowego PDF |
| Kody projektowe w eksporcie PDF | „Raport P24+ …, Zakres: P11–P33", sekcje P20…P28 | raport powstał przed regułą; guardy nie skanują wyjścia PDF | karta: słownik etykiet PL + guard eksportów |
| Fizyka w UI + katalog równoległy | `validateDeviceWithstand`, `DEVICE_WITHSTAND_CATALOG` (żywe) | wzorce guarda nie łapią √(t/t); stara powierzchnia | karta: przepiąć na `validateDeviceWithstandApi`, usunąć katalog z frontu, poszerzyć wzorce guarda |
| e2e czerwone 20/297 | pełny bieg RC=1 + triaż per test (19 rozjazdów, 1 środowisko) | suita nieuruchamiana od tygodni → specy odjechały od flow GPZ; 4 sceny harnessu z niemockowanym fetch; 1 możliwa regresja hydratacji (`sld-readiness-stack` po reloadzie); 1 limit 10 s vs realne 32 s | karty: aktualizacja speców do flow wariantowego, mock fetch w 2 scenach, diagnoza readiness-stack po reloadzie (razem z H-0), podniesienie limitu execute |
| Izolacja `.enm_store` połowiczna | tylko 4 pliki ustawiają `ENM_STORE_DIR`; `reset_enm_store()` kasuje wszystko | ta sama klasa co naprawiona dla przebiegów | karta: autouse fixture ENM_STORE_DIR per test |
| Testy-nagrobki proof_pack + wyciek `app.state.uow_factory` | 2 testy 410 z kłamliwymi nazwami, ~70 linii martwego zasiewu | endpoint wygaszony, testy nie | karta higieny testów (+7 testów PODEJRZANYCH z audytu asercji) |
| mypy 273 | pomiar sesji | dług historyczny | bez zmian — osobny program |
| „PCC" w identyfikatorach reference_networks | `PCC_SN`, `pcc_bus_ref` (companion) | poniżej rozdzielczości `\bPCC\b` | karta przemianowania + zaostrzenie wzorca |
| Odcisk koperty biegu zależny od `run_id`/etykiet | `orchestrator._fingerprint` | odcisk PRZEBIEGU, nie analizy — być może intencja | nazwać intencję w kodzie albo ujednolicić z odcisk_kontekstu |

## 6. Stan zakazu scalenia

§3 mandatu domknięte — wszystkie 10 punktów rozstrzygnięte pomiarem, w tym pkt 8
w obu wariantach (pełna suita RC=1 z triażem per test; ścieżka krytyczna real RC=0).
ZAKAZ scalania do main/develop pozostaje W MOCY: bramka §6 jest spełniona na warstwie
backend+frontend unit+guardy+determinizm, a NIE jest spełniona na warstwie e2e
(20 czerwonych speców wymaga kart naprawczych — 19 rozjazdów spec↔produkt to praca
znana co do przyczyny i miejsca, wyliczona w tabeli długu). Decyzja o kolejności
(naprawa e2e przed scaleniem vs. scalenie z długiem nazwanym) należy do właściciela.
