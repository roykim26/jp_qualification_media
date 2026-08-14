import { Client } from 'pg';
import { launchQualifications } from '../../schema/src/qualifications.js';
import { config } from '../../config/src/index.js';

if (!config.databaseUrl) {
  console.log('DATABASE_URL not set; seed not run.');
  process.exit(0);
}
const client = new Client({ connectionString: config.databaseUrl });
await client.connect();
try {
  for (const q of launchQualifications)
    await client.query(
      'INSERT INTO qualifications (id, slug, official_name_ja, aliases_ja, field, category) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING',
      [
        `qualification:${q.slug}`,
        q.slug,
        q.officialNameJa,
        JSON.stringify(q.aliasesJa),
        q.field,
        q.category,
      ],
    );
  await client.query(
    "INSERT INTO institutions (id, name_ja, official) VALUES ('institution:retio', 'RETIO', true) ON CONFLICT (id) DO NOTHING",
  );
  await client.query(
    "INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active) VALUES ('source:takken:retio-exam', 'institution:retio', 'https://www.retio.or.jp/exam/', 'www.retio.or.jp', 'official_exam_entry', true) ON CONFLICT (id) DO NOTHING",
  );
  await client.query(
    "INSERT INTO institutions (id, name_ja, official) VALUES ('institution:ipa', '独立行政法人情報処理推進機構', true) ON CONFLICT (id) DO NOTHING",
  );
  await client.query(
    "INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active) VALUES ('source:it-passport:ipa-exam', 'institution:ipa', 'https://www.ipa.go.jp/shiken/', 'www.ipa.go.jp', 'official_exam_information', true), ('source:it-passport:jitec-home', 'institution:ipa', 'https://www3.jitec.ipa.go.jp/JitesCbt/', 'www3.jitec.ipa.go.jp', 'official_cbt_entry', true), ('source:it-passport:jitec-application', 'institution:ipa', 'https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html', 'www3.jitec.ipa.go.jp', 'official_cbt_application', true) ON CONFLICT (id) DO NOTHING",
  );
  console.log(
    `Seeded ${launchQualifications.length} stable qualification records (no dynamic facts).`,
  );
} finally {
  await client.end();
}
