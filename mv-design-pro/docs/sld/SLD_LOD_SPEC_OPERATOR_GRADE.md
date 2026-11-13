# SLD — Skala, gęstość informacji i nawigacja

**Status:** BINDING
**Wersja:** 2.0 (2026-11-12, karta SLD-SKALA-I-NAWIGACJA; zastępuje wersję 1.0 „Operator-Grade LOD, Phase 0A")
**Podstawa:** wymaganie właściciela 2026-11-11 (jedna geometria schematu w każdej skali, informacja dawkowana wg czytelności, nawigacja jawna). Konflikt z dawnymi specyfikacjami poziomów szczegółu jest wpisany w `docs/v12xx/REJESTR_KONFLIKTOW.md` (rozstrzyga późniejszy dokument właściciela).
**Powiązane:** `SLD_LOD_AND_LAYERS.md` (warstwy widoczności, bez poziomów), `SLD_GEOMETRY_CONTRACT_V1.md` §7, `SLD_INDUSTRIAL_SPEC_v1.md` §5.1 i §8, `SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md`.
**Strażnik:** `scripts/sld_scena_niezalezna_od_skali_guard.py` (z autotestem iniekcji), uruchamiany w `.github/workflows/sld-determinism.yml`.

Wersja 1.0 opisywała pięć poziomów szczegółu (LOD 0–4) z progami skali 0,30 / 0,70 / 1,50 / 3,00, histerezą 15 % i opóźnieniem 250 ms, realizowanych przez `ui/sld/v2/lod/LodPolicy.ts` i `engine/sld-layout/lodController.ts`. Oba moduły są skasowane; poziomów nie ma ani w kodzie, ani w API.

---

## 1. Rozstrzygnięcie wariantów (audyt powykonawczy §9.3)

| Wariant | Decyzja | Uzasadnienie |
|---|---|---|
| Zamiana reprezentacji stacji od skali (blok przeglądowy ↔ pełna rozdzielnica) | **Odrzucony** | Zmienia geometrię pod kursorem przy obrocie kółka (skok obiektu, utrata punktu odniesienia). W odczytanych źródłach producentów nie znaleziono automatycznej zamiany reprezentacji samą skalą [N]; reprezentacje alternatywne są w nich wybierane przez użytkownika albo są osobnymi diagramami (PowerFactory, NEPLAN) [P]. |
| Wymuszony minimalny zoom (schemat nigdy mniejszy niż czytelny) | **Odrzucony** | Odbiera widok całej sieci, którego projektant potrzebuje do orientacji; EasyPower opisuje widok oddalony jako przegląd bez edycji, nie jako zakazany [P]. |
| **Ukrywanie INFORMACJI wg czytelności + tożsamość w rozmiarze ekranowym** | **Wybrany** | Widoczność informacji zależna od skali to wzorzec ETAP („Display / hide based on: Zoom level"), PowerWorld (zakresy zoomu obiektów), PSS SINCAL („Min. zoom" warstwy) i MapLibre (`minzoom`, kolizje etykiet z priorytetem) [P]. Tor i jego geometria zostają nietknięte. |

Oznaczenia: [P] — potwierdzone w odczytanej dokumentacji producenta (data dostępu 2026-11-11); [N] — nie znaleziono w odczytanych źródłach (brak dowodu, a nie dowód braku). Literatura o zoomie semantycznym (Perlin i Fox 1993, Furnas i Bederson 1995) i przelot kamery van Wijka i Nuija (2003) to wiedza ogólna, w tej karcie nieodczytana — nie jest dowodem.

## 2. Kontrakt R1–R9

**R1. Jedna geometria świata.** `buildSceneV3(snapshot)` nie przyjmuje skali ani poziomu. Jedyna geometria to kompozycja pełna (pole wg wzorca, aparaty toru, blok zabezpieczeń). `scenaSld` trzyma jedną scenę na migawkę.

Nie istnieją:
- typ poziomu sceny;
- zwinięte postacie stacji i GPZ;
- pole bez aparatury;
- adnotacja zabezpieczeń „samo kółko";
- rozwijanie GPZ kliknięciem;
- przenikanie warstw;
- wymuszanie poziomu;
- scena przeglądowa nawigatora.

Determinizm: ten sam model daje tę samą scenę i ten sam hash.

**R2. Kamera to czyste przekształcenie.** Skala i przesunięcie działają w jednym świecie (`canvas/camera.ts`). Górny kraniec skali jest stały. Dolny wynika z dopasowania całej sieci (`skalaMinimalna`), więc cała sieć zawsze mieści się w kadrze z marginesem. Nie ma progów, histerezy poziomów ani mapowania skali na poziom.

**R3. Skala steruje wyłącznie gęstością INFORMACJI.**
- **Klasy informacji.** Każdy napis sceny ma klasę informacji nadaną w scenie: tożsamość obiektu, potem oznaczenia aparatów i kody funkcji, potem parametry, na końcu wyniki.
- **Tor bez klasy.** Elementy toru nie mają klasy i są rysowane w każdej skali: przewody, szyny, stany łączników toru, punkty rozcięcia N.O., stan zasilania, obrys i symbol stacji. Wnętrza pól (aparaty pola, ich oznaczenia, blok, ramka i linie zabezpieczeń) rysują się od progu wnętrza R8 (widok ogólny, B-02 2026-11-13 P0-03) — poniżej niego aparat pola GPZ jest obrysem w kolorze stanu, a łącznik przerywający tor znakiem □ przerwy toru, więc stan i topologia zostają na rysunku.
- **Funkcja widoczności.** Widoczność liczy jedna czysta funkcja z rozmiaru ekranowego tekstu (wysokość nominalna × skala). Porównuje go z jednym progiem `MIN_READABLE_LABEL_SCREEN_PX = 9` (`ui/sld/v3/core/text.ts`). Dawny zapis 6 px w dokumencie audytu był rozbieżny i jest skorygowany.
- **Histereza.** Pasmo jest jednostronne, poniżej progu (`canvas/gestoscInformacji.ts`). Napis pojawia się przy rozmiarze ≥ 9 px, a znika poniżej 8,1 px. Próg wejścia jest więc progiem czytelności; pasmo chroni tylko przed migotaniem przy oddalaniu (rozstrzygnięcie architekta 2026-11-12).
- **Pasma.** Liczba „pasm" wynika z rozmiarów pisma, nie z tabeli progów.

Typografia schematu (rozstrzygnięcie architekta 2026-11-12, karta pól):

| Rodzaj napisu | Rozmiar pisma |
|---|---|
| Pismo podstawowe | 10 px |
| Parametry i wyniki (`PISMO_WYNIKOW`, `core/text.ts`) | 9 px |
| Napisy pomocnicze | 8,5 px |
| Oznaczenie aparatu | 10 px |
| Nazwa pola | 11,5 px |

Wyniki pisane 9 px są czytelne od skali 1,0 (skala czytania) na każdej ścieżce rysowania wyników: etykiety wyników, agregaty, przepływy, znaczniki przełącznika zaczepów i pas nieaktualności.

**R4. Tożsamość zawsze czytelna.**
- Napis tożsamości (GPZ, stacja, sekcja, pole), który w skali świata spada poniżej progu, rysuje się w stałym rozmiarze ekranowym przy obrysie obiektu, z poświatą tła.
- Kolizje rozstrzyga deterministycznie priorytet GPZ > stacja > sekcja > pole; remis rozstrzyga `ref`.
- Napis, który przegrał kolizję, jest w dymku obiektu (`tytul` celu trafienia) i w nawigatorze.
- Mechanizm to istniejący plan etykiet (`canvas/labelLegibility.ts`, plan w `SldCanvasV3.tsx`).
- **Nazwa stacji i GPZ na widoku całej sieci (rozstrzygnięcie architekta 2026-11-12).** Nazwa jest adnotacją o stałej wielkości ekranowej (≥ 9 px niezależnie od skali kamery), przypiętą do symbolu stacji. Adnotacją są nazwa GPZ, nazwa stacji, oznaczenie sekcji i szyny (`adnotacjaStalejWielkosci`). Kontrakt proporcji „napis ≤ 2,5 glifu” dotyczy napisów sceny (oznacznik aparatu, opis pola, dane, tożsamość rangi pola), nie adnotacji (`core/__tests__/proporcjeRysunku.test.tsx`, blok „ZAKRES”).
- **Pierwszeństwo.** Nazwa stacji zaznaczonej (zaznaczony obiekt rozstrzygnięty do swojej stacji tą samą hierarchią co kadr i cel kliku) i stacji z alarmem (zbiór glifu zbiorczego, `najgorszyStanStacji`) jest zawsze narysowana: idzie przed innymi napisami, a gdy żadna pozycja nie jest wolna od rysunku, stoi w swoim slocie z otoczką (`naRysunku`, atrybut `data-na-rysunku`). Innych napisów nie przykrywa; przy zbiegu kolizji dwóch nazw z pierwszeństwem rozstrzyga kolejność stała (ranga, priorytet rodzaju, ref), a przegrana idzie do dymka.
- **Przeszkody nazw.** Rysunek (symbole, łączniki, punkt N.O., tory — `sceneObstacleRects`) i znaczniki stanu o stałym rozmiarze ekranowym (`przeszkodyZnacznikowStanu`; pomiar 2026-11-12: bez nich nazwa „Stacja L6-2” przykrywała znacznik stanu w kadrze całej sieci). Adnotacje wyników (warstwa nakładek, karta nakładek wyników) czytają wynik rozmieszczenia nazw (`rozmieszczenieNazw(plan)`: ref bloku i prostokąt tuszu) jako przeszkody; test `canvas/__tests__/nazwyStacjiPrzegladu.contract.test.ts` dowodzi, że ten odczyt wystarcza (`layoutResultLabels` z tymi prostokątami nie wchodzi na nazwy).

**R5. Podłogi czytelności toru; znaki stanu nie giną.**
- **Podłoga grubości.** Szyny i przewody magistralne mają podłogę grubości w pikselach ekranu z hierarchią szyna > magistrala > odgałęzienie pola. Jedno źródło: `compose/preview.tsx`.
- **Wnętrza symboli** skalują się naturalnie.
- **Znaki stanu.** Znaki rozstrzygające o topologii i uwadze projektanta to:
  - łącznik otwarty / punkt rozcięcia „N.O.";
  - zaznaczenie;
  - blokada gotowości;
  - miejsce zwarcia;
  - przekroczenie w wynikach.

  Gdy symbol nośny ma na ekranie mniej niż próg rozpoznawalności 8 px (`symbols/defs.ts`), znak dostaje znacznik o stałym rozmiarze ekranowym w tej samej kotwicy świata.
- **Lista znaków jest danymi** (`canvas/znacznikiStanu.ts`). Stanu się nie wymyśla.

**R6. Trafianie wg rozmiaru ekranowego.**
- Cel kliknięcia to najmniejszy obiekt hierarchii aparat → pole → stacja, który ma na ekranie co najmniej próg rozpoznawalności.
- Minimalny cel ma 24 px (WCAG 2.2, kryterium 2.5.8 [P]).
- Wybór celu liczy jedna czysta funkcja (`canvas/hitAreas.ts`, `hierarchiaCelowTrafienia`).
- Warstwa trafień jest JEDNA: jeden węzeł na obiekt, obrys w atrybucie `data-hit-obrys`. Gdy obrys obiektu i rozszerzenie sąsiada się nakładają, pierwszeństwo obrysu rozstrzyga `rozstrzygnijTrafienieWezla` w punkcie kursora.

**R7. Nawigacja jawna po hierarchii modelu, jedna kamera.**
- **Cele i hierarchia.**
  - Cele: Sieć › GPZ/stacja › sekcja › pole › aparat; prostokąty celów pochodzą z jednej sceny (`canvas/zakresKadru.ts`).
  - Dwuklik kadruje o poziom głębiej; okruszki (`canvas/KontekstKadru.tsx`) prowadzą w górę.
  - `Esc` przy pustym zaznaczeniu przechodzi poziom wyżej. Przy niepustym zaznaczeniu najpierw je zdejmuje.
- **Wskazanie z zewnątrz (`centerSldOnElement`).** Kadr dobiera JEDNA reguła (`camera.ts`, `applyWskazanie`):
  - Skala zostaje, gdy cel jest w niej rozpoznawalny, czyli skala ≥ 1,0 (skala czytania) i cel mieści się w prostokącie bezpiecznym. Gdy cel jest już widoczny, kamera stoi.
  - W przeciwnym razie kamera kadruje cel w skali czytania: cel jest czytelny, a obiekt nadrzędny widać wokół niego. Cel większy od okna jest kadrowany od jego początku.
  - Oba tryby wołających idą tą samą drogą zakresu celu.
  - Tryb „kotwicz" (skutek uboczny edycji, drzewo) jest cichy: nie dodaje wpisu historii, nie zmienia ścieżki ani kurtyny i nie wyświetla komunikatu.
  - Tryb „kadruj" (wyniki, gotowość) wchodzi w cel jak polecenie kadru.
  - Sygnatura `ui/selection/store.ts` zostaje bez zmian.
- **Sterowanie.**
  - `+`/`−` zmieniają skalę wokół środka kadru (krok √2).
  - Strzałki przesuwają kadr o 0,2 widoku.
  - `F` dopasowuje widok, `Shift+F` pokazuje całą sieć.
  - Historia kadrów działa wstecz i naprzód (`Alt+←` / `Alt+→`). Nowe polecenie widoku kasuje drogę naprzód. Wpis historii bierze kamerę z chwili polecenia: kanwa zgłasza kamerę w fazie układu (`useLayoutEffect`), a historia czyta ją z refu — kopia ze stanu Reacta spóźniała się o jedno odświeżenie i `Alt+→` zaraz po `Alt+←` nie wracał do całej sieci (2 z 5 biegów e2e, B-02 2026-11-13).
  - „Wstecz” w doku widoku to historia KAMERY, nie poprzednia stacja — mówi to jego podpowiedź („Poprzedni widok — historia kamery, nie poprzednia stacja”). Strzałki stacji w okruszkach (`KontekstKadru.tsx`) mają licznik pełnym zdaniem „Stacja 4 z 5” zamiast „4/5” (B-02 2026-11-13, P1-01; `kadrowanieWidoku.workspace.test.tsx`, e2e `k2-kadrowanie-nawigacja.spec.ts`).
  - Kółko i szczypanie działają natychmiast, do kursora.
  - Wszystkie skróty są w jednym rejestrze `ui/sld/core/keyboardShortcuts.ts` z przypiętą obsługą (test rejestru) i są widoczne w pomocy skrótów.
- **Polecenia widoku z przelotem.** Skala czytania, powiększenie oknem, „Cała sieć”, „Dopasuj widok”, kadr celu i historia kadrów przechodzą do nowego kadru przelotem kamery (van Wijk i Nuij 2003, ρ = √2, 220 ms na jednostkę długości ścieżki, w granicach 120–500 ms; `canvas/przelotKamery.ts`). Stan kamery jest od początku kadrem celu (plan napisów, odcinanie, trafienia i `data-skala-kamery` liczą się dla celu); animowany jest wyłącznie `viewBox`, a okno renderu w trakcie przelotu to suma okien startu i celu. Każde wejście użytkownika (wskaźnik, kółko, klawisz) tnie przelot do kadru celu. Przy `prefers-reduced-motion: reduce` albo bez `requestAnimationFrame` — cięcie. Zmiana układu w trakcie przelotu przestawia jego cel. Stan kamery dla e2e: `data-stan-kamery` (`spoczynek` / `przelot`). Gesty (kółko, szczypanie, przeciąganie, `+`/`−`, strzałki, nawigator) działają natychmiast.
- **Skala czytania: `Shift+1`.** Wokół ostatniego położenia kursora nad kanwą, a gdy kursor ją opuścił — wokół środka kadru. Nakładka lassa i powiększenia oknem przejmuje wskaźnik przy wciśniętym Shift (więc przy każdym `Shift+1`); wejście kursora nad nakładkę i ruch nad nią w obrębie prostokąta kanwy nie są opuszczeniem kanwy — punkt stały zostaje i nadąża za kursorem (`nawigacjaKamery.workspace.test.tsx`, iloczyn wyjście × ruch, z iniekcją). Odstępstwo od klawisza `1` z kontraktu: cyfry `1–N` przełączają przestrzenie pracy (`ui2/shell/AppShell.tsx`); `Shift+1` daje znak „!”, którego powłoka nie rozpoznaje jako cyfry, więc kolizji nie ma.
- **Powiększenie oknem.** `Z` albo przycisk ikonowy „⬚” w doku widoku (nazwa „Powiększ oknem” w etykiecie dostępności i podpowiedzi) włącza tryb jednorazowy; przeciągnięcie rysuje prostokąt (`sld-v3-okno-powiekszenia`), puszczenie kadruje go z przelotem i kończy tryb. Prostokąt mniejszy niż 8 px w którejś osi jest kliknięciem i tryb zostaje. `Shift+przeciągnięcie` zostaje lassem, `Esc` i ponowne `Z` kończą tryb. Kadr sprzed polecenia trafia do historii.
- **Wskaźnik skali z menu.** Stoi w prawym dolnym doku obok przełącznika warstw (jak pole skali na pasku stanu programów CAD), menu otwiera się w górę; poza pasem narzędzi. Pas narzędzi liczy się z rzeczywistej szerokości kanwy (po inspektorze): grupa „widok” (Dopasuj widok z menu kadru, powiększenie oknem, Wstecz, wybór widoku; 340 px) jest STAŁA i nie zwija się przy żadnej szerokości, a „Cały arkusz” z legendą (grupa „arkusz”, 196 px), układy i eksport zwijają się do jednego menu „Narzędzia” (B-02 2026-11-13, P0-05). Minimum pasa 456 px mieści się w najwęższej kanwie powłoki (okno 1280×720 z inspektorem ≈ 636 px); jeden wiersz, bez przyciętych przycisków — `toolbarLayout.contract.test.ts`, `workspacePanels.test.tsx`, e2e `sld-kamera-przelot-okno.spec.ts`. Procent skali względem skali czytania; menu: „Cała sieć” (jak `Shift+F`), „Zaznaczenie” (nieaktywne bez zaznaczenia, z przyczyną w podpowiedzi) i „100 %” (skala czytania).
- **Nawigator.** Panel i jego przełącznik stoją w prawym-dolnym doku kanwy, nad wskaźnikiem skali i przełącznikiem warstw (jedna kolumna doku — panel nie nachodzi na żaden dok i nie zasłania środka schematu). Miniatura i ramka kadru pochodzą z tej samej projekcji (`minimapProjectionOf`). Ramka jest rysowana jako część wspólna kadru z panelem, cofnięta o pół obrysu, i ma ZAWSZE cztery krawędzie: bok krótszy niż 6 px (kadr bardzo mały albo całkiem poza schematem) rozszerza się do 6 px przy krawędzi panelu po stronie kamery (B-02 2026-11-13, P0-01); nieprzycięte położenie kamery niosą atrybuty `data-frame-*` (`minimap.ts`, `ramkaWPanelu`). Otwarty nawigator jest zasłoną stanową prawego-dolnego rogu: prostokąt bezpieczny kadrów traci jeden pas — dolny albo prawy, ten, który zabiera mniej pola (`toolbarLayout.zaslonaNawigatora`, P0-02); zmiana zasłon i rozmiaru kanwy (otwarcie/zamknięcie inspektora) odsłania zaznaczony obiekt (`odslonRefy`, P1-03). Klik i przeciągnięcie przenoszą kadr; kółko nad nawigatorem zmienia skalę kamery wokół środka bieżącego kadru (ta sama czułość co kółko nad kanwą, natychmiast, bez wpisu historii).
- **Pamięć kamery per projekt.** Warsztat schematu odmontowuje się przy wyjściu z przestrzeni schematu; ostatni kadr projektu (przekształcenie i rozmiar kanwy) jest pamiętany w sesji przeglądarki per identyfikator projektu (`canvas/pamiecKamery.ts`) i przywracany cięciem przy powrocie. Zaznaczenie jest globalne (`ui/selection/store.ts`) i przeżywa wyjście samo. Pamięć nie trafia do modelu, archiwum projektu ani eksportu.
- **Bez nazwanych zakładek widoków.** Cele hierarchii, wyszukiwanie i historia pokrywają tę potrzebę bez nowego magazynu danych (decyzja, nie odroczenie).

**R8. Wydajność z pomiaru.**
- Ruch kamery zmienia jedno przekształcenie grupy; scena nie jest przebudowywana.
- Napisy klas niewidocznych nie trafiają do DOM.
- Render jest odcinany, scena nie (`canvas/oknoRenderu.ts`). Obowiązują dwie reguły:
  1. **Okno renderu.** Obiekt, którego obwiednia nie przecina okna kamery poszerzonego o pół widoku z każdej strony, nie dostaje węzła.
  2. **Obrys bez wnętrza (próg czytelności R3).** Symbol, którego mniejszy bok gabarytu ma na ekranie mniej niż `PROG_WNETRZA_SYMBOLU_PX` = `MIN_READABLE_LABEL_SCREEN_PX` = 9 px, rysuje sam obrys gabarytu w kolorze stanu; łącznik przerywający tor (otwarty, punkt N.O.) — znak □ przerwy toru o stałej wielkości ekranowej. Zostają ten sam `ref`, atrybuty stanu, cel trafienia i `data-bez-wnetrza`. Dawny próg 3 px nie wynikał z reguły czytania (decyzja architekta po B-02 2026-11-13, P0-03): kreska aparatu mniejsza od najmniejszej czytelnej litery nie przenosi rozróżnialnej treści.
  3. **Wnętrza pól i trzy poziomy szczegółu (dyrektywa właściciela 2026-11-13: LOD0 do ~40 %, LOD1 ~40–85 %, LOD2 od ~85 %, z histerezą; granice z pomiaru rozmiaru obiektów).** Jedna polityka dla GPZ i stacji (`oknoRenderu.ts`, jedno źródło dla rysunku, symbolu stacji, warstwy trafień, planu etykiet i kadru). Granica LOD1/LOD2 `SKALA_WNETRZA_POL` = 9 px / pismo danych pola i stacji t2 (11 j.św.) = 0,818: pomiar klas opisów na sieci wzorcowej 52 stacji i GPZ 110 kV (oznaczenia aparatów t4 — 1 064, dane zabezpieczeń t4 — 932, role pól t3 — 171, dane stacji t2 — 59) pokazał, że dane t2 są ostatnią klasą, która przy mniejszej skali traci pismo naturalne; najmniejszy aparat (16 j.św.) ma przy 0,818 wnętrze 13,1 px, a oznaczenia t4 mieszczą się w dopuszczalnym powiększeniu pisma (1,4× ≤ 3×). Granica LOD0/LOD1 `SKALA_POL_ODPLYWOW` = 9 px / (16 j.św. + GRID) = 0,375: poniżej znaki stanu kolejnych aparatów jednego pola stoją bliżej niż 9 px. Histereza ±10 % (`PASMO_HISTEREZY_CZYTELNOSCI`, to samo pasmo co R3): wejście na poziom wyższy od granicy × 1,1 (0,4125 i 0,9), zejście poniżej granicy × 0,9 (0,3375 i 0,736); w paśmie poziom zostaje (`poziomSzczegolu(skala, poprzedni)`, kanwa trzyma poziom w refie, a każdy predykat poziomu dostaje skalę reprezentującą trzymany poziom — `skalaPoziomu`). **LOD2** — pełny rysunek pól (aparatura, CT/VT, ramki i dane zabezpieczeń, oznaczenia aparatów, tła pól GPZ). **LOD1** — pola jako odpływy: szyna i sekcje, odejścia pól z elementem końca pola (transformator z tożsamością, źródło, tor linii), oznaczenia pól, ŁĄCZNIK PODSTAWOWY każdego pola i sprzęgło szyn z kaflem stanu w barwie położenia (`glifZbiorczy.lacznikiZeZnakiemStanu`; ranga zdolności łączeniowej `RANGA_LACZNIKA_PODSTAWOWEGO`: wyłącznik i reklozer 0, rozłącznik, rozłącznik z bezpiecznikami, łącznik trójpołożeniowy, łącznik w torze poziomym i punkt N.O. 1, odłącznik 2; remis — pierwszy w kolejności sceny), pozostałe aparaty — przelot linii toru (zamknięte) albo □ przerwy toru (otwarte); bez CT/VT, bez ramek i bez oznaczeń Q (podpowiedź celu). **LOD0** — stacja SN/nN i punkt rozłącznikowy symbolem stacji (szyna przerwana przy sprzęgle otwartym, więc stacja dwusekcyjna jest rozpoznawalna; kafel stanu sprzęgła; □ łącznika otwartego w nodze; punkt N.O.), GPZ — węzeł zasilania z polami jak w LOD1, bez tabeli „Pola GPZ” i bez teł pól (warunek w miejscu montowania warstwy w `SldCanvasV3.tsx`, plik warstwy należy do karty pól); stacja w symbolu nie ma wierszy pasma nazw poza nazwą (bez „Szyna nN · 0,4 kV” pod każdą stacją, bez mocy i rodzaju stacji) ani opisów obiektów nierysowanych — przechodzą do podpowiedzi celu stacji (`glifZbiorczy.etykietyPrzegladu`); opisy szyn SN (sekcje) zostają. Położenie nazwy stacji względem obrysu należy do układu (wykonawca geometrii). Topologia, położenia łączników, identyfikatory i scena bez zmian; kompozytor pola (`compose/**`) nietknięty. Eksport rysuje pełną scenę (tryb dokumentu, skala 1).
- **Poziomy szczegółu (nazwy opisowe, nie parametr kamery — R2).** LOD0: skala < 0,375 (z histerezą); LOD1: 0,375 ≤ skala < 0,818; LOD2: skala ≥ 0,818 — treść poziomów w punkcie 3 wyżej. Kanwa wystawia poziom w `data-poziom-szczegolu`. **Kadr obiektu** („Dopasuj stację”, „Dopasuj pole”, sekcja, „Dopasuj widok” zaznaczenia w całości wewnątrz stacji — `ZakresKadru.rozdzielnica`) ma podłogę `SKALA_PODLOGI_ROZDZIELNICY` = skala wejścia do LOD2 = 0,818 × 1,1 = 0,9 (`skalaWejsciaPoziomu`), więc ląduje za pasmem histerezy i daje LOD2 niezależnie od poziomu wyjściowego; przy podłodze kamera układa kadr osobno na każdej osi: cel z tuszem opisów mieszczący się w wolnej kanwie (choćby bez oddechu kadru) — środek celu; sam obiekt mieszczący się — środek obiektu (inspektor nie ucina ostatnich pól, ucięty może być co najwyżej opis wystający poza obiekt); obiekt dłuższy od wolnej kanwy — od początku, resztę daje przesuw kadru (skala nie spada pod próg wnętrza; `camera.applyKadrCelu`). Gdy podłogę przekracza wyłącznie zasłona otwartego nawigatora, kanwa woła zwinięcie nawigatora na czas kadru (`onZwinNawigatorDlaKadru`), a obszar roboczy przywraca wybór projektanta po zmianie zaznaczenia; ręczne przełączenie kasuje przywrócenie (`SldCanvasV3Workspace`). Przejście między poziomami nie zmienia sceny, zaznaczenia ani położenia obiektu pod kursorem kółka (`widokOgolnyLod.contract.test.tsx`, P1-02).
- Zamiana geometrii — nigdy.
- Budżety węzłów DOM przypina `canvas/__tests__/budzetDom.contract.test.tsx` (kadr × fikstura × rozmiar kanwy, z iniekcją).

Liczba węzłów DOM w warsztacie, sieć wzorcowa 52 stacji:

| Etap | Cała sieć, 1200×800 | Cała sieć, 1920×1080 | Kadr roboczy (skala ≈ 1,0) |
|---|---|---|---|
| Przed kartą (poziomy, scena zwinięta) | 1 867 | — | 8 296 |
| Po etapie 2 (jedna scena, bez odcinania) | 21 844 | — | 26 160 |
| Po R8 (okno renderu, jedna warstwa trafień, obrys bez wnętrza) | 5 897 | 11 367 | 1 806 |
| Po symbolu stacji (stacja bez rozpoznawalnego aparatu jako szyna i nogi toru, `glifZbiorczy.ts`) | 1 287 | 1 424 | 1 872 |
| Po widoku ogólnym LOD0 (R8 reguły 2–3, B-02 2026-11-13) | 1 281 | 1 391 | 1 872 |

Budżet architekta kadru całej sieci: 3 000 węzłów (decyzja 2026-11-12), przypięty w `budzetDom.contract.test.tsx` z zapadką pomiar + ok. 10 %. Rozbicie kadru całej sieci 1200×800 w warsztacie (sonda 2026-11-13, kanwa 1 262 węzły): warstwa trafień 720 (497 uchwytów: stacja 54, pole 171, szyna 55, tor 107, łącznik wiersza 4, aparat 2, etykieta 104), napisy 204 (102 napisy), symbole stacji 187 (53 stacje), odcinki 114, symbole z własnym węzłem 7 (6 obrysów bez wnętrza, 1 znak przeglądowy transformatora GPZ).

Pomiar nawigacji na sieci wzorcowej 52 stacji w żywej aplikacji (e2e `sld-macierz-skali.spec.ts`, realny backend, okno 1440×900, Chromium bez ograniczeń CPU, 2026-11-13; opóźnienie od polecenia do pierwszej klatki z nowym kadrem, z rundą Playwright → przeglądarka): kółko — mediana 115 ms, maks. 142 ms (6 prób); `Shift+1` — mediana 182 ms, maks. 207 ms (3 próby); przelot — pierwsza klatka mediana 180 ms, maks. 768 ms, do spoczynku 559–915 ms. Kółko tam i z powrotem wraca do tej samej skali (dryf 0). Po zmianie poziomu szczegółu 0 narysowanych napisów poniżej 9 px. Węzły DOM kanwy: skala czytania 1 739, cała sieć 1 235. Wynik zapisuje spec w `test-results/pomiar-nawigacji-52.json`; każde polecenie ma asercję < 1 000 ms.

**R9. Klasa, nie instancja.**
- **Widok nN.** Ten sam kontrakt obowiązuje widok nN (`lv-domain/visualGrammar.ts`). Pomiar 2026-11-12: wszystkie elementy toru w rejestrze elementów kanwy nN są widoczne na każdym poziomie, więc toru nie ukrywa.
- **Eksport i wydruk.** Zawsze pełna scena, wszystkie klasy, niezależnie od skali kanwy. Kanwa rysuje się na czas budowy arkusza w trybie dokumentu (`trybDokumentu`): skala rysunku 1, plan etykiet w skali nieskończonej (każdy napis w rozmiarze naturalnym), bez okna renderu, bez obrysów bez wnętrza, bez kurtyny kadru. Plik jest bajt w bajt ten sam z każdego kadru kamery (`export/__tests__/formatyEksportu.test.tsx`, opis „R9”, z iniekcją). Pełna scena niesie napisy pionowe (`rotate(-90, cx, cy)`) i obrócone części glifów, więc tor PDF/DXF (`export/svgPrimitives.ts`) odwzorowuje przekształcenia sztywne `translate`/`rotate` (punkty przez macierz, okrąg z tym samym promieniem, tekst z kątem: PDF — macierz tekstu, DXF — grupa 50 encji TEXT); skala, pochylenie i `matrix` nadal są błędem jawnym (`export/__tests__/eksportDokumentu.test.ts`, iloczyn element × postać obrotu, z iniekcją).
- **Martwy kod v2** (`ui/sld/v2/lod/**`, `engine/sld-layout/lodController.ts` z testami) jest skasowany.
- **Konsumenci kotwic zwiniętych postaci** czytają kotwice jednej sceny: `sld-overlay/**`, sondy GPZ, kompletność rysunku, most refów wyników.

## 3. Niezmienniki (przypięte testami)

Lista WIĄŻĄCA (decyzja architekta po B-02 2026-11-13): każdy niezmiennik ma plik testu i iniekcję, która przy usuniętej naprawie czerwieni ten test. Iniekcja to celowo zepsuty kod produktu (nie testu), uruchomiona jednorazowo na drzewie karty i wycofana; wynik to liczba testów czerwonych w pliku przypinającym. Niezmiennik bez iniekcji czerwieniącej test nie jest przypięty.

| Niezmiennik | Plik testu | Iniekcja → wynik |
|---|---|---|
| Zbiór elementów toru i ich geometria nie zależą od skali | strażnik `sld_scena_niezalezna_od_skali_guard.py`; `v3/scene/__tests__/ciagloscToru.test.ts` | `buildSceneV3` gubi co siódmy odcinek → 2 czerwone; autotest strażnika: każda z iniekcji strażnika czerwona (17 testów zielonych na wersji poprawnej) |
| Gęstość: skala × klasa informacji, bez migotania na progu | `canvas/__tests__/gestoscInformacji.contract.test.ts` | wysokość pisma na ekranie ×1,5 (`gestoscInformacji.ts`) → 21 czerwonych |
| Tożsamość: każdy GPZ i stacja ma napis albo dymek w każdej skali; kolizje deterministyczne | `canvas/__tests__/tozsamoscEtykiet.contract.test.ts` | co druga przegrana tożsamość nie trafia do podpowiedzi → 2 czerwone |
| Znaki stanu: skala × rodzaj znaku | `canvas/__tests__/znacznikiStanu.contract.test.tsx` | próg znaku ÷4 → 2 czerwone |
| Trafianie: skala × obiekt | `canvas/__tests__/trafienieKanwy.contract.test.tsx` | klasa trafienia aparatu podmieniona na źródło → 1 czerwony z 16 |
| Cel kliku w stacji symbolu przeglądu: obiekt bez węzła własnego nie ma własnego obszaru, klik przejmuje pole albo stacja (para z rysunkiem) | `canvas/__tests__/celTrafienia.contract.test.ts` | stopnie obiektu bez węzła z jego gabarytem zamiast zerowego → 1 czerwony z 11 |
| Kamera: wskazanie, klawisze, historia w obie strony | `canvas/__tests__/nawigacjaKamery.contract.test.tsx` | wskazanie bez warunku skali czytania → 5 czerwonych z 14 |
| Przelot: ścieżka, czas, cel w kadrze, numer przelotu reduktora, warunek ruchu | `canvas/__tests__/przelotKamery.test.ts` | czas przelotu bez granic 120–500 ms → 2 czerwone z 47 |
| Warsztat: polecenie widoku × ruch, historia naprzód, skala czytania, okno, wskaźnik skali, pamięć kamery | `canvas/__tests__/nawigacjaKamery.workspace.test.tsx`; e2e `e2e/sld-kamera-przelot-okno.spec.ts` | historia bez drogi naprzód → 1 czerwony z 46 |
| Nazwy na widoku całej sieci: fikstura × okno × {stała wielkość, brak kolizji, pierwszeństwo} | `canvas/__tests__/nazwyStacjiPrzegladu.contract.test.ts`, `canvas/__tests__/nazwyStacjiNaKanwie.test.tsx` | ranga nazwy stacji 3 → 1 → 8 czerwonych z 52 |
| Kadry | `canvas/__tests__/camera.kadr.test.ts` | skala kadru ×1,2 i sufit ×3 → 49 czerwonych z 67 |
| Budżet DOM i okno renderu | `canvas/__tests__/budzetDom.contract.test.tsx` | okno renderu przepuszcza wszystko → 6 czerwonych z 11 |
| Trzy poziomy: LOD2 od 9/11 = 0,818 (pismo danych t2), LOD1 od 9/24 = 0,375 — oczekiwanie z liczb kontraktu, nie z funkcji produktu | `canvas/__tests__/widokOgolnyLod.contract.test.tsx` (iloczyn 3 fikstury × 9 skal × 6 cech) | skala wnętrza pól 9/16 zamiast 9/11 → 7 czerwonych z 34; pola jako odpływy w każdej skali (bez LOD0) → 7 czerwonych z 34 (pomiar 2026-11-13; wcześniejsza wersja testu brała oczekiwanie z `poziomSzczegolu` i obie iniekcje dawały po 1 czerwonym — poprawione) |
| Tła pól GPZ tylko w LOD2 (jeden próg wnętrza dla GPZ i stacji) | `canvas/__tests__/widokOgolnyLod.contract.test.tsx`, `canvas/__tests__/gpzAdnotacjeNaKanwie.test.tsx` | tła pól zawsze rysowane → 18 czerwonych z 34 w `widokOgolnyLod` |
| Histereza poziomu: kierunek × granica × położenie w paśmie; kanwa trzyma poziom przy zoomie kółkiem | `canvas/__tests__/stanLacznikowLod.contract.test.tsx` (opis „histereza”) | histereza wyłączona → 5 czerwonych z 61; kanwa podaje predykatowi wnętrza skalę bieżącą zamiast skali poziomu → 1 czerwony z 61 |
| LOD1: kafel stanu wyłącznie na łączniku podstawowym pola (wyłącznik > rozłącznik > odłącznik, remis — pierwszy w scenie) i na sprzęgle; transformator i portal nN pełnym glifem | `canvas/__tests__/stanLacznikowLod.contract.test.tsx` (opisy „łącznik podstawowy”) | kafel na każdym łączniku → 9 czerwonych z 61; odłącznik w randze wyłącznika → 3; remis — ostatni zamiast pierwszego → 2; transformator bez wnętrza w LOD1 → 1 |
| Stan sprzęgła × skala {0,3; 0,45; 0,6; 1,0} × motyw: kafel w barwie palety, przelot tylko przez zamknięty, szyna LOD0 przerwana przy sprzęgle otwartym, sprzęgło z własnym węzłem | `canvas/__tests__/stanLacznikowLod.contract.test.tsx` | sprzęgło bez kafla → 20 czerwonych z 61; przelot przez łącznik otwarty → 7; szyna bez przerw → 2; sprzęgło bez własnego węzła w LOD0 → 2; zbiór łączników toru bez wariantów QET → 10 |
| LOD0: stacja w symbolu bez „Szyna nN · 0,4 kV” i innych wierszy pasma nazw poza nazwą; tusz kadru z tym samym planem | `canvas/__tests__/stanLacznikowLod.contract.test.tsx` (opisy „LOD0 — opisy stacji”, „tusz kadru”) | redukcja opisów wyłączona → 3 czerwone z 61; tusz kadru bez redukcji → 1 czerwony z 61 |
| Kadr obiektu: podłoga = skala wejścia do LOD2 (0,9), nawigator zwija się, gdy tylko on spycha kadr pod podłogę | `canvas/__tests__/stanLacznikowLod.contract.test.tsx` (opis „zasłona nawigatora”), `canvas/__tests__/kadryObiektow.contract.test.tsx` | bez zwinięcia nawigatora → 1 czerwony z 61; podłoga na granicy 0,818 (kadr ląduje w paśmie histerezy, LOD1) → 3 czerwone z 56; podłoga 9/16 → 3 czerwone z 56 |
| Kadry obiektów (scenariusze geometrii kadru: Cały arkusz, Dopasuj stację, Dopasuj pole) × zasłony {brak, inspektor, inspektor i nawigator} × okno {1280×720, 1440×900} × 2 fikstury: treść sieci w wolnej kanwie, kadr obiektu w LOD2 z najmniejszym aparatem ≥ 9 px, obiekt mieszczący się — w całości w wolnej kanwie, większy — od początku | `canvas/__tests__/kadryObiektow.contract.test.tsx` | kadr ignoruje zasłony doków → 13 czerwonych z 56 (wersja pliku przed dopisaniem opisu „kadr stacji 3-polowej”) |
| Kadr obiektu z wnętrzem pól — jedno źródło `ZakresKadru.rozdzielnica` dla każdej drogi: cele stacja/sekcja/pole i „Dopasuj widok” zaznaczenia w całości wewnątrz stacji (zaznaczenie z odcinkiem spoza stacji — bez podłogi) | `canvas/__tests__/kadryObiektow.contract.test.tsx` (opis „jedno źródło”, cele „Dopasuj widok zaznaczonej stacji / pola”) | zaznaczenie bez podłogi → 5 czerwonych z 95; kanwa z dawnym warunkiem celu (stacja, sekcja, pole) → 3 czerwone z 95; wykryte w e2e: „Dopasuj widok” zaznaczonej stacji dawał 0,73 (cel „zaznaczenie” nie miał podłogi) |
| Kadr stacji z trzema polami SN z zabezpieczeniami (3 fikstury) × okno {1440×900, okno dające kadr 1,04 — szerokość stacji po ujednoliceniu pól, pomiar koordynatora}: LOD2, każda adnotacja zabezpieczeń stacji z węzłem, ramki bloków, oznaczenia Q na rysunku | `canvas/__tests__/kadryObiektow.contract.test.tsx` (opis „kadr stacji 3-polowej”) | dawne progi (pełny rysunek od 1,2, podłoga kadru 1,0) → 3 czerwone z 9 (wariant 1,04; skala 1,03 — LOD1); przy 1440×900 stacja tego drzewa mieści się przy suficie kadru 1,6, więc ten wariant sam progów nie rozróżnia |
| Kadr przy podłodze nie ucina obiektu mieszczącego się w wolnej kanwie: oś × {cel z tuszem mieści się, mieści się wyłącznie sam obiekt, obiekt dłuższy} | `canvas/__tests__/camera.kadr.test.ts` (opis „podłoga skali”, iloczyn szerokość × tusz × zasłona), `canvas/__tests__/kadryObiektow.contract.test.tsx` (oś widza: obiekt węższy od wolnej kanwy — w całości) | dawny kadr „od początku”, gdy cel szerszy od wolnej kanwy z oddechem → 4 czerwone z 75 i 2 czerwone z 95; środek wyłącznie dla celu z tuszem (bez reguły obiektu) → 2 czerwone z 75 i 2 czerwone z 95; wykryte w e2e 1280×720 z inspektorem: pole F02 stacji sekcyjnej ucięte o 26 px |
| Widok ogólny LOD0: adnotacje zabezpieczeń pola bez węzła i uchwytu | `canvas/__tests__/widokOgolnyLod.contract.test.tsx` | adnotacje zawsze rysowane → 14 czerwonych z 34 (pomiar 2026-11-13 przy progach 0,375/0,818; wcześniej 2 z 24 — fikstura GPZ 110 kV z blokami zabezpieczeń — dwie fikstury sieci nie niosą adnotacji, pierwsza wersja testu iniekcji nie wykryła) |
| Widok ogólny LOD0: oznaczenia aparatów w podpowiedzi | `canvas/__tests__/widokOgolnyLod.contract.test.tsx`, `canvas/__tests__/ustapienieSasiada.test.ts` | oznaczenia aparatów w planie poniżej progu → 14 czerwonych z 34 w `widokOgolnyLod` (pomiar 2026-11-13) |
| Widok ogólny LOD0: stacja z aparaturą jako symbol stacji | `canvas/__tests__/widokOgolnyLod.contract.test.tsx` | symbol stacji tylko do 0,25 → 4 czerwone z 34 (pomiar 2026-11-13) |
| Zmiana poziomu szczegółu zachowuje zaznaczenie i położenie stacji na ekranie | `canvas/__tests__/widokOgolnyLod.contract.test.tsx` (opis „zmiana poziomu szczegółu”) | pokryte iniekcjami LOD i kółka do kursora (`nawigacjaKamery.contract`) |
| Tabela „Pola GPZ” tylko od progu czytelności pisma | `canvas/__tests__/gpzAdnotacjeNaKanwie.test.tsx` | warunek w miejscu montowania usunięty → 1 czerwony z 13 |
| Nawigator: ramka zawsze z czterema krawędziami, miniatura i ramka z jednej projekcji, przesuw w obu kierunkach | `canvas/__tests__/minimap.test.ts`, `canvas/__tests__/workspacePanels.test.tsx` | bez minimalnego boku ramki → 5 czerwonych z 23 |
| Nawigator jako zasłona: jeden pas, tańszy | `canvas/__tests__/wolnaKanwa.workspace.test.tsx` | zawsze pas dolny → 1 czerwony z 6 |
| Zmiana rozmiaru kanwy (inspektor) odsłania zaznaczenie | `canvas/__tests__/wolnaKanwa.workspace.test.tsx`; e2e `e2e/sld-macierz-skali.spec.ts` | odsłanianie bez zaznaczenia → 1 czerwony z 6 |
| Pas narzędzi: grupa „widok” stała, jeden wiersz w każdej szerokości | `canvas/__tests__/toolbarLayout.contract.test.ts`, `canvas/__tests__/workspacePanels.test.tsx` | grupa „widok” zwijalna → 1 czerwony z 79 |
| Kurtyna kadru: opisy poza kadrem z kontrastem ≥ 4,5:1 w obu motywach | `canvas/__tests__/kurtynaKadru.contract.test.tsx` | krycie opisów 0,6 → 0,22 → 1 czerwony z 11 |
| Licznik stacji pełnym zdaniem „Stacja n z m” | `canvas/__tests__/kadrowanieWidoku.workspace.test.tsx`; e2e `e2e/k2-kadrowanie-nawigacja.spec.ts` | licznik „n/m” → 1 czerwony z 50 |
| Historia kadrów czyta kamerę z chwili polecenia (`Alt+←` tuż po zmianie kadru, potem `Alt+→`) | `canvas/__tests__/kadrowanieKameraTeraz.test.tsx`; e2e `e2e/sld-kamera-przelot-okno.spec.ts` | hook czyta kopię kamery z pierwszego renderu → 1 czerwony z 2 |
| Punkt stały skali czytania pod nakładką lassa | `canvas/__tests__/nawigacjaKamery.workspace.test.tsx`; e2e `e2e/sld-kamera-przelot-okno.spec.ts` | przypięte w etapie R7 (commit `d295a4a7e`) |

Ukrycie informacji nie usuwa danych z modelu. Brak obliczeń nigdy nie jest rysowany jako `0,00`.
