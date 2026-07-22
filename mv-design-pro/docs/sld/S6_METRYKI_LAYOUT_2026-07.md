# SCHEMAT-10 S6 — metryki layoutu + kontrakt świateł + plan silnika kanonicznego (V12K-137)

Status: WIĄŻĄCY dla S6/S7. Realizuje `WARUNKI_ODBIORU_S6_2026-07.md` w części
MIERZALNEJ (fundament pomiarowy) i wyznacza plan części ALGORYTMICZNEJ
(silnik kanoniczny). Fixtura referencyjna: `sldSubstrate52s` (53 stacje SN + GPZ).

## 1. Co dostarcza S6 (ta karta)

1. **Komplet 18 metryk z REALNEJ geometrii** (`layoutMetricsReport` w
   `ui/sld/v3/scene/buildScene.ts`) — §3/§6 warunków odbioru. Miary czyste i
   deterministyczne (P7). Narzędzie pomiaru: `scripts/s6_measure.mjs`.
2. **Bramki nie-regresyjne funkcji kosztu** w `scripts/sld_v3_acceptance.mjs`:
   `layout_cost_probe` (poziomy, załamania — nie-rosnące), `sheet_fill_probe`
   (wykorzystanie arkusza — nie-spadające poniżej podłogi). Uzupełniają
   istniejący `vertical_length_probe`.
3. **Testy** `scene/__tests__/s6Metrics.test.ts`: poprawność metryk +
   §11(c) idempotencja + §3 czystość bazy (0 kolizji/przecięć/nie-ortogonalnych/
   niejednoznacznych).
4. **Kontrakt świateł** (niżej, §3) — pomiar obecnej stałej z repo.

Geometria sceny w S6 **NIE zmienia się** (bajt-identyczna z gałęzią) — patrz §4
(dlaczego izolowane podniesienie światła regresowałoby §6). Żaden golden nie
zmieniony.

## 2. Tabela 18 metryk — baza (przed) = stan S6 (po)

Zmierzone `scripts/s6_measure.mjs` na gałęzi `claude/power-network-design-ui-ir91mv`
(COLUMN_GAP = 24 px). Ponieważ S6 nie zmienia geometrii, kolumny „przed" i „po"
są identyczne — to UCZCIWY pomiar: S6 dostarcza APARAT pomiarowy, nie zmianę
geometrii (ta należy do S7, §5).

| Metryka | L0 | L1 | L2 |
|---|---|---|---|
| verticalLength | 50264 | 67208 | 67208 |
| horizontalLength | 47048 | 67192 | 70784 |
| totalOrthogonalLength | 97312 | 134400 | 137992 |
| bendCount | 39 | 167 | 167 |
| contentBBox (w×h) | 14208×8043 | 14208×8121 | 14208×8121 |
| widthUtilization | 0.0918 | 0.4291 | 0.4426 |
| heightUtilization | 0.0835 | 0.2608 | 0.2608 |
| bboxUtilization | 0.000172 | 0.002322 | 0.002322 |
| inkDensity | 0.006913 | 0.011475 | 0.011723 |
| minimumClearance | 8 | 8 | 8 |
| labelCollisionCount | 0 | 0 | 0 |
| subtreeIntersectionCount | 0 | 0 | 0 |
| nonOrthogonalSegmentCount | 0 | 0 | 0 |
| ambiguousConnectionCount | 0 | 0 | 0 |
| crossingCount | 13 | 24 | 24 |
| symbolCount | 68 | 568 | 568 |

Wniosek diagnostyczny (potwierdza recenzję „wykorzystanie przestrzeni 6/10"):
`bboxUtilization`/`inkDensity` rzędu 0,2–1,2% — arkusz jest w >98% pusty.
Dominującym kosztem są PIONY zejść (grzebień sekwencyjny: każdy lateral ląduje
POD całą dotychczasową treścią, więc jego pion jest proporcjonalny do
skumulowanej pozycji, nie do własnego footprintu). `crossingCount` 13/24 to
skrzyżowania kanałów zejść z przęsłami magistrali — nieodłączne dla
sekwencyjnego grzebienia ortogonalnego; sprowadzenie ich do 0 (warunek §"WARUNKI
ODBIORU") wymaga silnika footprint-driven (S7).

## 3. Kontrakt świateł (§5 warunków odbioru)

Obecny stan repo (pomiar):

| Stała | Plik | Wartość przed | Rola |
|---|---|---|---|
| `COLUMN_GAP` | `ui/sld/v3/layout/segments.ts` | `3×GRID` = 24 px | JEDYNE światło poziome między kolumnami stacji (pas górny i laterale) |

Docelowy rozdział (S7, `layoutEngine.ts`) — §5 wymaga co najmniej:
`MIN_GLYPH_CLEARANCE`, `MIN_LABEL_CLEARANCE`, `MIN_FIELD_CLEARANCE`,
`MIN_SUBTREE_CLEARANCE`, `MIN_ROUTE_CLEARANCE`, `TOP_LEVEL_FIELD_CLEARANCE`.
Światło liczone między RZECZYWISTYMI obrysami (footprint), nie kotwicami.
`TOP_LEVEL_FIELD_CLEARANCE` = NAJMNIEJSZA wartość z widełek +20–35% (24→29..32 px),
którą wolno wprowadzić DOPIERO gdy footprint-driven compact layout obniży bbox
na tyle, że wzrost światła da wynik netto-dodatni w §6 (`bboxUtilization↑` przy
`verticalLength↓`).

## 4. Dlaczego S6 nie podnosi światła w izolacji

Fixtura ma JUŻ 0 kolizji pasa górnego przy 24 px (`accept:sld-v3` zielone).
Podniesienie `COLUMN_GAP` 24→32 px w izolacji (zmierzone): `horizontalLength`
+336/LOD, `contentBBox` szerokość 14208→14320, `verticalLength` bez zmian,
`inkDensity` 0.006913→0.006882 (L0). To jednoczesne `bboxUtilization↓` i
`verticalLength=` — REGRESJA warunku §6 („akceptacja JEDNOCZEŚNIE
bboxUtilization↑ AND verticalLength↓") oraz „niepotrzebne wydłużenie magistrali"
z §5. Dlatego cofnięte; światło rośnie dopiero SPRZĘŻONE z kompaktyzacją (S7).

## 5. Plan silnika kanonicznego (S7 — część algorytmiczna warunków odbioru)

Warunki §7/§8 wymagają JEDNEJ kanonicznej geometrii liczonej RAZ w
`engine/sld-layout/layoutEngine.ts` → `LayoutResult` → sceny L0/L1/L2, przy
`buildScene.ts` = WYŁĄCZNIE render. Stan faktyczny: cała geometria v3 (≈4900
linii intrykatnego grzebienia z routingiem kanałów zejść i dziesiątkami
wyroczni-niezmienników) żyje dziś w `buildScene.ts`; `layoutEngine.ts` to
odrębny silnik v2 nieużywany przez v3. Migracja to przebudowa
wielotysiąclinijkowa — NIE do wykonania w jednej synchronicznej sesji bez
złamania niezmienników (kolejność aparatów, ciągłość toru, JEDNA KOTWICA,
zero kolizji), których złamanie = karta odrzucona. Zapis długu wg Zero-Debt pkt 4.

Etapy (każdy z pełną regresją wyroczni + pomiarem 18 metryk przed/po):

- **S7.1 — Footprint.** `subtreeFootprint(node)` = realny bbox (symbole + pola +
  trasy + BUDŻET etykiet po pomiarze fontu, §10 + marginesy + `*_CLEARANCE` +
  rezerwa routingu). Test: różne footprinty razem (§11f).
- **S7.2 — Compact orthogonal comb.** Szerokość/wysokość kolumny i pionu z
  footprintu poddrzewa (nie ze slotu/liczby stacji); piony proporcjonalne (§2);
  M-02 potwierdzane po layoucie. Test: proporcjonalne piony (§11g), lokalność
  (§11a).
- **S7.3 — Global balancing.** Przesuwanie WYŁĄCZNIE całych poddrzew; środek
  ciężkości ważony powierzchnią footprintu; porządek głębokość→rodzic→odpływ→
  stabilny id; limit iteracji, brak oscylacji (§11d); M-02 po balancingu.
- **S7.4 — Pełna funkcja kosztu** (10 składników, §3) jako miara sterująca +
  raport; FAIL-e twarde.
- **S7.5 — Migracja `LayoutResult`→`buildScene` render-only** (§7/§8); usunięcie
  lokalnych `x+=`/skracania pionów; JEDNA KOTWICA jako architektura.
- **S7.6 — Światła rozdzielone + `TOP_LEVEL_FIELD_CLEARANCE`** podniesione
  netto-dodatnio (§5/§6).
- **Goldeny:** wymiana per-plik z nazwą/przyczyną/metryką/potwierdzeniem
  topologii (§12).

Kryterium wyjścia S7 = pełna lista „WARUNKI ODBIORU" spełniona JEDNOCZEŚNIE.

## 6. Lista „WARUNKI ODBIORU" — status po S6

| Warunek | Status po S6 |
|---|---|
| `accept:sld-v3` ALL PASS | ✅ (z nowymi bramkami cost/fill) |
| `lod_path_probe` L0/L1/L2 PASS | ✅ |
| JEDNA KOTWICA PASS | ✅ (geometria bez zmian) |
| wyrocznie S2 PASS | ✅ |
| labelCollisionCount=0 | ✅ (zmierzone, w teście) |
| subtreeIntersectionCount=0 | ✅ |
| nonOrthogonalSegmentCount=0 | ✅ |
| ambiguousConnectionCount=0 | ✅ |
| crossingCount=0 | ❌ baza 13/24 (grzebień sekwencyjny) → S7 |
| 2× deterministycznie identyczny wynik | ✅ (idempotencja w teście) |
| koszt geometrii po < przed | ⏳ S7 (S6 = pomiar + bramka nie-rosnąca) |
| Σ pionów po < przed | ⏳ S7 (S6 = pomiar + bramka nie-rosnąca) |
| wykorzystanie arkusza po > przed | ⏳ S7 (S6 = pomiar + bramka podłogi) |
| minimalne światło ≥ kontraktowe | ✅ (=8 px = GRID; rozdział świateł S7) |
| kolejność aparatów identyczna | ✅ (geometria bez zmian) |
| ciągłość toru identyczna | ✅ |
| zero zmian fizyki | ✅ |
| 100% terminologii polskiej | ✅ |

S6 domyka warunki MIERZALNE i „czystości bazy"; warunki wymagające REDUKCJI
(koszt/piony/wykorzystanie, crossings=0) realizuje S7 (silnik footprint-driven),
bo bezpieczna ich realizacja wymaga przebudowy geometrii przenoszonej do
`layoutEngine.ts` — poza zakresem jednej sesji, zapis długu wg Zero-Debt pkt 4.
