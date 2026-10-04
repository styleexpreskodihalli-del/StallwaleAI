import React from 'react';
import { StoreRecord } from '../types';
import { StallwaleLogo } from './StallwaleLogo';
import {
  Plus,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  LogOut,
  Zap,
} from 'lucide-react';

interface StoreSelectorProps {
  stores: StoreRecord[];
  onSelectStore: (storeId: string) => void;
  onAddAnotherStore: () => void;
  onSignOut: () => void;
  userEmail?: string | null;
}

export function StoreSelector({
  stores,
  onSelectStore,
  onAddAnotherStore,
  onSignOut,
  userEmail,
}: StoreSelectorProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <StallwaleLogo size="md" />

          <div className="flex items-center gap-4">
            {userEmail && (
              <span className="text-xs text-slate-500 hidden sm:inline">{userEmail}</span>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-600 mb-1">
              Multi-Store Workspace
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Select your store
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Each store workspace is isolated with its own Google Business Profile, reviews, and automations.
            </p>
          </div>

          <button
            type="button"
            onClick={onAddAnotherStore}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 self-start sm:self-auto transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add another store</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {stores.map((store) => {
            const activeAutomationsCount = [
              store.autoDailyPosts,
              store.autoReviewReplies,
              store.autoOfferReminders,
              store.autoProfileMonitoring,
              store.autoScoreMonitoring,
            ].filter(Boolean).length;

            return (
              <div
                key={store.id}
                onClick={() => onSelectStore(store.id)}
                className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-600 transition-colors cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {store.name}
                      </h2>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="font-medium text-slate-700">{store.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {store.city || store.address || 'Local Store'}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5 shrink-0" />
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block mb-1">Google Connection</span>
                      {store.gbpConnected ? (
                        <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Connected
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          Not Connected
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Automation Status</span>
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5 tabular-nums">
                        <Zap className="w-3.5 h-3.5 text-blue-600" />
                        {activeAutomationsCount > 0
                          ? `Active (${activeAutomationsCount}/5 ON)`
                          : 'Paused'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Another Store Card */}
          <button
            type="button"
            onClick={onAddAnotherStore}
            className="rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-600 p-6 flex flex-col items-center justify-center text-center gap-2 text-slate-500 hover:text-blue-600 transition-colors min-h-[180px] cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold">Add another store</span>
            <span className="text-xs text-slate-400 max-w-xs">
              Set up an additional location, branch, or new business brand under your account.
            </span>
          </button>
        </div>
      </main>

      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#f0b429]">Stallwale.in</span>
          <span aria-hidden="true">·</span>
          <span>Copyright © {new Date().getFullYear()} Stallwale.in. All rights reserved.</span>
        </div>
        <span className="tracking-wider uppercase text-[11px] text-slate-400">
          DISCOVER <span className="text-[#f0b429] mx-1">•</span> CONNECT{' '}
          <span className="text-[#f0b429] mx-1">•</span> GROW
        </span>
      </footer>
    </div>
  );
}
