# Przekazanie karty FIX-E2E-PELNE (stan roboczy)

Baza: `ab750bdc6`. Gałąź: `claude/mv-design-pro-twin-audit-u4lhy0-fix-e2e-a`. Log pełnego biegu:
`/tmp/claude-0/logs/e2e_pelne_ab750bdc6.txt` (563 passed, 22 failed, 3 did not run).

Bieg kontrolny czerwonych speców na drzewie z poprawkami klas A–D (2026-10-30, 48 testów):
42 passed, 6 failed (kd6 ×2, parytety L-11, pola-w-torze, s95 pełny cykl, sld-audyt stacja).

## Trzy testy „did not run"

`uiux-przed-po-screenshot.spec.ts` ma `describe.configure({ mode: 'serial' })` (linia 58). Po porażce
„UI-04 kadrowanie SLD ciemny" (:101) Playwright pominął pozostałe testy grupy: „UI-01/UI-02
powłoka 1440×900 jasny" (:77), „UI-01/UI-02 powłoka 1920×1080 jasny" (:77) i „UI-04 kadrowanie SLD
jasny" (:101). W biegu kontrolnym wszystkie sześć testów grupy zielone.

## Tabela

| Test | Przyczyna (plik:linia) | Klasa | Stan |
|---|---|---|---|
| kanon-menu-sld:338 | spec wysyłał `hv_voltage_kv`/`transformer_sn_mva` przy równoważniku SN; od GPZ-MODEL backend odmawia (`backend/src/enm/domain_operations.py:897`) | A: ładunek `add_grid_source_sn` sprzed kanonu GPZ-MODEL | naprawione w specu, zielone |
| menu-schematu-nn:208 | jw. | A | naprawione, zielone |
| w5e-ttit-nn:228 light, dark | jw. | A | naprawione, zielone |
| zwarcie-przez-impedancje-przejscia:168 | jw. | A | naprawione, zielone |
| industrial-template-mass-flow:234 | spec szukał tekstu „Stacje: 50" ze skasowanego pasa liczników (karta K1; dziś panel na żądanie `ui2/shell/PasekNarzedzi.tsx:178`) | B: spec czyta skasowaną powierzchnię | przepisany na `mvd-narzedzie-model` → `mvd-licznik-stacje` = 50, zielone |
| zwarcia-rozplyw-screenshot:168 light, dark | literał „9,1 kA" przeżył przegenerowanie fikstury `falowniki_rozplyw_scena_gpz_feeder_wynik.json` kartą GPZ-MODEL (8,64 kA) | C: liczba-literał zamiast fikstury biegu | prąd z fikstury + formatter produkcyjny `formatMagnitudeKa`, zielone; inwentarz literałów kA w e2e: brak innych |
| sld-gpz-zwiniety:172 | od GEOMETRIA-STACJI aparat ciągłości pola GPZ na L0 pochodzi z rekordu modelu (`ui/sld/v3/scene/buildScene.ts:2867`); seed nie dawał aparatu pola GPZ → sylwetka braku danych zamiast wyłącznika | D: seed sprzed kanonu „aparat z modelu" | seed z `gpz_line_field_apparatus`, zielone |
| szablony-rola-a:39 light, dark | brak powtórzenia; okno 08:55–09:05 pełnego biegu z prawie zerowym ruchem backendu (zagłodzenie maszyny) | E: środowisko | zielone bez zmian |
| tr2w-bez-pola:240, :314 | jw. (timeout `app-ready`) | E | zielone bez zmian |
| ui02-jeden-inspektor-zrzuty:91 | jw. | E | zielone bez zmian |
| uiux-przed-po:101 (ciemny) + 3 did not run | jw. | E | zielone bez zmian |
| ux-feedback-loop:337 | jw. | E | zielone bez zmian |
| kd6-zrzuty:318 light, dark | sekcja aparatury 22 618 px > 20 000 px dla 3 pól; przyczyna nieustalona | ? | OTWARTE |
| parytety-fala2:241 | 2× klik w wartość z dowodem nie otwiera zakładki dowodu zawężonej do elementu (`mvd-dowod-zakres-element` brak); obsługa `ui2/spaces/wyniki/WynikiWarsztat.tsx:339`; przyczyna nieustalona | ? | OTWARTE |
| pola-w-torze-zrzuty:36 | DEFEKT PRODUKTU: wpis historii kadrów niósł transform bez viewportu, w którym obowiązywał; pierwszy klik dwukliku otwiera inspektor (kanwa 1322 → 956 px), wpis bywa zapisany sprzed zwężenia, „Sieć” kładła stary transform na wąską kanwę, a zamknięcie inspektora dokładało 'resize' — każdy cykl przesuwał rysunek o 183 px (sonda: viewBox x −933 → −1498 → −2063 → −2628), czwarta stacja wyjeżdżała poza kanwę (`ui/sld/v3/canvas/camera.ts` akcja 'przywroc', `historiaKadrow.ts` `WpisHistoriiKadru`) | H: stan kamery zapisany bez pary transform+viewport | wpis historii i zgłoszenie kamery niosą `viewportSize` z tego samego stanu kamery; 'przywroc' przenosi kadr do bieżącego viewportu regułą 'resize' (ten sam viewport: bit w bit); testy: reduktor 2×2 viewport zapisu × powrotu + 5 cykli, workspace 2 chwile zwężenia × {1, 3} cykle; iniekcja (stary reduktor) czerwona 3 + 2; e2e NIEZWERYFIKOWANE |
| s95-budowa-z-kanwy:250 | prawy klik w środek toru dalszej połówki trafia w tło: punkt liczony, gdy kamera jeszcze jedzie po zamknięciu menu stacji (sonda: `viewBox` 701→970 szerokości po Escape, przesunięcie x jeszcze po ~1 s) | G: klik współrzędnymi przed spoczynkiem kadru | wspólny `e2e/stabilnaGeometria.ts` (poll do spoczynku, porażka zamiast cichego powrotu) wpięty we wszystkie kliki natywne liczone z geometrii obiektu kanwy: s95-budowa-z-kanwy, s95-zrzuty, kanon-menu-sld, wyspy-menu-sld (duplikaty helpera skasowane), menu-schematu-nn (sztywne pauzy 400/200 ms zastąpione), k2, k3, kd5, kd8, kd11 ×2, sld-gpz-zwiniety, ui02, w5e, inspektor-karta-techniczna; poza klasą: kliki w chrom (minimapa, uchwyt panelu) i przeciągnięcia tła — cel nie zależy od kamery; NIEZWERYFIKOWANE biegiem |
| sld-audyt-powykonawczy:205 (stacja) | kotwica `[data-owner-ref$="/station#sn-bus"]`: od GEOMETRIA-STACJI odcinek szyny SN stacji niesie ref sekcji `stn/<id>/sn_bus#sn-bus` (`ui/sld/shared/sldActionExecutor.ts:262`; sonda DOM: 26 ścieżek `stn/…/sn_bus#sn-bus`, zero `…/station#sn-bus`) | F: selektor sprzed kanonu refów szyn | przepisane na `[data-owner-ref^="stn/"][data-owner-ref$="#sn-bus"]`; NIEZWERYFIKOWANE biegiem |

## Znalezisko uboczne (nienaprawione)

`frontend/src/ui/network-build/build-sidebar/{BuildSidebar,BuilderSection,LayersSection,NavigatorSection}.tsx`
oraz `ui/network-build/dragDropController.ts` nie mają konsumenta produkcyjnego (tylko testy) — martwy kod
do kasacji osobną kartą z inwentarzem klasy „moduły osierocone".

## Pierwszy krok dla następcy

Uruchomić pod blokadą tylko 5 otwartych speców (kd6, parytety-fala2, pola-w-torze, s95-budowa-z-kanwy,
sld-audyt-powykonawczy) i na ich `error-context.md` oraz zrzutach ustalić przyczyny; zacząć od klasy F
(selektor), potem s95 i pola-w-torze (wspólne podejrzenie: geometria/kadr po zmianach pól).
