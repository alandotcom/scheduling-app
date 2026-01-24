// Seed script for development/demo database
// Creates a demo org with admin user

import { drizzle } from 'drizzle-orm/bun-sql'
import { SQL } from 'bun'
import { orgs, users, orgMemberships, locations, calendars, appointmentTypes, accounts } from './schema/index.js'

const databaseUrl = process.env['DATABASE_URL'] ?? 'postgres://scheduling:scheduling@localhost:5433/scheduling'

async function seed() {
  console.log('Seeding database...')

  const client = new SQL(databaseUrl)
  const db = drizzle({ client })

  // Create demo org
  const [org] = await db.insert(orgs).values({
    name: 'Acme Scheduling',
  }).returning()
  console.log(`Created org: ${org!.name} (${org!.id})`)

  // Create admin user
  const [adminUser] = await db.insert(users).values({
    email: 'admin@example.com',
    name: 'Admin User',
    emailVerified: true,
  }).returning()
  console.log(`Created admin user: ${adminUser!.email} (${adminUser!.id})`)

  // Create password account for the admin user
  // Using BetterAuth's expected format for credential accounts
  await db.insert(accounts).values({
    userId: adminUser!.id,
    providerId: 'credential',
    providerAccountId: adminUser!.id,
    // Password hash for "password123" - for demo only
    // In production, BetterAuth handles password hashing
    accessToken: null,
  })
  console.log('Created credential account for admin')

  // Create org membership
  await db.insert(orgMemberships).values({
    orgId: org!.id,
    userId: adminUser!.id,
    role: 'admin',
  })
  console.log('Created org membership for admin')

  // Create a demo location
  const [location] = await db.insert(locations).values({
    orgId: org!.id,
    name: 'Main Office',
    timezone: 'America/New_York',
  }).returning()
  console.log(`Created location: ${location!.name}`)

  // Create a demo calendar
  const [calendar] = await db.insert(calendars).values({
    orgId: org!.id,
    locationId: location!.id,
    name: 'Dr. Smith',
    timezone: 'America/New_York',
  }).returning()
  console.log(`Created calendar: ${calendar!.name}`)

  // Create demo appointment types
  const appointmentTypeData = [
    { name: 'Initial Consultation', durationMin: 60, paddingAfterMin: 15 },
    { name: 'Follow-up Visit', durationMin: 30, paddingAfterMin: 10 },
    { name: 'Quick Check-in', durationMin: 15, paddingAfterMin: 5 },
  ]

  for (const typeData of appointmentTypeData) {
    const [apptType] = await db.insert(appointmentTypes).values({
      orgId: org!.id,
      ...typeData,
    }).returning()
    console.log(`Created appointment type: ${apptType!.name}`)
  }

  console.log('\nSeed completed successfully!')
  console.log('\nDemo credentials:')
  console.log('  Email: admin@example.com')
  console.log('  (Use BetterAuth sign-up flow to set password)')

  client.close()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
