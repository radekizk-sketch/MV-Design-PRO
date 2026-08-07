# Audyt jakości schematu (SLD) — od budowy sieci do prezentacji wyników

**Data:** 2026-08-06 · **Baza:** `767ac33b` · **Rodzaj:** audyt na ŻYWEJ aplikacji (bez zmian w kodzie)

Powód: dyrektywa właściciela 2026-08-06 — *„najważniejsza jest jakość schematu i jego
działanie od budowy sieci do prezentacji wyników — ciągle nie jest to jakość oczekiwana"*.

## 1. Metoda i uczciwość pomiarowa

Audyt prowadzony jest na **żywej aplikacji** (backend `uvicorn` :8000 + vite dev :5173),
nie na harnessie zrzutowym. Powodem jest to, że harness (`screenshot-harness.html`) rysuje
własną sieć wzorcową i ma **stałe tło techniczne niezależne od motywu** — czyli nie pokazuje
tego, co widzi projektant w aplikacji.

**Sieci badane** — zbudowane przez realne operacje domenowe API (ta sama sekwencja, co
`e2e/industrial-template-mass-flow.spec.ts`: `add_grid_source_sn` → `continue_trunk_segment_sn`
→ `station-templates/{id}/apply` → `start_branch_segment_sn`), z biblioteki 57 szablonów:

| Sieć | Stacje | Szyny | Gałęzie | Transformatory | Generatory (OZE) | Gotowość |
|------|--------|-------|---------|----------------|------------------|----------|
| średnia | 16 | 86 | 69 | 16 | 18 | `ready=true` (1 ostrzeżenie W002) |
| duża | 51 | 288 | 236 | 51 | 78 | `ready=true` (1 ostrzeżenie W002) |

**Warunki zrzutów:** viewport 1600×1000, `deviceScaleFactor=2`, oba motywy przełączane
**realnym przyciskiem powłoki** (`mvd-theme-toggle`) z asercją na `data-theme` — zasiew
`localStorage` nie przechodzi rehydracji `persist`, więc dawałby fikcyjne „oba motywy".

**Zasady zapisu znalezisk:**
- każda ocena liczbowa ma podaną **metodę pomiaru**;
- oceny estetyczne są jawnie oznaczone jako **(opinia)**;
- waga: **3** = blokuje codzienną pracę projektanta · **2** = poważnie spowalnia ·
  **1** = uciążliwość / dopracowanie.

**Soczewki:** `PSN` projektant sieci SN · `ZW` zwarciowiec czytający wyniki ze schematu ·
`CAD` kreślarz CAD/SCADA (norma rysunku) · `UX` płynność i martwe kliki.

---

## 2. E-CZYTELNOŚĆ ARKUSZA

### 2.1 Pomiar bazowy

Poziom szczegółu w żywej aplikacji sterowany jest **wyłącznie skalą kamery**
(progi `0,6` / `1,2`, histereza `0,15` — `ui/sld/v3/canvas/camera.ts`); **nie ma przełącznika
L0/L1/L2**. Poziomy osiągane były realnym gestem kółka w środek kanwy.

Kanwa: **1322 × 696 px**. Pomiar przez `getBoundingClientRect` elementów renderu.

| Sieć | Poziom | Ramka arkusza [px] | Proporcja | Gęstość tuszu | Symbole w widoku | Etykiety ukryte | Tekst min / mediana |
|------|--------|--------------------|-----------|---------------|------------------|-----------------|---------------------|
| duża | L0 | 2 163 × 41 | **53,2 : 1** | **0,0 %** | 29 / 55 | 1 | **2 px** / **2 px** |
| duża | L1 | 32 176 × 586 | **54,9 : 1** | 11,2 % | 24 / 694 | **99** | 9 px / 10 px |
| duża | L2 | **66 103** × 1 228 | **53,8 : 1** | 20,5 % | **17 / 701** | 0 | 14 px / 15 px |
| średnia | L0 | 1 245 × 84 | 14,8 : 1 | 0,5 % | 20 / 20 | 1 | **2 px** / **2 px** |
| średnia | L1 | 9 011 × 604 | 14,9 : 1 | 10,3 % | 29 / 206 | 29 | 10 px / 10 px |
| średnia | L2 | 18 512 × 1 267 | 14,6 : 1 | 22,8 % | 19 / 210 | 0 | 14 px / 16 px |

### 2.2 Znaleziska

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| C-1 | **[ZAMKNIĘTE 2026-08-06, karta S9-1 — `DECYZJA_LAMANIE_ARKUSZA.md`]** **Cała sieć jest rysowana jako JEDEN poziomy pas.** Sieć 51 stacji ma na arkuszu proporcję **53 : 1** na każdym poziomie szczegółu; 50 etykiet stacji `S01…S50` leży na jednej linii `y = 617`, ramka arkusza ma **109 kolumn stref i 2 wiersze (A, B)**. To nie jest arkusz rysunkowy — to taśma. | `czytelnosc-duza-L0-pasek-kadr.png` (kadr pasa: pozioma kreska + kody stacji, **zero symboli**), tabela 2.1 | CAD, PSN | **3** | Layout musi łamać magistralę na wiersze arkusza (serpentyna / strony) zamiast rozwijać ją w nieskończoność w prawo. |
| C-2 | **[ZAMKNIĘTE 2026-08-06 wraz z C-1 — przyczyną było dolne ograniczenie skali kamery `MIN_SCALE`, na które trafiał rysunek o proporcji 10:1+]** **Widok otwarcia nie mieści rysunku.** Po otwarciu przypadku (auto-fit) rysunek sieci dużej rozciąga się `x ∈ [-159; 2005]` przy kanwie `x ∈ [262; 1584]` — **47 % symboli (26 z 55) i 43 % etykiet leży poza kanwą**, w tym opis GPZ. | pomiar `widocznosc-duza`; `czytelnosc-duza-L0-ciemny.png` | UX, PSN | **3** | Auto-fit ma dopasowywać obwiednię rysunku do kanwy w obu osiach, a nie tylko ustawiać skalę poziomu. |
| C-3 | **[ZAMKNIĘTE 2026-08-07, karta S9-12 — decyzja właściciela V12K-335 pkt 1: cel audytowy „gęstość tuszu > 5%" WYCOFANY; zasada „jednej kotwicy" S1 utrzymana (stabilność przestrzenna przy zoomie ważniejsza niż gęstość przeglądu); stan ~2% po S9-1/S9-7-8 przyjęty jako DOCELOWY — bez zmian kodu]** **[CZĘŚCIOWO 2026-08-06, karty S9-1 + S9-7/8. S9-1: gęstość tuszu na przeglądzie 0,77 % → 2,03 %, pokrycie kanwy 33,5 % → 55,0 %. S9-7/8: przegląd niesie już czytelne opisy (zero napisów < 8 px ekranu, znaczniki stref z formatu arkusza, waga magistrali 0,31 → 1,50 px ekranu), ale gęstość tuszu pozostaje 2,03 % — próg > 5 % NIEOSIĄGALNY bez cofnięcia „jednej kotwicy" S1. POMIAR ROZSTRZYGAJĄCY (S9-7/8): rezerwacja OPISOWA to 28,0 % szerokości kolumn (17 320 z 61 792 px), pozostałe 72 % to blok stacji pełnego szczegółu — nawet wyzerowanie całej rezerwacji opisowej dałoby ~2,8 %. Diagnoza z `DECYZJA_LAMANIE_ARKUSZA.md` §9 pkt (b) tym samym SPROSTOWANA; jedyną drogą jest §9 pkt (a) — decyzja produktowa]** **Przegląd sieci nie niesie żadnej informacji.** Na L0 gęstość tuszu wynosi **0,0 %** (duża) / 0,5 % (średnia), a w kadrze pasa widać wyłącznie kreskę i kody `S12…S40`. Projektant otwierający projekt nie widzi ani jednego symbolu. | `czytelnosc-duza-L0-pasek-kadr.png`, `czytelnosc-duza-L0-ciemny.png` | PSN, UX | **3** | Poziom przeglądu ma pokazywać schemat blokowy stacji (blok + typ + moc), a nie sam przebieg magistrali. |
| C-4 | **[ZAMKNIĘTE 2026-08-06, karta S9-7/8 — rejestr `S9-7-8`]** **Typografia arkusza poniżej granicy czytelności.** Na L0 **114 ze 165** napisów ma wysokość **2 px** (CSS) — w tym opis GPZ „GPZ 15 kV · 110/15 kV", etykieta poziomu, podziałka i wszystkie 109 znaczników stref. Mediana wysokości tekstu = 2 px. | pomiar `czytelnosc-*-L0` (`tekstPonizej8px`, `tekstMinPx`) | CAD | **3** | Napisy ramki i opisy obiektów muszą mieć rozmiar w pikselach EKRANU (stała wielkość), niezależny od skali kamery. |
| C-5 | **[ZAMKNIĘTE 2026-08-07, karta S9-12 — pomiar domykający po złamaniu arkusza (S9-1). Proporcja arkusza L2: 53,8 : 1 → **1,48 : 1** (sieć referencyjna 54 stacje, bbox 8 280 × 5 577 px świata) / **1,33 : 1** (długi ciąg 93 stacje, 9 118 × 6 881 px) — taśma przestała istnieć. Przejrzenie L2 (kanwa audytu 1322 × 696, skala progu wejścia L2 = 1,2): **8 × 10 = 80 ekranów** na 54 stacjach — liczba ekranów wynika z ILOŚCI treści (ta sama aparatura co przed łamaniem: pas dawał 50 przewinięć poziomych przy 2 pionowych = ~100 ekranów), ale nawigacja jest serpentynowa w OBU osiach z siatką stref arkusza (9 kolumn × wiersze), nie jazdą po 66-tysięcznym pasie]** **Poziom pełnego detalu jest nieprzeglądalny.** Arkusz L2 sieci dużej ma **66 103 px** szerokości przy kanwie 1322 px — to **50 szerokości ekranu**; w widoku jest **17 z 701** symboli (2,4 %). Przejrzenie sieci na L2 wymaga 50 przewinięć. | tabela 2.1; pomiar S9-12 (`buildSceneV3` L2 + `sheetAspectRatio`) | PSN, ZW | **3** | Zob. C-1 — bez łamania arkusza poziom L2 jest nieużywalny na sieci większej niż kilkanaście stacji. |
| C-6 | **[ZAMKNIĘTE 2026-08-06, karta S9-7/8 — rejestr `S9-7-8`]** **Skracanie etykiet do nieczytelności.** Na L1 sieci dużej **88 z 535** etykiet jest skróconych; na L0 kody stacji redukują się do `S…`, a w kilku miejscach do mylących form `S1…`, `S2…`, `S400`, `S630` (te dwie ostatnie wyglądają jak moce transformatorów, nie jak nazwy stacji). | wypis tekstów kanwy (spec `03-pasek`) | CAD, PSN | 2 | Skracanie ma zachowywać człon rozróżniający (numer stacji), a nie ucinać od prawej. |
| C-7 | **[ZAMKNIĘTE 2026-08-06, karta S9-7/8; ZWERYFIKOWANE POMIAROWO 2026-08-07, karta S9-12. Kadr auto-fit liczony w PROSTOKĄCIE BEZPIECZNYM: `SLD_CANVAS_DOCK_INSETS` (`canvas/toolbarLayout.ts`) rezerwuje pasy górny i dolny po 40 px (margines doku 12 + rząd kontrolek 28 — stałe liczone z kontraktu doków, nie wpisane ręcznie), zasilając mechanizm `SafeInsets` kamery; panel boczny „wnętrze stacji" (do 760 px) podawany stanowo przez wołającego. Przypięte testem kontraktowym `canvas/__tests__/obszarBezpieczny.contract.test.tsx` — iloczyn cech {LOD} × {zasłona: same doki / doki + panel}; zero zmian scen (odciski kosztSceny bajtowo zielone — pomiar S9-12: bramka `accept:sld-v3` i pin `kosztSceny.test.ts` nietknięte]** **Doki narzędzi zasłaniają rysunek.** Przyciski „Dowody (8)" (lewy dolny) i „Warstwy (6)" (prawy dolny) leżą NA opisach obiektów — na zrzucie L2 przecinają napisy „…ysłowa 1 MVA, 4 odpływy nN" oraz „Turbina wiatrowa 1…". | `czytelnosc-srednia-L2-ciemny.png`, `czytelnosc-srednia-L2-jasny.png` | CAD, UX | 2 | Doki mają rezerwować margines rysunku (obszar bezpieczny), a nie pływać nad nim. |
| C-8 | **[ZAMKNIĘTE 2026-08-06 (S9-7/8) + 2026-08-07 (S9-12). S9-7/8: opis sekcji stacji niesie KOD STACJI z danych jako człon wiodący (`stationBusbarLabelText` + `stationCode`) — pomiar S9-12 na fixturze referencyjnej: 53/53 etykiet sekcji stacji RÓŻNYCH na L1 i L2 („S01 · Sekcja 1 · 15 kV"…), unikalność przypięta asercją wprost w `busbar_label_probe` (Set tekstów == liczba etykiet przy 53 stacjach w kadrze). S9-12 domknął KLASĘ „identyczny opis dwóch obiektów": szyna nN PRODUCENTA DER pożyczała gramatykę SEKCJI („Sekcja 1 · 0,4 kV" — semantycznie fałszywe i identyczne między dwoma torami DER w kadrze) → teraz gramatyka nN („Szyna nN · 0,4 kV", jedna prawda z wierszem nN stacji) + parowanie etykieta↔szyna producenta w `busbarLabelGaps` (przed kartą wyrocznia fałszywie flagowała ją jako `label-without-bus`); sekcje GPZ (numerowane per sekcja, jeden GPZ/projekt) i wiersz nN pasma nazw stacji (kontekst tożsamości bloku) — poza naprawą z uzasadnieniem]** **Dwa różne obiekty z identycznym opisem w jednym kadrze.** Na L2 widoczne są jednocześnie dwie etykiety „Sekcja 1 · 15 kV" należące do różnych stacji — bez członu identyfikującego stację. | `czytelnosc-srednia-L2-ciemny.png`; zrzuty `s9-12-pokazowa-L2-{ciemny,jasny}.png` | ZW, CAD | 2 | Opis sekcji musi nieść identyfikator stacji (np. „S08 · Sekcja 1 · 15 kV"). |
| C-9 | **[ZAMKNIĘTE 2026-08-06, karta S9-7/8; ZWERYFIKOWANE 2026-08-07, karta S9-12. Człon napięcia na etykiecie przęsła niesie oznacznik `Un=` („S08 ↔ S09 · YAKXS 3×120/16 · **Un=20 kV** · l = 50 m" — `layout/lineLabel.ts` `formatRatedVoltageKv`, przypięte `lineLabel.test.ts`); pomiar S9-12: 46 etykiet z `Un=` na fixturze referencyjnej L2, zero gołych „N kV" na przęsłach. Wybór formatu ROZSTRZYGNIĘTY DANYMI (weryfikacja katalogu S9-12): katalog kabli (`backend/.../catalog/types.py` `CableType`, `mv_cable_line_catalog.py`) niesie JEDNĄ wartość `voltage_rating_kv` (np. 20,0) i NIE niesie U₀ — para „U₀/U 12/20 kV" z audytowej propozycji byłaby fabrykacją danej, której model nie ma; `Un=` jednoznacznie znakuje daną katalogową izolacji względem napięcia pracy sekcji („15 kV") bez zgadywania]** **Napięcie znamionowe kabla podane obok napięcia pracy bez rozróżnienia.** Opis odcinka brzmi „S08 ↔ S09 · YAKXS 3×120/16 · **20 kV** · l = 50 m", a sekcja obok „Sekcja 1 · **15 kV**". Czytelnik nie wie, czy to niezgodność modelu, czy dane katalogowe kabla. | `czytelnosc-srednia-L2-ciemny.png`; zrzuty `s9-12-pokazowa-L2-*.png` | ZW, PSN | 2 | Napięcie znamionowe izolacji kabla oznaczyć jednoznacznie (np. `U₀/U 12/20 kV`) albo usunąć z opisu przebiegu. |
| C-10 | **Zgodność symboli z IEC 60617 na poziomie L2 jest dobra** (obserwacja pozytywna): transformator dwuuzwojeniowy jako dwa okręgi, odłącznik `Q1`, uziemnik `QE1`, ogranicznik przepięć jako trójkąt, generator jako okrąg `G`, szyna jako gruba kreska; role pól opisane po polsku („pole transformatorowe", „pole pomiarowe", „pole liniowe"). **(opinia)** rysunek na L2 wygląda jak rysunek wykonawczy. | `czytelnosc-srednia-L2-ciemny.png` | CAD | — | — |
| C-11 | **Declutter działa poprawnie** (obserwacja pozytywna): liczba nachodzących na siebie prostokątów etykiet wynosi **0** na wszystkich sześciu kombinacjach sieć × poziom; system uczciwie melduje „Ukryto N opisów — przybliż, aby zobaczyć". | pomiar `kolizjeEtykiet` = 0 (6/6) | CAD | — | — |
| C-12 | **Motyw jasny na kanwie jest poprawny** (obserwacja pozytywna): tło `rgb(255,255,255)`, rysunek ciemnozielony — czytelny jak wydruk CAD; motyw ciemny `rgb(11,15,20)`. Oba motywy potwierdzone pomiarem `background-color` kanwy po realnym przełączeniu. | `czytelnosc-srednia-L2-jasny.png` vs `czytelnosc-srednia-L2-ciemny.png` | CAD | — | — |
| C-13 | **[ZAMKNIĘTE 2026-08-07, karta S9-12 — POMIAR ROZSTRZYGAJĄCY: stopniowanie ISTNIEJE (wprowadzone kartami F13.1/F13.4 + wzmocnienie ekranowe S9-7/8). `SEGMENT_STROKE_WIDTH` (`compose/preview.tsx`): szyna GPZ **6** > szyna stacji **4** > magistrala `snTrunk` **2,4** > odgałęzienie/tor pola `sn` **1,6** > obwód nN `lv` **1,2** > adnotacje ≤ **0,8** px świata — magistrala : odgałęzienie = **1,5 : 1** (audyt mierzył 4/1,6 bez rozróżnienia magistrali od odgałęzienia — klasa `snTrunk` na trasie ciągu głównego dokłada brakujący szczebel). Podłoga ekranowa S9-7/8 (`MIN_TRUNK_STROKE_SCREEN_PX`=1,5, mnożnik JEDNORODNY): na przeglądzie (skala 0,13) ekranowo 3,75 / 2,50 / **1,50** / **1,00** / 0,75 px — trzy sąsiednie rangi rozróżnialne samą wagą przy zachowanym ilorazie; przypięte `stroke_rank_probe` (accept:sld-v3) i `trunk_thickness_probe`]** **Hierarchia grubości linii jest zbyt płaska.** Szyna stacji ma obrys 4 px, wszystkie tory pól i aparaty 1,6 px; magistrala SN i odgałęzienie nie różnią się grubością. Na rysunku sieciowym nie da się odróżnić magistrali od odgałęzienia bez czytania opisu. | pomiar `strokeWidth` (spec `22-klik2`): `station#sn-bus` = 4 px, `sn_field/*` = 1,6 px; pomiar S9-12 (`segmentStrokeWidthForScale`) | CAD, PSN | 2 | Wprowadzić stopniowanie grubości wg rangi toru (magistrala > odgałęzienie > pole > nN). |

---

## 3. E-PRACA NA SCHEMACIE

### 3.1 Płynność (pomiar licznikiem `requestAnimationFrame` wewnątrz strony)

Sieć duża (51 stacji), gest wykonywany realną myszą Playwright.

| Gest | Klatek | Mediana | p95 | Max | Klatki > 33 ms | Klatki > 100 ms |
|------|--------|---------|-----|-----|----------------|-----------------|
| przeciąganie (pan), 40 kroków / 2,07 s | 124 | 15,9 ms | 30,0 ms | 32,7 ms | **0** | 0 |
| zoom kółkiem, 30 kroków / 5,81 s | 185 | 16,9 ms | **94,9 ms** | **276,1 ms** | **43 (23 %)** | **8** |

Przejścia poziomu przy zoomie: `L0→L1` na kroku 14 (**303 ms**), `L1→L2` na kroku 18 (**371 ms**).

### 3.2 Znaleziska

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| P-1 | **[ZAMKNIĘTE 2026-08-06, karta S9-4]** **Klik w element schematu w większości przypadków nic nie zaznacza.** Sonda siatkowa: 96 natywnych klików pokrywających widoczny odcinek szyny SN stacji i jej pola; kursor był nad elementem rysunku w 12 punktach, a zaznaczenie nastąpiło tylko w **3 z tych 12 (25 %)**. Ten sam prostokąt pola `sn_field/002` raz się zaznacza (`y=698`, `y=717`), raz nie (`y=623`, `y=642`, `y=679`). | pomiar `praca-sonda-siatkowa` | UX, PSN | **3** | Ujednolicić trafienie: jeden przezroczysty obszar trafienia na obiekt (min. 24 px), zamiast polegania na geometrii kreski. |
| P-2 | **[ZAMKNIĘTE 2026-08-07, karty S9-4 + S9-10. S9-4: klik niesie `ownerRef` KLIKNIĘTEGO obiektu, a każdy obiekt kanwy ma niepowtarzalną tożsamość (naprawa u źródła w `compose/gpz.ts`). S9-10 (dług `S9-4-DLUG-INSPEKTOR`): scena przenosi `deviceRef` pojedynczego aparatu (`PreviewElementMeta.deviceRef`, WYŁĄCZNIE ścieżka danych — zero fabrykacji), klik niesie go do inspektora (`SldElementClickMeta.deviceRef`), warstwa trafień eksponuje `data-hit-device-ref`, a budowniczy szuflady rozwiązuje PO NIM stan aparatu / identyfikator globalny — dwa aparaty jednego pola dają DWIE różne treści inspektora (test natywnej ścieżki `deviceRefInspektora.test.tsx`). Domknięta też karta następcza S9-4: wspólny pomocnik `compose/unikalnyTestId.ts` objął aparaty i adnotacje STACJI oraz adnotacje GPZ w `scene/buildScene.ts` (dwa odłączniki jednego pola przestały dzielić `testId`)]** **Inspektor nie rozróżnia klikanych obiektów.** We wszystkich udanych zaznaczeniach (sonda siatkowa oraz 8 klików w różne pola trzech różnych stacji) inspektor pokazał **jeden i ten sam** opis „Transformator SN/nN" — także po kliknięciu w identyfikator uziemnika (`apparatus-id-earthSwitch-lateral-1`) i w pole pomiarowe. Liczba różnych treści inspektora: **1** na 8 klików w różne obiekty. | pomiary `praca-ziarnistosc-zaznaczenia`, `praca-inspektor-rozroznialnosc`, `praca-sonda-siatkowa`; `praca-zaznaczenie-inspektor.png` | ZW, PSN | **3** | Zaznaczenie musi nieść `owner-ref` klikniętego aparatu, a inspektor renderować obiekt wskazany tym `ref`. |
| P-3 | **[ZAMKNIĘTE 2026-08-06, karta S9-4]** **Aparaty rysowane kreską są niekilkalne.** Cztery kliki wykonane DOKŁADNIE na geometrii ścieżki (punkt liczony przez `getPointAtLength` + `getScreenCTM`) — uziemnik, przekładnik napięciowy, zejście pola — nie dały zaznaczenia; obrys tych elementów ma 1,6 px. | pomiar `praca-klik-na-kresce` | UX, ZW | **3** | Dodać niewidoczny obrys trafienia (`stroke-width` trafienia ≫ obrys rysunku) dla elementów liniowych. |
| P-4 | **[ZAMKNIĘTE 2026-08-07, karty S9-9 + S9-12 (pomiar domykający). S9-9: sceny wszystkich trzech LOD liczone RAZ na migawkę (`useMemo` po `snapshot`), przejście LOD w geście = odczyt z mapy; plan etykiet przeliczany indeksem przestrzennym (8,9–25× szybciej). POMIAR S9-12 kosztu przejścia poziomu (scena z mapy + plan etykiet, mediana z 5): odczyt sceny z mapy **~0,00 ms**; plan `L0→L1` @ skali progu 0,6 = **3,8 ms** (54 stacje) / **4,2 ms** (93 stacje); plan `L1→L2` @ 1,2 = **0,4 ms** — wobec 303/371 ms z audytu kryterium <100 ms spełnione z zapasem dwóch rzędów wielkości. Uczciwie: pomiar synchronicznych przeliczeń wątku głównego (jak §5A.2), nie pełnej klatki przeglądarki z rasteryzacją]** **Zoom szarpie, przejścia poziomu zamrażają obraz.** 23 % klatek przy zoomie przekracza 33 ms, 8 klatek przekracza 100 ms, a same przejścia `L0→L1` i `L1→L2` trwają **303 ms** i **371 ms** — przy 51 stacjach to widoczne zacięcie przy każdym przekroczeniu progu. | pomiar `praca-zoom-duza`; pomiar S9-12 (`planSceneLabels` na progach 0,6/1,2) | UX | 2 | Przeliczać scenę poziomu poza ścieżką gestu (praca w tle / pamięć podręczna sceny), zamiast w klatce zoomu. |
| P-5 | **Przeciąganie (pan) jest płynne** (obserwacja pozytywna): mediana 15,9 ms, **zero** klatek powyżej 33 ms na sieci 51 stacji. | pomiar `praca-pan-duza` | UX | — | — |
| P-6 | **[ZAMKNIĘTE 2026-08-06, karta S9-4: „tło" = brak uchwytu pod kursorem, klik w tło CZYŚCI zaznaczenie]** **Klik w tło zaznacza obiekt.** W sondzie siatkowej zaznaczenie nastąpiło w 22 punktach, podczas gdy tylko 12 punktów leżało nad elementem rysunku — co najmniej 10 zaznaczeń pochodzi z kliku w pustą przestrzeń arkusza. | pomiar `praca-sonda-siatkowa` (`klikowZakonczonychZaznaczeniem`=22 vs `punktowNadElementemRysunku`=12) | UX | 2 | Klik w tło ma czyścić zaznaczenie, nie ustawiać go. |

### 3.3 Menu kontekstowe kanwy

Prawy przycisk myszy **nie otwiera menu kontekstowego schematu** — ani nad elementem, ani nad
tłem. Wykryte pozycje `sld-menu-*` (`Wstaw główny punkt zasilania`, `Otwórz katalogi techniczne`,
`Pokaż kontrolę konfiguracji`) należą do **stanu pustego** kanwy (`sld-empty-state`), a nie do
menu kontekstowego; są w drzewie także wtedy, gdy sieć ma 16 stacji.

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| P-7 | **[ZAMKNIETE 2026-08-06, karta S9-5: menu kontekstowe otwiera sie na TRAFIONYM obiekcie (warstwa trafien S9-4), a jego kategoria wynika z obiektu MODELU zakotwiczonego pod rysunkiem — nie z kreski]** **Brak menu kontekstowego kanwy.** Prawy klik w element i w tło nie ujawnia żadnego menu operacji schematu (wstaw stację na odcinku, rozpocznij odgałęzienie, dodaj OZE, właściwości). Jedyne pozycje `sld-menu-*` w DOM to akcje stanu pustego. | pomiary `budowa-menu-kontekstowe-element`, `budowa-menu-kontekstowe-tlo`; `budowa-menu-kontekstowe.png` | PSN, UX | **3** | Dodać menu kontekstowe kanwy z operacjami zależnymi od trafionego obiektu (odcinek / pole / stacja / tło). |
| P-8 | **[ZAMKNIĘTE 2026-08-07, karta S9-11: pustość modelu z JEDNEGO źródła (`ui/topology/pustoscModelu`, werdykt trójstanowy — brak migawki to pustość NIEUSTALONA, nie pusty model); stan pusty montowany WYŁĄCZNIE przy werdykcie 'pusty'; trzej niezależni czytelnicy pustości (kanwa v3, pas „następny krok", orkiestrator legacy) przełączeni na wspólne źródło, a lista rodzin elementów domknięta względem kontraktu żywego backendu (+`shunt_capacitors`, `connection_nodes`) i przypięta testem]** **Akcje stanu pustego są w drzewie mimo niepustego modelu.** `sld-empty-state`, `sld-empty-state-insert-gpz`, `sld-empty-state-open-catalogs` obecne przy 16 i 51 stacjach. | wypis `data-testid` po otwarciu przypadku (spec `00-rekonesans`) | UX | 1 | Montować stan pusty warunkowo, żeby nie zaśmiecał drzewa i wyszukiwania. |

---

### 3.4 Domknięcie P-1 / P-3 / P-6 (karta S9-4, 2026-08-06)

**Jedna przyczyna dla całej klasy** (diagnoza sondą siatkową na fixturze goldenowej
53 stacji, nie z lektury kodu): obszar trafienia nie był własnością obiektu, tylko
przypadkową konsekwencją grubości kreski i kolejności malowania.

| # | Ogniwo | Co było | Skutek |
|---|--------|---------|--------|
| 1 | rozmiar celu | hitboxy w jednostkach ŚWIATA (stała 12 j.św. na torze, gabaryt symbolu) | 7,2 px ekranu przy skali 0,6 i 36 px przy 3,0; najmniejszy aparat 1,8 px przy skali dopasowania |
| 2 | etykiety i nakładki | brak uchwytu, ale PEŁNE malowanie | napis łapał zdarzenie i nie robił z nim nic — klik „znikał" zamiast trafić w obiekt pod spodem (do 1137 napisów na L2) |
| 3 | rozstrzyganie | jeden przebieg (kolejność malowania) | poszerzony cel symbolu zjadał kliki w szynę biegnącą pod nim |
| 4 | tło | brak definicji (żadnego handlera na korzeniu) | klik w pusty arkusz nie czyścił zaznaczenia |

**Odbiór — sonda siatkowa** (oczekiwanie ze SCENY, rozstrzygnięcie z wyrenderowanego
DRZEWA; iloczyn cech {10 rodzajów obiektu} × {LOD 0/1/2} × {zoom mały/duży}):

| Poziom · zoom | Skuteczność przed → po | Obiekty poniżej 24 px przed → po |
|---------------|------------------------|----------------------------------|
| L0 · mały | 77,2 % → **100,0 %** | 237 → **0** |
| L0 · duży | 76,9 % → **100,0 %** | 184 → **0** |
| L1 · mały | 79,3 % → **100,0 %** | 1827 → **0** |
| L1 · duży | 71,4 % → **100,0 %** | 1952 → **0** |
| L2 · mały | 67,4 % → **100,0 %** | 2146 → **0** |
| L2 · duży | **55,7 %** → **100,0 %** | 2516 → **0** |

Klasa „etykieta": **0,0 % → 100,0 %** na każdym poziomie (przed kartą 0 uchwytów).

Zrzuty: `audyt-2026-08/s9-4-{stacja,aparat,transformator,szyna,tor,lacznik-wiersza,etykieta,znacznik-wyniku}-{ciemny,jasny}.png`
(16 plików — punkt kliku, obszar trafienia i wskazany `ownerRef` dla każdego rodzaju obiektu, oba motywy).

---

## 4. E-BUDOWA SIECI

### 4.1 Wejście w budowę (pusty przypadek)

Stan pusty kanwy jest **prowadzący i poprawny**: tytuł „Schemat jednokreskowy", zdanie celu
(„Wybierz wariant GPZ i rozpocznij ciąg SN"), opis następnych kroków oraz dwa wyjścia —
*Wstaw Główny Punkt Zasilający* i *Przeglądaj katalogi techniczne*.

**Jeden klik** w „Wstaw Główny Punkt Zasilający" otwiera kreator GPZ o siedmiu krokach:
`1 Identyfikacja` · `2 Źródło i strona WN` · `3 Transformatory` · `4 Rozdzielnia SN` ·
`5 Sekcje i pola` · `6 Parametry normowe` · `7 Podsumowanie i zapis`, z jawnymi
`← Wstecz` / `Dalej →` / `Anuluj` / `Zapisz GPZ`. Pasek kontekstu natychmiast przechodzi na
`Faza projektu: GPZ · Układ: GPZ · Następny krok: wybór GPZ`.

### 4.2 Stabilność inkrementalna layoutu

Metoda: sieć 9 stacji / 16 odcinków; położenia **w układzie świata** (nie ekranu — kamera
między otwarciami może stanąć inaczej) zapisane per `data-owner-ref` przed wstawieniem
stacji na **środkowym** odcinku magistrali i po nim; porównanie elementów wspólnych.

| Miara | Wartość |
|-------|---------|
| elementów przed / po | 39 / 42 |
| wspólnych | 38 |
| nieruchomych (< 0,5 j.św.) | 17 |
| przesuniętych ≥ 1 j.św. | 21 |
| przesuniętych ≥ 50 j.św. | 16 |
| mediana przesunięcia | 2,4 j.św. |
| maksimum przesunięcia | **752 j.św.** (`dx = +752`, `dy = 0` — identycznie dla wszystkich 16) |

### 4.3 Znaleziska

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| B-1 | **Wstawienie stacji NIE rozsypuje układu** (obserwacja pozytywna): cały ogon magistrali przesuwa się o **dokładnie tę samą** wartość `+752` w osi X przy `dy = 0`; brak przetasowań, brak ruchu w pionie, brak zmiany kolejności. Zachowanie deterministyczne i przewidywalne. | pomiar `budowa-stabilnosc-layoutu`; `budowa-stabilnosc-przed.png` / `budowa-stabilnosc-po.png` | PSN, CAD | — | — |
| B-2 | **Ogon przesuwa się o pełną szerokość stacji, więc obraz skacze.** Przesunięcie 752 j.św. przy jednokreskowym pasie (C-1) oznacza, że po wstawieniu stacji cała prawa część rysunku wyjeżdża z kadru; przy sieci 51 stacji rysunek ma już 66 tys. px, więc kamera nie nadąża za miejscem edycji. | pomiar jw. + tabela 2.1 | PSN, UX | 2 | Po wstawieniu utrzymać kamerę na obiekcie wstawionym (zakotwiczenie widoku na zmianie). |
| B-3 | **Stan pusty i kreator GPZ są dobrze poprowadzone** (obserwacja pozytywna): 1 klik do kreatora, 7 nazwanych kroków, jawne „następny krok" w pasku kontekstu. | `budowa-stan-pusty.png`, `budowa-po-kliku-wstaw-gpz.png` | UX, PSN | — | — |
| B-4 | **[ZAMKNIETE 2026-08-06, karta S9-5: ciag SN buduje sie z rysunku — „Wyprowadz ciag glowny SN” i „Rozpocznij odgalezienie” na zrodle GPZ i na szynie sekcji, „Zakoncz odcinek stacja SN/nN” na odcinku, „Kontynuuj ciag” / „Rozpocznij odgalezienie” na stacji; e2e: 15 stacji zbudowanych wylacznie prawym klikiem]** **Dalsza budowa nie ma ścieżki na kanwie.** Po wstawieniu GPZ na kanwie są tylko trzy przyciski układów DER (`+ PV`, `+ BESS`, `+ FW`). Operacji, które faktycznie budują sieć SN — *wstaw stację na odcinku*, *przedłuż magistralę*, *rozpocznij odgałęzienie* — nie ma ani na pasie narzędzi, ani w menu kontekstowym (P-7); wykonalne są wyłącznie przez API/kreatory poza schematem. | wypis afordancji `budowa-afordancje-pusty`; pomiary menu kontekstowego (P-7) | PSN | **3** | Dodać na kanwie operacje ciągu SN (odcinek / stacja na odcinku / odgałęzienie) obok palety DER. |
| B-5 | **[CZĘŚCIOWO ZAMKNIĘTE 2026-08-07, karta S9-9: koszt `apply` niższy o 35–47 %, ale nadal LINIOWY — pełne uniezależnienie od rozmiaru sieci wymaga decyzji kontraktowej, patrz §5A]** **Koszt operacji rośnie liniowo z rozmiarem sieci.** Czas `POST /station-templates/{id}/apply` rośnie z **21 ms** (1. stacja) do **550 ms** (50. stacja), mediana 257 ms, maksimum 698 ms; `continue_trunk_segment_sn` analogicznie 9 → 593 ms. Budowa 50 stacji ma przez to koszt kwadratowy. | pomiar budowy sieci (`build-networks`) | PSN, UX | 2 | Operacja domenowa nie powinna przeliczać całego modelu — koszt ma zależeć od zasięgu zmiany. |

---

## 5. E-WYNIKI NA SCHEMACIE

### 5.1 Przebieg badania

Bieg uruchamiany **realnym przyciskiem „Oblicz"** w powłoce. Backend policzył poprawnie:
`POST /api/cases/{case}/runs/short-circuit` zwraca **32 wiersze** z kompletem wielkości
IEC 60909 (`ikss_a`, `ip_a`, `ith_a`, `ib_a`, `sk_mva`, `kappa`, `zkk_ohm`, `c_factor`,
`contributions`), a `results/index` odpowiada `200`.

### 5.2 Znaleziska

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| W-1 | **Wyniki NIE pojawiają się na schemacie.** W stanie poprawnym (`#sld?run=…`, kanwa stabilna, pochodzenie nakładki związane z biegiem) zmierzono: **0 etykiet wynikowych, 0 strzałek rozpływu, 0 strzałek zwarciowych, brak znacznika punktu zwarcia** — zarówno na L0, jak i na L2. Rysunek po biegu jest identyczny jak przed biegiem. **ZAMKNIĘTE kartą S9-2 (2026-08-06)** — patrz §5.3. | pomiar `wyniki-nakladka-poprawny-stan`; `wyniki-nakladka-L0.png`, `wyniki-nakladka-L2.png` (porównaj z `czytelnosc-srednia-L2-ciemny.png`) | ZW, PSN | **3** | Podłączyć warstwę `sld-v3-result-labels` do wyniku wskazanego przez `run` — dane są w backendzie, a wiązanie już istnieje. |
| W-2 | **Pasek pochodzenia nakładki działa** (obserwacja pozytywna): po biegu pokazuje „Moduł: zwarcie trójfazowe · Przebieg: `61603f65…` · Czas ukończenia: 6.08.2026, 07:07:18" — czyli wiązanie wynik↔rysunek istnieje, brakuje samego rysowania wartości. | pomiar jw. | ZW | — | — |
| W-3 | **[ZAMKNIĘTE 2026-08-07, karty S9-3 + S9-11: S9-3 podporządkował odroczony skok nawigacji użytkownika (`nawigujAutomatycznie`), S9-11 zlikwidował klasę strukturalnie — tor biegu nie nawiguje WCALE (inwariant przypięty testem źródła toru); inwentarz klasy „nawigacja po zdarzeniu asynchronicznym" w rejestrze S9-11]** **Pułapka nawigacji: pierwszy powrót na schemat jest cofany.** Po biegu klik „Schemat (SLD)" przechodzi na `#sld` i kanwa montuje się (96 elementów `sld-v3-*` w 303 ms), a po **~2,3 s** aplikacja SAMA wraca na `#analysis?run=…` i odmontowuje kanwę; stan utrzymuje się przez kolejne 35 s. **Dopiero drugi klik** zostaje (`#sld?run=…`). | pomiary `wyniki-pulapka-nawigacji` (ślad co 1 s) i `wyniki-domontowanie-po-powrocie`; `wyniki-pulapka-nawigacji.png` | UX | **3** | Usunąć odroczone przekierowanie na widok analizy po zakończeniu biegu (albo wykonać je raz, przed interakcją użytkownika). |
| W-4 | **[ZAMKNIĘTE 2026-08-07, karta S9-11: bieg NIE nawiguje wcale — projektant zostaje na miejscu, komunikat mówi, gdzie czeka wynik, nakładka na schemacie odświeża się sama (most S9-2 przez `setActiveRun`), a wyniki otwiera wyłącznie jawny klik (nawigacja przestrzeni / pas „następny krok" / deep-linki K3 z `?run=` świeżego biegu)]** **„Oblicz" wyprowadza projektanta ze schematu.** Klik natychmiast przenosi na `#analysis?run=…`; kanwa jest odmontowywana. Pętla „policz i zobacz na rysunku" nie domyka się w jednym miejscu pracy. | pomiar `wyniki-nakladka` (adres po kliku); `wyniki-po-kliku-oblicz.png` | UX, PSN | 2 | Bieg ma zostawiać projektanta tam, gdzie był, i sygnalizować gotowość wyniku bez wymuszonej nawigacji. |
| W-5 | **[ZAMKNIĘTE 2026-08-07, karta S9-11: jedno pole `useSnapshotStore.rewizjaBiezacegoModelu` (podgląd przebiegu go nie dotyka; zasila je każda odpowiedź o bieżącym modelu, w tym odczyt gotowości przy zimnym deep-linku) + jeden predykat `czyNieaktualne` dla chipu i nagłówka wyników; 5 miejsc klasy „liczę stan sam" przełączonych (chip, nagłówek, hook E15.2, pasek stanu, adapter magistrali); zgodność przypięta testem iloczynu stanów `jednaPrawdaStanuWynikow` — dług S9-3-DLUG-W5 spłacony bez zmiany backendu]** **Sprzeczne wskaźniki stanu wyników.** Pasek zakresu mówi „Wyniki: **nieustalone**", widok wyników oznacza zestaw jako „● **aktualne**", a pasek stanu podaje konkretny przebieg z datą. Trzy miejsca, trzy odpowiedzi. | `wyniki-pulapka-nawigacji.png` (oba wskaźniki w jednym kadrze) | ZW, UX | 2 | Jedno źródło prawdy o stanie wyników; pozostałe miejsca mają je czytać, nie liczyć samodzielnie. |
| W-6 | **[ZAMKNIĘTE 2026-08-07, karty S9-3 + S9-11: pas czyta fakt „istnieje zakończony bieg" tą samą funkcją co chrom (`ostatniZakonczonyPrzebiegPrzypadku`), po wyniku wskazuje ogląd na schemacie (nakładka) i w dowodach oraz prowadzi klikiem do przestrzeni wyników; S9-11 dołożył scenariusz W-4×W-6 — pas przełącza się NA MIEJSCU, bo bieg zostawia projektanta na schemacie]** **Nieaktualna podpowiedź „następny krok" po biegu.** Pas „NASTĘPNY KROK" nadal głosi „Model zawiera elementy — bramka gotowości wskaże, czy układ jest kompletny do obliczeń", mimo że obliczenia właśnie się wykonały. | `wyniki-nakladka-L2.png` | UX | 1 | Podpowiedź ma reagować na stan biegu (po wyniku: „obejrzyj wyniki na schemacie / w dowodach"). |
| W-7 | **Tabela wyników zwarciowych jest bardzo dobra** (obserwacja pozytywna): kolumny `Punkt zwarcia`, `Rodzaj zwarcia`, `Prąd zwarciowy początkowy Ik″ [kA]`, `Prąd udarowy ip [kA]`, `Prąd cieplny Ith [kA]`, `Moc zwarciowa Sk`, sekcja „Założenia" z `Metoda obliczeń IEC 60909`, `Współczynnik napięciowy c = 1,10`, `Czas cieplny 1,00 s`; nazwy punktów czytelne („Turbina wiatrowa 1 MW (Vestas V90)", „Stacja przemysłowa 1 MVA, 4 odpływy nN"). | `wyniki-pulapka-nawigacji.png` | ZW | — | — |
| W-8 | **Nakładka delta / porównanie A/B — stan faktyczny: nieosiągalna z kanwy.** Elementy `sld-v3-result-comparison` i `sld-v3-result-comparison-blocked` nie pojawiają się po biegu (obie treści puste), podobnie `sld-v3-result-filter-panel` (`false`) i `sld-v3-result-stale-badge` (pusty). Nie oceniam ich działania — odnotowuję, że po pojedynczym biegu nie da się ich wywołać z kanwy. | pomiar `wyniki-nakladka-poprawny-stan` | ZW | 2 | Osobna karta — wymaga dwóch biegów i jawnego wejścia w porównanie z poziomu schematu. |

### 5.3 Domknięcie W-1 (karta S9-2, 2026-08-06)

**Gdzie ginęła treść** (diagnoza pomiarem na żywym backendzie, nie z lektury kodu):

| # | Ogniwo | Co było | Skutek |
|---|--------|---------|--------|
| 1 | most refów rysunek ↔ wynik | `meta.busResultRef` istniał WYŁĄCZNIE dla szyn GPZ (ADAPTER-BUSREF, V12K-163). Szyny stacji noszą na rysunku ref kompozytowy (`${stationRef}#sn-bus`, `#lv-bus`), a symbol transformatora stacji — ref POLA. | dopasowanie 1 punktu z 3 (zwarcia) i 4 z 16 (rozpływ) |
| 2 | bramka przęseł `singleHopSegmentRefs` (F-1) | wymagała, by OBA końce odcinka rozwiązywały się do STACJI; ciąg SN kończy KAŻDY odcinek mufą (`INLINE_TERMINAL`) | zbiór PUSTY ⇒ zero strzałek rozpływu i zero etykiet gałęziowych na każdej realnej sieci |
| 3 | poziom przeglądu | `RESULT_LABEL_MAX_LINES_BY_LOD[0] = 0` | L0 nie pokazywał ŻADNEJ liczby |
| 4 | rozmieszczanie (declutter) | 8 kandydatów pozycji, wszystkie tuż przy kotwicy | jedyna policzona etykieta była na L2 UKRYWANA (`placements=0`, `hidden=1`) |

**Odbiór (żywa aplikacja, sieć GPZ + 3 stacje z szablonów, oba motywy):**

| Bieg | Poziom | Etykiety przed → po | Strzałki rozpływu przed → po | Znaczniki zwarcia przed → po |
|------|--------|---------------------|------------------------------|------------------------------|
| zwarciowy | L0 | 0 → **6** | — | 0 → **7** |
| zwarciowy | L2 | 0 → **6** | — | 0 → **7** |
| rozpływowy | L0 | 0 → **9** (+2 bloki zbiorcze) | 1 → **6** | — |
| rozpływowy | L2 | 2 → **17** (+2 bloki zbiorcze) | 1 → **6** | — |

Zrzuty: `audyt-2026-08/s9-2-{przed,po}-{zwarcia,rozplyw}-L{0,2}-{ciemny,jasny}.png` (16 plików).

**Równość „etykiety = punkty wyniku"** jest egzekwowana testem integracyjnym na fixturach z ŻYWEGO biegu:
bieg zwarciowy **3 punkty = 3 etykiety** (równość dosłowna), bieg rozpływowy **16 punktów = 10 etykiet
+ 6 punktów, których MODEL sam nie rysuje** (`Bus.meta.render_on_sld === false`: mufy ciągu, zaciski pól),
przy `withoutAnchor = 0`. Rachunek jest widoczny dla operatora w panelu filtrów warstwy wynikowej
(„Etykiety: X z Y punktów wyniku" + jawny powód braku pozostałych), więc brak etykiety ma NAZWANY powód,
a nie „po prostu nie widać".

---

## 5A. KOSZT OPERACJI I PŁYNNOŚĆ ZOOMU — pomiary karty S9-9 (2026-08-07)

Sieci: fixtura referencyjna `sldSubstrate52s` (54 stacje) oraz jej deterministyczne
zwielokrotnienia rodziną H (`synthLargeTrunk` — 107 i 160 stacji). Krzywa `apply` mierzona
na żywej końcówce `POST /api/station-templates/{id}/apply` przy budowie 105 stacji na
magistrali; mediany w przedziałach, żeby pojedyncze próbki nie decydowały o wyniku.

### 5A.1 Co pomiar OBALIŁ (hipoteza karty vs stan faktyczny)

Karta zakładała, że w geście zoomu przeliczana jest **scena poziomu szczegółu**. Pomiar
tego NIE potwierdził: wszystkie trzy sceny (L0/L1/L2) są liczone raz na migawkę
(`SldCanvasV3`, `useMemo` po `snapshot`), a przejście LOD jest wyłącznie odczytem z mapy.
Kosztem gestu okazał się **plan etykiet** (`canvas/labelLegibility.ts`), zależny od SKALI
kamery, więc przeliczany przy każdym kliknięciu kółka — i rozstrzygający kolizje przeglądem
liniowym całego zbioru przeszkód, czyli kwadratowo względem liczby etykiet.

### 5A.2 Ścieżka gestu — czas planu etykiet [ms, mediana z 3, L2, najgorsza skala]

| Sieć | etykiet | PRZED | PO | zysk |
|------|---------|-------|-----|------|
| referencyjna (54 stacje) | 1 137 | 128,5 | 14,5 | **8,9×** |
| podwojona (107 stacji) | 2 261 | 451,3 | 27,1 | **16,7×** |
| potrojona (160 stacji) | 3 385 | 1 026,8 | 40,7 | **25×** |

Obie kolumny to NAJGORSZA skala drabiny (najwięcej etykiet powiększonych), nie
skala najkorzystniejsza — porównanie jest w najtrudniejszym punkcie gestu.

Kryterium odbioru „zero klatek > 100 ms przy zoomie" **SPEŁNIONE** — z zapasem także na
sieci 3× większej od referencyjnej. Uczciwie: pomiar jest wykonany w środowisku testowym
(jsdom/Node), więc mierzy **czas przeliczeń synchronicznych wykonywanych przez wątek główny
między zdarzeniem gestu a renderem**, a nie pełną klatkę przeglądarki (bez układu,
rasteryzacji i rywalizacji o wątek). Budżet i test nieliniowości przypięte:
`ui/sld/v3/scene/__tests__/kosztSceny.test.ts`.

### 5A.3 Budowa sceny po operacji domenowej — 3 LOD razem [ms]

| Sieć | PRZED | PO | zysk |
|------|-------|-----|------|
| 54 stacje | 334 | 213 | 36 % |
| 107 stacji | 612 | 403 | 34 % |
| 160 stacji | 1 347 | 753 | 44 % |

Składowe: silnik etykiet (`declutterLabels`) na tym samym indeksie przestrzennym co plan;
formatery liczb (`Intl.NumberFormat`) jako stałe modułu zamiast budowanych na każde
wywołanie (5 000 wywołań: 140 ms → 3,4 ms).

### 5A.4 `apply` z kanwy — krzywa vs liczba stacji [ms, mediana przedziału]

| stacje | PRZED | PO | zysk |
|--------|-------|-----|------|
| 1–10 | 179 | 107 | 41 % |
| 11–30 | 363 | 190 | 48 % |
| 31–60 | 702 | 443 | 37 % |
| 61–90 | 1 046 | 598 | 43 % |
| 91–105 | 1 352 | 873 | 35 % |
| **suma budowy 105 stacji** | **82,1 s** | **49,9 s** | **39 %** |

### 5A.5 Kryterium NIESPEŁNIONE — nazwane wprost

„`apply` niezależne od liczby stacji" **nie zostało osiągnięte i nie jest osiągalne bez
decyzji kontraktowej.** Nachylenie krzywej (mediana 91–105 / mediana 1–10) wynosi 7,5×
przed i 8,2× po — koszt pozostaje LINIOWY. Powód jest strukturalny, nie implementacyjny:

1. **Kontrakt kopii granicznej** (TOPO-COPY, V12K-323/325): operacja domenowa robi prywatną
   kopię CAŁEGO modelu. Karta uczyniła tę kopię 2,6× tańszą (39,2 → 14,6 ms na 100 stacjach,
   `enm/kopia_graniczna.py`), ale kopia wartościowa jest z definicji O(n). Uniezależnienie
   wymagałoby współdzielenia strukturalnego — to zmiana kontraktu mutacji, zarezerwowana
   już w rejestrze V12K-325 jako „osobna decyzja kontraktowa".
2. **Kontrakt odpowiedzi operacji** (`_response`): każda operacja zwraca gotowość, widoki
   logiczne, parametry zmaterializowane i hasz układu — cztery przebiegi po CAŁYM modelu.
   Karta usunęła z tego przebiegu jedyny fragment KWADRATOWY (skanowanie odwołań do szyn
   dla każdej szyny pomocniczej z osobna → jeden przebieg, `_referenced_bus_refs`), ale
   same przebiegi liniowe są treścią kontraktu odpowiedzi.
3. **Materiał do wycofania w magazynie** (`enm/store.py`): kopia głęboka poprzedniego modelu
   jest mechanizmem poprawności („operacja meldująca błąd nie zostawia skutku", znalezisko
   P4 przeglądu 2026-08-01) i karta jej ŚWIADOMIE nie ruszyła — 62 ms na 100 stacjach.
   Usunięta została natomiast druga kopia z tej samej funkcji, służąca wyłącznie porównaniu
   hasza (60,9 → 0,02 ms, kopiowany sam nagłówek).

**Dług do rozstrzygnięcia produktowego:** pełne uniezależnienie `apply` od rozmiaru sieci =
współdzielenie strukturalne modelu + przyrostowe liczenie gotowości/widoków logicznych.
Oba wymagają zmiany kontraktów, nie optymalizacji.

---

## 6. E-EKSPORT ARKUSZA

### 6.1 Oferta i wynik

Menu „Eksportuj schemat ▾" oferuje **sześć formatów**:
`SVG (light_technical).svg` · `PDF (tytułowy blok).pdf` · `PNG (raster).png` ·
`DXF (CAD).dxf` · `SCD (IEC 61850).scd.xml` · `CIM (IEC 61970/61968).cim.xml`.

| Format | Pobranie | Wynik pomiaru |
|--------|----------|---------------|
| SVG | tak | `schemat_sld.svg`, 59 459 B, 51 `<text>`, 97 `<path>`, `viewBox="0 0 11784 808"`, ramka arkusza obecna, **tytułówki brak** |
| SVG + „Dołącz legendę" | tak | 64 439 B, 58 `<text>`, **legenda obecna**, tytułówki nadal brak |
| SVG (sieć duża) | tak | 185 965 B, `viewBox="0 0 43288 808"` → proporcja **53,6 : 1** |
| PDF | **nie** | brak pobrania w 45 s, **brak błędu konsoli, brak komunikatu UI, brak nowej karty** |
| PNG | **nie** | brak pobrania w 45 s, jw. |
| DXF | tak | `projekt_wariant.dxf`, **176 B** — sekcja `ENTITIES` **pusta** (`SECTION/ENTITIES/ENDSEC`) |

### 6.2 Znaleziska

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| E-1 | **[ZAMKNIĘTE 2026-08-06, karta S9-6: PDF zaimplementowany (wektorowy arkusz A3 poziomy, 358 717 B na fixturze goldenowej — był brak pliku); PNG USUNIĘTY z menu — raster nie jest bajt-deterministyczny i nie da się sprawdzić jego treści, uzasadnienie w `v3/export/formats.ts`]** **Eksport PDF i PNG to martwe kliknięcia.** Pozycje menu istnieją i są opisane („PDF (tytułowy blok)"), ale klik nie pobiera pliku, nie otwiera karty, nie zgłasza błędu w konsoli i nie wyświetla komunikatu. Zmierzone dwukrotnie, okno 45 s. | pomiary `eksport-format-pdf`, `eksport-format-png`, `eksport-sprawdzenie-pdf`; `eksport-formaty-menu.png` | CAD, UX | **3** | Zaimplementować oba tory albo usunąć pozycje z menu — martwa pozycja jest gorsza niż jej brak. |
| E-2 | **[ZAMKNIĘTE 2026-08-06, karta S9-6: 176 B / 0 encji → 616 000 B / 8 764 encje (LINE, CIRCLE, TEXT na zadeklarowanych warstwach); bramka „eksport bez encji = błąd" przypięta testem, ta sama bramka dla SCD i CIM, które miały tę SAMĄ wadę (169 B i 220 B)]** **DXF eksportuje PUSTY rysunek.** Plik jest formalnie poprawnym DXF (`AC1024`, tablica warstw), ale sekcja `ENTITIES` nie zawiera **ani jednej encji** — 176 bajtów przy 97 ścieżkach na ekranie. Wynik wygląda na udany, a w programie CAD otwiera się pusty arkusz. | pomiar `eksport-format-dxf` (pełna treść pliku) | CAD | **3** | Wypełnić `ENTITIES` geometrią sceny; dodać bramkę: eksport bez encji ma być błędem, nie plikiem. |
| E-3 | **[ZAMKNIĘTE 2026-08-06, karta S9-6: tabliczka rysunkowa z danymi WYŁĄCZNIE realnymi (projekt, przypadek, sieć, data i wersja modelu, liczba stacji, format arkusza); brak danej = puste pole z etykietą; jedna implementacja obsługuje SVG, PDF i DXF]** **Eksport SVG nie ma tytułówki.** Brak bloku tytułowego (projekt, przypadek, skala, data, rewizja, wersja modelu) — a wszystkie te dane są w powłoce (pasek stanu podaje `Model: rew. 33`, `Wersja modelu: acf9…edc9`). Rysunek bez tytułówki nie jest dokumentem projektowym. | pomiary `eksport-svg`, `eksport-z-legenda` (`maTytulowke: false`) | CAD | **3** | Dołożyć blok tytułowy do eksportu SVG (dane z powłoki, bez nowego źródła prawdy). |
| E-4 | **[ZAMKNIĘTE 2026-08-06, karta S9-6: wartość domyślna odwrócona]** **Legenda domyślnie wyłączona.** Pole „Dołącz legendę" startuje jako **niezaznaczone**, więc domyślny eksport arkusza nie ma legendy symboli; po zaznaczeniu legenda pojawia się poprawnie. | pomiar `eksport-z-legenda` (`domyslnieZaznaczone: false`) | CAD | 2 | Odwrócić wartość domyślną — rysunek techniczny domyślnie z legendą. |
| E-5 | **[ZAMKNIĘTE 2026-08-06: proporcję arkusza naprawiła karta S9-1 (łamanie arkusza), a karta S9-6 domknęła format docelowy — PDF wychodzi na JEDNEJ stronie A3 poziomej, rysunek wpasowany skalą jednorodną]** **Wyeksportowany arkusz jest niedrukowalny.** Sieć duża daje `viewBox 43288 × 808`, czyli proporcję **53,6 : 1**; przy zachowaniu wysokości to **38 arkuszy A3 poziomych** obok siebie. Sieć średnia — 14,6 : 1. | pomiar `eksport-duza` | CAD, PSN | **3** | Konsekwencja C-1: bez łamania rysunku na strony eksport nie ma formatu docelowego. |
| E-6 | **[ZAMKNIĘTE 2026-08-06, karta S9-6: jedna konwencja `schemat-sld_<projekt>_<przypadek>_rew<N>-<hash8>.<ext>` dla wszystkich formatów, deterministyczna (bez zegara)]** **Niespójne nazewnictwo plików.** SVG zapisuje się jako `schemat_sld.svg`, DXF jako `projekt_wariant.dxf` — dwie konwencje, żadna nie niesie nazwy projektu ani przypadku. | pomiary `eksport-svg`, `eksport-format-dxf` | CAD | 1 | Jedna konwencja nazw z nazwą projektu, przypadku i rewizją modelu. |
| E-7 | **Zestaw formatów jest ambitny i właściwy** (obserwacja pozytywna): obok rysunkowych (SVG/PDF/PNG/DXF) są formaty wymiany modelu — SCD (IEC 61850) i CIM (IEC 61970/61968). | `eksport-formaty-menu.png` | CAD, ZW | — | — |

---

## 7. RANKING TOP-10 wg wpływu na codzienną pracę projektanta

| # | Znalezisko | Dlaczego tak wysoko |
|---|------------|---------------------|
| 1 | **C-1 · Cała sieć jako jeden pas 53 : 1** | Źródło większości pozostałych problemów: niedrukowalny eksport (E-5), nieprzeglądalny poziom detalu (C-5), skoki przy edycji (B-2), pusty przegląd (C-3). Bez tego nic dalej nie będzie „jakością oczekiwaną". |
| 2 | **W-1 · Wyniki nie pojawiają się na schemacie** | Cel łańcucha „od budowy do prezentacji wyników" nie jest osiągany: solver liczy 32 punkty, rysunek pokazuje zero. |
| 3 | **P-1 + P-3 · Klik w element w większości nie zaznacza** | Podstawowa czynność (wskaż aparat) zawodzi w 3 na 4 próby, a elementy rysowane kreską są niekilkalne w ogóle. |
| 4 | **P-2 · Inspektor nie rozróżnia obiektów** | Nawet udane zaznaczenie prowadzi do tego samego opisu — schemat nie jest interfejsem do danych. |
| 5 | **W-3 · Pierwszy powrót na schemat jest cofany** | Po każdym biegu projektant musi kliknąć dwa razy, a między klikami widzi znikający rysunek. |
| 6 | **C-2 · Auto-fit nie mieści rysunku (47 % poza kanwą)** | Pierwsze wrażenie z projektu to rysunek ucięty z obu stron. |
| 7 | **E-1 + E-2 · PDF/PNG martwe, DXF pusty** | Trzy z sześciu ścieżek wydania dokumentacji nie działają, przy czym DXF **udaje** sukces. |
| 8 | **C-4 · Napisy arkusza 2 px** | Na przeglądzie sieci nie da się przeczytać ani jednego opisu, łącznie z opisem GPZ. |
| 9 | **B-4 + P-7 · Brak operacji budowy i menu kontekstowego na kanwie** | Schemat jest powierzchnią do oglądania, nie do budowania — sieć powstaje poza nim. |
| 10 | **E-3 · Eksport bez tytułówki** | Rysunek bez bloku tytułowego nie jest dokumentem, którym można posłużyć się w projekcie. |

**Podsumowanie liczbowe** (policzone z tabel, nie oszacowane): waga 3 — **16** znalezisk;
waga 2 — **13**; waga 1 — **3**; obserwacje pozytywne (bez wagi) — **9**. Razem **41** pozycji.

## 8. Propozycja programu kart S9

Kolejność wymuszona zależnościami: bez S9-1 karty rysunkowe i eksportowe nie mają na czym
pracować, bez S9-3 nie da się sensownie odebrać S9-2.

| Karta | Cel | Rozmiar | Zależy od |
|-------|-----|---------|-----------|
| **S9-1 · Łamanie arkusza** | Layout łamie magistralę na wiersze/strony arkusza o normowej proporcji (docelowo A3, 1,41 : 1) zamiast rozwijać ją w prawo; poziom przeglądu pokazuje bloki stacji. Odbiór: proporcja arkusza ≤ 2 : 1 dla 51 stacji, gęstość tuszu na przeglądzie > 5 %. | **L** | — |
| **S9-2 · Wyniki na rysunku** ✔ **WYKONANA (2026-08-06)** | Warstwa wynikowa rysuje wartości biegu wskazanego przez `run` (Ik″, ip, Ith przy punktach; kierunki i wartości rozpływu na gałęziach), z filtrem przekroczeń i znacznikiem punktu zwarcia. Odbiór: liczba etykiet wynikowych > 0 i zgodna z liczbą punktów wyniku — patrz §5.3. | **M** | S9-3 |
| **S9-3 · Domknięcie pętli obliczeń** | Usunięcie odroczonego przekierowania po biegu, jedno źródło prawdy o stanie wyników, aktualizacja podpowiedzi „następny krok". Odbiór: po biegu jeden klik wraca na schemat i tam zostaje. | **S** | — |
| **S9-4 · Trafienie i tożsamość zaznaczenia** ✔ **WYKONANA (2026-08-06)** | Jednolity obszar trafienia (min. 24 px) na obiekt, obrys trafienia dla elementów kreskowych, `owner-ref` klikniętego aparatu niesiony do inspektora. Odbiór: sonda siatkowa — ≥ 95 % klików nad elementem zaznacza TEN element. | **M** | — |
| **S9-5 · Menu kontekstowe i operacje budowy na kanwie** ✔ **WYKONANA (2026-08-06)** | Menu kontekstowe zależne od trafionego obiektu + operacje ciągu SN (odcinek, stacja na odcinku, odgałęzienie) dostępne z rysunku. Odbiór: budowa sieci 15 stacji wykonalna wyłącznie z kanwy. | **M** | S9-4 |
| **S9-6 · Eksport jako dokument** ✔ **WYKONANA (2026-08-06)** | Tytułówka w SVG/PDF, legenda domyślnie włączona, implementacja PDF i PNG albo usunięcie pozycji, wypełnienie `ENTITIES` w DXF + bramka „eksport bez encji = błąd", jedna konwencja nazw. Odbiór: każdy oferowany format zwraca plik z geometrią. | **M** | S9-1 |
| **S9-7 · Typografia i ramka arkusza** | Rozmiary napisów w pikselach ekranu (stała czytelność niezależna od skali), znaczniki stref zgodne z formatem arkusza, skracanie zachowujące człon rozróżniający. Odbiór: zero napisów < 8 px na każdym poziomie. | **S** | S9-1 |
| **S9-8 · Hierarchia i higiena rysunku** | Stopniowanie grubości linii wg rangi toru, obszar bezpieczny pod doki, identyfikator stacji w opisie sekcji, jednoznaczne oznaczenie napięcia znamionowego kabla. | **S** | S9-1 |
| **S9-9 · Koszt operacji i płynność zoomu** ✔ **WYKONANA (2026-08-07)** | Operacja domenowa o koszcie zależnym od zasięgu zmiany (dziś 21 → 550 ms); przeliczanie sceny poziomu poza ścieżką gestu. Odbiór: `apply` niezależne od liczby stacji, zero klatek > 100 ms przy zoomie. **Wynik: kryterium zoomu SPEŁNIONE (plan etykiet 1027 → 34 ms na 160 stacjach, 30×); kryterium „`apply` niezależne od liczby stacji" NIESPEŁNIONE i uczciwie nazwane — `apply` staniało o 35–47 % (1614 → 1167 ms na 100. stacji), ale pozostaje LINIOWE. Patrz §5A.** | **M** | — |
| **S9-10 · Trzy długi imienne fali S9** ✔ **WYKONANA (2026-08-07)** | (A) `S9-5-DLUG-E2E-CYKL`: pomiar na żywej aplikacji OBALIŁ blokadę „warstwa trafień nie wraca w ≤60 s" — po zapisie KAŻDEGO kreatora warstwa wraca w t = 0 s; pętla e2e domknięta (`test.fixme` zdjęty, pełny cykl GPZ → ciąg → stacja → ciąg dalej przechodzi na żywym backendzie). (B) `S9-4-DLUG-INSPEKTOR`: scena/klik/warstwa trafień przenoszą `deviceRef` aparatu; inspektor rozróżnia aparaty jednego pola (patrz P-2). (C) X-drift pól L1/L2: kotwica LEWA stacji IDENTYCZNA na L1/L2 dla 53/53 stacji (0 driftu); przesunięcia pól wewnętrznych (24–224 px, w tym 48 px) to skutek świadomie różnych szerokości kompozycji pól per LOD — ujednolicenie podziałki wymaga decyzji produktowej; niezmiennik kotwicy przypięty testem `kotwicaLodStacji.test.ts`. UBOCZNE (klasa S9-5 „kreator bez punktu startu"): „Rozpocznij odgałęzienie" otwierało martwy kreator na KAŻDEJ stacji/źródle/szynie — bramka `stationHasFreeBay` nie miała pisarza; zastąpiona `branchStartAvailable` liczonym TYM SAMYM resolverem co formularz. | **M** | S9-3, S9-4, S9-5 |

## 9. Odtworzenie pomiarów

Sieci budowane operacjami domenowymi API (rozdział 1). Zrzuty i pomiary z żywej aplikacji
przy `viewport 1600×1000`, `deviceScaleFactor 2`, oba motywy przełączane przyciskiem powłoki.
Nazwy pomiarów cytowane w kolumnach „Dowód" odpowiadają wpisom dziennika pomiarowego
wypisywanego przez specyfikacje audytowe (uruchamiane spoza repozytorium — audyt nie
zmienia kodu produktu).

### Spis zrzutów (`audyt-2026-08/`, 25 plików)

**Czytelność arkusza** — komplet L0/L1/L2 × dwie sieci × dwa motywy (12 plików):
`czytelnosc-duza-L{0,1,2}-{ciemny,jasny}.png`,
`czytelnosc-srednia-L{0,1,2}-{ciemny,jasny}.png`;
dodatkowo `czytelnosc-duza-L0-pasek-kadr.png` — kadr pasa rysunku sieci dużej
(dowód do C-1 i C-3).

**Budowa:** `budowa-stan-pusty.png`, `budowa-po-kliku-wstaw-gpz.png`,
`budowa-stabilnosc-przed.png`, `budowa-stabilnosc-po.png`, `budowa-menu-kontekstowe.png`.

**Praca na schemacie:** `praca-zaznaczenie-inspektor.png`;
S9-4 (trafienie i tożsamość): `s9-4-{stacja,aparat,transformator,szyna,tor,lacznik-wiersza,etykieta,znacznik-wyniku}-{ciemny,jasny}.png` (16 plików).
S9-5 (menu kontekstowe i budowa z kanwy): `s9-5-{tlo,zrodlo,tor,stacja,szyna,aparat,etykieta}-{ciemny,jasny}.png`
— menu otwarte NATYWNYM prawym klikiem na uchwycie trafienia, motyw przełączany realnym przyciskiem powłoki.

**Wyniki:** `wyniki-po-kliku-oblicz.png`, `wyniki-pulapka-nawigacji.png`,
`wyniki-nakladka-L0.png`, `wyniki-nakladka-L2.png`.

**Eksport:** `eksport-menu-narzedzia.png`, `eksport-formaty-menu.png`.
