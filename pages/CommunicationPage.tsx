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
                            <div className="flex items-center justify-center h-full text-text-muted">
                                <div className="text-center">
                                    <span className="material-symbols-outlined text-5xl mb-3 block opacity-30">bolt</span>
                                    <p className="text-sm">Select a sequence to view its steps and conditions</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-5">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-white text-xl font-bold">{selectedSequence.name}</h2>
                                        {selectedSequence.description && <p className="text-text-muted text-sm mt-0.5">{selectedSequence.description}</p>}
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedSequence.isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                        {selectedSequence.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                {/* Conditions */}
                                <div className="p-4 bg-[#111a22] rounded-xl border border-border-dark">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-text-muted text-xs font-bold uppercase tracking-wider">Conditions</h4>
                                        <button onClick={() => { setEditingConditions(selectedSequence.conditions || {}); setShowConditionEditor(true); }} className="px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-lg hover:bg-primary/20 transition-all border border-primary/20">
                                            <span className="material-symbols-outlined mr-0.5 align-middle" style={{ fontSize: '12px' }}>edit</span>
                                            Edit
                                        </button>
                                    </div>
                                    {selectedSequence.conditions && (Object.values(selectedSequence.conditions).some((v: any) => v && (Array.isArray(v) ? v.length > 0 : true))) ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedSequence.conditions.riskLevels?.map((r: string) => (
                                                <span key={r} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Risk: {r}</span>
                                            ))}
                                            {selectedSequence.conditions.orderStatuses?.map((s: string) => (
                                                <span key={s} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Status: {s}</span>
                                            ))}
                                            {selectedSequence.conditions.confirmationStatuses?.map((s: string) => (
                                                <span key={s} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Confirm: {s}</span>
                                            ))}
                                            {selectedSequence.conditions.skuTypes?.map((s: string) => (
                                                <span key={s} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">SKU: {s}</span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-text-muted/50 text-xs italic">No conditions set — this sequence will trigger for all matching orders.</p>
                                    )}
                                </div>

                                {/* Flow Canvas */}
                                <div className="flex flex-col gap-0">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-text-muted text-xs font-bold uppercase tracking-wider">Sequence Flow</h4>
                                        <button onClick={handleOpenAddStep} className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary/20 transition-all border border-primary/20">
                                            <span className="material-symbols-outlined mr-1 align-middle" style={{ fontSize: '14px' }}>add</span>
                                            Add Step
                                        </button>
                                    </div>

                                    {selectedSequence.steps?.length === 0 ? (
                                        <div className="p-8 bg-[#111a22] rounded-xl border border-dashed border-border-dark text-center">
                                            <span className="material-symbols-outlined text-3xl text-text-muted/30 mb-2 block">playlist_add</span>
                                            <p className="text-text-muted text-sm">No steps yet. Add your first step to build the sequence.</p>
                                        </div>
                                    ) : selectedSequence.steps?.map((step, idx) => {
                                        const chMeta = getChannelMeta(step.channel);
                                        return (
                                            <React.Fragment key={step.id}>
                                                {/* Connector line */}
                                                {idx > 0 && (
                                                    <div className="flex items-center ml-6">
                                                        <div className="w-px h-8 bg-border-dark"></div>
                                                        {step.delayMinutes > 0 && (
                                                            <span className="ml-3 px-2.5 py-1 bg-[#111a22] border border-border-dark rounded text-[10px] text-text-muted font-mono">
                                                                ⏱ {step.delayMinutes >= 60 ? `${Math.floor(step.delayMinutes / 60)}h ${step.delayMinutes % 60}m` : `${step.delayMinutes}m`} delay
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Step card */}
                                                <div className="flex items-start gap-3 group">
                                                    {/* Icon */}
                                                    <div className="flex flex-col items-center">
                                                        <div className="size-12 rounded-xl flex items-center justify-center border" style={{ background: `${chMeta.color}15`, borderColor: `${chMeta.color}30` }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: '22px', color: chMeta.color }}>{chMeta.icon}</span>
                                                        </div>
                                                    </div>
                                                    {/* Content */}
                                                    <div className="flex-1 p-4 bg-[#111a22] rounded-xl border border-border-dark group-hover:border-primary/20 transition-all">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-white text-sm font-bold">{step.label}</span>
                                                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider" style={{ background: `${chMeta.color}15`, color: chMeta.color }}>{chMeta.label}</span>
                                                                {step.trigger !== 'auto' && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400">{step.trigger}</span>}
                                                            </div>
                                                            <button onClick={() => handleRemoveStep(step.id)} className="p-1 rounded hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
                                                                <span className="material-symbols-outlined text-text-muted hover:text-red-400" style={{ fontSize: '16px' }}>close</span>
                                                            </button>
                                                        </div>
                                                        {step.template && (
                                                            <p className="text-text-muted text-xs mt-1.5 flex items-center gap-1">
                                                                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>description</span>
                                                                {step.template.templateName}
                                                                {step.template.language && <span className="ml-1 opacity-60">{step.template.language.toUpperCase()}</span>}
                                                            </p>
                                                        )}
                                                        {step.content && !step.template && (
                                                            <p className="text-text-muted text-xs mt-1.5 font-mono truncate max-w-[400px]">{step.content}</p>
                                                        )}
                                                        {/* DTMF branches */}
                                                        {step.branches && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {Object.entries(step.branches as Record<string, string>).map(([key, val]) => (
                                                                    <span key={key} className="px-2.5 py-1 bg-[#1c2d3d] rounded-lg text-[10px] font-bold border border-border-dark">
                                                                        <span className="text-amber-400">Press {key}</span> → <span className="text-white">{val}</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        );
                                    })}

                                    {/* When Stock Arrives section for OOS */}
                                    {selectedSequence.category === 'out_of_stock' && selectedSequence.whenStockNote && (
                                        <div className="mt-4 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/15">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="material-symbols-outlined text-emerald-400" style={{ fontSize: '18px' }}>inventory_2</span>
                                                <span className="text-emerald-400 text-sm font-bold">When Stock Arrives</span>
                                            </div>
                                            <p className="text-text-muted text-xs">{JSON.stringify(selectedSequence.whenStockNote)}</p>
                                        </div>
                                    )}
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
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Trigger Event</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newSeq.triggerEvent || 'order_created'} onChange={e => setNewSeq({ ...newSeq, triggerEvent: e.target.value })}>
                                        <option value="order_created">Order Created</option>
                                        <option value="status_changed">Status Changed</option>
                                        <option value="no_response">No Response</option>
                                        <option value="stock_arrived">Stock Arrived</option>
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

            {/* Enhanced Add Step Modal */}
            {showAddStepModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddStepModal(false)}>
                    <div className="bg-[#111a22] rounded-2xl border border-border-dark p-6 w-[520px] shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white text-lg font-bold mb-4">➕ Add Step</h3>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Label</label>
                                <input type="text" className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStep.label || ''} onChange={e => setNewStep({ ...newStep, label: e.target.value })} placeholder="e.g. Pre-call SMS" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Channel</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStep.channel || 'sms'} onChange={e => { setNewStep({ ...newStep, channel: e.target.value }); fetchTemplatesByChannel(e.target.value); setNewStepTemplateId(''); }}>
                                        {CHANNEL_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Delay (minutes)</label>
                                    <input type="number" min={0} className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStep.delayMinutes || 0} onChange={e => setNewStep({ ...newStep, delayMinutes: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                            {/* Template Selector */}
                            <div>
                                <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Choose Template</label>
                                <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStepTemplateId} onChange={e => setNewStepTemplateId(e.target.value)}>
                                    <option value="">— No template (inline content) —</option>
                                    {channelTemplates.map(t => <option key={t.id} value={t.id}>{t.templateName} {t.language ? `(${t.language.toUpperCase()})` : ''}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Trigger</label>
                                    <select className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStep.trigger || 'auto'} onChange={e => setNewStep({ ...newStep, trigger: e.target.value })}>
                                        <option value="auto">Automatic</option>
                                        <option value="manual">Manual</option>
                                        <option value="on_no_response">On No Response</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Schedule Time</label>
                                    <input type="time" className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStepScheduleHour} onChange={e => setNewStepScheduleHour(e.target.value)} />
                                </div>
                            </div>
                            {/* DTMF Branches (for call channel) */}
                            {(newStep.channel === 'call') && (
                                <div className="p-3 bg-[#0a1018] rounded-xl border border-amber-500/20">
                                    <label className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>dialpad</span>
                                        DTMF Options (Press 1/2/3)
                                    </label>
                                    {['1', '2', '3'].map(key => (
                                        <div key={key} className="flex items-center gap-2 mt-2">
                                            <span className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-sm font-black shrink-0">{key}</span>
                                            <span className="text-text-muted text-xs">→</span>
                                            <input type="text" className="flex-1 px-3 py-2 bg-[#111a22] border border-border-dark rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" value={newStepBranches[key] || ''} onChange={e => setNewStepBranches({ ...newStepBranches, [key]: e.target.value })} placeholder={key === '1' ? 'Confirm Order' : key === '2' ? 'Cancel Order' : 'Speak to Agent'} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Inline Content */}
                            {!newStepTemplateId && (
                                <div>
                                    <label className="text-text-muted text-xs font-bold uppercase tracking-wider mb-1.5 block">Inline Content</label>
                                    <textarea rows={3} className="w-full px-3 py-2.5 bg-[#0a1018] border border-border-dark rounded-xl text-white text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" value={newStep.content || ''} onChange={e => setNewStep({ ...newStep, content: e.target.value })} placeholder="Step content..." />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setShowAddStepModal(false)} className="px-4 py-2.5 text-text-muted text-sm font-bold hover:text-white transition-all">Cancel</button>
                            <button onClick={handleAddStep} className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20" disabled={!newStep.label}>Add Step</button>
                        </div>
                    </div>
                </div>
            )}

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
