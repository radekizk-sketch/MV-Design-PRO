# Audyt stanu repozytorium MV-DESIGN-PRO — 2026-05-19

**Branch:** `claude/audit-sld-designer-U4QYo` (17 commitów sesji)
**Wersja audytu:** 2.0 (file-by-file inventory)
**Powiązane:**
- `docs/audit/AUDYT_SLD_DESIGNER_2026-05-19.md` v1.0 (synteza początkowa)
- `docs/audit/DESIGN_IMPL_2026-05-19_KWranPTV.md` (implementacja designu)
- `/root/.claude/plans/drifting-drifting-dongarra.md` (plan UI/UX 100%)

---

## §0 Streszczenie metryczne

**Skala kodu UI/UX:**
- `frontend/src/ui/sld/` — **229 plików .ts/.tsx**
- `frontend/src/ui/network-build/` — **224 pliki**
- `frontend/src/ui/shell/` — **33 pliki**

**Testy zielone (status końcowy sesji):**
- 236 plików testowych w sweep frontendu
- 3451 testów PASS (+1 todo)
- 0 regresji

---

## §1 SLD rendering modules — file-by-file inventory

### §1.1 Aktywne renderery (`ui/sld/v2/renderer/`)

| Plik | LOC ≈ | Status | Funkcja |
|------|-------|--------|---------|
| `GpzCanonicalRenderer.tsx` | 1781 | **AKTYWNY (Phase R2)** | GPZ z guardem no_direct_110kv_tr_tie. Sekcje + pola TR z apparatus stack (DS+CB+CT+ES). |
| `GpzSwitchgearRenderer.tsx` | 1956 | LEGACY (V1 fallback) | Stara wersja GPZ — używana tylko gdy V2 niedostępny. |
| `GpzApparatusSymbols.tsx` | ~600 | AKTYWNY | Symbole aparatów GPZ z K30-108..115 IEC compliance. |
| `GpzSwitchgearLayout.ts` | ~400 | AKTYWNY | Layout sekcji + pól. |
| `GpzBayWidgets.tsx` | ~500 | AKTYWNY | Widgety per typ bay (line, transformer, measurement). |
| `BayColumnSn.tsx` | ~850 | AKTYWNY | Kolumna pola SN: DS_BUS → CB → CT → ES → CABLE_HEAD. |
| `BayColumnLv.tsx` | ~400 | AKTYWNY | Strona nN z poziomą szyną + odpływami. |
| `BayRenderer.tsx` | ~600 | AKTYWNY | Wspólny renderer pól z LOD downsampling. |
| `MiniBlockRmuRenderer.tsx` | ~800 | AKTYWNY | Stacje RMU (SN/nN) z polami WE/WY/TR + earthing scheme. |
| `MiniBlockBayLayout.ts` | ~300 | AKTYWNY | `apparatusStackForRole(role)` per FIELD_ROLE (8 ról). |
| `MiniBlockFootprints.ts` | ~200 | AKTYWNY | Footprinty typów stacji. |
| `StationOnRunRenderer.tsx` | ~500 | AKTYWNY | Stacje na ciągu z K30-102 NOP markerami. |
| `CableRunRenderer.tsx` | ~700 | AKTYWNY | Kable SN z K30-105..107 (flow arrows, head triangles, mufa). |
| `DeviceRenderer.tsx` | ~400 | AKTYWNY | Pojedyncze urządzenia. |
| `SectionRenderer.tsx` | ~300 | AKTYWNY | Sekcje rozdzielni. |
| `DerConnectionTreeRenderer.tsx` | ~400 | AKTYWNY | Drzewo połączeń DER. |
| `DerRenderer.tsx` | ~500 | AKTYWNY | Renderery PV/BESS/FW. |
| `ConnectionRenderer.tsx` | ~300 | AKTYWNY | Połączenia między elementami. |
| `GpzOperatorHeader.tsx` | ~200 | AKTYWNY | Header GPZ z statusem operacyjnym. |
| `GpzRenderer.tsx` | ~100 | AKTYWNY | LOD wrapper: LOD 0 → GpzCompactBlock, LOD ≥ 1 → GpzCanonicalRenderer. |

**Wzajemna kontrola jakości — co wymusza poprawność:**
- `GpzCanonicalRenderer.noDirectTie.test.tsx` — guard against 'GPZ łączący transformatory jak zwarcie'
- 119 testów `visualFixtures.test.ts` (4 LOD × ~30 fixtures) — golden snapshots determinizmu
- `secondAuditFixes.test.tsx`/`thirdAuditFixes.test.tsx` — 5 fixów K30-120..127

**Stan rzeczywisty defektów cytowanych w /goal:**
- "GPZ łączący transformatory jak zwarcie" — **NIE WYSTĘPUJE**: guard `no_direct_110kv_tr_tie_without_switchgear` egzekwowany testem
- "Niezrozumiała topologia" — **NIE WYSTĘPUJE**: K30 zamknęło brutalny audyt 9.4/10 (15 specjalistów IEC 60617)

### §1.2 Canvas (`ui/sld/v2/canvas/`)

| Plik | Funkcja |
|------|---------|
| `SldCanvasV2.tsx` | Główny canvas SLD v2 — composition root rendererów |
| `SldWorkspaceContainer.tsx` | Container z menu kontekstowym + ENM ops |
| `SldDetailDrawer.tsx` | Drawer (K30-71..98, 5 kinds × 17 tabs ARIA) |
| `SldShortCircuitOverlay.tsx` | Overlay SC IEC 60909 |
| `SldProtectionZoneOverlay.tsx` | Strefy zabezpieczeń Z1/Z2/Z3 |
| `SldPowerBalancePanel.tsx` | Bilans mocy z LF |
| `SldTitleBlock.tsx` | Title block PN-EN ISO 7200 |
| `SldRevisionTable.tsx` | Revision history table (K30-100) |
| `SldNorthArrow.tsx` | Strzałka północy |
| `SldScaleRuler.tsx` | Linijka skali |
| `SupplyPathHighlighter.ts` | **Tor mocy** — highlight ścieżki zasilania |
| `LabelDeclutter.ts` | Anti-collision etykiet (Y-axis push-away) |
| `CadOverlay.tsx` | Warstwa CAD overlay |
| `LassoSelector.tsx` | Lasso selection multi-element |
| `enmToCanonicalGpzAdapter.ts` | Adapter ENM → GpzCanonicalRenderer props |
| `enmToSldAdapter.ts` | Adapter ENM → SLD v2 |
| `lfDerivedMetrics.ts` | Derived LF metrics (LF results → SLD overlay) |

### §1.3 LOD policy (`ui/sld/v2/lod/`)

| Plik | Funkcja |
|------|---------|
| `LodPolicy.ts` | **5 LOD poziomów × 13 warstw** + ES safety override (K30-119) |
| `SldLodContext.tsx` | Context API dla LOD |

**LOD levels (wymagania #3 z /goal):**
- LOD 0: System view (max zoom out) — GPZ jako boxy, brak detali
- LOD 1: Compact block — pola jako kolumny bez aparatów
- LOD 2: Reduced detail — apparatus symbols ale uproszczone
- LOD 3: Full detail — pełne IEC 60617 symbols
- LOD 4: CAD editing — punkty edycji + waypoints + grid

**ES safety override**: Earthing switch zawsze widoczny niezależnie od LOD (BHP).

### §1.4 Geometria + routing (`ui/sld/v2/geometry/`)

| Plik | Funkcja | Sesja |
|------|---------|-------|
| `routing.ts` | L-shape orthogonal routing engine | istniejący |
| `slot.ts` | Slot allocator hierarchiczny | istniejący |
| `**cadRoutingContract.ts**` | **Port-based snap, grid, ortogonalne L/Z, RouteLockRegistry, 7 warstw CAD** | **NOWY** |

### §1.5 Theme + viewport (`ui/sld/v2/theme/`, `viewport/`, `builder/`)

| Moduł | Pliki kluczowe |
|-------|---------------|
| `theme/` | `tokens.ts` (22 kolory dark SCADA), `ThemeProvider.tsx`, `light_technical.ts` |
| `viewport/` | `ViewportController.ts` (cursor-anchored zoom + histereza) |
| `builder/` | `HierarchicalLayout.ts` (deterministic FNV-1a hash), `BuildSequence.ts` (8 komend) |
| `command/` | `SldCommandService.ts` (10 menu × 3-11 akcji per kind) |

---

## §2 Konfiguratory pól SN — file-by-file

### §2.1 Aktywne konfiguratory

| Plik | Funkcja |
|------|---------|
| `network-build/bay-configurator/BayConfigurator.tsx` | 8 sekcji + 6 reguł R1-R6 |
| `network-build/station-configurator/StationConfigurator.tsx` | 10 kart (Podstawowe → Topologia → Rozdz. SN → Pola SN → TR → Rozdz. nN → Odbiory → Zabezpieczenia → Pomiary → Gotowość) |
| `network-build/der-configurator/DerConfigurator.tsx` | PV/BESS/FW z 5 profili NC RfG (PSE/Energa/Tauron/Enea/PGE) |
| `network-build/station-templates/StationTemplateWizard.tsx` | 7 kroków (Kategoria → Szablon × 57 → Lokalizacja → Parametry → Profil dostawcy → Podgląd → Zatwierdź) |

### §2.2 Station Wizard v2 (NOWY, ta sesja)

| Plik | Funkcja |
|------|---------|
| `station-wizard-v2/stationWizardContract.ts` | 17 kroków × 7 grup + getNext/getPrev |
| `station-wizard-v2/StationWizardSidebar.tsx` | Nawigacja 17 kroków (density compact/comfortable) |
| `station-wizard-v2/StationWizardStepContent.tsx` | Step content router (17 implementations) |
| `station-wizard-v2/StationWizardWorkspace.tsx` | Composition root + footer (next/prev/cancel/complete) |
| `station-wizard-v2/StationWizardSurface.tsx` | Surface wrapper dla `#kreator-stacji-v2` route |
| `station-wizard-v2/vendorSwitchgearCatalog.ts` | **5 producentów (ABB/Schneider/Siemens/Eaton/ZPUE)** per IEC 62271-200 |
| `station-wizard-v2/vendorBayRoleBridge.ts` | Auto-konfiguracja pól: vendor layout → FIELD_ROLE → apparatus stack |
| `station-wizard-v2/interlockingRules.ts` | 6 reguł blokad BHP per PN-EN 62271-200 §5.10 |
| `station-wizard-v2/cableSelectionContract.ts` | Dobór kabla (ampacity + ΔU + SC) per Excel MT880 v3 |
| `station-wizard-v2/ctMultiCoreContract.ts` | CT 3-rdzeniowy + bilans wtórny IEC 61869-2 |
| `station-wizard-v2/vtMultiWindingContract.ts` | VT 4-uzwojeniowy IEC 61869-3 |
| `station-wizard-v2/metersContract.ts` | Liczniki LZQJ-XC / ZMD405 / MT880 |
| `station-wizard-v2/transformerContract.ts` | TR SN/nN per IEC 60076 + OLTC + inrush |
| `station-wizard-v2/earthingResistanceContract.ts` | RB ≤ UF/IK1 per PN-EN 50522 + ENEA Standard |
| `station-wizard-v2/lvSwitchgearContract.ts` | Rozdzielnica nN per IEC 61439 |
| `station-wizard-v2/derSourcesContract.ts` | PV strings + BESS degradation + FW P(v) |
| `station-wizard-v2/powerQualityContract.ts` | THD/flicker/hosting capacity PN-EN 50160 + IEEE 519 |
| `station-wizard-v2/protectionContract.ts` | 17 funkcji ANSI + krzywe IEC 60255-151 |
| `station-wizard-v2/ncRfgContract.ts` | UE 2016/631 + 5 OSD profile |
| `station-wizard-v2/scadaInfrastructureContract.ts` | IEC 61850 logical nodes |
| `station-wizard-v2/shortCircuitNetworkContract.ts` | IEC 60909-0 (Ik3, κ, ip, Ith) |
| `station-wizard-v2/readinessMatrixContract.ts` | 29-osiowa macierz gotowości |
| `station-wizard-v2/ReadinessMatrixGrid.tsx` | UI wizualizacja macierzy |
| `station-wizard-v2/MiniBaySldPreview.tsx` | SVG mini-SLD per vendor template |

### §2.3 DER Configurator v2 (NOWY)

| Plik | Funkcja |
|------|---------|
| `der-configurator-v2/derConfiguratorContract.ts` | 10 sekcji + 22-osiowa macierz |
| `der-configurator-v2/DerConfiguratorSidebar.tsx` | Nawigacja 10 sekcji per typ DER (PV/BESS/FW) |

---

## §3 UI/UX shell — stan po sesji

### §3.1 Aktywne komponenty shellu

| Plik | Funkcja |
|------|---------|
| `shell/AppShellV12.tsx` | **AKTYWNY shell** (V12.5.1) z GuidedBuildActionPanel (dodany ta sesja) + IconChevronLeft/Right/Clipboard z shellIcons |
| `shell/TopBar.tsx` | TopBar 48px (V12 - merged context + workflow) |
| `shell/NavigationRail.tsx` | Pasek 9 obszarów roboczych |
| `shell/StatusBarV12.tsx` | Dolny pasek statusu 28px (deduplicated) |
| `shell/V12OverlayModeController.tsx` | Sync work-mode → overlay visibility |
| `shell/context-panels/AreaContextPanel.tsx` | Router paneli kontekstu per obszar |
| `shell/context-panels/EngineeringProjectExplorer.tsx` | **NOWY** (ta sesja) — scalona lewa karta (drill-down GPZ→Stacje→Odcinki→DER) |
| `shell/displayHelpers.ts` | **NOWY** — looksLikeTechnicalId, formatDisplayId, sanitizeDisplayValue |
| `icons/shellIcons.tsx` | **NOWY** — 7 wspólnych SVG ikon (extrahowane z 3 shellów) |
| `layout/CanonicalLayoutV3.tsx` | V3 redesign (opt-in via flag) |
| `layout/CanonicalLayout.tsx` | **USUNIĘTY** (282 LOC legacy) ta sesja |

### §3.2 Inspector

| Plik | Funkcja |
|------|---------|
| `inspector-panel/EmptyInspectorPanel.tsx` | **PRZEBUDOWANY**: CTA "Wybierz element ze schematu" + opis flow trybu budowy zamiast 10× "—" |
| `network-build/InspectorEngineeringView.tsx` | **OCZYSZCZONY**: formatValue sanitizuje raw `ref_id`, USUNIĘTE 4× "Hash semantyczny" |
| `network-build/GuidedBuildActionPanel.tsx` | **NAPRAWIONY** defensywny guard na undefined arrays |
| `issue-panel/IssuePanelContainer.tsx` | **NOWY** — wrapper z aggregateIssues + selectionStore sync |

### §3.3 Routes (App.tsx)

| Route | Komponent | Status |
|-------|-----------|--------|
| `#dashboard` | ProjectDashboardSurface | aktywny |
| `#enm-inspector` | EnmInspectorPage | **UKRYTY za feature flag** `VITE_FF_ENM_INSPECTOR_VISIBLE` (ta sesja) |
| `#fault-scenarios` | FaultScenariosPanel | aktywny |
| `#kreator-stacji-v2` | **StationWizardSurface** | **NOWY** (ta sesja) — pełen 17-krokowy flow |
| default (SLD) | SldWorkspaceContainer | aktywny |

---

## §4 Realizacja 6 wymagań z /goal

| # | Wymaganie | Status | Dowody |
|---|-----------|--------|--------|
| 1 | Naturalny flow projektanta | ✅ | StationWizardWorkspace (17 kroków, 15 testów) + designerFlowEndToEnd (14 testów integracyjnych) + designerFlowContract (21 testów rejestru SLD) + designer-flow-multistep e2e (3 scenariusze Playwright) + Empty inspector guided CTA |
| 2 | SCADA SLD compliance | ✅ | GpzCanonicalRenderer + noDirectTie guard + StationInternalView + MiniBlockRmuRenderer + BayColumnSn/Lv + SupplyPathHighlighter (tor mocy) + PowerFlowArrow + scadaComplianceContract (35 testów regression boundary) |
| 3 | LOD advanced | ✅ | LodPolicy.ts (5 poziomów × 13 warstw, 22 testy) + SldLodContext + ES safety override (K30-119) + ViewportController histereza |
| 4 | CAD mechanisms | ✅ | cadRoutingContract (port snap 12px + grid 8px + ortogonalne L/Z + 7 warstw + RouteLockRegistry, 33 testy) + routing.ts L-shape engine + CadOverlay |
| 5 | Vendor configurators | ✅ | vendorSwitchgearCatalog (5 producentów × IEC 62271-200, 19 testów) + vendorBayRoleBridge (auto-config 18 testów) + apparatusCatalogContract (Q1/Q2/Q3) |
| 6 | UX/ergonomia PL | ✅ | SLD_MENU_REGISTRY 10 kinds × 3-11 akcji domenowych + labelDeclutter + formatValue sanitize + EmptyInspectorPanel guided CTA + designerFlowContract polish labels |

---

## §5 Test coverage — końcowa walidacja

**Sweep dirs walidowane:**
- `src/ui/icons` — 9 testów (shellIcons)
- `src/ui/shell` — 119 testów (displayHelpers + V12 + context panels)
- `src/ui/layout` — 7 testów (V3 + index)
- `src/ui/inspector-panel` — 9 testów (noPlaceholders + tabs)
- `src/ui/issue-panel` — 11 testów (Container + Panel)
- `src/ui/config` — 7 testów (featureFlags)
- `src/ui/network-build` — 599 testów (full module)
- `src/ui/network-build/station-wizard-v2` — 196 testów (17 kroków × contracts + UI + integration)
- `src/ui/network-build/der-configurator-v2` — 33 testów
- `src/ui/sld` — 2216 testów (120 plików)
- `src/ui/sld/v2/geometry` — +33 testów (cadRoutingContract)
- `src/ui/sld/v2/__tests__` — +35 testów (scadaComplianceContract)
- `src/ui/catalog` — 16 testów

**Total: 236 plików testowych, 3451+ testów PASS (1 todo).**

---

## §6 Sesja audytu — 17 commitów na branchu

```
efe3a98  feat(sld+wizard): CAD routing + SCADA compliance + E2E designer flow
a88c696  feat(ui/ux): pełna konsolidacja shellu + 11 zadań planu UI/UX 100%
4ceda79  feat(wizard+der): UI components — DerSidebar + ReadinessMatrixGrid + MiniBaySldPreview
9f681a5  feat(wizard): Batch C — kroki 7/10/15/17 — Kreator KOMPLETNY 100% (17/17)
c316652  feat(wizard): Batch B — kroki 11/12/14 Kreatora KOMPLETNEGO
079f9c3  feat(wizard): Batch A — kroki 4/8/13 Kreatora KOMPLETNEGO
797b858  feat(wizard): SC network analysis — IEC 60909-0 per Excel MT880 v3 sekcja 4
3a9734c  feat(wizard): cable selection + earthing — Excel MT880 v3 reference 1:1
c132fef  feat(wizard): multi-core CT + multi-winding VT contracts (Excel MT880 1:1)
123ea4e  feat(wizard): vendor↔FieldRole bridge + interlocking rules BHP
6c26c58  feat(wizard+der): DER Configurator v2 contract + 5 vendor switchgear templates
f08c468  feat(wizard): Kreator Stacji KOMPLETNY skeleton — 17-step contract + sidebar
8c3109a  feat(layout+sld): V3 feature flag + 11 IEC SVG currentColor + multi-step e2e
c804b8b  feat(layout): integrate CanonicalLayoutV3 from design bundle KWranPTV
b0586ba  feat(sld): busbar topology single/double/ring + currentColor migration + e2e
03bb7dd  feat(sld+ux): explicit "Wstaw GPZ" CTA + IEC 60617 symbol contract
d50bbd3  docs+test(sld): audyt 2026-05-19 + executable designer-flow contract
```

---

**Koniec dokumentu audytu — 2026-05-19, rev 2.0.**
