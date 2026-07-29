# Kontrakt koordynacyjny: Reference Engine V1 × przebudowa interfejsu (UI/UX)

**Data:** 2026-07-17
**Strony:** wątek SLD CAD/SCADA (`claude/sld-schema-cad-scada-rqvz73`, ten dokument powstał tam)
× wątek przebudowy interfejsu (`claude/power-network-design-ui-ir91mv`, Program UI/UX 2026-07).
**Zlecenie właściciela:** „Przekaż zadanie do równoległego zadania UI/UX" — prezentacja
Reference Engine V1 (dyrektywa „Globalna integracja referencji SLD", 12 punktów) w nowej
powłoce interfejsu. Poprzedni kontrakt obu wątków:
`docs/sld/SLD_PROTECTION_MARKING_COORDINATION_2026-07.md` (rezerwacja numeracji pkt 3 —
obowiązuje; wątek SLD zajął dodatkowo V12K-060, patrz §6 niżej).

## 1. Co jest GOTOWE po stronie backendu/SLD (jedno źródło — NIE definiować drugi raz)

Spec WIĄŻĄCA: `docs/sld/REFERENCE_ENGINE_SPEC_V1.md` (ruling V12K-060 w
`docs/v12xx/REJESTR_KONFLIKTOW.md`). Moduł: `backend/src/reference_engine/`
(8 wersjonowanych pakietów JSON: iec60617, iec62271, elektrometal_e2alpha, siemens_8djh,
schneider_sm6, abb_unigear, abb_safering, osd_enea; 40 konfiguracji celek producentów
z cytowaniami katalogowymi; reguły OSD Enea z pełnej lektury Zeszytów 1–3 + Telemechaniki).

### 1.1 API (zarejestrowane w `docs/v12xx/MACIERZ_KOMPATYBILNOSCI_API.md`)

| Endpoint | Zwraca |
|---|---|
| `GET /api/reference/packs` | lista pakietów: `pack_id, kind (norm/manufacturer/osd), name_pl, version, status, switchgear_family_ref, source_document_refs` |
| `GET /api/reference/packs/{pack_id}` | pełny pakiet: `field_profiles` (iec62271), `symbol_map` (iec60617), `cell_configurations` (producenci), `station_rules` (OSD), `notes_pl` |
| `GET /api/cases/{case_id}/reference/compliance[?packs=a,b]` | raport: `packs[] { pack_id, name_pl, kind, version, applicable, passed, failed, score_percent (int\|null), checks[] { element_ref, rule_code, status pass/fail, message_pl } }` |

`score_percent = null` ⇒ prezentować jako **„nie dotyczy"** (zero sprawdzeń stosowalnych) —
NIE jako 0% ani 100%. Kontrakty TS: `frontend/src/ui/enm-inspector/types.ts`
(`ReferenceComplianceReport`, `REFERENCE_PACK_KIND_LABELS_PL`), klient:
`enm-inspector/api.ts::fetchReferenceCompliance`.

### 1.2 Walidacja NA ŻYWO (już płynie istniejącym kanałem)

Walidator ENM (`GET /api/cases/{id}/enm/validate` + każdy `POST /enm/ops`) emituje
ostrzeżenia severity IMPORTANT z kodami:
`reference.bays.missing_required_apparatus`, `.missing_switching_function`,
`.forbidden_apparatus`, `.apparatus_order_mismatch`, `.earth_switch_in_main_path`,
`.family_mismatch` (to ostatnie tylko dla pól związanych z rodziną przez
`bay_template_ref`). Komunikaty PL, `fix_action.modal_type="BayModal"`.
Nowa powłoka NIE liczy tych reguł — konsumuje wynik walidatora.

### 1.3 Implementacja referencyjna prezentacji (do przejęcia/zastąpienia przez nową powłokę)

Zakładka „Referencje" Inspektora ENM: `frontend/src/ui/enm-inspector/ReferencePanel.tsx`
(tabela Reference Score + rozwijane sprawdzenia ✓/✗; testidy: `reference-panel`,
`reference-score-table`, `reference-score-row-{pack_id}`, `reference-score-value-{pack_id}`,
`reference-checks-{pack_id}`; testy: `__tests__/referencePanel.test.tsx`). Traktować jako
wzorzec zachowań (stany: pusty/ładowanie/błąd/„nie dotyczy"), nie jako docelowy design.

### 1.4 Mirrory pakietów dla frontendu

`frontend/src/ui/sld/reference/{iec60617,iec62271}.pack.json` + `referenceProfiles.ts` —
BAJTOWO identyczne z backendem (egzekwuje `backend/tests/reference_engine/test_pack_parity.py`).
Nowa powłoka czerpie profile/słownik symboli STĄD albo z API — nigdy z własnych stałych.

## 2. Punkty styku wymagające działania wątku UI/UX

| # | Temat | Oczekiwane działanie wątku UI |
|---|-------|-------------------------------|
| 1 | Reference Score w IA | Miejsce w nowej IA na ocenę zgodności projektu per referencja (pkt 8 dyrektywy — tabela typu „IEC 62271 — 98%, SafeRing — 100%, Enea — 96%"). Źródło: endpoint compliance. Skala kolorów: 100% zielony / ≥80% bursztyn / <80% czerwień / null „nie dotyczy" szary (wzorzec w ReferencePanel). |
| 2 | Ostrzeżenia na żywo | Kody `reference.*` w panelu walidacji nowej powłoki (grupowanie: „Zgodność referencyjna"), z nawigacją do pola (`element_refs[0]`) i akcją „Napraw" → BayModal (pkt 3 dyrektywy: „Natychmiast", nie przy eksporcie). |
| 3 | ✓/✗ per element | Inspektor właściwości pola: lista zgodności per pakiet (pkt 7 dyrektywy) — filtr `checks[]` po `element_ref` wybranego pola; ✗ zawsze z `message_pl` (powód). |
| 4 | Kreator: wybór rodziny | Picker rodziny rozdzielnicy w kreatorze stacji/pola zasilany `GET /api/reference/packs` (kind=manufacturer) + istniejącym `/api/catalog/switchgear-families`; po związaniu pola (`bay_template_ref` z prefiksem `<FAMILY_REF>__`) UI pokazuje wynik `family.cell_match` (dopasowana celka z NAZWĄ, np. „odpowiada celce QM rodziny SM6-24"). Skład celek do podpowiedzi w formularzu: `cell_configurations` pakietu (standard vs opcja). |
| 5 | Słownik IA | Terminy do słownika nowej IA: „pakiet referencyjny", „profil pola", „konfiguracja celki", „Reference Score" (dopuszczalna forma PL: „ocena zgodności referencyjnej"), „nie dotyczy" (dla score null). Kody celek producentów (C, F, V, IM, QM, DM1-A, 8DJH R/T/L…) to NOTACJA katalogowa producenta — nie podlega `no_codenames_guard`. |
| 6 | Render Profile (pkt 6 dyrektywy) | NIE budować teraz przełącznika stylów renderowania. Style producenckie = PLAN z warunkiem danych (zweryfikowane wzorniki graficzne; zlokalizowane legendy symboli: 8DJH katalog HA 40.2 s. 10–13, UniGear ZS1 s. 83 — patrz `docs/audit/REFERENCE_ENGINE_RESEARCH_MANUFACTURER_CELLS_2026-07-17.md`). Jeżeli IA przewiduje miejsce na przełącznik — zarezerwować punkt w ustawieniach widoku, bez implementacji. |
| 7 | Wynik OSD | Reguły OSD (Enea) zwracają sprawdzenia na STACJACH (`element_ref` = ref stacji) i polach — prezentacja w inspektorze stacji analogicznie do pkt 3. Reguły `implemented=false` pakietu (z powodem w `description_pl`) NADAJĄ SIĘ do prezentacji informacyjnej („poza zakresem walidacji — powód"), nie jako błąd. |

## 3. Reguły twarde (obowiązują wątek UI)

1. **Zakaz drugiej definicji** (pkt 10/12 dyrektywy, V12K-060): skład pól, kolejności,
   słownik symboli, celki — WYŁĄCZNIE z API/mirrorów Reference Engine. Żadnych stałych
   w komponentach.
2. Etykiety 100% PL, zero kodenames projektu (kody celek producentów = notacja, patrz §2.5).
3. `score_percent: null` ⇒ „nie dotyczy" (uczciwość raportu — nie fabrykować procentów).
4. Testy komponentów z mockiem fetch na kontrakcie §1.1 (wzorzec: `referencePanel.test.tsx`);
   test interakcji od ścieżki natywnej (Zero-Debt pkt 5).

## 4. Czego wątek UI NIE robi

- Nie modyfikuje pakietów JSON ani silnika zgodności (własność wątku SLD/backendu).
- Nie dodaje reguł walidacyjnych po stronie klienta (walidator ENM = jedyne źródło ostrzeżeń).
- Nie tworzy stylów symboli producenckich „na oko" (reguła „nie fabrykuj danych producenta").

## 5. Kanał zwrotny

Wątek UI potwierdza/koryguje pkt 2.1–2.7 wpisem w sekcji „Potwierdzenia" (na swojej gałęzi
lub przez właściciela). Pytania o kontrakt API → wątek SLD przez ten plik (sekcja „Pytania").

## 6. Numeracja rejestru konfliktów (przypomnienie)

Zakres SLD V12K-026…039 WYCZERPANY; wątek SLD zajął **V12K-060** (Reference Engine) i
kontynuuje od V12K-060+; zakres **V12K-040…059 pozostaje zarezerwowany dla wątku UI**
(propozycja z kontraktu 2026-07-15, pkt 3 — nadal do potwierdzenia przy scaleniu).

## Potwierdzenia

- [x] Wątek UI: Reference Score w IA (pkt 2.1) — `ui2/spaces/gotowosc/SekcjaZgodnosciReferencyjnej.tsx` (REF-A); `score_percent=null` prezentowane jako „nie dotyczy", progi kolorów wg §2.1
- [x] Wątek UI: ostrzeżenia `reference.*` w panelu walidacji (pkt 2.2) — grupa „Zgodność referencyjna" w PanelGotowosci (REF-A), nawigacja do `element_refs[0]` + „Napraw" → BayModal
- [x] Wątek UI: ✓/✗ per element w inspektorze (pkt 2.3) — `ui2/spaces/model/ZgodnoscReferencyjna.tsx` (REF-B); ✗ zawsze z `message_pl`
- [x] Wątek UI: picker rodziny + cell_match w kreatorze (pkt 2.4) — `ui/network-build/station-wizard-v2/PickerRodzinyReferencyjnej.tsx` (REF-B); nazwa celki z `cell_match`, podpowiedzi standard/opcja z `cell_configurations`
- [x] Wątek UI: słownik IA (pkt 2.5) — `docs/uiux/SLOWNIK_IA_2026-07.md`
- [x] Wątek UI: rezerwa na Render Profile bez implementacji (pkt 2.6) — `ui2/shell/useShellStore.ts` (`RenderProfileId`, `DEFAULT_RENDER_PROFILE`), zero implementacji stylów
- [x] Wątek UI: prezentacja OSD (pkt 2.7) — wyniki OSD na stacjach w sekcji zgodności; `implemented=false` prezentowane informacyjnie

Potwierdzenie numeracji (pkt 3 kontraktu / §6): zakres V12K-040…059 dla wątku UI
POTWIERDZONY przy konsolidacji gałęzi 2026-07-17 (renumeracja V12K-027→V12K-040
wykonana; rejestr konfliktów zaktualizowany). Klienty referencji w wątku UI:
`ui2/referencje/api.ts` — wyłącznie reeksporty z `ui/enm-inspector` + klienty
GET pakietów (zakaz drugiej definicji, V12K-060). Testy komponentowe z mockiem
fetch na kontrakcie §1.1 dostarczone (REF-A/REF-B, 668 testów celowanych).

## Pytania

(brak — po konsolidacji gałęzi 2026-07-17 backend Reference Engine działa na tej
samej gałęzi; zalecana weryfikacja e2e-real w kolejnej sesji regresyjnej)
