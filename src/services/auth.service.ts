import apiClient from './apiClient';
import type { UserRole } from '../config/roleConfig';

export interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
}

export const authService = {
    async login(credentials: any) {
        const response = await apiClient.post('/auth/login', credentials);
        if (response.data.access_token) {
            localStorage.setItem('authToken', response.data.access_token);
        }
        if (response.data.user) {
            localStorage.setItem('authUser', JSON.stringify(response.data.user));
        }
        return response.data;
    },

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        window.location.href = '/login';
    },

    getToken() {
        return localStorage.getItem('authToken');
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    getUser(): AuthUser | null {
        const stored = localStorage.getItem('authUser');
        if (!stored) return null;
        try {
            return JSON.parse(stored) as AuthUser;
        } catch {
            return null;
        }
    },

    getRole(): UserRole {
        return this.getUser()?.role ?? 'CS';
    },
};
