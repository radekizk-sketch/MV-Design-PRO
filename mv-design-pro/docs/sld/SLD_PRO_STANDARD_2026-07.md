# SLD PRO — STANDARD WIZUALNO-INTERAKCYJNY (2026-07) [WIĄŻĄCY dla SLD v2]

Źródło: panel ekspertów 2026-07 (projektant SLD ETAP/DIgSILENT, dyspozytor SCADA OSD,
architekt HMI, inżynier zabezpieczeń, wydajność frontu) po diagnozie „nie podoba mi się,
jak SLD działa i wygląda". Diagnoza liczbowa stanu zastanego (żywy klon, 2026-07-03):
**1157 literałów kolorów hex poza tokens.ts** (63 w tokenach), **30 grubości kreski**,
**19 rozmiarów fontu** w ścieżce v2 — trzy dialekty wizualne (GPZ / stacja / OZE);
zoom skokowy bez interpolacji, pan tylko z pustego tła, zero hover.

## 1. Zasada nadrzędna
JEDEN język wizualny i JEDEN model dotyku dla całego SLD v2. Każda wartość stylu
(kolor / kreska / font / odstęp) pochodzi z `theme/tokens.ts`. Literał w rendererze
= dług; strażnik `__tests__/visualCanon.guard.test.ts` zamraża stan i ratchetuje W DÓŁ.

## 2. Ruch i dotyk (wdrożone — commit `ca770c2c`)
- Zoom: kotwiczony pod kursorem; stan synchroniczny; płynność przez CSS
  `transition: transform 130ms cubic-bezier(0.22,0.61,0.36,1)` na grupie świata
  (`.sld-v2-world`, GPU); szanuje `prefers-reduced-motion`.
- Pan: lewy przycisk GDZIEKOLWIEK (próg aktywacji 4 px odróżnia klik od chwytu);
  środkowy = pan natychmiast; podczas chwytu transition OFF (prowadzenie 1:1),
  kursor `grabbing`, `pointer-events` off na elementach; klik po panie stłumiony.
- Hover: `brightness(1.25)` + `cursor: pointer` na `[data-element-kind][data-element-id]`
  — czysty CSS, zero re-renderów.
- ZAKAZ: animowania stanu transformacji przez rAF/timery (łamie determinizm testów).

## 3. Kolor (tokens-first)
- Ekran: paleta `SLD_V2_COLORS` + tokeny semantyczne (stan aparatu, napięcie szyny,
  badge, alarmy). Eksport/druk: `LIGHT_TECHNICAL_COLORS` (V12K-007).
- Nowy kod: ZERO literałów hex w rendererach/canvas — tylko tokeny. Brak tokenu →
  dodaj token (z komentarzem semantycznym), nie literał.
- Sweep normalizacyjny (kolejność po budżetach strażnika): SldDetailDrawer (190) →
  MiniBlockRmuRenderer (109) → OzeSourceArchetype (74) → CableRunRenderer (68) →
  SldCanvasV2 (59) → SldTitleBlock (47) → StationOnRunRenderer (37) → DerRenderer (34)
  → GpzCanonicalRenderer (33) → pozostałe. Po każdym sweepie: obniż budżet w strażniku.

## 4. Kreska (jedna hierarchia)
Kanon: `SLD_STROKE_PX` (transmission 5 / transformer 4 / busbar 4 / trunk 3 /
branch 2 / detail 1.5) + `getDeviceStyle().strokeWidth` dla aparatów.
Starsze stałe `STROKE_*_PX` = legacy do wygaszenia przy sweepach (nie dodawać nowych
użyć). Docelowo ≤ 7 wartości grubości w całym v2 (dziś 30). Reguła: grubość koduje
ROLĘ elementu (napięcie/warstwę), nigdy „wygląd lokalny".

## 5. Typografia (skala 4-stopniowa)
Kanon: `FONT_SIZES` (tokens). Docelowo 4 rozmiary bazowe na canvasie:
nagłówek bloku / etykieta elementu / wartość pomiaru (mono) / adnotacja.
Zejście z 19 rozmiarów do skali odbywa się per-renderer razem ze sweepem kolorów
(uwaga: rozmiar wpływa na declutter/clipping — po zmianie ZAWSZE render-weryfikacja).

## 6. Gęstość informacji per LOD (dyspozytor first)
- L0 (topologia): stan + tor mocy + tożsamość węzła (nazwa/ID/moc) + punkty rozcięcia.
  Nic więcej.
- L1–L2: + kable (typ/długość), + aparaty krytyczne, + OZE bloki.
- L3+: pełny detal pola (łańcuch aparatów, CT/VT, kody zabezpieczeń, pomiary).
- Zasada: informacja wchodzi wtedy, gdy jest czytelna (bez kolizji) — deklutter
  ma priorytety (GPZ > punkt rozcięcia > stacja > kabel).

## 7. Strażnicy standardu
- `visualCanon.guard.test.ts` — ratchet literałów hex (total + per-plik, tylko w dół).
- Kolejne ratchety (przy sweepach): grubości kreski spoza kanonu, rozmiary fontu
  spoza skali — dokładać do tego samego pliku testowego.
- Render-weryfikacja przy każdej zmianie wizualnej: harness `screenshot-harness.html`
  (LOD 0/1/3 + GPZ) — obejrzyj PNG przed commitem.

## 8. Stan wdrożenia
- [x] §2 Ruch i dotyk — `ca770c2c`.
- [x] §7 Strażnik hex-ratchet — razem z tym dokumentem.
- [ ] §3/§4/§5 Sweep normalizacyjny per-renderer (kolejność w §3) — prompt
  kontynuacyjny: `docs/prompts/PROMPT_SLD_PRO_SWEEP_2026-07.md`.
- [ ] §6 rewizja gęstości L1/L2 po sweepach (render-audyt).
