import apiClient from './apiClient';

export interface LogisticCompany {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    contactPerson?: string;
    email?: string;
    status?: string;
}

export const logisticCompaniesService = {
    async getAll() {
        const response = await apiClient.get('/logistic-companies');
        return response.data as LogisticCompany[];
    },

    async getById(id: string) {
        const response = await apiClient.get(`/logistic-companies/${id}`);
        return response.data as LogisticCompany;
    },

    async create(data: Partial<LogisticCompany>) {
        const response = await apiClient.post('/logistic-companies', data);
        return response.data;
    },

    async update(id: string, data: Partial<LogisticCompany>) {
        const response = await apiClient.patch(`/logistic-companies/${id}`, data);
        return response.data;
    },

    async remove(id: string) {
        const response = await apiClient.delete(`/logistic-companies/${id}`);
        return response.data;
    },
};
