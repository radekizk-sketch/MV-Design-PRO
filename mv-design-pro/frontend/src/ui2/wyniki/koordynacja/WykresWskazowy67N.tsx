/**
 * Wykres wskazowy 67N — rysunek WYŁĄCZNIE z danych algorytmu oceny backendu
 * (`wiersz.wykres_wskazowy`, `application/analyses/protection/ocena_ziemnozwarciowa.py`
 * `wykres_wskazowy_67n`): układ odniesienia −U₀ (0°), oś charakterystyki i granice sektora
 * (wersory), próg jako odcinek prostopadły do osi (tryb rzutu) albo łuk o promieniu I₀> (tryb
 * sektorowy), wskazy 3I₀ w polu i poza polem w amperach.
 *
 * Ekran niczego nie liczy poza rzutem skali rysunku: punkt [A] × (promień rysunku / `skala_a`),
 * oś pionowa odwrócona (SVG rośnie w dół). Liczby przy wskazach to wartości backendu sformatowane
 * jednym formatterem repo. Kolory wyłącznie tokenami `--mvd-*` (oba motywy).
 */

import { formatPolishValue } from '../../../ui/shared/formatPolishValue';
import type { WskazWykresu, WykresWskazowy67N } from './ocenaZiemnozwarciowa';
import { KOORDYNACJA_STRINGS as T } from './strings';

/** Promień rysunku [px] odpowiadający `skala_a` i wymiary pola rysunku. */
const PROMIEN_PX = 120;
const SZEROKOSC = 420;
const WYSOKOSC = 300;
const SRODEK_X = 150;
const SRODEK_Y = WYSOKOSC / 2;

type Punkt = readonly [number, number];

/** Rzut skali rysunku: amper (albo wersor × promień) → piksel SVG. */
export function rzutSkali(punkt: Punkt, skalaA: number): [number, number] {
  const k = PROMIEN_PX / skalaA;
  return [SRODEK_X + punkt[0] * k, SRODEK_Y - punkt[1] * k];
}

function px(p: [number, number]): string {
  return `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
}

function liczba(wartosc: number, miejsca = 2): string {
  return formatPolishValue(wartosc, { decimals: miejsca });
}

function Wskaz({ wskaz, skala, testid }: { wskaz: WskazWykresu; skala: number; testid: string }) {
  const koniec = rzutSkali([wskaz.re_a, wskaz.im_a], skala);
  const wPolu = wskaz.rola === 'W_POLU';
  const kolor = wPolu ? 'var(--mvd-accent)' : 'var(--mvd-warn)';
  const etykieta = `3I₀ ${T.wykresWskaz(wskaz.rola)}: ${liczba(wskaz.modul_a)} A ∠${liczba(wskaz.kat_deg, 1)}°`;
  const rzut = `rzut ${liczba(wskaz.wielkosc_a)} A`;
  // Etykieta po stronie końca wskazu (wyłącznie układ tekstu na rysunku).
  const zPrawej = koniec[0] >= SRODEK_X;
  const tx = zPrawej ? Math.min(koniec[0] + 6, SZEROKOSC - 4) : Math.max(koniec[0] - 6, 4);
  return (
    <g
      data-testid={`${testid}-wskaz`}
      data-rola={wskaz.rola}
      data-dziala={wskaz.dziala ? 'true' : 'false'}
      data-x={koniec[0].toFixed(3)}
      data-y={koniec[1].toFixed(3)}
    >
      <line
        x1={SRODEK_X}
        y1={SRODEK_Y}
        x2={koniec[0]}
        y2={koniec[1]}
        stroke={kolor}
        strokeWidth={2.5}
        markerEnd={`url(#${testid}-grot-${wPolu ? 'w' : 'p'})`}
      />
      <text
        x={tx}
        y={koniec[1] + (koniec[1] < SRODEK_Y ? -6 : 14)}
        textAnchor={zPrawej ? 'start' : 'end'}
        className="mvd-eaz-wykres-tekst"
        fill={kolor}
      >
        <tspan>{etykieta}</tspan>
        <tspan x={tx} dy={13} className="mvd-eaz-wykres-tekst--drugi">
          {rzut}
        </tspan>
      </text>
    </g>
  );
}

export function WykresWskazowy67N({ wykres, testid }: { wykres: WykresWskazowy67N; testid: string }) {
  const s = wykres.skala_a;
  const g0 = rzutSkali([wykres.granice[0][0] * s, wykres.granice[0][1] * s], s);
  const g1 = rzutSkali([wykres.granice[1][0] * s, wykres.granice[1][1] * s], s);
  const osKoniec = rzutSkali([wykres.os[0] * s, wykres.os[1] * s], s);
  const odniesienie = rzutSkali([s, 0], s);
  const srodek: [number, number] = [SRODEK_X, SRODEK_Y];
  // Sektor: od granicy (φ_os − Δφ) do granicy (φ_os + Δφ) przeciwnie do ruchu wskazówek zegara
  // w układzie matematycznym = flaga przebiegu 0 w SVG (oś y odwrócona).
  const sektor = `M ${px(srodek)} L ${px(g0)} A ${PROMIEN_PX} ${PROMIEN_PX} 0 ${wykres.sektor_duzy_luk ? 1 : 0} 0 ${px(g1)} Z`;
  let prog: JSX.Element | null = null;
  if (wykres.prog_odcinek) {
    const a = rzutSkali(wykres.prog_odcinek[0], s);
    const b = rzutSkali(wykres.prog_odcinek[1], s);
    prog = (
      <line
        data-testid={`${testid}-prog`}
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke="var(--mvd-ink)"
        strokeDasharray="5 4"
        strokeWidth={1.25}
      />
    );
  } else if (wykres.prog_luk) {
    const od = rzutSkali(wykres.prog_luk.od, s);
    const doP = rzutSkali(wykres.prog_luk.do, s);
    const r = (wykres.prog_luk.promien_a * PROMIEN_PX) / s;
    prog = (
      <path
        data-testid={`${testid}-prog`}
        d={`M ${px(od)} A ${r} ${r} 0 ${wykres.prog_luk.duzy_luk ? 1 : 0} 0 ${px(doP)}`}
        fill="none"
        stroke="var(--mvd-ink)"
        strokeDasharray="5 4"
        strokeWidth={1.25}
      />
    );
  }
  const etykietaProgu = wykres.prog_odcinek ? rzutSkali(wykres.prog_odcinek[1], s) : g1;
  return (
    <figure className="mvd-eaz-wykres" data-testid={testid}>
      <figcaption>
        {T.wykresTytul} · {T.wykresSektor(wykres.tryb_pl, liczba(wykres.polowa_sektora_deg, 0))} ·{' '}
        U₀&gt; = {liczba(wykres.prog_u0_proc, 0)} %
      </figcaption>
      <svg
        viewBox={`0 0 ${SZEROKOSC} ${WYSOKOSC}`}
        width={SZEROKOSC}
        height={WYSOKOSC}
        role="img"
        aria-label={T.wykresTytul}
      >
        <defs>
          {(['w', 'p'] as const).map((k) => (
            <marker
              key={k}
              id={`${testid}-grot-${k}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={k === 'w' ? 'var(--mvd-accent)' : 'var(--mvd-warn)'} />
            </marker>
          ))}
        </defs>
        <path
          data-testid={`${testid}-sektor`}
          d={sektor}
          fill="var(--mvd-ok)"
          fillOpacity={0.12}
          stroke="var(--mvd-ok)"
          strokeOpacity={0.6}
        />
        <circle cx={SRODEK_X} cy={SRODEK_Y} r={PROMIEN_PX} fill="none" stroke="var(--mvd-line)" />
        <line x1={SRODEK_X - PROMIEN_PX} y1={SRODEK_Y} x2={odniesienie[0]} y2={SRODEK_Y} stroke="var(--mvd-line-strong)" />
        <line x1={SRODEK_X} y1={SRODEK_Y - PROMIEN_PX} x2={SRODEK_X} y2={SRODEK_Y + PROMIEN_PX} stroke="var(--mvd-line)" />
        <text x={odniesienie[0] + 4} y={SRODEK_Y + 4} className="mvd-eaz-wykres-tekst" fill="var(--mvd-muted)">
          {T.wykresOdniesienie}
        </text>
        <line
          data-testid={`${testid}-os`}
          x1={SRODEK_X}
          y1={SRODEK_Y}
          x2={osKoniec[0]}
          y2={osKoniec[1]}
          stroke="var(--mvd-ok)"
          strokeWidth={1.5}
        />
        <text x={osKoniec[0] + 4} y={osKoniec[1] - 6} className="mvd-eaz-wykres-tekst" fill="var(--mvd-ok)">
          {T.wykresOs(liczba(wykres.os_deg, 0))}
        </text>
        {prog}
        <text
          x={etykietaProgu[0] + 4}
          y={Math.max(etykietaProgu[1] + 4, 12)}
          className="mvd-eaz-wykres-tekst"
          fill="var(--mvd-ink)"
        >
          {T.wykresProg(liczba(wykres.prog_a))}
        </text>
        {wykres.wskazy.map((w) => (
          <Wskaz key={w.rola} wskaz={w} skala={s} testid={testid} />
        ))}
      </svg>
    </figure>
  );
}
