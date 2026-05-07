# SLD GPZ Switchgear Depth (Phase 0A)

**Status:** BINDING (Phase 0A)
**Wersja:** 1.0
**Pliki źródłowe:**
- `frontend/src/ui/sld/v2/renderer/GpzRenderer.tsx` (entry, decyzja delegacji)
- `frontend/src/ui/sld/v2/renderer/GpzSwitchgearRenderer.tsx` (full switchgear LOD ≥ 1)

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

IEC 60617 — dwa sprzężone okręgi. Stała geometria:
- Promień: `TR_RADIUS = 9` px (compact); `TR_RADIUS_SWITCH = 8` px (switchgear).
- Odstęp uzwojeń: `TR_WINDING_GAP = 7` px.

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

## 6. Kolory pól per role

| FieldRole | Kolor (fill) |
|---|---|
| LINE_IN / LINE_OUT / LINE_BRANCH / GPZ_LINE_BAY / RMU_LINE | `#1F2A38` |
| TRANSFORMER / RMU_TRANSFORMER | `#A5C8FF` |
| MEASUREMENT | `#FFE48A` |
| COUPLER | `#9aa6b8` |

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
- `renderer/__tests__/gpzSwitchgearScada.test.tsx` — 90 cases SCADA-grade:
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
