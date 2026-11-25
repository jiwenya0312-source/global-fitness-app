import type { Food, Meal } from './nutrition';

// USDA FoodData Central, SR Legacy April 2018. Nutrient values are per 100 g.
// Serving weights are editable UI estimates, independent of the nutrient source.
type Row = readonly [id: number, zh: string, en: string, grams: number, kcal: number,
  protein: number, carbs: number, fat: number, keywords: string];

const rows: readonly Row[] = [
  [169757, "熟米饭", "Cooked white rice", 150, 130, 2.69, 28.17, 0.28, "米饭 白饭 大米"],
  [169756, "生大米", "Raw white rice", 50, 365, 7.13, 79.95, 0.66, "生米 大米"],
  [169704, "熟糙米饭", "Cooked brown rice", 150, 123, 2.74, 25.58, 0.97, "糙米"],
  [173424, "水煮鸡蛋", "Hard-boiled egg", 50, 155, 12.58, 1.12, 10.61, "煮鸡蛋 鸡蛋 水煮蛋"],
  [171477, "烤去皮鸡胸肉", "Roasted skinless chicken breast", 120, 165, 31.02, 0, 3.57, "鸡肉 鸡胸"],
  [172475, "北豆腐（未烹调）", "Firm tofu, uncooked", 100, 144, 17.27, 2.78, 8.72, "豆腐 老豆腐"],
  [172449, "嫩豆腐（未烹调）", "Soft tofu, uncooked", 100, 61, 7.17, 1.18, 3.69, "豆腐"],
  [171265, "全脂牛奶", "Whole milk", 245, 61, 3.15, 4.8, 3.25, "奶 纯牛奶"],
  [169705, "干燕麦", "Dry oats", 40, 389, 16.89, 66.27, 6.9, "燕麦片 oatmeal"],
  [173944, "香蕉", "Banana", 118, 89, 1.09, 22.84, 0.33, ""],
  [171688, "带皮苹果", "Apple with skin", 182, 52, 0.26, 13.81, 0.17, ""],
  [172688, "全麦面包", "Whole-wheat bread", 32, 252, 12.45, 42.71, 3.5, "吐司 toast"],
  [168928, "熟意大利面", "Cooked pasta", 140, 158, 5.8, 30.86, 0.93, "意面 面条"],
  [168917, "熟藜麦", "Cooked quinoa", 140, 120, 4.4, 21.3, 1.92, ""],
  [168483, "烤红薯", "Baked sweet potato", 130, 90, 2.01, 20.71, 0.15, "地瓜 番薯"],
  [170440, "水煮土豆", "Boiled potato", 150, 86, 1.71, 20.01, 0.1, "马铃薯 洋芋"],
  [169999, "水煮甜玉米粒", "Boiled sweet corn kernels", 100, 96, 3.41, 20.98, 1.5, "玉米"],
  [170686, "熟荞麦粒", "Cooked buckwheat groats", 140, 92, 3.38, 19.94, 0.62, "荞麦"],
  [171284, "全脂原味酸奶", "Plain whole-milk yogurt", 150, 61, 3.47, 4.66, 3.25, "酸奶 yogurt yoghurt"],
  [170894, "脱脂原味希腊酸奶", "Plain nonfat Greek yogurt", 150, 59, 10.19, 3.6, 0.39, "酸奶 yogurt yoghurt"],
  [173768, "无糖低脂豆奶", "Unsweetened light soy milk", 245, 34, 2.62, 3.85, 0.85, "豆浆 豆乳"],
  [173414, "切达奶酪", "Cheddar cheese", 28, 403, 22.87, 3.37, 33.31, "芝士 cheese"],
  [168250, "烤瘦猪里脊", "Roasted lean pork tenderloin", 100, 143, 26.17, 0, 3.51, "猪肉 里脊"],
  [171794, "熟瘦牛肉末（90% 瘦）", "Cooked ground beef, 90% lean", 100, 230, 28.45, 0, 12.04, "牛肉 牛肉碎"],
  [175168, "烤养殖大西洋三文鱼", "Cooked farmed Atlantic salmon", 120, 206, 22.1, 0, 12.35, "鲑鱼 三文鱼"],
  [171971, "水煮虾仁", "Cooked shrimp", 100, 119, 22.78, 1.52, 1.7, "虾"],
  [171986, "水浸无盐金枪鱼罐头", "Canned tuna in water, unsalted", 85, 116, 25.51, 0, 0.82, "吞拿鱼 金枪鱼"],
  [168411, "熟毛豆仁", "Cooked edamame, shelled", 80, 121, 11.91, 8.91, 5.2, "毛豆"],
  [173757, "水煮鹰嘴豆", "Boiled chickpeas", 100, 164, 8.86, 27.42, 2.59, ""],
  [173735, "水煮黑豆", "Boiled black beans", 100, 132, 8.86, 23.71, 0.54, ""],
  [172421, "水煮小扁豆", "Boiled lentils", 100, 116, 9.02, 20.13, 0.38, "扁豆"],
  [169967, "水煮西兰花", "Boiled broccoli", 100, 35, 2.38, 7.18, 0.41, "花椰菜 西蓝花"],
  [168463, "水煮菠菜", "Boiled spinach", 90, 23, 2.97, 3.75, 0.26, ""],
  [170393, "生胡萝卜", "Raw carrot", 60, 41, 0.93, 9.58, 0.24, "红萝卜"],
  [168409, "带皮生黄瓜", "Raw cucumber with peel", 100, 15, 0.65, 3.63, 0.11, "青瓜"],
  [170457, "生番茄", "Raw tomato", 120, 18, 0.88, 3.89, 0.2, "西红柿"],
  [169975, "生卷心菜", "Raw cabbage", 80, 25, 1.28, 5.8, 0.1, "包菜 圆白菜"],
  [169252, "水煮白蘑菇", "Boiled white mushrooms", 100, 28, 2.17, 5.29, 0.47, "口蘑 蘑菇"],
  [170420, "水煮青豌豆", "Boiled green peas", 85, 84, 5.36, 15.63, 0.22, "豌豆"],
  [169296, "烤奶油南瓜", "Baked butternut squash", 100, 40, 0.9, 10.49, 0.09, "南瓜"],
  [169097, "橙子", "Orange", 130, 47, 0.94, 11.75, 0.12, ""],
  [167762, "草莓", "Strawberries", 150, 32, 0.67, 7.68, 0.3, ""],
  [171711, "蓝莓", "Blueberries", 100, 57, 0.74, 14.49, 0.33, ""],
  [168153, "绿心猕猴桃", "Green kiwi", 70, 61, 1.14, 14.66, 0.52, "奇异果"],
  [169910, "芒果", "Mango", 150, 60, 0.82, 14.98, 0.38, ""],
  [167765, "西瓜", "Watermelon", 150, 30, 0.61, 7.55, 0.15, ""],
  [169124, "菠萝", "Pineapple", 150, 50, 0.54, 13.12, 0.12, "凤梨"],
  [169118, "梨", "Pear", 175, 57, 0.36, 15.23, 0.14, ""],
  [174683, "葡萄", "Grapes", 150, 69, 0.72, 18.1, 0.16, ""],
  [169928, "黄桃（鲜）", "Fresh yellow peach", 150, 39, 0.91, 9.54, 0.25, "桃子"],
  [171705, "牛油果", "Avocado", 75, 160, 2, 8.53, 14.66, "鳄梨"],
  [170567, "杏仁", "Almonds", 28, 579, 21.15, 21.55, 49.93, "巴旦木"],
  [173806, "烤花生（无盐）", "Unsalted roasted peanuts", 28, 587, 24.35, 21.26, 49.66, "花生"],
  [170187, "核桃仁", "Walnuts", 28, 654, 15.23, 13.71, 65.21, ""],
  [170162, "生腰果", "Raw cashews", 28, 553, 18.22, 30.19, 43.85, "腰果"],
  [170554, "干奇亚籽", "Chia seeds", 12, 486, 16.54, 42.12, 30.74, "奇亚籽"],
  [171413, "橄榄油", "Olive oil", 14, 884, 0, 0, 100, ""],
  [171917, "无糖绿茶", "Unsweetened green tea", 245, 1, 0.22, 0, 0, "茶"],
  [171078, "油煎去皮鸡胸肉", "Fried skinless chicken breast", 120, 187, 33.44, 0.51, 4.71, "鸡胸肉"],
  [173686, "生大西洋三文鱼（野生）", "Raw wild Atlantic salmon", 120, 142, 19.84, 0, 6.34, "生三文鱼"],
];

export const foodCatalog = rows.map(([id, zh, en, grams, kcal, protein, carbs, fat, keywords]) => ({
  id, zh, en, grams, values: { kcal, protein, carbs, fat }, keywords,
}));
export type CatalogFood = typeof foodCatalog[number];

export function catalogFood(entry: CatalogFood, language: 'zh' | 'en', meal: Meal, grams: number): Food {
  return { meal, name: entry[language], amount: grams, basis: 'per100g', values: entry.values, catalogId: entry.id };
}
