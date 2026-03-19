import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Plus, 
  Search, 
  Image as ImageIcon, 
  LayoutGrid, 
  Compass, 
  Heart, 
  MessageSquare, 
  Send, 
  User, 
  Settings, 
  ChevronDown, 
  Mic, 
  Paperclip, 
  ArrowUp,
  Brain,
  Cpu,
  Wand2,
  Activity,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { TrainingDashboard } from './components/TrainingDashboard';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

type ChatHistory = {
  id: string;
  title: string;
  preview: string;
  created_at: string;
};

type UserData = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  token?: string;
};

type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
  return (
    <div className="group relative flex items-center">
      {children}
      <div className="absolute left-full ml-2 px-2 py-1 bg-black border border-white/10 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {content}
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<'gemini' | 'openai'>('gemini');
  const [activeView, setActiveView] = useState<'chat' | 'search' | 'images' | 'apps' | 'research' | 'health' | 'profile' | 'training'>('chat');
  const [user, setUser] = useState<UserData | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<ChatHistory[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      addToast(`File "${file.name}" uploaded successfully!`, 'success');
    }
  };

  const handleMicClick = () => {
    addToast('Voice input is not supported in this preview. Please type your message.', 'info');
  };

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('microgpt_user');
    const savedToken = localStorage.getItem('microgpt_token');
    if (savedUser && savedToken) {
      const userData = JSON.parse(savedUser);
      setUser({ ...userData, token: savedToken });
    }

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const { user: userData, token } = event.data;
        setUser({ ...userData, token });
        localStorage.setItem('microgpt_user', JSON.stringify(userData));
        localStorage.setItem('microgpt_token', token);
        setShowLoginModal(false);
        addToast('Logged in with Social Account!', 'success');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'linkedin') => {
    try {
      const res = await fetch(`/api/auth/${provider}/url`);
      const { url } = await res.json();
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        url,
        `oauth_${provider}`,
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (e) {
      addToast(`Failed to start ${provider} login`, 'error');
    }
  };

  useEffect(() => {
    if (user) {
      fetchHistory();
    } else {
      setHistory([]);
    }
  }, [user]);

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const token = user?.token || localStorage.getItem('microgpt_token');
    const headers = {
      ...options.headers,
      'Authorization': token ? `Bearer ${token}` : '',
    };
    return fetch(url, { ...options, headers });
  };

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const res = await authenticatedFetch('/api/chats');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setHistory(data);
    } catch (e: any) {
      addToast(e.message || 'Failed to load history', 'error');
    }
  };

  const loadChat = async (chatId: string) => {
    setCurrentChatId(chatId);
    setActiveView('chat');
    setIsLoading(true);
    try {
      const res = await authenticatedFetch(`/api/chats/${chatId}/messages`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(data);
    } catch (e: any) {
      addToast(e.message || 'Failed to load messages', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const createChat = async (title: string, preview: string) => {
    if (!user) return null;
    try {
      const res = await authenticatedFetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, preview })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchHistory();
      return data.id;
    } catch (e) {
      return null;
    }
  };

  const saveMessage = async (chatId: string, role: string, content: string) => {
    try {
      const res = await authenticatedFetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      console.error('Failed to save message');
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let chatId = currentChatId;
    if (!chatId && user) {
      chatId = await createChat(input.slice(0, 30), input.slice(0, 50));
      setCurrentChatId(chatId);
    }

    if (chatId) {
      await saveMessage(chatId, 'user', input);
    }

    try {
      let assistantContent = '';

      if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const result = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ text: input }] }]
        });
        assistantContent = result.text || "No response from Gemini.";
      } else {
        const response = await authenticatedFetch('/api/chat/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          }),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        assistantContent = data.content;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      if (chatId) {
        await saveMessage(chatId, 'assistant', assistantContent);
      }
    } catch (error: any) {
      addToast(error.message, 'error');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error: ${error.message}. Please check your connection or API keys.`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
    const body = isSignUp 
      ? { email: loginEmail, name: loginName, password: loginPassword }
      : { email: loginEmail, password: loginPassword };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      const { user: userData, token } = data;
      setUser({ ...userData, token });
      localStorage.setItem('microgpt_user', JSON.stringify(userData));
      localStorage.setItem('microgpt_token', token);
      setShowLoginModal(false);
      addToast(isSignUp ? 'Account created!' : 'Welcome back!', 'success');
      setLoginEmail('');
      setLoginPassword('');
      setLoginName('');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('microgpt_user');
    localStorage.removeItem('microgpt_token');
    setActiveView('chat');
    setMessages([]);
    setCurrentChatId(null);
    addToast('Logged out successfully');
  };

  return (
    <div className="flex h-screen bg-[#0b0d0e] text-[#ececec] font-sans selection:bg-[#1a3a32] overflow-hidden">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={cn(
                "px-4 py-2 rounded-lg shadow-lg text-sm font-medium border",
                t.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                t.type === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                "bg-[#1a1a1a] border-white/10 text-white"
              )}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sidebar Toggle (Mobile) */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xl"
      >
        <LayoutGrid size={24} />
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-40 w-[260px] bg-[#000000] flex flex-col p-3 gap-2 border-r border-white/5 transition-transform duration-300 scrollbar-hide overflow-x-hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between lg:hidden mb-4 p-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/60">Menu</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-white/10 rounded-xl transition-all border border-white/5 bg-white/5"
          >
            <X size={18} className="text-white" />
          </button>
        </div>
        <button 
          onClick={() => {
            setMessages([]);
            setCurrentChatId(null);
            setActiveView('chat');
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
          }}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1a1a1a] transition-colors text-sm font-medium"
        >
          <Plus size={18} />
          <span>New chat</span>
        </button>
        
        <nav className="flex-1 space-y-1 mt-4 overflow-y-auto scrollbar-hide overflow-x-hidden">
          <Tooltip content="Search your chat history">
            <button 
              onClick={() => setActiveView('search')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group",
                activeView === 'search' ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-[#1a1a1a] border border-transparent"
              )}
            >
              <Search size={18} className={cn("transition-opacity", activeView === 'search' ? "opacity-100" : "opacity-60")} />
              <span>Search chats</span>
            </button>
          </Tooltip>
          <Tooltip content="AI Image Generation">
            <button 
              onClick={() => setActiveView('images')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group",
                activeView === 'images' ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-[#1a1a1a] border border-transparent"
              )}
            >
              <ImageIcon size={18} className={cn("transition-opacity", activeView === 'images' ? "opacity-100" : "opacity-60")} />
              <span>Images</span>
            </button>
          </Tooltip>
          <Tooltip content="Specialized AI Tools">
            <button 
              onClick={() => setActiveView('apps')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group",
                activeView === 'apps' ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-[#1a1a1a] border border-transparent"
              )}
            >
              <LayoutGrid size={18} className={cn("transition-opacity", activeView === 'apps' ? "opacity-100" : "opacity-60")} />
              <span>Apps</span>
            </button>
          </Tooltip>
          <Tooltip content="Deep Web Research">
            <button 
              onClick={() => setActiveView('research')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group",
                activeView === 'research' ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-[#1a1a1a] border border-transparent"
              )}
            >
              <Compass size={18} className={cn("transition-opacity", activeView === 'research' ? "opacity-100" : "opacity-60")} />
              <span>Deep research</span>
            </button>
          </Tooltip>
          <Tooltip content="Health Monitoring">
            <button 
              onClick={() => setActiveView('health')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group",
                activeView === 'health' ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-[#1a1a1a] border border-transparent"
              )}
            >
              <Heart size={18} className={cn("transition-opacity", activeView === 'health' ? "opacity-100" : "opacity-60")} />
              <span>Health</span>
            </button>
          </Tooltip>
          <Tooltip content="Model Training & Autograd">
            <button 
              onClick={() => setActiveView('training')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group",
                activeView === 'training' ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20" : "hover:bg-[#1a1a1a] border border-transparent"
              )}
            >
              <Activity size={18} className={cn("transition-opacity", activeView === 'training' ? "opacity-100" : "opacity-60")} />
              <span>Training</span>
            </button>
          </Tooltip>
          
          <div className="pt-4 pb-2 px-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/20">History</p>
          </div>
          
          {history.length > 0 ? history.map(item => (
            <button 
              key={item.id}
              onClick={() => loadChat(item.id)}
              className={cn(
                "w-full flex flex-col gap-1 px-3 py-2 rounded-lg transition-colors text-left group",
                currentChatId === item.id ? "bg-[#1a1a1a]" : "hover:bg-[#1a1a1a]"
              )}
            >
              <span className={cn(
                "text-sm truncate transition-colors",
                currentChatId === item.id ? "text-emerald-400" : "group-hover:text-emerald-400"
              )}>{item.title}</span>
              <span className="text-[10px] opacity-40 truncate">{item.preview}</span>
            </button>
          )) : (
            <div className="px-3 py-2 text-[10px] opacity-20 italic">No chats yet</div>
          )}

          <a 
            href="/MicroGPT.py" 
            download 
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1a3a32] transition-colors text-sm text-emerald-400 border border-emerald-500/20 mt-4"
          >
            <Settings size={18} className="opacity-60" />
            <span>MicroGPT Script (Python)</span>
          </a>
        </nav>

        <div className="mt-auto pt-4 border-t border-white/5 space-y-1">
          {user ? (
            <button 
              onClick={() => setActiveView('profile')}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-sm mb-2",
                activeView === 'profile' ? "bg-[#1a1a1a] border border-white/10" : "hover:bg-[#1a1a1a]"
              )}
            >
              <img src={user.avatar} alt="Avatar" className="w-6 h-6 rounded-full" />
              <div className="flex-1 text-left overflow-hidden">
                <p className="font-medium truncate">{user.name}</p>
                <p className="text-[10px] opacity-40 truncate">{user.email}</p>
              </div>
            </button>
          ) : (
            <button 
              onClick={() => setShowLoginModal(true)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-[#1a1a1a] transition-colors text-sm mb-2"
            >
              <User size={18} className="opacity-60" />
              <span>Login / Sign up</span>
            </button>
          )}
          <div className="px-3 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-500/60 mb-2">MicroGPT Pro</p>
            <p className="text-xs opacity-60 mb-4 leading-relaxed">Unlock advanced training capabilities and custom datasets with the standalone Python engine.</p>
            <button 
              onClick={() => alert('MicroGPT Pro upgrade is coming soon! Check back later.')}
              className="w-full py-2 rounded-full bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20"
            >
              Upgrade
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#0b0d0e]">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-30 bg-[#0b0d0e]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setActiveView('chat')}>
            <span className="font-semibold text-lg tracking-tight">MicroGPT</span>
            <ChevronDown size={16} className="opacity-40 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex bg-[#1a1a1a] rounded-full p-1 border border-white/5 scale-90 sm:scale-100">
            <button 
              onClick={() => setProvider('gemini')}
              className={cn(
                "px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                provider === 'gemini' ? "bg-emerald-600 text-white shadow-sm" : "text-white/40 hover:text-white"
              )}
            >
              Gemini
            </button>
            <button 
              onClick={() => setProvider('openai')}
              className={cn(
                "px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium transition-all",
                provider === 'openai' ? "bg-emerald-600 text-white shadow-sm" : "text-white/40 hover:text-white"
              )}
            >
              OpenAI
            </button>
          </div>
          <div 
            onClick={() => user ? setActiveView('profile') : setShowLoginModal(true)}
            className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center cursor-pointer hover:border-emerald-500/50 transition-all"
          >
            {user ? (
              <img src={user.avatar} alt="Avatar" className="w-full h-full rounded-full" />
            ) : (
              <User size={18} className="text-emerald-500" />
            )}
          </div>
        </div>
      </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto pt-20 pb-40 px-4 scrollbar-hide">
          <div className="max-w-3xl mx-auto w-full">
            {activeView === 'chat' ? (
              messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center mt-32">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-600 flex items-center justify-center mb-8 shadow-2xl shadow-emerald-500/20">
                    <Brain size={32} className="text-white" />
                  </div>
                  <h2 className="text-3xl font-semibold mb-8 tracking-tight">What's on your mind today?</h2>
                  <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
                    {[
                      "Explain the Transformer architecture",
                      "How does backpropagation work?",
                      "Write a Python script for MicroGPT",
                      "Help me optimize my neural network"
                    ].map((suggestion, i) => (
                      <button 
                        key={i}
                        onClick={() => { setInput(suggestion); }}
                        className="p-4 rounded-2xl border border-white/5 bg-[#1a1a1a]/50 hover:bg-[#1a1a1a] hover:border-emerald-500/30 text-left text-sm transition-all group"
                      >
                        <span className="opacity-80 group-hover:opacity-100">{suggestion}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={cn(
                        "flex gap-4 group",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-emerald-600 flex-shrink-0 flex items-center justify-center text-white">
                          <Brain size={18} />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[85%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed",
                        msg.role === 'user' ? "bg-[#1a1a1a] text-white border border-white/5" : "bg-transparent"
                      )}>
                        {msg.role === 'user' ? (
                          msg.content
                        ) : (
                          <div className="markdown-body">
                            <Markdown>{msg.content}</Markdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-4 animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-emerald-600/50 flex-shrink-0" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-white/5 rounded w-3/4" />
                        <div className="h-4 bg-white/5 rounded w-1/2" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )
            ) : activeView === 'search' ? (
              <div className="max-w-2xl mx-auto w-full pt-10">
                <div className="relative mb-8">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" size={20} />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your conversations..."
                    className="w-full bg-[#1a1a1a] border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-lg focus:outline-none focus:border-emerald-500/30 transition-all"
                  />
                </div>
                <div className="space-y-4">
                  {history.filter(h => h.title.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                    <button 
                      key={item.id}
                      onClick={() => setActiveView('chat')}
                      className="w-full p-6 rounded-2xl bg-[#1a1a1a]/50 border border-white/5 hover:bg-[#1a1a1a] hover:border-emerald-500/20 transition-all text-left group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-lg group-hover:text-emerald-400 transition-colors">{item.title}</h3>
                        <span className="text-xs opacity-20">2 days ago</span>
                      </div>
                      <p className="text-sm opacity-60 line-clamp-2">{item.preview}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : activeView === 'images' ? (
              <div className="max-w-4xl mx-auto w-full pt-10">
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Image Generation</h2>
                    <p className="text-white/40">Create stunning visuals with MicroGPT's vision engine.</p>
                  </div>
                  <button className="px-6 py-2 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors">
                    Generate New
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="aspect-square rounded-2xl bg-[#1a1a1a] border border-white/5 overflow-hidden group relative cursor-pointer">
                      <img 
                        src={`https://picsum.photos/seed/microgpt-${i}/800/800`} 
                        alt="Generated" 
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                        <p className="text-xs font-medium">Cyberpunk city with emerald lights</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeView === 'apps' ? (
              <div className="max-w-4xl mx-auto w-full pt-10">
                <h2 className="text-3xl font-bold mb-8">MicroGPT Apps</h2>
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { title: 'Code Optimizer', desc: 'Refactor and optimize your Python code automatically.', icon: Cpu },
                    { title: 'Data Analyst', desc: 'Upload CSVs and get instant insights and visualizations.', icon: Activity },
                    { title: 'Creative Writer', desc: 'Generate long-form stories and editorial content.', icon: Wand2 },
                    { title: 'Research Assistant', desc: 'Deep dive into academic papers and technical docs.', icon: Search },
                  ].map((app, i) => (
                    <button key={i} className="p-8 rounded-3xl bg-[#1a1a1a] border border-white/5 hover:border-emerald-500/30 transition-all text-left group">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <app.icon className="text-emerald-500" size={24} />
                      </div>
                      <h3 className="text-xl font-bold mb-2">{app.title}</h3>
                      <p className="text-sm opacity-40 leading-relaxed">{app.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : activeView === 'research' ? (
              <div className="max-w-4xl mx-auto w-full pt-10">
                <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-3xl p-10 text-center mb-10">
                  <Compass size={48} className="text-emerald-500 mx-auto mb-6" />
                  <h2 className="text-3xl font-bold mb-4">Deep Research Mode</h2>
                  <p className="text-white/60 max-w-lg mx-auto leading-relaxed">
                    MicroGPT Research uses advanced reasoning to browse the web, synthesize information, and create comprehensive reports on any topic.
                  </p>
                  <button className="mt-8 px-8 py-3 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20">
                    Start New Research
                  </button>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest opacity-20 ml-2">Recent Reports</h3>
                  {[
                    'The future of AGI in 2025',
                    'Quantum Computing breakthroughs',
                    'Sustainable energy storage solutions'
                  ].map((report, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-[#1a1a1a] border border-white/5 flex items-center justify-between">
                      <span className="font-medium">{report}</span>
                      <button className="text-xs text-emerald-400 hover:underline">View Report</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeView === 'health' ? (
              <div className="max-w-4xl mx-auto w-full pt-10">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                    <Heart className="text-red-500" size={24} />
                  </div>
                  <h2 className="text-3xl font-bold">Health Dashboard</h2>
                </div>
                <div className="grid grid-cols-3 gap-6 mb-10">
                  {[
                    { label: 'Heart Rate', value: '72 bpm', status: 'Normal', color: 'text-emerald-400' },
                    { label: 'Sleep Quality', value: '84%', status: 'Good', color: 'text-emerald-400' },
                    { label: 'Stress Level', value: 'Low', status: 'Optimal', color: 'text-emerald-400' },
                  ].map((stat, i) => (
                    <div key={i} className="p-6 rounded-3xl bg-[#1a1a1a] border border-white/5">
                      <p className="text-xs opacity-40 uppercase tracking-widest mb-2">{stat.label}</p>
                      <p className="text-2xl font-bold mb-1">{stat.value}</p>
                      <p className={cn("text-[10px] font-bold uppercase", stat.color)}>{stat.status}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[#1a1a1a] rounded-3xl p-8 border border-white/5">
                  <h3 className="font-bold mb-6">AI Health Insights</h3>
                  <div className="space-y-4">
                    <div className="flex gap-4 p-4 rounded-2xl bg-[#0b0d0e] border border-white/5">
                      <Activity className="text-emerald-500 shrink-0" size={20} />
                      <p className="text-sm opacity-60 leading-relaxed">
                        Your activity levels have increased by 15% this week. Great job! Consider increasing your protein intake to support muscle recovery.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeView === 'training' ? (
              <TrainingDashboard />
            ) : (
              <div className="h-full flex flex-col items-center justify-center mt-32 text-center">
                <div className="w-16 h-16 rounded-3xl bg-[#1a1a1a] flex items-center justify-center mb-8 border border-white/5">
                  {activeView === 'profile' && <User size={32} className="text-emerald-500" />}
                </div>
                <h2 className="text-2xl font-semibold mb-4 capitalize">{activeView.replace('-', ' ')}</h2>
                
                {activeView === 'profile' && user ? (
                  <div className="max-w-md w-full bg-[#1a1a1a] rounded-2xl p-6 border border-white/5 space-y-6">
                    <div className="flex flex-col items-center">
                      <img src={user.avatar} alt="Avatar" className="w-20 h-20 rounded-full mb-4 border-2 border-emerald-500/20" />
                      <h3 className="text-xl font-medium">{user.name}</h3>
                      <p className="text-sm text-white/40">{user.email}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#0b0d0e] p-4 rounded-xl border border-white/5">
                        <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">Plan</p>
                        <p className="text-sm font-medium">Free Tier</p>
                      </div>
                      <div className="bg-[#0b0d0e] p-4 rounded-xl border border-white/5">
                        <p className="text-[10px] uppercase tracking-wider opacity-40 mb-1">Joined</p>
                        <p className="text-sm font-medium">March 2024</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="w-full py-2 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-medium"
                    >
                      Log out
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-white/40 max-w-md">
                      This feature is currently in development. You can continue using the main chat or download the MicroGPT Python script for advanced features.
                    </p>
                    <button 
                      onClick={() => setActiveView('chat')}
                      className="mt-8 px-6 py-2 rounded-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/20 transition-all"
                    >
                      Back to Chat
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Input Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0b0d0e] via-[#0b0d0e] to-transparent">
          <div className="max-w-3xl mx-auto relative">
            <form 
              onSubmit={handleSend}
              className="bg-[#1a1a1a] rounded-[26px] p-2 flex items-end gap-2 shadow-2xl border border-white/5 focus-within:border-emerald-500/30 transition-all"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <Tooltip content="Upload file">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 hover:bg-[#2a2a2a] rounded-full transition-colors opacity-60 hover:opacity-100"
                >
                  <Paperclip size={20} />
                </button>
              </Tooltip>
              
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask MicroGPT anything..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-2 text-[15px] max-h-40 scrollbar-hide placeholder:opacity-40"
              />

              <div className="flex items-center gap-1">
                <Tooltip content="Voice input">
                  <button 
                    type="button" 
                    onClick={handleMicClick}
                    className="p-2 hover:bg-[#2a2a2a] rounded-full transition-colors opacity-60 hover:opacity-100"
                  >
                    <Mic size={20} />
                  </button>
                </Tooltip>
                <Tooltip content="Send message">
                  <button 
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      input.trim() && !isLoading ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "bg-white/5 text-white/10 cursor-not-allowed"
                    )}
                  >
                    <ArrowUp size={20} />
                  </button>
                </Tooltip>
              </div>
            </form>
            <p className="text-[11px] text-center mt-3 opacity-20">
              MicroGPT can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </main>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#1a1a1a] rounded-3xl p-8 border border-white/10 shadow-2xl"
            >
              <button 
                onClick={() => setShowLoginModal(false)}
                className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors opacity-40 hover:opacity-100"
              >
                <X size={20} />
              </button>
              <div className="flex flex-col items-center mb-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4">
                  <Brain size={24} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold">{isSignUp ? 'Create account' : 'Welcome back'}</h2>
                <p className="text-sm text-white/40 mt-1">{isSignUp ? 'Join the MicroGPT community' : 'Sign in to your MicroGPT account'}</p>
              </div>

              <div className="space-y-3 mb-6">
                <button 
                  onClick={() => handleSocialLogin('google')}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-100 transition-all shadow-lg"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5.04c1.9 0 3.61.65 4.96 1.93l3.71-3.71C18.42 1.24 15.42 0 12 0 7.31 0 3.25 2.69 1.24 6.63l4.31 3.34C6.55 7.33 9.05 5.04 12 5.04z"/>
                    <path fill="#4285F4" d="M23.49 12.27c0-.8-.07-1.56-.19-2.3H12v4.35h6.44c-.28 1.48-1.11 2.73-2.37 3.58l3.71 2.87c2.17-2 3.71-4.94 3.71-8.5z"/>
                    <path fill="#FBBC05" d="M5.55 14.34c-.23-.69-.36-1.42-.36-2.18s.13-1.49.36-2.18L1.24 6.63C.45 8.21 0 9.98 0 11.84s.45 3.63 1.24 5.21l4.31-3.34z"/>
                    <path fill="#34A853" d="M12 23.68c3.24 0 5.95-1.08 7.93-2.91l-3.71-2.87c-1.08.73-2.47 1.16-4.22 1.16-3.24 0-5.98-2.19-6.96-5.14l-4.31 3.34c2.01 3.94 6.07 6.63 10.76 6.63z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
                
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleSocialLogin('facebook')}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#1877F2] text-white font-semibold hover:bg-[#166fe5] transition-all"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span className="text-xs">Facebook</span>
                  </button>
                  <button 
                    onClick={() => handleSocialLogin('linkedin')}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0A66C2] text-white font-semibold hover:bg-[#0958a8] transition-all"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span className="text-xs">LinkedIn</span>
                  </button>
                </div>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#1a1a1a] px-2 text-white/20">Or use email</span></div>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {isSignUp && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-white/40 ml-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={loginName}
                      onChange={(e) => setLoginName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full bg-[#0b0d0e] border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/40 ml-1">Email address</label>
                  <input 
                    type="email" 
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-[#0b0d0e] border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white/40 ml-1">Password</label>
                  <input 
                    type="password" 
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0b0d0e] border border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20 mt-4"
                >
                  {isSignUp ? 'Sign up' : 'Continue'}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/5 text-center">
                <p className="text-xs text-white/40">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"} <button 
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-emerald-400 hover:underline"
                  >
                    {isSignUp ? 'Sign in' : 'Sign up'}
                  </button>
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
