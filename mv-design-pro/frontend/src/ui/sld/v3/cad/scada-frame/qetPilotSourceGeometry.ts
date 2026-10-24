/**
 * ŹRÓDŁOWA geometria siedmiu glifów zaakceptowanych wizualnie (PR #499).
 * Dane przepisano deterministycznie z oryginalnych plików .elmt QElectroTech.
 * QElectroTech team / CC BY 3.0; nie używać jako zbioru uczącego ML.
 * 
 * Przyjęta geometria OTWARTEGO: zgodna z oryginalnym .elmt.
 * Geometria ZAMKNIĘTEGO: autorski wariant KONCEPCYJNY do sprawdzenia.
 * Status IEC 60617: NIEZWERYFIKOWANE; żadnego automatycznego dopuszczenia.
 */
import type { CadPrimitive } from '../cadSymbolRegistry';

export interface QetPilotSymbol {
  readonly id: string;
  readonly namePl: string;
  readonly rodzaj: 'LACZNIK'|'BEZPIECZNIK';
  readonly width: number;
  readonly height: number;
  readonly sourcePath: string;
  readonly sourceBlobSha: string;
  readonly ports: readonly {readonly x:number;readonly y:number;readonly orientation:string}[];
  readonly open: readonly CadPrimitive[];
  readonly closed: readonly CadPrimitive[];
  readonly closedVerificationStatus: 'DRAFT';
}

export const QET_PILOT_SYMBOLS: readonly QetPilotSymbol[] = [
  {
    "id": "breaker",
    "namePl": "Wyłącznik",
    "rodzaj": "LACZNIK",
    "width": 20,
    "height": 60,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/11_circuit_breakers/disjoncteur1.elmt",
    "sourceBlobSha": "b87b9d06018c4db93db69895136f9d8636a7b491",
    "ports": [
      {
        "x": 9,
        "y": 10,
        "orientation": "n"
      },
      {
        "x": 9,
        "y": 50,
        "orientation": "s"
      }
    ],
    "open": [
      {
        "k": "path",
        "d": "M 9 50 L 9 40 L 4 20",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 10,
        "x2": 9,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 22,
        "x2": 7,
        "y2": 18
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 18,
        "x2": 7,
        "y2": 22
      },
      {
        "k": "letter",
        "x": 11,
        "y": 16,
        "t": "1",
        "size": 4
      },
      {
        "k": "letter",
        "x": 12,
        "y": 48,
        "t": "2",
        "size": 4
      }
    ],
    "closed": [
      {
        "k": "path",
        "d": "M 9 50 L 9 40 L 9 20",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 10,
        "x2": 9,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 22,
        "x2": 7,
        "y2": 18
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 18,
        "x2": 7,
        "y2": 22
      },
      {
        "k": "letter",
        "x": 11,
        "y": 16,
        "t": "1",
        "size": 4
      },
      {
        "k": "letter",
        "x": 12,
        "y": 48,
        "t": "2",
        "size": 4
      }
    ],
    "closedVerificationStatus": "DRAFT"
  },
  {
    "id": "mcb",
    "namePl": "Wyłącznik instalacyjny",
    "rodzaj": "LACZNIK",
    "width": 20,
    "height": 70,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/11_circuit_breakers/jistic_1p.elmt",
    "sourceBlobSha": "a11d48197946c56de7fb43f06ff87ae075a56117",
    "ports": [
      {
        "x": 11,
        "y": 13,
        "orientation": "n"
      },
      {
        "x": 11,
        "y": 63,
        "orientation": "s"
      }
    ],
    "open": [
      {
        "k": "line",
        "x1": 11,
        "y1": 59,
        "x2": 11,
        "y2": 63
      },
      {
        "k": "path",
        "d": "M 11 46 L 11 43 L 6 23",
        "fill": "none"
      },
      {
        "k": "arc",
        "d": "M 11 58.5 A 4 2.5 0 0 0 11 53.5"
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 51,
        "x2": 11,
        "y2": 53
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 51,
        "x2": 16,
        "y2": 51
      },
      {
        "k": "line",
        "x1": 16,
        "y1": 46,
        "x2": 16,
        "y2": 51
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 46,
        "x2": 16,
        "y2": 46
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 13,
        "x2": 11,
        "y2": 23
      },
      {
        "k": "line",
        "x1": 13,
        "y1": 21,
        "x2": 9,
        "y2": 25
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 21,
        "x2": 13,
        "y2": 25
      }
    ],
    "closed": [
      {
        "k": "line",
        "x1": 11,
        "y1": 59,
        "x2": 11,
        "y2": 63
      },
      {
        "k": "path",
        "d": "M 11 46 L 11 43 L 11 23",
        "fill": "none"
      },
      {
        "k": "arc",
        "d": "M 11 58.5 A 4 2.5 0 0 0 11 53.5"
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 51,
        "x2": 11,
        "y2": 53
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 51,
        "x2": 16,
        "y2": 51
      },
      {
        "k": "line",
        "x1": 16,
        "y1": 46,
        "x2": 16,
        "y2": 51
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 46,
        "x2": 16,
        "y2": 46
      },
      {
        "k": "line",
        "x1": 11,
        "y1": 13,
        "x2": 11,
        "y2": 23
      },
      {
        "k": "line",
        "x1": 13,
        "y1": 21,
        "x2": 9,
        "y2": 25
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 21,
        "x2": 13,
        "y2": 25
      }
    ],
    "closedVerificationStatus": "DRAFT"
  },
  {
    "id": "fuse",
    "namePl": "Bezpiecznik topikowy",
    "rodzaj": "BEZPIECZNIK",
    "width": 20,
    "height": 60,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/10_fuses/fusible.elmt",
    "sourceBlobSha": "ed1f7e6014b94c9e894b3a3ac44a33ef3588c2ae",
    "ports": [
      {
        "x": 10,
        "y": 9,
        "orientation": "n"
      },
      {
        "x": 10,
        "y": 51,
        "orientation": "s"
      }
    ],
    "open": [
      {
        "k": "line",
        "x1": 10,
        "y1": 10,
        "x2": 10,
        "y2": 50
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 40,
        "x2": 12,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 8,
        "y1": 40,
        "x2": 12,
        "y2": 40
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 20,
        "x2": 8,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 8,
        "y1": 20,
        "x2": 8,
        "y2": 40
      }
    ],
    "closed": [
      {
        "k": "line",
        "x1": 10,
        "y1": 10,
        "x2": 10,
        "y2": 50
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 40,
        "x2": 12,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 8,
        "y1": 40,
        "x2": 12,
        "y2": 40
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 20,
        "x2": 8,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 8,
        "y1": 20,
        "x2": 8,
        "y2": 40
      }
    ],
    "closedVerificationStatus": "DRAFT"
  },
  {
    "id": "fuseSwitch",
    "namePl": "Rozłącznik bezpiecznikowy",
    "rodzaj": "LACZNIK",
    "width": 20,
    "height": 60,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/10_fuses/sec_fus1.elmt",
    "sourceBlobSha": "91ab0502185118adc0408486ab2e61da703d68fc",
    "ports": [
      {
        "x": 10,
        "y": 9,
        "orientation": "n"
      },
      {
        "x": 10,
        "y": 51,
        "orientation": "s"
      }
    ],
    "open": [
      {
        "k": "path",
        "d": "M 5 20 L 10 40 L 10 50",
        "fill": "none"
      },
      {
        "k": "path",
        "d": "M 4.31 25.49 L 6.81 35.49 L 10.69 34.51 L 8.19 24.51 Z",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 10,
        "y1": 10,
        "x2": 10,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 20,
        "x2": 8,
        "y2": 20
      }
    ],
    "closed": [
      {
        "k": "path",
        "d": "M 10 20 L 10 40 L 10 50",
        "fill": "none"
      },
      {
        "k": "path",
        "d": "M 8 25 L 8 35 L 12 35 L 12 25 Z",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 10,
        "y1": 10,
        "x2": 10,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 20,
        "x2": 8,
        "y2": 20
      }
    ],
    "closedVerificationStatus": "DRAFT"
  },
  {
    "id": "disconnector",
    "namePl": "Odłącznik",
    "rodzaj": "LACZNIK",
    "width": 20,
    "height": 60,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/20_disconnecting_switches/sectionneur1.elmt",
    "sourceBlobSha": "b170c7d3ba5ff2057cc10cd926127c2be0b0a446",
    "ports": [
      {
        "x": 10,
        "y": 9,
        "orientation": "n"
      },
      {
        "x": 10,
        "y": 51,
        "orientation": "s"
      }
    ],
    "open": [
      {
        "k": "path",
        "d": "M 5 20 L 10 40 L 10 50",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 10,
        "y1": 10,
        "x2": 10,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 20,
        "x2": 8,
        "y2": 20
      }
    ],
    "closed": [
      {
        "k": "path",
        "d": "M 10 20 L 10 40 L 10 50",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 10,
        "y1": 10,
        "x2": 10,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 12,
        "y1": 20,
        "x2": 8,
        "y2": 20
      }
    ],
    "closedVerificationStatus": "DRAFT"
  },
  {
    "id": "rccb",
    "namePl": "Wyłącznik RCD",
    "rodzaj": "LACZNIK",
    "width": 30,
    "height": 60,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/50_residual_current_circuit_breaker/rccb.elmt",
    "sourceBlobSha": "f6655135b7b7c0b900b06f4b6c202ed0d1e1bfe1",
    "ports": [
      {
        "x": 22,
        "y": 50,
        "orientation": "s"
      },
      {
        "x": 22,
        "y": 10,
        "orientation": "n"
      }
    ],
    "open": [
      {
        "k": "path",
        "d": "M 20 22 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 24,
        "y1": 20,
        "x2": 20,
        "y2": 20
      },
      {
        "k": "path",
        "d": "M 17 20 L 22 40 L 22 50",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 22,
        "y1": 10,
        "x2": 22,
        "y2": 20
      },
      {
        "k": "letter",
        "x": 8,
        "y": 33,
        "t": "IΔ",
        "size": 6
      }
    ],
    "closed": [
      {
        "k": "path",
        "d": "M 20 22 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 24,
        "y1": 20,
        "x2": 20,
        "y2": 20
      },
      {
        "k": "path",
        "d": "M 22 20 L 22 40 L 22 50",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 22,
        "y1": 10,
        "x2": 22,
        "y2": 20
      },
      {
        "k": "letter",
        "x": 8,
        "y": 33,
        "t": "IΔ",
        "size": 6
      }
    ],
    "closedVerificationStatus": "DRAFT"
  },
  {
    "id": "rcbo",
    "namePl": "Wyłącznik RCBO",
    "rodzaj": "LACZNIK",
    "width": 30,
    "height": 60,
    "sourcePath": "10_electric/11_singlepole/200_fuses_protective_gears/50_residual_current_circuit_breaker/rcbo.elmt",
    "sourceBlobSha": "7cfc32e15537e440cb73223145ead8c188717f4e",
    "ports": [
      {
        "x": 22,
        "y": 50,
        "orientation": "s"
      },
      {
        "x": 22,
        "y": 10,
        "orientation": "n"
      }
    ],
    "open": [
      {
        "k": "letter",
        "x": 8,
        "y": 39,
        "t": "IΔ",
        "size": 6
      },
      {
        "k": "line",
        "x1": 24,
        "y1": 18,
        "x2": 20,
        "y2": 22
      },
      {
        "k": "line",
        "x1": 20,
        "y1": 18,
        "x2": 24,
        "y2": 22
      },
      {
        "k": "path",
        "d": "M 17 20 L 22 40 L 22 50",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 22,
        "y1": 10,
        "x2": 22,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 18,
        "y1": 26,
        "x2": 14,
        "y2": 26,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 14,
        "y1": 26,
        "x2": 14,
        "y2": 22,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 22,
        "x2": 14,
        "y2": 22,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 22,
        "x2": 9,
        "y2": 26,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 6,
        "y1": 26,
        "x2": 9,
        "y2": 26,
        "w": 0.65
      },
      {
        "k": "arc",
        "d": "M 14 31 A 2.5 3.5 0 0 0 9 31",
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 14,
        "y1": 31,
        "x2": 20,
        "y2": 31,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 6,
        "y1": 31,
        "x2": 9,
        "y2": 31,
        "w": 0.65
      }
    ],
    "closed": [
      {
        "k": "letter",
        "x": 8,
        "y": 39,
        "t": "IΔ",
        "size": 6
      },
      {
        "k": "line",
        "x1": 24,
        "y1": 18,
        "x2": 20,
        "y2": 22
      },
      {
        "k": "line",
        "x1": 20,
        "y1": 18,
        "x2": 24,
        "y2": 22
      },
      {
        "k": "path",
        "d": "M 22 20 L 22 40 L 22 50",
        "fill": "none"
      },
      {
        "k": "line",
        "x1": 22,
        "y1": 10,
        "x2": 22,
        "y2": 20
      },
      {
        "k": "line",
        "x1": 18,
        "y1": 26,
        "x2": 14,
        "y2": 26,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 14,
        "y1": 26,
        "x2": 14,
        "y2": 22,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 22,
        "x2": 14,
        "y2": 22,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 9,
        "y1": 22,
        "x2": 9,
        "y2": 26,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 6,
        "y1": 26,
        "x2": 9,
        "y2": 26,
        "w": 0.65
      },
      {
        "k": "arc",
        "d": "M 14 31 A 2.5 3.5 0 0 0 9 31",
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 14,
        "y1": 31,
        "x2": 20,
        "y2": 31,
        "w": 0.65
      },
      {
        "k": "line",
        "x1": 6,
        "y1": 31,
        "x2": 9,
        "y2": 31,
        "w": 0.65
      }
    ],
    "closedVerificationStatus": "DRAFT"
  }
];

export function qetSymbolPoId(id: string): QetPilotSymbol {
  const r = QET_PILOT_SYMBOLS.find(s=>s.id===id);
  if (!r) throw new Error('Nieznana definicja QET');
  return r;
}
