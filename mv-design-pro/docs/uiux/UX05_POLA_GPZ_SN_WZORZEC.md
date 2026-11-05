# UX-05 — wzorce pól rozdzielni SN GPZ spoza pola liniowego (Z.7, Z.12, Z.16, Z.17; Z.13–Z.15)

Status: dokument roboczy karty POLA-GPZ-SZABLONY (2026-11-05). Wzorzec pola liniowego (Z.10,
Z.11, Z.11.1) opisuje `UX04_POLE_LINIOWE_WZORZEC.md`; ta sama gramatyka rysunku obowiązuje
pozostałe pola rozdzielni SN GPZ. Porównanie ze źródłem (ENEA Operator, Zeszyt 1, wersja
02.2023 – 2, strony PDF 86 i 92–97): `docs/standards/ENEA_Z1_110KV_SOURCE_VERIFICATION.md`
(ścieżka od korzenia repozytorium) — tam statusy pozycja po pozycji i lista rozbieżności.

## 1. Źródło danych wzorca (jedno)

| Dana | Miejsce w kodzie |
|---|---|
| Sekwencja aparatów od szyny, oznaczenia, podstawa każdej pozycji | `backend/src/network_model/catalog/bay_templates.py` — `BAY_TEMPLATE_GPZ_TRANSFORMATOR_Z7`, `BAY_TEMPLATE_GPZ_LACZNIK_SZYN_Z12`, `BAY_TEMPLATE_GPZ_BKR_Z16`, `BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17` (`BAY_TEMPLATES_GPZ_POLA`) |
| Tabliczki przekładników prądowych (rdzenie, warianty przekładni z gwiazdką) | `mv_auxiliary_catalog.py` — `ct_typ_ogolny_osd_{1000,1600,800,1200}_5_5_5_5_z7`, `ct_typ_ogolny_osd_{…}_5_5_z12`, `ct_typ_ogolny_osd_100_5_5_5_z16`; `_WARIANTY_PRZEKLADNI_TRANSFORMATORA` |
| Uzwojenia przekładnika napięciowego Z.7 | `bay_templates.UZWOJENIA_VT_POLA_TRANSFORMATORA_Z7` |
| Funkcje EAZ, wejścia (rdzeń / uzwojenie / sygnał), wyjścia, napędy, sygnały, odbiorniki obwodów | `obwody_wtorne_pola.OBWODY_WTORNE_POL_GPZ` (`_OBWODY_Z7`, `_OBWODY_Z12`, `_OBWODY_Z16`) |
| Profil składu i kolejności pola (Reference Engine) | `reference_engine/packs/iec62271/pack.json` — `transformer_breaker`, `coupler`, `capacitor_bank` (lustro frontu `frontend/src/ui/sld/reference/iec62271.pack.json`) |

Przekładnia z gwiazdką (Z.7, Z.12) to wartość robocza 1000/5 (ZASADA NR 4): projektant wybiera
wariant swojego transformatora w wyposażeniu pola, źródło wariantu jest w nazwie i notatce
pozycji katalogu.

## 2. Macierz aparat → rodzaj ENM → porty → symbol EN 60617 (QET)

Porty: `rodzaje_aparatury.PORTY_APARATU_POLA`; symbol: `apparatusSequence.SYMBOL_QET_RODZAJU`.

| Aparat (rysunek) | Rodzaj ENM | Porty | Symbol QET | Pola |
|---|---|---|---|---|
| wskaźnik napięcia (PF0/PF1/PF2) | `VOLTAGE_INDICATOR` | przyłącze | `qetVoltageIndicator` | Z.7, Z.12, Z.16, Z.17 |
| łącznik trójpołożeniowy z napędem (Q1, Q2) | `THREE_POSITION_SWITCH` | wejście, wyjście | `qetThreePositionSwitch` | wszystkie |
| łącznik odgałęzienia przekładnika napięciowego (Q5) | `THREE_POSITION_SWITCH` w odgałęzieniu `pn` | wejście, wyjście | `qetThreePositionSwitch` | Z.7 |
| wyłącznik z napędem M (Q0) | `CB` | wejście, wyjście | `qetBreaker` | Z.7, Z.12, Z.16 |
| przekładnik prądowy (T1) | `CT` | wejście, wyjście | `qetCurrentTransformer` | Z.7, Z.12, Z.16 |
| przekładnik napięciowy (T3, T1 w Z.17) | `VT` | przyłącze | `qetVoltageTransformer` | Z.7, Z.17 |
| złącze kablowe (GK, GK1) | `CABLE_HEAD` | wejście, wyjście | `qetCableHead` | Z.7, Z.16, Z.17 |
| ogranicznik przepięć (F1) | `SURGE_ARRESTER` (`earthing_role = surge_ground`) | przyłącze | symbol kanoniczny | Z.7, Z.16 |
| przekładnik napięciowy międzyfazowy (T4, T5) | `PHASE_TO_PHASE_VT` | faza A, faza B | znak w glifie baterii `capacitorBank` (dwa okręgi, L1-L2 po lewej, L2-L3 po prawej; poza osią toru) | Z.16 |
| przekładnik niezrównoważenia (T6) | `UNBALANCE_CT` | obwód | okrąg na połączeniu punktów gwiazd w glifie baterii | Z.16 |

## 3. Gramatyka rysunku (stan i braki)

- Opisy aparatów i przekładników stoją po LEWEJ stronie symbolu (werdykt właściciela B-02 dla
  pola liniowego); rozszerzenie `pasOpisowPrzekladnikowLewy` na kolumnę odgałęzienia prowadzi
  karta pola liniowego (drzewo `wt-pole`) — w tym drzewie jeszcze nieprzeniesione.
- Przekładniki międzyfazowe T4/T5 pola Z.16 stoją na zaciskach baterii (s.96), nie w odczepie
  toru: rysuje je glif baterii z liczby rekordów `PHASE_TO_PHASE_VT` pola
  (`v2/model/bateriaPola.ts`, `BateriaPolaView.przekladnikiMiedzyfazowe`).
- Pole łącznika szyn (Z.12) rysuje się pionowo: sekcja A u góry, B u dołu; łącznik
  trójpołożeniowy uziemia stronę wyłącznika (sworzeń noża od strony wyłącznika na s.92). Błędna
  stała `PORT_UZIEMIANY_LACZNIKA_TROJPOLOZENIOWEGO = PORT_WYJSCIA` (bez konsumentów) skasowana;
  rysunek pionowy i rekord pola związany z gałęzią `bus_coupler` (D3) — niewykonane.
- Pole transformatora (Z.7) w wieży transformatora: ta sama gramatyka co pole liniowe
  (`compose/gpz.ts`, przewody z portów, węzeł odczepu poza kaflem) — decyzja D2, niewykonana.

## 4. Pola zespołu uziemiającego Z.13–Z.15

Wykonane: bloker walidatora E-W5-04 „dwa uziemione nośniki
punktu neutralnego w jednej wyspie galwanicznej SN” (`backend/src/enm/nosniki_punktu_neutralnego.py`,
test iloczynu `backend/tests/enm/test_jeden_nosnik_punktu_neutralnego.py`) i pole AWSC
`GroundingConfig.awsc_prad_wymuszenia_a` z predykatem `blad_konfiguracji_uziemienia`. Brak do
rozstrzygnięcia przy szablonach: grupa ZNyn11 (Zeszyt 1 §16) nie należy do słownika
`enm/grupa_polaczen.py`, choć model składowej zerowej obsługuje zygzak po stronie górnej.
Stan 2026-11-05 (następca 4): ZNyn11 jest w słowniku (z parami Zd/Zy), para przeniesienia
i oddania punktu neutralnego — `backend/src/enm/zespol_uziemiajacy.py` (test iloczynu
`backend/tests/enm/test_zespol_uziemiajacy.py`), sonda składowej zerowej —
`backend/tests/enm/test_sonda_transformatora_uziemiajacego.py`. Niewykonane: rola pola „ZU”,
szablony Z.13–Z.15, wpięcie pary w operacje pola, rysunek pola ZU.
Stan 2026-11-05 (następca 5): rola pola `ZU` („Pole zespołu uziemiającego”, kanon
`enm/rola_pola_sn.py`) wpięta w słownik ról modelu i jego lustra (`types/enm.ts BAY_MODEL_ROLES`,
`FIELD_ROLE.EARTHING_UNIT`, rola tła GPZ `uziemiajace` z kolorem w obu motywach i eksporcie,
kategoria rodzaju stacji, rodzaj pola katalogowego `zespol_uziemiajacy`, profil pakietu
iec62271 `earthing_unit`, mapa compliance, kreator pola SN); szablony
`bay_template_gpz_zespol_uziemiajacy_{dlawik_enea_z13, dlawik_rezystor_enea_z14,
rezystor_enea_z15}` z obwodami wtórnymi `OBWODY_WTORNE_POL_GPZ["Z13"|"Z14"|"Z15"]`; katalog CT
`ct_typ_ogolny_osd_100_5_z13` (100/5 A, I 15 VA 5P20) i transformatorów uziemiających
`tu-sn-nn-{15,20}-04-100kva-znyn11`. `add_sn_bay` z rolą ZU tworzy jedną operacją pole,
transformator ZNyn11 (zacisk SN = zacisk pola, szyna potrzeb własnych 0,4 kV) i przenosi punkt
neutralny; `set_bay_equipment` szablonem innego wariantu zmienia nośnik; `delete_element`
transformatora (wprost albo kaskadą szyny) oddaje go źródłu i zabiera pustą szynę potrzeb
własnych. Test iloczynu `backend/tests/enm/test_pole_zespolu_uziemiajacego.py`. Rysunek pola ZU
(gałąź punktu neutralnego z nośnika) — niewykonany u następcy 5 (wykonany niżej, następca 7); wzorzec opisów po lewej (pas oznaczeń
z kolumną przekładni, kolumna odgałęzienia przy torze, ramka zabezpieczeń zaraz za nią —
wzór właściciela 2026-11-05) obowiązuje także pola Z.12–Z.16 i czeka na commit pasa oznaczeń
z drzewa `wt-pole`.
Stan 2026-11-05 (następca 7) — rysunek pola ZU z nośnika i W041:
- Transformator uziemiający należy do pola ZU wtedy i tylko wtedy, gdy zapis pary
  `Transformer.meta.zespol_uziemiajacy.bay_ref` wskazuje ISTNIEJĄCE pole roli ZU — JEDNA funkcja
  po każdej stronie: `enm/pole_transformatorowe.py::pole_zespolu_transformatora` (backend: W041
  i brama dokumentacji wykonawczej) i jej lustro
  `ui/shared/transformatoryStacji.ts::poleZespoluTransformatora` (rysunek: marker braku pola TR,
  wieże GPZ, rysunek pola ZU). Taki transformator nie jest transformatorem rozdzielczym stacji —
  nie dostaje fałszywego W041 ani markera. Parytet: wiersze `tr-uziemiajacy-*` i
  `tr-rozdzielczy-obok-pola-zu` tablicy `backend/schemas/pole_transformatorowe_parytet_v1.json`
  (iloczyn {zapis jest, brak} × {pole ZU jest, brak, pole innej roli}). Napotkane i naprawione:
  ścieżka awaryjna `stationTransformerSelection.ts` (refy `transformer_refs` bez rekordu)
  przywracała ref transformatora, którego rekord ISTNIEJE, a reguła go wykluczyła — także
  transformator blokowy DER z rolą katalogową.
- Rysunek pola ZU (`compose/gpz.ts::ogonZespoluUziemiajacego`, widok
  `v2/model/zespolUziemiajacyPola.ts`): tor pola z rekordów aparatów (Q1, Q0, T1 z P1/P2,
  ogranicznik F1) → transformator ZNyn11 (uzwojenia z grupy połączeń modelu; zacisk
  `punktNeutralny` symbolu `transformer2W` i wyprowadzenie punktu neutralnego tylko przy zygzaku
  z „N”) → od punktu neutralnego w prawo węzeł z ogranicznikiem przepięć do ziemi i gałęzie wg
  wariantu zapisu: Z.13 — odłącznik → dławik (podpis X_N i AWSC z nośnika), Z.14 — gałąź dławika
  ∥ gałąź rezystora, Z.15 — odłącznik → przekładnik prądowy T2 → rezystor (podpis R_N); strona
  dolna → odbiór „potrzeby własne 0,4 kV” (napięcie szyny potrzeb własnych z modelu). Źródło-dawca
  punktu neutralnego nie dostaje już glifu przy sekcji (sieć nie jest izolowana — uziemia ją
  zespół). Test iloczynu `v2/model/__tests__/zespolUziemiajacyPola.test.ts`; zrzuty
  `docs/uiux/zrzuty/pola-gpz/`.
- Różnice wobec stron 93–95, zostawione świadomie i nazwane: przekładnik T2 gałęzi rezystora stoi
  NAD rezystorem (glif `neutralEarthing` łączy aparat z uziomem, więc przekładnik pod rezystorem
  wymagałby osobnego glifu uziomu); w Z.13 AWSC i regulator dławika są podpisem przy dławiku, nie
  rysunkiem uzwojenia 500 V z rezystorem i stycznikiem; CT w uziemieniu dławika Z.13 (połączony
  wyłącznie z regulatorem) nie jest rysowany; ogranicznik przepięć punktu neutralnego wisi w dół
  z węzła, bez osobnego odłącznika. Werdykt B-02: właściciel.
- Opisy po lewej: drzewo `wt-pole` nie ma commitu kolumny opisów poza `9dafb6083` (P1/P2
  i przekładnie toru głównego po lewej, `pasOpisowPrzekladnikowLewy`), który jest już w tej
  gałęzi — tor pola ZU korzysta z niej bez zmian. Podpisy ogona ZU (wartości gałęzi, T2) stoją
  po PRAWEJ swoich symboli, jak podpisy kolumny odgałęzienia; tabliczka transformatora — po
  lewej. Punkt integracji przyszłej kolumny oznaczeń: `fieldDesignations` ogona
  (`ogonZespoluUziemiajacego`) — te same wejścia etykiet co reszta pola.
- Niewykonane: pole ZU w stacji SN/nN (rola ZU nie jest zawężona do GPZ, a blok stacji
  `compose/station.ts` nie rysuje ogona ZU).

Rozstrzygnięcie architekta D1: transformator uziemiający (ZNyn11, uzwojenie
potrzeb własnych 400/230 V AC) jest elementem `Transformer` pola; dławik i rezystor rysuje się
z nośnika punktu neutralnego `hv_neutral` (`GroundingConfig`: `petersen_coil` z X_N,
`resistor_grounded` z R_N, rezystor wymuszający AWSC — `awsc_prad_wymuszenia_a` karty zwarć
doziemnych). Dane rysunków: raport źródłowy §4.4.

## 5. Statusy

Dane szablonów Z.7, Z.12, Z.16 i obwodów wtórnych: zweryfikowane ze źródłem (raport §4.1–4.3,
test `backend/tests/network_model/catalog/test_pola_gpz_zrodlo_enea.py`). Rysunek SLD tych pól,
zrzuty żywej aplikacji i werdykt wizualny (B-02): niewykonane w tej karcie.
