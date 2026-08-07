/**
 * PROPORCJE RYSUNKU — wyrocznie LICZBOWE (karta PROPORCJE, zgłoszenie
 * właściciela 2026-08-07 „brak proporcji, grubości"; zrzut
 * `docs/sld/audyt-2026-08/b2-po-ciemny.png`).
 *
 * CO ORZEKA. Rysunek wykonawczy ma dwie proporcje, których nikt nie pilnował
 * liczbą:
 *   (1) NAPIS : OBIEKT, KTÓRY OPISUJE — oznacznik aparatu ma być mniejszy albo
 *       porównywalny z symbolem, nigdy 3–4× większy (IEC 60617 / rysunek
 *       jednokreskowy SN). S9-7/8 zamknęły DOLNĄ granicę czytelności („żaden
 *       napis < 9 px ekranu"), ale GÓRNEJ nie postawił nikt: powiększenie
 *       awaryjne przypina napis do 9 px, podczas gdy rysunek kurczy się razem
 *       z kamerą, więc stosunek rośnie jak 1/skala.
 *   (2) HIERARCHIA GRUBOŚCI — rośnie od aparatu przez odgałęzienie i
 *       magistralę do szyny, ale aparat MUSI mieć kreskę rozpoznawalną. S9-8
 *       dała podłogę ekranową TOROM; aparatura z tej hierarchii wypadła, więc
 *       przy oddaleniu szyna była 15,7× (a przy dolnym krańcu 41,7×) grubsza
 *       od kreski aparatu zamiast projektowych 3,33×.
 *
 * ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (reguła KLASA §2):
 *   · {klasa typografii t1/t2/t3/t4} × {poziom szczegółu L0/L1/L2}
 *     × {skala kamery: mała / dopasowanie / duża},
 *   · {rodzaj kreski: aparat / odgałęzienie / magistrala / szyna} × {skala}.
 * Sam „oznacznik Q1 na L2 przy 1,380" nie wystarcza — defekt siedział w
 * REŻIMIE POWIĘKSZANIA, czyli tam, gdzie karta go nie nazwała.
 *
 * WYROCZNIE SĄ LICZBAMI z dokumentu karty, nie „wygląda lepiej".
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  enlargedFontSizeWithinProportion,
  LABEL_TYPOGRAPHY,
  MIN_READABLE_LABEL_SCREEN_PX,
  proportionCutoffScale,
  type LabelClass,
} from '../text';
import {
  planSceneLabels,
  plannedLabelsAboveProportionCeiling,
  plannedLabelsBelowScreenFloor,
} from '../../canvas/labelLegibility';
import {
  APPARATUS_STROKE_WIDTH,
  apparatusStrokeWidthForScale,
  MIN_TRUNK_STROKE_SCREEN_PX,
  SEGMENT_STROKE_WIDTH,
  segmentStrokeWidthForScale,
  strokeScaleFactor,
} from '../../compose/preview';
import { MAX_SCALE, MIN_SCALE } from '../../canvas/camera';
import { buildSceneV3, sceneObstacleRects, type SceneLod } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { SYMBOL_GLYPHS, V3_STROKE_APPARATUS } from '../../symbols/glyphs';
import { SldCanvasV3 } from '../../canvas/SldCanvasV3';
import { fieldCaptionAt } from '../../compose/directions';
import { bayColumnRequiredWidth } from '../../layout/measure';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const FIXTURA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
/** REALNA sieć 53 stacji — ta sama, na której stoi runner odbioru
 *  `accept:sld-v3` i pomiar karty (`scripts/pomiar_proporcje.tsx`). */
const SIEC = JSON.parse(readFileSync(FIXTURA, 'utf8')).enm as EnergyNetworkModel;

const KLASY: readonly LabelClass[] = ['t1', 't2', 't3', 't4'];
const LODY: readonly SceneLod[] = [0, 1, 2];
/** Skale: dolny kraniec · przegląd · dopasowanie typowej sieci · praca · zoom
 *  roboczy · górny kraniec. Iloczyn liczony z KAŻDĄ z nich, żeby „defekt gaśnie
 *  przy 1:1" i „defekt tylko przy oddaleniu" nie miały gdzie się schować. */
const SKALE: readonly number[] = [MIN_SCALE, 0.1, 0.14, 0.3, 0.6, 1, 1.38, 4, MAX_SCALE];

/**
 * PROPORCJA DOCELOWA §1 karty: napis nie może być wyższy niż 1,5× NAJMNIEJSZEGO
 * obiektu, który dana klasa typografii opisuje [j.św.]. Gabaryty z
 * `symbols/defs.ts`: zwinięty blok stacji 48 (t1), symbol DER 32 (t2), symbol
 * aparatu 24 (t3/t4). Stąd wyprowadzono sufity `LABEL_TYPOGRAPHY[*].maxEnlargement`.
 */
const NAJMNIEJSZY_OPISYWANY: Readonly<Record<LabelClass, number>> = {
  t1: 48,
  t2: 32,
  t3: 24,
  t4: 24,
};
/**
 * DWA PROGI (patrz `LabelTypography.maxEnlargement`): napis opisujący APARAT
 * albo źródło ma być „mniejszy albo porównywalny" (1,5) — to klasa zgłoszenia
 * właściciela; napis opisujący BLOK stacji może być do 2,44 jego NAJMNIEJSZEJ
 * reprezentacji (glif zwinięty 48 j.św.), bo blok jest KONTENEREM o śladzie
 * kilkuset jednostek, a jego nazwa jest jedynym napisem, który KD-11 każe
 * utrzymać na przeglądzie. Oba progi są WYRAŹNIE poniżej „3–4×" ze zgłoszenia.
 */
const MAX_STOSUNEK_NAPIS_OBIEKT: Readonly<Record<LabelClass, number>> = {
  t1: 2.5,
  t2: 1.5,
  t3: 1.5,
  t4: 1.5,
};

describe('PROPORCJE §1 — sufit napis:obiekt (klasa × skala)', () => {
  it('kanon: sufity klas wyprowadzone z gabarytów glifów dają stosunek ≤ 1,5', () => {
    for (const cls of KLASY) {
      const najwiekszePismo = LABEL_TYPOGRAPHY[cls].fontSize * LABEL_TYPOGRAPHY[cls].maxEnlargement;
      expect(najwiekszePismo / NAJMNIEJSZY_OPISYWANY[cls], `${cls}`).toBeLessThanOrEqual(
        MAX_STOSUNEK_NAPIS_OBIEKT[cls] + 1e-9,
      );
    }
  });

  it('ILOCZYN {klasa} × {skala}: rozmiar albo spełnia OBIE granice, albo nie ma go wcale', () => {
    for (const cls of KLASY) {
      const { fontSize, maxEnlargement } = LABEL_TYPOGRAPHY[cls];
      for (const scale of SKALE) {
        const rozmiar = enlargedFontSizeWithinProportion(cls, scale);
        if (rozmiar === null) {
          // Brak rozmiaru wolno zwrócić WYŁĄCZNIE poniżej skali granicznej —
          // inaczej funkcja odbierałaby napisy, które da się narysować.
          expect(scale, `${cls} @${scale}`).toBeLessThan(proportionCutoffScale(cls));
          continue;
        }
        expect(rozmiar * scale, `dolna granica ${cls} @${scale}`).toBeGreaterThanOrEqual(
          MIN_READABLE_LABEL_SCREEN_PX - 1e-9,
        );
        expect(rozmiar / fontSize, `sufit ${cls} @${scale}`).toBeLessThanOrEqual(maxEnlargement + 1e-9);
        expect(rozmiar / NAJMNIEJSZY_OPISYWANY[cls], `napis:obiekt ${cls} @${scale}`).toBeLessThanOrEqual(
          MAX_STOSUNEK_NAPIS_OBIEKT[cls] + 1e-9,
        );
      }
    }
  });

  it('GRANICA PARY jest jedna: dokładnie na skali granicznej napis JEST, ułamek niżej go NIE MA', () => {
    for (const cls of KLASY) {
      const graniczna = proportionCutoffScale(cls);
      const naGranicy = enlargedFontSizeWithinProportion(cls, graniczna);
      expect(naGranicy, `${cls} @granica`).not.toBeNull();
      expect(naGranicy! / LABEL_TYPOGRAPHY[cls].fontSize).toBeCloseTo(LABEL_TYPOGRAPHY[cls].maxEnlargement, 9);
      expect(enlargedFontSizeWithinProportion(cls, graniczna * 0.99), `${cls} poniżej granicy`).toBeNull();
    }
  });

  it('powyżej progu czytelności rozmiar jest NATURALNY — sufit nie rusza pracy z bliska', () => {
    for (const cls of KLASY) {
      const naturalny = LABEL_TYPOGRAPHY[cls].fontSize;
      // Próg czytelności jest RÓŻNY per klasa (`MIN_READABLE / fontSize`):
      // t4 (8 j.św.) potrzebuje skali 1,125, t1 (13) już 0,692. Test liczy go,
      // zamiast zakładać jedną skalę dla wszystkich — inaczej „t4 przy 1,0 jest
      // jeszcze powiększane" wyglądałoby na defekt, a jest kanonem S9-7/8.
      const prog = MIN_READABLE_LABEL_SCREEN_PX / naturalny;
      for (const mnoznik of [1, 1.2, 4, MAX_SCALE / prog]) {
        const scale = Math.min(prog * mnoznik, MAX_SCALE);
        expect(enlargedFontSizeWithinProportion(cls, scale), `${cls} @${scale}`).toBe(naturalny);
      }
    }
  });

  it('skala niewiarygodna (0/ujemna/NaN) NIE odbiera napisu — brak pomiaru nie jest dowodem', () => {
    for (const cls of KLASY) {
      for (const zla of [0, -1, Number.NaN]) {
        expect(enlargedFontSizeWithinProportion(cls, zla), `${cls} @${zla}`).toBe(LABEL_TYPOGRAPHY[cls].fontSize);
      }
    }
  });
});

describe('PROPORCJE §1 — plan renderu na REALNEJ scenie (poziom szczegółu × skala)', () => {
  const enm = SIEC;
  const sceny = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;

  it('ILOCZYN {LOD} × {skala}: żaden NARYSOWANY napis nie łamie ani podłogi, ani sufitu', () => {
    for (const lod of LODY) {
      const scene = sceny[lod];
      const przeszkody = sceneObstacleRects(scene);
      for (const scale of SKALE) {
        const plan = planSceneLabels(scene.labels, przeszkody, scale);
        expect(
          plannedLabelsBelowScreenFloor(plan, scale, MIN_READABLE_LABEL_SCREEN_PX),
          `podłoga L${lod} @${scale}`,
        ).toEqual([]);
        expect(plannedLabelsAboveProportionCeiling(plan, scale), `sufit L${lod} @${scale}`).toEqual([]);
      }
    }
  });

  it('napis usunięty przez sufit jest POLICZONY, nie zgubiony po cichu', () => {
    const scene = sceny[2];
    const przeszkody = sceneObstacleRects(scene);
    const plan = planSceneLabels(scene.labels, przeszkody, MIN_SCALE);
    const tozsamosci = scene.labels.filter((l) => l.labelRole === 'tozsamosc');
    expect(tozsamosci.length).toBeGreaterThan(0);
    // Przy dolnym krańcu zoomu ŻADNEJ tożsamości nie da się narysować
    // proporcjonalnie — wszystkie muszą trafić do zbioru jawnego (wskaźnik
    // „Ukryto N opisów"), a nie zniknąć bez śladu.
    expect(plan.drawn.filter((p) => p.label.labelRole === 'tozsamosc')).toEqual([]);
    expect(plan.droppedIdentity.length).toBe(tozsamosci.length);
  });

  it('ZERO REGRESJI KD-11: przy DOPASOWANIU widoku tożsamość stacji nadal jest na rysunku', () => {
    // Skala dopasowania sieci wielostacyjnej leży w okolicy 0,14 (pomiar karty
    // na fixturze 53 stacji: 0,1407) — powyżej granicy klasy t1, więc nazwy
    // stacji MUSZĄ przetrwać. Gdyby sufit t1 zjechał poniżej tej wartości,
    // kadr „Dopasuj widok" straciłby wszystkie podpisy — dokładnie regresja,
    // którą naprawiała KD-11.
    // Pasmo skal dopasowania sieci 53 stacji w realnych rozmiarach okna:
    // 0,108 (okno 1000×640) … 0,141 (1400×900). Granica t1 MUSI leżeć PONIŻEJ
    // całego pasma, inaczej obecność nazw stacji zależałaby od rozmiaru okna.
    // Pasmo skal dopasowania sieci 53 stacji na REALNYCH kanwach: 0,101
    // (1322×696, poziom L2 — zmierzone renderem produkcyjnym) … 0,141
    // (1400×900, L0). Granica t1 MUSI leżeć poniżej CAŁEGO pasma z zapasem,
    // inaczej obecność nazw stacji zależałaby od rozmiaru okna albo od jednego
    // pola dołożonego do jednej rozdzielnicy.
    expect(proportionCutoffScale('t1')).toBeLessThan(0.09);
    const scene = sceny[0];
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 0.101);
    const nazwy = plan.drawn.filter((p) => p.label.labelRole === 'tozsamosc');
    expect(nazwy.length).toBeGreaterThan(0);
  });

  it('DOWÓD, że defekt był realny: bez sufitu napis byłby 3,75× wyższy od zwiniętego bloku stacji', () => {
    // Stan PRZED (`minReadableFontSize` bez sufitu) przy MIN_SCALE: pismo t1
    // urosłoby do 9/0,05 = 180 j.św. obok glifu stacji 48 j.św.
    const bezSufitu = MIN_READABLE_LABEL_SCREEN_PX / MIN_SCALE;
    expect(bezSufitu / NAJMNIEJSZY_OPISYWANY.t1).toBeCloseTo(3.75, 9);
    expect(bezSufitu / NAJMNIEJSZY_OPISYWANY.t1).toBeGreaterThan(MAX_STOSUNEK_NAPIS_OBIEKT.t1);
    // Po naprawie ta sama skala nie daje ŻADNEGO rozmiaru (napis nie powstaje).
    expect(enlargedFontSizeWithinProportion('t1', MIN_SCALE)).toBeNull();
  });
});

describe('PROPORCJE §2 — hierarchia grubości OBEJMUJE APARATURĘ (rodzaj kreski × skala)', () => {
  /** Rangi rysunku od najcięższej do najlżejszej — z APARATEM w środku
   *  (szyna GPZ > szyna stacji > magistrala > odgałęzienie > aparat = obwód nN). */
  const DRABINA = [
    { nazwa: 'busGpz', waga: SEGMENT_STROKE_WIDTH.busGpz },
    { nazwa: 'bus', waga: SEGMENT_STROKE_WIDTH.bus },
    { nazwa: 'snTrunk', waga: SEGMENT_STROKE_WIDTH.snTrunk },
    { nazwa: 'sn', waga: SEGMENT_STROKE_WIDTH.sn },
    { nazwa: 'aparat', waga: APPARATUS_STROKE_WIDTH },
  ] as const;

  it('kanon świata: aparat leży MIĘDZY obwodem nN a odgałęzieniem (rozpoznawalny, nie dominujący)', () => {
    expect(APPARATUS_STROKE_WIDTH).toBe(V3_STROKE_APPARATUS);
    expect(APPARATUS_STROKE_WIDTH).toBeGreaterThanOrEqual(SEGMENT_STROKE_WIDTH.lv);
    expect(APPARATUS_STROKE_WIDTH).toBeLessThanOrEqual(SEGMENT_STROKE_WIDTH.sn);
    expect(APPARATUS_STROKE_WIDTH).toBeGreaterThan(SEGMENT_STROKE_WIDTH.leader);
  });

  it('ILOCZYN {ranga} × {skala}: drabina NA EKRANIE nierosnąca na KAŻDEJ skali', () => {
    for (const scale of SKALE) {
      const naEkranie = DRABINA.map((r) =>
        r.nazwa === 'aparat'
          ? apparatusStrokeWidthForScale(scale) * scale
          : segmentStrokeWidthForScale(r.nazwa, scale) * scale,
      );
      for (let i = 1; i < naEkranie.length; i++) {
        expect(naEkranie[i], `${DRABINA[i].nazwa} vs ${DRABINA[i - 1].nazwa} @${scale}`).toBeLessThan(
          naEkranie[i - 1],
        );
      }
    }
  });

  it('PROPORCJA DOCELOWA: szyna:aparat = 3,33 i magistrala:aparat = 2,00 — NA KAŻDEJ skali', () => {
    for (const scale of SKALE) {
      const aparat = apparatusStrokeWidthForScale(scale) * scale;
      expect((segmentStrokeWidthForScale('bus', scale) * scale) / aparat, `szyna @${scale}`).toBeCloseTo(
        SEGMENT_STROKE_WIDTH.bus / APPARATUS_STROKE_WIDTH,
        9,
      );
      expect((segmentStrokeWidthForScale('snTrunk', scale) * scale) / aparat, `magistrala @${scale}`).toBeCloseTo(
        SEGMENT_STROKE_WIDTH.snTrunk / APPARATUS_STROKE_WIDTH,
        9,
      );
    }
    // Wartości docelowe zapisane LICZBĄ (wyrocznia karty, nie „ładniej").
    expect(SEGMENT_STROKE_WIDTH.bus / APPARATUS_STROKE_WIDTH).toBeCloseTo(3.333333, 5);
    expect(SEGMENT_STROKE_WIDTH.snTrunk / APPARATUS_STROKE_WIDTH).toBeCloseTo(2, 9);
  });

  it('DOWÓD, że defekt był realny: bez kompensacji szyna:aparat sięgała 41,7× przy dolnym krańcu', () => {
    const stanPrzed = (scale: number) =>
      (SEGMENT_STROKE_WIDTH.bus * strokeScaleFactor(scale) * scale) / (APPARATUS_STROKE_WIDTH * scale);
    expect(stanPrzed(MIN_SCALE)).toBeCloseTo(41.666666, 4);
    expect(stanPrzed(0.1327)).toBeGreaterThan(8); // kadr „Dopasuj widok" — zgłoszenie mówiło 8–10×
    expect(stanPrzed(1.38)).toBeCloseTo(3.333333, 5); // z bliska proporcja BYŁA poprawna
  });

  it('glif rysuje kreskę PRZESKALOWANĄ, a bez propa — dokładnie jak przed kartą (parytet)', () => {
    const Glyph = SYMBOL_GLYPHS.disconnector;
    const bez = renderToStaticMarkup(<Glyph x={0} y={0} />);
    const zJeden = renderToStaticMarkup(<Glyph x={0} y={0} strokeScale={1} />);
    expect(zJeden).toBe(bez);
    const zTrzy = renderToStaticMarkup(<Glyph x={0} y={0} strokeScale={3} />);
    expect(zTrzy).not.toBe(bez);
    expect(zTrzy).toContain(`stroke-width="${V3_STROKE_APPARATUS * 3}"`);
    // Skala niewiarygodna nie zmienia rysunku (parytet z `strokeScaleFactor`).
    for (const zla of [0, -1, Number.NaN]) {
      expect(renderToStaticMarkup(<Glyph x={0} y={0} strokeScale={zla} />), `@${zla}`).toBe(bez);
    }
  });

  it('KANWA podaje glifom TĘ SAMĄ kompensację, którą stosuje do torów (drugi koniec pary)', () => {
    // PREDYKATY PARAMI: `apparatusStrokeWidthForScale` jest wejściem wyroczni,
    // ale rysunek robi KANWA — gdyby podawała glifom inny mnożnik (albo żaden),
    // wyrocznia świeciłaby na zielono przy odwróconej hierarchii na ekranie.
    // Dlatego mierzymy WPROST na wyrenderowanej kanwie: stosunek grubości
    // kreski aparatu do grubości szyny musi być TEN SAM co w tabeli rang, i to
    // przy skali, na której kompensacja realnie działa.
    const { container } = render(
      <SldCanvasV3 snapshot={SIEC} width={420} height={280} lodOverride={2} animateLodTransitions={false} />,
    );
    const kadr = container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!.split(' ');
    const skala = 420 / Number(kadr[2]);
    // Skala musi być NIŻSZA od progu gaśnięcia wzmocnienia, inaczej test nie
    // ćwiczy kompensacji (mnożnik = 1 i wszystko przechodzi trywialnie).
    expect(skala).toBeLessThan(MIN_TRUNK_STROKE_SCREEN_PX / SEGMENT_STROKE_WIDTH.snTrunk);
    const aparat = container.querySelector('[data-symbol-canon="disconnector"] line');
    expect(aparat, 'kanwa rysuje symbol odłącznika').toBeTruthy();
    expect(Number(aparat!.getAttribute('stroke-width'))).toBeCloseTo(
      apparatusStrokeWidthForScale(skala),
      6,
    );
    cleanup();
  });

  it('WNĘTRZE sylwetki skalowane RAZEM z obrysem (zwinięty blok stacji — cały rekord wag)', () => {
    const Glyph = SYMBOL_GLYPHS.stationCollapsed;
    const bez = renderToStaticMarkup(<Glyph x={0} y={0} />);
    const zDwa = renderToStaticMarkup(<Glyph x={0} y={0} strokeScale={2} />);
    // Obrys (0,5), tor (1,6) i szyna (1,2) MUSZĄ urosnąć wszystkie — glif z
    // obrysem wzmocnionym przy nietkniętym torze rozjeżdża się wewnętrznie.
    expect(bez).toContain('stroke-width="0.5"');
    expect(zDwa).toContain('stroke-width="1"');
    expect(zDwa).toContain('stroke-width="3.2"');
    expect(zDwa).toContain('stroke-width="2.4"');
  });
});

describe('PROPORCJE §3/§4 — tożsamość stacji i oznaczenie pola', () => {
  const enm = SIEC;

  it('KOD STACJI pada RAZ jako tożsamość stacji — na każdym poziomie szczegółu', () => {
    // ZAKRES WYROCZNI: etykiety, które mówią „to jest TA stacja" — pasmo nazw
    // (`station-name`) i opis sekcji (`busbar-voltage`). Poza zakresem
    // świadomie: podpis kierunku (`port-caption`, „kier. S02" — nazywa
    // SĄSIADA, do którego pole biegnie) i etykieta przęsła (`segment-span`,
    // „S07 ↔ S08 · …" — nazywa RELACJĘ). Obie niosą kod INNEJ stacji albo
    // parę stacji, więc nie są powtórzeniem tożsamości bloku.
    const NOSNIKI_TOZSAMOSCI = new Set(['station-name', 'busbar-voltage']);
    for (const lod of LODY) {
      const scene = buildSceneV3(enm, lod);
      const perBlok = new Map<string, string[]>();
      const kodBloku = new Map<string, string>();
      for (const l of scene.labels) {
        const blok = /^(stn\/[0-9a-zA-Z_-]+)/.exec(l.ownerRef)?.[1];
        if (!blok || !NOSNIKI_TOZSAMOSCI.has(l.ownerKind)) continue;
        const kod = /(?:^|\s)(S\d+)(?=\s|·|$)/.exec(l.text)?.[1];
        if (kod && !kodBloku.has(blok)) kodBloku.set(blok, kod);
        perBlok.set(blok, [...(perBlok.get(blok) ?? []), `${l.ownerKind}:"${l.text}"`]);
      }
      expect(kodBloku.size, `L${lod}: bloków z kodem`).toBeGreaterThan(0);
      for (const [blok, kod] of kodBloku) {
        const trafienia = (perBlok.get(blok) ?? []).filter((t) => t.includes(kod));
        expect(trafienia.length, `L${lod} ${blok}: ${trafienia.join(' + ')}`).toBe(1);
      }
    }
  });

  it('OPISY PÓL w jednej rozdzielni są PARAMI RÓŻNE (kontekst dla powtarzalnych Q/QE/T)', () => {
    for (const lod of LODY) {
      const scene = buildSceneV3(enm, lod);
      const perBlok = new Map<string, string[]>();
      for (const l of scene.labels) {
        if (l.ownerKind !== 'field-role') continue;
        const blok = /^(stn\/[0-9a-zA-Z_-]+|gpz\/[0-9a-zA-Z_-]+)/.exec(l.ownerRef)?.[1];
        if (!blok) continue;
        const lista = perBlok.get(blok) ?? [];
        lista.push(l.text);
        perBlok.set(blok, lista);
      }
      for (const [blok, opisy] of perBlok) {
        expect(new Set(opisy).size, `L${lod} ${blok}: ${opisy.join(' | ')}`).toBe(opisy.length);
      }
    }
  });

  it('oznacznik pola jest CZŁONEM PIERWSZYM (przeżywa skracanie) i liczony per klasa roli', () => {
    const pola = [
      { bayRef: 'x/0', fieldRole: 'RMU_LINE', designation: '', hasMissingRequiredDevice: false },
      { bayRef: 'x/1', fieldRole: 'RMU_LINE', designation: '', hasMissingRequiredDevice: false },
      { bayRef: 'x/2', fieldRole: 'RMU_TRANSFORMER', designation: '', hasMissingRequiredDevice: false },
      { bayRef: 'x/3', fieldRole: 'RMU_LINE', designation: '', hasMissingRequiredDevice: false },
    ] as unknown as Parameters<typeof fieldCaptionAt>[0];
    expect(fieldCaptionAt(pola, 0)).toBe('F01 · liniowe');
    expect(fieldCaptionAt(pola, 1)).toBe('F02 · liniowe');
    // Licznik pola transformatorowego jest ODRĘBNY — wstawienie TR nie
    // przenumerowuje pól liniowych.
    expect(fieldCaptionAt(pola, 2)).toBe('FT1 · transformatorowe');
    expect(fieldCaptionAt(pola, 3)).toBe('F03 · liniowe');
  });

  it('REZERWACJA szerokości kolumny liczona z TEGO SAMEGO podpisu co rysunek (measure↔compose)', () => {
    const pola = [
      { bayRef: 'x/0', fieldRole: 'RMU_LINE', designation: '', hasMissingRequiredDevice: false },
      { bayRef: 'x/1', fieldRole: 'RMU_TRANSFORMER', designation: '', hasMissingRequiredDevice: false },
    ] as unknown as Parameters<typeof bayColumnRequiredWidth>[0];
    // Rezerwacja MUSI pomieścić realny podpis: gdyby measure liczyło samą rolę
    // („liniowe"), sidecar wszedłby w kolumnę sąsiada o różnicę oznacznika.
    for (let i = 0; i < pola.length; i++) {
      const szerokosc = bayColumnRequiredWidth(pola, i, undefined, null);
      const podpis = fieldCaptionAt(pola, i);
      const gabaryt = SYMBOL_DEFS.loadBreakSwitch.width;
      expect(szerokosc, `pole ${i} („${podpis}")`).toBeGreaterThan(gabaryt + podpis.length * 9 * 0.62);
    }
  });
});
