# KARTA K1 — DIAGNOSTYKA (READ-ONLY): KONWENCJA ZNAKU SHUNT / PRZEPŁYWÓW GAŁĘZI

**Typ:** karta DIAGNOSTYCZNA (eskalacja z D8, 2026-07-17) · **Wykonawca:** Opus ·
**Wiążące:** CLAUDE.md (Escalation: konflikt/fizyczna wątpliwość → analiza i raport,
ZERO zmian w solvers/enm bez osobnej decyzji; WHITE BOX).

## 1. Problem (obserwacja D8)
Materializowana bateria kondensatorów `ShuntSpec(b_pu=+Q/S_base)` podnosi napięcie
węzła (poprawnie), ale w konwencji przepływu gałęzi „przy punkcie przyłączenia"
jej wkład ma znak taki, że cosφ liczony z `p_from/q_from` gałęzi zasilającej
POGARSZA się dla typowego odbioru indukcyjnego — przeciwnie do fizycznej intuicji
kompensacji. Podejrzenie: (a) błąd znaku susceptancji shunt w torze ENM→solver,
LUB (b) poprawna fizyka + błędna interpretacja konwencji znaków `q_from/q_to`
w D8/obserwacji, LUB (c) niespójność konwencji między `bus_results` a `branch_results`.

## 2. Zadanie (READ-ONLY — bez zmian produkcyjnych)
1. Zbuduj MINIMALNY przypadek analityczny (2 węzły: slack + odbiór indukcyjny
   P=1 MW, Q=0,5 Mvar, jedna gałąź o znanej impedancji) i policz RĘCZNIE (w raporcie,
   krok po kroku WHITE BOX) oczekiwane przepływy i wpływ shuntu Q=0,5 Mvar przy
   odbiorze: Q gałęzi od slacka powinno spaść ~do 0, cosφ punktu → ~1.
2. Uruchom ten przypadek przez istniejącą ścieżkę (`_execute_power_flow` w pamięci,
   jak testy rodziny D) BEZ i Z shuntem; zestaw wyniki solvera z rachunkiem ręcznym:
   znaki `q_from/q_to`, `slack_q`, `u_pu`, wkład shuntu.
3. WERDYKT: która hipoteza (a/b/c) jest prawdziwa — z dowodem liczbowym. Jeżeli (a)
   lub (c): wskaż dokładne miejsce (plik:linia) i zaproponuj poprawkę W RAPORCIE
   (bez implementacji — decyzja o zmianie solvera/enm poza programem UI/UX). Jeżeli
   (b): wskaż poprawną interpretację i co poprawić w D8 (application — to wolno
   naprawić: przygotuj poprawkę D8 w osobnym commicie, testy na przypadku minimalnym).
4. Testy diagnostyczne zapisz jako NOWY plik `tests/application/analyses/
   test_diagnostyka_znaku_shunt.py` (dokumentują stan faktyczny — pass niezależnie
   od werdyktu, asertują zmierzone wartości z komentarzem interpretacyjnym).

## 3. Bramki
Pełny pytest ZERO failed (baza 5910); przy poprawce D8: jego testy zaktualizowane
z intencją; guardy jak rodzina D. Commit(y) BEZ push:
`test(diag): diagnostyka konwencji znaku shunt/przepływów (K1)` (+ ewent.
`fix(application): poprawna interpretacja znaków w doborze kompensacji (K1)`).
Raport z pełnym wywodem liczbowym i werdyktem a/b/c.
