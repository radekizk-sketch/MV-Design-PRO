# KARTA ZADANIA E15.2 — KONTRAKT ŚWIEŻOŚCI WYNIKÓW (hook współdzielony)

**Faza:** U1 · **Epik:** E15 · **Wykonawca:** Sonnet · **Wiążące:** `SPEC_POWIAZANIA_WARSTW_2026-07.md` §3.

## 1. Cel
Jeden współdzielony hook świeżości: każda dana pochodna porównywana z rewizją modelu,
reagujący NA ŻYWO na zdarzenia magistrali (`model-zmieniony`, `wyniki-niewazne`,
`wyniki-gotowe`) — fundament dla chipa „Wyniki" w pasku przypadku, kafli pulpitu i okien wyników.

## 2. Pliki (TYLKO `frontend/src/ui2/freshness/**`)
`freshnessModel.ts` (typ `StanSwiezosci = 'brak'|'aktualne'|'nieaktualne'` + `OpisSwiezosci`
{stan, rewizjaDanej?, rewizjaModelu, przyczyna?}), `useSwiezoscWynikow.ts` (hook: stan początkowy
ze store'ów — `useSnapshotStore` rev + `useAppStateStore.activeCaseResultStatus`
(`ui/app-state/store.ts`); aktualizacje przez `subskrybuj` z `ui2/events`; bez zapisu do store'ów),
`opisSwiezosci.ts` (czysta funkcja → etykieta PL: „aktualne", „nieaktualne (model rew. {a} → {b})",
„brak wyników"), `index.ts`, `__tests__/` (hook: reakcje na 3 typy zdarzeń, unmount bez wycieku,
determinizm; opis: wszystkie stany; ≥ 12 testów).
**ZAKAZ:** modyfikacji pozostałych `ui2/**`, `ui/**` (odczyt ok), backendu. Zero API. Zero Date.now.

## 3. Kryteria
1. Hook zwraca `OpisSwiezosci`; po `model-zmieniony(rev+1)` stan → „nieaktualne" z parą rewizji;
   po `wyniki-gotowe` → „aktualne" z rewizją; brak wyników → „brak".
2. Etykiety PL dokładnie jak w §2 (zgodne z `znacznikNieaktualne` z `ui2/inspector/strings.ts` —
   importuj, nie duplikuj formatu).
3. Pełne bramki jak E1.1 §8. Commit lokalny `feat(ui2/freshness): kontrakt świeżości wyników (E15.2)`,
   BEZ push. Raport standardowy (pliki, bramki z liczbami, samoocena, TODO-KARTA, hash).
