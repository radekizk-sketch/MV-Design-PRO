/**
 * SLD V3 F6b — kontrakt nakładki stanu kanwy (SLD_CAD_SPEC_V3 §6 „Hierarchia
 * graficzna": P5 energizacja = KOLOR nakładki, NIE geometria; REBUILD_PLAN_V3
 * F6b). Stany łączników (closed/open/unknown) NIE są tu — to GEOMETRIA glifu,
 * już zdecydowana w `PreviewSymbol.state` przez `buildSceneV3` (dane ENM),
 * spec §6 „Stany łączników: wypełnienie/kąt symbolu (jak dziś w kanonicznym)".
 *
 * ---------------------------------------------------------------------------
 * STOP-notatka (zakres zadania — BEZ podłączania do backendu w tej dostawie):
 * ---------------------------------------------------------------------------
 * v2 czyta solver companion DWOMA niezależnymi, nieujednoliconymi ścieżkami:
 *  (a) globalny store zustand `useRawResultOverlayStore`
 *      (`sld-overlay/rawResultOverlayStore.ts`) — `RawOverlayPayload.elements`
 *      keyed by `ref_id`, czytany WEWNĄTRZ `SldCanvasV2` (nie przez props);
 *  (b) `SldPowerFlowCompanion` (`v2/canvas/SldPowerFlowCompanion.ts`) —
 *      energizacja/kierunek per branch/bus ENM ref, „jedna prawda" wg
 *      komentarzy v2.
 * Scalenie tych dwóch kształtów w jeden telefon-companion jest decyzją
 * architektoniczną POZA zakresem F6b (zadanie: renderować `SceneV3`, nie
 * integrować solver companion z backendem). `SldCanvasV3` przyjmuje WYŁĄCZNIE
 * ten mały, czytelny kontrakt — wołający (F7/F8 cutover) mapuje
 * `RawOverlayPayload`/`SldPowerFlowCompanion` na `energizedByTestId`.
 *
 * OGRANICZENIE ZNANE (dziedziczone z F6a — `buildScene.ts` zamrożony poza
 * autoryzowanym zakresem F6b, patrz zadanie): `SceneV3` niesie `meta.testId`
 * per symbol (aparaty z `bayRef`, L0/NOP, elementy GPZ), ale odcinki
 * (`PreviewSegment`) WEWNĄTRZ stacji i MIĘDZY stacjami (magistrala/lateral)
 * NIE niosą `meta.testId` — tylko `meta.kind` (`bus`/`sn`/`lv`),
 * `classifyStationSegmentKind`/`connectRowStations` w `buildScene.ts` gubią
 * `ownerRef` przy spłaszczeniu do `PreviewSegment`. Nakładka energizacji per
 * ODCINEK jest więc możliwa TYLKO dla odcinków GPZ (mają `meta.testId`) w tej
 * dostawie — rozszerzenie tożsamości odcinków stacji/magistrali o
 * `ownerRef`/`testId` to kandydat F6c/F7 (wymaga zmiany `buildScene.ts`, poza
 * autoryzacją tego zlecenia).
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
}
