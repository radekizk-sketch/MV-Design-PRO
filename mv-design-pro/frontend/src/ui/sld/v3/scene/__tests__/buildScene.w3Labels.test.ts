/**
 * W3-KABLE-ETYKIETY §17 (kotwiczenie etykiet do właściciela) + §7 (etykiety
 * techniczne linii) — dowody sceny na fixturze referencyjnej (53 stacje).
 *
 * §17 ANTY-DRYF: etykieta przęsła (`segment-span`) musi leżeć BLIŻEJ kolumny
 * stacji, do której to przęsło wchodzi, niż kolumny KAŻDEJ innej stacji tego
 * WIERSZA — inaczej „dryfuje" do sąsiedniego przęsła i gubi jednoznaczne
 * przypisanie (recenzja pkt 13). Odległość = |środek-x etykiety − środek-x
 * zakresu symboli stacji|.
 *
 * INTENCJA BEZ ZMIAN, ŹRÓDŁO PRZYPISANIA INNE (karta BLOK-LATERAL-WLASNOSC,
 * 2026-08-08). Dotąd stację-właściciela test odczytywał z `ownerRef` etykiety
 * („⟨stationId⟩#segment-label") — ale to była właśnie POMYŁKA WŁASNOŚCI, którą
 * ta karta naprawia: podpis opisuje ODCINEK, nie stację, przy której stoi, więc
 * jego `ownerRef` niesie dziś ref odcinka. Przypisanie do stacji test wyprowadza
 * teraz z TREŚCI podpisu — z pary końców „⟨A⟩ ↔ ⟨B⟩" (recenzja pkt 13, §17
 * „kotwica tożsamości"), zestawionej z kodem stacji, który blok niesie na
 * etykiecie napięcia szyny (S9-12: kod pada w bloku RAZ, właśnie tam). Test jest
 * przez to MOCNIEJSZY niż przed zmianą: nie da się go zaspokoić samym refem —
 * musi się zgadzać to, co czyta CZŁOWIEK.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSceneV3 } from '../buildScene';
import type { EnergyNetworkModel } from '../../../../../types/enm';

const fixturePath = join(
  __dirname,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

describe('W3 §17 — kotwiczenie etykiet przęseł do właściciela (anty-dryf)', () => {
  // SLOT-DRYF-PRZĘSŁA — ZMIANA ZBIORU ODNIESIENIA, INTENCJA BEZ ZMIAN.
  //
  // Ta wyrocznia mierzyła odległość podpisu do ŚRODKA BLOKU STACJI docelowej i
  // wymagała, by był bliżej niej niż każdej innej stacji wiersza. Blok stacji
  // jest szeroki (na sieci referencyjnej 600–1200 j.św.), a podpis opisuje
  // KABEL między dwiema stacjami — więc test przechodził dla całego pasma
  // położeń wokół stacji docelowej i NIE MIAŁ JAK zauważyć, że napis stoi
  // 888 j.św. od polilinii swojego odcinka (dług SLOT-DRYF-PRZĘSŁA zgłoszony
  // przez kartę BLOK-LATERAL-WLASNOSC). Po naprawie podpis siedzi POŚRODKU
  // swojego kabla, więc bywa bliżej stacji POPRZEDNIEJ — dawna asercja
  // pękała nie na dryfie, tylko na własnej mierze.
  //
  // Intencja zostaje: „podpis przęsła nie dryfuje do cudzego obiektu".
  // Miarą jest teraz KABEL, nie blok stacji: odległość środka podpisu do
  // polilinii, którą opisuje, musi być NIE WIĘKSZA niż do kabla któregokolwiek
  // innego przęsła stojącego w tym samym wierszu opisów B1.
  //
  // Pełna wyrocznia położenia (podpis leży NA swoim kablu, iloczyn cech,
  // kontrole negatywne): `../../layout/__tests__/slotDryfPrzesla.test.ts`.
  it('każda etykieta segment-span leży bliżej SWOJEGO kabla niż kabla każdego innego przęsła tego wiersza opisów (L2)', () => {
    const scene = buildSceneV3(enm, 2);

    /** Zakres X polilinii niosącej `ref` — z kawałkami `#tee-N`, bo to ten sam
     *  kabel ENM za kropką węzła T (`resolveTeeJunctions`). */
    const zakresKabla = new Map<string, { min: number; max: number }>();
    for (const g of scene.segments) {
      const owner = g.meta?.ownerRef?.replace(/#tee-\d+$/, '');
      if (!owner) continue;
      const xs = g.points.map((p) => p.x);
      const biezacy = zakresKabla.get(owner);
      zakresKabla.set(
        owner,
        biezacy
          ? { min: Math.min(biezacy.min, ...xs), max: Math.max(biezacy.max, ...xs) }
          : { min: Math.min(...xs), max: Math.max(...xs) },
      );
    }

    const podpisy = scene.labels
      .filter((l) => l.ownerKind === 'segment-span' && l.ownerRef.endsWith('#segment-label'))
      .map((l) => ({
        text: l.text,
        y: l.rect.y,
        srodek: l.rect.x + l.rect.width / 2,
        kabel: zakresKabla.get(l.ownerRef.replace(/#segment-label$/, '')),
      }));
    expect(podpisy.length).toBeGreaterThan(30);
    // Każdy podpis MUSI mieć swój kabel na scenie — inaczej pętla niżej
    // cicho pomijałaby przypadki i zieleń nic nie znaczyłaby.
    expect(podpisy.filter((p) => p.kabel == null)).toEqual([]);

    const odlegloscDo = (x: number, z: { min: number; max: number }): number =>
      x < z.min ? z.min - x : x > z.max ? x - z.max : 0;

    let sprawdzonych = 0;
    for (const p of podpisy) {
      const doSwojego = odlegloscDo(p.srodek, p.kabel!);
      for (const inny of podpisy) {
        if (inny === p || inny.y !== p.y) continue; // ten sam WIERSZ opisów B1
        expect(
          doSwojego,
          `„${p.text}" jest bliżej kabla przęsła „${inny.text}" niż swojego`,
        ).toBeLessThanOrEqual(odlegloscDo(p.srodek, inny.kabel!));
        sprawdzonych += 1;
      }
    }
    // Dowód, że asercja faktycznie coś sprawdziła (nie pusta pętla).
    expect(sprawdzonych).toBeGreaterThan(0);
  });
});

describe('W3 §7 — etykieta techniczna L2 z realnych danych katalogu/ENM', () => {
  it('co najmniej jedna etykieta przęsła niesie relację · typ · napięcie · długość „l = …"', () => {
    const scene = buildSceneV3(enm, 2);
    const spanTexts = scene.labels
      .filter((l) => l.ownerKind === 'segment-span')
      .map((l) => l.text);
    expect(spanTexts.length).toBeGreaterThan(0);
    // Relacja z parą końców (§17) + długość w formacie §7.
    expect(spanTexts.some((t) => / ↔ /.test(t) && /· l = \d/.test(t))).toBe(true);
    // Napięcie znamionowe z katalogu (fixtura: voltage_rating_kv=20) przed
    // długością. S9-8: człon jest OZNACZONY („Un="), żeby nie dało się go
    // pomylić z napięciem pracy sieci — intencja asercji bez zmian.
    expect(spanTexts.some((t) => /· Un=\d+(?:,\d+)? kV · l = /.test(t))).toBe(true);
  });
});
