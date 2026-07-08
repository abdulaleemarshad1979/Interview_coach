import { StudentProfile } from "../types";
import abdulProfileImg from "../../assets/abdul_profile.png";

// Mock Database representing student details stored in Aditya University's Campus Connect
const MOCK_COLLEGE_DB: Record<string, Omit<StudentProfile, "studentId">> = {
  "24P31A1234": {
    name: "MOHAMMAD ABDUL ALEEM ARSHAD",
    classSection: "II B.Tech IT - Section A",
    department: "Information Technology",
    academicYear: "Regular(3/4 Semester-I- 2024)",
    attendance: 88.5,
    profileImage: abdulProfileImg,
    admissionNo: "90360050219",
    course: "B.Tech",
    gender: "Male",
    dob: "31/10/2006",
    nationality: "Indian",
    religion: "Hindu",
    sscMarks: "421.00, 70.17",
    interMarks: "711.00, 71.10",
    entranceType: "EAMCET",
    entranceRank: "93077",
    seatType: "CONVENOR",
    caste: "BC-E",
    lastStudied: "NARAYANA JR. COLLEGE",
    joiningDate: "20/07/2024",
    mobileNo: "7013297559",
    email: "abdulaleemarshadm@gmail.com",
    adharNo: "428068976468",
    transportHalt: "R C PURAM (Route: )",
    collegeAssessments: [
      { examName: "Mid-Term 1 (Theory)", percentage: 84, marks: "33.6 / 40" },
      { examName: "Mid-Term 2 (Theory)", percentage: 90, marks: "36.0 / 40" },
      { examName: "Previous Semester GPA", percentage: 85, marks: "8.50 / 10.0 SGPA" },
      { examName: "Design & Analysis of Algorithms Lab", percentage: 92, marks: "46.0 / 50" },
      { examName: "Data Structures & Java Assessment", percentage: 88, marks: "44.0 / 50" },
      { examName: "Soft Skills & Aptitude Assessment", percentage: 81, marks: "81 / 100" }
    ],
    isSynced: true
  },
  "22A91A0501": {
    name: "Kalyan Kumar Reddy",
    classSection: "IV B.Tech CSE - Section B",
    department: "Computer Science & Engineering",
    academicYear: "4th Year (VII Semester)",
    attendance: 92.3,
    profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&auto=format&fit=crop",
    collegeAssessments: [
      { examName: "Mid-Term 1 (Theory)", percentage: 78, marks: "31.2 / 40" },
      { examName: "Mid-Term 2 (Theory)", percentage: 85, marks: "34.0 / 40" },
      { examName: "Previous Semester GPA", percentage: 81, marks: "8.10 / 10.0 SGPA" },
      { examName: "Advanced DBMS Lab", percentage: 88, marks: "44.0 / 50" },
      { examName: "Cloud Computing Elective", percentage: 90, marks: "90 / 100" }
    ],
    isSynced: true
  },
  "24P31A9999": {
    name: "Divya Sri Vasavi",
    classSection: "III B.Tech IT - Section A",
    department: "Information Technology",
    academicYear: "3rd Year (V Semester)",
    attendance: 94.1,
    profileImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=256&auto=format&fit=crop",
    collegeAssessments: [
      { examName: "Mid-Term 1 (Theory)", percentage: 89, marks: "35.6 / 40" },
      { examName: "Mid-Term 2 (Theory)", percentage: 92, marks: "36.8 / 40" },
      { examName: "Previous Semester GPA", percentage: 91, marks: "9.10 / 10.0 SGPA" },
      { examName: "Web Technologies Practical", percentage: 96, marks: "48.0 / 50" },
      { examName: "Artificial Intelligence Lab", percentage: 87, marks: "43.5 / 50" }
    ],
    isSynced: true
  }
};

/**
 * Simulates fetching student details from Aditya University Database (Campus Connect).
 * If the student does not exist, a realistic fallback profile is dynamically generated
 * based on their Roll Number prefix.
 */
export function fetchStudentFromAdityaDb(rollNumber: string): StudentProfile {
  const normalizedRoll = rollNumber.trim().toUpperCase();
  const existing = MOCK_COLLEGE_DB[normalizedRoll];

  if (existing) {
    return {
      studentId: rollNumber,
      ...existing
    };
  }

  // Generate dynamic realistic details for unknown students to prevent crashes
  const isCse = normalizedRoll.includes("05") || normalizedRoll.includes("A") || normalizedRoll.startsWith("24P");
  const branch = isCse ? "Computer Science & Engineering" : "Electronics & Communication Engineering";
  const branchShort = isCse ? "CSE" : "ECE";
  
  // Estimate year from starting digits (e.g. 24P -> 3rd year relative to current date 2026/2027)
  let yearStr = "III B.Tech";
  let semStr = "3rd Year (V Semester)";
  if (normalizedRoll.startsWith("22")) {
    yearStr = "IV B.Tech";
    semStr = "4th Year (VII Semester)";
  } else if (normalizedRoll.startsWith("25")) {
    yearStr = "II B.Tech";
    semStr = "2nd Year (III Semester)";
  }

  return {
    studentId: rollNumber,
    name: `Student ${normalizedRoll}`,
    classSection: `${yearStr} ${branchShort} - Section A`,
    department: branch,
    academicYear: semStr,
    attendance: 82.5,
    profileImage: `https://api.dicebear.com/7.x/initials/svg?seed=${normalizedRoll}`, // clean dynamic SVG avatar
    collegeAssessments: [
      { examName: "Mid-Term 1 (Theory)", percentage: 75, marks: "30.0 / 40" },
      { examName: "Mid-Term 2 (Theory)", percentage: 78, marks: "31.2 / 40" },
      { examName: "Previous Semester GPA", percentage: 77, marks: "7.70 / 10.0 SGPA" },
      { examName: "Lab Practical Assessment", percentage: 84, marks: "42.0 / 50" }
    ],
    isSynced: true
  };
}
