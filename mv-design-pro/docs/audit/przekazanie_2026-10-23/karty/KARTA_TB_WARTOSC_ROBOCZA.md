# Karta TB-WARTOSC-ROBOCZA — czas wyłączenia t_b bez blokady (zasada nr 4, B-01 (n) delegowane architektowi)

Worktree: `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/tb`
(gałąź `claude/mv-design-pro-twin-audit-u4lhy0-tb`, baza `5517d6eff` = partia 13: karta I_b + WARTOSC-ROBOCZA-1).
Jeden commit lokalny, BEZ push. Autor radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`, stopka:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

Po karcie SC-IB-ITH-ZRODLA bieg bez t_b w scenariuszu nie liczy I_b z udziałem maszyn ani i_DC
(kod `fault.czas_tb_brak`) — 189 wierszy zwarć 3F z maszynami ma dziś puste I_b. Zasada nr 4
(CLAUDE.md, kontrakt `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md` §3c, V12K-351): brak danej
nie blokuje obliczeń — system proponuje wartość roboczą, liczy, oznacza dyskretnie, projektant może
zmienić i przeliczyć; wynik na założeniu nigdy nie udaje danej producenta ani dowodu.

## Rozstrzygnięcia architekta (§0 — wiążące)

1. **Pierwszeństwo t_b w punkcie zwarcia** (jedna funkcja rozstrzygająca, jedno źródło):
   (a) t_b podany w scenariuszu zwarciowym (`breaking_time_seconds`) — pochodzenie PROJEKTANT, dotyczy
   wszystkich punktów;
   (b) inaczej t_min z pól lokalnych punktu zwarcia — wzorzec PowerFactory „break time: min. of local”:
   najmniejszy czas wyłączenia spośród pól z wyłącznikiem przyłączonych do szyny punktu zwarcia, gdzie
   czas wyłączenia pola = najkrótszy stopień zabezpieczenia + czas własny wyłącznika, z ISTNIEJĄCEGO
   jedynego rozstrzygnięcia (`application/analyses/protection/czas_wylaczenia_pola.py`, czas własny
   z rejestru wartości roboczych karty WARTOSC-ROBOCZA-1 — także gdy sam czas własny jest wartością
   roboczą, co przenosi się na pochodzenie t_b). Pochodzenie Z_POL + odnośnik pola;
   (c) gdy żadne pole lokalne nie ma nastaw — wartość robocza **0,1 s**, źródło „węzeł tablicy μ
   IEC 60909-0:2016 (rys. 16 / wzory (70)–(73), t_min = 0,1 s)”, jakość ESTIMATED, pochodzenie
   PROPOZYCJA. Stała żyje w JEDNYM miejscu (rejestr wartości roboczych albo `core/czas_wylaczenia.py`),
   nie jako domyślny argument sygnatury rdzenia (to karta I_b skasowała — nie przywracaj).
2. **t_b per punkt zwarcia**, nie per bieg: solver dostaje mapę punkt → t_b (z pochodzeniem) i liczy
   μ, q, I_b, i_DC dla każdego punktu z jego t_b. Wiersz wyniku niesie t_b i jego pochodzenie
   (pola addytywne, `exclude_none` — FROZEN ShortCircuitResult tylko addytywnie).
3. **`fault.czas_tb_brak` przestaje istnieć jako blokada.** Zastępuje go założenie biegu
   (np. `fault.czas_tb_wartosc_robocza`) niosące listę punktów z wartością roboczą; kod brakowy
   kasujesz na amen ze wszystkich miejsc (rejestr gotowości, słownik, asembler, solver, proof_pack,
   widoki biegu, frontend, testy) — bez warstwy zgodności. `fault.czas_tb_niepoprawny` zostaje
   (wartość niefizyczna podana przez projektanta to nadal odmowa).
4. **Wiarygodność:** I_b / i_DC z t_b roboczym ⇒ w ocenie aparatury (`_ocena_wylaczania`)
   `dane_przyjete` z DanaPrzyjeta ESTIMATED, `UNVALIDATED_INPUT`, NIEPELNY (na poziomie W:
   SPELNIA + NIEPELNY → BRAK_DOWODU, tak jak dla i_th/t_th/i_dyn). t_b z pól, w którym czas własny
   jest wartością roboczą — też dana przyjęta. Nigdy DATASHEET / KATALOG_PRODUCENTA.
5. **Warstwy:** asembler (`enm/assembler.py`) i `canonical_analysis` nie mogą zacząć importować
   warstwy aplikacji wbrew `arch_guard`. Jeśli rozstrzygnięcie czasu pola musi zejść niżej, PRZENIEŚ
   je (jedna implementacja), nie kopiuj. Fizyka (μ, q, I_b, i_DC) wyłącznie w solverze.

## Miejsca wpięcia (wszystkie — inwentarz klasy zrób sam grepem i dołącz do meldunku)

Ślad White Box solvera (krok „Ib”, „idc” z t_b i pochodzeniem), dowód SC3F (`proof_generator`,
`pakiet_biegu`, `packs/sc_symmetrical.py`), `api/proof_pack.py`, eksport (PDF/DOCX/JSON), porównanie
biegów, widoki biegu (`api/canonical_run_views.py` — pochodzenie t_b), ekran wyników zwarć
(`frontend/src/ui2/wyniki/zwarcia/**`: dyskretna etykieta „wartość robocza” przy t_b z tekstem źródła
z backendu i akcją „Zmień wartość” prowadzącą do edycji t_b scenariusza zwarciowego — kontrolka musi
mapować na realne pole `breaking_time_seconds`), weryfikacja aparatury pól (`wytrzymalosc_aparatury_pol.py`).

## Testy (iloczyn cech, nie przykład)

{t_b podany / z pól lokalnych / wartość robocza} × {zasilanie daleko od generatora / maszyna
synchroniczna / maszyna asynchroniczna / falownik}; plus: szyna z dwoma polami o różnych czasach
(bierze minimum), pole z nastawą obok pola bez nastaw, czas własny wyłącznika roboczy przenosi się
na pochodzenie t_b, t_b niepoprawny projektanta = odmowa, determinizm (ten sam wejściowy model →
ten sam hash). Sonda liczbowa ręczna μ(t_b) dla maszyny synchronicznej przy 0,1 s i przy t_b z pola
(wzory (70)–(73) IEC 60909-0) — w meldunku liczby ręczne vs solver.

## Granice

FROZEN API wyników — tylko addytywnie; determinizm i istniejące payloady z podanym t_b: wynik
i `input_hash` bez zmian (pokaż testem). Fikstury e2e i golden nietknięte, chyba że zmiana wynika
z rozstrzygnięcia 1 — wtedy regeneracja generatorem repo i wypis różnic w meldunku. Nie czytaj
`scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`. Zakaz: `git stash`, `reset --hard`,
`pkill -f`, `--amend`, `clean -x`, push.

## Kryterium ukończenia

Pełna regresja backendu (`-m "not pandapower and not andes"`), vitest pełny, type-check, lint,
WSZYSTKIE guardy pythonem z venv (`/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-qcn8twMl-py3.11/bin/python`)
oraz samotesty guardów (`-m pytest scripts/test_*guard*.py`), generatory (`scripts/generuj_slownik_kodow_gotowosci.py`,
`backend/scripts/generuj_snapshot_openapi.py`, `backend/scripts/eksport_fixtur_harnessu.py --sprawdz`) —
kody wyjścia łapane bezpośrednio, gadatliwe wyjścia do pliku. Meldunek: inwentarz klasy, sonda
liczbowa, liczba wierszy, w których I_b z pustego stał się liczbą, kody wyjścia, czego nie zrobiono.
Uwaga na dysk (ENOSPC): logi do scratchpadu, nie twórz kopii node_modules (jest dowiązanie).
