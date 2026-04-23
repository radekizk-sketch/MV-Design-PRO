/**
 * SwitchgearWizardPage — Main container for "Rozdzielnica: pola i aparaty" wizard.
 *
 * RUN #3G §1: Routes between screens A/B/C based on store state.
 *
 * BINDING: Polish labels, no codenames, no guessing.
 */

import { useCurrentScreen } from './useSwitchgearStore';
import { StationListScreen } from './StationListScreen';
import { StationEditScreen } from './StationEditScreen';
import { FieldEditScreen } from './FieldEditScreen';
import { CatalogPicker } from './CatalogPicker';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwitchgearWizardPage(): JSX.Element {
  const currentScreen = useCurrentScreen();

  return (
    <div className="switchgear-wizard" data-testid="switchgear-wizard">
      {/* Screen router */}
      {currentScreen === 'STATION_LIST' && <StationListScreen />}
      {currentScreen === 'STATION_EDIT' && <StationEditScreen />}
      {currentScreen === 'FIELD_EDIT' && <FieldEditScreen />}

      {/* Catalog picker overlay (modal, renders on top) */}
      <CatalogPicker />
    </div>
  );
}
