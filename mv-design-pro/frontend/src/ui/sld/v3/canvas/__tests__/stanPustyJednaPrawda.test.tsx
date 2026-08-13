/**
 * P-8 (karta S9-11, audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` §3.3):
 * akcje stanu pustego (`sld-empty-state*`) siedziały w drzewie przy sieci
 * 16 i 51 stacji — bo warunek montowania liczył pustość z kategorii ADAPTERA
 * rysunku (gpzs/stations/cableRuns/ders), więc każdy stan, w którym adapter
 * nie miał nic do narysowania (hydratacja w toku = brak migawki; model z
 * elementami spoza kategorii rysunku), wyglądał jak „pusty model".
 *
 * KANON (jedno źródło prawdy o pustości — `ui/topology/pustoscModelu`):
 * stan pusty montuje się WYŁĄCZNIE przy werdykcie 'pusty' (migawka istnieje
 * i nie ma w niej ŻADNEGO elementu). 'nieustalona' (brak migawki) to brak
 * wiedzy, nie pusty model.
 *
 * ILOCZYN CECH: {pustość: nieustalona / pusty / niepusty} × {czy akcje stanu
 * pustego są w drzewie} + zamknięcie LISTY RODZIN względem kontraktu migawki
 * ŻYWEGO backendu (fixture `s92Bieg.enm.json` — reguła „deklaracja bez testu
 * = fałszywa pewność").
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQueryClient as render } from '../../../../../test/queryClientTestUtils';

import { useAppStateStore } from '../../../../app-state';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import {
  RODZINY_ELEMENTOW,
  pustoscModelu,
  modelNiepusty,
  modelPusty,
} from '../../../../topology/pustoscModelu';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const zywaMigawka = JSON.parse(
  readFileSync(resolve(fixturesDir, 's92Bieg.enm.json'), 'utf8'),
) as Record<string, unknown>;

/** Migawka o zadanych rodzinach — reszta rodzin pusta (kształt domain-ops). */
function migawka(rodziny: Partial<Record<(typeof RODZINY_ELEMENTOW)[number], unknown[]>>): EnergyNetworkModel {
  const bazowa: Record<string, unknown> = {
    header: {
      enm_version: '1.0',
      name: 'test',
      revision: 1,
      hash_sha256: 'h1',
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
    logical_views: { trunks: [], branches: [], secondary_connectors: [], terminals: [] },
  };
  for (const rodzina of RODZINY_ELEMENTOW) {
    bazowa[rodzina] = rodziny[rodzina] ?? [];
  }
  return bazowa as unknown as EnergyNetworkModel;
}

describe('pustoscModelu — jedno źródło prawdy (P-8)', () => {
  it('brak migawki → NIEUSTALONA (nie „pusty"): hydratacja w toku to brak wiedzy', () => {
    expect(pustoscModelu(null)).toBe('nieustalona');
    expect(pustoscModelu(undefined)).toBe('nieustalona');
    // Predykaty parami: 'nieustalona' nie spełnia ŻADNEGO z pary.
    expect(modelPusty(null)).toBe(false);
    expect(modelNiepusty(null)).toBe(false);
  });

  it('migawka bez elementów → PUSTY', () => {
    expect(pustoscModelu(migawka({}))).toBe('pusty');
    expect(modelPusty(migawka({}))).toBe(true);
  });

  it('KAŻDA rodzina elementów z osobna czyni model niepustym (iloczyn cech, nie przykład)', () => {
    for (const rodzina of RODZINY_ELEMENTOW) {
      const m = migawka({ [rodzina]: [{ ref_id: 'x', name: 'x' }] });
      expect(pustoscModelu(m), `rodzina ${rodzina} nie rozstrzyga o pustości`).toBe('niepusty');
    }
  });

  it('LISTA RODZIN jest zamknięta względem kontraktu ŻYWEGO backendu (s92Bieg.enm.json)', () => {
    const tabliceKontraktu = Object.entries(zywaMigawka)
      .filter(([, wartosc]) => Array.isArray(wartosc))
      .map(([klucz]) => klucz);
    // Nowa rodzina elementów w kontrakcie migawki MUSI zostać dopisana do
    // RODZINY_ELEMENTOW — inaczej model złożony wyłącznie z niej wyglądałby
    // jak pusty (dokładnie mechanizm P-8).
    for (const klucz of tabliceKontraktu) {
      expect(
        (RODZINY_ELEMENTOW as readonly string[]).includes(klucz),
        `rodzina '${klucz}' z kontraktu migawki nie jest objęta werdyktem pustości`,
      ).toBe(true);
    }
    expect(pustoscModelu(zywaMigawka as unknown as EnergyNetworkModel)).toBe('niepusty');
  });
});

describe('Kanwa v3 — akcje stanu pustego wyłącznie przy werdykcie PUSTY (P-8)', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSnapshotStore.getState().reset();
    useNetworkBuildStore.setState({ activeSurface: null });
  });

  it('pustość NIEUSTALONA (migawka nie przyszła): zero akcji stanu pustego w drzewie', () => {
    // POMIAR AUDYTU: `sld-empty-state`, `sld-empty-state-insert-gpz`,
    // `sld-empty-state-open-catalogs` obecne przy 16 i 51 stacjach — czyli w
    // stanach, w których model NIE jest pusty, ale kanwa jeszcze/chwilowo nie
    // ma czego rysować. Stan pusty ma mówić prawdę: „model jest pusty", a nie
    // „nie mam danych".
    render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.getByTestId('sld-canvas-v3-workspace')).toBeInTheDocument();
    expect(screen.queryByTestId('sld-empty-state')).toBeNull();
    expect(screen.queryByTestId('sld-empty-state-insert-gpz')).toBeNull();
    expect(screen.queryByTestId('sld-empty-state-open-catalogs')).toBeNull();
  });

  it('model PUSTY (migawka istnieje, zero elementów): stan pusty z CTA GPZ jest obecny', () => {
    useSnapshotStore.setState({ snapshot: migawka({}) });
    render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.getByTestId('sld-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('sld-empty-state-insert-gpz')).toBeInTheDocument();
    expect(screen.getByTestId('sld-empty-state-open-catalogs')).toBeInTheDocument();
  });

  it('model NIEPUSTY spoza kategorii rysunku (sama szyna): zero akcji stanu pustego', () => {
    // Dotąd warunek liczył pustość z kategorii ADAPTERA (gpzs/stations/
    // cableRuns/ders) — model z elementami, których adapter nie rysuje,
    // wyglądał jak pusty. Werdykt należy do MODELU, nie do rysunku.
    useSnapshotStore.setState({
      snapshot: migawka({ buses: [{ ref_id: 'BUS-1', name: 'Szyna SN', voltage_kv: 15 }] }),
    });
    render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.queryByTestId('sld-empty-state')).toBeNull();
  });

  it('model NIEPUSTY z siecią rysowalną (migawka żywego biegu): zero akcji stanu pustego', () => {
    useSnapshotStore.setState({ snapshot: zywaMigawka as unknown as EnergyNetworkModel });
    render(<SldCanvasV3Workspace width={800} height={600} />);
    expect(screen.queryByTestId('sld-empty-state')).toBeNull();
    expect(screen.queryByTestId('sld-empty-state-insert-gpz')).toBeNull();
  });
});
