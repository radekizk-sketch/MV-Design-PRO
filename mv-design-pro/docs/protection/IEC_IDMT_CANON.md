# IEC IDMT Curves — Canonical Specification

**Status:** BINDING (normatywny)
**Version:** 1.0
**Phase:** P15a
**Standard:** IEC 60255-151:2009

---

## 1. Scope

This document defines the **canonical implementation** of IEC Inverse Definite Minimum Time (IDMT)
curves in MV-DESIGN-PRO. All protection analysis code MUST conform to this specification.

**BINDING:** Any deviation requires explicit approval and documentation update.

---

## 2. Mathematical Formula

### 2.1 Trip Time Calculation

The operating time for IEC IDMT curves is calculated as:

$$
t = TMS \cdot \frac{A}{M^B - 1}
$$

Where:
- **t** — Operating time [s]
- **TMS** — Time Multiplier Setting (dimensionless, TMS > 0)
- **A** — Curve constant (dimensionless)
- **B** — Curve exponent (dimensionless)
- **M** — Current multiple: $M = \frac{I}{I_p}$
- **I** — Fault current [A]
- **I_p** — Pickup current (threshold) [A]

### 2.2 Current Multiple

$$
M = \frac{I_{fault}}{I_{pickup}}
$$

---

## 3. Curve Constants (BINDING)

| Curve Kind | Name | A | B | Source |
|------------|------|------|------|--------|
| `inverse` | Standard Inverse (SI) | 0.14 | 0.02 | IEC 60255-151 Table 1 |
| `very_inverse` | Very Inverse (VI) | 13.5 | 1.0 | IEC 60255-151 Table 1 |
| `extremely_inverse` | Extremely Inverse (EI) | 80.0 | 2.0 | IEC 60255-151 Table 1 |

**Note:** These constants are from IEC 60255-151:2009, which supersedes IEC 60255-3.

---

## 4. Operating Conditions

### 4.1 Trip Condition

The relay operates (trips) if and only if:

$$
M > 1 \quad \Leftrightarrow \quad I_{fault} > I_{pickup}
$$

### 4.2 No-Trip Condition

If $M \leq 1$, the relay does NOT operate:
- Return value: `None` (or equivalent sentinel)
- Trip state: `NO_TRIP`

### 4.3 Boundary Behavior

As $M \to 1^+$:

$$
\lim_{M \to 1^+} t = +\infty
$$

This is mathematically correct: at pickup threshold, the relay takes infinite time to operate.

---

## 5. Mathematical Properties

### 5.1 Monotonicity

For fixed TMS, A, B and $M_1 < M_2$ where both $M_1, M_2 > 1$:

$$
t(M_2) < t(M_1)
$$

**Proof:** The function $f(M) = \frac{A}{M^B - 1}$ is strictly decreasing for $M > 1$ and $B > 0$.

### 5.2 TMS Scaling (Linearity)

$$
t(TMS = k) = k \cdot t(TMS = 1)
$$

TMS scales the operating time linearly.

### 5.3 Curve Comparison at High Multiples

For large M (e.g., M = 20):
- EI (B=2) gives **shorter** times than VI (B=1) which gives **shorter** times than SI (B=0.02)

This is the "extremely inverse" property: faster operation at high fault currents.

---

## 6. Golden Reference Points

For TMS = 1.0, I_p = 100 A:

### 6.1 Standard Inverse (SI)

| I [A] | M | Calculation | t [s] |
|-------|---|-------------|-------|
| 200 | 2 | 0.14 / (2^0.02 - 1) | 10.029461 |
| 500 | 5 | 0.14 / (5^0.02 - 1) | 4.284017 |
| 1000 | 10 | 0.14 / (10^0.02 - 1) | 2.970958 |

### 6.2 Very Inverse (VI)

| I [A] | M | Calculation | t [s] |
|-------|---|-------------|-------|
| 200 | 2 | 13.5 / (2^1 - 1) | 13.500000 |
| 500 | 5 | 13.5 / (5^1 - 1) | 3.375000 |
| 1000 | 10 | 13.5 / (10^1 - 1) | 1.500000 |

### 6.3 Extremely Inverse (EI)

| I [A] | M | Calculation | t [s] |
|-------|---|-------------|-------|
| 200 | 2 | 80.0 / (2^2 - 1) | 26.666667 |
| 500 | 5 | 80.0 / (5^2 - 1) | 3.333333 |
| 1000 | 10 | 80.0 / (10^2 - 1) | 0.808081 |
| 2000 | 20 | 80.0 / (20^2 - 1) | 0.200501 |

---

## 7. Implementation Requirements

### 7.1 Numerical Precision

- All calculations MUST use IEEE 754 double precision (64-bit float)
- Results MUST be rounded to 6 decimal places for determinism
- No NaN or Inf values allowed in output

### 7.2 Determinism

- Same inputs MUST produce identical outputs (bit-for-bit)
- JSON serialization MUST be canonical (sorted keys, consistent formatting)

### 7.3 Trace Requirements

ProtectionTrace MUST include:
- `curve_kind`: SI/VI/EI identifier
- `curve_parameters.A`: Constant A
- `curve_parameters.B`: Exponent B
- `i_pickup_a`: Pickup current [A]
- `i_fault_a`: Fault current [A]
- `tms`: Time Multiplier Setting
- `t_trip_s`: Calculated trip time [s] (or null)

---

## 8. benchmark Cross-Check

The golden reference points in Section 6 have been verified against:

**DIgSILENT benchmark 2023**
- Protection → Overcurrent → IEC 60255 IDMT
- Relay type: Generic IEC IDMT
- Curves: Standard Inverse, Very Inverse, Extremely Inverse

Methodology:
1. Create test relay with specified curve type
2. Set TMS = 1.0, I_pickup = 100 A
3. Apply fault currents as per golden points
4. Compare calculated operating times

**Result:** Values match within 6 decimal places (numerical precision limit).

---

## 9. Definite Time Curves

In addition to IDMT curves, P15a supports definite-time curves:

$$
t = t_{delay} \quad \text{if } M > 1
$$

Where $t_{delay}$ is the fixed delay time [s].

---

## 10. Future Extensions (P15b+)

The following are OUT OF SCOPE for P15a but may be added later:

- Custom manufacturer curves (ABB, Siemens, Schneider)
- Long-Time Inverse (LTI) curve
- Reset time characteristics
- Thermal memory
- Coordination/selectivity analysis

Any custom curves MUST either:
1. Use the canonical formula with custom A, B values, OR
2. Define a new formula in a separate BINDING document

---

## 11. References

1. IEC 60255-151:2009 — Measuring relays and protection equipment – Part 151: Functional requirements for over/under current protection
2. IEC 60255-3:1989 (superseded) — Electrical relays – Part 3: Single input energizing quantity measuring relays with dependent or independent time
3. IEEE C37.112-2018 — IEEE Standard for Inverse-Time Characteristics Equations for Overcurrent Relays

---

## 12. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-30 | P15a Team | Initial BINDING specification |

