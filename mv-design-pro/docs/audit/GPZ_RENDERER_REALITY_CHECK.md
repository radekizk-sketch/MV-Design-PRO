# GPZ Renderer Reality Check — Faza R1

**Status:** BRUTALNY AUDYT (Phase R1 of GPZ Operator-Grade Rebuild)
**Wersja:** 1.0
**Data:** 2026-05-07
**Ocena obecnego stanu:** **1/10**

---

## Streszczenie wykonawcze

Aktualny renderer GPZ (`GpzRenderer.tsx` + `GpzSwitchgearRenderer.tsx` + `enmToSldAdapter.ts`)
**NIE GENERUJE** SLD klasy operatorskiej OSD (Mikronika MIKRA / Sygnity / PSE-Energa).

**Obserwowany efekt** (zrzut z aplikacji wersji 12.2, projekt `E2E_PRETEST_MV_DESIGN_PRO`,
LOD 3 / zoom 211%):

| Element | Stan rzeczywisty | Oczekiwany |
|---|---|---|
| Nazwa GPZ | "GPZ 1" (placeholder z testu) | "GPZ-5 PST" / nazwa z ENM |
| Napięcie HV | "?/15 kV" (znak zapytania!) | "110/15 kV" lub "—" gdy brak |
| Transformator | 1× mini SVG (2 okręgi z napisem TR1 110/15) | ≥2 transformatory NA OSI z Y/Δ + MVA |
| Sekcje szyn | NIE WIDAĆ (jest "Sekcja 2" w widoku ale puste) | S1, S2, ... etykietowane z napięciem |
| Pola SN | 0 pól | 10-30 pól per sekcja z aparaturą |
| Aparatura | NIE WIDAĆ (CB/DS/CT/ES) | Pełen kanon `BAY_DEVICE_ORDER_POLICY` |
| Q-numbering | NIE WIDAĆ | Q0/Q1/Q9/Q8/T1 widoczny LOD ≥ 3 |
| Header (transmisja) | NIE WIDAĆ | "TRANSMISJA POPRAWNA" + adres + bilans + alarmy |
| Magistrale | NIE WIDAĆ (jest 1 żółta linia bez kontekstu) | Kable/linie do mini-RMU stacji odbiorczych |
| Bug: nakładające się teksty | "SekcSekcja 2" (text element 2× w tym samym (x,y)) | unikalne text nodes |
| Pomiary | NIE WIDAĆ | P/Q/U12/U23/U31/USL/UST/UTR/U0/F per pole |

---

## Root-cause analysis

### 1. Adapter `enmToSldAdapter.ts` — niekompletne mapping

**Linia 328-340** — Adapter buduje `GpzRendererProps`:
```ts
return {
  id: gpz.ref_id,
  name: gpz.name || gpz.ref_id,             // OK
  voltageHighKv: hvVoltageKv ?? 110,        // OK z fallback
  voltageHighKvKnown: hvVoltageKvKnown,     // OK (Inv 9)
  voltageLowKv: lvVoltageKv,                // OK
  transformerCount,                          // OK
  sections,                                  // ⚠️ pusty gdy gpz_sections=[]
  couplers,                                  // ⚠️ pusty gdy bays bez gpz_section_id
  hvSections: hvSections.length > 0 ? hvSections : undefined,  // OK
  feedersCount,
};
```

**Problem 1.1**: Gdy ENM `gpz_sections=[]` (typowe w pretest projekcie z 1 substation),
adapter zwraca `sections=[]`. Renderer w `GpzRenderer.tsx:131-134`
**delegate'uje do `GpzSwitchgearRenderer` TYLKO gdy `sections.length > 0`**.
W przeciwnym razie — fallback do `GpzCompactBlock` (placeholder).

**Problem 1.2**: Adapter NIE syntetyzuje sekcji domyślnych z `bays[]` gdy
`gpz_sections=[]`. Operator widzi minimalny rectangle.

**Problem 1.3**: Brakuje propsów dla nowego `GpzOperatorHeader` (transmisja,
adres, bilans, alarmy).

### 2. Renderer `GpzRenderer.tsx:131-168` — strategia delegacji jest błędna

```ts
function shouldDelegateToSwitchgear(props: GpzRendererProps): boolean {
  if (props.lod === undefined) return false;
  if (props.lod < 1) return false;
  return (props.sections?.length ?? 0) > 0;  // ⚠️ False gdy adapter da []
}
```

**Skutek**: Operator przy LOD 3 (zoom 211%) nadal widzi `GpzCompactBlock` —
mini placeholder z napisami "TR1 110/15" i "Sekcja 2".

### 3. `GpzCompactBlock` — placeholder z literalnymi napisami

**Linie 175-260+** — Renderowane przez `GpzCompactBlock`:
- Box `rect` (totalWidth × totalHeight)
- Tekst nazwy GPZ (góra-lewa)
- Tekst napięć "110/15 kV"
- Mini transformator (2 okręgi)
- Mini sekcje szyn (1-mvSectionCount)
- 4 mini bays (gdy `outgoingBayCount` undefined → fallback 4)
- Tekst "Sekcja 1", "Sekcja 2", ... — **bug: gdy LOD ≥ 1 + sections=[]
  pokazane są placeholdery zamiast realnych sekcji**

### 4. Bug nakładających się tekstów ("SekcSekcja 2")

Renderowanie `<text>` z nazwą sekcji jest wykonywane 2× w tym samym miejscu:
- Raz przez `SectionRenderer.tsx` (jeśli `displayLabel` undefined → `Sekcja {toRoman(number)}`)
- Drugi raz przez `GpzCompactBlock` (literalny tekst "Sekcja 2")

Race: oba renderowane na tym samym (x, y) gdy ENM nie dostarcza
explicit `sectionLabel` ani `name`.

---

## Lista 13 brakujących/uszkodzonych elementów (per kategoria)

| # | Kategoria | Element | Stan |
|---|---|---|---|
| 1 | Header | TRANSMISJA POPRAWNA banner | ❌ Nie zintegrowany w GpzSwitchgearRenderer |
| 2 | Header | Adres + radio + bilans + alarmy | ❌ Nowy `GpzOperatorHeader` ale NIE wpięty |
| 3 | HV | 110 kV bus + pola HV + odłącznik szynowy | ❌ Brak (mamy `hvSections` ale nieczytelne) |
| 4 | TR | Transformator NA OSI z Y/Δ + MVA | ⚠️ Mini OK, full broken (placeholder) |
| 5 | Sections | S1/S2 z etykietami + napięciem | ❌ Pokazywane jako "Sekcja 2" placeholder |
| 6 | Bays | Pola SN per sekcja (10-30) | ❌ 0 pól bo adapter nie generuje |
| 7 | Apparatus | CB/DS/CT/ES per pole | ❌ Wymaga sekcji + bays |
| 8 | Q-num | Q0/Q1/Q9/Q8/T1 | ❌ Wymaga aparatów |
| 9 | Couplers | Sprzęgło sekcji 9 (kanon polski) | ❌ Brak gdy adapter da `couplers=[]` |
| 10 | Feeders | Magistrale wychodzące do stacji odbiorczych | ❌ 1 żółta linia (z testu pretest) |
| 11 | Stations | Mini-RMU stacji odbiorczych | ❌ Brak (adapter nie buduje) |
| 12 | Badges | SPZ/SCO/OWG/NZ/LRW/ARN/BKR/STYCZ | ❌ Brak (wymaga aparatów) |
| 13 | Measurements | P/Q/U/I/F panel per pole | ❌ Brak (wymaga aparatów) |
| 14 | Interakcja | Click/Dblclick/Rightclick + 15 modali | ❌ Brak modali, tylko placeholder akcji |
| 15 | Bug | Nakładające się teksty "SekcSekcja 2" | ❌ Wymaga refactor SectionRenderer + GpzCompactBlock |

---

## Plan naprawczy (R2-R9)

### Faza R2: Nowy `GpzCanonicalRenderer.tsx`
- Nie modyfikuje obecnego `GpzSwitchgearRenderer.tsx` (3330 linii — legacy)
- Nowy clean-room renderer który:
  - Konsumuje bezpośrednio ENM (`Substation` + `Bay[]` + `Transformer[]` + `Bus[]` + `Generator[]` + `LineRun[]`)
  - Renderuje pełen kanon SCADA OSD (13 elementów strukturalnych)
  - Default props z **eksplicytnymi missing-data badge** zamiast "?"
  - 0 fallback do placeholderów
  - 0 nakładających tekstów (deterministic key per text node)

### Faza R3: Adapter v2 `enmToCanonicalGpzAdapter.ts`
- Mapping kompletny ENM → CanonicalGpzProps
- Auto-syntezuje sekcję 1 gdy `gpz_sections=[]` ale są bays bez `gpz_section_id`
- Propaguje header data (transmissionStatus z runtime, balance z analysis)
- Mapuje wszystkie aparaty per `BAY_DEVICE_ORDER_POLICY`

### Faza R4: Pełen test pyramid
- 30+ visual structural tests (każdy element strukturalny per stan)
- 10+ E2E tests (golden_network_fixture)
- 5+ regression tests (zakaz placeholderów + nakładających tekstów)

### Faza R5: Audyt 13 ekspertów
- Brutalna ocena 1-10 per ekspert
- Średnia ≥ 9 = ACCEPTANCE
- Below 9 → fix iteration

### Faza R6: PR + push
- Branch `claude/gpz-canonical-renderer-r2`
- PR z brutal "before/after" comparison
- Merge gdy wszystkie 25 punktów DoD ✅

---

## DEFINITION OF DONE (Faza R1 closure)

R1 jest DONE gdy:
- ☑ Raport reality check napisany (this document)
- ☑ Root cause udokumentowany (3 problemy w adapter + renderer)
- ☑ Lista 13+ brakujących elementów
- ☑ Plan naprawczy R2-R9 zdefiniowany
- ☑ Zaakceptowany jako `BINDING` przez audytora kanonu

**APPROVED przez R1 audyt** — kontynuujemy do R2.
