import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Database, Server, GitMerge, Settings, Clock, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function SystemTrustView({ onClose }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTrustMetrics = async () => {
      try {
        const res = await fetch('/api/v1/system/trust');
        if (!res.ok) throw new Error('Failed to fetch telemetry');
        const data = await res.json();
        setMetrics(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchTrustMetrics();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center font-mono">
        <div className="text-cyan-500 animate-pulse flex flex-col items-center">
          <Activity size={32} className="mb-4" />
          <p>ESTABLISHING TELEMETRY LINK...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center font-mono">
        <div className="text-red-500 bg-red-500/10 border border-red-500/30 p-6 rounded max-w-md text-center">
          <AlertTriangle size={32} className="mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">TELEMETRY LINK FAILED</h2>
          <p className="text-sm opacity-80">{error}</p>
          <button onClick={onClose} className="mt-6 px-4 py-2 bg-white/10 hover:bg-white/20 transition rounded text-xs tracking-widest uppercase">
            Close Panel
          </button>
        </div>
      </div>
    );
  }

  const { data, computation, risk, validation, quality } = metrics;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-hidden font-mono text-white/90 selection:bg-cyan-500/30">
      
      {/* Header */}
      <header className="flex justify-between items-center p-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-emerald-400" size={24} />
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase text-white/90">System Reliability / Trust View</h1>
            <p className="text-[10px] text-white/50 tracking-wider">REAL-TIME PLATFORM TELEMETRY</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="text-xs uppercase tracking-widest px-4 py-2 rounded border border-white/20 hover:bg-white/10 transition-colors"
        >
          Close Panel
        </button>
      </header>

      {/* Main Content Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* Mission Statement */}
          <div className="border-l-2 border-emerald-500 pl-4 py-1">
            <h2 className="text-emerald-400 text-sm font-bold uppercase tracking-widest mb-1">“Can I trust this assessment?”</h2>
            <p className="text-xs text-white/60">
              The metrics below are sourced directly from internal backend databases and physics execution logs. 
              No values are simulated or approximated for display purposes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* DATA PANEL */}
            <MetricPanel title="DATA PROVENANCE" icon={<Database size={16} />}>
              <MetricRow label="Objects Ingested" value={data.objects_ingested.toLocaleString()} />
              <MetricRow label="Failed TLEs" value={data.failed_tles} alert={data.failed_tles > 0} />
              <MetricRow label="Stale TLEs (>24h)" value={`${data.stale_tle_percentage.toFixed(1)}%`} alert={data.stale_tle_percentage > 5.0} />
              <div className="mt-3 pt-3 border-t border-white/5">
                <span className="text-[9px] text-white/40 uppercase tracking-widest block mb-2">Source Distribution</span>
                {Object.entries(data.source_distribution).map(([src, count]) => (
                  <div key={src} className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{src}</span>
                    <span>{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </MetricPanel>

            {/* COMPUTATION PANEL */}
            <MetricPanel title="COMPUTATION PIPELINE" icon={<Server size={16} />}>
              <MetricRow label="Screening Runtime" value={`${computation.screening_runtime_s.toFixed(1)}s`} />
              <MetricRow label="Stage-3 DOP853 Runtime" value={`${computation.stage3_runtime_s.toFixed(1)}s`} />
              <MetricRow label="Candidates Refined" value={computation.candidates_refined.toLocaleString()} />
              <MetricRow label="Numerical Failures" value={computation.numerical_failures} alert={computation.numerical_failures > 0} />
              <MetricRow label="Model Disagreement" value={computation.model_disagreement_events} alert={computation.model_disagreement_events > 0} />
            </MetricPanel>

            {/* RISK PANEL */}
            <MetricPanel title="RISK CALCULATION" icon={<AlertTriangle size={16} />}>
              <MetricRow label="Pc Method Agreement" value={risk.pc_method_agreement_avg.toFixed(3)} />
              <MetricRow label="Covariance Sensitivity" value={risk.covariance_sensitivity_avg.toFixed(3)} />
              <MetricRow label="High-Uncertainty Events" value={risk.high_uncertainty_events} alert={risk.high_uncertainty_events > 0} />
              
              <div className="mt-3 pt-3 border-t border-white/5">
                <span className="text-[9px] text-white/40 uppercase tracking-widest block mb-2">Monte Carlo Validation</span>
                {Object.entries(risk.mc_validation_status).map(([status, count]) => (
                  <div key={status} className="flex justify-between text-xs mb-1">
                    <span className={status === 'SIGNIFICANT DIVERGENCE' ? 'text-red-400' : 'text-white/60'}>
                      {status.replace('_', ' ')}
                    </span>
                    <span>{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </MetricPanel>

            {/* VALIDATION PANEL */}
            <MetricPanel title="EMPIRICAL VALIDATION" icon={<CheckCircle size={16} />}>
              <MetricRow label="Historical Records" value={validation.historical_records_tested.toLocaleString()} />
              <MetricRow label="Model Agreement History" value={validation.average_model_agreement_history.toFixed(2)} />
              <MetricRow label="Correlation Score" value={validation.correlation_score} />
              <MetricRow label="Calibration Status" value={validation.calibration_metrics} />
              
              <div className="mt-3 pt-3 border-t border-white/5">
                <span className="text-[9px] text-white/40 uppercase tracking-widest block mb-2 text-orange-400/80">Known Limitations</span>
                <ul className="text-[10px] text-white/60 space-y-1 list-disc pl-3">
                  {validation.known_limitations.map((limit, idx) => (
                    <li key={idx}>{limit}</li>
                  ))}
                </ul>
              </div>
            </MetricPanel>

            {/* QUALITY PANEL */}
            <MetricPanel title="VERSION & QUALITY" icon={<GitMerge size={16} />}>
              <MetricRow 
                label="Last Full Run" 
                value={quality.last_full_run ? new Date(quality.last_full_run).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC' : 'Never'} 
              />
              <MetricRow 
                label="Last Incremental Run" 
                value={quality.last_incremental_run ? new Date(quality.last_incremental_run).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC' : 'Never'} 
              />
              <MetricRow label="Dataset Version" value={quality.dataset_version || 'Unknown'} className="truncate max-w-[150px] text-right" />
              <MetricRow label="Propagator Version" value={quality.model_version} />
              <MetricRow label="Configuration" value={`v${quality.config_version}`} />
            </MetricPanel>

          </div>
        </div>
      </div>
    </div>
  );
}

function MetricPanel({ title, icon, children }) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-sm p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/10 text-white/80">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-widest">{title}</h3>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {children}
      </div>
    </div>
  );
}

function MetricRow({ label, value, alert = false, className = '' }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-white/50">{label}</span>
      <span className={cn(
        "font-semibold font-mono",
        alert ? "text-red-400" : "text-white/90",
        className
      )}>
        {value}
      </span>
    </div>
  );
}
