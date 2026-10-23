# P11.1a (MVP) — SC3F IEC60909 + Spadki/Wzrosty Napięć (VDROP)

**STATUS: CANONICAL & BINDING**
**Version:** 1.0
**Reference:** P11_OVERVIEW.md, PROOF_SCHEMAS.md, EQUATIONS_IEC60909_SC3F.md, EQUATIONS_VDROP.md

---

## 1. Cel MVP

### 1.1 Zakres P11.1a

| W zakresie | Poza zakresem |
|------------|---------------|
| SC3F (zwarcie trójfazowe) IEC 60909 | Zwarcia niesymetryczne (1F, 2F, 2FG) |
| Spadki/wzrosty napięć (VDROP) | Regulatory Q(U), cosφ(P) |
| ProofDocument JSON + LaTeX | UI Proof Inspector (tylko kontrakt) |
| Weryfikacja jednostek | Eksport PDF/DOCX |

### 1.2 Cel biznesowy

Umożliwienie generowania **formalnego dowodu matematycznego** dla:
1. Obliczeń zwarciowych trójfazowych wg IEC 60909
2. Obliczeń spadków napięć w sieci SN/nN

Dowód musi być:
- **Kompletny** — każdy krok ma wzór, dane, podstawienie, wynik
- **Weryfikowalny** — jednostki sprawdzone automatycznie
- **Deterministyczny** — ten sam run → identyczny dowód

---

## 2. ProofDocument — definicja

### 2.1 Struktura główna

```python
@dataclass(frozen=True)
class ProofDocument:
    """
    Dokument dowodowy dla pojedynczego uruchomienia solvera.
    """
    # Identyfikacja
    document_id: UUID
    artifact_id: UUID          # powiązanie z TraceArtifact
    created_at: datetime

    # Metadane
    proof_type: str            # "SC3F_IEC60909" | "VDROP" | ...
    title_pl: str              # "Dowód obliczeń zwarciowych IEC 60909"

    # Zawartość
    header: ProofHeader
    steps: Tuple[ProofStep, ...]
    summary: ProofSummary

    # Eksport
    json_representation: str   # serializacja JSON
    latex_representation: str  # kod LaTeX
```

### 2.2 ProofHeader

```python
@dataclass(frozen=True)
class ProofHeader:
    """
    Nagłówek dokumentu dowodowego.
    """
    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str

    # Parametry główne (zależne od typu dowodu)
    fault_location: str | None      # dla SC3F
    fault_type: str | None          # dla SC3F
    voltage_factor: float | None    # dla SC3F
    source_bus: str | None          # dla VDROP
    target_bus: str | None          # dla VDROP
```

### 2.3 ProofSummary

```python
@dataclass(frozen=True)
class ProofSummary:
    """
    Podsumowanie wyników dowodu.
    """
    key_results: Dict[str, ProofValue]  # główne wyniki z jednostkami
    unit_check_passed: bool             # czy wszystkie jednostki OK
    total_steps: int
    warnings: Tuple[str, ...]           # ostrzeżenia (jeśli są)
```

---

## 3. ProofStep — definicja

### 3.1 Struktura kroku dowodu

```python
@dataclass(frozen=True)
class ProofStep:
    """
    Pojedynczy krok w łańcuchu dowodowym.
    Format: Wzór → Dane → Podstawienie → Wynik → Weryfikacja jednostek
    """
    step_id: str                    # unikalny identyfikator kroku
    step_number: int                # numer porządkowy (1, 2, 3, ...)
    title_pl: str                   # tytuł po polsku

    # Wzór
    equation: EquationDefinition    # definicja równania z rejestru

    # Dane wejściowe
    input_values: Tuple[ProofValue, ...]

    # Podstawienie
    substitution_latex: str         # wzór z podstawionymi wartościami

    # Wynik
    result: ProofValue

    # Weryfikacja jednostek
    unit_check: UnitCheckResult

    # Mapping do źródła
    source_keys: Dict[str, str]     # mapping: symbol → klucz w trace/result
```

### 3.2 ProofValue

```python
@dataclass(frozen=True)
class ProofValue:
    """
    Wartość z jednostką i formatowaniem.
    """
    symbol: str                 # symbol matematyczny (np. "I_k''")
    value: float | complex      # wartość numeryczna
    unit: str                   # jednostka (np. "kA")
    formatted: str              # sformatowana wartość (np. "12.45 kA")
    source_key: str             # klucz w trace/result (np. "ikss_ka")
```

### 3.3 UnitCheckResult

```python
@dataclass(frozen=True)
class UnitCheckResult:
    """
    Wynik weryfikacji spójności jednostek.
    """
    passed: bool
    expected_unit: str
    computed_unit: str
    input_units: Dict[str, str]    # jednostki wejść
    derivation: str                # ścieżka derywacji (np. "V / Ω = A")
```

---

## 4. Kroki dowodu SC3F (BINDING)

### 4.1 Lista kroków (MANDATORY)

$$
\begin{array}{|c|l|l|l|}
\hline
\textbf{Nr} & \textbf{Krok} & \textbf{Równanie} & \textbf{Wynik} \\
\hline
1 & \text{Napięcie znamionowe z współczynnikiem } c & \text{EQ\_SC3F\_001} & c \cdot U_n \\
2 & \text{Impedancja źródła} & \text{EQ\_SC3F\_002} & Z_Q \\
3 & \text{Impedancja Thevenina} & \text{EQ\_SC3F\_003} & Z_{th} \\
4 & \text{Początkowy prąd zwarciowy} & \text{EQ\_SC3F\_004} & I_k'' \\
5 & \text{Współczynnik udaru} & \text{EQ\_SC3F\_005} & \kappa \\
6 & \text{Prąd udarowy} & \text{EQ\_SC3F\_006} & i_p \\
7 & \text{Prąd dynamiczny (OBOWIĄZKOWY)} & \text{EQ\_SC3F\_008a} & I_{dyn} \\
8 & \text{Prąd cieplny (OBOWIĄZKOWY)} & \text{EQ\_SC3F\_008} & I_{th} \\
9 & \text{Moc zwarciowa} & \text{EQ\_SC3F\_007} & S_k'' \\
\hline
\end{array}
$$

### 4.2 Szczegóły kroków

#### Krok 1: Napięcie znamionowe z współczynnikiem c

```yaml
step_id: SC3F_STEP_001
title_pl: "Napięcie znamionowe z współczynnikiem napięciowym"
equation_id: EQ_SC3F_001
input_values:
  - symbol: "c"
    source_key: "c_factor"
  - symbol: "U_n"
    source_key: "u_n_kv"
result:
  symbol: "c·U_n"
  unit: "kV"
```

#### Krok 2: Impedancja źródła

```yaml
step_id: SC3F_STEP_002
title_pl: "Impedancja źródła (sieć zasilająca)"
equation_id: EQ_SC3F_002
input_values:
  - symbol: "U_n"
    source_key: "u_n_kv"
  - symbol: "S_k''"
    source_key: "sk_source_mva"
  - symbol: "R/X"
    source_key: "rx_ratio"
result:
  symbol: "Z_Q"
  unit: "Ω"
```

#### Krok 3: Impedancja Thevenina

```yaml
step_id: SC3F_STEP_003
title_pl: "Impedancja zastępcza Thevenina w miejscu zwarcia"
equation_id: EQ_SC3F_003
input_values:
  - symbol: "Z_Q"
    source_key: "z_source_ohm"
  - symbol: "Z_T"
    source_key: "z_transformer_ohm"
  - symbol: "Z_L"
    source_key: "z_line_ohm"
result:
  symbol: "Z_th"
  unit: "Ω"
```

#### Krok 4: Początkowy prąd zwarciowy

```yaml
step_id: SC3F_STEP_004
title_pl: "Początkowy prąd zwarciowy symetryczny"
equation_id: EQ_SC3F_004
input_values:
  - symbol: "c"
    source_key: "c_factor"
  - symbol: "U_n"
    source_key: "u_n_kv"
  - symbol: "Z_th"
    source_key: "z_thevenin_ohm"
result:
  symbol: "I_k''"
  unit: "kA"
  source_key: "ikss_ka"
```

#### Krok 5: Współczynnik udaru

```yaml
step_id: SC3F_STEP_005
title_pl: "Współczynnik udaru κ"
equation_id: EQ_SC3F_005
input_values:
  - symbol: "R_th"
    source_key: "r_thevenin_ohm"
  - symbol: "X_th"
    source_key: "x_thevenin_ohm"
result:
  symbol: "κ"
  unit: "—"
  source_key: "kappa"
```

#### Krok 6: Prąd udarowy

```yaml
step_id: SC3F_STEP_006
title_pl: "Prąd udarowy (szczytowy)"
equation_id: EQ_SC3F_006
input_values:
  - symbol: "κ"
    source_key: "kappa"
  - symbol: "I_k''"
    source_key: "ikss_ka"
result:
  symbol: "i_p"
  unit: "kA"
  source_key: "ip_ka"
```

#### Krok 7: Moc zwarciowa

```yaml
step_id: SC3F_STEP_007
title_pl: "Moc zwarciowa początkowa"
equation_id: EQ_SC3F_007
input_values:
  - symbol: "U_n"
    source_key: "u_n_kv"
  - symbol: "I_k''"
    source_key: "ikss_ka"
result:
  symbol: "S_k''"
  unit: "MVA"
  source_key: "sk_mva"
```

---

## 5. Kroki dowodu VDROP (BINDING)

### 5.1 Lista kroków

| Nr | Krok | Równanie | Wynik |
|----|------|----------|-------|
| 1 | Rezystancja odcinka | `EQ_VDROP_001` | $R$ |
| 2 | Reaktancja odcinka | `EQ_VDROP_002` | $X$ |
| 3 | Składowa czynna spadku | `EQ_VDROP_003` | $\Delta U_R$ |
| 4 | Składowa bierna spadku | `EQ_VDROP_004` | $\Delta U_X$ |
| 5 | Spadek napięcia na odcinku | `EQ_VDROP_005` | $\Delta U$ |
| 6 | Suma spadków (od źródła) | `EQ_VDROP_006` | $\Delta U_{total}$ |

### 5.2 Szczegóły kroków

#### Krok 1: Rezystancja odcinka

```yaml
step_id: VDROP_STEP_001
title_pl: "Rezystancja odcinka linii/kabla"
equation_id: EQ_VDROP_001
input_values:
  - symbol: "r"
    source_key: "r_ohm_per_km"
  - symbol: "l"
    source_key: "length_km"
result:
  symbol: "R"
  unit: "Ω"
  source_key: "r_ohm"
```

#### Krok 2: Reaktancja odcinka

```yaml
step_id: VDROP_STEP_002
title_pl: "Reaktancja odcinka linii/kabla"
equation_id: EQ_VDROP_002
input_values:
  - symbol: "x"
    source_key: "x_ohm_per_km"
  - symbol: "l"
    source_key: "length_km"
result:
  symbol: "X"
  unit: "Ω"
  source_key: "x_ohm"
```

#### Krok 3: Składowa czynna spadku

```yaml
step_id: VDROP_STEP_003
title_pl: "Składowa czynna spadku napięcia (R·P)"
equation_id: EQ_VDROP_003
input_values:
  - symbol: "R"
    source_key: "r_ohm"
  - symbol: "P"
    source_key: "p_mw"
  - symbol: "U_n"
    source_key: "u_n_kv"
result:
  symbol: "ΔU_R"
  unit: "%"
```

#### Krok 4: Składowa bierna spadku

```yaml
step_id: VDROP_STEP_004
title_pl: "Składowa bierna spadku napięcia (X·Q)"
equation_id: EQ_VDROP_004
input_values:
  - symbol: "X"
    source_key: "x_ohm"
  - symbol: "Q"
    source_key: "q_mvar"
  - symbol: "U_n"
    source_key: "u_n_kv"
result:
  symbol: "ΔU_X"
  unit: "%"
```

#### Krok 5: Spadek napięcia na odcinku

```yaml
step_id: VDROP_STEP_005
title_pl: "Całkowity spadek napięcia na odcinku"
equation_id: EQ_VDROP_005
input_values:
  - symbol: "ΔU_R"
    source_key: "delta_u_r_percent"
  - symbol: "ΔU_X"
    source_key: "delta_u_x_percent"
result:
  symbol: "ΔU"
  unit: "%"
  source_key: "delta_u_percent"
```

#### Krok 6: Suma spadków od źródła

```yaml
step_id: VDROP_STEP_006
title_pl: "Sumaryczny spadek napięcia od źródła do punktu"
equation_id: EQ_VDROP_006
input_values:
  - symbol: "ΔU_i"
    source_key: "delta_u_segments"  # lista spadków na odcinkach
result:
  symbol: "ΔU_total"
  unit: "%"
  source_key: "delta_u_total_percent"
```

---

## 6. Format wyjściowy

### 6.1 JSON (proof.json)

```json
{
  "document_id": "uuid",
  "artifact_id": "uuid",
  "proof_type": "SC3F_IEC60909",
  "title_pl": "Dowód obliczeń zwarciowych IEC 60909",
  "header": {
    "project_name": "Projekt SN-01",
    "case_name": "Zwarcie na szynie B2",
    "fault_location": "B2",
    "voltage_factor": 1.1
  },
  "steps": [
    {
      "step_id": "SC3F_STEP_004",
      "step_number": 4,
      "title_pl": "Początkowy prąd zwarciowy symetryczny",
      "equation": {
        "equation_id": "EQ_SC3F_004",
        "latex": "I_k'' = \\frac{c \\cdot U_n}{\\sqrt{3} \\cdot |Z_{th}|}"
      },
      "input_values": [
        {"symbol": "c", "value": 1.1, "unit": "—", "source_key": "c_factor"},
        {"symbol": "U_n", "value": 15.0, "unit": "kV", "source_key": "u_n_kv"},
        {"symbol": "Z_th", "value": "0.5+j2.0", "unit": "Ω", "source_key": "z_thevenin_ohm"}
      ],
      "substitution_latex": "I_k'' = \\frac{1.1 \\cdot 15.0}{\\sqrt{3} \\cdot 2.06}",
      "result": {
        "symbol": "I_k''",
        "value": 4.62,
        "unit": "kA",
        "source_key": "ikss_ka"
      },
      "unit_check": {
        "passed": true,
        "expected_unit": "kA",
        "computed_unit": "kA",
        "derivation": "kV / Ω = kA"
      }
    }
  ],
  "summary": {
    "key_results": {
      "ikss_ka": {"symbol": "I_k''", "value": 4.62, "unit": "kA"},
      "ip_ka": {"symbol": "i_p", "value": 11.76, "unit": "kA"},
      "sk_mva": {"symbol": "S_k''", "value": 120.0, "unit": "MVA"}
    },
    "unit_check_passed": true,
    "total_steps": 7
  }
}
```

### 6.2 LaTeX (proof.tex)

```latex
\documentclass{article}
\usepackage{amsmath}
\usepackage[polish]{babel}
\usepackage[utf8]{inputenc}

\title{Dowód obliczeń zwarciowych IEC 60909}
\author{MV-DESIGN-PRO}
\date{\today}

\begin{document}
\maketitle

\section{Dane wejściowe}
\begin{itemize}
  \item Miejsce zwarcia: B2
  \item Współczynnik napięciowy: $c = 1.1$
  \item Napięcie znamionowe: $U_n = 15.0\,\text{kV}$
\end{itemize}

\section{Krok 4: Początkowy prąd zwarciowy symetryczny}

\textbf{Wzór:}
\begin{equation}
I_k'' = \frac{c \cdot U_n}{\sqrt{3} \cdot |Z_{th}|}
\end{equation}

\textbf{Dane:}
\begin{itemize}
  \item $c = 1.1$
  \item $U_n = 15.0\,\text{kV}$
  \item $Z_{th} = 0.5 + j2.0\,\Omega$, $|Z_{th}| = 2.06\,\Omega$
\end{itemize}

\textbf{Podstawienie:}
\begin{equation}
I_k'' = \frac{1.1 \cdot 15.0}{\sqrt{3} \cdot 2.06} = 4.62\,\text{kA}
\end{equation}

\textbf{Weryfikacja jednostek:}
$\frac{\text{kV}}{\Omega} = \text{kA}$ \checkmark

\section{Podsumowanie wyników}
\begin{tabular}{lll}
\hline
Wielkość & Wartość & Jednostka \\
\hline
$I_k''$ & 4.62 & kA \\
$i_p$ & 11.76 & kA \\
$S_k''$ & 120.0 & MVA \\
\hline
\end{tabular}

\end{document}
```

---

## 7. Determinism — testy (BINDING)

### 7.1 Test identyczności proof.json

```python
def test_proof_json_determinism():
    """
    Ten sam TraceArtifact → identyczny proof.json.
    """
    artifact = create_test_artifact()

    proof_1 = ProofEngine.generate(artifact)
    proof_2 = ProofEngine.generate(artifact)

    assert proof_1.json_representation == proof_2.json_representation
```

### 7.2 Test identyczności proof.tex

```python
def test_proof_tex_determinism():
    """
    Ten sam TraceArtifact → identyczny proof.tex.
    """
    artifact = create_test_artifact()

    proof_1 = ProofEngine.generate(artifact)
    proof_2 = ProofEngine.generate(artifact)

    assert proof_1.latex_representation == proof_2.latex_representation
```

### 7.3 Test stabilności kolejności kroków

```python
def test_proof_step_order_stable():
    """
    Kolejność kroków jest zawsze taka sama.
    """
    artifact = create_test_artifact()
    proof = ProofEngine.generate(artifact)

    step_ids = [s.step_id for s in proof.steps]
    expected = [
        "SC3F_STEP_001", "SC3F_STEP_002", "SC3F_STEP_003",
        "SC3F_STEP_004", "SC3F_STEP_005", "SC3F_STEP_006",
        "SC3F_STEP_007"
    ]

    assert step_ids == expected
```

---

## 8. Definition of Done (DoD)

### 8.1 P11.1a MVP — DoD

| Kryterium | Status |
|-----------|--------|
| ProofDocument zdefiniowany z wszystkimi polami | SPEC |
| ProofStep z formatem Wzór→Dane→Podstawienie→Wynik→Jednostki | SPEC |
| SC3F: 7-8 kroków dowodu z mapping keys | SPEC |
| VDROP: 6 kroków dowodu z mapping keys | SPEC |
| Format JSON (proof.json) udokumentowany | SPEC |
| Format LaTeX (proof.tex) udokumentowany | SPEC |
| Testy determinism zdefiniowane | SPEC |

---

## 9. Wzorcowy dowód SC3F — standard habilitacyjny (BINDING EXAMPLE)

Poniższy dowód stanowi **kanoniczny przykład referencyjny**. Agent MUSI generować dowody w identycznym formacie.

### 9.0 Założenia normatywne

$$
\boxed{
\begin{aligned}
&\textbf{ZAŁOŻENIA NORMATYWNE IEC 60909-0:2016} \\[6pt]
&\text{Metoda: źródło napięciowe zastępcze (equivalent voltage source)} \\
&\text{Typ zwarcia: trójfazowe symetryczne (SC3F)} \\
&\text{Rezystancja zwarcia: } R_f = 0\,\Omega \text{ (zwarcie metaliczne)} \\
&\text{Częstotliwość: } f = 50\,\text{Hz} \\
&\text{Obciążenia: pominięte w chwili zwarcia} \\
&\text{Pojemności linii i kabli: pominięte w składowej zgodnej i przeciwnej (pkt 5.2 f))} \\
&\text{Transformatory: stan jałowy przed zwarciem} \\
&\text{Współczynnik napięciowy: } c = c_{\max}
\end{aligned}
}
$$

### 9.1 Dane wejściowe

$$
\boxed{
\begin{aligned}
&\textbf{SIEĆ ZASILAJĄCA:} \\
&\quad U_n = 15{,}0\,\text{kV} \quad &&\text{napięcie znamionowe} \\
&\quad S_{kQ}'' = 250\,\text{MVA} \quad &&\text{moc zwarciowa źródła} \\
&\quad (R/X)_Q = 0{,}1 \quad &&\text{stosunek R/X} \\[6pt]
&\textbf{TRANSFORMATOR:} \\
&\quad S_{rT} = 10\,\text{MVA} \quad &&\text{moc znamionowa} \\
&\quad u_{kr} = 10\,\% \quad &&\text{napięcie zwarcia} \\
&\quad P_{krT} = 60\,\text{kW} \quad &&\text{straty zwarciowe} \\[6pt]
&\textbf{LINIA KABLOWA:} \\
&\quad r_L = 0{,}206\,\Omega/\text{km} \quad &&\text{rezystancja jednostkowa} \\
&\quad x_L = 0{,}075\,\Omega/\text{km} \quad &&\text{reaktancja jednostkowa} \\
&\quad l = 2{,}5\,\text{km} \quad &&\text{długość} \\[6pt]
&\textbf{WSPÓŁCZYNNIK NAPIĘCIOWY (Tab. 1, IEC 60909):} \\
&\quad c = c_{\max} = 1{,}10 \quad &&\text{dla sieci SN (}6\text{ kV} < U_n \leq 35\text{ kV)}
\end{aligned}
}
$$

### 9.2 Krok 1: Impedancja sieci zasilającej

**Wzór:**
$$
Z_Q = \frac{c \cdot U_n^2}{S_{kQ}''}
$$

**Podstawienie:**
$$
Z_Q = \frac{1{,}10 \cdot (15{,}0\,\text{kV})^2}{250\,\text{MVA}} = \frac{1{,}10 \cdot 225\,\text{kV}^2}{250\,\text{MVA}} = \frac{247{,}5\,\text{kV}^2}{250\,\text{MVA}} = 0{,}990\,\Omega
$$

**Weryfikacja jednostek:**
$$
\frac{[\text{kV}]^2}{[\text{MVA}]} = \frac{10^6\,\text{V}^2}{10^6\,\text{VA}} = \frac{[\text{V}]^2}{[\text{V}] \cdot [\text{A}]} = \frac{[\text{V}]}{[\text{A}]} = [\Omega] \quad \checkmark
$$

**Rozkład na składowe:**
$$
\begin{aligned}
&(R/X)_Q = 0{,}1 \Rightarrow R_Q = 0{,}1 \cdot X_Q \\
&|Z_Q| = \sqrt{R_Q^2 + X_Q^2} = \sqrt{1{,}01} \cdot X_Q \\
&X_Q = \frac{0{,}990}{1{,}005}\,\Omega = 0{,}985\,\Omega \\
&R_Q = 0{,}1 \cdot 0{,}985\,\Omega = 0{,}099\,\Omega \\[4pt]
&\boxed{Z_Q = 0{,}099 + j\,0{,}985\,\Omega}
\end{aligned}
$$

### 9.3 Krok 2: Impedancja transformatora

**Wzór:**
$$
|Z_T| = \frac{u_{kr}}{100\%} \cdot \frac{U_n^2}{S_{rT}}
$$

**Podstawienie:**
$$
|Z_T| = \frac{10\%}{100\%} \cdot \frac{(15{,}0\,\text{kV})^2}{10\,\text{MVA}} = 0{,}10 \cdot 22{,}5\,\Omega = 2{,}25\,\Omega
$$

**Składowa rezystancyjna:**
$$
R_T = \frac{P_{krT} \cdot U_n^2}{S_{rT}^2} = \frac{60\,\text{kW} \cdot (15{,}0)^2\,\text{kV}^2}{(10\,\text{MVA})^2} = \frac{13{,}5 \cdot 10^{12}}{100 \cdot 10^{12}}\,\Omega = 0{,}135\,\Omega
$$

**Składowa reaktancyjna:**
$$
X_T = \sqrt{|Z_T|^2 - R_T^2} = \sqrt{5{,}0625 - 0{,}0182}\,\Omega = 2{,}246\,\Omega
$$

$$
\boxed{Z_T = 0{,}135 + j\,2{,}246\,\Omega}
$$

### 9.4 Krok 3: Impedancja linii kablowej

**Wzór:**
$$
Z_L = (r_L + j\,x_L) \cdot l
$$

**Podstawienie:**
$$
\begin{aligned}
R_L &= 0{,}206\,\frac{\Omega}{\text{km}} \cdot 2{,}5\,\text{km} = 0{,}515\,\Omega \\
X_L &= 0{,}075\,\frac{\Omega}{\text{km}} \cdot 2{,}5\,\text{km} = 0{,}188\,\Omega
\end{aligned}
$$

$$
\boxed{Z_L = 0{,}515 + j\,0{,}188\,\Omega}
$$

### 9.5 Krok 4: Impedancja zastępcza Thévenina

**Wzór:**
$$
Z_{th} = Z_Q + Z_T + Z_L
$$

**Podstawienie:**
$$
\begin{aligned}
R_{th} &= 0{,}099 + 0{,}135 + 0{,}515 = 0{,}749\,\Omega \\
X_{th} &= 0{,}985 + 2{,}246 + 0{,}188 = 3{,}419\,\Omega
\end{aligned}
$$

$$
\boxed{Z_{th} = 0{,}749 + j\,3{,}419\,\Omega}
$$

**Moduł:**
$$
|Z_{th}| = \sqrt{(0{,}749)^2 + (3{,}419)^2}\,\Omega = \sqrt{12{,}251}\,\Omega = 3{,}500\,\Omega
$$

### 9.6 Krok 5: Początkowy prąd zwarciowy symetryczny

**Wzór:**
$$
I_k'' = \frac{c \cdot U_n}{\sqrt{3} \cdot |Z_{th}|}
$$

**Podstawienie:**
$$
I_k'' = \frac{1{,}10 \cdot 15{,}0\,\text{kV}}{\sqrt{3} \cdot 3{,}500\,\Omega} = \frac{16{,}50\,\text{kV}}{6{,}062\,\Omega} = 2{,}722\,\text{kA}
$$

**Weryfikacja jednostek:**
$$
\frac{[\text{kV}]}{[\Omega]} = \frac{10^3\,[\text{V}]}{[\text{V}]/[\text{A}]} = 10^3\,[\text{A}] = [\text{kA}] \quad \checkmark
$$

$$
\boxed{I_k'' = 2{,}722\,\text{kA}}
$$

### 9.7 Krok 6: Współczynnik udarowy

**Wzór:**
$$
\kappa = 1{,}02 + 0{,}98 \cdot e^{-3 \cdot R_{th}/X_{th}}
$$

**Stosunek R/X:**
$$
\frac{R_{th}}{X_{th}} = \frac{0{,}749}{3{,}419} = 0{,}219
$$

**Podstawienie:**
$$
\kappa = 1{,}02 + 0{,}98 \cdot e^{-3 \cdot 0{,}219} = 1{,}02 + 0{,}98 \cdot e^{-0{,}657} = 1{,}02 + 0{,}508 = 1{,}528
$$

**Weryfikacja warunku stosowalności:**
$$
0{,}005 \leq 0{,}219 \leq 1{,}0 \quad \checkmark
$$

$$
\boxed{\kappa = 1{,}528}
$$

### 9.8 Krok 7: Prąd udarowy (szczytowy)

**Wzór:**
$$
i_p = \kappa \cdot \sqrt{2} \cdot I_k''
$$

**Podstawienie:**
$$
i_p = 1{,}528 \cdot 1{,}414 \cdot 2{,}722\,\text{kA} = 5{,}882\,\text{kA}
$$

$$
\boxed{i_p = 5{,}882\,\text{kA}}
$$

### 9.9 Krok 8: Prąd dynamiczny (OBOWIĄZKOWY)

**Wzór:**
$$
I_{dyn} = i_p
$$

**Podstawienie:**
$$
I_{dyn} = 5{,}882\,\text{kA}
$$

$$
\boxed{I_{dyn} = 5{,}882\,\text{kA}}
$$

### 9.10 Krok 9: Prąd cieplny równoważny (OBOWIĄZKOWY)

**Wzór:**
$$
I_{th} = I_k'' \cdot \sqrt{m + n}
$$

**Warunek uproszczenia:**
$$
\boxed{
\begin{aligned}
&\text{Dla sieci odległej od generatorów synchronicznych:} \\
&m = 1, \quad n = 0 \quad \Rightarrow \quad \sqrt{m + n} = 1
\end{aligned}
}
$$

**Podstawienie:**
$$
I_{th} = 2{,}722\,\text{kA} \cdot 1 = 2{,}722\,\text{kA}
$$

$$
\boxed{I_{th} = 2{,}722\,\text{kA}}
$$

### 9.11 Krok 10: Moc zwarciowa początkowa

**Wzór:**
$$
S_k'' = \sqrt{3} \cdot U_n \cdot I_k''
$$

**Podstawienie:**
$$
S_k'' = 1{,}732 \cdot 15{,}0\,\text{kV} \cdot 2{,}722\,\text{kA} = 70{,}7\,\text{MVA}
$$

**Weryfikacja jednostek:**
$$
[\text{kV}] \cdot [\text{kA}] = 10^3\,[\text{V}] \cdot 10^3\,[\text{A}] = 10^6\,[\text{VA}] = [\text{MVA}] \quad \checkmark
$$

$$
\boxed{S_k'' = 70{,}7\,\text{MVA}}
$$

### 9.12 Podsumowanie wyników

$$
\boxed{
\begin{array}{|l|c|c|c|}
\hline
\textbf{Wielkość} & \textbf{Symbol} & \textbf{Wartość} & \textbf{Jednostka} \\
\hline
\text{Impedancja zastępcza} & |Z_{th}| & 3{,}500 & \Omega \\
\text{Prąd początkowy} & I_k'' & 2{,}722 & \text{kA} \\
\text{Współczynnik udaru} & \kappa & 1{,}528 & — \\
\text{Prąd udarowy} & i_p & 5{,}882 & \text{kA} \\
\text{Prąd dynamiczny} & I_{dyn} & 5{,}882 & \text{kA} \\
\text{Prąd cieplny} & I_{th} & 2{,}722 & \text{kA} \\
\text{Moc zwarciowa} & S_k'' & 70{,}7 & \text{MVA} \\
\hline
\end{array}
}
$$

### 9.13 Wniosek inżynierski

Na podstawie przeprowadzonych obliczeń zgodnych z normą IEC 60909-0:2016 stwierdzam, co następuje.

**Wymagania dla aparatury łączeniowej:**

$$
\begin{array}{|l|l|}
\hline
\textbf{Parametr} & \textbf{Wymaganie minimalne} \\
\hline
\text{Znamionowy prąd zwarciowy łączeniowy} & I_{kn} \geq 3\,\text{kA} \\
\text{Znamionowy prąd dynamiczny} & I_{dyn,n} \geq 6\,\text{kA} \\
\text{Znamionowy prąd cieplny (1s)} & I_{th,n} \geq 3\,\text{kA} \\
\hline
\end{array}
$$

**Zalecenia:**
- Dobór wyłączników z prądem znamionowym zwarciowym co najmniej jednego poziomu wyżej niż obliczony
- Weryfikacja nastaw zabezpieczeń nadprądowych
- Sprawdzenie koordynacji czasów działania zabezpieczeń

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

### TODO-P15-001 (PLANNED) — P15: Load Currents & Overload Proof Pack [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, PowerFlowResult, Catalog
- Output: ProofPack P15 (ProofDocument: Prądy robocze i przeciążenia)
- DoD:
  - [ ] Prądy obciążenia linii/kabli wyprowadzone z mocy pozornej.

    $$
    I = \frac{S}{\sqrt{3} \cdot U}
    $$

  - [ ] Porównanie do prądu znamionowego z marginesem procentowym i statusem PASS/FAIL.
  - [ ] Transformator: relacja obciążenia do mocy znamionowej i overload %.

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

### TODO-P19-001 (PLANNED) — P19: Earthing / Ground Fault Proof Pack (SN) [FUTURE PACK]
- Priority: MUST
- Inputs: TraceArtifact, Catalog
- Output: ProofPack P19 (ProofDocument: Doziemienia / uziemienia SN)
- DoD:
  - [ ] Jeśli SN: prądy doziemne z uwzględnieniem impedancji uziemienia i rozdziału prądu.
  - [ ] Tryb uproszczonych napięć dotykowych z wyraźnymi zastrzeżeniami.
  - [ ] Terminologia w ProofDocument: 1F-Z, 2F, 2F-Z oraz BoundaryNode – węzeł przyłączenia.

**END OF P11.1a MVP**
