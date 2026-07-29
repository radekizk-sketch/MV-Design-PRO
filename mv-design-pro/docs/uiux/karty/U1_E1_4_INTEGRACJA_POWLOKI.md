# KARTA ZADANIA E1.4 — INTEGRACJA POWŁOKI (shell + nav + inspector + events)

**Faza:** U1 · **Epik:** E1/E15 · **Wykonawca:** ZARZĄDCA (Fable) — karta scalająca moduły
trzech wykonawców; celowo nie delegowana (jedyne miejsce, gdzie zakresy się stykają).
**Status:** W REALIZACJI po zielonych bramkach łącznych E1.1+E1.2+E1.3+E15.1.

## 1. Cel
Spięcie czterech modułów `ui2/` w działającą powłokę: drzewa kontekstowe w lewym panelu,
inspektor w prawym, magistrala zdarzeń jako krwiobieg (selekcja globalna, świeżość rewizji,
pasek przypadku na żywo). Efekt dla inżyniera: klik w drzewie → inspektor natychmiast;
zmiana modelu → paski i znaczniki świeżości same się aktualizują.

## 2. Decyzje architektoniczne (rozstrzygnięcia TODO-KARTA wykonawców)
1. **`selekcja.zrodlo`** (E15.1): okna emitują `selekcja` bezpośrednio przy interakcji
   z prawdziwym identyfikatorem okna; `selectionAdapter` pozostaje pasywnym fallbackiem
   (`'selection-store'`). Drzewo emituje `zrodlo:'drzewo-kontekstowe'`.
2. **Tryby drzewa „administracyjny"/„obwodowy"** (E1.2): UKRYTE w U1 (zero martwego UI —
   inżynier nie może dostać pustego trybu). Odsłonięcie po dodaniu źródła danych
   (delta backendowa: `substation_ref`/obwód per węzeł w podsumowaniu topologii — karta E5.x).
3. **Hierarchia przebiegów** (E1.2): w U1 zakres = aktywny przypadek (stan store'a);
   agregacja wielu przypadków = karta E7.x (wymaga rozszerzenia store/API przebiegów).
4. **Przypięty obiekt po przeładowaniu** (E1.3): ponowne wypełnienie danych przypiętej strony
   z snapshotu po `pinnedId` — w adapterze inspektora (ta karta).
5. **Klient zdrowia backendu**: minimalny odczyt `/api/health` (istniejący endpoint) w
   `ui2/shell/backendHealth.ts`, zasilający pasek stanu; interwał tylko przy oknie aktywnym.

## 3. Zakres plików
`ui2/AppRoot.tsx` (kompozycja root: AppShell + panele + start adapterów), `ui2/shell/`
(wpięcia paneli — modyfikacja AppShell props→sloty), `ui2/adapters/inspectorAdapter.ts`
(snapshot+wyniki → `ObiektInspektora`), `ui2/adapters/README.md`, testy integracyjne
`ui2/__tests__/integracja.test.tsx` (scenariusz SPEC_POWIAZANIA §7 w wersji powłoki:
selekcja w drzewie → inspektor; zdarzenie `model-zmieniony` → pasek + FreshnessBadge).
`ui2` nadal poza produkcyjnym wejściem (przełączenie = E1.7).

## 4. Kryteria
1. Test integracyjny: klik w drzewie → `selekcja(zrodlo:'drzewo-kontekstowe')` → inspektor
   pokazuje obiekt; `model-zmieniony(rev+1)` → chip „Wyniki: nieaktualne" + FreshnessBadge
   w inspektorze z akcją „Przelicz" — bez przeładowania.
2. Tryby ukryte: selektor trybów drzewa pokazuje wyłącznie „Zasilania" w U1.
3. Pełne bramki jak E1.1 §8 przed commitem.
