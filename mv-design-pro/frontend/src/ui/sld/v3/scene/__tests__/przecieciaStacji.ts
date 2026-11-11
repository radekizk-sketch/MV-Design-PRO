/**
 * Wyrocznie przecięć wobec stacji — wspólne dla testów odejść zagnieżdżonych
 * (`buildScene.odejsciaZagniezdzone.test.ts`) i skali recenzji P1
 * (`buildScene.p1Recenzja.test.ts`).
 *
 * Rozstrzygnięcie architekta S7-P2 (2026-10-30, `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`
 * §12): przecięcie dwóch kabli bez węzła modelu jest skrzyżowaniem z mostkiem §22.1.
 * Dwie klasy przecięć pozostają jednak zakazane, bo mostek nie jest dla nich odpowiedzią:
 * kabel przecinający tor WEWNĘTRZNY stacji oraz przecięcie kabli dwóch różnych
 * odgałęzień tej samej stacji (odejścia zagnieżdżone).
 */
import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneV3 } from '../buildScene';
import { interiorCrossings } from '../crossings';

/** Przecięcia, w których uczestniczy odcinek WEWNĘTRZNY stacji (właściciel spoza `seg/`):
 *  kabel pola przecinający tor wewnętrzny stacji. Mostek §22.1 nie jest tu odpowiedzią —
 *  wnętrze stacji ma własną geometrię, w którą obcy kabel nie wchodzi (dawniej mierzone
 *  węzłami T `#tee-N` rozcinającymi tor stacji). */
export function przecieciaToruStacji(scena: SceneV3): string[] {
  return interiorCrossings(scena.segments)
    .filter((c) => !(c.hOwnerRef ?? '').startsWith('seg/') || !(c.vOwnerRef ?? '').startsWith('seg/'))
    .map((c) => `${c.hOwnerRef} × ${c.vOwnerRef} @${c.x},${c.y}`);
}

/** Przecięcia kabli DWÓCH RÓŻNYCH odgałęzień tej samej stacji. Skrzyżowanie zejścia
 *  odgałęzienia z magistralą innej pary stacji jest dopuszczalne z mostkiem §22.1;
 *  dwa odgałęzienia jednej stacji mają odejścia zagnieżdżone i nie mają prawa się
 *  przecinać (pomiar przed naprawą odejść zagnieżdżonych na L0: 1 dla +1 odgałęzienia,
 *  3 dla +2 — wtedy jako kropki „węzła T"). */
export function przecieciaMiedzyOdgalezieniamiStacji(model: EnergyNetworkModel, scena: SceneV3): string[] {
  const ciagSegmentu = new Map<string, { readonly stacja: string; readonly ciag: string }>();
  for (const run of model.line_runs ?? []) {
    if (run.run_kind !== 'branch') continue;
    for (const seg of run.segments) {
      ciagSegmentu.set(seg.segment_ref, { stacja: run.starting_bay_ref.replace(/\/sn_field\/\d+$/, ''), ciag: run.id });
    }
  }
  const wynik: string[] = [];
  for (const c of interiorCrossings(scena.segments)) {
    const a = ciagSegmentu.get(c.hOwnerRef ?? '');
    const b = ciagSegmentu.get(c.vOwnerRef ?? '');
    if (a && b && a.stacja === b.stacja && a.ciag !== b.ciag) wynik.push(`${a.ciag} × ${b.ciag} @${c.x},${c.y}`);
  }
  return wynik;
}
