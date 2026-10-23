# Karta PODSTAWA-Q — rozróżnienie podstawy interpolacji μ i q (IEC 60909-0:2016 pkt 9.1.1 / 9.1.2)

**Worktree:** `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/podstawaq`
- gałąź `claude/mv-design-pro-twin-audit-u4lhy0-podstawa-q`
- baza: `f121c5e79`, czyli czubek gałęzi programu
- `frontend/node_modules` jest dowiązaniem; nie commituj go

Jeden commit lokalny, bez push. Autor: radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`. Stopka:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

Właściciel zweryfikował brzmienie normy IEC 60909-0:2016 (s. 53–55).

- **μ:** pkt 9.1.1, wzór (67), rysunek 13. Norma wprost dopuszcza interpolację:
  „For other values of minimum time delay, linear interpolation between curves is acceptable.”
  Status: **POTWIERDZONE**, podstawa normowa jawna.
- **q:** pkt 9.1.2, wzór (69), rysunek 14. Węzły t_min są te same, ale pkt 9.1.2 NIE powtarza zezwolenia
  na interpolację. Interpolacja liniowa po t między sąsiednimi węzłami jest uzasadnioną metodą
  numeryczną, ale to **INTERPRETACJA INŻYNIERSKA**, nie wymóg ani zezwolenie normy. Górna granica
  q ≤ 1 obowiązuje.
- Interpoluje się po czasie t_min. Nie interpoluje się po krotności prądu ani po mocy silnika.
- **Wydanie:** IEC 60909-0:2026 (wyd. 3.0, 2026-07-23) zastępuje wydanie 2016. Brzmienie pkt 9.1.1
  i 9.1.2 w wydaniu 2026 nie zostało niezależnie zweryfikowane. Potwierdzenia dotyczą wydania 2016.

Repo twierdzi dziś coś innego:
- `backend/src/network_model/solvers/machine_sc_iec60909.py:413`: krok śladu q mówi
  „interpolacja liniowa wartości krzywych dopuszczona przez IEC 60909-0:2016 rozdz. 9”;
- komentarz `:53–73` cytuje numerację z wydania 2001 („Figure 16”, pkt 4.5.2.1);
- `NORMA_KRZYWYCH_ZANIKU = "IEC 60909-0:2016 rozdz. 9"` jest wspólne dla μ i q;
- `equation_registry.py:482` dla q podaje „interpolacja liniowa” jako treść normy.

To narusza kontrakt werdyktu wyjaśnialnego (`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`).
Dowód musi podawać podstawę i stan źródła, a interpretacja nie może udawać normy.

## Rozstrzygnięcie architekta (§0, wiążące; B-01 przyjmuje sesja główna po weryfikacji)

1. **Liczby bez zmian.** Reguła węzeł / interpolacja / zakres zostaje. Wartości μ i q, I_b, wszystkie
   wyniki liczbowe i golden pozostają bit w bit. Zmienia się wyłącznie deklaracja podstawy w śladzie,
   dowodzie, rejestrze równań i dokumentach.
   - Hash źródła solvera w `scripts/guard_references/solver_hashes.json` zaktualizuj tak, jak robi to
     istniejąca procedura (zob. `scripts/rdzenie_b01.py` i `solver_diff_guard.py`).
   - W meldunku pokaż, że wyniki liczbowe są identyczne: porównaj `to_dict()` śladów na siatce t_min ×
     argument przed i po zmianie, z wyłączeniem nowych pól.
2. **Podstawa per wielkość i reguła, z jednego źródła.**
   - Podstawa normy zależy od wielkości: μ → „IEC 60909-0:2016 pkt 9.1.1, wzór (67), rys. 13”;
     q → „IEC 60909-0:2016 pkt 9.1.2, wzór (69), rys. 14”.
   - Ślad dostaje addytywne pole statusu podstawy dla reguły `INTERPOLACJA`:
     - μ → interpolacja dopuszczona jawnie przez pkt 9.1.1 (z cytatem);
     - q → interpretacja inżynierska: pkt 9.1.2 nie zawiera zezwolenia, a metoda jest spójna z krzywymi
       rysunku 14 (interpolacja po t_min, q ≤ 1).
   - Dla reguł węzłowych podstawą jest sam rysunek lub wzór.
   - Nazwy pól i wartości dobierz w duchu istniejących statusów kontraktu werdyktu. Jedna tablica albo
     funkcja jest źródłem tekstu dla śladu, dowodu SC3F (`proof_generator.py:~1996`), rejestru równań
     i łuku elektrycznego (`analysis/arc_flash/builder.py`), jeśli ten konsumuje ślad.
3. **Kompletność dowodu.** Wynik I_b silnika asynchronicznego oparty na interpolowanym q ma tę samą
   kategorię, co wynik oparty na interpretacji inżynierskiej w kontrakcie werdyktu. Sprawdź, czy
   kontrakt wymaga oznaczenia kompletności (np. `NIEPELNY`) albo wpisu w założeniach.
   - Jeśli wymaga, wepnij oznaczenie wszędzie tam, gdzie ślad spływa do wyjaśnienia lub raportu.
   - Jeśli nie wymaga, uzasadnij w meldunku cytatem z kontraktu.
   - Nie wymyślaj nowego statusu, jeśli istniejący pasuje.
4. **Wydanie normy.** Zapis źródła normy podaje wydanie 2016 i notę: „IEC 60909-0:2026 (wyd. 3.0)
   zastępuje 2016; brzmienie pkt 9.1.1/9.1.2 wyd. 2026 niezweryfikowane”.
   - Najpierw znajdź istniejące miejsce rejestru stanu źródeł norm (grep: „stan źródła”, „wydanie”,
     rejestr norm w `docs/`) i wpisz to tam. Nie twórz drugiego rejestru.
   - Komentarz w solverze popraw na numerację 2016 (pkt 9.1.1 / 9.1.2, wzory 67 / 69, rys. 13 / 14).
5. **Inwentarz klasy.** Wypisz grepem każde miejsce, które przypisuje normie interpolację q albo
   wspólną podstawę μ i q, i popraw każde. Obejmuje to solver, dowód, rejestr równań, łuk elektryczny,
   front (`frontend/src/**` oraz fikstury `harness-fixtures/generated/*` regenerowane własnym
   generatorem, nigdy ręcznie), `docs/**` poza archiwum oraz testy, które przypinają stary tekst.
   Archiwa zostają nietknięte.
6. **Testy jako iloczyn cech.** {μ, q} × {WEZEL, PONIZEJ, POWYZEJ, INTERPOLACJA, BEZ_ZANIKU} ×
   {status podstawy w śladzie, tekst kroku dowodu, odwołanie normy z numerem punktu}.
   - Asercja: q-INTERPOLACJA nigdy nie zawiera słów „dopuszczon…” ani „zezwal…” w odniesieniu
     do normy.
   - Asercja: μ-INTERPOLACJA zawiera cytat pkt 9.1.1.
   - Iniekcje: zamień status μ ↔ q oraz wróć do wspólnego tekstu „dopuszczona przez”. Testy mają
     czerwienieć.

## Granice

- Wartości liczbowe, FROZEN API wyników (pola tylko addytywne, `exclude_none`) i determinizm muszą
  zostać nietknięte. Do goldenów nie wchodzi żadna nowa liczba.
- Nie ruszaj `ui/sld/**`, `ui2/wyniki/zwarcia/**` ani menu kontekstowego.
- Zakazy: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
- Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`.
- Dysk jest ciasny (~4 GB): logi trzymaj w `scratchpad/podstawaq/`.

## Kryterium ukończenia

Każdy punkt musi być zielony, z kodem wyjścia złapanym bezpośrednio:
- pytest: `tests/network_model/solvers tests/proof_engine tests/analysis tests/api tests/golden`
  z `-n 2 --dist loadfile`;
- strażniki: `solver_diff_guard`, `solver_boundary_guard`, `backend_no_physics_guard`,
  `docs_guard`, `no_codenames_guard`, `mypy_ratchet_guard`, `audit_contract_guard`, ich samotesty
  oraz `sanity`/`determinism`, jeśli dotknięte;
- black i ruff.

Meldunek ma zawierać: inwentarz klasy (plik:linia), dowód identyczności liczb, decyzję z pkt 3
z cytatem, wyniki iniekcji i hash commitu.
