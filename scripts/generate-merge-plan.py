#!/usr/bin/env python3
"""
Generate specific merge proposals in the format:
- Primary tag: Xyz
- Merge targets: Xyz~1, Xyz~2, Xyz~3, etc.
"""
import json
import re
from collections import defaultdict

# Load data
with open('scripts/tag-analysis.json', 'r') as f:
    data = json.load(f)

tags = {t['name']: t for t in data['tags']}

print("=== Generating Merge Plan ===\n")

# Phase 1: Case and plural variations
print("Phase 1: Case and Plural Variations")
print("=" * 60)

merge_plan = []

def find_variants(tag_name):
    """Find case/plural variants of a tag"""
    variants = []
    normalized = tag_name.lower()

    for name, tag in tags.items():
        if name == tag_name:
            continue

        name_lower = name.lower()

        # Exact case-insensitive match
        if name_lower == normalized:
            variants.append((name, tag))
            continue

        # Plural/singular match
        if name_lower == normalized + 's' or name_lower + 's' == normalized:
            variants.append((name, tag))
            continue

        # Common endings
        for suffix in ['ing', 'ed', 'er', 'able', 's']:
            if normalized.endswith(suffix) and name_lower == normalized[:-len(suffix)]:
                variants.append((name, tag))
                break
            if name_lower.endswith(suffix) and name_lower[:-len(suffix)] == normalized:
                variants.append((name, tag))
                break

    return variants

# Process all tags
processed = set()
for tag_name, tag_data in sorted(tags.items(), key=lambda x: x[1]['linkCount'], reverse=True):
    if tag_name in processed:
        continue

    variants = find_variants(tag_name)
    if not variants:
        continue

    # Choose primary tag (highest link count)
    all_candidates = [(tag_name, tag_data)] + variants
    primary = max(all_candidates, key=lambda x: x[1]['linkCount'])
    others = [t for t in all_candidates if t[0] != primary[0]]

    if others:
        total_links = sum(t[1]['linkCount'] for t in all_candidates)
        print(f"\nMerge Group: {primary[0]} ({total_links} total links)")
        print(f"  Primary: {primary[0]} ({primary[1]['linkCount']} links)")

        for i, (name, data) in enumerate(others, 1):
            print(f"  {primary[0]}~{i}: {name} ({data['linkCount']} links)")
            processed.add(name)

        merge_plan.append({
            'primary': primary[0],
            'merges': [{'suffix': i, 'original': name, 'linkCount': data['linkCount']}
                      for i, (name, data) in enumerate(others, 1)],
            'total_links': total_links,
            'savings': len(others)
        })

    processed.add(tag_name)

# Phase 2: German to English translations
print("\n\nPhase 2: German Tags (need manual translation)")
print("=" * 60)

german_pattern = re.compile(r'[äöüßÄÖÜ]|\\b(der|die|das|und|oder|für|mit|von|zu|im|am|zum|zur|des|dem|den|ein|eine|Jahre)\\b', re.I)
german_tags = [(name, tag) for name, tag in tags.items() if german_pattern.search(name)]

german_translations = {}
for name, tag in sorted(german_tags, key=lambda x: x[1]['linkCount'], reverse=True)[:20]:
    print(f"{name} ({tag['linkCount']} links)")
    # These need manual translation
    german_translations[name] = f"[TRANSLATE: {name}]"

# Phase 3: Year tags
print("\n\nPhase 3: Year Tags (convert to decades/ranges)")
print("=" * 60)

year_tags = [(name, tag) for name, tag in tags.items() if re.match(r'^\d{4}$', name)]
for name, tag in year_tags:
    year = int(name)
    if year >= 1900:
        decade = f"{(year // 10) * 10}s"
        print(f"{name} → {decade} ({tag['linkCount']} links)")
    else:
        century = f"{(year // 100) * 100}-{(year // 100) * 100 + 99}"
        print(f"{name} → {century} ({tag['linkCount']} links)")

# Phase 4: Semantic duplicates (common patterns)
print("\n\nPhase 4: Semantic Duplicates (common abbreviations)")
print("=" * 60)

# Common abbreviation patterns
abbreviations = {
    'AI': ['Artificial Intelligence', 'ai'],
    'ML': ['Machine Learning', 'MachineLearning'],
    'API': ['Application Programming Interface', 'api', 'Apis'],
    'CLI': ['Command Line Interface', 'cli'],
    'UI': ['User Interface', 'ui'],
    'UX': ['User Experience', 'ux'],
    'DB': ['Database', 'database'],
    'DevOps': ['Development Operations', 'devops'],
}

for abbr, expansions in abbreviations.items():
    if abbr in tags:
        found = [name for name in expansions if name in tags]
        if found:
            total = tags[abbr]['linkCount'] + sum(tags[n]['linkCount'] for n in found)
            print(f"\n{abbr} ({total} total links)")
            print(f"  Primary: {abbr}")
            for i, name in enumerate(found, 1):
                print(f"  {abbr}~{i}: {name} ({tags[name]['linkCount']} links)")

# Phase 5: Single-link tag analysis
print("\n\nPhase 5: Single-Link Tags Analysis")
print("=" * 60)

single_link = [(name, tag) for name, tag in tags.items() if tag['linkCount'] == 1]
print(f"Total single-link tags: {len(single_link)}")
print(f"These represent {len(single_link)/len(tags)*100:.1f}% of all tags")
print(f"Target: ≤5% = {int(len(tags) * 0.05)} tags")
print(f"Need to remove/merge: ~{len(single_link) - int(len(tags) * 0.05)} single-link tags")

# Save merge plan
with open('scripts/merge-execution-plan.json', 'w') as f:
    json.dump({
        'summary': {
            'total_merges': len(merge_plan),
            'tags_saved': sum(p['savings'] for p in merge_plan),
            'german_tags': len(german_tags),
            'year_tags': len(year_tags),
            'single_link_tags': len(single_link),
            'single_link_to_remove': len(single_link) - int(len(tags) * 0.05)
        },
        'phase1_case_plural': merge_plan,
        'phase2_german': {name: german_translations.get(name, '[TRANSLATE]')
                         for name, _ in german_tags},
        'phase3_years': {name: f"{(int(name)//10)*10}s" if int(name) >= 1900
                        else f"{(int(name)//100)*100}-{(int(name)//100)*100+99}"
                        for name, _ in year_tags},
    }, f, indent=2)

print(f"\n\nExecution plan saved to: scripts/merge-execution-plan.json")
print(f"\nSummary:")
print(f"  Phase 1 (case/plural): {sum(p['savings'] for p in merge_plan)} tags saved")
print(f"  Phase 2 (German): {len(german_tags)} tags to translate")
print(f"  Phase 3 (years): {len(year_tags)} tags to convert")
print(f"  Phase 4 (semantic): Manual review needed")
print(f"  Phase 5 (single-link): ~{len(single_link) - int(len(tags) * 0.05)} to remove")
print(f"\nEstimated final count: {len(tags) - sum(p['savings'] for p in merge_plan) - (len(single_link) - int(len(tags) * 0.05))} tags")
