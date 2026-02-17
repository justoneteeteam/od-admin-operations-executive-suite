import React, { useState, useEffect, useRef } from 'react';
import { productsService, Product } from '../services/products.service';

interface ProductSearchProps {
    onSelect: (product: Product) => void;
    placeholder?: string;
    className?: string;
}

export const ProductSearch: React.FC<ProductSearchProps> = ({ onSelect, placeholder = "Search Product by name or SKU...", className }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Product[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

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
        const searchProducts = async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }
            setIsLoading(true);
            try {
                const data = await productsService.getAll({ search: query });
                setResults(Array.isArray(data) ? data : data.data || []);
            } catch (err) {
                console.error("Failed to search products", err);
            } finally {
                setIsLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            if (isOpen && query) {
                searchProducts();
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query, isOpen]);

    const handleSelect = (product: Product) => {
        onSelect(product);
        setQuery(''); // Reset query after selection or keep it? Usually reset for "Add new item" flow.
        setIsOpen(false);
        setResults([]);
    };

    return (
        <div ref={wrapperRef} className={`relative w-full ${className}`}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted">
                    <span className="material-symbols-outlined">search</span>
                </div>
                <input
                    type="text"
                    className="w-full h-14 bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl pl-12 pr-4 focus:ring-primary/40 focus:border-primary placeholder:text-text-muted/50"
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {isLoading && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full"></div>
                    </div>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-[#111a22] border border-[#2d445a] rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                    {results.map((product) => (
                        <div
                            role="button"
                            tabIndex={0}
                            key={product.id}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("Product clicked:", product);
                                handleSelect(product);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-[#1c2d3d] border-b border-[#2d445a] last:border-0 transition-colors flex flex-col gap-0.5 cursor-pointer"
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-white">{product.name}</span>
                                <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{product.sku}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-text-muted">
                                <span>Stock: {product.stockLevel}</span>
                                <span>Cost: ${product.unitCost}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
