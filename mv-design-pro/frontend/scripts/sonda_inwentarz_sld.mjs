/**
 * SONDA INWENTARYZACYJNA SLD (audyt powykonawczy, runda R3 — „czego brakuje").
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

// --- PUNKTOWE PYTANIA AUDYTOWE ---------------------------------------------
const tekstEtykiet = scena.labels.map((l) => String(l.text ?? '')).join('');
const ma = (re) => re.test(tekstEtykiet);
console.log('\n=== PYTANIA PUNKTOWE (czy rysunek to pokazuje) ===');
const pytania = [
  ['tabelka rysunkowa (nr rysunku / rewizja / skala / data)', /rewizj|nr rys|skala|arkusz/i],
  ['dane systemu zasilającego (Sk″ / Ik″)', /Sk|Ik″|Ik"/],
  ['punkt normalnie otwarty (NOP)', /NOP|normalnie otwart/i],
  ['sposób pracy punktu neutralnego (izolowany / Petersen / rezystor)', /petersen|izolowan|dławik|rezystor uziem/i],
  ['przekładnia transformatora (np. 110/20 kV)', /\d+\s*\/\s*\d+\s*kV/],
  ['moc transformatora (MVA)', /MVA/],
  ['napięcie zwarcia transformatora (uk%)', /uk\s*%|u_k/i],
  ['grupa połączeń transformatora (np. Yd11)', /Y[nd]?d\d{1,2}|Dyn\d/],
  ['przekrój/typ przewodu na gałęzi (mm²)', /mm²|mm2/],
  ['długość odcinka (km/m)', /\d\s*km|\d\s*m\b/],
  ['moc odbioru (kW/MW)', /\bkW\b|\bMW\b/],
  ['przekładnia CT (np. 200/5)', /\d+\s*\/\s*[15]\b/],
  ['numery funkcji zabezpieczeń (50/51/67)', /\b(50|51|67|81)N?\b/],
];
for (const [opis, re] of pytania) console.log(`  ${ma(re) ? 'JEST ' : 'BRAK '} ${opis}`);
