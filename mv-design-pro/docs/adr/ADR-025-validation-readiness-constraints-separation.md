# ADR-025: Rozdzielenie walidacji modelu, gotowości analiz i ograniczeń projektowych

**Status:** ACCEPTED (2026-09-30, decyzja doradcy z delegacją właściciela O-59 — rejestr O-63 w `docs/plan/PLAN_AB_DYNAMIKA_A_B_2026-09.md` §2.3; na istniejących nośnikach (O-65): jedyny walidator modelu = `enm/validator.py`; pakiet `network_model/validation` kasowany po teście tożsamości kodów reguł (0 konsumentów produkcyjnych; jedyny import spoza pakietu `enm/domain_operations.py:11959`); gotowość = `CalculationReadinessService` jedynym rejestrem kodów z akcją naprawczą; ograniczenia = `werdykt_projektowy` z klasą kryterium, bez `ConstraintEngine`; reguła „NEVER bypass NetworkValidator” przepisana w `CLAUDE.md`, `ARCHITECTURE.md`, `SYSTEM_SPEC.md`, `AGENTS.md`)
**Data:** 2026-09-02
**Dokument źródłowy:** `../twin/MV_DESIGN_PRO_TARGET_DIGITAL_TWIN_ARCHITECTURE.md` §18; `../twin/MV_DESIGN_PRO_DESIGN_OPTIMIZATION_ARCHITECTURE.md` §3

## Kontekst
Trzy walidatory (NetworkValidator 13 reguł, `semantic_rules`, `ENMValidator`), 5 słowników gotowości, werdykt projektowy z 4 kryteriami „poza automatem" i bez nN, FAIL bez remedium; fizyka i polityka OSD mieszane w jednym werdykcie (A10 S9, A6-13, EF-047/048).

## Decyzja
Trzy odrębne silniki: `ModelValidationEngine` (spójność strukturalna i fizyczna modelu — błędy/ostrzeżenia, blokują komendę lub bieg), `ReadinessService` (czy dana analiza ma komplet wejść w danym scenariuszu — `NOT_READY{missing}` z akcją naprawczą), `ConstraintEngine` (czy wynik spełnia ograniczenia klas PHYSICS/NORMATIVE/POLICY/CONTRACT/PROJECT/DESIGN — werdykt z marginesem i remediami). Kody gotowości z jednego rejestru; fix-action wykonuje naprawę (otwiera formularz z fokusem lub stosuje auto-fix).

## Konsekwencje
- `werdykt_projektowy` staje się ewaluatorem; „poza automatem" znika (każde kryterium ma dostawcę albo jawny `NIE_DO_USTALENIA`).
- Kasacja 2 walidatorów i 4 słowników gotowości po teście tożsamości kodów.

## Alternatywy odrzucone
- Jeden „walidator wszystkiego": miesza brak danych z naruszeniem normy i z decyzją inżyniera.
