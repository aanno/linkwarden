import { prisma } from "../packages/prisma";

async function main() {
  console.log("Analyzing Linkwarden tags...\n");

  // Get total counts
  const totalTags = await prisma.tag.count();
  const totalLinks = await prisma.link.count();

  console.log(`Total tags: ${totalTags}`);
  console.log(`Total links: ${totalLinks}`);
  console.log(`Ratio: ${(totalTags / totalLinks).toFixed(2)} tags per link\n`);

  // Get tags with link counts
  const tags = await prisma.tag.findMany({
    take: 100,
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { links: true },
      },
    },
  });

  console.log(`Sample of first 100 tags (alphabetically):`);
  for (const tag of tags.slice(0, 20)) {
    console.log(`  ${tag.name.padEnd(30)} - ${tag._count.links} links`);
  }

  // Get all tags with counts for analysis
  const allTags = await prisma.tag.findMany({
    include: {
      _count: {
        select: { links: true },
      },
    },
  });

  // Get tags with only 1 link
  const singleLinkTags = allTags.filter((t) => t._count.links === 1);
  console.log(`\nTag usage statistics:`);
  console.log(`  Tags with only 1 link: ${singleLinkTags.length} (${((singleLinkTags.length / totalTags) * 100).toFixed(1)}%)`);

  // Get tags with 0 links
  const zeroLinkTags = allTags.filter((t) => t._count.links === 0);
  console.log(`  Tags with 0 links: ${zeroLinkTags.length}`);

  // Detect potential issues
  const yearTags = allTags.filter((t) => /^\d{4}$/.test(t.name));
  const germanTags = allTags.filter((t) =>
    /[äöüßÄÖÜ]/.test(t.name) ||
    t.name.match(/\b(der|die|das|und|oder|für|mit|von|zu|im|am|zum|zur|des|dem|den|ein|eine)\b/i)
  );

  console.log(`  Year tags (YYYY format): ${yearTags.length}`);
  console.log(`  Likely German tags: ${germanTags.length}`);

  // Save full data to file for further analysis
  const fs = require('fs');
  fs.writeFileSync(
    'scripts/tag-analysis.json',
    JSON.stringify({
      totalTags,
      totalLinks,
      ratio: totalTags / totalLinks,
      tags: allTags.map(t => ({
        id: t.id,
        name: t.name,
        linkCount: t._count.links,
      })),
    }, null, 2)
  );

  console.log(`\nFull tag data saved to scripts/tag-analysis.json`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
