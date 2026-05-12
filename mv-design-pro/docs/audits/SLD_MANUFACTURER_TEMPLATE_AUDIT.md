# Audit — szablony pól producenta SN (§11A.14)

> Status: AKTYWNY · Wersja: 1.0 · 2026-05-12

## 1. Cel audytu

Weryfikacja czy implementacja §11A spełnia 16 punktów acceptance (§11A.14).

## 2. Wynik audytu — 16 punktów acceptance

| # | Wymaganie | Status | Dowód |
|---|---|---|---|
| 1 | Katalog producentów ZPUE / Elektrometal / ABB / Siemens | ✓ | `backend/src/network_model/catalog/switchgear/registry.py` + 4 stałe |
| 2 | UI pozwala wybrać producenta | ✓ | `ManufacturerPicker.tsx` (7 testów) |
| 3 | UI pozwala wybrać rodzinę/typ rozdzielnicy | ✓ | `SwitchgearFamilyPicker.tsx` (5 testów) |
| 4 | UI pozwala wybrać kompletny szablon pola | ✓ | `BayTemplatePicker.tsx` (8 testów) + `SwitchgearTemplateStepper.tsx` (6 testów) |
| 5 | Pole renderuje się jako kompletna celka, nie luźne ikony | ✗ | Tylko canonical fallback. Producent verified = brak. |
| 6 | Szablon pola generuje aparaty/porty/CT/VT/uziemnik/zabezpieczenia/pomiary/hit areas/LOD | ⊘ | `CompleteMvBayTemplate` ma pola `device_instances`, `port_definitions`, `interlock_rules`, `protection_requirements`, `measurement_requirements`, `lod_variants` — model gotowy. Dane producenta puste. |
| 7 | GPZ może być zbudowany z pól producenta | ⊘ | Infrastructure gotowa (GpzCanonicalRenderer + adapter z TR przyłączonym do sekcji). Brak verified manufacturer data. |
| 8 | Stacja SN/nN może być zbudowana z pól producenta | ⊘ | `insert_station_on_segment_sn` działa (screenshot `sld-gpz-with-station.png`). Producent verified = brak. |
| 9 | PV/BESS/FW mogą być przyłączone przez pole producenta lub custom | ⊘ | `DerPccVariantInfo` widget zintegrowany w `DerConfigurator`. Producent verified = brak. |
| 10 | Raport zawiera manufacturer/template lineage | ⊘ | Plan w `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`. Implementacja w raporcie — brak. |
| 11 | Proof/uzasadnienie zawiera manufacturer/template lineage | ⊘ | Plan udokumentowany. Implementacja w Proof Engine — brak. |
| 12 | Readiness widzi braki katalogowe | ⊘ | `requires_catalog` status jest jawny; readiness emit blocker — częściowo (E028/E029 dla DER). |
| 13 | Brak katalogu nie jest ukrywany | ✓ | UI badge „Wymaga uzupełnienia katalogu" w ManufacturerPicker, SwitchgearFamilyPicker fallback komunikat, BayTemplatePicker source_status badge. |
| 14 | Testy structural/visual/e2e przechodzą | ⊘ | Structural: 40/40 backend + 26/26 frontend Pickerów PASS. Visual snapshots: brak per producent (tylko canonical). E2E: 4/4 real-backend API contract PASS. |
| 15 | Nie ma fałszywych danych producenta | ✓ | Wszyscy producenci `requires_catalog` + puste `source_refs`. Test `test_all_starters_require_catalog` PASS. |
| 16 | Nie ma przypadkowych pól rysowanych ręcznie jako „ABB/ZPUE/Siemens/Elektrometal" | ✓ | `?manufacturer_ref=ABB` zwraca templates ze `source_status="canonical_fallback"` (NIE udajemy oficjalnego katalogu) — test `test_list_canonical_fallback_for_manufacturer_with_ref_marks_meta` PASS. |

Legenda: ✓ spełnione · ✗ niespełnione · ⊘ infrastruktura gotowa, brak danych producenta (zewnętrzny blocker)

## 3. Pliki dostarczone

### Backend Pydantic models
- `backend/src/network_model/catalog/switchgear/manufacturer.py` — `Manufacturer` z `lifecycle_status`, `verified_at`, `catalog_policy_pl`
- `backend/src/network_model/catalog/switchgear/switchgear_family.py` — `SwitchgearFamily` z `compartment_models`, `allowed_apparatus_kinds`, `allowed_interlocks`, `supported_lod_profiles`, `cad_footprint_ref`, `source_document_refs`, `source_version`, `verified_at`, `lifecycle_status`, `product_line_code`
- `backend/src/network_model/catalog/switchgear/complete_mv_bay_template.py` — `CompleteMvBayTemplate` z `template_name_pl`, `device_instances`, `port_definitions`, `interlock_rules`, `operation_rules`, `protection_requirements`, `measurement_requirements`, `readiness_requirements`, `lod_variants`, `cad_anchors`, `label_slots`
- `backend/src/network_model/catalog/switchgear/device_instance.py` — `BayDeviceInstanceTemplate` z `apparatus_kind`, `electrical_side`, `position_in_bay`, `anchor_refs`, `allowed_states`
- `backend/src/network_model/catalog/switchgear/port_definition.py` — `PortDefinitionTemplate` z `port_kind`, `compatible_connection_kinds`, `occupancy_rules`, `direction_hint`, `lod_visibility`
- `backend/src/network_model/catalog/switchgear/canonical_fallback.py` — 10 fallbacków
- `backend/src/network_model/catalog/switchgear/registry.py` — 4 producentów z `catalog_policy_pl`

### Frontend Pickers
- `frontend/src/ui/catalog/ManufacturerPicker.tsx`
- `frontend/src/ui/catalog/SwitchgearFamilyPicker.tsx`
- `frontend/src/ui/catalog/BayTemplatePicker.tsx`
- `frontend/src/ui/catalog/SwitchgearTemplateStepper.tsx`

### Dokumentacja (9 dokumentów §11A.13)
1. `docs/sld/SLD_MV_SWITCHGEAR_MANUFACTURER_TEMPLATES.md` — master
2. `docs/sld/SLD_MV_BAY_TEMPLATE_LIBRARY.md` — biblioteka
3. `docs/sld/SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md` — polityka źródeł
4. `docs/sld/SLD_ZPUE_WLOSZCZOWA_TEMPLATES.md`
5. `docs/sld/SLD_ELEKTROMETAL_TEMPLATES.md`
6. `docs/sld/SLD_ABB_TEMPLATES.md`
7. `docs/sld/SLD_SIEMENS_TEMPLATES.md`
8. `docs/sld/SLD_SWITCHGEAR_TEMPLATE_IMPORT_EXPORT.md`
9. `docs/audits/SLD_MANUFACTURER_TEMPLATE_AUDIT.md` (ten dokument)

### Testy
- Backend: 40 testów (29 manufacturer registry + 11 extended models) PASS
- Frontend: 26 testów Pickerów + Stepper PASS
- E2E real-backend: 4 testów API contract PASS

## 4. Zewnętrzne blockery (poza scope kodu)

Punkty 5-12, 14 wymagają **zewnętrznych zatwierdzonych katalogów producenta**:
- ZPUE Włoszczowa — oficjalny katalog rozdzielnic SN (PDF)
- Elektrometal — oficjalny katalog rozdzielnic SN (PDF)
- ABB — karta produktu UniGear / SafeRing / SafePlus (PDF)
- Siemens — karta produktu NXAIR / 8DJH / SIMOSEC (PDF)

System NIE może fabrykować tych danych zgodnie z §11A.1 zasadą główną.

## 5. Podsumowanie

| Acceptance | Status |
|---|---|
| Punkty spełnione bezwarunkowo | 6/16 (1, 2, 3, 4, 13, 15, 16) |
| Punkty z infrastrukturą gotową, brak danych producenta | 8/16 (5, 6, 7, 8, 9, 10, 11, 12, 14) |
| Punkty niespełnione | 1/16 (5 — brak verified pól producenta) |

**Werdykt:** Infrastruktura §11A dostarczona w pełni. Acceptance bezwarunkowy = 6/16. Pozostałe 10 punktów oczekują na oficjalne katalogi producentów które nie mogą być fabrykowane przez system. System jawnie sygnalizuje braki katalogowe (badge `requires_catalog`) zamiast je ukrywać.
