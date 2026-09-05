# P27 — SCENARIO COMPARISON (CANONICAL+)

> **USUNIĘTY (2026-09-05, CV-3.2):** P27 (`ScenarioComparisonBuilder`,
> `analysis/scenario_comparison/**`) był konsolidowany w
> `CANONICAL_TWIN_ARCHITECTURE.md` (część B, pozycja C4 inwentarza — ten sam
> byt co P23, `application/study_scenario/**`, patrz
> `docs/architecture/STUDY_SCENARIO_WORKFLOW_CANONICAL_PLUS.md`). Jedyny
> produkcyjny konsument `ScenarioComparisonEntry`/`View` — sekcja PDF „P27" w
> P24+ (`analysis/reporting/pdf/**`) — sam miał 0 wołających poza sobą i 0
> tras HTTP (ten sam byt, „raport bez trasy"). Kod usunięty procedurą kasacji
> razem z P24+ w całości. Dokument zachowany jako materiał HISTORYCZNY
> (wymagany przez `docs_archive_guard.py::MIGRATION_MAP` jako istniejący
> następca `P27_SCENARIO_COMPARISON_ETAP_PLUS.md`); NIE jest źródłem
> kanonicznym, nie opisuje niczego istniejącego w kodzie. Terminologia w §7
> poniżej („BoundaryNode") jest historyczna i NIE obowiązuje — zakazana w
> rdzeniu modelu (`CLAUDE.md`, Forbidden Terms).

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
