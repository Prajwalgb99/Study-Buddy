// src/pages/RegisterPage.jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, User, Mail, Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../utils/api.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form,    setForm]    = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const passwordStrength = (() => {
    const p = form.password;
    if (!p) return null;
    if (p.length < 6)  return { label: 'Too short',  color: 'text-red-400',    bar: 'bg-red-500',    w: 'w-1/4' };
    if (p.length < 8)  return { label: 'Weak',       color: 'text-orange-400', bar: 'bg-orange-500', w: 'w-2/4' };
    if (p.length < 12) return { label: 'Good',       color: 'text-yellow-400', bar: 'bg-yellow-500', w: 'w-3/4' };
    return               { label: 'Strong',      color: 'text-green-400',  bar: 'bg-green-500',  w: 'w-full' };
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      await register(form.name, form.email, form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/30 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-xl shadow-blue-600/30">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-slate-400 text-sm mt-1">Start studying smarter with AI</p>
        </div>

        <div className="card p-6 shadow-2xl border-slate-700/50">
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 mb-5 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" className="input-field pl-10" placeholder="Prajwal" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">College Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="email" className="input-field pl-10" placeholder="you@vce.ac.in" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="password" className="input-field pl-10" placeholder="Min. 8 characters" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              {passwordStrength && (
                <div className="mt-2">
                  <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${passwordStrength.bar} ${passwordStrength.w}`} />
                  </div>
                  <p className={`text-xs mt-1 ${passwordStrength.color}`}>{passwordStrength.label}</p>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-5">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
