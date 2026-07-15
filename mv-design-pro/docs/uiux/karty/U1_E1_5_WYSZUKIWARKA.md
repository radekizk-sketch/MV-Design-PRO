# KARTA ZADANIA E1.5 — WYSZUKIWARKA POLECEŃ (W-105, Ctrl+K)

**Faza:** U1 · **Epik:** E1 · **Wykonawca:** Sonnet · **Status:** GOTOWA DO DELEGACJI
**Wiążące:** `SPEC_UKLAD_PANELI_2026-07.md` §2.2, `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` §2,
`AUDYT_RADY_SPECJALISTOW_2026-07.md` (W-105).

## 1. Cel
Globalna wyszukiwarka (paleta poleceń) — najszybsza droga inżyniera do wszystkiego:
przestrzenie, funkcje/okna rejestru, obiekty modelu (po nazwie), gotowe przykłady, pomoc.
Wyniki z wyższych trybów zaawansowania widoczne z podpowiedzią „dostępne w trybie
rozszerzonym — przełączyć?" (reguła SPEC_UKLAD_PANELI §2.2 — ukrycie ≠ usunięcie).

## 2. Pliki
**Wyjściowe (TYLKO):** `frontend/src/ui2/search/CommandPalette.tsx` (dialog modalny:
pole + lista wyników + nawigacja klawiaturą), `searchModel.ts` (typy: `PozycjaWyszukiwania`
{id, etykietaPL, grupa: 'przestrzenie'|'polecenia'|'obiekty'|'przyklady'|'pomoc', trybMin?,
akcja}), `searchIndex.ts` (budowa indeksu z rejestrów: przestrzenie z `../shell/spaces`,
polecenia statyczne PL, obiekty przez podany provider), `fuzzy.ts` (dopasowanie: prefiks >
podciąg > rozmyte; deterministyczne rankingi), `strings.ts`, `index.ts`, `__tests__/`
(commandPalette, fuzzy, searchIndex — łącznie ≥ 20 testów).
**ZAKAZ:** modyfikacji `ui2/shell/**`, `ui2/nav/**`, `ui2/inspector/**`, `ui2/events/**`,
`ui2/AppRoot.tsx` (wpięcie = karta zarządcy), `ui/sld*`, backendu. Komponent sterowany
propsami: `otwarta`, `onZamknij`, `pozycje: PozycjaWyszukiwania[]`, `trybAktualny`,
`onWykonaj(pozycja)`, `onPrzelaczTryb(trybMin)`.

## 3. Interakcje (gramatyka §2 + specyfika)
Otwarcie: sterowane z zewnątrz (AppShell ma już skrót Ctrl+K). `Esc` = zamknij bez akcji;
`↑↓` = nawigacja; `Enter` = wykonaj; pozycja z `trybMin` wyższym niż `trybAktualny`:
Enter pokazuje wiersz potwierdzenia „Dostępne w trybie {tryb} — przełączyć?" z akcjami
[Przełącz i otwórz] [Anuluj]. Wpisywanie filtruje na żywo (bez opóźnień sztucznych).
Grupowanie wyników nagłówkami PL. Fokus uwięziony w dialogu (focus trap), po zamknięciu
wraca do elementu sprzed otwarcia. ARIA: `role="dialog"` + `aria-modal` + listbox/option.

## 4. Stany i etykiety PL
Stany: pusta fraza (podpowiedź „Zacznij pisać…" + ostatnie 5 pozycji z historii w pamięci
sesji), brak wyników („Brak wyników dla „{fraza}""), wyniki. Etykiety: „Szukaj poleceń,
obiektów, okien…", „Przestrzenie", „Polecenia", „Obiekty", „Gotowe przykłady", „Pomoc",
„Dostępne w trybie {tryb} — przełączyć?", „Przełącz i otwórz", „Anuluj". Zakaz
identyfikatorów kodowych; determinizm (ranking bez losowości; historia = stan sesji,
nie localStorage).

## 5. Kryteria akceptacji
1. `fuzzy.test.ts`: prefiks > podciąg > rozmyte; stabilny porządek (remisy po etykiecie PL,
   `localeCompare('pl')`); polskie znaki diakrytyczne dopasowywane bez i z ogonkami.
2. `commandPalette.test.tsx` (≥ 12): otwarcie/zamknięcie, filtracja, klawiatura, Enter,
   przepływ trybu (potwierdzenie → `onPrzelaczTryb` + `onWykonaj`), focus trap i powrót
   fokusu, stany, ARIA.
3. `searchIndex.test.ts`: indeks z przestrzeni (7 pozycji) + poleceń + providera obiektów.
4. Zero hex; zero Date.now/random.

## 6. Bramki i zwrot
Jak E1.1 §8 (pełny vitest CAŁOŚĆ + type-check + lint + guardy codenames/terminologia/
mojibake). Commit lokalny `feat(ui2/search): wyszukiwarka poleceń W-105 (E1.5)`, BEZ push.
Raport: pliki, bramki z liczbami, samoocena per kryterium, TODO-KARTA, hash commita.
