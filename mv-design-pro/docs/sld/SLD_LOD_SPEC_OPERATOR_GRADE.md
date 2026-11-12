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
- **Tor bez klasy.** Elementy toru nie mają klasy i są rysowane w każdej skali: przewody, szyny, aparaty, stany, punkty rozcięcia, ramka i linie bloku zabezpieczeń, obrys stacji.
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
  - Historia kadrów działa wstecz i naprzód (`Alt+←` / `Alt+→`). Nowe polecenie widoku kasuje drogę naprzód.
  - Kółko i szczypanie działają natychmiast, do kursora.
  - Wszystkie skróty są w jednym rejestrze `ui/sld/core/keyboardShortcuts.ts` z przypiętą obsługą (test rejestru) i są widoczne w pomocy skrótów.
- **Wymagania kontraktu, których stan wdrożenia prowadzi wiersz `UX-04/SLD-SKALA-I-NAWIGACJA` rejestru `PLANS.md` §C:**
  - przelot kamery (van Wijk i Nuij 2003, 120–500 ms, przerywany wejściem użytkownika, przy `prefers-reduced-motion` cięcie, atrybut stanu kamery dla e2e);
  - skala czytania pod klawiszem `1`;
  - powiększenie oknem (`Z` + przeciągnięcie, przycisk w pasku);
  - wskaźnik skali z menu (cała sieć, zaznaczenie, 100 %);
  - sterowanie kamerą kółkiem i przeciąganiem nad nawigatorem;
  - pamięć kamery i zaznaczenia per projekt przy wyjściu z przestrzeni schematu.
- **Kolizja klawisza `1`.** Klawisz koliduje z przełączaniem przestrzeni pracy klawiszami `1–N` (`ui2/shell/AppShell.tsx`). Kolizja jest zgłoszona architektowi.
- **Bez nazwanych zakładek widoków.** Cele hierarchii, wyszukiwanie i historia pokrywają tę potrzebę bez nowego magazynu danych (decyzja, nie odroczenie).

**R8. Wydajność z pomiaru.**
- Ruch kamery zmienia jedno przekształcenie grupy; scena nie jest przebudowywana.
- Napisy klas niewidocznych nie trafiają do DOM.
- Render jest odcinany, scena nie (`canvas/oknoRenderu.ts`). Obowiązują dwie reguły:
  1. **Okno renderu.** Obiekt, którego obwiednia nie przecina okna kamery poszerzonego o pół widoku z każdej strony, nie dostaje węzła.
  2. **Obrys bez wnętrza.** Symbol o rozmiarze ekranowym poniżej 3 px rysuje sam obrys gabarytu w kolorze stanu. Zostają ten sam `ref`, atrybuty stanu, cel trafienia i `data-bez-wnetrza`. Od 3 px wzwyż rysuje się pełny glif.
- Zamiana geometrii — nigdy.
- Budżety węzłów DOM przypina `canvas/__tests__/budzetDom.contract.test.tsx` (kadr × fikstura × rozmiar kanwy, z iniekcją).

Liczba węzłów DOM w warsztacie, sieć wzorcowa 52 stacji:

| Etap | Cała sieć, 1200×800 | Cała sieć, 1920×1080 | Kadr roboczy (skala ≈ 1,0) |
|---|---|---|---|
| Przed kartą (poziomy, scena zwinięta) | 1 867 | — | 8 296 |
| Po etapie 2 (jedna scena, bez odcinania) | 21 844 | — | 26 160 |
| Po R8 (okno renderu, jedna warstwa trafień, obrys bez wnętrza) | 5 897 | 11 367 | 1 806 |

**R9. Klasa, nie instancja.**
- **Widok nN.** Ten sam kontrakt obowiązuje widok nN (`lv-domain/visualGrammar.ts`). Pomiar 2026-11-12: wszystkie elementy toru w rejestrze elementów kanwy nN są widoczne na każdym poziomie, więc toru nie ukrywa.
- **Eksport i wydruk.** Zawsze pełna scena, wszystkie klasy, niezależnie od skali kanwy. Kanwa rysuje się na czas budowy arkusza w trybie dokumentu (`trybDokumentu`): skala rysunku 1, plan etykiet w skali nieskończonej (każdy napis w rozmiarze naturalnym), bez okna renderu, bez obrysów bez wnętrza, bez kurtyny kadru. Plik jest bajt w bajt ten sam z każdego kadru kamery (`export/__tests__/formatyEksportu.test.tsx`, opis „R9”, z iniekcją). Pełna scena niesie napisy pionowe (`rotate(-90, cx, cy)`) i obrócone części glifów, więc tor PDF/DXF (`export/svgPrimitives.ts`) odwzorowuje przekształcenia sztywne `translate`/`rotate` (punkty przez macierz, okrąg z tym samym promieniem, tekst z kątem: PDF — macierz tekstu, DXF — grupa 50 encji TEXT); skala, pochylenie i `matrix` nadal są błędem jawnym (`export/__tests__/eksportDokumentu.test.ts`, iloczyn element × postać obrotu, z iniekcją).
- **Martwy kod v2** (`ui/sld/v2/lod/**`, `engine/sld-layout/lodController.ts` z testami) jest skasowany.
- **Konsumenci kotwic zwiniętych postaci** czytają kotwice jednej sceny: `sld-overlay/**`, sondy GPZ, kompletność rysunku, most refów wyników.

## 3. Niezmienniki (przypięte testami)

| Niezmiennik | Gdzie przypięty |
|---|---|
| Zbiór elementów toru i ich geometria nie zależą od skali | Strażnik `sld_scena_niezalezna_od_skali_guard.py`; `v3/scene/__tests__/ciagloscToru.test.ts` |
| Gęstość: skala × klasa informacji, bez migotania na progu | `canvas/__tests__/gestoscInformacji.contract.test.ts` |
| Tożsamość: każdy GPZ i stacja ma napis albo dymek w każdej skali; kolizje deterministyczne | `canvas/__tests__/tozsamoscEtykiet.contract.test.ts` |
| Znaki stanu: skala × rodzaj znaku | `canvas/__tests__/znacznikiStanu.contract.test.tsx` |
| Trafianie: skala × obiekt | `canvas/__tests__/trafienieKanwy.contract.test.tsx` |
| Kamera: wskazanie, klawisze, historia w obie strony | `canvas/__tests__/nawigacjaKamery.contract.test.tsx` |
| Kadry | `canvas/__tests__/camera.kadr.test.ts` |
| Budżet DOM | `canvas/__tests__/budzetDom.contract.test.tsx` |

Ukrycie informacji nie usuwa danych z modelu. Brak obliczeń nigdy nie jest rysowany jako `0,00`.
