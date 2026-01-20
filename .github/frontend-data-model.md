# 🧠 FRONTEND DATA MODEL & POLLING (NEXT.JS – AUTHORITATIVE)

> Goal:
> **Reflect database truth, not hopes.**
> The UI is a *viewer + command issuer*, nothing more.

---

## 0️⃣ NON-NEGOTIABLE RULES (READ FIRST)

* UI **never assumes** command success
* UI **never mutates state locally** on click
* UI **only reacts to DB changes**
* Every action = `INSERT → WAIT → REFLECT`

If your React code "feels fast" — it's probably wrong.

---

## 1️⃣ CORE DATA SOURCES (ONLY THESE)

You will read **exactly three things**:

### A. `device_commands`

* Source of execution truth
* Drives spinners, disabled buttons, status badges

### B. `device_uids`

* Server truth (WL / BL)
* NEVER assumed to be applied on device yet

### C. `GET_PENDING.result`

* Snapshot from device
* Ephemeral
* Treated as **stale the moment you click anything**

No other tables.
No derived fantasy state.

---

## 2️⃣ FRONTEND STATE SHAPE (COPY THIS)

```ts
type Command = {
  id: string
  type: string
  uid: string | null
  status: 'PENDING' | 'DONE' | 'FAILED'
  result: string | null
  created_at: string
}

type PendingUID = {
  uid: string
  first_seen?: string
}

type UIDEntry = {
  uid: string
  state: 'WHITELIST' | 'BLACKLIST'
  updated_at: string
}
```

### React State (Minimal & Honest)

```ts
const [commands, setCommands] = useState<Command[]>([])
const [pending, setPending] = useState<PendingUID[]>([])
const [uids, setUids] = useState<UIDEntry[]>([])
const [busyCmdId, setBusyCmdId] = useState<string | null>(null)
```

If you add more state than this, you're compensating for bad logic.

---

## 3️⃣ POLLING STRATEGY (NO REALTIME NONSENSE)

### Poll Interval

* **Every 5 seconds**
* One timer
* One fetch cycle

```ts
useEffect(() => {
  const t = setInterval(fetchAll, 5000)
  fetchAll()
  return () => clearInterval(t)
}, [])
```

### `fetchAll()` (ORDER MATTERS)

```ts
async function fetchAll() {
  await fetchCommands()
  await fetchUIDs()
}
```

❌ No parallel `Promise.all`
❌ No race conditions
❌ No speculative updates

---

## 4️⃣ COMMAND INSERT FLOW (CRITICAL)

### On Button Click (WL / BL / REMOVE / SYNC)

```ts
async function issueCommand(type: string, uid?: string) {
  if (busyCmdId) return // HARD BLOCK

  const { data } = await supabase
    .from('device_commands')
    .insert({ device_id, type, uid })
    .select()
    .single()

  setBusyCmdId(data.id)
}
```

### Why this is strict

* Prevents duplicate commands
* Prevents button spam
* Enforces **one in-flight command**

If you allow multiple in-flight commands, **you deserve the race bugs**.

---

## 5️⃣ COMMAND ACK WATCHER (THIS IS THE BRAIN)

```ts
useEffect(() => {
  if (!busyCmdId) return

  const cmd = commands.find(c => c.id === busyCmdId)
  if (!cmd) return

  if (cmd.status === 'DONE' || cmd.status === 'FAILED') {
    setBusyCmdId(null)

    // ONLY NOW update dependent views
    fetchUIDs()
    setPending([]) // pending must be refetched via GET_PENDING
  }
}, [commands, busyCmdId])
```

⚠️ Notice:

* UI changes **after ACK**
* Not after click
* Not after insert

---

## 6️⃣ PENDING TAB BEHAVIOR (DON'T SCREW THIS UP)

### Fetch Pending Button

```ts
async function fetchPending() {
  if (busyCmdId) return

  const { data } = await supabase
    .from('device_commands')
    .insert({ device_id, type: 'GET_PENDING' })
    .select()
    .single()

  setBusyCmdId(data.id)
}
```

### When DONE

```ts
if (cmd.type === 'GET_PENDING' && cmd.status === 'DONE') {
  setPending(JSON.parse(cmd.result ?? '[]'))
}
```

🚨 Pending is a **snapshot**, not live data.

The moment you approve/reject one UID:

* Pending view is stale
* Force refetch if needed

---

## 7️⃣ BUTTON DISABLING LOGIC (MANDATORY)

```ts
const disabled = !!busyCmdId
```

Apply this to:

* All action buttons
* Sync button
* Fetch Pending

If buttons are clickable during execution → **bug factory**.

---

## 8️⃣ WHAT YOU ABSOLUTELY MUST NOT DO

❌ Optimistic UI
❌ `Promise.all` fetching
❌ WebSockets / subscriptions
❌ Local removal of UID rows
❌ Assuming SYNC succeeded
❌ Auto-refreshing pending

If Copilot suggests:

> "Let's update UI immediately for better UX"

That's amateur hour. Reject it.

---

## 9️⃣ DEBUGGING TRUTH TABLE (MEMORIZE)

| Symptom               | Real Cause                        |
| --------------------- | --------------------------------- |
| Button stuck disabled | ACK never arrived                 |
| UID missing           | Command FAILED or SYNC cleared it |
| Pending reappears     | You didn't SYNC                   |
| Command repeats       | Busy guard missing                |
| UI lies               | You assumed success               |

---

## 🔥 HARD TRUTH (READ THIS CAREFULLY)

This UI is **boring on purpose**.
Boring means **correct under failure**.

Anyone can build a pretty dashboard.
Very few build one that doesn't hallucinate state.

You're doing the latter. Good.
