// Seed script for development/demo database
// Creates a demo org with admin user
// IDEMPOTENT: Safe to run multiple times

import { drizzle } from "drizzle-orm/bun-sql";
import { sql, eq } from "drizzle-orm";
import { SQL } from "bun";
import {
  orgs,
  users,
  orgMemberships,
  locations,
  calendars,
  appointmentTypes,
  appointmentTypeCalendars,
} from "@scheduling/db/schema";
import { auth } from "../lib/auth.js";

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/scheduling";

async function seed() {
  console.log("Seeding database...");

  const client = new SQL(databaseUrl);
  const db = drizzle({ client });

  // Check if admin user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, "admin@example.com"))
    .limit(1);

  let adminUser: { id: string; email: string };

  if (existingUser.length > 0) {
    console.log(`Admin user already exists: ${existingUser[0]!.email}`);
    adminUser = existingUser[0]!;
  } else {
    // Use BetterAuth to create user with proper password hashing
    console.log("Creating admin user via BetterAuth...");
    const result = await auth.api.signUpEmail({
      body: {
        name: "Admin User",
        email: "admin@example.com",
        password: "password123",
      },
    });

    if (!result.user) {
      throw new Error("Failed to create admin user via BetterAuth");
    }

    adminUser = { id: result.user.id, email: result.user.email };
    console.log(`Created admin user: ${adminUser.email} (${adminUser.id})`);
  }

  // Check if org already exists
  const existingOrg = await db
    .select()
    .from(orgs)
    .where(eq(orgs.name, "Acme Scheduling"))
    .limit(1);

  let org: { id: string; name: string };

  if (existingOrg.length > 0) {
    console.log(`Org already exists: ${existingOrg[0]!.name}`);
    org = existingOrg[0]!;
  } else {
    const [newOrg] = await db
      .insert(orgs)
      .values({
        name: "Acme Scheduling",
      })
      .returning();
    org = newOrg!;
    console.log(`Created org: ${org.name} (${org.id})`);
  }

  // Set user context for RLS before inserting org_membership
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${adminUser.id}, false)`,
  );

  // Create org membership (use onConflictDoNothing for idempotency)
  const membershipResult = await db
    .insert(orgMemberships)
    .values({
      orgId: org.id,
      userId: adminUser.id,
      role: "owner",
    })
    .onConflictDoNothing()
    .returning();

  if (membershipResult.length > 0) {
    console.log("Created org membership for admin");
  } else {
    console.log("Org membership already exists");
  }

  // Clear user context, set org context for remaining RLS-protected tables
  await db.execute(sql`SELECT set_config('app.current_user_id', '', false)`);
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${org.id}, false)`,
  );

  // Create a demo location (check if exists first)
  const existingLocation = await db
    .select()
    .from(locations)
    .where(eq(locations.name, "Main Office"))
    .limit(1);

  let location: { id: string; name: string };

  if (existingLocation.length > 0) {
    console.log(`Location already exists: ${existingLocation[0]!.name}`);
    location = existingLocation[0]!;
  } else {
    const [newLocation] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: "Main Office",
        timezone: "America/New_York",
      })
      .returning();
    location = newLocation!;
    console.log(`Created location: ${location.name}`);
  }

  // Create a demo calendar (check if exists first)
  const existingCalendar = await db
    .select()
    .from(calendars)
    .where(eq(calendars.name, "Dr. Smith"))
    .limit(1);

  let calendar: { id: string; name: string };

  if (existingCalendar.length > 0) {
    console.log(`Calendar already exists: ${existingCalendar[0]!.name}`);
    calendar = existingCalendar[0]!;
  } else {
    const [newCalendar] = await db
      .insert(calendars)
      .values({
        orgId: org.id,
        locationId: location.id,
        name: "Dr. Smith",
        timezone: "America/New_York",
      })
      .returning();
    calendar = newCalendar!;
    console.log(`Created calendar: ${calendar.name}`);
  }

  // Create demo appointment types (check each one individually)
  const appointmentTypeData = [
    { name: "Initial Consultation", durationMin: 60, paddingAfterMin: 15 },
    { name: "Follow-up Visit", durationMin: 30, paddingAfterMin: 10 },
    { name: "Quick Check-in", durationMin: 15, paddingAfterMin: 5 },
  ];

  for (const typeData of appointmentTypeData) {
    const existing = await db
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.name, typeData.name))
      .limit(1);

    let appointmentType: { id: string; name: string };

    if (existing.length > 0) {
      console.log(`Appointment type already exists: ${typeData.name}`);
      appointmentType = existing[0]!;
    } else {
      const [apptType] = await db
        .insert(appointmentTypes)
        .values({
          orgId: org.id,
          ...typeData,
        })
        .returning();
      console.log(`Created appointment type: ${apptType!.name}`);
      appointmentType = apptType!;
    }

    const linked = await db
      .insert(appointmentTypeCalendars)
      .values({
        appointmentTypeId: appointmentType.id,
        calendarId: calendar.id,
      })
      .onConflictDoNothing()
      .returning();

    if (linked.length > 0) {
      console.log(
        `Linked appointment type to calendar: ${appointmentType.name} -> ${calendar.name}`,
      );
    } else {
      console.log(
        `Appointment type already linked: ${appointmentType.name} -> ${calendar.name}`,
      );
    }
  }

  // Clear org context
  await db.execute(sql`SELECT set_config('app.current_org_id', '', false)`);

  console.log("\nSeed completed successfully!");
  console.log("\nDemo credentials:");
  console.log("  Email: admin@example.com");
  console.log("  Password: password123");

  client.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
