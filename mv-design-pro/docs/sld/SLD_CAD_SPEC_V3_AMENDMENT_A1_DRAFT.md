# SLD CAD SPEC V3 — POPRAWKA A1 (DRAFT): ścieżka mocy i źródła

**Status:** SCALONE do `SLD_CAD_SPEC_V3.md` §12–§15 (2026-07-11) — dokument
historyczny, NIE czytać jako źródło; rozstrzygnięcia K-A/K-B/K-D w
`docs/v12xx/REJESTR_KONFLIKTOW.md` V12K-027..029.
**Wejście:** `SLD_POWER_PATH_AUDIT_2026-07.md` (audyt 12 ustaleń dyrektywy).
**Warunek scalenia:** rozstrzygnięcie kandydatów konfliktów K-A (kolejność aparatów), K-B (SA bez danych),
K-D (DER badge vs źródło) — patrz audyt §5.
**Zasada nadrzędna (niezmieniona):** WHITE BOX + domain_no_guessing — rysujemy to, co model opisuje;
konwencja rysunkowa dozwolona WYŁĄCZNIE jawnie oznaczona. Nakładki wyników = zero fizyki w UI (spec §6/§10).

Każdy paragraf ma format: **Wymaganie** + **Źródło danych** + **Wyrocznia odbioru (mierzalna)**.

---

## §12. Kompozycja celki pola wg fizycznej ścieżki mocy (dot. ustaleń 1/5/6)

### §12.1 Prymat danych nad konwencją (rozstrzygnięcie „dane vs konwencja")

- **Wymaganie:** stos aparatów pola jest budowany z `Bay.primary_devices` (ENM), gdy lista jest niepusta.
  Kolejność aparatów wynika z `placement` (UPSTREAM przy szynie → MIDSTREAM → DOWNSTREAM przy głowicy)
  oraz `section_side`; symbol z `kind`→`ApparatusKind` (`apparatusContracts.ts`). Konwencja-wg-roli
  (§12.4) jest dozwolona WYŁĄCZNIE jako fallback dla pola bez `primary_devices`, i wtedy pole MUSI nieść
  znacznik `data-apparatus-source="konwencja"` (audytor odróżnia rysunek z danych od typowego).
- **Źródło danych:** `Bay.primary_devices[*].{kind, placement, section_side, symbol_ref, switch_state}`
  (`backend/src/enm/models.py:769-795`), rzutowane przez rozszerzony adapter (kontrakt
  `MiniBlockBayDescriptor`, dziś gubi tę listę — patrz §F9 planu).
- **Wyrocznia odbioru:** `cell_sequence_probe` — dla KAŻDEGO pola z `primary_devices`: sekwencja symboli
  na rysunku (od szyny w dół) == sekwencja `kind` posortowana wg `placement`; 0 aparatów „z domysłu"
  (każdy narysowany aparat ma `device_ref` z ENM albo pole ma znacznik `konwencja`).

### §12.2 Kanoniczna sekwencja fizyczna celki (od szyny w dół)

- **Wymaganie:** referencyjna sekwencja pola liniowego celki SN, od szyny w dół:
  `DS_szynowy → CB → CT → (VT) → DS_liniowy → ES → (SA) → głowica kablowa → kabel`.
  Odczyt od kabla do szyny (jak w dyrektywie): `kabel → głowica → (SA) → (VT)/CT → DS → CB → szyna`.
  Elementy w nawiasach warunkowe (obecne, gdy występują w danych).
  **[DO ROZSTRZYGNIĘCIA — K-A]:** dyrektywa podaje literalnie `…odłącznik → wyłącznik → SZYNA`
  (od szyny: `CB→DS`); niniejszy draft przyjmuje kolejność wdrożonego GPZ i praktyki rozdzielnic SN
  (`DS_szynowy→CB`, odłącznik szynowy przy szynie). Nadzorca rozstrzyga przed scaleniem.
- **Źródło danych:** `placement` porządkuje; brak zgadywania kolejności.
- **Wyrocznia odbioru:** GPZ i stacja renderują TĘ SAMĄ gramatykę (mniejsza skala w stacji) — test parity
  gramatyki: dla pola liniowego stacja produkuje sekwencję zgodną z §12.2 (gdy dane obecne).

### §12.3 Głowica kablowa jako wejście pola

- **Wymaganie:** każde pole liniowe/odgałęźne, którego kabel jest fizycznym wejściem, kończy stos symbolem
  głowicy kablowej (`cableHead`), a kabel wchodzi/wychodzi od głowicy — nigdy „od szyny" bez głowicy.
- **Źródło danych:** `kind='CABLE_HEAD'` (ENM) lub konwencja (§12.4) z oznaczeniem.
- **Wyrocznia odbioru:** `field_entry_probe` — 0 pól liniowych, w których zejście kablowe zaczyna się
  bez symbolu głowicy na końcu toru pola (gdy pole ma kabel).

### §12.4 Kompozycja typowa celki wg roli (KONWENCJA RYSUNKOWA — fallback)

- **Wymaganie:** znormalizowane stosy fallback (gdy `primary_devices` puste), spójne z GPZ:
  - pole liniowe: `DS → CB → CT → DS → ES → głowica`;
  - pole TR: `DS → (bezpiecznik|CB) → TR2W`;
  - pole pomiarowe: `DS → VT → ES`;
  - pole sprzęgła: `DS → CB → CT`.
  Każdy stos rysowany z konwencji nosi `data-apparatus-source="konwencja"`.
- **Źródło danych:** rola pola (`bay_role`/`fieldRole`).
- **Wyrocznia odbioru:** stos fallback == tabela §12.4; obecność znacznika na każdym takim polu.

### §12.5 Ogranicznik przepięć (SA) — status danych

- **Wymaganie:** SA jest rysowany WYŁĄCZNIE, gdy pochodzi z danych. **[DO ROZSTRZYGNIĘCIA — K-B]:**
  `BayPrimaryDeviceKind` (ENM) nie zawiera `SURGE_ARRESTER`. Preferencja: rozszerzyć ENM o ten kind
  (zmiana backend, §F9). Do czasu decyzji SA NIE jest rysowany z konwencji (zakaz zgadywania).
- **Źródło danych:** (docelowo) `kind='SURGE_ARRESTER'`.
- **Wyrocznia odbioru:** 0 symboli SA bez `device_ref` z ENM.

---

## §13. Widoczne źródła i ich stany (dot. ustaleń 2/7/8)

### §13.1 Sieć zaczyna się od widocznych źródeł

- **Wymaganie:** każda scena renderuje WSZYSTKIE punkty zasilania jako widoczne symbole źródeł:
  GPZ (rozdzielnia — istniejąca kompozycja), transformator WN/SN, sieć zewnętrzna (Grid),
  DER (PV/BESS/generator/farma wiatrowa). Wiele GPZ MUSI być rysowanych (dziś tylko pierwszy — stopNote).
- **Źródło danych:** `Substation`(GPZ), `Source`(model thevenin/external_grid), `Generator`,
  `BaySourceEndpoint`(PV/BESS/FW) — ENM (`models.py:253-277,333-355,1004-1015`).
- **Wyrocznia odbioru:** `sources_visible_probe` — liczba narysowanych symboli źródeł == liczba źródeł
  w ENM (GPZ + Source + DER); 0 źródeł ENM bez reprezentacji na scenie.

### §13.2 Dedykowany zestaw symboli źródeł

- **Wymaganie:** rozróżnialne glify: GPZ (rozdzielnia), transformator WN/SN (`transformer2W`),
  sieć zewnętrzna/Grid (nowy glif), PV (`derPv`), BESS (`derBess`), generator (`derGenerator`),
  farma wiatrowa (nowy glif turbiny, obecnie FW reużywa generatora). Zestaw kompletny bez czytania etykiet.
- **Źródło danych:** `source_kind` / `Source.model`.
- **Wyrocznia odbioru:** `source_symbol_probe` — każdy `source_kind` mapuje na UNIKALNY glif; brak dwóch
  różnych rodzajów źródeł na tym samym glifie (dziś FW==generator: FAIL do naprawy).

### §13.3 Stany źródeł jako nakładka (spój ze spec §6: stan = kolor/nakładka, nie geometria)

- **Wymaganie:** pięć stanów źródła wizualizowanych nakładką (kolor/obwódka/badge), bez zmiany geometrii:
  `energized`, `standby`, `disconnected`, `maintenance`, `fault`.
- **Źródło danych:** **[CZĘŚCIOWE — wymaga danych]** `fault` i `disconnected`/`energized` wywodliwe ze
  stanów łączników i telemetrii (`BaySwitchState.actual_state` m.in. `awaria`; `runtime_state`).
  `standby`/`maintenance` NIE są modelowane na poziomie źródła — wymagają pola stanu operacyjnego źródła
  w ENM (zmiana backend, §F9) LUB białoskrzynkowej reguły wywodzenia zdefiniowanej tu (nie heurystyki).
- **Wyrocznia odbioru:** `source_state_probe` — mapowanie stan→nakładka deterministyczne; 0 stanów
  wywiedzionych bez udokumentowanej reguły; nakładka nie zmienia bboxu symbolu (spec §5/§6).

---

## §14. Nienaruszalna ciągłość, przepływ mocy, sylwetki, rozgałęzienia (dot. ustaleń 3/4/9/10)

### §14.1 Ciągłość źródło→odbiór (wzmocnienie §16)

- **Wymaganie:** pełna ścieżka `źródło → pole zasilające → głowica → zabezpieczenie → szyna → pole odpływowe
  → sieć SN → stacja → transformator → sieć nN → odbiór` jest nieprzerwana; żaden algorytm layoutu nie może
  jej rozspoić. Rozszerzenie §16: dla KAŻDEGO widocznego źródła istnieje trasa łącząca je z co najmniej jedną
  szyną (wyrocznia „źródło widoczne i połączone"). Strona nN (odpływy) i odbiór MUSZĄ być rysowane, gdy dane
  je opisują (dziś rysowana tylko szyna nN bez odpływów).
- **Źródło danych:** terminale §16 (`fromTerminal/toTerminal`), `Transformer`, sekcje nN, `Load`, `nnFeedersCount`.
- **Wyrocznia odbioru:** `source_connectivity_probe` — 0 źródeł bez trasy do szyny; `continuity_probe` —
  0 przerwań na styku SN→TR→nN→odbiór, gdy dane obecne; laterale zagnieżdżone rysowane lub jawny stopNote.

### §14.2 Wizualizacja przepływu mocy (nakładka, zero fizyki w UI)

- **Wymaganie:** nakładka przepływu: strzałki kierunkowe + wartości MW/MVAr/prąd[A] na odcinkach; animacja
  OPCJONALNA; dwukierunkowy przepływ DER (strzałka może wskazywać do szyny). Nakładka NIE liczy fizyki —
  czyta wyniki solvera power-flow (jedna prawda), spec §10.
- **Źródło danych:** wyniki PF (power-flow companion); wymaga tożsamości odcinków nie-GPZ (dług k1 —
  `PreviewSegment.meta.ownerRef/testId`, `SLD_CAD_REBUILD_PLAN_V3.md` F6b-2).
- **Wyrocznia odbioru:** `flow_overlay_probe` — kierunek/wartość każdego odcinka pochodzi z wyniku PF
  (brak wartości wpisanych w UI); overlay wyłączony bez wyniku (brak atrap); determinizm renderu nakładki.

### §14.3 Rozróżnialne sylwetki pól

- **Wymaganie:** podtypy pól (wejście/wyjście/odgałęzienie/transformator/sprzęgło/pomiar/DER) rozróżnialne
  wizualnie BEZ czytania etykiety (marker roli / wariant stosu / akcent), nie tylko podpisem `kier./odg.`.
- **Źródło danych:** `bay_role`/`fieldRole`.
- **Wyrocznia odbioru:** `field_silhouette_probe` — dla zestawu ról każde pole ma cechę wizualną unikalną
  dla roli (test: mapowanie rola→cecha injektywne w obrębie stacji).

### §14.4 Jawne rozgałęzienia (akcent węzłów)

- **Wymaganie:** węzeł rozgałęzienia (odejście lateralu/pierścienia) rysowany powiększonym, zaakcentowanym
  symbolem węzła, odróżnialnym od zwykłego T-węzła trasy.
- **Źródło danych:** topologia (`branchIndices`, `topologyRuns`), klasyfikacja `route.ts`.
- **Wyrocznia odbioru:** `branch_accent_probe` — każdy punkt odejścia lateralu ma węzeł o gabarycie
  większym niż `junction` bazowy; 0 rozgałęzień bez akcentu.

---

## §15. Optymalizacja layoutu i adaptacyjna czytelność (dot. ustaleń 11/12)

### §15.1 Minimalizacja zbędnej długości pionów (bez naruszania topologii i wyroczni §11)

- **Wymaganie:** layout dąży do redukcji łącznej długości pionów/zejść przy zachowaniu topologii,
  determinizmu i WSZYSTKICH wyroczni §11 (kolizje=0, siatka, port-connectivity, §16). Redukcja jest
  ograniczeniem miękkim — nigdy kosztem czytelności ani kolizji.
- **Źródło danych:** czysta geometria (deterministyczna).
- **Wyrocznia odbioru:** `vertical_length_probe` — miara łącznej długości pionów raportowana i
  nie-rosnąca względem poprzedniej wersji na fixturze `sldSubstrate52s` (regresja długości = FAIL),
  przy zielonych §11.1–§11.5 i determinizmie.

### §15.2 Adaptacyjne etykiety w kontrakcie LOD (doprecyzowanie §7)

- **Wymaganie:** LOD steruje szczegółowością ETYKIET (L0 kod → L1 nazwa+kVA+typ → L2 pełne specyfikacje),
  NIGDY nie ukrywa ŚCIEŻKI elektrycznej (symbole toru i trasy obecne na każdym LOD). Semantic zoom =
  progi kamery (polityka V3, dewiacja V12K-026 — bez cofania).
- **Źródło danych:** poziom LOD + `SceneV3` per poziom.
- **Wyrocznia odbioru:** `lod_path_probe` — na L0/L1/L2 zbiór odcinków toru elektrycznego jest niepusty
  i pokrywa te same połączenia topologiczne (LOD zmienia tylko etykiety, nie topologię ścieżki).

---

## Załącznik: mapa ustalenie → paragraf → wyrocznia

| Ustalenie | Paragraf | Wyrocznia |
|-----------|----------|-----------|
| 1/5/6 | §12.1–§12.5 | cell_sequence_probe, field_entry_probe |
| 2/7 | §13.1–§13.2 | sources_visible_probe, source_symbol_probe |
| 8 | §13.3 | source_state_probe |
| 3 | §14.1 | source_connectivity_probe, continuity_probe |
| 4 | §14.2 | flow_overlay_probe |
| 9 | §14.3 | field_silhouette_probe |
| 10 | §14.4 | branch_accent_probe |
| 11 | §15.1 | vertical_length_probe |
| 12 | §15.2 | lod_path_probe |
