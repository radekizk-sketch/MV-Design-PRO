# Protection Element Assignment Contract (P16a)

**STATUS:** KONTRAKT (read-only, bez solvera)
**PARITY:** DIgSILENT benchmark - przypisanie zabezpieczen do elementow

---

## 1. CEL

Zdefiniowac kontrakt danych dla **statycznego przypisania urzadzen zabezpieczeniowych do elementow SLD**.

Umozliwia:
- Wizualizacje zabezpieczen na schemacie (overlay)
- Wyswietlanie sekcji zabezpieczen w inspektorze
- Podglad nastaw bez uruchamiania solvera

**NIE obejmuje:**
- Analizy koordynacji (solver)
- Edycji nastaw (przyszly PR)
- Oceny trip/no-trip (wymaga run_id)

---

## 2. PROBLEM

Obecny model:

```
ProtectionSldOverlay
  └── wymaga run_id (wynik solvera)
  └── dane pochodza z analizy zabezpieczen

ProtectionCaseConfigPanel
  └── konfiguruje szablon nastaw na poziomie CASE
  └── NIE przypisuje zabezpieczen do konkretnych elementow
```

**BRAK:** Statycznego przypisania `element → protection_device`

---

## 3. KONTRAKT DANYCH

### 3.1 ElementProtectionAssignment

```typescript
interface ElementProtectionAssignment {
  element_id: string;           // ID elementu sieci (SldSymbol.elementId)
  element_type: ElementType;    // Switch, LineBranch, TransformerBranch, etc.
  device_id: string;            // ID urzadzenia (referencja do ProtectionDeviceType)
  device_name_pl: string;       // Nazwa do wyswietlenia
  device_kind: ProtectionDeviceKind;  // RELAY_OVERCURRENT, FUSE, etc.
  status: ProtectionDeviceStatus;     // ACTIVE, BLOCKED, TEST
  settings_summary?: ProtectionSettingsSummary;  // Kluczowe nastawy (read-only)
}
```

### 3.2 ProtectionDeviceKind

```typescript
type ProtectionDeviceKind =
  | 'RELAY_OVERCURRENT'  // Przekaznik nadpradowy (I>, I>>)
  | 'RELAY_DISTANCE'     // Przekaznik odleglosciowy
  | 'RELAY_DIFFERENTIAL' // Przekaznik roznicowy
  | 'RELAY_EARTH_FAULT'  // Przekaznik ziemnozwarciowy (Io>)
  | 'FUSE'               // Bezpiecznik
  | 'RECLOSER'           // Reklozer
  | 'SECTIONALIZER'      // Sekcjonalizer
  | 'OTHER';             // Inny
```

### 3.3 ProtectionSettingsSummary

```typescript
interface ProtectionSettingsSummary {
  i_pickup_a?: number;       // Prad rozruchowy I> [A]
  i_pickup_fast_a?: number;  // Prad rozruchowy szybki I>> [A]
  t_delay_s?: number;        // Czas opoznienia [s]
  curve_type?: string;       // Charakterystyka (np. "IEC SI")
  i_rated_a?: number;        // Prad znamionowy [A]
  extra?: Record<string, string | number>;  // Dodatkowe parametry
}
```

---

## 4. ADAPTER INTERFACE

```typescript
interface ProtectionAssignmentAdapter {
  getAssignments(projectId: string, diagramId: string): Promise<ElementProtectionAssignment[]>;
  getAssignmentsForElement(elementId: string): Promise<ElementProtectionAssignment[]>;
  hasProtection(elementId: string): Promise<boolean>;
}
```

---

## 5. IMPLEMENTACJA UI

### 5.1 Zrealizowane (ten PR)

| Plik | Status | Opis |
|------|--------|------|
| `ui/protection/element-assignment.ts` | DONE | Typy kontraktu |
| `ui/protection/useProtectionAssignment.ts` | DONE | Hook adaptera (fixture data) |
| `ui/inspector/ProtectionSection.tsx` | DONE | Sekcja zabezpieczen w inspektorze |

### 5.2 Do zrealizowania (przyszle PR)

| Plik | Status | Opis |
|------|--------|------|
| `ui/sld/overlay/ProtectionOverlay.tsx` | TODO | Nakladka SLD (markery) |
| `ui/sld/SwitchingStateLegend.tsx` | TODO | Rozszerzenie legendy |
| `NetworkModel` rozszerzenie | TODO | Pole `protection_device_refs` |
| Backend endpoint | TODO | `GET /api/projects/{id}/protection-assignments` |

---

## 6. OPCJE IMPLEMENTACJI DANYCH

### Opcja A: Rozszerzenie NetworkModel

```typescript
interface Switch {
  ...
  protection_device_refs?: string[];  // ID urzadzen
}
```

**Zalety:** Zgodnosc z bijection SldSymbol ↔ Model
**Wady:** Wymaga migracji modelu

### Opcja B: Osobny endpoint API

```
GET /api/projects/{projectId}/protection-assignments
GET /api/projects/{projectId}/protection-assignments?element_id={elementId}
```

**Zalety:** Brak zmian w NetworkModel
**Wady:** Dodatkowe zapytanie API

### Opcja C: Osadzenie w Protection Case Config

```typescript
interface ProtectionConfig {
  ...
  element_assignments?: ElementProtectionAssignment[];
}
```

**Zalety:** Reuse istniejacego mechanizmu
**Wady:** Dane case-specific, nie globalne

---

## 7. DECYZJA

**Rekomendacja:** Opcja B (osobny endpoint API)

**Uzasadnienie:**
1. Nie wymaga zmian w NetworkModel
2. Dane moga byc wspoldzielone miedzy przypadkami
3. Latwiejsze do implementacji iteracyjnej

---

## 8. PRZYSZLE KROKI

1. **PR: protection-assignment-api** - Backend endpoint
2. **PR: sld-protection-overlay-v1** - Nakladka SLD z markerami
3. **PR: protection-assignment-editor** - Edycja przypisan (CASE_CONFIG mode)

---

## 9. POWIAZANE DOKUMENTY

- `ui_canonical_parity.md` - Parity z benchmark
- `sld_rules.md` - Reguly SLD
- `PROTECTION_INSIGHT_CONTRACT.md` - Analiza zabezpieczen
- `protection/element-assignment.ts` - Typy (kod)

