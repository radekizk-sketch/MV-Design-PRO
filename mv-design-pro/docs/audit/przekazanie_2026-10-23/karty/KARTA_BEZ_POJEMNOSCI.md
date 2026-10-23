# Karta BEZ-POJEMNOSCI — admitancje poprzeczne linii w sieci zgodnej/przeciwnej zwarć (B-01, decyzja architekta)

Worktree: `S/wt/bezpoj` = /tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/bezpoj,
gałąź `claude/mv-design-pro-twin-audit-u4lhy0-bez-pojemnosci`, baza = HEAD gałęzi programu. `frontend/node_modules` = dowiązanie (nie commituj).
Jeden commit lokalny bez push. Autor radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`, stopka:
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co
Z-bus zwarć (`short_circuit_core.build_zbus` → `network_model/core/ybus.py::AdmittanceMatrixBuilder`, l. ~107–121, ~191–208)
wstawia B/2 linii na każdym końcu do sieci zgodnej. IEC 60909-0 (metoda zastępczego źródła napięcia) pomija pojemności
linii i admitancje poprzeczne obciążeń niewirujących w składowej zgodnej i przeciwnej; w składowej zerowej pojemności
uwzględnia się tam, gdzie norma to każe (sieci izolowane/kompensowane). Rozpływ (`build_ybus_pu`) ma B/2 słusznie.
Linie 110 kV GPZ H5 (karta LINIA-110) uczynią ten błąd liczbowo istotnym. Jednocześnie `short_circuit_iec60909.py:~1441`
(rozpływ prądu po gałęziach) ignoruje shunt — dwie reprezentacje tej samej sieci w jednym solverze (KCL domyka się
dziś tylko dlatego, że… sprawdź). Zgoda B-01 architekta na ten zakres; liczby się ZMIENIĄ — to cel.

## Rozstrzygnięcie (§0)
1. Najpierw ustal i ZACYTUJ podstawę (IEC 60909-0:2016, punkt założeń obliczeń + punkt dot. składowej zerowej; jeśli
   repo ma tekst/cytat w `docs/` — użyj; inaczej kwerenda z dokładnym numerem). Bez cytatu — STOP i meldunek.
2. Inwentarz klasy: KAŻDA ścieżka zwarciowa budująca macierz sieci zgodnej/przeciwnej/zerowej (IEC 60909 3F/2F/1F/2F-Z,
   machine SC, fault loop IEC 60364, v126 academic, wkłady gałęziowe, sanity, dowód SC3F, adaptery ENM `enm/mapping.py:~450`)
   — czy dokładają shunt linii, kabli (kable SN mają duże B!), obciążeń. Każde miejsce: zmiana albo uzasadnienie normowe.
3. Naprawa u źródła, jednym predykatem (np. parametr budowniczego „tryb zwarciowy: bez admitancji poprzecznych w
   składowej 1/2”), nie kopią builderra. Rozpływ i estymacja stanu bez zmian (dowód: ich hashe nietknięte).
4. Składowa zerowa: zachowaj/wprowadź pojemności tam, gdzie norma je wymaga (zwarcie doziemne w sieci izolowanej/
   kompensowanej) — jeśli dziś repo liczy prąd doziemny pojemnościowy osobną ścieżką, nie dubluj.
5. Ślad White Box: jawny krok „pominięto admitancje poprzeczne w składowej zgodnej/przeciwnej — podstawa: …”.
6. Sonda liczbowa: dla każdego zmienionego golden/fikstury — tabela przed/po (Ik″, ip, Ith, Zk), Δ% i przyczyna;
   lista hashy rdzenia wg `scripts/rdzenie_b01.py`/`solver_diff_guard.py`. Uaktualnij dokumentację różnic w
   `tests/network_model/test_parytet_admitancji_rozplyw_zwarcia.py` (różnica R6: celowa, z podstawą normy).
7. Rachunek niezależny: sieć 2-węzłowa z kablem o dużym B — ręczne Ik″ wg normy = wynik solvera.
8. Iniekcje (czerwień): przywrócenie B/2 w zgodnej; usunięcie B ze składowej zerowej tam, gdzie wymagane;
   zdjęcie B z rozpływu.

## Granice
Nie zmieniaj formatu wyniku (FROZEN) — zmieniają się tylko wartości; jeśli wymaga to pola — addytywne `exclude_none`.
Nie ruszaj `ui/**`, `ui2/**`. Zakazy: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`. Logi: `scratchpad/bezpoj/`.

## Kryterium ukończenia (kody wyjścia łapane bezpośrednio)
Pełna regresja backend `-n 3 --dist loadfile -m "not pandapower and not andes"` rc=0; guardy rdzenia/kontraktu
(`solver_diff`, `solver_boundary`, `resultset_v1_schema`, `werdykt_wyjasnialny`, `backend_no_physics`, `mypy_ratchet`,
`docs`, `sld_determinism_guards`) + samotesty rc=0; black/ruff rc=0; vitest pełny rc=0, jeśli zmieniły się fikstury frontu.
Meldunek: cytat normy, inwentarz, tabela sondy, lista hashy, iniekcje, hash commitu.
