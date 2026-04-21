# Karty obiektow -- hardening inzynierski

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Data            | 2026-03-28                                                                   |
| Zakres          | 10 kart obiektow w `ui/network-build/cards/`                                 |
| Cel             | Dokumentacja sekcji, dodanych sekcji inzynierskich i stanu po hardeningu      |
| Status dokumentu| **ZAMKNIETY**                                                                |

---

## Architektura kart

Wszystkie karty dziedzicza z bazowego komponentu `ObjectCard` (`cards/ObjectCard.tsx`),
ktory definiuje:

- `CardSection` -- nazwana sekcja z lista pol
- `CardField` -- pole: etykieta + wartosc + opcjonalna jednostka
- `CardAction` -- przycisk akcji (np. "Zmien typ", "Przypisz katalog")
- `ObjectCardProps` -- props bazowe: `elementId`, `viewMode`, `sections`, `actions`

Tryby wyswietlania (`viewMode`):
- `MODEL_EDIT` -- edycja parametrow modelu
- `RESULT_VIEW` -- podglad wynikow analizy (readonly)

---

## Przeglad kart

### 1. SourceCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/SourceCard.tsx`                                                       |
| Element         | External Grid / GPZ                                                          |
| Sekcje bazowe   | Identyfikacja (nazwa, typ), Parametry zasilania (U_n [kV], S_kQ [MVA], R/X, typ: grid/generator) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): I_k3F [kA], I_k1F [kA], S_kQ potwierdzone [MVA], wklad do zwarcia [%] |
| Akcje           | Edytuj parametry                                                             |
| Uwagi           | Brak catalog_ref -- Source nie korzysta z katalogu (parametry GPZ bezposrednie). Zgodne z architektura. |

### 2. LineSegmentCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/LineSegmentCard.tsx`                                                  |
| Element         | Segment linii napowietrznej lub kablowej                                     |
| Sekcje bazowe   | Identyfikacja (nazwa, typ: overhead/cable), Parametry (dlugosc [km], catalog_ref, R1/X1/B1 zmaterializowane), Topologia (bus_from, bus_to) |
| Dodane sekcje   | **Rola w sieci** (badge: magistrala/odgalezienie/pierscien), **Wyniki analizy** (RESULT_VIEW): I_obciazenia [A], obciazalnosc termiczna [%], delta_U [%], straty P_loss [kW] |
| Akcje           | Zmien typ z katalogu, Edytuj parametry                                       |
| Uwagi           | Rola topologiczna pochodzi z `topologyStore.getElementRole(id)`.             |

### 3. TransformerCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/TransformerCard.tsx`                                                  |
| Element         | Transformator dwuuzwojeniowy SN/nN                                           |
| Sekcje bazowe   | Identyfikacja (nazwa, catalog_ref), Parametry znamionowe (S_n [kVA], U_HV/U_LV [kV], u_k [%], P_Cu [kW], P_Fe [kW], grupa polaczen), Topologia (bus_HV, bus_LV) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): obciazenie [%], I_HV/I_LV [A], straty [kW], spadek napiecia delta_U [%] |
| Akcje           | Zmien typ z katalogu, Edytuj parametry, Zmien zaczep                         |
| Uwagi           | Karta wyswietla takze przypisanie do pola stacji (bay_ref).                  |

### 4. SwitchCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/SwitchCard.tsx`                                                       |
| Element         | Lacznik / wylacznik / rozlacznik                                             |
| Sekcje bazowe   | Identyfikacja (nazwa, typ: breaker/disconnector/switch), Stan (otwarty/zamkniety, NOP: tak/nie), Parametry (I_n [A], I_dyn [kA] jesli z katalogu) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): I_przeplywajacy [A], zdolnosc laczeniowa -- wystarczajaca/niewystarczajaca |
| Akcje           | Przelacz stan, Oznacz jako NOP, Edytuj parametry                             |
| Uwagi           | Lacznik bez impedancji -- model idealny (Z = 0). Zgodne z benchmark.      |

### 5. StationCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/StationCard.tsx`                                                      |
| Element         | Stacja transformatorowa (kontener logiczny)                                  |
| Sekcje bazowe   | Identyfikacja (nazwa, typ: slupowa/wnektrzowa/kontenerowa), Pola SN (lista pol z przypisanymi elementami), Pola nN (lista pol nN) |
| Dodane sekcje   | **Przypisanie trafo do pola** -- wizualizacja relacji pole SN --> transformator --> pole nN, **Wyniki analizy** (RESULT_VIEW): sumaryczne obciazenie stacji [kVA], liczba odbiorow nN |
| Akcje           | Dodaj pole, Przypisz transformator, Edytuj stacje                            |
| Uwagi           | Station to kontener logiczny -- nie ma fizyki. Zgodne z NOT-A-SOLVER Rule.   |

### 6. NnSwitchgearCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/NnSwitchgearCard.tsx`                                                |
| Element         | Rozdzielnica niskiego napiecia (nN)                                          |
| Sekcje bazowe   | Identyfikacja (nazwa, stacja nadrzedna), Pola nN (lista pol z obwodami), Konfiguracja (system szyn, liczba pol) |
| Dodane sekcje   | **Bilans mocy**: P_zainstalowana [kW], P_szczytowa [kW], S_n_trafo [kVA], wspolczynnik obciazenia [%] z ostrzezeniem powyzej 80%, **Wyniki analizy** (RESULT_VIEW): napieciena szynach U [V], obciazenie trafo [%] |
| Akcje           | Dodaj pole nN, Edytuj konfiguracje                                          |
| Uwagi           | Bilans mocy to agregacja danych z modelu (suma P_load pol nN vs S_n_trafo nadrzednego). Nie jest to fizyka -- to prezentacja danych modelu. |

### 7. GeneratorCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | Renderowany przez `ObjectCard` z dynamicznymi sekcjami                       |
| Element         | Generator synchroniczny / asynchroniczny                                     |
| Sekcje bazowe   | Identyfikacja (nazwa, catalog_ref), Parametry (P_n [kW], S_n [kVA], cos_phi, U_n [kV], X''d [%]), Topologia (bus przylaczenia) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): wklad do pradu zwarciowego I_kG [kA], moc oddawana P [kW], Q [kvar] |
| Akcje           | Zmien typ z katalogu, Edytuj parametry                                       |

### 8. BusCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | Renderowany przez `ObjectCard` z dynamicznymi sekcjami                       |
| Element         | Wezel elektryczny (Bus / Terminal)                                           |
| Sekcje bazowe   | Identyfikacja (nazwa, U_n [kV], typ: junction/terminal), Polaczenia (lista galezi przylaczonych) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): U [kV], delta_U [%], I_k3F [kA], I_k1F [kA] |
| Akcje           | Nawiguj do elementu na SLD                                                   |

### 9. BayCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/BayCard.tsx`                                                          |
| Element         | Pole rozdzielcze (bay) w stacji SN                                           |
| Sekcje bazowe   | Identyfikacja (nazwa, stacja nadrzedna, pozycja), Urzadzenia (wylacznik, przekladniki, zabezpieczenie), Przylaczone elementy (linia/kabel/trafo) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): I_obciazenia [A], I_k3F w punkcie pola [kA], stan zabezpieczenia (aktywne/nieaktywne) |
| Akcje           | Dodaj urzadzenie, Przypisz zabezpieczenie, Edytuj pole                       |

### 10. RenewableSourceCard

| Pole            | Wartosc                                                                      |
|-----------------|------------------------------------------------------------------------------|
| Plik            | `cards/RenewableSourceCard.tsx`                                              |
| Element         | Zrodlo OZE (PV / wiatr / BESS)                                              |
| Sekcje bazowe   | Identyfikacja (nazwa, typ OZE: pv/wind/bess), Parametry (P_inst [kWp], P_n [kW], cos_phi, typ falownika), Topologia (bus przylaczenia) |
| Dodane sekcje   | **Wyniki analizy** (RESULT_VIEW): moc generowana P [kW], Q [kvar], wklad do zwarcia I_kOZE [kA], wplyw na profil napiecia delta_U [%] |
| Akcje           | Edytuj parametry                                                             |
| Uwagi           | Brak catalog_ref -- parametry OZE definiowane bezposrednio (podobnie jak Source). |

---

## Macierz dodanych sekcji

| Karta              | Wyniki analizy (RESULT_VIEW) | Bilans mocy | Rola w sieci | Przypisanie trafo |
|--------------------|:----------------------------:|:-----------:|:------------:|:-----------------:|
| SourceCard         | TAK                          | --          | --           | --                |
| LineSegmentCard    | TAK                          | --          | TAK          | --                |
| TransformerCard    | TAK                          | --          | --           | --                |
| SwitchCard         | TAK                          | --          | --           | --                |
| StationCard        | TAK                          | --          | --           | TAK               |
| NnSwitchgearCard   | TAK                          | TAK         | --           | --                |
| GeneratorCard      | TAK                          | --          | --           | --                |
| BusCard            | TAK                          | --          | --           | --                |
| BayCard            | TAK                          | --          | --           | --                |
| RenewableSourceCard| TAK                          | --          | --           | --                |

---

## Weryfikacja

- Testy: `cardAnalysisResults.test.ts` -- pokrycie sekcji wynikow dla kazdej karty
- Guard: `scripts/overlay_no_physics_guard.py` -- potwierdzenie braku fizyki w kartach
- CI: frontend-checks workflow -- green

**Status: ZAMKNIETY**

