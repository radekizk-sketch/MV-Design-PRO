# P28 — COVERAGE COMPLETENESS SCORE (benchmark+++)

## 1. Cel

P28 dostarcza **liczbowy audyt kompletności analizy** w skali 0–100.
Wynik jest informacyjny i nie oznacza PASS/FAIL.

## 2. Zakres (P28 ONLY)

**Wejścia (read‑only):**
- Proof Audit Matrix (P14)
- ProofDocument (P11–P19)
- `NormativeReport` (P20)
- `VoltageProfileView` (P21)
- `ProtectionInsightView` + `ProtectionCurvesITView` (P22/C‑P22)
- `SensitivityView` (P25)
- `RecommendationView` (P26)

**Wyjście:**
- `CoverageScoreView` (JSON/DTO)
- sekcja PDF „Kompletność analizy (P28)”.

## 3. Logika oceny (deterministyczna)

1. Start od 100 pkt.
2. Odejmij punkty za brakujące Proof Packi (P11/P15/P17/P18/P19).
3. Odejmij punkty za brakujące widoki P20/P21/P22/P25/P26.
4. Dodaj **jawne kary** za NOT COMPUTED (sumowane, z limitem bezpieczeństwa).
5. Wynik jest obcinany do przedziału 0–100.

## 4. NOT COMPUTED

Każdy brak danych (P20/P21/P22/P25/P26) jest jawnie widoczny w:
- `missing_items[]`,
- `critical_gaps[]`,
- oraz w sekcji P28 PDF.

## 5. Determinizm

- Stabilne sortowanie list `missing_items` i `critical_gaps`.
- Hash `analysis_id` jako SHA‑256 z ustabilizowanego JSON.

## 6. Integracja z P24+

Sekcja PDF „Kompletność analizy (P28)” zawiera:
- wynik 0–100,
- listę braków,
- krytyczne luki (np. brak P19).

