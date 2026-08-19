import {
  LocalAssessmentRepository,
  LocalAuditRepository,
  LocalClassRepository,
  LocalGradeRepository,
  LocalStudentRepository,
  LocalSubjectRepository,
  LocalTeacherRepository,
  LocalTeachingAssignmentRepository,
} from "@/src/repositories/local/academic-repositories";
import {
  AssessmentService,
  AuditService,
  ClassService,
  GradeService,
  StudentService,
  SubjectService,
  TeacherService,
  TeachingAssignmentService,
  type AcademicServices,
} from "@/src/services/academic-services";

let services: AcademicServices | null = null;

export function getAcademicServices(): AcademicServices {
  if (services) {
    return services;
  }

  const students = new LocalStudentRepository();
  const teachers = new LocalTeacherRepository();
  const classes = new LocalClassRepository();
  const subjects = new LocalSubjectRepository();
  const assessments = new LocalAssessmentRepository();
  const teachingAssignments = new LocalTeachingAssignmentRepository();
  const grades = new LocalGradeRepository();
  const audit = new LocalAuditRepository();

  services = {
    students: new StudentService(students),
    teachers: new TeacherService(teachers),
    classes: new ClassService(classes),
    subjects: new SubjectService(subjects),
    assessments: new AssessmentService(
      assessments,
      teachingAssignments,
      classes,
      subjects,
    ),
    teachingAssignments: new TeachingAssignmentService(teachingAssignments),
    grades: new GradeService(
      grades,
      assessments,
      students,
      teachingAssignments,
    ),
    audit: new AuditService(audit),
  };

  return services;
}
