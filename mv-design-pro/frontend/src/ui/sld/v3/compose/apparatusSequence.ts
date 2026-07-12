/**
 * SLD V3 F9.3 — sekwencja aparatów pola (SLD_CAD_SPEC_V3 §12 „Kompozycja
 * celki pola wg fizycznej ścieżki mocy"). Jedno źródło prawdy dla:
 *  - `layout/measure.ts` (`bayColumnFootprint` — REZERWACJA miejsca), i
 *  - `compose/station.ts` (`buildBayStack`/`composeStation` — REALNY rysunek),
 * które MUSZĄ dawać identyczny gabaryt (test „spójność measure↔compose",
 * `compose/__tests__/station.test.ts`) — patrz nagłówek `compose/station.ts`.
 *
 * Dwie warstwy (spec §12.1 „prymat danych nad konwencją"):
 *  1. `apparatusSymbolsForRole` — stos KONWENCJI (fallback rysunkowy, §12.4),
 *     WYŁĄCZNIE gdy pole nie niesie `Bay.primary_devices`. Kolejność OD SZYNY
 *     W DÓŁ (§12.2/V12K-027): pole liniowe `DS→CB→CT→DS→ES→głowica`; pole TR
 *     `DS→bezpiecznik→TR2W`; pole pomiarowe `DS→VT→ES`; pole sprzęgła
 *     `DS→CB→CT`. Zero SA (surge_arrester) w konwencji — V12K-028: ENM nie ma
 *     dziś `SURGE_ARRESTER` w `BayPrimaryDeviceKind`, SA nigdy nie jest
 *     rysowany „z domysłu" (§12.5).
 *  2. `symbolIdForPrimaryDeviceKind` + `resolveBayApparatusSymbolIds` — ścieżka
 *     DANYCH (§12.1): gdy `bay.primaryDevices` niepuste (i mapowalne na co
 *     najmniej jeden symbol pola), stos budowany Z DANYCH, uporządkowanych
 *     już przez adapter wg `placement` (`v2/canvas/enmToSldAdapter.ts`
 *     `projectBayPrimaryDevices` — UPSTREAM przy szynie → DOWNSTREAM przy
 *     głowicy, ta sama kolejność „od szyny w dół" co konwencja).
 *
 * DECYZJA (mapowanie `LOAD_SWITCH`): biblioteka symboli v3 (`symbols/defs.ts`)
 * nie ma dziś dedykowanego glifu „rozłącznik" (odróżnialnego od odłącznika)
 * — mapujemy na `disconnector` (najbliższy istniejący, wizualnie zbliżony
 * łącznik beznapięciowy) jako udokumentowaną aproksymację, NIE zgadywanie
 * fizyki (kind→symbol jest jawny, 1:1, z komentarzem). Nowy dedykowany glif
 * to kandydat na osobną fazę (wymaga koordynacji `symbols/*`, poza zakresem
 * F9.3 — patrz raport).
 *
 * DECYZJA (`GENERATOR_*`/`PCS`/`BATTERY` w `primary_devices`): to nie są
 * aparaty POLA (są źródłem/DER, renderowanym osobno, `derPv`/`derBess`/
 * `derGenerator` przez `apparatusSymbolsForRole` dla pól DER) — mapują się na
 * `null` i są odfiltrowane ze stosu aparatów (mirror `BAY_PRIMARY_DEVICE_TO_
 * APPARATUS` w `v2/domain/apparatusContracts.ts`, ten sam podział).
 */

import { GRID } from '../core/grid';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import type { BayPrimaryDeviceKind } from '../../../../types/enm';

/** Znacznik pochodzenia stosu aparatów (spec §12.1, audytor DOM
 *  `data-apparatus-source`) — `'dane'` gdy stos zbudowany z
 *  `Bay.primary_devices`, `'konwencja'` gdy z tabeli fallback §12.4. */
export type BayApparatusSource = 'dane' | 'konwencja';

/**
 * Stos KONWENCJI (od szyny w dół, spec §12.2/§12.4) — fallback WYŁĄCZNIE dla
 * pola bez `primary_devices`. MUSI zostać zsynchronizowany z
 * `bayColumnFootprint` (`layout/measure.ts`, przez `stackFootprint` niżej —
 * jedna prawda, zero duplikacji tabeli).
 */
export function apparatusSymbolsForRole(role: FieldRole): readonly SymbolId[] {
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) {
    // pole TR (spec §12.4): DS → (bezpiecznik|CB) → TR2W — konwencja wybiera
    // rozłącznik z bezpiecznikiem (wariant najczęstszy dla SN/nN < 1 MVA).
    return ['disconnector', 'fuseSwitch', 'transformer2W'];
  }
  if (role === FIELD_ROLE.DER_PV) return ['derPv'];
  if (role === FIELD_ROLE.DER_BESS) return ['derBess'];
  if (role === FIELD_ROLE.DER_FW) return ['derGenerator'];
  if (role === FIELD_ROLE.MEASUREMENT) {
    // pole pomiarowe (spec §12.4): DS → VT → ES.
    return ['disconnector', 'voltageTransformer', 'earthSwitch'];
  }
  if (role === FIELD_ROLE.COUPLER) {
    // pole sprzęgła (spec §12.4): DS → CB → CT.
    return ['disconnector', 'breaker', 'currentTransformer'];
  }
  // Domyślnie: pole liniowe (LINE_IN/LINE_OUT/LINE_BRANCH/RMU_LINE/
  // GPZ_LINE_BAY) — spec §12.4/§12.2: DS_szynowy → CB → CT → DS_liniowy →
  // ES → głowica kablowa. (VT)/(SA) są WARUNKOWE (§12.2, obecne wyłącznie w
  // danych) — konwencja rysuje WYŁĄCZNIE elementy bezwarunkowe.
  return ['disconnector', 'breaker', 'currentTransformer', 'disconnector', 'earthSwitch', 'cableHead'];
}

/** Gabaryt stosu symboli: szerokość = najszerszy symbol, wysokość = suma
 *  wysokości + GRID między kolejnymi (spec §3/§12, wzór F6b-1 — jedna prawda
 *  dla `layout/measure.ts` i `compose/station.ts`/`compose/gpz.ts`). */
export function stackFootprint(ids: readonly SymbolId[]): { readonly width: number; readonly height: number } {
  const width = Math.max(...ids.map((id) => SYMBOL_DEFS[id].width));
  const height = ids.reduce((sum, id, index) => sum + SYMBOL_DEFS[id].height + (index > 0 ? GRID : 0), 0);
  return { width, height };
}

/**
 * Mapowanie `BayPrimaryDeviceKind` (ENM) → `SymbolId` (spec §12.1). `null`
 * dla kindów DER (nie są aparatem pola — patrz DECYZJA w nagłówku pliku).
 */
export function symbolIdForPrimaryDeviceKind(kind: BayPrimaryDeviceKind): SymbolId | null {
  switch (kind) {
    case 'CB':
      return 'breaker';
    case 'LOAD_SWITCH':
      // DECYZJA (nagłówek pliku): brak dedykowanego glifu „rozłącznik" —
      // najbliższy istniejący łącznik beznapięciowy.
      return 'disconnector';
    case 'DS':
      return 'disconnector';
    case 'ES':
      return 'earthSwitch';
    case 'CT':
      return 'currentTransformer';
    case 'VT':
      return 'voltageTransformer';
    case 'CABLE_HEAD':
      return 'cableHead';
    case 'TRANSFORMER_DEVICE':
      return 'transformer2W';
    case 'FUSE':
      return 'fuseSwitch';
    case 'GENERATOR_PV':
    case 'GENERATOR_BESS':
    case 'GENERATOR_FW':
    case 'PCS':
    case 'BATTERY':
      // DER — nie jest aparatem POLA (renderowane osobno). Patrz nagłówek.
      return null;
    default:
      return null;
  }
}

/**
 * Rozstrzygnięcie „dane vs konwencja" (spec §12.1) — JEDNA prawda używana
 * przez `layout/measure.ts` (rezerwacja gabarytu) i `compose/station.ts`
 * (realny rysunek + znacznik `data-apparatus-source`). Gdy `bay.primaryDevices`
 * niepuste I zawiera co najmniej jeden aparat mapowalny na symbol pola (po
 * odfiltrowaniu DER-kindów) — ścieżka „dane"; inaczej fallback konwencji
 * (§12.4), source `'konwencja'`.
 */
export function resolveBayApparatusSymbolIds(
  bay: Pick<MiniBlockBayDescriptor, 'fieldRole' | 'primaryDevices'>,
): { readonly symbolIds: readonly SymbolId[]; readonly source: BayApparatusSource } {
  const devices = bay.primaryDevices;
  if (devices && devices.length > 0) {
    const ids = devices
      .map((d) => symbolIdForPrimaryDeviceKind(d.kind))
      .filter((id): id is SymbolId => id != null);
    if (ids.length > 0) return { symbolIds: ids, source: 'dane' };
  }
  return { symbolIds: apparatusSymbolsForRole(bay.fieldRole), source: 'konwencja' };
}
