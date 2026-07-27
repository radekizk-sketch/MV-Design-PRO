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

- ~~**Z7 (z R3):** cztery bramki warstwy zabezpieczeniowej mierzą pustkę~~ — **ZAMKNIĘTE
  (V12K-220)**: nowa fixtura ścieżki danych `gpzProtectionDataPath.enm.json` z koordynacją
  dobraną fizycznie. Pomiar: adnotacje zabezpieczeń 0→8, linie pomiarowe CT→przekaźnik 0→3,
  tory wyzwalania 0→3, aparaty pól GPZ 6→28 ze stanami z modelu. Łańcuch danych miał cztery
  ogniwa i każde brakujące dawało ciche zero — spis w rejestrze V12K-220.
- ~~**Z6 (z R3):** `GroundingConfig` niewypełniony~~ — **ZAMKNIĘTE (V12K-219)**: model
  uziemienia na trzech poziomach napięcia + symbol punktu neutralnego z czterema wariantami
  fizycznymi. Rezystor 57,7 Ω → prąd doziemny ≈ 150 A; ten wynik jest podstawą nastaw
  ziemnozwarciowych z V12K-220.
- ~~**R2-B (z R2):** etykiety 2 px~~ — **ZAMKNIĘTE (V12K-218)**: declutter ekranowy z progiem
  6 px w warstwie renderu + jawny wskaźnik „Ukryto N opisów — przybliż, aby zobaczyć". Przy
  pełnym widoku sieci ukrywane są wszystkie opisy (1135 na L2) — zamierzone: pył udający
  informację znika, a licznik mówi, ile i jak je odsłonić. Próg żyje w renderze, nie w scenie,
  żeby scena została deterministyczna.

## Wada narzędzia naprawiona w trakcie

Pierwsza wersja specu R4 czekała na `networkidle` i zapisywała raporty do `test-results/`.
Oba były błędne: `networkidle` nie nadchodzi przy dev-serverze Vite (HMR trzyma połączenie),
a `test-results/` Playwright czyści na starcie przebiegu, więc raport z L1 ginął, gdy
dobiegał L2. Poprawione na `domcontentloaded` + oczekiwanie na `data-lod-override` oraz
katalog `audyt-r4/` (poza czyszczeniem).

## Wdrożenie Z4-1 (V12K-216) — zrobione

`VOLTAGE_COLOR.hv` = `#D93A2B` (czerwień ciepła, hue ≈ 7°), zgodnie z wybraną paletą praktyki
polskich OSD. Odcień dobrany świadomie daleko od `STATE_COLOR.nop`/`open` = `#FF006E`
(magenta, hue ≈ 334°) — na ekranie czerwień była wolna, a „poziom napięcia" i „stan ruchowy"
nie mogą się zlać.

**W druku WN zostaje czarnym tuszem** (asymetria zamierzona): czerwień drukowalna `#B71C1C`
jest zarezerwowana dla NOP (wymóg D11 wzajemnej rozróżnialności). Gdy trzeba wybrać,
pierwszeństwo ma stan ruchowy — pomyłka co do punktu podziału sieci jest groźniejsza niż
pomyłka co do poziomu napięcia.

Pomiar po zmianie (render L0/L1/L2): WN `rgb(217,58,43)` × 6 (szyna WN, źródło, 2 odcinki),
baza spadła 94 → 88, **L0 ma teraz trzy kolory zamiast dwóch**. Kanon matrix §3 zaktualizowany
(„110 czerwony"), bo inaczej kod rozjechałby się z kanonem.

Weryfikacja: 3745 testów `src/ui/sld` (197 plików), `accept:sld-v3` ALL PASS,
`sld_determinism_guards` 0 naruszeń, tsc i eslint czyste.

### Niedomiar — aparaty pola WN · ZAMKNIĘTY (V12K-217)

Aparaty pola transformatorowego GPZ (`wn_sn-cb`, `wn_sn-ds`, `wn_sn-ct`) mają nadal kolor
SN `rgb(19,196,90)` — **wyłącznik 110 kV wygląda jak wyłącznik 15 kV**. Czerwień dostały
tylko szyna WN, źródło i odcinki, bo klasyfikacja `voltageClassOf` czyta znacznik `#hv-`
z `ownerRef` odcinka, a symbole aparatów takiego znacznika nie noszą.

To nie przeoczenie tej karty, a **udokumentowany GAP karty S3** (`colorTokens.ts`,
komentarz przy `baseSymbolStrokeColor`: „pozostałe symbole aparatury … NIE niosą dziś w
`ownerRef` znacznika napięcia pola, `bayRef` to opaque"). Naprawa wymaga przeniesienia klasy
napięcia z pola do symbolu w `compose/gpz.ts`/`compose/station.ts` — zakres S4/S5, nie token.

**Domknięte tego samego dnia (V12K-217).** Kompozycja nadaje aparatom stosu WN jawne
`meta.voltageClass = 'hv'`, a `voltageClassOf` czyta je z pierwszeństwem przed klasyfikacją
substring. Świadomie NIE doklejano markera `#hv-` do `ownerRef`: to referencja domenowa
(audyt §12.1), a znacznik prezentacji zmieszałby dwa porządki.

Pomiar po naprawie (render L2): pole WN `rgb(217,58,43)`, pole SN tego samego transformatora
`rgb(19,196,90)` — **rozróżnienie stron działa**; histogram WN 6 → 15, SN 3050 → 3041.

Pułapka warta zapamiętania: pierwsza próba nie zadziałała mimo poprawnej kompozycji, bo
`gpzSymbolToPreview` przepisuje meta przez **jawną listę pól** i `voltageClass` wypadało po
cichu w drodze do sceny — bez błędu typów, bo pole jest opcjonalne. Diagnoza wyszła z pomiaru
sceny (0 symboli z `voltageClass`), nie z lektury kodu.

## Etykieta punktu neutralnego — trzy próby odrzucone przez bramki (V12K-221)

Niedomiar z V12K-219 (wartość R/X nieopisana na rysunku) **nie został zamknięty**, i to jest
wynik pomiaru, nie zaniechania. Trzy podejścia, każde odrzucone przez inną wyrocznię —
warto je zapisać, bo każda odmowa była słuszna i mówi coś o architekturze rysunku:

| Próba | Umiejscowienie | Kto odrzucił i dlaczego |
|---|---|---|
| 1 | osobna etykieta **pod aparatem** | `declutterLabels` — kolizja z bboxem aparatu; etykieta obecna w kompozycji, w scenie zero (cisza, bez błędu) |
| 2 | osobna etykieta **po lewej** aparatu | wyrocznia „żadna etykieta nie wystaje za lewą krawędź" — aparat stoi przy krawędzi sekcji, a sekcja przy krawędzi arkusza. Dodatkowo `busbar_label_probe` §18.4 słusznie nie dopuścił etykiety `busbar-voltage` bez odpowiadającego odcinka szyny |
| 3 | **dopisek do etykiety sekcji** | `noLabelWireCollisions` + ta sama wyrocznia lewej krawędzi — etykieta sekcji jest wyśrodkowana na lewym końcu szyny, więc jej wydłużenie wypycha ją poza rysunek (mechanizm opisany wprost w komentarzu `sectionLabelText`) |

**Wniosek projektowy:** sposób pracy punktu neutralnego jest informacją o **całej sieci**, nie
o pojedynczym elemencie geometrii — tak jak poziomy napięć czy podstawa normowa. Właściwym
miejscem jest więc **legenda / opis arkusza**, gdzie jest miejsce i gdzie nie konkuruje z
aparaturą pól. Próby wciśnięcia jej w warstwę geometrii musiały przegrać z wyroczniami
pilnującymi czytelności — i dobrze, że przegrały.

**DOMKNIĘTE (V12K-223):** opis trafił do **legendy arkusza** jako nowy rodzaj wpisu
`kind: 'note'` — wiersz opisu sieci bez glifu. Tekst z wartością składa kompozycja i podaje
przez `scene.meta`, więc UI nie zna fizyki, a brak modelu uziemienia daje brak wiersza.
Pomiar: `„Punkt neutralny: rezystor 57,7 Ω"` na obu sieciach.

Kod trzech prób umiejscowienia przy symbolu został **wycofany** (nie zostawiono martwych kolekcji ani nieużywanych
helperów). Tryb pracy nadal niesie **kształt glifu** (rezystor / dławik / połączenie
bezpośrednie / przerwa dla sieci izolowanej), więc informacja jakościowa jest na rysunku —
brakuje wyłącznie liczby. Domknięcie: rozbudowa bloku legendy o wiersze opisu sieci.

## Znalezisko R4-3 — punkt podziału sieci (NOP) nieoznaczony · waga: wysoka

**Pomiar (sieć wzorcowa 52 stacji):** model ma **1 gałąź `status='open'`** — realny punkt
rozcięcia. Symbol `noPoint` w scenie: **0 na L0, 0 na L1, 0 na L2**.

Warstwa prezentacji jest przy tym **w pełni gotowa**: glif `noPoint` istnieje, paleta ma dla
niego dedykowany kolor (`STATE_COLOR.nop` = `#FF006E`, magenta świadomie odrębna od barw
napięciowych), a `baseSymbolStrokeColor` obsługuje go jawnie z komentarzem „punkt podziału
jest z DEFINICJI domenowej normalnie otwarty — WYRÓŻNIONY na KAŻDYM LOD". Wersja eksportowa
też ma własną czerwień NOP (`#B71C1C`) z wymogiem D11 rozróżnialności.

Brakuje jedynego ogniwa: **nikt nie emituje tego symbolu dla gałęzi ze `status='open'`**.
Zdolność bez wywołania — ten sam wzorzec co `titleBlock` (slot bez konsumenta) i jak
warstwa zabezpieczeniowa przed V12K-220.

**Dlaczego to waży wysoko:** dla sieci SN pracującej promieniowo z możliwością rezerwowania
punkt podziału jest informacją ruchową pierwszego rzędu — projektant patrzący na schemat nie
wie, gdzie sieć jest rozcięta, więc nie odczyta kierunków zasilania ani skutków przełączeń.
Kolor jest zarezerwowany i czeka; brakuje emisji.

Do domknięcia w osobnej karcie: emisja `noPoint` na odcinku gałęzi otwartej, z pomiarem
na obu fixturach i kontrolą odwrotną (sieć bez gałęzi otwartej = zero symboli NOP).
