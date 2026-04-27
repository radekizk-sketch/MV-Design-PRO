import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AREA_DEFINITIONS } from '../../navigation/areaRegistry';
import { NavigationRail } from '../NavigationRail';

describe('navigation-rail.a11y - kanon dostępności', () => {
  it('każdy obszar ma pełną nazwę w aria-label i skrót w tooltipie', () => {
    render(<NavigationRail />);

    for (const area of AREA_DEFINITIONS) {
      const button = screen.getByTestId(area.testId);
      expect(button).toHaveAccessibleName(new RegExp(area.labelFull));
      expect(button.getAttribute('title')).toContain(area.labelFull);
      expect(button.getAttribute('title')).toContain(area.shortcut);
    }
  });
});
