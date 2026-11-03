// Resolve quickly when a source has places, while reporting failures that arrive later.
export function firstWithResults(tasks, onFailure = () => {}) {
  return new Promise((resolve, reject) => {
    let waiting = tasks.length, successes = 0, lastError;
    for (const task of tasks) task.then((result) => {
      successes++;
      if (result.places.length) resolve(result);
    }, (error) => { lastError = error; onFailure(error); }).finally(() => {
      if (--waiting === 0) successes ? resolve({ places: [], source: 'empty' }) : reject(lastError);
    });
  });
}
