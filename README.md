# SEATWISE
### Smart Examination Seating & Conflict Resolution System
*Evaluation 1 — Frontend Prototype*

---

## 1. Overview

SEATWISE automatically generates examination seating arrangements while
enforcing a core constraint:

> **Students belonging to the same subject/course code must never sit
> directly adjacent to one another (left, right, front, or back).
> Diagonal seating is allowed.**

This is a classic **Constraint Satisfaction Problem**, similar to graph
colouring, and is solved with a genuine (non-random) greedy,
constraint-checking algorithm in `js/seatingAlgorithm.js`.

## 2. Tech Stack

- HTML5, CSS3, Vanilla JavaScript (ES6+)
- Browser `localStorage` for all persistence
- No frameworks, no backend, no external database — pure client-side app

## 3. Running the Project

Simply open `index.html` in any modern browser (Chrome/Edge/Firefox).
No build step, server, or installation required.

**Demo Student Login:** `rahul@student.com` / `student123`
**Admin Login:** username `admin`, password `seatwise@admin123` (or `examseat@admin123`)
(centralized in `js/config.js`)

## 4. Folder Structure

```
examseat/
├── index.html, login.html, signup.html, admin-login.html
├── user-dashboard.html, my-exams.html, my-seat.html, profile.html
├── admin-dashboard.html, manage-users.html, manage-exams.html,
│   students.html, rooms.html, generate-seating.html,
│   seating-plan.html, conflicts.html, settings.html
├── css/          (style, auth, dashboard, seating, responsive)
├── js/           (config, storage, utils, auth, app, dashboard,
│                  users, exams, students, rooms, seatingAlgorithm,
│                  seating, conflicts, export)
└── data/sample-students.json
```

## 5. The Seating Algorithm (Core Academic Contribution)

Located in `js/seatingAlgorithm.js`, heavily commented for viva
explanation. Summary of approach:

1. **Group & interleave** — students are grouped by subject, then
   merged round-robin (largest group first) into a single queue so
   that same-subject students are naturally spread apart before
   placement even begins.
2. **Greedy row-major placement** — for every seat, the algorithm
   checks the LEFT and TOP (front) neighbours already placed, and
   picks the next queued student whose subject doesn't clash. Right
   and back neighbours are guaranteed safe because they perform the
   same check when *they* are placed.
3. **Forced placement fallback** — if no legal candidate remains
   (rare, but possible with heavily skewed subject counts), the
   algorithm places the best available student anyway rather than
   wasting a seat, and flags it during the next step.
4. **Independent conflict-detection pass** — after every room is
   filled, the entire grid is re-scanned for any left/right/front/back
   same-subject pairs. This is authoritative and always accurate,
   including for manual overrides.
5. **Multi-room overflow** — students left over after one room fills
   automatically continue into the next room, in the order rooms were
   created.
6. **Regenerate** — re-shuffles the queue with a new seed and re-runs
   the whole pipeline, typically reducing conflicts on subsequent
   attempts.
7. **Manual override + revalidation** — `seating.js` lets an admin
   swap two students' seats. Before applying, it calls
   `SeatingAlgorithm.wouldConflict()`; if a conflict would occur, it
   returns `suggestSeats()` alternatives instead of silently applying
   a bad swap (with an explicit "force override" escape hatch).

## 6. Demo Data

On first load, `js/app.js` seeds:
- 4 rooms (LH-101 5×6, LH-102 5×6, LH-103 6×6, LH-104 5×8)
- 55 students across CS301 / MA201 / PH201 / EC201
- 1 exam ("Mid Semester Examination", 25 Aug 2026, 10:00 AM, 2 Hours)
- 1 demo student account

Use **Settings → Clear Saved Data** to wipe everything, or
**Settings → Reload Demo Data** to restore the above.

## 7. Phase 2 (MERN) Migration Notes

The code is deliberately organized so each `js/*.js` module maps
cleanly onto a future Express/MongoDB layer:

| Current (LocalStorage)          | Phase 2 (MERN)                              |
|----------------------------------|----------------------------------------------|
| `storage.js`                     | REST client calling Express endpoints        |
| `auth.js` + `config.js`          | JWT auth, bcrypt-hashed admin in MongoDB      |
| `students.js` / `rooms.js` / `exams.js` | `Student`, `Room`, `Exam` Mongoose schemas |
| `seatingAlgorithm.js`            | Runs server-side, exposed via `POST /api/exams/:id/generate-seating` |
| `seating.js` overrides           | `PUT /api/seating/:id/override`               |

No backend code has been implemented yet, per the Evaluation-1 scope —
this table exists purely to document the intended migration path.
