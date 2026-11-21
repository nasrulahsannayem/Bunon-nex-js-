import { useEffect, useState } from 'react';
import { ScrollText, Play, Pause, Copy, Check, Download, X, RefreshCw, Zap } from 'lucide-react';

type LogEntry = {
  id: string;
  time: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  source: 'browser' | 'server' | 'meta-webhook' | 'api' | 'fcm' | 'capi';
  event: string;
  message: string;
  data?: any;
  copied: boolean;
};

export default function MetaEventLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState<'all' | 'browser' | 'server' | 'meta-webhook' | 'api' | 'fcm' | 'capi'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);

  const load = async (live = false) => {
    setLoading(true);
    setError('');
    try {
      const url = '/api/admin/meta/event-logs?limit=200' + (live ? '&live=1' : '');
      const r = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + String(localStorage.getItem('bunon_token') || '') }
      });
      const d = await r.json();
      if (d.ok) {
        const entries: LogEntry[] = (d.logs || []).map((l: any) => ({
          id: l.id,
          time: l.time,
          level: l.level as any,
          source: l.source,
          event: l.event,
          message: l.message,
          data: l.data,
          copied: false
        }));
        setLogs(entries);
      } else {
        setError(d.error || 'Failed to load logs');
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible && filter === 'all') {
      const interval = setInterval(() => {
        load(true);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [visible, filter]);

  useEffect(() => {
    load(false);
  }, []);

  const filtered = logs.filter((l) => filter === 'all' || l.source === filter);

  const copyLog = (log: LogEntry) => {
    const text = `[${log.time}] ${log.level.toUpperCase()} [${log.source}] ${log.event}: ${log.message}\n${JSON.stringify(log.data || {})}\n---`;
    navigator.clipboard.writeText(text);
    log.copied = true;
    setTimeout(() => { log.copied = false; }, 2000);
  };

  const copyAll = () => {
    const text = filtered.map((l) => `[${l.time}] ${l.level.toUpperCase()} [${l.source}] ${l.event}: ${l.message}\n${JSON.stringify(l.data || {})}\n---`).join('\n');
    navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const download = () => {
    const data = JSON.stringify(filtered, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meta-event-logs-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warn: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    debug: 'bg-gray-100 text-gray-800'
  };

  const sourceColors: Record<string, string> = {
    browser: 'bg-purple-100 text-purple-800',
    server: 'bg-blue-100 text-blue-800',
    'meta-webhook': 'bg-green-100 text-green-800',
    api: 'bg-orange-100 text-orange-800',
    fcm: 'bg-red-100 text-red-800',
    capi: 'bg-indigo-100 text-indigo-800'
  };

  if (!visible) {
    return (
      <div
        style={{ cursor: 'pointer', position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, minWidth: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', boxShadow: '0 4px 12px rgba(59,130,246,.3)' }}
        onClick={() => setVisible(true)}
      >
        <Zap size={28} color="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/30" onClick={() => setVisible(false)}>
      <div className="flex items-center justify-between p-3 bg-white border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <Zap size={20} color="#3b82f6" />
          <span className="font-bold text-sm">Meta Event Logs (Live)</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">{logs.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="all">All Sources</option>
            <option value="browser">Browser</option>
            <option value="server">Server</option>
            <option value="meta-webhook">Webhook</option>
            <option value="api">API</option>
            <option value="fcm">FCM</option>
            <option value="capi">CAPI</option>
          </select>
          <button
            onClick={() => { load(true); setVisible(true); }}
            className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-700 flex items-center gap-1"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={copyAll} disabled={filtered.length === 0} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-50">
            <Copy size={14} /> {copying ? 'Copied!' : 'Copy All'}
          </button>
          <button onClick={download} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-700">
            <Download size={14} /> JSON
          </button>
          <button onClick={() => setVisible(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col bg-slate-900">
        <div className="flex items-center justify-between p-2 flex-shrink-0 border-b">
          <div className="flex gap-2 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${filter === 'all' ? 'bg-blue-500' : 'bg-gray-400'}`} />
              {filter === 'all' ? 'All' : filter}
            </span>
            {filtered.length} events
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              Auto-scroll
            </label>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1" style={{ maxHeight: '500px' }}>
          {loading && <div className="text-gray-400">Loading logs...</div>}
          {error && <div className="text-red-400">Error: {error}</div>}
          {!loading && !error && filtered.length === 0 && <div className="text-gray-400">No logs found</div>}
          {filtered.map((log) => (
            <div
              key={log.id || log.time + log.id}
              className="border-b border-gray-700/50 hover:bg-gray-800/30 px-2 py-1.5 rounded relative group"
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${levelColors[log.level] || levelColors.info}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-300 text-xs">{log.time}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${sourceColors[log.source] || sourceColors.server}`}>{log.source}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${levelColors[log.level] || levelColors.info}`}>{log.level}</span>
                    <span className="font-medium text-gray-200 text-xs">{log.event}</span>
                  </div>
                  <p className="text-gray-300 text-xs mt-0.5">{log.message}</p>
                  {log.data && (
                    <pre className="text-[10px] text-gray-500 mt-1 max-h-20 overflow-auto">{JSON.stringify(log.data, null, 2)}</pre>
                  )}
                  <button
                    onClick={() => copyLog(log)}
                    className="text-[10px] text-blue-400 hover:text-blue-300 mt-1 underline"
                  >
                    {log.copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {autoScroll && filtered.length > 0 && (
          <div className="p-2 flex-shrink-0">
            <div className="flex gap-2">
              <button onClick={copyAll} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 flex items-center gap-1">
                Copy All ({filtered.length})
              </button>
              <button onClick={download} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 flex items-center gap-1">
                Download JSON
              </button>
              <button onClick={() => load(true)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-700 flex items-center gap-1">
                <RefreshCw size={14} /> Live Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
