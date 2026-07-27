/**
 * SLD V3 — typografia i deterministyczny pomiar tekstu (SLD_CAD_SPEC_V3 §2, P7).
 *
 * Layout NIE mierzy tekstu w DOM — używa deterministycznej formuły (jedna
 * prawda dla buildu, testów node'owych i renderu), żeby ten sam ENM dawał
 * identyczną geometrię wszędzie. Formuła skalibrowana dla sans-serif
 * (średnia szerokość glifu ≈ 0.62 × fontSize; cyfry/wielkie litery szersze —
 * współczynnik obejmuje typowe etykiety energetyczne PL).
 */

export type LabelClass = 't1' | 't2' | 't3' | 't4';

export interface LabelTypography {
  readonly fontSize: number;
  readonly fontWeight: number;
}

/** Jedyne dozwolone klasy typograficzne rysunku (spec §2). */
export const LABEL_TYPOGRAPHY: Readonly<Record<LabelClass, LabelTypography>> = {
  t1: { fontSize: 13, fontWeight: 700 }, // nazwy stacji / GPZ
  t2: { fontSize: 11, fontWeight: 600 }, // parametry: kVA, typ·przekrój·długość, kV
  t3: { fontSize: 9, fontWeight: 700 },  // podpisy portów (kier./odg.), oznaczniki Q/T
  t4: { fontSize: 8, fontWeight: 600 },  // adnotacje
};

/**
 * Próg CZYTELNOŚCI pisma w pikselach EKRANU (V12K-218, karta R2-B audytu).
 *
 * Poniżej tej wysokości tekst przestaje być tekstem — staje się szarym pyłem,
 * który zaśmieca rysunek, niczego nie komunikując. Audyt R2 zmierzył, że przy
 * wpasowaniu sieci 52 stacji w kadr 1920 px skala spada do ≈0,17, więc etykieta
 * t1 (13 px świata) ma na ekranie 2,2 px, a t4 — 1,4 px. Dotyczy KAŻDEGO
 * poziomu detalu, bo fit-to-content dużej sieci schodzi poniżej wszystkich
 * progów histerezy LOD (`canvas/camera.ts`), dla których dobierano rozmiary.
 *
 * 6 px to granica, przy której pojedyncze znaki są jeszcze rozróżnialne jako
 * kształty. Wartość ŚWIADOMIE niższa niż dolna granica komfortu czytania z
 * modelu histerezy (t2 ≈ 11 px ekranu przy wejściu w L2): tam chodzi o
 * czytanie łańcuchów parametrów, tu wyłącznie o to, czy element jest jeszcze
 * pismem, czy już artefaktem.
 *
 * Egzekwowane w WARSTWIE RENDERU (`canvas/SldCanvasV3.tsx`), nie w scenie:
 * scena musi zostać deterministyczna (te same wejścia = ten sam hash), a próg
 * zależy od kamery, która do sceny nie należy.
 */
export const MIN_READABLE_LABEL_SCREEN_PX = 6;

/** Czy etykieta danej klasy jest czytelna przy tej skali kamery [px ekranu na
 *  jednostkę świata]. Skala niewiarygodna (≤0, NaN — np. viewport 0×0 przed
 *  pierwszym pomiarem układu) NIE ukrywa niczego: brak pomiaru nie jest
 *  dowodem nieczytelności. */
export function isLabelReadableAtScale(cls: LabelClass, scale: number): boolean {
  if (!Number.isFinite(scale) || scale <= 0) return true;
  return LABEL_TYPOGRAPHY[cls].fontSize * scale >= MIN_READABLE_LABEL_SCREEN_PX;
}

/**
 * Liczba w POLSKIM zapisie rysunku: całkowita bez miejsc dziesiętnych („20"),
 * ułamkowa z PRZECINKIEM („0,4", „10,5", „9,62"). Bez zer nieznaczących.
 *
 * DLACZEGO TU, A NIE PRZY KAŻDEJ ETYKIECIE. Rysunek miał trzy równoległe
 * konwencje: tabliczka danych systemu formatowała po polsku („Ik″ 9,62 kA"),
 * etykieta linii tak samo („10,5 kV"), a etykiety szyn wstawiały liczbę
 * SUROWO — więc szyna nN wychodziła jako „Szyna nN · 0.4 kV" (kropka), obok
 * „Odbiór ΣP 0,4 MW" (przecinek) w tej samej tabliczce stacji. Zmierzone na
 * zrzucie audytu V12K-234. Jedna funkcja zamiast trzech konwencji.
 *
 * Zaokrąglenie do DWÓCH miejsc, nie jednego: szyna 0,69 kV nie może stać się
 * „0,7 kV" — zaokrąglenie napięcia znamionowego to zmiana danej, nie zapisu.
 *
 * Szerokość etykiety liczy `measureLabelWidth` z DŁUGOŚCI tekstu, a przecinek
 * i kropka mają tę samą długość — więc ta konwencja nie rusza geometrii ani
 * hashy sceny.
 */
export function liczbaRysunkuPl(value: number): string {
  if (Number.isInteger(value)) return value.toFixed(0);
  // Zera nieznaczace usuwane WSZYSTKIE, nie jedno: `replace(/0$/, '')` zostawialo
  // „12,0" dla 11.999 i „0,0" dla 0.001 — a wartosc NIEZEROWA pokazana jako zero to
  // dokladnie to, czego kanon zabrania. Po obcieciu zer moze zostac sama czesc
  // calkowita (wtedy nie ma przecinka).
  const dwaMiejsca = value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return dwaMiejsca.replace('.', ',');
}

const AVG_GLYPH_WIDTH_FACTOR = 0.62;

/** Deterministyczna szerokość etykiety [px świata]. */
export function measureLabelWidth(text: string, cls: LabelClass): number {
  return Math.ceil(text.length * LABEL_TYPOGRAPHY[cls].fontSize * AVG_GLYPH_WIDTH_FACTOR);
}

/** Wysokość wiersza etykiety [px świata] (fontSize + interlinia). */
export function labelLineHeight(cls: LabelClass): number {
  return LABEL_TYPOGRAPHY[cls].fontSize + 6;
}
