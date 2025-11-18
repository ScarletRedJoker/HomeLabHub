# Discord Invite Link Update Guide

## Overview
The rig-city.com website currently has Discord invite links that need to be updated. This document provides instructions for obtaining a new permanent invite link and updating all instances in the website.

---

## Step 1: Create a Permanent Discord Invite Link

### On Desktop:
1. Open Discord and navigate to your **Rig City** server
2. Right-click on any text channel (e.g., `#general`)
3. Select **"Invite People"**
4. Click **"Edit invite link"** at the bottom
5. Configure settings for a permanent link:
   - **Expire after**: `Never`
   - **Max number of uses**: `No limit`
6. Click **"Generate a New Link"**
7. Copy the invite link (e.g., `https://discord.gg/ABCD1234`)

### Via Server Settings:
1. Open Discord and navigate to your **Rig City** server
2. Click on the server name → **"Server Settings"**
3. Go to **"Invites"** in the left sidebar
4. Click **"Create Invite"**
5. Configure permanent settings:
   - **Expire after**: `Never`
   - **Max number of uses**: `No limit`
6. Click **"Generate"** and copy the link

---

## Step 2: Update All Website Locations

The Discord invite link appears in **3 locations** in the HTML file:

### File: `services/rig-city-site/index.html`

#### Location 1: Hero Section (Line ~43)
**Description**: Main "Join Discord" button in the hero/welcome section

```html
<!-- TODO: UPDATE TO VALID DISCORD INVITE LINK -->
<a href="https://discord.gg/h6wA6MwF7t" target="_blank" class="btn btn-primary pulse">
```

**Action**: Replace `https://discord.gg/h6wA6MwF7t` with your new invite link

---

#### Location 2: Community Section (Line ~129)
**Description**: "Join Now" button in the community section

```html
<!-- TODO: UPDATE TO VALID DISCORD INVITE LINK -->
<a href="https://discord.gg/h6wA6MwF7t" target="_blank" class="btn btn-primary pulse">
```

**Action**: Replace `https://discord.gg/h6wA6MwF7t` with your new invite link

---

#### Location 3: Footer (Line ~211)
**Description**: Discord link in the footer navigation

```html
<!-- TODO: UPDATE TO VALID DISCORD INVITE LINK -->
<a href="https://discord.gg/h6wA6MwF7t" target="_blank" class="footer-link">Discord</a>
```

**Action**: Replace `https://discord.gg/h6wA6MwF7t` with your new invite link

---

## Step 3: Find and Replace (Quick Method)

### Using Find & Replace:
1. Open `services/rig-city-site/index.html` in your editor
2. Use Find & Replace (Ctrl+H or Cmd+H):
   - **Find**: `https://discord.gg/h6wA6MwF7t`
   - **Replace**: `YOUR_NEW_DISCORD_INVITE_LINK`
3. Click **"Replace All"** to update all 3 instances at once
4. Save the file

---

## Step 4: Remove TODO Comments (Optional)

After updating the links, you can remove the TODO comments if desired:

```html
<!-- TODO: UPDATE TO VALID DISCORD INVITE LINK -->
<!-- Current: https://discord.gg/h6wA6MwF7t -->
<!-- User needs to provide updated invite link from Discord Server Settings → Invites -->
```

---

## Step 5: Test the Links

1. Open the website in your browser
2. Test all 3 Discord links:
   - Hero section "Join Discord" button
   - Community section "Join Now" button
   - Footer "Discord" link
3. Verify they all redirect to your Discord server

---

## Current Link Status

- **Current Link**: `https://discord.gg/h6wA6MwF7t`
- **Status**: May be expired or outdated
- **Locations**: 3 instances in `index.html`

---

## Additional Tips

### Discord Widget
The website also includes a **Live Server Status** widget (the iframe) at line ~94. This widget:
- Uses your Discord Server ID: `692850100795473920`
- Shows online members and server activity
- Does NOT need to be updated with the invite link
- Recently enlarged to 500x750px for better visibility

### Best Practices
- Use **permanent** invite links (never expire)
- Set **no max uses** limit
- Create backup invite links in case one gets compromised
- Regularly check that invite links are working

---

## Questions or Issues?

If the invite link doesn't work after updating:
1. Verify the link format: `https://discord.gg/XXXXX`
2. Check that the invite hasn't been deleted in Discord
3. Ensure the invite is set to never expire
4. Test the link in an incognito/private browser window

---

**Last Updated**: November 18, 2025
