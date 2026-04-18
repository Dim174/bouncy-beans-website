// Rental catalog — edit here to add/remove/reprice items.
// IDs must be unique and URL-safe.

export const ITEMS = [
  {
    id: "baby-beans",
    name: "Baby Beans",
    ageRange: "Ages 0–3",
    price: 250,
    features: [
      "6×6 – 8×8 ft play area",
      "Tunnel",
      "Soft blocks",
      "Hopper",
      "2 climbing structures",
      "Ball pit",
      "Slide",
      "Soft mats",
      "Gated area",
    ],
  },
  {
    id: "big-beans",
    name: "Big Beans",
    ageRange: "Ages 0–6",
    price: 450,
    features: [
      "Up to 32×32 ft play area",
      "Climbing rainbow + tunnel",
      "Soft blocks",
      "Large climbing structure with double-sided slide",
      "Soft car",
      "Hopper",
      "Medium ball pit with stairs and 1,000 tan & white balls",
      "Safety mats",
      "White gates",
    ],
  },
  {
    id: "bounce-6ft",
    name: "6FT White Bounce House with Slide and Ball Pit",
    ageRange: null,
    price: 70,
    features: [
      "Overall size: 9×9×7 ft",
      "Bounce area: 6×6 ft",
      "Slide & ball pit: 3 ft each side",
      "Weight capacity: 160 kg",
    ],
  },
  {
    id: "bounce-9ft",
    name: "9FT White Bounce House",
    ageRange: null,
    price: 150,
    features: [
      "Size: 8×8×8 ft",
      "Weight capacity: 250 kg",
    ],
  },
];

export function getItemById(id) {
  return ITEMS.find((i) => i.id === id);
}
