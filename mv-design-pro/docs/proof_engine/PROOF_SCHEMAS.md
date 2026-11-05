# Proof Schemas — Kanoniczne schematy JSON

**STATUS: CANONICAL & BINDING**
**Version:** 1.0
**Reference:** P11_OVERVIEW.md, P11_1a_MVP_SC3F_AND_VDROP.md

---

## 1. Przeznaczenie

Ten dokument zawiera **kanoniczne schematy JSON** dla wszystkich struktur danych Proof Engine.

**Agent MUSI używać tych schematów literalnie bez interpretacji.**

---

## 2. ProofDocument

### 2.1 Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mv-design-pro.local/schemas/proof-document.json",
  "title": "ProofDocument",
  "description": "Dokument dowodowy dla pojedynczego uruchomienia solvera",
  "type": "object",
  "required": [
    "document_id",
    "artifact_id",
    "created_at",
    "proof_type",
    "title_pl",
    "header",
    "steps",
    "summary"
  ],
  "properties": {
    "document_id": {
      "type": "string",
      "format": "uuid",
      "description": "Unikalny identyfikator dokumentu dowodowego"
    },
    "artifact_id": {
      "type": "string",
      "format": "uuid",
      "description": "Powiązanie z TraceArtifact"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "description": "Data i czas utworzenia dokumentu"
    },
    "proof_type": {
      "type": "string",
      "enum": ["SC3F_IEC60909", "VDROP", "LOAD_FLOW_VOLTAGE", "SC1F_IEC60909", "SC2F_IEC60909", "SC2FG_IEC60909", "Q_U_REGULATION", "LOAD_CURRENTS_OVERLOAD"],
      "description": "Typ dowodu"
    },
    "title_pl": {
      "type": "string",
      "description": "Tytuł dokumentu po polsku"
    },
    "header": {
      "$ref": "#/$defs/ProofHeader"
    },
    "steps": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/ProofStep"
      },
      "minItems": 1,
      "description": "Lista kroków dowodu"
    },
    "summary": {
      "$ref": "#/$defs/ProofSummary"
    },
    "json_representation": {
      "type": "string",
      "description": "Pełna serializacja JSON (self-reference)"
    },
    "latex_representation": {
      "type": "string",
      "description": "Kod LaTeX dokumentu"
    }
  },
  "$defs": {
    "ProofHeader": {
      "type": "object",
      "required": ["project_name", "case_name", "run_timestamp", "solver_version"],
      "properties": {
        "project_name": { "type": "string" },
        "case_name": { "type": "string" },
        "run_timestamp": { "type": "string", "format": "date-time" },
        "solver_version": { "type": "string" },
        "target_id": { "type": ["string", "null"] },
        "element_kind": { "type": ["string", "null"] },
        "fault_location": { "type": ["string", "null"] },
        "fault_type": { "type": ["string", "null"] },
        "voltage_factor": { "type": ["number", "null"] },
        "source_bus": { "type": ["string", "null"] },
        "target_bus": { "type": ["string", "null"] }
      }
    },
    "ProofStep": {
      "$ref": "#/$defs/ProofStepFull"
    },
    "ProofStepFull": {
      "type": "object",
      "required": [
        "step_id",
        "step_number",
        "title_pl",
        "equation",
        "input_values",
        "substitution_latex",
        "result",
        "unit_check"
      ],
      "properties": {
        "step_id": { "type": "string", "pattern": "^[A-Z0-9_]+$" },
        "step_number": { "type": "integer", "minimum": 1 },
        "title_pl": { "type": "string" },
        "equation": { "$ref": "#/$defs/EquationDefinition" },
        "input_values": {
          "type": "array",
          "items": { "$ref": "#/$defs/ProofValue" }
        },
        "substitution_latex": { "type": "string" },
        "result": { "$ref": "#/$defs/ProofValue" },
        "unit_check": { "$ref": "#/$defs/UnitCheckResult" },
        "source_keys": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        }
      }
    },
    "ProofSummary": {
      "type": "object",
      "required": ["key_results", "unit_check_passed", "total_steps"],
      "properties": {
        "key_results": {
          "type": "object",
          "additionalProperties": { "$ref": "#/$defs/ProofValue" }
        },
        "unit_check_passed": { "type": "boolean" },
        "total_steps": { "type": "integer", "minimum": 1 },
        "warnings": {
          "type": "array",
          "items": { "type": "string" }
        },
        "overall_status": { "type": ["string", "null"] },
        "failed_checks": {
          "type": "array",
          "items": { "type": "string" }
        },
        "counterfactual_diff": {
          "type": "object",
          "additionalProperties": { "$ref": "#/$defs/ProofValue" }
        }
      }
    },
    "EquationDefinition": {
      "$ref": "equation-definition.json"
    },
    "ProofValue": {
      "$ref": "proof-value.json"
    },
    "UnitCheckResult": {
      "$ref": "unit-check-result.json"
    }
  }
}
```

---

## 3. ProofStep

### 3.1 Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mv-design-pro.local/schemas/proof-step.json",
  "title": "ProofStep",
  "description": "Pojedynczy krok w łańcuchu dowodowym",
  "type": "object",
  "required": [
    "step_id",
    "step_number",
    "title_pl",
    "equation",
    "input_values",
    "substitution_latex",
    "result",
    "unit_check"
  ],
  "properties": {
    "step_id": {
      "type": "string",
      "pattern": "^[A-Z0-9_]+$",
      "description": "Unikalny identyfikator kroku (np. SC3F_STEP_004)",
      "examples": ["SC3F_STEP_001", "VDROP_STEP_003"]
    },
    "step_number": {
      "type": "integer",
      "minimum": 1,
      "description": "Numer porządkowy kroku"
    },
    "title_pl": {
      "type": "string",
      "description": "Tytuł kroku po polsku",
      "examples": ["Początkowy prąd zwarciowy symetryczny", "Spadek napięcia na odcinku"]
    },
    "equation": {
      "$ref": "#/$defs/EquationDefinition",
      "description": "Definicja równania z rejestru"
    },
    "input_values": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/ProofValue"
      },
      "description": "Wartości wejściowe do podstawienia"
    },
    "substitution_latex": {
      "type": "string",
      "description": "Wzór z podstawionymi wartościami liczbowymi (LaTeX)",
      "examples": ["I_k'' = \\frac{1.1 \\cdot 15.0}{\\sqrt{3} \\cdot 2.06}"]
    },
    "result": {
      "$ref": "#/$defs/ProofValue",
      "description": "Wynik obliczenia"
    },
    "unit_check": {
      "$ref": "#/$defs/UnitCheckResult",
      "description": "Wynik weryfikacji jednostek"
    },
    "source_keys": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      },
      "description": "Mapping: symbol → klucz w trace/result",
      "examples": [{"c": "c_factor", "U_n": "u_n_kv", "Z_th": "z_thevenin_ohm"}]
    }
  },
  "$defs": {
    "EquationDefinition": {
      "type": "object",
      "required": ["equation_id", "latex"],
      "properties": {
        "equation_id": { "type": "string" },
        "latex": { "type": "string" },
        "name_pl": { "type": "string" },
        "symbols": {
          "type": "array",
          "items": { "$ref": "#/$defs/SymbolDefinition" }
        }
      }
    },
    "ProofValue": {
      "type": "object",
      "required": ["symbol", "value", "unit", "source_key"],
      "properties": {
        "symbol": { "type": "string" },
        "value": { "oneOf": [{ "type": "number" }, { "type": "string" }] },
        "unit": { "type": "string" },
        "formatted": { "type": "string" },
        "source_key": { "type": "string" }
      }
    },
    "UnitCheckResult": {
      "type": "object",
      "required": ["passed", "expected_unit", "computed_unit"],
      "properties": {
        "passed": { "type": "boolean" },
        "expected_unit": { "type": "string" },
        "computed_unit": { "type": "string" },
        "input_units": {
          "type": "object",
          "additionalProperties": { "type": "string" }
        },
        "derivation": { "type": "string" }
      }
    },
    "SymbolDefinition": {
      "type": "object",
      "required": ["symbol", "unit", "description_pl"],
      "properties": {
        "symbol": { "type": "string" },
        "unit": { "type": "string" },
        "description_pl": { "type": "string" },
        "mapping_key": { "type": "string" }
      }
    }
  }
}
```

---

## 4. EquationDefinition

### 4.1 Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mv-design-pro.local/schemas/equation-definition.json",
  "title": "EquationDefinition",
  "description": "Definicja równania z rejestru równań",
  "type": "object",
  "required": ["equation_id", "latex", "name_pl", "symbols"],
  "properties": {
    "equation_id": {
      "type": "string",
      "pattern": "^EQ_[A-Z0-9_]+$",
      "description": "Unikalny identyfikator równania",
      "examples": ["EQ_SC3F_004", "EQ_VDROP_005"]
    },
    "latex": {
      "type": "string",
      "description": "Wzór w notacji LaTeX",
      "examples": ["I_k'' = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot |Z_{th}|}"]
    },
    "name_pl": {
      "type": "string",
      "description": "Nazwa równania po polsku",
      "examples": ["Początkowy prąd zwarciowy symetryczny"]
    },
    "standard_ref": {
      "type": "string",
      "description": "Odniesienie do normy (bez cytowania treści)",
      "examples": ["IEC 60909-0:2016 eq. (29)"]
    },
    "symbols": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/SymbolDefinition"
      },
      "description": "Lista symboli użytych w równaniu"
    }
  },
  "$defs": {
    "SymbolDefinition": {
      "type": "object",
      "required": ["symbol", "unit", "description_pl", "mapping_key"],
      "properties": {
        "symbol": {
          "type": "string",
          "description": "Symbol matematyczny (LaTeX)",
          "examples": ["I_k''", "Z_{th}", "c"]
        },
        "unit": {
          "type": "string",
          "description": "Jednostka SI",
          "examples": ["kA", "Ω", "—"]
        },
        "description_pl": {
          "type": "string",
          "description": "Opis po polsku",
          "examples": ["Początkowy prąd zwarciowy symetryczny"]
        },
        "mapping_key": {
          "type": "string",
          "description": "Literalny klucz w trace/result",
          "examples": ["ikss_ka", "z_thevenin_ohm", "c_factor"]
        }
      }
    }
  }
}
```

---

## 5. SymbolDefinition

### 5.1 Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mv-design-pro.local/schemas/symbol-definition.json",
  "title": "SymbolDefinition",
  "description": "Definicja symbolu matematycznego",
  "type": "object",
  "required": ["symbol", "unit", "description_pl", "mapping_key"],
  "properties": {
    "symbol": {
      "type": "string",
      "description": "Symbol matematyczny w notacji LaTeX",
      "examples": ["I_k''", "Z_{th}", "\\kappa", "\\Delta U"]
    },
    "unit": {
      "type": "string",
      "description": "Jednostka SI lub '—' dla wielkości bezwymiarowych",
      "examples": ["kA", "Ω", "kV", "MVA", "%", "—"]
    },
    "description_pl": {
      "type": "string",
      "description": "Pełny opis po polsku",
      "examples": [
        "Początkowy prąd zwarciowy symetryczny",
        "Impedancja zastępcza Thevenina",
        "Współczynnik udaru"
      ]
    },
    "mapping_key": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$",
      "description": "Literalny klucz w intermediate_values lub output_results",
      "examples": ["ikss_ka", "z_thevenin_ohm", "kappa", "delta_u_percent"]
    }
  }
}
```

---

## 6. UnitCheckResult

### 6.1 Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mv-design-pro.local/schemas/unit-check-result.json",
  "title": "UnitCheckResult",
  "description": "Wynik weryfikacji spójności jednostek",
  "type": "object",
  "required": ["passed", "expected_unit", "computed_unit"],
  "properties": {
    "passed": {
      "type": "boolean",
      "description": "Czy weryfikacja jednostek przeszła pomyślnie"
    },
    "expected_unit": {
      "type": "string",
      "description": "Oczekiwana jednostka wyniku",
      "examples": ["kA", "Ω", "%"]
    },
    "computed_unit": {
      "type": "string",
      "description": "Jednostka obliczona z jednostek wejściowych",
      "examples": ["kA", "Ω", "%"]
    },
    "input_units": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      },
      "description": "Jednostki wartości wejściowych",
      "examples": [{"c": "—", "U_n": "kV", "Z_th": "Ω"}]
    },
    "derivation": {
      "type": "string",
      "description": "Ścieżka derywacji jednostek",
      "examples": ["kV / Ω = kA", "(Ω · MW) / kV² = %"]
    }
  }
}
```

---

## 7. Reguły determinism (BINDING)

### 7.1 Sortowanie

| Element | Reguła sortowania |
|---------|-------------------|
| `steps` | Po `step_number` rosnąco |
| `input_values` | Po `symbol` alfabetycznie |
| `symbols` (w EquationDefinition) | Po `symbol` alfabetycznie |
| `key_results` | Po kluczu alfabetycznie |
| `source_keys` | Po kluczu alfabetycznie |

### 7.2 Kolejność kroków

Kolejność kroków jest ustalona przez Equation Registry i nie może być zmieniana:

```python
SC3F_STEP_ORDER = [
    "SC3F_STEP_001",  # Napięcie z współczynnikiem c
    "SC3F_STEP_002",  # Impedancja źródła
    "SC3F_STEP_003",  # Impedancja Thevenina
    "SC3F_STEP_004",  # Prąd zwarciowy I_k''
    "SC3F_STEP_005",  # Współczynnik udaru κ
    "SC3F_STEP_006",  # Prąd udarowy i_p
    "SC3F_STEP_007",  # Moc zwarciowa S_k''
]

VDROP_STEP_ORDER = [
    "VDROP_STEP_001",  # Rezystancja odcinka
    "VDROP_STEP_002",  # Reaktancja odcinka
    "VDROP_STEP_003",  # Składowa czynna ΔU_R
    "VDROP_STEP_004",  # Składowa bierna ΔU_X
    "VDROP_STEP_005",  # Spadek na odcinku ΔU
    "VDROP_STEP_006",  # Suma spadków ΔU_total
]
```

### 7.3 Stabilne ID — polityka wersjonowania (BINDING)

```python
def generate_step_id(proof_type: str, step_number: int) -> str:
    """
    Generuje stabilne ID kroku.
    """
    return f"{proof_type}_STEP_{step_number:03d}"

# Przykłady:
# SC3F_STEP_001, SC3F_STEP_002, ...
# VDROP_STEP_001, VDROP_STEP_002, ...
```

#### 7.3.1 Gwarancje stabilności ID (BINDING)

$$
\boxed{
\begin{aligned}
&\textbf{Polityka stabilności identyfikatorów:} \\[8pt]
&\text{1. } \texttt{step\_id} \text{ NIE MOŻE się zmienić między wersjami} \\
&\text{2. } \texttt{equation\_id} \text{ NIE MOŻE się zmienić dla istniejących równań} \\
&\text{3. } \texttt{mapping\_key} \text{ NIE MOŻE się zmienić dla istniejących pól} \\[8pt]
&\textbf{Przy dodawaniu nowych:} \\[4pt]
&\text{• Nowe równania: użyj następnego wolnego ID (np. EQ\_SC3F\_011)} \\
&\text{• Nowe kroki: użyj następnego wolnego numeru} \\
&\text{• Nowe mapping keys: dodaj z nową nazwą, nie modyfikuj istniejących}
\end{aligned}
}
$$

#### 7.3.2 Reguły dla document_id i artifact_id

| ID | Generowanie | Stabilność |
|----|-------------|------------|
| `document_id` | UUID v4 przy tworzeniu ProofDocument | Nowy przy każdym generowaniu |
| `artifact_id` | UUID v4 przy tworzeniu TraceArtifact | Nowy przy każdym CalculationRun |
| `step_id` | Deterministyczny: `{proof_type}_STEP_{nnn}` | STABILNY między wersjami |
| `equation_id` | Deterministyczny: `EQ_{type}_{nnn}` | STABILNY, IMMUTABLE |

#### 7.3.3 Test stabilności (BINDING)

```python
def test_id_stability():
    """
    Weryfikuje, że żaden istniejący ID nie został zmieniony.
    """
    FROZEN_IDS = {
        "equations": ["EQ_SC3F_001", "EQ_SC3F_002", ..., "EQ_SC3F_010"],
        "steps": ["SC3F_STEP_001", ..., "SC3F_STEP_010"],
        "mapping_keys": ["ikss_ka", "ip_ka", "ith_ka", "idyn_ka", "sk_mva", ...]
    }

    for eq_id in FROZEN_IDS["equations"]:
        assert eq_id in current_equation_registry, f"ID {eq_id} usunięty!"

    for mapping_key in FROZEN_IDS["mapping_keys"]:
        assert mapping_key in current_schema, f"Key {mapping_key} usunięty!"
```

### 7.4 Formatowanie liczb

| Typ | Formatowanie |
|-----|--------------|
| float | 4 miejsca znaczące (np. 4.620, 0.5000) |
| complex | Re + jIm z 4 miejscami (np. 0.5000 + j2.000) |
| procent | 2 miejsca po przecinku (np. 4.50%) |

---

## 8. Przykład kompletnego ProofDocument

```json
{
  "document_id": "550e8400-e29b-41d4-a716-446655440000",
  "artifact_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "created_at": "2026-01-27T10:30:00Z",
  "proof_type": "SC3F_IEC60909",
  "title_pl": "Dowód obliczeń zwarciowych IEC 60909",
  "header": {
    "project_name": "Projekt SN-01",
    "case_name": "Zwarcie na szynie B2",
    "run_timestamp": "2026-01-27T10:29:55Z",
    "solver_version": "1.2.0",
    "fault_location": "B2",
    "fault_type": "THREE_PHASE",
    "voltage_factor": 1.1,
    "source_bus": null,
    "target_bus": null
  },
  "steps": [
    {
      "step_id": "SC3F_STEP_004",
      "step_number": 4,
      "title_pl": "Początkowy prąd zwarciowy symetryczny",
      "equation": {
        "equation_id": "EQ_SC3F_004",
        "latex": "I_k'' = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot |Z_{th}|}",
        "name_pl": "Początkowy prąd zwarciowy symetryczny",
        "standard_ref": "IEC 60909-0:2016 eq. (29)",
        "symbols": [
          {
            "symbol": "I_k''",
            "unit": "kA",
            "description_pl": "Początkowy prąd zwarciowy symetryczny",
            "mapping_key": "ikss_ka"
          },
          {
            "symbol": "c",
            "unit": "—",
            "description_pl": "Współczynnik napięciowy",
            "mapping_key": "c_factor"
          },
          {
            "symbol": "U_n",
            "unit": "kV",
            "description_pl": "Napięcie znamionowe",
            "mapping_key": "u_n_kv"
          },
          {
            "symbol": "Z_{th}",
            "unit": "Ω",
            "description_pl": "Impedancja zastępcza Thevenina",
            "mapping_key": "z_thevenin_ohm"
          }
        ]
      },
      "input_values": [
        {
          "symbol": "c",
          "value": 1.1,
          "unit": "—",
          "formatted": "1.100",
          "source_key": "c_factor"
        },
        {
          "symbol": "U_n",
          "value": 15.0,
          "unit": "kV",
          "formatted": "15.00 kV",
          "source_key": "u_n_kv"
        },
        {
          "symbol": "Z_{th}",
          "value": "0.5000+j2.000",
          "unit": "Ω",
          "formatted": "0.5000 + j2.000 Ω, |Z| = 2.062 Ω",
          "source_key": "z_thevenin_ohm"
        }
      ],
      "substitution_latex": "I_k'' = \\frac{1.100 \\cdot 15.00}{\\sqrt{3} \\cdot 2.062} = 4.620\\,\\text{kA}",
      "result": {
        "symbol": "I_k''",
        "value": 4.62,
        "unit": "kA",
        "formatted": "4.620 kA",
        "source_key": "ikss_ka"
      },
      "unit_check": {
        "passed": true,
        "expected_unit": "kA",
        "computed_unit": "kA",
        "input_units": {
          "c": "—",
          "U_n": "kV",
          "Z_th": "Ω"
        },
        "derivation": "kV / Ω = kA ✓"
      },
      "source_keys": {
        "c": "c_factor",
        "U_n": "u_n_kv",
        "Z_th": "z_thevenin_ohm",
        "I_k''": "ikss_ka"
      }
    }
  ],
  "summary": {
    "key_results": {
      "ikss_ka": {
        "symbol": "I_k''",
        "value": 4.62,
        "unit": "kA",
        "formatted": "4.620 kA",
        "source_key": "ikss_ka"
      },
      "ip_ka": {
        "symbol": "i_p",
        "value": 11.76,
        "unit": "kA",
        "formatted": "11.76 kA",
        "source_key": "ip_ka"
      },
      "sk_mva": {
        "symbol": "S_k''",
        "value": 120.0,
        "unit": "MVA",
        "formatted": "120.0 MVA",
        "source_key": "sk_mva"
      }
    },
    "unit_check_passed": true,
    "total_steps": 7,
    "warnings": []
  }
}
```

---

## TODO — Proof Packs P14–P19 (FUTURE PACKS)

### TODO-P14-001 (PLANNED) — P14: Power Flow Proof Pack (audit wyników PF) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult
- Output: ProofPack P14 (ProofDocument: Audit rozpływu mocy)
- DoD:
  - [ ] Dowód bilansu węzła dla mocy czynnej i biernej z mapowaniem do TraceArtifact.

    $$
    \sum P = 0,\quad \sum Q = 0
    $$

  - [ ] Bilans gałęzi dla mocy czynnej i biernej uwzględnia straty oraz spadek napięcia.

    $$
    P_{in} \rightarrow P_{out} + P_{loss},\quad Q_{in} \rightarrow Q_{out} + \Delta U
    $$

  - [ ] Straty linii liczone jawnie z prądu i rezystancji.

    $$
    P_{loss} = I^{2} \cdot R
    $$

  - [ ] Porównanie counterfactual Case A vs Case B z raportem różnic.

    $$
    \Delta P,\ \Delta Q,\ \Delta U
    $$

### P15 — Load Currents & Overload Proof Pack (IMPLEMENTED)
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P15 (ProofDocument: Prądy robocze i przeciążenia)
- DoD:
  - [x] Prądy obciążenia linii/kabli wyprowadzone z mocy pozornej.

    $$
    I = \frac{S}{\sqrt{3} \cdot U}
    $$

  - [x] Porównanie do prądu znamionowego z marginesem procentowym (bez PASS/FAIL).
  - [x] Transformator: relacja obciążenia do mocy znamionowej i overload %.

    $$
    \frac{S}{S_n}
    $$

### TODO-P16-001 (PLANNED) — P16: Losses & Energy Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P16 (ProofDocument: Straty mocy i energii)
- DoD:
  - [ ] Straty linii wyprowadzone z prądu i rezystancji.

    $$
    P_{loss,line} = I^{2} \cdot R
    $$

  - [ ] Straty transformatora z danych katalogowych: suma P0 i Pk.

    $$
    P_{loss,trafo} = P_{0} + P_{k}
    $$

  - [ ] Energia strat z profilu obciążenia (integracja w czasie).

    $$
    E_{loss} = \int P_{loss} \, dt
    $$

### P19 — Earthing / Ground Fault Proof Pack (SN) — SKASOWANY
Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (commit 5, 2026-10-30): pakiet nie miał producenta w
`backend/src`, liczył fizykę w silniku dowodów (I_E = U_0/Z_E, U_d = I_u·R_u „uproszczone”)
i dublował dowód bezpieczeństwa uziomu V12.6. Prąd zwarcia doziemnego stacji wg EN 50522
tab. 1 (z modelu: I_C, I_res, √(I_L² + I_res²), I″k1) i napięcia rażeniowe niesie ślad White
Box biegu `earthing_safety` (krok `en50522_prad_uziomowy`) i jego dowód V12.6.

**END OF PROOF SCHEMAS**
