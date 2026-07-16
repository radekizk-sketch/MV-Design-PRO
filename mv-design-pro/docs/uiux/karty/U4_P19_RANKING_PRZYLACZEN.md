# KARTA ZADANIA P19 — RANKING PUNKTÓW PRZYŁĄCZENIA (developer OZE)

**Faza:** U4 · **Epik:** E11 · **Wykonawca:** Opus · **Zależność twarda:** D3a scalona
(straty w odpowiedzi hosting-capacity). **Wiążące:** `PROPOZYCJE_ROZSZERZEN` P19,
`MODEL_INTERAKCJI` §2.7, CLAUDE.md (zero ocen lokalnych poza arytmetyką prezentacji
z komentarzem; PL-only).

## 1. Cel
Okno „Ranking punktów przyłączenia": jeden bieg hosting-capacity dla WIELU kandydatów
(istniejąca końcówka D3/D3a) → SORTOWALNA tabela porównawcza na wzorcu
`EkranAnalizy`/`TabelaWynikow`: węzeł, maks. moc przyłączalna [MW] (domyślny sort,
malejąco), kryterium wiążące PL, przyrost strat przy mocy granicznej [kW]
(losses_at_limit − baseline; arytmetyka prezentacji z komentarzem), skrajne napięcia
przy granicy [p.u.], klasa modułu NC RfG dla mocy granicznej (WYŁĄCZNIE jeżeli
klasyfikacja jest osiągalna bez zgadywania: ZBADAJ czy katalog NC RfG
(`GET /api/ncrfg-tests/catalog` — module_types z progami mocy) niesie progi klas;
jeżeli tak — wyznacz klasę słownikowo z progów katalogu OPERATORA wybranego w oknie
i skomentuj jako mapowanie katalogowe; jeżeli nie — kolumnę POMIŃ z TODO-KARTA).
KOSZT PRZYŁĄCZA: brak silnika kosztów w systemie — kolumny NIE dodawać; TODO-KARTA
(strumień kosztorysanta). Wiersz wybrany → szczegół (ślad scenariuszy węzła jak w P2 —
REUŻYJ komponentów z `ui2/oze/zdolnosc` importem, nie kopią).

## 2. Pliki (TYLKO `frontend/src/ui2/oze/ranking/**` + re-eksport w `ui2/oze/index.ts`)
`EkranRankingu.tsx`, `rankingModel.ts` (czyste adaptery; sortKey), `strings.ts`,
`ranking.css` (tokeny --mvd-*), `index.ts`, `__tests__/` (≥ 16 testów; fixtures 1:1
z odpowiedzią D3a; vi.mock API). Klient: REUŻYJ `ui2/oze/api.ts` (rozszerz typy o pola
D3a jeżeli wykonawca D3a ich nie dopisał — sprawdź).

## 3. Kryteria
(1) multi-wybór kandydatów + jawny bieg (wzorzec P2), (2) tabela sortowalna z domyślnym
rankingiem po mocy, (3) delta strat i napięcia skrajne z danych (zero fizyki), (4) klasa
NC RfG wyłącznie ze słownika katalogowego albo pominięta, (5) szczegół węzła ze śladem
scenariuszy (reużycie z P2), (6) pełne bramki jak E1.1 §8 (pipefail; pełny vitest ZERO
failed; guardy). Commit `feat(ui2/oze): ranking punktów przyłączenia (P19)` BEZ push.
Raport standardowy.
