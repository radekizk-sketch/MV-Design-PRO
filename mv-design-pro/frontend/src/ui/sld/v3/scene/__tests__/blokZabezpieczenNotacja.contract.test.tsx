/**
 * Kontrakt JEDNEJ NOTACJI BLOKU ZABEZPIECZEŃ (karta JEDNA NOTACJA BLOKU ZABEZPIECZEŃ, decyzja
 * właściciela 2026-11-05: „tak ma być ramka we wszystkich tak samo”; UX04 §11.20): przekaźnik
 * albo sterownik pola jest na całym schemacie tą samą prostokątną ramką z kodami funkcji
 * w dwóch kolumnach (LOD2), gołą ramką (LOD1), nieobecną na LOD0; ramka stoi na wysokości
 * łącznika, który zabezpieczenie wyłącza (albo — model nie wskazuje łącznika wyłączanego —
 * pierwszego łącznika pola).
 *
 * Iloczyn cech: rodzaj pola {GPZ z powiązaniami obwodów wtórnych, GPZ bez powiązań, pole
 * liniowe stacji SN, sprzęgło, pole transformatorowe, pole źródła OZE, pole źródła OZE w GPZ,
 * pole toru transformatora GPZ} × liczba kodów {0, 1, 2, 7} × LOD {0, 1, 2} × motyw {ciemny,
 * jasny}. Fikstury pól — `fixtures/polaZFunkcjamiEaz.ts` (jedno źródło z kontraktem kolumny
 * opisów pola, `kolumnaOpisowPolaKlasa.contract.test.ts`).
 *
 * Wyrocznie (niezależne od kompozytora — geometria z meta sceny, porty z definicji symboli):
 *  (a) na scenie nie ma okręgu przekaźnika — każdy symbol `protectionRelay` niesie ramkę, glif
 *      każdego bloku w obu motywach rysuje wyłącznie prostokąt ramki (zero `circle`, zero tekstu);
 *  (b) geometria ramki z jednej funkcji — ramka sceny jest punktem stałym `ramkaBlokuZWierszy`
 *      dla wierszy kodów z prostokątami sceny (LOD2), gabaryt symbolu = ramka, ramka na LOD1 ma
 *      ten sam kształt co na LOD2, wiersze = kody pola w kolejności danych;
 *  (c) środek ramki na wysokości łącznika ±1 oczko (łącznik wyłączany: zacisk cewki albo środek
 *      symbolu; bez wskazania — pierwszy łącznik pola) albo — gdy oś wypada ponad rysunkiem
 *      aparatów pola — górna krawędź ramki w górnej krawędzi rysunku aparatów (ramka nie
 *      przecina szyny);
 *  (d) opisy pola bez kolizji (wspólna wyrocznia `wyroczniaOpisowPola.ts`);
 *  (e) ramka bloku nie styka się z obcym przewodem (wyrocznia sceny `symbolWireCollisions`:
 *      gabaryt bloku = ramka, porty = wejścia linii bloku na krawędziach) — pomiar 2026-11-05:
 *      ramka siedmiu kodów pola transformatorowego sięgała szyny rzędu źródeł nN stacji;
 *  (f) kod ramki NIGDY nie jest zasłonięty (werdykt B-02 właściciela 2026-11-05, kod „81O” na
 *      zrzucie Z.11.1): pełny obrys każdego wiersza bloku (kody i odniesienie 3U₀) we wnętrzu
 *      własnej ramki, rozłączny z gabarytem każdego innego symbolu, każdym odcinkiem i każdym
 *      innym napisem sceny (wspólna wyrocznia `naruszeniaKodowRamki`).
 * Każda wyrocznia ma iniekcję na realnej scenie (dowód, że gryzie). Para rezerwacja↔rysunek:
 * dolna krawędź ramki na scenie = szczyt stosu pola + `dolRamkiBlokuPolaStacji` (rezerwacja
 * wysokości kolumny, `layout/measure.ts`) — na każdym bloku stacji fikstury 52 stacji i na
 * iloczynie rodzaj pola stacji × liczba kodów.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { daneGlifuSymbolu, type PreviewSymbol } from '../../compose/preview';
import { GRID, type V3Rect } from '../../core/grid';
import { gabarytSymbolu, ramkaBlokuSymbolu, ramkaBlokuZWierszy } from '../../symbols/blokZabezpieczen';
import { CONTINUITY_APPARATUS_SYMBOL_IDS, rodzajSymbolu, SYMBOL_DEFS } from '../../symbols/defs';
import { SYMBOL_GLYPHS } from '../../symbols/glyphs';
import { baseSymbolStrokeColor } from '../../theme/colorTokens';
import { sldPaletteForTheme } from '../../theme/palette';
import type { ThemeMode } from '../../../../../ui2/theme/themeMode';
import { buildSceneV3, protectionMarkingGaps, symbolWireCollisions, type SceneV3 } from '../buildScene';
import { dolRamkiBlokuPolaStacji } from '../../compose/blokZabezpieczenPola';
import { buildSldDataFromSnapshot } from '../../../v2/canvas/enmToSldAdapter';
import {
  BAZA_STACJI,
  poleGpz,
  poleOzeGpz,
  poleStacji,
  poleTorTransformatoraGpz,
  SCIEZKA_DANYCH,
  Z10,
  zasilane,
  type PrzypadekPola,
} from './fixtures/polaZFunkcjamiEaz';
import { naruszeniaKodowRamki, naruszeniaOpisowPola, zachodzi } from './wyroczniaOpisowPola';

/** Listy kodów ze słownika funkcji EAZ (`funkcje_eaz.py`) — 0, 1, 2 i 7 funkcji. */
const KODY: Readonly<Record<0 | 1 | 2 | 7, readonly string[]>> = {
  0: [],
  1: ['51'],
  2: ['51', '51N'],
  7: ['50', '51', '51N', '67N', '46', '49', '79'],
};
const LICZBY_KODOW = [0, 1, 2, 7] as const;
const LODY = [0, 1, 2] as const;
const MOTYWY: readonly ThemeMode[] = ['dark_scada', 'light_technical'];

type RodzajPola =
  | 'GPZ z powiązaniami obwodów wtórnych'
  | 'GPZ bez powiązań'
  | 'pole liniowe stacji SN'
  | 'sprzęgło'
  | 'pole transformatorowe'
  | 'pole źródła OZE'
  | 'pole źródła OZE w GPZ'
  | 'pole toru transformatora GPZ';

const RODZAJE: readonly (readonly [RodzajPola, (kody: readonly string[]) => PrzypadekPola])[] = [
  ['GPZ z powiązaniami obwodów wtórnych', (k) => poleGpz(Z10, zasilane, k)],
  ['GPZ bez powiązań', (k) => poleGpz(SCIEZKA_DANYCH, (b) => b.bay_role === 'OUT' && !zasilane(b), k)],
  ['pole liniowe stacji SN', (k) => poleStacji('kanoniczny:bay_template_line_out', k)],
  ['sprzęgło', (k) => poleStacji('kanoniczny:bay_template_coupler', k)],
  ['pole transformatorowe', (k) => poleStacji('kanoniczny:bay_template_transformer', k)],
  ['pole źródła OZE', (k) => poleStacji('kanoniczny:bay_template_der_pv', k)],
  ['pole źródła OZE w GPZ', (k) => poleOzeGpz(k)],
  ['pole toru transformatora GPZ', (k) => poleTorTransformatoraGpz(k)],
];

type SymbolSceny = SceneV3['symbols'][number];
type Punkt = { readonly x: number; readonly y: number };

const WIERSZ_KODU = (bayRef: string) => (ownerRef: string) =>
  ownerRef === `${bayRef}#protection-codes-full` || ownerRef.startsWith(`${bayRef}#protection-codes-full-`);
const RODZAJE_LACZNIKOW = new Set(CONTINUITY_APPARATUS_SYMBOL_IDS.map(rodzajSymbolu));
const rowne = (a: Punkt, b: Punkt): boolean => a.x === b.x && a.y === b.y;

/** Glif symbolu sceny w motywie (kolor kreski z palety motywu — ta sama funkcja co kanwa). */
function glifWMotywie(s: SymbolSceny, motyw: ThemeMode): Document {
  const Glyph = SYMBOL_GLYPHS[s.symbolId];
  const stroke = baseSymbolStrokeColor(s.symbolId, s.meta, sldPaletteForTheme(motyw));
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <svg>
        <Glyph x={s.x} y={s.y} stroke={stroke} {...daneGlifuSymbolu(s as PreviewSymbol)} />
      </svg>,
    ),
    'image/svg+xml',
  );
}

/** (a) w glifie bloku: wyłącznie prostokąt ramki w kolorze motywu, zero okręgu, zero tekstu. */
function naruszeniaGlifu(doc: Document, s: SymbolSceny, motyw: ThemeMode): string[] {
  const n: string[] = [];
  const opis = `${s.meta?.ownerRef ?? '—'} [${motyw}]`;
  // Znacznik ostrzeżenia topologii („!" w rogu ramki, `data-topology-warning`) jest odrębnym
  // znakiem stanu pola, nie notacją bloku — wyrocznia (a) go pomija.
  const poza = (sel: string) => [...doc.querySelectorAll(sel)].filter((e) => !e.closest('[data-topology-warning]'));
  if (poza('circle, ellipse').length > 0) n.push(`(a) okrąg w glifie bloku ${opis}`);
  if (poza('text').length > 0) n.push(`(a) tekst w glifie bloku ${opis}`);
  const ramy = doc.querySelectorAll('rect[data-przekaznik="ramka-bloku"]');
  if (ramy.length !== 1) n.push(`(a) ${ramy.length} ramek w glifie bloku ${opis}`);
  const r = ramkaBlokuSymbolu(s);
  const rama = ramy[0];
  if (r && rama) {
    const wGlifie = ['x', 'y', 'width', 'height'].map((a) => Number(rama.getAttribute(a)));
    const wScenie = [r.x - s.x, r.y - s.y, r.width, r.height];
    if (wGlifie.join(',') !== wScenie.join(',')) n.push(`(a) ramka glifu ${wGlifie.join(',')} ≠ ramka sceny ${wScenie.join(',')} ${opis}`);
    const kolor = baseSymbolStrokeColor(s.symbolId, s.meta, sldPaletteForTheme(motyw));
    if (rama.getAttribute('stroke') !== kolor) n.push(`(a) kolor ramki ${rama.getAttribute('stroke')} ≠ kolor motywu ${kolor} ${opis}`);
  }
  return n;
}

/** Oś bloku pola na scenie: zacisk cewki wyłączanego łącznika (koniec linii wyłączania na
 *  zacisku wtórnym), środek łącznika wyłączanego (koniec na porcie toru) albo — bez linii
 *  wyłączania — środek pierwszego łącznika pola (najwyżej leżący łącznik toru pola). */
function osBloku(scena: SceneV3, bayRef: string): number | null {
  const aparatyPola = scena.symbols.filter((s) => s.meta?.ownerRef === bayRef && s.symbolId !== 'protectionRelay' && s.symbolId !== 'meter');
  const linia = scena.segments.find((g) => g.meta?.kind === 'protectionTrip' && g.meta?.ownerRef === `${bayRef}#trip-line`);
  if (linia) {
    for (const koniec of [linia.points[0], linia.points[linia.points.length - 1]]) {
      for (const s of aparatyPola) {
        const def = SYMBOL_DEFS[s.symbolId];
        if (def.secondaryPorts.some((p) => rowne({ x: s.x + p.x, y: s.y + p.y }, koniec))) return koniec.y;
        if (def.ports.some((p) => rowne({ x: s.x + p.x, y: s.y + p.y }, koniec))) return s.y + def.height / 2;
      }
    }
    return null;
  }
  const lacznik = aparatyPola
    .filter((s) => RODZAJE_LACZNIKOW.has(rodzajSymbolu(s.symbolId)))
    .sort((a, b) => a.y - b.y || a.x - b.x)[0];
  return lacznik ? lacznik.y + SYMBOL_DEFS[lacznik.symbolId].height / 2 : null;
}

/** Górna krawędź rysunku aparatów pola na scenie. */
function goraAparatowPola(scena: SceneV3, bayRef: string): number {
  return Math.min(
    ...scena.symbols
      .filter((s) => s.meta?.ownerRef === bayRef && s.symbolId !== 'protectionRelay' && s.symbolId !== 'meter')
      .map((s) => gabarytSymbolu(s).y),
  );
}

/** Wyrocznie (a)–(d) dla pola `bayRef` z `kody` na scenie `scena`. */
function naruszenia(scena: SceneV3, bayRef: string, kody: readonly string[]): string[] {
  const n: string[] = [];
  const lod = scena.meta.lod;
  const bloki = scena.symbols.filter((s) => s.symbolId === 'protectionRelay');
  // (a) każdy przekaźnik sceny to ramka bloku (okrąg nie istnieje), glif w obu motywach.
  for (const s of bloki) {
    if (!ramkaBlokuSymbolu(s)) n.push(`(a) przekaźnik bez ramki bloku ${s.meta?.ownerRef ?? '—'}`);
    for (const motyw of MOTYWY) n.push(...naruszeniaGlifu(glifWMotywie(s, motyw), s, motyw));
  }
  if (lod === 0 && bloki.length > 0) n.push(`(a) ${bloki.length} bloków zabezpieczeń na LOD0`);
  for (const g of protectionMarkingGaps(scena)) n.push(`(a/b) sonda sceny: ${g.reason} ${g.ownerRef ?? '—'}`);
  const wlasne = bloki.filter((s) => s.meta?.ownerRef === bayRef);
  const oczekiwane = lod === 0 || kody.length === 0 ? 0 : 1;
  if (wlasne.length !== oczekiwane) n.push(`(a) pole ${bayRef}: ${wlasne.length} bloków, oczekiwano ${oczekiwane}`);
  for (const blok of wlasne) {
    const ramka = ramkaBlokuSymbolu(blok);
    if (!ramka) continue; // brak ramki zgłoszony już jako (a) — geometria (b)/(c) bez ramki nie istnieje
    const wiersze = scena.labels.filter((l) => WIERSZ_KODU(bayRef)(l.ownerRef));
    // (b) jedna funkcja geometrii: gabaryt symbolu = ramka; wiersze = kody pola w kolejności
    // danych; ramka = punkt stały `ramkaBlokuZWierszy` dla wierszy sceny (LOD2).
    const gabaryt = gabarytSymbolu(blok);
    if (JSON.stringify(gabaryt) !== JSON.stringify(ramka)) n.push(`(b) gabaryt ${JSON.stringify(gabaryt)} ≠ ramka ${JSON.stringify(ramka)}`);
    if (lod === 2) {
      const teksty = wiersze.map((l) => l.text);
      if (teksty.join(',') !== kody.join(',')) n.push(`(b) wiersze ${teksty.join(',')} ≠ kody pola ${kody.join(',')}`);
      const zFunkcji = ramkaBlokuZWierszy(wiersze.map((l) => l.rect), ramka.x, ramka.y, ramka.width);
      if (JSON.stringify(zFunkcji) !== JSON.stringify(ramka)) n.push(`(b) ramka sceny ${JSON.stringify(ramka)} ≠ ramkaBlokuZWierszy ${JSON.stringify(zFunkcji)}`);
    } else if (wiersze.length > 0) {
      n.push(`(b) ${wiersze.length} wierszy kodów na LOD${lod}`);
    }
    // (c) środek ramki na wysokości łącznika ±1 oczko (albo ramka dosunięta do góry rysunku pola).
    const os = osBloku(scena, bayRef);
    if (os === null) {
      n.push(`(c) pole ${bayRef}: brak łącznika osi bloku`);
    } else {
      const srodek = ramka.y + ramka.height / 2;
      const gora = goraAparatowPola(scena, bayRef);
      const dosunieta = os - ramka.height / 2 < gora && ramka.y >= gora && ramka.y - gora <= GRID;
      if (Math.abs(srodek - os) > GRID && !dosunieta) n.push(`(c) środek ramki y=${srodek} ≠ oś łącznika y=${os} (±${GRID})`);
    }
    // (d, ramka) obcy napis nie przecina ramki bloku; własne wiersze w ramce.
    for (const l of scena.labels) {
      const wlasny = (blok.meta?.wierszeBlokuPrzekaznika ?? []).includes(l.ownerRef);
      if (!wlasny && zachodzi(l.rect, ramka)) n.push(`(d) napis ${l.ownerRef} ∩ ramka bloku ${bayRef}`);
    }
  }
  // (e) ramka bloku nie styka się z obcym przewodem — każdy blok sceny.
  for (const h of symbolWireCollisions(scena)) {
    if (h.symbolId !== 'protectionRelay') continue;
    n.push(`(e) blok ${scena.symbols[h.symbolIndex].meta?.ownerRef ?? '—'} ∩ przewód ${scena.segments[h.segmentIndex].meta?.ownerRef ?? '—'}`);
  }
  n.push(...naruszeniaOpisowPola(scena));
  n.push(...naruszeniaKodowRamki(scena));
  return n;
}

/** Para rezerwacja↔rysunek: dolna krawędź ramki bloku na scenie − (szczyt stosu pola
 *  + `dolRamkiBlokuPolaStacji` deskryptora pola z adaptera) dla każdego bloku pola stacji. */
function rozjazdyRezerwacjiWysokosci(enm: EnergyNetworkModel, scena: SceneV3): string[] {
  const deskryptory = new Map(
    buildSldDataFromSnapshot(enm, null).stations.flatMap((st) => st.snBays ?? []).map((b) => [b.bayRef, b] as const),
  );
  const n: string[] = [];
  for (const blok of scena.symbols.filter((s) => s.symbolId === 'protectionRelay')) {
    const bayRef = blok.meta?.ownerRef ?? '';
    const deskryptor = deskryptory.get(bayRef);
    if (!deskryptor) continue; // pole GPZ — rezerwacja kolumny GPZ ma własny pas (compose/gpz.ts)
    const ramka = ramkaBlokuSymbolu(blok)!;
    const szczyt = Math.min(
      ...scena.symbols.filter((s) => s.meta?.ownerRef === bayRef && s !== blok && s.symbolId !== 'meter').map((s) => s.y),
    );
    const dol = dolRamkiBlokuPolaStacji(deskryptor);
    if (dol === null || szczyt + dol !== ramka.y + ramka.height) {
      n.push(`${bayRef}: ramka do y=${ramka.y + ramka.height}, rezerwacja ${dol === null ? 'brak' : szczyt + dol}`);
    }
  }
  return n;
}

/** Ramka bloku pola na scenie (do porównania kształtu LOD1 ↔ LOD2). */
function ramkaPola(scena: SceneV3, bayRef: string): V3Rect | null {
  const blok = scena.symbols.find((s) => s.symbolId === 'protectionRelay' && s.meta?.ownerRef === bayRef);
  return blok ? ramkaBlokuSymbolu(blok) : null;
}

describe('jedna notacja bloku zabezpieczeń — rodzaj pola × liczba kodów × LOD × motyw', () => {
  for (const [rodzaj, przypadek] of RODZAJE) {
    for (const liczba of LICZBY_KODOW) {
      it(`${rodzaj} · ${liczba} kodów · LOD 0/1/2 · oba motywy`, () => {
        const { enm, bayRef } = przypadek(KODY[liczba]);
        const sceny = LODY.map((lod) => buildSceneV3(enm, lod));
        for (const scena of sceny) {
          expect(naruszenia(scena, bayRef, KODY[liczba]), `LOD${scena.meta.lod}`).toEqual([]);
        }
        // (b) ramka LOD1 ma ten sam kształt co ramka LOD2 (goła ramka bez kodów).
        const l1 = ramkaPola(sceny[1], bayRef);
        const l2 = ramkaPola(sceny[2], bayRef);
        expect(l1 && { width: l1.width, height: l1.height }).toEqual(l2 && { width: l2.width, height: l2.height });
        if (liczba > 0) expect(l2, 'blok pola na LOD2').not.toBeNull();
        for (const scena of sceny) expect(rozjazdyRezerwacjiWysokosci(enm, scena), `LOD${scena.meta.lod}`).toEqual([]);
      });
    }
  }
});

describe('fikstura 52 stacji — każdy blok stacji × LOD 1/2', () => {
  for (const lod of [1, 2] as const) {
    it(`LOD${lod}: (a)–(e) na każdym bloku, rezerwacja wysokości kolumny = rysunek`, () => {
      const scena = buildSceneV3(BAZA_STACJI, lod);
      const bloki = scena.symbols.filter((s) => s.symbolId === 'protectionRelay');
      // Warunek wstępny: fikstura niesie bloki stacji (pola z kodami funkcji w modelu).
      expect(bloki.length).toBeGreaterThan(100);
      const pola = new Map((BAZA_STACJI.bays ?? []).map((b) => [b.ref_id, b] as const));
      const n: string[] = [];
      for (const blok of bloki) {
        const bayRef = blok.meta!.ownerRef!;
        n.push(...naruszenia(scena, bayRef, pola.get(bayRef)?.protection_codes ?? []));
      }
      expect([...new Set(n)]).toEqual([]);
      expect(rozjazdyRezerwacjiWysokosci(BAZA_STACJI, scena)).toEqual([]);
    });
  }
});

describe('wyrocznie kontraktu gryzą — iniekcje na realnej scenie', () => {
  const { enm, bayRef } = RODZAJE.find(([r]) => r === 'pole liniowe stacji SN')![1](KODY[7]);
  const scena = buildSceneV3(enm, 2);
  const blok = scena.symbols.find((s) => s.symbolId === 'protectionRelay' && s.meta?.ownerRef === bayRef)!;
  const zBlokiem = (meta: Partial<NonNullable<SymbolSceny['meta']>>, przesuniecie: Punkt = { x: 0, y: 0 }): SceneV3 => ({
    ...scena,
    symbols: scena.symbols.map((s) => (s === blok ? { ...s, x: s.x + przesuniecie.x, y: s.y + przesuniecie.y, meta: { ...s.meta, ...meta } } : s)),
  });

  it('scena wejściowa jest czysta, blok pola obecny', () => {
    expect(blok).toBeDefined();
    expect(naruszenia(scena, bayRef, KODY[7])).toEqual([]);
  });

  it('(a) przekaźnik bez ramki bloku (dawny okrąg) → (a)', () => {
    expect(naruszenia(zBlokiem({ ramkaBlokuPrzekaznika: undefined }), bayRef, KODY[7]).some((x) => x.startsWith('(a) przekaźnik bez ramki'))).toBe(true);
  });

  it('(a) okrąg dorysowany w glifie bloku → (a) w każdym motywie', () => {
    for (const motyw of MOTYWY) {
      const doc = glifWMotywie(blok, motyw);
      const okrag = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      doc.querySelector('g')!.appendChild(okrag);
      expect(naruszeniaGlifu(doc, blok, motyw).some((x) => x.startsWith('(a) okrąg'))).toBe(true);
    }
  });

  it('(b) ramka wyższa niż z funkcji geometrii wierszy → (b)', () => {
    const r = blok.meta!.ramkaBlokuPrzekaznika!;
    const z = zBlokiem({ ramkaBlokuPrzekaznika: { ...r, height: r.height + GRID } });
    expect(naruszenia(z, bayRef, KODY[7]).some((x) => x.startsWith('(b) ramka sceny'))).toBe(true);
  });

  it('(b) wiersze w innej kolejności niż kody pola → (b)', () => {
    expect(naruszenia(scena, bayRef, [...KODY[7]].reverse()).some((x) => x.startsWith('(b) wiersze'))).toBe(true);
  });

  it('(c) ramka przesunięta o trzy oczka w dół od osi łącznika → (c)', () => {
    // Przesunięcie symbolu bloku wraz z jego wierszami (ramka i wiersze w tym samym położeniu
    // względnym — tylko (c) mierzy oś).
    const dy = 3 * GRID;
    const z: SceneV3 = {
      ...zBlokiem({}, { x: 0, y: dy }),
      labels: scena.labels.map((l) => (WIERSZ_KODU(bayRef)(l.ownerRef) ? { ...l, rect: { ...l.rect, y: l.rect.y + dy } } : l)),
    };
    expect(naruszenia(z, bayRef, KODY[7]).some((x) => x.startsWith('(c)'))).toBe(true);
  });

  it('(e) obcy przewód przez ramkę bloku → (e); rezerwacja wysokości rozjechana z rysunkiem → para gryzie', () => {
    const r = ramkaBlokuSymbolu(blok)!;
    const przewod = { points: [{ x: r.x - GRID, y: r.y + r.height }, { x: r.x + r.width + GRID, y: r.y + r.height }], meta: { ownerRef: 'iniekcja#przewod' } };
    const z: SceneV3 = { ...scena, segments: [...scena.segments, przewod as SceneV3['segments'][number]] };
    expect(naruszenia(z, bayRef, KODY[7]).some((x) => x.startsWith('(e)'))).toBe(true);
    expect(rozjazdyRezerwacjiWysokosci(enm, zBlokiem({}, { x: 0, y: GRID }))).not.toEqual([]);
  });

  // (f) — każda klasa przesłony kodu ramki osobno: obcy napis, obcy odcinek (linia pomiarowa przez
  // wiersz), obcy symbol, wiersz poza wnętrzem ramki (także wiersz odniesienia 3U₀, którego (d) nie
  // obejmuje).
  const wierszF = scena.labels.find((l) => WIERSZ_KODU(bayRef)(l.ownerRef))!;
  it('(f) obcy napis na kodzie ramki → (f) napis', () => {
    const obcy = { ...scena.labels.find((l) => !l.ownerRef.startsWith(`${bayRef}#`))!, rect: { ...wierszF.rect, x: wierszF.rect.x + 2 } };
    const z: SceneV3 = { ...scena, labels: [...scena.labels, obcy] };
    expect(naruszeniaKodowRamki(z).some((x) => x.startsWith(`(f) kod „${wierszF.text}”`) && x.includes('∩ napis'))).toBe(true);
    expect(naruszenia(z, bayRef, KODY[7]).some((x) => x.startsWith('(f)'))).toBe(true);
  });
  it('(f) linia przez kod ramki → (f) odcinek', () => {
    const cy = wierszF.rect.y + wierszF.rect.height / 2;
    const przez = { points: [{ x: wierszF.rect.x + 1, y: cy - GRID }, { x: wierszF.rect.x + 1, y: cy + GRID }], meta: { ownerRef: 'iniekcja#linia' } };
    const z: SceneV3 = { ...scena, segments: [...scena.segments, przez as SceneV3['segments'][number]] };
    expect(naruszeniaKodowRamki(z).some((x) => x.includes('∩ odcinek iniekcja#linia'))).toBe(true);
  });
  it('(f) obcy symbol na kodzie ramki → (f) symbol', () => {
    const aparat = scena.symbols.find((s) => s.symbolId !== 'protectionRelay' && s.meta?.ownerRef === bayRef)!;
    const z: SceneV3 = { ...scena, symbols: [...scena.symbols, { ...aparat, x: wierszF.rect.x, y: wierszF.rect.y }] };
    expect(naruszeniaKodowRamki(z).some((x) => x.includes(`∩ symbol ${aparat.symbolId}`))).toBe(true);
  });
  it('(f) kod dotykający krawędzi ramki → (f) poza wnętrzem', () => {
    const r = ramkaBlokuSymbolu(blok)!;
    const z: SceneV3 = {
      ...scena,
      labels: scena.labels.map((l) => (l === wierszF ? { ...l, rect: { ...l.rect, x: r.x + r.width - l.rect.width } } : l)),
    };
    expect(naruszeniaKodowRamki(z).some((x) => x.includes('obrys poza wnętrzem ramki'))).toBe(true);
  });

  it('(d) wiersz kodu wysunięty poza ramkę → (d)', () => {
    const wiersz = scena.labels.find((l) => WIERSZ_KODU(bayRef)(l.ownerRef))!;
    const r = ramkaBlokuSymbolu(blok)!;
    const z: SceneV3 = {
      ...scena,
      labels: scena.labels.map((l) => (l === wiersz ? { ...l, rect: { ...l.rect, x: r.x + r.width - 2 } } : l)),
    };
    expect(naruszenia(z, bayRef, KODY[7]).some((x) => x.startsWith('(d)'))).toBe(true);
  });
});

describe('UX04 §11.20 — pole bez wskazania łącznika wyłączanego w modelu', () => {
  it('blok stoi przy pierwszym łączniku pola, bez linii wyłączania, z brakiem danych „trip_link_unresolved"', () => {
    // Celka liniowa stacji bez przypisania zabezpieczenia (kody pola bez `protection_ref`) i bez
    // powiązań obwodów wtórnych: model nie wskazuje łącznika wyłączanego.
    const { enm, bayRef } = poleStacji('kanoniczny:bay_template_line_out', KODY[2]);
    const bay = (enm.bays ?? []).find((b) => b.ref_id === bayRef)!;
    bay.protection_ref = null;
    const scena = buildSceneV3(enm, 2);
    expect(scena.segments.filter((g) => g.meta?.ownerRef === `${bayRef}#trip-line`)).toHaveLength(0);
    expect(scena.segments.filter((g) => (g.meta?.ownerRef ?? '').startsWith(`${bayRef}#measurement-link`))).toHaveLength(0);
    expect(naruszenia(scena, bayRef, KODY[2])).toEqual([]);
  });
});
