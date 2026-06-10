"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./generated/client");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
require("dotenv/config");
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('🌱 Починаємо seeding бази даних...');
    await prisma.user.deleteMany();
    const host = await prisma.user.create({
        data: {
            phone: '+380501112233',
            name: 'Олег (Власник)',
            role: 'HOST',
        },
    });
    const client = await prisma.user.create({
        data: {
            phone: '+380679998877',
            name: 'Анна (Клієнт)',
            role: 'CLIENT',
        },
    });
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
                'https://res.cloudinary.com/demo/image/upload/sample.jpg',
            ],
        },
    });
    await prisma.$executeRaw `
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(34.5514, 49.5883), 4326)
    WHERE id = ${property.id};
  `;
    await prisma.unit.createMany({
        data: [
            {
                propertyId: property.id,
                name: 'Купол "Світанок"',
                description: 'Ідеально для романтичного вікенду на двох.',
                price: 250000,
                capacity: 2,
                features: ['WiFi', 'Кондиціонер', 'Чан', 'Двоспальне ліжко'],
            },
            {
                propertyId: property.id,
                name: 'A-Frame "Захід"',
                description: 'Великий будинок для компанії з власною терасою.',
                price: 450000,
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
//# sourceMappingURL=seed.js.map