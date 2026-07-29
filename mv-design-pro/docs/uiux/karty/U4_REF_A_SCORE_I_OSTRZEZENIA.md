# KARTA ZADANIA REF-A — REFERENCE SCORE + OSTRZEŻENIA NA ŻYWO (HANDOFF pkt 2.1, 2.2)

**Faza:** U4 · **Zlecenie:** integracja Reference Engine V1 (kontrakt WIĄŻĄCY:
`docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md` — PRZECZYTAJ w całości; spec:
`docs/sld/REFERENCE_ENGINE_SPEC_V1.md` na gałęzi SLD) · **Wykonawca:** Opus ·
**Warstwa:** frontend · **Wiążące:** CLAUDE.md; HANDOFF §3 (reguły twarde);
§4 (czego nie robić); granica SLD (pliki `ui/sld/reference/*` = mirrory
READ-ONLY, nie modyfikować).

## 0. Fundament (już na gałęzi — NIE definiuj drugi raz)
Klient i typy: `ui2/referencje/api.ts` (reeksport `ReferenceComplianceReport`,
`REFERENCE_PACK_KIND_LABELS_PL`, `fetchReferenceCompliance` z kontraktu
`ui/enm-inspector/types.ts|api.ts`; + `fetchReferencePacks`). Backend NIE
istnieje na tej gałęzi — testy komponentów Z MOCKIEM fetch na kontrakcie
HANDOFF §1.1 (to wymóg §3.4, nie obejście).

## 1. Punkt 2.1 — Reference Score w IA (przestrzeń Gotowość)
Sekcja „Ocena zgodności referencyjnej" w przestrzeni Gotowość
(`ui2/spaces/gotowosc/PanelGotowosci.tsx` — ZBADAJ układ; sekcja pod/obok
istniejących celów, zwijana): tabela per pakiet z
`GET /api/cases/{id}/reference/compliance` (case_id z aktywnego przypadku —
wzorzec innych ekranów; bez przypadku → uczciwy stan pusty PL):
kolumny: pakiet (name_pl), rodzaj (etykieta z `REFERENCE_PACK_KIND_LABELS_PL`),
wersja, zaliczone/oblane (passed/failed), wynik. WYNIK:
`score_percent=null` ⇒ DOKŁADNIE „nie dotyczy" (nigdy 0%/100%), szarość;
100% zieleń; ≥80% bursztyn; <80% czerwień — tokeny `--mvd-*`. Rozwinięcie
wiersza → `checks[]` pakietu (✓/✗, element_ref, message_pl). Stany
pusty/ładowanie/błąd PL (wzorzec zachowań: `ui/enm-inspector/
ReferencePanel.tsx` + jego test — wzorzec ZACHOWAŃ, nie designu).

## 2. Punkt 2.2 — ostrzeżenia `reference.*` na żywo
Panel walidacji nowej powłoki = lista problemów gotowości
(`useProblemyGotowosci`, `ui2/spaces/gotowosc/adapters/` — ZBADAJ kształt
`ReadinessIssue` i skąd płynie walidator ENM). Zadanie: kody
`reference.bays.*` (HANDOFF §1.2: missing_required_apparatus,
missing_switching_function, forbidden_apparatus, apparatus_order_mismatch,
earth_switch_in_main_path, family_mismatch) grupowane jako ODRĘBNA grupa
„Zgodność referencyjna" (`grupowanieCelow.ts` — ZBADAJ mechanikę grup);
klik wiersza → selekcja `element_refs[0]` (istniejąca ścieżka selekcji
panelu); akcja naprawcza → istniejący mechanizm `fix_action`
(`modal_type="BayModal"` — panel ma już `onAkcjaNaprawcza`, reuse; ZERO
własnych reguł walidacyjnych — HANDOFF §4). „Natychmiast, nie przy
eksporcie": grupa żyje w tym panelu, który odświeża się po zmianach ENM
(istniejący kanał — nie buduj nowego).

## 3. Testy (≥14, mock fetch wg §1.1 + ścieżka natywna)
Tabela: null→„nie dotyczy" (i NIGDY 0%/100% — asercja negatywna), progi
kolorów (100/≥80/<80), rozwinięcie checks z message_pl, stany
pusty/ładowanie/błąd, bez przypadku. Ostrzeżenia: kody reference.* trafiają
do grupy „Zgodność referencyjna" (fixture ReadinessIssue 1:1 z kształtem
adaptera), klik→selekcja element_refs[0], akcja naprawcza wywołuje
onAkcjaNaprawcza z problemem, istniejące grupy bez regresji.

## 4. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: 8697 (8690+5 klient+2 enm — zmierz KROK 0,
liczy się ZERO failed). Środowisko: symlink node_modules (NIE commituj);
pętla `until` przed pełnym vitest (w tle mogą biec inne suity); pełny vitest
do pliku (usuń przed commitem); NIE edytuj src w trakcie; po biegu NATYCHMIAST
commit. Bramki (pipefail, z frontend/): type-check, lint --max-warnings 0,
PEŁNY npm test ZERO failed, guard:codenames; z mv-design-pro:
forbidden_ui_terms, ui_terminology, utf8_mojibake, dead_click_guard,
dialog_completeness_guard. Etykiety 100% PL. NIE modyfikuj `ui/sld/**`,
`ui/enm-inspector/**` (kontrakt READ-ONLY). Commit:
`feat(ui2): ocena zgodności referencyjnej + ostrzeżenia na żywo (REF-A)`
BEZ push. Raport standardowy (plik:linia; potwierdzenie null→„nie dotyczy").
