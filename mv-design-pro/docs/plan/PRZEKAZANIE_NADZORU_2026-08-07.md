# PRZEKAZANIE NADZORU — 2026-08-07 (BINDING dla sesji przejmującej)

Dokument przekazania nadzoru nad programem napraw SLD/G-09 dla następnej sesji
(wykonawca-nadzorca: Opus). Cel: dokończyć BEZ dryfu i BEZ zgadywania — wszystko,
czego nie ma w tym dokumencie, jest w rejestrze (`docs/v12xx/REJESTR_KONFLIKTOW.md`)
i w audycie (`docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`); w razie konfliktu rejestr wygrywa.

## 1. STAN (2026-08-07 ~10:00 UTC)

- Gałąź nadzorcy: `claude/przejecie-nadzoru-fable-dtie3b`, szczyt **`1ca9c70b`**, CI **8/8 zielone**
  (potwierdzone także dla `bf6994e3`). Origin jest JEDYNĄ prawdą — po każdym restarcie kontenera
  `git fetch` + reset lokalnej gałęzi do origin.
- Scalone dziś po niezależnych odbiorach (każda karta: własna iniekcja nadzorcy + pełne bramki
  drzewa łączonego + dopisek odbioru w wierszu rejestru): **S9-10** (cykl e2e, deviceRef→inspektor,
  kotwica LOD), **ROUTERY-4A** (4 łańcuchy analiz; macierz §6 do 1❌), **S9-11** (pętla wyników
  W-3/W-4/W-5/W-6/P-8), **POMIAR-RODZAJ** (taksonomia układów pomiarowych ZE standardu [E-UP]
  po erracie V12K-336; brama tranzytu na wszystkich drogach; walidacja 5 MW), **S9-12**
  (oznaczniki F wg PN-EN 81346-2, klasa C-8, zamknięcia C-3/C-5/C-7/C-9/C-13/P-4).
- Decyzje właściciela dnia: **V12K-335** (1: cel gęstości >5% wycofany, jedna kotwica zostaje;
  2: rodzaj pomiaru w modelu; 3: ograniczniki = rodzina F) i **V12K-336** (ERRATA: taksonomia
  pomiarów wyłącznie ze standardu — lista zamknięta podstawowy/rezerwowy/równoważny/kontrolny,
  kontrolny dla obiektów > 5 MW, pole pomiarowe szyn GPZ = pomiar NAPIĘCIA, nie energii).
  KAŻDĄ przyszłą decyzję kompozycji rozdzielnic/pomiarów weryfikuj ze standardem OSD
  (wyciąg: scratchpad `enea_pomiarowe.txt`; źródło [E-UP] 05.2022-2), nigdy z pamięci.

## 2A. AKTUALIZACJA — PRZEJĘCIE DOWODZENIA (2026-08-07, Opus)

Dowodzenie przejął Opus na dyrektywę właściciela. Zmiany wobec §2 niżej (który opisuje
stan sprzed przejęcia i zostaje jako zapis historyczny):

- **S9-13 i BATCH-ROUTER ODEBRANE I SCALONE** (odbiory z własnymi iniekcjami nadzorcy):
  S9-13 zamknęła W-8 i klasę KLIENT-BEZ-DOSTAWCY dla `sldDeltaOverlay`; BATCH-ROUTER
  obalił tezę inwentarza — niewpięte routery **fabrykowały wyniki** (bieg kończony
  wartościami z żądania klienta, sztuczny ślad = naruszenie WHITE BOX), więc fantomy
  usunięto u źródła, a seria przebiegów liczy się teraz biegami kanonicznymi.
- Szczyt: **`3f056860`**, CI **8/8 zielone**.
- **FALA 2 W BIEGU** (strefy rozłączne, protokoły §3–§4 bez zmian):
  `kopia/B-2` (kotwiczenie kamery na zmianie — wiersz B-2 audytu),
  `kopia/PACK-DOWODY` (cztery końcówki pakietów dowodowych bez konsumenta — §6 macierzy),
  `kopia/XLSX-IMPORT` (ostatni ❌ macierzy; domknięcie zeruje kolumnę ❌).
- Zmiana protokołu bramek: przy TRZECH równoległych wykonawcach pełny vitest dzielimy
  na **4 shardy** (`--shard=k/4`) — przy dwóch wystarczały 2, przy trzech rywalizacja
  o CPU wywracała bieg na limicie 10 min (RC=143 = SIGTERM limitu, nie defekt).
- **POTWIERDZONY TRYB AWARII (2026-08-07, drugie wystąpienie)**: restart kontenera
  potrafi cofnąć LOKALNE repo do starszej migawki dysku (zmierzone: HEAD wrócił z
  `3f056860` na `101378c2`, czyli sprzed całej fali, przy CZYSTYM drzewie roboczym —
  więc bez `git status` wygląda to na stan poprawny). Origin był nietknięty. Procedura:
  `git fetch` → porównaj `origin/<gałąź>` z HEAD → `git checkout <gałąź> && git reset
  --hard origin/<gałąź>`. Worktree wykonawców zakładane z `origin/...` po restarcie są
  poprawne. **Każda runda nadzoru zaczyna się od tego porównania.**
- **FALA 3 (po odbiorach fali 2)**: V126-OKNA; Reference Engine — wybór pakietu
  (`fetchReferencePacks` ma konsumenta wyłącznie w teście, ekran zgodności ma zaszyte
  `PAKIET_OSD = 'osd_enea'`, `ZgodnoscReferencyjna.tsx:30`); S9-12-DLUG-LATERAL-ETYKIETA;
  reszta klasy KLIENT-BEZ-DOSTAWCY; B-5 (kontrakt kopii, V12K-325).

## 2B. AKTUALIZACJA — FALA 3 W BIEGU (2026-08-07 ~17:20 UTC, Opus)

**SZCZYT: `0e519969`** (origin == HEAD po pushu odbioru PROPORCJE).

Odebrane i scalone od §2A (każde z własną iniekcją nadzorcy i pełnymi bramkami):
S9-13, BATCH-ROUTER, XLSX-IMPORT, PACK-DOWODY, B-2, REF-PAKIET, V126-OKNA, **PROPORCJE**.
Kolumna ❌ macierzy §6 jest PUSTA (27 ✅ / 18 ◐ / 0 ❌).

**PROPORCJE — odbiór zamknięty, wnioski trwałe:**
- Zgłoszenie właściciela „brak proporcji, grubości" było REALNE w produkcie (napis:symbol
  2,78 przy skali dopasowania, szyna:aparat 15,70), a dodatkowo zwielokrotnione przez
  sondę, która renderowała kanwę własną kamerą i podmieniała `viewBox` po fakcie.
  **Wniosek dla każdej przyszłej sondy: kadr PODAJEMY kanwie (`cameraOverride`), nigdy
  nie nakładamy na jej wynik.**
- Iniekcja nadzorcy ZNALAZŁA LUKĘ tej samej klasy co przy B-2: docstring `grubosc`
  w `symbols/glyphs.tsx` deklarował „JEDYNE wejście po `strokeWidth` w tym pliku",
  a przestawienie jednej kreski na gołą stałą przechodziło **28/28 na zielono**.
  Domknięte pinem czytającym ŹRÓDŁO pliku (`PROPORCJE §3`).
  **To już trzecia deklaracja obejmująca cały plik/moduł bez strażnika (kotwica LOD,
  wykluczenie z odcisku ENM, lejek kreski). Iniekcja nadzorcy CELUJE w mocne zdania
  nagłówków — to najskuteczniejszy dotąd wzorzec odbioru.**

**W BIEGU — dwie karty (strefy rozłączne):**
- `kopia/V126-JEZYK` — przepisanie ekranu ocenionego przez właściciela na **0/10**
  („zbędne kody produkcyjne nie mają prawa pojawić się w interfejsie"; ekran nie wnosił
  nic do flow projektanta). 3 commity. Odbiór wymaga iniekcji **oraz obejrzenia ekranu
  oczami inżyniera** — poprzedni odbiór V126-OKNA sprawdził strukturę i guardy, ale
  NIE zapytał, co ekran mówi projektantowi; stąd 0/10. Guard `ui_production_codes_guard`
  skanuje LITERAŁY ŹRÓDŁA, a tamte etykiety powstawały w RUNTIME ze ścieżek kluczy
  backendu — dlatego nie mógł ich złapać.
- `kopia/BLOK-PUSTY` — **punkt 6 zgłoszenia właściciela, jedyny niezamknięty przez
  PROPORCJE** („wnętrze ramy stacji w większości puste"). Sprawdzone grepem: w wierszu
  `| PROPORCJE |` występuje wyłącznie w opisie stanu przed — bez pomiaru, naprawy
  i werdyktu. §0 karty przesądza kierunek: **rama idzie za treścią, ZAKAZ dokładania
  tuszu dla zapełnienia** (fabrykacja treści = powtórka oceny 0/10).

**Kolejka po tych dwóch:** S9-12-DLUG-LATERAL-ETYKIETA · reszta klasy
KLIENT-BEZ-DOSTAWCY · B-5 (kontrakt kopii, V12K-325) · PACK-DOWODY-DLUG-APARATURA
(katalog bez `U_m`/`I_cu`) · PACK-DOWODY-DLUG-ROZPLYW (generator bez końcówki) ·
reguły zgodności specyficzne dla OSD (REF-PAKIET).
~~`api/snapshots.py` bez `include_router`~~ — **ZAMKNIĘTE 2026-08-08 (karta
ROUTERY-MARTWE): USUNIĘTE.** Jedyny kandydat na konsumenta (`frontend/src/designer/`)
sam był wyspą bez importerów i wołał ścieżki, których backend nigdy nie serwował —
więc „wpiąć z konsumentem" nie miało kogo wpiąć. Klasa (12 modułów `src/api/**` z
routerem, którego aplikacja nie montuje) domknięta guardem
`scripts/router_mount_guard.py`.

**Decyzje produktowe czekające na właściciela** (nie rozstrzygać samodzielnie):
podziałka pól L1/L2 (S9-10 pkt C) · edycja ról pól mogąca rozbroić pętlę OSD złączy
klasy C · lista rodzajów analiz V12.6 bez wartości inżynierskiej do wycofania.

**KLASTER GUARDÓW ODBIORU — POPRAWKA OBOWIĄZKOWA (2026-08-07).** Odbiór karty
dotykającej BACKENDU musi zawierać `no_direct_fault_params_guard` (i cały
workflow `P0 Extended Guards`). Pomiar: CI było CZERWONE od `a346c3de` przez
CZTERY kolejne szczyty, bo jedno naruszenie w `packs/sc_asymmetrical.py`
zapalało dwa biegi (`P0 Extended Guards` oraz `Python tests` przez pin
`test_bramka_na_szczycie_repo_jest_zielona_i_niepusta`), a klaster nadzorcy
sprawdzał wyłącznie guardy UI/SLD i pełny pytest — który tego guarda NIE
uruchamia. **Wniosek ogólniejszy: lokalna zieleń pytest ≠ zielone CI.** Po
każdym pushu sprawdzaj konkluzje biegów, nie tylko własne bramki. Naprawa
opisana w wierszu `PACK-1F-WIAZANIE` rejestru; dług bliźniaczy: PACK-SC3F-WIAZANIE.

**NARZĘDZIE ZASTĘPUJĄCE RĘCZNĄ LISTĘ:** `poetry run python ../scripts/guardy_z_ci.py`
(z katalogu `backend/`). Czyta `.github/workflows/*.yml`, wyciąga każde wywołanie
`python scripts/<nazwa>.py` i uruchamia **komplet 69 guardów** bieżącym
interpreterem — nowy guard dopisany do workflowa wchodzi do odbioru sam.
Uruchamiaj interpreterem z venv backendu (`trace_determinism`,
`catalog_enforcement` potrzebują `networkx`; systemowy Python daje fałszywą
czerwień). **To jest odtąd bramka guardów każdego odbioru — nie wybieraj
guardów ręcznie.**

**POPRAWKA 2026-08-07 (druga wpadka tego samego rodzaju, tym razem w moim
narzędziu).** Krok CI ma DWIE połowy: skrypty guardów ORAZ `poetry run python
-m pytest -q ../scripts`, czyli WŁASNE TESTY guardów, leżące poza `testpaths`
backendu. Pierwsza wersja `guardy_z_ci.py` uruchamiała tylko pierwszą połowę
i meldowała „komplet zielony". Skutek zmierzony: po zdjęciu martwego modułu
`variantStore.ts` zapadka `FRONTEND_DEAD_CLIENT_DEBT` zażądała obniżenia
(działa w obie strony) — bramka odbioru tego nie zobaczyła i **CI było czerwone
przez trzy szczyty**. Narzędzie obiecywało „to, co robi CI", i była to obietnica
szersza od tego, co sprawdzało. Skrypt uruchamia teraz obie połowy; sprawdzone
iniekcją (przywrócenie nieaktualnego wpisu zapadki → RC=1).

**TRZECIA WPADKA TEGO SAMEGO DNIA, WARTA ZAPAMIĘTANIA — MOJA.** Zapisałem
w rejestrze, że brakuje strażnika klasy „front woła trasę, której backend nie
serwuje", i dołączyłem dwa własne nieudane matchery jako dowód trudności.
Sprawdziłem to potem iniekcją: `route_prefix_guard` **ma** tę regułę
(`[route-prefix-martwa]`) i łapie ją z plikiem i numerem linii, normalizując
ścieżkę składaną w miejscu wywołania. Martwy moduł przeżył nie przez ślepotę
bramki, tylko dlatego, że był ZAREJESTROWANY w zamrożonej liście długu
z adnotacją „do decyzji". Brakowało DECYZJI, nie strażnika.

**Reguła na przyszłość: zanim nazwiesz brak strażnika, sprawdź iniekcją, czy
istniejący go nie ma.** Pisanie od zera czegoś, co już działa, to złamanie
dyrektywy reużycia — tej samej, którą egzekwuję w kartach u wykonawców.

**DRUGA PUŁAPKA, ZMIERZONA TEGO SAMEGO DNIA:** `black src tests scripts ../scripts`
w JEDNYM wywołaniu psuje wykrywanie konfiguracji (black bierze wspólny katalog
nadrzędny, nie znajduje `[tool.black]`, formatuje szerokością 88 zamiast 100 —
przeformatowało 979 plików). Formatuj DWOMA wywołaniami, dokładnie jak CI:
`black --check src tests` oraz `black --check --config pyproject.toml ../scripts`.
Workflow `python-tests.yml` ostrzega przed tym w komentarzu.

## 2C. AKTUALIZACJA — FALA 4 ZAMKNIĘTA (2026-08-08, Opus)

**SZCZYT: `01ddb662`. CI 8/8 ZIELONE na czterech kolejnych szczytach.**

Odebrane i scalone od §2B (każde z własną iniekcją nadzorcy, pełnymi bramkami,
dopiskiem odbioru w rejestrze): **V126-JEZYK · V126-WYGASZENIE · BLOK-PUSTY ·
PACK-ROZPLYW · BLOK-LATERAL-WLASNOSC · CHWIEJNY-WSPOLBIEZNOSC**, plus trzy
naprawy własne nadzorcy (PACK-1F-WIAZANIE + PACK-SC3F-WIAZANIE, martwa wyspa
wariantów, dziura `\b` w guardzie kodenamów).

**PUNKT 6 ZGŁOSZENIA WŁAŚCICIELA ZAMKNIĘTY** (puste wnętrze ramy stacji):
L0 bloków ponad progiem 53/54 → 4/54, L1 16/54 → 0/54, **L2 11/54 → 0/54**.
Domknięcie na L2 dała dopiero druga karta — przyczyną nie była rezerwacja, tylko
etykieta odgałęzienia nosząca ref STACJI zamiast odgałęzienia.

### Cztery lekcje procesowe tej fali — wszystkie kosztowały czerwone CI albo błędny wpis

1. **BRAMKA GUARDÓW MA DWIE POŁOWY.** `scripts/guardy_z_ci.py` uruchamia teraz
   69 skryptów **oraz** `python -m pytest ../scripts` (własne testy guardów, poza
   `testpaths` backendu). Pierwsza wersja robiła tylko połowę i meldowała „komplet
   zielony" — CI było czerwone przez trzy szczyty. **Nie wybieraj guardów ręcznie.**
2. **`black` z wieloma ścieżkami w jednym wywołaniu psuje wykrywanie konfiguracji**
   (formatuje szerokością 88 zamiast 100; przeformatowało 979 plików). Dwa osobne
   wywołania, dokładnie jak CI.
3. **ZANIM NAZWIESZ BRAK STRAŻNIKA — SPRAWDŹ INIEKCJĄ, CZY ISTNIEJĄCY GO NIE MA.**
   Zapisałem w rejestrze dług na budowę bramki „front woła trasę, której nie ma".
   `route_prefix_guard` MA tę regułę (`[route-prefix-martwa]`). Martwy moduł
   przeżył, bo był ZAREJESTROWANY w zamrożonej liście długu z adnotacją „do
   decyzji" — brakowało DECYZJI, nie strażnika. Sprostowane jawnie w rejestrze.
4. **ROZSTRZYGNIĘCIE §0 JEST HIPOTEZĄ DO ZMIERZENIA, NIE DOGMATEM.** Dwa razy w tej
   fali wykonawca odrzucił moje rozstrzygnięcie POMIAREM i dwa razy miał rację:
   próg względny dla współbieżności (mylił się na 19–25 pomiarach na 160) oraz
   klauzula „ref nie może być korzeniem bloku" (54 fałszywe trafienia — korzeń JEST
   uczciwym właścicielem szyny SN stacji). **Karta, w której nikt nigdy nie
   kwestionuje §0, to karta, w której nikt nie mierzy.** Zostawiaj w §0 jawną furtkę
   („jeśli pomiar obali — powiedz to wprost, uczciwy brak bije pozorny sukces").

### Wzorzec iniekcji odbiorczej — najskuteczniejszy z siedmiu fal

**Celuj w MOCNE ZDANIA nagłówków i w ZASIĘG wyroczni.** Trafienia tej fali:
deklaracja „jedyne wejście po `strokeWidth` w tym pliku" bez strażnika · pin
liczący dwa rodzaje z dwunastu · gałąź martwa na fiksturze, więc niewidoczna dla
wyroczni chodzącej po scenie · furtka czasowa, przez którą test przechodził
w 79 na 80 prób przy CAŁKOWICIE zablokowanej pętli.
**Pytanie kontrolne: czy zbiór, po którym chodzi wyrocznia, jest tym samym zbiorem,
na którym działa kod?**

### W biegu (strefy rozłączne)

- `kopia/QU-FABRYKACJA` — solver liczy moc bierną ze zmyślonych współczynników
  (`q_min = −0,35 · P` przy DOSTĘPNYM `bus.load_mvar` w tym samym pliku), a nazywa
  to „krzywą Q–U" bez żadnej zależności od napięcia. §0: sedno w solverze, nie na
  ekranie; przy niewystarczających danych PRZESTAĆ liczyć i zameldować brak.
- `kopia/SLOT-DRYF` — 2 z 37 podpisów przęseł stoi 888 j.św. od swojej polilinii.
  §0: granica z geometrii odcinka, nie z zaszytego progu; diagnoza poprzednika jest
  hipotezą do sprawdzenia.
- `kopia/KLIK-ETYKIETA-KOTWICA` — trzy tabele orzekają o rodzaju TEGO SAMEGO
  klikniętego obiektu i rozjeżdżają się na 61 z 1083 etykiet LOD2 (pomiar nadzorcy,
  sieć 52 stacji). Zakres: `ui/sld/v3/canvas/**` — rozłączny ze dwiema kartami wyżej.
- ~~`kopia/ROUTERY-MARTWE`~~ — **ODEBRANA I SCALONA 2026-08-08.** Klasa „moduł
  deklaruje `APIRouter`, aplikacja go nie montuje" domknięta guardem
  `scripts/router_mount_guard.py` (budżet 16 odstawionych tras, ratchet w OBIE
  strony). 8 modułów usuniętych, 4 świadomie odstawione z uzasadnieniem.
  **Tablica tras aplikacji identyczna przed i po — 310 = 310, `diff` pusty**
  (sprawdzone przeze mnie w osobnym worktree, nie przyjęte na słowo).

  **Moje §0 obalone dwukrotnie i oba razy słusznie.** (a) Nie 13 modułów/42 trasy,
  tylko 12/36: `protection_runs` JEST zamontowany przez 4-wierszowy re-eksport
  `api/protection_analysis_runs.py`. Mój pomiar go przeoczył z powodu **mojego
  błędu metodycznego**: porównywałem tożsamość funkcji obsługi importując
  `src.api.protection_runs`, gdy aplikacja ładuje `api.protection_runs` — Python
  trzyma je pod różnymi kluczami `sys.modules`, więc obiekty funkcji się nie
  zgadzały. **Lekcja: przy porównaniu po tożsamości obiektów sprawdź najpierw, czy
  obie strony ładują ten sam moduł.** (b) Kolumna „wołań frontu" w moim pomiarze
  liczyła SEGMENTY ścieżek, nie konsumentów — 58 wołań `analysis-runs` obsługują
  moduły ŻYWE. Martwe moduły miały zero konsumentów.

  **Znalezisko uboczne wykonawcy, ważniejsze niż sama karta:** `route_prefix_guard`
  i `export_codenames_guard` **nie były wpięte do żadnego workflowa — nigdy się nie
  wykonały**. To ta sama klasa, którą zapisałem jako lekcję fali 4 („workflow CI,
  który nigdy się nie wykonał"), i mój własny `guardy_z_ci.py` ich nie widział,
  bo czyta listę guardów Z WORKFLOWÓW. Po naprawie: 69 → 73 guardy w przemiale.

#### QU-FABRYKACJA — runda 3 (luka znaleziona przy odbiorze rundy 2)

Wykonawca zbudował zapadkę `solver_input_substitute_guard.py` na klasę „stała
podstawiona za nieobecną daną": AST, trzy formy (`or` / wyrażenie warunkowe /
`getattr`), warunek podwójny — pole musi być ZADEKLAROWANE w modelu wejściowym
ORAZ gałąź zapasowa musi być liczbowa. Rozwiązanie lepsze od tego, które
zapisałem w karcie (odczyt słownika wypada Z KONSTRUKCJI REGUŁY, nie wyjątkiem),
a mój punkt 3 („zamroź dziewięć długów imiennie") wykonawca obalił słusznie:
osiem z nich to nagie stałe w działaniu, składniowo nierozróżnialne od stałej
normowej — żądanie było żądaniem fałszywej pewności.

LUKA, którą znalazłem iniekcją: mapa pól powstaje z `solver_input/**` +
`enm/models.py` (563 pola), ale zakres skanu obejmuje `network_model/solvers/**`,
gdzie klasyczne solvery czytają model DOMENOWY. Pomiar: **54 pola zadeklarowane
w `network_model/core/**` są poza mapą**, a warstwa solverów czyta je **165 razy**
(`voltage_level` 24×, `cos_phi` 8×, `un_kv` 3×, `voltage_magnitude` 2×,
`voltage_angle` 2×). Iniekcja `gen.cos_phi or 0.95` dopisana do
`power_flow_newton.py` — pliku W ZAKRESIE — przeszła **RC=0**. Granica nr 5
guarda mówiła, że niewidoczne są dane czytane „bez modelu", więc czytelnik
wnosił, że pole zadeklarowane JEST pokryte — zdanie MYLĄCE, nie tylko niepełne.

#### Obserwacja wzrokowa, którą pomiar OBALIŁ (zapis, żeby nikt jej nie wskrzesił)

Na zrzucie detalu GPZ wnętrze przerywanej ramy wyglądało w większości pusto —
wziąłem to za kolejną instancję punktu 6 właściciela. `scripts/pomiar_bloku.tsx`:
L2 **0/54 bloków** powyżej progu 90%, GPZ nie jest wśród dziesięciu najpustszych
(mediana 82,3%, najgorszy 88,1%). Wrażenie brało się z KADRU (przerywana rama
wychodziła poza widoczny fragment), nie z rysunku. Domknięcie karty BLOK-PUSTY
się broni; wrażenie wzrokowe bez pomiaru nie jest znaleziskiem.

#### Pomiar, na którym stoi karta KLIK-ETYKIETA-KOTWICA (nie mierzyć ponownie)

`LABEL_OWNER_ELEMENT_KIND` (`canvas/hitAreas.ts`) deklaruje rodzaj obiektu dla
etykiety; złożenie `resolveCanvasMenuSubject` → `ELEMENT_KIND_KOTWICY`
(`canvas/SldCanvasV3Workspace.tsx`) rozstrzyga go NIEZALEŻNIE, w modelu. Ta sama
przeciwdziedzina, ten sam obiekt, dwa orzeczenia — kształt z reguły KLASA §3, tylko
że tu one już się nie zgadzają:

| etykiet | rodzaj etykiety | deklaracja | kotwica modelu | skutek |
|---|---|---|---|---|
| 54 | `busbar-voltage` | `bus` | `stacja` | menu STACJI na napisie „Szyna WN · 110 kV" |
| 4 | `station-name` (TR1) | `station` | `transformator` | selekcja omija rozwiązanie refu transformatora |
| 3 | `station-name` (źródło) | `station` | `zrodlo` | to samo, na źródle systemowym |
| 1 | `busbar-voltage` (sekcja GPZ) | `bus` | brak w modelu | etykieta bez menu |

Przyczyna rozjazdu 54 etykiet: przejście „kompozyt stacji → kanoniczna szyna SN" jest
bramkowane `input.klasa === 'szyna'`, a klasa `'szyna'` powstaje WYŁĄCZNIE dla kresek
(`klasaOdcinka`). Etykieta niesie `klasa: 'etykieta'`, więc przejście nigdy dla niej
nie odpala. Naprawiono INSTANCJĘ (kreska szyny), nie KLASĘ (wszystko, co szynę
reprezentuje).

**Sprostowanie własnego wpisu.** Kolejka niżej nosiła pozycję „rozdział
`apparatus`/`bus`, którego scena nie unosi" — sformułowanie wzięte z granicy §6 karty
BLOK-LATERAL-WLASNOSC i przeze mnie przyjęte bez sprawdzenia. Jest FAŁSZYWE w części,
która ma znaczenie: scena rzeczywiście tej pary nie unosi, ale MODEL ją unosi i
`canvasMenuSubject` już ją z modelu wyprowadza. Prawdziwym problemem nie był brak
rozróżnienia, a to, że **istnieją dwa niezależne rozróżnienia, które się rozjeżdżają**.
Lekcja tej samej rodziny co „zanim nazwiesz brak strażnika, sprawdź iniekcją, czy
istniejący go nie ma": zanim nazwiesz coś nierozstrzygalnym, sprawdź, czy sąsiedni
moduł już tego nie rozstrzyga.

### Kolejka po nich

1. **MOST-WEJSCIA-V126** — pozycja PRZEFORMUŁOWANA po moim pomiarze 2026-08-08.

   **SPROSTOWANIE POD MOIM NAZWISKIEM.** Wpisałem tu wcześniej, za wykonawcą
   QU-FABRYKACJA, że `length_km = 1,0` i `r/x_ohm_per_km = 0,18/0,12` w moście
   `build_v126_input_from_enm` to „NAJGORSZA rodzina w całym zakresie". **Zmierzone
   — to nieprawda, i powtórzyłem cudze zdanie bez sprawdzenia.** Fakty z sieci
   referencyjnej (260 gałęzi):
   - domysł `length_km = 1,0` obejmuje WYŁĄCZNIE gałąź `cable`/`line_overhead`;
     wszystkie **88** kabli i linii tej sieci MA długość, więc nie odpala;
   - 172 gałęzie bez długości to **aparaty łączeniowe** (171 wyłączników + 1
     łącznik, `APARAT_SN`) — brak długości jest tam POPRAWNY, a idą one drugą
     gałęzią mostu (`length_km = 0,001`);
   - dla modelu pydantic pole ISTNIEJE i bywa `None`, więc `float(getattr(b,
     "length_km", 1.0))` **nie zwraca domysłu, tylko rzuca `TypeError`**
     (sprawdzone). Domysł jest zatem praktycznie NIEOSIĄGALNY, a nie „najgorszy".

   **CO W TYM MOŚCIE JEST REALNE (i tego dotyczy karta):**
   - `ampacity_a = 630.0` **zaszyte dla WSZYSTKICH 172 aparatów** — nie domysł
     zapasowy, tylko wprost wpisany prąd znamionowy każdego łącznika w sieci;
   - `ampacity_a = float(rating.in_a or 300.0)` — odpala na **2 z 88** kabli
     bez znamionowego, a wielkość wchodzi do oceny obciążalności cieplnej;
   - `r_ohm_per_km = float(branch.r_ohm or 0.001)` na aparatach: `r_ohm` wynosi
     **0,0 dla wszystkich 171**, a `0.0` jest wartością fałszywą, więc `or`
     **nadpisuje jawne, poprawne zero** liczbą 0,001. To nie podstawienie za
     brak danej, tylko ciche przykrycie danej OBECNEJ (granica nr 2 zapadki);
   - `b_siemens_per_km = ... or 0.0` — 2 kable, przyjęcie zerowej pojemności.

   Karta ma zacząć od potwierdzenia tego pomiaru na drugiej, niereferencyjnej
   sieci (sprawdzam jedną fiksturę — to za mało, żeby orzekać o produkcie).
2. **TYPY-SKRYPTY** — 94 błędy typów pod wykluczeniami `tsconfig.json`. Pięć
   martwych wykluczeń zdjąłem 2026-08-08 (0 błędów — chroniły już tylko siebie);
   reszta rozłożona pomiarem 2026-08-08:
   - **52 błędy w TRZECH plikach**, i wszystkie trzy wyglądają na MARTWĄ WYSPĘ:
     `sld/core/layoutPipeline.ts` (37) i `sld/core/layoutEngine.ts` (8) importują
     się **wyłącznie nawzajem** (żadnego importera produkcyjnego; żywy silnik
     układu to `engine/sld-layout/layoutEngine`, wołany z `sld/v2/geometry`),
     a `layoutEngine.ts` importuje moduł `./layoutInputGraph`, **którego nie ma
     nigdzie w `src`**; `sld/inspector/fieldDeviceInspector.ts` (7) nie ma
     ANI JEDNEGO importera — ani w produkcji, ani w testach. 22 z 52 błędów to
     zepsute importy (TS2305/TS2307), czyli ta sama zgnilizna co w skryptach
     renderujących. **Kandydat na kasację, nie na naprawę typów** — ale decyzję
     poprzedź pomiarem na drugim modelu (patrz pozycja 1).
   - 37 w `frontend/scripts/**` (katalog poza `include` w całości).
   - 1 w `ResultsInspectorPage.tsx` — import modułu, którego NIE MA; strona nie
     jest eksportowana z bariery ani importowana w produkcji, a test
     `workspaceShellV125` MOCKUJE eksport, którego moduł nie ma.

   **ZNALEZISKO PRZY OKAZJI, POWAŻNIEJSZE OD SAMEGO DŁUGU (poprawione od razu):**
   `CLAUDE.md` wymieniał sześć „krytycznych testów kontraktowych uruchamianych
   w SLD Determinism CI", wszystkie w `sld/core/__tests__/`. **Nie istniał ANI
   JEDEN** — ani tam, ani nigdzie w `src` (jedyny test w tym katalogu to
   `portBasedLayout.test.ts`), a workflow nie uruchamia niczego z `sld/core/**`.
   Wiążący plik instrukcji opisywał zabezpieczenie, którego nie ma — dokładnie
   klasa „deklaracja bez pokrycia", którą ta fala ściga w kodzie. Lista zastąpiona
   spisaną z `.github/workflows/sld-determinism.yml` (19 plików, v2 + v3).
3. **KLIENT-BEZ-RODZINY** (znalezisko oddane przez wykonawcę ROUTERY-MARTWE, nie
   zamiecione). `route_prefix_guard` zbiera ścieżki frontu WYŁĄCZNIE dla pierwszych
   segmentów, które backend serwuje — klient wołający rodzinę, której backend nie
   ma w ogóle, wypada ze skanu z konstrukcji. Tak przeżyła wyspa `designer/`:
   trzy ścieżki do nieistniejącej rodziny `/snapshots`, zero alarmów. Klasa
   ta sama co dwie poprzednie: **wyrocznia chodzi po węższym zbiorze niż kod.**
4. ~~`api/snapshots.py` bez `include_router`~~ — ZAMKNIĘTE 2026-08-08 kartą
   ROUTERY-MARTWE: USUNIĘTE. Reguła „wpinać wyłącznie z konsumentem" nie miała
   kogo wpiąć — jedyny kandydat (`frontend/src/designer/`) sam był wyspą bez
   importerów, wołającą ścieżki, których backend nigdy nie serwował.
5. PACK-DLUG-STRATY / -SPADEK / -NASTAWY (4 pakiety dowodowe bez konsumenta,
   powody merytoryczne w rejestrze) · reguły zgodności specyficzne dla OSD
   (REF-PAKIET) · dług aparatury: katalog bez `U_m`/`I_cu` w postaci czytanej
   przez widok wytrzymałości · 9 długów stałych zastępczych z
   `INWENTARZ_STALYCH_V126_2026-08-08.md` · rozszerzenie zapadki podstawień na
   `enm/**` (zmierzone 33 trafienia poza zakresem, `enm/mapping.py` 11) ·
   `protection_coordination` — 7 endpointów + martwy klient frontu, decyzja o
   ZDOLNOŚCI (zbudować ekran koordynacji czy usunąć oba).

### Decyzje właściciela podjęte w tej fali

Wycofanie z toru projektanta walidacji referencyjnej (bada NARZĘDZIE, nie projekt —
zeszła do kontroli jakości, test istniał wcześniej, sprawdzone) oraz marginesu P–U
(przybliżenie ze sztywności węzła, nie krzywa z rozpływu). Q–U rozstrzygnięte przez
nadzorcę na wniosek właściciela („decyduj") — patrz karta w biegu.

## 2. W BIEGU — DWIE KARTY DO ODEBRANIA (stan sprzed przejęcia — historyczny)

| Karta | Kopia | Zakres | Odbiór — na co zwrócić uwagę |
|---|---|---|---|
| **S9-13** | `kopia/S9-13` | W-8: porównanie A/B z kanwy; reużycie osieroconego store `sldDeltaOverlay` (klasa KLIENT-BEZ-DOSTAWCY, V12K-326); zero fizyki w UI (delta = prezentacja dwóch liczb backendu) | iniekcja w świeżość nakładki (stale-badge musi czytać `rewizjaBiezacegoModelu` z S9-11 — NIE liczyć osobno); sprawdź czy nowa końcówka (jeśli jest) przeszła route_prefix + api_lifecycle; zrzuty dla właściciela |
| **BATCH-ROUTER** | `kopia/BATCH-ROUTER` | wpięcie `api/batch_execution.py` (8 końcówek) + `api/case_runs.py` do `main.py` + powierzchnia serii przebiegów w ui2/obliczenia | NIE wpinać martwych końcówek dla wpięcia (fantom); iniekcja w stan zerowy powierzchni albo w kontrakt jednej końcówki; pełny pytest + zapadka mypy (backend) |

Wykonawcy znają protokół §0 (jest w ich promptach). Meldunki przyjdą jako powiadomienia.

## 3. PROTOKÓŁ ODBIORU KARTY (sprawdzony ~15 razy — NIE zmieniać)

1. `git fetch origin kopia/<KARTA>`; zweryfikuj twierdzenia meldunku diffem
   (`git diff --stat/--name-only BAZA..FETCH_HEAD`; „backend nietknięty" ⇒ grep 0 plików backend/).
2. Cherry-pick commitów kopii na szczyt. Konflikt rejestru = ZAWSZE keep-both
   (python: wytnij markery, wiersz przychodzący NAD wierszem HEAD). Jeśli commit kopii dodał
   do indeksu ścieżkę spoza zakresu (precedens: SYMLINK node_modules w S9-11) — `reset --soft`
   do szczytu + `git rm --cached` + JEDEN commit squash z uczciwym opisem (granulacja zostaje na kopii).
3. WŁASNA INIEKCJA w róg NIEpokryty iniekcjami wykonawcy. Sprawdzone wzorce dnia:
   drugi koniec pary predykatów (scena↔kanwa, compose↔wyrocznia), mocna deklaracja
   z docstringa/komentarza bez przypiętego testu (znaleziono 1 realną lukę: pin wykluczenia
   `connection_conditions` z odcisku — domknięta przy odbiorze). Procedura: `cp plik plik.KOPIA`
   + sha256 przed; przywrócenie WYŁĄCZNIE z kopii pliku; diff sha po. Iniekcja MUSI dać czerwień,
   inaczej deklaracja nie ma strażnika — wtedy dopisz brakujący pin sam (zero-debt).
4. Bramki drzewa łączonego (RC ZAWSZE bezpośrednio: `cmd > log 2>&1; echo $? > plik.rc`):
   - frontend: pełna suita w **SHARDACH ≤2** (`npx vitest run --no-file-parallelism --shard=k/2`;
     limit narzędzia 10 min/komendę — pełny bieg pod obciążeniem NIE mieści się, RC=143=SIGTERM
     limitu, nie defekt), `npm run accept:sld-v3` (ALL PASS), type-check, lint;
   - backend dotknięty: pełny pytest + `python scripts/mypy_ratchet_guard.py` (próg 18/13;
     spadek długu ⇒ obniż próg POMIAREM w guardzie ORAZ teście-pinezce `tests/ci/test_mypy_ratchet_guard.py`);
   - guardy ZAWSZE z katalogu `mv-design-pro/` (inny cwd = fałszywe RC=2).
5. Dopisek „ODBIOR NIEZALEZNY" do wiersza karty w rejestrze (python surgery, wzór: wiersze
   S9-10…S9-12), commit `-F plik` (NIGDY inline -m z polskimi cudzysłowami), push na gałąź nadzorcy.
6. Karta zmienia rysunek ⇒ zrzuty (oba motywy) do `docs/sld/audyt-2026-08/` + dostarczenie właścicielowi.

Stopka KAŻDEGO commita (dokładnie te dwie linie, autor `-c user.name="Claude" -c user.email="noreply@anthropic.com"`):
```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SQrF1rEGrDZ4E8gehUeRZk
```

## 4. PROTOKÓŁ TRWAŁOŚCI ŚRODOWISKA (twarde zakazy — złamania kosztowały godziny)

- **pkill/killall po wzorcu tekstowym ZAKAZANY** — kill wyłącznie po własnym zapisanym PID.
- **node_modules**: główne repo (`mv-design-pro/frontend/node_modules`) MUSI być realnym
  katalogiem; worktree wykonawcy dostaje WYŁĄCZNIE symlink DO niego. Wykonawca, który przenosi
  katalog albo tworzy symlink-cykl, wywraca wszystkie bramki (RC=216). `.gitignore` łapie już
  także symlink (wzorzec bez ukośnika).
- Iniekcje NIGDY podczas biegnącej pełnej suity; przywracanie z KOPII PLIKU, nie `git checkout`.
- Restart kontenera: origin = prawda; wykonawcy budzeni SendMessage („zabezpiecz pracę: commit
  wip + push -f na kopię, kontynuuj"); kopie `kopia/*` zawsze przeżywają.
- Subagent NIE dostaje powiadomień o zadaniach tła — każe mu się pracować SYNCHRONICZNIE;
  jeśli mimo to zamilkł „czekając", obudź SendMessage z instrukcją odczytu RC z plików.
- Wartownik (Monitor 28 min, przezbrajany po timeout): sygnatura cofnięcia szczytu
  (`merge-base --is-ancestor TIP origin/...`), symlink node_modules, mtime transkryptów
  wykonawców >25 min. W TRYBIE OSZCZĘDNYM emituj TYLKO alarmy (bez echa ruchu kopii).

## 5. KOLEJKA DO 100% (kolejność wg wartości; sekwencjonowanie wg kolizji plików)

1. Odbiory S9-13 i BATCH-ROUTER (pkt 2).
2. **B-2 kotwiczenie kamery** (audyt §4.3): po wstawieniu stacji kamera utrzymuje obiekt
   wstawiony w kadrze (ogon +752 j.św. wyjeżdża z kadru). PO scaleniu S9-13 (kolizja kanwy).
3. **V126-OKNA** (inwentarz §6 wiersz „Pakiet akademicki V12.6", ◐): 12 rodzajów analiz E-40…E-50
   ma JEDNĄ zastaną powierzchnię `V126AcademicSurface.tsx` (334 w., zero testów, ślad ucięty
   do 8 kroków, raport do 3 sekcji, kolory poza tokenami) — okno w ui2 wg kontraktu ekranu
   prowadzącego, pełny ślad/raport, testy.
4. **PACK-DOWODY** (TOP G-09; doprecyzuj zakres z macierzy §6 inwentarza — wiersze pakietów
   dowodowych ze statusem ◐; nie zgaduj: przeczytaj wiersz przed napisaniem karty).
5. **Import XLSX — ostatni ❌ macierzy**: końcówka `POST /api/import/xlsx` działa, front ma
   ZERO odwołań — zbuduj konsumenta w ui2 (miejsce: przestrzeń danych/projektu) z realną ścieżką testową.
6. **KLIENT-BEZ-DOSTAWCY** (klasa z V12K-326, 6 modułów / 22 ścieżki): po S9-13 zaktualizuj
   inwentarz klasy (sldDeltaOverlay powinien zejść z listy) i domknij pozostałe.
7. **S9-12-DLUG-LATERAL-ETYKIETA**: etykieta lateralnego VT przegrywa w declutterze z ES
   w tej samej kolumnie X (pin 405/406 w teście; naprawa = geometria kolumny lateralnej).
8. Dług kontraktowy B-5 (koszt `apply` liniowy — zmiana kontraktu kopii, zarezerwowana V12K-325);
   nested branch points + punkt odgałęźny za GPZ (stopNote); menu punktu odgałęźnego
   (najpierw zweryfikuj realne operacje domenowe); SA→F: sprawdź czy wiersz V12K-329 wymaga
   aktualizacji po S9-12.

## 5A. FALA 3 — FAKTY ZMIERZONE Z GÓRY (2026-08-07, Opus; nie mierzyć ponownie)

Pomiar wykonany w repo głównym na szczycie `aa053500`, żeby karty fali 3 poszły bez
rozpoznania od zera. Liczby są stanem PRZED dla tych kart.

**V126-OKNA** (wiersz „Pakiet akademicki V12.6" §6 inwentarza, ◐):
- Powierzchnia zastana `frontend/src/ui/workspace/surfaces/V126AcademicSurface.tsx` —
  **334 wiersze, ZERO testów** (brak pliku w `surfaces/__tests__/`); osiągalna przez most
  „Pozostałe analizy"; wg wiersza macierzy ślad ucięty do 8 kroków, raport do 3 sekcji,
  kolory poza tokenami `--mvd-*`.
- Backend `backend/src/api/v126_academic.py` (prefiks `/api`, wpięty) niesie SIEDEM
  rodzin końcówek — to jest kontrakt, z którego wyprowadza się kompletność okien:
  `POST /api/cases/{case_id}/runs/v126/{analysis_type}` (uruchomienie),
  `GET /api/analysis-runs/{run_id}/results/v126/{analysis_type}` (wynik),
  `…/{analysis_type}/trace` (ŚLAD — pełny, nie 8 kroków),
  `…/ssci_impedance/stability` (dedykowany wynik SSCI),
  `…/{analysis_type}/proof` (DOWÓD), `…/{analysis_type}/report` (RAPORT),
  `GET /api/catalog/v126/{namespace}` (katalog danych wejściowych).
- Wzorzec do REUŻYCIA (jedna z 12 analiz ma już własne okno ui2): `frontend/src/ui2/wyniki/ssci/`
  (`EkranSsci.tsx` + `api.ts`). Karta ma zmierzyć, które z 12 rodzajów mają okno, a które
  jadą na powierzchni zastanej, i domknąć różnicę wzorcem SSCI + lądowiskiem wyników K3.

**REF-PAKIET** (wiersz „Reference Engine" §6, ◐ — zaszyty pakiet zamiast wyboru):
- `frontend/src/ui2/spaces/model/ZgodnoscReferencyjna.tsx:30` → `const PAKIET_OSD = 'osd_enea';`
  użyte w `:83` (`fetchReferencePack(PAKIET_OSD)`) — ekran zgodności ma pakiet ZASZYTY.
- `frontend/src/ui2/referencje/api.ts:67` → `fetchReferencePacks(...)` (lista `/api/reference/packs`,
  wspiera filtr rodzaju, np. `'manufacturer'`) ma konsumenta **wyłącznie w teście**
  (`ui2/referencje/__tests__/api.test.ts:73,79`).
- Karta: wybór pakietu z listy backendu w obu miejscach zgodności (`spaces/model/ZgodnoscReferencyjna`
  ORAZ `spaces/gotowosc/SekcjaZgodnosciReferencyjnej` — sprawdzić, czy ma tę samą zaszytą stałą:
  KLASA, nie instancja), uczciwy stan zerowy (brak pakietów), pamięć wyboru wg zasad przypadku.

OTWARTE DECYZJE PRODUKTOWE WŁAŚCICIELA (nie rozstrzygać samodzielnie; AskUserQuestion gdy aktywny):
- ujednolicenie podziałki pól L1/L2 (S9-10 pkt C: dwie drogi z kosztami — rezerwacja szerokości
  L2 na L1 poszerza arkusz vs ściśnięcie L2 nakłada aparaty);
- edycja ról istniejących pól mogąca rozbroić pętlę OSD złącza C (dług POMIAR-RODZAJ pkt 1).

## 6. DEFINICJA „100% URUCHOMIENIA"

1. Wszystkie karty z pkt 2 i pkt 5.1–5.6 scalone po odbiorach; CI 8/8 zielone na szczycie.
2. Macierz pokrycia §6 inwentarza: **zero ❌** (uczciwie — ◐ dopuszczalne wyłącznie z jednym
   zdaniem czego brakuje i wpisem w kolejce).
3. Audyt SLD: wszystkie wiersze znalezisk ZAMKNIĘTE / CZĘŚCIOWO z nazwanym długiem w rejestrze
   (żadnego wiersza bez statusu).
4. Zapadka mypy: próg ≤ 18/13 (nigdy podniesiony bez erraty właściciela).
5. Rejestr: każda karta ma wiersz + dopisek odbioru; każdy dług imienny ma właściciela w kolejce.
6. Zrzuty żywej aplikacji (oba motywy) dostarczone właścicielowi po każdej zmianie rysunku.

## 7. SZABLON PROMPTU WYKONAWCY (kopiuj i wypełniaj — sprawdzony na 7 kartach)

```
Jesteś WYKONAWCĄ karty <NAZWA> w /home/user/MV-Design-PRO. Pracujesz wyłącznie po polsku.
Przeczytaj CLAUDE.md — obowiązują: Zero-Debt, KLASA-NIE-INSTANCJA, zakaz fantomów, zakaz
fizyki w UI, polskie etykiety, zakaz kodenamów, determinizm, FROZEN nietknięte.
Kontekst: <wiersze rejestru/audytu/inwentarza — DOKŁADNE ścieżki i numery>.

§0 PROTOKÓŁ TRWAŁOŚCI:
1. NAJPIERW fetch origin claude/przejecie-nadzoru-fable-dtie3b i worktree add
   /tmp/claude-0/-home-user-MV-Design-PRO/wt-<karta> origin/claude/przejecie-nadzoru-fable-dtie3b.
   Pracuj TYLKO w worktree.
2. Po KAŻDYM commicie: git push -f origin HEAD:kopia/<KARTA>. Autor i stopka: patrz §3 dokumentu
   przekazania (dwie linie Co-Authored-By/Claude-Session, commit -F plik).
3. RC bezpośrednio; długie komendy SYNCHRONICZNIE; pełny vitest w SHARDACH ≤2 (limit 10 min).
4. ZAKAZ pkill po wzorcu. 5. Iniekcje: kopia pliku + sha256, przywracanie TYLKO z kopii.
6. node_modules: TWARDY ZAKAZ operacji na katalogu głównego repo — w worktree WYŁĄCZNIE
   symlink DO niego. 7. Guardy z katalogu mv-design-pro/.

ZAKRES (pomiar przed projektem): <1..N punktów; każdy z kryterium PRZED zmierzonym;
inwentarz KLASY przed naprawą; reużycie przed budową; mocne deklaracje = przypięte testy>.
STREFY ZAKAZANE: <pliki równoległych kart>.
BRAMKI KOŃCOWE (RC bezpośrednio): <vitest shardy / pytest+zapadka / accept / tc / lint / guardy>.
DOKUMENTY: wiersz | <KARTA> | w rejestrze (stan PRZED zmierzony, inwentarz, naprawy, iniekcje,
bramki z RC) + aktualizacja audytu/macierzy. MELDUNEK: obalone/potwierdzone, przed/po,
iniekcje, bramki z RC, świadome pominięcia. Commity WYŁĄCZNIE na kopia/<KARTA>.
```

## 8. REJESTR ZMIAN DOKUMENTU

- 2026-08-07: utworzony na dyrektywę właściciela („przygotuj spec i prompty tak, żeby Opus
  dokończył bezbłędnie, bez dryfu i bez zgadywania — do 100% uruchomienia") przy wyczerpującym
  się budżecie sesji nadzorcy Fable.
