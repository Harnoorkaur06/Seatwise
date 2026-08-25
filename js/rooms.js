// // /* ==========================================================================
// //    rooms.js
// //    CRUD for exam rooms. Each room: { roomNumber, rows, cols, capacity }
// //    ========================================================================== */

// // const Rooms = {
// //   all() { return STORAGE.getRooms(); },

// //   add({ roomNumber, rows, cols }) {
// //     const rooms = STORAGE.getRooms();
// //     if (rooms.some((r) => r.roomNumber.toLowerCase() === roomNumber.toLowerCase())) {
// //       return { ok: false, message: `Room ${roomNumber} already exists.` };
// //     }
// //     rooms.push({ roomNumber, rows: Number(rows), cols: Number(cols), capacity: Number(rows) * Number(cols) });
// //     STORAGE.setRooms(rooms);
// //     STORAGE.logActivity(`Room added: ${roomNumber} (${rows}x${cols})`);
// //     return { ok: true };
// //   },

// //   update(roomNumber, { rows, cols }) {
// //     const rooms = STORAGE.getRooms();
// //     const idx = rooms.findIndex((r) => r.roomNumber === roomNumber);
// //     if (idx === -1) return { ok: false, message: "Room not found." };
// //     rooms[idx].rows = Number(rows);
// //     rooms[idx].cols = Number(cols);
// //     rooms[idx].capacity = Number(rows) * Number(cols);
// //     STORAGE.setRooms(rooms);
// //     STORAGE.logActivity(`Room updated: ${roomNumber}`);
// //     return { ok: true };
// //   },

// //   remove(roomNumber) {
// //     STORAGE.setRooms(STORAGE.getRooms().filter((r) => r.roomNumber !== roomNumber));
// //     STORAGE.logActivity(`Room removed: ${roomNumber}`);
// //     return { ok: true };
// //   },

// //   totalCapacity() {
// //     return STORAGE.getRooms().reduce((sum, r) => sum + r.capacity, 0);
// //   }
// // };


// /* ==========================================================================
//    rooms.js
//    CRUD for exam rooms. Each room: { roomNumber, rows, cols, capacity }
//    ========================================================================== */

// const Rooms = {
//   all() {
//     return STORAGE.getRooms();
//   },

//   add({ roomNumber, rows, cols }) {
//     if (!roomNumber || !rows || !cols) {
//       return {
//         ok: false,
//         message: "Room number, rows and columns are required."
//       };
//     }

//     const rooms = STORAGE.getRooms();

//     if (
//       rooms.some(
//         (r) =>
//           r.roomNumber.toLowerCase() ===
//           roomNumber.toLowerCase()
//       )
//     ) {
//       return {
//         ok: false,
//         message: `Room ${roomNumber} already exists.`
//       };
//     }

//     const numericRows = Number(rows);
//     const numericCols = Number(cols);

//     if (
//       !Number.isInteger(numericRows) ||
//       !Number.isInteger(numericCols) ||
//       numericRows <= 0 ||
//       numericCols <= 0
//     ) {
//       return {
//         ok: false,
//         message: "Rows and columns must be positive whole numbers."
//       };
//     }

//     rooms.push({
//       roomNumber,
//       rows: numericRows,
//       cols: numericCols,
//       capacity: numericRows * numericCols
//     });

//     STORAGE.setRooms(rooms);

//     // Room changes affect available seating capacity/layout.
//     STORAGE.clearSeatingPlan();

//     STORAGE.logActivity(
//       `Room added: ${roomNumber} (${numericRows}x${numericCols})`
//     );

//     return { ok: true };
//   },

//   update(roomNumber, { rows, cols }) {
//     const rooms = STORAGE.getRooms();

//     const idx = rooms.findIndex(
//       (r) => r.roomNumber === roomNumber
//     );

//     if (idx === -1) {
//       return {
//         ok: false,
//         message: "Room not found."
//       };
//     }

//     const numericRows = Number(rows);
//     const numericCols = Number(cols);

//     if (
//       !Number.isInteger(numericRows) ||
//       !Number.isInteger(numericCols) ||
//       numericRows <= 0 ||
//       numericCols <= 0
//     ) {
//       return {
//         ok: false,
//         message: "Rows and columns must be positive whole numbers."
//       };
//     }

//     rooms[idx].rows = numericRows;
//     rooms[idx].cols = numericCols;
//     rooms[idx].capacity =
//       numericRows * numericCols;

//     STORAGE.setRooms(rooms);

//     // Existing plan uses the old room dimensions.
//     STORAGE.clearSeatingPlan();

//     STORAGE.logActivity(
//       `Room updated: ${roomNumber}`
//     );

//     return { ok: true };
//   },

//   remove(roomNumber) {
//     const rooms = STORAGE.getRooms();

//     const exists = rooms.some(
//       (r) => r.roomNumber === roomNumber
//     );

//     STORAGE.setRooms(
//       rooms.filter(
//         (r) => r.roomNumber !== roomNumber
//       )
//     );

//     if (exists) {
//       // Existing seating may contain students assigned to this room.
//       STORAGE.clearSeatingPlan();

//       STORAGE.logActivity(
//         `Room removed: ${roomNumber}`
//       );
//     }

//     return { ok: true };
//   },

//   totalCapacity() {
//     return STORAGE.getRooms().reduce(
//       (sum, r) => sum + r.capacity,
//       0
//     );
//   }
// };

/* ==========================================================================
   rooms.js
   CRUD for exam rooms. Each room: { roomNumber, rows, cols, capacity }
   ========================================================================== */

const Rooms = {

  all() {
    return STORAGE.getRooms();
  },


  add({ roomNumber, rows, cols }) {

    if (!roomNumber || !rows || !cols) {
      return {
        ok: false,
        message: "Room number, rows and columns are required."
      };
    }


    const rooms = STORAGE.getRooms();


    if (
      rooms.some(
        (r) =>
          r.roomNumber.toLowerCase() ===
          roomNumber.toLowerCase()
      )
    ) {
      return {
        ok: false,
        message: `Room ${roomNumber} already exists.`
      };
    }


    const numericRows = Number(rows);
    const numericCols = Number(cols);


    if (
      !Number.isInteger(numericRows) ||
      !Number.isInteger(numericCols) ||
      numericRows <= 0 ||
      numericCols <= 0
    ) {
      return {
        ok: false,
        message: "Rows and columns must be positive whole numbers."
      };
    }


    rooms.push({
      roomNumber,
      rows: numericRows,
      cols: numericCols,
      capacity: numericRows * numericCols
    });


    STORAGE.setRooms(rooms);


    // Room changes affect available seating capacity/layout.
    STORAGE.clearSeatingPlan();


    STORAGE.logActivity(
      `Room added: ${roomNumber} (${numericRows}x${numericCols})`
    );


    return {
      ok: true
    };

  },


  update(roomNumber, { rows, cols }) {

    const rooms = STORAGE.getRooms();


    const idx = rooms.findIndex(
      (r) => r.roomNumber === roomNumber
    );


    if (idx === -1) {
      return {
        ok: false,
        message: "Room not found."
      };
    }


    const numericRows = Number(rows);
    const numericCols = Number(cols);


    if (
      !Number.isInteger(numericRows) ||
      !Number.isInteger(numericCols) ||
      numericRows <= 0 ||
      numericCols <= 0
    ) {
      return {
        ok: false,
        message: "Rows and columns must be positive whole numbers."
      };
    }


    rooms[idx].rows = numericRows;
    rooms[idx].cols = numericCols;

    rooms[idx].capacity =
      numericRows * numericCols;


    STORAGE.setRooms(rooms);


    // Existing plan uses the old room dimensions.
    STORAGE.clearSeatingPlan();


    STORAGE.logActivity(
      `Room updated: ${roomNumber}`
    );


    return {
      ok: true
    };

  },


  remove(roomNumber) {

    const rooms = STORAGE.getRooms();


    const exists = rooms.some(
      (r) => r.roomNumber === roomNumber
    );


    STORAGE.setRooms(
      rooms.filter(
        (r) => r.roomNumber !== roomNumber
      )
    );


    if (exists) {

      // Existing seating may contain students assigned to this room.
      STORAGE.clearSeatingPlan();


      STORAGE.logActivity(
        `Room removed: ${roomNumber}`
      );

    }


    return {
      ok: true
    };

  },


  totalCapacity() {

    return STORAGE
      .getRooms()
      .reduce(
        (sum, r) => sum + r.capacity,
        0
      );

  }

};