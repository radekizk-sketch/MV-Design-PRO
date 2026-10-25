# GIS R13 — DIGPRO/dpPower → ENM → LOAD_FLOW/SC_3F → SldCanvasV3

**Stan:** PR #501 (DRAFT); kod wykonawczy oraz testy syntetyczne, **BRAK zgody produkcyjnej**.
**Data:** 2026-10-25. **Kanon:** jedna sieć elektryczna ENM, wiele projekcji.
Ten dokument to **raport implementacyjny i instrukcja próby**, nie odrębny plan wobec \`PLANS.md\`.

## Co rzeczywiście wykonano
- \`tools/gis/digpro_shp_preview_r13.py\`: lokalny SHP/SHX/DBF/PRJ z dpPower → GeoJSON WGS84, jawnie nazwany CRS PL-1992 lub PL-2000, kontrola identyfikatorów, filtracja atrybutów i SHA256 **całego pakietu czterech plików**; nie zapisuje ENM.
- \`tools/gis/gpkg_preview_r12.py\`: istniejący lokalny GPKG → GeoJSON + manifest pochodzenia, bez zapisu ENM.
- \`tools/gis/digpro_enm_e2e_r13.mjs\`: weryfikacja źródłowych bajtów SHP/GPKG i odcisku staging GeoJSON, zgodności manifestu, zakresu, zatwierdzonego zestawu operacji domenowych, terminali, katalogu oraz długości. Domyślnie **offline, odczyt/validacja, bez HTTP**.
- Tryb jawnego wykonania (dopuszczony tylko dla adresu localhost, nie dla serwera operatora) wysyła zweryfikowany, ręcznie zatwierdzony plan przez istniejące \`POST /api/cases/{case_id}/enm/domain-ops\`, z \`snapshot_base_hash\` (ochrona przed starą wersją). Po każdej operacji odczytuje zapisany ENM, sprawdza nową rewizję, hash oraz **identyfikatory powstałe w \`changes.created_element_ids\` / \`updated_element_ids\`**. Geometria nie definiuje połączenia.
- Następnie wykorzystuje kanoniczne \`POST /api/execution/study-cases/{case_id}/runs\` dla \`LOAD_FLOW\` i \`SC_3F\`, \`.../execute\`, stan biegu, migawkę i podpis deterministyczny wyniku. Wynik musi pochodzić z tej samej rewizji i odcisku ENM.
- Mapa React R11: przycisk „Odśwież ENM i pokaż schemat SLD” wywołuje istniejący \`snapshotStore.refreshFromBackend\` (bez starej blokady CAS), potem przełącza na istniejące \`SldCanvasV3Workspace\`. Nie tworzy żadnego drugiego SLD. \`SldCanvasV3Workspace\` konsumuje \`useSnapshotStore.snapshot\`.
- Kod nie zmyśla, że dowód obliczeń oznacza dowód **poprawnego renderu**: \`sld.verification=NOT_RENDERED\` do osobnego odbioru rzeczywistych rysunków B-02.

## Pełny przebieg inżyniera

1. W dpPower przygotuj **uprawniony, ograniczony obszarowo** eksport SHP/DBF i metadane kompletności widoku, bez PPE/nazwisk/danych sterowania. Osobne warstwy SHP mogą zawierać tylko jeden typ geometrii.
2. Lokalna konwersja (nazwa kolumny ID pochodzi z realnego eksportu, **nie jest z góry znana**):

   \`python tools/gis/digpro_shp_preview_r13.py --source AUTORYZOWANY.shp --id-field KOLUMNA_ID --output staging.geojson\`

   Dla GeoPackage pozostaje istniejące \`gpkg_preview_r12.py\`.
3. Sprawdź \`staging.manifest.json\`, liczbę przyjętych i pominiętych obiektów, CRS i klasę obiektu. R13 **odmawia** zatwierdzenia niepełnego zakresu lub elementów pominiętych. W praktyce eksportuj odrębne, kompletne elektryczne warstwy linii/stacji; działki i poligony prowadź osobno jako podkład.
4. Inżynier tworzy \`approved-plan.json\` według kontraktu poniżej: źródłowe ID z GeoJSON, potwierdzony katalog, długość elektryczną (nie długość 2D), porty i kompletne payloady istniejących operacji ENM. Uzupełnia **aktualny** hash ENM z \`GET /api/cases/{id}/enm\`. Dane wejściowe nie są automatycznie zgadywane.
5. Oblicz odcisk staging: \`node -e "const fs=require('fs'),crypto=require('crypto');const g=JSON.parse(fs.readFileSync('staging.geojson'));console.log(crypto.createHash('sha256').update(JSON.stringify(g)).digest('hex'))"\`. Umieść w \`plan.source.staged_geojson_sha256\`.
6. Wykonaj **bezpieczną próbę offline**:

   \`node tools/gis/digpro_enm_e2e_r13.mjs --source AUTORYZOWANY.shp --plan approved-plan.json --geojson staging.geojson --manifest staging.manifest.json --report evidence.json\`

   Sukces walidacji = \`PLAN_VALIDATED_NOT_APPLIED\`; **zero zmian w ENM**.
7. Jawne zatwierdzenie zapisu **tylko w autoryzowanym lokalnym środowisku testowym**:

   \`node tools/gis/digpro_enm_e2e_r13.mjs --source AUTORYZOWANY.shp --plan approved-plan.json --geojson staging.geojson --manifest staging.manifest.json --report evidence.json --backend http://127.0.0.1:8000 --apply true --confirm ZATWIERDZAM_ZAPIS_ENM\`

   Ważne: flaga i podpis zatwierdzającego to **deklaracja**, nie pełne korporacyjne uwierzytelnienie/ABAC. Obecny kod nie może być używany na serwerze produkcyjnym ENEA.
8. Raport zawiera rewizje i odciski oraz powiązania \`source_id → created_refs/updated_refs\` wyprowadzone z odpowiedzi ENM; sprawdź mapowanie terminali przed odbiorem.
9. Otwórz ten sam przypadek w MV-DESIGN PRO → „Model sieci” → „Mapa GIS” → „Odśwież ENM i pokaż schemat SLD”. Konieczny wizualny odbiór: pełny tor prądu GPZ–pole SN–kabel–stacja–TR, zaciski, linie i statusy łączników.

## Obowiązkowe dane planu (kontrakt R13)

\`\`\`json
{
  "schema": "MV-DIGPRO-ENM-R13",
  "project_id": "<UUID projektu>",
  "case_id": "<UUID przypadku>",
  "base_enm_hash": "<64 znaki heksadecymalne z bieżącego ENM>",
  "source": {
    "system": "DIGPRO",
    "format": "SHP",
    "sha256": "<odcisk z manifestu importera>",
    "staged_geojson_sha256": "<odcisk JSON.stringify GeoJSON>",
    "layer": "<pełna nazwa warstwy>",
    "partial_export": false,
    "geometry_clipped": false
  },
  "approval": {
    "authorized": true,
    "sanitized": true,
    "connections_reviewed": true,
    "engineer_ref": "<identyfikator zatwierdzającego>"
  },
  "operations": [
    {
      "step_id": "01",
      "source_id": "<ID obiektu z DIGPRO>",
      "operation": {
        "name": "add_grid_source_sn",
        "idempotency_key": "<unikalny stabilny klucz>",
        "payload": {
          "source_id": "<trwała tożsamość>",
          "voltage_kv": 15.0,
          "catalog_ref": "<rzeczywisty wpis katalogu projektu>"
        }
      },
      "confirmed_terminals": true,
      "confirmed_electrical_length": true,
      "confirmed_catalog": true,
      "expected_refs": []
    }
  ]
}
\`\`\`

\`expected_refs=[]\` jest dozwolone podczas **tworzenia** urządzeń: ich nowe identyfikatory pochodzą wyłącznie z odpowiedzi backendu, nigdy nie są zgadywane. Zapis bez wykazanych \`created_element_ids/updated_element_ids\` jest odrzucany. Zatwierdzenia w planie nie zastępują formalnego protokołu potwierdzenia portów operatora.

## Dowody i ograniczenia

- Lokalne 2026-10-25: **28/28 Node** (syntetyczne operacje przez symulowany kontrakt API) i **8/8 pytest** SHP, bez danych ENEA. Dodatkowo wykonano próbę CLI **offline** z rzeczywistymi syntetycznymi plikami SHP/DBF; wynik \`PLAN_VALIDATED_NOT_APPLIED\`, zapis ENM = false.
- GitHub Actions i pełna regresja PR #501: **status odrębny; nie wykazano zielonego końcowego wyniku**. Przebieg przeciw rzeczywiście uruchomionemu backendowi, solverom i przeglądarce należy zaliczyć przed produkcją.
- Brak zatwierdzonego schematu kolumn/relacji DIGPRO ENEA; nie istnieje zatem automatyczne, zweryfikowane mapowanie \`PortRef\`, \`ConnectionNode\`, stanu normalnego łącznika oraz przypisania kabla do odcinka.
- **Brak globalnej transakcji wszystkich operacji**: po błędzie przy N-tej operacji wcześniejsze mogą pozostać zapisane. Raport sygnalizuje \`FAILED_POSSIBLE_PARTIAL_ENM_CHANGE\`; nigdy nie wykonuje niebezpiecznego \`reset\` / \`rollback\` cudzej pracy.
- B-02 pozostaje **ODRZUCONE**. Poprawny hash i dwa obliczenia nie zastępują rysunku i testu wzrokowego. Nie twierdzić, że wykonano pełne wdrożenie produkcyjne.

**Werdykt:** działa przygotowany i przetestowany most kontraktowy dla autoryzowanych operacji oraz odrębny importer SHP. Do produkcji nadal wymagane: podpisany schemat operatora, uwierzytelnione uprawnienia, spójna transakcja całego importu, rzeczywisty E2E backendu i render SLD wraz z zatwierdzeniem właściciela.
