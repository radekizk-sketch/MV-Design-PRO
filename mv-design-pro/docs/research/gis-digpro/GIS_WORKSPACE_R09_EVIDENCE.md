# GIS R09 — warsztat roboczy sieci SN, MDI/PSM

**Status:** WYŁĄCZNIE BADANIA, UX-09 P3/STOP w nadrzędnym PLANS.md; brak dopuszczenia do integracji produkcyjnej. **Data:** 2026-10-24.

## Co rzeczywiście dostarczono
- backend/src/application/gis/psm_mdi_workflow_r08.py — import GeoJSON z jawną mapą pól i odrębną geometrią źródłową.
- backend/src/application/gis/workspace_r09.py — deterministyczne odtwarzanie dziennika komend, rewizje, kontrola konfliktów, porównanie z bazą, hierarchia, inspektor, projekcja GeoJSON i walidacja.
- backend/src/api/gis_workspace_r09.py — HTTP POST /api/gis-lab/r09/workspace-preview, tylko synthetic=true, kontrola schematu, limit 1,5 MB, odmowa obcego Origin, no-store.
- backend/src/api/gis_lab_app_r09.py — **oddzielny** serwer badawczy. Produkcyjne api.main pozostaje niezmienione.
- backend/src/api/static/gis_r09.html — polski, ciemny ekran: hierarchia, geometria SVG, inspektor, edycja nazwy/rodzica, cofanie, ponawianie, odrzucanie zmian, lista walidacji i różnic.
- backend/tests/test_gis_workspace_r09.py — regresje i odmowy w zakresie laboratoryjnym.

## Uruchomienie
W katalogu mv-design-pro/backend:
1. PYTHONPATH=src pytest -q tests/test_gis_workspace_r09.py
2. PYTHONPATH=src uvicorn api.gis_lab_app_r09:app --host 127.0.0.1 --port 18009

Otwórz lokalnie http://127.0.0.1:18009/. Nie uruchamiać na 0.0.0.0 ani w produkcji. Nie podłączać prawdziwych eksportów DIGPRO.

## Wyniki lokalne, niezależne od CI GitHub
- Zestaw R08+R09 w pakiecie roboczym: **66/66 pytest PASS** przy PYTHONPATH=src:src/application/gis:src/api.
- Laboratorium HTTP FastAPI: status, edycja, walidacja, odmowa publikacji, obcy Origin, zbyt duży ładunek.
- Chromium: interfejs wczytany, 6 obiektów syntetycznych, zmiana nazwy, cofnięcie, ponowienie, przycisk publikacji nieaktywny. **Ważne ograniczenie:** bezpośrednie połączenie Chromium → localhost jest blokowane przez środowisko; test przeglądarkowy używa przechwycenia HTTP i prawdziwego TestClient FastAPI. Nie jest to test sieciowy WebGL ani zewnętrznych podkładów.
- Nie wykonano pełnej regresji całego repo, CI GitHub ani testów na danych ENEA.

## Kontrakt bezpieczeństwa
- **Zero mutacji ENM.** Brak endpointu publikacji, brak uruchomienia solwerów, brak operacji na SldCanvasV3.
- Identyfikatory PortRef z danych GIS pozostają niezweryfikowanymi kandydatami; przecięcie geometryczne nie oznacza połączenia elektrycznego.
- WMS i Geoportal **nie są podłączone** do R09. SVG jest syntetycznym podglądem geometrii, nie mapą MapLibre.
- synthetic=true to znacznik deklaratywny i **nie dowodzi**, że przesłane dane są syntetyczne. Uruchamianie tylko na kontrolowanych fixture'ach.
- Wybór elementu i inspektor pokazują syntetyczne identyfikatory portów, ale publiczna projekcja GeoJSON ich nie ujawnia.
- Zmiana geometrii wymaga ponownego wyznaczenia długości i parametrów w domenie inżynierskiej, nigdy automatycznego przeliczenia impedancji z pikseli.

## Następny pionowy przyrost — dopiero po decyzji właściciela w ramach PLANS.md
1. Kontrolowany adapter autoryzowanych eksportów DIGPRO z pochodzeniem danych, mapowaniem identyfikatorów i wersji.
2. MapLibre WebGL, podkłady WMS/WFS/WMTS, polskie CRS, geometria w projekcji EPSG:2180.
3. Katalog urządzeń i zatwierdzenie PortRef przez istniejące operacje domenowe ENM.
4. Jedna sieć elektryczna — osobne projekcje GIS i SldCanvasV3; rewizje i unieważnianie wyników.
5. Prawdziwy scenariusz GPZ→SN→TR→nN→PCC z LF/SC, raportem i zapisem/odczytem; odbiór B-02 przez właściciela.

**Nie scalać do main jako gotowego GIS.** Zgodnie z kanonem nie aktualizowano PLANS.md w odizolowanej gałęzi eksperymentalnej.
