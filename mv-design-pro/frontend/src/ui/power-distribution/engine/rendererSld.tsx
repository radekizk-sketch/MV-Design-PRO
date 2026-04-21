/**
 * rendererSld.tsx — Krok 9: Renderer SVG schematu SLD.
 *
 * ARCHITEKTURA: Warstwa PREZENTACJI — czysty render bez logiki biznesowej.
 *
 * ZASADY:
 * - Konsumuje WYLACZNIE WynikUkladuSld (wynik pipeline'u).
 * - ZERO fizyki, ZERO mutacji modelu.
 * - Style z CANONICAL_STROKE / CANONICAL_VOLTAGE_COLORS (import z sldCanonicalStyle).
 * - Determinizm: ten sam WynikUkladuSld → identyczny SVG.
 * - Etykiety po polsku.
 */

import React from 'react';
import type {
  WynikUkladuSld,
  GeometriaObiektu,
  GeometriaPola,
  GeometriaSzyny,
  TrasaPolaczenia,
  PunktLamania,
} from './sldContracts';
import { CANONICAL_STROKE, CANONICAL_VOLTAGE_COLORS, CANONICAL_STATE_COLORS } from '../../sld/sldCanonicalStyle';

// =============================================================================
// § 1. STALE STYLOW
// =============================================================================

/** Kolor szyny zbiorczej SN. */
const KOLOR_SZYNY = CANONICAL_VOLTAGE_COLORS.SN;

/** Kolor linii (feeder). */
const KOLOR_LINII = CANONICAL_VOLTAGE_COLORS.SN;

/** Kolor linii NOP (normalnie otwartej). */
const KOLOR_NOP = CANONICAL_STATE_COLORS.deenergized;

/** Kolor tla obiektu (stacji). */
const KOLOR_TLA_OBIEKTU = '#F8FAFC';

/** Kolor obrysu obiektu. */
const KOLOR_OBRYSU = '#CBD5E1';

/** Kolor tla aparatu. */
const KOLOR_TLA_APARATU = '#FFFFFF';

/** Kolor tekstu. */
const KOLOR_TEKSTU = '#1E293B';

/** Kolor portu. */
const KOLOR_PORTU = '#EF4444';

/** Rozmiar portu (promien). */
const PROMIEN_PORTU = 3;

/** Margines viewBox. */
const MARGINES_VIEWBOX = 40;

// =============================================================================
// § 2. KOMPONENT SZYNY
// =============================================================================

interface SzynaProps {
  readonly szyna: GeometriaSzyny;
}

const SzynaSvg: React.FC<SzynaProps> = ({ szyna }) => (
  <g data-element="szyna" data-obiekt={szyna.obiektId}>
    {szyna.sekcje.map((sekcja) => (
      <line
        key={sekcja.sekcjaId}
        x1={sekcja.x1}
        y1={szyna.y + szyna.wysokosc / 2}
        x2={sekcja.x2}
        y2={szyna.y + szyna.wysokosc / 2}
        stroke={KOLOR_SZYNY}
        strokeWidth={CANONICAL_STROKE.busbar}
        strokeLinecap="round"
      />
    ))}
  </g>
);

// =============================================================================
// § 3. KOMPONENT POLA
// =============================================================================

interface PoleProps {
  readonly pole: GeometriaPola;
  readonly szynaY: number;
}

/** Mapowanie typu aparatu na ksztalt SVG. */
function renderujAparat(
  elementId: string,
  pozycja: { readonly x: number; readonly y: number },
  rozmiar: { readonly szer: number; readonly wys: number },
  obrot: number,
): React.ReactElement {
  const polSzer = rozmiar.szer / 2;
  const polWys = rozmiar.wys / 2;

  return (
    <g
      key={elementId}
      data-element="aparat"
      data-id={elementId}
      transform={`translate(${pozycja.x}, ${pozycja.y}) rotate(${obrot})`}
    >
      <rect
        x={-polSzer}
        y={-polWys}
        width={rozmiar.szer}
        height={rozmiar.wys}
        fill={KOLOR_TLA_APARATU}
        stroke={KOLOR_SZYNY}
        strokeWidth={CANONICAL_STROKE.symbol}
        rx={2}
      />
      {/* Krzyzyk wewnatrz symbolu (wylacznik) */}
      <line
        x1={-polSzer + 3}
        y1={-polWys + 3}
        x2={polSzer - 3}
        y2={polWys - 3}
        stroke={KOLOR_SZYNY}
        strokeWidth={1}
      />
      <line
        x1={polSzer - 3}
        y1={-polWys + 3}
        x2={-polSzer + 3}
        y2={polWys - 3}
        stroke={KOLOR_SZYNY}
        strokeWidth={1}
      />
    </g>
  );
}

const PoleSvg: React.FC<PoleProps> = ({ pole, szynaY }) => (
  <g data-element="pole" data-id={pole.polaId}>
    {/* Tor pola (linia od szyny do portu) */}
    <line
      x1={pole.poczatekToru.x}
      y1={pole.poczatekToru.y}
      x2={pole.koniecToru.x}
      y2={pole.koniecToru.y}
      stroke={KOLOR_LINII}
      strokeWidth={CANONICAL_STROKE.feeder}
    />
    {/* Kropka polaczenia z szyna */}
    <circle
      cx={pole.poczatekToru.x}
      cy={szynaY}
      r={3}
      fill={KOLOR_SZYNY}
    />
    {/* Aparatura */}
    {pole.pozycjeAparaturowe.map((ap) =>
      renderujAparat(ap.elementId, ap.pozycja, ap.rozmiar, ap.obrot),
    )}
    {/* Port (punkt polaczeniowy) */}
    <circle
      cx={pole.port.pozycja.x}
      cy={pole.port.pozycja.y}
      r={PROMIEN_PORTU}
      fill={KOLOR_PORTU}
      stroke="#FFFFFF"
      strokeWidth={1}
    />
  </g>
);

// =============================================================================
// § 4. KOMPONENT OBIEKTU (STACJI)
// =============================================================================

interface ObiektProps {
  readonly geometria: GeometriaObiektu;
  readonly nazwa?: string;
}

const ObiektSvg: React.FC<ObiektProps> = ({ geometria, nazwa }) => (
  <g data-element="obiekt" data-id={geometria.obiektId}>
    {/* Tlo obiektu */}
    <rect
      x={geometria.obrys.x}
      y={geometria.obrys.y}
      width={geometria.obrys.szerokosc}
      height={geometria.obrys.wysokosc}
      fill={KOLOR_TLA_OBIEKTU}
      stroke={KOLOR_OBRYSU}
      strokeWidth={1}
      rx={4}
      strokeDasharray="4 2"
    />
    {/* Nazwa obiektu */}
    {nazwa && (
      <text
        x={geometria.obrys.x + geometria.obrys.szerokosc / 2}
        y={geometria.obrys.y + 14}
        textAnchor="middle"
        fill={KOLOR_TEKSTU}
        fontSize={12}
        fontWeight={700}
        fontFamily="Inter, Arial, sans-serif"
      >
        {nazwa}
      </text>
    )}
    {/* Szyna */}
    <SzynaSvg szyna={geometria.szyna} />
    {/* Pola */}
    {geometria.pola.map((pole) => (
      <PoleSvg
        key={pole.polaId}
        pole={pole}
        szynaY={geometria.szyna.y + geometria.szyna.wysokosc / 2}
      />
    ))}
  </g>
);

// =============================================================================
// § 5. KOMPONENT TRASY POLACZENIA
// =============================================================================

interface TrasaProps {
  readonly trasa: TrasaPolaczenia;
}

function budujSciezkeSvg(punkty: readonly PunktLamania[]): string {
  if (punkty.length === 0) return '';
  let d = `M ${punkty[0].x} ${punkty[0].y}`;
  for (let i = 1; i < punkty.length; i++) {
    d += ` L ${punkty[i].x} ${punkty[i].y}`;
  }
  return d;
}

const TrasaSvg: React.FC<TrasaProps> = ({ trasa }) => {
  const kolor = trasa.normalnieOtwarty ? KOLOR_NOP : KOLOR_LINII;
  const styl = trasa.normalnieOtwarty ? '8 4' : undefined;

  return (
    <g data-element="trasa" data-polaczenie={trasa.polaczenieId}>
      <path
        d={budujSciezkeSvg(trasa.punkty)}
        fill="none"
        stroke={kolor}
        strokeWidth={CANONICAL_STROKE.feeder}
        strokeDasharray={styl}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Symbol NOP (kwadrat na srodku trasy) */}
      {trasa.normalnieOtwarty && trasa.punkty.length >= 2 && (() => {
        const srodekIdx = Math.floor(trasa.punkty.length / 2);
        const p = trasa.punkty[srodekIdx];
        return (
          <rect
            x={p.x - 6}
            y={p.y - 6}
            width={12}
            height={12}
            fill="#FFFFFF"
            stroke={KOLOR_NOP}
            strokeWidth={2}
          />
        );
      })()}
    </g>
  );
};

// =============================================================================
// § 6. GLOWNY RENDERER SLD
// =============================================================================

export interface RendererSldProps {
  /** Wynik pipeline'u SLD (pelna geometria). */
  readonly wynik: WynikUkladuSld;
  /** Mapa obiektId → nazwa (dla etykiet). */
  readonly nazwy?: ReadonlyMap<string, string>;
  /** Szerokosc kontenera [px]. Domyslnie: auto (z viewBox). */
  readonly szerokosc?: number;
  /** Wysokosc kontenera [px]. Domyslnie: auto (z viewBox). */
  readonly wysokosc?: number;
  /** Klasa CSS. */
  readonly className?: string;
}

/**
 * RendererSld — czysty renderer SVG schematu SLD.
 *
 * Konsumuje WynikUkladuSld i renderuje:
 * - Obiekty (stacje, GPZ) z szynami i polami
 * - Trasy polaczen (ortogonalne)
 * - Porty, aparature, etykiety
 *
 * ZERO logiki biznesowej. ZERO fizyki. Czysty render.
 */
export const RendererSld: React.FC<RendererSldProps> = ({
  wynik,
  nazwy,
  szerokosc,
  wysokosc,
  className,
}) => {
  const vb = wynik.obrysCalkowity;
  const viewBox = `${vb.x - MARGINES_VIEWBOX} ${vb.y - MARGINES_VIEWBOX} ${vb.szerokosc + 2 * MARGINES_VIEWBOX} ${vb.wysokosc + 2 * MARGINES_VIEWBOX}`;

  if (wynik.obiekty.length === 0) {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: wysokosc ?? 400, color: '#94A3B8' }}>
        <span>Brak obiektow w sieci — dodaj stacje aby wygenerowac schemat SLD</span>
      </div>
    );
  }

  return (
    <svg
      viewBox={viewBox}
      width={szerokosc ?? '100%'}
      height={wysokosc ?? '100%'}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ background: '#FFFFFF' }}
      data-sld-hash={wynik.hash}
    >
      {/* Warstwa 1: Trasy polaczen (za obiektami) */}
      <g data-layer="trasy">
        {wynik.trasy.map((trasa) => (
          <TrasaSvg key={trasa.polaczenieId} trasa={trasa} />
        ))}
      </g>
      {/* Warstwa 2: Obiekty (stacje, GPZ) */}
      <g data-layer="obiekty">
        {wynik.obiekty.map((geom) => (
          <ObiektSvg
            key={geom.obiektId}
            geometria={geom}
            nazwa={nazwy?.get(geom.obiektId)}
          />
        ))}
      </g>
      {/* Stopka: hash deterministyczny */}
      <text
        x={vb.x + vb.szerokosc - MARGINES_VIEWBOX}
        y={vb.y + vb.wysokosc + MARGINES_VIEWBOX - 4}
        textAnchor="end"
        fill="#CBD5E1"
        fontSize={8}
        fontFamily="monospace"
      >
        SLD#{wynik.hash}
      </text>
    </svg>
  );
};
