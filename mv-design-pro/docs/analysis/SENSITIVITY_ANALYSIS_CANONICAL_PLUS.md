# SENSITIVITY_ANALYSIS_CANONICAL_PLUS (P25)

## 1. Cel

P25 wprowadza **deterministyczną analizę wrażliwości i marginesów** (post-hoc), odpowiadając na pytanie:

> Które parametry wejściowe wpływają na decyzję końcową i w jakim stopniu?

Analiza działa wyłącznie na istniejących artefaktach P20–P24+ oraz ProofDocument (P11–P19).
**Nie uruchamia solverów i nie przelicza fizyki.**

## 2. Zakres (P25 ONLY)

**Wejścia (read-only):**
- ProofDocument (P11–P19)
- NormativeReport (P20)
- VoltageProfileView (P21)
- ProtectionInsightView + ProtectionCurvesITView (P22/C-P22)

**Wyjście:**
- deterministyczny `SensitivityView` (JSON/Python DTO)
- ranking top N driverów
- marginesy i delty marginesów dla perturbacji ±Δ%
- jawna propagacja `NOT_COMPUTED`
- integracja z P24+ PDF (sekcja P25)

## 3. Zasady obliczeń (post-hoc, deterministyczne)

1. **Brak nowych obliczeń fizycznych.**
2. **Decyzja opiera się wyłącznie na logice progów/marginesów** z istniejących wyników.
3. **Deterministyczne sortowanie** wpisów i rankingów.
4. **Stabilne haszowanie**: identyczne wejścia ⇒ identyczne `analysis_id`.

## 4. Parametry perturbacji

P25 analizuje wpływ następujących parametrów (±Δ%):

| Parametr | Źródło | Logika post-hoc |
|---|---|---|
| Load **P** (proxy k_S) | P20 (NR_P15_002) | korekta obserwacji i margines do limitu |
| Load **Q** (proxy k_I) | P20 (NR_P15_001) | korekta obserwacji i margines do limitu |
| Short-circuit level | P22a | korekta wartości I_k''/i_p/I_th vs limity |
| Protection settings margins | P22a | korekta limitów I_cu/I_dyn/I_th |
| Voltage limits | P21 | korekta progów warn/fail |
| Protection curve margins | C-P22 | korekta margin% z krzywych |

> **Uwaga:** Parametry Load P/Q są reprezentowane przez istniejące metryki obciążenia
> w raporcie P20 (k_I i k_S). Nie dochodzi do ponownego przeliczenia rozpływu mocy.

## 5. Definicja marginesu

- **Margines dodatni** ⇒ wynik bezpieczny (`PASS`).
- **Margines ujemny** ⇒ przekroczenie limitu (`FAIL`).
- **Brak danych** ⇒ `NOT_COMPUTED`.

Przykład: dla obciążenia

```text
margin = limit - observed
```

Analogicznie dla zabezpieczeń i profilu napięć wykorzystywane są istniejące limity i progi.

## 6. Determinizm

- Stabilne sortowanie wpisów według `(parameter_id, target_id, source)`.
- Ranking `top_drivers` deterministyczny (score → id → target).
- `analysis_id` obliczany jako SHA-256 z ustabilizowanego JSON.

## 7. Integracja z P24+

Sekcja **P25** w raporcie PDF P24+ zawiera:
- listę top driverów wrażliwości,
- tabelę wejściową marginesów i delt,
- spójny hash raportu (z uwzględnieniem danych P25).
