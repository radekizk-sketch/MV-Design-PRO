# Braki danych do obliczeń — Panel FixActions

## Cel

Dokument opisuje działanie panelu „Braki danych do obliczeń"
(SchemaCompletenessPanel) oraz mechanizm FixActions.

## Jak działa panel braków

### Grupowanie

Panel grupuje braki wg kategorii:
- **Magistrala SN** — trunk, segment, line, cable
- **Stacje** — station, bay, field
- **Transformatory** — transformer, trafo
- **Źródła** — source, PV, BESS, genset, UPS, generator
- **Zabezpieczenia** — protection, relay, CT, VT
- **Katalog** — catalog, type_ref, materialization
- **Inne** — kody niesklasyfikowane

### Sortowanie

Deterministyczne: priorytet (BLOCKER > WAŻNE > INFO) → kategoria → kod → element_id

### Przyciski

Każdy wpis ma:
1. **Przejdź** — centrowanie + zaznaczenie elementu na SLD + otwarcie inspektora
2. **Napraw** — uruchamia FixAction:
   - `OPEN_MODAL` — otwiera okno edycji parametrów
   - `SELECT_CATALOG` — otwiera selektor katalogowy
   - `ADD_MISSING_DEVICE` — otwiera okno dodawania urządzenia
   - `NAVIGATE_TO_ELEMENT` — nawiguje do elementu

### Automatyczne odświeżanie

Po każdej operacji domenowej (DomainOpResponseV1):
- Nowy Snapshot → readiness przeliczany
- Naprawiony wpis znika natychmiast
- Nowe problemy pojawiają się natychmiast

## Mapowanie FixAction → Okno

Backend wysyła `modal_type` (np. `SourceModal`, `NodeModal`).
Frontend mapuje przez `BACKEND_MODAL_TYPE_MAP` na `MODAL_ID`:

| Backend modal_type | Frontend MODAL_ID | Okno |
|---|---|---|
| SourceModal | MODAL_DODAJ_ZRODLO_SN | Dodaj źródło SN (GPZ) |
| NodeModal | MODAL_ZMIEN_PARAMETRY | Zmień parametry elementu |
| BranchModal | MODAL_DODAJ_ODGALEZIENIE_SN | Dodaj odgałęzienie SN |
| TransformerModal | MODAL_DODAJ_TRANSFORMATOR | Dodaj transformator SN/nN |
| LoadModal | MODAL_DODAJ_ODBIOR | Dodaj odbiór |
| CatalogPicker | MODAL_ZMIEN_TYP_Z_KATALOGU | Zmień typ z katalogu |
| GeneratorModal | MODAL_ZMIEN_PARAMETRY | Zmień parametry elementu |
| FieldDeviceModal | MODAL_DODAJ_POLE_SN | Dodaj pole SN |
| ProtectionBindingModal | MODAL_DODAJ_ZABEZPIECZENIE | Dodaj zabezpieczenie |

## Pełna lista kodów BLOCKER z FixActions

### ENMValidator (E001-E011)

| Kod | Opis | FixAction |
|-----|------|-----------|
| E001 | Brak źródła zasilania | ADD_MISSING_DEVICE → SourceModal |
| E002 | Brak szyn | ADD_MISSING_DEVICE → NodeModal |
| E003 | Graf niespójny (wyspy) | NAVIGATE_TO_ELEMENT |
| E004 | Szyna bez napięcia | OPEN_MODAL → NodeModal |
| E005 | Gałąź bez impedancji | OPEN_MODAL → BranchModal |
| E006 | Transformator bez uk% | OPEN_MODAL → TransformerModal |
| E007 | Transformator hv=lv | OPEN_MODAL → TransformerModal |
| E008 | Źródło bez param. zwarciowych | OPEN_MODAL → SourceModal |
| E009 | Brak ref. katalogowej | SELECT_CATALOG |
| E010 | Overrides bez OVERRIDE | NAVIGATE_TO_ELEMENT |
| E011 | Wartość projektanta maszyny wirującej albo aparatu SN spoza bramy rejestru wartości roboczych (kanon: `catalog.wartosc_projektanta_niedopuszczalna`) | NAVIGATE_TO_ELEMENT → sekcja wartości projektanta kreatora edycji parametrów |

### Generator Validation

| Kod | Opis | FixAction |
|-----|------|-----------|
| catalog.ref_missing | Generator bez katalogu | SELECT_CATALOG → CatalogPicker |
| generator.connection_variant_missing | OZE bez wariantu | OPEN_MODAL → GeneratorModal |
| generator.station_ref_missing | Wariant A bez station_ref | OPEN_MODAL → GeneratorModal |
| generator.station_ref_invalid | Stacja nie istnieje | OPEN_MODAL → GeneratorModal |
| generator.block_transformer_missing | Wariant B bez transformatora | OPEN_MODAL → TransformerModal |
| generator.block_transformer_invalid | Transformator nie istnieje | OPEN_MODAL → TransformerModal |

### Station Field Validation

| Kod | Opis | FixAction |
|-----|------|-----------|
| station.nn_without_transformer | Stacja nN bez transformatora | ADD_MISSING_DEVICE → TransformerModal |
| field.device_missing.{type} | Pole brak aparatu | ADD_MISSING_DEVICE → FieldDeviceModal |
| protection.binding_missing | Zabezpieczenie bez wiązania CB | OPEN_MODAL → ProtectionBindingModal |

## Reguła: Każdy BLOCKER ma FixAction

Test CI `test_all_blockers_have_fix_actions` weryfikuje, że żaden kod BLOCKER
nie jest bez ścieżki naprawy. Guard `fix_action_completeness_guard.py` blokuje PR.

## Powiązane dokumenty

- [URUCHOMIENIE_UX_SLD.md](./URUCHOMIENIE_UX_SLD.md) — scenariusz uruchomieniowy
- [KATALOG_WIAZANIE_I_MATERIALIZACJA.md](./KATALOG_WIAZANIE_I_MATERIALIZACJA.md) — wiązanie katalogowe
