import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/sidebar/Sidebar';
import { Navbar } from '../components/navbar/Navbar';

export function AppLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-base)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
