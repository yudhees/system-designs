---
title: Cache invalidation: four ways to be wrong
date: 2026-11-27
tag: Trade-offs
summary: Every cache can show old data. The real choice is how old, how often and who notices. A tour of TTLs, explicit invalidation, versioned keys and write-through.
---

A cache is a promise to answer faster by sometimes answering with something old. You can't remove that trade, only choose it. "Invalidation" is the work of deciding *when old data stops being acceptable*, and every strategy below is a different way of being wrong.

## Start with a question, not a technique

Before picking a strategy, ask what a stale answer costs.

- A product description that is one minute old: nobody notices.
- A stock count that is one minute old: someone might buy the last item twice.
- A permission change that is one minute old: someone who lost access still has it.

The cost of stale data should set your strategy, not habit.

## 1. Time to live (TTL)

Each entry expires after a fixed time. After that the next reader fetches fresh data and refills the cache.

```
write at 10:00:00   ──► cache holds the old value
read  at 10:00:40   ──► old value (TTL 60 s)
read  at 10:01:05   ──► miss, fetch new value
```

**Good:** trivial to build and to reason about. The worst case is bounded: data is never older than the TTL.

**Bad:** the bound is *always paid*, even when nothing changed, and the data is wrong for up to a full TTL after a change. Short TTLs fix the staleness but send more traffic to the database, and when a popular key expires, many readers can miss at the same moment (a stampede).

**Use it when** a bounded delay is fine and writes are rare or hard to track.

## 2. Explicit invalidation

When the data changes, the writer deletes or updates the cache entry.

```
update row ──► delete cache["product:42"]
next read  ──► miss ──► load fresh ──► store
```

**Good:** readers see changes almost immediately and unchanged data stays cached for as long as you like.

**Bad:** you now have two writes that must both succeed. If the database update works and the cache delete fails, the cache stays wrong *until the TTL*, which is why most designs keep a TTL as a safety net. There is also a race: a reader can load the old row, a writer can update and delete, and then the reader stores its old copy *after* the delete. The cache now holds stale data with nothing scheduled to remove it.

**Use it when** freshness matters and you can reach every place that writes the data. The more services write the same data, the more places you can forget to invalidate.

## 3. Versioned keys

Instead of deleting entries, change the key. The key includes a version number or a hash of the data, for example `product:42:v17`. A change bumps the version, and readers start asking for `v18`. The old entry is never read again and ages out on its own.

**Good:** no race between delete and refill, because you never overwrite anything. It also works well for content that is cached in many layers, like pages or assets.

**Bad:** readers need to know the *current* version, which is itself a small piece of state to look up and keep fresh. Old versions use memory until they expire.

**Use it when** you can cheaply know the current version, for instance a build hash or a row version column.

## 4. Write-through and write-behind

In **write-through**, every write goes to the cache and the database together, so reads always find current data.

In **write-behind**, writes go to the cache first and are flushed to the database later. It is very fast, and it can lose data if the cache dies before the flush.

**Good:** reads are fast and fresh. **Bad:** write-through makes every write slower and more complex, and write-behind trades durability for speed. Neither helps if some writers bypass the cache.

**Use write-through when** reads far outnumber writes and the cache is trusted. Be careful with write-behind: only use it for data you can afford to lose.

## Which one, in practice?

Most real systems combine them:

| Situation | A reasonable default |
|---|---|
| Content that changes rarely | Long TTL, invalidate on edit |
| Data many services write | Short TTL, plus versioned keys |
| Money, stock, permissions | Don't cache the decision; cache only what is safe and re-check at the moment of action |
| Very hot keys | TTL with jitter and request coalescing |

Adding **jitter**, a small random amount on each TTL, keeps many keys from expiring at the same instant.

## The failure to watch for

The worst cache bugs aren't "slow". They're **silently wrong for a long time**. Write down, for each cache, the longest time it may show old data, and add a metric for entry age. A cache that is allowed to be 60 seconds stale but is actually 40 minutes stale is a bug you only find from a confused customer.

## Questions to try on your own

1. Your database update succeeds and the cache delete times out. What does the next reader see, and for how long?
2. Which of your cached values would cause real harm if shown stale for a minute?
3. How would you detect that a cache entry is older than it should be?
