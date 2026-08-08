/**
 * SLOT-DRYF-PRZĘSŁA — POMIAR ODLEGŁOŚCI PODPISU PRZĘSŁA OD OPISYWANEJ POLILINII.
 *
 * Karta BLOK-LATERAL-WLASNOSC naprawiła WŁASNOŚĆ podpisów przęseł (każdy nosi
 * ref odcinka, który opisuje) i zostawiła zmierzony dług: 2 z 37 podpisów stoi
 * 888 j.św. od polilinii swojego odcinka. Ten skrypt mierzy to zjawisko dla
 * KAŻDEGO podpisu przęsła i KAŻDEGO poziomu szczegółu — nie tylko dla dwóch
 * przypadków ze zgłoszenia.
 *
 * WYROCZNIA (R1 karty, wyprowadzona z GEOMETRII, nie z progu w jednostkach):
 * prostokąt podpisu ma leżeć w zakresie X polilinii, którą opisuje. „Dryf"
 * to odległość prostokąta podpisu od przedziału [minX, maxX] polilinii —
 * ZERO, gdy prostokąt się z nią pokrywa w X. Nie ma tu zaszytego progu: gdy
 * odcinek jest długi, zakres jest szeroki; gdy krótki — wąski.
 *
 * MIERZY:
 *   (A) dla każdego podpisu klasy `segment-span`: dryf w X (poza zakres
 *       polilinii) i w Y (od korytarza trasy), slot, obecność leadera;
 *   (B) rozkład dryfu (mediana/max) i liczbę podpisów POZA zakresem;
 *   (C) inwentarz KLASY: to samo dla `segment-lateral`, `port-caption`
 *       i podpisów kontynuacji arkusza — czy ten sam wzorzec przydziału
 *       slotu dryfuje także tam;
 *   (D) kolizje prostokątów podpisów (C-11: 0 na każdej kombinacji) oraz
 *       licznik „Ukryto N opisów" (declutter) — bo naprawa dryfu wolno
 *       zmienia geometrię, ale NIE wolno jej pogorszyć tych dwóch liczb.
 *
 * ILOCZYN CECH: {wszystkie sieci fixturowe} × {L0, L1, L2}. Pojedynczy
 * przypadek „S14 ↔ S15" nie wystarcza — defekt „slot policzony z innego
 * przęsła niż rysowany odcinek" ujawnia się dopiero w rozkładzie.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/pomiar_slotu.tsx
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { rectsOverlap } from '../src/ui/sld/v3/core/grid';
import { sceneObstacleRects } from '../src/ui/sld/v3/scene/buildScene';
import { planSceneLabels } from '../src/ui/sld/v3/canvas/labelLegibility';
import type { OwnerKind } from '../src/ui/sld/v3/layout/labels';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Sieci fixturowe — cecha „sieć" iloczynu. */
const SIECI: readonly { readonly nazwa: string; readonly sciezka: string }[] = [
  {
    nazwa: 'substrate52s',
    sciezka: '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
  },
];

function wczytaj(sciezka: string): EnergyNetworkModel {
  const surowe = JSON.parse(readFileSync(resolve(HERE, sciezka), 'utf8'));
  return (surowe.enm ?? surowe) as EnergyNetworkModel;
}

interface Zakres {
  readonly min: number;
  readonly max: number;
}

/** Odległość przedziału `a` od przedziału `b` — 0 gdy się przecinają. */
function odlegloscPrzedzialow(a: Zakres, b: Zakres): number {
  if (a.max < b.min) return b.min - a.max;
  if (a.min > b.max) return a.min - b.max;
  return 0;
}

/** Ref odcinka opisywanego przez podpis: `<segmentRef>#segment-label`. */
function refOpisywanego(ownerRef: string): string {
  return ownerRef.replace(/#segment-label$/, '').replace(/#[a-z-]+$/, '');
}

/**
 * Ref BAZOWY polilinii — z odciętym sufiksem `#tee-N`. `resolveTeeJunctions`
 * (`scene/buildScene.ts`) rozcina narysowany kabel w węzłach T i nadaje
 * kawałkom ZA pierwszym sufiks `#tee-N`, deklarując wprost, że to
 * „kontynuacja TEGO SAMEGO kabla ENM za kropką węzłową". Pomiar, który by
 * tego nie sklejał, meldowałby dryf wszędzie tam, gdzie przęsło ma odczep —
 * czyli mierzyłby własną konwencję nazewniczą, nie położenie podpisu.
 */
function refBazowy(ownerRef: string): string {
  return ownerRef.replace(/#tee-\d+$/, '');
}

interface WpisDryfu {
  readonly ownerRef: string;
  readonly tekst: string;
  readonly rodzaj: OwnerKind;
  readonly slot: number;
  readonly maLeader: boolean;
  readonly dryfX: number;
  readonly dryfY: number;
  readonly zakresPolilinii: Zakres | null;
  readonly zakresPodpisu: Zakres;
}

function zmierzDryf(scene: SceneV3, rodzaje: ReadonlySet<OwnerKind>): WpisDryfu[] {
  const poRefie = new Map<string, { x: Zakres; y: Zakres }>();
  for (const g of scene.segments) {
    const ref = g.meta?.ownerRef != null ? refBazowy(g.meta.ownerRef) : null;
    if (!ref) continue;
    const xs = g.points.map((p) => p.x);
    const ys = g.points.map((p) => p.y);
    const biezacy = poRefie.get(ref);
    const x = { min: Math.min(...xs), max: Math.max(...xs) };
    const y = { min: Math.min(...ys), max: Math.max(...ys) };
    poRefie.set(
      ref,
      biezacy
        ? {
            x: { min: Math.min(biezacy.x.min, x.min), max: Math.max(biezacy.x.max, x.max) },
            y: { min: Math.min(biezacy.y.min, y.min), max: Math.max(biezacy.y.max, y.max) },
          }
        : { x, y },
    );
  }

  const wynik: WpisDryfu[] = [];
  for (const l of scene.labels) {
    if (!rodzaje.has(l.ownerKind)) continue;
    const ref = refOpisywanego(l.ownerRef);
    const polilinia = poRefie.get(ref) ?? null;
    const zakresPodpisu = { min: l.rect.x, max: l.rect.x + l.rect.width };
    const zakresY = { min: l.rect.y, max: l.rect.y + l.rect.height };
    wynik.push({
      ownerRef: l.ownerRef,
      tekst: l.text,
      rodzaj: l.ownerKind,
      slot: l.slotIndex,
      maLeader: l.leader != null,
      dryfX: polilinia ? odlegloscPrzedzialow(zakresPodpisu, polilinia.x) : Number.NaN,
      dryfY: polilinia ? odlegloscPrzedzialow(zakresY, polilinia.y) : Number.NaN,
      zakresPolilinii: polilinia ? polilinia.x : null,
      zakresPodpisu,
    });
  }
  return wynik;
}

/**
 * TOR RYSOWANY, na którym stoi podpis = SPÓJNA SKŁADOWA polilinii kabli.
 *
 * Podpis przęsła opisuje kabel między dwiema stacjami wymienionymi w jego
 * treści („S14 ↔ S15"). Na rysunku ten kabel bywa POCIĘTY na kilka polilinii:
 * na człony łańcucha ENM (`chainSegmentRefs`, węzły bez stacji), na kawałki
 * `#tee-N` za kropką węzła T (`resolveTeeJunctions`) i na kolejne biegi
 * ortogonalnego jogu. Wszystkie te kawałki stykają się KOŃCAMI i tworzą JEDNĄ
 * linię — i to ona jest obiektem, przy którym podpis ma stać.
 *
 * Składową liczymy WYŁĄCZNIE z polilinii o refie kabla (`seg/…`). Wnętrze
 * stacji (szyna, zejścia pól `stn/…#descent`) też dotyka głowicy, więc bez
 * tego filtra składowa przeciekłaby przez stację na sąsiednie przęsło i
 * wyrocznia przestałaby cokolwiek sprawdzać (zapadka na to: test negatywny
 * „podpis przesunięty o długość przęsła MUSI oblać").
 */
function torySpojne(scene: SceneV3): { readonly refy: ReadonlySet<string>; readonly x: Zakres }[] {
  const kawalki = scene.segments
    .map((g) => ({ ref: g.meta?.ownerRef ?? null, pts: g.points }))
    .filter((k): k is { ref: string; pts: typeof k.pts } => k.ref != null && k.ref.startsWith('seg/'));
  const klucz = (p: { x: number; y: number }): string => `${p.x},${p.y}`;
  const rodzic = kawalki.map((_, i) => i);
  const znajdz = (i: number): number => (rodzic[i] === i ? i : (rodzic[i] = znajdz(rodzic[i])));
  const zlacz = (a: number, b: number): void => {
    const ra = znajdz(a);
    const rb = znajdz(b);
    if (ra !== rb) rodzic[ra] = rb;
  };
  const wPunkcie = new Map<string, number[]>();
  kawalki.forEach((k, i) => {
    for (const p of [k.pts[0], k.pts[k.pts.length - 1]]) {
      const lista = wPunkcie.get(klucz(p)) ?? [];
      lista.push(i);
      wPunkcie.set(klucz(p), lista);
    }
  });
  for (const lista of wPunkcie.values()) {
    for (let i = 1; i < lista.length; i++) zlacz(lista[0], lista[i]);
  }
  const grupy = new Map<number, { refy: Set<string>; x: Zakres }>();
  kawalki.forEach((k, i) => {
    const r = znajdz(i);
    const xs = k.pts.map((p) => p.x);
    const biezacy = grupy.get(r);
    if (biezacy) {
      biezacy.refy.add(refBazowy(k.ref));
      biezacy.x = { min: Math.min(biezacy.x.min, ...xs), max: Math.max(biezacy.x.max, ...xs) };
    } else {
      grupy.set(r, { refy: new Set([refBazowy(k.ref)]), x: { min: Math.min(...xs), max: Math.max(...xs) } });
    }
  });
  return [...grupy.values()];
}

function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function f(x: number, n = 0): string {
  return Number.isFinite(x) ? x.toFixed(n) : '—';
}

/** Kolizje prostokątów podpisów (C-11) — pary nachodzących się prostokątów. */
function kolizjeEtykiet(scene: SceneV3): number {
  const rects = scene.labels.map((l) => l.rect);
  let n = 0;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) n++;
    }
  }
  return n;
}

const RODZAJE_PRZESLA = new Set<OwnerKind>(['segment-span']);
const RODZAJE_KLASY = new Set<OwnerKind>([
  'segment-span',
  'segment-lateral',
  'port-caption',
  'segment-endpoint',
]);

/** Skala kamery, na której liczymy wskaźnik „Ukryto N opisów" (typowe
 *  „Dopasuj widok" na tej sieci) — ta sama funkcja co ekran, zero drugiej
 *  implementacji. */
const SKALE_KAMERY = [0.2, 0.5, 1] as const;

function ukryteOpisy(scene: SceneV3, skala: number): number {
  const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), skala);
  return plan.hiddenDetail.length;
}

for (const siec of SIECI) {
  const enm = wczytaj(siec.sciezka);
  console.log(`\n=== SIEĆ ${siec.nazwa} ===`);
  for (const lod of [0, 1, 2] as SceneLod[]) {
    const scene = buildSceneV3(enm, lod);
    const przesla = zmierzDryf(scene, RODZAJE_PRZESLA);
    const zPolilinia = przesla.filter((w) => Number.isFinite(w.dryfX));
    const poza = zPolilinia.filter((w) => w.dryfX > 0);
    const ukryte = SKALE_KAMERY.map((s) => `${s}:${ukryteOpisy(scene, s)}`).join(' ');
    console.log(
      `L${lod}: podpisów przęseł ${przesla.length} (z polilinią ${zPolilinia.length}) · `
        + `POZA zakresem ${poza.length} · dryfX med ${f(mediana(zPolilinia.map((w) => w.dryfX)))} · `
        + `max ${f(Math.max(0, ...zPolilinia.map((w) => w.dryfX)))} · `
        + `kolizje etykiet ${kolizjeEtykiet(scene)} · ukryto[skala:N] ${ukryte}`,
    );
    // WYROCZNIA GŁÓWNA (R1): podpis stoi PRZY POLILINII SWOJEGO WŁAŚCICIELA —
    // jego środek na środku tej polilinii, bez dryfu. Miara bezwzględna
    // (j.św.) i względna (% długości opisywanego odcinka), bo to długość
    // opisywanego obiektu wyznacza, co jest „przy nim" (R1: zero progów).
    if (lod === 2) {
      const bl: number[] = [];
      const wzgl: number[] = [];
      const naj: { t: string; e: number }[] = [];
      for (const w of zPolilinia) {
        const z = w.zakresPolilinii!;
        const e = Math.abs((w.zakresPodpisu.min + w.zakresPodpisu.max) / 2 - (z.min + z.max) / 2);
        bl.push(e);
        const dl = z.max - z.min;
        if (dl > 0) wzgl.push(e / dl);
        naj.push({ t: w.tekst, e });
      }
      console.log(
        `      WŁAŚCICIEL: błąd środka med ${f(mediana(bl))} · max ${f(Math.max(0, ...bl))} j.św. · `
          + `względnie med ${(mediana(wzgl) * 100).toFixed(0)}% · max ${(Math.max(0, ...wzgl) * 100).toFixed(0)}% długości odcinka`,
      );
      for (const v of naj.sort((a, b) => b.e - a.e).slice(0, 3)) {
        console.log(`         błąd ${f(v.e)} · „${v.t.slice(0, 40)}"`);
      }
    }
    // WYROCZNIA POMOCNICZA: podpis stoi PRZY TORZE, który opisuje — jego
    // prostokąt mieści się w zakresie X spójnej linii kabla zawierającej
    // polilinię jego właściciela, a jego ŚRODEK leży na środku tej linii.
    if (lod === 2) {
      const tory = torySpojne(scene);
      const wystaje: { t: string; o: number }[] = [];
      const bledy: number[] = [];
      let bezToru = 0;
      for (const w of przesla) {
        const ref = refOpisywanego(w.ownerRef);
        const tor = tory.find((t) => t.refy.has(ref));
        if (!tor) {
          bezToru++;
          continue;
        }
        const o = Math.max(0, tor.x.min - w.zakresPodpisu.min) + Math.max(0, w.zakresPodpisu.max - tor.x.max);
        if (o > 0) wystaje.push({ t: w.tekst, o });
        bledy.push(Math.abs((w.zakresPodpisu.min + w.zakresPodpisu.max) / 2 - (tor.x.min + tor.x.max) / 2));
      }
      console.log(
        `      TOR: podpisów bez toru ${bezToru} · WYSTAJE poza tor ${wystaje.length}/${bledy.length} `
          + `(max ${f(Math.max(0, ...wystaje.map((v) => v.o)))}) · błąd środka med ${f(mediana(bledy))} max ${f(Math.max(0, ...bledy))}`,
      );
      for (const v of wystaje.sort((a, b) => b.o - a.o).slice(0, 5)) {
        console.log(`         wystaje ${f(v.o)} · „${v.t.slice(0, 40)}"`);
      }
    }
    for (const w of [...poza].sort((a, b) => b.dryfX - a.dryfX).slice(0, 8)) {
      console.log(
        `      „${w.tekst.slice(0, 34)}" slot ${w.slot} leader ${w.maLeader ? 'TAK' : 'nie'} · `
          + `podpis [${f(w.zakresPodpisu.min)}..${f(w.zakresPodpisu.max)}] · `
          + `odcinek [${f(w.zakresPolilinii?.min ?? NaN)}..${f(w.zakresPolilinii?.max ?? NaN)}] · `
          + `dryfX ${f(w.dryfX)} dryfY ${f(w.dryfY)}`,
      );
    }
  }

  // (C) INWENTARZ KLASY — czy dryf dotyka też innych rodzajów podpisów.
  const scene2 = buildSceneV3(enm, 2);
  const wszystkie = zmierzDryf(scene2, RODZAJE_KLASY);
  console.log('  INWENTARZ KLASY (L2, podpisy niosące ref obiektu z polilinią):');
  for (const rodzaj of RODZAJE_KLASY) {
    const grupa = wszystkie.filter((w) => w.rodzaj === rodzaj);
    const zP = grupa.filter((w) => Number.isFinite(w.dryfX));
    if (grupa.length === 0) continue;
    const poza = zP.filter((w) => w.dryfX > 0);
    console.log(
      `      ${rodzaj.padEnd(18)} · ${String(grupa.length).padStart(3)} podpisów · `
        + `z polilinią ${String(zP.length).padStart(3)} · poza zakresem ${poza.length} · `
        + `max dryfX ${f(Math.max(0, ...zP.map((w) => w.dryfX)))}`,
    );
  }
}
