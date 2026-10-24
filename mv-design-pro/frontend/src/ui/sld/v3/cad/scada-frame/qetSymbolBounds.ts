/**
 * Deterministyczny obrys źródłowej geometrii QElectroTech.
 * Nie używa DOM/getBBox/obrazów/obcięcia overflow; testowany w CI.
 * Obwiednia jest sumą OTWARTY + ZAMKNIĘTY + wszystkich zacisków:
 * zmiana położenia nie przesuwa ramki ani portów.
 *
 * SVG path: źródła pilotażowe używają M/L/Z/A/a (ścieżki oryginalnych .elmt).
 * Każdy nieobsługiwany rozkaz odrzucamy, bez zgadywania współrzędnych.
 */
import type { CadPrimitive } from '../cadSymbolRegistry';
import type { QetPilotSymbol } from './qetPilotSourceGeometry';

export interface Bounds2D {
  readonly minX:number; readonly minY:number;
  readonly maxX:number; readonly maxY:number;
  readonly width:number; readonly height:number;
  readonly centerX:number; readonly centerY:number;
}
export interface FrameRect {
  readonly x:number; readonly y:number;
  readonly width:number; readonly height:number;
}
export interface FittedSymbol {
  readonly scale:number; readonly offsetX:number; readonly offsetY:number;
  readonly bounds:Bounds2D;
  readonly frame:FrameRect;
  readonly padding:number;
}

function bbox(minX:number,minY:number,maxX:number,maxY:number):Bounds2D {
  if(![minX,minY,maxX,maxY].every(Number.isFinite) || maxX<minX || maxY<minY)
    throw new Error('QET: błędna lub niekompletna geometria symbolu');
  return {minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY,
    centerX:(minX+maxX)/2,centerY:(minY+maxY)/2};
}
function newAccumulator(){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  return {
    point(x:number,y:number){
      if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('QET: niefinitywna współrzędna');
      minX=Math.min(minX,x);minY=Math.min(minY,y);
      maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    },
    rect(x1:number,y1:number,x2:number,y2:number){
      this.point(x1,y1);this.point(x2,y2);
    },
    finish():Bounds2D{return bbox(minX,minY,maxX,maxY);}
  };
}

/** Konserwatywny obrys SVG path bez operacji graficznych.
 * Warianty A/a obejmuje bezpieczne ograniczenie łuku wokół obu końców.
 */
export function boundsOfPath(d:string):Bounds2D {
  const tokens=d.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)??[];
  if(!tokens.length)throw new Error('QET: pusta ścieżka SVG');
  const acc=newAccumulator();
  let i=0,cmd='',x=0,y=0,startX=0,startY=0;
  const isCommand=(v:string)=>/^[A-Za-z]$/.test(v);
  const num=()=>{const v=Number(tokens[i++]);if(!Number.isFinite(v))throw new Error('QET: nieważna ścieżka SVG');return v;};
  while(i<tokens.length){
    if(isCommand(tokens[i])){
      cmd=tokens[i++];
      if(cmd==='Z'||cmd==='z'){x=startX;y=startY;acc.point(x,y);cmd='';continue;}
    }
    if(!cmd || (cmd!=='M'&&cmd!=='m'&&cmd!=='L'&&cmd!=='l'&&cmd!=='A'&&cmd!=='a'))
      throw new Error('QET: nieobsługiwany rozkaz ścieżki SVG');
    if(i>=tokens.length || isCommand(tokens[i]))throw new Error('QET: brak argumentów ścieżki');
    if(cmd==='M'||cmd==='m'||cmd==='L'||cmd==='l'){
      const dx=num(),dy=num();
      x=cmd===cmd.toLowerCase()?x+dx:dx;
      y=cmd===cmd.toLowerCase()?y+dy:dy;
      if(cmd==='M'||cmd==='m'){startX=x;startY=y;cmd=cmd==='M'?'L':'l';}
      acc.point(x,y);
    }else{
      const rx=Math.abs(num()),ry=Math.abs(num());
      const rotation=num(),large=num(),sweep=num(),dx=num(),dy=num();
      if(![rotation,large,sweep].every(Number.isFinite))
        throw new Error('QET: nieprawidłowy łuk');
      const endX=cmd==='a'?x+dx:dx,endY=cmd==='a'?y+dy:dy;
      // Przy obrocie osi bierzemy największy promień w obu kierunkach:
      // konserwatywnie, bez ryzyka obcięcia części łuku.
      const radius=Math.max(rx,ry,0);
      acc.rect(x-radius,y-radius,x+radius,y+radius);
      acc.rect(endX-radius,endY-radius,endX+radius,endY+radius);
      x=endX;y=endY;
    }
  }
  return acc.finish();
}

export function boundsOfQetSymbol(symbol:QetPilotSymbol):Bounds2D {
  const acc=newAccumulator();
  for(const p of [...symbol.open,...symbol.closed]){
    switch(p.k){
      case 'line':
        acc.rect(p.x1,p.y1,p.x2,p.y2);break;
      case 'circle':
        acc.rect(p.cx-p.r,p.cy-p.r,p.cx+p.r,p.cy+p.r);break;
      case 'arc':
      case 'path':{
        const b=boundsOfPath(p.d);
        acc.rect(b.minX,b.minY,b.maxX,b.maxY);
        break;
      }
      case 'letter':{
        // Bezpieczne pole tekstu: pełna wysokość + szerokość 0,8 em na literę.
        const halfW=p.size*Math.max(1,p.t.length)*.45;
        acc.rect(p.x-halfW,p.y-p.size/2,p.x+halfW,p.y+p.size/2);
        break;
      }
      default:
        throw new Error('QET: nieobsługiwany prymityw w importowanym symbolu');
    }
  }
  for(const port of symbol.ports) {
    // Końce zacisków: obrys uwzględnia również ich oznaczenia kołowe.
    acc.rect(port.x-1.5,port.y-1.5,port.x+1.5,port.y+1.5);
  }
  return acc.finish();
}

export function fitQetSymbol(
  symbol:QetPilotSymbol,
  frame:FrameRect,
  padding:number,
):FittedSymbol {
  if(![frame.x,frame.y,frame.width,frame.height,padding].every(Number.isFinite) ||
    frame.width<=0||frame.height<=0||padding<=0||
    frame.width<=2*padding||frame.height<=2*padding)
    throw new Error('QET: nieprawidłowa ramka lub margines');
  const bounds=boundsOfQetSymbol(symbol);
  if(bounds.width<=0||bounds.height<=0)throw new Error('QET: symbol bez powierzchni');
  const scale=Math.min((frame.width-2*padding)/bounds.width,
    (frame.height-2*padding)/bounds.height);
  return {
    scale,
    offsetX:frame.x+frame.width/2-bounds.centerX*scale,
    offsetY:frame.y+frame.height/2-bounds.centerY*scale,
    frame,padding,bounds,
  };
}

/** Obrys całego symbolu na scenie, bez zmiany transformacji portów.
 * sourceMid: środek dwóch zacisków QET używany do wiązania z ENM.
 * Elementy poziome są obracane o 90° wokół punktu ENM.
 */
export function projectedQetFrame(
  symbol:QetPilotSymbol,
  target:{cx:number;cy:number;scale:number;horizontal:boolean},
  padding:number,
):FrameRect {
  const b=boundsOfQetSymbol(symbol);
  const [a,c]=symbol.ports;
  if(!a||!c||!Number.isFinite(target.scale)||target.scale<=0)
    throw new Error('QET: brak zacisków lub błędna skala');
  const mx=(a.x+c.x)/2,my=(a.y+c.y)/2;
  const corners=[
    {x:(b.minX-mx)*target.scale,y:(b.minY-my)*target.scale},
    {x:(b.maxX-mx)*target.scale,y:(b.minY-my)*target.scale},
    {x:(b.minX-mx)*target.scale,y:(b.maxY-my)*target.scale},
    {x:(b.maxX-mx)*target.scale,y:(b.maxY-my)*target.scale},
  ];
  const transformed=corners.map(p=>target.horizontal
    ? {x:target.cx-p.y,y:target.cy+p.x}
    : {x:target.cx+p.x,y:target.cy+p.y});
  const xs=transformed.map(p=>p.x),ys=transformed.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),
    minY=Math.min(...ys),maxY=Math.max(...ys);
  return {x:minX-padding,y:minY-padding,
    width:maxX-minX+2*padding,height:maxY-minY+2*padding};
}
