# AUDYT + PRZEBUDOWA: Pole SN powiązane z szablonami pól producentów (G-POLE-R)

**Status:** BINDING (audyt end-to-end + przebudowa; dyrektywa właściciela 2026-07-19:
„ponowny audyt end-to-end, nie twórz równoległych ścieżek — pole SN musi być powiązane
z szablonami pól producentów; przeprojektuj globalnie i powiąż wielowarstwowo").
**Rejestr:** V12K-058 (koryguje G-POLE / V12K-057).

---

## 0. Znalezisko (defekt architektoniczny — równoległa ścieżka)

Kreator `KreatorPolaSn` (G-POLE) i operacja `add_sn_bay` konfigurowały pole SN z
**surowego aparatu APARAT_SN + `bay_role` + `apparatus_kind`**, ignorując istniejącą,
wielowarstwową infrastrukturę **szablonów pól producentów**, której używają:
- kreator GPZ `add_grid_source_sn` (V12K-044, K5): rodzina rozdzielnicy →
  `switchgear_family_ref` + `manufacturer_ref`, per-pole `bay_template_ref`, `protection_ref`;
- kreator stacji `append_station_on_endpoint`: `field_spec` z tymi samymi kluczami.

To była **równoległa, płytsza ścieżka** — łamie „reużycie zamiast duplikacji" i zrywa
łańcuch pola do SLD / zabezpieczeń / Reference Engine.

---

## 1. Dowód (grounded, plik:linia)

| # | Fakt | Dowód |
|---|------|-------|
| 1 | Kanoniczny builder field_spec z refami producenta istnieje | `enm/domain_operations.py:740` `_build_field_spec` (protection_ref/bay_template_ref/switchgear_family_ref/manufacturer_ref) |
| 2 | `add_sn_bay` JUŻ używa `_build_field_spec` (nowe pole) — ale NIE przekazuje refów producenta | `domain_operations_v2.py:1676` |
| 3 | `AddSnBayPayload` NIE miał pól producenta (tylko bus/role/apparatus/catalog) | `domain_ops_models.py` (AddSnBayPayload) |
| 4 | GPZ/stacja przechowują refy producenta na field_spec (parytet) | `domain_operations.py:504/535/770`, `:3315/3433` |
| 5 | Frontend ma gotowe pickery + fetch | `ui/catalog/SwitchgearFamilyPicker.tsx`, `BayTemplatePicker.tsx`, `catalog/api.ts` `fetchSwitchgearFamilies`/`fetchCompleteBayTemplates` |
| 6 | Szablon pola niesie rolę/kind/rodzinę/producenta; protection materializuje backend | `BayTemplatePicker.tsx` `CompleteMvBayTemplateSummary` (template_ref, switchgear_family_ref, manufacturer_ref, bay_role, bay_kind) |
| 7 | GPZ przekazuje refy, protection wywodzi backend | `ui2/kreatory/zrodlo/KreatorZrodloZasilania.tsx:340` (family→refs), per-pole `bay_template_ref` |

**Wniosek:** infrastruktura ISTNIEJE i jest kanoniczna. `add_sn_bay` był tylko
NIEDOPIĘTY do niej (używa `_build_field_spec`, ale bez refów). To nie wymaga nowej
warstwy — wymaga wpięcia w istniejący łańcuch (reużycie).

---

## 2. Model warstw (BayKind ↔ bay_role)

| bay_role | BayKind (szablon) | Uwaga |
|----------|-------------------|-------|
| IN | `liniowe_doplywowe` | pole dopływowe (po TR WN/SN) |
| OUT / FEEDER / OZE | `liniowe_odplywowe` | pole odpływowe/odgałęźne/źródłowe |
| TR | `transformatorowe` | pole transformatorowe |
| MEASUREMENT | `pomiarowe` | pole pomiarowe |
| COUPLER | `sprzeglowe_podluzne` | sprzęgło sekcji |

Łańcuch wielowarstwowy: **rodzina rozdzielnicy (producent) → szablon pola (BayKind) →
protection_ref (materializacja backend) → field_spec → SLD / zabezpieczenia (E-27/E-28) /
Reference Engine / zgodność.**

---

## 3. Przebudowa (reużycie, nie duplikacja)

### Backend (additive, parytet ze stacją/GPZ)
- `AddSnBayPayload`: dodać `bay_template_ref`, `switchgear_family_ref`, `manufacturer_ref`,
  `protection_ref` (Optional[str]).
- `add_sn_bay`: odczytać refy z payloadu i przekazać do `_build_field_spec` (nowe pole,
  `:1676`) oraz do `_update_field_spec` (istniejące pole, `:1655`). Bez refów — zachowanie
  bez zmian (wsteczna zgodność). Zero fabrykacji: refy pochodzą z katalogu producenta.

### Frontend (reużycie pickerów)
- `KreatorPolaSn`: krok „Szablon producenta" — `SwitchgearFamilyPicker`
  (rodzina → switchgear_family_ref + manufacturer_ref) → `BayTemplatePicker` filtrowany
  po roli/BayKind (→ bay_template_ref). Payload niesie refy; protection wywodzi backend.
- Surowy aparat APARAT_SN pozostaje jako **fallback ekspercki** (opcja max — zdolność
  zachowana, gdy brak szablonu producenta).
- Kontrakt `types/domainOps.ts` (`AddSnBayPayload`): dodać 4 pola addytywnie.

### DoD
- Backend: pełna regresja pytest + `tests/ci`; determinizm (seed bez zmian dla payloadu
  bez refów). Frontend: pełna regresja vitest, type-check, guardy UI. Reużycie pickerów
  (bez duplikacji). Rejestr V12K-058. Bez edycji `ui/sld/**`.
