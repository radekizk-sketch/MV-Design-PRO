# P27 — SCENARIO COMPARISON (CANONICAL+)

## 1. Cel

P27 zapewnia **deterministyczne porównanie scenariuszy A/B/C**
i odpowiada na pytanie „dlaczego scenariusz X jest lepszy?”.
Porównanie jest post-hoc i nie uruchamia solverów.

## 2. Zakres (P27 ONLY)

**Wejścia (read-only):**
- Study / Scenario / Run (P23)
- `NormativeReport` (P20)
- `SensitivityView` (P25)
- `RecommendationView` (P26)
- metadane raportu P24+

**Wyjście:**
- `ScenarioComparisonView` (JSON/DTO)
- sekcja PDF „Porównanie scenariuszy (P27)”.

## 3. Logika porównania (post-hoc)

Porównanie uwzględnia:
- **marginesy normatywne** i liczbę FAIL/WARNING,
- **rankingi wrażliwości** (P25),
- **liczbę NOT COMPUTED**,
- **minimalne Δ z rekomendacji** (P26).

Każdy scenariusz otrzymuje deterministyczny wynik ryzyka
(z zawsze stabilnym sortowaniem), a raport zawiera jawne WHY:
> „Scenariusz B gorszy od A, ponieważ …”.

## 4. NOT COMPUTED

Braki danych w P20/P25/P26 są jawnie propagowane do `key_drivers`
oraz do pola `why_pl`.

## 5. Determinizm

- Stabilne sortowanie scenariuszy wg: `(risk_score, scenario_name, scenario_id)`.
- Hash `comparison_id` jako SHA-256 z ustabilizowanego JSON.

## 6. Integracja z P24+

Sekcja PDF „Porównanie scenariuszy (P27)” zawiera:
- zwycięzcę (winner),
- listę scenariuszy z `risk_score` i `WHY`.

## 7. Terminologia

- **BoundaryNode – węzeł przyłączenia** (terminologia obowiązkowa).
