import apiClient from './apiClient';

export interface Product {
    id: string;
    name: string;
    sku: string;
    description?: string;
    unitCost: number;
    sellingPrice: number;
    stockLevel: number;
    stockStatus: string;
    category?: string;
    supplierId?: string;
    fulfillmentCenterId?: string;
    supplier?: any;
    fulfillmentCenter?: any;
}

export const productsService = {
    async getAll(params?: any) {
        const response = await apiClient.get('/products', { params });
        return response.data;
    },

    async getById(id: string) {
        const response = await apiClient.get(`/products/${id}`);
        return response.data;
    },

    async create(data: any) {
        const response = await apiClient.post('/products', data);
        return response.data;
    },

    async update(id: string, data: any) {
        const response = await apiClient.patch(`/products/${id}`, data);
        return response.data;
    },

    async delete(id: string) {
        const response = await apiClient.delete(`/products/${id}`);
        return response.data;
    },
};
