import React, { useState, useEffect, useRef } from 'react';
import { customersService, Customer } from '../services/customers.service';

interface CustomerSearchProps {
    value: string; // The display name
    onChange: (value: string) => void; // Called when typing
    onSelect: (customer: Customer) => void; // Called when a customer is chosen
    placeholder?: string;
}

export const CustomerSearch: React.FC<CustomerSearchProps> = ({ value, onChange, onSelect, placeholder = "Search Customer..." }) => {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<Customer[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync external value
    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    useEffect(() => {
        const searchCustomers = async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }
            // Only search if the query is different from the currently selected value (avoid loop on select)
            // But here we rely on user typing.
            // A simple debounce is good.
            setIsLoading(true);
            try {
                // Determine if we are just searching
                const data = await customersService.getAll({ search: query });
                setResults(Array.isArray(data) ? data : data.data || []);
            } catch (err) {
                console.error("Failed to search customers", err);
            } finally {
                setIsLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            if (isOpen) { // Only search if dropdown is meant to be open (interacting)
                searchCustomers();
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query, isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        onChange(val);
        setIsOpen(true);
    };

    const handleSelect = (customer: Customer) => {
        setQuery(customer.name);
        onChange(customer.name);
        onSelect(customer);
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative">
                <input
                    type="text"
                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 focus:ring-primary/40 focus:border-primary transition-all placeholder:text-text-muted/50"
                    placeholder={placeholder}
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                />
                {isLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-[#111a22] border border-[#2d445a] rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                    {results.map((customer) => (
                        <button
                            key={customer.id}
                            onClick={() => handleSelect(customer)}
                            className="w-full text-left px-4 py-3 hover:bg-[#1c2d3d] border-b border-[#2d445a] last:border-0 transition-colors flex flex-col gap-0.5"
                        >
                            <span className="text-sm font-bold text-white">{customer.name}</span>
                            <div className="flex items-center gap-2 text-xs text-text-muted">
                                <span>{customer.phone}</span>
                                {customer.email && (
                                    <>
                                        <span className="size-1 rounded-full bg-text-muted/50"></span>
                                        <span>{customer.email}</span>
                                    </>
                                )}
                            </div>
                            {customer.status === 'Blocked' && (
                                <span className="inline-block mt-1 text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 w-fit">
                                    BLOCKED
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
