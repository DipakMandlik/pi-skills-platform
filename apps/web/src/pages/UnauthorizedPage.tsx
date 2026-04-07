import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldX, ArrowLeft } from 'lucide-react';
import { Button } from '../components/common';
import { ROUTES } from '../constants/routes';

export function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[var(--color-bg-base)]">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
          <ShieldX className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-text-main)] mb-2">Access Denied</h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">
          You don't have permission to access this page. Contact your administrator if you believe this is an error.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate(-1)}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Go Back
          </Button>
          <Button onClick={() => navigate(ROUTES.DASHBOARD)}>
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
