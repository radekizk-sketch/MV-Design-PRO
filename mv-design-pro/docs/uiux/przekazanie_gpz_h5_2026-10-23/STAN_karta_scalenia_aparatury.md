# STAN karty GPZ-H5-SCALENIE-APARATURY (wt-h5k, gałąź uiux-gpz-h5-schemat, baza 0f098cc92, scalana e72e9054b, merge-base 88557ceb7)
- git merge --no-ff --no-commit e72e9054b: 40 konfliktów.
- Kod rozstrzygnięty:
  * enm/domain_operations.py add_grid_source_sn: struktura aparatury (_przylacze_linii_wn: zacisk + wyłącznik pola liniowego 110 kV) + nazwa źródła = line_name (integracja).
  * tests/golden/sld_substrate_power_flow.py: importy obu (assembler/rozplyw_wysp z aparatury; poziom_pol/szyny_stacji z integracji); NodeType zbędny.
  * results-inspector/types.ts, ResultsExport.tsx, ui2/wyniki/zwarcia/strings.ts: wariant aparatury (etykiety flags_pl z backendu, ETYKIETY_ZNACZNIKOW_WYNIKU_PL zna BEZ_NAPIECIA); słowniki frontu integracji (BEZ_NAPIECIA) skasowane, import FLAG_LABELS w ResultsExport usunięty.
  * docs/plan/GPZ_H5_LANCUCH_APARATURY.md: add/add, strona integracji to podzbiór (106 linii) — wersja aparatury.
- Fikstury (34 pliki): niescalane ręcznie. 3 pliki harnessu z markerami nadpisane wersją e72e9054b tylko jako wejście kotwicy szumu, potem eksport_fixtur_harnessu --tylko (3). Generatory (gen.sh): substrat, emit53, archetyp, fikstury_enm_sld, archiwum, szyny, rodzaj, demo, oze, openapi, projnn — w1 (szyny/rodzaj rc1 przez markery w harnessie), w2 rc0, w3 rc0 bez zmian w drzewie; harness --sprawdz rc0, projnn --sprawdz rc0.
- rdzenie: diff solvers/core/profiles vs 0f098cc92: tylko der_selection_preview.py (nie na liście B-01); vs e72e9054b: pusty.
- Testy SLD przepisane do topologii aparatury (bez kompozycji): resultLabelPokrycieBiegu/BieguNaKanwie (piny pomierzone), resultLabelBezNapiecia (BEZ_NAPIECIA z backendu, WARNING), polaFunkcyjne/polePomiarowe (gniazda standardu), protectionDataPath, pathInvariants, gpzH5Iloczyn (wyrocznia sekcji TR i toru z lustra).
- fikstury_enm_sld._gpz_protection_data_path: pole TR SN H5 wyposażone set_bay_equipment(katalog)+add_relay; pola liniowe SN zostają ręczne (GPZ SN line field bez gałęzi wyłącznika → relay.breaker_missing) — LUKA PRODUKTU do decyzji architekta.
- Lustro frontu: stanLacznika.ts sekcjeSnTransformatorowGpz / toryZasilaniaSekcjiWnGpz (z _laczniki_zaciskow_pol), parytet w role_lacznikow_parytet_v1.json (przypadki + drogi_zacisku_pol: przez łącznik / wprost / dwa łączniki); adapter GPZ lvSectionId z lustra (TR na terminal_sn → sekcja przez breaker_sn).
- Menu kanwy: granica 110 kV (czyObiektGranicyWn) blokuje pozycje aparatury/budowy SN z powodem, nagłówek „Aparat pola 110 kV"/„Pole 110 kV"; inwentarz menu zna galaz/bus_coupler.
- Backend: test_spojnosc W012 — szyna przyłączenia równoważnika = zacisk linii (stary oracle aparatury wskazywał szynę sekcji; czerwony także na e72e9054b).
- Generatory w4/w5 (dodane: harness, role, dane_projektu): rc0, w5 idempotentny.
