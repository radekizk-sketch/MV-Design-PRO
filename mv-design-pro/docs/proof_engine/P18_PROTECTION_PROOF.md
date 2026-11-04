# P18 — Protection Proof Pack (Overcurrent / Selectivity)

**STATUS: SKASOWANY** (karta AB-1a Pakiet L, 2026-09-23 — `generate_protection_proof` bez
wołających w `backend/src`; wskrzeszenie pilnuje `scripts/legacy_public_path_guard.py`). Dokument
zostaje jako zapis historyczny.

---

## Definicja

Pakiet dowodowy P18 opisuje post-hoc weryfikację doboru i koordynacji zabezpieczeń nadprądowych.
Dowód nie wykonuje symulacji, nie modyfikuje solverów i opiera się wyłącznie na danych wejściowych.

---

## Kroki dowodu

1. Warunek wyłączalności.
2. Warunek dynamiczny.
3. Warunek cieplny.
4. Selektywność (porównania graniczne charakterystyk).

---

## Równania (FULL MATH)

**1) Warunek wyłączalności**

$$
I_k'' \le I_{cu}
$$

**2) Warunek dynamiczny**

$$
i_p \le I_{dyn}
$$

**3) Warunek cieplny**

$$
\int i^{2} dt \le I_{th}
$$

**4) Selektywność (analityczna)**

$$
t_{down,max} + \Delta t \le t_{up,min}
$$

---

## Jednostki

- $$kA$$
- $$kA^{2}s$$
- $$s$$

---

## Mapping keys

**Wyniki wejściowe i katalogowe**
- `ikss_ka`
- `ip_ka`
- `i2t_ka2s`
- `icu_ka`
- `idyn_ka`
- `ith_limit_ka2s`
- `selectivity_downstream_max_s`
- `selectivity_upstream_min_s`
- `selectivity_margin_setting_s`

**Wyniki główne (ProofSummary.key_results)**
- `breaking_ok`
- `dynamic_ok`
- `thermal_ok`
- `selectivity_ok`
- `breaking_margin_ka`
- `dynamic_margin_ka`
- `thermal_margin_ka2s`
- `selectivity_margin_s`

---

## Determinizm

- Stała kolejność kroków w rejestrze równań.
- Brak losowości w danych wejściowych i porównaniach.
- Identyczne wejście generuje identyczny dokument dowodowy (po pominięciu metadanych generowanych w czasie).

---

## Uwagi

- Brak danych wejściowych skutkuje statusem `NOT_EVALUATED` oraz ostrzeżeniem w podsumowaniu.
- Selektywność jest oceniana wyłącznie analitycznie na podstawie parametrów granicznych.
