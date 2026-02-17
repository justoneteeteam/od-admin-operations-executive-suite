
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

async function main() {
    console.log('🔍 Testing Google Sheets Connection with PROVIDED CREDENTIALS...');

    const RAW_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9r0Iv6jOZdGaw\\nJBDCLhuftpWYgUouZvd1hKHOSl3ktdw8rDubyUp19BFBRtDGG/ra4oqBFDN5hVHu\\nfcLyC3BUTGCcfLKk+dUtmiD03NWTsmYsRGHqkOboa7x/IYHyEPhL2o01NEQpThHH\\nNgP4cIuRNgADW0xtx2akXfhmN+5n07TZ8ldnRDw9+L6+Jy3CiFjaLy/EElEoQTdJ\\nCe9al3uOjTtkidru0VxPBblnXcjPSTlYSGk+DjC6lBc6RIPmgArKWhP4O4afpCVS\\n6Cj4tAgfQBW7n0Hd7f+D1noy/2YyaXgA2elORu167XTNsFUxCFIO1aiOoQ/QCUC/\\nBvpHbAwDAgMBAAECggEAUBjjoAwLge8vNY3lLbn+nDCjduSRiIqeUBeTo+KvR1as\\nC0rHWP9k2+4WIzReEGncQfWLevomylfLwyOD4GWIJ3ChEzNs1FFS/ZCp/fwKi/W3\\nQ1YU6tIJT3e+/wgNMUSNNKqzGhZZ+f8nbrGWd6A+rzDYTJKO8YRUCXBM5g0UNO7s\\ndP2Gv4Bg4hXTXyxzB1fHY1XE7gtBu4VLvOW3bR83uS7MxHiOAfsHeEnOg4f6avh0\\nG11/akbuKrQZ77F/OGhTRF7a3vynPBMd9UJLMuY5SGv+BQ8wBstC3r7tIIbKMIEk\\nTKfA8BWDykOwmCPFEbn8+ZuMkxU1CvtMXeerSWkFkQKBgQDpS9CStWeC8BRLm0ER\\nON6OIqoxWSrYb0aqlhY7IdP7P+w4w+1/zlLuUmQIRyeIFgDjyDI/0ztgixXrmuY3\\nI+q3jzDPycAStJ0GIaBijH4Dd+Yb1XGNgU2oeT2X0h3T9JSuXV60Hm6bkaSgNwhx\\nrDIeolxC1YD+uD4W5jnb5h3UbwKBgQDQJO9H/Nr2cjjWoEhZvcq8UAzwBoPwB3Nx\\nWkM8wJMOtOE6ZYGGYKonIkUDKnm6FRO5v4Ize+WWdyUskWe+1sD0KnjYvz1JeEMa\\nKB63hKzBte/i/CpKUEYv6VWF3AHBr1d9mdK9he0wvaUpXLm2b7LbdGNJbdih/fHD\\nSLbVEZTTrQKBgD73+KbwkazU0hWKJSjZ2bAxiRBiyd67Qi6e7gct3UKOgVrc/0ik\\nztuGn3tggToI/lp82ZtCj19CizsZhxPQ/PRokLs08EPcPhm+j8SpuQWEojZXCRwx\\nj11uxAIrc2OXO15I01v4btBMokugLwZHfQuptQ9RA009O30AzRMebGS/AoGBAMO2\\npwPifyUSG9270qwHaLUO9EtRZQfyiZtBC035qY0/iTQ2s8bd58BqWcfzTYgqP2T9\\n7Php/GQx3dN9Wba5Ca/Mq9rqXz9RBI94wAFBkIuIfmrJPx6nQofUeCUozMIJFFQ2\\nqlCouHGHMOCmnr0rZFszohQuZG9Vb9l26uuH34/1AoGASWSZhCSnpw/O4E+MuWQD\\nOxK0PDIrZijfPXfHT4xpldIl4MeACF44OHYuKXi0QYOPC6vdXDHv4varlwc4nY1g\\n6t3NenUIWb2QrYI/G/yGRa1SE5265gaYgK/mugLbImlvW2Vr9BBfj+d0+Lqs9T/F\\nfr8Ws5r6Wme3gHloNJtVd3A=\\n-----END PRIVATE KEY-----\\n";

    // Replicate sanitization logic from backend service
    let sanitizedKey = RAW_PRIVATE_KEY;
    if (sanitizedKey.startsWith('"') && sanitizedKey.endsWith('"')) {
        sanitizedKey = sanitizedKey.slice(1, -1);
    }
    sanitizedKey = sanitizedKey.replace(/\\n/g, '\n');

    const CREDENTIALS = {
        spreadsheetId: '15CYeHIyqc4zF8VJOLeO0ZxPA2WuDeNO48A6x0A3Ig2s',
        clientEmail: 'sheets-sync@codsytem.iam.gserviceaccount.com',
        privateKey: sanitizedKey,
        sheetTabName: 'Sheet1'
    };

    console.log(`   Spreadsheet ID: ${CREDENTIALS.spreadsheetId}`);
    console.log(`   Client Email: ${CREDENTIALS.clientEmail}`);
    console.log(`   Original Key Length: ${RAW_PRIVATE_KEY.length}`);
    console.log(`   Sanitized Key Length: ${CREDENTIALS.privateKey.length}`);
    console.log(`   Sanitized Key Starts With: ${CREDENTIALS.privateKey.substring(0, 30).replace(/\n/g, '\\n')}...`);

    try {
        console.log('🔄 Attempting to authenticate with Google...');
        // 2. Authenticate
        const auth = new JWT({
            email: CREDENTIALS.clientEmail,
            key: CREDENTIALS.privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const doc = new GoogleSpreadsheet(CREDENTIALS.spreadsheetId, auth);

        console.log('🔄 Loading spreadsheet info...');
        await doc.loadInfo();

        console.log(`✅ CONNECTION SUCCESSFUL!`);
        console.log(`   Document Title: ${doc.title}`);
        console.log(`   Sheet Count: ${doc.sheetCount}`);

        const sheet = doc.sheetsByTitle[CREDENTIALS.sheetTabName];
        if (sheet) {
            console.log(`   Target Sheet "${CREDENTIALS.sheetTabName}" FOUND.`);
            console.log(`   Rows: ${sheet.rowCount}`);
            console.log(`   Columns: ${sheet.columnCount}`);
        } else {
            console.error(`❌ Target Sheet "${CREDENTIALS.sheetTabName}" NOT FOUND.`);
            console.log('   Available Sheets:');
            doc.sheetsByIndex.forEach(s => console.log(`   - ${s.title}`));
        }

    } catch (error: any) {
        console.error('❌ Google Sheets Connection Failed:');
        console.error(error.message);
        if (error.response) {
            console.error('   Response Data:', error.response.data);
        }
    }
}

main().catch(console.error);
