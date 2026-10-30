/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC (§0 pkt 5, reguła KLASA) — TOR POLA Z PORTÓW ENM w OBU
 * kompozytorach pól SN: pole stacji (`compose/station.ts::buildBayStack`) i pole GPZ
 * (`compose/gpz.ts::buildFieldStack`). Dawniej porty czytał wyłącznie GPZ; pole stacji z tymi
 * samymi danymi (każdy szablon katalogu niesie dziś porty) układało tor z portów, ale nie
 * rysowało przewodów, wieszało odgałęzienia bez sprawdzenia węzła i zgłaszało braki inaczej.
 *
 * ILOCZYN CECH: kompozytor {stacja, GPZ}
 *   × konfiguracja z KATALOGU (wszystkie renderowalne: kanoniczne + producenckie, z portami;
 *     w tym pola z ODGAŁĘZIENIEM toru — Z.11.1/Z.11 × trzy wykonania łączników, rozszerzenie 4 —
 *     oraz pole pomiaru napięcia Z.17 z odgałęzieniem z węzła końca toru)
 *   × iniekcja {brak, usunięty port „wy" pierwszego aparatu dwuportowego toru,
 *               węzeł odgałęzienia spoza toru, wejście aparatu szynowego poza węzłem szyny}.
 * Stacja: macierz W1c (konfiguracje wstrzyknięte w pola stacji fikstury referencyjnej). GPZ:
 * fikstura generatora pola Z.10 (cztery pola liniowe GPZ), w których pola podstawiane są
 * kolejno konfiguracje katalogu (po cztery na scenę).
 *
 * Wyrocznia NIEZALEŻNA od kodu kompozycji: węzły portów czytane wprost z rekordów modelu
 * (`port_id`/`wezel`), porty glifów z `SYMBOL_DEFS`; przewód oczekiwany WYŁĄCZNIE między
 * kolejnymi pozycjami toru, których porty leżą na wspólnym węźle (zero przewodu z domysłu),
 * odczep odgałęzienia — wyłącznie, gdy jego węzeł jest węzłem kotwicy; zejście z szyny —
 * wyłącznie, gdy tor zaczyna się na węźle szyny.
 */
import { describe, expect, it } from 'vitest';

import type { BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import fxStaly1 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import { symbolIdForPrimaryDeviceKind } from '../../compose/apparatusSequence';
import type { PreviewSymbol } from '../../compose/preview';
import { obrysSymbolu, rodzajSymbolu, SYMBOL_DEFS, type SymbolId } from '../../symbols/defs';
import { buildSceneV3, type SceneV3 } from '../buildScene';
import { buildW1cCases, buildW1cMatrixFixture, type W1cCase } from './fixtures/w1cMatrixCatalog';

type Iniekcja = 'brak' | 'bez-portu-wy' | 'odgalezienie-poza-torem' | 'wejscie-poza-szyna';
const INIEKCJE: readonly Iniekcja[] = ['brak', 'bez-portu-wy', 'odgalezienie-poza-torem', 'wejscie-poza-szyna'];
const BOCZNE = new Set(['earthSwitch', 'voltageTransformer', 'surgeArrester']);
const boczny = (s: PreviewSymbol): boolean => BOCZNE.has(rodzajSymbolu(s.symbolId as SymbolId));
type Punkt = { readonly x: number; readonly y: number };
const rowne = (a: Punkt, b: Punkt): boolean => a.x === b.x && a.y === b.y;

/** Węzeł strony aparatu z rekordu: aparat jednozaciskowy (port `przylacze` odgałęzienia albo
 *  `obwod` przekładnika Ferrantiego) — oba końce na jedynym węźle; inaczej port `we`/`wy`. */
function wezel(d: BayPrimaryDevice, strona: 'we' | 'wy'): string | null {
  const porty = d.ports ?? [];
  const jedyny = porty.find((p) => p.port_id === 'przylacze' || p.port_id === 'obwod');
  if (jedyny) return jedyny.wezel ?? null;
  return porty.find((p) => p.port_id === strona)?.wezel ?? null;
}

function port(s: PreviewSymbol, dir: 'N' | 'S'): Punkt | null {
  const p = SYMBOL_DEFS[s.symbolId].ports.find((q) => q.dir === dir);
  return p ? { x: s.x + p.x, y: s.y + p.y } : null;
}

/** Iniekcja na kopii aparatów pola (kolejność rekordów bez zmian). */
function zIniekcja(devices: readonly BayPrimaryDevice[], iniekcja: Iniekcja): BayPrimaryDevice[] {
  const kopia = structuredClone(devices) as BayPrimaryDevice[];
  if (iniekcja === 'bez-portu-wy') {
    const d = kopia.find((x) => (x.ports ?? []).some((p) => p.port_id === 'wy'));
    if (d) d.ports = (d.ports ?? []).filter((p) => p.port_id !== 'wy');
  }
  if (iniekcja === 'wejscie-poza-szyna') {
    const d = kopia.find((x) => (x.ports ?? []).some((p) => p.port_id === 'we' && p.wezel === 'szyna'));
    if (d) d.ports = (d.ports ?? []).map((p) => (p.port_id === 'we' ? { ...p, wezel: 'wezel-spoza-toru' } : p));
  }
  if (iniekcja === 'odgalezienie-poza-torem') {
    const d = kopia.find((x) => (x.ports ?? []).length === 1 && ['ES', 'VT', 'SURGE_ARRESTER'].includes(x.kind));
    if (d) d.ports = [{ ...d.ports![0], wezel: 'wezel-spoza-toru' }];
  }
  return kopia;
}

/** Sprawdza pole `bayRef` sceny względem rekordów aparatów `devices`; zwraca liczbę przewodów
 *  i odczepów oczekiwanych (pokrycie wyroczni). */
function sprawdzPole(scena: SceneV3, bayRef: string, devices: readonly BayPrimaryDevice[], opis: string) {
  const rekord = new Map(devices.map((d) => [d.device_ref, d]));
  // Adnotacje zabezpieczeń i pomiaru (§17: przekaźnik, miernik) nie są pozycjami toru —
  // pole z kodami funkcji EAZ (szablon pola liniowego GPZ) rysuje przekaźnik w kolumnie adnotacji.
  const wszystkie = scena.symbols.filter(
    (s) => s.meta?.ownerRef === bayRef && s.symbolId !== 'protectionRelay' && s.symbolId !== 'meter',
  );
  // Rozszerzenie 4: aparaty odgałęzienia toru sprawdza `sprawdzOdgalezienia` niżej.
  const symbole = wszystkie.filter((s) => s.meta?.odgalezienieToru == null);
  // Pole z samych aparatów bocznych (np. celka uziemiania szyn) — brak osi do odgałęzienia,
  // aparaty stoją w torze (§18.1, przypadek zdegenerowany).
  const wOsi = symbole.filter((s) => !boczny(s));
  const zdegenerowane = wOsi.length === 0;
  const tor = (zdegenerowane ? symbole : wOsi).slice().sort((a, b) => a.y - b.y);
  const odcinki = scena.segments.filter((s) => (s.meta?.ownerRef ?? '').startsWith(`${bayRef}#`));
  const przewody = odcinki.filter((s) => (s.meta?.ownerRef ?? '').startsWith(`${bayRef}#wire-`));
  const odczepy = odcinki.filter((s) => (s.meta?.ownerRef ?? '').startsWith(`${bayRef}#lateral-`));
  const dev = (s: PreviewSymbol | undefined) => (s?.meta?.deviceRef ? rekord.get(s.meta.deviceRef) : undefined);

  // Przewody toru głównego.
  const oczekiwane: { od: Punkt; do_: Punkt }[] = [];
  for (let i = 0; i + 1 < tor.length; i++) {
    const a = dev(tor[i]);
    const b = dev(tor[i + 1]);
    if (!a) continue;
    const wspolny = wezel(a, 'wy');
    const polaczone = b ? wspolny != null && wspolny === wezel(b, 'we') : tor[i + 1].symbolId === 'bayReserve' && wspolny != null;
    const od = port(tor[i], 'S');
    const do_ = port(tor[i + 1], 'N');
    if (polaczone && od && do_) oczekiwane.push({ od, do_ });
  }
  expect(przewody.length, `${opis}: liczba przewodów`).toBe(oczekiwane.length);
  for (const { od, do_ } of oczekiwane) {
    const jest = przewody.some((p) => rowne(p.points[0], od) && rowne(p.points[p.points.length - 1], do_));
    expect(jest, `${opis}: przewód ${JSON.stringify(od)} → ${JSON.stringify(do_)}`).toBe(true);
  }

  // Odczepy odgałęzień: kotwica = port S pozycji toru na wysokości odgałęzienia (przed torem —
  // port N pierwszej pozycji, węzeł szyny albo wejście pierwszego aparatu).
  let liczbaOdczepow = 0;
  for (const lat of zdegenerowane ? [] : symbole.filter(boczny)) {
    const d = dev(lat);
    const n = port(lat, 'N');
    if (!d || !n) continue;
    const kotwicaS = tor.find((s) => port(s, 'S')?.y === lat.y);
    const wezelKotwicy = kotwicaS
      ? (dev(kotwicaS) ? wezel(dev(kotwicaS)!, 'wy') : null)
      : dev(tor[0])
        ? wezel(dev(tor[0])!, 'we')
        : 'szyna';
    const oczekiwany = wezelKotwicy != null && wezel(d, 'we') === wezelKotwicy;
    const narysowany = odczepy.some((s) => rowne(s.points[s.points.length - 1], n));
    expect(narysowany, `${opis}: odczep ${lat.symbolId} (${d.device_ref})`).toBe(oczekiwany);
    if (oczekiwany) liczbaOdczepow += 1;
  }

  // Zejście z szyny — wyłącznie, gdy tor zaczyna się na węźle szyny.
  const pierwszy = dev(tor[0]);
  const zejscie = odcinki.some((s) => s.meta?.ownerRef === `${bayRef}#descent`);
  expect(zejscie, `${opis}: zejście z szyny`).toBe(pierwszy ? wezel(pierwszy, 'we') === 'szyna' : true);
  const galezie = sprawdzOdgalezienia(wszystkie, tor, odcinki, devices, bayRef, dev, opis);
  return { przewody: oczekiwane.length, odczepy: liczbaOdczepow, galezie };
}

/** Aparaty ODGAŁĘZIEŃ toru wg reguły standardu (wyrocznia niezależna, rozszerzenie 4):
 *  tor główny = jedyna droga aparatów dwuportowych od węzła szyny do węzła końca toru
 *  (kabel/transformator/odpływ); odgałęzienie — aparaty dwuportowe spoza drogi osiągalne
 *  z węzłów toru głównego (także z WĘZŁA KOŃCA toru) i jednoportowe na węzłach tych aparatów.
 *  Liczba dróg ≠ 1 → zbiór pusty. Aparat jednoportowy na węźle nieosiągalnym nie stoi
 *  w odgałęzieniu (rysunek: brak przyłącza), choć leży poza torem głównym.
 *  Kanon zmieniony kartą UX-04/POLE-LINIOWE-WZORZEC (2026-10-29, reguła backendu
 *  `rodzaje_aparatury.aparaty_poza_torem_glownym`): odgałęzienie może wychodzić z węzła końca
 *  toru BEZ rozwidlenia węzła — pole pomiaru napięcia ENEA Z.17 (s.97): łącznik trójpołożeniowy
 *  kończy tor, złącze i przekładnik napięciowy leżą w odgałęzieniu za nim. Dawny warunek
 *  „brak rozwidlenia → zbiór pusty" zdjęty; intencja bez zmian — zbiór wyłącznie z portów. */
function apartyPozaTorem(devices: readonly BayPrimaryDevice[]): Set<string> {
  const dwu = devices.filter((d) => (d.ports ?? []).some((p) => p.port_id === 'we') && (d.ports ?? []).some((p) => p.port_id === 'wy'));
  const wyjscia = new Map<string, BayPrimaryDevice[]>();
  for (const d of dwu) wyjscia.set(wezel(d, 'we') ?? '', [...(wyjscia.get(wezel(d, 'we') ?? '') ?? []), d]);
  const drogi: BayPrimaryDevice[][] = [];
  const szukaj = (w: string, droga: BayPrimaryDevice[]) => {
    if (['kabel', 'transformator', 'odplyw'].includes(w)) return void drogi.push(droga);
    for (const d of wyjscia.get(w) ?? []) if (!droga.includes(d) && wezel(d, 'wy')) szukaj(wezel(d, 'wy')!, [...droga, d]);
  };
  szukaj('szyna', []);
  if (drogi.length !== 1) return new Set();
  const wezlyToru = new Set(['szyna', ...drogi[0].map((d) => wezel(d, 'wy')!)]);
  const osiagalne = new Set(wezlyToru);
  const wGalezi = new Set<BayPrimaryDevice>();
  for (let zmiana = true; zmiana; ) {
    zmiana = false;
    for (const d of dwu) {
      if (drogi[0].includes(d) || wGalezi.has(d) || !osiagalne.has(wezel(d, 'we') ?? '')) continue;
      wGalezi.add(d);
      if (wezel(d, 'wy')) osiagalne.add(wezel(d, 'wy')!);
      zmiana = true;
    }
  }
  const wezlyGalezi = new Set([...wGalezi].map((d) => wezel(d, 'wy')!));
  return new Set(
    devices
      .filter((d) => (dwu.includes(d) ? wGalezi.has(d) : wezlyGalezi.has(wezel(d, 'we') ?? '') && !wezlyToru.has(wezel(d, 'we') ?? '')))
      .map((d) => d.device_ref),
  );
}

/** Odgałęzienia toru (rozszerzenie 4): zbiór aparatów odgałęzień == wyrocznia, kolumna z odczepem
 *  od kotwicy na węźle odgałęzienia, przewody kolumny i odczepy jej aparatów bocznych wyłącznie
 *  na wspólnych węzłach. Zwraca liczbę sprawdzonych odcinków odgałęzień. */
function sprawdzOdgalezienia(
  wszystkie: readonly PreviewSymbol[],
  tor: readonly PreviewSymbol[],
  odcinki: SceneV3['segments'],
  devices: readonly BayPrimaryDevice[],
  bayRef: string,
  dev: (s: PreviewSymbol | undefined) => BayPrimaryDevice | undefined,
  opis: string,
): number {
  const wGalezi = wszystkie.filter((s) => s.meta?.odgalezienieToru != null);
  const oczekiwanePoza = apartyPozaTorem(devices);
  expect(new Set(wGalezi.map((s) => s.meta?.deviceRef)), `${opis}: aparaty odgałęzień`).toEqual(
    new Set([...oczekiwanePoza].filter((ref) => wszystkie.some((s) => s.meta?.deviceRef === ref))),
  );
  let sprawdzone = 0;
  const numery = [...new Set(wGalezi.map((s) => s.meta!.odgalezienieToru!))];
  for (const n of numery) {
    const owner = `${bayRef}#odgalezienie-${n}`;
    const kolumna = wGalezi.filter((s) => s.meta?.odgalezienieToru === n && !boczny(s)).sort((a, b) => a.y - b.y);
    const boczne = wGalezi.filter((s) => s.meta?.odgalezienieToru === n && boczny(s));
    // Kolumna na prawo od toru głównego (pas odgałęzienia, nie oś toru).
    const prawaToru = Math.max(...tor.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));
    for (const s of [...kolumna, ...boczne]) expect(s.x, `${opis}: odgałęzienie na prawo od toru`).toBeGreaterThan(prawaToru);
    // Odczep: od portu S aparatu toru głównego, którego „wy" = węzeł wejścia kolumny.
    const wejscie = wezel(dev(kolumna[0])!, 'we');
    const kotwica = tor.find((s) => dev(s) && wezel(dev(s)!, 'wy') === wejscie);
    const odczep = odcinki.find((s) => s.meta?.ownerRef === owner);
    const n0 = port(kolumna[0], 'N')!;
    if (kotwica) {
      expect(odczep, `${opis}: odczep odgałęzienia ${n}`).toBeDefined();
      expect(rowne(odczep!.points[0], port(kotwica, 'S')!), `${opis}: odczep od kotwicy`).toBe(true);
      expect(rowne(odczep!.points[odczep!.points.length - 1], n0), `${opis}: odczep do portu N kolumny`).toBe(true);
      sprawdzone += 1;
    } else {
      expect(odczep, `${opis}: odczep bez kotwicy na węźle`).toBeUndefined();
    }
    const przewody = odcinki.filter((s) => (s.meta?.ownerRef ?? '').startsWith(`${owner}-wire-`));
    const oczekiwane: { od: Punkt; do_: Punkt }[] = [];
    for (let i = 0; i + 1 < kolumna.length; i++) {
      const a = dev(kolumna[i]);
      const b = dev(kolumna[i + 1]);
      if (a && b && wezel(a, 'wy') != null && wezel(a, 'wy') === wezel(b, 'we')) {
        oczekiwane.push({ od: port(kolumna[i], 'S')!, do_: port(kolumna[i + 1], 'N')! });
      }
    }
    for (const lat of boczne) {
      const zaczep = kolumna.find((s) => port(s, 'S')?.y === lat.y);
      const d = dev(lat);
      if (zaczep && d && dev(zaczep) && wezel(dev(zaczep)!, 'wy') === wezel(d, 'we')) {
        oczekiwane.push({ od: port(zaczep, 'S')!, do_: port(lat, 'N')! });
      }
    }
    for (const { od, do_ } of oczekiwane) {
      const jest = przewody.some((p) => rowne(p.points[0], od) && rowne(p.points[p.points.length - 1], do_));
      expect(jest, `${opis}: przewód odgałęzienia ${JSON.stringify(od)} → ${JSON.stringify(do_)}`).toBe(true);
    }
    expect(przewody.length, `${opis}: liczba przewodów odgałęzienia ${n}`).toBe(oczekiwane.length);
    sprawdzone += oczekiwane.length;
  }
  return sprawdzone;
}

/**
 * Pas podpisów kolumny odgałęzienia (predykaty PARAMI z rezerwą planu `GalazPlanu.rezerwaEtykiet`,
 * doliczaną za szerokością CAŁEGO podstosu: kolumna + aparaty boczne odgałęzienia). Podpis aparatu
 * kolumny stoi na prawo od prawej krawędzi podstosu i nie nachodzi na żaden symbol pola. Pomiar
 * 2026-10-29: podpis kotwiczony tuż za własnym symbolem wchodził w kolumnę aparatów bocznych
 * odgałęzienia (stacja: 12 z 12 podpisów kolumn macierzy W1c; GPZ: kafel stanu sąsiada).
 * Etykieta: stacja — `#apparatus-id-<symbol>-odgalezienie-<n>-…` na wysokości symbolu (podpis aparatu
 * bocznego stoi POD symbolem i nie jest podpisem kolumny),
 * GPZ — `#etykieta-aparatu-<deviceRef>`. Zwraca liczbę sprawdzonych podpisów.
 */
function sprawdzPasPodpisowOdgalezien(scena: SceneV3, bayRef: string, opis: string): number {
  const wszystkie = scena.symbols.filter((s) => s.meta?.ownerRef === bayRef);
  const numery = [...new Set(wszystkie.filter((s) => s.meta?.odgalezienieToru != null).map((s) => s.meta!.odgalezienieToru!))];
  let sprawdzone = 0;
  for (const n of numery) {
    const podstos = wszystkie.filter((s) => s.meta?.odgalezienieToru === n);
    const prawaPodstosu = Math.max(...podstos.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));
    for (const s of podstos.filter((x) => !boczny(x))) {
      const srodekY = s.y + SYMBOL_DEFS[s.symbolId].height / 2;
      const podpis = scena.labels.find(
        (l) =>
          l.ownerRef === `${bayRef}#etykieta-aparatu-${s.meta?.deviceRef}`
          || ((l.ownerRef ?? '').startsWith(`${bayRef}#apparatus-id-${s.symbolId}-odgalezienie-${n}-`)
            && Math.abs(l.rect.y + l.rect.height / 2 - srodekY) < SYMBOL_DEFS[s.symbolId].height / 2),
      );
      if (!podpis) continue;
      expect(podpis.rect.x, `${opis}: podpis „${podpis.text}" w pasie za podstosem odgałęzienia ${n}`).toBeGreaterThanOrEqual(prawaPodstosu);
      for (const inny of wszystkie) {
        const o = obrysSymbolu(inny.symbolId);
        const r = { x: inny.x + o.x, y: inny.y + o.y, width: o.width, height: o.height };
        const zachodzi = podpis.rect.x < r.x + r.width && r.x < podpis.rect.x + podpis.rect.width
          && podpis.rect.y < r.y + r.height && r.y < podpis.rect.y + podpis.rect.height;
        expect(zachodzi, `${opis}: podpis „${podpis.text}" × ${inny.symbolId}`).toBe(false);
      }
      sprawdzone += 1;
    }
  }
  return sprawdzone;
}

/** Oczekiwany ślad braku w notatkach sceny (zdanie z przyczyną) dla iniekcji. */
function sprawdzBraki(scena: SceneV3, bayRef: string, przed: readonly BayPrimaryDevice[], po: readonly BayPrimaryDevice[], opis: string) {
  for (const d of po) {
    const oryginal = przed.find((x) => x.device_ref === d.device_ref)!;
    if (JSON.stringify(oryginal.ports) === JSON.stringify(d.ports)) continue;
    const notatka = scena.meta.stopNotes.some((n) => n.includes(`pole „${bayRef}", aparat „${d.device_ref}"`));
    if (wezel(d, 'wy') == null || wezel(d, 'we') == null) {
      expect(notatka, `${opis}: notatka braku ${d.device_ref}`).toBe(true);
    } else {
      // Odgałęzienie na węźle spoza toru — aparat nieosiągalny od szyny.
      expect(notatka, `${opis}: notatka nieosiągalnego ${d.device_ref}`).toBe(true);
    }
  }
}

describe('UX-04 — glify aparatów dwuzaciskowych mają oba zaciski toru', () => {
  it('każdy aparat katalogu z portami „we" i „wy" rysuje się glifem z portem N i S (kanoniczny i QET)', () => {
    const sprawdzone = new Set<string>();
    for (const c of buildW1cCases()) {
      for (const d of c.devices) {
        const ids = new Set((d.ports ?? []).map((p) => p.port_id));
        if (!ids.has('we') || !ids.has('wy')) continue;
        for (const wariant of ['kanoniczny', 'qet_en60617']) {
          const id = symbolIdForPrimaryDeviceKind(d.kind, wariant);
          if (!id) continue;
          const kier = SYMBOL_DEFS[id].ports.map((p) => p.dir);
          expect(kier, `${d.kind} → ${id}`).toContain('N');
          expect(kier, `${d.kind} → ${id}`).toContain('S');
          sprawdzone.add(id);
        }
      }
    }
    // Głowica kablowa kanoniczna i QET są w zbiorze (dawniej głowica kanoniczna nie miała N).
    expect([...sprawdzone]).toEqual(expect.arrayContaining(['cableHead', 'qetCableHead', 'breaker', 'qetBreaker']));
  });
});

describe('UX-04 — tor z portów: pole STACJI × konfiguracja katalogu × iniekcja', () => {
  const baza = buildW1cMatrixFixture();
  for (const iniekcja of INIEKCJE) {
    it(`stacja · iniekcja ${iniekcja}`, () => {
      const model = structuredClone(baza.enm) as EnergyNetworkModel;
      const przed = new Map<string, BayPrimaryDevice[]>();
      for (const t of baza.targets) {
        const bay = model.bays.find((b) => b.ref_id === t.fieldRef)!;
        przed.set(t.fieldRef, structuredClone(bay.primary_devices ?? []) as BayPrimaryDevice[]);
        bay.primary_devices = zIniekcja(bay.primary_devices ?? [], iniekcja);
      }
      const scena = buildSceneV3(model, 2);
      let przewody = 0;
      let odczepy = 0;
      let galezie = 0;
      let podpisyGalezi = 0;
      for (const t of baza.targets) {
        const bay = model.bays.find((b) => b.ref_id === t.fieldRef)!;
        const wynik = sprawdzPole(scena, t.fieldRef, bay.primary_devices ?? [], `stacja ${t.case.configId} [${iniekcja}]`);
        podpisyGalezi += sprawdzPasPodpisowOdgalezien(scena, t.fieldRef, `stacja ${t.case.configId} [${iniekcja}]`);
        przewody += wynik.przewody;
        odczepy += wynik.odczepy;
        galezie += wynik.galezie;
        sprawdzBraki(scena, t.fieldRef, przed.get(t.fieldRef)!, bay.primary_devices ?? [], `stacja ${t.case.configId}`);
      }
      // Pokrycie wyroczni: macierz faktycznie ćwiczy przewody i odczepy.
      expect(przewody).toBeGreaterThan(baza.targets.length);
      expect(odczepy).toBeGreaterThan(0);
      // Macierz ćwiczy odgałęzienia toru (szablony Z.11.1/Z.11 katalogu).
      if (iniekcja === 'brak') expect(galezie).toBeGreaterThan(0);
      if (iniekcja === 'brak') expect(podpisyGalezi, 'podpisy kolumn odgałęzień stacji').toBeGreaterThan(0);
      if (iniekcja === 'brak') {
        expect(scena.meta.stopNotes.filter((n) => n.includes('przewód do aparatu nie jest rysowany'))).toEqual([]);
      }
    });
  }
});

describe('UX-04 — tor z portów: pole GPZ × konfiguracja katalogu × iniekcja', () => {
  const enm = (fxStaly1 as unknown as { snapshot: EnergyNetworkModel }).snapshot;
  const polaGpz = (enm.bays ?? []).filter((b) => (b.tags ?? []).includes('gpz_line_field')).map((b) => b.ref_id).sort();
  // Jeden przypadek na konfigurację (wariant stanu nie zmienia portów).
  const przypadki: W1cCase[] = [];
  const widziane = new Set<string>();
  for (const c of buildW1cCases()) {
    if (widziane.has(c.configRef)) continue;
    widziane.add(c.configRef);
    przypadki.push(c);
  }

  it('fikstura GPZ ma cztery pola liniowe, katalog — konfiguracje z portami', () => {
    expect(polaGpz).toHaveLength(4);
    expect(przypadki.length).toBeGreaterThan(40);
    expect(przypadki.every((c) => c.devices.some((d) => (d.ports ?? []).length > 0))).toBe(true);
  });

  for (const iniekcja of INIEKCJE) {
    it(`GPZ · iniekcja ${iniekcja}`, () => {
      let przewody = 0;
      let galezie = 0;
      let podpisyGalezi = 0;
      for (let i = 0; i < przypadki.length; i += polaGpz.length) {
        const partia = przypadki.slice(i, i + polaGpz.length);
        const model = structuredClone(enm) as EnergyNetworkModel;
        const przed = new Map<string, BayPrimaryDevice[]>();
        partia.forEach((c, k) => {
          const bay = model.bays!.find((b) => b.ref_id === polaGpz[k])!;
          const devices = c.devices.map((d, n) => ({ ...d, device_ref: `${bay.ref_id}::macierz::${n}` }));
          przed.set(bay.ref_id, devices);
          bay.primary_devices = zIniekcja(devices, iniekcja);
          bay.bay_template_ref = null;
        });
        const scena = buildSceneV3(model, 2);
        partia.forEach((c, k) => {
          const bay = model.bays!.find((b) => b.ref_id === polaGpz[k])!;
          const wynik = sprawdzPole(scena, bay.ref_id, bay.primary_devices ?? [], `GPZ ${c.configId} [${iniekcja}]`);
          podpisyGalezi += sprawdzPasPodpisowOdgalezien(scena, bay.ref_id, `GPZ ${c.configId} [${iniekcja}]`);
          przewody += wynik.przewody;
          galezie += wynik.galezie;
          sprawdzBraki(scena, bay.ref_id, przed.get(bay.ref_id)!, bay.primary_devices ?? [], `GPZ ${c.configId}`);
        });
      }
      expect(przewody).toBeGreaterThan(przypadki.length);
      if (iniekcja === 'brak') expect(galezie).toBeGreaterThan(0);
      if (iniekcja === 'brak') expect(podpisyGalezi, 'podpisy kolumn odgałęzień GPZ').toBeGreaterThan(0);
    });
  }
});
