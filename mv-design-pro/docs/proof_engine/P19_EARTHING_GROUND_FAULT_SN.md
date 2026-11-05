# P19 — Doziemienia / uziemienia SN (Earthing / Ground Fault)

**STATUS: SKASOWANY** (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, commit 5, 2026-10-30) — pakiet bez
producenta w `backend/src`, z fizyką w silniku dowodów (I_E = U_0/Z_E, U_d = I_u·R_u
„uproszczone”), dublujący dowód bezpieczeństwa uziomu V12.6 (EN 50522 tab. 1, IEEE 80).
Dokument zostaje jako zapis historyczny; prąd zwarcia doziemnego stacji i napięcia rażeniowe
niesie bieg `earthing_safety` (krok śladu `en50522_prad_uziomowy`).
**Version:** 1.0
**Reference:** P11_OVERVIEW.md, PROOF_SCHEMAS.md

---

## 1. Definicja

P19 definiuje formalny, deterministyczny dowód matematyczny prądów doziemnych
w sieciach SN oraz opcjonalny, uproszczony krok napięcia dotykowego. Dowód jest
post-hoc i korzysta wyłącznie z danych wejściowych (trace/result/katalog).

Terminologia BINDING:
- BoundaryNode – węzeł przyłączenia

---

## 2. Zakres i ograniczenia (UPROSZCZENIA)

Zakres obejmuje:
- prąd doziemny z napięcia zerowego i impedancji uziemienia,
- rozdział prądu doziemnego na uziom i pozostałe ścieżki,
- opcjonalne, uproszczone napięcie dotykowe.

Zakres nie obejmuje:
- modyfikacji solverów lub Result API IEC 60909,
- klasyfikacji normowej,
- symulacji EMT.

Krok napięcia dotykowego jest **UPROSZCZONY** i ma wyłącznie charakter
informacyjny.

---

## 3. Kroki dowodu (BINDING)

Kolejność kroków jest stała i deterministyczna:

$$
\begin{array}{|c|l|l|l|}
\hline
\textbf{Nr} & \textbf{Krok} & \textbf{Równanie} & \textbf{Wynik} \\
\hline
1 & \text{Prąd doziemny} & \text{EQ\_EARTH\_001} & I_{E} \\
2 & \text{Rozdział prądu doziemnego} & \text{EQ\_EARTH\_002} & I_{E} \\
3 & \text{Napięcie dotykowe (UPROSZCZONE)} & \text{EQ\_EARTH\_003} & U_{d} \\
\hline
\end{array}
$$

---

## 4. Równania (FULL MATH)

Prąd doziemny:

$$
I_{E} = \frac{U_{0}}{Z_{E}}
$$

Rozdział prądu doziemnego:

$$
I_{E} = I_{u} + I_{p}
$$

Napięcie dotykowe — tryb uproszczony:

$$
U_{d} = I_{u} \cdot R_{u}
$$

---

## 5. Jednostki (BINDING)

$$
\begin{aligned}
&U_{0} \; \text{V}, \quad Z_{E} \; \Omega, \quad I_{E} \; \text{A} \\
&I_{u} \; \text{A}, \quad I_{p} \; \text{A} \\
&R_{u} \; \Omega, \quad U_{d} \; \text{V}
\end{aligned}
$$

---

## 6. Mapping keys (BINDING)

Lista kluczy mapowania używanych w P19:

```
u0_v
z_e_ohm
i_earth_a
i_u_a
i_p_a
r_u_ohm
u_touch_v
earthing_mode
computed_status
```

---

## 7. Determinizm

Ten sam zestaw danych wejściowych musi generować identyczny rezultat w formatach
`proof.json` oraz `proof.tex`.
