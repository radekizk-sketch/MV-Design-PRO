/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — wyrocznie przeglądu sieci na SLD.
 *
 * Właściciel ocenił ekran przeglądu na 0/10: blok GPZ zwinięty w narożniku ramy
 * pełnego rozmiaru, nazwa „G…1", wachlarz przewodów do wyłączników na różnych
 * wysokościach, magistrala biegnąca krawędzią ramy i kończąca się kreską. Przyczyną
 * były DWIE reprezentacje GPZ i stacji (kompozycja pełna i blok zwinięty L0) oraz
 * poziom szczegółu wybierany progiem zoomu, a nie rozmiarem symbolu na ekranie.
 * Po karcie istnieje JEDNA kompozycja na każdym LOD — poziom zdejmuje wyłącznie
 * szczegół (kody zabezpieczeń, tabliczki, podpisy aparatów i ról pól).
 *
 * Każda wyrocznia niżej przypina jedną z obietnic tej zmiany (test iloczynu cech:
 * `__tests__/przegladKompozycja.test.ts`, z iniekcjami):
 *  (a) `pozycjeKompozycjiGaps` — pozycje pól i aparatów ciągłości identyczne na L0/L1/L2;
 *  (b) `rowneZejsciaGaps` — zejścia jednej sekcji szyn mają równą wysokość;
 *  (c) `ramaStrefyGpzGaps` + `magistralaPrzyRamieGaps` — rama strefy GPZ obejmuje
 *      treść i nie jest od niej większa o więcej niż margines; poziomy bieg
 *      magistrali nie leży wzdłuż ramy;
 *  (d) `zakonczeniaTorowGaps` — żaden tor nie kończy się bez portu, słupka końca
 *      albo znacznika braku modelu (podpis od L1);
 *  (e) `nazwyBezWielokropkaGaps` — żadna etykieta sceny nie niesie wielokropka,
 *      a nazwa tożsamości mieści się w piśmie naturalnym w swojej rezerwacji
 *      (warunek, na którym plan etykiet kanwy opiera rezygnację ze skracania);
 *  (f) kadr po dopasowaniu — w teście (wyrocznia kamery należy do warstwy kanwy).
 */
import { GRID } from '../core/grid';
import { LABEL_TYPOGRAPHY, measureTextWidth } from '../core/text';
import { CONTINUITY_APPARATUS_SYMBOL_IDS, SYMBOL_DEFS, smallestSymbolExtent, type SymbolId } from '../symbols/defs';
import {
  OPEN_TERMINAL_LABEL_TEXT,
  openTerminalGaps,
  sceneSegmentEndpointGaps,
  type SceneLod,
  type SceneV3,
} from './buildScene';

const CONTINUITY = new Set<SymbolId>(CONTINUITY_APPARATUS_SYMBOL_IDS);

/** Symbole, których położenie definiuje KOMPOZYCJĘ pola (aparaty ciągłości,
 *  sylwetka pola bez wyposażenia, transformator, źródło sieci, instalacje DER). */
function jestSymbolemKompozycji(id: SymbolId): boolean {
  return (
    CONTINUITY.has(id)
    || id === 'bayNoEquipment'
    || id === 'transformer2W'
    || id === 'gridSource'
    || id.startsWith('der')
  );
}

/** Najmniejszy gabaryt (min z szerokości i wysokości) aparatu ciągłości toru
 *  narysowanego w scenie — wejście progów LOD kanwy (`lodThresholdsForMinApparatus`).
 *  `null` ⇒ scena bez aparatu ciągłości (progi domyślne). */
export function najmniejszyAparatCiaglosci(scene: SceneV3): number | null {
  const ids = new Set<SymbolId>();
  for (const s of scene.symbols) if (CONTINUITY.has(s.symbolId)) ids.add(s.symbolId);
  const min = smallestSymbolExtent(ids);
  return Number.isFinite(min) ? min : null;
}

export interface PrzegladGap {
  readonly wyrocznia: 'a' | 'b' | 'c' | 'd' | 'e';
  readonly opis: string;
}

function kluczeKompozycji(scene: SceneV3): Map<string, string> {
  const licznik = new Map<string, number>();
  const wynik = new Map<string, string>();
  for (const s of scene.symbols) {
    if (!jestSymbolemKompozycji(s.symbolId)) continue;
    const baza = `${s.symbolId}|${s.meta?.ownerRef ?? ''}`;
    const n = licznik.get(baza) ?? 0;
    licznik.set(baza, n + 1);
    wynik.set(`${baza}|${n}`, `${s.x},${s.y}`);
  }
  return wynik;
}

/** (a) Te same symbole kompozycji w tych samych miejscach na KAŻDYM poziomie. */
export function pozycjeKompozycjiGaps(scenes: Readonly<Record<SceneLod, SceneV3>>): readonly PrzegladGap[] {
  const gaps: PrzegladGap[] = [];
  const wzorzec = kluczeKompozycji(scenes[2]);
  for (const lod of [0, 1] as const) {
    const biezace = kluczeKompozycji(scenes[lod]);
    for (const [klucz, poz] of wzorzec) {
      const tu = biezace.get(klucz);
      if (tu === undefined) gaps.push({ wyrocznia: 'a', opis: `L${lod}: brak ${klucz} (L2 @${poz})` });
      else if (tu !== poz) gaps.push({ wyrocznia: 'a', opis: `L${lod}: ${klucz} @${tu} ≠ L2 @${poz}` });
    }
    for (const klucz of biezace.keys()) {
      if (!wzorzec.has(klucz)) gaps.push({ wyrocznia: 'a', opis: `L${lod}: ${klucz} nieobecny na L2` });
    }
  }
  return gaps;
}

/** Sekcja zejścia: GPZ `gpz/<id>/bay/<sekcja>/<pole>#descent` → `gpz/<id>/bay/<sekcja>`;
 *  stacja `stn/<id>/sn_field/<pole>#descent` → `stn/<id>` + poziom szyny (start zejścia). */
function sekcjaZejscia(ownerRef: string, startY: number): string | null {
  if (!ownerRef.endsWith('#descent')) return null;
  const czesci = ownerRef.replace(/#.*$/, '').split('/');
  if (czesci[0] === 'gpz' && czesci[2] === 'bay' && czesci.length >= 5) return czesci.slice(0, 4).join('/');
  if (czesci[0] === 'stn' && czesci.length >= 2) return `${czesci[0]}/${czesci[1]}@${startY}`;
  return null;
}

/** (b) Zejścia pól jednej sekcji szyn mają równą wysokość (zero „schodków"). */
export function rowneZejsciaGaps(scene: SceneV3): readonly PrzegladGap[] {
  const grupy = new Map<string, { ref: string; dlugosc: number }[]>();
  for (const seg of scene.segments) {
    const ref = seg.meta?.ownerRef ?? '';
    const [p0, p1] = [seg.points[0], seg.points[seg.points.length - 1]];
    if (!p0 || !p1) continue;
    const startY = Math.min(p0.y, p1.y);
    const sekcja = sekcjaZejscia(ref, startY);
    if (sekcja === null) continue;
    const lista = grupy.get(sekcja) ?? [];
    lista.push({ ref, dlugosc: Math.abs(p1.y - p0.y) });
    grupy.set(sekcja, lista);
  }
  const gaps: PrzegladGap[] = [];
  for (const [sekcja, lista] of [...grupy.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const dlugosci = new Set(lista.map((z) => z.dlugosc));
    if (dlugosci.size > 1) {
      gaps.push({
        wyrocznia: 'b',
        opis: `${sekcja}: zejścia o różnej wysokości ${lista.map((z) => `${z.ref}=${z.dlugosc}`).join(', ')}`,
      });
    }
  }
  return gaps;
}

/** Margines ramy strefy GPZ ponad treść (rezerwa na odstęp ramy od napisów). */
export const RAMA_STREFY_MARGINES = 8 * GRID;

interface Prostokat {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Obwiednia treści GPZ: symbole, odcinki i etykiety o refie `gpz/…`. */
export function trescGpz(scene: SceneV3): Prostokat | null {
  const b: Prostokat = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const dodaj = (x: number, y: number): void => {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  };
  for (const s of scene.symbols) {
    if (!(s.meta?.ownerRef ?? '').startsWith('gpz/')) continue;
    const d = SYMBOL_DEFS[s.symbolId];
    dodaj(s.x, s.y);
    dodaj(s.x + d.width, s.y + d.height);
  }
  for (const seg of scene.segments) {
    if (!(seg.meta?.ownerRef ?? '').startsWith('gpz/')) continue;
    for (const p of seg.points) dodaj(p.x, p.y);
  }
  for (const l of scene.labels) {
    if (!l.ownerRef.startsWith('gpz/')) continue;
    dodaj(l.rect.x, l.rect.y);
    dodaj(l.rect.x + l.rect.width, l.rect.y + l.rect.height);
  }
  return Number.isFinite(b.minX) ? b : null;
}

/** (c) Rama strefy GPZ ⊇ treść GPZ oraz rama ⊆ treść + `RAMA_STREFY_MARGINES`. */
export function ramaStrefyGpzGaps(scene: SceneV3): readonly PrzegladGap[] {
  const rama = scene.meta.gpzZone;
  const tresc = trescGpz(scene);
  if (!rama || !tresc) return [];
  const gaps: PrzegladGap[] = [];
  const r = { minX: rama.x, minY: rama.y, maxX: rama.x + rama.width, maxY: rama.y + rama.height };
  if (tresc.minX < r.minX || tresc.minY < r.minY || tresc.maxX > r.maxX || tresc.maxY > r.maxY) {
    gaps.push({ wyrocznia: 'c', opis: `treść GPZ ${JSON.stringify(tresc)} wychodzi poza ramę ${JSON.stringify(r)}` });
  }
  const m = RAMA_STREFY_MARGINES;
  if (r.minX < tresc.minX - m || r.minY < tresc.minY - m || r.maxX > tresc.maxX + m || r.maxY > tresc.maxY + m) {
    gaps.push({
      wyrocznia: 'c',
      opis: `rama ${JSON.stringify(r)} większa od treści ${JSON.stringify(tresc)} o więcej niż ${m} j.św.`,
    });
  }
  return gaps;
}

/** Strefa „wzdłuż ramy": poziomy bieg magistrali bliżej dolnej krawędzi ramy niż
 *  `4·GRID` i nachodzący na nią w osi X czyta się jako krawędź ramy. */
export const MAGISTRALA_ODSTEP_OD_RAMY = 4 * GRID;

/** (c') Żaden poziomy odcinek magistrali (`snTrunk`) nie biegnie wzdłuż ramy GPZ. */
export function magistralaPrzyRamieGaps(scene: SceneV3): readonly PrzegladGap[] {
  const rama = scene.meta.gpzZone;
  if (!rama) return [];
  const dol = rama.y + rama.height;
  const gaps: PrzegladGap[] = [];
  for (const seg of scene.segments) {
    if (seg.meta?.kind !== 'snTrunk') continue;
    for (let i = 1; i < seg.points.length; i += 1) {
      const a = seg.points[i - 1];
      const b = seg.points[i];
      if (a.y !== b.y) continue;
      const nachodzi = Math.max(a.x, b.x) > rama.x && Math.min(a.x, b.x) < rama.x + rama.width;
      const odleglosc = Math.abs(a.y - dol);
      if (nachodzi && odleglosc < MAGISTRALA_ODSTEP_OD_RAMY) {
        gaps.push({
          wyrocznia: 'c',
          opis: `${seg.meta?.ownerRef}: poziom y=${a.y} ${odleglosc} j.św. od dolnej krawędzi ramy (y=${dol})`,
        });
      }
    }
  }
  return gaps;
}

/** (d) Każdy koniec toru: port, inny odcinek albo słupek końca; od L1 słupek
 *  niesie podpis braku stacji odbiorczej (trafienie → menu odcinka z akcją
 *  „Zakończ odcinek stacją SN/nN"). */
export function zakonczeniaTorowGaps(scene: SceneV3): readonly PrzegladGap[] {
  const gaps: PrzegladGap[] = [];
  for (const g of sceneSegmentEndpointGaps(scene)) {
    const seg = scene.segments[g.segmentIndex];
    gaps.push({ wyrocznia: 'd', opis: `${seg?.meta?.ownerRef}: koniec ${g.which} (${g.x},${g.y}) bez portu` });
  }
  for (const g of openTerminalGaps(scene)) {
    gaps.push({ wyrocznia: 'd', opis: `${g.reason} @(${g.x},${g.y})` });
  }
  if (scene.meta.lod >= 1) {
    const podpisy = new Set(
      scene.labels.filter((l) => l.text === OPEN_TERMINAL_LABEL_TEXT).map((l) => l.ownerRef.replace(/#open-terminal-label$/, '')),
    );
    for (const seg of scene.segments) {
      if (seg.meta?.kind !== 'openTerminal') continue;
      const baza = (seg.meta.ownerRef ?? '').replace(/#open-terminal$/, '');
      if (!podpisy.has(baza)) {
        gaps.push({ wyrocznia: 'd', opis: `${baza}: słupek końca bez podpisu braku stacji odbiorczej na L${scene.meta.lod}` });
      }
    }
  }
  return gaps;
}

/** (e) Zero wielokropków w etykietach sceny; nazwa tożsamości (`#name-row-0`)
 *  mieści się w piśmie naturalnym w swojej rezerwacji. */
export function nazwyBezWielokropkaGaps(scene: SceneV3): readonly PrzegladGap[] {
  const gaps: PrzegladGap[] = [];
  for (const l of scene.labels) {
    if (l.text.includes('…') || l.text.includes('...')) {
      gaps.push({ wyrocznia: 'e', opis: `${l.ownerRef}: wielokropek w „${l.text}"` });
    }
    if (l.ownerKind === 'station-name' && l.ownerRef.endsWith('#name-row-0')) {
      const typ = LABEL_TYPOGRAPHY[l.labelClass];
      const szerokosc = measureTextWidth(l.text, typ.fontSize, typ.fontWeight);
      const granica = l.rezerwacjaSzerokosci ?? (l.rotated ? l.rect.height : l.rect.width);
      if (szerokosc > granica + 0.5) {
        gaps.push({ wyrocznia: 'e', opis: `${l.ownerRef}: nazwa „${l.text}" ${szerokosc.toFixed(1)} > rezerwacja ${granica}` });
      }
    }
  }
  return gaps;
}

/** Komplet wyroczni jednej sceny (b–e). */
export function przegladSceneGaps(scene: SceneV3): readonly PrzegladGap[] {
  return [
    ...rowneZejsciaGaps(scene),
    ...ramaStrefyGpzGaps(scene),
    ...magistralaPrzyRamieGaps(scene),
    ...zakonczeniaTorowGaps(scene),
    ...nazwyBezWielokropkaGaps(scene),
  ];
}
