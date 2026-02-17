
import React, { useState } from 'react';
import { authService } from '../src/services/auth.service';

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('admin@cod.com');
  const [password, setPassword] = useState('password123');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await authService.login({ email, password });
      onLogin();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-pattern text-white font-display min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary size-14 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 mb-4">
            <span className="material-symbols-outlined text-white text-3xl">inventory_2</span>
          </div>
          <h1 className="text-white text-2xl font-black tracking-tight uppercase">COD Admin</h1>
          <p className="text-text-muted text-sm mt-1">Management Operations System</p>
        </div>

        <div className="backdrop-blur-xl bg-card-dark/80 border border-border-dark rounded-2xl p-8 shadow-2xl">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white">Sign In</h2>
            <p className="text-text-muted text-sm mt-1">Enter your credentials to access the dashboard.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-muted ml-1" htmlFor="email">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[20px]">mail</span>
                </div>
                <input
                  className="block w-full pl-10 pr-3 py-3 bg-card-dark border border-border-dark rounded-xl text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm disabled:opacity-50"
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-text-muted ml-1" htmlFor="password">Password</label>
                <a className="text-xs font-bold text-primary hover:underline transition-all" href="#">Forgot Password?</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined text-[20px]">lock</span>
                </div>
                <input
                  className="block w-full pl-10 pr-3 py-3 bg-card-dark border border-border-dark rounded-xl text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm disabled:opacity-50"
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-center">
              <input className="w-4 h-4 text-primary bg-card-dark border-border-dark rounded focus:ring-primary/50 focus:ring-offset-0 transition-all cursor-pointer" id="remember" type="checkbox" />
              <label className="ml-2 text-sm font-medium text-text-muted cursor-pointer select-none" htmlFor="remember">Remember this device</label>
            </div>

            <button
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={isLoading}
            >
              <span>{isLoading ? 'Signing in...' : 'Login'}</span>
              {!isLoading && <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-8">
          © 2024 COD Operations Management. All rights reserved.<br />
          <span className="inline-block mt-2">Secure encrypted session active.</span>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
