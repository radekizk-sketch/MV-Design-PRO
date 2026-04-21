> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 16 — Integracje Zewnętrzne, Interoperacyjność, Wymiana Danych (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Infrastructure + Application
**Zależności:** Rozdział 11 (Raportowanie), 12 (Walidacje), 13 (Raporty formalne), 14 (Determinizm), 15 (Governance)
**Decision Matrix:** Decyzje #121–#126

---

## §16.0 Zakres i cel

### §16.0.1 Zasada nadrzędna

> **Żadne dane nie opuszczają MV-DESIGN-PRO bez jawnego kontextu,
> wersji, zakresu i odpowiedzialności.**

Integracja:
- nigdy nie jest „eksportem surowym",
- zawsze niesie metadane decyzyjne,
- jest audytowalna i odtwarzalna.

### §16.0.2 Granica

Rozdział 16 definiuje **kontrakty graniczne systemu** — co wchodzi, co wychodzi,
w jakiej formie i z jakimi gwarancjami. NIE zmienia ENM ani solverów.

---

## §16.1 Klasy integracji (ZAMKNIĘTA LISTA)

### §16.1.1 Integracje modelu (MODEL)

| Kierunek | Opis | Format | Status |
|----------|------|--------|--------|
| Export ENM | Eksport modelu sieci | JSON (canonical) | AS-IS |
| Import ENM | Import z pliku JSON/XLSX | JSON, XLSX | AS-IS (XlsxNetworkImporter) |
| Export Type Library | Eksport katalogu typów | JSON | AS-IS |
| Import Type Library | Import katalogu z pliku | JSON | TO-BE |
| Export ProjectArchive | Pełny eksport projektu (ZIP) | ZIP (deterministic) | AS-IS (ProjectArchive) |
| Import ProjectArchive | Import projektu z ZIP | ZIP | AS-IS |

AS-IS: `XlsxNetworkImporter` (`application/xlsx_import/importer.py`),
`ProjectArchive` (`domain/project_archive.py`), `verify_archive_integrity()`.

### §16.1.2 Integracje wyników (RESULT)

| Kierunek | Opis | Format | Status |
|----------|------|--------|--------|
| Export raportów | PDF/DOCX/JSON/CSV | Multi-format | AS-IS (Rozdział 11) |
| Export White Box | ProofPack (ZIP) | ZIP (deterministic) | AS-IS |
| Export porównań | RunComparisonResult | JSON | AS-IS |
| Export EnergyValidation | EnergyValidationView | JSON | AS-IS |

### §16.1.3 Integracje procesowe (PROCESS)

| Kierunek | Opis | Format | Status |
|----------|------|--------|--------|
| CI/CD artifacts | Raporty i ProofPack jako artefakty CI | ZIP, JSON | AS-IS (§14.8) |
| REST API | Endpointy obliczeniowe | JSON | AS-IS (Rozdział 11 API) |
| Webhook notifications | Powiadomienia o statusie run | JSON | TO-BE |

---

## §16.2 Formaty wymiany danych (BINDING)

### §16.2.1 Dozwolone formaty

| Format | Przeznaczenie | Determinizm | Metadane |
|--------|---------------|-------------|----------|
| JSON | Machine-readable, API, archiwum | ✓ (sort_keys, canonical) | ✓ (header) |
| JSONL | White Box trace, streaming | ✓ (1 event/line) | ✓ (per-event) |
| CSV | Tabele liczbowe, Excel import | ✓ (sorted rows, UTF-8) | Ograniczone |
| XLSX | Import danych sieciowych | — (input) | Import metadata |
| PDF | Odbiór formalny, podpis | ✓ (reportlab) | ✓ (w treści) |
| DOCX | Edytowalny, wersje robocze | ✓ (make_docx_deterministic) | ✓ (w treści) |
| ZIP | ProofPack, ProjectArchive | ✓ (sorted entries, fixed timestamps) | ✓ (manifest) |

### §16.2.2 Zakazy

- **Z-INT-01:** Eksport binarny bez specyfikacji formatu jest ZAKAZANY.
- **Z-INT-02:** Eksport bez metadanych (brak project_id, hash_enm, wersji) jest ZAKAZANY.
- **Z-INT-03:** Import bez walidacji (W1+W2) jest ZAKAZANY.

---

## §16.3 Metadane integracyjne (OBOWIĄZKOWE)

Każdy eksport MUSI zawierać:

| Pole | Opis | Wymagane |
|------|------|----------|
| project_id | UUID projektu | ✓ |
| project_name | Nazwa projektu | ✓ |
| hash_enm | Hash strukturalny ENM | ✓ |
| hash_case | Hash StudyCase (jeśli dotyczy) | Jeśli dotyczy |
| run_id | UUID AnalysisRun (jeśli dotyczy) | Jeśli dotyczy |
| result_hash | Hash wyników (jeśli dotyczy) | Jeśli dotyczy |
| spec_version | Wersja specyfikacji MV-DESIGN-PRO | ✓ |
| export_timestamp | Timestamp eksportu (ISO 8601 UTC) | ✓ |
| approval_status | Draft / Approved / Frozen | ✓ |

> **INV-INT-01:** Eksport bez metadanych jest nieprawidłowy i MUSI być odrzucony
> przez system odbierający.

---

## §16.4 Integracje z systemami OSD

### §16.4.1 Eksport raportów do OSD

- Format: PDF (do podpisu) lub DOCX (do edycji).
- Status: Approved lub Frozen (Rozdział 15 §15.1.4).
- Treść: kompletna struktura raportu (Rozdział 13 §13.2).
- Warunek: raport MUSI przejść walidacje raportowe (Rozdział 11 §11.8).

### §16.4.2 Wymagania formalne OSD

| Wymaganie | Spełnienie |
|-----------|-----------|
| Raporty z metadanymi | ✓ (§16.3) |
| Wyniki deterministyczne | ✓ (Rozdział 14) |
| White Box jako dowód | ✓ (ProofPack) |
| Zgodność z IEC 60909 | ✓ (solver certification — golden tests) |
| Archiwizacja wyników | ✓ (ProjectArchive ZIP) |

### §16.4.3 Zakaz modyfikacji po eksporcie

> **Z-INT-04:** Dane eksportowane do OSD (status Approved/Frozen) NIE MOGĄ
> być modyfikowane. Zmiana = nowa wersja z nowym report_hash.

---

## §16.5 Import danych zewnętrznych

### §16.5.1 Pipeline importu

```
Plik zewnętrzny (JSON / XLSX / ZIP)
  │
  ▼
1. Parsowanie formatu (XlsxNetworkImporter / JSON parser)
  │
  ▼
2. Mapowanie na struktury ENM
  │
  ▼
3. Walidacja W1 (ENMValidator) — E001–I005
  │
  ▼
4. Walidacja W2 (NetworkValidator) — 13 reguł grafowych
  │
  ▼
5. Oznaczenie źródła: EXTERNAL_IMPORT
  │
  ▼
6. Mapowanie na Type Library (catalog_ref matching)
  │
  ▼
ENM (załadowany, zwalidowany)
```

### §16.5.2 XlsxNetworkImporter (AS-IS)

```python
# application/xlsx_import/importer.py

class XlsxNetworkImporter:
    def import_from_file(path) -> XlsxImportResult

class XlsxImportResult:
    enm: EnergyNetworkModel
    warnings: list[str]
    errors: list[str]

class XlsxValidationError(Exception):
    pass
```

### §16.5.3 ProjectArchive (AS-IS)

```python
# domain/project_archive.py

def verify_archive_integrity(archive: ProjectArchive) -> list[str]
# Weryfikuje spójność archiwum: hash plików, struktura, wersja.
```

### §16.5.4 Zakazy importu

- **Z-INT-05:** Import „zaufany" (bez walidacji W1+W2) jest ZAKAZANY.
- **Z-INT-06:** Import danych bez oznaczenia źródła jest ZAKAZANY.

---

## §16.6 API — zasady bezpieczeństwa

### §16.6.1 Wersjonowanie API

| Aspekt | Reguła |
|--------|--------|
| Prefix | `/api/v1/` (TO-BE: currently `/api/`) |
| Breaking change | Wymaga major version bump + ADR |
| Deprecation | Minimum 1 version overlap |

### §16.6.2 Autoryzacja (TO-BE)

> **TO-BE** — nie zaimplementowane. Wymaga osobnej decyzji.

| Aspekt | Planowane |
|--------|-----------|
| Authentication | JWT / API key |
| Authorization | Role-based (Author/Reviewer/Approver/Auditor) |
| Read-only endpoints | GET — no auth required (v1) |
| Write endpoints | POST/PUT/DELETE — auth required |

### §16.6.3 Logowanie dostępu (TO-BE)

> **TO-BE** — nie zaimplementowane.

Każdy dostęp do API MUSI być logowany: endpoint, timestamp, user, action.

---

## §16.7 White Box a integracje

White Box MUSI rejestrować:
- eksport: co wyeksportowano, w jakim formacie, do kogo (jeśli znane),
- import: co zaimportowano, skąd, wyniki walidacji,
- zakres danych: które elementy ENM objęte integracją.

AS-IS: Częściowo — ProofPack zawiera manifest z pełnym spisem plików i hashami.
TO-BE: Pełny audit trail integracji.

---

## §16.8 Inwarianty integracji (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-INT-01 | Eksport bez metadanych jest nieprawidłowy. |
| INV-INT-02 | Import MUSI przejść walidacje W1+W2. |
| INV-INT-03 | Eksport do OSD wymaga statusu Approved/Frozen. |
| INV-INT-04 | ProjectArchive jest deterministyczny (same data → same ZIP). |
| INV-INT-05 | Każdy import jest oznaczony jako EXTERNAL_IMPORT. |
| INV-INT-06 | API breaking change wymaga ADR + major version bump. |

---

## §16.9 Definition of Done — Rozdział 16

- [ ] 3 klasy integracji zdefiniowane (MODEL, RESULT, PROCESS).
- [ ] Formaty wymiany: JSON/JSONL/CSV/XLSX/PDF/DOCX/ZIP.
- [ ] Metadane integracyjne obowiązkowe (§16.3).
- [ ] Import: pełny pipeline z walidacją W1+W2.
- [ ] Eksport OSD: Approved/Frozen, brak modyfikacji po eksporcie.
- [ ] White Box: rejestracja eksport/import.
- [ ] API: wersjonowanie, security (TO-BE).
- [ ] Inwarianty INV-INT-01..06, zakazy Z-INT-01..06.
- [ ] Decyzje #121–#126 zapisane w AUDIT_SPEC_VS_CODE.md.

