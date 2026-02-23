})().catch(async (e) => { console.error(e); try { await pool.end(); } catch (_) {} process.exit(1); });)  
