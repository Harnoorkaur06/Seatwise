/* ============================================================
   SEATWISE — EXPORT & PRINT MODULE
   ------------------------------------------------------------
   SAFE REPLACEMENT FOR js/export.js

   PRINT OUTPUT:
   - Chitkara-style official examination seating plan
   - SEATWISE branding
   - Room-wise A4 pages
   - Seating grid
   - Course summary
   - Invigilator / signature section
   - Conflict indication

   PRESERVED:
   - ExportUtil.printSeatingPlan()
   - ExportUtil.exportSeatingCSV()
   - Seating algorithm
   - Seating data
   - Conflict detection
   - LocalStorage
   - UI rendering
   - Student management
   - Room management
   ============================================================ */

const ExportUtil = (() => {

  /* ==========================================================
     GLOBAL PRINT STATE
     ========================================================== */

  let activePlanForPrint = null;


  /* ==========================================================
     SMALL HELPERS
     ========================================================== */

  function escapeHTML(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  function escapeCSV(value) {

    const text = String(value ?? "");

    if (
      text.includes(",") ||
      text.includes('"') ||
      text.includes("\n")
    ) {

      return `"${text.replace(/"/g, '""')}"`;

    }

    return text;

  }


  function safeParseJSON(value, fallback) {

    if (!value) {
      return fallback;
    }

    try {

      return JSON.parse(value);

    } catch (error) {

      return fallback;

    }

  }


  function getStoredValue(key, fallback = null) {

    try {

      const value =
        localStorage.getItem(key);

      if (value === null) {
        return fallback;
      }

      return safeParseJSON(
        value,
        fallback
      );

    } catch (error) {

      return fallback;

    }

  }


  /* ==========================================================
     CURRENT PLAN
     ========================================================== */

  function getCurrentPlan() {

    if (
      typeof Seating !== "undefined" &&
      Seating &&
      typeof Seating.getCurrentPlan === "function"
    ) {

      return Seating.getCurrentPlan();

    }

    return null;

  }


  function getRoomFromPlan(
    plan,
    roomNumber
  ) {

    if (
      !plan ||
      !Array.isArray(plan.rooms)
    ) {

      return null;

    }


    return plan.rooms.find(
      room =>
        String(room.roomNumber) ===
        String(roomNumber)
    ) || null;

  }


  function getAllRooms(plan) {

    if (
      !plan ||
      !Array.isArray(plan.rooms)
    ) {

      return [];

    }

    return plan.rooms;

  }


  /* ==========================================================
     SEAT LABEL
     ========================================================== */

  function getSeatLabel(
    row,
    col
  ) {

    const rowLetter =
      String.fromCharCode(
        65 + Number(row)
      );

    return `${rowLetter}${Number(col) + 1}`;

  }


  /* ==========================================================
     CONFLICT HELPERS
     ========================================================== */

  function getRoomConflicts(room) {

    if (!room) {
      return [];
    }


    if (
      activePlanForPrint &&
      Array.isArray(
        activePlanForPrint.conflicts
      )
    ) {

      return activePlanForPrint.conflicts.filter(
        conflict =>
          String(
            conflict.roomNumber
          ) ===
          String(
            room.roomNumber
          )
      );

    }


    if (
      Array.isArray(room.conflicts)
    ) {

      return room.conflicts;

    }


    return [];

  }


  function buildConflictSeatSet(room) {

    const conflictSeatKeys =
      new Set();


    const conflicts =
      getRoomConflicts(room);


    conflicts.forEach(
      conflict => {

        if (conflict.seatA) {

          conflictSeatKeys.add(
            String(conflict.seatA)
          );

        }

        if (conflict.seatB) {

          conflictSeatKeys.add(
            String(conflict.seatB)
          );

        }

      }
    );


    return conflictSeatKeys;

  }


  /* ==========================================================
     STUDENT DATA
     ========================================================== */

  function getStudentRecords() {

    const students =
      getStoredValue(
        "students",
        []
      );


    if (Array.isArray(students)) {

      return students;

    }


    return [];

  }


  function buildStudentMap() {

    const map = new Map();


    getStudentRecords().forEach(
      student => {

        if (!student) {
          return;
        }


        const roll =
          student.rollNumber ||
          student.rollNo ||
          student.roll ||
          "";


        if (!roll) {
          return;
        }


        map.set(
          String(roll),
          student
        );

      }
    );


    return map;

  }


  function getStudentForSeat(
    seat,
    studentMap
  ) {

    if (!seat) {
      return null;
    }


    const roll =
      seat.rollNo ||
      seat.rollNumber ||
      seat.roll ||
      "";


    if (!roll) {
      return null;
    }


    return (
      studentMap.get(
        String(roll)
      ) ||
      null
    );

  }


  /* ==========================================================
     EXAM DATA
     ========================================================== */

  function getExamData(plan) {

    /*
      The project may store exams as:
      - an array
      - a single object
      - inside the seating plan

      We safely support all three.
    */


    if (
      plan &&
      plan.exam &&
      typeof plan.exam === "object"
    ) {

      return plan.exam;

    }


    if (
      plan &&
      plan.examData &&
      typeof plan.examData === "object"
    ) {

      return plan.examData;

    }


    const exams =
      getStoredValue(
        "exams",
        []
      );


    if (Array.isArray(exams)) {

      /*
        If the plan contains an examId,
        use the matching exam.
      */

      if (plan && plan.examId) {

        const matchingExam =
          exams.find(
            exam =>
              String(exam.id) ===
              String(plan.examId)
          );


        if (matchingExam) {

          return matchingExam;

        }

      }


      /*
        Otherwise use the first available
        exam record.
      */

      return exams[0] || {};

    }


    if (
      exams &&
      typeof exams === "object"
    ) {

      return exams;

    }


    return {};

  }


  /* ==========================================================
     DATE / TIME FORMATTERS
     ========================================================== */

  function formatExamDate(value) {

    if (!value) {
      return "";
    }


    const date =
      new Date(value);


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return String(value);

    }


    const day =
      String(
        date.getDate()
      ).padStart(
        2,
        "0"
      );


    const month =
      String(
        date.getMonth() + 1
      ).padStart(
        2,
        "0"
      );


    const year =
      date.getFullYear();


    return `${day}-${month}-${year}`;

  }


  function formatExamTime(value) {

    if (!value) {
      return "";
    }


    if (
      typeof value === "string"
    ) {

      /*
        Preserve normal strings such as:
        09:30 - 12:30
        09:30 AM - 12:30 PM
      */

      return value;

    }


    return String(value);

  }


  function getExamTitleData(
    plan
  ) {

    const exam =
      getExamData(plan);


    const examName =
      exam.name ||
      exam.examName ||
      exam.title ||
      "EXAMINATIONS";


    const examDate =
      formatExamDate(
        exam.date ||
        exam.examDate ||
        exam.exam_date ||
        ""
      );


    const examTime =
      formatExamTime(
        exam.time ||
        exam.examTime ||
        exam.timings ||
        exam.duration ||
        ""
      );


    let title =
      `SEATING PLAN FOR ${examName}`;


    if (examDate) {

      title +=
        `, DATED: ${examDate}`;

    }


    if (examTime) {

      title +=
        `, TIMINGS: ${examTime}`;

    }


    return {

      title,
      exam

    };

  }


  /* ==========================================================
     ROOM NAME
     ========================================================== */

  function getRoomDisplayName(
    room
  ) {

    if (!room) {
      return "";
    }


    return (
      room.roomNumber ||
      room.name ||
      room.roomName ||
      ""
    );

  }


  /* ==========================================================
     BRANCH / DISCIPLINE
     ========================================================== */

  function getDiscipline(
    seat,
    student
  ) {

    if (student) {

      return (
        student.branch ||
        student.discipline ||
        student.department ||
        student.course ||
        ""
      );

    }


    if (seat) {

      return (
        seat.branch ||
        seat.discipline ||
        ""
      );

    }


    return "";

  }


  /* ==========================================================
     COURSE INFORMATION
     ========================================================== */

  function getCourseCode(
    seat,
    student
  ) {

    return (
      (student &&
        (
          student.courseCode ||
          student.course ||
          student.subjectCode
        )) ||
      (seat &&
        (
          seat.courseCode ||
          seat.subjectCode
        )) ||
      (seat &&
        seat.subject) ||
      ""
    );

  }


  function getCourseName(
    seat,
    student
  ) {

    return (
      (student &&
        (
          student.courseName ||
          student.subjectName
        )) ||
      (seat &&
        (
          seat.courseName ||
          seat.subjectName
        )) ||
      (seat &&
        seat.subject) ||
      ""
    );

  }


  function getSemester(
    student,
    exam
  ) {

    return (
      (student &&
        student.semester) ||
      (exam &&
        exam.semester) ||
      ""
    );

  }


  function getExamMode(
    exam
  ) {

    return (
      (exam &&
        (
          exam.mode ||
          exam.examMode
        )) ||
      "OFFLINE"
    );

  }


  function getExamType(
    exam
  ) {

    return (
      (exam &&
        (
          exam.type ||
          exam.examType
        )) ||
      "REGULAR"
    );

  }


  /* ==========================================================
     BUILD COURSE SUMMARY
     ========================================================== */

  function buildCourseSummary(
    room
  ) {

    const studentMap =
      buildStudentMap();


    const exam =
      getExamData(
        activePlanForPrint
      );


    const groups =
      new Map();


    const rows =
      Number(room.rows) || 0;


    const cols =
      Number(room.cols) || 0;


    for (
      let r = 0;
      r < rows;
      r++
    ) {

      for (
        let c = 0;
        c < cols;
        c++
      ) {

        const seat =
          room.grid &&
          room.grid[r]
            ? room.grid[r][c]
            : null;


        if (!seat) {
          continue;
        }


        const student =
          getStudentForSeat(
            seat,
            studentMap
          );


        const courseCode =
          getCourseCode(
            seat,
            student
          ) ||
          "—";


        const key =
          String(
            courseCode
          );


        if (
          !groups.has(key)
        ) {

          groups.set(
            key,
            {

              courseCode,

              discipline:
                getDiscipline(
                  seat,
                  student
                ) || "—",

              courseName:
                getCourseName(
                  seat,
                  student
                ) || "—",

              seatedCount: 0,

              semester:
                getSemester(
                  student,
                  exam
                ) || "—"

            }
          );

        }


        groups.get(
          key
        ).seatedCount++;

      }

    }


    return [...groups.values()];

  }


  /* ==========================================================
     CHITKARA LOGO
     ========================================================== */

  // function buildChitkaraLogo() {

  //   /*
  //     Inline logo keeps the print page independent
  //     from external image files.
  //   */

  //   return `

  //     <div class="chitkara-logo">

  //       <div class="chitkara-wordmark">

  //         <div class="chitkara-text">
  //           CHITKARA
  //         </div>

  //         <div class="university-text">
  //           UNIVERSITY
  //         </div>

  //       </div>

  //       <div class="chitkara-mark">

  //         <svg
  //           viewBox="0 0 50 50"
  //           aria-hidden="true"
  //         >

  //           <rect
  //             x="0"
  //             y="0"
  //             width="50"
  //             height="50"
  //             rx="2"
  //             fill="#e21d2f"
  //           />

  //           <path
  //             d="
  //               M12 10
  //               H38
  //               V16
  //               H18
  //               V22
  //               H34
  //               V28
  //               H18
  //               V34
  //               H38
  //               V40
  //               H12
  //               Z
  //             "
  //             fill="#ffffff"
  //           />

  //         </svg>

  //       </div>

  //     </div>

  //   `;

  // }

function buildChitkaraLogo() {

  /*
    Official Chitkara University logo.
    Stored locally inside the project so
    print/export does not depend on an
    external website.
  */

  return `

    <div class="chitkara-logo">

      <img
        src="assets/chitkara-university-logo.png"
        alt="Chitkara University"
        class="chitkara-logo-image"
      />

    </div>

  `;

}


  /* ==========================================================
     SEATWISE LOGO
     ========================================================== */

  function buildSeatwiseLogo() {

    return `

      <div class="seatwise-logo">

        <div class="seatwise-name">
          SEAT<span>WISE</span>
        </div>

        <div class="seatwise-tagline">
          SMART EXAMINATION SEATING
        </div>

      </div>

    `;

  }


  /* ==========================================================
     BUILD ONE ROOM
     ========================================================== */

  function buildRoomPrintHTML(
    room,
    roomIndex,
    totalRooms,
    pageNumber
  ) {

    const rows =
      Number(room.rows) || 0;


    const cols =
      Number(room.cols) || 0;


    const roomName =
      getRoomDisplayName(
        room
      );


    const conflictSeatKeys =
      buildConflictSeatSet(
        room
      );


    const studentMap =
      buildStudentMap();


    const courseSummary =
      buildCourseSummary(
        room
      );


    let tableHTML = `

      <table class="official-seating-table">

        <thead>

          <tr class="seat-header-row">

    `;


    /*
      FIRST HEADER ROW
      Course / Subject
    */

    for (
      let c = 0;
      c < cols;
      c++
    ) {

      let columnSubject = "";
      let columnStudent = null;


      for (
        let r = 0;
        r < rows;
        r++
      ) {

        const seat =
          room.grid &&
          room.grid[r]
            ? room.grid[r][c]
            : null;


        if (seat) {

          const student =
            getStudentForSeat(
              seat,
              studentMap
            );


          columnSubject =
            getCourseCode(
              seat,
              student
            ) ||
            seat.subject ||
            "";


          columnStudent =
            student;


          break;

        }

      }


      tableHTML += `

        <th>

          <div class="course-header">
            ${escapeHTML(
              columnSubject ||
              "—"
            )}
          </div>

          <div class="set-header">
            ${escapeHTML(
              columnStudent &&
              (
                columnStudent.set ||
                columnStudent.section ||
                ""
              )
                ? `(${columnStudent.set || columnStudent.section})`
                : ""
            )}
          </div>

        </th>

      `;

    }


    tableHTML += `

          </tr>

          <tr class="discipline-row">

    `;


    /*
      SECOND HEADER ROW
      Discipline / Branch
    */

    for (
      let c = 0;
      c < cols;
      c++
    ) {

      let discipline = "";


      for (
        let r = 0;
        r < rows;
        r++
      ) {

        const seat =
          room.grid &&
          room.grid[r]
            ? room.grid[r][c]
            : null;


        if (seat) {

          const student =
            getStudentForSeat(
              seat,
              studentMap
            );


          discipline =
            getDiscipline(
              seat,
              student
            ) ||
            "";


          if (discipline) {
            break;
          }

        }

      }


      tableHTML += `

        <th class="discipline-cell">

          ${escapeHTML(
            discipline ||
            "—"
          )}

        </th>

      `;

    }


    tableHTML += `

          </tr>

        </thead>

        <tbody>

    `;


    /*
      SEATING ROWS
    */

    for (
      let r = 0;
      r < rows;
      r++
    ) {

      tableHTML += "<tr>";


      for (
        let c = 0;
        c < cols;
        c++
      ) {

        const seat =
          room.grid &&
          room.grid[r]
            ? room.grid[r][c]
            : null;


        const seatLabel =
          getSeatLabel(
            r,
            c
          );


        const seatKey =
          seat &&
          seat.seat
            ? String(
                seat.seat
              )
            : seatLabel;


        const isConflict =
          conflictSeatKeys.has(
            seatKey
          );


        if (!seat) {

          tableHTML += `

            <td
              class="blocked-cell"
            >

              <span>
                BLOCKED
              </span>

            </td>

          `;


          continue;

        }


        const student =
          getStudentForSeat(
            seat,
            studentMap
          );


        const rollNumber =
          seat.rollNo ||
          seat.rollNumber ||
          seat.roll ||
          "";


        const subject =
          getCourseCode(
            seat,
            student
          ) ||
          seat.subject ||
          "";


        tableHTML += `

          <td
            class="${
              isConflict
                ? "conflict-cell"
                : ""
            }"
          >

            <div class="roll-number">

              ${escapeHTML(
                rollNumber ||
                "—"
              )}

            </div>

            ${
              subject
                ? `
                  <div class="cell-subject">
                    ${escapeHTML(
                      subject
                    )}
                  </div>
                `
                : ""
            }

            ${
              isConflict
                ? `
                  <div class="cell-conflict">
                    CONFLICT
                  </div>
                `
                : ""
            }

          </td>

        `;

      }


      tableHTML += "</tr>";

    }


    tableHTML += `

        </tbody>

      </table>

    `;


    /* ========================================================
       COURSE SUMMARY TABLE
       ======================================================== */

    let summaryHTML = `

      <table class="course-summary-table">

        <thead>

          <tr>

            <th>Course Code</th>
            <th>Discipline</th>
            <th>Course Name</th>
            <th>Seated Count</th>
            <th>Exam Mode</th>
            <th>Semester</th>
            <th>Exam Type</th>

          </tr>

        </thead>

        <tbody>

    `;


    const exam =
      getExamData(
        activePlanForPrint
      );


    if (
      courseSummary.length === 0
    ) {

      summaryHTML += `

        <tr>

          <td colspan="7">
            No course information available
          </td>

        </tr>

      `;

    } else {

      courseSummary.forEach(
        course => {

          summaryHTML += `

            <tr>

              <td>
                ${escapeHTML(
                  course.courseCode
                )}
              </td>

              <td>
                ${escapeHTML(
                  course.discipline
                )}
              </td>

              <td>
                ${escapeHTML(
                  course.courseName
                )}
              </td>

              <td>
                ${escapeHTML(
                  course.seatedCount
                )}
              </td>

              <td>
                ${escapeHTML(
                  getExamMode(
                    exam
                  )
                )}
              </td>

              <td>
                ${escapeHTML(
                  course.semester
                )}
              </td>

              <td>
                ${escapeHTML(
                  getExamType(
                    exam
                  )
                )}
              </td>

            </tr>

          `;

        }
      );

    }


    const totalStudents =
      courseSummary.reduce(
        (
          total,
          course
        ) =>
          total +
          Number(
            course.seatedCount
          ),
        0
      );


    summaryHTML += `

          <tr class="summary-total-row">

            <td
              colspan="3"
            >
              Total Students in Room
            </td>

            <td>
              ${escapeHTML(
                totalStudents
              )}
            </td>

            <td colspan="3"></td>

          </tr>

        </tbody>

      </table>

    `;


    /* ========================================================
       ROOM SECTION
       ======================================================== */

    return `

      <section
        class="room-section"
        data-room="${escapeHTML(
          roomName
        )}"
      >

        <!-- PAGE HEADER -->

        <div class="page-header">

          <div class="header-left">

            ${buildChitkaraLogo()}

          </div>


          <div class="header-center">

            ${buildSeatwiseLogo()}

          </div>


          <div class="header-right">

            <div class="page-number">
              Page No.: ${pageNumber}/${totalRooms}
            </div>

          </div>

        </div>


        <!-- TITLE -->

        <div class="exam-title">

          ${escapeHTML(
            getExamTitleData(
              activePlanForPrint
            ).title
          )}

        </div>


        <!-- INSTRUCTIONS -->

        <div class="instructions-block">

          <div class="instructions-title">
            Mandatory Instructions.
          </div>


          <div class="cloak-room">

            CLOAK ROOM VENUE :
            TG-212, Turing Block,
            Second Floor

          </div>


          <ol>

            <li>
              No student should be without Admit card.
            </li>

            <li>
              Mobile phones/Smart Watch
              (even if switched off),
              electronic Gadgets or any other
              material directly or indirectly
              related to examinations are
              strictly banned.
            </li>

            <li>
              All belongings to be kept in cloak room,
              otherwise in case of any loss,
              the university authorities will not
              be responsible.
            </li>

            <li>
              No student will leave the examination
              hall before half time.
            </li>

            <li>
              In case of a lost or misplaced admit card,
              students should report to the conduct
              branch, Darwin Block (2nd Floor)
              with University Identity Card.
            </li>

            <li>
              Students must report at least 15 minutes
              before the start of Examination at their
              respective examination venues.
            </li>

          </ol>

        </div>


        <!-- ROOM -->

        <div class="room-title-official">

          Room:
          ${escapeHTML(
            roomName
          )}

        </div>


        <!-- FRONT -->

        <div class="front-label">
          FRONT
        </div>


        <!-- SEATING TABLE -->

        <div class="seating-table-container">

          ${tableHTML}

        </div>


        <!-- BACK -->

        <div class="back-label">
          BACK
        </div>


        <!-- SUMMARY -->

        <div class="summary-title">
          Course / Examination Details
        </div>


        ${summaryHTML}


        <!-- OFFICIAL FOOTER FIELDS -->

        <div class="official-fields">

          <div class="field-row">

            <div class="field-left">

              UMC Roll Number if any:
              <span class="line-long">
                __________________
              </span>

            </div>


            <div class="field-center">

              Absent Roll Number:
              <span class="line-long">
                __________________
              </span>

            </div>


            <div class="field-right">

              Remarks:
              <span class="line-short">
                _______
              </span>

            </div>

          </div>


          <div class="field-row">

            <div class="field-left">

              Name of the Invigilator-1:
              <span class="line-long">
                __________________
              </span>

            </div>


            <div class="field-center">

              Employee Code:
              <span class="line-long">
                __________________
              </span>

            </div>


            <div class="field-right">

              Signature:
              <span class="line-short">
                _______
              </span>

            </div>

          </div>


          <div class="field-row">

            <div class="field-left">

              Name of the Invigilator-2:
              <span class="line-long">
                __________________
              </span>

            </div>


            <div class="field-center">

              Employee Code:
              <span class="line-long">
                __________________
              </span>

            </div>


            <div class="field-right">

              Signature:
              <span class="line-short">
                _______
              </span>

            </div>

          </div>

        </div>


        <!-- SEATWISE FOOTER -->

        <div class="seatwise-footer">

          <span>
            Generated by SEATWISE
          </span>

          <span>
            Official Examination Seating Plan
          </span>

        </div>

      </section>

    `;

  }


  /* ==========================================================
     BUILD COMPLETE PRINT DOCUMENT
     ========================================================== */

  function buildPrintDocument(
    roomsToPrint
  ) {

    const generatedAt =
      new Date();


    const generatedText =
      generatedAt.toLocaleString(
        undefined,
        {
          dateStyle: "medium",
          timeStyle: "short"
        }
      );


    const documentTitle =
      roomsToPrint.length === 1

        ? `SEATWISE — ${
            roomsToPrint[0].roomNumber
          } Seating Plan`

        : "SEATWISE — Official Seating Plans";


    let roomsHTML = "";


    roomsToPrint.forEach(
      (
        room,
        index
      ) => {

        roomsHTML +=
          buildRoomPrintHTML(
            room,
            index,
            roomsToPrint.length,
            index + 1
          );

      }
    );


    return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>
  ${escapeHTML(
    documentTitle
  )}
</title>


<style>

/* ==========================================================
   PAGE SETUP
   ========================================================== */

@page {

  size: A4 portrait;

  margin:
    8mm
    8mm
    10mm
    8mm;

}


* {

  box-sizing: border-box;

}


html,
body {

  margin: 0;

  padding: 0;

  background: #ffffff;

  color: #111111;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

}


body {

  font-size: 9px;

  line-height: 1.25;

}


.print-document {

  width: 100%;

  margin: 0 auto;

}


/* ==========================================================
   PAGE / ROOM
   ========================================================== */

.room-section {

  width: 100%;

  min-height:
    270mm;

  position: relative;

}


.room-section:not(:first-child) {

  page-break-before: always;

  break-before: page;

}


/* ==========================================================
   HEADER
   ========================================================== */

.page-header {

  width: 100%;

  display: grid;

  grid-template-columns:
    1fr
    1.4fr
    1fr;

  align-items: center;

  min-height: 20mm;

  margin-bottom: 2mm;

}


.header-left {

  display: flex;

  align-items: flex-start;

  justify-content: flex-start;

}


.header-center {

  display: flex;

  justify-content: center;

  align-items: center;

}


.header-right {

  display: flex;

  justify-content: flex-end;

  align-items: flex-start;

}


/* ==========================================================
   CHITKARA LOGO
   ========================================================== */

.chitkara-logo {

  display: flex;

  align-items: center;

  gap: 5px;

}


.chitkara-wordmark {

  line-height: 0.9;

  text-align: left;

}


.chitkara-text {

  font-size: 11px;

  font-weight: 900;

  letter-spacing: -0.5px;

  color: #111111;

}


.university-text {

  font-size: 7px;

  font-weight: 700;

  letter-spacing: 0.8px;

  color: #111111;

}


.chitkara-mark {

  width: 20px;

  height: 20px;

}


.chitkara-mark svg {

  width: 20px;

  height: 20px;

  display: block;

}


/* ==========================================================
   SEATWISE LOGO
   ========================================================== */

.seatwise-logo {

  text-align: center;

}


.seatwise-name {

  font-size: 19px;

  line-height: 1;

  font-weight: 900;

  letter-spacing: -0.8px;

  color: #111111;

}


.seatwise-name span {

  color: #2563eb;

}


.seatwise-tagline {

  margin-top: 2px;

  font-size: 6.5px;

  font-weight: 700;

  letter-spacing: 1.4px;

  color: #606060;

}


.page-number {

  font-size: 8px;

  font-weight: 700;

  color: #111111;

}


/* ==========================================================
   EXAM TITLE
   ========================================================== */

.exam-title {

  text-align: center;

  font-size: 9.5px;

  font-weight: 800;

  margin:
    2mm
    0
    4mm
    0;

}


/* ==========================================================
   INSTRUCTIONS
   ========================================================== */

.instructions-block {

  margin:
    0
    8mm;

}


.instructions-title {

  font-size: 9px;

  font-weight: 800;

  text-decoration: underline;

  margin-bottom: 2px;

}


.cloak-room {

  font-size: 9px;

  font-weight: 800;

  margin-bottom: 2px;

}


.instructions-block ol {

  margin:
    2px
    0
    0
    15px;

  padding: 0;

}


.instructions-block li {

  margin-bottom: 2px;

  padding-left: 1px;

  font-size: 7.3px;

}


/* ==========================================================
   ROOM TITLE
   ========================================================== */

.room-title-official {

  text-align: center;

  font-size: 10px;

  font-weight: 800;

  margin:
    5mm
    0
    1mm
    0;

}


/* ==========================================================
   FRONT / BACK
   ========================================================== */

.front-label,
.back-label {

  text-align: center;

  font-size: 8px;

  font-weight: 800;

  letter-spacing: 2.5px;

  margin:
    1mm
    0;

}


.front-label {

  margin-top: 1mm;

}


.back-label {

  margin-top: 1mm;

  margin-bottom: 2mm;

}


/* ==========================================================
   SEATING TABLE
   ========================================================== */

.seating-table-container {

  width: 100%;

  overflow: hidden;

}


.official-seating-table {

  width: 100%;

  border-collapse: collapse;

  table-layout: fixed;

  border:
    1px solid #111111;

}


.official-seating-table th,
.official-seating-table td {

  border:
    1px solid #222222;

  text-align: center;

  vertical-align: middle;

  padding: 2px;

}


.official-seating-table thead th {

  background:
    #dbe5f1;

  font-weight: 800;

}


.seat-header-row th {

  height: 8mm;

}


.course-header {

  font-size: 7px;

  font-weight: 800;

  line-height: 1.05;

}


.set-header {

  font-size: 6.5px;

  font-weight: 700;

  margin-top: 1px;

}


.discipline-row th {

  height: 5mm;

  font-size: 7px;

  font-weight: 800;

}


.official-seating-table tbody td {

  height: 7.2mm;

  font-size: 7.5px;

  background: #ffffff;

}


.roll-number {

  font-size: 7.5px;

  font-weight: 600;

  line-height: 1.05;

  white-space: nowrap;

}


.cell-subject {

  margin-top: 1px;

  font-size: 6px;

  font-weight: 800;

  color: #333333;

}


.blocked-cell {

  background:
    #f2c8c8 !important;

  font-size: 7px;

  font-weight: 700;

}


.conflict-cell {

  background:
    #ffe3e3 !important;

  border:
    2px solid #dc2626 !important;

}


.cell-conflict {

  margin-top: 1px;

  font-size: 5px;

  font-weight: 900;

  color: #dc2626;

  letter-spacing: 0.3px;

}


/* ==========================================================
   COURSE SUMMARY
   ========================================================== */

.summary-title {

  margin-top: 4mm;

  margin-bottom: 1.5mm;

  font-size: 8.5px;

  font-weight: 800;

}


.course-summary-table {

  width: 70%;

  border-collapse: collapse;

  table-layout: fixed;

}


.course-summary-table th,
.course-summary-table td {

  border:
    1px solid #222222;

  padding:
    2px
    2px;

  text-align: center;

  vertical-align: middle;

  font-size: 6.5px;

}


.course-summary-table th {

  background:
    #dbe5f1;

  font-weight: 800;

}


.course-summary-table td:nth-child(1) {

  width: 17%;

}


.course-summary-table td:nth-child(2) {

  width: 13%;

}


.course-summary-table td:nth-child(3) {

  width: 25%;

}


.course-summary-table td:nth-child(4) {

  width: 12%;

}


.course-summary-table td:nth-child(5) {

  width: 12%;

}


.course-summary-table td:nth-child(6) {

  width: 9%;

}


.course-summary-table td:nth-child(7) {

  width: 12%;

}


.summary-total-row td {

  font-weight: 800;

  background:
    #f2f2f2;

}


/* ==========================================================
   OFFICIAL FIELDS
   ========================================================== */

.official-fields {

  margin-top: 13mm;

}


.field-row {

  display: grid;

  grid-template-columns:
    1.25fr
    1.25fr
    0.8fr;

  align-items: center;

  column-gap: 8mm;

  margin-bottom: 8mm;

}


.field-left,
.field-center,
.field-right {

  font-size: 8px;

  white-space: nowrap;

}


.field-right {

  text-align: right;

}


.line-long {

  display: inline-block;

  min-width: 32mm;

  border-bottom:
    1px solid #111111;

  height: 9px;

}


.line-short {

  display: inline-block;

  min-width: 17mm;

  border-bottom:
    1px solid #111111;

  height: 9px;

}


/* ==========================================================
   SEATWISE FOOTER
   ========================================================== */

.seatwise-footer {

  position: absolute;

  bottom: 0;

  left: 0;

  right: 0;

  display: flex;

  justify-content: space-between;

  border-top:
    1px solid #aaaaaa;

  padding-top: 2mm;

  font-size: 6px;

  color: #666666;

}


/* ==========================================================
   SCREEN PREVIEW
   ========================================================== */

@media screen {

  body {

    background: #e5e7eb;

    padding:
      25px;

  }


  .print-document {

    background: #ffffff;

    max-width: 210mm;

    margin: 0 auto;

    padding:
      10mm;

    box-shadow:
      0
      10px
      40px
      rgba(
        0,
        0,
        0,
        0.15
      );

  }


  .print-actions {

    position: sticky;

    top: 0;

    z-index: 100;

    display: flex;

    justify-content: flex-end;

    gap: 8px;

    padding: 10px;

    margin-bottom: 15px;

    background: #ffffff;

    border-bottom:
      1px solid #dddddd;

  }


  .print-actions button {

    border: 0;

    border-radius: 5px;

    padding:
      8px
      14px;

    font-size: 12px;

    font-weight: 700;

    cursor: pointer;

    background: #111827;

    color: #ffffff;

  }


  .print-actions button.secondary {

    background: #e5e7eb;

    color: #111827;

  }

}


/* ==========================================================
   PRINT
   ========================================================== */

@media print {

  html,
  body {

    background: #ffffff !important;

    padding: 0 !important;

    margin: 0 !important;

    -webkit-print-color-adjust:
      exact;

    print-color-adjust:
      exact;

  }


  .print-actions {

    display: none !important;

  }


  .print-document {

    width: 100%;

    max-width: none;

    padding: 0;

    margin: 0;

    box-shadow: none;

  }


  .room-section {

    page-break-inside: avoid;

    break-inside: avoid;

  }


  .official-seating-table {

    page-break-inside: avoid;

    break-inside: avoid;

  }


  .course-summary-table {

    page-break-inside: avoid;

    break-inside: avoid;

  }


  .official-fields {

    page-break-inside: avoid;

    break-inside: avoid;

  }

}

</style>

</head>


<body>


<div class="print-actions">

  <button
    class="secondary"
    onclick="window.close()"
  >
    Close
  </button>


  <button
    onclick="window.print()"
  >
    Print Seating Plan
  </button>

</div>


<div class="print-document">

  ${roomsHTML}

</div>


</body>

</html>`;

  }


  /* ==========================================================
     PRINT FUNCTION
     ========================================================== */

  function printSeatingPlan(
    roomNumber
  ) {

    const plan =
      getCurrentPlan();


    if (!plan) {

      alert(
        "No seating plan available to print. Please generate a seating plan first."
      );

      return;

    }


    activePlanForPrint =
      plan;


    let roomsToPrint =
      [];


    /*
      If a room was supplied,
      print only that room.
    */

    if (roomNumber) {

      const room =
        getRoomFromPlan(
          plan,
          roomNumber
        );


      if (!room) {

        alert(
          "The selected examination room could not be found."
        );

        activePlanForPrint =
          null;

        return;

      }


      roomsToPrint = [
        room
      ];

    } else {

      roomsToPrint =
        getAllRooms(
          plan
        );

    }


    if (
      roomsToPrint.length === 0
    ) {

      alert(
        "No examination rooms are available to print."
      );

      activePlanForPrint =
        null;

      return;

    }


    const printWindow =
      window.open(
        "",
        "_blank",
        "width=1200,height=900"
      );


    if (!printWindow) {

      alert(
        "Please allow pop-ups for SEATWISE so the seating plan can be printed."
      );

      activePlanForPrint =
        null;

      return;

    }


    const printHTML =
      buildPrintDocument(
        roomsToPrint
      );


    printWindow.document.open();

    printWindow.document.write(
      printHTML
    );

    printWindow.document.close();


    /*
      Wait for the print document to render.
    */

    printWindow.onload = () => {

      setTimeout(
        () => {

          try {

            printWindow.focus();

            printWindow.print();

          } catch (error) {

            console.error(
              "SEATWISE print error:",
              error
            );

          }

        },
        300
      );

    };


    /*
      Do not clear immediately because
      buildRoomPrintHTML has already used
      activePlanForPrint and the window
      can still be rendering.
    */

    setTimeout(
      () => {

        activePlanForPrint =
          null;

      },
      3000
    );

  }


  /* ==========================================================
     CSV EXPORT
     ========================================================== */

  function exportSeatingCSV() {

    const plan =
      getCurrentPlan();


    if (!plan) {

      alert(
        "No seating plan available to export."
      );

      return;

    }


    const rows = [

      [
        "Room",
        "Seat",
        "Roll Number",
        "Name",
        "Subject"
      ]

    ];


    getAllRooms(
      plan
    ).forEach(
      room => {

        const roomRows =
          Number(room.rows) || 0;


        const roomCols =
          Number(room.cols) || 0;


        for (
          let r = 0;
          r < roomRows;
          r++
        ) {

          for (
            let c = 0;
            c < roomCols;
            c++
          ) {

            const seat =
              room.grid &&
              room.grid[r]
                ? room.grid[r][c]
                : null;


            if (!seat) {

              rows.push([

                room.roomNumber,

                getSeatLabel(
                  r,
                  c
                ),

                "",

                "",

                ""

              ]);

              continue;

            }


            rows.push([

              room.roomNumber,

              seat.seat ||
                getSeatLabel(
                  r,
                  c
                ),

              seat.rollNo ||
                "",

              seat.name ||
                "",

              seat.subject ||
                ""

            ]);

          }

        }

      }
    );


    const csvContent =
      rows
        .map(
          row =>
            row
              .map(
                escapeCSV
              )
              .join(",")
        )
        .join("\n");


    const blob =
      new Blob(
        [csvContent],
        {
          type:
            "text/csv;charset=utf-8;"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const link =
      document.createElement(
        "a"
      );


    link.href =
      url;


    link.download =
      "seatwise_seating_plan.csv";


    document.body.appendChild(
      link
    );


    link.click();


    document.body.removeChild(
      link
    );


    setTimeout(
      () => {

        URL.revokeObjectURL(
          url
        );

      },
      1000
    );

  }


  /* ==========================================================
     PUBLIC API
     ========================================================== */

  return {

    printSeatingPlan,

    exportSeatingCSV

  };


})();