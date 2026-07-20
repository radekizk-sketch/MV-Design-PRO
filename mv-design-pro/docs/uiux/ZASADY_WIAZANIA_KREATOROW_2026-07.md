# ZASADY WIĄZANIA KREATORÓW — stacja na końcu odcinka + wiązanie wielokierunkowe (V12K-073)

**Status:** BINDING (dyrektywa właściciela 2026-07-20: „zapisz zasadę że stację
wstawiamy na końcu odcinka. W sęku bez sensu. Pilnuj żeby kreatory wszystkie
byliby wiązane wielokierunkowo i warstwo np. z e-schematem i wszystkim innym —
planuj, zapisz i wdrażaj, ustaw cel i kryteria odbioru").
**Zakres:** wszystkie kreatory `frontend/src/ui2/kreatory/**` + ich powiązanie z
warstwami: model/topologia → SLD → selekcja/inspektor → analizy → zabezpieczenia →
raporty/zgodność.

---

## 1. Reguła: stacja/odbiór zawsze na WĘŹLE (końcu odcinka) — nigdy „pływająco"

**Zasada (wiążąca).** Odbiornik terminalny — **stacja SN/nN oraz odbiór** — jest
zawsze przyłączony do **WĘZŁA** sieci, tj. do KOŃCA odcinka. Nie istnieje pojęcie
„stacji pływającej w środku nienaruszonego kabla/linii". Dwie realizacje, obie
zgodne z regułą:

1. **Dołączenie na końcu istniejącego zacisku** (`append_station_on_endpoint`,
   `ENDPOINT_APPEND`) — stacja na wolnym końcu ostatniego odcinka. Tak działa
   kontynuacja magistrali (`buildNextContext`: `position_on_segment: 1`) i narzędzie
   Etap 6 (`SnSegmentSurface.openEndpointOperation`).
2. **Świadomy podział odcinka** (`insert_station_on_segment_sn`, `insert_at: RATIO`)
   — backend **rozdziela odcinek na dwa** ("Rozdzielenie segmentu na dwa", Phase 0A/0C
   „Conscious split with preview") i stawia stację w NOWYM węźle podziału. Stacja
   ląduje więc na KOŃCU pierwszego z powstałych odcinków — to również „na końcu
   odcinka", nie „w środku nienaruszonego toru".

**Co jest zakazane (phantom):** dorabianie ODRĘBNEGO pojęcia „wstaw stację w środku
odcinka BEZ podziału" (stacja wisząca na nienaruszonym przewodzie). Taki koncept nie
istnieje w modelu i NIE jest budowany. Odrzucona wcześniejsza propozycja dotyczyła
właśnie tego pseudo-trybu — świadomy podział (pkt 2) już realizuje intencję poprawnie.

**Węzły rozgałęźne (ZKSN, słup rozgałęźny)** analogicznie: `insert_at: RATIO` dzieli
odcinek i tworzy węzeł odgałęzienia (ZKSN tylko w torze kablowym, słup w napowietrznym);
stacja/odbiór ląduje na KOŃCU odgałęzienia. Łańcuch: magistrala → (opcjonalnie) węzeł
rozgałęźny na odcinku → odgałęzienie → stacja/odbiór na jego końcu.

**Stan wdrożenia:** ZGODNY we wszystkich ścieżkach. `append_station_on_endpoint` i
`insert_station_on_segment_sn` (świadomy podział) obie kończą stację na węźle. Standalone
`position_on_segment = 0.5` = podział odcinka w połowie (stacja w węźle środkowym =
koniec pierwszej połowy) — poprawne, NIE jest defektem. Menu kontekstowe / SLD
`conscious-split-on-segment` uruchamiają dokładnie ten audytowany podział — zostają.

**Retrakcja (Zero-Debt, uczciwość diagnozy):** wcześniejszy wpis „dług: stacja
mid-segment na ścieżkach legacy" był **błędną diagnozą** — świadomy podział to
poprawny, audytowany mechanizm (heavy-tested: `InsertStationForm.test.tsx`), a nie
wyciek. NIE zmieniamy tego zachowania. Do Audytu D pozostaje wyłącznie migracja UI
`InsertStationForm → ui2` (god-file → rama + panel teorii + wiązanie V12K-073),
BEZ zmiany semantyki podziału.

---

## 2. Program: wiązanie wielokierunkowe kreatorów (cel + kryteria odbioru)

### CEL
Każdy kreator ui2 ma **zweryfikowane, dwukierunkowe** powiązanie z warstwami
systemu: po utworzeniu elementu operacją domenową jest on natychmiast
**widoczny i wybieralny na e-schemacie** (glif podświetlony, SLD wycentrowany,
inspektor otwarty), a jego dane spływają do wszystkich warstw konsumujących
(topologia → SLD → analizy rozpływ/zwarcie → zabezpieczenia → raporty →
zgodność). Nie budujemy wysp — każdy kreator jest ogniwem łańcucha „do
ostatniego klika".

### Architektura wiązania (jeden model = jedno źródło prawdy)
Wiązanie warstwowe jest **gwarantowane architekturą singletonu NetworkModel**:
kreator wywołuje realną operację domenową, która mutuje JEDYNY snapshot ENM.
Wszystkie warstwy czytają ten sam snapshot:

- **Model/topologia** ← operacja domenowa (mutacja tylko tutaj).
- **SLD (e-schemat)** ← `logical_views` snapshotu → glif elementu (renderowanie
  glifu należy do wątku SLD; kreatory nie dotykają `ui/sld/**`).
- **Selekcja/inspektor/drzewo** ← `useSelectionStore.selectElement` (V12K-073).
- **Analizy (rozpływ/zwarcie)** ← `solver_input` czyta snapshot.
- **Zabezpieczenia** ← elementy modelu (pola, przekaźniki).
- **Raporty/zgodność** ← wynik solvera (read-only).

### Wiązanie kreator → e-schemat (V12K-073, wdrożone)
Wspólny hook `useSelekcjaPoOperacji`
(`frontend/src/ui2/kreatory/rama/selekcjaPoOperacji.ts`): po sukcesie operacji
domenowej wyłuskuje ref nowego elementu (`selection_hint.element_id` →
`changes.created_element_ids[0]`), mapuje `selection_type` backendu na
`ElementType` prezentacji, wywołuje `selectElement` (co otwiera property-grid),
centruje SLD (`centerSldOnElement`, gdy `zoom_to`) i nawiguje na schemat.
**ZERO fabrykacji:** ref i typ pochodzą z odpowiedzi backendu, nie z domysłu UI.

Przed V12K-073 tylko `magistrala` zaznaczała nowy element; pozostałe 8 kreatorów
kończyło samym `navigateToSld()` (użytkownik lądował na schemacie bez zaznaczenia
świeżego elementu). Wiązanie zostało ujednolicone.

### Macierz wiązania (rekonesans kodu)

| Kreator | Operacja domenowa | `selection_type` | ElementType | Wiązanie ze schematem |
|---------|-------------------|------------------|-------------|-----------------------|
| pole SN | `add_sn_bay` | `bay` | `BaySN` | ✅ select + center + nav |
| transformator | `add_transformer_sn_nn` | `transformer` | `TransformerBranch` | ✅ |
| źródło (GPZ) | `add_grid_source_sn` | `substation` | `Station` | ✅ |
| źródło OZE | `add_converter_source` | `generator`/`bay` | `Generator` | ✅ |
| kompensator | `add_shunt_compensator_sn` | `shunt_capacitor` | `Load` | ✅ |
| łącznik sekcyjny | `insert_section_switch_sn` | `switch` | `Switch` | ✅ |
| odbiór nN | `add_nn_load` | `load` | `Load` | ✅ |
| pierścień/NOP | `set_normal_open_point` | `switch` | `Switch` | ✅ |
| magistrala | `continue_trunk_segment_sn` | `branch` | `LineBranch` | ✅ (własny wzorzec, per-odcinek + łańcuch końca) |

### KRYTERIA ODBIORU
1. Każdy kreator po sukcesie zapisu **zaznacza nowy element** (nie tylko
   `navigateToSld`) — ref i typ z odpowiedzi backendu. ✅
2. `selectElement` otwiera property-grid; `centerSldOnElement` centruje SLD na
   nowym elemencie. ✅
3. Typ elementu mapowany ze słownika domenowego backendu (`mapujTypElementu`),
   z fallbackiem per kreator (bez fabrykacji). ✅
4. Reguła „stacja na końcu odcinka" wymuszona (`ENDPOINT_APPEND`,
   `position_on_segment: 1`); brak trybu wstawiania w środku. ✅
5. Testy: hook (`selekcjaPoOperacji.test.tsx`, 8 przyp.) + realna ścieżka
   kreatora (transformator: po zapisie element zaznaczony + SLD wycentrowany). ✅
6. Zielone: type-check, lint, guardy, pełna regresja frontendu. (weryfikacja
   przy scaleniu)

---

## 3. Reguły spójne z kanonem
- ZERO fizyki w UI; wartości z katalogu, wynik z solvera. FROZEN Result API,
  determinizm nietknięte. Renderowanie glifów SLD = wątek SLD (bez kolizji plików
  między wątkami — kreatory pozostają w `ui2/kreatory/**` i warstwie selekcji).
- Reużycie: wspólny hook `rama/selekcjaPoOperacji`, `selection_hint` backendu,
  istniejący `useSelectionStore`. Bez równoległych rozwiązań.
- Kontrakt ekranu prowadzącego (FLOW §0.3): po utworzeniu element jest widoczny
  i prowadzi do następnego kroku (jawny następny krok = zaznaczony element na
  schemacie gotowy do inspekcji/dalszej rozbudowy).
