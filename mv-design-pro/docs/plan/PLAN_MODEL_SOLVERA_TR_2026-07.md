# PLAN MODELU SOLVERA — TRANSFORMATOR (grupa polaczen / skladowa zerowa / K_T) 2026-07 — WIAZACY

Status: **WIAZACY**. Podstawa: recon D3 (V12K-162) skodyfikowal jawnie
ograniczenia produkcyjnych solverow w zakresie modelu transformatora
(docs/02-Solvers.md sekcja 5). Decyzja wlasciciela (2026-07-24): **twarde
zastosowanie korekcji + re-baseline goldenow** — priorytet zgodnosci
normatywnej (IEC 60909 / PowerFactory), nawet kosztem zmiany istniejacych
wartosci FROZEN. Program subordynowany kanonowi V12.xx.

## Luki (recon D3 — plik:linia w V12K-162)
1. **Przesuniecie fazowe grupy polaczen w PF** — vector_group niesiony
   end-to-end (branch.py:656), ale produkcyjny PF Newton (power_flow_newton_
   internal.py:716-745) modeluje wylacznie przekladnie odczepu; brak czlonu
   przesuniecia fazowego grupy. Skutek: katy wezlow za transformatorem nie
   uwzgledniaja przesuniecia Dyn/Yd (np. +30 st. dla Dyn11).
2. **Skladowa zerowa sterowana grupa (SC niesymetryczny)** — SC IEC 60909
   liczy wylacznie skladowa zgodna 3-fazowa; brak sciezki skladowej zerowej
   zaleznej od grupy (Dyn blokuje I0 od strony D, yn zapewnia sciezke
   uziemienia). Zwarcia niesymetryczne (1F, 2F-do-ziemi) nieobslugiwane.
3. **Korekcja K_T (IEC 60909 par. 3.3.3)** — SC uzywa impedancji nominalnej
   TR; brak wspolczynnika korekcyjnego K_T = 0,95 * c_max / (1 + 0,6 * x_T)
   dla transformatorow sieciowych. Skutek: Ik'' nieco zawyzony/zanizony
   wzgledem normy.

## Strategia (decyzja wlasciciela: TWARDE + RE-BASELINE)
- Korekcje zmieniajace istniejace wartosci FROZEN (K_T, przesuniecie fazowe)
  stosowane NA STALE — bez flagi opt-in. Zgodnosc z norma/PowerFactory jest
  celem nadrzednym.
- Kazda zmiana goldenow SC/PF wymaga DOWODU LICZBOWEGO: delta wartosci =
  dokladnie efekt zastosowanej korekcji (np. Ik''_new / Ik''_old =
  Z_nom / (K_T * Z_nom) = 1/K_T), udokumentowana w raporcie karty i widoczna
  dla wlasciciela. Zmiana bez dowodu = bug, nie re-baseline.
- WHITE BOX bezwzglednie: kazdy nowy czlon (K_T, kat grupy, macierz
  skladowej zerowej) widoczny w trace z jawnym wzorem i podstawieniem.
- Pliki chronione solverow (short_circuit_iec60909.py, power_flow_newton_
  internal.py) — zmiana wymaga jawnej SANKCJI w solver_boundary_guard +
  re-init solver_diff_guard (hasze referencyjne) w tym samym commicie.
- Determinizm zachowany: te same wejscia => te same (nowe) wyniki; seed/
  struktura payloadow bez zmian poza wartosciami liczbowymi objetymi korekcja.

## Fazy (zarzadca Fable, wykonawcy Opus)
- **SM-1 (K_T, IEC 60909 par. 3.3.3):** wspolczynnik korekcyjny impedancji
  TR sieciowego w SC; WHITE BOX (wzor + x_T + c_max + K_T w trace);
  re-baseline goldenow SC z dowodem delta = 1/K_T per transformator; sankcja
  guardow. Walidacja na kanonicznej sieci (recznie policzone K_T).
- **SM-2 (przesuniecie fazowe grupy w PF):** przekladnia zespolona
  t = |t| * e^{j*theta}, theta z grupy (Dyn11 -> +30 st. itd.) w galezi TR
  Y-bus; WHITE BOX (kat grupy w trace); re-baseline goldenow PF (katy wezlow
  za TR przesuniete o theta — dowod = zgodnosc z tabela grup); sankcja.
- **SM-3 (skladowa zerowa / SC niesymetryczny):** ADDYTYWNE (nowa zdolnosc,
  zero zmian istniejacych wynikow 3F) — macierz skladowych symetrycznych
  zalezna od grupy, zwarcia 1F i 2F-do-ziemi; nowy tor solvera + pakiet
  dowodowy; goldeny 3F NIETKNIETE. Najwiekszy zakres — po SM-1/SM-2.

## Kolejnosc i bramki
SM-1 -> SM-2 -> SM-3. Kazda faza: pelny pytest backendu zielony (z
re-baseline goldenow gdzie dotyczy), trace_determinism 0, solver_boundary/
solver_diff sankcjonowane i zielone, dowod liczbowy delty w rejestrze.
Konsumpcja przez analizy/raporty/eksporty sprawdzona (wartosci korekcji
splywaja do pakietow dowodowych i raportow PF/SC).
