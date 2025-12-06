"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import CrisisCard from "../components/CrisisCard";
import dynamic from "next/dynamic";
import moment from "moment";

// --------------------------------------------------------------------------------
// FIX: Use the newer '@lottiefiles/dotlottie-react' library.
// We still use dynamic import to avoid SSR issues with canvas elements.
// --------------------------------------------------------------------------------
const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((mod) => mod.DotLottieReact),
  { ssr: false }
);

interface Alert {
  id: string;
  title: string;
  category: string;
  confidence: number;
  url: string;
  subreddit: string;
  timestamp: number;
}

// REMOVED "Other" from the list so users focus only on real threats
// Updated with comprehensive list of disaster categories
const CATEGORIES = [
  "All",
  "Fire",
  "Flood",
  "Earthquake",
  "Storm",
  "Cold",
  "Other Weather",
  "Medical Emergency",
  "Displaced People",
  "Infrastructure Damage",
  "Caution/Advice",
  "Violence",
  "Search and Rescue",
  "Aid Related",
  "Death/Missing People",
  "Requests for Help"
];

export default function Dashboard() {
  // --- STATE ---
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [status, setStatus] = useState("SCANNING");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isSearching, setIsSearching] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Sidebar closed by default

  const isSearchingRef = useRef(false);

  // --- CONFIG ---
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // --- API FUNCTIONS ---
  const fetchLiveFeed = async () => {
    if (isSearchingRef.current) return;

    try {
      const res = await fetch(`${API_URL}/api/live-feed`);
      const json = await res.json();
      
      if (json.status === "success") {
        setStatus("ONLINE");
        setAlerts((prev) => {
            const itemMap = new Map();
            prev.forEach(item => itemMap.set(item.id, item));
            json.data.forEach((item: Alert) => {
                if (!itemMap.has(item.id)) itemMap.set(item.id, item);
            });
            // Sort by time and Cap at 250 to allow better filtering across categories
            return Array.from(itemMap.values())
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 250);
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("ERROR");
    }
  };

  const performSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!searchTerm.trim()) {
        setIsSearching(false);
        isSearchingRef.current = false;
        setAlerts([]); 
        fetchLiveFeed();
        return;
    }

    setIsSearching(true);
    isSearchingRef.current = true;
    setStatus("SEARCHING...");
    setAlerts([]); 

    try {
        const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(searchTerm)}`);
        const json = await res.json();
        
        if (json.status === "success") {
            setAlerts(json.data);
            setStatus(json.data.length === 0 ? "NO RESULTS" : "FOUND");
        }
    } catch (err) {
        console.error(err);
        setStatus("ERROR");
    }
  };

  useEffect(() => {
    fetchLiveFeed();
    const interval = setInterval(fetchLiveFeed, 10000);
    return () => clearInterval(interval);
  }, []);

  const displayedFeed = useMemo(() => {
    return alerts.filter(alert => {
      // 1. STRICT FILTER: Completely ignore "Other" category (Noise/Anime/Games)
      // We only want to show actionable crisis events.
      if (alert.category === "Other") return false;

      // 2. Apply Category Filters
      const matchesCategory = selectedCategory === "All" || alert.category === selectedCategory;
      return matchesCategory;
    });
  }, [alerts, selectedCategory]);

  return (
    <div className="min-h-screen bg-[#050b14] text-slate-200 font-sans selection:bg-blue-500/30 relative overflow-hidden flex">
      
      {/* --- LEFT SIDEBAR (Persistent) --- */}
      <aside 
        className={`fixed top-0 left-0 h-full w-80 bg-[#0b1321] border-r border-slate-800 z-[60] transform transition-transform duration-300 ease-in-out shadow-2xl ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 h-full flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-white tracking-tight">Filters</h2>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Added styles to hide scrollbar: [&::-webkit-scrollbar]:hidden for Chrome/Safari/Opera, [-ms-overflow-style:none] for IE/Edge, [scrollbar-width:none] for Firefox */}
          <div className="space-y-6 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div>
              <label className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-3 block">Category</label>
              <div className="grid gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-200 flex items-center justify-between group ${
                      selectedCategory === cat 
                        ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                        : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-medium">{cat}</span>
                    {selectedCategory === cat && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="mt-auto border-t border-slate-800 pt-6">
             <button 
               onClick={() => {
                 setSelectedCategory("All");
                 setSearchTerm("");
                 setIsSearching(false);
                 isSearchingRef.current = false;
                 setAlerts([]);
                 fetchLiveFeed();
               }}
               className="w-full py-3 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800 transition-all text-sm font-medium"
             >
               Reset All Filters
             </button>
          </div>
        </div>
      </aside>

      {/* --- MAIN CONTENT WRAPPER --- */}
      {/* This div transitions margin-left to "shrink" the site when sidebar opens */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${isSidebarOpen ? 'ml-80' : 'ml-0'}`}>
        
        {/* --- NAVBAR --- */}
        <nav className="border-b border-slate-800 bg-[#050b14]/80 backdrop-blur-md sticky top-0 z-50 relative overflow-hidden">
          
          {/* Lottie Animation Layer */}
          {/* Adjusted: Lower opacity (20), shorter height (h-16), aggressive scale-x to fill width */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none overflow-hidden">
              <div className="w-full h-16 scale-x-[10]" style={{ filter: 'grayscale(100%) sepia(100%) hue-rotate(190deg) saturate(500%) brightness(0.8) drop-shadow(0 0 5px rgba(59, 130, 246, 0.8))' }}>
                <DotLottieReact
                    src="/pulse.lottie"
                    loop
                    autoplay
                    style={{ width: '100%', height: '100%' }}
                />
              </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative z-10 w-full">
            
            {/* Left Side: Hamburger + Logo */}
            <div className="flex items-center gap-4">
              {/* Hamburger Button (Moved to Left) */}
              <button 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className={`p-2 rounded-lg border transition-all duration-200 group ${
                      isSidebarOpen || selectedCategory !== "All"
                      ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' 
                      : 'bg-[#050b14]/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                  }`}
                  title="Toggle Filters"
              >
                  <div className="relative">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      {/* Active Filter Dot */}
                      {selectedCategory !== "All" && !isSidebarOpen && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-[#050b14]"></span>
                      )}
                  </div>
              </button>

              {/* Logo */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'ONLINE' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : status === 'ERROR' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`}></div>
                <h1 className="text-xl font-bold tracking-tight text-white">
                  ResQ<span className="text-blue-500">Tweet</span>
                </h1>
              </div>
            </div>

            {/* Right Side: Status */}
            <div className="text-xs font-mono text-slate-500 uppercase">
              STATUS: {status}
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 py-8 relative z-10 w-full">
          
          {/* HERO SECTION (Only show on Live Mode) */}
          {!isSearching && displayedFeed.some(a => a.confidence > 90) && (
           <section className="mb-12">
             <h2 className="flex items-center gap-2 text-sm font-bold text-red-400 uppercase tracking-widest mb-4">
               <span className="animate-pulse">●</span> Critical Events (Live)
             </h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {displayedFeed.filter(a => a.confidence > 90 && ['Fire','Earthquake','Violence'].includes(a.category)).slice(0, 3).map(alert => (
                  <div key={alert.id} className="relative group">
                     <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl opacity-30 group-hover:opacity-100 transition duration-500 blur"></div>
                     <div className="relative h-full bg-[#0b1321] rounded-xl p-6 flex flex-col justify-between border border-slate-800">
                         <div>
                             <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded border border-red-500/30">
                                 {alert.category}
                             </span>
                             <h3 className="text-lg font-bold text-white mt-3 leading-tight line-clamp-2">
                                 {alert.title}
                             </h3>
                         </div>
                         <div className="mt-4 text-xs text-slate-500 flex justify-between">
                             <span>{moment.unix(alert.timestamp).fromNow()}</span>
                             <span>{alert.confidence}% Verified</span>
                         </div>
                     </div>
                  </div>
               ))}
             </div>
           </section>
        )}

        {/* CONTROLS (Search Only) */}
        <div className="mb-10 relative z-40">
            <form onSubmit={performSearch} className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl opacity-0 group-focus-within:opacity-30 transition duration-500 blur"></div>
              <div className="relative flex items-center bg-[#0b1321] rounded-xl border border-slate-800 focus-within:border-blue-500/50 transition-colors shadow-lg">
                  <svg className="w-5 h-5 text-slate-500 ml-4 group-focus-within:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  <input 
                  type="text"
                  placeholder="Search global events (e.g., 'Wildfire in California')..."
                  className="w-full bg-transparent border-none outline-none text-slate-100 text-base rounded-xl focus:ring-0 block p-4 placeholder-slate-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="pr-4">
                      <kbd className="hidden sm:inline-block px-2 py-1 text-xs font-mono text-slate-500 bg-slate-900 rounded border border-slate-700">Enter</kbd>
                  </div>
              </div>
            </form>
          </div>

          {/* MAIN GRID */}
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
              <span>{isSearching ? `Search Results for "${searchTerm}"` : "Live Reports"}</span>
              {selectedCategory !== "All" && (
                  <span className="text-xs font-normal text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                      Filter: {selectedCategory}
                  </span>
              )}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedFeed.map((alert) => (
              <CrisisCard key={alert.id} data={alert} />
            ))}
          </div>
          
          {displayedFeed.length === 0 && (
              <div className="py-20 text-center text-slate-600">
                  {status === "SEARCHING..." ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  ) : (
                      "No reports found."
                  )}
              </div>
          )}
        </main>
      </div>
    </div>
  );
}