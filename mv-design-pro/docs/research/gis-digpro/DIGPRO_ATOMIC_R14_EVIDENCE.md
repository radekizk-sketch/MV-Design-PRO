# MV-DESIGN PRO — GIS R14, zatwierdzenie wielu operacji w jednej rewizji

**25.10.2026 — DRAFT / LABORATORIUM. NIE JEST TO WYDANIE PRODUKCYJNE.** B-02 nadal odrzucone.

## Co zmienił R14

R13 zapisywał operacje ENM pojedynczo. R14 przygotowuje do 128 kanonicznych operacji na odizolowanej kopii modelu. Sprawdza katalog, brak usuwania, rzeczywiste identyfikatory utworzone w ENM (także zagnieżdżone pola SN), a następnie wykonuje dokładnie jeden zapis do magazynu ENM, z jedną rewizją i jednym wpisem dziennika zmian.

Kluczowe pliki:
- backend/src/application/gis/digpro_atomic_r14.py — czysty rdzeń prepare_atomic_import / commit_once.
- backend/src/api/gis_atomic_r14.py — adapter katalog-first, semantyka, walidacja Pydantic, single commit.
- backend/src/api/main.py — warunkowy montaż adaptera R14.
- tools/gis/digpro_enm_e2e_r13.mjs — tryb atomowy jako domyślny przy publikacji; stara publikacja cząstkowa z CLI zabroniona.
- backend/tests/application/test_gis_atomic_r14.py i workflow gis-r14-atomic.yml — testy blokad i ciągłości.

## Warunki laboratoryjnego uruchomienia

Wyłącznie jedno lokalne środowisko testowe: MV_DESIGN_ENV=development; MV_GIS_R14_ATOMIC_ENABLED=1; MV_GIS_R14_LAB_TOKEN (losowy ciąg długości co najmniej 32 znaków). Aplikacji nie udostępniać publicznie. Flaga w produkcji blokuje start. Token nie zastępuje korporacyjnej kontroli dostępu i uprawnień do danych infrastruktury.

Najpierw lokalna weryfikacja syntetycznego pakietu SHP/GPKG z R13, w tym SHA256 fizycznych plików oraz podpisanego staging. Po jawnym zatwierdzeniu CLI wysyła grupę do laboratoryjnego endpointu /api/gis-lab/r14/cases/{case_id}/atomic-import, sprawdza nową rewizję i hasz odczytanego ENM, a dopiero potem zleca LOAD_FLOW oraz SC_3F. Mapa przechodzi na istniejący SldCanvasV3. R14 nie produkuje osobnego SLD ani solwera.

## Potwierdzone dowody

Rdzeń R14: 13/13 PASS lokalnie (Python) — odmowa drugiego kroku nie powoduje zapisu, pojedynczy commit, konflikt CAS, identyfikator nested field_ref, brak usuwania. Wcześniejsze R13: 28/28 Node i 8/8 SHP w lokalnym laboratorium. Dodatkowe testy gałęzi R14 i GitHub Actions oczekują na weryfikację; nie należy sumować nieuruchomionych testów jako zaliczonych.

## Gwarancje, których NIE wolno przypisywać R14

- Nie jest to transakcja wieloprocesowa ani rozproszona: blokada ENM jest lokalna dla procesu.
- Nie ma autoryzowanego profilu produkcyjnego DIGPRO ENEA ani niezależnego potwierdzenia połączeń PortRef.
- Nie wykazano rzeczywistej kompilacji pełnego backendu, solverów LF/SC i obrazu SldCanvasV3 w ramach jednego przypadku po imporcie.
- WMS/GIS nie stanowią dowodu długości elektrycznej, uziemienia ani poprawnej topologii.

**Decyzja wdrożeniowa: NO-GO.** Przed produkcją: auth/ABAC, bazowa transakcja wieloinstancyjna, prawdziwy DIGPRO, E2E GN01 + walidacja liczbowa IEC 60909 i LF, parytet GIS–SLD–wyniki–raport, odbiór wizualny B-02.