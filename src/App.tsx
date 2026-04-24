/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { LandingPage } from './components/LandingPage';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { BirthSetup, BirthData } from './components/BirthSetup';
import { CelestialBackdrop } from './components/CelestialBackdrop';
import { GuaciFlow } from './components/guaci/GuaciFlow';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'motion/react';
import { getProfile } from './services/api';

type Page = 'landing' | 'auth' | 'birth-setup' | 'dashboard' | 'guaci';
const PROFILE_CHECK_TIMEOUT_MS = Number(import.meta.env.VITE_PROFILE_TIMEOUT_MS || 10000);
const PROFILE_CHECK_RETRIES = Number(import.meta.env.VITE_PROFILE_CHECK_RETRIES || 3);
const PROFILE_RETRY_DELAY_MS = Number(import.meta.env.VITE_PROFILE_RETRY_DELAY_MS || 350);

export default function App() {
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [isVisitor, setIsVisitor] = useState(false);
  const [visitorProfile, setVisitorProfile] = useState<BirthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const isVisitorRef = useRef(false);

  useEffect(() => {
    isVisitorRef.current = isVisitor;
  }, [isVisitor]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void checkUserProfile(session.user);
      } else {
        setCheckingProfile(false);
        if (!isVisitorRef.current) {
          setCurrentPage('landing');
        }
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        setCheckingProfile(true);
        try {
          await checkUserProfile(currentUser);
        } finally {
          setCheckingProfile(false);
        }
      } else {
        setCheckingProfile(false);
        // 未登录时，游客会话不应被强制打回首页
        setCurrentPage((prev) => {
          if (isVisitorRef.current) {
            return prev;
          }
          if (prev === 'dashboard' || prev === 'guaci' || prev === 'birth-setup') {
            return 'landing';
          }
          return prev;
        });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkUserProfile(currentUser: User) {
    setCheckingProfile(true);
    try {
      let profile: Awaited<ReturnType<typeof getProfile>> = null;

      // 登录刚完成时，token/会话偶发短暂不同步；做短重试避免误判到 birth-setup
      for (let i = 0; i < PROFILE_CHECK_RETRIES; i += 1) {
        profile = await Promise.race([
          getProfile(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), PROFILE_CHECK_TIMEOUT_MS);
          }),
        ]);
        if (profile) break;
        if (i < PROFILE_CHECK_RETRIES - 1) {
          await sleep(PROFILE_RETRY_DELAY_MS);
        }
      }

      if (profile?.birth_date) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('birth-setup');
      }
    } catch (err) {
      console.error('Profile check failed:', err);
      setCurrentPage('birth-setup');
    } finally {
      setCheckingProfile(false);
      setLoading(false);
    }
  }

  const handleVisitor = () => {
    setIsVisitor(true);
    setCheckingProfile(false);
    setLoading(false);
    setCurrentPage('birth-setup');
  };

  const handleVisitorComplete = (data: BirthData) => {
    setVisitorProfile(data);
    setCurrentPage('dashboard');
  };

  const handleAuthSuccess = () => {
    // onAuthStateChange will handle the transition
  };

  const handleLogout = async () => {
    if (isVisitor) {
      setIsVisitor(false);
      setVisitorProfile(null);
      setCurrentPage('landing');
    } else {
      await supabase.auth.signOut();
      setCurrentPage('landing');
    }
  };

  // 仅在已识别到登录用户且需要校验资料时显示加载态；
  // 未登录用户从首页进入登录页时不应被“校准命盘频率”覆盖。
  const shouldShowBlockingLoader = !!user && (loading || checkingProfile) && currentPage !== 'landing';
  if (shouldShowBlockingLoader) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-zinc-950 font-sans">
        <CelestialBackdrop />
        <div className="relative z-10 flex min-h-[100dvh] items-center justify-center">
          <motion.div
            animate={{ opacity: [0.35, 0.9, 0.35] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="font-sans text-[10px] font-light uppercase tracking-[0.45em] text-white/35"
          >
            {checkingProfile ? '校准命盘频率' : '连接灵音终端'}
          </motion.div>
        </div>
      </div>
    );
  }

  const protectedPage = currentPage === 'dashboard' || currentPage === 'guaci';
  const canRenderProtected = !!user || isVisitor;
  const effectivePage: Page = protectedPage && !canRenderProtected ? 'landing' : currentPage;
  const showCelestial = effectivePage !== 'landing';

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-zinc-950 font-sans select-none">
      {showCelestial && (
        <CelestialBackdrop hideMeteors />
      )}
      <div className="relative z-10 min-h-[100dvh]">
      <AnimatePresence mode="wait">
        {effectivePage === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <LandingPage onEnter={() => setCurrentPage('auth')} />
          </motion.div>
        )}

        {effectivePage === 'auth' && (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <Auth 
              onBack={() => setCurrentPage('landing')} 
              onSuccess={handleAuthSuccess}
              onVisitor={handleVisitor}
            />
          </motion.div>
        )}

        {effectivePage === 'birth-setup' && (
          <motion.div
            key="birth-setup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <BirthSetup 
              userId={user?.id || null} 
              onComplete={isVisitor ? handleVisitorComplete : () => setCurrentPage('dashboard')} 
            />
          </motion.div>
        )}

        {effectivePage === 'dashboard' && canRenderProtected && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <Dashboard
              onLogout={handleLogout}
              visitorProfile={visitorProfile}
              onOpenGuaci={() => setCurrentPage('guaci')}
            />
          </motion.div>
        )}

        {effectivePage === 'guaci' && canRenderProtected && (
          <motion.div
            key="guaci"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <GuaciFlow onBack={() => setCurrentPage('dashboard')} />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
