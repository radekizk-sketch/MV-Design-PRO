# Łańcuch danych aparatury pól GPZ H5 i inwentarz układu 1×3

Stan analizowany: wt-h5b (gałąź uiux-gpz-h5-backend-v2, 88557ceb7). Ścieżki: B = wt-h5b: mv-design-pro/backend/src, F = .../frontend/src, T = .../backend/tests. Tylko odczyt; pomiary grepem/sed/regex (nie uruchamiałem Pythona z importem pakietu: brak `networkx` w środowisku, więc liczności katalogu są z regexu po źródle, nie z `get_all_*()`).

## WNIOSEK (5 zdań)
1. Katalog ma aparaturę wyłącznie do 24 kV (ograniczniki do 36 kV): ZERO pozycji 110 kV (wyłącznik, odłącznik, uziemnik, CT, VT, ogranicznik) oraz ZERO pozycji SN dla zespołu uziemiającego (transformator uziemiający/dławik/rezystor jako aparat pola) — to blokuje „rzeczywistą aparaturę z katalogu” w polach 110 kV H5.
2. ENM ma nośnik (`Bay.primary_devices`, operacja `set_bay_equipment`), ale ta operacja przyjmuje tylko 10 rodzajów aparatu, bierze `catalog_ref` z katalogu SN bez sprawdzenia napięcia i NIE ma rozróżnienia „wymagane standardem / zaprojektowane / brakujące” (są tylko MODEL / PROPOZYCJA / BRAK_DANYCH).
3. `hv_bay_apparatus_proposal` zapisuje do `meta.apparatus_proposal` samą listę oznaczeń tekstowych (OSZ(U), W, PIU, OL(U), OGR…) z `modelled: False`; nic w backendzie ani froncie jej nie czyta (grep poniżej) — to martwy zapis, nie lista „wymagane standardem”.
4. Weryfikacja wytrzymałości aparatury czyta gałęzie łącznikowe z wiązaniem APARAT_SN, NIE `Bay.primary_devices` — dwa źródła „jaki aparat stoi w polu”.
5. Układ 1×3 (1 sekcja 110 kV × 3 TR) nie jest szablonem galerii (szablony H5: max 2 TR), ale jest osiągalny przez kreator źródła (MAX 4 TR) i przez operację (brak górnego limitu wpisów `transformers`), jest pinowany testami i e2e; kreator źródła we froncie wysyła jeszcze stare klucze `transformer_count` / `hv_voltage_kv`, które backend H5 odmawia (potwierdzone czytaniem kodu, nie uruchomieniem).

---
## 1. KATALOG

### 1a. Aparatura łączeniowa (przestrzeń APARAT_SN)
- Typ źródłowy: `SwitchEquipmentType` B/network_model/catalog/types.py:1477-1570 (pola: id, name, manufacturer, equipment_kind, un_kv, in_a, ik_ka, icw_ka, medium, u_m_kv, i_cu_ka, … — `u_m_kv`/`i_cu_ka` opis w docstringu l.1494+). Rekordy: B/network_model/catalog/mv_switch_catalog.py (1153 l.).
- Rodzaje (regex `equipment_kind` w pliku, razem ze słownikami i wywołaniami `_polish_switch`): CIRCUIT_BREAKER ≈20 (12 w słownikach + 8 `_polish_switch`), LOAD_SWITCH ≈9, DISCONNECTOR ≈6, EARTH_SWITCH 2 (`sw-es-generic-12kv` l.836, `sw-es-generic-17kv` l.855), FUSE 7, RECLOSER 4. Liczby przybliżone (regex, nie import).
- Napięcia: un_kv ∈ {12; 15; 17,5; 24} — zmierzone `grep -hoE "un_kv(=|\": )[0-9.]+"` : 15×12,0 + 6×12,0; 1×15,0; 11×17,5; 9×24,0 + 6×24,0. Maksimum 24 kV. Brak 110 kV (grep `110|123|145` w mv_switch_catalog.py: 0 trafień dla napięć).
- Projekcja do `MVApparatusType` (B/network_model/catalog/types.py:2899-2940; pola: device_kind, u_n_kv, i_n_a, breaking_capacity_ka, making_capacity_ka, i_th_ka, i_th_duration_s, i_dyn_ka): mapa rodzaj→device_kind w B/network_model/catalog/repository.py:166-173 (CIRCUIT_BREAKER→WYLACZNIK, DISCONNECTOR→ODLACZNIK, EARTH_SWITCH→UZIEMNIK, LOAD_SWITCH→ROZLACZNIK, FUSE→ROZLACZNIK_BEZPIECZNIKOWY, RECLOSER→REKLOZER).

### 1b. Przekładniki
- CT: `CTType` types.py:3622-3700 (ratio_primary_a, ratio_secondary_a, accuracy_class, burden_va, ith_ka_1s, idyn_ka_peak, fs_safety_factor, rct_ohm) — BRAK pola napięcia izolacji/U_m. 12 rekordów `ct_*` w B/network_model/catalog/mv_auxiliary_catalog.py:1351-1552 (przekładnie 50…2000 A). Typ CT nie nadaje się do wyboru „klasy 110 kV” — nie niesie napięcia.
- VT: `VTType` types.py:3777-3830 (ratio_primary_v, ratio_secondary_v, accuracy_class, accuracy_class_metering, F_v…). 13 rekordów `vt_*` mv_auxiliary_catalog.py:1609-1852; ratio_primary_v ∈ {5773,5; 8660,3; 10 000; 11 547; 13 856,4; 15 000; 20 000; 24 000}. Brak 110/√3 kV (63 509 V).
### 1c. Ogranicznik przepięć
- `SurgeArresterType` types.py:1997-2030; 12 rekordów (`grep -c "arrester-"` = 12) B/network_model/catalog/mv_surge_arrester_catalog.py:63-207; u_m_kv ∈ {12; 17,5; 24; 36}. Brak 110 kV.
### 1d. Bateria kondensatorów SN
- `ShuntCapacitorType` types.py:2754; 5 rekordów mv_shunt_capacitor_catalog.py:51-79 (rated_mvar, rated_kv 15/20, loss_kw). Operacja `add_shunt_compensator_sn` (B/enm/domain_operations_v2.py:7068) stawia ją na SZYNIE (`bus_ref`), nie na polu CAPACITOR.
### 1e. Zespół uziemiający (ZU), transformator uziemiający, dławik/rezystor
- Istnieje tylko `MvNeutralGroundingItem` B/network_model/catalog/audit2_catalogs.py:1176-1260 (mng_isolated, mng_petersen, mng_resistor_low 7 Ω, mng_resistor_medium 40 Ω, mng_directly): to WARIANT SPOSOBU UZIEMIENIA (typ + R/X), nie aparat/transformator uziemiający. `GroundingConfig` B/enm/models.py:45-52 (type, r_ohm, x_ohm) jest nośnikiem na `Transformer.hv_neutral/lv_neutral` i `Source.neutral_grounding`.
- Grep `uziemiając|zygzak|earthing_transformer|grounding_transformer` w B/enm i B/application: tylko komentarze/komunikaty (enm/rola_pola_sn.py:36,59; domain_operations.py:4383,5651; validator.py:2895,3013; assembler.py:1137; mapping.py:669; apply.py:254) — ŻADNEGO typu katalogowego ZU, żadnego elementu ENM. Model Z0 transformatora (zygzak) jest tylko w solverze: B/enm/zero_sequence_transformer.py.
### 1f. Szablony pól / BOM rodziny
- Szablony kanoniczne pola: B/network_model/catalog/bay_templates.py:83-338 (LINE_IN, LINE_OUT, TRANSFORMER, MEASUREMENT, COUPLER, DER_PV/BESS/FW, RESERVE, AUX). Brak szablonów dla ról EARTHING i CAPACITOR, brak szablonów pól 110 kV (BAY_TEMPLATE_REGISTRY l.338-352). `BAY_PRIMARY_APPARATUS_KINDS_BY_ROLE` l.211-218 (IN/OUT/FEEDER/TR/COUPLER/MEASUREMENT/OZE) — też bez EARTHING/CAPACITOR.
- Słownik rodzajów aparatu: B/network_model/catalog/switchgear/apparatus_vocabulary.py (kindy: CB, DS_BUS, DS_LINE, ES, CT, VT, FUSE, SURGE_ARRESTER, CABLE_HEAD, TRANSFORMER_DEVICE).
### 1g. Brakuje w katalogu (fakt z pomiarów wyżej)
wyłącznik/odłącznik/uziemnik 110 kV; CT 110 kV (i pole napięcia w `CTType`); VT 110 kV; ogranicznik 110 kV; odłącznik z uziemnikiem OSZ(U)/OL(U)/OS(U) jako para; transformator uziemiający (ZU) i jego impedancja Z0; dławik/rezystor uziemiający jako aparat pola; pozycja „pole 110 kV” (rodzina rozdzielnicy 110 kV) w `switchgear/families.py` (grep `110` w families.py: 0 trafień). Nie sprawdzałem: zawartości `switchgear/registry.py` poza powyższym grepem.

---
## 2. ENM

- Pole: `Bay` B/enm/models.py:1253-1366; role `bay_role` ∈ IN, OUT, TR, COUPLER, FEEDER, MEASUREMENT, OZE, EARTHING, CAPACITOR (l.1274-1276). Nośniki aparatury: `primary_devices: list[BayPrimaryDevice]` (l.1366), `equipment_refs` (gałęzie/elementy), `surge_arresters` (l.1304), `catalog_bindings`, `apparatus_catalog_ref`, `switchgear_family_ref`, `bay_template_ref`.
- `BayPrimaryDevice` B/enm/models.py:1398-1442: kind ∈ CB, LOAD_SWITCH, DS, ES, CT, VT, CABLE_HEAD, TRANSFORMER_DEVICE, FUSE, GENERATOR_*, PCS, BATTERY, SURGE_ARRESTER; pola: device_ref, linked_ref, catalog_ref, designation (oznaczenie projektowe), placement, switch_state, earthing_role. Brak pola „status wymagalności” (wymagane/zaprojektowane/brakujące).
- Elementy CT/VT jako osobne byty: `Measurement` models.py:854-900 (measurement_type CT|VT, bus_ref, bay_ref, rating, catalog_ref, materialized_params, obwod_wtorny); `ProtectionAssignment` models.py:950-990 (breaker_ref, ct_ref, vt_ref, ct_refs_secondary). Operacje: `add_ct` B/enm/domain_operations_v2.py:646, `add_vt` :858, `set_measurement_secondary_circuit` :1023, `add_surge_arrester_sn` :7443 (zapis na `Bay.surge_arresters`), `attach_protection` B/enm/topology_ops.py:1033, `add_shunt_compensator_sn` :7068.
- Operacja wyposażenia pola: `set_bay_equipment` B/enm/wyposazenie_pola.py:363 (tryby katalog/szablon/wyczysc). Rodzaje przyjmowane: PRZESTRZEN_KATALOGU_APARATU l.70-78 (CB/LOAD_SWITCH/DS/ES→APARAT_SN, CT→CT, VT→VT, SURGE_ARRESTER→OGRANICZNIK_SN) + RODZAJE_BEZ_KATALOGU_SN l.91 (FUSE, CABLE_HEAD, TRANSFORMER_DEVICE bez `catalog_ref`). Odmawia pole nN (`bay_equipment.bay_not_mv` l.378-383) — pole 110 kV przechodzi tę bramę (110 kV nie jest nN), więc technicznie można wyposażyć pole 110 kV. Ale: (a) brama istnienia `_pozycja_katalogu` (l.300-313) nie sprawdza napięcia pozycji względem szyny pola — można podpiąć wyłącznik 12 kV do pola 110 kV; docstring l.46-53 jawnie zostawia dobór warstwie analizy; (b) nie ma rodzajów dla ZU, dławika, rezystora, baterii kondensatorów — pola EARTHING/CAPACITOR nie mogą dziś nieść żadnego z ich właściwych aparatów (ES/CB/CT/VT/SURGE_ARRESTER formalnie by przeszły, ale bez przekładni „ZU”).
- Stany danych aparatu: `stan_danych_aparatu` wyprowadza z `catalog_ref`: MODEL (jest ref) / PROPOZYCJA (rodzaj bez katalogu SN, wartość robocza ESTIMATED) / BRAK_DANYCH (pole bez aparatów) — wyposazenie_pola.py:120-160, typ `StanDanychAparatu` l.64. To jest jedyna istniejąca „trójka”; NIE jest to „wymagane standardem / zaprojektowane / brakujące”.
- Pola GPZ H5 w `add_grid_source_sn` (B/enm/domain_operations.py:4439+): pola struktury 110 kV i SN budowane przez `_pole_struktury` (l.5530-5560) `equipment_refs=[]` albo [trafo_ref]; komentarz l.5528: „BEZ aparatów domyślnych (karta K3) — aparat wybiera projektant”. Pole liniowe SN GPZ dostaje aparat z `_aparaty_i_konfiguracja_pola` (l.5486-5491). Pola funkcyjne EARTHING/CAPACITOR/MEASUREMENT (l.5651-5668) „BEZ aparatów i bez elementów”; MEASUREMENT dostaje tylko `funkcja_pomiaru="NAPIECIA_SZYN"` — bez VT.
- `hv_bay_apparatus_proposal`: parsowanie `_propozycja_aparatow_110` domain_operations.py:4407-4444 (klucze `line`/`transformer`/`coupler` + `basis`, listy niepustych STRINGÓW); zapis `_meta_propozycji` l.5563-5572: `meta.apparatus_proposal = {basis, apparatus:[oznaczenia], modelled: False}` na polach 110 kV (liniowe l.5573-5583, transformatorowe l.5584-5598, łącznika hv l.5615-5650). Treść źródłowa: PROPOZYCJA_APARATOW_110_H5 B/application/station_templates/templates/gpz_110_sn.py:137-142 (line: OSZ(U), W, PIU, OL(U), OGR; transformer: OSZ(U), W, PIU, OGR; coupler: OS(U), W, PIU, (U)OS), wpinana apply.py:290.
  - Znaczenie `modelled=False`: propozycja szablonu, NIE aparaty modelu; obliczenia jej nie czytają (docstring l.4408-4412). Pole 110 kV nie ma przez to ani jednego `BayPrimaryDevice`.
  - Pomiar braku konsumentów: `grep -rn "apparatus_proposal\|apparatusProposal\|hv_bay_apparatus_proposal"` w B (poza *.pyc): enm/domain_ops_models.py:833, enm/domain_operations.py:4408-4419,5566, enm/slownik_komunikatow.py:228, application/station_templates/apply.py:290 (+46), domain/canonical_operations.py:98 — wyłącznie zapis/walidacja. W F (ts/tsx): `grep` = 0 trafień poza typami `types/domainOps.ts`, `types/enm.ts` i fiksturami JSON. Brak odczytu w SLD/raporcie/solverze. Nie sprawdzałem: czy pole `meta` jest renderowane ogólnym panelem inspektora.
  - Oznaczenia w propozycji („OSZ(U)”, „PIU”, „OGR”) to wolny tekst, bez powiązania z `catalog_ref` ani z rodzajami `BayPrimaryDevice.kind`; nie ma mapowania PIU→CT, OGR→SURGE_ARRESTER, OSZ(U)→DS+ES.

---
## 3. KONFIGURATOR / KREATOR / SZABLONY

- Szablony GPZ: B/application/station_templates/templates/gpz_110_sn.py. Trzy „równoważnik SN” (`tpl_gpz_sn_15_2s_4p`, `_6p`, `tpl_gpz_sn_20_2s_4p`, l.263-330) i dwa H5 (`tpl_gpz_h5_110_15_2x25mva`, `tpl_gpz_h5_110_20_2x25mva`, l.266-300+): `transformer_count` min 1 max 2 (l.225-230), `sn_bay_roles` 8 pozycji (TR×2, FEEDER×2, EARTHING, CAPACITOR, MEASUREMENT, COUPLER; l.236-245), `sn_bay_apparatus_options` = SN_APPARATUS_OPTIONS (wyłączniki SN, l.248), `dane_projektu=DANE_PROJEKTU_H5`. Jedyny wybór aparatury w szablonie: wyłącznik pola SN (`gpz_line_field_apparatus`, apply.py ~226-238) i wyłącznik transformatora rezerwowego (`reserve_transformer_apparatus`, gpz_110_sn.py:120-130). Nie ma wyboru aparatów pól 110 kV, przekładników, ZU, baterii.
- Zatem „komplet aparatów pola H5 z katalogu” w szablonie/kreatorze DZIŚ nie istnieje; z katalogu SN da się wyposażyć pole SN operacją `set_bay_equipment`, a pole 110 kV tylko aparatami SN-owymi (patrz 1g).
- Frontend: edytor wyposażenia pola F/ui/field/EdytorWyposazeniaPola.tsx + F/ui/field/wyposazeniePola.ts (lustro stałych backendu: tablice l.35-70; rodzaje ograniczone do 10), wejście z F/ui/workspace/surfaces/BayConfiguratorSurface.tsx i operationFormRegistry.tsx. Kreator źródła F/ui2/kreatory/zrodlo/{KreatorZrodloZasilania.tsx,zrodloModel.ts}: `MAX_TRANSFORMATOROW = 4` (zrodloModel.ts:36), payload buduje `transformer_count`, `transformer_catalog_ref`, `hv_voltage_kv`, `transformer_*` (zrodloModel.ts:743-760) — backend H5 te klucze odmawia (B/enm/domain_operations.py:778-793 `_klucze_transformatorow_gpz`: każdy klucz `transformer_*` i `hv_voltage_kv` najwyższego poziomu → odmowa). Kreator nie zna `hv_sections`, `transformers`, `hv_coupler`, `sn_coupler`, `function_bays`, `reserve_mode` (grep w zrodloModel.ts = 0). Wniosek (z czytania kodu, nie z uruchomienia): kreator źródła w trybie 110 kV jest niezgodny z operacją H5.
- Galeria szablonów: F/ui/network-build/station-templates/StationTemplateWizard.tsx (suwak `transformer_count` l.566-570 z min/max ze schematu → dla H5 1..2), F/ui2/kreatory/stacja/KreatorStacjiSnNn.tsx i F/ui2/spaces/model/szablony/*. Galeria jest sterowana API `GET /api/station-templates`, więc zawiera tylko szablony backendu.

---
## 4. KONSUMENCI APARATURY POLA

- Solver zwarć: łącznik nie ma impedancji. B/enm/mapping.py:1394-1402 mapuje `SwitchBranch` na `Switch` (SwitchType BREAKER/LOAD_SWITCH/DISCONNECTOR), `Switch` bez impedancji (types.py:1480 „Switches have NO impedance”). `grep -niE "switch|breaker|aparat"` w short_circuit_core.py i short_circuit_iec60909.py: jedyny trafiony wiersz to komentarz short_circuit_iec60909.py:1009 (o niezastosowaniu do doboru). CT/VT/ogranicznik/ZU nie wchodzą do sieci zwarciowej poprzez `primary_devices` (jedyny konsument solverowy `primary_devices`: B/solver_input/v126_contracts.py:398-404 — ograniczniki SURGE_ARRESTER do koordynacji izolacji IEC 60071).
- Dobór/wytrzymałość aparatury: czytelnik B/application/analyses/aparaty_pol.py:118-142 `aparaty_pol_stacji` czyta GAŁĘZIE (`branch.catalog_namespace == APARAT_SN`, `meta.bay_ref|field_ref`), NIE `Bay.primary_devices`. Werdykty (I_dyn/I_th/I_cu): B/application/analyses/wytrzymalosc_aparatury_pol.py (wiersze l.1005-1268), `resolve_um_icu_from_catalog` B/application/equipment_proof/catalog_bridge.py:63-100, dowód B/application/equipment_proof/generator.py:131-189,400-522. Skutek: aparat wpisany `set_bay_equipment` z `catalog_ref` (MODEL) nie wchodzi do werdyktu wytrzymałości, jeśli nie ma odpowiadającej gałęzi z wiązaniem — dwa źródła prawdy „co stoi w polu” (dług klasy „dwie ścieżki”). Pola 110 kV H5: `equipment_refs=[]`, więc zero gałęzi aparatu → brak wierszy werdyktu dla 110 kV. `grep u_m_kv` w wytrzymalosc_aparatury_pol.py: 0 trafień (zgodność U_m aparatu z napięciem szyny nie jest tam porównywana; nie sprawdzałem generatora dowodowego pod tym kątem).
- Zabezpieczenia: `ProtectionAssignment.ct_ref` → `Measurement` (B/application/analyses/protection/ocena_nadpradowa.py:459-473 szuka `enm.measurements`), jądro nasycenia CT B/network_model/solvers/equipment_checks/ct_burden_saturation.py (import l.83). CT w `Bay.primary_devices` (kind CT) nie jest tym samym obiektem co `Measurement` — drugi podział. API doboru przekładnika: B/api/generators.py:1106-1165, B/api/equipment_checks.py:123.
- Odczyt pola/SLD/raport: B/application/field_read_model.py:161-215 (`primary_devices` → stan danych `equipment_data_state=stan_danych_wyposazenia`), B/application/topologia_zasilenia.py:332,523,973 (tor zasilania), B/enm/interlock_rules.py:29-108 (blokady uziemnika), B/enm/validator.py:1654, B/reference_engine/compliance.py:136-691 (zgodność z rodziną rozdzielnicy), F/ui/sld/v3/compose/gpz.ts:436 (aparaty modelu → glify).
- White Box: brak śladu aparatury w solverach zwarciowych (łączniki bez impedancji); ślad dla aparatury jest w dowodzie doboru (equipment_proof) i w obwodzie wtórnym CT (ct_burden_saturation).

---
## 5. INWENTARZ UKŁADU 1×3 (1 sekcja 110 kV × 3 TR; w repo także „2 sekcje × 3 TR”)

Definicja robocza: GPZ z jedną szyną/sekcją 110 kV i 3 transformatorami 110/SN. Historia: commit 88e6d8828 (przed H5) dawał jedną wspólną szynę 110 kV i TR1..MAX cyklicznie do sekcji (B/enm/domain_operations.py MAX 4); H5 zastąpił to jawną strukturą (`hv_sections`, `transformers`), ale operacja NIE ma górnego limitu wpisów `transformers` (walidacja tylko zakresu sekcji, domain_operations.py:4346-4363) — 1×3 pozostaje osiągalny.

### 5a. PRODUKT (do usunięcia / zablokowania)
- F/ui2/kreatory/zrodlo/zrodloModel.ts:36 `MAX_TRANSFORMATOROW = 4`; l.225,383-384 (walidacja 1–4), l.744 (payload); F/ui2/kreatory/zrodlo/KreatorZrodloZasilania.tsx:119-125, 846-849 (pole „liczba transformatorów”), l.1095. Kreator jest nośnikiem wyboru 1…4 TR (czyli także 3); dodatkowo niezgodny z H5 (sekcja 3).
- B/enm/domain_operations.py:4323-4366 (`transformers` bez górnego limitu liczby wpisów), :4226-4240 (`hv_sections` 1–4 sekcji). Limit H5 (2 TR / 2 sekcje 110) nie jest egzekwowany operacją; egzekwuje go tylko schemat szablonu (gpz_110_sn.py:225-230 max 2). Operacja dopuszcza 1×3 i 4×N.
- B/application/station_templates/templates/gpz_110_sn.py:225-230 (suwak 1–2) — to NIE jest 1×3 (szablon ograniczony do 2); do ewentualnego dalszego zawężenia, nie do usunięcia.
- F/ui/sld/v3/compose/gpz.ts (wieże TR, układ wielu transformatorów) i F/ui/sld/v2/canvas/enmToCanonicalGpzAdapter.ts — kod ogólny (N transformatorów), nie wariant 1×3; usunięcie wariantu = zablokowanie na wejściu, nie przepisanie rysunku (hipoteza, nie sprawdzałem zakresu zmian w composerze).
- Galeria szablonów: BRAK szablonu 1×3 (zmierzone: 5 szablonów GPZ w gpz_110_sn.py, tpl_gpz_h5_* max 2 TR; zero ze `transformer_count` default 3). Zrzuty/strony odbiorowe z 1×3: nie znalazłem w docs (`find docs -iname "*gpz*"`: obrazy to sld_*/kd5-gpz/walk_03_build_gpz_view, nie weryfikowałem ich zawartości wizualnie). F/harness-fixtures/generated/gpz_h5_przypadek_odbiorowy*.json i geometria_stacji_gpz_110kv.json: zmierzone TR=2, hv=2, sn=2 (python/json) — to H5 2×2, NIE 1×3.

### 5b. TESTY SOLVERA / MODELU (mogą zostać, odseparowane)
- T/enm/test_gpz_granica_zasilania.py: nagłówek l.1-30 (iloczyn {1,2 sekcje}×{1,3 TR}), `_przydzial` l.133-175 (jawny ładunek testowy 3 TR), `ILOCZYN_110KV = [(1,1),(1,3),(2,1),(2,3)]` l.318-321, test rozpływu/zwarć ILOCZYN_ROZPLYWU l.487, ILOCZYN_ZWARCIA l.652, ILOCZYN_E066 l.721, ILOCZYN_TR_BLOKOWEGO l.890, l.697 (3 TR równolegle ≈ 23,5 kA). To jedyny test solwerowy z liczbami IEC 60909 dla 3 TR (Ik″ 23,469/16,781/9,047 kA wg docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10_INWENTARZ.md).
- T/reference_networks/gpz_h5.py:225-241 (`hv_section: min(k, liczba_torow)` — generator ładunków o zmiennej liczbie TR), T/reference_networks/sld_substrate_52s.py:434-451, T/reference_networks/w3g2_pasma_rozplywu.py + T/golden/wyrocznie/test_pandapower_od19_w3g2.py (zależne od wielu TR; nie sprawdzałem liczby TR w w3g2). T/golden/golden_network_sn.py (2 TR, wspólna szyna 110 kV „bus-wn-110”).
### 5c. TESTY PRODUKTU / E2E (do przepisania lub usunięcia z wariantem)
- F/e2e/gpz-parytet-zrzuty-screenshot.spec.ts:19, 256-281 (test „dwie sekcje SN i trzy transformatory”, `siecGpz(... transformatory: 3)`, zrzut `gpz-dwie-sekcje-trzy-tr-*.png`) — materiał zrzutowy z 3 TR.
- F/src/ui/sld/v3/scene/__tests__/buildScene.gpzWiezeTransformatorow.test.ts:20-40 (iloczyn {1,2,3 TR na sekcji}), F/src/ui/sld/v3/compose/__tests__/gpzHvColumn.test.ts, gpz.test.ts.
- F/src/ui2/kreatory/zrodlo/__tests__/KreatorZrodloZasilania.test.tsx:396 (`transformer_count: 3`), __tests__/zrodloModel.test.ts:78,112-118,201-202 (3 i 9→4).
- Inne wystąpienia `transformer_count` w testach front: StationTemplateWizard.test.tsx:76 (max 2), topology-store.test.ts, adapters.test.ts — nie są 1×3.
### 5d. DOKUMENTY
- docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10.md:98 („jedna szyna 110 kV, 3 TR … przypadek zostaje jako test układ rozbudowany — jawny schemat”), docs/plan/KOREKTA_GPZ_H5_ENEA_2026-10_INWENTARZ.md (sekcje 1,9, nagłówek liczb Ik″), docs/uiux/ANALIZA_ODRZUCENIA_UI01_UI02_UI04_2026-10-21.md:34,240,254,640 (GPZ 2 sekcje / 3 TR jako przypadek odbiorczy), docs/ui/wizard_screens.md i docs/sld/CANONICAL_SN_SLD_ENGINEERING_BLUEPRINT.md — trafienia grepem na „trzy transformatory/3 TR” bez potwierdzenia, że opisują 1×3 (nie czytałem). Plik roboczy w wt-h5b: MELDUNEK_W5B.md (nie sprawdzałem treści).
### 5e. Czego nie sprawdziłem w 5
Pełnej listy 195 plików testowych wołających `add_grid_source_sn` pod kątem liczby TR (inwentarz z KOREKTA_..._INWENTARZ.md §9 dotyczy drzewa wt-merge sprzed H5); e2e `siecGpz` (F/e2e/…) pod kątem payloadu; głównego checkoutu główne drzewo (gałąź claude/mv-design-pro-twin-audit-u4lhy0-karta-uiux-przemyslowy, e9b15c265): ma starszy model (`grep -c hv_sections` domain_operations.py = 3, brak enm/rezerwa_gpz.py) — nie analizowany szczegółowo.

---
## 6. ZALEŻNOŚCI OD RDZENI B-01 (scripts/rdzenie_b01.py:42-61)
Lista rdzeni: short_circuit_iec60909.py, short_circuit_core.py, short_circuit_contributions.py; power_flow_newton.py, power_flow_newton_internal.py, power_flow_gauss_seidel.py, power_flow_fast_decoupled.py; protection_iec60255.py; ncrfg_ptpiree/ i catalog/profiles/nc_rfg/; frt_hvrt/; state_estimation_wls.py; phase_state_sn.py; v126_academic.py (wszystkie względem backend/src).
Wymagałyby zgody B-01 (hipotetycznie): (i) nadanie aparatowi pola impedancji/wpływu w sieci zwarciowej (zmiana `short_circuit_core.py`/`short_circuit_iec60909.py` lub kontraktu `ShortCircuitResult` — dziś łącznik bez impedancji); (ii) zmiana jądra nasycenia CT, jeśli leży w `equipment_checks/` — `ct_burden_saturation.py` NIE jest na liście B-01 (sprawdziłem listę), więc nie wymaga; (iii) rozszerzenie kontraktu wyniku (FROZEN) o aparaturę.
NIE wymagają B-01 (nie leżą na liście): nowe typy katalogu (types.py, mv_*_catalog.py, audit2_catalogs.py), `set_bay_equipment` i nowe rodzaje aparatów (enm/wyposazenie_pola.py), `enm/models.py`, `domain_operations*.py`, szablony stacji, `aparaty_pol.py`, `wytrzymalosc_aparatury_pol.py`, equipment_proof, frontend. Nie sprawdzałem odcisku `guard_references/solver_hashes.json` ani `solver_boundary_guard.PROTECTED_FILES` poza zapisem w docstringu rdzenie_b01.py.
Uwaga: `enm/hash.py` (odcisk modelu) i `schemas/openapi_snapshot.json` — nowe pola ENM wymagają addytywności (`_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE`, enm/hash.py:8), inaczej zmieniają odciski golden; to osobna bramka determinizmu, nie B-01.

## NAJWAŻNIEJSZE LUKI (plik:linia)
1. Brak aparatury 110 kV w katalogu: mv_switch_catalog.py (max un_kv 24), mv_auxiliary_catalog.py:1349-1852 (CT bez napięcia, VT do 24 kV), mv_surge_arrester_catalog.py:63-207 (do 36 kV); brak ZU: audit2_catalogs.py:1176-1260 to tylko wariant uziemienia.
2. `hv_bay_apparatus_proposal` = tekst bez konsumenta: domain_operations.py:5563-5572, gpz_110_sn.py:137-142; front: 0 trafień.
3. `set_bay_equipment` bez rodzajów ZU/dławik/bateria i bez sprawdzenia napięcia: wyposazenie_pola.py:70-95, 300-313; brak trzech statusów „wymagane/zaprojektowane/brakujące” (są MODEL/PROPOZYCJA/BRAK_DANYCH, l.64).
4. Dwa źródła „aparat w polu”: aparaty_pol.py:118-142 (gałęzie) vs `Bay.primary_devices` (models.py:1366); CT: `Measurement` (models.py:854) vs `BayPrimaryDevice(kind=CT)`.
5. Szablony ról EARTHING/CAPACITOR i pól 110 kV nie istnieją: bay_templates.py:211-218, 338-352; pola funkcyjne bez aparatów domain_operations.py:5651-5668.
6. Kreator źródła niezgodny z H5: zrodloModel.ts:743-760 vs domain_operations.py:778-793; 1×3 osiągalny: zrodloModel.ts:36, domain_operations.py:4346-4363.

## 7. STAN PO KARCIE GPZ-H5-APARATURA (2026-10-22)

Sekcje 1–6 i „Najważniejsze luki” są inwentarzem WEJŚCIOWYM karty (stan bazy `88557ceb7`). Stan
po karcie:

**Rozstrzygnięcia.** A1: `DS_ES` = odłącznik trójpołożeniowy (zamknięty / otwarty / uziemiony) —
interpretacja rysunku ENEA (odłącznik z trzpieniem uziemiającym); symbolu PN-EN 60617 nie
potwierdzono (brak dostępu do normy). A3: układ rozdzielnicy SN wg zał. Z.2, wyposażenie
i kolejność gniazd wg rysunków pól (Z.7, Z.10–Z.17) z torem elektrycznym. Decyzja właściciela
2026-10-22: strona 110 kV jest WYŁĄCZNIE funkcjonalną granicą zasilania sieci SN — tory L1 i L2,
dwa pola zasilające jako przyłącza z łącznikiem pola (gałąź modelu, stan wchodzi do obliczeń
przez scenariusz łączeniowy), transformatory 110/SN i łącznik szyn 110 kV ze stanem; bez szablonów
gniazd pól 110 kV, pozycji wymagań ENEA 110 kV, katalogu aparatury 110 kV, statusu „wymagane
standardem” i oceny wytrzymałości aparatury 110 kV (A2 bezprzedmiotowe). Propozycja aparatów pól
110 kV (`hv_bay_apparatus_proposal`, `meta.apparatus_proposal`) skasowana bez zastępstwa.

**Jeden predykat granicy:** `enm.sklad_pola.pole_granicy_wn` (pasmo WN, Uₙ ≥ 110 kV; lustro frontu
`ui/shared/polaStacji.ts::czyPoleWn`). Czytają go: status składu `BRAK_TYPU_GRANICA_WN` (łącznik pola
110 kV „brak typu”, bez „?”), odmowa operacji wyposażenia pola `bay_equipment.bay_hv_boundary`
(każdy tryb), pominięcie pól 110 kV w analizie wytrzymałości aparatury, odmowa przypisania
katalogu łącznikowi strony 110 kV `catalog.switch_hv_boundary` (operacja przypisania i zmiana
parametrów) oraz helper `domain_operations._odmowa_granicy_wn` — kody `{prefiks}.bus_hv_boundary`:
`ct`, `vt`, `sn` (pole SN i pole z katalogu rozdzielnic), `spd` (ogranicznik), `station.append` (stacja na końcu ciągu), `station.insert` (stacja w odcinku),
`switch` (łącznik sekcyjny), `branch_point` (ZKSN, słup rozgałęźny). Testy:
`backend/tests/enm/test_granica_zasilania_110kv.py` (iloczyn operacja × strona 110 kV / para 15 kV).

**Tor zasilania 110 kV:** jedno źródło `enm.topology.tory_zasilania_sekcji_wn_gpz`; rola łącznika
`LACZNIK_POLA_ZASILAJACEGO_WN` (`enm.topology.role_lacznikow`, lustro `ui/shared/stanLacznika.ts`,
tabela parytetu `backend/schemas/role_lacznikow_parytet_v1.json`); I001 dla normalnie otwartego
łącznika pola liniowego 110 kV („tor zasilania 110 kV odstawiony, to nie jest punkt podziału”);
W063 sprawdza tor pod napięciem w stanie normalnym; E065 wskazuje każdy otwarty łącznik na
granicy odciętej sekcji (sprzęgło, łącznik pola liniowego 110 kV, łącznik pola TR).

**Typ pola SN → gniazda → podstawa** (`network_model/catalog/gniazda_pol_enea.py`; „[poz. wymagań]”
— gniazdo z pozycją wymagań standardu `mv_wymagania_enea_catalog.POZYCJE_WYMAGAN_GNIAZD`):

| Szablon — nazwa | Role pola | Gniazda (rodzaj) | Podstawa |
|---|---|---|---|
| ENEA_SN_LS — Pole sprzęgła SN — łącznik szyn w jednej celi | COUPLER | VI_A (VOLTAGE_INDICATOR) [poz. wymagań], DS_ES_A (DS_ES), W (CB), CT (CT), DS_ES_B (DS_ES), VI_B (VOLTAGE_INDICATOR) [poz. wymagań] | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §13 (łącznik szyn w jednej celce), zał. Z.12 |
| ENEA_SN_LS_CELA_SPRZEGLA — Pole sprzęgła SN — cela przy sekcji A, bez wyłącznika | COUPLER | VI_SZ (VOLTAGE_INDICATOR) [poz. wymagań], DS_ES (DS_ES) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §13 (łącznik szyn w dwóch celkach), zał. Z.2 (pola 1/2), zał. Z.12 |
| ENEA_SN_LS_CELA_WYLACZNIKOWA — Pole sprzęgła SN — cela wyłącznikowa przy sekcji B | COUPLER | VI_SZ (VOLTAGE_INDICATOR) [poz. wymagań], DS_ES (DS_ES), CT (CT), W (CB) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §13 (łącznik szyn w dwóch celkach), zał. Z.2 (pola 1/2), zał. Z.12 |
| ENEA_SN_BKR — Pole baterii kondensatorów SN — baterie równoległe (BKR) | CAPACITOR | DS_ES (DS_ES) [poz. wymagań], W (CB), CT (CT), VI_KB (VOLTAGE_INDICATOR) [poz. wymagań], OGR (SURGE_ARRESTER), VT_L1L2 (VT), VT_L2L3 (VT), BK (CAPACITOR_BANK) [poz. wymagań], CT_N (CT) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §17, zał. Z.2 (pola 3/4), zał. Z.16 |
| ENEA_SN_ZU_DLAWIK — Pole zespołu uziemiającego SN — dławik z regulacją nadążną (sieć skompensowana) | EARTHING | DS_ES (DS_ES) [poz. wymagań], W (CB), CT (CT), OGR (SURGE_ARRESTER), TU (EARTHING_TRANSFORMER) [poz. wymagań], N_OGR (SURGE_ARRESTER), DS_DL (DS), DL (NEUTRAL_REACTOR) [poz. wymagań], CT_DL (CT), AWSC (NEUTRAL_RESISTOR) [poz. wymagań] | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §16 (sieć kablowo-napowietrzna: punkt neutralny przez dławik), zał. Z.13 |
| ENEA_SN_ZU_DLAWIK_REZYSTOR — Pole zespołu uziemiającego SN — układ równoległy dławik ‖ rezystor | EARTHING | DS_ES (DS_ES) [poz. wymagań], W (CB), CT (CT), OGR (SURGE_ARRESTER), TU (EARTHING_TRANSFORMER) [poz. wymagań], N_OGR (SURGE_ARRESTER), DS_DL (DS), DL (NEUTRAL_REACTOR) [poz. wymagań], DS_RZ (DS), RZ (NEUTRAL_RESISTOR) [poz. wymagań], CT_RZ (CT) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §16 (uzasadnione przypadki: układ równoległy rezystor–dławik), zał. Z.14 |
| ENEA_SN_ZU_REZYSTOR — Pole zespołu uziemiającego SN — rezystor (sieć kablowa) | EARTHING | DS_ES (DS_ES) [poz. wymagań], W (CB), CT (CT), OGR (SURGE_ARRESTER), TU (EARTHING_TRANSFORMER) [poz. wymagań], N_OGR (SURGE_ARRESTER), DS_RZ (DS), RZ (NEUTRAL_RESISTOR) [poz. wymagań], CT_RZ (CT) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §16 (sieć kablowa: punkt neutralny przez rezystor), zał. Z.15 |
| ENEA_SN_TR — Pole transformatorowe SN | TR | VI_SZ (VOLTAGE_INDICATOR) [poz. wymagań], DS_ES (DS_ES), W (CB), ES (ES) [poz. wymagań], VT (VT), CT (CT), VI_KB (VOLTAGE_INDICATOR) [poz. wymagań], OGR (SURGE_ARRESTER) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §13, zał. Z.2 (pola 7/8), zał. Z.7 |
| ENEA_SN_POMIAR — Pole pomiarowe SN — pomiar napięcia szyn | MEASUREMENT | DS_ES (DS_ES) [poz. wymagań], VI (VOLTAGE_INDICATOR) [poz. wymagań], VT (VT) | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), §13 (pole pomiaru napięcia w każdej sekcji), zał. Z.2 (pola 9/10), zał. Z.17 |
| ENEA_SN_LINIA_POMIAR_ROZLICZENIOWY — Pole liniowe wyjściowe SN z pomiarem energii rozliczeniowym (LINIA*) | OUT/FEEDER | VI_SZ (VOLTAGE_INDICATOR) [poz. wymagań], DS_ES (DS_ES) [poz. wymagań], W (CB), ES (ES) [poz. wymagań], VT (VT), CT (CT), VI_KB (VOLTAGE_INDICATOR) [poz. wymagań], CT_F (CT) [poz. wymagań] | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), zał. Z.2 (pola 11/12), zał. Z.11 |
| ENEA_SN_LINIA_POMIAR_NAPIECIA — Pole liniowe wyjściowe SN z pomiarem napięcia zwrotnego (LINIA**) | OUT/FEEDER | VI_SZ (VOLTAGE_INDICATOR) [poz. wymagań], DS_ES (DS_ES) [poz. wymagań], W (CB), ES (ES) [poz. wymagań], VT (VT), CT (CT), VI_KB (VOLTAGE_INDICATOR) [poz. wymagań], CT_F (CT) [poz. wymagań] | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), zał. Z.2 (pola 13/14), zał. Z.11.1 |
| ENEA_SN_LINIA — Pole liniowe wyjściowe SN | OUT/FEEDER | DS_ES (DS_ES) [poz. wymagań], W (CB), ES (ES) [poz. wymagań], CT (CT), VI_KB (VOLTAGE_INDICATOR) [poz. wymagań], CT_F (CT) [poz. wymagań] | ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe 110 kV/SN (wersja 02.2023-2), zał. Z.2 (pola 15–32), zał. Z.10 |

Pole 110 kV (pole liniowe L1/L2, pole łącznika szyn 110 kV): jeden wiersz składu — łącznik
pola z gałęzią modelu, „brak typu — łącznik pola 110 kV (granica zasilania sieci SN)”; pole
transformatora 110 kV: jeden wiersz transformatora z katalogu. Brak szablonu i gniazd.

**Świadomie poza bramą granicy:** odbiór i źródło na szynie 110 kV (`add_load_sn`,
`add_generator_sn`, `add_converter_source`) — to elementy sieci, nie aparatura pola SN (sieci
odniesienia WN mają odbiory na szynach WN); transformator SN/nN na szynie 110 kV
(`add_transformer_sn_nn`) i zabezpieczenie (`add_relay`) — odmowa przechodnia (brak wolnego pola
TR / brak przekładnika na stronie 110 kV); bateria SN (`add_shunt_compensator_sn`) — odmowa
`shunt.voltage_mismatch`; odcinek magistrali i odgałęzienia z szyny/zacisku 110 kV — odmowa
reguły punktu startu (`trunk.source_*`, `branch_connection.source_not_branch_capable`, test
przypięty); odcinek linii/kabla (`continue_trunk_segment_sn`, `connect_secondary_ring_sn`) — element
sieci dowolnego napięcia: import XLSX i kompilator sieci odniesienia (`enm/kompilator_grafu.py`)
budują nimi linie sieci WN (rejestr złotych sieci, np. IEEE 4-bus, czerwienieje przy bramie na
powiązaniu pierścieniowym — zmierzone).

**Katalog — odcisk, rodzaje, propozycje.** Odcisk katalogu zmienia się WYŁĄCZNIE przez dane karty
(dowód liść po liściu przypięty w `tests/network_model/catalog/test_odcisk_katalogu_karty_widmowe.py`,
`ODCISK_PO_GPZ_H5`): nowa przestrzeń `element_pola_types` (7 pozycji), +1 CT (Ferranti 100/1),
+4 pozycje aparatury łączeniowej (odłączniki trójpołożeniowe 630/1250/2000 A, uziemnik pola SN)
w `switch_equipment_types` i `mv_apparatus_types` oraz klucz `u_m_kv` w 48 istniejących pozycjach
projekcji aparatury SN; puste nowe pola (`icw_duration_s`, `naped`, `odmiana`) są poza odciskiem
(`network_model/catalog/odcisk.py::_POLA_ADDYTYWNE_POZA_ODCISKIEM_GDY_NONE`). Rodzaj
`DISCONNECTOR_EARTH_SWITCH` należy do rodzajów bez zdolności wyłączania zwarć
(`application/equipment_proof/catalog_bridge.py::RODZAJE_SN_BEZ_ZDOLNOSCI_WYLACZANIA`, I_cu =
nie dotyczy). Uziemnik (`mv_switch_catalog.RODZAJE_BEZ_PRADU_CIAGLEGO`) w propozycjach aparatury
(`POST /api/catalog/auto-populate/switch`) ma „prąd ciągły nie dotyczy (uziemnik)”, nie „0 A”,
i nie przechodzi filtru prądu roboczego; pozycja bez producenta jest „bez producenta”, nie
„(None)”; napięcie 17,5 kV nie jest obcinane do „17 kV” (iloczyn rodzaj × producent × filtr prądu
w `tests/api/test_catalog_auto_populate.py`). Rodzina `field-element` jest objęta miernikiem
gotowości katalogów (`backend/scripts/inwentarz_katalogow.py`, tabela w
`docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_PARAMETROW.md`).

**Fikstury i złote skróty — przyczyny zmian (pomiar 2026-10-23, baza `88557ceb7` wobec karty).**
(1) Odcisk katalogu `8c015912…` → `8a27a1a0…` wyłącznie przez dane karty (akapit wyżej) — stąd
`catalog_fingerprint` i skróty nad nim (`semantic_fingerprint` porównania biegów) w fiksturach
harnessu. (2) Przyczyna nieraportowalności wiersza zwarcia z topologii zamiast ogólnego „wynik
niefizyczny” (`enm/canonical_analysis.py`, `POWOD_WEZEL_BEZ_DROGI_ZEROWEJ`,
`POWOD_WEZEL_BEZ_ODNIESIENIA`) oraz addytywne pola wiersza `flags_pl`, `non_physical_reason`,
`non_physical_fields`: w parytecie assemblera (`tests/golden/parytet_assemblera`) poza siecią
substratu JEDYNE zmiany szkieletu to kody ograniczeń raportowych (902 × „bez drogi składowej
zerowej”, 340 × „bez odniesienia”, 20 list biegu z dwoma przyczynami zamiast jednej ogólnej),
zero zmian liczb ponad tolerancję parytetu. (3) Substrat 52 stacji
(`tests/reference_networks/sld_substrate_52s.py`) przechodzi na układ H5 z dwoma torami 110 kV
(jeden tor jest odmawiany kodem `source.invalid_hv_sections_count`, ENEA Zeszyt 1 §11.1):
4 nowe węzły (zaciski pól liniowych L1/L2, szyna sekcji 110 kV S2, zacisk pola SN TR1)
i 4 nowe łączniki (wyłączniki pól liniowych, łącznik szyn 110 kV normalnie otwarty, wyłącznik
pola SN TR1); ziarno identyfikatorów GPZ obejmuje strukturę 110 kV, więc identyfikatory
elementów substratu są nowe, a sieć 53 stacji (`sldNetwork53.ts`) jest TA SAMA co do nazw stacji,
krawędzi i punktu podziału (sprawdzone porównaniem po nazwach; zmienia się tylko numeracja
S01…S53 wynikająca z porządku identyfikatorów). Rozpływ substratu zmienia się o straty łączników
zamkniętych (R = X = 1·10⁻⁴ Ω na własnym poziomie napięcia, rdzeń NR, B-01): moc bilansująca
−2,69848 → −2,69847 MW; nowy punkt zwarcia (szyna 110 kV S2) i druga wyspa rozpływu (sekcja
110 kV S2 przy otwartym łączniku szyn). (4) Szum numeryczny między maszynami (np. część
rzeczywista Z₀ złotej sieci 5,1·10⁻¹³ wobec 1,27·10⁻⁹ Ω przy urojonej −10 162,6 Ω —
`tests/ci/tolerancja_fikstur.py::PASMO_ZERA_FIXTUR`) wchodzi do pliku fikstury harnessu tylko
wtedy, gdy plik zmienia się z przyczyn (1)–(3) — kotwica w szumie działa na cały plik; w złotych
skrótach parytetu liczby różniące się wyłącznie w tolerancji zostały zakotwiczone na bazie.
