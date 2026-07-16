# KARTA ZADANIA P30 — OKNO „OBSZAR BEZPIECZNEJ PRACY P–Q" WĘZŁA

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Zależność twarda:** D5 scalona
(końcówka pq-area). **Wiążące:** `PROPOZYCJE_ROZSZERZEN` P30, `MODEL_INTERAKCJI` §2.7,
`dataviz`, CLAUDE.md (zero ocen lokalnych, PL-only).

## 1. Cel
Okno „Obszar pracy P–Q węzła": wybór węzła (jak w oknie zdolności — snapshot) +
przebiegu rozpływu (LOAD_FLOW/DONE) + parametrów siatki → jawny bieg
`GET /api/oze-analysis/pq-area?...` (D5) → prezentacja:
1. **Wykres obszaru** (Recharts): pas dopuszczalny Q_min_dop/Q_max_dop vs P (dwie linie
   lub obszar); DODATKOWO nakładka krzywej producenta falownika (opcjonalny wybór typu
   z katalogu — REUŻYJ klienta/typów `pq_curve` z `ui2/oze/api.ts`), aby inżynier widział
   na JEDNYM wykresie zdolność sieci vs zdolność urządzenia; legenda PL.
2. **Tabela wierzchołków**: P [MW], Q dopuszczalne min/max [Mvar], granice wiążące PL
   (element + rodzaj) — na wzorcu `TabelaWynikow`, tagi przy punktach zdegenerowanych
   (Q_min_dop = Q_max_dop = 0).
3. **Parametry siatki** w ZAŁOŻENIACH (domyślne z odpowiedzi) + hash w trybie eksperckim
   + zredukowany ślad WHITE BOX rozwijany (reużycie `SladAnalizy` adapterem jak w P41).

## 2. Pliki (TYLKO `frontend/src/ui2/oze/obszar/**` + rozszerzenie `ui2/oze/api.ts` + re-eksport `ui2/oze/index.ts`)
`EkranObszaruPQ.tsx`, `WykresObszaruChart.tsx`, `obszarModel.ts`, `strings.ts`,
`obszar.css`, `index.ts`, `__tests__/` (≥ 16 testów; fixtures 1:1 z odpowiedzią D5 —
ZBADAJ `application/analyses/pq_area.py`; vi.mock).

## 3. Kryteria
(1) wybór węzła/przebiegu/parametrów + jawny bieg + stany uczciwe, (2) wykres obszaru
z opcjonalną nakładką krzywej producenta (dane wyłącznie z odpowiedzi/katalogu),
(3) tabela wierzchołków z granicami PL i tagami, (4) założenia + ślad, (5) pełne bramki
jak E1.1 §8. Commit `feat(ui2/oze): okno obszaru bezpiecznej pracy P–Q węzła (P30)`
BEZ push. Raport standardowy.
