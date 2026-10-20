# SLD-VIS-2026-10-20 — wielospecjalistyczny audyt obrazu i wiarygodności dowodów

**Status:** AUDYT WSTĘPNY, NO-GO dla analizowanego pakietu obrazów; odbiór aktualnej aplikacji NIEPRZEPROWADZONY.  
**Podstawa kodowa:** `main@8f7ed3c27efad8f9595c2efa99434ec8151bdd23` (odczyt GitHub 2026-10-20).  
**Wariant osobny:** PR #481 (`feat/e05-engineering-workspace-prototype-20261012@9f60564d`), otwarty, niepołączony z `main`.  
**Charakter:** inspekcja repozytorium i zachowanych obrazów, bez uruchomienia przeglądarki, serwera, solwerów i CI.  
**Zasada:** ocena obrazu ≠ pomiar bezpieczeństwa elektrycznego ≠ stan najnowszej, nieprzeczytanej gałęzi.

## 1. Podstawa i zakres

Kontrakty nadrzędne: `AGENTS.md`, `mv-design-pro/AGENTS.md`, `docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`, `docs/sld/SLD_CAD_SPEC_V3.md`, `docs/sld/SLD_V3_ACCEPTANCE.md`; ustalenia szczegółowe zawsze podlegają kanonowi `docs/v12xx/KANON_V12_XX.md` i sześciu specyfikacjom systemowym.

Dowody obrazowe odczytane w tym audycie (wszystkie pod `mv-design-pro/docs/audit/visual/schemat-10/`):
- `s3-l0.png`, `s3-l1.png`, `s3-l2.png`: widoki sieci referencyjnej; obraz S3 zawiera **syntetyczny** NOP, co wyraźnie zaznaczono w lokalnym `README.md`.
- `s4-ekran-l1.png`: statyczny obraz kanwy w ciemnym motywie.
- `s5-zoom-1.png`, `s5-zoom-2.png`, `s5-zoom-3.png`: jeden obiekt stacji S01 przy przejściach L0→L1→L2.
- `w2c-l2-tor-sn.png`: trzy przypadki DER; zrzut z osobnego generatora kompozycji, **nie** z produkcyjnej kanwy.
Dodatkowy dokument historyczny `docs/audit/visual_iteration_K30_13/REPORT.md` deklaruje 8,60/10 dla tamtej iteracji, lecz NIE jest aktualnym protokołem odbioru `main`.

## 2. Perspektywy niezależnego przeglądu

Osiem kontrolnych perspektyw zastosowano do tych samych dowodów; **nie** uruchamiano ośmiu niezależnych instancji modelu.
1. Projektant SN — tożsamość węzłów, bieg od GPZ do stacji, przebieg magistrali, odgałęzienia, przyłączanie.
2. Projektant pól — szyny/sekcje, pola, głowice, kolejność i identyfikacja konkretnej aparatury.
3. Eksploatacja ruchowa — NOP, OPEN/CLOSED/UNKNOWN, nieprzerwane i nieprzerwane połączenia, brak zasilania.
4. EAZ/CT/VT — rozmieszczenie pomiarów, powiązanie aparat–zabezpieczenie, identyfikacja funkcji i biegu dowodowego.
5. PV/BESS — prawdziwy tor SN–kabel–TR blokowy–nN–źródło, oddzielny TR stacji, bilans.
6. Norma symboliczna — rozpoznawalność i bezpieczna interpretacja znaków (bez deklarowania certyfikacji PN-EN 60617 na podstawie zdjęcia).
7. CAD/HMI — hierarchia liniowa, skala, kontrast, czytelność, kolizje, marginesy, eksport.
8. Audytor dowodów — referencje ENM, aktualność wyniku, powtarzalność, zgodność obrazu z uruchomionym kodem.

## 3. Rejestr ustaleń

Legenda: **O** = obraz zaobserwowany, **K** = potwierdzenie kodem, **D** = ograniczenie poświadczone dokumentacją, **N** = brak dowodu końcowego. Priorytet P0 nie oznacza potwierdzonego błędu modelu — oznacza niedopuszczalność zatwierdzenia bez sprawdzenia.

| ID | Waga | Ustalenie i dowód | Rozstrzygnięcie / test |
|---|---|---|---|
| VIS-01 | P0 | **D:** `schemat-10/README.md`, S3: NOP jest syntetyczny; fixtura `sldSubstrate52s` nie niesie realnego NOP. | Odtworzyć NOP z prawdziwego `switch_ref`/portów; OPEN→CLOSED w ENM zmienia graf i symbol, bez sztucznego znacznika. |
| VIS-02 | P0 | **N:** brak w analizowanych obrazach łańcucha rzeczywisty NOP → stan → graf → wynik obliczeniowy. | Warunek PASS: referencja aparatu identyczna w SLD, projekcji, grafie obliczeniowym i wyniku; test OPEN/CLOSED i źródła alternatywnego. |
| VIS-03 | P0 | **K:** `scripts/sld_v3_render_roles.mjs` syntetyzuje `energizedByTestId` wzorem `index % 2 === 0`. | To wyłącznie demonstracja kolorowania, nigdy dowód stanu sieci. Poprawka tej gałęzi dodaje widoczne oznaczenie obrazu; dowód operacyjny wymaga danych źródłowych. |
| VIS-04 | P1 | **O:** `s3-l0/l1/l2.png`, `s4-ekran-l1.png`: w skali całej sieci nie da się swobodnie odczytać oznaczeń pól i aparatów. | Osobny odbiór L0/L1/L2 w 1440×900 i 1920×1080; L0 to nawigacja/topologia, nie miniaturowy L2. |
| VIS-05 | P1 | **O:** wybrane duże zrzuty wykorzystują ograniczoną część wysokości obrazu; mały rozmiar treści po dopasowaniu. | Sprawdzić `computeInitialCameraState`, bezpieczny kadr, legendę i rzeczywiste piksele; nie ustawiać fikcyjnego wymiaru świata. |
| VIS-06 | P1 | **O:** `w2c-l2-tor-sn.png`: `PV 1,0 MW` i `BESS 1,0 MW` nachodzą na dolne podpisy stacji. | 0 kolizji etykieta↔etykieta na finalnym SVG/PNG w przypadkach 2, 7, 8. |
| VIS-07 | P1 | **K:** `frontend/scripts/render_schemat10_w2c.tsx` sam liczy `derLabels` i `bandRows`; nie stosuje globalnego `planSceneLabels`. | Dowodowy render W2c ma przejść przez `SldCanvasV3`/wspólny plan etykiet. Nie naprawiać obrazka samym przesunięciem tekstu. |
| VIS-08 | P1 | **O+K:** w `s5-zoom-3.png` widoczne powtórzone Q1/QE1 bez czytelnych identyfikatorów F01/F02, ale `compose/directions.ts::fieldCaptionAt` ma już nowe oznaczenia. | Nie zgłaszać automatycznie regresji bieżącego kodu; odtworzyć render z HEAD i sprawdzić F01/F02/F03/FT1 z danymi lub jawną konwencją. |
| VIS-09 | P1 | **O:** na S01 zapisane są TR 630 kVA i odbiór P=0,900 MW, Q=0,297 Mvar; samo S odbioru ≈0,948 MVA, lecz DER ma 500 kW. | Nie stwierdzać przeciążenia bez rozpływu netto! Nakładka TR: `P,Q,S,I,β,kierunek` z **jednego** biegu solvera, zgodnego z rewizją. |
| VIS-10 | P1 | **K:** `sld_v3_render_roles.mjs` ma sztywną ścieżkę HTML do dawnego scratchpada i `/opt/pw-browsers/chromium`. | Poprawka tej gałęzi: katalog `os.tmpdir()` lub jawna zmienna środowiska; ścieżka chromium opcjonalna. Wymagane późniejsze uruchomienie testu. |
| VIS-11 | P1 | **K:** `scene/crossings.ts` rozróżnia skrzyżowanie i połączenie, lecz **N** brak nowego dowodu końcowego po łamaniu arkusza. | W każdej trasie zero fałszywych kropek i mostków na szynach; porównać graf i finalny SVG. |
| VIS-12 | P1 | **N:** brak bieżących obrazów pary biegu LOAD_FLOW, SHORT_CIRCUIT z jawnie nieaktualnym wynikiem. | Sprawdzić `CURRENT/STALE/BLOCKED`, ref biegu, napięcia właściwego poziomu, jednostki i scenariusz MIN/MAX. |
| VIS-13 | P1 | **D:** PR #481, otwarty: E05 renderuje kanwę całego modelu i nie ma jeszcze produkcyjnej edycji ani zweryfikowanego sterowania kamerą pola. | Próba wybór pola → przybliżenie konkretnego `bay_ref` → wybór `device_ref` → inspektor → zgodność z ENM; bez nowej kanwy. |
| VIS-14 | P1 | **D:** przestarzały `SLD_VISUAL_REGRESSION_CONTRACT.md` deklaruje historyczny workflow jako **usunięty**; aktualna bramka to `accept:sld-v3` + `sld-determinism.yml`. | Nie powoływać się na historyczne migawki v2 ani martwy workflow. |
| VIS-15 | P2 | **O:** `s5-zoom-3.png` szczegóły elektryczne są czytelniejsze niż globalne, ale opisy zbiorcze są oddalone od obiektów. | Pomiary wynikowe przy właścicielu, a parametry techniczne w kontekstowym inspektorze; bez nadpisywania sceny. |

**Rozstrzygnięcia już istniejące w kodzie, których nie wolno otwierać jako „nowych” bez dowodu regresji:** nazwy pól z `fieldCaptionAt`; geometria `scene/crossings.ts`; proporcje napisów z `canvas/labelLegibility.ts`; czytelność i kontrola kolizji `accept:sld-v3`; rzeczywiste wybieranie aparatów przez `deviceRef` w PR #481 (ale niezweryfikowane E2E).

## 4. Konflikty i reguły domeny

1. Nie wymuszać `CB+DS+CT+VT` na KAŻDYM polu (stary zapis AC-04). Nadrzędny standard stacji i `SLD_CAD_SPEC_V3.md` nakazują aparat zgodny z faktyczną technologią i `Bay.primary_devices`; RMU z rozłącznikiem/uziemnikiem jest innym układem niż pole wyłącznikowe. Nie wywoływać fabrykacji aparatu dla spełnienia historycznej tabelki testowej.
2. Kolor SN, stan pod napięciem, przepływ i werdykt zabezpieczeniowy to cztery różne wymiary. `theme/colorTokens.ts` zawiera osobne tokeny; sprawdzić ich faktyczne użycie w renderze.
3. `SLD_CAD_SPEC_V3.md` §12.3: kabel wchodzi/wychodzi przez głowicę pola, nigdy z przypadkowego miejsca szyny.
4. Dla przęsła obowiązuje opis pary końców, długość oraz rzeczywista dana katalogowa; `Un=` kabla nie zmieniać arbitralnie — dawny konflikt rozstrzygnięto decyzją właściciela w `AUDYT_JAKOSCI_SLD_2026-08.md`.
5. Oddzielne projekcje SLD SN i nN oraz portal transformatora obowiązują także podczas zbliżenia; nie tworzyć sceny mieszanej jako obejścia.
6. Wszystkie dane ekranów i obrazów należy anonimizować; nazwy, identyfikatory klienta i lokalizacje inwestycji nie mogą trafiać do publicznych artefaktów.

## 5. Macierz przypadków odbiorowych

| ID | Wejście | Wyrocznia blokująca |
|---|---|---|
| T01 | GPZ + pole liniowe + magistrala + 1 stacja końcowa | Jeden pełny tor od rzeczywistego portu zasilania, zero braków terminali |
| T02 | Stacja przelotowa 2L+TR | Dwa fizyczne kierunki liniowe, jeden tor TR, poprawna sekcja |
| T03 | Stacja odgałęźna 3L+TR | Trzy identyfikowalne pola F01/F02/F03 z przypisanymi końcami |
| T04 | Pierścień z prawdziwym `switch_ref` i OPEN | Przerwa na rzeczywistym aparacie, właściwa topologia grafu |
| T05 | T04 ze zmianą OPEN→CLOSED | Spójna zmiana stanu i grafu, a nie tylko koloru markera |
| T06 | PV za TR blokowym | Pole SN, głowica, kabel, TR, strona nN, falownik jako osobne obiekty |
| T07 | PV+BESS z dwoma TR | Dwa osobne tory, identyfikatory i zero kolizji |
| T08 | TR stacji + TR blokowy DER | Dwie różne role i referencje transformatorów |
| T09 | Pole z CT, VT, ES, EAZ | Rzeczywista kolejność i miejsce w torze, prawidłowe przypisania |
| T10 | Zwarcie 3-fazowe | `Ik″/ip/Ith` wyłącznie z realnego biegu i na prawidłowym węźle |
| T11 | Rozpływ z generacją wsteczną | Rzeczywiste P/Q i kierunek w zgodnej konwencji znaków |
| T12 | Zmiana ENM po biegu | Wyniki STALE/BLOCKED, brak udawania aktualności |
| T13 | Brak katalogowego aparatu | Nie dopowiadać aparatury; jawna blokada lub konwencja z proweniencją |
| T14 | L0/L1/L2, ciemny/jasny, 1440×900 i 1920×1080 | 0 kolizji finalnie widocznych opisów, oznaczenia zgodne z ENM, czytelność |
| T15 | Eksport techniczny SVG/PDF | Parytet geometrii, zachowanie identyfikatorów, brak obcięć |
| T16 | E05 PR #481, klik pola i konkretnego aparatu | `deviceRef` wskazuje TEN SAM aparat w modelu, na kanwie i w inspektorze |
| T17 | Przerwane/nierozwiązane źródło zasilania | Stan UNKNOWN/UNRESOLVED nie zostaje po cichu zamieniony na CLOSED |
| T18 | Wiele źródeł/wyspa | Stan energizacji oparty na topologii i danych, nie indeksie SVG |

Każda pozycja ma mieć **zrzut przed/po**, wersję modelu, `commit SHA`, `case_ref` i `run_ref` jeśli dotyczy wyniku, wynik niezależnego testu topologicznego, wynik wyroczni geometrii i ręczny werdykt właściciela.

## 6. Bramka akceptacyjna

**Automatyczna odmowa:** jakikolwiek brakujący terminal toru, przecięcie symbolu przewodem poza portem, fałszywe połączenie, symbol bez ENM/oznaczenia konwencji, kolizja końcowego tekstu, nieaktualny wynik przedstawiony jako aktualny, testowy stan energizacji przedstawiony jako operacyjny, niespójny numer pola.

**Konieczny komplet:** `npm run accept:sld-v3`, testy SLD v3, testy kompozycji stacji/DER, Playwright z REALNYM backendem, porównanie dwóch motywów, PNG/SVG i końcowy audyt obrazów. Nie wystarczy `PASS` na samych prostokątach sceny.

## 7. Reprodukcja, ograniczenia wykonania

```bash
cd mv-design-pro/frontend
npm run accept:sld-v3
npx vite-node scripts/sld_v3_render_roles.mjs
CANON_OUT=/tmp/sld-w2c npx vite-node scripts/render_schemat10_w2c.tsx
CANON_OUT=/tmp/sld-w2c node scripts/rasterize.mjs
```

UWAGA: `sld_v3_render_roles.mjs` korzysta ze statycznego `renderToStaticMarkup` i z fikstury; nie zastępuje natywnych kliknięć, inicjalizacji React ani prawdziwej nakładki serwerowej. Po poprawce przenośności ustaw opcjonalnie `SLD_V3_RENDER_HTML_DIR`, `SLD_V3_CHROMIUM_PATH`; domyślnie używany katalog tymczasowy systemu i przeglądarka Playwright.

**Przy tym audycie testów i komend nie uruchomiono:** środowisko wykonawcze kontenera nie było dostępne. Nie nadawać statusów PASS. Zmiany skryptu na gałęzi `audit/sld-v3-wizualny-20261020` zweryfikowano przez kontrolę dopasowania i zamiany fragmentów źródła, bez uruchomienia Node/Playwright.

## 8. Werdykt i odpowiedzialność

**NO-GO dla istniejącego historycznego pakietu obrazów jako dowodu aktualnej jakości aplikacji.** Nie twierdzimy, że `main` ma wszystkie dawne defekty: część jest już zamknięta, część jest tylko luką dowodową. Nie jest to dowód, że nowy kod jest wadliwy.

Fable: wykonawca + integrator. Recenzenci domenowi: role 1–8 powyżej, ze wspólną macierzą dowodów, niezależnymi uwagami i zakazem samozatwierdzenia. Ostateczny werdykt wizualny należy do właściciela. Wdrażać przekrojowo ENM → aparat/port → graf → wynik → SLD → eksport, nie przez przesuwanie glifów ani produkowanie nowych atrap.
