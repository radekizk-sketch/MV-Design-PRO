# PROMPT WYKONAWCZY — SLD PRO: SWEEP JĘZYKA WIZUALNEGO (kontynuacja)

Do wklejenia jako pierwsza wiadomość nowej sesji. Kontynuuje program „SLD ma wyglądać
i działać jak produkt klasy ETAP/DIgSILENT" po iteracjach 1–2 (feel + strażnik).

<rola>
Jesteś zespołem ekspertów energetyki (projektant SLD z biura projektowego,
dyspozytor SCADA OSD, architekt HMI) wykonującym sweep normalizacyjny języka
wizualnego SLD v2. Nadrzędne zobowiązanie: uczciwe bramki i render-weryfikacja
KAŻDEJ zmiany wizualnej (obejrzyj PNG zanim uznasz za done).
</rola>

<kontekst>
- Repo: MV-Design-PRO, branch `claude/zealous-bardeen-xrqtp`; frontend
  `mv-design-pro/frontend`, ścieżka SLD v2: `src/ui/sld/v2/`.
- WIĄŻĄCY standard: `mv-design-pro/docs/sld/SLD_PRO_STANDARD_2026-07.md`
  (przeczytaj w całości ZANIM cokolwiek zmienisz).
- Zrobione: §2 feel (commit ca770c2c: płynny zoom CSS, pan-anywhere, hover);
  §7 strażnik `src/ui/sld/v2/__tests__/visualCanon.guard.test.ts` (ratchet
  literałów hex: total 1157 + budżety per plik — aktualizuj TYLKO W DÓŁ).
- Diagnoza: 1157 literałów hex poza tokens.ts, 30 grubości kreski, 19 fontów;
  trzy dialekty wizualne (GPZ / stacja / OZE).
</kontekst>

<zakres>
Sweep per-renderer, w kolejności standardu §3 (od największego dłużnika):
1. `canvas/SldDetailDrawer.tsx` (190) 2. `renderer/MiniBlockRmuRenderer.tsx` (109)
3. `station-rozdzielnia/OzeSourceArchetype.tsx` (74) 4. `renderer/CableRunRenderer.tsx` (68)
5. `canvas/SldCanvasV2.tsx` (59) 6. `canvas/SldTitleBlock.tsx` (47)
7. `renderer/StationOnRunRenderer.tsx` (37) 8. `renderer/DerRenderer.tsx` (34)
9. `renderer/GpzCanonicalRenderer.tsx` (33) 10. pozostałe wg budżetów strażnika.

Dla KAŻDEGO pliku (jedna iteracja pętli = jeden plik = jeden commit):
a) Zamień literały hex na tokeny z `theme/tokens.ts`; brakujący semantycznie kolor →
   NOWY token z komentarzem (nie literał). Odcienie „prawie równe" tokenowi → token
   (konsolidacja, nie mnożenie bytów).
b) Znormalizuj grubości kreski do kanonu `SLD_STROKE_PX` + `getDeviceStyle()`
   (grubość koduje rolę: szyna/tor/odgałęzienie/aparat/detal — standard §4).
c) Znormalizuj rozmiary fontów do skali `FONT_SIZES` (standard §5). UWAGA: rozmiar
   wpływa na declutter/clipping — po zmianie obowiązkowa render-weryfikacja.
d) RENDER-WERYFIKACJA: harness `screenshot-harness.html` (headless Chromium,
   `npx vite --port 5199`, fixtura `public/test-fixtures/sldSubstrate52s.enm.json`
   + `.powerflow.json`), widoki L0 + L1 + zoom stacji + GPZ → OBEJRZYJ PNG:
   zero kolizji etykiet, hierarchia kreski czytelna, brak regresji vs poprzedni
   render. Skrypty tymczasowe usuń przed commitem.
e) Obniż budżety w `visualCanon.guard.test.ts` do nowych wartości (ratchet w dół).
f) Bramka pełna: `npm run type-check`; eslint zmienionych plików → 0;
   `npx vitest run src/ui/sld/v2 --no-file-parallelism` → wszystkie zielone
   (testy assertujące stare kolory/grubości zaktualizuj z zachowaniem intencji);
   guardy `no_codenames_guard.py`, `forbidden_ui_terms_guard.py`, `docs_guard.py`.
g) Commit (jeden plik-sweep = jeden commit) + push z retry.
</zakres>

<ograniczenia_twarde>
- ZERO fałszywego greena; zakaz osłabiania asercji „żeby przeszło".
- Zero zmian geometrii/topologii/fizyki — sweep dotyczy WYŁĄCZNIE stylu
  (kolor/kreska/font). Inwariant tokens.ts: styl nie zmienia geometrii.
- Determinizm (czyste funkcje danych, stabilne hashe SLD).
- Zero bytów równoległych: nie tworzyć drugiej palety/skali obok tokens.ts.
- Chirurgiczne diffy; polskie etykiety UI; zakaz codenames.
</ograniczenia_twarde>

<definicja_ukonczenia>
Sweep DONE, gdy: total ratchet ≤ 200 (z 1157), wszystkie budżety per plik z topki
≤ 10, grubości kreski w v2 ⊆ kanon (≤ 7 wartości), fonty ⊆ skala (≤ 6 wartości),
rendery L0/L1/stacja/GPZ obejrzane i czyste (zero kolizji), pełne bramki zielone,
wszystko wypchnięte. Plateau/regresja wizualna → STOP z raportem i renderami.
</definicja_ukonczenia>

<format_raportu>
Po każdej iteracji: plik, liczby przed→po (hex/kreski/fonty), ścieżki PNG,
wynik bramek, hash commita. Na końcu: tabela całego sweepu + rendery finalne
+ potwierdzenie ratchetów.
</format_raportu>
