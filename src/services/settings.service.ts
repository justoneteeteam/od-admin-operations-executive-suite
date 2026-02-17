import apiClient from './apiClient';

export interface StoreSettings {
    id: string;
    storeName: string;
    storeUrl?: string;
    supportEmail?: string;
    currency?: string;

    // Google Sheets Integration
    gsProjectId?: string;
    gsClientEmail?: string;
    gsPrivateKey?: string;
    gsSpreadsheetId?: string;
    gsSheetName?: string;
    gsConnected?: boolean;
    gsLastSyncAt?: string;

    createdAt?: string;
    updatedAt?: string;
}

export interface StoreName {
    id: string;
    storeName: string;
}

const storeSettingsService = {
    getAll: async (): Promise<StoreSettings[]> => {
        const { data } = await apiClient.get('/store-settings');
        return data;
    },

    getById: async (id: string): Promise<StoreSettings> => {
        const { data } = await apiClient.get(`/store-settings/${id}`);
        return data;
    },

    create: async (settings: Partial<StoreSettings>): Promise<StoreSettings> => {
        const { data } = await apiClient.post('/store-settings', settings);
        return data;
    },

    update: async (id: string, settings: Partial<StoreSettings>): Promise<StoreSettings> => {
        const { data } = await apiClient.put(`/store-settings/${id}`, settings);
        return data;
    },

    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/store-settings/${id}`);
    },

    // For dropdown usage in other pages
    getStoreNames: async (): Promise<StoreName[]> => {
        const { data } = await apiClient.get('/store-settings/store-names');
        return data;
    },

    sync: async (id: string): Promise<{ success: boolean; ordersCreated: number; errors: string[] }> => {
        const { data } = await apiClient.post(`/store-settings/${id}/sync`);
        return data;
    },
};

export default storeSettingsService;
