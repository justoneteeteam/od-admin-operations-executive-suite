import axios from 'axios';
import fs from 'fs';

async function testPerformancePageLogic() {
    try {
        const res = await axios.get('http://localhost:3000/orders?page=1&limit=500');
        const data = res.data;
        const orders = data?.data || (Array.isArray(data) ? data : []);
        console.log(`Loaded ${orders.length} orders.`);

        // 1. filtered
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const filtered = orders.filter((o: any) => {
            const d = new Date(o.orderDate);
            if (d < from || d > to) return false;
            return true;
        });
        console.log(`Filtered: ${filtered.length} orders.`);

        // 2. countries
        const set = new Set(orders.map((o: any) => o.shippingCountry).filter(Boolean));
        const countries = ['All', ...Array.from(set).sort()];
        console.log(`Countries: ${countries.length}`);

        // 3. metrics
        const totalLeads = filtered.length;
        const confirmLeads = filtered.filter((o: any) => o.confirmationStatus === 'Confirmed').length;
        const rejectLeads = filtered.filter((o: any) => ['Cancelled', 'Declined'].includes(o.confirmationStatus || '')).length;
        console.log(`Metrics: Leads ${totalLeads}, Confirm ${confirmLeads}`);

        // 4. topSkus
        const map = new Map();
        for (const o of filtered) {
            for (const item of o.items || []) {
                const key = item.sku || item.productName;
                const existing = map.get(key) || { name: item.productName, sku: item.sku, leads: 0, orders: 0, revenue: 0, returns: 0 };
                existing.leads += 1;
                if (o.confirmationStatus === 'Confirmed') existing.orders += 1;
                if (o.confirmationStatus === 'Confirmed') existing.revenue += (item.unitPrice || 0) * (item.quantity || 1);
                if (o.orderStatus === 'Undelivered') existing.returns += 1;
                map.set(key, existing);
            }
        }
        const topSkus = Array.from(map.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
        console.log(`Top SKUs: ${topSkus.length}`);

        // 5. dailyData
        const dailyMap = new Map();
        for (const o of filtered) {
            const day = o.orderDate?.split('T')[0] || '';
            dailyMap.set(day, (dailyMap.get(day) || 0) + (o.totalAmount || 0));
        }
        const dailyData = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
        console.log(`Daily data points: ${dailyData.length}`);

        // Market Share
        const cMap = new Map();
        for (const o of filtered) {
            if (o.confirmationStatus === 'Confirmed') {
                cMap.set(o.shippingCountry || 'Unknown', (cMap.get(o.shippingCountry || 'Unknown') || 0) + (o.totalAmount || 0));
            }
        }
        const sorted = Array.from(cMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        console.log(`Market Share sorted: ${sorted.length}`);

        console.log("All logic passed without throwing!");
    } catch (e: any) {
        console.error("Crash detected:");
        console.error(e.message);
        console.error(e.stack);
    }
}

testPerformancePageLogic();
