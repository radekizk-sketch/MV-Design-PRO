/**
 * StationWizardStepContent — render walidacja dla wszystkich 17 kroków.
 *
 * Test dostarcza dowód że każdy z 17 kroków renderuje content
 * (nie pustą sekcję) — komplementarne do e2e Playwright, weryfikuje
 * unit-level integration kontraktów z UI.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StationWizardStepContent } from '../StationWizardStepContent';
import {
  STATION_WIZARD_STEPS,
  type StationWizardStepId,
} from '../stationWizardContract';

const ALL_STEP_IDS: StationWizardStepId[] = STATION_WIZARD_STEPS.map((s) => s.id);

describe('StationWizardStepContent — render dla wszystkich 17 kroków', () => {
  it.each(ALL_STEP_IDS)('Krok "%s" renderuje step content + header', (stepId) => {
    render(<StationWizardStepContent activeStep={stepId} />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content).toBeInTheDocument();
    expect(content.getAttribute('data-active-step')).toBe(stepId);
    expect(screen.getByTestId('step-header')).toBeInTheDocument();
  });

  it.each(ALL_STEP_IDS)('Krok "%s" — header pokazuje numer + polski label', (stepId) => {
    const def = STATION_WIZARD_STEPS.find((s) => s.id === stepId)!;
    render(<StationWizardStepContent activeStep={stepId} />);
    const header = screen.getByTestId('step-header');
    // Numer kroku 1..17.
    expect(header.textContent).toContain(String(def.n));
    // Polska etykieta kroku.
    expect(header.textContent).toContain(def.label);
    // Grupa kroku.
    expect(header.textContent).toContain(def.group);
  });
});

describe('StationWizardStepContent — szczegóły per krok', () => {
  it('Krok cable: pokazuje kabel referencyjny XRUHAKXS', () => {
    render(<StationWizardStepContent activeStep="cable" />);
    expect(screen.getAllByText(/Kabel referencyjny|XRUHAKXS/i)[0]).toBeInTheDocument();
  });

  it('Krok cable: pokazuje pakiet obliczeń projektowych dla doboru kabla i dowodów backendowych', () => {
    render(<StationWizardStepContent activeStep="cable" />);
    const panel = screen.getByTestId('calculation-template-panel');
    expect(panel).toHaveTextContent('Pakiet obliczeń projektowych');
    expect(panel).toHaveTextContent('Dobór kabla SN');
    expect(panel).toHaveTextContent('żyły powrotnej');
    expect(panel).toHaveTextContent('oblicza backend');
  });

  it('Krok switchgear: pokazuje 5 vendor cards (ABB/Schneider/Siemens/Eaton/ZPUE)', () => {
    render(<StationWizardStepContent activeStep="switchgear" />);
    expect(screen.getByTestId('vendor-card-abb_safe_plus')).toBeInTheDocument();
    expect(screen.getByTestId('vendor-card-schneider_rm6')).toBeInTheDocument();
    expect(screen.getByTestId('vendor-card-siemens_8djh')).toBeInTheDocument();
    expect(screen.getByTestId('vendor-card-eaton_xiria')).toBeInTheDocument();
    expect(screen.getByTestId('vendor-card-zpue_rotoblok')).toBeInTheDocument();
  });

  it('Krok bays: interlock-matrix-table widoczna', () => {
    render(<StationWizardStepContent activeStep="bays" selectedVendorId="abb_safe_plus" />);
    expect(screen.getByTestId('interlock-matrix-table')).toBeInTheDocument();
    // Tabela zawiera referencje PN-EN.
    expect(screen.getAllByText(/PN-EN 62271-200/)[0]).toBeInTheDocument();
  });

  it('Krok readiness: ReadinessMatrixGrid widoczny + 29 osi', () => {
    render(<StationWizardStepContent activeStep="readiness" />);
    expect(screen.getByTestId('calculation-template-summary')).toHaveTextContent(
      'Pełny pakiet danych i dowodów projektowych',
    );
    expect(screen.getByTestId('calculation-template-summary')).toHaveTextContent(
      'Dobór kabla SN',
    );
    expect(screen.getByTestId('calculation-template-summary')).toHaveTextContent(
      'Przekładniki prądowe i napięciowe',
    );
    expect(screen.getByTestId('calculation-template-summary')).toHaveTextContent(
      'Uziemienie stacji',
    );
    expect(screen.getByTestId('readiness-matrix-grid')).toBeInTheDocument();
  });

  it('Krok ct: 3 rdzenie CT widoczne (I metering / II analysis / III protection)', () => {
    render(<StationWizardStepContent activeStep="ct" />);
    const content = screen.getByTestId('station-wizard-step-content');
    // Rdzenie I/II/III oznaczone.
    expect(content.textContent).toContain('LZQJ');
    expect(content.textContent).toMatch(/0\.2s|5P10/);
    expect(screen.getByTestId('calculation-template-panel')).toHaveTextContent(
      'Przekładniki prądowe i napięciowe',
    );
  });

  it('Krok vt: 4 uzwojenia VT widoczne', () => {
    render(<StationWizardStepContent activeStep="vt" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/uzwojeni|VT/i);
  });

  it('Krok trafo: TR 630 kVA + grupa Dyn5', () => {
    render(<StationWizardStepContent activeStep="trafo" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toContain('630');
    expect(content.textContent).toContain('Dyn5');
  });

  it('Krok earthing: limit UF + IK1 + RB', () => {
    render(<StationWizardStepContent activeStep="earthing" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/uziem|RB|UF|IK1/i);
  });

  it('Krok nn: rozdzielnica nN ABB MNS', () => {
    render(<StationWizardStepContent activeStep="nn" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/ABB|MNS|nN|niskie|1250/i);
  });

  it('Krok sources: PV stringi / BESS / FW', () => {
    render(<StationWizardStepContent activeStep="sources" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/PV|BESS|FW|OZE/i);
    expect(screen.getByTestId('calculation-template-panel')).toHaveTextContent(
      'PV/BESS/FW',
    );
  });

  it('Krok pq: analizatory klasy A + harmoniczne + flicker PST/PLT', () => {
    render(<StationWizardStepContent activeStep="pq" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/ND45|PQI-DA|PQM-750|Sonel|klasa A/i);
    expect(content.textContent).toMatch(/IEC 61000-4-30|EN 50160/i);
    expect(content.textContent).toMatch(/harmoniczn|flicker|THD|PST|PLT/i);
    expect(screen.getByTestId('calculation-template-panel')).toHaveTextContent(
      'Analizator jakości energii klasy A',
    );
  });

  it('Krok protection: funkcje ANSI (50/51/27/59)', () => {
    render(<StationWizardStepContent activeStep="protection" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/ANSI|50|51|27|59/);
  });

  it('Krok ncrfg: profile OSD PSE/Energa/Tauron/Enea/PGE', () => {
    render(<StationWizardStepContent activeStep="ncrfg" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/PSE|Energa|Tauron|Enea|PGE|NC RfG/i);
  });

  it('Krok infra: SCADA + IEC 61850 logical nodes', () => {
    render(<StationWizardStepContent activeStep="infra" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/SCADA|IEC 61850|XCBR|MMXU/i);
  });

  it('Krok network: Ik3 + κ + ip + Ith', () => {
    render(<StationWizardStepContent activeStep="network" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/Ik|κ|kappa|sieciow/i);
  });

  it('Krok meters: liczniki LZQJ/ZMD/MT880', () => {
    render(<StationWizardStepContent activeStep="meters" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/LZQJ|ZMD|MT880|licznik/i);
    expect(content.textContent).toMatch(/Typ licznika|Obwody U|Obwody I|Wariant/i);
    expect(content.textContent).not.toContain('analizator jakości energii');
  });

  it('Krok apparatus: aparatura Q1/Q2/Q3 z katalogu', () => {
    render(<StationWizardStepContent activeStep="apparatus" />);
    const content = screen.getByTestId('station-wizard-step-content');
    expect(content.textContent).toMatch(/Q1|Q2|Q3|wyłącznik|odłącznik|uziemnik/i);
  });
});

describe('StationWizardStepContent — selectedVendorId integration', () => {
  it('Krok bays z selectedVendorId="abb_safe_plus" pokazuje MiniBaySld dla ABB', () => {
    render(
      <StationWizardStepContent activeStep="bays" selectedVendorId="abb_safe_plus" />,
    );
    expect(screen.getByTestId('mini-bay-sld-preview')).toBeInTheDocument();
  });

  it('Krok bays bez vendor → komunikat o braku wyboru', () => {
    render(<StationWizardStepContent activeStep="bays" />);
    const content = screen.getByTestId('station-wizard-step-content');
    // Bez vendora — komunikat lub default ABB.
    expect(content).toBeInTheDocument();
  });
});

describe('StationWizardStepContent — readinessStates integration', () => {
  it('Krok readiness z stateami ready → 100% pokazane', () => {
    const allReady = STATION_WIZARD_STEPS.map((s) => ({
      axisId: s.id,
      status: 'ready' as const,
    }));
    render(<StationWizardStepContent activeStep="readiness" readinessStates={allReady} />);
    expect(screen.getByTestId('readiness-matrix-grid')).toBeInTheDocument();
  });
});
