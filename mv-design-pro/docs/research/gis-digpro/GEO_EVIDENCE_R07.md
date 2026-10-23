# GIS R07 — ogólnopolski katalog map i workflow geodezyjny SN
**Data odniesienia:** 2026-10-24. **Status:** BADANIA / DRAFT / UX-09 P3 STOP. Nie scalić jako funkcjonalności produkcyjnej bez zmiany nadrzędnego PLANS.md i bramki E2E.
**Kod:** frontend/src/ui/gis/geoportalSourcesR07.ts. Laboratorium i raport testów R07: oddzielny pakiet właściciela.

## 1. Użytkownik: proces inżyniera SN
Wybierz obszar inwestycji → automatycznie zaproponuj krajowe i miejscowe usługi danych → mapa główna MapLibre (ortofotomapa lub mapa zasadnicza) → warstwy EGiB, GESUT/KIUT, MPZP/POG, ochrona przyrody, NMT → nałóż zanonimizowany/autoryzowany eksport DIGPRO → zaznacz trasę istniejącego kabla i proponowanego → przeanalizuj różnice i możliwe kolizje → wybierz typ kabla, potwierdź długość i porty → wyłącznie istniejąca komenda ENM → przelicz solwery → SLD V3 i raport dowodowy.
Żaden obraz WMS nie staje się automatycznie obiektem ani impedancją ENM.

## 2. Konkretnie dostępne usługi i źródła oficjalne (URL dokumentacji lub usług)
| Priorytet | Dane | Źródło / uwagi |
|---|---|---|
| P0 | Ortofotomapa standardowa GUGiK | https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution |
| P0 | EGiB / KIEG (ewidencja działek i budynków) | https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow |
| P0 | KIUT uzbrojenie terenu (WMS, obraz, bez topologii) | https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu |
| P1 | KIBDOT obiekty mapy zasadniczej | https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaBazDanychObiektowTopograficznych |
| P1 | MPZP gminy Tarnowo Podgórne | https://mpzp.igeomap.pl/cgi-bin/302117 |
| P1 | Plan ogólny Tarnowo Podgórne | https://wms.e-mapa.net/cgi-bin/pog/302117 |
| P1 | K-GESUT (to **nie** pełna baza kabli, wybrane obiekty) | https://mapy.geoportal.gov.pl/wss/geosrv/MapServer_KGESUT_WMS/wms |
| P1 | Warstwy przyrodnicze GDOŚ WMS | https://sdi.gdos.gov.pl/wms |
| P2 | GDOŚ dane wektorowe WFS, tylko jeśli uprawnione | https://sdi.gdos.gov.pl/wfs |
| P2 | Krajowa Integracja Numeracji Adresowej WFS, NOWY adres z 2026-09-08 | https://mapy.geoportal.gov.pl/wss/ext/wfs/KrajowaIntegracjaNumeracjiAdresowej |
| P2 | NMT / NMT WCS, profile wysokościowe, wysokość z danych liczbowych | https://www.geoportal.gov.pl/pl/dane/numeryczny-model-terenu-nmt/ |
| P2 | Hydroportal strefy zagrożenia i ryzyka powodzi | https://www.isok.gov.pl/hydroportal.html |
| P1 | REJESTR URBANISTYCZNY WMS/WFS/CSW, MPZP/POG, nowe źródło 2026-07 | https://rejestr-urbanistyczny.gov.pl/published |
| P1 | Rejestr portali gminnych/powiatowych | https://mapy.geoportal.gov.pl/wss/ext/PortaleMapowe |
| P1 | GEOPOZ Portal Branżowy (ewidencja rozbieżności GESUT) | https://portal.geopoz.poznan.pl/gesut/ |

Ważne: mapa GUGiK = obraz do oglądania; wektorowy GESUT na warunkach starostwa, często odpłatnie. Prowadzenie trasy na podstawie wyświetlonego WMS NIE zapewnia automatycznej analizy kolizji z elementami danych źródłowych. Wymagane WFS/GML/GPKG/uzgodnione dane wektorowe z odpowiednią licencją, geometrią i zakresem.

## 3. Inwariant bezpieczeństwa i precyzji
- Domyślna praca offline/prywatna: zero zapytań mapowych do obcych usług i brak CDN. Wyjście do usługi tylko po świadomym zatwierdzeniu użytkownika i licencji; wysłanie żądania GetMap ujawnia obszar BBOX serwerowi.
- MapLibre wymaga lokalnie zainstalowanego pakietu i poprawnego workera, bez zewnętrznej telemetrii.
- Podkłady WMS mają odrębny rejestr źródeł, GetCapabilities i identyfikator warstwy, dozwolony CRS, licencję, datę, zakres, przejrzystość. Nazwy LAYERS wynikają z GetCapabilities; nie wolno ich zgadywać.
- WMS w projekcji mapowej EPSG:3857; w analizach odległości i działek stosować poprawny CRS metryczny EPSG:2180, dla danych szczegółowych PL-2000, a nie długość pikseli.
- NMT/NMPT WCS lub numeryczny raster: nie obliczać wysokości na podstawie barwy WMS.
- Dane obce są źródłową projekcją, nie poprawiają po cichu ENM. Przecięcia tras geometrii nie oznaczają węzłów elektrycznych.
- Każdy obiekt DIGPRO: pochodzenie, znacznik zakresu eksportu, identyfikator źródłowy, mapa powiązania z ENM, status potwierdzenia. Brak w eksporcie nie oznacza usunięcia.
- KIUT ≠ K-GESUT. Nie wnioskować o kompletnym przebiegu kabla z K-GESUT.

## 4. Potencjalne funkcje najwyższej wartości
1. **Analiza korytarzy SN:** nakładka trasy kabla względem działek, dróg, ortofoto, uzbrojenia i planów. Wynik: wykaz odcinków + ryzyka, nie automatyczna zgoda na budowę.
2. **Wykaz działek i uzgodnień:** przecięcia geometrii z uprawnionymi danymi EGiB/WFS; stan postępowania i odsyłacz do podstawy; bez ujawniania danych osobowych.
3. **Raport niezgodności DIGPRO ↔ GESUT:** identyfikatory, opis rozbieżności, geometria i przypisanie działania do osoby uprawnionej; inspiracja GEOPOZ.
4. **Wykrywanie kolizji przestrzennych:** tylko na autoryzowanych wektorach 3D / potwierdzonych rzędnych i głębokościach; konflikt wizualny WMS to jedynie sygnał do sprawdzenia.
5. **NMT/NMPT i LiDAR:** profil terenu, przekrój linii napowietrznej, weryfikacja zwisów i minimalnych odległości jako osobne funkcje inżynierskie.
6. **Warianty tras:** krótsza vs zgodna z ograniczeniami, z jawnie ważonymi kosztami i długościami.
7. **Warstwy wynikowe:** prąd, obciążenie procentowe, spadek napięcia, zwarcia, status połączeń, odmowa przy nieaktualnej rewizji.
8. **Źródła map po lokalizacji:** wyszukiwarka rejestru usług krajowych/samorządowych; wybór lokalnych podkładów bez zgadywania endpointów.
9. **Archiwum podkładów i map wydruku:** dowód użytych warstw (URL, wersja, data, licencja, zakres), pobrane lokalnie wyłącznie jeśli uprawnione.
10. **Planowanie OZE/BESS:** podgląd stref planistycznych i ograniczeń środowiskowych powiązany z rzeczywistym PCC i ograniczeniami SN.

## 5. Kontrakt pracy nieprzerwanej — jeden nadrzędny plan, małe kompletne przyrosty
Pracuj autonomicznie, nie zatrzymuj się po sporządzeniu raportu ani po prototypie. Prowadź wykonanie w sekwencji **AUDYT REPO → IMPLEMENTACJA PIONOWA → TESTY E2E → PRZEGLĄD ADWERSARIALNY → POPRAWKI → DOWODY → następna karta**.
Nie rozpoczynaj niezależnego nowego programu ani repozytorium. Wykorzystaj PR #494, istniejące R03–R07, \`PLANS.md\` i dokumenty kanoniczne. Status postępu aktualizuj wyłącznie w \`PLANS.md\`, z wyjątkiem materiału badawczego na izolowanej gałęzi, dopóki GIS/UX-09 ma P3/STOP. Nie wyprowadzaj domyślnego \`GO\` z zielonych testów laboratoryjnych. B-02 odbiera właściciel. Zmiana modelu i fizyki tylko po dowodzie i zgodnie z bramkami B-01.

**Nie udawaj pracy asynchronicznej ani nie deklaruj zakończenia bez dowodu.** Gdy blokuje prawdziwa autoryzacja (np. dane ENEA), realizuj niezależne testy na syntetykach, opisz blokadę i przejdź do kolejnej niezależnej karty. Nie podstawiaj fikcyjnego eksportu ENEA ani funkcji serwera gminnego. Zrzut atrapy interfejsu nie jest dowodem działania WebGL.

## 6. Test odbiorowy wymagany przed produkcją
Na prawdziwym MapLibre WebGL załaduj wybrane usługi WMS po uzyskaniu zgód, potwierdź pobranie obrazów, warstwy, odczyt obiektów tylko zgodnie z funkcjami usługi, skalę, prawa i dostępność. Wczytaj autoryzowany GPKG DIGPRO, rozpoznaj połączenia wyłącznie z jawnych terminali i portów, utwórz gałąź ENM, wybierz katalog, uruchom LF/SC, potwierdź parytet z SldCanvasV3, zapis/ponowny odczyt i raport. Wszystkie rozbieżności mają być widoczne jako blokady albo ostrzeżenia.

**Obecnie R07 dostarcza katalog i adapter zapytań WMS oraz test laboratoryjny sterowania warstwami, nie wykonaną produkcyjną integrację MapLibre ani dostęp do autentycznych usług/data ENEA.**
