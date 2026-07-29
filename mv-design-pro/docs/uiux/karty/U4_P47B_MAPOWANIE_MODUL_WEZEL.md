# KARTA ZADANIA P47b — MAPOWANIE MODUŁ→WĘZEŁ W PULPICIE OZE (TODO P47a)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Warstwa:** backend
(addytywnie) + frontend · **Wiążące:** CLAUDE.md (addytywne pola widoku —
istniejące pola/testy bez zmian semantyki; ZERO fizyki w UI; etykiety PL;
granica SLD).

## 1. Cel
Domknięcie TODO P47a: klik modułu wytwórczego w pulpicie OZE podświetla
wiersze węzła tego modułu w sekcjach „Siła sieci" i „Adekwatność mocy
biernej" (dziś sekcje pokazują `bus_ref` bez powiązania z listą modułów).

## 2. Zakres
1. Backend (addytywnie): widok siły sieci
   (`application/analyses/grid_strength.py` — `_installed_mva_by_bus`:67
   iteruje generatory snapshotu z `bus_ref`) — dodaj do wiersza węzła listę
   modułów źródłowych: `[{ref, nazwa (jeżeli w snapshocie), sn_mva}]`
   (deterministyczna kolejność; istniejące pola nietknięte; ZBADAJ czy
   analogiczna lista przyda się w widoku adekwatności — jeżeli builder
   ma dane per źródło po D13 (`source_q_actuals`), wykorzystaj ISTNIEJĄCE
   pole zamiast nowego). Testy: lista modułów per węzeł, determinizm,
   stare pola bez zmian.
2. Frontend (`ui2/oze/pulpit/`): klik modułu na liście modułów pulpitu
   ustawia stan `wybranyModul`; sekcje SilySieci i AdekwatnosciQ
   podświetlają wiersze węzła powiązanego z modułem (mapowanie z §2.1
   po `ref` modułu → `bus_ref`; klasa CSS tokenami --mvd-*, np. obwódka);
   ponowny klik odznacza; moduł bez węzła w widoku → uczciwa adnotacja PL
   przy module („węzeł nieodnaleziony w wynikach analizy"). Zero martwych
   klików.
3. Testy: backend ≥ 6; frontend ≥ 8 (klik podświetla właściwe wiersze,
   odznaczenie, moduł bez węzła — adnotacja, fixture 1:1 z kontraktem,
   istniejące testy pulpitu bez regresji).

## 3. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Bazy: pytest 6082, vitest 8622 — ZERO failed. Środowisko:
venv główny (D2vgvUMQ) i symlink node_modules (NIE commituj); pełne suity
do plików (usuń przed commitem), NIGDY na goły potok, pętla `until` przed
pełnym biegiem (nigdy dwie pełne suity równolegle; masz DWIE pełne suity —
puść je SEKWENCYJNIE); NIE edytuj src w trakcie; po biegach NATYCHMIAST
commit. Bramki: celowane + PEŁNY pytest ZERO failed + PEŁNY vitest ZERO
failed; ruff/black/mypy + type-check/lint na twoich plikach;
guardy: arch, solver_boundary, pcc_zero, load_flow_no_heuristics,
guard:codenames, forbidden_ui_terms, ui_terminology, utf8_mojibake.
NIE dotykaj SLD. Commit (JEDEN, backend+frontend):
`feat(oze): mapowanie moduł→węzeł z podświetleniem w pulpicie (P47b)`
BEZ push. Raport standardowy (plik:linia).
