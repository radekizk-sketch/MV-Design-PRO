# AUDYT DOKUMENTACJI I PLANÓW REPO

Status: **HISTORYCZNY AUDYT OPERACYJNY**  
Data: **2026-03-30**  
Zakres: pełny skan dokumentacji i planów dla przebudowy edytora SLD/CAD pod realną sieć SN.

> **Historical note (V12.5)**  
> Ten audyt jest snapshotem z 2026-03-30 i nie stanowi bieżącego źródła prawdy.  
> Aktywny kanon V12.5 prowadzi przez `docs/INDEX.md`, `docs/INDEX_KANONICZNY.md` oraz wiążące specyfikacje w `docs/system/`. `docs/spec/` ma status historyczny.

## 1. Podsumowanie RECON

Najważniejsze obserwacje po skanie kodu i dokumentów:

1. **Prawda o modelu sieci** w docelowym flow UI jest już osadzona w Snapshot ENM (`snapshotStore`) i nie powinna być dublowana lokalnym grafem.  
2. **Występuje równoległy tor lokalnego stanu** (store edytora CAD) używany do interakcji geometrii i symboli; wymaga konsekwentnego spinania przez operacje domenowe dla mutacji modelu.  
3. **Repo zawiera wiele warstw SLD/CAD naraz** (`ui/sld`, `ui/sld-editor`, `engine/sld-layout`, `modules/sld/cdse`) – brak jednej krótkiej mapy „co jest kanoniczne”.  
4. **W dokumentacji istnieje nadmiar planów historycznych i roadmap** oraz duplikacje ścieżek planistycznych.  
5. **Deterministyczność**: w ścieżce ENM_OP były jeszcze fallbacki z `Date.now()` dla `idempotency_key` (naprawione w tym etapie).

## 2. Klasyfikacja dokumentów i planów

### 2.1 KANONICZNE (utrzymać jako wiążące)

- `SYSTEM_SPEC.md`
- `ARCHITECTURE.md`
- `AGENTS.md`
- `PLANS.md`
- `docs/INDEX.md` i `docs/INDEX_KANONICZNY.md` (wejście do bieżącego kanonu V12.5)
- `docs/system/*` (wiążące specyfikacje systemowe V12.5)
- `docs/domain/OPERACJE_DOMENOWE_V1.md`
- `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`
- `docs/sld/SLD_CONTRACT_FLOW_V1.md`
- `docs/sld/SLD_SEMANTIC_MODEL_CANONICAL_V1.md`
- `docs/sld/SLD_PIPELINE_CANONICAL_STATUS.md`

### 2.2 AKTYWNE ROBOCZE (utrzymać, ale podpiąć pod jeden plan)

- `docs/audit/EP0_RECON_RESULTS.md`
- `docs/audit/AS_IS_MAP.md`
- `docs/sld/SLD_REPO_GAP_AUDIT.md`
- `docs/sld/SLD_TEST_MATRIX.md`

### 2.3 ARCHIWALNE (nie rozwijać, zostawić jako historia)

- `docs/audit/historical_execplans/*`
- stare pakiety fazowe/audytowe z zamkniętymi datami i zamkniętym zakresem

### 2.4 DO USUNIĘCIA (usunięte w tym etapie)

- `docs/ROADMAP.md` (zastąpiony przez `PLANS.md`)
- `docs/audit/ROADMAP.md` (zastąpiony przez `PLANS.md`)

### 2.5 DO SCALENIA (wskazane kolejnym krokiem)

- rozproszone notatki SLD/CAD o podobnym zakresie (`SLD_*` w `docs/` i `docs/sld/`) do jednego „przewodnika kanonicznego SLD/CAD”.

## 3. Odpowiedzi na pytania RECON (binding)

1. **Gdzie żyje prawda o sieci?**  
   W kanonicznej ścieżce ENM Snapshot + `logical_views` zwracanych przez backend po ENM_OP.

2. **Czy UI ma lokalną konkurencyjną prawdę?**  
   Częściowo tak: store CAD trzyma geometrię/interakcje; mutacje modelu muszą być wyłącznie przez ENM_OP.

3. **Jeden edytor czy kilka pół-edytorów?**  
   Funkcjonalnie współistnieje kilka warstw (SLD view, editor CAD, moduł CDSE), wymagają spinania jednym kontraktem operacyjnym.

4. **Aktualny przepływ UI→operacja→Snapshot→semantyka→layout→render→inspektor?**  
   Jest dostępny i działa przez `executeDomainOp` + `snapshotStore`, dalej przez adaptery semantyczne/layout i panele inspektora.

5. **Największe luki względem mechaniki atrapy?**  
   Brak jednego prostego rejestru typów obiektów i narzędzi „klik-po-kliku” opisanego jednym kontraktem użytkowym.

6. **Co usunąć bez sentymentu?**  
   Rozproszone roadmapy i stare plany poza jednym `PLANS.md` oraz dublujące opisy przebudowy.

7. **Co uratować?**  
   Snapshot pipeline, logical_views, readiness/fix_actions, testy deterministyczne SLD i moduły layout/routingu.

8. **Które dokumenty są nieaktualne?**  
   Legacy roadmapy (`docs/ROADMAP.md`, `docs/audit/ROADMAP.md`) – usunięte.

9. **Które plany usunąć?**  
   Wszystkie równoległe roadmapy poza `PLANS.md`; historyczne plany zostawić wyłącznie w archiwum.

10. **Minimalny zestaw plików do przebudowy etapu?**  
    - `frontend/src/ui/sld/domainOpsClient.ts`  
    - `frontend/src/ui/sld/useEnmStore.ts`  
    - `frontend/src/ui/sld/__tests__/domainOpsClient.test.ts`  
    - `PLANS.md` + nowy pakiet dokumentów kanonicznych etapu.
