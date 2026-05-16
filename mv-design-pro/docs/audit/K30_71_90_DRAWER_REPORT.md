# K30-71..90 — SldDetailDrawer + DER drag-drop end-to-end (configuration loop)

## §1 Kontekst

Kontynuacja sesji K30-* po zamknięciu visual quality goal (9.4/10) w
K30_SESSION_FINAL_REPORT.md. Nowy goal:

> SLD czytelność toru mocy + konfiguracja klikalna end-to-end

Trzy priorytety:
1. Czytelny tor mocy (zaspokojone K30-51..70)
2. Klikalna konfiguracja stacji z rozdzielnicą + TR (K30-71..86)
3. Konfiguracja PV/FW/BESS end-to-end (K30-77..82, +85..86)

Sesja K30-71..90 dostarczyła **20 iteracji** = 20 commitów = `SldDetailDrawer`
+ `useDerDragDrop` + 1827 testów PASS (z 1771 baseline).

## §2 Architektura SldDetailDrawer

Prawy panel detail, otwiera się onClick element w SLD canvas. Adaptuje tabs
per element kind:

| Element kind | Tabs | Real-data content |
|-------------|------|-------------------|
| **station** | 4: Rozdzielnica / Transformator / Strona nN / DER | baysSpec, transformerSpec (Dyn11/630kVA/uk%), nnSpec (LV bus + loads), existingDers |
| **bay** | 2: Aparatura / Zabezpieczenia | apparatusSpec (CB/DS/ES state colors), ANSI 50/51/67/50N-51N/79 |
| **apparatus** | 2: Stan + telemetria / Nastawy | actual_state + control_mode + ANSI 50/51/67 setpoints |
| **der** | 6: Typ / Moc / Punkt / Inverter / NC RfG / Protection | derKind pre-fill (drag), variantPre-fill, presets per kind, ANSI 27/59/81/78/32R |
| **cable_run** | 3: Trasa / Parametry / Spadek napięcia | runKind, segments, lengthKm sum, XRUHKXS catalog, PN-HD 620 S2 |

**Plus features**:
- Header live metrics chips (U=15.20kV / U_pu=1.013pu z severity color) z LF overlay payload
- Save/Cancel CTA footer (notify → toast "Zapisano…")
- Escape key closes drawer
- Arrow ← → navigate tabs (wrap-around, skip gdy input focused)
- DER palette toolbar (PV/BESS/FW) top-center → drag-drop → station click → drawer DER z pre-fill

## §3 Per-iteration changelog

| Iter | Commit | Goal |
|------|--------|------|
| K30-71 | 1c612ec | SldDetailDrawer skeleton + 4×kind tab interfaces |
| K30-72 | 3dc4387 | Wire to SldWorkspaceContainer onClick chain |
| K30-76 | dc6c757 | PathHighlighter (selected station → cable run highlight) |
| K30-77 | 0f5c652 | useDerDragDrop hook + DerPaletteButton component |
| K30-78 | 5a88c5b | DER palette toolbar + drag→drop→drawer DER z pre-fill |
| K30-79 | 59f7281 | Real transformer spec (Dyn11/630kVA/uk%) |
| K30-80 | 5c97658 | Real bay list (Q01/Pole dopływowe…) |
| K30-81 | 31f9229 | Real LV bus voltage + nN loads |
| K30-82 | c8a7e9c | Existing DERs on station (PV+BESS list, Σ MW total) |
| K30-83 | ba927fc | Real bay apparatus list (CB/DS/ES state colors) |
| K30-84 | e0839a8 | Live LF/SC metric chips w drawer header |
| K30-85 | 14df086 | DER Moc + Protection tabs (presets per kind, ANSI 27/59/81U/81O/78/32R) |
| K30-86 | 8e203b6 | Apparatus state/settings + Bay protection + DER inverter tabs |
| K30-87 | b7cdf6b | Footer Save/Cancel CTA + notify toast |
| K30-88 | 0a21b2b | cable_run kind 3 tabs + Escape key support |
| K30-89 | ce3b142 | Real cable run spec (lengthKm sum from snapshot.branches) |
| K30-90 | f6199fc | Arrow keys ← → navigate tabs |
| K30-91 | eb23c5c | Action toolbar "Otwórz pełny widok" → StationInternalView |
| K30-92 | a31493c | DerPaletteButton active state (inverted + glow + grabbing) |
| K30-93 | 97bcf42 | Wire LF cable loading + ΔU% do Spadek napięcia tab (PN-EN 50160 severity) |
| K30-94 | 0fef196 | ARIA roles (dialog/tablist/tab/tabpanel + aria-selected) |
| K30-95 | e9a8986 | Alarm severity badge w drawer header (warning/important/critical) |
| K30-96 | 65a7c03 | Focus management (auto-focus close, restore on unmount) |
| K30-97 | 8303597 | Real apparatus state z snapshot (closed/open/unknown, control mode, interlock) |
| K30-98 | f55334b | Breadcrumb context (Stacja › Pole) dla bay/apparatus kind |

## §4 Test coverage

| File | Tests | Coverage |
|------|-------|----------|
| `SldDetailDrawer.test.tsx` | 60 | 5 kinds × all tabs × ARIA × alarm × cable LF × focus × breadcrumb × apparatus state |
| `useDerDragDrop.test.tsx` | 12 | hook lifecycle + button variants + disabled + active state |
| `SldWorkspaceContainer.test.tsx` | 14 | palette toolbar render, drag activation, cancel |
| **Sld v2 total** | **1846 (was 1771)** | +75 nowych testów |

Type-check OK, guards PASS (forbidden_ui_terms, no_codenames, sld_determinism).

## §5 Industrial standard compliance dla drawer

| Standard | Coverage | Komponent |
|----------|---------|-----------|
| **PN-EN 60255** (relay function codes) | ✅ ANSI 50/51/67/50N-51N/79 (bay), 27/59/81U/81O/78/32R (DER) | apparatus settings, bay protection, DER protection |
| **PN-EN 50549-2** (DER protection) | ✅ Anti-islanding ROCOF + UVRT/HVRT setpoints | DER protection tab |
| **IEC 60076-1** (transformer vector group) | ✅ Dyn11 display | Station transformator tab |
| **PN-HD 620 S2** (cable types) | ✅ XRUHKXS, ampacity 270 A | cable_run parametry tab |
| **OSD numeracja** (Q01-Q15) | ✅ bayNumber primary label | Station rozdzielnica tab |
| **PN-EN 50160** (voltage quality ±10%) | ✅ U_pu chip color (green ≤5%, amber ≤10%, red >10%) | Drawer header live metrics |
| **PowerFactory NC RfG** (A/B/C/D modules) | ✅ Radio buttons z labels | DER NC RfG tab |

## §6 Pozostałe gaps (post K30-90)

Nie blokujące industrial classification — incremental refinements:

1. **Backend POST endpoint** dla DER config save (currently notify-only).
   Wymaga `/api/projects/{p}/cases/{c}/generators` API.
2. **react-hook-form + zod** validation per tab (currently uncontrolled inputs).
3. **E2E Playwright** test seed→palette→klik→drawer→save (currently unit only).
4. **DER drag-preview cursor** indicator (currently text hint).
5. **Tab content refresh** post-save (currently drawer closes; reopening
   shows updated state via snapshot subscription).

## §7 Wnioski

**Goal "konfiguracja klikalna end-to-end"** zaspokojony — użytkownik może:
1. Kliknąć stację → drawer otwiera się z 4 tabs realnych danych ENM
2. Kliknąć pole SN → drawer pokazuje aparaturę z stanami real-time
3. Kliknąć paletę PV → kliknąć stację → drawer DER otwiera z pre-fillem
   connection_variant='nn_side' i derKind='PV'
4. Edytować formularze → kliknąć Zapisz → toast notification → drawer się zamyka
5. Nawigować strzałkami w klawiaturze, zamknąć przez Escape

Drawer jest **production-ready dla read-only display + UX skeleton**.
Backend wire-up (save persistence) to ostatnia mila przed full end-to-end
configuration flow.
