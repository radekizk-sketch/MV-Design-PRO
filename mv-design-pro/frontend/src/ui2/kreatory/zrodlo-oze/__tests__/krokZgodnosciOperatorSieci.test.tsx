/**
 * Krok „zgodność” kreatora źródła OZE × operator sieci modelu (dodatek karty GPZ-DANE-ANALIZ).
 *
 * Iloczyn cech: operator sieci w modelu {brak, enea} × wybór profilu źródła {brak, zgodny,
 * różny} × powód nadpisania {wpisany, brak}. Źródło bez profilu DZIEDZICZY operatora sieci
 * (pole pokazuje dziedziczenie, krzywe graniczne = operator sieci); profil różny od operatora
 * sieci jest nadpisaniem — pojawia się wymagane pole powodu, a ładunek wiązań niesie powód
 * wyłącznie razem z profilem (`zbudujWiazaniaDer`). Interakcje natywne (`userEvent`).
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KrokZgodnosc } from '../KrokiAparaturaZgodnosc';
import { OZE_STRINGS } from '../strings';
import { DANE_DOMYSLNE, zbudujWiazaniaDer, type OzeFormData } from '../zrodloOzeModel';

const snapshotState: { snapshot: unknown } = { snapshot: null };
vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore };
});

const profil = (operator_id: string, operator_name_pl: string) => ({
  operator_id,
  operator_name_pl,
  last_revision: '2024-Q4',
  reactive_power: {
    q_range_pct_pn_min: -0.33,
    q_range_pct_pn_max: 0.33,
    cos_phi_min: 0.95,
    voltage_control_modes: ['cos_phi_constant', 'q_constant', 'q_of_u', 'voltage_control'],
  },
  ride_through: { lvrt: [{ time_s: 0, voltage_pu: 0.05 }], hvrt: [{ time_s: 0, voltage_pu: 1.3 }] },
});

vi.mock('../../../../ui/network-build/station-der/derRemoteCatalogs', async (oryginal) => ({
  ...(await oryginal<object>()),
  fetchNcRfgOperators: () =>
    Promise.resolve([profil('enea', 'Enea Operator'), profil('pse', 'PSE — Polskie Sieci Elektroenergetyczne')]),
}));
vi.mock('../../../../ui/network-build/station-der/audit2-api', async (oryginal) => ({
  ...(await oryginal<object>()),
  fetchAudit2CatalogSnapshot: () => Promise.resolve({ pf_curves: [] }),
}));

let ostatnieDane: OzeFormData = DANE_DOMYSLNE;

function Uprzaz(): JSX.Element {
  const [dane, setDane] = useState<OzeFormData>(DANE_DOMYSLNE);
  ostatnieDane = dane;
  const zmien = <K extends keyof OzeFormData>(pole: K, wartosc: OzeFormData[K]) =>
    setDane((d) => ({ ...d, [pole]: wartosc }));
  return <KrokZgodnosc dane={dane} zmien={zmien} />;
}

function ustawOperatoraSieci(operator: string | null): void {
  snapshotState.snapshot =
    operator === null ? { header: {} } : { header: { connection_conditions: { operator_sieci: operator } } };
}

const T = 'mvd-kreator-oze-zgodnosc';

async function profilGotowy(): Promise<HTMLSelectElement> {
  const pole = (await screen.findByTestId(`${T}-profil`)) as HTMLSelectElement;
  await waitFor(() => expect(pole).not.toBeDisabled());
  return pole;
}

beforeEach(() => {
  ostatnieDane = DANE_DOMYSLNE;
  ustawOperatoraSieci(null);
});

describe('krok zgodności — operator sieci modelu', () => {
  it('model z operatorem sieci, źródło bez profilu → dziedziczy (pole mówi to wprost), krzywe = operator sieci, bez powodu', async () => {
    ustawOperatoraSieci('enea');
    render(<Uprzaz />);
    const pole = await profilGotowy();
    expect(pole.options[0].textContent).toBe(OZE_STRINGS.zgodnoscProfilDziedziczy('Enea Operator'));
    await waitFor(() => expect(ostatnieDane.lvrt_curve_ref).toBe('enea'));
    expect(ostatnieDane.hvrt_curve_ref).toBe('enea');
    expect(ostatnieDane.nc_rfg_profile_ref).toBeNull();
    expect(screen.queryByTestId(`${T}-powod`)).toBeNull();
  });

  it('model bez operatora sieci → zwykły wybór profilu, bez dziedziczenia i bez krzywych', async () => {
    render(<Uprzaz />);
    const pole = await profilGotowy();
    expect(pole.options[0].textContent).toBe(OZE_STRINGS.zgodnoscProfilPlaceholder);
    expect(ostatnieDane.lvrt_curve_ref).toBeNull();
    await userEvent.selectOptions(pole, 'pse');
    // Bez operatora sieci nie ma czego nadpisywać — pole powodu się nie pojawia.
    expect(screen.queryByTestId(`${T}-powod`)).toBeNull();
    expect(ostatnieDane.lvrt_curve_ref).toBe('pse');
  });

  it('profil zgodny z operatorem sieci → bez pola powodu', async () => {
    ustawOperatoraSieci('enea');
    render(<Uprzaz />);
    await userEvent.selectOptions(await profilGotowy(), 'enea');
    expect(screen.queryByTestId(`${T}-powod`)).toBeNull();
    expect(zbudujWiazaniaDer(ostatnieDane)).toMatchObject({ nc_rfg_profile_ref: 'enea' });
    expect(zbudujWiazaniaDer(ostatnieDane)).not.toHaveProperty('nc_rfg_profile_powod');
  });

  it('profil różny od operatora sieci → wymagane pole powodu; powód w ładunku; powrót do dziedziczenia czyści powód', async () => {
    ustawOperatoraSieci('enea');
    const uzytkownik = userEvent.setup();
    render(<Uprzaz />);
    const pole = await profilGotowy();
    await uzytkownik.selectOptions(pole, 'pse');
    const powod = (await screen.findByTestId(`${T}-powod`)) as HTMLInputElement;
    // Pole nazwane etykietą kontraktu i oznaczone jako wymagane (gwiazdka ramy kreatora).
    expect(screen.getByLabelText(new RegExp(OZE_STRINGS.zgodnoscPowod))).toBe(powod);
    expect(powod.closest('.mvd-pole, label, div')?.parentElement?.querySelector('.mvd-pole-gwiazdka')).not.toBeNull();
    // Bez powodu ładunek nie niesie powodu (backend odmówi nadpisania z nazwanym powodem).
    expect(zbudujWiazaniaDer(ostatnieDane)).not.toHaveProperty('nc_rfg_profile_powod');
    await uzytkownik.type(powod, 'Przyłączenie do sieci 110 kV PSE');
    expect(zbudujWiazaniaDer(ostatnieDane)).toMatchObject({
      nc_rfg_profile_ref: 'pse',
      nc_rfg_profile_powod: 'Przyłączenie do sieci 110 kV PSE',
      lvrt_curve_ref: 'pse',
      hvrt_curve_ref: 'pse',
    });
    await uzytkownik.selectOptions(pole, '');
    expect(screen.queryByTestId(`${T}-powod`)).toBeNull();
    expect(ostatnieDane.nc_rfg_profile_powod).toBeNull();
    expect(ostatnieDane.lvrt_curve_ref).toBe('enea');
  });
});
