/**
 * BLOK-PUSTY — POMIAR WNĘTRZA RAMY STACJI (zgłoszenie właściciela 2026-08-07,
 * pkt 6: „wnętrze ramy stacji w większości puste"; zrzuty
 * `docs/sld/audyt-2026-08/proporcje-po-{ciemny,jasny}.png`).
 *
 * CZYM JEST „RAMA". Dokładnie tym prostokątem, który narysowała obwódka na
 * zrzucie właściciela: kotwicą widoku stacji, liczoną PRODUKCYJNĄ funkcją
 * `canvas/viewAnchor.ts` `prostokatElementuWScenie` dla refu bloku
 * (`stn/<id>/station`, GPZ: `gpz/<id>/substation`) — zero drugiej
 * implementacji. Ref bloku NIE obejmuje pól (`stn/<id>/sn_field/NNN` to inne
 * refy), więc rama powstaje z rzeczy STACYJNYCH: etykiety przęsła (B1), szyny
 * SN, pasma nazw (B5, prostokąt = PEŁNA szerokość kolumny) i strony nN.
 * Aparatura pól po prostu WPADA do środka — i dlatego tusz liczymy z CAŁEJ
 * sceny przyciętej do ramy, a nie tylko z obiektów należących do stacji:
 * oko właściciela nie odróżnia właściciela refu, tylko widzi puste pole.
 *
 * CO MIERZY:
 *   (A) powierzchnię RAMY bloku,
 *   (B) powierzchnię zajętą przez cokolwiek narysowanego (symbole, odcinki z
 *       realną grubością kreski z tabeli rang, prostokąty etykiet zwężone do
 *       realnej szerokości tekstu) — rastrem, więc nakładające się obiekty
 *       nie są liczone dwa razy,
 *   (C) UDZIAŁ PUSTEGO TUSZU = 1 − B/A,
 *   (D) GDZIE jest pusty — rozbicie na PASY wyprowadzone z SAMEGO rysunku
 *       (nie ze stałych układu): nad aparaturą / aparatura / MIĘDZY aparaturą
 *       a tożsamością / tożsamość / pod tożsamością + marginesy boczne,
 *   (E) rozkład: mediana, najgorszy blok, ile bloków przekracza próg,
 *   (F) parę REZERWACJA↔TREŚĆ pasma nazw: szerokość slotu etykiety
 *       (`OwnedLabel.rect.width` = pełna szerokość kolumny) wobec realnej
 *       szerokości tekstu (`measureLabelWidth`, ta sama formuła co render).
 *
 * ILOCZYN CECH: {wszystkie bloki: zwykła / odgałęźna / z TR / GPZ} × {L0, L1,
 * L2}. Sam blok ze zrzutu nie wystarcza — defekt „rezerwuję niezależnie od
 * tego, co narysuję" widać dopiero w rozkładzie po WSZYSTKICH blokach: blok
 * najwyższy w wierszu ma pustkę najmniejszą z definicji, a to właśnie on
 * ustawia rezerwację całej reszcie.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   npx vite-node scripts/pomiar_bloku.tsx
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { prostokatElementuWScenie } from '../src/ui/sld/v3/canvas/viewAnchor';
import { SYMBOL_DEFS } from '../src/ui/sld/v3/symbols/defs';
import { SEGMENT_STROKE_WIDTH, type PreviewSegmentKind } from '../src/ui/sld/v3/compose/preview';
import { measureLabelWidth } from '../src/ui/sld/v3/core/text';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const enm = JSON.parse(readFileSync(fixturePath, 'utf8')).enm as EnergyNetworkModel;

/** Korzeń refu bloku — ta sama gramatyka refów, którą rozcina
 *  `SldCanvasV3Workspace` (prefiks własności = dwa pierwsze człony). */
const REF_BLOKU = /^(stn|gpz)\/([0-9a-f]+)\//;

/** Bok komórki rastra [j.św.]. GRID=8, najcieńsza kreska toru 1,2 — komórka
 *  2 j.św. leży poniżej modułu siatki i powyżej rozdzielczości, przy której
 *  liczenie 54 bloków × 3 poziomy przestaje być wykonalne. */
const KOMORKA = 2;

/** Udział pustego tuszu, powyżej którego rama jest „w większości pusta". */
const PROG_PUSTKI = 0.9;

interface Prostokat {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface PomiarPasa {
  readonly nazwa: string;
  readonly y0: number;
  readonly y1: number;
  readonly powierzchnia: number;
  readonly tusz: number;
}

interface PomiarBloku {
  readonly ref: string;
  readonly nazwa: string;
  readonly rama: Prostokat;
  readonly powierzchnia: number;
  readonly tusz: number;
  readonly pustka: number;
  readonly pasy: readonly PomiarPasa[];
  readonly marginesLewy: number;
  readonly marginesPrawy: number;
}

/** Wszystko, co scena rysuje — jako prostokąty tuszu (bez filtra właściciela). */
function tuszSceny(scene: SceneV3): readonly Prostokat[] {
  const out: Prostokat[] = [];
  for (const symbol of scene.symbols) {
    const def = SYMBOL_DEFS[symbol.symbolId];
    out.push({ x: symbol.x, y: symbol.y, width: def.width, height: def.height });
  }
  for (const segment of scene.segments) {
    const kind = segment.meta?.kind as PreviewSegmentKind | undefined;
    // Grubość REALNA z tabeli rang kompozycji (jedno źródło z rysunkiem);
    // brak rangi = najcieńsza kreska rysunku (adnotacja), nie zero.
    const w = kind && kind in SEGMENT_STROKE_WIDTH ? SEGMENT_STROKE_WIDTH[kind] : 0.8;
    const pts = segment.points;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      out.push({
        x: Math.min(a.x, b.x) - w / 2,
        y: Math.min(a.y, b.y) - w / 2,
        width: Math.abs(b.x - a.x) + w,
        height: Math.abs(b.y - a.y) + w,
      });
    }
  }
  for (const label of scene.labels) {
    // Etykieta zajmuje TYLKO tyle, ile mierzy jej TEKST — `rect.width` pasma
    // nazw to rezerwacja slotu na pełną szerokość kolumny, nie zajęty tusz.
    const szer = Math.min(label.rect.width, measureLabelWidth(label.text, label.labelClass));
    out.push({ x: label.rect.x, y: label.rect.y, width: szer, height: label.rect.height });
  }
  return out;
}

function nalezy(owner: string | undefined | null, ref: string): boolean {
  return !!owner && (owner === ref || owner.startsWith(`${ref}#`));
}

/** Rozpiętość pionowa APARATURY widocznej wewnątrz ramy (symbole aparatów
 *  wszystkich pól tej stacji — inne refy niż rama, patrz nagłówek). */
function rozpietoscAparatury(scene: SceneV3, korzen: string): { y0: number; y1: number } | null {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const symbol of scene.symbols) {
    const owner = String(symbol.meta?.ownerRef ?? '');
    if (!owner.startsWith(`${korzen}/`)) continue;
    const def = SYMBOL_DEFS[symbol.symbolId];
    y0 = Math.min(y0, symbol.y);
    y1 = Math.max(y1, symbol.y + def.height);
  }
  return Number.isFinite(y0) ? { y0, y1 } : null;
}

/** Rozpiętość pionowa pasma tożsamości (etykiety `station-name` tego bloku). */
function rozpietoscTozsamosci(scene: SceneV3, ref: string): { y0: number; y1: number } | null {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const label of scene.labels) {
    if (label.ownerKind !== 'station-name') continue;
    if (!nalezy(label.ownerRef, ref)) continue;
    y0 = Math.min(y0, label.rect.y);
    y1 = Math.max(y1, label.rect.y + label.rect.height);
  }
  return Number.isFinite(y0) ? { y0, y1 } : null;
}

function zmierzBlok(
  scene: SceneV3,
  korzen: string,
  ref: string,
  nazwa: string,
  tusz: readonly Prostokat[],
): PomiarBloku | null {
  const box = prostokatElementuWScenie(scene, ref);
  if (!box) return null;
  const rama: Prostokat = {
    x: box.minX,
    y: box.minY,
    width: box.maxX - box.minX,
    height: box.maxY - box.minY,
  };
  if (rama.width <= 0 || rama.height <= 0) return null;

  const kolumny = Math.max(1, Math.ceil(rama.width / KOMORKA));
  const wiersze = Math.max(1, Math.ceil(rama.height / KOMORKA));
  const zajete = new Uint8Array(kolumny * wiersze);
  for (const r of tusz) {
    if (r.x + r.width < rama.x || r.x > rama.x + rama.width) continue;
    if (r.y + r.height < rama.y || r.y > rama.y + rama.height) continue;
    const i0 = Math.max(0, Math.floor((r.x - rama.x) / KOMORKA));
    const i1 = Math.min(kolumny - 1, Math.ceil((r.x + r.width - rama.x) / KOMORKA) - 1);
    const j0 = Math.max(0, Math.floor((r.y - rama.y) / KOMORKA));
    const j1 = Math.min(wiersze - 1, Math.ceil((r.y + r.height - rama.y) / KOMORKA) - 1);
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) zajete[j * kolumny + i] = 1;
    }
  }

  const polKomorki = KOMORKA * KOMORKA;
  const powierzchnia = kolumny * wiersze * polKomorki;
  let zajetych = 0;
  for (let k = 0; k < zajete.length; k += 1) zajetych += zajete[k];

  // Granice pasów — z SAMEGO rysunku, nie ze stałych układu.
  const apar = rozpietoscAparatury(scene, korzen);
  const toz = rozpietoscTozsamosci(scene, ref);
  const yMax = rama.y + wiersze * KOMORKA;
  const granice: { nazwa: string; y0: number; y1: number }[] = [];
  if (apar && toz && apar.y1 <= toz.y0) {
    granice.push({ nazwa: 'nad aparaturą', y0: rama.y, y1: apar.y0 });
    granice.push({ nazwa: 'aparatura', y0: apar.y0, y1: apar.y1 });
    granice.push({ nazwa: 'aparatura↔tożsamość', y0: apar.y1, y1: toz.y0 });
    granice.push({ nazwa: 'tożsamość', y0: toz.y0, y1: toz.y1 });
    granice.push({ nazwa: 'pod tożsamością', y0: toz.y1, y1: yMax });
  } else {
    granice.push({ nazwa: 'cała rama', y0: rama.y, y1: yMax });
  }

  const pasy: PomiarPasa[] = [];
  for (const g of granice) {
    const j0 = Math.max(0, Math.floor((g.y0 - rama.y) / KOMORKA));
    const j1 = Math.min(wiersze - 1, Math.ceil((g.y1 - rama.y) / KOMORKA) - 1);
    if (j1 < j0) {
      pasy.push({ nazwa: g.nazwa, y0: g.y0, y1: g.y1, powierzchnia: 0, tusz: 0 });
      continue;
    }
    let t = 0;
    for (let j = j0; j <= j1; j += 1) {
      for (let i = 0; i < kolumny; i += 1) t += zajete[j * kolumny + i];
    }
    pasy.push({
      nazwa: g.nazwa,
      y0: g.y0,
      y1: g.y1,
      powierzchnia: (j1 - j0 + 1) * kolumny * polKomorki,
      tusz: t * polKomorki,
    });
  }

  const kolumnaPusta = (i: number): boolean => {
    for (let j = 0; j < wiersze; j += 1) if (zajete[j * kolumny + i]) return false;
    return true;
  };
  let mL = 0;
  while (mL < kolumny && kolumnaPusta(mL)) mL += 1;
  let mP = 0;
  while (mP < kolumny - mL && kolumnaPusta(kolumny - 1 - mP)) mP += 1;

  return {
    ref,
    nazwa,
    rama,
    powierzchnia,
    tusz: zajetych * polKomorki,
    pustka: 1 - (zajetych * polKomorki) / powierzchnia,
    pasy,
    marginesLewy: mL * KOMORKA,
    marginesPrawy: mP * KOMORKA,
  };
}

/** Bloki sceny: korzeń → ref bloku (`/station` dla stacji, `/substation` dla GPZ). */
function blokiSceny(scene: SceneV3): readonly { korzen: string; ref: string }[] {
  const zbior = new Map<string, string>();
  const zobacz = (owner: string): void => {
    const m = REF_BLOKU.exec(owner);
    if (!m) return;
    const korzen = `${m[1]}/${m[2]}`;
    const sufiks = m[1] === 'gpz' ? 'substation' : 'station';
    zbior.set(korzen, `${korzen}/${sufiks}`);
  };
  for (const s of scene.symbols) zobacz(String(s.meta?.ownerRef ?? ''));
  for (const l of scene.labels) zobacz(l.ownerRef);
  for (const g of scene.segments) zobacz(String(g.meta?.ownerRef ?? ''));
  return [...zbior].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([korzen, ref]) => ({ korzen, ref }));
}

function nazwyBlokow(scene: SceneV3): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const l of scene.labels) {
    if (l.ownerKind !== 'station-name') continue;
    const m = REF_BLOKU.exec(l.ownerRef);
    if (!m) continue;
    const korzen = `${m[1]}/${m[2]}`;
    if (!out.has(korzen)) out.set(korzen, l.text);
  }
  return out;
}

function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const f = (v: number, n = 1): string => (Number.isFinite(v) ? v.toFixed(n) : '—');
const proc = (v: number): string => `${f(v * 100, 1)}%`;

console.log('=== BLOK-PUSTY — POMIAR WNĘTRZA RAMY STACJI ===');
console.log(`fixtura: sldSubstrate52s · raster ${KOMORKA} j.św. · próg „w większości pusta" = ${proc(PROG_PUSTKI)}`);
console.log('');

let ostatnie: readonly PomiarBloku[] = [];
for (const lod of [0, 1, 2] as const) {
  const scene = buildSceneV3(enm, lod);
  const tusz = tuszSceny(scene);
  const nazwy = nazwyBlokow(scene);
  const pomiary = blokiSceny(scene)
    .map(({ korzen, ref }) => zmierzBlok(scene, korzen, ref, nazwy.get(korzen) ?? korzen, tusz))
    .filter((p): p is PomiarBloku => p != null);
  if (lod === 2) ostatnie = pomiary;
  if (pomiary.length === 0) {
    console.log(`L${lod}: brak bloków`);
    continue;
  }
  const pustki = pomiary.map((p) => p.pustka);
  const najgorszy = pomiary.reduce((a, b) => (b.pustka > a.pustka ? b : a));
  const ponadProg = pustki.filter((p) => p > PROG_PUSTKI).length;

  console.log(
    `L${lod}: bloków ${pomiary.length} · pustka mediana ${proc(mediana(pustki))} · `
      + `min ${proc(Math.min(...pustki))} · max ${proc(Math.max(...pustki))} · `
      + `powyżej progu ${ponadProg}/${pomiary.length}`,
  );
  console.log(
    `      najgorszy: ${najgorszy.nazwa} · rama ${f(najgorszy.rama.width, 0)}×${f(najgorszy.rama.height, 0)} j.św. · pustka ${proc(najgorszy.pustka)}`,
  );
  console.log('      pas                  | wys. med. | pustka pasa | udział w pustce ramy');
  for (const nazwaPasa of ['nad aparaturą', 'aparatura', 'aparatura↔tożsamość', 'tożsamość', 'pod tożsamością', 'cała rama']) {
    const wys: number[] = [];
    const pustkaPasa: number[] = [];
    const udzial: number[] = [];
    for (const p of pomiary) {
      const pas = p.pasy.find((q) => q.nazwa === nazwaPasa);
      if (!pas || pas.powierzchnia === 0) continue;
      wys.push(pas.y1 - pas.y0);
      pustkaPasa.push(1 - pas.tusz / pas.powierzchnia);
      const pustkaRamy = p.powierzchnia - p.tusz;
      udzial.push(pustkaRamy > 0 ? (pas.powierzchnia - pas.tusz) / pustkaRamy : 0);
    }
    if (wys.length === 0) continue;
    console.log(
      `      ${nazwaPasa.padEnd(20)} | ${f(mediana(wys), 0).padStart(9)} | ${proc(mediana(pustkaPasa)).padStart(11)} | ${proc(mediana(udzial)).padStart(20)}`,
    );
  }
  console.log(
    `      marginesy boczne: lewy med. ${f(mediana(pomiary.map((p) => p.marginesLewy)), 0)} · `
      + `prawy med. ${f(mediana(pomiary.map((p) => p.marginesPrawy)), 0)} j.św. · `
      + `szer. ramy med. ${f(mediana(pomiary.map((p) => p.rama.width)), 0)} j.św.`,
  );

  const nadmiary: number[] = [];
  for (const l of scene.labels) {
    if (l.ownerKind !== 'station-name') continue;
    nadmiary.push(l.rect.width - measureLabelWidth(l.text, l.labelClass));
  }
  if (nadmiary.length > 0) {
    console.log(
      `      pasmo nazw: wierszy ${nadmiary.length} · nadmiar slotu wobec tekstu — mediana ${f(mediana(nadmiary), 0)} · max ${f(Math.max(...nadmiary), 0)} j.św.`,
    );
  }
  console.log('');
}

console.log('L2 — DZIESIĘĆ NAJPUSTSZYCH BLOKÓW');
console.log('nazwa                | rama [j.św.] | pustka | aparatura↔tożsamość | pod tożsamością | marg. L/P');
for (const p of [...ostatnie].sort((a, b) => b.pustka - a.pustka).slice(0, 10)) {
  const pasA = p.pasy.find((q) => q.nazwa === 'aparatura↔tożsamość');
  const pasP = p.pasy.find((q) => q.nazwa === 'pod tożsamością');
  console.log(
    `${p.nazwa.padEnd(20)} | ${`${f(p.rama.width, 0)}×${f(p.rama.height, 0)}`.padStart(12)} | ${proc(p.pustka).padStart(6)} | `
      + `${(pasA ? `${f(pasA.y1 - pasA.y0, 0)} j.św. ${proc(pasA.powierzchnia ? 1 - pasA.tusz / pasA.powierzchnia : 0)}` : '—').padStart(19)} | `
      + `${(pasP ? `${f(pasP.y1 - pasP.y0, 0)} j.św.` : '—').padStart(15)} | ${p.marginesLewy}/${p.marginesPrawy}`,
  );
}
