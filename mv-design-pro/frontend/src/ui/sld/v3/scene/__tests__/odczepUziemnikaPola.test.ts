/**
 * ODCZEP UZIEMNIKA POLA (Q8, Q51) I OZNACZENIA PRZEKŁADNIKA T1 — uwagi właściciela 2026-11-04
 * (odbiór B-02 pola liniowego Z.10, wzorzec synoptyki e²TANGO, pole „Bank 1"):
 *  (4) górny styk uziemnika niżej, z wyraźnym odstępem od górnej krawędzi kafla;
 *  (5) doprowadzenie jednoznaczne: węzeł (kropka) na torze → POZIOMO → PIONOWO w dół wprost
 *      w górny styk; odcinek poziomy nie biegnie wzdłuż krawędzi kafla;
 *  (3) oznaczenia zacisków P1/P2 nie kolidują z przekładnią (tabliczka) ani z odgałęzieniem Q8.
 *
 * Wyrocznia z geometrii sceny (porty symbolu, kafel z `prostokatKaflaStanu`, odcinki i kropki
 * węzłów sceny) — niezależna od kompozycji. Iloczyn cech: wzorzec pola (Z.10 sekcja 1 × Z.10
 * sekcja 2 × Z.11.1 i Z.11 z uziemnikiem Q51 w kolumnie odgałęzienia) × położenie uziemnika
 * {zamknięty, otwarty, brak stanu} × przyłączenie uziemnika {fikstura (węzeł za wyłącznikiem) ×
 * węzeł zacisku dolnego przekładnika T1} × poziom szczegółu {L0, L1, L2}.
 *
 * Iniekcja produkcyjna (zapisana w meldunku karty): `zwisAparatuBocznego` = 0 (uziemnik na
 * wysokości węzła, jak przed odbiorem) — testy doprowadzenia czerwone.
 */
import { describe, expect, it } from 'vitest';

import type { Bay, BayDeviceState, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { GRID } from '../../core/grid';
import { ZACISKI_PRZEKLADNIKA_PRADOWEGO, ZNACZNIK_ZACISKU_PRZEKLADNIKA } from '../../compose/zaciskiPrzekladnika';
import type { PreviewSymbol } from '../../compose/preview';
import { QET_SYMBOLE_POLA_SN } from '../../cad/qet/qetPoleSn';
import { czySymbolQet, SYMBOL_DEFS } from '../../symbols/defs';
import { prostokatKaflaStanu } from '../../symbols/glyphs';
import { buildSceneV3, type SceneV3 } from '../buildScene';

type Fikstura = { readonly snapshot: EnergyNetworkModel };
const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['Z.10 sekcja 1', (fxStaly1 as unknown as Fikstura).snapshot],
  ['Z.10 sekcja 2', (fxStaly2 as unknown as Fikstura).snapshot],
  ['Z.11.1 i Z.11', (fxZ11 as unknown as Fikstura).snapshot],
];
const STANY: readonly (BayDeviceState | 'brak')[] = ['zamkniety', 'otwarty', 'brak'];
const PRZYLACZENIA = ['fikstura', 'węzeł zacisku dolnego T1'] as const;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
const zachodzi = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
/** Prostokąty odcinków łamanej (grubość 1 j.św., jak przewód na rysunku). */
const prostokatyLamanej = (pts: readonly { x: number; y: number }[]): Rect[] =>
  pts.slice(1).map((b, i) => {
    const a = pts[i];
    return { x: Math.min(a.x, b.x) - 0.5, y: Math.min(a.y, b.y) - 0.5, width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1 };
  });

const polaLiniowe = (enm: EnergyNetworkModel): readonly Bay[] =>
  (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field'));

function wariant(enm: EnergyNetworkModel, stan: BayDeviceState | 'brak', przylaczenie: (typeof PRZYLACZENIA)[number]): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  for (const bay of kopia.bays ?? []) {
    if (!(bay.tags ?? []).includes('gpz_line_field')) continue;
    const devices = bay.primary_devices ?? [];
    for (const d of devices) {
      if (d.kind === 'ES') d.switch_state = stan === 'brak' ? null : ({ actual_state: stan } as NonNullable<BayPrimaryDevice['switch_state']>);
    }
    if (przylaczenie === 'węzeł zacisku dolnego T1') {
      const ct = devices.find((d) => d.kind === 'CT')!;
      const wezel = ct.ports!.find((p) => p.port_id === 'wy')!.wezel;
      const es = devices.find((d) => d.kind === 'ES' && d.designation === 'Q8');
      if (es) es.ports = [{ port_id: 'przylacze', wezel }] as BayPrimaryDevice['ports'];
    }
  }
  return kopia;
}

const uziemnikiPola = (scena: SceneV3, bayRef: string): PreviewSymbol[] =>
  scena.symbols.filter((s) => s.meta?.ownerRef === bayRef && s.symbolId === 'qetEarthSwitch');

function portN(s: PreviewSymbol): { x: number; y: number } {
  const p = SYMBOL_DEFS[s.symbolId].ports.find((port) => port.dir === 'N')!;
  return { x: s.x + p.x, y: s.y + p.y };
}

/** Naruszenia doprowadzenia do uziemnika `s` — pusta lista = zgodne z uwagą (5). */
function naruszeniaDoprowadzenia(scena: SceneV3, s: PreviewSymbol): string[] {
  const n = portN(s);
  const kafel = prostokatKaflaStanu(s.symbolId);
  const gornaKafla = s.y + kafel.y;
  const doPortu = scena.segments.filter((g) => {
    const ost = g.points[g.points.length - 1];
    return ost.x === n.x && ost.y === n.y;
  });
  if (doPortu.length !== 1) return [`odcinków kończących się w górnym styku: ${doPortu.length}`];
  const pts = doPortu[0].points;
  const bledy: string[] = [];
  if (pts.length !== 3) bledy.push(`łamana ${pts.length}-punktowa (oczekiwana: węzeł → poziomo → pionowo)`);
  const [wezel, kolano] = pts;
  if (wezel.y !== kolano?.y) bledy.push('pierwszy odcinek nie jest poziomy');
  if (kolano?.x !== n.x) bledy.push('ostatni odcinek nie jest pionowy');
  if (!(wezel.y < n.y)) bledy.push('przewód nie schodzi w dół do styku');
  // Poziomy odcinek co najmniej oczko nad kaflem (nie biegnie wzdłuż jego krawędzi).
  if (gornaKafla - wezel.y < GRID) bledy.push(`odcinek poziomy ${gornaKafla - wezel.y} px nad kaflem (< ${GRID})`);
  // Pion wchodzi w kafel od góry: górny styk nie leży nad kaflem ani na jego krawędzi.
  if (!(n.y >= gornaKafla)) bledy.push('górny styk nad kaflem');
  // Kotwica z kaflem stanu (port S łącznika w punkcie odczepu — uziemnik Q51 pod odłącznikiem Q5
  // kolumny odgałęzienia Z.11.1): węzeł na porcie kafla, odcinek poziomy na dolnej krawędzi
  // kafla kotwicy, bez kropki. Znalezisko klasy zgłoszone w meldunku karty (odsunięcie węzła na
  // przewód toru zmienia model przewodów z portów i wykrywanie węzłów sceny — decyzja
  // architekta); tu reguły kropki i krawędzi kafla obowiązują kotwice bez kafla (przekładnik T1
  // — uziemnik Q8 wszystkich wzorców), reguły kształtu odczepu i zwisu — wszystkie uziemniki.
  const kotwicaZKaflem = scena.symbols.some((k) => {
    if (!czySymbolQet(k.symbolId) || QET_SYMBOLE_POLA_SN[k.symbolId].kafel === null) return false;
    const sp = SYMBOL_DEFS[k.symbolId].ports.find((p) => p.dir === 'S');
    return sp !== undefined && k.x + sp.x === wezel.x && k.y + sp.y === wezel.y;
  });
  if (kotwicaZKaflem) return bledy;
  // Kropka węzła na torze (początek odczepu): węzeł sceny albo symbol kropki węzłowej
  // wyśrodkowany w punkcie odczepu.
  const kropka =
    scena.junctions.some((j) => j.x === wezel.x && j.y === wezel.y) ||
    scena.symbols.some(
      (j) =>
        (j.symbolId === 'junction' || j.symbolId === 'branchJunction') &&
        j.x + SYMBOL_DEFS[j.symbolId].width / 2 === wezel.x &&
        j.y + SYMBOL_DEFS[j.symbolId].height / 2 === wezel.y,
    );
  if (!kropka) bledy.push(`brak kropki węzła w (${wezel.x}, ${wezel.y})`);
  // Odcinek poziomy nie wchodzi na kafel stanu żadnego łącznika.
  const poziomy = prostokatyLamanej([wezel, kolano])[0];
  for (const inny of scena.symbols) {
    if (!czySymbolQet(inny.symbolId) || QET_SYMBOLE_POLA_SN[inny.symbolId].kafel === null) continue;
    const k = prostokatKaflaStanu(inny.symbolId);
    if (zachodzi(poziomy, { x: inny.x + k.x, y: inny.y + k.y, width: k.width, height: k.height })) {
      bledy.push(`odcinek poziomy przez kafel ${inny.symbolId}`);
    }
  }
  return bledy;
}

describe('odczep uziemnika pola: węzeł → poziomo → pionowo w górny styk (uwaga właściciela 2026-11-04)', () => {
  for (const [nazwa, enm] of FIKSTURY) {
    for (const stan of STANY) {
      for (const przylaczenie of PRZYLACZENIA) {
        for (const lod of [0, 1, 2] as const) {
          it(`${nazwa} × uziemnik ${stan} × ${przylaczenie} × L${lod}`, () => {
            const scena = buildSceneV3(wariant(enm, stan, przylaczenie), lod);
            for (const bay of polaLiniowe(enm).filter((b) => (b.primary_devices ?? []).some((d) => d.kind === 'ES'))) {
              const uziemniki = uziemnikiPola(scena, bay.ref_id);
              // L0: GPZ zwinięty do widoku przeglądowego (pole = kafel wyłącznika, bez aparatów
              // toru — `SLD_LOD_SPEC_OPERATOR_GRADE.md` §2); odczepu nie ma czego sprawdzać.
              if (lod === 0) {
                expect(uziemniki, `${bay.ref_id}: L0 bez aparatów toru`).toEqual([]);
                continue;
              }
              expect(uziemniki.length, `${bay.ref_id}: uziemniki pola na scenie`).toBeGreaterThan(0);
              for (const s of uziemniki) {
                expect(naruszeniaDoprowadzenia(scena, s), `${bay.ref_id} ${s.meta?.deviceRef}`).toEqual([]);
              }
            }
          });
        }
      }
    }
  }
});

describe(`oznaczenia ${ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne.join('/')} × przekładnia T1 × odgałęzienie Q8 — rozłączne (uwaga właściciela 2026-11-04 pkt 3)`, () => {
  for (const [nazwa, enm] of FIKSTURY) {
    for (const przylaczenie of PRZYLACZENIA) {
      it(`${nazwa} × ${przylaczenie} × L2`, () => {
        const scena = buildSceneV3(wariant(enm, 'otwarty', przylaczenie), 2);
        for (const bay of polaLiniowe(enm).filter((b) => (b.primary_devices ?? []).some((d) => d.designation === 'Q8'))) {
          const ct = bay.primary_devices!.find((d) => d.kind === 'CT')!;
          const zaciski = scena.labels.filter((l) => l.ownerRef.startsWith(`${bay.ref_id}${ZNACZNIK_ZACISKU_PRZEKLADNIKA}`));
          const przekladnia = scena.labels.filter((l) => l.ownerRef === `${bay.ref_id}#ct-rating-${ct.device_ref}`);
          expect(zaciski.map((l) => l.text).sort(), bay.ref_id).toEqual([...ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne]);
          expect(przekladnia.length, `${bay.ref_id}: przekładnia T1`).toBe(1);
          // Odgałęzienie Q8: odczep (odcinek kończący się w porcie N) i bryła uziemnika.
          const q8 = uziemnikiPola(scena, bay.ref_id).filter((s) => s.meta?.deviceRef === bay.primary_devices!.find((d) => d.designation === 'Q8')?.device_ref);
          expect(q8.length, `${bay.ref_id}: Q8 na scenie`).toBe(1);
          const n = portN(q8[0]);
          const odczep = scena.segments.find((g) => g.points[g.points.length - 1].x === n.x && g.points[g.points.length - 1].y === n.y)!;
          const def = SYMBOL_DEFS[q8[0].symbolId];
          const przeszkody: readonly [string, Rect][] = [
            ...prostokatyLamanej(odczep.points).map((r, i) => [`odczep Q8 odcinek ${i}`, r] as [string, Rect]),
            ['uziemnik Q8', { x: q8[0].x, y: q8[0].y, width: def.width, height: def.height }],
            ...przekladnia.map((l) => [`przekładnia „${l.text}"`, l.rect] as [string, Rect]),
          ];
          for (const z of zaciski) {
            for (const [opis, r] of przeszkody) expect(zachodzi(z.rect, r), `${bay.ref_id}: ${z.text} × ${opis}`).toBe(false);
          }
          expect(zachodzi(zaciski[0].rect, zaciski[1].rect), `${bay.ref_id}: ${ZACISKI_PRZEKLADNIKA_PRADOWEGO.pierwotne.join(' × ')}`).toBe(false);
          for (const [opis, r] of przeszkody.filter(([o]) => o.startsWith('odczep') || o.startsWith('uziemnik'))) {
            expect(zachodzi(przekladnia[0].rect, r), `${bay.ref_id}: przekładnia × ${opis}`).toBe(false);
          }
        }
      });
    }
  }
});
