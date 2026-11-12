/**
 * Karta SLD-SKALA-I-NAWIGACJA, R7 — PRZELOT KAMERY: płynne przejście między dwoma kadrami po
 * ścieżce optymalnej dla jednoczesnego powiększenia i przesunięcia (J. J. van Wijk, W. A. A. Nuij,
 * „Smooth and efficient zooming and panning”, IEEE InfoVis 2003). Ścieżka ma stałą odczuwalną
 * prędkość: parametr `s` rośnie jednostajnie w czasie, a długość ścieżki `S` wyznacza czas
 * przelotu w granicach `CZAS_PRZELOTU_MS`.
 *
 * Punkt widzenia = (środek kadru w świecie, szerokość kadru w świecie). Kamera kanwy:
 * ekran = świat · skala + przesunięcie (`camera.ts`), więc szerokość = szerokość widoku / skala,
 * środek = (połowa widoku − przesunięcie) / skala.
 *
 * Czyste funkcje, bez DOM i bez czasu rzeczywistego — animację prowadzi kanwa
 * (`SldCanvasV3`, atrybut `data-stan-kamery`).
 */
import type { ViewportTransform } from '../../v2/viewport/ViewportController';

/** Parametr ρ ścieżki — wartość zalecana przez autorów (√2): kompromis powiększenie/przesunięcie. */
export const RHO_PRZELOTU = Math.SQRT2;
/** Czas przelotu [ms] na jednostkę długości ścieżki `S` i jego granice (karta: 120–500 ms). */
export const CZAS_PRZELOTU_MS = { naJednostke: 220, min: 120, max: 500 } as const;

interface Rozmiar {
  readonly width: number;
  readonly height: number;
}

/** Punkt widzenia: środek kadru i szerokość kadru w świecie. */
export interface PunktWidzenia {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
}

export function punktWidzenia(t: ViewportTransform, widok: Rozmiar): PunktWidzenia {
  return {
    cx: (widok.width / 2 - t.translateX) / t.scale,
    cy: (widok.height / 2 - t.translateY) / t.scale,
    w: widok.width / t.scale,
  };
}

export function transformPunktu(p: PunktWidzenia, widok: Rozmiar): ViewportTransform {
  const scale = widok.width / p.w;
  return { scale, translateX: widok.width / 2 - p.cx * scale, translateY: widok.height / 2 - p.cy * scale };
}

/** Ścieżka przelotu: długość `S` i interpolacja punktu widzenia dla ułamka czasu `t ∈ [0, 1]`. */
export interface SciezkaPrzelotu {
  readonly dlugosc: number;
  readonly punkt: (t: number) => PunktWidzenia;
}

const EPS = 1e-9;

/**
 * Ścieżka van Wijka–Nuija z `p0` do `p1`. Punkty końcowe dokładne (t = 0 → p0, t = 1 → p1);
 * szerokość i odległość od startu wzdłuż prostej środków są funkcjami ciągłymi; ruch środka
 * monotoniczny (u rośnie z t). Ruch bez przesunięcia — czysty zoom wykładniczy.
 */
export function sciezkaPrzelotu(p0: PunktWidzenia, p1: PunktWidzenia, rho: number = RHO_PRZELOTU): SciezkaPrzelotu {
  const dx = p1.cx - p0.cx;
  const dy = p1.cy - p0.cy;
  const u1 = Math.hypot(dx, dy);
  const w0 = p0.w;
  const w1 = p1.w;
  const rho2 = rho * rho;
  const koniec = (t: number, p: PunktWidzenia) => (t >= 1 ? p1 : t <= 0 ? p0 : p);
  if (u1 < EPS * Math.max(w0, w1)) {
    const k = Math.log(w1 / w0);
    const dlugosc = Math.abs(k) / rho;
    return {
      dlugosc,
      punkt: (t) => koniec(t, { cx: p0.cx + dx * t, cy: p0.cy + dy * t, w: w0 * Math.exp(k * t) }),
    };
  }
  const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * u1 * u1) / (2 * w0 * rho2 * u1);
  const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * u1 * u1) / (2 * w1 * rho2 * u1);
  const r0 = Math.log(-b0 + Math.sqrt(b0 * b0 + 1));
  const r1 = Math.log(-b1 + Math.sqrt(b1 * b1 + 1));
  const dlugosc = (r1 - r0) / rho;
  const coshR0 = Math.cosh(r0);
  const sinhR0 = Math.sinh(r0);
  return {
    dlugosc,
    punkt: (t) => {
      const s = t * dlugosc;
      const u = (w0 / rho2) * (coshR0 * Math.tanh(rho * s + r0) - sinhR0);
      const w = (w0 * coshR0) / Math.cosh(rho * s + r0);
      const f = u / u1;
      return koniec(t, { cx: p0.cx + dx * f, cy: p0.cy + dy * f, w });
    },
  };
}

/** Czas przelotu [ms] z długości ścieżki — stała odczuwalna prędkość, w granicach karty. */
export function czasPrzelotu(dlugosc: number): number {
  const ms = Math.abs(dlugosc) * CZAS_PRZELOTU_MS.naJednostke;
  return Math.min(CZAS_PRZELOTU_MS.max, Math.max(CZAS_PRZELOTU_MS.min, ms));
}

/** Kadr przelotu w chwili `t ∈ [0, 1]` (ułamek czasu przelotu). */
export function kadrPrzelotu(z: ViewportTransform, na: ViewportTransform, widok: Rozmiar, t: number): ViewportTransform {
  if (t >= 1) return na;
  if (t <= 0) return z;
  const sciezka = sciezkaPrzelotu(punktWidzenia(z, widok), punktWidzenia(na, widok));
  return transformPunktu(sciezka.punkt(t), widok);
}

/**
 * Czy przelot jest dozwolony w tym środowisku: przeglądarka z `requestAnimationFrame`
 * i `matchMedia`, bez preferencji ograniczenia ruchu. `prefers-reduced-motion: reduce` = CIĘCIE
 * (kamera od razu w celu). Środowisko bez zegara klatek (render bez przeglądarki) także tnie —
 * kadr jest wtedy stanem natychmiastowym, a nie animacją, której nikt nie odtworzy.
 */
export function przelotDozwolony(okno: (Window & typeof globalThis) | undefined): boolean {
  if (!okno || typeof okno.requestAnimationFrame !== 'function' || typeof okno.matchMedia !== 'function') return false;
  return !okno.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Stan kamery z NUMEREM PRZELOTU: każde polecenie widoku z przelotem nadaje nowy numer; kanwa
 * animuje przejście do stanu o numerze, którego jeszcze nie odtworzyła. Gest i zmiana układu
 * numer przenoszą bez zmiany — gest po poleceniu nie animuje się (numer już odtworzony), a zmiana
 * układu w tej samej partii co polecenie (np. mini-ścieżka kadru pojawia się po wejściu w głąb)
 * nie gubi przelotu.
 */
export type ZPrzelotem<S> = S & { readonly przelot?: number };
/** Akcja kamery z opcjonalnym żądaniem przelotu (polecenia widoku; gesty go nie niosą). */
export type AkcjaZPrzelotem<A> = A & { readonly przelot?: boolean };

/**
 * Reduktor kamery z numerem przelotu. JEDNO źródło prawdy dla pary „przejście animowane /
 * natychmiastowe”: zamiar jest częścią STANU (numer), a nie flagą obok niego — nie da się
 * zgubić go ani odziedziczyć poza regułą wyżej.
 */
export function reduktorZPrzelotem<S extends object, A>(
  reduktor: (stan: S, akcja: A) => S,
): (stan: ZPrzelotem<S>, akcja: AkcjaZPrzelotem<A>) => ZPrzelotem<S> {
  return (stan, akcja) => {
    const numer = stan.przelot;
    const wynik = reduktor(stan, akcja) as ZPrzelotem<S>;
    if (akcja.przelot === true) return { ...wynik, przelot: (numer ?? 0) + 1 };
    if (wynik.przelot === numer) return wynik;
    return { ...wynik, przelot: numer } as ZPrzelotem<S>;
  };
}
