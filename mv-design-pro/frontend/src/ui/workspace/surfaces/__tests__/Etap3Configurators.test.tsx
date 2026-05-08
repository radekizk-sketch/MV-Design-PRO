import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { useSnapshotStore } from '../../../topology/snapshotStore';
import { GpzConfiguratorSurface } from '../GpzConfiguratorSurface';
import { BayConfiguratorSurface } from '../BayConfiguratorSurface';
import { StationConfiguratorSurface } from '../StationConfiguratorSurface';
import { SnSegmentSurface } from '../SnSegmentSurface';
import { renderWithQueryClient as render } from '../../../../test/queryClientTestUtils';

const minimalSurface = {
  surfaceId: 'surface-test',
  screenCode: 'E-10' as const,
  titlePl: 'Test',
  entityRef: null,
  entityType: null,
  routeState: { payload: {} },
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C' as const,
  stackLevel: 0 as const,
  openMode: 'expand_workspace' as const,
  subjectKind: 'helper_context' as const,
  subjectRef: null,
} as never;

describe('Powierzchnie konfiguratorów E-10/E-11/E-13', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    vi.clearAllMocks();
  });

  describe('GpzConfiguratorSurface (E-03 R42 — Simple/Advanced modes)', () => {
    const surfaceWithGpz = { ...minimalSurface, entityRef: 'gpz-test' };

    /* R42: Helper switch from default Simple → Advanced mode */
    const switchToAdvanced = () => {
      fireEvent.click(screen.getByTestId('gpz-mode-advanced-switch'));
    };

    it('Bez entityRef → empty state (Simple mode default)', () => {
      render(<GpzConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('gpz-simple-empty')).toBeInTheDocument();
    });

    it('Domyślnie Simple mode (E-03A) — zwarty atrapa-style accordion', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.getByTestId('gpz-configurator-simple')).toBeInTheDocument();
      expect(screen.getByTestId('sec-identification')).toBeInTheDocument();
      expect(screen.getByTestId('sec-shortcircuit')).toBeInTheDocument();
      expect(screen.getByTestId('sec-normative')).toBeInTheDocument();
      expect(screen.getByTestId('sec-sections')).toBeInTheDocument();
      expect(screen.getByTestId('sec-calc-summary')).toBeInTheDocument();
      expect(screen.getByTestId('sec-readiness')).toBeInTheDocument();
    });

    it('Mode switcher Simple → Advanced przełącza widok (R42)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      expect(screen.getByTestId('gpz-configurator-simple')).toBeInTheDocument();
      switchToAdvanced();
      expect(screen.getByTestId('gpz-configurator-surface')).toBeInTheDocument();
      expect(screen.queryByTestId('gpz-configurator-simple')).not.toBeInTheDocument();
    });

    it('Advanced — renderuje 7 kart inżynierskich (R36)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      expect(screen.getByText('Identyfikacja')).toBeInTheDocument();
      expect(screen.getByText('Strona 110 kV')).toBeInTheDocument();
      expect(screen.getByText('Transformator z katalogu')).toBeInTheDocument();
      expect(screen.getByText('Sekcje SN')).toBeInTheDocument();
      expect(screen.getByText('Bilans pól SN')).toBeInTheDocument();
      expect(screen.getByText('Podsumowanie obliczeniowe')).toBeInTheDocument();
      expect(screen.getByText('Wyniki obliczeń live')).toBeInTheDocument();
    });

    it('Advanced — domyślnie aktywna karta Identyfikacja', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      expect(screen.getByTestId('gpz-card-content-identification')).toBeInTheDocument();
    });

    it('Advanced — Karta Strona 110 kV zawiera pole moc zwarciowa S\'\'k', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByTestId('gpz-sk-mva')).toBeInTheDocument();
    });

    it('Advanced R43 — Karta Strona 110 kV ma Z0/Z1 + neutralne uziemienie', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-hv-side'));
      expect(screen.getByTestId('gpz-z0-z1')).toBeInTheDocument();
      expect(screen.getByTestId('gpz-r0-x0')).toBeInTheDocument();
      expect(screen.getByText(/System uziemienia/)).toBeInTheDocument();
    });

    it('Advanced R44 — Karta Podsumowanie zawiera Ik1, Ip, Ith (asymmetric SC)', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-calc-summary'));
      expect(screen.getByTestId('calc-ik3-hv')).toBeInTheDocument();
      expect(screen.getByTestId('calc-ik1-hv')).toBeInTheDocument();
      expect(screen.getByTestId('calc-ip3-hv')).toBeInTheDocument();
      expect(screen.getByTestId('calc-ith3-hv')).toBeInTheDocument();
    });

    it('Advanced — karta Bilans pól SN renderuje tabelę', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-bays-balance'));
      expect(screen.getByTestId('gpz-bay-balance-table')).toBeInTheDocument();
    });

    it('Advanced — Karta Transformator pokazuje Quick Presety', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      fireEvent.click(screen.getByTestId('gpz-card-tab-transformer'));
      expect(screen.getByText(/Quick Presety GPZ/)).toBeInTheDocument();
      expect(screen.getByText(/Katalog HV transformatorów/)).toBeInTheDocument();
    });

    it('Advanced → Simple — switcher pozwala wrócić', () => {
      render(<GpzConfiguratorSurface surface={surfaceWithGpz} />);
      switchToAdvanced();
      expect(screen.getByTestId('gpz-configurator-surface')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('gpz-mode-simple-switch'));
      expect(screen.getByTestId('gpz-configurator-simple')).toBeInTheDocument();
    });
  });

  describe('BayConfiguratorSurface (E-11 R47 — Editor/Legacy modes)', () => {
    const surfaceWithBay = { ...minimalSurface, entityRef: 'bay-test' };

    it('Domyślnie Editor mode (R47) — komunikat empty bez entityRef', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('bay-configurator-surface')).toBeInTheDocument();
      expect(screen.getByText(/Brak referencji do pola SN/)).toBeInTheDocument();
    });

    it('Editor mode z entityRef → renderuje BayEditorStandalone', () => {
      render(<BayConfiguratorSurface surface={surfaceWithBay} />);
      expect(screen.getByTestId('bay-editor-standalone')).toBeInTheDocument();
      expect(screen.getByTestId('bay-editor-standalone-save')).toBeInTheDocument();
      expect(screen.getByTestId('bay-editor-standalone-cancel')).toBeInTheDocument();
    });

    it('Editor → Legacy switcher pokazuje 8 sekcji konfiguratora', () => {
      render(<BayConfiguratorSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('bay-mode-legacy-switch'));
      expect(screen.getByText('Dane podstawowe')).toBeInTheDocument();
      expect(screen.getByText('Aparatura pierwotna')).toBeInTheDocument();
      expect(screen.getByText('Zabezpieczenia')).toBeInTheDocument();
      expect(screen.getByText('Pomiary')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Podgląd SLD' })).toBeInTheDocument();
      expect(screen.getByText('Obliczenia')).toBeInTheDocument();
    });

    it('Legacy → Editor switcher wraca do BayEditorStandalone', () => {
      render(<BayConfiguratorSurface surface={surfaceWithBay} />);
      fireEvent.click(screen.getByTestId('bay-mode-legacy-switch'));
      expect(screen.queryByTestId('bay-editor-standalone')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('bay-mode-editor-switch'));
      expect(screen.getByTestId('bay-editor-standalone')).toBeInTheDocument();
    });
  });

  describe('StationConfiguratorSurface (E-13 R46 — Wizard/Legacy modes)', () => {
    const surfaceWithStation = { ...minimalSurface, entityRef: 'station-test' };

    const switchToLegacy = () => {
      fireEvent.click(screen.getByTestId('station-mode-legacy-switch'));
    };

    it('Domyślnie Wizard mode (R46) — 8 stepów wizarda', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      expect(screen.getByTestId('station-wizard-surface')).toBeInTheDocument();
      expect(screen.getByTestId('station-wizard-stepper')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-identification')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-bays_and_apparatus')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-transformer')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-lv_side')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-der')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-protection_hint')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-connections')).toBeInTheDocument();
      expect(screen.getByTestId('stepper-readiness')).toBeInTheDocument();
    });

    it('Wizard — domyślnie aktywny step Identyfikacja', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      expect(screen.getByTestId('station-wizard-step-identification')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-station-name')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-station-type')).toBeInTheDocument();
    });

    it('Wizard — przejście Dalej → Step 2 (Pola + aparatura)', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      fireEvent.click(screen.getByTestId('wizard-next'));
      expect(screen.getByTestId('station-wizard-step-bays-and-apparatus')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-add')).toBeInTheDocument();
    });

    it('Wizard — Step 2 dodaje pole z aparaturą (CB/DS/CT)', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      fireEvent.click(screen.getByTestId('wizard-next'));
      fireEvent.click(screen.getByTestId('wizard-bay-add'));
      expect(screen.getByTestId('bay-editor-0')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-role')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-cb-ref')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-bay-0-ct-ref')).toBeInTheDocument();
    });

    it('Wizard — Step 5 DER ma blocker bez PCC', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      fireEvent.click(screen.getByTestId('stepper-der'));
      fireEvent.click(screen.getByTestId('wizard-has-der'));
      expect(screen.getByTestId('wizard-der-pcc-blocker')).toBeInTheDocument();
    });

    it('Wizard — Step 8 Gotowość pokazuje checklist + summary', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      fireEvent.click(screen.getByTestId('stepper-readiness'));
      expect(screen.getByTestId('station-wizard-step-readiness')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-readiness-summary')).toBeInTheDocument();
      expect(screen.getByTestId('check-identification')).toBeInTheDocument();
      expect(screen.getByTestId('check-bays')).toBeInTheDocument();
    });

    it('Wizard — Save disabled gdy są blockerzy (brak nazwy + brak pól)', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      fireEvent.click(screen.getByTestId('stepper-readiness'));
      const saveBtn = screen.getByTestId('wizard-save-and-create') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('Wizard → Legacy switcher pozwala przełączyć na widok 10-kart', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      switchToLegacy();
      expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Identyfikacja i szablon' })).toBeInTheDocument();
    });

    it('Legacy → Wizard switcher pozwala wrócić do wizarda', () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      switchToLegacy();
      expect(screen.getByTestId('station-configurator-surface')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('station-mode-wizard-switch'));
      expect(screen.getByTestId('station-wizard-surface')).toBeInTheDocument();
    });

    it('Wizard bez entityRef (mode=create) — pusty draft', () => {
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      expect(screen.getByTestId('station-wizard-surface')).toBeInTheDocument();
      const nameInput = screen.getByTestId('wizard-station-name') as HTMLInputElement;
      expect(nameInput.value).toBe('');
    });

    it('Wizard R53 — edit mode ładuje PEŁNĄ hierarchię (bays + TR + DER) ze snapshot', async () => {
      /* Seed snapshot z kompletną stacją: 2 bays + transformer + DER. */
      useSnapshotStore.setState({
        snapshot: {
          header: { schema_version: '1.0', network_id: 'test', base_voltage_kv: 15, base_mva: 100, cmax: 1.1, cmin: 0.95, frequency_hz: 50 },
          buses: [
            { id: 'st-x-bus-hv', ref_id: 'st-x-bus-hv', name: 'HV', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' },
            { id: 'st-x-bus-lv', ref_id: 'st-x-bus-lv', name: 'LV', tags: [], meta: { lv_scheme_kind: 'tns' }, voltage_kv: 0.4, phase_system: '3ph' },
          ],
          branches: [], switches: [], sources: [], loads: [],
          transformers: [
            { id: 'st-x-tr', ref_id: 'st-x-tr', name: 'TR1', tags: [], meta: {},
              hv_bus_ref: 'st-x-bus-hv', lv_bus_ref: 'st-x-bus-lv',
              sn_mva: 0.63, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 7,
              vector_group: 'Dyn5', catalog_ref: 'ABB-EXISTING' },
          ],
          generators: [
            { id: 'st-x-der', ref_id: 'st-x-der', name: 'PV-1', tags: [],
              meta: { pcc_ref: 'st-x-bus-lv', inverter_catalog_ref: 'SMA-60' },
              bus_ref: 'st-x-bus-lv', p_mw: 0.05, gen_type: 'pv_inverter',
              connection_variant: 'LV_BEHIND_STATION_TRANSFORMER', station_ref: 'st-x' },
          ],
          substations: [
            { id: 'st-x', ref_id: 'st-x', name: 'ST-Existing', tags: [],
              meta: { registry_number: '999/24', producer: 'Schneider', rated_voltage_kv: 15 },
              station_type: 'mv_lv', bus_refs: ['st-x-bus-hv', 'st-x-bus-lv'],
              transformer_refs: ['st-x-tr'] },
          ],
          bays: [
            { id: 'st-x-b-1', ref_id: 'st-x-b-1', name: 'Pole L1', tags: [],
              meta: { cb_catalog_ref: 'ABB VD4', cb_icu_ka: 16, ct_catalog_ref: 'ABB CT', ct_ratio: '200/5', has_surge_arrester: true },
              bay_role: 'OUT', substation_ref: 'st-x', bus_ref: 'st-x-bus-hv', equipment_refs: [] },
            { id: 'st-x-b-2', ref_id: 'st-x-b-2', name: 'Pole TR1', tags: [],
              meta: { cb_catalog_ref: 'ABB VD4', cb_icu_ka: 16, ct_catalog_ref: 'ABB CT', has_fuse: true },
              bay_role: 'TR', substation_ref: 'st-x', bus_ref: 'st-x-bus-hv', equipment_refs: [] },
          ],
        } as never,
      });

      const surfaceWithExisting = { ...minimalSurface, entityRef: 'st-x' };
      render(<StationConfiguratorSurface surface={surfaceWithExisting} />);

      /* Step 1 — name + producer załadowane. */
      expect((screen.getByTestId('wizard-station-name') as HTMLInputElement).value).toBe('ST-Existing');
      expect((screen.getByTestId('wizard-producer') as HTMLInputElement).value).toBe('Schneider');

      /* Step 2 — 2 bays załadowane. */
      fireEvent.click(screen.getByTestId('stepper-bays_and_apparatus'));
      expect(screen.getByTestId('bay-editor-0')).toBeInTheDocument();
      expect(screen.getByTestId('bay-editor-1')).toBeInTheDocument();
      expect((screen.getByTestId('wizard-bay-0-cb-ref') as HTMLInputElement).value).toBe('ABB VD4');
      expect((screen.getByTestId('wizard-bay-0-ct-ref') as HTMLInputElement).value).toBe('ABB CT');

      /* Step 3 — transformer załadowany. */
      fireEvent.click(screen.getByTestId('stepper-transformer'));
      expect((screen.getByTestId('wizard-has-transformer') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId('wizard-transformer-ref') as HTMLInputElement).value).toBe('ABB-EXISTING');

      /* Step 4 — LV side załadowany. */
      fireEvent.click(screen.getByTestId('stepper-lv_side'));
      expect((screen.getByTestId('wizard-has-lv-side') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId('wizard-lv-voltage') as HTMLInputElement).value).toBe('400');

      /* Step 5 — DER załadowany. */
      fireEvent.click(screen.getByTestId('stepper-der'));
      expect((screen.getByTestId('wizard-has-der') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByTestId('wizard-der-kind') as HTMLSelectElement).value).toBe('PV');
      expect((screen.getByTestId('wizard-der-connection-variant') as HTMLSelectElement).value).toBe('lv_behind_tr');
      expect((screen.getByTestId('wizard-der-pcc-ref') as HTMLSelectElement).value).toBe('st-x-bus-lv');
    });

    it('Wizard R53 — edit + Save NIE GUBI istniejących bays/TR/DER (regression test data loss)', async () => {
      /* Seed: stacja z 1 bay + TR. */
      useSnapshotStore.setState({
        snapshot: {
          header: { schema_version: '1.0', network_id: 'test', base_voltage_kv: 15, base_mva: 100, cmax: 1.1, cmin: 0.95, frequency_hz: 50 },
          buses: [
            { id: 'st-y-bus-hv', ref_id: 'st-y-bus-hv', name: 'HV', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' },
            { id: 'st-y-bus-lv', ref_id: 'st-y-bus-lv', name: 'LV', tags: [], meta: {}, voltage_kv: 0.4, phase_system: '3ph' },
          ],
          branches: [], switches: [], sources: [], loads: [], generators: [],
          transformers: [
            { id: 'st-y-tr', ref_id: 'st-y-tr', name: 'TR', tags: [], meta: {},
              hv_bus_ref: 'st-y-bus-hv', lv_bus_ref: 'st-y-bus-lv',
              sn_mva: 0.4, uhv_kv: 15, ulv_kv: 0.4, uk_percent: 6, pk_kw: 5 },
          ],
          substations: [
            { id: 'st-y', ref_id: 'st-y', name: 'ST-Y', tags: [],
              meta: { registry_number: '1', producer: 'X', rated_voltage_kv: 15 },
              station_type: 'mv_lv', bus_refs: ['st-y-bus-hv', 'st-y-bus-lv'],
              transformer_refs: ['st-y-tr'] },
          ],
          bays: [
            { id: 'st-y-b-1', ref_id: 'st-y-b-1', name: 'Pole', tags: [],
              meta: { cb_catalog_ref: 'CB1', ct_catalog_ref: 'CT1' },
              bay_role: 'OUT', substation_ref: 'st-y', bus_ref: 'st-y-bus-hv', equipment_refs: [] },
          ],
        } as never,
      });

      const surfaceWithExisting = { ...minimalSurface, entityRef: 'st-y' };
      render(<StationConfiguratorSurface surface={surfaceWithExisting} />);

      /* Zmień tylko nazwę → Save. */
      fireEvent.change(screen.getByTestId('wizard-station-name'), { target: { value: 'ST-Y-zmieniona' } });
      fireEvent.click(screen.getByTestId('stepper-readiness'));
      const saveBtn = screen.getByTestId('wizard-save-and-create') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 50));

      /* Po Save: snapshot ma nadal 1 bay + 1 TR (NIE wymazane). */
      const snap = useSnapshotStore.getState().snapshot;
      const editedStation = snap?.substations?.find((s) => s.ref_id === 'st-y');
      expect(editedStation?.name).toBe('ST-Y-zmieniona');
      const stationBays = (snap?.bays ?? []).filter((b) => b.substation_ref === 'st-y');
      expect(stationBays.length).toBe(1); // BUG #2 fix: nie utracone
      const stationTr = (snap?.transformers ?? []).find((t) => t.ref_id === 'st-y-tr');
      expect(stationTr).toBeDefined();
    });

    it('Wizard R47 — wybór typu mv_lv auto-włącza hasTransformer + hasLvSide', async () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      fireEvent.change(screen.getByTestId('wizard-station-type'), { target: { value: 'mv_lv' } });
      fireEvent.click(screen.getByTestId('stepper-transformer'));
      const trCheckbox = await screen.findByTestId('wizard-has-transformer') as HTMLInputElement;
      expect(trCheckbox.checked).toBe(true);
      fireEvent.click(screen.getByTestId('stepper-lv_side'));
      const lvCheckbox = await screen.findByTestId('wizard-has-lv-side') as HTMLInputElement;
      expect(lvCheckbox.checked).toBe(true);
    });

    it('Wizard R48 — Save tworzy KOMPLETNĄ hierarchię ENM w snapshot (bays + buses + TR + DER)', async () => {
      /* Seed snapshot store z minimalnym empty ENM (patchSnapshot wymaga niepustego snapshot). */
      useSnapshotStore.setState({
        snapshot: {
          header: {
            schema_version: '1.0',
            network_id: 'test',
            base_voltage_kv: 15,
            base_mva: 100,
            cmax: 1.1,
            cmin: 0.95,
            frequency_hz: 50,
          },
          buses: [],
          branches: [],
          switches: [],
          sources: [],
          generators: [],
          loads: [],
          transformers: [],
          substations: [],
          bays: [],
        } as never,
      });
      render(<StationConfiguratorSurface surface={minimalSurface} />);
      /* Step 1 — nazwa, typ mv_lv (auto-on TR + LV). */
      fireEvent.change(screen.getByTestId('wizard-station-name'), { target: { value: 'ST-Test-R48' } });
      fireEvent.change(screen.getByTestId('wizard-station-type'), { target: { value: 'mv_lv' } });
      fireEvent.change(screen.getByTestId('wizard-producer'), { target: { value: 'ABB SafePlus' } });

      /* Step 2 — dodaj 2 bays. */
      fireEvent.click(screen.getByTestId('stepper-bays_and_apparatus'));
      fireEvent.click(screen.getByTestId('wizard-bay-add'));
      fireEvent.change(screen.getByTestId('wizard-bay-0-cb-ref'), { target: { value: 'ABB VD4' } });
      fireEvent.change(screen.getByTestId('wizard-bay-0-ct-ref'), { target: { value: 'ABB KOFA' } });
      fireEvent.click(screen.getByTestId('wizard-bay-add'));
      fireEvent.change(screen.getByTestId('wizard-bay-1-cb-ref'), { target: { value: 'ABB VD4' } });
      fireEvent.change(screen.getByTestId('wizard-bay-1-ct-ref'), { target: { value: 'ABB KOFA' } });

      /* Step 3 — Transformator (auto-włączony). */
      fireEvent.click(screen.getByTestId('stepper-transformer'));
      const trCheckbox = screen.getByTestId('wizard-has-transformer') as HTMLInputElement;
      expect(trCheckbox.checked).toBe(true);
      fireEvent.change(screen.getByTestId('wizard-transformer-ref'), { target: { value: 'ABB TUMETIC 630' } });

      /* Step 8 — Save. */
      fireEvent.click(screen.getByTestId('stepper-readiness'));
      const saveBtn = screen.getByTestId('wizard-save-and-create') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);

      const snapshotBefore = useSnapshotStore.getState().snapshot;
      const subsBefore = snapshotBefore?.substations?.length ?? 0;
      const baysBefore = snapshotBefore?.bays?.length ?? 0;
      const busesBefore = snapshotBefore?.buses?.length ?? 0;
      const trsBefore = snapshotBefore?.transformers?.length ?? 0;

      fireEvent.click(saveBtn);
      /* Wait for async patchSnapshot completion (microtask). */
      await new Promise((r) => setTimeout(r, 50));

      const snapshotAfter = useSnapshotStore.getState().snapshot;
      expect(snapshotAfter?.substations?.length ?? 0).toBe(subsBefore + 1);
      expect(snapshotAfter?.bays?.length ?? 0).toBe(baysBefore + 2);
      expect(snapshotAfter?.buses?.length ?? 0).toBe(busesBefore + 2); // HV + LV
      expect(snapshotAfter?.transformers?.length ?? 0).toBe(trsBefore + 1);

      /* Substation referencje są spójne z syntetyzowaną hierarchią. */
      const newStation = snapshotAfter?.substations?.[snapshotAfter.substations.length - 1];
      expect(newStation?.name).toBe('ST-Test-R48');
      expect(newStation?.bus_refs).toHaveLength(2);
      expect(newStation?.transformer_refs).toHaveLength(1);
    });

    it('Wizard R47 — wybór typu switching auto-wyłącza hasTransformer + hasLvSide', async () => {
      render(<StationConfiguratorSurface surface={surfaceWithStation} />);
      /* Najpierw mv_lv, żeby hasTransformer=true. */
      fireEvent.change(screen.getByTestId('wizard-station-type'), { target: { value: 'mv_lv' } });
      fireEvent.click(screen.getByTestId('stepper-transformer'));
      const trCheckbox = await screen.findByTestId('wizard-has-transformer') as HTMLInputElement;
      expect(trCheckbox.checked).toBe(true);
      /* Teraz switching → auto-wyłącz. */
      fireEvent.click(screen.getByTestId('stepper-identification'));
      fireEvent.change(screen.getByTestId('wizard-station-type'), { target: { value: 'switching' } });
      fireEvent.click(screen.getByTestId('stepper-transformer'));
      const trCheckboxAfter = await screen.findByTestId('wizard-has-transformer') as HTMLInputElement;
      expect(trCheckboxAfter.checked).toBe(false);
    });
  });

  describe('SnSegmentSurface (E-12 R47 — Inline/Legacy modes)', () => {
    it('Domyślnie Inline mode (R47) — LineSegmentInline', () => {
      render(<SnSegmentSurface surface={minimalSurface} />);
      expect(screen.getByTestId('sn-segment-surface')).toBeInTheDocument();
      expect(screen.getByTestId('line-segment-inline')).toBeInTheDocument();
      expect(screen.getByTestId('line-cable-catalog')).toBeInTheDocument();
      expect(screen.getByTestId('line-length-m')).toBeInTheDocument();
    });

    it('Inline → Legacy switcher pokazuje 4-card view', () => {
      render(<SnSegmentSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('segment-mode-legacy-switch'));
      expect(screen.queryByTestId('line-segment-inline')).not.toBeInTheDocument();
      expect(screen.getByTestId('segment-tab-identification')).toBeInTheDocument();
      expect(screen.getByTestId('segment-tab-catalog')).toBeInTheDocument();
      expect(screen.getByTestId('segment-tab-route')).toBeInTheDocument();
      expect(screen.getByTestId('segment-tab-rating')).toBeInTheDocument();
    });

    it('Legacy → Inline switcher wraca do LineSegmentInline', () => {
      render(<SnSegmentSurface surface={minimalSurface} />);
      fireEvent.click(screen.getByTestId('segment-mode-legacy-switch'));
      expect(screen.queryByTestId('line-segment-inline')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('segment-mode-inline-switch'));
      expect(screen.getByTestId('line-segment-inline')).toBeInTheDocument();
    });
  });
});
