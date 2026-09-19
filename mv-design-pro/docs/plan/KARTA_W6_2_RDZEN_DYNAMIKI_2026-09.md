# KARTA W6-2 — „Rdzeń dynamiki": pakiet `network_model/solvers/dynamika/` (DAE ze sprzężeniem sieciowym) — projekt architekta

**Status:** WIĄŻĄCA (rozstrzygnięcia architekta; synteza `SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §2.7, §2.11 W6-2,
§3 klasyfikacja wątku badawczego, §4.1 A-10/A-12). **Warunek wejścia:** W6-1 odebrane (kontrakty `ParametryDynamiczne`,
`ScenariuszDynamiczny`, `ResultSetDynamicV1`, rodzaj biegu `dynamika_rms`). **Wykonawca:** agent (przenosiny i adaptacja
modułów laboratorium wg tej karty, z naprawą znalezisk shadow review) + architekt (odbiór z wyroczniami).
**B-01:** nowy pakiet obok rdzeni FROZEN (DT-9) — żaden istniejący plik w `network_model/solvers/**` nie jest edytowany.

## §0 Rozstrzygnięcia

1. **Miejsce i granice:** `backend/src/network_model/solvers/dynamika/` — moduły: `konwencje.py` (jednostki, bazy, znaki,
   dq↔sieć), `siec.py` (Ybus składowej zgodnej z IR assemblera, wstrzyknięcia prądu, rozwiązanie `g(x,y)=0` Newtonem z
   globalizacją), `silnik.py` (pętla DAE półjawna: inicjalizacja, krok, zdarzenia, re-inicjalizacja), `calkowanie.py`
   (trapez niejawny domyślny, RK jawne diagnostycznie; tolerancja skalowana krokiem), `zdarzenia.py` (harmonogram z
   dokładnym czasem — krok skracany do zdarzenia), `reinicjalizacja.py` (stany różniczkowe trzymane, algebra od nowa,
   diagnostyka Δx/Δy/‖f‖/‖g‖/residuum KCL liczona NIEZALEŻNIE od solvera — naprawa P1-B55-01 jest warunkiem odbioru),
   `skonczonosc.py` (NaN/Inf łapane w chwili powstania z adresem stanu), `tozsamosc.py` (odciski scenariusza,
   topologii, implementacji), `wynik.py` (budowa `ResultSetDynamicV1`), `urzadzenia/` (W6-3), `walidacja/` (W6-2:
   wyrocznie analityczne — małosygnałowe, równe pola/CCT; niezmienniki: całka pierwsza przy D=0, bilans energii).
   Import wyłącznie: `math`, `numpy`, `scipy.sparse`, kontrakty z `network_model/solvers/dynamika/kontrakty.py`,
   `network_model/pochodne/*`; ZERO importów z `application/`, `enm/`, `api/` (guard `solver_boundary_guard` +
   `import_graph_guard` rozszerzone o pakiet).
2. **Wejście solvera** = `WejscieDynamiki` (kontrakt w `dynamika/kontrakty.py`): IR sieci z assemblera (`enm/assembler.py`
   — TEN SAM widok, którym liczy rozpływ; jedna prawda punktu pracy), rozwiązanie rozpływu (fazory szyn, moce
   źródeł), `ParametryDynamiczne` per źródło (z proweniencją), `ScenariuszDynamiczny`, nastawy solvera (`dt_s`,
   `tolerancja`, `integrator`, `max_iteracji_newtona`, `horyzont_s`). Brak elementu/parametru = odmowa nazwana (kod
   `dynamika.<pole>_missing`), nie wartość domyślna.
3. **Inicjalizacja** (bramka niezbywalna): punkt pracy z rozpływu → stany urządzeń (δ, ω, E'q, E'd, ψ; PLL θ, prądy
   regulatorów) → stany regulatorów (Efd, Pm z równowagi) → ‖f(x₀,y₀)‖ ≤ ε_init i ‖g(x₀,y₀)‖ ≤ ε_init; naruszenie =
   odmowa `dynamika.inicjalizacja_niezbiezna` z wektorem residuów per urządzenie (nie „artefakt rozruchu" w wyniku).
4. **DAE i całkowanie:** ẋ = f(x,y,u,p,t), 0 = g(x,y,u,p,t); krok trapezowy niejawny rozwiązywany Newtonem na układzie
   sprzężonym (x,y) z jakobianem numerycznym/analitycznym per urządzenie (interfejs `Urzadzenie.jakobian`), globalizacja
   (tłumienie kroku) — nie loteria zbieżności; kontrola błędu kroku i `dt` adaptacyjne w zadanych granicach; każdy krok
   odrzucony liczony (`wlasnosci_biegu.kroki_odrzucone`); NaN/Inf → `skonczonosc` zgłasza w chwili powstania.
5. **Zdarzenia:** harmonogram z `ScenariuszDynamiczny` → zwarcie = modyfikacja Ybus (admitancja zwarcia w węźle:
   3F z `R_f + jX_f`; 2F/1F/2FZ w W6-4 przez składowe symetryczne — w W6-2 wyłącznie 3F, inne = odmowa nazwana),
   wyłączenie/załączenie gałęzi, odłączenie źródła, skok obciążenia; krok skracany do t zdarzenia; po zdarzeniu
   re-inicjalizacja algebry (`reinicjalizacja.py`) z raportem Δy i residuów do `zdarzenia_wykonane`.
6. **Determinizm i tożsamość:** ta sama migawka + scenariusz + nastawy + implementacja ⇒ identyczny `ResultSetDynamicV1`
   (po kwantyzacji 9 cyfr); `tozsamosc.odcisk_implementacji` = skrót źródeł pakietu; zero zależności od historii obiektu
   silnika (nowy obiekt per bieg, test tożsamości biegu); precyzja międzyplatformowa ZADEKLAROWANA (kwantyzacja na
   granicy kontraktu, nie bit w bit).
7. **Walidacja W6-2 (bramka odbioru, oś C × W z laboratorium):** (a) SMIB klasyczny (model 2. rzędu, D=0): całka
   pierwsza zachowana do tolerancji kroku, CCT przez bisekcję = CCT z równych pól (błąd ≤ 2 %), drabina dt…dt/8
   potwierdza rząd 2 trapezu; (b) SMIB z tłumieniem: częstotliwość oscylacji vs analiza małosygnałowa (wartości własne
   jakobianu w punkcie pracy) ≤ 1 %; (c) ANDES SMIB (job opcjonalny `-m andes`, osobne środowisko — A-10): błąd
   trajektorii punkt-po-punkcie raportowany odcinkami (przed / okno / po), kryterium odbioru zapisane w teście;
   (d) determinizm biegu (2 biegi, 1 odcisk); (e) mutacje krytyczne (znak momentu, brak re-inicjalizacji, zły krok)
   zabijane przez testy (rama mutacyjna jako narzędzie `tests/`, nie produkt).
8. **Ślad WHITE BOX:** kroki inicjalizacji (residua), każdy krok z odrzuceniem/zdarzeniem, macierz Ybus (skrót +
   rozmiar), parametry solvera; zapis w `white_box_trace` biegu (poza szeregami); pakiet dowodowy dynamiki w W6-5.
9. **Wydajność:** budżet biegu 10 s symulacji sieci 50 stacji z 5 źródłami ≤ 60 s obliczeń (pomiar w karcie PERF-DYN-0
   przy odbiorze; algebra rzadka `scipy.sparse` od początku — lekcja PERF-SC-50).
10. **Czego NIE robić:** nie wpinać `stability_rms`/`frt_hvrt` (kasacja po W6-5 — OD-20); nie kopiować laboratorium
    hurtem (każdy moduł przepisany do naszych kontraktów i konwencji nazw, testy `tests/network_model/dynamika/*`);
    nie dopuszczać domyślek liczbowych parametrów urządzeń (to dane z W6-1); nie modelować zdarzeń niesymetrycznych
    w W6-2; nie nadawać żadnej zdolności `VALIDATED_SIMULATION` w tej karcie (awans po W6-3/W6-4 z wyrocznią).

## §1 Wejścia z laboratorium (klasyfikacja synteza §3) i naprawy warunkujące

`konwencje.py`, `siec.py`, `silnik.py`, `calkowanie.py`, `zdarzenia.py`, `reinicjalizacja.py` (po P1-B55-01),
`skonczonosc.py`, `tozsamosc.py`, `wynik.py` — PRZEJĄĆ; `walidacja.py`, `drabina.py`, `benchmarki.py`, `sztywnosc.py`,
`porownanie_postaci.py`, `ryzyko_postaci_modelu.py` — narzędzia testowe; `wzorzec_*.py` (ANDES) — wyrocznia opcjonalna;
21 błędów mypy (protokoły vs frozen dataclass) naprawione przy przenosinach.

## §2 Testy i DoD

testy jednostkowe per moduł (kontrakty, skończoność, zdarzenia z dokładnym czasem, re-inicjalizacja z prawdziwym Δy),
walidacja §0 p. 7 jako testy CI (bez ANDES) + job `andes` (z ANDES); pełna regresja backendu; mypy; guardy (nowy
pakiet w `solver_boundary_guard`/`import_graph_guard`/`backend_no_physics_guard` — fizyka WOLNO tu, poza — nie);
złote hashe PF/SC bez zmian; meldunek UCZCIWOŚĆ z pomiarami błędów wyroczni.
