/**
 * Baza symboli SLD nN / SN — kanoniczny rejestr do odbioru właścicielskiego.
 *
 * Źródła dopuszczalne: istniejący CAD registry + oryginały .elmt QET.
 * Nie tworzyć pozornych „symboli IEC” dla pozycji bez autentycznych źródeł.
 * Złożenia (pole SN, RGnN, GPZ, ZK) to TOPOLOGIE, nie jeden znak łączeniowy.
 * Konwencja QET-SCADA ma dwa kolory WYŁĄCZNIE dla aparatów łączeniowych.
 */
import { ELECTRICAL_CAD_SYMBOL_REGISTRY, type CadSymbolId } from '../cadSymbolRegistry';
import { QET_PILOT_SYMBOLS } from './qetPilotSourceGeometry';

export type PoziomBiblioteki = 'nN'|'SN';
export type RodzinaKatalogowa = 'Łączeniowa'|'Zabezpieczenia'|'Pomiarowa'|
  'Źródła i przekształtniki'|'Sieć i tory'|'Stacje i pola'|'Odbiorniki';
export type StatusPozycji =
  | 'QET_ZRODLOWY'
  | 'CAD_ISTNIEJACY'
  | 'WYMAGA_ZRODLA'
  | 'ZLOZENIE_ENM';

export interface PozycjaBiblioteki {
  readonly id:string;
  readonly poziom:PoziomBiblioteki;
  readonly nazwa:string;
  readonly rodzina:RodzinaKatalogowa;
  readonly status:StatusPozycji;
  readonly cadId:CadSymbolId|null;
  readonly qetId:string|null;
  readonly czyLacznik:boolean;
  readonly rodzaj:'SYMBOL'|'ZLOZENIE';
  readonly uwagi:string;
}

const QET_BY_CAD: Readonly<Partial<Record<CadSymbolId,string>>> = {
  'cad.wylacznik':'breaker',
  'cad.wylacznikInstalacyjny':'mcb',
  'cad.wylacznikRoznicowopradowy':'rccb',
  'cad.odlacznik':'disconnector',
  'cad.bezpiecznik':'fuse',
  'cad.rozlacznikBezpiecznikowy':'fuseSwitch',
};

const NN: readonly CadSymbolId[] = [
  'cad.wylacznik','cad.wylacznikInstalacyjny','cad.wylacznikRoznicowopradowy',
  'cad.odlacznik','cad.rozlacznik','cad.lacznik','cad.uziemnik',
  'cad.bezpiecznik','cad.rozlacznikBezpiecznikowy',
  'cad.transformator2u','cad.przekladnikPradowy','cad.przekladnikNapieciowy',
  'cad.przeksztaltnik','cad.zrodloPvZPrzeksztaltnikiem',
  'cad.magazynZPrzeksztaltnikiem','cad.generator','cad.odplywOdbior',
  'cad.zacisk','cad.wezel','cad.zabezpieczenie',
];

const SN: readonly CadSymbolId[] = [
  'cad.wylacznik','cad.odlacznik','cad.rozlacznik','cad.lacznik',
  'cad.uziemnik','cad.bezpiecznik','cad.rozlacznikBezpiecznikowy',
  'cad.transformator2u','cad.przekladnikPradowy','cad.przekladnikNapieciowy',
  'cad.przeksztaltnik','cad.zrodloPvZPrzeksztaltnikiem',
  'cad.magazynZPrzeksztaltnikiem','cad.generator','cad.zacisk',
  'cad.wezel','cad.zabezpieczenie',
];

const RODZINA: Readonly<Partial<Record<CadSymbolId,RodzinaKatalogowa>>> = {
  'cad.wylacznik':'Łączeniowa',
  'cad.wylacznikInstalacyjny':'Łączeniowa',
  'cad.wylacznikRoznicowopradowy':'Zabezpieczenia',
  'cad.odlacznik':'Łączeniowa',
  'cad.rozlacznik':'Łączeniowa',
  'cad.lacznik':'Łączeniowa',
  'cad.uziemnik':'Łączeniowa',
  'cad.bezpiecznik':'Zabezpieczenia',
  'cad.rozlacznikBezpiecznikowy':'Łączeniowa',
  'cad.transformator2u':'Źródła i przekształtniki',
  'cad.przekladnikPradowy':'Pomiarowa',
  'cad.przekladnikNapieciowy':'Pomiarowa',
  'cad.przeksztaltnik':'Źródła i przekształtniki',
  'cad.zrodloPvZPrzeksztaltnikiem':'Źródła i przekształtniki',
  'cad.magazynZPrzeksztaltnikiem':'Źródła i przekształtniki',
  'cad.generator':'Źródła i przekształtniki',
  'cad.odplywOdbior':'Odbiorniki',
  'cad.zacisk':'Sieć i tory',
  'cad.wezel':'Sieć i tory',
  'cad.zabezpieczenie':'Zabezpieczenia',
};

function zRejestru(poziom:PoziomBiblioteki,id:CadSymbolId,i:number):PozycjaBiblioteki {
  const def=ELECTRICAL_CAD_SYMBOL_REGISTRY[id];
  const qetId=QET_BY_CAD[id]??null;
  return {
    id:`${poziom}-${String(i+1).padStart(2,'0')}`,
    poziom,
    nazwa:def.polishName,
    rodzina:RODZINA[id]??'Sieć i tory',
    status:qetId?'QET_ZRODLOWY':'CAD_ISTNIEJACY',
    cadId:id,
    qetId,
    czyLacznik:!!def.states,
    rodzaj:'SYMBOL',
    uwagi:qetId
      ? 'Oryginał QET (stan otwarty); położenie zamknięte DRAFT do weryfikacji'
      : `Istniejąca geometria CAD z repo (status: ${def.verificationStatus}) — nie oznacza potwierdzonej normy IEC`,
  };
}

interface SpecMissing {
  readonly poziom:PoziomBiblioteki;
  readonly nazwa:string;
  readonly rodzina:RodzinaKatalogowa;
  readonly rodzaj?:'ZLOZENIE';
}

/** Zakres docelowy biblioteki. Brak źródła = BLokada renderingu,
 * nie „jakiś podobny symbol”, który mógłby wprowadzić błąd projektu.
 */
const WYMAGANE: readonly SpecMissing[] = [
  {poziom:'nN',nazwa:'Wyłącznik różnicowonadprądowy RCBO',rodzina:'Zabezpieczenia'},
  {poziom:'nN',nazwa:'Wyłącznik mocy ACB / MCCB — wyzwalacze',rodzina:'Łączeniowa'},
  {poziom:'nN',nazwa:'Stycznik 3P i cewka',rodzina:'Łączeniowa'},
  {poziom:'nN',nazwa:'Przekaźnik i zestyk pomocniczy',rodzina:'Łączeniowa'},
  {poziom:'nN',nazwa:'Ogranicznik przepięć SPD T1 / T2',rodzina:'Zabezpieczenia'},
  {poziom:'nN',nazwa:'Listwowy rozłącznik bezpiecznikowy NH',rodzina:'Łączeniowa'},
  {poziom:'nN',nazwa:'Licznik energii czynnej i biernej',rodzina:'Pomiarowa'},
  {poziom:'nN',nazwa:'Przekładnik Ferrantiego',rodzina:'Pomiarowa'},
  {poziom:'nN',nazwa:'Przekładnik prądowy trójrdzeniowy',rodzina:'Pomiarowa'},
  {poziom:'nN',nazwa:'Układ trójfazowy 3P/4P z niezależnymi torami',rodzina:'Łączeniowa'},
  {poziom:'nN',nazwa:'PEN / PE / N — zaciski ochronne',rodzina:'Sieć i tory'},
  {poziom:'nN',nazwa:'Silnik asynchroniczny',rodzina:'Odbiorniki'},
  {poziom:'nN',nazwa:'Łącznik instalacyjny',rodzina:'Łączeniowa'},
  {poziom:'nN',nazwa:'Złącze kablowe nN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'nN',nazwa:'RGnN do 630 kVA — ENEA',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'nN',nazwa:'RGnN do 400 kVA — ENEA',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'nN',nazwa:'Szafa kablowa z układem pomiarowym',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'nN',nazwa:'Rozdzielnica przemysłowa 0,4 kV',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole liniowe SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole transformatorowe SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole pomiarowe SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole sekcyjne i sprzęgło szyn SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole odpływowe i odgałęźne SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole OZE / PV SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole BESS SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Pole baterii kondensatorów SN',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Stacja SN/nN przelotowa',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Stacja SN/nN końcowa',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Stacja SN/nN słupowa',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Złącze kablowe SN (ZKSN)',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Linia napowietrzna SN',rodzina:'Sieć i tory'},
  {poziom:'SN',nazwa:'Kabel SN — żyły / powłoka / uziemienie',rodzina:'Sieć i tory'},
  {poziom:'SN',nazwa:'Ogranicznik przepięć SN',rodzina:'Zabezpieczenia'},
  {poziom:'SN',nazwa:'Łącznik trójpołożeniowy z uziemnikiem',rodzina:'Łączeniowa'},
  {poziom:'SN',nazwa:'Pole z rozłącznikiem próżniowym i EAZ',rodzina:'Stacje i pola',rodzaj:'ZLOZENIE'},
  {poziom:'SN',nazwa:'Zespół pomiarowy CT/VT 3-fazowy',rodzina:'Pomiarowa',rodzaj:'ZLOZENIE'},
];

const records:PozycjaBiblioteki[]=[
  ...NN.map((id,i)=>zRejestru('nN',id,i)),
  ...SN.map((id,i)=>zRejestru('SN',id,i)),
];
const qetRcbo=QET_PILOT_SYMBOLS.find(x=>x.id==='rcbo');
if(qetRcbo)records.push({
  id:'nN-QET-RCBO',poziom:'nN',nazwa:'RCBO — oryginał QElectroTech',
  rodzina:'Zabezpieczenia',status:'QET_ZRODLOWY',
  cadId:null,qetId:qetRcbo.id,czyLacznik:true,rodzaj:'SYMBOL',
  uwagi:'Oryginalne .elmt; stan zamknięty DRAFT; brak połączenia klasy RCBO z ENM',
});
const next:Record<PoziomBiblioteki,number>={nN:NN.length+1,SN:SN.length+1};
for(const w of WYMAGANE){
  // RCBO: źródłowy glif istnieje (powyżej), nie duplicuj fałszywego braku.
  if(w.nazwa.startsWith('Wyłącznik różnicowonadprądowy'))continue;
  records.push({
    id:`${w.poziom}-${String(next[w.poziom]++).padStart(2,'0')}`,
    poziom:w.poziom,nazwa:w.nazwa,rodzina:w.rodzina,
    status:w.rodzaj==='ZLOZENIE'?'ZLOZENIE_ENM':'WYMAGA_ZRODLA',
    cadId:null,qetId:null,
    czyLacznik:false,rodzaj:w.rodzaj??'SYMBOL',
    uwagi:w.rodzaj==='ZLOZENIE'
      ? 'Złożenie wymaga zgodnej topologii ENM, właściwych pól i symboli — nie renderować jako pojedynczej ikony'
      : 'Brak zweryfikowanej geometrii źródłowej — nie wolno zastępować innym symbolem',
  });
}
export const BAZA_SYMBOLI_SLD:readonly PozycjaBiblioteki[]=records;

export function pozycjeDoAkceptacji(poziom:PoziomBiblioteki):readonly PozycjaBiblioteki[] {
  return BAZA_SYMBOLI_SLD.filter(p=>p.poziom===poziom);
}

export function pokrycieBiblioteki(poziom:PoziomBiblioteki){
  const items=pozycjeDoAkceptacji(poziom);
  return {
    razem:items.length,
    geometriaIstnieje:items.filter(p=>p.status==='QET_ZRODLOWY'||p.status==='CAD_ISTNIEJACY').length,
    brakZrodla:items.filter(p=>p.status==='WYMAGA_ZRODLA').length,
    zlozenia:items.filter(p=>p.status==='ZLOZENIE_ENM').length,
  };
}
