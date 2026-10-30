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
| kd6-zrzuty:318 light, dark | sekcja aparatury 22 618 px: siatka kart `.mvd-apar-oceny` (`ui2/wyniki/zwarcia/aparatura/aparatura.css:224`, minimum kolumny 320 px) dzieliła sekcję 716 px na dwie kolumny po 326 px; karta werdyktu przechodziła w układ wąski (etykieta nad treścią), jedenaście pól wyjaśnienia (kontrakt werdyktu) łamało się w kolumnie ~300 px — karta 4 132 px, pole 7 149–8 036 px | J: kolumna karty werdyktu węższa niż próg pełnego układu karty | minimum kolumny = próg układu karty (480 px), węższy kontener jedna kolumna; inwentarz: `.mvd-apar-oceny` jedyna siatka z `KartaWerdyktu` (pozostałe siatki auto-fit ui2 niosą inne treści); bieg run6: karta 326 → 660 px, 4 132 → 2 426 px; sekcja 22 618 → 21 985 px — nadal > 20 000 px. Reszta to objętość treści: 3 pola × 3 rekordy × 11 pól pierwszego planu kontraktu werdyktu (samo „Wyjaśnienie” ~2 000 znaków, powtarza kryterium/wynik/limit/dowód); treść pochodzi z backendu (migracja werdyktów, inny wykonawca). Próg 20 000 px NIE podniesiony; asercja szerokości karty wzmocniona 280 → 480 px (pełny układ). OTWARTE — DECYZJA: zwarta prezentacja rekordów pola (np. rekordy pola rozwijane albo „Wyjaśnienie” bez powtórzeń pól) albo próg wyprowadzony z treści |
| parytety-fala2:241 | DEFEKT PRODUKTU: pierwszy klik dwukliku w wartość z dowodem zaznacza wiersz (`ui2/wyniki/wzorzec/TabelaWynikow.tsx` `wybierzWiersz` → `selectFromResults`), zaznaczenie rozwija inspektor (`ui2/shell/useInspektorZaZawartoscia.ts`), tabela przepływa i drugi klik/`dblclick` trafiają w inną komórkę; dowód: bieg z pojedynczym klikiem przed dwuklikiem zielony, bez niego czerwony | I: cel dwukliku po zmianie układu wywołanej pierwszym klikiem | wspólny `ui2/shared/useCelGestuDwukliku.ts` (cel gestu = element pod pierwszym klikiem, słuchacz `window` w fazie przechwytywania; ta sama reguła co gest wieloklikowy kanwy SLD) wpięty w wartość z dowodem tabeli wyników; inwentarz `onDoubleClick`: `ValueRow` (inspektor) — pierwszy klik nie zmienia układu; `ContextTree` — drzewo w lewym doku, rozwinięcie prawego panelu go nie przesuwa; listy projektów/przypadków/szablonów, `EdytowalnaTabela` — klik nie zmienia zaznaczenia elementu; testy 3 miejsca drugiego kliku × wiersz wybieralny/niewybieralny + zakończenie gestu; iniekcja: 4 czerwone; bieg run5: zielone |
| pola-w-torze-zrzuty:36 | DEFEKT PRODUKTU: wpis historii kadrów niósł transform bez viewportu, w którym obowiązywał; pierwszy klik dwukliku otwiera inspektor (kanwa 1322 → 956 px), wpis bywa zapisany sprzed zwężenia, „Sieć” kładła stary transform na wąską kanwę, a zamknięcie inspektora dokładało 'resize' — każdy cykl przesuwał rysunek o 183 px (sonda: viewBox x −933 → −1498 → −2063 → −2628), czwarta stacja wyjeżdżała poza kanwę (`ui/sld/v3/canvas/camera.ts` akcja 'przywroc', `historiaKadrow.ts` `WpisHistoriiKadru`) | H: stan kamery zapisany bez pary transform+viewport | wpis historii i zgłoszenie kamery niosą `viewportSize` z tego samego stanu kamery; 'przywroc' przenosi kadr do bieżącego viewportu regułą 'resize' (ten sam viewport: bit w bit); testy: reduktor 2×2 viewport zapisu × powrotu + 5 cykli, workspace 2 chwile zwężenia × {1, 3} cykle; iniekcja (stary reduktor) czerwona 3 + 2; bieg run5: zielone |
| s95-budowa-z-kanwy:250 | prawy klik w środek toru dalszej połówki trafia w tło: punkt liczony, gdy kamera jeszcze jedzie po zamknięciu menu stacji (sonda: `viewBox` 701→970 szerokości po Escape, przesunięcie x jeszcze po ~1 s) | G: klik współrzędnymi przed spoczynkiem kadru albo w punkt, gdzie cel nie jest na wierzchu | wspólny `e2e/stabilnaGeometria.ts` (poll do spoczynku, porażka zamiast cichego powrotu) wpięty we wszystkie kliki natywne liczone z geometrii obiektu kanwy: s95-budowa-z-kanwy, s95-zrzuty, kanon-menu-sld, wyspy-menu-sld (duplikaty helpera skasowane), menu-schematu-nn (sztywne pauzy 400/200 ms zastąpione), k2, k3, kd5, kd8, kd11 ×2, sld-gpz-zwiniety, ui02, w5e, inspektor-karta-techniczna; poza klasą: kliki w chrom (minimapa, uchwyt panelu) i przeciągnięcia tła — cel nie zależy od kamery; bieg run5: zielone |
| sld-audyt-powykonawczy:205 (stacja) | kotwica `[data-owner-ref$="/station#sn-bus"]`: od GEOMETRIA-STACJI odcinek szyny SN stacji niesie ref sekcji `stn/<id>/sn_bus#sn-bus` (`ui/sld/shared/sldActionExecutor.ts:262`; sonda DOM: 26 ścieżek `stn/…/sn_bus#sn-bus`, zero `…/station#sn-bus`) | F: selektor sprzed kanonu refów szyn | przepisane na `[data-owner-ref^="stn/"][data-owner-ref$="#sn-bus"]`; bieg run5: zielone |

Bieg run5 (2026-10-30, 39 testów: klasy F, G, H, I i regresja klasy G): 37 passed, 2 failed (kd6 ×2).
Scalono `e29e59e2c` (karta ZU) na polecenie koordynatora — spec `zwarcie-przez-impedancje-przejscia` w wersji ZU.

Bieg run7 (wszystkie 17 speców pierwotnie czerwonych, 48 testów, HEAD e65a2b492): 45 passed, 3 failed — kd6 ×2 (otwarte, decyzja) i s95 pełny cykl (prawy klik w dalszą połówkę otworzył menu TŁA: punkt na kresce przykryty albo ruch dwufazowy). Poprawka: wspólne `punktNaWierzchu` (sonda `elementFromPoint` wzdłuż trasy) w s95-budowa-z-kanwy i s95-zrzuty, spoczynek = trzy zgodne odczyty.

Bieg run8 (s95-budowa, s95-zrzuty, kanon-menu, wyspy-menu ×3): s95-budowa zielony 3/3; s95-zrzuty czerwony 3/3 na nowej, uczciwej asercji — jedyny obiekt klasy „aparat” (aparat pola GPZ) leżał poza kadrem pod drzewem modelu (x = 91 px), a dawny klik w środek prostokąta trafiał w wiersz drzewa, więc zrzut „menu aparatu” dokumentował menu drzewa. Poprawka speca: pierwszy obiekt klasy na wierzchu, a gdy żaden — kadr całej sieci Shift+F i ponowna sonda; weryfikacja w toku.

## Znalezisko uboczne (nienaprawione)

`frontend/src/ui/network-build/build-sidebar/{BuildSidebar,BuilderSection,LayersSection,NavigatorSection}.tsx`
oraz `ui/network-build/dragDropController.ts` nie mają konsumenta produkcyjnego (tylko testy) — martwy kod
do kasacji osobną kartą z inwentarzem klasy „moduły osierocone".

## Pierwszy krok dla następcy

Uruchomić pod blokadą tylko 5 otwartych speców (kd6, parytety-fala2, pola-w-torze, s95-budowa-z-kanwy,
sld-audyt-powykonawczy) i na ich `error-context.md` oraz zrzutach ustalić przyczyny; zacząć od klasy F
(selektor), potem s95 i pola-w-torze (wspólne podejrzenie: geometria/kadr po zmianach pól).
