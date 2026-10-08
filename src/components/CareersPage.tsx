import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  GraduationCap,
  MapPin,
  MessageCircle,
  Send,
  Sparkles,
  Trophy,
  Wallet,
  Clock3,
} from 'lucide-react';
import { StallwaleLogo } from './StallwaleLogo';

const gold = '#f0b429';

export function CareersPage() {
  const [showApply, setShowApply] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    mobile: '',
    email: '',
    city: '',
    currentStatus: 'College Student',
    college: '',
    experience: 'No',
    whyJoin: '',
  });

  const setField = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'careerApplications'), {
        ...form,
        role: 'Sales Advisor / Business Development Intern',
        status: 'new',
        source: 'careers-page',
        submittedAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (error) {
      console.error('Career application submission failed', error);
      alert('We could not submit your application right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const openApply = () => {
    setShowApply(true);
    setSubmitted(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#061a38] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#061a38]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <StallwaleLogo size="md" showTagline />
          <button
            onClick={openApply}
            className="rounded-xl px-4 py-2.5 text-sm font-extrabold text-[#061a38] shadow-lg transition hover:-translate-y-0.5"
            style={{ background: gold }}
          >
            Apply Now
          </button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-[#f0b429]/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 top-24 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#f0b429]/50 bg-[#f0b429]/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#f8cf6b]">
              <Sparkles className="h-4 w-4" />
              We're Hiring
            </div>
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              Become a <span className="text-[#f8cf6b]">STall Sales Advisor</span>
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg font-semibold leading-8 text-slate-200 sm:text-2xl">
              Internship opportunity for college students & young professionals.
            </p>
            <p className="mt-3 text-base font-bold text-[#f8cf6b] sm:text-lg">
              Earn while you learn digital sales.
            </p>
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-[#f0b429]/50 bg-white/5 p-5">
              <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-bold text-slate-100">
                <span className="rounded-full bg-white/10 px-4 py-2">Sales Advisor / Business Development Intern</span>
                <span className="rounded-full bg-white/10 px-4 py-2">Remote · Pan-India</span>
                <span className="rounded-full bg-white/10 px-4 py-2">No experience required</span>
              </div>
            </div>
            <button
              onClick={openApply}
              className="mt-8 inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-black text-[#061a38] shadow-2xl transition hover:-translate-y-1"
              style={{ background: gold }}
            >
              Apply for the Opportunity <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </section>

        <section className="bg-white py-14 text-slate-900 sm:py-18">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88912]">About the opportunity</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">Build real sales experience with STall.</h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
                  STall is building digital tools that help local businesses automate and grow their online presence.
                  As a Sales Advisor, you will introduce STall to businesses, explain its value and help interested
                  owners get started.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {[
                  ['Learn', 'Digital sales, SaaS and business development'],
                  ['Earn', 'Commission for successful business sales'],
                  ['Grow', 'Build practical startup and customer-acquisition experience'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="text-lg font-black">{title}</div>
                    <div className="mt-1 text-sm leading-6 text-slate-600">{text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f8cf6b]">The role</p>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl">What you'll do</h2>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [BriefcaseBusiness, 'Onboard local businesses', 'Food, fashion, salons, retail and local services.'],
                [Sparkles, 'Explain STall', 'Show owners how STall can automate their digital growth.'],
                [GraduationCap, 'Learn digital sales', 'Get hands-on B2B and SaaS sales experience.'],
                [MessageCircle, 'Build relationships', 'Help interested business owners understand the platform.'],
                [Wallet, 'Earn commission', 'Earn ₹200–₹300 per successful business sale.'],
                [Trophy, 'Grow with performance', 'Top performers can progress into larger sales responsibilities.'],
              ].map(([Icon, title, text]) => {
                const IconComponent = Icon as React.ComponentType<{ className?: string }>;
                return (
                  <div key={title as string} className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#f0b429]/15 text-[#f8cf6b]">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-black">{title as string}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{text as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#f7f8fb] px-4 py-14 text-slate-900 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-3xl bg-white p-7 shadow-sm">
                <h2 className="text-2xl font-black">Perks & benefits</h2>
                <div className="mt-6 space-y-4">
                  {[
                    [Wallet, 'High commission', '₹200–₹300 per successful business sale'],
                    [MapPin, 'Work from anywhere', 'Pan-India opportunity'],
                    [Clock3, 'Flexible hours', 'Designed to fit around college and other commitments'],
                    [GraduationCap, 'Training provided', 'No previous sales experience required'],
                    [CheckCircle2, 'Certificate & recommendation', 'Recognition for successful internship completion'],
                    [Trophy, 'Performance growth', 'Top performers may move into city-level leadership opportunities'],
                  ].map(([Icon, title, text]) => {
                    const IconComponent = Icon as React.ComponentType<{ className?: string }>;
                    return (
                      <div key={title as string} className="flex gap-4">
                        <IconComponent className="mt-0.5 h-5 w-5 shrink-0 text-[#b88912]" />
                        <div>
                          <div className="font-extrabold">{title as string}</div>
                          <div className="text-sm text-slate-600">{text as string}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-3xl bg-[#061a38] p-7 text-white">
                <h2 className="text-2xl font-black">Who can apply?</h2>
                <div className="mt-6 space-y-3">
                  {[
                    'College students — any year',
                    'Freshers',
                    'Young professionals',
                    'People interested in sales and startups',
                    'Anyone willing to learn and communicate with businesses',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-200">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f8cf6b]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-7 rounded-2xl border border-[#f0b429]/30 bg-white/5 p-4 text-sm font-bold text-[#f8cf6b]">
                  Requirement: Smartphone + Internet connection
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 text-center sm:px-6 sm:py-20">
          <div className="mx-auto max-w-3xl rounded-3xl border border-[#f0b429]/30 bg-white/5 p-8 sm:p-12">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f8cf6b]">Ready to start?</p>
            <h2 className="mt-3 text-3xl font-black sm:text-4xl">Don't just look for a job. Build real sales experience.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">
              Join STall, learn digital sales, earn commission and help local businesses adopt better digital tools.
            </p>
            <button
              onClick={openApply}
              className="mt-7 inline-flex items-center gap-2 rounded-2xl px-7 py-4 font-black text-[#061a38]"
              style={{ background: gold }}
            >
              Apply Now <Send className="h-5 w-5" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center text-sm text-slate-400 sm:flex-row sm:text-left">
          <div>STall · That's All · Automate · Grow · Succeed</div>
          <div>stallwale.ai.studio</div>
        </div>
      </footer>

      {showApply && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div className="mx-auto my-6 max-w-2xl rounded-3xl bg-white p-5 text-slate-900 shadow-2xl sm:my-10 sm:p-8">
            {!submitted ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b88912]">STall Careers</p>
                    <h2 className="mt-2 text-2xl font-black">Apply as a Sales Advisor</h2>
                    <p className="mt-2 text-sm text-slate-600">Tell us a little about yourself. Our team will contact shortlisted applicants.</p>
                  </div>
                  <button onClick={() => setShowApply(false)} className="rounded-full px-3 py-2 text-slate-500 hover:bg-slate-100">✕</button>
                </div>

                <form onSubmit={submitApplication} className="mt-6 grid gap-4 sm:grid-cols-2">
                  {[
                    ['fullName', 'Full Name', 'text', true],
                    ['mobile', 'Mobile / WhatsApp Number', 'tel', true],
                    ['email', 'Email Address', 'email', true],
                    ['city', 'City', 'text', true],
                    ['college', 'College / Organisation', 'text', false],
                  ].map(([key, label, type, required]) => (
                    <label key={key as string} className="block">
                      <span className="mb-1.5 block text-xs font-extrabold text-slate-700">{label as string}{required ? ' *' : ''}</span>
                      <input
                        required={required as boolean}
                        type={type as string}
                        value={form[key as keyof typeof form]}
                        onChange={(e) => setField(key as keyof typeof form, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#b88912] focus:ring-2 focus:ring-[#f0b429]/20"
                      />
                    </label>
                  ))}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Current Status *</span>
                    <select required value={form.currentStatus} onChange={(e) => setField('currentStatus', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm">
                      <option>College Student</option>
                      <option>Fresher</option>
                      <option>Working Professional</option>
                      <option>Self-employed</option>
                      <option>Other</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Previous sales experience? *</span>
                    <select required value={form.experience} onChange={(e) => setField('experience', e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm">
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-extrabold text-slate-700">Why do you want to join STall? *</span>
                    <textarea
                      required
                      rows={4}
                      value={form.whyJoin}
                      onChange={(e) => setField('whyJoin', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#b88912] focus:ring-2 focus:ring-[#f0b429]/20"
                    />
                  </label>

                  <div className="sm:col-span-2 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-slate-500">By submitting, you agree to be contacted by STall regarding this opportunity.</p>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-black text-[#061a38] disabled:opacity-60"
                      style={{ background: gold }}
                    >
                      {submitting ? 'Submitting...' : 'Submit Application'}
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
                <h2 className="mt-5 text-3xl font-black">Application Received!</h2>
                <p className="mx-auto mt-3 max-w-md text-slate-600">
                  Thank you for your interest in joining STall. Our team will review your application and contact shortlisted applicants.
                </p>
                <button
                  onClick={() => setShowApply(false)}
                  className="mt-7 rounded-xl px-6 py-3 font-black text-[#061a38]"
                  style={{ background: gold }}
                >
                  Back to STall
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
