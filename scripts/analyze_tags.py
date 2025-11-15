#!/usr/bin/env python3
"""
Script to analyze tags in Linkwarden database
"""
import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import json

# Load environment variables
load_dotenv()

# Get database URL
db_url = os.getenv('DATABASE_URL')
postgres_password = os.getenv('POSTGRES_PASSWORD')

if not db_url:
    print("ERROR: DATABASE_URL not found in .env")
    sys.exit(1)

# Replace password placeholder if needed
if '${POSTGRES_PASSWORD}' in db_url:
    db_url = db_url.replace('${POSTGRES_PASSWORD}', postgres_password)

print(f"Connecting to database...")

try:
    # Connect to the database
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    # Get total tag count
    cursor.execute('SELECT COUNT(*) as count FROM "Tag"')
    total_tags = cursor.fetchone()['count']
    print(f"Total tags: {total_tags}")

    # Get total link count
    cursor.execute('SELECT COUNT(*) as count FROM "Link"')
    total_links = cursor.fetchone()['count']
    print(f"Total links: {total_links}")

    # Get tags with link counts (first 100)
    cursor.execute('''
        SELECT
            t.id,
            t.name,
            COUNT(lt."linkId") as link_count
        FROM "Tag" t
        LEFT JOIN "_LinkToTag" lt ON t.id = lt."tagId"
        GROUP BY t.id, t.name
        ORDER BY t.name
        LIMIT 100
    ''')

    tags_sample = cursor.fetchall()
    print(f"\nFirst 100 tags (alphabetically):")
    for tag in tags_sample:
        print(f"  {tag['name']}: {tag['link_count']} links")

    cursor.close()
    conn.close()

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
