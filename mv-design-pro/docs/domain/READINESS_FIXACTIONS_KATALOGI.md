# READINESS, FIXACTIONS i KATALOGI — KANON WIĄŻĄCY

> Dokument wiążący: definiuje system gotowości, akcji naprawczych i katalogu.
> Patrz też: `READINESS_FIXACTIONS_CANONICAL_PL.md` (szczegółowy opis kodów).

## 1. BLOKERY GOTOWOŚCI (E001–E011)

| Kod | Warunek | Blokuje | Akcja naprawcza |
|-----|---------|---------|-----------------|
| E001 | Brak źródła zasilania (grid source) | Analizy | Dodaj GPZ (add_grid_source_sn) |
| E002 | Brak szyn (buses) | Analizy | Dodaj szynę |
| E003 | Graf rozspójniony (wyspy) | Analizy | Połącz wyspy |
| E004 | Napięcie szyny ≤ 0 kV | Analizy | Ustaw napięcie |
| E005 | Gałąź R=0 AND X=0 | Analizy | Przypisz katalog (assign_catalog_to_element) |
| E006 | Trafo bez uk% | Analizy | Przypisz katalog (assign_catalog_to_element) |
| E007 | Trafo HV=LV bus | Analizy | Podłącz do różnych szyn |
| E008 | Źródło bez Sk3/Ik3 | Analizy | Ustaw parametry zwarciowe |
| E009 | Element bez catalog_ref | Analizy | Wybierz z katalogu (SELECT_CATALOG) |
| E010 | Override bez parameter_source="OVERRIDE" | Analizy | Ustaw flagę źródła |
| E011 | Wartość projektanta (`overrides`) maszyny wirującej albo aparatu SN spoza bramy rejestru wartości roboczych (`enm/wartosci_projektanta.py`) | Analizy | Popraw albo usuń wartość w sekcji wartości projektanta (update_element_parameters) |

## 2. SYSTEM FIXACTIONS

Każdy bloker generuje FixAction z nawigacją do UI:

```json
{
  "action_type": "SELECT_CATALOG | OPEN_MODAL | NAVIGATE_TO_ELEMENT | ADD_MISSING_DEVICE",
  "element_ref": "seg/trunk/1",
  "modal_type": "CatalogPicker | BranchModal | TransformerModal",
  "payload_hint": { "namespace": "KABEL_SN" }
}
```

## 3. KATALOG — MATERIALIZACJA

### Przestrzenie nazw (Namespaces)

| Namespace | Typ elementu | Parametry materializowane |
|-----------|-------------|--------------------------|
| KABEL_SN | Kabel SN | r_ohm_per_km, x_ohm_per_km, b_siemens_per_km, rated_current_a |
| LINIA_SN | Linia napowietrzna SN | r_ohm_per_km, x_ohm_per_km, rated_current_a |
| TRAFO_SN_NN | Transformator SN/nN | sn_mva, uhv_kv, ulv_kv, uk_percent, pk_kw |
| APARAT_SN | Aparatura SN | rated_current_a, rated_voltage_kv |

### Flow materializacji

```
assign_catalog_to_element(element_ref, catalog_item_id)
    ↓
element.catalog_ref = catalog_item_id
element.parameter_source = "CATALOG"
    ↓
solver_input/builder.py: resolve_line_params() / resolve_transformer_params()
    ↓
solver dostaje wartości z katalogu (nie z ENM)
```

### Priorytety rozwiązywania parametrów

| Priorytet | Źródło | Kiedy |
|-----------|--------|-------|
| 1 | impedance_override | Jawny override eksperta |
| 2 | type_ref (catalog) | Przypisany katalog |
| 3 | instance | Wartości w snapshot (fallback) |

### Bramka katalogowa (DOUBLE GATE)

- **Backend**: operacje domenowe odrzucają tworzenie bez catalog_ref (`error_code: "catalog.ref_required"`)
- **Frontend**: context menu sprawdza potrzebę katalogu przed emisją operacji

### Brak katalogu: konsekwencje

| Co blokuje | Co NIE blokuje |
|------------|----------------|
| Rozpływ mocy | Rysowanie SLD |
| Zwarcia | Budowa sieci (operacje domenowe z catalog_ref) |
| Dowolne analizy (readiness E005, E006, E009) | Podgląd topologii |
