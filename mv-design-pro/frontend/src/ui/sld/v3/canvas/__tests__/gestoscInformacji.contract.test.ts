// @vitest-environment node
/**
 * KARTA SLD-SKALA-I-NAWIGACJA (R3, R4) — KONTRAKT GĘSTOŚCI INFORMACJI I TOŻSAMOŚCI.
 *
 * Zastępuje kontrakt polityki poziomów szczegółowości nN (dawny plik
 * `politykaLodNn.contract.test.ts`, klasy L0/L1/L2 z tablicy rodzajów właściciela).
 * Intencja dawnego kontraktu zostaje i jest tu mierzona: „skala ukrywa SZCZEGÓŁY,
 * nigdy TOPOLOGII ani TOŻSAMOŚCI; element nierozwiązywalny pokazuje pełną etykietę
 * zawsze". Zmienia się mechanizm: zamiast klasy poziomu przypisanej rodzajowi
 * właściciela o widoczności rozstrzyga ROZMIAR EKRANOWY pisma (próg 9 px z histerezą
 * ±10 %), a tożsamość nie znika — poniżej progu rysuje się w stałym rozmiarze
 * ekranowym, w całości, a przegraną kolizję oddaje do podpowiedzi uchwytu.
 *
 * Iloczyn cech (reguła KLASA §2):
 *   klasa informacji {tożsamość, parametry, oznaczenia, nierozwiązywalny}
 *   × rodzaj właściciela (każdy `OwnerKind` produkujący napis)
 *   × skala (pełna drabina od `MIN_SCALE` do `MAX_SCALE`, z progami klas)
 *   × historia klatki {brak, widoczny, niewidoczny}
 *   × kolizja {brak, ranga różna, ranga równa — remis po refie, kolejność wejścia}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';
import { MAX_SCALE, MIN_SCALE, skalaMinimalna, boundingBoxOfRect } from '../camera';
import { sheetSizeFor, type SheetOutline } from '../../sheet/outline';
import { kolejnoscRozstrzygania, planSceneLabels, rangaTozsamosci, type LabelRenderPlan } from '../labelLegibility';
import {
  czytelnyNaEkranie,
  skalaPojawieniaSie,
  klasaInformacjiEtykiety,
  PASMO_HISTEREZY_CZYTELNOSCI,
} from '../gestoscInformacji';
import type { OwnedLabel, OwnerKind } from '../../layout/labels';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX, type LabelClass } from '../../core/text';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnm(relative: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, relative), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}

const GPZ_ENM = loadEnm('../../scene/__tests__/fixtures/gpzFeeder.enm.json');
const WIELOSTACYJNA_ENM = loadEnm('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');

/** Arkusz syntetyczny — obrys nie ingeruje w testy osi skali. */
const DUZY_ARKUSZ: SheetOutline = { width: 100_000_000, height: 100_000_000 };
/** Slot w środku arkusza — pismo stałego rozmiaru ekranowego przy `MIN_SCALE` ma
 *  tysiące j.św. i rośnie od kotwicy; krawędź arkusza nie jest przedmiotem testu. */
const SLOT_OFFSET = 50_000_000;

function etykieta(p: {
  readonly ownerRef: string;
  readonly ownerKind: OwnerKind;
  readonly labelClass: LabelClass;
  readonly labelRole: 'tozsamosc' | 'dane';
  readonly text?: string;
  readonly x?: number;
  readonly y?: number;
  readonly unresolved?: boolean;
}): OwnedLabel {
  return {
    ownerRef: p.ownerRef,
    ownerKind: p.ownerKind,
    labelClass: p.labelClass,
    labelRole: p.labelRole,
    text: p.text ?? p.ownerRef,
    slotIndex: 1,
    rect: { x: SLOT_OFFSET + (p.x ?? 0), y: SLOT_OFFSET + (p.y ?? 0), width: 400, height: 20 },
    ...(p.unresolved !== undefined ? { unresolved: p.unresolved } : {}),
  };
}

/** Każdy rodzaj właściciela napisu sceny z klasą typograficzną realnego wytwórcy. */
const RODZAJE: readonly { readonly kind: OwnerKind; readonly cls: LabelClass }[] = [
  { kind: 'station-name', cls: 't1' },
  { kind: 'busbar-voltage', cls: 't2' },
  { kind: 'apparatus', cls: 't4' },
  { kind: 'field-role', cls: 't3' },
  { kind: 'der', cls: 't2' },
  { kind: 'no-point', cls: 't3' },
  { kind: 'branch-point', cls: 't3' },
  { kind: 'lacznik-toru', cls: 't3' },
  { kind: 'segment-span', cls: 't2' },
  { kind: 'segment-lateral', cls: 't2' },
  { kind: 'segment-endpoint', cls: 't4' },
  { kind: 'port-caption', cls: 't3' },
  { kind: 'protection', cls: 't4' },
];

const DRABINA_SKAL: readonly number[] = [MIN_SCALE, 0.1, 0.3, 9 / 13, 0.6, 9 / 11, 0.9, 1, 9 / 8, 1.2, 2, MAX_SCALE];

function indeksy(plan: LabelRenderPlan): { drawn: Set<number>; podpowiedz: Set<number> } {
  return {
    drawn: new Set(plan.drawn.map((p) => p.index)),
    podpowiedz: new Set(plan.tozsamosciWPodpowiedzi.map((t) => t.index)),
  };
}

describe('R3 — klasa informacji wyprowadzona z danych etykiety, nigdy z treści', () => {
  it.each(RODZAJE)('$kind: rola tożsamości ⇒ tożsamość; dane t2 ⇒ parametry; dane t3/t4 ⇒ oznaczenia', ({ kind, cls }) => {
    expect(klasaInformacjiEtykiety(etykieta({ ownerRef: 'a', ownerKind: kind, labelClass: cls, labelRole: 'tozsamosc' }))).toBe('tozsamosc');
    expect(klasaInformacjiEtykiety(etykieta({ ownerRef: 'a', ownerKind: kind, labelClass: cls, labelRole: 'dane' }))).toBe(
      cls === 't2' ? 'parametry' : 'oznaczenia',
    );
  });

  it.each(RODZAJE)('$kind: element nierozwiązywalny jest tożsamością przy każdej roli', ({ kind, cls }) => {
    for (const labelRole of ['tozsamosc', 'dane'] as const) {
      expect(klasaInformacjiEtykiety(etykieta({ ownerRef: 'a', ownerKind: kind, labelClass: cls, labelRole, unresolved: true }))).toBe(
        'tozsamosc',
      );
    }
  });

  it('treść napisu nie zmienia klasy (ten sam rodzaj, dwie treści)', () => {
    const a = etykieta({ ownerRef: 'a', ownerKind: 'segment-span', labelClass: 't2', labelRole: 'dane', text: 'T1 · 15 kV' });
    const b = { ...a, text: 'XRUHAKXS 3×120 · 1,2 km' };
    expect(klasaInformacjiEtykiety(a)).toBe(klasaInformacjiEtykiety(b));
  });
});

describe('R3 — próg czytelności z histerezą (rozmiar ekranowy, nie skala)', () => {
  const prog = MIN_READABLE_LABEL_SCREEN_PX;
  it.each([8, 9, 11, 13])('pismo %i j.św.: bez historii widoczny dokładnie od 9 px ekranu', (h) => {
    expect(czytelnyNaEkranie(h, prog / h)).toBe(true);
    expect(czytelnyNaEkranie(h, (prog / h) * 0.999)).toBe(false);
  });

  it.each([8, 9, 11, 13])('pismo %i j.św.: widoczny trzyma się do −10 %, niewidoczny wraca od +10 %', (h) => {
    const dol = (prog * (1 - PASMO_HISTEREZY_CZYTELNOSCI)) / h;
    const gora = (prog * (1 + PASMO_HISTEREZY_CZYTELNOSCI)) / h;
    const srodek = (prog * 0.95) / h;
    expect(czytelnyNaEkranie(h, srodek, true)).toBe(true);
    expect(czytelnyNaEkranie(h, dol * 0.999, true)).toBe(false);
    expect(czytelnyNaEkranie(h, srodek, false)).toBe(false);
    expect(czytelnyNaEkranie(h, (prog * 1.05) / h, false)).toBe(false);
    expect(czytelnyNaEkranie(h, gora, false)).toBe(true);
    // Para predykatów: skala pojawienia się (`skalaPojawieniaSie`, z niej testy dojeżdżają do
    // wyników) jest DOKŁADNIE progiem wejścia w widoczność.
    expect(skalaPojawieniaSie(h)).toBeCloseTo(gora, 12);
    expect(czytelnyNaEkranie(h, skalaPojawieniaSie(h), false)).toBe(true);
    expect(czytelnyNaEkranie(h, skalaPojawieniaSie(h) * (1 - 1e-12), false)).toBe(false);
  });

  it('wyniki (pismo t4) pojawiają się dopiero powyżej skali czytania — 8 px nominalnie < 9 px progu', () => {
    expect(skalaPojawieniaSie(LABEL_TYPOGRAPHY.t4.fontSize)).toBeCloseTo(1.2375, 12);
    expect(czytelnyNaEkranie(LABEL_TYPOGRAPHY.t4.fontSize, 1, false)).toBe(false);
  });

  it('skala niewiarygodna (0, NaN, ujemna) nie ukrywa niczego', () => {
    for (const s of [0, Number.NaN, -1]) expect(czytelnyNaEkranie(8, s)).toBe(true);
  });
});

describe('R3 × R4 — iloczyn {rodzaj × klasa × skala} → widoczność w planie', () => {
  for (const { kind, cls } of RODZAJE) {
    it(`${kind} (${cls}): dane widoczne wtedy i tylko wtedy, gdy pismo naturalne ma ≥ 9 px ekranu`, () => {
      const naturalny = LABEL_TYPOGRAPHY[cls].fontSize;
      for (const scale of DRABINA_SKAL) {
        const plan = planSceneLabels(
          [etykieta({ ownerRef: `d/${kind}`, ownerKind: kind, labelClass: cls, labelRole: 'dane' })],
          [],
          scale,
          DUZY_ARKUSZ,
        );
        expect(plan.drawn.length === 1, `@${scale}`).toBe(naturalny * scale >= MIN_READABLE_LABEL_SCREEN_PX - 1e-9);
        // Dane nigdy nie trafiają do podpowiedzi tożsamości — brak danych to reguła gęstości.
        expect(plan.tozsamosciWPodpowiedzi).toEqual([]);
      }
    });

    it(`${kind} (${cls}): tożsamość NIE znika z powodu skali — narysowana ≥ 9 px w całości albo w podpowiedzi`, () => {
      for (const unresolved of [false, true]) {
        for (const scale of DRABINA_SKAL) {
          const label = etykieta({
            ownerRef: kind === 'station-name' ? 'stn/T/station#name-row-0' : `t/${kind}`,
            ownerKind: kind,
            labelClass: cls,
            labelRole: unresolved ? 'dane' : 'tozsamosc',
            text: `Nazwa długa ${kind} pole liniowe 15 kV`,
            unresolved,
          });
          const plan = planSceneLabels([label], [], scale, DUZY_ARKUSZ);
          const { drawn, podpowiedz } = indeksy(plan);
          expect(drawn.has(0) !== podpowiedz.has(0), `${kind} @${scale}: dokładnie jedno z dwóch`).toBe(true);
          if (drawn.has(0)) {
            const p = plan.drawn[0]!;
            expect(p.text, 'bez wielokropka').toBe(label.text);
            expect(p.fontSize * scale).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 1e-6);
          }
          // Ranga ≥ 2 (GPZ, stacja, sekcja) w samotności jest ZAWSZE narysowana: stały
          // rozmiar ekranowy bez sufitu proporcji.
          if (rangaTozsamosci(label) >= 2) expect(drawn.has(0), `${kind} @${scale}`).toBe(true);
        }
      }
    });
  }

  it('nazwa stacji przy MIN_SCALE ma na ekranie dokładnie 9 px (stały rozmiar ekranowy)', () => {
    const label = etykieta({ ownerRef: 'stn/S1/station#name-row-0', ownerKind: 'station-name', labelClass: 't1', labelRole: 'tozsamosc', text: 'S1 Zalesie' });
    const plan = planSceneLabels([label], [], MIN_SCALE, DUZY_ARKUSZ);
    expect(plan.drawn[0]!.fontSize * MIN_SCALE).toBeCloseTo(MIN_READABLE_LABEL_SCREEN_PX, 6);
  });
});

describe('R4 — kolizja tożsamości: ranga GPZ > stacja > sekcja > pole, remis po refie', () => {
  const gpz = etykieta({ ownerRef: 'gpz/G1/substation#name-row-0', ownerKind: 'station-name', labelClass: 't1', labelRole: 'tozsamosc', text: 'GPZ Północ' });
  const stacja = etykieta({ ownerRef: 'stn/S1/station#name-row-0', ownerKind: 'station-name', labelClass: 't1', labelRole: 'tozsamosc', text: 'S1 Zalesie' });
  const sekcja = etykieta({ ownerRef: 'szyna/B1', ownerKind: 'busbar-voltage', labelClass: 't2', labelRole: 'tozsamosc', text: '15 kV sekcja 1' });
  const pole = etykieta({ ownerRef: 'pole/A1', ownerKind: 'field-role', labelClass: 't3', labelRole: 'tozsamosc', text: 'pole liniowe L1' });
  const ranking = [gpz, stacja, sekcja, pole];

  it('ranga rośnie w kolejności pole < sekcja < stacja < GPZ, dane = 0', () => {
    expect(ranking.map(rangaTozsamosci)).toEqual([4, 3, 2, 1]);
    expect(rangaTozsamosci({ ...stacja, labelRole: 'dane' })).toBe(0);
    // Wiersze pasma nazw poza nazwą bloku (szyna nN stacji, transformator i źródło w paśmie
    // GPZ) — ranga sekcji; refy jak w scenie (`${blok}#name-row-N`, `${element}#label#name-row-0`).
    expect(rangaTozsamosci({ ...stacja, ownerRef: 'stn/S1/station#name-row-3' })).toBe(2);
    expect(rangaTozsamosci({ ...gpz, ownerRef: 'gpz/G1/transformer/001/wn_sn#label#name-row-0' })).toBe(2);
    expect(rangaTozsamosci({ ...gpz, ownerRef: 'gpz/G1/source/main#system-source-label#name-row-0' })).toBe(2);
  });

  // Skala, przy której wszystkie cztery są powiększane (rozstrzyganie kolizji działa).
  const SKALA = 0.4;
  for (let i = 0; i < ranking.length; i++) {
    for (let j = 0; j < ranking.length; j++) {
      if (i === j) continue;
      it(`para ${ranking[i]!.ownerRef} × ${ranking[j]!.ownerRef} w tym samym miejscu: wygrywa wyższa ranga, przegrana → podpowiedź`, () => {
        const a = ranking[i]!;
        const b = ranking[j]!;
        const plan = planSceneLabels([a, b], [], SKALA, DUZY_ARKUSZ);
        const wygrany = i < j ? 0 : 1;
        expect(plan.drawn.map((p) => p.index)).toContain(wygrany);
        const przegrany = 1 - wygrany;
        const narysowanyPrzegrany = plan.drawn.some((p) => p.index === przegrany);
        // Przegrany może stanąć po stronie przeciwnej kotwicy; jeśli nie — trafia do podpowiedzi.
        expect(narysowanyPrzegrany || plan.tozsamosciWPodpowiedzi.some((t) => t.index === przegrany)).toBe(true);
        // Narysowane nigdy się nie nakładają.
        if (narysowanyPrzegrany) {
          const [r1, r2] = plan.drawn.map((p) => p.rect);
          const zachodza = r1!.x < r2!.x + r2!.width && r2!.x < r1!.x + r1!.width && r1!.y < r2!.y + r2!.height && r2!.y < r1!.y + r1!.height;
          expect(zachodza).toBe(false);
        }
      });
    }
  }

  it('remis rangi: wygrywa mniejszy ref, niezależnie od kolejności wejścia', () => {
    const s1 = { ...stacja, ownerRef: 'stn/A/station#name-row-0', text: 'Stacja A' };
    const s2 = { ...stacja, ownerRef: 'stn/B/station#name-row-0', text: 'Stacja B' };
    for (const wejscie of [
      [s1, s2],
      [s2, s1],
    ]) {
      const plan = planSceneLabels(wejscie, [], SKALA, DUZY_ARKUSZ);
      const refy = plan.drawn.map((p) => p.label.ownerRef);
      expect(refy).toContain('stn/A/station#name-row-0');
    }
    expect(kolejnoscRozstrzygania({ label: s1, index: 1 }, { label: s2, index: 0 })).toBeLessThan(0);
  });

  it('tożsamość rangi pola i dane dzielą poziom — rozstrzyga priorytet rodzaju (numer zabezpieczenia przed oznacznikiem aparatu)', () => {
    const numer = etykieta({ ownerRef: 'pole/A1#protection', ownerKind: 'protection', labelClass: 't4', labelRole: 'dane', text: '52' });
    const oznacznik = etykieta({ ownerRef: 'pole/A1#apparatus', ownerKind: 'apparatus', labelClass: 't4', labelRole: 'tozsamosc', text: 'Q1' });
    expect(kolejnoscRozstrzygania({ label: numer, index: 1 }, { label: oznacznik, index: 0 })).toBeLessThan(0);
    // …a nazwa stacji wyprzedza każdy napis rangi pola niezależnie od priorytetu rodzaju.
    expect(kolejnoscRozstrzygania({ label: stacja, index: 1 }, { label: numer, index: 0 })).toBeLessThan(0);
    expect(kolejnoscRozstrzygania({ label: sekcja, index: 1 }, { label: numer, index: 0 })).toBeLessThan(0);
  });

  it('porządek rozstrzygania jest liniowy: antysymetryczny i zwrotny tylko dla tej samej etykiety', () => {
    const wszystkie = ranking.map((label, index) => ({ label, index }));
    for (const a of wszystkie) {
      for (const b of wszystkie) {
        const ab = kolejnoscRozstrzygania(a, b);
        const ba = kolejnoscRozstrzygania(b, a);
        expect(ab === 0).toBe(a === b);
        if (a !== b) expect(Math.sign(ab)).toBe(-Math.sign(ba));
      }
    }
  });
});

describe('R4 — sieci referencyjne przy dopasowaniu całej sieci', () => {
  const KADR = { width: 1800, height: 1100 };
  for (const [nazwa, enm] of [
    ['GPZ z odejściami', GPZ_ENM],
    ['sieć 52 stacji', WIELOSTACYJNA_ENM],
  ] as const) {
    it(`${nazwa}: każda tożsamość narysowana w całości (≥ 9 px) albo w podpowiedzi; zero kolizji`, () => {
      const scene = buildSceneV3(enm);
      const sheet = sheetSizeFor(scene);
      const skala = skalaMinimalna(boundingBoxOfRect({ x: 0, y: 0, width: sheet.width, height: sheet.height }), KADR);
      const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), skala, sheet);
      const { drawn, podpowiedz } = indeksy(plan);
      scene.labels.forEach((label, index) => {
        if (klasaInformacjiEtykiety(label) !== 'tozsamosc') return;
        expect(drawn.has(index) !== podpowiedz.has(index), `${label.ownerRef}: ${label.text}`).toBe(true);
      });
      for (const p of plan.drawn) {
        if (klasaInformacjiEtykiety(p.label) !== 'tozsamosc') continue;
        expect(p.text, p.label.ownerRef).toBe(p.label.text);
        expect(p.fontSize * skala).toBeGreaterThanOrEqual(MIN_READABLE_LABEL_SCREEN_PX - 1e-6);
      }
      // Nazwy GPZ i stacji (ranga ≥ 3) — orientacja na widoku całej sieci — wszystkie narysowane.
      const nazwyBlokow = scene.labels.map((l, i) => [l, i] as const).filter(([l]) => rangaTozsamosci(l) >= 3);
      expect(nazwyBlokow.length).toBeGreaterThan(0);
      expect(nazwyBlokow.filter(([, i]) => !drawn.has(i)).map(([l]) => l.text)).toEqual([]);
    });
  }

  it('determinizm: klony tych samych danych dają identyczny plan (narysowane i podpowiedzi)', () => {
    const scene = buildSceneV3(GPZ_ENM);
    const obstacles = sceneObstacleRects(scene);
    const sheet = sheetSizeFor(scene);
    const odcisk = (plan: LabelRenderPlan) => ({
      d: plan.drawn.map((p) => [p.index, p.text, p.rect, p.fontSize]),
      t: plan.tozsamosciWPodpowiedzi.map((t) => t.index),
    });
    const a = planSceneLabels(JSON.parse(JSON.stringify(scene.labels)) as OwnedLabel[], obstacles, 0.3, sheet);
    const b = planSceneLabels(JSON.parse(JSON.stringify(scene.labels)) as OwnedLabel[], obstacles, 0.3, sheet);
    expect(odcisk(a)).toEqual(odcisk(b));
  });
});
