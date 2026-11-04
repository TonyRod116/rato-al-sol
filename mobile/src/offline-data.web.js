const empty = { find: async () => null, findMany: async () => null, save: async () => false, clear: async () => true };
export const buildingCache = empty, sceneCache = empty, searchCache = empty;
export function cacheGeneration() { return 0; }
export async function clearOfflineData() { return true; }
