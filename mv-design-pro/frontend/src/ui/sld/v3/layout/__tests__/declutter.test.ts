/**
 * SLD V3 — testy SILNIKA ETYKIET (SCHEMAT-10 S2, V12K-135; audyt §1 D2/§3).
 * Silnik `declutterLabels` rozstrzyga kolizje deterministycznie po priorytecie
 * i ODRZUCA przegranego (nie renderuje zamiast nachodzić). Fixtura odniesienia
 * jest z konstrukcji bezkolizyjna (declutter = tożsamość), więc DZIAŁANIE
 * mechanizmu dowodzimy tu na syntetycznych zbiorach kolidujących — analogicznie
 * do ścieżek zapasowych `labels.ts` (celowo za wąskie prostokąty).
 */

import { describe, expect, it } from 'vitest';
import type { V3Rect } from '../../core/grid';
import type { OwnedLabel, OwnerKind } from '../labels';
import { declutterLabels, labelPriority, LABEL_PRIORITY } from '../declutter';

function label(ownerRef: string, ownerKind: OwnerKind, rect: V3Rect): OwnedLabel {
  return { ownerRef, ownerKind, labelClass: 't2', text: ownerRef, slotIndex: 1, rect };
}

const R = (x: number, y: number, w = 40, h = 16): V3Rect => ({ x, y, width: w, height: h });

describe('declutterLabels — priorytety (audyt §3: S-id > nazwa > moc > parametry)', () => {
  it('przy kolizji dwóch etykiet ODRZUCA niższy priorytet, zachowuje wyższy', () => {
    const nazwa = label('S01', 'station-name', R(0, 0));
    const param = label('L01', 'segment-span', R(10, 4)); // nachodzi na S01
    const { kept, dropped } = declutterLabels([param, nazwa], []);
    expect(kept.map((l) => l.ownerRef)).toEqual(['S01']);
    expect(dropped.map((l) => l.ownerRef)).toEqual(['L01']);
  });

  it('moc (der) ustępuje nazwie stacji, ale wygrywa z parametrem przęsła', () => {
    const nazwa = label('S02', 'station-name', R(0, 0));
    const moc = label('DER1', 'der', R(8, 2)); // koliduje z nazwą
    const param = label('L02', 'segment-span', R(4, 6)); // koliduje z nazwą i moc
    const { kept } = declutterLabels([param, moc, nazwa], []);
    // Nazwa wygrywa; moc i parametr kolidują z nazwą → oba odrzucone.
    expect(kept.map((l) => l.ownerRef)).toEqual(['S02']);
  });

  it('symbol ZAWSZE wygrywa — etykieta nachodząca na symbol jest odrzucana niezależnie od priorytetu', () => {
    const nazwa = label('S03', 'station-name', R(0, 0));
    const symbol = R(5, 5, 20, 20); // nachodzi na etykietę o najwyższym priorytecie
    const { kept, dropped } = declutterLabels([nazwa], [symbol]);
    expect(kept).toHaveLength(0);
    expect(dropped.map((l) => l.ownerRef)).toEqual(['S03']);
  });

  it('etykiety rozłączne — NIC nie odrzucone (declutter = tożsamość), kolejność zachowana', () => {
    const a = label('A', 'der', R(0, 0));
    const b = label('B', 'segment-span', R(100, 0));
    const c = label('C', 'station-name', R(200, 0));
    const { kept, dropped } = declutterLabels([a, b, c], []);
    expect(kept.map((l) => l.ownerRef)).toEqual(['A', 'B', 'C']);
    expect(dropped).toHaveLength(0);
  });

  it('determinizm: ten sam wejściowy zbiór (dowolna kolejność) daje ten sam wynik', () => {
    const set: OwnedLabel[] = [
      label('S', 'station-name', R(0, 0)),
      label('P', 'segment-span', R(6, 2)),
      label('M', 'der', R(3, 4)),
    ];
    const r1 = declutterLabels(set, []);
    const r2 = declutterLabels([...set].reverse(), []);
    expect(r1.kept.map((l) => l.ownerRef).sort()).toEqual(r2.kept.map((l) => l.ownerRef).sort());
  });

  it('tabela priorytetów: tożsamość > moc > parametry (audyt §3)', () => {
    expect(LABEL_PRIORITY['station-name']).toBeGreaterThan(LABEL_PRIORITY.der);
    expect(LABEL_PRIORITY.der).toBeGreaterThan(LABEL_PRIORITY['segment-span']);
    expect(labelPriority(label('x', 'busbar-voltage', R(0, 0)))).toBeGreaterThan(
      labelPriority(label('y', 'port-caption', R(0, 0))),
    );
  });
});
