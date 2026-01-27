$headers = @{
    "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjcW15bW5sa2hlYm1lcXZnem9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjgxODMsImV4cCI6MjA4NDMwNDE4M30.3YBttoYAoDJ8t_RnGjukzKK6SYDKgzsR5J_zfe0Oxg8"
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjcW15bW5sa2hlYm1lcXZnem9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjgxODMsImV4cCI6MjA4NDMwNDE4M30.3YBttoYAoDJ8t_RnGjukzKK6SYDKgzsR5J_zfe0Oxg8"
}

$baseUrl = "https://tcqmymnlkhebmeqvgzoc.supabase.co/rest/v1"

Write-Host "========================================"
Write-Host "  Supabase Database Table Check"
Write-Host "========================================"
Write-Host ""

$tables = @("access_logs", "device_commands", "device_uids", "devices", "device_overview")

foreach ($table in $tables) {
    Write-Host "Testing table: $table"
    try {
        $url = "$baseUrl/$table" + "?limit=1"
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -ErrorAction Stop
        Write-Host "  OK - Table exists!"
        
        if ($response -and $response.Count -gt 0) {
            Write-Host "  Has data: Yes"
        } else {
            Write-Host "  Has data: No (empty)"
        }
    }
    catch {
        $errMsg = $_.Exception.Message
        Write-Host "  ERROR: $errMsg"
    }
    Write-Host ""
}

Write-Host "========================================"
Write-Host "  Testing INSERT into access_logs"
Write-Host "========================================"

$testLog = '{"device_id":"TEST_DEVICE","uid":"TESTUID123","event_type":"GRANTED","logged_at":"2026-01-24T03:00:00"}'

try {
    $insertHeaders = @{
        "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjcW15bW5sa2hlYm1lcXZnem9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjgxODMsImV4cCI6MjA4NDMwNDE4M30.3YBttoYAoDJ8t_RnGjukzKK6SYDKgzsR5J_zfe0Oxg8"
        "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjcW15bW5sa2hlYm1lcXZnem9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MjgxODMsImV4cCI6MjA4NDMwNDE4M30.3YBttoYAoDJ8t_RnGjukzKK6SYDKgzsR5J_zfe0Oxg8"
        "Content-Type" = "application/json"
        "Prefer" = "return=representation"
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/access_logs" -Headers $insertHeaders -Method Post -Body $testLog -ErrorAction Stop
    Write-Host "  INSERT successful!"
    Write-Host "  Inserted: $($response | ConvertTo-Json -Compress)"
    
    Write-Host "  Cleaning up test data..."
    $deleteUrl = "$baseUrl/access_logs?device_id=eq.TEST_DEVICE"
    Invoke-RestMethod -Uri $deleteUrl -Headers $headers -Method Delete -ErrorAction SilentlyContinue
    Write-Host "  Test data cleaned up"
}
catch {
    $errMsg = $_.Exception.Message
    Write-Host "  INSERT FAILED: $errMsg"
    
    if ($errMsg -like "*logged_at*" -or $errMsg -like "*column*") {
        Write-Host ""
        Write-Host "  WARNING: The logged_at column may not exist!"
        Write-Host "  You need to add this column to your access_logs table."
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Test Complete"
Write-Host "========================================"
