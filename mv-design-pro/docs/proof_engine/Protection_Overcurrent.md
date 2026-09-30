# Protection Overcurrent Proof Documentation — FIX-12D

> **SUPERSEDED (karta W3-C2, 2026-09-09)** — FIX-12D
> (`application/analyses/protection/line_overcurrent_setting/**`) was deleted;
> the methodology it implemented had no norm citation for several coefficients
> (kb/kc ranges, SPZ threshold table). The canonical I>/I>> methodology is now
> Hoppel/IRiESD exclusively (`backend/src/application/protection_settings/
> engine.py`, cited formulas). This document is kept as a historical record of
> the retired FIX-12D formulas and is NOT rewritten section-by-section in this
> pass (out of this card's explicit scope) — do not use it as a live spec.

## Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ

Dokument ten opisuje metodykę wyznaczania nastaw zabezpieczenia zwarciowego I>> (50) dla linii SN zgodnie z zasadami NOT-A-SOLVER i WHITE BOX.

---

## 1. Wprowadzenie

Zabezpieczenie zwarciowe I>> (funkcja ANSI 50) stanowi podstawową ochronę przed zwarciami w liniach SN. Prawidłowy dobór nastawy wymaga spełnienia trzech podstawowych kryteriów:

1. **Selektywność** — zabezpieczenie nie może zadziałać na zwarcia poza strefą chronioną
2. **Czułość** — zabezpieczenie musi zadziałać na minimalne zwarcie w strefie chronionej
3. **Wytrzymałość cieplna** — nastawa musi zapewnić ochronę cieplną przewodu

---

## 2. Kryterium Selektywności

### 2.1 Wzór

$$
I_{nast} \geq k_b \cdot \frac{I''_{k,max,next}}{\vartheta_i}
$$

gdzie:
- $I_{nast}$ — nastawa prądowa I>> [A] (strona wtórna)
- $k_b$ — współczynnik bezpieczeństwa selektywności (1.1 ÷ 1.3)
- $I''_{k,max,next}$ — maksymalny prąd zwarciowy w punkcie kolejnego zabezpieczenia [A]
- $\vartheta_i$ — przekładnia przekładników prądowych CT

### 2.2 Dane wejściowe

| Symbol | Opis | Jednostka | Źródło |
|--------|------|-----------|--------|
| $I''_{k,max,next}$ | Prąd zwarciowy 3-fazowy max w punkcie kolejnego PZ | A | Wyniki SC IEC 60909 |
| $k_b$ | Współczynnik selektywności | - | Konfiguracja (domyślnie 1.2) |
| $\vartheta_i$ | Przekładnia CT | - | Dane urządzenia |

### 2.3 Obliczenie

**Krok 1:** Wyznacz minimalną nastawę (strona pierwotna):
$$
I_{nast,min,prim} = k_b \cdot I''_{k,max,next}
$$

**Krok 2:** Przelicz na stronę wtórną:
$$
I_{nast,min,sec} = \frac{I_{nast,min,prim}}{\vartheta_i}
$$

### 2.4 Przykład obliczeniowy

**Dane:**
- $I''_{k,max,next} = 4500$ A
- $k_b = 1.2$
- $\vartheta_i = 80$ (400/5)

**Podstawienie:**
$$
I_{nast,min,prim} = 1.2 \cdot 4500 = 5400 \text{ A}
$$

$$
I_{nast,min,sec} = \frac{5400}{80} = 67.5 \text{ A}
$$

**Wynik:** Minimalna nastawa I>> = 67.5 A (wtórna) = 5.4 kA (pierwotna)

**Werdykt:** ZGODNE

---

## 3. Kryterium Czułości

### 3.1 Wzór

$$
\frac{I''_{k,min,busbars}}{\vartheta_i} \geq k_c \cdot I_{nast}
$$

przekształcając:

$$
I_{nast} \leq \frac{I''_{k,min,busbars}}{k_c \cdot \vartheta_i}
$$

gdzie:
- $I''_{k,min,busbars}$ — minimalny prąd zwarciowy na szynach zasilających [A]
- $k_c$ — współczynnik czułości (1.2 ÷ 1.5)

### 3.2 Dane wejściowe

| Symbol | Opis | Jednostka | Źródło |
|--------|------|-----------|--------|
| $I''_{k,min,busbars}$ | Prąd zwarciowy min (2-fazowy lub 3-fazowy) na szynach | A | Wyniki SC IEC 60909 |
| $k_c$ | Współczynnik czułości | - | Konfiguracja (domyślnie 1.5) |
| $\vartheta_i$ | Przekładnia CT | - | Dane urządzenia |

### 3.3 Obliczenie

**Krok 1:** Wyznacz maksymalną nastawę (strona pierwotna):
$$
I_{nast,max,prim} = \frac{I''_{k,min,busbars}}{k_c}
$$

**Krok 2:** Przelicz na stronę wtórną:
$$
I_{nast,max,sec} = \frac{I_{nast,max,prim}}{\vartheta_i}
$$

### 3.4 Przykład obliczeniowy

**Dane:**
- $I''_{k,min,busbars} = 12000$ A
- $k_c = 1.5$
- $\vartheta_i = 80$

**Podstawienie:**
$$
I_{nast,max,prim} = \frac{12000}{1.5} = 8000 \text{ A}
$$

$$
I_{nast,max,sec} = \frac{8000}{80} = 100 \text{ A}
$$

**Wynik:** Maksymalna nastawa I>> = 100 A (wtórna) = 8.0 kA (pierwotna)

**Werdykt:** ZGODNE

---

## 4. Kryterium Wytrzymałości Cieplnej

### 4.1 Wzór

$$
I_{nast} \leq k_{bth} \cdot \frac{I_{th,dop}}{\vartheta_i}
$$

gdzie:
$$
I_{th,dop} = \frac{I_{thn}}{\sqrt{t_k}}
$$

lub dla kabli:
$$
I_{th,dop} = \frac{s \cdot j_{thn}}{\sqrt{t_k}}
$$

gdzie:
- $I_{thn}$ — znamionowy prąd cieplny dla 1s [A]
- $j_{thn}$ — znamionowa gęstość prądu cieplnego [A/mm²]
- $s$ — przekrój przewodu [mm²]
- $t_k$ — całkowity czas zwarcia z uwzględnieniem cykli SPZ [s]
- $k_{bth}$ — współczynnik bezpieczeństwa cieplnego (0.8 ÷ 1.0)

### 4.2 Wyznaczenie czasu zwarcia $t_k$

Czas zwarcia zależy od trybu SPZ:

| Tryb SPZ | Wzór na $t_k$ |
|----------|---------------|
| Wyłączone | $t_k = t_{fault} + t_{breaker}$ |
| Jednokrotne (1x) | $t_k = 2 \cdot (t_{fault} + t_{breaker})$ |
| Dwukrotne (2x) | $t_k = 3 \cdot (t_{fault} + t_{breaker})$ |

### 4.3 Dane wejściowe

| Symbol | Opis | Jednostka | Źródło |
|--------|------|-----------|--------|
| $I_{thn}$ | Znamionowy prąd cieplny 1s | A | Katalog przewodu |
| $j_{thn}$ | Gęstość prądu cieplnego | A/mm² | IEC 60364 / PN-HD |
| $s$ | Przekrój przewodu | mm² | Dane linii |
| $t_{fault}$ | Maksymalny czas zwarcia | s | Konfiguracja |
| $t_{breaker}$ | Czas własny wyłącznika | s | Dane urządzenia |
| $k_{bth}$ | Współczynnik cieplny | - | Konfiguracja (domyślnie 0.9) |

### 4.4 Typowe wartości $j_{thn}$

| Materiał | $j_{thn}$ [A/mm²] |
|----------|-------------------|
| Miedź (Cu) | 143 |
| Aluminium (Al) | 94 |
| AFL (ACSR) | 88 |

### 4.5 Przykład obliczeniowy

**Dane:**
- Kabel XLPE Al 150 mm², $j_{thn} = 94$ A/mm²
- SPZ jednokrotne, $t_{fault} = 0.5$ s, $t_{breaker} = 0.05$ s
- $k_{bth} = 0.9$
- $\vartheta_i = 80$

**Obliczenie $I_{thn}$:**
$$
I_{thn} = s \cdot j_{thn} = 150 \cdot 94 = 14100 \text{ A}
$$

**Obliczenie $t_k$ (SPZ 1x):**
$$
t_k = 2 \cdot (0.5 + 0.05) = 1.1 \text{ s}
$$

**Obliczenie $I_{th,dop}$:**
$$
I_{th,dop} = \frac{14100}{\sqrt{1.1}} = \frac{14100}{1.049} = 13442 \text{ A}
$$

**Obliczenie maksymalnej nastawy:**
$$
I_{nast,max,prim} = k_{bth} \cdot I_{th,dop} = 0.9 \cdot 13442 = 12098 \text{ A}
$$

$$
I_{nast,max,sec} = \frac{12098}{80} = 151.2 \text{ A}
$$

**Wynik:** Maksymalna nastawa I>> z kryterium cieplnego = 151.2 A (wtórna) = 12.1 kA (pierwotna)

**Werdykt:** ZGODNE

---

## 5. Wyznaczenie Okna Nastaw

### 5.1 Okno nastaw

$$
I_{nast,min} \leq I_{nast} \leq I_{nast,max}
$$

gdzie:
- $I_{nast,min}$ — z kryterium selektywności
- $I_{nast,max}$ — mniejsza z wartości: czułość, cieplne

### 5.2 Walidacja okna

**Okno poprawne:**
$$
I_{nast,max} > I_{nast,min}
$$

**Okno sprzeczne:**
$$
I_{nast,max} \leq I_{nast,min}
$$

Jeśli okno jest sprzeczne, należy:
1. Obniżyć współczynnik $k_b$ (jeśli to możliwe)
2. Zmienić przekładnię CT
3. Przenieść punkt kolejnego zabezpieczenia
4. Zwiększyć przekrój przewodu
5. Wyłączyć SPZ lub skrócić czasy

### 5.3 Przykład zbiorczy

**Z poprzednich obliczeń:**
- $I_{nast,min,sec} = 67.5$ A (selektywność)
- $I_{nast,max,sec,sensitivity} = 100$ A (czułość)
- $I_{nast,max,sec,thermal} = 151.2$ A (cieplne)

**Okno nastaw:**
$$
I_{nast,max} = \min(100, 151.2) = 100 \text{ A}
$$

$$
67.5 \text{ A} \leq I_{nast} \leq 100 \text{ A}
$$

**Szerokość okna:** $100 - 67.5 = 32.5$ A

**Zalecana nastawa (środek okna):**
$$
I_{nast,zal} = \frac{67.5 + 100}{2} = 83.75 \text{ A}
$$

**Werdykt:** ZGODNE — okno nastaw jest prawidłowe

---

## 6. Blokada SPZ od I>>

### 6.1 Zasada

SPZ powinno być zablokowane od I>> gdy:
- Prąd zwarciowy na początku linii przekracza próg cieplny
- Powtórne cykle zwarciowe mogą przekroczyć wytrzymałość cieplną

### 6.2 Tabela progowa

| Czas zwarcia | Próg prądu | Decyzja |
|--------------|------------|---------|
| < 0.3 s | > 8 kA | Blokada SPZ |
| 0.3 - 0.5 s | > 6 kA | Blokada SPZ |
| 0.5 - 1.0 s | > 4 kA | Blokada SPZ |
| > 1.0 s | > 3 kA | Blokada SPZ |

### 6.3 Przykład

**Dane:**
- $I''_{k,max,busbars} = 7500$ A = 7.5 kA
- $t_{fault} + t_{breaker} = 0.55$ s

**Decyzja:** Prąd 7.5 kA > 6 kA przy czasie 0.55 s → **Blokada SPZ**

**Werdykt:** NIEZGODNE — SPZ powinno być zablokowane

---

## 7. Tryb Sieci z Generacją Lokalną (E-L)

### 7.1 Wkłady prądowe

W sieci z generacją lokalną prąd zwarciowy składa się z:
$$
I''_k = I''_{k,system} + I''_{k,E-L}
$$

### 7.2 Diagnostyka ZSZ

Ryzyko niepożądanej blokady zabezpieczenia szyn (ZSZ) występuje gdy:
$$
\frac{I''_{k,E-L}}{I''_k} > 0.3
$$

### 7.3 Zalecenia dla źródeł E-L

| Typ źródła | Wkład do zwarcia | Zalecenie |
|------------|------------------|-----------|
| Generator synchroniczny | Znaczący (do 6x In) | Uwzględnij w czułości |
| Generator asynchroniczny | Umiarkowany (do 3x In) | Sprawdź czułość |
| Falownik (PV/BESS) | Ograniczony (1.1-1.5x In) | Typowo pomijalne |

### 7.4 Rekomendacje

Jeśli wykryto ryzyko blokady ZSZ:
1. Rozważ blokadę kierunkową dla ZSZ
2. Skoryguj nastawy ZSZ pod kątem wkładu E-L
3. Zastosuj zabezpieczenie różnicowe szynowe

---

## 8. White-Box Trace

Każdy krok obliczeniowy jest rejestrowany w formacie:

```json
{
  "step": "selectivity_criterion",
  "description_pl": "Kryterium selektywności I>>",
  "formula": "I_nast >= kb × Ik_max(next) / θi",
  "inputs": {
    "kb": 1.2,
    "ik_max_next_protection_a": 4500,
    "ct_ratio": 80
  },
  "calculation": {
    "i_min_primary_a": 5400,
    "i_min_secondary_a": 67.5
  },
  "outputs": {
    "i_nast_min_primary_a": 5400,
    "i_nast_min_secondary_a": 67.5,
    "verdict": "PASS"
  }
}
```

---

## 9. Determinizm

Moduł gwarantuje:
- **Identyczne wyniki** dla identycznych danych wejściowych
- **Brak zależności czasowych** — timestamp wyłączony z obliczeń
- **Pełna serializowalność** — JSON-serializable trace

---

## 10. NOT-A-SOLVER Compliance

Ten moduł **NIE WYKONUJE** obliczeń fizycznych IEC 60909:
- Prądy zwarciowe ($I''_k$) są pobierane z wyników solvera SC
- Impedancje nie są obliczane
- Parametry sieci nie są modyfikowane

Moduł **TYLKO INTERPRETUJE** istniejące wyniki do celów doboru nastaw.
