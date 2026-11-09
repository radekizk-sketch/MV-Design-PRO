# SLD-CZYTELNOSC-INSPEKTOR — czytelność schematu stacji SN i inspektora pola (2026-11-09)

Karta wykonawcza (UX-04 / UX-03, `PLANS.md` część A §C.1), bez własnego statusu. Werdykt
wizualny wystawia właściciel (bramka B-02) — ten dokument niesie pomiar, zrzuty i ustalenia,
NIE werdykt i NIE deklarację zgodności z normą ani ze standardem operatora.

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-sld-inspektor-czytelnosc`, baza
`claude/mv-design-pro-twin-audit-u4lhy0-karta-bkr` @ `29220847a`.

## 1. Wybór bazy (dowód z zawartości, nie z nazwy)

| Kandydat | Czubek | Zawartość istotna dla karty | Decyzja |
|---|---|---|---|
| `…-u4lhy0` (gałąź sesji) | `6b2e582f` 2026-10-30 | wyłącznie wiersze `PLANS.md` §C | nie — brak kodu |
| PR #506 `…-uiux-integracja-wip` | `655c19af` 2026-11-04 | ZU (składowa zerowa), LoM, standard KD6; bramka czerwona wg opisu PR (pytest 1 failed, vitest 1 niestabilny, e2e 22 failed) | nie — brak pracy nad inspektorem pola i brak zrzutów 340 px |
| `…-karta-bkr` | `29220847a` 2026-11-05 | commity 14–17 karty INSPEKTOR-POLA-DOMKNIECIE (karta K6 stacji/pola, tabela aparatów bez przewijania przy 340 px, zrzuty `docs/uiux/zrzuty/k6-inspektor/gpz-pole-aparaty-340-*.png`), reguła W049 | **TAK** — stan zawierający pracę ze zrzutu |
| `…-karta-pole-liniowe` | `9dafb608` 2026-11-04 | wzorzec pola liniowego GPZ wg ENEA Z.10/Z.11/Z.11.1 (renderer, szablony, QET), 26 commitów od `687a2ef6` | nie jako baza — patrz §5 |

`karta-bkr` i `karta-pole-liniowe` rozchodzą się od `687a2ef65` (28 i 26 commitów); próba
`git merge --no-commit` daje **56 plików w konflikcie** (m.in. `buildScene.ts`,
`SldCanvasV3.tsx`, `domain_operations.py`, `tor_pola.py`, `KartaTechnicznaElementu.tsx`).
Scalenie obu linii to osobna praca integratora — nie mieści się w tej karcie i nie było
jej zadaniem.

## 2. Wykonane (kod, z dowodem)

### 2.1. Kropka węzłowa wyłącznie przy rzeczywistym węźle modelu (uwaga audytowa właściciela)

Pomiar na sieci kadrów stacji (`e2e/siecKadrowStacji.ts`, realny backend), kadr „Stacja
Odgałęźna”, przed zmianą: odejście odgałęzienia z pola F04 (`Odgałęzienie 1`) biegło poziomo
na `y = 504`, kabel ciągu z pola F02 (`Odcinek 1 (2)`) na `y = 512` — **8 j.św. od siebie**;
w punkcie `(1608, 512)` pion odgałęzienia przecinał kabel ciągu, a `resolveTeeJunctions`
rozcinał kabel i stawiał **kropkę węzłową** (`sld-v3-wezel-t-1608-512`) — rysunek łączył dwa
obwody za wyłącznikami obu pól. Na fiksturze referencyjnej (52 stacje) takich kropek było
**18/18** (sonda: każda para to kabel `terminal/001 → terminal/000` × odgałęzienie z innego
pola, bez wspólnego węzła w modelu).

Zmiana (`scene/buildScene.ts`): węzeł T powstaje tylko, gdy oba kable mają w modelu wspólny
węzeł (`from_bus_ref`/`to_bus_ref`, `kableZeWspolnymWezlem`). Skrzyżowanie bez wspólnego
węzła zostaje skrzyżowaniem i dostaje **mostek półłukowy** (pion przeskakuje poziom,
`polylinePathWithBridges`, §22.1). Kabel bez rekordu w modelu (ref złożony) zachowuje
dotychczasową regułę.

Początki i końce obwodów zweryfikowane na zrzucie po zmianie: `Odcinek 1 (2)` jest JEDNYM
ciągłym odcinkiem `F02 → korytarz → kanał powrotny` (bez cięcia `#tee-1`), `Odgałęzienie 1`
biegnie `F04 → stripTopY → kanał → mostek nad kablem ciągu → stacja końcowa odgałęzienia`;
0 kropek na skrzyżowaniach, kropki wyłącznie na odczepach lateralnych pól (dane odgałęzienia).

### 2.2. Rozsunięcie korytarza ciągu od odejścia odgałęzienia

`TRUNK_CORRIDOR_SUBLEVEL = 3×GRID` (dawniej `GRID`), `DESCENT_STRIP_HEIGHT = 8×GRID`
(dawniej 6×GRID). Odejście odgałęzienia i kabel ciągu: **24 j.św.** od siebie zamiast 8.
Koszt mierzony na fiksturze referencyjnej: piony `23168/46400/46400 → 23824/48960/48960`
(41 / 160 pionów × 16); rozstrzygnięcie: czytelność przed minimalizacją pionów (spec §15.1
„ograniczenie miękkie”, precedens F9.10/F10.3). Blok stacji, pola, aparaty i transformator
nie przesuwają się (`blockTopY` nietknięty).

### 2.3. Łuk mostka w eksporcie DXF/PDF

`export/svgPrimitives.ts`: komenda `A`/`a` (łuk eliptyczny, SVG 1.1 §F.6.5, parametryzacja
przez środek) spłaszczana na 8 cięciw. Do tej karty eksport rzucał „nieobsługiwana komenda
ścieżki A” — nigdy nie spotkał mostka, bo każde przecięcie zamieniano w węzeł T
(10 czerwonych testów `formatyEksportu` po zmianie 2.1 — naprawione u źródła).

### 2.4. Inspektor pola

- Nagłówek inspektora i drzewo projektu bez powtórzonego rodzaju (`rodzajObokNazwy`,
  `ui/shared/opisBezPowtorzen.ts`): „Pole: Pole odgałęźne 3” → „Pole odgałęźne 3”;
  „Stacja odgałęźna: Stacja Odgałęźna” → „Stacja Odgałęźna”; drzewo „Stacja … · stacja
  odgałęź…” (oba człony ucięte) → „Stacja Odgałęźna”. Parytet nagłówek = drzewo zachowany
  (test `naglowekJakDrzewo`, nowy wariant nazwy zaczynającej się rodzajem).
- Pole wskazane własnym refem (sylwetka pola wolnego, wiersz drzewa): „Położenie łącznika
  (model)” z aparatu głównego pola — ten sam wybór co kolumna „Stan” tabeli pól karty stacji
  (`refAparatuGlownegoPola`). Przed zmianą karta stacji mówiła „zamknięty”, a karta tego
  samego pola „brak stanu w modelu”. Pole bez żadnego łącznika w modelu: sekcja stanu
  nie jest rysowana (pięć wierszy „brak” czytało się jak luka danych aparatu, którego nie ma).

### 2.5. Spec zrzutów i sondy

`e2e/sld-czytelnosc-zrzuty.spec.ts`: pełna sieć, stacja, pole, inspektor 340 px, GPZ ×
{1440×900, 1600×900} × {ciemny, jasny}, pomiar etykiet uciętych krawędzią kanwy
(0 na kadrach stacji i pola; 1 — „Źródło GPZ 15 kV” — przy 1600×900 po zbliżeniu kółkiem na
pole, poza celem kadru) i tabeli aparatów bez przewijania przy 340 px. Zrzuty biegu
(materiał B-02, bez werdyktu) w `test-results/zrzuty-dokumentacji/…/sld-czytelnosc/`;
PNG nie są w tym commicie (gałąź wypchnięta narzędziem bez zapisu plików binarnych —
patrz §6).

## 3. Weryfikacja

| Bieg | Wynik |
|---|---|
| `vitest run src/ui/sld/v3` | 149 plików passed, 1 skipped; 3552 testów passed |
| vitest inspektor/drzewo/karty (`network-build/inspektor-elementu`, `shared`, `sld/shared`, `shell/context-panels`, `InspectorEngineeringView.switch-branch`) | 62 plików, 3128 testów passed |
| `npm run accept:sld-v3` | rc=0, 426 PASS (FAIL zastany `menu_chain_probe` S95-START naprawiony: sonda podawała klucz `apparatusKind`, którego kontekst menu nie zna — `aparatWyprowadzaCiag`) |
| `tsc --noEmit`, eslint zmienionych plików | 0 błędów |
| e2e `sld-czytelnosc-zrzuty.spec.ts` (realny backend, Chromium 153 spoza Playwrighta) | 1 passed, 43 s |

18 czerwonych testów po pierwszej iteracji zmiany 2.1/2.2 — wyjaśnienie i naprawa:
10 × `formatyEksportu` (łuk `A` w eksporcie — §2.3), 2 × `crossings.test` (kontrakt „0 sn×sn”
pinował 18 fałszywych kropek — przepisany na „skrzyżowania wyłącznie bez wspólnego węzła”),
2 × `sheetRows` (to samo), 2 × odciski `tr2wBezPola` (korytarz 16 niżej — przegenerowane
z atrybucją), 1 × baseline pionów `buildScene.test` (§2.2), 1 × `stanAparatuParytetGlifu`
(pole bez łącznika bez sekcji stanu — intencja „bez położenia” zachowana). Zero wykluczeń.

Nie uruchomiono (poza zasięgiem sesji): pełna regresja vitest całego frontendu, pytest
backendu (zmiany nie dotykają backendu), pełne e2e (125 speców), strażniki Pythona z CI
innych niż `accept:sld-v3`. Stan CI bazy `karta-bkr` nieznany (gałąź WIP bez PR); PR #506
raportuje bramkę czerwoną (1 pytest, 1 vitest niestabilny, 22 e2e) — nieodziedziczone
przez tę gałąź, bo baza jest inna.

## 4. Nie wykonane (uczciwie)

- Plan sieci (L0): bloki stacji 16 j.św. przy skali dopasowania ≈0,28 mają 4–13 px, podpis
  tylko kodem („S01”) 60 px pod blokiem, etykieta GPZ skrócona do „GP…” — bez zmian
  (wymaga podłogi ekranowej symbolu zbiorczego albo zmiany spec §7 „tylko kod stacji”).
- Podpisy pól „F01 …/F02 …/F03 …” skracane na kadrze stacji przy skali ≈1 (szerokość
  mierzona `AVG_GLYPH_WIDTH_FACTOR = 0,62`, szerszy slot zmieniłby geometrię i hashe) —
  bez zmian.
- Odstęp między polami (podziałka pola) — bez zmian; zmiana w `layout/measure.ts`
  rusza wszystkie odciski i baseline'y.
- Zrzuty PNG do `docs/uiux/zrzuty/sld-czytelnosc/` — nie w repo (§6).

## 5. Ustalenia dla projektanta: wzorzec pola liniowego ENEA (bez wdrożenia — do decyzji)

**Który obiekt jest na zrzucie.** „Stacja Odgałęźna” to stacja SN/nN (`insert_station_on_segment_sn`,
`station_type: 'B'`, pola `IN, OUT, FEEDER, FEEDER`), nie GPZ. Jej pola to pola rozdzielnicy
SN stacji SN/nN. Pole liniowe GPZ (Z.10) i pole liniowe rozdzielnicy stacji SN/nN to różne
obiekty z różnym wyposażeniem.

**Co jest w modelu (sieć kadrów stacji, sonda ENM).** Każde pole SN stacji ma w modelu
dokładnie jedną gałąź łączeniową `type: breaker`, katalog `sw-cb-abb-vd4-17kv-630a`
(`u_n_kv 17,5`, `i_n_a 630`), `status: closed`, `primary_devices: []`,
`bay_template_ref: null`, `switchgear_family_ref: null`, `protection_ref: null`,
`protection_codes` z kanonu roli (`51, 50, 51N, 67N`). Brak w modelu: odłącznik szynowy,
uziemnik, przekładniki prądowe/napięciowe, głowica kablowa, wskaźnik napięcia, sterownik.
Renderer (`compose/apparatusSequence.ts`, ścieżka DANYCH) rysuje więc jeden wyłącznik na pole
(kafel stanu „zamknięty”) i NIE dorysowuje aparatów, których model nie ma — to jest zgodne
z regułą „zero fabrykacji”, nie błąd rysunku. Pole F03 bez odcinka jest polem wolnym
(`bayReserve`).

**Jakie szablony pola liniowego istnieją w repozytorium.**
1. Kanon ogólny (ta gałąź, `backend/src/network_model/catalog/bay_templates.py`):
   `bay_template_line_in` / `bay_template_line_out` — Q1 odłącznik szynowy, Q0 wyłącznik,
   T1 przekładnik prądowy, Q2 odłącznik liniowy, Q9 uziemnik (odgałęzienie), GK głowica
   kablowa. Źródło: „brief 2 §3 + STATION_INTERNAL_SLD §3” — **nie jest to wzorzec ENEA**.
2. Wzorce ENEA pola liniowego **GPZ** (gałąź `…-karta-pole-liniowe`, niescalona):
   `BAY_TEMPLATES_GPZ_LINE` = {Z.10, Z.11.1, Z.11} × {łącznik trójpołożeniowy, wyłącznik
   stały z odłącznikiem szynowym, wyłącznik wysuwny} = 9 szablonów
   `bay_template_gpz_line_enea_<z10|z11_1|z11>_<…>`; materializacja w ENM
   `_aparaty_pola_liniowego_gpz`; symbole QElectroTech (EN 60617, CC BY 3.0); dokument
   `docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` (2155 wierszy). Źródło: ENEA Operator „Stacje
   elektroenergetyczne 110 kV”, Zeszyt 1, wersja 02.2023-2 (uchwała 7/2024, obow. od
   2024-04-02), rysunki Z.10 s.89, Z.11 s.90, Z.11.1 s.91, §13 „Rozdzielnia SN”
   (odczyt własnymi słowami: `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`; rejestr
   `docs/zrodla/rejestr_zrodel.json` id `enea_gp_110_z1`). Ten wzorzec dotyczy WYŁĄCZNIE
   pól rozdzielni SN w stacji 110 kV/SN (GPZ).
3. Rodziny rozdzielnic producentów (`catalog/switchgear/families.py`, 17 rodzin: ABB
   SafeRing/SafePlus/UniGear ZS1/UniSec, Siemens NXAIR/8DJH, Schneider SM6-24/RM6/RM AirSeT,
   ZPUE TPM/TPM Air/Rotoblok/Rotoblok Air/Rotoblok VCB, Elektrobudowa RELF/RELF 2S/RXD)
   z dozwolonymi rodzajami pól i aparatów (np. SafeRing: `switch_disconnector`,
   `circuit_breaker`, `earthing_switch`, `fuse_set`, `voltage_indicator`, `cable_head`;
   źródło: katalog ABB 1VDD006104, strona produktowa; `status: repo_verified` z danych
   publicznych, bez weryfikacji właściciela).

**Czego w repozytorium NIE ma.** Żadnego źródła ENEA dla stacji SN/nN i rozdzielnic SN
w stacjach SN/nN (rejestr źródeł zawiera tylko: Zeszyt 1/2/3 stacji 110 kV, linie 110 kV,
Dołęga 2007). Nie mogę więc wskazać „wzorca ENEA pola liniowego rozdzielnicy SN stacji
SN/nN” ani zadeklarować zgodności takiego pola z ENEA — brak dowodu.

**Gdzie powstaje rozbieżność.** (a) Zrzut pokazuje pole stacji SN/nN, a wzorzec ENEA
w repozytorium dotyczy pola GPZ — zastosowanie Z.10 do stacji SN/nN byłoby błędem
rzeczowym. (b) Pola stacji z ziarna e2e i z kreatora stacji powstają bez `bay_template_ref`
i bez rodziny rozdzielnicy — model ma tylko wyłącznik, więc rysunek ma tylko wyłącznik.
(c) Pole liniowe GPZ na tej gałęzi też ma tylko gałąź `breaker` („Aparat Pole liniowe GPZ
1.1”), bo wzorce Z.10 żyją na innej gałęzi.

**Proponowany wariant (do decyzji właściciela, nie wdrożony).**
1. Pola liniowe **GPZ**: szablony `BAY_TEMPLATES_GPZ_LINE` (Z.10 jako domyślny, wykonanie
   łączników wg izolacji rodziny §13) — wymaga scalenia gałęzi `…-karta-pole-liniowe`
   (56 konfliktów z `karta-bkr`, praca integratora) i pozostaje w granicach rysunków Z.10/
   Z.11/Z.11.1 Zeszytu 1 (stan źródła: odczyt własnymi słowami, PDF poza repo).
2. Pola liniowe **rozdzielnicy SN stacji SN/nN**: wyposażenie z wybranej rodziny
   rozdzielnicy producenta (`switchgear_family_ref` + `bay_template_ref` w kreatorze
   stacji / `set_bay_equipment`, resolver `pole_katalogowe`) — aparaty wtedy są DANYMI
   modelu (rozłącznik lub wyłącznik, uziemnik, wskaźnik napięcia, głowica, ewentualnie
   przekładniki wg rodziny), a nie konwencją rysunku. Deklaracja „zgodne z ENEA” możliwa
   dopiero po dostarczeniu i zarejestrowaniu właściwego standardu ENEA dla stacji SN/nN
   (nazwa, wersja, rysunek) w `docs/zrodla/rejestr_zrodel.json`.
3. Do czasu decyzji rysunek pokazuje wyłącznie to, co jest w modelu (jak dziś), z kartą pola
   nazywającą braki („Przekładniki: brak w modelu”, „Brak sterownika — wzorzec pola wymaga
   funkcji 51, 50, 51N, 67N” z akcją „dodaj zabezpieczenie”).

Rozróżnienie symboliki na kanwie (stan tej gałęzi): wyłącznik — kwadrat wypełniony kolorem
stanu (zamknięty/otwarty z kafla stanu), uziemnik pola — glif `earthSwitch` na odgałęzieniu
bocznym (§18.1), przekładniki — `ct`/`vt` z gałęzi bocznej (§18.2), punkt normalnie otwarty —
`noPoint` z podpisem „NO”, szyna SN — pas `bus` z podpisem „S01 · Sekcja 1 · 15 kV”,
szyna nN — portal `lvPortal` z podpisem „Szyna nN · 0,4 kV”, przyłącze — głowica kablowa /
port odpływu pola. Elementy, których model nie ma, nie są rysowane.

## 6. Zapis na GitHubie i ograniczenia środowiska

- `git push` niedostępny w sesji (brak poświadczeń zapisu: „could not read Username for
  https://github.com”). Gałąź `claude/mv-design-pro-twin-audit-u4lhy0-sld-inspektor-czytelnosc`
  utworzona narzędziem GitHub od `29220847a`; pliki zapisane narzędziem (każdy zweryfikowany
  skrótem blob SHA równym lokalnemu `git hash-object`):
  `ui/shared/opisBezPowtorzen.ts` (+test), `inspektor-elementu/PanelElementuKanwy.tsx`,
  `inspektor-elementu/__tests__/naglowekJakDrzewo.test.tsx`,
  `shell/context-panels/SchematContextPanel.tsx`, `sld/v3/canvas/__tests__/stanAparatuParytetGlifu.test.tsx`,
  `e2e/sld-czytelnosc-zrzuty.spec.ts`, ten dokument.
- Pozostałe 12 plików (m.in. `scene/buildScene.ts` 458 KB, `scripts/sld_v3_acceptance.mjs`
  169 KB, `kartaTechnicznaElementu.ts`, `daneElementuKanwy.ts`, `bands.ts`, `svgPrimitives.ts`
  i testy) przekraczają pojemność kanału zapisu narzędzia (pełna treść pliku w jednym wywołaniu).
  Ich zmiany są w `docs/uiux/patches/sld-czytelnosc-inspektor-pozostale.diff` (blob SHA
  `328187e84de73db3d20cc7cbee19c5090dddb00b`, 37 382 B) — na czubku tej gałęzi:
  `git apply mv-design-pro/docs/uiux/patches/sld-czytelnosc-inspektor-pozostale.diff`
  daje drzewo bajtowo równe lokalnemu `129ad5002` (sprawdzone: baza + pliki narzędzia + łatka →
  `git write-tree` równy drzewu lokalnego czubka poza tym dokumentem). Bez zastosowania łatki
  gałąź jest spójna (header/drzewo/sekcja stanu + spec), ale nie niesie zmian kanwy (§2.1–2.3)
  ani parytetu stanu pola (§2.4 drugi punkt) — testy `stanRuchowyAparatuInspektor` (nowe
  przypadki) i `crossings`/`sheetRows`/`buildScene` w wersji z łatki wymagają jej zastosowania.
- Przeglądarka Playwrighta niedostępna (CDN zablokowany); e2e uruchomione na Chromium 153
  (`@sparticuz/chromium`) przez `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Zrzuty PNG przed/po (28 + 4) poza repozytorium — w artefaktach sesji.
