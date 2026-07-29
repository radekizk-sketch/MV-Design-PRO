# KARTA KOORDYNACYJNA (WĄTEK SLD) — PEŁNE WYGASZENIE E-26 / ComplianceSurface

**Typ:** karta KOORDYNACYJNA międzywątkowa · **Wątek docelowy:** SLD REWORK
(`docs/plan/PLAN_SLD_REWORK.md`) · **Wątek zgłaszający:** Program UI/UX (W5b-1) ·
**Wiążące:** granica wątków (Program UI/UX NIE modyfikuje `ui/sld/**`,
`ui/sld-editor/**`, `engine/sld-layout/**`).

## 1. Kontekst
W5b-1 (Program UI/UX) wygasił redundantny punkt wejścia legacy do E-26 z mostu
(przycisk „Charakterystyki FRT/LVRT/HVRT" w AnalysisSurface). Trasa
`case 'E-26' → <ComplianceSurface>` (`WorkspaceSurfaceRouter.tsx`) i sam
komponent `ComplianceSurface` ZOSTAŁY — bo E-26 jest nadal osiągalne z akcji
kontekstowych SLD:
- `ui/sld/v2/canvas/SldWorkspaceContainer.tsx:774-775` — mapowanie
  `'show-frt-hvrt' → 'E-26'`, `'show-ncrfg' → 'E-26'`,
- `SldWorkspaceContainer.tsx:800` — `case 'E-26'`.
Metoda wygaszania = OPCJA 1 (ekran kanoniczny E-26 ZOSTAJE; dostawca UI to
ui2 `EkranFrt`, `ui2/oze/frt/EkranFrt.tsx`, zakładka `frt` warsztatu wyników).
Bramka Parytetu 1–5 dla E-26↔EkranFrt PRZESZŁA (dowód w raporcie W5b-1 /
rejestrze planu wygaszania §4).

## 2. Prośba do wątku SLD (do wykonania w sesji SLD)
1. Przekierować akcje kontekstowe SLD `show-frt-hvrt` / `show-ncrfg` na
   docelową powierzchnię ui2 (`EkranFrt` / macierz NC RfG) zamiast na legacy
   `ComplianceSurface` (E-26), zgodnie z metodą Opcja 1.
2. Po przekierowaniu — usunąć martwą trasę `case 'E-26' → <ComplianceSurface>`
   i komponent `ComplianceSurface` z `WorkspaceSurfaceRouter.tsx`, jeżeli
   żaden inny punkt wejścia go nie używa (grep całego `ui/`).
3. Zachować ekran kanoniczny E-26 w `screenCanonRegistry.ts` / `coverageMatrix.ts`
   (ZERO zmian zamrożonego kanonu — jak w W5b-1).
4. Bramki jak w programie: pełny vitest ZERO failed, testy kanonu zielone,
   `v12xx_canon_guard` exit 0, E2E ścieżki SLD→FRT.

## 3. Uwaga
To samo dotyczy przyszłego W5b-2 (AnalysisSurface): przed usunięciem jego
tras sprawdzić wejścia z wątku SLD (analogiczny STOP-GUARD).

## 4. DOMKNIĘCIE (2026-07-18, po konsolidacji wątków — W5b-3)
Konsolidacja gałęzi (merge `75a70d3f`) zniosła granicę wątków — pliki SLD
są teraz na gałęzi UI, więc kartę zrealizowano w tej samej sesji. Wykonano
metodą OPCJA 1 (plan wygaszania §3c):
- **Dostawca E-26 przełączony na `EkranFrt`**: `WorkspaceSurfaceRouter.tsx`
  `case 'E-26'` renderuje teraz `EkranFrt` (ui2, superset — dobór modułu+
  operatora z katalogu NC RfG, realny bieg trajektorii z backendu, werdykt)
  zamiast statycznego `ComplianceSurface` z zaślepką `no_module`. Tryb
  zaawansowania z `useShellStore` (globalny store powłoki).
- **`ComplianceSurface` (legacy) usunięty** wraz z importem `FrtHvrtCurves`/
  `NcRfgProfileId`. Akcje kontekstowe SLD `show-frt-hvrt`/`show-ncrfg`
  (`sldActionExecutor.ts` `ACTION_TO_SCREEN`) nadal celują w E-26 — który
  teraz pokazuje `EkranFrt` (rdzeń FRT = to samo, co dawniej, tylko z realnego
  backendu; brak regresji, „lepiej niż teraz").
- **Kanon E-26 NIETKNIĘTY co do zdolności**: `labelFull`/`areaId`/`testId`/
  `canonicalRoute`/transitions bez zmian; jedynie `componentKey` zaktualizowany
  `'ComplianceSurface' → 'EkranFrt'` (metadana dostawcy, NIE klucz dyspozytora
  routera; `v12xx_canon_guard` exit 0, testy kanonu zielone).
- **Osierocony-z-UI (mention, nie delete — wzorzec W5b-2)**: `FrtHvrtCurves`
  (`ui/protection-curves/FrtHvrtCurves.tsx`) + jego test — po usunięciu
  `ComplianceSurface` bez konsumenta w UI; samodzielny, przetestowany komponent
  wizualizacji, zostawiony do ew. przyszłego użycia.
Bramki: type-check OK, lint 0 ostrzeżeń, celowany vitest (workspace + wyniki +
FrtHvrtCurves) 215/215, guardy (codenames, forbidden_ui_terms, ui_terminology,
utf8_mojibake, dead_click, v12xx_canon) exit 0. **KARTA ZAMKNIĘTA.**
Możliwe dalsze „lepiej niż teraz" (poza tą kartą): rozdzielić `show-ncrfg`
→ macierz NC RfG (`ui2/oze/macierz`) od `show-frt-hvrt` → E-26/EkranFrt,
gdy macierz otrzyma własny kanoniczny ekran osiągalny przez `openRouteSurface`.
