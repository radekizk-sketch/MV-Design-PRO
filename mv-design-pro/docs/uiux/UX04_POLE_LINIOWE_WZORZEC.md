# UX-04/POLE-LINIOWE-WZORZEC — pole liniowe SN 15 kV GPZ wg ENEA Z.10, Z.11.1, Z.11

Karta wykonawcza programu UX-04 (`mv-design-pro/PLANS.md` część A §C.1), bez własnego statusu.
Stan: 2026-10-29 (rozszerzenie 5 — referencja HMI, dyrektywa „POPRAWA SLD SN" i uzupełnienie
właściciela o kompletny wzorzec pola, §9–§11). Werdykt wizualny wystawia właściciel (bramka B-02) — ten dokument niesie
macierz śledzenia i zrzuty do oceny, NIE werdykt i NIE deklarację zgodności z normą.

Podstawa rysunku: ENEA Operator „Stacje elektroenergetyczne 110 kV", Zeszyt 1 (wersja
02.2023-2), rysunki Z.10 (s.89) „Pole linii odpływowej SN", Z.11 (s.90) „Pole linii SN
z pomiarem rozliczeniowym energii i napięcia zwrotnego", Z.11.1 (s.91) „Pole linii SN
z pomiarem napięcia zwrotnego" i §13 „Rozdzielnia SN" (druk s.23–26). Klasa pola i funkcje EAZ:
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
| `qetThreePositionSwitch` | **złożenie** `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_07.elmt` + `91_en_60617/en_60617_02/en_60617_02_15/en_60617_02_15_01.elmt` (uziemienie obrócone o 180° nad zestykiem prawym — u góry pola, przy torze między szyną a stykiem odłączającym, jak na rysunku Z.10 s.89) | `cee8fc840450295927176ac3b938eeded5f2fcd5` + `4c1c408e1e15c304f08c67cb03a5456b941bc614` |
| `qetBreaker` | **złożenie** `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt` (wyłącznik) + `91_en_60617/en_60617_07/en_60617_07_15/en_60617_07_15_01.elmt` (napęd elektromechaniczny — cewka wyłączająca, osprzęt po prawej stronie toru; zacisk zewnętrzny = port wtórny `wylacz`, koniec linii wyłączania od przekaźnika) | `8df98b9b5c2783ea2413b406bef53ded66da628a` + `23118a6a8946dda5c1e996ee3ebaa58dac883b57` |
| `qetBreakerZNapedem` | **złożenie** `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_05.elmt` (wyłącznik) + `91_en_60617/en_60617_02/en_60617_02_13/en_60617_02_13_26.elmt` (napęd silnikowy M po lewej stronie toru, jak na rysunkach Z.10/Z.11.1, linia sprzężenia mechanicznego zaczepiona w przegubie styku) + `91_en_60617/en_60617_07/en_60617_07_15/en_60617_07_15_01.elmt` (cewka wyłączająca po prawej, port `wylacz`) — Q0 pól Z.10/Z.11.1/Z.11, dobór z rekordu `BayPrimaryDevice.naped` | `8df98b9b5c2783ea2413b406bef53ded66da628a` + `6af19ab8ebe7f4643033d6db0e9dfbbd8a11c2af` + `23118a6a8946dda5c1e996ee3ebaa58dac883b57` |
| `qetDisconnector` | `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_06.elmt` | `58a1758ff8fda670013b32a3a2068633223b4e9c` |
| `qetEarthSwitch` | `10_allpole/450_high_voltage/interrupteur_sectionneur_de_terre.elmt` | `addcaa782655cfe3d85a8f285cb48ec02194fee5` |
| `qetCurrentTransformer` | `91_en_60617/en_60617_06/en_60617_06_09/en_60617_06_09_10.elmt` | `37de2decfe2a496cd014a1dd411a5e8d52e990ca` |
| `qetVoltageTransformer` | `91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt` (zacisk wtórny poza torem, z powodem w manifeście) | `a883a2e6daec80c241594505c96295c917884adc` |
| `qetVoltageTransformer3` | **złożenie** dwóch kopii `91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_01A.elmt` (cztery okręgi w romb: pierwotne i trzy wtórne) — przekładnik T3 z trzema uzwojeniami wtórnymi w modelu (`uzwojenia`, decyzja właściciela 2026-10-29 pkt 1, §11.2) | `a883a2e6daec80c241594505c96295c917884adc` ×2 |
| `qetVoltageIndicator` | `10_allpole/450_high_voltage/signal_capacitif.elmt` (przewód toru przechodzi przez symbol — uwaga manifestu) | `fa4f0d85eabef67c8dfcf4cd102fdba3bc7c91d4` |
| `qetCableHead` | `91_en_60617/en_60617_03/en_60617_03_03/en_60617_03_03_05.elmt` (złącze wtykowe: wtyk od strony aparatu, gniazdo od strony kabla — znak rysunków Z.10/Z.11.1; dawny element zakończenia kabla `en_60617_03_04_01` usunięty z importu) | `93d917ff316a374b81696b92ddf91501d4da2b49` |
| `bayReserve` | `91_en_60617/en_60617_03/en_60617_03_01/en_60617_03_01_14.elmt` (koniec kabla niepodłączony — koniec toru pola WOLNEGO, nigdy znak uziemienia) | `0b62c546b2fc8651ae8c8d75cab73e657e9effc6` |
| `qetCoreBalanceCt` | `91_en_60617/en_60617_06/en_60617_06_13/en_60617_06_13_10.elmt` | `4742b0a5097196c28ac3c07e30ce427a95a36ad2` |
| `qetLoadBreakSwitch` | `91_en_60617/en_60617_07/en_60617_07_13/en_60617_07_13_08.elmt` (pola rodzin producentów) | `ca96486920218370b3afffb17a0ae8bfe3f6414c` |
| `qetFuseSwitch` | `91_en_60617/en_60617_07/en_60617_07_21/en_60617_07_21_09.elmt` (pola rodzin producentów) | `8079d0cde1116a3efa45064a5211b3cbf92ba2e0` |

Kafel stanu dostają wszystkie symbole łączników z położeniem tak samo (iloczyn symbol × stan ×
motyw × eksport × NOP w `frontend/src/ui/sld/v3/symbols/__tests__/kafelStanu.test.tsx`; na żywej
kanwie × LOD × warstwy w `frontend/src/ui/sld/v3/canvas/__tests__/kafleStanuNaKanwie.test.tsx`).

### 2.1. Z.10 — pole linii odpływowej (klasa odbiorcza)

Szablon `bay_template_gpz_line_enea_z10_trojpolozeniowy` (domyślny w izolacji gazowej bez
gazów fluorowanych i stało-powietrznej). Zrzuty: `pole-z10-trojpolozeniowy-zamkniete-*`,
`pole-z10-wylacznik-otwarty-*`, `pole-z10-rozlaczone-*`, `pole-z10-wylacznik-otwarty-uziemiony-*`,
`okno-pola-z10-trojpolozeniowy-*` (schemat i ocena).

| Z.10 poz. | Aparat (oznaczenie) | Rodzaj ENM, umiejscowienie | Porty ENM (port: węzeł) | Symbol |
|---|---|---|---|---|
| 1 | szyna sekcji SN | szyna `Bus` sekcji | — | szyna sceny |
| 2–3 | łącznik trójpołożeniowy szynowy (Q1) | `THREE_POSITION_SWITCH`, `UPSTREAM` | `we: szyna`, `wy: w1` | `qetThreePositionSwitch` |
| 4 | wyłącznik próżniowy z napędem silnikowym M (Q0) | `CB`, `MIDSTREAM`; `linked_ref` = gałąź wyłącznika; `naped` = `SILNIKOWY` | `we: w1`, `wy: w2` | `qetBreakerZNapedem` |
| 5 | przekładnik prądowy 1 rdzeń 200-400/5 A, 15 VA, 5P20 (T1; P1 od wyłącznika) | `CT`, `MIDSTREAM`, katalog `ct_typ_ogolny_osd_200_400_5_5p20_15va` | `we: w2`, `wy: w3` | `qetCurrentTransformer` |
| 6 | pojemnościowy wskaźnik napięcia (PF1) | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: w3` | `qetVoltageIndicator` |
| 7 | głowica kablowa (GK) | `CABLE_HEAD`, `DOWNSTREAM` | `we: w3`, `wy: kabel` | `qetCableHead` |
| 8 | przekładnik Ferrantiego 1/100 na kablu (T2) | `CORE_BALANCE_CT`, `DOWNSTREAM` | `obwod: kabel` (bez przerwy toru) | `qetCoreBalanceCt` |
| — | odłącznik liniowy, uziemnik kabla | **nie występują** (Z.10 ich nie rysuje; kabel uziemia się przez zamknięty wyłącznik przy Q1 „uziemiony", §13 druk s.25) | — | — |

Wykonanie z wyłącznikiem stałym (`…_z10_staly_z_odlacznikiem`, §13 — domyślne w izolacji
powietrznej; zrzuty `pole-z10-staly-stan-nieznany-*`, `pole-z10-wylacznik-zamkniety-uziemnik-otwarty-*`,
`pole-z10-zblizenie-ciemny`, `okno-pola-z10-staly-z-odlacznikiem-*`):
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
`bay_template_gpz_line_enea_z11_1_trojpolozeniowy`; zrzuty `pole-z11-1-stan-wyjsciowy-*`,
`pole-z11-1-wylacznik-otwarty-uziemiony-*`, `okno-pola-z11-1-trojpolozeniowy-*` (schemat i ocena).

| Z.11.1 | Aparat | Rodzaj ENM, umiejscowienie, odgałęzienie | Porty ENM | Symbol |
|---|---|---|---|---|
| wskaźnik napięcia przy szynie | PF0 | `VOLTAGE_INDICATOR`, `OFF_PATH` | `przylacze: szyna` | `qetVoltageIndicator` |
| łącznik trójpołożeniowy | Q1 | `THREE_POSITION_SWITCH`, `UPSTREAM` | `we: szyna`, `wy: w1` | `qetThreePositionSwitch` |
| wyłącznik próżniowy z napędem silnikowym M | Q0 | `CB`, `MIDSTREAM`, `naped` = `SILNIKOWY` | `we: w1`, `wy: w2` | `qetBreakerZNapedem` |
| odłącznik z uziemieniem odgałęzienia | Q5 | `THREE_POSITION_SWITCH`, `OFF_PATH`, odgałęzienie `pn` | `we: w2`, `wy: pn1` | `qetThreePositionSwitch` |
| głowica (złącze) przekładnika | GK1 | `CABLE_HEAD`, `OFF_PATH`, `pn` | `we: pn1`, `wy: pn2` | `qetCableHead` |
| przekładnik napięciowy SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 — trzy uzwojenia wtórne w gwieździe, bez otwartego trójkąta (DECYZJA WŁAŚCICIELA 2026-10-29 pkt 1, §11.2; uzwojenia I 10 VA 0,2; II 7,5 VA 0,2; III 7,5 VA 0,5/3P; III mierzy napięcie linii dla U>/U< i f</f>/df/dt) | T3 | `VT`, `OFF_PATH`, `pn`, `uzwojenia` = 3 | `przylacze: pn2` | `qetVoltageTransformer3` |
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

### 2.4. Pole wolne i pole zajęte

Pole wolne (bez kabla odejścia) rysuje KOMPLET aparatów rekordu: głowica GK i przekładnik
Ferrantiego T2 są aparatami pola (rekordy modelu), więc stoją w każdym polu jak na rysunkach
ENEA; koniec toru pola wolnego oznacza symbol „koniec kabla niepodłączony" (`bayReserve`) — nigdy
znak uziemienia. Pole zajęte kończy się KABLEM ODEJŚCIA — gałęzią modelu typu kabel z zacisku
pola — którego odcinek na schemacie zaczyna się w porcie S przekładnika T2 (test
`poleLinioweGpz.test.tsx`, opis „kabel odejścia pola jako gałąź modelu", §11.5).

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
| Z.10 | 51, 50, 51N, 67N¹, **81U**, ZS, 50BF, 79, SCO | niedopuszczone (`W052`) | niedopuszczone (`W052`) |
| Z.11.1, Z.11 | 51, 50, 67, 51N, 67N¹, 27, 59, 81U, 81O, 81R, ZS, 50BF, 79, SPZE, OWG, NZ, SCO | jak odbiorcze **bez SCO** | 51, 50, 51N, 67N¹, 27, 59, 81U, 81O, 81R, ZS, 50BF, OWG, NZ (**bez 67, 79, SPZE, SCO**) |

¹ 67N wyłącznie z warunkiem `ZRODLO_U0` (źródło 3U₀ powiązane w modelu, `WARUNKI_FUNKCJI_EAZ`,
§11.8). Stan tabeli zmierzony 2026-10-30 wywołaniem `funkcje_eaz_pola_liniowego` dla trzech
wykonań × trzech klas × {bez warunku, `ZRODLO_U0`}. Jedna nomenklatura (§11.11 pkt B): SCO jest
jedną funkcją pola — wyłączenie od stopni SCO1, SCO2 i ponowne załączenie po SCO; dawny osobny
kod „SPZ/SCO” skasowany u źródła.

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
| `pole-z10-trojpolozeniowy-zamkniete` | pole Z.10 zajęte kablem: Q1 trójpołożeniowy i Q0 zamknięte (kafle `#C62828`); T1, PF1, GK, T2 bez kafli; przekaźnik pola z kodami funkcji obok pola |
| `pole-z10-staly-stan-nieznany` | pole Z.10 z wyłącznikiem stałym po zmianie szablonu: odłącznik Q1 i uziemnik Q8 bez rekordu położenia — kafel szary `#6B7280` ze znakiem „?", Q0 zamknięty |
| `pole-z10-wylacznik-zamkniety-uziemnik-otwarty` | to samo pole po ustawieniu położeń z menu aparatu: Q1 i Q0 zamknięte (czerwone), uziemnik Q8 otwarty (zielony `#2E7D32`) |
| `pole-z10-zblizenie` (tylko ciemny) | zbliżenie kamery kółkiem na wyłącznik pola stałego: kółko działa, aż kanwa jest na poziomie szczegółu pola (LOD2), a uchwyt Q0 ma co najmniej 3 × 48 px na ekranie (asercje w specu). Pomiar przed korektą: próg 40 px kończył zbliżenie na LOD1, więc zrzut pokazywał okrąg przekaźnika bez kodów i bez linii powiązań |
| `pole-z10-wylacznik-otwarty` | pole zajęte po „Otwórz łącznik" z menu wyłącznika: Q0 otwarty (zielony), Q1 zamknięty |
| `pole-z10-rozlaczone` | pole zajęte po otwarciu Q1 z menu aparatu: Q1 odłączony (nóż w osi, zielony), Q0 otwarty |
| `pole-z10-wylacznik-otwarty-uziemiony` | pole zajęte po „Uziem" Q1: Q1 uziemiony (nóż na zestyku uziemiającym, kafel czerwony), Q0 otwarty |
| `pole-z10-staly-odlaczony-uziemiony` | pole Z.10 z wyłącznikiem stałym odłączone i uziemione z menu aparatu w kolejności z blokad (`enm/interlock_rules.py`): Q0 „Otwórz", Q1 „Otwórz", Q8 „Zamknij" — Q0 i odłącznik Q1 otwarte (zielone), uziemnik Q8 zamknięty (czerwony) |
| `pole-z11-1-stan-wyjsciowy` | pole Z.11.1 po zmianie szablonu: Q1 i Q5 bez rekordu położenia (kafel szary „?"), Q0 zamknięty; PF0 przy szynie, odgałęzienie Q5 → GK1 → T3 za wyłącznikiem, pole wolne zakończone symbolem „koniec kabla niepodłączony" |
| `pole-z11-1-wylacznik-otwarty-uziemiony` | pole Z.11.1: Q0 otwarty (zielony), Q1 trójpołożeniowy uziemiony (czerwony, nóż na zestyku uziemiającym), Q5 zamknięty |
| `okno-pola-z10-trojpolozeniowy`, `okno-pola-z10-staly-z-odlacznikiem`, `okno-pola-z11-1-trojpolozeniowy` | schemat pola w karcie pola (`SchematPolaSn` — wycinek rysunku kanwy z tej samej migawki ENM), zrzut elementu |
| `okno-pola-z10-trojpolozeniowy-ocena`, `okno-pola-z10-staly-z-odlacznikiem-ocena`, `okno-pola-z11-1-trojpolozeniowy-ocena` | CAŁA ocena pola wg klasy w karcie pola (`OcenaPolaLiniowegoGpz`: klasa, tabela funkcji z podstawą, obwody funkcji, napięcie zwrotne, napęd i sygnały, niezgodności), zrzut elementu. Na czas zrzutu okno przeglądarki rośnie, aż ocena mieści się w treści inspektora z odstępem 8 px od obu krawędzi; wysokość zrzutu 12 137–12 138 px (Z.10) i 14 286 px (Z.11.1) przy szerokości 273 px (pomiar 2026-10-30, po usunięciu kolizji klasy tabeli, §11.10 pkt 4) |

Każdy zrzut kanwy przechodzi przez `zmierzKafle` (§11.4): `getBBox()` i `boundingBox()` każdego
kafla łącznika pola w kadrze, wynik w `test-results/ux04-pole-liniowe-pomiary-kafli.json`.
Każdy kadr pola przechodzi też przez `zmierzBlokPrzekaznika` (§11.4): lewe krawędzie tuszu
wierszy bloku przekaźnika i tusz wewnątrz ramki bloku, wynik
w `test-results/ux04-pole-liniowe-pomiary-bloku.json`. Żaden zrzut biegu (kanwa, schemat pola,
ocena, zbliżenie) nie może być bajtowo identyczny z innym (`zapiszOdcisk`) — pomiar przed
korektą: zrzuty oceny Z.10 i Z.11.1 były identyczne bajt w bajt, bo oba ucinał kadr okna przed
sekcjami, którymi wykonania się różnią.

Inspektor przewija się jednym przewijaniem — treścią inspektora (`mvd-inspector-tresc`) — także
wtedy, gdy okno techniczne otwarte z selekcji stoi pod panelem elementu
(`ui2/legacy/LegacyInspektor.tsx`). Pomiar przed naprawą: kontener pod panelem miał
`h-full overflow-y-auto`, więc okna E-10…E-15 (kolumny `h-full` z ciałem `flex-1 overflow-auto`)
dostawały wysokość kadru. Przewijały się trzy pudełka naraz (kontener, ciało okna, sekcje karty
pola), a ostatni wiersz oceny pola był ucięty pod ramką sekcji przy każdej wysokości okna. Spec
sprawdza przewijanie (`jednoPrzewijanieInspektora`) w oknie GPZ (E-10), odcinka (E-12) i pola
(E-11) × motyw × szerokość inspektora; iniekcja dawnego kontenera — czerwony bieg („okno GPZ
z selekcji: przewija się wyłącznie treść inspektora", przewijany `inspektor-panel-nad-oknem`).
Mechanizm przypina także `ui2/legacy/__tests__/legacyInspektorPanelNadOknem.test.tsx` (okno
stacji E-13 i odcinka E-12 × status wyników; iniekcja — 6 z 6 czerwonych).

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
| uziemnik kabla przy łączniku trójpołożeniowym — brak | odczyt tekstu (§13 druk s.25) | §2.1 |

### 9.2. Parametry aparatury pierwotnej

| Aparat | Parametr | Wartość | Weryfikacja | Nośnik |
|---|---|---|---|---|
| T1 (Z.10, Z.11.1) | przekładnia, rdzeń | 200-400/5 A, rdzeń I 15 VA 5P20 | zweryfikowane na rysunku | katalog `ct_typ_ogolny_osd_200_400_5_5p20_15va`, `BayPrimaryDevice.rdzenie` |
| T1 (Z.11) | rdzenie | I 10 VA 0,2S FS5 (rozliczenie, analizator jakości energii), II 10 VA 0,2 FS5 (regulacja), III 15 VA 5P20 (zabezpieczenia) | zweryfikowane na rysunku | katalog `ct_typ_ogolny_osd_200_400_5_5_5_z11` |
| T3 (Z.11.1) | uzwojenia | SN/√3 / 0,1/√3 ×3; I 10 VA 0,2, II 7,5 VA 0,2, III 7,5 VA 0,5/3P; bez otwartego trójkąta | zweryfikowane na rysunku | `BayPrimaryDevice.uzwojenia` |
| T2 | przekładnia przekładnika Ferrantiego | 1/100 | zweryfikowane na rysunku | NOWE pole `BayPrimaryDevice.przekladnia` (wyłącznie `CORE_BALANCE_CT`; odmowa `bay_equipment.ratio_not_applicable` dla innego rodzaju; addytywne — `None` poza odciskiem modelu i szablonu) |
| Q0 | prąd wyłączalny, czas własny | z karty pozycji katalogowej aparatu; brak w karcie — wartość robocza z rejestru (`network_model/catalog/wartosci_robocze.py`, profil 0,060 s, jakość `ESTIMATED`) | odczyt tekstu (karta producenta / rejestr) | `SwitchEquipmentType` (`types.py:1770`), `break_time_s` (`types.py:3362`) |
| Q0 | napęd | silnikowy (sterowanie zdalne ZW/OW) — okrąg z literą M na kreskowanym sprzężeniu, EN 60617 02-13-26 | zweryfikowane na rysunku | `ObwodyWtornePola.napedy` (`NapedAparatuPola`), na aparacie ENM `BayPrimaryDevice.naped` = `SILNIKOWY`; katalog wyłączników NIE ma pola napędu — luka L1 (§9.6) |
| Q1 | napęd | zasobnikowy z obsługą ręczną — kwadrat na kreskowanym sprzężeniu (EN 60617 02-13-20, energia zmagazynowana) i kreskowany odcinek z poprzeczką (EN 60617 02-13-01, napęd ręczny); s.89, s.90, s.91 odczytane z druku 400 dpi 2026-10-30, Q5 bez znaku napędu | zweryfikowane na rysunku (kształt znaku; rodzaju rysunek nie opisuje słownie) | `ObwodyWtornePola.napedy`, `BayPrimaryDevice.naped` = `ZASOBNIKOWY_RECZNY` (dopuszczalne napędy rodzaju: `NAPEDY_RODZAJU_APARATU`); symbol łącznika z napędem na schemacie §11.11 pkt A |
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
| 51N | Io> (51N) — ziemnozwarciowe zwłoczne (prąd zerowy) | OBOWIAZKOWA | tak | WG_RYSUNKU | niedopuszczone | niedopuszczone |
| 67N | Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0) | WARIANTOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| ZS | ZS — współpraca z logicznym zabezpieczeniem szyn (sygnał blokowania ZS) | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 50BF | LRW (50BF) — lokalna rezerwa wyłącznikowa | OBOWIAZKOWA | tak | OBOWIAZKOWA | niedopuszczone | niedopuszczone |
| 79 | SPZ (79) — samoczynne ponowne załączenie (wielokrotne, programowalne, z blokadą) | WARIANTOWA | tak | NAPOWIETRZNA | niedopuszczone | niedopuszczone |
| SCO | SCO — samoczynne częstotliwościowe odciążenie — wyłączenie od stopni SCO1, SCO2 i ponowne załączenie po SCO (SPZ po SCO) | OPCJONALNA | tak | NA_ZADANIE_OSD | niedopuszczone | niedopuszczone |
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
| 51N | Io> (51N) — ziemnozwarciowe zwłoczne (prąd zerowy) | OBOWIAZKOWA | tak | WG_RYSUNKU | WG_RYSUNKU | WG_RYSUNKU |
| 67N | Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0) | WARIANTOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
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
| SCO | SCO — samoczynne częstotliwościowe odciążenie — wyłączenie od stopni SCO1, SCO2 i ponowne załączenie po SCO (SPZ po SCO) | WARIANTOWA | tak | NA_ZADANIE_OSD | ZAKAZANA | ZAKAZANA |
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
| 51N | Io> (51N) — ziemnozwarciowe zwłoczne (prąd zerowy) | OBOWIAZKOWA | tak | WG_RYSUNKU | WG_RYSUNKU | WG_RYSUNKU |
| 67N | Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0) | WARIANTOWA | tak | OBOWIAZKOWA | OBOWIAZKOWA | OBOWIAZKOWA |
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
| SCO | SCO — samoczynne częstotliwościowe odciążenie — wyłączenie od stopni SCO1, SCO2 i ponowne załączenie po SCO (SPZ po SCO) | WARIANTOWA | tak | NA_ZADANIE_OSD | ZAKAZANA | ZAKAZANA |
| 59N | U0> (59N) — nadnapięciowe zerowe (napięcie 3U0 z otwartego trójkąta) | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| Yo> | Yo> — ziemnozwarciowe admitancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| Go> | Go> — ziemnozwarciowe konduktancyjne | OPCJONALNA | nie | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) | DOPUSZCZALNA (interpr.) |
| 32 | P> (32) — kierunkowe mocy czynnej (od skutków mocy zwrotnej) | OPCJONALNA | nie | NIE_WYSTEPUJE | NA_ZADANIE_OSD | NA_ZADANIE_OSD |

#### Obwody Z10 — ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, Z.10 s.89; napędy: Q0 SILNIKOWY (ZWERYFIKOWANE_NA_RYSUNKU), Q1 ZASOBNIKOWY_RECZNY (ZWERYFIKOWANE_NA_RYSUNKU)

| Funkcja | Blok rysunku | Wejścia | Wyjścia | Wyłącznik | Weryfikacja | Uwaga |
|---|---|---|---|---|---|---|
| 51 | I> t1 | RDZEN_CT T1/1 | OW1, OW2 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50 | I>> t2 | RDZEN_CT T1/1 | OW1, OW2 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 51N | Zab. ziemnozwarciowe t1, t2 (kryterium prądowe Io) | PRZEKLADNIK_FERRANTIEGO T2/None | OW1, OW2 | Q0 | INTERPRETACJA | linia Io z zacisku 2 przekładnika Ferrantiego 1/100 do bloku „Zab. ziemnozwarciowe” jest na rysunku; kryterium prądowe bez kierunku jako osobna funkcja (51N) to wniosek z decyzji właściciela 2026-10-29 — kierunek (67N) wymaga napięcia zerowego 3U₀ z obwodu okrężnego „Z, Zz” (pole pomiaru napięcia, Z.17), a prąd zerowy pole mierzy samo |
| 67N | Zab. ziemnozwarciowe (kierunkowe) t1, t2 | PRZEKLADNIK_FERRANTIEGO T2/None, sygnał Z, Zz | OW1, OW2, Blok. ZW | Q0 | INTERPRETACJA | wyjścia OW1, OW2 z komórek t1, t2 — linie widoczne na rysunku; „Blok. ZW” wychodzi z nieopisanej komórki bloku zabezpieczenia ziemnozwarciowego — przypisanie tej funkcji jest interpretacją |
| ZS | ZS | RDZEN_CT T1/1 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50BF | LRW | RDZEN_CT T1/1 (interpr.) | OW1, OW2, Pobudzenie LRW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 79 | SPZ tSPZ | sygnał Odstawienie SPZ | ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| SCO | Sterownik pola | sygnał SCO1, sygnał SCO2, sygnał SCO/SPZ | OW1, OW2, ZW | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |

Sygnały: Blok. ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW1 (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW2 (WYJSCIE, WYLACZNIK, INTERPRETACJA); Odstawienie SPZ (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Topologia (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Zasilanie (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); SSiN (WYJSCIE, NADRZEDNY, INTERPRETACJA); Łącze inżynierskie (WYJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); +AwUp (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Up (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Aw (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Al (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); SCO1 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO2 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO/SPZ (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); UL1, UL2, UL3, N (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Pobudzenie LRW (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Blokowanie ZS (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Z, Zz (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU)

Obwody przekładników poza EAZ: 

#### Obwody Z11_1 — ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, Z.11.1 s.91; napędy: Q0 SILNIKOWY (ZWERYFIKOWANE_NA_RYSUNKU), Q1 ZASOBNIKOWY_RECZNY (ZWERYFIKOWANE_NA_RYSUNKU)

| Funkcja | Blok rysunku | Wejścia | Wyjścia | Wyłącznik | Weryfikacja | Uwaga |
|---|---|---|---|---|---|---|
| 51 | I> t1 | RDZEN_CT T1/1 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50 | I>> t2 | RDZEN_CT T1/1 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 51N | Zab. ziemnozwarciowe t1, t2 (kryterium prądowe Io) | PRZEKLADNIK_FERRANTIEGO T2/None | OW1 | Q0 | INTERPRETACJA | linia Io z zacisku 2 przekładnika Ferrantiego 1/100 do bloku „Zab. ziemnozwarciowe” jest na rysunku; kryterium prądowe bez kierunku jako osobna funkcja (51N) to wniosek z decyzji właściciela 2026-10-29 — kierunek (67N) wymaga napięcia zerowego 3U₀ z obwodu okrężnego „Z, Zz” (pole pomiaru napięcia, Z.17), a prąd zerowy pole mierzy samo |
| 67N | Zab. ziemnozwarciowe (kierunkowe) t1, t2 | PRZEKLADNIK_FERRANTIEGO T2/None, sygnał Z, Zz | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| ZS | ZS (kierunkowe I>) | RDZEN_CT T1/1 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50BF | LRW | RDZEN_CT T1/1 (interpr.) | OW1, Pobudzenie LRW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 79 | SPZ tSPZ | sygnał Odstawienie SPZ | ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| SCO | Sterownik pola | sygnał SCO1, sygnał SCO2, sygnał SCO/SPZ | OW1, ZW | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| 67 | ZS (kierunkowe I>) | RDZEN_CT T1/1 (interpr.), UZWOJENIE_VT T3/3 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 27 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 59 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81U | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81O | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81R | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| NZ | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.9.3 i §26.10.3 nazywają blokadę załączenia od napięcia zwrotnego; rysunek realizuje ją blokiem U>/U< z wyjściem „Blok. ZW” (napięcie po stronie linii przy otwartym wyłączniku blokuje załączenie) |
| SPZE | SPZE tE | sygnał Wył. od zab. TR | ZW | Q0 | INTERPRETACJA | rysunek doprowadza „Wył. od zab. TR” do bloku SPZE tE; ponowne załączenie po czasie tE — wniosek z nazwy bloku (rozwinięcia skrótu SPZE standard nie podaje) |
| OWG | SPZE tE | sygnał Wył. od zab. TR | OW1 | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.10.4 — wyłączenie pól z generacją od zabezpieczeń transformatora; rysunek prowadzi to wejście do bloku SPZE, a wyjście bloku do obwodu OW1 |

Sygnały: Blok. ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW1 (WYJSCIE, WYLACZNIK, INTERPRETACJA); Odstawienie SPZ (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Topologia (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Zasilanie (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); SSiN (WYJSCIE, NADRZEDNY, INTERPRETACJA); Łącze inżynierskie (WYJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Wył. od zab. TR (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); +AwUp (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Up (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Aw (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Al (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); SCO1 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO2 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO/SPZ (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); UL1, UL2, UL3, N (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Pobudzenie LRW (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Blokowanie ZS (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Z, Zz (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU)

Obwody przekładników poza EAZ: T3/1 → niepodłączone na rysunku (ZWERYFIKOWANE_NA_RYSUNKU); T3/2 → niepodłączone na rysunku (ZWERYFIKOWANE_NA_RYSUNKU)

#### Obwody Z11 — ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, Z.11 s.90; napędy: Q0 SILNIKOWY (ZWERYFIKOWANE_NA_RYSUNKU), Q1 ZASOBNIKOWY_RECZNY (ZWERYFIKOWANE_NA_RYSUNKU)

| Funkcja | Blok rysunku | Wejścia | Wyjścia | Wyłącznik | Weryfikacja | Uwaga |
|---|---|---|---|---|---|---|
| 51 | I> t1 | RDZEN_CT T1/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50 | I>> t2 | RDZEN_CT T1/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 51N | Zab. ziemnozwarciowe t1, t2 (kryterium prądowe Io) | PRZEKLADNIK_FERRANTIEGO T2/None | OW1 | Q0 | INTERPRETACJA | linia Io z zacisku 2 przekładnika Ferrantiego 1/100 do bloku „Zab. ziemnozwarciowe” jest na rysunku; kryterium prądowe bez kierunku jako osobna funkcja (51N) to wniosek z decyzji właściciela 2026-10-29 — kierunek (67N) wymaga napięcia zerowego 3U₀ z obwodu okrężnego „Z, Zz” (pole pomiaru napięcia, Z.17), a prąd zerowy pole mierzy samo |
| 67N | Zab. ziemnozwarciowe (kierunkowe) t1, t2 | PRZEKLADNIK_FERRANTIEGO T2/None, sygnał Z, Zz | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| ZS | ZS (kierunkowe I>) | RDZEN_CT T1/3 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 50BF | LRW | RDZEN_CT T1/3 (interpr.) | OW1, Pobudzenie LRW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 79 | SPZ tSPZ | sygnał Odstawienie SPZ | ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| SCO | Sterownik pola | sygnał SCO1, sygnał SCO2, sygnał SCO/SPZ | OW1, ZW | Q0 | INTERPRETACJA | rysunek prowadzi sygnał do bloku „Sterownik pola”; wykonanie przez obwód sterowania wyłącznikiem sterownika jest wnioskiem z układu rysunku |
| 67 | ZS (kierunkowe I>) | RDZEN_CT T1/3 (interpr.), UZWOJENIE_VT T3/3 (interpr.) | Blokowanie ZS | — | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 27 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 59 | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81U | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81O | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| 81R | f< f> df/dt | UZWOJENIE_VT T3/3 | OW1 | Q0 | ZWERYFIKOWANE_NA_RYSUNKU |  |
| NZ | U> U< | UZWOJENIE_VT T3/3 | Blok. ZW | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.9.3 i §26.10.3 nazywają blokadę załączenia od napięcia zwrotnego; rysunek realizuje ją blokiem U>/U< z wyjściem „Blok. ZW” (napięcie po stronie linii przy otwartym wyłączniku blokuje załączenie) |
| SPZE | SPZE tE | sygnał Wył. od zab. TR | ZW | Q0 | INTERPRETACJA | rysunek doprowadza „Wył. od zab. TR” do bloku SPZE tE; ponowne załączenie po czasie tE — wniosek z nazwy bloku (rozwinięcia skrótu SPZE standard nie podaje) |
| OWG | SPZE tE | sygnał Wył. od zab. TR | OW1 | Q0 | INTERPRETACJA | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 §26.10.4 — wyłączenie pól z generacją od zabezpieczeń transformatora; rysunek prowadzi to wejście do bloku SPZE, a wyjście bloku do obwodu OW1 |

Sygnały: Blok. ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); ZW (WYJSCIE, WYLACZNIK, INTERPRETACJA); OW1 (WYJSCIE, WYLACZNIK, INTERPRETACJA); Odstawienie SPZ (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Topologia (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Zasilanie (WEJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); SSiN (WYJSCIE, NADRZEDNY, INTERPRETACJA); Łącze inżynierskie (WYJSCIE, NADRZEDNY, ZWERYFIKOWANE_NA_RYSUNKU); Wył. od zab. TR (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); +AwUp (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Up (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Aw (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Al (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); SCO1 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO2 (WEJSCIE, OKREZNY, INTERPRETACJA); SCO/SPZ (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); UL1, UL2, UL3, N (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Pobudzenie LRW (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Blokowanie ZS (WYJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU); Z, Zz (WEJSCIE, OKREZNY, ZWERYFIKOWANE_NA_RYSUNKU)

Obwody przekładników poza EAZ: T1/1 → układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii (ZWERYFIKOWANE_NA_RYSUNKU); T1/2 → układy regulacyjne (ZWERYFIKOWANE_NA_RYSUNKU); T3/1 → układ pomiarowo-rozliczeniowy podstawowy, analizator jakości energii (ZWERYFIKOWANE_NA_RYSUNKU); T3/2 → układy regulacyjne (ZWERYFIKOWANE_NA_RYSUNKU)

Obwody wtórne (dane: `network_model/catalog/obwody_wtorne_pola.py::OBWODY_WTORNE_WYKONANIA_POLA`,
`BayTemplate.obwody_wtorne`, w odpowiedzi szablonów pole `obwody_wtorne`): tabele „Obwody"
powyżej podają dla każdej funkcji blok rysunku, wejścia (rdzeń CT / uzwojenie VT / przekładnik
Ferrantiego / sygnał), wyjścia do wyłącznika i status. Wiersze funkcji prądowych (51, 50, 51N, 67,
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
pola i napędy łączników (`ocena-pola-liniowego-sygnaly`, `ocena-pola-liniowego-naped`).
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
| L4 | ZAMKNIĘTA (2026-10-29): składowa zerowa U0 („Z, Zz" na rysunku) pochodzi z uzwojenia otwartego trójkąta przekładnika pola pomiaru napięcia szyn Z.17 tej samej sekcji (potwierdzone cytatem, §11.2 pkt 3); pole Z.17 ma szablon `bay_template_gpz_pomiar_napiecia_enea_z17` z uzwojeniem III w otwartym trójkącie, pole liniowe wskazuje źródło polem `Bay.zrodlo_u0_ref`, a 67N wchodzi do zestawu funkcji wyłącznie przy spełnionym warunku (§11.2 pkt 4) | `backend/src/enm/zrodlo_napiecia_zerowego.py`, `network_model/catalog/bay_templates.py` (`WARUNKI_FUNKCJI_EAZ`) | — (ta karta) |
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

**Funkcje automatyki ze stanem.** Plakietki SPZ, SCO, LRW, NZ i OWG (`PLAKIETKI_GPZ`, `ui/sld/v2/canvas/canonicalGpzModel.ts`) z kodów funkcji pola — pięć osobnych plakietek, bez dawnego kodu złożonego; stan funkcji
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

## 11. Korekta właściciela 2026-10-29 (bramka B-02 odrzucona) — stan wykonania

Właściciel odrzucił wizualizację pola z poprzedniego etapu (B-02 = ODRZUCONE). Ta sekcja niesie
wykonanie dziesięciu wymagań korekty i czterech decyzji właściciela, z testem przy każdym
zdaniu. NIE jest werdyktem wizualnym ani deklaracją zgodności z ENEA — tabela §11.3 to odczyt
wykonawcy do porównania przez właściciela (B-02).

### 11.1. Wymagania korekty → wykonanie → test

| # | Wymaganie | Wykonanie | Test (iloczyn cech) |
|---|---|---|---|
| 1 | kafel łącznika = kwadrat 48 × 48 na LOD2 z jednej stałej; stan zmienia kolor i styk, nigdy wymiar; stan nieznany — ten sam wymiar, kolor neutralny | `cad/qet/qetPoleSn.ts::QET_BOK_KAFLA_STANU = 48`, `symbols/glyphs.tsx::prostokatKaflaStanu` (łącznik QET: kwadrat z tej stałej, nie z obrysu rysunku); kolory z `STATE_COLOR` (§10) | `symbols/__tests__/kafelStanu.test.tsx` (rodzaj × wariant rysunku × stan {zamknięty, otwarty, uziemiony, nieustalony, awaria, brak} × motyw {ciemny, jasny, eksport}); pomiar żywej kanwy §11.4 |
| 2 | czytelny glif rodzaju | symbole QET EN 60617 (§2): × wyłącznik, ○ rozłącznik, belka odłącznika, znak ziemi uziemnika, łącznik trójpołożeniowy z zestykiem uziemiającym. Uwaga sesji głównej 2026-10-29 pkt 1 (glify miniaturowe, × ok. 10 % boku kafla): rysunek aparatu powiększony jednokładnością `skalaRysunku` manifestu (wyłącznik, wyłącznik z napędem, odłącznik, rozłącznik i rozłącznik z bezpiecznikami ×3; uziemnik ×2,5; łącznik trójpołożeniowy — złożenie w skali źródła), znak rodzaju dodatkowo skalą lokalną `skalaLokalna` z powodem (krzyżyk wyłącznika, poprzeczka odłącznika, okrąg rozłącznika, bezpiecznik, kreski uziemienia ×2; zestyki szynowy i uziemiający łącznika trójpołożeniowego ×3); stopień glifu łącznika w każdym położeniu 0,575–0,617 boku kafla (przed: 0,19–0,23, trójpołożeniowy 0,45), × wyłącznika 9,6 j.św. (przed: 3,2); kreska glifu 2 j.św. = bok/24 (`QET_KRESKA_GLIFU`, przewody 1,2 j.św.); importer odrzuca symbol o stopniu poza `stopienSymboli` [0,55; 0,70] | `kafelStanu.test.tsx` (opis „stopień glifu i kreska proporcjonalna do kafla”: 7 łączników × położenie, stopień liczony niezależnie z prymitywów, kreski ról, przerwa wzoru kreski przerywanej; „litera na kaflu czytelna w całym zakresie LOD2”), `backend/tests/ci/test_qet_pole_sn_import.py` (iniekcje stopnia: poniżej i powyżej przedziału), e2e `zmierzKafle` (stopień glifu `getBBox`/`boundingBox` × rodzaj × stan × motyw, §11.4) |
| 3 | tor kablowy: głowica, Ferranti 1/100, kabel odejścia jako gałąź, koniec toru ≠ znak uziemienia | GK (`qetCableHead`, złącze wtykowe 03-03-05) i T2 (`qetCoreBalanceCt`) jako aparaty toru w każdym polu; pole zajęte kończy się gałęzią kabla modelu z portu S przekładnika T2, pole wolne — symbolem `bayReserve` (koniec kabla niepodłączony, §2.4) | `scene/__tests__/poleLinioweGpz.test.tsx` (opis „kabel odejścia pola jako gałąź modelu"; pole zajęte / wolne × stan łączników × LOD), §11.5 |
| 4 | napęd silnikowy M przy Q0 | rekord `BayPrimaryDevice.naped = "SILNIKOWY"` z szablonu (Z.10/Z.11.1/Z.11: „M” przy wyłączniku); symbol `qetBreakerZNapedem` (wyłącznik 07-13-05 + napęd 02-13-26 + cewka wyłączająca 07-15-01) wybierany z rekordu (`compose/apparatusSequence.ts`), bez rekordu — `qetBreaker` (wyłącznik z cewką). Napęd stoi po LEWEJ stronie toru, jak na rysunkach Z.10/Z.11.1 (przed korektą: po prawej, w miejscu dzisiejszej cewki). Okrąg napędu z literą M jest powiększony 3,5× wokół punktu styku z linią sprzężenia (`skalaLokalna` manifestu z powodem; linia sprzężenia z przegubu noża zostaje w długości źródła, okrąg mieści się w kaflu z marginesem kafla): litera M ma 8,4 j.św., czyli co najmniej 8,6 px w całym LOD2 (pomiar przed naprawą: 2,4 j.św., na zrzutach pola 3,6–6,6 px). Środek litery liczony z posuwu znaku kroju źródła (Liberation Sans: M 1706/2048 em, „3” 1139/2048 em), znak spoza tabeli przerywa import | backend: `tests/enm/test_pole_liniowe_gpz_szablony.py`, `tests/ci/test_qet_pole_sn_import.py` (napęd i cewka jako osprzęt, metryka znaku fail-closed, iniekcje); front: `poleLinioweGpz.test.tsx` (iniekcja: `naped` zdjęty → symbol bez napędu), `kafelStanu.test.tsx` (napęd w osprzęcie po lewej stronie toru; iniekcja dawnej skali napędu); e2e: Q0 → `qetBreakerZNapedem` w obu polach i motywach |
| 5 | CT/VT/Ferranti → przekaźnik → cewka CB jednoznacznie, bez schematu wtórnego | powiązania funkcji z aparatami jako DANE rekordów aparatów (`funkcje_eaz_zasilane` na przekładnikach, `funkcje_eaz_wylaczajace` na wyłączniku — z obwodów wzorca §9.4, `enm/wyposazenie_pola.py`). Przekładnik Ferrantiego T2 zasila funkcję 51N (kryterium prądowe Io bloku „Zab. ziemnozwarciowe t1, t2”, czerwona linia z zacisku 2 na rysunkach Z.10/Z.11.1) w KAŻDYM polu, a 67N wyłącznie przy potwierdzonym źródle 3U₀ (§11.2 pkt 4) — przed korektą T2 nie miał żadnej linii do przekaźnika (uwaga sesji głównej pkt 4). Na schemacie: blok przekaźnika w ramce (okrąg z dwoma pierwszymi kodami, pozostałe kody w wierszach po prawej — każdy kod raz; wiersz odniesienia źródła 3U₀), linie pomiarowe z portów wtórnych T1, T2 (i T3 w Z.11.1), linia wyłączania do zacisku cewki wyłączającej Q0 (port `wylacz`), bez numeru „52” i bez przewodów obwodów wtórnych (§11.9) | `tests/enm/test_powiazania_obwodow_aparatow_pola.py` (szablon × droga budowy, predykat parami z odczytem, tabela rysunku Z.11.1 × źródło U0), `tests/enm/test_zrodlo_napiecia_zerowego.py` (51N w każdej komórce {Z10, Z11_1} × {Z.17 obecne, brak} × {potwierdzone, nie}: zestaw, T2, Q0, obwód funkcji; iniekcja „T2 nie zasila 51N” — 6 z 6 czerwonych), `tests/network_model/catalog/test_obwody_wtorne_pola.py` (wyrocznia rysunku 51N), `compose/__tests__/protectionTopologyValidation.test.ts`, `scene/__tests__/poleLinioweGpz.test.tsx` (opis „blok przekaźnika”: fikstury × warunek bloku, 5 iniekcji) |
| 6 | powiększenie, tor jako proporcjonalna część kadru, przekaźnik obok pola | kadr „Dopasuj do… → Pole” (LOD2) i zrzut przycięty do pola (§7); przekaźnik w odstępie GRID…6·GRID od prawej krawędzi aparatów i podpisów pola (§11.6). Spójny stopień symboli LOD2 (uwaga sesji głównej pkt 6): symbole toru powiększone jednokładnością `skalaRysunku` do stopnia 0,33–0,58 boku kafla — przekładnik prądowy T1 ×3 (okrąg 8 → 24 j.św.), przekładnik Ferrantiego T2 ×1,5 (okrąg 16 → 24 j.św., litera „3” 3,6 → 5,4 j.św.), głowica GK ×2 (10 → 20 j.św.), wskaźnik napięcia PF ×4 (wysokość okładzin 4 → 16 j.św.); importer odrzuca symbol toru poza `stopienSymboli.tor` [0,33; 0,70] | `poleLinioweGpz.test.tsx` („przekaźnik pola obok pola”); `test_qet_pole_sn_import.py` (stopień symboli toru); e2e — kadr na LOD2 |
| 7 | test renderu mierzący bboxy; iniekcja kafla wyłącznika innego rozmiaru → czerwień | spec `e2e/ux04-pole-liniowe-zrzuty-screenshot.spec.ts::zmierzKafle` — `getBBox()` i `boundingBox()` każdego kafla i rysunku aparatu w kaflu (`[data-qet="glif"]`) w każdym kadrze zrzutu; przedział stopnia z manifestu importu (jedno źródło z importerem) | §11.4 (tabela pomiaru, iniekcje: kafel 52 × 52, glif pomniejszony do połowy) |
| 8 | kanwa względem topologii ENM, zero fikcji | każdy aparat sceny ma rekord aparatu pola, każdy przewód toru łączy porty na wspólnym węźle modelu, kabel odejścia jest gałęzią modelu, VT T3 z liczbą uzwojeń z rekordu (`qetVoltageTransformer3` przy trzech uzwojeniach wtórnych) | `poleLinioweGpz.test.tsx` (wyrocznia aparatów i przewodów z modelu × fikstury Z.10/Z.11.1 × LOD; iniekcje: aparat bez rekordu, przewód bez wspólnego węzła, VT z dwoma uzwojeniami); rozłączność kabli różnych pól §11.5 |
| 9 | zastąpione decyzjami właściciela | §11.2 | — |
| 10 | tabela ENEA → zrzut; zrzuty Z.10/Z.11.1 × motyw × stan | §11.3, §7 | spec e2e zrzutów |

### 11.2. Decyzje właściciela 2026-10-29

**DECYZJA WŁAŚCICIELA (pkt 1): przekładnik napięciowy T3 pola Z.11.1 ma TRZY uzwojenia wtórne
w gwieździe 0,1/√3, bez otwartego trójkąta.** Nośnik: `BayDeviceTemplate.uzwojenia` szablonu
Z.11.1 (I 10 VA kl. 0,2; II 7,5 VA kl. 0,2; III 7,5 VA kl. 0,5/3P — tabliczka rysunku s.91);
symbol z liczby uzwojeń rekordu. Uzwojenie III zasila bloki U>/U< i f</f>/df/dt sterownika pola,
NIE blok zabezpieczenia ziemnozwarciowego (rysunek s.91: niebieska linia z uzwojenia III do
wejść U>, U<, f<, f>, df/dt).

**Pkt 2: nie dodajemy ani nie usuwamy aparatów względem rysunków.** Sekwencje aparatów Z.10
i Z.11.1 są równe rysunkom (§2.1, §2.2; e2e porównuje listę `oznaczenie:rodzaj` z modelu); pole
pomiaru napięcia Z.17 jest OSOBNYM polem sekcji (szablon `bay_template_gpz_pomiar_napiecia_enea_z17`),
nie aparatem pola liniowego.

**Pkt 3: czy 3U₀ pochodzi z pola Z.17 — POTWIERDZONE.** Dowody (ENEA Operator „Stacje
elektroenergetyczne 110 kV", Zeszyt 1, wersja 02.2023-2; strony wg stopki „Strona I n/76",
odczyt tekstu `pdftotext` strona po stronie; współrzędne rysunku w pikselach strony
2480 × 3509):

| Miejsce | Cytat / odczyt | Strona |
|---|---|---|
| §26.9 „Zabezpieczenia pól SN" | „zabezpieczenia od skutków zwarć doziemnych, uzależnione od sposobu uziemienia sieci, których wielkościami pomiarowymi są składowe zerowe prądu (I0) i napięcia (U0): w polach liniowych nadprądowe, kierunkowe i admitancyjne, w polu pomiaru napięcia – zerowonapięciowe" | I-52 |
| §26.9.8 „Zabezpieczenia pól pomiaru napięcia" | „zabezpieczenie zerowonapięciowe 3Uo> … Schemat zasadniczy pola pomiaru napięcia pokazano w [Z.17]" | I-54 |
| §25.2.8 „Parametry wejść analogowych …" | wejścia napięciowe urządzeń EAZ: „napięcie znamionowe fazowe Un=100/3 V AC", „napięcie znamionowe 3Uo Un=100 V AC" — wejście 3Uo jest osobnym wejściem 100 V, czyli napięciem otwartego trójkąta 3 × 100/3 V | I-43 |
| §13 „Rozdzielnia SN" | „Rozdzielnica SN musi posiadać wydzielone pola pomiaru napięcia po jednym w każdej sekcji" (s.25); „Przekładników napięciowych nie należy wyposażać we wkładki bezpiecznikowe" (s.26) | I-25, I-26 |
| §26.10.6 „Automatyka SCO i SPZ/SCO" | przekaźnik SCO „zabudowany w polu pomiaru napięcia, który za pośrednictwem szyn okrężnych, działa na wyłączenie odpowiednich (wybranych) pól liniowych" — pole pomiaru napięcia zasila pola liniowe sekcji szynami okrężnymi | I-56 |
| rysunek Z.17 (s.97) „Pole pomiaru napięcia SN" | tabliczka przekładnika SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 (x ≈ 614–860, y ≈ 2000–2185); uzwojenie III 15 VA kl. 3P narysowane jako trójkąt otwarty (≈ (1193, 2106)), linia do wejścia „Uo>" sterownika pola i do obwodu okrężnego „Z,Zz" | 97 |
| rysunki Z.10 (s.89) i Z.11.1 (s.91) | blok „Zab. ziemnozwarciowe" ma dwa wejścia: przekładnik Ferrantiego 1/100 (I0) i obwód okrężny „Z, Zz" (U0, niebieska linia z listy „Obwody okrężne") | 89, 91 |

Wniosek: pole liniowe Z.10/Z.11.1 nie mierzy napięcia zerowego samo; U0 funkcji 67N przychodzi
obwodem okrężnym „Z, Zz" z uzwojenia otwartego trójkąta przekładnika pola pomiaru napięcia Z.17
tej samej sekcji.

**Pkt 4: 67N wyłącznie wariantowo, z jawnym warunkiem.** Reguła (jedno źródło
`backend/src/enm/zrodlo_napiecia_zerowego.py`, warunek `bay_templates.WARUNEK_ZRODLA_U0`
w `WARUNKI_FUNKCJI_EAZ`): 67N trafia do zestawu funkcji pola wyłącznie, gdy (1) pole ma
przekładnik Ferrantiego i (2) `Bay.zrodlo_u0_ref` wskazuje przekładnik napięciowy z uzwojeniem
otwartego trójkąta w polu pomiaru napięcia szyn (rola `MEASUREMENT`, funkcja `NAPIECIA_SZYN`) na
tej samej szynie sekcji. Samo istnienie pola Z.17 w sekcji NIE jest potwierdzeniem — powiązanie
deklaruje projektant (system podaje kandydatów; ZASADA NR 4: proponuje, nie zgaduje). Warunek
niespełniony → funkcji nie ma w zestawie, ocena funkcji 67N ma status `NIE_OCENIONO`
z wyjaśnieniem (co oceniono, czego brakuje: `BRAK_POLA_POMIARU_NAPIECIA` / `BRAK_POWIAZANIA` /
`BRAK_FERRANTIEGO`, dowód z rysunków Z.10/Z.11.1/Z.17), nigdy „spełnia"; 67N zadeklarowana ręcznie
bez potwierdzonego źródła → ostrzeżenie walidatora `W064` (`bay.earth_fault_u0_source_unconfirmed`)
z akcją naprawczą. Na schemacie odniesienie źródła jest dyskretne: wiersz tekstu pod listą kodów
przekaźnika pola (`ownerRef` `<pole>#zrodlo-u0`), wyłącznie przy potwierdzonym powiązaniu — bez
przewodu przez rozdzielnicę.

Inwentarz klasy „67N trafia do pola automatycznie" (wszystkie drogi przypisania zestawu funkcji):

| Miejsce | Droga | Stan |
|---|---|---|
| `backend/src/network_model/catalog/bay_templates.py::funkcje_eaz_szablonu` | zestaw szablonu pola liniowego GPZ w klasie (9 szablonów Z.10/Z.11.1/Z.11) | 67N tylko przy warunku w `warunki` (domyślnie pusty) |
| `bay_templates.py::funkcje_eaz_roli`, `bez_niespelnionych_warunkow` | pole bez szablonu (szablon kanoniczny roli) i wymagania z szablonów producentów | ten sam filtr warunku |
| `backend/src/enm/domain_operations_v2.py::_resolve_bay_template_protection_codes` (≈ l. 2030–2085) | JEDNA funkcja dla trzech dróg (producent / szablon / rola) | `warunki` z modelu |
| `backend/src/enm/domain_operations.py:1861`, `:5301`, `:7889`, `:8003`, `:12255` | pola tworzone z GPZ (`create_gpz`, `add_grid_source_sn`), przydział pola odejściu, `add_sn_bay` | bez `warunki` — pole nowe nie ma powiązania, więc bez 67N |
| `domain_operations.py:12685` | pole transformatorowe (`funkcje_eaz_szablonu(BAY_TEMPLATE_TRANSFORMER)`) | szablon nie niesie 67N |
| `domain_operations_v2.py:2358` | rekonfiguracja istniejącego pola | `warunki_funkcji_eaz_pola(enm, pole)` |
| `backend/src/enm/wyposazenie_pola.py:646–655` | `set_bay_equipment` (zmiana szablonu, klasy, powiązania źródła) | warunki przed i po zmianie; odmowa `bay_equipment.zrodlo_u0_niepoprawne` |
| `backend/src/api/catalog.py:802` | `GET /api/catalog/bay-templates` i `/bay-protection-codes` (zestaw szablonu w klasie) | bez warunków → bez 67N (snapshot OpenAPI zregenerowany) |
| `bay_templates.py:1857` | lista szablonów kreatora (`protection_codes`) | bez warunków |
| `backend/src/application/field_read_model.py:187–197` | model odczytu pola (kontrolka powiązania, kandydaci) | ta sama reguła |
| `backend/src/enm/pole_liniowe_gpz.py:450` | ocena pola liniowego | `NIE_OCENIONO` bez źródła |
| `backend/src/enm/validator.py:2212–2230` | walidator (`W064`) | 67N bez potwierdzonego źródła |
| `frontend/src/ui/sld/v2/model/zrodloNapieciaZerowego.ts` | lustro frontu (adnotacja braku na schemacie) | parytet `tests/ci/test_parytet_zrodla_u0.py` |

Świadomie poza naprawą (z uzasadnieniem merytorycznym): `frontend/src/ui/sld/v2/station-rozdzielnia/archetypes.ts:143`
(zestaw demonstracyjny archetypów stacji SN dla harnessów galerii — dane wejściowe renderu, nie
model ENM i nie ścieżka użytkownika; pole stacji SN z jawną flagą `directional`),
`backend/tests/reference_networks/station_archetype_substrate.py:1036–1052` (wymagania funkcji
pól wytwórczych wg rodzaju maszyny — lista WYMAGAŃ, a brak toru napięcia zerowego raportuje
`backend/src/domain/der_protection_functions.py:273–286` jako kwestię otwartą) i
`application/analyses/protection/catalog/data/devices_v0.json` (zdolności urządzeń katalogu, nie
przypisanie do pola).

Testy: `backend/tests/enm/test_zrodlo_napiecia_zerowego.py` — iloczyn {Z10, Z11_1} × {Z.17
obecne, brak} × {powiązanie potwierdzone, brak} × konsumenci reguły (zestaw funkcji, powiązania
aparatów, ocena, walidator, model odczytu, ścieżka zwarcia doziemnego), odmowa powiązania ze
źródłem niepoprawnym, odmowa własnego VT w gwieździe Z.11.1, W064 po zdjęciu wyposażenia Z.17,
deklaracja ręczna 67N, żaden szablon rejestru i producenta nie przypisuje 67N bez warunku,
determinizm; iniekcja „67N zawsze spełniona" — czerwone komórki bez powiązania.

### 11.3. Rysunki ENEA s.89 (Z.10) i s.91 (Z.11.1) → element na zrzucie → odczyt wykonawcy

Tabela zestawia pozycje rysunków (odczyt `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`)
z tym, co pokazują zrzuty §7. Kolumna „odczyt wykonawcy" to opis różnic i dopasowań do
porównania przez właściciela. To NIE jest deklaracja zgodności z ENEA ani werdykt wizualny
(B-02).

**Z.10 (s.89)** — zrzuty `pole-z10-trojpolozeniowy-zamkniete-*`, `pole-z10-wylacznik-otwarty-*`,
`pole-z10-rozlaczone-*`, `pole-z10-wylacznik-otwarty-uziemiony-*`, `pole-z10-zblizenie-ciemny`,
`okno-pola-z10-trojpolozeniowy-*`:

| Poz. rysunku | Na zrzucie | Odczyt wykonawcy |
|---|---|---|
| 1 — szyna SN L1, L2, L3 | przewód od szyny sekcji wchodzi do Q1 u góry kadru; sama szyna leży poza kadrem pola (kadr = obrys aparatów pola z marginesem na oznaczenia i podpis) | różnica: przewód nie ma znacznika trzech faz „///" |
| 2–3 — zestyk odłączający i zestyk uziemiający z napędem (łącznik trójpołożeniowy) | Q1 `qetThreePositionSwitchZNapedem` w kaflu 48 × 48. Nóż w trzech położeniach: na zestyku liniowym (zamknięty, kafel czerwony; koniec noża leży na kresce styku stałego), w osi (odłączony, kafel zielony), na zestyku uziemiającym (uziemiony, kafel czerwony, `data-qet-polozenie="earthed"`). Napęd z rekordu aparatu (`BayPrimaryDevice.naped` = `ZASOBNIKOWY_RECZNY`): kreskowana linia sprzężenia od przegubu noża do kwadratu napędu energią zmagazynowaną (EN 60617 02-13-20) po prawej stronie osi, pod zestykiem uziemiającym, i od kwadratu w dół kreskowany odcinek z poprzeczką (obsługa ręczna, EN 60617 02-13-01) | aparat, trzy położenia i napęd łącznika odpowiadają rysunkowi. Znak uziemienia stoi nad zestykiem prawym, u góry pola przy torze, jak na rysunku (§11.9 pkt 2). Napęd jest atrybutem aparatu, nie nowym aparatem, więc decyzja właściciela §11.2 pkt 2 (zakaz dodawania aparatów) obowiązuje bez zmian (§11.11 pkt A). Położenie zamknięte czyta się jako odłącznik: koniec noża na kresce styku, z tej samej reguły w importerze i w renderze (§11.11 pkt C) |
| 4 — wyłącznik z napędem silnikowym M | Q0 `qetBreakerZNapedem`: × na styku stałym; po LEWEJ stronie toru okrąg z literą M i kreskowana linia sprzężenia z przegubu noża; po prawej cewka wyłączająca (EN 60617 07-15-01) z zaciskiem `wylacz`, w którym kończy się linia wyłączania z bloku przekaźnika | aparat i napęd po tej samej stronie toru co na rysunku; litera M 8,4 j.św. (§11.1 wiersz 4). Cewka wyłączająca jest dodatkiem wykonawcy: rysunek prowadzi wyłączanie obwodem wtórnym, którego kanwa nie rysuje (wymaganie 5) |
| 5 — przekładnik prądowy, 1 rdzeń 200-400/5 A, 15 VA, kl. 5P20 | T1 `qetCurrentTransformer` w torze pod Q0, linia pomiarowa do przekaźnika pola. Na lewo od symbolu zaciski strony pierwotnej: P1 nad pierścieniem (od strony szyny, port `we` modelu) i P2 pod nim (port `wy`); obok tabliczka „200-400/5 A · 5P20” — przekładnia i klasa rdzenia z rekordu aparatu (`rdzenie`) | aparat, zaciski P1/P2 i zapis przekładni z klasą jak na rysunku. Moc rdzenia 15 VA jest w rekordzie i w karcie pola; tabliczka kanwy niesie przekładnię i klasy rdzeni (§11.11 pkt 6) |
| 6 — wskaźnik napięcia (pojemnościowy) | PF1 `qetVoltageIndicator` na węźle za T1 (od strony kabla) | jak na rysunku |
| 7 — głowica kablowa | GK `qetCableHead` (złącze wtykowe EN 60617 03-03-05) | jak na rysunku |
| 8 — przekładnik Ferrantiego 1/100 na kablu | T2 `qetCoreBalanceCt` na kablu za GK. W polu zajętym kabel ciągnie się dalej jako gałąź modelu, w polu wolnym tor kończy się symbolem „koniec kabla niepodłączony" (`bayReserve`) | aparat jak na rysunku. Przekładni 1/100 kanwa nie opisuje. T2 ma linię pomiarową z portu wtórnego do bloku przekaźnika: zasila funkcję 51N, czyli kryterium prądowe Io bloku „Zab. ziemnozwarciowe t1, t2" (czerwona linia z zacisku 2 na rysunku, §11.9 pkt 4). Kierunkowe 67N z Ferrantiego wchodzi wyłącznie przy potwierdzonym źródle 3U₀ (§11.2 pkt 4). Litera „3" znaku EN 60617 06-13-10 ma 8 j.św. (dawniej 5,4 j.św.; podłoga S9-7 obejmuje litery symboli, §11.11 pkt 5), czyli 11,8–22,1 px na zrzutach pola (skala kadru 1,48–2,76, §11.4) i 8 px przy wejściu w LOD2 |
| funkcje: I> (t1, t2), I>>, zab. ziemnozwarciowe (Io, U0 „Z, Zz"), ZS, LRW, SPZ, SCO1/SCO2/SCO-SPZ, sterownik pola | blok przekaźnika w ramce obok pola: okrąg „51 50", wiersz „51N · ZS · 50BF · 79 · SCO" — każdy kod raz, tekst od lewej krawędzi bloku (§11.4); ramka bloku i tło pola obejmują tusz wiersza w piśmie narysowanym na kanwie (§11.11, obrysy według planu); linia wyłączania do cewki Q0, linie pomiarowe z T1 i T2 | I> = 51, I>> = 50, Io = 51N (z T2), LRW = 50BF, SPZ = 79, SCO1/SCO2/SCO-SPZ = SCO: dawny kod złożony „SPZ/SCO" jest włączony do SCO — jedna funkcja słownika obejmuje wyłączenie od SCO1, SCO2 i ponowne załączenie po SCO (§11.11 pkt B). Kierunkowe 67N nie wchodzi, bo warunek źródła 3U₀ nie jest spełniony (ocena funkcji `NIE_OCENIONO` z wyjaśnieniem). Różnica: rysunek rozpisuje SCO1/SCO2/SCO-SPZ, zrzut pokazuje jedno „SCO". Obwodów okrężnych („Z, Zz", SCO, blokady ZS) zrzut nie rysuje — powiązania są danymi aparatów, bez schematu wtórnego (wymaganie 5) |
| — (rysunek nie podaje) | podpis pola „Pole liniowe GPZ 1" nad blokiem przekaźnika; numeru „52" przy Q0 nie ma — linia wyłączania kończy się na cewce Q0 (§11.9 pkt 5) | dodatek wykonawcy: rysunek ENEA nie ma oznaczeń literowo-cyfrowych ani podpisu pola w polu rysunku (§2.1) |

**Z.10, wykonanie z wyłącznikiem stałym** (§13 druk s.25, nie rysunek Z.10) — zrzuty
`pole-z10-staly-stan-nieznany-*`, `pole-z10-wylacznik-zamkniety-uziemnik-otwarty-*`,
`pole-z10-staly-odlaczony-uziemiony-*`, `okno-pola-z10-staly-z-odlacznikiem-*`. Q1 to odłącznik
szynowy `qetDisconnector`, a Q8 to uziemnik stały na węźle wyprowadzenia (`qetEarthSwitch`) —
za przekładnikiem prądowym, przed głowicą. Podstawą Q8 jest §13 s.I-25 („Wymagana jest
możliwość uziemienia każdego z pól, szyn zbiorczych poszczególnych sekcji oraz wyprowadzeń
liniowych za pośrednictwem uziemników stałych"), nie rysunek Z.10, który uziemnika stałego nie
ma (§11.9 pkt 2). Pozostałe aparaty jak wyżej. Po zmianie szablonu odłącznik i uziemnik nie
mają rekordu położenia, więc kafel jest szary (`#6B7280`) ze znakiem „?". Po ustawieniu położeń
z menu aparatu: Q1 i Q0 czerwone (zamknięte), Q8 zielony (otwarty); po odłączeniu i uziemieniu
(Q0 i Q1 otwarte, Q8 zamknięty — kolejność z blokad uziemnika): Q0 i Q1 zielone, Q8 czerwony.

**Z.11.1 (s.91)** — zrzuty `pole-z11-1-stan-wyjsciowy-*`, `pole-z11-1-wylacznik-otwarty-uziemiony-*`,
`okno-pola-z11-1-trojpolozeniowy-*`:

| Poz. rysunku | Na zrzucie | Odczyt wykonawcy |
|---|---|---|
| 1 — wskaźnik napięcia przy szynie | PF0 `qetVoltageIndicator` na przewodzie od szyny, nad Q1 (węzeł `szyna` modelu) | jak na rysunku |
| 2 — łącznik trójpołożeniowy z napędem | Q1 `qetThreePositionSwitchZNapedem` jak w Z.10 (napęd zasobnikowy z obsługą ręczną z rekordu aparatu) | jak w Z.10 |
| 3 — wyłącznik z napędem M | Q0 `qetBreakerZNapedem` | jak na rysunku |
| 4 — odgałęzienie: odłącznik z uziemieniem → głowica/złącze → przekładnik napięciowy SN/√3 / 0,1/√3 ×3 (I 10 VA 0,2; II 7,5 VA 0,2; III 7,5 VA 0,5/3P), za wyłącznikiem, przed CT | odgałęzienie z węzła między Q0 a T1. Q5 `qetThreePositionSwitch` w kaflu, GK1 `qetCableHead`, T3 `qetVoltageTransformer3` (cztery okręgi: pierwotne i trzy wtórne). Linia pomiarowa z T3 do przekaźnika | kolejność aparatów i miejsce odgałęzienia jak na rysunku. Tabliczki trzech uzwojeń są w rekordzie T3 (`uzwojenia`) i w karcie pola; na kanwie nie są opisane |
| 5 — CT 200-400/5, 1 rdzeń 15 VA 5P20 | T1 pod odgałęzieniem | jak w Z.10 |
| 6 — wskaźnik napięcia, głowica, Ferranti 1/100 | PF1, GK, T2 z linią pomiarową 51N do bloku przekaźnika. Pole wolne kończy się symbolem „koniec kabla niepodłączony" | jak w Z.10 |
| funkcje: I>, I>>, ziemnozw., U>, U<, f<, f>, df/dt, ZS (kierunkowe I>), LRW, SPZ, SPZE, wył. od zab. TR, SCO | blok przekaźnika w ramce: okrąg „51 50", wiersze „67 · 51N · 27 · 59 · 81U", „81O · 81R · ZS · 50BF · 79" i „SPZE · OWG · NZ · SCO" — każdy kod raz, tekst od wspólnej lewej krawędzi; ramka bloku i tło pola z tuszu wierszy narysowanych na kanwie (§11.11, obrysy według planu); linia wyłączania do cewki Q0, linie pomiarowe z T1, T2 i T3 | I> = 51, I>> = 50, ziemnozwarciowe Io = 51N (z T2), kierunkowe I> = 67 (z blokadą ZS), U> = 59, U< = 27, f< = 81U, f> = 81O, df/dt = 81R, LRW = 50BF, SPZ = 79, SPZE, wył. od zab. TR = OWG, SCO (dawne „SPZ/SCO" włączone do SCO, §11.11 pkt B). Kierunkowe ziemnozwarciowe 67N nie wchodzi (warunek §11.2 pkt 4). T3 ma trzy uzwojenia wtórne w gwieździe 0,1/√3, bez otwartego trójkąta (§11.2 pkt 1). Różnica: NZ (blokada załączenia przy napięciu zwrotnym) nie jest na liście funkcji rysunku — wzorzec dodaje ją z klasy pola (§4, IRiESD II.4.5.4.2). Zapas tuszu najszerszego wiersza do prawej krawędzi ramki: 6,7 px przy marginesie ramki od okręgu 7,4 px (skala kadru 1,48 px/j.św., pismo t4 podniesione podłogą opisów celu do 8,79 j.św.) (§11.4); dawny szacunek 0,62 em dawał tu 18,4 px |

Zmiany kanwy wykryte przy tej tabeli (2026-10-29):

- **Tło pola obejmuje podpis pola i opisy zabezpieczeń.** Po przysunięciu przekaźnika do pola
  (§11.6) tło pola (`panelePolGpz`) kończyło się w połowie podpisu „Pole liniowe GPZ 1". Spec
  zrzutów nie znajdował podpisu w panelu pola. Tło obejmuje teraz także etykiety pola:
  podpis, kody funkcji, wiersz źródła 3U₀, numer urządzenia, przekładnie CT i mocowanie VT.
  Ich prostokąty liczy ta sama funkcja co układ etykiet (`layout/labels.ts::prostokatEtykietyZakotwiczonej`,
  wspólna z `resolveSimpleAnchoredLabel`). Test: `poleLinioweGpz.test.tsx`, opis „tło pola
  obejmuje podpis pola i opisy jego zabezpieczeń" — fikstury × LOD, tła pól rozłączne parami;
  iniekcja dawnego tła daje czerwone 3 z 3 fikstur. Od 2026-10-30 kanwa liczy tło pola
  i ramkę bloku przekaźnika z prostokątów NARYSOWANYCH etykiet planu, bo podłogi pisma
  powiększają tekst ponad slot sceny (§11.11, obrysy według planu).
- **Selektory e2e ograniczone do kanwy.** Inspektor rysuje kartę pola z tym samym
  `data-device-ref` (`SchematPolaSn.tsx`), więc lokator aparatu bez zawężenia łapał dwa
  węzły (Q0 Z.11.1 policzony podwójnie). Stała `KANWA` w specu zrzutów.
- **Zrzuty okna pola pokazują kartę pola.** Karta leży w inspektorze pod panelem elementu,
  więc dawny zrzut całej strony pokazywał kanwę i panel elementu bez schematu pola i bez
  oceny. Teraz każdy zrzut jest zrzutem elementu (`zrzutyOknaPola`): schemat pola
  (`okno-pola-*-{motyw}`) i ocena pola wg klasy (`okno-pola-*-ocena-{motyw}`).
- **Tekst wierszy bloku przekaźnika od wspólnej lewej krawędzi.** Wiersze bloku mają wspólną
  lewą krawędź prostokątów, ale szerokość prostokąta była wtedy szacunkiem z długości tekstu
  (0,62 em na znak; od decyzji architekta §11.7 pkt 7 liczy ją tabela posuwów kroju, §11.11
  pkt 7), a tusz ma szerokość z metryk czcionki. Tekst wyśrodkowany w prostokącie zaczynał się
  więc w każdym wierszu gdzie indziej (zrzut Z.10: wiersz 1 od x = 535 px, wiersz 2 od x = 499
  px). Teraz każda etykieta warstwy adnotacji zabezpieczeń niesie `wyrownanieTekstu`
  (`layout/labels.ts`): z prawej strony kotwicy — od lewej krawędzi (`text-anchor: start`),
  wiersze R-2 stacji pod okręgiem — do prawej (`end`). Punkt zaczepu liczy jedna funkcja
  (`zaczepTekstuEtykiety`) dla kanwy i podglądu kompozycji, plan czytelności liczy tusz z tej
  samej krawędzi (`labelLegibility.ts::prostokatTuszu`), geometria sceny bez zmian (spec
  `SLD_CAD_SPEC_V3.md` §17.6). Testy: `poleLinioweGpz.test.tsx` (opis „tekst etykiet warstwy
  adnotacji zabezpieczeń zaczepiony w krawędzi prostokąta": 3 fikstury pól GPZ + stacje
  zamknięte + GPZ 110 kV × LOD {1, 2} × rodzaj adnotacji × strona; warunki bloku: wspólna lewa
  krawędź i zaczep w niej, iniekcje: zdjęte wyrównanie wiersza, wiersz przesunięty o GRID),
  `station.test.ts` (R-2 × lista 4 i 7 kodów), `gpzAdnotacjeNaKanwie.test.tsx` (DOM kanwy
  × motyw: `text-anchor` i `x` wierszy z prostokąta sceny), e2e `zmierzBlokPrzekaznika`.
  Iniekcje: renderer bez wyrównania — 2 z 2 testów DOM czerwone; kompozytor GPZ bez
  wyrównania — 9 czerwonych; stacja bez wyrównania — 2 czerwone.
- **Cała ocena pola na zrzucie i jedno przewijanie inspektora** (§7). Zrzut oceny ucinał ją na
  wysokości okna, a zrzuty Z.10 i Z.11.1 były bajtowo identyczne. Po powiększeniu okna ostatni
  wiersz oceny był nadal ucięty — o ok. 25 px pod ramką sekcji karty pola (ratio widoczności
  0,998), bo karta pola przewijała się w trzecim zagnieżdżonym pudełku. Naprawa u źródła
  w `ui2/legacy/LegacyInspektor.tsx`, testy i iniekcje w §7.
- **Zbliżenie na poziomie szczegółu pola** (§7, wiersz `pole-z10-zblizenie`): kółko do LOD2
  i uchwytu Q0 ≥ 3 × 48 px, z asercjami zamiast milczącego progu.

### 11.4. Pomiar kafli i bloku przekaźnika na żywej kanwie (wymaganie 7)

Spec `frontend/e2e/ux04-pole-liniowe-zrzuty-screenshot.spec.ts::zmierzKafle` mierzy w każdym
kadrze zrzutu pola (§7) każdy kafel łącznika pola dwiema drogami: `getBBox()` (wymiar
w świecie) i `boundingBox()` Playwrighta (wymiar na ekranie, po transformacji kamery), oraz
rysunek aparatu w kaflu (`[data-qet="glif"]`) tymi samymi drogami. Asercje: bok kafla 48 j.św.
z jednej stałej (`QET_BOK_KAFLA_STANU`), w = h z tolerancją 1 px na ekranie, jeden rozmiar
ekranowy wszystkich kafli kadru, stopień glifu w przedziale manifestu importu
`stopienSymboli.kafel` [0,55; 0,70] (jedno źródło z importerem, także na ekranie z tolerancją
1 px), kadr na LOD2. Wynik biegu: `test-results/ux04-pole-liniowe-pomiary-kafli.json`.

Pomiar biegu zrzutów 2026-10-30 (2 z 2 testów zielone; test Z.11.1 w drugim biegu — w pierwszym
przeglądarka padła po zabiciu procesów Chromium przez brak pamięci wspólnej grupy procesów
maszyny, zanim kadr pola został zmierzony): 46 pomiarów w 18 kadrach; największe |w − h| na
ekranie 0,00006 px; największe |bok − 48| w świecie 0; rozrzut boku ekranowego w kadrze
0,00006 px; stopień glifu 0,556–0,667 boku kafla (odłącznik w jednokładności 10/3, §11.11
pkt C: zamknięty 0,556, otwarty 0,639, nieustalony 0,667; pozostałe aparaty 0,583–0,617);
LOD 2 w każdym kadrze; skala kadru 1,48–2,76, czyli bok kafla na ekranie 71,0–132,5 px.
Pomiar 2026-10-29 przed decyzjami §11.7: stopień glifu 0,575–0,617, pozostałe wartości te same.

Iloczyn rodzaj × stan kafla × motyw pokryty na żywej kanwie: wyłącznik z napędem
{zamknięty, otwarty}, odłącznik {zamknięty, otwarty, nieustalony}, uziemnik {zamknięty,
otwarty, nieustalony}, łącznik trójpołożeniowy {zamknięty, otwarty, nieustalony; uziemiony —
kafel „zamknięty" z nożem na zestyku uziemiającym, `data-qet-polozenie="earthed"`} × motyw
{ciemny, jasny} — 22 z 24 komórek. Łącznik trójpołożeniowy ma dwa rysunki z rekordu napędu:
z napędem (Q1, `qetThreePositionSwitchZNapedem` — zamknięty, otwarty, nieustalony) i bez napędu
(Q5 odgałęzienia Z.11.1, `qetThreePositionSwitch` — zamknięty, nieustalony); w podziale na
rysunek aparatu zmierzonych komórek jest 26. Odłącznik otwarty i uziemnik zamknięty dochodzą krokiem 10
spec (pole stałe odłączone i uziemione); pomiar przed jego dodaniem: 18 z 24 komórek. Poza
żywą kanwą zostaje wyłącznik w stanie nieustalonym (2 komórki): ścieżka użytkownika zawsze
daje wyłącznikowi rekord położenia (szablon, operacja łączeniowa), więc tego stanu nie da się
osiągnąć z interfejsu. Wymiar kafla nie zależy od stanu — `symbols/glyphs.tsx::prostokatKaflaStanu`
przyjmuje wyłącznie identyfikator symbolu — a geometrię kafla wyłącznika w stanie
nieustalonym przypina `symbols/__tests__/kafelStanu.test.tsx` (rodzaj × wariant × stan
{zamknięty, otwarty, uziemiony, nieustalony, awaria, brak} × motyw {ciemny, jasny, eksport}).

Spec mierzy też blok przekaźnika każdego pola w kadrze (`zmierzBlokPrzekaznika`): lewe
krawędzie tuszu wierszy (`getBoundingClientRect` tekstów `#protection-codes-full` i
`#zrodlo-u0`), tusz wierszy wewnątrz ramki bloku (`[data-przekaznik="ramka-bloku"]`) z czterech
stron, szerokość tuszu każdego wiersza wobec sumy posuwów z tabeli kroju × pismo × skala
kamery (± 1 px) i zapas najszerszego wiersza do prawej krawędzi ramki w [margines, margines
+ 1 j.św.] (margines = odstęp lewej krawędzi ramki od okręgu). Ramka bloku i tło pola na kanwie
powstają z prostokątów narysowanych etykiet planu (§11.11, obrysy według planu). Tę samą
asercję szerokości przechodzi tabliczka T1 (`sprawdzPrzekladnikPradowy`). Wyniki:
`test-results/ux04-pole-liniowe-pomiary-bloku.json` i `…-pomiary-szerokosci.json`. Pomiar:
72 bloki w 18 kadrach, rozrzut lewych krawędzi tuszu 0 px (próg 1 px); 98 pomiarów szerokości,
największa różnica przeglądarka − tabela 0,27 px; zapas tuszu do prawej krawędzi ramki
6,7–7,2 px w kadrach pola Z.11.1 (skala 1,48, pismo t4 podniesione podłogą opisów celu do
8,79 j.św., margines 7,4 px) i 11,8–13,5 px w kadrach pola Z.10 (skala 2,37–2,76, margines
11,8–13,8 px) — w każdym bloku zapas równy marginesowi z dokładnością 0,75 px; najmniejszy
zapas dolny 10,4 px. Szacunek 0,62 em dawał 18,4 px (Z.11.1, wiersz z dawnym „SPZ/SCO")
i 80,4–93,5 px (Z.10). Pokrycie {Z.10, Z.11.1} × {cyfry, wielkie litery} × {ciemny, jasny}
(`oczekujPokryciaKlasSzerokosci`): w Z.11.1 wiersze bloku obu klas („67 · 51N · 27 · 59 ·
81U" i „81O · 81R · ZS · 50BF · 79" — cyfry, „SPZE · OWG · NZ · SCO" — wielkie litery)
i tabliczka T1; w Z.10 wiersz „51N · ZS · 50BF · 79 · SCO" (wielkie litery) i tabliczka T1
„200-400/5 A · 5P20" (cyfry). Podpisy aparatów po lewej stronie toru (`zmierzPodpisyPola`):
18 pomiarów, rozrzut prawych krawędzi tuszu najwyżej 0,63 px (próg 1 px).

Iniekcje (każda w osobnym biegu testu Z.10 bez zapisu zrzutów; plik przywrócony i porównany
`cmp`):

- kafel wyłącznika 52 × 52 j.św. (`prostokatKaflaStanu` dla `qetBreaker`
  i `qetBreakerZNapedem`) — bieg czerwony: „pole-z10-trojpolozeniowy-zamkniete-ciemny ·
  dark_scada · Q0 (qetBreakerZNapedem, zamkniety): szerokość kafla w świecie 52";
- glif pomniejszony do połowy (`<g transform="scale(0.5)">` wewnątrz `[data-qet="glif"]`
  w `qetGlyph`) — bieg czerwony: „… Q1 (qetThreePositionSwitch, zamkniety): stopień glifu
  0.308 boku kafla", oczekiwane ≥ 0,55;
- dawny kontener inspektora `h-full min-h-0 overflow-y-auto` (`LegacyInspektor.tsx`, §7) — bieg
  czerwony: „okno GPZ z selekcji: przewija się wyłącznie treść inspektora", przewijany
  `inspektor-panel-nad-oknem`.

Iniekcje warunków bloku przekaźnika (wiersz z kodami okręgu, ramka węższa o kratkę, zdjęte
wyrównanie wiersza, wiersz przesunięty o GRID) są w testach sceny (`poleLinioweGpz.test.tsx`,
§11.3 i §11.9); iniekcje obrysów według planu (ramka i tło sceny zamiast planu) —
w `canvas/__tests__/obrysyWgPlanu.test.tsx` (§11.11). Ten sam warunek e2e był czerwony przed
naprawą obrysów: „81O · 81R · ZS · 50BF · 79" 8,1 px poza ramką bloku w kadrze pola Z.11.1.

| Kadr | Motyw | Aparat | Symbol | Stan kafla | Kafel w świecie (j.św.) | Kafel na ekranie (px) | \|w − h\| (px) | Glif w świecie (stopień) | Glif na ekranie (px) | Skala | LOD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pole-z10-trojpolozeniowy-zamkniete-ciemny | ciemny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-trojpolozeniowy-zamkniete-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,76 | 2,76 | 2 |
| pole-z10-staly-stan-nieznany-ciemny | ciemny | Q1 | `qetDisconnector` | nieustalony | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 32,02 (0,67) | 81,20 | 2,37 | 2 |
| pole-z10-staly-stan-nieznany-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,80 (0,60) | 73,52 | 2,37 | 2 |
| pole-z10-staly-stan-nieznany-ciemny | ciemny | Q8 | `qetEarthSwitch` | nieustalony | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,00 (0,58) | 70,98 | 2,37 | 2 |
| pole-z10-trojpolozeniowy-zamkniete-jasny | jasny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-trojpolozeniowy-zamkniete-jasny | jasny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,76 | 2,76 | 2 |
| pole-z10-staly-stan-nieznany-jasny | jasny | Q1 | `qetDisconnector` | nieustalony | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 32,02 (0,67) | 81,20 | 2,37 | 2 |
| pole-z10-staly-stan-nieznany-jasny | jasny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,80 (0,60) | 73,52 | 2,37 | 2 |
| pole-z10-staly-stan-nieznany-jasny | jasny | Q8 | `qetEarthSwitch` | nieustalony | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,00 (0,58) | 70,98 | 2,37 | 2 |
| pole-z10-wylacznik-zamkniety-uziemnik-otwarty-ciemny | ciemny | Q1 | `qetDisconnector` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 26,67 (0,56) | 69,12 | 2,37 | 2 |
| pole-z10-wylacznik-zamkniety-uziemnik-otwarty-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,80 (0,60) | 73,52 | 2,37 | 2 |
| pole-z10-wylacznik-zamkniety-uziemnik-otwarty-ciemny | ciemny | Q8 | `qetEarthSwitch` | otwarty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,00 (0,58) | 70,98 | 2,37 | 2 |
| pole-z10-wylacznik-zamkniety-uziemnik-otwarty-jasny | jasny | Q1 | `qetDisconnector` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 26,67 (0,56) | 69,12 | 2,37 | 2 |
| pole-z10-wylacznik-zamkniety-uziemnik-otwarty-jasny | jasny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,80 (0,60) | 73,52 | 2,37 | 2 |
| pole-z10-wylacznik-zamkniety-uziemnik-otwarty-jasny | jasny | Q8 | `qetEarthSwitch` | otwarty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,00 (0,58) | 70,98 | 2,37 | 2 |
| pole-z10-wylacznik-otwarty-ciemny | ciemny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,01 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-jasny | jasny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-jasny | jasny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,01 | 2,76 | 2 |
| pole-z10-rozlaczone-ciemny | ciemny | Q1 | `qetThreePositionSwitchZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-rozlaczone-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,01 | 2,76 | 2 |
| pole-z10-rozlaczone-jasny | jasny | Q1 | `qetThreePositionSwitchZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-rozlaczone-jasny | jasny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,01 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-uziemiony-ciemny | ciemny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-uziemiony-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,01 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-uziemiony-jasny | jasny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 29,60 (0,62) | 87,22 | 2,76 | 2 |
| pole-z10-wylacznik-otwarty-uziemiony-jasny | jasny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 132,48 × 132,48 | 0,00 | 28,80 (0,60) | 85,01 | 2,76 | 2 |
| pole-z10-staly-odlaczony-uziemiony-ciemny | ciemny | Q1 | `qetDisconnector` | otwarty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 30,67 (0,64) | 77,29 | 2,37 | 2 |
| pole-z10-staly-odlaczony-uziemiony-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,80 (0,60) | 72,87 | 2,37 | 2 |
| pole-z10-staly-odlaczony-uziemiony-ciemny | ciemny | Q8 | `qetEarthSwitch` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,00 (0,58) | 71,76 | 2,37 | 2 |
| pole-z10-staly-odlaczony-uziemiony-jasny | jasny | Q1 | `qetDisconnector` | otwarty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 30,67 (0,64) | 77,29 | 2,37 | 2 |
| pole-z10-staly-odlaczony-uziemiony-jasny | jasny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,80 (0,60) | 72,87 | 2,37 | 2 |
| pole-z10-staly-odlaczony-uziemiony-jasny | jasny | Q8 | `qetEarthSwitch` | zamknięty | 48,00 × 48,00 | 113,57 × 113,57 | 0,00 | 28,00 (0,58) | 71,76 | 2,37 | 2 |
| pole-z11-1-stan-wyjsciowy-ciemny | ciemny | Q1 | `qetThreePositionSwitchZNapedem` | nieustalony | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-stan-wyjsciowy-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 28,80 (0,60) | 45,95 | 1,48 | 2 |
| pole-z11-1-stan-wyjsciowy-ciemny | ciemny | Q5 | `qetThreePositionSwitch` | nieustalony | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-stan-wyjsciowy-jasny | jasny | Q1 | `qetThreePositionSwitchZNapedem` | nieustalony | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-stan-wyjsciowy-jasny | jasny | Q0 | `qetBreakerZNapedem` | zamknięty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 28,80 (0,60) | 45,95 | 1,48 | 2 |
| pole-z11-1-stan-wyjsciowy-jasny | jasny | Q5 | `qetThreePositionSwitch` | nieustalony | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-wylacznik-otwarty-uziemiony-ciemny | ciemny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-wylacznik-otwarty-uziemiony-ciemny | ciemny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 28,80 (0,60) | 45,55 | 1,48 | 2 |
| pole-z11-1-wylacznik-otwarty-uziemiony-ciemny | ciemny | Q5 | `qetThreePositionSwitch` | zamknięty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-wylacznik-otwarty-uziemiony-jasny | jasny | Q1 | `qetThreePositionSwitchZNapedem` | zamknięty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |
| pole-z11-1-wylacznik-otwarty-uziemiony-jasny | jasny | Q0 | `qetBreakerZNapedem` | otwarty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 28,80 (0,60) | 45,55 | 1,48 | 2 |
| pole-z11-1-wylacznik-otwarty-uziemiony-jasny | jasny | Q5 | `qetThreePositionSwitch` | zamknięty | 48,00 × 48,00 | 70,98 × 70,98 | 0,00 | 29,60 (0,62) | 46,73 | 1,48 | 2 |

### 11.5. Kabel odejścia jako gałąź i rozłączność kabli różnych pól

Pomiar przed naprawą (fikstury `pole_liniowe_z10_gpz_staly_w_sekcji_1/2`, `pole_liniowe_z11_gpz_odgalezienie`):
kable odejścia pól 1.1 i 2.1 leżały współliniowo (y = 808) i krzyżowały się z ciągiem głównym
w fikcyjnym węźle T. Naprawa (`frontend/src/ui/sld/v3/scene/buildScene.ts`):

- **plan zagnieżdżony biegów otwartych z pól GPZ** (`poziomyBiegowOtwartychZPolGpz`, stałe
  `OPEN_RUN_BAND_BELOW`, `OPEN_RUN_LEVEL_STEP`): bieg z portu położonego dalej w prawo dostaje
  niższy poziom, ciąg główny i feedery otwarte jednego wiersza planowane RAZEM, kursor pasa
  ustawiany raz za najniższym poziomem — zero przecięć L z L;
- **przecięcie z pionem kabla z pola GPZ jest skrzyżowaniem (mostek), nie węzłem T**
  (`resolveTeeJunctions(…, kableZPolGpz)`): kabel z pola GPZ nie ma w modelu połączenia
  z cudzym ciągiem.

Model: odcinek kontynuujący ciąg SN obowiązuje JEDNA reguła ciągłości
(`backend/src/enm/domain_operations.py::_ciag_kontynuowany_z`, `_ciag_dla_startu`,
`_zapisz_ciag_z_portu`): ciąg wskazany jawnie musi kończyć się na zacisku startu (inaczej odmowa
`trunk.start_not_at_trunk_end`), start bez ciągu kończącego się na nim zakłada NOWY ciąg
(`corridor/<seed>/run`, `run_kind = branch`, port startu = zacisk startu) zamiast doklejać odcinek
do cudzej magistrali; przydział pola GPZ startu dwustronny. Testy: `backend/tests/enm/test_ciaglosc_ciagu_sn.py`
(7 startów × 3 wskazania ciągu; iniekcja „start doklejany do pierwszego ciągu" — czerwone)
i `frontend/src/ui/sld/v3/scene/__tests__/poleLinioweGpz.test.tsx` (fikstury × L0/L1/L2: zero
nakładań kabli różnych pól, zero przecięć, zero kropek T; iniekcje: dawna postać modelu,
przesunięcie kabla o GRID, nakładka z kropką T).

### 11.6. Przekaźnik obok pola, pas podpisów

Okrąg przekaźnika pola stoi w odstępie GRID…6·GRID od prawej krawędzi obrysu aparatów pola
i prawej krawędzi pasa podpisów aparatów (`<pole>#etykieta-aparatu-…`) — przypięte testem
„przekaźnik pola obok pola" (`poleLinioweGpz.test.tsx`).

### 11.7. Do decyzji architekta (zgłoszenia z pomiarem) — ROZSTRZYGNIĘTE 2026-10-30

**Stan: rozstrzygnięte.** Architekt rozstrzygnął punkty 1–8 dnia 2026-10-30 i polecił wdrożyć
je w tej karcie; wykonanie z testami i pomiarami jest w §11.11. Tekst zgłoszeń poniżej zostaje
jako zapis stanu sprzed decyzji (liczby i opisy dotyczą bazy `dbe7c130b`).

Zgłoszenia poniżej nie zostały zmienione w tej karcie. Rozstrzygnięcie zmienia akceptację
cudzej warstwy albo decyzję zarządcy, dlatego decyzję podejmuje architekt (sesja główna).

1. **Kropki T bez węzła w modelu (S7-P2, `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`).** Reguła
   S7-P2 zamienia przecięcie kabli SN na węzeł T: rozcina kabel poziomy w punkcie styku i rysuje
   kropkę `junction`, a wszystko po to, żeby `interiorCrossings` sn × sn = 0. Sonda tej karty
   na fiksturach scen przeszła 58 plików i znalazła 92 kropki T. Żadna z nich (92 z 92) nie
   odpowiada węzłowi modelu, bo kable się krzyżują, ale elektrycznie nie są połączone.
   Rysunek pokazuje więc połączenie, którego w sieci nie ma (fikcja, wymaganie 8). Karta
   naprawiła tylko podzbiór „kabel z pola GPZ" (`resolveTeeJunctions(…, kableZPolGpz)`: takie
   przecięcie jest mostkiem §22.1). Odwrócenie reguły dla pozostałych kabli zmienia warunek
   `crossingCount = 0` w odbiorze `accept:sld-v3` i rozstrzygnięcie zarządcy S7-P2.
2. **L0 (KD-5): wspólny pion zejść kilku pól.** Na L0 GPZ jest zwinięty do jednego znaku.
   Zejścia kabli czterech pól liniowych z dwóch sekcji biegną wtedy jednym pionem x = 128
   (y od 536 do 552, 568 i 584), więc cztery różne kable nakładają się na jednym odcinku. Na
   L1/L2 kable są rozłączne (§11.5). Zmiana wymaga decyzji o reprezentacji L0 (KD-5).
3. **Trzy konwencje `starting_port_ref`.** Model zapisuje port startu ciągu SN na trzy sposoby:
   `bay/…/001` (port pola GPZ), `…/terminal` (zacisk) i `….BRANCH` (tej postaci używa operacja
   `start_branch`). Reguła ciągłości ciągu (§11.5) porównuje zacisk startu z końcem ciągu po
   normalizacji. Trzy postaci tej samej informacji grożą rozjazdem przy następnym konsumencie,
   a ujednolicenie zmienia kontrakt operacji domenowych i zapisane fikstury.
4. **Fikstura `gpzProtectionDataPath` (wachlarz pól GPZ).** Ciąg główny wychodzi z pola
   lewego i kończy się stacją wiersza 0, a kabel odgałęzienia wychodzi z pola prawego
   i kończy się stacją wiersza niższego. Przy torach ortogonalnych wchodzących do stacji od
   lewej jedno przecięcie tych dwóch kabli jest konieczne topologicznie. Gdyby poziom kabla
   z pola lewego zszedł głębiej, jego pion powrotu do stacji wiersza 0 przeciąłby poziom kabla
   z pola prawego. Dawniej to przecięcie było fikcyjną kropką T. Test
   `buildScene.odejsciaZagniezdzone.test.ts` przypina teraz dokładnie to jedno przecięcie
   (para kabli) i jego mostek, a nie „zero przecięć". Pozostaje decyzja, czy ten układ
   wachlarza jest docelowy.
5. **Litera „3" przekładnika Ferrantiego (EN 60617 06-13-10).** Po jednokładności symbolu
   toru ×1,5 (§11.9 pkt 6) ma 5,4 j.św. (przed korektą 3,6), czyli 5,5 px przy wejściu w LOD2.
   Kanon traktuje literę w symbolu jako część symbolu IEC, a nie napis (`cad/CadSymbol.tsx`),
   więc podłoga 8 px napisów (S9-7, `MIN_TEXT_SCREEN_PX`) jej nie obejmuje. Ta sama klasa
   dotyczy liter symboli kanonicznych spoza pola GPZ: „G" maszyny (7 j.św.,
   `cad/cadSymbolRegistry.ts`), „3" przekładnika Ferrantiego w symbolu kanonicznym (3,6 j.św.,
   tamże) oraz tekstów glifów 6–8 j.św. (`symbols/glyphs.tsx`: ostrzeżenia luki pola, oznaczenie
   portalu nN). Literę na kaflu łącznika (M napędu, 8,4 j.św.) ta karta powiększyła i przypięła
   testem. Litery „3" nie da się powiększyć do 8 px w pierścieniu o średnicy 24 j.św. bez
   nałożenia na kreskę znaku trzech przewodów. O tym, czy podłoga S9-7 obejmuje litery symboli,
   rozstrzyga architekt.
6. **Oznaczenia zacisków P1/P2 przekładnika prądowego.** Rysunek Z.10 (s.89) opisuje zaciski
   pierwotne T1 jako P1 (od szyny) i P2. Wzorzec `scripts/no_codenames_guard.py::CODENAME_PATTERN`
   (`P` + cyfra, z wyjątkiem `P0`) traktuje te napisy jako kryptonimy projektu i zakazuje ich
   w tekstach interfejsu, więc kanwa ich nie rysuje (biegunowość zacisków jest w rekordzie
   portów aparatu: `we` od wyłącznika). Dopuszczenie oznaczeń zacisków IEC 61869-2 (P1/P2,
   S1/S2) w napisach schematu wymaga zmiany strażnika (wyjątek dla etykiet zacisków
   przekładnika) — decyzja architekta.
7. **Szacunek szerokości tekstu `core/text.ts::measureTextWidth` (0,62 em na znak).** Geometria
   sceny liczy szerokość każdej etykiety z liczby znaków, a przeglądarka rysuje tusz z metryk
   czcionki. Ramka bloku przekaźnika jest liczona z szacunku, więc jej zapas do tuszu zależy
   od treści wiersza: w polach Z.10 (wiersz „51N · ZS · 50BF · 79 · SCO", cyfry i separatory
   węższe od szacunku) ramka ma 80,4–93,5 px pustego miejsca na prawo od tuszu, a w polu
   Z.11.1 (wiersz „SPZE · OWG · NZ · SCO · SPZ/SCO", pogrubione wielkie litery szersze od
   średniej) — 18,4 px (§11.4). Tekst z większą liczbą wielkich liter może wyjść poza ramkę;
   dziś pilnuje tego tylko e2e zrzutów. Wyrównanie tekstu (§11.3, „Zmiany kanwy") usuwa skutek
   rozjazdu wierszy, nie przyczynę. Zastąpienie szacunku tabelą posuwów znaków kroju (jak
   metryka znaku w importerze symboli, `scripts/import_qet_pole_sn.py`) zmienia geometrię
   każdej etykiety całego SLD (sceny, kolizje etykiet, fikstury i odbiór `accept:sld-v3`) —
   decyzja architekta.
8. **Prześwit między podpisem aparatu a symbolem.** Podpisy aparatów pola (Q1, Q0, T1, PF1, GK,
   T2 — strona `left` planu etykiet) są wyśrodkowane w slocie o szerokości z szacunku, więc ich
   prawa krawędź tuszu dryfuje: na zrzucie `pole-z10-wylacznik-zamkniety-uziemnik-otwarty-jasny`
   od x = 64 px (PF1) do x = 73 px (GK) przy wspólnej krawędzi slotów. Zaczep tekstu w krawędzi
   (jak dla etykiet zabezpieczeń) wymaga, żeby etykieta znała stronę, po której stoi względem
   kotwicy — dziś strona planu (`PlannedLabel`) nie trafia do węzła tekstu, a ta karta
   zmieniła wyłącznie warstwę adnotacji zabezpieczeń. Rozszerzenie na wszystkie etykiety
   `dane` i podpisy aparatów zmienia wygląd całego SLD — decyzja architekta.

### 11.8. Bramka sesji głównej na `dbe7c130b` (4 czerwone) — naprawy u źródła

Bramka uruchomiona na scaleniu `dbe7c130b` zwróciła 4 czerwone testy. Każdy naprawiłem
u źródła i przypiąłem testem. Kody wyjścia przebiegu celowanego są w meldunku karty.

1. **`tests/application/test_fikstury_enm_generowane.py::test_sieci_kontraktow_sld_sa_bajtowo_rowne_generatorowi`.**
   Fikstury na `dbe7c130b` wygenerowano na gałęzi karty pola BKR (`687a2ef65`), czyli przed
   scaleniem z gałęzią pola liniowego. Brakowało w nich więc zmian modelu pól z `e4b778d35`.
   Po regeneracji generatorem (`tests/reference_networks/fikstury_enm_sld.py --write`)
   różnica jest zamierzona:
   - `gpz110kvBkr*.enm.json`: pola liniowe GPZ z szablonu Z.10 (`bay_template_ref`,
     `config_id`, 24 aparaty z portami, `naped`, `przekladnia`, `rdzenie`, `uzwojenia`,
     `odgalezienie`, `stan_obiektu`, `klasa_pola`); `protection_codes` z `[]` na
     `["51","50","ZS","50BF","79","SCO","SPZ/SCO"]`;
   - `b2Droga-add_sn_bay`: `naped`, `przekladnia` oraz 67N zdjęte z 3 pól (reguła §11.2 pkt 4);
   - z tej karty: pola `funkcje_eaz_zasilane` i `funkcje_eaz_wylaczajace` każdego aparatu
     pola i `Bay.zrodlo_u0_ref`. Pomiar w `gpz110kvBkr.enm.json`: w 4 polach Z.10 przekładnik
     T1 ma niepustą listę funkcji zasilanych, wyłącznik Q0 — niepustą listę funkcji
     wyłączających, pozostałe aparaty mają listy puste (wzorzec ich nie wiąże), a
     `zrodlo_u0_ref` jest `null` we wszystkich polach (sieć bez pola Z.17).
2. **`test_demo_oze_sc_jest_bajtowo_rowne_generatorowi`.** W `demoOzeSc.enm.json` zmiany
   modelu są takie:
   - pola źródła DER: Q2 → Q9 (odłącznik liniowy) i Q9 → Q8 (uziemnik), z `e4b778d35`;
   - `naped` i `przekladnia` w 16 aparatach;
   - 67N zdjęte z zestawu 26 pól `["67","67N","27","59","81U","81O","81R","anti-islanding"]`
     przez regułę 67N (`funkcje_eaz_roli` — pole wytwórcze nie ma potwierdzonego źródła 3U₀).

   W `demoOzeSc.sc.json` zmienia się WYŁĄCZNIE `builder_snapshot_hash` (`4e55c817…` →
   `d76a3f23…`). Wszystkie liczby wyniku zwarciowego są bajtowo bez zmian. Wyjaśnienie: wynik
   zwarciowy nie zależy od kodów funkcji zabezpieczeń, oznaczeń aparatów ani rekordów napędu
   i przekładni, a hash migawki budowniczego obejmuje model w całości.
3. **`tests/enm/test_rejestr_zdarzen_domenowych.py::test_rejestr_rowny_typom_emitowanym`.**
   Operacja `set_bay_apparatus_position` (`enm/polozenie_aparatu_pola.py:200`) emitowała typ
   `BAY_APPARATUS_POSITION_SET` spoza rejestru `DOMAIN_EVENT_TYPES`. Typ dopisałem do
   rejestru (`enm/domain_ops_models.py`) w porządku alfabetycznym, a test operacji łączników
   przypina go wprost. Test nie został wyłączony.
4. **`tests/api/test_openapi_snapshot.py`.** Snapshot zregenerowałem
   (`scripts/generuj_snapshot_openapi.py`) PO zmianie reguły 67N. Zmienia się wyłącznie opis
   `GET /api/catalog/bay-protection-codes` (docstring `api/catalog.py::list_bay_protection_codes`).
   Doszło zdanie karty pola BKR o roli bez szablonu kanonicznego i zdanie tej karty: funkcja
   warunkowa 67N nie wchodzi do zestawu roli. Schemat odpowiedzi
   (`dict[str, list[str]]`) i pozostałe ścieżki są bez zmian.

### 11.9. Uwagi sesji głównej do zrzutów pola (2026-10-29) → wykonanie → test

Sesja główna porównała zrzut `pole-z10-wylacznik-zamkniety-uziemnik-otwarty-jasny` z rysunkiem
Z.10 (s.89) i zgłosiła sześć uwag. Każda jest wykonana u źródła (dane manifestu importu
symboli, model, kompozycja) i przypięta testem z iniekcją. To NIE jest werdykt wizualny —
werdykt B-02 wydaje właściciel na zrzutach §7.

| # | Uwaga | Wykonanie (pomiar przed → po) | Test (iloczyn cech, iniekcja) |
|---|---|---|---|
| 1 | glify w kaflach miniaturowe (× w Q0 i poprzeczka Q1 ok. 10 % boku kafla, uziemnik Q8 ledwo widoczny); glif 55–70 % boku, kreska proporcjonalna do kafla; pomiar bbox glifu względem kafla z dolnym progiem i iniekcją | importer QET: role prymitywów (przewód / glif / osprzęt), jednokładność `skalaRysunku`, skala lokalna znaku rodzaju `skalaLokalna`, przedział `stopienSymboli.kafel` [0,55; 0,70] sprawdzany przy imporcie; kreska glifu `QET_KRESKA_GLIFU` = 2 j.św. = bok/24 (przewody 1,2 j.św.). Stopień glifu (wysokość rysunku aparatu bez przewodów i osprzętu / bok kafla): wyłącznik 0,20 → 0,60–0,61, odłącznik 0,19–0,20 → 0,575–0,61, rozłącznik 0,20 → 0,60–0,61, rozłącznik z bezpiecznikami 0,19 → 0,575, uziemnik 0,23 → 0,58, łącznik trójpołożeniowy 0,45 → 0,62; × wyłącznika 3,2 → 9,6 j.św. Wzór kreski przerywanej sceny `w 2w` (`cad/CadSymbol.tsx::wzorKreskiPrzerywanejSceny`) — dawny wzór „1,5 1” przy okrągłych końcach linii zlewał się w linię ciągłą (nóż w położeniu nieustalonym, linia sprzężenia napędu) | `kafelStanu.test.tsx` („stopień glifu i kreska proporcjonalna do kafla”: 7 łączników × każde położenie noża, stopień z prymitywów niezależnie od pola `glif` pliku generowanego; kreska glifu, przewodów i osprzętu; przerwa wzoru > grubość kreski); `test_qet_pole_sn_import.py` (iniekcja skali rysunku 4 → „nie mieści się w kaflu”, przedział [0,55; 0,60] → „stopień glifu 0.609 … closed”); e2e `zmierzKafle` — `getBBox()` i `boundingBox()` `[data-qet="glif"]` względem kafla w każdym kadrze × motyw × stan (§11.4), iniekcja glifu pomniejszonego do połowy — czerwony bieg |
| 2 | położenie uziemnika: w Z.10 uziemnik jest u GÓRY pola, przy torze między szyną a stykiem odłączającym; sprawdzić punkt przyłączenia na rysunku i odwzorować w topologii ENM i na kanwie | rysunek Z.10 (s.89): uziemienie jest zestykiem uziemiającym łącznika trójpołożeniowego Q1 — prawy zestyk stały u góry pola, obok zestyku szynowego; nóż obraca się w przegubie od strony pola, więc w położeniu „uziemiony” uziemia tor pola za Q1 (przez zamknięty wyłącznik — kabel; §13 s.I-25: „dopuszcza się uziemienie pola poprzez zamknięty wyłącznik”). Model szablonu Z.10 trójpołożeniowego (`we: szyna`, `wy: w1`, położenie `uziemiony` na rekordzie Q1) odpowiada temu punktowi — topologia bez zmian. Kanwa: znak uziemienia przeniesiony nad zestyk prawy (u góry, przy torze), przed korektą stał z prawej strony zestyku (poziomo). Wykonanie z wyłącznikiem stałym (Q1 odłącznik + uziemnik stały Q8 na węźle `w3` wyprowadzenia) NIE pochodzi z rysunku Z.10 — podstawą jest §13 s.I-25: „Wymagana jest możliwość uziemienia każdego z pól, szyn zbiorczych poszczególnych sekcji oraz wyprowadzeń liniowych za pośrednictwem uziemników stałych”. Rozbieżność: rysunek Z.10 nie ma uziemnika stałego; tekst §13 wymaga go dla wyprowadzenia liniowego — Q8 stoi więc na wyprowadzeniu (węzeł za przekładnikiem prądowym, przed głowicą), nie u góry pola. Kwadratu napędu łącznika z kreskowaną blokadą (rysunek: kwadrat przy nożu Q1) kanwa nie rysuje — model nie ma rekordu napędu łącznika trójpołożeniowego (§9.6 L1), a decyzja właściciela pkt 2 zakazuje dodawania aparatów | `test_qet_pole_sn_import.py` (złożenie łącznika trójpołożeniowego: uziemienie nad zestykiem prawym, zacisk szynowy wewnątrz gabarytu z deklaracją `portyWewnatrzGabarytu`); `kafelStanu.test.tsx`; `poleLinioweGpz.test.tsx` (tor z modelu: kolejność oznaczeń × wykonanie łączników, Q8 jako aparat boczny na węźle modelu) |
| 3 | kolejność toru wg Z.10: szyna → uziemnik / styk ○ → wyłącznik × z M → CT 200-400/5 (P1/P2) → wskaźnik napięcia pojemnościowy → głowica GK → Ferranti 1/100 → kabel | kolejność toru sceny z modelu (porty aparatów): Q1 (łącznik trójpołożeniowy z zestykiem uziemiającym) → Q0 (× z napędem M) → T1 → PF1 (na węźle `w3`) → GK → T2 → kabel odejścia (gałąź modelu) albo koniec kabla niepodłączony — zgodna z rysunkiem pozycja po pozycji (§11.3). Różnice zapisane w §11.3: zaciski P1/P2 i przekładnia „200-400/5” nie są opisane na kanwie | `poleLinioweGpz.test.tsx` (tabela odczytu rysunku `torOczekiwany` × fikstury × LOD; iniekcja zamiany portów zmienia kolejność); e2e — lista `oznaczenie:rodzaj` z modelu |
| 4 | przekładnik Ferrantiego T2 bez połączenia z przekaźnikiem; zabezpieczenie ziemnozwarciowe z Ferrantiego obowiązkowe, kierunkowość warunkowa (67N), funkcja prądowa ma być widoczna i powiązana z T2; 3U₀ z obwodów „Z, Zz” / „UL1, UL2, UL3, N” wskazuje pole pomiaru napięcia (Z.17) | rysunek Z.10/Z.11.1: czerwona linia z zacisku 2 przekładnika Ferrantiego do bloku „Zab. ziemnozwarciowe t1, t2” — kryterium prądowe Io, a strzałka kierunku nad t1/t2 i wejście „Z, Zz” (U0) — kierunkowość. Wzorzec: funkcja 51N (kryterium prądowe Io, bez warunku) w zestawie Z.10/Z.11.1/Z.11 (`bay_templates._FUNKCJE_EAZ_WYKONANIA_POLA`), powiązanie 51N z przekładnikiem Ferrantiego w obwodach wzorca (`obwody_wtorne_pola.py`, weryfikacja `INTERPRETACJA` z uwagą: kryterium bez kierunku jako osobna funkcja to wniosek z decyzji właściciela), 67N — wyłącznie przy potwierdzonym źródle 3U₀ (§11.2 pkt 4). Na kanwie T2 ma linię pomiarową z portu wtórnego do przekaźnika w każdym polu; 51N jest w bloku przekaźnika. Obwody „Z, Zz” i „UL1, UL2, UL3, N” rysunków Z.10/Z.11.1 są wejściami okrężnymi z pola pomiaru napięcia Z.17 (weryfikacja sygnałów `ZWERYFIKOWANE_NA_RYSUNKU`, dowód §11.2 pkt 3) | backend: `test_powiazania_obwodow_aparatow_pola.py` (tabela rysunku Z.11.1 × źródło 3U₀ {brak, Z.17}: T2 zasila 51N, z potwierdzonym źródłem także 67N; Q0 wyłączany przez 51N), `test_zrodlo_napiecia_zerowego.py` (51N w każdej komórce iloczynu {Z10, Z11_1} × {Z.17 obecne, brak} × {potwierdzone, nie}; iniekcja „T2 nie zasila 51N” — 6/6 czerwonych), `test_obwody_wtorne_pola.py` (wyrocznia rysunku 51N i profil `OBOWIAZKOWA`), fikstury z generatorów (51N w polach Z.10/Z.11.1 i w `funkcje_eaz_zasilane` T2); front: `poleLinioweGpz.test.tsx` („blok przekaźnika”: T2 z linią pomiarową z portu `wtorny` × fikstury; iniekcja zdjęcia linii T2) |
| 5 | oderwane etykiety: „52” bez związku, lista funkcji poza okręgiem, okrąg „51 50” powtarza część listy; jedna reprezentacja przy przekaźniku; linia wyłączania do cewki Q0, nie do środka kafla | blok przekaźnika układu powiązań (`compose/gpz.ts`, `protectionMarking.ts`): okrąg z dwoma pierwszymi kodami, pozostałe kody w wierszach po prawej (`wierszeKodowPozaOkregiem`) — każdy kod raz; ramka bloku (`ramkaBlokuPrzekaznika`, rysuje ją glif przekaźnika z meta sceny, kreska 0,8 j.św. cieńsza od okręgu) obejmuje okrąg, wiersze i odniesienie źródła 3U₀; rezerwacja kolumny i tło pola liczone z ramki. Wyłącznik ma cewkę wyłączającą (EN 60617 07-15-01, osprzęt po prawej stronie toru) z portem wtórnym `wylacz` na krawędzi kafla — linia wyłączania kończy się w nim; numer „52” nie jest rysowany, gdy linia kończy się na cewce. Spec `docs/sld/SLD_CAD_SPEC_V3.md` §17.3–§17.6 doprecyzowana; układ stacji (R-2) bez zmian | `poleLinioweGpz.test.tsx` („blok przekaźnika”: fikstury Z.10 stały × Z.10 trójpołożeniowy × Z.11.1 × Z.11 × sekcja × pole zajęte/wolne; wyrocznia: kody bloku = `Bay.protection_codes` bez powtórzeń, ramka obejmuje elementy bloku i nie zachodzi na obce etykiety ani symbole, brak „52”, linia wyłączania w porcie `wylacz`; iniekcje: ramka węższa o kratkę, lista z kodami okręgu, „52” dodane, linia do środka kafla, linia T2 zdjęta — każda czerwona); test glifu ramki (ten sam prostokąt co meta sceny, kreska cieńsza od okręgu); `compose/__tests__/gpz.test.ts` (oznacznik pola na wysokości ramki bloku) |
| 6 | proporcje: symbole toru (T1, GK, PF1) bardzo małe wobec kafli; spójny stopień symboli LOD2 | przedział `stopienSymboli.tor` [0,33; 0,70] sprawdzany przy imporcie; jednokładność symboli toru: T1 ×3 (stopień 0,17 → 0,50), T2 ×1,5 (0,33 → 0,50), GK ×2 (0,21 → 0,42), PF ×4 (0,08 → 0,33); przekładnik napięciowy 0,575 bez zmiany skali | `test_qet_pole_sn_import.py` (stopień symboli toru, iniekcje); zrzuty §7 |

**Defekty z oględzin powtórzonego biegu zrzutów (po wykonaniu uwag 1–6).** Wszystkie zrzuty §7
powstały ponownie w biegu zielonym (2 z 2 testów). Oględziny wykonawcy wykryły cztery defekty;
każdy naprawiłem u źródła i przypiąłem testem z iniekcją. Werdyktu wizualnego nie wystawiam.

1. **Wiersze bloku przekaźnika rozjechane w poziomie** (wiersz 1 od x = 535 px, wiersz 2 od
   x = 499 px na zrzucie Z.10). Naprawa: zaczep tekstu w krawędzi prostokąta (§11.3, „Zmiany
   kanwy"). Pomiar po naprawie: rozrzut lewych krawędzi tuszu 0 px w 72 blokach (§11.4).
2. **Zrzut oceny pola ucięty na wysokości okna, Z.10 i Z.11.1 bajtowo identyczne.** Naprawa:
   zrzut całej oceny i kontrola dubli wszystkich zrzutów biegu (§7).
3. **Ostatni wiersz oceny ucięty pod ramką sekcji karty pola — trzy zagnieżdżone przewijania
   inspektora.** Naprawa w `ui2/legacy/LegacyInspektor.tsx` dla całej klasy okien E-10…E-15
   pod panelem elementu (§7). Test e2e: okno GPZ, odcinka i pola × motyw × szerokość
   inspektora; vitest: okno stacji i odcinka × status wyników. Iniekcja dawnego kontenera: bieg
   e2e czerwony, vitest 6 z 6 czerwonych.
4. **Zbliżenie kończyło się na LOD1** (okrąg przekaźnika bez kodów i bez linii powiązań).
   Naprawa: kółko działa aż do LOD2 i uchwytu Q0 ≥ 3 × 48 px, oba warunki z asercją (§7).

### 11.10. Testy świeżości i strażniki spoza bramki — naprawy u źródła (2026-10-29)

Po uwagach §11.9 uruchomiłem testy świeżości generatorów spoza listy bramki §11.8 oraz komplet
strażników z CI (`scripts/guardy_z_ci.py`). Wykryte defekty naprawiłem u źródła i przypiąłem
testami. Żaden test ani strażnik nie został wyłączony.

1. **`tests/application/test_companions_generated.py`.** Artefakt `sldNetwork53.ts` odtworzyłem
   generatorem `scripts/emit_sld_network_fixture.py`. Zmienia się wyłącznie `source_hash`,
   bo ta karta zregenerowała fiksturę substratu `sldSubstrate52s`.
2. **`tests/network_model/test_field_configurations_catalog.py`.** Artefakt
   `fieldConfigurationsCatalog.json` odtworzyłem generatorem
   `scripts/gen_field_configurations_catalog.py`. Doszła konfiguracja
   `kanoniczny:bay_template_gpz_pomiar_napiecia_enea_z17`, więc katalog ma 22 konfiguracje
   kanoniczne zamiast 21. Test przypina teraz ten szablon wprost. W 15 konfiguracjach
   `protection_codes` traci 67N zgodnie z regułą §11.2 pkt 4. W 9 polach liniowych GPZ na jej
   miejscu staje 51N. Innych różnic nie ma.
3. **Wyrocznia odgałęzień `ui/sld/v3/scene/__tests__/torZPortowStacjaGpz.test.ts`.** Po
   regeneracji katalogu wyrocznia dała 4 czerwone przypadki: pole Z.17 w kompozytorze stacji
   i GPZ, iniekcje „brak” i „odgałęzienie poza torem”. Wyrocznia kodowała dawny warunek
   „brak rozwidlenia węzła → zbiór pusty”. Kanon tej karty
   (`rodzaje_aparatury.aparaty_poza_torem_glownym`) dopuszcza odgałęzienie z węzła końca toru:
   łącznik trójpołożeniowy Z.17 kończy tor, a złącze i przekładnik leżą w odgałęzieniu za nim.
   Wyrocznię przepisałem do tego kanonu. Intencja się nie zmienia: zbiór liczony wyłącznie
   z portów. Po zmianie sprawdzenia odczepu, przewodów i pasa podpisów dla Z.17 biegną do końca
   i są zielone.
4. **`css_kolizje_klas_guard`.** Klasę `.mvd-ocena-tabela` definiowały dwa globalne arkusze:
   ekran oceny wyników (`ui2/wyniki/ocena/ocena.css`) i karta pola
   (`ui/field/ocenaPolaLiniowego.css`). Tabele karty pola dostawały przez to odstępy i nagłówki
   bez zawijania z ekranu oceny. Tabela ekranu oceny dostawała z kolei regułę wąskiego
   kontenera. Klasa karty pola nazywa się teraz `mvd-ocena-pola-tabela`. Zrzuty oceny §7
   powstały ponownie po tej zmianie.
5. **`nazwa_bez_identyfikatora_guard`.** Opis kandydata źródła 3U₀
   (`enm/zrodlo_napiecia_zerowego.py::kandydaci_zrodla_u0`) brał `device_ref`, gdy przekładnik
   nie miał oznaczenia. Teraz jedna reguła `_oznaczenie_aparatu` daje oznaczenie z modelu albo
   słowa „przekładnik napięciowy”. To samo dotyczy opisu kandydata i przyczyny potwierdzonego
   źródła. Ta sama klasa wystąpiła w lustrze schematu (`ui/sld/v2/model/zrodloNapieciaZerowego.ts`):
   `vtOznaczenie` i `poleZrodlaOznaczenie` brały identyfikator aparatu i pola. Teraz biorą
   oznaczenie z modelu albo „przekładnik napięciowy” i „bez numeru”. Testy:
   - `test_zrodlo_napiecia_zerowego.py::test_teksty_zrodla_u0_bez_identyfikatora_aparatu` —
     iloczyn {Z10, Z11_1} × oznaczenie przekładnika {jest, brak} × tekst {opis kandydata,
     przyczyna}; iniekcja dawnego zapasu daje 2 z 4 przypadków czerwonych;
   - `zrodloNapieciaZerowego.parytet.test.ts` — iloczyn oznaczenie przekładnika {jest, brak}
     × oznaczenie pola {numer, nazwa, brak}; iniekcja daje 4 z 6 przypadków czerwonych.
6. **Pin `solver_input_substitute_guard`.** Pomiar `contract_fields()` na drzewie bazy
   `dbe7c130b` (`git archive`) daje 4458, zgodnie z pinem, a na drzewie karty 4469. Różnica
   +11, −0 to nowe pola kontraktu tej karty, bez nowych podstawień. Liczba plików skanu rośnie
   z 609 do 610, a w `enm` z 82 do 83, bo doszedł `enm/zrodlo_napiecia_zerowego.py`. Dług
   i wykluczenia się nie zmieniają.
7. **Nazwa pola kontraktu w tekście karty pola.** Oględziny ponownych zrzutów oceny wykazały,
   że uwaga sygnału „Z, Zz” (`network_model/catalog/obwody_wtorne_pola.py`) kończyła się słowami
   „powiązanie w modelu: `Bay.zrodlo_u0_ref`”. Projektant widział więc nazwę pola kontraktu.
   Teraz tekst brzmi: „powiązanie wskazuje się w wyposażeniu pola: »Źródło napięcia zerowego
   3U₀«”, czyli tak jak etykieta kontrolki w `EdytorWyposazeniaPola.tsx`. Przeszukałem teksty
   dla projektanta we wszystkich modułach backendu zmienionych w tej karcie (stałe napisów poza
   docstringami, wzorzec identyfikatora z podkreśleniem). Innego wystąpienia nie ma. Fikstura
   `ocena_pola_liniowego.json` jest odtworzona generatorem
   (`tests/ci/test_parytet_oceny_pola_liniowego.py`) i różni się wyłącznie tą uwagą (4 wystąpienia).

### 11.11. Rozstrzygnięcia architekta 2026-10-30 (§11.7 pkt 1–8) i defekty z oględzin — wykonanie

Architekt rozstrzygnął zgłoszenia §11.7 pkt 1–8 i dodał trzy zlecenia z oględzin zrzutów: napęd
łącznika jako atrybut aparatu, deduplikację funkcji EAZ u źródła i poprawkę glifu Q1. Wszystko
jest wykonane w tej karcie. Zmiana dotyczy całego SLD, dlatego fikstury odtworzyłem wyłącznie
generatorami repozytorium (liczba i wyjaśnienie różnic niżej). Werdyktu wizualnego nie wystawiam
(B-02 należy do właściciela) i nie deklaruję zgodności z ENEA.

| # | Rozstrzygnięcie | Wykonanie (plik:linia, pomiar przed → po) | Test (iloczyn cech, iniekcja) |
|---|---|---|---|
| 1 | Każde skrzyżowanie bez węzła modelu dostaje mostek §22.1; kropka wyłącznie na węźle modelu | Rozcinanie kabla „węzłem T” skasowane razem z dawnym `resolveTeeJunctions` (`frontend/src/ui/sld/v3/scene/buildScene.ts`). Wyrocznie: `przecieciaBezMostka` (`scene/crossings.ts:170`), `junctionDotGaps` z węzłami modelu (`:563`, `wezlyModeluEnm` `:619`), kropka odczepu tylko w rozgałęzieniu (`ramionaToru` `:458`, `odczepyWezlowModelu` `:513`); eksport spłaszcza łuk mostka (`export/svgPrimitives.ts`). Inwentarz klasy „przecięcie, którego mostek nie widzi”: przecięcie w STYKU dwóch członów przęsła (koniec krawędzi, nie wnętrze — mostek liczony per krawędź) i w wierzchołku współliniowym. Naprawa: `scene/stykiCzlonow.ts` (`stykiCzlonowNaObcychPrzewodach` `:185`; `odsunStykiCzlonow` `:243` przesuwa styk o k·GRID wzdłuż przęsła, suma obu członów bez zmian; wpięte w `buildScene.ts:5615`), `dedupeVertices` (`buildScene.ts:3323`) usuwa wierzchołki współliniowe. Pomiar na bazie `e41837b4e`: 92 kropki bez węzła modelu w 58 fiksturach × L0/L1/L2 → 0; skrzyżowań z mostkiem 113, kropek z węzłem modelu 65; styk członów na obcym przewodzie: 0 w fiksturach, 1 na sieci syntetycznej (odgałęzienie stacji z odgałęzieniem) → 0; wierzchołki współliniowe toru: 57 fikstur na L0 i 6 scen syntetycznych → 0 | `scene/__tests__/wezlyMostkiRozlacznoscFikstur.test.ts` (58 fikstur × L0/L1/L2 × wyrocznie (a)–(j), iniekcje: kropka bez węzła, kropka z węzłem spoza modelu, kropka w narożniku, przecięcie bez mostka, styk członów cofnięty na skrzyżowanie, wierzchołek współliniowy); `stykiCzlonow.test.ts` (59 przypadków: oś {pion, poziom} × obcy przewód {sn, snTrunk, lv} × kierunki członów, obcy nie-przewód {szyna, linia odniesienia, linia wyłączania, linia pomiarowa} bez styku, miejsce na odsunięcie {zajęte, symbol, brak}, scena realna z iniekcją — wyrocznia 1, skrzyżowanie ukryte); `mostkiNaKanwie.test.tsx`; `crossings.test.ts`; `eksportDokumentu.test.ts`; iniekcje: wyłączona naprawa styku — 4 czerwone, dawny `dedupeVertices` — 57 czerwonych |
| 2 | Zejścia pól na L0 rozsunięte, rozłączność na każdym LOD | Port zejścia KAŻDEGO pola na dolnej krawędzi bloku zwiniętego (`buildScene.ts:3161`, `:7168`, `compose/preview.tsx:462`); wyrocznia nałożeń różnych właścicieli `nalozeniaRoznychWlascicieli` (`crossings.ts:222`). Pomiar fikstury referencyjnej L0: suma pionów 21576 → 21288 (12 zejść × 24 px), L1/L2 bez zmian; wspólny pion czterech kabli (x = 128) → 0 | `wezlyMostkiRozlacznoscFikstur.test.ts` (e) zero nałożeń i (f) końce odcinków zakotwiczone — 58 fikstur × 3 LOD; `buildScene.odejsciaZagniezdzone.test.ts` |
| 3 | Jedna postać `starting_port_ref`: port pola, gdy ciąg startuje z pola, inaczej zacisk; `….BRANCH` usunięte bez warstwy zgodności | `backend/src/enm/domain_operations.py::_rozwiaz_port_startu` (`:2991`): `ref_id` pola liniowego SN albo zacisk (szyna portu punktu odgałęźnego, szyna terminalna); wynik jest typem sumy (port ALBO kod odmowy), więc odmowa nie ma zapasu kodu. `LineRun.starting_port_ref` (`enm/models.py`) — typ `str` bez zmian, zmienia się tylko treść. Front: `ui/network-build/operationContextResolvers.ts:104`, `trunkOriginResolver.ts`, `cards/BranchPoleCard.tsx`, `cards/ZksnCard.tsx`, adaptery `v2/canvas/enmToSldAdapter.ts`, `enmToCanonicalGpzAdapter.ts`. Kontrakt operacji: `docs/ui/KONTRAKT_OPERACJI_ENM_OP.md` (`from_ref`). Kontrakty FROZEN (ShortCircuitResult, PowerFlowResult, ResultSet v1) nie niosą portu startu — nietknięte. Przy okazji skasowane 7 osieroconych schematów `backend/schemas/*_schema.json` (0 odwołań w repozytorium, jeden opisywał dawną postać portu) | `tests/enm/test_ksztalt_ladunku_operacji.py` (każda postać spoza jedynej — nazwana odmowa; zacisk portu — punkt pochodzenia i klucz zajętości), `test_ciaglosc_ciagu_sn.py`, `test_branch_point_sn.py`, `tests/enm/test_kod_odmowy_operacji_domenowej.py` (zero zapasu kodu); front `operationContext.test.ts`, `trunkOriginResolver.test.ts`, `menuBudowyNaKanwie.test.tsx` |
| 4 | Wachlarz `gpzProtectionDataPath` przyjęty | Układ z jednym koniecznym skrzyżowaniem z mostkiem jest docelowy (`docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md` §12) | `buildScene.odejsciaZagniezdzone.test.ts` przypina dokładnie to jedno skrzyżowanie i jego mostek |
| 5 | Podłoga S9-7 (8 px przy wejściu w LOD2) obejmuje litery symboli | „3” przekładnika Ferrantiego: 5,4 → 8 j.św. (manifest importu QET: skala lokalna znaku 10/9, jednokładność rysunku 2, rdzeń r = 19); litery rejestru CAD pismem `CAD_LITERA_MIN_U` = 4 u = 8 px (`cad/cadSymbolRegistry.ts`, „3~” przekształtnika w trójkącie z prześwitem od przekątnej); znaki glifów (`symbols/glyphs.tsx`, `PISMO_ZNAKU_OSTRZEZENIA`); kody w okręgu przekaźnika pismem 8 px (`symbols/okragPrzekaznika.ts`) | `cad/__tests__/literySymboli.test.tsx`: (A) inwentarz WSZYSTKICH liter z rejestrów (CAD w każdym stanie, QET w każdym położeniu noża, glify sceny) — każda ≥ 8 px; (B) tusz litery z tabeli kroju nie dotyka kreski własnego symbolu; okrąg przekaźnika: każdy kod słownika EAZ (34, czytane z backendu) sam i w każdej uporządkowanej parze |
| 6 | P1/P2: wąski wyjątek strażnika z samotestem; T1 z P1 od szyny, P2, przekładnią i klasami rdzeni | `scripts/no_codenames_guard.py` (wyjątek: jeden plik, jeden wiersz deklaracji, literał równy oznaczeniu; zapadka świeżości wyjątku); lustro vitest `ui/__tests__/canon-codenames-global.test.ts` czyta TĘ SAMĄ definicję z pliku strażnika. Zaciski z portów modelu (`compose/zaciskiPrzekladnika.ts`: P1 = `we`, P2 = `wy`), tabliczka „200-400/5 A · 5P20” z rekordu rdzeni (`v2/model/tabliczkaPrzekladnika.ts`) | `scripts/test_no_codenames_guard.py` (deklaracja przechodzi; ten sam wiersz w innym pliku, „P1” w innym wierszu pliku, „P1 rozpływ” i „P3” w wierszu deklaracji — naruszenia); `canon-codenames-global.test.ts` (to samo w lustrze); `scene/__tests__/zaciskiPrzekladnikaGpz.test.ts`, `v2/model/__tests__/tabliczkaPrzekladnika.test.ts`; e2e zrzutów (`sprawdzPrzekladnikPradowy`) |
| 7 | `measureTextWidth`: tabela posuwów kroju zamiast 0,62 em | `core/metrykiKroju.json` (Liberation Sans 400/700, zgodny metrycznie z Arial; Liberation Mono dla widoku nN), generowana `scripts/metryki_kroju_sld.py` z plików kroju; `core/text.ts:620` sumuje posuwy i zaokrągla w górę do jednostki świata; ten sam plik czyta importer symboli QET i zawijanie etykiet domeny nN — jedno źródło metryk. Ta sama klasa poza warstwą v3: test kolizji tekstu z symbolem rodziny presetów OZE (`v2/station-rozdzielnia/canon/sldCanonKit.tsx`, `gornaSzerokoscTekstu`) liczył każdy krój stałym 0,62 em; teraz górna granica wg rodziny kroju z atrybutu `font-family` — krój o stałej szerokości 0,62 em (posuw 0,600–0,602 em to własność kroju), krój proporcjonalny pełny kwadrat em; lokalna kopia reguły w `SldCanonPresetG1.test.tsx` zastąpiona wspólną funkcją | `core/__tests__/metrykiKroju.test.ts`, `backend/tests/ci/test_metryki_kroju_sld.py` (świeżość tabeli wobec generatora); e2e zrzutów (`zmierzBlokPrzekaznika`, `sprawdzPrzekladnikPradowy`): szerokość tuszu z metryk PRZEGLĄDARKI = suma posuwów z tabeli × pismo × skala kamery w granicy 1 px dla każdego wiersza bloku przekaźnika i tabliczki T1, zapas najszerszego wiersza do prawej krawędzi ramki w [margines, margines + 1 j.św.]; pokrycie iloczynu {Z.10, Z.11.1} × {cyfry, wielkie litery} × {ciemny, jasny} przypina `oczekujPokryciaKlasSzerokosci` (komórkę cyfr pola Z.10 niesie tabliczka T1 „200-400/5 A · 5P20”, bo po deduplikacji EAZ wiersz bloku Z.10 ma przewagę wielkich liter); `canvas/__tests__/obrysyWgPlanu.test.tsx` (obrysy z tuszu planu, niżej); `canon/SldCanonDoD.test.tsx` ({krój stały, krój proporcjonalny} × {„1”, „①”, „W”}; iniekcja stałego 0,62 em dla każdego kroju — 3 czerwone) |
| 8 | Strona `PlannedLabel` do węzła tekstu; zaczep w krawędzi dla wszystkich etykiet `dane` i podpisów aparatów | `layout/labels.ts:341` (`wyrownanieEtykiety` — jedno źródło dla kanwy, podglądu kompozycji i prostokąta tuszu planu): strona lewa → zaczep w prawej krawędzi, strona prawa → w lewej | `canvas/__tests__/zaczepKrawedziEtykiet.test.tsx`, `layout/__tests__/krawedzZaczepu.test.ts`, `gpzAdnotacjeNaKanwie.test.tsx`; e2e — wspólna krawędź tuszu podpisów kolumny pola w granicy 1 px |
| A | Napęd łącznika jako atrybut (Q1 zasobnikowy z obsługą ręczną, Q0 silnikowy) | `backend/src/network_model/catalog/obwody_wtorne_pola.py` (`RodzajNapedu`, `NAPEDY_RODZAJU_APARATU`, `NapedAparatuPola`, `OPIS_NAPEDU_PL`; dowód odczytu `:633` — druk s.89, s.90, s.91 w 400 dpi, Q5 bez znaku napędu), `BayPrimaryDevice.naped` (`enm/models.py`, walidator ze słownika rodzaju), symbol `qetThreePositionSwitchZNapedem` złożony z elementów QET EN 60617 07-13-07 + 02-15-01 + 02-13-20 + 02-13-01 (dwa nowe elementy w `docs/sld/vendor/qet/`), wybór rysunku z modelu `compose/apparatusSequence.ts:162` (`SYMBOL_LACZNIKA_Z_NAPEDEM`) | `compose/__tests__/symbolNapeduLacznika.test.ts` (KAŻDY rodzaj aparatu × napęd {brak, każdy} × wariant rysunku, parytet słownika z backendem); `tests/network_model/catalog/test_obwody_wtorne_pola.py`, `tests/enm/test_powiazania_obwodow_aparatow_pola.py`, `tests/ci/test_qet_pole_sn_import.py` (nóż i położenia łącznika z napędem = bez napędu); `kafelStanu.test.tsx`, `poleLinioweGpz.test.tsx` |
| B | Deduplikacja funkcji EAZ u źródła, jedna nomenklatura | `network_model/catalog/funkcje_eaz.py`: dawny kod złożony „SPZ/SCO” włączony do SCO (wyłączenie od SCO1, SCO2 i ponowne załączenie po SCO; wymóg IRiESD „jeśli ENEA Operator tego wymaga” — SCO w klasie odbiorczej `NA_ZADANIE_OSD`), agregat „anti-islanding” skasowany (kryteria LoM 27/59/81U/81O/81R stoją w tym samym zestawie), klucze-nazwy „Buchholz”, „temp”, „ciśnienie” → numery IEEE 63, 26, 63P; zestawy szablonów i obwody wtórne (`bay_templates.py`, `obwody_wtorne_pola.py`), front `compose/protectionMarking.ts`, preset G5 | `tests/network_model/catalog/test_funkcje_eaz_bez_duplikatow.py` (KAŻDY szablon rejestru × klasa pola {brak, trzy klasy} × warunek 67N {bez, ze źródłem 3U₀} + role bez szablonu i Z.17; detektor przypięty iniekcjami dawnych kodów); `literySymboli.test.tsx` (słownik 34 kody bez powtórzeń) |
| C | Glif Q1 w położeniu zamkniętym czytelny jako odłącznik | Nóż QET obracany do zasięgu styku stałego (`scripts/import_qet_pole_sn.py`, `noz_w_zasiegu`), odłącznik w jednokładności 10/3 (koniec noża NA kresce styku), render z tej samej reguły (`symbols/glyphs.tsx:1429`, `prymitywyNozaQet`) | `symbols/__tests__/nozQetNaStyku.test.tsx` (KAŻDY łącznik QET z nożem × KAŻDE położenie: koniec noża na rysunku styku w położeniu stykowym, nóż nie przechodzi przez styk, w otwartym nie dotyka; render = reguła importera) |

**Obrysy etykiet według planu — klasa odsłonięta przez decyzję 7.** Pierwszy bieg spec zrzutów
po wprowadzeniu tabeli posuwów był czerwony w kadrze pola Z.11.1: wiersz „81O · 81R · ZS · 50BF ·
79” wychodził 8,1 px poza prawą krawędź ramki bloku przekaźnika i 2,3 px poza tło pola (skala
kadru 1,48 px/j.św.). Przyczyna: scena liczy ramkę bloku (`compose/gpz.ts:1254`,
`ramkaBlokuPrzekaznika`) i tło pola (`compose/gpzAdnotacje.ts:510`, `panelePolGpz`) ze slotów
etykiet w piśmie naturalnym, a kanwa rysuje tekst z PLANU etykiet, który w kadrze pola podnosi
pismo do podłogi opisów celu (13 px ekranu; pismo t4 8 → 8,81 j.św.) i poniżej progu
czytelności do podłogi S9-7. Zapas 0,62 em maskował rozjazd. Inwentarz klasy (obrys liczony
z etykiet, tekst rysowany z planu):
- ramka bloku przekaźnika na kanwie — naprawiona: scena niesie listę członków
  (`ComposedGpzProtectionSymbol.wierszeBloku`, `compose/gpz.ts:349`, `:2089`;
  `PreviewElementMeta.wierszeBlokuPrzekaznika`, `compose/preview.tsx:428`; `scene/buildScene.ts:4073`),
  kanwa liczy ramkę TĄ SAMĄ funkcją z prostokątów narysowanych wierszy
  (`canvas/obrysyWgPlanu.ts`, `ramkiBlokowWgPlanu`; `canvas/SldCanvasV3.tsx:2903`, `:3671`);
  żaden wiersz nienarysowany — brak ramki;
- tło pola GPZ na kanwie — naprawione: lista członków `PanelPolaGpz.etykiety`
  (`compose/gpzAdnotacje.ts:252`, `:527`), kanwa liczy tło TĄ SAMĄ funkcją `panelePolGpz` z obrysu
  sceny, narysowanych etykiet pola i ramek bloków według planu (`paneleWgPlanu`;
  `SldCanvasV3.tsx:2904`, `:3593`). Tło nie kurczy się poniżej obrysu sceny, więc etykieta ukryta
  progiem czytelności nie przesuwa jego krawędzi przy każdym kroku zoomu. Ta sama naprawa
  zamyka rozjazd w widoku całej sieci (sondą: 22–35 etykiet pól poza tłem przy skalach 0,35–0,5
  przed naprawą, 0 po);
- eksport SVG i PDF — klonuje DOM żywej kanwy (`SldCanvasV3Workspace.tsx:2088`), więc dziedziczy
  naprawę; eksport DXF nie rysuje ramki bloku ani tła pola;
- podgląd kompozycji (`compose/preview.tsx:650`, `PreviewLabelNode`) — zostaje z ramką sceny,
  bo rysuje etykiety w slotach sceny pismem naturalnym (bez planu), czyli obrys sceny JEST tam
  obrysem tuszu;
- kadr celu (`canvas/zakresKadru.ts`, `tuszEtykiet`) — liczył już tusz etykiet z tego samego
  planu (karta K2); obrys według planu dokłada co najwyżej dwa marginesy (8 j.św., 22,1 px przy
  `KADR_MAX_SCALE` 2,76), mniej niż margines kadru `KADR_PADDING_PX` 40 px.
W piśmie naturalnym oba obrysy są identyczne ze sceną. Test `canvas/__tests__/obrysyWgPlanu.test.tsx`
(7 przypadków): trzy fikstury pól GPZ (Z.10 w sekcji 1 i 2, Z.11.1 z odgałęzieniem) × skala
{2,5; 1,5; 1,0; 0,7; 0,5; 0,35} × kadr {brak, pole każdego tła} × obrys {ramka, tło}: ramka =
okrąg ∪ narysowane wiersze ⊕ margines dokładnie (niezależna suma prostokątów) albo brak, gdy
żaden wiersz nie jest narysowany; tło = obrys sceny ∪ członkowie ⊕ margines ∪ ramki planu
⊕ margines; tła rozłączne parami; tożsamość ze sceną w piśmie naturalnym; predykaty parami —
lista wierszy ramki = etykiety bloku (`#protection-codes-full`, `#zrodlo-u0`) pola i podzbiór
członków tła; przypadki niepuste (wiersze powiększone, ramki bez wierszy, tła poszerzone);
test DOM kanwy (fikstura Z.11.1 w kadrze pola, LOD2): tusz wierszy z węzłów tekstu wewnątrz
ramki, ramka ciasna, ramka ⊕ margines wewnątrz tła. Iniekcje (każda przywrócona): kanwa z ramką
sceny (`ramkaBloku={symbol.meta?.ramkaBlokuPrzekaznika}`) — czerwony test DOM („3U₀ (Z, Zz) ← T1,
pole Pole pomiarowe” poza ramką); tło sceny zamiast tła według planu — czerwone („ramka bloku
z marginesem w tle pola”). E2e: `zmierzBlokPrzekaznika` (tusz każdego wiersza wewnątrz ramki
z czterech stron, zapas do prawej krawędzi w [margines, margines + 1 j.św.]).

**Fikstury.** Generatorami repozytorium odtworzyłem 75 plików JSON i artefakt
`ui/sld/v2/station-rozdzielnia/autolayout/network/sldNetwork53.ts`. Żadnej fikstury nie
edytowałem ręcznie. Generatory (z katalogu `backend/`, każdy z kodem wyjścia 0):
`python -m tests.reference_networks.fikstury_enm_sld --write`, `… sld_substrate_fixtures --write`,
`… rodzaj_stacji_parytet --write`, `… szyny_stacji_parytet --write`,
`… archiwum_tr_bez_pola --write`, `scripts/emit_sld_network_fixture.py`,
`scripts/gen_field_configurations_catalog.py`, `scripts/eksport_fixtur_projekcji_nn.py`,
`scripts/eksport_fixtur_harnessu.py`, `../frontend/scripts/demo-siec-pokazowa/generate-fixture.py`,
`../frontend/scripts/generate-demo-oze-sc.py`, `tests/ci/test_parytet_oceny_pola_liniowego.py`
i `tests/ci/test_parytet_zrodla_u0.py` (tryb regeneracji z docstringu); świeżość tabeli kroju
i pliku symboli QET sprawdzona `scripts/metryki_kroju_sld.py --sprawdz`
i `scripts/import_qet_pole_sn.py --sprawdz`. Różnice według klucza (pomiar porównaniem z `e41837b4e`):
- `protection_codes` — jedna nomenklatura funkcji EAZ (pkt B): bez „SPZ/SCO” i „anti-islanding”,
  numery 63/26/63P zamiast kluczy-nazw;
- `naped`, `funkcje_eaz_wylaczajace` — napęd zasobnikowy Q1 (pkt A) i powiązanie SCO po włączeniu
  dawnego „SPZ/SCO”;
- `starting_port_ref`, `starting_bay_ref`, `branch_origin_station_ref`, `assigned_corridor_ref`,
  `id`, `ref_id`, `trunk_id`, `corridor_ref` i skróty modelu (`hash_sha256`, `snapshot_hash`,
  `input_hash`, `enm_hash`, `builder_snapshot_hash`) — jedna postać portu startu (pkt 3) zmienia
  ładunek operacji, a identyfikatory pochodzą ze skrótu ładunku;
- `demoOzeSc.sc.json` — wyłącznie `builder_snapshot_hash`; liczby wyniku zwarciowego bajtowo bez
  zmian.
Nowe artefakty generowane: `core/metrykiKroju.json` (pkt 7) i plik symboli QET
`cad/qet/qetPoleSn.ts` (importer z manifestu, pkt A i C).

**Piny zmienione z pomiarem.**
- Odbiór `accept:sld-v3` (`frontend/scripts/sld_v3_acceptance.mjs`, fikstura referencyjna
  `sldSubstrate52s`), sonda 2×2 {0,62 em, tabela posuwów} × {fikstura sprzed, fikstura po
  regeneracji}, wartości każdego wariantu w komentarzach stałych: skrzyżowania z mostkiem
  7/18/18 → 8/19/19 (wyłącznie fikstura); suma pionów 21288/44352/44352 → 19976/43040/43040
  i „rezerwacja-kanalu” 21248/42048/42048 → 19648/40736/40736 (tabela posuwów −912…−960,
  fikstura −352…−400); poziomy 53520/68528/73160 → 45312/58832/62784 (czubek przed kartą
  52816/67872/72512; kod karty przy 0,62 em +832/+1288/+1320 wyłącznie z zaokrąglenia
  szerokości kolumn do rastru — ten sam kod bez `snapUp` daje poziomy czubka; tabela posuwów
  −8304…−11160; fikstura −32); podłoga wypełnienia arkusza podniesiona 0.01374/0.02223/0.02275
  → 0.01615/0.02476/0.02555 (zmierzone 0.016201/0.024810/0.025599); załamania 43/171/171 bez
  zmian. Ten sam pomiar pionów w `buildScene.schemat10s7p6.test.ts`.
- Odciski S9-9 sceny, declutteru i planu etykiet (`scene/__tests__/kosztSceny.test.ts`, krok
  budżetów): 54 z 54 przeliczone. Czubek `e41837b4e` był czerwony w 4 z 54 (sceny L1/L2 obu
  sieci — tło pola liniowego GPZ 24 → 144 j.św. po objęciu podpisu pola, §11.3; `dbe7c130b`
  54 z 54 zgodne), bo test biegnie wyłącznie w kroku budżetów. Sonda 2×2 jak wyżej: każdy
  czynnik osobno zmienia wszystkie 54 wpisy; liczba etykiet sceny 55/520/914 i 108/1030/1816
  identyczna we wszystkich wariantach. Listy członków obrysów według planu
  (`PanelPolaGpz.etykiety`, `wierszeBlokuPrzekaznika`) zmieniają 4 odciski scen (L1 i L2 obu
  sieci; L0 nie ma adnotacji GPZ); sonda: scena bez obu pól daje dokładnie poprzednie odciski,
  declutter i plany bez zmian.
- Fikstury × LOD, skrzyżowania z mostkiem 107 → 113: pomiar 2×2 (kod karty na fiksturach sprzed
  regeneracji 107, na nowych 113); cała różnica to sieć `sldSubstrate52s` (2 kopie × 3 LOD × +1):
  nowe identyfikatory zmieniają kolejność komponowania odgałęzień — jedno skrzyżowanie odgałęzienie
  × odgałęzienie więcej (fikstura referencyjna L2 18 → 19, `crossings.test.ts`), każde z mostkiem.
- Suma pionów fikstury referencyjnej (`buildScene.test.ts`) 23168/46400/46400 → 21608/45128/45128:
  pomiar 2×2 — L1/L2 −832 wyłącznie z tabeli posuwów (wariant 0,62 em daje wartości bazy), L0
  −1120 = tabela posuwów i rozsunięcie zejść KD-5 (12 × 24 px).
- Odciski sceny TR bez pola (`buildScene.tr2wBezPola.test.ts`): tabela posuwów (szerokości
  etykiet, szyna WN), wyrównanie szerokości kolumn do rastra, zaczep w krawędzi.
- Odcisk widoku N-1 sieci gn01 (`tests/application/analyses/test_kontyngencje_n1_service.py`):
  porównanie liść po liściu z `e41837b4e` — różnią się wyłącznie `context.snapshot_hash`
  i `input_hash`; jedyna różnica modelu: kody 63/26/63P pola transformatora.
- Licznik pól kontraktów wejściowych strażnika podstawień
  (`scripts/test_solver_input_substitute_guard.py`) 4469 → 4468: pomiar `contract_fields()`
  na `e41837b4e` (4469, pin zgodny) i na drzewie karty — zbiór +1 (`napedy`), −2
  (`naped_wylacznika`, `naped_weryfikacja`), bo `ObwodyWtornePola` niesie napęd każdego
  łącznika pola z rysunku (pkt A), a nie tylko wyłącznika; zero nowych podstawień.
- Licznik pól Literal strażnika parytetu ENM (`tests/ci/test_enm_contract_parity_guard.py`)
  131 → 132: pole `BayPrimaryDevice.naped` dodane w `e41837b4e` bez podniesienia pinu (test był
  czerwony na `e41837b4e`, pomiar 132); ta karta rozszerza tylko zbiór wartości tego pola.
- Iniekcja testu obrysu arkusza (`sheet/__tests__/obrysArkusza.contract.test.tsx`): przy kadrze
  dopasowanym tabela posuwów zostawia aparatom miejsce (0 z 96 przypadków bez ustąpienia), więc
  iloczyn dostał cechę kamery „krawędź w slocie” — przesunięcie kadru użytkownika, przy którym
  iniekcja gryzie 96 z 96.

### 11.12. Przekazanie (stan bieżący, 2026-10-30, praca w toku)

**Zrobione na tej gałęzi (commity WIP).** Zaciski P1/P2 przekładnika T1 przy zaciskach, po stronie
przeciwnej do podpisu (`c218b93b8`). Jedno źródło koloru kafla i położenia noża łącznika
(`symbols/glyphs.tsx::POLOZENIE_ZE_STANU`, `polozenieLacznika`, `polozenieNozaQet`; `f5458d691`).
Układ kafla łącznika wg wzorca HMI e²TANGO w importerze QET (`c1ad31c50` i commit testów
importera): jedna deklaracja `kafelStanu.uklad` w `docs/sld/vendor/qet/import_manifest.json`
(zawias u dołu, styk stały u góry, nóż pionowy = zamknięty, ukośny 45° = otwarty), znacznik rodzaju
aparatu przy styku stałym 12 j.św. = 25% boku kafla („×" wyłącznik, „○" odłącznik, kreska
z okręgiem rozłącznik wg IEC 60617 S00290, kreska uziemnik), symbol ziemi pod uziemnikiem
skierowany w dół (Q1 trójpołożeniowy, Q5, Q8), cewka wyłączająca zdjęta z kafla. Testy importera
przepisane na układ kafla: iloczyn rodzaj × położenie noża z wyrocznią próbkowaną (rozmiar,
margines, kolizja z nożem, rozróżnienie rodzajów), ziemia w dół, iniekcje (znacznik za mały, za
duży, brak, przy krawędzi, na nożu, ziemia w górę, ziemia poza osią, prymityw bez roli lub z
dwiema rolami) — `backend/tests/ci/test_qet_pole_sn_import.py`, 83 zielone.

**W toku (polecenia sesji głównej 2026-10-30).** (1) Testy frontendu iloczynu znaczników
{rodzaj × stan × motyw × LOD1/LOD2} i detektor kierunku ziemi w całej klasie glifów (v3, QET,
CAD, v2, SVG kanoniczne). (2) Dokument: tabela rozmiarów znacznika, „Wzorzec HMI e²TANGO —
wnioski", tabela stan → kolor → geometria (§11.13), luka modelu członu wysuwnego. (3) Zrzuty ux04
i tablica rodzajów × stanów w obu motywach. (4) Przekładnik wieloprzekładniowy — wybrany zaczep
w modelu i u konsumentów. (5) Decyzje 1–3 (Ferranti i koniec toru, opisy przy symbolach, blok
przekaźnika i zakładka inspektora).

**Znane czerwone.** `symbols/__tests__/kafelStanu.test.tsx` (oczekiwania sprzed układu kafla)
i `scene/__tests__/zaciskiPrzekladnikaGpz.test.ts` (2 — wariant Z.10 bez przekładnika Ferrantiego,
kolizja tabliczki przekładnika) — przepisywane w pkt (1) i (5).

**Pierwszy krok następcy.** Pkt (1): testy frontendu znaczników i ziemi na glifie QET kanwy.
