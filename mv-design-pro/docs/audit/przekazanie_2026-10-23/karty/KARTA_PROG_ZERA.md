# Karta PROG-ZERA-WKLADOW — numerycznie pomijalne wkłady gałęziowe rozpływu prądu zwarciowego

**Status zgody:** warunkowa zgoda B-01 właściciela z 2026-10-21. Jej pełny tekst jest niżej,
w §W. Wiąże dosłownie i obejmuje WYŁĄCZNIE tę klasę błędu. B-02 nadal jest odrzucone.

**Worktree:** `/tmp/claude-0/-home-user-MV-Design-PRO/72c31ae8-8c05-5345-a2a0-6f7019e05b56/scratchpad/wt/progzera`
- gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-prog-zera`
- baza: `8f20bdd3c`, czubek gałęzi programu
- node_modules: dowiązanie

Commity lokalne bez push. Autor radekizk-sketch <radek.izk@gmail.com>, `--cleanup=verbatim`, stopka:

    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_0171VVpvwNs6Dgz67xnmQpux

## Po co

`short_circuit_iec60909.py` filtruje listy `branch_contributions` (~:1360) i `branch_flow_trace`
(~:1482) warunkiem `<= 0`. Gałąź bez fizycznego przepływu daje resztę zmiennoprzecinkową rzędu
1e-17 kA. Taki wpis trafia na listę albo nie, zależnie od maszyny. W efekcie powstaje wiersz
„0,0 kA, kierunek: brak”, a skład wyniku jest niedeterministyczny. Przykład: punkt
`80c21edb-e0ec-5378-acd6-e90f5ec0bc57` sceny tolerancji roboczej nN dawał 5 wpisów lokalnie
i 6 w CI.

Commit `8f20bdd3c` dodał w testach obejście: pasmo zera w porównywarce fikstur
(`backend/tests/ci/tolerancja_fikstur.py`, `POLA_LIST_WPISOW_ROZPLYWU`, `PASMO_ZERA_FIXTUR`).
Po naprawie u źródła to obejście ma zniknąć, a porównanie list wraca do ścisłego. Inaczej test
maskowałby defekt (CLAUDE.md, Zero-Debt pkt 5).

## Wymagania właściciela (wiążące, każde z dowodem w meldunku)

1. **Jeden próg.** Obowiązuje |I| < 1e-6 A (= 1e-9 kA). Ma jedną definicję, w jednym miejscu,
   z jawną jednostką w nazwie i docstringu. Stosujesz go w OBU torach wkładów gałęziowych:
   falownikowym i Thevenina, oraz we wszystkich predykatach list wkładów i śladu.
   - Predykat: `abs(I) < PROG`, NIE `<=`.
   - Inwentarz klasy zrób grepem: każde miejsce publikujące wkład gałęzi albo ślad
     (rdzeń, `short_circuit_contributions.py`, widoki biegu, API rozpływu, eksport, frontend).
   - Warstwa prezentacji ma dziś własny próg 1e-9 kA dla kierunku „brak”. Ma czytać tę samą
     definicję albo jej odbicie z kontraktu. Dwie niezależne stałe są zakazane (predykaty
     parami — reguła KLASA, NIE INSTANCJA, pkt 3).
2. **Wyniki główne bez zmian.** Ik″, ip, Ith, Ib, Sk″, impedancje zastępcze, składowe symetryczne
   i algorytmy wyznaczania prądu zostają nietknięte. Zmienia się wyłącznie klasyfikacja
   i publikowanie pomijalnych wkładów gałęzi. Dowód: porównanie korpusu golden przed i po
   — 0 różnic tych wielkości, bit w bit.
3. **Wkład pominięty to nie zero.** W dokumentacji, docstringu i śladzie White Box wpis nosi nazwę
   „wkład pominięty na podstawie tolerancji numerycznej (|I| < 1e-6 A)”.
   - Surowa wartość musi być do odtworzenia audytowo. Dodaj addytywne zestawienie
     diagnostyczne w śladzie (np. `wklady_pominiete`: gałąź, surowe I [A], kąt, tor źródła)
     i pole `exclude_none` w wyniku. FROZEN API zmieniasz tylko addytywnie.
   - Zestawienie ma być deterministyczne: kolejność stała, wartości surowe zaokrąglone
     do ustalonej liczby cyfr znaczących przed hashowaniem. Inaczej niedeterminizm wraca
     przez ślad. Uzasadnij wybór w meldunku.
4. **Spójność wszystkich miejsc.** Tabela UI, API, ślad White Box, eksport PDF/DOCX/JSON i proof
   pack pokazują TEN SAM zbiór gałęzi. Test spójności przechodzi przez realne ścieżki
   (HTTP + eksport) i porównuje zbiory.
5. **Wartości graniczne.**
   - {0, +1e-17 kA, −1e-17 kA, tuż poniżej progu, dokładnie na progu, tuż powyżej}
     × {tor falownikowy, tor Thevenina} × {3F, 2F, 2FZ, 1F}.
   - Do tego sieć z RZECZYWISTYM małym prądem nad progiem: ten wpis musi zostać.
6. **Bilans.**
   - Dla każdego punktu korpusu wyznacz sumę pominiętych wkładów (moduł i fazor).
   - Wykaż, że filtr nie zmienia wniosków o zasilaniu miejsca zwarcia, kierunkach przepływu
     ani prądach przypisanych aparaturze (wytrzymałość aparatury, zabezpieczenia).
   - Bilans węzłowy ∑I sprawdź przed i po w granicy tolerancji.
7. **Determinizm międzyśrodowiskowy.** Porównaj skład i kolejność wpisów, eksport, ślad
   i SHA-256 kanonicznego raportu w co najmniej trzech środowiskach:
   - różne `OPENBLAS_NUM_THREADS` / `OMP_NUM_THREADS` (1 i 4);
   - z i bez `-n` xdist;
   - jeśli dostępne, inny backend BLAS/wersja numpy w osobnym venv
     (nie instaluj nic do głównego venv).

   Jeśli ostatnie cyfry INNYCH wartości nadal się różnią, napisz to wprost i nie zgłaszaj
   pełnego domknięcia determinizmu.
8. **Wykaz zmian golden.** Dla każdego wpisu: identyfikator przypadku, usunięty wpis, wartość
   przed filtrowaniem, przyczyna i zmiana odcisku. Wzorce regenerujesz generatorami repo.
   Wykaz w pliku `scratchpad/pzp/golden_diff.md`. Integrator zweryfikuje go niezależnie
   przed scaleniem.
9. **Właściwa warstwa.** Najpierw ustal, czy filtr da się postawić w warstwie publikacji
   (budowa list wkładów i śladu) bez zmiany obliczeń.
   - Jeśli zmiana zamrożonego solvera jest konieczna, ogranicz ją do tych predykatów
     i wspólnego progu.
   - Odśwież odcisk w `scripts/guard_references/solver_hashes.json` i dopisz opis
     w `scripts/rdzenie_b01.py` z odwołaniem do zgody właściciela z 2026-10-21.
   - Każda inna zmiana rdzenia = STOP i meldunek.

## Granice

- Nie ruszaj innych algorytmów IEC 60909, μ/q, t_b, c ani tolerancji.
- Zakaz: `git stash`, `reset --hard`, `pkill -f`, `--amend`, `clean -x`, push.
- Nie czytaj `scratchpad/decyzje_wlasciciela.md` ani `STAN_REPO §7 J`.
- pytest `-n 2`; długie biegi odłączone (`setsid nohup`, sentinel RC w pliku). Logi w `scratchpad/pzp/`.
- Na dysku jest ~4,9 GB.

## Kryterium ukończenia

Karta jest gotowa dopiero, gdy zielone są wszystkie poniższe bramki, z kodami wyjścia łapanymi
bezpośrednio:
- pełna regresja backendu `-m "not pandapower and not andes"`;
- vitest katalogów dotkniętych;
- tsc i eslint;
- komplet guardów z venv oraz ich samotesty;
- generatory w trybie sprawdzenia: słownik, OpenAPI, `eksport_fixtur_harnessu.py --sprawdz`;
- e2e na realnym backendzie: `wspolczynnik-c-screenshot`, `zwarcia-rozplyw-screenshot`,
  `zwarcia-f2-screenshot`, `wyniki-jezyk-inzyniera`.

Meldunek zawiera dowody wymagań 1–9 po kolei. Zielone CI nie jest wystarczającym dowodem.

## §W — tekst decyzji właściciela (2026-10-21)

WYRAŻAM WARUNKOWĄ ZGODĘ B-01 NA USUNIĘCIE NUMERYCZNIE POMIJALNYCH WKŁADÓW GAŁĘZIOWYCH Z
PUBLIKOWANEGO WYNIKU ROZPŁYWU PRĄDU ZWARCIOWEGO. Zakres zgody jest ściśle ograniczony do opisanej
klasy błędu. Nie zgadzam się na przypadkową zmianę fizyki solvera ani na ukrywanie rzeczywistych
błędów numerycznych pod pozorem deterministyczności. [Wymagania 1–9 jak wyżej.] ZIELONE CI NIE
JEST WYSTARCZAJĄCYM DOWODEM. Karta może zostać uznana za zakończoną dopiero wtedy, gdy rzeczywisty
produkt zawsze przedstawia ten sam zbiór istotnych gałęzi, bilans prądów pozostaje zweryfikowany,
a wyniki liczbowe nie wykazują nieuzasadnionych zmian. ZGODA DOTYCZY WYŁĄCZNIE TEGO ZAKRESU B-01.
NIE OBEJMUJE INNYCH ZMIAN ZAMROŻONEGO RDZENIA. B-02 POZOSTAJE ODRZUCONE.
