/**
 * OBRYSY ETYKIET WEDŁUG PLANU (`canvas/obrysyWgPlanu.ts`) — ramka bloku przekaźnika i tło pola
 * GPZ obejmują to, co plan etykiet NARYSOWAŁ, a nie slot sceny w piśmie naturalnym.
 *
 * Defekt (bieg e2e `ux04-pole-liniowe-zrzuty-screenshot`, kadr pola Z.11.1, 2026-10-30): podłoga
 * opisów celu kadru podniosła pismo wierszy bloku z 8 do 8,81 j.św., a ramka bloku i tło pola
 * zostały w geometrii sceny — wiersz „81O · 81R · ZS · 50BF · 79" wychodził 8,1 px poza ramkę
 * i 2,3 px poza tło. Ta sama klasa przy oddaleniu: podpisy aparatów powiększone podłogą
 * czytelności wychodziły poza tło pola bez żadnego kadru (sonda: 22–35 etykiet przy skali
 * 0,35–0,5 na fiksturach pól liniowych).
 *
 * ILOCZYN CECH: fikstura {Z.10 stałe w sekcji 1, Z.10 stałe w sekcji 2, Z.11.1 i Z.11} × skala
 * kamery {2,5 (pismo naturalne), 1,5, 1,0, 0,7, 0,5, 0,35} × kadr {brak, każde pole GPZ}
 * × obrys {ramka bloku, tło pola} × warunek {zawiera narysowany tusz, ciasny (dokładnie suma
 * + margines), tożsamość ze sceną w piśmie naturalnym, tła rozłączne}. Plus render DOM kanwy
 * (kadr pola, pismo powiększone) i iniekcja: obrys sceny NIE obejmuje tuszu planu.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { RAMKA_BLOKU_PRZEKAZNIKA_MARGINES, PROTECTION_ANNOTATION_DIAMETER } from '../../compose/protectionMarking';
import type { PanelPolaGpz } from '../../compose/gpzAdnotacje';
import { GRID, type V3Rect } from '../../core/grid';
import { LABEL_TYPOGRAPHY, measureTextWidth } from '../../core/text';
import { buildSceneV3, sceneObstacleRects, type SceneV3 } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { planSceneLabels, type LabelRenderPlan } from '../labelLegibility';
import { paneleWgPlanu, ramkiBlokowWgPlanu } from '../obrysyWgPlanu';
import { SldCanvasV3, symbolTestId } from '../SldCanvasV3';
import { podlogaOpisowCelu, zakresCelu } from '../zakresKadru';

afterEach(() => cleanup());

const snapshot = (fx: unknown): EnergyNetworkModel => (fx as { snapshot: EnergyNetworkModel }).snapshot;
const FIKSTURY: ReadonlyArray<readonly [string, EnergyNetworkModel]> = [
  ['Z.10, stałe w sekcji 1', snapshot(fxStaly1)],
  ['Z.10, stałe w sekcji 2', snapshot(fxStaly2)],
  ['Z.11.1 i Z.11', snapshot(fxZ11)],
];
const SKALE = [2.5, 1.5, 1.0, 0.7, 0.5, 0.35] as const;
const SKALA_NATURALNA = 2.5;
/** Wiersz bloku przekaźnika — wyrocznia NIEZALEŻNA od listy członków sceny (wzorzec `ownerRef`). */
const WIERSZ_BLOKU = /#(protection-codes-full|zrodlo-u0)(-\d+)?$/;
const M_RAMKI = RAMKA_BLOKU_PRZEKAZNIKA_MARGINES;
const M_TLA = GRID / 2;

const EPS = 1e-9;
const zawiera = (a: V3Rect, b: V3Rect): boolean =>
  b.x >= a.x - EPS && b.y >= a.y - EPS && b.x + b.width <= a.x + a.width + EPS && b.y + b.height <= a.y + a.height + EPS;
const zachodzi = (a: V3Rect, b: V3Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const poszerz = (r: V3Rect, m: number): V3Rect => ({ x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m });
/** Obrys sumy prostokątów — liczony w teście, niezależnie od `ramkaBlokuPrzekaznika`/`panelePolGpz`. */
function suma(prostokaty: readonly V3Rect[]): V3Rect {
  const x0 = Math.min(...prostokaty.map((r) => r.x));
  const y0 = Math.min(...prostokaty.map((r) => r.y));
  const x1 = Math.max(...prostokaty.map((r) => r.x + r.width));
  const y1 = Math.max(...prostokaty.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
const rowne = (a: V3Rect, b: V3Rect): boolean =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.width - b.width) < 1e-6 && Math.abs(a.height - b.height) < 1e-6;

interface Przypadek {
  readonly fikstura: string;
  readonly skala: number;
  readonly kadr: string;
  readonly scena: SceneV3;
  readonly plan: LabelRenderPlan;
}

const SCENY = new Map(FIKSTURY.map(([nazwa, enm]) => [nazwa, buildSceneV3(enm, 2)] as const));
const PRZYPADKI: Przypadek[] = FIKSTURY.flatMap(([fikstura, enm]) => {
  const scena = SCENY.get(fikstura)!;
  const przeszkody = sceneObstacleRects(scena);
  const arkusz = sheetSizeFor(scena);
  const pola = (scena.meta.gpzAdnotacje?.panele ?? []).map((p) => p.bayRef);
  return SKALE.flatMap((skala) =>
    ['brak', ...pola].map((kadr): Przypadek => {
      let podloga;
      if (kadr !== 'brak') {
        const z = zakresCelu('pole', enm, [kadr], scena);
        if (!z.dostepny) throw new Error(`${fikstura}: kadr pola ${kadr} niedostępny — ${z.przyczyna}`);
        podloga = podlogaOpisowCelu(new Set(z.zakres.refy));
      }
      return { fikstura, skala, kadr, scena, plan: planSceneLabels(scena.labels, przeszkody, skala, arkusz, podloga) };
    }),
  );
});

/** Naruszenia warunków obrysów jednego planu (pusta lista = obrysy poprawne). */
function naruszenia(p: Przypadek): string[] {
  const bledy: string[] = [];
  const opis = `${p.fikstura} @${p.skala} kadr ${p.kadr.slice(-7)}`;
  const ramki = ramkiBlokowWgPlanu(p.scena.symbols, p.plan.drawn);
  const panele = paneleWgPlanu(p.scena.meta.gpzAdnotacje!.panele, p.scena.symbols, ramki, p.plan.drawn);
  // Ramka bloku: dokładnie okrąg ∪ NARYSOWANE wiersze bloku + margines; brak wierszy = brak ramki.
  p.scena.symbols.forEach((s, i) => {
    if (!s.meta?.ramkaBlokuPrzekaznika) {
      if (ramki.has(i)) bledy.push(`${opis}: ramka dla symbolu bez ramki sceny ${symbolTestId(s, i)}`);
      return;
    }
    const wiersze = p.plan.drawn.filter((d) => d.label.ownerRef.startsWith(`${s.meta!.ownerRef}#`) && WIERSZ_BLOKU.test(d.label.ownerRef));
    const ramka = ramki.get(i);
    if (wiersze.length === 0) {
      if (ramka !== undefined) bledy.push(`${opis}: ramka bez narysowanych wierszy`);
      return;
    }
    if (!ramka) {
      bledy.push(`${opis}: brak ramki przy ${wiersze.length} narysowanych wierszach`);
      return;
    }
    const abs = { ...ramka, x: s.x + ramka.x, y: s.y + ramka.y };
    const okrag = { x: s.x, y: s.y, width: PROTECTION_ANNOTATION_DIAMETER, height: PROTECTION_ANNOTATION_DIAMETER };
    const oczekiwana = poszerz(suma([okrag, ...wiersze.map((w) => w.rect)]), M_RAMKI);
    if (!rowne(abs, oczekiwana)) bledy.push(`${opis}: ramka ${JSON.stringify(abs)} ≠ okrąg ∪ wiersze + margines ${JSON.stringify(oczekiwana)}`);
    for (const w of wiersze) if (!zawiera(abs, w.rect)) bledy.push(`${opis}: „${w.text}" poza ramką`);
  });
  // Tło pola: obrys sceny ∪ narysowane etykiety-członkowie ∪ ramki bloków pola, każde z marginesem.
  const sceny = p.scena.meta.gpzAdnotacje!.panele;
  panele.forEach((panel, k) => {
    const panelSceny = sceny[k];
    if (panel.bayRef !== panelSceny.bayRef || panel.rola !== panelSceny.rola) bledy.push(`${opis}: kolejność/rola tła`);
    const czlonkowie = p.plan.drawn.filter((d) => panelSceny.etykiety.includes(d.label.ownerRef)).map((d) => poszerz(d.rect, M_TLA));
    const ramkiPola: V3Rect[] = [];
    p.scena.symbols.forEach((s, i) => {
      const r = ramki.get(i);
      if (r && s.meta?.ownerRef === panel.bayRef) ramkiPola.push(poszerz({ ...r, x: s.x + r.x, y: s.y + r.y }, M_TLA));
    });
    const oczekiwane = suma([panelSceny.rect, ...czlonkowie, ...ramkiPola]);
    if (!rowne(panel.rect, oczekiwane)) bledy.push(`${opis}: tło ${panel.bayRef.slice(-7)} ${JSON.stringify(panel.rect)} ≠ ${JSON.stringify(oczekiwane)}`);
    for (const c of [...czlonkowie, ...ramkiPola]) if (!zawiera(panel.rect, c)) bledy.push(`${opis}: tusz poza tłem ${panel.bayRef.slice(-7)}`);
  });
  panele.forEach((a, i) =>
    panele.slice(i + 1).forEach((b) => {
      if (zachodzi(a.rect, b.rect)) bledy.push(`${opis}: tła ${a.bayRef.slice(-7)} × ${b.bayRef.slice(-7)} zachodzą`);
    }),
  );
  // Pismo naturalne bez kadru: obrysy kanwy = obrysy sceny (rysunek bez zmian).
  if (p.skala === SKALA_NATURALNA && p.kadr === 'brak') {
    ramki.forEach((r, i) => {
      const sceny2 = p.scena.symbols[i].meta!.ramkaBlokuPrzekaznika!;
      if (!r || !rowne(r, sceny2)) bledy.push(`${opis}: ramka w piśmie naturalnym ≠ scena`);
    });
    panele.forEach((panel, k) => {
      if (!rowne(panel.rect, sceny[k].rect)) bledy.push(`${opis}: tło w piśmie naturalnym ≠ scena`);
    });
  }
  return bledy;
}

describe('obrysy etykiet wg planu — iloczyn fikstura × skala × kadr × obrys', () => {
  it('warunek wstępny: każda fikstura ma tła pól, bloki przekaźników z ramką i listy członków zgodne ze sceną', () => {
    for (const [nazwa, scena] of SCENY) {
      const panele = scena.meta.gpzAdnotacje?.panele ?? [];
      expect(panele.length, nazwa).toBeGreaterThan(0);
      const refyEtykiet = new Set(scena.labels.map((l) => l.ownerRef));
      const zRamka = scena.symbols.filter((s) => s.meta?.ramkaBlokuPrzekaznika);
      expect(zRamka.length, nazwa).toBeGreaterThan(0);
      for (const s of zRamka) {
        // Predykaty parami: lista członków ramki = DOKŁADNIE wiersze bloku pola wg wzorca ownerRef.
        const wgWzorca = scena.labels
          .filter((l) => l.ownerRef.startsWith(`${s.meta!.ownerRef}#`) && WIERSZ_BLOKU.test(l.ownerRef))
          .map((l) => l.ownerRef)
          .sort();
        expect([...(s.meta!.wierszeBlokuPrzekaznika ?? [])].sort(), `${nazwa}: wiersze bloku ${s.meta!.ownerRef}`).toEqual(wgWzorca);
        const panel = panele.find((p) => p.bayRef === s.meta!.ownerRef)!;
        for (const w of wgWzorca) expect(panel.etykiety, `${nazwa}: wiersz bloku ${w} jest członkiem tła pola`).toContain(w);
      }
      for (const panel of panele) {
        expect(panel.etykiety.length, `${nazwa}: tło ${panel.bayRef} ma etykiety`).toBeGreaterThan(0);
        for (const ref of panel.etykiety) {
          expect(refyEtykiet.has(ref), `${nazwa}: członek tła ${ref} istnieje w scenie`).toBe(true);
          expect(ref.startsWith(`${panel.bayRef}#`), `${nazwa}: członek tła ${ref} należy do pola`).toBe(true);
        }
      }
    }
  });

  it.each(FIKSTURY.map(([n]) => n))('%s: ramka bloku i tło pola obejmują narysowany tusz na każdej skali i w każdym kadrze', (fikstura) => {
    const bledy = PRZYPADKI.filter((p) => p.fikstura === fikstura).flatMap(naruszenia);
    expect(bledy).toEqual([]);
  });

  it('iloczyn nie jest pusty: pismo bloku powiększone, wiersze ukryte, tło poszerzone — każde występuje', () => {
    let powiekszoneWiersze = 0;
    let ramkiBezWierszy = 0;
    let tlaPoszerzone = 0;
    for (const p of PRZYPADKI) {
      powiekszoneWiersze += p.plan.drawn.filter((d) => WIERSZ_BLOKU.test(d.label.ownerRef) && d.enlarged).length;
      const ramki = ramkiBlokowWgPlanu(p.scena.symbols, p.plan.drawn);
      ramkiBezWierszy += [...ramki.values()].filter((r) => r === undefined).length;
      const panele = paneleWgPlanu(p.scena.meta.gpzAdnotacje!.panele, p.scena.symbols, ramki, p.plan.drawn);
      tlaPoszerzone += panele.filter((t, k) => !rowne(t.rect, p.scena.meta.gpzAdnotacje!.panele[k].rect)).length;
    }
    expect(powiekszoneWiersze).toBeGreaterThan(0);
    expect(ramkiBezWierszy).toBeGreaterThan(0);
    expect(tlaPoszerzone).toBeGreaterThan(0);
  });

  it('iniekcja (stan przed naprawą): ramka i tło sceny NIE obejmują tuszu planu — wyrocznia rozróżnia', () => {
    let wierszePozaRamkaSceny = 0;
    let etykietyPozaTlemSceny = 0;
    for (const p of PRZYPADKI) {
      p.scena.symbols.forEach((s) => {
        const r = s.meta?.ramkaBlokuPrzekaznika;
        if (!r) return;
        const abs = { ...r, x: s.x + r.x, y: s.y + r.y };
        for (const d of p.plan.drawn) {
          if ((s.meta!.wierszeBlokuPrzekaznika ?? []).includes(d.label.ownerRef) && !zawiera(abs, d.rect)) wierszePozaRamkaSceny += 1;
        }
      });
      for (const panel of p.scena.meta.gpzAdnotacje!.panele as readonly PanelPolaGpz[]) {
        for (const d of p.plan.drawn) if (panel.etykiety.includes(d.label.ownerRef) && !zawiera(panel.rect, d.rect)) etykietyPozaTlemSceny += 1;
      }
    }
    expect(wierszePozaRamkaSceny).toBeGreaterThan(0);
    expect(etykietyPozaTlemSceny).toBeGreaterThan(0);
  });
});

/**
 * Render DOM kanwy: kadr pola z podłogą opisów celu — ramka `data-przekaznik="ramka-bloku"`
 * i tło `sld-v3-gpz-panel-*` obejmują tusz wierszy bloku odczytany z DOM (zaczep, pismo,
 * tabela posuwów kroju — ta sama, którą e2e porównuje z metryką przeglądarki).
 */
describe('kanwa: ramka bloku i tło pola w kadrze pola obejmują powiększone wiersze (DOM)', () => {
  const enm = snapshot(fxZ11);
  const scena = SCENY.get('Z.11.1 i Z.11')!;
  const pole = scena.meta.gpzAdnotacje!.panele[0].bayRef;
  const z = zakresCelu('pole', enm, [pole], scena);
  if (!z.dostepny) throw new Error(z.przyczyna);
  const indeks = scena.symbols.findIndex((s) => s.meta?.ownerRef === pole && s.meta?.ramkaBlokuPrzekaznika);
  const przekaznik = scena.symbols[indeks];

  it('wiersze bloku narysowane pismem podłogi celu, w ramce i w tle pola; ramka sceny ich nie obejmuje', () => {
    // Kanwa dobrana tak, by dopasowanie widoku dało skalę, przy której podłoga celu (13 px)
    // podnosi pismo t4 (8 j.św.), a sufit proporcji klasy jeszcze go dopuszcza.
    const { container } = render(<SldCanvasV3 snapshot={enm} width={4200} height={1800} lodOverride={2} refyKadru={z.zakres.refy} />);
    const grupa = container.querySelector(`[data-testid="${CSS.escape(symbolTestId(przekaznik, indeks))}"]`)!;
    const rama = grupa.querySelector('[data-przekaznik="ramka-bloku"]');
    expect(rama, 'ramka bloku narysowana').not.toBeNull();
    const ramka = {
      x: przekaznik.x + Number(rama!.getAttribute('x')),
      y: przekaznik.y + Number(rama!.getAttribute('y')),
      width: Number(rama!.getAttribute('width')),
      height: Number(rama!.getAttribute('height')),
    };
    const typo = LABEL_TYPOGRAPHY.t4;
    const wiersze = [...container.querySelectorAll('g[data-testid^="sld-v3-label-"][data-owner-ref]')]
      .filter((g) => (g.getAttribute('data-owner-ref') ?? '').startsWith(`${pole}#`) && WIERSZ_BLOKU.test(g.getAttribute('data-owner-ref') ?? ''))
      .map((g) => {
        const t = [...g.children].find((c) => c.tagName.toLowerCase() === 'text')!;
        const fs = Number(t.getAttribute('font-size'));
        expect(t.getAttribute('text-anchor'), 'wiersz bloku zaczepiony w lewej krawędzi').toBe('start');
        return {
          tekst: t.textContent ?? '',
          fs,
          rect: { x: Number(t.getAttribute('x')), y: Number(t.getAttribute('y')) - (fs + 6) / 2, width: measureTextWidth(t.textContent ?? '', fs, typo.fontWeight), height: fs + 6 },
        };
      });
    expect(wiersze.length, 'wiersze bloku narysowane').toBeGreaterThan(0);
    // Warunek wstępny: pismo powiększone podłogą celu (inaczej test nie dotyka defektu).
    for (const w of wiersze) expect(w.fs, `„${w.tekst}" pismem podłogi celu`).toBeGreaterThan(typo.fontSize);
    for (const w of wiersze) expect(zawiera(ramka, w.rect), `„${w.tekst}" w ramce bloku ${JSON.stringify(ramka)}`).toBe(true);
    const maxPrawa = Math.max(...wiersze.map((w) => w.rect.x + w.rect.width));
    expect(ramka.x + ramka.width - maxPrawa, 'ramka ciasna: margines od najszerszego wiersza').toBeCloseTo(M_RAMKI, 6);
    const tlo = container.querySelector(`[data-testid="${CSS.escape(`sld-v3-gpz-panel-${pole}`)}"]`)!;
    const rectTla = {
      x: Number(tlo.getAttribute('x')),
      y: Number(tlo.getAttribute('y')),
      width: Number(tlo.getAttribute('width')),
      height: Number(tlo.getAttribute('height')),
    };
    expect(zawiera(rectTla, poszerz(ramka, M_TLA)), 'ramka bloku z marginesem w tle pola').toBe(true);
    // Iniekcja: ramka SCENY (stan przed naprawą) nie obejmuje powiększonych wierszy.
    const r = przekaznik.meta!.ramkaBlokuPrzekaznika!;
    const ramkaSceny = { ...r, x: przekaznik.x + r.x, y: przekaznik.y + r.y };
    expect(wiersze.some((w) => !zawiera(ramkaSceny, w.rect)), 'ramka sceny nie obejmuje powiększonego wiersza').toBe(true);
  });
});
