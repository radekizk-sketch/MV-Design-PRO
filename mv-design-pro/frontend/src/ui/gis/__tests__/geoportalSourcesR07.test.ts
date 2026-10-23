import { describe,expect,it } from 'vitest';
import { ZRODLA_PODKLADOW,opisWms,przygotujRasterWms,ustawPodklad } from '../geoportalSourcesR07';

const dozwolone = {
  idZrodla:'kiut',nazwaWarstwy:'test:uzbrojenie',wersja:'1.3.0' as const,
  przezroczystosc:0.75,zgodaNaWyslanieZasiegu:true,
  potwierdzenieWarunkowUzycia:true,zweryfikowanaNazwaWarstwy:true,
};
describe('GIS R07: katalog warstw zewnętrznych bez wpływu na ENM', () => {
  it('nie wyprowadza topologii elektrycznej', () => {
    for(const source of ZRODLA_PODKLADOW) {
      expect(source.dowodPolaczeniaElektrycznego).toBe(false);
      expect(source.wektoroweDaneZrodlowe).toBe(false);
    }
  });
  it('wymaga zgody na zewnętrzne wysłanie zasięgu', () =>
    expect(()=>przygotujRasterWms({...dozwolone,zgodaNaWyslanieZasiegu:false})).toThrow('BRAK_ZGODY'));
  it('wymaga sprawdzonych warunków użycia', () =>
    expect(()=>przygotujRasterWms({...dozwolone,potwierdzenieWarunkowUzycia:false})).toThrow('NIEZWERYFIKOWANE'));
  it('wymaga nazwy warstwy ustalonej z GetCapabilities', () =>
    expect(()=>przygotujRasterWms({...dozwolone,zweryfikowanaNazwaWarstwy:false})).toThrow('BRAK_POTWIERDZONEJ'));
  it('nie dopuszcza przekazania dodatkowego parametru w LAYERS', () =>
    expect(()=>przygotujRasterWms({...dozwolone,nazwaWarstwy:'x&REQUEST=DELETE'})).toThrow('BRAK_POTWIERDZONEJ'));
  it('wymusza EPSG:3857 / WMS 1.3.0', () => {
    const plan=przygotujRasterWms(dozwolone);
    expect(plan.tiles[0]).toContain('CRS=EPSG%3A3857');
    expect(plan.tiles[0]).toContain('BBOX={bbox-epsg-3857}');
    expect(plan.zapisEnmDozwolony).toBe(false);
  });
  it('dla WMS 1.1.1 stosuje SRS zamiast CRS', () => {
    const plan=przygotujRasterWms({...dozwolone,wersja:'1.1.1'});
    expect(plan.tiles[0]).toContain('SRS=EPSG%3A3857');
  });
  it('odrzuca nieznaną usługę', () =>
    expect(()=>przygotujRasterWms({...dozwolone,idZrodla:'https://localhost:3000/private'})).toThrow('NIEZNANE'));
  it('wymaga prawidłowej przezroczystości', () =>
    expect(()=>przygotujRasterWms({...dozwolone,przezroczystosc:1.1})).toThrow('ZLA_PRZEZROCZYSTOSC'));
  it('opis usługi pozostaje na oficjalnym adresie', () =>
    expect(opisWms('kiut')).toContain('REQUEST=GetCapabilities'));
  it('zastosowanie nie tworzy duplikatów warstw', () => {
    const sources=new Map<string,unknown>(),layers=new Map<string,unknown>(),states:string[]=[];
    const map={
      getSource:(id:string)=>sources.get(id),
      addSource:(id:string,value:unknown)=>{sources.set(id,value);},
      getLayer:(id:string)=>layers.get(id),
      addLayer:(value:{id:string})=>{layers.set(value.id,value);},
      setLayoutProperty:(_id:string,_key:'visibility',value:'visible'|'none')=>states.push(value),
    };
    const plan=przygotujRasterWms(dozwolone);
    ustawPodklad(map,plan,true,'before-lines');
    ustawPodklad(map,plan,false);
    expect(layers.size).toBe(1);
    expect(states).toEqual(['visible','none']);
  });
});
