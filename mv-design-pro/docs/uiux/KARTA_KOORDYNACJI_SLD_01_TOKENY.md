# KARTA KOORDYNACYJNA SLD-01 — TOKENY MOTYWÓW (Program UI/UX ↔ wątek SLD)

**Status:** OCZEKUJE NA POTWIERDZENIE wątku SLD (do tego czasu Program UI/UX traktuje ustalenia
jako wiążące dla SIEBIE, a plików SLD nie dotyka)
**Data:** 2026-07-15
**Strony:** Program UI/UX 2026-07 (zarządca: Fable) ↔ rework SLD F1–F5 (osobna sesja)
**Kanał zapisu konfliktów:** `docs/v12xx/REJESTR_KONFLIKTOW.md`

---

## 1. Stan faktyczny (zweryfikowany 2026-07-15)

Wątek SLD już POSIADA implementację motywów:
- `frontend/src/ui/sld/v2/theme/tokens.ts` — `ThemeMode = 'dark_scada' | 'light_technical'`,
  palety równoległe (parity), eksport wymusza `light_technical`
- `frontend/src/ui/sld/v2/theme/themeContext.tsx` — ThemeProvider
- konsumenci: `export/exportTheme.ts`, `v2/export/exportPdf.ts`, `v2/canvas/SldWorkspaceContainer.tsx`

## 2. Ustalenia proponowane (do potwierdzenia przez wątek SLD)

1. **Nazwy trybów motywów są WSPÓLNE i ZAMROŻONE:** `dark_scada` oraz `light_technical`.
   Program UI/UX używa identycznych nazw trybów w całej powłoce.
2. **Własność plików:** wszystko pod `frontend/src/ui/sld/**` (w tym `v2/theme/*`) należy do
   wątku SLD. Program UI/UX tworzy WŁASNE tokeny powłoki pod prefiksem `--mvd-*`
   w nowym module (poza katalogami SLD) i NIE importuje wewnętrznych modułów SLD.
3. **Punkt styku — jedna zmienna źródłowa:** aktywny tryb motywu jest publikowany przez powłokę
   jako atrybut na elemencie root (np. `data-theme="dark_scada"`). Wątek SLD może (decyzja po jego
   stronie) konsumować ten atrybut zamiast własnego przełącznika; do tego czasu przełącznik SLD
   działa bez zmian.
4. **Eksport:** zasada „eksport/druk zawsze `light_technical`" (już zaimplementowana po stronie
   SLD) obowiązuje też raporty i eksporty powłoki.
5. **Zakaz duplikacji palety fizycznej SLD:** kolory aparatów, szyn, overlay wyników pozostają
   wyłącznie w tokenach SLD; powłoka nie definiuje własnych kolorów dla elementów schematu.

## 3. Co Program UI/UX robi już teraz (bez czekania)

- Definiuje tokeny powłoki `--mvd-*` (tło, tekst, akcenty, gęstości, typografia) w obu trybach,
  z nazwami trybów jak wyżej.
- Osadza widok SLD w nowej powłoce wyłącznie przez jego publiczny punkt wejścia (bez zmian w SLD).

## 4. Czego Program UI/UX potrzebuje od wątku SLD (odpowiedź w tej karcie)

- [ ] Potwierdzenie pkt 2.1–2.5 albo kontrpropozycja.
- [ ] Wskazanie publicznego punktu wejścia (komponent + props) do osadzania SLD w powłoce.
- [ ] Informacja, w której fazie F1–F5 przewidziane jest przejście na `data-theme` z powłoki.

## 5. Eskalacja

Brak odpowiedzi nie blokuje faz U0–U1 (Program działa na własnych tokenach `--mvd-*`).
Blokuje dopiero E14 (integracja SLD, faza U5) — wtedy eskalacja do właściciela repo.
