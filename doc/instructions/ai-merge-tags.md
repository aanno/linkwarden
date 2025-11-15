# AI-Assisted Tag Merge Instructions

**Date Created:** 2025-01-15
**Last Updated:** 2025-01-15
**Current Status:** AI-Powered Feature Implemented ✅
**Target:** Reduce from 2,939 tags to ~1,000 tags

## 🎯 Quick Start: AI-Powered Tag Merging

Linkwarden now includes an **AI-powered tag merging feature** that automatically analyzes your tags and suggests intelligent merge operations!

### How to Use

1. **Navigate to Settings** → AI Merge Tags (`/settings/ai-merge-tags`)
2. **Review AI Suggestions** - The system analyzes your top 300 tags and suggests 5-50 merge operations
3. **Select Merges** - Use checkboxes to select which suggestions to apply
4. **Submit** - Click "Merge Selected" to queue operations for background processing
5. **Wait** - Merges process automatically in the background (check back in a few minutes)

### What the AI Detects

The AI automatically identifies:
- ✅ **Case variations** (AI/ai → AI)
- ✅ **Plural forms** (Course/Courses → Courses)
- ✅ **Abbreviations** (AI/Artificial Intelligence → AI)
- ✅ **Language issues** (German/Chinese tags → English)
- ✅ **Suffix variations** (Network/Networking → Networking)
- ✅ **Low-value single-link tags** (tags used only once)

### API Endpoints

**GET /api/v1/tags/ai_merge**
- Generates merge suggestions using configured AI provider
- Returns JSON with suggested merges and reasons
- Requires authentication

**PATCH /api/v1/tags/ai_merge**
- Queues selected merge operations for background processing
- Accepts array of merge operations
- Returns immediately (processing happens asynchronously)

### Configuration

The feature uses your existing AI configuration (same as auto-tagging):
- OpenAI (including compatible endpoints)
- Azure OpenAI
- Anthropic Claude
- Ollama (local)
- OpenRouter
- Perplexity

**Environment variables:** Already configured if auto-tagging works (e.g., `OPENAI_API_KEY`, `OPENAI_MODEL`)

---

## Original User Requirements

### Problem Statement

The Linkwarden instance has approximately **3 times more tags than links** (2,939 tags for 1,297 links). This indicates too many tags and requires consolidation.

### Tag Merge Format

When merging tags, follow this naming convention:
1. Choose the appropriate name for the merged tag: **`Xyz`**
2. If this is a new tag name, rename one tag to **`Xyz`**
3. Rename all other tags to be merged as: **`Xyz~1`**, **`Xyz~2`**, **`Xyz~3`**, etc.
4. Later, remove all `Xyz~n` tags and replace their occurrences with `Xyz`

### Tag Quality Rules

1. **English Only:** Tags should be in English only (no German or Chinese)

2. **Single-Link Limit:** Tags with only one link member should be an exception (≤5% of total tags)

3. **Year Ranges, Not Specific Years:**
   - Avoid year numbers (e.g., 2025, 1995)
   - Use decades for years ≥1900 to current (e.g., 2020s, 1990s)
   - Use 100-year ranges for years ≥0 (e.g., 1800-1899)
   - Continue pattern for earlier dates

4. **Avoid Tags with Big Overlaps:**
   - If a link is tagged 'X', it should not nearly always also be tagged with 'Y'
   - Exception: If 'Y' is a subcategory of 'X' (e.g., X=Transportation, Y=Automotive)

5. **Subcategories Allowed:**
   - It's acceptable for tag 'Y' to be a subcategory of tag 'X'
   - Example: Transportation (broad) + Automotive (specific) is valid

6. **Context Clarity:**
   - Tags should explain the context of a link
   - The set of tags attached to a link should make clear which domain(s) the link is connected to

### Analysis Approach

- **Don't retrieve all links at once** - Results are too large
- **Don't retrieve all tags at once** - Use paged results or alphabetical batches (tags starting with 'a', then 'b', etc.)
- **Narrow searches appropriately** when retrieving link content
- Use full-text search capabilities of Linkwarden when needed

## Analysis Results

### Current State (2025-01-15)

| Metric | Value |
|--------|-------|
| Total Tags | 2,939 |
| Total Links | 1,297 |
| Ratio | 2.27 tags per link |
| Single-link tags | 2,263 (77.0%) |
| Target single-link | ≤147 tags (5%) |
| German tags | 111 |
| Chinese/Japanese tags | 14 |
| Year-specific tags | 1 |
| Case/plural variants | 72 groups |

### Critical Issues Identified

1. **Massive Single-Link Tag Problem**
   - Current: 2,263 tags (77%) have only 1 link
   - Target: ≤147 tags (5%)
   - **Action Required:** Remove/merge ~2,117 single-link tags

2. **Non-English Tags**
   - German: 111 tags
   - Chinese/Japanese: 14 tags
   - **Action Required:** Translate to English equivalents

3. **Case and Plural Variations**
   - 72 merge groups identified (e.g., AI/ai, Courses/Course)
   - **Action Required:** Consolidate to primary variant

4. **Semantic Duplicates**
   - AI + Artificial Intelligence
   - ML + Machine Learning
   - API + api + Apis
   - **Action Required:** Merge to abbreviation form

## Five-Phase Merge Plan

### Phase 1: Case and Plural Variations

**Impact:** Saves 73 tags
**Complexity:** Low (automated)
**Risk:** Low

Merge tags that differ only in:
- Capitalization (AI vs ai)
- Singular/plural (Course vs Courses)
- Common suffixes (Deploy vs Deployment)

**Top Merge Groups:**

```
AI (38 links total)
  Primary: AI (37 links)
  Merge: ai → AI~1 (1 link)

Courses (22 links total)
  Primary: Courses (20 links)
  Merge: Course → Courses~1 (2 links)

API (15 links total)
  Primary: API (12 links)
  Merge: Apis → API~1 (3 links)

Llms (10 links total)
  Primary: Llms (8 links)
  Merge: LLM → Llms~1 (1 link)
  Merge: llm → Llms~2 (1 link)

Self-hosted (12 links total)
  Primary: Self-hosted (11 links)
  Merge: Self-host → Self-hosted~1 (1 link)
```

**Complete List:** See `scripts/merge-execution-plan.json` - 72 merge groups

**Execution Steps:**
1. For each merge group in `phase1_case_plural`:
2. Rename each tag in `merges` array to `{primary}~{suffix}`
3. Verify all renamed tags have the `~N` suffix
4. Merge all `Xyz~N` tags into `Xyz`
5. Delete empty `Xyz~N` tags

---

### Phase 2: German Tag Translation

**Impact:** Translates 111 tags
**Complexity:** High (requires human judgment)
**Risk:** Medium (context-dependent translations)

**Top German Tags to Translate:**

| German | Links | English Translation | Notes |
|--------|-------|---------------------|-------|
| Übersetzung | 5 | Translation | Direct translation |
| Passwortgeschützt | 4 | Password-protected | Compound word |
| München | 4 | Munich | City name |
| Maßnahmen | 3 | Measures | Could also be "Actions" |
| Bücher | 3 | Books | Direct translation |
| Grüne | 3 | Green Party | Political context |
| Produktivität | 2 | Productivity | Direct translation |
| Künstliche Intelligenz | 1 | Artificial Intelligence | Then merge with AI |
| Ausbildungsplätze | 2 | Apprenticeships | Job/training context |
| Jobbörse | 2 | Job Board | Direct translation |

**Full German Tag List:** See `scripts/merge-execution-plan.json` - `phase2_german`

**Execution Steps:**
1. Review context of each German tag (check associated links)
2. Determine appropriate English translation
3. Check if English tag already exists:
   - **If exists:** Rename German tag to `English~N` (next available suffix)
   - **If not:** Create new English tag, rename German to `English~1`
4. Merge as in Phase 1
5. Delete German `~N` tags

**Special Cases:**
- **Künstliche Intelligenz** → Translate to "Artificial Intelligence" → Then merge with existing "AI" (Phase 4)
- **München** (Munich) - City names: Use English form
- **Grüne** (Green Party) - Political terms: May need context

---

### Phase 3: Year Tag Conversion

**Impact:** Converts 1 tag
**Complexity:** Low (automated)
**Risk:** Low

**Current Year Tags:**

| Year Tag | Links | Conversion | Decade/Range |
|----------|-------|------------|--------------|
| 2025 | 1 | Year ≥ 1900 | 2020s |

**Decade Tags (German format to convert):**
- `1920er` → `1920s` (also requires German translation)
- `1970er Jahre` → `1970s` (also requires German translation)
- `20. Jahrhundert` → `1900s` or `20th Century` (context-dependent)

**Conversion Rules:**
- **Years 1900-2029:** Convert to decade (e.g., 2025 → 2020s)
- **Years 1-1899:** Convert to century range (e.g., 1789 → 1700-1799)
- **Years ≤0:** Convert to larger ranges as appropriate

**Execution Steps:**
1. Identify all year tags (regex: `^\d{4}$`)
2. Calculate appropriate decade/range
3. Check if decade tag exists:
   - **If exists:** Rename year tag to `Decade~N`
   - **If not:** Rename year tag to decade name
4. Merge if necessary

---

### Phase 4: Semantic Duplicates

**Impact:** ~10+ tags
**Complexity:** Medium (requires domain knowledge)
**Risk:** Medium (some judgment needed)

**Identified Abbreviation Groups:**

```
AI (40 links total)
  Primary: AI
  Merge: Artificial Intelligence → AI~1 (2 links)
  Merge: ai → AI~2 (1 link)  [Already in Phase 1]

ML (8 links total)
  Primary: ML
  Merge: Machine Learning → ML~1 (7 links)

API (15 links total)
  Primary: API
  Merge: Apis → API~1 (3 links)  [Already in Phase 1]

CLI (4 links total)
  Primary: CLI
  Merge: cli → CLI~1 (2 links)  [Already in Phase 1]
```

**Additional Semantic Groups to Review:**

Look for tags that refer to the same concept:
- Container / Docker / Containerization
- Frontend / Front-end / Front End
- Backend / Back-end / Back End
- JavaScript / JS
- TypeScript / TS
- PostgreSQL / Postgres
- Development / Dev
- Production / Prod

**Execution Steps:**
1. Review tag pairs/groups for semantic overlap
2. Choose preferred term (usually abbreviation or most common)
3. Rename variants to `Primary~N`
4. Merge and delete

**Manual Review Required:** This phase needs human judgment to avoid incorrect merges

---

### Phase 5: Single-Link Tag Cleanup

**Impact:** Removes ~2,117 tags
**Complexity:** High (manual review)
**Risk:** Medium (risk of removing valuable tags)

**Current State:**
- Total single-link tags: 2,263 (77%)
- Target: ≤147 tags (5%)
- **To Remove:** ~2,117 tags

**Strategy for Deciding Which to Keep:**

**✅ KEEP if:**
- Specific technical term (e.g., library name, framework, protocol)
- Domain-specific concept that provides unique context
- Part of a valid subcategory relationship
- Likely to be used again (emerging technology, common tool)

**❌ REMOVE if:**
- Overly specific (e.g., `#1371`, `768-dimensional`)
- Redundant with other tags
- No unique context added
- Unlikely to be reused
- Generic descriptor that's too vague
- Duplicate of tag name in different language

**Examples:**

| Tag | Links | Decision | Reason |
|-----|-------|----------|--------|
| `#1371` | 1 | ❌ Remove | Meaningless identifier |
| `768-dimensional` | 1 | ❌ Remove | Overly specific |
| `24x7 Visibility` | 1 | ❌ Remove | Generic marketing term |
| `1920er` | 1 | ❌ Remove | German + year violation |
| `A20` | 1 | ❓ Review | Could be CPU/highway - check link |
| `AGI` | 1 | ✅ Keep | Artificial General Intelligence - emerging topic |
| `AMC` | 1 | ❓ Review | Ambiguous - check context |
| `AST` | 1 | ✅ Keep | Abstract Syntax Tree - technical term |
| `2FA` | 1 | ✅ Keep | Two-Factor Auth - common security term |

**Execution Steps:**
1. Export list of all 2,263 single-link tags
2. Sort by category/domain for batch review
3. For each tag, check link context
4. Mark as KEEP or REMOVE
5. Aim for ~146 KEEP tags
6. Delete all REMOVE tags

**Recommended Review Order:**
1. Start with obvious removes (symbols, numbers, gibberish)
2. Remove German/non-English tags (already in Phase 2)
3. Remove year-specific tags (already in Phase 3)
4. Review technical terms (keep most)
5. Review domain terms (keep if specific)
6. Review generic terms (remove most)

## Implementation Instructions

### Prerequisites

1. **Backup Database**
   ```bash
   # Create backup before starting
   pg_dump linkwarden > linkwarden_backup_$(date +%Y%m%d).sql
   ```

2. **Install Dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Review Generated Files**
   - `scripts/tag-analysis.json` - Full tag data
   - `scripts/merge-execution-plan.json` - Merge instructions
   - `doc/analysis/tag-merge-analysis-summary.md` - Detailed report

### Execution Order

**Recommended sequence:**

1. ✅ **Phase 1** (Low risk, automated)
2. ✅ **Phase 3** (Low risk, automated)
3. ⚠️ **Phase 2** (Manual translation required)
4. ⚠️ **Phase 4** (Manual review required)
5. ⚠️ **Phase 5** (High impact, manual review required)

### Option A: Manual Execution via Linkwarden UI

1. Navigate to `/tags` page
2. For each merge group:
   - Rename tags to `Xyz~1`, `Xyz~2`, etc.
   - Use Linkwarden's tag merge functionality
   - Verify links transferred correctly
3. Delete empty `~N` tags

**Pros:** Visual confirmation, safe
**Cons:** Time-consuming for 2,000+ tags

### Option B: Semi-Automated via Scripts

Create execution scripts for each phase:

```typescript
// scripts/execute-phase1-merges.ts
import { prisma } from "../packages/prisma";

async function executePhase1() {
  const plan = require('./merge-execution-plan.json');

  for (const group of plan.phase1_case_plural) {
    console.log(`Processing: ${group.primary}`);

    // Step 1: Rename variants
    for (const merge of group.merges) {
      const targetName = `${group.primary}~${merge.suffix}`;
      await prisma.tag.update({
        where: { name: merge.original },
        data: { name: targetName }
      });
      console.log(`  Renamed: ${merge.original} → ${targetName}`);
    }

    // Step 2: Merge links (wait for manual verification)
    console.log(`  Ready to merge into: ${group.primary}`);
  }
}

executePhase1();
```

**Pros:** Faster, consistent
**Cons:** Requires testing, less visual confirmation

### Option C: Database Direct (Advanced)

⚠️ **Use with extreme caution - test on backup first!**

```sql
-- Example: Merge "ai" into "AI"
-- Step 1: Rename
UPDATE "Tag" SET name = 'AI~1' WHERE name = 'ai';

-- Step 2: Reassign links
UPDATE "_LinkToTag"
SET "tagId" = (SELECT id FROM "Tag" WHERE name = 'AI')
WHERE "tagId" = (SELECT id FROM "Tag" WHERE name = 'AI~1');

-- Step 3: Delete empty tag
DELETE FROM "Tag" WHERE name = 'AI~1';
```

**Pros:** Fastest
**Cons:** Highest risk, no undo without backup

### Verification Steps

After each phase:

1. **Check tag count:**
   ```sql
   SELECT COUNT(*) FROM "Tag";
   ```

2. **Verify no broken links:**
   ```sql
   SELECT COUNT(*)
   FROM "Link" l
   LEFT JOIN "_LinkToTag" lt ON l.id = lt."linkId"
   WHERE lt."linkId" IS NULL;
   ```

3. **Check for orphaned tags:**
   ```sql
   SELECT t.name, COUNT(lt."linkId") as link_count
   FROM "Tag" t
   LEFT JOIN "_LinkToTag" lt ON t.id = lt."tagId"
   GROUP BY t.id, t.name
   HAVING COUNT(lt."linkId") = 0;
   ```

4. **Verify ~N tags:**
   ```sql
   SELECT name FROM "Tag" WHERE name LIKE '%~%';
   ```

## Progress Tracking

### Phase Completion Checklist

- [ ] **Phase 1: Case/Plural** (73 tags)
  - [ ] Script created
  - [ ] Test on 5 sample merges
  - [ ] Execute all 72 groups
  - [ ] Verify: 2,866 tags remaining

- [ ] **Phase 2: German** (111 tags)
  - [ ] Translation list created
  - [ ] Context reviewed for top 20
  - [ ] All translations completed
  - [ ] Execute merges
  - [ ] Verify: 2,755 tags remaining

- [ ] **Phase 3: Years** (1 tag)
  - [ ] Convert 2025 → 2020s
  - [ ] Check German decade tags
  - [ ] Verify: 2,754 tags remaining

- [ ] **Phase 4: Semantic** (~10 tags)
  - [ ] Review abbreviation pairs
  - [ ] Execute AI/ML/API merges
  - [ ] Verify: ~2,744 tags remaining

- [ ] **Phase 5: Single-Link** (2,117 tags)
  - [ ] Export full list
  - [ ] Review and mark (KEEP 146, REMOVE 2,117)
  - [ ] Execute deletion
  - [ ] Verify: ~627-749 tags remaining

### Expected Milestones

| Checkpoint | Expected Tag Count | Completion |
|------------|-------------------|------------|
| Start | 2,939 | - |
| After Phase 1 | 2,866 | [ ] |
| After Phase 2 | 2,755 | [ ] |
| After Phase 3 | 2,754 | [ ] |
| After Phase 4 | ~2,744 | [ ] |
| After Phase 5 | 627-749 | [ ] |
| **Target** | **~1,000** | ✅ |

## Generated Files Reference

### Analysis Files

1. **`scripts/tag-analysis.json`** (234 KB)
   - Complete tag dataset with link counts
   - Source data for all analysis
   - Generated by: `scripts/analyze-tags.ts`

2. **`scripts/merge-execution-plan.json`**
   - Machine-readable merge instructions
   - Contains phase1_case_plural, phase2_german, phase3_years
   - Ready for automation scripts
   - Generated by: `scripts/generate-merge-plan.py`

3. **`scripts/merge-proposals-initial.json`**
   - Initial similarity analysis
   - Top 100 merge opportunities
   - Violations summary
   - Generated by: `scripts/tag-merge-analyzer.py`

### Documentation

4. **`doc/analysis/tag-merge-analysis-summary.md`**
   - Executive summary
   - Detailed findings
   - Phase descriptions
   - Implementation recommendations

5. **`doc/instructions/ai-merge-tags.md`** (this file)
   - Complete instructions
   - Original requirements
   - Execution plans
   - Progress tracking

### Analysis Scripts

6. **`scripts/analyze-tags.ts`**
   - TypeScript script using Prisma
   - Generates tag-analysis.json
   - Run: `npx tsx scripts/analyze-tags.ts`

7. **`scripts/tag-merge-analyzer.py`**
   - Python analysis script
   - Pattern detection
   - Generates initial proposals
   - Run: `python3 scripts/tag-merge-analyzer.py`

8. **`scripts/generate-merge-plan.py`**
   - Python merge plan generator
   - Creates Xyz~N format proposals
   - Run: `python3 scripts/generate-merge-plan.py`

## Common Patterns and Examples

### Pattern 1: Simple Case Merge

```
Original State:
  - AI (37 links)
  - ai (1 link)

Step 1 - Rename:
  - AI (37 links) - unchanged
  - ai → AI~1 (1 link)

Step 2 - Merge:
  - Transfer 1 link from AI~1 to AI
  - AI now has 38 links

Step 3 - Cleanup:
  - Delete AI~1 (0 links)

Final State:
  - AI (38 links)
```

### Pattern 2: Translation Merge

```
Original State:
  - Productivity (5 links) - exists
  - Produktivität (2 links) - German

Step 1 - Rename:
  - Productivity (5 links) - unchanged
  - Produktivität → Productivity~1 (2 links)

Step 2 - Merge:
  - Transfer 2 links from Productivity~1 to Productivity
  - Productivity now has 7 links

Step 3 - Cleanup:
  - Delete Productivity~1 (0 links)

Final State:
  - Productivity (7 links)
```

### Pattern 3: New Translation

```
Original State:
  - Übersetzung (5 links) - German, no English equivalent exists

Step 1 - Create and Rename:
  - Create new tag: Translation (0 links)
  - Übersetzung → Translation~1 (5 links)

Step 2 - Merge:
  - Transfer 5 links from Translation~1 to Translation
  - Translation now has 5 links

Step 3 - Cleanup:
  - Delete Translation~1 (0 links)

Final State:
  - Translation (5 links)
```

### Pattern 4: Multi-Way Merge

```
Original State:
  - Llms (8 links)
  - LLM (1 link)
  - llm (1 link)

Step 1 - Rename:
  - Llms (8 links) - primary, unchanged
  - LLM → Llms~1 (1 link)
  - llm → Llms~2 (1 link)

Step 2 - Merge:
  - Transfer 1 link from Llms~1 to Llms
  - Transfer 1 link from Llms~2 to Llms
  - Llms now has 10 links

Step 3 - Cleanup:
  - Delete Llms~1 (0 links)
  - Delete Llms~2 (0 links)

Final State:
  - Llms (10 links)
```

## Troubleshooting

### Issue: Tag Already Has ~N Suffix

**Problem:** Trying to rename `Course` to `Courses~1`, but `Courses~1` already exists

**Solution:**
```typescript
// Find next available suffix
const existingSuffixes = await prisma.tag.findMany({
  where: { name: { startsWith: 'Courses~' } }
});
const maxSuffix = Math.max(...existingSuffixes.map(t =>
  parseInt(t.name.split('~')[1]) || 0
));
const nextSuffix = maxSuffix + 1;
// Use Courses~{nextSuffix}
```

### Issue: Duplicate Tag Names After Merge

**Problem:** Two different tags both want to merge into same primary

**Solution:**
- Review which should be the true primary
- Rename one to a different base name
- Or merge all three together with numbered suffixes

### Issue: Links Lost During Merge

**Problem:** Link count decreased after merge

**Solution:**
- Check for duplicate link-tag associations
- Prisma may have removed duplicates (this is correct)
- Verify: `SELECT COUNT(*) FROM "_LinkToTag"` before and after

### Issue: Cannot Delete Tag

**Problem:** `DELETE FROM "Tag" WHERE name = 'AI~1'` fails

**Solution:**
- Check for foreign key constraints
- Ensure all links have been reassigned
- Check: `SELECT COUNT(*) FROM "_LinkToTag" WHERE "tagId" = (SELECT id FROM "Tag" WHERE name = 'AI~1')`

## Quality Assurance

### Before Starting

- [ ] Database backup created
- [ ] Analysis files reviewed
- [ ] Test environment available
- [ ] Execution scripts tested

### During Execution

- [ ] Track tag count after each phase
- [ ] Verify no broken link associations
- [ ] Check for orphaned tags
- [ ] Review sample links to ensure tags transferred

### After Completion

- [ ] Final tag count ≤1,000
- [ ] Single-link tags ≤5%
- [ ] No German tags remaining
- [ ] No specific year tags
- [ ] All links have appropriate tags
- [ ] Documentation updated

## Estimated Timeline

| Phase | Automation Level | Estimated Time |
|-------|------------------|----------------|
| Phase 1 | High | 1-2 hours |
| Phase 2 | Low (translation) | 4-6 hours |
| Phase 3 | High | 15 minutes |
| Phase 4 | Medium | 2-3 hours |
| Phase 5 | Low (review needed) | 6-8 hours |
| **Total** | | **1-2 days** |

With full automation and minimal review: **4-6 hours**

## Success Criteria

✅ **The merge is successful when:**

1. Total tags ≤ 1,000 (target: ~750)
2. Single-link tags ≤ 5% of total
3. All tags are in English
4. No specific year tags (only decades/ranges)
5. No orphaned tags (0 links)
6. All links have at least one tag
7. Tag overlap patterns are reasonable
8. Context clarity maintained

## Notes and Warnings

⚠️ **Important:**
- Always work on a database backup first
- Test merge scripts on 5-10 tags before full execution
- Manually review high-impact tags (>10 links)
- Keep original analysis files for reference
- Document any deviations from the plan

📝 **Future Improvements:**
- Set up automated tag suggestion based on link content
- Implement tag hierarchy/relationships
- Add tag usage analytics to dashboard
- Create tag naming guidelines for new additions

## Contact and Questions

If issues arise during execution:
1. Check this document's troubleshooting section
2. Review analysis files for context
3. Verify against tag quality rules
4. Document any unexpected patterns found

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Status:** Ready for execution
