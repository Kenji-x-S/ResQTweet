import React from 'react';
import moment from 'moment';

interface CrisisProps {
  title: string;
  category: string;
  confidence: number;
  url: string;
  subreddit: string;
  timestamp: number;
}

const categoryStyles: Record<string, string> = {
  'Fire': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Flood': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Earthquake': 'bg-amber-700/10 text-amber-500 border-amber-700/20',
  'Medical Emergency': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Violence': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Other': 'bg-slate-700/30 text-slate-300 border-slate-600',
};

export default function CrisisCard({ data }: { data: CrisisProps }) {
  const style = categoryStyles[data.category] || categoryStyles['Other'];
  
  return (
    <a 
      href={data.url} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="block group h-full"
    >
      <div className="
        relative overflow-hidden
        h-full flex flex-col p-5 rounded-xl
        bg-[#0b1321]/60 backdrop-blur-md        /* See-through glass look */
        border border-slate-700/50              /* Subtle border */
        shadow-[0_0_15px_rgba(0,0,0,0.5)]       /* Deep shadow */
        group-hover:border-blue-500/50          /* Light up border on hover */
        group-hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] /* Blue glow on hover */
        transition-all duration-300
      ">
        <div className="flex justify-between items-start mb-4">
          <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border ${style}`}>
            {data.category}
          </span>
          <span className="text-xs text-slate-500 font-mono">
            {data.confidence}% Conf
          </span>
        </div>

        <h3 className="text-lg font-semibold text-slate-100 group-hover:text-blue-400 transition mb-3 line-clamp-3">
          {data.title}
        </h3>

        <div className="mt-auto flex items-center justify-between text-xs text-slate-500 border-t border-slate-700/50 pt-3">
          <div className="flex items-center gap-1 font-mono">
            <span>{moment.unix(data.timestamp).fromNow()}</span>
          </div>
          <span className="uppercase text-slate-600 font-mono">
            r/{data.subreddit}
          </span>
        </div>
      </div>
    </a>
  );
}