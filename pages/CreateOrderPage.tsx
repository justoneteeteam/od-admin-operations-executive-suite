
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersService } from '../src/services/orders.service';
import storeSettingsService, { StoreName } from '../src/services/settings.service';
import { customersService } from '../src/services/customers.service';
import { fulfillmentService, FulfillmentCenter } from '../src/services/fulfillment.service';
import { productsService, Product } from '../src/services/products.service';
import { CustomerSearch } from '../src/components/CustomerSearch';

interface FormLog {
    timestamp: string;
    action: string;
    user: string;
}

const CreateOrderPage: React.FC = () => {
    const navigate = useNavigate();
    const [orderId] = useState(`#ORD-${Math.floor(10000 + Math.random() * 90000)}`);
    const [orderDate] = useState(new Date().toLocaleString());
    const [logs, setLogs] = useState<FormLog[]>([
        { timestamp: new Date().toLocaleTimeString(), action: 'Draft Created', user: 'Alex Rivera' }
    ]);
    const [fulfillmentCenters, setFulfillmentCenters] = useState<FulfillmentCenter[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [storeNames, setStoreNames] = useState<StoreName[]>([]);

    useEffect(() => {
        fulfillmentService.getAll().then(data => {
            setFulfillmentCenters(Array.isArray(data) ? data : data.data || []);
        }).catch(err => console.error('Failed to load fulfillment centers:', err));

        productsService.getAll().then(data => {
            setProducts(Array.isArray(data) ? data : data.data || []);
        }).catch(err => console.error('Failed to load products:', err));

        storeSettingsService.getStoreNames().then(data => {
            setStoreNames(Array.isArray(data) ? data : []);
        }).catch(err => console.error('Failed to load store names:', err));
    }, []);

    const [formData, setFormData] = useState({
        paymentType: 'COD',
        storeId: '',
        storeName: '',
        customerName: '',
        phoneNumber: '',
        houseNumber: '',
        streetName: '',
        zipCode: '',
        city: '',
        province: '',
        country: 'IT',
        productName: '',
        sku: '',
        quantity: 1,
        unitPrice: 0,
        productId: '',
        notes: '',
        confirmationStatus: 'Pending',
        shippingStatus: 'Processing',
        fulfillmentCenterId: '',
        trackingNumber: '',
        courier: ''
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [showBlockedModal, setShowBlockedModal] = useState(false);

    const totalPrice = useMemo(() => {
        return formData.quantity * formData.unitPrice;
    }, [formData.quantity, formData.unitPrice]);

    const handleInputChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));

        // Auto logging logic for status changes
        if (field === 'confirmationStatus' || field === 'shippingStatus') {
            addLog(`Status updated to ${value}`);
        }
    };

    const addLog = (action: string) => {
        setLogs(prev => [
            ...prev,
            { timestamp: new Date().toLocaleTimeString(), action, user: 'Alex Rivera' }
        ]);
    };

    const validateForm = () => {
        const newErrors: Record<string, string> = {};
        if (!formData.customerName.trim()) newErrors.customerName = 'Full Name is required';
        if (!formData.phoneNumber.trim()) newErrors.phoneNumber = 'Phone Number is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async (createAnother = false) => {
        if (!validateForm()) return;

        setSaving(true);
        setSaveError(null);
        try {
            // Step 1: Check if customer exists by phone
            let customerId;
            try {
                console.log('Checking phone:', formData.phoneNumber);
                const existing = await customersService.findByPhone(formData.phoneNumber);
                console.log('Existing customer found:', existing);

                if (existing) {
                    if (existing.status?.toLowerCase() === 'blocked') {
                        console.log('Customer is blocked. Showing modal.');
                        setShowBlockedModal(true);
                        setSaving(false);
                        return;
                    }
                    customerId = existing.id;
                    addLog(`Linked to existing customer: ${existing.name}`);
                }
            } catch (err) {
                console.warn('Customer lookup failed, proceeding to create...', err);
            }

            // Step 2: Create customer if not found
            if (!customerId) {
                try {
                    const customer = await customersService.create({
                        name: formData.customerName,
                        phone: formData.phoneNumber,
                        addressLine1: [formData.houseNumber, formData.streetName].filter(Boolean).join(', ') || undefined,
                        city: formData.city || undefined,
                        province: formData.province || undefined,
                        country: formData.country,
                        postalCode: formData.zipCode || undefined,
                    });
                    customerId = customer.id;
                } catch (err: any) {
                    if (err.response?.status === 409) {
                        setSaveError('Customer with this phone number already exists.');
                        setSaving(false);
                        return;
                    }
                    throw err;
                }
            }

            // Step 2: Create the order
            const subtotal = formData.quantity * formData.unitPrice;
            await ordersService.create({
                customerId: customerId,
                storeId: formData.storeId || 'default-store',
                storeName: formData.storeName || 'Default Store',
                shippingAddressLine1: [formData.houseNumber, formData.streetName].filter(Boolean).join(', ') || 'N/A',
                shippingCity: formData.city || 'N/A',
                shippingProvince: formData.province || undefined,
                shippingCountry: formData.country,
                shippingPostalCode: formData.zipCode || undefined,
                subtotal,
                totalAmount: subtotal,
                notes: formData.notes || undefined,
                fulfillmentCenterId: formData.fulfillmentCenterId || undefined,
                items: [
                    {
                        productId: formData.productId || undefined,
                        productName: formData.productName || 'Unnamed Product',
                        sku: formData.sku || 'N/A',
                        quantity: formData.quantity,
                        unitPrice: formData.unitPrice,
                        subtotal,
                    },
                ],
            });

            addLog('Order Saved');

            if (createAnother) {
                window.location.reload();
            } else {
                navigate('/orders');
            }
        } catch (err: any) {
            console.error('Failed to create order:', err);
            setSaveError(err?.response?.data?.message || 'Failed to create order. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleExport = () => {
        const csvContent = "data:text/csv;charset=utf-8,"
            + Object.keys(formData).join(",") + "\n"
            + Object.values(formData).join(",");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `order_${orderId}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    return (
        <div className="flex flex-col gap-8 max-w-5xl mx-auto pb-20">
            {/* Page Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('/orders')} className="text-text-muted hover:text-white transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        <span className="text-xs font-bold uppercase tracking-widest">Back to Orders</span>
                    </button>
                </div>
                <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                    <div>
                        <h1 className="text-white text-3xl font-black tracking-tight">Create Order Detail</h1>
                        <p className="text-text-muted text-sm mt-1">Initialize a new fulfillment record in the global pipeline.</p>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button
                            onClick={handleExport}
                            className="flex-1 md:flex-none flex items-center justify-center rounded-xl h-11 px-6 bg-[#233648] text-white text-xs font-bold uppercase tracking-widest border border-[#2d445a] hover:bg-[#2d445a] transition-all"
                        >
                            <span className="material-symbols-outlined mr-2 text-lg">download</span>
                            Export CSV
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">

                    {/* Section 1: Order Information */}
                    <section className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">info</span>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Order Information</h3>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order ID</label>
                                <input
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 font-mono opacity-80"
                                    value={orderId}
                                    readOnly
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order Date</label>
                                <input
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 opacity-80"
                                    value={orderDate}
                                    readOnly
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Payment Type</label>
                                <select
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 focus:ring-primary/40 focus:border-primary"
                                    value={formData.paymentType}
                                    onChange={(e) => handleInputChange('paymentType', e.target.value)}
                                >
                                    <option value="COD">Cash On Delivery (COD)</option>
                                    <option value="Prepaid">Prepaid / Credit Card</option>
                                </select>
                            </div>
                        </div>
                        <div className="px-6 pb-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Store Name</label>
                                <select
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 focus:ring-primary/40 focus:border-primary appearance-none"
                                    value={formData.storeId}
                                    onChange={(e) => {
                                        const selected = storeNames.find(s => s.id === e.target.value);
                                        setFormData(prev => ({
                                            ...prev,
                                            storeId: e.target.value,
                                            storeName: selected?.storeName || ''
                                        }));
                                    }}
                                >
                                    <option value="">Select Store...</option>
                                    {storeNames.map(s => (
                                        <option key={s.id} value={s.id}>{s.storeName}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Customer Information */}
                    <section className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">person</span>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Customer Information</h3>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Customer Name <span className="text-red-500">*</span></label>
                                    <CustomerSearch
                                        value={formData.customerName}
                                        onChange={(val) => handleInputChange('customerName', val)}
                                        onSelect={(customer) => {
                                            setFormData(prev => ({
                                                ...prev,
                                                customerName: customer.name,
                                                phoneNumber: customer.phone,
                                                streetName: customer.addressLine1 || '',
                                                city: customer.city || '',
                                                country: customer.country || 'IT',
                                                zipCode: customer.postalCode || '',
                                                province: customer.province || ''
                                            }));
                                        }}
                                        placeholder="Enter customer name"
                                    />
                                    {errors.customerName && <p className="text-[10px] text-red-500 ml-1">{errors.customerName}</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Phone Number <span className="text-red-500">*</span></label>
                                    <input
                                        className={`bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 focus:ring-primary/40 ${errors.phoneNumber ? 'border-red-500' : ''}`}
                                        placeholder="+39 --- --- ----"
                                        value={formData.phoneNumber}
                                        onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                                    />
                                    {errors.phoneNumber && <p className="text-[10px] text-red-500 ml-1">{errors.phoneNumber}</p>}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">House Number</label>
                                    <input
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        placeholder="Via/Apt #"
                                        value={formData.houseNumber}
                                        onChange={(e) => handleInputChange('houseNumber', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Street Name</label>
                                    <input
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        placeholder="Via Roma 24"
                                        value={formData.streetName}
                                        onChange={(e) => handleInputChange('streetName', e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Zip Code</label>
                                    <input
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        placeholder="00000"
                                        value={formData.zipCode}
                                        onChange={(e) => handleInputChange('zipCode', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">City</label>
                                    <input
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        placeholder="Roma"
                                        value={formData.city}
                                        onChange={(e) => handleInputChange('city', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Province</label>
                                    <input
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        placeholder="Lazio"
                                        value={formData.province}
                                        onChange={(e) => handleInputChange('province', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Country</label>
                                    <select
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        value={formData.country}
                                        onChange={(e) => handleInputChange('country', e.target.value)}
                                    >
                                        <option value="IT">Italy</option>
                                        <option value="ES">Spain</option>
                                        <option value="PT">Portugal</option>
                                        <option value="FR">France</option>
                                        <option value="DE">Germany</option>
                                        <option value="NL">Netherlands</option>
                                        <option value="BE">Belgium</option>
                                        <option value="AT">Austria</option>
                                        <option value="GR">Greece</option>
                                        <option value="PL">Poland</option>
                                        <option value="RO">Romania</option>
                                        <option value="CZ">Czech Republic</option>
                                        <option value="SE">Sweden</option>
                                        <option value="IE">Ireland</option>
                                        <option value="HR">Croatia</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Section 3: Product Information */}
                    <section className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">shopping_cart</span>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Product Information</h3>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Product Name</label>
                                    <select
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 focus:ring-primary/40"
                                        value={formData.productId}
                                        onChange={(e) => {
                                            const selectedProduct = products.find(p => p.id === e.target.value);
                                            if (selectedProduct) {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    productId: selectedProduct.id,
                                                    productName: selectedProduct.name,
                                                    sku: selectedProduct.sku,
                                                    unitPrice: selectedProduct.sellingPrice || selectedProduct.unitCost || 0,
                                                }));
                                            } else {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    productId: '',
                                                    productName: '',
                                                    sku: '',
                                                    unitPrice: 0,
                                                }));
                                            }
                                        }}
                                    >
                                        <option value="">Select Product...</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">SKU</label>
                                    <input
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white/60 text-sm rounded-xl w-full h-11 px-4 font-mono cursor-not-allowed"
                                        placeholder="Auto-filled from product"
                                        value={formData.sku}
                                        readOnly
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Quantity</label>
                                    <input
                                        type="number"
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        value={formData.quantity}
                                        min="1"
                                        onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Unit Price ($)</label>
                                    <input
                                        type="number"
                                        className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                        value={formData.unitPrice}
                                        onChange={(e) => handleInputChange('unitPrice', parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase ml-1">Total Price ($)</label>
                                    <div className="h-11 bg-primary/10 border border-primary/20 rounded-xl flex items-center px-4 text-primary font-black text-lg">
                                        ${totalPrice.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Order Notes (Optional)</label>
                                <textarea
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-24 p-4 focus:ring-primary/40 resize-none"
                                    placeholder="Enter special handling instructions..."
                                    value={formData.notes}
                                    onChange={(e) => handleInputChange('notes', e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                </div>

                {/* Sidebar Sections */}
                <div className="space-y-8">

                    {/* Section 4: Order Status */}
                    <section className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">settings_input_component</span>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Execution Status</h3>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Confirmation</label>
                                <select
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                    value={formData.confirmationStatus}
                                    onChange={(e) => handleInputChange('confirmationStatus', e.target.value)}
                                >
                                    <option value="Pending">Pending</option>
                                    <option value="Confirmed">Confirmed</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="No Answer">No Answer</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Shipping</label>
                                <select
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                    value={formData.shippingStatus}
                                    onChange={(e) => handleInputChange('shippingStatus', e.target.value)}
                                >
                                    <option value="Processing">Processing</option>
                                    <option value="Packed">Packed</option>
                                    <option value="In Transit">In Transit</option>
                                    <option value="Delivered">Delivered</option>
                                    <option value="Returned">Returned</option>
                                </select>
                            </div>
                            <div className="h-px bg-border-dark/50"></div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Fulfillment Center</label>
                                <select
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                    value={formData.fulfillmentCenterId}
                                    onChange={(e) => handleInputChange('fulfillmentCenterId', e.target.value)}
                                >
                                    <option value="">Select Center...</option>
                                    {fulfillmentCenters.map(fc => (
                                        <option key={fc.id} value={fc.id}>{fc.name} — {fc.location}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Tracking Number</label>
                                <input
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4 font-mono"
                                    placeholder="AWB-XXXXX"
                                    value={formData.trackingNumber}
                                    onChange={(e) => handleInputChange('trackingNumber', e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase ml-1">Courier Partner</label>
                                <input
                                    className="bg-[#1c2d3d] border-[#2d445a] text-white text-sm rounded-xl w-full h-11 px-4"
                                    placeholder="Enter courier name"
                                    value={formData.courier}
                                    onChange={(e) => handleInputChange('courier', e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Section 5: Order History Logs */}
                    <section className="bg-card-dark rounded-2xl border border-border-dark overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-border-dark bg-[#14202c] flex items-center gap-2">
                            <span className="material-symbols-outlined text-text-muted">history</span>
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Audit History</h3>
                        </div>
                        <div className="p-6 space-y-5">
                            {logs.map((log, i) => (
                                <div key={i} className="flex gap-4 relative">
                                    {i !== logs.length - 1 && (
                                        <div className="absolute left-[11px] top-6 bottom-[-20px] w-px bg-border-dark"></div>
                                    )}
                                    <div className="z-10 mt-1 size-6 rounded-full bg-[#1c2d3d] border border-border-dark flex items-center justify-center shrink-0">
                                        <div className="size-2 rounded-full bg-primary shadow-sm"></div>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <p className="text-[10px] font-black text-primary tracking-widest uppercase">{log.timestamp}</p>
                                        <p className="text-sm font-bold text-white">{log.action}</p>
                                        <p className="text-[10px] text-text-muted italic opacity-70">Modified by {log.user}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                </div>
            </div>

            {/* Error Display */}
            {saveError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                    <span className="material-symbols-outlined text-red-500">error</span>
                    <p className="text-sm text-red-400">{saveError}</p>
                </div>
            )}

            {/* Footer Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-8 border-t border-border-dark">
                <button
                    onClick={() => navigate('/orders')}
                    disabled={saving}
                    className="flex-1 h-12 bg-[#233648] hover:bg-[#2d445a] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-border-dark disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="flex-1 h-12 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 text-xs font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save & Create Another'}
                </button>
                <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="flex-[2] h-12 bg-primary hover:bg-primary/90 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    {saving ? 'Saving...' : 'Confirm & Save Order'}
                </button>
            </div>
            {/* Blocked Customer Modal */}
            {showBlockedModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#0b111a] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-5 shadow-2xl max-w-sm w-full relative">

                        <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                            <span className="material-symbols-outlined text-4xl text-red-500">block</span>
                        </div>

                        <h3 className="text-xl font-bold text-white tracking-tight">Customer Blocked</h3>

                        <div className="h-1 w-12 bg-white/10 rounded-full mb-4"></div>

                        <button
                            onClick={() => setShowBlockedModal(false)}
                            className="w-full h-11 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-all border border-white/5"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreateOrderPage;
