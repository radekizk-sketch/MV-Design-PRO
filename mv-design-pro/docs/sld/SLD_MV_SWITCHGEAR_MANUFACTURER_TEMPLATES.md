# SLD — szablony pól SN per producent (§11A) — master dokument

> Status: WIĄŻĄCY · Wersja: 1.0 · Goal §11A

## 1. Cel

System MV-DESIGN-PRO MUSI obsługiwać pełne szablony pól SN konkretnego producenta, rodziny rozdzielnicy i typu pola. Pole SN w SLD nie jest losowym zestawem symboli — pochodzi z jednego z czterech źródeł zgodnie z §11A.1:

1. **Szablon kanoniczny** — producent-niezależny, fallback projektowy.
2. **Szablon producenta** — ZPUE Włoszczowa / Elektrometal / ABB / Siemens.
3. **Szablon projektowy organizacji** — wariant zatwierdzony przez firmę.
4. **Szablon użytkownika** — controlled custom, z walidacją i ostrzeżeniem.

## 2. Reguła nadrzędna — nie fabrykuj danych producenta

**WSZYSCY** czterej startowi producenci (ZPUE Włoszczowa, Elektrometal, ABB, Siemens) mają na start status `requires_catalog` i puste `source_refs`. Status `verified` / `repo_verified` / `official_catalog` zarezerwowany TYLKO dla pozycji z zatwierdzonymi oficjalnymi źródłami (PDF, karta katalogowa, repo verified).

System NIE renderuje pola producenta o `source_status="requires_catalog"` jako „katalogu producenta" — zamiast tego renderuje canonical fallback z badge ostrzegawczym „Wymaga uzupełnienia katalogu".

## 3. Warstwa katalogowa — model danych (§11A.2)

| Pydantic model | Plik | Pola krytyczne |
|---|---|---|
| `Manufacturer` | `backend/src/network_model/catalog/switchgear/manufacturer.py` | `manufacturer_ref`, `status`, `source_refs`, `lifecycle_status`, `verified_at`, `catalog_policy_pl` |
| `SwitchgearFamily` | `backend/src/network_model/catalog/switchgear/switchgear_family.py` | `switchgear_family_ref`, `manufacturer_ref`, `product_line_code`, `network_voltages_kv`/`um_classes_kv` (dawniej `network_voltages_kv/um_classes_kv`, karta K-J 2026-08-14), `compartment_models`, `allowed_apparatus_kinds`, `allowed_interlocks`, `supported_lod_profiles`, `cad_footprint_ref`, `source_document_refs`, `source_version`, `verified_at`, `lifecycle_status` |
| `CompleteMvBayTemplate` | `backend/src/network_model/catalog/switchgear/complete_mv_bay_template.py` | `template_ref`, `manufacturer_ref`, `switchgear_family_ref`, `bay_kind`, `bay_role`, `source_status`, `device_instances`, `port_definitions`, `interlock_rules`, `operation_rules`, `protection_requirements`, `measurement_requirements`, `readiness_requirements`, `lod_variants`, `cad_anchors`, `label_slots`, `hash` |
| `BayDeviceInstanceTemplate` | `backend/src/network_model/catalog/switchgear/device_instance.py` | `device_template_ref`, `apparatus_kind`, `label`, `position_in_bay`, `electrical_side`, `is_required`, `default_state`, `allowed_states` |
| `PortDefinitionTemplate` | `backend/src/network_model/catalog/switchgear/port_definition.py` | `port_template_ref`, `port_kind`, `compatible_connection_kinds`, `occupancy_rules`, `direction_hint`, `lod_visibility` |

## 4. Producenci startowi (§11A.3)

Wszyscy czterej mają status `requires_catalog` i wymagają oficjalnych źródeł przed promocją do `verified`.

- [`SLD_ZPUE_WLOSZCZOWA_TEMPLATES.md`](SLD_ZPUE_WLOSZCZOWA_TEMPLATES.md)
- [`SLD_ELEKTROMETAL_TEMPLATES.md`](SLD_ELEKTROMETAL_TEMPLATES.md)
- [`SLD_ABB_TEMPLATES.md`](SLD_ABB_TEMPLATES.md)
- [`SLD_SIEMENS_TEMPLATES.md`](SLD_SIEMENS_TEMPLATES.md)

## 5. UI flow (§11A.4)

Krok 1 → Krok 6 zaimplementowany w komponentach React:

| Krok | Komponent |
|---|---|
| 1. Producent | `frontend/src/ui/catalog/ManufacturerPicker.tsx` |
| 2. Rodzina | `frontend/src/ui/catalog/SwitchgearFamilyPicker.tsx` |
| 3+4. Typ pola + wariant | `frontend/src/ui/catalog/BayTemplatePicker.tsx` |
| 1-4 Stepper | `frontend/src/ui/catalog/SwitchgearTemplateStepper.tsx` |
| 5. Preview | `BayTemplatePicker` (badge per source_status) |
| 6. Zastosuj | `SwitchgearTemplateStepper.onApply` callback |

## 6. Polityka źródeł

Patrz: [`SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`](SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md).

## 7. Import/Export

Patrz: [`SLD_SWITCHGEAR_TEMPLATE_IMPORT_EXPORT.md`](SLD_SWITCHGEAR_TEMPLATE_IMPORT_EXPORT.md).

## 8. Audyt

Patrz: [`docs/audits/SLD_MANUFACTURER_TEMPLATE_AUDIT.md`](../audits/SLD_MANUFACTURER_TEMPLATE_AUDIT.md).

## 9. Acceptance (§11A.14)

Patrz audyt — punkty 1-16. Status: częściowo dostarczone (infrastruktura + UI + canonical fallback + 4 producenci ze statusem `requires_catalog`). Brak: oficjalne katalogi producentów (wymaga zewnętrznych źródeł).
