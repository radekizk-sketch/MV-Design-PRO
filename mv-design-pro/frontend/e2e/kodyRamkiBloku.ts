/**
 * Wyrocznia ekranu: kod ramki bloku zabezpieczeń NIGDY nie jest zasłonięty (werdykt B-02 właściciela
 * 2026-11-05 — kod „81O” zasłonięty na zrzucie pola Z.11.1). Odpowiednik ekranowy wyroczni sceny
 * (f) `scene/__tests__/wyroczniaOpisowPola.ts::naruszeniaKodowRamki`: tam obrys napisu z tabeli
 * posuwów kroju, tu tusz NARYSOWANY przez przeglądarkę (czcionka, plan czytelności kanwy, kamera).
 *
 * Dla każdego wiersza bloku na kanwie (`g[data-owner-ref$="#protection-codes-full…"|"#zrodlo-u0…"] >
 * text`) prostokąt tuszu (pomniejszony o pół piksela — wygładzanie krawędzi) nie ma części wspólnej z:
 *  - żadnym innym napisem kanwy (także innym wierszem tego samego bloku),
 *  - żadną kreską: ścieżki rozkładane na odcinki z atrybutu `d` (M/L/H/V/Z) w układzie ekranu
 *    (`getScreenCTM`), poszerzone o pół grubości kreski; ścieżka z łukami/krzywymi — obwiednia;
 *    prostokąt z obrysem — cztery krawędzie (ramka własnego bloku jest tu zwykłą przeszkodą: wiersz
 *    leży w jej wnętrzu),
 *  - żadnym kształtem wypełnionym narysowanym PÓŹNIEJ niż napis (kolejność dokumentu = kolejność
 *    malowania SVG; wypełnienie namalowane wcześniej jest tłem napisu).
 * Pominięte: warstwa trafień (`sld-v3-trafienia` — kreski przezroczyste), elementy niewidoczne
 * (`checkVisibility`), kształty bez obrysu i bez wypełnienia.
 *
 * Zwraca opisy naruszeń (pusta lista = każdy kod ramki w pełni widoczny).
 */
import type { Page } from '@playwright/test';

export async function zaslonieciaKodowRamki(page: Page, kanwa: string): Promise<string[]> {
  return page.evaluate((selektor) => {
    const svg = document.querySelector(selektor) as SVGSVGElement | null;
    if (!svg) return [`brak kanwy ${selektor}`];
    type R = { x: number; y: number; width: number; height: number };
    const WIERSZ = /#(protection-codes-full|zrodlo-u0)(-\d+)?$/;
    const zachodzi = (a: R, b: R) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const prost = (r: DOMRect): R => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    const widoczny = (el: Element) =>
      (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
    const brakFarby = (v: string) => v === 'none' || v === 'transparent' || v === '' || /rgba\(.*,\s*0\)$/.test(v);
    const wiersze = [...svg.querySelectorAll('g[data-owner-ref] > text')].filter((t) =>
      WIERSZ.test(t.parentElement?.getAttribute('data-owner-ref') ?? ''),
    ) as SVGTextElement[];
    const elementy = [...svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse, text')].filter(
      (el) => !el.closest('[data-testid="sld-v3-trafienia"]') && widoczny(el),
    ) as SVGGraphicsElement[];
    // Odcinki kreski w układzie ekranu.
    const odcinkiEkranu = (el: SVGGraphicsElement): { a: DOMPoint; b: DOMPoint }[] | null => {
      const ctm = el.getScreenCTM();
      if (!ctm) return null;
      const p = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(ctm);
      const tag = el.tagName.toLowerCase();
      if (tag === 'line') {
        const l = el as SVGLineElement;
        return [{ a: p(l.x1.baseVal.value, l.y1.baseVal.value), b: p(l.x2.baseVal.value, l.y2.baseVal.value) }];
      }
      if (tag === 'rect') {
        const r = el as SVGRectElement;
        const [x, y, w, h] = [r.x.baseVal.value, r.y.baseVal.value, r.width.baseVal.value, r.height.baseVal.value];
        const n = [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
        return n.map((a, i) => ({ a, b: n[(i + 1) % 4] }));
      }
      if (tag === 'polyline' || tag === 'polygon') {
        const pts = [...(el as SVGPolylineElement).points].map((q) => p(q.x, q.y));
        if (tag === 'polygon' && pts.length > 0) pts.push(pts[0]);
        return pts.slice(1).map((b, i) => ({ a: pts[i], b }));
      }
      if (tag === 'path') {
        const d = el.getAttribute('d') ?? '';
        if (/[^MLHVZmlhvz0-9eE.,\s+-]/.test(d)) return null; // łuki/krzywe — obwiednia
        const tokeny = d.match(/[MLHVZmlhvz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? [];
        const wynik: { a: DOMPoint; b: DOMPoint }[] = [];
        let x = 0;
        let y = 0;
        let start = { x: 0, y: 0 };
        let cmd = 'M';
        for (let i = 0; i < tokeny.length; ) {
          if (/[A-Za-z]/.test(tokeny[i])) {
            cmd = tokeny[i];
            i += 1;
            if (cmd === 'Z' || cmd === 'z') {
              wynik.push({ a: p(x, y), b: p(start.x, start.y) });
              x = start.x;
              y = start.y;
            }
            continue;
          }
          const n = (k: number) => Number(tokeny[i + k]);
          const rel = cmd === cmd.toLowerCase();
          const C = cmd.toUpperCase();
          if (C === 'M' || C === 'L') {
            const nx = (rel ? x : 0) + n(0);
            const ny = (rel ? y : 0) + n(1);
            if (C === 'L') wynik.push({ a: p(x, y), b: p(nx, ny) });
            else start = { x: nx, y: ny };
            x = nx;
            y = ny;
            if (C === 'M') cmd = rel ? 'l' : 'L';
            i += 2;
          } else if (C === 'H') {
            const nx = (rel ? x : 0) + n(0);
            wynik.push({ a: p(x, y), b: p(nx, y) });
            x = nx;
            i += 1;
          } else if (C === 'V') {
            const ny = (rel ? y : 0) + n(0);
            wynik.push({ a: p(x, y), b: p(x, ny) });
            y = ny;
            i += 1;
          } else {
            i += 1;
          }
        }
        return wynik;
      }
      return null;
    };
    const odcinekPrzecina = (a: DOMPoint, b: DOMPoint, polowa: number, r: R) =>
      zachodzi(r, {
        x: Math.min(a.x, b.x) - polowa,
        y: Math.min(a.y, b.y) - polowa,
        width: Math.abs(b.x - a.x) + 2 * polowa,
        height: Math.abs(b.y - a.y) + 2 * polowa,
      });
    const n: string[] = [];
    for (const t of wiersze) {
      const ref = t.parentElement!.getAttribute('data-owner-ref') ?? '';
      const r0 = prost(t.getBoundingClientRect());
      const r = { x: r0.x + 0.5, y: r0.y + 0.5, width: r0.width - 1, height: r0.height - 1 };
      const opis = `kod „${(t.textContent ?? '').trim()}” (${ref})`;
      for (const el of elementy) {
        if (el === t || t.contains(el)) continue;
        const nazwa = `${el.tagName.toLowerCase()} ${el.closest('[data-owner-ref]')?.getAttribute('data-owner-ref') ?? el.getAttribute('data-testid') ?? '—'}`;
        if (el.tagName.toLowerCase() === 'text') {
          if (zachodzi(r, prost(el.getBoundingClientRect()))) n.push(`${opis} ∩ napis „${(el.textContent ?? '').trim()}” ${nazwa}`);
          continue;
        }
        const styl = getComputedStyle(el);
        const obrys = !brakFarby(styl.stroke) && parseFloat(styl.strokeWidth) > 0;
        const wypelnienie = !brakFarby(styl.fill);
        if (!obrys && !wypelnienie) continue;
        const pozniej = (t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        if (wypelnienie && pozniej && zachodzi(r, prost(el.getBoundingClientRect()))) {
          n.push(`${opis} ∩ wypełnienie ${nazwa}`);
          continue;
        }
        if (!obrys) continue;
        const ctm = el.getScreenCTM();
        const polowa = (parseFloat(styl.strokeWidth) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1)) / 2;
        const odcinki = odcinkiEkranu(el);
        if (odcinki === null) {
          if (zachodzi(r, prost(el.getBoundingClientRect()))) n.push(`${opis} ∩ kreska ${nazwa}`);
        } else if (odcinki.some(({ a, b }) => odcinekPrzecina(a, b, polowa, r))) {
          n.push(`${opis} ∩ kreska ${nazwa}`);
        }
      }
    }
    return [...new Set(n)];
  }, kanwa);
}

/** Iniekcja dowodu, że wyrocznia gryzie: kreska w warstwie odcinków kanwy przez środek pierwszego
 *  kodu ramki (`false` = na kanwie nie ma kodu ramki). Cofnięcie: `usunIniekcje`. */
export async function wstrzyknijKreskePrzezKod(page: Page, kanwa: string): Promise<boolean> {
  return page.evaluate((selektor) => {
    const svg = document.querySelector(selektor) as SVGSVGElement | null;
    const t = [...(svg?.querySelectorAll('g[data-owner-ref] > text') ?? [])].find((x) =>
      /#protection-codes-full(-\d+)?$/.test(x.parentElement?.getAttribute('data-owner-ref') ?? ''),
    ) as SVGTextElement | undefined;
    const warstwa = svg?.querySelector('[data-testid="sld-v3-segments"]') as SVGGElement | null;
    if (!t || !warstwa) return false;
    const b = t.getBBox();
    const doWarstwy = warstwa.getScreenCTM()!.inverse().multiply(t.getScreenCTM()!);
    const p = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(doWarstwy);
    const a = p(b.x + b.width / 2, b.y - b.height);
    const c = p(b.x + b.width / 2, b.y + 2 * b.height);
    const kreska = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    kreska.setAttribute('d', `M ${a.x} ${a.y} L ${c.x} ${c.y}`);
    kreska.setAttribute('stroke', '#ff0000');
    kreska.setAttribute('stroke-width', '1');
    kreska.setAttribute('data-iniekcja', 'kreska-przez-kod');
    warstwa.appendChild(kreska);
    return true;
  }, kanwa);
}

export async function usunIniekcje(page: Page, kanwa: string): Promise<void> {
  await page.evaluate((selektor) => {
    document.querySelectorAll(`${selektor} [data-iniekcja]`).forEach((el) => el.remove());
  }, kanwa);
}
