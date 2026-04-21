# P28 â€” COVERAGE COMPLETENESS SCORE (benchmark+++)

## 1. Cel

P28 dostarcza **liczbowy audyt kompletnoĹ›ci analizy** w skali 0â€“100.
Wynik jest informacyjny i nie oznacza PASS/FAIL.

## 2. Zakres (P28 ONLY)

**WejĹ›cia (readâ€‘only):**
- Proof Audit Matrix (P14)
- ProofDocument (P11â€“P19)
- `NormativeReport` (P20)
- `VoltageProfileView` (P21)
- `ProtectionInsightView` + `ProtectionCurvesITView` (P22/Câ€‘P22)
- `SensitivityView` (P25)
- `RecommendationView` (P26)

**WyjĹ›cie:**
- `CoverageScoreView` (JSON/DTO)
- sekcja PDF â€žKompletnoĹ›Ä‡ analizy (P28)â€ť.

## 3. Logika oceny (deterministyczna)

1. Start od 100 pkt.
2. Odejmij punkty za brakujÄ…ce Proof Packi (P11/P15/P17/P18/P19).
3. Odejmij punkty za brakujÄ…ce widoki P20/P21/P22/P25/P26.
4. Dodaj **jawne kary** za NOT COMPUTED (sumowane, z limitem bezpieczeĹ„stwa).
5. Wynik jest obcinany do przedziaĹ‚u 0â€“100.

## 4. NOT COMPUTED

KaĹĽdy brak danych (P20/P21/P22/P25/P26) jest jawnie widoczny w:
- `missing_items[]`,
- `critical_gaps[]`,
- oraz w sekcji P28 PDF.

## 5. Determinizm

- Stabilne sortowanie list `missing_items` i `critical_gaps`.
- Hash `analysis_id` jako SHAâ€‘256 z ustabilizowanego JSON.

## 6. Integracja z P24+

Sekcja PDF â€žKompletnoĹ›Ä‡ analizy (P28)â€ť zawiera:
- wynik 0â€“100,
- listÄ™ brakĂłw,
- krytyczne luki (np. brak P19).

