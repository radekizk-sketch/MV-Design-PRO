# KARTA ZADANIA P35 — KREATOR STUDIUM PRZYŁĄCZENIA (v1: przepływ analiz)

**Faza:** U4 · **Epik:** E11/E13 · **Wykonawca:** Opus · **Zależności twarde:** D3/D3a/
D4/D5 + P2/P19/P30/P41 scalone (końcówki i okna istnieją). **Wiążące:**
`PROPOZYCJE_ROZSZERZEN` P35, `SPEC_KREATORY_2026-07.md` (kreatory: maksymalna
szczegółowość, zero pustych pól, podpowiedź inżynierska przy każdym polu, gotowy
przykład), `MODEL_INTERAKCJI` §2.7, CLAUDE.md (zero fizyki; orkiestracja wyłącznie
istniejących końcówek).

## 1. Cel (v1 — bez generacji dokumentu; dokument = styk E13, TODO-KARTA)
Kreator prowadzący developera OZE przez studium przyłączenia źródła:
- **Krok 1 — Warianty punktu przyłączenia**: multi-wybór węzłów ze snapshotu
  (wzorzec P2/P30) + podpowiedź inżynierska (wg SPEC_KREATORY: każde pole z hintem PL).
- **Krok 2 — Parametry źródła**: rodzaj (PV/BESS/FW), typ z katalogu konwerterów
  (wybór rekordu; moc z rekordu; pola wstępnie wypełnione pierwszym sensownym
  rekordem — zero pustych pól), operator OSD (katalog NC RfG).
- **Krok 3 — Analizy** (jawny przycisk „Przeprowadź analizy studium"): dla każdego
  wariantu SEKWENCYJNIE woła ISTNIEJĄCE końcówki: hosting-capacity (D3a),
  pq-area (D5, parametry domyślne), pq-coverage (D4, wybrany typ+operator); postęp
  per wariant/analiza (stany: oczekuje/w toku/gotowe/błąd — uczciwe, bez przerywania
  całości przy błędzie jednego wariantu). Wymaga zakończonego przebiegu rozpływu
  (LOAD_FLOW/DONE — jak P2); brak → instrukcja.
- **Krok 4 — Przegląd zbiorczy**: tabela wariantów (na wzorcu `TabelaWynikow`):
  moc przyłączalna [MW] (D3a), przyrost strat [kW], klasa NC RfG (słownik katalogowy —
  reużycie z P19 `rankingModel`), pokrycie P–Q (werdykt D4), status obszaru (D5:
  pasmo w punkcie mocy źródła — z danych, bez oceny własnej); wybór wiersza →
  szczegóły wariantu (reużycie komponentów okien P2/P30/P41 importem).
  Przycisk „Otwórz w rankingu" — TODO-KARTA nawigacji między zakładkami (odnotuj).

## 2. Pliki (TYLKO `frontend/src/ui2/oze/studium/**` + ewent. rozszerzenie `ui2/oze/api.ts` + re-eksport `ui2/oze/index.ts`)
`KreatorStudium.tsx` (kroki z paskiem postępu kreatora — wzorzec wizualny prosty,
roving tabindex), `studiumModel.ts` (czysta orkiestracja zapytań: kolejka sekwencyjna,
agregacja wyników per wariant; typy reużyte z api.ts), `strings.ts` (hinty inżynierskie
PL przy KAŻDYM polu — wg SPEC_KREATORY), `studium.css`, `index.ts`, `__tests__/`
(≥ 20 testów; fixtures 1:1 reużyte/rozszerzone; vi.mock API; test sekwencji: kolejność
wywołań deterministyczna, błąd jednego wariantu nie przerywa pozostałych).

## 3. Kryteria
(1) 4 kroki z hintami PL i wstępnym wypełnieniem (zero pustych pól), (2) sekwencja
analiz z uczciwym postępem i odpornością na błąd wariantu, (3) przegląd zbiorczy
z danymi wyłącznie z odpowiedzi końcówek, (4) szczegóły wariantu przez reużycie,
(5) pełne bramki jak E1.1 §8 (pipefail; pełny vitest ZERO failed; guardy). Commit
`feat(ui2/oze): kreator studium przyłączenia — przepływ analiz (P35)` BEZ push.
Raport standardowy. TODO-KARTA: dokument studium (E13), nawigacja między zakładkami.
