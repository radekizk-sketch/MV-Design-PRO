# P26 — AUTO RECOMMENDATIONS (CANONICAL+)

## 1. Cel

P26 dostarcza **automatyczne rekomendacje** typu „co zmienić, żeby PASS”,
wyłącznie na bazie istniejących artefaktów P11–P25 (post-hoc).
Nie uruchamia solverów ani nie modyfikuje Result API.

## 2. Zakres (P26 ONLY)

**Wejścia (read-only):**
- `SensitivityView` (P25)
- `NormativeReport` (P20)
- `VoltageProfileView` (P21)
- `ProtectionInsightView` + `ProtectionCurvesITView` (P22/C-P22)
- Metadane ProofDocument (P11–P19)

**Wyjście:**
- `RecommendationView` (JSON/DTO)
- deterministyczne sortowanie i hash
- integracja z raportem PDF P24+ (sekcja „Rekomendacje (P26)”).

## 3. Logika (post-hoc, deterministyczna)

P26 wyznacza minimalne zmiany prowadzące do PASS:
- **nastawa zabezpieczenia** (marginesy P22a i krzywe I-t),
- **limit normatywny** (P20),
- **dopuszczalna zmiana obciążenia** (P25: Load P/Q),
- **dopuszczalna zmiana napięcia** (P25: limity napięciowe).

Dla wpisów `FAIL` z P25 estymacja Δ bazuje na liniowej zależności
z perturbacji ±Δ% (`SensitivityView`).

## 4. NOT COMPUTED

Jeżeli brakuje danych wejściowych (np. brak P25 lub brak limitu/obserwacji w P20),
P26 generuje wpis z `expected_effect = NOT_COMPUTED` i jawnie podaje przyczynę.

## 5. Determinizm

- Stabilne sortowanie rekomendacji wg:
  `(expected_effect, |Δ|, parameter_id, target_id, source)`.
- Hash `analysis_id` jako SHA-256 z ustabilizowanego JSON.

## 6. Integracja z P24+

Sekcja PDF „Rekomendacje (P26)” zawiera:
- rekomendację główną (minimalny Δ),
- alternatywy (ranked),
- jawne NOT COMPUTED (z przyczyną).

## 7. Terminologia

- **BoundaryNode – węzeł przyłączenia** (terminologia obowiązkowa w raportach).
