# KSR — audyt przekrojowy stacji, OZE i BESS w MV-DESIGN PRO

**Data:** 2026-10-11  
**Podstawa:** odczyt faktycznych plików repozytorium przy bazie `main@8f7ed3c27efa`; poprawka na gałęzi `audit/kzr-global-der-mix-20261011`.  
**Status:** audyt ukierunkowany, NIE certyfikacja pełnego repozytorium. Rzeczywiste działanie wymaga testów CI/E2E.  
**Zasada:** każdą cechę analizować jako ciąg: kreator -> wybór katalogu -> ENM -> operacje domenowe -> stan połączeń -> solwery -> EAZ -> SLD -> raport -> zapis/odczyt.

## 1. Potwierdzone moduły, których NIE należy przepisywać

| Obszar | Faktycznie istniejące źródło / kontrakt | Granica wiedzy |
| --- | --- | --- |
| Kanoniczny model | `backend/src/enm/models.py`: `Bus`, `Cable`, `Transformer`, `Generator`, `Port`, `ConnectionNode`, `Substation`, `Bay`, `GPZSection`, `NnSection`, `BayInterlockSet` | Istnienie klas nie dowodzi kompletności wszystkich tras |
| Zapis i operacje | `backend/src/enm/domain_operations.py`, `domain_operations_v2.py`, `enm/store.py` | Ocena zgodności w wybranych operacjach wymaga testów E2E |
| Stacje i szablony | `backend/src/application/station_templates/templates/__init__.py`: 73 szablony w 15 kategoriach, `apply.py` | Szablon nie jest równoważny fabrycznej konfiguracji |
| Pola i rodziny SN | `backend/src/network_model/catalog/switchgear/{families,factory_configuration,family_validation}.py`, `enm/pole_katalogowe.py` | `repo_verified` nie jest statusem potwierdzonej karty PDF konkretnego wykonania |
| Frontend stacji | `frontend/src/ui/network-build/station-configurator/StationConfigurator.tsx`, `station-der/AddDerWizard.tsx`, `station-templates/StationTemplateWizard.tsx` | Istnieje wiele ścieżek edycji; brak dowodu ich pełnej równoważności |
| SLD | `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx` i `.../scene/buildScene.ts`, istniejące v2 renderery | SLD jest projekcją ENM, nie osobnym solwerem |
| Solwery | `backend/src/network_model/solvers/`: rozpływy NR/GS/FD, zwarcia IEC 60909, wybrane analizy nN, dynamika i FRT | Wersje norm i kompletność pokrycia nie zostały obecnie uruchomione/zwalidowane |
| Dynamika BESS | `backend/src/network_model/solvers/dynamika/urzadzenia/magazyn.py`, `przeksztaltnik_gfl.py`, `przeksztaltnik_gfm.py` | Sam kod nie dowodzi zgodności w rzeczywistych warunkach FRT/sterowania |
| Zabezpieczenia | `backend/src/application/analyses/protection/`, `application/protection_settings/`, `network_model/solvers/equipment_checks/ct_burden_saturation.py` | Zależy od położenia CT/VT i wiązań z realnymi aparatami |
| Wyniki i gotowość | `backend/src/solver_input/{builder,eligibility}.py`, frontendowe karty gotowości i wyników | Wymagane przekrojowe reguły przy każdej zmianie danych |
| Zapisy konfiguracji | `backend/src/api/audit2_station_config.py` (ORM / projekt) oraz `api/switchgear_config.py` (pamięć procesu) | To dwie odmienne ścieżki przechowywania, wymagające decyzji o kanonie |

## 2. Udowodniony defekt P0 i poprawka w PR #478

**Źródła:** `backend/src/application/station_templates/templates/hybrydowe.py`, `application/station_templates/{schema,apply}.py`, `api/station_templates.py`, `frontend/src/ui/network-build/station-templates/StationTemplateWizard.tsx`.

Przed poprawką szablon hybrydowy deklarował `pv_count` i `bess_count`, ale przekazywał do schematu niezmienione definicje `DER_PV_SN`/`DER_BESS_SN`. Podgląd wyświetlał podział równy `total // liczba_technologii`, a tworzenie źródeł i szacowanie potrzebnej mocy transformatora przydzielały naprzemienne rodzaje źródeł. Powodowało to trzy niezgodne prawdy dla tego samego projektu.

**Wdrożono na gałęzi, nie scalono:** `rozstrzygnij_sklad_der` jako wspólny rozstrzygacz kolejności i liczebności, propagację liczebności w szablonach, poprawną sumę wymaganej mocy, podgląd API, edycję liczebności w kreatorze i kontrolę sumy przed mutacją ENM. Rozpoznane z samych opisów szablonów dwie rozbieżności BESS 2/3 MW poprawiono na odpowiednio 2 i 3 jednostki; nadal konieczne sprawdzenie mocy i wariantów TR. Dodano testy domenowe, HTTP i regresję rzeczywistych operacji ENM w `backend/tests/api/test_station_templates_apply_api.py`. Akceptacja wymaga wyniku CI.

## 3. Potwierdzony dług / potencjalne zagrożenia do osobnych działań

### P0 — dwa kontrakty konfiguracji rozdzielnic, z których jeden ma nietrwały zapis

`backend/src/api/main.py` włącza równocześnie `switchgear_config_router` i `audit2_station_config_router`. W `backend/src/api/switchgear_config.py:120` konfiguracja jest składowana w procesowej `_config_store: dict`, a GET/PUT odczytują tylko ten słownik. Natomiast `backend/src/api/audit2_station_config.py` używa ORM i repozytorium projektu. Ustal kanonicznego właściciela danych; zabroń zatwierdzania konfiguracji, która istnieje jedynie w pamięci procesu. Osobny test: PUT -> odczyt nowym procesem -> ENM -> SLD/solver; jeżeli API prototypowe jest nieużywane, usuń je z rejestracji routerów zamiast budować kolejny magazyn.

### P0 — fałszywa uniwersalność „wymaganego aparatu” w polu

`backend/src/domain/switchgear_config.py:399-449` wymaga wyłącznika `CB` dla WSZYSTKICH ról `LINE_IN/OUT/BRANCH` oraz wyłącznika, CT i RELAY dla pola `TRANSFORMER_SN_NN`. To nie jest reguła uniwersalna, ponieważ właściwe katalogowe realizacje mogą zawierać rozłącznik lub rozłącznik bezpiecznikowy. Dodatkowo `validate_switchgear_config` w okolicy linii 638 wymaga obecności transformatora w tym samym polu źródłowym PV/BESS; właściwy tor może przechodzić przez osobne pole i transformator blokowy. Należy przejść na reguły per `CompleteMvBayTemplate` + rzeczywisty graf toru prądowego; do czasu dowodu nie kwalifikować fałszywej „pełnej gotowości”.

### P0 — źródło zasilania GPZ: nieuzasadnione uziemienie i napięcie wtórne

`backend/src/application/station_templates/apply.py` w `_zastosuj_gpz_pod_blokada` przekazuje `grounding: {"type":"isolated"}` jako domyślny stan rzeczywistego GPZ. W `_zastosuj_szablon_pod_blokada` stosuje `nn_voltage_kv = transformer_voltages_kv(transformer_ref)[1] or 0.4`. Tego typu domniemane wartości nie mogą być dopuszczone jako zweryfikowane dane wejściowe do obliczeń zwarć doziemnych, oceny EAZ ani projektowania sieci. Wymagać rzeczywistych danych z parametrów sieci/transformatora, a przy ich braku nazwanego statusu danych niekompletnych.

### P1 — dopełnienie źródeł DER/PCC i torów transformatorowych

Kod `apply.py` tworzy źródła przez `add_converter_source`, a konfigurator ma osobne moduły PV/BESS/wiatru. Nie jest jednak dowiedzione dla wszystkich szablonów: (a) czy pola katalogowe mają pełny tor i głowice, (b) czy BESS i PV mają prawidłowe oddzielne transformatory blokowe i bilans `S_n`, (c) czy rzeczywisty punkt PCC oraz pomiar CT/VT są zgodne z dokumentacją, (d) czy różne poziomy SN/nN nie są łączone graficznie bez TR. Wymagana macierz E2E per PV, BESS, PV+BESS, wiatr i generator synchroniczny.

### P1 — edytowalność parametrów źródła

`frontend/src/ui/network-build/station-templates/StationTemplateWizard.tsx` dotąd deklarował „wszystko edytowalne”, lecz parametr mocy jednostkowej `der_{kind}_p_mw_each` jest przyjmowany przez backend, podczas gdy pokazana zakładka DER prezentuje głównie liczbę modułów i wybór referencji katalogowej. Dodać jawną edycję zgodną z tabliczką `P_n,S_n,U_n`, energią BESS MWh, `SOC`, funkcjami GFL/GFM, wielkościami granicznymi PCS, sposobem dołączenia do PCC, profilem sterowania i ograniczeniami sieci.

### P1 — katalogowe jednostki RMU i kompletność symboli

Wiążący `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` identyfikuje braki w zestawie `BayDeviceTemplate` dla rozłącznika i wskaźnika obecności napięcia VPIS oraz brak głowicy w kanonicznym szablonie transformatorowym. Rodziny i bloki fabryczne są już zintegrowane z `add_sn_bay_from_catalog`, ale inne ścieżki `_build_field_spec` i niektóre pola DER nie przechodzą tą samą drogą. Naprawa wymaga analizy wpływu na ENM, wszystkie SLD, walidacje i obliczenia, nie lokalnego dopisania ikon.

### P1 — status danych katalogowych

`network_model/catalog/switchgear/registry.py` przechowuje producentów jako `requires_catalog`; `switchgear/families.py` ma rodziny `repo_verified`. Są to różne poziomy potwierdzenia, a nie błąd do usunięcia przez bezwarunkowe ustawienie `verified`. Każdego pola, aparatu, wytrzymałości zwarciowej i blokady wymaga odniesienia do konkretnego dokumentu, jego wydania i wariantu; nie wyciągać konstrukcji z nazwy producenta.

## 4. Docelowy niezmiennik systemowy

`Wariant stacji -> szablon producenta -> kompletna aparatura i zaciski -> porty/połączenia ENM -> pełny tor SN–TR–nN/PCC -> graf solwera -> wielkości zwarciowe i EAZ -> geometria istniejącego SldCanvasV3 -> dokumentacja -> trwały zapis`.

Zmiana jednej pozycji katalogowej, aparatu, stanu sprzęgła, sposobu dołączenia DER, mocy BESS lub liczby transformatorów MUSI spowodować ponowną ocenę wszystkich zależnych wyników i poprawną invalidację obliczeń. Prezentacja nie może wyliczać fizyki; solwer nie może odczytywać symboli i wymyślać układu.

## 5. Macierz testów globalnych, do zrealizowania

| ID | Wejście / zmiana | Wymagany dowód |
| --- | --- | --- |
| KSR-G01 | Stacja końcowa, przelotowa, odgałęźna | Każdy kabel ma dwie rzeczywiste głowice i właściwe pola |
| KSR-G02 | ZPUE Rotoblok pole liniowe z rozłącznikiem | Brak fałszywego obowiązku wyłącznika |
| KSR-G03 | RMU blok fabryczny z trzema funkcjami | Nie da się wstawić czwartej jednostki bez oferty producenta |
| KSR-G04 | PV+BESS 4×0,5 MW + 1×1 MW | Podgląd = model ENM = dobór TR = raport = SLD |
| KSR-G05 | Hybryda 10 PV + 3 BESS | Oddzielne tory, zgodne katalogi PCS/TR, suma mocy, wyniki i ograniczenia PCC |
| KSR-G06 | Zmiana udziału PV/BESS | Jawne wymuszenie spójnej sumy i ponowne przeliczenie doboru |
| KSR-G07 | Wyłączony jeden tor, możliwe zasilanie zwrotne BESS | Prawidłowe wyspy i blokada niedozwolonego uziemienia |
| KSR-G08 | Prąd zwarciowy źródła z brakiem parametrów | Brak pozytywnego doboru aparatu na domyśle `k_sc` |
| KSR-G09 | Trwały zapis konfiguracji stacji | Ponowne uruchomienie procesu nie gubi modelu |
| KSR-G10 | Przełączenie sprzęgła lub pola źródłowego | Inwalidacja wyników i ponowna analiza przepływu / zwarć / EAZ |
| KSR-G11 | Przekładniki CT/VT i EAZ | Punkt pomiarowy fizycznie pokrywa strefę zabezpieczenia |
| KSR-G12 | Generacja dokumentacji dla źródła PV/BESS | Jednoznaczna identyfikowalność urządzeń i parametrów |
| KSR-G13 | Wprowadzenie stacji 20 kV przy TR 15/0,4 kV | Jawna odmowa bez zgodnego TR |
| KSR-G14 | Stacja istniejąca z aparaturą historyczną | Rozdzielenie inwentaryzacji od kwalifikacji nowych dostaw |

## 6. Kolejność wykonania i granica akceptacji

1. **P0/PR #478:** spójność składu DER, moc TR, podgląd, ENM, API i UI — testy CI i regresja całej rodziny szablonów. Nie scalać przed wynikiem zielonym.
2. **P0:** usunąć rozbieżność magazynów danych konfiguracji stacji i wykazać trwały zapis powiązany z kanonicznym ENM.
3. **P0:** zastąpić twarde „CB w każdym polu” i „TR w polu PV/BESS” rzeczywistymi połączeniami z katalogowego szablonu, wraz z porównaniem zwarciowym/EAZ.
4. **P0:** zlikwidować ukryte domyślne parametry elektroenergetyczne istotne dla doborów i zabezpieczeń.
5. **P1:** pełne szablony producentów, obsługa terenowych stacji i końcówek kablowych; udokumentowane warianty dla ZPUE, Siemens, Schneider, ABB, Eaton itd.
6. **P1:** przeprowadzić wielotechnologiczną kwalifikację PCC, PV, BESS, GFL/GFM, FRT/HVRT, przypadków zwarciowych, zabezpieczeń i właściwego ograniczania mocy.
7. **P1:** połączyć katalog/SN/nN/EAZ z istniejącym SLD V3, widokiem pól i raportami; każda zmiana przez test E2E.
8. **P2:** poprawić ergonomię jednego konfiguratora, podgląd aparatów, weryfikację kompletności oraz raporty WHITE BOX.

**Nie zaliczać:** samego faktu istnienia plików, przechodzących testów jednostkowych albo poprawnego obrazka do dowodu prawidłowości całego projektu SN/nN. Zaakceptowanie wymaga rzeczywistej ścieżki ENM -> solwer -> wynik -> SLD -> zapis z bazą katalogową.
