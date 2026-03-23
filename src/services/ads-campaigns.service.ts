import apiClient from './apiClient';

export interface AdsCampaign {
    id: string;
    date: string;
    campaign: string;
    country?: string;
    platform?: string;
    sku?: string;
    stage?: string;
    pic?: string;
    spendVnd: number;
    spendEur?: number;
    revenueEur?: number;
    leads?: number;
    orders?: number;
    roas?: number;
    cpo?: number;
    cpl?: number;
    cvr?: number;
    notes?: string;
    source?: string;
    // Meta Ads fields
    adName?: string;
    adSetName?: string;
    cpc?: number;
    cpm?: number;
    ctr?: number;
    resultType?: string;
    costPerResult?: number;
    metaPurchases?: number;
    reportStart?: string;
    reportEnd?: string;
    orderIds?: string;  // semicolon-separated order numbers e.g. "#1234;#1235"
    orderNumber?: string;
}

export interface ExchangeRate {
    id: string;
    date: string;
    vndToEur: number;
}

export interface DashboardData {
    kpis: {
        totalSpendVnd: number;
        totalSpendEur: number;
        totalRevenue: number;
        totalLeads: number;
        totalOrders: number;
        roas: number;
        cpo: number;
        cpl: number;
        cvr: number;
    };
    campaigns: AdsCampaign[];
    chartData: { date: string; spendEur: number; revenue: number; leads: number; orders: number }[];
}

export interface ChangeLogEntry {
    id: string;
    fieldName: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    createdAt: string;
}

export const adsCampaignsService = {
    async getAll(params?: { country?: string; stage?: string; sku?: string; startDate?: string; endDate?: string }) {
        const response = await apiClient.get('/ads-campaigns', { params });
        return response.data as AdsCampaign[];
    },

    async getDashboard(params?: { country?: string; stage?: string; sku?: string; startDate?: string; endDate?: string }) {
        const response = await apiClient.get('/ads-campaigns/dashboard', { params });
        return response.data as DashboardData;
    },

    async create(data: Partial<AdsCampaign>) {
        const response = await apiClient.post('/ads-campaigns', data);
        return response.data;
    },

    async bulkCreate(records: Partial<AdsCampaign>[]) {
        const response = await apiClient.post('/ads-campaigns/bulk', { records });
        return response.data;
    },

    async update(id: string, data: Partial<AdsCampaign>) {
        const response = await apiClient.patch(`/ads-campaigns/${id}`, data);
        return response.data;
    },

    async remove(id: string) {
        const response = await apiClient.delete(`/ads-campaigns/${id}`);
        return response.data;
    },

    async bulkDelete(ids: string[]) {
        const response = await apiClient.post('/ads-campaigns/bulk-delete', { ids });
        return response.data;
    },

    async getChangeLog(id: string) {
        const response = await apiClient.get(`/ads-campaigns/${id}/changelog`);
        return response.data as ChangeLogEntry[];
    },
};

export const exchangeRatesService = {
    async getAll() {
        const response = await apiClient.get('/exchange-rates');
        return response.data as ExchangeRate[];
    },

    async upsert(date: string, vndToEur: number) {
        const response = await apiClient.post('/exchange-rates', { date, vndToEur });
        return response.data;
    },

    async bulkUpsert(rates: { date: string; vndToEur: number }[]) {
        const response = await apiClient.post('/exchange-rates/bulk', { rates });
        return response.data;
    },

    async remove(id: string) {
        const response = await apiClient.delete(`/exchange-rates/${id}`);
        return response.data;
    },
};
