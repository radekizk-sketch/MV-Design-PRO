/**
 * Identyfikator elementu w GRAFIE obliczeniowym dla `ref_id` modelu ENM.
 *
 * DLACZEGO TEN PLIK ISTNIEJE. Wyniki rozpływu mocy (`PowerFlowResultV1`: `bus_id`,
 * `branch_id` — kontrakt FROZEN), wyniki zwarciowe (`target_id`), walidacja
 * energetyczna (`target_id`), ocena techniczna (`element_id`), łuk elektryczny
 * (`bus_ref`) i badania zaczepów niosą identyfikator węzła/gałęzi GRAFU, a nie
 * `ref_id` modelu. Backend wyprowadza go JEDNĄ regułą:
 * `backend/src/enm/mapping.py::ref_to_graph_id` = `uuid5(NAMESPACE_DNS, ref_id)`.
 * Migawka modelu po stronie interfejsu zna `ref_id` i nazwę elementu, ale nie zna
 * identyfikatora grafu — więc bez tej reguły ekran wyników pokazywał projektantowi
 * `63203cbc-ac91-5100-a0ee-a275d24514ff` zamiast „Szyna SN".
 *
 * Reguła jest LUSTREM backendu, nie drugą konwencją: parytet pilnuje
 * `ui2/wyniki/wzorzec/__tests__/mostNazw.test.ts` na parach (ref_id → identyfikator
 * grafu) policzonych przez `ref_to_graph_id` w eksporcie fikstur
 * (`harness-fixtures/generated/identyfikatory_grafu.json`). Zmiana reguły w backendzie
 * zapala czerwień tutaj, zanim wyniki wrócą na ekran jako UUID.
 *
 * UUID wersji 5 (RFC 4122 §4.3): SHA-1 z (bajty przestrzeni nazw ‖ bajty UTF-8 nazwy),
 * pierwsze 16 bajtów, nibble wersji = 5, bity wariantu = 10. SHA-1 policzony tu wprost
 * (synchronicznie — `crypto.subtle` jest asynchroniczne, a most nazw działa w renderze);
 * to nie jest kryptografia bezpieczeństwa, tylko deterministyczne odwzorowanie nazw.
 */

/** Przestrzeń nazw DNS z RFC 4122 (`uuid.NAMESPACE_DNS` w Pythonie). */
const PRZESTRZEN_DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function bajtyUuid(uuid: string): number[] {
  const hex = uuid.replace(/-/g, '');
  const bajty: number[] = [];
  for (let i = 0; i < 32; i += 2) bajty.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return bajty;
}

function bajtyUtf8(tekst: string): number[] {
  return Array.from(new TextEncoder().encode(tekst));
}

function obroc(wartosc: number, przesuniecie: number): number {
  return ((wartosc << przesuniecie) | (wartosc >>> (32 - przesuniecie))) >>> 0;
}

/** SHA-1 (FIPS 180-4) z tablicy bajtów — 20 bajtów skrótu. */
function sha1(wiadomosc: readonly number[]): number[] {
  const dlugoscBitow = wiadomosc.length * 8;
  const dane = [...wiadomosc, 0x80];
  while (dane.length % 64 !== 56) dane.push(0);
  // Długość wiadomości w bitach jako 64-bitowa liczba big-endian (górne 32 bity = 0
  // dla wiadomości krótszych niż 512 MiB — identyfikatory mają dziesiątki bajtów).
  dane.push(0, 0, 0, 0);
  dane.push((dlugoscBitow >>> 24) & 0xff, (dlugoscBitow >>> 16) & 0xff, (dlugoscBitow >>> 8) & 0xff, dlugoscBitow & 0xff);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Array<number>(80);
  for (let blok = 0; blok < dane.length; blok += 64) {
    for (let t = 0; t < 16; t += 1) {
      const i = blok + t * 4;
      w[t] = ((dane[i] << 24) | (dane[i + 1] << 16) | (dane[i + 2] << 8) | dane[i + 3]) >>> 0;
    }
    for (let t = 16; t < 80; t += 1) w[t] = obroc(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t += 1) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (obroc(a, 5) + (f >>> 0) + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = obroc(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const skrot: number[] = [];
  [h0, h1, h2, h3, h4].forEach((h) => {
    skrot.push((h >>> 24) & 0xff, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff);
  });
  return skrot;
}

/** `uuid5(NAMESPACE_DNS, refId)` — identyfikator elementu w grafie obliczeniowym. */
export function identyfikatorGrafu(refId: string): string {
  const skrot = sha1([...bajtyUuid(PRZESTRZEN_DNS), ...bajtyUtf8(refId)]).slice(0, 16);
  skrot[6] = (skrot[6] & 0x0f) | 0x50;
  skrot[8] = (skrot[8] & 0x3f) | 0x80;
  const hex = skrot.map((bajt) => bajt.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
