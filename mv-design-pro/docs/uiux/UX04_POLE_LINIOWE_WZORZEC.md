# UX-04/POLE-LINIOWE-WZORZEC — pole liniowe SN 15 kV GPZ wg ENEA Z.10, Z.11.1, Z.11

Karta wykonawcza programu UX-04 (`mv-design-pro/PLANS.md` część A §C.1), bez własnego statusu.
Stan: 2026-10-29 (rozszerzenie 5 — referencja HMI, dyrektywa „POPRAWA SLD SN" i uzupełnienie
właściciela o kompletny wzorzec pola, §9–§11). Werdykt wizualny wystawia właściciel (bramka B-02) — ten dokument niesie
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
7. **Stan łącznika — kafel stanu (rozszerzenie 5, §10):** wypełniony prostokąt pod symbolem
   łącznika z położeniem, symbol na kaflu w kolorze białym: `#C62828` zamknięty, `#2E7D32`
   otwarty, `#6B7280` ze znakiem „?" stan nieustalony (brak rekordu, „nieznany", rekord sprzeczny
   z rodzajem aparatu), `#8E44AD` ze znakiem „!" rekord „awaria"; JEDNA tabela
   (`frontend/src/ui/sld/v3/theme/colorTokens.ts::STATE_COLOR`) dla kanwy, eksportu, legendy,
   inspektora i SLD v2, identyczna w obu motywach — zmienia się wyłącznie tło. Łącznik
   trójpołożeniowy „uziemiony" — kafel czerwony (zestyk uziemiający zamknięty) i nóż na zestyku
   uziemiającym. Punkt normalnie otwarty nie ma osobnego koloru: stan łącznika + znacznik NOP.
   Aparat bez położenia (przekładnik, głowica, wskaźnik napięcia) nie ma kafla. Predykat „łącznik pola"
   (`frontend/src/ui/sld/v3/compose/rodzajeAparatuPola.ts`) jest lustrem backendu
   (`RODZAJE_LACZNIKOW_POLA`), parytet przypina `backend/tests/ci/test_parytet_rodzajow_aparatu_pola.py`.
8. **Interakcja:** klik = wybór (obrys zaznaczenia); przełączenie wyłącznie osobną akcją menu
   APARATU („Otwórz łącznik" / „Zamknij łącznik" / „Uziem łącznik"). Cel akcji rozstrzyga jeden
   resolver (`frontend/src/ui/sld/shared/celStanuLacznika.ts`) dla dostępności pozycji menu
   i dla wykonawcy: aparat z gałęzią łączeniową modelu (`linked_ref`) → `open_switch` /
   `close_switch` tej gałęzi; łącznik pola bez gałęzi (odłącznik szynowy, uziemnik, łącznik
   trójpołożeniowy toru i odgałęzienia) → operacja `set_bay_apparatus_position`
   (`backend/src/enm/polozenie_aparatu_pola.py`, kontrakt `docs/ui/KONTRAKT_OPERACJI_ENM_OP.md`
   §3.7d; „uziemiony" wyłącznie łącznika trójpołożeniowego i wyłącznie przez położenie
   otwarte); aparat nie-łącznik → pozycja zablokowana z powodem. Przed rozszerzeniem 5 menu
   odłącznika i uziemnika pola przełączało WYŁĄCZNIK pola (temat menu tracił ref aparatu).
   Walidacja łączeń na topologii wynikowej (blokady) należy do karty UX-04/LOGIKA-LACZENIOWA (§8).

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

Kafel stanu dostają wszystkie symbole łączników z położeniem tak samo (iloczyn symbol × stan ×
motyw × eksport × NOP w `frontend/src/ui/sld/v3/symbols/__tests__/kafelStanu.test.tsx`; na żywej
kanwie × LOD × warstwy w `frontend/src/ui/sld/v3/canvas/__tests__/kafleStanuNaKanwie.test.tsx`).

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
wyprowadzenia Q8 (`ES`, `GROUND_BRANCH`, `przylacze: w3`, `qetEarthSwitch`); Q0, T1, PF1, GK, T2
jak wyżej. Wykonanie wysuwne (`…_z10_wysuwny`): BEZ Q1 — odłączenie od szyny daje wysunięcie
wyłącznika poziomo wysuwnego (§13), więc Q0 ma `we: szyna`; uziemnik Q8 na węźle wyjścia.

Oznaczenia aparatów (Q1, Q0, T1, PF1, GK, T2, Q8, PF0, Q5, Q51, GK1, T3) są WARTOŚCIĄ ROBOCZĄ
(ZASADA NR 4, edytowalną w modelu) z jednego schematu: praktyka DIN 40719-2 dla łączników (Q0
wyłącznik, Q1/Q2 odłączniki szynowe, Q8 uziemnik, Q9 odłącznik liniowy), T1 przekładnik prądowy
toru, T2 przekładnik Ferrantiego; Q5/Q51/GK1/T3 i GK — oznaczenia robocze bez podstawy normowej.
Rysunki ENEA oznaczeń literowo-cyfrowych nie podają — ani szablon, ani ten dokument nie twierdzą
zgodności oznaczeń z ENEA. Ten sam schemat proponują konfiguracje pól silnika referencyjnego
(`reference_engine/field_configuration_catalog.py`) i adapter schematu GPZ; jednoznaczność
oznaczeń w polu pilnuje walidator `W063` (§10). Konwencja kompozycji kanwy dla pola BEZ
oznaczeń w danych (`apparatusSequence.ts` — Q{n}/QE{n}/T{n}, spec SLD §19.1) jest inna niż
schemat szablonów — rozbieżność zapisana w `docs/v12xx/REJESTR_KONFLIKTOW.md`
(UX04-OZNACZENIA-APARATOW). Wskaźnik napięcia nosi „PF1" (litera klasy P — prezentacja
informacji, IEC 81346-2), nie „P1": „P1"/„P2" to zaciski pierwotne przekładnika prądowego,
a „P1" jest też wzorcem kryptonimu zakazanym w tekstach UI (`scripts/no_codenames_guard.py`).

### 2.2. Z.11.1 — pole linii SN z pomiarem napięcia zwrotnego

Z.11.1 = Z.10 + wskaźnik napięcia od strony szyny (PF0) + odgałęzienie przekładnika
napięciowego ZA wyłącznikiem, przed przekładnikiem prądowym. Szablon
`bay_template_gpz_line_enea_z11_1_trojpolozeniowy`; zrzuty `pole-z11-1-wylacznik-otwarty-uziemiony-*`,
`okno-pola-z11-1-trojpolozeniowy-*`.

| Z.11.1 | Aparat | Rodzaj ENM, umiejscowienie, odgałęzienie | Porty ENM | Symbol |
|---|---|---|---|---|
| wskaźnik napięcia przy szynie | PF0 | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: szyna` | `qetVoltageIndicator` |
| łącznik trójpołożeniowy | Q1 | `THREE_POSITION_SWITCH`, `UPSTREAM` | `we: szyna`, `wy: w1` | `qetThreePositionSwitch` |
| wyłącznik próżniowy | Q0 | `CB`, `MIDSTREAM` | `we: w1`, `wy: w2` | `qetBreaker` |
| odłącznik z uziemieniem odgałęzienia | Q5 | `THREE_POSITION_SWITCH`, `OFF_PATH`, odgałęzienie `pn` | `we: w2`, `wy: pn1` | `qetThreePositionSwitch` |
| głowica (złącze) przekładnika | GK1 | `CABLE_HEAD`, `OFF_PATH`, `pn` | `we: pn1`, `wy: pn2` | `qetCableHead` |
| przekładnik napięciowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 (uzwojenia I 10 VA 0,2; II 7,5 VA 0,2; III 7,5 VA 0,5/3P — rysunek s.91 nie rysuje otwartego trójkąta; uzwojenia I i II niepodłączone, III mierzy napięcie linii dla U>/U< i f</f>/df/dt) | T3 | `VT`, `OFF_PATH`, `pn` | `przylacze: pn2` | `qetVoltageTransformer` |
| przekładnik prądowy 1 rdzeń 200-400/5 A, 15 VA, 5P20 | T1 | `CT`, `MIDSTREAM` | `we: w2`, `wy: w3` | `qetCurrentTransformer` |
| wskaźnik napięcia | PF1 | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: w3` | `qetVoltageIndicator` |
| głowica kablowa | GK | `CABLE_HEAD`, `DOWNSTREAM` | `we: w3`, `wy: kabel` | `qetCableHead` |
| przekładnik Ferrantiego | T2 | `CORE_BALANCE_CT`, `DOWNSTREAM` | `obwod: kabel` | `qetCoreBalanceCt` |

Wykonania z wyłącznikiem stałym i wysuwnym: Q5 = odłącznik odgałęzienia `DS` (szablon
`DS_BRANCH`, `qetDisconnector`), za nim uziemnik odgałęzienia Q51 (`ES`, `GROUND_BRANCH`,
`przylacze: pn1`, `qetEarthSwitch`); stały — dodatkowo Q1 `DS` szynowy i uziemnik Q8; wysuwny —
bez Q1, Q0 od szyny, odgałęzienie od `w1`, Q8 na węźle wyjścia.

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
  „wybierz wykonanie bez gazów fluorowanych"; model zostaje bez zmian. Walidator modelu: `W049`
  (`bay.fluorinated_gas_not_existing`).
- **Filtr pickerów z backendu:** `GET /api/catalog/switch-equipment-types`
  i `GET /api/catalog/mv-apparatus-types` niosą `gaz_fluorowany`, `dopuszczony_do_nowych_pol`,
  `powod_blokady_nowych_pol_pl` (`api/catalog.py::_dopuszczenie_do_nowych_pol` — ta sama reguła
  co strażnik); `GET /api/catalog/switchgear-families` — pole wyliczane
  `SwitchgearFamily.gaz_fluorowany`; `GET /api/catalog/bay-templates` — szablony z odmowami
  (`enm/zgodnosc_szablonu_pola.py`: wykonanie łączników × izolacja `W050`, szablon GPZ poza GPZ
  `W051`, klasa × wykonanie `W052`). Front (`frontend/src/ui/catalog/dopuszczenieNowychPol.ts`)
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
wyłącznie Z.11.1 i Z.11; odmowa `pole.klasa_pola_niezgodna_z_wykonaniem`, `W052`).

Zestaw funkcji pola = zestaw rysunku wykonania skorygowany klasą (`funkcje_eaz_pola_liniowego`;
resolver `_resolve_bay_template_protection_codes`: szablon producenta → `BayTemplate.funkcje_eaz`
skorygowane klasą → funkcje domyślne roli):

| Wykonanie | ODBIORCZE | MIESZANE | DEDYKOWANE_WYTWORCY |
|---|---|---|---|
| Z.10 | 51, 50, 67N, **81U**, ZS, 50BF, 79, SCO, SPZ/SCO | niedopuszczone (`W052`) | niedopuszczone (`W052`) |
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
(jedyne miejsce progów). Niezgodności walidatora: `W053` generacja zasilana z pola
odbiorczego, `W054` odbiory za polem dedykowanym, `W055` SCO w polu z generacją, `W056` SPZ
w polu dedykowanym, `W057` brak rdzenia rozliczeniowego, gdy pomiar AJEE jest wymagany
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
łączeniowych), położenia aparatów z menu aparatu (Z.10 stały: Q1 „Zamknij", Q8 „Otwórz";
Z.11.1: Q0 „Otwórz", Q1 „Uziem", Q5 „Zamknij"), „Otwórz łącznik" z menu wyłącznika pola
zajętego. Katalog: `docs/uiux/zrzuty/ux04-pole-liniowe/`. Zrzut kanwy jest PRZYCIĘTY do obrysu
uchwytów wszystkich aparatów pola z marginesem na oznaczenia i podpis pola (`kadrPola` w specu)
— pokazuje pole, nie cały ekran aplikacji.
Każdy zrzut kanwy kadruje SWOJE pole ścieżką projektanta: natywny klik w aparat (zaznacza
pole), „Dopasuj do… → Pole" — pole na środku kanwy, sąsiedzi pod kurtyną kadru; spec
sprawdza, że aparat celu nie leży pod kurtyną i że żaden zrzut nie jest bajtowo identyczny
z innym. Przed każdą operacją z menu spec wraca do „Dopasuj do… → Sieć" (kadr bez kurtyny):
sam „Dopasuj widok" kadruje zakres pracy, czyli zaznaczenie, a po kreatorze magistrali
zaznaczony zostaje nowy odcinek. Zrzuty Z.11.1 powstają w osobnym projekcie „Pole liniowe
Z.11.1 …" (nagłówek aplikacji nazywa wykonanie pola ze zrzutu); zrzuty Z.10 — w projekcie
„Pole liniowe Z.10 …".

Naprawy z oględzin zrzutów roboczych (2026-10-29): akcja z menu obiektu kanwy najpierw
zaznacza OBIEKT AKCJI ścieżką lewego kliku (`SldCanvasV3Workspace.handleContextMenuAction`) —
wcześniej „Otwórz kartę pola" z menu wyłącznika zostawiała w inspektorze poprzednio
zaznaczony odcinek, a po pierwszej naprawie — aparat `…::dev::1` obok karty pola. Akcja stanu
łącznika zaznacza aparat, każda inna akcja menu aparatu (okno pola, wyposażenie, przekładniki,
zabezpieczenia, ogranicznik) — pole; rozstrzyga to ten sam klasyfikator, którym wykonawca
wybiera ścieżkę akcji (`wykonawcaAkcjiMenu`), przypięty testem `menuObiektuZaznacza.test.tsx`
(rodzaj obiektu × akcja nawigacyjna / stanu × zaznaczenie i inspektor). Formularz operacji
otwarty pozycją menu nie jest już zastępowany oknem technicznym przez synchronizację selekcji
(`useUrlSelectionSync.ts::formularzOperacjiWToku`, jedno źródło dla gałęzi nieudanej
i udanej kanonikalizacji): „Wyprowadź ciąg główny SN" z menu GPZ otwierał kreator magistrali,
który efekt kanonikalizacji zaznaczenia (nazwa = ref → nazwa publiczna) zaraz zastępował oknem
GPZ (pomiar e2e: dwie zmiany powierzchni w jednym zatwierdzeniu, kreator niewidoczny); test
`useUrlSelectionSync.test.tsx` — selekcja kanoniczna × niekanoniczna × cel bez okna / z oknem.
Podpis aparatu kolumny odgałęzienia stoi w pasie podpisów na prawo od CAŁEGO podstosu
odgałęzienia (kolumna + aparaty boczne), tam gdzie plan go rezerwuje — w polu GPZ i w polu
stacji (`compose/gpz.ts`, `compose/station.ts`; test `torZPortowStacjaGpz.test.ts`, iniekcja
dawnej kotwicy przy własnym symbolu — czerwony w obu kompozytorach); karta pola ma jedną kolumnę (schemat pola na górze, sekcje na pełną
szerokość) zamiast dwóch kolumn wg progu okna, tabela ocen funkcji ma szerokości kolumn
z treści; dane przyjęte wyposażenia są jedną adnotacją na wspólny powód i jakość (ZASADA
NR 4 pkt 4), z nazwami wszystkich aparatów.

Kanwa nie „przykleja się" do myszy po menu kontekstowym (defekt znaleziony w biegu e2e
zrzutów, 2026-10-29). Prawy klik wpisywał wskaźnik do mapy przeciągania kanwy, a menu
otwierało się pod kursorem i przejmowało `pointerup`. Przez to każdy ruch myszy bez przycisku
przesuwał widok aż do następnego kliku, a projektant po wyborze pozycji z menu aparatu tracił
kadr.

Pomiar z dziennika akcji kamery: `pan` przy ruchu myszy 58 ms przed klikiem, przy
`buttons = 0`. Naprawa jest w `SldCanvasV3.tsx`: `zwolnijWskaznik` to jedno źródło końca
gestu, które obsługuje

- `pointerup`/`pointercancel` na kanwie i na oknie,
- ruch bez wciśniętego przycisku,
- prawy przycisk, który nie zaczyna przeciągania.

Test `przeciaganieKanwy.test.tsx` to pierwszy test DOM pan/pinch. Iloczyn: przycisk ×
koniec gestu × ruch bez przycisku. Iniekcja dawnej obsługi czerwieni 8 komórek. Spec
zrzutów po każdej akcji menu sprawdza natywnie, że ruch myszy nie przesuwa widoku
(iniekcja: oba testy czerwone). Każdy natywny klik w punkt jest weryfikowany skutkiem, bez
ponowienia.

| Plik (`-ciemny` / `-jasny`) | Co pokazuje |
|---|---|
| `pole-z10-trojpolozeniowy-zamkniete` | pole Z.10 zajęte kablem: Q1 trójpołożeniowy i Q0 zamknięte (kafle `#C62828`), T1, PF1, GK, T2 bez kafli |
| `pole-z10-staly-stan-nieznany` | pole Z.10 z wyłącznikiem stałym po zmianie szablonu: odłącznik Q1 i uziemnik Q8 bez rekordu położenia — kafel szary `#6B7280` ze znakiem „?", Q0 zamknięty |
| `pole-z10-wylacznik-zamkniety-uziemnik-otwarty` | to samo pole po ustawieniu położeń z menu aparatu: Q1 i Q0 zamknięte (czerwone), uziemnik Q8 otwarty (zielony `#2E7D32`) |
| `pole-z10-zblizenie` (tylko ciemny) | zbliżenie kamery kółkiem na wyłącznik pola stałego (szczegół LOD z kamery) |
| `pole-z10-wylacznik-otwarty` | pole zajęte po „Otwórz łącznik" z menu wyłącznika: Q0 otwarty (zielony), Q1 zamknięty |
| `pole-z11-1-wylacznik-otwarty-uziemiony` | pole Z.11.1: Q0 otwarty (zielony), Q1 trójpołożeniowy uziemiony (czerwony, nóż na zestyku uziemiającym), Q5 zamknięty; PF0 przy szynie, odgałęzienie Q5 → GK1 → T3 za wyłącznikiem |
| `okno-pola-z10-trojpolozeniowy`, `okno-pola-z10-staly-z-odlacznikiem`, `okno-pola-z11-1-trojpolozeniowy` | okno pola (wycinek sceny kanwy) z oceną klasy i stanem obiektu |

## 7a. Odejścia kilku odgałęzień z pól jednej stacji (routing pól na schemacie)

Znalezisko z `frontend/src/ui/sld/v3/scene/__tests__/buildScene.p1Recenzja.test.ts` („2.
odgałęzienie tej samej stacji krzyżuje się z czymś", dotąd raport liczbą bez asercji) jest
naprawione u źródła i zamienione na asercję zera w iloczynie trzech topologii po ~106 stacji ×
L0/L1/L2. Pomiar przed naprawą (sieć referencyjna 52 stacji z `appendLateralBranch`): +1
odgałęzienie — 2 skrzyżowania (`crossingCount`) i 1 przecięcie szyny SN; +2 odgałęzienia —
3–4 skrzyżowania i 3 przecięcia szyny; po naprawie 0 we wszystkich 24 fixturach `*.enm.json`
i we wszystkich topologiach syntetycznych na trzech poziomach szczegółu. Inwentarz klasy (pięć
instancji tego samego mechanizmu „kilka kabli z jednej stacji w jednej szczelinie"):

| # | Instancja | Naprawa (plik) |
|---|---|---|
| 1 | jeden poziom odejścia dla wszystkich pól odgałęźnych stacji: poziome odcinki odejść współliniowe, pion pola bliższego szczelinie przez poziom pola dalszego | zagnieżdżone sub-poziomy strefy zejść, pole najbliżej szczeliny najwyżej (`scene/buildScene.ts::departureLevelYOf`); jedno źródło liczby poziomów wiersza dla rezerwacji wysokości i korytarza międzystacyjnego (`layout/bands.ts::departureStripExtraHeight`, `BandsResult.departureLevels`); jeden i dwa poziomy mieszczą się w dotychczasowej strefie 6×GRID, trzeci i kolejne dokładają po GRID |
| 2 | port odejścia i podpis odgałęzienia („⟨nazwa linii⟩ · odg. ⟨kod⟩") przydzielane po KOLEJNOŚCI ciągów zamiast po polu startowym ciągu | `resolveBranchOrigin` wybiera port po `startingBayRef` (pomiar: 100% ciągów odgałęźnych wszystkich fixtur ma `startingBayRef` wskazujące pole odgałęźne); ciąg bez takiego pola — notatka STOP zamiast cudzego portu. Podpis: `compose/directions.ts::przypiszOdgalezieniaPolom` daje polu gałąź o `starting_bay_ref` równym jego `bayRef`; gałąź bez pola startowego wśród pól odgałęźnych stacji bierze pozostałe pole w kolejności ciągów (reguła §9 dla danych bez pola startowego). Przed naprawą odwrócenie kolejności ciągów stacji przenosiło nazwę linii na sąsiednie pole, a różna szerokość podpisu przesuwała kolumnę transformatora o 56 px |
| 3 | na L0 wszystkie odgałęzienia stacji z jednego punktu (środek symbolu zbiorczego) | porty rozstawione co GRID wokół osi symbolu (`collapsedBranchPortX`), notatka STOP, gdy nie mieszczą się w symbolu |
| 4 | rząd źródeł strony nN stał ZA całym blokiem stacji, więc jego szyna przechodziła pod polem na prawo od transformatora, a kabel tego pola ją przecinał (węzeł T łączący kabel SN z rzędem nN) | rząd DER za ostatnią kolumną portu nN, kolumny dalej przesunięte o grupę nN (`layout/measure.ts::nnGroupFlushX`, `zarezerwujGrupeNn`; ta sama funkcja w pomiarze szerokości i w kompozycji) |
| 5 | pion lateralu głębszego przechodził przez kolumnę 0 wiersza płytszego tej samej szczeliny (degeneracja c `insertColumnChannels`, przez szynę SN pierwszej stacji) | laterale jednej szczeliny komponowane od kanału skrajnego prawego, wiersz płytszy odsunięty za piony głębszych z prześwitem kabli równoległych (`kolejnoscKompozycjiLateralow`, `przesuniecieZaGlebszymiKanalami`) |

Także wachlarz zejść pól GPZ na L0 (`scene/buildScene.ts::composeCollapsedGpz`) — poziomy wachlarza malejąco wg odległości
portu od osi, blok GPZ nad aparatami wszystkich pól: zero węzłów `#descent#tee` (było 1 na
`gpzProtectionDataPath`). Fixtura syntetyczna `appendLateralBranch` dopisywała zacisk pola do
`bus_refs` stacji (fałszywa druga sekcja; backend nie robi tego w żadnej operacji, 0 z 54 stacji
fixtur) — poprawiona. Testy: `scene/__tests__/buildScene.odejsciaZagniezdzone.test.ts` (topologia ×
liczba odgałęzień × LOD, tożsamość przy zamianie kolejności ciągów — rysunek i podpisy równe po
zastąpieniu kodu stacji jej identyfikatorem, bo adapter numeruje stacje S01… w kolejności przejścia
ciągów — rząd nN × pole za TR, wachlarz GPZ, rezerwacja wysokości), iloczyn przypisania podpisów
w `compose/__tests__/directions.test.ts` (kolejność ciągów × pole startowe wskazane / puste /
wskazane dla jednego ciągu) i asercje w `buildScene.p1Recenzja.test.ts`. Iniekcje (sonda na kopii
drzewa, sieć referencyjna z +1/+2 odgałęzieniami × L0–L2): cofnięcie instancji 1 — 36 skrzyżowań
i 24 nakładania, instancji 2 (port) — 24 kropki T między odgałęzieniami stacji, instancji 2
(podpis) — 2 rozbieżności tożsamości, instancji 3 — 6 skrzyżowań i 8 nakładań, instancji 4 —
8 węzłów T w stacji i 4 osie wyłączników pod szyną rzędu nN, instancji 5 — 2 skrzyżowania
i 24 degeneracje c, wachlarza GPZ — 3 węzły `#descent#tee`; stan naprawiony — wszystko 0.
Wzór rezerwacji wysokości (`departureStripExtraHeight`) pilnują testy jednostkowe pasm: jego
cofnięcie nie daje kolizji na żadnej z sieci testowych (także przy +4 odgałęzieniach), bo
rezerwacja chroni prześwit `DEPARTURE_STRIP_BOTTOM_CLEARANCE` do pasma nazw, którego żadna
wyrocznia sceny nie mierzy.

Kropki węzłów T na przecięciu pionu odgałęzienia z korytarzem magistrali innej pary stacji to
przyjęty projekt S7-P2 (`docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`, rozstrzygnięcie zarządcy) —
nie są skutkiem tej klasy.

## 8. Ograniczenia i wymagania przekazane dalej

- **Do decyzji rysunkowej (B-02): podpisy zejść kilku odgałęzień jednej szczeliny.** Podpis
  kabla zejścia („S11 ↔ S181 · YAKXS 3×120/16 · Un=20 kV · l = 95 m", obrócony o 90°, w pasie
  zejść pod magistralą) stoi zawsze po lewej własnego pionu — `scene/buildScene.ts:5292` nie
  podaje `leftClearance`/`rightClearance`, więc `layout/labels.ts::resolveSegmentLateralLabel`
  (linia 491) wybiera slot 1 bez sprawdzenia sąsiedztwa. Piony odgałęzień tej samej szczeliny
  stoją co `LATERAL_CHANNEL_STEP = GRID` (`scene/buildScene.ts:429`), a blok podpisu ma 17 px +
  prześwit GRID, więc między dwoma pionami nie mieści się żaden podpis. Pomiar na sieci
  referencyjnej na L2 po tej karcie: +1 i +2 odgałęzienia — 0 kolizji podpisu z kablem, ale
  silnik etykiet odrzuca 1 i 2 podpisy zejść (notatka `label.declutter`, audyt §3 D2); +3 — 3
  kolizje podpisu z kablem, +4 — 4 (przed kartą +3 dawało 5 kolizji i 6 skrzyżowań). Usunięcie
  wymaga wyboru konwencji rysunku: odstęp pionów jednej szczeliny dopasowany do grubości podpisu
  albo podpisy pośrednich pionów w slocie 3 z odnośnikiem (który przecina sąsiednie piony) —
  to decyzja werdyktu wizualnego, nie geometrii odejść.

- **Do decyzji architekta (rysunek strony nN stacji wielotransformatorowej):** stacja z polem SN
  między dwoma polami transformatorowymi rysuje jeden wspólny zacisk nN (`#lv-bus`) pod tym polem
  — decyzja „jedna domena nN stacji = jeden zacisk" (`compose/station.ts`, komentarz „Multi-TR"
  przy budowie zacisku; `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`). Kabel pola leżącego między
  transformatorami przecina wtedy szynę nN (sonda: 1 przecięcie z szyną w punkcie (9080, 3488)
  sieci syntetycznej z drugim polem TR za polem odgałęźnym). Żadna z 24 fixtur nie ma stacji
  z dwoma kolumnami portu nN; układ jest osiągalny przez jawną listę `sn_fields` albo
  `add_sn_bay` z rolą transformatorową po polu liniowym. Usunięcie przecięcia wymaga wyboru
  rysunku (kolejność kolumn albo osobne zaciski nN dla transformatorów o różnych szynach nN
  `Transformer.lv_bus_ref`) — to decyzja kontraktu projekcji nN i werdyktu wizualnego (B-02),
  nie geometrii odejść.

- **Wymaganie dla karty UX-04/LOGIKA-LACZENIOWA — telemechanika pola „Linia SN z generacją"**
  (katalog sygnałów ENEA, sekcja „Linia SN z generacją"; pole klasy mieszanej albo
  dedykowanej): pomiary U1–U3, U12, U23, U31, f, tgφ, cosφ (wymagają przekładnika napięciowego
  od strony linii — klasa z generacją dopuszcza wyłącznie Z.11.1 i Z.11); telesygnalizacja
  zadziałań f< / f> / df/dt, U< / U>, kontroli synchronizmu, „Pomiar energii – uszkodzenie –
  podstawowy / rezerwowy"; sygnał OWG [KS; Zeszyt 1 §26.10.4]; sterowania i stany >NZ / blNZ,
  >SYN / blSYN. Ten wzorzec niesie klasę pola i funkcje EAZ, NIE niesie listy sygnałów
  telemechaniki — jej model i ekran należą do logiki łączeniowej.
- Operacja `set_bay_equipment` w trybie `szablon` NIE ustawia położeń łączników (stan żyje na
  rekordzie aparatu i na gałęzi), więc po zmianie wykonania odłącznik i uziemnik pokazują kafel
  „stan nieustalony" do czasu ustawienia położenia — zachowanie uczciwe, nie zaślepka. Pisarz
  położenia łącznika pola bez gałęzi istnieje (`set_bay_apparatus_position`, §1 pkt 8);
  walidacja łączeń na topologii wynikowej (blokady wzajemne) — karta UX-04/LOGIKA-LACZENIOWA.
- Rozdzielnica 110 kV (pole WN, transformator) bez zmian — granica karty.
- Pola transformatorowe, pomiaru napięcia (Z.17) i sprzęgło (Z.12) — karta
  UX-04/POLA-TR-POMIAR-SPRZEGLO.
- Brak deklaracji zgodności z normą i brak werdyktu wizualnego (B-02 — właściciel).

## 9. Kompletny wzorzec pola Z.10 / Z.11.1 (uzupełnienie właściciela 2026-10-29)

Każdy szablon pola liniowego GPZ jest kompletnym wzorcem: rysunek pola, parametry aparatury
pierwotnej, profil funkcjonalny EAZ, powiązania funkcji z obwodami wtórnymi i wyłącznikiem,
sygnały, stany na schemacie i karcie pola oraz lista luk. Status weryfikacji każdej pozycji
(`obwody_wtorne_pola.StatusWeryfikacji`, nazwy PL `NAZWA_WERYFIKACJI_PL` we froncie):
**zweryfikowane na rysunku** (pozycja odczytana z rysunku Z.10 s.89 / Z.11 s.90 / Z.11.1 s.91
i porównana z danymi), **odczyt tekstu** (z tekstu Zeszytu 1 albo IRiESD, bez rysunku),
**interpretacja** (wniosek z układu rysunku albo praktyki — zawsze z uwagą, dlaczego; walidator
modelu odrzuca interpretację bez uwagi).

### 9.1. Rysunek pola (SLD)

| Pozycja | Weryfikacja | Gdzie |
|---|---|---|
| sekwencja aparatów toru głównego Z.10 (Q1/Q0/T1/PF1/GK/T2) i Z.11.1 (PF0, odgałęzienie Q5/GK1/T3 za wyłącznikiem przed T1) | zweryfikowane na rysunku | §2.1–§2.2, `bay_templates._sekwencja_pola_liniowego_gpz` |
| wykonania łączników (trójpołożeniowy / stały z odłącznikiem / wysuwny) | odczyt tekstu (Zeszyt 1 §13) | §2, `WYKONANIA_LACZNIKOW_POLA` |
| oznaczenia aparatów | interpretacja (wartość robocza DIN 40719-2, rysunki oznaczeń nie podają) | §2.1 |
| uziemnik kabla przy łączniku trójpołożeniowym — brak | odczyt tekstu (§13 druk s.24) | §2.1 |

### 9.2. Parametry aparatury pierwotnej

| Aparat | Parametr | Wartość | Weryfikacja | Nośnik |
|---|---|---|---|---|
| T1 (Z.10, Z.11.1) | przekładnia, rdzeń | 200-400/5 A, rdzeń I 15 VA 5P20 | zweryfikowane na rysunku | katalog `ct_typ_ogolny_osd_200_400_5_5p20_15va`, `BayPrimaryDevice.rdzenie` |
| T1 (Z.11) | rdzenie | I 10 VA 0,2S FS5 (rozliczenie, analizator jakości energii), II 10 VA 0,2 FS5 (regulacja), III 15 VA 5P20 (zabezpieczenia) | zweryfikowane na rysunku | katalog `ct_typ_ogolny_osd_200_400_5_5_5_z11` |
| T3 (Z.11.1) | uzwojenia | SN/√3 / 0,1/√3 ×3; I 10 VA 0,2, II 7,5 VA 0,2, III 7,5 VA 0,5/3P; bez otwartego trójkąta | zweryfikowane na rysunku | `BayPrimaryDevice.uzwojenia` |
| T2 | przekładnia przekładnika Ferrantiego | 1/100 | zweryfikowane na rysunku | NOWE pole `BayPrimaryDevice.przekladnia` (wyłącznie `CORE_BALANCE_CT`; odmowa `bay_equipment.ratio_not_applicable` dla innego rodzaju; addytywne — `None` poza odciskiem modelu i szablonu) |
| Q0 | prąd wyłączalny, czas własny | z karty pozycji katalogowej aparatu; brak w karcie — wartość robocza z rejestru (`network_model/catalog/wartosci_robocze.py`, profil 0,060 s, jakość `ESTIMATED`) | odczyt tekstu (karta producenta / rejestr) | `SwitchEquipmentType` (`types.py:1770`), `break_time_s` (`types.py:3362`) |
| Q0 | napęd | silnikowy (sterowanie zdalne ZW/OW) | zweryfikowane na rysunku | `ObwodyWtornePola.naped_wylacznika`; katalog wyłączników NIE ma pola napędu — luka L1 (§9.6) |
| PF0, PF1 | wskaźnik napięcia | pojemnościowy, bez parametrów na rysunku | zweryfikowane na rysunku | `VOLTAGE_INDICATOR` |

### 9.3. Profil funkcjonalny EAZ

Dane: `bay_templates.profil_eaz_szablonu` (w odpowiedzi `GET /api/catalog/bay-templates` pole
`profil_eaz`), słownik funkcji `network_model/catalog/funkcje_eaz.py`, zestaw rysunku
`BayTemplate.funkcje_eaz`, wymogi klas `WYMAGANIA_EAZ_KLASY_POLA`. Wymagalność funkcji w profilu (pole `wymagalnosc` — kategoria wzorca, nie werdykt oceny):
**obowiązkowa** — wymagana (albo z rysunku) w każdej klasie dopuszczonej dla wykonania;
**opcjonalna** — w każdej klasie dopuszczalna, na żądanie OSD albo nie występuje;
**wariantowa** — wymóg zależy od klasy pola. Kolumny klas: wymóg w tej klasie (`OBOWIAZKOWA`,
`WG_RYSUNKU` — w zestawie rysunku, klasa jej nie wymienia, `NAPOWIETRZNA` — SPZ w linii
napowietrznej, `DOPUSZCZALNA`, `NA_ZADANIE_OSD`, `ZAKAZANA`, `NIE_WYSTEPUJE`); „(interpr.)" —
wymóg z interpretacji (praktyka kryteriów ziemnozwarciowych 59N/Yo>/Go>, zakaz SPZ/SPZE w polu
dedykowanym). Edytor wyposażenia pola pokazuje profil wybranego szablonu
(`wyposazenie-pola-szablon-profil-eaz`, funkcja spoza rysunku nazwana „poza rysunkiem wzorca —
wymóg klasy pola", wymogi klas z podstawą w podpowiedzi). Tabele (wygenerowane z danych
repozytorium, wykonanie łączników trójpołożeniowe; pozostałe wykonania mają ten sam profil):

#### Z10

| Kod | Funkcja | Wymagalność | Na rysunku | ODBIORCZE | MIESZANE | DEDYKOWANE_WYTWORCY |
|---|---|---|---|---|---|---|
| 51 | I> (51) — nadprądowe zwłoczne | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 50 | I>> (50) — nadprądowe zwarciowe (bezzwłoczne) | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 67N | Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0) | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| ZS | ZS — współpraca z logicznym zabezpieczeniem szyn (sygnał blokowania ZS) | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 50BF | LRW (50BF) — lokalna rezerwa wyłącznikowa | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 79 | SPZ (79) — samoczynne ponowne załączenie (wielokrotne, programowalne, z blokadą) | WARIANTOWA | tak | NAPOWIETRZNA | niedopuszczone | niedopuszczone |
| SCO | SCO — samoczynne częstotliwościowe odciążenie | OPCJONALNA | tak | DOPUSZCZALNA | niedopuszczone | niedopuszczone |
| SPZ/SCO | SPZ po SCO — samoczynne ponowne załączenie po odciążeniu częstotliwościowym | OPCJONALNA | tak | NA_ZADANIE_OSD | niedopuszczone | niedopuszczone |
| 81U | f< (81U) — podczęstotliwościowe | OBOWIAZKOWA | nie | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 59N | U0> (59N) — nadnapięciowe zerowe (napięcie 3U0 z otwartego trójkąta) | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | niedopuszczone | niedopuszczone |
| Yo> | Yo> — ziemnozwarciowe admitancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | niedopuszczone | niedopuszczone |
| Go> | Go> — ziemnozwarciowe konduktancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | niedopuszczone | niedopuszczone |

#### Z11_1

| Kod | Funkcja | Wymagalność | Na rysunku | ODBIORCZE | MIESZANE | DEDYKOWANE_WYTWORCY |
|---|---|---|---|---|---|---|
| 51 | I> (51) — nadprądowe zwłoczne | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 50 | I>> (50) — nadprądowe zwarciowe (bezzwłoczne) | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 67 | I> kierunkowe (67) — nadprądowe kierunkowe (blokada kierunkowa — przepływ mocy w stronę szyn) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NIE_WYSTEPUJE |
| 67N | Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0) | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 27 | U< (27) — podnapięciowe (przekładniki od strony linii) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 59 | U> (59) — nadnapięciowe (przekładniki od strony linii) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 81U | f< (81U) — podczęstotliwościowe | WARIANTOWA | tak | OBOWIAZKOWA | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 81O | f> (81O) — nadczęstotliwościowe | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 81R | df/dt (81R) — szybkość zmian częstotliwości (ROCOF) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| ZS | ZS — współpraca z logicznym zabezpieczeniem szyn (sygnał blokowania ZS) | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 50BF | LRW (50BF) — lokalna rezerwa wyłącznikowa | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 79 | SPZ (79) — samoczynne ponowne załączenie (wielokrotne, programowalne, z blokadą) | WARIANTOWA | tak | NAPOWIETRZNA | NAPOWIETRZNA | ZAKAZANA (interpr.) |
| SPZE | SPZE — samoczynne ponowne załączenie z czasem tE (rozwinięcia skrótu standard nie podaje) | WARIANTOWA | tak | WG_RYSUNKU | WG_RYSUNKU | ZAKAZANA (interpr.) |
| OWG | OWG — wyłączenie pól z generacją (od zabezpieczeń transformatora i przed SZR) | OBOWIAZKOWA | tak | WG_RYSUNKU | WG_RYSUNKU | WG_RYSUNKU |
| NZ | blokada NZ — blokada załączenia przy napięciu w linii (napięcie zwrotne) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| SCO | SCO — samoczynne częstotliwościowe odciążenie | WARIANTOWA | tak | DOPUSZCZALNA | ZAKAZANA | ZAKAZANA |
| SPZ/SCO | SPZ po SCO — samoczynne ponowne załączenie po odciążeniu częstotliwościowym | WARIANTOWA | tak | NA_ZADANIE_OSD | ZAKAZANA | ZAKAZANA |
| 59N | U0> (59N) — nadnapięciowe zerowe (napięcie 3U0 z otwartego trójkąta) | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| Yo> | Yo> — ziemnozwarciowe admitancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| Go> | Go> — ziemnozwarciowe konduktancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| 32 | P> (32) — kierunkowe mocy czynnej (od skutków mocy zwrotnej) | OPCJONALNA | nie | NIE_WYSTEPUJE | NA_ZADANIE_OSD | NA_ZADANIE_OSD |

#### Z11

| Kod | Funkcja | Wymagalność | Na rysunku | ODBIORCZE | MIESZANE | DEDYKOWANE_WYTWORCY |
|---|---|---|---|---|---|---|
| 51 | I> (51) — nadprądowe zwłoczne | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 50 | I>> (50) — nadprądowe zwarciowe (bezzwłoczne) | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 67 | I> kierunkowe (67) — nadprądowe kierunkowe (blokada kierunkowa — przepływ mocy w stronę szyn) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NIE_WYSTEPUJE |
| 67N | Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0) | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 27 | U< (27) — podnapięciowe (przekładniki od strony linii) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 59 | U> (59) — nadnapięciowe (przekładniki od strony linii) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 81U | f< (81U) — podczęstotliwościowe | WARIANTOWA | tak | OBOWIAZKOWA | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 81O | f> (81O) — nadczęstotliwościowe | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| 81R | df/dt (81R) — szybkość zmian częstotliwości (ROCOF) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| ZS | ZS — współpraca z logicznym zabezpieczeniem szyn (sygnał blokowania ZS) | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 50BF | LRW (50BF) — lokalna rezerwa wyłącznikowa | OBOWIAZKOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
| 79 | SPZ (79) — samoczynne ponowne załączenie (wielokrotne, programowalne, z blokadą) | WARIANTOWA | tak | NAPOWIETRZNA | NAPOWIETRZNA | ZAKAZANA (interpr.) |
| SPZE | SPZE — samoczynne ponowne załączenie z czasem tE (rozwinięcia skrótu standard nie podaje) | WARIANTOWA | tak | WG_RYSUNKU | WG_RYSUNKU | ZAKAZANA (interpr.) |
| OWG | OWG — wyłączenie pól z generacją (od zabezpieczeń transformatora i przed SZR) | OBOWIAZKOWA | tak | WG_RYSUNKU | WG_RYSUNKU | WG_RYSUNKU |
| NZ | blokada NZ — blokada załączenia przy napięciu w linii (napięcie zwrotne) | WARIANTOWA | tak | WG_RYSUNKU | NA_ZADANIE_OSD | NA_ZADANIE_OSD |
| SCO | SCO — samoczynne częstotliwościowe odciążenie | WARIANTOWA | tak | DOPUSZCZALNA | ZAKAZANA | ZAKAZANA |
| SPZ/SCO | SPZ po SCO — samoczynne ponowne załączenie po odciążeniu częstotliwościowym | WARIANTOWA | tak | NA_ZADANIE_OSD | ZAKAZANA | ZAKAZANA |
| 59N | U0> (59N) — nadnapięciowe zerowe (napięcie 3U0 z otwartego trójkąta) | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| Yo> | Yo> — ziemnozwarciowe admitancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| Go> | Go> — ziemnozwarciowe konduktancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| 32 | P> (32) — kierunkowe mocy czynnej (od skutków mocy zwrotnej) | OPCJONALNA | nie | NIE_WYSTEPUJE | NA_ZADANIE_OSD | NA_ZADANIE_OSD |

#### Obwody Z10 — ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, Z.10 s.89; napęd SILNIKOWY (ZWERYFIKOWANE_NA_RYSUNKU)

| Funkcja | Blok rysunku | Wejścia | Wyjścia | Wyłącznik | Weryfikacja | Uwaga |
|---|---|---|---|---|---|---|
| 51 | I> t1 | RDZEN_CT T1/1 | OW1, OW2 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50 | I>> t2 | RDZEN_CT T1/1 | OW1, OW2 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 67N | Zab. ziemnozwarciowe (kierunkowe) t1, t2 | PRZEKLADNIK_FERRANTIEGO T2/None, sygnał Z, Zz | OW1, OW2, Blok. ZW | Q0 | INTERPRETACJA | wyjścia OW1, OW2 z komórek t1, t2 — linie widoczne na rysunku; „Blok. ZW” wychodzi z nieopisanej komórki bloku zabezpieczenia ziemnozwarciowego — przypisanie tej funkcji jest interpretacją |
| ZS | ZS | RDZEN_CT T1/1 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50BF | LRW | RDZEN_CT T1/1 (interpr.) | OW1, OW2, Pobudzenie LRW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 79 | SPZ tSPZ | sygnał Odstawienie SPZ | ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| SCO | Sterownik pola | sygnał SCO1, sygnał SCO2 | OW1, OW2 | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| SPZ/SCO | Sterownik pola | sygnał SCO/SPZ | ZW | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |

Sygnały: Blok. ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW1 (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW2 (WYJSCIE, WYLACZNIK, INTERPRETACJA); Odstawienie SPZ (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Topologia (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Zasilanie (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); SSiN (WYJSCIE, NADRZEDNY, INTERPRETACJA); Łącze inżynierskie (WYJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); +AwUp (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Up (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Aw (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Al (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); SCO1 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO2 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO/SPZ (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); UL1, UL2, UL3, N (WEJSCIE, OKREZNY, INTERPRETACJA); Pobudzenie LRW (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Blokowanie ZS (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Z, Zz (WEJSCIE, OKREZNY, INTERPRETACJA)

Obwody przekładników poza EAZ: 

#### Obwody Z11_1 — ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, Z.11.1 s.91; napęd SILNIKOWY (ZWERYFIKOWANE_NA_RYSUNKU)

| Funkcja | Blok rysunku | Wejścia | Wyjścia | Wyłącznik | Weryfikacja | Uwaga |
|---|---|---|---|---|---|---|
| 51 | I> t1 | RDZEN_CT T1/1 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50 | I>> t2 | RDZEN_CT T1/1 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 67N | Zab. ziemnozwarciowe (kierunkowe) t1, t2 | PRZEKLADNIK_FERRANTIEGO T2/None, sygnał Z, Zz | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| ZS | ZS (kierunkowe I>) | RDZEN_CT T1/1 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50BF | LRW | RDZEN_CT T1/1 (interpr.) | OW1, Pobudzenie LRW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 79 | SPZ tSPZ | sygnał Odstawienie SPZ | ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| SCO | Sterownik pola | sygnał SCO1, sygnał SCO2 | OW1 | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| SPZ/SCO | Sterownik pola | sygnał SCO/SPZ | ZW | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| 67 | ZS (kierunkowe I>) | RDZEN_CT T1/1 (interpr.), UZWOJENIE_VT T3/3 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 27 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 59 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81U | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81O | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81R | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| NZ | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.9.3 i §26.10.3 nazywają blokadę załączenia od napięcia zwrotnego; rysunek realizuje ją blokiem U>/U< z wyjściem „Blok. ZW” (napięcie po stronie linii przy otwartym wyłączniku blokuje załączenie) |
| SPZE | SPZE tE | sygnał Wył. od zab. TR | ZW | Q0 | INTERPRETACJA | rysunek doprowadza „Wył. od zab. TR” do bloku SPZE tE; ponowne załączenie po czasie tE — wniosek z nazwy bloku (rozwinięcia skrótu SPZE standard nie podaje) |
| OWG | SPZE tE | sygnał Wył. od zab. TR | OW1 | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.10.4 — wyłączenie pól z generacją od zabezpieczeń transformatora; rysunek prowadzi to wejście do bloku SPZE, a wyjście bloku do obwodu OW1 |

Sygnały: Blok. ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW1 (WYJSCIE, WYLACZNIK, INTERPRETACJA); Odstawienie SPZ (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Topologia (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Zasilanie (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); SSiN (WYJSCIE, NADRZEDNY, INTERPRETACJA); Łącze inżynierskie (WYJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Wył. od zab. TR (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); +AwUp (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Up (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Aw (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Al (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); SCO1 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO2 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO/SPZ (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); UL1, UL2, UL3, N (WEJSCIE, OKREZNY, INTERPRETACJA); Pobudzenie LRW (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Blokowanie ZS (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Z, Zz (WEJSCIE, OKREZNY, INTERPRETACJA)

Obwody przekładników poza EAZ: T3/1 → niepodłączone na rysunku (ZWERYFIKOWANE_NA_RYSUNKU); T3/2 → niepodłączone na rysunku (ZWERYFIKOWANE_NA_RYSUNKU)

#### Obwody Z11 — ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, Z.11 s.90; napęd SILNIKOWY (ZWERYFIKOWANE_NA_RYSUNKU)

| Funkcja | Blok rysunku | Wejścia | Wyjścia | Wyłącznik | Weryfikacja | Uwaga |
|---|---|---|---|---|---|---|
| 51 | I> t1 | RDZEN_CT T1/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50 | I>> t2 | RDZEN_CT T1/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 67N | Zab. ziemnozwarciowe (kierunkowe) t1, t2 | PRZEKLADNIK_FERRANTIEGO T2/None, sygnał Z, Zz | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| ZS | ZS (kierunkowe I>) | RDZEN_CT T1/3 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50BF | LRW | RDZEN_CT T1/3 (interpr.) | OW1, Pobudzenie LRW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 79 | SPZ tSPZ | sygnał Odstawienie SPZ | ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| SCO | Sterownik pola | sygnał SCO1, sygnał SCO2 | OW1 | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| SPZ/SCO | Sterownik pola | sygnał SCO/SPZ | ZW | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| 67 | ZS (kierunkowe I>) | RDZEN_CT T1/3 (interpr.), UZWOJENIE_VT T3/3 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 27 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 59 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81U | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81O | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81R | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| NZ | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.9.3 i §26.10.3 nazywają blokadę załączenia od napięcia zwrotnego; rysunek realizuje ją blokiem U>/U< z wyjściem „Blok. ZW” (napięcie po stronie linii przy otwartym wyłączniku blokuje załączenie) |
| SPZE | SPZE tE | sygnał Wył. od zab. TR | ZW | Q0 | INTERPRETACJA | rysunek doprowadza „Wył. od zab. TR” do bloku SPZE tE; ponowne załączenie po czasie tE — wniosek z nazwy bloku (rozwinięcia skrótu SPZE standard nie podaje) |
| OWG | SPZE tE | sygnał Wył. od zab. TR | OW1 | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.10.4 — wyłączenie pól z generacją od zabezpieczeń transformatora; rysunek prowadzi to wejście do bloku SPZE, a wyjście bloku do obwodu OW1 |

Sygnały: Blok. ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW1 (WYJSCIE, WYLACZNIK, INTERPRETACJA); Odstawienie SPZ (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Topologia (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Zasilanie (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); SSiN (WYJSCIE, NADRZEDNY, INTERPRETACJA); Łącze inżynierskie (WYJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Wył. od zab. TR (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); +AwUp (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Up (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Aw (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Al (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); SCO1 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO2 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO/SPZ (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); UL1, UL2, UL3, N (WEJSCIE, OKREZNY, INTERPRETACJA); Pobudzenie LRW (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Blokowanie ZS (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Z, Zz (WEJSCIE, OKREZNY, INTERPRETACJA)

Obwody przekładników poza EAZ: T1/1 → układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii (ZWERYFIKOWANE_NA_RYSUNKU); T1/2 → układy regulacyjne (ZWERYFIKOWANE_NA_RYSUNKU); T3/1 → układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii (ZWERYFIKOWANE_NA_RYSUNKU); T3/2 → układy regulacyjne (ZWERYFIKOWANE_NA_RYSUNKU)

Obwody wtórne (dane: `network_model/catalog/obwody_wtorne_pola.py::OBWODY_WTORNE_WYKONANIA_POLA`,
`BayTemplate.obwody_wtorne`, w odpowiedzi szablonów pole `obwody_wtorne`): tabele „Obwody"
powyżej podają dla każdej funkcji blok rysunku, wejścia (rdzeń CT / uzwojenie VT / przekładnik
Ferrantiego / sygnał), wyjścia do wyłącznika i status. Wiersze funkcji prądowych (51, 50, 67,
67N, ZS, 50BF) i napięciowych (27, 59, 81U, 81O, 81R) są w danych i w ocenie pola; wycinek
wyżej pokazuje wiersze z sygnałami.

### 9.4. Powiązania funkcji jako dane — reguły walidatora wzorca

`BayTemplate` przy imporcie modułu sprawdza (`bay_templates._sprawdz_obwody_wtorne`, testy
`backend/tests/network_model/catalog/test_obwody_wtorne_pola.py`, 54 testy z wyrocznią tabeli
odczytu rysunku i iniekcjami): powiązania = zestaw funkcji szablonu (bez braku i bez duplikatu);
wejście wskazuje aparat właściwego rodzaju z istniejącym rdzeniem/uzwojeniem; wyłącznik
wyjścia jest wyłącznikiem; KAŻDY rdzeń CT i KAŻDE uzwojenie VT ma dokładnie jedno przeznaczenie
(funkcja EAZ albo przypisanie poza EAZ: rozliczenie, regulacja, „niepodłączone na rysunku");
wyjście do wyłącznika istnieje jako sygnał wyjściowy pola; sygnał wejściowy funkcji istnieje
jako wejście pola; brak sygnałów osieroconych. Model powiązań jest NOWY i addytywny w katalogu
szablonów — istniejący `ProtectionAssignment` (`enm/models.py:1086`: wyłącznik, CT, VT, rodzaj
urządzenia, nastawy) nie niesie numeru rdzenia ani kodu funkcji, a jego przebudowa należy do
karty nastaw (luka L3).

Ocena pola (`backend/src/enm/pole_liniowe_gpz.py::_obwody_funkcji`, front
`OcenaPolaLiniowegoGpz.tsx`, tabela `ocena-pola-liniowego-obwody`) pokazuje dla każdej funkcji
pola jej obwody z tabliczek aparatów TEGO pola (np. „rdzeń I przekładnika prądowego T1:
200-400/5, 15 VA, klasa 5P20"; aparat usunięty z pola → „brak aparatu w polu"), a pod nią sygnały
pola i napęd wyłącznika (`ocena-pola-liniowego-sygnaly`, `ocena-pola-liniowego-naped`).
Funkcja pola bez powiązania na rysunku wzorca — wiersz z jawnym zdaniem, że rysunek jej nie
rysuje.

### 9.5. Stany i sygnały na schemacie i karcie pola

- **Położenia łączników** — kafle stanu na kanwie, w oknie pola, w eksporcie i inspektorze (§1
  pkt 7, §10).
- **Funkcje automatyki SPZ / SCO / LRW / NZ / OWG** — plakietki przy polu z kodów funkcji pola
  (`v2/canvas/canonicalGpzModel.ts::KOD_FUNKCJI_PLAKIETKI`); plakietka mówi OBECNOŚĆ funkcji
  i jawnie, że stan (aktywna / odstawiona, zablokowana) jest nieustalony — stan należy do nastaw
  zabezpieczeń (ADR-022), których model nie niesie (`application/field_read_model.py:813`
  `spz=None`). Zależność: luka L2, karta OCHRONA-ADR022-NASTAWY. Dublowanie stanu w polu modelu
  byłoby drugą prawdą obok nastaw (zakaz Core Rule #4 / ADR-022).
- **Napięcie zwrotne (Z.11.1, Z.11)** — karta pola, sekcja `ocena-pola-liniowego-napiecie-zwrotne`
  (`pole_liniowe_gpz.py::_napiecie_zwrotne`): co mierzy napięcie po stronie linii (uzwojenie III
  T3), czy pole ma blokadę NZ, czy za polem są źródła (napięcie zwrotne możliwe) i stan pomiaru.
  Stan pomiaru „pod napięciem / bez napięcia" pochodzi WYŁĄCZNIE z telemetrii pola
  (`Bay.runtime_state`) przy łączności wtórnej `ok`; bez telemetrii — „nieustalony" (luka L5).

### 9.6. Luki z kartami docelowymi

| # | Luka | Miejsce | Karta docelowa |
|---|---|---|---|
| L1 | katalog wyłączników nie ma rodzaju napędu (silnikowy / ręczny) — napęd wzorca jest daną szablonu, nie pozycji katalogowej | `backend/src/network_model/catalog/types.py:1770` (`SwitchEquipmentType`), `mv_switch_catalog.py:141` (pozycje bez napędu) | UX-04/LOGIKA-LACZENIOWA (sterowanie zdalne ZW/OW) |
| L2 | stan funkcji automatyki (SPZ załączone/odstawione, zablokowane) nie istnieje w modelu | `backend/src/application/field_read_model.py:813` (`spz=None`), ADR-022 | OCHRONA-ADR022-NASTAWY |
| L3 | `ProtectionAssignment` nie wiąże funkcji z rdzeniem/uzwojeniem ani z kodem funkcji wzorca | `backend/src/enm/models.py:1086` | OCHRONA-ADR022-NASTAWY |
| L4 | składowa zerowa U0 („Z, Zz" na rysunku) pochodzi z pola pomiaru napięcia szyn (Z.17), którego wzorzec nie modeluje — wejście 67N/59N przez sygnał okrężny (interpretacja) | `obwody_wtorne_pola.py` (sygnał „Z, Zz") | POLE-ZU-SKLADOWA-ZEROWA |
| L5 | stan pomiaru napięcia zwrotnego tylko z telemetrii pola (`runtime_state`), bez niej nieustalony | `backend/src/enm/models.py:1455` | UX-04/LOGIKA-LACZENIOWA (telemechanika pola z generacją, §8) |
| L6 | rysunek Z.10 nie rysuje f< (81U), którego wymaga klasa odbiorcza IRiESD | `docs/uiux/RAPORT_ROZBIEZNOSCI_GPT_GPZ_SN_2026-10-28.md` §13 | rozbieżność standardu — do OSD (wzorzec dopisuje 81U z klasy, §4) |

## 10. Referencja HMI 2026-10-29 (rozszerzenie 5)

Źródło: trzy zdjęcia panelu sterownika polowego Elektrometal e²TANGO-600 z obiektu w ruchu
(„Brodna 1", pola P1, P3 i P6, ekran „Bank 1"), przekazane przez właściciela jako referencja
CZYTELNOŚCI STANÓW ŁĄCZENIOWYCH. Zdjęcia NIE są w repozytorium (obiekt operatora) — poniżej
wyłącznie odczyt tekstowy wykonawcy.

**Odczyt.** (1) Stan łącznika kodują trzy środki naraz: wypełniony kafel pod symbolem (czerwony
= zamknięty: 1Q1, 3Q1 na ekranie P1/P3; zielony = otwarty: 1Q2, 3Q2, 6Q2, 6Q3), geometria styku
(w osi — zamknięty, odchylony — otwarty) i biały symbol na kaflu. (2) Rodzaj aparatu jest znakiem
na styku: „×" wyłącznik (dolny 6Q2), „○" rozłącznik (1Q1, górny 6Q2), poprzeczka odłącznik
(3Q1); uziemnik to osobna gałąź z symbolem ziemi i własnym kaflem. (3) Oznaczenie aparatu stoi
duże tuż przy kaflu; stanu nie powtarza podpis. (4) Nagłówek: obiekt | pole | aktywna grupa
nastaw („Bank 1") i czas. (5) Stan automatyki tekstem: „SPZ Wdst/Zabl" (P1/P3), „SPZ Wast/Odbl"
(P6); przycisk F1 „SPZW". Funkcja ma STAN, nie tylko obecność. (6) Diody pola P6 (12 opisów,
odręcznie): A_L, A_W, (trzeci w lewej kolumnie nieczytelny — „U?"), I>, I>>, U< | U>, RNSN, U0>,
G0>, f< df/dt, P>. (7) Panel wielkości: I1–I3, U12/U23/U31, f, P. (8) Defekt referencji: dwa
różne aparaty ekranu P6 noszą to samo oznaczenie „6Q2". (9) „Bateria rozładowana" w zdarzeniach
P1/P3 to bateria akumulatorów potrzeb własnych (zasilanie pomocnicze DC), nie bateria
kondensatorów.

**Konwencja przyjęta (jedna dla kanwy, eksportu, legendy, inspektora, SLD v2).** Tabela
`STATE_COLOR` (`frontend/src/ui/sld/v3/theme/colorTokens.ts`): zamknięty `#C62828`, otwarty
`#2E7D32`, nieustalony `#6B7280` + „?", błędny `#8E44AD` + „!", glif `#FEFEFE` (biel o literale różnym od tła arkusza — eksport podmienia kolory po wartości); identyczna w obu
motywach i w eksporcie (zmienia się tło). Kontrast kafla do tła obu motywów i arkusza eksportu
≥ 3:1 (WCAG 1.4.11), glifu do kafla ≥ 4,5:1 — liczone w teście z tabeli. Stany modelu: ENM
rozróżnia położenia {zamknięty, otwarty, uziemiony (łącznik trójpołożeniowy)}, brak rekordu
i „awaria" (`stan_obiektu`/telemetria) — kafel błędny ma dostawcę (awaria rekordu), stanu
pośredniego (Dbpos intermediate) model nie niesie, więc kafla pośredniego nie ma. Geometria
styku wg QET EN 60617 (nóż wg położenia), znak rodzaju na styku z symboli QET (× wyłącznik,
○ rozłącznik, poprzeczka odłącznik). NOP = stan łącznika + znacznik `noPoint`. Oznaczenie
aparatu przy symbolu klasą etykiety `t3` (`compose/gpz.ts::KLASA_ETYKIETY_APARATU_GPZ`) na LOD
pola; podpis „stan nieznany" usunięty — stan niesie kafel, opis położenia jest w dymku symbolu.

**Inwentarz klasy „kolor stanu łącznika"** (dwie sprzeczne prawdy przed naprawą: `STATE_COLOR`
zielony = zamknięty / magenta = otwarty i ramka SCADA czerwony = zamknięty): `colorTokens.ts`
(`STATE_COLOR`, dawna `ramkaScada` skasowana), `theme/palette.ts` (`state`), `export/exportPalette.ts`,
`symbols/glyphs.tsx` (`zKafelemStanu`, `stanKaflaLacznika`, `stanKaflaPolozenia`), `compose/preview.tsx`,
`canvas/SldCanvasV3.tsx` (`kafleStanu`), `sheet/Frame.tsx` (legenda), `ui/field/SchematPolaSn.tsx`,
`v2/theme/tokens.ts` i `v2/model/stanAparatowPola.ts`, `ui/sld/shared/kartaTechnicznaElementu.ts`,
`network-build/InspectorEngineeringView.tsx`, `network-build/inspektor-elementu/PanelElementuKanwy.tsx`.
Testy przepisane do nowej konwencji z zapisaną intencją (`palette.test.ts`, `exportPalette.test.tsx`,
`colorTokens.test.ts`, `v2/theme/__tests__/{tokens,light_technical}.test.ts`, `sldCanvasV3.test.tsx`);
nowe: `kafelStanu.test.tsx` (rodzaj × stan × motyw × eksport × NOP, kontrast), `kafleStanuNaKanwie.test.tsx`
(żywa kanwa × LOD × warstwy), `stanAparatuParytetGlifu.test.tsx`, `menuStanuAparatuPola.test.tsx`
(aparat × położenie × pozycja menu).

**Funkcje automatyki ze stanem.** Plakietki SPZ/SCO/LRW/NZ/OWG z kodów funkcji pola; stan funkcji
należy do nastaw (ADR-022) — czytany z jednego miejsca, dziś nieustalony i tak oznaczony (§9.5,
luka L2, karta OCHRONA-ADR022-NASTAWY).

**Walidator: jednoznaczność oznaczeń.** `W063` (`backend/src/enm/oznaczenia_aparatow_pola.py`,
`enm/validator.py:434`, `:2212`): dwa aparaty jednego pola o tym samym oznaczeniu (porównanie
bez wielkości liter i bez spacji brzegowych, IEC 81346-1 — oznaczenie referencyjne jednoznaczne w obrębie
obiektu nadrzędnego), wyjaśnienie wg kontraktu werdyktu i akcja „nadaj aparatowi oznaczenie
unikalne w polu". Zakres: pole (oznaczenia Q0/Q1 powtarzają się w każdym polu stacji z definicji
schematu — jednoznaczność w stacji daje prefiks pola, którego model nie niesie jako oznaczenia).
Iniekcja „dwa aparaty 6Q2 w jednym polu" → `W063` (test `tests/enm/test_oznaczenia_aparatow_pola.py`).

**Porównanie zestawu funkcji z diodami pola P6.**

| Dioda P6 | Funkcja słownika | Zestaw Z.11.1 / Z.11 | Podstawa |
|---|---|---|---|
| I>, I>> | 51, 50 | obowiązkowe | rysunek s.90/s.91, IRiESD II.4.5.4.2 |
| U>, U< | 59, 27 | z rysunku | rysunek s.90/s.91 |
| f<, df/dt | 81U, 81R | z rysunku / klasa | rysunek s.90/s.91, IRiESD II.4.5.4.2.1 pkt 5 |
| U0> | 59N | opcjonalna (dopuszczalna, interpretacja) | Zeszyt 1 Z.17 s.97 (Uo> w polu pomiaru napięcia szyn); praktyka eksploatacyjna, referencja właściciela 2026-10-29 |
| G0> | Go> (konduktancyjne); także Yo> (admitancyjne) | opcjonalna (dopuszczalna, interpretacja) | IRiESD II.4.5.4.1.4 pkt 3–4, II.4.5.4.2.1 pkt 2 (kryterium wg pracy punktu neutralnego); praktyka eksploatacyjna, referencja właściciela 2026-10-29 |
| P> | 32 | na żądanie OSD w klasie z generacją, nie występuje w odbiorczej | IRiESD II.4.5.5.4 |
| A_L, A_W, RNSN, trzecia dioda lewej kolumny | — | **do potwierdzenia przez właściciela** (znaczeń nie odgadujemy) | — |

SCO w klasie z generacją: zestaw Z.11.1/Z.11 klasy mieszanej i dedykowanej NIE zawiera SCO ani
SPZ po SCO (IRiESD — zakaz SCO w liniach z generacją; profil: `ZAKAZANA`), walidator `W055`;
przypięte testami profilu (`test_obwody_wtorne_pola.py`) i zestawów klas
(`tests/enm/test_pole_liniowe_gpz_szablony.py`).

**Do potwierdzenia przez właściciela:** znaczenia diod A_L, A_W, RNSN oraz treść trzeciej diody
lewej kolumny pola P6.

## 11. Dyrektywa „POPRAWA SLD SN" 2026-10-29 — stan wykonania

| Wymaganie | Wykonanie |
|---|---|
| Z.10 i Z.11.1 jako osobne warianty | osobne szablony i osobne projekty zrzutów („Pole liniowe Z.10 …", „Pole liniowe Z.11.1 …") |
| spójność LOD, cztery warstwy, brak kolizji | kafel stanu na każdym LOD pola i w każdej warstwie (`kafleStanuNaKanwie.test.tsx`); odejścia kilku odgałęzień bez skrzyżowań (§7a) |
| kadrowanie | zrzut przycięty do obrysu aparatów pola (§7) |
| identyczna geometria w obu motywach | kolory konwencji i geometria niezależne od motywu (test palety i kafla); zmienia się tło |
| oznaczenia wg DIN 40719-2 jako wartość robocza, bez twierdzenia zgodności z ENEA | §2.1, komentarz `bay_templates.py`, konflikt UX04-OZNACZENIA-APARATOW |
| zrzuty Z.10/Z.11.1 × jasny/ciemny, zrzuty stanów | §7 |
| werdykt wizualny | NIE wystawiony — bramka B-02 u właściciela |
