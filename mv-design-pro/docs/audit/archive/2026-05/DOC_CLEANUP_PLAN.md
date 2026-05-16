# Plan czyszczenia i ujednolicenia dokumentacji

Cel: spójny język PL, jedna prawda kanoniczna, brak duplikatów i sprzeczności.

## KEEP (kanoniczne / wymagane)

- `SYSTEM_SPEC.md` — kanon architektury (BINDING).
- `AGENTS.md` — governance i zakazy (BINDING).
- `PLANS.md` — jedyny mechanizm wykonawczy (BINDING).
- `CANONICAL_COMPLIANCE.md` — checklisty PF (BINDING).
- `docs/INDEX.md` — kanoniczny indeks P14–P19 (BINDING).
- `docs/ui/wizard_screens.md` — kanoniczny opis Wizard/UI (BINDING).
- `docs/proof_engine/*` — kanoniczne źródła Proof Engine (BINDING).
- `docs/audit/STATE_OF_PROJECT.md` — raport audytowy (kanoniczny).

## MOVE (zmiana lokalizacji/nazwy)

- `docs/ROADMAP.md` → `docs/product/ROADMAP.md` (propozycja): oddzielić roadmapę produktu od roadmapy audytowej; zapobiega myleniu z `docs/audit/ROADMAP.md`.
  - Powód: rozdział roadmapy funkcjonalnej i audytowej.
- `docs/audit/historical_execplans/*` → `docs/archive/historical_execplans/*` (propozycja): jawny katalog „archiwum”.
  - Powód: odseparowanie materiałów historycznych od bieżących źródeł.

## UPDATE (wymagana korekta treści / PL / spójność)

- `docs/ui/RESULTS_BROWSER_CONTRACT.md` — ujednolicić nazewnictwo PL i etykiety UI (np. „Przeglądarka wyników”).
- `docs/ui/ELEMENT_INSPECTOR_CONTRACT.md` — konsekwentne tłumaczenie sekcji i tabel.
- `docs/ui/CASE_COMPARISON_UI_CONTRACT.md` — ujednolicenie terminologii PL + BoundaryNode – węzeł przyłączenia.
- `docs/ui/SLD_RENDER_LAYERS_CONTRACT.md` — tłumaczenie angielskich nagłówków/tabel.
- `docs/ui/CATALOG_BROWSER_CONTRACT.md` — tłumaczenie angielskich nagłówków/tabel.
- `docs/ui/SC_NODE_RESULTS_CONTRACT.md` — spójne nazewnictwo PL.
- `docs/01-Core.md`, `docs/04-Application.md` — kontynuacja ujednolicenia PL (pozostałe angielskie fragmenty, jeśli występują).
- `docs/ui/sld_rules.md` — dopracowanie pozostałych anglicyzmów w nazwach własnych UI (jeśli wymagane).

## REMOVE (duplikaty / nieaktualne)

- `docs/audit/historical_execplans/EXECPLANS.md` — historyczny katalog planów, duplikuje `PLANS.md` i zawiera nieaktualne założenia (BoundaryNode w modelu). Do usunięcia po potwierdzeniu architekta.
- `docs/audit/historical_execplans/ExecPlan-01.md` — zawiera sprzeczne założenia (BoundaryNode jako obiekt modelu). Do usunięcia po potwierdzeniu architekta.
