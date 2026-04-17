import { PrismaClient } from '@prisma/client';
import { getIndiaStarterComplianceReadinessSummary } from './seed/index';
import { upsertIndiaTaxReferenceCatalog } from './seed/tax-reference-persistence';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding compliance dictionaries...');


  const complianceReadinessSummary = getIndiaStarterComplianceReadinessSummary();
  console.log('India starter compliance seed metadata loaded:', complianceReadinessSummary);

  await upsertIndiaTaxReferenceCatalog(prisma);
  console.log('India tax reference catalog (TaxReferenceEntry) upserted.');

  // 1. Core SAC Codes for Services
  const sacCodes = [
    { code: '998311', description: 'Management consulting and management services', igstRate: 18.0 },
    { code: '998312', description: 'Business consulting services', igstRate: 18.0 },
    { code: '998313', description: 'Information technology (IT) consulting and support services', igstRate: 18.0 },
    { code: '998314', description: 'Information technology (IT) design and development services', igstRate: 18.0 },
    { code: '998315', description: 'Hosting and information technology (IT) infrastructure provisioning services', igstRate: 18.0 },
    { code: '998319', description: 'Other information technology services n.e.c.', igstRate: 18.0 },
    { code: '998391', description: 'Specialty design services including interior design, fashion design, etc.', igstRate: 18.0 },
    { code: '998361', description: 'Advertising Services', igstRate: 18.0 },
  ];

  // 2. Core NIC-2008 Codes for IT & Services
  const nicCodes = [
    { code: '62011', description: 'Writing, modifying, testing of computer program to meet the needs of a particular client' },
    { code: '62012', description: 'Web-page designing' },
    { code: '62013', description: 'Providing software support and maintenance to the clients' },
    { code: '62020', description: 'Computer consultancy and computer facilities management activities' },
    { code: '62099', description: 'Other information technology and computer service activities n.e.c' },
    { code: '63111', description: 'Data processing activities including report writing' },
    { code: '63112', description: 'Web hosting activities' },
    { code: '73100', description: 'Advertising' },
    { code: '74101', description: 'Fashion design related to textiles, wearing apparel, shoes, jewelry' },
    { code: '74109', description: 'Other specialized design activities n.e.c.' }
  ];

  // Seed SAC Codes (Using upsert so you can run this script multiple times safely)
  for (const sac of sacCodes) {
    await prisma.sACCode.upsert({
      where: { code: sac.code },
      update: {},
      create: sac,
    });
  }

  // Seed NIC Codes
  for (const nic of nicCodes) {
    await prisma.nICCode.upsert({
      where: { code: nic.code },
      update: {},
      create: nic,
    });
  }

  console.log('✅ Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });