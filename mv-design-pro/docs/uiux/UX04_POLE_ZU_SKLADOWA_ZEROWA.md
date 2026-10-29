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
| 7 | Kotwica 1e6 i trzy przyczyny | Sonda przed/po (§3): kotwica UDAWAŁA uziemienie bezpośrednie. Teraz kotwica wyłącznie dla bloków bez żadnego bocznika (`mapping.py:866–867`), a każdy taki węzeł dostaje odmowę nazwaną: `fault.zero_sequence_no_path` (brak drogi), `fault.zero_sequence_outside_iec60909` (sieć izolowana z B0 albo skompensowana), `fault.zero_sequence_missing_data` (gałąź bez R′0/X′0 albo źródło spoza SN bez Z0). Przyczyna przechodzi do wiersza odpowiedzi (`non_physical_reason`, `brak_wyniku_zerowego`), do opisu ograniczenia (`reporting_limitations_pl` = zdanie przyczyny), do ekranu składowych i do raportu PDF/DOCX („Ograniczenie wyniku: …"). |
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
  (`uziemienie_sn.sieci.rezystory`), Z.14 bez prądu dławika → `uziemienie_sn.sieci.prad_dlawikow_a`.

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
- `tests/reference_engine/test_profil_pola_zespolu_uziemiajacego.py` — typ stacji {GPZ, SN/nN,
  brak} × stos aparatów pola ZU z kreatora GPZ {kompletny tor, bez wyłącznika, z aparatem
  transformatora, przekładnik przed wyłącznikiem, uziemnik w osi toru, bez aparatów}.

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
| Rola `ZU` bez profilu referencyjnego (`profile_id_for_bay` → `None`, stan po dopisaniu roli do listy modelu) | 19 testów czerwonych: `test_profile_mapping_covers_all_bay_roles` oraz 18 z 21 testów `test_profil_pola_zespolu_uziemiajacego.py` (pole ZU z aparatami bez żadnej kontroli = cicha zgodność) |

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
| (9) brak wyniku zerowego jako rekord werdyktu | `enm/mapping.py::BrakWynikuZerowego` → `canonical_analysis` (opis ograniczenia, wiersz odpowiedzi) | rekord niesie `WyjasnienieWerdyktu` (zdanie z NAZWAMI elementów, przyczyna, czego brakuje dla `BRAK_PODSTAWY`) zamiast gołego opisu; identyfikatory wyłącznie w `elementy` |
| (10) parametry biegu V12.6 | `solver_input/v126_contracts.py::wiersze_izolacji_projektanta`, `api/v126_academic.py` | parametry `neutral_grounding`, `neutral_earthing_type`, `network_neutral` i kategoria izolacji wiersza projektanta nie nadpisują modelu: odmowa nazwana (`OdmowaDanychError`, 422) z drogą do zespołu sekcji; szyna spoza modelu i wiersz łamiący kontrakt — odmowa nazwana zamiast 500 |
| (11) rdzeń V12.6 bez napięcia sieci | `network_model/solvers/v126_academic.py` (I_C, NER) | `napiecie_kv` brak → odmowa nazwana `missing_fields = ["nominal_kv"]` zamiast `or 0.0` (ciche zero); prąd dławików w Z.14 bez domysłu; podstawienie śladu NER z nazwą rezystora |
| (12) zakres sieci prądu pojemnościowego (gałęzie i baterie) | `v126_academic.py::_projekt_uziemienia_sieci`, ocena ferrorezonansu TRV, `v126_gotowosc.py::_warunki_punktu_neutralnego`, `enm/uziemienie_sekcji.py::_b0_sieci` (walidator rozstrojenia, I_C) | każda galwanicznie połączona sieć SN osobno (`V126UziemienieSnInput.sieci`: `galezie_sieci`, `baterie_sieci` z `galezie_sieci_sn`/`baterie_sieci_sn`); B_0 baterii w jedynej prawdzie; ferrorezonans bierze największą Σb·ℓ spośród sieci (najgorszy przypadek, nie sumę); §3.9 |
| (13) profil referencyjny pola ZU | `reference_engine/registry.py::profile_id_for_bay`, pakiet `iec62271` (backend i kopia frontu `ui/sld/reference/iec62271.pack.json`), `docs/sld/REFERENCE_ENGINE_SPEC_V1.md` §4–§5 | rola `ZU` dostała profil `earthing_unit` (ENEA Zeszyt 1 Zał. 13–15: DS → CB → CT → głowica mostu; transformator uziemiający w polu zakazany — jest zespołem modelu); dotąd pole ZU z aparatami nie podlegało żadnej kontroli. Przy okazji tabela profili specyfikacji dostała brakujący wiersz `capacitor_bank` karty BKR. Lustro frontu `referenceProfileIdForFieldRole`: `EARTHING_UNIT` → `earthing_unit` (wiersz 14) |
| (15) rola ZU w kreatorze pola SN i rodzaj pola katalogowego | `ui2/kreatory/pole/polaSnModel.ts` (`ROLE_KOLEJNOSC`, `bayKindZRoli`), `network_model/catalog/switchgear/complete_mv_bay_template.py` (`BayKind`, opis rodzaju), `catalog/bay_templates.py::FIELD_TYPES_WITHOUT_TEMPLATE`, `reference_engine/compliance.py::_BAY_ROLE_TO_FAMILY_BAY_KIND`, front `ui/catalog/BayTemplatePicker.tsx`, `ui2/kreatory/stacja/konfiguratorRozdzielnicy.ts::ROLA_Z_FUNKCJI_POLA` | kreator pola SN nie oferował roli ZU (test „każda rola z jednej listy ról modelu” czerwony na drzewie scalonym), a `bayKindZRoli` dawałby dla ZU rodzaj liniowy odpływowy (szablony pól liniowych producentów). Teraz rodzaj pola katalogowego `zespol_uziemiajacy` (rola kanonu `ZESPOL_UZIEMIAJACY`), jawnie bez szablonu w katalogu (rejestr braków, fikstura katalogu konfiguracji pól zregenerowana generatorem `gen_field_configurations_catalog.py`), bez roli operacji stacyjnej SN/nN; kreator oferuje ZU, zespół dodaje kreator zespołu uziemiającego na zacisku pola |
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

Znaleziska zgłoszone, nienaprawione w tej karcie (z uzasadnieniem):

- Katalog kabli (63 pozycje) i linii (26) nie niesie pojemności zerowej (b0/C0). Bez niej
  I_C, rozstrojenie i projekt uziemienia V12.6 są liczalne wyłącznie, gdy projektant wpisze
  B0 odcinka. Propozycja: wartość robocza C0 = C1 dla kabli z żyłami ekranowanymi
  indywidualnie (pole promieniowe, IEC 60502-2), relacja inżynierska dla linii, wyprowadzana
  przy materializacji z częstotliwością przypadku (karta W3-F: częstotliwość nie jest
  własnością katalogu). Zmienia materializację wszystkich odcinków i złote wyniki 1F/2FG —
  to osobna decyzja architekta (B-01 materializacji), nie zakres składowej zerowej ZU.
- V12.6 TRV: `breaker_rated_voltage_kv` przyjmuje domyślnie najwyższe napięcie szyny modelu
  (ta sama klasa co dawne U_l projektu uziemienia), ale poza zakresem B-01 tej karty
  („zmiany tylko w zakresie składowej zerowej i Z_N").
- Rozpływ niesymetryczny: odbiór faza–N w sieci SN za YNd11 dostaje odmowę „brak drogi I0"
  także przy zespole uziemiającym, bo solver BFS (FROZEN) nie ma boczników. Sieci SN
  nie zasilają odbiorów faza–N (odbiory SN to transformatory SN/nN i odbiory trójfazowe),
  więc odmowa nazwana jest poprawnym wynikiem, nie liczbą udawaną.

Świadomie bez zmian: `audit2_validation.py` / `validate-vt-grounding` — walidacja
współczynnika napięciowego przekładnika względem typu punktu neutralnego przyjmuje typ jako
wejście (typ pochodzi z `uziemienie_sieci` przez `audit2_skladanie`); `der_protection_functions.py`
czyta `neutral_grounding_mode` z faktów pola, które wyprowadza `_fakty_pola_wytworcy` z tej
samej prawdy. Biegi scenariuszowe liczą wyłącznie węzeł zwarcia (konstrukcja istniejąca,
nie defekt tej karty).
