router.get('/summary/:keyword', async (req, res) => {
    const { keyword } = req.params;
    try {
        const query = `
            SELECT 
                ds.sentiment_label as name, 
                COUNT(*)::int as value
            FROM fact_sentiment_events fse
            JOIN silver_reddit_posts srp ON fse.silver_content_id = srp.silver_post_id
            JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
            WHERE srp.keyword = $1
            GROUP BY ds.sentiment_label;
        `;
        const result = await pool.query(query, [keyword]);
        res.json(result.rows); // Returns: [{name: 'Positive', value: 45}, ...]
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch gold metrics" });
    }
});