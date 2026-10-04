import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, signInWithStallwaleGoogle } from '../firebase';
import { ArrowRight, CheckCircle2, AlertCircle, Lock, Mail, User } from 'lucide-react';
import { StallwaleLogo } from './StallwaleLogo';

type AuthMode = 'login' | 'signup' | 'forgot';

export function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await signInWithStallwaleGoogle();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to sign in right now.';
      if (
        !msg.includes('popup-closed-by-user') &&
        !msg.includes('popup_closed') &&
        !msg.includes('cancelled')
      ) {
        setErrorMsg('Could not sign in with your Google account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email.trim());
        setSuccessMsg('Password reset instructions have been sent to your email.');
        setLoading(false);
        return;
      }

      if (!password || password.length < 6) {
        setErrorMsg('Password must be at least 6 characters.');
        setLoading(false);
        return;
      }

      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (fullName.trim()) {
          await updateProfile(cred.user, { displayName: fullName.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code.includes('auth/operation-not-allowed')) {
        setErrorMsg(
          'Email & password sign-in is not yet enabled on this project. Please use "Continue with Google" above for instant access.'
        );
      } else if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) {
        setErrorMsg('Invalid email or password. Please check your credentials.');
      } else if (code.includes('auth/email-already-in-use')) {
        setErrorMsg('An account with this email already exists. Try signing in instead.');
      } else {
        setErrorMsg('Authentication could not be completed. Please use "Continue with Google".');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col justify-between relative overflow-hidden">
      {/* Ambient Gold Glow matching .glow in upgrade.html */}
      <div className="pointer-events-none absolute -top-20 -right-40 w-[520px] h-[520px] rounded-full bg-[#f0b429]/[0.08] blur-[90px]" />

      {/* Minimal Brand Header matching upgrade.html */}
      <header className="w-full border-b border-[#2a2a2a] bg-[#0a0a0a]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 min-h-[76px] flex items-center justify-between">
          <StallwaleLogo size="md" variant="horizontal-dark" />
          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold text-[#9c9c9c] hidden sm:inline tracking-wider uppercase">
              DISCOVER <span className="text-[#f0b429] mx-1">•</span> CONNECT <span className="text-[#f0b429] mx-1">•</span> GROW
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Split */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Value Proposition */}
          <div className="lg:col-span-6 space-y-6 pr-0 lg:pr-6">
            <div className="inline-flex items-center gap-2.5 text-[#f0b429] text-xs font-extrabold tracking-[0.14em] uppercase">
              <span className="w-6 h-[2px] bg-[#f0b429]" />
              <span>STall Digital Growth & Automation</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.06]">
              Unlock More
              <br />
              <span className="text-[#f0b429]">for Your Business</span>
            </h1>

            <p className="text-base text-[#9c9c9c] leading-relaxed max-w-xl">
              Manage your Google Business presence, publish daily posts and promotional offers, reply to customer reviews, and track your Digital Score across all your stores from one unified STallwale.in workspace.
            </p>

            <div className="space-y-3.5 pt-2">
              <div className="p-4 rounded-[14px] border border-[#3b321d] bg-gradient-to-r from-[#f0b429]/[0.08] to-white/[0.02] flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl border border-[#8a6a1f] bg-[#0d0d0d] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-[#f0b429]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    Multi-Store Workspace Isolation
                  </p>
                  <p className="text-xs text-[#9c9c9c] mt-0.5">
                    Whether you run one salon, two restaurants, or a retail chain, each location gets its own dedicated workspace.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-[14px] border border-[#2a2a2a] bg-[#161616] flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl border border-[#8a6a1f] bg-[#0d0d0d] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-[#f0b429]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">
                    AI-Assisted Daily Posts, Offers & Review Replies
                  </p>
                  <p className="text-xs text-[#9c9c9c] mt-0.5">
                    Draft tailored updates and polite customer replies in seconds—you stay in full control before anything goes live.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs max-w-md mx-auto w-full">
              <div className="mb-6">
                <div className="mb-3">
                  <StallwaleLogo size="sm" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  {mode === 'login' && 'Sign in to STallwale.in'}
                  {mode === 'signup' && 'Create your STallwale.in Account'}
                  {mode === 'forgot' && 'Reset your password'}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {mode === 'login' && 'Access your STallwale.in store dashboard and automation controls.'}
                  {mode === 'signup' && 'Set up your STallwale.in store account in seconds.'}
                  {mode === 'forgot' && 'Enter your email to receive a password reset link.'}
                </p>
              </div>

              {errorMsg && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Primary CTA: Continue with Google */}
              {mode !== 'forgot' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors shadow-xs cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 bg-white rounded-full p-0.5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>

                  <div className="relative flex py-1 items-center">
                    <div className="grow border-t border-slate-200"></div>
                    <span className="shrink mx-3 text-xs text-slate-400">
                      or continue with email
                    </span>
                    <div className="grow border-t border-slate-200"></div>
                  </div>
                </div>
              )}

              {/* Email / Password Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-3.5 mt-3">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Your Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Priya Nair"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourstore.com"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                    />
                  </div>
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Password
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setErrorMsg(null);
                            setSuccessMsg(null);
                          }}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <span>
                    {mode === 'login' && 'Sign In with Email'}
                    {mode === 'signup' && 'Create Store Account'}
                    {mode === 'forgot' && 'Send Reset Link'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Mode Switchers */}
              <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                {mode === 'login' ? (
                  <p className="text-xs text-slate-600">
                    New to STallwale.in?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Create Store Account
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">
                    Already have a store account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Back to Login
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-5 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#f0b429]">Stallwale.in</span>
          <span aria-hidden="true">·</span>
          <span>Copyright © {new Date().getFullYear()} Stallwale.in. All rights reserved.</span>
        </div>
        <span>DISCOVER • CONNECT • GROW</span>
      </footer>
    </div>
  );
}
