#!/usr/bin/env python3
"""
Analyze tags and generate merge proposals to reduce from 2939 to ~1000 tags
"""
import json
import re
from collections import defaultdict
from typing import List, Dict, Tuple

# Load tag data
with open('scripts/tag-analysis.json', 'r') as f:
    data = json.load(f)

tags = data['tags']
total_tags = len(tags)
total_links = data['totalLinks']

print(f"=== Tag Merge Analysis ===")
print(f"Current state: {total_tags} tags, {total_links} links")
print(f"Target: ~1000 tags\n")

# Rule violations
violations = {
    'german': [],
    'year_specific': [],
    'single_link': [],
    'chinese': [],
    'potential_merges': defaultdict(list)
}

# Detect violations
for tag in tags:
    name = tag['name']
    link_count = tag['linkCount']

    # Single link tags
    if link_count == 1:
        violations['single_link'].append(tag)

    # German tags (umlauts or common German words)
    if re.search(r'[äöüßÄÖÜ]', name) or \
       re.search(r'\b(der|die|das|und|oder|für|mit|von|zu|im|am|zum|zur|des|dem|den|ein|eine|Jahre)\b', name, re.I):
        violations['german'].append(tag)

    # Chinese/Japanese characters
    if re.search(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]', name):
        violations['chinese'].append(tag)

    # Specific years (YYYY format)
    if re.match(r'^\d{4}$', name):
        violations['year_specific'].append(tag)

    # Decades in German (e.g., "1920er", "1970er Jahre")
    if re.match(r'^\d{4}er', name) or '20. Jahrhundert' in name:
        violations['german'].append(tag)

print(f"=== Rule Violations ===")
print(f"Single-link tags (should be ≤5%): {len(violations['single_link'])} ({len(violations['single_link'])/total_tags*100:.1f}%)")
print(f"German tags: {len(violations['german'])}")
print(f"Chinese/Japanese tags: {len(violations['chinese'])}")
print(f"Specific year tags: {len(violations['year_specific'])}\n")

# Find similar tags for potential merging
print(f"=== Finding Similar Tags for Merging ===\n")

# Group by similarity
def normalize_tag(name):
    """Normalize tag name for comparison"""
    # Remove special chars, lowercase, remove spaces
    return re.sub(r'[^a-z0-9]', '', name.lower())

def get_base_term(name):
    """Extract base term (remove suffixes, plurals, etc.)"""
    name = name.lower()
    # Remove common suffixes
    name = re.sub(r'(s|ing|ed|er|tion|ment|ness|ity|able|ible)$', '', name)
    return name

# Find tags that differ only in case, plurals, or minor variations
similar_groups = defaultdict(list)

for tag in tags:
    base = get_base_term(tag['name'])
    similar_groups[base].append(tag)

# Filter to groups with multiple tags
merge_candidates = {k: v for k, v in similar_groups.items() if len(v) > 1}

print(f"Found {len(merge_candidates)} groups of similar tags")

# Sort by total link count to prioritize important merges
sorted_candidates = sorted(
    merge_candidates.items(),
    key=lambda x: sum(t['linkCount'] for t in x[1]),
    reverse=True
)

# Show top merge opportunities
print(f"\nTop 30 merge opportunities:")
for i, (base, group) in enumerate(sorted_candidates[:30], 1):
    total_links = sum(t['linkCount'] for t in group)
    print(f"{i}. Base: '{base}'")
    for tag in sorted(group, key=lambda x: x['linkCount'], reverse=True):
        print(f"   - {tag['name']}: {tag['linkCount']} links")
    print(f"   Total: {len(group)} tags, {total_links} links\n")

# Save detailed merge proposals
merge_proposals = []

for base, group in sorted_candidates:
    # Choose the most common tag name as the primary
    primary = max(group, key=lambda x: x['linkCount'])

    if len(group) > 1:
        proposal = {
            'primary_tag': primary['name'],
            'merge_from': [t['name'] for t in group if t['name'] != primary['name']],
            'total_links': sum(t['linkCount'] for t in group),
            'tag_count': len(group)
        }
        merge_proposals.append(proposal)

# Save proposals
with open('scripts/merge-proposals-initial.json', 'w') as f:
    json.dump({
        'summary': {
            'current_tags': total_tags,
            'target_tags': 1000,
            'tags_to_remove': total_tags - 1000,
            'single_link_tags': len(violations['single_link']),
            'german_tags': len(violations['german']),
            'merge_groups': len(merge_proposals),
        },
        'proposals': merge_proposals[:100],  # Top 100 merge opportunities
        'violations': {
            'single_link': [t['name'] for t in violations['single_link'][:50]],
            'german': [t['name'] for t in violations['german']],
            'year_specific': [t['name'] for t in violations['year_specific']],
        }
    }, f, indent=2)

print(f"\nDetailed merge proposals saved to scripts/merge-proposals-initial.json")
print(f"Total merge groups identified: {len(merge_proposals)}")
print(f"\nEstimated tag reduction:")
print(f"  - By merging similar tags: ~{sum(len(p['merge_from']) for p in merge_proposals)} tags")
print(f"  - By removing single-link tags: ~{len(violations['single_link'])} tags")
print(f"  - By translating German tags: ~{len(violations['german'])} tags")
print(f"  - Total potential reduction: ~{sum(len(p['merge_from']) for p in merge_proposals) + len(violations['single_link'])}")
