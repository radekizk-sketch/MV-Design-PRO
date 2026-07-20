/**
 * Charakterystyki NC RfG (poglądowe) — czysta prezentacja SVG kształtu PRAWA
 * STEROWANIA, którego nastawy ustawia projektant (specyfikacja regulacji, NIE wynik
 * sieciowy). Rzeczywisty wstrzyknięty Q / zredukowaną P w punkcie pracy liczy solver
 * (kanoniczny rozpływ mocy). ZERO fizyki sieci: rysunek zależy wyłącznie od nastaw
 * użytkownika i normatywnego kształtu (nachylenie / pasmo / cosφ) — bez napięć z
 * rozwiązanego przypadku, bez √3, bez impedancji. Kolory wyłącznie przez tokeny
 * --mvd-*; deterministyczne (stałe wymiary, brak animacji, brak losowości).
 */

import { SUGEROWANE, type TrybRegulacji } from './zrodloOzeModel';
import { NCRFG_TEORIA as TT, OZE_STRINGS as T } from './strings';
import './wykresyNcRfg.css';

const VBW = 440;
const VBH = 210;
const PAD = { l: 48, r: 18, t: 16, b: 34 };
const PLW = VBW - PAD.l - PAD.r;
const PLH = VBH - PAD.t - PAD.b;

/** Mapowanie znormalizowanej wartości t∈[0,1] na piksel osi (X rośnie w prawo). */
const px = (t: number): number => PAD.l + t * PLW;
/** Mapowanie t∈[0,1] na piksel osi Y (rośnie w górę → odwracamy). */
const py = (t: number): number => PAD.t + (1 - t) * PLH;

interface Ramka {
  osX: string;
  osY: string;
}

/** Wspólna ramka wykresu (osie, etykiety). */
function Ramka({ osX, osY }: Ramka) {
  return (
    <>
      <line x1={PAD.l} y1={py(0)} x2={px(1)} y2={py(0)} className="mvd-ncrfg-os" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={py(0)} className="mvd-ncrfg-os" />
      <text x={px(1)} y={VBH - 8} textAnchor="end" className="mvd-ncrfg-etyk">
        {osX}
      </text>
      <text x={6} y={PAD.t + 4} className="mvd-ncrfg-etyk">
        {osY}
      </text>
    </>
  );
}

// ------------------------------------------------------------------ Q(U)

/** Charakterystyka Q(U): pasmo nieczułości (Q=0) + liniowe ramiona ze statyzmem. */
export function WykresQU({
  slope,
  dbLow,
  dbHigh,
  isExample,
}: {
  slope: number;
  dbLow: number;
  dbHigh: number;
  isExample: boolean;
}) {
  const uMin = 0.85;
  const uMax = 1.15;
  const qClamp = 0.5; // zakres poglądowy Q [pu] do skalowania osi
  const nx = (u: number) => (u - uMin) / (uMax - uMin);
  const ny = (q: number) => (q + qClamp) / (2 * qClamp); // −qClamp..+qClamp → 0..1
  // Prawo Q(U): w paśmie Q=0; poza pasmem Q = −slope·(U − granica), ograniczone.
  const qOf = (u: number): number => {
    let q = 0;
    if (u > dbHigh) q = -slope * (u - dbHigh);
    else if (u < dbLow) q = -slope * (u - dbLow);
    return Math.max(-qClamp, Math.min(qClamp, q));
  };
  const pts: string[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const u = uMin + ((uMax - uMin) * i) / 60;
    pts.push(`${px(nx(u)).toFixed(1)},${py(ny(qOf(u))).toFixed(1)}`);
  }
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-ncrfg-svg" role="img" aria-label={TT.qu.tytul}>
      {/* pasmo nieczułości */}
      <rect
        x={px(nx(dbLow))}
        y={PAD.t}
        width={Math.max(0, px(nx(dbHigh)) - px(nx(dbLow)))}
        height={PLH}
        className="mvd-ncrfg-pasmo"
      />
      {/* linia Q=0 i napięcie znamionowe 1.0 pu */}
      <line x1={PAD.l} y1={py(ny(0))} x2={px(1)} y2={py(ny(0))} className="mvd-ncrfg-siatka" />
      <line x1={px(nx(1.0))} y1={PAD.t} x2={px(nx(1.0))} y2={py(0)} className="mvd-ncrfg-siatka" />
      <Ramka osX={TT.osU} osY={TT.osQ} />
      <polyline points={pts.join(' ')} className={isExample ? 'mvd-ncrfg-krzywa-przyklad' : 'mvd-ncrfg-krzywa'} />
      <text x={PAD.l + 4} y={PAD.t + 12} className="mvd-ncrfg-znak">
        {TT.qOddawanie}
      </text>
      <text x={PAD.l + 4} y={py(0) - 6} className="mvd-ncrfg-znak">
        {TT.qPobor}
      </text>
      <text x={(px(nx(dbLow)) + px(nx(dbHigh))) / 2} y={PAD.t + 12} textAnchor="middle" className="mvd-ncrfg-pasmo-txt">
        {TT.pasmoNieczulosci}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ P(f)/LFSM

/** Charakterystyka P(f)/LFSM: pasmo nieczułości + opadające ramię LFSM-O (i opcjonalnie LFSM-U). */
export function WykresPf({
  droopPct,
  dbHz,
  allowIncrease,
  isExample,
}: {
  droopPct: number;
  dbHz: number;
  allowIncrease: boolean;
  isExample: boolean;
}) {
  const f0 = 50;
  const fMin = 49;
  const fMax = 51;
  const pMin = 40;
  const pMax = 110;
  const nx = (f: number) => (f - fMin) / (fMax - fMin);
  const ny = (p: number) => (p - pMin) / (pMax - pMin);
  // Współczynnik mocy: pasmo → 1; nadczęstotliwość → redukcja; podczęstotliwość → wzrost (LFSM-U).
  const factor = (f: number): number => {
    const df = f - f0;
    if (Math.abs(df) <= dbHz) return 1;
    if (df > dbHz) return Math.max(0, 1 - (df - dbHz) / f0 / (droopPct / 100));
    if (allowIncrease) return 1 + (-df - dbHz) / f0 / (droopPct / 100);
    return 1;
  };
  const pts: string[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const f = fMin + ((fMax - fMin) * i) / 60;
    const p = Math.max(pMin, Math.min(pMax, factor(f) * 100));
    pts.push(`${px(nx(f)).toFixed(1)},${py(ny(p)).toFixed(1)}`);
  }
  const fProg = f0 + dbHz;
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-ncrfg-svg" role="img" aria-label={TT.pf.tytul}>
      <rect
        x={px(nx(f0 - dbHz))}
        y={PAD.t}
        width={Math.max(0, px(nx(f0 + dbHz)) - px(nx(f0 - dbHz)))}
        height={PLH}
        className="mvd-ncrfg-pasmo"
      />
      <line x1={PAD.l} y1={py(ny(100))} x2={px(1)} y2={py(ny(100))} className="mvd-ncrfg-siatka" />
      <line x1={px(nx(f0))} y1={PAD.t} x2={px(nx(f0))} y2={py(0)} className="mvd-ncrfg-siatka" />
      <Ramka osX={TT.osF} osY={TT.osP} />
      <polyline points={pts.join(' ')} className={isExample ? 'mvd-ncrfg-krzywa-przyklad' : 'mvd-ncrfg-krzywa'} />
      {/* próg LFSM-O */}
      <line x1={px(nx(fProg))} y1={PAD.t} x2={px(nx(fProg))} y2={py(0)} className="mvd-ncrfg-prog" />
      <text x={px(nx(fProg))} y={py(0) + 14} textAnchor="middle" className="mvd-ncrfg-znak">
        {`${fProg.toFixed(1)} Hz`}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ cosφ

/** Charakterystyka stałego cosφ: linia robocza Q = P·tan(arccos cosφ) + klin zdolności ±0,95. */
export function WykresCosPhi({ cosPhi, isExample }: { cosPhi: number; isExample: boolean }) {
  const qClamp = 0.5;
  const nx = (p: number) => p; // P już w [0,1] pu
  const ny = (q: number) => (q + qClamp) / (2 * qClamp);
  const tan = (c: number) => Math.tan(Math.acos(Math.max(0.001, Math.min(1, c))));
  const qAt1 = Math.max(-qClamp, Math.min(qClamp, tan(cosPhi))); // Q przy P=Pn
  const band = Math.min(qClamp, tan(0.95)); // ±0,3287 przy cosφ 0,95
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} className="mvd-ncrfg-svg" role="img" aria-label={TT.cosPhi.tytul}>
      {/* klin wymaganej zdolności ±0,95 */}
      <polygon
        points={`${px(nx(0))},${py(ny(0))} ${px(nx(1))},${py(ny(band))} ${px(nx(1))},${py(ny(-band))}`}
        className="mvd-ncrfg-pasmo"
      />
      <line x1={PAD.l} y1={py(ny(0))} x2={px(1)} y2={py(ny(0))} className="mvd-ncrfg-siatka" />
      <Ramka osX={TT.osPn} osY={TT.osQ} />
      {/* linia robocza (oddawanie) + lustro (pobór) */}
      <line
        x1={px(nx(0))}
        y1={py(ny(0))}
        x2={px(nx(1))}
        y2={py(ny(qAt1))}
        className={isExample ? 'mvd-ncrfg-krzywa-przyklad' : 'mvd-ncrfg-krzywa'}
      />
      <line x1={px(nx(0))} y1={py(ny(0))} x2={px(nx(1))} y2={py(ny(-qAt1))} className="mvd-ncrfg-krzywa-lustro" />
      <text x={PAD.l + 4} y={PAD.t + 12} className="mvd-ncrfg-znak">
        {TT.qOddawanie}
      </text>
      <text x={PAD.l + 4} y={py(0) - 6} className="mvd-ncrfg-znak">
        {TT.qPobor}
      </text>
    </svg>
  );
}

// ------------------------------------------------------------------ Panel

export interface CharakterystykaNcRfgProps {
  mode: TrybRegulacji;
  cosPhi: number | null;
  quSlope: number | null;
  quDbLow: number | null;
  quDbHigh: number | null;
  droopPct: number | null;
  pfDbHz: number | null;
  allowIncrease: boolean;
}

/** Kontekstowy panel: teoria NC RfG + żywy wykres charakterystyki dla wybranego trybu. */
export function CharakterystykaNcRfg(props: CharakterystykaNcRfgProps) {
  const { mode } = props;
  const teoria =
    mode === 'STALY_COS_PHI'
      ? TT.cosPhi
      : mode === 'Q_OD_U'
      ? TT.qu
      : mode === 'WYLACZONE' || mode === 'P_OD_U'
      ? TT.wylaczone
      : TT.wylaczone;

  let wykres: JSX.Element | null = null;
  if (mode === 'STALY_COS_PHI') {
    const isExample = props.cosPhi === null;
    wykres = <WykresCosPhi cosPhi={props.cosPhi ?? SUGEROWANE.cosPhi} isExample={isExample} />;
  } else if (mode === 'Q_OD_U') {
    const isExample = props.quSlope === null;
    wykres = (
      <WykresQU
        slope={props.quSlope ?? SUGEROWANE.quSlopePuPerPu}
        dbLow={props.quDbLow ?? SUGEROWANE.quDeadbandLowPu}
        dbHigh={props.quDbHigh ?? SUGEROWANE.quDeadbandHighPu}
        isExample={isExample}
      />
    );
  }
  // P(f)/LFSM: charakterystyka mocy czynnej — dostępna niezależnie od trybu Q, gdy podano statyzm.
  const pfWykres =
    props.droopPct !== null && props.droopPct > 0 ? (
      <WykresPf
        droopPct={props.droopPct}
        dbHz={props.pfDbHz ?? SUGEROWANE.pfDeadbandHz}
        allowIncrease={props.allowIncrease}
        isExample={false}
      />
    ) : null;

  return (
    <details className="mvd-ncrfg" data-testid="mvd-kreator-oze-teoria">
      <summary className="mvd-ncrfg-summary">{T.teoriaTytul}</summary>
      <div className="mvd-ncrfg-body">
        <p className="mvd-ncrfg-opis">{teoria.opis}</p>
        {wykres ? (
          <figure className="mvd-ncrfg-fig">
            {wykres}
            <figcaption className="mvd-ncrfg-cap">{teoria.jakCzytac}</figcaption>
          </figure>
        ) : (
          <p className="mvd-ncrfg-opis">{TT.brakCharakterystyki}</p>
        )}
        {pfWykres ? (
          <figure className="mvd-ncrfg-fig">
            {pfWykres}
            <figcaption className="mvd-ncrfg-cap">{TT.pf.jakCzytac}</figcaption>
          </figure>
        ) : null}
        <p className="mvd-ncrfg-wymog">
          <strong>{TT.wymogPrefix}</strong>
          {teoria.wymog}
        </p>
        <p className="mvd-ncrfg-podstawa">{T.teoriaPodstawa}</p>
      </div>
    </details>
  );
}
