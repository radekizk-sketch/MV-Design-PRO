/**
 * K2 — trasa `#sld` i przestrzeń „Schemat" montują warsztat schematu JEDEN raz.
 *
 * Wybór przestrzeni „Schemat" ustawia trasę `#sld` dopiero po pierwszym
 * renderze (`mostTrasyPrzestrzeni` → `navigateToNetworkBuild`). Dawniej trasa
 * renderowała INNY komponent niż przestrzeń, więc warsztat montował się dwa
 * razy i drugi montaż gubił jego stan (pomiar e2e K2: kadr stacji wskazanej
 * z „Gotowości" wracał do widoku sieci). Cechy: przejście trasy '' → '#sld'
 * i '#sld' → '' w przestrzeni „Schemat" × tryb pracy kanwy (edycja/podgląd)
 * czytany tak samo na obu drogach.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useEffect } from 'react';

import { ROUTES } from '../../../ui/navigation';
import { useShellStore } from '../../shell/useShellStore';

const zdarzenia: string[] = [];
vi.mock('../../../ui/sld/v3/canvas/SldCanvasV3Workspace', () => ({
  SldCanvasV3Workspace: ({ readOnly }: { readOnly?: boolean }) => {
    useEffect(() => {
      zdarzenia.push('montaz');
      return () => {
        zdarzenia.push('demontaz');
      };
    }, []);
    return <div data-testid="warsztat-schematu" data-readonly={readOnly ? 'true' : 'false'} />;
  },
}));

import { LegacyWarsztat, type LegacyWarsztatProps } from '../LegacyWarsztat';

const props = (route: string): LegacyWarsztatProps => ({
  route,
  space: 'schemat',
  pulpit: null,
  gotowosc: null,
  model: null,
  obliczenia: null,
  wyniki: null,
  dokumentacja: null,
});

afterEach(() => {
  cleanup();
  zdarzenia.length = 0;
  useShellStore.setState({ podgladSchematu: false });
});

describe('LegacyWarsztat — jeden montaż warsztatu schematu', () => {
  it.each([
    ['', ROUTES.SLD.hash],
    [ROUTES.SLD.hash, ''],
  ])('przejście trasy %j → %j w przestrzeni „Schemat" nie montuje warsztatu ponownie', (z, na) => {
    const { rerender, getByTestId } = render(<LegacyWarsztat {...props(z)} />);
    expect(getByTestId('warsztat-schematu')).toBeTruthy();
    const poPierwszym = zdarzenia.filter((e) => e === 'montaz').length;
    rerender(<LegacyWarsztat {...props(na)} />);
    expect(getByTestId('warsztat-schematu')).toBeTruthy();
    expect(zdarzenia.filter((e) => e === 'demontaz')).toEqual([]);
    expect(zdarzenia.filter((e) => e === 'montaz').length).toBe(poPierwszym);
  });

  it.each(['', ROUTES.SLD.hash])('trasa %j: tryb podglądu powłoki przechodzi do warsztatu (tylko do odczytu)', (trasa) => {
    useShellStore.setState({ podgladSchematu: true });
    const { getByTestId } = render(<LegacyWarsztat {...props(trasa)} />);
    expect(getByTestId('warsztat-schematu').getAttribute('data-readonly')).toBe('true');
  });
});
