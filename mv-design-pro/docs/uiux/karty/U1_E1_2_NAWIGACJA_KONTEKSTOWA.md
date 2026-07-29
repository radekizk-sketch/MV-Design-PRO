# KARTA ZADANIA E1.2 — DRZEWA KONTEKSTOWE LEWEGO PANELU (część W-110/W-208)

**Faza:** U1 · **Epik:** E1 · **Wykonawca:** Sonnet · **Status:** GOTOWA DO DELEGACJI
**Wiążące:** `SPEC_UKLAD_PANELI_2026-07.md` §1.1, `MODEL_INTERAKCJI_APLIKACJI_2026-07.md` §2,
`AUDYT_RADY_SPECJALISTOW_2026-07.md` (W-208), `SPEC_POWIAZANIA_WARSTW_2026-07.md` §3–§5.

## 1. Cel
Dolna część lewego panelu: JEDEN reużywalny komponent drzewa kontekstowego, konfigurowany per
przestrzeń (Projekt→projekty, Model→topologia, Obliczenia→przypadki obliczeniowe,
Wyniki→hierarchia przebiegów, Dokumentacja→raporty). Globalna potrzeba inżyniera: to samo
zachowanie drzewa wszędzie (uczy się raz), liczniki problemów przy gałęziach, filtr „tylko
z problemami", tryby drzewa topologii (zasilania / administracyjny / obwodowy — audyt W-208).

## 2. Pliki
**Wyjściowe (TYLKO te ścieżki):** `frontend/src/ui2/nav/ContextTree.tsx` (rdzeń: render,
zwijanie gałęzi, selekcja, klawiatura), `treeModel.ts` (typy węzła: id, etykietaPL, ikona,
liczniki {blokady, ostrzeżenia}, dzieci, trybMin), `treeFilters.ts`, `adapters/topologyTreeAdapter.ts`
(czyta ISTNIEJĄCY store/API drzewa topologii — znajdź w `ui/topology/**`; read-only),
`adapters/casesTreeAdapter.ts` (z `ui/study-cases/api.ts` lub store), `adapters/runsTreeAdapter.ts`,
`strings.ts`, `index.ts`, `__tests__/` (contextTree, treeFilters, adapters).
**ZAKAZ:** `ui2/shell/**`, `ui2/theme/**`, `ui2/events/**`, `ui/sld*`, `engine/`, backend,
mutacje istniejących store'ów. Integracja z AppShell = osobna karta zarządcy (eksportuj czysty
komponent `ContextTree` + adaptery).

## 3. Kontrakt danych
Komponent sterowany propsami: `wezly: WezelDrzewa[]`, `zaznaczonyId`, `onZaznacz(id, zrodlo)`,
`onOtworz(id)` (2× klik / Enter), `filtrProblemy: boolean`, `tryb` (dla topologii). Adaptery
mapują istniejące dane → `WezelDrzewa[]` z udokumentowanym źródłem (plik:linia). Brak danych →
adapter zwraca `[]` + stan „pusty" w komponencie. Niejednoznaczne źródło → adapter-szkielet
`TODO-KARTA` + opis w raporcie (zero zgadywania).

## 4. Stany + 4a. Interakcje
Stany: pusty („Brak elementów — dodaj pierwszy…" z akcją przez callback), ładowanie (szkielet),
gotowy, filtr-bez-wyników. Interakcje wg gramatyki: 1× klik = selekcja (emisja `onZaznacz`),
2× klik/Enter = `onOtworz`, strzałki ↑↓ = nawigacja, ←→ = zwiń/rozwiń gałąź, Home/End,
pisanie = przeskok do węzła (typeahead), prawy klik = `onMenuKontekstowe(id, pozycja)` (callback,
menu w karcie integracyjnej). ARIA: `role="tree"`/`treeitem`/`aria-expanded`/`aria-selected`.

## 5. Etykiety PL
„Filtruj: tylko z problemami", „Brak elementów", „Tryb drzewa", „Zasilania", „Administracyjny",
„Obwodowy", licznik: `title="Blokady: {n}, ostrzeżenia: {m}"`. Zakaz identyfikatorów kodowych.
Słownik V12K-026 obowiązuje („przypadek obliczeniowy" dozwolone w ui2).

## 6. Kryteria akceptacji
1. `contextTree.test.tsx`: selekcja/otwarcie/zwijanie/klawiatura/typeahead/ARIA/stany (≥ 14 testów).
2. `treeFilters.test.ts`: filtr problemów zachowuje przodków dopasowanych węzłów.
3. `adapters.test.ts`: mapowanie danych zastanych → WezelDrzewa (fixture z realnego kształtu store/API).
4. Zero literałów hex (tokeny `--mvd-*`), zero fizyki, determinizm (bez Date.now/random).

## 7. Bramki i zwrot
Jak E1.1 §8 (pełny vitest CAŁOŚĆ, type-check, lint, guard codenames, ui_terminology_guard,
mojibake). Commit lokalny `feat(ui2/nav): drzewa kontekstowe lewego panelu (E1.2)`, BEZ push.
Raport: pliki, wyniki bramek z liczbami, samoocena per kryterium, mapowania adapterów
(plik:linia) lub TODO-KARTA, hash commita.
