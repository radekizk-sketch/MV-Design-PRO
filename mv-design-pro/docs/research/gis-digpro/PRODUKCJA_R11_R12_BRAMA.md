# GIS R11/R12 — bramka produkcyjna
**Decyzja właściciela:** 2026-10-24 — kontynuować do produkcji. UX-09 wznowione na gałęzi, ale produkcyjne GO wymaga dowodów.

## Kod faktycznie zapisany na gałęzi
- React ModelWarsztat: zakładka Mapa GIS (pilotaż), dostępna tylko z VITE_MV_GIS_R11=1 (domyślnie OFF).
- MapLibre GL JS 6.15.0, lokalnie dostarczony worker Vite, start offline bez zewnętrznych kafelków, style SCADA Neon.
- Lokalny import GeoJSON WGS84 punktów i linii z walidacją i filtrowaniem atrybutów. Wybór elementu w widoku i na liście.
- Kontrolowany WMS: lokalnie wczytany GetCapabilities 1.3.0, wybór Name/CRS, wymagane potwierdzenie licencji i świadoma zgoda na BBOX.
- Sprawdzenie ID obiektu na mapie w kanonicznym ENM wyłącznie w trybie odczytu; brak automatycznej łączności portów.
- Opcjonalny lokalny importer GPKG EPSG:2180/2176–2179 → GeoJSON EPSG:4326 przez GeoPandas/PyProj; raport pominięć, kontrola identyfikatorów i odcisk źródła.
- PLANS.md na gałęzi: UX-09 W TOKU, utrzymany NO-GO do produkcji i B-02.

## Uruchomienie i weryfikacja
1. cd mv-design-pro/frontend && npm ci && npm run type-check && npm test && npm run build
2. Uruchom Vite z VITE_MV_GIS_R11=1, otwórz przestrzeń Model sieci → Mapa GIS (pilotaż).
3. Test rzeczywistego WebGL: VITE_MV_GIS_R11=1 npm run test:e2e -- e2e/gis-r11-real-maplibre.spec.ts.
4. Lokalna konwersja GPKG: python tools/gis/gpkg_preview_r12.py --source AUTORYZOWANY.gpkg --layer WARSTWA --id-field ID --output PROJEKT.geojson
5. Testy opcjonalnej konwersji: python -m pytest -q tools/gis/test_gpkg_preview_r12.py.

**Lokalny wynik R12:** 8/8 PASS (cztery ostrzeżenia pyproj/NumPy). Syntetyczne GPKG EPSG:2180 → EPSG:4326: 4 obiekty, 3 linie/punkty przyjęte, 1 wielobok jawnie pominięty. Źródło SHA256: 709f0265ef353127abb263a1ae373b7196bc900678a98d143d8cb5d98232b671.
**CI GitHub/pełny TypeScript/Playwright WebGL:** bez zielonego dowodu na ten moment. PR pozostaje draft. Nie twierdzić, że wykonano te testy.

## Bramy obowiązkowe
- G1: npm ci, typecheck, Vitest, lint, pełny backend CI bez czerwieni.
- G2: prawdziwy WebGL i mapy WMS, prywatność BBOX, brak nieautoryzowanych zapytań, obsługa CORS, offline.
- G3: rzeczywisty profil eksportu dpPower ENEA, dozwolone warunki przetwarzania, kontrola zakresu oraz wersji.
- G4: geometria i długości — osobno planarna, 3D, wykonawcza, elektryczna; bez niejawnych współczynników.
- G5: sprawdzone porty/terminale, dobór katalogowy i kanoniczna operacja ENM, bez drugiej topologii.
- G6: parytet GIS–SldCanvasV3–LF/SC–White-Box–raport i odtworzenie rewizji po zapisie.
- G7: właściciel odbiera SLD B-02 (nadal odrzucone); tylko SN, GPZ jako źródło.
- G8: uwierzytelnianie, role, ochrona infrastruktury i audyt dostępu, procedura wycofania wdrożenia.

## Istotne ograniczenia
R11 na obecnym etapie jest działającym kodem komponentu w gałęzi, lecz nie ma potwierdzonej pełnej kompilacji produkcyjnej. Aktualna mapa jest projekcją, nie edytorem elektrycznym ENM. Podgląd GPKG pozostaje narzędziem lokalnym, bez autoryzowanego API. WMS daje obraz, nie zweryfikowaną geometrię kolizji.
Zamknięcie produktu wymaga jednego scenariusza: DIGPRO → mapa → porty/katalog → ENM → LF/SC → SLD → raport → zapis/odczyt, bez obejść i fikcyjnych wyników.