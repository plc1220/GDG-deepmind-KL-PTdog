import React, { useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight, 
  Clock, 
  Info, 
  MapPin, 
  Navigation, 
  Search, 
  Users, 
  Accessibility, 
  ArrowRight,
  ShieldAlert,
  Zap,
  Menu,
  Bell,
  Settings,
  Circle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Mock Data ---

const STATIONS = [
  {
    id: 'pasar-seni',
    name: 'Pasar Seni',
    line: 'LRT Kelana Jaya / MRT Kajang',
    status: 'critical',
    alert: 'LRT to MRT Transfer Lift Offline',
    infrastructure: {
      lifts: 'down',
      escalators: 'up',
      ramps: 'up'
    }
  },
  {
    id: 'kl-sentral',
    name: 'KL Sentral',
    line: 'Interchange Hub',
    status: 'operational',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up'
    }
  },
  {
    id: 'masjid-jamek',
    name: 'Masjid Jamek',
    line: 'LRT Kelana Jaya / Ampang',
    status: 'degraded',
    alert: 'Escalator maintenance at Gate C',
    infrastructure: {
      lifts: 'up',
      escalators: 'degraded',
      ramps: 'up'
    }
  },
  {
    id: 'ttdi',
    name: 'TTDI',
    line: 'MRT Kajang',
    status: 'operational',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up'
    }
  },
  {
    id: 'bukit-bintang',
    name: 'Bukit Bintang',
    line: 'MRT Kajang / Monorail',
    status: 'operational',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up'
    }
  },
  {
    id: 'klcc',
    name: 'KLCC',
    line: 'LRT Kelana Jaya',
    status: 'operational',
    infrastructure: {
      lifts: 'up',
      escalators: 'up',
      ramps: 'up'
    }
  }
];

const INCIDENTS = [
  {
    id: 1,
    time: '2 mins ago',
    user: '@user123',
    location: 'TTDI Gate B',
    message: 'Platform lift broken, staff notified but no ETA.',
    type: 'lift'
  },
  {
    id: 2,
    time: '15 mins ago',
    user: '@transit_pro',
    location: 'Pasar Seni',
    message: 'Transfer lift still offline. Use street level crossing as alternative.',
    type: 'alert'
  },
  {
    id: 3,
    time: '45 mins ago',
    user: '@stroller_mom',
    location: 'KL Sentral',
    message: 'Escalator near ERL entrance making loud grinding noise.',
    type: 'escalator'
  }
];

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const styles = {
    operational: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    critical: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.3)]',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[status as keyof typeof styles]}`}>
      {status}
    </span>
  );
};

const InfraIcon = ({ type, status }: { type: 'lifts' | 'escalators' | 'ramps', status: string }) => {
  const color = status === 'up' ? 'text-emerald-500' : status === 'degraded' ? 'text-amber-500' : 'text-rose-500';
  
  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <div className="p-1 rounded bg-white/5">
        {type === 'lifts' && <Accessibility size={14} />}
        {type === 'escalators' && <Activity size={14} />}
        {type === 'ramps' && <Zap size={14} />}
      </div>
      <span className="text-[10px] font-medium uppercase">{status === 'up' ? 'OK' : status.toUpperCase()}</span>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'feed' | 'planner'>('feed');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/30">
      {/* Navigation */}
      <nav className="border-b border-white/5 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center shadow-lg shadow-rose-600/20">
                <ShieldAlert size={20} className="text-white" />
              </div>
              <span className="text-xl font-bold tracking-tighter">PT<span className="text-rose-500">dog</span></span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
              <a href="#" className="text-zinc-100 border-b-2 border-rose-500 py-5">Dashboard</a>
              <a href="#" className="hover:text-zinc-100 transition-colors">Network Map</a>
              <a href="#" className="hover:text-zinc-100 transition-colors">Infrastructure</a>
              <a href="#" className="hover:text-zinc-100 transition-colors">Analytics</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-xs font-medium">
              <Circle size={8} className="fill-emerald-500 text-emerald-500 animate-pulse" />
              <span>Live System Status</span>
            </div>
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white">
              <Bell size={20} />
            </button>
            <button className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white">
              <Settings size={20} />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 to-orange-500 border border-white/20" />
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Transit Accessibility Watchdog</h1>
          <p className="text-zinc-400">Real-time monitoring of Klang Valley transit infrastructure health.</p>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { label: 'Grid Accessibility Health', value: '84%', sub: 'Warning State', icon: Activity, color: 'text-amber-500', trend: '-2.4% from yesterday' },
            { label: 'Active Lift Outages', value: '3', sub: 'Critical Priority', icon: AlertTriangle, color: 'text-rose-500', trend: '+1 since 08:00 AM' },
            { label: 'Crowd Risk Level', value: 'Moderate', sub: 'Peak Hour Approaching', icon: Users, color: 'text-emerald-500', trend: 'Normal for Saturday' },
          ].map((metric, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={metric.label} 
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] transition-all group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl bg-white/5 group-hover:scale-110 transition-transform ${metric.color}`}>
                  <metric.icon size={24} />
                </div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{metric.trend}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-400 mb-1">{metric.label}</p>
                <div className="flex items-baseline gap-3">
                  <h2 className="text-4xl font-bold tracking-tight">{metric.value}</h2>
                  <span className={`text-xs font-bold uppercase tracking-wider ${metric.color}`}>{metric.sub}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Station Health Grid */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <MapPin size={20} className="text-rose-500" />
                Station Health Grid
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input 
                  type="text" 
                  placeholder="Filter stations..." 
                  className="bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50 w-64"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {STATIONS.map((station, i) => (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  key={station.id}
                  className={`bg-white/5 border rounded-2xl p-5 hover:bg-white/[0.08] transition-all cursor-pointer group relative overflow-hidden ${
                    station.status === 'critical' ? 'border-rose-500/50 bg-rose-500/[0.02]' : 'border-white/10'
                  }`}
                >
                  {station.status === 'critical' && (
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 animate-pulse" />
                  )}
                  
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-bold group-hover:text-rose-400 transition-colors">{station.name}</h4>
                      <p className="text-xs text-zinc-500 font-medium">{station.line}</p>
                    </div>
                    <StatusBadge status={station.status} />
                  </div>

                  {station.alert && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3">
                      <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-bold text-rose-200">{station.alert}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex gap-4">
                      <InfraIcon type="lifts" status={station.infrastructure.lifts} />
                      <InfraIcon type="escalators" status={station.infrastructure.escalators} />
                      <InfraIcon type="ramps" status={station.infrastructure.ramps} />
                    </div>
                    <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-100 transition-colors" />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Mock Map Placeholder */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 h-[400px] relative overflow-hidden group">
              <div className="absolute inset-0 bg-[url('https://picsum.photos/seed/transit-map/1200/800')] opacity-20 grayscale group-hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
              
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4 backdrop-blur-md border border-white/20">
                  <Navigation size={32} className="text-rose-500" />
                </div>
                <h4 className="text-xl font-bold mb-2">Interactive Accessibility Map</h4>
                <p className="text-zinc-400 text-sm max-w-md mb-6">
                  Visualizing real-time infrastructure status across the entire rail network. 
                  Connect your Google Maps API key to enable full spatial analysis.
                </p>
                <div className="flex gap-3">
                  <button className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full text-sm font-bold transition-colors">
                    Configure API Key
                  </button>
                  <button className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-bold transition-colors backdrop-blur-md">
                    View Static Map
                  </button>
                </div>
              </div>

              {/* Map UI Overlays */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <div className="p-2 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold uppercase">Operational</span>
                </div>
                <div className="p-2 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-lg flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-[10px] font-bold uppercase">Critical Outage</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Tabs */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-1 flex">
              <button 
                onClick={() => setActiveTab('feed')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'feed' ? 'bg-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-100'}`}
              >
                Incident Feed
              </button>
              <button 
                onClick={() => setActiveTab('planner')}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'planner' ? 'bg-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-100'}`}
              >
                Route Planner
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'feed' ? (
                <motion.div
                  key="feed"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between px-2">
                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Live Reports</h4>
                    <span className="text-[10px] font-bold text-rose-500 animate-pulse">● LIVE</span>
                  </div>
                  
                  {INCIDENTS.map((incident) => (
                    <div key={incident.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/[0.08] transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-rose-500">
                            {incident.user[1].toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-zinc-300">{incident.user}</span>
                        </div>
                        <span className="text-[10px] font-medium text-zinc-500 flex items-center gap-1">
                          <Clock size={10} />
                          {incident.time}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 mb-3 leading-relaxed">
                        <span className="text-rose-400 font-bold">@{incident.location}:</span> {incident.message}
                      </p>
                      <div className="flex gap-2">
                        <button className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold transition-colors">Verify</button>
                        <button className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold transition-colors">Comment</button>
                      </div>
                    </div>
                  ))}

                  <button className="w-full py-4 border-2 border-dashed border-white/10 rounded-2xl text-zinc-500 hover:text-rose-500 hover:border-rose-500/50 hover:bg-rose-500/5 transition-all font-bold text-sm flex items-center justify-center gap-2">
                    <AlertTriangle size={16} />
                    Report New Incident
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="planner"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Starting From</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500" size={16} />
                        <input 
                          type="text" 
                          defaultValue="Sunway" 
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        />
                      </div>
                    </div>
                    <div className="flex justify-center -my-2 relative z-10">
                      <div className="bg-zinc-950 p-2 rounded-full border border-white/10">
                        <ArrowRight className="rotate-90 text-zinc-500" size={16} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Destination</label>
                      <div className="relative">
                        <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" size={16} />
                        <input 
                          type="text" 
                          defaultValue="KLCC" 
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        />
                      </div>
                    </div>
                    <button className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2">
                      <Search size={18} />
                      Find Accessible Route
                    </button>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider px-2">Generated Results</h4>
                    
                    {/* Fastest Route (Unaccessible) */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 opacity-60 grayscale hover:grayscale-0 transition-all cursor-not-allowed">
                      <div className="flex justify-between items-center mb-3">
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] font-bold uppercase">Fastest</span>
                        <span className="text-sm font-bold">45 mins</span>
                      </div>
                      <div className="flex items-center gap-2 text-rose-500 mb-2">
                        <AlertTriangle size={14} />
                        <span className="text-xs font-bold">Requires Stairs ❌</span>
                      </div>
                      <p className="text-xs text-zinc-500">LRT Kelana Jaya Line via Masjid Jamek (Escalator Outage)</p>
                    </div>

                    {/* Accessible Route */}
                    <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-4 ring-2 ring-emerald-500/20">
                      <div className="flex justify-between items-center mb-3">
                        <span className="px-2 py-0.5 bg-emerald-500 text-white rounded text-[10px] font-bold uppercase">Recommended</span>
                        <span className="text-sm font-bold text-emerald-400">55 mins</span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-500 mb-2">
                        <CheckCircle size={14} />
                        <span className="text-xs font-bold">Step-free Guarantee ✅</span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        MRT Kajang Line to Bukit Bintang, then Monorail. 
                        <span className="block mt-1 text-emerald-500/80">All lifts verified operational 2m ago.</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* System Info Card */}
            <div className="bg-gradient-to-br from-indigo-600/20 to-rose-600/20 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Info size={20} className="text-indigo-400" />
                <h4 className="font-bold">Did you know?</h4>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                PTdog uses real-time GTFS data combined with crowdsourced reports to provide 98% accuracy on lift status.
              </p>
              <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                Learn more about our methodology
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 mt-12 bg-zinc-950">
        <div className="max-w-[1600px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-rose-600 rounded flex items-center justify-center">
              <ShieldAlert size={14} className="text-white" />
            </div>
            <span className="font-bold tracking-tighter">PTdog <span className="text-zinc-500 font-medium text-sm ml-2">v0.4.2-beta</span></span>
          </div>
          <div className="flex gap-8 text-sm text-zinc-500 font-medium">
            <a href="#" className="hover:text-zinc-100 transition-colors">API Documentation</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-zinc-100 transition-colors">Support</a>
          </div>
          <div className="text-xs text-zinc-600">
            © 2026 PTdog Transit Accessibility. Data powered by Prasarana & Data.gov.my
          </div>
        </div>
      </footer>
    </div>
  );
}
