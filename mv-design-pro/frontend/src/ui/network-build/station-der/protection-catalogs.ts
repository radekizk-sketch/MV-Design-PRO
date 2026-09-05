/**
 * Katalogi zabezpieczeń (Naprawa C — audyt specjalisty zabezpieczeń).
 *
 * Ten plik niósł pierwotnie pięć katalogów statycznych (stan zmierzony
 * 2026-08-14, karta K-O): `PROTECTION_FUNCTION_CATALOG` (C.1), `CtClass`
 * (C.6 — sam typ + predykaty), `SPZ_CATALOG` (C.3), `SZR_CATALOG` (C.4),
 * `HV_FUSE_CATALOG` (eng.17).
 *
 * PROWENIENCJA (karta FAB-M, 2026-09-05) — pomiar konsumentów KAŻDEJ stałej
 * (grepem, nie z listy — zlecenie karty FAB-L, która zgłosiła `HV_FUSE_CATALOG`
 * jako znalezisko poza jej zakresem, patrz `catalogs.ts` FAB-L). Wynik:
 *
 *   * `HV_FUSE_CATALOG` (+ `HvFuseItem`/`HvFusePasmoTcc`/dwie stałe PL/
 *     `selectHvFusesForRating`) — DRUGA KOPIA tych samych 4 pozycji, które
 *     backend już serwuje (`network_model/catalog/audit2_catalogs.py::
 *     HV_FUSE_CATALOG`, identyczne identyfikatory `fuse_15kv_50a_full` i in.,
 *     `GET /api/v1/catalog/audit2/hv-fuses` + pole `hv_fuses` snapshotu).
 *     Jedyny konsument produkcyjny (`station-configurator/cards/
 *     StationConfigBaysCard.tsx`) czyta teraz WYŁĄCZNIE ze snapshotu audytu 2
 *     (`useAudit2CatalogSnapshot`, `audit2-api.ts::HvFuseItem`) — katalog
 *     dostarczany jako prop `hvFuses` z `StationConfiguratorSurface.tsx`.
 *     `selectHvFusesForRating` (jedyny selektor tego katalogu) nie miał
 *     ŻADNEGO konsumenta produkcyjnego (karta pola czytała `HV_FUSE_CATALOG`
 *     wprost przez `.map`/`.find`, zmierzone grepem) — usunięty z testem,
 *     nie migrowany (wzorzec `selectTapChangersForTransformer` z `catalogs.ts`
 *     dotyczy wyłącznie selektorów z realnym konsumentem). Dwie stałe PL
 *     (`POWOD_BRAK_PASMA_BEZPIECZNIKA_PL`/`ETYKIETA_BRAK_PASMA_BEZPIECZNIKA_PL`)
 *     były RÓWNOLEGŁĄ kopią tych samych dwóch zdań, które backend liczy per
 *     pozycja (`HvFuseItem.to_dict()::pasmo_brak_powod_pl`/
 *     `pasmo_brak_etykieta_pl`) — karta czyta je dziś wprost z pozycji
 *     katalogu, zero literału PL po stronie frontu.
 *   * `PROTECTION_FUNCTION_CATALOG` (+ `ProtectionFunctionItem`/
 *     `AnsiFunctionCode`/`selectRequiredProtectionFunctionsForDer`/
 *     `selectRequiredProtectionFunctionsForGrounding`/
 *     `getProtectionFunctionByAnsiCode`) — ZERO konsumentów produkcyjnych
 *     (zmierzone grepem: jedyny importer to `__tests__/audit-fixes.test.ts`).
 *     Historyczny konsument `derProtectionSummary()` (opisany jako defekt P7
 *     w `docs/uiux/AUDYT_E21_KONFIGURATOR_FALOWNIKA_2026-07.md` — jedna,
 *     uniwersalna lista ANSI dla KAŻDEJ instalacji, bez uzasadnienia wg
 *     topologii/uziemienia) już nie istnieje w repo. Ten sam wpis widniał
 *     jako otwarty dług w `docs/v12xx/REJESTR_KONFLIKTOW.md` (wiersz K-O,
 *     „karta K-V") i `docs/plan/PLAN_DOKONCZENIA_100_2026-08-14.md` (punkt 3
 *     po K-O) — FAB-M go zamyka. Eksport bez konsumenta produktu = dług L4
 *     (wzorzec FAB-L) — kasacja z testem.
 *   * `SPZ_CATALOG` (+ `SpzCatalogItem`/`selectSpzCompatibleWithDer`) — ZERO
 *     konsumentów produkcyjnych (ten sam wpis rejestru/planu co wyżej).
 *     Backendowy `application/analyses/protection/line_overcurrent_setting/
 *     spz_lookup.py` jest INNĄ zdolnością (progi blokady SPZ wg prądu/czasu
 *     zwarcia), nie katalogiem profili cykli — nie ma tu duplikatu do
 *     migracji, jest tylko martwy eksport.
 *   * `SZR_CATALOG` (+ `SzrCatalogItem`) — ZERO konsumentów produkcyjnych (ten
 *     sam wpis rejestru/planu co wyżej).
 *   * `isCtClassValidForMetering` — ZERO konsumentów produkcyjnych (zmierzone
 *     grepem: jedyny importer to test). `isCtClassValidForProtection` MA
 *     realnego konsumenta (`readiness.ts`) i zostaje.
 *
 * Zawartość PO karcie FAB-M:
 *   - `CtClass` (C.6): unia klas dokładności CT wg IEC 61869-2 (sam typ)
 *   - `isCtClassValidForProtection` (C.6): predykat klasy zabezpieczeniowej
 *     (5P/10P), czytany przez regułę gotowości (`readiness.ts`)
 *
 * Zasada: każda wartość liczbowa ma źródło albo pozycji/pola nie ma.
 */

/** Klasa CT wg IEC 61869-2 (zabezpieczenia: 5P/10P; pomiary: 0,2/0,5/1,0). */
export type CtClass = '0.2' | '0.5' | '1.0' | '5P10' | '5P20' | '10P10' | '10P20';

/** Sprawdza czy CT klasa jest zgodna z funkcją zabezpieczenia. */
export function isCtClassValidForProtection(ctClass: CtClass): boolean {
  return ctClass.startsWith('5P') || ctClass.startsWith('10P');
}
