import { GPT, ModelConfig } from "./model";
import { Value } from "./autograd";

export class AdamOptimizer {
  m: number[];
  v: number[];
  beta1: number;
  beta2: number;
  eps: number;
  step: number;

  constructor(numParams: number, beta1 = 0.85, beta2 = 0.99, eps = 1e-8) {
    this.m = new Array(numParams).fill(0);
    this.v = new Array(numParams).fill(0);
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.eps = eps;
    this.step = 0;
  }

  update(params: Value[], lr: number) {
    this.step++;
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      this.m[i] = this.beta1 * this.m[i] + (1 - this.beta1) * p.grad;
      this.v[i] = this.beta2 * this.v[i] + (1 - this.beta2) * (p.grad * p.grad);
      
      const mHat = this.m[i] / (1 - Math.pow(this.beta1, this.step));
      const vHat = this.v[i] / (1 - Math.pow(this.beta2, this.step));
      
      p.data -= lr * mHat / (Math.sqrt(vHat) + this.eps);
      p.grad = 0; // Reset gradient
    }
  }
}

export class Tokenizer {
  uchars: string[];
  BOS: number;
  vocabSize: number;

  constructor(docs: string[]) {
    this.uchars = Array.from(new Set(docs.join(""))).sort();
    this.BOS = this.uchars.length;
    this.vocabSize = this.uchars.length + 1;
  }

  encode(text: string): number[] {
    return text.split("").map(c => this.uchars.indexOf(c));
  }

  decode(tokens: number[]): string {
    return tokens.map(t => t === this.BOS ? "" : this.uchars[t]).join("");
  }
}
