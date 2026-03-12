import React, { useState, useEffect, useRef } from 'react';
import communicationService, {
    CommunicationTemplate,
    CommunicationSequence,
    SequenceStep,
} from '../src/services/communication.service';
import { productsService, Product } from '../src/services/products.service';
import CallRecordsTab from '../components/CallRecordsTab';

const CHANNEL_OPTIONS = [
    { value: 'sms', label: 'SMS', icon: 'sms', color: '#5b8def' },
    { value: 'whatsapp', label: 'WhatsApp', icon: 'chat', color: '#25d366' },
    { value: 'wa_personal', label: 'WA Personal', icon: 'forum', color: '#128c7e' },
    { value: 'call', label: 'Call', icon: 'call', color: '#f5a623' },
    { value: 'email', label: 'Email', icon: 'mail', color: '#a78bfa' },
];

const CATEGORY_OPTIONS = [
    { value: 'confirmation', label: 'Confirmation', icon: 'verified', color: '#5b8def' },
    { value: 'out_of_stock', label: 'Out of Stock', icon: 'inventory_2', color: '#f5a623' },
    { value: 'incident', label: 'Incident', icon: 'warning', color: '#f05252' },
    { value: 'reappointment', label: 'Reappointment', icon: 'event_repeat', color: '#22d4e6' },
];

const VARIABLES = ['{Name}', '{OrderNumber}', '{Phone}', '{TrackingURL}', '{Amount}', '{Product}', '{StoreName}'];

const CONFIRM_STATUSES = ['pending', 'confirmed', 'cancelled', 'no_answer'];
const ORDER_STATUSES = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'cancelled'];
const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

const CommunicationPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'templates' | 'sequences' | 'call_records'>('templates');

    // ─── Templates State
    const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
    const [tplSearch, setTplSearch] = useState('');
    const [tplChannelFilter, setTplChannelFilter] = useState('');
    const [tplLangFilter, setTplLangFilter] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<CommunicationTemplate | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<Partial<CommunicationTemplate> | null>(null);
    const [isNewTemplate, setIsNewTemplate] = useState(false);
    const [tplLoading, setTplLoading] = useState(false);
    const [showToast, setShowToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // ─── Sequences State
    const [sequences, setSequences] = useState<CommunicationSequence[]>([]);
    const [selectedSequence, setSelectedSequence] = useState<CommunicationSequence | null>(null);
    const [seqLoading, setSeqLoading] = useState(false);
    const [showNewSeqModal, setShowNewSeqModal] = useState(false);
    const [newSeq, setNewSeq] = useState<Partial<CommunicationSequence>>({ name: '', category: 'confirmation', triggerEvent: 'order_created' });
    const [showAddStepModal, setShowAddStepModal] = useState(false);
    const [newStep, setNewStep] = useState<Partial<SequenceStep>>({ channel: 'sms', label: '', delayMinutes: 0, trigger: 'auto' });
    const [newStepTemplateId, setNewStepTemplateId] = useState('');
    const [newStepScheduleHour, setNewStepScheduleHour] = useState('');
    const [newStepBranches, setNewStepBranches] = useState<Record<string, string>>({});
    const [channelTemplates, setChannelTemplates] = useState<CommunicationTemplate[]>([]);

    // Product SKUs for condition editor
    const [products, setProducts] = useState<Product[]>([]);
    const [skuSearch, setSkuSearch] = useState('');

    // Condition editor
    const [showConditionEditor, setShowConditionEditor] = useState(false);
    const [editingConditions, setEditingConditions] = useState<any>({});

    const contentRef = useRef<HTMLTextAreaElement>(null);

    // ─── Fetch
    useEffect(() => {
        if (activeTab === 'templates') fetchTemplates();
        else if (activeTab === 'sequences') fetchSequences();
    }, [activeTab]);

    useEffect(() => {
        productsService.getAll().then((data: any) => setProducts(Array.isArray(data) ? data : data?.data || []));
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => fetchTemplates(), 300);
        return () => clearTimeout(timer);
    }, [tplSearch, tplChannelFilter, tplLangFilter]);

    const toast = (type: 'success' | 'error', msg: string) => {
        setShowToast({ type, msg });
        setTimeout(() => setShowToast(null), 3000);
    };

    const fetchTemplates = async () => {
        setTplLoading(true);
        try {
            const data = await communicationService.listTemplates({
                channel: tplChannelFilter || undefined,
                language: tplLangFilter || undefined,
                search: tplSearch || undefined,
            });
            setTemplates(data);
        } catch (err) { console.error(err); }
        finally { setTplLoading(false); }
    };

    const fetchTemplatesByChannel = async (ch: string) => {
        try {
            const data = await communicationService.listTemplates({ channel: ch || undefined });
            setChannelTemplates(data);
        } catch { setChannelTemplates([]); }
    };

    const fetchSequences = async () => {
        setSeqLoading(true);
        try {
            const data = await communicationService.listSequences();
            setSequences(data);
        } catch (err) { console.error(err); }
        finally { setSeqLoading(false); }
    };

    const fetchSequenceDetail = async (id: string) => {
        try {
            const data = await communicationService.getSequence(id);
            setSelectedSequence(data);
        } catch (err) { console.error(err); }
    };

    // ─── Template Actions
    const handleSelectTemplate = (t: CommunicationTemplate) => {
        setSelectedTemplate(t);
        setEditingTemplate({ ...t });
        setIsNewTemplate(false);
    };

    const handleNewTemplate = () => {
        setSelectedTemplate(null);
        setEditingTemplate({ templateName: '', templateType: 'sms', channel: 'sms', bodyTemplate: '', language: 'en', shortDescription: '' });
        setIsNewTemplate(true);
    };

    const handleSaveTemplate = async () => {
        if (!editingTemplate) return;
        try {
            if (isNewTemplate) {
                await communicationService.createTemplate(editingTemplate);
                toast('success', 'Template created');
            } else if (selectedTemplate) {
                await communicationService.updateTemplate(selectedTemplate.id, editingTemplate);
                toast('success', 'Template updated');
            }
            fetchTemplates();
            setEditingTemplate(null);
            setSelectedTemplate(null);
            setIsNewTemplate(false);
        } catch (err) { toast('error', 'Failed to save template'); }
    };

    const handleDeleteTemplate = async () => {
        if (!selectedTemplate) return;
        if (!window.confirm('Delete this template?')) return;
        try {
            await communicationService.deleteTemplate(selectedTemplate.id);
            toast('success', 'Template deleted');
            fetchTemplates();
            setEditingTemplate(null);
            setSelectedTemplate(null);
        } catch (err) { toast('error', 'Failed to delete'); }
    };

    const insertVariable = (v: string) => {
        if (!contentRef.current || !editingTemplate) return;
        const ta = contentRef.current;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = editingTemplate.bodyTemplate || '';
        const newText = text.substring(0, start) + v + text.substring(end);
        setEditingTemplate({ ...editingTemplate, bodyTemplate: newText });
        setTimeout(() => { ta.focus(); ta.setSelectionRange(start + v.length, start + v.length); }, 0);
    };

    // ─── Sequence Actions
    const handleCreateSequence = async () => {
        try {
            const created = await communicationService.createSequence(newSeq);
            toast('success', 'Sequence created');
            setShowNewSeqModal(false);
            setNewSeq({ name: '', category: 'confirmation', triggerEvent: 'order_created' });
            fetchSequences();
            fetchSequenceDetail(created.id);
        } catch (err) { toast('error', 'Failed to create sequence'); }
    };

    const handleToggleSequenceActive = async (seq: CommunicationSequence) => {
        try {
            await communicationService.updateSequence(seq.id, { isActive: !seq.isActive });
            fetchSequences();
            if (selectedSequence?.id === seq.id) fetchSequenceDetail(seq.id);
        } catch (err) { toast('error', 'Failed to toggle'); }
    };

    const handleOpenAddStep = () => {
        setNewStep({ channel: 'sms', label: '', delayMinutes: 0, trigger: 'auto' });
        setNewStepTemplateId('');
        setNewStepScheduleHour('');
        setNewStepBranches({});
        setChannelTemplates([]);
        fetchTemplatesByChannel('sms');
        setShowAddStepModal(true);
    };

    const handleAddStep = async () => {
        if (!selectedSequence) return;
        try {
            const stepData: any = { ...newStep };
            if (newStepTemplateId) stepData.templateId = newStepTemplateId;
            if (Object.keys(newStepBranches).length > 0) stepData.branches = newStepBranches;
            if (newStepScheduleHour) stepData.content = JSON.stringify({ scheduledTime: newStepScheduleHour, ...(newStep.content ? { text: newStep.content } : {}) });
            await communicationService.addStep(selectedSequence.id, stepData);
            toast('success', 'Step added');
            setShowAddStepModal(false);
            setNewStep({ channel: 'sms', label: '', delayMinutes: 0, trigger: 'auto' });
            setNewStepTemplateId(''); setNewStepScheduleHour(''); setNewStepBranches({});
            fetchSequenceDetail(selectedSequence.id);
        } catch (err) { toast('error', 'Failed to add step'); }
    };

    const handleSaveConditions = async () => {
        if (!selectedSequence) return;
        try {
            await communicationService.updateSequence(selectedSequence.id, { conditions: editingConditions });
            toast('success', 'Conditions updated');
            setShowConditionEditor(false);
            fetchSequenceDetail(selectedSequence.id);
        } catch (err) { toast('error', 'Failed to save conditions'); }
    };

    const toggleConditionItem = (field: string, value: string) => {
        setEditingConditions((prev: any) => {
            const arr = prev[field] || [];
            return { ...prev, [field]: arr.includes(value) ? arr.filter((v: string) => v !== value) : [...arr, value] };
        });
    };

    const filteredSkus = products.filter(p => p.sku?.toLowerCase().includes(skuSearch.toLowerCase()));

    const handleRemoveStep = async (stepId: string) => {
        if (!selectedSequence || !window.confirm('Remove this step?')) return;
        try {
            await communicationService.removeStep(selectedSequence.id, stepId);
            fetchSequenceDetail(selectedSequence.id);
        } catch (err) { toast('error', 'Failed to remove step'); }
    };

    const handleInlineAddStep = async () => {
        if (!selectedSequence) return;
        try {
            await communicationService.addStep(selectedSequence.id, { channel: 'whatsapp', label: `Step ${(selectedSequence.steps?.length || 0) + 1}`, delayMinutes: 0, trigger: 'auto', content: '' });
            fetchSequenceDetail(selectedSequence.id);
        } catch (err) { toast('error', 'Failed to add step'); }
    };

    const handleUpdateStepField = async (stepId: string, field: string, value: any) => {
        if (!selectedSequence) return;
        // Optimistic UI update
        setSelectedSequence(prev => {
            if (!prev) return prev;
            return { ...prev, steps: prev.steps?.map(s => s.id === stepId ? { ...s, [field]: value } : s) };
        });
        // Persist via API (fire-and-forget)
        try {
            await communicationService.updateStep(selectedSequence.id, stepId, { [field]: value });
        } catch { /* will re-fetch on next focus */ }
    };

    const handleDeleteSequence = async (id: string) => {
        if (!window.confirm('Delete this sequence and all its steps?')) return;
        try {
            await communicationService.deleteSequence(id);
            toast('success', 'Sequence deleted');
            setSelectedSequence(null);
            fetchSequences();
        } catch (err) { toast('error', 'Failed to delete'); }
    };

    const getChannelMeta = (ch: string) => CHANNEL_OPTIONS.find(c => c.value === ch) || CHANNEL_OPTIONS[0];
    const getCategoryMeta = (cat: string) => CATEGORY_OPTIONS.find(c => c.value === cat) || CATEGORY_OPTIONS[0];

    const charCount = editingTemplate?.bodyTemplate?.length || 0;
    const smsSegments = Math.ceil(charCount / 160) || 1;

    // ─── RENDER ────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-6">
            {/* Breadcrumb */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-text-muted text-xs font-medium">Home</span>
                    <span className="text-text-muted text-xs">/</span>
                    <span className="text-white text-xs font-medium">Communication Hub</span>
                </div>
                <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mt-2">
                    <div>
                        <h1 className="text-white text-2xl sm:text-3xl font-black tracking-tight">Communication Hub</h1>
                        <p className="text-text-muted text-sm mt-1">Manage message templates and automated communication sequences.</p>
                    </div>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 bg-card-dark rounded-xl p-1 border border-border-dark w-fit">
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'templates' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-text-muted hover:text-white hover:bg-[#1c2d3d]'}`}
                >
                    <span className="material-symbols-outlined mr-2 align-middle" style={{ fontSize: '18px' }}>description</span>
                    Templates
                </button>
                <button
                    onClick={() => setActiveTab('sequences')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'sequences' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-text-muted hover:text-white hover:bg-[#1c2d3d]'}`}
                >
                    <span className="material-symbols-outlined mr-2 align-middle" style={{ fontSize: '18px' }}>bolt</span>
                    Sequences
                </button>
                <button
                    onClick={() => setActiveTab('call_records')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'call_records' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-text-muted hover:text-white hover:bg-[#1c2d3d]'}`}
                >
                    <span className="material-symbols-outlined mr-2 align-middle" style={{ fontSize: '18px' }}>call_log</span>
                    Call Records
                </button>
            </div>

            {/* ═══ TEMPLATES TAB ═══ */}
            {activeTab === 'templates' && (
                <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
                    {/* Left: Template Table */}
                    <div className="flex-1 flex flex-col gap-4">
                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px]">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[20px]">search</span>
                                <input type="text" placeholder="Search templates..." className="w-full pl-10 pr-4 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" value={tplSearch} onChange={e => setTplSearch(e.target.value)} />
                            </div>
                            <select className="px-3 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50" value={tplChannelFilter} onChange={e => setTplChannelFilter(e.target.value)}>
                                <option value="">All Channels</option>
                                {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <select className="px-3 py-2.5 bg-card-dark border border-border-dark rounded-xl text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50" value={tplLangFilter} onChange={e => setTplLangFilter(e.target.value)}>
                                <option value="">All Languages</option>
                                <option value="en">🇬🇧 EN</option>
                                <option value="es">🇪🇸 ES</option>
                                <option value="it">🇮🇹 IT</option>
                                <option value="fr">🇫🇷 FR</option>
                                <option value="de">🇩🇪 DE</option>
                                <option value="pt">🇵🇹 PT</option>
                            </select>
                            <span className="text-text-muted text-xs font-mono">{templates.length} templates</span>
                            <button onClick={handleNewTemplate} className="ml-auto px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                                <span className="material-symbols-outlined mr-1 align-middle" style={{ fontSize: '16px' }}>add</span>
                                New Template
                            </button>
                        </div>

                        {/* Table */}
                        <div className="bg-[#111a22] rounded-xl border border-border-dark overflow-hidden">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-[#17232f] border-b border-[#233648]">
                                        <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Name</th>
                                        <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Channel</th>
                                        <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest">Language</th>
                                        <th className="px-4 py-4 text-text-muted font-bold text-[10px] uppercase tracking-widest text-right">Uses</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#233648]">
                                    {tplLoading ? (
                                        <tr><td colSpan={4} className="px-4 py-12 text-center text-text-muted"><div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div></td></tr>
                                    ) : templates.length === 0 ? (
                                        <tr><td colSpan={4} className="px-4 py-12 text-center text-text-muted text-sm">No templates found</td></tr>
                                    ) : templates.map(t => {
                                        const ch = getChannelMeta(t.channel || t.templateType);
                                        return (
                                            <tr key={t.id} className={`hover:bg-[#1c2d3d] cursor-pointer transition-colors ${selectedTemplate?.id === t.id ? 'bg-[#1c2d3d]' : ''}`} onClick={() => handleSelectTemplate(t)}>
                                                <td className="px-4 py-4">
                                                    <p className="text-white text-sm font-bold">{t.templateName}</p>
                                                    {t.shortDescription && <p className="text-text-muted text-xs mt-0.5 truncate max-w-[250px]">{t.shortDescription}</p>}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider" style={{ background: `${ch.color}15`, color: ch.color, border: `1px solid ${ch.color}30` }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{ch.icon}</span>
                                                        {ch.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-sm text-text-muted font-medium">
                                                    {t.language === 'es' ? '🇪🇸' : t.language === 'it' ? '🇮🇹' : t.language === 'fr' ? '🇫🇷' : t.language === 'de' ? '🇩🇪' : t.language === 'pt' ? '🇵🇹' : '🇬🇧'} {(t.language || 'en').toUpperCase()}
                                                </td>
                                                <td className="px-4 py-4 text-sm text-text-muted font-mono text-right">{t.usageCount || 0}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right: Editor Panel */}
                    {editingTemplate && (
                        <div className="w-[420px] shrink-0 bg-[#111a22] rounded-xl border border-border-dark p-5 flex flex-col gap-4 sticky top-6 self-start" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-white text-lg font-bold">{isNewTemplate ? '✨ New Template' : '✏️ Edit Template'}</h3>
                                <button onClick={() => { setEditingTemplate(null); setSelectedTemplate(null); setIsNewTemplate(false); }} className="p-1.5 hover:bg-[#1c2d3d] rounded-lg text-text-muted hover:text-white transition-all">
                                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                                </button>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Template Name</label>
                                <input type="text" className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={editingTemplate.templateName || ''} onChange={e => setEditingTemplate({ ...editingTemplate, templateName: e.target.value })} placeholder="e.g. confirmation_call_es" />
                            </div>

                            {/* Channel + Language row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Channel</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50" value={editingTemplate.channel || 'sms'} onChange={e => setEditingTemplate({ ...editingTemplate, channel: e.target.value, templateType: e.target.value })}>
                                        {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Language</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50" value={editingTemplate.language || 'en'} onChange={e => setEditingTemplate({ ...editingTemplate, language: e.target.value })}>
                                        <option value="en">🇬🇧 English</option>
                                        <option value="es">🇪🇸 Spanish</option>
                                        <option value="it">🇮🇹 Italian</option>
                                        <option value="fr">🇫🇷 French</option>
                                        <option value="de">🇩🇪 German</option>
                                        <option value="pt">🇵🇹 Portuguese</option>
                                    </select>
                                </div>
                            </div>

                            {/* Subject (email only) */}
                            {editingTemplate.channel === 'email' && (
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Subject</label>
                                    <input type="text" className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={editingTemplate.subject || ''} onChange={e => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} placeholder="Email subject line..." />
                                </div>
                            )}

                            {/* Short Description */}
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Short Description</label>
                                <input type="text" className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={editingTemplate.shortDescription || ''} onChange={e => setEditingTemplate({ ...editingTemplate, shortDescription: e.target.value })} placeholder="Brief description..." maxLength={200} />
                            </div>

                            {/* Content */}
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Content</label>
                                <textarea ref={contentRef} rows={8} className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={editingTemplate.bodyTemplate || ''} onChange={e => setEditingTemplate({ ...editingTemplate, bodyTemplate: e.target.value })} placeholder="Template content..." />
                                {/* SMS char bar */}
                                {(editingTemplate.channel === 'sms') && (
                                    <div className="flex items-center justify-between mt-1.5">
                                        <div className="flex-1 h-1.5 bg-[#1c2d3d] rounded-full overflow-hidden mr-3">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (charCount / 160) * 100)}%`, background: charCount > 160 ? '#f5a623' : charCount > 320 ? '#f05252' : '#5b8def' }} />
                                        </div>
                                        <span className={`text-xs font-mono ${charCount > 160 ? 'text-amber-400' : 'text-text-muted'}`}>{charCount}/160 · {smsSegments} seg</span>
                                    </div>
                                )}
                            </div>

                            {/* Variables */}
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Variables</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {VARIABLES.map(v => (
                                        <button key={v} onClick={() => insertVariable(v)} className="px-2.5 py-1 bg-[#1c2d3d] hover:bg-primary/20 text-text-muted hover:text-primary text-xs font-mono rounded-lg border border-border-dark hover:border-primary/50 transition-all">{v}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 mt-2">
                                <button onClick={handleSaveTemplate} className="flex-1 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                                    <span className="material-symbols-outlined mr-1 align-middle" style={{ fontSize: '16px' }}>save</span>
                                    {isNewTemplate ? 'Create' : 'Save Changes'}
                                </button>
                                {!isNewTemplate && selectedTemplate && (
                                    <button onClick={handleDeleteTemplate} className="px-4 py-2.5 bg-red-500/10 text-red-400 text-sm font-bold rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-all">
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ SEQUENCES TAB ═══ */}
            {activeTab === 'sequences' && (
                <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
                    {/* Left sidebar: sequence list */}
                    <div className="w-[320px] shrink-0 flex flex-col gap-3">
                        <button onClick={() => setShowNewSeqModal(true)} className="w-full px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined mr-1 align-middle" style={{ fontSize: '16px' }}>add</span>
                            New Sequence
                        </button>
                        <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                            {seqLoading ? (
                                <div className="py-8 text-center"><div className="animate-spin size-6 border-2 border-primary border-t-transparent rounded-full mx-auto"></div></div>
                            ) : sequences.map(seq => {
                                const catMeta = getCategoryMeta(seq.category);
                                return (
                                    <div key={seq.id} onClick={() => fetchSequenceDetail(seq.id)} className={`p-4 rounded-xl border cursor-pointer transition-all group ${selectedSequence?.id === seq.id ? 'bg-[#1c2d3d] border-primary/40' : 'bg-[#111a22] border-border-dark hover:border-primary/20 hover:bg-[#151e28]'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={`size-2 rounded-full ${seq.isActive ? 'bg-emerald-400' : 'bg-text-muted/40'}`}></span>
                                                    <span className="text-white text-sm font-bold truncate">{seq.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider" style={{ background: `${catMeta.color}15`, color: catMeta.color }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>{catMeta.icon}</span>
                                                        {catMeta.label}
                                                    </span>
                                                    <span className="text-text-muted text-[10px] font-mono">{seq._count?.steps || 0} steps</span>
                                                    <span className="text-text-muted text-[10px] font-mono">· {seq.triggeredCount} triggered</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={e => { e.stopPropagation(); handleToggleSequenceActive(seq); }} className="p-1 rounded hover:bg-[#233648]" title={seq.isActive ? 'Deactivate' : 'Activate'}>
                                                    <span className="material-symbols-outlined text-text-muted" style={{ fontSize: '16px' }}>{seq.isActive ? 'pause' : 'play_arrow'}</span>
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); handleDeleteSequence(seq.id); }} className="p-1 rounded hover:bg-red-500/10">
                                                    <span className="material-symbols-outlined text-text-muted hover:text-red-400" style={{ fontSize: '16px' }}>delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Center: Sequence Detail */}
                    <div className="flex-1">
                        {!selectedSequence ? (
                            <div className="flex flex-col gap-5" style={{ minHeight: 'calc(100vh - 280px)' }}>
                                {/* Pre-built Automation Cards */}
                                <p className="text-xs text-text-muted">Active automation sequences exposed from backend. Click a custom sequence on the left to edit.</p>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {/* Confirmation Call + Pre-SMS Card */}
                                    <div className="bg-[#111a22] rounded-xl border border-border-dark p-5 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f5a623' }}>call</span>
                                                <span className="text-sm font-bold text-white">Confirmation Call + Pre-SMS</span>
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
                                        </div>
                                        <p className="text-xs text-text-muted">COD order confirmation: sends pre-call SMS warning → waits 8 seconds → initiates Twilio call with DTMF options.</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] text-text-muted font-bold">Channels:</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded border font-bold" style={{ color: '#5b8def', borderColor: '#5b8def30', backgroundColor: '#5b8def10' }}>SMS</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded border font-bold" style={{ color: '#f5a623', borderColor: '#f5a62330', backgroundColor: '#f5a62310' }}>Call</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="bg-[#1a2332] rounded-lg border border-border-dark p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-black text-text-muted">Step 1</span>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#5b8def' }}>sms</span>
                                                    <span className="text-[10px] text-text-muted">SMS</span>
                                                </div>
                                                <p className="text-[10px] text-text-muted">Pre-call SMS warning (by country: ES/IT/EN). Template: <span className="text-white font-mono">{'sms_pre_call_{{country}}'}</span></p>
                                            </div>
                                            <div className="bg-[#1a2332] rounded-lg border border-border-dark p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-black text-text-muted">Step 2</span>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#f5a623' }}>call</span>
                                                    <span className="text-[10px] text-text-muted">Call · 8s delay</span>
                                                </div>
                                                <p className="text-[10px] text-text-muted">Twilio call (short/long script). DTMF: <span className="text-amber-400">Press 1</span> → Confirm · <span className="text-amber-400">Press 2</span> → Cancel</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Condition: Pending</span>
                                            <span className="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Risk: medium+</span>
                                            <span className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-[#1a2332] text-text-muted border border-border-dark">⏱ Every 5 min · Max 1 attempt</span>
                                        </div>
                                    </div>

                                    {/* Out of Delivery Notification Card */}
                                    <div className="bg-[#111a22] rounded-xl border border-border-dark p-5 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#22d4e6' }}>local_shipping</span>
                                                <span className="text-sm font-bold text-white">Out of Delivery Notification</span>
                                            </div>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
                                        </div>
                                        <p className="text-xs text-text-muted">When 17Track reports order as "Out for Delivery", automatically sends SMS + WhatsApp to the customer.</p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] text-text-muted font-bold">Channels:</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded border font-bold" style={{ color: '#5b8def', borderColor: '#5b8def30', backgroundColor: '#5b8def10' }}>SMS</span>
                                            <span className="text-[10px] px-2 py-0.5 rounded border font-bold" style={{ color: '#25d366', borderColor: '#25d36630', backgroundColor: '#25d36610' }}>WhatsApp</span>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="bg-[#1a2332] rounded-lg border border-border-dark p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-black text-text-muted">Step 1</span>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#5b8def' }}>sms</span>
                                                    <span className="text-[10px] text-text-muted">SMS · Auto</span>
                                                </div>
                                                <p className="text-[10px] text-text-muted">Send SMS delivery notification with tracking URL and estimated time</p>
                                            </div>
                                            <div className="bg-[#1a2332] rounded-lg border border-border-dark p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-black text-text-muted">Step 2</span>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#25d366' }}>chat</span>
                                                    <span className="text-[10px] text-text-muted">WhatsApp · Auto</span>
                                                </div>
                                                <p className="text-[10px] text-text-muted">Send WhatsApp delivery notification with tracking details</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Condition: out_for_delivery</span>
                                            <span className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-[#1a2332] text-text-muted border border-border-dark">🔗 17Track webhook trigger</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 flex items-center justify-center text-text-muted">
                                    <div className="text-center">
                                        <span className="material-symbols-outlined text-4xl mb-2 block opacity-20">bolt</span>
                                        <p className="text-sm">Select a custom sequence from the left to edit its steps</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-[#111a22] border border-border-dark rounded-2xl overflow-hidden" style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
                                {/* Header */}
                                <div className="p-5 border-b border-border-dark flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: getCategoryMeta(selectedSequence.category).color }}>{getCategoryMeta(selectedSequence.category).icon}</span>
                                        <div>
                                            <h3 className="text-sm font-black uppercase tracking-widest text-white">Edit Sequence</h3>
                                            <p className="text-xs text-text-muted">{selectedSequence.name}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedSequence(null)} className="text-text-muted hover:text-white">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>

                                <div className="p-5 space-y-5">
                                    {/* Title & Description */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Title</label>
                                            <input value={selectedSequence.name} onChange={e => setSelectedSequence({ ...selectedSequence, name: e.target.value })} className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-text-muted font-bold uppercase block mb-1">Description</label>
                                            <input value={selectedSequence.description || ''} onChange={e => setSelectedSequence({ ...selectedSequence, description: e.target.value })} className="w-full bg-[#1a2332] border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none" />
                                        </div>
                                    </div>

                                    {/* Active Toggle */}
                                    <div className="flex items-center gap-3">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={selectedSequence.isActive} onChange={e => { setSelectedSequence({ ...selectedSequence, isActive: e.target.checked }); communicationService.updateSequence(selectedSequence.id, { isActive: e.target.checked }); }} className="sr-only peer" />
                                            <div className="w-9 h-5 bg-border-dark rounded-full peer peer-checked:bg-primary transition-colors peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                        </label>
                                        <span className="text-xs text-white font-bold">Sequence Active</span>
                                    </div>

                                    {/* Channel Order */}
                                    <div>
                                        <label className="text-[10px] text-text-muted font-bold uppercase block mb-2">Channel Order</label>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {CHANNEL_OPTIONS.map(ch => {
                                                const channelsUsed = selectedSequence.steps?.map((s: any) => s.channel) || [];
                                                const isUsed = channelsUsed.includes(ch.value);
                                                return (
                                                    <div key={ch.value} className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-lg border transition-all ${isUsed ? 'border-primary/40 bg-primary/10 text-white' : 'border-border-dark bg-[#1a2332] text-text-muted'}`}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: ch.color }}>{ch.icon}</span>
                                                        {ch.label}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Conditions */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[10px] text-text-muted font-bold uppercase">Conditions</label>
                                            <button onClick={() => { setEditingConditions(selectedSequence.conditions || {}); setShowConditionEditor(true); }} className="flex items-center gap-1 text-[10px] text-primary font-bold hover:text-primary/80 transition-colors">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                                                Edit
                                            </button>
                                        </div>
                                        {selectedSequence.conditions && (Object.values(selectedSequence.conditions).some((v: any) => v && (Array.isArray(v) ? v.length > 0 : true))) ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {selectedSequence.conditions.riskLevels?.map((r: string) => (
                                                    <span key={r} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Risk: {r}</span>
                                                ))}
                                                {selectedSequence.conditions.orderStatuses?.map((s: string) => (
                                                    <span key={s} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Status: {s}</span>
                                                ))}
                                                {selectedSequence.conditions.confirmationStatuses?.map((s: string) => (
                                                    <span key={s} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Confirm: {s}</span>
                                                ))}
                                                {selectedSequence.conditions.skuTypes?.map((s: string) => (
                                                    <span key={s} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">SKU: {s}</span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-text-muted/40 text-xs italic">No conditions set. Click Edit to add.</p>
                                        )}
                                    </div>

                                    {/* Automation Steps — Inline Editing */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[10px] text-text-muted font-bold uppercase">Automation Steps</label>
                                            <button onClick={handleInlineAddStep} className="flex items-center gap-1 text-[10px] text-primary font-bold hover:text-primary/80 transition-colors">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                                                Add Step
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {(selectedSequence.steps || []).map((step: any, idx: number) => {
                                                const chOpt = CHANNEL_OPTIONS.find(c => c.value === step.channel);
                                                return (
                                                    <div key={step.id} className="bg-[#1a2332] rounded-xl border border-border-dark p-4">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-black text-text-muted">Step {idx + 1}</span>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: chOpt?.color }}>{chOpt?.icon || 'help'}</span>
                                                            </div>
                                                            <button onClick={() => handleRemoveStep(step.id)} className="text-red-400 hover:text-red-300">
                                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-3">
                                                            <div>
                                                                <label className="text-[10px] text-text-muted font-bold block mb-1">Channel</label>
                                                                <select value={step.channel} onChange={e => handleUpdateStepField(step.id, 'channel', e.target.value)} className="w-full bg-[#111a22] border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none">
                                                                    {CHANNEL_OPTIONS.map(ch => (<option key={ch.value} value={ch.value}>{ch.label}</option>))}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-text-muted font-bold block mb-1">Trigger</label>
                                                                <select value={step.trigger || 'auto'} onChange={e => handleUpdateStepField(step.id, 'trigger', e.target.value)} className="w-full bg-[#111a22] border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none">
                                                                    <option value="auto">Auto (Timer)</option>
                                                                    <option value="manual">Manual</option>
                                                                    <option value="on_no_response">On No Response</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-text-muted font-bold block mb-1">Delay (min)</label>
                                                                <input type="number" value={step.delayMinutes || 0} onChange={e => handleUpdateStepField(step.id, 'delayMinutes', parseInt(e.target.value) || 0)} className="w-full bg-[#111a22] border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none" min={0} />
                                                            </div>
                                                        </div>
                                                        <div className="mt-3">
                                                            <label className="text-[10px] text-text-muted font-bold block mb-1">Content / Template</label>
                                                            <textarea value={step.content || ''} onChange={e => handleUpdateStepField(step.id, 'content', e.target.value)} rows={2} className="w-full bg-[#111a22] border border-border-dark rounded-lg px-2 py-1.5 text-xs text-white focus:border-primary outline-none resize-none" placeholder={`Message template for ${chOpt?.label || 'channel'}...`} />
                                                        </div>
                                                        {/* DTMF branches display */}
                                                        {step.branches && Object.keys(step.branches).length > 0 && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {Object.entries(step.branches as Record<string, string>).map(([key, val]) => (
                                                                    <span key={key} className="px-2.5 py-1 bg-[#111a22] rounded-lg text-[10px] font-bold border border-border-dark">
                                                                        <span className="text-amber-400">Press {key}</span> → <span className="text-white">{val}</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {(selectedSequence.steps || []).length === 0 && (
                                                <div className="text-center py-6 text-text-muted text-xs italic border border-dashed border-border-dark rounded-xl">
                                                    No steps configured. Click "Add Step" to create an automation sequence.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-5 pt-0 flex justify-end gap-3">
                                    <button onClick={() => setSelectedSequence(null)} className="px-4 py-2 text-xs font-bold text-text-muted hover:text-white transition-colors">Cancel</button>
                                    <button onClick={async () => { try { await communicationService.updateSequence(selectedSequence.id, { name: selectedSequence.name, description: selectedSequence.description, isActive: selectedSequence.isActive, conditions: selectedSequence.conditions }); toast('success', '✅ Sequence saved!'); fetchSequences(); } catch { toast('error', 'Failed to save'); }}} className="px-6 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all">
                                        Save Sequence
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ CALL RECORDS TAB ═══ */}
            {activeTab === 'call_records' && (
                <CallRecordsTab />
            )}

            {/* ═══ MODALS ═══ */}

            {/* New Sequence Modal */}
            {showNewSeqModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowNewSeqModal(false)}>
                    <div className="bg-[#111a22] rounded-2xl border border-border-dark p-6 w-[480px] shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white text-lg font-bold mb-4">✨ New Sequence</h3>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Name</label>
                                <input type="text" className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={newSeq.name || ''} onChange={e => setNewSeq({ ...newSeq, name: e.target.value })} placeholder="e.g. Confirmation Flow — Spain" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Category</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newSeq.category || 'confirmation'} onChange={e => setNewSeq({ ...newSeq, category: e.target.value })}>
                                        {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Condition</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newSeq.triggerEvent || 'order_created'} onChange={e => setNewSeq({ ...newSeq, triggerEvent: e.target.value })}>
                                        <option value="order_created">Order Created</option>
                                        <option value="status_changed">Status Changed</option>
                                        <option value="no_response">No Response</option>
                                        <option value="stock_arrived">Stock Arrived</option>
                                        <option value="out_for_delivery">Out for Delivery</option>
                                        <option value="manual">Manual Trigger</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Description</label>
                                <textarea rows={2} className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newSeq.description || ''} onChange={e => setNewSeq({ ...newSeq, description: e.target.value })} placeholder="Optional description..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowNewSeqModal(false)} className="px-4 py-2.5 text-text-muted text-sm font-bold hover:text-white transition-all">Cancel</button>
                            <button onClick={handleCreateSequence} className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20" disabled={!newSeq.name}>Create</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Step Modal removed — steps are now added inline */}

            {/* Condition Editor Modal */}
            {showConditionEditor && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowConditionEditor(false)}>
                    <div className="bg-[#111a22] rounded-2xl border border-border-dark p-6 w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white text-lg font-bold mb-5">🎯 Edit Conditions</h3>
                        <div className="flex flex-col gap-5">
                            {/* Confirmation Status */}
                            <div>
                                <label className="text-purple-400 text-xs font-bold uppercase tracking-wider mb-2 block">Confirmation Status</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {CONFIRM_STATUSES.map(s => (
                                        <button key={s} onClick={() => toggleConditionItem('confirmationStatuses', s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${(editingConditions.confirmationStatuses || []).includes(s) ? 'bg-purple-500/20 text-purple-400 border-purple-500/40' : 'bg-[#0a1018] text-text-muted border-border-dark hover:border-purple-500/30'}`}>{s}</button>
                                    ))}
                                </div>
                            </div>
                            {/* Order Status */}
                            <div>
                                <label className="text-blue-400 text-xs font-bold uppercase tracking-wider mb-2 block">Order Status</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {ORDER_STATUSES.map(s => (
                                        <button key={s} onClick={() => toggleConditionItem('orderStatuses', s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${(editingConditions.orderStatuses || []).includes(s) ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-[#0a1018] text-text-muted border-border-dark hover:border-blue-500/30'}`}>{s}</button>
                                    ))}
                                </div>
                            </div>
                            {/* Risk Level */}
                            <div>
                                <label className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2 block">Risk Level</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {RISK_LEVELS.map(s => (
                                        <button key={s} onClick={() => toggleConditionItem('riskLevels', s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${(editingConditions.riskLevels || []).includes(s) ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-[#0a1018] text-text-muted border-border-dark hover:border-amber-500/30'}`}>{s}</button>
                                    ))}
                                </div>
                            </div>
                            {/* Product SKU */}
                            <div>
                                <label className="text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2 block">Product SKU</label>
                                <input type="text" className="w-full px-3 py-2 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary/50" placeholder="Search SKU..." value={skuSearch} onChange={e => setSkuSearch(e.target.value)} />
                                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                                    {filteredSkus.slice(0, 20).map(p => (
                                        <button key={p.sku} onClick={() => toggleConditionItem('skuTypes', p.sku)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${(editingConditions.skuTypes || []).includes(p.sku) ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-[#0a1018] text-text-muted border-border-dark hover:border-cyan-500/30'}`}>
                                            {p.sku} <span className="text-text-muted/50 ml-1 font-normal">{p.name?.substring(0, 20)}</span>
                                        </button>
                                    ))}
                                    {filteredSkus.length === 0 && <p className="text-text-muted/40 text-xs">No products found</p>}
                                </div>
                                {(editingConditions.skuTypes || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {editingConditions.skuTypes.map((s: string) => (
                                            <span key={s} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                                                {s}
                                                <button onClick={() => toggleConditionItem('skuTypes', s)} className="hover:text-white">×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setShowConditionEditor(false)} className="px-4 py-2.5 text-text-muted text-sm font-bold hover:text-white transition-all">Cancel</button>
                            <button onClick={handleSaveConditions} className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">Save Conditions</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {showToast && (
                <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-2xl text-sm font-bold z-50 flex items-center gap-2 animate-pulse ${showToast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{showToast.type === 'success' ? 'check_circle' : 'error'}</span>
                    {showToast.msg}
                </div>
            )}
        </div>
    );
};

export default CommunicationPage;
