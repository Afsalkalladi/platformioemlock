# Quick Unlock Home Screen Shortcuts

This guide explains how to add a one-tap door unlock button to your phone's home screen.

## 📱 Your Unlock URL

Replace `YOUR_DEVICE_ID` with your actual device ID:

```
https://your-domain.com/unlock/YOUR_DEVICE_ID
```

For **auto-unlock on tap** (unlocks immediately when opened):
```
https://your-domain.com/unlock/YOUR_DEVICE_ID?auto=true
```

---

## 🍎 iPhone / iPad

### Option 1: Safari Add to Home Screen (Recommended)

1. Open Safari and go to `https://your-domain.com/unlock/YOUR_DEVICE_ID`
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it "Door Unlock" or similar
5. Tap **Add**

The icon will appear on your home screen. Tap it to open the unlock page.

### Option 2: iOS Shortcuts App (One-Tap Unlock)

This method unlocks the door **instantly** without showing any UI:

1. Open the **Shortcuts** app
2. Tap **+** to create a new shortcut
3. Tap **"Add Action"**
4. Search for **"Get Contents of URL"**
5. Configure:
   - URL: `https://your-domain.com/api/unlock/YOUR_DEVICE_ID`
   - Method: **POST**
6. (Optional) Add a **"Show Notification"** action to confirm
7. Tap the shortcut name at top → **"Add to Home Screen"**
8. Choose an icon and name like "🔓 Unlock"
9. Tap **Add**

**For secured endpoints (with token):**
- Add Header: `Authorization` = `Bearer YOUR_TOKEN`

### Option 3: iOS Shortcuts with Widget

1. Create the shortcut as above
2. Long-press your home screen
3. Tap **+** → Search "Shortcuts"
4. Add a Shortcuts widget
5. Configure it to show your unlock shortcut

---

## 🤖 Android

### Option 1: Chrome Add to Home Screen (Recommended)

1. Open Chrome and go to `https://your-domain.com/unlock/YOUR_DEVICE_ID`
2. Tap the **menu** (⋮) in the top-right
3. Tap **"Add to Home screen"** or **"Install app"**
4. Name it "Door Unlock"
5. Tap **Add**

### Option 2: Create a Direct Shortcut

1. Long-press on your home screen
2. Tap **Widgets** → **Chrome** → **Bookmark**
3. Select your saved unlock bookmark

### Option 3: Tasker / MacroDroid (Advanced - Instant Unlock)

**Using Tasker:**
1. Create a new Task
2. Add Action: **Net** → **HTTP Request**
   - Method: POST
   - URL: `https://your-domain.com/api/unlock/YOUR_DEVICE_ID`
3. Add Action: **Alert** → **Flash** → "Door Unlocked!"
4. Create a home screen shortcut for this task

**Using MacroDroid (free):**
1. Create a new Macro
2. Trigger: **Shortcut Launched**
3. Action: **HTTP Request**
   - URL: `https://your-domain.com/api/unlock/YOUR_DEVICE_ID`
   - Method: POST
4. Add to home screen

---

## 🔐 Security Options

### Add Token Authentication (Recommended)

1. Set `QUICK_UNLOCK_TOKEN` in your environment variables:
   ```
   QUICK_UNLOCK_TOKEN=your-secret-token-here
   ```

2. When making requests, include the token:
   - URL parameter: `?token=your-secret-token-here`
   - Or Header: `Authorization: Bearer your-secret-token-here`

### Additional Security Measures

- Use HTTPS only
- Set up IP whitelisting if your provider supports it
- Use a strong, random token (32+ characters)
- Consider time-based tokens for extra security

---

## 🧪 Test Your Setup

Test the API directly:

```bash
# Without token
curl -X POST https://your-domain.com/api/unlock/YOUR_DEVICE_ID

# With token
curl -X POST https://your-domain.com/api/unlock/YOUR_DEVICE_ID \
  -H "Authorization: Bearer your-token"
```

Expected response:
```json
{
  "success": true,
  "message": "Unlock command sent",
  "command_id": "uuid-here",
  "device_id": "YOUR_DEVICE_ID"
}
```

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `src/app/api/unlock/[deviceId]/route.ts` | API endpoint for unlock |
| `src/app/unlock/[deviceId]/page.tsx` | PWA unlock page |
| `src/app/unlock/[deviceId]/layout.tsx` | PWA metadata |
| `public/manifest.json` | PWA manifest |
| `public/icons/icon.svg` | App icon (SVG) |
| `public/unlock/index.html` | Device selector page |

---

## 🎨 Custom Icons

Generate PNG icons from the SVG:

1. Use an online converter like [CloudConvert](https://cloudconvert.com/svg-to-png)
2. Create these sizes: 72, 96, 128, 144, 152, 192, 384, 512
3. Save to `public/icons/icon-{size}x{size}.png`
4. Create `apple-touch-icon.png` at 180x180px

Or use this Node.js script (requires `sharp`):

```bash
npm install sharp
node scripts/generate-icons.js
```

---

## 🚀 Deploy

After deploying your Next.js app:

1. Visit `https://your-domain.com/unlock/YOUR_DEVICE_ID`
2. Add to home screen using the instructions above
3. Test the shortcut!
