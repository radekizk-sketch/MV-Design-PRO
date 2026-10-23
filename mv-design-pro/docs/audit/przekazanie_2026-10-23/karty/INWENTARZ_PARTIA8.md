# Inwentarz kart do partii 8 (explorer, 2026-10-15 ~20:00 UTC, tylko git; baza c136c6bbd, INT=53551167b)
SCALIĆ (bez B-01): tory-poprawki (1+, brak meldunku; konflikt scripts/test_legacy_public_path_guard.py),
 tory-testowe (3+ /1−; konflikty nn_field_specs_promocja.py, enm/validator.py, test promocji aparatu, szynyStacjiKonsumenci.test.ts, test_legacy_public_path_guard.py),
 cennik-odmowy-pakietow (4+, brak meldunku; konflikty MAPA_DOMKNIECIA, SYNTEZA_DOMKNIECIA, studium_dokument_scena_macierz.json),
 c12-akcja-naprawcza (1+; konflikt enm/domain_operations.py + zrzuty flow-ekspert → przegenerować),
 oltc-u-docelowe (4+, brak meldunku; konflikt network_model/pochodne/__init__.py),
 zapis-decyzji-o60 (1+ /2− ; konflikty FINAL_DYNAMICS_CAPABILITY_FREEZE, MAPA_DOMKNIECIA, PLAN_AB_DYNAMIKA, REJESTR_KONFLIKTOW),
 nastawy-p6 (3+ /1−; nn_field_specs_promocja, validator, złote hashe assembler/p11, test_odcisk_katalogu, zrzuty → narzędziami),
 etykieta-stacji (5+; station_templates/apply.py, nn_field_specs_promocja, validator, READINESS_FIXACTIONS, fikstury sldSubstrate52s),
 partia6-front (2+ /5−; pliki frontu enmResolvers, stationTransformerSelection, szynyStacji, topologyInputReader, enmToSldAdapter, exportModelData; B-02 u właściciela),
 + gotowe z meldunkiem: szybkie-testy, resultset-martwe, cgmes-eksport, dynamika-w-tle.
WYMAGA B-01: wspolczynnik-c (solvers fault_loop/grid_source_preview/machine_sc; niedokończona), ab1b3b-p6 (rdzeń dynamiki RMS, kontrakt resultset_dynamic_v2), w5e-ttit (solvers fault_loop + petla_zwarcia_tt_it; + B-02), prot-lti, pf-od19, b01-runda1, b01-runda3.
DOKOŃCZYĆ: uziemienie-jeden-prad (tylko spec), docx501-od22 (OD-22 1/n), w5b-typowany-bay (37 commitów, 16/n, bez meldunku, B-02).
Klasa konfliktu: nn_field_specs_promocja.py + enm/validator.py + test promocji naprawiane równolegle w tory-testowe, nastawy-p6, etykieta-stacji, ab1b3b-p6 → jedno źródło. Fikstury harnessu i złote hashe regenerować RAZ po scaleniu.
