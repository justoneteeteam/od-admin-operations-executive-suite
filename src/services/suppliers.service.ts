import apiClient from './apiClient';

export interface Supplier {
    id: string;
    name: string;
    companyName: string;
    supplierCode?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    country: string;
    postalCode?: string;
    paymentTerms?: string;
    currency?: string;
    taxId?: string;
    bankName?: string;
    bankAccount?: string;
    rating?: number;
    totalOrders?: number;
    onTimeDeliveryRate?: number;
    qualityRating?: number;
    status: string;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
    _count?: {
        products: number;
        purchases: number;
    };
}

export const suppliersService = {
    async getAll() {
        const response = await apiClient.get('/suppliers');
        return response.data;
    },

    async getById(id: string) {
        const response = await apiClient.get(`/suppliers/${id}`);
        return response.data;
    },

    async create(data: Partial<Supplier>) {
        const response = await apiClient.post('/suppliers', data);
        return response.data;
    },

    async update(id: string, data: Partial<Supplier>) {
        const response = await apiClient.patch(`/suppliers/${id}`, data);
        return response.data;
    },

    async delete(id: string) {
        const response = await apiClient.delete(`/suppliers/${id}`);
        return response.data;
    },
};
