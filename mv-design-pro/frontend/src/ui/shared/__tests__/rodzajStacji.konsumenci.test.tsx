/**
 * KARTA ETYKIETA-STACJI-PRZELOTOWEJ — KAŻDY konsument pokazuje rodzaj stacji z JEDNEJ reguły.
 *
 * Iloczyn cech (reguła KLASA §2): {deklaracja `station_type`: zgodna z topologią, niezgodna,
 * brak rodzaju (`mv_lv`), funkcja (`customer`), wartość nieznana, brak pola} × {konsument:
 * schemat L0/L1/L2, drzewo panelu „Schemat", tożsamość publiczna (karta stacji, wyszukiwarka,
 * inspektor legacy, przegląd masowy), karta techniczna, inspektor ui2, panel procesu, szuflada,
 * konfigurator stacji}. Model: fikstura B-2 z trzema stacjami, z których KAŻDA ma pola WE, WY,
 * ODG i TR (3 pola liniowe ⇒ odgałęźna) — dokładnie sytuacja kadru karty, w której schemat
 * mówił „odgałęźna", a drzewo „przelotowa". Podmiana deklaracji NIE może zmienić żadnego
 * podpisu; iniekcja drugiej reguły (odczyt `station_type` w dowolnym konsumencie) czerwieni
 * ten test (pomiar w meldunku karty).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../network-build/networkBuildStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../network-build/networkBuildStore')>();
  return {
    ...original,
    useNetworkBuildDerived: () => ({ blockersByCategory: { total: 0 }, configuredGpzSnFields: [], openTerminals: [] }),
    useNetworkBuildStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ openRouteSurface: vi.fn(), openOperationForm: vi.fn() }),
  };
});

import type { EnergyNetworkModel, Substation } from '../../../types/enm';
import { SchematContextPanel } from '../../shell/context-panels/SchematContextPanel';
import { selectStationSummaries } from '../../network-build/networkBuildStore';
import { buildTechCardSubject } from '../../tech-card/buildTechCardSubject';
import { buildSceneV3, stationTypeLabels } from '../../sld/v3/scene/buildScene';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { mapowanieObiektuInspektora } from '../../../ui2/adapters/inspectorAdapter';
import { StationConfigBasicCard } from '../../network-build/station-configurator/cards/StationConfigBasicCard';
import { stationPublicIdentity } from '../publicTechnicalLabels';
import {
  NAZWA_RODZAJU_STACJI_PL,
  opisRozdzielnicyStacjiPl,
  rodzajStacji,
  ukladRozdzielnicyStacjiPl,
} from '../rodzajStacji';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const surowy = JSON.parse(
  readFileSync(resolve(FRONTEND, 'src/ui/sld/v3/canvas/__tests__/fixtures/b2MalaPo.enm.json'), 'utf8'),
) as { enm?: EnergyNetworkModel } & EnergyNetworkModel;
const BAZA: EnergyNetworkModel = surowy.enm ?? surowy;

/** Deklaracje: zgodna (`branch`), niezgodna (`inline`, `terminal`, `sectional`), brak rodzaju
 *  (`mv_lv`), funkcja (`customer`), wartość nieznana i brak pola. */
const DEKLARACJE = ['branch', 'inline', 'terminal', 'sectional', 'mv_lv', 'customer', 'nieznana', undefined] as const;
/** Deklaracje, które schemat rysuje jako stacje pól (wartość spoza słownika ENM odrzuca backend). */
const DEKLARACJE_SCHEMATU = ['branch', 'inline', 'terminal', 'sectional', 'mv_lv', 'customer'] as const;

function zDeklaracja(deklaracja: string | undefined): EnergyNetworkModel {
  return {
    ...BAZA,
    substations: BAZA.substations.map((s) => {
      if (s.station_type === 'gpz') return s;
      const kopia = { ...s } as Record<string, unknown>;
      if (deklaracja === undefined) delete kopia.station_type;
      else kopia.station_type = deklaracja;
      return kopia as unknown as Substation;
    }),
  };
}

const stacjePol = BAZA.substations.filter((s) => s.station_type !== 'gpz');

describe('rodzaj stacji — każdy konsument czyta jedną regułę (iloczyn deklaracja × konsument)', () => {
  it('kontrola wejścia: model ma 3 stacje, każda z 3 polami liniowymi ⇒ odgałęźna', () => {
    expect(stacjePol).toHaveLength(3);
    for (const stacja of stacjePol) {
      expect(rodzajStacji(BAZA, stacja.ref_id)).toMatchObject({ rodzaj: 'branch', polaLiniowe: 3 });
    }
  });

  for (const deklaracja of DEKLARACJE) {
    const model = zDeklaracja(deklaracja);
    const nazwa = `deklaracja ${deklaracja ?? 'brak pola'}`;

    it(`${nazwa}: tożsamość publiczna, karta techniczna, szuflada, inspektor ui2, panel procesu`, () => {
      for (const stacja of model.substations.filter((s) => s.station_type !== 'gpz')) {
        expect(stationPublicIdentity(model, stacja).typeLabel).toBe('Stacja odgałęźna');
        const karta = buildTechCardSubject(model, { id: stacja.ref_id, type: 'Station', name: stacja.name } as never);
        const pola = karta?.sections.flatMap((sekcja) => sekcja.fields) ?? [];
        expect(pola.find((p) => p.key === 'typ_stacji')?.value).toBe('Stacja odgałęźna');
        expect(pola.find((p) => p.key === 'uklad')?.value).toBe('Układ odgałęźny SN');
        expect(ukladRozdzielnicyStacjiPl(model, stacja)).toBe('Układ odgałęźny SN');
        expect(opisRozdzielnicyStacjiPl(model, stacja)).toBe(
          'Rozdzielnica SN: układ odgałęźny SN — rozdzielnica SN ma 3 pola liniowe.',
        );
        const inspektor = mapowanieObiektuInspektora(model, stacja.id);
        const wiersze = inspektor?.wlasciwosci.flatMap((sekcja) => sekcja.wiersze) ?? [];
        expect(wiersze.find((w) => w.etykieta === 'Rodzaj stacji')?.wartosc.wartosc).toBe('Stacja odgałęźna');
      }
      expect(selectStationSummaries(model, null).map((s) => s.rodzaj)).toEqual(['branch', 'branch', 'branch']);
    });

    it(`${nazwa}: drzewo panelu „Schemat" — rodzaj przy każdej stacji`, () => {
      act(() => {
        useSnapshotStore.setState({ snapshot: model, readiness: { ready: true, blockers: [], warnings: [] } } as never);
      });
      const { unmount } = render(<SchematContextPanel />);
      const drzewo = screen.getByTestId('project-tree');
      for (const stacja of model.substations.filter((s) => s.station_type !== 'gpz')) {
        const wiersz = within(drzewo).getByTestId(`model-tree-row-${stacja.ref_id}`);
        expect(wiersz.textContent).toContain('stacja odgałęźna');
        expect(wiersz.textContent).not.toMatch(/przelotowa|końcowa|sekcyjna|rozgałęźna/);
      }
      unmount();
    });
  }

  for (const deklaracja of DEKLARACJE_SCHEMATU) {
    it(`deklaracja ${deklaracja}: schemat L0 (sylwetka), L1 i L2 (podpis) — odgałęźna`, () => {
      const model = zDeklaracja(deklaracja);
      for (const lod of [1, 2] as const) {
        const podpisy = stationTypeLabels(buildSceneV3(model, lod));
        expect(podpisy.map(([ref]) => ref).sort()).toEqual(stacjePol.map((s) => s.ref_id).sort());
        expect(new Set(podpisy.map(([, tekst]) => tekst))).toEqual(new Set(['stacja odgałęźna']));
      }
      const sylwetki = buildSceneV3(model, 0).symbols.filter((s) => s.symbolId === 'stationCollapsed');
      expect(sylwetki).toHaveLength(3);
      for (const s of sylwetki) expect(s.meta?.stationGlyph?.lineTopology).toBe('odgałęźna');
    });
  }

  it('konfigurator stacji: rodzaj i jego przyczyna z jednej reguły; brak stacji = rodzaj nieustalony', () => {
    const wynik = rodzajStacji(zDeklaracja('inline'), stacjePol[0].ref_id)!;
    const { unmount } = render(
      <StationConfigBasicCard
        stationName="S01"
        topologicalType={NAZWA_RODZAJU_STACJI_PL[wynik.rodzaj]}
        topologicalReasonPl={wynik.przyczynaPl}
        snVoltageKv={15}
        nnVoltageLevels={[0.4]}
        completeness="complete"
        mvNeutralGroundings={[]}
      />,
    );
    expect(screen.getByTestId('station-topological-type')).toHaveTextContent('odgałęźna');
    expect(screen.getByTestId('station-topological-reason')).toHaveTextContent('3 pola liniowe');
    unmount();
    render(
      <StationConfigBasicCard stationName="S01" topologicalType={null} snVoltageKv={15} nnVoltageLevels={[0.4]} completeness="missing" mvNeutralGroundings={[]} />,
    );
    expect(screen.getByTestId('station-topological-type')).toHaveTextContent('nieustalony');
  });
});
