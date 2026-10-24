/**
 * QET-SCADA Frame w istniejącej kanwie nN: wyłącznie warstwa symboli.
 *
 * Zgodne rodziny korzystają z 7 oryginalnych QET .elmt, renderowanych przez
 * istniejący CadPrimitiveLayer (ten sam rysujPrymityw co CadSymbol).
 * Pozostałe rodziny używają kanonicznego CadSymbol, bez udawania QET.
 *
 * Warianty zamknięte QET nadal mają status DRAFT do kontroli geometrycznej.
 * Integracja opt-in do odbioru; bez zmian topologii i solvera.
 */
import { CadSymbol, CadPrimitiveLayer } from '../CadSymbol';
import {
  ELECTRICAL_CAD_SYMBOL_REGISTRY,
  type CadSymbolId, type CadOrientation,
} from '../cadSymbolRegistry';
import { QetScadaFrame } from './QetScadaFrame';
import { ocenStanRamki, type ScadaFrameInput } from './scadaFrameState';
import { QET_PILOT_SYMBOLS } from './qetPilotSourceGeometry';
import { projectedQetFrame } from './qetSymbolBounds';

const QET_ID_BY_CAD: Partial<Record<CadSymbolId,string>> = {
  'cad.wylacznik':'breaker',
  'cad.wylacznikInstalacyjny':'mcb',
  'cad.wylacznikRoznicowopradowy':'rccb',
  'cad.odlacznik':'disconnector',
  'cad.bezpiecznik':'fuse',
  'cad.rozlacznikBezpiecznikowy':'fuseSwitch',
};

export interface QetScadaCanvasGlyphProps {
  readonly symbolId: CadSymbolId;
  /** Środek aparatu w kanonicznej scenie ENM. */
  readonly cx: number;
  readonly cy: number;
  readonly k: number;
  readonly input: ScadaFrameInput;
  readonly orientation: CadOrientation;
  readonly ink: string;
  readonly paper: string;
}

export function QetScadaCanvasGlyph(props:QetScadaCanvasGlyphProps): JSX.Element {
  const stan = ocenStanRamki(props.input);
  const sourceId=QET_ID_BY_CAD[props.symbolId];
  const qet=QET_PILOT_SYMBOLS.find(s=>s.id===sourceId);
  const def=ELECTRICAL_CAD_SYMBOL_REGISTRY[props.symbolId];
  const poziomy = props.orientation==='pozioma';
  const spanCad = def.terminals.length>=2
    ? Math.hypot(
      def.terminals[1].x-def.terminals[0].x,
      def.terminals[1].y-def.terminals[0].y,
    ) : def.nominalHeight;
  const ports=qet?.ports;
  const a=ports?.[0],b=ports?.[1];
  const spanQet=a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;
  const canUseQet=Boolean(qet&&a&&b&&spanQet>0);
  const qetScale = canUseQet ? spanCad * props.k / spanQet : props.k;
  const midX = a&&b ? (a.x+b.x)/2 : 0;
  const midY = a&&b ? (a.y+b.y)/2 : 0;
  // Ramka obejmuje rzeczywistą sumę obwiedni OTWARTY/ZAMKNIĘTY, oznaczeń
  // i zacisków, a nie deklarowane tylko nominalne height/width QET.
  // Obrót w poziomie nie zmienia dopasowania ramki i nie przesuwa jej po toggle.
  const pad=Math.max(3.8*props.k, 1.4);
  const qetFrame=canUseQet && qet
    ? projectedQetFrame(qet, {
        cx:props.cx,cy:props.cy,scale:qetScale,horizontal:poziomy,
      },pad)
    : null;
  const fallbackW=(poziomy?def.nominalHeight:def.nominalWidth)*props.k;
  const fallbackH=(poziomy?def.nominalWidth:def.nominalHeight)*props.k;
  const frameW=qetFrame?.width ?? fallbackW+2*pad;
  const frameH=qetFrame?.height ?? fallbackH+2*pad;
  const frameX=qetFrame?.x ?? props.cx-frameW/2;
  const frameY=qetFrame?.y ?? props.cy-frameH/2;

  const geometry=canUseQet && qet ? (
    <g
      data-cad-family-source="qelectrotech"
      data-qet-original-id={qet.id}
      data-closed-variant-status="DRAFT"
      transform={poziomy?`rotate(90 ${props.cx} ${props.cy})`:undefined}
    >
      <CadPrimitiveLayer
        primitives={stan.stanGeometryczny==='closed'?qet.closed:qet.open}
        x={props.cx-midX*qetScale}
        y={props.cy-midY*qetScale}
        scale={qetScale}
        ink={props.ink}
        paper={props.paper}
        nonScalingStroke
      />
    </g>
  ) : (
    <g data-cad-family-source="registry-fallback">
      <CadSymbol
        id={props.symbolId}
        x={props.cx-def.anchors.center.x*props.k}
        y={props.cy-def.anchors.center.y*props.k}
        scale={props.k}
        state={stan.stanGeometryczny==='closed'?'closed':'open'}
        orientation={props.orientation}
        ink={props.ink}
        paper={props.paper}
      />
    </g>
  );

  return (
    <QetScadaFrame
      input={props.input}
      x={frameX} y={frameY} width={frameW} height={frameH}
      showStateLabel={false}
    >
      {geometry}
    </QetScadaFrame>
  );
}
