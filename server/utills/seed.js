const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Merchant ─────────────────────────────────────────────────────────────
  const merchant = await prisma.merchant.upsert({
    where: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    update: {},
    create: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: 'Singitronic Store',
      description: 'Official Singitronic fashion store',
      email: 'store@singitronic.com',
      phone: '+2348012345678',
      address: '123 Fashion Street, Lagos',
      status: 'ACTIVE',
    }
  });
  console.log(`✅ Merchant: ${merchant.name} (${merchant.id})`);

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Men' },
      update: {},
      create: { name: 'Men' }
    }),
    prisma.category.upsert({
      where: { name: 'Women' },
      update: {},
      create: { name: 'Women' }
    }),
    prisma.category.upsert({
      where: { name: 'Accessories' },
      update: {},
      create: { name: 'Accessories' }
    }),
    prisma.category.upsert({
      where: { name: 'Footwear' },
      update: {},
      create: { name: 'Footwear' }
    }),
  ]);
  console.log(`✅ Categories: ${categories.map(c => c.name).join(', ')}`);

  const [men, women, accessories, footwear] = categories;

  // ─── Products ─────────────────────────────────────────────────────────────
  const products = await Promise.all([
    prisma.product.upsert({
      where: { slug: 'classic-white-tshirt' },
      update: {},
      create: {
        slug: 'classic-white-tshirt',
        title: 'Classic White T-Shirt',
        mainImage: 'classic-white-tshirt.webp',
        price: 5999.00,
        rating: 4,
        description: 'A clean, minimalist white t-shirt made from 100% cotton. Perfect for everyday wear.',
        manufacturer: 'Singitronic Basics',
        inStock: 50,
        inStockReserved: 0,
        categoryId: men.id,
        merchantId: merchant.id,
      }
    }),
    prisma.product.upsert({
      where: { slug: 'floral-summer-dress' },
      update: {},
      create: {
        slug: 'floral-summer-dress',
        title: 'Floral Summer Dress',
        mainImage: 'floral-summer-dress.webp',
        price: 15999.00,
        rating: 5,
        description: 'Light and breezy floral dress perfect for summer outings. Available in multiple sizes.',
        manufacturer: 'Singitronic Women',
        inStock: 30,
        inStockReserved: 0,
        categoryId: women.id,
        merchantId: merchant.id,
      }
    }),
    prisma.product.upsert({
      where: { slug: 'leather-wrist-watch' },
      update: {},
      create: {
        slug: 'leather-wrist-watch',
        title: 'Leather Wrist Watch',
        mainImage: 'leather-wrist-watch.webp',
        price: 25999.00,
        rating: 5,
        description: 'Elegant leather strap wrist watch with Japanese quartz movement.',
        manufacturer: 'Singitronic Accessories',
        inStock: 15,
        inStockReserved: 0,
        categoryId: accessories.id,
        merchantId: merchant.id,
      }
    }),
    prisma.product.upsert({
      where: { slug: 'white-sneakers' },
      update: {},
      create: {
        slug: 'white-sneakers',
        title: 'White Sneakers',
        mainImage: 'white-sneakers.webp',
        price: 19999.00,
        rating: 4,
        description: 'Clean white sneakers with memory foam insole. Great for casual and semi-formal wear.',
        manufacturer: 'Singitronic Footwear',
        inStock: 25,
        inStockReserved: 0,
        categoryId: footwear.id,
        merchantId: merchant.id,
      }
    }),
    prisma.product.upsert({
      where: { slug: 'slim-fit-chinos' },
      update: {},
      create: {
        slug: 'slim-fit-chinos',
        title: 'Slim Fit Chinos',
        mainImage: 'slim-fit-chinos.webp',
        price: 12999.00,
        rating: 4,
        description: 'Versatile slim fit chino trousers. Available in navy, khaki, and olive.',
        manufacturer: 'Singitronic Basics',
        inStock: 40,
        inStockReserved: 0,
        categoryId: men.id,
        merchantId: merchant.id,
      }
    }),
  ]);
  console.log(`✅ Products: ${products.map(p => p.title).join(', ')}`);

  // ─── Admin User ───────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Admin@1234', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@singitronic.com' },
    update: {},
    create: {
      email: 'admin@singitronic.com',
      password: hashedPassword,
      role: 'admin',
    }
  });
  console.log(`✅ Admin user: ${admin.email}`);

  // ─── Test User ────────────────────────────────────────────────────────────
  const testUserPassword = await bcrypt.hash('Test@1234', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@singitronic.com' },
    update: {},
    create: {
      email: 'test@singitronic.com',
      password: testUserPassword,
      role: 'user',
    }
  });
  console.log(`✅ Test user: ${testUser.email}`);

  console.log('\n🎉 Seed complete!');
  console.log('\n📋 Summary:');
  console.log(`   Merchant ID : ${merchant.id}`);
  console.log(`   Products    : ${products.length}`);
  console.log(`   Categories  : ${categories.length}`);
  console.log(`   Admin email : admin@singitronic.com`);
  console.log(`   Admin pass  : Admin@1234`);
  console.log(`   Test email  : test@singitronic.com`);
  console.log(`   Test pass   : Test@1234`);
  console.log('\n📦 Product IDs:');
  products.forEach(p => console.log(`   ${p.slug}: ${p.id}`));
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });