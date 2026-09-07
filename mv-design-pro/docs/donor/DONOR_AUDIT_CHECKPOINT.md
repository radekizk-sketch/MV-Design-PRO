# DONOR AUDIT — CHECKPOINT (odporność na limit kontekstu, §15 mandatu)

**Status:** ŻYWY. Aktualizowany po każdej partii donorów. Punkt wejścia dla następnej sesji.

## CP-1 — 2026-09-07, ustalenie baseline

### CURRENT HEAD
- Gałąź pracy: `claude/mv-design-pro-donor-audit-vnuqd1`
- HEAD po ustaleniu bazy: `5adc958d0fed5f783fd6c78d7e407d00354e5a54` (CV-4.3 K6)
- Working tree: czysty

### USTALENIE BAZY — CO FAKTYCZNIE ZASTAŁEM (weryfikacja, nie założenie)
1. Checkpoint właściciela `5adc958d` **NIE ISTNIAŁ** w klonie sesji — klon był płytki (`--depth`),
   a gałąź `claude/mv-design-pro-twin-audit-u4lhy0` nie była pobrana. `git cat-file` zwracał błąd.
   To NIE oznaczało utraty pracy — po `git fetch --unshallow` obiekt jest obecny.
2. `origin/claude/mv-design-pro-twin-audit-u4lhy0` = **dokładnie `5adc958d`**. HEAD gałęzi Fable
   NIE poszedł dalej. K6 jest nadal ostatnim commitem konwergencji.
3. Gałąź wyznaczona mandatem (`claude/mv-design-pro-donor-audit-vnuqd1`) była utworzona z `main`
   i miała **zero własnych commitów** (`7e84753a` = `origin/main` co do znaku).
4. `twin-audit` wyprzedza `main` o **183 commity** (CV-0 → CV-4.3 K6, niescalone),
   `main` nie wyprzedza `twin-audit` o nic; `merge-base` = `7e84753a`.
5. **Decyzja:** gałąź donor-audit przewinięta `--ff-only` na `5adc958d`. To fast-forward gałęzi
   pustej — NIC nie zostało nadpisane, cofnięte ani zresetowane. K5/K6 i wszystkie dowody
   konwergencji zachowane w całości. Bez rebase, bez force.
   Uzasadnienie: dokumenty audytu muszą powstać w drzewie zawierającym
   `docs/architecture/CONVERGENCE_ROADMAP.md`, `docs/evidence/CONVERGENCE_EVIDENCE.md`
   i `docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` — na `main` tych plików NIE MA.

### STAN KONWERGENCJI (odczytany z repo, nie z pamięci)
- Ostatnia zamknięta karta: **CV-4.3 K6** — Z_Q zasilania systemowego ze współczynnikiem c
  wg IEC 60909-0:2016 §6.2.1 eq. (6) + ślad White Box wyprowadzenia Z_Q.
- Następna znana karta: **K7 — S''_kQmin w modelu**, scenariusz MIN bez cichego S''_kQmax.
- Osobny problem wydajności: **PERF-SC-50** (czas zwarcia dla sieci ~50 stacji).
- K5 skasował trasy legacy `/api/cases/{id}/runs/{short-circuit,power-flow}` — **nie przywracać**.
- Most pandapower **JUŻ ISTNIEJE** (K3b): `application/reference_networks/pandapower_bridge.py`
  + wyrocznie `tests/golden/wyrocznie/pandapower.py`. Nie jest „nowym odkryciem".

### DONORS REVIEWED
Partia 1 uruchomiona równolegle (agenci ECAD / PROJECTION / SOLVERS / PROTECTION / RUNTIME).
Wyniki i dokładne SHA — patrz `OPEN_SOURCE_DONOR_AUDIT.md` po domknięciu partii.

### NEXT EXACT STEP
Odbiór raportów partii 1 → niezależna weryfikacja dowodów (nie przyjmować wniosków subagenta
bez sprawdzenia) → macierz decyzji → przegląd adwersaryjny → artefakty w repo.

## CP-2 — 2026-09-07, niezależny pomiar strony MV (przed odbiorem raportów donorów)

Wykonany OSOBIŚCIE (nie przez subagenta), żeby móc weryfikować twierdzenia donorów, a nie
przyjmować je na słowo.

### F-1. Regresja czasu zwarcia — liczby z repo (korekta etykiety właściciela)
Etykieta „PERF-SC-50" **nie występuje w repo** — to nazwa robocza właściciela. Dług jest
zapisany w `docs/evidence/CONVERGENCE_EVIDENCE.md` bez tego identyfikatora, z pomiarem:
- `POST /api/execution/runs/{id}/execute`, bieg SC sieci 50 stacji: **170 866,7 ms**
- kalibracja 2026-07-29: **~32 s** → regresja **~5,3×**
- budżet 240 000 ms, margines **1,40×** (wobec ~7× przy kalibracji)
- próg NIE podniesiony (Zero-Debt); przyczyna **niezdiagnozowana**, wymaga osobnego profilowania
- wykluczono: kontencję CPU (cichy host, load < 3,0) oraz różnicę BLAS/OpenBLAS (0.3.23 identyczny)
Wniosek dla audytu: to problem **wydajności solvera/assemblera**, nie responsywności procesu.
Izolacja workera go NIE naprawi (§9 mandatu) — donor runtime nie może być sprzedany jako lek na to.

### F-2. SLD v3 ma ŻYWY router ortogonalny — to NIE jest luka
`frontend/src/ui/sld/v3/layout/route.ts` jest wpięty w produkt (pomiar konsumentów poza testami):
`buildRoute` = 2, `routeOrthogonal` = 1, `endsAtPorts` = 2, `classifyRouteNodes` = 2,
`routeAvoidsObstacles` = 1. Zawiera `RoutePort`, `RouteVertex`, `RouteNode`, omijanie przeszkód,
kontrolę siatki. Donor oferujący „Manhattan routing + obstacle avoidance" **nie wnosi nowej
zdolności** — musiałby udowodnić przewagę nad tym, co działa.

### F-3. DŁUG WYKRYTY UBOCZNIE — druga, martwa implementacja trasowania (v2)
`frontend/src/ui/sld/v2/geometry/cadRoutingContract.ts` to **kontrakt z testami bez ścieżki
produktowej**. Pomiar konsumentów produkcyjnych (z wyłączeniem samego pliku i `__tests__`):

| Eksport | Konsumenci produkcyjni |
|---|---|
| `buildOrthogonalRoute` | 0 |
| `PositionedSymbol` | 0 |
| `isOrthogonalRoute` | 0 |
| `manhattanLength` | 0 |
| `getAbsolutePortPosition` | 0 |
| `CAD_LAYER_COLOR` | 0 |
| `findNearestPort` | 0 (tylko test) |
| `RouteLockState` | 0 |
| `snapToGrid` | 12 (jedyny żywy) |

To jest dokładnie wzorzec zakazany przez ZASADĘ NR 1 („funkcja istniejąca tylko w testach,
niewpięta w ścieżkę użytkownika, to dług") oraz ZASADĘ NR 3 („dwie ścieżki tej samej fizyki →
naprawione od razu"), z precedensem kasacji `getMvNeutralGrounding` (commit `f8b93d6c`,
„test bez produktu to dług"). **Dwa niezależne routery ortogonalne w jednym froncie.**
`findNearestPort` + `PORT_SNAP_THRESHOLD_PX` to dodatkowo geometryczne kojarzenie portów —
gdyby zostało kiedyś wpięte do tworzenia połączeń, złamałoby prawo 3.3 (geometria nie tworzy
connectivity). Dziś nie jest wpięte, więc prawo nie jest złamane — ale kontrakt zaprasza do
złamania. Karta naprawcza: patrz `DONOR_IMPLEMENTATION_BACKLOG.md`.

### F-4. `ui/sld-editor` NIE ISTNIEJE jako moduł
Zawiera wyłącznie `types.ts` (56 linii) z jawnym komentarzem: „Pełny moduł `sld-editor`
(komponenty, runtime) jest poza tym worktree". CLAUDE.md opisuje go jako „Edycja SLD (geometria
CAD, przeciąganie, trasowanie)" — **opis nie odpowiada stanowi repo**.

### F-5. Trwałe placement/route — LUKA POTWIERDZONA
Brak w backendzie magazynu placement/route dla SLD. `application/sld/` zawiera `layout.py`,
`internal_layout.py`, `station_geometry.py` — czyli **wyliczanie** układu, nie jego trwałe
przechowywanie. Scena v3 jest w całości pochodną ENM (`v3/scene/buildScene.ts`).
Konsekwencja: ręczne rozmieszczenie i ręczne wierzchołki trasy **nie są trwałymi danymi
domenowymi** i nie przeżywają przeliczenia. To jest realna luka, na którą donor ECAD może
odpowiadać — i jedyna z obszaru SLD, której MV faktycznie nie ma.

### F-6. ENM ma już tożsamość portu i węzeł przyłączenia
`Port` (15 rodzajów `PortKind`, `occupied_by`), `PortRef` (adres niemutowalny), `ConnectionNode`
(`bay|bus|der_terminal|branch_point`) — plus rewizje, dziennik zmian, hasze
(`compute_semantic_hash`, `compute_input_hash`, `compute_switching_snapshot_hash`,
`compute_enm_hash`). Donor proponujący „persistent identity / ports / terminals" jako nowość
**duplikuje istniejący podsystem**.

### F-7. Świeżość wyników JEST wdrożona — donor runtime tego nie wnosi
`backend/src/application/result_freshness.py:292` porównuje `envelope.model_revision` z rewizją
bieżącą ORAZ `envelope.snapshot_hash` z haszem bieżącym. Konsumenci m.in.
`analyses/werdykt_projektowy.py:702`, `wytrzymalosc_cieplna_przewodow.py:460`,
`nn_circuit_sheet.py:861-864` (`aktualny = bieg.snapshot_hash == model_hash`).
Reguła „wynik po zmianie ENM nie może być prezentowany jako FRESH" (§9 mandatu) jest już
egzekwowana — ADR-018 wdrożony. Donor proponujący to jako nowość **duplikuje istniejący podsystem**.

### F-8. Celery NIE JEST wpięty — biegi są synchroniczne
`backend/src/api/celery_app.py` ma **26 linii** i **zero importerów** w `src/`
(`grep -rn celery_app src/ --include=*.py` poza samym plikiem: pusto).
Stos deklaruje „Task Queue: Celery" — faktycznie kolejka zadań nie obsługuje biegów analiz.
Wykonanie idzie synchronicznie przez `POST /api/execution/runs/{id}/execute`.
To jest realna luka runtime — ALE jej wagę wyznacza F-1: bieg SC 50 stacji trwa 171 s
synchronicznie. Worker poprawi responsywność, anulowanie i izolację awarii; **nie skróci
tych 171 s**. Obie rzeczy trzeba trzymać rozdzielnie (§9 mandatu).
