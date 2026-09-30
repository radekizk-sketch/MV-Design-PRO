# Wzorce odniesienia — Reference Patterns

> **BINDING** — This document defines authoritative calculation rules.
>
> **UI-HIDDEN** — Internal engineering documentation. Not exposed in user interface.
>
> **SUPERSEDED (karta W3-C2, 2026-09-09)** — Pattern A (`RP-LINE-I2-THERMAL-SPZ`)
> no longer consumes FIX-12D (`line_overcurrent_setting`, deleted). It now runs
> `application.protection_settings.engine.ProtectionSettingsEngine` (Hoppel/
> IRiESD) exclusively — see `docs/plan/KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md`
> §0.2. The formulas below (Section "Input Source", code snippets importing
> `line_overcurrent_setting`) describe the RETIRED methodology and are kept for
> historical reference only; they are NOT rewritten line-by-line in this pass
> (787-line document, out of this card's explicit scope) — do not use them to
> derive expected values for Pattern A. Current field names, formulas, and
> fixture-based expected values live in
> `backend/src/application/reference_patterns/pattern_line_i_doubleprime_thermal_spz.py`
> and `backend/tests/application/reference_patterns/test_pattern_a_line_i_doubleprime.py`.

---

## Document Information

| Property | Value |
|----------|-------|
| Module | Reference Patterns (Wzorce odniesienia) |
| Version | 1.0.0 |
| Standard | IEC 60909, PN-EN 60909 |
| Status | CANONICAL |
| Visibility | INTERNAL (ui-hidden) |
| Layer | Analysis (NOT-A-SOLVER) |

---

## Scope

This document defines Reference Patterns — engineering benchmark cases that validate
the coherence of protection methodology. Patterns:

- Consume analysis results (e.g., from FIX-12D I>> Setting Analysis)
- Validate methodology against known-good cases
- Provide WHITE-BOX trace of validation steps
- Ensure DETERMINISM (2× run → identical result)

**NOT-A-SOLVER Rule**: Reference patterns do NOT compute physics. They interpret
pre-computed results to verify methodology coherence.

---

## Wzorzec A — Dobór I>> dla linii SN

### Pattern Identification

| Property | Value |
|----------|-------|
| Pattern ID | `RP-LINE-I2-THERMAL-SPZ` |
| Name (PL) | Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ |
| Input Source | FIX-12D (LineOvercurrentSettingInput) |
| Output | ReferencePatternResult |
| Verdict Values | ZGODNE / GRANICZNE / NIEZGODNE |

---

### 1. Methodology Overview

The pattern validates four criteria for I>> (instantaneous overcurrent, ANSI 50)
protection settings on MV lines:

1. **Selektywność (Selectivity)** — coordination with downstream protection
2. **Czułość (Sensitivity)** — reliable trip for minimum fault at busbar
3. **Kryterium cieplne (Thermal)** — conductor thermal protection
4. **Blokada SPZ (SPZ Blocking)** — auto-reclose blocking decision

---

### 2. Mathematical Formulation

#### 2.1 Selectivity Criterion

**Requirement:** The protection setting must be above the maximum fault current seen
by the downstream protection, with safety margin.

$$
I_{nast} \geq k_b \times \frac{I''_{k,max}^{(next)}}{\theta_i}
$$

**Variables:**
- $I_{nast}$ — protection setting [A]
- $k_b$ — selectivity coefficient (1.1 - 1.3, typical 1.2)
- $I''_{k,max}^{(next)}$ — max fault current at next protection point [A]
- $\theta_i$ — CT ratio (primary/secondary)

**Minimum setting (primary):**
$$
I_{min,sel}^{(prim)} = k_b \times I''_{k,max}^{(next)}
$$

**Minimum setting (secondary):**
$$
I_{min,sel}^{(sec)} = \frac{I_{min,sel}^{(prim)}}{\theta_i}
$$

#### 2.2 Sensitivity Criterion

**Requirement:** The protection must reliably detect minimum fault current at busbar.

$$
I_{nast} \leq \frac{I''_{k,min}}{k_c \times \theta_i}
$$

**Variables:**
- $I''_{k,min}$ — minimum fault current at busbars [A]
- $k_c$ — sensitivity coefficient (1.2 - 1.5, typical 1.5)

**Note:** When 2-phase minimum fault current ($I''_{k,min,2f}$) is available,
it is used instead of 3-phase minimum, as it represents the worst case for sensitivity.

**Maximum setting (primary):**
$$
I_{max,sens}^{(prim)} = \frac{I''_{k,min}}{k_c}
$$

**Maximum setting (secondary):**
$$
I_{max,sens}^{(sec)} = \frac{I_{max,sens}^{(prim)}}{\theta_i}
$$

#### 2.3 Thermal Criterion

**Requirement:** The protection must operate before thermal damage to conductor.

$$
I_{nast} \leq k_{bth} \times \frac{I_{th,dop}}{\theta_i}
$$

where permissible thermal current:

$$
I_{th,dop} = \frac{I_{th,n}}{\sqrt{t_k}}
$$

**Variables:**
- $I_{th,n}$ — rated short-time current for 1s [A]
- $t_k$ — total fault duration including SPZ cycles [s]
- $k_{bth}$ — thermal safety coefficient (0.8 - 1.0, typical 0.9)

**Thermal capacity from cross-section:**
$$
I_{th,n} = S \times j_{th,n}
$$

where:
- $S$ — conductor cross-section [mm²]
- $j_{th,n}$ — rated short-time current density [A/mm²] (94 A/mm² for Al, 143 A/mm² for Cu)

**Maximum setting (primary):**
$$
I_{max,th}^{(prim)} = k_{bth} \times I_{th,dop}
$$

**Maximum setting (secondary):**
$$
I_{max,th}^{(sec)} = \frac{I_{max,th}^{(prim)}}{\theta_i}
$$

#### 2.4 Total Fault Time with SPZ

$$
t_k = n_{cycles} \times (t_{fault} + t_{breaker})
$$

where:
- $n_{cycles} = 1$ for SPZ disabled
- $n_{cycles} = 2$ for SPZ single (jednokrotne)
- $n_{cycles} = 3$ for SPZ double (dwukrotne)

---

### 3. Setting Window

The allowable setting window is:

$$
I_{nast} \in [I_{min}, I_{max}]
$$

where:

$$
I_{min} = I_{min,sel} = k_b \times I''_{k,max}^{(next)}
$$

$$
I_{max} = \min(I_{max,sens}, I_{max,th})
$$

**Window validity condition:**
$$
I_{max} > I_{min}
$$

**Narrow window threshold:**
$$
\frac{I_{max} - I_{min}}{I_{min}} < 0.05 \quad (5\%)
$$

---

### 4. Verdict Logic

| Condition | Verdict |
|-----------|---------|
| $I_{min} > I_{max}$ (window invalid) | NIEZGODNE |
| Any criterion FAIL | NIEZGODNE |
| Window valid AND narrow ($< 5\%$) | GRANICZNE |
| Window valid AND SPZ blocked | GRANICZNE |
| All criteria PASS, window valid, not narrow | ZGODNE |

---

### 5. Reference Cases (A, B, C)

Three reference cases are provided to validate the pattern implementation:

#### 5.1 Case A: ZGODNE (Compliant)

**Scenario**: Standard MV cable line with comfortable setting window.

| Parameter | Symbol | Value | Unit |
|-----------|--------|-------|------|
| Line name | — | Linia SN 15kV GPZ Północ - RS Centrum | — |
| CT ratio | $\theta_i$ | 80 | — |
| Conductor material | — | XLPE Al | — |
| Cross-section | $S$ | 150 | mm² |
| Thermal density | $j_{th,n}$ | 94 | A/mm² |
| Max fault at busbars | $I''_{k,max}$ | 3500 | A |
| Min fault at busbars (3ph) | $I''_{k,min,3f}$ | 3000 | A |
| Min fault at busbars (2ph) | $I''_{k,min,2f}$ | 2600 | A |
| Max fault at next prot. | $I''_{k,max}^{(next)}$ | 1200 | A |
| Selectivity coeff. | $k_b$ | 1.2 | — |
| Sensitivity coeff. | $k_c$ | 1.5 | — |
| Thermal coeff. | $k_{bth}$ | 0.9 | — |
| SPZ mode | — | Jednokrotne (SINGLE) | — |

**Calculations:**

| Quantity | Formula | Value | Unit |
|----------|---------|-------|------|
| $I_{th,n}$ | $150 \times 94$ | 14100 | A |
| $t_k$ | $2 \times (0.5 + 0.05)$ | 1.1 | s |
| $I_{th,dop}$ | $14100 / \sqrt{1.1}$ | 13442 | A |
| $I_{min,sel}$ | $1.2 \times 1200$ | 1440 | A |
| $I_{max,sens}$ | $2600 / 1.5$ (uses 2ph min) | 1733 | A |
| $I_{max,th}$ | $0.9 \times 13442$ | 12098 | A |
| $I_{max}$ | $\min(1733, 12098)$ | 1733 | A |
| Window | $[1440, 1733]$ | valid | A |
| Relative width | $(1733-1440)/1440$ | 20.4% | — |
| **Verdict** | — | **ZGODNE** | — |

**Conclusion**: Wide window allows comfortable setting selection. All criteria pass.

---

#### 5.2 Case B: NIEZGODNE (Non-Compliant)

**Scenario**: Network configuration with high fault current at downstream protection,
causing conflict between selectivity and sensitivity criteria.

| Parameter | Symbol | Value | Unit |
|-----------|--------|-------|------|
| Line name | — | Linia SN 15kV GPZ Wschód - Zakład Przemysłowy | — |
| CT ratio | $\theta_i$ | 100 | — |
| Conductor | — | XLPE Al 150 mm² | — |
| Max fault at busbars | $I''_{k,max}$ | 8000 | A |
| Min fault at busbars (3ph) | $I''_{k,min,3f}$ | 6000 | A |
| Min fault at busbars (2ph) | $I''_{k,min,2f}$ | 5200 | A |
| Max fault at next prot. | $I''_{k,max}^{(next)}$ | 6000 | A |

**Calculations:**

| Quantity | Formula | Value | Unit |
|----------|---------|-------|------|
| $I_{min,sel}$ | $1.2 \times 6000$ | 7200 | A |
| $I_{max,sens}$ | $5200 / 1.5$ (uses 2ph min) | 3467 | A |
| $I_{max}$ | $\min(3467, 12098)$ | 3467 | A |
| Window | $[7200, 3467]$ | **INVALID** | A |
| **Verdict** | — | **NIEZGODNE** | — |

**Conclusion**: $I_{min} > I_{max}$ — impossible to select setting satisfying all criteria.
Network reconfiguration or protection scheme change required.

---

#### 5.3 Case C: GRANICZNE (Borderline)

**Scenario**: Network configuration where setting window is valid but very narrow
(< 5% relative width).

| Parameter | Symbol | Value | Unit |
|-----------|--------|-------|------|
| Line name | — | Linia SN 15kV GPZ Południe - RS Fabryka | — |
| CT ratio | $\theta_i$ | 80 | — |
| Conductor | — | XLPE Al 150 mm² | — |
| Min fault at busbars (2ph) | $I''_{k,min,2f}$ | 3120 | A |
| Max fault at next prot. | $I''_{k,max}^{(next)}$ | 1666.67 | A |

**Calculations:**

| Quantity | Formula | Value | Unit |
|----------|---------|-------|------|
| $I_{min,sel}$ | $1.2 \times 1666.67$ | 2000 | A |
| $I_{max,sens}$ | $3120 / 1.5$ (uses 2ph min) | 2080 | A |
| Window | $[2000, 2080]$ | valid | A |
| Relative width | $(2080-2000)/2000$ | **4.0%** | — |
| **Verdict** | — | **GRANICZNE** | — |

**Conclusion**: Window is valid but narrow (< 5%). Setting selection technically possible
but requires precision. Any network parameter change may invalidate the window.

---

### 6. WHITE-BOX Trace Structure

Each validation produces a trace with the following steps:

```json
[
  {
    "step": "load_fixture",
    "description_pl": "Wczytanie danych referencyjnych z pliku fixture"
  },
  {
    "step": "run_analysis",
    "description_pl": "Uruchomienie analizy doboru nastaw I>> (FIX-12D)"
  },
  {
    "step": "extract_values",
    "description_pl": "Ekstrakcja kluczowych wartości z analizy"
  },
  {
    "step": "check_selectivity",
    "description_pl": "Sprawdzenie kryterium selektywności I>>",
    "formula": "I_{nast} >= k_b × I''_{k,max}^{(next)} / θi"
  },
  {
    "step": "check_sensitivity",
    "description_pl": "Sprawdzenie kryterium czułości I>>",
    "formula": "I_{nast} <= I''_{k,min} / (k_c × θi)"
  },
  {
    "step": "check_thermal",
    "description_pl": "Sprawdzenie kryterium wytrzymałości cieplnej",
    "formula": "I_{nast} <= k_{bth} × I_{th,dop} / θi, I_{th,dop} = I_{th,n} / √t_k"
  },
  {
    "step": "check_window",
    "description_pl": "Sprawdzenie okna nastaw [I_min, I_max]"
  },
  {
    "step": "check_spz",
    "description_pl": "Sprawdzenie decyzji blokady SPZ od I>>"
  },
  {
    "step": "determine_verdict",
    "description_pl": "Wyznaczenie werdyktu końcowego wzorca"
  }
]
```

---

### 7. Check Results Structure

Each check produces:

```json
{
  "name_pl": "Selektywność I>>",
  "status": "PASS",
  "status_pl": "Spełnione",
  "description_pl": "Selektywność spełniona: I_nast,min = 1440.0 A (kb=1.2, Ik_max_next=1200.0 A)",
  "details": {
    "i_min_primary_a": 1440.0,
    "i_min_secondary_a": 18.0,
    "kb": 1.2,
    "ik_max_next_a": 1200.0
  }
}
```

Status values:
- `PASS` — Spełnione
- `FAIL` — Niespełnione
- `WARN` — Ostrzeżenie
- `INFO` — Informacja

---

### 8. Result Artifacts

The `artifacts` dictionary contains key engineering values:

| Key | Description | Unit |
|-----|-------------|------|
| `tk_total_s` | Total fault duration | s |
| `ithn_a` | Rated short-time current (1s) | A |
| `ithdop_a` | Permissible thermal current | A |
| `i_min_sel_primary_a` | Min setting from selectivity | A |
| `i_max_sens_primary_a` | Max setting from sensitivity | A |
| `i_max_th_primary_a` | Max setting from thermal | A |
| `window_i_min_primary_a` | Window minimum (primary) | A |
| `window_i_max_primary_a` | Window maximum (primary) | A |
| `window_valid` | Window validity flag | bool |
| `recommended_setting_secondary_a` | Recommended setting (secondary) | A |

---

### 9. Determinism Guarantee

The pattern guarantees deterministic output:

- No system timestamps in computational trace
- All collections sorted by deterministic keys
- Stable JSON serialization with sorted keys
- 2× run with same input → identical output

Test verification:
```python
result1 = run_pattern_a(input_data=...)
result2 = run_pattern_a(input_data=...)
assert stable_json(result1.to_dict()) == stable_json(result2.to_dict())
```

---

### 10. Usage Example

```python
from application.reference_patterns import run_pattern_a

# From fixture file
result = run_pattern_a(fixture_file="line_i_doubleprime_case_a.json")

# From input data
from application.analyses.protection.line_overcurrent_setting import (
    LineOvercurrentSettingInput, ConductorData, ConductorMaterial, SPZConfig, SPZMode
)

input_data = LineOvercurrentSettingInput(
    line_id="line-001",
    line_name="Linia SN 15kV",
    ct_ratio=80.0,
    conductor=ConductorData(
        material=ConductorMaterial.XLPE_AL,
        cross_section_mm2=150.0,
        jthn_a_mm2=94.0,
    ),
    spz_config=SPZConfig(mode=SPZMode.SINGLE),
    ik_max_busbars_a=3500.0,
    ik_min_busbars_a=3000.0,
    ik_max_next_protection_a=1200.0,
    kb=1.2, kc=1.5, kbth=0.9,
)

result = run_pattern_a(input_data=input_data)

print(result.verdict)  # "ZGODNE"
print(result.summary_pl)  # Polish summary
```

---

---

## Wzorzec C — Wpływ generacji lokalnej na zabezpieczenia SN

### Pattern Identification

| Property | Value |
|----------|-------|
| Pattern ID | `RP-LOC-GEN-IMPACT` |
| Name (PL) | Wpływ generacji lokalnej na zabezpieczenia SN |
| Input Source | Dane zwarciowe (scenariusze: bez generacji, z generacją min/max) |
| Output | ReferencePatternResult |
| Verdict Values | ZGODNE / GRANICZNE / NIEZGODNE |

---

### 1. Zakres i cel wzorca

Wzorzec odniesienia C służy do diagnostyki wpływu **generacji lokalnej** (PV, BESS, agregaty)
na działanie zabezpieczeń SN, w szczególności:

- Prądy „widziane" przez zabezpieczenia w różnych scenariuszach pracy generacji
- Ryzyko niepożądanej blokady zabezpieczenia szyn
- Wpływ na selektywność stopni nadprądowych I> oraz I>>

**NOT-A-SOLVER**: Wzorzec nie wykonuje obliczeń fizycznych — jedynie analizuje i porównuje
wyniki obliczeń zwarciowych wykonanych przez solver IEC 60909.

---

### 2. Sprawdzenia diagnostyczne

#### 2.1 Sprawdzenie A: Zmiana prądu zwarciowego w punkcie zabezpieczenia

Porównanie prądu zwarciowego bez generacji i z maksymalną generacją:

$$
\Delta I_{k} = \frac{|I''_{k,gen} - I''_{k,bez}|}{I''_{k,bez}} \times 100\%
$$

**Klasyfikacja:**

| Zmiana względna | Status | Werdykt cząstkowy |
|-----------------|--------|-------------------|
| ≤ 10% | INFO | Informacyjne — brak istotnego wpływu |
| 10–30% | WARN | GRANICZNE — wymagana weryfikacja nastaw |
| > 30% | FAIL | NIEZGODNE — znacząca zmiana warunków zwarciowych |

#### 2.2 Sprawdzenie B: Ryzyko niepożądanej blokady zabezpieczenia szyn

Sprawdzenie, czy wkład prądowy od generacji lokalnej może spełnić warunki blokady
zabezpieczenia szyn zbiorczych:

$$
Ryzyko = I_{gen} \geq 0.8 \times I_{blokada}
$$

gdzie:
- $I_{gen}$ — wkład prądowy generacji lokalnej do prądu zwarciowego [A]
- $I_{blokada}$ — próg blokady zabezpieczenia szyn [A]

**Klasyfikacja:**

| Warunek | Status | Werdykt cząstkowy |
|---------|--------|-------------------|
| $I_{gen} < 0.8 \times I_{blokada}$ | PASS | Brak ryzyka blokady |
| $I_{gen} \geq 0.8 \times I_{blokada}$ | FAIL | NIEZGODNE — ryzyko niepożądanej blokady |
| Brak progu blokady | INFO | Sprawdzenie nie dotyczy |

**Zalecenia przy NIEZGODNE:**
- Zastosowanie zabezpieczenia kierunkowego
- Korekta progów blokady

#### 2.3 Sprawdzenie C: Wpływ na selektywność zabezpieczeń nadprądowych

Porównanie marginesu selektywności dla scenariuszy bez/z generacją:

$$
Margines_{sel} = \frac{I_{>>}}{I''_{k,next}}
$$

gdzie:
- $I_{>>}$ — nastawa wyższego stopnia nadprądowego [A]
- $I''_{k,next}$ — prąd zwarciowy za następnym zabezpieczeniem [A]

**Klasyfikacja:**

| Margines | Status | Werdykt cząstkowy |
|----------|--------|-------------------|
| ≥ 1.5 | PASS | Selektywność zachowana z zapasem |
| 1.2–1.5 (spadek > 0.3 z powodu generacji) | WARN | GRANICZNE — weryfikacja koordynacji |
| < 1.2 | FAIL | NIEZGODNE — utrata selektywności |

---

### 3. Werdykt końcowy

| Warunki | Werdykt |
|---------|---------|
| Którekolwiek sprawdzenie = NIEZGODNE | **NIEZGODNE** |
| Którekolwiek sprawdzenie = GRANICZNE (bez NIEZGODNE) | **GRANICZNE** |
| Wszystkie sprawdzenia = PASS lub INFO | **ZGODNE** |

---

### 4. Przypadki referencyjne

#### 4.1 Przypadek ZGODNY

**Scenariusz**: Instalacja PV 200 kW w sieci SN 15 kV o wysokiej mocy zwarciowej.

| Parametr | Wartość | Jednostka |
|----------|---------|-----------|
| Moc generacji | 200 | kW |
| Typ źródła | PV | — |
| Prąd zwarciowy bez generacji | 5200 | A |
| Prąd zwarciowy z generacją max | 5320 | A |
| Wkład generacji | 120 | A |
| Próg blokady szyn | 1500 | A |

**Wyniki:**

| Sprawdzenie | Zmiana/Stosunek | Status |
|-------------|-----------------|--------|
| A) Zmiana prądu | 2.3% | INFO |
| B) Blokada szyn | 8% progu | PASS |
| C) Selektywność | 1.33 | PASS |
| **Werdykt** | — | **ZGODNE** |

#### 4.2 Przypadek GRANICZNY

**Scenariusz**: Farma PV 1 MW + BESS 500 kW w sieci SN 15 kV.

| Parametr | Wartość | Jednostka |
|----------|---------|-----------|
| Moc generacji | 1500 | kW |
| Prąd zwarciowy bez generacji | 4200 | A |
| Prąd zwarciowy z generacją max | 5130 | A |
| Wkład generacji | 930 | A |

**Wyniki:**

| Sprawdzenie | Zmiana/Stosunek | Status |
|-------------|-----------------|--------|
| A) Zmiana prądu | 22.1% | WARN (GRANICZNE) |
| B) Blokada szyn | 51.7% progu | PASS |
| C) Selektywność | 1.50 | PASS |
| **Werdykt** | — | **GRANICZNE** |

#### 4.3 Przypadek NIEZGODNY

**Scenariusz**: Farma PV 3 MW + agregaty 2 MW w sieci SN 15 kV o niskiej mocy zwarciowej.

| Parametr | Wartość | Jednostka |
|----------|---------|-----------|
| Moc generacji | 5000 | kW |
| Prąd zwarciowy bez generacji | 3200 | A |
| Prąd zwarciowy z generacją max | 6650 | A |
| Wkład generacji | 3450 | A |
| Próg blokady szyn | 2500 | A |

**Wyniki:**

| Sprawdzenie | Zmiana/Stosunek | Status |
|-------------|-----------------|--------|
| A) Zmiana prądu | 107.8% | FAIL (NIEZGODNE) |
| B) Blokada szyn | 138% progu | FAIL (NIEZGODNE) |
| C) Selektywność | 1.45 | PASS |
| **Werdykt** | — | **NIEZGODNE** |

**Zalecane działania:**
- Zastosowanie zabezpieczeń kierunkowych
- Korekta nastaw zabezpieczeń
- Zmiana schematu zabezpieczeń

---

### 5. Struktura śladu WHITE-BOX

Każda walidacja generuje ślad z następującymi krokami:

```json
[
  {
    "step": "wczytanie_fixture",
    "description_pl": "Wczytanie danych referencyjnych z pliku fixture"
  },
  {
    "step": "inicjalizacja_diagnostyki",
    "description_pl": "Inicjalizacja diagnostyki wpływu generacji lokalnej"
  },
  {
    "step": "sprawdzenie_zmiany_pradu",
    "description_pl": "Sprawdzenie A: analiza zmiany prądu zwarciowego",
    "formula": "\\Delta I_{k} = |I''_{k,gen} - I''_{k,bez}| / I''_{k,bez} × 100%"
  },
  {
    "step": "sprawdzenie_blokady_szyn",
    "description_pl": "Sprawdzenie B: analiza ryzyka blokady zabezpieczenia szyn",
    "formula": "Ryzyko = I_{gen} ≥ 0.8 × I_{blokada}"
  },
  {
    "step": "sprawdzenie_selektywnosci",
    "description_pl": "Sprawdzenie C: analiza wpływu na selektywność",
    "formula": "Margines_{sel} = I_{>>} / I''_{k,next}"
  },
  {
    "step": "wyznaczenie_werdyktu",
    "description_pl": "Wyznaczenie werdyktu końcowego wzorca"
  }
]
```

---

### 6. Artefakty wynikowe

| Klucz | Opis | Jednostka |
|-------|------|-----------|
| `punkt_zabezpieczenia_id` | Identyfikator punktu zabezpieczenia | — |
| `liczba_zrodel_generacji` | Liczba źródeł generacji | — |
| `sumaryczna_moc_generacji_kw` | Sumaryczna moc generacji | kW |
| `ik_bez_generacji_3f_a` | Prąd zwarciowy 3f bez generacji | A |
| `ik_z_generacja_max_3f_a` | Prąd zwarciowy 3f z generacją max | A |
| `zmiana_pradu_zwarciowego_pct` | Zmiana prądu zwarciowego | % |
| `wklad_generacji_max_a` | Wkład prądowy generacji max | A |
| `wynik_sprawdzenia_a` | Wynik sprawdzenia A | INFO/GRANICZNE/NIEZGODNE |
| `wynik_sprawdzenia_b` | Wynik sprawdzenia B | PASS/NIEZGODNE |
| `wynik_sprawdzenia_c` | Wynik sprawdzenia C | PASS/GRANICZNE/NIEZGODNE |

---

### 7. Gwarancja determinizmu

Wzorzec gwarantuje deterministyczny wynik:

- Brak znaczników czasu systemowego w śladzie obliczeń
- Wszystkie kolekcje sortowane według deterministycznych kluczy
- Stabilna serializacja JSON z posortowanymi kluczami
- 2× uruchomienie z tymi samymi danymi → identyczny wynik

Weryfikacja testowa:
```python
result1 = run_pattern_c(input_data=...)
result2 = run_pattern_c(input_data=...)
assert stable_json(result1.to_dict()) == stable_json(result2.to_dict())
```

---

### 8. Przykład użycia

```python
from application.reference_patterns import (
    run_pattern_c,
    WzorzecCInput,
    ZrodloGeneracji,
    DaneZwarciowePunktuZabezpieczenia,
    NastawyZabezpieczen,
    TypGeneracji,
)

# Z pliku fixture
result = run_pattern_c(fixture_file="przypadek_zgodny.json")

# Z danych wejściowych
input_data = WzorzecCInput(
    punkt_zabezpieczenia_id="pz-001",
    punkt_zabezpieczenia_nazwa="Pole liniowe L-04",
    szyny_id="szyny-001",
    szyny_nazwa="Szyny 15 kV GPZ",
    zrodla_generacji=(
        ZrodloGeneracji(
            id="pv-001",
            nazwa="Instalacja PV",
            typ=TypGeneracji.PV,
            moc_znamionowa_kw=200.0,
            prad_zwarciowy_a=120.0,
        ),
    ),
    dane_bez_generacji=DaneZwarciowePunktuZabezpieczenia(
        scenariusz="bez_generacji",
        ik_3f_a=5200.0,
        ik_2f_a=4500.0,
        ik_1f_a=3800.0,
        wklad_generacji_a=0.0,
    ),
    dane_generacja_min=DaneZwarciowePunktuZabezpieczenia(
        scenariusz="generacja_min",
        ik_3f_a=5250.0,
        ik_2f_a=4545.0,
        ik_1f_a=3840.0,
        wklad_generacji_a=50.0,
    ),
    dane_generacja_max=DaneZwarciowePunktuZabezpieczenia(
        scenariusz="generacja_max",
        ik_3f_a=5320.0,
        ik_2f_a=4608.0,
        ik_1f_a=3895.0,
        wklad_generacji_a=120.0,
    ),
    nastawy=NastawyZabezpieczen(
        i_wyzszy_stopien_a=2400.0,
        i_nizszy_stopien_a=800.0,
        prog_blokady_szyn_a=1500.0,
    ),
    ik_za_nastepnym_zabezpieczeniem_a=1800.0,
)

result = run_pattern_c(input_data=input_data)

print(result.verdict)  # "ZGODNE"
print(result.summary_pl)  # Podsumowanie po polsku
```

---

## References

- IEC 60909:2016 — Short-circuit currents in three-phase a.c. systems
- IEC 60255-151:2009 — Measuring relays and protection equipment
- PN-EN 60909-0:2016-09 — Prądy zwarciowe w sieciach trójfazowych prądu przemiennego
- FIX-12D — Line Overcurrent Setting Analysis Module (MV-DESIGN-PRO)
- IRiESD — Instrukcja Ruchu i Eksploatacji Sieci Dystrybucyjnej (zasady przyłączania OZE)

---

*Document generated for MV-DESIGN-PRO Reference Patterns Module.*
