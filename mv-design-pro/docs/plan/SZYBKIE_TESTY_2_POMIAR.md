# SZYBKIE-TESTY-2 — pomiar przed i po (dyrektywa właściciela 2026-10-28)

Karta: „Testy trwają zbyt długo, masz je radykalnie skrócić”. Baza `1465336df`, gałąź
`claude/mv-design-pro-twin-audit-u4lhy0-karta-szybkie-testy`. Maszyna: 4 vCPU, 16 GB RAM,
współdzielona z trzema innymi wykonawcami. Każdy bieg w tabeli wyników uruchomiono pod blokadą
`flock /tmp/claude-0/bieg_ciezki.lock` (jeden ciężki bieg na maszynie naraz); wyjścia
w `/tmp/claude-0/logs/st/`. Szczyt pamięci to suma RSS wszystkich procesów sesji biegu,
próbkowana co 3 s (`rss_mierz.sh`).

## 1. Wynik

| Bieg | Przed (baza `1465336df`) | Po (ta karta) | Zmiana |
|---|---|---|---|
| Pełny backend `pytest -q -n 4 --dist loadfile` | RC=0, **41 029 passed**, 2 481,6 s (ściana 2 485 s) | RC=0, **41 037 passed**, 2 130,5 s (ściana 2 151 s), szczyt 4,1 GB | −13 % |
| Kolekcja backendu, jeden proces (`--collect-only`) | 41 033 testy (przed kopiami sieci rejestru), 392,1 s | 41 037 testów, 97,8 s | −75 % |
| Pełny vitest, krok główny | RC=0, 897 passed + 1 pominięty plik, 16 504 testy, 777,8 s (ściana 795 s) | RC=0, 898 passed + 1 pominięty plik, 16 554 testy, 802,2 s (ściana 804 s), szczyt 4,8 GB | +1 % ściany (faza `tests` 971 → 1 172 s — obce obciążenie, patrz niżej) |
| vitest: setup + collect + environment | 93,7 + 359,5 + 506,0 = **959,1 s** | 75,9 + 388,2 + 371,6 = **835,6 s** | −13 % |
| vitest, krok budżetów (`--mode budzety`) | RC=0, 7 plików, 177 testów, 63,2 s | RC=0, 7 plików, 177 testów, 99,3 s — bieg z plikami budżetu w `node`; po przywróceniu im `jsdom` (warunek 5, pliki identyczne z bazą) bez pomiaru pod blokadą | bez zmiany zakresu |
| Bramka `bramka_scalenia.py --baza 1465336df` | 4 515 s (bramka5 gałęzi UI/UX, pomiar z karty) | RC=0, 4 548 s ściany, szczyt 5,7 GB | patrz §3 |
| `guardy_z_ci.py` | 236 s, 4 080 samotestów (bramka5 gałęzi UI/UX, liczba z karty — inne drzewo, inny stan maszyny) | RC=0, „KOMPLET ZIELONY”, 524,7 s, 4 535 samotestów (część (d) bramki), szczyt 4,3 GB | bez pomiaru porównawczego w tych samych warunkach (§5) |

Liczba testów nie spadła: 41 029 → 41 037, czyli +8 nowych testów karty
(`tests/ci/test_kolejnosc_plikow.py` ×4, `tests/ci/test_kopie_sieci_rejestru.py` ×2,
`tests/ci/test_sprzatanie_basetemp.py` ×2). Porównanie list `--collect-only` przed kopiami sieci
rejestru (41 033 = baza + 4 testy kolejności) i po nich (41 037): 0 testów ubyło. Żaden test nie
został usunięty jako duplikat.
Jedyny pominięty plik vitest (`src/ui/sld/v3/scene/__tests__/sygnaturySceneFikstur.test.ts`,
`it.skipIf(!wyjscie)`) jest generatorem sygnatur uruchamianym jawnie zmienną środowiskową — był
pominięty przed i po, karta go nie dotyczy.

Kryteria karty — stan zgodny z pomiarem:

* **Pełna regresja backendu wyraźnie szybsza** — spełnione: 2 485 s → 2 151 s ściany (−13 %),
  przy 8 testach więcej.
* **vitest: setup + collect + environment co najmniej o połowę** — **NIE spełnione.** Ważny pełny bieg po zmianie (RC=0):
  959,1 s → 835,6 s (−13 %). Te same składniki w dwóch innych biegach po zmianie: krok vitest
  bramki 68,5 + 361,0 + 325,5 = 755,0 s (−21 %) i bieg z jednym plikiem czerwonym (przyczyna
  niżej) 59,5 + 305,8 + 285,1 = 650,4 s (−32 %). Składniki są sumą czasów ściennych faz
  wszystkich plików, więc rosną z obcym obciążeniem maszyny (faza `tests`, której karta nie
  zmieniała, wahała się w tych biegach 960–1 172 s). Środowisko spadło najbardziej
  (506 → 285–372 s), collect prawie wcale (359 → 306–388 s): 546 z 906 plików potrzebuje DOM
  (§3.4), a collect to wykonanie grafu modułów każdego pliku w świeżym procesie.
* **Typowa bramka ≤ 15 min** — NIE spełnione dla zmiany korzenia grafu i nie może być spełnione
  bez utraty nadzbioru (§3).

## 2. Polecenia

Backend (z `mv-design-pro/backend`, interpreter venv backendu):

    flock /tmp/claude-0/bieg_ciezki.lock env PYTHONPATH=src:. <venv>/bin/python -m pytest -q \
        -p no:cacheprovider -n 4 --dist loadfile --basetemp <prywatny katalog>

vitest (z `mv-design-pro/frontend`, prywatny `MVD_VITE_CACHE_DIR`):

    flock /tmp/claude-0/bieg_ciezki.lock npx vitest run                 # krok główny
    flock /tmp/claude-0/bieg_ciezki.lock npx vitest run --mode budzety  # krok budżetów

Bramka (z `mv-design-pro/backend`):

    flock /tmp/claude-0/bieg_ciezki.lock env PYTHONPATH=src:. <venv>/bin/python \
        ../scripts/bramka_scalenia.py --baza 1465336df --basetemp <prywatny katalog>

## 3. Dźwignie — każda zmierzona, wybór i odrzucenie z liczbą

### 3.1 Rozkład pracy xdist (`loadfile` / `worksteal` / `-n auto`)

Zmierzone czasy plików (`--durations` po pliku, 909 plików, suma 6 480 s czasu wykonania,
największy plik 667 s) zapisano w `backend/tests/czasy_plikow.json`. Symulacja przydziału na
4 procesy: dolna granica to max(6 480 / 4 = 1 620 s, 667 s) = 1 620 s; przydział LPT (najdłuższy
plik najpierw do najmniej obciążonego procesu) daje 1 620 s, czyli dolną granicę. `worksteal`
nie może dać mniej niż ta granica, a rozbija pliki, które dzielą fikstury modułowe i stan magazynu
ENM na procesie (`tests/conftest.py`: magazyn ENM, baza sesyjna i jeden wątek BLAS na proces) —
każda przeniesiona fikstura `module` buduje się ponownie na drugim procesie. Wybór: `loadfile`
z kolejnością LPT (`tests/kolejnosc_plikow.py`, hak `pytest_collection_modifyitems`
w `tests/conftest.py`, `--no-loadscope-reorder` w `addopts`, żeby xdist nie przestawiał plików
wg rozmiaru). Przed zmianą xdist kolejkował pliki wg liczby testów, nie czasu: najdłuższe pliki
(solvery dynamiki, sieci referencyjne) startowały na końcu i jeden proces kończył samotnie.
`-n auto` na tej maszynie to 4 procesy — to samo co `-n 4`; CI (`python-tests.yml`) zostaje
przy `-n auto`.

### 3.2 Najwolniejsze testy i fikstury

Profil kolekcji (jeden proces, `--collect-only`): 392 s, z czego ~49 s czasu ściany i większość
pamięci to budowa 61 sieci rejestru golden przy KAŻDYM imporcie modułu, który je parametryzuje
(`functools.cache` per moduł, ten sam zestaw budowany w wielu modułach). Naprawa u źródła:
`tests/golden/registry.py::kopie_sieci_wpisu` — sieć budowana raz na proces, wydawana jako
głęboka kopia, więc test mutujący sieć nie zmienia następnemu testowi danych. Iniekcja przypięta
testem: `tests/ci/test_kopie_sieci_rejestru.py::test_mutacja_kopii_nie_przecieka_do_nastepnej`
(wydanie oryginału zamiast kopii → 1 failed). Kolekcja 392 s → 98 s. Koszt pamięci: ~58 MB na
proces.

Pozostałe najwolniejsze testy (`--durations=200`) to rzeczywiste obliczenia solverów (dynamika
RMS, FRT, sieci referencyjne 52 szyn, estymacja stanu, macierze scenariuszy) i fikstury
substratów, które liczą wynik, z którego korzysta wiele testów — nie ma w nich `sleep`
ani powtarzanego budowania tego samego wejścia. Ponowne użycie budowy G00 w `test_registry`
dawało poniżej 1 % — niewdrożone.

### 3.3 Precyzja wyboru w bramce

`pytest-testmon` zmierzony na drzewie zabawkowym: zmiana wartości domyślnej pola dataklasy
i stałej modułu dała „1 passed, 2 deselected” przy dwóch czerwonych testach pełnego biegu (ciało
klasy i stałe wykonują się przy imporcie, `lru_cache` ukrywa drugą zależność) — wybór pokryciem
nie jest nadzbiorem, odrzucony. Graf importów zostaje; dołożono trzecią regułę danych — SKAN
KATALOGU (`scripts/skany_katalogow.py`): 52 pliki testów backendu czytają katalogi
(`glob`/`rglob`/`os.walk`…), a przed regułą zmiana pliku frontu nie wybierała żadnego z nich
(defekt nadzbioru — naprawiony, testy `scripts/test_skany_katalogow.py`, 101 passed).
Wybór dla zmiany `enm/models.py`: komplet plików backendu — `tests/conftest.py` importuje
`enm/domain_operations.py`, a ten `enm/models.py`, więc w grafie importów od modelu zależy każdy
test.

Wybór pokryciem wykonania dla tego przypadku zmierzono trzema pomiarami (2026-10-29):

* **Rodzaj zmian w historii.** Porównanie szkieletu modułu (drzewo składni z ciałami funkcji
  zastąpionymi `pass`) przed i po każdym commicie: `enm/models.py` — 2 z 18 commitów zmieniało
  wyłącznie ciała funkcji, `enm/validator.py` — 6 z 27, `enm/topology.py` — 1 z 8. Moduł
  `enm/models.py` to 84 klasy pydantic i 9 funkcji; typowa zmiana to pole klasy (ciało klasy,
  wykonywane przy imporcie).
* **Ślepota pokrycia linii na pola modeli.** Iniekcja `ENMDefaults.frequency_hz: 50.0 → 60.0`
  (linia 200) czerwieni `tests/enm/test_tolerancja_nn_iloczyn_cech.py`. Pokrycie tego pliku
  uruchomionego osobno: 886 wykonanych linii `enm/models.py`, z czego 863 to kod wykonywany przy
  imporcie (ciała klas, w tym linia 200), a tylko 23 linie w ciałach funkcji (walidatory, migracja
  zapisu). Budowa instancji modelu pydantic przebiega w `pydantic-core` i nie wykonuje żadnej
  linii klasy, więc pokrycie linii nie widzi zależności od pola. Selektor pokryciem musi albo
  liczyć linie importu (każdy importer zależy — wynik równy grafowi importów, komplet), albo je
  pomijać (testmon: brak nadzbioru, pomiar na drzewie zabawkowym wyżej).
* **Górne oszacowanie zysku nawet przy idealnej zależności klasowej.** 805 z 919 plików testów
  wymienia ENM, sieć, rejestr albo golden; to 6 182 s z 6 480 s zmierzonego czasu wykonania
  (95,4 %). Nawet bezbłędne śledzenie użycia klas modelu wybierze dla zmiany pola większość tego
  czasu, a podłoga ściany na 4 rdzeniach to wtedy ~1 500 s samych testów plus ~500 s strażników.

Wniosek: dla zmiany `enm/models.py` kryterium „≤ 15 min” i kryterium nadzbioru są sprzeczne
na tej maszynie. Wybór pokryciem dałby zysk tylko dla zmian samych ciał funkcji (2 z 18 zmian
modelu) i wymaga bazy pokrycia budowanej w izolowanym procesie na plik testu (współdzielony proces
ukrywa zależność przez pamięci podręczne `lru_cache`/rejestr sieci) — koszt budowy ~1 h biegu pod
blokadą na każdą bazę. Nie wdrożono; rozstrzygnięcie należy do sesji głównej (meldunek). **Typowa bramka ≤ 15 min dla zmiany korzenia jest nieosiągalna
bez utraty nadzbioru:** sam czas wykonania wybranych testów to ~6 480 s CPU, na 4 rdzeniach co
najmniej 1 620 s, a strażniki ~500 s. Dla zmiany liściowej (np. `application/symphony/prompt.py`,
pomiar 2026-10-15: 452–515 s) bramka mieści się w 15 min.

### 3.4 vitest

* **Środowisko `node` regułą, nie ręcznie.** `frontend/scripts/srodowisko_testow.mjs`
  klasyfikuje każdy plik testu po domknięciu importów i zapisuje znacznik
  `// @vitest-environment node`; strażnikiem jest test `src/test/__tests__/srodowiskoTestow.test.ts`
  (krok główny vitest, czyli CI `frontend-checks.yml` i bramka): klasyfikuje prawdziwe drzewo
  i czerwieni się na każdej rozbieżności znacznika z regułą — plik z DOM nie trafi do `node`,
  plik bez DOM nie zostaje w `jsdom`. Stan: 906 plików, 360 `node`, 546 `jsdom` (w tym 7 plików budżetu — warunek 5). Warunek 4 (dodany
  w tej karcie po czerwieni `plikiBudzetuCzasu.test.ts`): domknięcie sięgające modułu spoza
  analizowanego zbioru, który importuje `vite`/`vitest/config`/`vitest/node`/`esbuild`/
  `@vitejs/*`, wymaga `node` (pod jsdom esbuild rzuca „Invariant violation: TextEncoder”). Testy:
  `src/test/__tests__/srodowiskoTestow.test.ts` — iloczyn 5 narzędzi × 3 sąsiedztwa × import
  bezpośredni/pośredni (30 przypadków) i kontrast (moduł spoza zbioru bez narzędzi zostaje jsdom);
  wyłączenie warunku 4 daje 20 złych klasyfikacji i 1 rozbieżność `--sprawdz`. Warunek 5:
  iloczyn 3 postaci importu pomocnika czasu × 3 treści pliku (czysta logika / globalny DOM /
  moduł z narzędziami budowania) i kontrast bez importu pomocnika; wyłączenie warunku 5 daje
  6 złych klasyfikacji (replika poza vitest) i 7 rozbieżności znaczników na drzewie.
  Rozkład przyczyn jsdom: 432 pliki `@testing-library/react`, 22 `@tanstack/react-query`,
  20 `zustand/middleware`, ~60 globalne API przeglądarki — dlatego samo przeniesienie na `node`
  nie może zmniejszyć czasu środowiska o połowę: 539 plików potrzebuje DOM.
* **setup.ts:** `@testing-library/jest-dom` ładowany tylko w środowisku z DOM.
* **Pula `threads` / `vmForks`, pamięć kompilacji Node (`NODE_COMPILE_CACHE`)** — NIE zmierzone
  pełnym biegiem. Skrypty wariantów były gotowe (krok główny z czasem procesora całego drzewa
  procesów), ale koordynator przestawił kolejkę blokady (pole liniowe i bramki innych kart przed
  pomiarami tej karty; pomiar tylko przy wolnej blokadzie), a blokada przez ponad 3,5 h nie była
  wolna ani razu. Pomiar jednostkowy bez blokady: `NODE_COMPILE_CACHE` skraca czas procesora
  `require` jsdom o ~18 % (460 → 395 ms) — to nie jest dowód dla całego biegu. Pula zostaje `forks`.
* **Optymalizator zależności vitest (`deps.optimizer`, domyślnie wyłączony w vitest 1.6)** — NIE
  zmierzony z tej samej przyczyny; zależności z `node_modules` są w biegu testów ładowane przez
  Node bez transformacji, a frontend nie ma pakietu z tysiącami plików ESM, więc spodziewany
  zysk jest mały.
* **Pliki budżetu czasu procesora zostają w `jsdom` (warunek 5 reguły).** W trzech biegach kroku
  budżetów z plikami budżetów w `node` czasy plików były 1,4–1,7 × dłuższe niż w bazie
  (`buildScene.p1Recenzja` 31,1 s → 43,7 / 44,6 / 51,7 s; `kosztSceny` 3,1 s → 5,4 / 5,7 / 6,5 s),
  przy fazie `tests` kroku głównego w jednym z tych biegów równej bazie (960 s wobec 971 s).
  Przyczyna (inna ścieżka transformacji modułów vitest dla `node` i `jsdom` albo obciążenie) nie
  została rozdzielona pomiarem; zysk z `node` dla 7 plików to ~2 s środowiska, a ruch kalibracji
  budżetów jest ryzykiem czerwieni. Predykat zbioru budżetów jest jeden dla `vite.config.ts`
  i reguły (`frontend/scripts/budzety_czasu.mjs`); siedem plików budżetu jest identycznych
  z bazą.
* **Przyczyna RC=1 pierwszego biegu „po”.** `src/test/__tests__/plikiBudzetuCzasu.test.ts`
  importuje `vite.config.ts`; pierwsza wersja reguły dała mu `jsdom` (nienapisowy `import()`),
  a esbuild w jsdom pada przy imporcie („Invariant violation: new TextEncoder().encode("")
  instanceof Uint8Array”). Naprawa: warunek 4 reguły z testami iloczynu; plik jest identyczny
  z bazą, kolejny pełny bieg RC=0.

### 3.5 Strażniki

Profil (sekwencyjnie, czas procesora): komplet strażników i lintu 643 s CPU. Najwolniejsze:
`legacy_public_path_guard` 133 s, `tsconfig_gate_guard` 113 s (tsc na pełnym zbiorze — program
identyczny z CI, inny niż `npm run type-check`), `black src tests` 104 s (1 s z pamięcią
podręczną), `grep_zero_guard` 55 s, `mypy_ratchet_guard` 40 s. Naprawy u źródła:

* `legacy_public_path_guard`: jedno skanowanie deklaracji TS zbiorem zamiast wzorca na symbol,
  węzły drzewa składni liczone raz na drzewo — 133 s → 18 s. Przy okazji naprawiono defekt:
  druga definicja `_ts_definicja` przesłaniała pierwszą, więc Pakiet L używał wzorca
  szerszego, niż obiecywał komentarz; jedno źródło `_TS_DEKLARACJA_PREFIKS`. Testy iloczynu:
  6 prefiksów × async × 9 słów × 3 separatory (324 przypadki); iniekcje: wąski prefiks → 2 failed,
  zły zakres nazwy → 288 failed, nieświeża pamięć węzłów → 1 failed.
* `grep_zero_guard`: filtr wstępny po wymaganym literale wzorca (`re._parser`, najdłuższy ciąg
  literałów najwyższego poziomu, brak filtra przy IGNORECASE) — 55 s → 2,9 s. Test: każde
  dopasowanie wzorca zawiera jego literał; iniekcje: literał z powtórzenia opcjonalnego → 4 failed,
  filtr przy IGNORECASE → 1 failed.

Wybór wpływem dla samotestów strażników (4 524 testy, 731 s jednoprocesowo) daje niski zysk:
~71 % czasu to testy uruchamiające strażnika na prawdziwym drzewie repo — każda zmiana pliku
w repo może zmienić ich wynik, więc nadzbiór obejmuje je zawsze. Niewdrożone.

## 4. Pamięć (szczyt sumy RSS procesów biegu)

| Bieg | Szczyt |
|---|---|
| Pełny backend `-n 4` | 4 140 MB (procesy rosną ~510 → 1 050 MB) |
| Bramka `--baza 1465336df` (cała) | 5 683 MB (w kroku vitest) |
| vitest, krok główny | 4 659 MB |
| `guardy_z_ci.py` | 4 289 MB |
| Bramka obca (ZU, `--procesy 2`) | 3 685 MB |
| Bramka obca (BKR, `-n 4`) | 4 370 MB |

Żaden szczyt nie przekracza ~10 GB, więc bramka nie potrzebuje ograniczenia liczby procesów do
dostępnej pamięci; wzrost procesów backendu do ~1 GB to praca testów (kopie sieci, wyniki solverów
w fikstur modułowych), nie wyciek narastający między plikami — `--max-worker-restart` niepotrzebny.

## 5. Czego nie zrobiono

* Warianty puli vitest (`threads`, `vmForks`), `NODE_COMPILE_CACHE` i `deps.optimizer` — bez
  pełnego pomiaru (§3.4, blokada niedostępna po zmianie kolejności przez koordynatora).
* Porównanie `guardy_z_ci.py` przed/po w tych samych warunkach — bez pomiaru z tej samej
  przyczyny; zysk dwóch najwolniejszych strażników zmierzono osobno (133 → 18 s, 55 → 2,9 s).
* Wybór pokryciem wykonania — niewdrożony z dowodem sprzeczności z nadzbiorem (§3.3).
* `CLAUDE.md` („Development Commands”, „Testing Guidelines”) — niezmieniony w tej karcie:
  wykonawca nie edytuje `CLAUDE.md` na polecenie innego agenta. Proponowane wpisy (do
  naniesienia przez sesję główną albo właściciela): w „Development Commands” pomiar
  „2026-10-29 na 4 vCPU: 41 037 testów — `-n 4 --dist loadfile` 2 151 s (przed kartą
  SZYBKIE-TESTY-2: 41 029 testów, 2 485 s); pliki w kolejności LPT z `tests/czasy_plikow.json`
  (odśwież po zmianie czasów: `tests/kolejnosc_plikow.py`)”; w „Testing Guidelines”: „środowisko
  pliku testów wyznacza reguła `frontend/scripts/srodowisko_testow.mjs` (`--zapisz` wpisuje
  `// @vitest-environment node`, test `src/test/__tests__/srodowiskoTestow.test.ts` czerwieni
  się na rozbieżności); pliki budżetu czasu procesora zostają w `jsdom`”.
