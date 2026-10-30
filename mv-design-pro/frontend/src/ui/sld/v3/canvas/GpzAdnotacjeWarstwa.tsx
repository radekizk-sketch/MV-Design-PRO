/**
 * Karta GPZ-PARYTET: warstwa adnotacji bloku GPZ na kanwie v3 — tła pól wg roli
 * (`gpz.bay.panel`), wiersze bilansu i alarmów w belce nagłówka
 * (`gpz.header.balance`, `gpz.header.alarms`) oraz tabela „Pola GPZ" (karty pól:
 * rola, plakietki automatyki `gpz.status_flags`, pomiary `gpz.measurements`)
 * z legendą ról.
 *
 * Geometria przychodzi gotowa ze sceny (`scene.meta.gpzAdnotacje`, kompozycja
 * `compose/gpz.ts`), wartości gotowe z wyniku backendu (`buildGpzWynikiOverlay`).
 * Warstwa niczego nie liczy — ani geometrii, ani fizyki. Kolory wyłącznie
 * z palety motywu (`palette.rolaPola`, `palette.highlight`).
 *
 * Czytelność: pismo 13 px świata (klasa t1). Gdy na ekranie spada poniżej progu
 * czytelności (`MIN_READABLE_LABEL_SCREEN_PX`), teksty nie są rysowane (zostają
 * tła pól i próbki ról) — jak etykiety rysunku, które poniżej progu są szumem.
 */
import type { JSX } from 'react';
import { LABEL_TYPOGRAPHY, MIN_READABLE_LABEL_SCREEN_PX, labelLineHeight } from '../core/text';
import {
  ETYKIETA_ROLI_POLA_PL,
  KLASA_DANYCH_GPZ,
  OPIS_PLAKIETKI_PL,
  TEKST_BRAKU_WARTOSCI,
  WYSOKOSC_WIERSZA_GPZ,
  tekstAlarmowGpz,
  tekstOdplywowGpz,
  tekstTytuluTabeliGpz,
  tekstZasilaniaGpz,
  type BilansGpzWartosci,
  type GpzAdnotacje,
} from '../compose/gpzAdnotacje';
import { TekstSvgZWzorami } from '../../../proof/TekstSvgZWzorami';
import { useSldPalette } from '../theme/palette';
import type { GpzWynikiOverlay, WynikiPolaGpz } from './gpzWyniki';

const PUSTY_BILANS: BilansGpzWartosci = {
  pZasilaniaMw: null,
  qZasilaniaMvar: null,
  pOdplywowMw: null,
  qOdplywowMvar: null,
};

/** Przezroczystość wypełnienia tła pola — kolor roli jako tło, nie jako tor. */
export const KRYCIE_TLA_POLA_GPZ = 0.14;

export interface GpzAdnotacjeWarstwaProps {
  readonly adnotacje: GpzAdnotacje;
  /** `Substation.ref_id` GPZ (klucz wiersza bilansu w `results/v1`). */
  readonly gpzRef: string;
  /** `null` = brak wyniku rozpływu mocy. */
  readonly wyniki: GpzWynikiOverlay | null;
  readonly nieaktualny: boolean;
  /** Skala kamery (świat → ekran) — wyłącznie do progu czytelności pisma. */
  readonly skala: number;
}

export function GpzAdnotacjeWarstwa(props: GpzAdnotacjeWarstwaProps): JSX.Element {
  const { adnotacje, gpzRef, wyniki, nieaktualny, skala } = props;
  const palette = useSldPalette();
  const typo = LABEL_TYPOGRAPHY[KLASA_DANYCH_GPZ];
  const linia = labelLineHeight(KLASA_DANYCH_GPZ);
  const tekstyCzytelne = typo.fontSize * skala >= MIN_READABLE_LABEL_SCREEN_PX;
  const maWynik = wyniki !== null;
  const stacja = wyniki?.stacje[gpzRef];
  const bilans = maWynik ? (stacja?.bilans ?? PUSTY_BILANS) : null;
  const kolorTekstu = palette.baseStroke;
  const kolorWyniku = nieaktualny ? palette.highlight.resultStale : palette.highlight.resultLabel;
  const tabela = adnotacje.tabela;

  const tekst = (
    testId: string,
    x: number,
    yGora: number,
    tresc: string,
    kolor: string,
    wyrownanie: 'start' | 'end' = 'start',
    wysokoscWiersza: number = WYSOKOSC_WIERSZA_GPZ,
  ): JSX.Element => (
    <text
      data-testid={testId}
      x={x}
      y={yGora + wysokoscWiersza / 2}
      textAnchor={wyrownanie}
      dominantBaseline="middle"
      fill={kolor}
      fontFamily="sans-serif"
      fontSize={typo.fontSize}
      fontWeight={typo.fontWeight}
    >
      <TekstSvgZWzorami tekst={tresc} />
    </text>
  );

  const wartosciPola = (bayRef: string): WynikiPolaGpz | null => (maWynik ? (wyniki.pola[bayRef] ?? null) : null);

  return (
    <g
      data-testid="sld-v3-gpz-adnotacje"
      data-gpz-wynik={maWynik ? (nieaktualny ? 'nieaktualny' : 'aktualny') : 'brak'}
      data-gpz-teksty={tekstyCzytelne ? 'widoczne' : 'ponizej-progu-czytelnosci'}
    >
      <g data-testid="sld-v3-gpz-panele">
        {adnotacje.panele.map((panel) => (
          <rect
            key={`gpz-panel-${panel.bayRef}`}
            data-testid={`sld-v3-gpz-panel-${panel.bayRef}`}
            data-gpz-rola={panel.rola}
            x={panel.rect.x}
            y={panel.rect.y}
            width={panel.rect.width}
            height={panel.rect.height}
            rx={2}
            fill={palette.rolaPola[panel.rola]}
            fillOpacity={KRYCIE_TLA_POLA_GPZ}
            stroke={palette.rolaPola[panel.rola]}
            strokeWidth={1}
          >
            <title>{ETYKIETA_ROLI_POLA_PL[panel.rola]}</title>
          </rect>
        ))}
      </g>
      {tekstyCzytelne && (
        <g data-testid="sld-v3-gpz-naglowek-wyniki">
          {tekst('sld-v3-gpz-bilans-zasilania', adnotacje.zasilanie.x, adnotacje.zasilanie.y, tekstZasilaniaGpz(bilans), maWynik ? kolorWyniku : kolorTekstu, 'start', linia)}
          {tekst('sld-v3-gpz-bilans-odplywow', adnotacje.odplywy.x, adnotacje.odplywy.y, tekstOdplywowGpz(bilans), maWynik ? kolorWyniku : kolorTekstu, 'start', linia)}
          {tekst(
            'sld-v3-gpz-alarmy',
            adnotacje.alarmy.x,
            adnotacje.alarmy.y,
            tekstAlarmowGpz(stacja?.liczbaPrzeciazen ?? null, maWynik, nieaktualny),
            maWynik ? kolorWyniku : kolorTekstu,
            'start',
            linia,
          )}
        </g>
      )}
      {tabela && (
        <g data-testid="sld-v3-gpz-tabela-pol">
          {tekstyCzytelne && tekst('sld-v3-gpz-tabela-tytul', tabela.tytul.x, tabela.tytul.y, tekstTytuluTabeliGpz(maWynik, nieaktualny), kolorTekstu)}
          {tekstyCzytelne &&
            tabela.kolumnyKart.map((kx, k) =>
              tabela.kolumnyWartosci.map((kol) => (
                <g key={`gpz-naglowek-${k}-${kol.klucz}`}>
                  {tekst(`sld-v3-gpz-naglowek-${k}-${kol.klucz}`, kx + kol.dx + kol.width, tabela.naglowekY, kol.naglowek, kolorTekstu, 'end')}
                </g>
              )),
            )}
          {tabela.karty.map((karta) => {
            const wartosci = wartosciPola(karta.bayRef);
            const pole = (klucz: 'p' | 'q' | 'i' | 'u'): string =>
              maWynik ? (wartosci?.[klucz] ?? TEKST_BRAKU_WARTOSCI) : TEKST_BRAKU_WARTOSCI;
            return (
              <g
                key={`gpz-karta-${karta.bayRef}`}
                data-testid={`sld-v3-gpz-karta-${karta.bayRef}`}
                data-gpz-rola={karta.rola}
              >
                <rect
                  x={karta.probka.x}
                  y={karta.probka.y}
                  width={karta.probka.width}
                  height={karta.probka.height}
                  rx={2}
                  fill={palette.rolaPola[karta.rola]}
                  stroke={palette.rolaPola[karta.rola]}
                  strokeWidth={1}
                >
                  <title>{ETYKIETA_ROLI_POLA_PL[karta.rola]}</title>
                </rect>
                {tekstyCzytelne && tekst(`sld-v3-gpz-karta-oznaczenie-${karta.bayRef}`, karta.oznaczenieX, karta.rect.y, karta.oznaczenie, kolorTekstu)}
                {tekstyCzytelne && tekst(`sld-v3-gpz-karta-rola-${karta.bayRef}`, karta.rolaX, karta.rect.y, ETYKIETA_ROLI_POLA_PL[karta.rola], palette.rolaPola[karta.rola])}
                {karta.plakietki.map((plakietka) => (
                  <g
                    key={`gpz-plakietka-${karta.bayRef}-${plakietka.flaga}`}
                    data-testid={`sld-v3-gpz-plakietka-${karta.bayRef}-${plakietka.flaga}`}
                    data-gpz-plakietka={plakietka.flaga}
                  >
                    <title>{OPIS_PLAKIETKI_PL[plakietka.flaga]}</title>
                    <rect
                      x={plakietka.rect.x}
                      y={plakietka.rect.y}
                      width={plakietka.rect.width}
                      height={plakietka.rect.height}
                      rx={2}
                      fill={palette.canvasBackground}
                      stroke={kolorTekstu}
                      strokeWidth={1}
                    />
                    {tekstyCzytelne && (
                      <text
                        x={plakietka.rect.x + plakietka.rect.width / 2}
                        y={plakietka.rect.y + plakietka.rect.height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={kolorTekstu}
                        fontFamily="sans-serif"
                        fontSize={typo.fontSize}
                        fontWeight={typo.fontWeight}
                      >
                        {plakietka.flaga}
                      </text>
                    )}
                  </g>
                ))}
                {tekstyCzytelne &&
                  tabela.kolumnyWartosci.map((kol) => (
                    <g key={`gpz-wartosc-${karta.bayRef}-${kol.klucz}`}>
                      {tekst(
                        `sld-v3-gpz-wartosc-${karta.bayRef}-${kol.klucz}`,
                        karta.kolumnaX + kol.dx + kol.width,
                        karta.wartosciY,
                        pole(kol.klucz),
                        maWynik ? kolorWyniku : kolorTekstu,
                        'end',
                      )}
                    </g>
                  ))}
              </g>
            );
          })}
          {tabela.legenda.map((pozycja) => (
            <g key={`gpz-legenda-${pozycja.rola}`} data-testid={`sld-v3-gpz-legenda-${pozycja.rola}`}>
              <rect
                x={pozycja.probka.x}
                y={pozycja.probka.y}
                width={pozycja.probka.width}
                height={pozycja.probka.height}
                rx={2}
                fill={palette.rolaPola[pozycja.rola]}
                stroke={palette.rolaPola[pozycja.rola]}
                strokeWidth={1}
              />
              {tekstyCzytelne && tekst(`sld-v3-gpz-legenda-tekst-${pozycja.rola}`, pozycja.tekstX, pozycja.y, pozycja.tekst, kolorTekstu)}
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
