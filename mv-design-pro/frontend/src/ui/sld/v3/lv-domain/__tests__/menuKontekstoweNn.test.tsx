/**
 * Menu kontekstowe schematu nN (portal domeny nN) — ścieżka NATYWNA: prawy przycisk myszy
 * na obiekcie rysunku (`userEvent.pointer` z `MouseRight`), pozycja menu, wykonawca.
 *
 * ILOCZYN CECH:
 *  - obiekt rysunku {krawędź kabla, aparat odpływowy, aparat zasilania (incomer), zacisk,
 *    odbiór, szyna rozdzielnicy} × menu {otwiera się z właściwym nagłówkiem / nie otwiera};
 *  - pozycja {formularz, operacja wprost, usunięcie} × stan {dostępna, zablokowana z powodem};
 *  - tryb {edycja, podgląd schematu}: pozycje zmieniające model w podglądzie nie wykonują nic;
 *  - zacisk stopnia 2 bez glifu × obszar trafienia (bez niego pas kabla przykrywał zacisk).
 *  - źródło topologii: migawka modelu ENM PUSTA (`null`) — temat menu, blokady i ładunek
 *    operacji bezpośredniej pochodzą wyłącznie z grafu projekcji nN (reguła R4
 *    `lv_domain_projection_guard`); wykonawca bez ładunku z portalu odmawia.
 * Projekcja nN z fikstury scenariusza backendu (`01_single_tr`).
 */
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../app-state';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useNotificationStore } from '../../../../notifications/store';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { scenariusz } from '../fixtures/scenariusze';
import { POWOD_BRAKU_SCHEMATU_NN_PL, useSldActionExecutor } from '../../../shared/sldActionExecutor';
import { POWOD_KOPII_ROLI_PL, POWOD_SCALENIA_PL } from '../operacjeNn';
import { PAS_TRAFIENIA_KABLA_PX, PROMIEN_TRAFIENIA_ZACISKU_PX } from '../visualGrammar';

vi.mock('../projectionApi', async (importOriginal) => {
  const oryginal = await importOriginal<typeof import('../projectionApi')>();
  return { ...oryginal, fetchLvDomainProjectionV1: vi.fn(() => Promise.resolve(scenariusz('01_single_tr'))) };
});

import { LvDomainPortal } from '../LvDomainPortal';

async function prawyKlik(element: Element): Promise<void> {
  await userEvent.setup().pointer({ keys: '[MouseRight]', target: element });
}

function wezel(rodzaj: string, ref: string): Element {
  const el = document.querySelector(`[data-node-kind="${rodzaj}"][data-owner-ref="${ref}"]`);
  if (!el) throw new Error(`brak węzła ${rodzaj}/${ref}`);
  return el;
}

async function renderuj(readOnly = false): Promise<void> {
  render(
    <LvDomainPortal caseId="case-1" stationRef="st-1" width={1400} height={1000} onClose={() => undefined} readOnly={readOnly} />,
  );
  await waitFor(() => expect(screen.getByTestId('lv-domain-portal')).toHaveAttribute('data-loading', 'false'));
}

let executeDomainOperation: ReturnType<typeof vi.fn>;
let openOperationForm: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useAppStateStore.getState().reset();
  useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
  executeDomainOperation = vi.fn().mockResolvedValue({ snapshot: {} });
  openOperationForm = vi.fn();
  useSnapshotStore.setState({ snapshot: null, executeDomainOperation } as never);
  useNetworkBuildStore.setState({ openOperationForm } as never);
  useNotificationStore.setState({ notifications: [] } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Obiekt rysunku nN × menu', () => {
  it('kabel: prawy klik na linii kabla otwiera menu odcinka; „Edytuj warunki ułożenia" otwiera formularz', async () => {
    await renderuj();
    await prawyKlik(screen.getByTestId('lv-domain-edge-hit-QF-01_kabel'));
    expect(screen.getByText(/Odcinek kabla nN/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('sld-menu-set-nn-laying'));
    expect(openOperationForm).toHaveBeenCalledWith(
      'set_nn_cable_laying_conditions',
      expect.objectContaining({ segment_ref: 'QF-01_kabel' }),
    );
    expect(screen.queryByTestId('sld-menu-set-nn-laying')).toBeNull();
  });

  it('aparat odpływowy: „Kopiuj odpływ" dostępne i wykonuje copy_nn_feeder', async () => {
    await renderuj();
    await prawyKlik(wezel('apparatus', 'QF-01'));
    const pozycja = screen.getByTestId('sld-menu-copy-nn-feeder');
    expect(pozycja).not.toBeDisabled();
    await userEvent.setup().click(pozycja);
    expect(executeDomainOperation).toHaveBeenCalledWith(
      'case-1',
      'copy_nn_feeder',
      { feeder_apparatus_ref: 'QF-01' },
      expect.anything(),
    );
  });

  it('aparat zasilania rozdzielnicy (rola z projekcji): „Kopiuj odpływ" zablokowane z powodem, klik bez skutku', async () => {
    await renderuj();
    await prawyKlik(wezel('apparatus', 'QF-T1'));
    const pozycja = screen.getByTestId('sld-menu-copy-nn-feeder');
    expect(pozycja).toBeDisabled();
    expect(pozycja).toHaveAttribute('title', POWOD_KOPII_ROLI_PL);
    await userEvent.setup().click(pozycja);
    expect(executeDomainOperation).not.toHaveBeenCalled();
  });

  it('zacisk z kablem i aparatem: „Scal odcinki" zablokowane z powodem; usunięcie dostępne', async () => {
    await renderuj();
    await prawyKlik(wezel('terminal', 'QF-01_zacisk'));
    expect(screen.getByTestId('sld-menu-merge-nn-segments')).toBeDisabled();
    expect(screen.getByTestId('sld-menu-merge-nn-segments')).toHaveAttribute('title', POWOD_SCALENIA_PL);
    expect(screen.getByTestId('sld-menu-delete-nn-terminal')).not.toBeDisabled();
  });

  it('zacisk stopnia 2 (styk dwóch gałęzi, bez kropki) ma obszar trafienia; prawy klik w niego otwiera menu zacisku', async () => {
    await renderuj();
    const trafienie = screen.getByTestId('lv-domain-node-hit-QF-01_zacisk');
    expect(wezel('terminal', 'QF-01_zacisk').getAttribute('data-degree')).toBe('2');
    expect(Number(trafienie.getAttribute('r'))).toBeGreaterThan(0);
    await prawyKlik(trafienie);
    expect(screen.getByTestId('sld-menu-merge-nn-segments')).toBeInTheDocument();
  });

  it('obszar trafienia zacisku wystaje poza pas trafienia kabla (zacisk osiągalny na styku kabli)', () => {
    expect(PROMIEN_TRAFIENIA_ZACISKU_PX).toBeGreaterThan(PAS_TRAFIENIA_KABLA_PX / 2);
  });

  it('odbiór: menu z usunięciem; potwierdzenie wykonuje delete_element', async () => {
    await renderuj();
    await prawyKlik(wezel('load', 'QF-01_odbior'));
    await userEvent.setup().click(screen.getByTestId('sld-menu-delete-nn-load'));
    const potwierdzenie = useNotificationStore
      .getState()
      .notifications.find((wpis) => wpis.message.startsWith('Potwierdź usunięcie'));
    potwierdzenie?.actions?.find((a) => a.label === 'Usuń')?.onClick();
    expect(executeDomainOperation).toHaveBeenCalledWith(
      'case-1',
      'delete_element',
      expect.objectContaining({ element_ref: 'QF-01_odbior' }),
      expect.anything(),
    );
  });

  it('szyna rozdzielnicy: prawy klik nie otwiera menu', async () => {
    await renderuj();
    await prawyKlik(wezel('bus', 'RGnN-1'));
    expect(screen.queryByTestId('context-menu-sekcja')).toBeNull();
  });

  it('wykonawca wołany bez ładunku z portalu nN (spoza schematu nN) odmawia z powodem', () => {
    const { result } = renderHook(() => useSldActionExecutor({ readOnly: false }));
    result.current('copy-nn-feeder', 'nn_apparatus', 'QF-01');
    expect(executeDomainOperation).not.toHaveBeenCalled();
    const komunikaty = useNotificationStore.getState().notifications.map((wpis) => wpis.message);
    expect(komunikaty).toContain(POWOD_BRAKU_SCHEMATU_NN_PL);
  });
});

describe('Tryb podglądu schematu', () => {
  it('pozycje „Operacje" i „Usuń" nie wykonują operacji', async () => {
    await renderuj(true);
    await prawyKlik(wezel('apparatus', 'QF-01'));
    await userEvent.setup().click(screen.getByTestId('sld-menu-copy-nn-feeder'));
    expect(executeDomainOperation).not.toHaveBeenCalled();
    const komunikaty = useNotificationStore.getState().notifications.map((wpis) => wpis.message);
    expect(komunikaty).toContain('Tryb podglądu schematu — przełącz na edycję, aby budować sieć.');
  });
});
