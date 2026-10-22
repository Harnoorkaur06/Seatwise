# SEATWISE — Phase 2 Backend Specification (MERN Architecture)

**Specification Status**: APPROVED & READY FOR IMPLEMENTATION  
**Target Scope**: Express REST Endpoints + MongoDB Mongoose Schemas with `populate` + JWT RBAC (Frontend remains Vanilla JS; React deferred).

---

## 1. Executive Overview

Per academic requirements, Phase 2 upgrades SEATWISE's backend data layer to a production-grade MERN architecture:
1. **Explicit Mongoose Schemas**:
   - [`models/Room.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/Room.js)
   - [`models/Student.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/Student.js) (discrete student schema mapped to the shared `users` collection)
   - [`models/SeatingPlan.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/SeatingPlan.js) (with relational `ObjectId` references to `Exam` and `Student`)
2. **Relational Mongoose `populate`**:
   - Linking each seating allocation to its parent `Exam` session (`populate('exam')`).
   - Linking each desk occupant to their underlying `Student` record (`populate('rooms.seats.student')`).
3. **Teacher-Mandated Express Endpoints**:
   - `POST /api/exams/:id/generate-seating` — Trigger automated conflict-free seating allocation for a specific examination.
   - `PUT /api/seating/:id/override` — Apply atomic seat reallocations and manual desk swaps for an active seating plan.
4. **JWT-Protected Security**:
   - Strict `requireAdmin` barrier on generation, overrides, and timetable modifications.

---

## 2. MongoDB Schema Design & `populate` Relationships

### A. Student Schema ([`models/Student.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/Student.js))
- Maps to `users` collection with `role: "student"` default.
- Fields: `id`, `name`, `email`, `rollNo`, `course`, `subject`, `coursesList`, `classBranch`, `department`, `fatherName`, `avatar`, `password`, `passwordSet`, `role`.

### B. Room Schema ([`models/Room.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/Room.js))
- Fields: `roomNumber`, `rows`, `cols`, `capacity`, `active`.

### C. SeatingPlan Schema ([`models/SeatingPlan.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/SeatingPlan.js))
Enhanced with relational Mongoose `ObjectId` references:
```javascript
{
  id: { type: String, required: true, unique: true, index: true },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
  examId: { type: String, required: true, index: true },
  examName: { type: String, required: true },
  generation: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  generatedAt: { type: String, default: () => new Date().toISOString() },
  rooms: [
    {
      roomNumber: String,
      rows: Number,
      cols: Number,
      capacity: Number,
      grid: [[mongoose.Schema.Types.Mixed]], // Backward compatibility
      seats: [
        {
          seat: String,
          row: Number,
          col: Number,
          student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
          studentId: String,
          studentRoll: String,
          studentName: String,
          subject: String
        }
      ]
    }
  ],
  unassigned: [mongoose.Schema.Types.Mixed],
  conflicts: [mongoose.Schema.Types.Mixed],
  stats: { ... }
}
```

### D. Relational Populate Helper Method
```javascript
SeatingPlanSchema.methods.populateFull = function() {
  return this.populate([
    { path: "exam" },
    { path: "rooms.seats.student", select: "-password -__v" }
  ]);
};
```

---

## 3. Express REST API Endpoints Specification

### Endpoint 1: `POST /api/exams/:id/generate-seating`
- **Access**: `requireAdmin` (JWT Bearer Token required)
- **URL Parameter**: `:id` — Exam ID or MongoDB `_id`
- **Method**: `POST`
- **Behavior**:
  1. Finds the targeted `Exam`.
  2. Queries all configured `Room` records and registered `Student` records.
  3. Executes the 4-way conflict-free interleaving engine (`SeatingEngine.generate`).
  4. Stores Mongoose `ObjectId` links for both the `Exam` and assigned `Student` records.
  5. Populates and returns the generated `SeatingPlan`.
- **Response**: `201 Created` with `{ ok: true, message, plan }`.

### Endpoint 2: `PUT /api/seating/:id/override`
- **Access**: `requireAdmin` (JWT Bearer Token required)
- **URL Parameter**: `:id` — SeatingPlan ID or MongoDB `_id`
- **Method**: `PUT`
- **Request Body**:
  ```json
  {
    "roomNumber": "LH-101",
    "row": 0,
    "col": 1,
    "studentId": "student_2410992925",
    "studentRoll": "2410992925",
    "studentName": "HARNOOR KAUR",
    "subject": "24APS4101",
    "force": false
  }
  ```
  *(Or `{ "action": "swap", "roomNumber": "LH-101", "seatA": "A1", "seatB": "A2" }`)*
- **Behavior**:
  1. Locates active `SeatingPlan` by `:id`.
  2. Resolves student `ObjectId` from `Student` collection.
  3. Validates against 4-way same-subject adjacency rules (unless `force: true`).
  4. Mutates seat matrix and relational `rooms.seats` list atomically.
  5. Updates conflict radar and plan statistics.
  6. Logs activity to `Activity` collection.
- **Response**: `200 OK` with `{ ok: true, message, plan }`.

---

## 4. Implementation Steps & Verification

1. Create [`models/Student.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/Student.js).
2. Update [`models/SeatingPlan.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/models/SeatingPlan.js) to support `ObjectId` references to `Exam` & `Student` and `.populate()`.
3. Add `POST /api/exams/:id/generate-seating` to [`routes/exams.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/routes/exams.js).
4. Add `PUT /api/seating/:id/override` to [`routes/seating.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/routes/seating.js).
5. Update [`js/api.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/js/api.js) to call the new endpoints directly while retaining legacy aliases.
6. Extend [`test/run-tests.js`](file:///Users/harnoorkaur/Downloads/SEATWISE-MongoDB-Review/test/run-tests.js) with test assertions validating both new endpoints and `.populate()`.
