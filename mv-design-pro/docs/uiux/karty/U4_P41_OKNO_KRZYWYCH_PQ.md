# KARTA ZADANIA P41 — OKNO KRZYWYCH ZDOLNOŚCI P–Q FALOWNIKÓW

**Faza:** U4 · **Epik:** E4/E11 · **Wykonawca:** Opus · **Zależność twarda:** D4 scalona
(pole `pq_curve` + końcówka pq-coverage). **Wiążące:** `PROPOZYCJE_ROZSZERZEN` P41,
`MODEL_INTERAKCJI` §2.7, `dataviz` (wykres), CLAUDE.md (zero ocen lokalnych, PL-only).

## 1. Cel
Okno „Krzywe zdolności P–Q": wybór typu falownika z katalogu konwerterów
(`GET /api/catalog/converter-types` — tylko typy z krzywą; typy bez krzywej widoczne
na liście ze stanem „brak krzywej producenta") + operatora OSD (katalog NC RfG) →
`GET /api/oze-analysis/pq-coverage?catalog_item_id=&operator_id=` (D4) → prezentacja:
1. **Wykres P–Q** (Recharts, tokeny --mvd-*, zero animacji): pasmo producenta
   (q_min/q_max vs P — obszar/dwie linie z punktów krzywej) + nakładka wymagania
   operatora (prostokąt ±udział·Pn — linie referencyjne); legenda PL.
2. **Tabela punktów**: P [MW], pasmo producenta [Mvar], wymaganie [Mvar], margines
   [Mvar], status pokryty/niepokryty → tag (na wzorcu `TabelaWynikow`).
3. **Werdykt całości PL** + ślad WHITE BOX rozwijany (ASCII, wzór `SladAnalizy`
   z pulpitu — REUŻYJ importem).

## 2. Pliki (TYLKO `frontend/src/ui2/oze/krzywe/**` + rozszerzenie `ui2/oze/api.ts` + re-eksport `ui2/oze/index.ts`)
`EkranKrzywych.tsx`, `WykresPQChart.tsx`, `krzyweModel.ts` (czyste adaptery; typy 1:1
z odpowiedzią D4 — ZBADAJ `application/analyses/pq_coverage.py`), `strings.ts`,
`krzywe.css` (tokeny), `index.ts`, `__tests__/` (≥ 16 testów; fixtures 1:1; vi.mock).

## 3. Kryteria
(1) wybór typu+operatora i jawny bieg; stany błędów PL z końcówki (w tym „typ nie ma
krzywej producenta"), (2) wykres pasma producenta z nakładką wymagania, (3) tabela
punktów z marginesami i tagami, (4) werdykt + ślad (reużycie), (5) pełne bramki jak
E1.1 §8 (pipefail; pełny vitest ZERO failed; guardy). Commit
`feat(ui2/oze): okno krzywych zdolności P–Q falowników (P41)` BEZ push. Raport standardowy.
