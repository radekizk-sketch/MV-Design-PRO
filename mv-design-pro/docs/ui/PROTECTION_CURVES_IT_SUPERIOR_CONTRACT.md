# PROTECTION CURVES Iâ€“t â€” benchmark++ (C-P22)

**Status:** CANONICAL (BINDING)

## 1. Cel

C-P22 definiuje **deterministyczny** kontrakt prezentacji krzywych czasowoâ€‘prÄ…dowych Iâ€“t,
poĹ‚Ä…czony z decyzjÄ… normatywnÄ… (P20), z jawnymi marginesami i uzasadnieniem WHY.
Krzywe sÄ… **readâ€‘only** (postâ€‘hoc) i nie tworzÄ… nowych obliczeĹ„ fizycznych.

## 2. benchmark vs MVâ€‘DESIGNâ€‘PRO â€” tabela rĂłĹĽnic

| Obszar | benchmark | MVâ€‘DESIGNâ€‘PRO (benchmark++) |
| --- | --- | --- |
| Status decyzji | Brak | **PASS / WARNING / FAIL / NOT EVALUATED** na kaĹĽdym wykresie |
| Uzasadnienie (WHY) | Ukryte | **Jawne, 1â€“2 linie** (deterministyczne) |
| ReguĹ‚y normatywne (P20) | Brak listy | **Lista reguĹ‚ P20** przypisana do wykresu |
| Marginesy | Niejawne | **Jawne marginesy [%]** (bez nowych obliczeĹ„) |
| Overlay zdarzeĹ„ | Opcjonalny | **Ikâ€ł, i_p, I_th/IÂ˛t** z ProofDocument ID (P18/P19) |
| Determinizm renderu | Zmienny | **Deterministyczny SVG/PDF** (staĹ‚y porzÄ…dek serii/markerĂłw) |
| Brak danych | Ukryty | **NOT EVALUATED + missing_data[]** |

## 3. Zasady interpretacji

1. **Krzywa â‰  decyzja**: wykres zawsze zawiera status P20 (PASS/WARNING/FAIL/NOT EVALUATED).
2. **Brak danych â‰  FAIL**: brak krzywych, markerĂłw lub reguĹ‚ â†’ status **NOT EVALUATED** i lista `missing_data[]`.
3. **Marginesy [%]** pochodzÄ… z P22a / P18 (readâ€‘only). Nie sÄ… liczone od nowa.
4. **WHY** zawiera deterministyczne uzasadnienie + listÄ™ reguĹ‚ (1â€“2 linie).
5. **BUS/protectionâ€‘pair**: wykres jest centryczny wzglÄ™dem BUS i pary PRIMARY/BACKUP.

## 4. Gwarancje determinismu

- **Identyczne wejĹ›cia â†’ identyczne SVG/PDF**.
- StaĹ‚a kolejnoĹ›Ä‡ serii: **PRIMARY â†’ BACKUP â†’ series_id**.
- StaĹ‚a kolejnoĹ›Ä‡ markerĂłw: **IKSS â†’ IP â†’ ITH**.
- Brak metadanych losowych (timestamp, UUID) w renderze.

## 5. Relacje do pakietĂłw P18 / P20 / P22a / P24+

- **P18/P19** dostarczajÄ… markery Ikâ€ł / i_p / I_th/IÂ˛t oraz ProofDocument ID.
- **P20** dostarcza status normatywny i reguĹ‚y.
- **P22a** dostarcza marginesy [%] i WHY dla zabezpieczeĹ„.
- **P24+** zawiera sekcjÄ™ â€žKrzywe Iâ€“t (jeĹ›li dostÄ™pne)â€ť z placeholderem
  i statusem NOT EVALUATED w przypadku brakĂłw.

## 6. Wymagania MUST

- UI i terminologia **po polsku**.
- Render **logâ€“log**.
- Status + reguĹ‚y + marginesy + WHY sÄ… zawsze widoczne.
- No new physics: brak symulacji dynamicznych i modyfikacji solverĂłw.

