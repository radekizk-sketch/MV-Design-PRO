/**
 * Harness PAKIETU REFERENCYJNEGO SYMBOLI CAD (R2 §21–§23) — tablica
 * „symbol obecny → symbol proponowany" dla 18 symboli SLD nN, w obu motywach
 * i w mono, oraz tablica ROZPOZNAWALNOŚCI bez etykiet (§22).
 *
 * Wzorzec jak `lv-domain-harness-main.tsx` (standalone entry HTML, parametry
 * w query, `data-status` na korzeniu dla Playwright). Dane: WYŁĄCZNIE rejestr
 * `cad/cadSymbolRegistry.ts` (proponowane) i `symbols/glyphs.tsx` (obecne).
 *
 * Parametry:
 *  - `?tryb=pakiet|rozpoznanie` — tablica pakietu (domyślnie) albo tablica
 *    rozpoznawalności (symbole bez podpisów, kolejność stała, klucz w
 *    `docs/sld/SLD_CAD_SYMBOL_REFERENCE_PACK_R2.md`);
 *  - `?theme=light|dark`, `?mono=1` — jak w harnessie projekcji nN.
 *
 * Used by: e2e/sld-symbol-pack-screenshot.spec.ts.
 */
import type { CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';

import { CadSymbol } from './ui/sld/v3/cad/CadSymbol';
import {
  ELECTRICAL_CAD_SYMBOL_REGISTRY,
  maStanLaczeniowy,
  type CadSwitchState,
  type CadSymbolId,
} from './ui/sld/v3/cad/cadSymbolRegistry';
import { paletaMono, paletaNnDlaMotywu } from './ui/sld/v3/lv-domain/visualGrammar';
import { SYMBOL_DEFS, type SymbolId } from './ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from './ui/sld/v3/symbols/glyphs';
import type { ThemeMode } from './ui2/theme/themeMode';

const params = new URLSearchParams(window.location.search);
const theme: ThemeMode = params.get('theme') === 'light' ? 'light_technical' : 'dark_scada';
const tryb = params.get('tryb') === 'rozpoznanie' ? 'rozpoznanie' : 'pakiet';
const mono = params.get('mono') === '1' || tryb === 'rozpoznanie';
document.documentElement.setAttribute('data-theme', theme);
const paleta = mono ? paletaMono() : paletaNnDlaMotywu(theme);
document.documentElement.style.background = paleta.tlo;
document.body.style.background = paleta.tlo;

/** Skala tablicy: px ekranu na 1 u symbolu. */
const S = 4;
/** Margines wokół symbolu [u]. */
const M = 6;
const KRESKA_PX = 2;

export interface WierszPakietu {
  readonly lp: string;
  readonly cad: CadSymbolId;
  /** Obecny glif biblioteki SN/nN, `'kropka'` = prymityw rysowany przez widok, `null` = brak. */
  readonly obecny: SymbolId | 'kropka' | null;
  readonly obecnyOpis: string;
  readonly uwagi: string;
}

export const WIERSZE_PAKIETU: readonly WierszPakietu[] = [
  { lp: '01', cad: 'cad.wylacznik', obecny: 'nnBreaker', obecnyOpis: 'prostokąt z dźwignią; WYPEŁNIENIE = zamknięty (odrzucone §4/§14)', uwagi: 'styk + krzyżyk funkcji na końcówce noża; stan z kąta noża' },
  { lp: '02', cad: 'cad.odlacznik', obecny: 'disconnector', obecnyOpis: 'nóż 45° + poprzeczka przy przegubie (zła strona)', uwagi: 'poprzeczka na STYKU STAŁYM, nóż na przegubie' },
  { lp: '03', cad: 'cad.rozlacznik', obecny: 'loadBreakSwitch', obecnyOpis: 'nóż + poprzeczka na swobodnym końcu noża', uwagi: 'poprzeczka styku stałego + okrąg funkcji na przegubie' },
  { lp: '04', cad: 'cad.lacznik', obecny: 'nnBreaker', obecnyOpis: 'sprzęgło = pusty/pełny prostokąt jak wyłącznik (odrzucone §6)', uwagi: 'łącznik ogólny TYLKO gdy ENM nie niesie klasy; z device_kind → realny aparat' },
  { lp: '05', cad: 'cad.uziemnik', obecny: 'earthSwitch', obecnyOpis: 'nóż + uziemienie (biblioteka SN)', uwagi: 'ta sama rodzina noża co odłącznik; bez elementu ENM w projekcji nN — DRAFT' },
  { lp: '06', cad: 'cad.bezpiecznik', obecny: 'nnFuseSwitch', obecnyOpis: 'sześciokąt kasety — jeden glif dla KAŻDEJ gałęzi fuse', uwagi: 'prostokąt z przewodem na wylot (S00362)' },
  { lp: '07', cad: 'cad.rozlacznikBezpiecznikowy', obecny: 'nnFuseSwitch', obecnyOpis: 'ten sam sześciokąt co wkładka (brak rozróżnienia §7)', uwagi: 'wkładka JAKO nóż + poprzeczka + okrąg (S00370); stan z kąta' },
  { lp: '08', cad: 'cad.transformator2u', obecny: 'transformer2W', obecnyOpis: 'dwa okręgi 32×40 (biblioteka SN)', uwagi: 'dwa uzwojenia 16×28, cienka kreska, hv/lv jawne; tabliczka tekstem obok' },
  { lp: '09', cad: 'cad.przekladnikPradowy', obecny: 'currentTransformer', obecnyOpis: 'okrąg na przewodzie', uwagi: 'okrąg na torze pierwotnym (S00850); przekładnia/klasa/rdzenie tekstem obok' },
  { lp: '10', cad: 'cad.przekladnikNapieciowy', obecny: 'voltageTransformer', obecnyOpis: 'dwa okręgi bez wyprowadzenia wtórnego', uwagi: 'odgałęzienie, dwa uzwojenia, strona wtórna otwarta (S00878)' },
  { lp: '11', cad: 'cad.przeksztaltnik', obecny: null, obecnyOpis: 'brak — falownik ukryty w ikonie PV', uwagi: 'kwadrat z przekątną, „=" / „~" kreskami (S00896)' },
  { lp: '12', cad: 'cad.zrodloPvZPrzeksztaltnikiem', obecny: 'derPv', obecnyOpis: 'ikona w ramce 32×32 (przekątna, kreski, sinusoida)', uwagi: 'generator PV (S00908) + falownik (S00896) — dwa ogniwa jednego elementu ENM' },
  { lp: '13', cad: 'cad.magazynZPrzeksztaltnikiem', obecny: 'derBess', obecnyOpis: 'ikona baterii w ramce 32×32', uwagi: 'bateria (S01342) + przekształtnik dwukierunkowy (S00897)' },
  { lp: '14', cad: 'cad.generator', obecny: 'derGenerator', obecnyOpis: 'okrąg z literą G (32×32)', uwagi: 'maszyna (S00819) z literą G i „~" — 16×24' },
  { lp: '15', cad: 'cad.odplywOdbior', obecny: 'loadArrow', obecnyOpis: 'strzałka odpływu', uwagi: 'strzałka przepływu energii od szyn (S00104) — Load ENM jest odbiorem zagregowanym' },
  { lp: '16', cad: 'cad.zabezpieczenie', obecny: 'protectionRelay', obecnyOpis: 'okrąg z kodami WEWNĄTRZ (plakietka, odrzucone §3)', uwagi: 'prostokąt urządzenia wtórnego; kody funkcji tekstem OBOK — DRAFT (konwencja, nie IEC)' },
  { lp: '17', cad: 'cad.zacisk', obecny: 'kropka', obecnyOpis: 'kropka wypełniona rysowana przez widok (ten sam znak co węzeł)', uwagi: 'zacisk (S00017) = okrąg pusty, ODRÓŻNIALNY od węzła' },
  { lp: '18', cad: 'cad.wezel', obecny: 'junction', obecnyOpis: 'kropka wypełniona r=3', uwagi: 'kropka połączenia (S00020/S00021)' },
];

/** Tablica rozpoznawalności §22: stała permutacja (klucz w dokumencie pakietu). */
export const TABLICA_ROZPOZNANIA: readonly { readonly cad: CadSymbolId; readonly state: CadSwitchState }[] = [
  { cad: 'cad.przekladnikPradowy', state: 'closed' },
  { cad: 'cad.odlacznik', state: 'open' },
  { cad: 'cad.bezpiecznik', state: 'closed' },
  { cad: 'cad.wylacznik', state: 'closed' },
  { cad: 'cad.przekladnikNapieciowy', state: 'closed' },
  { cad: 'cad.rozlacznik', state: 'open' },
  { cad: 'cad.transformator2u', state: 'closed' },
  { cad: 'cad.uziemnik', state: 'open' },
  { cad: 'cad.wylacznik', state: 'open' },
  { cad: 'cad.magazynZPrzeksztaltnikiem', state: 'closed' },
  { cad: 'cad.lacznik', state: 'closed' },
  { cad: 'cad.rozlacznikBezpiecznikowy', state: 'closed' },
  { cad: 'cad.zacisk', state: 'closed' },
  { cad: 'cad.odlacznik', state: 'closed' },
  { cad: 'cad.generator', state: 'closed' },
  { cad: 'cad.rozlacznik', state: 'closed' },
  { cad: 'cad.przeksztaltnik', state: 'closed' },
  { cad: 'cad.uziemnik', state: 'closed' },
  { cad: 'cad.zrodloPvZPrzeksztaltnikiem', state: 'closed' },
  { cad: 'cad.rozlacznikBezpiecznikowy', state: 'open' },
  { cad: 'cad.wezel', state: 'closed' },
  { cad: 'cad.lacznik', state: 'open' },
  { cad: 'cad.odplywOdbior', state: 'closed' },
  { cad: 'cad.zabezpieczenie', state: 'closed' },
];

const NAZWA_STANU: Readonly<Record<CadSwitchState, string>> = { closed: 'ZAMKNIĘTY', open: 'OTWARTY', unknown: 'NIEZNANY' };

/** Przykładowe znaki funkcji (notacja IEC) w prostokącie zabezpieczenia —
 *  na scenie pochodzą z `protection_assignments` (renderer nN). */
const ZNAKI_PRZYKLADOWE: Partial<Record<CadSymbolId, readonly string[]>> = {
  'cad.zabezpieczenie': ['I>', 'I0>'],
};

function KomorkaCad(props: { readonly id: CadSymbolId; readonly state: CadSwitchState; readonly siatka: boolean; readonly testId?: string }): JSX.Element {
  const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[props.id];
  const w = (def.nominalWidth + 2 * M) * S;
  const h = (def.nominalHeight + 2 * M) * S;
  const linieSiatki: JSX.Element[] = [];
  if (props.siatka) {
    for (let gx = 0; gx <= def.nominalWidth + 2 * M; gx += 4) {
      linieSiatki.push(<line key={`v${gx}`} x1={gx * S} y1={0} x2={gx * S} y2={h} stroke={paleta.kreskaWygaszona} strokeOpacity={0.25} strokeWidth={0.5} />);
    }
    for (let gy = 0; gy <= def.nominalHeight + 2 * M; gy += 4) {
      linieSiatki.push(<line key={`h${gy}`} x1={0} y1={gy * S} x2={w} y2={gy * S} stroke={paleta.kreskaWygaszona} strokeOpacity={0.25} strokeWidth={0.5} />);
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} data-testid={props.testId} data-pack-cell={props.id} data-pack-state={props.state} style={{ display: 'block' }}>
      {linieSiatki}
      {props.siatka && (
        <rect x={M * S} y={M * S} width={def.nominalWidth * S} height={def.nominalHeight * S} fill="none" stroke={paleta.tonInfo} strokeOpacity={0.45} strokeWidth={0.75} strokeDasharray="3 3" data-pack-bbox="true" />
      )}
      <CadSymbol id={props.id} x={M * S} y={M * S} scale={S} state={props.state} ink={paleta.kreskaBazowa} paper={paleta.tlo} strokePx={KRESKA_PX} wnetrze={ZNAKI_PRZYKLADOWE[props.id]} />
      {props.siatka && def.terminals.map((t) => (
        <rect key={t.name} x={(M + t.x) * S - 3} y={(M + t.y) * S - 3} width={6} height={6} fill={paleta.tlo} stroke={paleta.tonInfo} strokeWidth={1} data-pack-terminal={t.name} />
      ))}
    </svg>
  );
}

function KomorkaObecna(props: { readonly wiersz: WierszPakietu; readonly state: CadSwitchState }): JSX.Element {
  const { wiersz, state } = props;
  if (wiersz.obecny === null) {
    return <div style={{ color: paleta.kreskaWygaszona, fontSize: 12, padding: 8 }}>brak symbolu</div>;
  }
  if (wiersz.obecny === 'kropka') {
    const w = (8 + 2 * M) * S;
    return (
      <svg width={w} height={w} viewBox={`0 0 ${w} ${w}`} data-pack-obecny="kropka" style={{ display: 'block' }}>
        <circle cx={w / 2} cy={w / 2} r={3 * S} fill={paleta.wypelnienieZacisku} />
      </svg>
    );
  }
  const def = SYMBOL_DEFS[wiersz.obecny];
  const Glyph = SYMBOL_GLYPHS[wiersz.obecny];
  const w = (def.width + 2 * M) * S;
  const h = (def.height + 2 * M) * S;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} data-pack-obecny={wiersz.obecny} data-pack-state={state} style={{ display: 'block' }}>
      <g transform={`translate(${M * S} ${M * S}) scale(${S})`}>
        <Glyph x={0} y={0} state={state} stroke={paleta.kreskaBazowa} strokeScale={0.45} labelLines={wiersz.obecny === 'protectionRelay' ? ['50', '+2'] : undefined} />
      </g>
    </svg>
  );
}

const STYL_KOMORKI: CSSProperties = { padding: '10px 12px', verticalAlign: 'top', borderTop: `1px solid ${paleta.kreskaWygaszona}55` };
const STYL_NAGLOWKA: CSSProperties = { ...STYL_KOMORKI, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: paleta.kreskaWygaszona, borderTop: 'none' };

function Pakiet(): JSX.Element {
  return (
    <div style={{ padding: 24, color: paleta.kreskaBazowa, fontFamily: 'Inter, "Segoe UI", Arial, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Pakiet referencyjny symboli CAD — SLD nN (R2)</h1>
      <p style={{ fontSize: 12, color: paleta.kreskaWygaszona, marginBottom: 16 }}>
        Skala {S} px / u · kreska symbolu {KRESKA_PX} px (nieskalowana) · siatka co 4 u · obrys = gabaryt nominalny · kwadraciki = zaciski.
        Statusy: DRAFT / ENGINEERING_REVIEWED / NORMATIVE_VERIFIED — żaden symbol nie jest opisany jako zweryfikowany normatywnie bez potwierdzenia w bazie IEC 60617.
        Werdykt wizualny należy do właściciela.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }} data-testid="symbol-pack-table">
        <thead>
          <tr>
            <th style={{ ...STYL_NAGLOWKA, textAlign: 'left', width: 300 }}>Symbol</th>
            <th style={STYL_NAGLOWKA}>Obecny</th>
            <th style={STYL_NAGLOWKA}>Proponowany — zamknięty</th>
            <th style={STYL_NAGLOWKA}>Otwarty</th>
            <th style={STYL_NAGLOWKA}>Nieznany</th>
            <th style={{ ...STYL_NAGLOWKA, textAlign: 'left' }}>Uwagi przeglądu</th>
          </tr>
        </thead>
        <tbody>
          {WIERSZE_PAKIETU.map((wiersz) => {
            const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[wiersz.cad];
            const zeStanem = maStanLaczeniowy(wiersz.cad);
            return (
              <tr key={wiersz.cad} data-testid={`pack-row-${wiersz.cad}`} data-verification={def.verificationStatus}>
                <td style={STYL_KOMORKI}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{wiersz.lp} · {def.polishName}</div>
                  <div style={{ fontSize: 11, color: paleta.kreskaWygaszona, marginTop: 4 }}>{def.domainType}</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>{def.standardReference}</div>
                  <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>{def.symbolId} · {def.verificationStatus}</div>
                </td>
                <td style={STYL_KOMORKI}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <KomorkaObecna wiersz={wiersz} state="closed" />
                    {zeStanem && wiersz.obecny !== null && wiersz.obecny !== 'kropka' && <KomorkaObecna wiersz={wiersz} state="open" />}
                  </div>
                  <div style={{ fontSize: 11, color: paleta.kreskaWygaszona, marginTop: 4, maxWidth: 220 }}>{wiersz.obecnyOpis}</div>
                </td>
                <td style={STYL_KOMORKI}>
                  <KomorkaCad id={wiersz.cad} state="closed" siatka testId={`pack-cad-${wiersz.cad}-closed`} />
                </td>
                <td style={STYL_KOMORKI}>
                  {zeStanem ? <KomorkaCad id={wiersz.cad} state="open" siatka testId={`pack-cad-${wiersz.cad}-open`} /> : <div style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>bez stanu łączeniowego</div>}
                </td>
                <td style={STYL_KOMORKI}>
                  {zeStanem ? <KomorkaCad id={wiersz.cad} state="unknown" siatka testId={`pack-cad-${wiersz.cad}-unknown`} /> : <div style={{ fontSize: 11, color: paleta.kreskaWygaszona }}>—</div>}
                </td>
                <td style={{ ...STYL_KOMORKI, fontSize: 12, maxWidth: 320 }}>
                  <div>{wiersz.uwagi}</div>
                  <div style={{ fontSize: 11, color: paleta.kreskaWygaszona, marginTop: 6 }}>{def.notes}</div>
                  <div style={{ fontSize: 11, color: paleta.kreskaWygaszona, marginTop: 6 }}>
                    gabaryt {def.nominalWidth}×{def.nominalHeight} u · min {def.minimumSizePx} px · LOD: {def.lodPolicy} · zaciski: {def.terminals.map((t) => `${t.name}(${t.x},${t.y})`).join(' ')}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Rozpoznanie(): JSX.Element {
  const KOL = 6;
  const SZER = 176;
  const WYS = 232;
  return (
    <div style={{ padding: 24, color: paleta.kreskaBazowa, fontFamily: 'Inter, "Segoe UI", Arial, sans-serif', background: paleta.tlo }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Tablica rozpoznawalności symboli — bez etykiet (R2 §22, mono)</h1>
      <svg width={KOL * SZER} height={Math.ceil(TABLICA_ROZPOZNANIA.length / KOL) * WYS} data-testid="symbol-pack-rozpoznanie" style={{ display: 'block', background: paleta.tlo }}>
        {TABLICA_ROZPOZNANIA.map((poz, i) => {
          const def = ELECTRICAL_CAD_SYMBOL_REGISTRY[poz.cad];
          const cx = (i % KOL) * SZER + SZER / 2;
          const cy = Math.floor(i / KOL) * WYS + 28;
          return (
            <g key={`${poz.cad}-${poz.state}-${i}`} data-pack-pozycja={i + 1} data-pack-cell={poz.cad} data-pack-state={poz.state}>
              <text x={(i % KOL) * SZER + 12} y={Math.floor(i / KOL) * WYS + 18} fontSize={11} fill={paleta.kreskaWygaszona}>{i + 1}</text>
              <CadSymbol id={poz.cad} x={cx - (def.nominalWidth * S) / 2} y={cy} scale={S} state={poz.state} ink={paleta.kreskaBazowa} paper={paleta.tlo} strokePx={KRESKA_PX} wnetrze={ZNAKI_PRZYKLADOWE[poz.cad]} />
            </g>
          );
        })}
      </svg>
      <p style={{ fontSize: 11, color: paleta.kreskaWygaszona, marginTop: 12 }}>
        Stany na tablicy: {TABLICA_ROZPOZNANIA.filter((p) => p.state !== 'closed').length} pozycji w stanie innym niż {NAZWA_STANU.closed}. Klucz odpowiedzi w dokumencie pakietu.
      </p>
    </div>
  );
}

function HarnessRoot(): JSX.Element {
  return (
    <div
      id="symbol-pack-root"
      data-testid="symbol-pack-root"
      data-status="ok"
      data-tryb={tryb}
      data-mono={mono ? 'true' : 'false'}
      data-theme-mode={theme}
      style={{ background: paleta.tlo, minHeight: '100vh' }}
    >
      {tryb === 'rozpoznanie' ? <Rozpoznanie /> : <Pakiet />}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('sld-symbol-pack-harness: brak elementu #root');
rootEl.style.background = paleta.tlo;
createRoot(rootEl).render(<HarnessRoot />);
