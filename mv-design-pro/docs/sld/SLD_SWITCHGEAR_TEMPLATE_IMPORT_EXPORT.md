# SLD — import/export bibliotek szablonów producenta (§11A.9)

> Status: PLANOWANY · Wersja: 0.1 · Goal §11A.9

## 1. Cel

Mechanizm importu i eksportu kompletnej biblioteki katalogowej producenta (Manufacturer + SwitchgearFamily + CompleteMvBayTemplate + BayDeviceInstanceTemplate + PortDefinitionTemplate + InterlockRules + LODFootprints + CADFootprints).

## 2. Format

JSON/YAML z deterministycznym hashem SHA-256 całej biblioteki. Każda pozycja ma `version` i `hash`.

```yaml
manifest:
  library_name_pl: "ABB UniGear ZS1 — biblioteka rozdzielnic"
  manufacturer_ref: "ABB"
  source_version: "2026.1"
  verified_at: "2026-01-15T00:00:00Z"
  hash_sha256: "<hash całej biblioteki>"

manufacturers:
  - manufacturer_ref: "ABB"
    status: "verified"
    source_refs: ["catalog:abb_unigear_zs1_2026.pdf"]
    lifecycle_status: "current"

switchgear_families:
  - switchgear_family_ref: "ABB__UNIGEAR_ZS1"
    manufacturer_ref: "ABB"
    family_name: "UniGear ZS1"
    voltage_levels: [12, 17.5, 24]
    rated_current_options: [1250, 2500, 4000]
    short_time_current_options: [25, 31, 50]
    insulation_type: "air"
    construction_type: "wysuwna"
    busbar_system: "single"
    compartment_models: ["cable_compartment", "busbar_compartment", "apparatus_compartment"]
    status: "verified"
    source_document_refs: ["catalog:abb_unigear_zs1_2026.pdf"]
    source_version: "2026.1"

complete_mv_bay_templates:
  - template_ref: "ABB__UNIGEAR_ZS1__LINE_OUT"
    manufacturer_ref: "ABB"
    switchgear_family_ref: "ABB__UNIGEAR_ZS1"
    bay_kind: "liniowe_odplywowe"
    bay_role: "OUT"
    source_status: "official_catalog"
    source_refs: ["catalog:abb_unigear_zs1_2026.pdf#page=42"]
    template_name_pl: "Pole liniowe odpływowe — ABB UniGear ZS1"
    device_instances: [...]
    port_definitions: [...]
    interlock_rules: [...]
    operation_rules: [...]
    protection_requirements: [...]
    measurement_requirements: [...]
    readiness_requirements: [...]
    lod_variants: ["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"]
    cad_anchors: {...}
    label_slots: [...]
    version: "1.0"
    hash: "<sha256>"
```

## 3. API endpointy (planowane)

```
POST   /api/catalog/switchgear/library/import       # Import biblioteki
GET    /api/catalog/switchgear/library/export       # Export całej biblioteki
GET    /api/catalog/switchgear/library/export/{manufacturer_ref}  # Export per producent
POST   /api/catalog/switchgear/library/validate     # Walidacja przed importem
```

## 4. Reguły importu

1. Walidacja przed mutacją.
2. Pozycje z `source_status="official_catalog"` MUSZĄ mieć `source_refs`.
3. Konflikt wersji → 409 Conflict (chyba że tryb `replace`).
4. Hash całej biblioteki musi być deterministyczny.
5. Audit trail: kto, kiedy, jakie pozycje dodał.

## 5. Reguły eksportu

1. Deterministyczne sortowanie (`manufacturer_ref`, `switchgear_family_ref`, `template_ref`).
2. Hash całej biblioteki w manifeście.
3. `verified_at` zachowany z oryginałów.

## 6. Status implementacji

| Komponent | Status |
|---|---|
| Format JSON/YAML schema | dokumentacja gotowa, kod brak |
| Endpoint `POST .../library/import` | brak |
| Endpoint `GET .../library/export` | brak |
| Audit trail | brak |
| Reguły konfliktów | brak |

Implementacja w kolejnej iteracji po dostarczeniu pierwszego zweryfikowanego katalogu producenta.
