> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 13 — Raportowanie Formalne, Eksporty, Ślady Audytowe (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Presentation + Application + Infrastructure
**Zależności:** Rozdział 6 (Solvery), 10 (Study Cases), 11 (Raportowanie techniczne), 12 (Walidacje)
**Decision Matrix:** Decyzje #102–#107

---

## §13.0 Zakres i cel

### §13.0.1 Zasada nadrzędna

> **Każdy wynik obliczeń w MV-DESIGN-PRO musi posiadać raport,
> który w sposób jednoznaczny odpowiada na pytanie:
> „CO policzono, DLACZEGO, NA JAKICH DANYCH i Z JAKIM SKUTKIEM".**

Raport:
- nie jest widokiem UI,
- nie jest logiem systemowym,
- jest **artefaktem formalnym** (White Box output, gotowy do podpisu).

### §13.0.2 Relacja do Rozdziału 11

Rozdział 11 definiuje techniczne aspekty raportowania (ProofPack, exportery, cross-reference,
formaty, hash chain). Niniejszy Rozdział 13 formalizuje:
- zamkniętą listę typów raportów,
- kanoniczną strukturę raportu jako artefaktu „do podpisu",
- pełny ślad audytowy: ENM → StudyCase → AnalysisRun → Solver → Wynik → Raport,
- integrację z CI i audytem zewnętrznym.

### §13.0.3 Granica warstwy

Raport NIGDY nie generuje danych — wyłącznie je prezentuje.
Raport czyta frozen results (Rozdział 6), deterministic trace (Rozdział 11),
validation results (Rozdział 12).

---

## §13.1 Zamknięta lista typów raportów (BINDING)

| # | Typ raportu | Solver input | Klasa (R11) | Opis |
|---|-------------|-------------|-------------|------|
| 1 | Raport rozpływu mocy | PowerFlowNewtonSolution | PRIMARY | Pełne wyniki PF: napięcia, prądy, straty, obciążenia |
| 2 | Raport zwarciowy (IEC 60909) | ShortCircuitResult | PRIMARY | Ik″, ip, Ith, Ib, Sk″ per bus + contributions |
| 3 | Raport zabezpieczeniowy / koordynacyjny | ProtectionAnalysisResult | PRIMARY | Nastawy, koordynacja, TCC, sanity checks |
| 4 | Raport walidacyjny (pre-calculation) | ValidationResult + EnergyValidationView | AUDIT | Wyniki walidacji W1–W6, readiness matrix |
| 5 | Raport porównawczy (Case vs Case) | RunComparisonResult | COMPARATIVE | ΔU, ΔI, ΔP, ΔIk — NumericDelta/ComplexDelta |
| 6 | Raport audytowy (White Box full) | ProofDocument + ProtectionTrace | AUDIT | Pełny ślad obliczeniowy krok po kroku |

> **INV-RPT-13:** Dodanie nowego typu raportu wymaga ADR (Architecture Decision Record).

---

## §13.2 Struktura kanoniczna raportu

Każdy raport MUSI zawierać sekcje §13.2.1–§13.2.6.

### §13.2.1 Metadane (OBOWIĄZKOWE)

| Pole | Opis | Źródło |
|------|------|--------|
| report_id | UUID raportu | generowany |
| report_type | Typ raportu (1–6) | z listy §13.1 |
| project_id | Identyfikator projektu | Project |
| project_name | Nazwa projektu | Project |
| enm_hash | Hash strukturalny ENM | NetworkSnapshot.fingerprint |
| case_id | Identyfikator Study Case | StudyCase |
| case_name | Nazwa Study Case | StudyCase |
| run_id | Identyfikator AnalysisRun | AnalysisRun |
| solver_version | Wersja solvera | build metadata |
| spec_version | Wersja specyfikacji | SPEC_EXPANSION_PLAN.md |
| created_at | Timestamp utworzenia | ISO 8601 UTC |
| author | Autor / system | user context |

### §13.2.2 Zakres obliczeń

| Pole | Opis |
|------|------|
| solvers_used | Lista użytych solverów (nazwy + wersje) |
| standards | Normy referencyjne (IEC 60909, PN-EN 60255, etc.) |
| boundary_conditions | Warunki brzegowe (c_factor, tolerance, max_iterations) |
| assumptions | Jawne założenia (Rozdział 6 §6.1 — 7 założeń upraszczających IEC 60909) |

### §13.2.3 Dane wejściowe (SNAPSHOT)

| Pole | Opis |
|------|------|
| element_types | Typy elementów z licznikami (buses, branches, trafos, sources, loads, gens) |
| parameter_snapshot | Parametry zmienne per instancja (z katalogu lub override) |
| case_config | Konfiguracja Study Case (StudyCaseConfig, 8 parametrów) |
| no_defaults | Zakaz danych domyślnych — każdy parametr jawnie podany |

### §13.2.4 Wyniki liczbowe

| Pole | Opis |
|------|------|
| result_tables | Tabele wynikowe per typ (Bus, Branch, Transformer, Source) |
| units | Jednostki (A, kA, V, kV, MVA, MW, Mvar, Ω, %, s) |
| normative_labels | Oznaczenia normowe (Ik″, ip, Ith, Ib, Sk″, U, δU, P, Q, S) |
| no_interpolation | Zakaz interpolacji „wizualnej" — tylko wartości obliczone |

### §13.2.5 Interpretacja inżynierska

| Pole | Opis |
|------|------|
| violations | Przekroczenia (EnergyValidation FAIL items) |
| margins | Marginesy bezpieczeństwa (margin_pct per element) |
| status | Status OK / WARNING / FAIL per element |
| assessment_rules | Jawne reguły oceny (EnergyValidationConfig thresholds) |

### §13.2.6 Ślad White Box

| Pole | Opis |
|------|------|
| trace_steps | Sekwencja kroków obliczeniowych (ProofStep[]) |
| validation_trace | Sekwencja decyzji walidacyjnych (ValidationIssue[]) |
| solver_events | Zdarzenia solvera (convergence, PV→PQ switches, fallback) |
| causality | Łańcuch przyczyna → skutek (per wynik) |

---

## §13.3 Pełny ślad audytowy (BINDING)

```
ENM (edytowalny)
  │ hash_enm = SHA-256(canonicalize(enm))
  ▼
NetworkSnapshot (frozen)
  │ fingerprint = SHA-256(snapshot_payload)
  ▼
StudyCase (config-only, frozen)
  │ case_hash = SHA-256(StudyCaseConfig)
  ▼
AnalysisRun (jednorazowy, state machine)
  │ input_hash = SHA-256(config + enm_hash + case_hash)
  ▼
Solver (physics, White Box)
  │ → Result (frozen) + Trace (frozen)
  │ result_hash = SHA-256(result_payload)
  ▼
Raport (artefakt formalny)
  │ report_hash = SHA-256(report_payload)
  ▼
ProofPack (ZIP, signed)
  │ pack_fingerprint = SHA-256(concat(file_hashes))
  ▼
Eksport (PDF/DOCX/JSON — deterministic)
```

> **INV-RPT-14:** Każdy raport MUSI zawierać pełny łańcuch hashy od ENM do raportu.
> Zmiana dowolnego hash = zmiana raportu.

---

## §13.4 Formaty eksportu

Wymagane formaty (spójnie z Rozdziałem 11 §11.6):

| Format | Przeznaczenie | Determinizm | Podpis |
|--------|---------------|-------------|--------|
| PDF | Do podpisu, odbiór OSD | ✓ (reportlab A4) | Gotowy |
| DOCX | Edytowalny, wersje robocze | ✓ (make_docx_deterministic) | Po zamrożeniu |
| JSON | Machine-readable, CI | ✓ (sort_keys, LF) | Hash w pliku |
| CSV | Tabele liczbowe, Excel | ✓ (sorted rows, UTF-8 BOM) | — |
| JSONL | Ślad White Box, streaming | ✓ (1 event per line) | — |

Zakaz:
- raportów „tylko na ekranie" (Z-RPT-01 z R11),
- raportów bez metadanych (§13.2.1).

---

## §13.5 Raporty a UI

| Aspekt | UI | Raport |
|--------|----|----|
| Wyświetla dane | ✓ | ✓ |
| Modyfikuje dane | ✗ (ZAKAZ) | ✗ (ZAKAZ) |
| Generuje dane | ✗ (ZAKAZ) | ✗ (ZAKAZ) |
| Źródło danych | AnalysisRun + Results | AnalysisRun + Results |
| Interaktywny | ✓ | ✗ |
| Deterministic | — | ✓ (OBOWIĄZKOWE) |

> **INV-RPT-15:** UI wyświetla raport, NIE modyfikuje go. Raport zawsze pochodzi
> z AnalysisRun + White Box.

---

## §13.6 Determinizm raportów

Raport MUSI być:
- deterministyczny (te same dane → identyczny raport bitowo, poza timestamp),
- powtarzalny (możliwy do ponownego wygenerowania z tych samych inputs),
- porównywalny (diff między dwoma raportami = diff wyników, nie layoutu).

Zmiana raportu może wynikać WYŁĄCZNIE ze zmiany:
- danych wejściowych (ENM, Case, Config),
- solvera (wersja, parametry),
- specyfikacji (struktura raportu).

---

## §13.7 Raporty a CI / audyt

### §13.7.1 Automatyczne generowanie w CI

System MUSI wspierać:
- generowanie raportów w pipeline CI (bez UI),
- porównanie raportów między commitami (hash comparison),
- archiwizację raportów jako artefaktów CI.

### §13.7.2 Audyt zewnętrzny

Raport audytowy (typ 6) MUSI umożliwiać:
- odtworzenie każdego kroku obliczeniowego,
- identyfikację momentu rozbieżności (jeśli wyniki się różnią),
- weryfikację bez dostępu do kodu źródłowego (LaTeX + PDF wystarczą).

---

## §13.8 Inwarianty raportów formalnych (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-RPT-13 | Dodanie nowego typu raportu wymaga ADR. |
| INV-RPT-14 | Każdy raport zawiera pełny łańcuch hashy ENM→raport. |
| INV-RPT-15 | UI wyświetla raport, NIE modyfikuje go. |
| INV-RPT-16 | Raport bez metadanych (§13.2.1) jest nieprawidłowy. |
| INV-RPT-17 | Raport porównawczy wymaga tego samego ENM snapshot (Decyzja #88). |
| INV-RPT-18 | Raport audytowy zawiera pełny White Box trace (nie skrót). |

---

## §13.9 Definition of Done — Rozdział 13

- [ ] Zamknięta lista 6 typów raportów.
- [ ] Struktura kanoniczna (§13.2.1–§13.2.6) zdefiniowana.
- [ ] Pełny ślad audytowy: ENM → raport z łańcuchem hashy.
- [ ] White Box w raporcie obowiązkowy.
- [ ] CI: automatyczne generowanie i porównanie raportów.
- [ ] Parytet benchmark osiągnięty (raport = artefakt „do podpisu").
- [ ] Decyzje #102–#107 zapisane w AUDIT_SPEC_VS_CODE.md.

