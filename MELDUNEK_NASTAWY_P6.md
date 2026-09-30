# Meldunek — karta BIEG-ZABEZPIECZEN-NA-PARTII-6

Ocena nadprądowa z modelu (karta BIEG-ZABEZPIECZEN-Z-MODELU, commit `1551dc49`) przeniesiona na
czubek partii integracji 6 (`615f3b24`) i połączona z zasadami partii 6. Gałąź:
`claude/mv-design-pro-twin-audit-u4lhy0-karta-nastawy-p6`.

Commity z kodem (do przeniesienia przez integratora):

| Commit | Treść |
|---|---|
| `9d7e4968` | przeniesienie `1551dc49` (cherry-pick -x) z rozwiązaniem konfliktów i integracją z partią 6 |
| `c04bafce` | naprawy e2e: nazwa urządzenia w porównaniu, jednostka progu w kd6, tr2w jako projekt zastany (+ zrzuty, patrz niżej) |
| `df8ac6dd6` | naprawy czerwieni pełnej regresji: z karty oraz zastanej na partii 6 |

Ten plik jest osobnym commitem meldunku — do pominięcia przy integracji.

## 1. Wynik i dowody (kody wyjścia łapane bezpośrednio)

Wszystkie biegi Pythona szły z `OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1` i prywatnym
`--basetemp` poza drzewem repozytorium.

| Bramka | Wynik |
|---|---|
| Pełna regresja backendu `pytest -q -m "not pandapower and not andes"` (drzewo `df8ac6dd6`) | **26 973 passed, 37 deselected, rc=0** (1 h 31 min) |
| `poetry run python ../scripts/guardy_z_ci.py` (drzewo przed commitem `df8ac6dd6`, bez zmian od tego czasu) | **KOMPLET ZIELONY, rc=0** (3375 samotestów guardów, type-check, lint) |
| Pełny vitest `vitest run --no-file-parallelism` (po `9d7e4968`) | 877/879 plików; 12 885 testów zielonych, **3 czerwone — wyłącznie bazowe z karty** (`menuBudowyNaKanwie.test.tsx` ×2, `pathInvariants.test.ts` ×1); oba testy budżetu czasu przeszły w tym biegu; rc=1 |
| Vitest 11 plików testów zmienionych w `df8ac6dd6` (usunięte nieużywane importy) | 411/411 zielonych |
| `npm run type-check`, `npm run lint` (po ostatniej zmianie frontu) | rc=0, rc=0 |
| e2e na realnym backendzie: 23 specyfikacje z grep `protection\|koordynacj\|zabezpiecz` w `frontend/e2e/` | pierwszy bieg: 261 passed, 7 failed; po naprawach (`c04bafce`) ponowny bieg 3 dotkniętych specyfikacji: tr2w 3/3, flow-ekspert i kd6 zielone (18 passed) |

Uwaga środowiskowa: Playwright z repo oczekuje Chromium 1208, a w `/opt/pw-browsers` jest 1194.
Biegi e2e szły więc z `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`, bez
`playwright install`.

## 2. Rozstrzygnięcia konfliktów przeniesienia (plik po pliku)

Partia 6 zmieniła te same miejsca co karta w pięciu kartach: POLA-W-TORZE (6cc1b547),
ODMOWA-DANYCH-422 (7f08ecea), POLE-ZAJĘTE (85f49af6), SLD-SUBSTRAT (3c246c08/9dbc8ee7) oraz
AUTOTESTY i GRANICE-IMPORTÓW.

- **`api/protection_runs.py`**
  - Partia 6: `except OdmowaDanychError` przy tworzeniu biegu; poprawka parsowania UUID w nakładce SLD.
  - Karta: kasuje nakładkę `protection-overlay`.
  - Połączenie: nakładka skasowana (poprawka UUID odpada razem z nią), `except OdmowaDanychError` zachowany.
  - Wszystkie odmowy walidacji biegu źródłowego, także te dodane przez kartę, są teraz `OdmowaDanychError` — patrz §3.
- **`api/study_cases.py`, `application/study_case/service.py`**
  - Partia 6: `OdmowaDanychError` w `update_protection_config`.
  - Karta: kasuje `ProtectionConfig`, zapis konfiguracji przypadku i trasy.
  - Połączenie: kasacja; nieużywany import `OdmowaDanychError` usunięty.
  - Sens zmiany partii 6 przejmuje pisarz nastaw w modelu: `enm/nastawy_zabezpieczen.py`, odmowy `relay.settings_invalid`.
- **`domain/protection_device.py`**
  - Partia 6: `OdmowaDanychError` w `ProtectionCurveSettings`.
  - Karta: kasuje ten model urządzenia.
  - Połączenie: kasacja. Zakresy nastaw sprawdza teraz `rozwiaz_nastawy` jako nazwane pozycje gotowości.
- **`application/protection_analysis/engine.py`** (usunięty w karcie, zmieniony w partii 6)
  - Partia 6: `OdmowaDanychError` przy braku krzywej producenta.
  - Połączenie: kasacja, razem z rejestrem krzywych producentów (`domain/protection_vendors.py`) usuniętym w karcie.
- **`application/analyses/protection/czas_wylaczenia_galezi.py`**
  - Partia 6: granica `odmowa_rdzenia_b01()` wokół `compute_curve_trip_time` w `czas_z_nastawy`.
  - Karta: przenosi liczenie czasu do `ocena_nadpradowa.czas_stopnia`.
  - Połączenie: plik w wersji karty. Granica B-01 przeniesiona do `ocena_nadpradowa.czas_stopnia`, na oba wywołania rdzenia (`compute_curve_trip_time`, `compute_ieee_c37112_generic`), po jednej instrukcji w bloku zgodnie z `polykanie_wyjatkow_guard`.
- **`application/protection_settings/zacisk_zabezpieczenia.py`**
  - Partia 6: `szyna_zwarcia_miejsca` przez `enm.tor_pola.szyna_raportowa` — prąd zwarciowy przy zacisku pola to wiersz szyny pola; pole `szyna_zwarcia_ref`.
  - Karta: kasuje sekcję miejsca urządzenia koordynacji (`coordination_device:*`).
  - Połączenie: kasacja sekcji. **Sens partii 6 przeniesiony do nowej ścieżki** (§4): punkt zwarcia na zacisku pola za wyłącznikiem w `ocena_nadpradowa.punkty_zwarcia_strefy` przez tę samą `szyna_raportowa`.
- **`enm/domain_operations_v2.py`**
  - Partia 6: import `tor_pola.szyny_stacji`, predykat `transformatory_sciezki_zasilania`.
  - Karta: import `wylaczniki_liniowe`, kasacja lokalnego IDMT (`_compute_tcc_point`) razem z `validate_selectivity`.
  - Połączenie: oba importy; IDMT skasowany.
- **`backend/scripts/eksport_fixtur_harnessu.py`**
  - Partia 6: importy `zapis_fikstur`, sceny zajętości pól, lokalizacje koordynacji przez `szyny_stacji`.
  - Karta: nowy budowniczy sceny koordynacji (G08), kasacja sceny `miejsca` i `galezie`.
  - Połączenie: oba zestawy importów.
  - Wybór odcinka S02 → S03 w scenie E-28 przepisany na `szyny_stacji`. Po POLA-W-TORZE odcinek łączy zaciski pól, więc dopasowanie po nazwie szyny głównej padało (`StopIteration`).
  - Nieużywana trzecia wartość zwracana usunięta.
- **`tests/application/test_zacisk_zabezpieczenia.py`**
  - Pin przeliczony pomiarem: GN_05 ma rozstrzygnięty tylko odcinek `segment_L_SL` (`do`).
  - `segment_L_SR` ma po POLA-W-TORZE zabezpieczenie w szeregu z OBOMA zaciskami: wyłącznik liniowy i wyłącznik pola WE. Wynik to odmowa `KOD_WYBOR_ZACISKU`, a nie rozstrzygnięcie; komentarz w pinie.
- **`scripts/sc_authority_guard.py`, `test_sc_authority_guard.py`**
  - Partia 6: kontrola źródła modułu (import i wywołanie).
  - Karta: lista `PLIKI_Z_MOSTEM_BIEGU` na `coordination/z_biegow.py`.
  - Połączenie: obie zmiany; drzewo wzorcowe samotestu partii 6 przepięte na `z_biegow.py`.
- **`scripts/test_solver_input_substitute_guard.py`** — piny, patrz §5.
- **`docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`**
  - Wygenerowany `scripts/generuj_slownik_kodow_gotowosci.py`: 144 kody.
  - Rachunek: baza 143, partia 6 +2 (`station.element_bypasses_field`, `station.line_field_multiple_segments`), karta −1.
- **Frontend**
  - `ProtectionCoordinationPage.test.tsx` w wersji karty.
  - `miejsceUrzadzenia.ts`, `pradyZBiegow.ts` i ich testy, `ProtectionSettingsEditor.test.tsx` skasowane (partia 6 dodała w nich `szyna_zwarcia_ref`; sens w §4).
- **Fikstury harnessu w konflikcie** — wzięte z karty i przegenerowane generatorem (§6).

## 3. Inwentarz klasy — odmowy danych w kodzie karty

Przejrzane zostały wszystkie `raise` dodane przez kartę w `backend/src`:

| Miejsce | Rozstrzygnięcie |
|---|---|
| `enm/canonical_analysis.py` — rodzaj zwarcia biegu źródłowego ≠ 3F/2F | **odmowa danych → `OdmowaDanychError`** (był `ValueError`: trasa tworzenia biegu z `except OdmowaDanychError` dawała 500) |
| `enm/canonical_analysis.py` — sieć biegu źródłowego ≠ model | **odmowa danych → `OdmowaDanychError`** (jak wyżej) |
| `canonical_analysis.py` — bieg źródłowy zniknął przy wykonaniu, brak wyniku zapisanego biegu | `ValueError` w ścieżce wykonania biegu: zgodnie z `ODMOWY_OBLICZENIA_BIEGU` daje FAILED z komunikatem (świadoma decyzja karty 422) |
| `coordination/z_biegow.py` — `OdmowaKoordynacji` | nazwana odmowa modułu → **podklasa `OdmowaDanychError`** (reguła karty 422: nazwane odmowy modułów dziedziczą po niej); trasa nadal daje 422 z kodem |
| `prad_zwarciowy_galezi.py` — kierunek wkładu spoza słownika | błąd programu (kontrakt wyniku rdzenia) → **asercja** |
| `catalog/zakresy.py` — jednostka zakresu nieustalona | naruszenie warunku wstępnego wołającego → **asercja** |
| `catalog/catalog_store.py` — pozycja katalogu bez podstawy jednostki | defekt pliku katalogu PRODUKTU (`devices_v0.json`), nie dane projektanta → **asercja** |
| `ocena_nadpradowa.py` — wywołania rdzenia IEC 60255 | granica `odmowa_rdzenia_b01()` |

Dowody:
- Nowy test API `test_bieg_oceny_na_zwarciu_doziemnym_odmowiony_jako_odmowa_danych[SC_1F, SC_2F_G]` daje 400 z komunikatem.
- Iniekcja (powrót do `ValueError`) daje czerwień obu parametrów.
- Test „innej sieci” przypięty do typu `OdmowaDanychError`.
- `polykanie_wyjatkow_guard`: pin `raise ValueError` w `application/**` 82 → 81. Porównanie per plik z bazą: −1 w przepisanym `coordination/analyzer.py`; trzy nowe `raise` karty są asercjami.

## 4. Inwentarz klasy — szyny stacji, zacisk, strefa, gałąź pola

| Miejsce karty | Jak wyznacza | Rozstrzygnięcie |
|---|---|---|
| `ocena_nadpradowa.strefa_urzadzenia` | graf biegu SC: składowa po usunięciu wyłącznika, klaster zacisku po zamkniętych łącznikach — ta sama fizyka co `tor_pola.wezel_elektryczny` (zamknięte łączniki scalają węzeł) | zostaje (graf biegu jest źródłem prawdy rozpływu) |
| **punkty oceny strefy** | karta: tylko wiersze biegu SC w strefie — zacisk pola (szyna pomocnicza, nie cel zwarcia) **wypadał z oceny**; sonda na G08 z zabezpieczeniem pola WY S01 dała jedyny punkt „Stacja S02”, bez zwarcia za przekładnikiem | **naprawione**: `punkty_zwarcia_strefy` dokłada zacisk pola za wyłącznikiem z wierszem szyny pola po stronie zasilania przez `enm.tor_pola.szyna_raportowa` (jedno źródło z pakietem nastaw `batch_run._graf_punktu_zwarcia`); zacisk pomocniczy raportowany pod szyną TEJ strefy nie jest drugim punktem; w bilansie `punkt_wyniku_ref` |
| znaczniki TCC koordynacji (`analyzer._znaczniki`) | wiersze biegu filtrowane po punktach ocen | **naprawione**: czytają `punkt_wyniku_ref` oceny — ten sam punkt wyniku co ocena |
| `wylaczniki_liniowe.pole_aparatu` | wyposażenie pola `equipment_refs` | **test klasy**: każdy aparat w torze pola (szyna pola ↔ zacisk, `zajetosc_pol.zacisk_pola`) na sieciach 2 i 3 stacji to `W_POLU` i nie trafia na listę wyłączników liniowych |
| `czas_wylaczenia_galezi.znajdz_aparat_chroniacy` | przejście grafu | bez szyn stacji — zostaje |
| `czas_wylaczenia_pola` | `collect_bays` + `analyses/aparaty_pol.py` | istniejące jedno źródło — zostaje |
| `protection_read_model` | `equipment_refs` + `punkt_przylaczenia_pola` (partia 6) | obie zmiany obecne po automatycznym scaleniu, sprawdzone |
| budowniczy G08 `zabezpieczenia_magistrali.py` | szyna nN stacji po przyrostku `/nn_bus` | **naprawione**: szyna główna stacji (`bus_refs`) na poziomie nN; model identyczny (hash `b83e7c82…` przed i po) |
| `builders.build_gn05_sn_nn_oze_ochrona` | odcinek zasilający po przyrostku `_L` | **naprawione**: pierwszy odcinek korytarza; model identyczny (snapshot_hash `c9b8fcf1…`) |
| eksport sceny E-28 | nazwa szyny głównej | **naprawione**: `szyny_stacji` (§2) |
| front karty | brak własnego wyznaczania przynależności szyn (grep `bus_refs/sn_bus/nn_bus/station_ref` w dodanych liniach) | nic do przepięcia na `szynyStacji.ts` |

Testy (iloczyn cech) — nowy plik `tests/application/analyses/protection/test_ocena_zacisk_pola.py`:
- Cechy: kotwica {pole z zaciskiem, wyłącznik liniowy} × punkt {zacisk za wyłącznikiem, szyna strefy, zacisk pomocniczy w strefie} × scenariusz {MAX, MIN} × konsument {bieg `protection_sn`, znaczniki TCC koordynacji}.
- Wyrocznia: bilans klastra dokładnie (rel 1e-12), I_Q ≈ Ik'' szyny pola (rel 1e-4 — prądy pojemnościowe kabli strefy) oraz czas ze wzoru IEC 60255-151.
- Iniekcje: wyłączenie punktu zacisku daje 4 z 5 czerwonych; wyłączenie mapowania znacznika daje 1 czerwony.

Testy — `test_pola_w_torze.py`:
- Test partii 6 dla skasowanego `opis_miejsca_urzadzenia` przepisany na `punkty_zwarcia_strefy`, parametryzowany po polu WY i WE.

## 5. Piny strażników (pomiar na drzewie karty, komentarz atrybucji w miejscu pinu)

| Pin | Wartość |
|---|---|
| `solver_input_substitute_guard` — pola kontraktów | 4116 (partia 6) + 1 (karta) + 1 (`punkt_wyniku_ref`) = **4118** |
| — pliki skanowane | 561 + 2 = **563** |
| — `network_model` | 183, wykluczenia 1/2 |
| — `enm` | **60**, dług 7/67 |
| — `application` | 245, dług 29/89 |
| `polykanie_wyjatkow_guard` — `PIN_RAISE_VALUEERROR_APLIKACJA` | **82 → 81** |
| `tsconfig_gate_guard` — `BUDZET_BLEDOW_POZA_BRAMKA` | **80 → 69** (baza partii 6 miała 81 > 80 — czerwień zastana, listy błędów bazy i karty identyczne linia po linii; zdjętych 12 zastanych TS6133 w testach) |
| `werdykt_wyjasnialny` (allowlista), `protection_no_heuristics` (13 plików), `protection_fuse_band`, `sc_authority`, `dynamika_granica_importow`, `backend_no_physics`, `readiness_dictionary` (144) | zielone bez zmiany pinów po scaleniu |
| mypy (zapadka) | 223 / 34 — bez zmian |

## 6. Fikstury (wyłącznie generatory repo)

Uruchomione generatory, wszystkie z rc=0:
- `eksport_fixtur_harnessu.py`, `eksport_fixtur_projekcji_nn.py`, `emit_sld_network_fixture.py`, `gen_field_configurations_catalog.py`, `generuj_snapshot_openapi.py`, `generuj_rejestr_sieci.py`;
- `tests.reference_networks.{sld_substrate_fixtures,fikstury_enm_sld,station_archetype_substrate,szyny_stacji_parytet} --write`;
- `tests.ci.generuj_odpowiedzi_v126`, `tests/uczciwosc/generuj_fixtury_ocen_fe.py`;
- `tests/golden/parytet_{assemblera,p11,scenariuszy}/regeneruj.py`;
- `demo-siec-pokazowa/generate-fixture.py`, `generate-demo-oze-sc.py`;
- snapshot rejestru gotowości wg przepisu z nagłówka testu.

Determinizm: `eksport_fixtur_harnessu.py --sprawdz` po zapisie daje rc=0.

Klasyfikacja zmian (liść po liściu) względem partii 6 (`615f3b24`) i względem karty (`1551dc49`):
- **Treść**
  - Sceny koordynacji E-28: nowa sieć karty (G08 z czterema stacjami) liczona na topologii POLA-W-TORZE i modelu ścieżki odczytu produktu. Względem wersji karty zmieniają się prądy, bo kable leżą na zaciskach pól i odbiory są katalogowe.
  - `koordynacja_scena_ocena`: +7 liści `punkt_wyniku_ref`; liczba ocen bez zmian (7), bo scena ma tylko wyłączniki liniowe.
  - Pozostałe sceny w konflikcie (`porownanie_*_zabezpieczen`, `lom_scena_migawka`) — treść karty na topologii partii 6.
  - `szynyStacjiParytet.json` — dwie stacje sieci złotej G08 zarejestrowanej przez kartę.
  - `readiness_registry_snapshot.json` — 144 kody.
  - `gpzProtectionDataPath.enm.json` — tylko `hash_sha256`: nowe pole modelu `threshold_unit` w nastawach.
- **Szum / odcisk**
  - `catalog_fingerprint`/`semantic_fingerprint` w 13 fiksturach, jak w karcie.
- **Złote parytety P11 i assemblera** — zmiana wymagająca dowodu semantycznego per sieć:
  - `G08/00` to nowa sieć karty („Magistrala SN z zabezpieczeniami nadprądowymi”), dotąd nieobecna.
  - `G08/01` to GN_05 przesunięty z pozycji 00. Karta dokłada w GN_05 wyłącznik liniowy, przekładnik i przekaźnik.
  - Dowód na starym i nowym budowniczym GN_05:
    - Ik'' 3F w 8 wspólnych punktach różni się względnie o ≤ 1,4·10⁻⁹;
    - napięcia rozpływu w 13 wspólnych węzłach różnią się o ≤ 7,1·10⁻⁸ kV;
    - nowe są wyłącznie 2 węzły łącznika (szyny pomocnicze, bez punktu zwarcia) i 1 przypisanie zabezpieczenia.

## 7. Czerwień zastana na partii 6 naprawiona przy okazji (czerwona na worktree `615f3b24`)

| Obszar | Przyczyna i naprawa |
|---|---|
| `enm/validator.py:100` | lokalny predykat nazwy → `nazwa_nadana` |
| `nn_field_specs_promocja.py` | zastępczy kod `catalog.assign_failed` spoza `READINESS_CODES` → kod odmowy operacji; test aparatu (8 przypadków) wołał funkcje skasowane w SLD-SUBSTRAT → przepisany na obecny mechanizm z tą samą intencją |
| `tsconfig_gate_guard` | 81 > 80 → 69 (§5) |
| `test_protection_settings_w3c2_identity` (6) | wyłącznie płytki klon (brak `a16f8d2b`); `git fetch --unshallow` → zielony, kod bez zmian |
| e2e `tr2w-bez-pola` (3) | od POLA-W-TORZE operacja domyka pole TR; stan „transformator bez pola TR” istnieje tylko w danych zastanych → spec odtwarza projekt zastany produkcyjną drogą: eksport archiwum → model sprzed karty → import (`verify_integrity=false`, jawny parametr trasy — odciski archiwum opisują model przed zmianą); intencja i asercje bez zmian |

Czerwień e2e z karty:
- **flow-ekspert porównanie** — kolumna „Zabezpieczenie” nazywa urządzenie, a nie wyłącznik; spec czyta nazwę po `device_id_a`.
- **kd6** — nastawa bez jednostki progu jest odmową (PZ-09); spec podaje `A_PIERWOTNY`.

## 8. Czego nie zrobiono i dlaczego

- **Werdykt wizualny (B-02) — u właściciela.**
  - Specy zrzutowe z biegu e2e nadpisały 56 plików PNG w `docs/audit/visual/**`. Weszły do commitu `c04bafce` bez wzmianki w jego komunikacie.
  - Są to rendery żywej aplikacji po zmianie, w tym `cv33b2-porownanie-zabezpieczen-{dark,light}`. Nie oceniałem ich jakości wizualnej.
  - Jeśli integrator nie chce ich w partii, może je odrzucić przy przeniesieniu: zmiana kodu w `c04bafce` dotyczy tylko trzech plików `e2e/*.spec.ts`.
- **Bazowe czerwone testy vitest bez zmian** (naprawiają je równoległe karty): `menuBudowyNaKanwie.test.tsx` (2), `pathInvariants.test.ts` (1). Testy budżetu czasu `buildScene.p1Recenzja:271` i `buildScene.schemat10s7p6:207` w tym biegu przeszły.
- **e2e: nie uruchamiałem ponownie wszystkich 23 specyfikacji po `df8ac6dd6`.**
  - `df8ac6dd6` zmienia front wyłącznie w testach jednostkowych (usunięte importy) i backend w miejscach pokrytych pełną regresją.
  - Ponownie biegły tylko 3 specyfikacje naprawiane w `c04bafce`.
- **Rdzeń IEC 60255 (`protection_iec60255.py`, B-01) nietknięty**, kontrakty FROZEN nietknięte.
