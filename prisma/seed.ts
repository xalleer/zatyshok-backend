import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Починаємо seeding бази даних...');

  // 1. Очищення старих даних (корисно під час розробки)
  // Видаляємо юзерів, а завдяки onDelete: Cascade видаляться і їхні Property, Units та Bookings
  await prisma.user.deleteMany();

  // 2. Створюємо Власника (HOST)
  const host = await prisma.user.create({
    data: {
      phone: '+380501112233',
      name: 'Олег (Власник)',
      role: 'HOST',
    },
  });

  // 3. Створюємо Клієнта (CLIENT)
  const client = await prisma.user.create({
    data: {
      phone: '+380679998877',
      name: 'Анна (Клієнт)',
      role: 'CLIENT',
    },
  });

  // 4. Створюємо Базу відпочинку (Property)
  // Зверни увагу: координати тут не передаємо, бо Prisma їх не розуміє
  const property = await prisma.property.create({
    data: {
      name: 'Глемпінг "Лісова Пісня"',
      slug: 'lisova-pisnya',
      description: 'Затишні куполи в сосновому лісі з панорамними вікнами.',
      city: 'Полтава',
      address: 'вул. Соснова, 1',
      hostId: host.id,
      policy: 'FLEXIBLE',
      images: [
        'https://res.cloudinary.com/demo/image/upload/sample.jpg', // Тестові лінки
      ],
    },
  });

  // 5. МАГІЯ POSTGIS: Оновлюємо координати бази через Raw SQL
  // ST_MakePoint приймає (довгота, широта).
  // 34.5514, 49.5883 - це приблизні координати Полтави
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(34.5514, 49.5883), 4326)
    WHERE id = ${property.id};
  `;

  // 6. Створюємо Одиниці оренди (Units) для цієї бази
  await prisma.unit.createMany({
    data: [
      {
        propertyId: property.id,
        name: 'Купол "Світанок"',
        description: 'Ідеально для романтичного вікенду на двох.',
        price: 250000, // 2500 грн (в копійках)
        capacity: 2,
        features: ['WiFi', 'Кондиціонер', 'Чан', 'Двоспальне ліжко'],
      },
      {
        propertyId: property.id,
        name: 'A-Frame "Захід"',
        description: 'Великий будинок для компанії з власною терасою.',
        price: 450000, // 4500 грн
        capacity: 4,
        features: ['WiFi', 'Камін', 'Тераса', 'Мангал'],
      },
    ],
  });

  console.log('✅ Seeding успішно завершено! Тестові дані додано.');
}

main()
  .catch((e) => {
    console.error('❌ Помилка під час seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
