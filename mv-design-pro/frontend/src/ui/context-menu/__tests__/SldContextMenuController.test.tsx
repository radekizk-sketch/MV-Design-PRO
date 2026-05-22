/**
 * Testy SldContextMenuController (Etap 1).
 *
 * Pokrycie:
 *  1. request=null → controller renderuje null (menu zamknięte).
 *  2. request kind='bay' → menu z liczbą akcji = SLD_MENU_REGISTRY.bay.length.
 *  3. Etykiety są w polskim z SLD_MENU_REGISTRY.
 *  4. Menu pola nie udostępnia wyprowadzenia ciągu; robi to wyłącznie głowica kablowa.
 *  5. Klik akcji wywołuje onAction(actionId, kind, elementId) i onClose().
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SldContextMenuController } from '../SldContextMenuController';
import { SLD_MENU_REGISTRY } from '../../sld/v2/command/SldCommandService';

describe('SldContextMenuController — most SLD_MENU_REGISTRY ↔ ContextMenu', () => {
  const baseProps = {
    elementName: 'Pole 01',
    mode: 'MODEL_EDIT' as const,
    onAction: vi.fn(),
    onClose: vi.fn(),
  };

  it('zwraca null gdy brak request', () => {
    const { container } = render(
      <SldContextMenuController {...baseProps} request={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderuje wszystkie akcje SLD_MENU_REGISTRY.bay z polskimi etykietami', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <SldContextMenuController
        {...baseProps}
        onAction={onAction}
        onClose={onClose}
        request={{
          kind: 'bay',
          elementId: 'bay_01',
          clientX: 200,
          clientY: 300,
        }}
      />,
    );

    const expectedActions = SLD_MENU_REGISTRY.bay;
    expect(expectedActions.length).toBeGreaterThanOrEqual(10);

    for (const action of expectedActions) {
      expect(screen.getByText(action.labelPl)).toBeInTheDocument();
    }

    // Klik akcji "Otwórz okno pola".
    const openBayBtn = screen.getByText('Otwórz okno pola');
    fireEvent.click(openBayBtn);
    expect(onAction).toHaveBeenCalledWith('open-bay', 'bay', 'bay_01');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renderuje menu tła (background) z trzema akcjami z registry', () => {
    render(
      <SldContextMenuController
        {...baseProps}
        request={{
          kind: 'background',
          elementId: null,
          clientX: 0,
          clientY: 0,
        }}
      />,
    );
    expect(screen.getByText('Wstaw główny punkt zasilania')).toBeInTheDocument();
    expect(screen.getByText('Otwórz katalogi techniczne')).toBeInTheDocument();
    expect(screen.getByText('Pokaż kontrolę konfiguracji')).toBeInTheDocument();
  });

  it('nie pokazuje wyprowadzenia ciągu z poziomu pola SN', () => {
    render(
      <SldContextMenuController
        {...baseProps}
        request={{
          kind: 'bay',
          elementId: 'bay_01',
          clientX: 200,
          clientY: 300,
        }}
      />,
    );

    expect(screen.queryByText('Wyprowadź ciąg główny z głowicy')).not.toBeInTheDocument();
    expect(screen.getByText('Rozpocznij odgałęzienie')).toBeInTheDocument();
  });

  it('header zawiera polską nazwę typu obiektu i nazwę elementu', () => {
    render(
      <SldContextMenuController
        {...baseProps}
        request={{ kind: 'station', elementId: 'st_01', clientX: 0, clientY: 0 }}
      />,
    );

    expect(screen.getByText(/Stacja transformatorowa SN\/nN/)).toBeInTheDocument();
    expect(screen.getByText(/Pole 01/)).toBeInTheDocument();
  });

  it('ukrywa surową referencję ENM w nagłówku menu stacji', () => {
    render(
      <SldContextMenuController
        {...baseProps}
        elementName="stn/773474baab70d0771fbaaca1aeb891e3/station"
        request={{ kind: 'station', elementId: 'stn/773474baab70d0771fbaaca1aeb891e3/station', clientX: 0, clientY: 0 }}
      />,
    );

    expect(screen.getByText('Stacja transformatorowa SN/nN')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('stn/773474baab70d0771fbaaca1aeb891e3/station');
    expect(screen.getByText('Dodaj źródło PV/BESS/FW z katalogu')).toBeInTheDocument();
    expect(screen.getByText('Pokaż konfigurację stacji')).toBeInTheDocument();
  });

  it('typ DER → poprawne polskie nagłówki', () => {
    const { rerender } = render(
      <SldContextMenuController
        {...baseProps}
        request={{ kind: 'der_pv', elementId: 'pv_01', clientX: 0, clientY: 0 }}
      />,
    );
    expect(screen.getByText(/Źródło PV/)).toBeInTheDocument();

    rerender(
      <SldContextMenuController
        {...baseProps}
        request={{ kind: 'der_bess', elementId: 'b_01', clientX: 0, clientY: 0 }}
      />,
    );
    expect(screen.getByText(/Magazyn energii BESS/)).toBeInTheDocument();

    rerender(
      <SldContextMenuController
        {...baseProps}
        request={{ kind: 'der_fw', elementId: 'fw_01', clientX: 0, clientY: 0 }}
      />,
    );
    expect(screen.getByText(/Farma wiatrowa/)).toBeInTheDocument();
  });
});
