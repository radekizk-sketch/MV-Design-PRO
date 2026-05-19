import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconClipboard,
  IconPlay,
  IconSearch,
  IconGear,
} from '../shellIcons';

describe('shellIcons — wspólne SVG ikony shellu', () => {
  it('renderuje IconChevronLeft z domyślnym rozmiarem', () => {
    const { container } = render(<IconChevronLeft />);
    const svg = container.querySelector('[data-testid="icon-chevron-left"]');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('class')).toContain('h-4 w-4');
  });

  it('renderuje IconChevronRight', () => {
    const { container } = render(<IconChevronRight />);
    expect(container.querySelector('[data-testid="icon-chevron-right"]')).toBeInTheDocument();
  });

  it('renderuje IconChevronDown', () => {
    const { container } = render(<IconChevronDown />);
    expect(container.querySelector('[data-testid="icon-chevron-down"]')).toBeInTheDocument();
  });

  it('renderuje IconClipboard', () => {
    const { container } = render(<IconClipboard />);
    const svg = container.querySelector('[data-testid="icon-clipboard"]');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('class')).toContain('h-5 w-5');
  });

  it('renderuje IconPlay (filled)', () => {
    const { container } = render(<IconPlay />);
    const svg = container.querySelector('[data-testid="icon-play"]');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('fill')).toBe('currentColor');
  });

  it('renderuje IconSearch', () => {
    const { container } = render(<IconSearch />);
    expect(container.querySelector('[data-testid="icon-search"]')).toBeInTheDocument();
  });

  it('renderuje IconGear', () => {
    const { container } = render(<IconGear />);
    expect(container.querySelector('[data-testid="icon-gear"]')).toBeInTheDocument();
  });

  it('Każda ikona akceptuje className override', () => {
    const { container } = render(<IconChevronLeft className="text-red-500" />);
    const svg = container.querySelector('[data-testid="icon-chevron-left"]');
    expect(svg?.getAttribute('class')).toContain('text-red-500');
  });

  it('Wszystkie ikony używają currentColor (theme parity)', () => {
    const icons = [
      <IconChevronLeft key="cl" />,
      <IconChevronRight key="cr" />,
      <IconChevronDown key="cd" />,
      <IconClipboard key="cb" />,
      <IconSearch key="sr" />,
      <IconGear key="gr" />,
    ];
    for (const icon of icons) {
      const { container, unmount } = render(icon);
      const svg = container.querySelector('svg');
      // currentColor jest w stroke (lub fill dla Play)
      const stroke = svg?.getAttribute('stroke');
      const fill = svg?.getAttribute('fill');
      const usesCurrent = stroke === 'currentColor' || fill === 'currentColor';
      expect(usesCurrent).toBe(true);
      unmount();
    }
  });
});
