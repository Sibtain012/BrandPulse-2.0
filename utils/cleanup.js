const cleanupStuckProcesses = async () => {
    // If a process has been 'PROCESSING' for more than 10 minutes, it's likely dead.
    const query = `
        UPDATE global_keywords 
        SET status = 'FAILED' 
        WHERE status = 'PROCESSING' 
        AND last_run_at < NOW() - INTERVAL '10 minutes'
    `;
    await pool.query(query);
};
