# KARTA ZADANIA E7.2 — PRZEBIEGI OBLICZEŃ (W-503)

**Faza:** U2 · **Epik:** E7 · **Wykonawca:** Sonnet · **Wiążące:** `AUDYT_RADY_SPECJALISTOW`
(W-503: kolejka z postępem, historia z czasem trwania, każdy przebieg z parametrami wejściowymi —
pełna odtwarzalność WB), `SPEC_POWIAZANIA_WARSTW` §3, `MODEL_INTERAKCJI` §2/§2.7.

## 1. Cel
Nowe okno przestrzeni „Obliczenia": historia i stan przebiegów aktywnego przypadku obliczeniowego —
tabela (analiza PL, status PL tagiem, początek, czas trwania, rewizja modelu), szczegóły przebiegu
(parametry wejściowe = odtwarzalność), akcja „Pokaż wyniki" (przejście do przestrzeni Wyniki
z aktywacją przebiegu), reakcja na żywo (`wyniki-gotowe` z magistrali odświeża listę). Zastąpi
most `MostHistoriiPrzebiegow` (podmiana = scalenie zarządcy; wygaszenie ostatniego mostu obliczeń).

## 2. Pliki (TYLKO `frontend/src/ui2/spaces/obliczenia/przebiegi/**`)
`PrzebiegiPanel.tsx`, `WierszPrzebiegu.tsx`, `SzczegolyPrzebiegu.tsx` (parametry wejściowe
z rekordu przebiegu — zbadaj `ExecutionRun` w `ui/study-cases/types.ts` i store `runStore.ts`;
pola nieobecne → „wkrótce"), `adapters/przebiegiAdapter.ts` (read-only runStore + subskrypcja
`wyniki-gotowe`/`wyniki-niewazne` z `ui2/events`; czas trwania z pól started/finished przez
czyste formatowanie — zero Date.now), `strings.ts`, `index.ts`, `__tests__/` (≥ 18 testów,
w tym reakcja na żywo i przejście do wyników przez callback `onPokazWyniki(runId)`).
**ZAKAZ** modyfikacji innych plików; etykiety statusów PL z istniejących `RUN_STATUS_LABELS`
(`types.ts` — importuj, nie duplikuj); słownik V12K-026; identyfikator przebiegu tylko
w „szczegółach technicznych" (tryb ekspercki).

## 3. Kryteria
(1) tabela + szczegóły z realnych typów (fixture 1:1), (2) `wyniki-gotowe` odświeża bez remount
(test), (3) „Pokaż wyniki" → callback z runId, (4) pełne bramki jak E1.1 §8 (pipefail).
Commit `feat(ui2/obliczenia): przebiegi obliczeń W-503 (E7.2)` BEZ push. Raport standardowy.
