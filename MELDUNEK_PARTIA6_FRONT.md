# Meldunek — karta PARTIA-6-FRONT (regresje frontu po scaleniu partii integracji 6)

Gałąź startowa: `claude/mv-design-pro-twin-audit-u4lhy0-wip-partia-6-p6d` (czubek `615f3b24`).
Gałąź wyniku: `claude/mv-design-pro-twin-audit-u4lhy0-karta-partia6-front`.
Maszyna pomiarowa: `nproc` = 4, obciążenie przy pomiarach wydajności 0,5–1,5 (podane przy każdej parze).

## 1. Wynik i dowód (najpierw)

| Pozycja | Stan | Dowód |
|---|---|---|
| 1. Menu budowy — `menuBudowyNaKanwie.test.tsx:430`, `:475`, sonda `menu_chain_probe LOD 0 stacji=0` | **Naprawione u źródła pomiaru** (produkt był poprawny) | plik 46/46 zielony; `npm run accept:sld-v3` RC 0, ALL PASS (419 PASS, 0 FAIL); iniekcja drugiej reguły → 3 testy czerwone + sonda FAIL |
| 2. `pathInvariants.test.ts:103` | **Nie moja** (karta SZYNY-STACJI-LUSTRO, drugi commit) — nietknięte | jedyny czerwony test w pełnym vitest (patrz §5) |
| 3. Budżety czasu budowy sceny — `buildScene.p1Recenzja.test.ts:271`, `buildScene.schemat10s7p6.test.ts:207` | **Naprawione u źródła (algorytm)**, budżety i asercje bez zmian | H ~530 czas procesora 3×LOD: 22,6 s → 4,5 s (budżet 30 s); scena i dane adaptera identyczne bit w bit na 44 modelach |
| Znalezisko uboczne: współrzędne wiązań końcówek odcinków z cudzego ciągu | **Naprawione** (osobny commit `67a2be0e`) | 108 ze 176 współrzędnych na sieci referencyjnej było złych; test czerwony na kodzie sprzed naprawy |

Commity (kolejność): `1b17dcfd` menu i scena w budowie · `41f3030a` wydajność · `67a2be0e` wiązania końcówek ·
`3b95cb52` test backendu sceny · `debb9fc6` odporność indeksu na elementy bez `id`, dług typów, komentarz speca.

## 2. Pozycja 1 — menu budowy na kanwie

**Przyczyna.** Produkt działa poprawnie: po regeneracji fikstur (POLE-ZAJĘTE) każde pole liniowe IN/OUT
53 stacji sieci referencyjnej niesie kabel (`widoki_logiczne_sld_substrate_52s.json`, `line_fields[].occupied`),
więc `resolveTrunkStartAvailability` → `buildSldOperationContext` (`ui/sld/shared/sldActionExecutor.ts:662`,
`:542`) nie znajduje punktu startu i menu blokuje „Prowadź ciąg dalej" z powodem
`powodBrakuStartuCiagu('station')` (`ui/sld/v2/command/SldCommandService.ts:219`). Test
(`menuBudowyNaKanwie.test.tsx`, dawne `:425` i `:451`) i sonda (`scripts/sld_v3_acceptance.mjs`, dawne
kryterium „≥ 15 stacji z wejściem" na LOD 0) mierzyły zdolność budowy na sieci GOTOWEJ — przed regeneracją
przechodziły tylko dzięki zaniżonej zajętości.

**Naprawa (pomiar przeniesiony na właściwy stan, produkt bez zmian):**
- Backend — budowniczy sceny w budowie `backend/tests/reference_networks/scena_ciagu_w_budowie.py`: GPZ
  i 0…15 stacji budowanych wyłącznie operacjami, które otwiera menu kanwy (`continue_trunk_segment_sn` z
  wolnego pola, `append_station_on_endpoint`); punkt startu każdego ogniwa wybiera backend z
  `enm/zajetosc_pol`. Generator `backend/scripts/eksport_fixtur_harnessu.py` (`ciag_w_budowie_etapy`) →
  fikstura `frontend/src/harness-fixtures/generated/ciag_w_budowie_etapy.json` (4,5 MB, 16 etapów;
  `--sprawdz` RC 0, objęta parametryzowanym testem świeżości i determinizmu `tests/ci/test_fixtury_harnessu.py`).
  Test backendu `tests/enm/test_scena_ciagu_w_budowie.py` (etapy, pole startu wolne OUT/FEEDER stacji startu,
  po ogniwie zajęte, ostatnia stacja ma jedno wolne OUT).
- Wspólny pomiar testu i sondy: `frontend/src/ui/sld/v3/canvas/__tests__/pomiarWejscBudowy.ts`
  (`stacjeZWejsciemKontynuacji` — ta sama funkcja w teście i w `menu_chain_probe`; `stacjeWgRoli` — role
  z topologii: GPZ, końcowa = stacja przy dalszym końcu ostatniego odcinka korytarza, środkowa).
- Test (`menuBudowyNaKanwie.test.tsx`): sieć GOTOWA × {środkowa, końcowa, GPZ na LOD 0} × {kontynuacja,
  odgałęzienie} → obie pozycje zablokowane z powodem, klik nie otwiera kreatora, `buildSldOperationContext`
  = `null`; pokrycie sieci gotowej: 0 stacji z wejściem kontynuacji, ≥ 15 odcinków. Sekcja E (scena W BUDOWIE):
  15 ogniw — na etapie k natywny prawy klik w stację startu, „Prowadź ciąg dalej" AKTYWNE, kreator dostaje
  `field_ref` = pole, z którego BACKEND zbudował etap k+1, `maStartOperacjiCiagu` = true; iloczyn
  {środkowa, końcowa, GPZ} × {kontynuacja, odgałęzienie} na etapie 15 (środkowa: kontynuacja z wolnego pola
  FEEDER wg kanonu „OUT przed FEEDER", odgałęzienie aktywne z `from_ref` = pole FEEDER; końcowa: kontynuacja
  z OUT, odgałęzienie aktywne; GPZ: kontynuacja z wolnego pola GPZ, odgałęzienie zablokowane z powodem).
- Sonda `menu_chain_probe`: sieć gotowa LOD 0 → 0 stacji z wejściem (uczciwa blokada); role gpz/końcowa/
  środkowa sieci gotowej (1/13/40 stacji) — 0 aktywnych kontynuacji; scena w budowie → 15 kolejnych ogniw
  (pole startu menu = pole startu backendu).
- Komentarz `frontend/e2e/s95-budowa-z-kanwy.spec.ts` (nagłówek) twierdził „53 stacje z realnym wejściem" —
  poprawiony na stan zmierzony.

**Iniekcja** (odwracalna, kod przywrócony `git checkout` pliku, `git diff --quiet` RC 0): w
`resolveTrunkStartAvailability` druga reguła dla stacji („ma start, gdy ma pole OUT", bez pytania kreatora)
→ `menuBudowyNaKanwie.test.tsx`: 3 czerwone (sieć gotowa: środkowa, końcowa; pokrycie 0 stacji), sonda:
`[FAIL] menu_chain_probe … LOD 0, sieć GOTOWA … stacji=53`. Granica uczciwości: sekcja E tej konkretnej
iniekcji nie łapie (na scenie w budowie reguła OUT i kreator zgadzają się dla stacji startu), łapie ją
sekcja B — dlatego iloczyn obejmuje obie sieci.

**Inwentarz klasy** („zdolność budowy mierzona na sieci gotowej"): `menuBudowyNaKanwie.test.tsx` dawne
`:425` i `:451` (przeniesione), `sld_v3_acceptance.mjs` `menu_chain_probe` (c) (przeniesiona), komentarz
`e2e/s95-budowa-z-kanwy.spec.ts:28-37` (poprawiony). Sprawdzone i poprawne (mierzą na własnych scenach z
backendu, nie na sieci gotowej): `ui/sld/shared/__tests__/punktStartuCiagu.test.tsx` (sceny
`punkt_startu_*`), sekcja D i S9-10 w `menuBudowyNaKanwie.test.tsx` (świeży GPZ, `punkt_startu_stacja_na_
odcinku_wolne_kilka`), sekcja B „LANCUCH" (odcinki — wejście „wstaw stację na odcinku" istnieje także na
sieci gotowej). Wpis w `docs/v12xx/REJESTR_KONFLIKTOW.md:362` (S95-START) i `docs/plan/PLAN_AB_…:559`
zawiera historyczną liczbę 53 — to zapis stanu z 2026-09-25, nie deklaracja bieżąca; nie zmieniany.

## 3. Pozycja 3 — wydajność budowy sceny

### Bisekcja (H ~530, suma czasu procesora L0+L1+L2, skrypt `buildSceneV3` na `synthLargeTrunk(52s, 10)`)

Każdy commit partii 6 mierzony na WŁASNEJ fiksturze i na fiksturze partii 6 (kod × dane).
Pomiar 13:39–13:49, obciążenie 0,7–1,8 na 4 CPU.

| Commit | kod + dane własne | kod + dane partii 6 |
|---|---|---|
| `a2ab18fc` (baza, = main) | 12,0 s | 16,2 s |
| `85f49af6` POLE-ZAJĘTE | 11,4 s | 15,1 s |
| `6cc1b547` POLA-W-TORZE | **19,6 s** | 24,6 s |
| `5512cedd` DOWOD-CIEPLNY | 19,6 s | 24,1 s |
| `7f08ecea` ODMOWA-DANYCH-422 | 19,8 s | 24,8 s |
| `9dbc8ee7` fikstury z generatorów | 19,9 s (dane już nowe) | 25,3 s |
| `3c246c08` SLD-SUBSTRAT | **28,8 s** | 30,0 s |
| `1c7cadc4` regeneracja | 28,6 s | 28,9 s |
| `615f3b24` SZYNY-STACJI-LUSTRO | 25,5 s | — |

Wniosek: wzrost wniosły **oba** czynniki — dane (model ~1,7×: +35% na kodzie bazy) i kod: POLA-W-TORZE
(+65%: `szynyStacji` z przeglądem gałęzi aparatów pól nN wołane per stacja) i SLD-SUBSTRAT (+20%:
`elementyToru.punktSzyny` przegląda wszystkie gałęzie dla każdego łącznika — łączników przybyło 171 → 370
na kopię z migracji aparatów pól nN).

### Miejsca nadliniowe (plik:linia na drzewie wyniku; złożoność przed → po)

S = stacje, B = gałęzie, Bus = szyny, F = pola stacji, Sw = łączniki, P = ścieżki odcinków.

1. `ui/shared/szynyStacji.ts:59` `szynyStacji` — przegląd WSZYSTKICH gałęzi dla każdej stacji z polami nN,
   więc `stacjaSzyn` (`:97`, wołana ~10× na budowę) i każda pętla po stacjach: O(S·B) → O(S·F + B) przez
   `indeksGaleziPolNn` (`:24`, raz na tablicę gałęzi, kolejność wyniku zachowana). Wpięcie w KAŻDĄ pętlę
   po stacjach (klasa, 11 miejsc): `stationTransformerSelection.ts`, `stationBusResolution.ts`,
   `SupplyPathHighlighter.ts`, `topologyInputReader.ts`, `enmToSldAdapter.ts` (3 miejsca), `kompletnoscRysunku.ts`,
   `exportModelData.ts` (2), `forms/enmResolvers.ts`, `ui2/wyniki/zwarcia/aparatura/model.ts`,
   `SnSegmentSurface.tsx`, `screenshot-harness-main.tsx`. Poza klasą świadomie: wywołania dla JEDNEJ stacji
   (inspektory, kreatory, GPZ) — O(B) raz, nie w pętli.
2. `ui/sld/v3/scene/elementyToru.ts:93` `punktSzyny` + `odcinkiWchodzace/Wychodzace` — O(Sw·B) → O(Sw + B)
   (indeks szyna → odcinki w porządku `ref_id`).
3. `ui/sld/v2/canvas/enmToSldAdapter.ts` `buildStationMiniBlockDetails` — mapy szyn i gałęzi, szyny stacji,
   wybór transformatorów (`selectStationTransformerUnits`: mapa napięć wszystkich szyn, transformatory
   blokowe DER, klasyfikacja wszystkich transformatorów) liczone per stacja: O(S·(Bus+B+T+G)) → kontekst
   migawki raz na budowę (`kontekstStacjiMigawki`, `KontekstWyboruTransformatorow`).
4. `enmToSldAdapter.ts` końcówki gałęzi — `busExists`, `readBusVoltageKv`/`isMediumVoltageNetworkBranch`,
   `classifyTerminalElementType`, `resolveOriginBayTerminalBusRef` (filtr wszystkich szyn i gałęzi po
   prefiksie), `hasConnectedContinuationAtEndpoint`: O(B·(Bus+B)) → `IndeksSzynMigawki`, `IndeksKoncowek`
   (mapy po refie, indeks prefiksów przed „/", odcinki SN przy szynie) — semantyka „pierwszy w kolejności
   migawki" zachowana.
5. `findSegmentEndpointPoint` — O(końcówki·P) → indeks ścieżek odcinków (zmiana semantyki = znalezisko §4).

Pozostałe zmierzone ilorazy k10/k5 > 2 (`interiorCrossings`, `resolveTeeJunctions`, `buildOrphanSegmentRefs`)
dają łącznie < 1 s na H ~530 — nie naprawiane w tej karcie; iloraz całości po naprawie 2,08 (liniowy).

### Profil faz przed / po (H ~530, L2, `node --cpu-prof`, czas włączny, ten sam tryb pomiaru)

| Faza | przed (13:37) | po (15:22) |
|---|---|---|
| `buildSceneV3` | 16,8 s | 4,1 s |
| `buildSldDataFromSnapshot` | 12,2 s | 2,2 s |
| `buildStations` / `buildStationMiniBlockDetails` | 5,2 s / 4,3 s | 0,6 s / 0,4 s |
| `stacjaSzyn` / `szynyStacji` | 4,5 s / 4,4 s | poza 60 najdroższymi funkcjami profilu |
| `elementyToru` (w tym `punktSzyny`) | 2,7 s (2,2 s) | poza 60 najdroższymi |
| `buildTerminalBindings` | 1,2 s | poza 60 najdroższymi |

### Czas procesora, para przed/po na tej samej maszynie

Test `buildScene.p1Recenzja.test.ts` (3×LOD, budżety bez zmian):

| H | przed (13:36, obc. 1,1) | po (14:08, obc. ≈1,0) | budżet |
|---|---|---|---|
| ~106 | 1462 ms (L0 415 / L1 554 / L2 494) | 604 ms (164 / 230 / 210); pełny bieg: 629 ms | 5000 ms |
| ~265 | 5146 ms (1722 / 1779 / 1644) | 2220 ms (498 / 725 / 997); pełny bieg: 1914 ms | 12000 ms |
| ~530 | 22598 ms (6834 / 7514 / 8250) | 4513 ms (1168 / 1675 / 1670); pełny bieg: 4798 ms | 30000 ms |

Skrypt profilu (bez vitest): ~530 L0+L1+L2 24,4 s → 18,0 s (pozycje 1–2) → 11,2 s (3) → 8,0 s (klasa 1)
→ 5,5 s (4); iloraz 530/265: 3,3 → 2,08. Stan końcowy (`debb9fc6`, 15:22, obc. 1,2): 106 / 265 / 530 =
1,2 / 2,9 / 6,1 s.

### Równość bit w bit

Pełny `JSON.stringify` danych adaptera (`buildSldDataFromSnapshot`) i sceny L0/L1/L2 porównany z drzewem
`615f3b24` na 44 modelach (H ×1/×2/×5/×10, wszystkie `*.enm.json` w `frontend/src`, 16 etapów ciągu w budowie):
identyczne po commicie wydajności (`diff` RC 0); ponownie potwierdzone na końcowym `debb9fc6`. Po commicie §4 zmienia się WYŁĄCZNIE `terminalBindings`
(x/y), scena v3 identyczna na wszystkich 44 × 3. Sygnatury scen w testach i złote pliki SLD zielone
(pełny vitest, `accept:sld-v3`).

## 4. Znalezisko uboczne — wiązania końcówek odcinków

`enmToSldAdapter.ts` `findSegmentEndpointPoint`: przy braku ścieżki odcinka w ciągu brał ścieżkę CAŁEGO
pierwszego ciągu z niepustą ścieżką — każdy odcinek spoza pierwszego ciągu dostawał końce cudzego ciągu
(sieć referencyjna: 108 ze 176 współrzędnych `terminalBindings`). Reguła po naprawie: ścieżka odcinka z
ciągu, który go niesie; ciąg bez ścieżek odcinków — ścieżka ciągu, gdy `segmentRefs` zawiera odcinek;
inaczej brak punktu. Test `ui/sld/v2/canvas/__tests__/enmToSldAdapter.koncowkiOdcinkow.test.ts`
({pierwszy / dalszy ciąg} × {A / B}) — czerwony na `615f3b24` (2 z 3), zielony po. Konsumenci: znaczniki
punktów rozgałęzienia korzystają z tej samej funkcji — ich wynik na wszystkich modelach bez zmian (ich
odcinki leżały w pierwszym trafionym ciągu); rysunek v3 nie czyta `terminalBindings`.
Granica: gałąź „ciąg bez ścieżek odcinków" nie występuje w dzisiejszych danych adaptera — reguła
zachowana, bez testu na danych (brak takiego ciągu w żadnym modelu).

## 5. Weryfikacja (kody wyjścia łapane bezpośrednio)

- Pełny vitest (`npm test`, `--no-file-parallelism`, bieg na `debb9fc6`): RC 1 — 886/887 plików,
  13 005 passed, 1 failed, 14 todo; jedyny czerwony: `ui/sld/v3/electrical/__tests__/pathInvariants.test.ts:103`
  (pozycja 2, nie moja). Budżety w tym biegu: H ~106/265/530 = 629 / 1914 / 4798 ms (budżety 5000/12000/30000).
  Wcześniejszy bieg na `67a2be0e` ujawnił moją regresję (4 pliki: modele testowe bez `id` elementu →
  wyjątek w indeksie prefiksów) — naprawiona w `debb9fc6`, potwierdzona tym biegiem.
- `npm run type-check` RC 0; `npm run lint` RC 0.
- `poetry run python ../scripts/guardy_z_ci.py` (z `backend/`, bieg na `debb9fc6`): RC 0, „KOMPLET ZIELONY",
  106/106 guardów, samotesty guardów 3332 passed. (Bieg wcześniejszy: czerwone `tsconfig_gate_guard` 83 > 80
  i black/ruff nowego pliku — oba naprawione.)
- `tsc` pełnego zbioru (zasięg `tsconfig_gate_guard`): 83 → 80 błędów poza bramką (budżet 80) — dwa błędy
  w moich nowych plikach testów i jeden zastany (`szynyStacjiKonsumenci.test.ts:214`, TS2532) naprawione.
- Kroki `.github/workflows/sld-determinism.yml`: `sld_determinism_guards.py` RC 0, `sld_lod_continuity_guard.py`
  RC 0, pliki vitest kroków — w pełnym biegu; `npm run accept:sld-v3` RC 0, ALL PASS (419 PASS, 0 FAIL).
- Backend: `tests/enm/test_scena_ciagu_w_budowie.py` + `tests/ci/test_fixtury_harnessu.py -k ciag…` 25 passed;
  `eksport_fixtur_harnessu.py --sprawdz --tylko ciag_w_budowie_etapy` RC 0; ruff/black czyste.
- E2E (realny backend, `scripts/playwright-run.mjs`, speki `s95-budowa-z-kanwy`, `wyspy-menu-sld`,
  `s913-porownanie-z-kanwy`, `s95-zrzuty-screenshot`): bieg 1 — RC 1, 6 passed, 1 failed
  (`s95-budowa-z-kanwy.spec.ts:348`, ogniwo 4: menu dalszej połówki odcinka bez pozycji
  `continue-trunk-from-endpoint` — pozycji w ogóle nie było w menu, nie była wyłączona); bieg 2 tego samego
  zestawu — RC 0, 7 passed; pełny cykl osobno — RC 0; `--repeat-each=5` — RC 0, 5 passed. Na drzewie bazowym
  `615f3b24`: pełny cykl RC 0, zestaw 4 speków RC 0 (7 passed). **Niewyjaśnione:** 1 porażka na 8 wykonań
  tego testu na drzewie wyniku, 0 na 2 na bazie; artefakty (zrzut, kontekst błędu) pierwszego biegu zostały
  nadpisane kolejnymi biegami, więc przyczyny nie zmierzyłem. Zmiany karty nie dotykają rejestru menu ani
  rozstrzygania tematu menu (`canvasMenuSubject`); brak pozycji oznacza menu innej kategorii (trafienie w inny
  obiekt albo scena sprzed odświeżenia po ogniwie 3). Nie oznaczam tego jako niestabilności — to otwarta
  pozycja do pomiaru z zachowanymi artefaktami. Spec zrzutów nadpisuje zatwierdzone PNG w
  `docs/sld/audyt-2026-08/` — przywrócone `git checkout`, nie wchodzą do commitów.

## 6. Zrzuty (materiał B-02 — bez werdyktu wykonawcy)

`mv-design-pro/docs/audit/visual/partia6_front/sld52_L{0,1,2}_{dark,light}_{przed,po}.png` — harness
`screenshot-harness.html` (sieć referencyjna) z drzewa `615f3b24` (przed) i z drzewa wyniku (po), 1600×900.
Sześć par jest bajtowo identycznych (`cmp` RC 0) — zgodnie z wymaganiem „zmiana sceny przy naprawie
wydajności jest defektem naprawy". Menu kanwy na scenie w budowie nie ma zrzutu: harness nie renderuje menu
ani nie przyjmuje migawek z etapów ciągu (dowodem jest natywny prawy klik w vitest i sonda).

## 7. Czego nie zrobiono

- Pozycja 2 (`pathInvariants.test.ts:103`) — z przydziału karty należy do SZYNY-STACJI-LUSTRO.
- Dług `S9-5-DLUG-E2E-PETLA` (pętla 15 kreatorów w e2e na żywym backendzie) nie domknięty: kryterium 15 ogniw
  dowodzą vitest (natywny prawy klik, pole startu kreatora = pole backendu) i sonda; spec e2e dowodzi cyklu.
- Nadliniowości < 1 s łącznie (`interiorCrossings`, `resolveTeeJunctions`) — zmierzone, nie naprawiane.
