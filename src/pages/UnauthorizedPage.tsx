import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldX, ArrowLeft, LogOut, Database, Home } from 'lucide-react';
import { Button } from '../components/ui';
import { useAuth } from '../auth';
import { ROUTES } from '../constants/routes';

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleSignOut = () => {
    logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="text-center max-w-md px-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mx-auto mb-6"
        >
          <ShieldX className="w-10 h-10 text-error" />
        </motion.div>

        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-sm text-muted mb-2 leading-relaxed">
          You don't have permission to access this page.
        </p>
        {user && (
          <div className="flex items-center justify-center gap-1.5 mb-4 text-xs text-muted/60">
            <Database className="w-3 h-3" />
            <span className="font-mono">{user.name} ({user.role})</span>
          </div>
        )}
        <p className="text-xs text-muted/60 mb-8">
          Try signing in with an account that has the required privileges.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button variant="outline" onClick={() => navigate(-1)} icon={<ArrowLeft className="w-4 h-4" />}>
            Go Back
          </Button>
          <Button onClick={() => navigate(ROUTES.DASHBOARD)} icon={<Home className="w-4 h-4" />}>
            Dashboard
          </Button>
          <Button variant="ghost" onClick={handleSignOut} icon={<LogOut className="w-4 h-4" />}>
            Sign Out
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
