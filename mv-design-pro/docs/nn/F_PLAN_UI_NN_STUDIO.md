# F — PLAN UI: nN STUDIO (UI ROUTING PLAN)

**Zasada:** nN STUDIO to zestaw widoków JEDNEGO modelu w istniejącej powłoce `ui2` — nie osobna
aplikacja, nie 8. przestrzeń top-level. Wszystkie ekrany wg kontraktu ekranu prowadzącego
(FLOW_PROJEKTANTA §0.3: cel jednym zdaniem · tor pracy · uczciwe stany zerowe · jawny następny
krok · język inżynierski) i gramatyki interakcji (MODEL_INTERAKCJI §2).

## 1. Umiejscowienie w architekturze UI

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Przestrzeń | **`model`** (wejście „nN STUDIO" z kontekstu stacji/rozdzielnicy) + wyniki nN w przestrzeni **`wyniki`** | zgodne z E2 (budowa modelu) + E5/E6 (interpretacja/decyzje); zero nowej przestrzeni — SpaceId pozostaje 7 |
| Układ | `PanelLayout` (drzewo nN ↔ środek: SLD/tabela/wykres ↔ inspektor globalny) | reuse wprost |
| Drzewo (LEWA) | nowy adapter `ContextTree`: TR → RGnN (sekcje) → odpływy → podrozdzielnice → odbiory/źródła | wzorzec adapterowy istnieje |
| Środek | przełącznik trybów lokalnymi zakładkami (wzorzec `WynikiWarsztat.ZAKLADKI`) | bez nowego frameworku |
| Inspektor (PRAWA) | globalny `InspectorPanel` + sekcje nN (rozszerzona `SekcjaPetlaZwarcia` + SWZ + Ib/Iz) | reuse |
| Rejestr okien | nowe wiersze **W-620…W-63x** w `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` §4 (obowiązek wpisu przed budową); W-612 (pętla nn) zostaje SKONSUMOWANE przez W-624 | proces wiążący |
| Ekrany kanonu | nowe `E-51+` w `screenCanonRegistry` (unia otwarta na rozszerzenie) dla obiektów: odcinek nN, RGnN, aparat nN; E-19/E-20 rozbudowane | istniejący seam |

## 2. Zakładki nN STUDIO (§40 zlecenia) → widoki jednego modelu

| Zakładka | Zawartość | Reuse |
|---|---|---|
| TOPOLOGIA | drzewo+SLD poddrzewa nN stacji; akcje: dodaj odcinek/rozdzielnicę/odbiór/źródło (→ kreatory) | SLD v3 (po seam A8 §9), operationFormRegistry |
| ODCINKI | **tabela odcinków** (§41): ID, od, do, typ, kabel, przekrój, materiał, długość, n_torów, ułożenie, Ib, Iz′, ΔU, Ik min/max, SWZ, status; add/remove/copy/filtr/sort/eksport | `TabelaWynikow` (odczyt) + NOWY tryb edycji (§5) |
| OBCIĄŻENIA | odbiory per odpływ, profile, jednoczesność, fazy (P1) | property-grid + kreator `odbior` |
| ZABEZPIECZENIA | aparaty w torach, nastawy (capability-driven z katalogu: Ir/Isd/Ii tylko gdy aparat je ma — §67) | `SekcjaNastaw` wzorzec |
| SWZ | heatmapa obwodów + werdykty + dowód liczbowy + wykres marginesu Ik_min/Ia (granica 1,0) | `TabelaWynikow` + wzorzec wykresu profilu |
| ZWARCIA | Ik max/min per szyna, wykres Ik vs droga (§44) | `WykresIkssChart` wzorce |
| NAPIĘCIA | profil U (§11): U[%] vs droga elektryczna, wybór ścieżki, highlight na SLD, najgorsza ścieżka auto, warianty przypadków | `ProfilNapiecChart` |
| SELEKTYWNOŚĆ | TCC łańcucha SN→TR→ACB→MCCB→MCB/gG (multi-device, jeden wykres) | `TccChart` rozszerzony |
| DOBÓR | ranking przekrojów i aparatów (warianty A/B/C side-by-side, §47) + wykres koordynacji doboru (§42: Ib/In/Iz/Ik min/max na jednej osi) | nowy ekran na `EkranAnalizy` |
| WYNIKI | zbiorczo per przypadek + „który przypadek decyduje" + bilans RGnN na żywo (§36) | `EkranAnalizy` + panel bilansu |

## 3. Kreatory (rama `KreatorRama`, rejestracja w `operationFormRegistry` + `dialog_completeness_guard`)

| Kreator | Operacja domenowa | Uwagi |
|---|---|---|
| `ui2/kreatory/odcinek-nn` | `add_nn_cable_segment` (+`split/merge`) | picker KABEL_NN + długość + ułożenie (`set_nn_cable_laying_conditions`) + n_parallel; preview Iz′/ΔU z endpointów S20 |
| `ui2/kreatory/rozdzielnica-nn` | `add_nn_distribution_board`, `add_nn_section_coupler` | sekcje, sprzęgło, pola: zasilające/odpływy/agregat/PV/BESS/UPS/kompensacja/pomiar (§34) |
| `ui2/kreatory/aparat-nn` | `add_nn_switch_device` | picker APARAT_NN/MCB/WKLADKA; capability-driven nastawy |
| rozbudowa `pole-nn` | `add_nn_outgoing_field` po promocji topologicznej | picker katalogu przestaje być zakazany (backend go honoruje) |
| rozbudowa `stacja` / `StationTemplateWizard` „Strona nN" | istniejące + nowe ops | spójność obu wejść (audyt A2 §6) |

## 4. SLD nN (§37–38) — seam z audytu A8 §9 (3 kroki, niezależnie wdrażalne)

1. `enmToSldAdapter.ts` — struktura per-szyna/per-odpływ zamiast skalara `aggregatedLvLoad`
   (wzorzec: `DerSnChain`).
2. `v3/compose/station.ts` — symbol+segment+`ownerRef` per realny element nN (wzorzec: DER
   `station.ts:1501-1618`); tor mocy nigdy nie znika pod LOD.
3. `v3/symbols/defs.ts`+`glyphs.tsx` — nowe symbole: rozdzielnica nN, wyłącznik nN/MCB,
   rozłącznik bezpiecznikowy nN, RCD (P1), licznik nN.
Warstwy wynikowe (§38): U/ΔU/I/loading/Ik max/Ik min/SWZ/selektywność/reverse/straty/naruszenia
— przez ISTNIEJĄCY `SldV3Overlay` (zero zmian kontraktu; klucz `ownerRef` pojawia się wraz z
symbolami z kroków 1–2). Klik wyniku → provenance (2 kliki do White Box — gramatyka §2).

## 5. Nowe byty UI (net-new, świadomie)

| Byt | Zakres | Uzasadnienie |
|---|---|---|
| Edytowalna tabela odcinków | edycja inline komórek (długość, kabel, ułożenie) → operacje domenowe batch; wirtualizacja | brak w repo (audyt A9 §4); pojedyncza implementacja w `ui2/shared`, projekt zgodny z PROGRAM_UIUX §5 („tabela danych sort/filtr/wirtualizacja") |
| Wykres koordynacji doboru (§42) | oś prądu: Ib, In, I2, Iz′, Ik_min, Ik_max + zakres aparatu | prosty wykres Recharts |
| Heatmapa problematycznych obwodów (§46) | lista obwodów sortowana od najgorszego (U/ΔU/loading/SWZ/select./thermal) | `TabelaWynikow` + status |

## 6. Następna najlepsza akcja + rekomendacje (§48, §65)

Werdykt FAIL niesie akcje naprawcze (fixAction) z istniejącego mechanizmu walidacji/readiness:
np. „K-17 SWZ niespełnione (Ik_min=188 A < Ia=240 A): 1) zmień zabezpieczenie, 2) zwiększ
przekrój" + CTA „PORÓWNAJ WARIANTY" → ekran doboru. Zakaz automatycznej naprawy bez
zatwierdzenia. Silnik rekomendacji = warstwa analizy (reuse `analysis/recommendations`).

## 7. Zakazy i bramki

- Zakaz fizyki w UI (`ui_no_physics_guard` obejmuje ui2) — wszystkie liczby z backendu.
- Zakaz kontrolek-fantomów: każda kontrolka mapuje na pole/operację backendu (§3 dyrektyw).
- Polskie etykiety, zero codenames; `forbidden_ui_terms_guard` rozszerzony o ui2 (N-D9).
- Zero dead-clicków; komplet 5 stanów okna; werdykt wizualny SLD nN = bramka B-02 właściciela.
- `station-wizard-v2` usunięty (N-D3) zanim powstanie nowe wejście nN.
