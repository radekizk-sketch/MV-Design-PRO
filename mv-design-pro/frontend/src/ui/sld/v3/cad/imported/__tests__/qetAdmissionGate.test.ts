import { describe, expect, it } from 'vitest';
import {
  kontrolaDopuszczeniaKandydata,
  type QetCandidateDef,
  type DecyzjaWlaczeniaSymbolu,
  type BiegunEnm,
} from '../qetAdmissionGate';

const QET: QetCandidateDef = {
  id: 'nn.qet.odlacznik1p',
  geometry: { width: 20, height: 60,
    primitives: [{ k: 'line', x1: 10, y1: 0, x2: 10, y2: 15 }] },
  ports: [
    { name: 'qet_1', x: 10, y: 9, dir: 'N',
      phase: null, potential: null, function: null, reviewRequired: true },
    { name: 'qet_2', x: 10, y: 51, dir: 'S',
      phase: null, potential: null, function: null, reviewRequired: true },
  ],
  verificationStatus: 'DRAFT', approval: 'OWNER_REQUIRED',
  modelBinding: null, switchState: 'NOT_MODELLED',
};
const BIEGUN: BiegunEnm = {
  conductor: 'L1', wejscieTerminalRef: 'L1_IN',
  wyjscieTerminalRef: 'L1_OUT', stan: 'OTWARTY',
};
const D: DecyzjaWlaczeniaSymbolu = {
  sourceId: QET.id,
  decyzjaWlascicielaId: 'OWNER-DECISION-EVIDENCE-001',
  dowodIec60617Id: 'IEC-PROOF-MANUAL-001',
  klasaFunkcjonalna: 'odlacznik',
  deviceKind: 'ODLACZNIK',
  liczbaBiegunow: 1,
  stanAparatuZEnm: 'OTWARTY',
  porty: [
    {qetPort:'qet_1',terminalEnm:'vis_in',conductor:'L1',
     funkcja:'tor_mocy',potentialRef:'potential-A'},
    {qetPort:'qet_2',terminalEnm:'vis_out',conductor:'L1',
     funkcja:'tor_mocy',potentialRef:'potential-B'},
  ],
  biegunyEnm:[BIEGUN],
};
const APPROVAL = { zatwierdzenieNormatywne: true, statusBiblioteki:'ZATWIERDZONE' as const };
const REJECT = { zatwierdzenieNormatywne: false, statusBiblioteki:'DRAFT' as const };

describe('B-02 — bramka QET do ENM',()=>{
  it('odrzuca każdy QET bez zatwierdzenia właściciela i IEC',()=>{
    expect(()=>kontrolaDopuszczeniaKandydata(QET,D,REJECT)).toThrow('B-02');
  });
  it('odrzuca fałszywe przypisanie 3P gdy istnieje tylko jeden biegun ENM',()=>{
    expect(()=>kontrolaDopuszczeniaKandydata(QET,
      {...D,liczbaBiegunow:3},APPROVAL)).toThrow('niekompletna');
  });
  it('odrzuca aparaty 3P, jeśli bieguny nie obejmują L1/L2/L3',()=>{
    const bad:BiegunEnm[]=[
      BIEGUN,{...BIEGUN,conductor:'L2',wejscieTerminalRef:'L2_IN',wyjscieTerminalRef:'L2_OUT'},
      {...BIEGUN,conductor:'N',wejscieTerminalRef:'N_IN',wyjscieTerminalRef:'N_OUT'},
    ];
    expect(()=>kontrolaDopuszczeniaKandydata(QET,
      {...D,liczbaBiegunow:3,biegunyEnm:bad},APPROVAL)).toThrow('L1/L2/L3');
  });
  it('odrzuca aparat 4P bez N',()=>{
    const bad:BiegunEnm[]=[
      BIEGUN,{...BIEGUN,conductor:'L2',wejscieTerminalRef:'L2_IN',wyjscieTerminalRef:'L2_OUT'},
      {...BIEGUN,conductor:'L3',wejscieTerminalRef:'L3_IN',wyjscieTerminalRef:'L3_OUT'},
      {...BIEGUN,conductor:'L1',wejscieTerminalRef:'X_IN',wyjscieTerminalRef:'X_OUT'},
    ];
    expect(()=>kontrolaDopuszczeniaKandydata(QET,
      {...D,liczbaBiegunow:4,biegunyEnm:bad},APPROVAL)).toThrow();
  });
  it('odrzuca niekompletną mapę zacisków grafiki i podwójne zaciski ENM',()=>{
    expect(()=>kontrolaDopuszczeniaKandydata(QET,
      {...D,porty:D.porty.slice(0,1)},APPROVAL)).toThrow('nie wszystkie');
    const wrong={...D,porty:[D.porty[0],{...D.porty[1],terminalEnm:'vis_in'}]};
    expect(()=>kontrolaDopuszczeniaKandydata(QET,wrong,APPROVAL)).toThrow('zdublowany');
  });
  it('przepuszcza jawny jednobiegunowy model z kompletem dowodów, nie zmieniając źródła',()=>{
    const out=kontrolaDopuszczeniaKandydata(QET,D,APPROVAL);
    expect(out.geometry).toBe(QET.geometry);
    expect(out.ownerDecision).toBe(D.decyzjaWlascicielaId);
    expect(out.state).toBe('OTWARTY');
    expect(out.polesEnm).toEqual([BIEGUN]);
    expect(QET.modelBinding).toBeNull();
  });
});
