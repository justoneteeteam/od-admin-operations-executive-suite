import React, { useState } from 'react';
import { Product } from '../../types';

interface WriteOffModalProps {
    isOpen: boolean;
    product: Product;
    warehouseId: string;
    onClose: () => void;
    onSuccess: () => void;
}

const WriteOffModal: React.FC<WriteOffModalProps> = ({ isOpen, product, warehouseId, onClose, onSuccess }) => {
    const [quantity, setQuantity] = useState(1);
    const [reason, setReason] = useState('damaged');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!warehouseId) {
            alert('Warehouse context missing!');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`http://localhost:3000/inventory/write-off`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: product.id,
                    warehouseId,
                    quantity,
                    reason
                })
            });

            if (res.ok) {
                onSuccess();
            } else {
                alert('Failed to process write-off');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to process write-off');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-[#111a22] border border-border-dark rounded-2xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-xl font-black text-white mb-2">Write-Off Stock Location</h3>
                <p className="text-sm text-text-muted mb-6">Record damaged, lost, or compromised inventory for {product.name}</p>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase">Quantity</label>
                        <input 
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-text-muted uppercase">Reason / Notes</label>
                        <select 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                        >
                            <option value="damaged">Damaged Output</option>
                            <option value="lost">Lost in Transit</option>
                            <option value="expired">Expired / Void</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-[#2d445a] text-white rounded-xl text-sm font-bold hover:bg-[#1c2d3d] transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Processing...' : 'Confirm Write-Off'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WriteOffModal;
