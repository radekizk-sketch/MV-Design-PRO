/**
 * OperationFormRouter — Router formularzy operacji domenowych.
 *
 * Renderuje aktywny formularz na podstawie networkBuildStore.activeOperationForm.
 * Montowany w prawym panelu PowerFactoryLayout jako alternatywa do inspektora
 * gdy użytkownik inicjuje operację budowy sieci.
 *
 * Formularze są osadzone inline i spięte z executeDomainOperation.
 *
 * BINDING: 100% PL etykiety.
 */

import { clsx } from 'clsx';
import { useNetworkBuildStore } from './networkBuildStore';
import { AddGridSourceForm } from './forms/AddGridSourceForm';
import { ContinueTrunkForm } from './forms/ContinueTrunkForm';
import { InsertStationForm } from './forms/InsertStationForm';
import { InsertBranchPoleForm } from './forms/InsertBranchPoleForm';
import { InsertZksnForm } from './forms/InsertZksnForm';
import { StartBranchForm } from './forms/StartBranchForm';
import { ConnectRingForm } from './forms/ConnectRingForm';
import { SetNormalOpenPointForm } from './forms/SetNormalOpenPointForm';
import { InsertSectionSwitchForm } from './forms/InsertSectionSwitchForm';
import { AddTransformerForm } from './forms/AddTransformerForm';
import { AddOzeSourceForm } from './forms/AddOzeSourceForm';
import { AssignCatalogForm } from './forms/AssignCatalogForm';
import { UpdateElementParametersForm } from './forms/UpdateElementParametersForm';

// =============================================================================
// Form metadata (PL labels per operation)
// =============================================================================

const FORM_META: Record<string, { title: string; description: string }> = {
  add_grid_source_sn: {
    title: 'Źródło zasilania GPZ',
    description: 'Definiuj źródło zasilania sieci SN — parametry zwarciowe, napięcie, rozdzielnia',
  },
  continue_trunk_segment_sn: {
    title: 'Kontynuacja magistrali',
    description: 'Dodaj kolejny segment kablowy lub napowietrzny do magistrali',
  },
  insert_station_on_segment_sn: {
    title: 'Wstawienie stacji w segment',
    description: 'Osadź stację SN/nN w wybranym punkcie segmentu magistrali',
  },
  insert_branch_pole_on_segment_sn: {
    title: 'Wstawienie słupa rozgałęźnego',
    description: 'Osadź słup rozgałęźny na odcinku linii napowietrznej SN',
  },
  insert_zksn_on_segment_sn: {
    title: 'Wstawienie ZKSN',
    description: 'Osadź ZKSN na odcinku kablowym SN',
  },
  start_branch_segment_sn: {
    title: 'Rozpoczęcie odgałęzienia',
    description: 'Utwórz nowe odgałęzienie z wolnego portu stacji lub węzła T',
  },
  insert_section_switch_sn: {
    title: 'Wstawienie łącznika sekcyjnego',
    description: 'Wstaw łącznik sekcyjny w wybranym punkcie segmentu',
  },
  connect_secondary_ring_sn: {
    title: 'Domknięcie pierścienia',
    description: 'Połącz dwa otwarte terminale tworząc pierścień wtórny',
  },
  set_normal_open_point: {
    title: 'Punkt normalnie otwarty (NOP)',
    description: 'Ustaw łącznik jako punkt normalnie otwarty pierścienia',
  },
  add_transformer_sn_nn: {
    title: 'Dodanie transformatora SN/nN',
    description: 'Dodaj transformator dwuuzwojeniowy do stacji',
  },
  add_pv_inverter_nn: {
    title: 'Źródło PV (fotowoltaika)',
    description: 'Dodaj falownik fotowoltaiczny po stronie nN stacji',
  },
  add_bess_inverter_nn: {
    title: 'Magazyn energii (BESS)',
    description: 'Dodaj bateryjny magazyn energii po stronie nN stacji',
  },
  assign_catalog_to_element: {
    title: 'Przypisanie katalogu',
    description: 'Przypisz pozycję katalogową do elementu sieci',
  },
  update_element_parameters: {
    title: 'Edycja parametrów',
    description: 'Modyfikuj parametry techniczne wybranego elementu',
  },
};

// =============================================================================
// Form component routing
// =============================================================================

function renderFormComponent(op: string, closeForm: () => void): React.ReactNode {
  switch (op) {
    case 'add_grid_source_sn':
      return <AddGridSourceForm />;
    case 'continue_trunk_segment_sn':
      return <ContinueTrunkForm />;
    case 'insert_station_on_segment_sn':
      return <InsertStationForm />;
    case 'insert_branch_pole_on_segment_sn':
      return <InsertBranchPoleForm />;
    case 'insert_zksn_on_segment_sn':
      return <InsertZksnForm />;
    case 'start_branch_segment_sn':
      return <StartBranchForm />;
    case 'connect_secondary_ring_sn':
      return <ConnectRingForm />;
    case 'set_normal_open_point':
      return <SetNormalOpenPointForm />;
    case 'insert_section_switch_sn':
      return <InsertSectionSwitchForm />;
    case 'add_transformer_sn_nn':
      return <AddTransformerForm />;
    case 'add_pv_inverter_nn':
    case 'add_bess_inverter_nn':
      return <AddOzeSourceForm />;
    case 'assign_catalog_to_element':
      return <AssignCatalogForm />;
    case 'update_element_parameters':
      return <UpdateElementParametersForm />;
    default:
      return (
        <FallbackForm
          title={FORM_META[op]?.title ?? op}
          description={FORM_META[op]?.description ?? 'Operacja domenowa'}
          onClose={closeForm}
        />
      );
  }
}

// =============================================================================
// Fallback (for assign_catalog, update_element_parameters, future ops)
// =============================================================================

interface FallbackFormProps {
  title: string;
  description: string;
  onClose: () => void;
}

function FallbackForm({ title, description, onClose }: FallbackFormProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          aria-label="Zamknij formularz"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 p-4 flex items-center justify-center">
        <p className="text-xs text-gray-500">
          Formularz dostępny przez modal kontekstowy
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// OperationFormRouter
// =============================================================================

export interface OperationFormRouterProps {
  className?: string;
}

export function OperationFormRouter({ className }: OperationFormRouterProps) {
  const activeForm = useNetworkBuildStore((s) => s.activeOperationForm);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);

  if (!activeForm) return null;

  return (
    <div className={clsx('h-full', className)} data-testid="operation-form-router">
      {renderFormComponent(activeForm.op, closeForm)}
    </div>
  );
}

export default OperationFormRouter;
