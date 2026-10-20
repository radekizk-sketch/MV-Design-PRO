# KARTA WYKONAWCZA — SLD-VIS-E2E, Fable + niezależni recenzenci

**Status:** DO REALIZACJI po pobraniu gałęzi; dokument planu, nie raport wykonania.  
**Punkt startu:** `main@8f7ed3c`; oddzielny PR #481 (`9f60564d`) ma status otwarty.  
**Dowód audytu:** `docs/audit/SLD_WIZUALNY_ODBIOR_2026-10-20.md`.  
**Podstawa:** `AGENTS.md` w korzeniu i `mv-design-pro/AGENTS.md`, kanon V12.xx, `docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md`, `docs/sld/SLD_CAD_SPEC_V3.md`.

## Misja

Przeprowadź techniczny i wizualny odbiór **istniejącej** kanwy `SldCanvasV3` na rzeczywistych scenariuszach SN oraz powiązanych widokach nN. Wykryj i napraw źródłowe przyczyny nieczytelności lub nieprawdziwej reprezentacji torów/stanów. Dowiedź end-to-end zgodności `ENM → porty/łączenia → projekcja SLD → wynik → interfejs → eksport` i przedstaw właścicielowi nowe obrazy obu motywów do zatwierdzenia.

Pracuj **równolegle z rozpoczętym programem Fable** w repo; nie kasuj, nie przepisuj i nie zawieszaj wcześniejszych kart. Ta karta jest osobnym strumieniem w planie, z uzgodnieniem konfliktów gałęzi i wspólnymi bramkami integracji.

## Granice autonomii

- **Nie** twórz nowej kanwy, mini-SLD ani atrap na potrzeby odbioru. Ponownie wykorzystaj `SldCanvasV3`, kompozycję `composeStation`, kanoniczne symbole i `SldCanvasV3Workspace`.
- **Nie** fałszuj napięć, stanów łączników, wyników solwera, liczby aparatów, katalogów OEM ani NOP. Brak danych prowadzi do jawnego komunikatu/blokady, nie do podmiany.
- Nie modyfikuj zamrożonych rdzeni, kanonu ani akceptowanych decyzji właściciela bez jednoznacznej przesłanki i osobnej decyzji.
- Zachowaj regułę dwóch projekcji SN i nN (portal po stronie transformatora); nie wprowadzaj mieszanej sceny jako obejścia B-02.
- UI i dokumenty po polsku technicznym, pełna anonimizacja danych obiektowych w zrzutach.
- Wypchnięcie nowej gałęzi i wystawienie PR tylko po dowodach i zgodnie z bieżącą polityką repo. **Nie scalaj** automatycznie.

## Zespół ośmiu ról recenzenckich

Przydziel niezależne zakresy. Każda rola ma zwrócić rekord `{id, wersja, przypadek, właściciel-elementu, dowód: PNG/SVG+ścieżka+parametry, problem, skutek, wymagane zachowanie, test negatywny, PASS/FAIL/UNKNOWN}`.

| Rola | Odpowiedzialność wyłączna | Kontrola adwersarialna |
|---|---|---|
| PSN | GPZ, magistrala, sekcje, odgałęzienia i kable | Odnajdź tor kończący się bez głowicy lub prawidłowego terminala |
| POLA | Szablony aparatów OEM i ich kolejność | Wykryj aparat dodany konwencją bez danych lub podwójne oznaczenie |
| RUCH | Stan OPEN/CLOSED/UNKNOWN, NOP, zasilanie wysp | Wykryj kolor niezgodny z rzeczywistym grafem |
| EAZ | CT, VT, zabezpieczenia, blokady, powiązanie wyłącznika | Wykryj pomiar/ochronę bez sprzężenia z prawidłowym aparatem |
| DER | PV, wiatr, BESS, TR blokowy, przepływ odwrotny | Wykryj DER wpięty bezpośrednio do niewłaściwego napięcia |
| SYMBOLE | PN-EN 60617 + identyfikacja aparatów | Wykryj nierozróżnialne funkcje (CB/DS/LBS/ES) |
| CAD | Rysunek L0–L2, geometria, proporcje, czytelność, druk | Wykryj kolizję istniejącą tylko w finalnym obrazie |
| DOWODY | Testy, reprodukowalność, migawka, bieg, raport | Obal twierdzenie PASS przez test negatywny lub brak dowodu |

**Niezależny nadzorca** nie może uznać wyniku bez minimum jednego kontrprzykładu poszukiwanego przez każdą rolę oraz wspólnej ponownej inspekcji końcowych obrazów.

## Kontrakty wykonania — partie

### Partia A. Faktyczny stan przed implementacją

1. Pobierz `main` i otwarte PR #481/#480/#478; wskaż dokładne SHAs. Zidentyfikuj to, co rzeczywiście jest scalone. Nie obiecuj funkcji niescalonych.
2. Sprawdź kompletne drzewo `SldCanvasV3`, `buildSceneV3`, `canvas/labelLegibility.ts`, `compose/{station,apparatusSequence,directions}.ts`, `scene/crossings.ts`, projekcję nN, e2e oraz skróty świadczące o istniejących ekranach.
3. Zapisz rejestr „wdrożone / niepowiązane / tylko dokument / tylko fixtura / brak” z plikami i numerami wierszy.
4. Nie przypisuj sobie poprawek już istniejących (`fieldCaptionAt`, `planSceneLabels`, `interiorCrossings`).

**DONE:** porównanie `main` vs E05, manifest uruchomienia, rozpoznanie 18 scenariuszy T01–T18 z audytu; brak nierozstrzygniętych wersji kodu.

### Partia B. Dowody z prawdziwej kanwy

1. Uruchom rzeczywiste UI z backendem, przejdź ścieżkę tworzenia modelu natywnymi kliknięciami.
2. Pokaż wizualnie: GPZ z polem → kabel SN → stacja przelotowa i odgałęźna → źródło PV/BESS → wyniki rozpływu i zwarcia.
3. Dla każdej stacji i wariantu LOD wykonaj obraz 1920×1080 i 1440×900, jasny/ciemny. Dla L2 osobne zbliżenie aparatury.
4. Każdego `run_ref` powiąż z `snapshot.revision`; jeżeli serwer nie zwrócił wyniku, oznacz `BRAK WYNIKU`, zamiast tworzyć liczbę w froncie.
5. Osobno generuj obrazy infrastruktury renderera (`renderToStaticMarkup` na fixturze) — nigdy nie mieszaj ich z dowodami natywnej interakcji i fizyki.

**DONE:** dowody obrazowe z manifestem `sha/fixture_or_project/revision/case/run/lod/theme/viewport/status`; zero fikcyjnych refów.

### Partia C. Naprawy jawnie wykazane

- VIS-06/VIS-07: `render_schemat10_w2c.tsx` koliduje etykietami, ponieważ korzysta z własnego pozycjonowania. Przenieś rendering dowodowy na wspólną ścieżkę etykiet zamiast przesuwać tekst w fiksturze.
- VIS-03/VIS-10: poprawka na gałęzi audytu oznacza fałszywą nakładkę ostrzeżeniem i usuwa hardcodowane ścieżki kontenera/przeglądarki. Potwierdź uruchomieniem i porównaniem PNG, nie samym kodem.
- VIS-08: zweryfikuj aktualny obraz po `fieldCaptionAt`; zgłoś nowy defekt wyłącznie przy reprodukcji na HEAD.
- VIS-01/VIS-02: NOP musi pochodzić z realnego ENM i wpływać na analizę grafu; sam kolor NO nie jest wynikiem.
- VIS-09/VIS-12: przepływ netto przez TR i wynik nieaktualny mają pochodzić z realnego biegu; brak danych lub wynik wadliwy oznacz jawnie.

**DONE:** patche wyłącznie w źródłowej warstwie odpowiedzialności; bez przetasowania glifów jednej demonstracji.

### Partia D. Odbiór przekrojowy i regresja

Uruchom:
```bash
cd mv-design-pro/frontend
npm run accept:sld-v3
npx vite-node scripts/sld_v3_render_roles.mjs
# następnie istniejące testy Vitest SLD, Playwright z rzeczywistym backendem,
# analizy ENM/pomiarów/EAZ, eksporty i guardy repo według dokumentacji kanonicznej
```

Weryfikacja szczegółowa:
- finalne etykiety: `plannedLabelCollisions == 0`, `plannedLabelObstacleCollisions == 0`, `plannedLabelsOutsideSheet == 0`, `plannedLabelsBelowScreenFloor == 0` dla etykiet rzeczywiście rysowanych;
- porty: `allSceneSegmentEndpointsAnchored`, `allFieldEntryConnectionsReachCableHead`, `allSourcesConnected`;
- skrzyżowania: `crossingBusGaps == 0`, brak fałszywych połączeń;
- numery pól: unikatowa para `station_ref + bay_ref`, oznaczenia aparatów i proweniencja;
- LOD: ta sama tożsamość i fizyczne połączenia bez utraty toru;
- obrazy: kontrast i proporcje, brak nachodzenia tekstu na symbole i wiersze danych;
- dane: jeden identyfikator biegu na wszystkie nakładki używane do tego samego obrazu;
- E05: klik `deviceRef` wybiera odpowiedni aparat, nie losowy element o takim samym `Q1`;
- eksport: geometria finalnego rysunku zgodna z ekranem i poprawne jednostki.

Dla każdej wyroczni dodaj **przypadek negatywny**, który daje FAIL po celowym uszkodzeniu tożsamości, geometrii, stanu lub danych. Test sprawdzający tylko obecność flagi nie jest dowodem.

**DONE:** testy e2e i porównanie obrazu po stronie rzeczywistej aplikacji; bez pustych deklaracji `PASS` lub dopisywania zielonych liczb do dokumentacji.

## Polityka statusu

`PASS` — fizyczny i obrazowy dowód wykonany na wskazanym SHA; `FAIL` — odtworzony defekt; `UNKNOWN` — nie uruchomiono lub nie ma wiarygodnego źródła danych; `NOT_APPLICABLE` — uzasadnione brakiem funkcji/obiektu (nigdy sposobem uniknięcia testu).

Przy braku przeglądarki, połączenia z backendem, niezgodności fixtur albo CI raportuj **UNKNOWN**, dołącz dokładny komunikat błędu i nie ogłaszaj odbioru.

## Pakiet odbiorowy dla właściciela

Jedna galeria obrazów **przed/po**, bez generowanych od nowa makiet SLD; każda scena: pełen widok i powiększenie rozdzielni, motyw jasny/ciemny, zakres LOD, stan zasilenia z danych i realny bieg obliczeniowy jeśli dotyczy. Obok każdego porównania zwięzły opis: „co jest źle → który ref modelu → który plik/funkcja → poprawka → wynik testu”.

Po zakończeniu recenzent wydaje **GO/NO-GO** per T01–T18 i dla całej aplikacji, a ostateczną ocenę wizualną zatwierdza właściciel. Nie scalaj zmian bez tej decyzji.
