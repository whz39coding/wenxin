// 这个是点击登录/注册的界面
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionButton, PaperPanel } from '../components/ui';
import { login, register, saveAuth } from '../api';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function resolveErrorMessage(error: any) {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : '字段';
          return `${field}：${item?.msg || '输入不符合要求'}`;
        })
        .join('；');
    }
    return '请求失败，请稍后再试。';
  }

  async function handleSubmit() {
    if (mode === 'register' && password !== confirmPassword) {
      setMessage('两次输入的密码并不一致。');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const response =
        mode === 'login'
          ? await login({ identifier, password })
          : await register({ username, email, password });

      saveAuth(response.data.access_token, response.data.user);
      setMessage(mode === 'login' ? '已进入书馆，正返回首页。' : '已创建书斋，正返回首页。');
      navigate('/', { replace: true });
    } catch (error: any) {
      setMessage(resolveErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-shell flex min-h-[calc(100vh-120px)] items-center justify-center py-8">
      <PaperPanel className="paper-texture w-full max-w-[460px] px-6 py-7 sm:px-8 sm:py-8">
        <p className="text-center text-xs tracking-[0.3em] text-[color:var(--ink-faint)]">ACCOUNT</p>
        <h1 className="mt-3 text-center font-display text-3xl text-[color:var(--ink-strong)]">登录 / 注册</h1>

        <div className="mt-6 flex gap-2 rounded-full border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.46)] p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-full px-4 py-3 text-sm transition ${mode === 'login' ? 'bg-[color:var(--ink-strong)] text-white' : 'text-[color:var(--ink-muted)]'}`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-full px-4 py-3 text-sm transition ${mode === 'register' ? 'bg-[color:var(--ink-strong)] text-white' : 'text-[color:var(--ink-muted)]'}`}
          >
            注册
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {mode === 'register' ? (
            <input
              className="w-full rounded-[18px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-sm"
              placeholder="请输入昵称"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          ) : null}
          {mode === 'register' ? (
            <input
              className="w-full rounded-[18px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-sm"
              placeholder="请输入邮箱"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          ) : (
            <input
              className="w-full rounded-[18px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-sm"
              placeholder="请输入邮箱或账号"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          )}
          <input
            className="w-full rounded-[18px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-sm"
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'register' ? (
            <input
              className="w-full rounded-[18px] border border-[color:var(--line-soft)] bg-[rgba(255,255,255,0.56)] px-4 py-3 text-sm"
              placeholder="请再次确认密码"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          ) : null}
        </div>

        {message ? <p className="mt-4 text-sm leading-7 text-[color:var(--accent)]">{message}</p> : null}

        <div className="mt-6">
          <ActionButton variant="secondary" className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '提交中' : mode === 'login' ? '登录' : '注册'}
          </ActionButton>
        </div>
      </PaperPanel>
    </div>
  );
}
