# AUDYT POWYKONAWCZY SLD — zespół ekspercki (2026-07-23) — WIĄŻĄCY

Status: **WIĄŻĄCY — warunek odbioru SLD** (dyrektywa właściciela 2026-07-23:
„SLD brak odbioru bez audytu ekranów — daj ekrany i sporządź audyt
powykonawczy zespołu ekspertów i poprawiaj").

Przedmiot: stan po scaleniu programów SCHEMAT-10 S1–S8, GS-1…GS-5, P1 recenzji
(HEAD `cd9ed04a`). Materiał dowodowy: świeże renders żywej kanwy na HEAD —
`docs/audit/visual/schemat-10/aud-head-l{0,1,2}.png` (pełna sieć 53 stacje,
3600×2200) + kadry detali `s5-zoom-{1..6}.png` (L0→L2 ta sama stacja) +
`gs5-l0-detal.png` (legenda gramatyki). Oględziny wykonane na wycinkach 1:1.

## 1. Soczewka: projektant sieci SN (treść schematu)

USTALENIA POZYTYWNE:
- Pola stacji nazwane i kompletne na L2: „pole liniowe"/„pole
  transformatorowe", aparaty Q1/QE1 (rozłącznik, uziemnik), sekcja z napięciem
  („Sekcja 1 · 15 kV"), kierunki przęseł („Magistrala 01 · kier. GPZ/S02",
  „Odgałęzienie SN kablowe · odg. S31"), przęsła z typem i długością
  („YAKXS 3×120/16 · 105 m", „Linia napowietrzna Al 120 mm² · 80 m").
- Etykieta stacji: nazwa, kod, moc TR, typ topologiczny („stacja odgałęźna"),
  szyna nN 0,4 kV, zagregowany odbiór ΣP/ΣQ — komplet inżynierski.
- **GS-4 potwierdzony na L2** (kadr s5-zoom-3): PV 500 kW narysowane ZA
  transformatorem (gałąź nN, obok strzałki odbioru), nie od szyny SN.

ZNALEZISKA:
- **Z2 (P1, LUKA LUSTRZANA GS-4 na L1/L2):** kompozycja stacji
  (`compose/station.ts` ~1221–1231) zaczepia KAŻDE źródło z `derSources` do
  punktu nN (`nnBusPoint ?? lvPorts[0]`) — pole `connectionSide` (GS-4) NIE
  jest konsumowane. Dla sieci referencyjnej (20/20 DER na nN) obraz jest
  poprawny, ale źródło przyłączone do szyny SN stacji zostałoby narysowane ZA
  transformatorem — kłamstwo topologiczne w drugą stronę niż to, które
  naprawiło GS-4 na L0. Wymóg: `connectionSide==='sn'` ⇒ przyłącze do szyny
  SN (własne pole/odczep), `'nn'`/`'unknown'` ⇒ jak dziś; test kanoniczny
  z syntetycznym źródłem SN. KARTA GS-4b.
- **Z3 (P2):** oznaczenia aparatów powtarzalne we wszystkich polach
  (każde pole „Q1"/„QE1"). Jeśli ENM/bays niosą realne oznaczenia pól
  (designation z szablonów producenta), rysować realne; jeśli nie —
  numeracja NIE może być fabrykowana (dług jawny do decyzji danych).

## 2. Soczewka: kartografia/layout (wykorzystanie arkusza)

- **Z1 (P1, NAJWIĘKSZA DŹWIGNIA WIZUALNA):** pustka arkusza. Pomiar
  (local_density_probe, V12K-140): L1 średnia gęstość okien 1,8%, pustka
  79,7%; na oględzinach — bardzo długie PUSTE piony między magistralą a
  rzędami lateralnymi (setki px bez treści) i duże pasy pustki między
  rzędami. Wiersze lateralne mogą być dosunięte pionowo do minimalnego
  światła poddrzew (M-02 + MIN_SUBTREE_CLEARANCE) bez zmiany topologii ani
  kolejności. KARTA S7.6 (silnik: kompresja pionowa pasm/rzędów, twarde
  niezmienniki: crossings=0, kolizje=0, M-02, JEDNA KOTWICA, kolejność
  aparatów; metryki przed/po: Σpionów↓, pustka↓, bboxUtilization↑).
- Z5 (obserwacja, decyzja po pomiarze): odstępy stacji w wierszu przy
  krótkich etykietach dają luźny obraz — rozstaw JEST footprint-driven
  (dowód V12K-140 P1.2), więc ewentualne zacieśnienie = zmiana STAŁYCH
  świateł (clearances.ts), nie reguły; wymaga decyzji progu po pomiarze
  bazy gęstości (nie zgadywać wartości).

## 3. Soczewka: SCADA/UX (nawigacja, LOD)

- Histereza LOD + crossfade + ciągłość selekcji dostarczone i dowiedzione
  liczbami (V12K-141); wskaźnik LOD obecny; JEDNA KOTWICA potwierdzona
  kadrami zoomu (rect 552,648,864 identyczny L0/L1/L2).
- Z4 (P2, artefakt dowodów, nie kanwy): baner tytułowo-metryczny skryptów
  renderu leży w polu treści arkusza (kadr L1, lewa strona) — w skryptach
  dowodowych przenieść baner poza bbox treści (stopka), żeby PNG do oceny
  nie sugerował kolizji, której kanwa nie ma.

## 4. Soczewka: zgodność z kanonem (macierz LOD, gramatyka)

- Sylwetki L0 wg GS-5: 12/12 stacji końcowych bez fantomowego pola WY
  (dowód DOM na produkcyjnym SVG), 12/12 odgałęźnych z węzłem; rozkład ról
  29/12/12 przybity testem.
- crossings=0 na wszystkich LOD (sonda + oględziny — jedyne styki torów to
  węzły T z kropką); zero kolizji etykiet (wyrocznie S2).
- Macierz parytetu funkcji 11/11 z dowodami (V12K-142).

## 5. Oceny powykonawcze (skala recenzji eksperckiej)

| Obszar | Ocena | Uzasadnienie |
|---|---|---|
| Topologia i treść inżynierska | 9/10 | komplet pól/aparatów/przęseł/kierunków; Z3 drobny |
| Gramatyka LOD (L0–L2, kotwica) | 9/10 | GS-1..5 dowiedzione; Z2 lustrzana luka warunkowa |
| Wykorzystanie arkusza | 6/10 | pustka ~80%, długie puste piony (Z1) |
| Nawigacja/zoom (UX) | 8,5/10 | histereza+crossfade+kotwica; bez zastrzeżeń oględzin |
| Determinizm/dowodliwość | 10/10 | sondy, goldeny, macierz parytetu, DOM-dowody |

Werdykt zespołu: **ODBIÓR WARUNKOWY** — warunkiem pełnego odbioru jest
domknięcie Z1 (karta S7.6) i Z2 (karta GS-4b); Z3/Z4 jako karty P2.

AKTUALIZACJA 2026-07-23: po oględzinach ekranów właściciel wydał pełną
recenzję warstwy inżynierskiej L2 z werdyktem **NIE ZATWIERDZAĆ** —
`RECENZJA_L2_POLA_WYPOSAZENIE_2026-07.md` (WIĄŻĄCA, program W1–W5,
V12K-145) jest NADRZĘDNA nad niniejszym werdyktem warunkowym; karta GS-4b
(Z2) zaabsorbowana przez fazę W2 recenzji.

## 6. Rejestr kart poprawkowych

| Karta | Priorytet | Zakres | Status |
|---|---|---|---|
| S7.6 kompresja pionowa | P1 | silnik: dosunięcie pasm/rzędów do minimalnych świateł, metryki przed/po | ZLECONA (Opus) |
| GS-4b strona DER w kompozycji L1/L2 | P1 | `connectionSide==='sn'` ⇒ przyłącze SN; test kanoniczny | DO ZLECENIA (po S7.6/F-E8.3) |
| Z3 oznaczenia aparatów z danych | P2 | realne designations pól albo dług jawny | DO ZLECENIA |
| Z4 baner skryptów poza bbox | P2 | skrypty dowodowe (nie kanwa) | DO ZLECENIA |
