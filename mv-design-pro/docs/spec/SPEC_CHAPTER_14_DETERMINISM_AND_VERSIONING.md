> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Rozdział 14 — Determinizm, Wersjonowanie, Reprodukowalność (benchmark-GRADE)

**Wersja:** 1.0
**Status:** AS-IS + TO-BE (jawnie oznaczone)
**Warstwa:** Cross-cutting (Solver + Application + Infrastructure)
**Zależności:** Rozdział 6 (Solvery), 10 (Study Cases), 11 (Raportowanie), 12 (Walidacje), 13 (Raporty formalne)
**Decision Matrix:** Decyzje #108–#114

---

## §14.0 Zakres i cel

### §14.0.1 Zasada nadrzędna

> **Ten sam ENM + ten sam StudyCase + ta sama wersja solvera
> MUSI ZAWSZE dawać identyczny wynik.**

Każde odstępstwo od tej zasady jest **BŁĘDEM SYSTEMOWYM**.

### §14.0.2 Przewaga nad benchmark / benchmark

| Aspekt | benchmark | benchmark | MV-DESIGN-PRO |
|--------|------|--------------|---------------|
| Determinizm solvera | Częściowy | Częściowy | ✓ PEŁNY (gwarantowany) |
| Hash chain | ✗ | ✗ | ✓ (ENM→Result→Report→ProofPack) |
| Reprodukowalność offline | ✗ | ✗ | ✓ (ProofPack = samodzielny artefakt) |
| White Box trace | ✗ | Częściowy | ✓ PEŁNY (krok po kroku) |
| Regresja CI | ✗ | ✗ | ✓ (hash comparison per commit) |
| Bit-identical raporty | ✗ | ✗ | ✓ (make_docx_deterministic, reportlab) |

---

## §14.1 Pojęcia kanoniczne

### §14.1.1 Determinizm

Brak losowości w:
- solverach (brak RNG, ustalona kolejność iteracji),
- walidacjach (Rozdział 12 — INV-VAL-05),
- raportach (Rozdział 11 — INV-RPT-01),
- White Box (te same wejścia → identyczny trace),
- eksportach (sorted keys, normalized newlines, fixed timestamps).

### §14.1.2 Reprodukowalność

Możliwość odtworzenia wyniku:
- offline (bez UI, bez serwera),
- bez dostępu do repozytorium kodu,
- wyłącznie na podstawie ProofPack + specyfikacji.

### §14.1.3 Wersjonowanie

Jednoznaczne wskazanie:
- wersji ENM (hash_enm = SHA-256),
- wersji StudyCase (case_hash),
- wersji solvera (solver_version z pyproject.toml),
- wersji specyfikacji (commit hash / spec_version),
- wersji Type Library (hash_types = SHA-256 katalogów).

---

## §14.2 Snapshoty danych (OBOWIĄZKOWE)

### §14.2.1 Co MUSI być snapshot'em

Każdy AnalysisRun MUSI zapisywać:

| Snapshot | Hash | Źródło AS-IS |
|----------|------|-------------|
| ENM | `hash_enm` | `NetworkSnapshot.fingerprint` |
| Type Library | `hash_types` | SHA-256(canonicalize(catalog_payload)) |
| StudyCaseContext | `case_hash` | `StudyCaseConfig` canonicalized |
| Solver config | `input_hash` | `AnalysisRun.input_hash` |
| Spec version | `spec_version` | `resolve_mv_design_pro_version()` |

### §14.2.2 Zakaz „żywych referencji"

> **Z-DET-01:** AnalysisRun NIE MOŻE odwoływać się do mutowalnych danych.
> Wszystkie dane wejściowe MUSZĄ być zsnapshotowane PRZED uruchomieniem solvera.

AS-IS: `AnalysisRun.input_snapshot` — frozen JSON z pełnym kontekstem.

---

## §14.3 Kanoniczne hashe

### §14.3.1 Algorytm hashowania

| Aspekt | Specyfikacja |
|--------|-------------|
| Algorytm | SHA-256 |
| Encoding | UTF-8 |
| Serializacja | `json.dumps(payload, sort_keys=True, separators=(",", ":"))` |
| Newlines | LF only (normalize CRLF→LF) |
| Null handling | `None` → `null` (JSON standard) |

AS-IS: `_sha256_hex()` w `proof_pack.py`, `canonicalize_json()` w `read_model.py`.

### §14.3.2 Hash chain

```
hash_enm          = SHA-256(canonicalize(enm_snapshot))
hash_types         = SHA-256(canonicalize(type_library))
hash_case          = SHA-256(canonicalize(case_config))
input_hash         = SHA-256(hash_enm + hash_case + solver_params)
result_hash        = SHA-256(canonicalize(result_payload))
proof_fingerprint  = SHA-256(proof.json)
pack_fingerprint   = SHA-256(concat(sorted_file_hashes))
report_hash        = SHA-256(canonicalize(report_payload))
```

> **INV-DET-01:** Zmiana dowolnego hash w łańcuchu MUSI propagować się do wszystkich
> hashów zależnych. Brak propagacji = błąd integralności.

### §14.3.3 Deduplikacja

AS-IS (Decyzja #76 z R10): Dwa AnalysisRun z identycznym `input_hash` dają
identyczne wyniki — system MOŻE deduplikować (P20a).

---

## §14.4 Solvery a determinizm

### §14.4.1 Wymogi solvera

Solvery MUSZĄ:
- używać deterministycznych algorytmów (Newton-Raphson, Gauss elimination),
- mieć ustaloną kolejność iteracji (sorted node IDs),
- nie zależeć od kolejności wprowadzania elementów do ENM,
- nie używać RNG bez jawnego seed.

### §14.4.2 Gwarancje AS-IS

| Solver | Determinizm | Mechanizm |
|--------|-------------|-----------|
| SC IEC 60909 | ✓ | Y-bus z sorted IDs, algebraiczne formuły (brak iteracji) |
| PF Newton-Raphson | ✓ | Sorted nodes, deterministic Jacobian, fixed iteration order |
| Protection Analysis | ✓ | Deterministyczne reguły koordynacji, sorted device IDs |

### §14.4.3 Zakazy

- **Z-DET-02:** Solver NIE MOŻE używać `random()`, `time()`, `hash()` Pythona (niestabilny seed).
- **Z-DET-03:** Solver NIE MOŻE zależeć od kolejności kluczy `dict` (Python 3.7+ gwarantuje insertion order, ale solver MUSI jawnie sortować).
- **Z-DET-04:** Solver NIE MOŻE używać `set` iteration (niedeterministyczna kolejność w starszych wersjach).

---

## §14.5 White Box a reprodukcja

### §14.5.1 Rola White Box

White Box MUSI umożliwiać:
- odtworzenie obliczenia krok po kroku (ProofStep sequence),
- identyfikację momentu rozbieżności między dwoma runami,
- porównanie dwóch White Box traces (diff na ProofStep level).

### §14.5.2 White Box = narzędzie dowodowe

White Box nie jest debuggerem — jest **formalnym dowodem obliczeniowym**.

ProofDocument (Rozdział 11 §11.5):
- deterministic: same run_id → identical proof,
- self-contained: ProofPack zawiera JSON + LaTeX + PDF,
- verifiable: SHA-256 per file, pack_fingerprint.

### §14.5.3 Porównanie runów

AS-IS: `RunComparisonResult` (Rozdział 11 §11.3.4) z NumericDelta/ComplexDelta.

White Box porównanie (TO-BE):
- per-step diff między dwoma ProofDocument,
- identyfikacja pierwszego kroku z różnicą,
- root cause analysis: „zmiana X w ENM → zmiana Y w wynikach".

---

## §14.6 Raporty a determinizm

### §14.6.1 Wymogi

Raport MUSI:
- zawierać wszystkie hashe (§14.3.2),
- wskazywać wersje (solver, spec, ENM),
- być możliwy do ponownego wygenerowania (same inputs → same output).

### §14.6.2 Gwarancje AS-IS

| Format | Determinizm | Mechanizm |
|--------|-------------|-----------|
| JSON | ✓ | `sort_keys=True, separators=(",",":")`  |
| JSONL | ✓ | 1 event per line, sorted |
| PDF | ✓ | reportlab A4, fixed layout |
| DOCX | ✓ | `make_docx_deterministic()` — fixed timestamps, sorted ZIP entries, normalized core.xml |
| LaTeX | ✓ | normalized newlines (LF), pdflatex 2-pass |
| CSV | ✓ | sorted rows, UTF-8, deterministic header |
| ProofPack ZIP | ✓ | sorted entries, fixed timestamp (1980-01-01), compresslevel=9 |

### §14.6.3 Zakazy

- **Z-DET-05:** Raport NIE MOŻE zależeć od UI, locale, timezone (poza UTC timestamp).
- **Z-DET-06:** Raport NIE MOŻE zawierać danych z pamięci podręcznej bez walidacji hash.

---

## §14.7 Zmiany systemowe a wyniki

### §14.7.1 Co ZMIENIA wynik

| Zmiana | Efekt | Propagacja |
|--------|-------|-----------|
| Zmiana ENM (element, parametr) | Zmiana hash_enm | Invalidacja ALL runów |
| Zmiana StudyCaseConfig | Zmiana case_hash | Invalidacja runów tego Case |
| Zmiana solvera (algorytm) | Zmiana solver_version | Wymaga nowy AnalysisRun |
| Zmiana Type Library | Zmiana hash_types | Invalidacja per element |
| Zmiana specyfikacji raportu | Zmiana report structure | Wymaga re-generate raportu |

### §14.7.2 Co NIE ZMIENIA wyniku

| Zmiana | Efekt |
|--------|-------|
| Zmiana UI layout | BRAK |
| Zmiana SLD geometry | BRAK |
| Zmiana kolorów SLD | BRAK |
| Zmiana kolejności pól w UI | BRAK |
| Zmiana lokalizacji (język UI) | BRAK |

### §14.7.3 Audytowalność zmian

Każda zmiana wyniku MUSI być:
- uzasadniona (hash_enm changed because…),
- widoczna w White Box (diff per step),
- audytowalna (kto, kiedy, co zmienił — z Rozdziału 10 invalidation matrix).

---

## §14.8 CI / regresja determinizmu

### §14.8.1 Testy deterministyczne

System MUSI wspierać:
- test: `assert hash(run_A) == hash(run_B)` dla identycznych inputów,
- golden tests: zapisane wyniki referencyjne → porównanie z bieżącymi,
- hash regression: `git diff` na pliku z hashami wyników per test case.

### §14.8.2 Pipeline CI

```
1. Load golden ENM + Case
2. Run solver
3. Compute result_hash
4. Compare with golden result_hash
5. FAIL if different → regression detected
6. Generate report
7. Compare report_hash with golden
8. Archive ProofPack as CI artifact
```

AS-IS: `test_result_api_contract.py` — frozen result tests.

### §14.8.3 Porównanie hashów per commit

TO-BE: CI job generujący tabelę hashów (enm_hash, result_hash, report_hash)
per test case i commit. Regresja = zmiana hash bez zmiany inputów.

---

## §14.9 Inwarianty determinizmu (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-DET-01 | Zmiana hash propaguje się do wszystkich hashów zależnych. |
| INV-DET-02 | Ten sam ENM + Case + Solver → identyczny wynik (bitowo). |
| INV-DET-03 | Solver nie używa RNG, time(), hash() Pythona. |
| INV-DET-04 | White Box trace jest deterministyczny (same run → same trace). |
| INV-DET-05 | Każdy raport jest powtarzalny (same inputs → same output bitowo, poza timestamp). |
| INV-DET-06 | ProofPack jest self-contained (nie wymaga external state do weryfikacji). |
| INV-DET-07 | Deduplikacja: identyczny input_hash → można reuse result (P20a). |
| INV-DET-08 | Zmiana UI/SLD/locale NIE zmienia wyniku obliczeń. |

---

## §14.10 Definition of Done — Rozdział 14

- [ ] Ten sam input → identyczny output (bitowo, poza UTC timestamp).
- [ ] Każdy wynik ma komplet hashy (hash_enm, case_hash, input_hash, result_hash, report_hash).
- [ ] White Box umożliwia pełną reprodukcję krok po kroku.
- [ ] CI: golden tests, hash regression, ProofPack archiwizacja.
- [ ] Parytet benchmark osiągnięty, White Box = przewaga.
- [ ] Decyzje #108–#114 zapisane w AUDIT_SPEC_VS_CODE.md.

