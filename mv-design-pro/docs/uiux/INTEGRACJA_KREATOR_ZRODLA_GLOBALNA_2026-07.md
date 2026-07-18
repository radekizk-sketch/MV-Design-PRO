# INTEGRACJA GLOBALNA: KREATOR ŹRÓDŁA ↔ SZABLONY PRODUCENTÓW ↔ ZABEZPIECZENIA (2026-07)

**Status:** BINDING (design + plan) · **Autor:** Fable · **Data:** 2026-07-18
**Podstawa:** dyrektywa właściciela 2026-07-18 — „Po to robiłeś szablony pól różnych
producentów, żeby to tu wykorzystywać; dodatkowo brak powiązania z zabezpieczeniem
polowym; myśl w kontekście globalnym: gdzie to dalej, jak powiązali i gdzie będzie
wykorzystywane". Rejestr: V12K-044.

## 0. Diagnoza (co jest, czego brakuje)

Kreator źródła v2 tworzy sekcje z gołymi polami (`gpz_sections[].line_field_names`) —
i **nic więcej**. NIE wiąże:
- **rodziny rozdzielnicy producenta** (switchgear family) ani **szablonu pola**
  (bay template) — mimo że Reference Engine je dostarcza,
- **zabezpieczenia polowego** (protection_ref / protection_assignment).

To marnuje istniejącą infrastrukturę i zrywa łańcuch danych do dalszych etapów.

## 1. Co JUŻ istnieje (fundament do wykorzystania)

**Dane (Reference Engine + katalog switchgear):**
- 7 rodzin rozdzielnic: ABB SafeRing/UniGear, Siemens 8DJH, Schneider SM6,
  Elektrometal e2ALPHA … (`GET /api/catalog/switchgear-families`): pola
  `switchgear_family_ref`, `manufacturer_ref`, `voltage_levels`, `allowed_bay_kinds`,
  `allowed_apparatus_kinds`, `construction_type`, `busbar_system`.
- 36 kompletnych szablonów pól (`GET /api/catalog/complete-bay-templates`):
  `template_ref` (np. `ABB__SAFERING__LINE_IN`), `base_template.bay_role`
  (IN/OUT/TR/COUPLER/MEASUREMENT/FEEDER), `devices[]` z kanoniczną aparaturą
  (Q0/Q1/Q2/Q9…, placement, optional).

**Model (ENM `Bay`):** ma już `bay_template_ref` i `protection_ref` — miejsce na
powiązania istnieje, kreator ich nie wypełnia.

**Precedens (PROVEN):** kreator stacji (`append_station_on_endpoint` /
`insert_station_on_segment_sn`, `domain_operations.py:6540`) buduje per pole
`field_spec` z: `bay_role`, `bay_kind`, `manufacturer_ref`, `switchgear_family_ref`,
`bay_template_ref`, `catalog_bindings`, `equipment_refs`. To jest kontrakt do
odwzorowania w kreatorze GPZ (nie wymyślamy nowego).

**Komponenty UI (do reużycia):** `ui/catalog/SwitchgearFamilyPicker.tsx`,
`ui/catalog/BayTemplatePicker.tsx`, `ui/catalog/SwitchgearTemplateStepper.tsx`,
`ui/network-build/station-wizard-v2/PickerRodzinyReferencyjnej.tsx`.

## 2. Gdzie to płynie dalej (łańcuch globalny — odpowiedź na „gdzie wykorzystywane")

```
KREATOR ŹRÓDŁA (GPZ)
  └─ wybór rodziny rozdzielnicy (switchgear_family_ref)         [K5]
  └─ per pole: bay_role + bay_template_ref (z rodziny)          [K5]
  └─ per pole chronione: protection_ref (zabezpieczenie polowe) [K5]
        │
        ▼ add_grid_source_sn → materializacja Bay z:
          bay_template_ref, switchgear_family_ref, manufacturer_ref, protection_ref
        │
        ├──► SLD `application/sld/internal_layout.py` — układ pola wg szablonu
        │     (aparaty Q0/Q1/Q2/Q9, sekwencja, symbole) = poprawny schemat
        ├──► Reference Engine `reference_engine/validation.py` + `compliance.py`
        │     — walidacja składu pola (required/optional/forbidden) + Reference Score
        ├──► Zabezpieczenia polowe (protection_ref → protection_assignments):
        │     ├─ E-27 „Zabezpieczenia i automatyka" (przegląd nastaw + SPZ/SZR)
        │     ├─ E-28 „Koordynacja zabezpieczeń" (krzywe TCC, selektywność)
        │     └─ `field_read_model` (karta pola E-11 field_protection)
        └──► Zwarcia IEC 60909 / dobór aparatury (Ith/Idyn pól)
```

## 3. Decyzja projektowa (WIĄŻĄCA)

**Krok K5 „Sekcje i pola" przeprojektować na kompozycję z szablonów:**
1. **Rodzina rozdzielnicy** (na GPZ): `SwitchgearFamilyPicker` filtrowany napięciem SN
   → `switchgear_family_ref` + `manufacturer_ref`. Ogranicza dozwolone rodzaje pól i aparatów.
2. **Skład pól per sekcja**: zamiast „liczba pól", lista pól z **rolą** (LINIA_IN/OUT/
   ODG/TRANSFORMATOROWE/SPRZEGLO) i **szablonem** (`bay_template_ref` z rodziny,
   `BayTemplatePicker`). Aparat pola pochodzi z szablonu (nie pojedynczy globalny).
3. **Zabezpieczenie polowe**: per pole chronione — wybór/utworzenie `protection_ref`
   (jeśli operacja domenowa wspiera; inaczej jawny „następny krok → dobór zabezpieczeń
   pola" prowadzący do istniejącej ścieżki E-11/`add_relay`, bez fabrykacji).
4. **Payload**: `gpz_sections[].bays[]` = `{ bay_role, bay_kind, bay_template_ref,
   switchgear_family_ref, manufacturer_ref, catalog_bindings, protection_ref? }` —
   dokładnie w konwencji `field_spec` kreatora stacji.

## 4. Zakres implementacji (cross-layer — wykonać z regresją backendu)

**Backend** (`enm/domain_operations.py::add_grid_source_sn` + `_normalize_gpz_section_entries`):
- czytać `switchgear_family_ref`/`manufacturer_ref` (GPZ) oraz per-pole `bay_role`,
  `bay_template_ref`, `catalog_bindings`, `protection_ref`,
- materializować Bay z `bay_template_ref`/`switchgear_family_ref`/`manufacturer_ref`/
  `protection_ref` (odwzorowanie kontraktu `field_spec` z `append_station_on_endpoint`),
- walidacja przez Reference Engine (rodzina ↔ dozwolone pola/aparaty),
- determinizm/hash ENM zachowany (`exclude_none` dla pól opcjonalnych).
- **Pełna regresja pytest (~5400) + guardy backendu + determinizm.**

**Frontend** (`ui2/kreatory/zrodlo` K5): reużyć `SwitchgearFamilyPicker` +
`BayTemplatePicker` (opakowane w tokeny `--mvd-*`); rozszerzyć `zrodloModel`
(payload `gpz_sections[].bays[]`); testy kontraktu + realnej ścieżki.

**Koordynacja międzywątkowa:** Reference Engine należy do wątku SLD (V12K-060) —
zmiana czyta pakiety referencyjne READ-ONLY (bez modyfikacji pakietów); wpis
koordynacyjny w rejestrze. Bez zmian `ui/sld/**`.

## 5. Realizacja
Zadanie zarządcy (opcja max, globalne). Implementacja end-to-end w kolejnej fazie
z pełną regresją backendu (zmiana domenowa) — bez fabrykacji dekoracyjnych pól.
