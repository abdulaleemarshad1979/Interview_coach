import React from 'react';
import type { FacultyProfile } from '../types';
import CampusDashboard from './CampusDashboard';
export default function FacultyDashboardPage({ facultyProfile, onNavigate }: { facultyProfile: FacultyProfile; onNavigate: (view: string) => void }) {
  return <CampusDashboard admin={false} name={facultyProfile.name} onNavigate={onNavigate} />;
}
