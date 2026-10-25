import {optimize} from './optimizer.mjs?v=20261024';
self.onmessage = ({data}) => {
  try {
    let lastUpdate = 0;
    const result = optimize(data, (progress,bestResult) => {
      const now = performance.now();
      if (progress.completed <= 1 || progress.completed === progress.total || now - lastUpdate >= 50) {
        self.postMessage({progress,bestResult});lastUpdate = now;
      }
    });
    self.postMessage({result});
  } catch(error) {self.postMessage({error:error.message});}
};
