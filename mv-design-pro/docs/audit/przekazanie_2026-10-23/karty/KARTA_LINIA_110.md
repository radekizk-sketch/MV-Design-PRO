# Karta LINIA-110 — parametry linii napowietrznej 110 kV z geometrii (GPZ H5, model B)

**Worktree:** `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/linia110`
- gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-linia-110`
- baza: `f121c5e79`
- `frontend/node_modules`: dowiązanie (nie commituj)

Jeden commit lokalny bez push. Autor: radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`.
Stopka:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

Wzorzec GPZ H5 (ENEA Operator, Zeszyt 1) wymaga modelu B przy zamkniętym łączniku szyn 110 kV.
Model B to wspólny punkt zasilania, czyli szyna stacji zasilającej z danymi OSD, oraz jawne linie
110 kV L1 i L2. Bez niego sumowanie mocy zwarciowych dwóch torów jest zakazane (wymóg właściciela).

Repo ma katalog linii i kabli tylko dla 20 kV. Standard ENEA linii 110 kV ustala przewód
(AFL-6 240 mm²), ale R, X i B każe wyznaczać obliczeniowo dla geometrii projektu. Rozstrzygnięcie
architekta: `docs/uiux/KOORDYNACJA_WATKOW_2026-10.md`, wpis 7, pkt 4. Odczytaj je przez `git show`
z gałęzi `claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy`. Źródła odczytane przez
wątek UX są w `docs/zrodla/` na tej samej gałęzi, a skrypt pobierania to
`scripts/pobierz_zrodla_techniczne.py`.

## Rozstrzygnięcie architekta (§0, wiążące)

1. **Typ katalogowy wiąże przewód.**
   - Katalog przewodów linii napowietrznych 110 kV obejmuje co najmniej AFL-6 240 mm² wymagany
     przez standard ENEA. Dane wyrobu to: przekrój, średnica, R20 DC, α, budowa oraz GMR albo dane
     do jego wyznaczenia.
   - Każda dana ma podstawę: normę wyrobu (PN-EN 50182 / PN-EN 50540 lub właściwą) z numerem
     tabeli. Gdy podstawy nie da się ustalić, dana jest wartością `ESTIMATED` z jawnym założeniem.
   - Najpierw przejrzyj istniejący katalog i jego strukturę (reguła 10 oraz
     `SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md`). Nie twórz równoległego katalogu.
2. **Solver parametrów linii (White Box) w `network_model/solvers/`.**
   - Liczy: R′ w temperaturze, X′ (GMD/GMR, wiązka, jeśli dotyczy), B′ (pojemność z GMD
     i promienia), Z0′ z wpływem ziemi (Carson z rezystywnością gruntu jako daną, równania
     uproszczone tylko z jawną podstawą normową) i Z0 z przewodem odgromowym, jeśli jest w geometrii.
   - Każdy krok jest w śladzie: wzór LaTeX, podstawienie, wynik, jednostka.
   - Sanity-bounds sprawdzają typowe zakresy dla 110 kV z podstawą.
3. **Geometria słupa to dana projektu.**
   - Gdy jej brak, system proponuje wartość roboczą: typowy słup ze standardu ENEA linii 110 kV,
     jeśli standard podaje typy lub odległości, a w przeciwnym razie normę albo jawne założenie
     inżynierskie.
   - Wartość robocza ma jakość `ESTIMATED`, wpis w `dane_przyjete` i kompletność dowodu `NIEPELNY`
     (ZASADA NR 4). Projektant może ją edytować.
   - Wartości zmierzone lub podane przez OSD wchodzą istniejącą ścieżką ręczną z pochodzeniem.
     Znajdź ją grepem (np. `EKSPERCKI_RECZNY`, `wartosci_robocze`). Drugiej ścieżki nie twórz.
4. **Wpięcie end-to-end.**
   - Gałąź linii 110 kV w ENM (`LineBranch` z typem katalogowym przewodu i geometrią albo
     z danymi ręcznymi), mapowanie do solverów zwarć i rozpływu, gotowość, API (OpenAPI,
     macierz API) oraz pola formularza linii w UI.
   - Formularz wpinasz tylko w istniejącym formularzu gałęzi linii, z polami 110 kV. Edytor
     pola GPZ i SLD należą do wątku UX: w meldunku wypisz, gdzie mają czytać nowe pola.
   - Raport i dowód pokazują ślad parametrów linii.
5. **Normy.** Zanim wpiszesz wzór, ustal i zacytuj źródło. Kandydaci to IEC 60909-2 / IEC TR 60909-2
   (dane impedancji urządzeń), podręczniki zatwierdzone w `docs/zrodla/` oraz norma wyrobu
   przewodu. Brak źródła oznacz jako założenie inżynierskie, nigdy jako normę. Do kwerend
   zewnętrznych użyj subagenta `researcher`, jeśli go masz; inaczej sam, z cytatem.

## Testy

- Iloczyn cech: {AFL-6 240, drugi typ przewodu z katalogu} × {geometria z projektu, geometria
  robocza} × {z odgromowym, bez} × {R′, X′, B′, Z0′}.
- Rachunek niezależny: ręcznie przeliczony przykład z literatury lub normy, z tolerancją
  i podstawą.
- Brak geometrii nie blokuje obliczeń, a wynik ma kompletność `NIEPELNY`.
- Determinizm.
- Iniekcje: zamiana GMD z GMR, pominięcie wpływu ziemi w Z0, brak oznaczenia `ESTIMATED`. Każda
  ma dać czerwony test.

## Granice

- Nie ruszaj rdzeni B-01 (`scripts/rdzenie_b01.py`): parametry linii wchodzą do istniejących
  solverów jako dane gałęzi.
- Nie ruszaj `ui/sld/**`, `ui2/wyniki/zwarcia/**`, operacji GPZ (`domain_operations.py`
  ~4240–4710; to karta GPZ-MODEL wątku UX) ani menu kontekstowego.
- Zakazy: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
- Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`.
- Logi zapisuj w `scratchpad/linia110/`.

## Kryterium ukończenia

Komplet zielony, z kodami wyjścia łapanymi bezpośrednio:
- pytest: `tests/network_model`, `tests/enm`, `tests/api`, `tests/ci`, `tests/golden` z `-n 2
  --dist loadfile -m "not pandapower and not andes"`;
- guardy: `backend_no_physics`, `solver_boundary`, `catalog_binding`, `catalog_enforcement`,
  `catalog_gate`, `catalog_metadata`, `physics_label`, `werdykt_wyjasnialny`, `docs`,
  `mypy_ratchet`, `sanity`, jeśli istnieje, oraz ich samotesty;
- `tsc`, `eslint` i `vitest` dotkniętych katalogów;
- `black` i `ruff`.

Meldunek zawiera:
- źródła z numerami punktów;
- inwentarz miejsc wpięcia;
- przykład liczbowy;
- wyniki iniekcji;
- hash commitu.
