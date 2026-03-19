import { Value, v } from "./autograd";

export interface ModelConfig {
  nLayer: number;
  nEmbd: number;
  blockSize: number;
  nHead: number;
  vocabSize: number;
}

export type StateDict = { [key: string]: Value[][] };

export class GPT {
  config: ModelConfig;
  stateDict: StateDict;
  params: Value[];
  headDim: number;

  constructor(config: ModelConfig) {
    this.config = config;
    this.headDim = config.nEmbd / config.nHead;
    this.stateDict = {};
    
    const matrix = (nout: number, nin: number, std = 0.08) => {
      return Array.from({ length: nout }, () =>
        Array.from({ length: nin }, () => new Value(this.gauss(0, std)))
      );
    };

    this.stateDict["wte"] = matrix(config.vocabSize, config.nEmbd);
    this.stateDict["wpe"] = matrix(config.blockSize, config.nEmbd);
    this.stateDict["lm_head"] = matrix(config.vocabSize, config.nEmbd);

    for (let i = 0; i < config.nLayer; i++) {
      this.stateDict[`layer${i}.attn_wq`] = matrix(config.nEmbd, config.nEmbd);
      this.stateDict[`layer${i}.attn_wk`] = matrix(config.nEmbd, config.nEmbd);
      this.stateDict[`layer${i}.attn_wv`] = matrix(config.nEmbd, config.nEmbd);
      this.stateDict[`layer${i}.attn_wo`] = matrix(config.nEmbd, config.nEmbd);
      this.stateDict[`layer${i}.mlp_fc1`] = matrix(4 * config.nEmbd, config.nEmbd);
      this.stateDict[`layer${i}.mlp_fc2`] = matrix(config.nEmbd, 4 * config.nEmbd);
    }

    this.params = Object.values(this.stateDict).flat(2);
  }

  private gauss(mean: number, std: number): number {
    const u = 1 - Math.random();
    const v = 1 - Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * std;
  }

  linear(x: Value[], w: Value[][]): Value[] {
    return w.map((row) => {
      let sum = v(0);
      for (let i = 0; i < x.length; i++) {
        sum = sum.add(row[i].mul(x[i]));
      }
      return sum;
    });
  }

  softmax(logits: Value[]): Value[] {
    const maxVal = Math.max(...logits.map((l) => l.data));
    const exps = logits.map((l) => l.sub(maxVal).exp());
    let total = v(0);
    exps.forEach((e) => { total = total.add(e); });
    return exps.map((e) => e.div(total));
  }

  rmsnorm(x: Value[]): Value[] {
    let sumSq = v(0);
    x.forEach((xi) => { sumSq = sumSq.add(xi.mul(xi)); });
    const ms = sumSq.div(x.length);
    const scale = ms.add(1e-5).pow(-0.5);
    return x.map((xi) => xi.mul(scale));
  }

  forward(token_id: number, pos_id: number, keys: Value[][][], values: Value[][][]): Value[] {
    const tok_emb = this.stateDict["wte"][token_id];
    const pos_emb = this.stateDict["wpe"][pos_id];
    
    let x = tok_emb.map((t, i) => t.add(pos_emb[i]));
    x = this.rmsnorm(x);

    for (let li = 0; li < this.config.nLayer; li++) {
      const x_residual_attn = x;
      x = this.rmsnorm(x);
      
      const q = this.linear(x, this.stateDict[`layer${li}.attn_wq`]);
      const k = this.linear(x, this.stateDict[`layer${li}.attn_wk`]);
      const v_attn = this.linear(x, this.stateDict[`layer${li}.attn_wv`]);
      
      keys[li].push(k);
      values[li].push(v_attn);

      const x_attn: Value[] = [];
      for (let h = 0; h < this.config.nHead; h++) {
        const hs = h * this.headDim;
        const q_h = q.slice(hs, hs + this.headDim);
        const k_h = keys[li].map(ki => ki.slice(hs, hs + this.headDim));
        const v_h = values[li].map(vi => vi.slice(hs, hs + this.headDim));

        const attn_logits = k_h.map((kh_t) => {
          let dot = v(0);
          for (let j = 0; j < this.headDim; j++) {
            dot = dot.add(q_h[j].mul(kh_t[j]));
          }
          return dot.div(Math.sqrt(this.headDim));
        });

        const attn_weights = this.softmax(attn_logits);
        
        const head_out: Value[] = Array.from({ length: this.headDim }, (_, j) => {
          let sum = v(0);
          for (let t = 0; t < v_h.length; t++) {
            sum = sum.add(attn_weights[t].mul(v_h[t][j]));
          }
          return sum;
        });
        x_attn.push(...head_out);
      }

      x = this.linear(x_attn, this.stateDict[`layer${li}.attn_wo`]);
      x = x.map((xi, i) => xi.add(x_residual_attn[i]));

      const x_residual_mlp = x;
      x = this.rmsnorm(x);
      x = this.linear(x, this.stateDict[`layer${li}.mlp_fc1`]);
      x = x.map(xi => xi.relu());
      x = this.linear(x, this.stateDict[`layer${li}.mlp_fc2`]);
      x = x.map((xi, i) => xi.add(x_residual_mlp[i]));
    }

    return this.linear(x, this.stateDict["lm_head"]);
  }
}
