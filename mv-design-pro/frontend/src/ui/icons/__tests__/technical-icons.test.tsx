import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CANONICAL_SCREEN_REGISTRY } from '../../workspace/screenCanonRegistry';
import {
  analysisIconRegistry,
  hasTechnicalIcon,
  objectIconRegistry,
  screenIconRegistry,
  TechnicalIcon,
  technicalIconRegistry,
  type TechnicalIconName,
} from '../technicalIconRegistry';

describe('technical-icons - rejestr ikon technicznych', () => {
  it('każdy obszar, ekran, obiekt i typ analityczny ma ikonę w rejestrze', () => {
    // D1: rejestr obszarow `ui/navigation/areaRegistry` skasowany (druga
    // nawigacja bez konsumentow). Ikony `ikona-obszar-*` ZOSTAJA — czyta je
    // `ui/context-menu/contextMenuRegistry`. Petla po CALYM rejestrze ikon jest
    // nadzbiorem dawnej petli po dziewieciu obszarach: kazdy zarejestrowany
    // klucz musi mieć rysunek.
    for (const icon of Object.keys(technicalIconRegistry)) {
      expect(hasTechnicalIcon(icon)).toBe(true);
    }
    for (const screen of Object.values(CANONICAL_SCREEN_REGISTRY)) {
      expect(hasTechnicalIcon(screen.icon)).toBe(true);
      expect(screenIconRegistry[screen.icon]).toBeTruthy();
    }
    for (const icon of Object.keys(objectIconRegistry)) {
      expect(hasTechnicalIcon(icon)).toBe(true);
    }
    for (const icon of Object.keys(analysisIconRegistry)) {
      expect(hasTechnicalIcon(icon)).toBe(true);
    }
  });

  it('renderuje ikony w rozmiarach 16, 20, 24 i 32 px', () => {
    const sampleIcons = Object.keys(technicalIconRegistry).slice(0, 8) as TechnicalIconName[];
    for (const icon of sampleIcons) {
      for (const size of [16, 20, 24, 32]) {
        const { container, unmount } = render(<TechnicalIcon name={icon} size={size} />);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute('width', String(size));
        expect(svg).toHaveAttribute('height', String(size));
        unmount();
      }
    }
  });
});
