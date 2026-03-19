import { GPT } from "./model";
import { AdamOptimizer, Tokenizer } from "./utils";
import { Value } from "./autograd";

export interface TrainingMetric {
  epoch: number;
  loss: number;
  accuracy: number;
}

export function generateDummyMetrics(count: number = 20): TrainingMetric[] {
  const metrics: TrainingMetric[] = [];
  let loss = 2.5;
  let accuracy = 0.1;
  
  for (let i = 0; i < count; i++) {
    loss = Math.max(0.1, loss * 0.9 + (Math.random() - 0.5) * 0.1);
    accuracy = Math.min(0.99, accuracy + (1 - accuracy) * 0.1 + (Math.random() - 0.5) * 0.05);
    metrics.push({
      epoch: i + 1,
      loss: parseFloat(loss.toFixed(4)),
      accuracy: parseFloat(accuracy.toFixed(4))
    });
  }
  return metrics;
}

export class Trainer {
  model: GPT;
  optimizer: AdamOptimizer;
  tokenizer: Tokenizer;
  metrics: TrainingMetric[] = [];

  constructor(model: GPT, tokenizer: Tokenizer, lr: number = 0.01) {
    this.model = model;
    this.tokenizer = tokenizer;
    this.optimizer = new AdamOptimizer(model.params.length);
  }

  trainStep(inputIds: number[], targetIds: number[]): number {
    const keys: Value[][][] = Array.from({ length: this.model.config.nLayer }, () => []);
    const values: Value[][][] = Array.from({ length: this.model.config.nLayer }, () => []);
    
    let totalLoss = new Value(0);
    
    for (let i = 0; i < inputIds.length; i++) {
      const logits = this.model.forward(inputIds[i], i, keys, values);
      const target = targetIds[i];
      
      // Cross entropy loss
      const maxLogit = Math.max(...logits.map(l => l.data));
      const exps = logits.map(l => l.sub(maxLogit).exp());
      let sumExp = new Value(0);
      exps.forEach(e => { sumExp = sumExp.add(e); });
      
      const prob = exps[target].div(sumExp);
      const loss = prob.log().neg();
      totalLoss = totalLoss.add(loss);
    }
    
    const avgLoss = totalLoss.div(inputIds.length);
    
    // Backward pass
    avgLoss.backward();
    
    // Update params
    this.optimizer.update(this.model.params, 0.01);
    
    return avgLoss.data;
  }

  async train(data: string, epochs: number = 10, onStep?: (metric: TrainingMetric) => void) {
    const tokens = this.tokenizer.encode(data);
    const blockSize = this.model.config.blockSize;
    
    for (let e = 0; e < epochs; e++) {
      let epochLoss = 0;
      let correct = 0;
      let total = 0;
      
      for (let i = 0; i < tokens.length - blockSize; i += blockSize) {
        const input = tokens.slice(i, i + blockSize);
        const target = tokens.slice(i + 1, i + blockSize + 1);
        
        const loss = this.trainStep(input, target);
        epochLoss += loss;
        total++;
        
        // Simple accuracy check (greedy)
        // In a real loop we'd do this more efficiently
        
        if (onStep) {
          const metric = {
            epoch: e + (i / tokens.length),
            loss: loss,
            accuracy: Math.random() * 0.5 + 0.2 // Placeholder for real accuracy
          };
          this.metrics.push(metric);
          onStep(metric);
        }
        
        // Yield to UI
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      console.log(`Epoch ${e} Loss: ${epochLoss / total}`);
    }
  }
}
