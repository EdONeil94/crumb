// ─── CATEGORY / TASTING-DIMENSION TAXONOMY ─────────────────────────────────────
// Static, read-only data + pure derivation functions — no shared mutable
// state, no DOM access, no Firebase. Extracted as-is from src/legacy-app.js's
// STATE section (first module carved out per the pages/components split —
// see CLAUDE.md's "carving legacy-app.js" milestone).

export const CATEGORY_TREE = {
  bread: {
    label: 'Bread', emoji: '🍞',
    subs: {
      sourdough: 'Sourdough', baguette: 'Baguette', rye: 'Rye', focaccia: 'Focaccia',
      ciabatta: 'Ciabatta', wholemeal: 'Wholemeal', soda_bread: 'Soda Bread',
      fruit_loaf: 'Fruit Loaf', teacake: 'Teacake',
      brioche_loaf: 'Brioche Loaf', spelt: 'Spelt', flatbread: 'Flatbread'
    }
  },
  pastry: {
    label: 'Pastry', emoji: '🥐',
    subs: {
      croissant: 'Croissant', pain_au_chocolat: 'Pain au Chocolat',
      danish: 'Danish', almond_croissant: 'Almond Croissant',
      pain_aux_raisins: 'Pain aux Raisins', kouign_amann: 'Kouign-Amann',
      eclair: 'Éclair', profiterole: 'Profiterole', mille_feuille: 'Mille-feuille',
      vol_au_vent: 'Vol-au-vent', galette: 'Galette', cruffin: 'Cruffin', palmera: 'Palmera'
    }
  },
  cake: {
    label: 'Cake', emoji: '🎂',
    subs: {
      victoria_sponge: 'Victoria Sponge', carrot_cake: 'Carrot Cake',
      lemon_drizzle: 'Lemon Drizzle', chocolate_cake: 'Chocolate Cake',
      cheesecake: 'Cheesecake', banana_bread: 'Banana Bread',
      coffee_cake: 'Coffee & Walnut', red_velvet: 'Red Velvet',
      fruit_cake: 'Fruit Cake', opera: 'Opera Cake',
      bundt: 'Bundt Cake', swiss_roll: 'Swiss Roll'
    }
  },
  cheesecake: {
    label: 'Cheesecake', emoji: '🍰',
    subs: {
      baked_cheesecake: 'Baked Cheesecake', ny_cheesecake: 'New York Cheesecake',
      no_bake_cheesecake: 'No-Bake Cheesecake', japanese_cheesecake: 'Japanese Cheesecake',
      basque_cheesecake: 'Basque Burnt Cheesecake', fruit_cheesecake: 'Fruit Cheesecake',
      chocolate_cheesecake: 'Chocolate Cheesecake', mini_cheesecake: 'Mini Cheesecake'
    }
  },
  tart: {
    label: 'Tart & Pie', emoji: '🥧',
    subs: {
      lemon_tart: 'Lemon Tart', custard_tart: 'Custard Tart',
      fruit_tart: 'Fruit Tart', egg_tart: 'Egg Tart',
      treacle_tart: 'Treacle Tart', bakewell: 'Bakewell Tart',
      quiche: 'Quiche', pithivier: 'Pithivier',
      portuguese_tart: 'Pastel de Nata', pecan_pie: 'Pecan Pie'
    }
  },
  bun: {
    label: 'Buns & Rolls', emoji: '🥐',
    subs: {
      cinnamon_bun: 'Cinnamon Bun', chelsea_bun: 'Chelsea Bun',
      hot_cross_bun: 'Hot Cross Bun', sticky_bun: 'Sticky Bun',
      dinner_roll: 'Dinner Roll', brioche_bun: 'Brioche Bun',
      bath_oliver: 'Bath Oliver', iced_bun: 'Iced Bun',
      devonshire_split: 'Devonshire Split', cardamom_bun: 'Cardamom Bun', coffee_bun: 'Coffee Bun'
    }
  },
  cookie: {
    label: 'Biscuits & Cookies', emoji: '🍪',
    subs: {
      chocolate_chip: 'Chocolate Chip Cookie', shortbread: 'Shortbread',
      brownie: 'Brownie', blondie: 'Blondie',
      macaroon: 'Macaroon', florentine: 'Florentine',
      flapjack: 'Flapjack', millionaire: "Millionaire's Shortbread",
      digestive: 'Digestive', gingerbread: 'Gingerbread'
    }
  },
  sandwich: {
    label: 'Sandwiches & Savoury', emoji: '🥪',
    subs: {
      sandwich: 'Sandwich', sausage_roll: 'Sausage Roll',
      pasty: 'Pasty', pie_slice: 'Pie Slice',
      cheese_scone: 'Cheese Scone', savoury_tart: 'Savoury Tart',
      flatbread_wrap: 'Flatbread Wrap', toastie: 'Toastie',
      scotch_egg: 'Scotch Egg', empanada: 'Empanada'
    }
  },
  scone: {
    label: 'Scones & Tea Cakes', emoji: '☕',
    subs: {
      plain_scone: 'Plain Scone', fruit_scone: 'Fruit Scone',
      cream_scone: 'Cream Scone', welsh_cake: 'Welsh Cake',
      crumpet: 'Crumpet', teacake: 'Teacake',
      muffin_english: 'English Muffin', pikelet: 'Pikelet',
      lardy_cake: 'Lardy Cake', bara_brith: 'Bara Brith'
    }
  },
  sweet_treat: {
    label: 'Sweet Treats', emoji: '🍬',
    subs: {
      doughnut: 'Doughnut', churro: 'Churro',
      waffle: 'Waffle', crepe: 'Crêpe',
      cannoli: 'Cannoli', baklava: 'Baklava',
      meringue: 'Meringue', macaron: 'Macaron',
      madeleine: 'Madeleine', chouquette: 'Chouquette'
    }
  },
  british_classic: {
    label: 'British Classics', emoji: '🫖',
    subs: {
      bread_butter_pudding: 'Bread & Butter Pudding',
      spotted_dick: 'Spotted Dick',
      cornflake_tart: 'Cornflake Tart',
      jam_roly_poly: 'Jam Roly-Poly',
      treacle_sponge: 'Treacle Sponge',
      rice_pudding: 'Rice Pudding',
      eton_mess: 'Eton Mess',
      summer_pudding: 'Summer Pudding',
      trifle: 'Trifle',
      syllabub: 'Syllabub',
      bakewell_pudding: 'Bakewell Pudding',
      apple_crumble: 'Apple Crumble',
      bread_pudding: 'Bread Pudding',
      manchester_tart: 'Manchester Tart',
      chelsea_bun_pudding: 'Steamed Sponge Pudding',
    }
  },
  other: {
    label: 'Other', emoji: '✦',
    subs: { other: 'Other / Not listed' }
  }
};

// Flat lookup helpers
export const CATEGORIES = {}; // subKey -> emoji (for backward compat)
export const SUB_TO_PARENT = {}; // subKey -> parentKey
export const SUB_LABEL = {}; // subKey -> label
Object.entries(CATEGORY_TREE).forEach(([parentKey, parent]) => {
  CATEGORIES[parentKey] = parent.emoji;
  Object.entries(parent.subs).forEach(([subKey, subLabel]) => {
    CATEGORIES[subKey] = parent.emoji;
    SUB_TO_PARENT[subKey] = parentKey;
    SUB_LABEL[subKey] = subLabel;
  });
});

export function getCategoryDisplay(item) {
  const sub = item.subCategory;
  const cat = item.category;
  if (sub && SUB_LABEL[sub]) {
    const parent = CATEGORY_TREE[SUB_TO_PARENT[sub] || cat];
    return { main: parent?.label || cat, sub: SUB_LABEL[sub], emoji: parent?.emoji || '✦' };
  }
  if (cat && CATEGORY_TREE[cat]) {
    return { main: CATEGORY_TREE[cat].label, sub: null, emoji: CATEGORY_TREE[cat].emoji };
  }
  return { main: 'Other', sub: null, emoji: '✦' };
}

export const TASTING_DIMS_UNIVERSAL = [
  { label: 'Appearance', tip: 'Does it look the part?' },
  { label: 'Texture',    tip: 'The mouthfeel and structure' },
  { label: 'Flavour',    tip: 'The overall taste' },
  { label: 'Value',      tip: 'Worth the price?' },
];

export const TASTING_DIM_5TH = {
  bread:          { key: 'dim_crust',       label: 'Crust',           tip: 'Quality and character of the crust' },
  pastry:         { key: 'dim_lamination',  label: 'Lamination',      tip: 'The layers and flakiness' },
  cake:           { key: 'dim_moistness',   label: 'Moistness',       tip: 'The crumb and moisture level' },
  cheesecake:     { key: 'dim_set',         label: 'Set & Consistency', tip: 'Firmness and texture of the filling' },
  tart:           { key: 'dim_pastrybase',  label: 'Pastry Base',     tip: 'The shortcrust or puff underneath' },
  bun:            { key: 'dim_sweetness',   label: 'Sweetness',       tip: 'The balance of sugar' },
  cookie:         { key: 'dim_sweetness',   label: 'Sweetness',       tip: 'The balance of sugar' },
  sandwich:       { key: 'dim_freshness',   label: 'Freshness',       tip: 'Ingredients and assembly quality' },
  scone:          { key: 'dim_lightness',   label: 'Lightness',       tip: 'The rise and airiness' },
  sweet_treat:    { key: 'dim_sweetness',   label: 'Sweetness',       tip: 'The balance of sugar' },
  british_classic:{ key: 'dim_comfort',     label: 'Comfort factor',  tip: 'Does it hit the spot?' },
};

// Default 5th dim for uncategorised items — Sweetness is broadly applicable
export const DEFAULT_DIM_5TH = { key: 'dim_sweetness', label: 'Sweetness', tip: 'The balance of sugar' };

export function getTastingDims(category) {
  const fifth = TASTING_DIM_5TH[category] || DEFAULT_DIM_5TH;
  return [
    ...TASTING_DIMS_UNIVERSAL.map(d => ({ key: 'dim_' + d.label.toLowerCase(), label: d.label, tip: d.tip })),
    fifth
  ];
}

// Legacy flat list — verified zero references anywhere outside this
// declaration as of the pages/components carving (2026-08-24). Moved as-is
// rather than deleted, since removing dead code wasn't this extraction's
// job; worth deleting in a follow-up if it's still unused then.
export const TASTING_DIMS = ['Appearance', 'Texture', 'Flavour', 'Value', 'dim5'];
