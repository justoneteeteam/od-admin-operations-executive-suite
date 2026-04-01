import apiClient from './apiClient';

export const inventoryService = {
    async getStock(warehouseId?: string) {
        const params: any = {};
        if (warehouseId && warehouseId !== 'all') params.warehouseId = warehouseId;
        const response = await apiClient.get('/inventory/stock', { params });
        return response.data;
    },

    async getProductSummary(productId: string) {
        const response = await apiClient.get(`/inventory/summary/${productId}`);
        return response.data;
    },

    async getTransactions(warehouseId?: string, productId?: string) {
        const params: any = {};
        if (warehouseId && warehouseId !== 'all') params.warehouseId = warehouseId;
        if (productId) params.productId = productId;
        const response = await apiClient.get('/inventory/transactions', { params });
        return response.data;
    },

    async getDashboard(warehouseId?: string) {
        const params: any = {};
        if (warehouseId && warehouseId !== 'all') params.warehouseId = warehouseId;
        const response = await apiClient.get('/inventory/dashboard', { params });
        return response.data;
    },

    async adjustStock(data: {
        productId: string;
        warehouseId: string;
        quantity: number;
        reason: string;
        userId?: string;
        type?: string;
        partnerSku?: string;
    }) {
        const response = await apiClient.post('/inventory/adjust', data);
        return response.data;
    },

    async getWarehouses() {
        const response = await apiClient.get('/inventory/warehouses');
        return response.data;
    },

    async getPlanning(warehouseId?: string) {
        const params: any = {};
        if (warehouseId && warehouseId !== 'all') params.warehouseId = warehouseId;
        const response = await apiClient.get('/inventory/planning', { params });
        return response.data;
    },

    async getReports() {
        const response = await apiClient.get('/inventory/reports');
        return response.data;
    },
};
