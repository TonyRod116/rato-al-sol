// Resolve quickly when a source has places, while reporting failures that arrive later.
export function firstWithResults(tasks, onFailure = () => {}) {
  return new Promise((resolve, reject) => {
    let waiting = tasks.length, successes = 0, lastError, stale = false, partial = false;
    for (const task of tasks) task.then((result) => {
      successes++;
      stale ||= Boolean(result.stale); partial ||= Boolean(result.partial);
      if (result.places.length) resolve(result);
    }, (error) => { lastError = error; onFailure(error); }).finally(() => {
      if (--waiting === 0) successes ? resolve({ places: [], source: 'empty', ...(stale ? { stale: true } : {}), ...(partial ? { partial: true } : {}) }) : reject(lastError);
    });
  });
}
