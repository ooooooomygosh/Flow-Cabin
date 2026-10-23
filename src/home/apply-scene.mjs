import { normalizeRecipes, setRoomLight, recipeRecordIdentity } from './recipes.mjs';
import { restoreRoomData } from '../backup/room-data.mjs';

export function applySceneRecipe(runtime, input, storage = globalThis.localStorage) {
  const recipe = normalizeRecipes({ version: 1, recipes: [input] }).recipes[0];
  if (recipe.focusMinutes && runtime.focus.state.timer.phase !== 'idle') throw Error('先完成或结束当前专注，再启动带计时的场景。');
  restoreRoomData({ version: 1, layouts: { [recipe.theme]: recipe.layout } }, { storage });
  if (runtime.commands.theme(recipe.theme) === false) throw Error('房间主题未保存。');
  setRoomLight(recipe.theme, recipe.dim, storage);
  runtime.sound.replaceMix(recipe.mix);
  recipe.sound ? runtime.sound.turnOn() : runtime.sound.turnOff();
  const item = runtime.items.find(item => String(item.id) === recipe.recordId || recipe.recordIdentity && recipeRecordIdentity(item) === recipe.recordIdentity);
  if (item) runtime.commands.load(item);
  if (recipe.focusMinutes && (!runtime.focus.settings({ focusMin: recipe.focusMinutes }) || !runtime.focus.start('focus'))) throw Error('专注启动未能保存。');
  return { missingRecord: Boolean(recipe.recordId && !item) };
}
