# KARTA ZADANIA E4.1 — KATALOG TYPÓW + KARTA TECHNICZNA (W-205/W-206)

**Faza:** U2 · **Epik:** E4 · **Wykonawca:** Opus · **Wiążące:** `AUDYT_RADY_SPECJALISTOW`
(W-205/206: pełny zestaw parametrów z definicjami — symbol, jednostka, norma; pochodzenie danych
typu), `docs/ui/CATALOG_BROWSER_CONTRACT.md` + `KATALOG_WIAZANIE_I_MATERIALIZACJA.md` (istniejące
kontrakty — zachowaj semantykę), `MODEL_INTERAKCJI` §2/§2.7, kanon katalog-first (CLAUDE.md).

## 1. Cel
Nowe okno przestrzeni „Model sieci" (trzecia zakładka warsztatu — wpięcie: scalenie zarządcy):
przeglądarka katalogu typów (kable/linie/transformatory/aparaty/falowniki — kategorie z realnego
API `ui/catalog/**` lub `/api/catalog`) z kartą techniczną typu: parametry z symbolem, jednostką
i definicją PL; pochodzenie danych (karta producenta/norma/założenie — jeśli API je niesie;
inaczej „wkrótce"); wyszukiwanie i filtry per kategoria; „Gdzie użyty" (elementy modelu
z tym typem — ze snapshotu, read-only).

## 2. Pliki (TYLKO `frontend/src/ui2/spaces/model/katalog/**`)
`KatalogPanel.tsx` (kategorie → lista typów → karta), `KartaTechniczna.tsx` (sekcje parametrów;
wartości mono z jednostkami; definicje z lokalnego słownika PL per parametr — TYLKO dla
parametrów, których znaczenie wynika z nazwy pola API i norm (np. `uk_percent` → „uk — napięcie
zwarcia [%]"); pola niejednoznaczne → bez definicji, NIE zgaduj), `GdzieUzyty.tsx` (snapshot
read-only po `catalog_ref`), `adapters/katalogAdapter.ts` (istniejący klient/API — zbadaj
`ui/catalog/**` i `backend/src/api/catalog.py`; mapowania plik:linia), `strings.ts`, `index.ts`,
`__tests__/` (≥ 20 testów, fixtures 1:1 z API).
**ZAKAZ** modyfikacji innych plików (wpięcie zakładki = zarządca); zero mutacji katalogu
(typy immutable — kanon); etykiety PL; zero snake_case w UI (symbole parametrów typu „uk", „Sn"
to nomenklatura branżowa — dozwolone).

## 3. Kryteria
(1) kategorie+lista+karta z realnego API, (2) słownik definicji parametrów (≥ 15 pozycji
udokumentowanych normą/źródłem w komentarzu), (3) „Gdzie użyty" ze snapshotu z nawigacją
przez callback `onPokazElement(ref)`, (4) pełne bramki jak E1.1 §8 (pipefail).
Commit `feat(ui2/model): katalog typów z kartą techniczną (E4.1)` BEZ push. Raport standardowy.
