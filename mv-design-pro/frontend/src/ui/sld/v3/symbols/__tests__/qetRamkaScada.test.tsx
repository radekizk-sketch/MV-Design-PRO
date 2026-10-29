/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — glify QElectroTech EN 60617 pola liniowego SN i ramka
 * stanu SCADA (§0 pkt 7).
 *
 * Iloczyn cech: {każdy symbol QET} × {zamknięty / otwarty / uziemiony / nieznany / brak stanu}
 * × {motyw ciemny / jasny} × {łącznik pola: tak / nie}. Kontrakt:
 *  · ramka = WYŁĄCZNIE obrys (`fill="none"`), obejmuje CAŁY rysunek (obwiednia wszystkich
 *    położeń noża + margines), kolor z palety motywu: `#F05260` zamknięty, `#2CCF93` otwarty —
 *    identyczny w obu motywach;
 *  · łącznik trójpołożeniowy „uziemiony" = ramka ZIELONA (tor pola otwarty) i nóż obrócony na
 *    zestyk uziemiający (`data-qet-polozenie="earthed"`);
 *  · stan nieznany = BEZ ramki, symbol narysowany (nóż przerywany) — symbol nigdy nie znika;
 *  · ramkę dostaje każdy łącznik z rodzajów łączników pola (w tym rozłącznik i rozłącznik
 *    z bezpiecznikami) i tylko on — predykat z lustra backendu (`czyLacznikPola`).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { SYMBOL_DEFS, QET_SYMBOL_IDS, obrysSymbolu } from '../defs';
import { RAMKA_SCADA_MARGINES, SYMBOL_GLYPHS, prostokatRamkiScada, rodzajRamkiScada, type SwitchState } from '../glyphs';
import { DARK_SCADA_SLD_PALETTE } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { LIGHT_TECHNICAL_V3 } from '../../export/exportPalette';
import { SYMBOL_QET_RODZAJU } from '../../compose/apparatusSequence';
import { RODZAJE_LACZNIKOW_POLA, czyLacznikPola } from '../../compose/rodzajeAparatuPola';
import type { BayPrimaryDeviceKind } from '../../../../../types/enm';

const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE],
] as const;

const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', undefined];

function rysuj(id: QetSymbolPolaSnId, state: SwitchState | undefined, paleta: typeof DARK_SCADA_SLD_PALETTE, ramkaLacznika = true): string {
  const Glyph = SYMBOL_GLYPHS[id];
  return renderToStaticMarkup(
    <svg>
      <Glyph x={0} y={0} stroke="#000" state={state} ramkaLacznika={ramkaLacznika} ramkaScada={paleta.ramkaScada} />
    </svg>,
  );
}

function ramki(markup: string): Element[] {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return Array.from(doc.querySelectorAll('[data-qet="ramka-scada"]'));
}

/** Oczekiwany rodzaj ramki wg położenia — NIEZALEŻNA tabela kontraktu (nie `rodzajRamkiScada`). */
function oczekiwanaRamka(id: QetSymbolPolaSnId, state: SwitchState | undefined): 'zamkniety' | 'otwarty' | null {
  const noz = QET_SYMBOLE_POLA_SN[id].noz;
  if (!noz) return null;
  if (state === 'closed') return 'zamkniety';
  if (state === 'open') return 'otwarty';
  if (state === 'earthed') return id === 'qetThreePositionSwitch' ? 'otwarty' : null;
  return null;
}

describe('UX-04 — ramka stanu SCADA glifów QET (iloczyn symbol × stan × motyw)', () => {
  for (const [motyw, paleta] of MOTYWY) {
    for (const id of QET_SYMBOL_IDS) {
      for (const state of STANY) {
        it(`${motyw} · ${id} · ${state ?? 'brak stanu'}`, () => {
          const markup = rysuj(id, state, paleta);
          const znalezione = ramki(markup);
          const oczekiwana = oczekiwanaRamka(id, state);
          // Symbol nigdy nie znika — grupa glifu z prymitywami stałymi jest zawsze.
          expect(markup).toContain(`data-symbol-canon="${id}"`);
          expect(markup).toMatch(/<(line|path|circle|polyline|polygon|ellipse|rect)\b/);
          if (oczekiwana === null) {
            expect(znalezione).toHaveLength(0);
            return;
          }
          expect(znalezione).toHaveLength(1);
          const r = znalezione[0];
          expect(r.getAttribute('fill')).toBe('none');
          expect(r.getAttribute('stroke')).toBe(paleta.ramkaScada[oczekiwana]);
          // Ramka obejmuje CAŁY rysunek (obwiednia wszystkich położeń noża) + margines.
          const o = obrysSymbolu(id);
          const x = Number(r.getAttribute('x'));
          const y = Number(r.getAttribute('y'));
          const w = Number(r.getAttribute('width'));
          const h = Number(r.getAttribute('height'));
          expect(x).toBeCloseTo(o.x - RAMKA_SCADA_MARGINES, 6);
          expect(y).toBeCloseTo(o.y - RAMKA_SCADA_MARGINES, 6);
          expect(x + w).toBeCloseTo(o.x + o.width + RAMKA_SCADA_MARGINES, 6);
          expect(y + h).toBeCloseTo(o.y + o.height + RAMKA_SCADA_MARGINES, 6);
          expect(rodzajRamkiScada(id, state)).toBe(oczekiwana);
        });
      }
    }
  }

  it('kolory ramki identyczne w motywie ciemnym, jasnym i w eksporcie; wartości z karty', () => {
    expect(DARK_SCADA_SLD_PALETTE.ramkaScada).toEqual({ zamkniety: '#F05260', otwarty: '#2CCF93' });
    expect(LIGHT_TECHNICAL_SLD_PALETTE.ramkaScada).toEqual(DARK_SCADA_SLD_PALETTE.ramkaScada);
    expect(LIGHT_TECHNICAL_V3.ramkaScada).toEqual(DARK_SCADA_SLD_PALETTE.ramkaScada);
  });

  it('łącznik trójpołożeniowy „uziemiony": ramka zielona + nóż na zestyku uziemiającym', () => {
    for (const [, paleta] of MOTYWY) {
      const markup = rysuj('qetThreePositionSwitch', 'earthed', paleta);
      expect(markup).toContain('data-qet-polozenie="earthed"');
      expect(ramki(markup)[0]?.getAttribute('stroke')).toBe('#2CCF93');
      const katy = QET_SYMBOLE_POLA_SN.qetThreePositionSwitch.noz!.katy;
      expect(markup).toContain(`data-qet-kat="${katy.earthed}"`);
      // Uziemiony ≠ zamknięty ≠ odłączony — trzy różne położenia noża.
      expect(new Set([katy.closed, katy.open, katy.earthed]).size).toBe(3);
    }
  });

  it('stan nieznany: bez ramki, nóż kreską przerywaną (symbol zostaje)', () => {
    for (const id of QET_SYMBOL_IDS.filter((s) => QET_SYMBOLE_POLA_SN[s].noz)) {
      const markup = rysuj(id, 'unknown', DARK_SCADA_SLD_PALETTE);
      expect(ramki(markup)).toHaveLength(0);
      expect(markup).toContain('data-ramka-scada="brak"');
      expect(markup).toMatch(/data-qet="noz"[^>]*>.*stroke-dasharray/);
    }
  });

  it('aparat, który NIE jest łącznikiem pola, nie dostaje ramki nawet w stanie zamkniętym', () => {
    for (const id of QET_SYMBOL_IDS) {
      expect(ramki(rysuj(id, 'closed', DARK_SCADA_SLD_PALETTE, false))).toHaveLength(0);
    }
  });

  it('bez palety ramek (harness mono, miniatury) — bez ramki', () => {
    const Glyph = SYMBOL_GLYPHS.qetBreaker;
    const markup = renderToStaticMarkup(
      <svg>
        <Glyph x={0} y={0} stroke="#000" state="closed" ramkaLacznika />
      </svg>,
    );
    expect(ramki(markup)).toHaveLength(0);
  });
});

describe('UX-04 — predykaty parami: rodzaj łącznika ⇔ symbol QET z nożem', () => {
  it('każdy rodzaj z SYMBOL_QET_RODZAJU: łącznik pola ⇔ symbol ma nóż (ramkę)', () => {
    for (const [kind, symbol] of Object.entries(SYMBOL_QET_RODZAJU) as [BayPrimaryDeviceKind, QetSymbolPolaSnId][]) {
      expect(czyLacznikPola(kind), `${kind} → ${symbol}`).toBe(QET_SYMBOLE_POLA_SN[symbol].noz !== null);
    }
  });

  it('każdy łącznik pola ma symbol QET (rozłącznik i rozłącznik z bezpiecznikami też)', () => {
    for (const kind of RODZAJE_LACZNIKOW_POLA) {
      const symbol = SYMBOL_QET_RODZAJU[kind];
      expect(symbol, kind).toBeDefined();
      expect(QET_SYMBOLE_POLA_SN[symbol as QetSymbolPolaSnId].noz, kind).not.toBeNull();
    }
  });

  it('ramka mieści się w marginesie wokół gabarytu: sąsiedzi stosu (odstęp GRID) nie kolidują', () => {
    for (const id of QET_SYMBOL_IDS) {
      const r = prostokatRamkiScada(id);
      const d = SYMBOL_DEFS[id];
      expect(r.x).toBeGreaterThanOrEqual(-RAMKA_SCADA_MARGINES);
      expect(r.y).toBeGreaterThanOrEqual(-RAMKA_SCADA_MARGINES);
      expect(r.x + r.width).toBeLessThanOrEqual(d.width + RAMKA_SCADA_MARGINES);
      expect(r.y + r.height).toBeLessThanOrEqual(d.height + RAMKA_SCADA_MARGINES);
    }
  });
});
