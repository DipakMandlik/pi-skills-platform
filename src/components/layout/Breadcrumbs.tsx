import { useLocation, Link } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';
import { ROUTES } from '../../constants/routes';

const routeLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/workspace': 'Workspace',
  '/skills': 'Skill Library',
  '/models': 'Models',
  '/monitoring': 'Monitoring',
  '/governance': 'Governance',
  '/users': 'Users',
  '/teams': 'Teams',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
};

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const breadcrumbs = segments.map((segment, index) => {
    const path = `/${segments.slice(0, index + 1).join('/')}`;
    const label = routeLabels[path] || segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const isLast = index === segments.length - 1;

    return { path, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      <Link to={ROUTES.DASHBOARD} className="flex items-center gap-1 text-muted hover:text-foreground transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {breadcrumbs.map((crumb) => (
        <div key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-muted" />
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="text-muted hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
