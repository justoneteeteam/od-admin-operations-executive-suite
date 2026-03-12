import React, { useState } from 'react';
import communicationService, { CallRecord, CallRecordsResponse } from '../src/services/communication.service';

const CallRecordsTab: React.FC = () => {
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [callStats, setCallStats] = useState<CallRecordsResponse['stats']>({ total: 0, confirmed: 0, cancelled: 0, noAnswer: 0, unclear: 0 });
  const [crSearch, setCrSearch] = useState('');
  const [crTypeFilter, setCrTypeFilter] = useState('');
  const [crIntentFilter, setCrIntentFilter] = useState('');
  const [crLoading, setCrLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const fetchCallRecords = async () => {
    setCrLoading(true);
    try {
      const data = await communicationService.listCallRecords({
        type: crTypeFilter || undefined,
        intent: crIntentFilter || undefined,
        search: crSearch || undefined,
      });
      setCallRecords(data.records);
      setCallStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch call records:', err);
    } finally {
      setCrLoading(false);
    }
  };

  React.useEffect(() => {
    if (!loaded) {
      fetchCallRecords();
      setLoaded(true);
    }
  }, [loaded]);

  const statItems = [
    { label: 'Total Calls', value: callStats.total, icon: 'call', color: '#5b8def' },
    { label: 'Confirmed', value: callStats.confirmed, icon: 'verified', color: '#1fd07e' },
    { label: 'Cancelled', value: callStats.cancelled, icon: 'cancel', color: '#f05252' },
    { label: 'No Answer', value: callStats.noAnswer, icon: 'phone_missed', color: '#f5a623' },
    { label: 'Unclear', value: callStats.unclear, icon: 'help', color: '#a78bfa' },
  ];

  const handlePlayAudio = (id: string, url: string) => {
    if (playingId === id) {
      setPlayingId(null);
      return;
    }
    setPlayingId(id);
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
  };

  const getIntentScoreColor = (score: number | undefined | null) => {
    if (!score && score !== 0) return 'text-text-muted';
    const s = Number(score);
    if (s >= 80) return 'text-emerald-400';
    if (s >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statItems.map(s => (
          <div key={s.label} className="p-4 bg-[#111a22] rounded-xl border border-border-dark">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: s.color }}>{s.icon}</span>
              <span className="text-text-muted text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-white text-2xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
          <input
            type="text"
            placeholder="Search by order # or call SID..."
            className="w-full pl-10 pr-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            value={crSearch}
            onChange={e => setCrSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') fetchCallRecords(); }}
          />
        </div>
        <select
          className="px-3 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
          value={crTypeFilter}
          onChange={e => { setCrTypeFilter(e.target.value); setTimeout(fetchCallRecords, 100); }}
        >
          <option value="">All Types</option>
          <option value="confirmation">Confirmation</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="reconfirmation">Reconfirmation</option>
        </select>
        <select
          className="px-3 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
          value={crIntentFilter}
          onChange={e => { setCrIntentFilter(e.target.value); setTimeout(fetchCallRecords, 100); }}
        >
          <option value="">All Intents</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="NO_ANSWER">No Answer</option>
          <option value="UNCLEAR">Unclear</option>
        </select>
        <button
          onClick={fetchCallRecords}
          className="px-4 py-2.5 bg-primary/10 text-primary text-sm font-bold rounded-xl hover:bg-primary/20 transition-all border border-primary/20"
        >
          <span className="material-symbols-outlined mr-1 align-middle" style={{ fontSize: '16px' }}>refresh</span>
          Refresh
        </button>
      </div>

      <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-[#17232f] border-b border-[#233648]">
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Order</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Call SID</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Type</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Audio</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Transcription</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">English</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Intent</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Score</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">DTMF</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Duration</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Lang</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Date</th>
                <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">CS Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#233648]">
              {crLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-text-muted">
                    <div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div>
                  </td>
                </tr>
              ) : callRecords.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-text-muted text-sm">No call records found</td>
                </tr>
              ) : (
                callRecords.map(cr => {
                  const dur = cr.callDuration
                    ? Math.floor(cr.callDuration / 60) + 'm ' + (cr.callDuration % 60) + 's'
                    : '\u2014';
                  const lang = cr.scriptLanguage || 'en';
                  const langMap: Record<string, string> = { es: '\uD83C\uDDEA\uD83C\uDDF8', it: '\uD83C\uDDEE\uD83C\uDDF9', fr: '\uD83C\uDDEB\uD83C\uDDF7', de: '\uD83C\uDDE9\uD83C\uDDEA' };
                  const langFlag = langMap[lang] || '\uD83C\uDDEC\uD83C\uDDE7';
                  const intentColor =
                    cr.intentDetected === 'CONFIRMED'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : cr.intentDetected === 'CANCELLED'
                        ? 'text-red-400 bg-red-500/10 border-red-500/20'
                        : cr.intentDetected === 'NO_ANSWER'
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : 'text-purple-400 bg-purple-500/10 border-purple-500/20';

                  return (
                    <tr key={cr.id} className="hover:bg-[#1c2d3d] transition-colors">
                      <td className="px-4 py-4">
                        <p className="text-primary text-sm font-bold">{'#' + (cr.order?.orderNumber || '\u2014')}</p>
                        <p className="text-text-muted text-xs mt-0.5">{cr.order?.customer?.name || ''}</p>
                      </td>
                      <td className="px-4 py-4 text-xs text-text-muted font-mono truncate max-w-[100px]">{cr.callSid}</td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-[#1c2d3d] text-text-muted border border-border-dark">
                          {cr.scriptType}
                        </span>
                      </td>
                      {/* Audio Recording */}
                      <td className="px-4 py-4">
                        {cr.recordingUrl ? (
                          <button
                            onClick={() => handlePlayAudio(cr.id, cr.recordingUrl!)}
                            className={'size-8 rounded-lg flex items-center justify-center transition-all ' +
                              (playingId === cr.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                : 'bg-[#1c2d3d] text-text-muted hover:text-primary hover:bg-primary/10 border border-border-dark')}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                              {playingId === cr.id ? 'stop' : 'play_arrow'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-text-muted/30 text-xs">\u2014</span>
                        )}
                      </td>
                      {/* Local Transcription */}
                      <td className="px-4 py-4">
                        {cr.transcriptionText ? (
                          <p className="text-text-muted text-xs max-w-[150px] truncate" title={cr.transcriptionText}>
                            {cr.transcriptionText}
                          </p>
                        ) : (
                          <span className="text-text-muted/30 text-xs">\u2014</span>
                        )}
                      </td>
                      {/* English Transcription */}
                      <td className="px-4 py-4">
                        {cr.transcriptionEnglish ? (
                          <p className="text-white text-xs max-w-[150px] truncate" title={cr.transcriptionEnglish}>
                            {cr.transcriptionEnglish}
                          </p>
                        ) : (
                          <span className="text-text-muted/30 text-xs">\u2014</span>
                        )}
                      </td>
                      {/* Intent */}
                      <td className="px-4 py-4">
                        <span className={'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ' + intentColor}>
                          {cr.intentDetected || '\u2014'}
                        </span>
                      </td>
                      {/* Intention Score */}
                      <td className="px-4 py-4">
                        {cr.intentionScore != null ? (
                          <span className={'text-sm font-bold font-mono ' + getIntentScoreColor(cr.intentionScore)}>
                            {Number(cr.intentionScore).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-text-muted/30 text-xs">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-white font-mono">{cr.dtmfInput || '\u2014'}</td>
                      <td className="px-4 py-4 text-sm text-text-muted font-mono">{dur}</td>
                      <td className="px-4 py-4 text-xs">{langFlag + ' ' + lang.toUpperCase()}</td>
                      <td className="px-4 py-4 text-xs text-text-muted">
                        {cr.createdAt
                          ? new Date(cr.createdAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '\u2014'}
                      </td>
                      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 bg-[#0a1018] border border-border-dark rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                          defaultValue={cr.csNote || ''}
                          placeholder="Add note..."
                          onBlur={e => {
                            if (e.target.value !== (cr.csNote || '')) {
                              communicationService.updateCsNote(cr.id, e.target.value);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CallRecordsTab;
