import apiClient from './apiClient';

export interface Warehouse {
    id: string;
    name: string;
    location?: string;
    fulfillmentCenterId: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface FulfillmentCenter {
    id: string;
    name: string;
    code: string;
    country: string;
    city: string;
    addressLine1: string;
    addressLine2?: string;
    postalCode?: string;
    personInCharge: string;
    contactEmail?: string;
    contactPhone?: string;
    capacity?: number;
    currentLoad?: number;
    utilizationPercent?: number;
    status: string;
    avgFulfillmentTimeHours?: number;
    onTimeDeliveryRate?: number;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
    _count?: {
        orders: number;
        products: number;
        purchases: number;
    };
    warehouses?: Warehouse[];
}

export const fulfillmentService = {
    async getAll() {
        const response = await apiClient.get('/fulfillment-centers');
        return response.data;
    },

    async getById(id: string) {
        const response = await apiClient.get(`/fulfillment-centers/${id}`);
        return response.data;
    },

    async create(data: Partial<FulfillmentCenter>) {
        const response = await apiClient.post('/fulfillment-centers', data);
        return response.data;
    },

    async update(id: string, data: Partial<FulfillmentCenter>) {
        const response = await apiClient.patch(`/fulfillment-centers/${id}`, data);
        return response.data;
    },

    async delete(id: string) {
        const response = await apiClient.delete(`/fulfillment-centers/${id}`);
        return response.data;
    },
};
