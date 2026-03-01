import apiClient from './apiClient';

export interface Customer {
    id: string;
    name: string;
    email?: string;
    phone: string;
    addressLine1?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country: string;
    status?: string;
    ordersCount?: number;
    totalSpent?: number;
    avgRiskScore?: number;
}

export const customersService = {
    async getAll(params?: any) {
        const response = await apiClient.get('/customers', { params });
        return response.data;
    },

    async getById(id: string) {
        const response = await apiClient.get(`/customers/${id}`);
        return response.data;
    },

    async findByPhone(phone: string) {
        const response = await apiClient.get(`/customers/phone/${phone}`);
        return response.data; // Returns customer or null
    },

    async create(data: any) {
        const response = await apiClient.post('/customers', data);
        return response.data;
    },

    async update(id: string, data: any) {
        const response = await apiClient.patch(`/customers/${id}`, data);
        return response.data;
    },

    async delete(id: string) {
        const response = await apiClient.delete(`/customers/${id}`);
        return response.data;
    },

    async bulkBlock(phones: string[], emails: string[]) {
        const response = await apiClient.post('/customers/bulk-block', { phones, emails });
        return response.data;
    },
};
