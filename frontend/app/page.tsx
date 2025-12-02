"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import CrisisCard from "../components/CrisisCard";
import moment from "moment";

interface Alert {
  id: string;
  title: string;
  category: string;
  confidence: number;
  url: string;
  subreddit: string;
  timestamp: number;
}

const CATEGORIES = ["All", "Fire", "Flood", "Earthquake", "Medical Emergency", "Violence", "Other"];

export default function Dashboard() {
  // --- STATE ---
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [status, setStatus] = useState("SCANNING");
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isSearching, setIsSearching] = useState(false);

  // We use a ref to stop the live interval when searching
  const isSearchingRef = useRef(false);

  // --- CONFIG ---
  // This line is the key fix! It uses the Cloud URL on Vercel, and Localhost on your laptop.
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // --- API FUNCTIONS ---

  // 1. LIVE FEED (Polls every 10s)
  const fetchLiveFeed = async () => {
    // Stop if we are in search mode
    if (isSearchingRef.current) return;

    try {
      // Updated to use dynamic API_URL
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
            // Sort by time and Cap at 100
            return Array.from(itemMap.values())
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 100);
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("ERROR");
    }
  };

  // 2. SEARCH FEED (Triggers once on Enter)
  const performSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If empty, go back to live mode
    if (!searchTerm.trim()) {
        setIsSearching(false);
        isSearchingRef.current = false;
        setAlerts([]); // Clear to show fresh live feed
        fetchLiveFeed();
        return;
    }

    // Enter Search Mode
    setIsSearching(true);
    isSearchingRef.current = true;
    setStatus("SEARCHING...");
    setAlerts([]); // Clear current view

    try {
        // Updated to use dynamic API_URL
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

  // --- EFFECTS ---
  useEffect(() => {
    fetchLiveFeed();
    const interval = setInterval(fetchLiveFeed, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- FILTERING (Client Side) ---
  // Even in search results, we might want to filter by category dropdown
  const displayedFeed = useMemo(() => {
    return alerts.filter(alert => {
      const matchesCategory = selectedCategory === "All" || alert.category === selectedCategory;
      return matchesCategory;
    });
  }, [alerts, selectedCategory]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      
      {/* NAVBAR */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status === 'ONLINE' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : status === 'ERROR' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'}`}></div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Sentinel<span className="text-blue-500">AI</span>
            </h1>
          </div>
          <div className="text-xs font-mono text-slate-500 uppercase">
            STATUS: {status}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
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
                     <div className="relative h-full bg-slate-900 rounded-xl p-6 flex flex-col justify-between border border-slate-800">
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

        {/* CONTROLS */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
          
          {/* Search Form */}
          <form onSubmit={performSearch} className="relative w-full md:w-96">
            <input 
              type="text"
              placeholder="Search global events (Press Enter)..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </form>

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2 w-full md:w-auto">
             <label className="text-sm text-slate-400">Filter:</label>
             <select 
                className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
             >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
             </select>
          </div>
        </div>

        {/* MAIN GRID */}
        <h2 className="text-lg font-semibold text-white mb-4">
            {isSearching ? `Search Results for "${searchTerm}"` : "Live Reports"}
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
  );
}