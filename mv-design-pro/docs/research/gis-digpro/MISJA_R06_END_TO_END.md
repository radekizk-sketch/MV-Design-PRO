# MV-DESIGN PRO — GIS / MapLibre / DIGPRO R06
## Mandat wykonawczy, podległy kanonowi V12.xx i jednemu \`PLANS.md\`

**Status PR:** BADAWCZY / NIE SCALAĆ jako zatwierdzonej funkcji GIS.
**Zakres:** SN 6–30 kV; GPZ tylko jako źródło zasilania SN; SN–TR–nN w jednym ENM.
**Priorytet obowiązującego planu:** GIS UX-09 = P3/STOP. Dyrektywa rozwojowa właściciela uzasadnia badania na osobnej gałęzi, nie automatycznie włączenie do produkcji.

### Misja inżyniera i rezultat w interfejsie
Projektant otwiera mapę, importuje autoryzowany eksport dpPower (najpierw GPKG, alternatywnie SHP/DBF), rozpoznaje stacje i linie, porównuje dwa stany sieci, wybiera odcinek, edytuje jego trasę, tworzy nową linię SN, wybiera katalog kabla/przewodu i przyporządkowuje jawne porty połączeń. Zatwierdzony wariant trafia przez istniejące operacje ENM do SLD V3 i solverów. Wyniki rozpływu, zwarć, prądów i spadków napięcia pojawiają się na mapie i schemacie z jednostką, rev/hash i informacją o świeżości. Zapis/odczyt projektu i raport z dowodami muszą odtwarzać ten sam wynik.

### Jedenaście praw
1. Kanoniczny ENM = jedyna prawda elektryczna. GIS, SLD SN/nN i nakładki obliczeń są projekcjami.
2. Zbieżność współrzędnych, przyciąganie i geometryczne skrzyżowanie NIE tworzą połączenia.
3. Rozróżniać długości: planarną EPSG:2180, przestrzenną 3D, wykonawczą i elektryczną. Zero domyślnych narzutów.
4. Dane DIGPRO przechowywać jako niezmienialną warstwę źródłową; jawne mapowanie identyfikatorów i metadane zakresu.
5. Zmiana geometrii prezentacji ≠ zmiana danych elektrycznych. Zmiana fizycznej długości powoduje rev ENM + unieważnienie wyników.
6. Brak obiektu w eksporcie częściowym to NIEOBSERWOWANY, nie USUNIĘTY.
7. Nieznane stany łączników, terminale i parametry katalogów blokują analizy wymagające tych informacji.
8. Dane ENEA wyłącznie po autoryzacji i w zatwierdzonym środowisku bez zewnętrznej telemetrii/kafelków/CDN; próbki w PR syntetyczne.
9. Nie budować drugiego modelu topologicznego, solvera ani SLD — wykorzystać istniejące ENM, SldCanvasV3 i analizę.
10. Wszelkie zmiany w ENM wyłącznie przez walidowane komendy domenowe, dziennik, wersje, porównanie rev i odcisk źródła.
11. Wszystkie wyniki UI muszą mieć rzeczywiste źródło, jednostkę i status; niedostępne funkcje nie są imitowane.

### Karty produktu
- **GIS-1 Import:** GPKG/SHP/DBF/DXF (DXF podkład), kontrola CRS, identyfikatorów, obiektów, uprawnień i geometrii.
- **GIS-2 Mapa:** lokalne MapLibre WebGL, warstwy, identyfikatory, wybieranie obiektów, wyszukiwarka, pan/zoom i pomiar.
- **GIS-3 Edycja:** przeciąganie wierzchołków, tworzenie/splatanie odcinków geometrycznych, cofanie, powrót do źródła, wariant.
- **GIS-4 Dane elektryczne:** inspektor, katalog, porty, pola stacji i przypadki topologiczne w ENM.
- **GIS-5 Obliczenia:** wyniki z kanonicznych solverów, dowód porównania z SLD, świeżość.
- **GIS-6 Eksport:** archiwum projektu, mapy, DXF/GPKG wg licencji, raport z metadanymi i śladem obliczeń.

### Kontrakt obecnego przyrostu R06
R06 daje: kontrolę GeoJSON WGS84 z danych **syntetycznych**, wykrywanie nowych/zmienionych/nieobserwowanych obiektów, deterministyczny odcisk raportu, przegląd podglądowych długości, odmowy dla błędnych i wrażliwych danych, opcjonalne \`/api/gis-lab/r06/status\` i \`/api/gis-lab/r06/reconcile\`. API jest **domyślnie wyłączone**, odmawia rzeczywistych identyfikatorów i nie posiada komend ENM.

Aby **tylko w środowisku nieprodukcyjnym** włączyć API laboratorium: \`MV_ENABLE_SYNTHETIC_GIS_LAB_R06=1\`. Zakazane w \`APP_ENV=production\`, \`ENVIRONMENT=production\` lub \`MV_DESIGN_ENV=production\`. Publiczny import operatora nie został zaimplementowany.

### Kryteria odbioru docelowego E2E
\`GPKG DIGPRO → weryfikacja danych → mapa MapLibre → szkic kabla SN → potwierdzenie portów/katalogu → operacja ENM → rewizja → rozpływ/zwarcia → SldCanvasV3 → raport → ponowne otwarcie → parytet rev/wyników\`.

Testy: Python/TypeScript, brak mutacji ENM, geodezja i długości EPSG:2180 z wyrocznią, CORS/bezpieczeństwo i rozmiar wejścia, wydajność 1k/10k/50k, **prawdziwy** MapLibre WebGL i test przeglądarkowy, zakaz przecieków ENEA do zewnętrznych usług, parytet wyników i odbiór wizualny B-02. Zielone testy biblioteki lub atrapy nie zamykają tej bramki.

### Otwarte przeszkody
Brak autoryzowanego profilu pól/topologii eksportu ENEA, prawdziwego bundla MapLibre w środowisku testów, wdrożenia do głównej powłoki UI2, zatwierdzonego zapisu przez operacje ENM, danych katalogowych i końcowego E2E solwerów. Raportować uczciwie jako NIEZWERYFIKOWANE. Ten plik nie zmienia \`PLANS.md\` i nie nakazuje scalenia.
