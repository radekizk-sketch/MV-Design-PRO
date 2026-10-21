/**
 * Przesunięcia portów liniowych stacji względem jej środka — dana geometrii
 * adaptera ENM → SLD (`canvas/enmToSldAdapter.ts` `stationRunStartOffset` /
 * `stationRunEndOffset`: punkt wejścia i wyjścia ciągu SN na stacji).
 *
 * GPZ-PARYTET cz. 2 (pkt 4): wyciąg z martwego silnika układu mini-bloku
 * (`v2/renderer/MiniBlockBayLayout.ts` + `MiniBlockRmuRenderer.tsx`
 * `miniBlockStationPortOffsets`, skasowane razem z katalogiem `v2/renderer/`).
 * Adapter używał wyłącznie wariantu `detail` i wyłącznie współrzędnej X kolumn
 * pól, więc zostaje tylko ta reguła — wartości identyczne z dawnym silnikiem
 * (przypięte w `__tests__/stationPortOffsets.test.ts`).
 *
 * Reguła: kolumny pól SN rozłożone równomiernie na szynie o szerokości bloku
 * (220, a 340 przy obwodzie PV po stronie nN), z marginesem 24 z każdej strony;
 * jedno pole stoi na osi. Port wejścia = pierwsza kolumna pola liniowego
 * (LINE_IN/LINE_OUT/LINE_BRANCH/RMU_LINE albo pole źródła), port wyjścia =
 * druga taka kolumna (`null`, gdy jest tylko jedna).
 */

import { FIELD_ROLE, type FieldRole } from '../domain/apparatusContracts';
import type { MiniBlockBayDescriptor, MiniBlockDerBadge } from './widokPolStacji';

const SZEROKOSC_BLOKU = 220;
const SZEROKOSC_BLOKU_Z_OBWODEM_PV = 340;
const MARGINES_SZYNY = 24;

function jestPolemLiniowym(role: FieldRole): boolean {
  return role === FIELD_ROLE.LINE_IN
    || role === FIELD_ROLE.LINE_OUT
    || role === FIELD_ROLE.LINE_BRANCH
    || role === FIELD_ROLE.RMU_LINE
    || role === FIELD_ROLE.DER_PV
    || role === FIELD_ROLE.DER_BESS
    || role === FIELD_ROLE.DER_FW
    || role === FIELD_ROLE.DER_UNKNOWN;
}

export function miniBlockStationPortOffsets(
  snBays: readonly MiniBlockBayDescriptor[],
  derBadges: readonly MiniBlockDerBadge[] = [],
): readonly [number, number | null] | null {
  if (snBays.length === 0) return null;
  const obwodPv = derBadges.some((badge) => badge.kind === 'PV' && (badge.connectionSide ?? 'nn') === 'nn');
  const szerokosc = obwodPv ? SZEROKOSC_BLOKU_Z_OBWODEM_PV : SZEROKOSC_BLOKU;
  const lewy = -szerokosc / 2 + MARGINES_SZYNY;
  const rozpietosc = szerokosc - 2 * MARGINES_SZYNY;
  const n = snBays.length;
  const xs = snBays
    .map((bay, idx) => ({ bay, x: n === 1 ? 0 : lewy + (rozpietosc * idx) / (n - 1) }))
    .filter(({ bay }) => jestPolemLiniowym(bay.fieldRole))
    .map(({ x }) => x);
  if (xs.length === 0) return null;
  return [xs[0], xs[1] ?? null];
}
