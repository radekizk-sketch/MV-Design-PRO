/**
 * S9-7 (znalezisko UBOCZNE, Zero-Debt) — MOTYW W RENDERZE STATYCZNYM.
 *
 * DEFEKT ZMIERZONY. Zrzuty odbiorcze programu S9 („oba motywy") powstają przez
 * `renderToStaticMarkup`. W tej ścieżce zustand 4.5 czyta stan POCZĄTKOWY
 * sklepu (`api.getServerState || api.getInitialState`,
 * `zustand/esm/traditional.mjs`), a nie bieżący — harness ustawiał tryb przez
 * `setState`, więc na ekranie motyw by się zmienił, ale plik SVG powstawał
 * TUSZEM PALETY CIEMNEJ na białym arkuszu. Pomiar na `s9-1-*-jasny.svg`
 * (karta poprzednia) i na pierwszej wersji `s9-7-8-*-jasny.svg`: 68 wystąpień
 * `#E8EEF4` (tusz ciemny) i ZERO `#0B0F14` (tusz jasny) w treści rysunku.
 * Dowód „oba motywy" był więc pozorny przez cały program.
 *
 * TEST ĆWICZY REALNĄ ŚCIEŻKĘ (Zero-Debt §5): `renderToStaticMarkup`, nie
 * `@testing-library/react` — w jsdom sklep działa poprawnie, więc test na
 * ścieżce klienckiej NIE wykryłby tego defektu i dawałby fałszywą pewność.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { LIGHT_TECHNICAL_SLD_PALETTE, DARK_SCADA_SLD_PALETTE } from '../../theme/palette';
import { useThemeModeStore } from '../../../../../ui2/theme/themeMode';
import { SldCanvasV3 } from '../SldCanvasV3';

/** Najmniejsza realna sieć: samo źródło + szyna — wystarczy, bo orzeczenie
 *  dotyczy PALETY, nie treści rysunku. */
const ENM: EnergyNetworkModel = {
  buses: [{ ref_id: 'bus/sn', name: 'Szyna SN', voltage_kv: 15 }],
  branches: [],
  sources: [{ ref_id: 'src/main', name: 'Sieć zasilająca', bus_ref: 'bus/sn', kind: 'external_grid' }],
} as unknown as EnergyNetworkModel;

function markup(paletteMode?: 'dark_scada' | 'light_technical'): string {
  return renderToStaticMarkup(
    <SldCanvasV3 snapshot={ENM} width={800} height={500} lodOverride={0} paletteMode={paletteMode} />,
  );
}

/** Ile razy dany kolor jest użyty jako TUSZ (`fill="…"`/`stroke="…"`). Sama
 *  obecność łańcucha nie wystarcza: tusz jednej palety bywa TŁEM drugiej
 *  (`#0B0F14` to tusz palety jasnej i tło palety dyspozytorskiej). */
function tuszem(svg: string, color: string): number {
  return (svg.match(new RegExp(`(?:fill|stroke)="${color}"`, 'g')) ?? []).length;
}

describe('S9-7 — render statyczny honoruje motyw podany wprost', () => {
  it('paletteMode="light_technical" rysuje TUSZEM JASNEJ palety (a nie ciemnej na białym arkuszu)', () => {
    const svg = markup('light_technical');
    expect(tuszem(svg, LIGHT_TECHNICAL_SLD_PALETTE.baseStroke)).toBeGreaterThan(0);
    expect(tuszem(svg, DARK_SCADA_SLD_PALETTE.baseStroke)).toBe(0);
  });

  it('paletteMode="dark_scada" rysuje TUSZEM palety dyspozytorskiej', () => {
    const svg = markup('dark_scada');
    expect(tuszem(svg, DARK_SCADA_SLD_PALETTE.baseStroke)).toBeGreaterThan(0);
    expect(tuszem(svg, LIGHT_TECHNICAL_SLD_PALETTE.baseStroke)).toBe(0);
  });

  it('DOWÓD, że defekt był realny: SAM sklep motywu NIE wystarcza w renderze statycznym', () => {
    // Ustawiamy tryb jasny w sklepie i renderujemy BEZ propa — dokładnie tak,
    // jak robił to harness zrzutów przed tą kartą.
    const przed = useThemeModeStore.getState().mode;
    try {
      useThemeModeStore.setState({ mode: 'light_technical' });
      expect(useThemeModeStore.getState().mode).toBe('light_technical');
      const svg = markup(undefined);
      // Sklep mówi „jasny", a render statyczny i tak bierze paletę POCZĄTKOWĄ.
      // To NIE jest orzeczenie „tak ma być" — to zapadka na przyczynę: gdy
      // zustand kiedyś zmieni to zachowanie, test pęknie i będzie można
      // uprościć wołających (prop stanie się zbędny).
      expect(tuszem(svg, DARK_SCADA_SLD_PALETTE.baseStroke)).toBeGreaterThan(0);
      expect(tuszem(svg, LIGHT_TECHNICAL_SLD_PALETTE.baseStroke)).toBe(0);
    } finally {
      useThemeModeStore.setState({ mode: przed });
    }
  });
});
