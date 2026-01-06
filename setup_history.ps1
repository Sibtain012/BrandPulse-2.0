# Analysis History Feature - Automated Setup Script
# Run this script to set up the history feature in one go

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ANALYSIS HISTORY FEATURE - SETUP" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$ErrorCount = 0

# Step 1: Check if PostgreSQL is accessible
Write-Host "[1/4] Checking PostgreSQL connection..." -ForegroundColor Yellow
try {
    $testConnection = psql -h localhost -U postgres -d loginDB2-22-NOV -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      PostgreSQL connection successful" -ForegroundColor Green
    }
    else {
        Write-Host "      PostgreSQL connection failed!" -ForegroundColor Red
        Write-Host "      Make sure PostgreSQL is running" -ForegroundColor Red
        $ErrorCount++
    }
}
catch {
    Write-Host "      Error: $_" -ForegroundColor Red
    $ErrorCount++
}

# Step 2: Create analysis_history table
Write-Host "`n[2/4] Creating analysis_history table..." -ForegroundColor Yellow
try {
    $result = psql -h localhost -U postgres -d loginDB2-22-NOV -f "migrations/create_analysis_history.sql" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Table created successfully" -ForegroundColor Green
        Write-Host "      - 16 columns added" -ForegroundColor Gray
        Write-Host "      - 4 indexes created" -ForegroundColor Gray
        Write-Host "      - Unique constraint added" -ForegroundColor Gray
    }
    else {
        Write-Host "      Warning: Migration may have already run" -ForegroundColor Yellow
        Write-Host "      This is OK if table already exists" -ForegroundColor Gray
    }
}
catch {
    Write-Host "      Error: $_" -ForegroundColor Red
    $ErrorCount++
}

# Step 3: Check if there's existing data to backfill
Write-Host "`n[3/4] Checking for existing analyses..." -ForegroundColor Yellow
try {
    $countResult = psql -h localhost -U postgres -d loginDB2-22-NOV -c "SELECT COUNT(*) FROM global_keywords WHERE status = 'COMPLETED';" -t 2>&1
    $completedCount = [int]($countResult.Trim())
    
    if ($completedCount -gt 0) {
        Write-Host "      Found $completedCount completed analyses" -ForegroundColor Green
        Write-Host "      Running backfill migration..." -ForegroundColor Yellow
        
        $backfillResult = psql -h localhost -U postgres -d loginDB2-22-NOV -f "migrations/backfill_analysis_history.sql" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "      Backfill completed successfully" -ForegroundColor Green
        }
        else {
            Write-Host "      Warning: Backfill may have encountered issues" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "      No existing analyses found (fresh install)" -ForegroundColor Gray
        Write-Host "      Skipping backfill" -ForegroundColor Gray
    }
}
catch {
    Write-Host "      Warning: Could not check for existing data" -ForegroundColor Yellow
}

# Step 4: Verify installation
Write-Host "`n[4/4] Verifying installation..." -ForegroundColor Yellow
try {
    # Check table exists
    $tableCheck = psql -h localhost -U postgres -d loginDB2-22-NOV -c "\dt analysis_history" 2>&1
    if ($tableCheck -match "analysis_history") {
        Write-Host "      Table exists: analysis_history" -ForegroundColor Green
    }
    
    # Check indexes
    $indexCount = psql -h localhost -U postgres -d loginDB2-22-NOV -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'analysis_history';" -t 2>&1
    $indexes = [int]($indexCount.Trim())
    Write-Host "      Indexes created: $indexes/4" -ForegroundColor Green
    
    # Check row count
    $rowCount = psql -h localhost -U postgres -d loginDB2-22-NOV -c "SELECT COUNT(*) FROM analysis_history;" -t 2>&1
    $rows = [int]($rowCount.Trim())
    Write-Host "      History entries: $rows" -ForegroundColor Green
    
}
catch {
    Write-Host "      Verification failed: $_" -ForegroundColor Red
    $ErrorCount++
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
if ($ErrorCount -eq 0) {
    Write-Host "  SETUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart backend: nodemon index.js" -ForegroundColor White
    Write-Host "  2. Navigate to your app in browser" -ForegroundColor White
    Write-Host "  3. Click profile icon -> 'Analysis History'" -ForegroundColor White
    Write-Host "  4. Run a new analysis to test" -ForegroundColor White
    Write-Host "`nDocumentation:" -ForegroundColor Cyan
    Write-Host "  - Setup Guide: docs/SETUP_TESTING_GUIDE.md" -ForegroundColor Gray
    Write-Host "  - Feature Guide: docs/ANALYSIS_HISTORY_GUIDE.md" -ForegroundColor Gray
}
else {
    Write-Host "  SETUP COMPLETED WITH $ErrorCount ERROR(S)" -ForegroundColor Red
    Write-Host "========================================`n" -ForegroundColor Cyan
    Write-Host "Please check the errors above and:" -ForegroundColor Yellow
    Write-Host "  1. Verify PostgreSQL is running" -ForegroundColor White
    Write-Host "  2. Check database credentials" -ForegroundColor White
    Write-Host "  3. Review docs/SETUP_TESTING_GUIDE.md" -ForegroundColor White
}

Write-Host ""
