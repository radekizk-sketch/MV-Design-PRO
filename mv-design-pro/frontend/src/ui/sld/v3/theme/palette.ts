/**
 * KD-8 poz. 1 (ocena właściciela 2/10 ekranu jasnego) — PALETA RYSUNKU
 * STEROWANA MOTYWEM.
 *
 * STAN PRZED. Kanwa v3 miała JEDNĄ paletę (ciemną) wypaloną w
 * `theme/colorTokens.ts`, a jasny wariant istniał WYŁĄCZNIE jako podmiana
 * tekstu w eksporcie (`export/exportPalette.ts`, decyzja D11/R1 „kanwa na
 * ekranie ZAWSZE SCADA-dark"). Skutkiem był ekran, na którym powłoka była
 * jasna, a arkusz rysunkowy czarny — deklaracja motywu bez pokrycia.
 * Właściciel rozstrzygnął inaczej (karta KD-8 §0.1): paleta KAŻDEJ
 * powierzchni, łącznie z kanwą, idzie z motywu. Dawna decyzja jest tym
 * NADPISANA (wpis w `docs/v12xx/REJESTR_KONFLIKTOW.md`), a paleta
 * DOKUMENTOWA eksportu zostaje niezależna od motywu ekranu — arkusz do
 * dokumentacji nie może zależeć od tego, na czym pracował projektant.
 *
 * KONTRAKT SEMANTYKI (BINDING). Wolno zmienić jasność/nasycenie per motyw;
 * NIE WOLNO zmienić przypisania barw do klas: WN czerwony, SN zielony, nN
 * niebieski, NOP/otwarty magenta, energizacja zielona, przepływ błękitny,
 * OLTC bursztynowy, awaria czerwona, etykiety wynikowe fioletowe. Wariant
 * jasny to te same rodziny barw ściemnione pod biel arkusza — pilnuje tego
 * test `__tests__/palette.test.ts` (rodzina odcienia + próg kontrastu).
 *
 * DETERMINIZM. Paleta NIE wchodzi do sceny: `scene/buildScene.ts` nie zna
 * żadnego koloru (kolor nakłada dopiero render), więc hash geometrii jest
 * niezależny od motywu — dowód w `__tests__/palette.test.ts`
 * („hash geometrii sceny identyczny dla obu motywów").
 */
import { createContext, useContext } from 'react';

import { DARK_SCADA_SLD_PALETTE, type SldPalette } from './colorTokens';
import type { ThemeMode } from '../../../../ui2/theme/themeMode';

export type { SldPalette } from './colorTokens';

/**
 * Wariant JASNY (techniczny) palety EKRANU. Wartości dobrane pod biel arkusza:
 * każdy token użyty jako TEKST ma kontrast ≥ 4,5:1 na tle kanwy, tokeny użyte
 * wyłącznie jako kreska/strzałka ≥ 3:1 (progi WCAG tekst/nie-tekst).
 * Odcienie są ŚCIEMNIENIEM odpowiedników ciemnych — nie przemapowaniem.
 */
export const LIGHT_TECHNICAL_SLD_PALETTE: SldPalette = {
  /** Arkusz biały — ta sama biel co paleta dokumentowa eksportu. */
  canvasBackground: '#FFFFFF',
  /** Tusz bazowy (etykiety, rama arkusza, adnotacje) — 19,2:1 na bieli. */
  baseStroke: '#0B0F14',
  voltage: {
    /** WN — czerwień OSD ściemniona (6,5:1). */
    hv: '#B3261E',
    /** SN — zieleń toru operatorskiego ściemniona (5,4:1). */
    sn: '#0F7A3D',
    /** nN — błękit szyny nN ściemniony (7,7:1). */
    nn: '#0A5A78',
  },
  state: {
    closed: '#0D7A3E',
    /** NOP/otwarty — magenta ściemniona (7,1:1). ŚWIADOMIE inna rodzina niż
     *  WN (czerwień): stan ruchowy nie może zlać się z poziomem napięcia. */
    open: '#B0004E',
    nop: '#B0004E',
  },
  highlight: {
    energized: '#1E7A46',
    deenergized: '#6B7684',
    standby: '#8A6D00',
    maintenance: '#2166AC',
    flow: '#0A6C9C',
    oltc: '#A15C00',
    fault: '#C0392B',
    faultWarning: '#B36A00',
    faultOk: '#7E7000',
    resultLabel: '#6A3FB5',
    resultStale: '#6E6182',
    selection: '#0066CC',
  },
};

export { DARK_SCADA_SLD_PALETTE } from './colorTokens';

/** Paleta rysunku dla trybu motywu powłoki — JEDYNE miejsce tego wyboru. */
export function sldPaletteForTheme(mode: ThemeMode): SldPalette {
  return mode === 'light_technical' ? LIGHT_TECHNICAL_SLD_PALETTE : DARK_SCADA_SLD_PALETTE;
}

/**
 * Kontekst palety kanwy. Domyślna wartość = paleta dyspozytorska, żeby węzły
 * renderowane w izolacji (testy jednostkowe symboli) zachowywały dotychczasowe
 * zachowanie bez owijania w dostawcę.
 */
export const SldPaletteContext = createContext<SldPalette>(DARK_SCADA_SLD_PALETTE);

/** Paleta obowiązująca w bieżącym poddrzewie renderu kanwy. */
export function useSldPalette(): SldPalette {
  return useContext(SldPaletteContext);
}
