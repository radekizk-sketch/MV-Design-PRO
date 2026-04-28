# MV-DESIGN-PRO V12.xx - Kanon systemu

Status: aktywny kanon kierunkowy V12.xx  
Tryb obowiazywania: dokument nadrzedny w katalogu `docs/v12xx/`  
Data zamrozenia kierunkowego: 2026-04-24  
Zakres: dokumentacja, ENM, API, baza danych, katalogi, SLD, UI/UX, wyniki, uzasadnienie inzynierskie, raporty, walidacje, testy i migracja

## 1. Zasada nadrzedna

MV-DESIGN-PRO V12.xx jest przemyslowym systemem klasy OSD dla projektanta sieci SN, projektanta zabezpieczen, inzyniera przylaczen OZE, inzyniera ruchu, audytora i operatora raportowego. System nie jest zbiorem formularzy ani dekoracyjnym schematem. SLD jest glownym srodowiskiem pracy, a ENM v2.0 jest jedynym zrodlem prawdy domenowej.

## 2. Governance kanonu

Aktywny kanon zyje wylacznie w katalogu `docs/v12xx/`. Ten plik jest jedynym plikiem nadrzednym. Pozostale pliki w katalogu `docs/v12xx/` sa rejestrami, macierzami i specyfikacjami pomocniczymi, ktore uszczegolawiaja wymagania tego dokumentu.

Pliki obowiazkowe:

- `REJESTR_DECYZJI.md`
- `REJESTR_KONFLIKTOW.md`
- `REJESTR_DLUGU.md`
- `MIGRACJA_ENM_V1_V2.md`
- `MACIERZ_INVALIDACJI.md`
- `MACIERZ_INTERAKCJI.md`
- `MACIERZ_TESTOW_V12_XX.md`
- `MACIERZ_UPRAWNIEN.md`
- `MACIERZ_KOMPATYBILNOSCI_API.md`
- `MACIERZ_RAPORTOWALNOSCI.md`
- `MACIERZ_ID_I_REFERENCJI.md`
- `MACIERZ_DRAFT_VS_COMMITTED.md`
- `SEMANTYCZNY_RDZEN_ELEKTROENERGETYCZNY_V8.md`

Katalog `docs/spec` jest archiwum i zrodlem luk historycznych. Nie wolno kopiowac tresci z archiwum do aktywnego kanonu bez wpisu w `REJESTR_KONFLIKTOW.md`.

## 3. Zasady niezmienne

- Schemat jednokreskowy jest osia systemu.
- ENM v2.0 jest jedynym zrodlem prawdy domenowej.
- Warstwa uzytkowa jest w 100% po polsku.
- Kazda liczba ma jednostke, pochodzenie i status jakosci.
- Kazdy istotny wynik ma uzasadnienie inzynierskie.
- Kazdy wynik ma przypisany przypadek obliczeniowy, wariant pracy i migawke stanow lacznikowych.
- Wyniki nie mutuja modelu.
- Obliczenia nie zmieniaja geometrii SLD.
- Draft formularza nie jest prawda domenowa.
- Raport nie czyta danych z draftu UI ani z lokalnych projekcji.
- Raport czyta wylacznie ENM, snapshot katalogowy, wynik frozen i uzasadnienie.
- UI, SLD, Inspektor, menu, wyniki i raporty nie moga interpretowac funkcji elementu lokalnie po nazwie, typie komponentu, geometrii, CSS ani etykiecie; semantyka pochodzi z `EngineeringSemanticModel` albo projekcji pochodnej wskazujacej `semanticHash`.
- Determinizm wynikow jest obowiazkowy.
- Dark SCADA jest motywem ekranowym, a eksport uzywa osobnego jasnego motywu technicznego `light_technical`.
- Severity i status walidacji maja jeden kontrakt wartosci publicznych: `BLOCKER`, `IMPORTANT`, `INFO`, `OK`, `WARN`, `FAIL`.
- Po zamknieciu V12.xx nie moze pozostac nieoznaczony dlug techniczny w zakresie V12.xx.

## 4. Byty pierwszej klasy

Bytami pierwszej klasy V12.xx sa:

- `EnergyNetworkModel v2.0`
- przypadek obliczeniowy
- wariant pracy
- migawka ENM
- migawka stanow lacznikowych
- snapshot katalogowy
- uruchomienie obliczen
- wynik frozen
- uzasadnienie inzynierskie
- rekord katalogowy
- profil operatora
- profil zrodla
- profil FRT/LVRT/HVRT
- profil Q(U)
- profil cos phi(P)
- automatyka prewencyjna, eliminacyjna i restytucyjna
- raport OSD
- decyzja kanonu
- wpis dlugu technicznego

## 5. ENM v2.0

ENM v2.0 rozszerza obecny model o:

- `operating_variants`
- `post_fault_states`
- `switching_state_snapshots`
- `zero_sequence_configs`
- profile operatora
- profile zrodel
- profile FRT/LVRT/HVRT
- profile Q(U)
- profile cos phi(P)
- profile obciazen
- rozroznienie FW PMSG, DFIG i SCIG
- byty automatyki i blokad laczeniowych
- jawne statusy jakosci danych
- jawne statusy gotowosci
- powiazania wynikow i uzasadnien z `ref_id`

Kazdy element domenowy ma `id`, `ref_id` i `name`. `ref_id` jest stabilne domenowo i nie zmienia sie przy edycji nazwy, parametrow ani po przeliczeniu wynikow.

## 5.1 Lifecycle API

Kazda aktywna trasa `/api` musi miec wpis w `MACIERZ_KOMPATYBILNOSCI_API.md`. Wpis musi zawierac metode, sciezke, wersje, status cyklu zycia, date wejscia, zakres kompatybilnosci, testy i wlasciciela. Status `adapter` albo `deprecated` musi miec jawna date wylaczenia. Endpoint bez wpisu lifecycle jest bledem kanonu i blokuje weryfikacje.

Straznik `api_lifecycle_guard.py` porownuje aktywne trasy zarejestrowane w `api.main` z macierza lifecycle. Guard jest uruchamiany przez `v12xx_canon_guard.py` i pelny `verify:v12.5.1`, dlatego nowa trasa `/api` bez statusu nie moze przejsc przez kanoniczna bramke V12.xx.

Projekcja ENM v2.0 materializuje profile zrodel i operatora dla PV, BESS oraz FW PMSG/DFIG/SCIG. Legacy `wind_inverter` jest dopuszczone tylko jako sygnal migracyjny typu `FW` i generuje ostrzezenie wymagajace decyzji technologicznej. Precyzyjne `FW_PMSG`, `FW_DFIG` i `FW_SCIG` wymagaja zgodnego profilu `generator_model`; niespojnosc jest blokada migracyjna.

Publiczny tor API nie moze przywrocic aktywnej prawdy legacy przez `OperatingCase`, `AnalysisRun`, `get_operating_case` ani `operating_case_id`. `legacy_public_path_guard.py` sprawdza routery zarejestrowane w `api.main` i jest czescia bramki kanonu oraz `verify:v12.5.1`.

Publiczny router `protection-engine/v1` jest usuniety z `api.main`. Silnik domenowy EAZ moze pozostac jako biblioteka obliczeniowa i zrodlo testow deterministycznych, ale nie moze byc osobnym publicznym API wynikowym poza kanonicznym torem StudyCase, wyniku, uzasadnienia i raportu.

Pokrycie end-to-end wymagan V12.xx jest kontrolowane przez `MACIERZ_POKRYCIA_END_TO_END.md`. Wiersz pokrycia bez dokumentu, modelu, backendu, API, UI, SLD, wyniku, uzasadnienia, raportu, testu albo ze statusem innym niz `WDROZONE` jest blokada kanonu.

## 6. Draft UI vs ENM

Lokalny stan formularza jest draftem UI. Draft moze byc niekompletny, bledny i porzucony. Draft nie moze zasilac solvera, raportu ani uzasadnienia inzynierskiego. Do ENM trafia tylko zapis przez walidowana operacje domenowa.

Kontrakt szczegolowy zyje w `MACIERZ_DRAFT_VS_COMMITTED.md`. Kazdy nowy formularz, kreator i panel edycyjny musi wskazac, ktore dane sa draftem lokalnym, ktore sa committed w ENM, ktore sa wynikowe, ktore sa raportowe i ktore przeplywy sa zablokowane.

## 7. Przypadek, wariant i migawka lacznikowa

Przypadek obliczeniowy okresla rodzaj analizy. Wariant pracy jest bytem uzytkowym i scenariuszem pracy sieci. Migawka stanow lacznikowych jest konkretnym stanem wykonawczym uzytym do obliczen. Tych bytow nie wolno scalac semantycznie.

Kazdy wynik musi wskazywac:

- hash migawki ENM
- hash snapshotu katalogow
- identyfikator przypadku obliczeniowego
- identyfikator wariantu pracy
- identyfikator migawki stanow lacznikowych
- wersje solvera
- wersje silnika uzasadnien
- wersje szablonu raportu
- wersje regul zgodnosci

## 8. Zakres domenowy

Zakres V12.xx obejmuje GPZ uproszczony i pelny, pola SN, magistrale, odgalezienia, pierscienie, NOP, stacje SN/nN, strone nN, odplywy, obciazenia, ZKSN, slupy rozgalezne, OZE, BESS, FW PMSG/DFIG/SCIG, pelne zwarcia, siec zerowa, rozplyw mocy, stan fazowy SN, stabilnosc dynamiczna, zabezpieczenia, automatyke, selektywnosc, zgodnosc przylaczeniowa, uzasadnienie inzynierskie i raportowanie.

### 8.1 Zwarcia

Obowiazkowy zakres: 3F, 1F, 2F, 2F+Z, Ik'', ip, IB, Ith, skladowe symetryczne, impedancja zerowa, grupy polaczen transformatorow, pojemnosci doziemne, izolowany punkt neutralny, skutecznie uziemiony punkt neutralny, uziemienie rezystorowe i cewka Petersena.

Macierz Z0 jest osobnym kontraktem wejscia solvera i nie zmienia dodatniej macierzy Ybus ani wynikow 3F. Dane `r0/x0` linii, kabli i zrodel sa materializowane do `z0_bus` tylko przez jawny helper, a kazde wlaczenie 1F albo 2F+Z do sciezki raportowej musi zachowac test ochrony wyniku 3F.

Kanoniczny run zwarciowy przyjmuje jawny `fault_type`; brak wartosci oznacza `3F`. Typy `1F` i `2F+Z` sa dozwolone tylko dla committed ENM z kompletna Z0. Endpoint nie moze przyjmowac snapshotu, wezlow, odcinkow ani lokalnego ENM z draftu UI jako danych solverowych.

Wyniki zwarc asymetrycznych `1F` i `2F+Z` sa pelnoprawnymi wynikami raportowymi tylko wtedy, gdy kazdy wiersz wyniku zawiera `proof_ref`, `proof_status=complete`, `reporting_status=reportable`, dopuszczalnosc raportowa, powiazanie z krokami white-box trace oraz informacje o zrodle Z0. Te pola musza byc obecne w raw result, tabeli wynikow, result set, trace export, JSON report i JSON export.

### 8.2 Rozplyw mocy

Newton-Raphson jest solverem podstawowym i kanonicznym. Gauss-Seidel jest trybem diagnostycznym i uproszczonym. Fast Decoupled jest trybem wydajnosciowym przy spelnionych warunkach stosowalnosci.

### 8.3 Stan fazowy SN

Stan fazowy SN jest osobnym modulem glownym. Ma osobny solver, kontrakty wynikowe, nakladke SLD i uzasadnienie dla UA, UB, UC, IA, IB, IC, strat fazowych, niesymetrii obciazenia, asymetrii linii, asymetrii zasilania, przerwy w fazie i awarii fazowych.

### 8.4 Stabilnosc dynamiczna

Stabilnosc dynamiczna jest liczona tylko dla zdefiniowanych zrodel i scenariuszy. Wyniki obejmuja czas zaklocenia, czas krytyczny, resynchronizacje, utrate stabilnosci, wplyw SPZ oraz status raportowy albo analityczny.

### 8.5 OZE, BESS, FW i FRT

Zakres obejmuje pelne modele PV, BESS, FW PMSG/DFIG/SCIG, profile operatora, profile techniczne zrodel, Q(U), cos phi(P), FRT/LVRT/HVRT, szybki wstrzyk pradu, odbudowe mocy, zgodnosc operatorowa i dopuszczalnosc raportowa.

Ocena zgodnosci zrodel jest raportowalna tylko wtedy, gdy profile operatora i zrodla zawieraja FRT, Q(U), cos phi(P), a dla FW PMSG/DFIG/SCIG takze jawny i zgodny `generator_technology`. Brak profilu generatora daje status `not_reportable` i `proof_status=incomplete`; niespojna technologia daje wynik `non_compliant` z pelnym sladem dowodowym.

Warstwa UI, SLD i formularze katalog-first musza przenosic `fw_pmsg`, `fw_dfig` oraz `fw_scig` jako precyzyjne typy domenowe. Legacy `wind_inverter` moze byc widoczne tylko jako sygnal migracyjny, a nie jako docelowy wybor uzytkownika dla nowej farmy wiatrowej.

### 8.6 Automatyka

Automatyka prewencyjna, eliminacyjna i restytucyjna jest bytem pierwszej klasy. Kazde zadzialanie ma slad: co odlaczylo, kiedy, dlaczego i z jakim skutkiem topologicznym.

## 9. SLD

SLD ma warstwy: semantyczna, geometryczna, symboli, interakcji, wynikow, nakladek, inspektora, porownawcza i audytowa. Wyniki na SLD maja status aktualnosci, jednostke, jakosc danych, pochodzenie, przejscie do uzasadnienia oraz zasady gestosci etykiet.

## 10. Raportowanie

Raport OSD i raport audytowy nie generuja wlasnych wartosci. Kazda wartosc raportowa musi pochodzic z ENM, snapshotu katalogowego, wyniku frozen albo uzasadnienia. Raport zawiera identyfikatory wersji danych, solverow, uzasadnien, szablonow i regul zgodnosci.

Eksport SLD i raportowe renderery nie dziedzicza bezposrednio dark SCADA. Motyw ekranowy sluzy pracy operacyjnej, a motyw `light_technical` sluzy wydrukowi, PDF, PNG i dokumentacji technicznej. Oba motywy maja wspolna semantyke stanow, ale oddzielne style renderowania.

Ekranowy dark SCADA jest wymuszony na poziomie korzenia aplikacji przez klase `mv-dark-scada` i `data-ui-theme="dark-scada"`. Historyczne jasne klasy utility uzyte w panelach, oknach i tabelach sa mapowane w `index.css` na ciemne powierzchnie, ciemne obramowania i jasne teksty. Aktywne renderery ekranowe SLD i pol SN nie moga miec jasnego domyslnego motywu. Jasny wyglad jest dopuszczalny tylko wewnatrz kontenerow eksportowych z `data-sld-export-theme="light_technical"`.

## 10.1 Walidacje, severity i blokady

Kazda walidacja, blokada i komunikat ma kod, severity, obszar, akcje naprawcza oraz wplyw na gotowosc i raport. Wartosc `BLOCKER` blokuje obliczenia albo publikacje zgodnie z obszarem, `IMPORTANT` obniza gotowosc i wymaga jawnej oceny, a `INFO` jest sygnalem informacyjnym bez blokady. Sortowanie walidacji jest deterministyczne: severity, kod, pierwszy `ref_id`.

Publiczne wartosci severity i statusu walidacji sa zdefiniowane w jednym kontrakcie `enm.severity`. Boundary API i kontekst raportowy nie moga utrzymywac lokalnych literalow `BLOCKER`, `IMPORTANT`, `INFO`, `OK`, `WARN`, `FAIL`; musza uzywac stalych albo helperow kontraktu, w tym `empty_severity_counts()` i `is_failed_status()`. Straznik `severity_contract_guard.py` blokuje regresje w tym zakresie.

## 10.2 Lifecycle testow E2E

Pelna weryfikacja V12.xx jest bramka produktu i nie moze wisiec bez wyniku. Wykrywanie przegladarki Chromium musi obslugiwac cache Playwright Chromium, ma jawny limit `PLAYWRIGHT_CHROMIUM_VERSION_TIMEOUT_MS`, setup Windows musi uzywac `playwright.cmd` i nie moze przechodzic do fallbacku APT, kazdy krok `verify_v12_5.py` ma timeout procesu, a realny backend Playwright jest uruchamiany przez `cwd: backendCwd`, bez shellowego `Set-Location` albo `cd ../backend`. Powrot do shellowego handoffu backendu albo probe przegladarki bez timeoutu jest regresja blokowana przez `v12xx_canon_guard.py`.

## 11. Migracja

Migracja idzie fazami M0, M1, M2, M3 i M4. Nie wolno wykonywac jednorazowego big-bangu. Szczegoly definiuje `MIGRACJA_ENM_V1_V2.md`.

## 12. Kryteria akceptacji sekcji kanonu

Kazda sekcja kanonu musi wskazywac:

- byt pierwszej klasy
- wynik pochodny
- blokade wdrozeniowa
- test akceptacyjny
- strategie migracji albo potwierdzenie, ze migracja nie dotyczy

## 13. MVP przemyslowe

MVP przemyslowe obejmuje kanon, ENM v2.0, migracje M0/M1/M2, SLD jako os, katalog-first, zwarcia z ziemnozwarciami, rozplyw Newton-Raphsona, gotowosc, uzasadnienie inzynierskie i raport OSD.

## 14. Pelna wersja V12.xx

Pelna V12.xx domyka M3/M4, stan fazowy, stabilnosc dynamiczna, automatyke, pelne OZE/FRT/FW/BESS, pelne macierze interakcji, audyt uprawnien i red-team bez otwartych blokad.
