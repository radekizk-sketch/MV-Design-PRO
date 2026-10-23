# Karta WKLAD-ZRODLA — wkład zwarciowy per źródło sieciowe (B-01, GPZ H5 R8)

**Worktree:** `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/wkladzr`
- gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-wklad-zrodla`
- baza: `f121c5e79`, czyli gałąź programu z progiem zera
- `frontend/node_modules` to dowiązanie; nie commituj go

Jeden commit lokalny, bez push. Autor: radekizk-sketch <radek.izk@gmail.com>, commit z `--cleanup=verbatim`.
Stopka commitu:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

Właściciel przyjął wzorzec GPZ w układzie H5 (ENEA Operator, Zeszyt 1, §11.1): dwie linie
110 kV, L1 i L2, każda z własnym równoważnikiem i na własnej sekcji. Wariant SC-06 wymaga pokazania
wkładu każdego toru zasilania do prądu zwarciowego. Dziś rdzeń agreguje źródła sieciowe do
`THEVENIN_GRID` (`backend/src/network_model/solvers/short_circuit_iec60909.py:~1251`). Rozbicia
per źródło nie ma.

Pakiet korekty: `docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10.md` (R8, D5) na gałęzi
`claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy`. Odczytaj go przez `git show`.
Rozstrzygnięcia są w `docs/uiux/KOORDYNACJA_WATKOW_2026-10.md`, wpis 7, pkt 2.

## Rozstrzygnięcie architekta (§0, wiążące; zgoda B-01 architekta na ten zakres)

1. Wkład źródła sieciowego Q_k do zwarcia w węźle f liczy się metodą zastępczego źródła napięcia
   (IEC 60909-0:2016 §4.2): I_Q,k = Y_Q,k · Z_kf · I″k. Tak samo dla wkładów maszyn, jeśli są
   liczone w tym miejscu. Wykorzystaj istniejące macierze śladu (Z-bus / kolumna Z_kf) — bez
   drugiej faktoryzacji, jeśli rdzeń ją już ma. Wyprowadzenie znaku i kierunku ma być spójne z
   istniejącymi wkładami gałęziowymi (`short_circuit_contributions.py`).
2. Wynik jest addytywny: nowe pole opcjonalne (`exclude_none`) w wyniku i w śladzie White Box,
   dopisane do `OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS`, do persystencji (jeśli wynik jest utrwalany
   kolumnowo — wzór: `wklady_pominiete_json`), do API i do kontraktów. Żadna istniejąca liczba się
   nie zmienia.
3. Wkład pomijalny ocenia JEDEN predykat `jest_wkladem_pominietym` (próg zera B-01 z 2026-10-21,
   `short_circuit_contributions.py:32,43`). Drugiego progu nie ma.
4. Bilans: suma wkładów źródeł sieciowych, maszyn i wkładów pominiętych = I″k, z tolerancją
   z istniejącego kontraktu bilansu. Bilans liczy się w śladzie jako krok jawny.
5. Źródło w innej wyspie niż węzeł zwarcia daje wkład STRUKTURALNIE zerowy: wynika z topologii
   (wyspa), a nie z szumu numerycznego. Wpis w wyniku ma przyczynę.
6. Golden i fikstury: dokładna lista zmienionych hashy z przyczyną. Zmiana może wynikać wyłącznie
   z nowego pola; sonda bit w bit pokazuje, że dotychczasowe pola są identyczne. Procedura hashy
   rdzenia według `scripts/rdzenie_b01.py` i `solver_diff_guard.py`.
7. Front: wiersz wkładu per źródło w ekranie rozpływu zwarciowego (`ui2/wyniki/zwarcia`) wpinasz
   tylko wtedy, gdy ekran ma już tabelę wkładów, której to dotyczy. W meldunku podaj, gdzie wątek
   UX ma to wpiąć. Nie budujesz drugiej tabeli.

## Testy (iloczyn cech, iniekcje)

- Iloczyn: {jedno źródło, dwa źródła w jednej wyspie, dwa źródła w różnych wyspach (H5, łączniki
  otwarte), dwa źródła + maszyna} × {zwarcie 3F, 1F, 2F, 2F-Z tam, gdzie rdzeń liczy wkłady} ×
  {MAX, MIN}.
- Asercje: bilans; wkład źródła z innej wyspy = 0 z przyczyną; rachunek niezależny (np. ręczny
  Z-bus dla sieci dwuwęzłowej) zgodny z wynikiem.
- Iniekcje (każda ma dać czerwień):
  - wkład liczony z Z_ff zamiast Z_kf;
  - drugi próg;
  - pominięcie maszyn w bilansie.
- Determinizm: dwa biegi dają identyczny hash.

## Granice

- Zmiana rdzenia ograniczona do opisanego zakresu. Nie zmieniaj fizyki solvera ani żadnej
  istniejącej liczby.
- Zakazy: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
- Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`.
- Logi zapisuj w `scratchpad/wkladzr/`.

## Kryterium ukończenia

- pytest: `tests/network_model/solvers`, `tests/proof_engine`, `tests/api`, `tests/golden`,
  `tests/ci`, `tests/enm`, `tests/application`; flagi `-n 2 --dist loadfile`
  i `-m "not pandapower and not andes"`; rc=0.
- Strażniki rdzenia i kontraktu (`solver_diff`, `solver_boundary`, `solver_input_substitute`,
  `resultset_v1_schema`, `werdykt_wyjasnialny`, `backend_no_physics`, `mypy_ratchet`, `docs`,
  `audit_contract`) oraz ich samotesty: rc=0.
- `black` i `ruff`: rc=0.
- Migawka OpenAPI zregenerowana i sprawdzona testem.

Meldunek zawiera:
- wyprowadzenie wzoru z odnośnikiem do normy;
- inwentarz miejsc wpięcia;
- sondę identyczności liczb;
- listę hashy;
- wyniki iniekcji;
- hash commitu.
