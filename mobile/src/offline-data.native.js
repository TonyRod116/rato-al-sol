import * as FileSystem from 'expo-file-system/legacy';
import { createBuildingCache, createBuildingFileStore } from './building-cache.mjs';
import { createSceneCache, createSceneFileStore } from './scene-cache.mjs';
import { createSearchCache, createSearchFileStore } from './search-cache.mjs';

// These caches are local to this installation. A generation prevents a
// request started before clearing from writing its result afterwards.
export const buildingCache = createBuildingCache(createBuildingFileStore(FileSystem));
export const sceneCache = createSceneCache(createSceneFileStore(FileSystem));
export const searchCache = createSearchCache(createSearchFileStore(FileSystem));
let generation = 0;
export function cacheGeneration() { return generation; }
export async function clearOfflineData() {
  generation++;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), 3000); });
  try {
    return await Promise.race([Promise.all([buildingCache.clear(), sceneCache.clear(), searchCache.clear()])
      .then((results) => results.every(Boolean)), timeout]);
  } finally { clearTimeout(timer); }
}
