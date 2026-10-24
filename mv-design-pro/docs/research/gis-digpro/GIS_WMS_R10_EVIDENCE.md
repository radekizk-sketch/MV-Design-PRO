# GIS R10 — warstwy mapowe, WMS GetCapabilities i przygotowanie MapLibre

**Data:** 2026-10-24. **Status:** LABORATORIUM BADAWCZE, nieukończone wdrożenie produkcyjne. Karta UX-09 ma status P3/STOP w nadrzędnym PLANS.md. B-02 pozostaje odrzucone.

## Wykonane
1. Rejestr czterech oficjalnych adresów usług GUGiK z katalogu R07. Adres źródła jest zablokowany w kodzie; klient nie może podać dowolnego URL do backendu.
2. Parser lokalnie dostarczonego WMS GetCapabilities 1.3.0 (XML) z limitem wielkości, odmową DTD/ENTITY, limitem liczby i głębokości warstw, dziedziczeniem CRS, identyfikatorami Name i Title. **Brak pobierania XML przez backend.**
3. Wybór warstwy tylko z dokumentu GetCapabilities i tylko przy zadeklarowanym EPSG:3857. Żaden identyfikator LAYERS nie jest zgadywany.
4. Jawna zgoda użytkownika przed przygotowaniem szablonu MapLibre RasterSource, który zawiera BBOX={bbox-epsg-3857}, CRS=EPSG:3857, WMS 1.3.0 i PNG 256×256.
5. Endpointy GET /api/gis-lab/r10/sources i POST /api/gis-lab/r10/layer-preview. Bez dostępu do ENM, solwerów i danych operatora.
6. Ekran /layers: katalog, import XML, analiza warstw, zgoda, podgląd wygenerowanego źródła. Z warsztatu R09 można przejść przyciskiem Źródła mapowe. Próbka syntetyczna oznaczona wprost jako nieistniejąca na serwerze.
7. Testy jednostkowe, HTTP i stron HTML: backend/tests/test_gis_wms_r10.py.

## Uruchomienie
W katalogu mv-design-pro/backend:

    PYTHONPATH=src pytest -q tests/test_gis_workspace_r09.py tests/test_gis_wms_r10.py
    PYTHONPATH=src uvicorn api.gis_lab_app_r09:app --host 127.0.0.1 --port 18009

Otwórz http://127.0.0.1:18009/layers. Nie wystawiać poza localhost.

## Precyzyjne ograniczenia
- Parser przetwarza dokument **dostarczony przez użytkownika**, a nie pobrany z serwera GUGiK. Nie potwierdza autentyczności, bieżącej dostępności, warunków prawnych, CORS, ani zgodności serwera z EPSG:3857 w praktyce.
- Wygenerowanie URL GetMap nie jest żądaniem HTTP. R10 **nie uruchamia MapLibre WebGL, nie renderuje kafelków i nie jest jeszcze mapą**.
- Rejestr jest wykazem punktów końcowych do weryfikacji, a nie certyfikatem ich działania. Nie należy utożsamiać GUGiK KIUT z kompletnym GESUT.
- Zgoda w R10 dotyczy tylko przygotowania adresu źródła; brak rzeczywistego pobierania map. Przy integracji MapLibre należy wprowadzić trwałe świadome włączenie sieci, kontrolę pochodzenia i obsługę odmowy CORS.
- WMS jest obrazem, nie warstwą wektorową do automatycznej analizy kolizji. Brak danych geometrii kabli, rzędnych, głębokości i dokładności.
- SLD V3, ENM, wyniki LF/SC i PLANS.md pozostają nietknięte. Nie ma publikacji ani automatycznego wyznaczania długości elektrycznej.

## Następna karta techniczna
**R11 — rzeczywista mapa MapLibre** po przygotowaniu zależności npm z lokalnym bundlowaniem i workerem; przełącznik offline/online, warstwy WMS wyłącznie po weryfikacji GetCapabilities z zaufanego kanału, ochrona obszaru BBOX, wizualizacja syntetycznej sieci R09, wskazywanie obiektu w mapie i drzewie. Dopiero potem import uprawnionych danych DIGPRO oraz bramki ENM/SLD i obliczeń. Brak automatycznej zgody na produkcję bez zmiany nadrzędnego planu.
