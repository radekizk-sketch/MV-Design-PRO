# SLD — biblioteka szablonów pól SN (§11A)

> Status: WIĄŻĄCY · Wersja: 1.0

## 1. Cel

Biblioteka `CompleteMvBayTemplate` udostępnia szablony per (manufacturer × family × bay_kind × variant). Każdy szablon generuje **pełne SLD pole** zgodnie z §11A.5 (15 wymagań).

## 2. Struktura biblioteki

```
backend/src/network_model/catalog/switchgear/
├── manufacturer.py              # Manufacturer model
├── switchgear_family.py         # SwitchgearFamily model
├── complete_mv_bay_template.py  # CompleteMvBayTemplate model
├── device_instance.py           # BayDeviceInstanceTemplate
├── port_definition.py           # PortDefinitionTemplate
├── canonical_fallback.py        # 10 kanonicznych fallbacków
├── registry.py                  # ManufacturerRegistry (4 producentów)
└── __init__.py                  # Public API
```

## 3. Canonical fallback (10 templates)

Producent-niezależne szablony jako fallback gdy producent ma `requires_catalog`:

| template_ref | bay_kind | bay_role |
|---|---|---|
| CANONICAL_FALLBACK__LINE_IN | liniowe_doplywowe | IN |
| CANONICAL_FALLBACK__LINE_OUT | liniowe_odplywowe | OUT |
| CANONICAL_FALLBACK__TRANSFORMER | transformatorowe | TR |
| CANONICAL_FALLBACK__MEASUREMENT | pomiarowe | MEASUREMENT |
| CANONICAL_FALLBACK__COUPLER | sprzeglowe_poprzeczne | COUPLER |
| CANONICAL_FALLBACK__DER_PV | pv | OZE |
| CANONICAL_FALLBACK__DER_BESS | bess | OZE |
| CANONICAL_FALLBACK__DER_FW | fw | OZE |
| CANONICAL_FALLBACK__RESERVE | rezerwowe | FEEDER |
| CANONICAL_FALLBACK__AUX | potrzeb_wlasnych | FEEDER |

Wszystkie z `source_status="canonical_fallback"` — UI pokazuje badge „Szablon kanoniczny ogólny (fallback)".

## 4. API endpointy

| Endpoint | Opis |
|---|---|
| `GET /api/catalog/manufacturers` | Lista 4 producentów |
| `GET /api/catalog/complete-bay-templates` | 10 canonical fallback |
| `GET /api/catalog/complete-bay-templates?manufacturer_ref=ZPUE_WLOSZCZOWA` | 10 fallback z manufacturer_ref="ZPUE_WLOSZCZOWA" |
| `GET /api/catalog/complete-bay-templates?bay_kind=transformatorowe` | Tylko pole transformatorowe |

## 5. Status weryfikacji

Każdy szablon ma `source_status`:

| status | UI badge | Działanie |
|---|---|---|
| `official_catalog` | „Oficjalny katalog producenta" | Pełne dane producenta |
| `repo_verified` | „Zweryfikowany w repozytorium" | Repo verified entry |
| `user_defined` | „Definicja użytkownika" | Custom z walidacją |
| `canonical_fallback` | „Szablon kanoniczny ogólny (fallback)" | Producent-niezależny |
| `requires_catalog` | „Wymaga uzupełnienia katalogu" | Blocker w UI |

## 6. Testy

- `backend/tests/network_model/catalog/test_switchgear_manufacturer_registry.py` (29 testów)
- `backend/tests/network_model/catalog/test_switchgear_extended_models.py` (11 testów)
- `frontend/src/ui/catalog/__tests__/ManufacturerPicker.test.tsx` (7 testów)
- `frontend/src/ui/catalog/__tests__/SwitchgearFamilyPicker.test.tsx` (5 testów)
- `frontend/src/ui/catalog/__tests__/BayTemplatePicker.test.tsx` (8 testów)
- `frontend/src/ui/catalog/__tests__/SwitchgearTemplateStepper.test.tsx` (6 testów)
