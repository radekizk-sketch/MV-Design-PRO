# MAPA MIGRACJI DOKUMENTÓW I PLANÓW

Status: **KANONICZNA MAPA MIGRACJI**  
Data: **2026-03-30**

## 1. Reguła migracji

- **Jeden plan operacyjny:** `PLANS.md`.
- **Aktywny kanon dokumentacji:** `docs/INDEX.md` i `docs/INDEX_KANONICZNY.md`.
- **Wiążące specyfikacje systemowe:** `docs/system/*`.
- `docs/spec/` i `docs/archive/` pozostają materiałem historycznym / kontekstowym.
- Dokumenty historyczne przenoszone do archiwum albo usuwane, jeśli dublują aktywny kanon.

## 2. Migracje wykonane

| Stary dokument | Akcja | Nowe miejsce / zastępstwo |
|---|---|---|
| `docs/ROADMAP.md` | USUNIĘTY | `PLANS.md` |
| `docs/audit/ROADMAP.md` | USUNIĘTY | `PLANS.md` |

## 3. Migracje logiczne (bez fizycznego przenoszenia plików)

| Zakres treści | Dokument docelowy kanoniczny |
|---|---|
| Kontrakty domenowe ENM_OP + readiness/fix_actions | `docs/domain/OPERACJE_DOMENOWE_V1.md`, `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md` |
| Kontrakt semantyka→layout→render SLD | `docs/sld/SLD_CONTRACT_FLOW_V1.md`, `docs/sld/SLD_SEMANTIC_MODEL_CANONICAL_V1.md` |
| Architektura globalna systemu | `SYSTEM_SPEC.md`, `ARCHITECTURE.md`, `docs/INDEX_KANONICZNY.md`, `docs/system/*` |

## 4. Polityka na kolejne etapy

1. Nie tworzyć nowych roadmap równoległych do `PLANS.md`.  
2. Każdy nowy dokument musi wskazać, czy jest: `KANONICZNY`, `ROBOCZY`, `ARCHIWALNY`.  
3. Przy zamknięciu etapu: aktualizacja `PLANS.md` + wpis do `docs/INDEX_KANONICZNY.md`.
