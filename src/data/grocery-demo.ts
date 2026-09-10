export type GroceryOption = {
  store: string;
  total: string;
  meals: string[];
  costs: string[];
  spotlight: {
    meal: string;
    instructions: string;
    ingredients: Array<{ item: string; size: string; units: string; total: string }>;
  };
};

/** Selected from approved synthetic sample_menu_response.json; not live prices. */
export const groceryOptions: GroceryOption[] = [
  {
    "store": "Walmart",
    "total": "$270.85 (meal-level demo total)",
    "meals": [
      "Smash burgers with oven potatoes",
      "Chicken thigh tacos with corn and tomato",
      "Greek chicken pitas with cucumber salad",
      "Ground chicken taco bowls",
      "Roast chicken, potatoes, and cucumber-tomato salad",
      "Beef quesadillas with black bean and corn salad"
    ],
    "costs": [
      "$43.32 (includes estimates)",
      "$49.26",
      "$46.89 (includes estimates)",
      "$42.13",
      "$36.95 (includes estimates)",
      "$52.30"
    ],
    "spotlight": {
      "meal": "Smash burgers with oven potatoes",
      "instructions": "Form thin beef patties, sear on a hot pan, add cheese, and serve on buns. Cut potatoes into wedges, season, and roast until browned.",
      "ingredients": [
        {
          "item": "Lean ground beef",
          "size": "1.1 kg pack",
          "units": "2",
          "total": "$25.94"
        },
        {
          "item": "Hamburger buns",
          "size": "8-pack",
          "units": "2",
          "total": "$5.94"
        },
        {
          "item": "Cheddar cheese",
          "size": "400 g",
          "units": "1",
          "total": "$4.97"
        },
        {
          "item": "Yellow potatoes",
          "size": "5 lb bag",
          "units": "1",
          "total": "$3.97"
        },
        {
          "item": "Ketchup/mustard",
          "size": "shared condiments",
          "units": "1",
          "total": "$2.50 (estimate)"
        }
      ]
    }
  },
  {
    "store": "Independent",
    "total": "$293.62 (meal-level demo total)",
    "meals": [
      "Roast chicken fajita bowls",
      "Smash burgers with cucumber-tomato salad",
      "Greek chicken pitas with yogurt-cucumber sauce",
      "Ground beef tacos with black beans and corn",
      "Sheet-pan chicken thighs and potatoes with Greek salad",
      "Ground chicken pasta with tomato sauce and salad"
    ],
    "costs": [
      "$52.94 (includes estimates)",
      "$48.43 (includes estimates)",
      "$48.42",
      "$56.89 (includes estimates)",
      "$44.44",
      "$42.50"
    ],
    "spotlight": {
      "meal": "Roast chicken fajita bowls",
      "instructions": "Roast the chickens, pull the meat, and serve over rice with sautéed peppers/onions, corn, lettuce, and yogurt sauce.",
      "ingredients": [
        {
          "item": "Whole chicken",
          "size": "approx. 2 kg",
          "units": "2",
          "total": "$21.98"
        },
        {
          "item": "Long grain rice",
          "size": "2 kg bag",
          "units": "1",
          "total": "$7.49"
        },
        {
          "item": "Frozen corn",
          "size": "750 g",
          "units": "1",
          "total": "$2.49"
        },
        {
          "item": "Romaine lettuce",
          "size": "3-pack",
          "units": "1",
          "total": "$3.99"
        },
        {
          "item": "Bell peppers",
          "size": "3-pack",
          "units": "2",
          "total": "$9.00 (estimate)"
        },
        {
          "item": "Onions",
          "size": "3 lb bag",
          "units": "1",
          "total": "$3.50 (estimate)"
        },
        {
          "item": "Plain yogurt",
          "size": "750 g",
          "units": "1",
          "total": "$4.49"
        }
      ]
    }
  }
];
