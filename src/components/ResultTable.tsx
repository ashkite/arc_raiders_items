import { useMemo, useState } from 'react';
import { ClassifiedItem, Action } from '../types';
import { CheckCircle2, HelpCircle, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  items: ClassifiedItem[];
}

type Filter = "ALL" | Action;

export function ResultTable({ items }: Props) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const filteredItems = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter(i => i.action === filter);
  }, [items, filter]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 border border-neutral-800 rounded-lg bg-neutral-900/30">
        표시할 아이템이 없습니다. 이미지를 업로드하거나 텍스트를 입력하세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(["ALL", "KEEP", "MAYBE", "RECYCLE"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              filter === f 
                ? "bg-neutral-100 text-neutral-900" 
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            )}
          >
            {f === 'ALL' ? '전체' : f} ({items.filter(i => f === "ALL" || i.action === f).length})
          </button>
        ))}
      </div>

      <div className="overflow-hidden border border-neutral-800 rounded-lg bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-950 text-neutral-400 uppercase text-xs font-semibold tracking-wider">
            <tr>
              <th className="px-4 py-3 w-12">수량</th>
              <th className="px-4 py-3 w-16">아이콘</th>
              <th className="px-4 py-3">아이템 이름</th>
              <th className="px-4 py-3">분류</th>
              <th className="px-4 py-3">이유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {filteredItems.map((item, idx) => (
              <tr key={`${item.name}-${idx}`} className="hover:bg-neutral-800/50 transition-colors">
                <td className="px-4 py-3 font-mono text-neutral-300">{item.qty}</td>
                <td className="px-4 py-3">
                  <div className="w-10 h-10 bg-neutral-800 rounded overflow-hidden border border-neutral-700">
                <img 
                  src={`${import.meta.env.BASE_URL}items/${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.png`}
                  alt={result.label} 
                  className="w-12 h-12 object-contain rounded-md border border-white/10 bg-black/20"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-neutral-100">{item.name}</td>
                <td className="px-4 py-3">
                  <ActionBadge action={item.action} />
                </td>
                <td className="px-4 py-3 text-neutral-400 text-xs">{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: Action }) {
  switch (action) {
    case 'KEEP':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" /> KEEP
        </span>
      );
    case 'MAYBE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <HelpCircle className="w-3 h-3" /> MAYBE
        </span>
      );
    case 'RECYCLE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          <Trash2 className="w-3 h-3" /> RECYCLE
        </span>
      );
  }
}
