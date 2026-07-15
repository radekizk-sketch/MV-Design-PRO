# KARTA ZADANIA E6.1 — PANEL GOTOWOŚCI (W-401/W-402)

**Faza:** U2 · **Epik:** E6 · **Wykonawca:** Sonnet · **Wiążące:** `AUDYT_RADY_SPECJALISTOW`
(W-401: grupowanie braków wg celu, postęp per cel; W-402: filtry, akcje zbiorcze),
`SPEC_POWIAZANIA_WARSTW` §3–§5, `MODEL_INTERAKCJI` §2 + §2.7 (kody = szczegół techniczny).

## 1. Cel
Nowe okno przestrzeni „Gotowość": braki pogrupowane WG CELU inżyniera („do zwarć brakuje…",
„do rozpływu…", „do wniosku OSD…") z postępem per cel, lista problemów z filtrami
(waga/gałąź/typ) i fix-action per wiersz (callback nawigacyjny — otwarcie właściwego
edytora = istniejący mechanizm fix_actions). Zastępuje mostek EngineeringReadinessPanel
w przestrzeni „gotowość" (aktualizacja legacyRegistry w karcie integracyjnej zarządcy).

## 2. Pliki (TYLKO `frontend/src/ui2/spaces/gotowosc/**`)
`PanelGotowosci.tsx` (nagłówek z podsumowaniem + sekcje celów + lista problemów),
`SekcjaCelu.tsx` (postęp %, liczby blokad/ostrzeżeń, zwijana), `WierszProblemu.tsx`
(waga PL, element, opis PL, przycisk akcji naprawczej; kod gotowości TYLKO w dymku/trybie
eksperckim), `grupowanieCelow.ts` (czysta funkcja: `ReadinessIssue[]` → grupy celów; mapowanie
prefiksów kodów na cele — zbadaj realne kody w `ui/types.ts` i `ui/engineering-readiness/**`;
kody bez mapowania → grupa „Pozostałe" z TODO-KARTA), `filtry.ts`, `adapters/gotowoscAdapter.ts`
(read-only: `useSnapshotStore.readiness` — wzorzec E15.1 — oraz `readinessLiveStore` tylko jeśli
konieczny, z uzasadnieniem), `strings.ts`, `index.ts`, `__tests__/` (≥ 20 testów).

## 3. Zasady
Deklaracja powiązań: subskrybuje `gotowosc-zmieniona` + `model-zmieniony` (magistrala
`ui2/events`); emituje `selekcja` (klik wiersza → element, zrodlo 'panel-gotowosci');
fix-action → callback `onAkcjaNaprawcza(issue)` (wykonanie = karta integracyjna). Stany:
brak projektu / wszystko gotowe (pozytywny stan z zielonym podsumowaniem) / lista.
Etykiety PL: „Blokady", „Ostrzeżenia", „Gotowe do analiz", „Napraw…", „Pozostałe";
wagi: „BLOKADA"/„OSTRZEŻENIE". Zero snake_case w pierwszym planie (guard E1.6);
FreshnessBadge NIE dotyczy (to nie dana pochodna). Tokeny --mvd-*.

## 4. Kryteria
1. `grupowanieCelow.test.ts`: mapowanie realnych kodów na cele + „Pozostałe"; postęp % poprawny.
2. `panelGotowosci.test.tsx` (≥ 12): sekcje, filtry, klik→selekcja przez magistralę (asercja
   zdarzenia), akcja naprawcza→callback, stany, kod tylko w dymku, tryb ekspercki.
3. Reakcja na żywo: emisja `gotowosc-zmieniona` → licznik się zmienia bez remount (test).
4. Pełne bramki jak E1.1 §8 (pipefail). Commit `feat(ui2/gotowosc): panel gotowości wg celów (E6.1)`
   BEZ push. Raport standardowy + mapowania (plik:linia).
