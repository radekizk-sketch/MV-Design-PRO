# Akcje kontekstowe sieci SN — dokument wiazacy

| Pole              | Wartosc                                          |
|-------------------|--------------------------------------------------|
| Status            | **BINDING**                                      |
| Wersja            | 1.0                                              |
| Data              | 2026-02-20                                       |
| Warstwa           | Prezentacja + Aplikacja (Menu kontekstowe + Kreator SLD) |
| Jezyk             | Polski (bez anglicyzmow w etykietach UI)         |

> **REGULA**: Ten dokument definiuje 5 kontekstow akcji (K1-K5) dostepnych
> na schemacie SLD w trybie budowy sieci SN. Kazda akcja jest mapowana 1:1
> na operacje domenowa z rejestru kanonicznego (`canonical_operations.py`).

---

## Spis tresci

1. [Zasady nadrzedne](#1-zasady-nadrzedne)
2. [Konteksty akcji (K1-K5)](#2-konteksty-akcji-k1-k5)
3. [K1: Puste tlo SLD](#3-k1-puste-tlo-sld)
4. [K2: Otwarty terminal magistrali](#4-k2-otwarty-terminal-magistrali)
5. [K3: Segment SN (kabel/linia)](#5-k3-segment-sn-kabellinia)
6. [K4: Port odgalezienia](#6-k4-port-odgalezienia)
7. [K5: Tryb laczenia koncow](#7-k5-tryb-laczenia-koncow)
8. [Bramka katalogowa (podwojna: UI + BE)](#8-bramka-katalogowa-podwojna-ui--be)
9. [Skroty klawiszowe](#9-skroty-klawiszowe)
10. [Kody bledow i komunikaty PL](#10-kody-bledow-i-komunikaty-pl)
11. [Efekty SLD po kazdej akcji](#11-efekty-sld-po-kazdej-akcji)
12. [Zwiazek z istniejacymi dokumentami](#12-zwiazek-z-istniejacymi-dokumentami)

---

## 1. Zasady nadrzedne

### 1.1 Kontekst = to co uzytkownik wskazuje

Dostepne akcje wynikaja z obiektu wskazywanego na schemacie SLD.
Nie ma kreatora wielokrokowego. Jest: **1 klik → 1 modal → 1 operacja → nowy Snapshot → SLD**.

### 1.2 Bramka katalogowa jest OBOWIAZKOWA

Segment SN i transformator SN/nN **NIE MOGA** byc utworzone bez katalogu.
Brama dziala na dwoch warstwach:

| Warstwa | Mechanizm | Kod bledu |
|---------|-----------|-----------|
| **UI (frontend)** | CatalogPicker wyswietlany PRZED wyslaniem operacji | `catalog.binding_required` |
| **BE (backend)** | 422 HTTP jesli payload nie zawiera `catalog_binding` | `catalog.binding_required` |

### 1.3 Pierscien i rezerwa sa OPCJONALNE

Zamkniecie pierscienia (K5) i polaczenie rezerwowe nie sa krokami obowiazkowymi.
Uzytkownik moze budowac siec wyłacznie radialna.
NOP jest wymagany TYLKO jesli uzytkownik zamknie pierscien.

### 1.4 SLD rysuje ZAWSZE

Brak danych (np. brak katalogu na segmencie importowanym) blokuje ANALIZY,
nigdy rysowanie SLD. Elementy bez katalogu sa rysowane z oznaczeniem wizualnym
(ikonka ostrzezenia).

### 1.5 Determinizm

Kazda akcja produkuje deterministyczny Snapshot:
```
h(Snapshot[n+1]) = sha256(h(Snapshot[n]) + canonical_json(operation + payload))
```

---

## 2. Konteksty akcji (K1-K5)

```
┌─────────────────────────────────────────────────────────────────┐
│                        SCHEMAT SLD                               │
│                                                                   │
│  K1: Puste tlo      K2: Terminal ○──     K3: Segment ═══        │
│  (prawy klik        (koniec magistrali)  (odcinek kabla)        │
│   na nic)                                                        │
│                      K4: Port ●──        K5: Tryb laczenia      │
│                      (punkt odgalezienia) (rezerwowy/pierscien)  │
└─────────────────────────────────────────────────────────────────┘
```

### Tablica kontekstow

| Kontekst | Obiekt docelowy | Warunek dostepnosci | Akcje |
|----------|-----------------|---------------------|-------|
| **K1** | Puste tlo SLD | Brak elementow lub chcesz zaczac od nowa | Dodaj GPZ, Importuj projekt |
| **K2** | Otwarty terminal magistrali | Status terminala = `OTWARTY` | Kontynuuj segment, Polacz konce, Wstaw lacznik |
| **K3** | Segment SN (kabel/linia) | Segment istnieje na magistrali | Wstaw stacje, Wstaw punkt odgal., Wstaw lacznik sekcyjny |
| **K4** | Port odgalezienia | Port z wolnym slotem na szynie stacji | Dodaj odgalezienie |
| **K5** | Tryb laczenia koncow | Dwa terminale wskazane | Polaczenie rezerwowe, Pierscien + NOP |

---

## 3. K1: Puste tlo SLD

### Warunek
- Uzytkownik klika prawy przycisk na pustym tle schematu SLD
- LUB model nie ma jeszcze zrodla zasilania

### Dostepne akcje

| # | Etykieta PL | Operacja domenowa | Wymaga katalogu | Payload |
|---|-------------|-------------------|-----------------|---------|
| 1 | Dodaj GPZ (zrodlo zasilania SN) | `add_grid_source_sn` | NIE | `{ source_name, voltage_kv, sk3_mva, rx_ratio }` |
| 2 | Importuj projekt z pliku | (import flow) | NIE (ale uruchamia mapowanie) | `{ file_path, format }` |

### Walidacja payload (add_grid_source_sn)

| Pole | Typ | Wymagane | Walidacja |
|------|-----|----------|-----------|
| `source_name` | string | NIE (domyslna nazwa) | max 200 znakow |
| `voltage_kv` | float | TAK | > 0, typowe: 6, 10, 15, 20, 30 |
| `sk3_mva` | float | TAK | > 0 |
| `rx_ratio` | float | NIE | > 0, domyslnie z normy |

### Efekt SLD
- Pojawia sie blok GPZ z szyna SN i symbolem zrodla
- Automatycznie tworzy sie magistrala (corridor) z pustym zestawem segmentow
- Terminal magistrali (koniec) jest w stanie `OTWARTY`

### Warunek blokujacy
- Jesli model JUZ MA zrodlo: `source.already_exists` → komunikat PL

---

## 4. K2: Otwarty terminal magistrali

### Warunek
- Uzytkownik klika prawy przycisk na terminalu magistrali
- Status terminala: `OTWARTY` (< 2 polaczenia kablowe)

### Dostepne akcje

| # | Etykieta PL | Operacja domenowa | Wymaga katalogu | Payload |
|---|-------------|-------------------|-----------------|---------|
| 1 | Dodaj odcinek magistrali | `continue_trunk_segment_sn` | **TAK** (KABEL_SN) | `{ trunk_id, from_terminal_id, segment: { rodzaj, dlugosc_m, catalog_binding } }` |
| 2 | Polacz konce (rezerwa) | → przejscie do trybu K5 | — | Aktywacja trybu laczenia |
| 3 | Wstaw lacznik na terminalu | `insert_section_switch_sn` | TAK (APARAT_SN) | `{ segment_id, switch_type, catalog_binding }` |

### Akcja 1: Dodaj odcinek magistrali (SZCZEGOLOWY FLOW)

```
1. Uzytkownik klika terminal → menu kontekstowe → "Dodaj odcinek magistrali..."
2. [UI] Otwiera CatalogPicker (namespace: KABEL_SN)
   - Filtrowanie: producent, napiecie, przekroj, typ przewodu
   - Uzytkownik MUSI wybrac pozycje katalogowa
3. [UI] Po wyborze: modal z polami:
   - Rodzaj: KABEL / LINIA NAPOWIETRZNA (domyslnie: KABEL)
   - Dlugosc [m]: pole numeryczne (> 0, brak domyslnej wartosci)
   - Nazwa odcinka: opcjonalne
4. [UI] Zatwierdzenie → POST /api/v1/domain-ops/execute
   {
     operation: "continue_trunk_segment_sn",
     payload: {
       trunk_id: "gpz/.../corridor_01",
       from_terminal_id: "bus/.../downstream",
       segment: {
         rodzaj: "KABEL",
         dlugosc_m: 350,
         catalog_binding: {
           namespace: "KABEL_SN",
           item_id: "YAKXS_3x120",
           version: "2024.1"
         }
       }
     }
   }
5. [BE] _enforce_catalog_binding → OK (binding obecny)
6. [BE] continue_trunk_segment_sn → nowy Snapshot
7. [SLD] Render: nowy odcinek, nowy terminal na koncu
```

### Warunek blokujacy
- Terminal w stanie `ZAJETY`: akcja "Dodaj odcinek magistrali" UKRYTA (nie zablokowana)
- Terminal w stanie `ZAREZERWOWANY_DLA_RINGU`: akcja "Polacz konce" WIDOCZNA, inne ukryte

---

## 5. K3: Segment SN (kabel/linia)

### Warunek
- Uzytkownik klika prawy przycisk na odcinku SN (kabel lub linia napowietrzna)
- Segment jest czescia magistrali lub odgalezienia

### Dostepne akcje

| # | Etykieta PL | Operacja domenowa | Wymaga katalogu | Payload |
|---|-------------|-------------------|-----------------|---------|
| 1 | Wstaw stacje SN/nN (A) | `insert_station_on_segment_sn` | **TAK** (TRAFO_SN_NN) | `{ segment_id, station_type: "A", transformer: { catalog_binding }, ... }` |
| 2 | Wstaw stacje SN/nN (B) | `insert_station_on_segment_sn` | **TAK** (TRAFO_SN_NN) | `{ ..., station_type: "B", ... }` |
| 3 | Wstaw stacje SN/nN (C) | `insert_station_on_segment_sn` | **TAK** (TRAFO_SN_NN) | `{ ..., station_type: "C", ... }` |
| 4 | Wstaw stacje SN/nN (D) | `insert_station_on_segment_sn` | **TAK** (TRAFO_SN_NN) | `{ ..., station_type: "D", ... }` |
| 5 | Wstaw lacznik sekcyjny | `insert_section_switch_sn` | TAK (APARAT_SN) | `{ segment_id, switch_type, catalog_binding }` |
| 6 | Wstaw punkt odgalezienia | (tworzy port K4) | NIE | `{ segment_id, insert_at }` |
| 7 | Przypisz katalog do odcinka | `assign_catalog_to_element` | TAK | `{ element_ref, catalog_item_id }` |
| 8 | Zmien dlugosc odcinka | `update_element_parameters` | NIE | `{ element_ref, parameters: { length_m } }` |

### Akcja 1-4: Wstaw stacje (SZCZEGOLOWY FLOW)

```
1. Uzytkownik klika segment → menu kontekstowe → "Wstaw stacje SN/nN (A)..."
2. [UI] Otwiera CatalogPicker (namespace: TRAFO_SN_NN)
   - Filtrowanie: moc znamionowa, napiecie SN/nN, grupa polaczen, producent
   - Uzytkownik MUSI wybrac pozycje katalogowa transformatora
3. [UI] Po wyborze: modal z polami:
   - Nazwa stacji: opcjonalne
   - Napiecie nN [kV]: 0.4 (domyslnie), edytowalne
   - Miejsce wstawienia: suwak 0-100% lub odleglosc [m]
   - Pola SN: lista checkboxow (IN, OUT, TR, COUPLER)
   - Liczba odplywow nN: pole numeryczne (min 1)
4. [UI] Zatwierdzenie → POST /api/v1/domain-ops/execute
   {
     operation: "insert_station_on_segment_sn",
     payload: {
       segment_id: "seg/.../segment",
       station: {
         station_type: "A",
         station_name: "Stacja T1",
         nn_voltage_kv: 0.4
       },
       insert_at: { mode: "RATIO", value: 0.5 },
       sn_fields: ["IN", "OUT", "TR"],
       transformer: {
         create: true,
         catalog_binding: {
           namespace: "TRAFO_SN_NN",
           item_id: "ONAN_630",
           version: "2024.1"
         }
       },
       nn_block: {
         outgoing_feeders_nn_count: 4
       }
     }
   }
5. [BE] _enforce_catalog_binding → OK (transformer catalog_binding obecny)
6. [BE] insert_station_on_segment_sn → rozdzielenie segmentu, blok stacji
7. [SLD] Render: blok stacji z polami SN, transformatorem, szyna nN, odplywami
```

### Efekt SLD
- Segment podzielony na dwa (lewy + prawy) z zachowaniem katalogu oryginalnego segmentu
- Blok stacji: szyna SN → pola SN → transformator → szyna nN → wylacznik glowny → odplywy
- Nowe terminale na koncu odgalezien stacji

---

## 6. K4: Port odgalezienia

### Warunek
- Uzytkownik klika prawy przycisk na punkcie odgalezienia (junction/branch port)
- Port ma wolny slot

### Dostepne akcje

| # | Etykieta PL | Operacja domenowa | Wymaga katalogu | Payload |
|---|-------------|-------------------|-----------------|---------|
| 1 | Dodaj odgalezienie | `start_branch_segment_sn` | **TAK** (KABEL_SN) | `{ from_port_ref, segment: { rodzaj, dlugosc_m, catalog_binding } }` |

### Szczegolowy flow

```
1. Uzytkownik klika port → menu kontekstowe → "Dodaj odgalezienie..."
2. [UI] Otwiera CatalogPicker (namespace: KABEL_SN)
3. [UI] Modal: rodzaj, dlugosc, nazwa
4. [UI] POST operacji start_branch_segment_sn z catalog_binding
5. [BE] Walidacja + wykonanie → nowy segment + terminal
6. [SLD] Render: nowe odgalezienie od punktu na magistrali
```

---

## 7. K5: Tryb laczenia koncow

### Warunek
- Uzytkownik aktywuje tryb laczenia koncow (z K2 lub z menu glownego)
- Wymagane: dwa terminale w stanie `OTWARTY` na roznych magistralach lub na tej samej

### Dostepne akcje

| # | Etykieta PL | Operacja domenowa | Wymaga katalogu | Payload |
|---|-------------|-------------------|-----------------|---------|
| 1 | Polaczenie rezerwowe | `connect_secondary_ring_sn` | TAK (KABEL_SN) | `{ a_ref, b_ref, segment: { catalog_binding } }` |
| 2 | Zamknij pierscien (ring) | `connect_secondary_ring_sn` + `set_normal_open_point` | TAK (KABEL_SN) | `{ a_ref, b_ref, nop_required: true }` |

### Flow: Pierscien z NOP

```
1. Uzytkownik w trybie K5 klika terminal A, potem terminal B
2. [UI] Pytanie: "Polaczenie rezerwowe" / "Zamknij pierscien (ring z NOP)"
3. Jesli pierscien:
   a. CatalogPicker (KABEL_SN) → wybor kabla lacznikowego
   b. Modal: dlugosc segmentu lacznikowego
   c. POST connect_secondary_ring_sn → nowy segment laczacy A z B
   d. Automatycznie: POST set_normal_open_point → NOP na segmencie lacznikowym
4. [SLD] Render: zamkniety pierscien z oznaczeniem NOP (ikona "N.O.")
5. NOP zawsze w stanie OPEN (normalnie otwarty)
```

### Warunek: NOP obowiazkowy dla ring

Jesli `connect_secondary_ring_sn` z `nop_required: true`:
- Backend automatycznie ustawia NOP na segmencie lacznikowym
- NOP mozna pozniej przeniesc na inny lacznik (`set_normal_open_point`)
- Brak NOP w konfiguracji ring → readiness BLOCKER

---

## 8. Bramka katalogowa (podwojna: UI + BE)

### 8.1 Brama UI (frontend)

**Regula**: Frontend NIGDY nie wysyla operacji tworzacej segment lub transformator
bez wypelnionego `catalog_binding` w payload.

**Implementacja**:
```
Handler UI → sprawdz czy operacja wymaga katalogu
  → TAK: otworz CatalogPicker PRZED modalem parametrow
  → Uzytkownik MUSI wybrac pozycje
  → Dopiero wtedy: modal z parametrami (dlugosc, nazwa, itp.)
  → Submit z catalog_binding w payload
```

**Operacje wymagajace CatalogPicker w UI**:

| Operacja | Namespace katalogu |
|----------|-------------------|
| `continue_trunk_segment_sn` | `KABEL_SN` |
| `start_branch_segment_sn` | `KABEL_SN` |
| `insert_station_on_segment_sn` | `TRAFO_SN_NN` |
| `add_transformer_sn_nn` | `TRAFO_SN_NN` |
| `connect_secondary_ring_sn` | `KABEL_SN` |
| `insert_section_switch_sn` | `APARAT_SN` |
| `add_nn_outgoing_field` | `APARAT_NN` |
| `add_converter_source` | `CONVERTER` |
| `add_converter_source` | `CONVERTER` |
| `add_relay` | `ZABEZPIECZENIE` |
| `add_ct` | `CT` |
| `add_vt` | `VT` |

### 8.2 Brama BE (backend)

**Regula**: Backend ODRZUCA (422 HTTP) kazda operacje z `_CATALOG_REQUIRED_OPERATIONS`
ktora nie zawiera `catalog_binding` w payload. To jest BLAD WALIDACJI WEJSCIA,
NIE kod gotowosci.

**Odpowiedz 422**:
```json
{
  "code": "catalog.binding_required",
  "message_pl": "Element techniczny wymaga powiazania z katalogiem",
  "errors": [
    {
      "code": "catalog.binding_required",
      "message_pl": "Operacja 'continue_trunk_segment_sn' wymaga powiazania z katalogiem (brak 'catalog_binding' w payload)"
    }
  ],
  "fix_action": {
    "action_type": "OPEN_MODAL",
    "modal_type": "CatalogPicker",
    "payload_hint": { "namespace": "KABEL_SN" }
  }
}
```

### 8.3 Wzmocnienie warstwy ENM

**NOWA REGULA**: Warstwa ENM (`enm/domain_operations.py`) rowniez musi walidowac
obecnosc `catalog_ref` dla operacji tworzacych segmenty i transformatory.
Odrzucenie: `_error_response("...", "catalog.ref_required")`.

---

## 9. Skroty klawiszowe

| Skrot | Akcja | Kontekst |
|-------|-------|----------|
| `Enter` | Zatwierdz modal / wybor katalogu | Kazdy modal |
| `Escape` | Anuluj modal / wyjdz z trybu K5 | Kazdy modal, tryb K5 |
| `S` | Dodaj odcinek magistrali (od terminala) | K2: terminal zaznaczony |
| `T` | Wstaw stacje (domyslnie A) | K3: segment zaznaczony |
| `B` | Dodaj odgalezienie | K4: port zaznaczony |
| `R` | Wejdz w tryb laczenia koncow | K2: terminal zaznaczony |
| `N` | Ustaw NOP | Lacznik zaznaczony |
| `Delete` | Usun element (z potwierdzeniem) | Dowolny element zaznaczony |
| `Ctrl+Z` | Cofnij (undo) | Globalny |
| `Ctrl+Y` | Ponow (redo) | Globalny |

---

## 10. Kody bledow i komunikaty PL

### Kody walidacji wejscia (422 HTTP)

| Kod | Komunikat PL | Nawigacja |
|-----|-------------|-----------|
| `catalog.binding_required` | Element techniczny wymaga powiazania z katalogiem | CatalogPicker |
| `catalog.binding_incomplete` | Niekompletne powiazanie katalogowe | CatalogPicker |
| `catalog.materialization_failed` | Blad materializacji parametrow katalogowych | CatalogPicker |
| `operation.unknown` | Nieznana operacja: {nazwa} | — |
| `operation.payload_invalid` | Nieprawidlowy payload operacji | — |

### Kody walidacji domenowej (error_response)

| Kod | Komunikat PL | Nawigacja |
|-----|-------------|-----------|
| `source.missing_voltage` | Brak napiecia znamionowego SN | Modal GPZ |
| `source.already_exists` | Model sieci juz ma zrodlo zasilania | — |
| `trunk.from_terminal_missing` | Brak identyfikatora terminala zrodlowego | SLD |
| `trunk.dlugosc_missing` | Brak dlugosci odcinka magistrali | Modal segmentu |
| `station.insert.segment_missing` | Brak identyfikatora odcinka | SLD |
| `station.insert.station_type_invalid` | Typ stacji nieprawidlowy (A/B/C/D) | Modal stacji |
| `station.insert.nn_voltage_missing` | Brak napiecia nN stacji | Modal stacji |
| `catalog.ref_required` | Segment/transformator wymaga referencji katalogowej | CatalogPicker |

### Kody gotowosci (readiness — NIE blokuja tworzenia)

| Kod | Komunikat PL | FixAction |
|-----|-------------|-----------|
| `trunk.catalog_missing` | Odcinek SN nie ma przypisanego katalogu | CatalogPicker (KABEL_SN) |
| `transformer.catalog_missing` | Transformator nie ma przypisanego katalogu | CatalogPicker (TRAFO_SN_NN) |
| `trunk.segment_length_missing` | Odcinek nie ma zdefiniowanej dlugosci | Inspector → length_m |
| `source.grid_supply_missing` | Brak zrodla zasilania sieciowego (GPZ) | Wizard → add_grid_source |

---

## 11. Efekty SLD po kazdej akcji

### Tablica efektow SLD

| Operacja | Efekt wizualny na SLD |
|----------|----------------------|
| `add_grid_source_sn` | Blok GPZ: symbol zrodla + szyna SN + terminal (OTWARTY) |
| `continue_trunk_segment_sn` | Nowy odcinek kabla/linii + nowy terminal na koncu |
| `insert_station_on_segment_sn` | Segment podzielony; blok stacji (pola SN + TR + szyna nN + odplywy) |
| `start_branch_segment_sn` | Nowe odgalezienie od punktu na magistrali + terminal |
| `insert_section_switch_sn` | Symbol lacznika sekcyjnego wstawiony w segment |
| `connect_secondary_ring_sn` | Segment lacznikowy miedzy dwoma terminalami |
| `set_normal_open_point` | Oznaczenie N.O. na laczniku (ikona + kolor) |

### Reguly estetyki przemyslowej

| Regula | Opis |
|--------|------|
| Staly krok siatki | Wszystkie elementy wyrownane do siatki (grid_step = 40px) |
| Symetryczne polaczenia wtorne | Odplywy nN rozmieszczone symetrycznie pod szyna nN |
| Wyrownane bloki stacji | Bloki stacji na jednej linii poziomej |
| Brak kolizji | Automatyczne sprawdzanie kolizji po kazdym renderze |
| Deterministyczny uklad | Ten sam Snapshot = identyczny SLD (bit po bicie) |

---

## 12. Zwiazek z istniejacymi dokumentami

| Dokument | Relacja |
|----------|---------|
| `KANON_KREATOR_SN_NN_NA_ZYWO.md` | Rozszerzony o konteksty K1-K5 i bramke katalogowa |
| `KATALOG_WIAZANIE_I_MATERIALIZACJA.md` | Bramka katalogowa uzywa tego mechanizmu |
| `KONTRAKT_OPERACJI_ENM_OP.md` | Operacje K1-K5 sa podzbiorem kontraktu ENM |
| `BRAKI_DANYCH_FIXACTIONS.md` | Fix actions z readiness korzystaja z tego dokumentu |
| `MACIERZ_OKIEN_DIALOGOWYCH_I_AKCJI.md` | Modale K1-K5 sa czescia tej macierzy |
| `sld_rules.md` | Reguly renderowania SLD obowiazuja dla efektow K1-K5 |
| `wizard_screens.md` | Menu kontekstowe K1-K5 zastepuja stary kreator krokowy |

---

*Dokument wiazacy. Zmiany wymagaja review architektonicznego.*
