# KARTA ZADANIA E8.1 — WSPÓLNY WZORZEC EKRANU ANALIZY (fundament U3/W-606)

**Faza:** U3 (otwarcie) · **Epik:** E8/E9 · **Wykonawca:** Opus · **Wiążące:**
`AUDYT_RADY_SPECJALISTOW` (W-606: wspólny wzorzec tabela+wykres+założenia+dowód; W-602:
założenia przy każdej liczbie), `SPEC_POWIAZANIA_WARSTW` §3 (świeżość), `MODEL_INTERAKCJI`
§2 (każda liczba 2×klik → dowód) i §2.7, `dataviz` (wykresy: Recharts już w zależnościach).

## 1. Cel
JEDEN reużywalny szkielet ekranu wyników analizy — fundament wszystkich okien U3/U4
(rozpływ, zwarcia, analizy specjalne, OZE): nagłówek (analiza PL + przebieg + FreshnessBadge
+ akcje), sekcja ZAŁOŻENIA (z rejestru parametrów przebiegu), TABELA wyników (kolumny
definiowane deklaratywnie: etykieta PL, jednostka, mono, próg ostrzegawczy → tag),
WYKRES (opcjonalny slot), stopka (eksport przez callback). Każda wartość: `ValueRow`-owa
semantyka (2×klik → onOtworzDowod(ref) gdy dowodRef).

## 2. Pliki (TYLKO `frontend/src/ui2/wyniki/wzorzec/**`)
`EkranAnalizy.tsx` (kompozycja sekcji; propsy: naglowek{analizaPL, runId?, rewizjaDanych?,
rewizjaModelu}, zalozenia: WierszZalozenia[], kolumny: DefinicjaKolumny[], wiersze:
Record<string,WartoscKomorki>[], wykres?: ReactNode, onOtworzDowod, onEksport?,
trybZaawansowania), `TabelaWynikow.tsx` (sort po kolumnach, wirtualizacja NIE w tej karcie —
TODO-KARTA przy >500 wierszy, próg ostrzegawczy → tag PL), `SekcjaZalozen.tsx` (zwijana,
domyślnie rozwinięta — „założenia są częścią wyniku"), `wzorzecModel.ts` (typy),
`strings.ts`, `wzorzec.css`, `index.ts`, `__tests__/` (≥ 22 testy) + JEDEN dowód użycia:
`frontend/src/ui2/wyniki/rozplyw/TabelaSzyn.tsx` — pierwsza konkretyzacja: wyniki napięć
szyn z ResultSet rozpływu (zbadaj realny kształt: `ui/power-flow-results/**` lub kontrakt
resultset v1 — mapowania plik:linia; adapter read-only; bez API jeśli store/dane dostępne,
inaczej props+TODO-KARTA), z wykresem profilu napięcia (Recharts, tokeny --mvd-*, wartości
z danych — zero losowości).

## 3. Zasady i kryteria
FreshnessBadge importowany z `ui2/inspector` (JEDYNY znacznik). Liczby: tabular-nums,
jednostki zawsze; identyfikatory tylko w trybie eksperckim. Kryteria: (1) EkranAnalizy
renderuje 4 sekcje z propsów (testy per sekcja + stany pusty/nieaktualny), (2) tabela:
sort, progi→tagi, 2×klik→dowód, (3) TabelaSzyn: realny kształt danych rozpływu (fixture 1:1)
+ wykres, (4) pełne bramki jak E1.1 §8 (pipefail). Commit
`feat(ui2/wyniki): wspólny wzorzec ekranu analizy + rozpływ szyn (E8.1)` BEZ push.
Raport standardowy z mapowaniami.
