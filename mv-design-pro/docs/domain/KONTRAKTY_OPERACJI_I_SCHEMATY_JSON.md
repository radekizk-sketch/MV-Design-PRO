# Kontrakty operacji domenowych — pozycja wstawienia, kanonizacja, identyfikatory

| Pole       | Wartosc                            |
|------------|------------------------------------|
| Status     | **BINDING**                        |
| Wersja     | 2.0                                |
| Data       | 2026-10-22                         |

> **Referencja**: rejestr operacji, pola ładunków, kopertę wywołania, odpowiedź i przykłady
> wykonane przez API opisuje WYŁĄCZNIE `ENM_OP_CONTRACTS_CANONICAL_FULL.md` (generowany
> z rejestru `backend/src/domain/canonical_operations.py`, pilnowany testem
> `backend/tests/ci/test_dokument_kontraktow_operacji.py`). Niniejszy dokument opisuje to,
> czego tamten nie obejmuje: **pozycję wstawienia elementu w odcinek**, **kanonizację JSON**
> i **identyfikatory deterministyczne** — wyłącznie tak, jak robi to kod.

---

## Spis tresci

1. [Kontrakt odpowiedzi](#1-kontrakt-odpowiedzi)
2. [Pozycja wstawienia w odcinek SN (`insert_at`)](#2-pozycja-wstawienia-w-odcinek-sn-insert_at)
3. [Przyklady ladunkow](#3-przyklady-ladunkow)
4. [Kanonizacja JSON](#4-kanonizacja-json)
5. [Identyfikatory deterministyczne](#5-identyfikatory-deterministyczne)

---

## 1. Kontrakt odpowiedzi

Pola odpowiedzi każdej operacji (`snapshot`, `changes`, `domain_events`, `selection_hint`,
`audit_trail`, `readiness`, `fix_actions`, `logical_views`, `materialized_params`, `layout`,
`semantic_issues`, przy odmowie `error` i `error_code`): `ENM_OP_CONTRACTS_CANONICAL_FULL.md` §2.
`readiness` jest obiektem `{ready, blockers, warnings}`; zdarzenia domenowe są numerowane
`event_seq` w kolejności powstania w jednej operacji i zwracane w tej samej odpowiedzi.

---

## 2. Pozycja wstawienia w odcinek SN (`insert_at`)

Operacje wstawiające element w istniejący odcinek SN — `insert_station_on_segment_sn`,
`insert_section_switch_sn`, `insert_zksn_on_segment_sn`, `insert_branch_pole_on_segment_sn` —
czytają pole `insert_at` JEDNĄ regułą: `wspolczynnik_podzialu`
(`backend/src/enm/domain_operations.py`, test `backend/tests/enm/test_pozycja_podzialu_odcinka.py`).

| Pole `insert_at` | Typ | Opis |
|---|---|---|
| `mode` | `"RATIO"` \| `"ODLEGLOSC_OD_POCZATKU_M"` | Tryb pozycji (`TRYBY_POZYCJI_PODZIALU`); brak = `RATIO`. |
| `value` | `number` | `RATIO`: ułamek długości odcinka; `ODLEGLOSC_OD_POCZATKU_M`: metry od początku odcinka. |

Reguły:

- brak `insert_at` = środek odcinka (współczynnik 0,5);
- współczynnik jest kwantowany do 1e-6 (`_quantize_ratio`) przed użyciem w podziale i w ziarnie
  identyfikatora;
- odmowa nazwana bez zmiany modelu: `insert_at` nie jest obiektem, tryb spoza słownika, brak
  `value`, wartość nieliczbowa (także logiczna i NaN), pozycja poza odcinkiem, tryb odległości na odcinku bez
  długości;
- koniec odcinka (współczynnik 0 albo 1): punkt rozgałęzienia (ZKSN, słup) zamyka odcinek bez
  podziału; stacja przelotowa i łącznik sekcyjny odmawiają (podział dałby część o zerowej
  długości — stację na końcu odcinka dodaje `append_station_on_endpoint`);
- kod odmowy: `station.insert.insert_at_invalid` (stacja), `params.invalid_value` (łącznik
  sekcyjny, punkty rozgałęzienia);
- podgląd `dry_run` stacji (`preview.halves`) liczy połówki tym samym współczynnikiem co podział
  wykonany.

---

## 3. Przyklady ladunkow

Przykłady wszystkich operacji rejestru, wykonane przez `POST /api/cases/{case_id}/enm/domain-ops`
w jednym łańcuchu budowy sieci, z odpowiedzią: `ENM_OP_CONTRACTS_CANONICAL_FULL.md` §6.

---

## 4. Kanonizacja JSON

Ziarno identyfikatora i skróty liczone są z kanonicznego JSON (`_canonical_json`,
`backend/src/enm/domain_operations.py`):

| Reguła | Realizacja |
|---|---|
| Klucze sortowane rekurencyjnie | `json.dumps(..., sort_keys=True)` |
| Brak spacji | `separators=(",", ":")` |
| Znaki spoza ASCII bez zmian | `ensure_ascii=False`, kodowanie UTF-8 |
| Liczby | zapis Pythona `json` (bez wymuszonego formatu stałoprzecinkowego); współczynnik podziału odcinka kwantowany do 1e-6 przed kanonizacją |

Przykład: `{"voltage_kv": 15.0, "bus_name": "Szyna GPZ", "rx_ratio": 0.1}` →
`{"bus_name":"Szyna GPZ","rx_ratio":0.1,"voltage_kv":15.0}`.

---

## 5. Identyfikatory deterministyczne

```
seed = sha256(kanoniczny_json(dane_operacji)).hexdigest()[:32]
ElementId = f"{prefiks}/{seed}/{sciezka_lokalna}"
```

(`_compute_seed`, `_make_id` w `backend/src/enm/domain_operations.py`.)

- **Dane ziarna** są dobierane per operacja i obejmują wyłącznie dane semantyczne ładunku
  i modelu (np. stacja przelotowa: `segment_id`, `insert_at` — ułamek po kwantyzacji albo metry —, `station_type`;
  łącznik sekcyjny: nazwa operacji, `segment_id`, współczynnik podziału). Czas, identyfikatory
  sesji i współrzędne ekranu nie wchodzą do ziarna.
- **Prefiksy** występujące w kodzie: `bp`, `bus`, `corridor`, `field`, `gen`, `gpz`, `load`,
  `nn`, `seg`, `shunt`, `sn`, `spd`, `stn`, `sub`, `sw`, `tr`, `ups`.
- **Determinizm**: ten sam ładunek na tej samej migawce daje te same identyfikatory — pilnują
  testy determinizmu sekwencji (`backend/tests/enm/test_golden_network_v1_e2e.py`) i test
  dokumentu kontraktu (przykłady w `ENM_OP_CONTRACTS_CANONICAL_FULL.md` §6 regenerowane
  bajt w bajt).

---

## Referencje

| Dokument | Sciezka | Rola |
|---|---|---|
| Kontrakty operacji domenowych (ZRODLO PRAWDY) | `docs/domain/ENM_OP_CONTRACTS_CANONICAL_FULL.md` | Rejestr operacji, ładunki, odpowiedź, przykłady, zdarzenia |
| Kody gotowosci i akcje naprawcze | `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` | Slownik kodow gotowosci |
| Indeks kanoniczny V12.5 | `docs/INDEX_KANONICZNY.md` | Wejscie do wiazacych specyfikacji systemowych |
| Specyfikacja systemu | `SYSTEM_SPEC.md` | Architektura nadrzedna |

---

## Historia zmian

| Data       | Wersja | Opis |
|------------|--------|------|
| 2026-02-17 | 1.0    | Utworzenie dokumentu |
| 2026-10-22 | 2.0    | Usunięte opisy niezgodne z kodem: „kontrakt magistrali” (`trunk_ref`, `segment_target`, `cut_resolution_policy`, `embedding_intent` — żaden handler ich nie czyta), przykłady z polami fantomowymi, kanonizacja stałoprzecinkowa i prefiksy identyfikatorów, których kod nie stosuje. Dodana reguła `insert_at` (jedna dla czterech operacji wstawienia). Rejestr i przykłady — wyłącznie `ENM_OP_CONTRACTS_CANONICAL_FULL.md`. |
