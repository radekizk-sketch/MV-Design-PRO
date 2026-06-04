# E3 — Network auto-layout (design doc)

**Cel:** SIEĆ (GPZ → magistrala → fidery → ~53 stacje) → GEOMETRIA, deterministycznie. Buduje **NA E2**
(stacja = pod-layout E2), reużywa glify E0/E1. Najprostszy layouter sieci SN, nie biblioteka grafów.

## Eksploracja (znaleziska)

- Model sieci: `backend/tests/reference_networks/sld_substrate_52s.py` → `build_sld_substrate_52s()`
  buduje **ENM** (EnergyNetworkModel): GPZ 110/15 + **53 stacje** (12 magistrala „branch" + 41 fidery
  „inline"), **promieniowa** (1 magistrala + 12 odgałęzień po 3–4), **1 łącznik N.O.**, napięcia 110/15/0,4.
  `line_runs.stations` puste → drzewo odtwarzane z gałęzi (kabel/linia/łącznik/wyłącznik).
- Istnieje `core/layoutPipeline.ts` (VisualGraph→LayoutResult, 7 faz) ale adapter ENM→VisualGraph
  **brakuje/stub**; `engine/sld-layout` rysuje stacje jako **bloki 120×80** = reprezentacja stratna.
- Lekcja E2: **równoległa reprezentacja gubi wierność** → E3 czyta TEN SAM model (ENM) i komponuje E2.

→ **Decyzja:** E3 = NOWA warstwa sieciowa komponująca E2; NIE używa bloków `engine/sld-layout` ani
ciężkiego `core/layoutPipeline`. Dane z ENM (distill), glify E0/E1.

## Dane (most backend→frontend)

- Backend `application/reference_networks/sld_network_model.py` `distill_sld_network(enm)` (pure):
  BFS po grafie szyn (kabel+linia+wyłącznik+łącznik, **każdy status** → NO-ORPHAN) z szyny SN GPZ →
  drzewo stacji {id S01..S53, kind trunk/lateral, parent, depth, sn/nn_kv, trafo_mva, der[], nop}.
- `scripts/emit_sld_network_fixture.py` → `network/sldNetwork53.ts` (fixture, sort_keys, +source_hash).

## Struktury (CO)

- **Input** = `SldNetworkModel` (`networkModel.ts`): gpz, stations[], edges[], nop_station, voltages.
- **Output** = `NetworkLayout` (`networkLayout.ts`): gpz placement; stations `{id,kind,level,x,y,w,h,der,…}`;
  feeders `{from,to,open,points[]}` (ortho); bands `[{kv,y}]`; bbox; hash (FNV-1a, render-independent).

## Fazy (JAK) — „comb"

1. **TREE** — parent→children (GPZ root), poziom drzewa, łańcuch magistrali (trunk).
2. **LATERALS** — tidy-layout poddrzewa fidera w DÓŁ (liście = kolumny → brak nachodzenia, rzędy = pod-poziom).
3. **TRUNK** — stacje magistrali lewo→prawo, szerokość slotu = szerokość poddrzewa fidera (bez kolizji).
4. **ROUTING** — fider ortho parent→child; trunk↔trunk poziomo; fider→fider pionowo; **N.O. zachowany**
   (rysowany OTWARTY, nie wycięcie struktury — CI #465).
5. **HASH** — sort po ID, FNV-1a; ta sama sieć → bit-identyczny layout.

## Render (chirurgicznie)

- `NetworkAutoRenderer` (cienki): GPZ + fidery + **blok stacji** (wyłącznik wejściowy · trafo Dyn 15/0,4 ·
  szyna nN · plakietki DER) glifami E0. N.O. = amber przerywany + otwarty łącznik. Zoom → pełny E2 SLD.

## DoD (testy) — `networkLayout.test.ts`

- NO-ORPHAN: 53 stacje umieszczone (niezależnie od stanu łącznika).
- DETERMINIZM: ta sama sieć → identyczny hash + współrzędne.
- DRZEWO: każdy fider łączy umieszczoną stację z umieszczonym rodzicem; segmenty ortho.
- N.O.: dokładnie 1 fider otwarty; głowa wydzielonego odcinka narysowana.
- PASMA 110/15; magistrala w jednym rzędzie, fidery poniżej.

## Następne kamienie (po E3a)

- **(b) WIRTUALIZACJA** — viewport culling: rysuj tylko bloki w kadrze (stabilne bbox z layoutu).
- **(c) INKREMENT** — re-layout tylko dotkniętego poddrzewa (slot trunk niezależny → stabilność reszty).
- **Overlay (E4)** — wyniki solvera sieciowego per szyna → readouty E2 (idyn/udziały) na stacjach;
  pełna zgodność „zoom = preset" z liczbami (teraz: struktura E2 + glify E0, liczby = overlay).
- **Integracja UI** — montaż w widoku SLD aplikacji + LOD collapse/expand (blok↔E2 SLD) na zoom.
