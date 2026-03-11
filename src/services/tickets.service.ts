import apiClient from './apiClient';

// ─── TYPES ───────────────────────────────────────────────────────────
export interface Ticket {
    id: string;
    ticketNumber: string;
    orderId?: string;
    customerId?: string;
    title: string;
    description?: string;
    caseType: string;
    priority: string;
    status: string;
    source: string;
    resolution?: string;
    picId?: string;
    picName?: string;
    autoStep: number;
    autoPaused: boolean;
    country?: string;
    trackingSubstatus?: string;
    slaDeadlineAt?: string;
    slaBreached: boolean;
    resolvedAt?: string;
    closedAt?: string;
    createdAt: string;
    updatedAt: string;
    // Relations
    order?: {
        orderNumber: string;
        totalAmount: number;
        shippingCountry?: string;
        items?: any[];
        customer?: any;
        trackingHistory?: any[];
        callLogs?: any[];
    };
    customer?: {
        name: string;
        phone: string;
        email?: string;
    };
    pic?: {
        fullName: string;
        email?: string;
    };
    timeline?: TimelineEvent[];
    messages?: TicketMessage[];
}

export interface TimelineEvent {
    id: string;
    ticketId: string;
    eventType: string;
    channel?: string;
    content?: string;
    metadata?: any;
    actorId?: string;
    actorName?: string;
    externalRef?: string;
    createdAt: string;
}

export interface TicketMessage {
    id: string;
    ticketId: string;
    channel: string;
    direction: string;
    recipient?: string;
    subject?: string;
    body: string;
    charCount?: number;
    externalId?: string;
    deliveryStatus?: string;
    sentAt?: string;
    deliveredAt?: string;
    errorMessage?: string;
    sentBy?: string;
    createdAt: string;
}

export interface IncidentWorkflow {
    id: string;
    caseType: string;
    title: string;
    description?: string;
    channelOrder: string[];
    steps: any[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface TicketStats {
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    slaBreached: number;
    resolvedThisWeek: number;
    autoActive: number;
    caseTypeBreakdown: { caseType: string; count: number }[];
}

// ─── CONSTANTS ───────────────────────────────────────────────────────

export const CASE_TYPE_OPTIONS = [
    { value: 'address_issue', label: 'Address & Delivery Issue', icon: 'location_off', color: '#f97316' },
    { value: 'customer_unavailable', label: 'Customer Not Available', icon: 'person_off', color: '#eab308' },
    { value: 'delivery_refused', label: 'Delivery Refused', icon: 'block', color: '#ef4444' },
    { value: 'customs_issue', label: 'Customs / Import Issue', icon: 'gavel', color: '#a855f7' },
    { value: 'parcel_damaged_lost', label: 'Parcel Damaged / Lost', icon: 'broken_image', color: '#ec4899' },
    { value: 'delivery_delay', label: 'Delivery Delay', icon: 'schedule', color: '#3b82f6' },
    { value: 'access_issue', label: 'Courier Access Issue', icon: 'do_not_disturb_on', color: '#14b8a6' },
    { value: 'pickup_warehouse_issue', label: 'Pickup / Warehouse Issue', icon: 'inventory_2', color: '#64748b' },
    { value: 'other', label: 'Other', icon: 'help', color: '#6b7280' },
];

export const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Low', color: '#22c55e' },
    { value: 'medium', label: 'Medium', color: '#f97316' },
    { value: 'high', label: 'High', color: '#ef4444' },
    { value: 'urgent', label: 'Urgent', color: '#dc2626' },
];

export const STATUS_OPTIONS = [
    { value: 'open', label: 'Open', color: '#3b82f6' },
    { value: 'in_progress', label: 'In Progress', color: '#f97316' },
    { value: 'resolved', label: 'Resolved', color: '#22c55e' },
    { value: 'closed', label: 'Closed', color: '#6b7280' },
];

export const RESOLUTION_OPTIONS = [
    { value: 'return_to_warehouse', label: 'Return to Warehouse', icon: 'undo' },
    { value: 'reshipment', label: 'Reshipment', icon: 'local_shipping' },
    { value: 'resolved', label: 'Resolved', icon: 'check_circle' },
    { value: 'cancelled', label: 'Cancelled', icon: 'cancel' },
];

// ─── SERVICE ─────────────────────────────────────────────────────────

const ticketsService = {
    getAll: async (params?: Record<string, any>) => {
        const queryStr = params ? '?' + new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => [k, String(v)])
        ).toString() : '';
        const { data } = await apiClient.get(`/tickets${queryStr}`);
        return data;
    },

    getById: async (id: string): Promise<Ticket> => {
        const { data } = await apiClient.get(`/tickets/${id}`);
        return data;
    },

    create: async (dto: Partial<Ticket>): Promise<Ticket> => {
        const { data } = await apiClient.post('/tickets', dto);
        return data;
    },

    update: async (id: string, dto: Partial<Ticket>): Promise<Ticket> => {
        const { data } = await apiClient.patch(`/tickets/${id}`, dto);
        return data;
    },

    updateStatus: async (id: string, status: string): Promise<Ticket> => {
        const { data } = await apiClient.patch(`/tickets/${id}/status`, { status });
        return data;
    },

    resolve: async (id: string, resolution: string): Promise<Ticket> => {
        const { data } = await apiClient.patch(`/tickets/${id}/resolve`, { resolution });
        return data;
    },

    assign: async (id: string, picId: string, picName?: string): Promise<Ticket> => {
        const { data } = await apiClient.patch(`/tickets/${id}/assign`, { picId, picName });
        return data;
    },

    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/tickets/${id}`);
    },

    getStats: async (): Promise<TicketStats> => {
        const { data } = await apiClient.get('/tickets/stats');
        return data;
    },

    getWorkflows: async (): Promise<IncidentWorkflow[]> => {
        const { data } = await apiClient.get('/tickets/workflows');
        return data;
    },

    updateWorkflow: async (caseType: string, body: Partial<IncidentWorkflow>): Promise<IncidentWorkflow> => {
        const { data } = await apiClient.patch(`/tickets/workflows/${caseType}`, body);
        return data;
    },

    addTimelineEvent: async (ticketId: string, body: { eventType: string; channel?: string; content?: string; externalRef?: string }) => {
        const { data } = await apiClient.post(`/tickets/${ticketId}/timeline`, body);
        return data;
    },

    sync: async () => {
        const { data } = await apiClient.post('/tickets/sync');
        return data;
    },
};

export default ticketsService;
