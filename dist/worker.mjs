import {optimize} from './optimizer.mjs';
self.onmessage = ({data}) => {
  try {
    let lastUpdate = 0;
    const result = optimize(data, progress => {
      const now = performance.now();
      if (progress.completed === 0 || progress.completed === progress.total || now - lastUpdate >= 50) {
        self.postMessage({progress});lastUpdate = now;
      }
    });
    self.postMessage({result});
  } catch(error) {self.postMessage({error:error.message});}
};
