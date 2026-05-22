/**
 * Phase 0B-3: testy GpzSectionsEditor — CRUD UI dla sekcji GPZ.
 *
 * Pokrycie:
 *  - Render: lista LV/HV, przyciski "+ LV"/"+ HV", akcje "Edytuj"/"Usuń".
 *  - Add flow: open form → fill → submit → wywołanie add_gpz_section z poprawnym payload.
 *  - Edit flow: open form pre-fill → modify → submit → wywołanie update_gpz_section.
 *  - Delete flow: confirm → wywołanie delete_gpz_section.
 *  - Walidacja: pusty section_id, brak bus_ref, duplicate section_id.
 *  - Stations innego typu niż 'gpz' nie renderują editora.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { GpzSectionsEditor } from '../cards/GpzSectionsEditor';
import type { Substation } from '../../../types/enm';

const openOperationForm = vi.fn();

let currentSnapshot: Record<string, unknown> = {};

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot: currentSnapshot,
    }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { openOperationForm: typeof openOperationForm }) => unknown,
  ) => selector({ openOperationForm }),
}));

function buildGpz(): Substation {
  return {
    id: 'gpz-1',
    ref_id: 'GPZ-1',
    name: 'GPZ Centralny',
    tags: [],
    meta: {},
    station_type: 'gpz',
    bus_refs: ['b15-A', 'b15-B', 'b110-A'],
    transformer_refs: [],
    gpz_sections: [
      { section_id: 'SEC-A', order: 1, name: 'sekcja A', bus_ref: 'b15-A' },
      { section_id: 'SEC-B', order: 2, name: 'sekcja B', bus_ref: 'b15-B' },
    ],
    gpz_hv_sections: [
      { section_id: 'HV-A', order: 1, name: 'sekcja 110 A', bus_ref: 'b110-A' },
    ],
  } as Substation;
}

beforeEach(() => {
  openOperationForm.mockReset();
  currentSnapshot = {
    buses: [
      { ref_id: 'b15-A', name: 'Szyna 15 A', voltage_kv: 15 },
      { ref_id: 'b15-B', name: 'Szyna 15 B', voltage_kv: 15 },
      { ref_id: 'b110-A', name: 'Szyna 110', voltage_kv: 110 },
    ],
  };
});

describe('GpzSectionsEditor — render i listy sekcji', () => {
  it('Renderuje sekcje LV i HV z aktualnego snapshot', () => {
    const { getByTestId, queryByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    expect(getByTestId('gpz-sections-editor')).toBeTruthy();
    expect(getByTestId('gpz-sections-editor-list-lv')).toBeTruthy();
    expect(getByTestId('gpz-sections-editor-list-hv')).toBeTruthy();
    expect(queryByTestId('gpz-section-row-lv-SEC-A')).toBeTruthy();
    expect(queryByTestId('gpz-section-row-lv-SEC-B')).toBeTruthy();
    expect(queryByTestId('gpz-section-row-hv-HV-A')).toBeTruthy();
  });

  it('Stacja typu mv_lv (nie gpz) NIE renderuje editora', () => {
    const station = { ...buildGpz(), station_type: 'mv_lv' as const };
    const { queryByTestId } = render(<GpzSectionsEditor station={station} />);
    expect(queryByTestId('gpz-sections-editor')).toBeNull();
  });

  it('Pusta gpz_sections → renderuje komunikat konfiguracji dla LV i HV', () => {
    const station = { ...buildGpz(), gpz_sections: [], gpz_hv_sections: [] };
    const { getAllByText } = render(<GpzSectionsEditor station={station} />);
    expect(getAllByText(/Sekcje do konfiguracji/)).toHaveLength(2);
  });
});

describe('GpzSectionsEditor — Add flow', () => {
  it('Klik "+ LV" → otwiera form mode=add side=lv', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    const form = getByTestId('gpz-sections-editor-form');
    expect(form.getAttribute('data-mode')).toBe('add');
    expect(form.getAttribute('data-side')).toBe('lv');
  });

  it('Form LV pokazuje TYLKO szyny SN (voltage < 60)', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    const select = getByTestId('gpz-sections-editor-select-bus') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('b15-A');
    expect(optionValues).toContain('b15-B');
    expect(optionValues).not.toContain('b110-A');
  });

  it('Form HV pokazuje TYLKO szyny HV (voltage >= 60)', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-hv'));
    const select = getByTestId('gpz-sections-editor-select-bus') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('b110-A');
    expect(optionValues).not.toContain('b15-A');
  });

  it('Submit add z section_id + bus → wywołuje add_gpz_section z payload', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    fireEvent.change(getByTestId('gpz-sections-editor-input-section-id'), {
      target: { value: 'SEC-C' },
    });
    fireEvent.change(getByTestId('gpz-sections-editor-input-name'), {
      target: { value: 'sekcja C' },
    });
    fireEvent.change(getByTestId('gpz-sections-editor-select-bus'), {
      target: { value: 'b15-A' },
    });
    fireEvent.change(getByTestId('gpz-sections-editor-input-order'), {
      target: { value: '3' },
    });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));

    expect(openOperationForm).toHaveBeenCalledTimes(1);
    expect(openOperationForm).toHaveBeenCalledWith(
      'add_gpz_section',
      expect.objectContaining({
        substation_ref: 'GPZ-1',
        side: 'lv',
        section_id: 'SEC-C',
        name: 'sekcja C',
        bus_ref: 'b15-A',
        order: 3,
      }),
    );
  });

  it('Submit add z pustym section_id → walidacja inline (NIE wywołuje op)', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    fireEvent.change(getByTestId('gpz-sections-editor-select-bus'), { target: { value: 'b15-A' } });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));
    expect(openOperationForm).not.toHaveBeenCalled();
    expect(getByTestId('gpz-sections-editor-error').textContent).toMatch(/section_id/i);
  });

  it('Submit add z duplikatem section_id → walidacja inline', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    fireEvent.change(getByTestId('gpz-sections-editor-input-section-id'), {
      target: { value: 'SEC-A' }, // duplikat
    });
    fireEvent.change(getByTestId('gpz-sections-editor-select-bus'), { target: { value: 'b15-A' } });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));
    expect(openOperationForm).not.toHaveBeenCalled();
    expect(getByTestId('gpz-sections-editor-error').textContent).toMatch(/już istnieje/i);
  });

  it('Submit add bez bus_ref → walidacja inline', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    fireEvent.change(getByTestId('gpz-sections-editor-input-section-id'), {
      target: { value: 'SEC-Z' },
    });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));
    expect(openOperationForm).not.toHaveBeenCalled();
    expect(getByTestId('gpz-sections-editor-error').textContent).toMatch(/szynę|bus/i);
  });

  it('Anuluj zamyka form bez wywołania op', () => {
    const { getByTestId, queryByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-sections-editor-add-lv'));
    fireEvent.click(getByTestId('gpz-sections-editor-cancel'));
    expect(queryByTestId('gpz-sections-editor-form')).toBeNull();
    expect(openOperationForm).not.toHaveBeenCalled();
  });
});

describe('GpzSectionsEditor — Edit flow', () => {
  it('Klik "Edytuj" → form mode=edit pre-fill z istniejącej sekcji', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-edit-lv-SEC-A'));
    const form = getByTestId('gpz-sections-editor-form');
    expect(form.getAttribute('data-mode')).toBe('edit');
    const sectionIdInput = getByTestId('gpz-sections-editor-input-section-id') as HTMLInputElement;
    expect(sectionIdInput.value).toBe('SEC-A');
    expect(sectionIdInput.disabled).toBe(true); // immutable
    const nameInput = getByTestId('gpz-sections-editor-input-name') as HTMLInputElement;
    expect(nameInput.value).toBe('sekcja A');
    const orderInput = getByTestId('gpz-sections-editor-input-order') as HTMLInputElement;
    expect(orderInput.value).toBe('1');
  });

  it('Submit edit zmieniając name+order → wywołuje update_gpz_section', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-edit-lv-SEC-A'));
    fireEvent.change(getByTestId('gpz-sections-editor-input-name'), {
      target: { value: 'sekcja A — zmieniona' },
    });
    fireEvent.change(getByTestId('gpz-sections-editor-input-order'), {
      target: { value: '5' },
    });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));
    expect(openOperationForm).toHaveBeenCalledTimes(1);
    expect(openOperationForm).toHaveBeenCalledWith(
      'update_gpz_section',
      expect.objectContaining({
        substation_ref: 'GPZ-1',
        side: 'lv',
        section_id: 'SEC-A',
        updates: expect.objectContaining({
          name: 'sekcja A — zmieniona',
          order: 5,
        }),
      }),
    );
  });

  it('Edit HV section → side=hv w payload', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-edit-hv-HV-A'));
    fireEvent.change(getByTestId('gpz-sections-editor-input-name'), {
      target: { value: 'HV renamed' },
    });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));
    expect(openOperationForm).toHaveBeenCalledWith(
      'update_gpz_section',
      expect.objectContaining({ side: 'hv', section_id: 'HV-A' }),
    );
  });

  it('Wymazanie name → updates.name=null (explicit clear)', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-edit-lv-SEC-A'));
    fireEvent.change(getByTestId('gpz-sections-editor-input-name'), { target: { value: '' } });
    fireEvent.click(getByTestId('gpz-sections-editor-submit'));
    const call = openOperationForm.mock.calls[0];
    expect(call?.[1]).toMatchObject({ updates: expect.objectContaining({ name: null }) });
  });
});

describe('GpzSectionsEditor — Delete flow (inline confirm)', () => {
  it('Klik "Usuń" → pokazuje inline confirm (Tak/Anuluj), NIE wywołuje od razu', () => {
    const { getByTestId, queryByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-delete-lv-SEC-B'));
    expect(queryByTestId('gpz-section-delete-confirm-lv-SEC-B')).toBeTruthy();
    expect(openOperationForm).not.toHaveBeenCalled();
  });

  it('Klik "Usuń" → "Tak" → wywołuje delete_gpz_section', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-delete-lv-SEC-B'));
    fireEvent.click(getByTestId('gpz-section-delete-confirm-yes-lv-SEC-B'));
    expect(openOperationForm).toHaveBeenCalledWith(
      'delete_gpz_section',
      expect.objectContaining({
        substation_ref: 'GPZ-1',
        side: 'lv',
        section_id: 'SEC-B',
      }),
    );
  });

  it('Klik "Usuń" → "Anuluj" → NIE wywołuje delete_gpz_section', () => {
    const { getByTestId, queryByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-delete-lv-SEC-A'));
    fireEvent.click(getByTestId('gpz-section-delete-confirm-no-lv-SEC-A'));
    expect(queryByTestId('gpz-section-delete-confirm-lv-SEC-A')).toBeNull();
    expect(openOperationForm).not.toHaveBeenCalled();
  });

  it('Delete HV section + confirm → side=hv w payload', () => {
    const { getByTestId } = render(<GpzSectionsEditor station={buildGpz()} />);
    fireEvent.click(getByTestId('gpz-section-delete-hv-HV-A'));
    fireEvent.click(getByTestId('gpz-section-delete-confirm-yes-hv-HV-A'));
    expect(openOperationForm).toHaveBeenCalledWith(
      'delete_gpz_section',
      expect.objectContaining({ side: 'hv', section_id: 'HV-A' }),
    );
  });
});
