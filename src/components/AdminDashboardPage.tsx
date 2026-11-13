import React from 'react';
import type { AdminProfile } from '../types';
import CampusDashboard from './CampusDashboard';
export default function AdminDashboardPage({ adminProfile, onNavigate }: { adminProfile: AdminProfile; onNavigate: (view: string) => void }) {
  return <CampusDashboard admin name={adminProfile.name} onNavigate={onNavigate} />;
}
