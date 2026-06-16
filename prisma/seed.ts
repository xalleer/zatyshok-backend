import { PrismaClient } from './generated/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting database seed...');

  await prisma.user.deleteMany();

  const host = await prisma.user.create({
    data: {
      phone: '+380501112233',
      name: 'Oleh (Host)',
      role: 'HOST',
    },
  });

  await prisma.user.create({
    data: {
      phone: '+380679998877',
      name: 'Anna (Client)',
      role: 'CLIENT',
    },
  });

  const propertyCategory = await prisma.propertyCategory.create({
    data: { name: 'Glamping', slug: 'glamping' },
  });

  const unitCategory = await prisma.unitCategory.create({
    data: { name: 'Dome', slug: 'dome' },
  });

  const featureNames = [
    'WiFi',
    'Air conditioner',
    'Hot tub',
    'Double bed',
    'Fireplace',
    'Terrace',
    'Grill',
  ];

  const features = await Promise.all(
    featureNames.map((name) =>
      prisma.feature.create({
        data: {
          name,
          slug: name.toLowerCase().replaceAll(' ', '-'),
        },
      }),
    ),
  );
  const featureByName = new Map(features.map((feature) => [feature.name, feature.id]));

  const property = await prisma.property.create({
    data: {
      name: 'Lisova Pisnya Glamping',
      slug: 'lisova-pisnya',
      description: 'Cozy domes in a pine forest with panoramic windows.',
      city: 'Poltava',
      address: 'Sosnova St, 1',
      hostId: host.id,
      categoryId: propertyCategory.id,
      policy: 'FLEXIBLE',
      status: 'ACTIVE',
      images: {
        create: [
          {
            url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(34.5514, 49.5883), 4326)
    WHERE id = ${property.id};
  `;

  await prisma.unit.create({
    data: {
      propertyId: property.id,
      categoryId: unitCategory.id,
      name: 'Dome "Svitanok"',
      description: 'Ideal for a romantic weekend for two.',
      price: 250000,
      capacity: 2,
      features: {
        connect: ['WiFi', 'Air conditioner', 'Hot tub', 'Double bed'].map(
          (name) => ({ id: featureByName.get(name)! }),
        ),
      },
    },
  });

  await prisma.unit.create({
    data: {
      propertyId: property.id,
      categoryId: unitCategory.id,
      name: 'A-Frame "Zakhid"',
      description: 'A large cabin for a group with a private terrace.',
      price: 450000,
      capacity: 4,
      features: {
        connect: ['WiFi', 'Fireplace', 'Terrace', 'Grill'].map((name) => ({
          id: featureByName.get(name)!,
        })),
      },
    },
  });

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
