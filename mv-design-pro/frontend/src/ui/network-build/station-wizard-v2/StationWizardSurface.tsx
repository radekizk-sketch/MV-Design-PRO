/**
 * StationWizardSurface — wrapper Kreatora Stacji KOMPLETNEGO jako
 * standalone surface (uruchamiany przez hash route lub modal mount).
 *
 * Wpięcie do shellu: w `App.tsx` renderowane gdy `#kreator-stacji-v2`
 * jest aktywne w URL. Operator może wrócić do schematu SLD poprzez
 * przycisk "Anuluj" lub zatwierdzić kreator przyciskiem "Zakończ".
 */
import { useCallback } from 'react';

import { StationWizardWorkspace } from './StationWizardWorkspace';
import { navigateToSld } from '../../navigation/routes';

export interface StationWizardSurfaceProps {
  /** Initial step + vendor — opcjonalne. */
  readonly initialStep?: Parameters<typeof StationWizardWorkspace>[0]['initialStep'];
  readonly initialVendorId?: string;
}

export function StationWizardSurface(props: StationWizardSurfaceProps): JSX.Element {
  const handleComplete = useCallback(() => {
    // Po zatwierdzeniu wracaj na schemat SLD.
    navigateToSld();
  }, []);

  const handleCancel = useCallback(() => {
    navigateToSld();
  }, []);

  return (
    <div
      data-testid="station-wizard-surface"
      className="h-full w-full"
    >
      <StationWizardWorkspace
        initialStep={props.initialStep}
        initialVendorId={props.initialVendorId}
        onComplete={handleComplete}
        onCancel={handleCancel}
        density="compact"
      />
    </div>
  );
}
