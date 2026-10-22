/**
 * Karta GPZ-H5-SLD etap 2, wymaganie 4 (P0 skargi B-02) — STAN RZECZYWISTY łącznika szyn
 * GPZ czytelny GEOMETRIĄ w kadrze „Dopasuj widok", niezależnie od koloru.
 *
 * Przyczyna (pomiar przed naprawą, H5 2×2, 1400×800): zamknięty nóż `lineSwitch` leżał
 * w osi toru bez punktu obrotu (kreska noża = kreska szyny, łącznik „ginął w linii"), a
 * różowy znacznik punktu podziału „NO" stał tuż przy glifie i zasłaniał jego stan; łącznik
 * szyn nie jest punktem podziału (wpis 7 architekta).
 *
 * Iloczyn cech: sieć {H5 2×2 (ŁS 110 kV + ŁS SN), H5 1×3 (dwa ŁS SN)} × kadr {1400×800,
 * 1000×700} × stan rzeczywisty {otwarty, zamknięty} × pozycja normalna {otwarty,
 * zamknięty}. Wyrocznia z DOM kanwy (to, co rysuje `SldCanvasV3`, przez `viewBox`):
 *  - zamknięty: tusz w osi toru ciągły przez cały glif (przerwa < 0,5 px ekranu);
 *  - otwarty: w osi toru przerwa ≥ 3 px ekranu;
 *  - ramka odstępstwa wtedy i tylko wtedy, gdy stan ≠ pozycja normalna;
 *  - najmniejszy wymiar glifu ≥ `MIN_SYMBOL_SCREEN_PX`;
 *  - przy łączniku szyn ani na GPZ brak glifu punktu podziału (`noPoint`);
 *  - podpis (poprawka P0 koordynatora, werdykt właściciela „oznaczenie stanu normalnego nie
 *    może zastępować stanu rzeczywistego"): wiersz główny „⟨nazwa z modelu⟩ · ⟨stan
 *    rzeczywisty słownie⟩"; wiersze drugorzędne „normalnie ⟨pozycja⟩" i „(odstępstwo)"
 *    wtedy i tylko wtedy, gdy stan ≠ pozycja normalna, pismem nie większym niż główny,
 *    w kolejności czytania z góry na dół (wiersz główny pierwszy, także nad glifem); żaden napis nie kończy się
 *    skrótem „NO"/„NZ". Pozycja normalna ma trzecią wartość: niezadeklarowana (brak
 *    `normal_state`) — wtedy bez ramki i bez wiersza odstępstwa.
 * Wyrocznia tekstu jest zapisana dosłownie (nie wołaniem funkcji produktu).
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { MIN_SYMBOL_SCREEN_PX } from '../../symbols/defs';
import { SldCanvasV3 } from '../SldCanvasV3';

const FX = `${__dirname}/../../scene/__tests__/fixtures`;
const SIECI = ['gpzH5_2x2', 'gpzH5_1x3'] as const;
const KADRY = [
  [1400, 800],
  [1000, 700],
] as const;
type Stan = 'open' | 'closed';
const STANY: readonly Stan[] = ['open', 'closed'];
const POZYCJE_NORMALNE: readonly (Stan | null)[] = ['open', 'closed', null];
const SLOWNIE: Readonly<Record<Stan, string>> = { open: 'otwarty', closed: 'zamknięty' };

function wczytaj(nazwa: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(`${FX}/${nazwa}.enm.json`, 'utf8')) as { enm: EnergyNetworkModel }).enm;
}

function lacznikiSzyn(enm: EnergyNetworkModel): string[] {
  return enm.branches.filter((b) => b.type === 'bus_coupler').map((b) => b.ref_id).sort();
}

function zeStanem(enm: EnergyNetworkModel, stan: Stan, normalny: Stan | null): EnergyNetworkModel {
  return {
    ...enm,
    branches: enm.branches.map((b) => {
      if (b.type !== 'bus_coupler') return b;
      const { normal_state: _pominiety, ...bez } = b as typeof b & { normal_state?: unknown };
      return normalny === null ? { ...bez, status: stan } : { ...bez, status: stan, normal_state: normalny };
    }),
  } as EnergyNetworkModel;
}

/** Przedziały tuszu na osi toru (y = 8 w układzie glifu) z elementów glifu. */
function tuszNaOsi(glif: Element): [number, number][] {
  const os = 8;
  const przedzialy: [number, number][] = [];
  for (const el of Array.from(glif.children)) {
    const sw = Number(el.getAttribute('stroke-width') ?? 0);
    if (el.tagName === 'line') {
      if (el.getAttribute('stroke-dasharray')) continue;
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => Number(el.getAttribute(a)));
      if (Math.abs(y1 - os) < 1e-6 && Math.abs(y2 - os) < 1e-6) przedzialy.push([Math.min(x1, x2), Math.max(x1, x2)]);
      else if (Math.min(y1, y2) <= os && Math.max(y1, y2) >= os && Math.abs(x1 - x2) < 1e-6) {
        przedzialy.push([x1 - sw / 2, x1 + sw / 2]);
      } else if (Math.min(y1, y2) <= os && Math.max(y1, y2) >= os) {
        const t = (os - y1) / (y2 - y1);
        const x = x1 + t * (x2 - x1);
        przedzialy.push([x - sw / 2, x + sw / 2]);
      }
    } else if (el.tagName === 'rect') {
      const x = Number(el.getAttribute('x'));
      const y = Number(el.getAttribute('y'));
      const w = Number(el.getAttribute('width'));
      const h = Number(el.getAttribute('height'));
      if (el.getAttribute('data-ramka-odstepstwa') === 'true' || y > os || y + h < os) continue;
      const pelny = (el.getAttribute('fill') ?? 'none') !== 'none' && Number(el.getAttribute('fill-opacity') ?? 1) >= 1;
      if (pelny) przedzialy.push([x, x + w]);
      else przedzialy.push([x - sw / 2, x + sw / 2], [x + w - sw / 2, x + w + sw / 2]);
    } else if (el.tagName === 'circle') {
      const cx = Number(el.getAttribute('cx'));
      const cy = Number(el.getAttribute('cy'));
      const r = Number(el.getAttribute('r'));
      if (Math.abs(cy - os) <= r && (el.getAttribute('fill') ?? 'none') !== 'none') przedzialy.push([cx - r, cx + r]);
    }
  }
  return przedzialy.sort((a, b) => a[0] - b[0]);
}

/** Najdłuższa przerwa tuszu na osi w [0, szerokość] (jednostki świata). */
function najdluzszaPrzerwa(przedzialy: readonly [number, number][], szerokosc: number): number {
  let koniec = 0;
  let przerwa = 0;
  for (const [a, b] of przedzialy) {
    if (a > koniec) przerwa = Math.max(przerwa, a - koniec);
    koniec = Math.max(koniec, b);
  }
  return Math.max(przerwa, szerokosc - koniec);
}

/** Największe odsunięcie tuszu od osi toru (y = 8) — bez ramki odstępstwa. */
function zasiegPozaOsia(glif: Element): number {
  let zasieg = 0;
  for (const el of Array.from(glif.children)) {
    if (el.getAttribute('data-ramka-odstepstwa') === 'true') continue;
    const ys =
      el.tagName === 'line'
        ? [Number(el.getAttribute('y1')), Number(el.getAttribute('y2'))]
        : el.tagName === 'rect'
          ? [Number(el.getAttribute('y')), Number(el.getAttribute('y')) + Number(el.getAttribute('height'))]
          : el.tagName === 'circle'
            ? [Number(el.getAttribute('cy')) - Number(el.getAttribute('r')), Number(el.getAttribute('cy')) + Number(el.getAttribute('r'))]
            : [];
    for (const y of ys) zasieg = Math.max(zasieg, Math.abs(y - 8));
  }
  return zasieg;
}

const SZEROKOSC_GLIFU: Readonly<Record<string, readonly [number, number]>> = {
  lineSwitch: [32, 16],
  lineBreaker: [16, 16],
};

describe('łącznik szyn GPZ — stan rzeczywisty geometrią w kadrze „Dopasuj widok"', () => {
  for (const siec of SIECI) {
    const bazowa = wczytaj(siec);
    const refy = lacznikiSzyn(bazowa);
    it(`${siec}: fikstura niesie łączniki szyn`, () => {
      expect(refy.length).toBeGreaterThan(0);
    });
    for (const [w, h] of KADRY) {
      for (const stan of STANY) {
        for (const normalny of POZYCJE_NORMALNE) {
          it(`${siec} · ${w}×${h} · stan ${stan} · pozycja normalna ${normalny}`, () => {
            const { container } = render(<SldCanvasV3 snapshot={zeStanem(bazowa, stan, normalny)} width={w} height={h} />);
            const svg = container.querySelector('svg[viewBox]')!;
            const vb = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
            const k = w / vb[2];
            expect(container.querySelectorAll('[data-symbol-canon="noPoint"]'), 'GPZ bez glifu punktu podziału').toHaveLength(0);
            for (const ref of refy) {
              const wrap = Array.from(container.querySelectorAll('g[data-owner-ref]')).find(
                (g) => g.getAttribute('data-owner-ref') === ref && g.querySelector('[data-symbol-canon]'),
              );
              expect(wrap, `łącznik ${ref} narysowany w kadrze ${w}×${h}`).toBeDefined();
              const glif = wrap!.querySelector('[data-symbol-canon]')!;
              const rodzaj = glif.getAttribute('data-symbol-canon')!;
              const wymiar = SZEROKOSC_GLIFU[rodzaj];
              expect(wymiar, `glif łącznika szyn ${rodzaj}`).toBeDefined();
              expect(glif.getAttribute('data-switch-state')).toBe(stan);
              expect(glif.getAttribute('data-pozycja-normalna')).toBe(normalny);
              const odstepstwo = normalny !== null && stan !== normalny;
              expect(Math.min(...wymiar) * k, `najmniejszy wymiar glifu ${ref} [px]`).toBeGreaterThanOrEqual(MIN_SYMBOL_SCREEN_PX);
              // Aparat odróżnialny od kreski toru: tusz glifu sięga poza oś toru o ≥ 3 px
              // ekranu (poprzeczka styku, korpus) — zamknięty nóż nie „ginie w linii".
              expect(zasiegPozaOsia(glif) * k, `${ref}: aparat widoczny poza osią toru [px]`).toBeGreaterThanOrEqual(3);
              const przerwaPx = najdluzszaPrzerwa(tuszNaOsi(glif), wymiar[0]) * k;
              if (stan === 'closed') expect(przerwaPx, `zamknięty ${ref}: ciągły tor [px]`).toBeLessThan(0.5);
              else expect(przerwaPx, `otwarty ${ref}: przerwa w osi toru [px]`).toBeGreaterThanOrEqual(3);
              const ramki = glif.querySelectorAll('[data-ramka-odstepstwa="true"]');
              expect(ramki, `ramka odstępstwa ${ref}`).toHaveLength(odstepstwo ? 1 : 0);
              if (normalny !== null) expect(glif.getAttribute('data-odstepstwo')).toBe(String(odstepstwo));

              const nazwa = bazowa.branches.find((b) => b.ref_id === ref)!.name;
              const podpis = (rola: string) =>
                Array.from(container.querySelectorAll('g[data-testid^="sld-v3-label-"]')).find(
                  (g) => g.getAttribute('data-owner-ref') === `${ref}#${rola}`,
                );
              const glowny = podpis('designation');
              expect(glowny?.querySelector('text')?.textContent, `${ref}: stan rzeczywisty słownie`).toBe(`${nazwa} · ${SLOWNIE[stan]}`);
              const wiersze = [podpis('odstepstwo-1'), podpis('odstepstwo-2')];
              if (odstepstwo) {
                expect(
                  wiersze.map((g) => g?.querySelector('text')?.textContent),
                  `${ref}: wiersze odstępstwa`,
                ).toEqual([`normalnie ${SLOWNIE[normalny!]}`, '(odstępstwo)']);
                const fs = (g: Element | undefined) => Number(g?.querySelector('text')?.getAttribute('font-size') ?? 0);
                // Mniejszym pismem w skali naturalnej (klasa `t4` < `t3`); w kadrze dopasowania
                // oba wiersze mogą być podniesione do tego samego progu czytelności.
                for (const g of wiersze) expect(fs(g), `${ref}: wiersz odstępstwa nie większym pismem`).toBeLessThanOrEqual(fs(glowny));
                // Kolejność czytania z góry na dół: stan rzeczywisty, „normalnie …", „(odstępstwo)"
                // — także nad glifem (łącznik szyn 110 kV podpisany nad torem).
                const y = (g: Element | undefined) => Number(g?.querySelector('text')?.getAttribute('y') ?? NaN);
                expect(y(glowny), `${ref}: wiersz główny nad „normalnie …"`).toBeLessThan(y(wiersze[0]));
                expect(y(wiersze[0]), `${ref}: „normalnie …" nad „(odstępstwo)"`).toBeLessThan(y(wiersze[1]));
              } else {
                expect(wiersze, `${ref}: bez wierszy odstępstwa`).toEqual([undefined, undefined]);
              }
            }
            const teksty = Array.from(container.querySelectorAll('g[data-testid^="sld-v3-label-"] text')).map((t) => t.textContent ?? '');
            expect(teksty.filter((t) => / · N[OZ]$/.test(t)), 'żaden podpis nie kończy się skrótem NO/NZ').toEqual([]);
          });
        }
      }
    }
  }
});
