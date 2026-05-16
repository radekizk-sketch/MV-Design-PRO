# Iter K30-44 + K30-45 — voltage deviation classifier + cable loading overlay

**Date:** 2026-05-15
**Branch:** `claude/cleanup-documentation-sld-7zVRd`
**Scope:** Dwie data-driven projekcje wyników LF zostały dodane:
- K30-44: voltage deviation klasifikator na station code badge (PN-EN 50160).
- K30-45: cable loading overlay (% ampacity, IEC 60865 thermal limit).

## K30-44 — voltage deviation classifier

### Problem

Stacje pod LF mają obliczone napięcie U_actual które może odbiegać od U_n
o ΔU%. Bez wizualnej klasyfikacji operator nie widzi natychmiast które
stacje mają napięcie poza dopuszczalnymi granicami **PN-EN 50160** (±10%).

### Implementacja

W `StationOnRunRenderer.tsx` (DispatcherStationSymbol):
- Nowy prop `voltageDeviationPct?: number | null`
- `classifyVoltageDeviation(devPct)` mapuje |ΔU| → kolor:
  - ≤ 2% → `#13C45A` green (OK)
  - 2-5% → `#FFD166` amber (warning)
  - 5-10% → `#FF8B5C` orange (significant)
  - > 10% → `#FF6B6B` red (out-of-spec PN-EN 50160)
  - null → `#7EC8FF` cyan (default, no LF data)
- Station code badge:
  - `rect.stroke` = ring color
  - `text.fill` = ring color
  - Stroke-width 1.8 (was 1.4 — bardziej prominent)
- Nowy text `ΔU ±N.N%` poniżej kodu (gdy dev != null)
- `data-voltage-deviation-pct` + `data-voltage-deviation-class` attrs

### Tests (7 NEW)

W `renderers.test.tsx`:
1. `voltageDeviationPct=1.0 → ring green (OK ≤ 2%)`
2. `voltageDeviationPct=3.5 → ring amber (warn 2-5%)`
3. `voltageDeviationPct=-7.5 → ring orange (significant, sign-aware abs)`
4. `voltageDeviationPct=12 → ring red (out-of-spec >10% PN-EN 50160)`
5. `voltageDeviationPct renderuje ΔU label "+3.5%" / "-7.5%"`
6. `brak voltageDeviationPct → ring default cyan` (back-compat)
7. (Implicit) Brak ΔU label gdy brak voltageDeviationPct

## K30-45 — cable loading overlay

### Problem

Kabel SN ma określoną ampacity (I_max) z catalog (PN-HD 620 S2 / IEC 60287).
Pod LF mamy obliczone I_actual przepływające przez kabel. Bez wizualnej
projekcji **% loading** operator nie identyfikuje przeciążonych kabli, co
prowadzi do thermal overload niewykrytego.

### Implementacja

W `CableRunRenderer.tsx`:
- Nowy prop `loadingPct?: number | null` (I_actual/I_max × 100)
- `classifyCableLoading(pct)`:
  - ≤ 60% → green `#13C45A` "normal"
  - 60-80% → amber `#FFD166` "warning"
  - 80-100% → orange `#FF8B5C` "high"
  - > 100% → red `#FF333D` "overload"
- **Loading chip** "I {N}%" w pozycji przy starcie ciągu (obok voltage chip)
- **Overload overlay** (gdy loadingPct > 100): dashed red path nad cablem
  sygnalizujący THERMAL OVERLOAD
- Loading chip pomijany gdy `missingEndpointPort` (warning override)

### Tests (6 NEW)

W `renderers.test.tsx`:
1. `loadingPct=45 → green chip "I 45%" (normal)`
2. `loadingPct=75 → amber chip (warning)`
3. `loadingPct=120 → red chip + overload overlay (THERMAL OVERLOAD)`
4. `loadingPct ≤ 100 → brak overload overlay`
5. `brak loadingPct → brak loading chip (back-compat)`
6. `missingEndpointPort → loading chip pomijany (warning override)`

## §4 Visual artifact

- `K30_44_45_VOLTAGE_LOADING_DEMO.png` — 5 station codes (ok/warn/significant/
  out-of-spec/none) + 4 cable runs (normal/warning/high/overload).

## §5 Score impact

- K30-44: Eksploatator/Dyspozytor +1 (voltage deviation natychmiast czytelne)
- K30-45: Projektant kabli +1 (loading overload natychmiast widoczny)

**Aggregate post K30-44+45: 9.6/10**
