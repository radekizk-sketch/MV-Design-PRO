/**
 * SLD V3 F6b — kontrakt nakładki stanu kanwy (SLD_CAD_SPEC_V3 §6 „Hierarchia
 * graficzna": P5 energizacja = KOLOR nakładki, NIE geometria; REBUILD_PLAN_V3
 * F6b). Stany łączników (closed/open/unknown) NIE są tu — to GEOMETRIA glifu,
 * już zdecydowana w `PreviewSymbol.state` przez `buildSceneV3` (dane ENM),
 * spec §6 „Stany łączników: wypełnienie/kąt symbolu (jak dziś w kanonicznym)".
 *
 * ---------------------------------------------------------------------------
 * F8b-1 (REBUILD_PLAN_V3 §F8b, zadanie „parytet funkcjonalny v3" — C):
 * STOP-notatka F6b PONIŻEJ ROZSTRZYGNIĘTA. Podłączone w `SldCanvasV3
 * Workspace.tsx` (`useEnergizationOverlay`/`buildEnergizationOverlay`) —
 * WOŁAJĄCY mapuje refs→testId przez `PreviewSymbol.meta.ownerRef`/
 * `PreviewSegment.meta.ownerRef` (F8b-1 A, `buildScene.ts` — spłata długu k1
 * opisanego niżej: odcinki NIESĄ ownerRef/elementKind, patrz `classifyStation
 * SegmentKind`/`connectRowStations`/GPZ mappery). Kontrakt `SldV3Overlay`
 * (`energizedByTestId`) NIETKNIĘTY — ownerRef→testId dzieje się w Workspace,
 * DOKŁADNIE jak przewidziała ta notatka, nie w `SldCanvasV3`.
 *
 * ŹRÓDŁO (uzasadnienie w `SldCanvasV3Workspace.tsx` nagłówek, skrót): ŻADEN z
 * dwóch kandydatów niżej nie jest tym, co v2 faktycznie pokazuje operatorowi
 * dziś — realny mechanizm to fallback topologiczny `buildSupplyPathHighlight`
 * (`v2/canvas/SupplyPathHighlighter.ts`, ZERO fizyki), wywoływany WEWNĄTRZ
 * `enmToSldAdapter.ts::buildSldDataFromSnapshot`, bo `SldWorkspaceContainer`
 * (produkcyjny host v2) NIGDY nie dostarcza solver companion:
 *  (a) `useRawResultOverlayStore` — podłączony w produkcji, ale zasila
 *      METRYKI (odchylenie napięcia/obciążenie/severity), INNY wymiar
 *      nakładki niż boolowa energizacja toru;
 *  (b) `SldPowerFlowCompanion` — architektonicznie „jedna prawda" solverowa,
 *      ale MARTWY w produkcyjnym drzewie renderu (nigdy nie dostarczony do
 *      adaptera przez `SldWorkspaceContainer.tsx`) — kandydat na PRAWDZIWE
 *      podłączenie solvera w F9.5 („Nakładka przepływu mocy").
 *
 * OGRANICZENIE ZNANE (dziedziczone z F6a, SPŁACONE w F8b-1 A): `SceneV3`
 * niesie teraz `meta.ownerRef` per symbol I per segment (stacje, łączniki
 * między stacjami, zejścia lateralne, GPZ) — nakładka energizacji per ODCINEK
 * jest możliwa dla WSZYSTKICH klas segmentu z rozwiązywalnym ownerRef, nie
 * tylko GPZ. Pozostałe znane luki (dokumentacja, NIE regresja): (1) `elementKind`
 * 'apparatus'/'transformer'/'der' mają `ownerRef=bayRef`, który nie odpowiada
 * żadnej kategorii `SupplyPathHighlight` (bus/branch/transformer/substation/
 * generator/source ref) — ŚWIADOMIE wyłączone z nakładki (spec §6: stan
 * łącznika to geometria, nie kolor; próba dopasowania dałaby fałszywe „false"
 * dla WSZYSTKICH aparatów, patrz `SldCanvasV3Workspace.ts`); (2) segmenty GPZ
 * zakotwiczone na `sectionId` (np. `${sectionId}#bus-primary`) nie rozwiązują
 * się przez `SupplyPathHighlight` (sectionId ≠ bus/substation ref) — GPZ
 * wewnętrzne szyny/sekcje bez nakładki, znana luka adaptera (f6-1/f6-3,
 * rozszerzenie sectionId→busRef to zmiana adaptera poza zakresem F8b-1).
 */
export interface SldV3Overlay {
  /**
   * Energizacja per `testId` elementu sceny (`symbol.meta.testId` /
   * `segment.meta.testId` ze `SceneV3`, patrz ograniczenie znane wyżej dla
   * odcinków bez testId). `true` = pod napięciem (nakładka koloru akcentu),
   * `false` = beznapięciowy (nakładka wygaszenia). Brak wpisu (klucz
   * nieobecny) = brak danych solvera dla tego elementu — kanwa rysuje
   * rysunek bazowy mono, bez nakładki (spec §6 P5).
   */
  readonly energizedByTestId: Readonly<Record<string, boolean>>;
  /**
   * F8b-1 FIX (recenzja): energizacja per `meta.ownerRef` elementu sceny —
   * tożsamość NIEZALEŻNA OD LOD (ten sam element = ten sam ownerRef na
   * każdym poziomie), w odróżnieniu od `testId`, którego FALLBACK jest
   * indeksowy (`sld-v3-segment-${index}`) i KOLIDUJE między LOD-ami
   * (60 vs 390 odcinków) — słownik budowany z trzech LOD-ów nadpisywał
   * wpisy cudzych elementów (odcinek LOD0 #5 dostawał stan odcinka LOD2 #5).
   * Kanwa PREFERUJE ten słownik, gdy element ma `meta.ownerRef`;
   * `energizedByTestId` pozostaje dla elementów bez ownerRef i dla
   * zgodności z istniejącymi konsumentami.
   */
  readonly energizedByOwnerRef?: Readonly<Record<string, boolean>>;
}
