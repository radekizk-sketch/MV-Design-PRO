/**
 * Projekcja nN — kabel modelu jest obiektem do wskazania (karta OBIEKT-KABEL-NN): klik natywny
 * w przewód kabla przekazuje odnośnik gałęzi gospodarzowi (portal → globalna selekcja →
 * inspektor z obliczeniami kabla nN). Krawędzie pomocnicze (`…#a/#b`, zrzuty liści) nie są
 * wskazywalne. Scenariusz z backendu (podrozdzielnice zasilane kablami).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LvDomainView } from '../LvDomainView';
import { scenariusz } from '../fixtures/scenariusze';

afterEach(cleanup);

describe('LvDomainView — wybór kabla nN', () => {
  it('klik w kabel modelu woła gospodarza z odnośnikiem gałęzi i zaznacza przewód', async () => {
    const onWybierzKabel = vi.fn();
    const { container } = render(
      <LvDomainView projection={scenariusz('08_island_grid_forming')} width={1400} height={1000} lod={2} onWybierzKabel={onWybierzKabel} />,
    );
    const kable = Array.from(container.querySelectorAll<SVGGElement>('[data-edge-kind="cable"][role="button"]'));
    expect(kable.length).toBeGreaterThan(0);
    const kabel = kable[0];
    const ref = kabel.getAttribute('data-testid')!.replace('lv-domain-edge-', '');
    expect(ref).not.toContain('#');
    await userEvent.setup().click(kabel.querySelector(`[data-testid="lv-domain-edge-hit-${ref}"]`)!);
    expect(onWybierzKabel).toHaveBeenCalledWith(ref);
    expect(container.querySelector(`[data-testid="lv-domain-edge-${ref}"]`)).toHaveAttribute('data-selected', 'true');
    // Krawędzie pomocnicze nie są wskazywalne.
    for (const el of Array.from(container.querySelectorAll('[role="button"][data-edge-kind]'))) {
      expect(el.getAttribute('data-testid')).not.toContain('#');
    }
  });
});
