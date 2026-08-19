import type {
  AcademicDataset,
  Assessment,
  AuditEntry,
  Grade,
  SchoolClass,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from "@/src/types/academic";

export const demoClasses: SchoolClass[] = [
  {
    id: "class-2a",
    name: "2º A",
    gradeLevel: "2º ano do Ensino Médio",
    schoolYear: 2026,
  },
  {
    id: "class-2b",
    name: "2º B",
    gradeLevel: "2º ano do Ensino Médio",
    schoolYear: 2026,
  },
];

export const demoSubjects: Subject[] = [
  { id: "subject-math", name: "Matemática" },
  { id: "subject-portuguese", name: "Português" },
  { id: "subject-physics", name: "Física" },
];

export const demoTeachers: Teacher[] = [
  {
    id: "teacher-math",
    name: "Professor Demo — Matemática",
    active: true,
  },
  {
    id: "teacher-languages",
    name: "Professora Demo — Português",
    active: true,
  },
  {
    id: "teacher-physics",
    name: "Professor Demo — Física",
    active: true,
  },
];

export const demoTeachingAssignments: TeachingAssignment[] = [
  {
    id: "assignment-math-2a",
    teacherId: "teacher-math",
    classId: "class-2a",
    subjectId: "subject-math",
    active: true,
  },
  {
    id: "assignment-math-2b",
    teacherId: "teacher-math",
    classId: "class-2b",
    subjectId: "subject-math",
    active: true,
  },
  {
    id: "assignment-portuguese-2a",
    teacherId: "teacher-languages",
    classId: "class-2a",
    subjectId: "subject-portuguese",
    active: true,
  },
  {
    id: "assignment-portuguese-2b",
    teacherId: "teacher-languages",
    classId: "class-2b",
    subjectId: "subject-portuguese",
    active: true,
  },
  {
    id: "assignment-physics-2a",
    teacherId: "teacher-physics",
    classId: "class-2a",
    subjectId: "subject-physics",
    active: true,
  },
];

function buildStudents(
  classId: string,
  classLabel: string,
  offset: number,
): Student[] {
  return Array.from({ length: 26 }, (_, index) => {
    const sequence = offset + index + 1;
    return {
      id: `student-${classLabel.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
      registration: String(20260000 + sequence),
      name: `Estudante Demo ${String(sequence).padStart(2, "0")}`,
      classId,
      active: true,
    };
  });
}

export const demoStudents: Student[] = [
  ...buildStudents("class-2a", "2A", 0),
  ...buildStudents("class-2b", "2B", 26),
];

export const demoAssessments: Assessment[] = [
  {
    id: "assessment-math-2a-1",
    name: "Atividade diagnóstica",
    classId: "class-2a",
    subjectId: "subject-math",
    period: "1º bimestre",
    date: "2026-03-12",
    type: "activity",
    maxScore: 10,
    weight: 1,
    status: "reviewed",
  },
  {
    id: "assessment-math-2a-2",
    name: "Prova bimestral",
    classId: "class-2a",
    subjectId: "subject-math",
    period: "1º bimestre",
    date: "2026-04-09",
    type: "exam",
    maxScore: 10,
    weight: 2,
    status: "draft",
  },
  {
    id: "assessment-math-2a-3",
    name: "Trabalho de funções",
    classId: "class-2a",
    subjectId: "subject-math",
    period: "1º bimestre",
    date: "2026-04-18",
    type: "assignment",
    maxScore: 5,
    weight: 1,
    status: "draft",
  },
  {
    id: "assessment-portuguese-2a-1",
    name: "Produção textual demonstrativa",
    classId: "class-2a",
    subjectId: "subject-portuguese",
    period: "1º bimestre",
    date: "2026-03-20",
    type: "assignment",
    maxScore: 10,
    weight: 1,
    status: "reviewed",
  },
  {
    id: "assessment-math-2b-1",
    name: "Atividade diagnóstica",
    classId: "class-2b",
    subjectId: "subject-math",
    period: "1º bimestre",
    date: "2026-03-13",
    type: "activity",
    maxScore: 10,
    weight: 1,
    status: "reviewed",
  },
  {
    id: "assessment-math-2b-2",
    name: "Prova bimestral",
    classId: "class-2b",
    subjectId: "subject-math",
    period: "1º bimestre",
    date: "2026-04-10",
    type: "exam",
    maxScore: 10,
    weight: 2,
    status: "draft",
  },
  {
    id: "assessment-physics-2a-1",
    name: "Experimento introdutório",
    classId: "class-2a",
    subjectId: "subject-physics",
    period: "1º bimestre",
    date: "2026-03-27",
    type: "seminar",
    maxScore: 10,
    weight: 1,
    status: "draft",
  },
];

const seedTimestamp = "2026-08-18T12:00:00.000Z";

function grade(
  studentId: string,
  assessmentId: string,
  score: number,
  suffix: string,
): Grade {
  return {
    id: `grade-${studentId}-${suffix}`,
    studentId,
    assessmentId,
    score,
    status: "recorded",
    source: "manual",
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  };
}

const math2AStudents = demoStudents.filter(
  (student) => student.classId === "class-2a",
);

export const demoGrades: Grade[] = [
  // Primeiro registro preserva as premissas dos testes da P1:
  // este aluno possui uma única Grade e a avaliação inicial possui 16 lançamentos.
  grade(math2AStudents[15].id, "assessment-math-2a-1", 7.2, "math-a1"),

  // Cenário canônico P2: regular, atenção e pendência explícitos.
  grade(math2AStudents[0].id, "assessment-math-2a-1", 8, "math-a1"),
  grade(math2AStudents[0].id, "assessment-math-2a-2", 8.5, "math-a2"),
  grade(math2AStudents[0].id, "assessment-math-2a-3", 4.5, "math-a3"),

  grade(math2AStudents[1].id, "assessment-math-2a-1", 5, "math-a1"),
  grade(math2AStudents[1].id, "assessment-math-2a-2", 4.5, "math-a2"),
  grade(math2AStudents[1].id, "assessment-math-2a-3", 2.5, "math-a3"),

  grade(math2AStudents[2].id, "assessment-math-2a-1", 9, "math-a1"),
  grade(math2AStudents[2].id, "assessment-math-2a-2", 7.5, "math-a2"),

  ...math2AStudents.slice(3, 15).flatMap((student, index) => {
    const base = 5.5 + (index % 6) * 0.65;
    const items = [
      grade(
        student.id,
        "assessment-math-2a-1",
        Math.min(10, Number(base.toFixed(1))),
        "math-a1",
      ),
      grade(
        student.id,
        "assessment-math-2a-2",
        Math.min(10, Number((base + 0.4).toFixed(1))),
        "math-a2",
      ),
    ];
    if (index % 4 !== 0) {
      items.push(
        grade(
          student.id,
          "assessment-math-2a-3",
          Math.min(5, Number(((base + 0.3) / 2).toFixed(1))),
          "math-a3",
        ),
      );
    }
    return items;
  }),

  grade(math2AStudents[0].id, "assessment-portuguese-2a-1", 8.7, "port-a1"),
  grade(math2AStudents[1].id, "assessment-portuguese-2a-1", 6.2, "port-a1"),
  grade(math2AStudents[2].id, "assessment-portuguese-2a-1", 9.1, "port-a1"),
  grade(math2AStudents[0].id, "assessment-physics-2a-1", 7.5, "phys-a1"),

  ...demoStudents
    .filter((student) => student.classId === "class-2b")
    .slice(0, 12)
    .flatMap((student, index) => [
      grade(
        student.id,
        "assessment-math-2b-1",
        5.2 + (index % 6) * 0.7,
        "math-b1",
      ),
      ...(index % 3 === 0
        ? []
        : [
            grade(
              student.id,
              "assessment-math-2b-2",
              5.8 + (index % 5) * 0.75,
              "math-b2",
            ),
          ]),
    ]),
];

export const demoAuditEntries: AuditEntry[] = [
  {
    id: "audit-seed-p1",
    actorId: "system-demo",
    action: "seed.created",
    entityType: "database",
    entityId: "ordem-platform",
    previousValue: null,
    newValue: { version: "p2-academic-core" },
    source: "local-seed",
    timestamp: seedTimestamp,
  },
];

export const demoDataset: AcademicDataset = {
  students: demoStudents,
  teachers: demoTeachers,
  classes: demoClasses,
  subjects: demoSubjects,
  assessments: demoAssessments,
  grades: demoGrades,
  auditEntries: demoAuditEntries,
  teachingAssignments: demoTeachingAssignments,
};
