import apiClient from './apiClient';

import { Purchase, PurchaseItem } from '../../types';

// Purchase interface imported from types

export const purchasesService = {
    async getAll(params?: any) {
        const response = await apiClient.get('/purchases', { params });
        return response.data;
    },

    async getById(id: string) {
        const response = await apiClient.get(`/purchases/${id}`);
        return response.data;
    },

    async create(data: any) {
        const response = await apiClient.post('/purchases', data);
        return response.data;
    },

    async update(id: string, data: any) {
        const response = await apiClient.patch(`/purchases/${id}`, data);
        return response.data;
    },

    async updateStatus(id: string, status: string) {
        const response = await apiClient.patch(`/purchases/${id}/status`, { purchaseStatus: status });
        return response.data;
    },

    async delete(id: string) {
        const response = await apiClient.delete(`/purchases/${id}`);
        return response.data;
    },

    async deleteMany(ids: string[]) {
        const response = await apiClient.post('/purchases/bulk-delete', { ids });
        return response.data;
    },

    async receiveGoods(purchaseId: string, receivedItems: Array<{
        purchaseItemId: string;
        productId: string;
        quantity: number;
        warehouseId: string;
        partnerSku?: string;
    }>) {
        const response = await apiClient.post(`/purchases/${purchaseId}/receive`, { receivedItems });
        return response.data;
    },

    async getIncomingStock() {
        const response = await apiClient.get('/purchases/incoming-stock');
        return response.data;
    },
};
