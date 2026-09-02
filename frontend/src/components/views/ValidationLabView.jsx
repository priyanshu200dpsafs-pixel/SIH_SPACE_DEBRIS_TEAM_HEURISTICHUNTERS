import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

export default function ValidationLabView() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/validation')
      .then(res => res.json())
      .then(data => {
        setReport(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-10 text-white font-mono flex items-center gap-3"><span className="animate-spin text-cyan-500">⚙</span> RUNNING SCIENTIFIC VALIDATION CAMPAIGN...</div>;
  }

  if (report?.error) {
    return (
      <div className="p-10 text-white font-mono">
        <h2 className="text-xl text-red-500 mb-4 font-bold flex items-center gap-2"><XCircle /> VALIDATION NOT RUN</h2>
        <p className="text-slate-400 max-w-2xl">{report.error}</p>
        <p className="mt-4 text-xs text-slate-500">Run `python -m validation.run_all` in the backend environment to generate the report.</p>
      </div>
    );
  }

  return (
    <div className="p-10 text-white font-mono w-full h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-cyan-400">
              <CheckCircle size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-widest text-cyan-400">VALIDATION LAB</h1>
              <p className="text-slate-400 text-sm mt-1">ARES Scientific Verification & Validation Baseline</p>
            </div>
          </div>
          {report?.baseline && (
            <div className="bg-slate-900/50 p-3 rounded border border-white/5 text-xs text-slate-400 font-mono space-y-1">
              <div><span className="text-slate-500">COMMIT:</span> <span className="text-cyan-300">{report.baseline.git_commit}</span></div>
              <div><span className="text-slate-500">PYTHON:</span> {report.baseline.python_version}</div>
              <div className="text-amber-500/80 italic mt-1 text-[10px] uppercase">Strictly No Tune-to-Match</div>
            </div>
          )}
        </div>

        <div className="bg-[#0f172a] rounded border border-slate-700/50 p-4 mb-8 text-xs text-slate-400">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-amber-500 shrink-0" />
            <p>
              This dashboard compares ARES physics output against reference implementations. 
              Discrepancies do not inherently indicate bugs; they are documented and investigated.
              Missing reference models are strictly marked as UNAVAILABLE instead of faking results.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {report?.results && Object.entries(report.results).map(([key, data]) => {
            const isVerified = data.status === 'VERIFIED';
            const isCrossChecked = data.status === 'CROSS-CHECKED';
            const isPreliminary = data.status === 'PRELIMINARY';
            
            // Map colors based on status
            let bgClass = 'bg-slate-500/10 border-slate-500/30';
            let textClass = 'bg-slate-500/20 text-slate-400';
            
            if (isVerified) {
                bgClass = 'bg-emerald-500/10 border-emerald-500/30';
                textClass = 'bg-emerald-500/20 text-emerald-400';
            } else if (isCrossChecked) {
                bgClass = 'bg-blue-500/10 border-blue-500/30';
                textClass = 'bg-blue-500/20 text-blue-400';
            } else if (isPreliminary) {
                bgClass = 'bg-amber-500/10 border-amber-500/30';
                textClass = 'bg-amber-500/20 text-amber-400';
            } else if (data.status === 'REFERENCE UNAVAILABLE') {
                bgClass = 'bg-slate-500/10 border-slate-500/30';
                textClass = 'bg-slate-500/20 text-slate-400';
            } else {
                bgClass = 'bg-red-500/10 border-red-500/30';
                textClass = 'bg-red-500/20 text-red-400';
            }

            return (
              <div key={key} className="bg-[#0a0f1a] border border-white/10 rounded overflow-hidden">
                <div className={`px-4 py-3 border-b flex justify-between items-center ${bgClass}`}>
                  <h2 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                    {key.replace(/_/g, ' ')}
                  </h2>
                  <span className={`text-[10px] px-2 py-1 rounded font-bold ${textClass}`}>
                    {data.status}
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-center pb-2 mb-2 border-b border-white/10">
                    <span className="text-xs text-slate-400">REFERENCE: <span className="text-white font-medium ml-1">{data.reference_source}</span></span>
                    <span className="text-xs text-slate-400">N={data.sample_size}</span>
                  </div>
                  {Object.entries(data.metrics).map(([metric, value]) => (
                    <div key={metric} className="flex justify-between items-center border-b border-white/5 pb-2 last:border-0 last:pb-0">
                      <span className="text-[10px] text-slate-500 uppercase">{metric.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-bold text-white">{typeof value === 'number' ? value.toPrecision(3) : value}</span>
                    </div>
                  ))}
                  {data.notes && (
                    <div className="mt-4 pt-4 border-t border-white/5 text-xs text-slate-400 italic bg-white/5 p-3 rounded">
                      <AlertTriangle size={12} className="inline mr-1 text-amber-500" />
                      {data.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
