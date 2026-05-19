/**
 * GpzSectionsEditor — Phase 0B-3 CRUD editor sekcji GPZ (LV i HV).
 *
 * Operator-grade: lista sekcji per side z akcjami "Edytuj"/"Usuń",
 * przyciskami "Dodaj LV"/"Dodaj HV", inline form do edycji/tworzenia.
 *
 * Każda akcja wywołuje kanoniczną operację domenową:
 *  - add_gpz_section
 *  - update_gpz_section
 *  - delete_gpz_section
 *
 * ENM truth: form pre-fill z aktualnego snapshot, walidacja inline
 * (duplicate section_id, brak bus_ref, immutable section_id przy update).
 */

import { useCallback, useMemo, useState } from 'react';

import type { GPZSection, Substation } from '../../../types/enm';
import type {
  AddGpzSectionPayload,
  DeleteGpzSectionPayload,
  GpzSectionSide,
  UpdateGpzSectionPayload,
} from '../../../types/domainOps';
import { useNetworkBuildStore } from '../networkBuildStore';
import { useSnapshotStore } from '../../topology/snapshotStore';

interface EditorState {
  readonly mode: 'idle' | 'add' | 'edit';
  readonly side: GpzSectionSide;
  readonly section_id: string;
  readonly name: string;
  readonly bus_ref: string;
  readonly order: string; // string aby pozwolić pusty input; konwertujemy do liczby na submit
  readonly originalSectionId?: string;
}

interface DeleteConfirmState {
  readonly side: GpzSectionSide;
  readonly section_id: string;
}

const INITIAL_EDITOR_STATE: EditorState = {
  mode: 'idle',
  side: 'lv',
  section_id: '',
  name: '',
  bus_ref: '',
  order: '',
};

interface Props {
  readonly station: Substation;
}

/**
 * Filtruje szyny stacji per side voltage threshold:
 *  - LV (SN): voltage_kv < 60 (zwykle 6/10/15/20/30 kV).
 *  - HV: voltage_kv >= 60 (zwykle 110 kV).
 */
function filterStationBuses(
  buses: { ref_id: string; name: string; voltage_kv: number }[] | undefined,
  busRefs: readonly string[],
  side: GpzSectionSide,
): { ref_id: string; name: string; voltage_kv: number }[] {
  if (!buses) return [];
  return buses
    .filter((b) => busRefs.includes(b.ref_id))
    .filter((b) => (side === 'hv' ? b.voltage_kv >= 60 : b.voltage_kv < 60));
}

export function GpzSectionsEditor({ station }: Props) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const [editor, setEditor] = useState<EditorState>(INITIAL_EDITOR_STATE);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteConfirmState | null>(null);

  const lvSections = useMemo(() => station.gpz_sections ?? [], [station.gpz_sections]);
  const hvSections = useMemo(() => station.gpz_hv_sections ?? [], [station.gpz_hv_sections]);

  const lvBuses = useMemo(
    () => filterStationBuses(snapshot?.buses, station.bus_refs, 'lv'),
    [snapshot, station.bus_refs],
  );
  const hvBuses = useMemo(
    () => filterStationBuses(snapshot?.buses, station.bus_refs, 'hv'),
    [snapshot, station.bus_refs],
  );

  const closeEditor = useCallback(() => {
    setEditor(INITIAL_EDITOR_STATE);
    setValidationError(null);
  }, []);

  const startAdd = useCallback((side: GpzSectionSide) => {
    setEditor({
      mode: 'add',
      side,
      section_id: '',
      name: '',
      bus_ref: '',
      order: '',
    });
    setValidationError(null);
  }, []);

  const startEdit = useCallback((side: GpzSectionSide, section: GPZSection) => {
    setEditor({
      mode: 'edit',
      side,
      section_id: section.section_id,
      name: section.name ?? '',
      bus_ref: section.bus_ref,
      order: String(section.order),
      originalSectionId: section.section_id,
    });
    setValidationError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (editor.mode === 'idle') return;
    const sectionId = editor.section_id.trim();
    if (editor.mode === 'add' && !sectionId) {
      setValidationError('Identyfikator sekcji (section_id) jest wymagany.');
      return;
    }
    if (!editor.bus_ref) {
      setValidationError('Wybierz szynę dla sekcji.');
      return;
    }
    const orderRaw = editor.order.trim();
    const orderNumber = orderRaw === '' ? undefined : Number(orderRaw);
    if (orderRaw !== '' && !Number.isFinite(orderNumber)) {
      setValidationError('Order musi być liczbą całkowitą.');
      return;
    }

    if (editor.mode === 'add') {
      // Walidacja duplicate section_id po stronie klienta dla szybkiego feedbacku.
      const existing = editor.side === 'lv' ? lvSections : hvSections;
      if (existing.some((s) => s.section_id === sectionId)) {
        setValidationError(`Sekcja '${sectionId}' już istnieje.`);
        return;
      }
      const payload: AddGpzSectionPayload = {
        substation_ref: station.ref_id,
        side: editor.side,
        section_id: sectionId,
        bus_ref: editor.bus_ref,
        ...(editor.name.trim() ? { name: editor.name.trim() } : {}),
        ...(orderNumber !== undefined ? { order: orderNumber } : {}),
      };
      openOperationForm('add_gpz_section', payload as unknown as Record<string, unknown>);
      closeEditor();
      return;
    }

    // mode === 'edit'
    const updates: UpdateGpzSectionPayload['updates'] = {};
    if (editor.name.trim()) updates.name = editor.name.trim();
    else updates.name = null; // explicit clear gdy operator wymazał name
    if (editor.bus_ref) updates.bus_ref = editor.bus_ref;
    if (orderNumber !== undefined) updates.order = orderNumber;

    const payload: UpdateGpzSectionPayload = {
      substation_ref: station.ref_id,
      side: editor.side,
      section_id: sectionId,
      updates,
    };
    openOperationForm('update_gpz_section', payload as unknown as Record<string, unknown>);
    closeEditor();
  }, [editor, lvSections, hvSections, station.ref_id, openOperationForm, closeEditor]);

  const requestDelete = useCallback((side: GpzSectionSide, sectionId: string) => {
    setPendingDelete({ side, section_id: sectionId });
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const payload: DeleteGpzSectionPayload = {
      substation_ref: station.ref_id,
      side: pendingDelete.side,
      section_id: pendingDelete.section_id,
    };
    openOperationForm('delete_gpz_section', payload as unknown as Record<string, unknown>);
    setPendingDelete(null);
  }, [pendingDelete, station.ref_id, openOperationForm]);

  const renderSectionRow = (side: GpzSectionSide, section: GPZSection) => {
    const isPendingDelete =
      pendingDelete !== null
      && pendingDelete.side === side
      && pendingDelete.section_id === section.section_id;
    return (
      <li
        key={`${side}-${section.section_id}`}
        data-testid={`gpz-section-row-${side}-${section.section_id}`}
        className="flex items-center justify-between gap-2 py-1 text-sm"
      >
        <span className="flex-1 font-mono">
          <span className="text-zinc-300">{section.section_id}</span>
          <span className="text-zinc-500"> · porządek {section.order}</span>
          <span className="text-zinc-400">{section.name ? ` · ${section.name}` : ''}</span>
          <span className="text-zinc-500"> · szyna {section.bus_ref}</span>
        </span>
        {isPendingDelete ? (
          <span
            data-testid={`gpz-section-delete-confirm-${side}-${section.section_id}`}
            className="flex items-center gap-1"
          >
            <span className="text-xs text-red-300">Potwierdź usunięcie?</span>
            <button
              type="button"
              data-testid={`gpz-section-delete-confirm-yes-${side}-${section.section_id}`}
              className="rounded border border-red-700 bg-red-900/40 px-2 py-0.5 text-xs text-red-200"
              onClick={confirmDelete}
            >
              Tak
            </button>
            <button
              type="button"
              data-testid={`gpz-section-delete-confirm-no-${side}-${section.section_id}`}
              className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300"
              onClick={cancelDelete}
            >
              Anuluj
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              data-testid={`gpz-section-edit-${side}-${section.section_id}`}
              className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => startEdit(side, section)}
            >
              Edytuj
            </button>
            <button
              type="button"
              data-testid={`gpz-section-delete-${side}-${section.section_id}`}
              className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/30"
              onClick={() => requestDelete(side, section.section_id)}
            >
              Usuń
            </button>
          </>
        )}
      </li>
    );
  };

  const renderForm = () => {
    if (editor.mode === 'idle') return null;
    const buses = editor.side === 'lv' ? lvBuses : hvBuses;
    const isEdit = editor.mode === 'edit';
    return (
      <div
        data-testid="gpz-sections-editor-form"
        data-mode={editor.mode}
        data-side={editor.side}
        className="mt-2 rounded border border-zinc-700 bg-zinc-900 p-3"
      >
        <div className="mb-2 text-xs font-semibold uppercase text-zinc-400">
          {isEdit ? 'Edycja sekcji' : 'Nowa sekcja'} {editor.side.toUpperCase()}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">ID sekcji</span>
            <input
              type="text"
              data-testid="gpz-sections-editor-input-section-id"
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-zinc-100 disabled:opacity-50"
              value={editor.section_id}
              disabled={isEdit /* immutable */}
              onChange={(e) => setEditor({ ...editor, section_id: e.target.value })}
              placeholder="np. SEC-A"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Porządek</span>
            <input
              type="number"
              data-testid="gpz-sections-editor-input-order"
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-100"
              value={editor.order}
              onChange={(e) => setEditor({ ...editor, order: e.target.value })}
              placeholder="auto"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Nazwa</span>
            <input
              type="text"
              data-testid="gpz-sections-editor-input-name"
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-100"
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder="np. sekcja A"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Szyna</span>
            <select
              data-testid="gpz-sections-editor-select-bus"
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-zinc-100"
              value={editor.bus_ref}
              onChange={(e) => setEditor({ ...editor, bus_ref: e.target.value })}
            >
              <option value="">— wybierz —</option>
              {buses.map((b) => (
                <option key={b.ref_id} value={b.ref_id}>
                  {b.ref_id} ({b.name}, {b.voltage_kv} kV)
                </option>
              ))}
            </select>
          </label>
        </div>
        {validationError ? (
          <div data-testid="gpz-sections-editor-error" className="mt-2 text-xs text-red-400">
            {validationError}
          </div>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            data-testid="gpz-sections-editor-cancel"
            className="rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-300"
            onClick={closeEditor}
          >
            Anuluj
          </button>
          <button
            type="button"
            data-testid="gpz-sections-editor-submit"
            className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1 text-xs text-emerald-200"
            onClick={handleSubmit}
          >
            {isEdit ? 'Zapisz' : 'Dodaj'}
          </button>
        </div>
      </div>
    );
  };

  if (station.station_type !== 'gpz') return null;

  return (
    <section
      data-testid="gpz-sections-editor"
      className="border-t border-zinc-800 px-4 py-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Sekcje GPZ</h3>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="gpz-sections-editor-add-lv"
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => startAdd('lv')}
          >
            + LV (SN)
          </button>
          <button
            type="button"
            data-testid="gpz-sections-editor-add-hv"
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => startAdd('hv')}
          >
            + HV (110 kV)
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div className="text-xs uppercase text-zinc-500">LV (SN)</div>
        {lvSections.length === 0 ? (
          <div className="py-1 text-xs text-zinc-500">Sekcje do konfiguracji.</div>
        ) : (
          <ul data-testid="gpz-sections-editor-list-lv">
            {lvSections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => renderSectionRow('lv', s))}
          </ul>
        )}
      </div>

      <div>
        <div className="text-xs uppercase text-zinc-500">HV (110 kV)</div>
        {hvSections.length === 0 ? (
          <div className="py-1 text-xs text-zinc-500">Sekcje do konfiguracji.</div>
        ) : (
          <ul data-testid="gpz-sections-editor-list-hv">
            {hvSections
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((s) => renderSectionRow('hv', s))}
          </ul>
        )}
      </div>

      {renderForm()}
    </section>
  );
}
