# 🔹 SUPABASE SQL QUERIES — ADMIN DASHBOARD

> Production-ready queries aligned with ESP32 firmware behavior.
> Each query has **exact purpose**. No fluff.

---

## 🔹 1️⃣ LIST ALL DEVICES (Dashboard Home)

Since you don't have a `devices` table yet, we derive devices from activity.

```sql
SELECT
  device_id,
  MAX(created_at)       AS last_command_at,
  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_commands
FROM device_commands
GROUP BY device_id
ORDER BY last_command_at DESC;
```

👉 Used for `/devices` page.

---

## 🔹 2️⃣ DEVICE SUMMARY (Top of Device Page)

```sql
SELECT
  device_id,
  COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_commands,
  COUNT(*) FILTER (WHERE status = 'DONE')    AS completed_commands,
  MAX(created_at)                            AS last_seen
FROM device_commands
WHERE device_id = :device_id
GROUP BY device_id;
```

---

## 🔹 3️⃣ FETCH WHITELISTED UIDs (Device)

```sql
SELECT uid, updated_at
FROM device_uids
WHERE device_id = :device_id
  AND state = 'WHITELIST'
ORDER BY updated_at DESC;
```

---

## 🔹 4️⃣ FETCH BLACKLISTED UIDs (Device)

```sql
SELECT uid, updated_at
FROM device_uids
WHERE device_id = :device_id
  AND state = 'BLACKLIST'
ORDER BY updated_at DESC;
```

---

## 🔹 5️⃣ FETCH PENDING UIDs (CURRENT SOURCE OF TRUTH)

### If you are using **NVS + GET_PENDING command** (recommended):

```sql
SELECT uid, created_at
FROM device_pending_reports
WHERE device_id = :device_id
ORDER BY created_at DESC;
```

> This table is **fed by GET_PENDING**, not by user input.
> This is CORRECT design.

---

## 🔹 6️⃣ SEND REMOTE UNLOCK COMMAND

```sql
INSERT INTO device_commands (device_id, type)
VALUES (:device_id, 'REMOTE_UNLOCK');
```

---

## 🔹 7️⃣ WHITELIST A UID (FROM PENDING)

```sql
INSERT INTO device_commands (device_id, type, uid)
VALUES (:device_id, 'WHITELIST_ADD', :uid);
```

---

## 🔹 8️⃣ BLACKLIST A UID

```sql
INSERT INTO device_commands (device_id, type, uid)
VALUES (:device_id, 'BLACKLIST_ADD', :uid);
```

---

## 🔹 9️⃣ REMOVE UID COMPLETELY

```sql
INSERT INTO device_commands (device_id, type, uid)
VALUES (:device_id, 'REMOVE_UID', :uid);
```

---

## 🔹 🔟 SYNC UID LISTS (FULL REPLACE)

Used after bulk editing in admin UI.

```sql
INSERT INTO device_commands (device_id, type, payload)
VALUES (
  :device_id,
  'SYNC_UIDS',
  jsonb_build_object(
    'whitelist', :whitelist_array,
    'blacklist', :blacklist_array
  )
);
```

Where:

* `:whitelist_array` → `["A1B2C3D4","11223344"]`
* `:blacklist_array` → `["DEADBEEF"]`

---

## 🔹 1️⃣1️⃣ REQUEST PENDING UIDs FROM DEVICE

```sql
INSERT INTO device_commands (device_id, type)
VALUES (:device_id, 'GET_PENDING');
```

ESP32 will:

* read local pending
* respond via ACK result **or**
* push rows into `device_pending_reports`

---

## 🔹 1️⃣2️⃣ COMMAND HISTORY (DEBUG PAGE)

```sql
SELECT
  id,
  type,
  uid,
  status,
  result,
  created_at,
  acked_at
FROM device_commands
WHERE device_id = :device_id
ORDER BY created_at DESC
LIMIT 50;
```

---

## 🔹 1️⃣3️⃣ COMMAND STATUS POLLING (UI)

```sql
SELECT status, result
FROM device_commands
WHERE id = :command_id;
```

Used for:

* button disabling
* success/failure toast

---

## 🔥 IMPORTANT DESIGN TRUTH (READ THIS)

* **Pending UIDs live on the DEVICE**, not the DB
* DB pending list is a **mirror**, not authority
* Admin never inserts into pending directly
* Admin only:

  * requests pending
  * approves/rejects

This avoids **bricking access control** if internet dies.

---

## ✅ WHAT YOU SHOULD BUILD NEXT (ORDER)

1. `/devices` page using Query #1
2. `/devices/[id]` page using #2–#5
3. Action buttons using #6–#11
4. Polling command status using #13

Do **NOT**:

* Add realtime yet
* Add auth complexity
* Add firmware changes now
