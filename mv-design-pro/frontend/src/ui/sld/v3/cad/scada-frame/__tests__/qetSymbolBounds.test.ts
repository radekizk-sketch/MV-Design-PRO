import { describe, expect, it } from 'vitest';
import { QET_PILOT_SYMBOLS } from '../qetPilotSourceGeometry';
import { boundsOfPath, boundsOfQetSymbol, fitQetSymbol, projectedQetFrame } from '../qetSymbolBounds';

describe('QET — pełna geometria, poprawny środek i stałe ramki',()=>{
  const frame={x:8,y:7,width:84,height:100} as const;
  const pad=12;

  it.each(QET_PILOT_SYMBOLS.map(s=>[s.id,s] as const))(
    '%s: każdy port i cały rysunek zmieści się w ramce z marginesem',
    (_id,symbol)=>{
      const fit=fitQetSymbol(symbol,frame,pad);
      const b=fit.bounds;
      expect(fit.scale).toBeGreaterThan(0);
      const left=b.minX*fit.scale+fit.offsetX;
      const right=b.maxX*fit.scale+fit.offsetX;
      const top=b.minY*fit.scale+fit.offsetY;
      const bottom=b.maxY*fit.scale+fit.offsetY;
      expect(left).toBeGreaterThanOrEqual(frame.x+pad-.000001);
      expect(right).toBeLessThanOrEqual(frame.x+frame.width-pad+.000001);
      expect(top).toBeGreaterThanOrEqual(frame.y+pad-.000001);
      expect(bottom).toBeLessThanOrEqual(frame.y+frame.height-pad+.000001);
      expect((left+right)/2).toBeCloseTo(frame.x+frame.width/2,6);
      expect((top+bottom)/2).toBeCloseTo(frame.y+frame.height/2,6);
      for(const port of symbol.ports){
        expect(port.x).toBeGreaterThanOrEqual(b.minX);
        expect(port.x).toBeLessThanOrEqual(b.maxX);
        expect(port.y).toBeGreaterThanOrEqual(b.minY);
        expect(port.y).toBeLessThanOrEqual(b.maxY);
      }
    },
  );

  it.each(QET_PILOT_SYMBOLS.map(s=>[s.id,s] as const))(
    '%s: obrys jest jednakowy po zmianie stanu, także po obrocie na sprzęgle',
    (_id,symbol)=>{
      const b=boundsOfQetSymbol(symbol);
      const a=symbol.ports[0],c=symbol.ports[1];
      const midX=(a.x+c.x)/2,midY=(a.y+c.y)/2;
      for(const horizontal of [false,true]){
        const cx=181,cy=91,scale=1.3,pad=4;
        const rect=projectedQetFrame(symbol,{cx,cy,scale,horizontal},pad);
        for(const [x,y] of [
          [b.minX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY],[b.maxX,b.minY],
        ]){
          const dx=(x-midX)*scale,dy=(y-midY)*scale;
          const tx=horizontal?cx-dy:cx+dx;
          const ty=horizontal?cy+dx:cy+dy;
          expect(tx).toBeGreaterThanOrEqual(rect.x+pad-.000001);
          expect(tx).toBeLessThanOrEqual(rect.x+rect.width-pad+.000001);
          expect(ty).toBeGreaterThanOrEqual(rect.y+pad-.000001);
          expect(ty).toBeLessThanOrEqual(rect.y+rect.height-pad+.000001);
        }
      }
    },
  );

  it('RCCB/RCBO: ograniczenie łuku SVG mieści całe źródło',()=>{
    const rccb=QET_PILOT_SYMBOLS.find(s=>s.id==='rccb')!;
    const rcbo=QET_PILOT_SYMBOLS.find(s=>s.id==='rcbo')!;
    expect(boundsOfQetSymbol(rccb).width).toBeGreaterThan(0);
    expect(boundsOfQetSymbol(rcbo).height).toBeGreaterThan(0);
    const curved=boundsOfPath('M 20 22 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0');
    expect(curved.minX).toBeLessThanOrEqual(18);
    expect(curved.maxX).toBeGreaterThanOrEqual(26);
  });

  it('nieznane polecenie SVG odrzucane zamiast wyliczać błędną ramkę',()=>{
    expect(()=>boundsOfPath('M 0 0 Q 10 10 20 0')).toThrow();
    expect(()=>boundsOfPath('')).toThrow();
  });
});
