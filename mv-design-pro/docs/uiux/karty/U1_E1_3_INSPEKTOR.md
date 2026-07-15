# KARTA ZADANIA E1.3 — INSPEKTOR KONTEKSTOWY (prawy panel; część W-110/W-602)

**Faza:** U1 · **Epik:** E1 · **Wykonawca:** Opus · **Status:** GOTOWA DO DELEGACJI
**Wiążące:** `SPEC_UKLAD_PANELI_2026-07.md` §1.3, `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` §2,
`SPEC_POWIAZANIA_WARSTW_2026-07.md` §3 (świeżość rewizji), `AUDYT_RADY_SPECJALISTOW_2026-07.md`
(W-602: zakładka Powiązania dwukierunkowa; założenia przy każdej liczbie).

## 1. Cel
Inspektor prawego panelu — serce codziennej pracy inżyniera: zawsze ten sam układ dla KAŻDEGO
obiektu i wyniku. Zakładki stałe: **Właściwości · Wyniki · Dowód · Powiązania**. Sekcje
akordeonowe („Zaawansowane" zwinięte, stan zapamiętywany per typ obiektu). **Pinezka**: przypnij
obiekt → podzielony inspektor (przypięty ↑ / bieżąca selekcja ↓) do porównywania. Każda dana
pochodna nosi rewizję modelu; rozjazd = znacznik „nieaktualne (rew. {a} → {b})" + akcja „Przelicz"
(callback). Każda wartość liczbowa: mono, jednostka, 2× klik → `onOtworzDowod(ref)`.

## 2. Pliki
**Wyjściowe (TYLKO te ścieżki):** `frontend/src/ui2/inspector/InspectorPanel.tsx` (orkiestracja
zakładek + pinezka + split), `InspectorTabs.tsx`, `PropertySection.tsx` (akordeon + kv-grid z
jednostkami), `ValueRow.tsx` (liczba mono + jednostka + pochodzenie + 2× klik), `FreshnessBadge.tsx`
(JEDYNY współdzielony komponent znacznika świeżości — kontrakt SPEC_POWIAZANIA §6.2),
`LinksTab.tsx` (Powiązania: wchodzące/wychodzące, listy nawigacyjne przez callback),
`inspectorModel.ts` (typy: ObiektInspektora, SekcjaWlasciwosci, WartoscZJednostka{wartosc,
jednostka, rewizja?, dowodRef?, pochodzenie?}), `pinStore.ts` (lokalny stan pinezki+akordeonów,
localStorage, NIE dane modelu), `strings.ts`, `index.ts`, `__tests__/` (5 plików testów).
**ZAKAZ:** `ui2/shell/**`, `ui2/theme/**`, `ui2/events/**`, `ui2/nav/**`, `ui/sld*`, `engine/`,
backend. Integracja z AppShell i magistralą = karta zarządcy. Komponent w pełni sterowany propsami.

## 3. Kontrakt danych
`InspectorPanel({ obiekt: ObiektInspektora | null, rewizjaModelu: number, onOtworzDowod,
onNawiguj(cel), onPrzelicz, trybZaawansowania })`. Zero wołań API, zero czytania store'ów —
dane wchodzą propsami (adaptery powstaną w karcie integracyjnej). To decyzja architektoniczna:
inspektor musi działać identycznie dla topologii, wyników, katalogu i raportów.

## 4. Stany + 4a. Interakcje
Stany: brak selekcji („Zaznacz obiekt…"), obiekt bez wyników (zakładka Wyniki: stan pusty
z wyjaśnieniem), wynik nieaktualny (FreshnessBadge + „Przelicz"), pełny. Interakcje: zakładki
klawiaturą (←→, role="tablist"), akordeon (Enter/Space, `aria-expanded`), pinezka (przycisk
+ `P`), 2× klik na ValueRow → dowód, klik pozycji Powiązań → `onNawiguj`. „Zaawansowane"
nigdy nie ukrywa pola z błędem (prop `bledy: string[]` wymusza rozwinięcie sekcji z błędem).

## 5. Etykiety PL
„Właściwości", „Wyniki", „Dowód", „Powiązania", „Zaawansowane", „Przypnij / Odepnij",
„Zaznacz obiekt, aby zobaczyć szczegóły", „Brak wyników dla tego obiektu", „nieaktualne
(rew. {a} → {b})", „Przelicz", „Pochodzenie: {zrodlo}", „Pokaż dowód". Zakaz identyfikatorów
kodowych w pierwszym planie; identyfikatory tylko w sekcji „Szczegóły techniczne"
(tryb Ekspercki, prop `trybZaawansowania`).

## 6. Kryteria akceptacji
1. `inspectorPanel.test.tsx`: zakładki, pinezka+split, stany, tryb ekspercki (≥ 12 testów).
2. `propertySection.test.tsx`: akordeon, trwałość stanu per typ obiektu, wymuszenie sekcji z błędem.
3. `valueRow.test.tsx`: mono+jednostka, 2× klik → dowód, pochodzenie w dymku.
4. `freshnessBadge.test.tsx`: aktualne/nieaktualne wg rewizji; akcja Przelicz.
5. `linksTab.test.tsx`: nawigacja wchodzące/wychodzące.
6. A11y: tablist/tree semantyka, fokus, kontrast tokenów; zero hex; determinizm.

## 7. Bramki i zwrot
Jak E1.1 §8 (pełny vitest CAŁOŚĆ + type-check + lint + guardy codenames/terminologia/mojibake).
Commit lokalny `feat(ui2/inspector): inspektor kontekstowy z pinezką i świeżością (E1.3)`,
BEZ push. Raport: pliki, bramki z liczbami, samoocena per kryterium, TODO-KARTA, hash commita.
