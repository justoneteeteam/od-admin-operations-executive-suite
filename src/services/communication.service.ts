import apiClient from './apiClient';

// ─── TYPES ───────────────────────────────────────────────────────────

export interface CommunicationTemplate {
    id: string;
    templateName: string;
    templateType: string;
    channel?: string;
    subject?: string;
    bodyTemplate: string;
    shortDescription?: string;
    variables?: any;
    language?: string;
    isActive?: boolean;
    usageCount?: number;
    lastUsedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface SequenceStep {
    id: string;
    sequenceId: string;
    templateId?: string;
    stepOrder: number;
    channel: string;
    label: string;
    delayMinutes: number;
    trigger?: string;
    branches?: any;
    content?: string;
    createdAt?: string;
    template?: {
        id: string;
        templateName: string;
        channel?: string;
        language?: string;
    };
}

export interface CommunicationSequence {
    id: string;
    name: string;
    category: string;
    triggerEvent: string;
    description?: string;
    conditions?: {
        skuType?: string;
        riskLevels?: string[];
        orderStatuses?: string[];
        confirmationStatuses?: string[];
    };
    whenStockNote?: any;
    isActive: boolean;
    triggeredCount: number;
    legacyCaseType?: string;
    createdAt?: string;
    updatedAt?: string;
    steps?: SequenceStep[];
    _count?: { steps: number };
}

export interface CallRecord {
    id: string;
    orderId: string;
    callSid: string;
    attemptNumber: number;
    callStatus: string;
    callDuration?: number;
    scriptType: string;
    scriptLanguage?: string;
    speechResult?: string;
    speechConfidence?: number;
    dtmfInput?: string;
    intentDetected?: string;
    intentionScore?: number;
    recordingUrl?: string;
    transcriptionText?: string;
    transcriptionEnglish?: string;
    skipReason?: string;
    csNote?: string;
    createdAt: string;
    completedAt?: string;
    order?: {
        id: string;
        orderNumber: string;
        confirmationStatus?: string;
        shippingCountry?: string;
        customer?: { name: string; phone: string };
    };
}

export interface CallRecordsResponse {
    records: CallRecord[];
    total: number;
    page: number;
    totalPages: number;
    stats: {
        total: number;
        confirmed: number;
        cancelled: number;
        noAnswer: number;
        unclear: number;
    };
}

// ─── API SERVICE ─────────────────────────────────────────────────────

const communicationService = {
    // Templates
    listTemplates: async (params?: { channel?: string; language?: string; search?: string }): Promise<CommunicationTemplate[]> => {
        const query = new URLSearchParams();
        if (params?.channel) query.append('channel', params.channel);
        if (params?.language) query.append('language', params.language);
        if (params?.search) query.append('search', params.search);
        const qs = query.toString();
        const res = await apiClient.get(`/communication/templates${qs ? `?${qs}` : ''}`);
        return res.data;
    },

    createTemplate: async (dto: Partial<CommunicationTemplate>): Promise<CommunicationTemplate> => {
        const res = await apiClient.post('/communication/templates', dto);
        return res.data;
    },

    updateTemplate: async (id: string, dto: Partial<CommunicationTemplate>): Promise<CommunicationTemplate> => {
        const res = await apiClient.patch(`/communication/templates/${id}`, dto);
        return res.data;
    },

    deleteTemplate: async (id: string): Promise<void> => {
        await apiClient.delete(`/communication/templates/${id}`);
    },

    // Sequences
    listSequences: async (): Promise<CommunicationSequence[]> => {
        const res = await apiClient.get('/communication/sequences');
        return res.data;
    },

    getSequence: async (id: string): Promise<CommunicationSequence> => {
        const res = await apiClient.get(`/communication/sequences/${id}`);
        return res.data;
    },

    createSequence: async (dto: Partial<CommunicationSequence>): Promise<CommunicationSequence> => {
        const res = await apiClient.post('/communication/sequences', dto);
        return res.data;
    },

    updateSequence: async (id: string, dto: Partial<CommunicationSequence>): Promise<CommunicationSequence> => {
        const res = await apiClient.patch(`/communication/sequences/${id}`, dto);
        return res.data;
    },

    deleteSequence: async (id: string): Promise<void> => {
        await apiClient.delete(`/communication/sequences/${id}`);
    },

    // Steps
    addStep: async (sequenceId: string, dto: Partial<SequenceStep>): Promise<SequenceStep> => {
        const res = await apiClient.post(`/communication/sequences/${sequenceId}/steps`, dto);
        return res.data;
    },

    removeStep: async (sequenceId: string, stepId: string): Promise<void> => {
        await apiClient.delete(`/communication/sequences/${sequenceId}/steps/${stepId}`);
    },

    reorderSteps: async (sequenceId: string, stepIds: string[]): Promise<void> => {
        await apiClient.patch(`/communication/sequences/${sequenceId}/steps/reorder`, { stepIds });
    },

    // Call Records
    listCallRecords: async (params?: {
        type?: string;
        intent?: string;
        language?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<CallRecordsResponse> => {
        const query = new URLSearchParams();
        if (params?.type) query.append('type', params.type);
        if (params?.intent) query.append('intent', params.intent);
        if (params?.language) query.append('language', params.language);
        if (params?.search) query.append('search', params.search);
        if (params?.page) query.append('page', String(params.page));
        if (params?.limit) query.append('limit', String(params.limit));
        const qs = query.toString();
        const res = await apiClient.get(`/communication/call-records${qs ? `?${qs}` : ''}`);
        return res.data;
    },

    updateCsNote: async (id: string, note: string): Promise<void> => {
        await apiClient.patch(`/communication/call-records/${id}/note`, { note });
    },
};

export default communicationService;
