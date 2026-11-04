/**
 * GpzSectionsEditor — Phase 0B-3 CRUD editor sekcji GPZ (LV i HV).
 *
 * Operator-grade: lista sekcji per side z akcjami "Edytuj"/"Usuń",
 * przyciskami "Dodaj LV"/"Dodaj HV", inline form do edycji/tworzenia.
 *
 * Każda akcja WYKONUJE kanoniczną operację domenową wprost (`executeDomainOperation`):
 *  - add_gpz_section
 *  - update_gpz_section
 *  - delete_gpz_section
 *
 * Karta KATALOG-PRZEJECIE-PR: do niej edytor otwierał te operacje przez
 * `openOperationForm`, a rejestr formularzy (`workspace/operationFormRegistry.tsx`) nie ma dla
 * nich formularza — router pokazywał zawiadomienie „operacja bez formularza" pod nagłówkiem
 * „Odświeżenie modelu" i nic się nie zapisywało. Formularz inline tego edytora JEST
 * formularzem operacji; odmowa backendu wraca w polu błędu edytora.
 *
 * ENM truth: form pre-fill z aktualnego snapshot, walidacja inline
 * (duplicate section_id, brak bus_ref, immutable section_id przy update); lista szyn nowej
 * sekcji to szyny stacji właściwej strony BEZ sekcji (ten sam predykat co backend
 * `_blad_szyny_sekcji_gpz`: jedna szyna niesie jedną sekcję).
 */

import { useCallback, useMemo, useState } from 'react';

import type { GPZSection, Substation } from '../../../types/enm';
import type {
  AddGpzSectionPayload,
  DeleteGpzSectionPayload,
  GpzSectionSide,
  UpdateGpzSectionPayload,
} from '../../../types/domainOps';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveCaseId } from '../../app-state/store';
import { wPasmieWn } from '../../../ui2/model/pasmaNapieciowe';

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

/** Szyny stacji danej strony, na których nie leży żadna sekcja (LV ani HV) — kandydaci nowej
 *  sekcji. Przy edycji sekcji jej własna szyna zostaje na liście. */
export function wolneSzynySekcji(
  buses: { ref_id: string; name: string; voltage_kv: number }[],
  station: Pick<Substation, 'gpz_sections' | 'gpz_hv_sections'>,
  szynaEdytowanej: string | null,
): { ref_id: string; name: string; voltage_kv: number }[] {
  const zajete = new Set(
    [...(station.gpz_sections ?? []), ...(station.gpz_hv_sections ?? [])]
      .map((s) => s.bus_ref)
      .filter((ref) => ref !== szynaEdytowanej),
  );
  return buses.filter((b) => !zajete.has(b.ref_id));
}

/** Proponowany identyfikator nowej sekcji: następny wolny numer w stacji (`…/sekcja-sn-03`). */
function proponowanyIdSekcji(station: Substation, side: GpzSectionSide): string {
  const istniejace = new Set(
    [...(station.gpz_sections ?? []), ...(station.gpz_hv_sections ?? [])].map((s) => s.section_id),
  );
  const strona = side === 'hv' ? 'wn' : 'sn';
  for (let n = 1; ; n += 1) {
    const kandydat = `${station.ref_id}/sekcja-${strona}-${String(n).padStart(2, '0')}`;
    if (!istniejace.has(kandydat)) return kandydat;
  }
}

/**
 * Filtruje szyny stacji per strona GPZ (jedno lustro pasm `ui2/model/pasmaNapieciowe`):
 *  - HV: szyna w paśmie WN (od 110 kV, zwykle 110 kV).
 *  - LV (SN): każda pozostała szyna stacji (zwykle 6/10/15/20/30 kV) — dopełnienie
 *    tego samego predykatu, więc żadna szyna nie wypada z obu stron naraz.
 */
function filterStationBuses(
  buses: { ref_id: string; name: string; voltage_kv: number }[] | undefined,
  busRefs: readonly string[],
  side: GpzSectionSide,
): { ref_id: string; name: string; voltage_kv: number }[] {
  if (!buses) return [];
  return buses
    .filter((b) => busRefs.includes(b.ref_id))
    .filter((b) => (side === 'hv' ? wPasmieWn(b.voltage_kv) : !wPasmieWn(b.voltage_kv)));
}

export function GpzSectionsEditor({ station }: Props) {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useActiveCaseId();
  const [editor, setEditor] = useState<EditorState>(INITIAL_EDITOR_STATE);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
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
  const busName = useMemo(() => {
    const mapa = new Map((snapshot?.buses ?? []).map((b) => [b.ref_id, b]));
    return (ref: string) => {
      const szyna = mapa.get(ref);
      return szyna ? `${szyna.name} · ${szyna.voltage_kv} kV` : ref;
    };
  }, [snapshot]);
  const fieldCount = useMemo(() => {
    const licznik = new Map<string, number>();
    for (const bay of snapshot?.bays ?? []) {
      if (bay.substation_ref !== station.ref_id) continue;
      licznik.set(bay.bus_ref, (licznik.get(bay.bus_ref) ?? 0) + 1);
    }
    return licznik;
  }, [snapshot, station.ref_id]);

  const closeEditor = useCallback(() => {
    setEditor(INITIAL_EDITOR_STATE);
    setValidationError(null);
  }, []);

  const wykonaj = useCallback(
    async (name: string, payload: Record<string, unknown>): Promise<boolean> => {
      if (!activeCaseId) {
        setOperationError('Zmiana sekcji wymaga aktywnego zakresu obliczeń.');
        return false;
      }
      setOperationError(null);
      const odpowiedz = await executeDomainOperation(activeCaseId, name, payload);
      if (!odpowiedz || odpowiedz.error) {
        setOperationError(odpowiedz?.error ?? 'Operacja na sekcji nie została wykonana.');
        return false;
      }
      return true;
    },
    [activeCaseId, executeDomainOperation],
  );

  const startAdd = useCallback((side: GpzSectionSide) => {
    setEditor({
      mode: 'add',
      side,
      section_id: proponowanyIdSekcji(station, side),
      name: '',
      bus_ref: '',
      order: '',
    });
    setValidationError(null);
  }, [station]);

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

  const handleSubmit = useCallback(async () => {
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
    if (orderRaw !== '' && !Number.isInteger(orderNumber)) {
      setValidationError('Porządek sekcji musi być liczbą całkowitą.');
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
      if (await wykonaj('add_gpz_section', payload as unknown as Record<string, unknown>)) {
        closeEditor();
      }
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
    if (await wykonaj('update_gpz_section', payload as unknown as Record<string, unknown>)) {
      closeEditor();
    }
  }, [editor, lvSections, hvSections, station.ref_id, wykonaj, closeEditor]);

  const requestDelete = useCallback((side: GpzSectionSide, sectionId: string) => {
    setPendingDelete({ side, section_id: sectionId });
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const payload: DeleteGpzSectionPayload = {
      substation_ref: station.ref_id,
      side: pendingDelete.side,
      section_id: pendingDelete.section_id,
    };
    setPendingDelete(null);
    await wykonaj('delete_gpz_section', payload as unknown as Record<string, unknown>);
  }, [pendingDelete, station.ref_id, wykonaj]);

  const przycisk =
    'rounded border border-scada-border px-2 py-0.5 text-[length:var(--mvd-font-size-data)] text-scada-text hover:bg-scada-surface';

  const renderSectionRow = (side: GpzSectionSide, section: GPZSection) => {
    const isPendingDelete =
      pendingDelete !== null
      && pendingDelete.side === side
      && pendingDelete.section_id === section.section_id;
    return (
      <tr
        key={`${side}-${section.section_id}`}
        data-testid={`gpz-section-row-${side}-${section.section_id}`}
        className="border-t border-scada-border"
      >
        <td className="py-1 pr-2 text-scada-text">{section.name || section.section_id}</td>
        <td className="py-1 pr-2 text-scada-muted">{busName(section.bus_ref)}</td>
        <td className="mvd-num py-1 pr-2 text-scada-text">{fieldCount.get(section.bus_ref) ?? 0}</td>
        <td className="py-1 text-right">
          {isPendingDelete ? (
            <span
              data-testid={`gpz-section-delete-confirm-${side}-${section.section_id}`}
              className="inline-flex items-center gap-1"
            >
              <span className="text-sygnal-blokada-tusz">Usunąć sekcję?</span>
              <button
                type="button"
                data-testid={`gpz-section-delete-confirm-yes-${side}-${section.section_id}`}
                className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo px-2 py-0.5 text-sygnal-blokada-tusz"
                onClick={() => void confirmDelete()}
              >
                Tak
              </button>
              <button
                type="button"
                data-testid={`gpz-section-delete-confirm-no-${side}-${section.section_id}`}
                className={przycisk}
                onClick={cancelDelete}
              >
                Anuluj
              </button>
            </span>
          ) : (
            <span className="inline-flex gap-1">
              <button
                type="button"
                data-testid={`gpz-section-edit-${side}-${section.section_id}`}
                className={przycisk}
                onClick={() => startEdit(side, section)}
              >
                Edytuj
              </button>
              <button
                type="button"
                data-testid={`gpz-section-delete-${side}-${section.section_id}`}
                className="rounded border border-sygnal-blokada px-2 py-0.5 text-sygnal-blokada-tusz hover:bg-sygnal-blokada-tlo"
                onClick={() => requestDelete(side, section.section_id)}
              >
                Usuń
              </button>
            </span>
          )}
        </td>
      </tr>
    );
  };

  const pole =
    'rounded border border-scada-border bg-scada-surface px-2 py-1 text-scada-text disabled:opacity-50';
  const renderForm = () => {
    if (editor.mode === 'idle') return null;
    const isEdit = editor.mode === 'edit';
    const buses = wolneSzynySekcji(
      editor.side === 'lv' ? lvBuses : hvBuses,
      station,
      isEdit ? editor.bus_ref : null,
    );
    return (
      <div
        data-testid="gpz-sections-editor-form"
        data-mode={editor.mode}
        data-side={editor.side}
        className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 rounded border border-scada-border p-2 text-[length:var(--mvd-font-size-data)]"
      >
        <span className="col-span-2 font-semibold text-scada-muted">
          {isEdit ? 'Edycja sekcji' : 'Nowa sekcja'} {editor.side === 'hv' ? 'WN' : 'SN'}
        </span>
        <span className="text-scada-muted">Identyfikator</span>
        <input
          type="text"
          data-testid="gpz-sections-editor-input-section-id"
          className={`${pole} font-mono`}
          value={editor.section_id}
          disabled={isEdit /* immutable */}
          onChange={(e) => setEditor({ ...editor, section_id: e.target.value })}
        />
        <span className="text-scada-muted">Nazwa</span>
        <input
          type="text"
          data-testid="gpz-sections-editor-input-name"
          className={pole}
          value={editor.name}
          onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          placeholder="np. Sekcja 3"
        />
        <span className="text-scada-muted">Porządek</span>
        <input
          type="number"
          data-testid="gpz-sections-editor-input-order"
          className={pole}
          value={editor.order}
          onChange={(e) => setEditor({ ...editor, order: e.target.value })}
          placeholder="następny"
        />
        <span className="text-scada-muted">Szyna</span>
        <select
          data-testid="gpz-sections-editor-select-bus"
          className={pole}
          value={editor.bus_ref}
          onChange={(e) => setEditor({ ...editor, bus_ref: e.target.value })}
        >
          <option value="">— wybierz —</option>
          {buses.map((b) => (
            <option key={b.ref_id} value={b.ref_id}>
              {b.name} · {b.voltage_kv} kV
            </option>
          ))}
        </select>
        {buses.length === 0 && (
          <span data-testid="gpz-sections-editor-no-free-bus" className="col-span-2 text-scada-muted">
            Każda szyna tej strony stacji ma już sekcję — jedna szyna niesie jedną sekcję.
          </span>
        )}
        {validationError ? (
          <span data-testid="gpz-sections-editor-error" className="col-span-2 text-sygnal-blokada-tusz">
            {validationError}
          </span>
        ) : null}
        <span className="col-span-2 flex justify-end gap-2">
          <button
            type="button"
            data-testid="gpz-sections-editor-cancel"
            className={przycisk}
            onClick={closeEditor}
          >
            Anuluj
          </button>
          <button
            type="button"
            data-testid="gpz-sections-editor-submit"
            className="rounded border border-sygnal-ok bg-sygnal-ok-tlo px-3 py-0.5 text-sygnal-ok-tusz"
            onClick={() => void handleSubmit()}
          >
            {isEdit ? 'Zapisz' : 'Dodaj'}
          </button>
        </span>
      </div>
    );
  };

  if (station.station_type !== 'gpz') return null;

  const renderGrupa = (side: GpzSectionSide, sekcje: readonly GPZSection[]) => (
    <>
      <tr>
        <th
          colSpan={4}
          className="pt-2 text-left font-semibold text-scada-muted"
        >
          {side === 'hv' ? 'Strona WN (110 kV)' : 'Strona SN'}
        </th>
      </tr>
      {sekcje.length === 0 ? (
        <tr>
          <td colSpan={4} className="py-1 text-scada-muted">Sekcje do konfiguracji.</td>
        </tr>
      ) : (
        sekcje
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => renderSectionRow(side, s))
      )}
    </>
  );

  return (
    <section
      data-testid="gpz-sections-editor"
      className="text-[length:var(--mvd-font-size-data)]"
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-semibold text-scada-text">Sekcje szyn GPZ</h3>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="gpz-sections-editor-add-lv"
            className={przycisk}
            onClick={() => startAdd('lv')}
          >
            + sekcja SN
          </button>
          <button
            type="button"
            data-testid="gpz-sections-editor-add-hv"
            className={przycisk}
            onClick={() => startAdd('hv')}
          >
            + sekcja WN
          </button>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-scada-muted">
            <th className="font-normal">Sekcja</th>
            <th className="font-normal">Szyna</th>
            <th className="font-normal">Pola</th>
            <th />
          </tr>
        </thead>
        <tbody data-testid="gpz-sections-editor-list-lv">{renderGrupa('lv', lvSections)}</tbody>
        <tbody data-testid="gpz-sections-editor-list-hv">{renderGrupa('hv', hvSections)}</tbody>
      </table>
      {operationError ? (
        <div data-testid="gpz-sections-editor-operation-error" className="mt-1 text-sygnal-blokada-tusz">
          {operationError}
        </div>
      ) : null}
      {renderForm()}
    </section>
  );
}
