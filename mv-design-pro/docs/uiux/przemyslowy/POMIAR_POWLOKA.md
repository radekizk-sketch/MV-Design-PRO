# Pomiar powłoki pod UI-01/02/03, §8, §9 (explorer, tylko odczyt)
Ścieżki względem mv-design-pro/frontend/src. Drzewo: /home/user/MV-Design-PRO (odczyt).

## 1. Kto renderuje paski (od góry)
| Pasek | Komponent | Dowód |
|---|---|---|
| Górny: logo, „Projekt: …”, TRYB Podstawowy/Rozszerzony/Ekspercki, „Motyw: …”, „⟨ Nawigacja”, „Zwiń lub rozwiń panel inspektora ⟩”, „Widok”, Zapisz, Oblicz | ui2/shell/TitleBar.tsx (134 l.) | TitleBar.tsx:47-131; etykiety strings.ts:25-40; ModeSwitch.tsx |
| ZAKRES OBLICZEŃ + chipy projekt / przypadek / Model / Gotowość / Wyniki / Przypadków | ui2/shell/CaseBar.tsx (152 l.) | CaseBar.tsx:47-150; montaż AppShell.tsx:258-266 |
| Liczniki: Faza projektu, Kontrola, Obliczenia/Następny krok, Szyny…Odbiory nN + Szukaj/Katalog/Kontrola/Metadane/Historia | ui/shell/WorkflowContextStrip.tsx (419 l., warstwa ui/, Tailwind scada) | :289-350 (metryki :338-344), akcje :353-369; montaż ui2/legacy/LegacyPasekNarzedzi.tsx:66, LegacyWarsztat.tsx:195 (tylko gdy activeMode==='MODEL_EDIT', LegacyPasekNarzedzi.tsx:62) |
| TRYB PRACY Edycja/Podgląd | ui2/spaces/schemat/PrzelacznikPodgladu.tsx | :23-44; montaż LegacyWarsztat.tsx:204 |
| NASTĘPNY KROK + „Sprawdź gotowość…” | ui2/spaces/schemat/NastepnyKrokSchematu.tsx | :66-77; montaż LegacyWarsztat.tsx:205 (warunek :187-190) |
| Pasek narzędzi kanwy (Drzewo układu, PV/BESS/FW, Dopasuj widok, Cały arkusz, Legenda, Nawigator, Narzędzia; Dowody, Warstwy) | ui/sld/v3/canvas (toolbarLayout.ts:53 itd.) | |
| Pasek stanu: Serwer, Model rew., Przebieg, Wersja modelu | ui2/shell/StatusBar.tsx (74 l.) | :37-72 |
Łańcuch montażu: AppRoot.tsx:331 <AppShell> → children = <LegacyWarsztat> (AppRoot.tsx:341); contextPanel AppRoot.tsx:433-447; inspector AppRoot.tsx:459-472.

### Przyczyna „Widok przykrywa nazwę projektu” (FAKT, kolizja klas CSS)
- TitleBar.tsx:91 `<div className="mvd-menu">` (kontener przycisku Widok); intencja: shell.css:87-89 `.mvd-menu{position:relative}`.
- Ta sama globalna klasa zdefiniowana ponownie w ui2/spaces/obliczenia/przypadki.css:354-365: `.mvd-menu{position:fixed; z-index:71; min-width:160px; padding:4px; background:var(--mvd-panel); border; box-shadow}` (dla menu kontekstowego MenedzerPrzypadkow.tsx:242; CSS wciągany importem MenedzerPrzypadkow.tsx:32, globalnie w bundlu).
- Skutek: kontener „Widok” staje się `fixed` bez top/left → statyczna pozycja w flexie = lewa krawędź treści paska (padding 14 px, shell.css:46), z białym tłem panelu, min-width 160 px, z-index 71 — przykrywa logo i początek „Projekt: …” (zrzut pola-w-torze-przelotowa-jasny.png: „Widok” w lewym górnym rogu, widać „…kt: Pola w torze…”). Rozwijana lista `.mvd-menu-list` (absolute, right:0) liczy się względem tego pudełka.
- Ten sam konflikt dla `.mvd-menu-item` (shell.css:102 vs przypadki.css:366). Klasa: brak przestrzeni nazw CSS dla komponentów ui2 — rekomendacja: CSS Modules albo prefiks per moduł + guard na duplikaty selektorów globalnych.
- Dodatkowo `.mvd-crumb` (shell.css:56-62) ma max-width 42ch, overflow:hidden → przy braku miejsca ścina się jako pierwsza (przyciski nie mają min-width:0, więc się nie kurczą). Przy 1440 px suma etykiet przycisków (≈„Zwiń lub rozwiń panel inspektora”, „Motyw: jasny (techniczny)”) wypycha nazwę projektu.

### Dublowanie (FAKT)
- Nawigacja: SpaceNav (lewy panel, 7 przestrzeni, spaces.ts:34-42) + przycisk „⟨ Nawigacja” (TitleBar.tsx:70-78 — to w rzeczywistości zwijanie lewego panelu, mylna etykieta) + „Nawigator” na kanwie SLD + „Drzewo układu” na kanwie + drzewo w lewym panelu.
- „Kontrola” dwa razy w jednym pasku: WorkflowContextStrip.tsx:314 (licznik „Kontrola:”) i :366 (akcja „Kontrola” → MassReviewPanel).
- Gotowość pokazana w ≥7 miejscach jednocześnie na ekranie Schemat: CaseBar chip Gotowość (CaseBar.tsx:107-114), CaseBar chip Model zwalidowany (:100-105), WCS Faza projektu (:296-304), WCS Kontrola (:306-327), WCS Obliczenia/Następny krok (:329-334, 191-198), baner NASTĘPNY KROK (NastepnyKrokSchematu), lewy panel „Następna akcja / Etap układu / Przegląd techniczny” (ui/shell/context-panels/SchematContextPanel.tsx:185,227,262, montaż AppRoot.tsx:442 AreaContextPanel), przestrzeń „Gotowość” w SpaceNav, StatusBar „Model: rew.” (StatusBar.tsx:50-57).
- Projekt: nazwa w TitleBar (crumb) i chip w CaseBar (CaseBar.tsx:53-75).
- Szukaj: Ctrl+K paleta (AppShell.tsx:160-164 → CommandPalette, AppRoot.tsx:448) + WCS „Szukaj” → osobny GlobalSearch (LegacyPasekNarzedzi.tsx:79) — dwie wyszukiwarki.
- Panel dolny: dwa wejścia (StatusBar.tsx:52,61) do panelu, który jest atrapą (pkt 3).

### Martwe/atrapowe polecenia w pasku (FAKT)
- „Zapisz”: AppRoot.tsx nie przekazuje `onSave` (grep `onSave` w AppRoot.tsx = 0 trafień) → TitleBar.tsx:118 `onClick={undefined}` — martwy klik (narusza §9 „każde polecenie działa albo jest niedostępne z przyczyną”).
- „Oblicz”: TitleBar.tsx:122-129 bez stanu zajętości/disabled.

## 2. Tryby Podstawowy/Rozszerzony/Ekspercki
- Model: modeModel.ts:1-29 — z deklaracji „Tryb NIE zmienia danych ani wyników — wyłącznie widoczność”. Domyślnie 'basic' (useShellStore.ts:175), utrwalany (useShellStore.ts:244).
- Rozszerzony: 0 konsumentów odróżniających go od Podstawowego. `grep -rn "'extended'" src --exclude-dir=__tests__` → tylko definicje typów (modeModel.ts:10,12; search/searchModel.ts:36,60; nav/treeModel.ts:18,69). Wszystkie węzły drzewa mają trybMin 'basic' (nav/adapters/*: casesTreeAdapter.ts:33, topologyTreeAdapter.ts:126,130,134,184,230, runsTreeAdapter.ts:47,76). Wniosek: Rozszerzony == Podstawowy funkcjonalnie.
- Ekspercki — konsumenci (wszystkie: odsłanianie, nie inna funkcja obliczeniowa):
  ui/workspace/WorkspaceSurfaceRouter.tsx:942,1866,2839; ui/protection-coordination/TracePanel.tsx:142, ProtectionCoordinationPage.tsx:58; ui2/wyniki/dynamika/EkranDynamiki.tsx:358; ocena/EkranOceny.tsx:346; porownanie/TrybZabezpieczen.tsx:120, EkranPorownania.tsx:163; skladowe/EkranSkladowych.tsx:98; akademickie/EkranAnalizAkademickich.tsx:1597; oze/ncrfg/komponenty.tsx:130,240; oze/wniosek/EkranWniosku.tsx:211; oze/pulpit/PulpitOze.tsx:165; oze/macierz/MacierzNcRfg.tsx:351; oze/frt/EkranFrt.tsx:108, SekcjaSekwencjiZapadow.tsx:100; spaces/model/ModelWarsztat.tsx:68 (zakładka „Diagnostyka”, :38); spaces/wyniki/obszary.ts:127-134 (zakładka „Analizy akademickie” tylko expert); spaces/projekt/arkusz/EkranImportuArkusza.tsx:138; PulpitProjektu.tsx:91; archiwum/wspolne.tsx:67; archiwum/PorownanieWersji.tsx:145; AppRoot.tsx:355-468 (przekazanie do ekranów, paleta, inspektor). 42 pliki z `trybEkspercki` łącznie importują InformacjeAudytowe (metadane run_id/hash) — główny efekt trybu to pokazanie metadanych audytowych + 2 zakładki.
- Wniosek: tryby ukrywają powierzchnie, nie zmieniają funkcjonalności → wg UI-01 zastąpić jednym przełącznikiem „Pokaż szczegóły audytowe/zaawansowane” (np. w menu Widok), a zakładki Diagnostyka/Akademickie udostępnić kontekstowo.

## 3. Układ paneli
- Siatka: PanelLayout.tsx:83-86 `grid-template-columns: left 6px 1fr 6px right`; uchwyty przeciągania + 2×klik zwija + strzałki (PanelLayout.tsx:42-126).
- Granice: useShellStore.ts:24-30 — LEFT 200–320 (domyślnie 240), RIGHT 280–560 (domyślnie 320), listwa ikon 48. Kontrakt UI-02 chce inspektor 340–420 domyślnie → zmiana RIGHT_DEFAULT.
- Inspektor domyślnie ZWINIĘTY (useShellStore.ts:59 rightCollapsed:true).
- Utrwalanie: zustand persist 'mvd-shell-ui-local' w localStorage, układ PER PRZESTRZEŃ (layoutBySpace), useShellStore.ts:239-247. Bez rozmiaru panelu dolnego i bez stanu otwarcia dolnego panelu.
- Panel dolny: ISTNIEJE TYLKO JAKO ATRAPA — AppShell.tsx:285-312 renderuje zakładki Problemy/Przebiegi/Dziennik i treść `bottomHint` = „Panel dolny — zawartość w kolejnym kroku (E1.4).” (strings.ts:71). Wysokość nieregulowana. Otwierany z StatusBar.tsx:52,61. Dług wg ZASADY NR 1 (zaślepka).
- Lewy panel: SpaceNav (7 pozycji, ~260 px wysokości w zrzucie) + kontekst (AreaContextPanel dla schematu / DrzewoPrzestrzeni) w jednym stosie (AppShell.tsx:271-279) — brak podziału regulowanego między nimi.
- Zagnieżdżenie wokół SLD (DOM, przestrzeń Schemat): .mvd-app → .mvd-main-region → .mvd-main-fill → .mvd-body(grid) → main.mvd-center → .mvd-workspace-host → .mvd-legacy-host → .mvd-legacy-warsztat-tresc → TrasaLubPrzestrzen/LegacySurface → SldCanvasV3Workspace → kanwa = ≥9 kontenerów (AppShell.tsx:268-283, LegacyWarsztat.tsx:193-208). Poziome pasy nad kanwą: TitleBar, CaseBar, WCS, Tryb pracy, Następny krok, nakładki narzędzi kanwy = 5 pasów + rząd nakładek. Pomiar ze zrzutu 1600×1000: kanwa zaczyna się ok. y≈250 px (≈25% wysokości na chrom) — oszacowanie z obrazu, nie pomiar DOM.

## 4. Typografia i tokeny
- Dwa równoległe systemy tokenów (FAKT, narusza §8 „bez równoległego systemu”):
  a) ui2: `--mvd-*` hex w ui2/theme/tokens.css (101 l.): jasny :29-50 (bg #F6F7F8, panel #FFFFFF, ink #1C2732, muted #5A6B7C, accent #1F7FB5, ok #1E7E4B, warn #9A6A14, err #B3382F), ciemny :54-75 (bg #0D131A, panel #141C25, ink #D3DDE7, muted #7E90A2, accent #41A8DE, ok #3DBE7B, warn #E3A63C, err #DD5A52); fonty :49-50.
  b) ui/: `--scada-*` trójki RGB w src/index.css:29-95 (dark bg 11 16 20 = #0B1014, light bg 237 241 245 = #EDF1F5, text 226 235 243 / 22 32 43) przez tailwind.config.js:83-123 (scada-*, sygnal-*). Wartości tła różnią się między systemami — na jednym ekranie WCS (scada) i powłoka (mvd) mają różne odcienie.
  c) Trzeci: paleta SLD ui/sld/v3/theme/colorTokens.ts + palette.ts:43-81 (hex).
  d) Lokalny: ui2/spaces/model/katalog/katalog.css definiuje własne zmienne.
- Rozmiary czcionek (cały src, bez __tests__, komendy grep -rhoE … | uniq -c):
  TSX arbitralne: text-[11px] 320, text-[10px] 285, text-[9px] 23, text-[12px] 16, text-[13px] 4, text-[7px] 1, text-[15px] 1; Tailwind: text-xs 659 (12px), text-sm 654, text-base 23.
  CSS: 12px 300, 13px 201, 11px 136, 12.5px 135, 14px 47, 11.5px 47, 15px 33, 10.5px 19, 16px 16, 18px 14, 13.5px 13, 10px 13, 20px 6, 9px 2, 9.5px 1, 26px 1 → 16 różnych rozmiarów w CSS.
  Powłoka < 13 px: ui/shell tsx 85 wystąpień; ui2/shell css 7 (np. .mvd-lbl 10.5px shell.css:28, nav-key 10px :234, 12px :143,:173,:302, 11.5px :327,:395); ui2/nav css 7 (tree.css:11 12px, :25 10.5px, :38 11px, :81 9px, :148/:157 10px); ui2/spaces/schemat css 3 (schemat.css:29,65 12.5px, :78 11.5px); ui/sld/v3/canvas tsx 15. WCS: etykiety 11px, chip fazy 10px uppercase (WorkflowContextStrip.tsx:300-301), akcje 10px (:396), badge 9px (:398).
- uppercase: 220 w TSX + 62 `text-transform: uppercase` w CSS; tracking-*: widest 64, wider 56, wide 34, arbitralne [0.12–0.24em] 46; font-mono w TSX: 193 (np. WCS wartości liczników :332,:348 — mono dla liczb ok, ale też dla „konfiguracja układu”). .mvd-lbl (shell.css:27-33) = 10.5px uppercase 0.08em — źródło „ZAKRES OBLICZEŃ”, „TRYB”, „PRZESTRZENIE”.
- Zieleń przewodów: palette.ts:16-21 KONTRAKT BINDING — „SN zielony” (klasa napięciowa, sn #0F7A3D :50) i „energizacja zielona” (energized #1E7A46 :62) to ta sama rodzina barw → kolor SN-przewodu jest semantyką KLASY NAPIĘCIA, ale wizualnie nieodróżnialny od „pod napięciem”. Konflikt z §8 („kolor przewodu nie oznacza samowolnie stanu napięciowego”). Zmiana palety dotyka testu palette.test.ts i wpisu REJESTR_KONFLIKTOW (KD-8) — decyzja architekta.
- Kontrast: nie zmierzyłem współczynników WCAG (tylko wartości hex).

## 5. Zachowanie §9
- Menu kontekstowe: SLD v3 (SldCanvasV3.tsx:581, :3169; SldCanvasV3Workspace.tsx:1864-1874 + ui/context-menu/SldContextMenuController.tsx), drzewo ui2/nav/ContextTree.tsx, MenedzerPrzypadkow, KafelSzablonu, StudyCaseList. Brak w inspektorze, tabelach wyników (poza dwuklikiem).
- Dwuklik → właściwości: NIE na SLD. SldCanvasV3Workspace.tsx:2470-2481 — dwuklik wyłącznie otwiera portal nN stacji na LOD 0; inne elementy: nic. Dwuklik istnieje w ContextTree, tabelach (EdytowalnaTabela, TabelaWynikow), ValueRow, listach projektów/przypadków.
- Skróty: AppShell.tsx:156-196 (Ctrl+K, Ctrl+B, Ctrl+I, Esc, 1–7 przestrzenie); łącznie 10 plików z addEventListener('keydown'). Brak Ctrl+S (i brak zapisu), brak F5/F9 „Oblicz”, Delete na powłoce nie zmierzony.
- Niezapisane zmiany: brak `beforeunload` w całym src (grep = 0); isDirty tylko lokalnie w PropertyGridMultiEdit.tsx:74 i WorkspaceSurfaceRouter.tsx:1136. Brak wskaźnika w pasku projektu (model zapisywany operacjami domenowymi — przypuszczenie: „Zapisz” jest zbędny/mylący, do potwierdzenia w useLegacyOrchestrator).
- Trwające obliczenia: brak globalnego wskaźnika w powłoce; StatusBar pokazuje tylko ostatni przebieg (StatusBar.tsx:59-65); stany RUNNING lokalnie w ekranach (spaces/obliczenia/przebiegi/WierszPrzebiegu.tsx, serie/SeriePanel.tsx, KafelOstatniegoPrzebiegu.tsx, EkranDynamiki.tsx, MacierzNcRfg.tsx). Przycisk Oblicz bez busy.
- Nieaktualne wyniki: ISTNIEJE — znacznikSwiezosci.ts (89 l.) + chip CaseBar.tsx:116-138 klikalny → przestrzeń Obliczenia, przyczyna z backendu (`result_status_reason_pl`, CaseBar.tsx:37-40). Do reużycia.

## 6. Testy przypinające obecny układ (do przepisania)
Vitest: ui2/shell/__tests__/{caseBar,panelLayout,shellA11y,swiezoscCaseBar,modeSwitch,jednaPrawdaChromu,tokens,useInspektorZaZawartoscia,nawigacjaAutomatyczna.inwariant}.test.*; ui2/spaces/schemat/__tests__/{nastepnyKrokSchematu,przelacznikPodgladu}.test.tsx; ui2/legacy/__tests__/{legacyPasekNarzedzi,useLegacyOrchestrator.gotowoscMigawki}.test.tsx; ui2/spaces/model/__tests__/{modelWarsztat,diagnostykaModelu}.test.tsx (tryb ekspercki); spaces/wyniki obszary (tryb).
E2E (grep testid mvd-titlebar/casebar/toggle/save/calculate/workflow-context-strip/wcs-/mvd-schemat-tryb/nastepny/statusbar/bottom/handle): flow-ekspert-screenshot, gotowosc-jedna-prawda, gotowosc-po-biegu, happy-path, kd3-zrzuty-screenshot, kd8-motyw-jedna-prawda, pasmo-min-max-zwarcia, pierwsze-uzycie, projekty-parytet, sld-editor-real-backend-flex, sld-first-uklad, stany-zerowe-akcje, swiezosc-po-edycji-modelu, v126-okna-zrzuty (+ fixtures/emptyDomainOpsResponse.ts). Wzorzec obejmował też „mvd-mode”, które dopasowało „mvd-model…” w WlasciwosciModelu — możliwe fałszywe trafienia w spaces/model.
Kontrakty e2e testid do zachowania: `active-case-bar` (AppShell.tsx:258), `main-content` (:283), `canonical-layout`/`app-ready` (AppRoot.tsx:328-329).

## Czego nie sprawdziłem
- Pomiar DOM/zrzut przy 1440×900 (nie uruchamiałem aplikacji); kontrast WCAG liczbowo; pełna lista skrótów w 10 plikach keydown; dead_click_guard — czy łapie „Zapisz” bez handlera; LegacyChrome (AppRoot.tsx:330) — co dokłada; inspektor (LegacyInspektor) wewnętrzne nagłówki.
