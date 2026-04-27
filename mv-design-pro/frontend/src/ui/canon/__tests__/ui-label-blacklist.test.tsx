import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AREA_DEFINITIONS } from '../../navigation/areaRegistry';
import { NavigationRail } from '../../shell/NavigationRail';
import { AreaContextPanel } from '../../shell/context-panels/AreaContextPanel';
import { findForbiddenUserLabels } from '../labelGuards';

vi.mock('../../network-build/ProcessPanel', () => ({
  ProcessPanel: () => <div>Proces budowy modelu</div>,
}));

vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({
    buildPhase: 'NO_SOURCE',
    buildPhaseLabel: 'Brak źródła zasilania',
    sourceCount: 0,
    trunkCount: 0,
    branchCount: 0,
    stationCount: 0,
    transformerCount: 0,
    generatorCount: 0,
    isReady: false,
    ozeSourceSummaries: [],
    stationSummaries: [],
    transformerSummaries: [],
  }),
  useNetworkBuildStore: () => ({}),
}));

vi.mock('../../study-cases/StudyCaseList', () => ({
  StudyCaseList: () => <div>Lista przypadków obliczeniowych</div>,
}));

vi.mock('../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: () => <div>Historia uruchomień obliczeń</div>,
}));

vi.mock('../../protection/ProtectionLibraryBrowser', () => ({
  ProtectionLibraryBrowser: () => <div>Biblioteka zabezpieczeń</div>,
}));

vi.mock('../../catalog/TypeLibraryBrowser', () => ({
  TypeLibraryBrowser: () => <div>Katalog typów technicznych</div>,
}));

vi.mock('../../shared/generatorTypeLabels', () => ({
  formatGeneratorTypeShortLabelPl: (t: string) => t,
}));

describe('ui-label-blacklist - strażnik etykiet użytkownika', () => {
  it('pasek obszarów i panele kontekstu nie ujawniają roboczych etykiet', () => {
    const fragments: string[] = [];
    const rail = render(<NavigationRail />);
    fragments.push(collectUserFacingText(rail.container));
    rail.unmount();

    for (const area of AREA_DEFINITIONS) {
      const view = render(<AreaContextPanel areaCode={area.id} />);
      fragments.push(collectUserFacingText(view.container));
      view.unmount();
    }

    expect(findForbiddenUserLabels(fragments.join('\n'))).toEqual([]);
  });
});

function collectUserFacingText(container: HTMLElement): string {
  const values = [container.textContent ?? ''];
  container.querySelectorAll('[aria-label], [title]').forEach((node) => {
    const element = node as HTMLElement;
    values.push(element.getAttribute('aria-label') ?? '');
    values.push(element.getAttribute('title') ?? '');
  });
  return values.join('\n');
}
