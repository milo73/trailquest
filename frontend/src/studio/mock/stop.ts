import type { Stop } from "../../api/types";

export const MOCK_STOP: Stop = {
  order: 4,
  poi: {
    id: "sint-bavokerk-haarlem",
    name: "Sint-Bavokerk",
    location: { lat: 52.3814, lon: 4.6363 },
    facts: [
      {
        key: "bouwperiode",
        value: "Gebouwd 1370–1520",
        source: { name: "Wikidata", license: "CC0", reference: "https://www.wikidata.org/wiki/Q584279" },
      },
      {
        key: "torenhoogte",
        value: "Torenhoogte: 78 meter",
        source: { name: "Wikidata", license: "CC0", reference: "https://www.wikidata.org/wiki/Q584279#P2048" },
      },
      {
        key: "bouwstijl",
        value: "Bouwstijl: Brabantse gotiek",
        source: { name: "Wikipedia", license: "CC-BY-SA", reference: "https://nl.wikipedia.org/wiki/Sint-Bavokerk_(Haarlem)" },
      },
      {
        key: "functie",
        value: "Functie: kerk · rijksmonument",
        source: { name: "OpenStreetMap", license: "ODbL", reference: "https://www.openstreetmap.org/way/41447726" },
      },
    ],
    background:
      "De Sint-Bavokerk is een gotische kruiskerk in het centrum van Haarlem, gebouwd tussen 1370 en 1520. De toren is 78 meter hoog.",
    background_source: {
      name: "Wikipedia",
      license: "CC-BY-SA",
      reference: "https://nl.wikipedia.org/wiki/Sint-Bavokerk_(Haarlem)",
    },
  },
  story:
    "Kijk eens omhoog. De toren van de Sint-Bavokerk schiet 78 meter de Haarlemse lucht in — eeuwenlang het eerste wat schippers op de Spaarne zagen opdoemen. Wat in 1370 als bescheiden kruiskerk begon, groeide in anderhalve eeuw uit tot dit gevaarte van Brabantse gotiek, afgerond rond 1520.",
  questions: [
    {
      type: "A",
      prompt:
        "Reken even mee: de toren is precies zo hoog als 13 op elkaar gestapelde grachtenpandjes van 6 m. Hoe hoog is de toren in meters?",
      answer: "78 meter",
      hint: "Denk aan de torenhoogte die in het verhaal staat.",
      gates: true,
    },
  ],
  primary_question_index: 0,
};
