# Audyt SLD — runda R4: pomiar na renderze

**Data:** 2026-07-26 · **Zadanie:** #76 · **Rejestr:** V12K-215
**Następca wycofanej rundy R3** (`AUDYT_SLD_R3_CZEGO_BRAKUJE_2026-07.md`, V12K-214)

## Metoda — i dlaczego inna niż w R3

R3 mierzyła model sceny (`buildSceneV3`) i wnioskowała o rysunku; trzy z siedmiu zarzutów
były fałszywe. R4 czyta **DOM żywego renderu** przez `e2e/sld-audyt-r4-render.spec.ts`
(harness `screenshot-harness.html`, ten sam co generator zrzutów) i wypisuje **pełne
inwentarze**, nie odpowiedzi JEST/BRAK:

- histogram **computed `stroke`** wszystkich elementów SVG (nie deklarowanych, faktycznych),
- unia **wszystkich** atrybutów `data-*` w drzewie,
- pełna lista `data-testid` bloków arkusza,
- pełny tekst wszystkich elementów `<text>`.

Dopiero z inwentarzy wyprowadzone są wnioski. Semantyka każdego znalezionego koloru
potwierdzona w kodzie (`theme/colorTokens.ts`), nie zgadnięta z wartości RGB.

## Pomiar (L0 / L1 / L2, motyw ciemny)

| Poziom | Elementów SVG | Kolory obrysu |
|--------|---------------|---------------|
| L0 | 1 785 | `rgb(19,196,90)` × 1064 · `rgb(232,238,244)` × 94 |
| L1 | 7 073 | `rgb(19,196,90)` × 3050 · `rgb(0,153,204)` × 146 · `rgb(232,238,244)` × 94 |
| L2 | 8 197 | identycznie jak L1 |

Przypisanie kolorów do elementów (z inwentarza, nie z domysłu):

- `rgb(232,238,244)` = `#E8EEF4` — **ramka arkusza** (43 × `sld-sheet-zone-markers`) oraz
  **legenda** (`sld-sheet-legend-item-{earthSwitch,loadBreakSwitch,disconnector,fuseSwitch,
  breaker,transformer2W}`).
- `rgb(19,196,90)` = `#13C45A` — aparaty i tory pola: `earthSwitch`, `loadBreakSwitch`,
  `fuseSwitch`, `transformer2W`.
- `rgb(0,153,204)` = `#0099CC` — **wyłącznie** odcinki `sld-v3-segment-NN` (146 sztuk).

Kontrakt palety (`theme/colorTokens.ts`): `VOLTAGE_COLOR = { hv: BASE_STROKE,
sn: '#13C45A', nn: '#0099CC' }`.

## Znaleziska

### Z4-1 — strona WN dzieli kolor z ramką arkusza i legendą · waga: średnia

**Rysunek KODUJE poziom napięcia kolorem** — nN jest niebieskie (`#0099CC`, 146 odcinków),
SN zielone (`#13C45A`). To wprost przeczy zarzutowi Z1 z wycofanej rundy R3 i zostaje
odnotowane jako poprawne.

Realny brak jest węższy i inny: **`hv` nie ma własnego koloru semantycznego** —
`VOLTAGE_COLOR.hv = BASE_STROKE`, czyli strona 110 kV rysuje się barwą bazową, **tą samą,
którą narysowane są obwiednia arkusza, znaczniki stref i symbole w legendzie**. Na L0
widać to wprost: dwa kolory w całym drzewie, choć poziomy napięcia są trzy.

Dla projektanta znaczy to, że najwyższy poziom napięcia nie wyróżnia się jako poziom —
ma barwę „domyślną", wspólną z elementami nieelektrycznymi rysunku. SN i nN mają
semantykę barwną, WN jej nie ma.

### Z4-2 — tabelka rysunkowa: slot bez konsumenta produkcyjnego · waga: wysoka

`sheet/Frame.tsx` przyjmuje `titleBlock` jako slot (+ `titleBlockOrigin`), ale wyszukanie
konsumentów daje **wyłącznie testy**: `sheet/__tests__/frame.test.tsx` podaje
`fake-title-block`. **Zero miejsc produkcyjnych.** Potwierdza to inwentarz tekstów
renderu: 1198 elementów `<text>`, w tym numeracja stref ramki (1…30) i etykiety pól
(`pole liniowe`, `Q1`, `T1`, `QE1`, `Sekcja 1 · 15 kV`, `koniec otwarty`) — i **ani jednego**
tekstu tabelki (numer rysunku, skala, rewizja, data, projektant).

To jest zdolność bez dostawcy: slot istnieje, test go pokrywa, żaden ekran ani eksport go
nie wypełnia. Rysunek nie może pełnić funkcji dokumentu projektowego (PN-EN 61082-1 /
ISO 7200), a repozytorium ma eksport PDF/DOCX i Hub Dokumentacji.

Uwaga metodyczna: test pokrywający slot **atrapą** sprawia, że bramka jest zielona przy
zerowym użyciu produkcyjnym — łagodniejszy wariant wzorca „test maskujący brak produktu"
(Zero-Debt pkt 5).

### Potwierdzenia (co pomiar renderu uznał za poprawne)

- **Stan łącznika dociera do DOM:** atrybut `data-switch-state` z wartościami
  `unknown` / `closed` / `open`. Ostatecznie zamyka fałszywy zarzut Z2 z R3 — tym razem
  dowodem z renderu, nie z modelu.
- **Legenda** ma własne `data-testid` per symbol i pokrywa wszystkie użyte glify aparatów.
- **Ramka arkusza** ma znaczniki stref z numeracją (43 znaczniki, teksty 1…30).
- **Kodowanie napięć** działa dla SN i nN (patrz Z4-1).

## Dług otwarty (z rund poprzednich, wciąż aktualny)

- **Z7 (z R3, potwierdzone):** `measurements: 0` i `protection_assignments: 0` w sieci
  wzorcowej — cztery bramki warstwy zabezpieczeniowej mierzą pustkę.
- **Z6 (z R3, część danych):** `GroundingConfig` niewypełniony w żadnej z 315 szyn.
- **R2-B (z R2):** etykiety 2 px przy pełnym widoku sieci — decyzja o kierunku naprawy
  podjęta (declutter ekranowy), niewdrożona.

## Wada narzędzia naprawiona w trakcie

Pierwsza wersja specu R4 czekała na `networkidle` i zapisywała raporty do `test-results/`.
Oba były błędne: `networkidle` nie nadchodzi przy dev-serverze Vite (HMR trzyma połączenie),
a `test-results/` Playwright czyści na starcie przebiegu, więc raport z L1 ginął, gdy
dobiegał L2. Poprawione na `domcontentloaded` + oczekiwanie na `data-lod-override` oraz
katalog `audyt-r4/` (poza czyszczeniem).
