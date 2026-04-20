#!/bin/bash

# Use Java 8 for JPEXS FFDec
JAVA="/usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java"

# Paths
FFDEC="/home/david/Desktop/JPEXS-Flash-Decompiler/ffdec.jar"
UPDATED_AS="/home/david/Documents/1/scripts/com/vtweens/shell/Main.as"
WORK_DIR="/home/david/Documents/goodserver/swf_update_work"
SWF_DIR="/home/david/Desktop/ekoloko-both-master/ekoloko"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}    Update All main.swf Files - Batch Script   ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}\n"

# Get list of files to update
cd "$SWF_DIR"
FILES_TO_UPDATE=$(ls -1 main*.swf* 2>/dev/null | grep -v "\.backup$" | grep -v "_updated\.swf$")

# Count files
TOTAL_FILES=$(echo "$FILES_TO_UPDATE" | wc -l)
CURRENT=0
SUCCESS_COUNT=0
FAIL_COUNT=0

if [ -z "$FILES_TO_UPDATE" ]; then
    echo -e "${RED}No main.swf files found!${NC}"
    exit 1
fi

echo -e "${BLUE}Found $TOTAL_FILES main.swf files to update${NC}\n"

# Process each file
while IFS= read -r FILENAME; do
    [ -z "$FILENAME" ] && continue
    
    CURRENT=$((CURRENT + 1))
    ORIGINAL_SWF="$SWF_DIR/$FILENAME"
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}[$CURRENT/$TOTAL_FILES] Processing: $FILENAME${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Create unique work directory for this file (sanitize filename for directory)
    SAFE_NAME=$(echo "$FILENAME" | sed 's/[^a-zA-Z0-9._-]/_/g')
    FILE_WORK_DIR="$WORK_DIR/${SAFE_NAME}_work"
    OUTPUT_SWF="${ORIGINAL_SWF}_temp_updated"
    
    # Step 1: Backup
    echo -e "${BLUE}[1/5] Backing up...${NC}"
    if [ ! -f "${ORIGINAL_SWF}.backup" ]; then
        cp "$ORIGINAL_SWF" "${ORIGINAL_SWF}.backup"
        echo -e "${GREEN}✓ Backup created${NC}"
    else
        echo -e "${YELLOW}  Backup already exists${NC}"
    fi
    
    # Step 2: Create work directory
    echo -e "${BLUE}[2/5] Creating work directory...${NC}"
    rm -rf "$FILE_WORK_DIR"
    mkdir -p "$FILE_WORK_DIR"
    echo -e "${GREEN}✓ Work directory created${NC}"
    
    # Step 3: Export ActionScript
    echo -e "${BLUE}[3/5] Exporting ActionScript (this may take a few minutes)...${NC}"
    "$JAVA" -jar "$FFDEC" -export script "$FILE_WORK_DIR/exported" "$ORIGINAL_SWF" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ActionScript exported${NC}"
    else
        echo -e "${RED}✗ Failed to export ActionScript${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        rm -rf "$FILE_WORK_DIR"
        continue
    fi
    
    # Step 4: Replace Main.as
    echo -e "${BLUE}[4/5] Replacing Main.as...${NC}"
    MAIN_AS_PATH=$(find "$FILE_WORK_DIR/exported" -name "Main.as" -path "*/com/vtweens/shell/Main.as" 2>/dev/null)
    if [ -n "$MAIN_AS_PATH" ] && [ -f "$MAIN_AS_PATH" ]; then
        cp "$UPDATED_AS" "$MAIN_AS_PATH"
        echo -e "${GREEN}✓ Main.as replaced${NC}"
    else
        echo -e "${RED}✗ Could not find Main.as${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        rm -rf "$FILE_WORK_DIR"
        continue
    fi
    
    # Step 5: Import updated ActionScript
    echo -e "${BLUE}[5/5] Importing updated ActionScript (this may take a few minutes)...${NC}"
    cp "$ORIGINAL_SWF" "$OUTPUT_SWF"
    "$JAVA" -jar "$FFDEC" -replace "$OUTPUT_SWF" "$OUTPUT_SWF" "com.vtweens.shell.Main" "$MAIN_AS_PATH" > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ActionScript imported${NC}"
        # Replace original with updated version
        mv "$OUTPUT_SWF" "$ORIGINAL_SWF"
        echo -e "${GREEN}✓ Original file replaced${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "${RED}✗ Failed to import ActionScript${NC}"
        rm -f "$OUTPUT_SWF"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        rm -rf "$FILE_WORK_DIR"
        continue
    fi
    
    # Cleanup work directory
    rm -rf "$FILE_WORK_DIR"
    
    echo -e "${GREEN}✓ $FILENAME updated successfully!${NC}\n"
    
    # Show progress
    PERCENT=$((CURRENT * 100 / TOTAL_FILES))
    echo -e "${BLUE}Progress: $CURRENT/$TOTAL_FILES ($PERCENT%)${NC}\n"
done <<< "$FILES_TO_UPDATE"

# Cleanup main work directory
rm -rf "$WORK_DIR"

# Final summary
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}              Update Summary                    ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}Total files processed: $TOTAL_FILES${NC}"
echo -e "${GREEN}Successfully updated:   $SUCCESS_COUNT${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}Failed updates:         $FAIL_COUNT${NC}"
fi
echo -e "${GREEN}═══════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}Backup files are saved with .backup extension${NC}"
echo -e "${YELLOW}If you need to restore, run:${NC}"
echo -e "  cd $SWF_DIR"
echo -e "  for f in main*.swf*.backup; do"
echo -e "    mv \"\$f\" \"\${f%.backup}\""
echo -e "  done\n"

if [ $SUCCESS_COUNT -eq $TOTAL_FILES ]; then
    echo -e "${GREEN}🎉 All files updated successfully!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some files failed to update. Check the log above.${NC}"
    exit 1
fi
