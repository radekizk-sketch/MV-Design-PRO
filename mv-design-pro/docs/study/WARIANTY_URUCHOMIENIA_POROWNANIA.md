# Warianty, uruchomienia i porownania â€” specyfikacja Study Case

| Pole           | Wartosc                                      |
|----------------|----------------------------------------------|
| **Status**     | BINDING                                      |
| **Wersja**     | 1.0                                          |
| **Data**       | 2026-02-17                                   |
| **Wlasciciel** | MV-Design-PRO â€” warstwa domenowa             |
| **Dokument**   | WARIANTY_URUCHOMIENIA_POROWNANIA.md          |

---

## 1. Definicja Study Case (wariant obliczeniowy)

Study Case (wariant obliczeniowy) to **scenariusz obliczeniowy**, ktory odwoluje sie do
**jednego modelu sieci** (NetworkModel) w trybie tylko do odczytu.

**Reguly bezwzgledne:**

- Wariant **NIE MODYFIKUJE** modelu sieci.
- Wariant przechowuje **WYLACZNIE** parametry obliczeniowe.
- Wiele wariantow moze odwolywac sie do tego samego modelu.
- W danym momencie aktywny jest **dokladnie jeden** wariant.
- Model sieci jest **wspoldzielony** â€” Kreator i SLD edytuja ten sam model.

### 1.1. Analogia z DIgSILENT benchmark

| MV-Design-PRO        | benchmark            | Opis                                    |
|-----------------------|-------------------------|-----------------------------------------|
| NetworkModel          | Network Model           | Jeden model topologiczny per projekt     |
| Study Case (wariant)  | Study Case              | Scenariusz obliczeniowy                  |
| Parametry wariantu    | Calculation Parameters  | c-factor, tolerancje, profil czasowy     |
| Stan lacznikow        | Switching State         | Nadpisanie stanu lacznikow per wariant   |

---

## 2. Parametry wariantu obliczeniowego

Wariant przechowuje nastepujace parametry:

### 2.1. Parametry ogolne

| Parametr                      | Typ     | Jednostka | Domyslnie | Opis                                          |
|-------------------------------|---------|-----------|-----------|-----------------------------------------------|
| `nazwa`                       | string  | â€”         | â€”         | Nazwa wariantu (unikalna w projekcie)         |
| `opis`                        | string  | â€”         | ""        | Opis tekstowy wariantu                        |
| `data_utworzenia`              | datetime| â€”         | now()     | Data utworzenia wariantu                       |
| `data_ostatniego_uruchomienia`| datetime| â€”         | null      | Data ostatniego uruchomienia obliczen         |

### 2.2. Parametry obliczen zwarciowych (IEC 60909)

| Parametr                      | Typ     | Jednostka | Domyslnie | Opis                                          |
|-------------------------------|---------|-----------|-----------|-----------------------------------------------|
| `wspolczynnik_c_max`          | float   | â€”         | 1.10      | Wspolczynnik napiecia c (max) wg IEC 60909   |
| `wspolczynnik_c_min`          | float   | â€”         | 1.00      | Wspolczynnik napiecia c (min) wg IEC 60909   |
| `moc_bazowa`                  | float   | MVA       | 100.0     | Moc bazowa ukladu                             |
| `tolerancja`                  | float   | â€”         | 1e-6      | Tolerancja zbiĐµĐ·nosci obliczen                |
| `czas_cieplny`                | float   | s         | 1.0       | Czas odniesienia dla pradu cieplnego Ith      |
| `wklad_silnikow`              | bool    | â€”         | false     | Uwzglednienie wkladu silnikow asynchronicznych|
| `wklad_falownikow`            | bool    | â€”         | false     | Uwzglednienie wkladu zrodel falownikowych (OZE)|

### 2.3. Nadpisania stanu lacznikow (per wariant)

| Parametr                      | Typ                     | Opis                                          |
|-------------------------------|-------------------------|-----------------------------------------------|
| `nadpisania_lacznikow`        | Map<UUID, StanLacznika> | Nadpisanie stanu lacznikow wzgledem modelu    |

Gdzie `StanLacznika` to:

| Wartosc       | Opis                                |
|---------------|-------------------------------------|
| `ZAMKNIETY`   | Lacznik zamkniety (przewodzi)       |
| `OTWARTY`     | Lacznik otwarty (nie przewodzi)     |
| `BEZ_ZMIANY`  | Stan z modelu sieci (domyslnie)     |

### 2.4. Przypisania profili czasowych (per wariant)

| Parametr                      | Typ                      | Opis                                          |
|-------------------------------|--------------------------|-----------------------------------------------|
| `profile_czasowe`             | Map<UUID, ProfilCzasowy> | Przypisanie profili obciazen/generacji do elementow |

Profil czasowy pozwala na zmiane obciazenia/generacji bez modyfikacji modelu sieci.

### 2.5. Tryb pracy zrodla

| Parametr                      | Typ     | Opis                                          |
|-------------------------------|---------|-----------------------------------------------|
| `tryb_zrodla`                 | Map<UUID, TrybZrodla>    | Nadpisanie trybu pracy zrodla per wariant |

Gdzie `TrybZrodla` to:

| Wartosc            | Opis                                         |
|--------------------|----------------------------------------------|
| `NORMALNA_PRACA`   | Zrodlo pracuje normalnie                     |
| `WYLACZONE`        | Zrodlo wylaczone z pracy                     |
| `AWARIA`           | Zrodlo w trybie awaryjnym                    |

---

## 3. Cykl zycia wariantu

### 3.1. Stany wariantu

```
                    â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚                  â”‚
     utworzenie     â”‚      NONE        â”‚  Brak wynikow
     â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€> â”‚  (brak wynikow)  â”‚
                    â”‚                  â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                             â”‚
                    uruchomienie obliczen
                    (pomyslne)
                             â”‚
                             v
                    â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚                  â”‚
                    â”‚      FRESH       â”‚  Wyniki aktualne
                    â”‚  (wyniki aktualne)â”‚
                    â”‚                  â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                             â”‚
                    zmiana modelu sieci
                             â”‚
                             v
                    â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚                  â”‚
                    â”‚    OUTDATED      â”‚  Wyniki nieaktualne
                    â”‚  (nieaktualne)   â”‚
                    â”‚                  â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                             â”‚
                    ponowne uruchomienie
                    (pomyslne)
                             â”‚
                             v
                    â”Śâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                    â”‚                  â”‚
                    â”‚      FRESH       â”‚  Wyniki aktualne
                    â”‚  (wyniki aktualne)â”‚
                    â”‚                  â”‚
                    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
```

### 3.2. Przejscia stanow

| Przejscie            | Warunek                                          | Skutek                              |
|----------------------|--------------------------------------------------|-------------------------------------|
| NONE -> FRESH        | Pomyslne uruchomienie obliczen                   | Wyniki zapisane z artefaktami       |
| FRESH -> OUTDATED    | Zmiana w modelu sieci (topologia, parametry)     | Wyniki oznaczone jako nieaktualne   |
| OUTDATED -> FRESH    | Ponowne pomyslne uruchomienie obliczen           | Nowe wyniki zastepuja stare         |
| Dowolny -> NONE      | Klonowanie wariantu                              | Nowy wariant BEZ wynikow            |

### 3.3. Klonowanie wariantu

Klonowanie tworzy nowy wariant z:

- **Kopiowane**: wszystkie parametry obliczeniowe, nadpisania lacznikow, profile czasowe.
- **NIE kopiowane**: wyniki obliczen, artefakty, slad obliczen.
- **Stan nowego wariantu**: `NONE`.
- **Nazwa**: `{oryginalna_nazwa} (kopia)`.

---

## 4. Uruchomienie obliczen

### 4.1. Deterministyczny identyfikator uruchomienia

Kazde uruchomienie obliczen otrzymuje deterministyczny identyfikator:

$$
\text{run\_id} = \text{SHA-256}(\text{snapshot\_hash} \| \text{case\_config\_hash} \| \text{analysis\_type})
$$

gdzie:

| Skladnik            | Opis                                                |
|---------------------|-----------------------------------------------------|
| `snapshot_hash`     | SHA-256 calego modelu sieci (topologia + parametry) |
| `case_config_hash`  | SHA-256 konfiguracji wariantu                       |
| `analysis_type`     | Typ analizy: `SC3F`, `SC1F`, `POWER_FLOW`          |

**Determinizm**: identyczne dane wejsciowe daja identyczny `run_id`.

### 4.2. Artefakty uruchomienia

Po pomyslnym uruchomieniu zapisywane sa:

| Artefakt        | Format    | Opis                                          | Wersjonowanie     |
|-----------------|-----------|-----------------------------------------------|--------------------|
| Wyniki          | JSON      | Pelne wyniki obliczen                         | `run_id` + hash    |
| Nakladki SLD    | JSON      | Dane nakladek na schemat jednokreskowy        | `run_id` + hash    |
| Slad obliczen   | JSON      | TraceArtifact â€” pelny slad White Box          | `run_id` + hash    |
| Metadane        | JSON      | Czas obliczen, wersje solwerow, parametry     | `run_id` + hash    |

### 4.3. Zasada jednego aktywnego wariantu

- W danym momencie **dokladnie jeden** wariant moze byc aktywny.
- Aktywny wariant okresla, ktore wyniki sa wyswietlane w SLD i inspektorze.
- Zmiana aktywnego wariantu **nie uruchamia** obliczen â€” jedynie przelacza widok.
- Jezeli aktywny wariant ma stan `OUTDATED`, wyswietlane jest ostrzezenie.

---

## 5. Porownywanie wariantow

### 5.1. Porownanie parametrow wejsciowych

Porownanie dwoch wariantow na poziomie konfiguracji:

| Kategoria               | Porownywane elementy                                   |
|--------------------------|-------------------------------------------------------|
| Parametry obliczeniowe   | c-factor, moc bazowa, tolerancja, czas cieplny        |
| Stan lacznikow           | Roznice w nadpisaniach stanow lacznikow               |
| Profile czasowe          | Roznice w przypisaniach profili                        |
| Tryb zrodel              | Roznice w trybach pracy zrodel                         |
| Topologia                | Roznice w topologii (jesli snapshot rozny)             |

### 5.2. Porownanie wynikow

Porownanie wynikow dwoch wariantow (oba musza miec stan FRESH):

| Wielkosc                  | Jednostka | Porownanie                                    |
|---------------------------|-----------|-----------------------------------------------|
| Napiecia wezlowe          | kV, p.u.  | Delta napiecia per szynĐ°                      |
| Prady galezi              | A         | Delta pradu per galaz                          |
| Prady zwarciowe           | kA        | Delta pradow zwarciowych per szyna             |
| Moc zwarciowa             | MVA       | Delta mocy zwarciowej per szyna                |
| Straty mocy               | kW        | Delta strat per galaz                          |
| Spadki napiecia           | %         | Delta spadkow napiecia per galaz               |

### 5.3. Nakladka roznicowa SLD

Schemat jednokreskowy z kolorystyka roznicowa:

| Kolor         | Znaczenie                                              |
|---------------|--------------------------------------------------------|
| Zielony       | Wartosc w wariancie B jest lepsza (mniejsza) niz w A  |
| Czerwony      | Wartosc w wariancie B jest gorsza (wieksza) niz w A   |
| Szary         | Brak roznicy lub roznica ponizej progu                 |
| Niebieski     | Element obecny tylko w jednym wariancie                |

**Ograniczenie**: nakladka roznicowa **NIE zmienia geometrii** schematu.
Zmiana kolorystyki i etykiet jedynie.

### 5.4. Porownanie tabelaryczne

Tabela porownawcza z kolumnami:

| Element | Wielkosc   | Wariant A | Wariant B | Delta   | Delta [%] |
|---------|------------|-----------|-----------|---------|-----------|
| Szyna 1 | U [kV]    | 15.12     | 14.98     | -0.14   | -0.93%    |
| Szyna 2 | I''k [kA] | 12.45     | 13.01     | +0.56   | +4.50%    |

---

## 6. Operacje domenowe

### 6.1. Zarzadzanie wariantami

| Operacja                | Sygnatura                                                      | Opis                                           |
|-------------------------|----------------------------------------------------------------|-------------------------------------------------|
| `create_study_case`     | `create_study_case(nazwa, opis?, parametry?) -> StudyCase`     | Utworz nowy wariant obliczeniowy                |
| `clone_study_case`      | `clone_study_case(case_id) -> StudyCase`                       | Klonuj wariant (stan NONE, bez wynikow)        |
| `delete_study_case`     | `delete_study_case(case_id) -> void`                           | Usun wariant i jego artefakty                  |
| `set_active_case`       | `set_active_case(case_id) -> void`                             | Ustaw wariant jako aktywny                     |

### 6.2. Konfiguracja wariantu

| Operacja                    | Sygnatura                                                          | Opis                                           |
|-----------------------------|--------------------------------------------------------------------|-------------------------------------------------|
| `set_case_switch_state`     | `set_case_switch_state(case_id, switch_id, stan) -> void`          | Nadpisz stan lacznika w wariancie              |
| `set_case_normal_state`     | `set_case_normal_state(case_id) -> void`                           | Przywroc wszystkie laczniki do stanu modelu    |
| `set_case_source_mode`      | `set_case_source_mode(case_id, source_id, tryb) -> void`          | Ustaw tryb pracy zrodla w wariancie            |
| `set_case_time_profile`     | `set_case_time_profile(case_id, element_id, profil_id) -> void`   | Przypisz profil czasowy do elementu            |

### 6.3. Uruchomienie obliczen

| Operacja                | Sygnatura                                                      | Opis                                           |
|-------------------------|----------------------------------------------------------------|-------------------------------------------------|
| `run_short_circuit`     | `run_short_circuit(case_id, typ_zwarcia) -> RunResult`         | Uruchom obliczenia zwarciowe                   |
| `run_power_flow`        | `run_power_flow(case_id) -> RunResult`                         | Uruchom obliczenia przeplywowe                 |

### 6.4. Porownywanie

| Operacja                | Sygnatura                                                      | Opis                                           |
|-------------------------|----------------------------------------------------------------|-------------------------------------------------|
| `compare_study_cases`   | `compare_study_cases(case_a_id, case_b_id) -> ComparisonResult`| Porownaj dwa warianty                          |

---

## 7. Kody gotowosci

| Kod                                    | Opis                                                    | Blokuje uruchomienie? |
|----------------------------------------|---------------------------------------------------------|-----------------------|
| `study_case.missing_base_snapshot`     | Brak migawki bazowej modelu sieci                       | TAK                   |
| `study_case.parameters_incomplete`     | Niekompletne parametry obliczeniowe                     | TAK                   |
| `study_case.results_outdated`          | Wyniki nieaktualne (model zmieniony)                    | OSTRZEZENIE           |
| `analysis.blocked_by_readiness`        | Analiza zablokowana przez niespelinione kody gotowosci  | TAK                   |
| `study_case.network_validation_failed` | Walidacja modelu sieci nie powiodla sie                 | TAK                   |

---

## 8. Walidacja przed uruchomieniem

Przed kazdym uruchomieniem obliczen system wykonuje:

1. **Walidacja modelu sieci** (NetworkValidator):
   - Spojnosc topologii (brak odizolowanych szyn bez zrodla).
   - Kompletnosc parametrow elementow.
   - Poprawnosc przekladni transformatorow.
   - Brak fikcyjnych elementow.

2. **Walidacja konfiguracji wariantu**:
   - Wszystkie wymagane parametry ustawione.
   - Nadpisania lacznikow odwoluja sie do istniejacych lacznikow.
   - Profile czasowe przypisane do istniejacych elementow.

3. **Sprawdzenie kodow gotowosci**:
   - Wszystkie kody z statusem TAK musza byc spelnione.
   - Kody z statusem OSTRZEZENIE generuja ostrzezenie, ale nie blokuja.

---

## 9. Powiazania z innymi warstwami

| Warstwa          | Relacja                                                        |
|------------------|----------------------------------------------------------------|
| Model sieci      | Wariant odczytuje model (read-only), nie modyfikuje            |
| Solwer SC        | Wariant przekazuje parametry, solwer zwraca wyniki             |
| Solwer PF        | Wariant przekazuje parametry, solwer zwraca wyniki             |
| Analiza ochrony  | Korzysta z wynikow wariantu do analizy selektywnosci           |
| SLD              | Wyswietla wyniki aktywnego wariantu, nakladka roznicowa        |
| Inspektor sladu  | Slad obliczen powiazany z run_id wariantu                      |
| Eksport          | Wariant jako czesc pakietu projektu                            |

---

## 10. Ograniczenia i zalozenia

1. Jeden model sieci per projekt â€” warianty nie tworza kopii modelu.
2. Wyniki obliczen sa **niezmiennicze** â€” nie mozna ich recznie edytowac.
3. Zmiana dowolnego parametru modelu sieci powoduje przejscie **wszystkich** wariantow do stanu OUTDATED.
4. Porownanie wymaga, aby oba warianty mialy stan FRESH.
5. Maksymalna liczba wariantow per projekt: **brak limitu** (ograniczenie techniczne: pamiec i dysk).
6. Artefakty starszych uruchomien sa archiwizowane, ale nie usuwane automatycznie.

---

*Koniec dokumentu. Status: BINDING. Wersja: 1.0. Data: 2026-02-17.*

