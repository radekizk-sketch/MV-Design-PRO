# Kanoniczny slownik kodow gotowosci i akcji naprawczych

> **Status**: BINDING (dokument wiazacy)
> **Jezyk**: Polski
> **Data utworzenia**: 2026-02-17
> **Wersja**: 1.0

---

## Cel dokumentu

Niniejszy dokument definiuje **kompletny slownik kodow gotowosci** (Readiness Codes) stosowanych w systemie MV-DESIGN-PRO. Kazdy kod opisuje konkretny problem uniemozliwiajacy lub utrudniajacy przeprowadzenie analizy sieci SN/nN.

Dla kazdego kodu zdefiniowano:
- **Obszar** (Area) -- kategorie funkcjonalna
- **Priorytet** (Priority) -- kolejnosc prezentacji i naprawy (1 = najwyzszy)
- **Poziom** (Level) -- BLOCKER / WARNING / INFO
- **Komunikat PL** -- tresc wyswietlana uzytkownikowi (w jezyku polskim)
- **Fix Action ID** -- identyfikator akcji naprawczej (lub `null` jesli brak)
- **Fix Navigation** -- sciezka nawigacji do miejsca naprawy w interfejsie

---

## Poziomy walidacji

| Poziom | Znaczenie |
|--------|-----------|
| **BLOCKER** | Blokuje uruchomienie analizy. Musi byc naprawiony przed obliczeniami. |
| **WARNING** | Nie blokuje analizy, ale sygnalizuje potencjalny problem. Zalecana naprawa. |
| **INFO** | Informacja kontekstowa. Nie wymaga akcji naprawczej. |

---

## Obszary (Areas)

| Obszar | Opis |
|--------|------|
| SOURCES | Zrodla zasilania (GPZ, generatory) |
| TOPOLOGY | Topologia sieci (szyny, polaczenia, piersienie) |
| CATALOGS | Katalogi elementow (typy kabli, transformatorow) |
| STATIONS | Stacje SN/nN |
| GENERATORS | Zrodla rozproszone (PV, BESS, OZE) |
| PROTECTION | Ochrona (przekladniki, przekazniki, selektywnosc) |
| ANALYSIS | Analiza i Study Case |

---

## Kompletny slownik kodow gotowosci

### Zrodla zasilania i szyny (SOURCES / TOPOLOGY)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `source.sn_voltage_missing` | SOURCES | 1 | BLOCKER | Brak napiecia znamionowego SN zrodla zasilania | `fix_source_voltage` | panel: `inspector`, tab: `parametry`, modal: `null`, focus: `voltage_kv` |
| `bus.sn_voltage_missing` | TOPOLOGY | 1 | BLOCKER | Szyna nie ma zdefiniowanego napiecia SN | `fix_bus_voltage` | panel: `inspector`, tab: `parametry`, focus: `voltage_kv` |
| `source.connection_missing` | SOURCES | 2 | BLOCKER | Zrodlo zasilania nie jest podlaczone do szyny | `fix_source_connection` | panel: `inspector`, tab: `polaczenia` |
| `source.grid_supply_missing` | SOURCES | 1 | BLOCKER | Brak zrodla zasilania sieciowego (GPZ) | `fix_add_source` | panel: `wizard`, modal: `add_grid_source` |

### Odcinki SN (TOPOLOGY / CATALOGS)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `line.catalog_ref_missing` | CATALOGS | 3 | BLOCKER | Odcinek SN nie ma przypisanego katalogu | `fix_line_catalog` | panel: `inspector`, tab: `katalog`, modal: `select_catalog` |
| `line.length_missing` | TOPOLOGY | 2 | BLOCKER | Odcinek SN nie ma zdefiniowanej dlugosci | `fix_line_length` | panel: `inspector`, tab: `parametry`, focus: `length_km` |
| `line.type_missing` | TOPOLOGY | 2 | BLOCKER | Odcinek SN nie ma zdefiniowanego typu (kabel/linia) | `fix_line_type` | panel: `inspector`, tab: `parametry`, focus: `type` |

### Stacje (STATIONS)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `station.required_field_missing` | STATIONS | 3 | BLOCKER | Stacja nie ma wymaganego pola SN | `fix_station_field` | panel: `inspector`, tab: `pola`, modal: `add_field` |
| `station.transformer_required` | STATIONS | 2 | BLOCKER | Stacja SN/nN wymaga transformatora | `fix_station_transformer` | panel: `inspector`, tab: `transformator`, modal: `add_transformer_sn_nn` |
| `station.nn_bus_required` | STATIONS | 2 | BLOCKER | Stacja nie ma szyny nN | `fix_station_nn_bus` | panel: `inspector`, tab: `nn`, modal: `add_nn_bus` |
| `station.nn_outgoing_min_1` | STATIONS | 4 | WARNING | Stacja powinna miec co najmniej 1 odplyw nN | `fix_station_outgoing` | panel: `inspector`, tab: `nn`, modal: `add_nn_outgoing` |

### Pierscienie i NOP (TOPOLOGY)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `ring.nop_required` | TOPOLOGY | 3 | BLOCKER | Pierscien SN wymaga punktu normalnie otwartego (NOP) | `fix_ring_nop` | panel: `sld`, modal: `set_normal_open_point` |
| `terminal.not_open` | TOPOLOGY | 5 | INFO | Terminal magistrali jest zajety | `null` | `null` |
| `ring.endpoints_invalid` | TOPOLOGY | 2 | BLOCKER | Punkty koncowe pierscienia sa nieprawidlowe | `fix_ring_endpoints` | panel: `sld` |

### Strona nN (STATIONS / CATALOGS)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `nn.bus_required` | STATIONS | 2 | BLOCKER | Stacja wymaga szyny nN | `fix_nn_bus` | panel: `inspector`, tab: `nn` |
| `nn.main_breaker_required` | STATIONS | 3 | BLOCKER | Szyna nN wymaga wylacznika glownego | `fix_nn_breaker` | panel: `inspector`, tab: `nn` |
| `nn.outgoing_catalog_missing` | CATALOGS | 4 | WARNING | Odplyw nN nie ma katalogu | `fix_nn_outgoing_catalog` | panel: `inspector`, tab: `katalog` |
| `nn.load_parameters_missing` | STATIONS | 4 | WARNING | Odbior nN nie ma parametrow mocy | `fix_nn_load_params` | panel: `inspector`, tab: `parametry` |

### OZE -- zrodla rozproszone (GENERATORS / CATALOGS / ANALYSIS)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `pv.transformer_required` | GENERATORS | 1 | BLOCKER | Falownik PV wymaga transformatora w sciezce zasilania | `fix_pv_transformer` | panel: `inspector`, tab: `transformator` |
| `bess.transformer_required` | GENERATORS | 1 | BLOCKER | Falownik BESS wymaga transformatora w sciezce zasilania | `fix_bess_transformer` | panel: `inspector`, tab: `transformator` |
| `pv.inverter_catalog_missing` | CATALOGS | 3 | BLOCKER | Falownik PV nie ma katalogu | `fix_pv_catalog` | panel: `inspector`, tab: `katalog` |
| `bess.inverter_catalog_missing` | CATALOGS | 3 | BLOCKER | Falownik BESS nie ma katalogu | `fix_bess_catalog` | panel: `inspector`, tab: `katalog` |
| `bess.energy_missing` | GENERATORS | 2 | BLOCKER | Magazyn energii BESS nie ma parametrow pojemnosci | `fix_bess_energy` | panel: `inspector`, tab: `parametry` |
| `source.operating_mode_missing` | GENERATORS | 3 | BLOCKER | Zrodlo nN nie ma ustawionego trybu pracy | `fix_source_mode` | panel: `inspector`, tab: `tryb_pracy` |
| `dynamic.profile_invalid` | ANALYSIS | 4 | WARNING | Profil dynamiczny jest nieprawidlowy | `fix_dynamic_profile` | panel: `inspector`, tab: `profil` |

### Ochrona (PROTECTION)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `protection.ct_missing` | PROTECTION | 2 | BLOCKER | Pole nie ma przekladnika pradowego (CT) | `fix_add_ct` | panel: `inspector`, tab: `ochrona`, modal: `add_ct` |
| `protection.vt_missing` | PROTECTION | 3 | WARNING | Pole nie ma przekladnika napieciowego (VT) | `fix_add_vt` | panel: `inspector`, tab: `ochrona`, modal: `add_vt` |
| `protection.relay_missing` | PROTECTION | 2 | BLOCKER | Pole nie ma przekaznika ochronnego | `fix_add_relay` | panel: `inspector`, tab: `ochrona`, modal: `add_relay` |
| `protection.relay_settings_missing` | PROTECTION | 3 | BLOCKER | Przekaznik nie ma nastaw | `fix_relay_settings` | panel: `inspector`, tab: `ochrona`, modal: `relay_settings` |
| `protection.selectivity_failed` | PROTECTION | 4 | WARNING | Selektywnosc ochrony nie jest zapewniona | `fix_selectivity` | panel: `ochrona`, tab: `selektywnosc` |

### Analiza i Study Case (ANALYSIS)

| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Fix Action ID | Fix Navigation |
|-----|--------|-----------|--------|--------------|---------------|----------------|
| `analysis.blocked_by_readiness` | ANALYSIS | 1 | BLOCKER | Analiza zablokowana -- wymagane naprawienie problemow gotowosci | `fix_readiness` | panel: `readiness` |
| `study_case.invalid_state` | ANALYSIS | 2 | BLOCKER | Study Case ma nieprawidlowa konfiguracje | `fix_study_case` | panel: `study_case` |
| `study_case.profile_missing` | ANALYSIS | 3 | WARNING | Study Case nie ma profilu czasowego | `fix_study_case_profile` | panel: `study_case`, tab: `profil` |

---

## Podsumowanie statystyczne

| Poziom | Liczba kodow |
|--------|-------------|
| BLOCKER | 27 |
| WARNING | 7 |
| INFO | 1 |
| **Razem** | **35** |

| Obszar | Liczba kodow |
|--------|-------------|
| SOURCES | 4 |
| TOPOLOGY | 7 |
| CATALOGS | 4 |
| STATIONS | 6 |
| GENERATORS | 5 |
| PROTECTION | 5 |
| ANALYSIS | 4 |

---

## Zasady stosowania

### Kolejnosc prezentacji

Kody gotowosci sa prezentowane uzytkownikowi wedlug:
1. **Poziom** -- BLOCKER przed WARNING przed INFO
2. **Priorytet** -- nizszy numer = wyzszy priorytet (1 jest najwazniejszy)
3. **Obszar** -- alfabetycznie w ramach tego samego priorytetu

### Akcje naprawcze (Fix Actions)

- Kazdy kod z `Fix Action ID != null` posiada przypisana akcje naprawcza
- Akcja naprawcza otwiera odpowiedni panel/tab/modal w interfejsie uzytkownika
- Pole `focus` (jesli zdefiniowane) wskazuje konkretne pole formularza do uzupelnienia
- Kod `terminal.not_open` jest jedynym kodem bez akcji naprawczej (informacyjny)

### Blokada analizy

- Obecnosc **jakiegokolwiek** kodu BLOCKER uniemozliwia uruchomienie analizy
- Kod `analysis.blocked_by_readiness` jest kodem nadrzednym -- pojawia sie automatycznie gdy istnieja inne BLOCKERy
- Kody WARNING nie blokuja analizy, ale sa raportowane w wynikach

### Integracja z interfejsem

Schemat nawigacji (`Fix Navigation`) uzywa nastepujacego formatu:

```
panel: <nazwa_panelu>, tab: <nazwa_zakladki>, modal: <nazwa_modalu>, focus: <nazwa_pola>
```

Gdzie:
- `panel` -- glowny panel interfejsu (`inspector`, `wizard`, `sld`, `readiness`, `study_case`, `ochrona`)
- `tab` -- zakladka wewnatrz panelu
- `modal` -- okno modalne do otwarcia (opcjonalne)
- `focus` -- pole formularza do podswietlenia (opcjonalne)

---

## Historia zmian

| Data | Wersja | Opis |
|------|--------|------|
| 2026-02-17 | 1.0 | Utworzenie dokumentu -- kompletny slownik 35 kodow gotowosci |
