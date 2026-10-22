/**
 * Edytor obwodu wtórnego przekładników pola (karta pola E-11) — jedyny dostawca operacji
 * `set_measurement_secondary_circuit`. Ścieżka natywna (userEvent).
 *
 * ILOCZYN CECH:
 *  - przekładnik {CT, VT} × obwód zapisany {tak, nie};
 *  - akcja {zapis, usunięcie obwodu, anulowanie} × odpowiedź {sukces, odmowa backendu};
 *  - pole {puste = brak danej, wartość, wartość niedozwolona} — ładunek niesie WYŁĄCZNIE
 *    wpisane wielkości; uzwojenie tylko dla VT;
 *  - pole bez przekładników → edytor nie renderuje się (brak pustej sekcji).
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { EdytorObwoduWtornegoPola } from '../EdytorObwoduWtornegoPola';
import { opisObwodu, walidujObwod, zbudujPayloadObwodu } from '../obwodWtornyPola';

const CT = {
  ref_id: 'ct/1',
  name: 'CT pola 1',
  measurement_type: 'CT',
  bus_ref: 'bus/1',
  bay_ref: 'bay/1',
  obwod_wtorny: {
    dlugosc_przewodu_m: 12,
    przekroj_przewodu_mm2: 2.5,
    obciazenia_aparatow: [{ nazwa: 'Przekaźnik', moc_va: 0.5 }],
    moc_stykow_va: null,
  },
};
const VT = { ref_id: 'vt/1', name: 'VT pola 1', measurement_type: 'VT', bus_ref: 'bus/1', bay_ref: 'bay/1' };
const CT_INNEGO_POLA = { ref_id: 'ct/9', name: 'CT obcy', measurement_type: 'CT', bus_ref: 'bus/1', bay_ref: 'bay/9' };

function migawka(measurements: unknown[]): EnergyNetworkModel {
  return { measurements } as unknown as EnergyNetworkModel;
}

afterEach(() => cleanup());

function renderuj(odpowiedz: unknown = { snapshot: {} }, measurements: unknown[] = [VT, CT, CT_INNEGO_POLA]) {
  const execute = vi.fn().mockResolvedValue(odpowiedz);
  render(
    <EdytorObwoduWtornegoPola
      bayRef="bay/1"
      snapshot={migawka(measurements)}
      activeCaseId="case-1"
      executeDomainOperation={execute}
    />,
  );
  return execute;
}

describe('Lista przekładników pola', () => {
  it('pokazuje tylko przekładniki TEGO pola, CT przed VT, z opisem zapisanego obwodu', () => {
    renderuj();
    const wiersze = screen.getAllByTestId(/^obwod-wtorny-(ct|vt)\/\d$/);
    expect(wiersze.map((w) => w.dataset.testid)).toEqual(['obwod-wtorny-ct/1', 'obwod-wtorny-vt/1']);
    expect(screen.getByTestId('obwod-wtorny-ct/1-opis').textContent).toContain('przewód 12 m');
    expect(screen.getByTestId('obwod-wtorny-vt/1-opis').textContent).toContain('niezapisany');
  });

  it('pole bez przekładników — edytor się nie renderuje', () => {
    renderuj(undefined, [CT_INNEGO_POLA]);
    expect(screen.queryByTestId('obwod-wtorny-pola')).toBeNull();
  });
});

describe('Zapis i usunięcie obwodu — natywne kliknięcia', () => {
  it('CT z zapisanym obwodem: formularz startuje z modelu; zmiana długości wysyła pełny obwód', async () => {
    const execute = renderuj();
    const u = userEvent.setup();
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-edytuj'));
    expect(screen.getByTestId('obwod-wtorny-ct/1-dlugosc')).toHaveValue(12);
    expect(screen.queryByTestId('obwod-wtorny-ct/1-uzwojenie')).toBeNull();
    await u.clear(screen.getByTestId('obwod-wtorny-ct/1-dlugosc'));
    await u.type(screen.getByTestId('obwod-wtorny-ct/1-dlugosc'), '18');
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-zapisz'));
    expect(execute).toHaveBeenCalledWith('case-1', 'set_measurement_secondary_circuit', {
      measurement_ref: 'ct/1',
      obwod_wtorny: {
        dlugosc_przewodu_m: 18,
        przekroj_przewodu_mm2: 2.5,
        obciazenia_aparatow: [{ nazwa: 'Przekaźnik', moc_va: 0.5 }],
      },
    });
    expect(screen.queryByTestId('obwod-wtorny-ct/1-formularz')).toBeNull();
  });

  it('VT bez obwodu: uzwojenie i aparat trafiają do ładunku; pola puste nie', async () => {
    const execute = renderuj();
    const u = userEvent.setup();
    await u.click(screen.getByTestId('obwod-wtorny-vt/1-edytuj'));
    expect(screen.queryByTestId('obwod-wtorny-vt/1-usun-obwod')).toBeNull();
    await u.selectOptions(screen.getByTestId('obwod-wtorny-vt/1-uzwojenie'), 'ZABEZPIECZENIOWE');
    await u.click(screen.getByTestId('obwod-wtorny-vt/1-dodaj-aparat'));
    await u.type(screen.getByTestId('obwod-wtorny-vt/1-aparat-0-nazwa'), 'Licznik');
    await u.type(screen.getByTestId('obwod-wtorny-vt/1-aparat-0-moc'), '2');
    await u.click(screen.getByTestId('obwod-wtorny-vt/1-zapisz'));
    expect(execute).toHaveBeenCalledWith('case-1', 'set_measurement_secondary_circuit', {
      measurement_ref: 'vt/1',
      obwod_wtorny: { obciazenia_aparatow: [{ nazwa: 'Licznik', moc_va: 2 }] },
      vt_uzwojenie: 'ZABEZPIECZENIOWE',
    });
  });

  it('aparat bez nazwy blokuje zapis z komunikatem (zero operacji)', async () => {
    const execute = renderuj();
    const u = userEvent.setup();
    await u.click(screen.getByTestId('obwod-wtorny-vt/1-edytuj'));
    await u.click(screen.getByTestId('obwod-wtorny-vt/1-dodaj-aparat'));
    expect(screen.getByTestId('obwod-wtorny-vt/1-zapisz')).toBeDisabled();
    expect(screen.getByTestId('obwod-wtorny-vt/1-bledy').textContent).toContain('podaj nazwę aparatu');
    expect(execute).not.toHaveBeenCalled();
  });

  it('„Usuń obwód wtórny" wysyła jawne null', async () => {
    const execute = renderuj();
    const u = userEvent.setup();
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-edytuj'));
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-usun-obwod'));
    expect(execute).toHaveBeenCalledWith('case-1', 'set_measurement_secondary_circuit', {
      measurement_ref: 'ct/1',
      obwod_wtorny: null,
    });
  });

  it('odmowa backendu: zdanie odmowy widoczne, formularz zostaje otwarty', async () => {
    renderuj({ error: 'Wskazany przekładnik nie istnieje w modelu sieci.', error_code: 'measurement_circuit.not_found' });
    const u = userEvent.setup();
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-edytuj'));
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-zapisz'));
    expect(await screen.findByTestId('obwod-wtorny-blad')).toHaveTextContent('nie istnieje w modelu sieci');
    expect(screen.getByTestId('obwod-wtorny-ct/1-formularz')).toBeInTheDocument();
  });

  it('„Anuluj" zamyka formularz bez operacji', async () => {
    const execute = renderuj();
    const u = userEvent.setup();
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-edytuj'));
    await u.click(screen.getByTestId('obwod-wtorny-ct/1-anuluj'));
    expect(screen.queryByTestId('obwod-wtorny-ct/1-formularz')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('Model edytora — granice wartości i ładunek', () => {
  const pusty = { dlugosc_m: null, przekroj_mm2: null, obciazenia: [], moc_stykow_va: null, vt_uzwojenie: null };
  it.each([
    [{ dlugosc_m: 0 }, 'dlugosc_m'],
    [{ dlugosc_m: Number.NaN }, 'dlugosc_m'],
    [{ przekroj_mm2: -1 }, 'przekroj_mm2'],
    [{ moc_stykow_va: -0.1 }, 'moc_stykow_va'],
    [{ moc_stykow_va: Number.NaN }, 'moc_stykow_va'],
    [{ obciazenia: [{ nazwa: 'A', moc_va: null }] }, 'obciazenie-0'],
    [{ obciazenia: [{ nazwa: 'A', moc_va: Number.NaN }] }, 'obciazenie-0'],
  ])('%o → błąd pola %s', (zmiana, pole) => {
    expect(walidujObwod({ ...pusty, ...zmiana }).map((b) => b.pole)).toContain(pole);
  });

  it('formularz pusty nie jest błędem (brak danej ≠ zero)', () => {
    expect(walidujObwod(pusty)).toEqual([]);
  });

  it('uzwojenie NIE trafia do ładunku przekładnika prądowego', () => {
    const m = { ...CT } as never;
    expect(zbudujPayloadObwodu(m, { ...pusty, vt_uzwojenie: 'POMIAROWE' })).not.toHaveProperty('vt_uzwojenie');
  });

  it('opis obwodu VT zawiera uzwojenie, gdy jest zapisane', () => {
    const m = { ...VT, obwod_wtorny: { obciazenia_aparatow: [] }, vt_uzwojenie: 'POMIAROWE' } as never;
    expect(opisObwodu(m)).toContain('uzwojenie pomiarowe');
  });
});
