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
| S7.6 kompresja pionowa | P1 | silnik: dosunięcie pasm/rzędów do minimalnych świateł, metryki przed/po | **ZAMKNIĘTA** (2026-07-23, `S7_GAP_CROSSING_ZERO_2026-07` §11: etykieta zejścia → pas pod magistralą; gap → MIN_SUBTREE_CLEARANCE; piony L1/L2 −14%, bbox-h −24%, bboxUtil +31%; wszystkie niezmienniki zielone) |
| GS-4b strona DER w kompozycji L1/L2 (faza W2) | P1 | `connectionSide==='sn'` ⇒ przyłącze SN; test kanoniczny | **ZAMKNIĘTA** (2026-07-23, W2/V12K): `compose/station.ts` rozdziela DER wg strony — `'sn'` ⇒ POLE ŹRÓDŁOWE od szyny SN (`#sn-source-descent`, odczep od `busAxisY` do portu AC symbolu, bez aparatu — `StationDerSourceInput` nie niesie `primaryDevices`, §12.5 zakaz domysłu), reszta (`'nn'`/`'unknown'`/brak) ⇒ rząd nN (dotąd). `measure.ts` parytet (`snSourceFieldsRowWidth`/wysokość pola źródłowego, `nnSideSources` do rzędu nN). Sieć referencyjna (0 źródeł SN) = NO-OP (3588 vitest zielone, kotwica L0/L1/L2 bez dryfu). Testy: `compose/__tests__/station.test.ts` (wariant A/B/mieszany/unknown+meta/no-nN/determinizm), `scene/__tests__/buildScene.w2GS4b.test.ts` (fixtura 20/20 nn L1/L2 + kotwica). Dowód: `docs/audit/visual/schemat-10/w2-l2-tor-der.png`. DŁUG JAWNY (odłożone, §10/§11 warstwa etykiet, wymaga świadomej wymiany baseline'ów): (a) relokacja etykiety napięcia szyny nN z pasma nazw DO szyny („przy szynie", §11/§17) — dziś §11 spełnione geometrią + opisem w pasmie nazw, przeniesienie churnuje baseline i dotyka delikatnej matematyki wysokości (rząd DER/strzałka odbioru/pasmo nazw); (b) kotwica pasma nazw §10 do bbox poddrzewa stacji zamiast pasma B5 współdzielonego per-wiersz — POMIAR: mediana luki pasmo↔blok ≈56px (max ≈160px, sonda renderowa), wynika z B5 ustawianego przez najwyższy blok wiersza; naprawa = per-stacja `nameSlot.y` z measure (LOD-niezależne ⇒ JEDNA KOTWICA zachowana), ale to zmiana silnika o szerokim promieniu determinizmu (klasa S7.6) — do dedykowanej karty layoutowej |
| Z3 oznaczenia aparatów z danych | P2 | realne designations pól albo dług jawny | **ZAMKNIĘTA** (2026-07-24, karta Z3 — patrz adnotacja §8 poniżej) |
| Z4 baner skryptów poza bbox | P2 | skrypty dowodowe (nie kanwa) | **ZAMKNIĘTA** (2026-07-24, karta Z4 — patrz adnotacja §7 poniżej) |

## 7. Adnotacja Z4 — domknięcie (2026-07-24)

Znalezisko Z4 (baner tytułowo-metryczny skryptów renderu leżący W POLU TREŚCI
arkusza) domknięte. Baner przeniesiono do STOPKI POD kanwą (poza bbox sceny),
wzorcem najświeższego skryptu `render_schemat10_s7p6.tsx` (zewnętrzny `<svg>` +
pas stopki `fill=CANVAS_BACKGROUND`, tekst w screen-space).

Przeniesione banery (skrypty `frontend/scripts/`): `render_schemat10_s1.tsx`,
`s2`, `s3`, `s4` (ekran + eksport), `s6`, `s7p1`, `s7p2`, `s7p3`, `gs1`
(blok pełnej sieci L0), `gs2` (blok pełnej sieci L0). Bloki „legend/detal"
(`gs1-l0-detal`, `gs2-l0-detal`) i skrypty explainer (`r1..r3`, `w1..w4`) mają
tytuł arkusza U GÓRY (nie baner nad sceną) — poza defektem, nietknięte.
`rasterize_s4_host.mjs` uczyniono świadomym stopki (`data-footer`): skala kadru
liczona z wysokości SCENY, więc scena zachowuje identyczną skalę.

Dowód niezmienności sceny: geometria SldCanvasV3/eksportu (blok
`<svg data-testid="sld-canvas-v3">`, po usunięciu chrome banera/stopki) jest
BAJT-IDENTYCZNA pre-edit vs post-edit dla każdego zmienionego skryptu
(np. s6-l0/s3-l1/s7p2-l0/s7p3-l2/gs1-l0/gs2-l0/s4-ekran/s4-eksport — porównanie
łańcuchów, 0 różnic). Zmienia się WYŁĄCZNIE pas stopki i wysokość arkusza
(+2·FOOTER w PNG, szerokość bez zmian).

Zregenerowane artefakty PNG (identyczne nazwy, scena niezmieniona, baner w
stopce): `s3-l{0,1,2}`, `s6-l{0,1,2}`, `s7p2-l{0,1,2}`, `s7p3-l{0,1,2}`,
`gs1-l0`, `gs2-l0`, `s4-ekran-l1` (15 plików; fixed-viewport SldCanvasV3,
kadr 1800×1100 camera-fit — wymiary bazowe zgodne z zacommitowanymi).

Odłożona regeneracja (DŁUG JAWNY, przyczyna niezależna od Z4): artefakty
o rozmiarze ŚWIATA sceny — `s1-l{0,1,2}`, `s2-l{0,1,2}` (CompositionPreview)
oraz `s4-eksport-l1` (kadr fit-do-treści) — mają zacommitowane PNG SPRZED
kompresji pionowej S7 (S7.6 ZAMKNIĘTA). Obecny kod renderuje scenę o realnie
innych wymiarach (np. s1-L0 14384px vs zacommitowane 2600px; s4-eksport kadr
14400×3553 vs ~14400×8256), więc ich regeneracja zmieniłaby SCENĘ poza samym
banerem — zgodnie z regułą Z4 („scena musi pozostać identyczna") wstrzymana.
Skrypty tych plików są jednak poprawione u źródła (baner w stopce), więc
regeneracja w środowisku referencyjnym da poprawne artefakty. `s7p1` — brak
zacommitowanego PNG, skrypt poprawiony (bez regeneracji).

## 8. Adnotacja Z3 — domknięcie (2026-07-24)

Znalezisko Z3 (oznaczenia aparatów L2 powtarzalne we wszystkich polach — „każde
pole Q1/QE1") domknięte wg zasady PRYMATU DANYCH nad konwencją (spec §12.1),
konwencja §19.1 jako FALLBACK. Zrealizowano end-to-end + domknięto dług W1c
(„katalogowe etykiety producenckie F1/TR nie realizują konwencji aparatu
identyfikowalnego"):

- **Priorytet rozstrzygania** (`compose/apparatusSequence.ts::apparatusIdentifiers`):
  (1) `BayPrimaryDevice.designation` — DANA per-aparat z packa/szablonu
  (backend `bay_templates.designation_q`: Q0/Q1/Q2/Q9/„F1"/„TR"…) wygrywa;
  (2) tożsamość pola (`Bay.designation`) renderowana OSOBNO jako etykieta pola
  + indeks konwencji per-aparat (razem „⟨pole⟩ + ⟨Q/QE/T⟩"); (3) czysta
  konwencja §19.1. **Unikalność w obrębie pola**: kolizja DANYCH ⇒
  deterministyczny sufiks „·k".
- **Dług W1c domknięty**: wyrocznia sceny `apparatusIdentifierGaps` (buildScene)
  rozpoznaje realne oznaczenia producenckie („F1"/„TR" — spoza wzorca §19.1)
  po `designationSource='dane'` (przeniesionym na etykietę `OwnedLabel`), zamiast
  zmuszać DANE do wzorca Q\d+/QE\d+/T\d+. Macierz W1c
  (`buildScene.w1cMatrixGen.test.ts`) wstrzykuje TERAZ realne designations z
  katalogu — dowód, że „F1"/„TR" renderują się z danych.
- **Geometria/kotwice NIETKNIĘTE**: glif priorytetu (2) NIE dostaje
  poszerzającego prefiksu pola (rezerwacja `apparatusIdentifierLeftReserve`
  liczona z konwencji, niezależna od danych — wariant prefiksu w glifie =
  jawny dług layoutowy). Bramki geometrii accept:sld-v3 bez dryfu baseline'ów.
- **Dowód wizualny**: `docs/audit/visual/schemat-10/z3-l2-oznaczenia.png` —
  to samo pole stacji L2 w wariancie Z DANYMI („Q1·F1·Q9", producenckie F1/Q9)
  vs FALLBACK KONWENCJI („Q1·QE1"); render produkcyjną kanwą `SldCanvasV3`.

## 9. Runda powykonawcza R2 — audyt POMIAROWY (2026-07-26)

Poprzednie sekcje oceniały schemat z oględzin wycinków 1:1. Ta runda dokłada
**pomiar na żywym renderze w przestrzeni EKRANU** — bo dokładnie tam mieszkały dwa
znaleziska, których oględziny wycinka nie mogły pokazać: wycinek 1:1 jest czytelny
z definicji, a pełny widok sieci nie.

Materiał: `docs/audit/visual/sld_audyt/sld_L{0,1,2}_{light,dark}.png`, generator
`frontend/e2e/sld-audyt-powykonawczy-screenshot.spec.ts` (bramki w spec: kanwa
niepusta, wymuszony LOD dotarł do kanwy, ≥52 stacje, zero błędów konsoli).
Pomiar: `getBoundingClientRect` po transformacji kamery, kadr 1920×1080.

### 9.1 Pomiar wyjściowy (HEAD przed rundą)

| Poziom | Elementów | Etykiet | Etykiet Q/QE/T | Etykiet < 6 px | Wykorzystanie kadru |
|---|---|---|---|---|---|
| L0 | 1 784 | 127 | 0 | 127 (100 %) | 96,0 % × 41,1 % |
| L1 | 7 862 | 1 031 | **171** | 1 031 (100 %) | 96,0 % × 42,0 % |
| L2 | 8 196 | 1 198 | 395 | 1 186 (99 %) | 96,0 % × 42,0 % |

### 9.2 Karta R2-A · identyfikatory aparatów o poziom za wcześnie — NAPRAWIONE

Kontrakt (`SLD_LOD_SPEC_OPERATOR_GRADE.md` §6) przypisuje identyfikatory aparatów
(`Q1`/`QE1`/`T1`) do pełnego detalu; L1 („sieć terenowa") ma nieść nazwy stacji, nazwy
sekcji GPZ i oznaczenia odpływów liczbowo. `buildBayStack` (`compose/station.ts`) nie
zna LOD i emitował je bezwarunkowo — L1 dostawał **171 etykiet Q ponad kontrakt**.

Skutek był mierzalny i dotykał sensu całej drabiny LOD: L1 i L2 różniły się o **4 %**
elementów (7 862 wobec 8 196). Kontrakt obiecuje trzy poziomy detalu, realnie działały
dwa — „sieć terenowa" była tak samo zatłoczona jak widok pól.

Naprawa: filtr w JEDYNYM punkcie wejścia etykiet do sceny (`resolveLabels`,
`buildScene.ts` §7), zawężony do identyfikatorów (`#apparatus-id-` w `ownerRef`) — nie
do całego `ownerKind:'apparatus'`, bo ten rodzaj jest **dzielony ze znacznikiem GPZ**
obecnym na L0. Szersze cięcie zdejmowało znacznik z mapy sieci; wersja pośrednia została
zmierzona i odrzucona (L0 traciło 1 element), zanim weszła do repozytorium. Kompozycja
stacji pozostaje nietknięta — ta sama geometria, te same porty — więc Acceptance
Invariant nr 6 jest zachowany wprost: zmienia się wyłącznie zbiór etykiet.

| Poziom | Elementów (było → jest) | Etykiet (było → jest) | Etykiet Q |
|---|---|---|---|
| L0 | 1 784 → **1 784** (bit-identyczny) | 127 → **127** | 0 |
| L1 | 7 862 → **7 072** (−10 %) | 1 031 → **636** (−396) | 171 → **0** |
| L2 | 8 196 → **8 196** (nietknięty) | 1 198 → **1 198** | 395 |

Rozróżnialność L1→L2 wzrosła z **+4 %** do **+16 %** elementów. Regresja
`src/ui/sld/v3` + `src/ui/sld/core`: **1399 passed, 0 failed**;
`sld_determinism_guards`: 0 naruszeń.

### 9.3 Karta R2-B · etykiety nieczytelne na pełnym widoku sieci — OTWARTA

100 % etykiet ma wysokość **2 px** na każdym poziomie detalu. Rysunek 52-stacyjny
wpasowany w kadr 1920 px daje skalę ≈ 0,17, więc tekst t3/t4 spada z kilkunastu
jednostek arkusza do 2 px ekranu.

Dlaczego nie wyłapały tego istniejące bramki: `declutterLabels` rozstrzyga kolizje w
przestrzeni ARKUSZA i na sieci wzorcowej jest tożsamością (0 kolizji na L0/L1/L2 —
komentarz `buildScene.ts` §3348). Arkusz jest ogromny, więc kolizji faktycznie nie ma.
Czytelność jest jednak własnością ekranu i żaden dotychczasowy pomiar jej nie sprawdzał.

Karta pozostaje OTWARTA, bo naprawa wymaga rozstrzygnięcia między trzema wykluczającymi
się kierunkami:
1. **declutter ekranowy** — etykieta poniżej progu czytelności jest UKRYWANA (zgodne ze
   spec §6, ale pełny widok sieci traci opisy),
2. **tekst w przestrzeni ekranu** — stały rozmiar niezależny od zoomu (czytelny zawsze,
   ale przy 52 stacjach zlewa się w plamę i łamie proporcje rysunku technicznego),
3. **wymuszony minimalny zoom** — pełna sieć nie jest pokazywana w jednym kadrze
   (uczciwe wobec czytelności, odbiera przegląd całości).

Rekomendacja audytu: kierunek 1 z progiem 6 px i jawnym wskaźnikiem „ukryto N opisów —
przybliż, aby zobaczyć"; tylko on nie łamie ani proporcji rysunku, ani przeglądu całości.
Decyzja należy do właściciela.

### 9.4 Karta R2-C · motyw jasny nie dotyczy kanwy — ZAMKNIĘTA jako decyzja projektowa

Zrzuty `light` i `dark` są wizualnie identyczne. Kanwa v3 ma stałe tło techniczne
(`SLD_V3_BACKGROUND`) — decyzja udokumentowana w `screenshot-harness-main.tsx` §46
(rysunek techniczny, nie UI reagujące na motyw), spójna z praktyką PowerFactory / ETAP
dla widoku SCADA.

Audyt nie kwalifikuje tego jako defektu implementacji, ale odnotowuje napięcie wobec
dyrektywy właściciela #8 (oględziny w obu motywach): dla dokumentacji projektowej i
wydruku standardem jest tło jasne. Jeśli SLD ma zasilać wydruk, potrzebny jest osobny
wariant arkuszowy — karta do rozstrzygnięcia przy eksporcie rysunku, nie tutaj.

### 9.5 Co runda potwierdziła jako poprawne

- **Acceptance Invariant nr 6** trzyma: L0/L1/L2 mają IDENTYCZNY layout, różnią się
  wyłącznie gęstością szczegółu (zero przesunięć geometrii między poziomami).
- **Hierarchia etykiet L0** jest respektowana: 0 numerów pól, 0 nazw stacji, obecne
  nazwy GPZ — dokładnie zakres spec §6 dla mapy sieci.
- **Wykorzystanie kadru 96 % × 41 %** nie jest defektem auto-fitu: rysunek sieci
  wzorcowej ma proporcję ≈ 4,06:1 wobec kadru 1,78:1, więc pasy nad i pod rysunkiem
  wynikają z zachowania proporcji. Rysunek jest wycentrowany symetrycznie.
- **Zero błędów konsoli** na wszystkich sześciu kadrach.

### 9.6 Dług zapisany z pomiarem

Czytelność etykiet nie ma dziś **bramki automatycznej** — guardy SLD mierzą arkusz, nie
ekran. Dopóki karta R2-B nie zostanie rozstrzygnięta, regresja czytelności jest
niewykrywalna w CI. Bramka ekranowa (próg wysokości tekstu) powstanie razem z naprawą
R2-B, bo dopiero wtedy będzie znany kontraktowy próg.

### 9.7 Runda R2b — kolizja dwóch kontraktów wyłapana przez CI

Pierwsze scalenie R2 przeszło regresję `src/ui/sld/v3` + `src/ui/sld/core` (1399 passed)
i guard `sld_determinism_guards`, ale **padło w CI** na `npm run accept:sld-v3`. Ten skrypt
akceptacyjny nie jest testem vitest i nie wchodzi w zakres żadnego katalogu testów —
został pominięty w weryfikacji lokalnej. Lekcja jest ogólna: **bramki workflowu trzeba
czytać z pliku workflowu**, a nie odtwarzać z pamięci o „testach warstwy".

Przyczyna była merytoryczna, nie techniczna — **dwa kontrakty mówiły co innego**:

- `SLD_LOD_SPEC_OPERATOR_GRADE.md` §6: identyfikatory aparatów należą do pełnego detalu,
- `apparatus_identifier_probe` §19.1: **każdy** uprawniony aparat niesie identyfikator.

Probe uruchamiał się dla `lod !== 0` — warunek dobrany do tego, gdzie istnieją SYMBOLE
aparatów (L0 = `stationCollapsed`, zero aparatów), podczas gdy mierzy ich ETYKIETY. Dopóki
etykiety były wszędzie, rozjazd był niewidoczny; naprawa R2-A go obnażyła (0 etykiet wobec
395 aparatów na L1).

Rozstrzygnięcie: intencja §19.1 zostaje bez zmian („każdy uprawniony aparat niesie
identyfikator funkcyjny ze znacznikiem konwencji"), przenosi się tylko poziom, na którym
da się ją sprawdzić — na L2. Do tego doszła **kontrola odwrotna** na L1: identyfikatorów
tam nie ma, symbole owszem. Bez tej pary powrót etykiet Q na „sieć terenową" byłby
niewykrywalny, bo probe §19.1 wtedy tylko by się ucieszył.

Przy okazji naprawiony licznik diagnostyczny nowej kontroli: pierwsza wersja pytała o
`meta.kind` (pola, którego symbole nie mają) i raportowała **0 aparatów przy 513
obecnych**. Asercja obok była poprawna, ale liczba w raporcie audytowym nie może kłamać —
licznik korzysta teraz z tej samej wyroczni „aparatu uprawnionego" co §19.1
(`elementKind` + znacznik `apparatusSource`).

Bramki workflowu `sld-determinism.yml` uruchomione lokalnie po naprawie, wszystkie zielone:
`sld_determinism_guards` (0 naruszeń), `layoutEngine.substrate`, `ViewportController`,
`LodPolicy`, `renderers`, `portAnchoredGeometry.substrate`, `StationInternalView`,
`SldCommandService`, `ports` (razem 185 passed) oraz `accept:sld-v3` (ALL PASS).
