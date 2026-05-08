import React, { useState, useEffect } from 'react';

interface PORecommendationModalProps {
    isOpen: boolean;
    productId: string;
    warehouseId: string;
    onClose: () => void;
}

const PORecommendationModal: React.FC<PORecommendationModalProps> = ({ isOpen, productId, warehouseId, onClose }) => {
    const [rec, setRec] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Editable Fields
    const [poQty, setPoQty] = useState(0);
    const [supplierId, setSupplierId] = useState('');
    const [unitCost, setUnitCost] = useState(0);
    
    // System lookups
    const [suppliers, setSuppliers] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen && productId && warehouseId) {
            fetchRecommendation();
            fetchSuppliers();
        }
    }, [isOpen, productId, warehouseId]);

    const fetchRecommendation = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`http://localhost:3000/purchase-orders/recommend?productId=${productId}&warehouseId=${warehouseId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRec(data);
                setPoQty(data.recommendedQty);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`http://localhost:3000/suppliers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data.data || []);
            }
        } catch (err) { }
    };

    const handleCreatePO = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`http://localhost:3000/purchase-orders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId,
                    warehouseId,
                    orderDate: new Date().toISOString(),
                    items: [
                        { productId, quantity: poQty, unitCost }
                    ]
                })
            });

            if (res.ok) {
                alert('PO Created Successfully!');
                onClose();
            } else {
                alert('Failed to create PO');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to create PO');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface-lowest border border-border-dark rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col max-h-[90vh]">
                <h3 className="text-xl font-black text-on-surface mb-2">PO Recommendation Engine</h3>
                
                {loading || !rec ? (
                    <div className="text-on-surface my-8 text-center">Loading calculations...</div>
                ) : (
                    <div className="overflow-y-auto custom-scrollbar flex-1 pr-2 space-y-6">
                        <div className="bg-surface-high rounded-xl p-4 border border-outline-variant">
                            <h4 className="text-xs font-bold text-on-surface-variant uppercase mb-3 text-center">Algorithm Output</h4>
                            <div className="flex justify-around items-center text-center">
                                <div>
                                    <div className="text-on-surface text-lg font-black">{rec.avgDailyOrders}</div>
                                    <div className="text-[10px] text-text-muted mt-1 uppercase">Avg Daily Out</div>
                                </div>
                                <div>
                                    <div className="text-blue-400 text-lg font-black">{rec.currentAvailable + rec.expectedReturns}</div>
                                    <div className="text-[10px] text-blue-400/70 mt-1 uppercase">Total Float</div>
                                </div>
                                <div>
                                    <div className="text-primary text-xl font-black px-2">{rec.recommendedQty}</div>
                                    <div className="text-[10px] text-primary/70 mt-1 uppercase font-bold">Recommended</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase">Final PO Quantity</label>
                                <input 
                                    type="number"
                                    min="1"
                                    value={poQty}
                                    onChange={(e) => setPoQty(Number(e.target.value))}
                                    className="bg-surface-low border-outline-variant text-on-surface text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase">Unit Cost ($)</label>
                                    <input 
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={unitCost}
                                        onChange={(e) => setUnitCost(Number(e.target.value))}
                                        className="bg-surface-low border-outline-variant text-on-surface text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase">Supplier</label>
                                    <select 
                                        value={supplierId}
                                        onChange={(e) => setSupplierId(e.target.value)}
                                        className="bg-surface-low border-outline-variant text-on-surface text-sm rounded-xl w-full h-12 px-4 focus:ring-primary/40 focus:border-primary"
                                    >
                                        <option value="">Select Supplier...</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{s.name || s.companyName}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-3 mt-6 pt-4 border-t border-border-dark">
                    <button 
                        onClick={onClose}
                        className="flex-[0.3] px-4 py-2 border border-outline-variant text-on-surface rounded-xl text-sm font-bold hover:bg-surface-high transition-colors"
                    >
                        Close
                    </button>
                    <button 
                        onClick={handleCreatePO}
                        disabled={saving || loading || !supplierId || poQty <= 0}
                        className="flex-[0.7] px-4 py-2 bg-primary hover:bg-primary/90 text-on-surface rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? 'Creating...' : 'Issue Purchase Order'}
                        <span className="material-symbols-outlined text-sm">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PORecommendationModal;
