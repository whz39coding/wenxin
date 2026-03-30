import { type ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, LucideArrowRight } from 'lucide-react';
import axios from 'axios';
import { AUTH_REQUIRED_EVENT, AUTH_STATE_CHANGE_EVENT, clearAuth, consumePendingAuthRequiredMessage, getStoredToken, getStoredUser, me, updateStoredUser, type AuthUser } from '../api';
import MusicDock from './MusicDock';
import AssistantPanel from './AssistantPanel';
import { brand, footerLinks, navItems, quickLinks } from '../site';
import { cn } from '../lib/utils';

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [nearRightEdge, setNearRightEdge] = useState(false);
  const [hoveringQuickNav, setHoveringQuickNav] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{
    open: boolean;
    message: string;
  }>({
    open: false,
    message: '当前操作需要先登录，请先登录后再试。',
  });

  useEffect(() => {
    const syncAuthState = () => setCurrentUser(getStoredUser());

    syncAuthState();
    window.addEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
    window.addEventListener('storage', syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, syncAuthState);
      window.removeEventListener('storage', syncAuthState);
    };
  }, []);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, [location.pathname]);

  useEffect(() => {
    const pendingMessage = consumePendingAuthRequiredMessage();
    if (pendingMessage) {
      setAuthPrompt({ open: true, message: pendingMessage });
    }

    const onAuthRequired = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const message = customEvent.detail?.message || '当前操作需要先登录，请先登录后再试。';
      setAuthPrompt({
        open: true,
        message,
      });
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired as EventListener);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired as EventListener);
    };
  }, []);

  useEffect(() => {
    const pendingMessage = consumePendingAuthRequiredMessage();
    if (pendingMessage) {
      setAuthPrompt({ open: true, message: pendingMessage });
    }
  }, [location.pathname]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      return;
    }

    let isMounted = true;
    me()
      .then((response) => {
        if (isMounted) {
          updateStoredUser(response.data);
          setCurrentUser(response.data);
        }
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          console.warn('[Layout] Auth token invalid (401), clearing auth');
          clearAuth();
          setCurrentUser(null);
        } else if (axios.isAxiosError(error)) {
          console.warn('[Layout] Failed to sync user from /auth/me:', error.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const syncPointerType = () => setFinePointer(media.matches);
    syncPointerType();

    const onPointerTypeChange = () => syncPointerType();
    media.addEventListener('change', onPointerTypeChange);

    return () => {
      media.removeEventListener('change', onPointerTypeChange);
    };
  }, []);

  useEffect(() => {
    if (!finePointer) {
      setNearRightEdge(true);
      return;
    }

    const REVEAL_EDGE_PX = 160;
    const onMouseMove = (event: MouseEvent) => {
      setNearRightEdge(event.clientX >= window.innerWidth - REVEAL_EDGE_PX);
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [finePointer]);

  function handleLogout() {
    clearAuth();
    navigate('/');
  }

  function closeAuthPrompt() {
    setAuthPrompt((prev) => ({ ...prev, open: false }));
  }

  function goToLoginFromPrompt() {
    closeAuthPrompt();
    navigate('/auth');
  }

  const disableQuickNav = location.pathname === '/exhibition';
  const showQuickNav = !disableQuickNav && (nearRightEdge || hoveringQuickNav);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10%] top-[-8%] h-[340px] w-[340px] rounded-full bg-[rgba(184,153,101,0.10)] blur-3xl" />
        <div className="absolute bottom-[10%] right-[-6%] h-[320px] w-[320px] rounded-full bg-[rgba(154,76,57,0.08)] blur-3xl" />
      </div>


      <header className="sticky top-0 z-50 border-b border-[color:var(--line-soft)] bg-[rgba(250,245,237,0.82)] backdrop-blur-xl">
        <div className="page-shell flex min-h-24 items-center justify-between gap-6 py-5">
          <Link to="/" className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--accent-soft)] bg-[rgba(154,76,57,0.10)] font-display text-xl text-[color:var(--accent)] shadow-[0_10px_24px_rgba(141,74,58,0.08)]">
              文
            </div>
            <div>
              <p className="font-display text-2xl tracking-[0.24em] text-[color:var(--ink-strong)]">{brand.name}</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 xl:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'group relative flex flex-col items-center rounded-full px-3 py-2 text-[13px] transition-colors',
                    isActive ? 'text-[color:var(--ink-strong)]' : 'text-[color:var(--ink-muted)] hover:text-[color:var(--ink-strong)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="font-medium tracking-[0.18em]">{item.name}</span>
                    <span
                      className={cn(
                        'absolute bottom-0 h-[2px] w-0 rounded-full bg-[color:var(--accent)] transition-all duration-300',
                        isActive && 'w-8',
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {currentUser ? (
            <div className="hidden items-center gap-3 lg:flex">
              <Link
                to="/profile"
                className="inline-flex rounded-full border border-[color:var(--line-strong)] px-5 py-3 text-sm tracking-[0.14em] text-[color:var(--ink-strong)] transition hover:bg-[rgba(95,70,44,0.06)]"
              >
                {currentUser.username} 的书斋
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex rounded-full border border-[color:var(--line-soft)] px-5 py-3 text-sm tracking-[0.14em] text-[color:var(--ink-muted)] transition hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink-strong)]"
              >
                退出登录
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="hidden rounded-full border border-[color:var(--line-strong)] px-5 py-3 text-sm tracking-[0.16em] text-[color:var(--ink-strong)] transition hover:bg-[rgba(95,70,44,0.06)] lg:inline-flex"
            >
              登录 / 注册
            </Link>
          )}
        </div>

        <div className="page-shell pb-4 xl:hidden">
          <div className="soft-scrollbar flex gap-2 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-full border px-4 py-2 text-sm transition',
                    isActive
                      ? 'border-[color:var(--accent)] bg-[rgba(154,76,57,0.08)] text-[color:var(--accent)]'
                      : 'border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.42)] text-[color:var(--ink-muted)]',
                  )
                }
              >
                {item.name}
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      <aside
        className={cn(
          'fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 transition-all duration-250 xl:block',
          showQuickNav ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-4 opacity-0 pointer-events-none',
        )}
        onMouseEnter={() => setHoveringQuickNav(true)}
        onMouseLeave={() => setHoveringQuickNav(false)}
      >
        <div className="paper-panel paper-texture w-[96px] px-3 py-4 shadow-soft">
          <div className="mb-4 flex items-center justify-center text-[color:var(--accent)]">
            <Compass className="h-4 w-4" />
          </div>
          <div className="space-y-2">
            {quickLinks.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'group flex flex-col items-center rounded-2xl px-2 py-3 text-center transition duration-300',
                    isActive
                      ? 'bg-[rgba(154,76,57,0.10)] text-[color:var(--accent)]'
                      : 'text-[color:var(--ink-muted)] hover:bg-[rgba(95,70,44,0.05)] hover:text-[color:var(--ink-strong)]',
                  )}
                >
                  <item.icon className="mb-2 h-4 w-4" />
                  <span className="text-[12px] tracking-[0.2em]">{item.name}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="relative z-10 py-8 pb-16 sm:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="relative z-10 border-t border-[color:var(--line-soft)] bg-[rgba(255,250,243,0.72)]">
        <div className="page-shell grid gap-8 py-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-4">
            <div>
              <p className="font-display text-3xl text-[color:var(--ink-strong)]">{brand.motto}</p>

              {authPrompt.open ? (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[rgba(29,23,18,0.45)] px-6">
                  <div className="w-full max-w-md rounded-3xl border border-[color:var(--line-soft)] bg-[rgba(255,251,244,0.98)] px-8 py-7 shadow-[0_24px_64px_rgba(17,12,8,0.28)]">
                    <p className="text-xs tracking-[0.24em] text-[color:var(--ink-faint)]">登录提醒</p>
                    <h3 className="mt-2 font-display text-2xl text-[color:var(--ink-strong)]">需要先登录</h3>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">{authPrompt.message}</p>

                    <div className="mt-6 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeAuthPrompt}
                        className="inline-flex items-center justify-center rounded-full border border-[color:var(--line-soft)] px-4 py-2 text-xs tracking-[0.14em] text-[color:var(--ink-muted)] transition hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink-strong)]"
                      >
                        稍后再说
                      </button>
                      <button
                        type="button"
                        onClick={goToLoginFromPrompt}
                        className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-5 py-2 text-xs tracking-[0.14em] text-white transition hover:opacity-90"
                      >
                        去登录
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--ink-muted)]">
                {brand.name} · {brand.edition} 以 OCR、RAG、残卷修复、语义检索、数字展厅与知识问答为核心，
                围绕《论语》的识、补、问、游而展开。
              </p>
            </div>
            {/* <div className="flex flex-wrap gap-3">
              {footerLinks.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className="rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.44)] px-4 py-2 text-xs tracking-[0.18em] text-[color:var(--ink-muted)] transition hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink-strong)]"
                >
                  {item.label}
                </Link>
              ))}
            </div> */}
          </div>

          <Link
            to="/search"
            className="inline-flex items-center gap-3 text-sm tracking-[0.18em] text-[color:var(--accent)] transition hover:translate-x-1"
          >
            进入寻章问义
            <LucideArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </footer>

      <MusicDock />
      {/* <AssistantPanel /> */}
    </div>
  );
}
