# Audyt Uruchomienia Produkcyjnego — 2026-02-20

## Zakres

Audyt gotowości systemu MV-DESIGN-PRO do wdrożenia produkcyjnego
zgodnie z Kanonicznym Master Promptem Wykonawczym (§0–§17).

## Status po audycie

| Komponent | Status | Uwagi |
|-----------|--------|-------|
| Katalog typów (CatalogBinding) | ✅ PROD | Pełny model wiązania z 14 przestrzeniami nazw |
| MaterializationContract | ✅ PROD | Kontrakty dla wszystkich namespace (12/14, CONVERTER/INVERTER zwolnione) |
| Materializacja parametrów | ✅ NOWY | Silnik materializacji z audytem, hashowaniem |
| Gotowość obliczeń (Readiness) | ✅ PROD | ReadinessProfileV1 z BLOCKER/WARNING/INFO |
| Sprawdzanie gotowości | ✅ NOWY | Skaner snapshot z wykrywaniem brakujących wiązań |
| Szybkie naprawy (FixActions) | ✅ PROD | Mapowanie kod→FixAction dla wszystkich BLOCKERów |
| Operacje domenowe (API) | ✅ NOWY | Router /api/v1/domain-ops z 39 operacjami kanonicznymi |
| Wymuszanie katalogu (422) | ✅ NOWY | Blokada 422 dla operacji bez CatalogBinding |
| U_dolne z katalogu | ✅ PROD | voltage_lv_kv w solver_fields TRAFO_SN_NN |
| Snapshot deterministyczny | ✅ PROD | SHA-256 fingerprint, test 100× |
| Strażnicy CI | ✅ ROZSZERZONY | Nowe: catalog_enforcement, transformer_voltage, forbidden_ui_terms |
| Test E2E | ✅ NOWY | 12-krokowy scenariusz z asercjami deterministyczności |

## Nowe pliki

### Backend

| Plik | Opis |
|------|------|
| `src/network_model/catalog/materialization.py` | Silnik materializacji katalogowej |
| `src/network_model/catalog/readiness_checker.py` | Skaner gotowości snapshot |
| `src/api/domain_operations.py` | API operacji domenowych |
| `tests/test_catalog_materialization.py` | Testy materializacji (deterministyczność, walidacja, U_dolne) |
| `tests/e2e/test_production_scenario.py` | E2E 12-krokowy scenariusz produkcyjny |

### Strażnicy CI

| Plik | Opis |
|------|------|
| `scripts/catalog_enforcement_guard.py` | Sprawdza pokrycie kontraktów i wiązań |
| `scripts/transformer_catalog_voltage_guard.py` | Sprawdza voltage_lv_kv w katalogu trafo |
| `scripts/forbidden_ui_terms_guard.py` | Skanuje UI pod kątem zakazanych angielskich terminów |

## Architektura materializacji

```
CatalogBinding (payload operacji)
        │
        ▼
MaterializationContract (MATERIALIZATION_CONTRACTS)
        │
        ▼
CatalogRepository.get_*_type(item_id)
        │
        ▼
solver_fields → kopiowane do Snapshot (element.materialized_params)
ui_fields → wyświetlane w UI (podgląd katalogu)
audit → ślad materializacji (co, z jakiej wersji, jakie pola)
```

## Wymuszanie katalogu (§4)

Operacje tworzące elementy techniczne MUSZĄ zawierać `catalog_binding`:
- `continue_trunk_segment_sn`
- `start_branch_segment_sn`
- `insert_station_on_segment_sn`
- `add_transformer_sn_nn`
- `add_nn_load`
- `add_converter_source`
- `add_converter_source`
- `add_relay`
- `add_ct`, `add_vt`
- `add_nn_outgoing_field`
- `insert_section_switch_sn`

Brak wiązania → HTTP 422 z kodem `catalog.binding_required` i szybką naprawą.

## Gotowość obliczeń (§8)

Sprawdzane warunki:
- Źródło zasilania (GPZ): napięcie > 0, Sk3 > 0
- Odcinki: długość > 0, katalog przypisany, materializacja wykonana
- Transformatory: katalog przypisany, voltage_lv_kv > 0
- Falowniki (PV/BESS): katalog przypisany
- Topologia: co najmniej 1 gałąź

Każdy BLOCKER ma komunikat PL + kod + FixAction.

## U_dolne z katalogu (§5)

- `voltage_lv_kv` jest w `solver_fields` kontraktu TRAFO_SN_NN
- Materializacja kopiuje wartość z rekordu katalogowego
- Readiness checker weryfikuje: `voltage_lv_kv > 0` (BLOCKER jeśli brak)
- Strażnik CI: `transformer_catalog_voltage_guard.py` blokuje deploy

## Deterministyczność (§13)

Test E2E 12-krokowy:
1. Pusty graf → snapshot
2. Źródło GPZ → zmiana fingerprint
3. 3× segment magistrali z katalogiem → materializacja
4. Zmiana fingerprint po każdej operacji
5. Materializacja kabla → solver_fields
6. Materializacja trafo → voltage_lv_kv
7. Gotowość pustej sieci → BLOCKER
8. Gotowość z źródłem → mniej BLOCKERów
9. Deterministyczność gotowości (2×)
10. Fingerprint 100× deterministyczny
11. Hash gotowości 100× deterministyczny
12. Brak błędów wewnętrznych (no-500)

## Strażnicy CI

| Strażnik | Weryfikuje |
|----------|-----------|
| `catalog_enforcement_guard` | CatalogBinding, MaterializationContract, kody gotowości |
| `transformer_catalog_voltage_guard` | voltage_lv_kv/hv_kv w kontrakcie i katalogu |
| `forbidden_ui_terms_guard` | Brak angielskich terminów w UI |
| `pcc_zero_guard` | Brak PCC w repo |
| `no_codenames_guard` | Brak nazw kodowych w UI |

## Wnioski

System osiągnął stan gotowości produkcyjnej z:
- Pełnym wymuszaniem katalogu w operacjach domenowych
- Materializacją parametrów z audytem
- Gotowością obliczeń z szybkimi naprawami
- 100% deterministycznością snapshot i gotowości
- Strażnikami CI zabezpieczającymi regresję
