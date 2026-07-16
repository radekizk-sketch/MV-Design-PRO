# KARTA ZADANIA P38 — OKNO „WALIDACJA MODELU FALOWNIKA" (trajektorie FRT vs obwiednia)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Zależność twarda:** D6 scalona
(końcówka frt-trajectories). **Wiążące:** `PROPOZYCJE_ROZSZERZEN` P38,
`MODEL_INTERAKCJI` §2.7, `dataviz`, CLAUDE.md (zero ocen lokalnych, PL-only).

## 1. Cel
Okno „Walidacja modelu falownika": wybór modułu DER (`useStationDerStore` — wzorzec
pulpit OZE), operatora OSD (katalog NC RfG) i rodzaju testu (LVRT/HVRT) → jawny bieg
`GET /api/oze-analysis/frt-trajectories?der_ref=&operator_id=&test_kind=` (D6) →
prezentacja:
1. **Wykres trajektorii** (Recharts, tokeny, zero animacji): napięcie U(t) [p.u.]
   na tle OBWIEDNI profilu operatora (linia schodkowa/łamana z punktów krzywej);
   druga seria: P(t) i Iq(t) przełączalne; legenda PL.
2. **Tabela scenariuszy** (wzorzec `TabelaWynikow`): scenariusz, głębokość zapadu
   [p.u.], czas trwania [s], utrzymanie pracy (tak/nie → tag), margines do krzywej
   [s]/[p.u.], czas odzysku P [s], werdykt PL — wszystko z odpowiedzi.
3. **Werdykt całości** („model odzwierciedla wymagania profilu" / „poza obwiednią" /
   „moduł wypadł") — z werdyktów per scenariusz odpowiedzi (agregacja słownikowa:
   najgorszy status; skomentuj jako agregację prezentacyjną).

## 2. Pliki (TYLKO `frontend/src/ui2/oze/frt/**` + rozszerzenie `ui2/oze/api.ts` + re-eksport `ui2/oze/index.ts`)
`EkranFrt.tsx`, `WykresTrajektoriiChart.tsx`, `frtModel.ts`, `strings.ts`, `frt.css`,
`index.ts`, `__tests__/` (≥ 16 testów; fixtures 1:1 z odpowiedzią D6 — ZBADAJ
`application/analyses/frt_trajektorie.py`; vi.mock; normalizacja `recharts\d+`).

## 3. Kryteria
(1) wybór modułu/operatora/rodzaju + jawny bieg + stany uczciwe (brak modułów,
błąd końcówki PL), (2) wykres U(t) na tle obwiedni + serie przełączalne, (3) tabela
scenariuszy z tagami i marginesami, (4) werdykt całości agregacją słownikową
z komentarzem, (5) pełne bramki jak E1.1 §8. Commit
`feat(ui2/oze): okno walidacji modelu falownika — trajektorie FRT (P38)` BEZ push.
Raport standardowy.
