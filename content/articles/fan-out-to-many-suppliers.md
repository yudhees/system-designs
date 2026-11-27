---
title: Searching many slow suppliers at once
date: 2026-11-27
tag: Case study
summary: A travel search has to ask dozens of outside systems for prices and still answer in a couple of seconds. Here is how fan-out, deadlines and partial results make that possible.
---

Imagine a travel search page. A visitor picks a city and two dates, and expects a list of rooms with prices in a couple of seconds. You don't own the rooms. The prices live in a dozen or fifty outside systems, each run by someone else, each with its own speed and its own bad days.

This is a **fan-out** problem: one request in, many requests out, one answer back. It looks easy until the slowest supplier decides how fast your whole page loads.

## The naive version

The simplest design calls the suppliers one after another and builds the list at the end.

```
request ──► supplier A (400 ms)
        ──► supplier B (900 ms)
        ──► supplier C (2.5 s)
        ──► supplier D (timeout, 10 s)
        ◄── answer after ~14 s
```

Two things go wrong at once. Latency is the *sum* of all calls, and a single dead supplier turns into a ten-second wait for everyone.

## Step one: call them in parallel

Fan out all calls at the same time and the latency becomes the *maximum* instead of the sum. That is a big improvement, but the maximum is still the problem: the slowest supplier, on its worst day, still sets your page time.

Parallel calls also multiply load. If every search calls fifty suppliers, a traffic spike of 1,000 searches a second is 50,000 outbound calls a second. Your own system can fall over before the suppliers do.

## Step two: give the whole search a deadline

Pick a budget for the page, for example two seconds, and give every supplier call the time that is left, not a fixed timeout.

```
t=0.0s   start, budget 2.0 s
t=0.4s   A answers
t=0.9s   B answers
t=1.8s   C answers
t=2.0s   deadline: stop waiting, return A + B + C
         D is still running: cancel it
```

The visitor now gets an answer in two seconds no matter what. The price is that the answer can be **incomplete**: a supplier that was slow today simply isn't in the list. That is a product decision, and it's usually the right one. A fast list with forty results beats a perfect list that arrives after the visitor has left.

## Step three: stream results, don't wait for all of them

Instead of waiting for the deadline, send results to the page as they arrive. The first supplier answers in 400 ms, so the visitor sees something almost at once, and the list fills in and re-sorts as slower suppliers report. The deadline still exists, but most visitors never feel it.

## Step four: stop asking suppliers that are failing

If a supplier has timed out on the last twenty requests, asking it again just burns your budget. A **circuit breaker** tracks recent failures per supplier and, once a threshold is crossed, skips that supplier for a short while and then lets a trickle of requests through to see if it has recovered.

The states are simple:

- **Closed:** requests flow normally.
- **Open:** requests are skipped immediately and the supplier is marked "unavailable".
- **Half-open:** a few test requests go through. If they succeed, close the breaker. If not, open it again.

This protects two things: your latency budget, and the supplier, which gets room to recover instead of being hammered.

## Step five: cache what can be cached

Prices change, but not every second. Caching a supplier's answer for a short time, even 30 to 60 seconds, takes a large share of repeat searches off the suppliers entirely. The trade-off is **staleness**: the cached price may be a little out of date, so the final step before payment must re-check the price with the supplier.

A common pattern is to treat search as "approximate and fast" and booking as "exact and slow". The search page can show a cached price. The confirm button asks the supplier for the real one.

## What can still go wrong

- **Thundering herd on a hot search.** A popular city and date can trigger the same supplier calls many times at once. Coalescing identical in-flight requests into one call fixes it. The [cache stampede lab](/labs/cache-stampedes) walks through exactly this.
- **Inconsistent results.** Two visitors searching a second apart can see different lists because a supplier made the deadline for one and not the other. Showing "prices may change" is honest, and logging which suppliers answered helps when you debug a complaint.
- **Slow suppliers drag up your tail latency.** Watch the 95th and 99th percentile, not just the average. The average hides the slow searches.
- **Retries make it worse.** A retry on a timed-out supplier doubles its load at the moment it is struggling. Retry with a limit and a delay, or not at all within a search.

## The shape of the answer

Every design above is a trade between **completeness, freshness and speed**. You can't have all three from outside systems you don't control. Pick the order that fits the product: for search, speed first, then freshness, then completeness; for booking, the reverse.

## Questions to try on your own

1. If you have 30 suppliers and each is slow 2% of the time, how often is *at least one* slow? (Hint: it's much more than 2%.)
2. Which suppliers deserve a longer deadline, and how would you decide?
3. What would you show the visitor when half the suppliers failed?
