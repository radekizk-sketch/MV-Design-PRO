/**
 * PROPORCJE — DOPISEK POMIAROWY do stopki zrzutu (karta PROPORCJE, 2026-08-07).
 *
 * Zrzuty pary PRZED/PO powstają z TEGO SAMEGO skryptu `render_b2_kotwica.tsx`
 * uruchomionego na dwóch drzewach (bazowym i naprawionym), na TEJ SAMEJ parze
 * migawek z żywego backendu i przy TYM SAMYM kadrze kamery. Ten skrypt dokłada
 * do stopki TRZECI wiersz z proporcjami zmierzonymi dla danego drzewa
 * (`scripts/pomiar_proporcje.tsx`), żeby obraz i liczba stały obok siebie —
 * to była wada zrzutu, z którego wyszło zgłoszenie: stopka podawała skalę,
 * której rysunek nad nią nie dotyczył.
 *
 * Uruchomienie:
 *   node scripts/opisz_proporcje.mjs <katalog-svg> "<treść wiersza>"
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [dir, tekst] = process.argv.slice(2);
if (!dir || !tekst) {
  console.error('użycie: node scripts/opisz_proporcje.mjs <katalog-svg> "<treść>"');
  process.exit(2);
}
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
for (const nazwa of readdirSync(dir).filter((n) => n.endsWith('.svg'))) {
  const sciezka = resolve(dir, nazwa);
  const svg = readFileSync(sciezka, 'utf8');
  // Wysokość zewnętrznego SVG = kadr + stopka; trzeci wiersz stopki ląduje
  // 22 px pod drugim (te same odstępy co w `render_b2_kotwica.tsx`).
  const m = /<svg[^>]*height="(\d+)"/.exec(svg);
  if (!m) { console.error('pominięto (brak wysokości):', nazwa); continue; }
  const h = Number(m[1]);
  const wiersz =
    `<text x="16" y="${h - 4}" font-family="system-ui,sans-serif" font-size="14" `
    + `fill="${nazwa.includes('jasny') ? '#1F2933' : '#9AA7B4'}">${esc(tekst)}</text>`;
  writeFileSync(sciezka, svg.replace(/<\/svg>$/, `${wiersz}</svg>`), 'utf8');
  console.log('opisano', nazwa);
}
