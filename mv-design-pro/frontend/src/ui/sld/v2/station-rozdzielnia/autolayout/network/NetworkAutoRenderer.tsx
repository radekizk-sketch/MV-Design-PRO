/**
 * E3 NETWORK renderer — thin: GEOMETRY from layoutNetwork, glyphs from the E0 canon. Draws the GPZ,
 * the orthogonal feeders (the normally-open sectionalizer drawn OPEN, not omitted), and a COMPACT
 * block per station (incomer breaker · 15/0,4 transformer · nN bus · DER badges) — the LOD-far
 * view; zoom-in expands a station to its full E2 SLD. No physics here (overview labels only).
 */
import {
  AMBER,
  fmt,
  lbl,
  NN_BUS,
  SANS,
  SN_BUS,
  TrafoDyn,
  TXT,
  TXT2,
  TXT_MUTED,
  Wylacznik,
} from '../../canon/sldCanonKit';
import type { FeederRoute, NetworkLayout, StationPlacement } from './networkLayout';
import type { SldNetworkModel } from './networkModel';

const DER_BADGE: Record<string, { t: string; c: string }> = {
  pv_inverter: { t: 'PV', c: '#FFD23F' },
  bess: { t: 'BESS', c: '#5BD6A6' },
  wind_inverter: { t: 'FW', c: '#7FD1FF' },
};

function Feeder({ f }: { f: FeederRoute }): JSX.Element {
  const d = f.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  if (!f.open) return <path d={d} fill="none" stroke={SN_BUS} strokeWidth={2.4} />;
  // open sectionalizer: amber dashed line + an open-switch tick at the midpoint.
  const mid = f.points[Math.floor(f.points.length / 2)] ?? f.points[0];
  return (
    <g data-testid={`feeder-open-${f.to}`}>
      <path d={d} fill="none" stroke={AMBER} strokeWidth={2} strokeDasharray="6 4" />
      <circle cx={mid[0]} cy={mid[1]} r={6} fill="#0A1622" stroke={AMBER} strokeWidth={1.6} />
      <line x1={mid[0] - 5} y1={mid[1] + 5} x2={mid[0] + 6} y2={mid[1] - 6} stroke={AMBER} strokeWidth={1.6} />
      {lbl(mid[0] + 10, mid[1] - 6, 'N.O.', AMBER, 8, 700)}
    </g>
  );
}

function StationBlock({ p }: { p: StationPlacement }): JSX.Element {
  const x0 = p.x - p.w / 2;
  const y0 = p.y - p.h / 2;
  const bandColor = p.kind === 'trunk' ? '#2E6E8E' : '#1E5570';
  return (
    <g data-testid={`net-station-${p.id}`} data-kind={p.kind} data-nop={p.nopDownstream ? '1' : '0'}>
      <rect x={x0} y={y0} width={p.w} height={p.h} rx={7} fill="#0C1B27" stroke={p.nopDownstream ? AMBER : bandColor} strokeWidth={p.nopDownstream ? 2 : 1.3} />
      {/* incomer breaker on the 15 kV tap */}
      <line x1={p.x} y1={y0} x2={p.x} y2={y0 + 14} stroke={SN_BUS} strokeWidth={1.8} />
      <Wylacznik x={p.x} y={y0 + 22} />
      {/* 15/0,4 transformer */}
      <TrafoDyn x={p.x} y={p.y + 4} />
      {lbl(p.x + 15, p.y + 2, 'Dyn', TXT2, 7, 700)}
      {/* nN busbar stub */}
      <line x1={p.x - 26} y1={y0 + p.h - 16} x2={p.x + 26} y2={y0 + p.h - 16} stroke={NN_BUS} strokeWidth={3} strokeLinecap="round" />
      {/* labels */}
      {lbl(x0 + 7, y0 + 13, p.id, '#9FE6FF', 10, 800)}
      {lbl(p.x + 30, y0 + 13, p.name.replace(/^Stacja\s+/, ''), TXT_MUTED, 7.5, 600)}
      {/* DER badges */}
      {p.der.map((der, i) => {
        const b = DER_BADGE[der] ?? { t: der.slice(0, 3).toUpperCase(), c: TXT };
        return (
          <g key={`${p.id}-der-${i}`}>
            <rect x={x0 + 6 + i * 34} y={y0 + p.h - 14} width={30} height={11} rx={3} fill="#0A1622" stroke={b.c} strokeWidth={0.9} />
            {lbl(x0 + 21 + i * 34, y0 + p.h - 5, b.t, b.c, 7, 800, 'middle')}
          </g>
        );
      })}
      {p.trafoMva != null && lbl(p.x - 30, p.y + 4, `${fmt(p.trafoMva, 2)}`, TXT_MUTED, 7, 600, 'end')}
    </g>
  );
}

export function NetworkAutoRenderer({ layout, model }: { layout: NetworkLayout; model: SldNetworkModel }): JSX.Element {
  const { gpz } = layout;
  return (
    <g data-testid="sld-network-autolayout" data-hash={layout.hash} data-stations={layout.stations.length}>
      <text x={layout.bbox.x + layout.bbox.width / 2} y={layout.bbox.y + 28} textAnchor="middle"
        fill="#F4F6F8" fontFamily={SANS} fontSize={20} fontWeight={800}>
        {`SIEĆ SN — AUTO-LAYOUT (E3) ze MODELU · ${layout.stations.length} stacji · GPZ ${model.gpz.hv_kv}/${model.gpz.sn_kv} kV`}
      </text>

      {/* voltage-band guides */}
      {layout.bands.map((b) => (
        <g key={`band-${b.kv}`}>
          <line x1={layout.bbox.x} y1={b.y} x2={layout.bbox.x + layout.bbox.width} y2={b.y} stroke="#13435A" strokeWidth={1} strokeDasharray="2 6" />
          {lbl(layout.bbox.x + 6, b.y - 6, `${fmt(b.kv, b.kv >= 1 ? 0 : 2)} kV`, TXT2, 10, 700)}
        </g>
      ))}

      {/* feeders first (under blocks) */}
      {layout.feeders.map((f) => <Feeder key={f.id} f={f} />)}

      {/* GPZ block */}
      <g data-testid="net-gpz">
        <rect x={gpz.x - gpz.w / 2} y={gpz.y - gpz.h / 2} width={gpz.w} height={gpz.h} rx={8} fill="#0C1B27" stroke="#3A7CA5" strokeWidth={1.8} />
        <TrafoDyn x={gpz.x} y={gpz.y + 2} />
        {lbl(gpz.x, gpz.y - gpz.h / 2 + 15, model.gpz.name.replace(/\s*\d.*$/, '') || 'GPZ', '#9FE6FF', 10, 800, 'middle')}
        {lbl(gpz.x, gpz.y + gpz.h / 2 - 8, `${model.gpz.hv_kv}/${model.gpz.sn_kv} kV`, TXT_MUTED, 8, 700, 'middle')}
      </g>

      {/* station blocks */}
      {layout.stations.map((p) => <StationBlock key={p.id} p={p} />)}
    </g>
  );
}
