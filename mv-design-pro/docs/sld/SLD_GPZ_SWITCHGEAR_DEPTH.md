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
- `renderer/__tests__/gpzSwitchgearScada.test.tsx` — 18 cases SCADA-grade:
  - Każde pole ma kolumnę z CB + DS + cable head.
  - Numer pola pod kolumną.
  - Feeder name w nagłówku.
  - Koloryzacja energizacji (energized → COLOR_DEVICE_CLOSED).
  - Open CB → marker przerwy (COLOR_DEVICE_OPEN).
  - Etykieta sekcji (S1, S2, ...) nad szyną.
  - Sprzęgło między sekcjami (CB + tło + state badge).
  - TR z Y na 110 kV i Δ na SN (osobne markery).
  - Wieloma sekcjami (8+8 pól + sprzęgło).
