import apiClient from './apiClient';

export const authService = {
    async login(credentials: any) {
        const response = await apiClient.post('/auth/login', credentials);
        if (response.data.access_token) {
            localStorage.setItem('authToken', response.data.access_token);
        }
        return response.data;
    },

    logout() {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
    },

    getToken() {
        return localStorage.getItem('authToken');
    },

    isAuthenticated() {
        return !!this.getToken();
    }
};
