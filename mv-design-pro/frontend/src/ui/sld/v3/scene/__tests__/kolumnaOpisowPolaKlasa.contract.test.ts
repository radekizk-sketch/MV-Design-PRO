// @vitest-environment node
/**
 * Kontrakt KLASY wzorca pola (karta RAMKA-PRZEKAZNIKA, następca 2026-11-11; decyzje właściciela
 * 2026-11-05: „tak ma być ramka we wszystkich tak samo” i „Opisy pól po lewej dzięki temu pole
 * robi się czytelniejsze i węższe”): w KAŻDYM rodzaju pola ta sama ramka bloku zabezpieczeń
 * (gdy pole ma funkcje EAZ) i ta sama kolumna opisów pola przy lewej krawędzi — oznaczenia
 * aparatów w kolumnie oznaczeń, opisy przekładników w kolumnie przekładni, ramka bloku na prawo
 * od kolumn.
 *
 * Iloczyn cech: rodzaj pola {GPZ z powiązaniami obwodów wtórnych (QET, Z.10), GPZ bez powiązań
 * (symbole kanoniczne), pole źródła OZE w GPZ, pole toru transformatora GPZ (wieża), pole
 * liniowe stacji SN, sprzęgło stacji, pole transformatorowe stacji, pole źródła OZE stacji}
 * × LOD {0, 1, 2} × funkcje EAZ {są, brak} × przekładniki {są, brak}.
 *
 * Wyrocznie (niezależne od kompozytora — oczekiwania z rekordów modelu ENM, geometria ze sceny):
 *  (A) blok zabezpieczeń pola: dokładnie jeden na LOD1/LOD2, gdy pole ma funkcje EAZ, zero
 *      w każdym innym przypadku;
 *  (B) każdy aparat pola z oznaczeniem w rekordzie (`designation`) ma na rysunku oznaczenie
 *      w kolumnie oznaczeń (napis `#etykieta-aparatu-` / `#apparatus-id-` powiązany z symbolem
 *      aparatu przez `symbolOpisu`, tekst kończy się oznaczeniem rekordu — pole GPZ dokłada
 *      numer pola, IEC 81346-1): LOD2 — każdy aparat, LOD1 — przekładniki (odbiór B-02
 *      2026-11-04 pkt 6), LOD0 — żaden;
 *  (C) opisy przekładników (tabliczki, montaż VT) wyłącznie na LOD2, wyłącznie przy symbolach
 *      przekładników pola; pole bez przekładników — żadnego;
 *  (D) ramka bloku stoi na prawo od kolumn opisów (lewa krawędź ramki ≥ prawa krawędź każdego
 *      opisu pola);
 *  (E) wyrocznie kolumn i opisów (`naruszeniaKolumnOpisow`, `naruszeniaOpisowPola`,
 *      `naruszeniaKodowRamki`) — zero naruszeń w polu.
 * Pokrycie przypięte: w każdym rodzaju pola przypadek LOD2 z EAZ i przekładnikami ma blok,
 * oznaczenie w kolumnie i oznaczenie przekładnika; tabliczki przekładników — w rodzajach, których
 * fikstura niesie przekładnię w danych. Iniekcje na realnej scenie każdego rodzaju pola: blok
 * zdjęty → (A); oznaczenia zdjęte → (B); oznaczenie przeniesione za tor → (E).
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { ramkaBlokuSymbolu } from '../../symbols/blokZabezpieczen';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { RODZAJE_PRZEKLADNIKOW_OD_LOD1 } from '../../compose/kolumnaOpisowPola';
import { buildSceneV3, type SceneV3 } from '../buildScene';
import {
  bezPrzekladnikow,
  poleGpz,
  poleOzeGpz,
  poleStacji,
  poleTorTransformatoraGpz,
  RODZAJE_PRZEKLADNIKOW,
  SCIEZKA_DANYCH,
  Z10,
  zasilane,
  type PrzypadekPola,
} from './fixtures/polaZFunkcjamiEaz';
import {
  kolumnyOpisowPol,
  naruszeniaKodowRamki,
  naruszeniaKolumnOpisow,
  naruszeniaOpisowPola,
  OPIS_PRZEKLADNIKA,
  OZNACZENIE_APARATU,
} from './wyroczniaOpisowPola';

/** Kody funkcji EAZ ze słownika (`funkcje_eaz.py`). */
const KODY_EAZ = ['50', '51', '51N'] as const;
const LODY = [0, 1, 2] as const;

const RODZAJE: readonly (readonly [string, (kody: readonly string[]) => PrzypadekPola, { readonly tabliczki: boolean; readonly przekladnik: boolean }])[] = [
  ['GPZ z powiązaniami obwodów wtórnych', (k) => poleGpz(Z10, zasilane(Z10), k), { tabliczki: true, przekladnik: true }],
  ['GPZ bez powiązań', (k) => poleGpz(SCIEZKA_DANYCH, (b) => b.bay_role === 'OUT', k, { bezPowiazan: true }), { tabliczki: true, przekladnik: true }],
  ['pole źródła OZE w GPZ', (k) => poleOzeGpz(k), { tabliczki: false, przekladnik: true }],
  ['pole toru transformatora GPZ', (k) => poleTorTransformatoraGpz(k), { tabliczki: true, przekladnik: true }],
  ['pole liniowe stacji SN', (k) => poleStacji('kanoniczny:bay_template_line_out', k), { tabliczki: false, przekladnik: true }],
  // Celka sprzęgła katalogu nie ma przekładnika — wymiar „przekładniki są/brak” jest w niej tym samym polem.
  ['sprzęgło stacji', (k) => poleStacji('kanoniczny:bay_template_coupler', k), { tabliczki: false, przekladnik: false }],
  ['pole transformatorowe stacji', (k) => poleStacji('kanoniczny:bay_template_transformer', k), { tabliczki: false, przekladnik: true }],
  ['pole źródła OZE stacji', (k) => poleStacji('kanoniczny:bay_template_der_pv', k), { tabliczki: false, przekladnik: true }],
];

interface Przypadek {
  readonly enm: EnergyNetworkModel;
  readonly bayRef: string;
  readonly eaz: boolean;
  readonly przekladniki: boolean;
}

function przypadek(fabryka: (kody: readonly string[]) => PrzypadekPola, eaz: boolean, przekladniki: boolean): Przypadek {
  const { enm, bayRef } = fabryka(eaz ? KODY_EAZ : []);
  if (!przekladniki) bezPrzekladnikow(enm, bayRef);
  return { enm, bayRef, eaz, przekladniki };
}

type SymbolSceny = SceneV3['symbols'][number];
const prostokat = (s: SymbolSceny) => ({ x: s.x, y: s.y, width: SYMBOL_DEFS[s.symbolId].width, height: SYMBOL_DEFS[s.symbolId].height });
const takiSam = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Naruszenia (A)–(E) dla pola przypadku na scenie. */
function naruszenia(p: Przypadek, scena: SceneV3): string[] {
  const n: string[] = [];
  const lod = scena.meta.lod;
  const bay = (p.enm.bays ?? []).find((b) => b.ref_id === p.bayRef)!;
  const rekordy = new Map((bay.primary_devices ?? []).map((d) => [d.device_ref, d] as const));
  const bloki = scena.symbols.filter((s) => s.symbolId === 'protectionRelay' && s.meta?.ownerRef === p.bayRef);
  // (A)
  const oczekiwaneBloki = lod > 0 && p.eaz ? 1 : 0;
  if (bloki.length !== oczekiwaneBloki) n.push(`(A) ${bloki.length} bloków zabezpieczeń, oczekiwano ${oczekiwaneBloki}`);
  const aparaty = scena.symbols.filter((s) => s.meta?.ownerRef === p.bayRef && s.symbolId !== 'protectionRelay' && s.meta?.deviceRef != null);
  const opisy = scena.labels.filter((l) => l.ownerRef.startsWith(`${p.bayRef}#`));
  const oznaczenia = opisy.filter((l) => OZNACZENIE_APARATU.test(l.ownerRef));
  // (B)
  for (const s of aparaty) {
    const rekord = rekordy.get(s.meta!.deviceRef!);
    const oznaczenie = rekord?.designation?.trim();
    if (!rekord || !oznaczenie) continue;
    const widoczne = lod === 2 || (lod === 1 && RODZAJE_PRZEKLADNIKOW_OD_LOD1.has(rekord.kind));
    const wKolumnie = oznaczenia.filter((l) => l.symbolOpisu && takiSam(l.symbolOpisu, prostokat(s)));
    if (widoczne && (wKolumnie.length !== 1 || !wKolumnie[0].text.endsWith(oznaczenie))) {
      n.push(`(B) LOD${lod}: aparat ${oznaczenie} (${rekord.kind}) — ${wKolumnie.length} oznaczeń w kolumnie (${wKolumnie.map((l) => l.text).join(', ')})`);
    }
    if (!widoczne && wKolumnie.length > 0) n.push(`(B) LOD${lod}: oznaczenie ${oznaczenie} (${rekord.kind}) poza swoim poziomem szczegółu`);
  }
  // (C)
  const przekladnie = opisy.filter((l) => OPIS_PRZEKLADNIKA.test(l.ownerRef));
  if ((lod < 2 || !p.przekladniki) && przekladnie.length > 0) {
    n.push(`(C) LOD${lod}, przekładniki ${p.przekladniki ? 'są' : 'brak'}: ${przekladnie.length} opisów przekładników`);
  }
  for (const l of przekladnie) {
    const s = aparaty.find((a) => l.symbolOpisu && takiSam(l.symbolOpisu, prostokat(a)));
    const rodzaj = s ? rekordy.get(s.meta!.deviceRef!)?.kind : undefined;
    if (!rodzaj || !RODZAJE_PRZEKLADNIKOW.has(rodzaj)) n.push(`(C) opis „${l.text}” nie stoi przy przekładniku pola (${rodzaj ?? 'brak symbolu'})`);
  }
  // (D)
  const ramka = bloki[0] ? ramkaBlokuSymbolu(bloki[0]) : null;
  if (ramka) {
    for (const l of [...oznaczenia, ...przekladnie]) {
      if (l.rect.x + l.rect.width > ramka.x) n.push(`(D) opis „${l.text}” (do x=${l.rect.x + l.rect.width}) nie stoi na lewo od ramki bloku (x=${ramka.x})`);
    }
  }
  // (E)
  const wPolu = (x: string) => x.includes(p.bayRef);
  n.push(...[...naruszeniaKolumnOpisow(scena), ...naruszeniaOpisowPola(scena), ...naruszeniaKodowRamki(scena)].filter(wPolu).map((x) => `(E) ${x}`));
  return n;
}

describe('klasa wzorca pola — rodzaj pola × LOD × funkcje EAZ × przekładniki', () => {
  for (const [rodzaj, fabryka] of RODZAJE) {
    for (const eaz of [true, false]) {
      for (const przekladniki of [true, false]) {
        it(`${rodzaj} · EAZ ${eaz ? 'są' : 'brak'} · przekładniki ${przekladniki ? 'są' : 'brak'} · LOD 0/1/2`, () => {
          const p = przypadek(fabryka, eaz, przekladniki);
          for (const lod of LODY) expect(naruszenia(p, buildSceneV3(p.enm, lod)), `LOD${lod}`).toEqual([]);
        });
      }
    }
  }
});

describe('pokrycie przypięte — każdy rodzaj pola ma blok i kolumnę opisów (zero pustych przejść)', () => {
  for (const [rodzaj, fabryka, { tabliczki, przekladnik }] of RODZAJE) {
    it(`${rodzaj}: LOD2 — blok, oznaczenia aparatów${przekladnik ? ', oznaczenie przekładnika' : ''}${tabliczki ? ', tabliczka' : ''}; LOD1 — oznaczenia przekładników`, () => {
      const p = przypadek(fabryka, true, true);
      const l2 = buildSceneV3(p.enm, 2);
      const kolumny = kolumnyOpisowPol(l2).get(p.bayRef);
      expect(l2.symbols.filter((s) => s.symbolId === 'protectionRelay' && s.meta?.ownerRef === p.bayRef)).toHaveLength(1);
      expect(kolumny?.oznaczenia.length ?? 0).toBeGreaterThanOrEqual(3);
      const bay = (p.enm.bays ?? []).find((b) => b.ref_id === p.bayRef)!;
      const przekladnikiPola = (bay.primary_devices ?? []).filter((d) => RODZAJE_PRZEKLADNIKOW_OD_LOD1.has(d.kind) && d.designation);
      expect(przekladnikiPola.length > 0).toBe(przekladnik);
      if (tabliczki) expect(kolumny?.przekladnie.length ?? 0).toBeGreaterThan(0);
      const l1 = kolumnyOpisowPol(buildSceneV3(p.enm, 1)).get(p.bayRef);
      expect(l1?.oznaczenia.length ?? 0).toBe(przekladnikiPola.length);
    });
  }
});

describe('wyrocznie klasy gryzą — iniekcje na realnej scenie każdego rodzaju pola', () => {
  for (const [rodzaj, fabryka] of RODZAJE) {
    const p = przypadek(fabryka, true, true);
    const scena = buildSceneV3(p.enm, 2);
    it(`${rodzaj}: scena wejściowa czysta; blok zdjęty → (A); oznaczenia zdjęte → (B); oznaczenie za torem → (E)`, () => {
      expect(naruszenia(p, scena)).toEqual([]);
      const bezBloku: SceneV3 = { ...scena, symbols: scena.symbols.filter((s) => !(s.symbolId === 'protectionRelay' && s.meta?.ownerRef === p.bayRef)) };
      expect(naruszenia(p, bezBloku).some((x) => x.startsWith('(A)'))).toBe(true);
      const bezOznaczen: SceneV3 = {
        ...scena,
        labels: scena.labels.filter((l) => !(l.ownerRef.startsWith(`${p.bayRef}#`) && OZNACZENIE_APARATU.test(l.ownerRef))),
      };
      expect(naruszenia(p, bezOznaczen).some((x) => x.startsWith('(B)'))).toBe(true);
      const oznaczenie = scena.labels.find((l) => l.ownerRef.startsWith(`${p.bayRef}#`) && OZNACZENIE_APARATU.test(l.ownerRef))!;
      const zaTorem = Math.max(...scena.symbols.filter((s) => s.meta?.ownerRef === p.bayRef && s.symbolId !== 'protectionRelay').map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));
      const przeniesione: SceneV3 = {
        ...scena,
        labels: scena.labels.map((l) => (l === oznaczenie ? { ...l, rect: { ...l.rect, x: zaTorem + 200 } } : l)),
      };
      expect(naruszenia(p, przeniesione).some((x) => x.startsWith('(E)') || x.startsWith('(D)'))).toBe(true);
    });
  }
});
