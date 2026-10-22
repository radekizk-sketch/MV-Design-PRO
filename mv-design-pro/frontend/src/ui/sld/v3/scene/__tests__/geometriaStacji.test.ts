/**
 * Karta GEOMETRIA-STACJI (Z-03, Z-05, Z-07, Z-08, Z-06c) — schemat = rzeczywista elektryka
 * stacji i pól.
 *
 * Wejście: fikstury `geometria_stacji_{zamkniete,otwarte,bez_wyposazenia}` wygenerowane
 * REALNYMI operacjami domenowymi backendu (`backend/tests/reference_networks/
 * scena_geometrii_stacji.py`, eksport `scripts/eksport_fixtur_harnessu.py`) — po jednej
 * stacji każdego rodzaju z topologii (przelotowa, odgałęźna, sekcyjna typu D, końcowa,
 * końcowa odgałęzienia), `punkt_startu_gpz_z_zaciskami_wolne_kilka` (GPZ z równoważnikiem
 * na szynach SN: dwie sekcje SN, sprzęgło `bus_coupler` bez pola COUPLER, bez transformatorów)
 * oraz `geometria_stacji_gpz_110kv` (GPZ z równoważnikiem 110 kV: dwie sekcje SN ze
 * sprzęgłem i dwa transformatory 110/15 kV na WSPÓLNEJ szynie WN — karta GPZ-MODEL).
 * Kilka niepołączonych szyn WN to dziś wyłącznie kształt archiwum sprzed karty GPZ-MODEL
 * (walidator blokuje go zgłoszeniem E066), więc ten przypadek powstaje z migawki backendu
 * rozdzieleniem wspólnej szyny WN — rysunek nadal ma pokazać model taki, jaki jest.
 *
 * ILOCZYN CECH (reguła KLASA §2):
 *   rodzaj stacji {przelotowa, odgałęźna, sekcyjna, końcowa, końcowa odgałęzienia}
 *   × liczba sekcji {1, 2}
 *   × stan sprzęgła {zamknięte, otwarte, nieznane}
 *   × rola pola {liniowe toru głównego, odgałęźne, transformatorowe, sprzęgło}
 *   × aparat {z modelu, brak danych} (propozycja szablonu: podgląd kreatora,
 *     `ui2/kreatory/stacja/__tests__/podgladRozdzielnicy.test.tsx`)
 *   × pole {czynne, wolne}
 *   × GPZ {jedna szyna WN (backend), kilka niepołączonych szyn WN (archiwum)}.
 * Asercja tożsamości: zbiór `ownerRef` odcinków szyn SN i `deviceRef` aparatów sceny =
 * zbiór z ENM fikstury (żaden element rysunku bez rekordu, żaden rekord bez rysunku).
 */
import { describe, expect, it } from 'vitest';

import type { Bus, EnergyNetworkModel, Substation } from '../../../../../types/enm';
import zamknieteFx from '../../../../../harness-fixtures/generated/geometria_stacji_zamkniete.json';
import otwarteFx from '../../../../../harness-fixtures/generated/geometria_stacji_otwarte.json';
import bezWyposazeniaFx from '../../../../../harness-fixtures/generated/geometria_stacji_bez_wyposazenia.json';
import gpzDwieSekcjeFx from '../../../../../harness-fixtures/generated/punkt_startu_gpz_z_zaciskami_wolne_kilka.json';
import gpz110kvFx from '../../../../../harness-fixtures/generated/geometria_stacji_gpz_110kv.json';
import { rodzajStacji } from '../../../../shared/rodzajStacji';
import { buildResultRefBridge } from '../../canvas/resultRefBridge';
import { obrysyZaznaczenia } from '../../canvas/obrysZaznaczenia';
import { zakresCelu } from '../../canvas/zakresKadru';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { allBayEquipmentTruthful, bayEquipmentGaps, buildSceneV3, type SceneV3 } from '../buildScene';

type Wariant = 'zamkniete' | 'otwarte' | 'bez_wyposazenia';

const FIKSTURY: Readonly<Record<Wariant, EnergyNetworkModel>> = {
  zamkniete: (zamknieteFx as unknown as { snapshot: EnergyNetworkModel }).snapshot,
  otwarte: (otwarteFx as unknown as { snapshot: EnergyNetworkModel }).snapshot,
  bez_wyposazenia: (bezWyposazeniaFx as unknown as { snapshot: EnergyNetworkModel }).snapshot,
};
const GPZ_DWIE_SEKCJE = (gpzDwieSekcjeFx as unknown as { snapshot: EnergyNetworkModel }).snapshot;
const GPZ_110KV = (gpz110kvFx as unknown as { snapshot: EnergyNetworkModel }).snapshot;

const WARIANTY: readonly Wariant[] = ['zamkniete', 'otwarte', 'bez_wyposazenia'];

const sceny = new Map<string, SceneV3>();
function scena(snapshot: EnergyNetworkModel, klucz: string): SceneV3 {
  const gotowa = sceny.get(klucz);
  if (gotowa) return gotowa;
  const nowa = buildSceneV3(snapshot, 2);
  sceny.set(klucz, nowa);
  return nowa;
}

function stacja(snapshot: EnergyNetworkModel, nazwa: string): Substation {
  const wynik = (snapshot.substations ?? []).find((s) => s.name === nazwa);
  if (!wynik) throw new Error(`fikstura bez stacji „${nazwa}"`);
  return wynik;
}

/** Szyny SN stacji w ENM (napięcie > 1 kV) — klasyfikacja testu z rekordów modelu. */
function szynySnStacji(snapshot: EnergyNetworkModel, st: Substation): string[] {
  const szyny = new Map<string, Bus>((snapshot.buses ?? []).map((b) => [b.ref_id, b]));
  return (st.bus_refs ?? []).filter((ref) => (szyny.get(ref)?.voltage_kv ?? 0) > 1).sort();
}

function polaSn(snapshot: EnergyNetworkModel, st: Substation) {
  const sn = new Set(szynySnStacji(snapshot, st));
  return (snapshot.bays ?? []).filter((b) => b.substation_ref === st.ref_id && sn.has(b.bus_ref));
}

function odcinekSzyny(sc: SceneV3, ownerRef: string) {
  const seg = sc.segments.find((s) => s.meta?.ownerRef === ownerRef);
  if (!seg) return null;
  const xs = seg.points.map((p) => p.x);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y: seg.points[0].y };
}

function symbolePola(sc: SceneV3, bayRef: string) {
  return sc.symbols.filter((s) => s.meta?.ownerRef === bayRef);
}

const STACJE_RODZAJE: readonly (readonly [string, string, number])[] = [
  ['Stacja Przelotowa', 'inline', 1],
  ['Stacja Odgałęźna', 'branch', 1],
  ['Stacja Sekcyjna', 'sectional', 2],
  ['Stacja Końcowa', 'terminal', 1],
  ['Stacja Końcowa odgałęzienia', 'terminal', 1],
];

describe('GEOMETRIA-STACJI — sekcje szyn SN z modelu (rodzaj × liczba sekcji × wariant)', () => {
  for (const wariant of WARIANTY) {
    const snapshot = FIKSTURY[wariant];
    const sc = scena(snapshot, wariant);
    for (const [nazwa, rodzaj, liczbaSekcji] of STACJE_RODZAJE) {
      it(`${wariant} · ${nazwa}: rodzaj z topologii = ${rodzaj}, ${liczbaSekcji} odcinek/odcinki szyny SN = szyny ENM`, () => {
        const st = stacja(snapshot, nazwa);
        expect(rodzajStacji(snapshot, st.ref_id)?.rodzaj).toBe(rodzaj);
        const szyny = szynySnStacji(snapshot, st);
        expect(szyny).toHaveLength(liczbaSekcji);
        const naScenie = sc.segments
          .map((s) => s.meta?.ownerRef ?? '')
          .filter((ref) => ref.endsWith('#sn-bus') && szyny.some((b) => ref === `${b}#sn-bus`));
        // Tożsamość: każdy odcinek szyny SN stacji = jedna szyna ENM, bez nadmiaru i braku.
        expect([...new Set(naScenie)].sort()).toEqual(szyny.map((b) => `${b}#sn-bus`));
        expect(naScenie).toHaveLength(liczbaSekcji);
      });

      it(`${wariant} · ${nazwa}: każde pole SN stoi nad SWOJĄ sekcją (bus_ref pola)`, () => {
        const st = stacja(snapshot, nazwa);
        for (const pole of polaSn(snapshot, st)) {
          if (pole.bay_role === 'COUPLER') continue; // sprzęgło stoi MIĘDZY sekcjami, test niżej
          const odcinek = odcinekSzyny(sc, `${pole.bus_ref}#sn-bus`);
          expect(odcinek, pole.ref_id).not.toBeNull();
          const symbole = symbolePola(sc, pole.ref_id);
          expect(symbole.length, pole.ref_id).toBeGreaterThan(0);
          for (const s of symbole) {
            const srodek = s.x + SYMBOL_DEFS[s.symbolId].width / 2;
            expect(srodek, `${pole.ref_id} ${s.symbolId}`).toBeGreaterThanOrEqual(odcinek!.x0);
            expect(srodek, `${pole.ref_id} ${s.symbolId}`).toBeLessThanOrEqual(odcinek!.x1);
          }
        }
      });
    }

    it(`${wariant} · Stacja Sekcyjna: dwie sekcje rozłączne, sprzęgło z gałęzi bus_coupler MIĘDZY nimi`, () => {
      const st = stacja(snapshot, 'Stacja Sekcyjna');
      const [a, b] = szynySnStacji(snapshot, st).map((ref) => odcinekSzyny(sc, `${ref}#sn-bus`)!);
      const [lewa, prawa] = a.x0 < b.x0 ? [a, b] : [b, a];
      expect(lewa.x1).toBeLessThan(prawa.x0);
      const sprzeglo = (snapshot.branches ?? []).find(
        (g) => g.type === 'bus_coupler' && (st.bus_refs ?? []).includes(g.from_bus_ref ?? ''),
      )!;
      const symbol = sc.symbols.find((s) => s.meta?.ownerRef === sprzeglo.ref_id);
      expect(symbol).toBeDefined();
      expect(symbol!.state).toBe(wariant === 'otwarte' ? 'open' : 'closed');
      expect(symbol!.x).toBeGreaterThanOrEqual(lewa.x1 - 1);
      expect(symbol!.x + SYMBOL_DEFS[symbol!.symbolId].width).toBeLessThanOrEqual(prawa.x0 + 1);
      // Pole COUPLER nie jest zwykłą kolumną pola: zero symboli z ownerRef pola sprzęgła.
      const poleSprzegla = polaSn(snapshot, st).find((p) => p.bay_role === 'COUPLER')!;
      expect(symbolePola(sc, poleSprzegla.ref_id)).toEqual([]);
    });

    it(`${wariant}: most wyników — punkt napięcia KAŻDEJ sekcji na własnym odcinku szyny`, () => {
      const most = buildResultRefBridge(snapshot);
      for (const [nazwa] of STACJE_RODZAJE) {
        const st = stacja(snapshot, nazwa);
        const szyny = szynySnStacji(snapshot, st);
        for (const ref of szyny) {
          expect(most.get(`${ref}#sn-bus`)).toEqual({ resultRef: ref, kind: 'bus' });
        }
        // Blok L0 stacji wielosekcyjnej nie dostaje wyniku jednej z sekcji (byłby domysłem).
        if (szyny.length > 1) expect(most.has(st.ref_id)).toBe(false);
        else expect(most.get(st.ref_id)?.resultRef).toBe(szyny[0]);
      }
    });

    it(`${wariant}: kadr „sekcja" stacji wielosekcyjnej — każda sekcja osobno, bez odmowy`, () => {
      const st = stacja(snapshot, 'Stacja Sekcyjna');
      const szyny = szynySnStacji(snapshot, st);
      const refy = szyny.map((ref) => {
        const wynik = zakresCelu('sekcja', snapshot, [`${ref}#sn-bus`], sc);
        expect(wynik.dostepny, ref).toBe(true);
        return wynik.dostepny ? wynik.zakres.refy : [];
      });
      // Kadr sekcji A zawiera jej szynę i nie zawiera szyny sekcji B (i odwrotnie).
      expect(refy[0]).toContain(szyny[0]);
      expect(refy[0]).not.toContain(szyny[1]);
      expect(refy[1]).toContain(szyny[1]);
      expect(refy[1]).not.toContain(szyny[0]);
    });

    it(`${wariant}: rola toru pól — przelotowa/końcowa tor główny, odgałęźna rozróżnia odgałęzienie, sekcyjna bez roli`, () => {
      const rola = (bayRef: string) =>
        [...new Set(symbolePola(sc, bayRef).map((s) => s.meta?.trackRole ?? null))];
      const pola = (nazwa: string) => polaSn(snapshot, stacja(snapshot, nazwa));
      for (const p of pola('Stacja Przelotowa')) {
        if (p.bay_role === 'IN' || p.bay_role === 'OUT') expect(rola(p.ref_id), p.ref_id).toEqual(['glowny']);
      }
      const odg = pola('Stacja Odgałęźna');
      expect(rola(odg.find((p) => p.bay_role === 'IN')!.ref_id)).toEqual(['glowny']);
      expect(rola(odg.find((p) => p.bay_role === 'OUT')!.ref_id)).toEqual(['glowny']);
      const feedery = odg.filter((p) => p.bay_role === 'FEEDER');
      // Pierwszy FEEDER jest wolny (bez odcinka) — nie jest torem; drugi niesie odgałęzienie.
      expect(rola(feedery[0].ref_id)).toEqual([null]);
      expect(rola(feedery[1].ref_id)).toEqual(['odgalezienie']);
      for (const p of pola('Stacja Sekcyjna')) {
        for (const r of rola(p.ref_id)) expect(r, p.ref_id).toBeNull();
      }
      expect(rola(pola('Stacja Końcowa').find((p) => p.bay_role === 'IN')!.ref_id)).toEqual(['glowny']);
    });

    it(`${wariant}: pole wolne (czynne × wolne) — sylwetka rezerwy, bez głowicy kablowej i bez odpływu`, () => {
      const wolne = [
        polaSn(snapshot, stacja(snapshot, 'Stacja Końcowa')).find((p) => p.bay_role === 'OUT')!,
        polaSn(snapshot, stacja(snapshot, 'Stacja Odgałęźna')).filter((p) => p.bay_role === 'FEEDER')[0],
      ];
      for (const pole of wolne) {
        const symbole = symbolePola(sc, pole.ref_id);
        expect(symbole.map((s) => s.symbolId), pole.ref_id).toContain('bayReserve');
        expect(symbole.map((s) => s.symbolId), pole.ref_id).not.toContain('cableHead');
        for (const s of symbole) expect(s.meta?.bayReserve, pole.ref_id).toBe('wolne');
        expect(sc.labels.some((l) => l.ownerRef === `${pole.ref_id}#direction`), pole.ref_id).toBe(false);
      }
      const czynne = polaSn(snapshot, stacja(snapshot, 'Stacja Końcowa')).find((p) => p.bay_role === 'IN')!;
      const symbole = symbolePola(sc, czynne.ref_id);
      expect(symbole.map((s) => s.symbolId)).not.toContain('bayReserve');
      for (const s of symbole) expect(s.meta?.bayReserve).toBeUndefined();
    });

    it(`${wariant}: kabel odgałęzienia wychodzi z pola, z którego prowadzi go model — nie z pola wolnego`, () => {
      const feedery = polaSn(snapshot, stacja(snapshot, 'Stacja Odgałęźna')).filter((p) => p.bay_role === 'FEEDER');
      const kabel = (snapshot.branches ?? []).find((g) => g.name === 'Odgałęzienie 1')!;
      const trasa = sc.segments.find((s) => s.meta?.ownerRef === kabel.ref_id);
      expect(trasa).toBeDefined();
      const zejscie = (bayRef: string) => sc.segments.find((s) => s.meta?.ownerRef === `${bayRef}#descent`)!.points[0].x;
      expect(trasa!.points[0].x).toBe(zejscie(feedery[1].ref_id));
      expect(trasa!.points[0].x).not.toBe(zejscie(feedery[0].ref_id));
    });

    it(`${wariant}: odpływ pola kończy się nazwą celu z modelu (outgoing_destination_ref)`, () => {
      const pole = polaSn(snapshot, stacja(snapshot, 'Stacja Odgałęźna')).filter((p) => p.bay_role === 'FEEDER')[1];
      expect(pole.outgoing_destination_ref).toBe(stacja(snapshot, 'Stacja Końcowa odgałęzienia').ref_id);
      const podpis = sc.labels.find((l) => l.ownerRef === `${pole.ref_id}#direction`);
      expect(podpis?.text).toMatch(/→ Stacja Końcowa odgałęzienia$/);
    });

    it(`${wariant}: żadna sylwetka „brak danych" przy rekordzie i żaden aparat bez rekordu`, () => {
      expect(bayEquipmentGaps(sc)).toEqual([]);
      expect(allBayEquipmentTruthful(sc)).toBe(true);
    });
  }
});

describe('GEOMETRIA-STACJI — aparat {z modelu, brak danych} (tożsamość ze zbiorem rekordów ENM)', () => {
  const NAZWY = STACJE_RODZAJE.map(([n]) => n);

  for (const wariant of ['zamkniete', 'otwarte'] as const) {
    it(`${wariant}: zbiór deviceRef aparatów pól stacji = zbiór gałęzi łączeniowych z equipment_refs`, () => {
      const snapshot = FIKSTURY[wariant];
      const sc = scena(snapshot, wariant);
      const lacznikowe = new Set(
        (snapshot.branches ?? []).filter((g) => g.type !== 'cable' && g.type !== 'line_overhead' && g.type !== 'bus_coupler').map((g) => g.ref_id),
      );
      const oczekiwane = new Set<string>();
      const pola = new Set<string>();
      for (const nazwa of NAZWY) {
        for (const pole of polaSn(snapshot, stacja(snapshot, nazwa))) {
          if (pole.bay_role === 'COUPLER') continue;
          pola.add(pole.ref_id);
          for (const ref of pole.equipment_refs ?? []) if (lacznikowe.has(ref)) oczekiwane.add(ref);
        }
      }
      const naScenie = new Set(
        sc.symbols.filter((s) => pola.has(s.meta?.ownerRef ?? '') && s.meta?.deviceRef).map((s) => s.meta!.deviceRef!),
      );
      expect([...naScenie].sort()).toEqual([...oczekiwane].sort());
      // Aparat z rekordu niesie źródło „dane", pochodzenie i typ katalogowy, stan z gałęzi.
      for (const s of sc.symbols) {
        if (!pola.has(s.meta?.ownerRef ?? '') || !s.meta?.deviceRef) continue;
        expect(s.meta.apparatusSource).toBe('dane');
        expect(s.meta.apparatusOrigin).toBe('galaz_pola');
        expect(s.meta.apparatusTypeRef).toBeTruthy();
        expect(s.state).toBe('closed');
      }
    });
  }

  it('bez_wyposazenia: każde pole = JEDNA sylwetka „brak danych wyposażenia pola", zero aparatu, zero stanu', () => {
    const snapshot = FIKSTURY.bez_wyposazenia;
    const sc = scena(snapshot, 'bez_wyposazenia');
    for (const nazwa of NAZWY) {
      for (const pole of polaSn(snapshot, stacja(snapshot, nazwa))) {
        if (pole.bay_role === 'COUPLER') continue;
        const symbole = symbolePola(sc, pole.ref_id);
        expect(symbole.filter((s) => s.symbolId === 'bayNoEquipment'), pole.ref_id).toHaveLength(1);
        for (const s of symbole) {
          expect(['bayNoEquipment', 'bayReserve', 'transformer2W'], `${pole.ref_id} ${s.symbolId}`).toContain(s.symbolId);
          expect(s.meta?.deviceRef, pole.ref_id).toBeUndefined();
          expect(s.state, pole.ref_id).toBeUndefined();
          expect(s.meta?.apparatusSource, pole.ref_id).toBe('brak');
        }
      }
    }
  });

  it('bez_wyposazenia: sprzęgło istnieje z gałęzi bus_coupler, choć pole COUPLER nie wskazuje gałęzi', () => {
    const snapshot = FIKSTURY.bez_wyposazenia;
    const st = stacja(snapshot, 'Stacja Sekcyjna');
    const poleSprzegla = polaSn(snapshot, st).find((p) => p.bay_role === 'COUPLER')!;
    expect(poleSprzegla.equipment_refs).toEqual([]);
    const sprzeglo = (snapshot.branches ?? []).find((g) => g.type === 'bus_coupler' && (st.bus_refs ?? []).includes(g.from_bus_ref ?? ''))!;
    expect(scena(snapshot, 'bez_wyposazenia').symbols.some((s) => s.meta?.ownerRef === sprzeglo.ref_id)).toBe(true);
  });

  it('stacja sekcyjna bez rekordu pola COUPLER: sprzęgło nadal stoi między sekcjami (jedno źródło — gałąź)', () => {
    const bazowy = FIKSTURY.zamkniete;
    const st = stacja(bazowy, 'Stacja Sekcyjna');
    const poleSprzegla = polaSn(bazowy, st).find((p) => p.bay_role === 'COUPLER')!;
    const bezPola = { ...bazowy, bays: (bazowy.bays ?? []).filter((b) => b.ref_id !== poleSprzegla.ref_id) } as EnergyNetworkModel;
    const sprzeglo = (bazowy.branches ?? []).find((g) => g.type === 'bus_coupler' && (st.bus_refs ?? []).includes(g.from_bus_ref ?? ''))!;
    const symbol = buildSceneV3(bezPola, 2).symbols.find((s) => s.meta?.ownerRef === sprzeglo.ref_id);
    expect(symbol?.state).toBe('closed');
  });
});

describe('GEOMETRIA-STACJI — stan sprzęgła {zamknięte, otwarte, nieznane}: trzy różne rysunki', () => {
  it('stan sprzęgła z Branch.status; status nieznany → stan „unknown", nie domysł zamknięcia', () => {
    const bazowy = FIKSTURY.zamkniete;
    const st = stacja(bazowy, 'Stacja Sekcyjna');
    const sprzegloRef = (bazowy.branches ?? []).find((g) => g.type === 'bus_coupler' && (st.bus_refs ?? []).includes(g.from_bus_ref ?? ''))!.ref_id;
    const stany = (['closed', 'open', undefined] as const).map((status) => {
      const snap = {
        ...bazowy,
        branches: (bazowy.branches ?? []).map((g) => (g.ref_id === sprzegloRef ? { ...g, status } : g)),
      } as EnergyNetworkModel;
      return buildSceneV3(snap, 2).symbols.find((s) => s.meta?.ownerRef === sprzegloRef)?.state;
    });
    expect(stany).toEqual(['closed', 'open', 'unknown']);
  });

  // Iloczyn: status gałęzi sprzęgła {zamknięta, otwarta} × rekord aparatu pola COUPLER
  // powiązany `linked_ref` {zgodny, sprzeczny, bez switch_state}. Rekord sprzeczny ze statusem
  // gałęzi ⇒ „unknown" (ta sama reguła co łącznik pola — `stanGaleziPola`), nie cicha wygrana
  // jednego źródła. Bez tego testu sprzęgło stacji ignorowało rekord (regresja względem K6a).
  it('rekord aparatu pola COUPLER sprzeczny ze statusem gałęzi → „unknown"; zgodny albo bez stanu → status', () => {
    const bazowy = FIKSTURY.zamkniete;
    const st = stacja(bazowy, 'Stacja Sekcyjna');
    const sprzegloRef = (bazowy.branches ?? []).find((g) => g.type === 'bus_coupler' && (st.bus_refs ?? []).includes(g.from_bus_ref ?? ''))!.ref_id;
    const poleSprzegla = polaSn(bazowy, st).find((p) => p.bay_role === 'COUPLER')!;
    const wynik = (status: 'closed' | 'open', rekord: 'zamkniety' | 'otwarty' | null) => {
      const aparat = {
        device_ref: `${poleSprzegla.ref_id}/aparat/00-ds`,
        symbol_ref: 'DS',
        kind: 'DS',
        placement: 'MIDSTREAM',
        is_controllable: true,
        linked_ref: sprzegloRef,
        switch_state: rekord ? { actual_state: rekord } : null,
      };
      const snap = {
        ...bazowy,
        branches: (bazowy.branches ?? []).map((g) => (g.ref_id === sprzegloRef ? { ...g, status } : g)),
        bays: (bazowy.bays ?? []).map((b) => (b.ref_id === poleSprzegla.ref_id ? { ...b, primary_devices: [aparat] } : b)),
      } as EnergyNetworkModel;
      return buildSceneV3(snap, 2).symbols.find((s) => s.meta?.ownerRef === sprzegloRef)?.state;
    };
    expect([
      wynik('closed', 'zamkniety'),
      wynik('closed', 'otwarty'),
      wynik('closed', null),
      wynik('open', 'otwarty'),
      wynik('open', 'zamkniety'),
      wynik('open', null),
    ]).toEqual(['closed', 'unknown', 'closed', 'open', 'unknown', 'open']);
  });
});

describe('GEOMETRIA-STACJI — GPZ: sprzęgło z gałęzi, szyna WN z szyn modelu (jedna × kilka)', () => {
  const szynyWn = (snap: EnergyNetworkModel) =>
    (snap.transformers ?? []).map((t) => t.hv_bus_ref).filter((v, i, a) => a.indexOf(v) === i).sort();
  const odcinkiWn = (sc: SceneV3) => sc.segments.filter((s) => s.meta?.parityKeys?.includes('gpz.bus.hv'));

  it('sprzęgło GPZ rysowane z gałęzi bus_coupler, chociaż model nie ma pola COUPLER', () => {
    expect((GPZ_DWIE_SEKCJE.bays ?? []).some((b) => b.bay_role === 'COUPLER')).toBe(false);
    const sprzeglo = (GPZ_DWIE_SEKCJE.branches ?? []).find((g) => g.type === 'bus_coupler')!;
    const sc = buildSceneV3(GPZ_DWIE_SEKCJE, 2);
    const symbol = sc.symbols.find((s) => s.meta?.ownerRef === sprzeglo.ref_id || s.meta?.deviceRef === sprzeglo.ref_id);
    expect(symbol).toBeDefined();
    expect(symbol!.state).toBe('closed');
  });

  it('jedna szyna WN w modelu (oba transformatory na niej, migawka backendu) → JEDEN odcinek szyny WN', () => {
    expect(szynyWn(GPZ_110KV)).toHaveLength(1);
    expect((GPZ_110KV.transformers ?? []).map((t) => t.lv_bus_ref).filter((v, i, a) => a.indexOf(v) === i)).toHaveLength(2);
    expect((GPZ_110KV.sources ?? []).map((s) => s.bus_ref)).toEqual(szynyWn(GPZ_110KV));
    const odcinki = odcinkiWn(buildSceneV3(GPZ_110KV, 2));
    expect(odcinki).toHaveLength(1);
    expect(odcinki[0].meta?.busResultRef).toBe(szynyWn(GPZ_110KV)[0]);
  });

  it('kilka niepołączonych szyn WN w modelu (archiwum) → tyle samo rozłącznych odcinków, każdy z wynikiem SWOJEJ szyny', () => {
    const [wspolna] = szynyWn(GPZ_110KV);
    const gpz = (GPZ_110KV.substations ?? []).find((s) => s.station_type === 'gpz')!;
    const tr2 = (GPZ_110KV.transformers ?? []).find((t) => t.name === 'TR2 110/15 kV')!;
    const druga = `${wspolna}/archiwum-tr2`;
    const szynaWspolna = (GPZ_110KV.buses ?? []).find((b) => b.ref_id === wspolna)!;
    const dwieSzyny = {
      ...GPZ_110KV,
      buses: [...(GPZ_110KV.buses ?? []), { ...szynaWspolna, ref_id: druga, name: 'Szyna 110 kV TR2' }],
      substations: (GPZ_110KV.substations ?? []).map((s) =>
        s.ref_id === gpz.ref_id ? { ...s, bus_refs: [...(s.bus_refs ?? []), druga] } : s,
      ),
      transformers: (GPZ_110KV.transformers ?? []).map((t) => (t.ref_id === tr2.ref_id ? { ...t, hv_bus_ref: druga } : t)),
    } as EnergyNetworkModel;
    const odcinki = odcinkiWn(buildSceneV3(dwieSzyny, 2));
    expect(szynyWn(dwieSzyny)).toHaveLength(2);
    expect(odcinki.map((s) => s.meta?.busResultRef).sort()).toEqual(szynyWn(dwieSzyny));
    const zakresy = odcinki
      .map((s) => s.points.map((p) => p.x))
      .map((xs) => [Math.min(...xs), Math.max(...xs)] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(zakresy[0][1]).toBeLessThan(zakresy[1][0]);
  });

  it('GPZ z równoważnikiem na szynach SN: bez transformatorów i bez szyny WN na rysunku', () => {
    expect(GPZ_DWIE_SEKCJE.transformers ?? []).toEqual([]);
    expect(odcinkiWn(buildSceneV3(GPZ_DWIE_SEKCJE, 2))).toEqual([]);
  });
});

describe('GEOMETRIA-STACJI — obrys zaznaczenia niezależny od roli pola', () => {
  it('pole liniowe, pole transformatorowe i sprzęgło: obrys obejmuje wszystkie symbole obiektu', () => {
    const snapshot = FIKSTURY.zamkniete;
    const sc = scena(snapshot, 'zamkniete');
    const st = stacja(snapshot, 'Stacja Sekcyjna');
    const pola = polaSn(snapshot, st);
    const refy = [
      pola.find((p) => p.bay_role === 'IN')!.ref_id,
      pola.find((p) => p.bay_role === 'TR')!.ref_id,
      (snapshot.branches ?? []).find((g) => g.type === 'bus_coupler' && (st.bus_refs ?? []).includes(g.from_bus_ref ?? ''))!.ref_id,
    ];
    const obrysy = obrysyZaznaczenia(sc, [...refy, 'ref-spoza-sceny']);
    expect(obrysy.map((o) => o.ref)).toEqual(refy);
    for (const obrys of obrysy) {
      for (const s of sc.symbols.filter((x) => x.meta?.ownerRef === obrys.ref)) {
        const def = SYMBOL_DEFS[s.symbolId];
        expect(s.x).toBeGreaterThanOrEqual(obrys.rect.x);
        expect(s.y).toBeGreaterThanOrEqual(obrys.rect.y);
        expect(s.x + def.width).toBeLessThanOrEqual(obrys.rect.x + obrys.rect.width);
        expect(s.y + def.height).toBeLessThanOrEqual(obrys.rect.y + obrys.rect.height);
      }
    }
  });
});
