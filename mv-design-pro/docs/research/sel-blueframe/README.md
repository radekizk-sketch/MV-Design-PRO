# SEL Blueframe DMS / PSM → MV-DESIGN PRO — pakiet źródeł dla Opusa

> **STATUS PO KONSOLIDACJI (2026-10-23): MATERIAŁY ŹRÓDŁOWE, NIE ODDZIELNY PLAN.**
> Programem i jego wykonaniem zarządza Claude Opus 5.5; **jedyne źródło priorytetów i statusu UI/UX**:
> [`docs/uiux/PROGRAM_UIUX_2026-07.md` §12](../../uiux/PROGRAM_UIUX_2026-07.md#12-zintegrowana-kolejka-wykonawcza--uiux-przemyslowy-decyzja-wlasciciela-2026-10-23).
> SEL „+” = **UX-01/UX-02**, inspektor i walidacja = UX-03, wygląd = UX-04, wyniki i E2E = UX-05/UX-06.
> **GIS P3 / STOP**, bez implementacji. Ten katalog nie posiada własnego harmonogramu i nie wymaga
> zgody na ponowne „rozpoczęcie” programu — Opus kontynuuje jeden istniejący plan.

**Data przeglądu:** 2026-10-23  
**Baza techniczna:** PR #489, commit `0e7a5e7d698a8812ca20bcb83d0cc9edf02eeb5f`  
**Status:** dokumentacja referencyjna, NIE implementacja, NIE odbiór B-02.  
**Główny priorytet:** P0 — inteligentne punkty „+”, edycja modelu bezpośrednio na `SldCanvasV3`, wspólny panel właściwości, walidacja przy obiekcie.  
**GIS:** **P3 / materiał inspiracyjny / NIE JEST PRIORYTETEM; bez prac wdrożeniowych GIS w tym zadaniu**.

## Od czego zacząć

1. **[GALERIA_I_FILMY.md](GALERIA_I_FILMY.md)** — osadzone autentyczne ekrany SEL z serwera producenta; odnośniki do 11 filmów i zestaw rzeczywistych zrzutów MV-DESIGN PRO z repo.
2. **[REJESTR_32_FUNKCJE.md](REJESTR_32_FUNKCJE.md)** — 32 funkcje, co jest potwierdzone w SEL i jak użyć tego w naszym systemie, bez przypisywania SEL naszych pomysłów.
3. **[KONTRAKT_DLA_OPUSA.md](KONTRAKT_DLA_OPUSA.md)** — zlecenie wdrożeniowe P0/P1, pliki integracji, niezmienniki SN–TR–nN, testy odbiorowe T+01…T+10 i granice prac.

## Kluczowy ekran źródłowy: PSM, panel właściwości i znaki „+”

![SEL Blueframe PSM — oryginalny ekran oficjalny; prawa do obrazu: Schweitzer Engineering Laboratories](https://images.contentstack.io/v3/assets/bltea08f3d94a418a1b/bltba4c1b6c32e3f833/695bfeb7a078d06cb2309b97/PSM-dark.png)

Źródło: [SEL Blueframe DMS — oficjalna strona i galeria](https://selinc.com/software/blueframe-distribution-management-system/) oraz [opis „Autodirected Layout” (punkt 5)](https://selinc.com/software/distribution-management-system-dms/details/).

**Weryfikacja:** Producent potwierdza, że w punkcie nowego połączenia użytkownik wybiera typ węzła, a PSM wyznacza położenie, połączenia i ustawienia początkowe. Zrzut pokazuje uchwyty „+”, drzewo systemu, inspektor urządzenia, przyciski szkicu i panel walidacji. Nie twierdzimy, że przeanalizowaliśmy każdą klatkę filmów.

## Reguła główna

`+` jest interfejsem do **istniejących operacji domenowych ENM**. Nie dodaje samodzielnego węzła graficznego, nie tworzy równoległego modelu sieci ani nowego renderera. Wstawienie elementu musi prowadzić przez port `PortRef`, istniejącą operację backendu, nową rewizję modelu i istniejącą projekcję `SldCanvasV3`.

- Projektujemy SN, a nie szczegółową rozdzielnię WN/110 kV. GPZ = poprawna granica modelu źródłowego, potrzebna do SN.
- Dwie odrębne projekcje SLD: SN i nN, lecz jedna sieć obliczeniowa SN–TR–nN.
- B-02 **POZOSTAJE ODRZUCONE** do odrębnej decyzji właściciela.
- Nowa estetyka = inspiracja (kolorystyka, kompozycja, gęstość), **bez kopiowania zastrzeżonych ikon, kodu i grafik producenta**.
- **GIS odłożone:** zob. [GALERIA_I_FILMY.md](GALERIA_I_FILMY.md#gis--wyłącznie-wzorzec-przyszłości), bez projektowania map, baz geograficznych i importera w tym wdrożeniu.

## Pochodzenie i licencje

Zrzuty zewnętrzne są osadzane **przez oryginalne adresy producenta**, a nie kopiowane do repozytorium. Prawa do materiałów SEL należą do ich właścicieli. Pozostają one wyłącznie punktem odniesienia dla analizy wzorców UX. Zrzuty aplikacji MV-DESIGN PRO w galerii odwołują się do **istniejących plików w tym repozytorium**. Nie umieszczono żadnych nowych kopii obrazów SEL w kodzie aplikacji.

## Podstawa odczytu

- Oficjalne strony i opisy filmów SEL, obrazy producenta, zrzut użytkownika w rozmowie.
- Odczyt kodu PR #489: `frontend/src/ui/sld/v3/canvas/SldCanvasV3.tsx`, `SldCanvasV3Workspace.tsx`, `frontend/src/ui/sld/shared/sldActionExecutor.ts`, `frontend/src/ui/sld/v2/command/SldCommandService.ts`, `docs/sld/SLD_PORTS_AND_ENDPOINTS.md`.
- **Ograniczenie źródeł:** bez klatkowego odtworzenia pełnych strumieni wideo. `[SEL]` oznacza potwierdzenie strony/opisu lub widocznego UI, `[WNIOSEK]` hipotezę, `[MV]` autorską propozycję.

### Własna kolejność realizacji

**P0** „+” + zgodne operacje SN + selekcja/właściwości/walidacja + E2E.  
**P1** warianty, cofnij/ponów, kopiowanie zgodnych parametrów, analizy na SLD.  
**P2** opcjonalne udoskonalenia raportów i szablonów.  
**P3 (zablokowane na teraz)** GIS, MDI, mapy, import różnicowy geograficzny, telemechanika DNP3.
