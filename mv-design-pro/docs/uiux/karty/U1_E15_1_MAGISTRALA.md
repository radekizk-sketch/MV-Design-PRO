# KARTA ZADANIA E15.1 — MAGISTRALA ZDARZEŃ POWŁOKI

**Faza:** U1 · **Epik:** E15 (fundament stanu) · **Kontrakt:** `SPEC_POWIAZANIA_WARSTW_2026-07.md` §5–§6
**Wykonawca sugerowany:** Sonnet · **Status:** GOTOWA DO DELEGACJI
**Rozłączność plików:** pełna względem E1.1 (E1.1 = `ui2/shell/**` + `ui2/theme/**`; ta karta = `ui2/events/**`).

---

## 1. Cel
Jedna, typowana magistrala zdarzeń powłoki — kręgosłup powiązania warstw: każda mutacja modelu
i każde zakończenie obliczeń emitowane raz, konsumowane przez wszystkie okna. Persona: wszystkie
(fundament). To NIE jest nowe źródło prawdy — magistrala wyłącznie tłumaczy zmiany istniejących
store'ów na zdarzenia.

## 2. Pliki
**Wejściowe (czytać, nie zmieniać):** `frontend/src/ui/app-state/**` (store globalny),
`frontend/src/ui/selection/**`, store snapshotu ENM (znajdź: `grep -rn "snapshotStore\|useEnmStore" frontend/src/ui --include="*.ts*" -l`),
store aktywnego przypadku (`ui/active-case-bar/**`, `ui/study-cases/**`), `SPEC_POWIAZANIA_WARSTW_2026-07.md`.
**Wyjściowe (nowe):** `frontend/src/ui2/events/types.ts` (typy zdarzeń), `bus.ts` (rdzeń,
czysty TS bez Reacta), `useBusEvent.ts` (hook React), `adapters/snapshotAdapter.ts`,
`adapters/caseAdapter.ts`, `adapters/selectionAdapter.ts`, `index.ts`,
`__tests__/bus.test.ts`, `__tests__/adapters.test.ts`, `__tests__/useBusEvent.test.tsx`.

## 3. Kontrakt danych (zdarzenia — dokładnie ten zbiór)
```ts
type ZdarzenieMagistrali =
  | { typ: 'model-zmieniony'; rev: number; zakres: string[] }        // id elementów objętych zmianą
  | { typ: 'wyniki-gotowe'; runId: string; przypadekId: string }
  | { typ: 'wyniki-niewazne'; przyczyna: 'model-zmieniony'; rev: number }
  | { typ: 'selekcja'; obiektId: string | null; zrodlo: string }      // zrodlo = id okna emitującego
  | { typ: 'przypadek-aktywny'; przypadekId: string }
  | { typ: 'gotowosc-zmieniona'; blokady: number; ostrzezenia: number };
```
API rdzenia: `emituj(z)`, `subskrybuj(typ, handler): () => void` (zwraca odsubskrybowanie),
`subskrybujWszystkie(handler)`. Adaptery: subskrybują ISTNIEJĄCE store'y (zustand subscribe)
i emitują zdarzenia przy zmianie; mapowanie pól udokumentowane w kodzie adaptera z odniesieniem
do pliku źródłowego store'u. ZERO wołań API. ZERO zapisu do store'ów z magistrali.

## 4. Stany / przypadki brzegowe
Brak projektu (adaptery nie emitują), wielokrotna subskrypcja tego samego handlera (idempotencja),
odsubskrybowanie w trakcie emisji (bezpieczne), zdarzenie emitowane podczas obsługi innego
(kolejkowanie FIFO — bez rekurencji), brak store'u w środowisku testowym (adapter no-op z ostrzeżeniem raz).

## 4a. Kontrakt interakcji
Nie dotyczy (moduł bez UI). Hook `useBusEvent` nie renderuje niczego.

## 5. Etykiety PL
Brak tekstów UI. Nazwy typów/zdarzeń polskie (jak w §3) — to identyfikatory kodu, nie stringi UI.

## 6. Granice
NIE dotykać: `ui/sld/**`, `ui/sld-editor/**`, `engine/sld-layout/**`, istniejących store'ów
(tylko odczyt/subscribe), backendu, `ui2/shell/**`, `ui2/theme/**` (własność E1.1 — kolizja
plików ZABRONIONA). Determinizm: wynik końcowy niezależny od kolejności subskrybentów; zakaz
`Date.now()`/losowości w rdzeniu; kolejność zdarzeń = kolejność emisji (FIFO).
Jeśli nie można jednoznacznie zidentyfikować store'u źródłowego dla któregoś zdarzenia —
NIE zgaduj: zaimplementuj adapter jako szkielet z `TODO-KARTA` i opisz w raporcie (pytanie do zarządcy).

## 7. Kryteria akceptacji (testowalne)
1. `bus.test.ts`: emisja→odbiór per typ; odsubskrybowanie; idempotencja; FIFO przy emisji
   zagnieżdżonej; determinizm (permutacja kolejności subskrypcji nie zmienia stanu końcowego —
   test z 3 subskrybentami zapisującymi do wspólnej listy per zdarzenie).
2. `adapters.test.ts`: zmiana w store (mock/realny) → dokładnie jedno zdarzenie z poprawnym
   payloadem; brak emisji bez zmiany; mapowanie rev/przypadku zgodne ze store'em.
3. `useBusEvent.test.tsx`: subskrypcja w mount, odsubskrybowanie w unmount, brak wycieku
   (emisja po unmount nie woła handlera).
4. Pokrycie: 100% gałęzi `bus.ts`.

## 8. Bramki (pełne, przed zwrotem)
`npm run type-check` · `npm run lint` · pełny `npx vitest run --no-file-parallelism` ·
`npm run guard:codenames` · `python scripts/utf8_mojibake_guard.py`. Praca w izolowanym
drzewie roboczym; commit lokalny `feat(ui2/events): magistrala zdarzeń powłoki (E15.1)`;
BEZ push — diff i raport wracają do zarządcy.

## 9. Recenzja rady specjalistów / powiązania
Audytor WHITE BOX: magistrala nie tworzy drugiego źródła prawdy (adaptery = czyste tłumaczenie);
analizy sieciowe: zdarzenie `wyniki-niewazne` niesie rev (kontrakt świeżości §3 SPEC_POWIAZANIA).
Deklaracja powiązań: emituje wszystkie typy §3; subskrybenci pojawią się w kartach okien.
