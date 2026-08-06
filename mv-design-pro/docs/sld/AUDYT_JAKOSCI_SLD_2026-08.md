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
| C-1 | **Cała sieć jest rysowana jako JEDEN poziomy pas.** Sieć 51 stacji ma na arkuszu proporcję **53 : 1** na każdym poziomie szczegółu; 50 etykiet stacji `S01…S50` leży na jednej linii `y = 617`, ramka arkusza ma **109 kolumn stref i 2 wiersze (A, B)**. To nie jest arkusz rysunkowy — to taśma. | `czytelnosc-duza-L0-pasek-kadr.png` (kadr pasa: pozioma kreska + kody stacji, **zero symboli**), tabela 2.1 | CAD, PSN | **3** | Layout musi łamać magistralę na wiersze arkusza (serpentyna / strony) zamiast rozwijać ją w nieskończoność w prawo. |
| C-2 | **Widok otwarcia nie mieści rysunku.** Po otwarciu przypadku (auto-fit) rysunek sieci dużej rozciąga się `x ∈ [-159; 2005]` przy kanwie `x ∈ [262; 1584]` — **47 % symboli (26 z 55) i 43 % etykiet leży poza kanwą**, w tym opis GPZ. | pomiar `widocznosc-duza`; `czytelnosc-duza-L0-ciemny.png` | UX, PSN | **3** | Auto-fit ma dopasowywać obwiednię rysunku do kanwy w obu osiach, a nie tylko ustawiać skalę poziomu. |
| C-3 | **Przegląd sieci nie niesie żadnej informacji.** Na L0 gęstość tuszu wynosi **0,0 %** (duża) / 0,5 % (średnia), a w kadrze pasa widać wyłącznie kreskę i kody `S12…S40`. Projektant otwierający projekt nie widzi ani jednego symbolu. | `czytelnosc-duza-L0-pasek-kadr.png`, `czytelnosc-duza-L0-ciemny.png` | PSN, UX | **3** | Poziom przeglądu ma pokazywać schemat blokowy stacji (blok + typ + moc), a nie sam przebieg magistrali. |
| C-4 | **Typografia arkusza poniżej granicy czytelności.** Na L0 **114 ze 165** napisów ma wysokość **2 px** (CSS) — w tym opis GPZ „GPZ 15 kV · 110/15 kV", etykieta poziomu, podziałka i wszystkie 109 znaczników stref. Mediana wysokości tekstu = 2 px. | pomiar `czytelnosc-*-L0` (`tekstPonizej8px`, `tekstMinPx`) | CAD | **3** | Napisy ramki i opisy obiektów muszą mieć rozmiar w pikselach EKRANU (stała wielkość), niezależny od skali kamery. |
| C-5 | **Poziom pełnego detalu jest nieprzeglądalny.** Arkusz L2 sieci dużej ma **66 103 px** szerokości przy kanwie 1322 px — to **50 szerokości ekranu**; w widoku jest **17 z 701** symboli (2,4 %). Przejrzenie sieci na L2 wymaga 50 przewinięć. | tabela 2.1 | PSN, ZW | **3** | Zob. C-1 — bez łamania arkusza poziom L2 jest nieużywalny na sieci większej niż kilkanaście stacji. |
| C-6 | **Skracanie etykiet do nieczytelności.** Na L1 sieci dużej **88 z 535** etykiet jest skróconych; na L0 kody stacji redukują się do `S…`, a w kilku miejscach do mylących form `S1…`, `S2…`, `S400`, `S630` (te dwie ostatnie wyglądają jak moce transformatorów, nie jak nazwy stacji). | wypis tekstów kanwy (spec `03-pasek`) | CAD, PSN | 2 | Skracanie ma zachowywać człon rozróżniający (numer stacji), a nie ucinać od prawej. |
| C-7 | **Doki narzędzi zasłaniają rysunek.** Przyciski „Dowody (8)" (lewy dolny) i „Warstwy (6)" (prawy dolny) leżą NA opisach obiektów — na zrzucie L2 przecinają napisy „…ysłowa 1 MVA, 4 odpływy nN" oraz „Turbina wiatrowa 1…". | `czytelnosc-srednia-L2-ciemny.png`, `czytelnosc-srednia-L2-jasny.png` | CAD, UX | 2 | Doki mają rezerwować margines rysunku (obszar bezpieczny), a nie pływać nad nim. |
| C-8 | **Dwa różne obiekty z identycznym opisem w jednym kadrze.** Na L2 widoczne są jednocześnie dwie etykiety „Sekcja 1 · 15 kV" należące do różnych stacji — bez członu identyfikującego stację. | `czytelnosc-srednia-L2-ciemny.png` | ZW, CAD | 2 | Opis sekcji musi nieść identyfikator stacji (np. „S08 · Sekcja 1 · 15 kV"). |
| C-9 | **Napięcie znamionowe kabla podane obok napięcia pracy bez rozróżnienia.** Opis odcinka brzmi „S08 ↔ S09 · YAKXS 3×120/16 · **20 kV** · l = 50 m", a sekcja obok „Sekcja 1 · **15 kV**". Czytelnik nie wie, czy to niezgodność modelu, czy dane katalogowe kabla. | `czytelnosc-srednia-L2-ciemny.png` | ZW, PSN | 2 | Napięcie znamionowe izolacji kabla oznaczyć jednoznacznie (np. `U₀/U 12/20 kV`) albo usunąć z opisu przebiegu. |
| C-10 | **Zgodność symboli z IEC 60617 na poziomie L2 jest dobra** (obserwacja pozytywna): transformator dwuuzwojeniowy jako dwa okręgi, odłącznik `Q1`, uziemnik `QE1`, ogranicznik przepięć jako trójkąt, generator jako okrąg `G`, szyna jako gruba kreska; role pól opisane po polsku („pole transformatorowe", „pole pomiarowe", „pole liniowe"). **(opinia)** rysunek na L2 wygląda jak rysunek wykonawczy. | `czytelnosc-srednia-L2-ciemny.png` | CAD | — | — |
| C-11 | **Declutter działa poprawnie** (obserwacja pozytywna): liczba nachodzących na siebie prostokątów etykiet wynosi **0** na wszystkich sześciu kombinacjach sieć × poziom; system uczciwie melduje „Ukryto N opisów — przybliż, aby zobaczyć". | pomiar `kolizjeEtykiet` = 0 (6/6) | CAD | — | — |
| C-12 | **Motyw jasny na kanwie jest poprawny** (obserwacja pozytywna): tło `rgb(255,255,255)`, rysunek ciemnozielony — czytelny jak wydruk CAD; motyw ciemny `rgb(11,15,20)`. Oba motywy potwierdzone pomiarem `background-color` kanwy po realnym przełączeniu. | `czytelnosc-srednia-L2-jasny.png` vs `-ciemny.png` | CAD | — | — |
| C-13 | **Hierarchia grubości linii jest zbyt płaska.** Szyna stacji ma obrys 4 px, wszystkie tory pól i aparaty 1,6 px; magistrala SN i odgałęzienie nie różnią się grubością. Na rysunku sieciowym nie da się odróżnić magistrali od odgałęzienia bez czytania opisu. | pomiar `strokeWidth` (spec `22-klik2`): `station#sn-bus` = 4 px, `sn_field/*` = 1,6 px | CAD, PSN | 2 | Wprowadzić stopniowanie grubości wg rangi toru (magistrala > odgałęzienie > pole > nN). |

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
| P-1 | **Klik w element schematu w większości przypadków nic nie zaznacza.** Sonda siatkowa: 96 natywnych klików pokrywających widoczny odcinek szyny SN stacji i jej pola; kursor był nad elementem rysunku w 12 punktach, a zaznaczenie nastąpiło tylko w **3 z tych 12 (25 %)**. Ten sam prostokąt pola `sn_field/002` raz się zaznacza (`y=698`, `y=717`), raz nie (`y=623`, `y=642`, `y=679`). | pomiar `praca-sonda-siatkowa` | UX, PSN | **3** | Ujednolicić trafienie: jeden przezroczysty obszar trafienia na obiekt (min. 24 px), zamiast polegania na geometrii kreski. |
| P-2 | **Inspektor nie rozróżnia klikanych obiektów.** We wszystkich udanych zaznaczeniach (sonda siatkowa oraz 8 klików w różne pola trzech różnych stacji) inspektor pokazał **jeden i ten sam** opis „Transformator SN/nN" — także po kliknięciu w identyfikator uziemnika (`apparatus-id-earthSwitch-lateral-1`) i w pole pomiarowe. Liczba różnych treści inspektora: **1** na 8 klików w różne obiekty. | pomiary `praca-ziarnistosc-zaznaczenia`, `praca-inspektor-rozroznialnosc`, `praca-sonda-siatkowa`; `praca-inspektor.png` | ZW, PSN | **3** | Zaznaczenie musi nieść `owner-ref` klikniętego aparatu, a inspektor renderować obiekt wskazany tym `ref`. |
| P-3 | **Aparaty rysowane kreską są niekilkalne.** Cztery kliki wykonane DOKŁADNIE na geometrii ścieżki (punkt liczony przez `getPointAtLength` + `getScreenCTM`) — uziemnik, przekładnik napięciowy, zejście pola — nie dały zaznaczenia; obrys tych elementów ma 1,6 px. | pomiar `praca-klik-na-kresce` | UX, ZW | **3** | Dodać niewidoczny obrys trafienia (`stroke-width` trafienia ≫ obrys rysunku) dla elementów liniowych. |
| P-4 | **Zoom szarpie, przejścia poziomu zamrażają obraz.** 23 % klatek przy zoomie przekracza 33 ms, 8 klatek przekracza 100 ms, a same przejścia `L0→L1` i `L1→L2` trwają **303 ms** i **371 ms** — przy 51 stacjach to widoczne zacięcie przy każdym przekroczeniu progu. | pomiar `praca-zoom-duza` | UX | 2 | Przeliczać scenę poziomu poza ścieżką gestu (praca w tle / pamięć podręczna sceny), zamiast w klatce zoomu. |
| P-5 | **Przeciąganie (pan) jest płynne** (obserwacja pozytywna): mediana 15,9 ms, **zero** klatek powyżej 33 ms na sieci 51 stacji. | pomiar `praca-pan-duza` | UX | — | — |
| P-6 | **Klik w tło zaznacza obiekt.** W sondzie siatkowej zaznaczenie nastąpiło w 22 punktach, podczas gdy tylko 12 punktów leżało nad elementem rysunku — co najmniej 10 zaznaczeń pochodzi z kliku w pustą przestrzeń arkusza. | pomiar `praca-sonda-siatkowa` (`klikowZakonczonychZaznaczeniem`=22 vs `punktowNadElementemRysunku`=12) | UX | 2 | Klik w tło ma czyścić zaznaczenie, nie ustawiać go. |

### 3.3 Menu kontekstowe kanwy

Prawy przycisk myszy **nie otwiera menu kontekstowego schematu** — ani nad elementem, ani nad
tłem. Wykryte pozycje `sld-menu-*` (`Wstaw główny punkt zasilania`, `Otwórz katalogi techniczne`,
`Pokaż kontrolę konfiguracji`) należą do **stanu pustego** kanwy (`sld-empty-state`), a nie do
menu kontekstowego; są w drzewie także wtedy, gdy sieć ma 16 stacji.

| # | Opis | Dowód | Soczewka | Waga | Naprawa (jednym zdaniem) |
|---|------|-------|----------|------|--------------------------|
| P-7 | **Brak menu kontekstowego kanwy.** Prawy klik w element i w tło nie ujawnia żadnego menu operacji schematu (wstaw stację na odcinku, rozpocznij odgałęzienie, dodaj OZE, właściwości). Jedyne pozycje `sld-menu-*` w DOM to akcje stanu pustego. | pomiary `budowa-menu-kontekstowe-element`, `budowa-menu-kontekstowe-tlo`; `budowa-menu-kontekstowe.png` | PSN, UX | **3** | Dodać menu kontekstowe kanwy z operacjami zależnymi od trafionego obiektu (odcinek / pole / stacja / tło). |
| P-8 | **Akcje stanu pustego są w drzewie mimo niepustego modelu.** `sld-empty-state`, `sld-empty-state-insert-gpz`, `sld-empty-state-open-catalogs` obecne przy 16 i 51 stacjach. | wypis `data-testid` po otwarciu przypadku (spec `00-rekonesans`) | UX | 1 | Montować stan pusty warunkowo, żeby nie zaśmiecał drzewa i wyszukiwania. |

---
