// Server-side mirror of the tasting-dimension definitions in
// src/data/categories.js. Kept deliberately small and in sync by hand: it is
// only the category keys and the per-category 5th dimension, which change
// rarely. submitReview / updateReview (C1, C1b) validate an incoming `dims`
// object against getTastingDims(category) from here.

const CATEGORY_KEYS = [
  'bread', 'pastry', 'cake', 'cheesecake', 'tart', 'bun',
  'cookie', 'sandwich', 'scone', 'sweet_treat', 'british_classic', 'other',
];

const UNIVERSAL_DIM_KEYS = ['dim_appearance', 'dim_texture', 'dim_flavour', 'dim_value'];

const FIFTH_DIM_KEY = {
  bread: 'dim_crust',
  pastry: 'dim_lamination',
  cake: 'dim_moistness',
  cheesecake: 'dim_set',
  tart: 'dim_pastrybase',
  bun: 'dim_sweetness',
  cookie: 'dim_sweetness',
  sandwich: 'dim_freshness',
  scone: 'dim_lightness',
  sweet_treat: 'dim_sweetness',
  british_classic: 'dim_comfort',
};
const DEFAULT_FIFTH_DIM_KEY = 'dim_sweetness';

function getTastingDimKeys(category) {
  const fifth = FIFTH_DIM_KEY[category] || DEFAULT_FIFTH_DIM_KEY;
  return [...UNIVERSAL_DIM_KEYS, fifth];
}

const isCategoryKey = (c) => CATEGORY_KEYS.includes(c);

module.exports = { CATEGORY_KEYS, getTastingDimKeys, isCategoryKey };
