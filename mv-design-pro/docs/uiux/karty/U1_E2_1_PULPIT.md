# KARTA ZADANIA E2.1 — PULPIT PROJEKTU (W-101)

**Faza:** U1 · **Epik:** E2 · **Wykonawca:** Opus · **Status:** GOTOWA DO DELEGACJI
**Wiążące:** `AUDYT_RADY_SPECJALISTOW_2026-07.md` (W-101 — kafle: postęp wg celu, bilans
przyłączeniowy, spójność, ostatnio otwierane), `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` §2,
`SPEC_POWIAZANIA_WARSTW_2026-07.md` §3 (świeżość — używaj `FreshnessBadge` z `ui2/inspector`,
zakaz lokalnych wariantów), makieta U0.6 (widok „Projekt").

## 1. Cel
Pierwszy ekran inżyniera po otwarciu projektu: jedno spojrzenie na stan (model, gotowość,
wyniki, przypadki) + prowadzenie od celu (audyt W-101: „co dalej" z głębokim linkiem).
Zawartość przestrzeni N1 renderowana w warsztacie (środkowy panel) AppShell.

## 2. Pliki
**Wyjściowe (TYLKO):** `frontend/src/ui2/spaces/projekt/PulpitProjektu.tsx` (siatka kafli),
`KafelModelu.tsx`, `KafelGotowosci.tsx`, `KafelOstatniegoPrzebiegu.tsx`, `KafelSpojnosci.tsx`
(rev modelu + aktualność wyników + odcisk — używa `FreshnessBadge`), `ListaPrzypadkow.tsx`
(tabela przypadków obliczeniowych: konfiguracja, status wyników, ostatni przebieg; klik =
selekcja, 2× klik = `onOtworzPrzypadek`), `adapters/pulpitAdapter.ts` (read-only z istniejących
store'ów: snapshot/readiness — `ui/topology/snapshotStore`, przypadki — `ui/study-cases/store`,
przebiegi — `ui/study-cases/runStore`; mapowania udokumentowane plik:linia), `strings.ts`,
`index.ts`, `__tests__/` (≥ 4 pliki testów).
**ZAKAZ:** modyfikacji pozostałych modułów `ui2/**` (wpięcie do AppRoot = karta zarządcy),
`ui/sld*`, backendu; zero wołań API (wyłącznie store'y read-only); brakujące dane (np. cel
projektu, bilans przyłączeniowy — brak źródła w store'ach) → kafel w stanie „wkrótce"
z TODO-KARTA w kodzie i raporcie, NIE zgaduj.

## 3. Interakcje i stany
Gramatyka §2: kafel klikalny → `onNawiguj(przestrzen)` (głęboki link do przestrzeni);
wiersz przypadku: klik = emisja selekcji przez callback `onZaznaczPrzypadek`, 2× klik =
`onOtworzPrzypadek(id)`; wszystkie liczby `tabular-nums` z jednostkami. Stany: brak projektu
(pusty z akcją „Otwórz projekt"), ładowanie, gotowy; kafel bez danych źródłowych = stan
„wkrótce" (wyszarzony, z wyjaśnieniem PL) — nigdy pusta dziura.

## 4. Etykiety PL (dokładne)
„Pulpit projektu", „Model sieci", „elementów", „Stacje SN/nn", „Źródła", „Gotowość do analiz",
„Blokady", „Ostrzeżenia", „Ostatni przebieg", „Spójność", „Model: rew. {n}", „Wyniki:
aktualne/nieaktualne", „Przypadki obliczeniowe", „Konfiguracja", „Wyniki", „Ostatni przebieg",
„Otwórz projekt", „Wkrótce — wymaga danych z kolejnych faz programu". Słownik V12K-026
obowiązuje. Zakaz identyfikatorów kodowych na pierwszym planie.

## 5. Kryteria akceptacji
1. `pulpitProjektu.test.tsx` (≥ 10): kafle z danymi ze store'ów (setState fixtures o realnym
   kształcie), stan braku projektu, kafle „wkrótce", nawigacja kaflem.
2. `listaPrzypadkow.test.tsx`: render wierszy, klik/2× klik, statusy wyników (tagi PL).
3. `pulpitAdapter.test.ts`: mapowania store → model kafli (fixture jak w E1.2/E15.1).
4. Świeżość: `KafelSpojnosci` używa `FreshnessBadge` z `ui2/inspector` (test importu/renderu).
5. Zero hex, zero Date.now/random (czas „ostatniego przebiegu" formatowany z danych store'a).

## 6. Bramki i zwrot
Jak E1.1 §8 (pełny vitest CAŁOŚĆ + type-check + lint + guardy). Commit lokalny
`feat(ui2/spaces): pulpit projektu W-101 (E2.1)`, BEZ push. Raport: pliki, bramki z liczbami,
samoocena per kryterium, mapowania adaptera (plik:linia) / TODO-KARTA, hash commita.
