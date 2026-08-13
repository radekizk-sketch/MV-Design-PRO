# PROTECTION CURVES I–t — benchmark++ (C-P22)

**Status:** CANONICAL (BINDING)

## 1. Cel

C-P22 definiuje **deterministyczny** kontrakt prezentacji krzywych czasowo‑prądowych I–t,
połączony z decyzją normatywną (P20), z jawnymi marginesami i uzasadnieniem WHY.
Krzywe są **read‑only** (post‑hoc) i nie tworzą nowych obliczeń fizycznych.

## 2. benchmark vs MV‑DESIGN‑PRO — tabela różnic

| Obszar | benchmark | MV‑DESIGN‑PRO (benchmark++) |
| --- | --- | --- |
| Status decyzji | Brak | **PASS / WARNING / FAIL / NOT EVALUATED** na każdym wykresie |
| Uzasadnienie (WHY) | Ukryte | **Jawne, 1–2 linie** (deterministyczne) |
| Reguły normatywne (P20) | Brak listy | **Lista reguł P20** przypisana do wykresu |
| Marginesy | Niejawne | **Jawne marginesy [%]** (bez nowych obliczeń) |
| Overlay zdarzeń | Opcjonalny | **Ik″, i_p, I_th/I²t** z ProofDocument ID (P18/P19) |
| Determinizm renderu | Zmienny | **Deterministyczny SVG/PDF** (stały porządek serii/markerów) |
| Brak danych | Ukryty | **NOT EVALUATED + missing_data[]** |

## 3. Zasady interpretacji

1. **Krzywa ≠ decyzja**: wykres zawsze zawiera status P20 (PASS/WARNING/FAIL/NOT EVALUATED).
2. **Brak danych ≠ FAIL**: brak krzywych, markerów lub reguł → status **NOT EVALUATED** i lista `missing_data[]`.
3. **Marginesy [%]** pochodzą z P22a / P18 (read‑only). Nie są liczone od nowa.
4. **WHY** zawiera deterministyczne uzasadnienie + listę reguł (1–2 linie).
5. **BUS/protection‑pair**: wykres jest centryczny względem BUS i pary PRIMARY/BACKUP.

## 4. Gwarancje determinismu

- **Identyczne wejścia → identyczne SVG/PDF**.
- Stała kolejność serii: **PRIMARY → BACKUP → series_id**.
- Stała kolejność markerów: **IKSS → IP → ITH**.
- Brak metadanych losowych (timestamp, UUID) w renderze.

## 5. Relacje do pakietów P18 / P20 / P22a / P24+

- **P18/P19** dostarczają markery Ik″ / i_p / I_th/I²t oraz ProofDocument ID.
- **P20** dostarcza status normatywny i reguły.
- **P22a** dostarcza marginesy [%] i WHY dla zabezpieczeń.
- **P24+** zawiera sekcję „Krzywe I–t (jeśli dostępne)” z placeholderem
  i statusem NOT EVALUATED w przypadku braków.

## 6. Wymagania MUST

- UI i terminologia **po polsku**.
- Render **log–log**.
- Status + reguły + marginesy + WHY są zawsze widoczne.
- No new physics: brak symulacji dynamicznych i modyfikacji solverów.

