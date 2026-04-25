# Migracja ENM v1 -> ENM v2.0

Status: aktywna specyfikacja migracji  
Cel: przejscie do ENM v2.0 bez big-bangu i bez utraty audytowalnosci

## 1. Fazy migracji

| Faza | Cel | Wejscie | Wyjscie | Rollback |
|---|---|---|---|---|
| M0 | Inwentaryzacja | Repo i dokumentacja w stanie startowym | Baseline modeli, endpointow, UI, testow, wydajnosci i terminologii | Brak zmian domenowych |
| M1 | Kompatybilnosc wsteczna | ENM v1 aktywny | ENM v2 generowany jako projekcja migracyjna | Wylaczenie projekcji v2 |
| M2 | Dual-read / single-write | Projekcja v2 stabilna | Zapis tylko do ENM v2, odczyt legacy przez adaptery | Powrot zapisu do v1 przez adapter M1 |
| M3 | Odciecie legacy | Wyniki i raporty z v2 | `StudyCase` jedynym kanonem, legacy wylaczone | Przywrocenie adapterow odczytu |
| M4 | Czyszczenie po migracji | Legacy wylaczone | Usuniete adaptery, martwe endpointy i nieczytane pola | Przywrocenie z tagu fazy M3 |

## 2. Minimalna macierz pol

| ENM v1 | ENM v2 | Mapowanie | Przypadki brzegowe | Utrata informacji | Test |
|---|---|---|---|---|---|
| `header.enm_version="1.0"` | `header.enm_version="2.0"` | Ustawiane przez migrator. | Brak headera blokuje migracje. | Brak. | Hash po migracji deterministyczny. |
| `buses` | `buses` | Przeniesienie 1:1 z dopelnieniem statusow jakosci. | Brak `voltage_kv` blokuje gotowosc. | Brak. | Liczba i `ref_id` zachowane. |
| `branches` | `branches` | Przeniesienie 1:1 z katalogiem i materializacja parametrow. | Brak `catalog_ref` oznacza blokade katalog-first. | Brak, jezeli parametry instancji sa pelne. | Parametry solverowe rowne po migracji. |
| `transformers` | `transformers` | Przeniesienie 1:1, dopelnienie vector group i neutral grounding. | Brak grupy polaczen ogranicza zwarcia 1F/2F+Z. | Brak. | Zwarcie 3F zachowuje wynik w tolerancji. |
| `sources` | `sources` + `zero_sequence_configs` | Zrodlo zachowane, skladowa zerowa wydzielona, jesli obecna. | Brak Z0 ogranicza analizy ziemnozwarciowe. | Brak. | Dostepnosc SC1F zgodna z walidacja. |
| `generators.gen_type` | `generators.source_kind` + profile | `pv_inverter`, `bess`, `fw_pmsg`, `fw_dfig`, `fw_scig` mapowane na `PV`, `BESS`, `FW_PMSG`, `FW_DFIG`, `FW_SCIG`; legacy `wind_inverter` mapowane na `FW` z ostrzezeniem. | `wind_inverter` bez technologii PMSG/DFIG/SCIG wymaga decyzji migracyjnej; precyzyjny typ FW z profilem generatora innym niz typ zrodla blokuje migracje. | Mozliwa utrata precyzji tylko dla legacy `wind_inverter`. | Migrator tworzy profile zrodel, profile operatora, FRT/Q(U)/cos phi(P) i ostrzezenie `V12-MIG-GEN-003` przy niespojnosci. |
| `loads` | `loads` + `load_profiles` | `pq` 1:1, `zip` oznaczone jako wymagajace solver support. | `zip` bez parametrow ZIP blokuje tryb ZIP. | Brak dla PQ. | Rozplyw PQ zgodny z v1. |
| `substations` | `substations` | Przeniesienie 1:1 z typem kanonicznym. | Nieznany typ wymaga mapowania do `inne`. | Brak. | Ref_id stacji zachowane. |
| `bays` | `bays` + automatyka | Pole zachowane, konfiguracje wtornych urzadzen mapowane do bytow automatyki. | Brak urzadzenia wykonawczego blokuje automatyke. | Brak. | Bay read-model zgodny. |
| brak | `operating_variants` | Tworzony wariant bazowy `uklad_normalny`. | Wielokrotne stany lacznikow wymagaja wariantow pochodnych. | Brak, bo byt nowy. | Aktywny wariant istnieje po migracji. |
| brak | `switching_state_snapshots` | Tworzona migawka bazowa z aktualnych stanow lacznikow. | Nieznany stan lacznika oznaczany jako `nieznany`. | Brak. | Wynik ma snapshot lacznikowy. |
| brak | `catalog_snapshots` | Tworzony przy nowym uruchomieniu obliczen. | Brak rekordu katalogowego blokuje raport. | Brak dla nowych runow. | Run zawiera hash katalogu. |

## 3. Kryteria zamkniecia migracji

- M0 ma pelny raport inwentaryzacji.
- M1 ma deterministyczna projekcje v1->v2.
- M2 zapisuje wylacznie do ENM v2.
- M3 usuwa `OperatingCase` z toru wykonawczego.
- M4 usuwa adaptery legacy i zamyka dlug migracyjny.
