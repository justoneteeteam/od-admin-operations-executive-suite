import React, { useState, useEffect, useMemo } from 'react';
import ticketsService, {
    Ticket, TicketStats, IncidentWorkflow,
    CASE_TYPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS, RESOLUTION_OPTIONS,
} from '../src/services/tickets.service';

// ─── HELPERS ─────────────────────────────────────────────────────────
const caseLabel = (ct: string) => CASE_TYPE_OPTIONS.find(c => c.value === ct)?.label || ct;
const caseIcon = (ct: string) => CASE_TYPE_OPTIONS.find(c => c.value === ct)?.icon || 'help';
const caseColor = (ct: string) => CASE_TYPE_OPTIONS.find(c => c.value === ct)?.color || '#6b7280';
const priorityColor = (p: string) => PRIORITY_OPTIONS.find(x => x.value === p)?.color || '#6b7280';
const statusColor = (s: string) => STATUS_OPTIONS.find(x => x.value === s)?.color || '#6b7280';

function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function slaRemaining(deadlineStr?: string): { label: string; color: string; urgent: boolean } {
    if (!deadlineStr) return { label: 'N/A', color: '#6b7280', urgent: false };
    const now = Date.now();
    const deadline = new Date(deadlineStr).getTime();
    const diff = deadline - now;
    if (diff <= 0) return { label: 'BREACHED', color: '#ef4444', urgent: true };
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours < 8) return { label: `${hours}h ${mins}m`, color: '#f97316', urgent: true };
    return { label: `${hours}h ${mins}m`, color: '#22c55e', urgent: false };
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────
const IncidentsPage: React.FC = () => {
    const [activeView, setActiveView] = useState<'board' | 'list' | 'workflow'>('board');
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [stats, setStats] = useState<TicketStats | null>(null);
    const [workflows, setWorkflows] = useState<IncidentWorkflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Filters
    const [filterPriority, setFilterPriority] = useState('');
    const [filterCaseType, setFilterCaseType] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // New Ticket Modal
    const [showNewModal, setShowNewModal] = useState(false);
    const [newTicket, setNewTicket] = useState({ title: '', description: '', caseType: 'other', priority: 'medium', orderId: '', customerId: '' });
    const [creating, setCreating] = useState(false);

    // Message with auto-dismiss
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => setMessage(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [message]);

    // ─── FETCH DATA ──────────────────────────────────────────────────
    const fetchData = async () => {
        try {
            setLoading(true);
            const [ticketsRes, statsRes] = await Promise.all([
                ticketsService.getAll({ priority: filterPriority, caseType: filterCaseType, search: searchQuery }),
                ticketsService.getStats(),
            ]);
            setTickets(ticketsRes.tickets || []);
            setStats(statsRes);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to load tickets' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [filterPriority, filterCaseType, searchQuery]);

    const fetchWorkflows = async () => {
        try {
            const data = await ticketsService.getWorkflows();
            setWorkflows(data);
        } catch { }
    };

    useEffect(() => { if (activeView === 'workflow') fetchWorkflows(); }, [activeView]);

    // ─── TICKET DETAIL ───────────────────────────────────────────────
    const openDetail = async (id: string) => {
        try {
            setDetailLoading(true);
            const detail = await ticketsService.getById(id);
            setSelectedTicket(detail);
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Failed to load ticket' });
        } finally {
            setDetailLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTicket.title) return;
        try {
            setCreating(true);
            // Strip empty strings for optional UUID fields
            const payload: any = {
                title: newTicket.title,
                description: newTicket.description || undefined,
                caseType: newTicket.caseType,
                priority: newTicket.priority,
            };
            if (newTicket.orderId?.trim()) payload.orderId = newTicket.orderId.trim();
            if (newTicket.customerId?.trim()) payload.customerId = newTicket.customerId.trim();

            await ticketsService.create(payload);
            setShowNewModal(false);
            setNewTicket({ title: '', description: '', caseType: 'other', priority: 'medium', orderId: '', customerId: '' });
            setMessage({ type: 'success', text: '✅ Ticket created successfully!' });
            fetchData();
        } catch (err: any) {
            setMessage({ type: 'error', text: '❌ ' + (err?.response?.data?.message || 'Failed to create ticket') });
        } finally {
            setCreating(false);
        }
    };

    // ─── STATUS/RESOLVE ACTIONS ──────────────────────────────────────
    const handleStatusChange = async (id: string, status: string) => {
        try {
            await ticketsService.updateStatus(id, status);
            fetchData();
            if (selectedTicket?.id === id) openDetail(id);
            setMessage({ type: 'success', text: `Status updated to ${status}` });
        } catch (err: any) {
            setMessage({ type: 'error', text: err?.response?.data?.message || 'Failed' });
        }
    };

    const handleResolve = async (id: string, resolution: string) => {
        try {
            await ticketsService.resolve(id, resolution);
            fetchData();
            if (selectedTicket?.id === id) openDetail(id);
            setMessage({ type: 'success', text: `Resolved: ${resolution}` });
        } catch (err: any) {
            setMessage({ type: 'error', text: err?.response?.data?.message || 'Failed' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this ticket?')) return;
        try {
            await ticketsService.delete(id);
            setSelectedTicket(null);
            fetchData();
            setMessage({ type: 'success', text: 'Ticket deleted' });
        } catch (err: any) {
            setMessage({ type: 'error', text: 'Failed to delete' });
        }
    };

    // ─── KANBAN COLUMNS ──────────────────────────────────────────────
    const columns = useMemo(() => {
        const grouped: Record<string, Ticket[]> = {
            open: [], in_progress: [], resolved: [], closed: [],
        };
        tickets.forEach(t => {
            if (grouped[t.status]) grouped[t.status].push(t);
            else grouped.open.push(t);
        });
        return grouped;
    }, [tickets]);

    // ─── RENDER: KPI BAR ─────────────────────────────────────────────
    const renderKPIs = () => (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
                { label: 'Open', value: stats?.open || 0, color: '#3b82f6', icon: 'inbox' },
                { label: 'In Progress', value: stats?.inProgress || 0, color: '#f97316', icon: 'pending_actions' },
                { label: 'Resolved', value: stats?.resolved || 0, color: '#22c55e', icon: 'check_circle' },
                { label: 'Closed', value: stats?.closed || 0, color: '#6b7280', icon: 'task_alt' },
                { label: 'SLA Breached', value: stats?.slaBreached || 0, color: '#ef4444', icon: 'warning' },
                { label: 'Resolved This Week', value: stats?.resolvedThisWeek || 0, color: '#14b8a6', icon: 'trending_up' },
                { label: 'Auto Active', value: stats?.autoActive || 0, color: '#a855f7', icon: 'smart_toy' },
            ].map(kpi => (
                <div key={kpi.label} className="bg-card-dark rounded-xl border border-border-dark p-4 flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: kpi.color }}>{kpi.icon}</span>
                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{kpi.label}</span>
                    </div>
                    <span className="text-2xl font-black text-white">{kpi.value}</span>
                </div>
            ))}
        </div>
    );

    // ─── RENDER: TICKET CARD ─────────────────────────────────────────
    const renderCard = (ticket: Ticket) => {
        const sla = slaRemaining(ticket.slaDeadlineAt);
        return (
            <div
                key={ticket.id}
                onClick={() => openDetail(ticket.id)}
                className="bg-card-dark rounded-xl border border-border-dark p-4 cursor-pointer hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group"
            >
                <div className="flex items-start justify-between mb-2">
                    <span className="text-[10px] font-bold text-text-muted">{ticket.ticketNumber}</span>
                    <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ color: priorityColor(ticket.priority), borderColor: priorityColor(ticket.priority) + '30', backgroundColor: priorityColor(ticket.priority) + '10' }}
                    >
                        {ticket.priority.toUpperCase()}
                    </span>
                </div>
                <p className="text-sm font-bold text-white mb-1 truncate group-hover:text-primary transition-colors">{ticket.title}</p>
                <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: caseColor(ticket.caseType) }}>{caseIcon(ticket.caseType)}</span>
                    <span className="text-[10px] text-text-muted font-bold">{caseLabel(ticket.caseType)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {ticket.order && <span className="text-[10px] text-primary font-mono">#{ticket.order.orderNumber}</span>}
                        {ticket.customer && <span className="text-[10px] text-text-muted">{ticket.customer.name}</span>}
                    </div>
                    <div className="flex items-center gap-1" title={`SLA: ${sla.label}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12, color: sla.color }}>timer</span>
                        <span className="text-[10px] font-bold" style={{ color: sla.color }}>{sla.label}</span>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-text-muted">{formatTimeAgo(ticket.createdAt)}</span>
                    {ticket.source === '17track_auto' && (
                        <span className="text-[8px] font-bold bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20">AUTO</span>
                    )}
                </div>
            </div>
        );
    };

    // ─── RENDER: KANBAN BOARD ────────────────────────────────────────
    const renderBoard = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1">
            {STATUS_OPTIONS.map(col => (
                <div key={col.value} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                            <div className="size-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                            <span className="text-xs font-black uppercase tracking-wider text-white">{col.label}</span>
                        </div>
                        <span className="text-xs font-bold text-text-muted bg-border-dark px-2 py-0.5 rounded-full">
                            {(columns[col.value] || []).length}
                        </span>
                    </div>
                    <div className="flex flex-col gap-2 min-h-[200px]">
                        {(columns[col.value] || []).map(renderCard)}
                        {(columns[col.value] || []).length === 0 && (
                            <div className="text-center py-6 text-text-muted text-xs italic opacity-50">No tickets</div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    // ─── RENDER: LIST VIEW ───────────────────────────────────────────
    const renderList = () => (
        <div className="bg-card-dark rounded-xl border border-border-dark overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border-dark bg-[#0f1923]">
                        {['ID', 'Title', 'Category', 'Priority', 'Status', 'Customer', 'Order', 'SLA', 'Updated'].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-[10px] text-text-muted font-bold uppercase tracking-wider">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {tickets.map(t => {
                        const sla = slaRemaining(t.slaDeadlineAt);
                        return (
                            <tr key={t.id} onClick={() => openDetail(t.id)} className="border-b border-border-dark/50 hover:bg-[#1a2332] cursor-pointer transition-colors">
                                <td className="px-4 py-3 text-xs font-mono text-text-muted">{t.ticketNumber}</td>
                                <td className="px-4 py-3">
                                    <p className="text-xs font-bold text-white truncate max-w-[200px]">{t.title}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="flex items-center gap-1 text-xs" style={{ color: caseColor(t.caseType) }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{caseIcon(t.caseType)}</span>
                                        {caseLabel(t.caseType)}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: priorityColor(t.priority), backgroundColor: priorityColor(t.priority) + '10' }}>
                                        {t.priority.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: statusColor(t.status), backgroundColor: statusColor(t.status) + '10' }}>
                                        {STATUS_OPTIONS.find(s => s.value === t.status)?.label || t.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-text-muted">{t.customer?.name || '—'}</td>
                                <td className="px-4 py-3 text-xs font-mono text-primary">{t.order?.orderNumber || '—'}</td>
                                <td className="px-4 py-3">
                                    <span className="text-[10px] font-bold" style={{ color: sla.color }}>{sla.label}</span>
                                </td>
                                <td className="px-4 py-3 text-xs text-text-muted">{formatTimeAgo(t.updatedAt)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {tickets.length === 0 && (
                <div className="text-center py-12 text-text-muted text-sm">No tickets found</div>
            )}
        </div>
    );

    // ─── RENDER: WORKFLOW EDITOR ─────────────────────────────────────
    const [editingWorkflow, setEditingWorkflow] = useState<IncidentWorkflow | null>(null);
    const [wfSaving, setWfSaving] = useState(false);

    const CHANNEL_OPTIONS = [
        { value: 'whatsapp', label: 'WhatsApp', icon: 'chat', color: '#22c55e' },
        { value: 'sms', label: 'SMS', icon: 'sms', color: '#3b82f6' },
        { value: 'email', label: 'Email', icon: 'mail', color: '#f97316' },
        { value: 'call', label: 'Call', icon: 'call', color: '#a855f7' },
    ];

    const handleSaveWorkflow = async () => {
        if (!editingWorkflow) return;
        try {
            setWfSaving(true);
            await ticketsService.updateWorkflow(editingWorkflow.caseType, {
                title: editingWorkflow.title,
                description: editingWorkflow.description,
                channelOrder: editingWorkflow.channelOrder,
                steps: editingWorkflow.steps,
                isActive: editingWorkflow.isActive,
            });
            setMessage({ type: 'success', text: '✅ Workflow saved!' });
            setEditingWorkflow(null);
            fetchWorkflows();
        } catch (err: any) {
            setMessage({ type: 'error', text: '❌ ' + (err?.response?.data?.message || 'Failed to save workflow') });
        } finally {
            setWfSaving(false);
        }
    };

    const addStepToWorkflow = () => {
        if (!editingWorkflow) return;
        const newStep = { channel: 'whatsapp', trigger: 'auto', delayMinutes: 0, content: '' };
        setEditingWorkflow({ ...editingWorkflow, steps: [...(editingWorkflow.steps || []), newStep] });
    };

    const removeStepFromWorkflow = (idx: number) => {
        if (!editingWorkflow) return;
        setEditingWorkflow({ ...editingWorkflow, steps: editingWorkflow.steps.filter((_: any, i: number) => i !== idx) });
    };

    const updateStep = (idx: number, field: string, value: any) => {
        if (!editingWorkflow) return;
        const updated = [...editingWorkflow.steps];
        updated[idx] = { ...updated[idx], [field]: value };
        setEditingWorkflow({ ...editingWorkflow, steps: updated });
    };

    const renderWorkflow = () => (
        <div className="flex flex-col gap-4">
            <p className="text-xs text-text-muted">Configure automated workflow sequences for each incident category. Click a card to edit its steps.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {workflows.map(wf => {
                    const opt = CASE_TYPE_OPTIONS.find(c => c.value === wf.caseType);
                    return (
                        <div
                            key={wf.id}
                            onClick={() => setEditingWorkflow(JSON.parse(JSON.stringify(wf)))}
                            className="bg-card-dark rounded-xl border border-border-dark p-5 flex flex-col gap-3 cursor-pointer hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: opt?.color || '#6b7280' }}>{opt?.icon || 'help'}</span>
                                    <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{wf.title}</span>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${wf.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {wf.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <p className="text-xs text-text-muted">{wf.description || 'No description'}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-text-muted font-bold">Channels:</span>
                                {(wf.channelOrder || []).map((ch: string) => {
                                    const chOpt = CHANNEL_OPTIONS.find(c => c.value === ch);
                                    return (
                                        <span key={ch} className="text-[10px] px-2 py-0.5 rounded border font-bold" style={{ color: chOpt?.color || '#6b7280', borderColor: (chOpt?.color || '#6b7280') + '30', backgroundColor: (chOpt?.color || '#6b7280') + '10' }}>
                                            {chOpt?.label || ch}
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-text-muted font-bold">Steps:</span>
                                <span className="text-xs text-white font-bold">{(wf.steps || []).length} configured</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Workflow Edit Modal */}
            {editingWorkflow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingWorkflow(null)}>
                    <div className="bg-card-dark border border-border-dark rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-6 border-b border-border-dark flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined" style={{ fontSize: 22, color: CASE_TYPE_OPTIONS.find(c => c.value === editingWorkflow.caseType)?.color }}>
                                    {CASE_TYPE_OPTIONS.find(c => c.value === editingWorkflow.caseType)?.icon || 'help'}
                                </span>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Edit Workflow</h3>
                                    <p className="text-xs text-text-muted">{caseLabel(editingWorkflow.caseType)}</p>
                                </div>
                            </div>
                            <button onClick={() => setEditingWorkflow(null)} className="text-text-muted hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Title & Description */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Title</label>
                                    <input
                                        value={editingWorkflow.title}
                                        onChange={e => setEditingWorkflow({ ...editingWorkflow, title: e.target.value })}
                                        className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Description</label>
                                    <input
                                        value={editingWorkflow.description || ''}
                                        onChange={e => setEditingWorkflow({ ...editingWorkflow, description: e.target.value })}
                                        className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                                    />
                                </div>
                            </div>

                            {/* Active Toggle */}
                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editingWorkflow.isActive}
                                        onChange={e => setEditingWorkflow({ ...editingWorkflow, isActive: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-border-dark rounded-full peer peer-checked:bg-primary transition-colors peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                </label>
                                <span className="text-xs text-white font-bold">Workflow Active</span>
                            </div>

                            {/* Channel Order */}
                            <div>
                                <label className="text-[10px] text-text-muted font-bold uppercase block mb-2">Channel Order</label>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {CHANNEL_OPTIONS.map(ch => {
                                        const isSelected = (editingWorkflow.channelOrder || []).includes(ch.value);
                                        return (
                                            <button
                                                key={ch.value}
                                                onClick={() => {
                                                    const current = editingWorkflow.channelOrder || [];
                                                    const updated = isSelected ? current.filter((c: string) => c !== ch.value) : [...current, ch.value];
                                                    setEditingWorkflow({ ...editingWorkflow, channelOrder: updated });
                                                }}
                                                className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg border transition-all ${
                                                    isSelected
                                                        ? 'border-primary/40 bg-primary/10 text-white'
                                                        : 'border-border-dark bg-[#1a2332] text-text-muted hover:border-border-dark/80'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: ch.color }}>{ch.icon}</span>
                                                {ch.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Steps */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] text-text-muted font-bold uppercase">Automation Steps</label>
                                    <button
                                        onClick={addStepToWorkflow}
                                        className="flex items-center gap-1 text-[10px] text-primary font-bold hover:text-primary/80 transition-colors"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                                        Add Step
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {(editingWorkflow.steps || []).map((step: any, idx: number) => {
                                        const chOpt = CHANNEL_OPTIONS.find(c => c.value === step.channel);
                                        return (
                                            <div key={idx} className="bg-[#1a2332] rounded-xl border border-border-dark p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-text-muted">Step {idx + 1}</span>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: chOpt?.color }}>{chOpt?.icon || 'help'}</span>
                                                    </div>
                                                    <button onClick={() => removeStepFromWorkflow(idx)} className="text-red-400 hover:text-red-300">
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="text-[10px] text-text-muted font-bold block mb-1">Channel</label>
                                                        <select
                                                            value={step.channel}
                                                            onChange={e => updateStep(idx, 'channel', e.target.value)}
                                                            className="w-full bg-card-dark border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none"
                                                        >
                                                            {CHANNEL_OPTIONS.map(ch => (
                                                                <option key={ch.value} value={ch.value}>{ch.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-text-muted font-bold block mb-1">Trigger</label>
                                                        <select
                                                            value={step.trigger || 'auto'}
                                                            onChange={e => updateStep(idx, 'trigger', e.target.value)}
                                                            className="w-full bg-card-dark border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none"
                                                        >
                                                            <option value="auto">Auto (Timer)</option>
                                                            <option value="manual">Manual</option>
                                                            <option value="on_no_response">On No Response</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-text-muted font-bold block mb-1">Delay (min)</label>
                                                        <input
                                                            type="number"
                                                            value={step.delayMinutes || 0}
                                                            onChange={e => updateStep(idx, 'delayMinutes', parseInt(e.target.value) || 0)}
                                                            className="w-full bg-card-dark border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none"
                                                            min={0}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="mt-3">
                                                    <label className="text-[10px] text-text-muted font-bold block mb-1">Content / Template</label>
                                                    <textarea
                                                        value={step.content || ''}
                                                        onChange={e => updateStep(idx, 'content', e.target.value)}
                                                        rows={2}
                                                        className="w-full bg-card-dark border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none resize-none"
                                                        placeholder={`Message template for ${chOpt?.label || 'channel'}...`}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {(editingWorkflow.steps || []).length === 0 && (
                                        <div className="text-center py-6 text-text-muted text-xs italic border border-dashed border-border-dark rounded-xl">
                                            No steps configured. Click "Add Step" to create an automation sequence.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 pt-0 flex justify-end gap-3">
                            <button onClick={() => setEditingWorkflow(null)} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-white transition-colors">Cancel</button>
                            <button
                                onClick={handleSaveWorkflow}
                                disabled={wfSaving}
                                className="px-6 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                            >
                                {wfSaving ? 'Saving...' : 'Save Workflow'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ─── DETAIL PANEL STATE ──────────────────────────────────────────
    const [detailTab, setDetailTab] = useState<'timeline' | 'callLogs'>('timeline');
    const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
    const [composeChannel, setComposeChannel] = useState<'email' | 'whatsapp' | 'sms' | 'call' | null>(null);
    const [composeBody, setComposeBody] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeSending, setComposeSending] = useState(false);
    const [showCannedPicker, setShowCannedPicker] = useState(false);

    // ─── CANNED RESPONSE TEMPLATES ──────────────────────────────────
    const CANNED_RESPONSES: Record<string, { label: string; subject?: string; body: string }[]> = {
        sms: [
            { label: '📦 Delivery attempt failed', body: 'Hi {{name}}, your order #{{order}} delivery was attempted but unsuccessful. Please confirm your availability or updated address. Reply to this message or call us. — JustOneTee' },
            { label: '📍 Address confirmation', body: 'Hi {{name}}, we need to verify the delivery address for order #{{order}}. Please reply with your full address including apartment/door number. — JustOneTee' },
            { label: '🔄 Reshipment notification', body: 'Hi {{name}}, a reshipment for your order #{{order}} has been scheduled. You will receive a new tracking number shortly. — JustOneTee' },
            { label: '📞 Call follow-up', body: 'Hi {{name}}, we tried calling you about order #{{order}}. Please call us back or reply to this message so we can resolve your delivery issue. — JustOneTee' },
            { label: '⏰ Last chance before return', body: 'Hi {{name}}, your order #{{order}} will be returned to warehouse if we cannot reach you within 24h. Please reply ASAP with your delivery preference. — JustOneTee' },
        ],
        whatsapp: [
            { label: '👋 Initial contact — delivery issue', body: 'Hello {{name}}! 👋\n\nWe\'re reaching out about your order #{{order}}.\n\nOur courier reported an issue with your delivery. Could you please confirm:\n1. Your full delivery address\n2. A time when someone will be available to receive the package\n\nWe\'ll get this sorted within 24 hours! 🙏\n\n— JustOneTee Customer Service' },
            { label: '📸 Request photos (damaged)', body: 'Hi {{name}},\n\nWe\'re sorry to hear about the issue with your order #{{order}}.\n\nTo help resolve this quickly, could you please send us:\n📸 Photos of the damaged packaging\n📸 Photos of the product condition\n\nWe\'ll respond within 2 hours with a solution. 🙏\n\nThank you!\n— JustOneTee' },
            { label: '🔄 Reshipment confirmed', body: 'Great news, {{name}}! 🎉\n\nYour replacement order for #{{order}} has been confirmed. You\'ll receive a new tracking number within 24-48 hours.\n\nThank you for your patience! 💚\n— JustOneTee' },
            { label: '📍 Address update request', body: 'Hi {{name}},\n\nThe courier was unable to deliver your order #{{order}} due to an address issue.\n\nCould you please confirm your complete delivery address including:\n🏠 Street + house/apt number\n📮 Postal code\n🏙️ City\n📱 Phone number for courier\n\nWe\'ll reschedule delivery immediately!\n— JustOneTee' },
            { label: '❌ Refused delivery follow-up', body: 'Hi {{name}},\n\nWe noticed that the delivery for order #{{order}} was refused.\n\nCould you let us know what happened? We want to make it right:\n• 🔄 Reschedule delivery\n• 💰 Process a refund\n• 📦 Reship to a different address\n\nPlease reply with your preference.\n— JustOneTee' },
        ],
        call: [
            { label: '📞 Standard delivery issue script', body: 'Hello, am I speaking with {{name}}?\n\nThis is [Agent Name] from JustOneTee. We are calling about your order number {{order}}.\n\nWe noticed there was an issue with your delivery. [Describe issue]\n\nCan you confirm your delivery address and a preferred time?\n\n[If confirmed] Great! We\'ll reschedule the delivery.\n[If no answer] Press 1 to confirm delivery, Press 2 to reschedule.' },
            { label: '📍 Address verification script', body: 'Hello {{name}}, this is JustOneTee customer service.\n\nWe\'re calling about your order #{{order}}. The courier reported that the delivery address may be incomplete or incorrect.\n\nCould you please confirm your full address including:\n- Street name and house number\n- Apartment or door number\n- Postal code\n\n[Record the confirmed address]\n\nThank you! We\'ll update this and reschedule your delivery.' },
            { label: '📦 Damaged package script', body: 'Hello {{name}}, this is JustOneTee support.\n\nWe received a report that your order #{{order}} may have been damaged during shipping.\n\nCan you describe the condition of:\n1. The outer packaging\n2. The product inside\n\n[If damaged] We\'re very sorry. We can offer:\n- A full replacement shipped today\n- A refund to your original payment method\n\nWhich would you prefer?' },
            { label: '🔄 Reshipment confirmation script', body: 'Hello {{name}}, calling from JustOneTee.\n\nGood news about your order #{{order}} — we\'ve arranged a reshipment.\n\nI just need to confirm the delivery address:\n[Read current address]\n\nIs this still correct? Any additional instructions for the courier?\n\n[Confirm] Perfect, you\'ll receive new tracking info within 24-48 hours.' },
        ],
        email: [
            { label: '📧 Delivery issue notification', subject: 'Order #{{order}} — Delivery Issue', body: 'Dear {{name}},\n\nWe are writing to inform you about a delivery issue with your order #{{order}}.\n\nOur courier has reported the following: [describe issue]\n\nTo resolve this, we kindly ask you to:\n1. Confirm your current delivery address\n2. Let us know a preferred delivery time\n\nPlease reply to this email or contact us directly.\n\nBest regards,\nJustOneTee Customer Service\ncod@justonetee.org' },
            { label: '📸 Damage claim — photo request', subject: 'Order #{{order}} — We Need Your Help', body: 'Dear {{name}},\n\nWe\'re sorry to hear about the issue with your order #{{order}}.\n\nTo process your claim, we need the following:\n- Photos of the outer packaging\n- Photos of the damaged product\n- Brief description of the damage\n\nOnce received, we\'ll process your claim within 24 hours and offer either a replacement or refund.\n\nWe sincerely apologize for the inconvenience.\n\nBest regards,\nJustOneTee Customer Service' },
            { label: '🔄 Reshipment confirmation', subject: 'Order #{{order}} — Reshipment Confirmed', body: 'Dear {{name}},\n\nWe\'re happy to confirm that a reshipment for your order #{{order}} has been arranged.\n\nYou will receive a new tracking number via email within 24-48 hours.\n\nIf you have any questions, don\'t hesitate to reach out.\n\nThank you for your patience!\n\nBest regards,\nJustOneTee Customer Service' },
            { label: '⏰ SLA warning — action required', subject: 'URGENT: Order #{{order}} — Action Required', body: 'Dear {{name}},\n\nWe\'ve been trying to reach you regarding your order #{{order}}.\n\nUnfortunately, if we don\'t hear back from you within the next 24 hours, the package will be returned to our warehouse.\n\nPlease reply to this email or call us at your earliest convenience to arrange redelivery.\n\nBest regards,\nJustOneTee Customer Service\ncod@justonetee.org' },
            { label: '✅ Issue resolved', subject: 'Order #{{order}} — Issue Resolved', body: 'Dear {{name}},\n\nWe\'re pleased to inform you that the delivery issue with your order #{{order}} has been resolved.\n\n[Describe resolution]\n\nIf you have any further questions, please don\'t hesitate to reach out.\n\nThank you for choosing JustOneTee!\n\nBest regards,\nJustOneTee Customer Service' },
        ],
    };

    const applyCannedTemplate = (template: { label: string; subject?: string; body: string }) => {
        const t = selectedTicket;
        let body = template.body;
        let subject = template.subject || '';
        // Replace tokens with ticket data
        const replacements: Record<string, string> = {
            '{{name}}': t?.customer?.name || 'Customer',
            '{{order}}': t?.order?.orderNumber || '—',
            '{{phone}}': t?.customer?.phone || '—',
        };
        Object.entries(replacements).forEach(([token, val]) => {
            body = body.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), val);
            subject = subject.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), val);
        });
        setComposeBody(body);
        if (subject) setComposeSubject(subject);
        setShowCannedPicker(false);
    };

    const TIMELINE_CHANNEL_MAP: Record<string, { icon: string; color: string; bg: string }> = {
        whatsapp: { icon: 'chat', color: '#22c55e', bg: 'rgba(34,197,94,.12)' },
        sms:      { icon: 'sms', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
        email:    { icon: 'mail', color: '#f97316', bg: 'rgba(249,115,22,.12)' },
        call:     { icon: 'call', color: '#a855f7', bg: 'rgba(168,85,247,.12)' },
        system:   { icon: 'info', color: '#6b7280', bg: 'rgba(107,114,128,.12)' },
        '17track': { icon: 'local_shipping', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
    };

    const getTimelineStyle = (ev: any) => {
        if (ev.eventType === 'status_change') return { icon: 'swap_horiz', color: '#3b82f6', bg: 'rgba(59,130,246,.12)' };
        if (ev.eventType === 'escalation') return { icon: 'warning', color: '#ef4444', bg: 'rgba(239,68,68,.12)' };
        if (ev.eventType === 'call_center_update') return { icon: 'call', color: '#a855f7', bg: 'rgba(168,85,247,.12)' };
        const ch = ev.channel || 'system';
        return TIMELINE_CHANNEL_MAP[ch] || TIMELINE_CHANNEL_MAP.system;
    };

    const handleComposeSend = async () => {
        if (!selectedTicket || !composeChannel || !composeBody.trim()) return;
        try {
            setComposeSending(true);
            await ticketsService.addTimelineEvent(selectedTicket.id, {
                eventType: 'outbound',
                channel: composeChannel,
                content: composeChannel === 'email'
                    ? `Email sent — "${composeSubject}" — "${composeBody.substring(0, 120)}..."`
                    : composeChannel === 'call'
                    ? `Call script prepared — "${composeBody.substring(0, 120)}..."`
                    : `${composeChannel.toUpperCase()} sent — "${composeBody.substring(0, 120)}..."`,
            });
            setMessage({ type: 'success', text: `✅ ${composeChannel.toUpperCase()} logged to timeline!` });
            setComposeBody('');
            setComposeSubject('');
            setComposeChannel(null);
            setShowCannedPicker(false);
            openDetail(selectedTicket.id);
        } catch (err: any) {
            setMessage({ type: 'error', text: '❌ ' + (err?.response?.data?.message || 'Failed to send') });
        } finally {
            setComposeSending(false);
        }
    };

    // ─── RENDER: TICKET DETAIL PANEL ─────────────────────────────────
    const renderDetail = () => {
        if (!selectedTicket) return null;
        const t = selectedTicket;
        const sla = slaRemaining(t.slaDeadlineAt);
        const callLogs: any[] = t.order?.callLogs || [];

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setSelectedTicket(null); setComposeChannel(null); }}>
                <div className="bg-card-dark border border-border-dark rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-border-dark shrink-0">
                        <div className="flex items-center gap-4">
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: caseColor(t.caseType) }}>{caseIcon(t.caseType)}</span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-text-muted">{t.ticketNumber}</span>
                                    <span className="text-sm font-black text-white">— {t.customer?.name || 'Unknown'}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: statusColor(t.status), backgroundColor: statusColor(t.status) + '10' }}>
                                        {STATUS_OPTIONS.find(s => s.value === t.status)?.label || t.status}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: priorityColor(t.priority), backgroundColor: priorityColor(t.priority) + '10' }}>
                                        {t.priority.toUpperCase()}
                                    </span>
                                    {t.source === '17track_auto' && (
                                        <span className="text-[8px] font-bold bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20">AUTO</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {t.status !== 'resolved' && t.status !== 'closed' && (
                                <button onClick={() => handleResolve(t.id, 'resolved')} className="flex items-center gap-1.5 px-4 py-2 bg-green-500/10 text-green-400 text-xs font-bold rounded-xl border border-green-500/20 hover:bg-green-500/20 transition-all">
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span> Resolve
                                </button>
                            )}
                            <button onClick={() => { setSelectedTicket(null); setComposeChannel(null); }} className="text-text-muted hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Body: 2-column layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 overflow-hidden">
                        {/* Left: Info Panel */}
                        <div className="lg:col-span-1 p-5 border-r border-border-dark/50 overflow-y-auto custom-scrollbar space-y-4">
                            {/* Title */}
                            <p className="text-sm font-black text-white leading-tight">{t.title}</p>
                            {t.description && <p className="text-xs text-text-muted leading-relaxed">{t.description}</p>}

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Customer', value: t.customer?.name || '—', icon: 'person' },
                                    { label: 'Order', value: t.order?.orderNumber ? `#${t.order.orderNumber}` : '—', icon: 'receipt_long' },
                                    { label: 'Phone', value: t.customer?.phone || '—', icon: 'call' },
                                    { label: 'Amount', value: t.order?.totalAmount ? `€${t.order.totalAmount}` : '—', icon: 'euro' },
                                    { label: 'Tracking', value: t.trackingSubstatus || '—', icon: 'local_shipping' },
                                    { label: 'Due', value: t.slaDeadlineAt ? new Date(t.slaDeadlineAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '—', icon: 'schedule' },
                                ].map(info => (
                                    <div key={info.label} className="bg-[#1a2332] rounded-lg p-3 border border-border-dark">
                                        <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider">{info.label}</p>
                                        <p className="text-xs text-white font-bold mt-0.5 truncate">{info.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* PIC */}
                            <div className="bg-[#1a2332] rounded-xl p-4 border border-border-dark">
                                <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-2">Person in Charge</p>
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-black">
                                        {(t.picName || t.pic?.fullName || 'U').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
                                    </div>
                                    <span className="text-xs text-white font-bold">{t.picName || t.pic?.fullName || 'Unassigned'}</span>
                                </div>
                            </div>

                            {/* SLA */}
                            <div className="bg-[#1a2332] rounded-xl p-4 border border-border-dark">
                                <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-1">SLA Countdown</p>
                                <p className="text-xl font-black" style={{ color: sla.color }}>{sla.label}</p>
                            </div>

                            {/* Actions */}
                            {t.status !== 'resolved' && t.status !== 'closed' && (
                                <div className="space-y-2 pt-3 border-t border-border-dark">
                                    <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider">Resolve With</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {RESOLUTION_OPTIONS.map(r => (
                                            <button key={r.value} onClick={() => handleResolve(t.id, r.value)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-[#0f1923] text-white text-[10px] font-bold rounded-lg border border-border-dark hover:border-primary/30 hover:bg-primary/5 transition-all">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{r.icon}</span>
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                    {t.status === 'open' && (
                                        <button onClick={() => handleStatusChange(t.id, 'in_progress')} className="w-full px-3 py-2 bg-orange-500/10 text-orange-400 text-[10px] font-bold rounded-lg border border-orange-500/20 hover:bg-orange-500/20 transition-all">
                                            Start Working
                                        </button>
                                    )}
                                </div>
                            )}

                            <button onClick={() => handleDelete(t.id)} className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-bold">
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span> Delete Ticket
                            </button>
                        </div>

                        {/* Right: Tabbed Content */}
                        <div className="lg:col-span-2 flex flex-col overflow-hidden">
                            {/* Tab Navigation */}
                            <div className="flex items-center border-b border-border-dark px-5 shrink-0">
                                {[
                                    { key: 'timeline', label: 'Timeline', icon: 'history' },
                                    { key: 'callLogs', label: 'Call Logs', icon: 'call', count: callLogs.length },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setDetailTab(tab.key as any)}
                                        className={`px-4 py-3 text-xs font-bold transition-all relative flex items-center gap-2 ${detailTab === tab.key ? 'text-primary' : 'text-text-muted hover:text-white'}`}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{tab.icon}</span>
                                        {tab.label}
                                        {tab.count !== undefined && tab.count > 0 && (
                                            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">{tab.count}</span>
                                        )}
                                        {detailTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                                {/* Timeline */}
                                {detailTab === 'timeline' && (
                                    <div className="space-y-1">
                                        {(t.timeline || []).map(ev => {
                                            const style = getTimelineStyle(ev);
                                            const time = new Date(ev.createdAt);
                                            return (
                                                <div key={ev.id} className="flex gap-3 py-2">
                                                    <div className="flex flex-col items-center">
                                                        <div className="size-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: style.bg }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: style.color }}>{style.icon}</span>
                                                        </div>
                                                        <div className="w-px flex-1 bg-border-dark/30 mt-1" />
                                                    </div>
                                                    <div className="pb-3 flex-1 min-w-0">
                                                        <p className="text-sm text-white font-bold leading-snug">{ev.content || '—'}</p>
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className="text-[10px] font-bold" style={{ color: style.color }}>{ev.actorName || ev.channel || 'system'}</span>
                                                            <span className="text-[10px] text-text-muted">· {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {ev.externalRef && (
                                                                <span className="text-[9px] font-mono bg-[#1a2332] text-text-muted px-1.5 py-0.5 rounded border border-border-dark">{ev.externalRef}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {(!t.timeline || t.timeline.length === 0) && (
                                            <p className="text-xs text-text-muted italic py-8 text-center">No timeline events yet</p>
                                        )}
                                    </div>
                                )}

                                {/* Call Logs */}
                                {detailTab === 'callLogs' && (
                                    <div className="space-y-3">
                                        {callLogs.length === 0 && (
                                            <p className="text-xs text-text-muted italic py-8 text-center">No call logs available</p>
                                        )}
                                        {callLogs.map((log: any) => {
                                            const isExpanded = expandedCallId === log.id;
                                            const statusColors: Record<string, string> = {
                                                'completed': '#22c55e', 'no-answer': '#ef4444', 'busy': '#f97316',
                                                'failed': '#ef4444', 'canceled': '#6b7280', 'in-progress': '#3b82f6',
                                            };
                                            const statusLabel = log.callStatus?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Unknown';
                                            const confidence = log.speechConfidence ? Math.round(parseFloat(log.speechConfidence) * 100) : null;
                                            const duration = log.callDuration ? `${Math.floor(log.callDuration / 60)}m ${log.callDuration % 60}s` : '—';
                                            const callTime = new Date(log.createdAt);

                                            return (
                                                <div key={log.id} className="bg-[#1a2332] rounded-xl border border-border-dark overflow-hidden">
                                                    {/* Call Header */}
                                                    <button
                                                        onClick={() => setExpandedCallId(isExpanded ? null : log.id)}
                                                        className="w-full flex items-center justify-between p-4 hover:bg-[#1e2a3a] transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="size-10 rounded-full flex items-center justify-center" style={{ backgroundColor: (statusColors[log.callStatus] || '#6b7280') + '15' }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: statusColors[log.callStatus] || '#6b7280' }}>
                                                                    {log.callStatus === 'completed' ? 'call' : log.callStatus === 'no-answer' ? 'call_missed' : 'call_end'}
                                                                </span>
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-sm text-white font-bold">{statusLabel}</p>
                                                                <p className="text-[10px] text-text-muted font-mono">{log.callSid?.substring(0, 8)}...{log.callSid?.slice(-4)}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="text-right">
                                                                <p className="text-xs text-white font-bold">{duration}</p>
                                                                <p className="text-[10px] text-text-muted">{callTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {callTime.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</p>
                                                            </div>
                                                            {log.dtmfInput && (
                                                                <span className="text-[9px] font-bold bg-green-500/10 text-green-400 px-2 py-1 rounded border border-green-500/20">DTMF {log.dtmfInput}</span>
                                                            )}
                                                            <span className="material-symbols-outlined text-text-muted" style={{ fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
                                                        </div>
                                                    </button>

                                                    {/* Expanded Details */}
                                                    {isExpanded && (
                                                        <div className="p-4 pt-0 border-t border-border-dark space-y-4">
                                                            {/* Transcript */}
                                                            {log.speechResult && (
                                                                <div>
                                                                    <div className="flex items-center gap-3 mb-3">
                                                                        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>transcribe</span>
                                                                        <span className="text-[10px] font-black uppercase tracking-wider text-white">Call Transcript</span>
                                                                        {log.scriptLanguage && (
                                                                            <span className="text-[9px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{log.scriptLanguage.toUpperCase()}</span>
                                                                        )}
                                                                        {confidence !== null && (
                                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${confidence >= 80 ? 'bg-green-500/10 text-green-400' : confidence >= 50 ? 'bg-orange-500/10 text-orange-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                                AI {confidence}% Confidence
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="bg-card-dark rounded-lg border border-border-dark p-4">
                                                                        <p className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap">{log.speechResult}</p>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Intent & DTMF */}
                                                            <div className="grid grid-cols-3 gap-3">
                                                                <div className="bg-card-dark rounded-lg border border-border-dark p-3">
                                                                    <p className="text-[9px] text-text-muted font-bold uppercase">Script Type</p>
                                                                    <p className="text-xs text-white font-bold">{log.scriptType || '—'}</p>
                                                                </div>
                                                                <div className="bg-card-dark rounded-lg border border-border-dark p-3">
                                                                    <p className="text-[9px] text-text-muted font-bold uppercase">Intent</p>
                                                                    <p className="text-xs text-white font-bold">{log.intentDetected || '—'}</p>
                                                                </div>
                                                                <div className="bg-card-dark rounded-lg border border-border-dark p-3">
                                                                    <p className="text-[9px] text-text-muted font-bold uppercase">DTMF Input</p>
                                                                    <p className="text-xs text-white font-bold">{log.dtmfInput || 'None'}</p>
                                                                </div>
                                                            </div>

                                                            {/* No response warning */}
                                                            {!log.dtmfInput && !log.speechResult && log.callStatus !== 'completed' && (
                                                                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center">
                                                                    <p className="text-xs text-red-400 font-bold">No DTMF detected — customer did not respond</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Reply Compose Bar */}
                            <div className="border-t border-border-dark p-4 shrink-0">
                                {!composeChannel ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-text-muted font-bold uppercase mr-2">Reply via:</span>
                                        {[
                                            { key: 'email', label: 'Email', icon: 'mail', color: '#f97316' },
                                            { key: 'whatsapp', label: 'WhatsApp', icon: 'chat', color: '#22c55e' },
                                            { key: 'sms', label: 'SMS', icon: 'sms', color: '#3b82f6' },
                                            { key: 'call', label: 'Call Script', icon: 'call', color: '#a855f7' },
                                        ].map(ch => (
                                            <button
                                                key={ch.key}
                                                onClick={() => setComposeChannel(ch.key as any)}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-dark bg-[#1a2332] text-[10px] font-bold text-white hover:border-primary/30 hover:bg-primary/5 transition-all"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: ch.color }}>{ch.icon}</span>
                                                {ch.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: composeChannel === 'email' ? '#f97316' : composeChannel === 'whatsapp' ? '#22c55e' : composeChannel === 'sms' ? '#3b82f6' : '#a855f7' }}>
                                                    {composeChannel === 'email' ? 'mail' : composeChannel === 'whatsapp' ? 'chat' : composeChannel === 'sms' ? 'sms' : 'call'}
                                                </span>
                                                <span className="text-xs font-bold text-white">{composeChannel === 'call' ? 'Call Script' : composeChannel.charAt(0).toUpperCase() + composeChannel.slice(1)}</span>
                                                <span className="text-[10px] text-text-muted">→ {t.customer?.phone || t.customer?.name || 'Customer'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setShowCannedPicker(!showCannedPicker)}
                                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${showCannedPicker ? 'bg-primary/10 text-primary border-primary/30' : 'bg-[#1a2332] text-text-muted border-border-dark hover:text-white hover:border-primary/20'}`}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
                                                    Templates
                                                </button>
                                                <button onClick={() => { setComposeChannel(null); setComposeBody(''); setComposeSubject(''); setShowCannedPicker(false); }} className="text-text-muted hover:text-white">
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Canned Templates Picker */}
                                        {showCannedPicker && composeChannel && (
                                            <div className="bg-[#0f1923] rounded-xl border border-border-dark max-h-48 overflow-y-auto custom-scrollbar">
                                                {(CANNED_RESPONSES[composeChannel] || []).map((tpl, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => applyCannedTemplate(tpl)}
                                                        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-primary/5 transition-colors border-b border-border-dark/30 last:border-0"
                                                    >
                                                        <span className="text-[11px] font-bold text-white leading-tight">{tpl.label}</span>
                                                        <span className="text-[10px] text-text-muted leading-tight line-clamp-1 flex-1 ml-auto">{tpl.body.substring(0, 60)}...</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {composeChannel === 'email' && (
                                            <input
                                                value={composeSubject}
                                                onChange={e => setComposeSubject(e.target.value)}
                                                placeholder="Subject line..."
                                                className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-1.5 text-xs text-white placeholder-text-muted/50 focus:border-primary outline-none"
                                            />
                                        )}
                                        <div className="flex gap-2">
                                            <textarea
                                                value={composeBody}
                                                onChange={e => setComposeBody(e.target.value)}
                                                rows={composeBody.includes('\n') ? 5 : 2}
                                                placeholder={composeChannel === 'call' ? 'Write call script here...' : `Type ${composeChannel} message...`}
                                                className="flex-1 bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-xs text-white placeholder-text-muted/50 focus:border-primary outline-none resize-none"
                                            />
                                            <button
                                                onClick={handleComposeSend}
                                                disabled={composeSending || !composeBody.trim()}
                                                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 self-end"
                                            >
                                                {composeSending ? '...' : composeChannel === 'call' ? 'Log Call' : 'Send'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ─── RENDER: NEW TICKET MODAL ─────────────────────────────────────
    const renderNewModal = () => {
        if (!showNewModal) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNewModal(false)}>
                <div className="bg-card-dark border border-border-dark rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="p-6 border-b border-border-dark flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-widest text-white">New Incident Ticket</h3>
                        <button onClick={() => setShowNewModal(false)} className="text-text-muted hover:text-white">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Title *</label>
                            <input
                                value={newTicket.title}
                                onChange={e => setNewTicket({ ...newTicket, title: e.target.value })}
                                className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none"
                                placeholder="Brief description of the incident"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Description</label>
                            <textarea
                                value={newTicket.description}
                                onChange={e => setNewTicket({ ...newTicket, description: e.target.value })}
                                rows={3}
                                className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none resize-none"
                                placeholder="Detailed description..."
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Category</label>
                                <select
                                    value={newTicket.caseType}
                                    onChange={e => setNewTicket({ ...newTicket, caseType: e.target.value })}
                                    className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                                >
                                    {CASE_TYPE_OPTIONS.map(ct => (
                                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Priority</label>
                                <select
                                    value={newTicket.priority}
                                    onChange={e => setNewTicket({ ...newTicket, priority: e.target.value })}
                                    className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none"
                                >
                                    {PRIORITY_OPTIONS.map(p => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Order ID (optional)</label>
                            <input
                                value={newTicket.orderId}
                                onChange={e => setNewTicket({ ...newTicket, orderId: e.target.value })}
                                className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-text-muted/50 focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none font-mono"
                                placeholder="UUID of the order"
                            />
                        </div>
                    </div>
                    <div className="p-6 pt-0 flex justify-end gap-3">
                        <button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-white transition-colors">Cancel</button>
                        <button
                            onClick={handleCreate}
                            disabled={creating || !newTicket.title}
                            className="px-6 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                        >
                            {creating ? 'Creating...' : 'Create Ticket'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ─── MAIN RENDER ─────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-white text-3xl font-black tracking-tight">Incidents</h1>
                    <span className="bg-card-dark text-text-muted text-xs px-2.5 py-1 rounded-full font-bold border border-border-dark">{tickets.length} Ticket{tickets.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    New Ticket
                </button>
            </div>

            {/* Message Banner */}
            {message && (
                <div className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{message.type === 'success' ? 'check_circle' : 'error'}</span>
                    {message.text}
                    <button onClick={() => setMessage(null)} className="ml-auto"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></button>
                </div>
            )}

            {/* KPI Bar */}
            {renderKPIs()}

            {/* View Tabs & Filters */}
            <div className="flex items-center justify-between">
                <div className="flex items-center border-b border-border-dark">
                    {[
                        { key: 'board', label: 'Board', icon: 'view_kanban' },
                        { key: 'list', label: 'List', icon: 'list' },
                        { key: 'workflow', label: 'Workflows', icon: 'account_tree' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveView(tab.key as any)}
                            className={`px-4 py-3 text-sm font-bold transition-all relative flex items-center gap-2 ${activeView === tab.key ? 'text-primary' : 'text-text-muted hover:text-white'}`}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{tab.icon}</span>
                            {tab.label}
                            {activeView === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                        </button>
                    ))}
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-card-dark rounded-lg border border-border-dark px-3 py-1.5">
                        <span className="material-symbols-outlined text-text-muted" style={{ fontSize: 16 }}>search</span>
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-transparent text-xs text-white placeholder-text-muted/50 outline-none w-32"
                            placeholder="Search..."
                        />
                    </div>
                    <select
                        value={filterPriority}
                        onChange={e => setFilterPriority(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-1.5 text-xs text-white focus:border-primary outline-none"
                    >
                        <option value="">All Priorities</option>
                        {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <select
                        value={filterCaseType}
                        onChange={e => setFilterCaseType(e.target.value)}
                        className="bg-card-dark border border-border-dark rounded-lg px-3 py-1.5 text-xs text-white focus:border-primary outline-none"
                    >
                        <option value="">All Categories</option>
                        {CASE_TYPE_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Loading */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full size-8 border-2 border-primary border-t-transparent" />
                </div>
            ) : (
                <>
                    {activeView === 'board' && renderBoard()}
                    {activeView === 'list' && renderList()}
                    {activeView === 'workflow' && renderWorkflow()}
                </>
            )}

            {/* Modals */}
            {selectedTicket && renderDetail()}
            {renderNewModal()}
        </div>
    );
};

export default IncidentsPage;
