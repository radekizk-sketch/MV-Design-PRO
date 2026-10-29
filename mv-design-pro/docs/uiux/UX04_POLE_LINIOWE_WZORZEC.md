# UX-04/POLE-LINIOWE-WZORZEC — pole liniowe SN 15 kV GPZ wg ENEA Z.10, Z.11.1, Z.11

Karta wykonawcza programu UX-04 (`mv-design-pro/PLANS.md` część A §C.1), bez własnego statusu.
Stan: 2026-10-28. Werdykt wizualny wystawia właściciel (bramka B-02) — ten dokument niesie
macierz śledzenia i zrzuty do oceny, NIE werdykt i NIE deklarację zgodności z normą.

Podstawa rysunku: ENEA Operator „Stacje elektroenergetyczne 110 kV", Zeszyt 1 (wersja
02.2023-2), rysunki Z.10 (s.89) „Pole linii odpływowej SN", Z.11 (s.90) „Pole linii SN
z pomiarem rozliczeniowym energii i napięcia zwrotnego", Z.11.1 (s.91) „Pole linii SN
z pomiarem napięcia zwrotnego" i §13 „Rozdzielnia SN" (druk s.23–25). Klasa pola i funkcje EAZ:
IRiESD ENEA Operator (wersja 2.3) II.4.5.4.2.1–2.3 i II.4.5.4.7.1. Odczyt rysunków własnymi
słowami, porównanie wykonań i tabela klas: `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`.
Symbole: biblioteka QElectroTech, katalog EN 60617, commit
`14a4727f70856d8e79de59a353fa3c52d3e90e21`, licencja CC BY 3.0 (`docs/sld/vendor/qet/README.md`,
`ELEMENTS.LICENSE`, `import_manifest.json`).

## 1. Łańcuch: rysunek → model → symbol → kanwa

1. **Szablony pola (backend, katalog):** `backend/src/network_model/catalog/bay_templates.py`,
   krotka `BAY_TEMPLATES_GPZ_LINE` — iloczyn **wykonania pola** {Z.10, Z.11.1, Z.11} ×
   **wykonania łączników** {łącznik trójpołożeniowy, wyłącznik stały z odłącznikiem szynowym,
   wyłącznik poziomo wysuwny} = 9 szablonów
   `bay_template_gpz_line_enea_<z10|z11_1|z11>_<trojpolozeniowy|staly_z_odlacznikiem|wysuwny>`.
   Jedna funkcja buduje sekwencję (`_sekwencja_pola_liniowego_gpz`); każdy aparat niesie
   podstawę (rysunek, pozycja), a aparat odgałęzienia — identyfikator odgałęzienia
   (`BayDeviceTemplate.odgalezienie = "pn"`). Tabliczki przekładników: rdzenie CT z pozycji
   katalogu, którą szablon wskazuje (`_rdzenie_typu_ct`, jedno źródło), uzwojenia VT wg rysunku
   (`BayDeviceTemplate.uzwojenia`, typy w `network_model/catalog/przekladniki.py`; dawne
   `ct_cores` skasowane). Funkcje EAZ są częścią szablonu (`BayTemplate.funkcje_eaz`)
   i są korygowane klasą pola (§4). Szablon domyślny pola tworzonego z GPZ: Z.10 z PIERWSZYM
   wykonaniem łączników dopuszczonym w izolacji rodziny rozdzielnicy
   (`szablon_domyslny_pola_liniowego_gpz`, ta sama tablica §13 co odmowa): izolacja powietrzna →
   wyłącznik stały z odłącznikiem, pozostałe i brak rodziny → łącznik trójpołożeniowy.
2. **Materializacja w ENM:** `backend/src/enm/domain_operations.py::_aparaty_pola_liniowego_gpz`
   — JEDNA reguła dla pól tworzonych z GPZ (`create_gpz`, `add_grid_source_sn`) i dokładanych
   przydziałem odejścia (`_allocate_gpz_line_field_for_branch`); zmiana wykonania i klasy —
   operacja `set_bay_equipment` (`backend/src/enm/wyposazenie_pola.py`, tryb `szablon`, pole
   `klasa_pola`). Aparat niesie jawne porty (`BayPrimaryDevice.ports`; węzły toru głównego
   `szyna`, `w1`…`w3`, `kabel`, węzły odgałęzienia `pn1`, `pn2`), położenie łącznika
   (`switch_state`), stan obiektu (`stan_obiektu`, §6), dla aparatu głównego — wskazanie gałęzi
   (`linked_ref`). Wartości bez danych producenta: jakość `ESTIMATED`, wpis w `dane_przyjete`
   (ZASADA NR 4). Pole GPZ bez szablonu i bez aparatu nie dostaje funkcji EAZ — nie ma czym
   wyłączyć (`add_grid_source_sn`; test `test_funkcje_eaz_tylko_w_polu_z_aparatem_albo_szablonem`).
3. **Tor główny i odgałęzienie — jeden predykat:**
   `backend/src/network_model/catalog/rodzaje_aparatury.py` — `porty_toru_pola` (porty
   z kolejności szablonu) i `aparaty_poza_torem_glownym` (aparaty odgałęzienia wyznaczone
   z portów obchodem od węzła szyny; brak portów albo niejednoznaczność → zbiór pusty). Ten sam
   predykat czytają ocena kolejności aparatów pola i silnik referencyjny pola
   (`reference_engine/compliance.py::_profile_checks_for_bay`, §5); kompozycja kanwy ma lustro
   `torPolaZPortow`, parytet przypina `backend/tests/ci/test_parytet_toru_glownego_pola.py`.
4. **Kompozycja (frontend, bez fizyki):** `frontend/src/ui/sld/v3/compose/apparatusSequence.ts`
   (`torPolaZPortow`, `wezlyAparatuWTorze`, `przewodyToruZPortow`, `czyOdgalezienieNaWezleKotwicy`,
   `przesunieciaOdgalezien`) i `frontend/src/ui/sld/v3/compose/gpz.ts::buildFieldStack` —
   kolejność z PORTÓW modelu, przewody port → port wyłącznie na wspólnym węźle, odgałęzienie
   przekładnika napięciowego odchodzi z węzła kotwicy (za wyłącznikiem), brak portu = wpis
   `gpz.bay.port.missing:<pole>:<aparat>` w `missingData` i brak przewodu. Ta sama reguła
   w polu stacji (`frontend/src/ui/sld/v3/compose/station.ts::buildBayStack`, braki
   `station.bay.port.missing:<pole>:<aparat>` / `station.bay.ports.absent:<pole>`).
5. **Symbol:** `frontend/src/ui/sld/v3/cad/qet/qetPoleSn.ts` — generowany deterministycznie
   importerem `scripts/import_qet_pole_sn.py` z plików `.elmt` (odczyt XML, fail-closed; świeżość
   i iniekcje: `backend/tests/ci/test_qet_pole_sn_import.py`); odwzorowanie rodzaj → symbol QET:
   `SYMBOL_QET_RODZAJU` w `apparatusSequence.ts`.
6. **Kanwa i okno pola:** `SldCanvasV3` rysuje scenę; okno pola (powierzchnia „Pole SN",
   inspektor) pokazuje WYCINEK tej samej sceny (`frontend/src/ui/field/SchematPolaSn.tsx`,
   `frontend/src/ui/sld/v3/scene/kadrPola.ts`) — dawny osobny rysunek pola skasowany. W oknie
   pola: ocena pola wg klasy (`frontend/src/ui/field/OcenaPolaLiniowegoGpz.tsx`), stan obiektu
   (`frontend/src/ui/field/EdytorStanuObiektuPola.tsx`), wybór szablonu z oceną dopuszczalności
   z backendu (`GET /api/catalog/bay-templates`, §3).
7. **Stan SCADA:** ramka = wyłącznie obrys (`fill="none"`) całego symbolu łącznika:
   `#F05260` zamknięty, `#2CCF93` otwarty, identycznie w obu motywach i w eksporcie;
   łącznik trójpołożeniowy „uziemiony" — ramka zielona i nóż na zestyku uziemiającym; stan
   nieznany — bez ramki, symbol zostaje, podpis „stan nieznany". Predykat „łącznik pola"
   (`frontend/src/ui/sld/v3/compose/rodzajeAparatuPola.ts`) jest lustrem backendu
   (`RODZAJE_LACZNIKOW_POLA`), parytet przypina `backend/tests/ci/test_parytet_rodzajow_aparatu_pola.py`.
8. **Interakcja:** klik = wybór (obrys zaznaczenia); przełączenie wyłącznie osobną akcją menu
   („Otwórz łącznik" / „Zamknij łącznik", operacje `open_switch` / `close_switch`). Operacja
   przełączania łącznika trójpołożeniowego i walidacja łączeń na topologii wynikowej należą
   do karty UX-04/LOGIKA-LACZENIOWA (§8).

## 2. Macierze Z.10 / Z.11.1 / Z.11 → aparat ENM / porty → element QET → zrzut

Elementy QET (ścieżki względem `docs/sld/vendor/qet/10_electric/`; SHA bloba git
w zatwierdzeniu źródła, bajtowa równość pilnowana importerem):

| Symbol | Element QET (plik `.elmt`) | SHA bloba git |
|---|---|---|
| `qetThreePositionSwitch` | **złożenie** `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt` + `91_en_60617/en_60617_02/en_60617_02_15/en_60617_02_15_01.elmt` | `cee8fc840450295927176ac3b938eeded5f2fcd5` + `4c1c408e1e15c304f08c67cb03a5456b941bc614` |
| `qetBreaker` | `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt` | `8df98b9b5c2783ea2413b406bef53ded66da628a` |
| `qetDisconnector` | `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_06.elmt` | `58a1758ff8fda670013b32a3a2068633223b4e9c` |
| `qetEarthSwitch` | `10_allpole/450_high_voltage/interrupteur_sectionneur_de_terre.elmt` | `addcaa782655cfe3d85a8f285cb48ec02194fee5` |
| `qetCurrentTransformer` | `91_en_60617/en_60617_06/en_60617_06_09/en_60617_06_09_10.elmt` | `37de2decfe2a496cd014a1dd411a5e8d52e990ca` |
| `qetVoltageTransformer` | `91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt` (zacisk wtórny poza torem, z powodem w manifeście) | `a883a2e6daec80c241594505c96295c917884adc` |
| `qetVoltageIndicator` | `10_allpole/450_high_voltage/signal_capacitif.elmt` (przewód toru przechodzi przez symbol — uwaga manifestu) | `fa4f0d85eabef67c8dfcf4cd102fdba3bc7c91d4` |
| `qetCableHead` | `91_en_60617/en_60617_03/en_60617_03_04/en_60617_03_04_01.elmt` | `1a6cf258181f1205b6d9cb95262b7335c829b7a7` |
| `qetCoreBalanceCt` | `91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_10.elmt` | `4742b0a5097196c28ac3c07e30ce427a95a36ad2` |
| `qetLoadBreakSwitch` | `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_08.elmt` (pola rodzin producentów) | `ca96486920218370b3afffb17a0ae8bfe3f6414c` |
| `qetFuseSwitch` | `91_en_60617/en_60617_07/en_60617_07_21/en_60617_07_21_09.elmt` (pola rodzin producentów) | `8079d0cde1116a3efa45064a5211b3cbf92ba2e0` |

Ramkę stanu dostają wszystkie symbole łączników tak samo (iloczyn symbol × stan × motyw
w `frontend/src/ui/sld/v3/symbols/__tests__/qetRamkaScada.test.tsx`).

### 2.1. Z.10 — pole linii odpływowej (klasa odbiorcza)

Szablon `bay_template_gpz_line_enea_z10_trojpolozeniowy` (domyślny w izolacji gazowej bez
gazów fluorowanych i stało-powietrznej). Zrzuty: `pole-z10-trojpolozeniowy-zamkniete-*`,
`pole-z10-wylacznik-otwarty-*`, `okno-pola-z10-trojpolozeniowy-*`.

| Z.10 poz. | Aparat (oznaczenie) | Rodzaj ENM, umiejscowienie | Porty ENM (port: węzeł) | Symbol |
|---|---|---|---|---|
| 1 | szyna sekcji SN | szyna `Bus` sekcji | — | szyna sceny |
| 2–3 | łącznik trójpołożeniowy szynowy (Q1) | `THREE_POSITION_SWITCH`, `UPSTREAM` | `we: szyna`, `wy: w1` | `qetThreePositionSwitch` |
| 4 | wyłącznik próżniowy z napędem (Q0) | `CB`, `MIDSTREAM`; `linked_ref` = gałąź wyłącznika | `we: w1`, `wy: w2` | `qetBreaker` |
| 5 | przekładnik prądowy 1 rdzeń 200-400/5 A, 15 VA, 5P20 (T1; P1 od wyłącznika) | `CT`, `MIDSTREAM`, katalog `ct_typ_ogolny_osd_200_400_5_5p20_15va` | `we: w2`, `wy: w3` | `qetCurrentTransformer` |
| 6 | pojemnościowy wskaźnik napięcia (PF1) | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: w3` | `qetVoltageIndicator` |
| 7 | głowica kablowa (GK) | `CABLE_HEAD`, `DOWNSTREAM` | `we: w3`, `wy: kabel` | `qetCableHead` |
| 8 | przekładnik Ferrantiego 1/100 na kablu (T2) | `CORE_BALANCE_CT`, `DOWNSTREAM` | `obwod: kabel` (bez przerwy toru) | `qetCoreBalanceCt` |
| — | odłącznik liniowy, uziemnik kabla | **nie występują** (Z.10 ich nie rysuje; kabel uziemia się przez zamknięty wyłącznik przy Q1 „uziemiony", §13 druk s.24) | — | — |

Wykonanie z wyłącznikiem stałym (`…_z10_staly_z_odlacznikiem`, §13 — domyślne w izolacji
powietrznej; zrzuty `pole-z10-staly-stan-nieznany-*`, `okno-pola-z10-staly-z-odlacznikiem-*`):
Q1 = odłącznik szynowy `DS` (`we: szyna`, `wy: w1`, `qetDisconnector`) oraz uziemnik stały
wyprowadzenia Q9 (`ES`, `GROUND_BRANCH`, `przylacze: w3`, `qetEarthSwitch`); Q0, T1, PF1, GK, T2
jak wyżej. Wykonanie wysuwne (`…_z10_wysuwny`): BEZ Q1 — odłączenie od szyny daje wysunięcie
wyłącznika poziomo wysuwnego (§13), więc Q0 ma `we: szyna`; uziemnik Q9 na węźle wyjścia.

Oznaczenia aparatów (Q1, Q0, T1, PF1, GK, T2, Q9, PF0, Q5, Q51, GK1, T3) są konwencją kanonu
szablonów — rysunki ich nie podają. Wskaźnik napięcia nosi „PF1" (litera klasy P — prezentacja
informacji, IEC 81346-2), nie „P1": „P1"/„P2" to zaciski pierwotne przekładnika prądowego,
a „P1" jest też wzorcem kryptonimu zakazanym w tekstach UI (`scripts/no_codenames_guard.py`).

### 2.2. Z.11.1 — pole linii SN z pomiarem napięcia zwrotnego

Z.11.1 = Z.10 + wskaźnik napięcia od strony szyny (PF0) + odgałęzienie przekładnika
napięciowego ZA wyłącznikiem, przed przekładnikiem prądowym. Szablon
`bay_template_gpz_line_enea_z11_1_trojpolozeniowy`; zrzuty `pole-z11-1-odgalezienie-*`,
`okno-pola-z11-1-trojpolozeniowy-*`.

| Z.11.1 | Aparat | Rodzaj ENM, umiejscowienie, odgałęzienie | Porty ENM | Symbol |
|---|---|---|---|---|
| wskaźnik napięcia przy szynie | PF0 | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: szyna` | `qetVoltageIndicator` |
| łącznik trójpołożeniowy | Q1 | `THREE_POSITION_SWITCH`, `UPSTREAM` | `we: szyna`, `wy: w1` | `qetThreePositionSwitch` |
| wyłącznik próżniowy | Q0 | `CB`, `MIDSTREAM` | `we: w1`, `wy: w2` | `qetBreaker` |
| odłącznik z uziemieniem odgałęzienia | Q5 | `THREE_POSITION_SWITCH`, `OFF_PATH`, odgałęzienie `pn` | `we: w2`, `wy: pn1` | `qetThreePositionSwitch` |
| głowica (złącze) przekładnika | GK1 | `CABLE_HEAD`, `OFF_PATH`, `pn` | `we: pn1`, `wy: pn2` | `qetCableHead` |
| przekładnik napięciowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 (uzwojenia 10 VA 0,2; 7,5 VA 0,2; 7,5 VA 0,5/3P otwarty trójkąt) | T3 | `VT`, `OFF_PATH`, `pn` | `przylacze: pn2` | `qetVoltageTransformer` |
| przekładnik prądowy 1 rdzeń 200-400/5 A, 15 VA, 5P20 | T1 | `CT`, `MIDSTREAM` | `we: w2`, `wy: w3` | `qetCurrentTransformer` |
| wskaźnik napięcia | PF1 | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: w3` | `qetVoltageIndicator` |
| głowica kablowa | GK | `CABLE_HEAD`, `DOWNSTREAM` | `we: w3`, `wy: kabel` | `qetCableHead` |
| przekładnik Ferrantiego | T2 | `CORE_BALANCE_CT`, `DOWNSTREAM` | `obwod: kabel` | `qetCoreBalanceCt` |

Wykonania z wyłącznikiem stałym i wysuwnym: Q5 = odłącznik odgałęzienia `DS` (szablon
`DS_BRANCH`, `qetDisconnector`), za nim uziemnik odgałęzienia Q51 (`ES`, `GROUND_BRANCH`,
`przylacze: pn1`, `qetEarthSwitch`); stały — dodatkowo Q1 `DS` szynowy i Q9; wysuwny — bez Q1,
Q0 od szyny, odgałęzienie od `w1`, Q9 na węźle wyjścia.

### 2.3. Z.11 — pole linii SN z pomiarem rozliczeniowym energii i napięcia zwrotnego

Układ jak Z.11.1 (wszystkie trzy wykonania łączników); różnice: przekładnik prądowy
trójrdzeniowy `ct_typ_ogolny_osd_200_400_5_5_5_z11` (200-400/5/5/5 A: 10 VA 0,2S FS5 —
rozliczenie i analizator jakości energii; 10 VA 0,2 FS5 — układy regulacyjne; 15 VA 5P20 —
zabezpieczenia) i uzwojenie I przekładnika napięciowego o przeznaczeniu `ROZLICZENIE`.
Pomiar rozliczeniowy (AJEE) — progi i ocena w §4.

### 2.4. Pole wolne

Pole wolne (bez kabla odejścia) kończy tor na ostatnim aparacie z węzłem wyjścia i znaczniku
pola rezerwowego — zakończenie toru kablowego (GK i T2) nie jest rysowane, bo kabla nie ma.

## 3. Zakaz gazów fluorowanych w polach projektowanych

Reguła: `backend/src/network_model/catalog/gazy_fluorowane.py` (liść, jedno źródło). Media
z gazem fluorowanym: `SF6`, `C4-FN`, `C5-FK` (`MEDIA_ZE_GAZEM_FLUOROWANYM`). Podstawa:
rozporządzenie (UE) 2024/573 art. 13 ust. 9 lit. a (rozdzielnice SN do 24 kV od 2026-01-01)
i lit. b (powyżej 24 kV do 52 kV od 2030-01-01); dyrektywa właściciela 2026-10-28 („nowe pola
nie mogą być w SF6") rozciąga zakaz na każde napięcie SN; ENEA Zeszyt 1 §13 dopuszcza izolację
„SF6 lub inną o zbliżonych właściwościach dielektrycznych w tym powietrzną" i wymaga
wyłączników próżniowych. Gaz fluorowany jest dopuszczony WYŁĄCZNIE w obiekcie `ISTNIEJACY`
(art. 13 ust. 7 i 10); stan nieustalony nie zwalnia z zakazu.

- **Odmowa operacji:** `backend/src/enm/gaz_fluorowany_pola.py` przykłada regułę do czterech
  nośników (rodzina rozdzielnicy pola, aparat pola z pozycją katalogu, aparat główny pola bez
  lustra, gałąź łączeniowa). Strażnik KAŻDEJ operacji domenowej
  (`domain_operations._odmowa_gazu_fluorowanego`) i kroku kreatora sieci
  (`application/network_wizard/step_controller.py`) porównuje model przed i po operacji —
  nowe naruszenie daje odmowę z kodem `pole.gaz_fluorowany`, zdaniem z podstawą i akcją
  „wybierz wykonanie bez gazów fluorowanych"; model zostaje bez zmian. Walidator modelu: `W045`
  (`bay.fluorinated_gas_not_existing`).
- **Filtr pickerów z backendu:** `GET /api/catalog/switch-equipment-types`
  i `GET /api/catalog/mv-apparatus-types` niosą `gaz_fluorowany`, `dopuszczony_do_nowych_pol`,
  `powod_blokady_nowych_pol_pl` (`api/catalog.py::_dopuszczenie_do_nowych_pol` — ta sama reguła
  co strażnik); `GET /api/catalog/switchgear-families` — pole wyliczane
  `SwitchgearFamily.gaz_fluorowany`; `GET /api/catalog/bay-templates` — szablony z odmowami
  (`enm/zgodnosc_szablonu_pola.py`: wykonanie łączników × izolacja `W046`, szablon GPZ poza GPZ
  `W047`, klasa × wykonanie `W048`). Front (`frontend/src/ui/catalog/dopuszczenieNowychPol.ts`)
  wyłącznie stosuje pola backendu: picker obiektu projektowanego pokazuje pozycje dopuszczone
  i notę o ukrytych, obiektu istniejącego — wszystkie z medium na widoku.
- **Wykonania GPZ bez gazów fluorowanych:** rodziny ogólne OSD `TYP_OGOLNY_OSD__GPZ_AIS`
  (izolacja powietrzna), `TYP_OGOLNY_OSD__GPZ_SSIS` (stało-powietrzna),
  `TYP_OGOLNY_OSD__GPZ_GAZ_BEZ_F` (gaz bez fluoru); wyłącznik zawsze próżniowy. Inwentarz SF6
  w katalogu i w repozytorium: `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md` §13.

## 4. Klasa pola liniowego i funkcje EAZ

`Bay.klasa_pola` ∈ {`ODBIORCZE`, `MIESZANE`, `DEDYKOWANE_WYTWORCY`} — JEDYNE źródło trybu
pracy pola („linia SN z generacją" = klasa mieszana albo dedykowana). Tabela klas z podstawą:
`docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`; dane: `bay_templates.WYMAGANIA_EAZ_KLASY_POLA`
i `WYKONANIA_POLA_KLASY` (klasa z generacją wymaga przekładnika napięciowego od strony linii →
wyłącznie Z.11.1 i Z.11; odmowa `pole.klasa_pola_niezgodna_z_wykonaniem`, `W048`).

Zestaw funkcji pola = zestaw rysunku wykonania skorygowany klasą (`funkcje_eaz_pola_liniowego`;
resolver `_resolve_bay_template_protection_codes`: szablon producenta → `BayTemplate.funkcje_eaz`
skorygowane klasą → funkcje domyślne roli):

| Wykonanie | ODBIORCZE | MIESZANE | DEDYKOWANE_WYTWORCY |
|---|---|---|---|
| Z.10 | 51, 50, 67N, **81U**, ZS, 50BF, 79, SCO, SPZ/SCO | niedopuszczone (`W048`) | niedopuszczone (`W048`) |
| Z.11.1, Z.11 | 51, 50, 67, 67N, 27, 59, 81U, 81O, 81R, ZS, 50BF, 79, SPZE, OWG, SCO | jak odbiorcze **bez SCO** | 51, 50, 67N, 27, 59, 81U, 81O, 81R, ZS, 50BF, OWG (**bez 67, 79, SPZE, SCO**) |

81U w Z.10 dopisuje klasa odbiorcza (IRiESD II.4.5.4.2.1 pkt 5) — rysunek Z.10 go nie wymienia
(rozbieżność w raporcie §13).

Ocena pola (`backend/src/enm/pole_liniowe_gpz.py`, front `OcenaPolaLiniowegoGpz.tsx`) — statusy
kontraktu werdyktu wyjaśnialnego: funkcja wymagana obecna → `SPELNIA` z kompletnością dowodu
`NIEPELNY` (dowodem jest deklaracja funkcji pola, nie nastawy przekaźnika), nieobecna →
`NIE_SPELNIA`; funkcja „na żądanie OSD" obecna → `BRAK_DOWODU`, nieobecna → `NIEJEDNOZNACZNY`
— **nigdy `SPELNIA`** (wymóg ustala OSD w warunkach przyłączenia, których model nie niesie);
zakazana obecna → `NIE_SPELNIA`; SPZ w linii kablowej → `NIE_DOTYCZY`. Klasa niezadeklarowana —
klasa wynikająca z sieci za polem (konfiguracja normalna), jawnie oznaczona jako przyjęta. Typ
modułu wytwarzania za polem (A–D) — z `catalog.profiles.nc_rfg.loader.klasyfikacja_modulu`
(jedyne miejsce progów). Niezgodności walidatora: `W049` generacja zasilana z pola
odbiorczego, `W050` odbiory za polem dedykowanym, `W051` SCO w polu z generacją, `W052` SPZ
w polu dedykowanym, `W053` brak rdzenia rozliczeniowego, gdy pomiar AJEE jest wymagany
(odbiorca powyżej 4 MW, wytwórca od 200 kW — `PROG_AJEE_ODBIORCY_KW`, `PROG_AJEE_WYTWORCY_KW`).

## 5. Silnik referencyjny pola (profil `line_breaker`, `reference_engine/packs/iec62271/pack.json`)

Kontrola profilu czyta tor główny z tego samego predykatu co ocena kolejności (§1 pkt 3):
kolejność i wymagane grupy ocenia wyłącznie na aparatach toru głównego (odgałęzienie
przekładnika napięciowego nie jest aparatem toru głównego), zakazane — na wszystkich aparatach
pola. Grupa „odłączenie od szyny" (łącznik trójpołożeniowy albo odłącznik) jest spełniona
wysunięciem wyłącznika poziomo wysuwnego, gdy pole wskazuje szablon wysuwny
(`bay_templates.odlaczenie_wysunieciem_wylacznika`, pole profilu `grupy_spelniane_wysunieciem`,
komunikat z podstawą ENEA Zeszyt 1 §13). Lustro frontowe `referenceProfiles.ts` niesie pole
profilu; wyrocznia frontowa ocenia stosy bez szablonu (rozbieżność w raporcie §13).

## 6. Stan obiektu

`Bay.stan_obiektu` i `BayPrimaryDevice.stan_obiektu` ∈ {`ISTNIEJACY`, `PROJEKTOWANY`}; każda
operacja tworząca nadaje `PROJEKTOWANY`, stan `ISTNIEJACY` ustawia wyłącznie jawna operacja
`set_object_state` (`backend/src/enm/stan_obiektu_pola.py`) albo import sieci niosący stan.
Gałąź łącznika ma stan aparatu pola, który ją wskazuje (`stan_obiektu_lacznika`, lustro
frontowe `frontend/src/ui/shared/stanObiektu.ts::stanObiektuLacznika`, parytet
`backend/tests/ci/test_parytet_stanu_obiektu.py`). Widok: okno pola (edytor stanu), inspektor
(`InspectorEngineeringView`, `SwitchCard`), karta techniczna (`kartaTechnicznaElementu.ts`)
i dyskretnie na kanwie — atrybut `data-stan-obiektu` symbolu i podpowiedź „Stan obiektu: …"
obszaru trafienia, bez dodatkowej grafiki.

## 7. Zrzuty (żywa aplikacja, realny backend, ścieżka użytkownika)

Spec: `frontend/e2e/ux04-pole-liniowe-zrzuty-screenshot.spec.ts` — GPZ z menu tła kanwy
(kreator źródła, wartości domyślne: 2 sekcje × 2 pola liniowe), ciąg główny z GPZ, w polu
sekcji 2 przez okno pola „Zmień wyposażenie" → Z.10 z wyłącznikiem stałym i odłącznikiem,
w wolnym polu sekcji 1 → Z.11.1, natywny lewy klik wyłącznika (zaznaczenie, zero operacji
łączeniowych), „Otwórz łącznik" z menu wyłącznika. Katalog: `docs/uiux/zrzuty/ux04-pole-liniowe/`.
Każdy zrzut kanwy kadruje SWOJE pole ścieżką projektanta: natywny klik w aparat (zaznacza
pole), „Dopasuj do… → Pole" — pole na środku kanwy, sąsiedzi pod kurtyną kadru; spec
sprawdza, że aparat celu nie leży pod kurtyną i że żaden zrzut nie jest bajtowo identyczny
z innym. Przed każdą operacją z menu spec wraca do „Dopasuj do… → Sieć" (kadr bez kurtyny):
sam „Dopasuj widok" kadruje zakres pracy, czyli zaznaczenie, a po kreatorze magistrali
zaznaczony zostaje nowy odcinek. Zrzuty Z.11.1 powstają w osobnym projekcie „Pole liniowe
Z.11.1 …" (nagłówek aplikacji nazywa wykonanie pola ze zrzutu); zrzuty Z.10 — w projekcie
„Pole liniowe Z.10 …".

Naprawy z oględzin zrzutów roboczych (2026-10-29): akcja z menu obiektu kanwy najpierw
zaznacza ten obiekt ścieżką lewego kliku (`SldCanvasV3Workspace.handleContextMenuAction`) —
wcześniej „Otwórz kartę pola" z menu wyłącznika zostawiała w inspektorze poprzednio
zaznaczony odcinek; karta pola ma jedną kolumnę (schemat pola na górze, sekcje na pełną
szerokość) zamiast dwóch kolumn wg progu okna, tabela ocen funkcji ma szerokości kolumn
z treści; dane przyjęte wyposażenia są jedną adnotacją na wspólny powód i jakość (ZASADA
NR 4 pkt 4), z nazwami wszystkich aparatów.

| Plik (`-ciemny` / `-jasny`) | Co pokazuje |
|---|---|
| `pole-z10-trojpolozeniowy-zamkniete` | pole Z.10 zajęte kablem: Q1 i Q0 zamknięte (ramki `#F05260`), T1, PF1, GK, T2 bez ramek |
| `pole-z10-staly-stan-nieznany` | pole Z.10 z wyłącznikiem stałym po zmianie szablonu: odłącznik Q1 bez rekordu położenia — bez ramki, podpis „stan nieznany", uziemnik Q9 na odgałęzieniu |
| `pole-z11-1-odgalezienie` | pole Z.11.1: PF0 przy szynie, odgałęzienie Q5 → GK1 → T3 za wyłącznikiem |
| `pole-z10-wylacznik-otwarty` | po „Otwórz łącznik": Q0 otwarty (ramka `#2CCF93`), Q1 zamknięty |
| `okno-pola-z10-trojpolozeniowy`, `okno-pola-z10-staly-z-odlacznikiem`, `okno-pola-z11-1-trojpolozeniowy` | okno pola (wycinek sceny kanwy) z oceną klasy i stanem obiektu |

## 8. Ograniczenia i wymagania przekazane dalej

- **Wymaganie dla karty UX-04/LOGIKA-LACZENIOWA — telemechanika pola „Linia SN z generacją"**
  (katalog sygnałów ENEA, sekcja „Linia SN z generacją"; pole klasy mieszanej albo
  dedykowanej): pomiary U1–U3, U12, U23, U31, f, tgφ, cosφ (wymagają przekładnika napięciowego
  od strony linii — klasa z generacją dopuszcza wyłącznie Z.11.1 i Z.11); telesygnalizacja
  zadziałań f< / f> / df/dt, U< / U>, kontroli synchronizmu, „Pomiar energii – uszkodzenie –
  podstawowy / rezerwowy"; sygnał OWG [KS; Zeszyt 1 §26.10.4]; sterowania i stany >NZ / blNZ,
  >SYN / blSYN. Ten wzorzec niesie klasę pola i funkcje EAZ, NIE niesie listy sygnałów
  telemechaniki — jej model i ekran należą do logiki łączeniowej.
- Operacja `set_bay_equipment` w trybie `szablon` NIE ustawia położeń łączników (stan żyje na
  rekordzie aparatu i na gałęzi), więc po zmianie wykonania odłącznik pokazuje „stan nieznany"
  do czasu ustawienia położenia — zachowanie uczciwe, nie zaślepka. Ustawianie położeń łączników
  bez gałęzi (łącznik trójpołożeniowy, odłącznik szynowy, uziemnik) i walidacja łączeń na
  topologii wynikowej — karta UX-04/LOGIKA-LACZENIOWA.
- Rozdzielnica 110 kV (pole WN, transformator) bez zmian — granica karty.
- Pola transformatorowe, pomiaru napięcia (Z.17) i sprzęgło (Z.12) — karta
  UX-04/POLA-TR-POMIAR-SPRZEGLO.
- Brak deklaracji zgodności z normą i brak werdyktu wizualnego (B-02 — właściciel).
