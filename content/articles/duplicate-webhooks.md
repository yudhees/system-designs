---
title: What to do when a webhook arrives twice
date: 2026-11-27
tag: Reliability
summary: Webhook senders retry, so your handler will see the same event more than once, sometimes out of order. Make the handler safe to repeat, quick to answer and easy to replay.
---

A webhook is an HTTP call from another system saying "something happened". A payment succeeded, a booking was confirmed, a shipment left the warehouse. It's convenient, and it comes with a rule you can't negotiate: **the sender will deliver at least once, not exactly once.**

Why? Because the sender can't tell the difference between "your server never got it" and "your server got it but the reply was lost". When in doubt it sends again. So duplicates aren't a bug in the sender. They're the contract.

## How a duplicate happens

```
sender ──► POST /webhook (event 8812)
your app   processes it, updates the database
your app ──► 200 OK ✗ (connection drops, reply is lost)
sender     sees a timeout, so it retries
sender ──► POST /webhook (event 8812)   ← same event again
```

Your code ran the first time. Without protection, it runs again: a second confirmation email, a second charge in your records, a second room marked as sold.

Retries are also not in order. Event 8813 ("cancelled") can arrive before 8812 ("confirmed") if the first delivery was retried and the second wasn't.

## Rule 1: answer fast, work later

The sender is waiting on your reply, and a slow handler looks like a failure, which causes retries. So do the minimum before replying:

1. Check the signature, to be sure the call is really from the sender.
2. Store the raw event.
3. Reply `200`.

Do the real work afterwards, from a queue or a background job. This keeps your response time short and turns "process the event" into something you can retry on your own terms.

## Rule 2: make processing idempotent

An operation is **idempotent** if doing it twice has the same effect as doing it once. The usual tool is an **event ID table**.

```
events(event_id PRIMARY KEY, received_at, status)

on receive:
  INSERT event_id  ──► if it already exists, stop
  otherwise process, then mark status = done
```

The primary key does the hard part. Two deliveries of event 8812, even arriving at the same moment on two servers, can't both insert it. One wins and one is dropped. The [idempotency keys lab](/labs/idempotency-keys) goes deeper on this pattern.

A detail that matters: record "received" and "done" separately. If you mark an event done *before* the work and the work crashes, the event is lost. If you mark it done *after* and crash in between, the retry does the work again, so the work itself should also be safe to repeat, for example by setting a status to "confirmed" instead of adding one to a counter.

## Rule 3: don't trust the order

For each thing you track, keep a version or timestamp, and ignore events older than what you already have.

```
booking 77: state=cancelled, version=5
late event: state=confirmed, version=4   ← older, ignore it
```

When events don't carry a version, ask the sender's API for the *current* state instead of acting on the event's contents. Treat the webhook as a nudge ("go check booking 77"), not as the source of truth.

## Rule 4: keep what you received

Store every raw event, with the time you received it and what you did with it. When something looks wrong a week later, this log is how you find out whether the sender never called, you dropped it, or you processed it twice.

It also gives you **replay**: after fixing a bug, you can run the stored events through the handler again. That only works safely if rule 2 is in place.

## Rule 5: plan for the opposite problem

Duplicates are common, but so are *missing* events: your server was down for an hour and the sender gave up retrying. Don't rely on webhooks alone for anything important. Run a periodic **reconciliation** job that compares your records with the sender's and repairs differences. Webhooks give you speed; reconciliation gives you correctness.

## A short checklist

- Verify the signature before anything else.
- Reply quickly; process from a queue.
- Deduplicate on the event ID with a database constraint.
- Make the work safe to repeat.
- Ignore events older than your current state.
- Log raw events and support replay.
- Reconcile on a schedule.

## Questions to try on your own

1. Two copies of one event reach two servers at the same moment. What stops both from processing it?
2. Your handler sends an email and then crashes before marking the event done. What happens on retry, and how would you prevent a double email?
3. How long should you keep event IDs before deleting them?
