# Kanoniczny Blueprint Inżynierski SN SLD

**Wersja**: 1.0  
**Data**: 2026-04-24  
**Status**: WIĄŻĄCY — Nadrzędny wobec komponentów React i renderera  
**Odniesienia**:
- `SLD_TYPY_STACJI_KANONICZNE.md` — typy stacji (LEAF/INLINE/BRANCH/SECTIONAL)
- `SLD_SYMBOLIKA_KANONICZNA.md` — symbole IEC 60617
- `SLD_STYL_WIZUALNY_KANONICZNY.md` — paleta kolorów i grubości linii
- `SLD_SYSTEM_SPEC_CANONICAL.md` — architektura renderera

---

## 1. Architektura Sieci SN — Punkt Wyjścia

### Hierarchia Topologiczna

```
GPZ 110/15 kV (Główny Punkt Zasilania)
  │
  ├─ Sekcja Szyn A (BUS_SECTION_A)
  │   ├─ Pole Transformatorowe TR1 (GPZ_TRANSFORMER_BAY)
  │   └─ Pole Liniowe... (GPZ_LINE_BAY) × N
  │
  ├─ Pole Sprzęgła Sekcyjnego (SECTION_COUPLER_BAY)
  │
  └─ Sekcja Szyn B (BUS_SECTION_B)
      ├─ Pole Transformatorowe TR2 (GPZ_TRANSFORMER_BAY)
      └─ Pole Liniowe... (GPZ_LINE_BAY) × N

Stacje SN/nN (podłączone do magistrali wychodzących z GPZ)
  ├─ Stacja Końcowa (TRUNK_LEAF)
  ├─ Stacja Przelotowa (TRUNK_INLINE)
  ├─ Stacja Odgałęźna (TRUNK_BRANCH)
  └─ Stacja Sekcyjna (LOCAL_SECTIONAL)
```

### Invarianty Topologiczne GPZ (NIEZMIENNE)

| Invariant | Reguła |
|-----------|--------|
| Transformatory | Min. 2 (TR-1, TR-2) — jeden na sekcję szyn |
| Sekcje szyn | Dokładnie 2 (A i B), identyczna konfiguracja |
| Sprzęgło | 1 pole SECTION_COUPLER_BAY — zawsze DS+CB+DS, **NIGDY** transformer |
| Pole pomiarowe | 1 BUS_MEASUREMENT_BAY — VT boczny (po stronie pomiarowej) |
| Pole liniowe | N × GPZ_LINE_BAY (wyjścia do stacji SN/nN) |

---

## 2. Pola GPZ — Szablony (BayTemplate)

### 2.1 GPZ_LINE_BAY — Pole Liniowe Wyjściowe/Wejściowe

**Skład (kolejność od szyny do linii)**:

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Szyna | `BUS_SIDE` | BUS (abstrakcja) | WYMAGANE |
| Rozłącznik szynowy | `UPPER_SWITCHING` | DS | WYMAGANE |
| Wyłącznik główny | `BREAKER_POSITION` | CB | WYMAGANE |
| Transformator prądowy | `CT_POSITION` | CT | WYMAGANE (w osi toru) |
| Przekaźnik zabezpieczenia | `LOGICAL_PROTECTION` | RELAY | WYMAGANE (logicznie — poza renderem w osi) |
| Uziemnik boczny | `SIDE_EARTHING` | ES | WYMAGANE |
| Głowica kablowa | `CABLE_EXIT` | CABLE_HEAD | OPCJONALNE (jeśli kabel) |
| Linia/Kabel | (tor) | LINE/CABLE | WYMAGANE |

**Invarianty elektryczne GPZ_LINE_BAY**:
- CB musi mieć `protection_relay_ref` (pełni rolę aparatu zabezpieczanego)
- CT jest w osi toru (między CB a szyną lub CB a linią)
- ES jest boczny (nie w osi)
- VT **NIE** jest w GPZ_LINE_BAY (tylko w BUS_MEASUREMENT_BAY)
- Transformator **NIE** jest w GPZ_LINE_BAY

### 2.2 GPZ_TRANSFORMER_BAY — Pole Transformatorowe

**Skład**:

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Szyna | `BUS_SIDE` | BUS | WYMAGANE |
| Wyłącznik główny | `BREAKER_POSITION` | CB | WYMAGANE |
| Transformator | `TRANSFORMER_POSITION` | TRANSFORMER_2W | WYMAGANE |

**Invarianty**:
- CB (od strony SN) musi mieć `protection_relay_ref`
- Transformator **NIE jest** aparatem w osi — to urządzenie główne pola

### 2.3 SECTION_COUPLER_BAY — Pole Sprzęgła Sekcyjnego

**Skład (DS + CB + DS — nic więcej)**:

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Rozłącznik od szyny A | `UPPER_SWITCHING` | DS | WYMAGANE |
| Wyłącznik sprzęgłowy | `BREAKER_POSITION` | CB | WYMAGANE |
| Rozłącznik od szyny B | `LINE_SIDE_SWITCHING` | DS | WYMAGANE |

**Invarianty BEZWZGLĘDNE**:
- **NIGDY** transformator (`transformer_ref === undefined`)
- **NIGDY** głowica kablowa
- **NIGDY** CT w osi (sprzęgło nie zabezpiecza linii)
- Symbol to **komponent złożony** z DS+CB+DS — nie ikonka `section_coupler.svg`

### 2.4 BUS_MEASUREMENT_BAY — Pole Pomiarowe Szyny

**Skład**:

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| VT pomiarowy | `SIDE_VT` | VT | WYMAGANE |

**Invarianty**:
- VT-in-measurement to **invariant tej konfiguracji**, nie prawo globalne
- CB **NIE** pełni roli aparatu głównego w tym polu
- Wyłącznie pomiar napięcia szyny

---

## 3. Stacje SN/nN — Szablony (StationSwitchgearTemplate)

> **Odwołanie**: Typy stacji — `SLD_TYPY_STACJI_KANONICZNE.md`

### 3.1 TRUNK_LEAF — Stacja Końcowa

```
EmbeddingRoleV1.TRUNK_LEAF
  ├─ 1× STATION_LINE_INCOMING (pole wejściowe)
  ├─ 1× STATION_TRANSFORMER_CUBICLE (pole transformatorowe SN/nN)
  └─ 0× STATION_LINE_OUTGOING (brak wyjścia)
```

### 3.2 TRUNK_INLINE — Stacja Przelotowa

```
EmbeddingRoleV1.TRUNK_INLINE
  ├─ 1× STATION_LINE_INCOMING
  ├─ 1× STATION_TRANSFORMER_CUBICLE
  └─ 1× STATION_LINE_OUTGOING
```

### 3.3 TRUNK_BRANCH — Stacja Odgałęźna

```
EmbeddingRoleV1.TRUNK_BRANCH
  ├─ 1× STATION_LINE_INCOMING
  ├─ 1× STATION_TRANSFORMER_CUBICLE
  ├─ 1× STATION_LINE_OUTGOING
  └─ 1+× STATION_BRANCH_CUBICLE (pola odgałęźne)
```

### 3.4 LOCAL_SECTIONAL — Stacja Sekcyjna

```
EmbeddingRoleV1.LOCAL_SECTIONAL
  ├─ 1× STATION_LINE_INCOMING
  ├─ 1× STATION_TRANSFORMER_CUBICLE
  ├─ 1× STATION_LINE_OUTGOING
  └─ 1× STATION_SECTIONAL_CUBICLE (pole sekcyjne)
```

---

## 4. Pola Stacji — Szablony

### 4.1 STATION_LINE_INCOMING / STATION_LINE_OUTGOING — Pole Liniowe Stacji

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Rozłącznik | `BREAKER_POSITION` | DS | WYMAGANE |
| Uziemnik boczny | `SIDE_EARTHING` | ES | WYMAGANE |
| Głowica kablowa | `CABLE_EXIT` | CABLE_HEAD | WYMAGANE (wyjście kabla) |

**Invarianty**:
- Pole stacji NIE ma CB (tylko rozłącznik — CB jest w GPZ)
- Pole stacji NIE ma CT ani RELAY (te są w GPZ)
- Głowica kablowa jest na **końcu toru** (nie boczna)

### 4.2 STATION_TRANSFORMER_CUBICLE — Pole Transformatorowe Stacji

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Aparat zabezpieczający | `BREAKER_POSITION` | FUSE \| SWITCH_FUSE \| CB | WYMAGANE (zależy od projektu) |
| Transformator | `TRANSFORMER_POSITION` | TRANSFORMER_2W | WYMAGANE |

**Invarianty**:
- FUSE lub SWITCH_FUSE to typowe zabezpieczenie transformatora SN/nN w stacji
- CB jest używany jeśli projekt wymaga pełnej ochrony
- Głowica kablowa dopuszczalna **tylko jako zakończenie kabla**, nie jako symbol transformatora

### 4.3 STATION_BRANCH_CUBICLE — Pole Odgałęźne (dla TRUNK_BRANCH)

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Wyłącznik | `BREAKER_POSITION` | CB | WYMAGANE |
| Rozłącznik boczny | `UPPER_SWITCHING` | DS | OPCJONALNE |

### 4.4 STATION_SECTIONAL_CUBICLE — Pole Sekcyjne (dla LOCAL_SECTIONAL)

| Pozycja | DeviceSlotPosition | DeviceTypeV1 | Obowiązkowość |
|---------|-------------------|-------------|--------------|
| Rozłącznik sekcyjny | `BREAKER_POSITION` | DS | WYMAGANE |
| Boczny CB/DS | `UPPER_SWITCHING` | CB \| DS | OPCJONALNE |

---

## 5. Źródła OZE — Pola Przyłączeniowe

### 5.1 STATION_SOURCE_CUBICLE_PV — Pole Źródłowe PV

```
Pole źródłowe SN:
  ├─ Aparat przełączający (CB lub DS)
  └─ Transformator przyłączeniowy 0,4/15 kV
       ↑ (kierunek: LV → SN, falownik 0,4 kV → sieć 15 kV)
```

**WAŻNE — kierunek napięcia**:
- `v_primary = 0.4 kV` (strona falownika PV)
- `v_secondary = 15 kV` (strona sieci SN)
- Transformator modelowany jako **źródłowy**, nie odbiorczy

### 5.2 STATION_SOURCE_CUBICLE_BESS — Pole Źródłowe BESS

```
Pole źródłowe SN:
  ├─ Aparat przełączający (CB lub DS)
  └─ Transformator przyłączeniowy 0,8/15 kV
       ↑ (kierunek: LV → SN, system BESS 0,8 kV → sieć 15 kV)
```

**WAŻNE — kierunek napięcia**:
- `v_primary = 0.8 kV` (strona systemu BESS)
- `v_secondary = 15 kV` (strona sieci SN)

---

## 6. DeviceSlotPosition — Katalog Pozycji

```typescript
type DeviceSlotPosition =
  | 'BUS_SIDE'             // Przyłączenie do szyny (abstrakcja)
  | 'UPPER_SWITCHING'      // Aparat łączniowy od strony szyn (DS odcinający)
  | 'BREAKER_POSITION'     // Główny aparat przełączający (CB lub DS)
  | 'CT_POSITION'          // Transformator prądowy w osi toru
  | 'LINE_SIDE_SWITCHING'  // Aparat łączniowy od strony linii (DS liniowy)
  | 'CABLE_EXIT'           // Wyjście kabla / głowica kablowa (koniec toru)
  | 'SIDE_EARTHING'        // Uziemnik boczny (nie w osi)
  | 'SIDE_VT'              // VT boczny (pomiar napięcia szyny)
  | 'TRANSFORMER_POSITION' // Transformator jako urządzenie główne pola
  | 'LOGICAL_PROTECTION';  // Relay zabezpieczenia (logika, nie rendering w osi)
```

**Reguły pozycji**:
- Każda pozycja w polu jest unikalna (jeden aparat = jedna pozycja)
- `LOGICAL_PROTECTION` nie renderuje się w osi SVG — to logiczne powiązanie
- `CT_POSITION` zawsze w osi (nie boczna)
- `SIDE_EARTHING` zawsze boczna (nie w osi)

---

## 7. NOP — Punkt Normalnie Otwarty

**WAŻNE**: NOP **NIE jest** katalogowym urządzeniem SN.

```
NOP (Normally Open Point):
  - Typ: topologiczny marker pierścienia
  - Nie: DeviceTypeV1 katalogowy
  - Nie: element wymagający catalogId
  - Renderuje się: miniaturka w legendzie (nie w polu SLD)
  - Symbolizuje: punkt podziału ring'u magistrali
```

---

## 8. Reguły Katalogu (catalogId)

### REQUIRES_CATALOG_ID (obowiązkowy catalogId)
- CB, DS, ES, CT, VT
- FUSE, SWITCH_FUSE
- RELAY (jeśli katalogowy przekaźnik)
- TRANSFORMER_2W, TRANSFORMER_3W
- CABLE_HEAD (jeśli katalogowana)
- SURGE_ARRESTER

### OPTIONAL_CATALOG_ID (opcjonalny catalogId)
- LOAD_SWITCH (czasem katalogowy, czasem marker)
- LINE, CABLE (topologiczne lub katalogowe)

### NO_CATALOG_ID (zakaz catalogId)
- NOP (topologiczny marker)
- BUS, PORT (abstrakcje topologiczne)
- STATION_CONTAINER, FIELD_CONTAINER (kontenery logiczne)

---

## 9. Reguły GPZ kontra Stacja — Rozdzielność Szablonów

**KRYTYCZNE**: GPZ_LINE_BAY ≠ STATION_LINE_INCOMING

| Aspekt | GPZ_LINE_BAY | STATION_LINE_INCOMING |
|--------|-------------|----------------------|
| CB | WYMAGANY | BRAK (DS tylko) |
| CT w osi | WYMAGANY | BRAK |
| RELAY | WYMAGANY (logiczny) | BRAK |
| Głowica kablowa | OPCJONALNA | WYMAGANA |
| Uziemnik | BOCZNY | BOCZNY |
| Funkcja | Zabezpieczenie linii | Izolacja + uziemienie |

---

## 10. Powiązania z Istniejącymi Kontraktami

| Kontrakt | Plik | Rola w Blueprint |
|----------|------|-----------------|
| DeviceTypeV1 | `fieldDeviceContracts.ts` | Typy urządzeń (REUSE, nie modyfikować) |
| FieldRoleV1 | `fieldDeviceContracts.ts` | Role pól (REUSE) |
| EmbeddingRoleV1 | `fieldDeviceContracts.ts` | Role stacji (REUSE) |
| SLD_COLORS | `SLD_STYL_WIZUALNY_KANONICZNY.md` | Paleta kolorów (REUSE) |
| Typy stacji | `SLD_TYPY_STACJI_KANONICZNE.md` | Klasyfikacja stacji (REUSE) |

---

## 11. Zakazy (IMMUTABLE)

1. Sprzęgło **NIGDY** nie ma transformatora
2. NOP **NIGDY** nie jest DeviceTypeV1 katalogowym
3. VT-in-measurement to invariant demonstracyjny, nie prawo globalne
4. GPZ_LINE_BAY ≠ STATION_LINE_INCOMING (osobne szablony)
5. `section_coupler.svg` **NIGDY** jako magiczny symbol — render z szablonu DS+CB+DS
6. CB w SECTION_COUPLER_BAY **NIE ma** `protection_relay_ref`
7. Transformator PV/BESS ma kierunek LV→SN (0,4/15 kV lub 0,8/15 kV), nie odwrotnie
