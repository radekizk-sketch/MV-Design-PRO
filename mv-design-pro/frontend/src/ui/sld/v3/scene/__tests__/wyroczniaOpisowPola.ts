/**
 * Wyrocznia (d) opisów pola — JEDNO źródło dla kontraktów sceny (karta POLE-LINIOWE ODBIÓR B-02,
 * UX04 §11.20; karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ): opis pola (zaciski P1/P2, tabliczki
 * przekładników, wiersze kodów zabezpieczenia) ∩ symbol, ∩ inny napis, ∩ przewód — zero. Blok
 * zabezpieczeń jest symbolem-ramką z meta sceny: wiersz WŁASNEGO bloku leży w całości wewnątrz
 * ramki, każdy inny opis jest z ramką rozłączny.
 *
 * Wyrocznia kolumn opisów pola (a)–(d) (`naruszeniaKolumnOpisow`): oznaczenia wszystkich aparatów
 * pola w jednej kolumnie przy lewej krawędzi pola, opisy przekładników w kolumnie za nią, w wierszu
 * swojego aparatu; na prawo od toru głównego żadnego opisu; zero kolizji.
 *
 * Konsumenci: `wezelOdczepuPozaKaflem.contract.test.ts` (każda fikstura × LOD),
 * `blokZabezpieczenNotacja.contract.test.tsx` (rodzaj pola × liczba kodów × LOD × motyw).
 */
import type { V3Rect } from '../../core/grid';
import { WIERSZ_BLOKU_PRZEKAZNIKA } from '../../core/kolumnyBloku';
import { gabarytSymbolu, ramkaBlokuSymbolu, zasiegRamkiBloku } from '../../symbols/blokZabezpieczen';
import { obrysSymbolu, SYMBOL_DEFS } from '../../symbols/defs';
import { labelWireCollisions, type SceneV3 } from '../buildScene';

type SymbolSceny = SceneV3['symbols'][number];

/** Opisy pola objęte kontraktem: zaciski P1/P2, tabliczki przekładników, wiersze kodów zabezpieczenia. */
export const OPIS_POLA = /#(zacisk-przekladnika-|ct-rating-|vt-rating-|cbct-rating-|protection-codes-full)/;

export const zachodzi = (a: V3Rect, b: V3Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Prostokąt `w` leży w całości wewnątrz `r` (krawędź wspólna dozwolona). */
export function zawiera(r: V3Rect, w: V3Rect): boolean {
  return w.x >= r.x && w.y >= r.y && w.x + w.width <= r.x + r.width && w.y + w.height <= r.y + r.height;
}

export function obrysNaScenie(s: SymbolSceny): V3Rect {
  const o = obrysSymbolu(s.symbolId);
  return { x: s.x + o.x, y: s.y + o.y, width: o.width, height: o.height };
}

/** Naruszenia (d) sceny — każde z prefiksem „(d)”. */
export function naruszeniaOpisowPola(scena: SceneV3): string[] {
  const n: string[] = [];
  const opisy = scena.labels.filter((l) => OPIS_POLA.test(l.ownerRef));
  for (const l of opisy) {
    for (const s of scena.symbols) {
      const r = s.meta?.ramkaBlokuPrzekaznika;
      if (s.symbolId === 'protectionRelay' && r) {
        const ramka = { x: s.x + r.x, y: s.y + r.y, width: r.width, height: r.height };
        const wlasny = (s.meta?.wierszeBlokuPrzekaznika ?? []).includes(l.ownerRef);
        if (wlasny ? !zawiera(ramka, l.rect) : zachodzi(l.rect, ramka)) {
          n.push(`(d) ${l.ownerRef} ${wlasny ? 'poza ramką' : '∩ ramka'} bloku ${s.meta?.ownerRef ?? '—'}`);
        }
        continue;
      }
      if (zachodzi(l.rect, obrysNaScenie(s))) n.push(`(d) ${l.ownerRef} ∩ symbol ${s.symbolId} ${s.meta?.ownerRef ?? '—'}`);
    }
    for (const inna of scena.labels) {
      if (inna !== l && zachodzi(l.rect, inna.rect)) n.push(`(d) ${l.ownerRef} ∩ napis ${inna.ownerRef}`);
    }
  }
  for (const k of labelWireCollisions(scena)) {
    if (OPIS_POLA.test(k.ownerRef)) n.push(`(d) ${k.ownerRef} ∩ przewód ${scena.segments[k.segmentIndex].meta?.ownerRef ?? '—'}`);
  }
  return n;
}

/** Półgrubość przewodu w wyroczni kodów ramki [j.św.] — ta sama co `labelWireCollisions`. */
const POLGRUBOSC_PRZEWODU = 1;

/** Odcinek `a`–`b` (poszerzony o półgrubość przewodu) ma część wspólną z WNĘTRZEM prostokąta `r`. */
function odcinekPrzecina(a: { x: number; y: number }, b: { x: number; y: number }, r: V3Rect): boolean {
  const m = POLGRUBOSC_PRZEWODU;
  return zachodzi(r, {
    x: Math.min(a.x, b.x) - m,
    y: Math.min(a.y, b.y) - m,
    width: Math.abs(b.x - a.x) + 2 * m,
    height: Math.abs(b.y - a.y) + 2 * m,
  });
}

/**
 * Wyrocznia (f) — kod ramki bloku zabezpieczeń NIGDY nie jest zasłonięty (werdykt B-02 właściciela
 * 2026-11-05: kod „81O” zasłonięty na zrzucie Z.11.1). Każdy wiersz bloku (`WIERSZ_BLOKU_PRZEKAZNIKA`:
 * kody funkcji i odniesienie źródła 3U₀) ma PEŁNY obrys tekstu (prostokąt napisu sceny — szerokość
 * z tabeli posuwów kroju, `measureLabelWidth`) rozłączny z:
 *  - krawędziami własnej ramki (leży we wnętrzu ramki pomniejszonej o pas krawędzi),
 *  - gabarytem KAŻDEGO innego symbolu sceny (ramka innego bloku — cała; aparat — prostokąt
 *    definicji ∪ obrys tuszu),
 *  - KAŻDYM odcinkiem sceny (tor, odczep, linia wyłączania, linia pomiarowa, odnośnik),
 *  - KAŻDYM innym napisem sceny (także innym wierszem tego samego bloku).
 * Zbiór szerszy niż (d): (d) nie obejmuje wiersza odniesienia 3U₀ i porównuje z obrysem tuszu,
 * nie z gabarytem symbolu. Każde naruszenie z prefiksem „(f)”.
 */
export function naruszeniaKodowRamki(scena: SceneV3): string[] {
  const n: string[] = [];
  for (const blok of scena.symbols) {
    const ramka = ramkaBlokuSymbolu(blok);
    if (!ramka) continue;
    const wlasciciel = blok.meta?.ownerRef ?? '';
    const z = zasiegRamkiBloku(ramka);
    const wnetrze: V3Rect = { x: z.x + 1, y: z.y + 1, width: z.width - 2, height: z.height - 2 };
    const wiersze = scena.labels.filter((l) => l.ownerRef.startsWith(`${wlasciciel}#`) && WIERSZ_BLOKU_PRZEKAZNIKA.test(l.ownerRef));
    for (const w of wiersze) {
      const opis = `(f) kod „${w.text}” bloku ${wlasciciel}`;
      if (!zawiera(wnetrze, w.rect)) n.push(`${opis}: obrys poza wnętrzem ramki`);
      for (const s of scena.symbols) {
        if (s === blok) continue;
        if (zachodzi(w.rect, gabarytSymbolu(s)) || zachodzi(w.rect, obrysNaScenie(s))) {
          n.push(`${opis} ∩ symbol ${s.symbolId} ${s.meta?.ownerRef ?? '—'}`);
        }
      }
      scena.segments.forEach((g) => {
        for (let i = 1; i < g.points.length; i++) {
          if (odcinekPrzecina(g.points[i - 1], g.points[i], w.rect)) {
            n.push(`${opis} ∩ odcinek ${g.meta?.ownerRef ?? '—'}`);
            return;
          }
        }
      });
      for (const inny of scena.labels) {
        if (inny !== w && zachodzi(w.rect, inny.rect)) n.push(`${opis} ∩ napis „${inny.text}” ${inny.ownerRef}`);
      }
    }
  }
  return n;
}

/** Oznaczenie aparatu pola w kolumnie oznaczeń: pole GPZ — `#etykieta-aparatu-…`, pole stacji —
 *  `#apparatus-id-…`. */
export const OZNACZENIE_APARATU = /#(etykieta-aparatu-|apparatus-id-)/;
/** Opis przekładnika w kolumnie przekładni: tabliczka (prądowy, napięciowy, Ferrantiego) i montaż VT. */
export const OPIS_PRZEKLADNIKA = /#(ct-rating-|vt-rating-|cbct-rating-|vt-mounting-)/;

type NapisSceny = SceneV3['labels'][number];

/** Oczko siatki [j.św.] — tolerancja położenia kolumny odgałęzienia i osi toru. */
const GRID_WYROCZNI = 8;

/** Wiersz kolumny opisów [j.św.] — dwa oczka (wiersz pisma t3/t4 w górę do siatki). */
const WIERSZ_KOLUMNY = 2 * GRID_WYROCZNI;

const srodekY = (r: V3Rect): number => r.y + r.height / 2;
const takiSam = (a: V3Rect, b: V3Rect): boolean => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Kolumny opisów jednego pola sceny: oznaczenia i opisy przekładników (napisy z prefiksem pola). */
export function kolumnyOpisowPol(scena: SceneV3): ReadonlyMap<string, { readonly oznaczenia: NapisSceny[]; readonly przekladnie: NapisSceny[] }> {
  const pola = new Map<string, { oznaczenia: NapisSceny[]; przekladnie: NapisSceny[] }>();
  for (const l of scena.labels) {
    const oznaczenie = OZNACZENIE_APARATU.test(l.ownerRef);
    if (!oznaczenie && !OPIS_PRZEKLADNIKA.test(l.ownerRef)) continue;
    const pole = l.ownerRef.slice(0, l.ownerRef.indexOf('#'));
    const w = pola.get(pole) ?? { oznaczenia: [], przekladnie: [] };
    (oznaczenie ? w.oznaczenia : w.przekladnie).push(l);
    pola.set(pole, w);
  }
  return pola;
}

/**
 * Wyrocznia kolumn opisów pola (wzorzec właściciela 2026-11-05: „Opisy pól po lewej dzięki temu
 * pole robi się czytelniejsze i węższe”, `compose/kolumnaOpisowPola.ts`), każde pole sceny:
 *  (a) każde oznaczenie aparatu ma powiązanie z symbolem (`symbolOpisu`), lewa krawędź WSZYSTKICH
 *      oznaczeń pola jest jedna, a środek pionowy oznaczenia różni się od środka jego symbolu
 *      najwyżej o pół wysokości symbolu i jeden wiersz kolumny (`WIERSZ_KOLUMNY`): wiersze
 *      aparatów o zachodzących wysokościach (aparat boczny obok aparatu toru — Z.11: GK1 i Q51,
 *      pole transformatorowe stacji: T1, T2, Q8, Z1) rozsuwają się blokiem wokół swoich symboli
 *      i żaden nie odjeżdża dalej niż o wiersz;
 *  (b) każdy opis przekładnika ma powiązanie z symbolem, lewa krawędź WSZYSTKICH opisów pola jest
 *      jedna i leży za kolumną oznaczeń (≥ prawa krawędź każdego oznaczenia), a opis stoi w wierszu
 *      oznaczenia swojego aparatu (pierwszy opis — górna krawędź = górna krawędź oznaczenia;
 *      aparat bez oznaczenia — środek jak w (a));
 *  (c) żaden opis (oznaczenie, opis przekładnika) nie leży na prawo od lewej krawędzi toru
 *      głównego pola (najmniejsze `x` symboli pola);
 *  (d) opisy kolumn są rozłączne z każdym symbolem (prostokąt definicji ∪ obrys tuszu, ramka
 *      bloku — cała), z każdym innym napisem i z każdym przewodem;
 *  (e) kolumna odgałęzienia stoi tuż przy torze głównym: lewa krawędź jej symboli (prostokąt
 *      definicji) − prawa krawędź symboli toru głównego (symbole bez numeru odgałęzienia,
 *      których środek leży w osi pola — osi pierwszego symbolu od szyny — i aparatów bocznych
 *      toru głównego w pasie wysokości kolumny) ≤ oczko — bez pasa opisów między torem
 *      a odgałęzieniem.
 * Naruszenia z prefiksem `(kol-<litera>)` (litery własne wyroczni, niezależne od liter
 * wyroczni kontraktów, które ją wołają).
 */
export function naruszeniaKolumnOpisow(scena: SceneV3): string[] {
  const n: string[] = [];
  const przewody = labelWireCollisions(scena);
  for (const [pole, { oznaczenia, przekladnie }] of kolumnyOpisowPol(scena)) {
    const symbolePola = scena.symbols.filter((s) => s.meta?.ownerRef === pole && s.symbolId in SYMBOL_DEFS && !ramkaBlokuSymbolu(s));
    const krawedzToru = Math.min(...symbolePola.map((s) => Math.min(s.x, obrysNaScenie(s).x)));
    const lewaOznaczen = new Set(oznaczenia.map((l) => l.rect.x));
    if (lewaOznaczen.size > 1) n.push(`(kol-a) ${pole}: lewe krawędzie oznaczeń ${[...lewaOznaczen].sort((x, y) => x - y).join(', ')}`);
    for (const l of oznaczenia) {
      const s = l.symbolOpisu;
      if (!s) {
        n.push(`(kol-a) ${l.ownerRef} „${l.text}”: brak powiązania z symbolem`);
        continue;
      }
      if (Math.abs(srodekY(l.rect) - srodekY(s)) > s.height / 2 + WIERSZ_KOLUMNY) {
        n.push(`(kol-a) ${l.ownerRef} „${l.text}”: środek ${srodekY(l.rect)} dalej niż wiersz od symbolu ${s.y}…${s.y + s.height}`);
      }
    }
    const lewaPrzekladni = new Set(przekladnie.map((l) => l.rect.x));
    if (lewaPrzekladni.size > 1) n.push(`(kol-b) ${pole}: lewe krawędzie opisów przekładników ${[...lewaPrzekladni].sort((x, y) => x - y).join(', ')}`);
    const prawaOznaczen = Math.max(...oznaczenia.map((l) => l.rect.x + l.rect.width));
    for (const l of przekladnie) {
      const s = l.symbolOpisu;
      if (!s) {
        n.push(`(kol-b) ${l.ownerRef} „${l.text}”: brak powiązania z symbolem`);
        continue;
      }
      if (l.rect.x < prawaOznaczen) n.push(`(kol-b) ${l.ownerRef} „${l.text}”: x ${l.rect.x} w kolumnie oznaczeń (do ${prawaOznaczen})`);
      const oznaczenie = oznaczenia.find((o) => o.symbolOpisu && takiSam(o.symbolOpisu, s));
      const opisyAparatu = przekladnie.filter((p) => p.symbolOpisu && takiSam(p.symbolOpisu, s)).sort((a, b) => a.rect.y - b.rect.y);
      if (oznaczenie && opisyAparatu[0] === l && l.rect.y !== oznaczenie.rect.y) {
        n.push(`(kol-b) ${l.ownerRef} „${l.text}”: górna krawędź ${l.rect.y} ≠ wiersz oznaczenia „${oznaczenie.text}” ${oznaczenie.rect.y}`);
      }
      if (!oznaczenie && Math.abs(srodekY(l.rect) - srodekY(s)) > s.height / 2 + WIERSZ_KOLUMNY) {
        n.push(`(kol-b) ${l.ownerRef} „${l.text}”: środek ${srodekY(l.rect)} dalej niż wiersz od symbolu ${s.y}…${s.y + s.height}`);
      }
    }
    for (const l of [...oznaczenia, ...przekladnie]) {
      if (l.rect.x + l.rect.width > krawedzToru) n.push(`(kol-c) ${l.ownerRef} „${l.text}”: prawa krawędź ${l.rect.x + l.rect.width} za lewą krawędzią toru ${krawedzToru}`);
      for (const s of scena.symbols) {
        if (zachodzi(l.rect, gabarytSymbolu(s)) || zachodzi(l.rect, obrysNaScenie(s))) n.push(`(kol-d) ${l.ownerRef} „${l.text}” ∩ symbol ${s.symbolId} ${s.meta?.ownerRef ?? '—'}`);
      }
      for (const inny of scena.labels) {
        if (inny !== l && zachodzi(l.rect, inny.rect)) n.push(`(kol-d) ${l.ownerRef} „${l.text}” ∩ napis „${inny.text}” ${inny.ownerRef}`);
      }
    }
  }
  for (const pole of new Set(scena.symbols.map((s) => s.meta?.ownerRef).filter((r): r is string => r != null))) {
    const symbole = scena.symbols.filter((s) => s.meta?.ownerRef === pole && s.symbolId in SYMBOL_DEFS && !ramkaBlokuSymbolu(s));
    const galezie = symbole.filter((s) => s.meta?.odgalezienieToru != null);
    if (galezie.length === 0) continue;
    const srodekX = (s: SymbolSceny) => s.x + SYMBOL_DEFS[s.symbolId].width / 2;
    const pierwszy = [...symbole].sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const tor = symbole.filter((s) => s.meta?.odgalezienieToru == null && Math.abs(srodekX(s) - srodekX(pierwszy)) <= GRID_WYROCZNI);
    const prawaToru = Math.max(...tor.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));
    for (const numer of new Set(galezie.map((s) => s.meta!.odgalezienieToru!))) {
      const kolumna = galezie.filter((s) => s.meta!.odgalezienieToru === numer);
      const gora = Math.min(...kolumna.map((s) => s.y));
      const dol = Math.max(...kolumna.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height));
      // Aparat boczny toru głównego w pasie wysokości kolumny (stoi między torem a kolumną) —
      // kolumna stoi tuż za nim.
      const boczne = symbole.filter(
        (s) => s.meta?.odgalezienieToru == null && !tor.includes(s) && s.y < dol && s.y + SYMBOL_DEFS[s.symbolId].height > gora,
      );
      const prawa = Math.max(prawaToru, ...boczne.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));
      const lewa = Math.min(...kolumna.map((s) => s.x));
      if (lewa - prawa > GRID_WYROCZNI) n.push(`(kol-e) ${pole}: kolumna odgałęzienia ${numer} o ${lewa - prawa} od toru głównego (${prawa} → ${lewa})`);
    }
  }
  for (const k of przewody) {
    if (OZNACZENIE_APARATU.test(k.ownerRef) || OPIS_PRZEKLADNIKA.test(k.ownerRef)) {
      n.push(`(kol-d) ${k.ownerRef} ∩ przewód ${scena.segments[k.segmentIndex].meta?.ownerRef ?? '—'}`);
    }
  }
  return n;
}
