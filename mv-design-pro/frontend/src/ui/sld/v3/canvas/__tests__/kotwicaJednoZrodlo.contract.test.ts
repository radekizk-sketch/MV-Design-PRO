/**
 * KARTA KLIK-ETYKIETA-KOTWICA — WYROCZNIA „JEDNO ORZECZENIE O KLIKNIĘTYM OBIEKCIE".
 *
 * ---------------------------------------------------------------------------
 * PO CO (pomiar, nie lektura)
 * ---------------------------------------------------------------------------
 * Na kliknięty obiekt kanwy działały TRZY niezależnie pisane odwzorowania:
 *  1. `hitAreas.LABEL_OWNER_ELEMENT_KIND` — `OwnerKind` napisu → kategoria
 *     rysunkowa (trafienie w etykietę dostawało z niej `elementKind`);
 *  2. `canvasMenuSubject.resolveCanvasMenuSubject` — `ownerRef` → kotwica
 *     rozstrzygnięta W MODELU;
 *  3. lokalna tabela `ELEMENT_KIND_KOTWICY` w `SldCanvasV3Workspace` — kotwica
 *     → z powrotem kategoria rysunkowa.
 * (1) i złożenie (2∘3) mają TĘ SAMĄ przeciwdziedzinę i opisują TEN SAM obiekt.
 * Pomiar na sieci referencyjnej (52 stacje, LOD 0/1/2): rozjazd na 62 z 1084
 * etykiet LOD2 — 54 napisy napięcia szyny dostawały menu i szufladę STACJI
 * (z pozycją „Usuń stację"), 4 napisy transformatora i 3 napisy źródła też.
 *
 * ---------------------------------------------------------------------------
 * CO PILNUJE TEN PLIK
 * ---------------------------------------------------------------------------
 * A. UCHWYT NIE AWANSUJE DO SWOJEGO KONTENERA — napis, który nie mówi o stacji,
 *    nie może rozstrzygnąć się na stację (to jest dokładnie ta klasa defektu).
 * B. INWENTARZ ROZJAZDÓW deklaracja↔kotwica jest ZAMKNIĘTY i uzasadniony —
 *    nowy rodzaj rozjazdu wywala test, zamiast cicho wejść do produkcji.
 * C. KONTROLA CZUŁOŚCI — wyrocznia A odtworzona na KOPII wejścia sprzed naprawy
 *    MUSI paść. Test, który przechodzi też przed naprawą, nie jest dowodem.
 * D. ILOCZYN CECH — pokrycie {klasa trafienia} × {rodzaj kotwicy} × {LOD}.
 * E. DEKLARACJE PRZYPIĘTE — każde mocne zdanie zostawione w nagłówkach
 *    (`hitAreas`, `canvasMenuSubject`, §16-v3 w `SldCanvasV3Workspace`) ma tu
 *    swój test. Obietnica bez pokrycia jest groźniejsza niż sam defekt.
 *
 * Wyrocznia liczy meta kliku TĄ SAMĄ drogą, którą składa je render
 * (`SldCanvasV3.klikMeta`): `LABEL_OWNER_ELEMENT_KIND` + WSPÓŁDZIELONE
 * `buildKanonicznyRefSzynyWgBazy`/`kanonicznyRefSzynyUchwytu`. Gdyby wyrocznia
 * liczyła kanoniczny ref własnym kodem, byłaby czwartym niezależnym orzeczeniem
 * o tym samym obiekcie — czyli tą samą pomyłką, którą bada.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../../scene/buildScene';
import { SLD_MENU_REGISTRY } from '../../../v2/command/SldCommandService';
import { LABEL_OWNER_ELEMENT_KIND, HIT_OBJECT_CLASSES, buildCanvasHitAreas, type CanvasHitArea } from '../hitAreas';
import {
  ELEMENT_KIND_KOTWICY,
  KLASY_UCHWYTU,
  buildCanvasModelIndex,
  buildKanonicznyRefSzynyWgBazy,
  kanonicznyRefSzynyUchwytu,
  kotwicaDlaElementKind,
  resolveCanvasMenuSubject,
  type CanvasMenuSubjectResult,
  type MenuAnchorKind,
} from '../canvasMenuSubject';
import { resultRefForSegment } from '../resultLabels';

const here = dirname(fileURLToPath(import.meta.url));
function loadEnm(relative: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, relative), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}

/** Sieć referencyjna runnera odbioru (53 stacje + GPZ) — ta, na której zmierzono
 *  cały rozjazd, oraz mniejsza sieć z rozwiniętym GPZ (drugi kształt układu). */
const SIECI: readonly { readonly nazwa: string; readonly enm: EnergyNetworkModel }[] = [
  { nazwa: 'sldSubstrate52s', enm: loadEnm('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json') },
  { nazwa: 'gpzFeeder', enm: loadEnm('../../scene/__tests__/fixtures/gpzFeeder.enm.json') },
];
const LODY: readonly SceneLod[] = [0, 1, 2];

/** ZAPADKA na pustą scenę — progi z POMIARU (`sldSubstrate52s` LOD 0/1/2 dało
 *  55/520/1084 etykiet), nie z życzenia. Wyrocznia nad pustym zbiorem przechodzi
 *  zawsze, więc bez tego nie mierzyłaby niczego. */
const MIN_ETYKIET_NA_SIEC = 50;

// ---------------------------------------------------------------------------
// Złożenie meta kliku dokładnie tak, jak robi to render (`SldCanvasV3.klikMeta`)
// ---------------------------------------------------------------------------

interface TrafienieUchwytu {
  readonly text: string;
  readonly ownerRef: string;
  readonly ownerKind: keyof typeof LABEL_OWNER_ELEMENT_KIND;
  readonly deklarowanyKind: (typeof LABEL_OWNER_ELEMENT_KIND)[keyof typeof LABEL_OWNER_ELEMENT_KIND];
  readonly wynik: CanvasMenuSubjectResult;
}

function trafieniaEtykiet(scene: SceneV3, enm: EnergyNetworkModel): readonly TrafienieUchwytu[] {
  const index = buildCanvasModelIndex(enm);
  const wgBazy = buildKanonicznyRefSzynyWgBazy(scene.segments);
  return scene.labels.map((label) => {
    const deklarowanyKind = LABEL_OWNER_ELEMENT_KIND[label.ownerKind];
    return {
      text: label.text,
      ownerRef: label.ownerRef,
      ownerKind: label.ownerKind,
      deklarowanyKind,
      wynik: resolveCanvasMenuSubject(
        {
          klasa: 'etykieta',
          ownerRef: label.ownerRef,
          elementKind: deklarowanyKind,
          busRef: kanonicznyRefSzynyUchwytu(label, wgBazy),
        },
        index,
      ),
    };
  });
}

function kotwicaWyniku(wynik: CanvasMenuSubjectResult): MenuAnchorKind | null {
  return wynik.stan === 'temat' ? wynik.temat.kotwica : null;
}

// ---------------------------------------------------------------------------
// A. UCHWYT NIE AWANSUJE DO SWOJEGO KONTENERA
// ---------------------------------------------------------------------------

describe('A — uchwyt nie awansuje do kontenera', () => {
  /**
   * Napis, który NIE mówi o stacji, nie może rozstrzygnąć się na stację.
   *
   * To jest niezależne od obu tabel zdanie o SENSIE: odcinanie sufiksów refu
   * prowadzi „w górę", więc kompozyt rysunkowy dowolnego obiektu wewnątrz stacji
   * (`…/station#busbar-voltage`, `…/substation#hv-bus-label`) skraca się do refu
   * STACJI. Bez tej bramki napis napięcia szyny dostawał menu stacji z pozycją
   * „Usuń stację" (54 etykiety LOD2) — patrz test C (kontrola czułości), który
   * odtwarza ten stan i wymaga, żeby ta asercja wtedy PADŁA.
   */
  for (const { nazwa, enm } of SIECI) {
    for (const lod of LODY) {
      it(`${nazwa} LOD ${lod}: żaden napis nie-stacyjny nie kotwiczy się na stacji`, () => {
        const scene = buildSceneV3(enm, lod);
        const trafienia = trafieniaEtykiet(scene, enm);
        const awanse = trafienia.filter(
          (t) => t.deklarowanyKind !== ELEMENT_KIND_KOTWICY.stacja && kotwicaWyniku(t.wynik) === 'stacja',
        );
        expect(
          awanse.map((t) => `${t.ownerKind} "${t.text}" ${t.ownerRef}`),
          'napis niebędący nazwą stacji rozstrzygnięty na STACJĘ = menu/szuflada cudzego obiektu',
        ).toEqual([]);
      });
    }
  }

  it('zapadka: sceny referencyjne NIE są puste (inaczej wyrocznia nie mierzy niczego)', () => {
    for (const { nazwa, enm } of SIECI) {
      const razem = LODY.reduce((suma, lod) => suma + buildSceneV3(enm, lod).labels.length, 0);
      expect(razem, `${nazwa}: zbyt mało etykiet, próg z pomiaru`).toBeGreaterThanOrEqual(MIN_ETYKIET_NA_SIEC);
    }
  });
});

// ---------------------------------------------------------------------------
// B. INWENTARZ ROZJAZDÓW deklaracja ↔ kotwica — ZAMKNIĘTY
// ---------------------------------------------------------------------------

/**
 * Rozjazdy DOPUSZCZONE, z uzasadnieniem merytorycznym. Każdy inny rozjazd jest
 * naruszeniem karty i wywala test B.
 *
 * `station-name → transformator|zrodlo` — `OwnerKind:'station-name'` obsługuje
 * wiersz pasma nazw STACJI, TRANSFORMATORA i ŹRÓDŁA (pomiar LOD2: 266 / 4 / 3),
 * więc JEDNA wartość tabeli nie może być prawdziwa dla wszystkich trzech. To
 * jest właśnie strukturalna niezdolność tej tabeli — i dlatego rodzaj obiektu
 * bierze się z KOTWICY. Rozjazd jest tu OCZEKIWANY: dowodzi, że deklaracja
 * napisu i obiekt modelu to dwie różne rzeczy, a produkcja używa drugiej.
 */
const DOZWOLONE_ROZJAZDY: ReadonlySet<string> = new Set([
  'station-name→transformator',
  'station-name→zrodlo',
]);

describe('B — inwentarz rozjazdów deklaracja↔kotwica jest zamknięty', () => {
  for (const { nazwa, enm } of SIECI) {
    for (const lod of LODY) {
      it(`${nazwa} LOD ${lod}`, () => {
        const scene = buildSceneV3(enm, lod);
        const nieoczekiwane: string[] = [];
        for (const t of trafieniaEtykiet(scene, enm)) {
          const kotwica = kotwicaWyniku(t.wynik);
          if (kotwica === null) continue; // uczciwa odmowa — nie jest rozjazdem
          if (ELEMENT_KIND_KOTWICY[kotwica] === t.deklarowanyKind) continue;
          const klucz = `${t.ownerKind}→${kotwica}`;
          if (DOZWOLONE_ROZJAZDY.has(klucz)) continue;
          nieoczekiwane.push(`${klucz} :: "${t.text}" :: ${t.ownerRef}`);
        }
        expect([...new Set(nieoczekiwane)]).toEqual([]);
      });
    }
  }

  it('napisy napięcia szyny kotwiczą się na SZYNIE (i na REALNEJ szynie, nie na sąsiedniej)', () => {
    // Sedno naprawy: 54 napisy `busbar-voltage` LOD2 kotwiczyły się na STACJI.
    // Sprawdzamy tożsamość obiektu, nie tylko rodzaj: napis „Szyna WN · 110 kV"
    // musi trafiać w szynę 110 kV, a NIE w szynę SN tej samej stacji (dawny
    // predykat `pierwsza szyna > 1 kV` dawał tu 15 kV).
    const enm = SIECI[0].enm;
    const scene = buildSceneV3(enm, 2);
    const napisy = trafieniaEtykiet(scene, enm).filter((t) => t.ownerKind === 'busbar-voltage');
    expect(napisy.length, 'fixtura musi nieść napisy napięcia szyny').toBeGreaterThan(50);
    for (const t of napisy) {
      expect(kotwicaWyniku(t.wynik), `"${t.text}" (${t.ownerRef})`).toBe('szyna');
    }
    const wn = napisy.find((t) => t.ownerRef.endsWith('#hv-bus-label'));
    expect(wn, 'fixtura niesie napis szyny WN GPZ').toBeTruthy();
    const wnRef = wn!.wynik.stan === 'temat' ? wn!.wynik.temat.modelRef : null;
    const wnSzyna = (enm.buses ?? []).find((b) => b.ref_id === wnRef);
    expect(wnSzyna?.voltage_kv, 'napis „Szyna WN · 110 kV" musi wskazywać szynę 110 kV').toBe(110);

    // Napis sekcji GPZ — do naprawy NIE kotwiczył się na niczym (R6 karty):
    // `gpz/…/section/001` nie istnieje w żadnej kolekcji modelu, a szyna sekcji
    // leży POD nim (`gpz/…/section/001/bus_sn`), więc odcinanie sufiksów „w górę"
    // nie mogło jej znaleźć. Kanał kanonicznego refu ją dostarcza.
    const sekcja = napisy.find((t) => t.ownerRef.endsWith('/section/001#label'));
    expect(sekcja, 'fixtura niesie napis sekcji GPZ').toBeTruthy();
    const sekcjaRef = sekcja!.wynik.stan === 'temat' ? sekcja!.wynik.temat.modelRef : null;
    expect((enm.buses ?? []).some((b) => b.ref_id === sekcjaRef)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. KONTROLA CZUŁOŚCI — wyrocznia A musi paść na wejściu sprzed naprawy
// ---------------------------------------------------------------------------

describe('C — kontrola czułości wyroczni', () => {
  /**
   * Odtworzenie stanu SPRZED naprawy na KOPII wejścia (produkcja nietknięta):
   *  * uchwyt nie dziedziczy kanonicznego refu szyny (`busRef: undefined`),
   *  * bramka przejścia stacja→szyna pochodzi z KLASY TRAFIENIA — a klasa
   *    `'szyna'` powstaje wyłącznie dla kresek, więc dla napisu (`'etykieta'`)
   *    przejście nie odpala. Odtwarzamy to, podając `elementKind: undefined`:
   *    bramka produkcyjna czyta dziś `elementKind`, więc jej NIE spełnia —
   *    czyli zachowuje się dokładnie jak dawna bramka dla napisu.
   * Wyrocznia A na tym wejściu MUSI wskazać awanse do kontenera.
   */
  it('bez naprawy: napisy napięcia szyny awansują do STACJI (wyrocznia A gryzie)', () => {
    const { enm } = SIECI[0];
    const scene = buildSceneV3(enm, 2);
    const index = buildCanvasModelIndex(enm);
    const awanse = scene.labels
      .filter((label) => LABEL_OWNER_ELEMENT_KIND[label.ownerKind] !== ELEMENT_KIND_KOTWICY.stacja)
      .map((label) =>
        resolveCanvasMenuSubject(
          { klasa: 'etykieta', ownerRef: label.ownerRef, elementKind: undefined, busRef: undefined },
          index,
        ),
      )
      .filter((wynik) => kotwicaWyniku(wynik) === 'stacja');
    expect(
      awanse.length,
      'gdyby ta liczba spadła do zera, wyrocznia A przechodziłaby także przed naprawą — czyli nie byłaby dowodem',
    ).toBeGreaterThan(50);
  });

  it('bez zawężenia dziedziczenia: napis nazwy GPZ przejmuje ref szyny 110 kV', () => {
    // Pułapka wykryta pomiarem w trakcie karty. Napisy pasma nazw GPZ
    // (`gpz/…/substation#name-row-N`) mają TĘ SAMĄ bazę refu, co kreska szyny WN
    // (`gpz/…/substation#hv-bus`). Dziedziczenie bez filtru „czy ten napis mówi
    // o szynie" podmieniłoby menu stacji GPZ na menu sekcji szyny 110 kV.
    const { enm } = SIECI[0];
    const scene = buildSceneV3(enm, 2);
    const wgBazy = buildKanonicznyRefSzynyWgBazy(scene.segments);
    const nazwaGpz = scene.labels.find(
      (l) => l.ownerKind === 'station-name' && l.ownerRef.startsWith('gpz/') && l.ownerRef.includes('/substation#'),
    );
    expect(nazwaGpz, 'fixtura niesie napis pasma nazw GPZ').toBeTruthy();
    const baza = nazwaGpz!.ownerRef.slice(0, nazwaGpz!.ownerRef.indexOf('#'));
    // Ta sama baza NAPRAWDĘ niesie ref szyny WN — pułapka jest realna, nie hipotetyczna.
    expect(wgBazy.get(baza)).toBeTruthy();
    // …a mimo to napis nazwy go NIE dziedziczy (filtr rodzaju napisu).
    expect(kanonicznyRefSzynyUchwytu(nazwaGpz!, wgBazy)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D. ILOCZYN CECH — {klasa trafienia} × {rodzaj kotwicy} × {LOD}
// ---------------------------------------------------------------------------

describe('D — pokrycie iloczynu cech', () => {
  /**
   * Pokrycie liczone na WSZYSTKICH obiektach kanwy (nie tylko napisach), bo klasa
   * defektu dotyczy pary „kategoria rysunkowa ↔ kotwica modelu" niezależnie od
   * tego, czym obiekt jest narysowany.
   *
   * KOMBINACJE NIEOBECNE W FIKSTURACH (uczciwie, zamiast udawanego pokrycia):
   *  * `znacznik-wyniku` × cokolwiek — znaczniki wynikowe powstają dopiero przy
   *    wgranym payloadzie wyniku (`resultLabelLayout`), a wyrocznia liczy scenę
   *    bez nakładki. Ich ŚCIEŻKA jest jednak pokryta konstrukcyjnie: należą do
   *    `KLASY_UCHWYTU` (test E), więc idą tą samą gałęzią co etykieta;
   *  * `etykieta` × `zrodlo` występuje WYŁĄCZNIE jako rozjazd `station-name`
   *    (wiersz nazwy źródła) — patrz allow-lista testu B;
   *  * `uklad-der` × `generator` i `etykieta` × `generator` są obecne tylko na
   *    `sldSubstrate52s` (fixtura `gpzFeeder` nie ma DER);
   *  * `punkt-odgalezny` i `adnotacja` mają PUSTĄ listę dozwolonych kotwic
   *    (świadomie bez menu, patrz `KOTWICE_DOZWOLONE_DLA_KLASY`) — nie mogą
   *    wystąpić z żadną kotwicą i ich nieobecność jest kontraktem, nie luką.
   */
  const WYMAGANE_PARY: readonly string[] = [
    'etykieta×stacja',
    'etykieta×szyna',
    'etykieta×transformator',
    'etykieta×pole',
    'etykieta×galaz',
    'szyna×szyna',
    'stacja×stacja',
    'tor×galaz',
    'tor×pole',
    'aparat×pole',
    'aparat×transformator',
    'transformator×pole',
    'zrodlo×zrodlo',
  ];

  function paryDlaLod(enm: EnergyNetworkModel, lod: SceneLod): ReadonlySet<string> {
    const scene = buildSceneV3(enm, lod);
    const index = buildCanvasModelIndex(enm);
    const wgBazy = buildKanonicznyRefSzynyWgBazy(scene.segments);
    const busRefOdcinka = new Map<string, string | undefined>();
    scene.segments.forEach((segment, i) => {
      busRefOdcinka.set(segment.meta?.testId ?? `sld-v3-segment-${i}`, resultRefForSegment(segment.meta));
    });
    const etykietaWgIndeksu = new Map<number, (typeof scene.labels)[number]>();
    scene.labels.forEach((label, i) => etykietaWgIndeksu.set(i, label));
    const areas: readonly CanvasHitArea[] = buildCanvasHitAreas({
      symbols: scene.symbols,
      segments: scene.segments,
      labels: scene.labels.map((label, i) => ({ index: i, label, rect: label.rect })) as never,
      resultMarkers: [],
      scale: 1,
    });
    const pary = new Set<string>();
    for (const area of areas) {
      const etykieta = area.klasa === 'etykieta'
        ? etykietaWgIndeksu.get(Number(area.testId.replace('sld-v3-label-', '')))
        : undefined;
      const wynik = resolveCanvasMenuSubject(
        {
          klasa: area.klasa,
          ownerRef: area.ownerRef,
          elementKind: area.elementKind,
          busRef: etykieta ? kanonicznyRefSzynyUchwytu(etykieta, wgBazy) : busRefOdcinka.get(area.testId),
        },
        index,
      );
      const kotwica = kotwicaWyniku(wynik);
      if (kotwica) pary.add(`${area.klasa}×${kotwica}`);
    }
    return pary;
  }

  it('wszystkie wymagane pary {klasa}×{kotwica} występują w pomiarze', () => {
    const wszystkie = new Set<string>();
    for (const { enm } of SIECI) for (const lod of LODY) for (const p of paryDlaLod(enm, lod)) wszystkie.add(p);
    const brakujace = WYMAGANE_PARY.filter((p) => !wszystkie.has(p));
    expect(brakujace, `pary bez pokrycia (obecne: ${[...wszystkie].sort().join(', ')})`).toEqual([]);
  });

  it('każdy LOD niesie pary z co najmniej trzech różnych klas trafienia', () => {
    for (const { nazwa, enm } of SIECI) {
      for (const lod of LODY) {
        const klasy = new Set([...paryDlaLod(enm, lod)].map((p) => p.split('×')[0]));
        expect(klasy.size, `${nazwa} LOD ${lod}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// E. DEKLARACJE PRZYPIĘTE (reguła KLASA pkt 4)
// ---------------------------------------------------------------------------

describe('E — deklaracje z nagłówków mają pokrycie', () => {
  it('`ELEMENT_KIND_KOTWICY` jest BIJEKCJĄ (od tego zależy poprawność odwrotności)', () => {
    const kotwice = Object.keys(ELEMENT_KIND_KOTWICY) as readonly MenuAnchorKind[];
    const kategorie = Object.values(ELEMENT_KIND_KOTWICY);
    expect(new Set(kategorie).size, 'dwie kotwice o tej samej kategorii ⇒ odwrotność zgaduje').toBe(kategorie.length);
    for (const kotwica of kotwice) {
      expect(kotwicaDlaElementKind(ELEMENT_KIND_KOTWICY[kotwica])).toBe(kotwica);
    }
    expect(kotwicaDlaElementKind(undefined)).toBeUndefined();
    // Kategorie rysunkowe BEZ obiektu modelu nie mają kotwicy — uczciwy brak.
    expect(kotwicaDlaElementKind('protectionAnnotation')).toBeUndefined();
    expect(kotwicaDlaElementKind('branchPoint')).toBeUndefined();
  });

  it('`KLASY_UCHWYTU` — lista ZAMKNIĘTA; każda pozostała klasa rysuje SIEBIE', () => {
    // Deklaracja z nagłówka `canvasMenuSubject`: uchwytami są dokładnie etykieta
    // i znacznik wyniku. Gdy pojawi się nowa klasa trafienia, ten test zmusza do
    // świadomej decyzji, po której stronie leży (uchwyt cudzego obiektu vs własny
    // rysunek) — zamiast cichego odziedziczenia gałęzi „rysuje siebie".
    expect([...KLASY_UCHWYTU].sort()).toEqual(['etykieta', 'znacznik-wyniku']);
    for (const klasa of KLASY_UCHWYTU) {
      expect(HIT_OBJECT_CLASSES, 'klasa uchwytu musi istnieć w inwentarzu klas').toContain(klasa);
    }
  });

  it('`lv-load` NIE MA producenta — deklaracja `bus` w tabeli napisów jest nieużywana', () => {
    // Nagłówek `LABEL_OWNER_ELEMENT_KIND` twierdzi, że ten wpis istnieje wyłącznie
    // z powodu kompletności `satisfies`. Gdy producent się pojawi, ten test padnie
    // i wymusi świadome rozstrzygnięcie kategorii (dziś odziedziczyłaby
    // niesprawdzone `'bus'`, czyli weszłaby w bramkę przejścia stacja→szyna).
    for (const { nazwa, enm } of SIECI) {
      for (const lod of LODY) {
        const producenci = buildSceneV3(enm, lod).labels.filter((l) => l.ownerKind === 'lv-load');
        expect(producenci.map((l) => l.ownerRef), `${nazwa} LOD ${lod}`).toEqual([]);
      }
    }
  });

  it('menu kategorii `station` NAPRAWDĘ niesie „Usuń stację" — dlatego awans do kontenera jest groźny', () => {
    // Bez tego zdania test A byłby abstrakcją. Pozycja usuwania stacji w menu
    // otwartym nad napisem napięcia szyny to operacja domenowa na CUDZYM obiekcie.
    const pozycje = SLD_MENU_REGISTRY.station.map((a) => a.id);
    expect(pozycje).toContain('delete-station');
  });

  it('przejście stacja→szyna ODMAWIA, gdy stacja ma więcej niż jedną szynę powyżej granicy nN', () => {
    // Deklaracja z nagłówka `szynaSnStacji`: bezpieczeństwo NIE zależy od tego,
    // czy kanał kanonicznego refu zadziałał pierwszy. Sprawdzamy to na GPZ
    // (bus_refs = [SN 15 kV, WN 110 kV]) BEZ podania `busRef`: dawny predykat
    // „pierwsza szyna > 1 kV" podstawiłby tu szynę 15 kV pod napis o szynie WN.
    const { enm } = SIECI[0];
    const index = buildCanvasModelIndex(enm);
    const gpz = (enm.substations ?? []).find((s) => (s.ref_id ?? '').startsWith('gpz/'));
    expect(gpz, 'fixtura niesie GPZ').toBeTruthy();
    const ponadNn = (gpz!.bus_refs ?? []).filter((r) => (index.szyny.get(r)?.voltage_kv ?? 0) > 0.5);
    expect(ponadNn.length, 'GPZ ma szynę SN i WN — rysunek nie rozstrzyga, którą').toBeGreaterThan(1);
    const wynik = resolveCanvasMenuSubject(
      { klasa: 'etykieta', ownerRef: `${gpz!.ref_id}#hv-bus-label`, elementKind: ELEMENT_KIND_KOTWICY.szyna },
      index,
    );
    expect(wynik.stan, 'uczciwa odmowa zamiast podmiany obiektu').toBe('brak');

    // …a stacja rozdzielcza (SN + nN) rozstrzyga jednoznacznie i przejście działa.
    const stacja = (enm.substations ?? []).find((s) => (s.ref_id ?? '').startsWith('stn/'));
    const wynikStacji = resolveCanvasMenuSubject(
      { klasa: 'etykieta', ownerRef: `${stacja!.ref_id}#busbar-voltage`, elementKind: ELEMENT_KIND_KOTWICY.szyna },
      index,
    );
    expect(wynikStacji.stan).toBe('temat');
    const ref = wynikStacji.stan === 'temat' ? wynikStacji.temat.modelRef : null;
    expect((enm.buses ?? []).find((b) => b.ref_id === ref)?.voltage_kv).toBe(15);
  });

  it('kreska szyny i JEJ NAPIS rozstrzygają się na TEN SAM obiekt modelu', () => {
    // Reguła KLASA pkt 3 wyrażona wprost: dwa końce pary (rysunek obiektu i jego
    // uchwyt) muszą dawać jeden temat. Do naprawy dawały: kreska → szyna,
    // napis → stacja.
    const { enm } = SIECI[0];
    const scene = buildSceneV3(enm, 2);
    const index = buildCanvasModelIndex(enm);
    const wgBazy = buildKanonicznyRefSzynyWgBazy(scene.segments);
    const bazaRefu = (ref: string): string => (ref.includes('#') ? ref.slice(0, ref.indexOf('#')) : ref);

    const tematKreski = new Map<string, string>();
    for (const segment of scene.segments) {
      const kind = segment.meta?.kind;
      if ((kind !== 'bus' && kind !== 'busGpz') || !segment.meta?.ownerRef) continue;
      const wynik = resolveCanvasMenuSubject(
        {
          klasa: 'szyna',
          ownerRef: segment.meta.ownerRef,
          elementKind: segment.meta.elementKind,
          busRef: resultRefForSegment(segment.meta),
        },
        index,
      );
      if (wynik.stan === 'temat') tematKreski.set(bazaRefu(segment.meta.ownerRef), wynik.temat.modelRef);
    }
    expect(tematKreski.size, 'fixtura niesie kreski szyn z tematem').toBeGreaterThan(50);

    let sprawdzonych = 0;
    for (const label of scene.labels) {
      if (label.ownerKind !== 'busbar-voltage') continue;
      const oczekiwany = tematKreski.get(bazaRefu(label.ownerRef));
      if (oczekiwany === undefined) continue;
      const wynik = resolveCanvasMenuSubject(
        {
          klasa: 'etykieta',
          ownerRef: label.ownerRef,
          elementKind: LABEL_OWNER_ELEMENT_KIND[label.ownerKind],
          busRef: kanonicznyRefSzynyUchwytu(label, wgBazy),
        },
        index,
      );
      expect(wynik.stan === 'temat' ? wynik.temat.modelRef : null, `napis "${label.text}"`).toBe(oczekiwany);
      sprawdzonych += 1;
    }
    expect(sprawdzonych, 'nie ma czego porównywać — para kreska↔napis musi być realna').toBeGreaterThan(50);
  });
});
