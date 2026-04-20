#!/bin/bash

LOG_FILE="/home/david/Documents/goodserver/update_all_v2.log"
PID=253778

clear
echo "══════════════════════════════════════════════════════"
echo "         SWF Update Progress Monitor"
echo "══════════════════════════════════════════════════════"
echo ""

# Check if process is running
if ps -p $PID > /dev/null 2>&1; then
    echo "Status: ✅ RUNNING (PID: $PID)"
else
    echo "Status: ⚠️  COMPLETED or STOPPED"
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "                Latest Log Output"
echo "══════════════════════════════════════════════════════"
echo ""

if [ -f "$LOG_FILE" ]; then
    tail -30 "$LOG_FILE"
    echo ""
    echo "══════════════════════════════════════════════════════"
    
    # Count successes and failures
    SUCCESS=$(grep -c "✓.*updated successfully!" "$LOG_FILE" 2>/dev/null || echo 0)
    FAILED=$(grep -c "✗ Failed" "$LOG_FILE" 2>/dev/null || echo 0)
    
    echo "Files Updated: $SUCCESS"
    echo "Files Failed: $FAILED"
    echo ""
    
    # Show current file being processed
    CURRENT=$(grep -o "\[.*Processing:.*\]" "$LOG_FILE" | tail -1)
    if [ -n "$CURRENT" ]; then
        echo "Current: $CURRENT"
    fi
else
    echo "Log file not found yet..."
fi

echo ""
echo "══════════════════════════════════════════════════════"
echo "Commands:"
echo "  Watch live: tail -f $LOG_FILE"
echo "  Kill process: kill $PID"
echo "  Re-run this: $0"
echo "══════════════════════════════════════════════════════"
