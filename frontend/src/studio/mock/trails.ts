export type StudioTrailCard = {
  id: string;
  title: string;
  theme: string;
  status: "concept" | "live" | "review";
  distanceKm: number;
  stops: number;
  plays?: number;
  completion?: number;
  rating?: number;
  warnings?: number;
};

export const MOCK_TRAILS: StudioTrailCard[] = [
  {
    id: "1",
    title: "Haarlems Gouden Eeuw",
    theme: "Historisch",
    status: "concept",
    distanceKm: 5.2,
    stops: 7,
    warnings: 1,
  },
  {
    id: "2",
    title: "Verborgen hofjes",
    theme: "Verborgen parels",
    status: "live",
    distanceKm: 3.1,
    stops: 5,
    plays: 412,
    completion: 62,
    rating: 4.7,
  },
  {
    id: "3",
    title: "Spaarne & molens",
    theme: "Natuur",
    status: "review",
    distanceKm: 8.0,
    stops: 6,
  },
  {
    id: "4",
    title: "Kinderspeurtocht centrum",
    theme: "Familie",
    status: "live",
    distanceKm: 2.0,
    stops: 5,
    plays: 828,
    completion: 71,
    rating: 4.8,
  },
];

export const MOCK_DASHBOARD_STATS = {
  trails: 5,
  plays: 1240,
  rating: 4.5,
  correctness: 99,
};
