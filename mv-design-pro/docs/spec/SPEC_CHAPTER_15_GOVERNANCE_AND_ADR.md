> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 15 — Governance, ADR, Zarządzanie Zmianą i Zatwierdzenia (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Cross-cutting (Governance)
**Zależności:** Rozdział 10 (Study Cases), 11 (Raportowanie), 12 (Walidacje), 13 (Raporty formalne), 14 (Determinizm)
**Decision Matrix:** Decyzje #115–#120

---

## §15.0 Zakres i cel

### §15.0.1 Zasada nadrzędna

> **Żadna zmiana wpływająca na wyniki obliczeń nie może być wprowadzona
> bez jawnej decyzji, śladu audytowego i określenia odpowiedzialności.**

Brak governance = brak możliwości zatwierdzenia projektu.

### §15.0.2 Granica

Governance:
- nie zmienia fizyki ani solverów,
- nie definiuje nowych bytów ENM,
- ustanawia **ramy decyzyjne i odpowiedzialności**.

---

## §15.1 Poziomy governance (BINDING)

### §15.1.1 Governance danych (DATA)

| Obiekt | Reguła | Mechanizm AS-IS |
|--------|--------|-----------------|
| ENM snapshot | Niemutowalny po zsnapshotowaniu | `NetworkSnapshot.fingerprint` (frozen) |
| Type Library | Niemutowalny per snapshot | Catalog snapshot z hash |
| StudyCaseContext | Frozen po utworzeniu | `StudyCaseConfig` (frozen dataclass) |
| AnalysisRun | Jednorazowy, state machine | CREATED→VALIDATED→RUNNING→FINISHED (Rozdział 10) |
| Result | Frozen po obliczeniu | `ShortCircuitResult`, `PowerFlowNewtonSolution` (frozen) |

> **INV-GOV-01:** Dane wejściowe są niemutowalne po zatwierdzeniu (snap/freeze).

### §15.1.2 Governance obliczeń (COMPUTATION)

| Zmiana | Wymaganie |
|--------|-----------|
| Zmiana solvera (algorytm) | Nowy AnalysisRun (nigdy re-run na starym) |
| Zmiana normy (c_factor) | Nowy StudyCase lub StudyCaseConfig |
| Zmiana trybu obliczeń | Nowy AnalysisRun |
| Zmiana parametrów solvera | Nowy AnalysisRun z nowym input_hash |

> **INV-GOV-02:** Zmiana solvera = nowy AnalysisRun. NIGDY modyfikacja starego.

### §15.1.3 Governance specyfikacji (SPEC)

| Zmiana | Wymaganie |
|--------|-----------|
| Zmiana kontraktu AS-IS | ADR (Architecture Decision Record) |
| Aktywacja elementu TO-BE | ADR + implementacja + testy |
| Zmiana inwariantu | ADR + impact analysis |
| Zmiana interpretacji normy | ADR + reference normative |
| Nowy typ raportu | ADR (INV-RPT-13) |

> **INV-GOV-03:** Zmiana specyfikacji = jawny ADR.

### §15.1.4 Governance wyników (RESULT)

| Obiekt | Status | Znaczenie |
|--------|--------|-----------|
| Raport DRAFT | Nieformalny | Brak mocy decyzyjnej |
| Raport APPROVED | Zatwierdzony | Może być podstawą decyzji inżynierskiej |
| Raport FROZEN | Zamrożony | Punkt odniesienia audytu — edycja = nowa wersja |

> **INV-GOV-04:** Wynik bez zatwierdzenia = nieobowiązujący.

---

## §15.2 ADR — Architecture Decision Record

### §15.2.1 Kiedy wymagany jest ADR

ADR jest OBOWIĄZKOWY gdy:
- zmienia się kanon danych (ENM model, solver contracts),
- zmienia się kontrakt solvera (nowy algorytm, nowe wyjścia),
- aktywowany jest element TO-BE (przejście TO-BE → AS-IS),
- zmienia się interpretacja normy (IEC 60909, PN-EN 60255),
- dodawany jest nowy inwariant lub zakaz,
- zmienia się frozen API (Result API, Proof API).

### §15.2.2 Struktura ADR (OBOWIĄZKOWA)

```markdown
# ADR-NNN: Tytuł decyzji

## Status: PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED

## Kontekst
Dlaczego ta decyzja jest potrzebna.

## Decyzja
Co zdecydowano.

## Alternatywy odrzucone
1. Alternatywa A — dlaczego odrzucona.
2. Alternatywa B — dlaczego odrzucona.

## Konsekwencje
- Pozytywne: ...
- Negatywne: ...
- Neutralne: ...

## Zakres wpływu
- Rozdziały specyfikacji: ...
- Komponenty kodu: ...
- Testy do aktualizacji: ...

## Data i autor
- Data: YYYY-MM-DD
- Autor: ...
- Reviewer: ...
```

AS-IS: `mv-design-pro/docs/adr/` — katalog ADR.

### §15.2.3 Zakazy

- **Z-GOV-01:** Zmiana AS-IS bez ADR jest ZAKAZANA.
- **Z-GOV-02:** ADR bez alternatyw odrzuconych jest NIEPEŁNY.
- **Z-GOV-03:** ADR bez zakresu wpływu jest NIEPEŁNY.

---

## §15.3 Role i odpowiedzialności

### §15.3.1 Minimalny zestaw ról

| Rola | Odpowiedzialność |
|------|------------------|
| **Author** | Tworzy model/spec/raport |
| **Reviewer** | Ocenia poprawność techniczną |
| **Approver** | Zatwierdza formalnie (status → APPROVED) |
| **Auditor** | Weryfikuje po czasie (status FROZEN) |

### §15.3.2 Reguły

- Jedna osoba może pełnić wiele ról.
- Decyzja zatwierdzająca MUSI być jawna (nie domniemana).
- Author NIE MOŻE być jedynym Approver tego samego artefaktu (four-eyes principle).

> **TO-BE** — implementacja ról w systemie. Wymaga osobnej decyzji.
> W v1 odpowiedzialność jest implicit (użytkownik = author + approver).

---

## §15.4 Workflow zmiany (KANONICZNY)

```
Draft → Review → Approved → Frozen
```

| Status | Znaczenie | Edycja |
|--------|-----------|--------|
| Draft | Praca w toku, brak mocy formalnej | ✓ |
| Review | Oczekuje na przegląd | Uwagi ↔ poprawki |
| Approved | Zatwierdzony — można raportować | ✗ (tylko nowa wersja) |
| Frozen | Punkt odniesienia audytu | ✗ (BEZWZGLĘDNIE) |

> **Z-GOV-04:** Edycja artefaktu FROZEN wymaga nowej wersji (NIGDY modyfikacja in-place).

### §15.4.1 Mapowanie na obiekty AS-IS

| Obiekt | Draft | Review | Approved | Frozen |
|--------|-------|--------|----------|--------|
| ENM | Edycja w kreatorze | — | NetworkSnapshot | Snapshot z fingerprint |
| StudyCase | Config editable | — | Config locked | Config frozen |
| AnalysisRun | CREATED | VALIDATED | FINISHED | FINISHED + archived |
| Raport | Generated | — | report_hash computed | ProofPack signed |
| Specyfikacja | Markdown edit | PR review | Merged | Tagged release |

---

## §15.5 Zatwierdzanie modelu i wyników

### §15.5.1 Zatwierdzenie ENM

- Warunki: W1 (ENMValidator) = OK/WARN, W2 (NetworkValidator) = is_valid.
- Efekt: NetworkSnapshot z fingerprint.
- Nieodwracalny: nowa zmiana ENM = nowy snapshot.

### §15.5.2 Zatwierdzenie StudyCase

- Warunki: config kompletny, brak blokerów w W3 (ReadinessMatrix).
- Efekt: case_hash obliczony.
- Nieodwracalny: zmiana config = nowy case_hash.

### §15.5.3 Zatwierdzenie AnalysisRun

- Warunki: status = FINISHED, wyniki dostępne.
- Efekt: result_hash obliczony.
- Nieodwracalny: run jest jednorazowy (Rozdział 10).

### §15.5.4 Zatwierdzenie Raportu

- Warunki: raport wygenerowany z FINISHED run.
- Efekt: report_hash obliczony, raport oznaczony APPROVED.
- Nieodwracalny: modyfikacja = nowa wersja raportu.

---

## §15.6 White Box a governance

White Box MUSI:
- przechowywać odniesienia do decyzji ADR (per solver change),
- wskazywać, które wyniki obowiązują (APPROVED/FROZEN status),
- umożliwiać audyt: „na jakiej podstawie zatwierdzono wynik".

AS-IS: ProofDocument.header zawiera solver_version, spec_version,
AnalysisRun.id. TO-BE: odniesienia do ADR w metadanych.

---

## §15.7 CI / repozytorium

### §15.7.1 Walidacja governance w CI

- PR MUSI zawierać: opis zmiany, ADR (jeśli dotyczy), zaktualizowane testy.
- CI: automated check — czy zmiana AS-IS ma ADR.
- CI: regression tests — czy hash wyników się nie zmienił bez powodu.

### §15.7.2 Wersjonowanie specyfikacji

| Aspekt | Mechanizm |
|--------|-----------|
| Rozdział spec | Tagged release per major change |
| Decision Matrix | Inkrementalne numery decyzji (#1, #2, …) |
| ADR | Inkrementalne numery ADR (ADR-001, ADR-002, …) |
| AUDIT | Append-only (nigdy edycja starych decyzji) |

---

## §15.8 Inwarianty governance (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-GOV-01 | Dane wejściowe niemutowalne po snap/freeze. |
| INV-GOV-02 | Zmiana solvera = nowy AnalysisRun. |
| INV-GOV-03 | Zmiana specyfikacji = jawny ADR. |
| INV-GOV-04 | Wynik bez zatwierdzenia = nieobowiązujący. |
| INV-GOV-05 | Edycja FROZEN = nowa wersja (nigdy in-place). |
| INV-GOV-06 | ADR zawiera: kontekst, decyzję, alternatywy, konsekwencje, zakres. |
| INV-GOV-07 | Decision Matrix jest append-only (nigdy edycja starych). |
| INV-GOV-08 | Każde zatwierdzenie ma autora i timestamp. |

---

## §15.9 Definition of Done — Rozdział 15

- [ ] 4 poziomy governance zdefiniowane (DATA, COMPUTATION, SPEC, RESULT).
- [ ] ADR: struktura, kiedy wymagany, zakazy Z-GOV-01..04.
- [ ] Workflow: Draft → Review → Approved → Frozen.
- [ ] Role: Author, Reviewer, Approver, Auditor.
- [ ] White Box: odniesienia do decyzji.
- [ ] CI: walidacja governance, wersjonowanie.
- [ ] Inwarianty INV-GOV-01..08.
- [ ] Decyzje #115–#120 zapisane w AUDIT_SPEC_VS_CODE.md.

