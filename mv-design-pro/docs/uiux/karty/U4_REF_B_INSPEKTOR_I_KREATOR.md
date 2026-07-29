# KARTA ZADANIA REF-B — ZGODNOŚĆ ✓/✗ W INSPEKTORZE + PICKER RODZINY W KREATORZE (HANDOFF pkt 2.3, 2.7, 2.4)

**Faza:** U4 · **Zlecenie:** integracja Reference Engine V1 (kontrakt WIĄŻĄCY:
`docs/sld/REFERENCE_ENGINE_UI_HANDOFF_2026-07.md` — PRZECZYTAJ w całości) ·
**Wykonawca:** Opus · **Warstwa:** frontend · **Wiążące:** CLAUDE.md; HANDOFF
§3/§4; granica SLD (`ui/sld/**` READ-ONLY; `ui/network-build/**` NALEŻY do
wątku UI — wolno edytować).

## 0. Fundament (już na gałęzi — NIE definiuj drugi raz)
Klient: `ui2/referencje/api.ts` (`fetchReferenceCompliance`,
`fetchReferencePacks(kind)`, `fetchReferencePack(packId)` z typami
`ReferenceCellConfiguration`, `ReferenceStationRule`). Backend NIE istnieje
na tej gałęzi — testy Z MOCKIEM fetch wg kontraktu §1.1 (wymóg §3.4).

## 1. Punkt 2.3 + 2.7 — zgodność ✓/✗ per element w inspektorze właściwości
Zakładka „Właściwości" przestrzeni modelu
(`ui2/spaces/model/WlasciwosciModelu.tsx` — sekcja pod property gridem):
dla WYBRANEGO elementu (pole LUB stacja — `element_ref` z selekcji) sekcja
„Zgodność referencyjna": lista per pakiet — filtr `checks[]` raportu
compliance po `element_ref`; ✓ (pass) / ✗ (fail), przy ✗ ZAWSZE `message_pl`
(HANDOFF §2.3). Pakiety bez sprawdzeń dla elementu — pomijane (bez szumu).
Dla STACJI (pkt 2.7): dodatkowo reguły `implemented=false` pakietu OSD
(`fetchReferencePack('osd_enea')`, `station_rules[]`) prezentowane
INFORMACYJNIE: „poza zakresem walidacji — {description_pl}" (styl noty,
NIE błąd/✗). Stany: brak selekcji → nic nowego (sekcja nie renderuje się);
brak przypadku/błąd API → uczciwa nota PL; multi-selekcja → sekcja dla
pierwszego elementu z adnotacją.

## 2. Punkt 2.4 — picker rodziny rozdzielnicy + cell_match w kreatorze
Kreator stacji/pola: `ui/network-build/station-wizard-v2/` (ZBADAJ krok
konfiguracji rozdzielnicy/pola — gdzie żyje wybór szablonu
`bay_template_ref`; istniejące `/api/catalog/switchgear-families` — ZBADAJ
jak dziś zasilane):
1. Picker rodziny rozdzielnicy zasilany `fetchReferencePacks('manufacturer')`
   ZŁĄCZONY z istniejącym źródłem rodzin katalogowych (pakiet ↔ rodzina po
   `switchgear_family_ref`); etykieta = `name_pl` pakietu + wersja; wybór
   ustawia istniejące pole rodziny (ZERO nowej ścieżki zapisu — reuse
   istniejącego mechanizmu wyboru rodziny).
2. Po związaniu pola (`bay_template_ref` z prefiksem `<FAMILY_REF>__` —
   HANDOFF §2.4): pokaż wynik `family.cell_match` z raportu compliance
   (check o rule_code rodziny/cell_match dla tego pola — ZBADAJ kształt
   w checks[]; jeżeli cell_match przychodzi inaczej niż w checks — ZBADAJ
   spec §9 na gałęzi SLD `git show origin/claude/sld-schema-cad-scada-rqvz73:
   mv-design-pro/docs/sld/REFERENCE_ENGINE_SPEC_V1.md`) — komunikat PL
   z NAZWĄ dopasowanej celki (np. „odpowiada celce QM rodziny SM6-24").
3. Podpowiedzi składu: `cell_configurations` wybranego pakietu w formularzu
   pola — skład standardowy vs opcja (oznaczenie PL „standard"/„opcja");
   kody celek (C/F/V, IM/QM/DM1-A, R/T/L…) = notacja katalogowa producenta
   (HANDOFF §2.5 — NIE podlegają no_codenames_guard, ale NIE dodawaj ich
   do żadnych stałych — wyłącznie z API/pakietu).
Jeżeli którakolwiek część pkt 2.4 okaże się niewykonalna bez backendu
(np. cell_match nieobecny w kontrakcie §1.1) — zaimplementuj czytanie
z kontraktu wg spec, test z mockiem, i ZGŁOŚ w raporcie pytanie do sekcji
„Pytania" HANDOFF (kanał §5) zamiast zgadywać.

## 3. Testy (≥16, mock fetch §1.1 + ścieżka natywna)
Inspektor: ✓/✗ filtrowane po element_ref, ✗ z message_pl, stacja z regułami
implemented=false jako nota (nie błąd), brak selekcji/przypadku, multi.
Kreator: picker z pakietów manufacturer (mock), złączenie z rodzinami
katalogu, wybór ustawia istniejące pole, cell_match z nazwą celki,
podpowiedzi standard/opcja, istniejące testy kreatora bez regresji.

## 4. Bramki
KROK 0: `git fetch origin claude/power-network-design-ui-ir91mv && git reset
--hard FETCH_HEAD`. Baza vitest: zmierz w KROK 0 (ZERO failed obowiązuje).
Środowisko: symlink node_modules (NIE commituj); pętla `until` przed pełnym
vitest; pełny vitest do pliku (usuń przed commitem); NIE edytuj src w trakcie;
po biegu NATYCHMIAST commit. Bramki (pipefail, z frontend/): type-check, lint
--max-warnings 0, PEŁNY npm test ZERO failed, guard:codenames;
z mv-design-pro: forbidden_ui_terms, ui_terminology, utf8_mojibake,
dead_click_guard, dialog_completeness_guard. Etykiety 100% PL. NIE modyfikuj
`ui/sld/**` ani `ui/enm-inspector/**`. Commit:
`feat(ui): zgodność referencyjna w inspektorze + picker rodziny w kreatorze (REF-B)`
BEZ push. Raport standardowy (plik:linia; pytania do HANDOFF jeżeli są).
