import { StudentProfile } from "../types";
import abdulProfileImg from "../../assets/abdul_profile.png";

// Mock Database representing student details stored in Aditya University's Campus Connect
const MOCK_COLLEGE_DB: Record<string, Omit<StudentProfile, "studentId">> = {
  "24P31A1234": {
    name: "MOHAMMAD ABDUL ALEEM ARSHAD",
    classSection: "II B.Tech IT - Section A",
    department: "Information Technology",
    profileImage: abdulProfileImg,
    isSynced: true
  },
  "22A91A0501": {
    name: "Kalyan Kumar Reddy",
    classSection: "IV B.Tech CSE - Section B",
    department: "Computer Science & Engineering",
    profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&auto=format&fit=crop",
    isSynced: true
  },
  "24P31A9999": {
    name: "Divya Sri Vasavi",
    classSection: "III B.Tech IT - Section A",
    department: "Information Technology",
    profileImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=256&auto=format&fit=crop",
    isSynced: true
  }
};

/**
 * Simulates fetching student details from Aditya University Database (Campus Connect).
 * If the student does not exist, a realistic fallback profile is dynamically generated.
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
  const branch = isCse ? "Computer Science & Engineering" : "Information Technology";
  const branchShort = isCse ? "CSE" : "IT";
  
  let yearStr = "III B.Tech";
  if (normalizedRoll.startsWith("22")) {
    yearStr = "IV B.Tech";
  } else if (normalizedRoll.startsWith("25")) {
    yearStr = "II B.Tech";
  }

  return {
    studentId: rollNumber,
    name: `Student ${normalizedRoll}`,
    classSection: `${yearStr} ${branchShort} - Section A`,
    department: branch,
    profileImage: `https://api.dicebear.com/7.x/initials/svg?seed=${normalizedRoll}`,
    isSynced: true
  };
}
