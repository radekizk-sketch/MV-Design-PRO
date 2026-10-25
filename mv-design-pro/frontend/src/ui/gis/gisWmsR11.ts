/** Parser lokalnego GetCapabilities WMS 1.3.0, bez HTTP.
 * Dostępność i wiarygodność dokumentu nie zostały zweryfikowane.
 */
export type NazwaWarstwyR11 = { name: string; title: string };
export class BladWmsR11 extends Error {
  constructor(public readonly kod: string) { super(kod); }
}
const children = (node: Element, localName: string): Element[] =>
  Array.from(node.children).filter((x) => x.localName === localName);
const childText = (node: Element, localName: string): string =>
  children(node, localName)[0]?.textContent?.trim() ?? '';

export function odczytajWarstwyWms(xml: string): NazwaWarstwyR11[] {
  if (xml.length === 0 || xml.length > 250_000 ||
      /<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) throw new BladWmsR11('XML_NIEDOZWOLONY');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 ||
      doc.documentElement.localName !== 'WMS_Capabilities' ||
      doc.documentElement.getAttribute('version') !== '1.3.0') {
    throw new BladWmsR11('NIEZGODNY_WMS_1_3_0');
  }
  const capability = children(doc.documentElement, 'Capability')[0];
  const top = capability && children(capability, 'Layer')[0];
  if (!top) throw new BladWmsR11('BRAK_WARSTW');
  const out: NazwaWarstwyR11[] = [];
  const ids = new Set<string>();
  let count = 0;
  const walk = (node: Element, inherited: boolean, depth: number): void => {
    if (++count > 2000 || depth > 24) throw new BladWmsR11('ZBYT_ZLOZONY_WMS');
    const supports = inherited || children(node, 'CRS')
      .some((x) => x.textContent?.trim() === 'EPSG:3857');
    const name = childText(node, 'Name');
    if (name && supports) {
      if (!/^[A-Za-z0-9_.:,-]{1,160}$/.test(name) || ids.has(name)) {
        throw new BladWmsR11('NAZWA_WARSTWY_NIEDOZWOLONA');
      }
      ids.add(name);
      out.push({ name, title: childText(node, 'Title').slice(0, 160) || name });
    }
    for (const next of children(node, 'Layer')) walk(next, supports, depth + 1);
  };
  walk(top, false, 0);
  return out;
}
