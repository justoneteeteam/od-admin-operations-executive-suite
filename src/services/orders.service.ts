import apiClient from './apiClient';
import storeSettingsService, { StoreName } from './settings.service';

export interface OrderItem {
    id?: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number;
    subtotal: number;
}

export interface Order {
    id: string;
    orderNumber: string;
    customerId: string;
    storeId: string;
    storeName?: string;
    shippingAddressLine1: string;
    shippingAddressLine2?: string;
    shippingCity: string;
    shippingProvince?: string;
    shippingCountry: string;
    shippingPostalCode?: string;
    orderStatus: string; // Renamed from status
    confirmationStatus?: string;
    paymentStatus?: string;
    subtotal: number;
    shippingFee?: number; // Renamed from shippingCost
    taxCollected?: number;
    discountGiven?: number;
    totalAmount: number;
    orderDate: string;
    items?: OrderItem[];
    customer?: any;
    fulfillmentCenterId?: string;
    fulfillmentCenter?: {
        id: string;
        name: string;
        code: string;
        country: string;
        city: string;
    };
    trackingNumber?: string;
    courier?: string;
    notes?: string;
}

export const ordersService = {
    async getAll(params?: any) {
        const response = await apiClient.get('/orders', { params });
        return response.data;
    },

    async getById(id: string) {
        const response = await apiClient.get(`/orders/${id}`);
        return response.data;
    },

    async create(data: any) {
        const response = await apiClient.post('/orders', data);
        return response.data;
    },

    async update(id: string, data: any) {
        const response = await apiClient.patch(`/orders/${id}`, data);
        return response.data;
    },

    async updateStatus(id: string, orderStatus: string) {
        const response = await apiClient.patch(`/orders/${id}/status`, { orderStatus });
        return response.data;
    },

    async delete(id: string) {
        const response = await apiClient.delete(`/orders/${id}`);
        return response.data;
    },

    // Get store names for dropdown
    async getStoreNames(): Promise<StoreName[]> {
        return storeSettingsService.getStoreNames();
    },
};

