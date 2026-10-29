/**
 * Rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC — menu stanu łącznika na symbolu APARATU pola
 * działa na TYM aparacie (żywa kanwa `SldCanvasV3Workspace`, natywny prawy klik w uchwyt aparatu
 * warstwy trafień, klik pozycji menu).
 *
 * Defekt (pomiar 2026-10-29): „Otwórz łącznik" na odłączniku szynowym Q1 albo uziemniku Q8 pola
 * GPZ otwierał WYŁĄCZNIK pola — temat menu tracił ref aparatu, a resolver łącznika brał jedyną
 * gałąź łączeniową pola. Łącznik pola bez gałęzi nie miał pisarza położenia, a „uziemiony"
 * łącznika trójpołożeniowego był nieosiągalny z produktu.
 *
 * Iloczyn cech: aparat {odłącznik szynowy Q1, uziemnik Q8, wyłącznik Q0 (Z.10 z wyłącznikiem
 * stałym), łącznik trójpołożeniowy Q1 toru, łącznik trójpołożeniowy Q5 odgałęzienia przekładnika,
 * przekładnik prądowy T1 (Z.11.1)} × położenie z modelu {brak rekordu, zamknięty, otwarty,
 * uziemiony — tylko trójpołożeniowy} × pozycja menu {otwórz, zamknij, uziem, punkt normalnie
 * otwarty}. Wyrocznia: tabela reguł z kontraktu operacji (KONTRAKT_OPERACJI_ENM_OP §3.7d),
 * niezależna od kodu menu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { BayDeviceState, BayPrimaryDevice, EnergyNetworkModel } from '../../../../../types/enm';
import fxZ10 from '../../../../../harness-fixtures/generated/pole_liniowe_z10_gpz_staly_w_sekcji_1.json';
import fxZ11 from '../../../../../harness-fixtures/generated/pole_liniowe_z11_gpz_odgalezienie.json';
import { useAppStateStore } from '../../../../app-state';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useNotificationStore } from '../../../../notifications/store';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { SLD_MENU_REGISTRY } from '../../../v2/command/SldCommandService';

const Z10 = (fxZ10 as unknown as { readonly snapshot: EnergyNetworkModel }).snapshot;
const Z11 = (fxZ11 as unknown as { readonly snapshot: EnergyNetworkModel }).snapshot;
const POLE = '/bay/001/001';

type Polozenie = 'brak' | 'zamkniety' | 'otwarty' | 'uziemiony';
type Akcja = 'open-switch' | 'close-switch' | 'earth-switch' | 'set-normal-open-point';
const AKCJE: readonly Akcja[] = ['open-switch', 'close-switch', 'earth-switch', 'set-normal-open-point'];

interface Aparat {
  readonly opis: string;
  readonly model: EnergyNetworkModel;
  readonly oznaczenie: string;
  readonly rodzaj: 'DS' | 'ES' | 'CB' | 'THREE_POSITION_SWITCH' | 'CT';
  readonly polozenia: readonly Polozenie[];
}

const APARATY: readonly Aparat[] = [
  { opis: 'odłącznik szynowy Q1 (Z.10)', model: Z10, oznaczenie: 'Q1', rodzaj: 'DS', polozenia: ['brak', 'zamkniety', 'otwarty'] },
  { opis: 'uziemnik Q8 (Z.10)', model: Z10, oznaczenie: 'Q8', rodzaj: 'ES', polozenia: ['brak', 'zamkniety', 'otwarty'] },
  { opis: 'wyłącznik Q0 (Z.10)', model: Z10, oznaczenie: 'Q0', rodzaj: 'CB', polozenia: ['zamkniety', 'otwarty'] },
  {
    opis: 'łącznik trójpołożeniowy Q1 toru (Z.11.1)',
    model: Z11,
    oznaczenie: 'Q1',
    rodzaj: 'THREE_POSITION_SWITCH',
    polozenia: ['brak', 'zamkniety', 'otwarty', 'uziemiony'],
  },
  {
    opis: 'łącznik trójpołożeniowy Q5 odgałęzienia przekładnika (Z.11.1)',
    model: Z11,
    oznaczenie: 'Q5',
    rodzaj: 'THREE_POSITION_SWITCH',
    polozenia: ['brak', 'zamkniety', 'otwarty', 'uziemiony'],
  },
  { opis: 'przekładnik prądowy T1 (Z.11.1)', model: Z11, oznaczenie: 'T1', rodzaj: 'CT', polozenia: ['brak'] },
];

/** Wynik oczekiwany pozycji menu: wywołanie operacji albo blokada z fragmentem powodu. */
type Oczekiwane =
  | { readonly blokada: string }
  | { readonly operacja: string; readonly ladunek: (bayRef: string, aparat: BayPrimaryDevice) => Record<string, unknown> }
  | { readonly formularz: string };

function oczekiwane(rodzaj: Aparat['rodzaj'], p: Polozenie, akcja: Akcja): Oczekiwane {
  if (rodzaj === 'CT') return { blokada: 'nie jest łącznikiem' };
  if (rodzaj === 'CB') {
    if (akcja === 'earth-switch') return { blokada: 'wyłącznie łącznik trójpołożeniowy' };
    if (akcja === 'set-normal-open-point') return { formularz: 'set_normal_open_point' };
    if (akcja === 'open-switch' && p === 'otwarty') return { blokada: 'już otwarty' };
    if (akcja === 'close-switch' && p === 'zamkniety') return { blokada: 'już zamknięty' };
    const operacja = akcja === 'open-switch' ? 'open_switch' : 'close_switch';
    return { operacja, ladunek: (_b, a) => ({ switch_ref: a.linked_ref }) };
  }
  if (akcja === 'set-normal-open-point') return { blokada: 'nie ma własnej gałęzi' };
  const trojpolozeniowy = rodzaj === 'THREE_POSITION_SWITCH';
  if (akcja === 'earth-switch' && !trojpolozeniowy) return { blokada: 'wyłącznie łącznik trójpołożeniowy' };
  const cel = akcja === 'open-switch' ? 'otwarty' : akcja === 'close-switch' ? 'zamkniety' : 'uziemiony';
  if (p === cel) return { blokada: 'już' };
  if (trojpolozeniowy && ((p === 'zamkniety' && cel === 'uziemiony') || (p === 'uziemiony' && cel === 'zamkniety'))) {
    return { blokada: 'przez położenie otwarte' };
  }
  return {
    operacja: 'set_bay_apparatus_position',
    ladunek: (bayRef, a) => ({ bay_ref: bayRef, device_ref: a.device_ref, actual_state: cel }),
  };
}

function zPolozeniem(a: Aparat, p: Polozenie): { model: EnergyNetworkModel; bayRef: string; aparat: BayPrimaryDevice } {
  const model = structuredClone(a.model) as EnergyNetworkModel;
  const bay = (model.bays ?? []).find((b) => b.ref_id.endsWith(POLE) && (b.tags ?? []).includes('gpz_line_field'))!;
  const aparat = bay.primary_devices!.find((d) => d.designation === a.oznaczenie)!;
  expect(aparat.kind, a.opis).toBe(a.rodzaj);
  if (a.rodzaj === 'CB') {
    const galaz = (model.branches ?? []).find((g) => g.ref_id === aparat.linked_ref)! as { status: string };
    galaz.status = p === 'otwarty' ? 'open' : 'closed';
  } else if (a.rodzaj !== 'CT') {
    aparat.switch_state = p === 'brak'
      ? null
      : ({ actual_state: p as BayDeviceState } as NonNullable<BayPrimaryDevice['switch_state']>);
  }
  return { model, bayRef: bay.ref_id, aparat };
}

let wykonaj: ReturnType<typeof vi.fn>;
let formularz: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useNotificationStore.getState().clearAll();
  formularz = vi.fn();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [], openOperationForm: formularz, openRouteSurface: vi.fn() } as never);
  wykonaj = vi.fn().mockResolvedValue({ snapshot: {} });
  useAppStateStore.setState({ activeCaseId: 'przypadek-polozenie' });
});

afterEach(() => cleanup());

describe('menu stanu łącznika na symbolu aparatu pola — aparat × położenie × pozycja', () => {
  for (const a of APARATY) {
    for (const p of a.polozenia) {
      for (const akcja of AKCJE) {
        it(`${a.opis} × ${p} × ${akcja}`, () => {
          const { model, bayRef, aparat } = zPolozeniem(a, p);
          useSnapshotStore.setState({ snapshot: model, executeDomainOperation: wykonaj } as never);
          const { container } = render(<SldCanvasV3Workspace width={1400} height={900} lodOverride={2} />);
          const uchwyt = container.querySelector(`[data-hit-klasa="aparat"][data-hit-device-ref="${aparat.device_ref}"]`);
          expect(uchwyt, `uchwyt aparatu ${a.oznaczenie}`).toBeTruthy();
          fireEvent.contextMenu(uchwyt!, { clientX: 120, clientY: 80 });
          const pozycja = screen.getByTestId(`sld-menu-${akcja}`) as HTMLButtonElement;
          const o = oczekiwane(a.rodzaj, p, akcja);
          if ('blokada' in o) {
            expect(pozycja.disabled, 'pozycja zablokowana').toBe(true);
            expect(pozycja.getAttribute('title') ?? '').toContain(o.blokada);
            fireEvent.click(pozycja);
            expect(wykonaj).not.toHaveBeenCalled();
            return;
          }
          expect(pozycja.disabled, pozycja.getAttribute('title') ?? '').toBe(false);
          fireEvent.click(pozycja);
          if ('formularz' in o) {
            expect(formularz).toHaveBeenCalledTimes(1);
            expect(formularz.mock.calls[0]![0]).toBe(o.formularz);
            expect((formularz.mock.calls[0]![1] as { switch_ref?: string }).switch_ref).toBe(aparat.linked_ref);
            expect(wykonaj).not.toHaveBeenCalled();
            return;
          }
          expect(wykonaj).toHaveBeenCalledTimes(1);
          const [przypadek, operacja, ladunek] = wykonaj.mock.calls[0]!;
          expect(przypadek).toBe('przypadek-polozenie');
          expect(operacja).toBe(o.operacja);
          expect(ladunek).toEqual(o.ladunek(bayRef, aparat));
        });
      }
    }
  }

  it('rejestr menu: „Uziem łącznik" wyłącznie w menu aparatu — menu pola nie wybiera aparatu za projektanta', () => {
    expect(SLD_MENU_REGISTRY.apparatus.map((x) => x.id)).toContain('earth-switch');
    expect(SLD_MENU_REGISTRY.bay.map((x) => x.id)).not.toContain('earth-switch');
  });
});
