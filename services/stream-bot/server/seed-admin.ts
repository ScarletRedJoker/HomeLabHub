import { db } from "./db";
import { users, platformConnections, botConfigs, messageHistory, botInstances } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function seedAdminUser() {
  console.log("🌱 Seeding admin user for multi-tenant migration...");

  try {
    const adminEmail = "admin@streambot.local";
    const adminPassword = "admin123";

    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.email, adminEmail),
    });

    let adminUserId: string;

    if (existingAdmin) {
      console.log("✅ Admin user already exists:", adminEmail);
      adminUserId = existingAdmin.id;
    } else {
      console.log("📝 Creating admin user:", adminEmail);
      const passwordHash = await bcrypt.hash(adminPassword, 10);

      const [newAdmin] = await db
        .insert(users)
        .values({
          email: adminEmail,
          passwordHash,
          role: "admin",
          isActive: true,
        })
        .returning();

      adminUserId = newAdmin.id;
      console.log("✅ Admin user created successfully!");
      console.log("📧 Email:", adminEmail);
      console.log("🔑 Password:", adminPassword);
      console.log("⚠️  IMPORTANT: Change this password after first login!");
    }

    const existingPlatformConnections = await db
      .select()
      .from(platformConnections);

    if (existingPlatformConnections.length > 0) {
      console.log(
        `🔄 Found ${existingPlatformConnections.length} platform connections without userId`
      );
      for (const connection of existingPlatformConnections) {
        if (!connection.userId) {
          await db
            .update(platformConnections)
            .set({ userId: adminUserId })
            .where(eq(platformConnections.id, connection.id));
          console.log(
            `  ✓ Linked ${connection.platform} connection to admin user`
          );
        }
      }
    }

    const existingMessages = await db.select().from(messageHistory);
    if (existingMessages.length > 0) {
      console.log(
        `🔄 Found ${existingMessages.length} message history records without userId`
      );
      for (const message of existingMessages) {
        if (!message.userId) {
          await db
            .update(messageHistory)
            .set({ userId: adminUserId })
            .where(eq(messageHistory.id, message.id));
        }
      }
      console.log(`  ✓ Linked all message history to admin user`);
    }

    const existingBotConfig = await db.query.botConfigs.findFirst({
      where: eq(botConfigs.userId, adminUserId),
    });

    if (!existingBotConfig) {
      console.log("📝 Creating default bot config for admin user...");
      await db.insert(botConfigs).values({
        userId: adminUserId,
        intervalMode: "manual",
        fixedIntervalMinutes: 30,
        randomMinMinutes: 15,
        randomMaxMinutes: 60,
        aiModel: "gpt-5-mini",
        aiPromptTemplate:
          "Generate a fun, interesting, and engaging fact similar to a Snapple fact. Keep it under 200 characters.",
        aiTemperature: 1,
        enableChatTriggers: true,
        chatKeywords: ["!snapple", "!fact"],
        activePlatforms: [],
        isActive: false,
      });
      console.log("✅ Bot config created successfully!");
    }

    const existingBotInstance = await db.query.botInstances.findFirst({
      where: eq(botInstances.userId, adminUserId),
    });

    if (!existingBotInstance) {
      console.log("📝 Creating bot instance record for admin user...");
      await db.insert(botInstances).values({
        userId: adminUserId,
        status: "stopped",
      });
      console.log("✅ Bot instance created successfully!");
    }

    console.log("\n🎉 Migration completed successfully!");
    console.log("\n📋 Summary:");
    console.log(`  - Admin user: ${adminEmail}`);
    console.log(
      `  - Platform connections: ${existingPlatformConnections.length}`
    );
    console.log(`  - Message history: ${existingMessages.length}`);
    console.log("  - Bot config: Created");
    console.log("  - Bot instance: Created");
    console.log(
      "\n⚠️  Remember to change the admin password after first login!"
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

seedAdminUser()
  .then(() => {
    console.log("\n✅ Seed script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seed script failed:", error);
    process.exit(1);
  });
