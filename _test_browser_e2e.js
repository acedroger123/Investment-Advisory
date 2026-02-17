const http = require('http');

function req(method, path, body) {
    return new Promise((resolve) => {
        const opts = {
            hostname: 'localhost', port: 3000,
            path: path,
            method: method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            timeout: 30000
        };
        const r = http.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                resolve({ status: res.statusCode, data: parsed, headers: res.headers });
            });
        });
        r.on('error', (e) => resolve({ status: 'ERR', data: e.message }));
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

function check(ok, name) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    return ok;
}

async function main() {
    let allPass = true;

    console.log('╔══════════════════════════════════════════╗');
    console.log('║  FULL BROWSER-EQUIVALENT E2E TEST       ║');
    console.log('║  Simulating what the browser does        ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // ── 1. HTML Pages Load ──
    console.log('── 1. HTML PAGES LOAD ──');
    let r = await req('GET', '/goals.html');
    allPass &= check(r.status === 200, `goals.html loads: ${r.status}`);

    r = await req('GET', '/dashboard.html');
    allPass &= check(r.status === 200, `dashboard.html loads: ${r.status}`);

    r = await req('GET', '/transactions.html');
    allPass &= check(r.status === 200, `transactions.html loads: ${r.status}`);

    r = await req('GET', '/portfolio.html');
    allPass &= check(r.status === 200, `portfolio.html loads: ${r.status}`);

    // ── 2. JS Files Load ──
    console.log('\n── 2. JS FILES LOAD ──');
    r = await req('GET', '/js/api.js');
    allPass &= check(r.status === 200, `api.js loads: ${r.status}`);

    r = await req('GET', '/js/goals.js');
    allPass &= check(r.status === 200, `goals.js loads: ${r.status}`);

    r = await req('GET', '/js/dashboard.js');
    allPass &= check(r.status === 200, `dashboard.js loads: ${r.status}`);

    r = await req('GET', '/js/transactions.js');
    allPass &= check(r.status === 200, `transactions.js loads: ${r.status}`);

    // ── 3. API CALLS (what browser JS actually does) ──
    console.log('\n── 3. PROXY API: Goals ──');
    // This is what goals.js does: API.Goals.list() → fetch('/pa-api/goals')
    r = await req('GET', '/pa-api/goals');
    allPass &= check(r.status === 200, `GET /pa-api/goals: ${r.status}`);
    console.log(`     Response: ${JSON.stringify(r.data).substring(0, 80)}`);

    // Create a goal (what goals.js saveGoal does)
    r = await req('POST', '/pa-api/goals', {
        name: 'Browser Test Goal',
        description: 'Simulated browser create',
        target_amount: 200000,
        profit_buffer: 0.10,
        deadline: '2027-12-31',
        risk_preference: 'moderate'
    });
    allPass &= check(r.status === 201, `POST /pa-api/goals (create): ${r.status}`);
    const goalId = r.data?.goal?.id;
    console.log(`     Created goal_id = ${goalId}`);

    // What dashboard.js loadGoals does next
    r = await req('GET', '/pa-api/goals');
    allPass &= check(r.status === 200 && Array.isArray(r.data) && r.data.length > 0,
        `GET /pa-api/goals (with data): ${r.data?.length || 0} goals`);

    // ── 4. PROXY API: Dashboard Data ──
    if (goalId) {
        console.log('\n── 4. PROXY API: Dashboard Data (Goal Select) ──');
        // This is what dashboard.js loadGoalData does
        r = await req('GET', `/pa-api/portfolio/${goalId}`);
        allPass &= check(r.status === 200, `GET /pa-api/portfolio/${goalId}: ${r.status}`);
        console.log(`     Portfolio: ${JSON.stringify(r.data).substring(0, 100)}`);

        r = await req('GET', `/pa-api/recommendations/${goalId}`);
        allPass &= check(r.status === 200, `GET /pa-api/recommendations/${goalId}: ${r.status}`);
    }

    // ── 5. PROXY API: Add Stock ──
    if (goalId) {
        console.log('\n── 5. PROXY API: Add Stock (Transaction) ──');
        // This is what transactions.js searchStocks does
        r = await req('GET', '/pa-api/stocks/search?q=TCS');
        allPass &= check(r.status === 200, `GET /pa-api/stocks/search?q=TCS: ${r.status}`);
        console.log(`     Results: ${JSON.stringify(r.data).substring(0, 100)}`);

        // This is what transactions.js submitTransaction does
        r = await req('POST', '/pa-api/transactions', {
            goal_id: goalId,
            stock_symbol: 'TCS',
            transaction_type: 'BUY',
            transaction_date: '2025-02-01',
            quantity: 5,
            price: 4000,
            notes: 'Browser test'
        });
        allPass &= check(r.status === 201 || r.status === 200, `POST /pa-api/transactions: ${r.status}`);
        console.log(`     Response: ${JSON.stringify(r.data).substring(0, 120)}`);
    }

    // ── 6. Verify Data Flow ──
    if (goalId) {
        console.log('\n── 6. DATA FLOW: Portfolio Reflects Transaction ──');
        r = await req('GET', `/pa-api/portfolio/${goalId}/holdings`);
        allPass &= check(r.status === 200, `GET holdings: ${r.status}`);
        if (Array.isArray(r.data)) {
            console.log(`     Holdings: ${r.data.length} stock(s)`);
            r.data.forEach(h => console.log(`       - ${h.symbol}: ${h.quantity} shares`));
        }

        r = await req('GET', `/pa-api/portfolio/${goalId}/value`);
        allPass &= check(r.status === 200, `GET value: ${r.status}`);
        console.log(`     Value: ${JSON.stringify(r.data).substring(0, 80)}`);

        r = await req('GET', '/pa-api/transactions');
        allPass &= check(r.status === 200, `GET transactions list: ${r.status}`);
        if (Array.isArray(r.data)) console.log(`     Transactions: ${r.data.length}`);
    }

    // ── 7. Legacy Routes (existing features) ──
    console.log('\n── 7. LEGACY ROUTES (Node.js direct - must still work) ──');
    // /api/goals is a Node.js legacy route that queries user_goals in Postgres
    r = await req('GET', '/api/goals');
    allPass &= check(r.status === 200 || r.status === 401, `GET /api/goals (legacy): ${r.status}`);

    r = await req('GET', '/api/expenses');
    allPass &= check(r.status === 200 || r.status === 401, `GET /api/expenses (legacy): ${r.status}`);

    // ── 8. CORS: Preflight ──
    console.log('\n── 8. OPTIONS Preflight Check ──');
    r = await req('OPTIONS', '/pa-api/goals');
    // OPTIONS should not return 404 - it should be handled by proxy
    allPass &= check(r.status !== 404, `OPTIONS /pa-api/goals: ${r.status} (no 404)`);

    // ── Cleanup ──
    if (goalId) {
        console.log('\n── CLEANUP ──');
        r = await req('DELETE', `/pa-api/goals/${goalId}`);
        check(r.status === 200, `DELETE goal: ${r.status}`);
    }

    // ── Summary ──
    console.log('\n══════════════════════════════════════');
    console.log(allPass ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED');
    console.log('══════════════════════════════════════');
}

main();
