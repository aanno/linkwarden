#!/usr/bin/env python3
"""
Fetch and analyze tags from Linkwarden API
"""
import requests
import json
import sys

BASE_URL = "http://localhost:3003"
# Using localhost since we're in the same devcontainer as the running instance

# This token will be passed as command line argument
if len(sys.argv) < 2:
    print("Usage: python3 fetch_tags.py <token>")
    sys.exit(1)

TOKEN = sys.argv[1]

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

print("Fetching initial tag data...")

# First, get a small sample to see the structure
response = requests.get(f"{BASE_URL}/api/v1/tags?limit=5", headers=headers)
print(f"Status: {response.status_code}")
print(f"Response: {response.text[:500]}")

if response.status_code == 200:
    data = response.json()
    if data.get('success'):
        print(f"\nSuccess! Got {len(data['response']['items'])} tags")
        print(f"Has more: {data['response']['hasMore']}")
        print(f"Next cursor: {data['response'].get('nextCursor')}")

        # Print first few tags
        for tag in data['response']['items'][:3]:
            print(f"  - {tag['name']}: {tag['_count']['links']} links")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
