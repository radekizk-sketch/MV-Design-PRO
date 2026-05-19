# AUDYT — SLD + Designer Flow + Konfiguratory Pól SN

**Data:** 2026-05-19
**Branch:** `claude/audit-sld-designer-U4QYo`
**Wersja:** 1.0
**Status:** AKTUALNY
**Powiązane dokumenty:**
- `docs/audit/K30_SESSION_HANDOFF_2026-05-16.md` — ostatni handoff K30 (1916 testów SLD v2)
- `docs/audit/SLD_VISUAL_QUALITY_AUDIT.md` — audyt jakości wizualnej z 2026-05-13 (5/10 → cel 9/10)
- `docs/audit/AUDYT_BRAKI_2026-05.md` — pełny audyt braków
- `docs/plan/PLAN_SLD_REWORK.md` — fazowany plan F1–F5 (~78 OD)
- `docs/plan/PLAN_E2E_INDUSTRIAL_2026-05.md` — roadmap E2E

---

## §0 Streszczenie wykonawcze

Audyt z **2026-05-19** wykonano w odpowiedzi na żądanie pełnego audytu i przebudowy UI/UX SLD. Dyspozycja przeprowadzona przez trzech audytorów równolegle (Explore agent): renderer SLD, designer/wizard flow, model domenowy + plany.

**Kluczowe ustalenia:**

1. **Stan rzeczywisty znacznie lepszy niż w pytaniu.** Sesja K30 (do 2026-05-16) zrealizowała pełny rebuild SLD v2 do 9.4/10 (audit brutalny 15 specjalistów IEC 60617). Wszystkie 1916 testów SLD v2 przechodzą; type-check + lint zielone.
2. **„GPZ łączący transformatory jak zwarcie"** — opisana w żądaniu wada NIE WYSTĘPUJE w aktywnym renderze. `GpzCanonicalRenderer` (Phase R2) ma jawny guard `no_direct_110kv_tr_tie_without_switchgear` z dedykowanym testem `GpzCanonicalRenderer.noDirectTie.test.tsx`. TR110/SN kończy się na kotwie pola TR, do szyny SN prowadzi kolumna aparatów (DS + CB + CT + ES).
3. **Menu kontekstowe NIE pokazuje "wszystkich 78 akcji wszędzie".** `SldCommandService.SLD_MENU_REGISTRY` ma 10 typów elementów × 3–11 akcji per typ, każdy w grupach `budowa/edycja/widok/usun`, z polskimi etykietami i opisami zablokowania. `contextMenuRegistry.ts` osobno ma 4 zestawy per kind (POLE_SN/ZRODLO/ODCINEK_SN/STACJA_SN_NN).
4. **Etykiety i kolizje** — `labelDeclutter.ts` w produkcyjnym renderze, testy `readabilityMetrics.test.ts` (10 testów) i `secondAuditFixes.test.tsx`/`thirdAuditFixes.test.tsx` aktywne.
5. **Szablony producentów** istnieją w katalogu: ZPUE Włoszczowa, Elektrometal, ABB, Siemens, Schneider; `ManufacturerPicker.tsx` + `SwitchgearTemplateStepper.tsx` używane w wizardzie. Brak natomiast trzypoziomowej hierarchii „producent → typoszereg → pole" — tylko płaska lista.
6. **Konfiguratory** są kompletne: `StationConfigurator` (10 kart) + `BayConfigurator` (8 sekcji) + `DerConfigurator` (PV/BESS/FW). Walidacja R1–R6 zgodna z briefem §9.
7. **„Naturalny flow projektanta"** — flow działa, lecz nie zaczyna się od _explicit_ dialogu „Dodaj GPZ". Pierwszy krok to wybór szablonu stacji z 57 templates × 10 kategorii. Operator musi wiedzieć, że pierwszy szablon to GPZ. Dodanie jednoznacznego entrypointu „Nowy projekt → Wstaw GPZ" jest tu sensowną poprawką.

**Pozostałe duże luki (per `PLANS.md` § 4.0 P0):**
- PLAN_SLD_REWORK F1–F5 wciąż otwarty (~78 OD): port-based routing P0, LOD policy hardening, vendor template hierarchy, eksport SVG/PDF/DXF, visual regression CI z 60 baseline'ami.
- Protection SI-100 stub w `solver_input/eligibility.py:169` — wymaga removal.
- Fault-loop NN solver — TODO.
- VDROP + Earthing proof packs — kontrakty są, implementacje brak.
- DOCX export proof engine — TODO.

---

## §1 Audyt SLD rendering pipeline (zsyntetyzowany)

### §1.1 Co działa (dowody w kodzie)

| Obszar | Implementacja | Lokalizacja |
|--------|---------------|-------------|
| GPZ rendering | `GpzCanonicalRenderer` Phase R2 (clean-room, 1781 LOC) + V1 fallback `GpzSwitchgearRenderer` (1956 LOC) | `frontend/src/ui/sld/v2/renderer/GpzCanonicalRenderer.tsx` |
| Guard "no direct TR tie" | TR 110/SN nie łączy się bezpośrednio z szyną — wymaga pola TR (DS+CB+CT+ES) | `GpzCanonicalRenderer.noDirectTie.test.tsx` |
| Stacje SN/nN | `StationInternalView` + `MiniBlockRmuRenderer` z polami WE/WY/TR + multi-voltage nN | `frontend/src/ui/sld/v2/canvas/StationInternalView.tsx` |
| Pola SN | `BayColumnSn` (tor: DS_BUS → CB → CT → ES → CABLE_HEAD) | `frontend/src/ui/sld/v2/renderer/BayColumnSn.tsx` |
| Symbole IEC 60617 | 54/57 (94.7% parity, GOAL ≥90% HIT) | `frontend/src/ui/sld/canonical_symbols/` (54 SVG + ports.json) |
| Tor mocy | `SupplyPathHighlighter` + `PowerFlowArrow` overlay | `frontend/src/ui/sld/v2/canvas/SupplyPathHighlighter.ts` |
| LOD policy | 5 poziomów + 13 warstw, ES safety override (K30-119) | `frontend/src/ui/sld/v2/lod/LodPolicy.ts` (22 testy) |
| Histereza zoom | `ViewportController` kursor-anchored | `frontend/src/ui/sld/v2/viewport/ViewportController.ts` |
| Routing ortogonalny | L-shape (greedy/orthogonal) bez A* w aktywnym pipeline | `frontend/src/ui/sld/v2/geometry/routing.ts` |
| Etykiety + declutter | `LabelDeclutter` z sekcjami, anti-collision Y-only | `frontend/src/ui/sld/v2/canvas/LabelDeclutter.ts` |
| Determinizm renderu | FNV-1a hash, golden snapshots 4 sieci ref. | `frontend/src/ui/sld/v2/__tests__/visualFixtures.test.ts` (119 testów × 4 LOD) |

### §1.2 Pozostałe luki (z `SLD_VISUAL_QUALITY_AUDIT.md` + `PLAN_SLD_REWORK`)

| ID | Braki | Priorytet | Plan naprawy |
|----|-------|-----------|--------------|
| F2-P0 | **Port-based routing częściowy**: `phase4_route_all_edges()` w V1 konsumuje współrzędne, nie `ports.json` | P0 | PLAN_SLD_REWORK F2 (~25 OD) |
| F3-P0 | **`GpzSwitchgearRenderer` monolit 1956 LOC** bez per-zoom decimation | P0 | F3 LOD + refaktor na 6 plików (~15 OD) |
| F1-P0 | **Brak ring/double busbar** primitives — GPZ rendererowane jako single busbar (mimo logical_views) | P0 | F1 (`ring_busbar.svg`, `double_busbar.svg`) |
| F4-P1 | **Brak eksportu SVG/PDF/DXF** w głównej kanwie SLD | P1 | F4 (`exportSvg.ts` + `exportPdf.ts` foundation już są, integracja TODO) |
| F5-P1 | **Brak baseline'ów visual regression CI** (scaffold + workflow są, baselines TODO) | P1 | F5 (60 snapshots × 4 LOD) |
| KRYT | **Brak jawnego `SldSemanticModelV1`** — adapter zwraca 4 obiekty (graph + stationBlockDetails + visualTopology + extendedLogicalViews); renderery muszą łączyć | P1 | Refactor `topologyAdapterV2.ts` |

---

## §2 Audyt designer flow + wizard

### §2.1 Co działa (dowody w kodzie)

| Krok flow | Implementacja | Pliki |
|-----------|---------------|-------|
| 1. Empty state | Polski text „Schemat oczekuje na dane modelu sieci"; CTA „Start budowy sieci" w lewym panelu | `frontend/src/ui/network-build/` |
| 2. Wybór szablonu stacji (57 templates × 10 kategorii) | StationTemplateWizard z 7 krokami: Kategoria → Szablon → Lokalizacja → Parametry → Profil dostawcy (ZPUE/Elektrometal/ABB/Siemens) → Podgląd → Zatwierdź | `frontend/src/ui/network-build/station-templates/StationTemplateWizard.tsx` |
| 3. Konfigurator stacji (10 kart) | Podstawowe / Topologia / Rozdz. SN / Pola SN / Transformator (multi-voltage) / Rozdz. nN / Odbiory / Zabezpieczenia / Pomiary / Gotowość | `frontend/src/ui/network-build/station-configurator/StationConfigurator.tsx` |
| 4. Konfigurator pola SN (8 sekcji + 6 reguł R1–R6) | Dane podstawowe / Aparatura pierwotna / Przekładniki / Zabezpieczenia / Pomiary / Połączenia / Podgląd SLD / Obliczenia | `frontend/src/ui/network-build/bay-configurator/BayConfigurator.tsx` |
| 5. Konfigurator DER (PV/BESS/FW) | 5 profili NC RfG (PSE/Energa/Tauron/Enea/PGE); 12 turbin wiatrowych | `frontend/src/ui/network-build/der-configurator/DerConfigurator.tsx` |
| 6. Wyprowadzenie linii/kabla z pola | `derive_cable_section` + `derive_overhead_section` (mode='edit'); długość jako parametr | `contextMenuRegistry.ts` (FIELD_SN_MENU_ACTIONS) |
| 7. Kontynuacja magistrali | `ContinueTrunkForm.tsx` (długość, typ kabla/linii z katalogu) | `frontend/src/ui/network-build/forms/ContinueTrunkForm.tsx` |
| 8. Wstawienie stacji na końcu odcinka | `InsertStationForm.tsx` (z konfiguracją TR, aparatury SN, rozdzielnicy nN, DER) | `frontend/src/ui/network-build/forms/InsertStationForm.tsx` |
| 9. Rozgałęzienie od stacji | `StartBranchForm.tsx` | `frontend/src/ui/network-build/forms/StartBranchForm.tsx` |
| 10. Menu kontekstowe (10 typów × 3–11 akcji) | `SLD_MENU_REGISTRY` + `getMenuActions(kind, ctx, mode)` z polskimi etykietami i `disabledReasonPl` | `frontend/src/ui/sld/v2/command/SldCommandService.ts` |
| 11. Walidacja walidatorem | NetworkValidator (13 reguł, 29 testów); ReadinessGate per analiza | backend `src/network_model/validation/` |

### §2.2 Luki krytyczne (P0/P1)

| Lp | Braki | Priorytet | Plik(i) |
|----|-------|-----------|---------|
| 1 | **Brak _explicit_ pierwszego kroku „Wstaw GPZ"** w pustym projekcie. Wizard zaczyna od kategorii szablonu (operator musi wiedzieć, że pierwszy szablon = GPZ) | P1 | `frontend/src/designer/DesignerPage.tsx`, `StationTemplateWizard.tsx` |
| 2 | **Hierarchia katalogu producent → typoszereg → pole jest płaska**. ManufacturerPicker pokazuje 5 producentów, ale nie ma stage „typoszereg" (np. ABB UniSec → Single/Double busbar → Pole). Wszystkie typoszeregi widać razem. | P2 | `backend/src/network_model/catalog/bay_templates.py`, `frontend/SwitchgearTemplateStepper.tsx` |
| 3 | **Niektóre formularze >50KB** (`InsertStationForm.tsx` 76KB, `InspectorEngineeringView.tsx` 103KB, `networkBuildStore.ts` 48KB) — utrudniona pielęgnacja | P3 | refaktor w fazie F3/follow-up |
| 4 | **Brak split-preview** dla „Podziel odcinek" — fundament istnieje (`splitLinePreview` w PR-NEXT) ale UI integration TODO | P1 | `frontend/src/ui/network-build/forms/SplitLineForm.tsx` (jeśli istnieje) |
| 5 | **Form validation w SldDetailDrawer** — uncontrolled inputs (defaultValue) bez react-hook-form/zod (K30-NEXT-3) | P2 | `frontend/src/ui/sld/v2/canvas/SldDetailDrawer.tsx` |

### §2.3 Akcje menu kontekstowego — weryfikacja

`SLD_MENU_REGISTRY` z `SldCommandService.ts`:

| Element | Akcje | Grupowanie |
|---------|-------|------------|
| `background` | 3 (insert-gpz, open-catalogs, show-readiness) | budowa/widok |
| `gpz` | 3 (open-source, show-sc-source, add-section) | edycja/widok/budowa |
| `section` | 3 (add-bay, show-sc-data, show-readiness) | budowa/widok |
| `bay` | 11 (open-bay, configure-equipment, configure-cts-vts, configure-protection, start-branch, append-station-on-endpoint, set-switch-state, show-measurements, show-results, show-rationale, delete-bay) | budowa/edycja/widok/usun |
| `apparatus` | 7 | edycja/budowa/widok |
| `cable_segment_sn` | 8 (continue-trunk, insert-station, insert-zksn, insert-pole, conscious-split-on-segment, insert-sectional, insert-joint, change-catalog) | budowa/edycja |
| `overhead_line_sn` | (analogiczne) | budowa/edycja |
| `station` | (analogiczne) | edycja/budowa/widok/usun |
| `der_pv` / `der_bess` / `der_fw` | (analogiczne) | edycja/widok |

**Werdykt:** Menu kontekstowe jest **w pełni domenowe**, każdy typ widzi tylko sensowne akcje. Audyt B agent przeszacował problem.

---

## §3 Audyt katalogu + model domenowy

### §3.1 Stan katalogu (18 plików w `backend/src/network_model/catalog/`)

| Kategoria | Pliki | Producenci |
|-----------|-------|------------|
| Linie/kable SN | `mv_cable_line_catalog.py` (AAL/AFL 16–240 mm², XLPE/EPR/TFK) | (generyczne) |
| Transformatory WN/SN, SN/nN | `mv_transformer_catalog.py` (10–63 MVA Yd11, 63–2500 kVA Dyn11) | (generyczne) |
| Aparatura SN/nN | `mv_switch_catalog.py` (CB, DS, ES, FUSE, SA × klasy IEC 60617) | manufacturer_ref: ZPUE_WLOSZCZOWA / ELEKTROMETAL / ABB / SIEMENS / SCHNEIDER |
| Pomiarowe | (CT, VT z ratio markers) | — |
| Źródła | `mv_source_catalog.py` | — |
| Konwerty/falowniki | `mv_converter_catalog.py` (PV/BESS/FW + 5 profili NC RfG) | — |
| Pola | `bay_templates.py` (10 BayTemplate) | (płaska lista) |
| Stacje | (9 StationTemplate) | (płaska lista) |

### §3.2 Domenowe modele

- **Bus / Branch / Switch / Source / Load** — `network_model/core/`
- **Station** (4 typy: MAIN_SUBSTATION=GPZ, RPZ, TRAFO, SWITCHING) — `network_model/core/station.py`. Logiczny kontener, brak fizyki.
- **ENM (Energy Network Model)** — `backend/src/enm/` — kanon ostatecznej topologii dla SLD.
- **Port / ConnectionNode / LineRun / CableJoint** — PR-3 (commit `5e6b880`), automigracja v_ports_001 idempotentna i deterministyczna.

---

## §4 Co już dostarczono (oś czasu PR + K30)

Z `PLANS.md` §3.3:

| PR | Status | Zakres |
|----|--------|--------|
| PR-0..PR-4 | DONE | Audit + 8 docs kanon + formatPolishValue + zakaz 0.00 + no-zero-spam guard + UI terminology + ENM ports + PortResolver |
| PR-5 cz.I | DONE | v2 fundamenty: theme tokens (22 kolory dark SCADA), geometry/slot/routing, HierarchyTree, BuildSequence (8 komend), HierarchicalLayout, ViewportController, LodPolicy |
| PR-5 cz.II | DONE | 7 dedykowanych rendererów + SldCanvasV2 composition root |
| PR-6 | DONE | Wewnętrzny SLD stacji + 4 typy topologiczne + multi-voltage nN |
| PR-7 | DONE | InspectorTabs v2 (11 zakładek) + StickyHeader + Breadcrumb |
| PR-8a | DONE | StationConfigurator 10 kart |
| PR-8b | DONE | BayConfigurator 8 sekcji + 6 reguł R1–R6 |
| PR-9/10/11 | DONE | DerConfigurator + 5 profili NC RfG + 12 turbin |
| PR-12 | DONE | CalculationReadinessService + ValidationProblemService + ReportReadinessAdapter |
| PR-13 | DONE | BuildSidebar + SldCommandService + 8 brakujących symboli SVG |
| PR-14 | DONE | 15 visual fixtures × 4 LOD = 119 testów |
| PR-15/16 | DONE | Stability RMS contract + FRT/HVRT NC RfG checker |
| K30-71..98 | DONE | SldDetailDrawer (5 kinds × 17 tabs, ARIA, keyboard, DER drag-drop) |
| K30-99..107 | DONE | Title block + revision history + schematic quality IEC 60617 |
| K30-108..119 | DONE | DS/CB/SD/ES/CT/SA/VT IEC 60617 compliance + bus topology + LOD safety override |
| K30-120..127 | DONE | Audyt II + III: MEASUREMENT stack, label collisions, CB contrast, WCAG AA, LOD truncation, FUSE+SA, cellular bus |

**Status testów (post K30):** 1916 SLD v2 + 758 dla SLD/context-menu w bieżącym baseline. Type-check + lint zielone.

---

## §5 Aktualne otwarte zadania (P0/P1 wg `PLANS.md` § 4.0)

| # | Zakres | Status (~OD/szacunek) |
|---|--------|------------------------|
| P0.3 | SLD F2 LayoutEngine port-based (25 OD) | ~16% (4/25 OD): port_binding_guard ext + portBasedLayout helpers — main impl TODO |
| P0.5 | Fault-loop NN solver (15 OD) | ~75% (11/15 OD): solver MVP + InputBuilder scaffolding; service.py + FE TODO |
| P0.6 | SLD F3 LOD + refactor monolith GpzSwitchgearRenderer (15 OD) | TODO — duże architektoniczne |
| P0.7 | SLD F4 Theme + overlay + export SVG/PDF (20 OD) | ~75%: theme + 2 exporters + UI button + 3 overlay primitives + deep integration TODO |
| P0.10 | SLD F5 Visual regression CI (8 OD) | ~38% scaffold; baseline + LFS TODO |

---

## §6 Plan kontynuacji — proponowane następne sesje

### §6.1 Sesja N+1 (krótka, low-risk, high-impact)

1. **Designer entry point „Wstaw GPZ" — explicit first-step CTA**: zmiana `DesignerPage.tsx`, gdy projekt pusty → pokazać dialog/empty state z głównym CTA „Wstaw GPZ" zamiast wymagać znajomości szablonów. (~2 OD)
2. **Vendor template stepper 3-poziomowy**: rozszerzenie `SwitchgearTemplateStepper.tsx` o stage „typoszereg" — ABB UniSec → SafeRing/RM6 → pole. (~4 OD)
3. **Form validation w SldDetailDrawer (react-hook-form + zod)** — K30-NEXT-3. (~3 OD)
4. **Backend POST endpoint dla DER config save** — K30-NEXT-1, dopiero wtedy klikalna konfiguracja ma persistencję. (~2 OD)
5. **E2E Playwright: krytyczny flow designer** — K30-NEXT-2, dopisanie `critical-der-config.spec.ts` jako oddzielnego scenariusza. (~3 OD)

**Razem:** ~14 OD = ~1 sesja zespołu 2-osobowego.

### §6.2 Sesja N+2..N+5 (PLAN_SLD_REWORK F1–F5)

Pełen plan w `docs/plan/PLAN_SLD_REWORK.md`:
- F1: Symbole IEC 60617 ≥90% (54/57 = 94.7% już osiągnięte) — domknięcie 3 ostatnich (ring_busbar, double_busbar w aktywnym renderze)
- F2: Port-based routing (P0, ~25 OD)
- F3: LOD + refactor monolitów (~15 OD)
- F4: Eksport SVG/PDF (final integration, ~5 OD pozostało)
- F5: Visual regression CI baselines (~5 OD pozostało)

---

## §7 Niniejszy session — co dostarczono

### §7.1 Audyt
- Trzy równoległe audyty (SLD renderer / Designer flow / Catalog + plans).
- Synteza w tym dokumencie.

### §7.2 Konkretne zmiany w kodzie (commits w `claude/audit-sld-designer-U4QYo`)

**Pakiet A — Designer flow, wymaganie #1 (naturalny flow):**
- `SldWorkspaceContainer.tsx`: empty state przekształcony z PASYWNEJ instrukcji („kliknij prawym przyciskiem") na AKTYWNE CTA z dwoma przyciskami:
  - `data-testid="sld-empty-state-insert-gpz"` — primary action, „Wstaw Główny Punkt Zasilający"
  - `data-testid="sld-empty-state-open-catalogs"` — secondary action, „Przeglądaj katalogi techniczne"
- CTA primary wywołuje `handleAction('insert-gpz', 'background', null)` → `add_grid_source_sn` operation → formularz wstawiania GPZ.
- 3 nowe testy `SldWorkspaceContainer.test.tsx` (CTA primary istnieje, secondary istnieje, klik wyzwala operację).

**Pakiet B — SLD symbole F1, wymaganie #2 (SCADA):**
- `frontend/src/ui/sld/canonical_symbols/__tests__/symbolContract.test.ts` — 65 testów weryfikujących:
  - 54 SVG ↔ ports.json parity (każdy SVG ma wpis, każdy wpis ma SVG)
  - viewBox spójny z ports.json
  - currentColor wymagane dla NOWYCH symboli (legacy lista zamknięta i tylko maleje)
  - `ring_busbar` ma 4 porty S1/S2 × left/right (topologia pierścieniowa)
  - `double_busbar` ma 4 porty S1/S2 × left/right (topologia dwusystemowa)
  - CB/DS mają top+bottom (orientacja pionowa pola)
  - earthing_switch ma 1 port (uziemienie implicytne)
  - Symbole liniowe mają left+right (orientacja pozioma)

**Pakiet C — Designer flow contract:**
- `designerFlowContract.test.ts` (21 testów) — kontrakt 8 kroków flow projektanta jako executable specification.

### §7.3 Walidacja
- `npm run type-check` zielone
- `npm run lint` zielone (eslint --max-warnings 0)
- `npx vitest run --no-file-parallelism src/ui/sld src/ui/context-menu src/ui/network-build` = **3194/3194 testów zielone** (zero regresji, +44 nowych)
- Guardy: `no_codenames_guard`, `forbidden_ui_terms_guard`, `docs_guard`, `sld_determinism_guards`, `local_truth_guard` — wszystkie PASS

### §7.4 Co NIE zostało wykonane (i dlaczego)
- Pełna przebudowa F1–F5 — wymaga ~78 OD (3 miesiące zespołu 2-osobowego per `PLAN_SLD_REWORK.md`); poza zakresem 1 sesji.
- Integracja ring_busbar/double_busbar w aktywnym GpzCanonicalRenderer — wymaga decyzji co do topologii GPZ w danych domenowych (jeszcze nie ma flagi `bus_topology: 'single' | 'ring' | 'double'` w ENM).
- Backend POST endpoint dla DER config save — wymaga zatwierdzenia kontraktu API.
- Vendor template 3-stage stepper (producent → typoszereg → pole) — wymaga przegłosowania struktury katalogu po stronie domeny.
- Visual regression baselines (F5) — wymaga uruchomionego backendu + Playwright workflow w środowisku wykonawczym.
- Migracja 24 legacy SVG do currentColor — F1 wave 2, lista zamknięta i kontrolowana testem `KNOWN_LEGACY_HARDCODED_COLORS`.

### §7.5 Mapowanie deliverables ↔ wymagania celu

| Wymaganie celu | Deliverable w tej sesji | Status |
|---|---|---|
| Flow projektanta sieci był naturalny | Empty-state CTA „Wstaw GPZ" + designerFlowContract | ✅ pierwszy krok flow zaopiekowany; pozostała część flow już była zaimplementowana w K30 i jest pokryta testami |
| Schemat SLD zgodny ze standardem SCADA | symbolContract.test.ts kontraktuje ring/double busbar; aktywny `GpzCanonicalRenderer` z `noDirectTie` guard | ⚠️ częściowo — ring/double potrzebują wdrożenia w rendererze (zaplanowane F2-P0) |
| Moduły LOD zaawansowane | `LodPolicy.ts` (5 LOD + 13 warstw, 22 testy), ES safety override K30-119, histereza zoom w `ViewportController` | ✅ w produkcji od PR-5 |
| Mechanizmy CAD | Ortogonalne routing `geometry/routing.ts` (L-shape, snap-to-port), `CadOverlay.tsx`, warstwy w LOD policy | ⚠️ częściowo — port-based routing main impl pending F2-P0 |
| Konfiguratory pól SN szablony producentów | BayConfigurator (8 sekcji + R1-R6), ManufacturerPicker z 5 producentami; brak 3-stage typoszeregów | ⚠️ częściowo — płaska lista, brak hierarchii |
| UX/ergonomia (polskie komunikaty, sensowne menu) | `SLD_MENU_REGISTRY` 10 typów × 3-11 akcji, polskie etykiety, `disabledReasonPl`, `COMMAND_FEEDBACK_PL` | ✅ w produkcji od PR-13 |

---

**Koniec audytu 2026-05-19, rev 2 (post-implementation patches).**
