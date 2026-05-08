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
    spendType: string | null;
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
        spendType?: string;
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

    async updateRecord(id: string, data: Partial<FinancialRecord>): Promise<FinancialRecord> {
        const response = await apiClient.put(`/financial/records/${id}`, data);
        return response.data;
    },

    async deleteRecord(id: string): Promise<{ deleted: true, id: string }> {
        const response = await apiClient.delete(`/financial/records/${id}`);
        return response.data;
    },

    async bulkDeleteRecords(ids: string[]): Promise<{ deletedCount: number }> {
        const response = await apiClient.post('/financial/records/bulk-delete', { ids });
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

    // ─── P&L Report ──────────────────────────────────────────────
    async getPnlReport(year: number): Promise<{
        year: number;
        months: string[];
        data: Array<{
            sale: number; return: number; netSale: number;
            cogs: number; returnCogs: number; netCogs: number;
            storageFee: number; ads: number; fulfillment: number; rnd: number;
            commission: number; transactionFee: number;
            variableCostsTotal: number;
            testingFee: number; people: number; office: number; other: number;
            rateExchange: number; software: number;
            fixedCostsTotal: number;
            totalExpense: number; profitLoss: number;
        }>;
    }> {
        const response = await apiClient.get(`/financial/pnl?year=${year}`);
        return response.data;
    },

    // ─── Fulfillment Center Report ────────────────────────────
    async getFulfillmentReport(month?: string): Promise<{
        month: string;
        centers: Array<{
            fulfillmentCenterId: string;
            fulfillmentCenterName: string;
            fulfillmentCenterCode: string;
            country: string;
            totalOrders: number;
            ordersSent: number;
            ordersDelivered: number;
            ordersReturned: number;
            deliveryRate: number;
            returnRate: number;
            fulfillmentCost: number;
            costPerOrder: number;
            reshipmentCost: number;
            aov: number;
            revenue: number;
            fulfillmentPctRevenue: number;
            profit: number;
        }>;
        totals: {
            totalOrders: number;
            ordersSent: number;
            ordersDelivered: number;
            ordersReturned: number;
            revenue: number;
            fulfillmentCost: number;
            reshipmentCost: number;
            profit: number;
        };
    }> {
        const params = month ? `?month=${month}` : '';
        const response = await apiClient.get(`/financial/fulfillment-report${params}`);
        return response.data;
    },

    // ─── Distribution Geo Report ──────────────────────────────
    async getDistributionReport(filters: {
        type: 'test' | 'actual';
        month?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<{
        type: string;
        kpis: {
            allOrders: number;
            cancelOrders: number;
            confirmedQty: number;
            revenue: number;
            returnRate: number;
        };
        countries: Array<{
            country: string;
            allOrders: number;
            cancelOrders: number;
            confirmedQty: number;
            revenue: number;
            returnRate: number;
            cities: Array<{
                city: string;
                allOrders: number;
                cancelOrders: number;
                confirmedQty: number;
                revenue: number;
                returnRate: number;
                isIsland: boolean;
            }>;
        }>;
        islands: Array<{
            country: string;
            city: string;
            allOrders: number;
            cancelOrders: number;
            confirmedQty: number;
            revenue: number;
            returnRate: number;
        }>;
    }> {
        const params = new URLSearchParams();
        params.set('type', filters.type);
        if (filters.month) params.set('month', filters.month);
        if (filters.startDate) params.set('startDate', filters.startDate);
        if (filters.endDate) params.set('endDate', filters.endDate);
        const response = await apiClient.get(`/financial/distribution-report?${params.toString()}`);
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
