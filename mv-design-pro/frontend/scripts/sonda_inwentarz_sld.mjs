/**
 * SONDA INWENTARYZACYJNA SLD (audyt powykonawczy, runda R3 — „czego brakuje").
 *
 * UWAGA (V12K-214, wycofanie rundy R3): pierwsza wersja tej sondy pytała o dane
 * ZGADYWANYMI nazwami pól i wzorcami tekstu i dawała FAŁSZYWE NEGATYWY — przegapiła
 * pole `state` na aparatach (regex nie łapał słowa „state") oraz `uk 11%` na tabliczce
 * (regex wymagał „%" wprost po „uk"). Na tej podstawie postawiono trzy nieprawdziwe
 * zarzuty. Od tej wersji sonda WYPISUJE PEŁNE INWENTARZE zamiast odpowiadać JEST/BRAK:
 * wszystkie klucze obiektów i pełny tekst etykiet. Czytający wyciąga wnioski sam.
 * Druga lekcja: to jest sonda MODELU SCENY. Kolor, paleta, ramka i tabelka żyją w
 * RENDERZE (`SldCanvasV3.tsx`, `sheet/Frame.tsx`, `export/exportPalette.ts`) — brak
 * pola tutaj NIE dowodzi braku na rysunku.
 *
 * Nie jest bramką i nie wchodzi do CI. Odpowiada na jedno pytanie audytowe:
 * CO MODEL NIESIE, A RYSUNEK POMIJA. Porównuje inwentarz sceny (symbole,
 * etykiety, kolory) z inwentarzem modelu ENM sieci wzorcowej, żeby braki
 * wynikały z pomiaru, a nie z wrażenia z oględzin.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene.ts';

const here = dirname(fileURLToPath(import.meta.url));
const enm = JSON.parse(
  readFileSync(
    resolve(here, '..', 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
    'utf8',
  ),
).enm;

const licz = (xs, f) => {
  const m = new Map();
  for (const x of xs) {
    const k = f(x);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const pokaz = (tytul, pary, limit = 40) => {
  console.log(`\n=== ${tytul} (${pary.length} rodzajów) ===`);
  for (const [k, n] of pary.slice(0, limit)) console.log(`  ${String(n).padStart(5)}  ${k}`);
  if (pary.length > limit) console.log(`  … +${pary.length - limit}`);
};

const scena = buildSceneV3(enm, 2);

pokaz('SYMBOLE W SCENIE (L2)', licz(scena.symbols, (s) => s.symbolId));
pokaz('ETYKIETY W SCENIE (L2) wg ownerKind', licz(scena.labels, (l) => l.ownerKind));

// --- KOLOR: czy rysunek koduje poziom napięcia? -----------------------------
const kolorySeg = licz(scena.segments, (s) => s.stroke ?? s.style ?? s.kind ?? '(brak)');
pokaz('KOLORY/STYLE ODCINKÓW (tor pierwotny)', kolorySeg);
const napieciaModel = licz(enm.buses ?? [], (b) => `${b.voltage_kv} kV`);
pokaz('POZIOMY NAPIĘCIA W MODELU (szyny ENM)', napieciaModel);

// --- CO MODEL NIESIE: inwentarz ENM ----------------------------------------
console.log('\n=== INWENTARZ MODELU ENM (sieć wzorcowa) ===');
const kolekcje = [
  'buses', 'branches', 'transformers', 'switches', 'loads', 'sources',
  'generators', 'measurements', 'protections', 'stations', 'shunts',
  'surge_arresters', 'capacitors', 'reactors',
];
for (const k of kolekcje) {
  const v = enm[k];
  if (Array.isArray(v)) console.log(`  ${String(v.length).padStart(5)}  ${k}`);
}
const klucze = Object.keys(enm).filter((k) => !kolekcje.includes(k));
console.log(`  pozostałe klucze ENM: ${klucze.join(', ')}`);

// --- PEŁNE INWENTARZE (zamiast pytań JEST/BRAK — patrz nagłówek) -----------
console.log('\n=== WSZYSTKIE KLUCZE SYMBOLU (unia po symbolach sceny) ===');
const kluczeSym = new Set();
for (const s2 of scena.symbols) {
  for (const k of Object.keys(s2)) kluczeSym.add(k);
  for (const k of Object.keys(s2.meta ?? {})) kluczeSym.add('meta.' + k);
}
console.log('  ' + [...kluczeSym].sort().join(', '));

console.log('\n=== WSZYSTKIE KLUCZE ODCINKA (unia po odcinkach sceny) ===');
const kluczeSeg = new Set();
for (const g of scena.segments) {
  for (const k of Object.keys(g)) kluczeSeg.add(k);
  for (const k of Object.keys(g.meta ?? {})) kluczeSeg.add('meta.' + k);
}
console.log('  ' + [...kluczeSeg].sort().join(', '));

pokaz('STAN APARATÓW ŁĄCZNIKOWYCH (pole `state`)', licz(
  scena.symbols.filter((s2) => /breaker|disconnector|loadBreakSwitch|earthSwitch|fuseSwitch/.test(s2.symbolId)),
  (s2) => `${s2.symbolId} :: state=${s2.state ?? '(undefined)'}`,
));

console.log('\n=== PEŁNY TEKST ETYKIET wg kategorii (próbka 6 na kategorię) ===');
const wgKat = new Map();
for (const l of scena.labels) {
  const k = l.ownerKind ?? '(brak)';
  if (!wgKat.has(k)) wgKat.set(k, []);
  const lista = wgKat.get(k);
  if (lista.length < 6) lista.push(String(l.text ?? ''));
}
for (const [k, v] of wgKat) console.log(`  [${k}] ${v.map((t) => `"${t}"`).join(' · ')}`);
