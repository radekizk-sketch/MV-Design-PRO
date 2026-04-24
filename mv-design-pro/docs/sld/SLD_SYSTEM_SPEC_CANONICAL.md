# SLD_SYSTEM_SPEC_CANONICAL

Status: wiazacy dla aktualnego stosu SLD.

Kod:
- `backend/src/api/sld.py`
- `backend/src/api/canonical_run_views.py`
- `frontend/src/ui/sld/SldEditorPage.tsx`
- `frontend/src/ui/sld/SLDView.tsx`
- `frontend/src/ui/sld/enmSnapshotToSldSymbols.ts`

Dwie aktywne warstwy:
- live SLD w frontendzie jest budowany z `snapshot` ENM,
- backendowy endpoint SLD wystawia tylko read-only overlay wynikowy dla istniejacego diagramu.

Backend:
- aktywny endpoint to `GET /projects/{project_id}/sld/{diagram_id}/overlay?run_id=...`,
- overlay korzysta z `CanonicalRun` i helpera `build_sld_overlay()`,
- overlay nie liczy nowej geometrii i nie mutuje diagramu.

Frontend:
- `SldEditorPage.tsx` odswieza `snapshot` i `readiness`,
- `SLDView.tsx` utrzymuje selection, URL i przeplyw wyboru katalogu,
- symbole live sa budowane przez `enmSnapshotToSldSymbols(snapshot)`.

## Kanoniczna sciezka ENM -> SLD

Aktywna sciezka produktu jest jednokierunkowa:

```text
ENM snapshot
  -> projectEnmSnapshotToSld(snapshot)
  -> topologyInputReader
  -> topologyAdapterV2
  -> layoutPipeline
  -> SLDView / SLDViewCanvas
  -> SldEditorPage
```

Zrodlem prawdy jest ENM snapshot zwracany przez operacje domenowe i aktywny wariant pracy. SLD nie buduje alternatywnego modelu sieci, nie dopisuje elementow elektrycznych, nie zgaduje wariantu przylaczenia z geometrii i nie mutuje ENM. Overlay wynikowy moze dodac tokeny wizualne, ale nie moze zmienic pozycji, rozmiaru, routingu ani tozsamosci symboli bazowych.

Zakazane w runtime:

- statyczne/demo SLD jako ekran produktu lub domyslna trasa,
- `EngineeringSldScreen` jako kanon produktu,
- `canonicalSnSldModel` / `canonicalSnSldSymbols` jako zrodlo prawdy runtime,
- fixture lub demo topology jako substytut ENM snapshot w aktywnej trasie,
- backendowy overlay wynikowy jako generator geometrii live.

Nazwy `EngineeringSldScreen` i `canonicalSn*` moga wystepowac w raportach audit tylko jako historyczne odniesienie do odrzuconej proby statycznego SLD.

## Kontrakty GPZ i pol SN

GPZ i stacje uzywaja rozdzielnych szablonow. `GPZ_LINE_BAY` nie jest aliasem `STATION_LINE_INCOMING`.

| Rola | Minimalny kontrakt |
| --- | --- |
| `GPZ_LINE_BAY` | DS wymagany upstream, CB wymagany midstream, CT wymagany midstream, RELAY wymagany off-path, ES wymagany off-path, CABLE_HEAD downstream gdy wyjscie kablowe. |
| `GPZ_TRANSFORMER_BAY` | Pole transformatorowe GPZ; nie moze byc traktowane jak pole liniowe. |
| `BUS_MEASUREMENT_BAY` / `MEASUREMENT_SN` | VT jako aparat pomiaru szyny; brak CB, transformatora i glowicy kablowej jako wymaganego rdzenia. |
| `SECTION_COUPLER_BAY` | Sprzeglo DS-CB-DS; bez transformatora i bez glowicy kablowej. |

Backend i frontend musza utrzymywac zgodne role field/switchgear. Renderer mapuje role dostarczone przez model/projekcje, a nie nadaje znaczenia elektrycznego na podstawie samego polozenia symbolu.

## Kontrakty stacji SN/nN

Stacja SN/nN w SLD jest blokiem rozdzielnicy z polami. Nie jest pojedyncza ikona transformatora.

| Typ stacji | Wymagane pola |
| --- | --- |
| Koncowa | `LINE_IN`, `TRANSFORMER_SN_NN`, nN switchgear gdy istnieje transformator. |
| Przelotowa | `LINE_IN`, `LINE_OUT`, `TRANSFORMER_SN_NN`, nN switchgear gdy istnieje transformator. |
| Odgalezna | `LINE_IN`, `LINE_OUT`, `LINE_BRANCH`, `TRANSFORMER_SN_NN`, nN switchgear gdy istnieje transformator. |
| Sekcyjna | `LINE_IN`, `LINE_OUT`, `COUPLER_SN`, `TRANSFORMER_SN_NN` dla stacji SN/nN, nN switchgear gdy istnieje transformator. |

Role `LINE_OUT` i `LINE_BRANCH` wynikaja z segmentacji trunk/branch. Nie wolno przypisywac ich wylacznie z posortowanego indeksu pola.

## Kontrakty PV/BESS i NOP

Kanoniczne warianty przylaczenia zrodel:

| Wariant | Semantyka SLD |
| --- | --- |
| `LV_BEHIND_STATION_TRANSFORMER` | PV/BESS za istniejacym transformatorem stacji; SLD nie tworzy syntetycznego pola SN zrodla. |
| `DEDICATED_MV_CONNECTION` | PV/BESS wymaga dedykowanego przylaczenia SN i referencji transformatora; brak referencji jest problemem walidacji/readiness. |
| `SOURCE_CONNECTION_STATION` | Zrodlo nalezy do osobnej stacji przylaczeniowej; wymagana jest jawna referencja stacji. |

Aliasow historycznych wolno uzywac tylko na granicy wejscia i normalizowac je do wariantow kanonicznych przed walidacja/renderingiem. Renderer nie moze zgadywac wariantu PV/BESS po nazwie, polozeniu ani typie ikony.

NOP jest markerem topologicznym stanu normalnie otwartego. Nie jest katalogowym `DeviceTypeV1`, nie wymaga `catalogId`, nie zmienia terminalnej/przelotowej roli stacji w normalnym stanie pracy i nie moze byc modelowany jako zwykly aparat pola.

Reguly wiazace:
- nie wolno opisywac backendowego overlay jako live generatora geometrii,
- nie wolno mieszac overlay wynikowego z logika edycji ENM,
- stan katalogu, selection i readiness po stronie live wynikaja z odpowiedzi `domain-ops`,
- test evidence i raporty audit dla PR-A..PR-G sa indeksowane w `../audit/README.md`.
