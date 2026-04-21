> **Historical note (V12.5)**
> This file is preserved as historical reference only.
> docs/spec/ is not an active source of truth.
> Any binding, canonical, AS-IS, TO-BE, or roadmap language below reflects the original document state and is kept for audit context.
> Use ../INDEX_KANONICZNY.md to locate current canonical documentation.

# Suplement GAP � Domkni�cie Luk Kontraktowych #1�#3

**Wersja:** 1.0
**Status:** BINDING � suplement do Rozdzia��w 9, 10, 11
**Warstwa:** Cross-cutting (Protection, Study Cases, White Box)
**Zale�no�ci:** R9 (Protection), R10 (Study Cases), R11 (Reporting/Trace), R14 (Determinism)
**Decision Matrix:** Decyzje #141�#149
**Zakaz:** Zmiana ENM, zmiana solver�w, zmiana istniej�cych decyzji #1�#140

---

## GAP 1 � Relacja Protection - Study Case (Status Wynik�w)

### �G1.1 Problem

W aktualnym kodzie:
- `ProtectionConfig` jest polem `StudyCase` (frozen dataclass w `domain/study_case.py`).
- `StudyCase.with_protection_config()` markuje Case jako `OUTDATED` gdy `result_status == FRESH`.
- ALE: istniej�ce `ProtectionAnalysisRun` NIE s� uniewa�niane (brak kaskady).
- `_get_existing_run()` w `ProtectionAnalysisService` zwraca zawsze `None` (placeholder).

To oznacza, �e po zmianie nastaw zabezpiecze�:
- Case jest `OUTDATED` (poprawnie),
- ale stare wyniki protection run nadal maj� status `VALID` (B��D logiczny).

### �G1.2 Kontrakt (BINDING � Decyzja #141)

> **Ka�da zmiana `ProtectionConfig` w StudyCase powoduje:**
>
> 1. Oznaczenie StudyCase jako `OUTDATED` (AS-IS, poprawne).
> 2. Oznaczenie WSZYSTKICH `ProtectionAnalysisRun` powi�zanych z tym Case
>    (`protection_case_id == case.id`) jako `result_status = OUTDATED`.
> 3. Wymaganie wykonania nowego `ProtectionAnalysisRun` przed zatwierdzeniem.

**Doprecyzowania:**
- ENM pozostaje niezmienny � zmiana dotyczy WY��CZNIE konfiguracji zabezpiecze�.
- StudyCase pozostaje tym samym bytem logicznym (ten sam `id`) � NIE jest tworzony nowy Case.
- Zmiana `ProtectionConfig` obejmuje: zmian� `template_ref`, `template_fingerprint`, `overrides`, `library_manifest_ref`.
- Por�wnanie zmian: na podstawie `template_fingerprint` + `overrides` hash.

### �G1.3 Lifecycle po zmianie ProtectionConfig

```
StudyCase (result_status):
  FRESH � OUTDATED (gdy protection_config zmieniona)
  NONE  � NONE     (brak wynik�w do uniewa�nienia)

ProtectionAnalysisRun (result_status) � kaskada:
  VALID    � OUTDATED (wszystkie runy z protection_case_id == case.id)
  OUTDATED � OUTDATED (bez zmian)
```

### �G1.4 White Box MUSI wskazywa� (Decyzja #142)

Ka�dy nowy `ProtectionAnalysisRun` po zmianie config MUSI zawiera� w trace:
- `previous_config_fingerprint` � fingerprint poprzedniej ProtectionConfig,
- `current_config_fingerprint` � fingerprint aktualnej ProtectionConfig,
- `config_change_detected: true` � jawna flaga zmiany,
- `invalidated_run_ids` � lista ID run�w oznaczonych jako OUTDATED.

### �G1.5 Zakazy

- **Z-GAP1-01:** Wynik `ProtectionAnalysisRun` z nieaktualn� `ProtectionConfig` NIE MO�E mie� statusu `APPROVED`. ZAKAZANE.
- **Z-GAP1-02:** Pomini�cie kaskadowej invalidacji `ProtectionAnalysisRun` przy zmianie `ProtectionConfig`. ZAKAZANE.

### �G1.6 Inwarianty (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-GAP1-01 | Zmiana ProtectionConfig MUSI kaskadowo uniewa�ni� wszystkie powi�zane ProtectionAnalysisRun. |
| INV-GAP1-02 | ProtectionAnalysisRun z result_status=OUTDATED NIE MO�E by� zatwierdzony (APPROVED). |
| INV-GAP1-03 | White Box nowego runu MUSI wskazywa� previous/current config fingerprint i list� uniewa�nionych run�w. |

### �G1.7 Mapowanie na kod (AS-IS � TO-BE)

| Komponent | AS-IS | TO-BE |
|-----------|-------|-------|
| `StudyCase.with_protection_config()` | Markuje Case OUTDATED | Bez zmian (poprawne) |
| `ProtectionAnalysisService.update_protection_config()` | Brak kaskady do run�w | + kaskada: `invalidate_runs_for_case(case_id)` |
| `ProtectionAnalysisRun.result_status` | Brak pola w domain | + pole `result_status: Literal["VALID", "OUTDATED"]` |
| `_get_existing_run()` | Returns None (stub) | + lookup by input_hash (deduplication) |

---

## GAP 2 � Globalna Taksonomia Zdarze� White Box

### �G2.1 Problem

Aktualnie:
- Protection definiuje `event_class ? {TECHNOLOGICAL, NETWORK}` i `event_scope ? {LOCAL_DEVICE, NETWORK_SECTION}` (TO-BE, �9.A.1, Decyzja #80).
- `WhiteBoxStep` (network_model/whitebox/tracer.py) ma pola: `key`, `title`, `formula_latex`, `inputs`, `substitution`, `result`, `notes` � **brak klasyfikacji zdarze�**.
- `PowerFlowTrace` (solvers/power_flow_trace.py) ma iteracje z mismatch/jacobian � **brak klasyfikacji zdarze�**.
- `ShortCircuitResult` (solvers/short_circuit_iec60909.py) ma 7 krok�w obliczeniowych � **brak klasyfikacji zdarze�**.

Brak jednej, globalnej taksonomii zdarze� White Box powoduje:
- niesp�jno�� format�w trace mi�dzy domenami,
- fragmentaryczny audyt (protection ma classification, solvery nie),
- trudno�� por�wna� cross-domain.

### �G2.2 Poj�cie kanoniczne (BINDING � Decyzja #144)

> **WhiteBoxEventRegistry � kanoniczny, globalny rejestr klas zdarze� systemowych,
> obejmuj�cy WSZYSTKIE domeny generuj�ce trace White Box.**

Registry:
- jest **singleton** (jeden rejestr per system),
- jest **niezale�ny od domeny** (solver / protection / validation),
- jest **rozszerzalny WY��CZNIE przez ADR** (nowe domeny wymagaj� formalnej decyzji),
- NIE JEST bytem runtime � jest **definicj� specyfikacyjn�** (enum/const).

### �G2.3 Taksonomia zdarze� v1 (BINDING � Decyzja #145)

Ka�de zdarzenie White Box MUSI posiada� nast�puj�ce pola klasyfikacyjne:

| Pole | Typ | Warto�ci | Obowi�zkowo�� |
|------|-----|----------|---------------|
| `event_domain` | Enum | `SOLVER`, `PROTECTION`, `VALIDATION`, `GOVERNANCE` | WYMAGANE |
| `event_class` | Enum | `COMPUTATIONAL`, `TECHNOLOGICAL`, `NETWORK`, `SYSTEM` | WYMAGANE |
| `event_scope` | Enum | `LOCAL_ELEMENT`, `LOCAL_DEVICE`, `NETWORK_SECTION`, `GLOBAL` | WYMAGANE |
| `severity` | Enum | `TRACE`, `INFO`, `WARNING`, `ERROR` | WYMAGANE |

#### Warto�ci per domena:

**SOLVER domain:**
| event_class | event_scope | Przyk�ad |
|-------------|-------------|---------|
| `COMPUTATIONAL` | `LOCAL_ELEMENT` | Obliczenie impedancji ga��zi |
| `COMPUTATIONAL` | `NETWORK_SECTION` | Y-bus construction |
| `COMPUTATIONAL` | `GLOBAL` | Convergence status, Sk_mva |

**PROTECTION domain (zgodne z �9.A.1):**
| event_class | event_scope | Przyk�ad |
|-------------|-------------|---------|
| `TECHNOLOGICAL` | `LOCAL_DEVICE` | Falownik od��cza si� autonomicznie (LVRT) |
| `NETWORK` | `NETWORK_SECTION` | Przeka�nik nadpr�dowy wy��cza sekcj� |

**VALIDATION domain:**
| event_class | event_scope | Przyk�ad |
|-------------|-------------|---------|
| `SYSTEM` | `LOCAL_ELEMENT` | E001: brak Bus.voltage_kv |
| `SYSTEM` | `GLOBAL` | W001: brak Source w modelu |

**GOVERNANCE domain:**
| event_class | event_scope | Przyk�ad |
|-------------|-------------|---------|
| `SYSTEM` | `GLOBAL` | Zmiana statusu Case (FRESH�OUTDATED) |
| `SYSTEM` | `GLOBAL` | Zatwierdzenie raportu (APPROVED) |

### �G2.4 Zgodno�� z Protection (�9.A.1)

Protection **KORZYSTA** z globalnego rejestru � nie definiuje go lokalnie:
- `event_class=TECHNOLOGICAL` z Protection � `event_domain=PROTECTION, event_class=TECHNOLOGICAL` w rejestrze globalnym.
- `event_class=NETWORK` z Protection � `event_domain=PROTECTION, event_class=NETWORK` w rejestrze globalnym.
- `event_scope=LOCAL_DEVICE` � bez zmian.
- `event_scope=NETWORK_SECTION` � bez zmian.

Regu�y walidacji z �9.A.1.6 (E-P05, E-P06, W-P05, W-P06) pozostaj� wi���ce.

### �G2.5 Wp�yw na istniej�ce struktury (TO-BE)

| Komponent AS-IS | Zmiana TO-BE |
|-----------------|-------------|
| `WhiteBoxStep` (tracer.py) | + opcjonalne pola: `event_domain`, `event_class`, `event_scope`, `severity` |
| `ProtectionTraceStep` (domain/protection_analysis.py) | + pola `event_class`, `event_scope` (zgodne z �9.A.1, TO-BE) |
| `PowerFlowTrace` (power_flow_trace.py) | + opcjonalne `event_domain=SOLVER` per iteration event |
| `ShortCircuitResult.white_box_trace` (short_circuit_iec60909.py) | + opcjonalne `event_domain=SOLVER` per step |

**Zasada migracji:** Pola klasyfikacyjne s� **opcjonalne** w v1 (backward compatible). Staj� si� **wymagane** po pe�nej implementacji rejestru (v2, wymaga ADR).

### �G2.6 Zakazy

- **Z-GAP2-01:** Definiowanie event_class / event_scope lokalnie w domenie (poza rejestrem globalnym). ZAKAZANE.
- **Z-GAP2-02:** Zdarzenie White Box bez jawnego `event_domain`. ZAKAZANE (od v2).
- **Z-GAP2-03:** Rozszerzanie rejestru bez ADR. ZAKAZANE.

### �G2.7 Inwarianty (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-GAP2-01 | WhiteBoxEventRegistry jest jedynym �r�d�em definicji klas zdarze�. |
| INV-GAP2-02 | Ka�de zdarzenie MUSI posiada� event_domain (od v2 � WYMAGANE; v1 � opcjonalne). |
| INV-GAP2-03 | Protection event_class/event_scope MUSZ� by� podzbiorem rejestru globalnego. |
| INV-GAP2-04 | Rozszerzenie rejestru o now� domen� wymaga ADR. |
| INV-GAP2-05 | Raport White Box MUSI mapowa� zdarzenia do rejestru globalnego (od v2). |

---

## GAP 3 � OperatingCase (Legacy) vs StudyCase (Kanon)

### �G3.1 Problem

W kodzie wsp�istniej� dwa byty scenariuszowe:

| Byt | Model domenowy | Tabela DB | Solver execution | Result lifecycle | ProtectionConfig |
|-----|---------------|-----------|------------------|------------------|------------------|
| `OperatingCase` | `domain/models.py` (79 linii, prosty) | `operating_cases` | ? TAK (aktywny) | ? Brak | ? Brak |
| `StudyCase` | `domain/study_case.py` (488 linii, pe�ny) | `study_cases` | ? NIE (planowany) | ? NONE/FRESH/OUTDATED | ? ProtectionConfig |

Stan obecny (dual-model):
- `AnalysisRun.operating_case_id` � FK do `operating_cases` (solver execution path).
- `ProjectSettings.active_case_id` � FK do `operating_cases` (active case tracking).
- `DesignSpec/DesignProposal/DesignEvidence.case_id` � FK do `operating_cases`.
- `StudyCase` ma pe�ny lifecycle, Protection binding, snapshot binding � ale **NIE jest pod��czony do solver�w**.

### �G3.2 Deklaracja statusu (BINDING � Decyzja #147)

> **OperatingCase jest bytem LEGACY.**
>
> - OperatingCase NIE JEST rozwijany (�adne nowe features).
> - OperatingCase NIE MO�E by� u�ywany do nowych typ�w analiz.
> - StudyCase jest JEDYNYM kanonicznym bytem scenariuszowym.
> - Migracja OperatingCase � StudyCase jest wymagana (TO-BE).

### �G3.3 Plan migracji (TO-BE � Decyzja #148)

Migracja odbywa si� w 3 fazach:

**Faza M1: Koegzystencja (AS-IS, obecna)**
- Oba byty wsp�istniej�.
- Solver execution: OperatingCase.
- Configuration management: StudyCase.
- UI: oba widoczne (operating_case_id w results, study_cases w CRUD).

**Faza M2: Przekierowanie solver�w (TO-BE)**
- `AnalysisRun.case_id` � FK do `study_cases` (zamiast `operating_case_id � operating_cases`).
- `ProjectSettings.active_case_id` � FK do `study_cases`.
- OperatingCase: read-only (artefakt importu/migracji).
- Wymaga: ADR + migracja DB + aktualizacja API.

**Faza M3: Usuni�cie OperatingCase (TO-BE)**
- Tabela `operating_cases` archiwizowana.
- Wszystkie FK redirected do `study_cases`.
- OperatingCase ORM/domain model usuni�ty.
- Wymaga: ADR + pe�ne testy regresji.

### �G3.4 Ograniczenia w fazie M1 (AS-IS, BINDING � Decyzja #149)

Dop�ki migracja nie jest uko�czona:

| Aspekt | OperatingCase | StudyCase |
|--------|---------------|-----------|
| Tworzenie nowych | ? Dozwolone (kompatybilno��) | ? Dozwolone (kanon) |
| Solver execution | ? Jedyna �cie�ka (AS-IS) | ? Niedost�pne (TO-BE) |
| UI wy�wietlanie | ? W results/comparison | ? W case management |
| ProtectionConfig | ? Nie posiada | ? Pe�ne wsparcie |
| Result lifecycle | ? Brak (VALID/OUTDATED brak) | ? NONE/FRESH/OUTDATED |
| White Box governance | ? Brak | ? Pe�ne (snapshot binding) |

### �G3.5 Zakazy

- **Z-GAP3-01:** Dodawanie nowych features do OperatingCase. ZAKAZANE (rozw�j wy��cznie w StudyCase).
- **Z-GAP3-02:** Tworzenie trzeciego bytu scenariuszowego. ZAKAZANE.
- **Z-GAP3-03:** Usuni�cie OperatingCase bez formalnego ADR i pe�nej migracji. ZAKAZANE.

### �G3.6 Inwarianty (BINDING)

| ID | Inwariant |
|----|-----------|
| INV-GAP3-01 | OperatingCase jest bytem LEGACY � �adne nowe features. |
| INV-GAP3-02 | StudyCase jest JEDYNYM kanonicznym bytem scenariuszowym. |
| INV-GAP3-03 | Migracja OperatingCase � StudyCase wymaga ADR i jest 3-fazowa (M1�M2�M3). |
| INV-GAP3-04 | W fazie M1 solver execution korzysta z OperatingCase (kompatybilno��). |
| INV-GAP3-05 | Nowe typy analiz MUSZ� korzysta� z StudyCase (nie OperatingCase). |

---

## �G4. Macierz sp�jno�ci z rozdzia�ami 1�18

| GAP | Rozdzia� | Wp�yw | Zgodno�� |
|-----|----------|-------|----------|
| GAP 1 | R9 (Protection) | Kaskadowa invalidacja run�w | Rozszerzenie �9.9 (nie zmiana) |
| GAP 1 | R10 (Study Cases) | ProtectionConfig � OUTDATED lifecycle | Zgodne z �10.3 (result_status) |
| GAP 1 | R14 (Determinism) | Config fingerprint w White Box | Zgodne z �14.3 (hash chain) |
| GAP 1 | R15 (Governance) | OUTDATED run ? APPROVED | Zgodne z �15.5 (zatwierdzenia) |
| GAP 2 | R9 (Protection) | event_class/scope � global registry | Rozszerzenie �9.A.1 (nie zmiana) |
| GAP 2 | R11 (Reporting/Trace) | Unified event format | Zgodne z �11.3 (White Box trace) |
| GAP 2 | R13 (Reporting) | Event mapping w raportach | Zgodne z �13.2 (struktura kanoniczna) |
| GAP 2 | R14 (Determinism) | Deterministyczny event registry | Zgodne z �14.4 (solver determinism) |
| GAP 3 | R10 (Study Cases) | StudyCase = kanon, OperatingCase = legacy | Zgodne z �10.0 (StudyCase definicja) |
| GAP 3 | R15 (Governance) | Migracja wymaga ADR | Zgodne z �15.2 (kiedy ADR wymagany) |

**Brak konflikt�w z decyzjami #1�#140.**

---

## �G5. Definition of Done � Suplement GAP

- [ ] GAP 1: Kontrakt kaskadowej invalidacji ProtectionAnalysisRun (Decyzje #141�#143).
- [ ] GAP 2: WhiteBoxEventRegistry jako poj�cie kanoniczne (Decyzje #144�#146).
- [ ] GAP 3: OperatingCase = LEGACY, StudyCase = kanon, plan migracji 3-fazowy (Decyzje #147�#149).
- [ ] Brak cofni�� decyzji #1�#140.
- [ ] Macierz sp�jno�ci z R1�R18 potwierdzona (�G4).
- [ ] Decyzje #141�#149 zapisane w AUDIT_SPEC_VS_CODE.md.
