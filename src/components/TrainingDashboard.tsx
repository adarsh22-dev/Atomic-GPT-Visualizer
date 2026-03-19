import React, { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { Activity, Brain, Cpu, TrendingDown, Zap, Upload, FileText, Settings } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { generateDummyMetrics, TrainingMetric, Trainer } from '../engine/training';
import { GPT, ModelConfig } from '../engine/model';
import { Tokenizer } from '../engine/utils';

const DEFAULT_CONFIG: ModelConfig = {
  nLayer: 2,
  nEmbd: 32,
  blockSize: 8,
  nHead: 4,
  vocabSize: 50
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function TrainingDashboard() {
  const [metrics, setMetrics] = useState<TrainingMetric[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [model, setModel] = useState<GPT | null>(null);
  const [viewMode, setViewMode] = useState<'metrics' | 'parameters'>('metrics');
  const [selectedLayer, setSelectedLayer] = useState<string>('wte');
  const [paramType, setParamType] = useState<'data' | 'grad'>('data');
  const [trainingData, setTrainingData] = useState<string>("The quick brown fox jumps over the lazy dog. Neural networks are fascinating systems that learn from data patterns.");
  const [epochs, setEpochs] = useState(5);

  useEffect(() => {
    // Initial dummy data
    setMetrics(generateDummyMetrics(20));
    const initialModel = new GPT(DEFAULT_CONFIG);
    setModel(initialModel);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setTrainingData(content);
    };
    reader.readAsText(file);
  };

  const handleStartTraining = async () => {
    if (!model || !trainingData) return;
    
    setIsTraining(true);
    setMetrics([]); // Clear previous metrics
    
    try {
      const tokenizer = new Tokenizer([trainingData]);
      
      // Update model config with real vocab size from data
      const config = { ...DEFAULT_CONFIG, vocabSize: tokenizer.vocabSize };
      const newModel = new GPT(config);
      setModel(newModel);
      
      const trainer = new Trainer(newModel, tokenizer);
      
      await trainer.train(trainingData, epochs, (metric) => {
        setMetrics(prev => {
          const newMetrics = [...prev, metric];
          // Keep only last 50 for performance
          return newMetrics.length > 50 ? newMetrics.slice(-50) : newMetrics;
        });
        
        // Force model update to see parameter changes
        setModel(Object.assign(Object.create(Object.getPrototypeOf(newModel)), newModel));
      });
    } catch (error) {
      console.error("Training failed:", error);
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full pt-10 pb-20 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Brain className="text-emerald-500" />
            Model Training & Diagnostics
          </h2>
          <p className="text-white/40">Monitor real-time performance and inspect neural network weights.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setViewMode('metrics')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${viewMode === 'metrics' ? 'bg-emerald-600 text-white' : 'bg-[#1a1a1a] text-white/60 hover:text-white'}`}
          >
            Performance
          </button>
          <button 
            onClick={() => setViewMode('parameters')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${viewMode === 'parameters' ? 'bg-emerald-600 text-white' : 'bg-[#1a1a1a] text-white/60 hover:text-white'}`}
          >
            Parameters
          </button>
          <button 
            onClick={handleStartTraining}
            disabled={isTraining}
            className={`px-6 py-2 rounded-full font-bold transition-all flex items-center gap-2 ${isTraining ? 'bg-emerald-600/20 text-emerald-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-500/20'}`}
          >
            <Zap size={18} className={isTraining ? 'animate-pulse' : ''} />
            {isTraining ? 'Training...' : 'Start Training'}
          </button>
        </div>
      </div>

      {viewMode === 'metrics' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Input Section */}
          <div className="lg:col-span-3 bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h3 className="font-bold flex items-center gap-2">
                <FileText size={18} className="text-emerald-500" />
                Training Data Input
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-[#0b0d0e] px-3 py-1.5 rounded-lg border border-white/10">
                  <Settings size={14} className="opacity-40" />
                  <span className="text-[10px] uppercase tracking-wider opacity-40">Epochs:</span>
                  <input 
                    type="number" 
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value) || 1)}
                    className="bg-transparent text-white text-xs w-10 focus:outline-none"
                    min="1"
                    max="100"
                  />
                </div>
                <label className="cursor-pointer bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2">
                  <Upload size={14} />
                  Upload File
                  <input type="file" className="hidden" accept=".txt" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
            <textarea 
              value={trainingData}
              onChange={(e) => setTrainingData(e.target.value)}
              placeholder="Paste your training text here..."
              className="w-full h-32 bg-[#0b0d0e] text-white/80 text-sm p-4 rounded-2xl border border-white/10 focus:outline-none focus:border-emerald-500/50 resize-none font-mono leading-relaxed"
            />
            <p className="mt-3 text-[10px] text-white/30 flex items-center gap-2">
              <Zap size={10} />
              Model will learn character-level patterns from the text above.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5">
              <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Current Loss</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold">{metrics[metrics.length - 1]?.loss || '0.000'}</p>
                <TrendingDown size={16} className="text-emerald-500 mb-1" />
              </div>
            </div>
            <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5">
              <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Accuracy</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold">{(metrics[metrics.length - 1]?.accuracy * 100).toFixed(1)}%</p>
                <Activity size={16} className="text-emerald-500 mb-1" />
              </div>
            </div>
            <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5">
              <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Parameters</p>
              <div className="flex items-end gap-2">
                <p className="text-2xl font-bold">{model?.params.length.toLocaleString() || '0'}</p>
                <Cpu size={16} className="text-emerald-500 mb-1" />
              </div>
            </div>
            <div className="bg-[#1a1a1a] p-6 rounded-3xl border border-white/5">
              <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Total Epochs</p>
              <p className="text-2xl font-bold">{metrics[metrics.length - 1]?.epoch || '0'}</p>
            </div>
          </div>

          {/* Main Chart */}
          <div className="lg:col-span-2 bg-[#1a1a1a] p-8 rounded-3xl border border-white/5 min-h-[400px]">
            <h3 className="font-bold mb-8 flex items-center gap-2">
              <Activity size={18} className="text-emerald-500" />
              Training Progress
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <defs>
                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="epoch" 
                    stroke="#ffffff20" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#ffffff20" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => val.toFixed(1)}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="loss" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorLoss)" 
                    strokeWidth={2}
                    name="Loss"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="accuracy" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    name="Accuracy"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Side Info */}
          <div className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
            <h3 className="font-bold mb-6">Optimization Log</h3>
            <div className="space-y-4 max-h-[300px] overflow-y-auto scrollbar-hide">
              {metrics.slice(-5).reverse().map((m, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#0b0d0e] border border-white/5">
                  <span className="text-xs opacity-40">Epoch {m.epoch}</span>
                  <span className="text-xs font-mono text-emerald-500">L: {m.loss.toFixed(3)}</span>
                </div>
              ))}
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-[11px] text-emerald-500/60 leading-relaxed">
                Using Adam Optimizer with beta1=0.85, beta2=0.99. Learning rate scheduled at 0.01.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <h3 className="font-bold flex items-center gap-2">
                <Cpu size={18} className="text-emerald-500" />
                Parameter Inspection
              </h3>
              <div className="flex flex-wrap gap-2">
                <select 
                  value={selectedLayer}
                  onChange={(e) => setSelectedLayer(e.target.value)}
                  className="bg-[#0b0d0e] text-white/80 text-xs px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-emerald-500/50"
                >
                  {model && Object.keys(model.stateDict).map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
                <div className="flex bg-[#0b0d0e] rounded-lg p-1 border border-white/10">
                  <button 
                    onClick={() => setParamType('data')}
                    className={cn(
                      "px-3 py-1 text-[10px] uppercase tracking-wider rounded-md transition-all",
                      paramType === 'data' ? "bg-emerald-600 text-white" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    Weights
                  </button>
                  <button 
                    onClick={() => setParamType('grad')}
                    className={cn(
                      "px-3 py-1 text-[10px] uppercase tracking-wider rounded-md transition-all",
                      paramType === 'grad' ? "bg-emerald-600 text-white" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    Gradients
                  </button>
                </div>
              </div>
            </div>

            <div className="relative group">
              <div className="grid grid-cols-12 sm:grid-cols-16 md:grid-cols-24 lg:grid-cols-32 gap-1 max-h-[400px] overflow-y-auto p-4 bg-[#0b0d0e] rounded-2xl border border-white/5 scrollbar-hide">
                {model?.stateDict[selectedLayer]?.flat().map((p, i) => {
                  const val = paramType === 'data' ? p.data : p.grad;
                  const intensity = Math.min(1, Math.abs(val) * (paramType === 'data' ? 5 : 50));
                  return (
                    <div 
                      key={i}
                      className="aspect-square rounded-sm transition-all hover:scale-150 hover:z-10 cursor-crosshair border border-white/5"
                      style={{ 
                        backgroundColor: val > 0 
                          ? `rgba(16, 185, 129, ${intensity})` 
                          : `rgba(239, 68, 68, ${intensity})` 
                      }}
                      title={`${selectedLayer}[${i}]\nValue: ${p.data.toFixed(6)}\nGrad: ${p.grad.toFixed(6)}`}
                    />
                  );
                })}
              </div>
              
              {/* Legend */}
              <div className="mt-6 flex items-center justify-between text-[10px] text-white/40 uppercase tracking-widest">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span>Negative</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-white/10" />
                    <span>Zero</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Positive</span>
                  </div>
                </div>
                <span>{model?.stateDict[selectedLayer]?.flat().length.toLocaleString()} total params</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
              <h3 className="font-bold mb-4 text-sm">Layer Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-xs opacity-40">Dimensions</span>
                  <span className="text-xs font-mono">
                    {model?.stateDict[selectedLayer]?.length} × {model?.stateDict[selectedLayer]?.[0]?.length}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-xs opacity-40">Mean {paramType === 'data' ? 'Weight' : 'Grad'}</span>
                  <span className="text-xs font-mono text-emerald-500">
                    {(() => {
                      const params = model?.stateDict[selectedLayer]?.flat() || [];
                      const sum = params.reduce((acc, p) => acc + (paramType === 'data' ? p.data : p.grad), 0);
                      return params.length > 0 ? (sum / params.length).toFixed(6) : '0.000000';
                    })()}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
              <h3 className="font-bold mb-4 text-sm">Model Configuration</h3>
              <div className="space-y-2">
                {Object.entries(DEFAULT_CONFIG).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center text-[11px]">
                    <span className="opacity-40">{key}</span>
                    <span className="font-mono">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/5">
              <h3 className="font-bold mb-4 text-sm">Engine Stats</h3>
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#0b0d0e] border border-white/5">
                  <p className="text-[9px] uppercase tracking-widest opacity-40 mb-1">Precision</p>
                  <p className="text-xs font-medium text-emerald-500">Float32</p>
                </div>
                <div className="p-3 rounded-xl bg-[#0b0d0e] border border-white/5">
                  <p className="text-[9px] uppercase tracking-widest opacity-40 mb-1">Device</p>
                  <p className="text-xs font-medium">CPU (WASM)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
