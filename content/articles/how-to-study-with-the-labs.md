---
title: How to get the most out of a lab
date: 2026-11-26
summary: A 30-minute routine for each lab, so the ideas stick and you can explain them in a design review or an interview.
---

Reading about a design pattern feels like learning it. Then someone asks "what happens when that node dies?" and the answer isn't there. The labs are built to close that gap: you break the system yourself before you read how to fix it.

Here is the routine that works best, in about 30 minutes.

## 1. Read the incident, then stop

Every lab opens with a real system at scale and the numbers that forced a change. Before scrolling on, write one sentence: *what exactly broke, and why didn't the obvious fix work?* If you can't write it, read the section again. Everything after this depends on it.

## 2. Break the naive design first

Open the simulator and use the naive baseline before the better design. Push the slider that matters (traffic, node count, TTL, limit) until the baseline fails, and note the value where it does. A threshold you found yourself is easier to remember than one you read.

## 3. Predict, then flip the toggle

Before switching to the better design, guess what will change: which metric drops, which stays the same, and what new cost appears. Then flip it. The gap between your guess and the result is where the learning happens.

## 4. Look for the new failure mode

No design is free. Each lab lists how the better design fails too: a lock holder that dies, a cache that is cold after a flush, a lease that expires before the work is done. Try to reproduce one in the simulator.

## 5. Solve the scenario on paper

The "Solve it" section is a concrete problem with real constraints. Give yourself ten minutes and write a short answer covering where the state lives, what happens when a dependency is down, and what you are allowed to serve stale. Only then open the hints, and the model answer last.

## 6. Map it to something you run

Finish with the "Apply it" notes and pick one system you work on. Where would this pattern go? What would you monitor to know it's working? One concrete note is worth more than a page of highlights.

> If you want a nudge to keep going, mark each lab as done when you finish it. Progress stays in your browser and needs no account.
