# Protection Engine v1 — Architektura (PR-26)

> **STAN 2026-09-30:** opisywany kod (`domain/protection_engine_v1.py`, `application/result_mapping/protection_to_resultset_v1.py`,
> `application/result_mapping/short_circuit_to_resultset_v1.py`, `sc_binding_meta.py`, router `api/protection_engine_v1.py`)
> skasowany — ostatnie pliki w karcie RESULTSET-MARTWE-MAPPERY (zgoda B-01 w decyzji O-59); dokument archiwalny, nie opisuje
> stanu bieżącego. Żywa implementacja: model przekaźnika i nastaw w ENM (`enm/models.py::ProtectionAssignment`,
> `ProtectionSetting`, `Measurement`), ocena w `application/protection_analysis/engine.py::ProtectionEvaluationEngine`
> (tor `protection_sn`, trasy `api/protection_runs.py`), krzywe IDMT wyłącznie w
> `network_model/solvers/protection_iec60255.py::compute_idmt_generic`, jedyny producent ResultSetV1:
> `application/result_mapping/canonical_run_to_resultset_v1.py`.

## Cel

Warstwa zabezpieczeń nadprądowych jako osobna analiza w systemie MV-DESIGN-PRO.
Funkcje ANSI 50 (I>>) i 51 (I>) z krzywymi IEC IDMT.

## Zakres v1

- Przekaźnik (Relay) logicznie przypisany do wyłącznika (CB)
- Funkcja 50: zabezpieczenie zwarciowe — próg prądowy z opcjonalnym czasem
- Funkcja 51: zabezpieczenie nadprądowe czasowe — krzywe IEC IDMT
- Jawne punkty testowe prądu (bez heurystyk mapowania z SC)
- Osobny ResultSet (SC nietykalny)
- Deterministyczny wynik z sygnaturą SHA-256

## Ograniczenia v1

- Brak automatycznej oceny selektywności (tylko liczby)
- Brak heurystycznego mapowania prądów z SC do urządzeń
- Brak funkcji 50N/51N (wymagają jawnych prądów ziemnozwarciowych)
- Brak automatycznych poprawek (tylko FixActions jako sugestie)

## Krzywe IEC IDMT

Wzór: `t = TMS × A / (M^B - 1)`

gdzie:
- `t` — czas zadziałania [s]
- `TMS` — mnożnik czasowy (Time Multiplier Setting)
- `M = I / I_pickup` — krotność prądu
- `A, B` — parametry krzywej

### Parametry krzywych (IEC 60255-151:2009)

| Krzywa | A | B | Etykieta PL |
|--------|-------|------|-------------|
| Standard Inverse (SI) | 0.14 | 0.02 | Normalna odwrotna |
| Very Inverse (VI) | 13.5 | 1.0 | Bardzo odwrotna |
| Extremely Inverse (EI) | 80.0 | 2.0 | Ekstremalnie odwrotna |

## Kontrakt wejścia

### ProtectionStudyInputV1

```json
{
  "relays": [
    {
      "relay_id": "relay-001",
      "attached_cb_id": "cb-001",
      "ct_ratio": { "primary_a": 400, "secondary_a": 5 },
      "f51": {
        "curve_type": "IEC_STANDARD_INVERSE",
        "pickup_a_secondary": 1.0,
        "tms": 0.3,
        "max_time_s": null
      },
      "f50": {
        "enabled": true,
        "pickup_a_secondary": 25.0,
        "t_trip_s": 0.05
      }
    }
  ],
  "test_points": [
    { "point_id": "tp-01", "i_a_primary": 1000.0 },
    { "point_id": "tp-02", "i_a_primary": 4000.0 }
  ]
}
```

## Kontrakt wyjścia

### ProtectionResultSetV1

```json
{
  "analysis_type": "PROTECTION",
  "relay_results": [
    {
      "relay_id": "relay-001",
      "attached_cb_id": "cb-001",
      "per_test_point": [
        {
          "point_id": "tp-01",
          "i_a_secondary": 12.5,
          "function_results": {
            "51": {
              "t_trip_s": 1.302,
              "curve_type": "IEC_STANDARD_INVERSE",
              "pickup_a_secondary": 1.0,
              "tms": 0.3
            },
            "50": {
              "picked_up": false,
              "t_trip_s": null
            }
          },
          "trace": { ... }
        }
      ]
    }
  ],
  "deterministic_signature": "sha256..."
}
```

## Determinizm

1. Wejścia sortowane leksykograficznie (relay_id, point_id)
2. Wyniki sortowane leksykograficznie
3. Sygnatura = SHA-256 kanonicznego JSON (sort_keys=True)
4. Identyczne wejście → identyczny hash i wynik

## Integracja

### ExecutionAnalysisType.PROTECTION

Dodany do enum `ExecutionAnalysisType` w `domain/execution.py`.
Pozwala na tworzenie Run + ResultSet w kanonicznym pipeline.

### ResultSet mapping

`application/result_mapping/protection_to_resultset_v1.py` mapuje
`ProtectionResultSetV1` na kanoniczny `ResultSet` (osobny od SC).

### API

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| POST | `/api/protection-engine/v1/execute` | Uruchom analizę |
| POST | `/api/protection-engine/v1/curve-time` | Oblicz czas krzywej |
| GET | `/api/protection-engine/v1/curve-types` | Lista krzywych IEC |
| POST | `/api/protection-engine/v1/validate` | Walidacja wejścia |

### SLD Overlay

Token-only overlay przy CB/polu: wyświetla t(51) dla aktywnego punktu testowego.
Nie modyfikuje geometrii SLD.

## Kody błędów

| Kod | Komunikat PL |
|-----|-------------|
| `protection.relay_missing_ct_ratio` | Uzupełnij przekładnię CT |
| `protection.curve_invalid_params` | Nieprawidłowe parametry krzywej |
| `protection.test_point_missing_current` | Dodaj punkt testowy prądu |
| `protection.sc_mapping_ambiguous` | Wybierz źródło prądu do analizy |

## FixActions

Wszystkie jako deklaratywne sugestie — bez auto-poprawy:
- `NAVIGATE_TO_ELEMENT` — nawiguj do elementu w SLD
- `OPEN_MODAL` — otwórz modal edycji nastaw
- `ADD_MISSING_DEVICE` — dodaj brakujący punkt testowy

## Testy

- Golden points IEC (SI, VI, EI) — ręcznie obliczone wartości referencyjne
- Deterministyczność: hash + JSON stability
- CT ratio: konwersja primary ↔ secondary
- Funkcja 50: próg + czas
- Funkcja 51: krzywe IDMT
- Pełna egzekucja silnika: multi-relay × multi-test-point
- Serializacja roundtrip (to_dict / from_dict)
