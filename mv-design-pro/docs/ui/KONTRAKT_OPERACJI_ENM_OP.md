# Kontrakt operacji ENM_OP --- wiazacy V1

**Status:** WIAZACY
**Wersja:** 1.0
**Data:** 2026-02-16
**Referencje:**
- `UX_FLOW_SN_V1_GPZ_LIVE_SLD.md` --- przeplywy budowy sieci SN
- `CATALOG_BROWSER_CONTRACT.md` --- kontrakt przegladarki katalogu
- `SLD_UI_CONTRACT.md` --- kontrakt widoku SLD
- `backend/src/enm/domain_ops_models.py` --- modele Pydantic V2
- `backend/src/enm/domain_operations.py` --- implementacja operacji

---

## 1. Format wywolania operacji

Kazda operacja domenowa jest wysylana jako **POST /enm/domain-ops** z jednolitym envelope.

```json
{
  "project_id": "<identyfikator-projektu>",
  "snapshot_base_hash": "<sha256-hash-aktualnego-snapshot>",
  "operation": {
    "name": "<kanoniczna-nazwa-operacji>",
    "idempotency_key": "<unikalny-klucz-idempotentnosci>",
    "payload": {
      // dane specyficzne dla operacji
    }
  }
}
```

### 1.1 Opis pol

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `project_id` | `string` | TAK | Identyfikator projektu |
| `snapshot_base_hash` | `string` | TAK | Hash SHA-256 bazowego Snapshot --- zapewnia optymistyczna kontrole wspolbieznosci. Jesli hash nie zgadza sie z aktualnym, serwer zwraca **HTTP 409 Conflict** |
| `operation.name` | `string` | TAK | Kanoniczna nazwa operacji (jedna z 10 dozwolonych) |
| `operation.idempotency_key` | `string` | TAK | Klucz idempotentnosci --- zapewnia jednokrotne wykonanie operacji przy powtorzeniu zadania |
| `operation.payload` | `object` | TAK | Dane specyficzne dla danej operacji (rozne dla kazdej nazwy) |

### 1.2 Optymistyczna kontrola wspolbieznosci

Pole `snapshot_base_hash` sluzy do wykrywania konfliktow. Jesli klient wysle
hash rozny od aktualnego stanu modelu, serwer odpowiada:

```
HTTP 409 Conflict
{
  "detail": "Konflikt wersji: oczekiwany hash '<hash_klienta>', aktualny '<hash_serwera>'. Odswiez snapshot i sprobj ponownie."
}
```

Klient MUSI odswiezyc snapshot i powtorzyc operacje.

---

## 2. Format odpowiedzi

Kazda operacja domenowa zwraca **jednolity kontrakt odpowiedzi**:

```json
{
  "snapshot": { /* pelny EnergyNetworkModel po operacji */ },

  "logical_views": {
    "trunks": [
      {
        "corridor_ref": "<id-magistrali>",
        "corridor_type": "radial | ring | mixed",
        "segments": ["<segment_ref_1>", "<segment_ref_2>"],
        "no_point_ref": "<switch_ref | null>",
        "terminals": [
          {
            "element_id": "<bus_ref>",
            "port_id": "trunk_start | trunk_end",
            "trunk_id": "<corridor_ref>",
            "branch_id": null,
            "status": "OTWARTY | ZAJETY | ZAREZERWOWANY_DLA_RINGU"
          }
        ]
      }
    ],
    "branches": [
      {
        "branch_id": "<id-odgalezienia>",
        "from_element_id": "<bus_ref>",
        "from_port_id": "branch_start",
        "segments": ["<segment_ref>"],
        "terminals": [
          {
            "element_id": "<bus_ref>",
            "port_id": "branch_end",
            "trunk_id": null,
            "branch_id": "<branch_id>",
            "status": "OTWARTY | ZAJETY | ZAREZERWOWANY_DLA_RINGU"
          }
        ]
      }
    ],
    "secondary_connectors": [
      {
        "connector_id": "<id-polaczenia-wtornego>",
        "from_element_id": "<bus_ref>",
        "to_element_id": "<bus_ref>",
        "segment_ref": "<segment_ref>"
      }
    ],
    "terminals": [
      /* agregat wszystkich terminali z magistral i odgalezien */
    ]
  },

  "readiness": {
    "ready": true,
    "blockers": [
      {
        "code": "<kod-blokera>",
        "severity": "BLOKUJACE",
        "message_pl": "<komunikat-po-polsku>",
        "element_ref": "<ref_id | null>"
      }
    ],
    "warnings": [
      {
        "code": "<kod-ostrzezenia>",
        "severity": "OSTRZEZENIE",
        "message_pl": "<komunikat-po-polsku>",
        "element_ref": "<ref_id | null>"
      }
    ]
  },

  "fix_actions": [
    {
      "code": "<kod-akcji>",
      "action_type": "OPEN_MODAL | NAVIGATE_TO_ELEMENT | SELECT_CATALOG | ADD_MISSING_DEVICE",
      "element_ref": "<ref_id | null>",
      "panel": "<nazwa-panelu | null>",
      "step": "<krok-kreatora | null>",
      "focus": "<pole-formularza | null>",
      "message_pl": "<komunikat-dla-uzytkownika>"
    }
  ],

  "changes": {
    "created_element_ids": ["<ref_id_1>", "<ref_id_2>"],
    "updated_element_ids": ["<ref_id_3>"],
    "deleted_element_ids": ["<ref_id_4>"]
  },

  "selection_hint": {
    "element_id": "<ref_id>",
    "element_type": "bus | branch | substation | transformer | switch",
    "zoom_to": true
  },

  "audit_trail": [
    {
      "step": 1,
      "action": "Utworzono szyne GPZ",
      "element_id": "<ref_id>",
      "detail": ""
    }
  ],

  "domain_events": [
    {
      "event_seq": 1,
      "event_type": "BUS_CREATED | SOURCE_CREATED | BRANCH_CREATED | ...",
      "element_id": "<ref_id>",
      "detail": ""
    }
  ],

  "materialized_params": {
    "lines_sn": {
      "<segment_ref>": {
        "catalog_item_id": "<id-pozycji-katalogowej>",
        "catalog_item_version": "<wersja | null>",
        "r_ohm_per_km": 0.32,
        "x_ohm_per_km": 0.08,
        "i_max_a": 250.0
      }
    },
    "transformers_sn_nn": {
      "<transformer_ref>": {
        "catalog_item_id": "<id-pozycji-katalogowej>",
        "catalog_item_version": "<wersja | null>",
        "u_k_percent": 6.0,
        "p0_kw": 0.5,
        "pk_kw": 7.6,
        "s_n_kva": 400.0
      }
    }
  },

  "layout": {
    "layout_hash": "sha256:<64-znakowy-hex>",
    "layout_version": "1.0"
  }
}
```

### 2.1 Gwarancje odpowiedzi

| Gwarancja | Opis |
|-----------|------|
| **Deterministycznosc** | Ten sam Snapshot wejsciowy + ten sam payload = identyczna odpowiedz |
| **Pelny Snapshot** | Pole `snapshot` zawiera PELNY model po operacji --- nie delta |
| **Gotowosci zawsze obecna** | Pole `readiness` jest ZAWSZE obliczane, nawet jesli operacja nie zmienia gotowosci |
| **Widoki logiczne** | Pole `logical_views` jest deterministyczna pochodna Snapshot --- obliczana za kazdym razem |
| **Materializacja** | Pole `materialized_params` zawiera zamrozone parametry katalogowe w momencie operacji |
| **Uklad geometryczny** | Pole `layout` zawiera hash i wersje deterministycznego ukladu topologicznego |

### 2.2 Dozwolone typy zdarzen domenowych

```
SEGMENT_SPLIT           CUT_NODE_CREATED        STATION_CREATED
PORTS_CREATED           FIELDS_CREATED_SN       DEVICES_CREATED_SN
TR_CREATED              BUS_NN_CREATED           FIELDS_CREATED_NN
DEVICES_CREATED_NN      RECONNECTED_GRAPH        LOGICAL_VIEWS_UPDATED
SOURCE_CREATED          BUS_CREATED              BRANCH_CREATED
SWITCH_INSERTED         RING_CONNECTED           NOP_SET
TRANSFORMER_CREATED     CATALOG_ASSIGNED         PARAMETERS_UPDATED
```

---

## 3. Kanon nazw operacji

System definiuje dokladnie **10 kanonicznych operacji domenowych**. Frontend wysyla WYLACZNIE
nazwy kanoniczne. W aktywnej powierzchni V11 nie wystepuja aliasy operacji ani
alternatywne identyfikatory formularzy.

---

### 3.1 `add_grid_source_sn`

**Cel:** Dodanie zrodla zasilania sieciowego SN (punkt zasilania GPZ) --- pierwszy krok budowy sieci.

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `voltage_kv` | `float` | TAK | Napiecie znamionowe szyny GPZ [kV], musi byc > 0 |
| `source_name` | `string` | NIE | Nazwa zrodla zasilania |
| `bus_name` | `string` | NIE | Nazwa szyny GPZ |
| `sk3_mva` | `float` | NIE | Moc zwarciowa trojfazowa [MVA] |
| `ik3_ka` | `float` | NIE | Prad zwarciowy trojfazowy [kA] |
| `rx_ratio` | `float` | NIE | Stosunek R/X impedancji zwarciowej |
| `pozycja_widokowa` | `object` | NIE | Pozycja na schemacie SLD |

**Tworzy:**
- Szyne GPZ (`bus`) z zadanym napieciem
- Zrodlo zasilania (`source`) przypiete do szyny
- Stacje (`substation`) typu `gpz`
- Magistrale (`corridor`) typu `radial` (pusta, gotowa do rozbudowy)

**Warunek wstepny:** Model nie moze miec istniejacego zrodla zasilania (dopuszczalny jest
dokladnie jeden GPZ).

---

### 3.2 `continue_trunk_segment_sn`

**Cel:** Kontynuacja budowy magistrali SN o kolejny segment (odcinek kabla lub linii napowietrznej).

**Publiczna nazwa V11:** tylko `continue_trunk_segment_sn`

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `trunk_id` | `string` | TAK* | Identyfikator magistrali (* auto-detekcja pierwszej magistrali, jesli pominiety) |
| `from_terminal_id` | `string` | TAK* | Identyfikator terminala, od ktorego kontynuowac (* auto-detekcja konca magistrali) |
| `segment.rodzaj` | `"KABEL" \| "LINIA_NAPOWIETRZNA"` | TAK | Rodzaj segmentu |
| `segment.dlugosc_m` | `float` | TAK | Dlugosc segmentu [m] --- MUSI byc jawna, > 0 |
| `segment.catalog_ref` | `string` | NIE | Referencja katalogowa segmentu |
| `segment.name` | `string` | NIE | Nazwa segmentu |
| `parametry_jawne` | `object` | NIE | Jawnie podane parametry elektryczne (tryb EKSPERT) |

**Tworzy:**
- Nowa szyne downstream (`bus`) z napieciem dziedziczonym topologicznie z szyny zrodlowej
- Odcinek magistrali (`branch`) typu `cable` lub `line_overhead`
- Aktualizuje magistrale (`corridor`) --- dodaje segment do `ordered_segment_refs`

**Warunek wstepny:** Szyna zrodlowa musi istniec i miec zdefiniowane napiecie.

---

### 3.3 `insert_station_on_segment_sn`

**Cel:** Wstawienie stacji transformatorowej SN/nN na istniejacym segmencie magistrali.
Operacja krytyczna --- dzieli segment na dwa i tworzy pelny blok stacji.

**Publiczna nazwa V11:** tylko `insert_station_on_segment_sn`

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `segment_id` | `string` | TAK | Identyfikator segmentu do podzialu |
| `insert_at.mode` | `"RATIO" \| "ODLEGLOSC_OD_POCZATKU_M" \| "ANCHOR"` | TAK | Tryb pozycji wstawienia |
| `insert_at.value` | `float \| object` | TAK | Wartosc pozycji (0.0--1.0 dla RATIO, metry dla ODLEGLOSC, `{anchor_id, offset_m}` dla ANCHOR) |
| `station.station_type` | `"A" \| "B" \| "C" \| "D"` | TAK | Typ stacji wg klasyfikacji |
| `station.station_name` | `string` | NIE | Nazwa stacji |
| `station.sn_voltage_kv` | `float` | TAK* | Napiecie SN [kV] (* dziedziczone topologicznie z szyny segmentu, jesli pominiente) |
| `station.nn_voltage_kv` | `float` | TAK | Napiecie nN [kV] --- MUSI byc jawne |
| `sn_fields` | `list[SNFieldSpec]` | TAK | Lista pol SN rozdzielnicy (role: `LINIA_IN`, `LINIA_OUT`, `LINIA_ODG`, `TRANSFORMATOROWE`, `SPRZEGLO`) |
| `transformer.create` | `bool` | NIE | Flaga utworzenia transformatora (domyslnie `true`) |
| `transformer.transformer_catalog_ref` | `string` | NIE | Referencja katalogowa transformatora |
| `nn_block.create_nn_bus` | `bool` | NIE | Flaga utworzenia szyny nN (domyslnie `true`) |
| `nn_block.outgoing_feeders_nn_count` | `int` | NIE | Liczba odplywow nN (domyslnie 1) |
| `nn_block.outgoing_feeders_nn` | `list` | NIE | Specyfikacje poszczegolnych odplywow nN |
| `options` | `StationOptions` | NIE | Opcje tworzenia stacji |
| `trunk_ref` | `TrunkRef` | NIE | Referencja do magistrali (kontekst wstawienia) |

**Tworzy:**
- Szyne SN stacji (`bus`) w punkcie podzialu
- Dwa nowe segmenty (lewy i prawy) zastepujace oryginalny
- Stacje (`substation`) typu `mv_lv` z polami SN
- Szyne nN (`bus`) z napieciem nN
- Transformator SN/nN (`transformer`) --- jesli `create=true`
- Wylacznik glowny nN (`bay`)
- Odplywy nN (`bay`)

**Usuwa:**
- Oryginalny segment (zastapiony dwoma nowymi)

**Modyfikuje:**
- Magistrale (`corridor`) --- zamienia segment na dwa nowe w `ordered_segment_refs`

---

### 3.4 `start_branch_segment_sn`

**Cel:** Rozpoczecie nowego odgalezienia (branch) od istniejacej szyny SN.

**Publiczna nazwa V11:** tylko `start_branch_segment_sn`

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `from_bus_ref` | `string` | TAK | Referencja szyny zrodlowej --- MUSI byc jawna, brak auto-detekcji |
| `from_port` | `string` | NIE | Port na szynie zrodlowej |
| `segment.rodzaj` | `"KABEL" \| "LINIA_NAPOWIETRZNA"` | TAK | Rodzaj segmentu |
| `segment.dlugosc_m` | `float` | TAK | Dlugosc segmentu [m] --- MUSI byc jawna, > 0 |
| `segment.catalog_ref` | `string` | NIE | Referencja katalogowa |

**Tworzy:**
- Szyne koncowa odgalezienia (`bus`) z napieciem dziedziczonym topologicznie
- Segment odgalezienia (`branch`)

**Warunek wstepny:** Szyna `from_bus_ref` MUSI istniec w modelu. Brak auto-detekcji szyny zrodlowej.

---

### 3.5 `insert_section_switch_sn`

**Cel:** Wstawienie lacznika sekcyjnego (rozlacznik lub wylacznik) na istniejacym segmencie SN.

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `segment_id` | `string` | TAK | Identyfikator segmentu |
| `insert_at.mode` | `"RATIO" \| "ODLEGLOSC_OD_POCZATKU_M"` | NIE | Tryb pozycji (domyslnie `RATIO`) |
| `insert_at.value` | `float` | NIE | Wartosc pozycji (domyslnie `0.5`) |
| `switch_type` | `"ROZLACZNIK" \| "WYLACZNIK"` | NIE | Typ lacznika (domyslnie `ROZLACZNIK`) |
| `switch_name` | `string` | NIE | Nazwa lacznika |
| `normal_state` | `"closed" \| "open"` | NIE | Stan normalny (domyslnie `closed`) |

**Tworzy:**
- Dwa wezly lacznika (`bus`)
- Lacznik (`branch`) typu `switch` lub `breaker`
- Dwa segmenty (lewy i prawy) zastepujace oryginalny

**Usuwa:**
- Oryginalny segment

**Modyfikuje:**
- Magistrale (`corridor`) --- zamienia segment na `[lewy, lacznik, prawy]`

---

### 3.6 `connect_secondary_ring_sn`

**Cel:** Zamkniecie pierscienia SN --- polaczenie dwoch szyn segmentem zamykajacym.

**Publiczna nazwa V11:** tylko `connect_secondary_ring_sn`

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `from_bus_ref` | `string` | TAK | Referencja szyny poczatkowej --- MUSI byc jawna |
| `to_bus_ref` | `string` | TAK | Referencja szyny koncowej --- MUSI byc jawna |
| `segment.rodzaj` | `"KABEL" \| "LINIA_NAPOWIETRZNA"` | NIE | Rodzaj segmentu (domyslnie `KABEL`) |
| `segment.dlugosc_m` | `float` | TAK | Dlugosc segmentu [m] --- MUSI byc jawna, > 0 |
| `segment.catalog_ref` | `string` | NIE | Referencja katalogowa |
| `ring_name` | `string` | NIE | Nazwa pierscienia |

**Tworzy:**
- Segment zamykajacy pierscien (`branch`)

**Modyfikuje:**
- Magistrale (`corridor`) --- zmienia `corridor_type` na `ring`

**Warunek wstepny:** Obie szyny MUSZA istniec w modelu. Brak auto-detekcji koncow pierscienia.

---

### 3.7 `set_normal_open_point`

**Cel:** Ustawienie punktu normalnie otwartego (NOP) na laczniku w pierscieniu.
Lacznik przechodzi w stan `open`, magistrala zapisuje `no_point_ref`.

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `switch_ref` | `string` | TAK | Referencja lacznika, ktory ma byc punktem NOP |
| `corridor_ref` | `string` | NIE | Referencja magistrali (domyslnie pierwsza magistrala w modelu) |

**Modyfikuje:**
- Lacznik (`branch`) --- zmienia `status` na `open`
- Magistrale (`corridor`) --- ustawia `no_point_ref`

---

### 3.8 `add_transformer_sn_nn`

**Cel:** Dodanie transformatora SN/nN miedzy istniejacymi szynami.

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `hv_bus_ref` | `string` | TAK | Referencja szyny strony gornego napiecia (SN) |
| `lv_bus_ref` | `string` | TAK | Referencja szyny strony dolnego napiecia (nN) |
| `transformer_catalog_ref` | `string` | NIE | Referencja katalogowa transformatora |
| `sn_mva` | `float` | NIE | Moc znamionowa [MVA] |
| `uhv_kv` | `float` | NIE | Napiecie znamionowe strony gornej [kV] (topologicznie z szyny HV) |
| `ulv_kv` | `float` | NIE | Napiecie znamionowe strony dolnej [kV] (topologicznie z szyny LV) |
| `uk_percent` | `float` | NIE | Napiecie zwarcia [%] |
| `pk_kw` | `float` | NIE | Straty obciazeniowe [kW] |
| `station_ref` | `string` | NIE | Referencja stacji, do ktorej nalezy transformator |

**Tworzy:**
- Transformator (`transformer`) polaczony miedzy szynami HV i LV

**Modyfikuje:**
- Stacje (`substation`) --- dodaje `transformer_ref`, jesli podano `station_ref`

**UWAGA:** Napiecia szyn sa dziedziczone topologicznie z istniejacych szyn.
Parametry transformatora (uk_percent, pk_kw, sn_mva) NIE MAJA wartosci domyslnych ---
wymagaja jawnego podania lub przypisania katalogu.

---

### 3.9 `assign_catalog_to_element`

**Cel:** Przypisanie pozycji katalogowej do istniejacego elementu modelu.
Po przypisaniu element otrzymuje `parameter_source = "CATALOG"`.

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `element_ref` | `string` | TAK | Referencja elementu docelowego |
| `catalog_item_id` | `string` | TAK | Identyfikator pozycji katalogowej |
| `catalog_item_version` | `string` | NIE | Wersja pozycji katalogowej |

**Modyfikuje:**
- Element docelowy --- ustawia `catalog_ref` i `parameter_source`

---

### 3.10 `update_element_parameters`

**Cel:** Aktualizacja parametrow istniejacego elementu modelu.
Pozwala na zmiane dowolnych parametrow (z wyjatkiem `ref_id`, `id`, `type`).

**Wymagane pola payload:**

| Pole | Typ | Wymagane | Opis |
|------|-----|----------|------|
| `element_ref` | `string` | TAK | Referencja elementu do aktualizacji |
| `parameters` | `object` | TAK | Slownik parametrow do ustawienia |
| `reason` | `string` | NIE | Powod zmiany (audyt) |

**Modyfikuje:**
- Element docelowy --- ustawia podane parametry

**ZABRONIONE klucze w `parameters`:** `ref_id`, `id`, `type` --- te pola sa niezmienne.

---

## 4. Zasada "bez zgadywania"

System ENM stosuje scisla zasade **"bez zgadywania"** (no-guessing rule).
Zadna operacja nie moze domyslnie uzupelniac wartosci, ktore powinny byc jawnie
podane przez uzytkownika.

### 4.1 Reguly

| Regula | Opis | Przyklad naruszenia |
|--------|------|---------------------|
| **Brak domyslnych dlugosci** | Pole `dlugosc_m` MUSI byc jawnie podane i > 0 w kazdej operacji tworzacej segment | Ustawienie `dlugosc_m = 100` gdy uzytkownik nie podal wartosci |
| **Brak domyslnych napiec** | Napiecia sa dziedziczone WYLACZNIE topologicznie z podlaczonej szyny --- brak wartosci domyslnych | Ustawienie `voltage_kv = 15.0` gdy szyna zrodlowa nie ma napiecia |
| **Brak auto-detekcji koncow pierscienia** | Operacja `connect_secondary_ring_sn` wymaga jawnych `from_bus_ref` i `to_bus_ref` | Automatyczne wybranie dwoch najdalszych szyn jako koncow pierscienia |
| **Brak auto-detekcji szyny zrodlowej odgalezienia** | Operacja `start_branch_segment_sn` wymaga jawnego `from_bus_ref` | Automatyczne wybranie ostatniej szyny jako zrodlowej |
| **Brak zastepczych parametrow transformatora** | Parametry `uk_percent`, `pk_kw`, `sn_mva` NIE MAJA wartosci domyslnych --- wymagaja katalogu lub jawnego podania | Ustawienie `uk_percent = 6.0` jako wartosci domyslnej |

### 4.2 Dozwolone dziedziczenie topologiczne

Jedynym wyjatkiem od reguly "bez zgadywania" jest **dziedziczenie topologiczne napiecia**:

- Nowa szyna downstream dziedziczy `voltage_kv` z szyny zrodlowej, do ktorej jest podlaczona segmentem.
- Dotyczy operacji: `continue_trunk_segment_sn`, `start_branch_segment_sn`.
- Jest to dziedziczenie TOPOLOGICZNE (wynika z fizyki), a nie wartosc domyslna.

### 4.3 Komunikaty bledow przy naruszeniu

Kazde naruszenie reguly "bez zgadywania" skutkuje odpowiedzia z bledem:

```json
{
  "error": "Brak dlugosci odcinka magistrali (dlugosc_m). Podaj jawna wartosc > 0.",
  "error_code": "trunk.dlugosc_missing"
}
```

---

## 5. TerminalRef --- kanoniczny byt

`TerminalRef` opisuje jednoznacznie punkt koncowy magistrali lub odgalezienia
wraz z jego statusem dostepnosci do dalszej budowy sieci.

### 5.1 Pola

| Pole | Typ | Opis |
|------|-----|------|
| `element_id` | `string` | Identyfikator elementu (szyny), do ktorego terminal nalezy |
| `port_id` | `string` | Identyfikator portu na elemencie (`trunk_start`, `trunk_end`, `branch_start`, `branch_end`) |
| `trunk_id` | `string \| null` | Identyfikator magistrali (jesli terminal nalezy do magistrali) |
| `branch_id` | `string \| null` | Identyfikator odgalezienia (jesli terminal nalezy do odgalezienia) |
| `status` | `string` | Status terminala --- dostepnosc do dalszej budowy |

### 5.2 Statusy terminali

| Status | Opis | Kiedy |
|--------|------|-------|
| `OTWARTY` | Terminal jest wolny --- mozna kontynuowac budowe | Szyna ma mniej niz 2 polaczenia kablowe |
| `ZAJETY` | Terminal jest zajety --- nie mozna dodawac kolejnych segmentow w tej magistrali | Szyna ma >= 2 polaczenia kablowe |
| `ZAREZERWOWANY_DLA_RINGU` | Terminal jest zarezerwowany do zamkniecia pierscienia | Magistrala jest typu `ring` i terminal jest na jej koncu |

### 5.3 Uzycie w UI

Frontend korzysta z terminali do:
- Wyswietlania dostepnych portow w SLD (porty `OTWARTY` sa podswietlone)
- Blokowania operacji budowy na zajetych portach
- Wskazywania kandydatow do zamkniecia pierscienia (`ZAREZERWOWANY_DLA_RINGU`)
- Kliknieciem uzytkownik wybiera terminal jako `from_terminal_id` w operacji `continue_trunk_segment_sn`

---

## 6. LogicalViews --- widoki logiczne

Widoki logiczne sa **deterministyczna pochodna Snapshot**. Obliczane sa za kazdym razem
w odpowiedzi operacji. NIE sa przechowywane w modelu --- sa obliczane z grafu topologicznego.

### 6.1 Struktura

```
LogicalViews
  |-- trunks[]            // magistrale z segmentami i terminalami
  |     |-- corridor_ref
  |     |-- corridor_type  (radial | ring | mixed)
  |     |-- segments[]     // uporzadkowane ref_id segmentow
  |     |-- no_point_ref   // NOP switch ref (jesli istnieje)
  |     |-- terminals[]    // TerminalRef
  |
  |-- branches[]           // odgalezienia
  |     |-- branch_id
  |     |-- from_element_id
  |     |-- from_port_id
  |     |-- segments[]
  |     |-- terminals[]
  |
  |-- secondary_connectors[]  // polaczenia wtorne (zamkniecia pierscienia)
  |     |-- connector_id
  |     |-- from_element_id
  |     |-- to_element_id
  |     |-- segment_ref
  |
  |-- terminals[]           // agregat WSZYSTKICH terminali
```

### 6.2 Algorytm obliczania

1. **Magistrale:** Iteracja po `corridors` w Snapshot. Dla kazdej magistrali odczytanie
   `ordered_segment_refs`, identyfikacja szyn poczatkowej i koncowej, obliczenie statusow terminali.
2. **Odgalezienia:** Segmenty (`branches`) NIENALEZACE do zadnej magistrali, typu `cable`
   lub `line_overhead`, sa klasyfikowane jako odgalezienia.
3. **Polaczenia wtorne:** Segmenty zamykajace cykle (laczace szyny magistral).
4. **Agregacja terminali:** Wszystkie terminale z magistral i odgalezien sa agregowane
   w jednej liscie.

### 6.3 Determinizm

Widoki logiczne sa sortowane deterministycznie:
- Magistrale: wg `corridor_ref` (alfabetycznie)
- Odgalezienia: wg `branch_id` (alfabetycznie)
- Terminale: kolejnosc wynikajaca z kolejnosci magistral i odgalezien

**GWARANCJA:** Ten sam Snapshot zawsze produkuje identyczne widoki logiczne.

---

## 7. MaterializedParams --- materializacja katalogowa

Materializacja to proces kopiowania parametrow z katalogu do Snapshot w momencie
przypisania. Parametry sa **zamrozone** --- aktualizacja katalogu NIE zmienia
istniejacych obliczen.

### 7.1 Struktura

```json
{
  "materialized_params": {
    "lines_sn": {
      "<segment_ref>": {
        "catalog_item_id": "<id>",
        "catalog_item_version": "<wersja>",
        "r_ohm_per_km": "<rezystancja>",
        "x_ohm_per_km": "<reaktancja>",
        "i_max_a": "<prad-maksymalny>"
      }
    },
    "transformers_sn_nn": {
      "<transformer_ref>": {
        "catalog_item_id": "<id>",
        "catalog_item_version": "<wersja>",
        "u_k_percent": "<napiecie-zwarcia>",
        "p0_kw": "<straty-jalowe>",
        "pk_kw": "<straty-obciazeniowe>",
        "s_n_kva": "<moc-znamionowa>"
      }
    }
  }
}
```

### 7.2 Reguly materializacji

| Regula | Opis |
|--------|------|
| **Zamrazanie** | Parametry sa kopiowane w momencie przypisania katalogu. Puzniejsza zmiana pozycji katalogowej NIE propaguje sie automatycznie |
| **Zrodlo prawdy** | Zmaterializowane parametry sa obliczane z aktualnego Snapshot --- odczytywane z pol `catalog_ref`, `r_ohm_per_km`, `x_ohm_per_km` itp. na elementach |
| **Linie SN** | Materializowane z galezi (`branches`) typu `cable` i `line_overhead` majacych `catalog_ref` |
| **Transformatory SN/nN** | Materializowane z `transformers` majacych `catalog_ref` |
| **Brak katalogu** | Element bez `catalog_ref` NIE pojawia sie w `materialized_params` --- jest to rownoczesnie bloker gotowosci |

### 7.3 Przeliczenie mocy

Moc znamionowa transformatora jest przeliczana:
- W Snapshot: `sn_mva` (MVA)
- W materializacji: `s_n_kva` = `sn_mva * 1000` (kVA)

---

## 8. Gotowosc i dzialania naprawcze

System readiness (gotowosc) okresla, czy model sieci jest kompletny i gotowy
do uruchomienia obliczen (zwarcia, rozplyw mocy).

### 8.1 Poziomy waznosci

| Poziom | Klucz | Opis | Efekt |
|--------|-------|------|-------|
| **Blokujace** | `BLOKUJACE` | Uniemozliwia uruchomienie obliczen | Uzytkownik MUSI naprawic |
| **Ostrzezenie** | `OSTRZEZENIE` | Obliczenia mozliwe, ale wyniki moga byc ograniczone | Uzytkownik powinien rozwazyc |

### 8.2 Kody blokerow

| Kod | Opis | FixAction |
|-----|------|-----------|
| `line.catalog_ref_missing` | Segment linii/kabla nie ma przypisanej pozycji katalogowej | `SELECT_CATALOG` --- otworz przegladarke katalogu dla danego segmentu |
| `transformer.catalog_ref_missing` | Transformator nie ma przypisanej pozycji katalogowej | `SELECT_CATALOG` --- otworz przegladarke katalogu dla transformatora |
| `pv_bess.transformer_required` | Generator OZE (typ PV/BESS) wymaga transformatora w sciezce zasilania | `ADD_MISSING_DEVICE` --- dodaj transformator dla generatora OZE |

### 8.3 Struktura FixAction

Kazdy bloker moze miec powiazana **akcje naprawcza** (FixAction) --- deklaratywna
sugestie dla frontendu, co nalezy zrobic:

```json
{
  "code": "line.catalog_ref_missing",
  "action_type": "SELECT_CATALOG",
  "element_ref": "<ref_id-segmentu>",
  "panel": "catalog_browser",
  "step": null,
  "focus": "<ref_id-segmentu>",
  "message_pl": "Przypisz pozycje katalogowa do segmentu linii."
}
```

### 8.4 Typy akcji naprawczych

| Typ | Opis |
|-----|------|
| `OPEN_MODAL` | Otworz modal (np. formularz parametrow) |
| `NAVIGATE_TO_ELEMENT` | Przejdz do elementu w SLD i zaznacz go |
| `SELECT_CATALOG` | Otworz przegladarke katalogu dla wybranego elementu |
| `ADD_MISSING_DEVICE` | Dodaj brakujace urzadzenie (np. transformator dla OZE) |

### 8.5 Gwarancje

- Gotowosci jest **ZAWSZE** obliczana w odpowiedzi operacji --- nawet jesli operacja
  nie zmienia stanu gotowosci.
- Lista blokerow i ostrzezen jest **deterministyczna** --- sortowana wg
  `severity -> code -> element_ref`.
- FixAction NIE wykonuje mutacji modelu --- jest WYLACZNIE sugestia dla UI.
- Komunikaty (`message_pl`) sa ZAWSZE w jezyku polskim.

---

## Dodatek A: Zasada nazewnictwa V11

W aktywnej powierzchni V11 frontend, testy E2E i dokumentacja uzywaja wylacznie
nazw kanonicznych operacji. Historyczne aliasy zostaly usuniete z aktywnej
dokumentacji i nie stanowia juz czesci kontraktu publicznego.

---

## Dodatek B: Format identyfikatorow elementow

Identyfikatory elementow sa deterministyczne i maja format:

```
<prefix>/<seed>/<local_path>
```

| Prefix | Element | Przyklad |
|--------|---------|----------|
| `gpz` | Elementy GPZ | `gpz/a1b2c3.../bus_sn` |
| `bus` | Szyny | `bus/d4e5f6.../downstream` |
| `seg` | Segmenty | `seg/g7h8i9.../segment` |
| `stn` | Elementy stacji | `stn/j0k1l2.../sn_bus` |
| `sw` | Laczniki | `sw/m3n4o5.../switch` |
| `tr` | Transformatory | `tr/p6q7r8.../transformer` |

Seed jest obliczany jako pierwsze 32 znaki SHA-256 z kanonicznych danych wejsciowych operacji.
Gwarantuje to **deterministycznosc** --- ta sama operacja z tymi samymi danymi zawsze
produkuje te same identyfikatory.
