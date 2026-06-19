# Product Requirements Document — TrailQuest (v2)

| | |
|---|---|
| **Productnaam** | TrailQuest (werknaam) |
| **Versie** | 2.0 (uitgewerkt) |
| **Status** | Concept — ter review |
| **Type** | Mobiele app, AI-gegenereerde interactieve speurtochten |

---

## 1. Samenvatting (TL;DR)

TrailQuest genereert automatisch een gepersonaliseerde, interactieve speurtocht op basis van een startlocatie, gewenste afstand en thema. De gebruiker wordt langs interessante plekken geleid en krijgt onderweg verhalen, raadsels en opdrachten — "alsof een lokale gids en een escape room samen een wandeling hebben ontworpen".

De grootste productuitdaging is **niet** het bouwen van routes, maar het garanderen dat de gegenereerde content **klopt en verifieerbaar is**. Een taalmodel kan niet betrouwbaar weten hoeveel leeuwen er boven een specifieke deur hangen, en kan het antwoord van de gebruiker daarop ook niet controleren. Deze PRD lost dat op door een strikte scheiding tussen *opgehaalde, verifieerbare feiten* en *gegenereerde tekst*, en door vraagtypen te classificeren naar verifieerbaarheid (zie §8).

---

## 2. Probleemstelling

Bij het bezoeken van een nieuwe stad, dorp of natuurgebied missen mensen de verhalen, verborgen locaties en lokale geschiedenis om hen heen. Bestaande wandelapps leveren een route en hooguit statische POI-tekst, maar geen beleving: geen verrassing, geen spel, geen reden om écht te kijken.

Onderliggende behoeften:
- **Ontdekken** zonder vooraf research te doen of een gids te boeken.
- **Plezier & spel** — een doel en beloning, niet alleen een lijn op een kaart.
- **Op maat** — passend bij beschikbare tijd, gezelschap (kinderen?) en interesse.
- **Spontaniteit** — "we hebben twee uur, verras ons" vanaf waar je nu staat.

---

## 3. Productvisie & unieke waardepropositie

> "Ontdek elke stad alsof er speciaal voor jou een interactieve speurtocht is gemaakt."

Een mobiele app die op basis van startlocatie, afstand en thema een speurtocht genereert, de gebruiker langs interessante locaties leidt, en per stop dynamisch een verhaal, weetje, raadsel of vraag toont. Correct beantwoorden ontgrendelt de volgende stop. Onderweg verdient de gebruiker punten en badges.

**Differentiatie t.o.v. bestaande oplossingen:**
- Komuto/Wandelknooppunten e.d. → route, geen verhaal/spel.
- Stadswandelgidsen/audiotours (vaste tours) → niet dynamisch, niet vanaf elke locatie, beperkte dekking.
- Geocaching → spel, maar afhankelijk van door gebruikers geplaatste caches; geen verhaallijn op maat.

TrailQuest combineert *generatief op maat* + *verhaal* + *gamification* + *vanaf elke startlocatie*. Dat is de wig.

---

## 4. Doelgroep & personas

**Primair**
- Toeristen / stedentrippers
- Gezinnen met kinderen
- Recreatieve wandelaars
- Mensen die hun eigen of een nieuwe omgeving willen (her)ontdekken

**Secundair**
- Scholen (educatieve uitjes)
- Bedrijven (teamuitjes)
- Expats
- Cultuur- en geschiedenisliefhebbers

**Personas (kort)**
- **Sanne (34), stedentripper** — weekend in een onbekende stad, wil "het echte verhaal" zonder uren research. Waarde: kwaliteit content, gemak.
- **Familie De Vries** — twee kinderen (7, 10), wil ze 1,5 uur bezig en betrokken houden. Waarde: familievriendelijk thema, makkelijke raadsels, beloningen.
- **Docent Karim** — wil een klas van 28 leerlingen langs historische plekken sturen. Waarde: betrouwbare feiten, groepsmodus, veiligheid/afzetten van scope.

---

## 5. Scope

**In scope (MVP)**
- Startlocatie kiezen (GPS / zoeken / kaart)
- Afstand + thema kiezen
- Route- en speurtochtgeneratie (rondlopende route, start ≈ eindpunt)
- Navigatie per stop + content per stop
- Antwoordafhandeling (gating op verifieerbare vraagtypen)
- Basis-gamification (punten, badges, voltooide routes)
- Eén tot enkele steden als gevalideerde launch-regio's

**Out of scope (MVP, → roadmap)**
- Multiplayer / teams / competities
- Audio guide (AI-stem)
- Augmented Reality
- Community-routes (door gebruikers gepubliceerd)
- Volledige offline-modus
- Gastmodus in MVP: spelen kan zonder account (zie §19)

---

## 6. User stories & flows

### Kern-user story
> Als gebruiker wil ik een locatie en wandelafstand invoeren, zodat ik automatisch een interactieve speurtocht krijg die mij langs interessante plekken leidt.

### Aanvullende stories
- Als ouder wil ik een familievriendelijk thema kiezen, zodat de raadsels passen bij mijn kinderen.
- Als gebruiker wil ik bij een verkeerd antwoord een hint, zodat ik niet vastloop.
- Als gebruiker wil ik feedback geven op een feit dat niet klopt, zodat de content verbetert.
- Als wandelaar wil ik dat de route over echt beloopbare paden gaat (geen snelweg, geen privéterrein), zodat ik veilig aankom.
- Als gebruiker wil ik een tocht kunnen pauzeren en later hervatten, zodat ik niet aan één sessie vastzit.

### Hoofdflow
1. Open app → (optioneel) inloggen of als gast doorgaan.
2. Kies startlocatie: huidige GPS / zoeken / pin op kaart.
3. Kies afstand (2 / 5 / 10 / 15 km / custom).
4. Kies thema (historisch / verborgen parels / familievriendelijk / architectuur / natuur / gemengd).
5. **Genereer** → app toont voorvertoning (kaart, afstand, geschatte duur, aantal stops).
6. **Start** → navigatie naar stop 1.
7. Bij aankomst (geofence): content verschijnt automatisch (verhaal + opdracht).
8. Los op → bij correct/afgerond: punten + volgende stop ontgrendeld.
9. Herhaal tot laatste stop.
10. Afronding: samenvatting, score, verdiende badges, deel/herhaal-optie.

### Belangrijke alternatieve paden
- **Geen/weinig POI's in straal** → app stelt grotere straal, ander thema of "gemengd" voor (zie §13).
- **GPS-drift / aankomst niet gedetecteerd** → handmatige "Ik ben er"-knop met plausibiliteitscheck.
- **Verkeerd antwoord** → hint na poging 1, antwoord onthullen + door na 3 pogingen (geen doodlopend spel; stops zijn niet skipbaar).
- **Verbinding weg** → reeds gegenereerde tocht blijft bruikbaar via lokale cache (zie §9, §11).

---

## 7. Functionele requirements (MVP)

### 7.1 Locatie invoeren
- Huidige GPS-locatie gebruiken (met permissie-flow).
- Locatie zoeken (adres/plaats/POI, geocoding).
- Startpunt op kaart prikken.
- Validatie: startpunt moet binnen een gedekt gebied vallen en op/bij beloopbaar netwerk liggen.

### 7.2 Route configureren
- Afstand: 2 / 5 / 10 / 15 km / custom (met min/max grenzen, bv. 1–25 km).
- Thema: historisch · verborgen parels · familievriendelijk · architectuur · natuur · gemengd.
- Optioneel (nice-to-have): toegankelijkheid (rolstoel/kinderwagen → mijd trappen/onverhard), tijd i.p.v. afstand ("ik heb 90 min").

### 7.3 Route-generatie (algoritme)
Stappen:
1. **POI-kandidaten ophalen** binnen straal (afgeleid van gekozen afstand) uit POI-bronnen (§10).
2. **Scoren & filteren** op themarelevantie, datakwaliteit (heeft het een verifieerbaar feit?), spreiding en "interessantheid".
3. **Selecteren** van het juiste aantal stops voor de doelafstand (bv. richtgetal ± stops per km).
4. **Route bouwen** over het *wandel*netwerk (niet hemelsbreed): een rondlopende route (start ≈ eind) die stops in logische volgorde verbindt en backtracking minimaliseert.
5. **Optimaliseren** richting doelafstand (binnen tolerantie, bv. ±15%) en op beloopbaarheid/veiligheid.
6. **Content koppelen/genereren** per stop (zie §8) — bij voorkeur uit cache.

Technische bouwstenen: routing engine over OSM (bv. OSRM/GraphHopper/Valhalla, walking profile); stop-selectie als variant op een oriëntatie-/prijs-verzamelend routeprobleem (kies subset POI's die waarde maximaliseert binnen afstandsbudget). Exact algoritme = ontwerpbeslissing, maar de afstand moet over het *padennetwerk* gelden.

**Output van generatie:** kaart, totale afstand, geschatte duur (op basis van loopsnelheid + leestijd/opdrachttijd per stop), aantal stops.

### 7.4 Speurtocht-stops
Per stop:
- **Navigatie:** kaartweergave, looproute naar de stop, resterende afstand/tijd.
- **Aankomstdetectie:** geofence rond de stop (radius afgestemd op GPS-nauwkeurigheid) + handmatige fallback.
- **Content bij aankomst (automatisch):** verhaal, historische context, leuk weetje, en één opdracht (raadsel/vraag).
- **Afhandeling:** antwoord → feedback → bij correct/afgerond ontgrendelt de volgende stop.

### 7.5 Gamification
- **Punten:** per opgeloste opdracht, bonus voor zonder hint / in één poging.
- **Badges:** bv. Historicus, Ontdekkingsreiziger, Stadskenner, plus streak-/volume-badges.
- **Voltooide routes:** historie + herhaalbaarheid.
- Ontwerpregel: gamification mag de gebruiker niet *doodlopend* zetten (zie hint-/onthul-mechaniek). Plezier > moeilijkheid.

---

## 8. AI-architectuur & content-accuratesse (kern)

Dit hoofdstuk lost het centrale risico op: **AI mag geen feiten verzinnen en mag geen rechter zijn over iets wat het niet kan waarnemen.**

### 8.1 Twee soorten content, strikt gescheiden
1. **Grondwaarheid (retrieved):** verifieerbare feiten uit gestructureerde/betrouwbare bronnen — bouwjaar, hoogte, architect, functie, beschermde status — uit Wikidata/Wikipedia/OSM-tags. Dit is de *bron van waarheid*.
2. **Gegenereerde tekst (LLM):** verhaal, toon, raadselvorm, sfeer. Het LLM **herformuleert en verlevendigt** de grondwaarheid, maar introduceert geen nieuwe controleerbare feiten.

Methode: **RAG (retrieval-augmented generation)**. Het model krijgt alleen de opgehaalde feiten + bronverwijzing als context, met de instructie: gebruik uitsluitend deze feiten; verzin niets; als een feit ontbreekt, laat het weg. Elke feitelijke bewering bewaart een **bron-referentie**.

### 8.2 Vraagtypen, geclassificeerd naar verifieerbaarheid
Dit is de oplossing voor het "hoeveel leeuwen boven de deur?"-probleem.

| Type | Voorbeeld | Antwoord verifieerbaar door systeem? | Mag het de volgende stop *gaten* (gate)? |
|---|---|---|---|
| **A — Datagebonden** | "Hoe hoog is deze toren?" (hoogte staat in Wikidata) | Ja — antwoord komt uit de data, vraag wordt *uit* het bekende antwoord gegenereerd | **Ja** |
| **B — Observatie/tellen** | "Hoeveel leeuwen zie je boven de ingang?" | **Nee** — alleen waarneembaar ter plaatse; LLM weet/controleert het niet | **Nee** (alleen via honor-system of geverifieerde content) |
| **C — Open/reflectie** | "Wat denk je dat hier vroeger stond?" | N.v.t. (geen goed/fout) | Ja, maar *altijd* doorlaten |
| **D — Raadsel op bekend feit** | Raadsel waarvan de oplossing een Type-A-feit is | Ja | **Ja** |

**MVP-regel:** automatische gating gebeurt alleen op **Type A** en **D** (antwoord zit in de data) en op **Type C** (altijd doorlaten). **Type B** wordt in de gegenereerde MVP-content **niet als poort** gebruikt — wel als *honor-systeem*: de vraag wordt gesteld, de gebruiker telt zelf, en de app onthult daarna ("Telde je er vier? Mooi gezien!") zonder een fout-pad. Echte geverifieerde Type-B-vragen (met een door mens/community gecontroleerd antwoord) komen via de content-curatielaag (roadmap), niet uit kale generatie.

Let op het voorbeeld uit v1 — "Domtoren, vraag over hoogte": de hoogte moet **uit Wikidata komen**, niet uit het model. De app stelt de vraag op basis van de opgehaalde waarde en kent zo het juiste antwoord. Verzint het model een hoogte, dan kan het ernaast zitten én is er geen betrouwbare check.

### 8.3 Kwaliteits- en veiligheidswaarborgen
- **Grounding-controle:** feiten zonder bron worden niet getoond als feit.
- **Confidence-drempel:** is er onvoldoende betrouwbare data voor een POI, dan val terug op een neutraal, niet-feitelijk verhaal of sla de POI over (liever geen stop dan een foute stop).
- **Transparantie:** content is herkenbaar AI-gegenereerd; bron(nen) inzichtelijk.
- **Feedbackknop per stop** ("klopt dit niet?") → voedt curatie/correctie.
- **Toon-/veiligheidsfilter:** familievriendelijk thema → leeftijdspassende taal; geen gevoelige/ongepaste inhoud.
- **Caching + steekproef:** populaire POI-content wordt vooraf gegenereerd, gecached en (steekproefsgewijs) door mensen gecontroleerd; long-tail on-demand met strengere grounding.

### 8.4 Modelkeuze
Model-agnostische abstractielaag (provider-onafhankelijk), zodat tussen aanbieders (bv. Claude, GPT, Gemini) gewisseld kan worden op kwaliteit/kosten/latentie. Generatie gebeurt server-side, niet op het toestel.

---

## 9. Technische architectuur

### 9.1 Componenten
- **Client (mobiel):** React Native. Kaart, navigatie, geofencing, content-weergave, lokale cache van de actieve tocht.
- **API / gateway:** auth, rate limiting, orkestratie.
- **Route-service:** POI-selectie + routing over wandelnetwerk (OSRM/GraphHopper/Valhalla).
- **POI-/data-service:** ophalen + normaliseren van POI's en feiten (OSM/Wikidata/Wikipedia), met eigen cache.
- **Content-service:** RAG-pipeline → genereert/serveert verhaal, weetjes, vragen per POI/thema. Schrijft naar content-store.
- **Content-store + cache:** per (POI × thema) gegenereerde content, met versie + bron + reviewstatus.
- **Gamification-/gebruikersservice:** punten, badges, voltooide routes, historie.

### 9.2 Datastromen (vereenvoudigd)
```
Gebruiker → Client → API
  → Route-service → (POI-service: OSM/Wikidata) → kandidaat-POI's
  → Route-service bouwt route + selecteert stops
  → Content-service: voor elke stop → cache-hit? serveer : RAG-genereer → cache
  → API → Client: route + per-stop content (vooruit geladen)
Tijdens lopen: geofence-events lokaal; content al op toestel → werkt ook bij wegvallende verbinding
```

### 9.3 Caching & kostenmodel (belangrijk)
Per gebruiker per tocht *live* alles genereren is traag én duur. Daarom:
- **Genereer per POI×thema één keer**, hergebruik voor alle gebruikers → kosten dalen sterk bij volume.
- **Pre-generatie** voor top-steden/-POI's (batch, vooraf gecontroleerd) → lage latentie, hoge kwaliteit.
- **On-demand** alleen voor de long tail, met strikte grounding.
- **Variatie** (zodat dezelfde POI niet exact dezelfde tekst geeft) via meerdere gecachte varianten i.p.v. elke keer opnieuw genereren.

Kostendrijvers om te monitoren: aantal generaties (niet sessies), routing-compute, kaart-API-tiles/geocoding. Caching verlaagt #generaties; daar zit de marge.

### 9.4 Backend-stack
Python/FastAPI voor de AI/RAG- en data-pipelines (rijk ecosysteem); Node.js mogelijk voor realtime/gateway-laag. Eén taal kiezen kan ook — beslissing afhankelijk van team.

---

## 10. Data & licenties

| Bron | Gebruik | Aandachtspunt |
|---|---|---|
| **OpenStreetMap** | POI's, wandelnetwerk, routing | ODbL — **attributie verplicht**; afgeleide data-voorwaarden |
| **Wikidata** | Gestructureerde feiten (hoogte, jaar, architect) | CC0 — vrij; ideaal als grondwaarheid voor Type-A-vragen |
| **Wikipedia** | Achtergrond/verhaal-context | CC BY-SA — **attributie + share-alike**; let op bij hergebruik van tekst |
| **Mapbox / Google Maps** | Kaarttiles, geocoding (alternatief/aanvulling) | Commerciële voorwaarden + kosten per gebruik; gebruikslimieten |
| **Lokale toeristische datasets** | Verrijking, verborgen parels | Per dataset licentie/afspraken checken |

Ontwerpbeslissing: **OSM + Wikidata als basis** (kosten + licentie gunstig), Wikipedia voor narratief (mits correcte attributie en bij voorkeur parafrasering, niet kopiëren), commerciële kaarten optioneel voor betere tiles/geocoding.

---

## 11. Non-functionele requirements

- **Performance:** generatie/voorvertoning binnen enkele seconden bij cache-hit; duidelijke laadstatus bij on-demand.
- **Betrouwbaarheid onderweg:** actieve tocht volledig op toestel gecached → blijft werken bij tijdelijk verbindingsverlies (volledige vooraf-download = roadmap).
- **Locatienauwkeurigheid:** geofence-radius adaptief aan GPS-nauwkeurigheid; handmatige fallback.
- **Toegankelijkheid:** leesbare contrasten, schaalbare tekst, screenreader-labels; optioneel toegankelijke routes (geen trappen/onverhard).
- **Schaalbaarheid:** stateless services + cache; pre-generatie als batch.
- **Internationalisatie:** meertalige content (start NL/EN), thema-/toonconsistentie per taal.
- **Veiligheid (fysiek):** routes mijden gevaarlijke wegen/privéterrein; waarschuwing "let op het verkeer / kijk niet alleen op je scherm".

---

## 12. Privacy, veiligheid & GDPR

- **Locatie is persoonsgegeven** → minimaliseer, wees transparant, vraag expliciete permissie, leg uit waarvoor.
- **Dataminimalisatie:** verwerk locatie voor routing/aankomstdetectie; bewaar niet meer dan nodig; anonimiseer/aggregeer voor metrics.
- **Minderjarigen:** gezinnen en scholen zijn doelgroep → leeftijdspassende content, geen profilering van kinderen, voorzichtige defaults; schoolcontext vraagt mogelijk aparte voorwaarden/verwerkersafspraken.
- **Toestemming & rechten:** inzage/verwijdering, helder privacybeleid, opslag bij voorkeur in EU.
- **Veiligheid in het veld:** disclaimers, geen routes door evident onveilig/verboden gebied.
- **AI-transparantie:** duidelijk dat content AI-gegenereerd is; correctiemogelijkheid.

---

## 13. Edge cases & foutafhandeling

| Situatie | Gedrag |
|---|---|
| Te weinig POI's in straal (platteland/dun gebied) | Stel grotere straal, "gemengd" thema, of natuur-thema voor; wees eerlijk over dekking |
| Geen verifieerbare feiten voor een POI | POI overslaan of niet-feitelijk verhaal; nooit verzinnen |
| Aankomst niet gedetecteerd (GPS-drift) | "Ik ben er"-knop met plausibiliteitscheck |
| Verkeerd antwoord | Hint na poging 1; antwoord onthullen + doorgaan na 3 pogingen (geen stop overslaan) |
| Verbinding valt weg | Actieve tocht draait door op cache; sync later |
| Doelafstand niet haalbaar (eilandje van paden) | Beste benadering + transparante melding over afwijking |
| Ongepaste/twijfelachtige gegenereerde content | Filter vooraf; feedbackknop; review-flag |

---

## 14. Succes-metrics

Definities + voorgestelde **richt**targets (hypotheses, te valideren):

| Metric | Definitie | Indicatieve target |
|---|---|---|
| Gegenereerde speurtochten | # succesvol gegenereerde tochten | Groei-KPI |
| Start-rate | % gegenereerd → gestart | > 70% |
| Voltooiingspercentage | % gestart → afgerond | > 50% |
| Gem. sessieduur | Mediane actieve tijd per tocht | Past bij gekozen afstand |
| Gem. beoordeling | Sterren/CSAT na afronden | ≥ 4,3 / 5 |
| Content-correctheid | % stops zonder "klopt niet"-melding | > 98% |
| Terugkerende gebruikers | % dat ≥ 2 tochten doet (bv. binnen 30 d) | Retentie-KPI |
| Kosten per voltooide tocht | AI + kaart + compute / voltooide tocht | Dalend bij volume (caching) |

Noord-ster-kandidaat: **# voltooide tochten met beoordeling ≥ 4** (combineert volume + plezier + kwaliteit).

---

## 15. Monetisatie (opties)

- **Freemium:** enkele gratis tochten/maand; abonnement voor onbeperkt + premiumthema's/steden.
- **Pay-per-quest:** losse tocht of stadspakket kopen.
- **B2B/B2G:** licenties voor scholen, bedrijven (teamuitjes), VVV's/toerisme-organisaties, musea.
- **Sponsored stops (voorzichtig):** lokale horeca/attracties als optionele stop — strikt gescheiden van redactionele content om vertrouwen te behouden.
- **White-label:** TrailQuest-engine onder merk van een stad/regio.

Aanbeveling: start consumenten-**freemium** + verken **B2B/B2G** vroeg (hogere bereidheid te betalen, lagere CAC).

---

## 16. Go-to-market

- **Lanceer per stad ("city-by-city"):** dek eerst 1–3 steden écht goed (gevalideerde, gecontroleerde content) i.p.v. overal matig.
- **Beachhead:** toeristische stad met veel verifieerbare POI's en hoge bezoekersdichtheid.
- **Kanalen:** toerisme-partners/VVV, hotels, app-store-vindbaarheid, social (visuele "ontdek je stad"-content), scholen/bedrijven voor B2B.
- **Bewijs eerst kwaliteit** (content-correctheid + beoordeling), dan pas opschalen naar de long tail van locaties.

---

## 17. Roadmap / fasering

**Fase 0 — Validatie (pre-MVP)**
- 1 stad, handmatig/semi-gecureerde content, kleine groep testers. Bewijst: lopen mensen het af en vinden ze het leuk + klopt de content?

**Fase 1 — MVP**
- Locatie/afstand/thema → generatie → navigatie → stops met content → gating (Type A/C/D) + honor-system (B) → basis-gamification. 1–3 steden.

**Fase 2 — Kwaliteit & schaal**
- Content-curatielaag (geverifieerde Type-B-vragen), meer steden, pre-generatie-pipeline, meertaligheid, toegankelijke routes.

**Fase 3 — Beleving (uit v1 "toekomstig")**
- Audio guide (AI-stem), volledige offline-modus.

**Fase 4 — Sociaal & immersief**
- Multiplayer/teams/competities, community-routes (met moderatie), AR.

---

## 18. Risico's & mitigaties

| Risico | Impact | Mitigatie |
|---|---|---|
| **AI verzint feiten** | Vertrouwensverlies, slechte ervaring | RAG + grounding, feiten uit Wikidata, vraagtype-classificatie, feedback/curatie (§8) |
| Onverifieerbare antwoorden gaten de voortgang | Spelers lopen vast / frustratie | Alleen Type A/C/D gaten; Type B = honor-system; hint/onthul-mechaniek |
| Te dunne POI-dekking buiten steden | Beperkte markt | City-by-city launch; natuur-thema; transparante dekking |
| AI-/kaartkosten lopen op | Marge onder druk | Caching per POI×thema, pre-generatie, model-agnostisch, monitoring #generaties |
| Slechte/onveilige route (verkeer, privé) | Veiligheid + reputatie | Routing over gevalideerd wandelnetwerk, veiligheidsfilters, disclaimers |
| Licentie/attributie (OSM/Wikipedia) | Juridisch | Correcte attributie, parafraseren i.p.v. kopiëren, licentiecheck per bron |
| Privacy/GDPR (locatie, kinderen) | Juridisch + vertrouwen | Dataminimalisatie, expliciete consent, EU-opslag, kindvriendelijke defaults |
| GPS-onnauwkeurigheid breekt aankomstdetectie | Frictie | Adaptieve geofence + handmatige fallback |

---

## 19. Genomen beslissingen

De openstaande vragen uit eerdere versies zijn als volgt besloten:

| # | Vraag | Beslissing | Implicatie |
|---|---|---|---|
| 1 | Account verplicht of gastmodus? | **Gastmodus** — spelen kan zonder account | Lagere drempel; gamification/historie koppelen aan optioneel later aan te maken account |
| 2 | Eerste launch-stad(en)? | **Haarlem** | Content-investering + GTM richten op Haarlem; veel verifieerbare POI's, compact wandelbaar centrum |
| 3 | Frontend | **React Native** | Eén codebase iOS/Android; kaart-, geofencing- en cache-libraries kiezen binnen RN-ecosysteem |
| 4 | Kaart-stack | **Gratis optie (bv. Google Maps free tier)** | Start op een kosteloos kaart-/geocoding-aanbod; bewaak gebruikslimieten; OSM blijft bron voor POI's/routing |
| 5 | Gating-strengheid | **3 pogingen vóór onthullen; geen stops overslaan** | Na 3 foute pogingen wordt het antwoord onthuld en gaat de tocht door; stops zijn niet skipbaar (lineaire voortgang) |
| 6 | Curatie-model | **Puur AI + steekproef** | Geen mens-in-the-loop per POI in MVP; steekproefsgewijze controle + feedbackknop voeden correctie |
| 7 | Tijd- i.p.v. afstand-invoer in MVP? | **Nee** | MVP is uitsluitend afstand-gebaseerd; tijd-invoer is roadmap |
| 8 | Monetisatie-prioriteit | **Consument-first** | Start met consumenten-freemium; B2B/B2G later verkennen |

---

*Einde PRD v2. Wijzigingen t.o.v. v1: toegevoegd — accuratesse-/vraagtypenmodel (§8), systeemarchitectuur + caching/kosten (§9), licenties (§10), NFR's (§11), privacy/GDPR (§12), edge cases (§13), meetbare metrics (§14), monetisatie (§15), GTM (§16), fasering (§17), risicotabel (§18), open vragen (§19).*
