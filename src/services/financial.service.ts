import apiClient from './apiClient';

export interface FinancialRecord {
    id: string;
    date: string;
    description: string;
    category: string;
    market: string | null;
    amountEur: number;
    amountVnd: number | null;
    exchangeRate: number | null;
    source: string;
    orderId: string | null;
    fulfillmentCenterId: string | null;
    invoiceUploadId: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    order?: { id: string; orderNumber: string } | null;
    fulfillmentCenter?: { id: string; name: string } | null;
}

export interface RecordsSummary {
    totalEur: number;
    totalVnd: number;
    byCategory: Record<string, number>;
    recordCount: number;
}

export interface UploadResult {
    uploadId: string;
    rows: any[];
    summary: {
        total: number;
        matched: number;
        unmatched: number;
        totalAmountEur: number;
    };
}

export interface ImportResult {
    imported: number;
    updatedOrders: number;
}

export const financialService = {
    // ─── Records ─────────────────────────────────────────────────
    async getRecords(filters?: {
        month?: string;
        category?: string;
        market?: string;
        source?: string;
    }): Promise<FinancialRecord[]> {
        const params = new URLSearchParams();
        if (filters?.month) params.set('month', filters.month);
        if (filters?.category) params.set('category', filters.category);
        if (filters?.market) params.set('market', filters.market);
        if (filters?.source) params.set('source', filters.source);
        const response = await apiClient.get(`/financial/records?${params.toString()}`);
        return response.data;
    },

    async createRecord(data: {
        date: string;
        description: string;
        category: string;
        market?: string;
        amountEur?: number;
        amountVnd?: number;
        exchangeRate?: number;
        source?: string;
        orderId?: string;
        fulfillmentCenterId?: string;
        notes?: string;
    }): Promise<FinancialRecord> {
        const response = await apiClient.post('/financial/records', data);
        return response.data;
    },

    async bulkCreate(records: any[]): Promise<{ importedCount: number }> {
        const response = await apiClient.post('/financial/records/bulk', { records });
        return response.data;
    },

    async getRecordsSummary(filters?: {
        month?: string;
        market?: string;
    }): Promise<RecordsSummary> {
        const params = new URLSearchParams();
        if (filters?.month) params.set('month', filters.month);
        if (filters?.market) params.set('market', filters.market);
        const response = await apiClient.get(`/financial/records/summary?${params.toString()}`);
        return response.data;
    },

    // ─── Utility ─────────────────────────────────────────────────
    async getLatestExchangeRate(): Promise<{ vndToEur: number } | null> {
        const response = await apiClient.get('/financial/exchange-rate');
        return response.data;
    },

    async getUniqueSources(): Promise<string[]> {
        const response = await apiClient.get('/financial/sources');
        return response.data;
    },

    // ─── Invoice Upload & Import ─────────────────────────────────
    async uploadInvoice(
        file: File,
        fulfillmentCenterId: string,
        periodMonth?: string,
        invoiceType?: string,
    ): Promise<UploadResult> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fulfillment_center_id', fulfillmentCenterId);
        if (periodMonth) formData.append('period_month', periodMonth);
        if (invoiceType) formData.append('invoice_type', invoiceType);

        const response = await apiClient.post('/financial/invoices/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    async importInvoice(uploadId: string): Promise<ImportResult> {
        const response = await apiClient.post(`/financial/invoices/${uploadId}/import`);
        return response.data;
    },
};
