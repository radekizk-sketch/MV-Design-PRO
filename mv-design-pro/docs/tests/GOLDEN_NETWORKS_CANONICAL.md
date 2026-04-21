# Zlote Sieci - Specyfikacja Kanoniczna

> **Status**: BINDING
> **Warstwa**: Tests / CI
> **Data**: 2026-02-17
> **Powiazania**: SYSTEM_SPEC.md, STUDY_CASE_SYSTEM_CANONICAL.md

---

## Przeglad

Zlote sieci (Golden Networks) to zestaw **6 deterministycznych, kanonicznych topologii** sluzcych jako referencyjne przypadki testowe. Kazda zlota siec posiada:

- Scisle zdefiniowana topologie i elementy
- Deterministyczne hashe (snapshot, layout, solver)
- Pelny zestaw artefaktow CI
- Gwarancje powtarzalnosci (100x/50x)

---

## Zlote sieci (6 sztuk)

### GN_01_SN_PROSTA

**Opis**: GPZ -> 3 odcinki magistrali -> stacja typ B

**Elementy**:
| Typ | Ilosc | Szczegoly |
|-----|-------|-----------|
| Zrodlo (GridSource) | 1 | GPZ z impedancja zwarciowa sieci nadrzednej |
| Szyna (Bus) | 4 | Bus_GPZ, Bus_01, Bus_02, Bus_03 |
| Odcinek kabla SN (Branch) | 3 | Kabel SN z katalogu, kazdy z impedancja Z i admitancja Y |
| Stacja typ B (Station) | 1 | Transformator SN/nN + rozdzielnia nN |

**Topologia**:
```
[GPZ] --kabel_01--> [Bus_01] --kabel_02--> [Bus_02] --kabel_03--> [Bus_03/Stacja_B]
                                                                        |
                                                                    [TR SN/nN]
                                                                        |
                                                                    [Bus_nN]
```

**Hashe**:
- `snapshot_hash`: obliczany automatycznie (SHA-256 z serializacji NetworkModel)
- `layout_hash`: obliczany automatycznie (SHA-256 z pozycji SLD)

**Operacje budowy** (sekwencja Wizard):
1. `add_grid_source_sn` - dodanie GPZ z parametrami sieci nadrzednej
2. `continue_trunk_segment_sn` - odcinek magistrali 1 (Bus_GPZ -> Bus_01)
3. `continue_trunk_segment_sn` - odcinek magistrali 2 (Bus_01 -> Bus_02)
4. `continue_trunk_segment_sn` - odcinek magistrali 3 (Bus_02 -> Bus_03)
5. `insert_station_on_segment_sn` - wstawienie stacji B na Bus_03

---

### GN_02_SN_ODG

**Opis**: GPZ -> magistrala 2 odcinki -> stacja C z odgalezieniem

**Elementy**:
| Typ | Ilosc | Szczegoly |
|-----|-------|-----------|
| Zrodlo (GridSource) | 1 | GPZ |
| Szyna (Bus) | 5 | Bus_GPZ, Bus_01, Bus_02, Bus_C_IN, Bus_BRANCH |
| Odcinek kabla SN (Branch) | 3 | 2 magistralne + 1 odgalezienie |
| Stacja typ C (Station) | 1 | Stacja z polami IN/OUT/BRANCH |
| Odgalezienie (Branch) | 1 | Odcinek od stacji C do szyny odgalezienia |

**Topologia**:
```
[GPZ] --kabel_01--> [Bus_01] --kabel_02--> [Bus_02/Stacja_C]
                                                |
                                           [IN/OUT/BRANCH]
                                                |
                                         --odgalezienie-->  [Bus_BRANCH]
```

**Hashe**:
- `snapshot_hash`: obliczany automatycznie
- `layout_hash`: obliczany automatycznie

**Operacje budowy**:
1. `add_grid_source_sn` - dodanie GPZ
2. `continue_trunk_segment_sn` - odcinek magistrali 1
3. `continue_trunk_segment_sn` - odcinek magistrali 2
4. `insert_station_on_segment_sn(type=C)` - wstawienie stacji C z polami IN/OUT/BRANCH
5. `start_branch_segment_sn` - rozpoczecie odgalezienia od pola BRANCH stacji C

---

### GN_03_SN_RING_NOP

**Opis**: GPZ -> ring wtorny + NOP (Normally Open Point)

**Elementy**:
| Typ | Ilosc | Szczegoly |
|-----|-------|-----------|
| Zrodlo (GridSource) | 1 | GPZ |
| Szyna (Bus) | 5 | Bus_GPZ, Bus_01, Bus_02, Bus_03, Bus_04 |
| Odcinek kabla SN (Branch) | 4 | Odcinki tworzace ring |
| Lacznik (Switch) | 1 | Lacznik sekcyjny |
| Ring closure (Branch) | 1 | Odcinek zamykajacy ring |
| NOP | 1 | Punkt normalnie otwarty na laczniku sekcyjnym |

**Topologia**:
```
                    [GPZ]
                   /     \
            kabel_01    kabel_04
             /               \
        [Bus_01]          [Bus_04]
            |                 |
        kabel_02          kabel_03
            |                 |
        [Bus_02] --[NOP]-- [Bus_03]
                  (OTWARTY)
```

**Hashe**:
- `snapshot_hash`: obliczany automatycznie
- `layout_hash`: obliczany automatycznie

**Operacje budowy**:
1. `add_grid_source_sn` - dodanie GPZ
2. `continue_trunk_segment_sn` - odcinek 1 (Bus_GPZ -> Bus_01)
3. `continue_trunk_segment_sn` - odcinek 2 (Bus_01 -> Bus_02)
4. `continue_trunk_segment_sn` - odcinek 3 (Bus_03 -> Bus_04)
5. `insert_section_switch_sn` - wstawienie lacznika sekcyjnego miedzy Bus_02 a Bus_03
6. `connect_secondary_ring_sn` - zamkniecie ringu (Bus_04 -> Bus_GPZ)
7. `set_normal_open_point` - ustawienie NOP na laczniku sekcyjnym (stan normalny: OTWARTY)

---

### GN_04_SN_NN_OZE

**Opis**: Stacja z nN + PV + BESS

**Elementy**:
| Typ | Ilosc | Szczegoly |
|-----|-------|-----------|
| Zrodlo (GridSource) | 1 | GPZ |
| Szyna (Bus) | 4 | Bus_GPZ, Bus_SN, Bus_nN, Bus_OZE |
| Odcinek kabla SN (Branch) | 1 | Magistrala GPZ -> stacja |
| Stacja typ B (Station) | 1 | Transformator SN/nN |
| Falownik PV (Source) | 1 | Falownik fotowoltaiczny na szynie nN |
| Falownik BESS (Source) | 1 | Falownik magazynu energii na szynie nN |
| BESS energia (Storage) | 1 | Magazyn energii (pojemnosc kWh, SOC) |

**Topologia**:
```
[GPZ] --kabel_SN--> [Bus_SN / Stacja_B]
                          |
                      [TR SN/nN]
                          |
                      [Bus_nN]
                       /     \
                 [PV_inv]   [BESS_inv]
                              |
                          [BESS_storage]
```

**Hashe**:
- `snapshot_hash`: obliczany automatycznie
- `layout_hash`: obliczany automatycznie

**Operacje budowy**:
1. `add_grid_source_sn` - dodanie GPZ
2. `continue_trunk_segment_sn` - magistrala do stacji
3. `insert_station_on_segment_sn(type=B)` - wstawienie stacji B z transformatorem
4. `add_converter_source` - dodanie źródła przekształtnikowego PV na szynie nN
5. `add_converter_source` - dodanie źródła przekształtnikowego BESS na szynie nN

---

### GN_05_SN_OCHRONA

**Opis**: Siec z CT/VT + przekazniki + TCC + selektywnosc

**Elementy**:
| Typ | Ilosc | Szczegoly |
|-----|-------|-----------|
| Zrodlo (GridSource) | 1 | GPZ |
| Szyna (Bus) | 5 | Bus_GPZ, Bus_01, Bus_02, Bus_ST1, Bus_ST2 |
| Odcinek kabla SN (Branch) | 3 | Magistrala + odcinki do stacji |
| Stacja (Station) | 2 | Stacja_01, Stacja_02 |
| Przekladnik pradowy CT | 2 | CT na polach zasilajacych stacje |
| Przekladnik napieciowy VT | 1 | VT na szynie GPZ |
| Przekaznik nadpradowy (Relay) | 2 | Relay_01 (stacja_01), Relay_02 (stacja_02) |

**Topologia**:
```
[GPZ] --[VT]-- [Bus_GPZ]
                  |
             kabel_01 --[CT_01]--> [Bus_01 / Stacja_01] --[Relay_01]
                  |
             kabel_02 --[CT_02]--> [Bus_02 / Stacja_02] --[Relay_02]
```

**Hashe**:
- `snapshot_hash`: obliczany automatycznie
- `layout_hash`: obliczany automatycznie

**Operacje budowy**:
1. `add_grid_source_sn` - dodanie GPZ
2. `continue_trunk_segment_sn` - odcinek magistrali 1
3. `continue_trunk_segment_sn` - odcinek magistrali 2
4. `insert_station_on_segment_sn` - wstawienie stacji 1
5. `insert_station_on_segment_sn` - wstawienie stacji 2
6. `add_ct` - dodanie przekladnika pradowego CT na polu stacji 1
7. `add_ct` - dodanie przekladnika pradowego CT na polu stacji 2
8. `add_vt` - dodanie przekladnika napieciowego VT na szynie GPZ
9. `add_relay` - dodanie przekaznika nadpradowego na stacji 1
10. `add_relay` - dodanie przekaznika nadpradowego na stacji 2
11. `update_relay_settings` - konfiguracja nastawien przekaznikow (I>, I>>, t_trip)
12. `calculate_tcc_curve` - obliczenie krzywych TCC (Time-Current Characteristic)
13. `validate_selectivity` - walidacja selektywnosci ochrony miedzy Relay_01 a Relay_02

---

### GN_06_STUDYCASE_DYNAMIKA

**Opis**: Profile czasowe (BESS/PV/obciazenia) + serie uruchomien

**Elementy**:
| Typ | Ilosc | Szczegoly |
|-----|-------|-----------|
| Zrodlo (GridSource) | 1 | GPZ |
| Szyna (Bus) | 4 | Bus_GPZ, Bus_SN, Bus_nN, Bus_OZE |
| Odcinek kabla SN (Branch) | 1 | Magistrala |
| Stacja typ B (Station) | 1 | Transformator SN/nN |
| Falownik PV (Source) | 1 | Z profilem czasowym generacji |
| Falownik BESS (Source) | 1 | Z profilem czasowym ladowania/rozladowania |
| StudyCase | 2 | Case_DZIEN (normalna praca), Case_NOC (brak PV, BESS rozladowanie) |
| Profil czasowy | 3 | Profil PV, Profil BESS, Profil obciazenia |

**Topologia**:
```
[GPZ] --kabel--> [Bus_SN / Stacja_B]
                      |
                  [TR SN/nN]
                      |
                  [Bus_nN]
                   /     \
             [PV_inv]   [BESS_inv]
             (profil)   (profil)
                          |
                      [BESS_storage]

StudyCase_DZIEN:  wszystkie zrodla SIEC, PV aktywne
StudyCase_NOC:    PV wylaczone, BESS rozladowanie
```

**Profile czasowe**:

```yaml
# Profil PV (dzienny)
profile_pv:
  profile_id: "prof_pv_dzien"
  time_unit: "h"
  points:
    - {t: 0, p_kw: 0, q_kvar: 0}
    - {t: 6, p_kw: 0, q_kvar: 0}
    - {t: 9, p_kw: 50, q_kvar: 5}
    - {t: 12, p_kw: 100, q_kvar: 10}
    - {t: 15, p_kw: 70, q_kvar: 7}
    - {t: 18, p_kw: 10, q_kvar: 1}
    - {t: 21, p_kw: 0, q_kvar: 0}
    - {t: 24, p_kw: 0, q_kvar: 0}
  interpolation: "LINEAR"

# Profil BESS
profile_bess:
  profile_id: "prof_bess"
  time_unit: "h"
  points:
    - {t: 0, p_kw: -20, q_kvar: 0}    # ladowanie nocne
    - {t: 6, p_kw: -20, q_kvar: 0}
    - {t: 8, p_kw: 0, q_kvar: 0}
    - {t: 17, p_kw: 50, q_kvar: 0}    # rozladowanie szczyt wieczorny
    - {t: 21, p_kw: 50, q_kvar: 0}
    - {t: 22, p_kw: -20, q_kvar: 0}   # ladowanie nocne
    - {t: 24, p_kw: -20, q_kvar: 0}
  interpolation: "HOLD"

# Profil obciazenia
profile_load:
  profile_id: "prof_load_typ"
  time_unit: "h"
  points:
    - {t: 0, p_kw: 30, q_kvar: 10}
    - {t: 6, p_kw: 40, q_kvar: 12}
    - {t: 8, p_kw: 80, q_kvar: 25}
    - {t: 12, p_kw: 90, q_kvar: 28}
    - {t: 17, p_kw: 100, q_kvar: 30}  # szczyt wieczorny
    - {t: 21, p_kw: 60, q_kvar: 18}
    - {t: 24, p_kw: 30, q_kvar: 10}
  interpolation: "LINEAR"
```

**Hashe**:
- `snapshot_hash`: obliczany automatycznie
- `layout_hash`: obliczany automatycznie
- `solver_hash`: obliczany automatycznie (SHA-256 z wynikow solver)

**Operacje budowy i uruchomien**:
1. `add_grid_source_sn` - dodanie GPZ
2. `continue_trunk_segment_sn` - magistrala
3. `insert_station_on_segment_sn(type=B)` - stacja B
4. `add_converter_source` - źródło przekształtnikowe PV
5. `add_converter_source` - źródło przekształtnikowe BESS
6. `create_study_case(label_pl="Przypadek dzienny")` - Case_DZIEN
7. `create_study_case(label_pl="Przypadek nocny")` - Case_NOC
8. `set_case_switch_state(Case_NOC, sw_pv, OTWARTY)` - wylaczenie PV w trybie nocnym
9. `set_dynamic_profile(Case_DZIEN, "prof_pv_dzien")` - przypisanie profilu PV
10. `set_dynamic_profile(Case_DZIEN, "prof_bess")` - przypisanie profilu BESS
11. `set_dynamic_profile(Case_DZIEN, "prof_load_typ")` - przypisanie profilu obciazenia
12. `run_short_circuit(Case_DZIEN, SC2F, Bus_nN, Rf_ohm=0.5)` - zwarcie 2F z rezystancja
13. `run_power_flow(Case_DZIEN)` - rozplyw mocy dzien
14. `run_power_flow(Case_NOC)` - rozplyw mocy noc
15. `compare_study_cases(Case_DZIEN, Case_NOC)` - porownanie wynikow dzien vs noc

---

## Artefakty CI dla kazdej zlotej sieci

Kazda zlota siec generuje nastepujace artefakty w procesie CI (Continuous Integration):

### Hashe deterministyczne

| Hash | Zrodlo | Format |
|------|--------|--------|
| `snapshot_hash` | SHA-256 z kanonicznej serializacji JSON calego NetworkModel | `sha256:abcdef...` |
| `layout_hash` | SHA-256 z pozycji SLD (wspolrzedne x,y elementow) | `sha256:abcdef...` |
| `solver_hash` | SHA-256 z wynikow solver (tylko dla GN z analizami: GN_05, GN_06) | `sha256:abcdef...` |

### Reguly obliczania hashy

1. **Serializacja kanoniczna**: klucze JSON sortowane alfabetycznie, brak bialych znakow opcjonalnych, liczby bez trailing zeros.
2. **Determinizm float**: wartosci zmiennoprzecinkowe zaokraglane do 12 miejsc znaczacych przed haszowaniem.
3. **Niezaleznosc od platformy**: serializacja UTF-8, LF line endings, brak BOM.

### Eksporty

| Artefakt | Format | Opis |
|----------|--------|------|
| Render SLD | SVG, PNG | Wizualizacja schematu jednokreskowego |
| Snapshot JSON | JSON | Pelna serializacja NetworkModel |
| White Box PDF | PDF | Dokumentacja obliczen z wartosciami posrednimi |
| White Box DOCX | DOCX | Dokumentacja obliczen (format edytowalny) |

### Sciezki artefaktow CI

```
ci-artifacts/
  golden-networks/
    GN_01_SN_PROSTA/
      snapshot.json
      snapshot_hash.txt
      layout_hash.txt
      sld_render.svg
      sld_render.png
    GN_02_SN_ODG/
      ...
    GN_03_SN_RING_NOP/
      ...
    GN_04_SN_NN_OZE/
      ...
    GN_05_SN_OCHRONA/
      snapshot.json
      snapshot_hash.txt
      layout_hash.txt
      solver_hash.txt
      sld_render.svg
      sld_render.png
      whitebox_proof.pdf
      whitebox_proof.docx
    GN_06_STUDYCASE_DYNAMIKA/
      snapshot.json
      snapshot_hash.txt
      layout_hash.txt
      solver_hash.txt
      sld_render.svg
      sld_render.png
      whitebox_proof.pdf
      whitebox_proof.docx
      comparison_delta.json
```

---

## Testy deterministyczne

### Test stabilnosci hashy (100x powtorzen)

```python
@pytest.mark.parametrize("golden_network", ALL_GOLDEN_NETWORKS)
def test_hash_stability_100x(golden_network):
    """
    Weryfikacja: 100-krotne zbudowanie zlotej sieci
    produkuje identyczne hashe snapshot/layout/solver.
    """
    hashes = set()
    for _ in range(100):
        model = build_golden_network(golden_network)
        h = compute_snapshot_hash(model)
        hashes.add(h)

    assert len(hashes) == 1, (
        f"Hash niestabilny dla {golden_network.name}: "
        f"znaleziono {len(hashes)} roznych hashy w 100 powtorzeniach"
    )
```

**Weryfikowane hashe**:
- `snapshot_hash` - stabilnosc serializacji modelu
- `layout_hash` - stabilnosc pozycji SLD (auto-layout deterministyczny)
- `solver_hash` - stabilnosc wynikow obliczen (tylko GN_05, GN_06)

### Test permutacji list wejsciowych (50x permutacje)

```python
@pytest.mark.parametrize("golden_network", ALL_GOLDEN_NETWORKS)
def test_permutation_invariance_50x(golden_network):
    """
    Weryfikacja: 50 roznych permutacji kolejnosci elementow
    wejsciowych produkuje identyczny wynik.

    Cel: upewnienie sie, ze solver i serializacja nie zaleza
    od kolejnosci iteracji po kolekcjach (dict ordering, set ordering).
    """
    reference_hash = None
    elements = get_golden_network_elements(golden_network)

    for i in range(50):
        permuted = random_permutation(elements, seed=i)
        model = build_network_from_elements(permuted)
        h = compute_snapshot_hash(model)

        if reference_hash is None:
            reference_hash = h

        assert h == reference_hash, (
            f"Hash zmienil sie po permutacji #{i} dla {golden_network.name}"
        )
```

**Permutowane elementy**:
- Kolejnosc dodawania szyn (Bus)
- Kolejnosc dodawania odcinkow (Branch)
- Kolejnosc dodawania zrodel (Source)
- Kolejnosc dodawania obciazen (Load)
- Kolejnosc lacznikow (Switch)

### Invarianty testow deterministycznych

1. **Seed deterministyczny**: kazda permutacja uzywa jawnego seeda (`seed=i`), zapewniajac powtarzalnosc samego testu.
2. **Izolacja testow**: kazdy test buduje siec od zera - brak wspoldzielonego stanu miedzy iteracjami.
3. **Brak zaleznosci czasowych**: wynik nie zalezy od czasu wykonania, kolejnosci testow, ani stanu systemu.
4. **Raportowanie bledow**: w przypadku niestabilnosci, test raportuje numer iteracji/permutacji i roznice hashy.

---

## Zgodnosc z architektura

| Regula | Zgodnosc w zlotych sieciach |
|--------|---------------------------|
| Single Model Rule | Kazda zlota siec ma dokladnie jeden NetworkModel |
| WHITE BOX Rule | GN_05 i GN_06 generuja pelne artefakty White Box |
| Case Immutability Rule | GN_06 - StudyCase nie mutuje modelu, tylko konfiguracje |
| NOT-A-SOLVER Rule | Operacje budowy (Wizard) nie zawieraja fizyki |
| PCC Prohibition Rule | Brak koncepcji PCC w zadnej zlotej sieci |
| No Codenames in UI | Etykiety po polsku, bez kodowych nazw projektowych |
| Determinism | 100x stabilnosc + 50x niezmienniczosc permutacji |
