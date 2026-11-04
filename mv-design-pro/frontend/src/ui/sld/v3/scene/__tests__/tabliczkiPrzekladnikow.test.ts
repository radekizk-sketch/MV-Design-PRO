/**
 * Opisy przekładników bezpośrednio przy symbolach (karta UX-04/POLE-LINIOWE-WZORZEC: „opisy
 * przekładników (przekładnia, klasa) bezpośrednio przy symbolach, z testami kolizji
 * bounding-box").
 *
 * Klasa: KAŻDY przekładnik pola z tabliczką w rekordzie aparatu — prądowy (`rdzenie`), napięciowy
 * (`uzwojenia`), Ferrantiego (`przekladnia`) — ma na scenie dokładnie jedną tabliczkę, przy SWOIM
 * symbolu, bez kolizji z rysunkiem i innymi napisami.
 *
 * Wyrocznia niezależna od kompozytora: treść z SUROWYCH danych fikstury — odbiór B-02 właściciela
 * 2026-11-04 (pkt 6): na schemacie KRÓTKA przekładnia („200–400/5”, VT liczbowo z napięcia szyny
 * pola „15/√3 / 0,1/√3 kV”), bez klas, zaczepu i kolejnych rdzeni (inspektor pola), kolizje z obrysów symboli sceny i prostokątów etykiet (scena oraz plan
 * etykiet kanwy przy skalach roboczych).
 *
 * Iloczyn cech: fikstura {Z.10 w sekcji 1, Z.10 w sekcji 2, Z.11.1 i Z.11, Z.11 z przekładnikiem
 * prądowym bez portów (aparat poza torem — model zdegenerowany)} × rodzaj przekładnika {prądowy,
 * napięciowy, Ferrantiego} × skala planu {1,0; 1,5; 2,5} (LOD2 — warstwa adnotacji) × przeszkoda
 * {symbol, etykieta, przewód i linie przekaźnika (pomiarowe, wyłączania), ramka bloku
 * zabezpieczeń} × strona {lewa — przekładnik toru głównego (podpis w kolumnie po lewej, korekta
 * v2 2026-11-04), prawa — przekładnik kolumny odgałęzienia (podpis po prawej)}.
 */
import { describe, expect, it } from 'vitest';

import type { BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxStaly2 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_2.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { planSceneLabels } from '../../canvas/labelLegibility';
import { GRID, type V3Rect } from '../../core/grid';
import { obrysSymbolu, rodzajSymbolu } from '../../symbols/defs';
import { sheetSizeFor } from '../../sheet/outline';
import { buildSceneV3, labelWireCollisions, sceneObstacleRects, type SceneV3 } from '../buildScene';

const snapshot = (fx: unknown): EnergyNetworkModel => (fx as { snapshot: EnergyNetworkModel }).snapshot;
/** Z.11 z przekładnikiem prądowym bez portów: kompozytor stawia go poza torem, a przekładnik
 *  napięciowy odgałęzienia obok niego — pas wysokości przy symbolu jest zajęty (wariant, w którym
 *  tabliczka znikała z rysunku albo wchodziła na przekaźnik). */
function bezPortowCt(enm: EnergyNetworkModel): EnergyNetworkModel {
  const kopia = structuredClone(enm);
  for (const b of kopia.bays ?? []) {
    b.primary_devices = (b.primary_devices ?? []).map((d) => (d.kind === 'CT' ? { ...d, ports: [] } : d));
  }
  return kopia;
}
const NAZWA_ZDEGENEROWANEJ = 'Z.11, przekładnik prądowy bez portów';
const FIKSTURY: ReadonlyArray<readonly [string, EnergyNetworkModel]> = [
  ['Z.10, stałe w sekcji 1', snapshot(fxStaly1)],
  ['Z.10, stałe w sekcji 2', snapshot(fxStaly2)],
  ['Z.11.1 i Z.11', snapshot(fxZ11)],
  [NAZWA_ZDEGENEROWANEJ, bezPortowCt(snapshot(fxZ11))],
];
/** Model zdegenerowany: przy symbolu przekładnika nie ma wolnego miejsca (aparaty odgałęzienia
 *  i ich napisy stoją tuż obok), więc wymaganie „bezpośrednio przy symbolu" nie jest w nim
 *  osiągalne — sprawdzane jest to, co osiągalne zawsze: tabliczka istnieje, ma treść z rekordu
 *  i nie koliduje z niczym na rysunku (stan przed poprawką: tabliczka znikała z rysunku albo
 *  wchodziła na linię pomiarową przy przekaźniku). */
const TYLKO_KOLIZJE: ReadonlySet<string> = new Set([NAZWA_ZDEGENEROWANEJ]);
const SKALE = [1.0, 1.5, 2.5] as const;

type Rodzaj = 'prądowy' | 'napięciowy' | 'Ferrantiego';
interface Wzorzec {
  readonly przyrostek: string;
  readonly symbol: string;
  readonly maTabliczke: (d: BayPrimaryDevice) => boolean;
  readonly tresc: (d: BayPrimaryDevice, unKv: number | undefined) => string;
}

/** Zapis tabliczki z surowych danych — wg rysunków standardu (Z.10 s.89, Z.11.1 s.91). */
const WZORCE: Readonly<Record<Rodzaj, Wzorzec>> = {
  prądowy: {
    przyrostek: 'ct-rating',
    symbol: 'currentTransformer',
    maTabliczke: (d) => d.kind === 'CT' && (d.rdzenie?.length ?? 0) > 0,
    tresc: (d) => d.rdzenie![0].przekladnia.replace(/-/g, '–'),
  },
  napięciowy: {
    przyrostek: 'vt-rating',
    symbol: 'voltageTransformer',
    maTabliczke: (d) => d.kind === 'VT' && (d.uzwojenia?.length ?? 0) > 0,
    tresc: (d, unKv) => {
      const [pierwotna, wtorna] = d.uzwojenia![0].przekladnia.split(' / ');
      return `${pierwotna.replace('SN', String(unKv).replace('.', ','))} / ${wtorna} kV`;
    },
  },
  Ferrantiego: {
    przyrostek: 'cbct-rating',
    symbol: 'qetCoreBalanceCt',
    maTabliczke: (d) => d.kind === 'CORE_BALANCE_CT' && !!d.przekladnia,
    tresc: (d) => d.przekladnia!,
  },
};
const RODZAJE = Object.keys(WZORCE) as Rodzaj[];

const zachodzi = (a: V3Rect, b: V3Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function obrysNaScenie(s: SceneV3['symbols'][number]): V3Rect {
  const o = obrysSymbolu(s.symbolId);
  return { x: s.x + o.x, y: s.y + o.y, width: o.width, height: o.height };
}

/** Odstęp dwóch prostokątów w poziomie i w pionie (0, gdy rzuty się nakładają). */
function odstep(a: V3Rect, b: V3Rect): { readonly dx: number; readonly dy: number } {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return { dx, dy };
}

/** Naruszenia klasy „tabliczka przy symbolu" dla jednej sceny i rodzaju (pusta lista = zgodna). */
function naruszeniaTabliczek(enm: EnergyNetworkModel, scena: SceneV3, rodzaj: Rodzaj, przySymbolu = true): string[] {
  const w = WZORCE[rodzaj];
  const n: string[] = [];
  const aparaty = (enm.bays ?? []).flatMap((b) => (b.primary_devices ?? []).filter(w.maTabliczke).map((d) => ({ bay: b, d })));
  for (const { bay, d } of aparaty) {
    const ref = `${bay.ref_id}#${w.przyrostek}-${d.device_ref}`;
    const etykiety = scena.labels.filter((l) => l.ownerRef === ref);
    if (etykiety.length !== 1) {
      n.push(`${ref}: ${etykiety.length} tabliczek (oczekiwano 1)`);
      continue;
    }
    const l = etykiety[0];
    const unKv = (enm.buses ?? []).find((b) => b.ref_id === bay.bus_ref)?.voltage_kv;
    const tresc = w.tresc(d, unKv);
    if (l.text !== tresc) n.push(`${ref}: treść „${l.text}" ≠ „${tresc}"`);
    if (/…|P20|FS|zaczep|SN\//.test(l.text)) n.push(`${ref}: nadmiarowy opis na schemacie „${l.text}"`);
    const symbol = scena.symbols.find((s) => s.meta?.ownerRef === bay.ref_id && s.meta?.deviceRef === d.device_ref);
    if (!symbol || rodzajSymbolu(symbol.symbolId) !== w.symbol) {
      n.push(`${ref}: brak symbolu ${w.symbol} aparatu na scenie`);
      continue;
    }
    // „Bezpośrednio przy symbolu": tabliczka po stronie PODPISU aparatu (polecenie właściciela
    // 2026-11-04, korekta v2: przekładnie T1 i T2 toru głównego po LEWEJ symbolu — tam stoi
    // kolumna podpisów; przekładnik kolumny odgałęzienia, np. T3, ma podpis po prawej), w pasie
    // jego wysokości (± oczko), a w korytarzu między symbolem a tabliczką nie stoi żaden INNY
    // aparat ani napis — dopuszczalne są tylko oznaczenia TEGO aparatu (podpis, zaciski P1/P2).
    // Po lewej tabliczka stoi na prawo od podpisu (między podpisem a symbolem).
    const o = obrysNaScenie(symbol);
    const { dx, dy } = odstep(l.rect, o);
    const podpis = scena.labels.find((x) => x.ownerRef === `${bay.ref_id}#etykieta-aparatu-${d.device_ref}`);
    const strona: 'left' | 'right' = podpis && podpis.rect.x + podpis.rect.width <= o.x ? 'left' : 'right';
    const korytarz: V3Rect =
      strona === 'right'
        ? { x: o.x + o.width, y: l.rect.y, width: Math.max(0, l.rect.x - (o.x + o.width)), height: l.rect.height }
        : { x: l.rect.x + l.rect.width, y: l.rect.y, width: Math.max(0, o.x - (l.rect.x + l.rect.width)), height: l.rect.height };
    // Model zdegenerowany (`przySymbolu = false`) — tylko kolizje (niżej).
    if (przySymbolu && dy > GRID) n.push(`${ref}: tabliczka ${dy} j.św. nad/pod symbolem`);
    if (przySymbolu && strona === 'right' && l.rect.x < o.x + o.width) n.push(`${ref}: tabliczka nie stoi po prawej symbolu (strona podpisu)`);
    if (przySymbolu && strona === 'left' && l.rect.x + l.rect.width > o.x) n.push(`${ref}: tabliczka nie stoi po lewej symbolu (strona podpisu)`);
    if (przySymbolu && strona === 'left' && podpis && l.rect.x < podpis.rect.x + podpis.rect.width) n.push(`${ref}: tabliczka nie stoi między podpisem a symbolem`);
    if (przySymbolu && dx > 12 * GRID) n.push(`${ref}: tabliczka ${dx} j.św. od symbolu w poziomie`);
    if (przySymbolu && korytarz.width > 0) {
      for (const s of scena.symbols) {
        if (s !== symbol && zachodzi(korytarz, obrysNaScenie(s))) n.push(`${ref}: między symbolem a tabliczką stoi ${s.symbolId}`);
      }
      for (const inna of scena.labels) {
        if (inna === l || inna.ownerRef.includes(d.device_ref)) continue;
        if (zachodzi(korytarz, inna.rect)) n.push(`${ref}: między symbolem a tabliczką stoi napis ${inna.ownerRef}`);
      }
    }
    for (const s of scena.symbols) {
      if (zachodzi(l.rect, obrysNaScenie(s))) n.push(`${ref}: kolizja z symbolem ${s.symbolId} (${s.meta?.ownerRef ?? '—'})`);
    }
    for (const inna of scena.labels) {
      if (inna !== l && zachodzi(l.rect, inna.rect)) n.push(`${ref}: kolizja z etykietą ${inna.ownerRef}`);
    }
    // Przewody sceny, w tym linie przekaźnika (pomiarowe, wyłączania) — ta sama sonda co
    // wyrocznia sceny (`labelWireCollisions`).
    for (const k of labelWireCollisions(scena)) {
      if (k.ownerRef === ref) n.push(`${ref}: kolizja z przewodem ${scena.segments[k.segmentIndex].meta?.ownerRef ?? '—'}`);
    }
    // Ramka bloku zabezpieczeń (wiersze kodów, odniesienie 3U₀ — bez okręgu, korekta v2).
    for (const s of scena.symbols) {
      const r = s.meta?.ramkaBlokuPrzekaznika;
      if (r && zachodzi(l.rect, { x: s.x + r.x, y: s.y + r.y, width: r.width, height: r.height })) {
        n.push(`${ref}: kolizja z ramką bloku przekaźnika ${s.meta?.ownerRef ?? '—'}`);
      }
    }
  }
  return n;
}

const SCENY = new Map(FIKSTURY.map(([nazwa, enm]) => [nazwa, buildSceneV3(enm, 2)] as const));

describe('tabliczki przekładników przy symbolach — scena LOD2 (iloczyn fikstura × rodzaj)', () => {
  for (const [nazwa, enm] of FIKSTURY) {
    for (const rodzaj of RODZAJE) {
      it(`${nazwa} × przekładnik ${rodzaj}`, () => {
        const liczba = (enm.bays ?? []).flatMap((b) => (b.primary_devices ?? []).filter(WZORCE[rodzaj].maTabliczke)).length;
        expect(liczba, 'fikstura niesie przekładnik tego rodzaju z tabliczką').toBeGreaterThan(0);
        expect(naruszeniaTabliczek(enm, SCENY.get(nazwa)!, rodzaj, !TYLKO_KOLIZJE.has(nazwa))).toEqual([]);
      });
    }
  }
});

describe('odbiór B-02 (pkt 6): opis przekładnika wg LOD (iloczyn fikstura × LOD × rodzaj)', () => {
  // LOD0 — same symbole; LOD1 — oznaczenia (T1, T2, T3), bez przekładni; LOD2 — oznaczenia
  // i krótkie przekładnie. Pozostałe podpisy aparatów (Q0, Q1…) — wyłącznie LOD2.
  for (const [nazwa, enm] of FIKSTURY) {
    for (const lod of [0, 1, 2] as const) {
      it(`${nazwa} · LOD${lod}`, () => {
        const scena = lod === 2 ? SCENY.get(nazwa)! : buildSceneV3(enm, lod);
        const n: string[] = [];
        for (const rodzaj of RODZAJE) {
          const w = WZORCE[rodzaj];
          for (const bay of enm.bays ?? []) {
            for (const d of (bay.primary_devices ?? []).filter(w.maTabliczke)) {
              const oznaczenie = scena.labels.filter((l) => l.ownerRef === `${bay.ref_id}#etykieta-aparatu-${d.device_ref}`);
              const tabliczka = scena.labels.filter((l) => l.ownerRef === `${bay.ref_id}#${w.przyrostek}-${d.device_ref}`);
              const oczekOznaczenie = lod >= 1 && !!d.designation ? 1 : 0;
              if (oznaczenie.length !== oczekOznaczenie) n.push(`${d.device_ref}: ${oznaczenie.length} oznaczeń (oczekiwano ${oczekOznaczenie})`);
              if (oczekOznaczenie && oznaczenie[0].text !== d.designation) n.push(`${d.device_ref}: oznaczenie „${oznaczenie[0].text}" ≠ „${d.designation}"`);
              if (tabliczka.length !== (lod === 2 ? 1 : 0)) n.push(`${d.device_ref}: ${tabliczka.length} przekładni na LOD${lod}`);
            }
          }
        }
        if (lod < 2) {
          const przekladnikowe = new Set(
            (enm.bays ?? []).flatMap((b) => (b.primary_devices ?? []).filter((d) => RODZAJE.some((r) => WZORCE[r].maTabliczke(d))).map((d) => `${b.ref_id}#etykieta-aparatu-${d.device_ref}`)),
          );
          for (const l of scena.labels) {
            if (l.ownerRef.includes('#etykieta-aparatu-') && !przekladnikowe.has(l.ownerRef) && !l.unresolved) n.push(`LOD${lod}: podpis aparatu ${l.text} poza przekładnikami`);
          }
        }
        expect(n).toEqual([]);
      });
    }
  }
});

describe('tabliczki przekładników — plan etykiet kanwy bez kolizji (iloczyn × skala)', () => {
  for (const [nazwa] of FIKSTURY) {
    const scena = SCENY.get(nazwa)!;
    const przeszkody = sceneObstacleRects(scena);
    const arkusz = sheetSizeFor(scena);
    const symbole = scena.symbols.map(obrysNaScenie);
    for (const skala of SKALE) {
      it(`${nazwa} · skala ${skala}`, () => {
        const plan = planSceneLabels(scena.labels, przeszkody, skala, arkusz);
        const tabliczki = plan.drawn.filter((p) => /#(ct|vt|cbct)-rating-/.test(p.label.ownerRef));
        const n: string[] = [];
        for (const t of tabliczki) {
          symbole.forEach((o, i) => {
            if (zachodzi(t.rect, o)) n.push(`${t.label.ownerRef}: kolizja z symbolem ${scena.symbols[i].symbolId}`);
          });
          for (const inna of plan.drawn) {
            if (inna !== t && zachodzi(t.rect, inna.rect)) n.push(`${t.label.ownerRef}: kolizja z etykietą ${inna.label.ownerRef}`);
          }
        }
        expect(n).toEqual([]);
      });
    }
  }
});

describe('wyrocznia tabliczek — iniekcje', () => {
  const [nazwa, enm] = FIKSTURY[2];
  const scena = SCENY.get(nazwa)!;

  it('tabliczka VT przesunięta na symbol — kolizja wykryta', () => {
    const vt = scena.labels.find((l) => l.ownerRef.includes('#vt-rating-'))!;
    const symbol = scena.symbols.find((s) => rodzajSymbolu(s.symbolId) === 'voltageTransformer' && vt.ownerRef.endsWith(s.meta?.deviceRef ?? '∅'))!;
    const o = obrysNaScenie(symbol);
    const zepsuta = { ...scena, labels: scena.labels.map((l) => (l === vt ? { ...l, rect: { ...l.rect, x: o.x, y: o.y } } : l)) };
    expect(naruszeniaTabliczek(enm, zepsuta, 'napięciowy').join('\n')).toContain('kolizja z symbolem');
  });

  it('tabliczka Ferrantiego odsunięta od symbolu — wykryte', () => {
    const cb = scena.labels.find((l) => l.ownerRef.includes('#cbct-rating-'))!;
    const zepsuta = { ...scena, labels: scena.labels.map((l) => (l === cb ? { ...l, rect: { ...l.rect, y: l.rect.y + 10 * GRID } } : l)) };
    expect(naruszeniaTabliczek(enm, zepsuta, 'Ferrantiego').join('\n')).toMatch(/nad\/pod symbolem/);
  });

  it('tabliczka CT na linii pomiarowej przekaźnika — kolizja z przewodem wykryta', () => {
    const ct = scena.labels.find((l) => l.ownerRef.includes('#ct-rating-'))!;
    const pole = ct.ownerRef.split('#')[0];
    const linia = scena.segments.find((g) => (g.meta?.ownerRef ?? '').startsWith(`${pole}#measurement-link`))!;
    // Pierwszy odcinek poziomy linii (od zacisku wtórnego ku przekaźnikowi).
    const i = linia.points.findIndex((p, k) => k > 0 && p.y === linia.points[k - 1].y && p.x !== linia.points[k - 1].x);
    const a = linia.points[i - 1];
    const zepsuta = {
      ...scena,
      labels: scena.labels.map((l) => (l === ct ? { ...l, rect: { ...l.rect, x: Math.min(a.x, linia.points[i].x) + 1, y: a.y - 4 } } : l)),
    };
    expect(naruszeniaTabliczek(enm, zepsuta, 'prądowy').join('\n')).toContain('kolizja z przewodem');
  });

  it('tabliczka CT w ramce bloku przekaźnika — wykryte', () => {
    const ct = scena.labels.find((l) => l.ownerRef.includes('#ct-rating-'))!;
    const pole = ct.ownerRef.split('#')[0];
    const przekaznik = scena.symbols.find((s) => s.symbolId === 'protectionRelay' && s.meta?.ownerRef === pole)!;
    const r = przekaznik.meta!.ramkaBlokuPrzekaznika!;
    const zepsuta = {
      ...scena,
      labels: scena.labels.map((l) => (l === ct ? { ...l, rect: { ...l.rect, x: przekaznik.x + r.x + 1, y: przekaznik.y + r.y + 1 } } : l)),
    };
    expect(naruszeniaTabliczek(enm, zepsuta, 'prądowy').join('\n')).toContain('ramką bloku przekaźnika');
  });

  // Korekta v2 (2026-11-04): stan sprzed korekty — tabliczki T1 (prądowy) i T2 (Ferrantiego)
  // toru głównego po PRAWEJ symbolu, po stronie przeciwnej do podpisu — czerwień.
  it.each([
    ['prądowy', '#ct-rating-'],
    ['Ferrantiego', '#cbct-rating-'],
  ] as const)('tabliczka %s toru głównego po prawej symbolu (stan sprzed korekty v2) — wykryte', (rodzaj, przyrostek) => {
    const tab = scena.labels.find((l) => l.ownerRef.includes(przyrostek))!;
    const symbol = scena.symbols.find((s) => tab.ownerRef.endsWith(`-${s.meta?.deviceRef ?? '∅'}`) && rodzajSymbolu(s.symbolId) === WZORCE[rodzaj].symbol)!;
    const o = obrysNaScenie(symbol);
    const zepsuta = { ...scena, labels: scena.labels.map((l) => (l === tab ? { ...l, rect: { ...l.rect, x: o.x + o.width + GRID } } : l)) };
    expect(naruszeniaTabliczek(enm, zepsuta, rodzaj).join('\n')).toContain('nie stoi po lewej symbolu');
  });

  it('brak tabliczki VT (stan przed kartą) — wykryty', () => {
    const bez = { ...scena, labels: scena.labels.filter((l) => !l.ownerRef.includes('#vt-rating-')) };
    expect(naruszeniaTabliczek(enm, bez, 'napięciowy').join('\n')).toContain('0 tabliczek');
  });
});
