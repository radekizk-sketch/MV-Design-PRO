# SLD CAD/SCADA — kanon przebudowy

**Status:** kanoniczny dokument przebudowy SLD MV-DESIGN-PRO
**Wersja:** v1.0
**Branch:** `claude/sld-architecture-redesign-ufa8Q`
**Powiązane:** [`docs/audits/SLD_REBUILD_CAD_SCADA_AUDIT.md`](../../../docs/audits/SLD_REBUILD_CAD_SCADA_AUDIT.md), [`SLD_SYMBOL_LIBRARY.md`](SLD_SYMBOL_LIBRARY.md), [`SLD_LAYOUT_ENGINE.md`](SLD_LAYOUT_ENGINE.md), [`SLD_LOD_AND_LAYERS.md`](SLD_LOD_AND_LAYERS.md), [`SLD_PORTS_AND_ENDPOINTS.md`](SLD_PORTS_AND_ENDPOINTS.md), [`STATION_INTERNAL_SLD.md`](STATION_INTERNAL_SLD.md), [`STATION_CONFIGURATOR_UIUX.md`](STATION_CONFIGURATOR_UIUX.md), [`DER_PV_BESS_FW_CONFIGURATOR.md`](DER_PV_BESS_FW_CONFIGURATOR.md), [`CALCULATION_READINESS.md`](CALCULATION_READINESS.md)

---

## 1. Cel i zakres

SLD jest osią produktu MV-DESIGN-PRO. Ten dokument definiuje, jak ma wyglądać i działać docelowo, niezależnie od bieżącego stanu kodu. Stan kodu doganiania ten dokument przez kolejne PR-y opisane w audit-doc.

Kanon obejmuje:
- model wizualny (klasa CAD/SCADA, dark, przemysłowy, IEC),
- model interakcji (klik / dwuklik / hover / pan / zoom / kontekst / komenda),
- strukturę warstw i LOD,
- granice odpowiedzialności (renderer ≠ inspekcja ≠ overlay ≠ domena),
- kontrakty prezentacji wartości (zakaz `0.00` z `null/undefined/NaN`).

Kanon NIE definiuje fizyki ani solverów. Solvery są nietykalne (`AGENTS.md §2`).

---

## 2. Cele jakościowe (acceptance „klasa narzędzia inżynierskiego")

1. **Hierarchia czytelna na pierwszy rzut oka.** Tory elektryczne dominują, aparaty są drugorzędne wizualnie, pomiary są warstwą włączaną.
2. **Powtarzalny rytm.** Pola w polu, stacje na magistrali — równe odstępy zgodne z `IndustrialAesthetics.ts` (`GRID_BASE=20`, `GRID_SPACING_MAIN=280`, `OFFSET_POLE=60`).
3. **Stabilna geometria.** Stan aparatu, zaznaczenie, zmiana overlay-a, otwarcie panelu — nie zmieniają world coordinates ani anchorów.
4. **Cisza wizualna.** Brak danych nie generuje tekstu. `0.00` nie pojawia się w miejscu nieobliczonej wartości.
5. **Klasa CAD.** Pan/zoom kursor-anchored, snap do siatki, prowadnice, ortogonalne linie, kanały Y dla magistrali / odgałęzień / pierścieni.
6. **Klasa SCADA.** Widoczne stany aparatów (zielony/czerwony/szary/alarm), warstwa wyników, wyróżnienie alarmów, ścieżki naprawy.
7. **Język inżyniera.** Polski aktywny UI bez tokenów technicznych (zakaz: migawka, uruchomienie, przypadek, run, snapshot, feeder, branch, case, wizard, fallback, legacy).

---

## 3. Zakaz „0.00 spam" (BINDING)

### 3.1 Reguła

Brak danych NIGDY nie jest renderowany jako `0.00 A`, `0.00 W`, `0.00 var`. Brak danych jest renderowany jako:

| Sytuacja | Forma krótka (SLD) | Forma długa (inspector) |
|---|---|---|
| brak wartości | `—` | `brak danych` |
| brak obliczeń (jawny status) | `—` | `brak obliczeń` |
| wynik częściowy | `<wartość> cz.` | `<wartość> (wynik częściowy)` |
| wynik błędny | `bł.` | `wynik błędny` |
| nie dotyczy | `n.d.` | `nie dotyczy` |
| obliczenia w toku | `…` | `w toku` |
| wartość 0 z statusem `ok` | `0,00 A` | `0,00 A` |

### 3.2 Kontrakt techniczny

Cały frontend używa `formatPolishValue` (i helperów `formatCurrent`, `formatVoltage`, `formatActivePower`, `formatReactivePower`, `formatApparentPower`, `formatLengthKm`, `formatPercent`, `formatFrequency`) z `ui/shared/formatPolishValue.ts`. Bezpośrednie `(value ?? 0).toFixed(...)` w komponentach prezentujących wartości inżynierskie jest zabronione.

Test kontraktowy: `src/ui/shared/__tests__/formatPolishValue.test.ts` (30 testów obejmujących cross-product status × value × placeholder × jednostka).

Test guarda: `src/ui/__tests__/no-zero-spam.test.ts` skanuje pliki UI i raportuje wzorce `(... ?? 0).toFixed(2)` jako blocking violation.

### 3.3 Migracja istniejących `formatNumber`

Istniejące lokalne `formatNumber` w `ReferencePatternsPage.tsx`, `TypeLibraryBrowser.tsx`, `EnmDiffView.tsx`, `CaseCompareView.tsx` zostają zachowane (nie regresują) — w kolejnym PR-1.x zostaną zmigrowane na `formatPolishValue`.

---

## 4. Architektura warstw

```
┌──────────────────────────────────────────────────────────────────┐
│  Powłoka aplikacji (V12 AppShell — istniejąca)                   │
│   • NavigationRail + AreaContextPanel + Inspector + StatusBar    │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  SldWorkspace                                                    │
│   • SldViewportController       — pan/zoom/fit/center            │
│   • SldLayerManager             — warstwy widoczności            │
│   • SldLodService               — LOD 0..4                       │
│   • SldSelectionService         — single/multi/hover/hit-test    │
│   • SldCommandService           — menu kontekstowe + akcje       │
│   • SldOverlayHost              — overlay-y wynikowe             │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  SldRender                                                       │
│   • SldSymbolLibrary            — autorskie SVG + state→style    │
│   • Renderery: bus / bay / station / line / der                  │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  SldGeometry  (czysto geometryczne)                              │
│   • LayoutResult (auto-layout deterministyczny)                  │
│   • GeometryOverrides (delty użytkownika, addytywnie)            │
│   • EffectiveLayout = LayoutResult ⊕ Overrides                   │
└──────────────────────────────────────────────────────────────────┘
        ▲
        │
┌──────────────────────────────────────────────────────────────────┐
│  SldDomainAdapter (TylkoOdczyt z ENM)                            │
│   • TopologyAdapterV2, StationBlockBuilder, BayDeviceMapper      │
│   • PortResolver (PR-3)                                          │
└──────────────────────────────────────────────────────────────────┘
        ▲
        │
┌──────────────────────────────────────────────────────────────────┐
│  ENM — single source of truth (frozen)                           │
└──────────────────────────────────────────────────────────────────┘
```

Reguła: Render zna tylko Geometry. Geometry zna tylko DomainAdapter. DomainAdapter zna tylko ENM.

---

## 5. Tryb pracy: budowa modelu

Pełny scenariusz w [`STATION_CONFIGURATOR_UIUX.md`](STATION_CONFIGURATOR_UIUX.md). Skrót:

| Krok | Punkt startu | Akcja użytkownika | Efekt |
|---|---|---|---|
| 0 | pusty projekt | „Wstaw główny punkt zasilania” | tworzy GPZ + rozdzielnię SN + szynę |
| 1 | szyna SN GPZ | „Dodaj pole SN” | pole z aparaturą minimalną |
| 2 | pole SN | „Wyprowadź ciąg główny” → wybór rodziny (kabel SN / linia napowietrzna SN) | endpoint A = port pola, endpoint B = ghost |
| 3 | odcinek | „Wstaw stację transformatorową” | dzieli odcinek end-to-end, dodaje stację z portami |
| 4 | stacja | „Otwórz konfigurator stacji” | inspector z 11 zakładkami |
| 5 | stacja | „Rozpocznij odgałęzienie” | tworzy/wskazuje pole odgałęzienia, nowy odcinek |
| 6 | stacja / pole / szyna nN | „Dodaj PV/BESS/FW” | obiekt DER + port, karta z FRT/HVRT/zgodność |
| 7 | całość | uruchom obliczenia | UI nigdy nie fałszuje wyników; brak modułu → status „brak modułu obliczeniowego” |

Reguły bezwzględne:
- Nie wolno wyprowadzić odcinka bezpośrednio z szyny GPZ. Tylko z pola SN.
- Nie wolno wyprowadzić odcinka z abstrakcyjnej ikony stacji. Tylko z pola stacji.
- Każdy normalny odcinek ma `endpointA: PortRef` i `endpointB: PortRef`.

---

## 6. Interakcje (skrót)

| Wejście | Element | Akcja |
|---|---|---|
| LMB pojedynczy | każdy obiekt | zaznaczenie + sync drzewo + sync inspector |
| LMB dwuklik | GPZ | otwiera kartę „Główny punkt zasilania” |
| LMB dwuklik | pole SN | konfigurator pola |
| LMB dwuklik | stacja | wewnętrzny SLD stacji |
| LMB dwuklik | transformator | karta transformatora SN/nN |
| LMB dwuklik | PV / BESS / FW | konfigurator źródła |
| LMB dwuklik | kabel/linia | edycja parametrów odcinka |
| RMB | każdy obiekt | menu kontekstowe (zależne od obiektu i stanu) |
| MMB drag | kanwa | pan |
| Scroll | kanwa | zoom kursor-anchored |
| Spacja | kanwa | center selected |
| Ctrl+0 | kanwa | fit-to-view |
| Esc | aktywne narzędzie | wyjście z trybu rysowania |

Hover: tooltip techniczny, nie zasłania aparatury, znika po 200 ms bez ruchu.

---

## 7. Granica fizyki

Solver fizyki: `backend/src/network_model/solvers/` (IEC 60909, NR/GS/FD power flow). **Nie zmieniamy.**

Frozen Result API: `ShortCircuitResult`, `PowerFlowResult` — odczytywane wyłącznie read-only.

Brak modułu obliczeniowego (stabilność, FRT/HVRT, zgodność przyłączeniowa NC RfG): UI pokazuje status „brak modułu obliczeniowego”, schemat danych jest przygotowany, wynik nie jest fabrykowany.

---

## 8. Lista PR-ów

PR-0 … PR-14 — patrz `docs/audits/SLD_REBUILD_CAD_SCADA_AUDIT.md §5`.

PR-0 (ten) dostarcza: audit-doc, kanoniczne docs, formatter `formatPolishValue` + testy.

---

## 9. Kryteria odbioru rebuild-u (DoD całości)

Kanon uznajemy za wdrożony, gdy spełnione są wszystkie punkty z `docs/audits/SLD_REBUILD_CAD_SCADA_AUDIT.md §10`.

**Koniec dokumentu.**
