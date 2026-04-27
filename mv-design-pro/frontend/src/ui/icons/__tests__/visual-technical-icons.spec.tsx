import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  TechnicalIcon,
  technicalIconRegistry,
  type TechnicalIconName,
} from '../technicalIconRegistry';

describe('visual-technical-icons - czytelność rozmiarów', () => {
  it('każda ikona ma siatkę 24x24 i renderuje się w 16, 20, 24 oraz 32 px', () => {
    for (const icon of Object.keys(technicalIconRegistry) as TechnicalIconName[]) {
      for (const size of [16, 20, 24, 32] as const) {
        const { container, unmount } = render(<TechnicalIcon name={icon} size={size} />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
        expect(svg).toHaveAttribute('width', String(size));
        expect(svg).toHaveAttribute('height', String(size));
        expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);
        unmount();
      }
    }
  });
});
