/**
 * BRAMKA B-02: adapter *nieaktywny produkcyjnie* między definicją graficzną QET
 * a wiążącą klasyfikacją ENM. Zasada: źródłowy QET nie opisuje faz, potencjałów,
 * funkcji łączeniowej ani rzeczywistego wariantu IEC — nie zgadujemy.
 *
 * Funkcje tego modułu świadomie ODRZUCAJĄ import bez podpisanej decyzji
 * właściciela, przeglądu normatywnego i pełnego mapowania wszystkich portów.
 * Nie zmieniają kanonicznego cadSymbolRegistry.ts ani SldCanvasV3.
 */
import type { CadPrimitive } from '../cadSymbolRegistry';

export type PrzewodNn = 'L1'|'L2'|'L3'|'N'|'PE'|'PEN'|'PLUS'|'MINUS';
export type FunkcjaPortu = 'tor_mocy'|'tor_pomiarowy'|'sterowanie'|'ochronny';

export interface QetCandidatePort {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly dir: 'N'|'S'|'E'|'W';
  readonly phase: null;
  readonly potential: null;
  readonly function: null;
  readonly reviewRequired: true;
}
export interface QetCandidateDef {
  readonly id: string;
  readonly geometry: {
    readonly width: number;
    readonly height: number;
    readonly primitives: readonly CadPrimitive[];
  };
  readonly ports: readonly QetCandidatePort[];
  readonly verificationStatus: 'DRAFT';
  readonly approval: 'OWNER_REQUIRED';
  readonly modelBinding: null;
  readonly switchState: 'NOT_MODELLED';
}

export interface ZatwierdzonePowiazaniePortu {
  readonly qetPort: string;
  readonly terminalEnm: string;
  readonly conductor: PrzewodNn;
  readonly funkcja: FunkcjaPortu;
  readonly potentialRef: string;
}
export interface BiegunEnm {
  readonly conductor: 'L1'|'L2'|'L3'|'N';
  readonly wejscieTerminalRef: string;
  readonly wyjscieTerminalRef: string;
  readonly stan: 'ZAMKNIETY'|'OTWARTY'|'NIEZNANY'|'NIE_DOTYCZY';
}
/** Grafika jednokreskowa ma prawo mieć dwa porty, jednakże urządzenie 3P/4P
 * musi mieć kompletny, niezależny kontrakt dla wszystkich biegunów ENM. */
export interface DecyzjaWlaczeniaSymbolu {
  readonly sourceId: string;
  readonly decyzjaWlascicielaId: string;
  readonly dowodIec60617Id: string;
  readonly klasaFunkcjonalna: string;
  readonly deviceKind: string;
  readonly liczbaBiegunow: 1|2|3|4;
  readonly stanAparatuZEnm: 'ZAMKNIETY'|'OTWARTY'|'NIEZNANY'|'NIE_DOTYCZY';
  readonly porty: readonly ZatwierdzonePowiazaniePortu[];
  readonly biegunyEnm: readonly BiegunEnm[];
}
export interface KwalifikowanySymbolNn {
  readonly id: string;
  readonly geometry: QetCandidateDef['geometry'];
  readonly deviceKind: string;
  readonly poles: 1|2|3|4;
  readonly ports: readonly ZatwierdzonePowiazaniePortu[];
  readonly polesEnm: readonly BiegunEnm[];
  readonly ownerDecision: string;
  readonly normativeEvidence: string;
  readonly state: DecyzjaWlaczeniaSymbolu['stanAparatuZEnm'];
}

/** Dopuszczenie musi być JAWNĄ decyzją i nie wynika z nazwy pliku.
 * Aktualne pliki QET DRAFT wywołają błąd. To pożądane zachowanie.
 */
export function kontrolaDopuszczeniaKandydata(
  kandydat: QetCandidateDef,
  decyzja: DecyzjaWlaczeniaSymbolu,
  metadaneZewn: {readonly zatwierdzenieNormatywne: boolean;readonly statusBiblioteki: 'DRAFT'|'ZATWIERDZONE'}
): KwalifikowanySymbolNn {
  if(kandydat.verificationStatus!=='DRAFT'||kandydat.modelBinding!==null) {
    throw new Error('Nieznany kontrakt źródła QET.');
  }
  if(!metadaneZewn.zatwierdzenieNormatywne||metadaneZewn.statusBiblioteki!=='ZATWIERDZONE') {
    throw new Error('B-02: niedozwolone użycie bez przeglądu normatywnego.');
  }
  if(!decyzja.decyzjaWlascicielaId.trim()||!decyzja.dowodIec60617Id.trim()) {
    throw new Error('B-02: brak decyzji właściciela lub dowodu IEC.');
  }
  if(kandydat.id!==decyzja.sourceId||!decyzja.deviceKind.trim()||!decyzja.klasaFunkcjonalna.trim()){
    throw new Error('B-02: niezgodność identyfikacji i klasy urządzenia.');
  }
  if(kandydat.switchState!=='NOT_MODELLED') {
    throw new Error('Importer nie może deklarować stanów aparatów.');
  }
  if(!Number.isInteger(decyzja.liczbaBiegunow)||
     decyzja.liczbaBiegunow<1||decyzja.liczbaBiegunow>4){
    throw new Error('Niedopuszczalna biegunowość.');
  }
  if(kandydat.ports.length!==decyzja.porty.length){
    throw new Error('B-02: nie wszystkie porty mają powiązania ENM.');
  }
  const istnieja=new Set(kandydat.ports.map(p=>p.name));
  const uzyte=new Set<string>();
  const enm=new Set<string>();
  for(const port of decyzja.porty){
    if(!istnieja.has(port.qetPort)||uzyte.has(port.qetPort)||
       !port.terminalEnm.trim()||enm.has(port.terminalEnm)||
       !port.potentialRef.trim()){
      throw new Error('B-02: port niejednoznaczny lub zdublowany.');
    }
    uzyte.add(port.qetPort);
    enm.add(port.terminalEnm);
  }
  // Odrębny kontrakt topologii ENM, niezależny od dwóch portów grafiki SLD.
  // BEZWZGLĘDNIE nie tworzyć 3P z jednego przewodu ani nie przełączać PEN/PE.
  if(decyzja.biegunyEnm.length!==decyzja.liczbaBiegunow) {
    throw new Error('B-02: niekompletna topologia biegunów 1P/2P/3P/4P.');
  }
  const bieguny=new Set<string>();
  const terminaleBiegunow=new Set<string>();
  for(const b of decyzja.biegunyEnm){
    if(bieguny.has(b.conductor)||!b.wejscieTerminalRef.trim()||
       !b.wyjscieTerminalRef.trim()||b.wejscieTerminalRef===b.wyjscieTerminalRef||
       terminaleBiegunow.has(b.wejscieTerminalRef)||
       terminaleBiegunow.has(b.wyjscieTerminalRef)){
      throw new Error('B-02: zdublowany/niepoprawny biegun urządzenia.');
    }
    bieguny.add(b.conductor);
    terminaleBiegunow.add(b.wejscieTerminalRef);
    terminaleBiegunow.add(b.wyjscieTerminalRef);
  }
  if(decyzja.liczbaBiegunow>=3 &&
     !(['L1','L2','L3'] as const).every(f=>bieguny.has(f))) {
    throw new Error('B-02: urządzenie 3P/4P bez kompletu L1/L2/L3.');
  }
  if(decyzja.liczbaBiegunow===4&&!bieguny.has('N')) {
    throw new Error('B-02: weryfikowana funkcja 4P bez N.');
  }
  return {
    id:kandydat.id,
    geometry:kandydat.geometry,
    deviceKind:decyzja.deviceKind,
    poles:decyzja.liczbaBiegunow,
    ports:decyzja.porty,
    polesEnm:decyzja.biegunyEnm,
    ownerDecision:decyzja.decyzjaWlascicielaId,
    normativeEvidence:decyzja.dowodIec60617Id,
    state:decyzja.stanAparatuZEnm,
  };
}
