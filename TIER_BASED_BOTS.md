# Tier-Based Bot Deployments

## Overview

CordBot uses a tier-based deployment system where each Discord guild gets its own isolated Fly.io deployment. This document outlines the architecture for managing different deployment tiers (free, starter, pro, business) with query-based usage limits.

## Architecture

### Two-Collection System

We use separate collections for user-facing and internal data:

1. **`guilds/{guildId}`** - User-facing guild information and status
2. **`guildDeployments/{guildId}`** - Internal deployment configuration + usage tracking

This separation provides:

- **Security**: All internal data (Fly.io details, cost tracking) is internal
- **Performance**: All deployment data in one document (no joins needed)
- **Clean separation**: User-facing data vs internal operational data
- **Simplicity**: Users access their data via Cloud Functions, not direct reads

---

## Schema

### Overview

Two collections provide clean separation:

1. **`guilds/{guildId}`** - User-facing guild info (name, icon, owner, status) - users can read their own
2. **`guildDeployments/{guildId}`** - Internal-only (Fly.io details, tier, features, cost, usage)

### Collection: `guilds/{guildId}`

Basic guild information. Minimal, mostly static data.

```typescript
interface Guild {
  guildId: string;
  guildName: string;
  guildIcon: string | null;

  // Status
  status: "active" | "suspended" | "deleted";
  suspendedReason?: "query_limit" | "payment_failed" | "manual";
  suspendedAt?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

### Collection: `guildDeployments/{guildId}`

Internal deployment configuration, Fly.io details, and usage tracking.

**Contains:**

- Fly.io operational details (appName, machineId, volumeId)
- Deployment configuration (tier, features)
- Query limits and usage (queriesTotal, queriesRemaining, queriesUsed)
- Cost tracking (totalCost, costThisPeriod, costByType)
- Query breakdown by type

**Access:** Internal only. Users access relevant info via Cloud Functions.

```typescript
interface GuildDeployment {
  guildId: string;

  // Fly.io deployment
  appName: string; // e.g., "cordbot-abc123def"
  machineId: string;
  volumeId: string;

  // Deployment tier
  deploymentType: "free" | "starter" | "pro" | "business";

  // Query limits
  queriesTotal: number; // 25 (free), 500/1200/3000 (paid)
  queriesRemaining: number; // Current remaining
  queriesUsed: number; // Total consumed in period

  // Cost tracking (internal)
  totalCost: number; // Lifetime accumulated cost
  costThisPeriod: number; // Cost in current billing period

  // Query type breakdown (internal)
  queryTypes: {
    discord_message: number; // User-triggered queries
    scheduled_task: number; // Cron-triggered queries
  };

  // Cost breakdown by type (internal)
  costByType: {
    discord_message: number;
    scheduled_task: number;
  };

  // Period tracking (for paid tiers)
  periodStart: string; // When period started
  periodEnd: string | null; // When period ends (null for free)

  // Timestamps
  lastQueryAt: string;
  firstQueryAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### Collection: `config/freeTier`

Tracks available free tier slots.

```typescript
interface FreeTierConfig {
  maxSlots: number; // e.g., 10 free deployments available (manually increased)
  usedSlots: number; // Total free deployments created (only increments, never decrements)
  queriesPerSlot: number; // 25 queries per free deployment
}
```

**Note:** `usedSlots` only increments when provisioning free tier bots. It never decrements (not on upgrade, not on deprovision). The admin manually increases `maxSlots` as needed to allow more free tier signups.

---

## Deployment Tiers

### Free Tier

- **Queries**: 25 total (lifetime)
- **Cost**: $0 for user
- **Infrastructure**: ~$2-3/month (we absorb)
- **Deprovisioning**: Automatic when queries exhausted (to save costs). The machine is manually deprovisioned.
- **Slots**: Limited by `maxSlots` (manually increased as needed, starts at 10)

### Paid Tiers (Future)

**Starter** - $19/month

- 500 queries/month
- Resets monthly on billing date
- Dedicated instance

**Pro** - $39/month

- 1,200 queries/month
- Resets monthly on billing date
- Dedicated instance
- Priority support

**Business** - $79/month

- 3,000 queries/month
- Resets monthly on billing date
- Dedicated instance
- Premium support

---

## Free Tier Provisioning Flow

### 1. User Clicks "Add to Discord"

```typescript
// packages/functions/src/provision.ts

export const provisionCordBot = onCall(async (request) => {
  const { userId, guildId, anthropicApiKey } = request.data;

  // Check if bot already exists
  const [existingGuild, existingDeployment] = await Promise.all([
    db.collection("guilds").doc(guildId).get(),
    db.collection("guildDeployments").doc(guildId).get(),
  ]);

  if (existingGuild.exists || existingDeployment.exists) {
    throw new HttpsError(
      "already-exists",
      "CordBot already active in this guild"
    );
  }

  // Check and reserve free tier slot (using transaction to prevent race conditions)
  const freeTierRef = db.collection("config").doc("freeTier");

  await db.runTransaction(async (transaction) => {
    const freeTierDoc = await transaction.get(freeTierRef);
    const freeTier = freeTierDoc.data() as FreeTierConfig;

    if (freeTier.usedSlots >= freeTier.maxSlots) {
      throw new HttpsError(
        "resource-exhausted",
        `No free tier slots available (${freeTier.usedSlots}/${freeTier.maxSlots}). ` +
          `Please try again later or upgrade to a paid plan.`
      );
    }

    // Reserve slot by incrementing counter
    transaction.update(freeTierRef, {
      usedSlots: FieldValue.increment(1),
    });
  });

  // ... continue provisioning ...
});
```

### 2. Provision Fly.io Resources

```typescript
// Create Fly.io app
await flyApi.createApp(appName, flyApiToken);

// Create volume (1GB)
await flyApi.createVolume(appName, volumeName, 1, flyApiToken);

// Create machine with environment variables
const machineConfig = {
  image: "christianalfoni/cordbot-agent:latest",
  env: {
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN, // Single shared token
    DISCORD_GUILD_ID: guildId, // Filter events to this guild
    ANTHROPIC_API_KEY: anthropicApiKey, // User-provided
    BOT_MODE: "shared",
    FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT,
  },
  mounts: [{ volume: volumeName, path: "/workspace" }], // Persists Claude data + channel files
  guest: { cpus: 1, memory_mb: 1024 },
};

const machine = await flyApi.createMachine(appName, machineConfig, flyApiToken);
```

### 3. Create Guild Documents

```typescript
const now = new Date().toISOString();

// Guild information (basic info only)
await db.collection("guilds").doc(guildId).set({
  guildId,
  guildName: guildInfo.name,
  guildIcon: guildInfo.icon,
  guildOwnerId: guildInfo.owner_id,
  addedBy: userId,
  status: "active",
  createdAt: now,
  updatedAt: now,
});

// Deployment configuration + tracking (combined)
await db
  .collection("guildDeployments")
  .doc(guildId)
  .set({
    guildId,

    // Fly.io deployment
    appName,
    machineId: machine.id,
    volumeId: volumeName,

    // Tier
    deploymentType: "free",

    // Features
    features: {
      trackMessages: true,
      dailySummaries: true,
      discordTools: true,
    },

    // Query limits
    queriesTotal: 25,
    queriesRemaining: 25,
    queriesUsed: 0,

    // Cost tracking
    totalCost: 0,
    costThisPeriod: 0,

    // Query breakdown
    queryTypes: { discord_message: 0, scheduled_task: 0 },
    costByType: { discord_message: 0, scheduled_task: 0 },

    // Period
    periodStart: now,
    periodEnd: null,

    // Timestamps
    lastQueryAt: now,
    firstQueryAt: now,
    createdAt: now,
    updatedAt: now,
  });
```

**Note:** The free tier slot was already reserved in step 1 using a transaction.

---

## Query Limit Management

### Bot State Manager

The bot maintains in-memory state to minimize Firebase calls.

```typescript
// packages/bot/src/query-limits/state.ts

class QueryLimitManager {
  private state: QueryLimitState;
  private guildId: string;

  async initialize(): Promise<void> {
    // On startup, check limits once
    const result = await checkQueryLimit({ guildId: this.guildId });

    this.state = {
      deploymentType: result.deploymentType,
      isBlocked: result.blocked,
      queriesRemaining: result.queriesRemaining,
      queriesTotal: result.totalQueries,
    };
  }

  async canProceedWithQuery(): Promise<boolean> {
    // If not blocked, proceed without Firebase call
    if (!this.state.isBlocked) {
      return true;
    }

    // If blocked, check Firebase (user may have upgraded)
    const result = await checkQueryLimit({ guildId: this.guildId });
    this.state.isBlocked = result.blocked;

    return result.canProceed;
  }

  async trackQuery(
    type: string,
    cost: number,
    success: boolean
  ): Promise<void> {
    const result = await trackQueryLimit({
      guildId: this.guildId,
      type,
      cost,
      success,
    });

    // Update local state
    this.state.queriesRemaining = result.queriesRemaining;

    if (result.limitReached) {
      this.state.isBlocked = true;
    }
  }
}
```

### Check Query Limit (Pre-Query)

Only called when bot is already in blocked state (checking for upgrade).

```typescript
// packages/functions/src/query-limits.ts

export const checkQueryLimit = onCall(async (request) => {
  const { guildId } = request.data;

  const [guildDoc, deploymentDoc] = await Promise.all([
    db.collection("guilds").doc(guildId).get(),
    db.collection("guildDeployments").doc(guildId).get(),
  ]);

  const guild = guildDoc.data() as Guild;
  const deployment = deploymentDoc.data() as GuildDeployment;

  // Check if suspended
  if (guild.status === "suspended") {
    return {
      canProceed: false,
      blocked: true,
      reason: guild.suspendedReason,
      queriesRemaining: 0,
    };
  }

  // Check query limit
  if (deployment.queriesRemaining <= 0) {
    // Suspend guild
    await db.collection("guilds").doc(guildId).update({
      status: "suspended",
      suspendedReason: "query_limit",
      suspendedAt: new Date().toISOString(),
    });

    // If free tier, deprovision
    if (deployment.deploymentType === "free") {
      await deprovisionFreeGuild(guildId);
    }

    return { canProceed: false, blocked: true, reason: "query_limit" };
  }

  return {
    canProceed: true,
    blocked: false,
    deploymentType: deployment.deploymentType,
    queriesRemaining: deployment.queriesRemaining,
    totalQueries: deployment.queriesTotal,
  };
});
```

### Track Query Limit (Post-Query)

Called after every successful query to update usage.

```typescript
export const trackQueryLimit = onCall(async (request) => {
  const { guildId, type, cost, success } = request.data;

  const guildRef = db.collection("guilds").doc(guildId);
  const deploymentRef = db.collection("guildDeployments").doc(guildId);

  // Use transaction to safely decrement queries and check limit
  const result = await db.runTransaction(async (transaction) => {
    const [guildDoc, deploymentDoc] = await Promise.all([
      transaction.get(guildRef),
      transaction.get(deploymentRef),
    ]);

    const guild = guildDoc.data() as Guild;
    const deployment = deploymentDoc.data() as GuildDeployment;

    if (guild.status === "suspended") {
      return { blocked: true, reason: guild.suspendedReason };
    }

    if (success) {
      const now = new Date().toISOString();

      // Update deployment document with usage and cost tracking
      transaction.update(deploymentRef, {
        queriesRemaining: FieldValue.increment(-1),
        queriesUsed: FieldValue.increment(1),
        totalCost: FieldValue.increment(cost),
        costThisPeriod: FieldValue.increment(cost),
        [`queryTypes.${type}`]: FieldValue.increment(1),
        [`costByType.${type}`]: FieldValue.increment(cost),
        lastQueryAt: now,
        updatedAt: now,
      });
    }

    const newQueriesRemaining = deployment.queriesRemaining - 1;

    // Check if limit reached
    if (newQueriesRemaining <= 0) {
      // Suspend guild
      transaction.update(guildRef, {
        status: "suspended",
        suspendedReason: "query_limit",
        suspendedAt: new Date().toISOString(),
      });

      return {
        limitReached: true,
        blocked: true,
        queriesRemaining: 0,
        deploymentType: deployment.deploymentType,
        shouldDeprovision: deployment.deploymentType === "free",
        upgradeUrl: "https://cordbot.io/upgrade",
      };
    }

    return {
      limitReached: false,
      queriesRemaining: newQueriesRemaining,
      deploymentType: deployment.deploymentType,
      shouldDeprovision: false,
    };
  });

  // Deprovision if free tier (outside transaction to avoid long-running operations)
  if (result.shouldDeprovision) {
    await deprovisionFreeGuild(guildId);
  }

  return result;
});
```

---

## Free Tier Deprovisioning

When a free tier bot reaches 0 queries, it is automatically deprovisioned to save infrastructure costs.

**Note:** Deprovisioning does NOT decrement the `usedSlots` counter. The slot counter only increments to track total free tier signups over time.

```typescript
async function deprovisionFreeGuild(guildId: string): Promise<void> {
  const deploymentDoc = await db
    .collection("guildDeployments")
    .doc(guildId)
    .get();
  const deployment = deploymentDoc.data() as GuildDeployment;

  if (deployment.deploymentType !== "free") {
    return; // Only deprovision free tier
  }

  console.log(`[Deprovision] Removing free tier deployment for ${guildId}`);

  try {
    // 1. Delete Fly.io resources (app, machine, volume)
    await flyApi.deleteApp(deployment.appName, flyApiToken);

    // 2. Update guild status
    await db.collection("guilds").doc(guildId).update({
      status: "deleted",
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Deprovision] ✅ Free tier deployment removed for ${guildId}`);

    // 3. Send notification to Discord
    await sendDeprovisionNotification(guildId);
  } catch (error) {
    console.error(`[Deprovision] Error:`, error);
    // Note: Guild is already suspended, so bot won't respond anyway
  }
}
```

---

## Bot Integration

### Event Handler

```typescript
// packages/bot/src/discord/events.ts

async function handleMessageWithLock(
  message: Message,
  sessionManager: SessionManager,
  queryLimitManager: QueryLimitManager
) {
  // Check if can proceed (only hits Firebase if already blocked)
  const canProceed = await queryLimitManager.canProceedWithQuery();

  if (!canProceed) {
    await message.reply(queryLimitManager.getBlockedMessage());
    return;
  }

  // Execute query
  let success = false;
  let cost = 0;

  try {
    const response = await sessionManager.handleMessage(message);
    success = true;
    cost = response.usage?.total_cost || estimateCost(response);
  } catch (error) {
    console.error("Query failed:", error);
  } finally {
    // Track query (updates local state)
    await queryLimitManager.trackQuery("discord_message", cost, success);
  }
}
```

### Cron Jobs

```typescript
// packages/bot/src/cron/runner.ts

async executeCronJob(job: CronJob): Promise<void> {
  const canProceed = await this.queryLimitManager.canProceedWithQuery();

  if (!canProceed) {
    console.log(`[Cron] Skipping "${job.name}" - query limit reached`);
    return;
  }

  let success = false;
  let cost = 0;

  try {
    const result = await this.runCronTask(job);
    success = true;
    cost = result.usage?.total_cost || 0;
  } catch (error) {
    console.error(`[Cron] Job failed:`, error);
  } finally {
    await this.queryLimitManager.trackQuery('scheduled_task', cost, success);
  }
}
```

---

## User-Facing Functions

Users access their deployment info via Cloud Functions (not direct Firestore reads).

```typescript
// packages/functions/src/user-api.ts

/**
 * Get deployment info for a guild (user-facing)
 */
export const getGuildDeploymentInfo = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const { guildId } = request.data;

  // Verify user owns this guild
  const guildDoc = await db.collection("guilds").doc(guildId).get();
  const guild = guildDoc.data() as Guild;

  if (guild.addedBy !== request.auth.uid) {
    throw new HttpsError("permission-denied", "You do not own this guild");
  }

  // Get deployment info (internal doc, but we expose only what user needs)
  const deploymentDoc = await db
    .collection("guildDeployments")
    .doc(guildId)
    .get();
  const deployment = deploymentDoc.data() as GuildDeployment;

  // Return only user-relevant info (hide internal details)
  return {
    guildId: guild.guildId,
    guildName: guild.guildName,
    guildIcon: guild.guildIcon,
    status: guild.status,
    suspendedReason: guild.suspendedReason,

    // Deployment info (user-relevant)
    deploymentType: deployment.deploymentType,
    queriesRemaining: deployment.queriesRemaining,
    queriesTotal: deployment.queriesTotal,
    queriesUsed: deployment.queriesUsed,
    features: deployment.features,

    // Timestamps
    createdAt: guild.createdAt,
    lastQueryAt: deployment.lastQueryAt,
  };
});

/**
 * List all guilds for a user
 */
export const listUserGuilds = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  // Get guilds where user is the one who added the bot
  const guildsSnapshot = await db
    .collection("guilds")
    .where("addedBy", "==", request.auth.uid)
    .get();

  const guilds = await Promise.all(
    guildsSnapshot.docs.map(async (doc) => {
      const guild = doc.data() as Guild;
      const deploymentDoc = await db
        .collection("guildDeployments")
        .doc(guild.guildId)
        .get();
      const deployment = deploymentDoc.data() as GuildDeployment;

      return {
        guildId: guild.guildId,
        guildName: guild.guildName,
        guildIcon: guild.guildIcon,
        status: guild.status,
        deploymentType: deployment.deploymentType,
        queriesRemaining: deployment.queriesRemaining,
        queriesTotal: deployment.queriesTotal,
        createdAt: guild.createdAt,
      };
    })
  );

  return { guilds };
});
```

---

## Security Rules

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Guilds - basic guild info
    // Users can read guilds they added
    match /guilds/{guildId} {
      allow read: if request.auth != null &&
        request.auth.uid == resource.data.addedBy;
      allow write: if false; // Only via Cloud Functions
    }

    // Guild deployments - INTERNAL ONLY
    // No direct access, users get data via Cloud Functions
    match /guildDeployments/{guildId} {
      allow read, write: if false; // Only via Cloud Functions
    }

    // Free tier config - internal only
    match /config/freeTier {
      allow read, write: if false; // Only via Cloud Functions
    }
  }
}
```

---

## Migration to Paid Tiers

When a user upgrades from free to paid:

```typescript
export const upgradeGuild = onCall(async (request) => {
  const { guildId, targetTier } = request.data;
  // targetTier: 'starter' | 'pro' | 'business'

  const tierLimits = {
    starter: 500,
    pro: 1200,
    business: 3000,
  };

  const now = new Date().toISOString();
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  // Update guild status (reactivate if suspended)
  await db.collection("guilds").doc(guildId).update({
    status: "active",
    suspendedReason: FieldValue.delete(),
    updatedAt: now,
  });

  // Update deployment document with new tier and reset usage
  await db.collection("guildDeployments").doc(guildId).update({
    deploymentType: targetTier,
    queriesTotal: tierLimits[targetTier],
    queriesRemaining: tierLimits[targetTier],
    queriesUsed: 0, // Reset for new period
    costThisPeriod: 0, // Reset period cost
    periodStart: now,
    periodEnd: nextBillingDate.toISOString(),
    updatedAt: now,
  });

  // Note: We do NOT decrement free tier usedSlots on upgrade
  // The counter only increments to track total signups over time

  return { success: true };
});
```

---

## Configuration

### Initialize Free Tier

Run once to set up free tier configuration:

```typescript
// packages/functions/src/init-config.ts

export async function initializeFreeTierConfig() {
  await db.collection("config").doc("freeTier").set({
    maxSlots: 10, // Start with 10 free deployment slots
    usedSlots: 0, // Total free deployments created (only increments)
    queriesPerSlot: 25, // Each free deployment gets 25 queries
  });

  console.log("✅ Free tier config initialized");
}
```

**Slot Management:**

- `usedSlots` only increments when provisioning free tier bots
- Admin manually increases `maxSlots` as needed to allow more signups
- Upgrading or deprovisioning does NOT decrement `usedSlots`

### Adjust Free Tier Capacity

Manually update `maxSlots` in the Firestore console as needed to allow more free tier signups.

---

## Key Benefits

1. **Simplicity**

   - Only two collections (guilds + deployments)
   - All deployment data in one document (no joins needed)
   - Easy to query and update

2. **Separation of Concerns**

   - Guild metadata separate from deployment/tracking
   - User-facing data vs internal operational data

3. **Security**

   - `guildDeployments` is completely internal
   - Users access data via Cloud Functions (controlled exposure)
   - No direct Firestore access to sensitive data (Fly.io details, costs)

4. **Performance**

   - All deployment data in one document (single read)
   - Quick limit checks from `queriesRemaining` field
   - Minimal Firebase calls (only when blocked or tracking)

5. **Cost Control**

   - Automatic deprovisioning of free tier when exhausted
   - Detailed cost analytics for internal reporting
   - Per-query cost tracking by type

6. **Scalability**

   - Easy to add new tiers (just update schema)
   - Configurable limits per tier
   - Shared bot token across deployments with guild-specific filtering

7. **User Experience**
   - Clear messaging when hitting limits
   - Automatic upgrade detection when blocked
   - Seamless migration from free to paid

---

## Next Steps

- [ ] Implement `checkQueryLimit` and `trackQueryLimit` functions with transactions
- [ ] Create `QueryLimitManager` class in bot
- [ ] Update bot event handlers to use query limit manager
- [ ] Implement free tier deprovisioning
- [ ] Implement user-facing functions (`getGuildDeploymentInfo`, `listUserGuilds`)
- [ ] Update Firestore security rules
- [ ] Update web UI to use Cloud Functions (not direct Firestore reads)
- [ ] Update provisioning flow to use transaction for free tier slot checking
- [ ] Test full flow: provision → query → limit → deprovision
- [ ] Add cost estimation logic for Anthropic API usage
