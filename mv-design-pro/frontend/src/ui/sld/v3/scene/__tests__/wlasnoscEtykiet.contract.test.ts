/**
 * BLOK-LATERAL-WLASNOSC — WYROCZNIE KARTY: etykieta należy do obiektu, KTÓRY
 * OPISUJE.
 *
 * SKĄD KARTA. `BLOK-PUSTY` zamknęła pkt 6 zgłoszenia właściciela („wnętrze ramy
 * stacji w większości puste") na L0/L1, ale na L2 — tam, gdzie właściciel
 * patrzył — poprawa wyniosła 1,2 pkt proc. i 11/54 bloków zostało ponad progiem
 * pustki 90%. Przyczyną NIE była rezerwacja etykiet: ramy bloków rozciągał
 * podpis zejścia lateralu, który NALEŻAŁ do refu STACJI docelowej, a rysowany
 * był ~1900 j.św. wyżej, przy kablu schodzącym z magistrali. Rama bloku
 * (`canvas/viewAnchor.ts` `prostokatElementuWScenie` — ta sama funkcja, którą
 * kadruje kamera B-2) obejmuje wszystko, czego `ownerRef` należy do bloku, więc
 * rozciągała się na pustkę między stacją a cudzym napisem. Skrajnie:
 * „Stacja L4-1" 512×2222 j.św.
 *
 * CO JEST TU PRZYPIĘTE (reguła KLASA §4 — „deklaracja bez testu = fałszywa
 * pewność"; każde mocne zdanie karty ma niżej swój test):
 *
 *  §1 „Treść podpisu istnieje ⇒ jego właściciel-odcinek istnieje I JEST
 *     NARYSOWANY" — niezmiennik z JEDNEGO wyszukania (`incomingSegment`,
 *     `scene/buildScene.ts`). Dotąd ref i treść pochodziły z DWÓCH niezależnych
 *     kopii tego samego predykatu (R3 „predykaty parami"): rozjazd dałby albo
 *     zmyślony ref, albo ciche zniknięcie napisu.
 *  §2 „ŻADNA etykieta opisująca odcinek nie nosi refu bloku" — ZAMKNIĘTA lista
 *     rodzajów etykiet, które wolno policzyć do prostokąta bloku. Sprawdzane na
 *     WSZYSTKICH blokach × wszystkich poziomach szczegółu, a nie na przykładzie
 *     z karty.
 *  §3 ILOCZYN CECH {GPZ · stacja magistrali · stacja odgałęzienia · stacja z
 *     transformatorem · stacja ROZPOCZYNAJĄCA odgałęzienie — czyli dokładnie ta,
 *     której ramę rozciągał cudzy podpis} × {L0, L1, L2} — §2 rozstrzygane w
 *     każdej komórce osobno, z dowodem, że każda oś jest NIEPUSTA (inaczej
 *     „zielone" znaczyłoby „nie było czego sprawdzić").
 *  §4 PARA R3, OBA KOŃCE: prostokąt bloku stacji NIE obejmuje podpisu zejścia,
 *     a kotwica kamery TEGO SAMEGO podpisu (na jego odcinku) — obejmuje. Jedno
 *     źródło prawdy: obie strony liczy `prostokatElementuWScenie`.
 *  §5 KONTRAKT B-2 NIETKNIĘTY (R4): kotwiczenie na STACJI/GPZ działa na
 *     wszystkich trzech poziomach; kotwiczenie na ODCINKU (zejście i przęsło),
 *     czyli na nowym właścicielu podpisu, też. Pole (`bay`) NIE jest rysowane na
 *     L0 — to kontrakt LOD, nie regres tej karty — więc mierzymy to wprost i
 *     pilnujemy, że stacja, na którą kotwica się cofa, jest osiągalna.
 *  §6 DRUGA PARA PREDYKATÓW: `hitAreas.LABEL_OWNER_ELEMENT_KIND` DEKLARUJE, że
 *     klik w podpis przęsła celuje w ODCINEK. Dopóki podpis nosił ref stacji,
 *     deklaracja i ref przeczyły sobie KAŻDEGO DNIA, nie tylko na danych
 *     brzegowych: `canvasMenuSubject` odcinał sufiks i trafiał w STACJĘ, więc
 *     klik w podpis KABLA otwierał menu stacji (z pozycją „Usuń stację").
 *     Zmierzone `accept:sld-v3`, klasa `etykieta` na L2 — PRZED: `station:263`;
 *     PO: `station:214 · cable_segment_sn:46 · overhead_line_sn:3`. Różnica 49
 *     zgadza się co do sztuki z liczbą podpisów odcinków (37 przęseł + 12
 *     zejść). Test zderza obie tabele.
 *
 * ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (reguła KLASA §2): defekt nazwany w karcie
 * dotyczył `#lateral-label` (12 sztuk). Ta sama pomyłka własności siedziała w
 * `#segment-label` (37 sztuk, zmierzone rozciągnięcie do 320 j.św. w X) —
 * niewidoczna, bo podpis przęsła stoi BLISKO swojej stacji. Wyrocznie §2/§6 są
 * pisane na RODZAJ etykiety, nie na sufiks refu, więc trzeci taki podpis też nie
 * przejdzie.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../buildScene';
import { kotwicaWidoku, prostokatElementuWScenie } from '../../canvas/viewAnchor';
import { LABEL_OWNER_ELEMENT_KIND } from '../../canvas/hitAreas';
import type { OwnerKind } from '../../layout/labels';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const LODY: readonly SceneLod[] = [0, 1, 2];
const sceneByLod = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) } as const;

/** Rodzaje etykiet, które OPISUJĄ ODCINEK (a więc nie mogą należeć do bloku). */
const RODZAJE_ODCINKA: readonly OwnerKind[] = ['segment-span', 'segment-lateral'];

/**
 * ZAMKNIĘTA lista rodzajów etykiet, które wolno policzyć do prostokąta bloku
 * stacji/GPZ. Nazwa stacji i napięcie szyny OPISUJĄ blok; badge „NO" opisuje
 * łącznik podziału sieci, który jest cechą TEJ stacji. Dopisanie tu czegokolwiek
 * bez rozstrzygnięcia „co ta etykieta opisuje" jest naruszeniem R1 karty.
 */
const RODZAJE_WOLNE_W_BLOKU: ReadonlySet<OwnerKind> = new Set<OwnerKind>([
  'station-name',
  'busbar-voltage',
  'no-point',
]);

const REF_KORZENIA = /^((stn|gpz)\/[0-9a-f]+)\//;

function korzenBloku(ownerRef: string): string | null {
  const m = REF_KORZENIA.exec(ownerRef);
  return m ? m[1] : null;
}

function refBloku(korzen: string): string {
  return korzen.startsWith('gpz') ? `${korzen}/substation` : `${korzen}/station`;
}

/** Wszystkie bloki (stacje + GPZ) obecne na scenie — po korzeniu refu. */
function blokiSceny(scene: SceneV3): readonly string[] {
  const korzenie = new Set<string>();
  const zobacz = (owner: string | undefined | null): void => {
    const k = owner ? korzenBloku(owner) : null;
    if (k) korzenie.add(k);
  };
  for (const s of scene.symbols) zobacz(s.meta?.ownerRef);
  for (const g of scene.segments) zobacz(g.meta?.ownerRef);
  for (const l of scene.labels) zobacz(l.ownerRef);
  return [...korzenie].sort();
}

/** Czy obiekt o `ownerRef` należy do elementu `ref` — TA SAMA gramatyka co
 *  `viewAnchor.nalezyDo` (kompozyt `ref#…`), świadomie powtórzona w teście,
 *  żeby wyrocznia nie zależała od prywatnej funkcji modułu. */
function nalezyDo(ownerRef: string | undefined | null, ref: string): boolean {
  return !!ownerRef && (ownerRef === ref || ownerRef.startsWith(`${ref}#`));
}

function bazaRefu(ownerRef: string): string {
  const i = ownerRef.indexOf('#');
  return i < 0 ? ownerRef : ownerRef.slice(0, i);
}

/** Refy odcinków RZECZYWIŚCIE narysowanych na tym poziomie. */
function refyNarysowanychOdcinkow(scene: SceneV3): ReadonlySet<string> {
  const out = new Set<string>();
  for (const g of scene.segments) {
    const ref = g.meta?.ownerRef;
    if (ref) out.add(ref);
  }
  return out;
}

const tozsamosc = <T,>(box: T): T => box;

function narysowanyNaTrzech(ref: string): boolean {
  return LODY.every((lod) => prostokatElementuWScenie(sceneByLod[lod], ref) != null);
}

// ---------------------------------------------------------------------------
// §1 — treść podpisu ⇒ właściciel-odcinek istnieje i jest narysowany
// ---------------------------------------------------------------------------

describe('BLOK-LATERAL-WLASNOSC §1 — podpis odcinka nosi ref ODCINKA, który rysunek naprawdę niesie', () => {
  for (const lod of LODY) {
    it(`L${lod}: każdy podpis odcinka wskazuje ref narysowanego odcinka (zero fabrykacji refu)`, () => {
      const scene = sceneByLod[lod];
      const narysowane = refyNarysowanychOdcinkow(scene);
      const podpisy = scene.labels.filter((l) => RODZAJE_ODCINKA.includes(l.ownerKind));
      // L0/L1 nie rysują podpisów technicznych odcinków (bramka `lod === 2`);
      // pusty zbiór na tych poziomach jest FAKTEM kontraktu, nie luką testu —
      // dlatego niepustość wymagamy tam, gdzie podpisy istnieją.
      if (lod === 2) expect(podpisy.length).toBeGreaterThan(40);
      for (const label of podpisy) {
        const baza = bazaRefu(label.ownerRef);
        expect(
          narysowane.has(baza),
          `podpis „${label.text}" (${label.ownerKind}) wskazuje ref ${baza}, którego rysunek nie niesie`,
        ).toBe(true);
        // Treść niepusta: podpis bez tekstu to rezerwacja, nie tożsamość.
        expect(label.text.trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('L2: liczba podpisów zejść odpowiada liczbie odgałęzień sceny (nic nie znikło po cichu)', () => {
    // KD-11/S9-7: napis usunięty ma być POLICZONY. Zmiana właściciela nie może
    // zjeść ani jednego podpisu — przed kartą było ich 12 (pomiar
    // `scripts/pomiar_wlasnosci.tsx`), tyle samo co odgałęzień na fiksturze.
    const zejscia = sceneByLod[2].labels.filter((l) => l.ownerKind === 'segment-lateral');
    expect(zejscia).toHaveLength(sceneByLod[2].meta.lateralRunIds.length);
    expect(zejscia.length).toBeGreaterThan(0);
    // Każde zejście ma WŁASNY odcinek — dwa podpisy na jednym refie znaczyłyby,
    // że wyszukanie zwraca ten sam człon dla różnych odgałęzień.
    expect(new Set(zejscia.map((l) => l.ownerRef)).size).toBe(zejscia.length);
  });
});

// ---------------------------------------------------------------------------
// §2/§3 — ZAMKNIĘTA lista rodzajów w bloku, na ILOCZYNIE CECH
// ---------------------------------------------------------------------------

/**
 * CECHY BLOKU — osie iloczynu §3. To NIE jest podział rozłączny: „stacja
 * magistrali" i „stacja z transformatorem" to dwie NIEZALEŻNE osie i blok
 * zwykle ma obie naraz. Zbiór cech (a nie jedna kategoria) jest tu jedyną
 * uczciwą formą — pomiar na fiksturze: 54 bloki = 1 GPZ + 12 stacji magistrali
 * + 41 stacji odgałęzień, a transformator ma KAŻDA z 53 stacji. Gdyby cechy
 * były rozłącznymi kategoriami rozstrzyganymi po kolei, oś „magistrala" i
 * „odgałęzienie" wyszłyby PUSTE (transformator pochłonąłby wszystko) i iloczyn
 * miałby martwe komórki przy zielonym teście.
 *
 * Cecha jest własnością STACJI, nie poziomu szczegółu, więc rozstrzyga ją
 * ZAWSZE scena L2 (na L0 stacja jest symbolem zbiorczym — nie ma z czego
 * odczytać ani transformatora, ani pól).
 */
type CechaBloku =
  | 'GPZ'
  | 'stacja magistrali'
  | 'stacja odgałęzienia'
  | 'stacja z transformatorem'
  | 'stacja rozpoczynająca odgałęzienie';

const CECHY: readonly CechaBloku[] = [
  'GPZ',
  'stacja magistrali',
  'stacja odgałęzienia',
  'stacja z transformatorem',
  'stacja rozpoczynająca odgałęzienie',
];

let pamiecRozpoczynajacych: ReadonlySet<string> | null = null;

/**
 * Stacje, do których WCHODZI zejście lateralu — czyli DOKŁADNIE te bloki, które
 * przed kartą były rozciągane cudzym podpisem (12 sztuk, skrajnie 512×2222
 * j.św.). Wyznaczane z RYSUNKU, bez zgadywania: koniec polilinii zejścia jest
 * portem wejściowym stacji, więc leży w jej prostokącie; test wymaga, żeby
 * zawierał go DOKŁADNIE JEDEN blok (gdyby zawierało go zero albo dwa, byłby to
 * regres rysunku, nie luka wyroczni).
 *
 * Liczone LENIWIE i zapamiętywane: gdyby stało w inicjalizacji modułu, iniekcja
 * przywracająca dawną własność wywalałaby CAŁY plik na zbiorze testów („no
 * tests") zamiast zapalać nazwane wyrocznie §1/§2/§4/§6.
 */
function stacjeRozpoczynajaceOdgalezienie(): ReadonlySet<string> {
  if (pamiecRozpoczynajacych) return pamiecRozpoczynajacych;
  const scene = sceneByLod[2];
  const ramy = blokiSceny(scene)
    .map((korzen) => ({ korzen, rama: prostokatElementuWScenie(scene, refBloku(korzen)) }))
    .filter((r): r is { korzen: string; rama: NonNullable<typeof r.rama> } => r.rama != null);
  const out = new Set<string>();
  for (const label of scene.labels) {
    if (label.ownerKind !== 'segment-lateral') continue;
    const odcinek = bazaRefu(label.ownerRef);
    const kawalki = scene.segments.filter((g) => g.meta?.ownerRef === odcinek);
    expect(kawalki.length, `zejście ${odcinek} bez narysowanej polilinii`).toBeGreaterThan(0);
    const koniec = kawalki[kawalki.length - 1].points.at(-1)!;
    const trafione = ramy.filter(
      ({ rama }) =>
        koniec.x >= rama.minX && koniec.x <= rama.maxX && koniec.y >= rama.minY && koniec.y <= rama.maxY,
    );
    expect(
      trafione.map((t) => t.korzen),
      `koniec zejścia ${odcinek} nie trafia w DOKŁADNIE jeden blok`,
    ).toHaveLength(1);
    out.add(trafione[0].korzen);
  }
  pamiecRozpoczynajacych = out;
  return out;
}

function cechyBloku(korzen: string): readonly CechaBloku[] {
  if (korzen.startsWith('gpz/')) return ['GPZ'];
  const pelna = sceneByLod[2];
  const cechy: CechaBloku[] = [];
  const naMagistrali = pelna.meta.mainTrunkStationIds.some((id) => korzenBloku(`${id}/`) === korzen);
  cechy.push(naMagistrali ? 'stacja magistrali' : 'stacja odgałęzienia');
  if (pelna.symbols.some((s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith(`${korzen}/`))) {
    cechy.push('stacja z transformatorem');
  }
  if (stacjeRozpoczynajaceOdgalezienie().has(korzen)) cechy.push('stacja rozpoczynająca odgałęzienie');
  return cechy;
}

/**
 * WYROCZNIA §2, wyciągnięta z pętli, żeby dała się wywołać także na scenie
 * SPREPAROWANEJ (kontrola czułości niżej). Zwraca etykiety, które należą do
 * bloku `ref`, a NIE opisują tego bloku.
 */
function etykietyObceWBloku(
  scene: SceneV3,
  ref: string,
): readonly { readonly ownerKind: OwnerKind; readonly ownerRef: string; readonly text: string }[] {
  return scene.labels
    .filter((l) => nalezyDo(l.ownerRef, ref) && !RODZAJE_WOLNE_W_BLOKU.has(l.ownerKind))
    .map((l) => ({ ownerKind: l.ownerKind, ownerRef: l.ownerRef, text: l.text }));
}

describe('BLOK-LATERAL-WLASNOSC §2/§3 — do prostokąta bloku wchodzą WYŁĄCZNIE etykiety opisujące ten blok', () => {
  for (const lod of LODY) {
    it(`L${lod}: w każdym bloku, w każdej kategorii, rodzaje etykiet mieszczą się w ZAMKNIĘTEJ liście`, () => {
      const scene = sceneByLod[lod];
      const bloki = blokiSceny(scene);
      expect(bloki.length).toBeGreaterThan(50);

      const blokowZCecha = new Map<CechaBloku, number>();
      const etykietZCecha = new Map<CechaBloku, number>();
      for (const korzen of bloki) {
        const ref = refBloku(korzen);
        const cechy = cechyBloku(korzen);
        const obce = etykietyObceWBloku(scene, ref);
        expect(
          obce,
          `blok ${ref} (${cechy.join(' + ')}) niesie etykiety opisujące INNY obiekt: `
            + obce.map((o) => `${o.ownerKind} „${o.text}" (${o.ownerRef})`).join(' · '),
        ).toHaveLength(0);
        const ileEtykiet = scene.labels.filter((l) => nalezyDo(l.ownerRef, ref)).length;
        for (const cecha of cechy) {
          blokowZCecha.set(cecha, (blokowZCecha.get(cecha) ?? 0) + 1);
          etykietZCecha.set(cecha, (etykietZCecha.get(cecha) ?? 0) + ileEtykiet);
        }
      }

      // ILOCZYN CECH: każda oś musi być NIEPUSTA na każdym poziomie — inaczej
      // komórka iloczynu jest martwa i test niczego w niej nie broni.
      // Sprawdzamy DWIE rzeczy: że cecha ma bloki ORAZ że te bloki w ogóle niosą
      // etykiety (blok bez etykiet przeszedłby wyrocznię pusto).
      for (const cecha of CECHY) {
        expect(
          blokowZCecha.get(cecha) ?? 0,
          `cecha „${cecha}" pusta na L${lod} — iloczyn cech ma martwą komórkę`,
        ).toBeGreaterThan(0);
        expect(
          etykietZCecha.get(cecha) ?? 0,
          `cecha „${cecha}" na L${lod} nie ma ANI JEDNEJ etykiety — wyrocznia niczego nie ogląda`,
        ).toBeGreaterThan(0);
      }
    });
  }

  it('KONTROLA CZUŁOŚCI: podpis odcinka przywrócony pod ref stacji ZAPALA wyrocznię §2', () => {
    // Bez tej kontroli zieleń §2 nie odróżnia „nie ma naruszeń" od „skan nic nie
    // widzi". Preparujemy scenę DOKŁADNIE tak, jak wyglądała przed kartą:
    // podpis zejścia dostaje z powrotem `⟨stationId⟩#lateral-label`.
    const scene = sceneByLod[2];
    const korzen = blokiSceny(scene).find((k) => k.startsWith('stn/'))!;
    const ref = refBloku(korzen);
    const zejscie = scene.labels.find((l) => l.ownerKind === 'segment-lateral');
    expect(zejscie).toBeDefined();

    expect(etykietyObceWBloku(scene, ref)).toHaveLength(0);
    const spreparowana = {
      ...scene,
      labels: [...scene.labels, { ...zejscie!, ownerRef: `${ref}#lateral-label` }],
    } as SceneV3;
    const obce = etykietyObceWBloku(spreparowana, ref);
    expect(obce).toHaveLength(1);
    expect(obce[0].ownerKind).toBe('segment-lateral');
  });
});

// ---------------------------------------------------------------------------
// §4 — PARA R3: oba końce liczone JEDNĄ funkcją
// ---------------------------------------------------------------------------

describe('BLOK-LATERAL-WLASNOSC §4 — rama bloku i kotwica kamery czytają JEDNO źródło prawdy', () => {
  it('L2: podpis zejścia leży POZA prostokątem każdej stacji i WEWNĄTRZ prostokąta swojego odcinka', () => {
    const scene = sceneByLod[2];
    const zejscia = scene.labels.filter((l) => l.ownerKind === 'segment-lateral');
    expect(zejscia.length).toBeGreaterThan(0);
    // Prostokąty liczone RAZ — 54 bloki × 12 podpisów × pełny skan sceny byłoby
    // 648 przebiegów po całej scenie bez żadnego zysku dla wyroczni.
    const ramy = blokiSceny(scene)
      .map(refBloku)
      .map((ref) => ({ ref, rama: prostokatElementuWScenie(scene, ref) }))
      .filter((r): r is { ref: string; rama: NonNullable<typeof r.rama> } => r.rama != null);
    expect(ramy.length).toBeGreaterThan(50);

    for (const label of zejscia) {
      // KONIEC A — prostokąt bloku (ta sama funkcja, którą mierzy BLOK-PUSTY).
      for (const { ref, rama } of ramy) {
        const wRamie =
          label.rect.x >= rama.minX
          && label.rect.x + label.rect.width <= rama.maxX
          && label.rect.y >= rama.minY
          && label.rect.y + label.rect.height <= rama.maxY;
        expect(wRamie, `podpis zejścia „${label.text}" wpadł do ramy bloku ${ref}`).toBe(false);
      }
      // KONIEC B — kotwica kamery NA ODCINKU, którego ten podpis dotyczy.
      // `kotwicaWidoku` liczy prostokąt TĄ SAMĄ funkcją, więc jeżeli ktoś
      // rozdzieli implementacje, ten warunek przestanie się domykać.
      const odcinek = bazaRefu(label.ownerRef);
      const kotwica = kotwicaWidoku(sceneByLod, [odcinek], tozsamosc);
      expect(kotwica, `brak kotwicy dla odcinka ${odcinek}`).not.toBeNull();
      const box = kotwica!.boxByLod[2];
      expect(box.minX).toBeLessThanOrEqual(label.rect.x);
      expect(box.maxX).toBeGreaterThanOrEqual(label.rect.x + label.rect.width);
      expect(box.minY).toBeLessThanOrEqual(label.rect.y);
      expect(box.maxY).toBeGreaterThanOrEqual(label.rect.y + label.rect.height);
    }
  });

  it('kotwica kamery to DOKŁADNIE prostokąt sceny (jedno źródło, nie druga implementacja)', () => {
    // R3: „warunek WEJŚCIA i WYJŚCIA musi pochodzić z JEDNEGO źródła prawdy".
    // Rozjazd byłby niewidoczny w oku, więc pinujemy równość co do liczby.
    const refy = blokiSceny(sceneByLod[2]).map(refBloku).filter(narysowanyNaTrzech);
    expect(refy.length).toBeGreaterThan(50);
    for (const ref of refy) {
      const kotwica = kotwicaWidoku(sceneByLod, [ref], tozsamosc);
      expect(kotwica).not.toBeNull();
      for (const lod of LODY) {
        expect(kotwica!.boxByLod[lod]).toEqual(prostokatElementuWScenie(sceneByLod[lod], ref));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — kontrakt B-2 po przeniesieniu własności (R4)
// ---------------------------------------------------------------------------

describe('BLOK-LATERAL-WLASNOSC §5 — kontrakt B-2 (kotwica na WSZYSTKICH trzech poziomach) nietknięty', () => {
  it('kotwiczenie na STACJI/GPZ działa dla każdego bloku sceny', () => {
    const refy = blokiSceny(sceneByLod[2]).map(refBloku);
    expect(refy.length).toBeGreaterThan(50);
    const bez = refy.filter((ref) => !narysowanyNaTrzech(ref));
    expect(bez, `bloki bez kotwicy na komplecie poziomów: ${bez.join(', ')}`).toHaveLength(0);
  });

  it('kotwiczenie na ODCINKU — nowym właścicielu podpisu — działa dla zejść i dla przęseł', () => {
    const odcinki = (kind: OwnerKind): readonly string[] => [
      ...new Set(
        sceneByLod[2].labels.filter((l) => l.ownerKind === kind).map((l) => bazaRefu(l.ownerRef)),
      ),
    ];
    for (const kind of RODZAJE_ODCINKA) {
      const refy = odcinki(kind);
      expect(refy.length, `brak odcinków rodzaju ${kind} — nie ma czego kotwiczyć`).toBeGreaterThan(0);
      const bez = refy.filter((ref) => !narysowanyNaTrzech(ref));
      expect(bez, `odcinki ${kind} bez kotwicy na komplecie poziomów: ${bez.join(', ')}`).toHaveLength(0);
    }
  });

  it('POLE nie jest rysowane na L0 — kotwica cofa się do stacji, i ta jest osiągalna', () => {
    // POMIAR (przed i po karcie identycznie: 0/171): `bay.bayRef` ma rysunek na
    // L1/L2, a na L0 stacja jest symbolem zbiorczym BEZ pól. To kontrakt LOD
    // (spec §7 „osobne rezerwacje"), nie regres tej karty — `kotwicaWidoku`
    // celowo odrzuca kandydata bez kompletu i próbuje NASTĘPNEGO. Test pilnuje
    // OBU stron: że pole faktycznie znika dopiero na L0 (a nie np. na L2, co
    // byłoby regresem rysunku) i że stacja-następca jest osiągalna.
    const pola = [
      ...new Set(
        sceneByLod[2].labels
          .filter((l) => l.ownerKind === 'field-role')
          .map((l) => bazaRefu(l.ownerRef)),
      ),
    ];
    expect(pola.length).toBeGreaterThan(100);
    for (const bay of pola) {
      expect(prostokatElementuWScenie(sceneByLod[2], bay), `pole ${bay} bez rysunku na L2`).not.toBeNull();
      expect(prostokatElementuWScenie(sceneByLod[1], bay), `pole ${bay} bez rysunku na L1`).not.toBeNull();
      expect(prostokatElementuWScenie(sceneByLod[0], bay)).toBeNull();
      expect(kotwicaWidoku(sceneByLod, [bay], tozsamosc)).toBeNull();
      const korzen = korzenBloku(`${bay}/`);
      expect(korzen, `ref pola bez korzenia bloku: ${bay}`).not.toBeNull();
      expect(kotwicaWidoku(sceneByLod, [bay, refBloku(korzen!)], tozsamosc)?.ref).toBe(refBloku(korzen!));
    }
  });
});

// ---------------------------------------------------------------------------
// §6 — druga para predykatów: deklaracja trafienia vs. niesiony ref
// ---------------------------------------------------------------------------

describe('BLOK-LATERAL-WLASNOSC §6 — deklaracja „klik w podpis celuje w odcinek" zgadza się z niesionym refem', () => {
  it('L2: rodzaj elementu z `LABEL_OWNER_ELEMENT_KIND` odpowiada temu, czym NAPRAWDĘ jest ref etykiety', () => {
    // Dopóki podpis kabla nosił ref stacji, te dwie tabele przeczyły sobie co
    // dzień: `hitAreas` deklarowało `'segment'`, a `canvasMenuSubject` odcinało
    // sufiks i trafiało w STACJĘ (menu stacji z pozycją „Usuń stację" pod
    // kliknięciem w podpis kabla). Zderzamy deklarację z rysunkiem.
    const scene = sceneByLod[2];
    const odcinki = refyNarysowanychOdcinkow(scene);
    let sprawdzone = 0;
    for (const label of scene.labels) {
      const deklarowany = LABEL_OWNER_ELEMENT_KIND[label.ownerKind];
      const baza = bazaRefu(label.ownerRef);
      if (deklarowany === 'segment') {
        expect(
          odcinki.has(baza),
          `etykieta „${label.text}" deklaruje trafienie w ODCINEK, a jej ref ${baza} nie jest odcinkiem rysunku`,
        ).toBe(true);
        expect(korzenBloku(`${baza}/`), `ref odcinka ${baza} udaje blok stacji/GPZ`).toBeNull();
        sprawdzone += 1;
      }
      if (deklarowany === 'station') {
        expect(
          korzenBloku(`${baza}/`),
          `etykieta „${label.text}" deklaruje trafienie w STACJĘ, a jej ref ${baza} nie jest blokiem`,
        ).not.toBeNull();
        sprawdzone += 1;
      }
    }
    expect(sprawdzone).toBeGreaterThan(40);
  });
});
