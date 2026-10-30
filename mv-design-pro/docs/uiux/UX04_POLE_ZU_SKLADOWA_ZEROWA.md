# UX-04/POLE-ZU-SKLADOWA-ZEROWA — zespół uziemiający SN jako jedyna prawda o punkcie neutralnym

Karta: UX-04/POLE-ZU-SKLADOWA-ZEROWA (wchłania wiersz UX-04/GPZ-H5-SKLADOWA-ZEROWA).
Stan: dostarczone do weryfikacji B-01 (zmiana mapowania składowej zerowej i dwóch rdzeni
FROZEN: `network_model/solvers/v126_academic.py`, `network_model/solvers/short_circuit_core.py`).
Werdykt wizualny SLD (B-02) nie jest tu wystawiany — karta nie rysuje szablonu pola ZU (pkt 9).

Źródła: ENEA Zeszyt 1 (02.2023) §16 s. 29–32, §26.9.6 s. 54, §26.10.7 s. 56, §27.1 s. 59;
IRiESD ENEA II.4.5.4.3 s. 53, VII.4 s. 119; rysunki Zeszytu 1 Z.13 (s. 93), Z.14 (s. 94),
Z.15 (s. 95) w odczycie `docs/uiux/GPZ_SN_ENEA_ODCZYT_RYSUNKOW_2026-10-28.md`; IEC 60909-0
(zwarcie jednofazowe, Z_0 = Z_0,TU + 3·Z_N) i IEC 60076-6 (dławiki). Tekstu norm IEC nie
było w repozytorium — wzory niżej są wzorami podręcznikowymi IEC 60909-0, zapisanymi jako
założenia jawne, bez cytatu numeru wzoru.

## 1. Rozstrzygnięcia (§0 karty) i jak je wdrożono

| § | Rozstrzygnięcie | Wdrożenie |
|---|---|---|
| 1 | Jedna prawda: sposób uziemienia sekcji SN wynika wyłącznie z elementów ENM | `backend/src/enm/uziemienie_sekcji.py` — `uziemienie_sieci(enm)` zwraca `UziemienieSekcji` per połączona sieć SN (stan łączników z `derive`, wariant, Z_N spoczynek / AWSC załączony, I_C, I_L, rozstrojenie, dane przyjęte, kompletność, odmowy nazwane). Czytelnicy: walidator (`validator.py:2987`), mapowanie Z0 (`mapping.py:798`), dowód przekładników (`audit2_skladanie.py:300`), ładunek DER (`solver_input/audit2_der_payload.py`), V12.6 (`solver_input/v126_contracts.py:295`), `BayEarthFaultPath` (`field_read_model.py:141`, `:304`, `:1304`), gotowość 1F (`eligibility_service.py:794`), panel uziemienia konfiguratora stacji i endpoint `POST …/audit2-station-config/{station}/_uziemienie-sn` (`api/audit2_station_config.py:148`). |
| 2 | Kasacja `mv_neutral_grounding_ref` na amen | Usunięte: kolumna ORM i migracja SQL, katalog wariantów audytu 2 (pięć pozycji `mng_*`), końcówka `GET /catalog/audit2/mv-neutral-groundings`, pole zapisu konfiguracji, rozszerzenia solverów, konfigurator we froncie (karta round4 skasowana). Bramka wskrzeszenia: strażnik grep-zero z wzorcami `config/grep_zero_zu_patterns.txt` (allowlista = sam strażnik i jego self-test). Bez migracji i warstwy zgodności. |
| 3 | `Source.neutral_grounding` i R0/X0 tylko dla 110 kV | `impedancja_zerowa_zrodla_dozwolona(napięcie)` = pasmo ≠ SN. Operacja `add_grid_source_sn` odmawia opisu uziemienia albo Z0 dla równoważnika po stronie SN (`source.sn_neutral_not_on_source`, zdanie z drogą naprawy). Mapowanie Y0 nie stampuje Z0 źródła z pasma SN. E-W5-01 przepisany do nowej prawdy. Kreator źródła zasilania pokazuje punkt neutralny i Z0 wyłącznie dla sieci 110 kV; dla SN prowadzi do zespołów uziemiających sekcji. |
| 4 | V12.6 nie nadpisuje modelu, trzy wartości domyślne znikają | `v126_academic.py` czyta `model.uziemienie_sn` (z `uziemienie_sn_v126`), brak → odmowa `neutral_earthing_no_grounding_model` z przyczyną (`v126_academic.py:1365–1367`); dawne domyślne (:1326, :1752, :1843 w bazie) skasowane. Brak parametru urządzenia, które model ma → wartość robocza ESTIMATED z podstawą (§16: środek zakresu dławika, AWSC 30 A, Z0 TU z pozycji typowej, R z prądu rezystora), wpis `dane_przyjete`, kompletność NIEPELNY. |
| 5 | Nowe elementy z katalogiem | `enm/models.py:690–748`: `RezystorWymuszajacyAwsc`, `DlawikGaszacy`, `RezystorUziemiajacy`, `ZespolUziemiajacy` (+ `EnergyNetworkModel.zespoly_uziemiajace`, `:2136`). Katalog `network_model/catalog/mv_zespol_uziemiajacy_catalog.py` (pozycje typowe §16, status REFERENCYJNY, „dane robocze"). Uzwojenie potrzeb własnych 400/230 V jako drugi port z przyłączem odbioru PW (W-ZU-03). |
| 6 | Z_N per wariant w `pochodne/**` | `network_model/pochodne/punkt_neutralny.py`: X_L = U_f/I_L, R = U_f/I_R, Z_a‖Z_b, Z_0,TU + 3·Z_N, I_C = √3·U_n·B_0, v = (I_L − I_C)/I_C. Stan AWSC to parametr przypadku (`OperatingScenario` / konfiguracja zwarcia `stan_awsc`), nie zmiana modelu; ślad White Box niesie oba Z_N (`punkt_neutralny_sn`). |
| 7 | Kotwica 1e6 i trzy przyczyny | Sonda przed/po (§3): kotwica UDAWAŁA uziemienie bezpośrednie. Teraz kotwica wyłącznie dla bloków bez żadnego bocznika (`mapping.py:986`), a każdy taki węzeł dostaje odmowę nazwaną: `fault.zero_sequence_no_path` (brak drogi), `fault.zero_sequence_outside_iec60909` (sieć izolowana z B0 albo skompensowana — prąd doziemienia z pojemności liczy analiza projektu uziemienia, nie kotwica), `fault.zero_sequence_missing_data` (gałąź bez R′0/X′0 i bez podstawy wartości roboczej, transformator bez grupy połączeń albo źródło spoza SN bez Z0). Odcinek bez R′0/X′0 z podstawą wartości roboczej liczy się z nią (zasada nr 4, §3.11); transformator bez grupy połączeń daje `brak_danych` zamiast fałszywego „brak drogi” (§3.12). Przyczyna przechodzi do wiersza odpowiedzi (`non_physical_reason`, `brak_wyniku_zerowego`), do opisu ograniczenia (`reporting_limitations_pl` = zdanie przyczyny), do ekranu składowych i do raportu PDF/DOCX („Ograniczenie wyniku: …"). |
| 8 | B-01 | Sonda §2–§3, determinizm (`test_determinizm_dwa_biegi_ten_sam_artefakt_i_odcisk`), modele bez zespołu bez nowych kluczy biegu (`test_model_bez_zespolu_bez_nowych_kluczy_biegu`), iniekcje §5. Kontrakty FROZEN nietknięte; nowe pola addytywne. |
| 9 | Rola pola ZU | `ZU` w jednej liście ról (`enm/rola_pola_sn.py:30`, kanon `ZESPOL_UZIEMIAJACY`, SLD `uziemiajace`). Zespół stoi na zacisku na końcu toru pola ZU (port `transformator_uziemiajacy`), kreator GPZ tworzy pole ZU przez `add_sn_bay` i zespół przez `add_zespol_uziemiajacy_sn`. |
| 10 | SPZ i wyłączenie od TR | W-ZU-01 (SPZ bez rezystora, Zeszyt 1 §26.9.6), W-ZU-02 (zespół z rezystorem, którego nie wyłącza wyłączenie pola SN TR, IRiESD II.4.5.4.3.5) z wyjaśnieniem: co, kryterium, podstawa, element. Kreator GPZ wiąże zespół sekcji z transformatorem tej sekcji flagą `wylaczenie_od_transformatora_sekcji` (rozwiązywaną w operacji po utworzeniu transformatorów). |

## 2. Warianty Z.13 / Z.14 / Z.15 — Z_N w obwodzie zerowym

U_n = 15 kV, U_f = U_n/√3 = 8 660,3 V. Pozycje katalogu: transformator uziemiający
`TU_ZNYN11_15KV_PW160` (ZNyn11, S_n = 4 000 kVA, Z_0,TU = 1,5 + j6,0 Ω — wartość robocza,
PW 160 kVA 0,4 kV), dławik `DL_40_400A_15KV_CIAGLY` (40–400 A, regulacja ciągła, uzwojenie
wtórne 500 V), rezystor `REZ_200A_15KV` (R = 43,3 Ω, 200 A, 10 s). Nastawa dławika w sondzie
I_L = 100 A, rezystor wymuszający AWSC I_W = 30 A (§16: 20–40 A).

| Wariant | Rysunek | Z_N (bez mnożnika 3) | Wartość | Status wyniku 1F |
|---|---|---|---|---|
| izolowany (brak zespołu) | — | brak drogi | — | `fault.zero_sequence_no_path` (bez B0) albo `…_outside_iec60909` (z B0) |
| dławik | Z.13 bez AWSC | jX_L, X_L = U_f/I_L | j86,60 Ω | `fault.zero_sequence_outside_iec60909` (NIE_DOTYCZY) |
| dławik + AWSC, spoczynek | Z.13 | jX_L | j86,60 Ω | `fault.zero_sequence_outside_iec60909` |
| dławik + AWSC, załączony | Z.13 | R_W ‖ jX_L, R_W = U_f/I_W | 23,84 + j79,45 Ω | liczony |
| rezystor | Z.15 | R_N = U_f/I_R | 43,3 Ω | liczony |
| dławik ‖ rezystor | Z.14 | R_N ‖ jX_L | 34,64 + j17,32 Ω | liczony |
| uziemienie bezpośrednie | (poza Z.13–Z.15, W-ZU-05) | 0 | 0 Ω | liczony |
| punkt neutralny uzwojenia SN TR | (Dyn11, `lv_neutral` R_N) | R_N | 43,3 Ω | liczony |

Kombinacje sprzeczne (uziemienie bezpośrednie razem z rezystorem, zespół bez elementu
w punkcie neutralnym) nie są wycinane: operacja odmawia z przyczyną, a rekord sprzeczny
z innej drogi (archiwum) daje E-ZU-02 i odmowę u konsumentów.

## 3. Sonda liczbowa Ik1 — przed i po (B-01)

Sieć sondy: GPZ z równoważnikiem 110 kV (S″k = 3 000 MVA, R/X = 0,1), transformator
110/15 kV 25 MVA YNd11, jedna sekcja SN 15 kV. Z_1 = Z_2 w węźle SN = 0,0506 + j1,0517 Ω,
c = 1,1 (tabela 1 IEC 60909-0, scenariusz MAX). Wzór (założenie jawne, IEC 60909-0):
I″k1 = √3·c·U_n / |Z_1 + Z_2 + Z_0|, Z_0 = Z_0,TU + 3·Z_N. Licznik √3·1,1·15 000 V = 28 579 V.

### 3.1 Przed kartą (baza 1465336df) — dwa defekty fizyki

| Przypadek | Przed | Po | Przyczyna różnicy |
|---|---|---|---|
| Sieć SN za YNd11 bez żadnego uziemienia SN (źródło 110 kV z Z0/Z1 = 1) | I″k1 = 13 571 A przy Z_0 = 2,25·10⁻⁶ Ω | brak wyniku, `fault.zero_sequence_no_path` | kotwica numeryczna 1e6 S w Y0 udawała uziemienie bezpośrednie (Z_0 ≈ 0) — prąd doziemny większy od prądu w sieci uziemionej |
| Równoważnik po stronie SN z punktem neutralnym „uziemiony przez rezystor 43,3 Ω" i Z0/Z1 = 1 | I″k1 = 9 622 A przy Z_0 = 0,0985 + j0,985 Ω | odmowa operacji `source.sn_neutral_not_on_source`, uziemienie modelowane zespołem → 216,9 A | rezystor punktu neutralnego źródła SN NIE wchodził do Z_0 (Z_0 = (Z0/Z1)·Z_Q) — wynik ≈ zwarcie bezpośrednie przy deklarowanym rezystorze 200 A |

Pomiar: skrypt sondy uruchomiony na drzewie bazy (`git archive 1465336df`) i na drzewie
karty, ta sama sieć i ten sam bieg kanoniczny `create_run`/`execute_run`.

### 3.2 Po karcie — wariant × stan AWSC (przypięte testami)

`tests/enm/test_skladowa_zerowa_zu.py::test_sonda_wartosci_bezwzgledne_z_podstawa`
(tolerancja 0,5 %) i `::test_sonda_ik1_wariantu_z_wyroczni_recznej` (wyrocznia ręczna,
rel. 1e-9):

| Wariant | Z_0 = Z_0,TU + 3·Z_N [Ω] | |Z_1 + Z_2 + Z_0| [Ω] | I″k1 [A] |
|---|---|---|---|
| rezystor (Z.15) | 131,40 + j6,00 | 131,75 | 216,9 |
| dławik ‖ rezystor (Z.14) | 105,42 + j57,96 | 121,42 | 235,4 |
| dławik + AWSC załączony (Z.13) | 73,01 + j244,36 | 257,1 | 111,2 |
| uziemienie bezpośrednie | 1,5 + j6,0 | 8,26 | 3 460 |
| uzwojenie TR Dyn11 + R_N 43,3 Ω | Z_T + 3·R_N | — | 219,7 |
| izolowany | — | — | `fault.zero_sequence_no_path` |
| dławik; dławik + AWSC spoczynek | — | — | `fault.zero_sequence_outside_iec60909` |

Węzeł 110 kV sieci, w której źródło nie ma Z0 (W002 ostrzega), dostaje
`fault.zero_sequence_missing_data` (BRAK_PODSTAWY) ze źródłem w `elementy` — bieg 1F nie jest
blokowany, a szyna SN za YNd11 liczy się z zespołu (`test_wezly_wn_bez_z0_zrodla_…`).

### 3.3 I_C i I_R — prąd pojemnościowy i prąd rezystora

Sieć: 15 kV, kabel 20 km, C_0 = 500 nF/km → b_0 = ω·C_0 = 157,08 µS/km, B_0 = 3,1416 mS.

- I_C = √3·U_n·B_0 = √3·15 000 V·3,1416·10⁻³ S = **81,62 A** (`prad_pojemnosciowy_doziemienia_a`;
  przypięte `test_zwarcie_bez_admitancji_poprzecznych.py::test_doziemne_siec_izolowana_…`).
- I_R = U_f/R_N = 8 660,3 V / 43,3 Ω = **200,0 A** (gałąź rezystora `prad_a` w `UziemienieSekcji`).
- I_R/I_C = 2,45 — składowa czynna przeważa nad pojemnościową (kryterium doboru rezystora
  ocenia analiza projektu uziemienia V12.6 z tej samej prawdy).
- Dławik I_L = 100 A w tej sieci: v = (I_L − I_C)/I_C = (100 − 81,62)/81,62 = **0,225**
  (przekompensowanie 22,5 %; `stopien_rozstrojenia`). Praca w rezonansie (|v| < 10⁻³) to
  ostrzeżenie sieci (Zeszyt 1 §16 s. 30: zakaz pracy przy I_L = I_C).

### 3.4 Rdzeń `short_circuit_core.skladowa_nieokresowa`

Sieć uziemiona przez rezystor z dużą pojemnością B0 daje pętlę 1F o R/X < 0
(pojemnościową). Wykładnik e^(−ω·t_b·R/X) przekraczał zakres liczby i `OverflowError`
wywracał cały bieg. Teraz nadmiar → ∞, a wiersz z wartością niefinitową oznacza bramka
`canonical_analysis` jako niefizyczny z wykazem pól — ta sama reguła, co `_thermal_mn_factors`.

### 3.5 Złote hashe parytetu (dowód semantyczny regeneracji)

`tests/golden/parytet_assemblera/zlote_hashe.json` i `tests/golden/parytet_p11/zlote_hashe.json`
zregenerowane skryptami `regeneruj.py`. Porównanie przed/po wpis po wpisie:

- parytet assemblera: 366 wpisów, zmienione 122 — WYŁĄCZNIE `SC_1F_max` (61) i `SC_2FG_max` (61);
  rozpływ i zwarcia 3F/2F bez zmian bit w bit;
- parytet P11: 183 wpisy, zmienione 8 — wyłącznie `short_circuit_1f`;
- wpisy, które dotąd liczyły się w całości, mają po zmianie liczby będące PODZBIOREM
  (multizbiór) dawnych liczb — węzły z drogą prądu zerowego liczą się identycznie, a znikają
  wyłącznie liczby węzłów, w których wynik dawała kotwica 1e6 (teraz nazwana przyczyna);
- wpisy z dawną odmową całego biegu („Zero-sequence Y-bus is singular", np. złota sieć
  bez uziemienia SN) liczą się teraz węzeł po węźle z przyczyną dla węzłów bez drogi.

### 3.6 V12.6: zakres sieci SN, I_C przy napięciu sieci (B-01, `v126_academic.py`)

Sonda przed kartą: projekt uziemienia V12.6 brał U_l = najwyższe napięcie szyny MODELU,
a do B_0 wchodziła każda linia i kabel modelu. W modelu GPZ 110/15 kV (fikstura harnessu
`akademickie_scena_biegi.json`, bieg `neutral_earthing_design`, kabel `cab_main_b`
2,4 km, b_0 = 41 µS/km, B_0 = 98,4 µS):

| | U_l [kV] | I_C = √3·U_l·B_0 [A] |
|---|---|---|
| przed (baza 1465336df) | 110 | 18,7477 |
| po karcie | 15 | 2,5565 |

Zawyżenie 110/15 = 7,33 raza. Teraz `V126UziemienieSnInput.napiecie_kv` i `galezie_sieci`
pochodzą z tej samej prawdy (`uziemienie_sieci`, predykat gałęzi `galezie_sieci_sn` —
linie i kable załączone wychodzące z szyn sieci SN); ten sam zbiór czyta ocena ferrorezonansu
i gotowość V12.6 (predykaty parami). Przypięte: `test_v126_neutral_earthing_design.py::
TestZakresSieciSn` (gałąź 110 kV × napięcie) i `test_skladowa_zerowa_zu.py::
test_v126_prad_pojemnosciowy_rowny_jedynej_prawdzie` (wariant × liczba odcinków, wyrocznia
√3·U_n·ΣB_0·ℓ).

### 3.7 V12.6: projekt uziemienia rezystorowego sprawdza rezystor MODELU

Dawniej parametry biegu „docelowy prąd doziemienia" i „energia znamionowa rezystora"
wymyślały rezystor obok modelu. Teraz `_ner_design` czyta rezystory punktów neutralnych
w ruchu (zespół albo uzwojenie SN transformatora uziemione przez R_N):

- R_N = 1/Σ(1/R_k), I_R = U_f/R_N, I_ef = √(I_R² + (I_C − I_L)²), gdzie I_L = Σ prądów
  dławików w ruchu wyłącznie w układzie Z.14 (dławik ‖ rezystor), inaczej 0;
- wytrzymałość cieplna każdego rezystora: E_k = (U_f/R_k)²·R_k·t_wył ≤ E_n,k = I_n,k²·R_k·t_n,k;
  rozstrzyga rezystor o najmniejszym zapasie; t_wył z parametru biegu `ner_clearing_time_s`
  (czas wyłączenia doziemienia — wielkość przypadku, nie urządzenia), jego brak →
  „dane niekompletne" wyłącznie dla oceny cieplnej z polem nazwanym;
- brak R, I_n albo t_n urządzenia → wartość robocza (pozycja typowa katalogu §16, I_n = U_f/R
  dla uzwojenia TR), wpis `dane_przyjete` ESTIMATED, `kompletnosc_dowodu = NIEPELNY`;
- brak rezystora w modelu przy wariancie rezystorowym → odmowa nazwana `ner_no_resistor`
  (`uziemienie_sn.sieci.rezystory`); prąd dławików Z.14 i prąd doziemienia liczy od 2026-10-29
solver doziemienia sieci z punktów uziemienia w ruchu (`uziemienie_sn.sieci.punkty_neutralne`,
§3.17) — brak punktów to odmowa nazwana tym polem.

Sonda (15 kV, rezystor 43,3 Ω / 200 A / 10 s, kabel 2 km): I_R = 8 660,3/43,3 = 200,0 A;
t_wył = 1 s → E = 200²·43,3·1 = 1,732 MJ ≤ E_n = 200²·43,3·10 = 17,32 MJ (zapas 10×).
Przypięte: `TestNerResistorSizing` (model × parametry nie nadpisują × Z.14 × dwa rezystory ×
t_wył {10, 10,5} s × rezystor o najmniejszym zapasie × wartości robocze → NIEPELNY)
i `test_v126_rezystor_z_modelu_z_danymi_przyjetymi` (wariant {Z.15, Z.14, uzwojenie TR} ×
t_wył {brak, 1 s}). Projekt uziemienia dotyczy dławika albo rezystora w punkcie neutralnym
sieci — zespołu ALBO uzwojenia SN transformatora (wariant rezystorowy uzwojenia był dotąd
odmawiany, choć jest klasycznym uziemieniem przez rezystor).

### 3.8 Dane przyjęte bocznika zespołu w wynikach zwarć doziemnych (§0 pkt 4, zasada nr 4)

Bocznik Z_0,TU + 3·Z_N liczony z wartości roboczej (R0/X0 transformatora uziemiającego
z pozycji typowej, R rezystora z pozycji typowej, nastawa dławika ze środka zakresu §16,
prąd AWSC 30 A) nie udaje danej producenta: bieg zwarcia doziemnego niesie założenie
nazwane `zespol_uziemiajacy.wartosc_robocza` (kod rejestru gotowości INFO, akcja naprawcza
„edycja parametrów zespołu"), a wiersz każdego punktu zwarcia w składowej sieci zerowej
szyny zespołu — dane przyjęte ESTIMATED tych parametrów (`dane_przyjete_galezi`, ten sam
mechanizm i ten sam predykat składowej co R′0/X′0 gałęzi z katalogu). Wybór parametrów:
`PunktUziemienia.dane_przyjete_bocznika(stan_awsc)` — wyłącznie te, które kształtują bocznik
w stanie AWSC przypadku (prąd AWSC tylko po załączeniu, zakres dławika tylko bez nastawy
projektanta). Wielkości liczone wprost z modelu z Z0 węzła (`dane_przyjete_wezla`,
równoważnik sieci SN dla pętli nN) niosą te same dane. Projektant, który wpisze dane
producenta różne od pozycji typowej, dostaje wynik bez założenia.

Przypięte w `test_skladowa_zerowa_zu.py`: wariant × stan AWSC (8 komórek, wiersz liczony
niesie dokładnie dane robocze, wiersz bez liczby — żadnych), AWSC bez prądu × stan,
nastawa dławika robocza w Z.14, wartości projektanta → brak założenia i I″k1 z wyroczni,
dwie sekcje × zespoły {obie, jedna} × sprzęgło {zamknięte, otwarte}, `dane_przyjete_wezla`
z i bez składowej zerowej.

### 3.9 V12.6: prąd pojemnościowy KAŻDEJ sieci galwanicznej (B-01, znalezisko karty BKR)

Defekt klasy jednej prawdy uziemienia: projekt uziemienia V12.6 (dobór dławika, sprawdzenie
rezystora, AWSC) i ocena ferrorezonansu sumowały B_0 gałęzi WSZYSTKICH sieci SN modelu (po
tej karcie — sumę ich zbiorów gałęzi), a przed tą kartą wszystkich linii i kabli modelu. Przy
dwóch sekcjach GPZ z otwartym sprzęgłem (normalny stan GPZ dwutransformatorowego) każda sekcja
ma własną sieć galwaniczną i własny zespół uziemiający, więc I_C jednej sieci był zawyżony
o pojemność drugiej. Po scaleniu z kartą UX-04/POLE-BKR-MODEL to samo dotyczyło baterii
w gwieździe uziemionej (B_0 baterii doliczane z całego modelu) — a jedyna prawda
(`uziemienie_sieci`, walidator rozstrojenia) baterii w ogóle nie liczyła.

Naprawa u źródła: `UziemienieSekcji.b0_s` dokłada B_0 baterii tej sieci (`baterie_sieci_sn`,
`b0_baterii_s` — ta sama admitancja z pierwszych zasad co mapowanie składowej zerowej,
`admitancja_zerowa_baterii_s`, częstotliwość z nagłówka modelu); wejście V12.6 niesie listę
`V126UziemienieSnInput.sieci` — dla każdej galwanicznie połączonej sieci SN jej szyny, gałęzie
(`galezie_sieci_sn`), baterie (`baterie_sieci_sn`), rezystory, prąd dławików i dane przyjęte;
solver liczy I_C, dobór i blok wiarygodności dla KAŻDEJ sieci osobno; gotowość czyta te same
sieci (blokuje dopiero brak C0 we wszystkich, sieć bez C0 to nieblokujące
`galezie.siec_bez_c0`). Model z jedną siecią: kształt wyniku bez zmian (fikstura odpowiedzi
`neutral_earthing_design` bit w bit jak na `280bafcb4`); kilka sieci: tablica `sieci` (wiersz
na sieć: szyna punktu neutralnego, nazwa, pełny wynik), blok wiarygodności zbiorczy
z naruszeniami nazwanymi siecią, status „dane niekompletne" całości wyłącznie, gdy żadnej sieci
nie policzono. Ekran wyniku: tabela „Sieci SN połączone galwanicznie" (tylko przy kilku
sieciach) i werdykt z wyników składowych tą samą mapą statusów (bez nowej mapy).

Podstawa: IEC 60909-0 pkt 7 i PN-EN 50522 zał. B — I_C = 3·ω·C_0·U_f = √3·ω·C_0·U_n,
B_0 = ω·C_0 = Σ b_0·ℓ gałęzi sieci + B baterii w gwieździe uziemionej (Y_0 = Y_1,
B = Q_n/U_n²). Sonda na tym samym modelu (GPZ 110/15 kV, dwie sekcje, zespół z dławikiem
w każdej, kabel SN 4 km w sekcji 1 i 1,5 km w sekcji 2, b_0 = 122,52 µS/km, kabel 110 kV
10 km z b_0 = 47,12 µS/km, bateria 1,2 Mvar w gwieździe uziemionej w sekcji 2,
B = 5,333 mS), skrypt sondy uruchomiony na `git archive` obu drzew:

| Model | przed: `687a2ef65` (karta BKR) | przed: `280bafcb4` (ta karta) | po |
|---|---|---|---|
| sprzęgło zamknięte, bez baterii | 218,1729 A (U_l = 110 kV, z kablem 110 kV) | 17,5077 A | 17,5077 A |
| sprzęgło zamknięte, bateria w sekcji 2 | 1234,3093 A | 17,5077 A (bateria pominięta) | 156,0718 A |
| sprzęgło otwarte, bez baterii | 218,1729 A (jedna „sieć") | 17,5077 A (jedna „sieć") | sekcja 1: 12,7329 A; sekcja 2: 4,7748 A |
| sprzęgło otwarte, bateria w sekcji 2 | 1234,3093 A (jedna „sieć") | 17,5077 A | sekcja 1: 12,7329 A; sekcja 2: 143,3389 A |

Sprawdzenie ręczne: √3·15 kV·(122,52 µS/km·4 km) = 12,733 A; √3·15 kV·(122,52 µS/km·1,5 km)
= 4,775 A; √3·15 kV·5,333 mS = 138,56 A (+ 4,775 A = 143,34 A). Determinizm: dwa biegi sondy po
naprawie — te same SHA-256 wyniku dla każdego z czterech modeli; `test_determinizm_wyniku_wielu_sieci`.

Przypięte: `tests/enm/test_prad_pojemnosciowy_sieci_galwanicznej.py` — iloczyn sprzęgło
{zamknięte, otwarte} × liczba transformatorów 110 kV/SN {1, 2} × bateria w gwieździe
uziemionej {brak, w sekcji 1, w sekcji 2}, stałe: zespół z dławikiem w każdej sekcji, kable
o różnej długości, kabel 110 kV z B_0; sprawdza jedyną prawdę (B_0, I_C, baterie sieci),
wejście V12.6 (gałęzie każdej sieci), wynik solvera (I_C z wyroczni, gałęzie i baterie
wnoszące, dobór dławika), gotowość (`galezie.siec_bez_c0` × sprzęgło × bateria) i ocenę
ferrorezonansu sieci izolowanej (sprzęgło × próg pojemności doczepnej: każda sekcja poniżej
10 µS, suma powyżej);
`tests/enm/test_bateria_kondensatorow_iloczyn.py` (kabel nN za transformatorem SN/nN nie
należy do sieci SN); front `EkranAnalizAkademickich.test.tsx` (liczba sieci {1, 2} × statusy
składowe {dostrojone, jedna rozstrojona, status spoza mapy}).

Ograniczenie zostawione świadomie: model z sieciami SN o RÓŻNYM sposobie uziemienia albo
różnym napięciu dostaje nazwaną odmowę całej analizy (sprzed tej poprawki) — V12.6 ma jeden
rodzaj uziemienia na bieg (`neutral_earthing_type` wyniku), a rozdzielenie na przypadki
obliczeniowe jest jawnym następnym krokiem projektanta w treści odmowy.

### 3.10 Scalenie z gałęzią UI/UX (karta UX-04/POLE-BKR-MODEL, `687a2ef65`)

Konflikty rozstrzygnięte: role pól (`ZU` i `BKR` w obu listach, kanoniczne aliasy ról
odrzucane nazwaną odmową wg testów karty BKR), dane przyjęte gałęzi (zespół i bateria),
kontrakt V12.6 (jeden serializator pól addytywnych: `uziemienie_sn` None i pusta lista baterii
poza odciskiem), rejestr kodów gotowości 184 (168 + 10 tej karty + 6 karty BKR), front SLD
(role, paleta, adnotacje GPZ obu kart). Testy karty BKR wołające projekt uziemienia
z parametrem `neutral_earthing_type` przepisane do kanonu tej karty (sposób uziemienia z
zespołu w modelu, wejście z rodzajem analizy). Fikstury zregenerowane generatorami: harness
(`eksport_fixtur_harnessu.py`), odpowiedzi V12.6 (`generuj_odpowiedzi_v126`, generator podaje
uziemienie wyłącznie analizom zależnym od punktu neutralnego — jak ścieżka API), złote hashe
parytetu assemblera, fikstura rejestru gotowości frontu, słownik kodów gotowości, fikstury ENM
SLD, dokument kontraktów operacji, odciski rdzeni B-01 (`solver_diff_guard --init`). Piny
zmierzone: odcisk katalogu po scaleniu, pola kontraktów wejściowych 4419 → 4442 (+20 karty
BKR, +3 `sieci`/`baterie_sieci`/`baterie_b0`), zapadka podstawień 222 → 220 (częstotliwość
z nagłówka modelu zamiast `enm.buses[0].frequency_hz or 50.0`).

### 3.11 Odcinek bez składowej zerowej: wartość robocza albo nazwana odmowa (zasada nr 4, B-01)

Dyrektywa sesji głównej: brak danych Z0 daje wartość roboczą wg zasady nr 4 z wpisem
w `dane_przyjete` albo nazwaną odmowę — ciche zero jest niedopuszczalne. Przed zmianą linia
albo kabel bez R′0/X′0 w modelu (import, parametry ręczne, edycja projektanta po materializacji)
zatrzymywał zwarcia doziemne: W001 odbierał zdolność 1F, `ELIG_SC1_MISSING_Z0` blokował
kwalifikowalność, rozpływ niesymetryczny odmawiał, a mapowanie pomijało gałąź (węzeł odcięty →
`brak_danych`). Trzy bramy i obliczenie miały przy tym różne predykaty (W001 i
kwalifikowalność: oba pola puste — `and`; mapowanie: którekolwiek — `or`), więc model z jednym
polem przechodził bramę i dostawał odmowę w biegu.

Jedno źródło: liściowy moduł `enm/skladowa_zerowa_galezi.py` (`skladowa_zerowa_odcinka`,
`skladowa_zerowa_galezi`, `napiecia_szyn_kv`). Reguła zależy od pasma napięcia szyny początku
odcinka:

| Pasmo, odcinek | Wartość robocza | Podstawa |
|---|---|---|
| SN, linia albo kabel | R′0 = 3·R′1, X′0 = 3·X′1 | ta sama reguła co pozycje katalogu (`wartosci_robocze.wyprowadz_skladowa_zerowa`, karta LINIA-110) |
| SN, kabel ze znaną żyłą powrotną (ekran każdej żyły) | R′0 = R′1 + R′ żyły powrotnej, X′0 = 3·X′1 | jw. — ekran żyły niesie I0 |
| nN, kabel ze znaną żyłą PE/PEN | R′0 = R′1 + 3·R′PE, X′0 = X′1 + 3·X′PE | wspólna żyła powrotna niesie 3·I0; ta sama impedancja pętli co IEC 60364-4-41 (Z_pętli = Z_L + Z_PE ⇔ (2·Z1 + Z0)/3) |
| nN, kabel bez danych żyły powrotnej | brak — odmowa nazwana | reguła 3·R′1 zaniżałaby R′0 kabla czterożyłowego (R′1 + 3·R′PE ≫ 3·R′1) i zawyżała prąd doziemny — strona niebezpieczna |
| nN, linia | brak — odmowa nazwana | przewód neutralny nieopisany w modelu |
| WN albo napięcie szyny nieznane | brak — odmowa nazwana | R′0/X′0 linii WN z geometrii słupa albo od operatora (karta LINIA-110) |
| R′1 albo X′1 nieznane albo niedodatnie | brak — odmowa nazwana | stosunek typowy wymaga niezerowej impedancji zgodnej |

Wartość robocza nie zmienia modelu (projektant wpisuje R′0/X′0 i przelicza). Bieg niesie
założenie `branch.z0_wartosc_robocza` ze składnikami, wiersz 1F/2FG — `dane_przyjete_galezi`
z jakością `ESTIMATED` i nazwą „R′0 wartość robocza (Odcinek …)”, krok śladu `z0_line[…]` —
wartości użyte i opis wartości roboczej; rozpływ niesymetryczny — źródło Z0 „wartość robocza”.
Odmowa nazwana niesie treść `brak_podstawy_pl` w W001, w `ELIG_SC1_MISSING_Z0`, w zdaniu
przyczyny wiersza (`brak_wyniku_zerowego.wyjasnienie`) i w odmowie rozpływu niesymetrycznego.
Kreator przestał blokować 1F brakiem Z0 źródła („Brak Z0 w źródłach”) — jak walidator ENM
(§0 pkt 3: Z0 źródła nie decyduje o sieci SN).

Sonda B-01 przed/po (`b6349aeb0` → drzewo karty), sieć SN: system 110 kV (Z0/Z1 = 1,2),
TR 110/15 kV Dyn11 25 MVA, kabel 4 km R′1 = 0,2, X′1 = 0,1 Ω/km, węzeł stacji S1, 1F:

| Kabel | Przed | Po |
|---|---|---|
| R′0 = 0,6, X′0 = 0,3 wpisane | 4311,6 A | 4311,6 A |
| bez R′0/X′0 | `brak_danych` | 4311,6 A (wartość robocza 0,6 / 0,3, dane przyjęte ESTIMATED) — bit w bit jak wpisane |
| bez R′0/X′0, żyła powrotna 0,5 Ω/km | `brak_danych` | 4150,6 A (R′0 = 0,7) |
| bez R′0/X′0, R′1 = 0 | `brak_danych` | `brak_danych` (przyczyna z regułą) |

Sieć nN: sieć SN 15 kV → TR 15/0,42 kV Dyn11 630 kVA → kabel nN 0,1 km R′1 = 0,206,
X′1 = 0,08 Ω/km → złącze, 1F (2F+Z):

| Odcinek nN | Przed | Po |
|---|---|---|
| R′0 = R′1 + 3·0,727, X′0 = X′1 + 3·0,08 wpisane | 2501,3 A (6691,3 A) | 2501,3 A (6691,3 A) |
| kabel bez R′0/X′0, PE 0,727 / 0,08 Ω/km | `brak_danych` | 2501,3 A (6691,3 A), R′0 = 2,387, X′0 = 0,32 ESTIMATED |
| kabel bez R′0/X′0, bez danych PE | `brak_danych` | `brak_danych` |
| linia bez R′0/X′0 | `brak_danych` | `brak_danych` |

Dwanaście wpisów benchmarków liczonych na `1465336df` z kotwicy 1e6 (sześć sieci × {1F, 2F+Z};
wiersze liczone / największy prąd → przyczyny na `b6349aeb0` → przyczyny po tej zmianie):

| Sieć | `1465336df` (kotwica) | `b6349aeb0` | po zmianie |
|---|---|---|---|
| IEEE 4 węzły (132 kV) | 4/4, do 41 222 A (2F+Z 47 599 A) | `brak_danych` 4 | `brak_danych` 4 — „odcinek sieci 132 kV — reguła wartości roboczej obejmuje sieci SN i nN…” |
| IEEE case9 (345 kV) | 9/9, do 126 539 A (146 111 A) | `brak_danych` 9 | `brak_danych` 9 — reguła WN |
| IEEE 34 węzły (24,9 kV) | 30/30, do 17 390 A (20 080 A) | `brak_danych` 30 | `brak_drogi` 30 — sieć SN bez zespołu uziemiającego (Z0 źródła SN nie decyduje, §0 pkt 3) |
| CIGRE MV 14 węzłów | 15/15, do 21 963 A (25 361 A) | `brak_danych` 15 | `brak_drogi` 15 — jw. |
| CIGRE LV 0,4 kV | 6/6, do 10 942 A (12 635 A) | `brak_danych` 6 | `brak_danych` 6 — „linia nN — droga powrotna prądu zerowego … nieopisana” |
| pandapower IEC radial | 2/2, do 9,1·10⁹ A (2,5·10¹⁰ A) | `brak_danych` 2 | `brak_drogi` 2 — jw. |

Na `b6349aeb0` brak danych odcinków maskował rzeczywistą przyczynę w sieciach SN; z wartością
roboczą odcinków przyczyną jest nieuziemiony punkt neutralny. Pozostałe benchmarki (IEEE 13,
case14, case39, pandapower 4-bus, IEC 60909-4) — żaden wiersz liczony ani przed, ani po; węzły
po stronie źródła WN bez Z0 zostają `brak_danych` (dana operatora). Węzeł izolowany (sonda
`sonda_izol`): bez B0 `brak_drogi`, z B0 `poza_zakresem_iec60909` z odesłaniem do projektu
uziemienia (prąd z pojemności, I_C — §3.3, §3.9) — bez zmian względem `b6349aeb0`; na
`1465336df` z B0 liczony z kotwicy (28,7 A), bez B0 odmowa macierzy osobliwej.

Złote hashe parytetu assemblera (dowód semantyczny regeneracji): 108 z 366 wpisów zmienionych,
wyłącznie warianty 1F/2F+Z; 1054 wiersze liczone przed — wszystkie liczby identyczne (0 pól
zmienionych); 408 wierszy nowych liczonych (548 wierszy `brak_danych` → 408 liczonych
z wartością roboczą + 140 `brak_drogi`); `brak_danych` 682 → 134 (sieci WN, linie nN,
źródła WN bez Z0); pozostałe przyczyny bez zmian. Fikstury projekcji nN (`16_stale_result`,
`17_sc_results`) zregenerowane generatorem: cztery W001 kabli nN z żyłą PE zniknęły.

### 3.12 Transformator bez grupy połączeń w sieci zerowej (B-01)

Transformator bez `vector_group` (W004) nie wchodzi do Y0 (`build_transformer_zero_seq_model`:
zero zgadywania), ale węzeł za nim dostawał `brak_drogi` — „zwarcie doziemne nie płynie”,
twierdzenie fizyczne, którego bez grupy połączeń nie da się postawić — a węzeł uziemiony innym
bocznikiem był liczony tak, jakby uzwojenie było otwarte (uzwojenie YN z uziemionym punktem
neutralnym dołożyłoby bocznik równoległy: prąd zaniżony). Teraz każda składowa sieci zerowej
stykająca się z takim transformatorem dostaje `brak_danych` z elementem, zdaniem
„Transformator bez grupy połączeń (…) … Uzupełnij grupę połączeń transformatora.” i pozycją
„czego brakuje” — ta sama reguła co źródło bez Z0 i ten sam kanon co blokada
`transformer.vector_group_missing` kwalifikowalności solvera. Sonda (`sonda_izol`, TR bez grupy,
kabel i źródło bez Z0): węzły SN `brak_drogi` → `brak_danych`. Sieci rejestru: żadna nie ma
transformatora bez grupy (statusy wierszy wszystkich 366 wpisów identyczne przed i po tej
części), więc złote hashe bez zmian.

### 3.13 Odcinek SN bez B′0 — wartość robocza pojemności doziemnej (zasada nr 4, B-01)

Katalog kabli i linii SN nie niesie pojemności doziemnej. Dawniej odcinek bez B′0 dawał
`b0_s = 0` i `prad_pojemnosciowy_a = None` (sieć „bez I_C”), a projekt uziemienia V12.6 meldował
`missing_fields = ["b0_siemens_per_km"]`. Teraz jedna reguła
(`network_model/catalog/wartosci_robocze.py::wyprowadz_susceptancje_zerowa_sn`, wpięta w jedyny
predykat `enm/skladowa_zerowa_galezi.py::skladowa_zerowa_galezi`): kabel SN B′0 = B′1 (żyły
z ekranem nad izolacją, pole promieniowe — IEC 60502-2: C′0 = C′1), linia SN B′0 = 0,4·B′1
(metoda odbić zwierciadlanych dla typowych słupów SN 0,34–0,45); B′0 w modelu ma pierwszeństwo;
nN, WN, napięcie nieznane i B′1 nieznane — brak nazwany, nie zero. Dana przyjęta ESTIMATED
w jednostce S/km, kompletność dowodu NIEPEŁNY.

Sonda (`sonda_odcinek2.py`, magistrala 1,5 + 3,5 km z katalogu bez B′0, dławik albo rezystor):
I_C `None` → 15,9161 A (√3·15 kV·0,000612611 S); projekt uziemienia V12.6 z `missing_fields`
→ liczony (dławik: X_L = 544,1195 Ω przy I_L = I_C; rezystor: I_R = 197,3113 A, I_F = 197,4321 A
— patrz §3.17); I″k1 sieci rezystorowej bez zmian 216,9163 A.

Akapit niżej opisuje stan sprzed warunku współczynnika zwarcia doziemnego — **zastąpiony
przez §3.19** (B′0 modelu i B′0 roboczy pod jednym warunkiem k > 1,4). Stan dawny: wartość robocza B′0 NIE wchodziła do sieci zerowej zwarć IEC 60909 (`enm/mapping.py`, bocznik
pojemności wyłącznie z B′0 modelu; `enm/dane_przyjete_galezi.py::galezie_z0_robocze` bez B′0).
Podstawa: IEC 60909-0:2016 rozdz. 1 — wiersz 1F sieci izolowanej i skompensowanej jest poza
zakresem normy (prąd pojemnościowy z B′0 roboczego niesie `doziemienie_sieci`), a pkt 5.2 f)
uwzględnia pojemności linii w składowej zerowej sieci uziemionej przez małą impedancję tylko
przy współczynniku zwarcia doziemnego > 1,4 (warunek wdraża karta rdzenia ZEROWA-POJEMNOSCI;
bezwarunkowy bocznik B′0 modelu jest stanem sprzed tej karty; w sieci uziemionej przez rezystor,
gdzie k > 1,4, Y0 niesie pojemności dziś tylko z B′0 modelu, a prąd pojemnościowy z B′0
roboczego wchodzi do I_F = √(I_R² + I_C²) bloku `doziemienie_sieci` tego samego wiersza). Pierwsza wersja odcinka wpinała
B′0 roboczy także w Y0 — pomiar parytetu assemblera wykazał wtedy zmianę liczb wierszy
liczonych wcześniej w dwóch sieciach rejestru uziemionych bezpośrednio, G16 i G17 (I″k1
2005,818 → 2005,753 A i 4474,800 → 4474,153 A przy współczynniku zwarcia doziemnego
0,96–1,23 ≤ 1,4, czyli tam, gdzie pkt 5.2 f) pojemności pomija), i dawała sondzie
I″k1 216,9163 → 217,1240 A; poprawka przywraca te liczby. Porównanie klucz po kluczu wszystkich
366 wpisów parytetu (stan przed odcinkiem `0344668a0` ↔ po poprawce): 0 zmian liczb na wspólnych
ścieżkach i 0 zmian „liczba → brak liczby”; zmienione wyłącznie wpisy SC_1F i SC_2FG — przyczyna
braku wyniku zerowego węzłów SN bez uziemienia punktu neutralnego `brak_drogi` →
`poza_zakresem_iec60909` (sposób pracy punktu neutralnego: izolowany, §3.17) i blok
`doziemienie_sieci` dopisany do wierszy 1F. Testy: `tests/enm/test_b0_wartosc_robocza_odcinka.py`
(`test_bocznik_y0_zwarc_wylacznie_z_b0_modelu` — iloczyn sposobu pracy punktu neutralnego
× B′0 modelu/brak × konsument, wyrocznia niezmienności liczb wiersza 1F przy podwojeniu B′1).

### 3.14 Napięcie powrotne (TRV) i prąd załączania V12.6 bez wartości zastępczych (B-01)

Dawniej `_transient` podstawiał U_r = największe U_n szyn (w modelu GPZ — 110 kV dla
wyłącznika SN), f_n = 12 kHz, τ = 180 µs i krotność prądu załączania 8·I_n — bez podstawy
normowej. Teraz U_r proponuje gotowość z modelu: U_m sieci SN (IEC 60038 tab. 3–5; U_r aparatu
= U_m, IEC 62271-1), a f_n, τ i krotność prądu załączania są parametrami wymaganymi z nazwanym
brakiem (`missing_fields`, `brak_danych`). Sonda: bieg bez parametrów — margines −1194,8609 %
i status „niespełniony” → brak nazwany czterech pól, krzywa pusta; fixtura strażnika prezentacji
dostaje parametry jawnie (U_r 17,5 kV zamiast 15 kV: krzywa ×17,5/15, margines bez zmian, bo
obie strony skalują się z U_r). Testy: `tests/test_v126_trv_parametry.py`,
`tests/application/analyses/test_v126_gotowosc.py`. Wartości robocze f_n i τ nie powstały:
tablice znamionowych parametrów TRV IEC 62271-100 (u_c, t_3) nie są danymi programu, a wpisanie
ich z pamięci byłoby fabrykacją — wymaga to wprowadzenia tablic normy z redakcją i jednostką
redakcyjną (zgłoszone na liście znalezisk w §6).

### 3.15 Przewód N w rozpływie niesymetrycznym nN

Rozpływ niesymetryczny (`network_model/solvers/power_flow_unbalanced.py`, postać Krona) liczy
napięcia faza–N; impedancja wzajemna Z_m = (Z0 − Z1)/3 jest w sieci nN impedancją przewodu N.
Wynik dostał prąd przewodu N gałęzi nN I_N = I_a + I_b + I_c (`prad_n_a`) i potencjał przewodu N
szyny nN względem PE (`u_n_pe_v`, zero w węźle bilansującym i po stronie transformatora z
uziemionym punktem gwiazdowym), z maksimami w podsumowaniu — pola addytywne kontraktu
`domain/result_contract_power_flow_unbalanced_v1.py` wyłącznie dla nN; ekran stanu fazowego
pokazuje obie wielkości. Straty kabla nN liczone z prądem przewodu N (dawne założenie „straty
z impedancji własnej” zdjęte). Sonda: odbiór jednofazowy — I_N 96,087 A, U_N–PE 7,924 V;
odbiór dwufazowy — I_N 91,398 A, U_N–PE 7,537 V, straty kabla nN 1,768 → 1,552 kW; odbiór
symetryczny — 0 A, 0 V. Testy: `tests/enm/test_rozplyw_niesymetryczny_przewod_n.py`.

### 3.16 Obciążalność cieplna rezystora punktu neutralnego (D31, B-01)

Sprawdzenie cieplne rezystora liczy prąd NAJWIĘKSZY (c_max z jedynego nośnika IEC 60909-0
tab. 1, droga zerowa Z_0,TU/3 albo Z_T0 uzwojenia transformatora), prąd cieplny zastępczy
I_th = I_R·√(m + n) (IEC 60909-0 §12) i znamionowanie czasowe I_n, t_n (IEEE Std C57.32):
E_k = I_th²·R·t_wył ≤ E_n, czas dopuszczalny t_dop z I_th(t)²·t = I_n²·t_n. Sonda (R = 43,3 Ω,
200 A / 10 s, t_wył 1 s): I_R 200,0 A (U_f/R) → 217,2686 A (c_max = 1,1, Z_0,TU), I_th
217,5461 A, E_k 1,7321 → 2,0492 MJ ≤ E_n 17,32 MJ, t_dop 8,471 s. Brak t_wył — ocena cieplna
„dane niekompletne” z polem `ner_clearing_time_s`, liczby I i t_dop bez zmian. Testy:
`tests/enm/test_v126_ner_cieplo_zu.py`.

### 3.17 Sposób pracy punktu neutralnego a zwarcie 1F

Warunek odbioru właściciela (2026-10-29): sposoby pracy punktu neutralnego sieci SN nie
przechodzą przez jeden model Z1+Z2+Z0. Tryb wynika z jedynej tabeli
`network_model/core/uziemienie.py::TRYB_DOZIEMIENIA_TYPU` (isolated → izolowany,
petersen_coil → kompensowany, resistor_grounded → rezystor, directly_grounded → bezpośredni),
prąd i napięcia liczy solver `network_model/solvers/doziemienie_sn.py::oblicz_doziemienie`
(warstwa solverów, poza listą rdzeni FROZEN), a wiersz zwarcia 1F, wiersz odpowiedzi, raport,
konfigurator stacji, projekt uziemienia V12.6 i koordynacja izolacji V12.6 czytają ten sam
wynik (`enm/doziemienie_sieci.py::doziemienie_wiersza`, `enm/uziemienie_sekcji.py`).

| Tryb | Model | Wzór | Norma / podstawa | Wynik sondy (15 kV, kabel 2 km, B′0 = 2π·50·390 nF/km) |
|---|---|---|---|---|
| izolowany | admitancja sieci, impedancje podłużne pominięte | I_C = 3ωC_0U_f = √3·U_n·B_0; U0 = U_f; U_b = U_c = √3·U_f | IEC 60909-0:2016 rozdz. 1 (poza zakresem); podwójne doziemienie — IEC 60909-3, odmowa nazwana | I_C = 6,3664 A; U0 = 8 660,25 V; U_b = U_c = 15 000 V; k = 1,7321; wiersz IEC: przyczyna „poza zakresem IEC 60909” (dawniej „brak drogi”) |
| kompensowany | admitancja sieci + punkt neutralny I_N = Σ U_f/(Z_N + Z_0/3) | I_res = √(I_w² + (I_C − I_L)²); v = (I_C − I_L)/I_C (v > 0 — niedokompensowanie) | IEC 60909-0 rozdz. 1 (poza zakresem); ENEA Zeszyt 1 §16, Z.13 | dławik 100 A: I_L = 97,7396 A, I_w = 0,5516 A (R_0,TU), I_res = 91,3748 A, v = −14,3523; AWSC załączony: I_w = 29,1633 A, I_res = 95,7912 A (dawniej I″k1 = 104,59 A z modelu impedancyjnego — przyczyna „poza zakresem IEC 60909”) |
| rezystor | admitancja sieci + punkt neutralny (R_N z Z_0,TU albo Z_T0 w szeregu); napięcia z impedancji składowych punktu | I_F = \|I_N + jI_C\|, przy czystym R_N: I_F = √(I_R² + I_C²), I_R = U_f/R_N; Z.14 — dławik ‖ rezystor w jednym Z_N | ENEA Zeszyt 1 §16, Z.14/Z.15; napięcia — składowe symetryczne, k (IEC 60071-1) | Z.15: I_w = 197,3113 A, I_L = 9,0096 A (X_0,TU), I_F = 197,3290 A, k = 1,7425; Z.14: I_L = 104,0443 A, I_w = 189,2451 A, I_F = 212,9664 A; uzwojenie TR (Z_T0): I_F = 199,9865 A; V12.6 I_F 200,1072 → 197,3290 A (Z_0,TU i znak I_C − I_L) |
| bezpośredni | rdzeń IEC 60909 (Z1 + Z2 + Z0 punktu) | I″k1 = 3cU_f/\|Z1 + Z2 + Z0\|; V_b = E·[(a² − a)Z2 + (a² − 1)Z0]/(Z1+Z2+Z0) | IEC 60909-0:2016 | I″k1 = 3 456,1058 A (bez zmian); U0 = 6 486,76 V; U_b = 11 984,96 V, U_c = 12 578,23 V; k = 1,4524 |

Impedancja przejścia Z_f (opcja `fault_impedance` biegu) wchodzi w trybach izolowanym,
kompensowanym i rezystorowym jako I_F = |U_f·Y/(1 + Z_f·Y)|, Y = (I_N + jI_C)/U_f. Wynik nie
deklaruje zgodności: niesie tryb, charakter prądu, wzór, podstawę, zastrzeżenia (straty
dławika poza modelem, impedancje podłużne pominięte, droga YNyn, zerowa pojemność modelu),
dane przyjęte i kompletność dowodu. Konfigurator stacji pokazuje doziemienie stanu normalnego
modelu (oba stany AWSC); bez punktu zwarcia napięcia trybu rezystorowego pochodzą z admitancji
sieci (U0 = U_f, zastrzeżenie jawne), wiersz zwarcia — z impedancji składowych punktu.

Koordynacja izolacji V12.6 (`v126_academic.py::_wiersz_izolacji`, wersja solvera
`v126-academic-whitebox-1.3`) dostała tryb zamiast kategorii „isolated/earthed” (sieć
z rezystorem była utożsamiana z siecią uziemioną bezpośrednio): U_TOV = k·U_m/√3 z k solvera
doziemienia (albo wartości roboczej trybu: √3 dla trzech trybów nieskutecznie uziemionych, 1,4
dla bezpośredniego); doziemienie długotrwałe (izolowany, kompensowany): U_c ≥ U_TOV;
wyłączane (rezystor, bezpośredni): U_c ≥ U_m/√3 i TOV(10 s) ≥ U_TOV (czas ≤ 10 s — założenie
jawne; dobór wstępny bez karty przy doziemieniu wyłączanym: U_c = max(U_m/√3, U_TOV/1,4), żeby
wytrzymałość TOV doboru wstępnego nie przeczyła kryterium). BIL z jednej tabeli IEC 60071-1 tab. 2 (do 123 kV; powyżej — brak podstawy nazwany),
dobór wstępny bez karty ze skrajnych stosunków katalogu ograniczników (U_res/U_c = 4,0
największy, TOV/U_c = 1,4 najmniejszy, U_r/U_c = 1,2 największy — test przypina je do katalogu),
uzasadnienie każdego kryterium w wierszu (`uzasadnienie_pl`). Sonda (U_m = 17,5 kV):

| Tryb / ogranicznik | U_TOV przed → po [kV] | U_c wymagane [kV] | Margines BIL przed → po [%] | Status przed → po |
|---|---|---|---|---|
| izolowany, karta POLIM-D 17,5 | 24,500 (1,4·U_m) → 17,500 | 17,500 | 69,64 → 69,64 | niespełniony → niespełniony (U_c 15,3 < 17,5) |
| kompensowany, karta | 24,500 → 17,500 | 17,500 | 69,64 → 69,64 | niespełniony → niespełniony |
| rezystor, karta | 20,125 (1,15·U_m) → 17,500 | 10,104 | 69,64 → 69,64 | niespełniony → spełniony (TOV 21,6 ≥ 17,5) |
| bezpośredni, karta | 20,125 → 14,145 | 10,104 | 69,64 → 69,64 | niespełniony → spełniony |
| izolowany / kompensowany, bez karty | 24,500 → 17,500 | 17,500 | 84,65 → 35,71 (U_res 51,45 → 70,0) | niespełniony → spełniony |
| rezystor, bez karty | 20,125 → 17,500 | 10,104 (dobór wstępny U_c = U_TOV/1,4 = 12,5) | 219,82 → 90,00 (U_res 29,70 → 50,0) | niespełniony → spełniony |
| bezpośredni, bez karty | 20,125 → 14,145 | 10,104 | 219,82 → 135,06 (U_res 29,70 → 40,41) | niespełniony → spełniony |

Dawne „przed” liczyło TOV jako wielokrotność napięcia MIĘDZYFAZOWEGO U_m (1,4·U_m), a
wytrzymałość TOV ogranicznika z karty brało jako 1,25·U_c niezależnie od karty; „po” liczy
U_TOV fazowo i porównuje z wytrzymałością TOV 10 s z karty katalogowej. Detekcja doziemień
V12.6: wyposażenie przekaźnika bez danych — komplet metod jako dana przyjęta ESTIMATED,
nastawy startowe z podstawą (praktyka, bez wartości normowej). Odcinek 3 zastąpił to (§3.18):
komplet metod jako wartość robocza rozstrzygał kryterium samym założeniem, więc bez
wyposażenia kryterium jest nieocenione, a statusy „spełniony/niespełniony” tabeli wyżej są
rekordami werdyktu wyjaśnialnego.

### 3.18 Odcinek 3: werdykty V12.6 jako rekordy wyjaśnialne, założenia jawne, kasacja mostu doziemienia (B-01)

Rdzeń V12.6 (`v126_academic.py`, wersja `v126-academic-whitebox-1.4`) wystawiał werdykty
słowem statusu bez wyjaśnienia: `verification_status` izolacji i rozruchu, `safety_status`
uziomu, `tuning_status` dławika, `relay_support_status` detekcji, `trv_status`, status
cieplny NER i „PASS/FAIL” walidacji, z progami zaszytymi w kodzie (10 %, 20 %, 15 %, 1,25·U_dop
dla „wymaga ochrony”). Solver liczy odtąd wyłącznie wielkości; rekordy `OcenaKryterium` /
`WynikWymagania` buduje `application/analyses/v126_oceny.py` na jedynej granicy wyniku
(`application/v126_artifacts.py::wynik_v126_dla_powierzchni`, wołanej w
`enm/canonical_analysis.py::_execute_v126` i w generatorze fixtury). Żadne kryterium V12.6 nie
ma w programie normy z wydaniem i jednostką redakcyjną, więc progi i reguły są założeniami
inżynierskimi programu z rejestru §7 (Z-1…Z-12, podstawa `ZALOZENIE_PROJEKTOWE` o stanie
`WSKAZANE`); każde kryterium stosowalne stoi na danej przyjętej `ESTIMATED` swojego założenia,
więc kompletność dowodu jest `NIEPELNY` (zasada nr 4, kontrakt werdyktu §3). Zdolności
`v126.*` mają poziom dowodu w `solver_input/provenance.py` (model niezwalidowany; detekcja —
deklaracja konfiguracji). Front pokazuje rekordy wyłącznie przez `KartaWerdyktu`
(`ui2/wyniki/wzorzec`): `PREZENTACJA[...].werdykt = {rodzaj: 'rekordy', sciezka: 'oceny'}`,
mapy statusu (`ZGODNY`, `SPELNIONY`, `SPELNIONY_IZOLACJI`, `MAPA_DOBORU_UZIEMIENIA`,
`OCENA_NIEWYKONANA_STATUS`) i werdykt zbiorczy skasowane, 13 wpisów MIGRACJA strażnika werdyktu
wyjaśnialnego zdjętych (zapadka w dół 252 → 239 wpisów, MIGRACJA 203 → 190).

| Rodzaj | Kryteria (rekord) | Status w fixturze odpowiedzi | Co zmieniono w liczbach |
|---|---|---|---|
| koordynacja izolacji | napięcie pracy (Z-1), przepięcie dorywcze (Z-2, `NIE_DOTYCZY` przy doziemieniu długotrwałym), margines BIL (Z-3) | W `BRAK_DOWODU` (Z-1 SPEŁNIA, Z-3 35,71 % ≥ 20 %) | flagi `*_ok`, `verification_status`, `uzasadnienie_pl` zdjęte z wiersza |
| bezpieczeństwo uziomu | napięcie dotykowe (Z-4), krokowe (Z-5) | W `NIE_SPELNIA` (dotykowe) | uziom bez danych → brak nazwany zamiast uziomu domyślnego ρ = 100 Ω·m, 60 × 40 m, 10 kA; pola liczone wymagane |
| projekt uziemienia punktu neutralnego | prąd resztkowy (Z-6), energia rezystora (Z-7) | Z-6 `NIE_SPELNIA` (19,87 % > 10 %) | `residual_share_percent` addytywnie; tożsamość sieci także przy jednej sieci |
| detekcja doziemień | funkcje przekaźnika (Z-8) | `NIE_OCENIONO` (wyposażenie nie wskazane) | metoda złożona 51N+67N / 51N/50N wymaga każdej funkcji (dawniej „+” albo „/” zaliczało przekaźnik bez 67N); „komplet metod” jako wartość robocza skasowany — rozstrzygał kryterium samym założeniem; brak wyposażenia nie blokuje gotowości (zasada nr 4) |
| napięcie powrotne | obwiednia (IEC 62271-100, stan `NIEUSTALONE`) | `BRAK_PODSTAWY` | obwiednia modelowa (narost do 2·U_r w 88 µs) bez podstawy skasowana; wielkością główną jest szczyt u_TRV = 38,019 kV fixtury; brak tablic u_c, t_3 nazwany |
| rozruch silników | zapad (Z-9), czas (Z-10), moment (Z-11) | W `BRAK_DOWODU` (zapad 13,946 % ≤ 15 %) | I_n = P_n/(√3·U_n·cos φ_n·η_n) z wartościami roboczymi rejestru maszyn (0,85; 0,95) zamiast 0,9; t_r/t_utyku zamiast k_LR²·t_r/t_utyku (prąd zablokowanego wirnika liczony dwa razy: dawny wskaźnik 14,4 dla silnika z zapasem 0,4); Z_th z macierzy impedancyjnej z Z_Q modelu (bez 0,1 + j0,4 Ω i bez „pierwszej gałęzi zasilającej”); źródło za transformatorem albo brak źródła → brak nazwany (stan odcinka 3; w commicie 5 Z_th z mostu modelu — kanoniczny budowniczy sieci zwarciowej z przekładnią i K_T, szyna za transformatorem dostaje liczbę, fixtura: zapad 13,946 → 21,671 %, §3.21) |
| walidacja benchmarkowa | zgodność z wartością odniesienia (Z-12) | `NIE_OCENIONO` (deklaracja) | bieg porównuje dwie liczby podane w danych — rekord nie wystawia werdyktu; dowodem zgodności solvera z pandapower jest odchyłka mierzona w `test_ieee_benchmark_wiring.py` |

Pozostałe pozycje odcinka:

- Zdolność przyłączeniowa: ziarno Monte Carlo jest odciskiem projekcji pól, które analiza
  czyta (`POLA_HOSTINGU_SZYNY/GALEZI/TRANSFORMATORA`), a obliczenie biegnie na TEJ projekcji
  (`_projekcja_hostingu` — predykaty parami: pole spoza listy nie wchodzi ani do ziarna, ani
  do obliczenia; wynik nie może zależeć od danych spoza odcisku). Impedancja zastępcza węzła
  z tej samej funkcji co rozruch (od commitu 5 — z mostu modelu, §3.21). Fixtura: szyna stacji 7,0 → 7,4 MW, granica krytyczna
  U_max → I_gałęzi — dwie przyczyny razem: Z_th z macierzy (Z_Q obu szyn i kabel) zamiast
  podziału mocy zwarciowej jednej szyny oraz nowe ziarno. Test
  `tests/test_v126_hosting_rng_izolacja.py`: pole nieczytane × {ziarno, wynik} bez zmian,
  pole czytane zmienia ziarno, obliczenie na projekcji = obliczenie na pełnym wejściu.
- Niezawodność: wartości robocze λ i czasu odnowy w jednym rejestrze
  `network_model/catalog/wartosci_robocze.py::PROPOZYCJE_NIEZAWODNOSCI` (linia napowietrzna
  0,08/(km·rok), 3,5 h; kabel 0,015/(km·rok), 12 h; aparat 0,015/rok, 4 h — założenie
  inżynierskie bez wartości normowej; IEEE Std 1366 definiuje wyłącznie wskaźniki). Czytają
  go most ENM (`_NiezawodnoscGalezi` — ta sama klasa podstawia wartość i zbiera daną
  przyjętą), katalog API `reliability-defaults` (dawna trzecia kopia z wierszem transformatora
  0,008/rok, 48 h, którego most nie czytał — fantom skasowany) i dane przyjęte wyniku. Projektant
  zastępuje każdą wartość parametrem `reliability_data` w formularzu analizy (lista „Dane
  niezawodności elementów”, wybór elementu z modelu). Element bez danej nie wnosi zera — jest
  nazwany (`elementy_bez_danych_niezawodnosci`). MAIFI = 0,12·SAIFI jako dana przyjęta.
  Fixtura: SAIFI 0,015 → 0,06/rok, SAIDI 10,8 → 43,2 min/rok — generator fixtury dawał
  kablowi 4 km domyślne 0,015/rok kontraktu (λ na element, nie na km); teraz wartość robocza
  mostu 0,015/(km·rok)·4 km, jak w ścieżce API.
- Kryterium dostrojenia ±10 % (Z-6) i wartości niezawodności są jawnymi założeniami z rejestru
  §7 i danymi przyjętymi `ESTIMATED` w każdym rekordzie i wyniku.
- Most doziemienia `application/analyses/earthing/ground_fault_bridge.py` SKASOWANY razem
  z testem mostu, polami `BayEarthFaultPath.earth_electrode_resistance_ohm` /
  `earth_return_split_factor` (backend i `types/enm.ts`) i kodem gotowości
  `earthing.electrode_data_missing` (nigdy nie emitowany; nawigacja naprawy wskazywała
  nieistniejącą zakładkę). Dowody (rejestr konfliktów V12K-183): 0 konsumentów produkcyjnych;
  duplikat fizyki analizy `earthing_safety` (I_G = S_f·I_f, GPR = I_G·R_g); „napięcie
  dotykowe” mostu było napięciem uziomu U_E = I_u·R_u (58 501 V), a I″k1 nie jest prądem
  doziemnym sieci izolowanej ani kompensowanej. Pakiet dowodowy `EARTHING_GROUND_FAULT_SN`
  z równaniami `EQ_EARTH_001..003` — skasowany w commicie 5 decyzją architekta (§ commit 5:
  0 producentów, dubel dowodu bezpieczeństwa uziomu V12.6). Rejestr gotowości 183 → 182
  kodów, słownik `READINESS_FIXACTIONS_CANONICAL_PL.md` i fixtura frontu zregenerowane
  generatorami.
- Napięcie powrotne zostaje nazwaną luką: rekord `BRAK_PODSTAWY` z brakiem „tabele parametrów
  obwiedni u_c, t_3 IEC 62271-100 — do wprowadzenia z podstawą (wydanie, tablica)”.
- Formularz analizy: lista funkcji detekcji = słownik solvera `METODY_DETEKCJI_KOMPLET`
  (dodane 51N, 67N, 50N — bez nich metoda złożona nie mogła być spełniona; parytet
  `test_v126_rodzaje_parytet.py::test_funkcje_detekcji_formularza_sa_slownikiem_solvera`);
  pola cos φ_n i η_n silnika; listy formularza niezależne (`listy` zamiast jednej `lista`).
  Karta katalogu: `relay_methods` przestał być „wymagany” — parametr wymagany karty musi być
  warunkiem blokującym gotowości (`test_fixtury_harnessu.py::
  test_parametr_wymagany_karty_jest_warunkiem_blokujacym_gotowosci`).
- Bramka odcinka (strażniki przed commitem): ranking zdarzeń niezawodności nie zastępuje
  ciężkości nieobecnej liczbą (`severity or 0.0` w kluczu sortowania — zdarzenia z ciężkością
  malejąco, za nimi zdarzenia bez ciężkości; `solver_input_substitute_guard`, test
  `test_ranking_zdarzen_bez_ciezkosci_za_zdarzeniami_z_ciezkoscia`); przedmiot rekordu uziomu
  nazwany nazwą z modelu albo jawnym „spoza modelu”, nigdy identyfikatorem stacji
  (`nazwa_bez_identyfikatora_guard`); oznaczenie silnika `motors[].ref` jest oznaczeniem
  projektanta (wpis listy dozwolonej strażnika z tą samą podstawą co gotowość V12.6), więc
  fixtura odpowiedzi niesie oznaczenie inżynierskie „M1”, nie identyfikator maszynowy;
  klucz wewnętrzny wielkości głównej napięcia powrotnego `u_TRV_max` (dawny `u_TRV,max`
  liczony przez `ui_math_guard` jako matematyka ASCII; widoczny zapis idzie przez
  `symbol_latex`), wyjątek strażnika przesunięty na bieżącą linię klucza `Re Z_conv,min`.
- Bramka odcinka (vitest ekranu analiz i strażniki z CI, 2026-10-30): tekst dla projektanta
  nie niesie identyfikatorów elementów także w powodach danych przyjętych — dana przyjęta
  podziału mocy zwarciowej (`v126_academic._dana_przyjeta_podzialu_zrodla`; skasowana w commicie 5
  razem z podziałem mocy zwarciowej — §3.21) nazywa szyny
  nazwą z modelu (dawniej `gpz/8600…/section/001/bus_sn` na ekranie rozruchu), a wartość
  robocza niezawodności (`_NiezawodnoscGalezi.galaz(ref, nazwa, …)`) — gałęzie nazwą
  z `enm.nazwy_elementow`; odmowa parametru `reliability_data` jest `OdmowaNazwana`
  (kod `v126.dane_niezawodnosci_niepoprawne`, zdanie z nazwą elementu, identyfikator i pole
  w `dane`; `odmowa_bez_identyfikatora_guard`). Przepustowość przyłączeniowa, której
  impedancja zastępcza stoi na podziale roboczym mocy zwarciowej, niesie tę samą daną
  przyjętą w wyniku (`dane_przyjete`, dawniej gubiona — zasada nr 4); nazwy z pełnego
  wejścia, bo projekcja czytanych pól ich nie niesie (nazwa nie porusza ziarna Monte Carlo).
  Liczby danych przyjętych na ekranach analiz i panelu uziemienia stacji w zapisie polskim
  (`wielkoscPl`, jak karta werdyktu; dawniej surowy zapis JS „17.5 kV”, „0.000088 S/km”).
  Strażnik prezentacji sprawdza także podpowiedzi (`title`) regułą surowej referencji.
  Niezmiennik „założenie z progiem” ma jedno źródło (`ZalozenieKryterium.granica`, asercja
  błędu programu; katalog czyta próg z niego) — `polykanie_wyjatkow_guard` bez nowych
  `raise ValueError`. Zostaje świadomie: komunikat „Szyna silnika {ref} nie należy do
  modelu” — szyny spoza modelu nie ma czym nazwać poza oznaczeniem podanym w danych
  silnika (formularz wybiera szynę z listy modelu, więc ścieżka dotyczy wyłącznie wejścia
  API spoza formularza).
- E2E po bramce odcinka (`wyniki-jezyk-inzyniera.spec.ts`, prawdziwy backend, 2026-10-30):
  opis odnośnika śladu kryterium wklejał liczby surowo — „wynik None %, limit 15.0 % (Z-9)”
  przy rozruchu bez impedancji zasilania szyny i „szczyt napięcia powrotnego: None kV”.
  Liczby śladu idą przez `werdykt.format_wielkosc` (`v126_oceny._wielkosc_sladu`), brak
  wyniku nazywa „nie wyznaczono”. Test klasy `test_teksty_rekordow_bez_surowego_zapisu_pythona`
  — iloczyn rodzaj × {z obiektami, bez obiektów, obiekty bez wyniku liczbowego} × każdy tekst
  rekordu i składowych (`*_pl`, braki, zastrzeżenia): bez literałów `None/True/False/nan/inf`,
  opis śladu bez kropki dziesiętnej. Znalezisko przy przeglądzie wzorca w innych ekranach:
  fikstura okna „Kontyngencje N-1”, deklarowana jako przepisana z odpowiedzi backendu,
  niosła teksty sprzed polskiego zapisu liczb („Obciazenie 134.74 % przekracza limit
  100.0 %.”, „Brak pradu galezi w wynikach PF.”, skrócone źródła progów) — przepisana ze
  zrzutu buildera i przypięta testem backendu
  `test_fikstura_ekranu_niesie_teksty_aktualnej_odpowiedzi_backendu` (każdy tekst kryteriów,
  zdanie i ślad WHITE BOX przekroczenia, powód pominięcia i wykluczenia — znak w znak).
- Fixtura odpowiedzi V12.6 (`generuj_odpowiedzi_v126.py`) ćwiczy dane, które czyta solver:
  uziom z pełnymi danymi projektanta (dawniej puste `earthing` liczone domyślnymi), silnik
  w polu `motors` (dawny `parameters["motors"]` był martwy — tabela rozruchu była pusta),
  niezawodność kabla z mostu.

Sonda B-01 (fixtura odpowiedzi 14 rodzajów, `HEAD` ↔ po odcinku, różnica pól liściowych poza
`oceny`): zmienione wyłącznie rodzaje z tabeli wyżej oraz zdolność przyłączeniowa
i niezawodność; `opf_loss_lcc`, `ssci_impedance`, `uncertainty_sensitivity`,
`voltage_stability` — 0 zmian; jakość energii — zdjęte `compatibility_status` węzłów (już
`NIE_OCENIONO`). Odcisk rdzenia odświeżony (`solver_diff_guard --init`), sankcja w
`solver_boundary_guard`.

### 3.19 Pojemności linii w składowej zerowej: warunek k > 1,4 (IEC 60909-0 pkt 5.2 f), B-01)

Do odcinka 3 bocznik pojemności doziemnej wchodził do macierzy Y0 zwarć bezwarunkowo z B′0
modelu, a B′0 roboczy nie wchodził nigdy — dwa predykaty dla jednej fizyki. Teraz jeden warunek
dla obu źródeł danej (`enm/mapping.py::_warunek_pojemnosci_zerowej`, podstawa i próg w
`network_model/solvers/doziemienie_sn.py`: `PROG_WSPOLCZYNNIKA_ZWARCIA_DOZIEMNEGO = 1,4`,
`wspolczynnik_zwarcia_doziemnego`, `pojemnosci_w_skladowej_zerowej`):

1. każda gałąź z B′0 > 0 (model albo wartość robocza `skladowa_zerowa_galezi`) jest kandydatem;
   B′0 < 0 — odmowa nazwana; B′0 = 0 albo nieznane bez podstawy wartości roboczej — kandydata
   nie ma;
2. dla każdej sieci zerowej (składowej spójnej Y0) z kandydatami k liczony jest w węzłach
   liczonych zwarciem IEC 60909 (bez przyczyny braku wyniku zerowego, czyli w sieci uziemionej
   przez małą impedancję) z Z1 sieci zwarciowej i Z0 złożonego BEZ pojemności:
   k = max(|a² − (Z0 − Z1)/(2Z1 + Z0)|, |a − (Z0 − Z1)/(2Z1 + Z0)|), Z2 = Z1 (IEC 60071-1),
   zaokrąglony do 6 miejsc;
3. max k > 1,4 ⇒ bocznik jB0·ℓ (π, po połowie na końce) wchodzi dla WSZYSTKICH kandydatów
   tej sieci; inaczej — dla żadnego. Sieć izolowana i skompensowana nie ma węzła liczonego
   (poza zakresem normy, rozdz. 1), więc pojemności do Y0 zwarć nie wchodzą.

Ślad WHITE BOX sieci zerowej: krok `z0_warunek_pojemnosci[n]` (gałęzie z B0·ℓ i źródłem danej
`model`/`wartosc_robocza`, węzły z Z1, Z0 i k, próg, wynik `{k_max, pojemnosci_w_y0}`,
podstawa normowa w notach) i — gdy pojemności weszły — `z0_line_shunt[ref]` z notą wartości
roboczej. B′0 roboczy, który wszedł do Y0, jest daną przyjętą `ESTIMATED` wiersza 1F/2FG
(`SiecZerowa.b0_robocze` → `WynikSieciZerowej.b0_robocze` → `zalozenia_z0_galezi(...,
b0_galezi=...)` w `enm/assembler.py` i w danych przyjętych węzła
`enm/dane_przyjete_galezi.py::dane_przyjete_wezla`; jeden rekord gałęzi niesie R′0/X′0 i B′0).
Pojemność zostaje rodzajem bocznika klasyfikacji drogi zerowej (sieć z samą pojemnością —
`poza_zakresem_iec60909`, bez niej — `brak_drogi`), ale nie domyka macierzy: kotwica numeryczna
obejmuje składowe bez bocznika innego niż pojemność (`_przyczyny_braku_zerowej`).

Sonda B-01 (parytet assemblera, 366 wpisów rejestru, stan `HEAD` ↔ po odcinku, klucz po
kluczu): 0 zmian liczb, 0 zmian „liczba → brak liczby”; G16 i G17 (sieci uziemione
bezpośrednio, k 0,96–1,23) bez zmian — pojemności ich linii jak dotąd nie wchodzą. Zmieniają
się wyłącznie sieci uziemione przez rezystor z k > 1,4, których rejestr nie zawiera; w
testach: magistrala SN z B′0 roboczym (kabel B′0 = B′1, linia 0,4·B′1, 1,5 + 3,5 km) —
k_max: punkt neutralny bezpośrednio 1,452, rezystor 1,742, uzwojenie TR z rezystorem 1,743
(B′0 wchodzi), uzwojenie TR uziemione bezpośrednio 1,262 (nie wchodzi; 1,426 przy 1,5 + 3,5 km,
stąd długości 0,5 + 0,5 km w wariancie k ≤ 1,4), dławik i izolowany — brak węzła liczonego;
kabel 10 km z B0 = 3·10⁻⁶ S/km za TR Dyn11: punkt neutralny bezpośrednio k = 1,257 (nie
wchodzi), rezystor 40 Ω k = 1,744 (wchodzi, Z0 węzła z wyrocznią ręczną π). Rdzeń IEC 60909
(`short_circuit_iec60909.py`, `short_circuit_core.py`) bez zmian — zmienia się wyłącznie jego
wejście Z0-bus. Fikstury harnessu (`skladowe_scena_wynik`, `skladowe_scena_slad`)
przeliczone generatorem: zmiana noty `ybus.PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH`,
a w śladzie sieci zerowej sceny krok `z0_line_shunt[cab_main_b]` zastąpiony krokiem
`z0_warunek_pojemnosci[1]` (kabel B0 modelu i linia B0 roboczy, brak węzła liczonego — sieć
złota SN izolowana, pojemności poza Y0) oraz krokiem `z0_numerical_reference` (trzy węzły SN
domknięte kotwicą zamiast dawnego bocznika pojemności). Wiersze wyniku (`rows`) identyczne
z poprzednią fiksturą (porównanie JSON), zmienia się wyłącznie `result_hash`, bo obejmuje ślad.

### 3.20 Odcinek 4: sposób pracy punktu neutralnego w śladzie, ekranie i raporcie; próg założenia z jednego źródła

Warunek odbioru właściciela (2026-10-29) — cztery sposoby pracy punktu neutralnego, każdy swoim
modelem, nazwanym w wyniku, w śladzie WHITE BOX, na ekranie i w raporcie:

- Ślad solvera doziemienia (`network_model/solvers/doziemienie_sn.py`, warstwa solverów poza
  listą FROZEN) niesie przy każdym kroku podstawienie dwa razy: prozę `substitution` (raport,
  przecinek dziesiętny — dawniej „0.000245 S”, „|0.5516 + j-91.3732| A”) i `substitution_latex`
  (ekran, KaTeX, przecinek `{,}`; `null`, gdy wielkość nieoznaczalna — brak B_0). Liczba
  zespolona ze znakiem przy `j` (`a − jb`, dawniej `+ j-b`). Tryb bezpośredni dostał krok
  `doziemienie_prad_bezposrednie` (prąd I″k1 rdzenia IEC 60909 z impedancją pętli
  |Z_1 + Z_2 + Z_0 + 3Z_f| punktu) — dawniej jego ślad miał tylko krok napięć, więc model
  trybu nie był nazwany w śladzie.
- Ekran składowych (`ui2/wyniki/skladowe/EkranSkladowych.tsx`, sekcja doziemienia) pokazuje
  „Ślad obliczenia” — tytuł kroku, wzór i podstawienie przez `MathBlock` wyłącznie z pól
  `*_latex` backendu (`model.ts::doziemienieWiersza` → `kroki`); proza podstawienia nie idzie
  do KaTeX-a. Dawniej `doziemienie_sieci.slad` nie miał żadnego czytelnika.
- Raport (`api/analysis_run_exports.py::_linie_doziemienia`) dopisuje linię „Ślad doziemienia —
  {tytuł}: {podstawienie}” dla każdego kroku.

Wartości tej samej sieci (GPZ 110/15 kV 25 MVA, S″kQ = 3000 MVA, R/X = 0,1, kabel 2 km,
B′0 = 2π·50·390 nF/km, zespół ZNyn11 z dławikiem 100 A albo rezystorem 200 A; szyna SN stacji),
każda z wyrocznią ręczną z danych wejściowych (test
`test_ta_sama_siec_cztery_sposoby_z_wyroczni_recznej`; Z_1 = Z_Q + K_T·Z_T = 0,05056 + j1,05172 Ω
wg IEC 60909-0:2016 §6.2/§6.3.3, Z_0 z pojemnościami wg warunku k > 1,4):

| Sposób | Model | Prąd w miejscu doziemienia | U0 [V] | U_b / U_c [V] | k |
|---|---|---|---|---|---|
| izolowany | I_C = √3·U_n·B_0 | 6,3664 A (pojemnościowy) | 8 660,25 | 15 000,00 / 15 000,00 | 1,7321 |
| kompensowany | I_res = √(I_w² + (I_C − I_L)²) | 91,3748 A (I_L = 97,7396 A, I_w = 0,5516 A, v = −14,3523) | 8 660,25 | 15 000,00 / 15 000,00 | 1,7321 |
| rezystor | I_F = \|I_N + jI_C\| | 197,3290 A (I_w = 197,3113 A, I_L = 9,0096 A) | 8 650,66 | 14 883,63 / 15 090,73 | 1,7425 |
| bezpośredni | I″k1 = √3·c·U_n/\|2Z_1 + Z_0\| | 3 456,1058 A (zwarciowy IEC 60909) | 6 486,76 | 11 984,96 / 12 578,23 | 1,4524 |

Rozróżnialność (`test_cztery_sposoby_rozroznialne_liczbami_i_nazwa_modelu`): prądy parami różne
o więcej niż 1 %; tryb, charakter, wzór i podstawa parami różne; każdy sposób ma w śladzie
dokładnie jeden krok prądu swojego modelu; sieć izolowana i skompensowana mają to samo
przesunięcie punktu neutralnego (U0 = U_f — fizyka, rozróżnia je prąd) i wiersz IEC bez
liczby z przyczyną „poza zakresem IEC 60909”; rezystor daje k ponad √3, uziemienie
bezpośrednie — poniżej.

Kryterium prądu resztkowego ±10 % (Z-6): rejestr źródeł nie ma podstawy normowej tej liczby
(ENEA Zeszyt 1 §16 wymaga doboru uziemienia w analizie projektu i zakazuje pracy w rezonansie
I_L = I_C, s. 30, wartości nie podaje) — praktyka Z-6 mówi to wprost, próg jest założeniem
projektowym `ESTIMATED`, a ocena na nim ma kompletność `NIEPELNY` (zasada nr 4). Próg każdego
założenia ma jedno źródło: `ZalozenieKryterium.granica()` daje limit rekordu, treść założenia,
`powod_pl` danej przyjętej i nowe `prog_latex` (koniec `warunek_latex` w `v126_oceny.py`
i `v126_katalog.py`; dawniej literał `10\%`, `20\%`, `15\%` obok stałej) — test
`test_prog_zalozenia_z_jednego_zrodla_w_rekordzie`.

Ziarno Monte Carlo hosting capacity — zawężone do projekcji pól czytanych w odcinku 3
(`6bfd4bcab`, `v126_academic.py:644` `POLA_HOSTINGU_*`, `:3216` `_ziarno_hostingu`). Sonda
(8 wejść: fikstura V12.6, `golden_enm_cgmes`, gn01–gn06; każde wejście 3 razy — ten sam hash
przed i po): zmiana liczb wyłącznie przez nowe ziarno (np. fikstura 7,6 → 7,4 MW, gn01 6,0 →
5,8 MW), szyny z wynikiem 10,0 MW bez zmian. Sonda ujawniła skutek kasacji zapasu impedancji
w odcinku 3 (`_impedancja_zastepcza_szyny`, `v126_academic.py:3117`): szyna zasilana przez
transformator ze źródła sieciowego innego poziomu napięcia nie dostaje Z_th (macierz omowa
V12.6 bez przekładni, ograniczenie O-21), więc hosting i rozruch silnika takiej szyny są
brakiem nazwanym zamiast dawnej liczby z sumy omów dwóch poziomów napięć. Zamknięcie wymaga
macierzy z przekładnią z jednego modułu stemplowania (decyzja O-26) — zgłoszone architektowi.
Zamknięte w commicie 5 (§3.21): Z_th z kanonicznego budowniczego sieci zwarciowej.

### 3.21 Commit 5: impedancja zastępcza z mostu modelu, prąd uziomowy stacji z modelu, wzory w prozie (B-01)

Zgoda B-01 architekta na zmianę rdzenia `v126_academic.py` (wersja
`v126-academic-whitebox-1.5`) pod warunkiem sondy liczb, determinizmu 3× i wyroczni ręcznej;
sankcja w `solver_boundary_guard.SANCTIONED_CHANGES`, odcisk SHA-256 odświeżony wyłącznie dla
tego pliku (`guard_references/solver_hashes.json`, 1 wiersz). `short_circuit_core.py` bez
zmian — most woła istniejące `build_zbus`.

**Impedancja zastępcza szyny (Z_th).** Dawniej solver składał Z_th sam: z mocy zwarciowej
szyny („podział mocy zwarciowej” z daną przyjętą), z Z_Q szyny albo z omowej macierzy V12.6
bez przekładni (szyna za transformatorem dostawała brak, ograniczenie O-21). Teraz
Z_th = Z_bus[k,k]·Z_b,k liczy most modelu (`solver_input/v126_contracts.py::
impedancje_zastepcze_szyn`) kanonicznym budowniczym sieci zwarciowej
(`short_circuit_core.build_zbus`: przekładnia, K_T wg IEC 60909-0:2016 §6.3.3 eq. 12a, Z_Q wg
§6.2.1 eq. 6), wyłącznie dla analiz, które ją czytają (`ANALIZY_IMPEDANCJI_ZASTEPCZEJ` =
przepustowość i rozruch silnika). Wyspa bez impedancji do odniesienia
(`NetworkGraph.wezly_bez_impedancji_do_odniesienia` — jedna definicja, przeniesiona
z `enm/canonical_analysis.py`) nie dostaje Z_th, a solver nazywa brak. Solver czyta Z_th
wyłącznie z pól szyny `thevenin_r_ohm`/`thevenin_x_ohm`; podział mocy zwarciowej i jego dana
przyjęta skasowane (jedna prawda: most modelu).

Wyrocznia ręczna (`tests/solver_input/test_impedancja_zastepcza_mostu_v126.py`, 44 testy):
zasilanie 110 kV (S″kQ = 3000 MVA, R/X = 0,1, c_max = 1,1) — T1 110/15 kV 25 MVA
(u_k = 11 %, P_k = 120 kW) — szyna SN — kabel 3 km — szyna SN2 — T2 15/0,4 kV 0,63 MVA
(u_k = 6 %, c_max = 1,05) — szyna nN. Liczby kontrolne z jawnych wzorów: Z_SN =
0,050561 + j1,051721 Ω, K_T transformatora nN = 0,963336. Iloczyn: szyna {WN, SN, SN2, nN} ×
analiza {przepustowość, rozruch} × wyspa {z, bez}; ślad przepustowości
`impedancje_zastepcze_ohm` równy wyroczni; sieci wzorcowe gn01–gn06 — każda szyna zasilana
ma Z_th, szyna nN mniejszą moc zwarciową niż szyna WN; determinizm wejścia 3×.

Sonda przed/po (przepustowość przyłączeniowa, n = 64 losowania, każde wejście 3 razy — ten sam
hash na HEAD i po zmianie):

| Wejście | Szyna | HEAD [MW] | Po [MW] |
|---|---|---|---|
| fixtura odpowiedzi | stacja | 7,4 | 7,3 |
| gn01 | szyna nN | brak | 1,2 |
| gn02 | szyna nN | brak | 1,1 |
| gn03 | węzeł łącznika 2 | 10,0 | 5,8 |
| gn04 | szyna nN | brak | 2,0 |
| gn05 | szyna nN | brak | 1,9 |
| gn06 | szyna nN | brak | 2,0 |
| `golden_enm_cgmes` | szyna SN główna | brak | 10,0 |
| `golden_enm_cgmes` | szyna SN b | brak | 6,6 |
| `golden_enm_cgmes` | szyna SN c | brak | 6,2 |
| `golden_enm_cgmes` | szyna nN | brak | 1,6 |

Szyny dalej w sieci zmieniają się o około ±0,3 MW także przez nowe ziarno (projekcja pól
czytanych obejmuje teraz pola Z_th). Rozruch silnika w fixturze odpowiedzi: Z_th
0,454761 + j0,971303 → 0,959 + j1,363 Ω (z przekładnią zamiast omowej sumy dwóch poziomów
napięć), zapad 13,9457 → 21,6705 %: kryterium zapadu Z-9 przechodzi z „spełnia”
(13,95 % ≤ 15 %) na „nie spełnia” (21,67 % > 15 %), rekord rozruchu z `BRAK_DOWODU` na
`NIE_SPELNIA` (kompletność `NIEPELNY` — założenie Z-9 i wartości robocze tabliczki). Determinizm 3× solvera dla każdego z 14 rodzajów (fixtura odpowiedzi)
i dla każdego rodzaju sceny akademickiej z gotowością potwierdzoną (wejście i wynik): zgodny.

**Prąd zwarcia doziemnego stacji z modelu (EN 50522:2010 tab. 1).** Dawniej bieg oceny uziomu
brał prąd wyłącznie z parametru projektanta, a bieg sceny meldował „nie wskazano szyny
stacji”, choć szyna była wskazana (druga, ręczna składanka wejścia gubiła prąd z modelu).
Teraz jedna składanka wejścia (`api/v126_academic.py::wejscie_solvera_v126`) dokłada
`prad_uziomowy` z `application/analyses/v126_prad_uziomowy.py::doloz_prad_uziomowy` (ta sama
funkcja co gotowość): przypadki stacji — każda galwanicznie połączona sieć SN stacji wg sposobu
pracy punktu neutralnego oraz strona WN — liczone TĄ SAMĄ drogą co bieg zwarciowy
(`enm/canonical_analysis.py::zwarcia_doziemne_szyn`, punkty zwarcia bez węzłów pomocniczych —
ta sama reguła `ZNACZNIK_SZYNY_POMOCNICZEJ` co assembler). Wielkość miarodajna
(`v126_academic.wielkosc_pradu_uziomowego`): WN oraz SN z rezystorem albo uziemiona
bezpośrednio — I″k1; izolowana — I_C; kompensowana z dławikiem w stacji —
√(I_L² + I_res²), bez dławika w stacji — I_res; rozstrzyga największy przypadek. Wpis
projektanta jest nadpisaniem `ESTIMATED` z prądem modelu w uzasadnieniu; przypadek
nieoznaczalny niesie przyczynę (bez liczby). Scena akademicka: I_F = 13,5609 kA (WN 110 kV,
I″k1), przypadek SN kompensowany 294,09 A. Ekran oceny uziomu pokazuje prąd przed redukcją,
podstawę wyboru i tabelę przypadków (strona, sposób pracy, wielkość jako wzór, prąd, reguła,
przyczyna braku). Pakiet dowodowy `EARTHING_GROUND_FAULT_SN` (P19) skasowany — 0 producentów,
dubel dowodu bezpieczeństwa uziomu V12.6 (`legacy_public_path_guard`, grupa ZU5).

**Wzory w prozie, liczby po polsku.** Symbole w tekstach katalogu kart, gotowości (warunki,
dane z modelu, propozycje) i wyniku solvera jako wzory inline `$…$` renderowane przez
`TekstZWzorami`; `opis_pl` warunku gotowości (renderowany wprost i w komunikacie 422) bez `$`
i bez zapisu ASCII symboli; liczby przez `werdykt.format_liczba` (warstwa aplikacji)
i `_lp_tekst` (solver) — przecinek dziesiętny. `ui_math_guard` PIN 9 → 0. Klasa KaTeX
w trybie ścisłym: polskie litery w `\mathrm{}` (`F_{\mathrm{przekaźnika}}`,
`\Delta U_{\%,\mathrm{ciąg}}`, „zespołu”) dają ostrzeżenie `unicodeTextInMathMode` i czcionkę
zastępczą — zamienione na `\text{}` u źródła (katalog i oceny V12.6, ocena doboru magistrali,
rejestr wzorów); pomiar przed naprawą: 1022 wzory we wszystkich fixturach harnessu,
8 naruszeń. Rejestr wzorów kroków (`v126_wzory.py`) ma wpis dla każdego klucza kroku
w źródle solvera (test kompletności z regexu źródła; pin wpisów 15 → 16).

**Ekran składowych — ślad doziemienia w czterech sposobach (zrzuty dla B-02).** Scena
harnessu `wyniki-skladowe-doziemienie` (parametr `sposob`) karmi produkcyjny ekran E-29
odpowiedziami REALNEGO biegu 1F (`doziemienie_sposoby_scena.json`, generator
`eksport_fixtur_harnessu.py::doziemienie_sposoby_scena`) na sieci wyroczni §3.20; spec
`e2e/doziemienie-slad-zrzuty-screenshot.spec.ts` (4 sposoby × 2 motywy) sprawdza prąd, każdy
krok śladu złożony przez KaTeX, krok prądu własnego modelu obecny i cudzych nieobecny,
i zapisuje PNG do `docs/uiux/zrzuty/ux04-doziemienie/`. Werdykt wizualny należy do
właściciela. Przy okazji: scena E-29 wkładała do magazynu modelu kopertę odpowiedzi
`/snapshot` zamiast modelu (most nazw nie widział szyn) — naprawione.

**Ślad prądu uziomowego — proza kroku bez LaTeX-u.** `guardy_z_ci` na drzewie commitu wykrył
w polu `substitution` kroku `en50522_prad_uziomowy` wzór `$I''_{k1}$` (kontrakt kroku śladu:
LaTeX wyłącznie w polach `*_latex`, `slad_proza_bez_latex_guard`, 3 wystąpienia w fixturze
sceny akademickiej). Przyczyna: jedno zdanie `powod` służyło dwóm kontraktom — uzasadnieniu
wyniku (proza ze wzorami dla `TekstZWzorami`) i podstawieniu kroku (proza bez LaTeX-u). Teraz
oba zdania powstają z tych samych wartości (nazwa przypadku, prąd, liczba przypadków), a
podstawienie nie niesie wzoru symbolu (symbol ma kolumna `wielkosc_latex` przypadku w danych
kroku). Test iloczynu `test_prad_stacji_z_modelu_iloczyn_sposob_wn_zrodlo` (4 sposoby × strona
WN × źródło prądu) i test węzła pomocniczego stosują predykat strażnika do całego śladu biegu
API oraz przypinają relację podstawienie ↔ uzasadnienie. Ten sam bieg strażników ujawnił dwa
inne zapisy: `solver_input_substitute_guard` — `z.ikss_a or 0.0` w kluczu wyboru największego
I″k1 (`v126_prad_uziomowy.py`, gałąź po filtrze `is not None`, ale wzorzec podstawienia zera
za brak danej) przepisany na jawną listę par bez podstawienia; `polykanie_wyjatkow_guard` —
pin `raise ValueError` w `application/**` 80 → 79 (pomiar na b1e677ced i na drzewie commitu:
kontrola zamrożonych identyfikatorów równań P19 skasowana z pakietem). Asercja powodu
nadpisania w `test_v126_prad_uziomowy.py` oczekiwała kropki dziesiętnej, choć solver pisze
przecinkiem (`_lp_tekst`) — 8 wariantów nadpisania było czerwonych; asercja przepisana do
zapisu polskiego. Test ekranu `pradUziomowy.test.tsx` dostał jawny budżet czasu 20 s na test
(pomiar: 3,6 s w biegu pojedynczym, 14,8 s / 3 testy w puli 85 plików — przekroczenie
domyślnych 5 s przez obciążenie maszyny, asercje bez zmian).

**Etykiety wielkości sekcji doziemienia (E-29).** Zrzuty sceny czterech sposobów pokazały
etykiety z symbolami ASCII („Napięcie fazowe U_f”, „Prąd pojemnościowy sieci I_C”, „U0”,
„Z_f”, „v = (I_C − I_L)/I_C”) — `ui_math_guard` ich nie widzi (wzorce: `<=`, `sqrt(`, potęga,
` * `, indeks z przecinkiem; goły indeks `X_y` poza wzorcami). Etykiety niosą teraz symbole
jako `$…$`, ekran składa `<dt>` przez `TekstZWzorami`; test „sieć kompensowana” przypina każdą
etykietę (KaTeX obecny, bez surowego `$`; iniekcja zwykłego `{w.etykieta}` — czerwony).
Pomiar klasy poza tą sekcją (2026-10-30, `grep` literałów `'…X_y…'` poza `$…$` w `ui2/**`
bez testów; linie z identyfikatorami `data-`/`mvd-` i importami odfiltrowane): przed naprawą
sekcji 151 linii, po niej 145 linii w 49 plikach, z tego 66 w `strings.ts` (m.in. stan
fazowy: kolumny `U_A`/`I_N`, zwarcia: `Z_f`, `|Z_Q|`, SSCI: `Z_grid`, `Re_min`, koordynacja:
`I_k2min`), oraz proza backendu podstawy doziemienia „k = U_fazy zdrowej/U_f”
(`doziemienie_sn.py:89`, `v126_contracts.py:837`) i etykieta `StationConfigurator.tsx:648`
(warstwa `ui/`). To klasa przekrojowa (wiele ekranów, wzorzec strażnika do rozszerzenia,
podstawa doziemienia wchodzi do szkieletu parytetu assemblera) — zgłoszona architektowi do
orkiestracji z tym pomiarem.

Uwaga warsztatowa: black uruchomiony jednym wywołaniem na plikach `backend/` i `scripts/`
formatuje z szerokością 88 (konfiguracja z katalogu wspólnego) — przeformatowanie 44 plików
cofnięte skryptem porównującym AST; pliki `scripts/` formatowane z `--config
backend/pyproject.toml`.

## 4. Iloczyn testów

wariant {izolowany, dławik, dławik + AWSC spoczynek, dławik + AWSC załączony, rezystor,
dławik ‖ rezystor, uzwojenie TR} × sekcje {1, 2 ze sprzęgłem zamkniętym, 2 z otwartym} ×
ZU {w obu, w jednej, w żadnej} × łącznik ZU {zamknięty, otwarty} × konsument {walidator,
Z0/Ik1, dowód przekładników, ładunek DER, V12.6, BayEarthFaultPath}:

- `tests/enm/test_skladowa_zerowa_zu.py` — sonda, iloczyn sekcji × ZU × łącznika
  (`test_iloczyn_sekcji_zu_i_lacznika_ik1_z_wyroczni`), konsumenci × wariant × układ
  (`test_konsumenci_czytaja_jedna_prawde`), przyczyny i kotwica
  (`test_kotwica_1e6_nie_udaje_uziemienia`), wiersz odpowiedzi i raport
  (`test_wiersz_odpowiedzi_niesie_nazwana_przyczyne`: trzy przyczyny + wiersz liczony),
  determinizm;
- `tests/enm/test_zespol_uziemiajacy_reguly.py` — W-ZU-01..06, E-ZU-01..02, flaga
  `wylaczenie_od_transformatora_sekcji` (deklaracja {brak, fałsz, prawda} × sekcja {1, 2} ×
  układ {2 sekcje / 2 TR, 2 sekcje / 1 TR}) i odmowy;
- `tests/test_v126_uziemienie_z_modelu.py` — V12.6 czyta model, odmowa bez zespołu;
- `tests/api/test_v126_parametry_nie_nadpisuja_uziemienia.py` — parametr nadpisujący
  {`neutral_grounding`, `neutral_earthing_type`, `network_neutral`} × {z zespołem, bez}
  → odmowa nazwana; kategoria izolacji × {rezystor, dławik, brak zespołu}; szyna spoza
  modelu; wiersz łamiący kontrakt;
- `tests/enm/test_store_migracja_uziemienia.py` — uziemienie szyny 110 kV przechodzi na
  źródło, szyny SN nie (utrata nazwana);
- front SLD: `enmToCanonicalGpzAdapter.test.ts` — element zespołu {dławik, rezystor,
  dławik ‖ rezystor, bezpośrednie, bez elementu} × zespół na szynie innej stacji × uzwojenie
  TR × źródło 110 kV uziemione bezpośrednio (brak glifu SN) × pierwszeństwo zespołu przed TR;
  `gpzHvColumn.test.ts` — legenda per rodzaj, w tym Z.14;
- front ekranu składowych: `skladoweModel.test.ts` (element zespołu × 6, punkt 110 kV,
  kolejność listy sieci), `EkranSkladowych.test.tsx` (natywny render opisu zespołu);
- front: `ui2/kreatory/zespol-uziemiajacy/**`, `ui2/kreatory/zrodlo/**` (sekcja ZU w kreatorze
  GPZ, granica 110 kV × typ uziemienia × Z0), `StationEarthingPanel.test.tsx` (stan × błąd ×
  przyczyna × dwie sekcje, natywny klik „dodaj zespół"), e2e `kreator-zrodlo-uziemienie.spec.ts`.
- front SLD ról pól: `enmToCanonicalGpzAdapter.test.ts` (każda rola modelu → rola stosu i predykat pola
  kablowego), `enmToSldAdapter.test.ts` (nośnik roli {`bay_role`, `field_role`} × {ZU, BKR} →
  rola i oznaczenie), `gpz.test.ts` (numeracja liniowe × bateria × zespół, liczniki odrębne);
- `tests/enm/test_z0_wartosc_robocza_odcinka.py` (125 testów) — pasmo × rodzaj odcinka
  {SN: linia, kabel, kabel z żyłą powrotną; nN: linia, kabel, kabel z PE/PEN} × stan danych
  {brak R′0 i X′0, brak R′0, brak X′0, R′1 = 0, X′1 = 0} × konsument {1F, 2F+Z z wyrocznią
  „ten sam prąd co wpisane wartości”, dane przyjęte, założenie biegu ze składnikami, ślad
  `z0_line`, przyczyna odmowy w wierszu; bramy parami: W001 z treścią przyczyny, dostępność
  1F, `ELIG_SC1_MISSING_Z0` z treścią przyczyny, kreator K7 i macierz gotowości; rozpływ
  niesymetryczny SN i nN}; tożsamość reguły katalogu i odcinka; determinizm SN/nN; odmowy WN
  i napięcia nieznanego;
- `tests/enm/test_siec_zerowa_transformator_bez_grupy.py` (29 testów) — grupa {Dyn11, brak} ×
  transformatory {1, 2 równoległe — drugi bez grupy} × pasmo {SN za GPZ, nN za stacją} × węzeł
  {strona górna, dolna, za odcinkiem} × odcinek {z Z0, bez podstawy wartości roboczej} ×
  zwarcie {1F, 2F+Z}; para W004 ⇔ odmowa transformatora; determinizm;
- `tests/reference_engine/test_profil_pola_zespolu_uziemiajacego.py` — typ stacji {GPZ, SN/nN,
  brak} × stos aparatów pola ZU z kreatora GPZ {kompletny tor, bez wyłącznika, z aparatem
  transformatora, przekładnik przed wyłącznikiem, uziemnik w osi toru, bez aparatów}.

Odcinek 2 karty (B′0, TRV, przewód N, D31, sposób pracy punktu neutralnego):

- `tests/enm/test_b0_wartosc_robocza_odcinka.py` — pasmo {SN kabel, SN linia, nN, WN, napięcie
  nieznane} × B′1 {znane, brak} × B′0 modelu {podane, brak} (`test_regula_b0_iloczyn_pasmo_b1_b0`)
  × konsument {I_C sieci, rozstrojenie, projekt uziemienia V12.6, Y0 zwarcia 1F, dane przyjęte,
  rozpływ niesymetryczny bez danych przyjętych B′0, sieć IT nN czytająca wyłącznie B′0 modelu}
  × liczba odcinków {1, 2}; stosunek linii w zakresie metody odbić; determinizm;
- `tests/test_v126_trv_parametry.py` — parametr {U_r, f_n, τ, krotność prądu załączania} ×
  stan {brak, zero, ujemny, logiczny} → brak nazwany bez liczby; komplet → krzywa i udar; margines
  niezależny od U_r; determinizm; `tests/application/analyses/test_v126_gotowosc.py` —
  propozycja U_r = U_m sieci SN z modelu;
- `tests/enm/test_rozplyw_niesymetryczny_przewod_n.py` — odbiory {jednofazowy, dwufazowy,
  symetryczny} z wyrocznią I_N = I_a + I_b + I_c i U_N–PE = Σ Z_N·I_N po drodze; punkt
  gwiazdowy szyny pośredniej {uziemiony, nieuziemiony} × odbiór {symetryczny, faza A}; grupa
  połączeń transformatora {Dyn11, YNd11, YNyn0, Yyn0, Yd11, Dd0} → szyny odniesienia
  przewodu N; sieć bez nN bez pól przewodu N; determinizm;
- `tests/enm/test_v126_ner_cieplo_zu.py` — droga zerowa {Z_0,TU zespołu, Z_T0 uzwojenia TR} ×
  czas wyłączenia {brak, 0,5 s, 3 s} × liczba rezystorów {1, 2 równolegle} × c_max {z nośnika,
  brak — odmowa nazwana}; wyrocznia ręczna I_th(t)²·t; ślad WHITE BOX; determinizm;
- `tests/enm/test_doziemienie_tryby_punktu_neutralnego.py` (66 testów) — wyrocznie solvera
  czterech trybów z jawnych wzorów (I_C = 3ωC_0U_f, I_res = √(I_w² + (I_C − I_L)²) przy udziale
  I_L/I_C {0,9; 1,0; 1,1} × Z_0,TU {brak, podane}, AWSC załączony, I_F = |I_N + jI_C| ×
  Z_0,TU {brak, podane}, Z.14 dwie gałęzie łącznie, napięcia faz zdrowych z impedancji
  składowych, Z_f, droga YNyn, brak B′0 i brak impedancji punktu — braki nazwane) oraz iloczyn
  `test_iloczyn_tryb_uklad_odcinki_zu_konsumenci`: tryb {izolowany, dławik, dławik + AWSC,
  rezystor, Z.14, uzwojenie TR, bezpośredni} × układ {1 sekcja, 2 ze sprzęgłem zamkniętym,
  2 z otwartym — ZU w sekcji 1, sekcja 2 bez ZU} × odcinki {kabel, linia napowietrzna, mieszane}
  × konsument {wiersz zwarcia 1F, wiersz odpowiedzi, przyczyna braku wyniku zerowego,
  kompletność dowodu, linie raportu, konfigurator stacji}; Z_f opcji biegu
  (`test_impedancja_przejscia_biegu_trafia_do_doziemienia`, tryb × {izolowany, dławik,
  rezystor});
- `tests/test_v126_izolacja_tryby_punktu_neutralnego.py` — tryb × k {z solvera doziemienia,
  roboczy trybu} × ogranicznik {karta katalogowa, dobór wstępny} × konsument {wiersz,
  dane przyjęte, kompletność dowodu, uzasadnienie każdego kryterium}; stosunki doboru
  wstępnego przypięte do katalogu; `tests/test_v126_bil_parytet.py` — U_m {wiersz tabeli,
  między wierszami, powyżej tabeli} × źródło {katalog API, wiersz solvera};
  `tests/test_v126_uziemienie_z_modelu.py::test_detekcja_doziemien_dane_przyjete_przekaznika`
  — tryb × wyposażenie przekaźnika {podane, brak};
- front: `ui2/wyniki/akademickie/__tests__/model.test.ts` (dane przyjęte z fixtury solvera),
  `EkranAnalizAkademickich.test.tsx` (panel danych przyjętych z fixtury, kolumna uzasadnienia,
  werdykt rozstrojenia z fixtury), `ui2/wyniki/stan-fazowy/__tests__/ekranStanuFazowego.test.tsx`
  (przewód N), `StationEarthingPanel.test.tsx` (doziemienie trybu w konfiguratorze stacji).

Odcinek 3 karty (rekordy werdyktu V12.6, założenia jawne, ziarno przepustowości, niezawodność):

- `tests/application/analyses/test_v126_oceny_klasa.py` — KLASA rekordów: rodzaj
  {7 rodzajów `RODZAJE_Z_OCENAMI`} × bieg {z obiektami oceny, bez obiektów: bez
  ograniczników, uziomu, silników, wyposażenia przekaźnika, odniesień, parametrów TRV,
  uziemienia} × każdy rekord i składowa → etykieta i zdanie z backendu, podstawa z rejestru
  (`§ Z-n`, `WSKAZANE`) z daną przyjętą `ESTIMATED` założenia albo norma TRV `NIEUSTALONE`,
  kompletność `NIEPELNY` (`NIE_DOTYCZY` dla kryterium niestosowalnego), identyfikatory
  unikalne; brak obiektu nigdy `SPELNIA`; determinizm; zdanie bez identyfikatora modelu;
  zbiór rodzajów z rekordami = rejestr rodzajów; trzeci wariant biegu {obiekty bez wyniku
  liczbowego: silnik na szynach bez mocy zwarciowej i impedancji zasilania} × każdy tekst
  rekordu → bez literałów Pythona (`None/True/False/nan/inf`), opis śladu w zapisie polskim;
- `tests/test_v126_rozruch_silnika.py` (stan commitu 5) — tabliczka {cos φ_n, η_n podane,
  brak} × impedancja zastępcza {podana na wejściu szyny, brak — także gdy szyna niesie samą
  moc zwarciową albo Z_Q} × szyna {źródłowa, za kablem} z wyrocznią I_n, I_r, Z_th, ΔU, M_r;
  brak Z_th → brak nazwany (solver nie składa impedancji zastępczej sam); t_r {<, =, >}
  t_utyku; M_r {≥, <} M_obc; dane przyjęte ⇔ wartość robocza; pola wymagane; determinizm.
  Wyrocznia Z_th z przekładnią i K_T —
  `tests/solver_input/test_impedancja_zastepcza_mostu_v126.py` (§3.21);
- `tests/solver_input/test_v126_niezawodnosc_dane.py` — rodzaj gałęzi {linia, kabel, aparat}
  × dane projektanta {brak, λ, czas odnowy, oba} × długość {znana, brak} → wartość i dana
  przyjęta (dana ⇔ wartość robocza, powód z nazwą gałęzi, bez identyfikatora); parametr
  {nie-słownik, ujemny, logiczny, tekst} × element {w modelu z nazwą, spoza modelu} →
  `OdmowaNazwana` z nazwą w zdaniu i identyfikatorem w `dane`; most ENM × {bez parametru, kabel projektanta}; solver × element {z danymi,
  bez danych} z wyrocznią SAIFI/SAIDI/MAIFI (IEEE Std 1366); katalog API = rejestr;
- `tests/test_v126_hosting_rng_izolacja.py` — pole kontraktu {każde pole szyny, gałęzi,
  transformatora i parametru} × {czytane, nieczytane} → ziarno i wynik (zbiory zmian pokrywają
  każde pole kontraktu); obliczenie na projekcji = na pełnym wejściu;
- izolacja, uziom, uziemienie, TRV, detekcja: testy wyroczni po rodzajach przepisane na
  rekordy (`test_v126_izolacja_tryby_punktu_neutralnego.py`, `test_v126_bil_parytet.py`,
  `test_v126_neutral_earthing_design.py` — udział I_res/I_C {poniżej, na granicy, powyżej
  10 %}, `test_v126_ner_cieplo_zu.py`, `test_v126_trv_parametry.py`,
  `test_v126_uziemienie_z_modelu.py` — tryb {izolowany, dławik, rezystor, bezpośredni} ×
  wyposażenie {brak, watometryczna, sam 51N, 51N z 67N, 51N z 50N} z wyrocznią tabeli Z-8); `tests/test_v126_katalog_analiz.py` — progi karty z rejestru,
  rejestr dokumentu §7 = rejestr kodu; `tests/ci/test_fixtury_harnessu.py` — parametr wymagany
  karty ⇒ warunek blokujący gotowości; `tests/ci/test_v126_rodzaje_parytet.py` — funkcje
  detekcji formularza = słownik solvera, listy formularza = listy zestawu;
- front: `EkranAnalizAkademickich.test.tsx` (karta rekordu z fixtury dla każdego rodzaju,
  rekord bez wyjaśnienia odfiltrowany → „brak werdyktu”, lista danych niezawodności z wyborem
  elementu modelu i ładunkiem `reliability_data`), `parametry.test.ts` (iloczyn wierszy
  niezawodności: pełny, jedna wielkość, ten sam element dwa razy, wiersz pusty, lista spoza
  zestawu), `prezentacja.straznik.test.tsx` (każde pole fixtury prezentowane albo nazwane).
- warunek pojemności zerowej (§3.19): `tests/enm/test_zero_sequence_transformer.py::
  TestLineShuntCapacitanceZ0` — punkt neutralny {rezystor 40 Ω, bezpośrednio, izolowany} × B′0
  {3·10⁻⁶ S/km, 0, brak} z wyrocznią ręczną k i Z0 węzła (π), B′0 ujemne → odmowa, sieć nN IT
  × B′0 {jest, 0, brak} → przyczyna `poza_zakresem_iec60909`/`brak_drogi` i kotwica;
  `tests/enm/test_b0_wartosc_robocza_odcinka.py` — tryb sieci {bezpośrednio, rezystor,
  uzwojenie TR, uzwojenie TR bezpośrednio, dławik, izolowany} × źródło B′0 {model, wartość
  robocza} × skala B′1 (`test_bocznik_y0_zwarc_z_warunku_pojemnosci`, wyrocznia k z Y0 bez
  pojemności), zbiór danych przyjętych B′0 = zbiór gałęzi z wartością roboczą w Y0 (assembler
  i dane przyjęte węzła), determinizm śladu; `test_v126_niezawodnosc_dane.py` — ranking
  zdarzeń z ciężkością i bez (ciężkość nieobecna nie jest zastępowana liczbą).

## 5. Iniekcje (test czerwony bez naprawy)

| Iniekcja | Wynik |
|---|---|
| Przywrócona ścieżka ORM (`mv_neutral_grounding_ref` w kodzie) | strażnik grep-zero czerwony |
| Wartość domyślna uziemienia w V12.6 | `test_v126_uziemienie_z_modelu.py` czerwony |
| Z_N szeregowe zamiast równoległego w Z.14 | sonda Z.14 czerwona |
| Flaga wyłączenia od TR bez filtra szyny sekcji | 2 testy reguł czerwone |
| Panel uziemienia bez sekcji | 1 test panelu czerwony |
| Opis ograniczenia bez nazwanej przyczyny / wiersz bez pól przyczyny | po 3 testy czerwone |
| V12.6: U_l = najwyższe napięcie szyny modelu i B_0 ze wszystkich gałęzi (stan sprzed karty) | 8 z 9 testów zakresu sieci SN czerwone |
| Założenie zespołu usunięte z biegu zwarcia doziemnego (assembler) | 13 testów danych przyjętych czerwonych |
| Dane przyjęte bocznika bez filtra stanu AWSC | `test_prad_awsc_roboczy_tylko_gdy_awsc_zalaczony[spoczynek]` czerwony |
| Z.14 szeregowo (`impedancja_rownolegla_ohm` → Z_a + Z_b), powtórzone po zmianach | 3 testy sondy czerwone (Z.14, Z.13 z AWSC, wartości bezwzględne) |
| Kody gotowości zespołu bez wpisu w tablicach frontu / zbieracz emiterów bez zakresu | test fikstury rejestru i `akcjeNaprawcze.klasa.test.ts` czerwone (stan zastany przed naprawą) |
| Kolekcja `zespoly_uziemiajace` zdjęta z bramki kontraktu pól `update_element_parameters` | `test_parametr_spoza_kontraktu_zespolu_to_nazwana_odmowa` czerwony (operacja meldowała sukces bez skutku) |
| V12.6: B_0 gałęzi z całego modelu zamiast sieci galwanicznej (filtr `galezie_sieci` wyłączony) | 15 testów czerwonych: 12 z 12 iloczynu sprzęgło × TR × bateria (także przy sprzęgle zamkniętym — kabel 110 kV), 2 gotowości przy otwartym sprzęgle, 1 testu baterii (kabel nN) |
| V12.6: baterie z całego modelu zamiast baterii sieci | 5 testów czerwonych — dokładnie przypadki z baterią w drugiej sieci |
| Jedyna prawda: `baterie_sieci_sn` bez filtra szyn sieci | 5 testów czerwonych — te same przypadki |
| Ferrorezonans: suma Σb·ℓ po sieciach zamiast sieci o największej pojemności | `test_ferrorezonans_ocenia_kazda_siec_osobno[otwarte]` czerwony |
| Rola `ZU` w adapterze GPZ zwracana jako `LINE_OUT`, gałęzie `ZU`/`ZESPOL_UZIEMIAJACY` zdjęte z adaptera stacji, klasa numeracji `FZ` zdjęta (stan sprzed scalenia) | 4 testy czerwone, dokładnie nowe: rola stosu i pole kablowe GPZ, dwa nośniki roli w stacji, numeracja rysunkowa; na drzewie scalonym rola bez gałęzi to też błąd kompilacji wyczerpującego przełącznika (`TS2366`) |
| Nazwa sieci z identyfikatora szyny przy szynie bez nazwy (`nazwa or ref`) | 2 testy `test_nazwa_sieci_przy_szynie_bez_nazwy_bez_identyfikatora` czerwone; strażnik `nazwa_bez_identyfikatora_guard` czerwony |
| Wartość robocza odcinka wyłączona (`skladowa_zerowa_galezi` bez wyprowadzenia z modelu) | 108 testów czerwonych (zestaw 333 testów: nowy plik, walidator, izolacja szkicu, komunikaty kwalifikowalności, akcje naprawcze, rozpływ niesymetryczny, integracja scenariuszy) |
| Mapowanie: predykat z pól modelu zamiast jednego źródła | 24 czerwone |
| Diagnoza niesymetrii: predykat z pól modelu | 12 czerwonych |
| W001: dawny predykat `and` (oba pola puste) | 12 czerwonych |
| Kwalifikowalność: dawny predykat `and` | 8 czerwonych |
| Kreator: macierz gotowości z `r0 is not None` | 10 czerwonych |
| Dane przyjęte tylko z katalogu (wartości robocze odcinka modelu pominięte) | 37 czerwonych |
| Rozpływ niesymetryczny: Z0 z pól modelu zamiast jednego źródła | 12 czerwonych |
| nN: reguła SN (3·R′1) zamiast żyły PE/PEN | 33 czerwone |
| WN i napięcie nieznane: reguła SN zamiast odmowy | 2 czerwone |
| nN: R′0 = R′1 + R′PE (bez współczynnika 3) | 6 czerwonych |
| Mapowanie: pusta przyczyna braku wartości roboczej w zdaniu wiersza | 36 czerwonych |
| Transformator bez grupy: składowa uziemiona innym bocznikiem liczona (dawne pierwszeństwo) | 12 czerwonych (zestaw 259: plik transformatora, plik odcinka, `test_skladowa_zerowa_zu.py`) |
| Transformator bez grupy pominięty w przyczynach (stan sprzed zmiany) | 18 czerwonych |
| Rola `ZU` bez profilu referencyjnego (`profile_id_for_bay` → `None`, stan po dopisaniu roli do listy modelu) | 19 testów czerwonych: `test_profile_mapping_covers_all_bay_roles` oraz 18 z 21 testów `test_profil_pola_zespolu_uziemiajacego.py` (pole ZU z aparatami bez żadnej kontroli = cicha zgodność) |
| B′0: wyprowadzenie wartości roboczej wyłączone (`skladowa_zerowa_galezi` → `pochodne = ()`) | 7 czerwonych z 167 (iloczyn reguły B′0 i konsumenci pojemności) |
| Przewód N: straty gałęzi z impedancji własnej (bez Z_m·I_N) | 2 czerwone (`test_straty_galezi_z_realnym_i0_z_pelnej_macierzy_fazowej`, fazy A-B i A-B-C niesymetryczne) |
| Przewód N: potencjał N nie zerowany w uziemionym punkcie gwiazdowym (solver) | 1 czerwony (`test_solver_potencjal_n_zerowany_w_uziemionym_punkcie_gwiazdowym[faza-A-uziemiona]`) |
| Przewód N: assembler bez punktów uziemienia N (`neutral_earthed_bus_ids=()`) | 3 czerwone (`test_assembler_punkty_odniesienia_przewodu_n_z_modelu_polaczen`) |
| D31: prąd rezystora U_f/R zamiast c_max·U_f/\|R + Z_0/3\| | 18 czerwonych z 157 |
| D31: Z_0,TU pominięte w pętli rezystora | 13 czerwonych z 157 |
| Zmiana przyczyny sieci izolowanej `brak_drogi` → `poza_zakresem_iec60909` (sama naprawa, bez iniekcji) | wykryta przez dwa testy spoza nowych plików, przepisane do kanonu z zachowaniem intencji (zero liczby, przyczyna nazwana): `test_short_circuit_migracja_e3_golden.py::test_golden_sc1f_bez_skladowej_zerowej_jest_jawna_odmowa`, `test_siec_zerowa_transformator_bez_grupy.py` (szyna SN stacji SN/nN bez zespołu, 4 przypadki) |
| Tryby: sieć izolowana przez model impedancyjny (`TRYB_DOZIEMIENIA_TYPU["isolated"]` → `bezposrednie`) | 37 czerwonych z 280: 18 przypadków iloczynu trybu, Z_f biegu, 11 przypadków iloczynu sekcji × ZU × łącznika, sonda Ik1 wariantu, kotwica, wiersz odpowiedzi z przyczyną, 3 testy detekcji doziemień V12.6 |
| Tryby: rezystor bez I_C (`i_metal = I_N` w trybie rezystorowym) | 26 czerwonych z 280: wyrocznie rezystora i Z.14, Z_f, 9 przypadków iloczynu, 6 testów V12.6 rezystora z modelu, 5 testów doboru NER |
| Tryby: I_L odjęte bez I_w (część czynna I_N zdjęta w trybie kompensowanym) | 17 czerwonych z 280: wyrocznie I_res × udział I_L/I_C, AWSC załączony, Z_f, 9 przypadków iloczynu, test AWSC i Z_0,TU projektu dławika V12.6 |
| Tryby: Z_0,TU / Z_T0 pominięte (`I_N = Σ U_f/Z_N`) | 35 czerwonych z 280: 18 przypadków iloczynu, wyrocznie trzech trybów, Z_f, 6 testów V12.6 rezystora z modelu, 2 testy V12.6 z impedancją transformatora uziemiającego |

Odcinek 3 (każda iniekcja zmieniała plik źródłowy; po niej plik przywrócono i porównano
bajtowo z kopią):

| Iniekcja | Wynik |
|---|---|
| Rozruch: wskaźnik k_LR²·t_r/t_utyku zamiast t_r/t_utyku | 11 czerwonych z 17 (`test_v126_rozruch_silnika.py`) |
| Rozruch: I_n z 0,9 zamiast cos φ_n·η_n | 8 czerwonych z 17 |
| Rozruch: Z_th = Z_Q szyny źródłowej (bez sieci do węzła silnika) | 4 czerwone z 17 |
| Rekordy: kryterium bez danej przyjętej założenia (`_ocena`) | 10 czerwonych z 24 (`test_v126_oceny_klasa.py`) |
| Rekordy: rozruch bez silników → pusta lista rekordów | 1 czerwony z 24 |
| Rekordy: detekcja bez danej przyjętej Z-8 przy braku wyposażenia (stan sprzed poprawki) | 2 czerwone z 24 — defekt znaleziony testem klasy, naprawiony u źródła (`oceny_detekcji`) |
| Detekcja: metoda złożona wymaga tylko pierwszej funkcji (`SKLADNIKI_METODY_DETEKCJI[...][:1]`) | 8 czerwonych z 20 (`test_detekcja_doziemien_dane_przyjete_przekaznika`) |
| Rejestr: próg Z-6 10 % → 12 % tylko w kodzie | 8 czerwonych: parytet dokumentu §7, progi karty z rejestru, 6 wyroczni prądu resztkowego |
| Karta katalogu: `relay_methods` „wymagany” przy warunku nieblokującym | 2 czerwone (`test_parametr_wymagany_karty_jest_warunkiem_blokujacym_gotowosci`, `test_gotowosc_z_parametrami_rozni_sie_od_gotowosci_bez_parametrow`) |
| Warunek k: bocznik B0 zawsze w Y0 (`wchodzi = True`) | 6 czerwonych z 242 (m.in. `test_b0_w_y0_wylacznie_przy_k_powyzej_progu[bezposrednie-b0]`, `[izolowany-b0]`) |
| Warunek k: bocznik B0 nigdy w Y0 (`wchodzi = False`) | 17 czerwonych z 242 (m.in. `[rezystor-b0]`, determinizm śladu) |
| B′0 roboczy poza kandydatami (dwa predykaty: model wchodzi, wartość robocza nie) | 11 czerwonych z 242 |
| Assembler bez `b0_galezi` (B′0 roboczy w Y0 bez danej przyjętej wiersza) | 3 czerwone z 242 (`test_bocznik_y0_zwarc_z_warunku_pojemnosci[rezystor]`, `[uzwojenie_tr]`) |
| Dane przyjęte węzła bez `b0_galezi` | 1 czerwony z 242 (`test_dane_przyjete_wielkosci_z_modelu_niosa_b0_z_macierzy_y0[k_powyzej_progu]`) |
| Kotwica wg dawnej reguły (pojemność liczona jako bocznik domykający) | 3 czerwone i 30 błędów z 242 (osobliwa macierz sieci izolowanej) |
| Pojemność poza klasyfikacją drogi zerowej | 1 czerwony z 245 (`test_siec_nn_izolowana_pojemnosc_klasyfikuje_droge_zerowa[b0]` — test dopisany, bo bez niego iniekcja przechodziła) |
| Dana przyjęta podziału mocy zwarciowej z identyfikatorami szyn zamiast nazw (mechanizm i test skasowane w commicie 5, §3.21) | 4 czerwone z 25 (`test_dana_przyjeta_podzialu_zrodla_nazwana_nazwa_szyny[…moc_zwarciowa…]`) |
| Przepustowość bez danej przyjętej podziału mocy zwarciowej (`if False`; mechanizm skasowany w commicie 5) | 2 czerwone z 25 (`[…moc_zwarciowa-hosting_capacity]`) |
| Fixtura odpowiedzi: identyfikator gałęzi w powodzie wartości roboczej niezawodności | strażnik prezentacji czerwony (`surowaReferencjaWPodpowiedziach`, rodzaj `reliability_contingency`); fixtura przywrócona i porównana bajtowo |
| Opis śladu kryterium z surowym zapisem liczb (`{p.wynik} {p.jednostka}`, `{szczyt} kV`) | 19 czerwonych z 46 (`test_teksty_rekordow_bez_surowego_zapisu_pythona[motor_starting-bez_wyniku_liczbowego]` i 17 innych, `test_rozruch_bez_impedancji_zasilania_nazywa_brak_wyniku_w_sladzie`) |
| Fikstura okna kontyngencji w wersji sprzed przepisania (HEAD) | `test_fikstura_ekranu_niesie_teksty_aktualnej_odpowiedzi_backendu` czerwony |
| Odcinek 4: sieć z rezystorem przez model bezpośredni (`TRYB_DOZIEMIENIA_TYPU["resistor_grounded"]`) | 6 czerwonych z 25 (`test_ta_sama_siec_cztery_sposoby_z_wyroczni_recznej[rezystor-*]` ×5, rozróżnialność) |
| Odcinek 4: sieć kompensowana jak izolowana | 6 czerwonych z 25 (`[kompensowany-*]` ×5, rozróżnialność) |
| Odcinek 4: pojemności nigdy w Z_0 (`pojemnosci_w_skladowej_zerowej` → `False`) | 9 czerwonych z 25 (`[rezystor-k/u0/u_b/u_c]`, `[bezposrednie-*]`) |
| Odcinek 4: podstawienie LaTeX śladu z kropką dziesiętną | 4 czerwone z 25 (`test_slad_doziemienia_po_polsku_i_z_latex_do_ekranu[*]`) |
| Odcinek 4: raport bez linii śladu doziemienia | 4 czerwone z 25 (jw.) |
| Odcinek 4: tryb bezpośredni bez kroku prądu swojego modelu w śladzie | 1 czerwony z 25 (rozróżnialność) |
| Odcinek 4: ekran podstawia prozę `substitution` do KaTeX-a | 2 czerwone z 21 (`EkranSkladowych.test.tsx` — ślad WHITE BOX, krok bez podstawienia LaTeX) |
| Odcinek 4: ekran bez kroków śladu | 2 czerwone z 21 (jw.) |
| Odcinek 4: `warunek_latex` z literałem `10\%` i stała Z-6 12 % | `test_prog_zalozenia_z_jednego_zrodla_w_rekordzie` i parytet dokumentu §7 czerwone |
| Commit 5: kompensowany z dławikiem w stacji bez I_L (`math.hypot` → I_res) | `test_v126_prad_uziomowy.py::test_prad_stacji_z_modelu_iloczyn_sposob_wn_zrodlo[…]` czerwony |
| Commit 5: sieć SN z rezystorem poza regułą I″k1 | jw. czerwony |
| Commit 5: strona WN poza regułą I″k1 | jw. czerwony (`[izolowany-liczona-model]`) |
| Commit 5: punkty zwarcia przypadków z węzłami pomocniczymi | jw. czerwony |
| Commit 5: szyna pomocnicza przyjęta jako szyna stacji (`if False`) | jw. czerwony |
| Commit 5: wskrzeszony pakiet `earthing_ground_fault_sn.py` z `EarthingGroundFaultPackInput` | `legacy_public_path_guard` rc 1 (`resurrected-definition`, grupa ZU5) |
| Commit 5: dawny zapis ASCII `sladWzorBieg` (ślad rozpływu OSD) | `wzorySladuLatex.test.ts` czerwony |
| Commit 5: symbol ASCII `U_dot,dop` w prozie katalogu | `test_proza_katalogu_niesie_symbole_wylacznie_jako_wzory_inline` czerwony |
| Commit 5: surowa liczba z kropką w uzasadnieniu prądu z modelu (solver) | `test_zdania_solvera_bez_kropki_dziesietnej[earthing_safety]` czerwony |
| Commit 5: Z_b szyny z pierwszego węzła macierzy zamiast z węzła szyny | `test_z_th_szyny_z_mostu_rowna_wyroczni[bez_wyspy-WN-hosting_capacity]` czerwony |
| Commit 5: wpis `en50522_prad_uziomowy` usunięty z rejestru wzorów | `test_v126_wzory.py` czerwony (kompletność rejestru ze źródła) |
| Commit 5: `\mathrm{przekaźnika}` w fixturze katalogu (pole `wartosc_graniczna`) | `wzoryLatexFixtur.test.ts` czerwony — dopiero po rozszerzeniu skanu na KAŻDE pole tekstowe z `$…$`; przy filtrze `*_pl` iniekcja przechodziła (test poprawiony) |
| Commit 5: tabela przypadków prądu uziomowego zdjęta z prezentacji | `pradUziomowy.test.tsx` czerwony (2 z 3) |
| Commit 5: surowy float prądu w danej gotowości uziomu | `test_gotowosc_bez_kropki_dziesietnej_i_bez_symboli_ascii[earthing_safety-parametry_sceny]` czerwony |
| Commit 5: etykieta warunku „… wyłącznika U_r” (symbol ASCII) | `test_gotowosc_bez_kropki_dziesietnej_i_bez_symboli_ascii[transient_trv-bez_parametrow]` czerwony |
| Commit 5: podstawienie kroku `en50522_prad_uziomowy` = uzasadnienie ze wzorem `$I''_{k1}$` | `test_prad_stacji_z_modelu_iloczyn_sposob_wn_zrodlo[izolowany-liczona-model]` czerwony |
| Commit 5: etykiety wielkości doziemienia E-29 renderowane jako zwykły tekst (`{w.etykieta}`) | `EkranSkladowych.test.tsx` „sieć kompensowana” czerwony (`$I_C$` w etykiecie) |

Iniekcje trybów w testach (monkeypatch w `test_doziemienie_tryby_punktu_neutralnego.py`,
`test_v126_izolacja_tryby_punktu_neutralnego.py::test_iniekcja_k_rezystora_jak_bezposrednie`)
przypinają te same cztery defekty na stałe: test przechodzi wtedy, gdy wyrocznia pod iniekcją
się rozjeżdża, a `test_bez_iniekcji_wyrocznie_zgodne` pilnuje, że bez iniekcji jest zgodna.
Iniekcje źródłowe z tabeli zmieniały plik źródłowy; po każdej plik przywrócono i porównano
bajtowo z kopią.

## 6. Inwentarz klasy (ścieżki opisu punktu neutralnego SN i ich czytelnicy)

| Ścieżka | Czytelnik | Co zrobiono |
|---|---|---|
| (1) `Source.neutral_grounding` + R0/X0 | mapowanie Y0 (`mapping.py:_source_zero_impedance_ohm`, `_assemble_zero_sequence_y0`) | Z0 źródła stampowane tylko poza pasmem SN |
| | operacja `add_grid_source_sn` | odmowa po stronie SN; zespoły sekcji w ładunku `zespoly_uziemiajace` |
| | walidator E-W5-01 / W002 | przepisane: W002 nie blokuje 1F, węzły dostają `brak_danych` |
| | gotowość 1F (`eligibility_service.py:794–840`) | sieć SN → `uziemienie_sieci`; gałąź źródła tylko dla modeli bez SN |
| | `field_read_model.py:1324` | czyta źródło wyłącznie dla sieci 110 kV za granicą modelu |
| | `enm/uziemienie.py` (przeniesienie `Bus.grounding` spoza SN) | zostaje — dotyczy pasma WN/nN, nie SN |
| | `v2_projection.py`, `hash.py`, `topology_ops.py` | zostają — projekcja/odcisk pola źródła 110 kV |
| | kreator źródła zasilania (front) | punkt neutralny i Z0 tylko dla 110 kV; sekcje SN z zespołami |
| (2) `Transformer.hv_neutral`/`lv_neutral` | `uziemienie_sekcji._punkty_uzwojen` | punkt uzwojenia SN to punkt uziemienia sekcji (wariant „uzwojenie") |
| (3) `StationAudit2Config.mv_neutral_grounding_ref` | `audit2_der_payload.py:160`, `solver_input/builder.py:536`, `audit2_skladanie.py:421`, `StationConfiguratorSurface.tsx`, katalog audytu 2, ORM, migracja SQL, OpenAPI | skasowane; konsumenci czytają `uziemienie_sieci`; grep-zero |
| (4) parametry biegu V12.6 | `v126_academic.py` (trzy domyślne), `v126_contracts.py`, `v126_gotowosc.py`, `v126_wzory.py`, ekran parametrów akademickich | domyślne skasowane; `uziemienie_sn_v126(enm)`; gotowość z kodem `ograniczniki.uziemienie_sieci_nieznane`; zakres sieci SN i U_n z jednej prawdy (§3.6); parametry „docelowy prąd doziemienia” i „energia rezystora” skasowane — rezystor z modelu (§3.7); ekran parametrów akademickich bez tych pól |
| (6) bocznik zespołu z wartości roboczej | wiersze 1F/2FG (`dane_przyjete_galezi`), agregat biegu, `dane_przyjete_wezla` (równoważnik SN), rejestr gotowości i akcje naprawcze frontu | założenie `zespol_uziemiajacy.wartosc_robocza` + dane przyjęte ESTIMATED (§3.8) |
| (5) `BayEarthFaultPath.grounding_device_ref = None` | `field_read_model.py:292` (`droga_doziemna_pola`), `:1304` | wskazuje zespół sekcji pola |
| (7) front: SLD GPZ — glif punktu neutralnego SN | `ui/sld/v2/canvas/enmToCanonicalGpzAdapter.ts::deriveSnNeutralEarthing` | czytał `Source.neutral_grounding` równoważnika 110 kV i rysował go jako punkt neutralny sieci SN; teraz zespół uziemiający na szynie sekcji SN stacji (kolejność `gpz_sections`), potem uzwojenie SN transformatora (`lv_neutral`), inaczej brak glifu; legenda `neutralEarthingLabelPl` nazywa układ Z.14 („dławik gaszący ‖ rezystor X Ω") |
| (8) front: ekran składowych symetrycznych (E-29) | `ui2/wyniki/skladowe/model.ts::uziemieniePunktu`, `uziemieniaSieci` | punkt zwarcia na szynie SN dostaje opis zespołu tej szyny (wariant, AWSC, nastawa); źródło opisane jako punkt neutralny sieci 110 kV za granicą modelu; lista sieci: źródła, zespoły, transformatory |
| (16) R′0/X′0 odcinka bez składowej zerowej — jedno źródło (zasada nr 4) | `enm/skladowa_zerowa_galezi.py:98` (`skladowa_zerowa_odcinka`) i `:157` (`skladowa_zerowa_galezi`); reguła `network_model/catalog/wartosci_robocze.py:1300` (nN) i `:1339` (SN, także katalog `mv_cable_line_catalog.py:211`); konsumenci: `enm/mapping.py:614` (sieć zerowa), `enm/assembler.py:1676` (diagnoza niesymetrii) i `:2031` (wejście rozpływu niesymetrycznego), `enm/dane_przyjete_galezi.py:82` (założenie i dane przyjęte), `enm/validator.py:1486` (W001, dostępność 1F), `application/eligibility_service.py:696` (`ELIG_SC1_MISSING_Z0`), `application/network_wizard/validator.py:296`, `:328`, `:406` (K7, macierz gotowości), `domain/canonical_operations.py` (`branch.zero_sequence_missing`, `branch.z0_wartosc_robocza`) | wartość robocza wg pasma albo odmowa z `brak_podstawy_pl` (§3.11); predykat „składowa znana” jeden dla bram i obliczenia; katalog bajt w bajt (odcisk SHA-256 katalogu kabli i linii identyczny przed i po) |
| (17) transformator bez grupy połączeń w sieci zerowej | `enm/mapping.py:889` (zbiór), `:1133` (pierwszeństwo przed bocznikiem) | `brak_danych` z elementem i „czego brakuje” zamiast `brak_drogi`; także w składowej uziemionej innym bocznikiem (§3.12). `uziemienie_sekcji._punkty_uzwojen` zostaje: transformator bez grupy nie jest punktem uziemienia (brak modelu połączeń), a analizy doziemne blokuje kod `transformer.vector_group_missing` |
| (9) brak wyniku zerowego jako rekord werdyktu | `enm/mapping.py::BrakWynikuZerowego` → `canonical_analysis` (opis ograniczenia, wiersz odpowiedzi) | rekord niesie `WyjasnienieWerdyktu` (zdanie z NAZWAMI elementów, przyczyna, czego brakuje dla `BRAK_PODSTAWY`) zamiast gołego opisu; identyfikatory wyłącznie w `elementy` |
| (10) parametry biegu V12.6 | `solver_input/v126_contracts.py::wiersze_izolacji_projektanta`, `api/v126_academic.py` | parametry `neutral_grounding`, `neutral_earthing_type`, `network_neutral` i kategoria izolacji wiersza projektanta nie nadpisują modelu: odmowa nazwana (`OdmowaDanychError`, 422) z drogą do zespołu sekcji; szyna spoza modelu i wiersz łamiący kontrakt — odmowa nazwana zamiast 500 |
| (11) rdzeń V12.6 bez napięcia sieci | `network_model/solvers/v126_academic.py` (I_C, NER) | `napiecie_kv` brak → odmowa nazwana `missing_fields = ["nominal_kv"]` zamiast `or 0.0` (ciche zero); prąd dławików w Z.14 bez domysłu; podstawienie śladu NER z nazwą rezystora |
| (12) zakres sieci prądu pojemnościowego (gałęzie i baterie) | `v126_academic.py::_projekt_uziemienia_sieci`, ocena ferrorezonansu TRV, `v126_gotowosc.py::_warunki_punktu_neutralnego`, `enm/uziemienie_sekcji.py::_b0_sieci` (walidator rozstrojenia, I_C) | każda galwanicznie połączona sieć SN osobno (`V126UziemienieSnInput.sieci`: `galezie_sieci`, `baterie_sieci` z `galezie_sieci_sn`/`baterie_sieci_sn`); B_0 baterii w jedynej prawdzie; ferrorezonans bierze największą Σb·ℓ spośród sieci (najgorszy przypadek, nie sumę); §3.9 |
| (13) profil referencyjny pola ZU | `reference_engine/registry.py::profile_id_for_bay`, pakiet `iec62271` (backend i kopia frontu `ui/sld/reference/iec62271.pack.json`), `docs/sld/REFERENCE_ENGINE_SPEC_V1.md` §4–§5 | rola `ZU` dostała profil `earthing_unit` (ENEA Zeszyt 1 Zał. 13–15: DS → CB → CT → głowica mostu; transformator uziemiający w polu zakazany — jest zespołem modelu); dotąd pole ZU z aparatami nie podlegało żadnej kontroli. Przy okazji tabela profili specyfikacji dostała brakujący wiersz `capacitor_bank` karty BKR. Lustro frontu `referenceProfileIdForFieldRole`: `EARTHING_UNIT` → `earthing_unit` (wiersz 14) |
| (15) rola ZU w kreatorze pola SN i rodzaj pola katalogowego | `ui2/kreatory/pole/polaSnModel.ts` (`ROLE_KOLEJNOSC`, `bayKindZRoli`), `network_model/catalog/switchgear/complete_mv_bay_template.py` (`BayKind`, opis rodzaju), `catalog/bay_templates.py::FIELD_TYPES_WITHOUT_TEMPLATE`, `reference_engine/compliance.py::_BAY_ROLE_TO_FAMILY_BAY_KIND`, front `ui/catalog/BayTemplatePicker.tsx`, `ui2/kreatory/stacja/konfiguratorRozdzielnicy.ts::ROLA_Z_FUNKCJI_POLA` | kreator pola SN nie oferował roli ZU (test „każda rola z jednej listy ról modelu” czerwony na drzewie scalonym), a `bayKindZRoli` dawałby dla ZU rodzaj liniowy odpływowy (szablony pól liniowych producentów). Teraz rodzaj pola katalogowego `zespol_uziemiajacy` (rola kanonu `ZESPOL_UZIEMIAJACY`), jawnie bez szablonu w katalogu (rejestr braków, fikstura katalogu konfiguracji pól zregenerowana generatorem `gen_field_configurations_catalog.py`), bez roli operacji stacyjnej SN/nN; kreator oferuje ZU, zespół dodaje kreator zespołu uziemiającego na zacisku pola |
| (18) sposób pracy punktu neutralnego — jedna tabela trybu | `network_model/core/uziemienie.py:130` (`TRYB_DOZIEMIENIA_TYPU`), `:144` (`tryb_doziemienia_typu`), `:141` (`TRYBY_IEC60909`); czytelnicy: `enm/mapping.py:566` (bocznik uzwojenia), `:1222`, `:1273–1295` (przyczyna `poza_zakresem_iec60909`), `enm/uziemienie_sekcji.py:382`, `:534` (tryb sekcji i punktu) | tryb zamiast kategorii izolowany/uziemiony; izolowany i kompensowany nie dostają liczby z modelu Z1+Z2+Z0 (przyczyna „poza zakresem IEC 60909” zamiast „brak drogi”) |
| (19) solver doziemienia SN | `network_model/solvers/doziemienie_sn.py:351` (`oblicz_doziemienie`), `:269` (`prad_punktow_neutralnych_a`), `:283` (napięcia z impedancji składowych), `:334` (napięcia z admitancji sieci) | nowy solver warstwy solverów (poza listą FROZEN): I_C, I_res, I_F, Z.14, Z_f, U0 i napięcia faz zdrowych, ślad WHITE BOX (proza i `substitution_latex` każdego kroku, krok prądu każdego trybu — odcinek 4), zastrzeżenia, dane przyjęte |
| (20) konsumenci wyniku doziemienia | `enm/doziemienie_sieci.py:35` (`doziemienie_wiersza`) ← `enm/canonical_analysis.py:2857` (wiersz 1F i wiersz odpowiedzi); `api/analysis_run_exports.py:815` (`_linie_doziemienia`, raport); `enm/uziemienie_sekcji.py:538`, `:591` (`dane_doziemienia`, `doziemienie` — konfigurator stacji, front `StationConfigurator.tsx`); `solver_input/v126_contracts.py:607` (`_doziemienie_szyny_izolacji`), `:665` (`wiersze_izolacji_projektanta`); `network_model/solvers/v126_academic.py:2016` (projekt uziemienia), `:2038` (`_petersen_design`), `:2209` (`_ner_design`) | wszystkie czytają jeden wynik `oblicz_doziemienie`; prąd dławików Z.14 z punktów neutralnych modelu (`punkty_neutralne`), nie z parametru `prad_dlawikow_a` (skasowany) |
| (21) koordynacja izolacji V12.6 | `network_model/solvers/v126_academic.py:359` (`K_ROBOCZY_TRYBU`), `:412` (`_wiersz_izolacji`), `:567` (`_uzasadnienie_izolacji`), `:2520` (`_insulation`); front `ui2/wyniki/akademickie/prezentacja.ts` (kolumna uzasadnienia) | U_TOV = k·U_m/√3 z k trybu; kryteria wg czasu doziemienia; uzasadnienie każdego kryterium; wersja solvera 1.3 |
| (22) kontrakty wejściowe V12.6 | `solver_input/v126_contracts.py:40` (`_WejscieV126`, `extra="forbid"`) | parametr spoza kontraktu (np. dawny `prad_dlawikow_a`) to błąd walidacji, nie cicho zignorowane pole; `V126RunRequest` bez zmian (koperta żądania) |
| (23) odcinek bez B′0, TRV, przewód N, D31 | `network_model/catalog/wartosci_robocze.py:1343`, `enm/skladowa_zerowa_galezi.py:206` (B′0); `application/analyses/v126_gotowosc.py:291` (propozycja U_r), `v126_academic.py:2678` (`_transient`); `network_model/solvers/power_flow_unbalanced.py:178`, `:463`, `enm/assembler.py:2308`, `domain/result_contract_power_flow_unbalanced_v1.py:63`, `:120` (przewód N); `v126_academic.py:2488`, `solver_input/v126_contracts.py:340`, `:504` (D31) | §3.13–§3.16 |
| (14) rola pola ZU w adapterach SLD | `ui/sld/v2/canvas/enmToCanonicalGpzAdapter.ts::mapBayRoleToFieldRole` (GPZ), `enmToSldAdapter.ts::fieldRoleFromBayRole`/`fieldRoleFromCatalogRole`/`stationFieldDesignation` (stacje), `canonicalGpzModel.ts::BayFieldRole`, `domain/apparatusContracts.ts::FIELD_ROLE`, `v3/compose/gpz.ts` i `directions.ts` (numeracja rysunkowa, opis roli), `ui/shared/rodzajStacji.ts` i `enm/rodzaj_stacji.py` (kategoria) | pole ZU spadało w adapterze GPZ w `default: LINE_OUT` (pole liniowe odpływowe — kandydat na pole magistrali sieci i numer pola liniowego), a w adapterze stacji w `?? LINE_BRANCH` (pole odgałęźne); po scaleniu z kartą BKR przełącznik GPZ jest wyczerpujący, więc rola ZU bez gałęzi była błędem kompilacji. Teraz rola stosu `EARTHING_UNIT`: nie jest polem kablowym (`czyPoleKabloweGpz` fałsz), oznaczniki aparatów jak pole baterii (Q0/Q1/Q8/T1), numeracja rysunkowa `FZ1…` (licznik odrębny), oznaczenie stacji „ZU”, opis roli „pole zespołu uziemiającego”, kategoria rodzaju stacji „inne”. Glifu zespołu na końcu toru pola nie dodano — punkt neutralny rysuje glif sekcji (wiersz 7); wygląd pola ZU na schemacie podlega werdyktowi B-02 (rozstrzygnięcie 9) |

Znaleziska uboczne naprawione w tej karcie: kreator GPZ wymuszał uziemienie źródła SN
(po kasacji odmawiane) — przeprojektowany; wynik 1F złotej sieci (2,8 A z kotwicy) → nazwana
przyczyna (fikstury harnessu zregenerowane generatorem); przyczyna nie docierała do wiersza
odpowiedzi ani raportu — przekazana; `OverflowError` w składowej nieokresowej przy R/X < 0;
wpisy `.sql` w strażniku grep-zero; W-ZU-02 przy otwartym polu ZU.

Znaleziska uboczne naprawione w tej części karty: nazwa zespołu tworzonego kreatorem GPZ
(„Zespół uziemiający bez nazwy" → „Zespół uziemiający sekcji N"); dziewięć kodów gotowości
zespołu (E-ZU-*, W-ZU-*, W-W5-02) bez wpisu w tablicach akcji naprawczych i grup celu frontu
oraz nieodświeżony snapshot rejestru (strażnik fikstury rejestru czerwony) — uzupełnione;
zbieracz emiterów akcji w teście fikstury rejestru mieszał wywołania dwóch funkcji
pomocniczych o tej samej nazwie w różnych metodach walidatora (fantomowy emiter
„OPEN_MODAL bez okna") — zbieracz czyta wywołania w zakresie funkcji, pomocnicza zespołu
ma własną nazwę; komentarz `hash.py` wskazywał nieistniejący plik testu — wskazuje test,
który przypina odcisk z kluczem kolekcji i bez.

Znaleziska uboczne naprawione w części końcowej karty (po bramce scalenia):
operacja kreatora GPZ dokładała zdarzenie `ELEMENT_CREATED` zamiast zdarzeń operacji zespołu
(rejestr zdarzeń domenowych dostał `ZESPOL_UZIEMIAJACY_CREATED`/`_UPDATED`, operacja GPZ
przenosi zdarzenia kroków pola i zespołu z kolejnym `event_seq`); kolekcja zespołów poza bramką
kontraktu pól (parametr spoza kontraktu znikał bez śladu); słownik komunikatów bez etykiety pola
`grounding.type` operacji źródła; macierz kompatybilności API bez wierszy trzech przestrzeni
katalogu aparatów zespołu i końcówki `_uziemienie-sn`, a wiersz `mv-neutral-groundings` nie
oznaczony jako usunięty (strażnik cyklu życia API); test migracji magazynu przenosił uziemienie
szyny SN na źródło tej szyny — przepisany do kanonu (źródło 110 kV, utrata uziemienia SN nazwana)
z testem, że uziemienie szyny SN nie przechodzi na źródło; pin odcisku katalogu (trzy nowe
przestrzenie, odcisk bez nich równy dawnemu); pin pól kontraktów wejściowych strażnika podstawień
4374 → 4419 (pomiar różnicy zbiorów na `1465336df`: −3 pola skasowanej drugiej prawdy, +48 pól
zespołu, jego aparatów, katalogu i wejścia składowej zerowej) i liczby plików skanu 596 → 599;
słownik kodów gotowości zregenerowany generatorem; wpis `zgodny/niezgodny` w mapie statusów
ekranu projektu uziemienia V12.6 cofnięty — nowe mapy statusów są zakazane kontraktem werdyktu
(migracja map ekranów akademickich D31 na liście zapadki), ocena cieplna rezystora pokazuje E
wobec E_n w wielkościach głównych, bez żetonu statusu; zakładki przeglądarki typów dla trzech
przestrzeni zespołu nie powstały — te katalogi przegląda kreator zespołu uziemiającego
i przeglądarka katalogu budowy sieci, tak jak ograniczniki i baterie kondensatorów.

Znaleziska uboczne naprawione w odcinku 2 karty: ślad dławika V12.6 podstawiał `0.0` za brak
składowej czynnej AWSC (`awsc.i_w_a or 0.0`) — jawne `None`; dwa wpisy zapadki podstawień
koordynacji izolacji zdjęte (pin strażnika podstawień: pola kontraktów 4444 → 4484, pliki
603 → 605, zapadka 47/220 → 47/218 — pomiar różnicy zbiorów na `0344668a0`); opis domyślnej
wartości solvera w katalogu analiz V12.6 mówił U_res = 3,9·U_c (solver 4,0) i niósł kod
`ESTIMATED` w zdaniu dla człowieka — poprawiony, fixtura katalogu zregenerowana generatorem;
trzy nowe błędy typów (`v126_wzory._podstawienie_ner_czas_dopuszczalny`,
`analysis_run_exports._linie_doziemienia`) — zapadka mypy z powrotem 167/21; fixtura testu
panelu uziemienia stacji typowana (`as const` łamał bramkę typów testów); wyjątek strażnika
matematyki ASCII przesunięty z linią (`v126_katalog.py:453` → `:458`); dwa wpisy MIGRACJA
strażnika werdyktu wyjaśnialnego przeniesione z ładunkiem do nowych funkcji (`_wiersz_izolacji`,
`_ner_thermal`) bez zmiany klasy — wiersz izolacji niesie `uzasadnienie_pl` każdego kryterium,
pełna migracja ocen V12.6 do `OcenaKryterium` wykonana w odcinku 3 (§3.18: 13 wpisów V12.6
zdjętych, 190 wpisów MIGRACJA innych dziedzin zostaje w planie §8 kontraktu werdyktu); dwa testy przyczyny sieci izolowanej
przepisane do kanonu (§5).

Znaleziska zgłoszone, nienaprawione w tej karcie (z uzasadnieniem):

- Pojemność zerowa odcinka (dawniej zgłoszona jako brak katalogu) — naprawione w §3.13
  wartością roboczą B′0 z B′1; katalog bez zmian (B′0 z modelu ma pierwszeństwo).
- V12.6 TRV: U_r dawniej z najwyższego napięcia szyny modelu — naprawione w §3.14 (U_m sieci
  SN). Zostają bez wartości roboczej f_n, τ i krotność prądu załączania: znamionowe parametry
  TRV IEC 62271-100 (u_c, t_3, współczynnik amplitudy) nie są danymi programu, a wpisanie ich
  z pamięci byłoby fabrykacją. Brak jest nazwany (`missing_fields`), krzywa nie powstaje;
  zamknięcie wymaga wprowadzenia tablic normy z wydaniem i jednostką redakcyjną (decyzja
  architekta o źródle tablic). Obwiednia TRV `_transient` (wzór jednoczęstotliwościowy) nie ma
  w kodzie podstawy normowej — zgłoszone razem z tablicami.
- (Naprawione w odcinku 3, §3.18 — ziarno z projekcji pól czytanych.) Hosting capacity
  V12.6: ziarno Monte Carlo jest odciskiem CAŁEGO modelu wejściowego
  (mechanizm karty HOSTING-RNG-IZOLACJA, jawny w śladzie `seed_model`), więc zmiana pola bez
  związku z hosting (tu: wiersz izolacji w fixturze `generuj_odpowiedzi_v126.py`) zmienia
  wynik fixtury 7,7 → 7,0 MW przy n = 64 losowań. Determinizm (to samo wejście → ten sam wynik)
  jest zachowany; rozrzut to skutek małego n fixtury (domyślnie n = 1000). Zawężenie ziarna do
  pól wpływających na hosting zmienia wszystkie wyniki hosting — decyzja architekta (B-01).
  Sonda ziarna odcinka 4 (§3.20; zamknięte w commicie 5, §3.21) ujawniła szyny zasilane przez transformator bez Z_th
  (macierz V12.6 bez przekładni, O-21/O-26) — zgłoszone architektowi z wariantami.
- Glif ZU na końcu toru pola SLD — wstrzymany (werdykt wizualny B-02).
- Model dwóch sekcji przy otwartym sprzęgle: sekcja 2 bez zespołu nie ma pojemności własnych
  odcinków w teście iloczynu (odcinki są w sekcji 1), więc jej wiersz to brak nazwany zerowej
  pojemności, nie liczba — zachowanie poprawne, odnotowane jako granica iloczynu.
- `ground_fault_bridge` (most doziemienia V12.6) bez konsumenta — SKASOWANY w odcinku 3
  (§3.18); pakiet dowodowy `EARTHING_GROUND_FAULT_SN` skasowany w commicie 5 (decyzja
  architekta: wepnij albo skasuj, jeśli dubluje dowód V12.6 — dubluje). Kryterium dostrojenia ±10 % i wartości robocze
  niezawodności — jawne założenia rejestru §7 i dane przyjęte `ESTIMATED` (§3.18).
- Rozpływ niesymetryczny: odbiór faza–N w sieci SN za YNd11 dostaje odmowę „brak drogi I0"
  także przy zespole uziemiającym, bo solver BFS (FROZEN) nie ma boczników. Sieci SN
  nie zasilają odbiorów faza–N (odbiory SN to transformatory SN/nN i odbiory trójfazowe),
  więc odmowa nazwana jest poprawnym wynikiem, nie liczbą udawaną.

- Dwie pozycje katalogu kabli SN trójżyłowych z żyłą powrotną (ekran wspólny „/16”) dostają
  R′0 = R′1 + R′ żyły powrotnej (reguła ekranu każdej żyły). Gdy „/16” jest ekranem wspólnym
  trzech żył, właściwe byłoby R′0 = R′1 + 3·R′ekranu. Semantyka pozycji katalogu jest
  niejednoznaczna, a reguła katalogu należy do karty LINIA-110 zatwierdzonej przez architekta
  — zgłoszone do decyzji, katalog bez zmian (odcisk identyczny).
- Dane przyjęte gałęzi przypinane są do każdego wiersza składowej spójnej sieci zerowej
  (mechanizm karty LINIA-110), także do węzła, którego prąd od odcinka nie zależy (np. szyna nN
  przed odcinkiem promieniowym bez bocznika na końcu). Znacznik jest zachowawczy (dowód
  NIEPELNY zamiast pełnego), nie zawyża pewności; zawężenie do drogi prądu wymaga analizy
  wrażliwości Z0 węzła i należy do właściciela mechanizmu.

Świadomie bez zmian: `audit2_validation.py` / `validate-vt-grounding` — walidacja
współczynnika napięciowego przekładnika względem typu punktu neutralnego przyjmuje typ jako
wejście (typ pochodzi z `uziemienie_sieci` przez `audit2_skladanie`); `der_protection_functions.py`
czyta `neutral_grounding_mode` z faktów pola, które wyprowadza `_fakty_pola_wytworcy` z tej
samej prawdy. Biegi scenariuszowe liczą wyłącznie węzeł zwarcia (konstrukcja istniejąca,
nie defekt tej karty).

### 6.1 Inwentarz klas commitu 5

| Klasa | Miejsce (`plik:linia`) | Co zrobiono |
|---|---|---|
| Producent Z_th szyny | `solver_input/v126_contracts.py:611` `impedancje_zastepcze_szyn`, wołany w `:1741` dla `ANALIZY_IMPEDANCJI_ZASTEPCZEJ` (`:606`) | Z_bus[k,k]·Z_b,k z `short_circuit_core.build_zbus` (jeden budowniczy z biegiem IEC 60909) |
| Konsument Z_th | `network_model/solvers/v126_academic.py:3299` `_impedancja_zastepcza_szyny` (przepustowość i rozruch), pola projekcji `:709` `POLA_HOSTINGU_SZYNY` | czyta wyłącznie `thevenin_*`; podział mocy zwarciowej, Z_Q szyny jako Z_th i dana przyjęta podziału skasowane; brak → brak nazwany |
| Wyspa bez odniesienia | `network_model/core/graph.py:390` `NetworkGraph.wezly_bez_impedancji_do_odniesienia` | jedna definicja dla biegu zwarciowego (`enm/canonical_analysis.py`) i mostu V12.6 (dawniej funkcja modułu `canonical_analysis`) |
| Składanie wejścia solvera z modelu | `api/v126_academic.py:226` `wejscie_solvera_v126` (bieg API `:343`, sceny: `scripts/eksport_fixtur_harnessu.py`, `tests/uczciwosc/pomocnicze.py:85`, `tests/application/analyses/test_v126_wzory.py:56`); gotowość `application/analyses/v126_gotowosc.py:1228` | jedna składanka biegu; gotowość składa model bez danych formularzy (świadomie — ocenia braki parametrów, a nie liczy), ale z TĄ SAMĄ funkcją prądu uziomowego `doloz_prad_uziomowy` |
| Prąd uziomowy stacji | `application/analyses/v126_prad_uziomowy.py:175` `prad_uziomowy_z_modelu`, `:274` `doloz_prad_uziomowy`; `enm/canonical_analysis.py:2560` `zwarcia_doziemne_szyn`, `:2517` `_doziemienie_sieci_wezla` (jeden predykat doziemienia wiersza biegu i przypadku stacji); `v126_academic.py:132` `wielkosc_pradu_uziomowego`, `:1909` `_prad_uziomowy` | EN 50522 tab. 1 z modelu; nadpisanie projektanta `ESTIMATED`; przypadek bez wyniku z przyczyną |
| Węzeł pomocniczy (zacisk pola, punkt podziału) | `enm/assembler.py` (`ZNACZNIK_SZYNY_POMOCNICZEJ` zamiast literału `"helper_bus"`), `v126_prad_uziomowy.py:184`, `:199` | ten sam znacznik dla celu zwarcia biegu i przypadków stacji; szyna pomocnicza jako szyna uziomu → odmowa nazwana |
| Dubel dowodu uziomu | `application/proof_engine/packs/earthing_ground_fault_sn.py` (skasowany), `types.py`, `proof_generator.py`, `equation_registry.py`, `proof_inspector/inspector.py`, `unit_verifier.py`, reguły NR_P19 w `analysis/normative/*`, pokrycie (`analysis/coverage_score/builder.py`, `application/analyses/pokrycie_analiz.py`), UI (`ui/shell/V12OverlayModeController.tsx`, `ui/workspace/WorkspaceSurfaceRouter.tsx`, `routerDisplayHelpers.ts`) | skasowane; nawrót pilnuje `legacy_public_path_guard` (ZU5) |
| Symbol ASCII w prozie | katalog (`v126_katalog.py`), gotowość (`v126_gotowosc.py` — warunki, dane z modelu, propozycje), solver (`v126_academic.py` — uzasadnienia prądu uziomowego), ekrany ui2 (ślad OSD, obszar OZE, arkusz, estymacja, SSCI, aparatura) | wzory `$…$` przez `TekstZWzorami`; `opis_pl` warunku gotowości bez `$` (renderowany wprost i w 422); `ui_math_guard` PIN 0 |
| Liczba z kropką w prozie | `v126_gotowosc.py` (`format_liczba`), `v126_academic.py` (`_lp_tekst`) | przecinek dziesiętny; test `test_v126_liczby_po_polsku.py` (każdy rodzaj × {bez parametrów, parametry sceny}) |
| Polska litera w `\mathrm{}` | `v126_katalog.py` (4×), `v126_oceny.py:971`, `ocena_doboru_magistrali.py:596`, `v126_wzory.py:397` | `\text{}`; testy KaTeX `strict: 'error'` na wszystkich fixturach harnessu i tekstach backendu |
| Kompletność rejestru wzorów kroków | `application/analyses/v126_wzory.py` (wpis `en50522_prad_uziomowy`) | test porównuje rejestr z kluczami `trace.add` w źródle solvera |
| Pole prozy kroku śladu V12.6 (`substitution`, `result_pl`) | `v126_academic.py` `_prad_uziomowy` — trzy gałęzie `trace.add("en50522_prad_uziomowy", …)` (z modelu, nadpisanie, nazwany brak); pozostałe kroki 14 rodzajów w korpusie fixtur (`akademickie_scena_biegi.json`, `odpowiedziSolvera.json`) | podstawienie bez wzoru symbolu; korpus 1188 kroków / 18 dokumentów zielony w `slad_proza_bez_latex_guard`; predykat strażnika w teście iloczynu biegu API |

Świadomie poza zmianą (uzasadnienie merytoryczne): `enm/mapping.py` `BrakWynikuZerowego.opis_pl`
(zapis „I_C”, „√(I_w² + (I_C − I_L)²)”) oraz teksty łańcucha werdyktu V12.6 (`v126_oceny.py`
— opisy kryteriów, `dane_przyjete` solvera, `message_pl` SSCI, wartości robocze) — to zdania
rekordów werdyktu wyjaśnialnego, które przepisuje równoległa karta 190 wpisów MIGRACJA strażnika
werdyktu (wspólne fixtury `skladowe_scena_wynik.json` i odpowiedzi; zmiana tutaj dałaby konflikt
regeneracji tych samych plików). Pola `formula` śladu solvera zostają w zapisie ASCII z założenia
— ekran czyta `formula_latex` z rejestru `v126_wzory.py`.

## 7. Rejestr założeń inżynierskich kryteriów analiz specjalistycznych (Z-1…Z-12)

Dokument podstawy rekordów oceny V12.6 (wydanie 2026-10-29, jednostka redakcyjna „§ Z-n”,
stan `WSKAZANE`):
„Rejestr założeń inżynierskich kryteriów analiz specjalistycznych MV-DESIGN-PRO”. Jedno źródło w kodzie: `application/analyses/v126_oceny.py::REJESTR_ZALOZEN` —
z niego biorą progi rekordy oceny, karta katalogu analiz (`v126_katalog.py`, „podstawa oceny”)
i dane przyjęte. Żadne założenie nie jest wartością normową: praktyka, z której pochodzi, jest
nazwana w kolumnie „Praktyka”, a wydanie i jednostka redakcyjna normy nie są potwierdzone
w programie. Zmiana progu albo reguły to zmiana tej tabeli i rejestru w kodzie naraz — parytet
pilnuje `tests/test_v126_katalog_analiz.py::test_rejestr_zalozen_dokumentu_rowny_rejestrowi_kodu`.

| Paragraf | Kryterium | Treść | Próg | Praktyka |
|---|---|---|---|---|
| Z-1 | napięcia trwałej pracy ogranicznika | U_c ogranicznika nie mniejsze od wymaganego: przy doziemieniu długotrwałym (sieć izolowana i kompensowana) U_c,wym = U_TOV, przy doziemieniu wyłączanym U_c,wym = U_m/√3. | — | Reguła doboru ograniczników ZnO z praktyki IEC 60099-5 (wydanie i jednostka redakcyjna niepotwierdzone w programie). |
| Z-2 | wytrzymałości ogranicznika na przepięcie dorywcze | Przy doziemieniu wyłączanym samoczynnie wytrzymałość ogranicznika na przepięcie dorywcze 10 s nie mniejsza od U_TOV; zakłada się wyłączenie doziemienia w czasie nie dłuższym niż 10 s (dłuższy czas wymaga krzywej TOV(t) producenta). | 10 s | Reguła z praktyki IEC 60099-5 (wydanie i jednostka redakcyjna niepotwierdzone w programie). |
| Z-3 | marginesu ochrony izolacji | Margines ochrony M_BIL = (BIL − U_res)/U_res·100 % nie mniejszy niż 20 %. | 20 % | Zapas ochrony z praktyki koordynacji izolacji (IEC 60071-2 — wartość liczbowa marginesu nie jest potwierdzona w programie; wydanie i jednostka redakcyjna niepotwierdzone w programie). |
| Z-4 | napięcia dotykowego rażeniowego | Napięcie dotykowe rażeniowe uziomu nie większe od dopuszczalnego U_dot,dop = (1000 + 1,5·C_s·ρ_s)·0,157/√t_f (ciało 70 kg). | — | Wzór dopuszczalnego napięcia z praktyki IEEE 80, metoda Sveraka (wydanie i jednostka redakcyjna niepotwierdzone w programie). |
| Z-5 | napięcia krokowego | Napięcie krokowe uziomu nie większe od dopuszczalnego U_kr,dop = (1000 + 6·C_s·ρ_s)·0,157/√t_f (ciało 70 kg). | — | Wzór dopuszczalnego napięcia z praktyki IEEE 80, metoda Sveraka (wydanie i jednostka redakcyjna niepotwierdzone w programie). |
| Z-6 | prądu resztkowego sieci kompensowanej | Prąd resztkowy dławika modelu nie większy niż 10 % prądu pojemnościowego doziemienia sieci. | 10 % | Założenie projektowe bez podstawy normowej w programie: udziału prądu resztkowego ani rozstrojenia kompensacji nie podaje żadna norma ani wytyczna zapisana w rejestrze źródeł — ENEA Zeszyt 1 §16 wymaga doboru uziemienia punktu neutralnego w analizie projektu i zakazuje pracy w rezonansie — prąd dławika równy prądowi pojemnościowemu sieci (s. 30), wartości dopuszczalnej nie podaje. |
| Z-7 | obciążalności cieplnej rezystora punktu neutralnego | Energia wydzielona w rezystorze w czasie wyłączenia doziemienia E_k = I_th²·R·t_wył nie większa od energii znamionowej E_n = I_n²·R·t_n (kryterium adiabatyczne). | — | Znamionowanie czasowe rezystorów uziemiających z praktyki IEEE C57.32 (wydanie i jednostka redakcyjna niepotwierdzone w programie). |
| Z-8 | dostępności metody detekcji doziemień | Metoda zalecana wg sposobu pracy punktu neutralnego (sieć izolowana — watometryczna, kompensowana z dławikiem dostrojonym — watometryczna, rozstrojonym — admitancyjna, przez rezystor — 51N z 67N, uziemiona bezpośrednio — 51N z 50N), a przekaźnik ma każdą funkcję metody zalecanej. | — | Tabela decyzyjna z praktyki zabezpieczeń ziemnozwarciowych sieci SN — bez wartości normowej. |
| Z-9 | zapadu napięcia przy rozruchu | Zapad napięcia na szynie przy prądzie rozruchowym silnika nie większy niż 15 %. | 15 % | Granica z praktyki projektowania rozruchu silników SN — bez wartości normowej; zapad dopuszczalny zależy od odbiorów szyny i warunków operatora. |
| Z-10 | czasu rozruchu | Czas rozruchu nie dłuższy od dopuszczalnego czasu utyku silnika (czas podany przy prądzie zablokowanego wirnika). | — | Reguła cieplna rozruchu bezpośredniego — porównanie czasów z karty silnika. |
| Z-11 | momentu rozruchowego | Moment rozruchowy silnika (wzór Klossa przy poślizgu s = 1, napięcie znamionowe) nie mniejszy od momentu obciążenia przy rozruchu. | — | Warunek ruszenia napędu — bez wartości normowej. |
| Z-12 | zgodności z wartością odniesienia | Odchyłka wyniku od wartości odniesienia nie większa od tolerancji podanej z tą wartością. | — | Tolerancja jest daną odniesienia biegu (sieć odniesienia), nie wartością normową. |

Poziom dowodu zdolności (`solver_input/provenance.py`, `audit_ref` „§7 (odcinek 3)”):
koordynacja izolacji, bezpieczeństwo uziomu, projekt uziemienia punktu neutralnego, napięcie
powrotne, rozruch silników i walidacja benchmarkowa — model niezwalidowany
(`UNVALIDATED_MODEL`, obliczenie statyczne); detekcja doziemień — deklaracja konfiguracji
(`DECLARATION`, porównanie zbiorów funkcji bez symulacji zjawiska). Żadna z tych zdolności nie
jest dowodem regulacyjnym.

## Przekazanie (stan bieżący, 2026-10-30)

Sekcja aktualizowana przy każdym commicie. Niczego nie wypchnięto (gałąź wypycha architekt).

**Parytet assemblera SC_1F_max — ZAMKNIĘTY.** Przyczyna ustalona pomiarem: commit b1e677ced
zmienił ślad solvera doziemienia (`doziemienie_sn.py`), a poddrzewo
`results[*].doziemienie_sieci.slad` nie jest na liście `KLUCZE_SLADU_LICZBOWEGO` harnessu, więc
wchodzi do szkieletu porównywanego dokładnie. Różnice wyłącznie pod
`$.results[*].doziemienie_sieci.slad[*]`: nowy klucz `substitution_latex` (408 kroków), przecinek
dziesiętny w `substitution` (338 kroków), nowy krok `doziemienie_prad_bezposrednie` na `slad[0]`
w trybie bezpośrednim (G16/00 i G17/00, po 4 wiersze). Liczby: 40 284 porównane parami —
0 poza tolerancją. Złoty plik `tests/golden/parytet_assemblera/zlote_hashe.json` przegenerowany
`regeneruj.py` (57 wpisów SC_1F_max; `liczby` tylko G16/00 i G17/00: 247 → 283) — wszedł
w commit e73b336a1. Weryfikacja: `tests/golden` + `tests/enm` z nowym złotym plikiem na drzewie
b1e677ced pod blokadą biegów ciężkich — kod wyjścia 0, 7350 passed (675 s).

**Commit 5 — zrobione** (opis §3.21, §5, §6.1): Z_th z mostu modelu przez `build_zbus`
z przekładnią, prąd uziomowy EN 50522 tab. 1 z modelu, kasacja P19, wzory w prozie, KaTeX
ścisły, scena i spec zrzutowy doziemienia E-29, odcisk `solver_hashes.json` (v126_academic),
piny mypy 163/21 i `raise ValueError` 79, trzy strażniki naprawione po `guardy_z_ci`
(`slad_proza_bez_latex_guard`, `solver_input_substitute_guard`, `polykanie_wyjatkow_guard`),
etykiety wielkości doziemienia E-29 jako wzory, spec `v126-okna-zrzuty` z szyną stacji z modelu
własnej sieci.

**W toku (decyzja architekta w sprawie `ui_math_guard`).** Strażnik wykrywa goły indeks
symbolu (`U_f`, `I_C`, `Z_0`, `I_Δn`, `φ_r`) w tekstach UI (`ui2/**` i dwa moduły katalogu
backendu); skan Pythona po drzewie `ast` pomija wyłącznie pola `*_latex` i identyfikator
`symbol` w parze z `symbol_latex`; stała kodu TS (`'V_MAGNITUDE'`) jest kodem tylko poza modułem
`strings.ts` i poza właściwością tekstową. Pomiar przed naprawą: 122 trafienia w 31 plikach
(117 wzorcem łacińskim, 5 dalszych po dopuszczeniu liter greckich), po naprawie 0 = PIN. Naprawa:
symbole jako `$…$` składane przez `TekstZWzorami` (rama kreatora: etykieta, błąd, pomoc,
opis przełącznika, nota sekcji, cel, informacja, podsumowanie, następny krok; tabela wyników,
założenia, ekrany SSCI, stanu fazowego, analiz V12.6, NC RfG, OZE), atrybuty i natywne
`<option>` przez `tekstBezWzorow`. Do zrobienia: testy vitest/e2e zależne od etykiet,
samotest strażnika z iniekcją, proza podstawy `doziemienie_sn.py` (+ regeneracja parytetu),
fikstury generowane, biegi weryfikacyjne.

**Biegi w kolejce.** Zestaw celowany backendu (bieg `cel7`) i e2e `v126-okna-zrzuty`,
`v126-jezyk-screenshot`, `dowody-flow-ekspert-screenshot` (bieg `e2e12`) — pod blokadą;
potem `guardy_z_ci` (limit ≥ 3600 s) i `ZRZUTY_DO_DOKUMENTACJI=1`
`doziemienie-slad-zrzuty-screenshot`.
