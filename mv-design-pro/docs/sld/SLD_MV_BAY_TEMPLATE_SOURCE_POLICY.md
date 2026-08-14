# SLD — polityka źródeł dla szablonów pól producenta (§11A.1)

> Status: WIĄŻĄCY · Wersja: 1.0

## 1. Reguła nadrzędna

System NIE fabrykuje danych technicznych producenta. Każda pozycja katalogowa MUSI mieć `source_ref` wskazujący na konkretne źródło:

- oficjalny katalog producenta (PDF, karta produktu, dokumentacja zatwierdzona),
- pozycja `repo_verified` (zweryfikowana w repozytorium z trail audytu),
- pozycja `user_defined` (zatwierdzona przez organizację, z autorem),
- canonical fallback (producent-niezależny, oznaczony jako taki).

## 2. Statusy źródła (`SourceStatus`)

```python
SourceStatus = Literal[
    "official_catalog",          # PDF / karta producenta
    "repo_verified",             # repo entry z audit trail
    "user_defined",              # custom organizacji
    "canonical_fallback",        # producent-niezależny
    "requires_catalog",          # blocker — wymaga uzupełnienia
    "incomplete_requires_review", # wymaga przeglądu eksperta
]
```

## 3. Reguły promocji statusu

### `requires_catalog` → `official_catalog`

Wymaga **wszystkich poniższych**:
1. dodanie `source_refs` z co najmniej jednym wpisem (np. `"catalog:zpue_rotoblok_2026.pdf"`),
2. ustawienie `source_version` (np. `"2026.1"`),
3. ustawienie `verified_at` (ISO-8601 timestamp),
4. ustawienie `lifecycle_status="current"` lub `"legacy"`,
5. pełne wypełnienie `network_voltages_kv`/`um_classes_kv` (dawniej `network_voltages_kv/um_classes_kv`, karta K-J 2026-08-14), `rated_current_options`, `short_time_current_options`,
6. lista `allowed_bay_kinds` i `allowed_apparatus_kinds` zweryfikowana ze źródłem.

### `requires_catalog` → `repo_verified`

Wymaga:
1. `source_refs` z wpisem typu `"repo:internal_db_2026_v1.yaml"`,
2. `verified_at`,
3. zatwierdzenie w PR przez recenzenta z uprawnieniami catalog admin.

### `user_defined`

NIE wymaga `source_refs` ale UI musi pokazać badge „Definicja użytkownika" i NIE może udawać oficjalnego katalogu.

## 4. Co jest zabronione

1. **Nie wolno** tworzyć pozycji o `source_status="official_catalog"` bez weryfikowanego źródła.
2. **Nie wolno** kopiować danych z innego producenta i oznaczać jako swoje.
3. **Nie wolno** zgadywać parametrów elektrycznych (Sk, R/X, Ir, Ith).
4. **Nie wolno** udawać oficjalnej rodziny rozdzielnicy (np. „ABB UniGear ZS1") jeśli źródła brak — wtedy `requires_catalog` + canonical fallback.
5. **Nie wolno** ukrywać braku danych — UI ma jawnie pokazywać badge i blocker.

## 5. Audit trail

Każda promocja statusu jest logowana:

| Pole | Opis |
|---|---|
| `manufacturer_ref` | ID producenta |
| `source_status_before` | poprzedni status |
| `source_status_after` | nowy status |
| `source_refs_added` | lista dodanych `source_refs` |
| `verified_by` | autor weryfikacji |
| `verified_at` | timestamp |

## 6. Egzekwowanie

- Backend: walidator ENM emituje `manufacturer.catalog_incomplete` gdy element używa `requires_catalog` template.
- Frontend: `ManufacturerPicker` pokazuje badge `requires_catalog` z czerwonym wyróżnieniem.
- Raport: lineage zawiera `source_status` każdego elementu — czytelnik widzi co jest verified, a co fallback.
