# Karty otwarte programu — treść kart wykonawczych utrwalona dla wznowienia (stan 2026-09-30)

> **Utrwalenie dla wznowienia (2026-09-30).** Treść karty powstała w katalogu roboczym sesji, który ginie z kontenerem; tu jest przeniesiona bez zmian merytorycznych. Ścieżki `<scratchpad>/…` i `<worktrees>/…` oznaczają katalogi tamtej sesji — nowa sesja podstawia własne (meldunki i logi karty nie przetrwały; dowodem wykonania jest commit i wpis rejestru `PLAN_AB_DYNAMIKA_A_B_2026-09.md` §7). Stan karty i kolejność prac: `STAN_REPO.md` §7 (pakiet wznowienia).

Karty duże programu A/B mają osobne pliki: `KARTA_AB_1B2_AB_1DMIN_GFL_2026-09.md` (AB-1b.2 + AB-1d_min) i `KARTA_AB_1B3_ODBIORY_2026-09.md` (AB-1b.3 z częścią AB-1b.3b). Karty W5 i W6 wykonane albo zaprojektowane wcześniej żyją w `KARTA_W5_*`, `KARTA_W6_*`; W5-A i W5-D są wykonane (`56d1a205`, `d3687ba3`, `ced1b25b`, `03fad2b8`), podkarty W5-B, W5-C, W5-E, W5-T i SZABLONY-NN pisze się z `KARTA_W5_MODEL_FAZOWY_I_UZIEMIENIE_2026-09.md` §1. Karty bez pełnej treści (DYNAMIKA-W-TLE, KATALOG-DYNAMIKI-BRAKI, AB-1c, O-52, CICHE-ZERO) mają szkice §0 na końcu tego dokumentu (O-57); stan całości i kolejność — `STAN_REPO.md` §7 C–E.

## Spis

| Karta | Stan 2026-09-30 | Gałąź lokalna i baza | Praca w toku na gałęzi zdalnej |
|---|---|---|---|
| ODMOWA-DANYCH-422 | W TOKU | `int/odmowa422`, baza `e233886a` | `claude/mv-design-pro-twin-audit-u4lhy0-wip-odmowa-422` |
| POLA-W-TORZE | W TOKU | `int/polawtorze`, baza `e8756f42` | `claude/mv-design-pro-twin-audit-u4lhy0-wip-pola-w-torze` |
| SLD-SUBSTRAT (faza 2) | W TOKU (pierwszy commit `79869f91` odebrany) | `int/sldsubstrat`, baza `4199d528` | `claude/mv-design-pro-twin-audit-u4lhy0-wip-sld-substrat` |
| BIEG-ZABEZPIECZEN-Z-MODELU | W TOKU | `int/nastawy`, baza `3840e239` | `claude/mv-design-pro-twin-audit-u4lhy0-wip-nastawy` |
| SIEC-ZLOTA-KATALOG | NIE ROZPOCZĘTA | — | — |
| GOTOWOSC-DER-BACKEND | NIE ROZPOCZĘTA | — | — |
| ENDPOINTY-BEZ-KONSUMENTA | NIE ROZPOCZĘTA (po ODMOWA-DANYCH-422) | — | — |
| KOMUNIKATY-BEZ-ID | NIE ROZPOCZĘTA | — | — |
| LICZBY-PL | NIE ROZPOCZĘTA | — | — |
| PL-ZNAKI-2 | NIE ROZPOCZĘTA | — | — |
| O-53b (moc źródeł × transformator × nastawa) | NIE ROZPOCZĘTA | — | — |
| AB-H0b (pozycje zebrane) | NIE ROZPOCZĘTA — lista pozycji, karta do napisania | — | — |
| DYNAMIKA-W-TLE | NIE ROZPOCZĘTA — szkic §0 (O-57, koniec dokumentu) | — | — |
| KATALOG-DYNAMIKI-BRAKI | NIE ROZPOCZĘTA — szkic §0 (O-57, koniec dokumentu) | — | — |
| AB-1c | NIE ROZPOCZĘTA — szkic §0 (O-57, koniec dokumentu) | — | — |
| O-52 | NIE ROZPOCZĘTA — szkic §0 (O-57, koniec dokumentu) | — | — |
| CICHE-ZERO | NIE ROZPOCZĘTA — szkic §0 (O-57, koniec dokumentu) | — | — |

## Reguła biegów weryfikacyjnych (obowiązuje wykonawców i integratora)

### Reguła biegów weryfikacyjnych: wykonawca celowo, integrator w pełni (obowiązuje od 2026-09-25)

Powód: maszyna ma 4 CPU i jest współdzielona przez kilku wykonawców i integratora. Cztery
równoległe pełne regresje backendu (każda ~25 000 testów) zajęły wszystkie rdzenie i każda
trwała kilka razy dłużej niż sama — wykonawcy wyglądali na zawieszonych przez wiele godzin,
a osierocone serwery e2e trzymały porty. Pełna regresja wykonawcy i tak nie jest dowodem
odbioru: integrator powtarza ją na drzewie scalonym (karta nie widzi zmian innych kart).

#### Wykonawca (w drzewie karty)

1. Testy celowane warstw dotkniętych: pliki testów modułów zmienionych ORAZ testy, które te
   moduły importują (wyznaczone grepem po nazwie modułu w `backend/tests`), z prywatnym
   `--basetemp` w katalogu karty w scratchpadzie. Zbiór i sposób jego wyznaczenia w meldunku.
2. `python scripts/guardy_z_ci.py` (komplet strażników CI) i samotesty strażników, które karta
   zmienia (uruchamiane OSOBNO z katalogu `scripts`, nie razem z testami backendu).
3. Frontend (jeśli dotknięty): `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, vitest
   modułów dotkniętych (`npx vitest run --no-file-parallelism <katalogi>`), speki e2e ekranów
   dotkniętych na realnym backendzie (porty z karty, serwery sprzątane po biegu).
4. Generatory fikstur i migawek, które karta może zmienić (OpenAPI, harness, projekcje nN,
   `emit_sld_network_fixture`), z dowodem determinizmu (dwa biegi = te same bajty).
5. Jeden ciężki proces naraz, w tle, z plikiem-znacznikiem końca; bez `pgrep -f` wzorcem
   własnej komendy; procesy zabijane po PID; nigdy nie kasuj cudzych katalogów tymczasowych.
6. Każdy bieg testów (pytest, vitest) na maszynie współdzielonej z `OPENBLAS_NUM_THREADS=1
   OMP_NUM_THREADS=1`; backend speców e2e dostaje jeden wątek z `playwright.config.ts` (karta
   WATKI-BLAS-E2E). Pomiar 2026-09-30 przy obciążeniu 16–18 na 4 CPU:
   odwrócenie macierzy 800×800 (×6) przy domyślnych 4 wątkach OpenBLAS — 17,6 s ścienne i 9,3 s CPU,
   przy 1 wątku — 3,9 s i 1,6 s (wątki BLAS wirują w oczekiwaniu i mnożą obciążenie całej maszyny);
   bieg zwarcia sieci 50 stacji w e2e — 866 s zamiast 6 s. Wyjątek: testy, które same ustawiają liczbę
   wątków w podprocesach (oś determinizmu). W CI pytest i vitest biegną na domyślnej liczbie wątków
   runnera (jeden proces liczący na runner), backend e2e — na jednym wątku z konfiguracji.

Pełnej regresji backendu, pełnego vitest i pełnego e2e wykonawca NIE uruchamia, chyba że karta
wprost tego żąda (np. zmiana rdzenia solvera z parytetem całej suity).

#### Integrator (sesja główna, drzewo `odbior-*` partii)

Raz na partię, na drzewie scalonym, jeden bieg naraz: pełna regresja backendu
`-m "not pandapower and not andes"` z prywatnym `--basetemp`, `guardy_z_ci.py`, generatory
fikstur, type-check, lint, pełny vitest `--no-file-parallelism`, speki e2e partii na realnym
backendzie. Kody wyjścia łapane bezpośrednio do pliku stanu łańcucha.

---

## ODMOWA-DANYCH-422

**Stan 2026-09-30:** W TOKU.

### Karta ODMOWA-DANYCH-422 — odmowa dziedziny jako nazwany typ; obcy `ValueError` nie staje się błędem użytkownika

Drzewo: `<worktrees>/odbior-odmowa422` (gałąź `int/odmowa422`, baza =
`e233886a` = czubek partii 5: partia 4 + AB-P1 + PROOFPACK + S95-START + #151; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/odmowa422/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

Karta #151 zamknęła klasę „połknięty wyjątek” strażnikiem AST z budżetem 0. Zostawiła jedno
miejsce tej samej klasy, bo zmiana jest przekrojowa: globalny handler FastAPI zamienia KAŻDY
`ValueError` na HTTP 422. `ValueError` jest dziś konwencją odmów dziedziny (839 `raise ValueError`
w `backend/src` i 97 `except ValueError` w `backend/src/api` — pomiar na `e233886a`), ale ten sam typ rzuca każdy błąd programu. Uszkodzony JSON fikstury, zły
indeks czy błąd konwersji wychodzą więc do projektanta jako „błąd danych” (4xx) zamiast jako
błąd programu (500 z pełnym śladem w dzienniku). To samo przebranie obcego wyjątku za błąd
użytkownika, które karta #151 usunęła wszędzie indziej. Po #151 404 daje wyłącznie nazwana
odmowa `network_model/brak_zasobu.py::BrakZasobuError` — tu robisz to samo dla 422.

#### §0 Rozstrzygnięcia

1. **Jeden nazwany typ odmowy danych** (`OdmowaDanychError(ValueError)` albo nazwa zgodna
   z konwencją repo, w liściu obok `brak_zasobu.py`). Globalny handler zamienia na 422 wyłącznie
   ten typ. Obcy `ValueError` wybucha jako 500 z pełnym śladem w dzienniku.
2. **Inwentarz klasy** (w meldunku, `plik:linia`, decyzja): każdy `raise ValueError` w
   `backend/src`, który dociera do odpowiedzi HTTP, oraz każdy handler łapiący `ValueError` na
   granicy API.
   - Odmowa dziedziny (walidacja danych wejściowych, reguła modelu, brak danych projektowych)
     → nazwany typ.
   - Błąd programu → zostaje `ValueError` albo staje się asercją.
   - Klasyfikacja po znaczeniu, nie po tekście komunikatu.
   - Rdzenie B-01 bez zmian: odmowy rdzeni tłumaczysz na granicy warstwy aplikacji po typie
     albo kodzie (jak w #151).
   - Krotki odmów z #151 (`ODMOWY_OBLICZENIA_BIEGU`) są już jedynym źródłem dla biegów. Sprawdź,
     czy po tej karcie powinny łapać nazwany typ zamiast `ValueError`, i zdecyduj z uzasadnieniem.
3. **Kody HTTP tras.** Zmieniają się wyłącznie dla błędów programu (422 → 500). Każda trasa,
   której odmowa dziedziny dziś daje 422, daje 422 dalej, z tym samym komunikatem. Migawka
   OpenAPI z generatora; nowe odpowiedzi deklarujesz addytywnie.
4. **Strażnik:** rozszerzasz `polykanie_wyjatkow_guard` albo tworzysz nowy AST. Warunek: globalny
   handler i handlery tras nie łapią gołego `ValueError` jako błędu użytkownika. Nowy
   `raise ValueError` w warstwie API/aplikacji, który dociera do odpowiedzi, wymaga nazwanego
   typu. Lista dozwolona pusta, samotest.
5. **Podklasy `ValueError` z bibliotek** (zmierzone MRO w venv projektu): `pydantic_core.ValidationError`,
   `json.JSONDecodeError`, `UnicodeDecodeError` i `numpy.linalg.LinAlgError` dziedziczą po `ValueError`.
   Dziś każda z nich trafia do handlera 422; po zmianie domyślnie wybuchnie jako 500. Każde
   miejsce, w którym te wyjątki mogą dotrzeć do odpowiedzi, klasyfikujesz po znaczeniu i ujmujesz
   w inwentarzu:
   - walidacja albo parsowanie danych od użytkownika (import pliku, treść żądania walidowana
     w usłudze) → odmowa danych, tłumaczona jawnie na nazwany typ z tym samym komunikatem;
   - dane wewnętrzne (fikstura, katalog, stan zapisany przez program) → błąd programu, 500;
   - macierz osobliwa w biegu obliczeń → decyzja zgodna z punktem o `ODMOWY_OBLICZENIA_BIEGU`.
6. **Testy jako iloczyn cech:** {odmowa dziedziny (nazwany typ), obcy `ValueError`, obcy inny
   wyjątek} × {warstwa usługi, trasa API, bieg analizy, operacja domenowa}. Wyrocznia: 422 z
   komunikatem PL wyłącznie dla nazwanego typu, 500 z pełnym śladem w dzienniku dla reszty.

#### Granice

- Minimalny ślad w liniach `raise`: zmieniasz typ (i import), nie przeformatowujesz otoczenia.
  Równolegle pracują AB-1b.3b (rdzeń dynamiki, ENM `Load`), POLE-ZAJĘTE (operacje przyłączania
  odcinka w `enm/domain_operations*`), SLD-SUBSTRAT (fikstury SLD) i DOWOD-CIEPLNY (analizy
  cieplne, `equipment_checks`). Konflikty scala integrator, więc każda linia poza zmianą typu
  to koszt.

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian; kontrakty FROZEN nietknięte.
- Komunikaty odmów bez zmian treści (klasę komunikatów prowadzi karta KOMUNIKATY-BEZ-ID).
  Zmieniasz typ, nie tekst.
- Fikstury e2e i harnessu wyłącznie z generatorów.

#### Kryterium ukończenia

- Inwentarz klasy z decyzjami.
- Strażnik czerwony na bazie (dowód), zielony po naprawie; samotest.
- Testy iloczynu cech; testy celowane backendu wszystkich dotkniętych modułów i tras (grep po
  zmienionych modułach i po `TestClient`).
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Pełną regresję robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## POLA-W-TORZE

**Stan 2026-09-30:** W TOKU.

### Karta POLA-W-TORZE — aparat pola stacji w torze prądowym elementu, któremu pole służy; jeden predykat ścieżki zasilania na grafie galwanicznym

Drzewo: `<worktrees>/odbior-polawtorze` (gałąź `int/polawtorze`, baza `e8756f42`
= partia 5 + POLE-ZAJĘTE; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/polawtorze/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

Karta POLE-ZAJĘTE (jedno źródło zajętości pola liniowego, `enm/zajetosc_pol.py`) wykazała, że stacja
wstawiona w odcinek nie przyłącza kabli przez swoje pola. Pomiar na `e233886a`
(`backend/src/enm/domain_operations.py`):

- `insert_station_on_segment_sn`:
  - lewa połówka kończy się na szynie głównej (`"to_bus_ref": sn_bus_id`, :6926);
  - prawa zaczyna się na szynie głównej albo na sekcji B (`right_from_bus_id`, :6824/:6965);
  - strona górna transformatora wisi na szynie głównej (`"hv_bus_ref": sn_bus_id`, :7279);
  - każde pole dostaje własny zacisk techniczny (`sn_field_terminal/{idx}`, :7048) i zamknięty
    aparat szyna → zacisk, ale do zacisku nic nie jest przyłączone.
- `append_station_on_endpoint` (od :10253): szyna końca ciągu staje się szyną główną stacji,
  a pole WE wskazuje ją jako swój zacisk.

Skutki inżynierskie:

1. **Aparat pola jest martwy elektrycznie.** Otwarcie łącznika pola WY stacji przelotowej — typowy
   punkt normalnie otwarty pierścienia SN — nie zmienia topologii. Wyłączenie pola
   transformatorowego nie odłącza transformatora.
2. **Przez aparat pola nie płynie prąd.** Każdy konsument prądu pola (dobór i sprawdzenie aparatu:
   prąd znamionowy, zdolność wyłączania wobec Ik; przekładnik i zabezpieczenie pola; bilans pola)
   dostaje zero albo sięga po prąd odcinka obejściem.
3. **Dwie ścieżki tej samej fizyki.** GPZ przyłącza odcinki do zacisków pól (ciąg z zacisku pola,
   przydział pól GPZ), a stacja wstawiona w odcinek — do szyny.
4. **Zajętość fałszywa.** Pole WY stacji przelotowej jest wolne w jedynym źródle prawdy, choć
   fizycznie wychodzi z niego dalsza połówka. „Kontynuuj ciąg” proponuje więc nowy kabel z pola,
   z którego wychodzi już kabel.

Kontrakt operacji (`docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md` §4.4: `switch_type_upstream` /
`switch_type_downstream` — łącznik od strony zasilania i od strony odbioru) zakłada połówki
przyłączone przez aparaty pól. Kod odbiega od kontraktu.

#### §0 Rozstrzygnięcia (decyzja architekta, wariant (a) z meldunku POLE-ZAJĘTE)

1. **Zasada toru.** Element, któremu pole służy, jest przyłączony do zacisku tego pola, a aparat
   pola leży w jego torze prądowym. Dotyczy to:
   - końca odcinka SN (pole liniowe WE/WY/odgałęźne);
   - strony górnej transformatora (pole transformatorowe);
   - toru pomiaru rozliczeniowego, jeśli pole pomiarowe leży w torze
     (`docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`);
   - elementów strony nN przyłączanych przez pola rozdzielnicy nN (odpływy, pole transformatorowe
     nN, pola źródeł).

   Szyna główna (sekcja) niesie wyłącznie aparaty pól i sprzęgła. Tak samo dla SN i nN, dla
   każdej drogi budowy stacji.
2. **Inwentarz klasy przed naprawą** (w meldunku, `plik:linia`, decyzja): każda operacja i każdy
   budowniczy, który tworzy pola stacji albo przyłącza element do stacji z polami. Minimum:
   - `insert_station_on_segment_sn`, `append_station_on_endpoint`;
   - kreator i konfigurator stacji (dodanie pola do istniejącej stacji, szablony klasy A–D);
   - `start_branch_segment_sn`, `continue_trunk_segment_sn`, `connect_secondary_ring_sn`;
   - przydział pól GPZ; złącze kablowe SN i każdy inny aparat z polami wstawiany w odcinek;
   - transformator (`add_transformer_sn_nn` i ścieżki stacji);
   - odbiory i źródła nN (`add_nn_load`, `add_converter_source`, `add_genset_nn`, `add_ups_nn`
     i ich odpowiedniki), podrozdzielnie nN;
   - import (XLSX, CGMES, archiwum) — czy tworzy pola i czy obchodzi je tak samo;
   - budowniczy sieci referencyjnych i złotych w `backend/tests/**`, generatory fikstur.

   Pozycja świadomie poza naprawą wymaga uzasadnienia merytorycznego.
3. **Inwentarz konsumentów** (w meldunku, `plik:linia`, decyzja). Każde miejsce, które:
   - czyta prąd, moc albo stan aparatu pola (dobór i sprawdzenia aparatów, przekładniki,
     zabezpieczenia, bilans pola, nakładka wyników SLD);
   - wyznacza pole elementu (zajętość pól, rysunek SLD, drzewo projektu, karta techniczna);
   - odpowiada na pytanie o ścieżkę zasilania.

   Obejście, które dziś bierze prąd odcinka zamiast prądu aparatu pola, zostaje skasowane.
   Zostaje jedno źródło: gałąź aparatu pola z wyniku solvera.
4. **Jeden predykat ścieżki zasilania na grafie galwanicznym.**
   - `enm/domain_operations_v2.py::_has_transformer_in_path` (:1481; wołany w
     `domain_operations.py:6031` i `domain_operations_v2.py:6299` — brama przyłączenia źródła
     po stronie nN) opiera się na przynależności szyn do stacji i przynależności transformatora
     do stacji.
   - Obok istnieje `_indeks_transformatorow_wysp`: szyna → transformatory, których strona nN leży
     w tej samej wyspie galwanicznej.
   - Po przeniesieniu transformatora na zacisk pola predykat przynależności przestałby widzieć
     transformator. Już dziś nie widzi ścieżki przez podrozdzielnię nN zasilaną kablem nN.
   - Zostaje jeden predykat na grafie. Każdy wołający przechodzi na niego, a stary znika.
   - Test iloczynu: {źródło na szynie nN stacji, na podrozdzielni nN za kablem, na polu źródła nN}
     × {transformator przez pole TR, bez transformatora w wyspie, łącznik otwarty w drodze}.
5. **Zajętość i punkt startu ciągu.**
   - Po naprawie pola WE i WY stacji przelotowej są zajęte z jedynego źródła
     (`enm/zajetosc_pol.py`, bez nowej reguły).
   - „Kontynuuj ciąg” ze stacji przelotowej startuje z wolnego pola liniowego. Gdy takiego nie ma,
     wraca nazwana odmowa z akcją naprawczą: dodaj pole liniowe w konfiguratorze stacji.
   - Nigdy nie powstaje kabel równoległy z pola zajętego.
   - Spec e2e S9-5 (ogniwo 4) przepisujesz do tego kanonu z komentarzem intencji. Spec ćwiczy
     realną ścieżkę użytkownika (natywne kliki), bez osłabiania asercji.
6. **Walidator i gotowość.**
   - Niezmiennik zasady toru dostaje regułę walidatora z kodem kanonicznym, akcją naprawczą
     i testem: element przyłączony do szyny stacji z pominięciem pola, które mu służy.
   - Modele zapisane wcześniej nie są migrowane (zasady inżynierskie CLAUDE.md, pkt 1). Walidator
     je wskazuje, a akcja naprawcza przepina element operacją domenową.
   - Fikstury, sieci referencyjne i złote wyłącznie z generatorów i budowniczych.
7. **Rozwiązanie łączników w przygotowaniu wejścia solvera.**
   - Zmierz i opisz w meldunku, jak `solver_input/**` traktuje zamknięte aparaty o zerowej
     impedancji (scalanie węzłów).
   - Wyniki liczbowe rozpływu i zwarć dla sieci złotych muszą zostać bez zmian (napięcia węzłów,
     prądy odcinków, Ik). Zmieniają się wyłącznie:
     - odciski modelu wejściowego;
     - liście opisujące aparaty pól, bo płynie przez nie realny prąd;
     - liście zależne od nich (sprawdzenia aparatów).
   - Każdą inną różnicę wyjaśniasz jako defekt. Dowód liść po liściu w meldunku.
   - Jeśli rdzeń B-01 (`scripts/rdzenie_b01.py`) okaże się miejscem, które trzeba zmienić,
     zatrzymujesz się tylko z tym punktem: pozycja do decyzji właściciela z pomiarem.
8. **Rysunek SLD.**
   - Kabel wchodzi w symbol pola, któremu jest przyłączony, tak jak w GPZ. Rysunek wynika
     z topologii modelu, nie z roli pola odgadywanej po kolejności.
   - Zaciski techniczne pozostają niewidoczne (`render_on_sld: False`).
   - Kadry stacji przelotowej, końcowej, sekcyjnej i odgałęźnej regenerujesz specami w obu
     motywach. To materiał B-02 bez Twojego werdyktu.

#### Testy jako iloczyn cech

- {droga budowy stacji: wstawienie w odcinek, koniec ciągu, kreator/konfigurator, szablon A/B/C/D,
  sekcyjna} × {element: połówka WE, połówka WY, odgałęzienie, pierścień, transformator, pomiar w torze,
  odbiór nN, źródło nN} → element na zacisku właściwego pola, aparat pola w torze.
- {stan aparatu pola: zamknięty, otwarty} × {pole: WE, WY, TR, odpływ nN} → otwarcie odłącza
  element w topologii studium i w wyniku rozpływu.
- {konsument: sprawdzenie aparatu, zabezpieczenie/przekładnik, nakładka SLD, zajętość, brama PV} →
  wartość z gałęzi aparatu pola zgodna z prądem elementu.
- Parytet wyników liczbowych sieci złotych przed i po, bitowo tam, gdzie to możliwe; w przeciwnym
  razie z tolerancją uzasadnioną w meldunku.
- Test czerwony na bazie dla każdej zasady (dowód), zielony po naprawie.

#### Granice

- Rdzenie B-01 bez zmian; kontrakty FROZEN wyników nietknięte; pola nowe wyłącznie addytywne
  (migawka OpenAPI z generatora).
- Determinizm: dwa przebiegi generatorów dają te same bajty.
- Równolegle pracują i zmieniają te same pliki:
  - SLD-SUBSTRAT: fikstury SLD z budowniczego, reguła kompletności rysunku, ZK SN przed pierwszą
    stacją, wiązanie katalogowe aparatów nN po migracji;
  - ODMOWA-DANYCH-422: typ odmów w liniach `raise` w całym `backend/src`;
  - AB-1b.3b: rdzeń dynamiki i `Load` w ENM.

  Ich zakresu nie przebudowujesz. Zmiany w liniach, które oni zmieniają, ograniczasz do
  koniecznych — konflikty scala integrator.

#### Kryterium ukończenia

- Inwentarz klasy (budowa) i konsumentów z decyzją dla każdej pozycji.
- Testy iloczynu cech zielone, czerwone na bazie. Testy celowane backendu wszystkich dotkniętych
  modułów i tras (grep po zmienionych modułach i po `TestClient`).
- Parytet liczbowy sieci złotych z dowodem liść po liściu.
- Vitest modułów dotkniętych, `npm run type-check`, `npm run lint`, `npm run accept:sld-v3`.
- Speki e2e ekranów dotkniętych na realnym backendzie (porty: backend 18871, frontend 5291),
  w tym S9-5.
- Generatory fikstur z dowodem determinizmu.
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Lista kadrów regenerowanych jako materiał B-02.
- Pełną regresję, pełny vitest i pełny e2e robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

### Uzupełnienie karty (2026-09-25, pozycja zmierzona przy integracji partii 5)

Migracja `backend/src/enm/migrations/nn_field_specs_promocja.py` (wołana przy każdym odczycie modelu
w `enm/store.py::get_enm`) promuje pole nN „IN” (wyłącznik główny nN, `stn/…/nn_main_breaker`) tak
samo jak odpływ: `from_bus_ref` = szyna nN stacji; aparat „Wyłącznik główny nN”
(`nn/…/feeder_device`, `type: breaker`); `to_bus_ref` = nowa szyna `nn/…/feeder_bus` o nazwie
„Wyłącznik główny nN”, do której nic nie jest przyłączone. Wyłącznik główny wisi więc na szynie nN jak
odpływ, poza torem transformator → szyna nN, i bez wiązania katalogowego
(`nn_promocja_bez_wiazania_katalogowej: true`, `source_mode: MIGRACJA`).

Skutek w biegach zabezpieczeń sceny koordynacji harnessu: punkt zwarcia i element chroniony to ta
martwa szyna; porównanie zabezpieczeń pokazuje margines rzędu 18 mln %
(`porownanie_scena_wynik_zabezpieczen.json`, `margin_percent_a = 18535590,85`).

Rozstrzygnięcie: wyłącznik główny nN i pole transformatorowe nN należą do zasady toru z §0 pkt 1 karty
— tor transformator (strona dolna) → aparat pola IN → szyna nN. Migracja i jej reguły ról (IN,
odpływy, pola źródeł) wchodzą do inwentarza budowy z decyzją; migrację zmienia się tak, żeby
promowała zgodnie z zasadą toru, bez warstw zgodności. Styk z kartą SLD-SUBSTRAT: reguła „aparat nN
po migracji bez wiązania katalogowego = nazwana pozycja gotowości blokująca wyłącznie analizy
czytające parametry aparatu” — nie przebudowuje się jej, w meldunku zaznacza się miejsce styku.
Margines 18 mln % ma poza tym osobną przyczynę w nastawach (karta BIEG-ZABEZPIECZEN-Z-MODELU) — tu
tylko odnotowanie. Migawki scen harnessu (`koordynacja`, `dynamika`, `lom`, `macierz`, `magazyn`,
`stacja_demo`) idą od partii 5 przez `_model_serwowany` (model po automigracji), więc zmiany
topologii będą w nich widoczne po przegenerowaniu.

---

## SLD-SUBSTRAT (faza 2)

**Stan 2026-09-30:** W TOKU (pierwszy commit `79869f91` odebrany).

### Karta SLD-SUBSTRAT — fikstury substratu 52 stacji zawsze z budowniczego, test świeżości, piny z dowodem

Drzewo: `<worktrees>/odbior-sldsubstrat` (gałąź `int/sldsubstrat`,
baza = `4199d528`, czubek partii integracji 4: pasma napięć, nazwy z jednego źródła, ekrany wyników #145). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/sldsubstrat/meldunek.md`.

#### Po co

Kontrakty SLD v2/v3 (w tym testy uruchamiane przez `sld-determinism.yml`: `layoutEngine.substrate`,
`portAnchoredGeometry.substrate`, `buildScene.*`, `lodContinuity`, `kotwicaLodStacji`,
`obrysArkusza` i ok. 30 innych) czytają `frontend/src/ui/sld/v2/geometry/__tests__/fixtures/
sldSubstrate52s.{enm,powerflow,powerflow.maintenance}.json`. Pliki powstają skryptami
`frontend/scripts/generate-sld-substrate-fixture.py` i `generate-sld-substrate-powerflow.py`
z backendowego `build_sld_substrate_52s()`, ale ŻADEN test nie sprawdza, że zakomitowany plik
równa się wyjściu generatora (inaczej niż `sldNetwork53.ts` —
`tests/application/test_companions_generated.py`). Ostatnia regeneracja: `2024fb4b`
(2026-09-05). Od tego czasu karty zmieniły nazwy elementów, role pól, teksty z polskimi
znakami, komunikaty i odciski (#140–#144, PL-ZNAKI, ETYKIETY-TR, W5-A) — kontrakty SLD mogą
przechodzić na danych, których produkt już nie wytwarza. To ten sam wzorzec co fikstura
bez generatora: test zielony na nieaktualnym wejściu.

Zakres rozszerzony (meldunek NAZWY-JEDNO-ZRODLO): to samo dotyczy WSZYSTKICH statycznych modeli ENM
i fikstur SLD we froncie bez generatora — m.in. `ui/sld/v3/**/fixtures` (nazwy „Odcinek seg/…” sprzed
###144) i `public/test-fixtures/gpzFeeder.enm.json`. Inwentarz: każdy plik JSON/TS z modelem ENM albo
sceną SLD w `frontend/src` i `frontend/public` → generator z backendu (operacje domenowe albo
budowniczy) + test świeżości; plik, którego nie da się wygenerować, uzasadniasz w meldunku.

#### §0 Rozstrzygnięcia

1. Test świeżości w backendzie (obok `test_companions_generated.py`, ta sama technika: generator
   w procesie testu, porównanie bajtowe z plikiem, komunikat mówi, którą komendą
   zregenerować) dla wszystkich trzech plików substratu. Generator deterministyczny (daty i
   odciski przypięte jak dziś).
2. Regeneracja fikstur na czubku; różnice sklasyfikowane: tekst/nazwy/odciski vs geometria i
   topologia. Każda zmiana pinu w testach SLD (liczby elementów, geometria, etykiety, koszty
   sceny) — z atrybucją do konkretnej zmiany danych wejściowych (dowód liść po liściu), nigdy
   „przepisane na nową wartość”. Zmiana, której nie da się przypisać zmianie wejścia = defekt
   do naprawy u źródła.
3. Fikstura jest jedynym źródłem tych danych dla testów — żadnych ręcznych poprawek JSON-a;
   jeśli coś w danych jest złe, poprawia się budowniczego w backendzie.
4. Zrzuty: po regeneracji zrzuty kanwy SLD v3 dla substratu (oba motywy) przed/po do katalogu
   `scratchpad/sldsubstrat/zrzuty/` jako materiał bramki B-02 — werdyktu wizualnego nie
   wystawiasz (B-02 = właściciel).
5. Bajty fikstur niezależne od maszyny. Porównanie bajtowe ma sens tylko wtedy, gdy generator
   daje te same bajty na każdej maszynie. Dziś tak nie jest: `backend/scripts/
   eksport_fixtur_harnessu.py --sprawdz` kończy się kodem 1 na tej maszynie już na czubku, bo
   ostatnie cyfry liczb zmiennoprzecinkowych różnią się od zatwierdzonych plików (numeryka
   BLAS/procesora; meldunek PASMO-1KV §5), a każda regeneracja partii wnosi do repo szum
   liczbowy, który integrator przywraca ręcznie (`kci/klasyfikuj_fixtury_fala.py --przywroc`).
   Inwentarz generatorów fikstur (harness, projekcje nN, `emit_sld_network_fixture`, substrat
   SLD, OpenAPI) i jedna reguła zapisu liczb w fiksturach (stała liczba cyfr znaczących,
   dobrana tak, żeby tolerancje testów konsumentów pozostały z zapasem — dowód), wpięta we
   wszystkie generatory; po niej `--sprawdz` zielony i test świeżości substratu bajtowy.
   Fikstury zregenerowane raz, różnice wyłącznie w ostatnich cyfrach (dowód liść po liściu).

#### Granice

- Rdzenie B-01 bez zmian; kontrakty FROZEN nietknięte; determinizm (dwie regeneracje = te same
  bajty).
- Nie zmieniasz logiki układu SLD (layout/scene) dla „zazielenienia” testów — zmiana logiki jest
  dozwolona wyłącznie jako naprawa defektu ujawnionego przez aktualne dane, z inwentarzem klasy.
- Fikstury e2e i harnessu wyłącznie z generatorów.

#### Kryterium ukończenia

Test świeżości czerwony na obecnym stanie (zapisz dowód), zielony po regeneracji; piny SLD z
atrybucją; `npm run accept:sld-v3`, testy z `sld-determinism.yml`, vitest `src/ui/sld`,
`src/ui/sld-editor` i `src/engine` (`--no-file-parallelism`) oraz każdego innego katalogu czytającego
fikstury (grep), type-check, lint, `python scripts/sld_determinism_guards.py`,
`python scripts/guardy_z_ci.py`, testy celowane backendu (budowniczy substratu + test świeżości)
wg `<scratchpad>/REGULA_TESTOW.md` — kody wyjścia w meldunku;
pełną regresję i pełny vitest robi integrator; zrzuty przed/po.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

### Uzupełnienie karty — drugi commit na `int/sldsubstrat` nad `79869f91` (2026-09-25)

Pierwszy commit `79869f91` odebrany; wchodzi do partii integracji razem z drugim. Czwarte
znalezisko meldunku (bramka PV `_has_transformer_in_path` przy podrozdzielnicy nN) należy do osobnej
karty domenowej — poza tą kartą.

1. **Substrat tą samą ścieżką co produkt.** Substrat 52 stacji buduje się z magazynem modelu i z
   promocją pól nN, dokładnie jak model z API — fikstura, której produkt nie wytwarza, to klasa, którą
   karta zamyka. Zmiana kontraktu geometrii substratu jest dozwolona i wymagana. Każdy pin SLD
   przeliczany z atrybucją liść po liściu do zmiany danych wejściowych (promocja pól nN: szyny
   odpływów, aparaty, wiązania katalogowe); zmiana bez przypisania = defekt do naprawy u źródła.
2. **Element modelu, którego kanwa nie rysuje, jest defektem produktu** (ZKSN przed pierwszą stacją
   ciągu z poprzednikiem GPZ nie jest rysowany; stacja z pomiarem z szablonu 1000 kVA znika z kanwy).
   B-02 dotyczy oceny wyglądu, nie obecności elementu. Naprawa u źródła w układzie; inwentarz klasy:
   każdy rodzaj elementu, który może stać między GPZ a pierwszą stacją ciągu albo między stacjami
   (ZKSN, słup rozgałęźny, mufa, punkt podziału i każdy inny z rejestru rodzajów). Test iloczynu cech:
   rodzaj elementu × położenie (za GPZ, między stacjami, za ostatnią stacją) × LOD; wyrocznia: każdy
   element modelu ma prymityw na kanwie albo jawne, nazwane zwinięcie z licznikiem. Reguła
   kompletności rysunku: liczba elementów modelu = narysowane + jawnie zwinięte, na substracie i na
   wszystkich fiksturach v3. Zrzuty przed/po jako materiał B-02.
3. **Aparaty nN po automigracji promocji pól bez wiązania katalogowego** (kanwa SLD_INVALID, dopóki
   projektant nie przypisze katalogu): migracja nie może zostawić projektu w stanie, którego kanwa nie
   rysuje. Jeśli pole sprzed migracji niesie typ aparatu albo odwołanie katalogowe, migracja przenosi
   wiązanie tą samą operacją co akcja naprawcza (`assign_catalog_to_element`); jeśli nie niesie,
   element jest rysowany, a brak katalogu jest nazwaną pozycją gotowości z akcją naprawczą wskazującą
   pole i aparat — brak katalogu blokuje analizy, nie rysunek. Najpierw pomiar, co SLD_INVALID
   oznacza dla projektanta (co przestaje działać, gdzie jest predykat). Fikstury v3 nie potrzebują
   wtedy obejścia przez akcję naprawczą w generatorze — generator buduje model ścieżką produktu.

---

## BIEG-ZABEZPIECZEN-Z-MODELU

**Stan 2026-09-30:** W TOKU.

### Karta BIEG-ZABEZPIECZEN-Z-MODELU — ocena zabezpieczeń nadprądowych na urządzeniach i nastawach z modelu, jedna ścieżka, zero wartości domyślnych, pełny White Box

Drzewo: `<worktrees>/odbior-nastawy` (gałąź `int/nastawy`, baza podana w poleceniu
startowym; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/nastawy/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

Punkt wyjścia to inwentarz zwiadu z `plik:linia`, sekcje A–E:
`<scratchpad>/nastawy/inwentarz.md`.
Przeczytaj go w całości i zweryfikuj na swojej bazie. Pomiar zwiadu był robiony na czubku partii 5,
bez pełnego importu backendu.

#### Po co

Ocena zabezpieczeń, którą projektant widzi (porównanie A/B zabezpieczeń, ślady, raport), nie ocenia
zabezpieczeń jego sieci:

- **Bieg `protection_sn`** (`enm/canonical_analysis.py::_execute_protection`) nie czyta modelu.
  - Buduje jedno syntetyczne urządzenie `device_{fault_node_id}` w pierwszym węźle zwarcia po
    sortowaniu identyfikatorów.
  - Porównuje Ik″ szyny zamiast prądu, który płynie przez przekładnik pola.
  - Nastawy bierze z szablonu przypadku.
- **Szablony i wartości domyślne:** żaden z 8 szablonów katalogu nie ma TMS, więc silnik podstawia
  0,3. Szablony nadprądowe nie mają wartości, więc `I>` = minimum pola = 0,1. Pola `I0>` silnik nie
  czyta, więc dostaje 100 A. Błąd konwersji jest połykany i też daje 100 A / 0,3.
- **Skutek na ekranie:** margines 18 535 590,85 % i opis „Δmargin = −170240,5%”.
- **Siedem żywych torów** liczy czas zadziałania, margines albo selektywność, każdy z innego źródła
  urządzeń: przypadek, ciało żądania z szablonami zaszytymi we froncie (400 A / TMS 0,3), zepsuty
  `validate_selectivity`, model. Jedyny tor czytający model — czas wyłączenia gałęzi i pola —
  zgłasza braki jawnie i jest wzorcem.
- **Brak pisarza nastaw w ścieżce interfejsu:**
  - `add_relay` i `attach_protection` idą bez nastaw;
  - `update_relay_settings` zawsze odpowiada `relay.legacy_write_disabled`;
  - `update_protection` nie ma wołającego we froncie.

  Sieci złote, referencyjne i sceny harnessu mają zero przypisań zabezpieczeń.

To łamie wprost `SYSTEM_SPEC.md` („No fictional entities in solvers”),
`docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md` §2.2 (no auto-mapping / no fallback / no
default selection) i P-05/P-06 oraz wymóg White Box z `PROTECTION_SYSTEM_CANONICAL.md` §6.3.

#### §0 Rozstrzygnięcia (z decyzji właściciela — nie otwierasz ich ponownie)

1. **Źródło nastaw — D-21 (werdykt właściciela 2026-09-02, `docs/twin/OWNER_REVIEW_PACKAGE.md`:
   „TAK wg rekomendacji”, PZ-01).**
   - Nastawy bazowe żyją w modelu przy urządzeniu zabezpieczeniowym (dziś `ProtectionAssignment` +
     `ProtectionSetting` w `enm/models.py`).
   - Przypadek nie przechowuje nastaw. Wybór grupy albo nadpisanie to delta scenariusza
     (`docs/twin/MV_DESIGN_PRO_PROTECTION_ARCHITECTURE.md` §2: `PROTECTION_SETTING_GROUP_SELECT`,
     `PROTECTION_SETTING_OVERRIDE`) — tylko wtedy, gdy kanał scenariusza istnieje w kodzie
     (`OperatingScenario`, OW-9).
   - Jeśli kanału nie ma, nie budujesz go w tej karcie. Szablon przypadku
     (`ProtectionConfig.template_ref/overrides`, `coordination_device:*`) jako źródło urządzeń
     i nastaw jest kasowany.
   - Blokada V11 `relay.legacy_write_disabled` znika razem z operacją legacy — zasady inżynierskie
     repo, bez warstw zgodności.
2. **Jednostki — PZ-09 (w D-34).**
   - Zakresy nastaw urządzeń w katalogu IED podajesz w jednostkach wtórnych albo w krotności In
     wejścia przekaźnika, z jawną podstawą (karta producenta albo profil referencyjny bez marki
     wg D-33).
   - Model przechowuje nastawę w jednostce jawnie zadeklarowanej w polu, a nie domyślnej.
   - Prąd rozruchowy po stronie pierwotnej to wielkość wyprowadzona: nastawa × przekładnia
     przekładnika pola z wiązania CT w modelu. Pochodzenie i przeliczenie trafia do White Box.
   - Brak przekładni, brak jednostki albo nastawa poza zakresem katalogu dają nazwaną pozycję
     gotowości z akcją naprawczą. Blokuje ona ocenę tego urządzenia i tylko jego.
   - Szablon katalogowy z jednostką niezgodną z zakresem (`template_ref_oc_100`: „A”, 0,1–8,0)
     poprawiasz u źródła danymi z podstawą. Jeśli podstawy nie da się ustalić, szablon dostaje
     nazwany stan „jednostka nieustalona” i nie jest używany do oceny.
3. **Jedna ścieżka oceny nadprądowej.** Każdy tor z inwentarza sekcji A albo przechodzi na nią,
   albo jest kasowany (z bramką wskrzeszenia). Ścieżka:
   - urządzenia i nastawy z modelu;
   - prąd widziany przez przekaźnik = prąd gałęzi pola z rozpływu zwarciowego biegu SC
     (`branch_contributions` / ślad rozpływu), dla punktów zwarcia w strefie urządzenia
     wyznaczonej z topologii modelu i przypisania.

   Punkty i pary do koordynacji wskazuje projektant albo wynikają jednoznacznie z przypisania
   (P-03/P-04/P-05). Niejednoznaczność daje deterministyczną odmowę z kandydatami naprawy, nigdy
   domyślny wybór.

   Fizyka krzywych wyłącznie z rdzenia `network_model/solvers/protection_iec60255.py`
   (`compute_curve_trip_time`, `compute_idmt_generic`, `compute_ieee_c37112_generic`) — bez zmian
   B-01. Duplikaty krzywych i ich ciche zapasy kasujesz:
   - ANSI spadające na SI;
   - IEEE liczone wzorem IEC;
   - DT bez zwłoki = 0 s.

   Martwy `domain/protection_engine_v1.py` jest pod `solver_boundary_guard`. Jego kasacja wymaga
   OD-18, więc wpisz go do meldunku z tą zależnością i nie ruszaj.
4. **Zero wartości domyślnych i połkniętych błędów.**
   - `_extract_setting_value` i każde miejsce inwentarza z domyślnym prądem, TMS, zwłoką, krzywą,
     prądem testowym „10× nastawa” albo progiem 0 (`protection_read_model`) znika.
   - Brak danej daje nazwany kod gotowości albo nazwaną odmowę z akcją naprawczą.
   - Strażnik `protection_no_heuristics_guard` rozszerzasz tak, żeby łapał domyślne wartości
     nastaw i połknięcie wyjątku konwersji. Samotest z iniekcją, lista dozwolona pusta.
5. **Werdykt wyjaśnialny i wiarygodność.**
   - Każdy wynik oceny to rekord werdyktu wyjaśnialnego (`backend/src/werdykt/`,
     `KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`): kryterium, wynik z jednostką, limit z podstawą, margines,
     przyczyna, dowód (metoda, pochodzenie nastaw i prądu), zakres ważności.
   - Koordynacja podaje wyłącznie marginesy liczbowe ze śladem (P-06).
   - Margines poza granicami wiarygodności (moduł analizy granic wiarygodności repo albo nowa
     reguła z podstawą) daje nazwany stan „dane nastaw niewiarygodne”, nigdy liczbę 18 mln %.
   - Opisy dla projektanta po polsku, bez „Δmargin” i bez kodów — strażnik języka ekranów obejmuje
     ekran porównania zabezpieczeń.
6. **Pisarz nastaw w ścieżce projektanta (zasada nr 1 — bez niego ocena z modelu to martwa funkcja).**
   - Edycja nastaw urządzenia zabezpieczeniowego pola działa w interfejsie: karta pola lub
     inspektor, tam gdzie dziś są przypisania. Wartości w jednostkach katalogu i kontrola zakresów
     przychodzą z backendu. Front nie liczy przeliczeń.
   - Operacją jest `update_protection` (albo jej kanoniczny następca), wołana z interfejsu.
   - `add_relay` i `attach_protection` przyjmują nastawy albo tworzą przypisanie z nazwanym brakiem
     nastaw.
   - `update_relay_settings` (legacy) jest kasowana.
   - Koordynacja E-28 bierze urządzenia z modelu. Szablony urządzeń zaszyte we froncie
     (`ui/protection-coordination/types.ts` `DEVICE_TEMPLATES`) są kasowane.
   - `validate_selectivity` (`enm/domain_operations_v2.py`) przechodzi na jedną ścieżkę albo znika —
     decyzja w meldunku.
   - Test komponentu i spek e2e ćwiczą natywną ścieżkę użytkownika: wstaw pole z przekaźnikiem →
     wpisz nastawy → bieg zabezpieczeń → porównanie.
7. **Sieci referencyjne i sceny.**
   - Sceny koordynacji i porównania zabezpieczeń oraz co najmniej jedna sieć złota z polem SN
     z przekaźnikiem dostają realne przypisania zabezpieczeń z nastawami.
   - Źródło to katalog z podstawą, zapisany operacjami domenowymi — budowniczy i generatory,
     nie ręczny JSON.
   - Ekrany dostają realną treść, a kadry (oba motywy) są materiałem B-02.
   - Speki e2e, które wymagały „co najmniej jednego wiersza porównania”, sprawdzają teraz wiersz
     policzony z urządzeń modelu. Ręczna fikstura frontu `zabezpieczeniaFixtures.ts` z danymi,
     których backend nie produkuje, jest kasowana albo zastąpiona fiksturą z generatora.

#### Testy jako iloczyn cech

- {źródło nastaw: model z kompletem, model bez nastaw, nastawa poza zakresem, jednostka nieustalona,
  brak przekładni CT} × {krzywa: NI, VI, EI, LI, RI, DT, IEEE MI/VI/EI} ×
  {punkt zwarcia: w strefie, poza strefą, niejednoznaczny} × {tor: bieg `protection_sn`, koordynacja
  E-28, czas wyłączenia pola, porównanie A/B, raport}.
  - Wyrocznia: czas z rdzenia IEC 60255 dla prądu gałęzi pola i nastawy przeliczonej na stronę
    pierwotną, liczony niezależnie w teście wg normy, albo nazwana odmowa.
  - Dla zestawu referencyjnego podajesz wartości policzone ręcznie wg IEC 60255-151 z podstawą.
- Test czerwony na bazie dla każdej zasady (syntetyczne urządzenie, wartości domyślne, margines
  18 mln %, „Δmargin”), zielony po naprawie.
- Parytet: liczby rozpływu i zwarć sieci złotych bez zmian. Zmieniają się wyłącznie liście oceny
  zabezpieczeń i odciski modelu (nowe przypisania). Dowód liść po liściu.

#### Granice

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian, w tym `protection_iec60255.py`. Kontrakty
  FROZEN nietknięte. Pola nowe addytywnie; migawka OpenAPI z generatora.
- Determinizm: dwa przebiegi generatorów dają te same bajty. Fikstury harnessu sprawdzasz testem
  `tests/ci/test_fixtury_harnessu.py` (porównanie z tolerancją). Zatwierdzasz wyłącznie to, co ten
  test wskazuje jako zmienione, z opisem liść po liściu.
- Równolegle pracują:
  - POLA-W-TORZE — aparaty pól w torze prądowym, migracja pól nN;
  - GOTOWOSC-DER-BACKEND — reguła 87T i klasy przekładników dla źródeł;
  - ODMOWA-DANYCH-422 — typ odmów;
  - ENDPOINTY-BEZ-KONSUMENTA — trasy bez konsumenta; trasy zabezpieczeń należą do tej karty.

  Ich zakresu nie przebudowujesz. Styki (przekładnik pola, prąd gałęzi aparatu pola po POLA-W-TORZE)
  opisujesz w meldunku.

#### Kryterium ukończenia

- Inwentarz klasy z sekcji A–E, zweryfikowany, z decyzją dla każdej pozycji.
- Jedna ścieżka oceny.
- Strażnik z samotestem.
- Testy iloczynu cech czerwone na bazie i zielone po.
- Testy celowane backendu wszystkich dotkniętych modułów i tras.
- Vitest modułów dotkniętych, `npm run type-check`, `npm run lint`.
- Speki e2e ścieżki nastaw i porównania na realnym backendzie (porty: backend 18911, frontend 5331).
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Kadry B-02.
- Pełną regresję robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## SIEC-ZLOTA-KATALOG

**Stan 2026-09-30:** NIE ROZPOCZĘTA.

### Karta SIEC-ZLOTA-KATALOG — każde odwołanie katalogowe w sieciach testowych, scenach i produkcie rozwiązuje się w katalogu; parametry z materializacji, nie wpisane ręcznie

Drzewo: `<worktrees>/odbior-sieczlota` (gałąź `int/sieczlota`, baza podana w poleceniu
startowym; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/sieczlota/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

Karta DOWOD-CIEPLNY zmierzyła (meldunek `scratchpad/dowodcieplny/meldunek.md` §5), że sieć złota
`backend/tests/cgmes/golden_enm.py` deklaruje `parameter_source="CATALOG"` z siedmioma odwołaniami,
których NIE MA w katalogu (`get_default_mv_catalog()`): `line-afl-70`, `cable-yakxs-3x120`,
`src-gpz-110kv-2500mva`, `tr-110-15-25mva-ynd11`, `tr-15-04-630kva-dyn11`, `gen-sync-2mva`,
`conv-pv-nn-0p5mw`. Parametry wpisano ręcznie (linia R = 0,306 Ω/km nie odpowiada żadnej z 25
pozycji linii; najbliższa nazwą `line-base-al-st-70` ma R = 0,408 Ω/km i komplet danych
cieplnych). Sieć złota zasila sceny harnessu (`siec_zlota_scena_*`), więc ekrany wyników, dowody
i zrzuty B-02 pokazują liczby z „katalogu", który nie istnieje, a dowód cieplny linii mówi uczciwie
„brak danych", bo pozycji nie ma. To łamie regułę wiązania katalogowego (CLAUDE.md, reguła 10)
i zakaz fabrykacji.

Ta sama klasa siedzi poza siecią złotą (pomiar sesji głównej, niepełny):
- `backend/scripts/eksport_fixtur_harnessu.py:1511` — `catalog_ref="conv-pv-nn-0p5mw"` (w katalogu
  jest `conv-pv-nn-0p5mw-0p4kv`);
- `backend/tests/golden/parytet_scenariuszy/harness.py:482` — `line-afl-70`;
- `frontend/src/ui/workspace/surfaces/SnSegmentSurface.tsx` — kod PRODUKCYJNY odwołuje się do
  `line-afl-70`;
- testy w `backend/tests/application/analyses/` (`test_diagnostyka_znaku_shunt.py`,
  `test_dobor_kompensacji_service.py`, `test_dowod_v12k040.py`, `test_konwencja_mocy_biernej.py`),
  `backend/tests/e2e/test_creator_harness_katalogi_parytet.py`, spec
  `frontend/e2e/fk1-linia-napowietrzna-screenshot.spec.ts`.

#### §0 Rozstrzygnięcia

1. **Zero fabrykacji katalogu.** Nie dopisujesz do katalogu pozycji dopasowanej do parametrów testu
   (np. `line-afl-70` z R = 0,306 Ω/km). Pozycja katalogowa ma podstawę (norma, karta producenta);
   jej brak to decyzja o danych, nie o teście.
2. **Wiązanie ścieżką produkcyjną.** Każdy element sieci testowej, sceny albo fikstury, który
   deklaruje źródło katalogowe, wiąże się z ISTNIEJĄCĄ pozycją katalogu tą samą drogą co produkt
   (operacja domenowa przypisania katalogu albo materializacja katalogu używana przez produkt),
   a jego parametry pochodzą z materializacji. Gdzie test naprawdę potrzebuje parametrów spoza
   katalogu (np. przypadek wyroczni analitycznej o zadanej impedancji), deklaruje uczciwe źródło
   drogą, którą przewiduje kanon danych użytkownika — sprawdź
   `docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md` (priorytet 2) i zapisz w meldunku,
   którą drogą idzie każda pozycja i dlaczego.
3. **Inwentarz klasy** (w meldunku, `plik:linia`, decyzja): każde odwołanie katalogowe (`catalog_ref`,
   `catalog_item_id`, `type_ref`, literały identyfikatorów pozycji) w `backend/tests`, `backend/scripts`,
   `backend/src`, `frontend/src` (kod i fikstury), `frontend/e2e`, `frontend/public/test-fixtures`
   — rozwiązane wobec katalogu: istnieje / nie istnieje → decyzja (przepięcie na pozycję X z
   uzasadnieniem inżynierskim / uczciwe źródło danych / kasacja).
   `SnSegmentSurface.tsx` zbadaj osobno: produkt z zaszytym identyfikatorem katalogu to osobny
   defekt (domyślny wybór bez podstawy) — napraw u źródła.
4. **Liczby się zmienią i to jest poprawne.** Fikstury wyłącznie z generatorów; każda zmieniona liczba
   pinu albo fikstury z atrybucją do zmiany parametru (liść po liściu, klasyfikacja w meldunku).
   Wyrocznie NIEZALEŻNE (obliczenia ręczne, postać zamknięta, bliźniaki pandapower) przeliczasz
   drogą wyroczni, nie przepisując wyniku solvera — przepisanie liczby z produktu do wyroczni to
   samocertyfikacja. Kontrakty FROZEN i rdzenie B-01 nietknięte.
5. **Strażnik klasy.** Każde odwołanie katalogowe w budowniczych, generatorach, fiksturach i kodzie
   produkcyjnym rozwiązuje się w katalogu; lista dozwolona pusta albo zamknięta z uzasadnieniem przy
   każdym wpisie; samotest z iniekcją (odwołanie do nieistniejącej pozycji w budowniczym i w
   fiksturze JSON). Wpięcie w `scripts/guardy_z_ci.py` i właściwy workflow.

#### Testy jako iloczyn cech

{rodzaj elementu: linia, kabel, źródło sieciowe, transformator WN/SN, transformator SN/nN,
generator synchroniczny, przekształtnik PV} × {miejsce: sieć złota, sceny harnessu, parytet
scenariuszy, testy analiz, fikstury frontu, kod produkcyjny} → odwołanie rozwiązuje się, parametry
z materializacji, dowód cieplny linii ma komplet danych albo uczciwy stan „brak danych" z nazwaną
przyczyną. Test czerwony na bazie (dowód), zielony po naprawie.

#### Granice

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian; kontrakty FROZEN nietknięte.
- Fikstury i migawki wyłącznie z generatorów; `tests/ci/test_fixtury_harnessu.py` (tolerancja).
- Równolegle pracują: SLD-SUBSTRAT (fikstury SLD i substrat), DETERMINIZM (fikstury dynamiki),
  POLA-W-TORZE, BIEG-ZABEZPIECZEN-Z-MODELU. Konflikty w fiksturach rozstrzyga integrator regeneracją.

#### Kryterium ukończenia

- Inwentarz klasy z decyzją dla każdej pozycji; strażnik z samotestem.
- Testy iloczynu cech; testy celowane backendu dotkniętych modułów; vitest dotkniętych modułów,
  `npm run type-check`, `npm run lint`; spec `fk1-linia-napowietrzna-screenshot.spec.ts` na realnym
  backendzie (porty: backend 18921, frontend 5341).
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Zrzuty ekranów zmienionych scen (oba motywy) — materiał B-02, bez werdyktu.
- Pełną regresję robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## GOTOWOSC-DER-BACKEND

**Stan 2026-09-30:** NIE ROZPOCZĘTA.

### Karta GOTOWOSC-DER-BACKEND — gotowość stacji i źródeł (DER) z jednego źródła w backendzie; brak danej nigdy nie jest zerem ani „nie”

Drzewo: `<worktrees>/odbior-gotowoscder` (gałąź `int/gotowoscder`, baza podana
w poleceniu startowym; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/gotowoscder/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

Gotowość obliczeń dla źródeł przyłączanych do stacji (macierz `DerReadinessMatrix`: zwarcia, rozpływ,
zabezpieczenia, NC RfG, FRT/HVRT) liczy dziś front. Pomiar na `e8756f42`:

- `frontend/src/ui/network-build/station-der/readiness.ts` (649 linii):
  - `computeDerReadinessMatrix` (:139) — reguły osi;
  - `buildAggregatedReadiness` (:276) — blokery z komunikatami;
  - `zlozZBramkaModelu` (:624) — sklejenie z bramką modelu backendu.
- Wołają je `ui/workspace/WorkspaceSurfaceRouter.tsx` (:1174, :1502, :1959) i
  `ui/workspace/surfaces/DerSurfaces.tsx` (:431, :1224).

Front podejmuje więc decyzje inżynierskie:

- wymóg zabezpieczenia różnicowego 87T i przekładnika dwurdzeniowego dla transformatora
  dedykowanego od 1,6 MVA;
- wymóg przekładnika klasy zabezpieczeniowej 5P/10P (IEC 61869-2);
- wymóg funkcji przeciw pracy wyspowej (27/59/81U/81O) dla źródła po stronie nN.

Te same reguły ma backend — `backend/src/domain/der_protection_functions.py` (`PROG_87T_KW = 1600.0`,
:58; warunek :338). Dwa źródła tej samej reguły, a do tego w obu miejscach brak danej rozstrzyga
po cichu:

- front: `(der.nominal_power_kw ?? 0) >= 1600` (`readiness.ts:183`, :434);
- backend: `(fakty.nominal_power_kw or 0.0) >= PROG_87T_KW` (:338);
- kreator: `fourQuadrant: deviceFourQuadrantCapable(selectedDevice) ?? false`
  (`AddDerWizard.tsx:947`) — brak danych katalogu o pracy w czterech ćwiartkach staje się
  „nie potrafi”.

Nieznana moc znaczy więc „87T nie jest wymagane” — werdykt bez danych.

#### §0 Rozstrzygnięcia

1. **Jedno źródło gotowości w backendzie.**
   - Każda oś macierzy gotowości stacji i źródła, każdy wymóg (87T, klasa i rdzenie przekładników,
     funkcje przeciw pracy wyspowej, dane dynamiczne dla FRT/HVRT, karta NC RfG, praca w czterech
     ćwiartkach tam, gdzie jest wymogiem) jest liczony w backendzie z modelu i katalogów.
   - Wynik to kanoniczne kody gotowości (`domain/canonical_operations.py::READINESS_CODES`)
     z akcjami naprawczymi i poziomem.
   - Kanał do frontu to ten, którym front już dostaje gotowość modelu (bramka modelu,
     odpowiedź operacji i migawka). Nowy kanał tylko wtedy, gdy istniejący nie przenosi osi;
     wtedy addytywnie, z migawką OpenAPI z generatora.
2. **Front tylko wyświetla.**
   - `computeDerReadinessMatrix`, `buildAggregatedReadiness`, `zlozZBramkaModelu` i reguły
     w `wizard-validation.ts` / `macierzAnaliz.ts`, które podejmują decyzję, są kasowane.
   - Zostaje prezentacja wyniku backendu (etykiety osi, komunikaty, akcje naprawcze).
   - Strażnik `ui_no_physics_guard` albo nowy strażnik AST pilnuje, że w `station-der/**` nie
     wraca próg ani reguła wymogu. Lista dozwolona pusta, samotest.
3. **Brak danej jest nazwany.**
   - Nieznana moc znamionowa, nieznana klasa albo rdzeń przekładnika, brak danych katalogu
     o pracy w czterech ćwiartkach, brak modelu dynamicznego — każdy daje nazwany kod
     „brak danych: …” z akcją naprawczą.
   - Taki kod blokuje oś, której ta dana dotyczy, i tylko ją.
   - Zakaz `?? 0`, `?? false`, `or 0.0`, `or False` zasilających decyzję w tych modułach, po obu
     stronach. Klasa „ciche zero” w pozostałych modułach frontu idzie osobną kartą CICHE-ZERO;
     tu domykasz wszystkie wystąpienia w plikach, które karta zmienia (reguła 5 „KLASA, NIE
     INSTANCJA”).
4. **Progi z podstawą.**
   - Próg mocy wymogu 87T i każdy inny próg wymogu ma jedno miejsce w backendzie z podstawą:
     dokument, punkt, wersja, warstwa profilu regulacyjnego (NC RfG / WOS / PTPiREE / OSD).
   - Jeśli podstawy nie ma w repo, ustal ją ze źródeł (dokumenty PTPiREE/OSD, IEC 60255,
     IEC 61869-2), wpisz do profilu regulacyjnego z wersją i źródłem, a pomiar zapisz w meldunku.
   - Próg bez podstawy nie zostaje w kodzie.
5. **Inwentarz klasy** (w meldunku, `plik:linia`, decyzja): każda reguła gotowości i wymogu dla
   stacji i źródeł we froncie i w backendzie, w tym:
   - kreator (`AddDerWizard.tsx`), konfigurator i karty DER;
   - `WorkspaceSurfaceRouter.tsx`, `DerSurfaces.tsx`, `station-der/**`;
   - `domain/der_protection_functions.py`, most gotowości (`domain/readiness_bridge.py`),
     walidator ENM;
   - macierz analiz i dobór przekładników.

   Każda pozycja: przeniesiona do backendu, skasowana jako duplikat albo pozostawiona jako
   prezentacja — z uzasadnieniem.

#### Testy jako iloczyn cech

{oś: zwarcia, rozpływ, zabezpieczenia, NC RfG, FRT/HVRT} × {dane: komplet, brak mocy, moc poniżej
i powyżej progu 87T, brak klasy przekładnika, klasa pomiarowa zamiast zabezpieczeniowej, przekładnik
jednordzeniowy przy wymogu dwurdzeniowego, brak danych czterech ćwiartek, brak modelu dynamicznego,
źródło po stronie nN bez funkcji przeciw pracy wyspowej} × {warstwa: reguła backendu, trasa API,
ekran}.

- Wyrocznia: kod gotowości, poziom i akcja naprawcza z backendu. Ekran pokazuje dokładnie to,
  bez własnej decyzji.
- Test czerwony na bazie dla cichego zera (dowód), zielony po naprawie.
- Test ekranu przez natywną interakcję (reguła 5 Zero-Debt).

#### Granice

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian; kontrakty FROZEN nietknięte; pola nowe
  wyłącznie addytywne.
- Fikstury i migawki wyłącznie z generatorów.
- Fikstury harnessu sprawdzasz testem `tests/ci/test_fixtury_harnessu.py` (porównanie
  z tolerancją). Zatwierdzasz tylko to, co ten test wskazuje jako zmienione, z opisem liść po
  liściu.
- Równolegle pracują:
  - ODMOWA-DANYCH-422 — typ odmów w `backend/src`;
  - POLA-W-TORZE — topologia pól stacji, operacje stacji, SLD;
  - AB-1b.3b — rdzeń dynamiki.

  Ich zakresu nie przebudowujesz.

#### Kryterium ukończenia

- Inwentarz klasy z decyzją dla każdej pozycji.
- Strażnik z samotestem, czerwony na bazie i zielony po naprawie.
- Testy iloczynu cech.
- Testy celowane backendu dotkniętych modułów i tras.
- Vitest modułów dotkniętych, `npm run type-check`, `npm run lint`.
- Speki e2e ekranów DER na realnym backendzie (porty: backend 18881, frontend 5301).
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Zrzuty ekranów gotowości DER (oba motywy) jako materiał B-02.
- Pełną regresję robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## ENDPOINTY-BEZ-KONSUMENTA

**Stan 2026-09-30:** NIE ROZPOCZĘTA (po ODMOWA-DANYCH-422).

### Karta ENDPOINTY-BEZ-KONSUMENTA — każda trasa API ma konsumenta w ścieżce projektanta albo znika

Drzewo: `<worktrees>/odbior-endpointy` (gałąź `int/endpointy`, baza podana
w poleceniu startowym; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/endpointy/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

ZASADA NR 1 (CLAUDE.md): funkcja istniejąca tylko w testach, niewpięta w ścieżkę użytkownika, to dług.
Zdolność backendu bez konsumenta w UI jest dla projektanta niewidoczna. Z kolei klient we froncie,
którego nie woła żadna akcja, to martwy kod udający pokrycie.

Pomiar wstępny na `e8756f42` (heurystyka: ostatni segment statyczny ścieżki OpenAPI nie występuje
w `frontend/src` poza testami i fiksturami): 31 z 321 ścieżek (341 operacji). Wśród nich:

- router audytu 2 (`/api/v1/catalog/audit2/`): `bess-operation-modes`, `pf-curves`,
  `block-transformers`, `mv-neutral-groundings`, `build-station-payload`;
- `/api/v1/projects/{project_id}/audit2-station-config/{station_id}/_apply-to-network-model`;
- eksporty DOCX/PDF: świadectwo zgodności i wniosek OSD dla OZE, raport łuku elektrycznego;
- `/api/solver-capabilities` (+ `/{capability}`);
- katalogi: `karty-widmowe`, `lv-breaker-mcb-types`, `lv-fuse-link-types`, `sekcje-modelu`,
  `slowniki-uziemienia`, `auto-populate`;
- trasy przypadku ENM: `fault-loop-feeders`, `fault-loop-point`, `nn-circuit-sheet`,
  `nn-device-selection`, `lv-domain/{station_ref}/upstream-equivalent`,
  `elementy/{ref}/sekcje-modelu`, `analysis/solver-input/{analysis_type}`;
- `wizard/can-proceed`, `sld-overrides`, `sld/{diagram_id}/protection-overlay`.

Heurystyka ma luki w obie strony:

- nie widzi ścieżek składanych dynamicznie (np. rozszerzenie `.docx`/`.pdf` z parametru), więc
  część z tych 31 może mieć konsumenta;
- nie widzi klientów, które istnieją, ale których nie woła żadna akcja — np.
  `validateHostingCapacityExportApi` dla `validate-hosting-capacity-export`, klient bez
  wywołującego. Trasa z takim klientem jest tak samo bez konsumenta.

#### §0 Rozstrzygnięcia

1. **Inwentarz klasy na wszystkich trasach** (w meldunku, tabela: trasa, operacja, router,
   konsument w ścieżce projektanta z łańcuchem akcja → klient → trasa albo „brak”, decyzja).
   - Źródło listy tras to migawka OpenAPI.
   - Konsument to wywołanie z kodu produkcyjnego frontu osiągalne z akcji użytkownika. Test,
     fikstura ani martwy klient konsumentem nie są.
   - Każdą z 31 pozycji wstępnych i każdą trasę z klientem bez wywołującego weryfikujesz
     z osobna.
2. **Decyzja dla każdej trasy bez konsumenta:**
   - **wpięcie**, gdy zdolność ma wartość dla projektanta i nie dubluje innej ścieżki
     (np. pobranie raportu DOCX/PDF z ekranu, na którym powstaje wynik). Wpięcie jest pełne:
     kontrolka na właściwym ekranie etapu E1–E8, stan zerowy, obsługa odmowy, test komponentu
     i spec e2e na realnym backendzie (natywne kliki);
   - **kasacja**, gdy trasa dubluje inną ścieżkę, jest pozostałością albo służyła wyłącznie
     testom. Kasujesz trasę, jej usługę (jeśli nie ma innych wołających), klienta frontu, testy
     tylko tej trasy i wpisy w dokumentach. Bramka wskrzeszenia (`legacy_public_path_guard`
     albo odpowiednik) pilnuje, że nie wraca.

   Kryterium wyboru zapisujesz przy każdej pozycji. Zdolność unikalna (np. eksport raportu
   łuku) nie jest kasowana — jest wpinana.
3. **Strażnik klasy.**
   - Nowy strażnik (albo rozszerzenie `dead_click_guard` / `router_mount_guard`): każda operacja
     z migawki OpenAPI ma konsumenta w kodzie produkcyjnym frontu, a każdy eksportowany klient
     API ma wywołującego.
   - Lista dozwolona pusta. Wyjątek tylko dla tras wołanych spoza frontu (np. zdrowie serwisu,
     jeśli istnieje), zamknięty i przypięty samotestem z uzasadnieniem przy każdym wpisie.
   - Samotest.
4. **Kontrakty.** Migawka OpenAPI z generatora. Kasacja trasy to zmiana publicznego API —
   zapisujesz ją w meldunku i w dokumencie kontraktu, którego dotyczy. Kontrakty FROZEN wyników
   nietknięte.

#### Testy

- Strażnik czerwony na bazie (dowód: lista pozycji), zielony po naprawie; samotest z iniekcją
  trasy bez konsumenta i klienta bez wywołującego.
- Dla każdego wpięcia: test komponentu (natywna interakcja) i spec e2e na realnym backendzie
  (porty: backend 18891, frontend 5311).
- Dla każdej kasacji: test bramki wskrzeszenia.

#### Granice

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian.
- Fikstury i migawki wyłącznie z generatorów. Fikstury harnessu sprawdzasz testem
  `tests/ci/test_fixtury_harnessu.py` (porównanie z tolerancją). Zatwierdzasz tylko to, co ten
  test wskazuje jako zmienione.
- Równolegle pracują:
  - POLA-W-TORZE — topologia pól stacji, operacje stacji, SLD;
  - GOTOWOSC-DER-BACKEND — gotowość DER, `station-der/**`;
  - AB-1b.3b — rdzeń dynamiki.

  Ich zakresu nie przebudowujesz. Trasa należąca do ich zakresu dostaje decyzję w inwentarzu,
  a wykonanie przy styku z ich plikami ograniczasz do koniecznego minimum.

#### Kryterium ukończenia

- Inwentarz klasy z decyzją dla każdej trasy.
- Strażnik z samotestem.
- Testy wpięć i kasacji.
- Testy celowane backendu tras dotkniętych.
- Vitest modułów dotkniętych, `npm run type-check`, `npm run lint`.
- Speki e2e wpięć.
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Zrzuty nowych kontrolek (oba motywy) jako materiał B-02.
- Pełną regresję robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## KOMUNIKATY-BEZ-ID

**Stan 2026-09-30:** NIE ROZPOCZĘTA.

### Karta KOMUNIKATY-BEZ-ID (#157) — komunikat dla projektanta nie niesie identyfikatora maszynowego, klucza pola, kodu reguły ani surowego wyjątku

Drzewo: `<worktrees>/odbior-komunikaty` (gałąź `int/komunikaty`,
baza = czubek `int/fala` z chwili startu — po integracji NAZWY-JEDNO-ZRODLO i #145). Jeden commit
lokalny, BEZ push. Meldunek:
`<scratchpad>/komunikaty/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

Projektant czyta komunikat, żeby wiedzieć, CO jest nie tak i GDZIE. „Szyna 'bus/3f2a9c…' nie
istnieje” albo „E-12: Transformer trafo/7 has no catalog_ref” nie mówi mu ani jednego, ani
drugiego: nie zna identyfikatorów maszynowych, kluczy pól kontraktu ani kodów reguł walidatora.
Trzy karty zamknęły sąsiednie klasy: #140/#144 — wyrażenie, które staje się NAZWĄ elementu,
nie sięga po identyfikator; #142 — komunikaty operacji domenowych mówią nazwami pól i etykietami
wartości; NAZWY-JEDNO-ZRODLO — jedna reguła nazwy i opisu braku nazwy. Strażnik
`scripts/nazwa_bez_identyfikatora_guard.py` jawnie wymienia, czego NIE wykrywa: identyfikator
wklejony WPROST do treści komunikatu (`f"Szyna '{bus_ref}' nie istnieje"`) oraz tekst złożony
w liście i sklejony później. Pomiar z meldunku karty #144: 205 takich f-napisów w 53 plikach
`backend/src`, w tym 13 w rdzeniach B-01 (`short_circuit_iec60909.py` 4,
`power_flow_newton_internal.py` 7, `v126_academic.py` 2 — pozycja 4 listy decyzji właściciela).
Ta karta domyka klasę KOMUNIKATU na całej drodze do projektanta.

Znane instancje tej samej klasy z innymi nośnikami (inwentarz ma je objąć, nie tylko f-napisy):
- import XLSX: `application/xlsx_import/service.py` (`_wczytaj_i_skompiluj`) składa blokadę walidatora
  jako `f"{issue.code}: {issue.message_pl}"` (kod reguły w treści) i listę elementów przez
  `nazwy.get(ref, ref)` (identyfikator jako zapas nazwy); `importer.py` wkleja tekst wyjątku biblioteki
  („Nie można otworzyć pliku jako arkusza XLSX (…): {e}”), a serwis — tekst wyjątku kompilatora
  („Model nie daje się zbudować z arkusza: {blad}”);
- odpowiedzi HTTP 4xx z `detail=str(e)` / `detail=f"…{ref}…"` pokazywane w interfejsie;
- `solver_input/audit2_der_payload.py` (ok. linii 101, 172, 183 na partii 5) — komunikaty z identyfikatorem
  w treści (meldunek karty PROOFPACK-KONTRAKT);
- wyjątki domenowe z identyfikatorem w treści, które API albo usługa przekazuje projektantowi;
- teksty składane w listach (`lista.append(f"… {ref}")`) i sklejane później w polu dla projektanta;
- komunikaty składane we froncie z identyfikatorem (`${…Ref}`, `${…Id}`) w powiadomieniach, oknach
  potwierdzeń, banerach błędów — `no_raw_ids_in_ui_guard` pilnuje wyłącznie pól karty technicznej
  z etykietą debugową, nie treści komunikatów.

Poza zakresem z uzasadnieniem (inna karta w toku, te same pliki): założenia i komunikaty odmów rdzenia
dynamiki RMS (`network_model/solvers/dynamika/**`, ekran E-32) zamienia na rekordy strukturalne karta
AB-1b.3b (decyzja O-56 pkt 2). W inwentarzu wpisz te miejsca z odesłaniem do AB-1b.3b, bez edycji.

#### §0 Rozstrzygnięcia

1. Treść komunikatu dla projektanta nazywa element regułą jednego źródła nazw (moduł wskazany przez
   commit NAZWY-JEDNO-ZRODLO: nazwa własna albo polski opis braku nazwy), pole — polską etykietą ze
   słownika #142, wartość kodową — mapą etykiet. Identyfikator trafia do POLA STRUKTURALNEGO rekordu
   albo odpowiedzi (`element_refs`, `element_ref`, `pole`, `kod`), z którego interfejs wiąże
   nawigację i zaznaczenie — nigdy do tekstu. Odwołanie do elementu, którego nie ma w modelu,
   komunikat opisuje po polsku bez identyfikatora („Wskazana szyna nie istnieje w modelu”),
   identyfikator zostaje w polu strukturalnym.
2. Kody reguł i kody maszynowe (`issue.code`, `KOD_*`, `E-…`) nie stoją w treści. Tam, gdzie kontrakt
   ich nie przenosi osobno (np. `BladArkusza` importu XLSX), dodajesz pole addytywnie (`kod`,
   `element_refs`), a front pokazuje treść; kod widoczny wyłącznie w widoku audytowym
   (`ui2/wyniki/wzorzec/InformacjeAudytowe`) albo w trybie eksperckim — tam, gdzie ten wzorzec już jest.
3. Tekst wyjątku biblioteki (openpyxl, pydantic, numpy, zipfile) i surowe `str(e)` nie trafiają do
   komunikatu dla projektanta: nazwany polski komunikat wg typu wyjątku, szczegół techniczny do
   dziennika (`logger`) — bez połykania wyjątku (klasa karty #151 obok: odmowa zostaje odmową).
4. Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian. Komunikat rdzenia z identyfikatorem, który
   dociera do projektanta, tłumaczysz na granicy warstwy aplikacji po TYPIE albo KODZIE wyjątku
   (nigdy parsowaniem tekstu); czego się tak nie da — pozycja do decyzji właściciela w meldunku
   (plik:linia, droga do projektanta).
5. Strażnik klasy: rozszerzasz `nazwa_bez_identyfikatora_guard` o rodzinę KOMUNIKATU (położenia
   `komunikat_`: pola `message`, `message_pl`, `detail`, `error*`, `fix_message_pl`, `komunikat*`,
   `HTTPException(detail=…)`, argument wyjątku podnoszonego w ścieżce, która przekazuje tekst
   projektantowi) — ta sama analiza nośników identyfikatora, osobna sekcja listy dozwolonej
   z uzasadnieniem per wpis, zapadka w obie strony, oraz wykrywanie `{e}`/`str(e)` i atrybutu
   `.code` w treści. Sekcja „CZEGO NIE WYKRYWA” zaktualizowana zgodnie z prawdą (reguła KLASA pkt 4).
   Front: strażnik (nowy albo rozszerzenie istniejącego) na szablony tekstu komunikatów
   z identyfikatorem, z samotestem. Allowlisty zaczynają od zmierzonego stanu i schodzą do zera
   w tej karcie poza pozycjami B-01 z pkt 4.
6. Testy jako iloczyn cech: nośnik (f-napis, `+`, `%`/`format`, `join` po kolekcji, lista sklejana
   później) × położenie (pole komunikatu rekordu, `detail` HTTP, wyjątek pokazany projektantowi,
   pozycja walidatora, błąd importu XLSX/CGMES/archiwum, pozycja gotowości i kwalifikacji analizy)
   × stan elementu (z nazwą, bez nazwy, odwołanie do nieistniejącego) × warstwa (operacja, walidator,
   odmowa analizy, import, API, front). Wyrocznia testu: treść nie zawiera identyfikatora ani kodu,
   pole strukturalne go zawiera.

#### Granice

- Rdzenie B-01 bez zmian; kontrakty FROZEN wyników nietknięte; nowe pola kontraktów wyłącznie
  addytywne (schematy i migawka OpenAPI zregenerowane generatorami).
- Jedno źródło nazw konsumujesz, nie budujesz drugiego; słownik etykiet pól #142 rozszerzasz,
  nie duplikujesz.
- Odciski złotych parytetów zmieniają się wyłącznie przez tekst komunikatów (dowód liść po liściu).
- Fikstury e2e i harnessu wyłącznie z generatorów.
- Nie ruszasz treści, które nie są dla projektanta (dziennik, wyjątki programistyczne niewychodzące
  poza backend) — kryterium: czy tekst dociera do odpowiedzi API albo ekranu.
- Wiersz rejestru §7 planu dopisuje integrator.

#### Kryterium ukończenia

Inwentarz klasy w meldunku: pomiar na bazie (liczba i lista plik:linia per nośnik i warstwa), decyzja
dla każdej pozycji, pomiar po (zero poza pozycjami B-01 z uzasadnieniem). Strażnik czerwony na bazie
(dowód) i zielony po; samotest. Testy iloczynu cech. Zrzuty przed/po (oba motywy) ekranów, na których
projektant widzi te komunikaty (import XLSX z błędami, odmowy operacji, gotowość analiz) do
`scratchpad/komunikaty/zrzuty/` — materiał B-02, bez własnego werdyktu. Biegi wg REGULA_TESTOW —
kody wyjścia w meldunku.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## LICZBY-PL

**Stan 2026-09-30:** NIE ROZPOCZĘTA.

### Karta LICZBY-PL — liczby dla projektanta w zapisie polskim z jednego formatera; skrajne napięcia w obrębie poziomu napięcia, nie przez poziomy

Drzewo: `<worktrees>/odbior-liczbypl` (gałąź `int/liczbypl`, baza podana
w poleceniu startowym; `node_modules` dowiązane). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/liczbypl/meldunek.md`.
Biegi weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`.

#### Po co

Dwa defekty tej samej warstwy prezentacji liczb.

1. **Separator dziesiętny.** Repo ma formater polski `frontend/src/ui/shared/formatPolishValue.ts`
   (`formatPolishValue`, `formatCurrent`, `formatVoltage`, `formatActivePower` i pokrewne). Obok
   niego, na `e8756f42`, kod produkcyjny frontu ma 349 wywołań `.toFixed(` w 128 plikach i 66
   wywołań `toLocaleString(`. `toFixed` daje kropkę, więc każda liczba złożona nim w tekst dla
   projektanta jest zapisana nie po polsku. Przykład: tabela przemiatania zaczepów
   (`ui2/wyniki/oltc/EkranBadanOltc.tsx:234`, `p.tap_ratio.toFixed(4)`).
2. **Skrajne napięcia przez poziomy napięcia.** Badanie przemiatania zaczepów
   (`backend/src/network_model/solvers/power_flow_oltc_studies.py:196–201`, poza B-01) liczy
   `min_bus_kv = min(...)` i `max_bus_kv = max(...)` po WSZYSTKICH węzłach sieci w kV. W sieci
   SN z odbiorami nN minimum to zawsze szyna nN (ok. 0,4 kV), a maksimum szyna SN (ok. 15 kV).
   Ekran pokazuje je jako „U min w sieci” i „U max w sieci” (`ui2/wyniki/oltc/strings.ts:54–55`).
   Porównywanie ich nie ma sensu inżynierskiego, a przez to nie widać tego, po co przemiata się
   zaczepy: czy napięcia każdego poziomu mieszczą się w paśmie.

   W tym samym miejscu `finite = [v for v in v_map.values() if v == v]` po cichu gubi węzeł
   z napięciem NaN.

#### §0 Rozstrzygnięcia

1. **Jeden formater liczb dla projektanta.**
   - Każda liczba, która trafia do tekstu widocznego dla projektanta (ekran, eksport, etykieta
     SLD, podpowiedź, komunikat), przechodzi przez formater polski: przecinek dziesiętny,
     odstęp tysięcy wg normy PL, odstęp przed jednostką (spójnie z kartą PL-ZNAKI).
   - Liczba znaczących miejsc wynika z wielkości (jak w `formatPolishValue`), nie z kaprysu
     miejsca wywołania.
   - `.toFixed(` / `toLocaleString(` zostają tylko tam, gdzie wynik nie jest tekstem dla
     człowieka (geometria SVG, klucze, identyfikatory, dane do wykresu przed osią z formaterem).
2. **Inwentarz klasy** (w meldunku, `plik:linia`, decyzja): każde `.toFixed(`,
   `toLocaleString(`, `Intl.NumberFormat` i ręczne składanie liczby z jednostką w kodzie
   produkcyjnym frontu. Decyzja: formater / pozostaje (z uzasadnieniem: nie jest tekstem dla
   człowieka).
   - Po stronie backendu inwentarz tekstów z liczbami dla projektanta, np. komunikaty
     i opisy kroków śladu składane f-stringiem z `:.2f`.
   - Rdzenie B-01 bez zmian: ich liczby w tekstach formatujesz na granicy warstwy aplikacji
     albo zapisujesz jako pozycję do decyzji właściciela.
   - Pola `*_latex` zostają w konwencji LaTeX-a. Separator w LaTeX-u to `{,}`: zmierz konwencję
     repo i zastosuj jedną.
3. **Strażnik klasy.**
   - Strażnik AST/tekstowy: `.toFixed(` i `toLocaleString(` w wyrażeniu, które trafia do JSX
     albo do literału szablonowego z jednostką, jest błędem.
   - Lista dozwolona pusta albo zamknięta z uzasadnieniem przy każdym wpisie; samotest
     z iniekcją.
4. **Skrajne napięcia w obrębie poziomu.**
   - Wynik przemiatania (i każdy inny wynik z „U min/U max w sieci”; inwentarz klasy po
     `min_bus`/`max_bus`/`u_min`/`u_max` w `backend/src` i w ekranach) podaje skrajności osobno
     dla każdego poziomu napięcia. Poziom to napięcie znamionowe szyn z jednego źródła pasm
     napięć (karta PASMO-1KV).
   - Wielkość i jednostka: napięcie względne U/Un w p.u. albo w % (spójnie z ekranem profilu
     napięć i pasmem dopuszczalnym), z nazwą szyny minimum i maksimum z modelu.
   - Węzeł z napięciem niefinitywnym nie znika po cichu. Punkt przemiatania dostaje nazwany
     stan „rozpływ niezbieżny / napięcie nieokreślone” z liczbą takich węzłów.
   - Pola wyniku zmieniasz addytywnie albo z podbiciem wersji kontraktu (reguła 6 CLAUDE.md
     dotyczy wyników FROZEN rozpływu; ten wynik należy do badań zaczepów — ustal jego status
     i zapisz w meldunku).
   - Ekran pokazuje skrajności per poziom z pasmem dopuszczalnym. Test przez natywną
     interakcję.

#### Testy jako iloczyn cech

- {wielkość: prąd, napięcie, moc czynna/bierna/pozorna, procent, długość, częstotliwość,
  przekładnia, liczba bezwymiarowa} × {wartość: 0, ujemna, < 1, ≥ 1000, ≥ 10⁶, niefinitywna} ×
  {miejsce: ekran wyników, eksport, etykieta SLD, komunikat} → zapis polski z jednostką i odstępem.
- {sieć: tylko SN, SN + nN, dwa poziomy SN (np. 15 i 20 kV)} × {punkt przemiatania: zbieżny,
  niezbieżny, węzeł NaN} → skrajności per poziom w p.u./% z nazwami szyn i nazwany stan dla
  niezbieżnego.
- Test czerwony na bazie dla obu defektów (dowód), zielony po naprawie.

#### Granice

- Rdzenie B-01 (`scripts/rdzenie_b01.py`) bez zmian; kontrakty FROZEN nietknięte.
- Fikstury i migawki wyłącznie z generatorów. Fikstury harnessu sprawdzasz testem
  `tests/ci/test_fixtury_harnessu.py` (porównanie z tolerancją). Zatwierdzasz tylko to, co ten
  test wskazuje jako zmienione.
- Równolegle pracują:
  - POLA-W-TORZE — topologia stacji, SLD;
  - GOTOWOSC-DER-BACKEND — `station-der/**`;
  - ODMOWA-DANYCH-422 — typ odmów w `backend/src`;
  - AB-1b.3b — rdzeń dynamiki.

  W plikach z ich zakresu zmieniasz wyłącznie zapis liczb, bez przebudowy.

#### Kryterium ukończenia

- Inwentarz klasy z decyzją dla każdej pozycji.
- Strażnik z samotestem.
- Testy iloczynu cech.
- Testy celowane backendu badań zaczepów.
- Vitest modułów dotkniętych, `npm run type-check`, `npm run lint`.
- Speki zrzutowe ekranów wyników na realnym backendzie (porty: backend 18901, frontend 5321).
- `python scripts/guardy_z_ci.py` — kody wyjścia w meldunku.
- Zrzuty ekranu badań zaczepów (oba motywy) jako materiał B-02.
- Pełną regresję robi integrator.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## PL-ZNAKI-2

**Stan 2026-09-30:** NIE ROZPOCZĘTA.

### Karta PL-ZNAKI-2 — domknięcie klasy „tekst dla projektanta bez polskich znaków”

Drzewo: `<worktrees>/odbior-plznaki2` (gałąź `int/plznaki2`, baza =
czubek `int/fala` z chwili startu). Jeden commit lokalny, BEZ push. Meldunek:
`<scratchpad>/plznaki2/meldunek.md`.

#### Po co

Karta PL-ZNAKI (commit `be26f666`, meldunek `scratchpad/cgmes/meldunek.md`) naprawiła ok. 1 260
literałów w 105 plikach `backend/src`, ale zostawiła trzy obszary z uzasadnieniem, które się
nie broni:
1. **35 plików `network_model/solvers/**`, 239 literałów** — „rdzenie FROZEN, B-01”. Granica B-01
   to od `525ec765` jedna lista `scripts/rdzenie_b01.py` (IEC 60909 ×3, NR/GS/FD ×4,
   protection_iec60255, ncrfg_ptpiree/, frt_hvrt/, state_estimation_wls,
   phase_state_sn, v126_academic, catalog/profiles/nc_rfg/). Pozostałe solvery (np.
   `cable_ampacity_derating.py`, `fault_loop_builder.py`, `cable_voltage_drop.py`) edytuje się
   jak każdy kod. Test `tests/ci/test_polskie_znaki.py` nadal traktuje cały
   `network_model/solvers/**` jako zamrożony (potwierdził to też wykonawca MAGISTRALA-OCENA) —
   to drugi opis tej samej granicy (reguła KLASA §3).
2. **Front: 481 literałów w 165 plikach `frontend/src`** (poza testami) ze słowem bez znaków
   diakrytycznych — zostawione „bo kolizja z kartami równoległymi”; te karty są już scalone.
3. **Fikstury e2e** `frontend/e2e/fixtures/test-fixtures.ts` („Szyna 110kV” i podobne) oraz
   nazwy sieci wzorcowych typu „GPZ Pierscien” w generatorach/fiksturach.
4. **Luki słownika.** Słownik `backend/tests/ci/polskie_znaki_slownik.py` zna tylko formy
   obecne w korpusie repo, więc przepuszcza m.in. „tuz”, „lezy”, „konczy”, „koncu”,
   „Szerokosc”, „znaczacych”, „rozdzielczosc”, „nakladaja”, „wewnatrz”, a nie rozstrzyga form
   zależnych od składni („z tolerancja” → „z tolerancją”, „nie jest komenda” → „komendą”).
   Integracja AB-1b.1b (`int/fala`) poprawiła słownikiem tylko to, co słownik zna — nowe teksty
   rdzenia i kontraktów dynamiki (`enm/scenariusze.py`, `application/contracts/
   resultset_dynamic_v2.py`, `network_model/solvers/dynamika/**` — NIE B-01) wymagają ręcznego
   przeglądu. Rozszerz słownik o formy jednoznaczne (z testem, że żadna forma nie jest
   poprawnym słowem polskim bez znaków) i przejrzyj ręcznie literały, których słownik nie
   rozstrzygnie.
Dodatkowo: odmowy `cable_ampacity_derating.py` pokazują projektantowi zapis krotki Pythona
(„krotka” w tekście) — to ta sama klasa redakcyjna.

#### §0 Rozstrzygnięcia

1. Zapadka FROZEN w `tests/ci/test_polskie_znaki.py` (i każdym innym skanerze tej klasy)
   czyta granicę z `scripts/rdzenie_b01.py` (`jest_rdzeniem_b01`), nie z prefiksu katalogu.
   Pliki B-01 zostają pod pinem per plik (liczba literałów zmierzona, zapadka tylko w dół);
   pozostałe solvery naprawiasz i schodzą do zera.
2. Front: naprawa literałów tekstu dla projektanta (etykiety, komunikaty, tytuły, podpowiedzi,
   nazwy w danych demonstracyjnych) tym samym słownikiem form co karta PL-ZNAKI (korpus repo,
   ręczny przegląd każdej zmiany: fleksja, „krotka” ≠ „krótka”, identyfikatory i klucze
   NIE są tekstem). Strażnik frontu z tym samym słownikiem (jedno źródło słownika dla obu
   stron) i zapadką; allowlista wyłącznie dla identyfikatorów/kluczy z uzasadnieniem.
3. Fikstury e2e: granica CLAUDE.md „fikstury e2e” oznacza zakaz ręcznego obchodzenia
   generatorów, nie zakaz poprawiania tekstu — ręczne atrapy e2e z nazwami bez znaków
   przepisujesz na nazwy kanoniczne; jeśli atrapa ma odpowiednik w generatorze, podmieniasz ją
   na wynik generatora. Speki e2e, które przepisują nazwy ręcznie, czytają je z fikstur.
4. Jednostki: odstęp przed jednostką („110 kV”, nie „110kV”) — ta sama reguła co PL-ZNAKI.
5. Komunikaty z krotką Pythona w `cable_ampacity_derating.py` → zdanie po polsku z nazwą
   parametru i wartością; iloczyn cech testu obejmuje każdą odmowę tego modułu.

#### Inwentarz klasy (do meldunku)

Pomiar PRZED: backend (solvery poza B-01: plik → liczba literałów), B-01 (plik → pin), front
(plik → liczba), fikstury e2e i generatory (plik → nazwy). Pomiar PO: to samo. Każde miejsce
świadomie pozostawione — uzasadnienie merytoryczne.

#### Granice

- Rdzenie B-01 bez zmian; ich literały → lista decyzji właściciela w meldunku (plik:linia,
  brzmienie).
- Kontrakty FROZEN i determinizm: tekst w wynikach solverów spoza B-01 zmienia odciski migawek
  i fikstur — każdą zmianę fikstury/złotego parytetu udowadniasz liść po liściu (tylko tekst).
- Wartości `error_code`, klucze API, identyfikatory i nazwy plików bez zmian.

#### Kryterium ukończenia

Zero literałów tekstu bez znaków poza B-01 (backend) i poza allowlistą z uzasadnieniem (front);
strażniki z samotestami; generatory fikstur uruchomione, różnice sklasyfikowane; biegi
weryfikacyjne wg `<scratchpad>/REGULA_TESTOW.md`
(testy celowane warstw dotkniętych, `guardy_z_ci.py`, type-check, lint, vitest modułów
dotkniętych, speki e2e ekranów dotkniętych; pełną regresję robi integrator); kody wyjścia w meldunku.

Python: `/root/.cache/pypoetry/virtualenvs/mv-design-pro-backend-D2vgvUMQ-py3.11/bin/python`,
`PYTHONPATH=src:.` w `backend`; black -l 100; `frontend/node_modules` to dowiązanie — nie
uruchamiaj `npm ci`. Commit: `git -c user.name="radekizk-sketch" -c user.email="radek.izk@gmail.com"
commit --cleanup=verbatim`, stopka:
(stopka commita: dwie linie z bieżących wytycznych sesji — współautor i łącze sesji)

---

## O-53b (moc źródeł × transformator × nastawa)

**Stan 2026-09-30:** NIE ROZPOCZĘTA.

### Karta O-53b — domknięcie klasy „moc źródeł × transformator × nastawa" (decyzje otwarte z meldunku AB-H0)

#### Cel (jednym zdaniem)
Reguła mocy z O-53 ma być prawdziwa dla KAŻDEJ konfiguracji modelu (kilka źródeł na jednym transformatorze, stan
łączników, nadpisania scenariuszy, trasy zapisu poza operacjami domenowymi, modele zapisane przed O-53, podgląd
kreatora) — bez cichych luk, na worktree `<worktrees>/odbior-o53b/mv-design-pro`
(detached `34b965cd` = HEAD z AB-H0 po rebase; `node_modules` podlinkowane).

#### §0 Rozstrzygnięcia zarządcy (O-53b, do rejestru planu §2.3 jako podpunkty O-53)
1. **Suma źródeł na transformatorze.** Kontrola jest PER TRANSFORMATOR: Σ_i S_wym,i po wszystkich źródłach w wyspie
   nN zasilanej przez ten transformator (S_wym,i = max(S_n,jedn,i·n_i, |P_i|/cosφ_i)), pomnożona przez k_j GRUPY,
   ≤ S_n,TR·k_obc. k_j grupy: jawna wartość spójna dla wszystkich źródeł grupy (nośnik jak dziś — pole źródła);
   różne jawne k_j w jednej grupie = odmowa nazwana (niejednoznaczność); brak = 1,0. Każda operacja zapisu
   (tworzenie, przypisanie, aktualizacja, usunięcie) sprawdza transformatory dotknięte zmianą z pełną sumą; test:
   dwa źródła 0,6 MVA na TR 1,0 MVA — drugie odmawiane, pierwsze przyjęte; selektor szablonu i operacja dają ten
   sam werdykt (para predykatów).
2. **Stan łączników = stan projektowy.** Wyspę nN wyznaczasz po ZAMKNIĘTYCH łącznikach (jak liczy rozpływ) — punkt
   normalnie otwarty rozdziela grupy; test: NO między sekcjami → dwa transformatory, dwie sumy. (To inna semantyka
   niż resolver zacisku zabezpieczenia w AB-1b.1a, który celowo ignoruje stan — tam chodzi o strukturę pola.)
3. **Nadpisania w scenariuszach** (`enm/scenariusze.py`: `setpoints`, `gen_scaling`): walidacja wejścia analizy —
   |P| po nadpisaniu ≤ P_max,jedn·n, odmowa nazwana z kodem w kanonie (wejście analizy nie może przekroczyć
   tabliczki); test iloczynu {setpoint, scaling} × {≤, >}.
4. **Trasy poza routerem produkcyjnym** (`PUT /enm`, `/enm/ops`, `/enm/ops/batch`, `/wizard/apply-step`) piszą
   model z pominięciem operacji domenowych: KASACJA (zasada właściciela: co przestarzałe, usuwać) z dowodem zera
   konsumentów produkcyjnych; testy tych tras kasowane razem (test bez produktu = dług); wpisy wskrzeszenia jako
   ŁATKA na `scripts/legacy_public_path_guard.py` HEAD (`scratchpad/o53b/legacy_o53b.patch` + pin samotestu) —
   pliku nie edytujesz, zarządca nakłada przy scaleniu. Jeśli którąś trasę konsumuje kreator/harness — przepinasz
   konsumenta na operacje domenowe, nie zostawiasz trasy.
5. **Modele sprzed O-53**: reguła `NetworkValidator` (severity WARNING, nieblokująca analiz) z tej samej funkcji —
   „moc transformatora przekroczona przez źródła" widoczna w panelu problemów, rozpływ nadal liczy się i pokazuje
   przeciążenie; test na modelu złożonym bez kontroli (fixture) oraz brak duplikatu ostrzeżenia dla modelu zgodnego.
6. **Podgląd kreatora**: żądanie podglądu niesie `catalog_ref` i `quantity` (front wysyła wybraną kartę i liczbę
   jednostek — zgoda na frontend kreatora i jego testy), podgląd liczy PEŁNĄ regułę z członem S_n,jedn·n; brak
   karty w żądaniu = podgląd nazywa, że członu S_n nie ocenił (nie udaje).
7. **Mocki frontendu** ze skasowanym kodem (`podsumowanieAutoBieg.test.tsx:41`, `KreatorZrodlaOze.test.tsx:442`) →
   kod `converter.transformer_capacity_exceeded`; zgoda na te pliki.
8. Wzory wyłącznie w `network_model/pochodne` / `domain/generator_validation.py` (bez fizyki w API/UI).

#### Granice i środowisko
Zero git zmieniającego stan; edytujesz tylko `odbior-o53b`; jeden ciężki proces naraz z sentinelem; piny parami
z pomiaru (mypy od 249/43, podstawienia od 3877/536, słownik gotowości od 137, allowlista werdyktu, tsconfig 100);
`legacy_public_path_guard.py` i CLAUDE.md nie ruszasz (łatka jak w pkt 4). Docs: plan §2.3/§7, słownik gotowości
z rejestru, macierz API przy kasacji tras.

#### Kryterium ukończenia (logi `scratchpad/o53b/*.log`, kody bezpośrednio)
Testy najpierw czerwone (każdy z pkt 1–6 ma iniekcję/sondę), potem: pełna regresja backendu 0 failed;
`guardy_z_ci.py` komplet; fixtury/OpenAPI ×2 bajt w bajt; frontend type-check/lint rc=0 + vitest dotkniętych
katalogów (pełny, jeśli zmienia się komponent kreatora); meldunek §103 (a)–(e) z tabelą sześciu decyzji.

---

## AB-H0b (pozycje zebrane)

**Stan 2026-09-30:** NIE ROZPOCZĘTA — lista pozycji, karta do napisania.

### AB-H0b — pozycje zebrane do karty (uczciwość V12.6 i domknięcia po AB-H0 / Pakiecie 0)

Zebrane z odbiorów 2026-09-23 (karta powstanie po scaleniu AB-H0 i Pakietu 0; baza = HEAD po tych commitach).

1. Most V12.6 z kart (po Pakiecie 0): stałe/most `v126` — uczciwość stałych awaryjności i MTTR (skąd, jaka
   podstawa, etykieta źródła w prezentacji; zakaz cichych stałych).
2. `reactive_adequacy` — granice Q z karty (katalog/karta urządzenia), nie z domysłu; odmowa nazwana bez karty.
3. `network_model/solvers/v126_academic.py:1063-1101` `max_loading_percent` w N-1: obciążenie z odbioru JEDNEJ
   szyny `to` przy U_n bez rozpływu (pomiar wykonawcy AB-1b.1a, 2026-09-23). Rdzeń FROZEN → B-01: wiersz §12
   planu wpisuje AB-1b.1a; w AB-H0b: prezentacja tej liczby wyłącznie z etykietą „szacunek bez rozpływu" z
   rekordu backendu (proweniencja), naprawa właściwa = bieg PF per kontyngencja po zgodzie właściciela.
   **Stan 2026-09-30 (karta B01-RUNDA-1, R0-g):** liczba nieprezentowana na żadnym ekranie ani w raporcie
   (karta W3-E zdejmuje ranking); rekord `ranking_n1.metoda_pl` = „szacunek bez rozpływu” (stała
   `RANKING_N1_METODA_V126`) i panel ekranu analiz akademickich pokazują metodę z rekordu. Kasacja szacunku i
   N-1 z rozpływu — zmiana zakresu (g) wg decyzji B-01 z 2026-09-30.
4. Import CSV/XLSX → Pakiet G (poza AB-H0b; tu tylko odsyłacz).
5. Jakość energii — warstwa profili → AB-H1 (poza AB-H0b; odsyłacz).
6. `enm_contract_parity` — SPRAWDZANE po scaleniu AB-H0 (wpis z karty integracji AB-H0).

---

## Szkice kart bez treści (synteza architekta 2026-09-30, przyjęta jako O-57)

Szkice §0 poniżej pochodzą z syntezy strategicznej (tylko odczyt, dowody `plik:linia`) i zostały
punktowo zweryfikowane przez sesję wykonawczą przed przyjęciem (plan §2, O-57). Pełną kartę —
powód, inwentarz klasy PRZED naprawą, testy jako iloczyn cech, granice plików, kryterium
ukończenia — pisze integrator przed startem wykonawcy; kryteria odbioru: plan §5, „Kryteria odbioru
doprecyzowane (O-57)”.

### DYNAMIKA-W-TLE — bieg dynamiki poza żądaniem HTTP (warunek Pakietu E karty AB-1b.2, AB-1c i AB-6)

**Stan 2026-09-30:** NIE ROZPOCZĘTA — szkic §0.

Fakty: bieg synchroniczny w żądaniu (`api/execution_runs.py:236-253`), Celery bez zadań i bez wykonawcy (`api/celery_app.py`; `infrastructure/persistence/repositories/canonical_run_repository.py:482`: „`ExecutionBackend` z DT-12 nie jest wdrożony”), klient E-32 już odpytuje (`frontend/src/ui2/wyniki/dynamika/api.ts:140-175`), maszyna 4 CPU, narzędzie jednostanowiskowe (OD-13/OD-27), horyzont do 600 s, bieg kontrolny 3×. **Decyzja:** `ExecutionBackend` (DT-12) jako wykonawca w procesie: kolejka z jednym ciężkim biegiem naraz, stan biegu utrwalany (`PENDING → RUNNING → FINISHED/FAILED/CANCELLED`) w istniejącym rejestrze `canonical_runs`, `POST …/execute` zwraca natychmiast 202 ze stanem, klient odpytuje jak dziś, anulowanie jako zdarzenie sprawdzane między krokami całkowania (flaga w kontekście biegu — jedyny punkt styku z rdzeniem, addytywny), czas biegu i limit jawnie w wyniku (`czas_obliczen_s` już jest — `dynamika/wynik.py:134`). Martwa konfiguracja Celery (`api/celery_app.py`, usługa `celery` w `docker-compose.yml`) — kasacja z bramką wskrzeszenia (ZASADA NR 1; „co przestarzałe, usunąć”). Alternatywa (Celery jako wykonawca) odrzucona: zależność od Redis w testach i pracy lokalnej, brak wartości dla jednego użytkownika, prewencyjna abstrakcja. Zakres plików: `api/execution_runs.py`, nowy `application/execution/wykonawca.py`, `infrastructure/persistence/**` (status), `enm/canonical_analysis.py` — wyłącznie punkt wejścia `execute_run` (koordynacja z torem R), `frontend/src/ui2/wyniki/dynamika/api.ts`; test iloczynu: {rodzaj biegu: rozpływ, zwarcie, dynamika} × {krótki, długi, anulowany, błąd} × {odpytywanie: przed, w trakcie, po}; e2e: bieg > limitu czasu odpowiedzi kończy się bez zerwania żądania.

**Koszt biegu jako kryterium (PERF-DYN-0).** Karta AB-1b.2 §5 R3 mierzy 3,6 s dla układu dwuwęzłowego przy 600 krokach; brak pomiaru dla sieci 50 stacji (PERF-DYN-0 z karty W6-2 §0 pkt 9 — budżet ≤ 60 s — nie ma wpisu w rejestrze). **Decyzja:** PERF-DYN-0 wykonać w DYNAMIKA-W-TLE (pomiar na scenie harnessu i sieci złotej, wartość do meldunku), a AB-1b.2 Pakiet E raportuje koszt przed/po biegu kontrolnym; przekroczenie budżetu bez wykonawcy w tle = STOP integracji Pakietu E. Pomiar PERF-DYN-0 obejmuje liczbę wątków BLAS (jeden i domyślna) na hoście bez obcego obciążenia: polityka wątków obrazu Dockera (dziś domyślna) wynika z tego pomiaru, nie z założenia — backend e2e ma jeden wątek od karty WATKI-BLAS-E2E (`playwright.config.ts`), bo bieg zwarciowy sieci 50 stacji przy obcym obciążeniu i wątkach domyślnych trwał 866 s zamiast 6 s.

### KATALOG-DYNAMIKI-BRAKI — dane rodzin urządzeń dynamiki (maszyna synchroniczna przed AB-1c, magazyn przed AB-4a)

**Stan 2026-09-30:** NIE ROZPOCZĘTA — szkic §0.

Fakty: `BESSBatteryType` ma `capacity_kwh`, `c_rate` (`network_model/catalog/types.py:1777-1842`), nie ma sprawności ani okna SOC; kontrakt `Magazyn` wymaga `sprawnosc_ladowania`, `sprawnosc_rozladowania`, `soc_min`, `soc_max`, `soc_poczatkowy` (`enm/dynamika_modele.py:320-352`); materializacja odmawia `KOD_MAGAZYN_DANE` z listą pól (`enm/dynamika_z_katalogu.py:39-42, :95-102`). **Decyzja:** (a) sprawności i okno SOC (BMS) = dane tabliczki/karty producenta → pola `BESSBatteryType` z proweniencją i stanem źródła, bez domyślek (dane: OD-17; do czasu — nazwana odmowa jak dziś); (b) `soc_poczatkowy` NIE jest daną urządzenia, lecz WARUNKIEM POCZĄTKOWYM → przenieść z bloku `Magazyn` do punktu pracy/scenariusza (`ScenariuszDynamiczny` albo nadpisanie na E-32, wymagane; brak → gotowość `magazyn.soc_poczatkowy_missing`) — zmiana kontraktu `dynamika_modele.py` + adapter + `urzadzenia/magazyn.py` → wykonać w torze R razem z AB-4a (nie osobno); (c) katalog maszyny synchronicznej: przestrzeń `MASZYNA_SYNCHRONICZNA` z profilami typowymi normy (IEEE 421.5 dla regulatorów; parametry maszyny jako `profil_typowy_normy` wybierany JAWNIE — W6-1 §0 pkt 2–4) — przed AB-1c; (d) profile wiatru typu 1/2 — kasacja (brak modelu elektrycznego typów 1/2 w rdzeniu: `solvers/dynamika/urzadzenia/turbina_wiatrowa.py:114`, W6-J — DEFER; profile `default_wind_type_1/2` w `catalog/der_dynamic/defaults.py:186, :210` są danymi bez konsumenta → kasacja z bramką wskrzeszenia i nazwaną odmową gotowości „turbina typu 1/2 poza zakresem produktu”).

### AB-1c — kryteria FRT na biegu kanonicznym (szkic §0 z O-57)

**Stan 2026-09-30:** NIE ROZPOCZĘTA — karta do napisania; zależności: AB-1b.2, AB-1d_min, AB-P1, AB-1a,
KATALOG-DYNAMIKI-BRAKI (maszyna synchroniczna), DYNAMIKA-W-TLE (plan §11).

**Inwentarz kasacji toru `frt_hvrt` (pełniejszy niż O-44):** O-44 wymienia trzy miejsca. Pomiar: 5 plików backendu (`application/calculation_readiness/service.py:66, :90, :595-627, :884, :908`; `application/analyses/frt_trajektorie.py:30-35, :318, :408`; `application/analyses/frt_sekwencja.py:50`; `application/ncrfg_compliance/frt_input.py:14`; `solver_input/provenance.py:312`) i 7 plików frontu (`ui2/oze/api.ts`, `ui2/oze/macierz/MacierzNcRfg.tsx`, `ui/network-build/station-der/readiness.ts`, `ui/network-build/der-configurator/DerConfigurator.tsx`, `ui/workspace/surfaces/DerSurfaces.tsx`, `ui/sld/shared/sldActionExecutor.ts`, `ui/sld/v2/command/SldCommandService.ts`) plus ekran `ui2/oze/frt/` (EkranFrt.tsx, SekcjaSekwencjiZapadow.tsx, WykresTrajektoriiChart.tsx). Karta AB-1c (jeszcze nienapisana) ma nieść ten inwentarz jako klasę.

**Rozstrzygnięcia wejściowe:** (1) kasacja `frt_hvrt/**` i `stability_rms/**` wymaga odpowiedzi właściciela
o zakres delegacji wobec listy B-01 (O-57 pkt 7; plan §12.2 (i)) — stan 2026-09-30: `stability_rms/**`
skasowany w karcie B01-RUNDA-1 (decyzja ostateczna, O-59); `frt_hvrt/**` zostaje do AB-1c — do tego czasu tor T3 zostaje z
`NIE_OCENIONO`; (2) blok `Generator.dynamika` wyłącznie z materializacji katalogu, `p_dostepna_mw` jako
wielkość warunków pracy z edytorem w scenariuszu i punkcie pracy (O-57 pkt 8); (3) S_k,min i X/R punktu
przyłączenia jako dane warunków przyłączenia modułu w `Generator.deklaracje_modulu` z kodem gotowości
`generator.warunki_przylaczenia_missing` (O-57 pkt 9); (4) odbiór logiki czterech wymagań na profilu
wzorcowym testowym:

Fakt: wszystkie obwiednie, tolerancje i program badań mają stan `NIEUSTALONE` (58 wierszy §12.1), więc na produkcyjnych profilach każdy werdykt FRT kończy się `BRAK_PODSTAWY` i logika czterech wymagań nie jest sprawdzalna end-to-end. **Decyzja (przyjęta w O-57 pkt 10):** warstwa profilu **wzorcowego testowego** (`catalog/profiles/nc_rfg/operatorzy/wzorcowy_testowy.yaml`, `tylko_testy: true`) z wartościami w stanie `WSKAZANE` i dokumentem „dana testowa programu — nie do dokumentów”, na wzór danych testowych sieci wzorcowych (O-49 pkt 3); loader odmawia użycia tego profilu w certyfikacie, wniosku i studium (predykat + test), UI go nie oferuje w wyborze operatora. Dzięki temu E2E-R1/R11 sprawdzają pełny łańcuch statusów, a produkcja pozostaje uczciwie `BRAK_PODSTAWY` do OD-21. Alternatywa (odbiór AB-1c wyłącznie na testach jednostkowych kryteriów) nie spełnia „każdy scenariusz ma ekran i bramkę B-02”.

### O-52 — łagodne rzutowanie pydantic na granicach danych

**Stan 2026-09-30:** NIE ROZPOCZĘTA — szkic §0.

Pomiar: 60 klas `BaseModel` w `enm/models.py`, `ConfigDict(... strict ...)` — 1 wystąpienie w `backend/src`, `extra="forbid"` — 55; ścisłość per pole tylko w `ncrfg_ptpiree/contracts.py:125, :147-148` (B-01) i w `DeklaracjeModulu` (O-50 (6): `true ↛ 1,0 s`, `"0.8" ↛ 0,8`, `0 → 1970-01-01`). **§0:** (1) tryb ścisły na KAŻDEJ granicy danych od użytkownika i danych zapisanych (żądania API, modele ENM, kontrakty wejść solverów spoza B-01): `model_config = ConfigDict(strict=True, extra="forbid")`, wartość innego rodzaju = nazwana odmowa danych (typ z karty ODMOWA-422), nigdy ciche rzutowanie; (2) inwentarz klasy: każda klasa pydantic w `api/`, `enm/`, `solver_input/`, `application/**/contracts` z decyzją (ścisła / celowo łagodna z uzasadnieniem — np. wczytywanie archiwów starych wersji, wtedy jawna konwersja w jednym miejscu); (3) rdzenie B-01 — pozycja bramki (kontrakty `ncrfg_ptpiree`, `frt_hvrt`, `stability_rms`); (4) strażnik AST: klasa `BaseModel` bez `strict=True` poza zamkniętą listą dozwoloną z uzasadnieniem per wpis, samotest z iniekcją; (5) testy jako iloczyn: nośnik (żądanie, ENM, scenariusz, import XLSX/archiwum) × typ pola (float, int, bool, data, Literal, enum) × wartość innego rodzaju (napis liczby, liczba dla logicznej, liczba dla daty, `null`). **Kryterium ukończenia:** strażnik czerwony na bazie (liczba klas), zielony po; snapshot OpenAPI (typy zaostrzone — zmiana kontraktu jawna); fikstury z generatorów; zero regresji łańcucha.

### CICHE-ZERO — wartość zastępcza zasilająca decyzję

**Stan 2026-09-30:** NIE ROZPOCZĘTA — szkic §0; pierwsza instancja klasy w karcie GOTOWOSC-DER-BACKEND.

Pomiar: front (kod produkcyjny) 258 × `?? 0`, 25 × `?? false`; backend 57 × `or 0.0`, 11 × `or 0`, 3 × `or False` (np. `infrastructure/cgmes/cgmes_importer.py:260-266, :375-376`; `solvers/equipment_checks/vt_burden_voltage_drop.py:211`, `ct_burden_saturation.py:244`; `pochodne/pasma_napieciowe.py:105`; `v126_academic.py:640-641` — B-01). Istniejący strażnik `scripts/false_zero_guard.py` jest TYLKO raportujący (`:1-24`: „report-only … zawsze EXIT 0”) — deklaracja bez zęba. **§0:** (1) definicja klasy: wartość zastępcza (`?? 0`, `?? false`, `or 0.0`, `or False`, `.get(k, 0)`) zasilająca DECYZJĘ (próg, warunek, werdykt, gotowość, dobór) albo wynik dla projektanta; dozwolone wyłącznie dla wielkości, dla których zero jest faktem (licznik elementów, suma pustej kolekcji) — z komentarzem uzasadnienia przy każdym wystąpieniu; (2) inwentarz klasy z decyzją per wystąpienie (brak danej → nazwany kod gotowości/odmowa z akcją; fakt → uzasadnienie); (3) strażnik: `false_zero_guard` przechodzi w tryb ścisły z budżetem 0 i rozszerza się o wzorce backendu (`or 0.0`/`or False` w wyrażeniu warunkowym lub przekazane do funkcji domenowej) — jedna reguła dla obu języków, lista dozwolona z uzasadnieniem per wpis, samotest; (4) rdzenie B-01 → pozycja bramki; (5) testy iloczynu: {brak danej, dana = 0 prawdziwe, dana obecna} × {oś decyzji: gotowość, dobór, werdykt, wyświetlenie}. **Kryterium:** strażnik czerwony na bazie z liczbą, zielony po; zero `?? 0`/`or 0.0` zasilających decyzję poza listą; e2e ekranu gotowości DER (po GOTOWOSC-DER-BACKEND) z brakiem mocy → „brak danych”, nie „niewymagane”.
