// frontend/src/components/CrisisCard.tsx
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
    <a href={data.url} target="_blank" rel="noopener noreferrer" className="block group h-full">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition duration-300 shadow-lg h-full flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border ${style}`}>
            {data.category}
          </span>
          <span className="text-xs text-slate-500 font-mono">{data.confidence}% Conf</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-100 group-hover:text-blue-400 transition mb-3 line-clamp-3">
          {data.title}
        </h3>
        <div className="mt-auto flex items-center justify-between text-xs text-slate-500 border-t border-slate-800 pt-3">
          <span>{moment.unix(data.timestamp).fromNow()}</span>
          <span className="uppercase text-slate-600">r/{data.subreddit}</span>
        </div>
      </div>
    </a>
  );
}