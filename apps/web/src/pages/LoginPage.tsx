import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Lock, Eye, EyeOff, ArrowRight, AlertCircle, Shield,
  User, ChevronDown, Settings, Zap, BarChart2,
} from 'lucide-react';
import { useAuth } from '../auth';
import { ROUTES } from '../constants/routes';

const SNOWFLAKE_ROLES = [
  'ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN',
  'DATA_ENGINEER', 'ANALYTICS_ENGINEER', 'DATA_SCIENTIST',
  'BUSINESS_USER', 'VIEWER',
];

const FEATURES = [
  { Icon: Settings, label: 'AI Skills Engine',    desc: 'Intelligent task automation' },
  { Icon: Zap,      label: 'Real-time Execution', desc: 'Sub-second response times' },
  { Icon: Shield,   label: 'Enterprise Security', desc: 'Role-based access control' },
  { Icon: BarChart2,label: 'Full Observability',  desc: 'Complete audit trails' },
];

/* ── Faint sparkle dots on the gradient bg ── */
const DOTS = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7) % 100,
  r: 2 + (i % 3),
  delay: (i * 0.4) % 3,
}));

export function LoginPage() {
  const { isAuthenticated, error, login, clearError } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || ROUTES.DASHBOARD;

  const [account,  setAccount]  = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState('ACCOUNTADMIN');
  const [showPwd,  setShowPwd]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [focused, setFocused] = useState<Record<string, boolean>>({});

  if (isAuthenticated) return <Navigate to={from} replace />;

  const clearErrors = () => { setLocalError(null); clearError(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    if (!username.trim()) { setLocalError('Username is required'); return; }
    if (!password)        { setLocalError('Password is required'); return; }
    setSubmitting(true);
    try {
      await login({ email: username.trim(), username: username.trim(), password, account, role });
    } catch { /* error surfaced by auth context */ }
    finally { setSubmitting(false); }
  };

  const handleDemo = () => {
    setAccount('demo-org.us-east-1');
    setUsername('admin@platform.local');
    setPassword('demo1234');
    setRole('ACCOUNTADMIN');
  };

  const displayError = localError || error;

  /* ── Field focus helpers ── */
  const focusProps = (key: string) => ({
    onFocus: () => setFocused(f => ({ ...f, [key]: true })),
    onBlur:  () => setFocused(f => ({ ...f, [key]: false })),
  });
  const ring = (key: string) =>
    focused[key]
      ? 'border-blue-400 ring-2 ring-blue-100 bg-white'
      : 'border-slate-200 bg-slate-50';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="h-screen w-screen flex overflow-hidden"
      style={{ background: 'linear-gradient(140deg, #ffffff 0%, #e8f1fc 45%, #cfe0f8 100%)' }}
    >
      {/* ═══════════════════ LEFT PANEL ═══════════════════ */}
      <div className="hidden lg:flex flex-col justify-between flex-1 px-14 py-11 relative overflow-hidden">

        {/* Faint floating dots */}
        {DOTS.map(({ id, x, y, r, delay }) => (
          <motion.div
            key={id}
            className="absolute rounded-full bg-blue-300/30 pointer-events-none"
            style={{ width: r * 2, height: r * 2, left: `${x}%`, top: `${y}%` }}
            animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.3, 1] }}
            transition={{ duration: 4 + delay, delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex items-center gap-2.5 relative z-10"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-base font-bold select-none"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)' }}
          >
            π
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 leading-tight">Skills Platform</div>
            <div className="text-[11px] text-slate-500">AI Command Center</div>
          </div>
        </motion.div>

        {/* Headline + features */}
        <div className="relative z-10 max-w-[500px]">
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="text-[38px] font-extrabold text-slate-800 leading-tight mb-4"
          >
            Your AI workspace,{' '}
            <span className="text-blue-500">reimagined</span>{' '}
            for scale.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28 }}
            className="text-sm text-slate-500 leading-relaxed mb-8"
          >
            Manage skills, execute AI tasks, and monitor your platform&nbsp;—&nbsp;all from
            one powerful command center.
          </motion.p>

          <div className="space-y-2.5">
            {FEATURES.map(({ Icon, label, desc }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.07, duration: 0.4 }}
                className="flex items-center gap-3.5 bg-white/65 backdrop-blur-sm border border-white/80
                           rounded-xl px-4 py-3 shadow-sm"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100
                                flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700 leading-tight">{label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          className="flex items-center gap-4 text-[11px] text-slate-400 relative z-10"
        >
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            <span>Role-based access</span>
          </div>
          <span>·</span>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            <span>Secure authentication</span>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════ RIGHT — LOGIN CARD ═══════════════════ */}
      <div className="flex items-center justify-center w-full lg:w-[480px] px-6 py-8 shrink-0">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px] bg-white rounded-2xl
                     border border-slate-100 shadow-2xl shadow-slate-200/70 p-8"
        >
          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">Welcome back</h2>
            <p className="text-sm text-slate-400 mt-1">Sign in to your account to continue</p>
          </div>

          {/* Error */}
          {displayError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 px-3 py-2.5 bg-red-50
                         border border-red-200 rounded-xl mb-4 overflow-hidden"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700">{displayError}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Snowflake Account */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Snowflake Account
              </label>
              <div className={`relative rounded-xl border transition-all duration-150 ${ring('account')}`}>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm leading-none select-none">
                  ❄
                </span>
                <input
                  type="text"
                  value={account}
                  onChange={e => setAccount(e.target.value)}
                  {...focusProps('account')}
                  placeholder="myorg-myaccount.us-east-1"
                  className="w-full pl-8 pr-3 py-2.5 bg-transparent rounded-xl text-sm
                             text-slate-700 placeholder:text-slate-300 focus:outline-none"
                />
              </div>
            </div>

            {/* Username */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Username
              </label>
              <div className={`relative rounded-xl border transition-all duration-150 ${ring('username')}`}>
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); clearErrors(); }}
                  {...focusProps('username')}
                  placeholder="_your_snowflake_user"
                  className="w-full pl-9 pr-3 py-2.5 bg-transparent rounded-xl text-sm
                             text-slate-700 placeholder:text-slate-300 focus:outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Password
              </label>
              <div className={`relative rounded-xl border transition-all duration-150 ${ring('password')}`}>
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearErrors(); }}
                  {...focusProps('password')}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-9 py-2.5 bg-transparent rounded-xl text-sm
                             text-slate-700 placeholder:text-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400
                             hover:text-slate-600 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Snowflake Role */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Snowflake Role
              </label>
              <div className="relative">
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl
                             px-3 py-2.5 text-sm text-slate-700 cursor-pointer
                             focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                             transition-all duration-150"
                >
                  {SNOWFLAKE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Sign In */}
            <motion.button
              type="submit"
              whileHover={{ y: -1, boxShadow: '0 8px 28px rgba(59,130,246,0.35)' }}
              whileTap={{ y: 0, boxShadow: '0 2px 8px rgba(59,130,246,0.2)' }}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                         text-white font-semibold text-sm transition-all duration-150
                         disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400 select-none">or</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Launch Demo */}
          <button
            type="button"
            onClick={handleDemo}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                       border border-slate-200 bg-white text-sm font-medium text-slate-600
                       hover:bg-slate-50 transition-colors duration-150"
          >
            <span className="text-slate-400 text-base leading-none select-none">✳</span>
            Launch Demo
          </button>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Powered by{' '}
              <span className="font-semibold text-slate-600">PibyThree</span>
            </span>
            <div className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Secure authentication</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
