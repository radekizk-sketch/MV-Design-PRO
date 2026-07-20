# ZASADY WIĄZANIA KREATORÓW — stacja na końcu odcinka + wiązanie wielokierunkowe (V12K-073)

**Status:** BINDING (dyrektywa właściciela 2026-07-20: „zapisz zasadę że stację
wstawiamy na końcu odcinka. W sęku bez sensu. Pilnuj żeby kreatory wszystkie
byliby wiązane wielokierunkowo i warstwo np. z e-schematem i wszystkim innym —
planuj, zapisz i wdrażaj, ustaw cel i kryteria odbioru").
**Zakres:** wszystkie kreatory `frontend/src/ui2/kreatory/**` + ich powiązanie z
warstwami: model/topologia → SLD → selekcja/inspektor → analizy → zabezpieczenia →
raporty/zgodność.

---

## 1. Reguła: stacja/odbiór na KOŃCU odcinka (nie w środku)

**Zasada (wiążąca).** Element dołączany do magistrali (stacja SN/nN, ZK, słup
rozgałęźny, odbiór) wstawiamy zawsze na **KOŃCU** ostatniego odcinka ciągu —
budowa węzeł po węźle. **Wstawianie w środku odcinka jest zakazane** — jest
niefizyczne z punktu widzenia budowy realnej sieci (odcinek to fizyczny kabel/
linia między dwoma węzłami; „rozcinanie" go elementem to sztuczny podział bez
odpowiednika w projekcie).

Korekta wcześniejszej propozycji: rozważane „wstawianie stacji/odbioru w środku
ciągu" zostaje **odrzucone** i NIE jest budowane.

**Stan wdrożenia (już zgodny).** Łańcuchowanie magistrali realizuje
`buildNextContext` (`frontend/src/ui/network-build/trunkContinuation.ts`):
`placement_mode: 'ENDPOINT_APPEND'`, `endpoint_role: 'TO_BUS'`,
`position_on_segment: 1` (koniec odcinka). Operacja domenowa
`insert_station_on_segment_sn` (`backend/src/enm/domain_operations.py`) przyjmuje
`placement_mode`/`position_on_segment` i dokłada element do zacisku końcowego
świeżo utworzonego odcinka. Kreator magistrali (`KreatorMagistralaSn`) po dodaniu
odcinka ustawia koniec ciągu jako start następnego kroku — element zawsze ląduje
na końcu.

**Kryterium odbioru reguły:** żaden kreator ani flow nie oferuje wstawienia
elementu w środku odcinka (`position_on_segment` różne od końca / tryb „split");
język UI mówi „na końcu odcinka" (`magistrala/strings.ts`).

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
