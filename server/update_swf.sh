#!/bin/bash

# Use Java 8 for JPEXS FFDec
JAVA="/usr/lib/jvm/java-8-openjdk-amd64/jre/bin/java"

# Paths
FFDEC="/home/david/Desktop/JPEXS-Flash-Decompiler/ffdec.jar"
ORIGINAL_SWF="/home/david/Desktop/ekoloko-both-master/ekoloko/main.swf"
UPDATED_AS="/home/david/Documents/1/scripts/com/vtweens/shell/Main.as"
WORK_DIR="/home/david/Documents/goodserver/swf_update_work"
OUTPUT_SWF="/home/david/Desktop/ekoloko-both-master/ekoloko/main_updated.swf"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== SWF Update Script ===${NC}"
echo -e "${YELLOW}Starting update process...${NC}\n"

# Step 1: Backup original SWF
echo -e "${YELLOW}[1/5] Backing up original SWF...${NC}"
if [ ! -f "${ORIGINAL_SWF}.backup" ]; then
    cp "$ORIGINAL_SWF" "${ORIGINAL_SWF}.backup"
    echo -e "${GREEN}✓ Backup created: ${ORIGINAL_SWF}.backup${NC}\n"
else
    echo -e "${YELLOW}  Backup already exists${NC}\n"
fi

# Step 2: Create work directory
echo -e "${YELLOW}[2/5] Creating work directory...${NC}"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
echo -e "${GREEN}✓ Work directory created${NC}\n"

# Step 3: Export ActionScript from SWF
echo -e "${YELLOW}[3/5] Exporting ActionScript from SWF...${NC}"
"$JAVA" -jar "$FFDEC" -export script "$WORK_DIR/exported" "$ORIGINAL_SWF"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ActionScript exported successfully${NC}\n"
else
    echo -e "${RED}✗ Failed to export ActionScript${NC}"
    exit 1
fi

# Step 4: Replace Main.as with updated version
echo -e "${YELLOW}[4/5] Replacing Main.as with updated version...${NC}"
MAIN_AS_PATH=$(find "$WORK_DIR/exported" -name "Main.as" -path "*/com/vtweens/shell/Main.as")
if [ -n "$MAIN_AS_PATH" ]; then
    cp "$UPDATED_AS" "$MAIN_AS_PATH"
    echo -e "${GREEN}✓ Main.as replaced: $MAIN_AS_PATH${NC}\n"
else
    echo -e "${RED}✗ Could not find Main.as in exported files${NC}"
    echo "Searching for Main.as..."
    find "$WORK_DIR/exported" -name "Main.as"
    exit 1
fi

# Step 5: Import updated ActionScript back into SWF
echo -e "${YELLOW}[5/5] Importing updated ActionScript into SWF...${NC}"
cp "$ORIGINAL_SWF" "$OUTPUT_SWF"

# Use JPEXS to replace the script in the SWF
"$JAVA" -jar "$FFDEC" -replace "$OUTPUT_SWF" "$OUTPUT_SWF" "com.vtweens.shell.Main" "$MAIN_AS_PATH"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ActionScript imported successfully${NC}\n"
    echo -e "${GREEN}=== Update Complete ===${NC}"
    echo -e "${GREEN}Updated SWF: $OUTPUT_SWF${NC}"
else
    echo -e "${RED}✗ Failed to import ActionScript${NC}"
    echo -e "${YELLOW}Trying alternative method...${NC}\n"
    
    # Alternative: Try direct script replacement
    "$JAVA" -jar "$FFDEC" -selectclass com.vtweens.shell.Main -export script "$WORK_DIR/backup_main" "$ORIGINAL_SWF"
    "$JAVA" -jar "$FFDEC" -import script "$OUTPUT_SWF" "com.vtweens.shell.Main" "$MAIN_AS_PATH"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Alternative method succeeded${NC}\n"
        echo -e "${GREEN}=== Update Complete ===${NC}"
        echo -e "${GREEN}Updated SWF: $OUTPUT_SWF${NC}"
    else
        echo -e "${RED}✗ Both methods failed${NC}"
        exit 1
    fi
fi

echo -e "\n${YELLOW}Next steps:${NC}"
echo -e "1. Test the updated SWF: $OUTPUT_SWF"
echo -e "2. If it works, replace the original:"
echo -e "   cp $OUTPUT_SWF $ORIGINAL_SWF"
echo -e "3. Original backup is at: ${ORIGINAL_SWF}.backup"
