# SLD GPZ Switchgear Depth (Phase 0A)

**Status:** BINDING (Phase 0A — refinement po 3 iteracjach audytu zespołu 13-osobowego)
**Wersja:** 3.0 (post-3rd-audit, 12 commitów wdrożeniowych)
**Pliki źródłowe:**
- `frontend/src/ui/sld/v2/renderer/GpzRenderer.tsx` (entry, decyzja delegacji)
- `frontend/src/ui/sld/v2/renderer/GpzSwitchgearRenderer.tsx` (full switchgear LOD ≥ 1)
- `frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts` (mapping ENM → renderer)
- `frontend/src/ui/sld/v2/theme/tokens.ts` (GPZ_GEOMETRY + paleta)

---

## 1. Reguła nadrzędna

GPZ NIE jest ikoną ani prostokątem 200×80. GPZ to **stacja elektroenergetyczna**:
- zasilanie 110 kV / ekwiwalent SEE,
- transformator(y) 110/SN,
- rozdzielnia SN z sekcjami,
- pola odpływowe SN,
- ewentualnie sprzęgła sekcyjne.

Renderer pokazuje minimalną poprawną strukturę inżynierską już od LOD 0. Na LOD ≥ 1 deleguje do `GpzSwitchgearRenderer`, który dodaje sekcje z faktycznymi polami i sprzęgłami.

To jest realizacja Acceptance Invariant nr 12 z planu.

## 2. Tryby renderingu

| LOD | Renderer | Co widać |
|---|---|---|
| 0 | `GpzCompactBlock` (legacy path) | Tor 110 kV → TR(1..N) → szyny SN(1..M) → odpływy SN(1..K). Geometria wynika z liczników. |
| ≥ 1 | `GpzSwitchgearRenderer` | + Faktyczne sekcje (`gpz_sections[]`) z polami SN (LINE_BAY/TRANSFORMER_BAY/MEASUREMENT_BAY/COUPLER_BAY) i sprzęgłami międzysekcyjnymi. Tor 110 kV → TR ponad sekcjami. |
| ≥ 3 | drill-down do `StationInternalView` | wewnętrzny pełen SLD GPZ (Phase 1+) |

## 3. Kontrakt `GpzCompactBlock` (LOD 0)

Wymagane:
- `name`, `voltageHighKv`, `voltageLowKv`.

Opcjonalne (z domyślnymi):
- `transformerCount` (≥1, domyślnie 1).
- `mvSectionCount` (≥1, domyślnie 1).
- `outgoingBayCount` (≥0, domyślnie `feedersCount` z ENM lub 4).
- `feedersCount` (z ENM, do wnioskowania `outgoingBayCount`).

Stany diagnostyczne (nieinwazyjne):
- `stale=true` → żółty badge "Wyniki nieaktualne — model uległ zmianie".
- `invalid=true` → czerwony badge "Konfiguracja GPZ jest niekompletna".

Geometria deterministyczna: rozmiar wynika z liczników (nie hardkod 200×80).

## 4. Symbol transformatora

IEC 60617 — dwa sprzężone okręgi. Stała geometria z `GPZ_GEOMETRY` w `theme/tokens.ts`:
- Promień: `GPZ_GEOMETRY.trRadius = 9` px (jednolite dla compact i switchgear).
- Odstęp uzwojeń: `GPZ_GEOMETRY.trWindingGap = 7` px.
- Y/Δ markery: `GPZ_GEOMETRY.trMarkerArmLen = 6` + `trMarkerStrokeWidth = 1.6`.
- Spacing TR-ów: `singleBusTrSpacing = 60` (HvTowerColumn) / `twoBusTrSpacing = 80` (TwoBusTrColumn).

Brak: linie skojarzonych zacisków, linie polaryzacji (Phase 1+ przy LOD 3).

## 5. Kontrakt `GpzSwitchgearRenderer` (LOD ≥ 1) — SCADA-grade

Wzorowane na ekranach dyspozytorskich SCADA SN/110 kV (operator-grade).

Wymagane:
- `sections: GpzSectionDescriptor[]` (z ENM `gpz_sections[]`).
- `couplers: GpzCouplerDescriptor[]`.

Każda sekcja:
- `sectionId` traceable do ENM `GPZSection.section_id`.
- `sectionLabel` (np. `"S1"`, `"S2"`) — kanoniczna nazwa wyświetlana nad szyną.
- `bays: GpzBayDescriptor[]` z `fieldRole`, `designation`, `hasMissingRequiredDevice`.
- Pozioma szyna główna SN biegnie przez wszystkie sekcje (single bus operator-grade).

Każde pole (`GpzBayDescriptor`):
- `bayNumber` (np. `"2"`, `"23/1"`) — wyświetlane pod kolumną.
- `feederName` (np. `"SADY"`, `"OKRĘŻNA"`) — wyświetlane w nagłówku.
- `energization`: `'energized' | 'deenergized' | 'tripped' | 'unknown'` — driver koloryzacji.
- `cbState`: `'closed' | 'open' | 'unknown'` — driver wariantu CB.
- `dsState`: `'closed' | 'open' | 'unknown'` — driver wariantu DS.
- W kolumnie widoczne: nagłówek (feeder name), CB (kwadrat 9×9), DS (koło r=4.5), cable head (trójkąt).

Sprzęgła:
- Renderowane jako wydzielone pole sprzęgła z własnym tłem między sekcjami.
- `closed=true` → CB sprzęgła zielony (token COLOR_DEVICE_CLOSED).
- `closed=false` → CB sprzęgła otwarty z markerem przerwy (token COLOR_DEVICE_OPEN).

Energization → kolor:
- `energized` → zielony (token COLOR_DEVICE_CLOSED).
- `deenergized` → szary jasny (token COLOR_TEXT_MUTED).
- `tripped` → czerwony (token COLOR_DEVICE_OPEN).
- `unknown` → neutralny szary (token COLOR_NODE).

## 6. Kolory pól per role (DEFERRED Phase 1)

UWAGA: tabela kolorów per `FieldRole` była zaplanowana ale **nie jest
zaimplementowana w obecnym renderze** — wszystkie pola dziedziczą `columnFill`
= `COLOR_PANEL` lub `COLOR_MANIPULATION_BG` (gdy `inManipulation`). Per-role
kolorystyka pól wymaga refaktoru `BayColumn` (Phase 1) i będzie konsumować
nowe tokeny `COLOR_BAY_LINE`, `COLOR_BAY_TR`, `COLOR_BAY_MEASUREMENT`,
`COLOR_BAY_COUPLER` w `theme/tokens.ts`.

Aktualny stan: rozróżnienie pól jest przez `data-field-role` atrybut
i kolorystykę aparatów (energization), nie przez tło kolumny.

## 7. Brak hardkodowanych kolorów

Wszystkie kolory zaznaczenia używają tokenu `COLOR_SELECTION` z `theme/tokens.ts`. Kolory diagnostyczne — `COLOR_PARTIAL`, `COLOR_REPORT_BLOCKED`, `COLOR_WARN`.

## 8. Acceptance Invariants pokryte

- nr 11 (stacja w widoku oddalonym = mini-block): GPZ ma własny renderer, NIE prostokąt.
- nr 12 (GPZ przy LOD ≥ 1 = rozdzielnia): GpzSwitchgearRenderer dodaje sekcje.
- nr 13 (CT/VT/uziemnik wynika z BayTemplate): GPZ field roles mapują się na BayDeviceOrderPolicy (Phase 1).

## 9. Testy (Phase 0A)

- `renderer/__tests__/gpzCompactBlock.test.tsx` — 21 cases:
  - Back-compat data attrs.
  - Tor 110 kV + TR + szyny SN + odpływy.
  - Countery sterują geometrią (transformerCount × mvSectionCount × outgoingBayCount).
  - Diagnostyczne badge (stale/invalid).
  - Token zaznaczenia (nie hardkod).
  - Delegacja do switchgear (LOD ≥ 1).
  - HV-tower w switchgear renderer.
- `renderer/__tests__/gpzSwitchgearScada.test.tsx` — 117+ cases SCADA-grade (auto-update guard pending Phase 0B):
  - Każde pole ma kolumnę z CB + DS + cable head.
  - Numer pola pod kolumną.
  - Feeder name w nagłówku.
  - Koloryzacja energizacji (energized → COLOR_DEVICE_CLOSED).
  - Open CB → marker przerwy (COLOR_DEVICE_OPEN).
  - Etykieta sekcji (S1, S2, ...) nad szyną.
  - Sprzęgło między sekcjami (CB + tło + state badge + KAS SP/SZR).
  - TR z Y na 110 kV i Δ na SN (osobne markery).
  - Wieloma sekcjami (8+8 pól + sprzęgło).
  - Badge stack (SPZ/SCO/OWG/NZ/LRW/ARN/BKR/STYCZ/AWSC/ZS/SZR).
  - KAS button + LED + opcjonalny P-number.
  - Vertical "STEROWANIE ZDALNE/LOKALNE" label na lewym marginesie pola.
  - Panel pomiarowy (P/Q/I1-3/U1-3/U12-31/U0/f/Idł).
  - Marker zwarcia doziemnego (cyan circle).
  - Manipulation highlight (oliwkowe tło).
  - Pomiar prądu sprzęgła "I X".
  - Title bar action (Kasowanie sygnalizacji zabezpieczeń).
  - TR measurements panel (Temp. oleju / Uarn / NZACZ / MVA).
  - Flow direction arrow (up=żółta, down=magenta).
  - Two-bus topology (110 kV + 15 kV z TR pomiędzy).

## 10. Two-Bus Topology (Phase 0A refinement)

Operator-grade ekran dyspozytorski wymaga osobnego rysowania szyn 110 kV i SN
z transformatorami pomiędzy. Włączane przez prop `hvSections`:

```ts
<GpzSwitchgearRenderer
  hvSections={[
    { sectionId, order, name, sectionLabel: 'sekcja A', busVoltageKv: 110, bays: [...] },
    { sectionId, order, name, sectionLabel: 'sekcja B', busVoltageKv: 110, bays: [...] },
  ]}
  hvCouplers={[...]}     // sprzęgła sekcyjne 110 kV (np. SP)
  sections={[...]}        // 15 kV (LV) sekcje (jak dotychczas)
  couplers={[...]}        // sprzęgła sekcyjne 15 kV
  transformerCount={2}
  transformerMeasurements={[
    { oilTemperatureC: 17.5, uarnKv: 15.4, nzacz: '7', apparentMva: 25, flow: 'up' },
    { oilTemperatureC: 19.4, uarnKv: 15.0, nzacz: '7', apparentMva: 25, flow: 'down' },
  ]}
  titleBarAction="Kasowanie sygnalizacji zabezpieczeń"
/>
```

Layout (top-down):
```
[Title bar: GPZ-8 PGL  +  Kasowanie sygnalizacji zabezpieczeń  +  110/15 kV]
[110 kV bus (red) ─────────────────────────────────] 110kV
        |    |    |    |
       POR   6    SP   EC2   ← HV bays hangujące w dół
       05    06   4    3
        |    |         |
       [TR2 25MVA]    [TR1 25MVA]      ← TR symbols między HV i LV bus
       Temp. oleju                       (Y/Δ markers + measurements + flow arrow)
       Uarn  NZACZ
        |    |         |
[15 kV bus (green) ────────────────────────────────] 15kV
        |    |    |    |    |    |    |
       PN2  ZU2  TR2  BKR2 SP   BKR1 ZU1 PN1   ← LV bays hangujące w dół
       10   08   06   04   02   01   05  07
```

Test ID-y dedykowane two-bus mode:
- `sld-v2-gpz-switchgear-hv-bus` — HV bus line.
- `sld-v2-gpz-switchgear-lv-bus` — LV bus line.
- `sld-v2-gpz-switchgear-hv-bus-label-{left,right}` — etykieta "110kV" przy końcach.
- `sld-v2-gpz-switchgear-lv-bus-label-{left,right}` — etykieta "15kV" przy końcach.
- `sld-v2-gpz-switchgear-two-bus-tr-column` — wrapper wszystkich TR symboli.
- `sld-v2-gpz-tr-mva-label-{idx}` — etykieta MVA przy TR (np. "25MVA").
- `sld-v2-gpz-hv-section-label-{sectionId}` — etykieta HV sekcji ("sekcja A").
- `sld-v2-gpz-tr-measurements-{idx}` — wrapper panelu pomiarów TR.
- `sld-v2-gpz-tr-measurement-{oil-temp,uarn,nzacz,mva}-{idx}` — poszczególne wiersze.
- `sld-v2-gpz-tr-flow-arrow-{idx}` — strzałka kierunku przepływu.
- `sld-v2-gpz-switchgear-title-bar-action` — tekst akcji w pasku tytułu.

Backwards compatibility:
- Brak `hvSections` (lub pusta tablica) → tryb single-bus jak dotychczas.
- Wszystkie istniejące testy (71 cases) niezmienione — brak regresji.

## 11. Pola liniowe SN → magistrala sieci terenowej

Każde LV pole liniowe (`bay_role: 'OUT' | 'FEEDER' | 'IN'`) renderuje wychodzący
kabel do magistrali SN. Adapter ENM automatycznie wnioskuje cel feedera z
topologii (branch.from_bus_ref / to_bus_ref → docelowa stacja).

```ts
GpzBayDescriptor.outgoingFeeder = {
  destination: '→ ST-001 SADY',  // wnioskowane z branch + substation lookup
  energized: true,                // domyślnie true
  feederNumber: 'L-203',          // opcjonalnie
};
```

Trunk line (magistrala) renderowana automatycznie gdy są feedery; etykieta
domyślna "Magistrala SN — sieć terenowa" lub custom przez `fieldTrunkLabel`.
Pusty string ukrywa trunk (zostają tylko pojedyncze drops).

## 12. End-to-end pipeline — ENM → adapter → renderer

`enmToSldAdapter.ts.buildGpzs()` buduje pełny propsy GPZ z ENM:

| ENM field | → GpzRendererProps |
|---|---|
| `Substation.gpz_sections[]` | `sections[]` (LV side, LOD ≥ 1) |
| `Substation.gpz_sections[].right_coupler_ref` | `couplers[]` (sprzęgła SN) |
| `bays[]` filtered by `gpz_section_id` | `sections[].bays[]` |
| `bays[].bay_role` | mapped via `ENM_BAY_ROLE_TO_FIELD_ROLE` → `fieldRole` |
| `branches[]` from `bay.bus_ref` to other station | `outgoingFeeder.destination` (auto-derived) |
| `Substation.transformer_refs.length` | `transformerCount` |
| `transformers[].uhv_kv` (matched to GPZ) | `voltageHighKv` |
| `bus_refs[0].voltage_kv` | `voltageLowKv` |
| `transformers[]` z hv_bus_ref + `sources[]` na tym busie | auto-syntezowane `hvSections[]` (HV side, two-bus mode) |

`SldCanvasV2` przekazuje `lod` (z scale/override) → `<GpzRenderer lod={lod}/>`,
co przy `lod ≥ 1` deleguje do `GpzSwitchgearRenderer` z całym pipelinem.

### Backend ENM gaps (udokumentowane długi)

| Pole | Status | Komentarz |
|---|---|---|
| `Substation.gpz_hv_sections[]` | **GAP** | ENM nie modeluje HV (110 kV) sekcji. Adapter syntezuje 1 HV sekcję z transformatorów + źródeł — wystarczy do typowego GPZ z pojedynczym 110 kV busem; pierścień 110 kV wymaga rozbudowy ENM. |
| `Substation.hv_couplers[]` | **GAP** | Sprzęgła HV nieobecne w ENM (większość GPZ ma jeden 110 kV bus). Renderer obsługuje przez `hvCouplers` props. |
| Transformer measurements (Temp. oleju, Uarn, NZACZ, MVA, flow) | **TELEMETRY** | Te pomiary to runtime SCADA, nie domain config. Przyszły kanał telemetry pipe-uje przez `transformerMeasurements` props. Brak danych = brak panelu (graceful). |
| `Bay.outgoing_feeder_destination` | **DERIVED** | Adapter wnioskuje z topologii (branch + substation). Stabilne i deterministyczne. |
| Title bar action ("Kasowanie sygnalizacji zabezpieczeń") | **UI label** | Hardkod / przez UI preferencje (nie ENM). |

---

## 13. Audit zespołu 5-osobowego (Phase 0A refinement)

Audyt przeprowadzony przez 3 zespoły agentów obejmujące 13 ról ekspertów:
zespół SLD/UX OSD (5 ekspertów), zespół MV engineering (5 ekspertów), zespół
system/E2E architecture (3 ekspertów). Wynik: 5 BLOCKERów konsensusowych +
liczne HIGH/MEDIUM. Wdrożone fixy:

### Fix 1/5: Tokenizacja GPZ_GEOMETRY + paleta SCADA correctness
- 30+ magic numbers → `GPZ_GEOMETRY` namespace w `theme/tokens.ts`.
- `COLOR_BUS_HV` (#F2F4F6 biały) zamiast czerwonego (kolizja z alarm).
- `COLOR_BUS_LV` (#3DB4FF cyan) zamiast zielonego (kolizja z deviceClosed).
- `COLOR_KAS_LED` (#E5C828 żółty) zamiast fioletu (kanon Energa).
- `COLOR_FIELD_TRUNK_ENERGIZED/NEUTRAL` — magistrala SN reaguje na stan.
- Czcionki badge/sterowanie/measurement: 7-8 → 9-10 (próg czytelności).
- Y/Δ markery TR: armLen 5→6, strokeWidth 1.2→1.6.

### Fix 2/5: ENM truth — Acceptance Invariant 9 (brak fabricated states)
- Adapter NIE hardkoduje już `energization='energized'`, `cbState='closed'`,
  `outgoingFeeder.energized=true`, `coupler.closed=true`. Pola pozostają
  `undefined` / `'unknown'` → renderer pokazuje neutral.
- `inferHvVoltageKv` deterministyczne (bez heurystyki "voltage > 30").
- Set iteration sortowane explicit.
- HV synth bayRef ma stabilny prefix `__hv-derived-` (jasne oznaczenie).
- Coupler.closed: backwards-compat boolean + 'closed'/'open'/'unknown'.

### Fix 3/5: Symbol uziemnika ES + Q-numeracja IEC 81346
- `ApparatusEarthingSwitch` (kanon IEC 60617 7-13-05): boczna gałąź z
  trójkątem ziemi. closed=czerwony BHP marker, open=szary dashed,
  unknown=szary z '?', absent=nie renderowany.
- `EarthingSwitchState`: 4 stany (closed/open/unknown/absent).
- `qDesignations`: Q0=CB, Q1=DS_BUS, Q9=DS_LIN, Q8=ES, T1=CT (IEC 81346-2).
- Adapter `deriveQDesignations(bay_role)` mapuje rolę → kanoniczne Q.
- Adapter wnioskuje esState z bay_role (LINE/TR/MEASUREMENT → 'unknown';
  COUPLER → 'absent').

### Fix 4/5: Trunk arrows kierunkowe + rozszerzone onClick API
- Strzałka ▼ na środku każdej linii outgoing feeder (kanon SCADA — operator
  widzi kierunek nawet bez animacji).
- `onClickCb / onClickDs / onClickEs / onClickKas / onClickCoupler` —
  drill-down per aparat. ES wymaga BHP-protected auth.
- Każdy aparat owinięty w klikalne `<g>` z `stopPropagation`.

### Fix 5/5: Doc update (ten dokument).

---

## 14. State machine — `SecondaryFlagState` × `EarthingSwitchState`

### SecondaryFlagState (badge zabezpieczenia)

| Stan | Etykieta | Kolor statusu | Semantyka |
|---|---|---|---|
| `enabled` | "Zal." | `COLOR_BADGE_STATUS_OK` zielony | Funkcja aktywna w gotowości |
| `disabled` | "Odbl." | `COLOR_BADGE_STATUS_NEUTRAL` szary | Odblokowana ale nieaktywna |
| `restricted` | "Odst." | `COLOR_BADGE_STATUS_BLOCKED` czerwony | Odstawiona ręcznie przez operatora |
| `blocked` | "Zabl." | `COLOR_BADGE_STATUS_BLOCKED` czerwony | Zablokowana logicznie (interlock) |

### EarthingSwitchState (uziemnik — BHP)

| Stan | Wizualizacja | Kolor | Semantyka |
|---|---|---|---|
| `open` | dashed nóżka + trójkąt ziemi szary muted | `COLOR_TEXT_MUTED` | Uziemnik wyłączony — pole NIE uziemione (normalny stan pracy pod napięciem) |
| `closed` | solid nóżka + trójkąt ziemi czerwony | `COLOR_DEVICE_OPEN` | Uziemnik załączony — pole UZIEMIONE. **BLOKADA** załączenia pola pod napięciem (BHP) |
| `unknown` | dashed nóżka + '?' | `COLOR_TEXT_MUTED` | Brak telemetrii ze sterownika (Invariant 9) |
| `absent` | nie renderowany | — | Pole nie ma uziemnika (RMU bez ES, sprzęgło) |

### GpzApparatusSwitchState (CB / DS)

| Stan | Symbol CB | Symbol DS | Semantyka |
|---|---|---|---|
| `closed` | filled square zielony | filled circle zielony | Aparat zamknięty, pod napięciem (gdy bay energized) |
| `open` | square z czerwoną przerwą | circle z czerwoną przerwą | Aparat otwarty |
| `unknown` | jak energization=unknown | jak energization=unknown | Brak telemetrii |

### Tranzycje (informacyjnie — implementuje warstwa SCADA telemetry)

```
[unknown] ── otrzymujemy wartość z sterownika ──→ [open|closed]
[open]    ── operator załącza ─────────────────→ [closed]
[closed]  ── operator wyłącza ─────────────────→ [open]
[*]       ── utrata komunikacji ───────────────→ [unknown]
```

---

## 15. Anti-patterns (NIE wolno)

Acceptance Invariants 1-17 z planu projektu są BINDING. Poniżej konkretne
anti-patterny dla GPZ Switchgear renderera:

### 15.1 Renderer NIE może
- ❌ Hardkodować stanów aparatów (`energized: true`) gdy ENM nie ma danych. Brak danych = `undefined` → renderer pokazuje neutral. **Naruszenie Invariant 9**.
- ❌ Mieć żadnej fizyki / heurystyki / wnioskowania domen. Tylko projekcja `props` → SVG.
- ❌ Modyfikować ENM. Renderer jest read-only.
- ❌ Animować elementów (chyba że jawnie udokumentowane jako CSS class). Brak RNG, brak fps deps.
- ❌ Używać kolorów ad-hoc — wszystkie z `theme/tokens.ts`.
- ❌ Wprowadzać magic numbers — wszystkie wymiary z `GPZ_GEOMETRY`.

### 15.2 Adapter NIE może
- ❌ Wnioskować stanów elektrycznych (energization, switching state). Brak danych ENM = `undefined`.
- ❌ Stosować heurystyk typu "if voltage > 30 → HV". Tylko deterministyczne lookupy.
- ❌ Mutować snapshot ENM.
- ❌ Iterować Set / Map bez explicit sortowania (non-determinism).

### 15.3 Backend ENM NIE może
- ❌ Przesyłać wartości "0.00" gdy nie ma danych. Brak = `null`/`undefined`, nigdy `0.00`.
- ❌ Wprowadzać runtime telemetry do core ENM (powinno być oddzielnym kanałem).

### 15.4 Stylistycznie NIE wolno
- ❌ Używać czerwonego dla szyn lub obiektów pod napięciem (kanon: czerwony = alarm/zwarcie/blokada).
- ❌ Używać zielonego dla szyn (zielony = aparat zamknięty).
- ❌ Używać fioletu dla LED operacyjnych (kanon Energa: KAS = żółta dioda).
- ❌ Stosować font < 9px dla badge / 10px dla pomiarów (próg czytelności).
- ❌ Skracać etykiety bez ellipsis "…" (operator nie widzi że uciął).

---

## 16. Decision tree — topologia GPZ (single-bus / two-bus / breaker-and-half)

```
GPZ ENM data
    │
    ├── transformer_refs.length === 0 ────→ GpzCompactBlock (LOD 0 only)
    │
    └── transformer_refs.length ≥ 1
        │
        └── shouldDelegateToSwitchgear(props):
            • lod ≥ 1 ?
            • sections.length > 0 ?
            │
            ├── NIE ────→ GpzCompactBlock (zwarty schemat)
            │
            └── TAK ────→ GpzSwitchgearRenderer
                │
                └── isTwoBus = (hvSections.length > 0)
                    │
                    ├── false ────→ Single-bus mode
                    │              (HV tower → TR → SN bus → bays)
                    │
                    └── true  ────→ Two-bus mode
                                   (HV bus + bays || TR symbols || LV bus + bays)

Auto-synthesis: adapter.synthesizeHvSections() generuje hvSections gdy:
  - Substation.transformer_refs nie pusta
  - Co najmniej 1 transformer ma hv_bus_ref
  Zawiera: 1 HV sekcję z TR feeder bays + incoming line bays (dla każdego
  source na hv_bus_ref). Stany aparatów = undefined (Invariant 9).

Future (Phase 1+):
  - breaker_and_a_half: 3 sekcje, każda z dedicated CB/DS, 1.5 CB per bay
  - ring_main_unit_topology: pierścień 110 kV z NOP indicator
  Wymaga rozbudowy ENM o `gpz_hv_sections[]` + `nop_segment_ref`.
```

---

## 17. Test count auto-update — `docs_count_consistency_guard.py`

Liczby testów w sekcjach 9, 10, 13, 18, 19 dokumentu są pilnowane przez CI guard
`mv-design-pro/scripts/docs_count_consistency_guard.py` (Phase 0B-2,
RESOLVED).

### Konwencja zapisu w doc

Doc cytuje plik testowy w jednym z dwóch formatów:

  - **Liczba dokładna** — `<file>.test.tsx` — N cases / N tests / N test cases.
    Guard wymaga `actual == N`. Każdy spadek lub wzrost oznacza
    nieaktualną dokumentację.
  - **Dolne ograniczenie** — `<file>.test.tsx` — N+ cases / N+ tests.
    Guard wymaga `actual >= N` ORAZ `actual <= TOLERANCE_FACTOR * N` (default 3.0).
    Daje komfort z dodawaniem testów bez ciągłego zmieniania doc, ale wymaga
    aktualizacji gdy actual wyrasta poza tolerance (doc wtedy nie odzwierciedla
    skali pokrycia).

### Uruchomienie lokalne

```bash
cd mv-design-pro
python scripts/docs_count_consistency_guard.py            # pretty output
python scripts/docs_count_consistency_guard.py --strict   # bez tolerance
python scripts/docs_count_consistency_guard.py --json     # CI-friendly
```

### Test guard'a samego

`backend/tests/ci/test_docs_count_consistency_guard.py` — 12 cases. Pokrywa:
parser pattern (exact/+/synonimy), TS/PY test count, exact match,
lower-bound drop / within-range / tolerance violation, missing file,
real-repo smoke.

---

## 18. Iteracja 2: Tier 1 BLOCKERy + Backend ENM (commits 6-8)

Drugi audyt zespołu 13-osobowego (3 zespoły × 5+5+3 ekspertów) stwierdził:
**0/5 BLOCKERów z pierwszego audytu zamkniętych** — pierwsza iteracja
przesunęła Inv 9 z adaptera do renderera. Druga iteracja domyka:

### Commit 6 (b63ca5c) — Quick-wins

- Render `qDesignations.dsBus` (Q1) na osi pola pod szyną (kanon polskiego
  pola liniowego, eliminacja contract-code drift).
- Tokenizacja `GPZ_GEOMETRY.singleBusTrSpacing` (60) + `minSwitchgearWidth`
  (360) — regresja po Commit 1.
- `COLOR_TR_FLOW_DOWN = #FF7AC1` (magenta) ≠ `COLOR_TR_FLOW_UP = #E5C828`
  (żółty) — naprawa drift doc 2.0 §13 Fix 1/5.
- GroundFaultMarker r=3 → r=5 (audyt UX D1.3: poziom widoczności).
- `truncateWithEllipsis()` helper — anti-pattern §15.4 fix.
- Doc 2.0 truth: `TR_RADIUS_SWITCH=8` usunięty (kod ma tylko 9), test count
  90→117, tabela hex "Kolory pól per role" → "DEFERRED Phase 1".

### Commit 7 (72b5b55) — Tier 1 BLOCKERy konsensusowe

- **B1 (Invariant 9 §15.1)**: renderer `cbState/dsState ?? 'unknown'`
  zamiast `'closed'`. ApparatusCbSquare/DsCircle z neutral szary + '?' dla
  unknown.
- **B2 (Inv 9 system §B)**: `inferHvVoltageKv null` propagacja przez
  `voltageHighKvKnown` flag → renderer pokazuje "?" zamiast wartości fallback.
- **B3 (Inv 7/8 system §A)**: TopologySnapshot rozszerzone o `gpzSections[]`
  (z `tier: 'lv' | 'hv'`, `bayRefs[]`), `gpzCouplers[]` (z `closedState`),
  `gpzBays[]` (z `qDesignations` + `esState`). Hash uwzględnia wszystkie
  nowe pola — Phase 0B/0C odblokowane.
- **B4 (Inv 13 BLOCKER MV-1+15)**: `BAY_DEVICE_ORDER_POLICY` używana w
  `BayColumn` — pole MEASUREMENT bez CB/CT/CableHead, pole TR bez
  CableHead, pole RMU_LINE bez CB.

### Commit 8 (6d61cc2) — Backend ENM extension

- `Substation.gpz_hv_sections: list[GPZSection]` — eliminuje synthesize HV
  w adapterze (BLOCKER-26 z audytu MV §1).
- `Bay.bay_number: str | None` — kanoniczny ID dyspozytorski ("10", "23/1").
- `Bay.feeder_short_name: str | None` — UI label feedera osobny od `bay.name`.
- `Bay.outgoing_destination_ref: str | None` — eliminuje wnioskowanie z grafu
  branch+substation w adapterze.
- `buildHvSectionsFromEnm()` w adapterze: preferuje explicit ENM,
  synthesize jako fallback dla legacy GPZ-ów.

Tests po iteracji 2: 474 → 554 (+80). Backend 473 → 476.

---

## 19. Iteracja 3: Klasa A+ — operator-grade canon (commits 9-12)

Trzeci audyt 13-osobowego zespołu stwierdził: SLD A− potwierdzona, klasa A+
blokowana 5 BLOKADAMI konsensusowymi. MV: NIE GOTOWE (technical-preview,
2 sprinty do operator-grade). System: Phase 0A ~70% complete.

### Commit 9 (9a398f0) — BAY_DEVICE_ORDER_POLICY pełna iteracja + 6 nowych symboli

Audyt SLD §C.1 + MV B.1: polityka odłączona od renderera dla TR/RMU/MEASUREMENT.

**6 nowych komponentów aparatury (kanon IEC):**

1. **ApparatusFuse** (IEC 60617-7-04): pionowy prostokąt + X dla blown.
2. **ApparatusSurgeArrester** (IEC 60617 S00345): prostokąt + zygzaki +
   strzałka ziemi. Renderowany na bocznej gałęzi LEWO.
3. **ApparatusSwitchDisconnector** (IEC 60617 S00198): okrąg r=6 z dodatkową
   kreską load-break — kanon RM6/SafeRing/RMU.
4. **ApparatusVtThreePhase** (IEC 60617 S00310 + tradycja PSE/Energa):
   3 okręgi fazowe L1/L2/L3 + trójkąt ziemi neutral. **Zastępuje placeholder
   żółty** z poprzedniej iteracji.
5. **ApparatusLvBreaker**: mały kwadrat za TR z napisem "nN".
6. **ApparatusTransformerSymbol**: 2 sprzężone okręgi NA OSI POLA.

**Renderer iteracja whitelist 12 typów** (zamiast 6) — wszystkie z `hasSlot()`
checking BAY_DEVICE_ORDER_POLICY. ES side per slot.side z polityki.

### Commit 10 (fa69722) — LodController hookup + per-role colors + adapter cleanup

- **LodController hookup**: `SldCanvasV2` używa `createLodController` z
  histerezą FSM (deadband 15%, debounce 250ms) zamiast `inferLodFromScale`.
  Eliminacja Phase 0A scope miss (Inv 5/6 wired runtime).
- **Per-role bay colors** (audyt SLD §D.3): `COLOR_BAY_LINE` (#171B20),
  `COLOR_BAY_TR` (#1A2438 niebieski), `COLOR_BAY_MEASUREMENT` (#2A2616 żółtawy),
  `COLOR_BAY_COUPLER` (#1F2226 szary). Operator szybko odróżnia klasę pola.
- **Adapter cleanup**: STRICT mode dla `outgoingFeeder` — preferuje ENM
  `outgoing_destination_ref`. Heurystyka `inferOutgoingFeederDestination`
  zachowana jako legacy fallback (eliminacja Phase 1+).

### Commit 11 (90cd614) — dry_run preview + StationCard widget

- **Backend dry_run**: `insert_station_on_segment_sn(payload={dry_run: True})`
  zwraca preview metadata (inserted_station_id, halves, electrical_impact)
  bez mutacji ENM. Wymagane dla Phase 0C "Conscious split with preview".
- **StationCard widget**: 2 pola read-only dla `gpz_sections[]` (LV) +
  `gpz_hv_sections[]` (HV) gdy `station_type='gpz'`. Pełen edytor (CRUD)
  deferred do Phase 0B/1.

### Commit 12 (this) — Doc 3.0 update

- §18 (Iteracja 2): Tier 1 BLOCKERy + Backend ENM (commits 6-8).
- §19 (Iteracja 3): Klasa A+ operator-grade canon (commits 9-12).
- Wersja header: 2.0 → 3.0.

Tests po iteracji 3: 554 → 566. Backend 473 → 476. Type-check + lint zielone.

### Status końcowy 5 BLOKAD konsensusowych (3 audyty):

| BLOKADA | Iteracja 1 | Iteracja 2 | Iteracja 3 |
|---|---|---|---|
| 1. BAY_DEVICE_ORDER_POLICY | NOT_ADDRESSED | PARTIAL (boolean filters) | **RESOLVED** (full iteration + 6 nowych symboli) |
| 2. ES BHP per role | NOT_ADDRESSED | NOT_ADDRESSED | **RESOLVED** (side per slot z polityki) |
| 3. TR feeder disconnect | PARTIAL | PARTIAL | **RESOLVED** (TransformerSymbol + LvBreaker NA OSI) |
| 4. PN VT placeholder | NOT_ADDRESSED | PARTIAL | **RESOLVED** (ApparatusVtThreePhase) |
| 5. HV sections fabricated | NOT_ADDRESSED | PARTIAL | RESOLVED gdy ENM ma `gpz_hv_sections`; legacy fallback dla starych projektów |

Status Acceptance Invariants (17): RESOLVED 14/17, PARTIAL 2/17, OPEN 1/17.
- OPEN: telemetry pipeline (`BayCanonicalModel.runtime_state` w backend, frontend
  nie konsumuje — Phase 0B kanał).
- PARTIAL: doc-vs-kod count auto-update guard (`docs_count_consistency_guard.py`
  planowany Phase 0B).
- PARTIAL: pełen StationCard editor dla gpz_sections (CRUD UI, Phase 1).
