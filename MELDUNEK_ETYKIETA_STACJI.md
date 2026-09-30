# Meldunek — karta ETYKIETA-STACJI-PRZELOTOWEJ (V12K-034): jeden rodzaj stacji w całym produkcie

Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-karta-etykieta-stacji`. Start: `615f3b24`.
Commity kodu: `4d9560a8` (część 1), `97b9e054` (część 2), `741608e1` (część 3), `8836a48c` (część 4).
Ten meldunek jest w osobnym commicie.

## 1. Wynik i dowód

Rodzaj stacji (końcowa / przelotowa / odgałęźna / sekcyjna) jest liczony w produkcie **jedną
regułą**. Źródło to backend `backend/src/enm/rodzaj_stacji.py`, warstwa odczytu modelu, nie DOMAIN.
Czyta pola z tych samych źródeł co `enm/zajetosc_pol.py` i `enm/tor_pola.py`, a przynależność
szyn do stacji bierze z `tor_pola.szyny_stacji`. Front ma **jedno lustro**
`frontend/src/ui/shared/rodzajStacji.ts`, przypięte testem parytetu.

Konsumenci czytają tę regułę albo zostali skasowani:
- schemat L0 (sylwetka) oraz L1/L2 (podpis);
- drzewo panelu „Schemat”;
- karta stacji i karta rozdzielnicy nN;
- wyszukiwarka i przegląd masowy (tożsamość publiczna);
- inspektor legacy i inspektor ui2;
- karta techniczna i szuflada SLD;
- konfigurator stacji, panel procesu, powierzchnie DER;
- kreator stacji (podgląd rodzaju wynikowego) i kreator szablonu.

`classifyTopologicalType` z cichym domysłem jest skasowany. Skasowane są też
`stationTypeLabels.ts`, `classifyStationTypeTopology`/`classifyStationTopology`,
`presentedStationTopologicalType` wraz z torem `terminalInRun`, notatki STOP
`station.type.mismatch`/`station.type.terminal`, martwy `miniSldStationPreview.ts`, martwe
`EmbeddingRoleV1`/`validateStationBlock` oraz osierocony katalog
`network_model/catalog/station_templates.py` z własnym `topological_type`.

Niezgodność deklaracji `station_type` z topologią zgłasza walidator jako **W043**
(`station.kind_mismatch`, ostrzeżenie). Komunikat zawiera nazwę stacji, oba rodzaje i przyczynę,
bez identyfikatorów i kodów. Akcja naprawcza „Napraw…” otwiera edycję parametrów z deklaracją
ustawioną na rodzaj z topologii. Pole SN o roli spoza słownika zgłasza **W044**
(`station.field_role_unknown`).

Dowód na żywej aplikacji i realnym backendzie, wyłącznie klikami natywnymi, daje spec
`e2e/etykieta-stacji-rodzaj.spec.ts`:
- W043 pojawia się dokładnie przy dwóch niezgodnych stacjach i zawiera nazwę, oba rodzaje
  i liczbę pól;
- drzewo pokazuje rodzaje z topologii;
- na rysunku jedyny podpis rodzaju przy stacji z polem ODG to „stacja odgałęźna”;
- „Napraw…” otwiera kreator z elementem podpisanym nazwą i wartością `branch`;
- zapis zdejmuje W043, a drzewo dalej pokazuje „stacja odgałęźna”.

Spec jest zielony (`rc=0`).

**Reguła** (SLD_CAD_SPEC_V3 §19.3 oraz recenzja NO-GO właściciela z 2026-07-17, pkt 7):
- R1: pole sprzęgła daje stację sekcyjną;
- R2: co najmniej 3 pola liniowe dają stację odgałęźną;
- R3: dokładnie 2 pola liniowe dają stację przelotową, gdy oba wyprowadzenia prowadzą do innej
  stacji; w przeciwnym razie stację końcową;
- R4: 0–1 pól liniowych daje stację końcową;
- reguła nie dotyczy GPZ ani rozdzielnicy nN.

Przyczyna rodzaju jest podawana słowami projektanta, np. „rozdzielnica SN ma 3 pola liniowe”.
Podpis „stacja odgałęźna” pojawia się wyłącznie przy ≥ 3 polach liniowych. Przypinają to test
konsumentów oraz sonda `accept:sld-v3` (c).

## 2. Pomiar sytuacji (a)–(c) na scenie kadru

- **(a) zachodzi.** Na zrzucie „przed” (`615f3b24`, realny backend) wszystkie trzy stacje są
  zadeklarowane jako przelotowe. „Stacja Klonowa” ma pola WE, WY, ODG i TR, czyli 3 pola liniowe.
  Rysunek podpisuje ją „stacja odgałęźna”, a drzewo projektu „stacja przelotowa”
  (`docs/audit/visual/etykieta-stacji/rodzaj_stacji_przed_drzewo_light.txt`). Ten sam układ mają
  fikstury B-2, seedy KD-11 i szablon RMU 5-pól: „Stacja SN/nN 1250 kVA” ma 4 pola liniowe,
  a była deklarowana jako przelotowa.
- **(b) zachodzi, naprawione u źródła:**
  - `insert_station_on_segment_sn` zamieniał nieznaną rolę pola (PV_SN, OZE, dowolny tekst) na
    FEEDER, czyli pole odgałęźne, a `append_station_on_endpoint` taką rolę cicho pomijał. Teraz
    obie operacje jawnie odmawiają: `station.insert.field_role_invalid` /
    `station.append.field_role_invalid`.
  - Pola potrzeb własnych i rezerwowe z katalogu rozdzielnic (10 rodzin) miały rolę modelu
    FEEDER i liczyły się jako liniowe. Operacja katalogowa zapisuje teraz rodzaj pola
    (`bay_kind`), a reguła traktuje je jako „inne”.
  - Iloczyn {rola} × {0–4 pola liniowe} jest przypięty w `test_rodzaj_stacji.py`.
- **(c) zachodzi w postaci nazwy z kodem rodzaju:**
  - domyślna nazwa „Stacja S01 (typ inline)” to teraz „Stacja S01”;
  - nazwy fikstur „Stacja S0x (typ B)” to teraz „Stacja S0x” (generator fikstur i eksporter
    harnessu, regeneracja narzędziami repo).

## 3. Inwentarz klasy (37 miejsc, eksplorator na `615f3b24`) i decyzje

Oznaczenia: Z = decyzja z deklaracji, T = z pól lub portów, M = martwe.

| # | Miejsce (na `615f3b24`) | Było | Decyzja |
|---|---|---|---|
| 1 | `ui/sld/v3/compose/directions.ts:219` `classifyStationTopologicalType` | T, własna reguła | skasowane; rysunek czyta lustro |
| 2 | `ui/sld/v3/scene/buildScene.ts:1039` `presentedStationTopologicalType` | T + „ostatnia w ciągu ⇒ końcowa” | skasowane; R3 z połączeń zastępuje prezentację |
| 3 | `buildScene.ts:1139,6123` `stationTypeTopologyMismatches` (stopNotes z ID) | Z wobec T | skasowane; niezgodność zgłasza W043; w akceptacji sondy `stationTypeLabelGaps`/`stationTypeLabels` |
| 4 | `ui/sld/v2/canvas/enmToSldAdapter.ts:4858` `classifyTopologicalType` (domysł → końcowa) | Z | skasowane; `stationTopologicalType` czyta lustro i rzuca wyjątek przy braku rodzaju |
| 5 | `MiniBlockFootprints.ts:157` `deriveFootprintType` | Z + własne liczenie | przyjmuje rodzaj z lustra; deklaracja tylko dla funkcji (customer, switching) |
| 6 | `enmToSldAdapter.ts:2222` `branch → 'branch_pole'` | Z | usunięte (stacja odgałęźna pomylona ze słupem) |
| 7 | `enmToSldAdapter.ts:3262` `FIELD_STATION_KINDS` | Z (które stacje rysować) | bez zmian — to wybór klasy obiektu, nie rodzaju |
| 8 | `ui/sld/v2/domain/HierarchyTree.ts:296` | T z portów | lustro; `topologicalType` dopuszcza null |
| 9 | `ui/sld/v2/core/ports.ts:227` `classifyStationTopology` | M | skasowane z testami |
| 10 | `StationOnRunRenderer.tsx` | `topologicalType` z adaptera | bez zmian (dostaje rodzaj z lustra przez #4) |
| 11 | `StationConfiguratorSurface.tsx:326` | Z (domysł → przelotowa) | lustro; karta pokazuje „Rodzaj stacji” z przyczyną; brak stacji → „nieustalony” |
| 12–14 | `ui/shared/stationTypeLabels.ts` (pełny, skrót, układ rozdzielni) | Z | plik skasowany; słownik PL i podpisy w lustrze (`podpisStacjiPl`, `skrotRodzajuStacjiPl`, `ukladRozdzielnicyStacjiPl`) |
| 15 | `DerSurfaces.tsx:144` („rozgałęźna”) | Z | tożsamość publiczna z lustra |
| 16 | `SchematContextPanel.tsx:951` `formatStationType` | Z, podciąg | `podpisStacjiPl` z lustra |
| 17 | `SchematContextPanel.tsx:963` `formatStationTreeLabel` | nazwa | bez zmian — nazwa, nie rodzaj |
| 18 | `ui2/nav/adapters/topologyTreeAdapter.ts` | nazwa | bez zmian — rodzaju nie pokazuje |
| 19 | `ui2/adapters/inspectorAdapter.ts:331` | Z (nieznane → surowy kod) | wiersze „Rodzaj stacji” z lustra, „Podstawa rodzaju” (przyczyna), „Funkcja stacji” (deklaracja funkcji) |
| 20 | `ui2/kreatory/stacja/stacjaModel.ts:327` `normalizujTypStacji` | wejście kreatora | zostaje jako wartość wejściowa formularza; podgląd „rodzaj wynikowy” z reguły na składzie pól (`rodzajStacjiZKreatora`), ostrzeżenie przy niezgodności |
| 21 | `stacjaSzablony.ts` `typStacjiZSzablonu` | deklaracja szablonu z backendu | bez zmian — deklaracja szablonu liczona teraz regułą (#30) |
| 22 | `InsertStationFormHelpers.ts` (rodzaj → domyślne pola) | kierunek odwrotny | bez zmian — to domyślny skład pól dla wybranej deklaracji, nie wyprowadzenie rodzaju |
| 23 | `StationTemplateWizard.tsx:759` surowe „Typ: inline” | Z | „Rodzaj po wstawieniu w odcinek: …” (PL, z reguły) |
| 24 | `StationBatchPlanner.tsx:64` rodzaj z numeru wiersza | fabrykacja | usunięte; kolumna pokazuje funkcję z kategorii |
| 25 | `miniSldStationPreview.ts` | M | skasowane z testem |
| 26 | `ui/topology/editorPalette.ts` `STACJA_*` | M | skasowane (został tylko typ `CreatorTool`) |
| 27 | `station-rozdzielnia/contract.ts`, `archetypes.ts` (T1–T4) | harness | bez zmian — archetypy galerii harnessu, nie ścieżka produktu |
| 28 | `sld/core/topologyInputReader.ts` `enmStationKind` | Z (klasa DISTRIBUTION) | bez zmian — nie rozróżnia rodzaju |
| 29 | `sld/core/fieldDeviceContracts.ts` `EmbeddingRoleV1` | M | skasowane |
| 30 | `application/station_templates/apply.py` `_resolve_station_type` (z kategorii) | kategoria | reguła na składzie pól szablonu (`rodzaj_ze_skladu_pol`) |
| 31 | `apply.py:942` `terminal` → zapis `mv_lv` | dwie drogi | obie operacje zapisują `terminal` (jedno źródło mapy) |
| 32 | `domain_operations.py` nazwa „Stacja S01 (typ inline)” | kod w nazwie | „Stacja S01” |
| 33 | `network_model/catalog/station_templates.py` `topological_type` | druga deklaracja, M | skasowane (audyt N-D10 zaktualizowany; zdolność multi-voltage nN zostaje w planie H) |
| 34 | `eligibility_service.py:806` `== "mv_lv"` | Z | `TYPY_STACJI_SN_NN` — stacje wstawione w odcinek nie dostają fałszywej blokady FLNN |
| 35 | `reference_engine/compliance.py:405` ∈ {mv_lv, customer} | Z | `TYPY_STACJI_SN_NN ∪ {customer}` — stacje wstawione w odcinek nie wypadają z kontroli OSD |
| 36 | `validator.py` E021 „Stacja przelotowa …” | treść | „Stacja …” (rodzaj nie z deklaracji); akcje `SubstationModal` (bez obsługi we froncie) → `NAVIGATE_TO_ELEMENT` |
| 37 | `reference_engine/registry.py:132` `== gpz` | Z | bez zmian — rozróżnia GPZ, nie rodzaj |

Miejsca dopisane w trakcie pracy, tej samej klasy:
- `meta.station_type_sn` i `meta.station_type_semantic` — kopie deklaracji, usunięte;
- `update_element_parameters` dopuszcza zmianę `station_type` wyłącznie między deklaracjami
  stacji SN/nN (akcja naprawcza W043); dla GPZ i rozdzielnicy nN odmawia z nazwanym kodem;
- lista gotowości ui2 wypisywała `Element: stn/…` zamiast nazwy — naprawione.

## 4. Dlaczego lustro, a nie pole z backendu

Wszyscy konsumenci we froncie pracują na migawce modelu (`useSnapshotStore`), a kilku z nich
(harness zrzutów, galerie, fikstury testów sceny) nie ma w ogóle odpowiedzi operacji ani widoków
logicznych. Pole z backendu wymagałoby drugiego kanału danych do każdego z nich albo
przechowywania wyniku w modelu, czyli cienia danej wyprowadzonej.

Lustro jest jedną funkcją, a parytet przypina test
`ui/shared/__tests__/rodzajStacji.parytet.test.ts`. Plik parytetu generuje backend
(`tests/reference_networks/rodzaj_stacji_parytet.py`). Obejmuje:
- 200 stacji z 38 fikstur;
- model iloczynu cech (P, O, S, K, N, A, C, L, W, R — role, bay_kind, sprzęgło, połączenia);
- 10 składów pól.

Świeżość pliku wobec generatora pilnuje test backendu, który sprawdza bajtową równość.
Wzorzec jest ten sam co `szynyStacji.ts` z `szyny_stacji_parytet.py`.

## 5. Zrzuty przed/po

Katalog: `mv-design-pro/docs/audit/visual/etykieta-stacji/`. Harness to spec
`e2e/etykieta-stacji-zrzuty.spec.ts`: „przed” uruchomiony na worktree `615f3b24`, „po” na tej
gałęzi, oba z realnym backendem i w obu motywach.
- **przed**: `rodzaj_stacji_przed_{schemat,drzewo,stacja}_{light,dark}.png` oraz
  `…_drzewo_*.txt`;
- **po**: `rodzaj_stacji_po_{schemat,drzewo,stacja,gotowosc}_{light,dark}.png` oraz
  `…_drzewo_*.txt`.

Zapis tekstowy drzewa:
- przed: Brzozowa, Lipowa i Klonowa — wszystkie „stacja przelotowa”;
- po: Brzozowa „stacja końcowa”, Lipowa „stacja przelotowa”, Klonowa „stacja odgałęźna”.

Kadr „stacja”: podpis przy „Stacja Klonowa” to „stacja odgałęźna” przed i po, a drzewo obok
zmienia się z „przelotowa” na „odgałęźna”. Kadr „gotowość” (po): dwa ostrzeżenia W043 w grupie
„Do przygotowania schematu (stacje i pola)”, z nazwą stacji i przyczyną.

**Werdykt wizualny należy do właściciela (bramka B-02); nie wystawiam go.**

## 6. Testy jako iloczyn cech

- `backend/tests/enm/test_rodzaj_stacji.py` — 83 przypadki (19 funkcji z parametryzacją):
  - reguła {pola liniowe 0–4} × {sprzęgło} × {połączone wyprowadzenia};
  - `kategoria_pola` {rola} × {bay_kind};
  - model iloczynu cech; niezależność od deklaracji i od kolejności gałęzi;
  - odmowa roli spoza słownika w obu operacjach budowy;
  - jednakowy zapis deklaracji „końcowa”; nazwa domyślna;
  - W043 {deklaracja zgodna / niezgodna / `mv_lv` / GPZ} i jej akcja naprawcza (zdejmuje
    ostrzeżenie); akcja W043 w odpowiedzi operacji niesie `modal_type` i `payload_hint`;
  - zmiana deklaracji tylko w obrębie SN/nN; W044 w modelu zastanym;
  - most gotowości i kanon kodów; pole potrzeb własnych z katalogu nie zmienia rodzaju;
  - deklaracja szablonu ze składu pól;
  - FLNN i zgodność OSD × każda deklaracja SN/nN;
  - świeżość pliku parytetu.
- `frontend/src/ui/shared/__tests__/rodzajStacji.konsumenci.test.tsx` — 24 przypadki. Iloczyn:
  {deklaracja: zgodna `branch`, niezgodna `inline`/`terminal`/`sectional`, brak rodzaju `mv_lv`,
  funkcja `customer`, wartość nieznana, brak pola} × {konsument: tożsamość publiczna (karta
  stacji, wyszukiwarka, przegląd masowy, inspektor legacy), karta techniczna, układ i opis
  rozdzielnicy (szuflada), inspektor ui2, `selectStationSummaries` (panel procesu), drzewo panelu
  „Schemat”, schemat L0 (sylwetka), L1 i L2 (podpis), konfigurator stacji}.
- `frontend/src/ui/shared/__tests__/rodzajStacji.parytet.test.ts` — parytet lustra z backendem
  (42 przypadki).
- `ui2/spaces/gotowosc/__tests__/grupowanieCelow.test.ts` — cel po kodzie kanonicznym:
  {kod kanoniczny obecny / brak} × {kod surowy / kanoniczny}.
- e2e na realnym backendzie: `etykieta-stacji-rodzaj.spec.ts` (walidator, drzewo, rysunek,
  naprawa W043) oraz `etykieta-stacji-zrzuty.spec.ts`.
- `scripts/sld_v3_acceptance.mjs`, sonda `station_type_topology_probe`:
  - (a) każdy podpis rodzaju na rysunku równy regule (53 podpisy, 0 luk);
  - (b) podmiana deklaracji każdej stacji nie zmienia żadnego podpisu;
  - (c) ≥ 3 pola liniowe dają „stacja odgałęźna”;
  - (d) determinizm.

**Iniekcje drugiej reguły.** Każda uruchomiona na osobnym worktree z HEAD i cofnięta
`git checkout`:

| Iniekcja | Wynik |
|---|---|
| I1 tożsamość publiczna czyta `station_type` | 1 czerwony (konsumenci) |
| I2 drzewo „Schemat” czyta `station_type` | 1 czerwony |
| I3 lustro: próg odgałęźnej 3 → 4 | 38 czerwonych (konsumenci i parytet) |
| I4 rysunek (adapter `stationTopologicalType`) czyta `station_type` | 1 czerwony |
| I5 inspektor ui2 czyta `station_type` | 1 czerwony |
| I6 backend: próg 3 → 4 | 10 czerwonych |
| I7 walidator milczy przy niezgodności | 4 czerwone |
| I8 gotowość operacji gubi `payload_hint` | 1 czerwony |

Uczciwie: pierwsza wersja I4 (odczyt pola, którego rekwizyty sceny nie niosą) była iniekcją
niewazną i nie zaczerwieniła niczego. Powtórzona u źródła rodzaju rysunku — czerwona.

## 7. Znaleziska uboczne naprawione w tej karcie

- **„Napraw…” w przestrzeni Gotowość było martwe dla każdej akcji OPEN_MODAL.**
  `ui2/AppRoot.tsx` tylko zaznaczał element i przełączał na schemat. Teraz woła wspólnego
  wykonawcę `executeFixActionSurface`, tego samego co pasek gotowości.
- **Gotowość z odpowiedzi operacji domenowej** (`_build_readiness`) przepisywała akcję walidatora
  do samego `panel` i gubiła `modal_type` oraz `payload_hint`, więc karta edycji otwierała się
  pusta. Teraz oba pola są przenoszone addytywnie.
- **Lista gotowości grupowała po surowym kodzie walidatora**, więc W043 i każdy odwzorowany kod
  bez kropki trafiały do „Pozostałe”. Teraz grupuje po `canonical_code`.
  `readiness_registry_snapshot.json` przegenerowany (143 → 147).
- Kreator edycji parametrów pokazywał identyfikator elementu; teraz nazwę.
- Dług zastany na starcie, naprawiony u źródła:
  - bramka typów testów była czerwona już na `615f3b24` (81 > 80); po usunięciu 17 TS6133
    wynosi 64, budżet obniżony z pomiarem;
  - lokalny predykat nazwy w `validator.py` (test `nazwy_jedno_zrodlo` czerwony na starcie);
  - test promocji nN wołał skasowaną `_materializuj_aparat` (czerwony na starcie) — przepisany
    na obecny mechanizm z zachowaniem intencji;
  - zastępczy kod `catalog.assign_failed` spoza rejestru usunięty (test rejestru czerwony na
    starcie);
  - liczniki dokumentu mini-bloku; nazwy kabli „K12/K23” w teście — naruszenie
    `no_codenames_guard`.

## 8. Regeneracja fikstur — semantyka

Fikstury przegenerowano wyłącznie narzędziami repo:
`sld_substrate_fixtures`, `fikstury_enm_sld`, `demo-siec-pokazowa`, `generate-demo-oze-sc`,
`emit_sld_network_fixture`, `eksport_fixtur_harnessu`, `eksport_fixtur_projekcji_nn`,
`szyny_stacji_parytet`, `rodzaj_stacji_parytet` oraz snapshot rejestru kodów.

Zmiany merytoryczne:
- deklaracja stacji końcowej to `terminal` zamiast `mv_lv`;
- deklaracje szablonów liczone ze składu pól (RMU 5-pól → `branch`);
- zniknęły `meta.station_type_sn` i `meta.station_type_semantic`;
- operacja katalogowa zapisuje `bay_kind`;
- nazwy bez kodu rodzaju.

Pozostałe różnice to hasze migawek, identyfikatory z ziaren i `proof_ref`. Ślady dynamiki
różnią się o ≤ 1e-9 pu i ≤ 3e-10°, czyli szumem ostatniej cyfry po zmianie ziaren; złote parytety
assemblera i scenariuszy przechodzą.

Odciski przeliczone świadomie, z atrybucją:
- `kosztSceny.test.ts`: sonda 2×2 kod × fikstura pokazała, że fikstura nie rusza żadnego odcisku,
  a zmienia je wyłącznie kod. Zmiany:
  - „Stacja L6-3” i „Stacja L7-4”, końce odcinka NOP, przechodzą z „końcowa” na „przelotowa”;
  - znika 12 notatek STOP rodzaju.
  Zmienionych jest 38 z 54 wpisów.
- `schemat10gs1`: 29/12/12 → 31/10/12, z tego samego powodu.
- N-1 gn01: różnią się wyłącznie `snapshot_hash` i `input_hash`, bo zniknął cień
  `meta.station_type_*`.

Piny `solver_input_substitute_guard` przeliczone pomiarem:
- pola kontraktów: 4116 → 4115 (+6 z `rodzaj_stacji.py`, −7 z usuniętego katalogu);
- pliki skanu: 561 bez zmiany netto (+1, −1).

## 9. Bramki (kody wyjścia łapane bezpośrednio)

- `npm run type-check`: **0**. `npm run lint`: **0** (na drzewie końcowym).
- Pełny vitest (`npm test`, `--no-file-parallelism`) po częściach 1–2: 13 020 passed,
  **3 failed** — wyłącznie znane spoza karty (`menuBudowyNaKanwie` ×2, `pathInvariants`).
  Oba znane budżety czasu przeszły w tym biegu. Po częściach 3–4 zielone są `src/ui2`
  (4503 passed) i `src/ui/shared`. Pełny bieg końcowy: patrz dopisek na końcu.
- `poetry run python ../scripts/guardy_z_ci.py` (z `backend/`): **rc=0**, wszystkie guardy
  zielone, łącznie z testami własnymi guardów, black i ruff jak w CI.
- `mypy_ratchet_guard`: 223/34 (próg 223/34), OK.
- Pełny backend `pytest -m "not pandapower and not andes"` na części 3 (część 4 to wyłącznie
  front): **27 117 passed, 0 failed, 6 errors**. Wszystkie 6 błędów pochodzą z
  `tests/test_protection_settings_w3c2_identity.py`, który robi `git show a16f8d2b:…`. Ten commit
  nie istnieje w płytkim klonie sesji (455 commitów). CI robi `fetch-depth: 0`. To artefakt
  środowiska, nie regresja; na drzewie startowym daje ten sam błąd.
- `npm run accept:sld-v3`: sonda rodzaju (a)–(d) PASS; jedyny FAIL to znany `menu_chain_probe`.
- e2e na realnym backendzie (`playwright-run-real.mjs`, 16 testów):
  - zielone: `kd11-tozsamosc-etykiet`, `sld-real-backend-flow`,
    `audit2-station-config-persistence`, `kreator-stacji-max`, `critical-run-flow`;
  - specy karty (`etykieta-stacji-rodzaj`, `etykieta-stacji-zrzuty` ×2) były czerwone w
    pierwszym biegu — z nich wyszły znaleziska z §7 — i po naprawie są zielone (3 passed,
    rc=0).

## 10. Czego nie zrobiono / co zostaje — z przyczyną

- **Rysunek pola o nierozpoznanej roli.** `stationFieldRoleFromSpec` w adapterze SLD rysuje je
  jak pole liniowe odgałęźne, choć reguła rodzaju go nie liczy, a walidator zgłasza W044.
  Rodzaj i podpis są poprawne, ale symbol pola jest domysłem. Decyzja rysunkowa: jaki symbol dla
  pola spoza słownika. Należy do bramki B-02 i wątku SLD, nie do tej karty.
- **Martwe `StationCard.tsx` i `NnSwitchgearCard.tsx`** (importowane tylko w testach) zostały,
  bo zmienia je równoległa karta SZYNY-STACJI-LUSTRO. Przepięte są na regułę w części rodzaju;
  kasacja po jej scaleniu.
- **Kreator stacji.** `normalizujTypStacji` (wartość nieznana → `branch`) i domyślna deklaracja
  `branch` to wartości wejściowe formularza, nie wyprowadzenie rodzaju. Podgląd pokazuje rodzaj
  wynikowy z reguły i ostrzega przy niezgodności. Zmiana domyślnej deklaracji to decyzja
  produktowa.
- **`freeBranchPorts`** w `networkBuildStore` liczy wolne porty bez zajętości pól (poza klasą
  rodzaju — zauważone, nie naprawione).
- **`networkHierarchyFromSnapshot`** ma ciche wartości domyślne (`mv_lv`, OUT), ale `line_runs`
  jest tam zawsze pusty, więc drzewo hierarchii ich nie używa.
- Ostrzeżenia bez odwzorowania kanonicznego (W061, Z₀ źródła, brak odbiorów) zostają w grupie
  „Pozostałe”; to uczciwy stan bez zgadywania celu.

**Dopisek — pełny vitest na drzewie końcowym (`8836a48c`):** 887 plików. 13 029 passed,
**3 failed**: wyłącznie znane spoza karty `menuBudowyNaKanwie` ×2 i `pathInvariants`. Znane budżety
czasu przeszły. Kod wyjścia `rc=1`, wynika wyłącznie z tych trzech.
