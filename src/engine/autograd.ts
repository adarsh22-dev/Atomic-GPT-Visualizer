/**
 * A simple scalar-based autograd engine, optimized with TypedArrays.
 */

// Global storage for all Value objects to improve performance and memory locality
const MAX_VALUES = 1000000;
const dataBuffer = new Float32Array(MAX_VALUES);
const gradBuffer = new Float32Array(MAX_VALUES);
let nextId = 0;

export class Value {
  id: number;
  _children: Set<Value>;
  _op: string;
  _backward: () => void;

  constructor(data: number, _children: Value[] = [], _op: string = "") {
    if (nextId >= MAX_VALUES) {
      // In a real engine, we'd use a more sophisticated allocator.
      nextId = 0; // Wrap around for demo purposes
    }
    this.id = nextId++;
    dataBuffer[this.id] = data;
    gradBuffer[this.id] = 0;
    
    this._children = new Set(_children);
    this._op = _op;
    this._backward = () => {};
  }

  get data(): number {
    return dataBuffer[this.id];
  }

  set data(val: number) {
    dataBuffer[this.id] = val;
  }

  get grad(): number {
    return gradBuffer[this.id];
  }

  set grad(val: number) {
    gradBuffer[this.id] = val;
  }

  add(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    const out = new Value(this.data + o.data, [this, o], "+");
    out._backward = () => {
      gradBuffer[this.id] += gradBuffer[out.id];
      gradBuffer[o.id] += gradBuffer[out.id];
    };
    return out;
  }

  mul(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    const out = new Value(this.data * o.data, [this, o], "*");
    out._backward = () => {
      gradBuffer[this.id] += dataBuffer[o.id] * gradBuffer[out.id];
      gradBuffer[o.id] += dataBuffer[this.id] * gradBuffer[out.id];
    };
    return out;
  }

  pow(other: number): Value {
    const out = new Value(Math.pow(this.data, other), [this], `**${other}`);
    out._backward = () => {
      gradBuffer[this.id] += (other * Math.pow(this.data, other - 1)) * gradBuffer[out.id];
    };
    return out;
  }

  relu(): Value {
    const out = new Value(this.data < 0 ? 0 : this.data, [this], "ReLU");
    out._backward = () => {
      gradBuffer[this.id] += (this.data > 0 ? 1 : 0) * gradBuffer[out.id];
    };
    return out;
  }

  log(): Value {
    const out = new Value(Math.log(this.data), [this], "log");
    out._backward = () => {
      gradBuffer[this.id] += (1 / this.data) * gradBuffer[out.id];
    };
    return out;
  }

  exp(): Value {
    const out = new Value(Math.exp(this.data), [this], "exp");
    out._backward = () => {
      gradBuffer[this.id] += dataBuffer[out.id] * gradBuffer[out.id];
    };
    return out;
  }

  backward() {
    const topo: Value[] = [];
    const visited = new Set<Value>();
    const buildTopo = (v: Value) => {
      if (!visited.has(v)) {
        visited.add(v);
        v._children.forEach((child) => buildTopo(child));
        topo.push(v);
      }
    };
    buildTopo(this);

    this.grad = 1;
    for (let i = topo.length - 1; i >= 0; i--) {
      topo[i]._backward();
    }
  }

  // Helper methods for operator overloading simulation
  neg(): Value {
    return this.mul(-1);
  }

  sub(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    return this.add(o.neg());
  }

  div(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    return this.mul(o.pow(-1));
  }
}

export function v(data: number): Value {
  return new Value(data);
}
