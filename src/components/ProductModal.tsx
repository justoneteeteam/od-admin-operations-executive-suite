import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../../types';
import { productsService } from '../services/products.service';
import { fulfillmentService } from '../services/fulfillment.service';
import { suppliersService } from '../services/suppliers.service';

interface ProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (product: Product) => void;
    productToEdit?: Product | null;
    initialValues?: {
        supplierId?: string;
        fulfillmentCenterId?: string;
    };
}

interface FulfillmentCenter {
    id: string;
    name: string;
    location?: string;
}

interface SupplierOption {
    id: string;
    name: string;
}

export const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose, onSuccess, productToEdit, initialValues }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fulfillmentCenters, setFulfillmentCenters] = useState<FulfillmentCenter[]>([]);
    const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const emptyForm = {
        name: '',
        sku: '',
        description: '',
        category: '',
        unitCost: 0,
        sellingPrice: 0,
        stockLevel: 0,
        reorderPoint: 10,
        fulfillmentCenterId: initialValues?.fulfillmentCenterId || '',
        supplierId: initialValues?.supplierId || '',
        primaryImageUrl: '',
    };

    const [formData, setFormData] = useState(emptyForm);

    useEffect(() => {
        if (isOpen) {
            fetchFulfillmentCenters();
            fetchSuppliers();
            if (productToEdit) {
                setFormData({
                    name: productToEdit.name || '',
                    sku: productToEdit.sku || '',
                    description: (productToEdit as any).description || '',
                    category: (productToEdit as any).category || '',
                    unitCost: Number(productToEdit.unitCost) || 0,
                    sellingPrice: Number((productToEdit as any).sellingPrice) || 0,
                    stockLevel: Number(productToEdit.stockLevel) || 0,
                    reorderPoint: Number(productToEdit.reorderPoint) || 10,
                    fulfillmentCenterId: (productToEdit as any).fulfillmentCenterId || '',
                    supplierId: (productToEdit as any).supplierId || '',
                    primaryImageUrl: (productToEdit as any).primaryImageUrl || '',
                });
                setImagePreview((productToEdit as any).primaryImageUrl || null);
            } else {
                setFormData({
                    ...emptyForm,
                    fulfillmentCenterId: initialValues?.fulfillmentCenterId || '',
                    supplierId: initialValues?.supplierId || ''
                });
                setImagePreview(null);
            }
        }
    }, [isOpen, productToEdit, initialValues]);

    const fetchFulfillmentCenters = async () => {
        try {
            const data = await fulfillmentService.getAll();
            setFulfillmentCenters(Array.isArray(data) ? data : (data.data || []));
        } catch (err) {
            console.error('Failed to fetch fulfillment centers:', err);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const data = await suppliersService.getAll();
            setSuppliers(Array.isArray(data) ? data : (data.data || []));
        } catch (err) {
            console.error('Failed to fetch suppliers:', err);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                setImagePreview(base64);
                setFormData({ ...formData, primaryImageUrl: base64 });
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        setImagePreview(null);
        setFormData({ ...formData, primaryImageUrl: '' });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const payload: any = {
                name: formData.name,
                sku: formData.sku,
                unitCost: formData.unitCost,
                sellingPrice: formData.sellingPrice,
                stockLevel: formData.stockLevel,
                reorderPoint: formData.reorderPoint,
            };
            if (formData.description) payload.description = formData.description;
            if (formData.category) payload.category = formData.category;
            if (formData.fulfillmentCenterId) payload.fulfillmentCenterId = formData.fulfillmentCenterId;
            if (formData.supplierId) payload.supplierId = formData.supplierId;
            if (formData.primaryImageUrl) payload.primaryImageUrl = formData.primaryImageUrl;

            let savedProduct;
            if (productToEdit) {
                savedProduct = await productsService.update(productToEdit.id, payload);
            } else {
                savedProduct = await productsService.create(payload);
            }
            onSuccess(savedProduct);
            onClose();
        } catch (err) {
            console.error('Failed to save product:', err);
            setError('Failed to save product. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const inputClass = 'w-full bg-[#1c2d3d] border border-border-dark rounded-lg p-2.5 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors';
    const labelClass = 'block text-text-muted text-sm font-medium mb-1';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <div className="bg-[#111a22] p-6 rounded-xl border border-border-dark w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
                <h2 className="text-xl font-bold text-white mb-5">
                    {productToEdit ? 'Edit Product' : 'Add New Product'}
                </h2>

                {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Image Upload */}
                    <div>
                        <label className={labelClass}>Product Image</label>
                        <div className="flex items-start gap-4">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-24 h-24 rounded-lg border-2 border-dashed border-border-dark bg-[#1c2d3d] flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden flex-shrink-0"
                            >
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-text-muted">
                                        <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>add_photo_alternate</span>
                                        <span className="text-[10px] mt-1">Upload</span>
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                            <div className="flex flex-col gap-2 flex-1">
                                {imagePreview && (
                                    <button type="button" onClick={removeImage} className="text-red-400 text-xs hover:text-red-300 text-left flex items-center gap-1">
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span> Remove image
                                    </button>
                                )}
                                <div>
                                    <label className="text-text-muted text-xs block mb-1">Or paste image URL:</label>
                                    <input
                                        type="text"
                                        placeholder="https://example.com/image.jpg"
                                        className="w-full bg-[#1c2d3d] border border-border-dark rounded p-1.5 text-white text-xs"
                                        value={formData.primaryImageUrl.startsWith('data:') ? '' : formData.primaryImageUrl}
                                        onChange={(e) => {
                                            setFormData({ ...formData, primaryImageUrl: e.target.value });
                                            setImagePreview(e.target.value || null);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className={labelClass}>Name *</label>
                        <input type="text" required className={inputClass} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                    </div>

                    {/* SKU + Category */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>SKU *</label>
                            <input type="text" required className={inputClass} value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} />
                        </div>
                        <div>
                            <label className={labelClass}>Category</label>
                            <input type="text" className={inputClass} placeholder="e.g. Electronics" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className={labelClass}>Description</label>
                        <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Product description..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                    </div>

                    {/* Fulfillment Center Dropdown */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Fulfillment Center</label>
                            <select className={inputClass} value={formData.fulfillmentCenterId} onChange={(e) => setFormData({ ...formData, fulfillmentCenterId: e.target.value })}>
                                <option value="">— Select Fulfillment Center —</option>
                                {fulfillmentCenters.map((fc) => (
                                    <option key={fc.id} value={fc.id}>{fc.name} {fc.location ? `(${fc.location})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Supplier</label>
                            <select className={inputClass} value={formData.supplierId} onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}>
                                <option value="">— Select Supplier —</option>
                                {suppliers.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Prices */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Unit Cost *</label>
                            <input type="number" step="0.01" required className={inputClass} value={formData.unitCost} onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div>
                            <label className={labelClass}>Selling Price *</label>
                            <input type="number" step="0.01" required className={inputClass} value={formData.sellingPrice} onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })} />
                        </div>
                    </div>

                    {/* Stock */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Stock Level</label>
                            <input type="number" className={inputClass} value={formData.stockLevel} onChange={(e) => setFormData({ ...formData, stockLevel: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div>
                            <label className={labelClass}>Reorder Point</label>
                            <input type="number" className={inputClass} value={formData.reorderPoint} onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })} />
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 justify-end mt-2 pt-4 border-t border-border-dark">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg bg-gray-600 text-white hover:bg-gray-500 font-medium transition-colors">Cancel</button>
                        <button type="submit" disabled={loading} className="px-5 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 font-bold transition-colors disabled:opacity-50">
                            {loading ? 'Saving...' : productToEdit ? 'Save Changes' : 'Create Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
